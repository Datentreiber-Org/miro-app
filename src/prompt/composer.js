import {
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  getPackDefaults,
  getStepTriggerConfig
} from "../exercises/registry.js?v=20260306-batch6";
import { parseTriggerKey } from "../runtime/exercise-engine.js?v=20260306-batch6";
import { normalizeUiLanguage } from "../i18n/index.js?v=20260306-batch6";

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

const ANALYTICS_AI_USE_CASE_CANVAS_TYPE_ID = "datentreiber-analytics-ai-use-case";

function resolvePromptStepId({ currentStep = null, flowStep = null, exerciseContext = null } = {}) {
  return asNonEmptyString(flowStep?.id)
    || asNonEmptyString(currentStep?.id)
    || asNonEmptyString(exerciseContext?.currentStepId)
    || null;
}

function buildConnectorPermissionAddendum(exerciseContext) {
  const hasAllowedActionsArray = Array.isArray(exerciseContext?.allowedActions);
  const allowedActions = normalizeUniqueStrings(exerciseContext?.allowedActions || []);
  const mutationPolicy = asNonEmptyString(exerciseContext?.mutationPolicy);

  if (mutationPolicy === "none" || (hasAllowedActionsArray && !allowedActions.includes("create_connector"))) {
    return "- In diesem Run sind Connector-Mutationen nicht freigegeben oder nicht der richtige Schwerpunkt. Gib deshalb keine create_connector-Actions aus; benenne nötige Relationen höchstens im feedback.";
  }

  return null;
}

function buildConnectorPolicyBlock({
  involvedCanvasTypeIds = [],
  exerciseContext = null,
  currentStep = null,
  flowStep = null
} = {}) {
  const lines = [
    "Zentrale Connector-Policy:",
    "- Connectoren sind sparsame, methodische Beziehungen und niemals Default-Dekoration.",
    "- Plane Connectoren nur, wenn eine explizite Relation sichtbar werden soll: Beitrag, Ursache/Wirkung, Ablauf/Reihenfolge, Unterstützung, Feedback-Loop oder validierte Fit-/Traceability-Beziehung.",
    "- Plane KEINE Connectoren nur wegen gleicher Area, gleicher Farbe, thematischer Nähe, Clusterzugehörigkeit, Brainstorm-Sammlung, Alternativsammlung oder räumlicher Nähe.",
    "- Nicht jede Sticky Note braucht einen Connector. Unverbundene Stickies sind korrekt, wenn sie Sammlung, Alternative, Beobachtung oder Hypothese repräsentieren.",
    "- Bevorzuge wenige, gut lesbare Kanten statt dichten Netzen."
  ];

  const permissionAddendum = buildConnectorPermissionAddendum(exerciseContext);
  if (permissionAddendum) {
    lines.push(permissionAddendum);
  }

  const canvasTypeIds = new Set(normalizeUniqueStrings(involvedCanvasTypeIds));
  if (!canvasTypeIds.has(ANALYTICS_AI_USE_CASE_CANVAS_TYPE_ID)) {
    return lines.join("\n");
  }

  const stepId = resolvePromptStepId({ currentStep, flowStep, exerciseContext });
  lines.push("Connector-Policy für Analytics & AI Use Case:");
  lines.push("- 2_user_and_situation bleibt normalerweise unverbunden.");
  lines.push("- 3_objectives_and_results darf als kleiner Driver Tree strukturiert werden: bevorzugt Result → Objective, nicht als Vollgraph.");
  lines.push("- 4_decisions_and_actions darf als kleiner Workflow mit wenigen klaren Ablauf- oder Feedback-Loop-Kanten strukturiert werden.");
  lines.push("- 5a_user_gains und 5b_user_pains sind standardmäßig Sammel- oder Brainstorm-Bereiche; Gains und Pains bleiben normalerweise unverbunden.");
  lines.push("- 6_solutions sammelt zunächst Varianten; alternative Lösungsideen werden nicht automatisch miteinander verbunden.");
  lines.push("- 6a_information und 6b_functions werden nur dann verbunden, wenn eine konkrete Information oder Funktion eine konkrete Entscheidung oder Handlung verbessert.");
  lines.push("- 7_benefits werden nur selektiv verbunden, wenn ein Benefit klar auf Information/Funktion zurückgeht oder einen bestimmten Pain, Gain, Result, Objective oder eine Action adressiert.");
  lines.push("- 8_check dient der Verdichtung; vermeide dort Graph-Explosionen und bevorzuge wenige validierte Fit-Ketten oder knappe Check-Aussagen.");

  if (stepId === "step1_user_perspective") {
    lines.push("- In Step 1 dominiert zuerst Sammlung und Strukturierung der Nutzerperspektive: User & Situation → Objectives & Results → Decisions & Actions → Gains/Pains.");
    lines.push("- Gains/Pains werden in diesem Schritt standardmäßig NICHT verkettet. User & Situation bleibt meist ebenfalls unverbunden.");
  } else if (stepId === "step2_solution_perspective") {
    lines.push("- In Step 2 dominiert Ableitung statt Vollverdrahtung: erst Solution-Varianten oder Lösungsideen, dann Information und Functions, danach Benefits.");
    lines.push("- Verbinde nur dort, wo die linke Seite eine konkrete Entscheidung, Handlung oder einen klar benannten Benefit stützt.");
  } else if (stepId === "step3_fit_check_and_synthesis") {
    lines.push("- In Step 3 dominiert Validierung und Verdichtung statt neue Strukturierung.");
    lines.push("- Füge nur wenige validierte Fit-Kanten hinzu. Lieber eine knappe Check-Aussage als zusätzliche Kanten ohne klare Prüflogik.");
  }

  return lines.join("\n");
}

export function buildOutputLanguageBlock(displayLanguage, { questionMode = false } = {}) {
  const normalizedLanguage = normalizeUiLanguage(displayLanguage);
  const languageLabel = normalizedLanguage === "en" ? "English" : "Deutsch";
  const lines = [
    "Sprachvorgabe für sichtbare Ausgabe:",
    `- Formuliere alle sichtbaren Inhalte in ${languageLabel}.`
  ];

  if (questionMode) {
    lines.push('- Das betrifft insbesondere das Feld answer.');
  } else {
    lines.push("- Das betrifft analysis, feedback, answer, evaluation und alle neu erzeugten Sticky-Texte.");
    lines.push("- Technische Felder bleiben unverändert: triggerKey, area, targetArea, instanceLabel, runProfileIds, stepId.");
    lines.push("- memoryEntry.stepStatus bleibt ein technischer Statuswert und wird nicht lokalisiert.");
  }

  return lines.join("\n");
}

const ADMIN_OVERRIDE_ALLOWED_ACTIONS = Object.freeze([
  "create_sticky",
  "move_sticky",
  "delete_sticky",
  "create_connector",
  "inform"
]);

function buildAdminOverridePromptBlock(adminOverrideText) {
  return `Admin-Override (höchste Priorität):
Die folgenden Debug-Anweisungen überschreiben alle Gating- und Policy-Regeln dieses Runs, insbesondere Einschränkungen aus exerciseContext.allowedActions, mutationPolicy, feedbackPolicy, Run-Profile-Regeln und vergleichbaren Freigaben.
Wenn der Admin-Override Board-Mutationen verlangt, darfst du dafür die nötigen Vertragstypen verwenden.
Halte den Output dennoch strikt schema-konform, verwende nur vorhandene instanceLabel-Werte und nur vorhandene Area-Keys aus templates[].areas[].name.

${adminOverrideText}`;
}

function applyAdminOverrideToExerciseContext(exerciseContext) {
  const src = (exerciseContext && typeof exerciseContext === "object") ? exerciseContext : {};
  return {
    ...src,
    adminOverrideActive: true,
    allowedActions: [...ADMIN_OVERRIDE_ALLOWED_ACTIONS],
    mutationPolicy: "full"
  };
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
      userMayChangePack: false,
      userMayChangeStep: false,
      packTemplateId: asNonEmptyString(packTemplate?.id),
      packTemplateLabel: asNonEmptyString(packTemplate?.label),
      runProfileId: asNonEmptyString(runProfile?.id),
      runProfileLabel: asNonEmptyString(runProfile?.label),
      controlId: asNonEmptyString(controlContext?.controlId),
      controlLabel: asNonEmptyString(controlContext?.controlLabel),
      scopeType: asNonEmptyString(controlContext?.scopeType),
      targetInstanceLabels: normalizeUniqueStrings(controlContext?.targetInstanceLabels || triggerContext?.targetInstanceLabels || []),
      displayLanguage: normalizeUiLanguage(boardConfig?.displayLanguage)
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
      userMayChangePack: !!boardConfig?.userMayChangePack,
      userMayChangeStep: !!boardConfig?.userMayChangeStep,
      displayLanguage: normalizeUiLanguage(boardConfig?.displayLanguage)
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
    userMayChangePack: !!boardConfig?.userMayChangePack,
    userMayChangeStep: !!boardConfig?.userMayChangeStep,
    displayLanguage: normalizeUiLanguage(boardConfig?.displayLanguage)
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
  systemBlocks.push(buildOutputLanguageBlock(boardConfig?.displayLanguage));

  for (const block of buildCanvasTypePromptBlocks(involvedCanvasTypeIds, templateCatalog)) {
    systemBlocks.push(block);
  }

  const rawExerciseContext = buildExerciseContext({
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

  const connectorPolicyBlock = buildConnectorPolicyBlock({
    involvedCanvasTypeIds,
    exerciseContext: rawExerciseContext,
    currentStep,
    flowStep
  });
  if (connectorPolicyBlock) {
    systemBlocks.push(connectorPolicyBlock);
  }

  const normalizedAdminOverrideText = asNonEmptyString(adminOverrideText);
  const exerciseContext = normalizedAdminOverrideText
    ? applyAdminOverrideToExerciseContext(rawExerciseContext)
    : rawExerciseContext;

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
  if (normalizedAdminOverrideText) {
    systemBlocks.push(buildAdminOverridePromptBlock(normalizedAdminOverrideText));
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
