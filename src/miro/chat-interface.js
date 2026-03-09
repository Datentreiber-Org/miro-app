import {
  DT_SHAPE_META_KEY_CHAT_INTERFACE,
  DT_CHAT_INTERFACE_LAYOUT,
  DT_CHAT_INTERFACE_STYLES
} from "../config.js?v=20260309-batch91hotfix1";

import { normalizeUiLanguage, t, allLocaleVariants } from "../i18n/index.js?v=20260309-batch91hotfix1";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260308-batch76";
import { asTrimmedString } from "./helpers.js?v=20260305-batch05";
import { getItemById, removeItemById } from "./items.js?v=20260305-batch05";

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeChatRole(value) {
  const normalized = asTrimmedString(value);
  return ["input", "output", "submit", "apply"].includes(normalized) ? normalized : null;
}

function normalizeShapeId(value) {
  const normalized = asTrimmedString(value);
  return normalized || null;
}

export function normalizeChatInterfaceShapeIds(rawShapeIds) {
  const src = (rawShapeIds && typeof rawShapeIds === "object") ? rawShapeIds : {};
  return {
    inputShapeId: normalizeShapeId(src.inputShapeId),
    outputShapeId: normalizeShapeId(src.outputShapeId),
    submitShapeId: normalizeShapeId(src.submitShapeId),
    applyShapeId: normalizeShapeId(src.applyShapeId)
  };
}

export function hasCompleteChatInterfaceShapeIds(shapeIds) {
  const normalized = normalizeChatInterfaceShapeIds(shapeIds);
  return !!(normalized.inputShapeId && normalized.outputShapeId && normalized.submitShapeId);
}

export function hasApplyChatInterfaceShapeId(shapeIds) {
  const normalized = normalizeChatInterfaceShapeIds(shapeIds);
  return !!normalized.applyShapeId;
}

function normalizeChatInterfaceMeta(rawMeta) {
  const src = (rawMeta && typeof rawMeta === "object") ? rawMeta : {};
  return {
    version: 1,
    kind: "instance_chat_interface",
    instanceId: asTrimmedString(src.instanceId),
    role: normalizeChatRole(src.role)
  };
}

function getShapeStyle(role) {
  const cfg = DT_CHAT_INTERFACE_STYLES[role] || DT_CHAT_INTERFACE_STYLES.output;
  return {
    fillColor: cfg.fillColor,
    borderColor: cfg.borderColor,
    borderWidth: cfg.borderWidth,
    color: cfg.textColor,
    fontSize: cfg.fontSize,
    textAlign: cfg.textAlign,
    textAlignVertical: cfg.textAlignVertical
  };
}

function getApplyShapeStyle(enabled = false) {
  return getShapeStyle(enabled ? "apply_ready" : "apply_disabled");
}

function normalizeComparableChatText(rawText) {
  return String(rawText || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[…]/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getPlaceholderKeyForRole(role) {
  return role === "input"
    ? "chat.inputPlaceholder"
    : (role === "submit" ? "chat.submit" : (role === "apply" ? "chat.apply" : "chat.outputPlaceholder"));
}

export function getChatPlaceholderText(role, lang = "de") {
  const normalizedRole = normalizeChatRole(role) || "output";
  return t(getPlaceholderKeyForRole(normalizedRole), normalizeUiLanguage(lang));
}

export function getChatPlaceholderVariants(role) {
  return allLocaleVariants({
    de: getChatPlaceholderText(role, "de"),
    en: getChatPlaceholderText(role, "en")
  });
}

export function isKnownChatPlaceholderContent(rawText, role) {
  const comparable = normalizeComparableChatText(rawText);
  if (!comparable) return false;
  return getChatPlaceholderVariants(role).some((value) => normalizeComparableChatText(value) === comparable);
}

export function buildChatApplyContent({ enabled = false, lang = "de" } = {}) {
  const uiLang = normalizeUiLanguage(lang);
  const label = getChatPlaceholderText("apply", uiLang);
  const hint = enabled ? t("chat.apply.ready", uiLang) : t("chat.apply.disabled", uiLang);
  return [label, hint].filter(Boolean).join("\n");
}

function getInitialContent(role, lang = "de") {
  const normalizedRole = normalizeChatRole(role) || "output";
  if (normalizedRole === "submit") {
    return getChatPlaceholderText(normalizedRole, lang);
  }
  if (normalizedRole === "apply") {
    return buildChatApplyContent({ enabled: false, lang });
  }
  return getChatPlaceholderText(normalizedRole, lang);
}

export function computeChatInterfaceLayout(instance) {
  const geom = instance?.lastGeometry || null;
  if (!geom || !Number.isFinite(geom.x) || !Number.isFinite(geom.y) || !Number.isFinite(geom.width) || !Number.isFinite(geom.height)) {
    return null;
  }

  const outputHeight = Math.max(1, Math.round(geom.height * (Number(DT_CHAT_INTERFACE_LAYOUT.outputHeightPerCanvasHeight) || 0.5)));
  const outputWidth = clamp(
    outputHeight * DT_CHAT_INTERFACE_LAYOUT.outputWidthPerCanvasHeight,
    DT_CHAT_INTERFACE_LAYOUT.minOutputWidthPx,
    DT_CHAT_INTERFACE_LAYOUT.maxOutputWidthPx
  );
  const inputWidth = clamp(
    outputWidth * DT_CHAT_INTERFACE_LAYOUT.inputWidthPerOutputWidth,
    DT_CHAT_INTERFACE_LAYOUT.minInputWidthPx,
    DT_CHAT_INTERFACE_LAYOUT.maxInputWidthPx
  );
  const inputHeight = Math.round(outputHeight * DT_CHAT_INTERFACE_LAYOUT.inputHeightPerOutputHeight);
  const submitWidth = clamp(
    inputWidth * DT_CHAT_INTERFACE_LAYOUT.submitWidthPerInputWidth,
    DT_CHAT_INTERFACE_LAYOUT.minSubmitWidthPx,
    DT_CHAT_INTERFACE_LAYOUT.maxSubmitWidthPx
  );
  const submitHeight = DT_CHAT_INTERFACE_LAYOUT.submitHeightPx;
  const applyWidth = clamp(
    outputWidth * DT_CHAT_INTERFACE_LAYOUT.applyWidthPerOutputWidth,
    DT_CHAT_INTERFACE_LAYOUT.minApplyWidthPx,
    DT_CHAT_INTERFACE_LAYOUT.maxApplyWidthPx
  );
  const applyHeight = DT_CHAT_INTERFACE_LAYOUT.applyHeightPx;

  const canvasRight = geom.x + geom.width / 2;
  const canvasTop = geom.y - geom.height / 2;

  const inputX = canvasRight + DT_CHAT_INTERFACE_LAYOUT.outerGapXPx + inputWidth / 2;
  const inputY = canvasTop + inputHeight / 2;
  const submitX = inputX;
  const submitY = canvasTop + inputHeight + DT_CHAT_INTERFACE_LAYOUT.submitGapYPx + submitHeight / 2;
  const outputX = canvasRight + DT_CHAT_INTERFACE_LAYOUT.outerGapXPx + inputWidth + DT_CHAT_INTERFACE_LAYOUT.columnGapXPx + outputWidth / 2;
  const outputY = canvasTop + outputHeight / 2;
  const applyX = outputX;
  const applyY = canvasTop + outputHeight + DT_CHAT_INTERFACE_LAYOUT.applyGapYPx + applyHeight / 2;

  return {
    input: { x: inputX, y: inputY, width: inputWidth, height: inputHeight },
    submit: { x: submitX, y: submitY, width: submitWidth, height: submitHeight },
    output: { x: outputX, y: outputY, width: outputWidth, height: outputHeight },
    apply: { x: applyX, y: applyY, width: applyWidth, height: applyHeight }
  };
}

export async function readChatInterfaceMeta(itemOrId, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.getMetadata) return null;

  try {
    const rawMeta = await item.getMetadata(DT_SHAPE_META_KEY_CHAT_INTERFACE);
    const normalized = normalizeChatInterfaceMeta(rawMeta);
    return normalized.instanceId && normalized.role ? normalized : null;
  } catch (_) {
    return null;
  }
}

export async function writeChatInterfaceMeta(itemOrId, meta, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.setMetadata) return null;

  const normalized = normalizeChatInterfaceMeta(meta);
  try {
    await item.setMetadata(DT_SHAPE_META_KEY_CHAT_INTERFACE, normalized);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern der Chat-Interface-Metadata: " + e.message);
  }
  return normalized;
}

async function createChatShape({ role, x, y, width, height, lang = "de" }, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createShape) throw new Error("miro.board.createShape nicht verfügbar");

  return await board.createShape({
    content: getInitialContent(role, lang),
    shape: "round_rectangle",
    x,
    y,
    width,
    height,
    style: role === "apply" ? getApplyShapeStyle(false) : getShapeStyle(role)
  });
}

export async function createChatInterfaceForInstance(instance, log, { lang = "de" } = {}) {
  await ensureMiroReady(log);
  if (!instance?.instanceId) throw new Error("Chat-Interface kann nicht erstellt werden: instanceId fehlt.");

  const layout = computeChatInterfaceLayout(instance);
  if (!layout) {
    throw new Error("Chat-Interface kann nicht erstellt werden: keine gültige Canvas-Geometrie.");
  }

  const inputShape = await createChatShape({ role: "input", ...layout.input, lang }, log);
  const submitShape = await createChatShape({ role: "submit", ...layout.submit, lang }, log);
  const outputShape = await createChatShape({ role: "output", ...layout.output, lang }, log);
  const applyShape = await createChatShape({ role: "apply", ...layout.apply, lang }, log);

  await writeChatInterfaceMeta(inputShape, { instanceId: instance.instanceId, role: "input" }, log);
  await writeChatInterfaceMeta(submitShape, { instanceId: instance.instanceId, role: "submit" }, log);
  await writeChatInterfaceMeta(outputShape, { instanceId: instance.instanceId, role: "output" }, log);
  await writeChatInterfaceMeta(applyShape, { instanceId: instance.instanceId, role: "apply" }, log);

  return {
    inputShapeId: inputShape?.id ? String(inputShape.id) : null,
    submitShapeId: submitShape?.id ? String(submitShape.id) : null,
    outputShapeId: outputShape?.id ? String(outputShape.id) : null,
    applyShapeId: applyShape?.id ? String(applyShape.id) : null
  };
}

export async function ensureChatApplyShapeForInstance(instance, existingShapeIds, log, { lang = "de" } = {}) {
  await ensureMiroReady(log);
  const normalizedShapeIds = normalizeChatInterfaceShapeIds(existingShapeIds);
  if (normalizedShapeIds.applyShapeId) {
    return normalizedShapeIds;
  }
  const layout = computeChatInterfaceLayout(instance);
  if (!layout?.apply) {
    throw new Error("Apply-Button kann nicht erstellt werden: keine gültige Canvas-Geometrie.");
  }
  const applyShape = await createChatShape({ role: "apply", ...layout.apply, lang }, log);
  await writeChatInterfaceMeta(applyShape, { instanceId: instance.instanceId, role: "apply" }, log);
  return {
    ...normalizedShapeIds,
    applyShapeId: applyShape?.id ? String(applyShape.id) : null
  };
}

export async function removeChatInterfaceShapes(shapeIds, log) {
  await ensureMiroReady(log);
  const normalized = normalizeChatInterfaceShapeIds(shapeIds);
  for (const itemId of [normalized.inputShapeId, normalized.submitShapeId, normalized.outputShapeId, normalized.applyShapeId]) {
    if (!itemId) continue;
    try {
      await removeItemById(itemId, log);
    } catch (_) {}
  }
}

export async function getChatInterfaceItemByRole(shapeIds, role, log) {
  await ensureMiroReady(log);
  const normalized = normalizeChatInterfaceShapeIds(shapeIds);
  const itemId = role === "input"
    ? normalized.inputShapeId
    : (role === "submit"
      ? normalized.submitShapeId
      : (role === "apply" ? normalized.applyShapeId : normalized.outputShapeId));
  if (!itemId) return null;
  return await getItemById(itemId, log);
}

export async function readChatInputContent(shapeIds, log) {
  const item = await getChatInterfaceItemByRole(shapeIds, "input", log);
  if (!item) return "";
  return typeof item.content === "string" ? item.content : "";
}


export async function syncChatPlaceholdersForLanguage(shapeIds, nextLang, log) {
  const lang = normalizeUiLanguage(nextLang);

  for (const role of ["input", "submit", "output"]) {
    const item = await getChatInterfaceItemByRole(shapeIds, role, log);
    if (!item?.sync) continue;
    const rawContent = typeof item.content === "string" ? item.content : "";
    if (!isKnownChatPlaceholderContent(rawContent, role)) continue;
    item.content = getInitialContent(role, lang);
    item.style = {
      ...(item.style || {}),
      ...getShapeStyle(role === "submit" ? "submit" : role)
    };
    await item.sync();
  }
}

export async function syncChatApplyButtonState(shapeIds, { enabled = false, lang = "de" } = {}, log) {
  const item = await getChatInterfaceItemByRole(shapeIds, "apply", log);
  if (!item?.sync) return null;
  item.content = buildChatApplyContent({ enabled, lang });
  item.style = {
    ...(item.style || {}),
    ...(enabled ? getApplyShapeStyle(true) : getApplyShapeStyle(false))
  };
  await item.sync();
  return item;
}

export async function writeChatOutputContent(shapeIds, content, log) {
  const item = await getChatInterfaceItemByRole(shapeIds, "output", log);
  if (!item?.sync) throw new Error("Ausgabebox konnte nicht gefunden oder aktualisiert werden.");
  item.content = typeof content === "string" ? content : String(content || "");
  item.style = {
    ...(item.style || {}),
    ...getShapeStyle("output")
  };
  await item.sync();
  return item;
}
