import {
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  getPackDefaults,
  getStepTriggerConfig
} from "../exercises/registry.js?v=20260301-step10";
import { parseTriggerKey } from "../runtime/exercise-engine.js?v=20260301-step10";

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

function sanitizeBoardMode(value) {
  return value === "exercise" ? "exercise" : "generic";
}

function sanitizeRunMode(value) {
  return asNonEmptyString(value) || "generic";
}

function getCanvasTypeDisplayName(templateCatalog, canvasTypeId) {
  const cfg = templateCatalog?.[canvasTypeId] || null;
  return asNonEmptyString(cfg?.displayName) || asNonEmptyString(cfg?.agentLabelPrefix) || canvasTypeId || null;
}

function buildCanvasTypePromptBlocks(involvedCanvasTypeIds, templateCatalog) {
  const blocks = [];

  for (const canvasTypeId of normalizeUniqueStrings(involvedCanvasTypeIds)) {
    const cfg = templateCatalog?.[canvasTypeId] || null;
    const promptContext = asNonEmptyString(cfg?.promptContext);
    if (!promptContext) continue;

    const displayName = getCanvasTypeDisplayName(templateCatalog, canvasTypeId) || canvasTypeId;
    blocks.push(`Canvas-Typ-Kontext (${displayName}):\n${promptContext}`);
  }

  return blocks;
}

function buildModePromptBlock(runMode, triggerContext) {
  const parsed = triggerContext ? parseTriggerKey(triggerContext.triggerKey) : null;
  const lines = [
    "Laufkontext:",
    `- runMode: ${sanitizeRunMode(runMode)}`,
    `- triggerKey: ${triggerContext?.triggerKey || "generic"}`,
    `- triggerSource: ${triggerContext?.source || "system"}`
  ];

  if (parsed?.scope) lines.push(`- triggerScope: ${parsed.scope}`);
  if (parsed?.intent) lines.push(`- triggerIntent: ${parsed.intent}`);
  if (triggerContext?.mutationPolicy) lines.push(`- mutationPolicy: ${triggerContext.mutationPolicy}`);
  if (triggerContext?.feedbackPolicy) lines.push(`- feedbackPolicy: ${triggerContext.feedbackPolicy}`);
  lines.push("- Wenn exerciseContext vorhanden ist, behandle ihn als verbindlichen zusätzlichen Arbeitskontext.");

  return lines.join("\n");
}

export function buildExerciseContext({
  boardConfig = null,
  exercisePack = null,
  currentStep = null,
  triggerContext = null,
  templateCatalog = null
} = {}) {
  const boardMode = sanitizeBoardMode(boardConfig?.boardMode);
  const parsed = triggerContext ? parseTriggerKey(triggerContext.triggerKey) : null;
  const packDefaults = getPackDefaults(exercisePack);

  if (!exercisePack) {
    return {
      boardMode,
      exercisePackId: null,
      exercisePackLabel: null,
      exercisePackVersion: null,
      defaultCanvasTypeId: asNonEmptyString(boardConfig?.defaultCanvasTypeId),
      defaultCanvasTypeLabel: getCanvasTypeDisplayName(templateCatalog, boardConfig?.defaultCanvasTypeId),
      allowedCanvasTypes: [],
      currentStepId: null,
      currentStepLabel: null,
      visibleInstruction: null,
      allowedActions: [],
      triggerKey: triggerContext?.triggerKey || "generic",
      triggerSource: triggerContext?.source || "system",
      triggerScope: parsed?.scope || null,
      triggerIntent: parsed?.intent || null,
      mutationPolicy: triggerContext?.mutationPolicy || null,
      feedbackPolicy: triggerContext?.feedbackPolicy || asNonEmptyString(boardConfig?.feedbackChannelDefault) || packDefaults.feedbackChannel,
      requiresSelection: !!triggerContext?.requiresSelection,
      feedbackFrameName: asNonEmptyString(boardConfig?.feedbackFrameName) || packDefaults.feedbackFrameName,
      userMayChangePack: !!boardConfig?.userMayChangePack,
      userMayChangeStep: !!boardConfig?.userMayChangeStep
    };
  }

  const allowedCanvasTypes = getAllowedCanvasTypesForPack(exercisePack).map((canvasTypeId) => ({
    canvasTypeId,
    displayName: getCanvasTypeDisplayName(templateCatalog, canvasTypeId) || canvasTypeId
  }));

  const defaultCanvasTypeId = asNonEmptyString(boardConfig?.defaultCanvasTypeId) || getDefaultCanvasTypeIdForPack(exercisePack);
  const stepAllowedActions = Array.isArray(currentStep?.allowedActions)
    ? normalizeUniqueStrings(currentStep.allowedActions)
    : [];

  return {
    boardMode,
    exercisePackId: asNonEmptyString(exercisePack.id),
    exercisePackLabel: asNonEmptyString(exercisePack.label),
    exercisePackVersion: Number.isFinite(Number(exercisePack.version)) ? Number(exercisePack.version) : null,
    defaultCanvasTypeId: defaultCanvasTypeId || null,
    defaultCanvasTypeLabel: getCanvasTypeDisplayName(templateCatalog, defaultCanvasTypeId),
    allowedCanvasTypes,
    currentStepId: asNonEmptyString(currentStep?.id),
    currentStepLabel: asNonEmptyString(currentStep?.label),
    visibleInstruction: asNonEmptyString(currentStep?.visibleInstruction),
    allowedActions: stepAllowedActions,
    triggerKey: triggerContext?.triggerKey || "generic",
    triggerSource: triggerContext?.source || "system",
    triggerScope: parsed?.scope || null,
    triggerIntent: parsed?.intent || null,
    mutationPolicy: triggerContext?.mutationPolicy || null,
    feedbackPolicy: triggerContext?.feedbackPolicy || packDefaults.feedbackChannel,
    requiresSelection: !!triggerContext?.requiresSelection,
    feedbackFrameName: asNonEmptyString(boardConfig?.feedbackFrameName) || packDefaults.feedbackFrameName,
    userMayChangePack: !!boardConfig?.userMayChangePack,
    userMayChangeStep: !!boardConfig?.userMayChangeStep
  };
}

export function composePrompt({
  baseSystemPrompt,
  runMode,
  triggerContext = null,
  userQuestion,
  baseUserPayload = null,
  involvedCanvasTypeIds = [],
  templateCatalog = null,
  boardConfig = null,
  exercisePack = null,
  currentStep = null,
  adminOverrideText = null
} = {}) {
  const systemBlocks = [];

  if (asNonEmptyString(baseSystemPrompt)) {
    systemBlocks.push(String(baseSystemPrompt).trim());
  }

  systemBlocks.push(buildModePromptBlock(runMode, triggerContext));

  for (const block of buildCanvasTypePromptBlocks(involvedCanvasTypeIds, templateCatalog)) {
    systemBlocks.push(block);
  }

  const exerciseContext = buildExerciseContext({
    boardConfig,
    exercisePack,
    currentStep,
    triggerContext,
    templateCatalog
  });

  const exerciseGlobalPrompt = asNonEmptyString(exercisePack?.globalPrompt);
  if (exerciseGlobalPrompt) {
    systemBlocks.push(`Exercise-Pack-Kontext (${exercisePack.label || exercisePack.id}):\n${exerciseGlobalPrompt}`);
  }

  const stepTriggerConfig = currentStep && triggerContext
    ? getStepTriggerConfig(currentStep, triggerContext.triggerKey)
    : null;
  const stepPrompt = asNonEmptyString(stepTriggerConfig?.prompt);

  if (stepPrompt) {
    systemBlocks.push(`Schritt-Kontext (${currentStep?.label || currentStep?.id || "aktueller Schritt"}):\n${stepPrompt}`);
  }

  const normalizedAdminOverrideText = asNonEmptyString(adminOverrideText);
  if (normalizedAdminOverrideText) {
    systemBlocks.push(`Admin-Override:\n${normalizedAdminOverrideText}`);
  }

  const systemPrompt = systemBlocks.filter(Boolean).join("\n\n---\n\n");
  const payloadBase = (baseUserPayload && typeof baseUserPayload === "object") ? baseUserPayload : {};

  return {
    systemPrompt,
    exerciseContext,
    userPayload: {
      ...payloadBase,
      userQuestion: asNonEmptyString(userQuestion) || null,
      exerciseContext
    }
  };
}
