import {
  DT_ENDPOINT_SCOPE_TYPES,
  DT_FEEDBACK_CHANNELS,
  DT_MUTATION_POLICIES,
  DT_EXECUTION_MODES
} from "../config.js?v=20260315-patch13-submit-proposals-fix1";
import {
  listStepTransitions,
  resolveNamedTransition
} from "../exercises/registry.js?v=20260315-patch13-submit-proposals-fix1";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function pickFirstNonEmptyString(...values) {
  for (const value of values) {
    const normalized = asNonEmptyString(value);
    if (normalized) return normalized;
  }
  return null;
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

function normalizeScopeMode(value, fallback = "selection") {
  const normalized = asNonEmptyString(value);
  if (normalized && DT_ENDPOINT_SCOPE_TYPES.includes(normalized)) return normalized;
  return fallback;
}

function normalizeEndpointScope(scope) {
  return {
    mode: normalizeScopeMode(scope?.mode),
    allowedCanvasTypeIds: normalizeStringArray(scope?.allowedCanvasTypeIds)
  };
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


export function resolveEndpointContext({
  exercisePack,
  currentStep,
  endpoint,
  targetInstanceIds = [],
  targetInstanceLabels = [],
  boardConfig = null
} = {}) {
  if (!exercisePack) throw new Error("resolveEndpointContext: missing exercisePack");
  if (!currentStep) throw new Error("resolveEndpointContext: missing currentStep");
  if (!endpoint) throw new Error("resolveEndpointContext: missing endpoint");

  const scope = normalizeEndpointScope(endpoint.scope);
  return {
    exercisePackId: asNonEmptyString(exercisePack.id),
    stepId: asNonEmptyString(currentStep.id),
    endpointId: asNonEmptyString(endpoint.id),
    scope,
    requiresSelection: scope.mode === "selection",
    targetInstanceIds: normalizeStringArray(targetInstanceIds),
    targetInstanceLabels: normalizeStringArray(targetInstanceLabels),
    mutationPolicy: normalizeMutationPolicy(endpoint.run?.mutationPolicy, "none"),
    feedbackPolicy: normalizeFeedbackPolicy(endpoint.run?.feedbackPolicy, boardConfig?.defaultFeedbackTarget || "text"),
    allowedExecutionModes: normalizeAllowedExecutionModes(endpoint.run?.allowedExecutionModes, ["none"]),
    allowedActions: normalizeStringArray(endpoint.run?.allowedActions),
    allowedActionAreas: normalizeStringArray(endpoint.run?.allowedActionAreas)
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

function normalizeMemoryStepStatus(memoryState) {
  if (typeof memoryState === "string") return asNonEmptyString(memoryState);
  return pickFirstNonEmptyString(memoryState?.stepStatus, memoryState?.status);
}

export function isStepTransitionSatisfied(transition, flowRuntime, memoryState) {
  if (!transition || typeof transition !== "object") return false;
  const doneEndpointIds = new Set(normalizeStringArray(flowRuntime?.doneEndpointIds));
  const requiredDoneEndpointIds = normalizeStringArray(transition?.requiredDoneEndpointIds);
  if (requiredDoneEndpointIds.some((endpointId) => !doneEndpointIds.has(endpointId))) return false;

  const requiredMemoryStepStatus = asNonEmptyString(transition?.requiredMemoryStepStatus);
  if (requiredMemoryStepStatus) {
    const memoryStepStatus = normalizeMemoryStepStatus(memoryState);
    if (memoryStepStatus !== requiredMemoryStepStatus) return false;
  }

  return true;
}

export function resolveNextStepTransition(step, flowRuntime, memoryState) {
  const transitions = listStepTransitions(step);
  for (const transition of transitions) {
    if (isStepTransitionSatisfied(transition, flowRuntime, memoryState)) {
      return transition;
    }
  }
  return null;
}

export function resolveNextTransition({
  step = null,
  flowRuntime = null,
  memoryState = null,
  memoryStepStatus = null
} = {}) {
  return resolveNextStepTransition(
    step,
    flowRuntime,
    memoryState ?? { stepStatus: memoryStepStatus }
  );
}

export { resolveNamedTransition };
