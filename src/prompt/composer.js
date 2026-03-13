import {
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack
} from "../exercises/registry.js?v=20260312-patch11";
import { getPromptModulesByIds } from "../exercises/library.js?v=20260312-patch11";
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

function buildSystemPromptBlock(options = {}) {
  const normalized = asNonEmptyString(options.systemPrompt)
    || asNonEmptyString(options.baseSystemPrompt)
    || null;
  return normalized;
}

export function buildOutputLanguageBlock(displayLanguage) {
  const normalizedLanguage = normalizeUiLanguage(displayLanguage);
  const languageLabel = normalizedLanguage === "en" ? "English" : "Deutsch";
  return [
    "Sprachvorgabe für sichtbare Ausgabe:",
    `- Formuliere alle sichtbaren Inhalte in ${languageLabel}.`,
    "- Das betrifft analysis, feedback, evaluation und alle neu erzeugten Sticky-Texte.",
    "- Technische Felder wie endpointId, stepId, area, targetArea oder instanceLabel bleiben unverändert."
  ].join("\n");
}

function buildLanguagePromptBlock(runtime, options = {}) {
  const lang = asNonEmptyString(options.lang)
    || asNonEmptyString(options.displayLanguage)
    || asNonEmptyString(runtime?.displayLanguage)
    || "de";
  return buildOutputLanguageBlock(lang);
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

function buildCanvasWorldModelBlock(runtime, options = {}) {
  const exercisePack = runtime?.exercisePack || null;
  const templateCatalog = options.templateCatalog || null;
  const involvedCanvasTypeIds = normalizeUniqueStrings(
    options.involvedCanvasTypeIds
      || options.allowedCanvasTypeIds
      || (exercisePack ? getAllowedCanvasTypesForPack(exercisePack) : [])
  );
  const defaultCanvasTypeId = asNonEmptyString(options.defaultCanvasTypeId)
    || (exercisePack ? getDefaultCanvasTypeIdForPack(exercisePack) : null)
    || null;

  const lines = [];
  if (defaultCanvasTypeId) {
    lines.push(`Default Canvas-Typ: ${getCanvasTypeDisplayName(templateCatalog, defaultCanvasTypeId) || defaultCanvasTypeId}`);
  }
  if (involvedCanvasTypeIds.length) {
    lines.push(`Erlaubte bzw. relevante Canvas-Typen: ${involvedCanvasTypeIds
      .map((canvasTypeId) => getCanvasTypeDisplayName(templateCatalog, canvasTypeId) || canvasTypeId)
      .join(", ")}`);
  }

  const typeBlocks = buildCanvasTypePromptBlocks(involvedCanvasTypeIds, templateCatalog);
  if (!lines.length && !typeBlocks.length) return null;

  const parts = [];
  if (lines.length) parts.push(lines.join("\n"));
  if (typeBlocks.length) parts.push(typeBlocks.join("\n\n"));
  return renderPromptSection("CANVAS WORLD MODEL", parts.join("\n\n"));
}

function buildBoardMechanicsBlock(runtime, options = {}) {
  const endpointContext = (options.endpointContext && typeof options.endpointContext === "object")
    ? options.endpointContext
    : null;
  const allowedActions = normalizeUniqueStrings(
    endpointContext?.allowedActions || runtime?.endpoint?.run?.allowedActions || []
  );
  const allowedExecutionModes = normalizeAllowedExecutionModes(
    endpointContext?.allowedExecutionModes || runtime?.endpoint?.run?.allowedExecutionModes || ["none"]
  );
  const mutationPolicy = asNonEmptyString(
    endpointContext?.mutationPolicy || runtime?.endpoint?.run?.mutationPolicy
  );
  const feedbackPolicy = asNonEmptyString(
    endpointContext?.feedbackPolicy || runtime?.endpoint?.run?.feedbackPolicy
  );
  const scopeType = asNonEmptyString(
    endpointContext?.scope?.mode || runtime?.endpoint?.scope?.mode || runtime?.controlContext?.scopeType
  );

  const lines = [
    "Board- und Action-Grenzen dieses Laufs:",
    "- Verwende nur Vertragstypen und nur passende Area-Keys aus activeCanvasState/activeCanvasStates.",
    "- sorted_out_left und sorted_out_right sind Off-Canvas-Parkbereiche.",
    "- Nutze color und checked nur dann, wenn der aktuelle Endpoint diese Mechaniken wirklich braucht.",
    "- Verwende in sichtbaren Antworten niemals rohe Area-Keys wie 2_user_and_situation oder 6a_information, sondern deren sichtbare Titel.",
    `- allowedExecutionModes: ${allowedExecutionModes.join(", ")}`,
    "- none = keine Board-Mutation und actions=[].",
    "- direct_apply = actions sind für direkte Anwendung gedacht.",
    "- proposal_only = actions sind konkrete Vorschläge, werden aber noch nicht angewendet.",
    "- Wähle executionMode nur innerhalb der freigegebenen allowedExecutionModes."
  ];

  if (scopeType) lines.splice(1, 0, `- Scope dieses Endpoints: ${scopeType}.`);
  if (allowedActions.length) lines.splice(1, 0, `- In diesem Run freigegebene Action-Typen: ${allowedActions.join(", ")}.`);
  if (mutationPolicy) lines.splice(1, 0, `- mutationPolicy: ${mutationPolicy}.`);
  if (feedbackPolicy) lines.splice(1, 0, `- feedbackPolicy: ${feedbackPolicy}.`);

  return lines.join("\n");
}

function normalizePendingProposalForPrompt(value) {
  if (!value || typeof value !== "object") return null;
  return {
    status: asNonEmptyString(value.status) || null,
    stepId: asNonEmptyString(value.stepId) || null,
    createdAt: asNonEmptyString(value.createdAt) || null,
    summary: asNonEmptyString(value.summary)
      || asNonEmptyString(value.feedback?.summary)
      || asNonEmptyString(value.analysis)
      || null,
    actionPreview: Array.isArray(value.actionPreview)
      ? value.actionPreview.map(asNonEmptyString).filter(Boolean).slice(0, 8)
      : []
  };
}

function buildPendingProposalBlock(pendingProposal = null) {
  const proposal = normalizePendingProposalForPrompt(pendingProposal);
  if (!proposal) return null;
  const lines = [
    "Hinweis zu einem bereits vorliegenden Vorschlag:",
    "- Im Payload kann ein pendingProposal enthalten sein. Dieser Vorschlag ist noch NICHT angewendet.",
    "- Wenn du dich auf pendingProposal beziehst, sprich klar von einem Vorschlag und nicht von bereits vollzogener Arbeit."
  ];
  if (proposal.status) lines.push(`- Status: ${proposal.status}`);
  if (proposal.stepId) lines.push(`- Schrittbezug: ${proposal.stepId}`);
  if (proposal.createdAt) lines.push(`- Erstellt am: ${proposal.createdAt}`);
  if (proposal.summary) lines.push(`- Zusammenfassung des offenen Vorschlags: ${proposal.summary}`);
  if (proposal.actionPreview.length) lines.push(`- Vorschlagsvorschau: ${proposal.actionPreview.join(" | ")}`);
  return lines.join("\n");
}

function buildAdminOverrideBlock(adminOverrideText) {
  const normalized = asNonEmptyString(adminOverrideText);
  if (!normalized) return null;
  return `Admin-Override (höchste Priorität):\n${normalized}`;
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
  if (endpoint?.label || endpoint?.summary) {
    parts.push(renderPromptSection("CURRENT ENDPOINT", [endpoint?.label, endpoint?.summary].filter(Boolean).join("\n\n")));
  }
  if (endpoint?.prompt?.text) parts.push(renderPromptSection("ENDPOINT TASK", endpoint.prompt.text));
  const modulesText = moduleBlocks(resolvePromptModules(promptModules, endpoint?.prompt?.moduleIds || [], lang));
  if (modulesText) parts.push(renderPromptSection("ENDPOINT MODULES", modulesText));
  return parts.filter(Boolean).join("\n\n");
}

export function composePrompt(runtime, options = {}) {
  if (!runtime?.endpoint) {
    throw new Error("composePrompt requires a canonical endpoint");
  }

  const sharedBlocks = [
    buildSystemPromptBlock(options),
    buildLanguagePromptBlock(runtime, options),
    buildCanvasWorldModelBlock(runtime, options),
    buildBoardMechanicsBlock(runtime, options),
    buildPendingProposalBlock(runtime.pendingProposal),
    buildControlContextBlock(runtime.controlContext),
    buildAdminOverrideBlock(runtime.adminOverride)
  ].filter(Boolean);

  const didacticBlock = buildDidacticEndpointPromptBundle({
    exercisePack: runtime.exercisePack,
    currentStep: runtime.currentStep,
    endpoint: runtime.endpoint,
    promptModules: runtime.promptModules,
    lang: options.lang || "de"
  });

  return [...sharedBlocks, didacticBlock].filter(Boolean).join("\n\n");
}
