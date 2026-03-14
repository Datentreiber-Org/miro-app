import {
  ENDPOINTS,
  PROMPT_MODULES,
  normalizeExercisePackId,
  listExercisePacks,
  getExercisePackById,
  getPackDefaults,
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  listExerciseSteps,
  getExerciseStep,
  getDefaultStepId,
  getNextExerciseStep,
  listStepTransitions,
  resolveNamedTransition,
  listEndpointsForPack,
  listStepEndpoints,
  listStepEndpointsForSurface,
  getEndpointById,
  isSidecarOnlyEndpoint,
  getPromptModuleById,
  getPromptModulesByIds
} from "./method-catalog.js?v=20260313-patch11-chatpatch1";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function findStepEndpointsByChannel(exercisePack, stepId, channel, { lang = "de" } = {}) {
  const normalizedChannel = asNonEmptyString(channel);
  if (!normalizedChannel) return [];
  return listStepEndpoints(exercisePack, stepId, { lang })
    .filter((endpoint) => endpoint?.surface?.channel === normalizedChannel);
}

export function findFirstEndpointByChannel(exercisePack, stepId, channel, { lang = "de" } = {}) {
  return findStepEndpointsByChannel(exercisePack, stepId, channel, { lang })[0] || null;
}

export function listBoardButtonEndpointsForStep(exercisePack, stepId, { lang = "de" } = {}) {
  return findStepEndpointsByChannel(exercisePack, stepId, "board_button", { lang })
    .filter((endpoint) => endpoint?.surface?.group !== "hidden")
    .filter((endpoint) => !isSidecarOnlyEndpoint(endpoint));
}

export {
  ENDPOINTS,
  PROMPT_MODULES,
  normalizeExercisePackId,
  listExercisePacks,
  getExercisePackById,
  getPackDefaults,
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  listExerciseSteps,
  getExerciseStep,
  getDefaultStepId,
  getNextExerciseStep,
  listStepTransitions,
  resolveNamedTransition,
  listEndpointsForPack,
  listStepEndpoints,
  listStepEndpointsForSurface,
  getEndpointById,
  isSidecarOnlyEndpoint,
  getPromptModuleById,
  getPromptModulesByIds
};
