import {
  DT_TRIGGER_KEYS,
  DT_TRIGGER_DEFAULTS,
  DT_TRIGGER_SOURCES,
  DT_FEEDBACK_CHANNELS,
  DT_MUTATION_POLICIES,
  DT_EXECUTION_MODES
} from "../config.js?v=20260312-patch11";
import {
  getPackDefaults,
  listStepTransitions,
  resolveNamedTransition
} from "../exercises/registry.js?v=20260312-patch11";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const text = asNonEmptyString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function normalizeFeedbackPolicy(value, fallback = "text") {
  const normalized = asNonEmptyString(value);
  return normalized && DT_FEEDBACK_CHANNELS.includes(normalized) ? normalized : fallback;
}

function normalizeMutationPolicy(value, fallback = "none") {
  const normalized = asNonEmptyString(value);
  return normalized && DT_MUTATION_POLICIES.includes(normalized) ? normalized : fallback;
}

export function normalizeTriggerKey(value) {
  const raw = asNonEmptyString(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
    .replace(/[\s_-]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .toLowerCase();
  return DT_TRIGGER_KEYS.includes(normalized) ? normalized : null;
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

export function normalizeExecutionMode(value, fallback = "none") {
  const normalized = asNonEmptyString(value);
  return normalized && DT_EXECUTION_MODES.includes(normalized) ? normalized : fallback;
}

export function normalizeAllowedExecutionModes(values, fallback = ["none"]) {
  const normalizedValues = normalizeStringArray(values);
  const allowed = normalizedValues.filter((value) => DT_EXECUTION_MODES.includes(value));
  if (allowed.length) return allowed;
  const normalizedFallback = normalizeStringArray(fallback).filter((value) => DT_EXECUTION_MODES.includes(value));
  return normalizedFallback.length ? normalizedFallback : ["none"];
}

export function resolveEffectiveExecutionMode({
  rawExecutionMode = null,
  forcedExecutionMode = null,
  allowedExecutionModes = ["none"]
} = {}) {
  const allowed = normalizeAllowedExecutionModes(allowedExecutionModes, ["none"]);
  const forced = forcedExecutionMode ? normalizeExecutionMode(forcedExecutionMode, null) : null;
  if (forced && allowed.includes(forced)) return forced;
  const normalizedRaw = normalizeExecutionMode(rawExecutionMode, allowed[0] || "none");
  if (allowed.includes(normalizedRaw)) return normalizedRaw;
  return allowed[0] || "none";
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

export function buildRunModeFromTriggerKey(triggerKey) {
  const key = normalizeTriggerKey(triggerKey);
  if (key === "question") return "question";
  return "endpoint";
}

export function buildTriggerSourceLabel(triggerKey, { lang = "de" } = {}) {
  const key = normalizeTriggerKey(triggerKey);
  if (!key) return lang === "de" ? "Unbekannt" : "Unknown";
  const labels = {
    de: {
      "selection.hint": "Hinweis",
      "selection.check": "Check",
      "selection.propose": "Vorschlag",
      "selection.apply": "Anwenden",
      "selection.autocorrect": "Autokorrektur",
      "global.apply": "Global anwenden"
    },
    en: {
      "selection.hint": "Hint",
      "selection.check": "Check",
      "selection.propose": "Proposal",
      "selection.apply": "Apply",
      "selection.autocorrect": "Autocorrect",
      "global.apply": "Apply globally"
    }
  };
  return labels[lang]?.[key] || labels.de[key] || key;
}

function deriveTriggerIntent(triggerKey) {
  return parseTriggerKey(triggerKey)?.intent || null;
}

export function resolveEndpointContext({
  exercisePack,
  currentStep,
  endpoint,
  source = "system",
  selectionCount = 0,
  targetInstanceIds = [],
  targetInstanceLabels = [],
  boardConfig = null
} = {}) {
  if (!exercisePack) throw new Error("resolveEndpointContext: missing exercisePack");
  if (!currentStep) throw new Error("resolveEndpointContext: missing currentStep");
  if (!endpoint) throw new Error("resolveEndpointContext: missing endpoint");

  const normalizedTriggerKey = normalizeTriggerKey(endpoint.triggerKey);
  const normalizedSource = normalizeTriggerSource(source);
  const requiresSelection = endpoint.scope?.mode === "selection";
  const normalizedTargetIds = normalizeStringArray(targetInstanceIds);
  const normalizedTargets = normalizeStringArray(targetInstanceLabels);
  const packDefaults = getPackDefaults(exercisePack);

  return {
    exercisePackId: exercisePack.id,
    stepId: currentStep.id,
    endpointId: endpoint.id,
    triggerKey: normalizedTriggerKey,
    triggerSource: normalizedSource,
    triggerIntent: deriveTriggerIntent(normalizedTriggerKey),
    scope: endpoint.scope,
    requiresSelection,
    targetInstanceIds: normalizedTargetIds,
    targetInstanceLabels: normalizedTargets,
    mutationPolicy: normalizeMutationPolicy(endpoint.run?.mutationPolicy, "proposal_only"),
    feedbackPolicy: normalizeFeedbackPolicy(endpoint.run?.feedbackPolicy, packDefaults.feedbackChannel || boardConfig?.defaultFeedbackTarget || "text"),
    allowedExecutionModes: normalizeAllowedExecutionModes(endpoint.run?.allowedExecutionModes, ["none"]),
    allowedActions: normalizeStringArray(endpoint.run?.allowedActions)
  };
}

export function isTriggerAllowed({ triggerKey = null, source = "system", hasSelection = false } = {}) {
  const parsed = parseTriggerKey(triggerKey);
  if (!parsed) return false;
  const defaults = getTriggerDefault(parsed.triggerKey);
  if (!defaults) return false;
  if (defaults.requiresSelection === true && !hasSelection) return false;
  return normalizeTriggerSource(source) != null;
}

export function resolveTriggerContext({
  triggerKey,
  source = "system",
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
  if (!defaults) {
    return {
      valid: false,
      reason: `Für Trigger ${parsed.triggerKey} existiert keine ausführbare Konfiguration.`,
      triggerKey: parsed.triggerKey,
      scope: parsed.scope,
      intent: parsed.intent,
      source: normalizeTriggerSource(source),
      targetInstanceLabels: normalizeStringArray(targetInstanceLabels)
    };
  }
  const normalizedTargets = normalizeStringArray(targetInstanceLabels);
  const hasSelection = Number(selectionCount) > 0 && normalizedTargets.length > 0;
  if (defaults.requiresSelection === true && !hasSelection) {
    return {
      valid: false,
      reason: `Trigger ${parsed.triggerKey} erwartet mindestens eine Ziel-Instanz.`,
      triggerKey: parsed.triggerKey,
      scope: parsed.scope,
      intent: parsed.intent,
      source: normalizeTriggerSource(source),
      requiresSelection: true,
      mutationPolicy: normalizeMutationPolicy(defaults.mutationPolicy, "none"),
      feedbackPolicy: normalizeFeedbackPolicy(defaults.feedbackPolicy, boardConfig?.defaultFeedbackTarget || "text"),
      allowedExecutionModes: normalizeAllowedExecutionModes(defaults.allowedExecutionModes, ["none"]),
      allowedActions: [],
      targetInstanceLabels: normalizedTargets
    };
  }
  return {
    valid: true,
    triggerKey: parsed.triggerKey,
    scope: parsed.scope,
    intent: parsed.intent,
    source: normalizeTriggerSource(source),
    requiresSelection: defaults.requiresSelection === true,
    mutationPolicy: normalizeMutationPolicy(defaults.mutationPolicy, "none"),
    feedbackPolicy: normalizeFeedbackPolicy(defaults.feedbackPolicy, boardConfig?.defaultFeedbackTarget || "text"),
    allowedExecutionModes: normalizeAllowedExecutionModes(defaults.allowedExecutionModes, ["none"]),
    allowedActions: [],
    prompt: null,
    targetInstanceLabels: normalizedTargets
  };
}

function normalizeSection(rawSection) {
  const src = (rawSection && typeof rawSection === "object") ? rawSection : {};
  const bullets = normalizeStringArray(src.bullets || src.items || src.points || []);
  const heading = asNonEmptyString(src.heading) || asNonEmptyString(src.title);
  if (!heading && !bullets.length) return null;
  return {
    heading: heading || null,
    bullets
  };
}

export function normalizeFeedbackBlock(rawFeedback, { fallbackTitle = null, fallbackSummary = null } = {}) {
  const src = (rawFeedback && typeof rawFeedback === "object") ? rawFeedback : {};
  const sections = Array.isArray(src.sections) ? src.sections.map((section) => normalizeSection(section)).filter(Boolean) : [];
  const summary = asNonEmptyString(src.summary) || asNonEmptyString(fallbackSummary);
  const title = asNonEmptyString(src.title) || asNonEmptyString(fallbackTitle) || (summary ? "Feedback" : null);
  if (!title && !summary && !sections.length) return null;
  return { title, summary: summary || null, sections };
}

export function normalizeFlowControlDirectivesBlock(rawDirectives) {
  const src = (rawDirectives && typeof rawDirectives === "object") ? rawDirectives : {};
  const unlockEndpointIds = normalizeStringArray(src.unlockEndpointIds || []);
  const completeEndpointIds = normalizeStringArray(src.completeEndpointIds || []);
  if (!unlockEndpointIds.length && !completeEndpointIds.length) return null;
  return {
    unlockEndpointIds,
    completeEndpointIds
  };
}

function normalizeRubricEntry(rawEntry) {
  const src = (rawEntry && typeof rawEntry === "object") ? rawEntry : {};
  const criterion = asNonEmptyString(src.criterion) || asNonEmptyString(src.name);
  const status = asNonEmptyString(src.status);
  const comment = asNonEmptyString(src.comment) || asNonEmptyString(src.reason);
  if (!criterion && !status && !comment) return null;
  return { criterion: criterion || null, status: status || null, comment: comment || null };
}

export function normalizeEvaluationBlock(rawEvaluation) {
  const src = (rawEvaluation && typeof rawEvaluation === "object") ? rawEvaluation : {};
  const scoreRaw = src.score;
  const score = (typeof scoreRaw === "number" && Number.isFinite(scoreRaw)) ? scoreRaw : (typeof scoreRaw === "string" && scoreRaw.trim() ? scoreRaw.trim() : null);
  const scale = asNonEmptyString(src.scale);
  const verdict = asNonEmptyString(src.verdict);
  const rubric = Array.isArray(src.rubric) ? src.rubric.map((entry) => normalizeRubricEntry(entry)).filter(Boolean) : [];
  if (score == null && !scale && !verdict && !rubric.length) return null;
  return { score, scale: scale || null, verdict: verdict || null, rubric };
}

export function isTransitionAllowed({ transition = null, source = "user", lastTriggerKey = null, memoryStepStatus = null } = {}) {
  if (!transition || typeof transition !== "object") return false;
  const normalizedSource = normalizeTriggerSource(source);
  const allowedSources = normalizeStringArray(transition.allowedSources || []);
  if (allowedSources.length && !allowedSources.includes(normalizedSource)) return false;
  const allowedAfterTriggerKeys = normalizeStringArray(transition.allowedAfterTriggerKeys || []);
  const normalizedLastTriggerKey = normalizeTriggerKey(lastTriggerKey);
  if (allowedAfterTriggerKeys.length && (!normalizedLastTriggerKey || !allowedAfterTriggerKeys.includes(normalizedLastTriggerKey))) return false;
  const requiredStatuses = normalizeStringArray(transition.requiredStepStatuses || []);
  const normalizedMemoryStepStatus = asNonEmptyString(memoryStepStatus);
  if (requiredStatuses.length && (!normalizedMemoryStepStatus || !requiredStatuses.includes(normalizedMemoryStepStatus))) return false;
  return true;
}

export function resolveNextTransition({ pack = null, step = null, source = "user", lastTriggerKey = null, memoryStepStatus = null } = {}) {
  const transitions = listStepTransitions(step || pack);
  if (!transitions.length) return null;
  for (const transition of transitions) {
    if ((transition.policy || "manual") !== "manual") continue;
    if (isTransitionAllowed({ transition, source, lastTriggerKey, memoryStepStatus })) return transition;
  }
  return null;
}

export { resolveNamedTransition };
