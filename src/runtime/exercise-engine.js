import {
  DT_TRIGGER_KEYS,
  DT_TRIGGER_DEFAULTS,
  DT_TRIGGER_SOURCES,
  DT_FEEDBACK_CHANNELS,
  DT_MUTATION_POLICIES
} from "../config.js?v=20260303-flowbatch1";
import {
  getPackDefaults,
  getStepTriggerConfig,
  listStepTransitions,
  resolveNamedTransition
} from "../exercises/registry.js?v=20260301-step11-hotfix2";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUniqueStrings(values) {
  if (!Array.isArray(values)) return [];

  const result = [];
  const seen = new Set();
  for (const value of values) {
    const text = asNonEmptyString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "ja", "1"].includes(normalized)) return true;
    if (["false", "no", "nein", "0"].includes(normalized)) return false;
  }
  return fallback;
}

export function normalizeTriggerKey(value) {
  const raw = asNonEmptyString(value);
  if (!raw) return null;

  const normalized = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
    .replace(/[\s_-]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .toLowerCase();

  if (DT_TRIGGER_KEYS.includes(normalized)) return normalized;
  return null;
}

export function parseTriggerKey(triggerKey) {
  const normalized = normalizeTriggerKey(triggerKey);
  if (!normalized) return null;

  const [scope, intent] = normalized.split(".");
  return {
    triggerKey: normalized,
    scope: scope || null,
    intent: intent || null
  };
}

export function normalizeTriggerSource(value) {
  const normalized = asNonEmptyString(value);
  return normalized && DT_TRIGGER_SOURCES.includes(normalized) ? normalized : "system";
}

function normalizeFeedbackPolicy(value, fallback = "text") {
  const normalized = asNonEmptyString(value);
  return normalized && DT_FEEDBACK_CHANNELS.includes(normalized) ? normalized : fallback;
}

function normalizeMutationPolicy(value, fallback = "none") {
  const normalized = asNonEmptyString(value);
  return normalized && DT_MUTATION_POLICIES.includes(normalized) ? normalized : fallback;
}

export function getTriggerDefault(triggerKey) {
  const normalizedTriggerKey = normalizeTriggerKey(triggerKey);
  if (!normalizedTriggerKey) return null;
  const defaults = DT_TRIGGER_DEFAULTS[normalizedTriggerKey] || null;
  return defaults ? { triggerKey: normalizedTriggerKey, ...defaults } : null;
}

export function buildTriggerRequest({ scope = null, intent = null, source = "system", triggerKey = null } = {}) {
  const normalizedSource = normalizeTriggerSource(source);
  const explicitKey = normalizeTriggerKey(triggerKey);

  if (explicitKey) {
    return {
      triggerKey: explicitKey,
      source: normalizedSource
    };
  }

  const scopeText = asNonEmptyString(scope);
  const intentText = asNonEmptyString(intent);
  const candidate = scopeText && intentText ? `${scopeText}.${intentText}` : null;
  const normalizedTriggerKey = normalizeTriggerKey(candidate);

  return {
    triggerKey: normalizedTriggerKey,
    source: normalizedSource
  };
}

export function isTriggerAllowed({
  pack = null,
  step = null,
  triggerKey = null,
  source = "system",
  hasSelection = false
} = {}) {
  const resolved = resolveTriggerContext({
    triggerKey,
    source,
    pack,
    step,
    selectionCount: hasSelection ? 1 : 0,
    targetInstanceLabels: []
  });
  return !!resolved.valid;
}

export function resolveTriggerContext({
  triggerKey,
  source = "system",
  pack = null,
  step = null,
  selectionCount = 0,
  targetInstanceLabels = [],
  boardConfig = null
} = {}) {
  const parsed = parseTriggerKey(triggerKey);
  if (!parsed) {
    return {
      valid: false,
      reason: "Ungültiger oder unbekannter Trigger-Key.",
      triggerKey: null,
      scope: null,
      intent: null,
      source: normalizeTriggerSource(source),
      targetInstanceLabels: []
    };
  }

  const defaults = getTriggerDefault(parsed.triggerKey);
  const triggerConfig = pack && step ? getStepTriggerConfig(step, parsed.triggerKey) : null;

  if (pack && step && !triggerConfig) {
    return {
      valid: false,
      reason: `Trigger ${parsed.triggerKey} ist im aktuellen Schritt nicht erlaubt.`,
      triggerKey: parsed.triggerKey,
      scope: parsed.scope,
      intent: parsed.intent,
      source: normalizeTriggerSource(source),
      targetInstanceLabels: normalizeUniqueStrings(targetInstanceLabels)
    };
  }

  const effectiveConfig = triggerConfig || defaults;
  if (!effectiveConfig) {
    return {
      valid: false,
      reason: `Für Trigger ${parsed.triggerKey} existiert keine ausführbare Konfiguration.`,
      triggerKey: parsed.triggerKey,
      scope: parsed.scope,
      intent: parsed.intent,
      source: normalizeTriggerSource(source),
      targetInstanceLabels: normalizeUniqueStrings(targetInstanceLabels)
    };
  }

  const requiresSelection = effectiveConfig.requiresSelection === true;
  const normalizedTargets = normalizeUniqueStrings(targetInstanceLabels);
  const hasSelection = Number(selectionCount) > 0 && normalizedTargets.length > 0;

  if (requiresSelection && !hasSelection) {
    return {
      valid: false,
      reason: `Trigger ${parsed.triggerKey} erwartet mindestens eine selektierte Canvas-Instanz.`,
      triggerKey: parsed.triggerKey,
      scope: parsed.scope,
      intent: parsed.intent,
      source: normalizeTriggerSource(source),
      targetInstanceLabels: normalizedTargets,
      requiresSelection,
      mutationPolicy: normalizeMutationPolicy(effectiveConfig.mutationPolicy, defaults?.mutationPolicy || "none"),
      feedbackPolicy: normalizeFeedbackPolicy(effectiveConfig.feedbackPolicy, defaults?.feedbackPolicy || "text")
    };
  }

  const packDefaults = getPackDefaults(pack);
  const allowedActions = normalizeUniqueStrings(step?.allowedActions || []);

  return {
    valid: true,
    triggerKey: parsed.triggerKey,
    scope: parsed.scope,
    intent: parsed.intent,
    source: normalizeTriggerSource(source),
    requiresSelection,
    mutationPolicy: normalizeMutationPolicy(effectiveConfig.mutationPolicy, defaults?.mutationPolicy || "none"),
    feedbackPolicy: normalizeFeedbackPolicy(effectiveConfig.feedbackPolicy, packDefaults.feedbackChannel || boardConfig?.feedbackChannelDefault || defaults?.feedbackPolicy || "text"),
    allowedActions,
    prompt: asNonEmptyString(effectiveConfig.prompt),
    targetInstanceLabels: normalizedTargets
  };
}

export function buildTriggerConfigFromRunProfile(runProfile) {
  const triggerKey = normalizeTriggerKey(runProfile?.triggerKey);
  if (!triggerKey) return null;

  const defaults = getTriggerDefault(triggerKey);
  if (!defaults) return null;

  return {
    triggerKey,
    scope: defaults.scope,
    intent: defaults.intent,
    requiresSelection: defaults.requiresSelection === true,
    mutationPolicy: normalizeMutationPolicy(runProfile?.mutationPolicy, defaults.mutationPolicy || "none"),
    feedbackPolicy: normalizeFeedbackPolicy(runProfile?.feedbackPolicy, defaults.feedbackPolicy || "text"),
    allowedActions: normalizeUniqueStrings(runProfile?.allowedActions || [])
  };
}

export function resolveTriggerContextForRunProfile({
  runProfile = null,
  source = "system",
  selectionCount = 0,
  targetInstanceLabels = [],
  boardConfig = null
} = {}) {
  const triggerConfig = buildTriggerConfigFromRunProfile(runProfile);
  const normalizedSource = normalizeTriggerSource(source);
  const normalizedTargets = normalizeUniqueStrings(targetInstanceLabels);

  if (!triggerConfig) {
    return {
      valid: false,
      reason: "Run Profile enthält keinen gültigen Trigger-Key.",
      triggerKey: null,
      scope: null,
      intent: null,
      source: normalizedSource,
      targetInstanceLabels: normalizedTargets
    };
  }

  if (triggerConfig.requiresSelection && !(Number(selectionCount) > 0 && normalizedTargets.length > 0)) {
    return {
      valid: false,
      reason: `Trigger ${triggerConfig.triggerKey} erwartet mindestens eine Ziel-Instanz.`,
      triggerKey: triggerConfig.triggerKey,
      scope: triggerConfig.scope,
      intent: triggerConfig.intent,
      source: normalizedSource,
      requiresSelection: true,
      mutationPolicy: triggerConfig.mutationPolicy,
      feedbackPolicy: normalizeFeedbackPolicy(triggerConfig.feedbackPolicy, boardConfig?.feedbackChannelDefault || "text"),
      allowedActions: triggerConfig.allowedActions,
      targetInstanceLabels: normalizedTargets
    };
  }

  return {
    valid: true,
    triggerKey: triggerConfig.triggerKey,
    scope: triggerConfig.scope,
    intent: triggerConfig.intent,
    source: normalizedSource,
    requiresSelection: triggerConfig.requiresSelection,
    mutationPolicy: triggerConfig.mutationPolicy,
    feedbackPolicy: normalizeFeedbackPolicy(triggerConfig.feedbackPolicy, boardConfig?.feedbackChannelDefault || "text"),
    allowedActions: triggerConfig.allowedActions,
    prompt: null,
    targetInstanceLabels: normalizedTargets
  };
}

function normalizeSection(rawSection) {
  const src = (rawSection && typeof rawSection === "object") ? rawSection : {};
  const bullets = normalizeUniqueStrings(src.bullets || src.items || src.points || []);
  const heading = asNonEmptyString(src.heading) || asNonEmptyString(src.title);
  if (!heading && !bullets.length) return null;
  return {
    heading: heading || null,
    bullets
  };
}

export function normalizeFeedbackBlock(rawFeedback, { fallbackTitle = null, fallbackSummary = null } = {}) {
  const src = (rawFeedback && typeof rawFeedback === "object") ? rawFeedback : {};
  const sections = Array.isArray(src.sections)
    ? src.sections.map((section) => normalizeSection(section)).filter(Boolean)
    : [];

  const summary = asNonEmptyString(src.summary) || asNonEmptyString(fallbackSummary);
  const title = asNonEmptyString(src.title) || asNonEmptyString(fallbackTitle) || (summary ? "Feedback" : null);

  if (!title && !summary && !sections.length) return null;

  return {
    title,
    summary: summary || null,
    sections
  };
}

export function normalizeFlowControlDirectivesBlock(rawDirectives) {
  const src = (rawDirectives && typeof rawDirectives === "object") ? rawDirectives : {};
  const unlockRunProfileIds = normalizeUniqueStrings(src.unlockRunProfileIds || []);
  const completeRunProfileIds = normalizeUniqueStrings(src.completeRunProfileIds || []);

  if (!unlockRunProfileIds.length && !completeRunProfileIds.length) {
    return null;
  }

  return {
    unlockRunProfileIds,
    completeRunProfileIds
  };
}

function normalizeRubricEntry(rawEntry) {
  const src = (rawEntry && typeof rawEntry === "object") ? rawEntry : {};
  const criterion = asNonEmptyString(src.criterion) || asNonEmptyString(src.name);
  const status = asNonEmptyString(src.status);
  const comment = asNonEmptyString(src.comment) || asNonEmptyString(src.reason);
  if (!criterion && !status && !comment) return null;
  return {
    criterion: criterion || null,
    status: status || null,
    comment: comment || null
  };
}

export function normalizeEvaluationBlock(rawEvaluation) {
  const src = (rawEvaluation && typeof rawEvaluation === "object") ? rawEvaluation : {};
  const scoreRaw = src.score;
  const score = (typeof scoreRaw === "number" && Number.isFinite(scoreRaw))
    ? scoreRaw
    : (typeof scoreRaw === "string" && scoreRaw.trim() ? scoreRaw.trim() : null);
  const scale = asNonEmptyString(src.scale);
  const verdict = asNonEmptyString(src.verdict);
  const rubric = Array.isArray(src.rubric)
    ? src.rubric.map((entry) => normalizeRubricEntry(entry)).filter(Boolean)
    : [];

  if (score == null && !scale && !verdict && !rubric.length) {
    return null;
  }

  return {
    score,
    scale: scale || null,
    verdict: verdict || null,
    rubric
  };
}

export function isTransitionAllowed({
  transition = null,
  source = "user",
  lastTriggerKey = null,
  memoryStepStatus = null
} = {}) {
  if (!transition || typeof transition !== "object") return false;

  const normalizedSource = normalizeTriggerSource(source);
  const allowedSources = normalizeUniqueStrings(transition.allowedSources || []);
  if (allowedSources.length && !allowedSources.includes(normalizedSource)) return false;

  const allowedAfterTriggers = normalizeUniqueStrings(transition.allowedAfterTriggers || []);
  const normalizedLastTriggerKey = normalizeTriggerKey(lastTriggerKey);
  if (allowedAfterTriggers.length && (!normalizedLastTriggerKey || !allowedAfterTriggers.includes(normalizedLastTriggerKey))) {
    return false;
  }

  const requiredStatuses = normalizeUniqueStrings(transition.requiredStepStatuses || []);
  const normalizedMemoryStepStatus = asNonEmptyString(memoryStepStatus);
  if (requiredStatuses.length && (!normalizedMemoryStepStatus || !requiredStatuses.includes(normalizedMemoryStepStatus))) {
    return false;
  }

  return true;
}

export function resolveNextTransition({
  pack = null,
  step = null,
  source = "user",
  lastTriggerKey = null,
  memoryStepStatus = null
} = {}) {
  const transitions = listStepTransitions(step || pack);
  if (!transitions.length) return null;

  for (const transition of transitions) {
    if (transition.policy !== "manual") continue;
    if (isTransitionAllowed({ transition, source, lastTriggerKey, memoryStepStatus })) {
      return transition;
    }
  }

  return null;
}
