import {
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack,
  getPackDefaults
} from "../exercises/registry.js?v=20260312-patch11";
import { getPromptModulesByIds } from "../exercises/library.js?v=20260312-patch11";
import { parseTriggerKey } from "../runtime/exercise-engine.js?v=20260312-patch11";
import { normalizeUiLanguage } from "../i18n/index.js?v=20260312-patch11";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = asNonEmptyString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

const KNOWN_EXECUTION_MODES = Object.freeze(["none", "direct_apply", "proposal_only"]);

function normalizeAllowedExecutionModes(values, fallback = ["none"]) {
  const normalized = normalizeUniqueStrings(values).filter((value) => KNOWN_EXECUTION_MODES.includes(value));
  if (normalized.length) return normalized;
  const normalizedFallback = normalizeUniqueStrings(fallback).filter((value) => KNOWN_EXECUTION_MODES.includes(value));
  return normalizedFallback.length ? normalizedFallback : ["none"];
}

function getCanvasTypeDisplayName(templateCatalog, canvasTypeId) {
  const cfg = templateCatalog?.[canvasTypeId] || null;
  return asNonEmptyString(cfg?.displayName) || asNonEmptyString(cfg?.agentLabelPrefix) || canvasTypeId || null;
}

function renderPromptSection(title, body) {
  const normalizedTitle = asNonEmptyString(title);
  const normalizedBody = asNonEmptyString(body);
  if (!normalizedTitle || !normalizedBody) return null;
  return `${normalizedTitle}:\n${normalizedBody}`;
}

function buildCanvasTypePromptBlocks(involvedCanvasTypeIds, templateCatalog) {
  const blocks = [];
  for (const canvasTypeId of normalizeUniqueStrings(involvedCanvasTypeIds)) {
    const cfg = templateCatalog?.[canvasTypeId] || null;
    const promptContext = asNonEmptyString(cfg?.promptContext);
    if (!promptContext) continue;
    blocks.push(`Canvas-Kontext (${getCanvasTypeDisplayName(templateCatalog, canvasTypeId) || canvasTypeId}):\n${promptContext}`);
  }
  return blocks;
}

export function buildOutputLanguageBlock(displayLanguage, { questionMode = false } = {}) {
  const normalizedLanguage = normalizeUiLanguage(displayLanguage);
  const languageLabel = normalizedLanguage === "en" ? "English" : "Deutsch";
  const lines = [
    "Sprachvorgabe für sichtbare Ausgabe:",
    `- Formuliere alle sichtbaren Inhalte in ${languageLabel}.`
  ];
  if (questionMode) {
    lines.push("- Das betrifft insbesondere answer und alle natürlichsprachlichen Rückmeldungen.");
  } else {
    lines.push("- Das betrifft analysis, feedback, answer, evaluation und alle neu erzeugten Sticky-Texte.");
    lines.push("- Technische Felder wie triggerKey, endpointId, stepId, area, targetArea oder instanceLabel bleiben unverändert.");
  }
  return lines.join("\n");
}

function buildBoardMechanicsBlock({ exerciseContext = null } = {}) {
  const allowedActions = normalizeUniqueStrings(exerciseContext?.allowedActions || []);
  const lines = [
    "Board- und Action-Grenzen dieses Laufs:",
    "- Verwende nur Vertragstypen und nur passende Area-Keys aus activeCanvasState/activeCanvasStates.",
    "- sorted_out_left und sorted_out_right sind Off-Canvas-Parkbereiche.",
    "- Nutze color und checked nur dann, wenn der aktuelle Schritt diese Mechaniken wirklich braucht."
  ];
  if (allowedActions.length) {
    lines.splice(1, 0, `- In diesem Run freigegebene Action-Typen: ${allowedActions.join(", ")}.`);
  }
  return lines.join("\n");
}

function buildExecutionModePolicyBlock(exerciseContext = null) {
  const allowedExecutionModes = normalizeAllowedExecutionModes(exerciseContext?.allowedExecutionModes, ["none"]);
  return [
    "Commit-Modus dieses Laufs:",
    `- allowedExecutionModes: ${allowedExecutionModes.join(", ")}`,
    "- none = keine Board-Mutation und actions=[].",
    "- direct_apply = actions sind für direkte Anwendung gedacht.",
    "- proposal_only = actions sind konkrete Vorschläge, werden aber noch nicht angewendet.",
    "- Wähle executionMode nur innerhalb der freigegebenen allowedExecutionModes."
  ].join("\n");
}

function buildReadableAreaNamingBlock() {
  return [
    "Sichtbare Benennung von Canvas-Bereichen:",
    "- Verwende in sichtbaren Antworten niemals rohe Area-Keys wie 2_user_and_situation oder 6a_information.",
    "- Nutze stattdessen die sichtbaren Titel der Bereiche.",
    "- sorted_out_left und sorted_out_right dürfen sichtbar als Sorted-out links bzw. Sorted-out rechts bezeichnet werden."
  ].join("\n");
}

function normalizePendingProposalForPrompt(value) {
  if (!value || typeof value !== "object") return null;
  return {
    status: asNonEmptyString(value.status) || null,
    stepId: asNonEmptyString(value.stepId) || null,
    createdAt: asNonEmptyString(value.createdAt) || null,
    summary: asNonEmptyString(value.summary) || asNonEmptyString(value.feedback?.summary) || asNonEmptyString(value.analysis) || null,
    actionPreview: Array.isArray(value.actionPreview)
      ? value.actionPreview.map(asNonEmptyString).filter(Boolean).slice(0, 8)
      : []
  };
}

function buildProposalModeBlock({ pendingProposal = null } = {}) {
  const proposal = normalizePendingProposalForPrompt(pendingProposal);
  if (!proposal) return null;
  const lines = [
    "Hinweis zu einem bereits vorliegenden Vorschlag:",
    "- Im Payload kann ein pendingProposal enthalten sein. Dieser Vorschlag ist noch NICHT angewendet.",
    "- Wenn du dich auf pendingProposal beziehst, sprich klar von einem Vorschlag und nicht von bereits vollzogener Arbeit."
  ];
  if (proposal.summary) lines.push(`- Zusammenfassung des offenen Vorschlags: ${proposal.summary}`);
  if (proposal.actionPreview.length) lines.push(`- Vorschlagsvorschau: ${proposal.actionPreview.join(" | ")}`);
  return lines.join("\n");
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
  const normalized = asNonEmptyString(adminOverrideText);
  if (!normalized) return null;
  return `Admin-Override (höchste Priorität):\n${normalized}`;
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

function buildControlContextBlock(controlContext) {
  if (!controlContext || typeof controlContext !== "object") return null;
  const lines = [];
  if (asNonEmptyString(controlContext.controlLabel) || asNonEmptyString(controlContext.controlId)) {
    lines.push(`Flow-Control: ${asNonEmptyString(controlContext.controlLabel) || controlContext.controlId}`);
  }
  if (asNonEmptyString(controlContext.scopeType)) {
    lines.push(`Flow-Scope: ${controlContext.scopeType}`);
  }
  if (asNonEmptyString(controlContext.anchorInstanceId)) {
    lines.push(`Flow-Anchor: ${controlContext.anchorInstanceId}`);
  }
  return lines.length ? lines.join("\n") : null;
}

function resolvePromptModules(promptModules, moduleIds = [], lang = "de") {
  const explicitModules = Array.isArray(promptModules) ? promptModules : [];
  if (!moduleIds.length) return explicitModules.filter(Boolean);
  const byId = new Map(explicitModules.filter(Boolean).map((module) => [module.id, module]));
  const resolved = getPromptModulesByIds(moduleIds, { lang });
  for (const module of resolved) byId.set(module.id, module);
  return Array.from(byId.values());
}

function moduleBlocks(modules) {
  return (Array.isArray(modules) ? modules : [])
    .map((module) => renderPromptSection(module.label || module.id, asNonEmptyString(module.text) || asNonEmptyString(module.summary)))
    .filter(Boolean)
    .join("\n\n");
}

export function buildDidacticEndpointPromptBundle({
  exercisePack,
  currentStep,
  endpoint,
  promptModules,
  lang = "de"
}) {
  const parts = [];
  if (exercisePack?.globalPrompt) parts.push(renderPromptSection("METHOD", exercisePack.globalPrompt));
  if (exercisePack?.didacticGlobalPrompt) parts.push(renderPromptSection("DIDACTIC CONTEXT", exercisePack.didacticGlobalPrompt));
  if (currentStep?.label || currentStep?.summary) {
    parts.push(renderPromptSection("CURRENT STEP", [currentStep?.label, currentStep?.summary].filter(Boolean).join("\n\n")));
  }
  if (currentStep?.visibleInstruction) parts.push(renderPromptSection("VISIBLE STEP INSTRUCTION", currentStep.visibleInstruction));
  if (currentStep?.flowInstruction) parts.push(renderPromptSection("FLOW INSTRUCTION", currentStep.flowInstruction));
  if (currentStep?.stateModelText) parts.push(renderPromptSection("STEP STATE MODEL", currentStep.stateModelText));
  if (currentStep?.exitCriteriaText) parts.push(renderPromptSection("EXIT CRITERIA", currentStep.exitCriteriaText));
  if (endpoint?.prompt?.text) parts.push(renderPromptSection("ENDPOINT TASK", endpoint.prompt.text));
  const modulesText = moduleBlocks(resolvePromptModules(promptModules, endpoint?.prompt?.moduleIds || [], lang));
  if (modulesText) parts.push(renderPromptSection("ENDPOINT MODULES", modulesText));
  return parts.filter(Boolean).join("\n\n");
}

export function buildDidacticQuestionPromptBundle({
  exercisePack,
  currentStep,
  promptModules,
  lang = "de"
}) {
  const parts = [];
  if (exercisePack?.globalPrompt) parts.push(renderPromptSection("METHOD", exercisePack.globalPrompt));
  if (exercisePack?.didacticGlobalPrompt) parts.push(renderPromptSection("DIDACTIC CONTEXT", exercisePack.didacticGlobalPrompt));
  if (currentStep?.label || currentStep?.summary) {
    parts.push(renderPromptSection("CURRENT STEP", [currentStep?.label, currentStep?.summary].filter(Boolean).join("\n\n")));
  }
  if (currentStep?.visibleInstruction) parts.push(renderPromptSection("STEP INSTRUCTION", currentStep.visibleInstruction));
  if (currentStep?.flowInstruction) parts.push(renderPromptSection("FLOW INSTRUCTION", currentStep.flowInstruction));
  const modulesText = moduleBlocks(resolvePromptModules(promptModules, currentStep?.questionModuleIds || [], lang));
  if (modulesText) parts.push(renderPromptSection("QUESTION MODULES", modulesText));
  return parts.filter(Boolean).join("\n\n");
}

function buildExerciseContext({
  boardConfig = null,
  exercisePack = null,
  currentStep = null,
  endpoint = null,
  controlContext = null,
  triggerContext = null,
  templateCatalog = null,
  questionMode = false
} = {}) {
  const boardMode = exercisePack?.id ? "exercise" : (boardConfig?.mode || "generic");
  const parsed = triggerContext?.triggerKey ? parseTriggerKey(triggerContext.triggerKey) : null;
  const packDefaults = exercisePack ? getPackDefaults(exercisePack) : { feedbackChannel: boardConfig?.defaultFeedbackTarget || null };
  const allowedCanvasTypeIds = exercisePack
    ? getAllowedCanvasTypesForPack(exercisePack).map((canvasTypeId) => ({
        canvasTypeId,
        displayName: getCanvasTypeDisplayName(templateCatalog, canvasTypeId) || canvasTypeId
      }))
    : [];
  const defaultCanvasTypeId = asNonEmptyString(boardConfig?.defaultCanvasTypeId) || (exercisePack ? getDefaultCanvasTypeIdForPack(exercisePack) : null);
  return {
    boardMode,
    mode: questionMode ? "question" : "endpoint",
    exercisePackId: asNonEmptyString(exercisePack?.id),
    exercisePackLabel: asNonEmptyString(exercisePack?.label),
    defaultCanvasTypeId: defaultCanvasTypeId || null,
    defaultCanvasTypeLabel: getCanvasTypeDisplayName(templateCatalog, defaultCanvasTypeId),
    allowedCanvasTypeIds,
    currentStepId: asNonEmptyString(currentStep?.id),
    currentStepLabel: asNonEmptyString(currentStep?.label),
    visibleInstruction: asNonEmptyString(currentStep?.visibleInstruction),
    flowInstruction: asNonEmptyString(currentStep?.flowInstruction),
    allowedActions: normalizeUniqueStrings(endpoint?.run?.allowedActions),
    allowedExecutionModes: normalizeAllowedExecutionModes(endpoint?.run?.allowedExecutionModes || triggerContext?.allowedExecutionModes || ["none"]),
    triggerKey: asNonEmptyString(triggerContext?.triggerKey) || asNonEmptyString(endpoint?.triggerKey) || null,
    triggerSource: asNonEmptyString(triggerContext?.triggerSource || triggerContext?.source) || "system",
    triggerScope: parsed?.scope || endpoint?.scope?.mode || null,
    triggerIntent: parsed?.intent || null,
    mutationPolicy: asNonEmptyString(endpoint?.run?.mutationPolicy || triggerContext?.mutationPolicy) || null,
    feedbackPolicy: asNonEmptyString(endpoint?.run?.feedbackPolicy || triggerContext?.feedbackPolicy) || asNonEmptyString(packDefaults.feedbackChannel) || asNonEmptyString(boardConfig?.defaultFeedbackTarget) || null,
    requiresSelection: endpoint?.scope?.mode === "selection" || triggerContext?.requiresSelection === true,
    endpointId: asNonEmptyString(endpoint?.id),
    endpointLabel: asNonEmptyString(endpoint?.label),
    controlId: asNonEmptyString(controlContext?.controlId),
    controlLabel: asNonEmptyString(controlContext?.controlLabel),
    scopeType: asNonEmptyString(controlContext?.scopeType || endpoint?.scope?.mode),
    targetInstanceLabels: normalizeUniqueStrings(controlContext?.targetInstanceLabels || triggerContext?.targetInstanceLabels || []),
    userMayChangePack: !!boardConfig?.userMayChangePack,
    userMayChangeStep: !!boardConfig?.userMayChangeStep,
    displayLanguage: normalizeUiLanguage(boardConfig?.lang)
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
  endpoint = null,
  promptModules = [],
  controlContext = null,
  adminOverrideText = null,
  questionMode = false
} = {}) {
  const payloadBase = (baseUserPayload && typeof baseUserPayload === "object") ? baseUserPayload : {};
  const normalizedAdminOverrideText = asNonEmptyString(adminOverrideText);
  const rawExerciseContext = buildExerciseContext({
    boardConfig,
    exercisePack,
    currentStep,
    endpoint,
    controlContext,
    triggerContext,
    templateCatalog,
    questionMode
  });
  const exerciseContext = normalizedAdminOverrideText
    ? applyAdminOverrideToExerciseContext(rawExerciseContext)
    : rawExerciseContext;

  const systemBlocks = [];
  if (asNonEmptyString(baseSystemPrompt)) systemBlocks.push(String(baseSystemPrompt).trim());
  systemBlocks.push(buildOutputLanguageBlock(boardConfig?.lang, { questionMode }));
  for (const block of buildCanvasTypePromptBlocks(involvedCanvasTypeIds, templateCatalog)) systemBlocks.push(block);
  systemBlocks.push(buildBoardMechanicsBlock({ exerciseContext }));
  systemBlocks.push(buildExecutionModePolicyBlock(exerciseContext));
  systemBlocks.push(buildReadableAreaNamingBlock());

  if (questionMode) {
    systemBlocks.push(buildDidacticQuestionPromptBundle({ exercisePack, currentStep, promptModules, lang: boardConfig?.lang || "de" }));
  } else {
    systemBlocks.push(buildDidacticEndpointPromptBundle({ exercisePack, currentStep, endpoint, promptModules, lang: boardConfig?.lang || "de" }));
  }

  const proposalModeBlock = buildProposalModeBlock({ pendingProposal: payloadBase.pendingProposal });
  if (proposalModeBlock) systemBlocks.push(proposalModeBlock);
  const controlBlock = buildControlContextBlock(controlContext);
  if (controlBlock) systemBlocks.push(controlBlock);
  const adminOverrideBlock = buildAdminOverridePromptBlock(normalizedAdminOverrideText);
  if (adminOverrideBlock) systemBlocks.push(adminOverrideBlock);

  return {
    systemPrompt: systemBlocks.filter(Boolean).join("\n\n---\n\n"),
    exerciseContext,
    userPayload: {
      ...payloadBase,
      runMode: asNonEmptyString(runMode) || null,
      userQuestion: asNonEmptyString(userQuestion) || null,
      exerciseContext
    }
  };
}
