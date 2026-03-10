import {
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  getPackDefaults,
  getStepTriggerConfig
} from "../exercises/registry.js?v=20260312-batch10prompt1";
import { getPromptModulesByIds } from "../exercises/library.js?v=20260312-batch10prompt1";
import { parseTriggerKey } from "../runtime/exercise-engine.js?v=20260309-batch91hotfix1";
import { normalizeUiLanguage } from "../i18n/index.js?v=20260309-batch91hotfix1";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

const KNOWN_EXECUTION_MODES = Object.freeze(["none", "direct_apply", "proposal_only"]);

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

function normalizeAllowedExecutionModes(values, fallback = ["none"]) {
  const allowed = normalizeUniqueStrings(values).filter((value) => KNOWN_EXECUTION_MODES.includes(value));
  if (allowed.length) return allowed;
  const normalizedFallback = normalizeUniqueStrings(fallback).filter((value) => KNOWN_EXECUTION_MODES.includes(value));
  return normalizedFallback.length ? normalizedFallback : ["none"];
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

function buildBoardMechanicsBlock({ exerciseContext = null } = {}) {
  const allowedActions = normalizeUniqueStrings(exerciseContext?.allowedActions || []);
  const hasAllowedActionsArray = Array.isArray(exerciseContext?.allowedActions);
  const lines = [
    "Board- und Action-Grenzen dieses Laufs:",
    "- Verwende nur Vertragstypen und nur passende Area-Keys aus activeCanvasState/activeCanvasStates.",
    "- sorted_out_left und sorted_out_right sind Off-Canvas-Parkbereiche.",
    "- Nutze color und checked nur dann, wenn der aktuelle Schritt diese Mechaniken wirklich braucht."
  ];

  if (hasAllowedActionsArray && allowedActions.length) {
    lines.splice(1, 0, `- In diesem Run freigegebene Action-Typen: ${allowedActions.join(", ")}.`);
    if (!allowedActions.includes("create_connector")) {
      lines.push("- create_connector ist in diesem Run nicht freigegeben.");
    }
    if (!allowedActions.includes("set_sticky_color")) {
      lines.push("- set_sticky_color ist in diesem Run nicht freigegeben.");
    }
    if (!allowedActions.includes("set_check_status")) {
      lines.push("- set_check_status ist in diesem Run nicht freigegeben.");
    }
  }

  return lines.join("\n");
}

function buildExecutionModePolicyBlock(exerciseContext = null) {
  const allowedExecutionModes = normalizeAllowedExecutionModes(exerciseContext?.allowedExecutionModes, ["none"]);
  const lines = [
    "Commit-Modus dieses Laufs:",
    `- allowedExecutionModes: ${allowedExecutionModes.join(", ")}`,
    "- none = keine Board-Mutation und actions=[].",
    "- direct_apply = actions sind für direkte Anwendung gedacht.",
    "- proposal_only = actions sind konkrete Vorschläge, werden aber noch nicht angewendet.",
    "- Wähle executionMode nur innerhalb der freigegebenen allowedExecutionModes."
  ];

  if (allowedExecutionModes.length === 1) {
    lines.push(`- Dieser Run ist auf ${allowedExecutionModes[0]} festgelegt.`);
  }

  return lines.join("\n");
}
function normalizePendingProposalForPrompt(value) {
  if (!value || typeof value !== "object") return null;
  const status = asNonEmptyString(value.status) || null;
  const stepId = asNonEmptyString(value.stepId) || null;
  const createdAt = asNonEmptyString(value.createdAt) || null;
  const summary = asNonEmptyString(value.summary)
    || asNonEmptyString(value.feedback?.summary)
    || asNonEmptyString(value.analysis)
    || null;
  const actionPreview = Array.isArray(value.actionPreview)
    ? value.actionPreview.map(asNonEmptyString).filter(Boolean).slice(0, 8)
    : [];

  return {
    status,
    stepId,
    createdAt,
    summary,
    actionPreview
  };
}

function buildReadableAreaNamingBlock() {
  return [
    "Sichtbare Benennung von Canvas-Bereichen:",
    "- Verwende in sichtbaren Antworten niemals rohe Area-Keys wie 2_user_and_situation oder 6a_information.",
    "- Nutze stattdessen die sichtbaren Titel der Bereiche, z. B. Header, User & Situation, Objectives & Results, Decisions & Actions, User Gains, User Pains, Solutions, Information, Functions, Benefits oder Check.",
    "- sorted_out_left und sorted_out_right dürfen sichtbar als Sorted-out links bzw. Sorted-out rechts bezeichnet werden."
  ].join("\n");
}

function buildProposalModeBlock({ exerciseContext = null, pendingProposal = null, questionMode = false } = {}) {
  const lines = [];
  const normalizedPendingProposal = normalizePendingProposalForPrompt(pendingProposal);

  if (normalizedPendingProposal) {
    lines.push("Hinweis zu einem bereits vorliegenden Vorschlag:");
    lines.push("- Im Payload kann ein pendingProposal enthalten sein. Dieser Vorschlag ist noch NICHT angewendet und gehört nicht automatisch zum echten Boardzustand.");
    lines.push("- Wenn du dich auf pendingProposal beziehst, sprich klar von einem Vorschlag oder einer vorgeschlagenen Änderung, nicht von bereits vollzogener Arbeit.");
    if (normalizedPendingProposal.summary) {
      lines.push(`- Zusammenfassung des offenen Vorschlags: ${normalizedPendingProposal.summary}`);
    }
    if (normalizedPendingProposal.actionPreview.length) {
      lines.push(`- Vorschlagsvorschau: ${normalizedPendingProposal.actionPreview.join(" | ")}`);
    }
  }

  return lines.length ? lines.join("\n") : null;
}

const ADMIN_OVERRIDE_ALLOWED_ACTIONS = Object.freeze([
  "create_sticky",
  "move_sticky",
  "delete_sticky",
  "create_connector",
  "set_sticky_color",
  "set_check_status",
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
    allowedExecutionModes: ["none", "direct_apply", "proposal_only"],
    mutationPolicy: "full"
  };
}

function applyAdminOverrideToTriggerContext(triggerContext) {
  const src = (triggerContext && typeof triggerContext === "object") ? triggerContext : {};
  return {
    ...src,
    mutationPolicy: "full",
    allowedExecutionModes: ["none", "direct_apply", "proposal_only"]
  };
}

function buildCanvasTypePromptBlocks(involvedCanvasTypeIds, templateCatalog) {
  const blocks = [];

  for (const canvasTypeId of normalizeUniqueStrings(involvedCanvasTypeIds)) {
    const cfg = templateCatalog?.[canvasTypeId] || null;
    const promptContext = asNonEmptyString(cfg?.promptContext);
    if (!promptContext) continue;

    const displayName = getCanvasTypeDisplayName(templateCatalog, canvasTypeId) || canvasTypeId;
    blocks.push(`Canvas-Weltmodell (${displayName}):
${promptContext}`);
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
  if (Array.isArray(triggerContext?.allowedExecutionModes) && triggerContext.allowedExecutionModes.length) lines.push(`- allowedExecutionModes: ${triggerContext.allowedExecutionModes.join(", ")}`);

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
  return `Pack-Workflow (${packTemplate?.label || packTemplate?.id || "Pack"}):
${prompt}`;
}

function buildExerciseStepPromptBlock(step) {
  if (!step || typeof step !== "object") return null;
  const lines = [];
  const instruction = asNonEmptyString(step?.visibleInstruction);
  if (instruction) lines.push(`- sichtbareInstruktion: ${instruction}`);
  if (!lines.length) return null;
  return `Schritt-Kontext (${step?.label || step?.id || "aktueller Schritt"}):
${lines.join("\n")}`;
}

function buildFlowStepPromptBlock(flowStep) {
  if (!flowStep || typeof flowStep !== "object") return null;
  const lines = [];
  const instruction = asNonEmptyString(flowStep?.instructionOverride) || asNonEmptyString(flowStep?.instruction);
  const summary = asNonEmptyString(flowStep?.summary);
  if (instruction) lines.push(`- sichtbareInstruktion: ${instruction}`);
  if (summary) lines.push(`- stepSummary: ${summary}`);
  if (!lines.length) return null;
  return `Schritt-Kontext (${flowStep?.label || flowStep?.id || "aktueller Schritt"}):
${lines.join("\n")}`;
}

function buildTriggerPromptBlock({ triggerPrompt = null, triggerKey = null, label = null } = {}) {
  const prompt = asNonEmptyString(triggerPrompt);
  if (!prompt) return null;
  const titleParts = [asNonEmptyString(triggerKey), asNonEmptyString(label)].filter(Boolean);
  const title = titleParts.length ? titleParts.join(" · ") : "aktueller Trigger";
  return `Trigger-Kontext (${title}):
${prompt}`;
}

function getPromptModulePriority(module) {
  const id = asNonEmptyString(module?.id) || "";
  if (id.includes('.shared.method_guardrails')) return 10;
  if (/\.focus_/.test(id)) return 20;
  if (/\.state_model$/.test(id)) return 30;
  if (/\.exit_criteria$/.test(id)) return 40;
  if (/\.trigger_behavior$/.test(id)) return 50;
  if (/\.proposal_/.test(id) || /\.bootstrap_/.test(id) || /\.diverge_/.test(id) || /\.attach_/.test(id) || /\.choose_/.test(id) || /\.prune_/.test(id) || /\.question_/.test(id) || /focus_cross_instance_review/.test(id)) return 60;
  if (id.includes('.shared.sorted_out_semantics') || id.includes('.shared.validation_and_color_semantics') || id.includes('.shared.soft_reference_hints') || id.includes('.shared.no_handoff_boundary')) return 70;
  if (id.includes('.shared.feedback_contract')) return 80;
  if (id.includes('.shared.step_status_rules')) return 85;
  if (id.includes('.shared.hint_style') || id.includes('.shared.coach_style') || id.includes('.shared.check_style') || id.includes('.shared.review_style') || id.includes('.shared.synthesis_style') || id.includes('.shared.question_style')) return 90;
  return 75;
}

function buildPromptModuleBlocks(promptModules) {
  return (Array.isArray(promptModules) ? promptModules : [])
    .slice()
    .sort((a, b) => getPromptModulePriority(a) - getPromptModulePriority(b) || String(a?.label || a?.id || '').localeCompare(String(b?.label || b?.id || ''), undefined, { sensitivity: 'base' }))
    .map((module) => {
      const prompt = asNonEmptyString(module?.prompt);
      if (!prompt) return null;
      const title = asNonEmptyString(module?.label) || asNonEmptyString(module?.id) || "Promptblock";
      return `${title}:
${prompt}`;
    })
    .filter(Boolean);
}

function mergePromptModules(...collections) {
  const result = [];
  const seen = new Set();

  for (const collection of collections) {
    for (const module of Array.isArray(collection) ? collection : []) {
      if (!module || typeof module !== "object") continue;
      const moduleId = asNonEmptyString(module?.id) || `__prompt__:${asNonEmptyString(module?.prompt) || result.length}`;
      if (seen.has(moduleId)) continue;
      seen.add(moduleId);
      result.push(module);
    }
  }

  return result;
}

function resolveStepTriggerPromptModules(currentStep, triggerContext, displayLanguage) {
  const stepTriggerConfig = currentStep && triggerContext
    ? getStepTriggerConfig(currentStep, triggerContext.triggerKey)
    : null;
  return getPromptModulesByIds(stepTriggerConfig?.moduleIds || [], {
    lang: displayLanguage
  });
}

function resolveStepTriggerPromptText(currentStep, triggerContext) {
  const stepTriggerConfig = currentStep && triggerContext
    ? getStepTriggerConfig(currentStep, triggerContext.triggerKey)
    : null;
  return asNonEmptyString(stepTriggerConfig?.prompt);
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
  return `Control-Kontext:
${lines.join("\n")}`;
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
      allowedExecutionModes: normalizeAllowedExecutionModes(triggerContext?.allowedExecutionModes || runProfile?.allowedExecutionModes || ["none"]),
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
      allowedExecutionModes: normalizeAllowedExecutionModes(triggerContext?.allowedExecutionModes || ["none"]),
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
    allowedExecutionModes: normalizeAllowedExecutionModes(triggerContext?.allowedExecutionModes || ["none"]),
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
  controlContext = null,
  questionMode = false
} = {}) {
  const payloadBase = (baseUserPayload && typeof baseUserPayload === "object") ? baseUserPayload : {};
  const pendingProposal = normalizePendingProposalForPrompt(payloadBase.pendingProposal);
  const systemBlocks = [];
  const explicitPromptModules = Array.isArray(promptModules) ? promptModules : [];
  const hasFlowContext = !!(packTemplate || runProfile || flowStep || controlContext);
  const normalizedAdminOverrideText = asNonEmptyString(adminOverrideText);
  const effectiveTriggerContext = normalizedAdminOverrideText
    ? applyAdminOverrideToTriggerContext(triggerContext)
    : triggerContext;

  if (asNonEmptyString(baseSystemPrompt)) {
    systemBlocks.push(String(baseSystemPrompt).trim());
  }

  systemBlocks.push(buildOutputLanguageBlock(boardConfig?.displayLanguage, { questionMode }));

  for (const block of buildCanvasTypePromptBlocks(involvedCanvasTypeIds, templateCatalog)) {
    systemBlocks.push(block);
  }

  const rawExerciseContext = buildExerciseContext({
    boardConfig,
    exercisePack,
    currentStep,
    triggerContext: effectiveTriggerContext,
    templateCatalog,
    packTemplate,
    flowStep,
    runProfile,
    controlContext
  });

  const exerciseContext = normalizedAdminOverrideText
    ? applyAdminOverrideToExerciseContext(rawExerciseContext)
    : rawExerciseContext;

  if (hasFlowContext) {
    const packBlock = buildPackTemplatePromptBlock(packTemplate);
    if (packBlock) systemBlocks.push(packBlock);
  } else {
    const exerciseGlobalPrompt = asNonEmptyString(exercisePack?.globalPrompt);
    if (exerciseGlobalPrompt) {
      systemBlocks.push(`Pack-Workflow (${exercisePack.label || exercisePack.id}):
${exerciseGlobalPrompt}`);
    }
  }

  systemBlocks.push(buildModePromptBlock(runMode, effectiveTriggerContext));
  systemBlocks.push(buildReadableAreaNamingBlock());

  const boardMechanicsBlock = buildBoardMechanicsBlock({
    exerciseContext
  });
  if (boardMechanicsBlock) {
    systemBlocks.push(boardMechanicsBlock);
  }

  const executionModePolicyBlock = buildExecutionModePolicyBlock(exerciseContext);
  if (executionModePolicyBlock) {
    systemBlocks.push(executionModePolicyBlock);
  }

  if (hasFlowContext) {
    const stepBlock = buildFlowStepPromptBlock(flowStep);
    if (stepBlock) systemBlocks.push(stepBlock);

    const flowTriggerPromptBlock = buildTriggerPromptBlock({
      triggerPrompt: runProfile?.triggerPrompt,
      triggerKey: runProfile?.triggerKey || effectiveTriggerContext?.triggerKey,
      label: runProfile?.label || flowStep?.label
    });
    if (flowTriggerPromptBlock) systemBlocks.push(flowTriggerPromptBlock);

    const combinedPromptModules = mergePromptModules(explicitPromptModules);
    for (const block of buildPromptModuleBlocks(combinedPromptModules)) {
      systemBlocks.push(block);
    }

    const proposalModeBlock = buildProposalModeBlock({
      exerciseContext,
      pendingProposal,
      questionMode
    });
    if (proposalModeBlock) systemBlocks.push(proposalModeBlock);

    const controlBlock = buildControlContextBlock(controlContext);
    if (controlBlock) systemBlocks.push(controlBlock);
  } else {
    const stepBlock = buildExerciseStepPromptBlock(currentStep);
    if (stepBlock) systemBlocks.push(stepBlock);

    const stepTriggerPrompt = resolveStepTriggerPromptText(currentStep, effectiveTriggerContext);
    const stepTriggerPromptBlock = buildTriggerPromptBlock({
      triggerPrompt: stepTriggerPrompt,
      triggerKey: effectiveTriggerContext?.triggerKey,
      label: currentStep?.label
    });
    if (stepTriggerPromptBlock) systemBlocks.push(stepTriggerPromptBlock);

    const stepTriggerPromptModules = resolveStepTriggerPromptModules(
      currentStep,
      effectiveTriggerContext,
      boardConfig?.displayLanguage
    );
    const combinedPromptModules = mergePromptModules(explicitPromptModules, stepTriggerPromptModules);

    for (const block of buildPromptModuleBlocks(combinedPromptModules)) {
      systemBlocks.push(block);
    }

    const proposalModeBlock = buildProposalModeBlock({
      exerciseContext,
      pendingProposal,
      questionMode
    });
    if (proposalModeBlock) systemBlocks.push(proposalModeBlock);
  }

  if (normalizedAdminOverrideText) {
    systemBlocks.push(buildAdminOverridePromptBlock(normalizedAdminOverrideText));
  }

  const systemPrompt = systemBlocks.filter(Boolean).join("\n\n---\n\n");

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
