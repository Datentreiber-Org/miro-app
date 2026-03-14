import {
  getAllowedCanvasTypesForPack,
  getDefaultCanvasTypeIdForPack
} from "../exercises/registry.js?v=20260314-patch12-pb2";
import { normalizeUiLanguage } from "../i18n/index.js?v=20260313-patch11-chatpatch1";

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
    "- Verwende nur Vertragstypen und nur passende Area-Keys aus activeCanvasStates.",
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

function buildEndpointSpecificationBlock({ endpoint }) {
  const promptText = asNonEmptyString(endpoint?.prompt?.text);
  if (!promptText) return null;
  return renderPromptSection("ENDPOINT SPECIFICATION", promptText);
}

export function buildEndpointSpecificationBlock({ endpoint }) {
  const label = asNonEmptyString(endpoint?.label);
  const summary = asNonEmptyString(endpoint?.summary);
  const taskText = asNonEmptyString(endpoint?.prompt?.text);
  const body = [label, summary, taskText].filter(Boolean).join("

");
  return renderPromptSection("ENDPOINT SPECIFICATION", body);
}

function composePrompt(runtime, options = {}) {
  if (!runtime?.endpoint) {
    throw new Error("composePrompt requires a canonical endpoint");
  }

  const sharedBlocks = [
    buildSystemPromptBlock(options),
    buildLanguagePromptBlock(runtime, options),
    buildCanvasWorldModelBlock(runtime, options),
    buildBoardMechanicsBlock(runtime, options),
    buildControlContextBlock(runtime.controlContext),
    buildAdminOverrideBlock(runtime.adminOverride)
  ].filter(Boolean);

  const endpointBlock = buildEndpointSpecificationBlock({ endpoint: runtime.endpoint });

  return [...sharedBlocks, endpointBlock].filter(Boolean).join("\n\n");
}
