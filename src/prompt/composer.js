import {
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  getPackDefaults,
  getStepTriggerConfig
} from "../exercises/registry.js?v=20260301-step11-hotfix2";
import { parseTriggerKey } from "../runtime/exercise-engine.js?v=20260303-flowbatch1";

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

  return lines.join("\n");
}

function mapAllowedCanvasTypes(canvasTypeIds, templateCatalog) {
  return normalizeUniqueStrings(canvasTypeIds).map((canvasTypeId) => ({
    canvasTypeId,
    displayName: getCanvasTypeDisplayName(templateCatalog, canvasTypeId) || canvasTypeId
  }));
}

function buildPackTemplatePromptBlock(packTemplate) {
  const prompt = asNonEmptyString(packTemplate?.globalPrompt);
  if (!prompt) return null;
  return `Pack-Template-Kontext (${packTemplate?.label || packTemplate?.id || "Pack Template"}):\n${prompt}`;
}

function buildFlowStepPromptBlock(flowStep) {
  if (!flowStep || typeof flowStep !== "object") return null;
  const lines = [];
  const instruction = asNonEmptyString(flowStep?.instructionOverride) || asNonEmptyString(flowStep?.instruction);
  const summary = asNonEmptyString(flowStep?.summary);
  if (instruction) lines.push(`- sichtbareInstruktion: ${instruction}`);
  if (summary) lines.push(`- stepSummary: ${summary}`);
  if (!lines.length) return null;
  return `Flow-Schritt (${flowStep?.label || flowStep?.id || "aktueller Schritt"}):\n${lines.join("\n")}`;
}

function buildRunProfilePromptBlock(runProfile) {
  if (!runProfile || typeof runProfile !== "object") return null;
  const lines = [
    `- id: ${runProfile.id || "(leer)"}`,
    `- triggerKey: ${runProfile.triggerKey || "(leer)"}`
  ];

  if (asNonEmptyString(runProfile?.summary)) lines.push(`- summary: ${runProfile.summary}`);
  if (asNonEmptyString(runProfile?.defaultScopeType)) lines.push(`- defaultScopeType: ${runProfile.defaultScopeType}`);
  if (asNonEmptyString(runProfile?.mutationPolicy)) lines.push(`- mutationPolicyOverride: ${runProfile.mutationPolicy}`);
  if (asNonEmptyString(runProfile?.feedbackPolicy)) lines.push(`- feedbackPolicyOverride: ${runProfile.feedbackPolicy}`);
  if (Array.isArray(runProfile?.allowedActions) && runProfile.allowedActions.length) {
    lines.push(`- allowedActions: ${runProfile.allowedActions.join(", ")}`);
  }
  return `Run-Profile (${runProfile?.label || runProfile?.id || "Run Profile"}):\n${lines.join("\n")}`;
}

function buildPromptModuleBlocks(promptModules) {
  return (Array.isArray(promptModules) ? promptModules : [])
    .map((module) => {
      const prompt = asNonEmptyString(module?.prompt);
      if (!prompt) return null;
      const title = asNonEmptyString(module?.label) || asNonEmptyString(module?.id) || "Prompt-Modul";
      return `Prompt-Modul (${title}):\n${prompt}`;
    })
    .filter(Boolean);
}

function buildControlContextBlock(controlContext) {
  if (!controlContext || typeof controlContext !== "object") return null;
  const lines = [];
  if (asNonEmptyString(controlContext?.controlId)) lines.push(`- controlId: ${controlContext.controlId}`);
  if (asNonEmptyString(controlContext?.controlLabel)) lines.push(`- controlLabel: ${controlContext.controlLabel}`);
  if (asNonEmptyString(controlContext?.flowId)) lines.push(`- flowId: ${controlContext.flowId}`);
  if (asNonEmptyString(controlContext?.scopeType)) lines.push(`- scopeType: ${controlContext.scopeType}`);
  if (Array.isArray(controlContext?.targetInstanceLabels) && controlContext.targetInstanceLabels.length) {
    lines.push(`- targetInstanceLabels: ${controlContext.targetInstanceLabels.join(", ")}`);
  }
  if (!lines.length) return null;
  return `Control-Kontext:\n${lines.join("\n")}`;
}

export function buildExerciseContext({
  boardConfig = null,
  exercisePack = null,
  currentStep = null,
  triggerContext = null,
  templateCatalog = null,
  packTemplate = null,
  flowStep = null,
  runProfile = null,
  controlContext = null
} = {}) {
  const boardMode = sanitizeBoardMode(boardConfig?.boardMode);
  const parsed = triggerContext ? parseTriggerKey(triggerContext.triggerKey) : null;
  const useFlowContext = !!(packTemplate || runProfile || flowStep || controlContext);

  if (useFlowContext) {
    const allowedCanvasTypes = mapAllowedCanvasTypes(packTemplate?.allowedCanvasTypeIds || [], templateCatalog);
    const defaultCanvasTypeId = normalizeUniqueStrings(packTemplate?.allowedCanvasTypeIds || [])[0] || asNonEmptyString(boardConfig?.defaultCanvasTypeId);
    const visibleInstruction = asNonEmptyString(flowStep?.instructionOverride) || asNonEmptyString(flowStep?.instruction);

    return {
      boardMode: "exercise",
      exercisePackId: asNonEmptyString(packTemplate?.id),
      exercisePackLabel: asNonEmptyString(packTemplate?.label),
      exercisePackVersion: 1,
      defaultCanvasTypeId: defaultCanvasTypeId || null,
      defaultCanvasTypeLabel: getCanvasTypeDisplayName(templateCatalog, defaultCanvasTypeId),
      allowedCanvasTypes,
      currentStepId: asNonEmptyString(flowStep?.id),
      currentStepLabel: asNonEmptyString(flowStep?.label),
      visibleInstruction: visibleInstruction || null,
      allowedActions: normalizeUniqueStrings(runProfile?.allowedActions || []),
      triggerKey: triggerContext?.triggerKey || "generic",
      triggerSource: triggerContext?.source || "system",
      triggerScope: parsed?.scope || null,
      triggerIntent: parsed?.intent || null,
      mutationPolicy: triggerContext?.mutationPolicy || asNonEmptyString(runProfile?.mutationPolicy) || null,
      feedbackPolicy: triggerContext?.feedbackPolicy || asNonEmptyString(runProfile?.feedbackPolicy) || asNonEmptyString(boardConfig?.feedbackChannelDefault) || null,
      requiresSelection: !!triggerContext?.requiresSelection,
      feedbackFrameName: asNonEmptyString(boardConfig?.feedbackFrameName),
      userMayChangePack: false,
      userMayChangeStep: false,
      packTemplateId: asNonEmptyString(packTemplate?.id),
      packTemplateLabel: asNonEmptyString(packTemplate?.label),
      runProfileId: asNonEmptyString(runProfile?.id),
      runProfileLabel: asNonEmptyString(runProfile?.label),
      controlId: asNonEmptyString(controlContext?.controlId),
      controlLabel: asNonEmptyString(controlContext?.controlLabel),
      scopeType: asNonEmptyString(controlContext?.scopeType),
      targetInstanceLabels: normalizeUniqueStrings(controlContext?.targetInstanceLabels || triggerContext?.targetInstanceLabels || [])
    };
  }

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
  adminOverrideText = null,
  packTemplate = null,
  flowStep = null,
  runProfile = null,
  promptModules = [],
  controlContext = null
} = {}) {
  const systemBlocks = [];
  const hasFlowContext = !!(packTemplate || runProfile || flowStep || (Array.isArray(promptModules) && promptModules.length) || controlContext);

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
    templateCatalog,
    packTemplate,
    flowStep,
    runProfile,
    controlContext
  });

  if (hasFlowContext) {
    const packBlock = buildPackTemplatePromptBlock(packTemplate);
    if (packBlock) systemBlocks.push(packBlock);

    const stepBlock = buildFlowStepPromptBlock(flowStep);
    if (stepBlock) systemBlocks.push(stepBlock);

    const runProfileBlock = buildRunProfilePromptBlock(runProfile);
    if (runProfileBlock) systemBlocks.push(runProfileBlock);

    for (const block of buildPromptModuleBlocks(promptModules)) {
      systemBlocks.push(block);
    }

    const controlBlock = buildControlContextBlock(controlContext);
    if (controlBlock) systemBlocks.push(controlBlock);
  } else {
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
