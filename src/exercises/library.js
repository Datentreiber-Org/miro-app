import {
  PROMPT_MODULES,
  ENDPOINTS,
  getEndpointById as getCatalogEndpointById,
  getPromptModuleById,
  getPromptModulesByIds,
  listExercisePacks,
  getExercisePackById,
  listExerciseSteps,
  getExerciseStep,
  getDefaultStepId,
  getNextExerciseStep,
  listAllowedTriggerKeys,
  getStepTriggerConfig,
  getPackDefaults,
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  PACK_TEMPLATES,
  RUN_PROFILES,
  listPackTemplates,
  getPackTemplateById,
  listStepTemplatesForPack,
  getStepTemplateForPack,
  listRunProfilesForPack,
  listRunProfilesForStep,
  listRunProfilesForStepSurface,
  getRunProfileById,
  listStepEndpoints as listCatalogStepEndpoints
} from "./method-catalog.js?v=20260313-batch11";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = asNonEmptyString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalizeSurfaceGroup(value) {
  const normalized = asNonEmptyString(value);
  return ["primary", "secondary", "proposal", "hidden"].includes(normalized) ? normalized : "hidden";
}

function normalizeScopeType(triggerKey) {
  return String(triggerKey || "").startsWith("global.") ? "global" : "fixed_instances";
}

function buildSyntheticEndpointId(exercisePackId, stepId, triggerKey) {
  return [exercisePackId || "pack", stepId || "step", triggerKey || "trigger"].join("::");
}

function normalizeEndpointShape(endpoint) {
  if (!endpoint || typeof endpoint !== "object") return null;
  const panelRole = endpoint?.surface?.panelRole || endpoint?.panelRole || null;
  const group = endpoint?.surface?.group || panelRole || "hidden";
  const scopeType = endpoint?.scope?.type || endpoint?.defaultScopeType || normalizeScopeType(endpoint?.triggerKey);
  const pack = getExercisePackById(endpoint.exercisePackId);
  return Object.freeze({
    id: asNonEmptyString(endpoint.id),
    exercisePackId: asNonEmptyString(endpoint.exercisePackId),
    stepId: asNonEmptyString(endpoint.stepId),
    label: asNonEmptyString(endpoint.label) || asNonEmptyString(endpoint.id),
    summary: asNonEmptyString(endpoint.summary),
    uiHint: asNonEmptyString(endpoint.uiHint),
    order: Number.isFinite(Number(endpoint.order ?? endpoint.sortOrder)) ? Number(endpoint.order ?? endpoint.sortOrder) : Number.MAX_SAFE_INTEGER,
    triggerKey: asNonEmptyString(endpoint.triggerKey),
    prompt: Object.freeze({
      text: asNonEmptyString(endpoint?.prompt?.text || endpoint?.triggerPrompt),
      moduleIds: Object.freeze(normalizeUniqueStrings(endpoint?.prompt?.moduleIds || endpoint?.moduleIds || []))
    }),
    scope: Object.freeze({
      type: scopeType,
      mode: scopeType === "global" ? "pack" : "selection",
      requiresSelection: endpoint?.scope?.requiresSelection === true || scopeType !== "global",
      allowedCanvasTypeIds: Object.freeze(normalizeUniqueStrings(endpoint?.scope?.allowedCanvasTypeIds || pack?.allowedCanvasTypeIds || pack?.allowedCanvasTypes || []))
    }),
    run: Object.freeze({
      mutationPolicy: asNonEmptyString(endpoint?.run?.mutationPolicy || endpoint?.mutationPolicy) || null,
      feedbackPolicy: asNonEmptyString(endpoint?.run?.feedbackPolicy || endpoint?.feedbackPolicy) || null,
      allowedExecutionModes: Object.freeze(normalizeUniqueStrings(endpoint?.run?.allowedExecutionModes || endpoint?.allowedExecutionModes || [])),
      allowedActions: Object.freeze(normalizeUniqueStrings(endpoint?.run?.allowedActions || endpoint?.allowedActions || []))
    }),
    surface: Object.freeze({
      group: normalizeSurfaceGroup(group),
      panelRole,
      boardGroup: endpoint?.surface?.boardGroup || endpoint?.boardGroup || "core",
      sidecarOnly: endpoint?.surface?.sidecarOnly === true,
      seedByDefault: endpoint?.surface?.seedByDefault === true || endpoint?.seedByDefault === true
    }),
    defaultScopeType: scopeType
  });
}

function buildSyntheticEndpoint(exercisePack, currentStep, triggerKey) {
  const triggerConfig = getStepTriggerConfig(exercisePack, currentStep?.id, triggerKey);
  if (!exercisePack || !currentStep || !triggerConfig) return null;
  const scopeType = normalizeScopeType(triggerKey);
  return normalizeEndpointShape({
    id: buildSyntheticEndpointId(exercisePack.id, currentStep.id, triggerKey),
    exercisePackId: exercisePack.id,
    stepId: currentStep.id,
    label: triggerKey,
    summary: null,
    triggerKey,
    prompt: {
      text: triggerConfig.prompt || null,
      moduleIds: triggerConfig.moduleIds || []
    },
    scope: {
      type: scopeType,
      requiresSelection: triggerConfig.requiresSelection === true,
      allowedCanvasTypeIds: exercisePack.allowedCanvasTypeIds || exercisePack.allowedCanvasTypes || []
    },
    run: {
      mutationPolicy: triggerConfig.mutationPolicy || null,
      feedbackPolicy: triggerConfig.feedbackPolicy || null,
      allowedExecutionModes: triggerConfig.allowedExecutionModes || [],
      allowedActions: currentStep.allowedActions || []
    },
    surface: {
      group: "hidden",
      panelRole: null,
      boardGroup: "core",
      sidecarOnly: false,
      seedByDefault: false
    },
    order: Number.MAX_SAFE_INTEGER
  });
}

function sortEndpoints(items) {
  return (Array.isArray(items) ? items : []).slice().sort((a, b) => {
    const aOrder = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" });
  });
}

function mergeVisibleAndSyntheticEndpoints(exercisePack, currentStep, options = {}) {
  if (!exercisePack || !currentStep?.id) return [];
  const visible = listCatalogStepEndpoints(exercisePack, currentStep.id, options).map(normalizeEndpointShape).filter(Boolean);
  const byTrigger = new Set(visible.map((endpoint) => endpoint.triggerKey).filter(Boolean));
  const synthetic = [];
  for (const triggerKey of listAllowedTriggerKeys(currentStep)) {
    if (byTrigger.has(triggerKey)) continue;
    const endpoint = buildSyntheticEndpoint(exercisePack, currentStep, triggerKey);
    if (endpoint) synthetic.push(endpoint);
  }
  return sortEndpoints([...visible, ...synthetic]);
}

export {
  PROMPT_MODULES,
  ENDPOINTS,
  getPromptModuleById,
  getPromptModulesByIds,
  listExercisePacks,
  getExercisePackById,
  listExerciseSteps,
  getExerciseStep,
  getDefaultStepId,
  getNextExerciseStep,
  getPackDefaults,
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  PACK_TEMPLATES,
  RUN_PROFILES,
  listPackTemplates,
  getPackTemplateById,
  listStepTemplatesForPack,
  getStepTemplateForPack,
  listRunProfilesForPack,
  listRunProfilesForStep,
  listRunProfilesForStepSurface,
  getRunProfileById
};

export function listEndpointsForPack(packOrId, options = {}) {
  const exercisePack = typeof packOrId === "string" ? getExercisePackById(packOrId, options) : packOrId;
  if (!exercisePack) return [];
  const steps = listExerciseSteps(exercisePack, options);
  return sortEndpoints(steps.flatMap((step) => mergeVisibleAndSyntheticEndpoints(exercisePack, step, options)));
}

export function listStepEndpoints(packOrId, stepId, options = {}) {
  const exercisePack = typeof packOrId === "string" ? getExercisePackById(packOrId, options) : packOrId;
  if (!exercisePack) return [];
  const currentStep = getExerciseStep(exercisePack, stepId, options);
  return mergeVisibleAndSyntheticEndpoints(exercisePack, currentStep, options);
}

export function listStepEndpointsForSurface(packOrId, stepId, options = {}) {
  const requestedGroup = normalizeSurfaceGroup(options?.group || options?.panelRole || options?.surfaceGroup || "hidden");
  const requestedBoardGroup = asNonEmptyString(options?.boardGroup);
  const seedByDefaultOnly = options?.seedByDefaultOnly === true;
  return listStepEndpoints(packOrId, stepId, options)
    .filter((endpoint) => requestedGroup === "hidden" ? true : endpoint?.surface?.group === requestedGroup)
    .filter((endpoint) => !requestedBoardGroup || endpoint?.surface?.boardGroup === requestedBoardGroup)
    .filter((endpoint) => !seedByDefaultOnly || endpoint?.surface?.seedByDefault === true)
    .filter((endpoint) => requestedGroup === "hidden" ? true : endpoint?.surface?.group !== "hidden");
}

export function getEndpointById(endpointId, options = {}) {
  const explicit = normalizeEndpointShape(getCatalogEndpointById(endpointId, options));
  if (explicit) return explicit;
  for (const pack of listExercisePacks(options)) {
    for (const step of listExerciseSteps(pack, options)) {
      const synthetic = buildSyntheticEndpoint(pack, step, endpointId);
      if (synthetic && synthetic.id === endpointId) return synthetic;
      for (const endpoint of listStepEndpoints(pack, step.id, options)) {
        if (endpoint?.id === endpointId) return endpoint;
      }
    }
  }
  return null;
}

export function findStepEndpointByTriggerKey(packOrId, stepId, triggerKey, options = {}) {
  const candidates = listStepEndpoints(packOrId, stepId, options)
    .filter((endpoint) => endpoint?.triggerKey === asNonEmptyString(triggerKey));
  candidates.sort((a, b) => {
    if ((a?.surface?.sidecarOnly === true) !== (b?.surface?.sidecarOnly === true)) {
      return a?.surface?.sidecarOnly === true ? 1 : -1;
    }
    const aOrder = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return String(a?.id || "").localeCompare(String(b?.id || ""), undefined, { sensitivity: "base" });
  });
  return candidates[0] || null;
}

export function listStepTriggerKeysFromEndpoints(packOrId, stepId, options = {}) {
  return Array.from(new Set(listStepEndpoints(packOrId, stepId, options).map((endpoint) => endpoint?.triggerKey).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function isSidecarOnlyEndpoint(endpoint) {
  return endpoint?.surface?.sidecarOnly === true;
}
