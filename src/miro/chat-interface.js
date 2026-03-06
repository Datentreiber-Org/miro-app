import {
  DT_SHAPE_META_KEY_CHAT_INTERFACE,
  DT_CHAT_INTERFACE_LAYOUT,
  DT_CHAT_INTERFACE_STYLES
} from "../config.js?v=20260307-batch5";

import { normalizeUiLanguage, t, allLocaleVariants } from "../i18n/index.js?v=20260306-batch6";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260305-batch05";
import { asTrimmedString } from "./helpers.js?v=20260305-batch05";
import { getItemById, removeItemById } from "./items.js?v=20260305-batch05";

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeChatRole(value) {
  const normalized = asTrimmedString(value);
  return ["input", "output", "submit"].includes(normalized) ? normalized : null;
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
    submitShapeId: normalizeShapeId(src.submitShapeId)
  };
}

export function hasCompleteChatInterfaceShapeIds(shapeIds) {
  const normalized = normalizeChatInterfaceShapeIds(shapeIds);
  return !!(normalized.inputShapeId && normalized.outputShapeId && normalized.submitShapeId);
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
    : (role === "submit" ? "chat.submit" : "chat.outputPlaceholder");
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

function getInitialContent(role, lang = "de") {
  const normalizedRole = normalizeChatRole(role) || "output";
  if (normalizedRole === "submit") {
    return `<p><strong>${getChatPlaceholderText(normalizedRole, lang)}</strong></p>`;
  }
  return `<p>${getChatPlaceholderText(normalizedRole, lang)}</p>`;
}

export function computeChatInterfaceLayout(instance) {
  const geom = instance?.lastGeometry || null;
  if (!geom || !Number.isFinite(geom.x) || !Number.isFinite(geom.y) || !Number.isFinite(geom.width) || !Number.isFinite(geom.height)) {
    return null;
  }

  const outputHeight = Math.max(geom.height, 520);
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

  const canvasRight = geom.x + geom.width / 2;
  const canvasTop = geom.y - geom.height / 2;

  const inputX = canvasRight + DT_CHAT_INTERFACE_LAYOUT.outerGapXPx + inputWidth / 2;
  const inputY = canvasTop + inputHeight / 2;
  const submitX = inputX;
  const submitY = canvasTop + inputHeight + DT_CHAT_INTERFACE_LAYOUT.submitGapYPx + submitHeight / 2;
  const outputX = canvasRight + DT_CHAT_INTERFACE_LAYOUT.outerGapXPx + inputWidth + DT_CHAT_INTERFACE_LAYOUT.columnGapXPx + outputWidth / 2;
  const outputY = geom.y;

  return {
    input: { x: inputX, y: inputY, width: inputWidth, height: inputHeight },
    submit: { x: submitX, y: submitY, width: submitWidth, height: submitHeight },
    output: { x: outputX, y: outputY, width: outputWidth, height: outputHeight }
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
    style: getShapeStyle(role)
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

  await writeChatInterfaceMeta(inputShape, { instanceId: instance.instanceId, role: "input" }, log);
  await writeChatInterfaceMeta(submitShape, { instanceId: instance.instanceId, role: "submit" }, log);
  await writeChatInterfaceMeta(outputShape, { instanceId: instance.instanceId, role: "output" }, log);

  return {
    inputShapeId: inputShape?.id ? String(inputShape.id) : null,
    submitShapeId: submitShape?.id ? String(submitShape.id) : null,
    outputShapeId: outputShape?.id ? String(outputShape.id) : null
  };
}

export async function removeChatInterfaceShapes(shapeIds, log) {
  await ensureMiroReady(log);
  const normalized = normalizeChatInterfaceShapeIds(shapeIds);
  for (const itemId of [normalized.inputShapeId, normalized.submitShapeId, normalized.outputShapeId]) {
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
    : (role === "submit" ? normalized.submitShapeId : normalized.outputShapeId);
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
