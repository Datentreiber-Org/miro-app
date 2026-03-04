import {
  DT_STORAGE_COLLECTION_NAME,
  DT_STORAGE_KEY_META,
  DT_STORAGE_KEY_BASELINE_PREFIX,
  DT_STORAGE_KEY_ACTION_BINDING_PREFIX,
  DT_STORAGE_KEY_ACTION_BINDING_INDEX,
  DT_STORAGE_KEY_MEMORY_STATE,
  DT_STORAGE_KEY_MEMORY_LOG_INDEX,
  DT_STORAGE_KEY_MEMORY_LOG_ENTRY_PREFIX,
  DT_IMAGE_META_KEY_INSTANCE,
  DT_ANCHOR_META_KEY_BOARD,
  DT_STORAGE_KEY_EXERCISE_RUNTIME,
  DT_STORAGE_KEY_BOARD_FLOW_INDEX,
  DT_STORAGE_KEY_BOARD_FLOW_PREFIX,
  DT_SHAPE_META_KEY_FLOW_CONTROL,
  DT_DEFAULT_FEEDBACK_FRAME_NAME,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_DEFAULT_APP_ADMIN_POLICY,
  DT_FEEDBACK_TEXT_LAYOUT,
  DT_TEXT_META_KEY_FEEDBACK,
  DT_FLOW_CONTROL_LAYOUT
} from "../config.js?v=20260303-flowbatch1";

import { isFiniteNumber } from "../utils.js?v=20260301-step11-hotfix2";
import { normalizeBoardFlow } from "../runtime/board-flow.js?v=20260303-flowbatch1";

// --------------------------------------------------------------------
// Miro Ready
// --------------------------------------------------------------------
let miroReadyPromise = null;

export function ensureMiroReady(log) {
  if (miroReadyPromise) return miroReadyPromise;

  miroReadyPromise = new Promise((resolve) => {
    const onReady = () => {
      console.log("[DT] Miro SDK v2 bereit");
      if (typeof log === "function") log("Miro SDK bereit.");
      resolve();
    };

    if (window.miro && typeof window.miro.board !== "undefined") {
      onReady();
    } else if (window.miro && typeof window.miro.onReady === "function") {
      window.miro.onReady(onReady);
    } else {
      if (typeof log === "function") log("Warnung: miro.onReady nicht verfügbar, versuche SDK direkt zu verwenden.");
      onReady();
    }
  });

  return miroReadyPromise;
}

export function getBoard() {
  return window.miro?.board || null;
}

function compareItemIdsAsc(a, b) {
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function normalizePositiveInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

function getCanvasTypeConfig(templateCatalog, canvasTypeId, defaultTemplateId = null) {
  if (canvasTypeId && templateCatalog?.[canvasTypeId]) return templateCatalog[canvasTypeId];
  if (defaultTemplateId && templateCatalog?.[defaultTemplateId]) return templateCatalog[defaultTemplateId];
  const first = Object.values(templateCatalog || {})[0];
  return first || null;
}

function getCanvasTypeDisplayName(templateCatalog, canvasTypeId, defaultTemplateId = null) {
  const cfg = getCanvasTypeConfig(templateCatalog, canvasTypeId, defaultTemplateId);
  const raw = cfg?.agentLabelPrefix || cfg?.displayName || canvasTypeId || defaultTemplateId || "Canvas";
  return String(raw || "Canvas").trim() || "Canvas";
}

function formatInstanceLabel(templateCatalog, canvasTypeId, serial, defaultTemplateId = null) {
  return getCanvasTypeDisplayName(templateCatalog, canvasTypeId, defaultTemplateId) + " #" + String(serial);
}

function buildInternalInstanceIdFromImageId(imageId) {
  return "img:" + String(imageId);
}

function normalizeCanvasInstanceMeta(rawMeta, templateCatalog, defaultTemplateId = null) {
  const src = (rawMeta && typeof rawMeta === "object") ? rawMeta : {};
  const canvasTypeId = typeof src.canvasTypeId === "string" && src.canvasTypeId.trim()
    ? src.canvasTypeId.trim()
    : (defaultTemplateId || null);
  const instanceSerial = normalizePositiveInt(src.instanceSerial);
  const expectedLabel = instanceSerial
    ? formatInstanceLabel(templateCatalog, canvasTypeId, instanceSerial, defaultTemplateId)
    : null;
  const instanceLabel = expectedLabel || (typeof src.instanceLabel === "string" && src.instanceLabel.trim() ? src.instanceLabel.trim() : null);

  return {
    version: 1,
    canvasTypeId,
    instanceSerial,
    instanceLabel
  };
}

async function readCanvasInstanceMeta(image, templateCatalog, defaultTemplateId = null, log) {
  if (!image?.getMetadata) {
    return normalizeCanvasInstanceMeta(null, templateCatalog, defaultTemplateId);
  }

  try {
    const rawMeta = await image.getMetadata(DT_IMAGE_META_KEY_INSTANCE);
    return normalizeCanvasInstanceMeta(rawMeta, templateCatalog, defaultTemplateId);
  } catch (e) {
    if (typeof log === "function") {
      log("WARNUNG: Konnte Canvas-Metadata für Bild " + image.id + " nicht lesen: " + e.message);
    }
    return normalizeCanvasInstanceMeta(null, templateCatalog, defaultTemplateId);
  }
}

async function writeCanvasInstanceMeta(image, meta, templateCatalog, defaultTemplateId = null, log) {
  const normalized = normalizeCanvasInstanceMeta(meta, templateCatalog, defaultTemplateId);
  if (!image?.setMetadata) return normalized;

  try {
    await image.setMetadata(DT_IMAGE_META_KEY_INSTANCE, normalized);
  } catch (e) {
    if (typeof log === "function") {
      log("WARNUNG: Konnte Canvas-Metadata für Bild " + image.id + " nicht speichern: " + e.message);
    }
  }

  return normalized;
}

function computeNextInstanceSerial(instancesById, canvasTypeId) {
  let maxSerial = 0;

  for (const inst of instancesById?.values?.() || []) {
    if (!inst || inst.canvasTypeId !== canvasTypeId) continue;
    const serial = normalizePositiveInt(inst.instanceSerial);
    if (serial && serial > maxSerial) maxSerial = serial;
  }

  return maxSerial + 1;
}

async function ensureReadableInstanceLabelsForImages(images, templateCatalog, defaultTemplateId, log) {
  const templateImages = (images || []).filter((img) => detectCanvasTypeIdFromImage(img, templateCatalog));
  if (!templateImages.length) return [];

  const records = [];
  for (const image of templateImages) {
    const canvasTypeId = detectCanvasTypeIdFromImage(image, templateCatalog) || defaultTemplateId;
    const meta = await readCanvasInstanceMeta(image, templateCatalog, defaultTemplateId, log);
    records.push({
      image,
      originalCanvasTypeId: meta.canvasTypeId || null,
      originalInstanceSerial: normalizePositiveInt(meta.instanceSerial),
      originalInstanceLabel: typeof meta.instanceLabel === "string" && meta.instanceLabel.trim() ? meta.instanceLabel.trim() : null,
      canvasTypeId,
      instanceSerial: normalizePositiveInt(meta.instanceSerial),
      instanceLabel: typeof meta.instanceLabel === "string" && meta.instanceLabel.trim() ? meta.instanceLabel.trim() : null
    });
  }

  const byCanvasType = new Map();
  for (const record of records) {
    const key = record.canvasTypeId || defaultTemplateId || "default";
    if (!byCanvasType.has(key)) byCanvasType.set(key, []);
    byCanvasType.get(key).push(record);
  }

  for (const [canvasTypeId, list] of byCanvasType.entries()) {
    list.sort((a, b) => compareItemIdsAsc(a.image, b.image));

    let maxSerial = 0;
    for (const record of list) {
      if (record.instanceSerial && record.instanceSerial > maxSerial) {
        maxSerial = record.instanceSerial;
      }
    }

    const groups = new Map();
    for (const record of list) {
      const serialKey = record.instanceSerial || 0;
      if (!groups.has(serialKey)) groups.set(serialKey, []);
      groups.get(serialKey).push(record);
    }

    for (const [serialKey, group] of groups.entries()) {
      if (!serialKey || group.length <= 1) continue;

      group.sort((a, b) => compareItemIdsAsc(a.image, b.image));
      const keep = group[0];
      keep.instanceLabel = formatInstanceLabel(templateCatalog, canvasTypeId, keep.instanceSerial, defaultTemplateId);

      for (let i = 1; i < group.length; i++) {
        maxSerial += 1;
        group[i].instanceSerial = maxSerial;
        group[i].instanceLabel = formatInstanceLabel(templateCatalog, canvasTypeId, maxSerial, defaultTemplateId);
      }
    }

    for (const record of list) {
      if (!record.instanceSerial) {
        maxSerial += 1;
        record.instanceSerial = maxSerial;
      }

      const expectedLabel = formatInstanceLabel(templateCatalog, canvasTypeId, record.instanceSerial, defaultTemplateId);
      if (record.instanceLabel !== expectedLabel) {
        record.instanceLabel = expectedLabel;
      }

      const needsWrite =
        record.originalCanvasTypeId !== canvasTypeId ||
        record.originalInstanceSerial !== record.instanceSerial ||
        record.originalInstanceLabel !== record.instanceLabel;

      if (needsWrite) {
        await writeCanvasInstanceMeta(record.image, {
          version: 1,
          canvasTypeId,
          instanceSerial: record.instanceSerial,
          instanceLabel: record.instanceLabel
        }, templateCatalog, defaultTemplateId, log);
      }
    }
  }

  return records;
}

export async function registerSelectionUpdateHandler(handler, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (board?.ui?.on && typeof handler === "function") {
    board.ui.on("selection:update", handler);
  }
}

// --------------------------------------------------------------------
// Storage Helpers (Global Baseline + per-Image signatures)
// --------------------------------------------------------------------
function getStorageCollection() {
  try {
    const board = getBoard();
    if (board?.storage?.collection) {
      return board.storage.collection(DT_STORAGE_COLLECTION_NAME);
    }
  } catch (_) {}
  return null;
}

function baselineKeyForImageId(imageId) {
  return DT_STORAGE_KEY_BASELINE_PREFIX + String(imageId);
}

function actionBindingKeyForImageId(imageId) {
  return DT_STORAGE_KEY_ACTION_BINDING_PREFIX + String(imageId);
}

function normalizeActionItems(actionItems) {
  const src = (actionItems && typeof actionItems === "object") ? actionItems : {};

  function idOrNull(key) {
    const value = src[key];
    return (value === undefined || value === null || value === "") ? null : value;
  }

  return {
    aiItemId: idOrNull("aiItemId"),
    clusterItemId: idOrNull("clusterItemId"),
    globalAgentItemId: idOrNull("globalAgentItemId"),
    globalAgentInputItemId: idOrNull("globalAgentInputItemId"),
    frameId: idOrNull("frameId")
  };
}

function hasAnyActionItems(actionItems) {
  const norm = normalizeActionItems(actionItems);
  return !!(norm.aiItemId || norm.clusterItemId || norm.globalAgentItemId || norm.globalAgentInputItemId || norm.frameId);
}

function hasCompleteActionBinding(actionItems) {
  const norm = normalizeActionItems(actionItems);
  return !!(norm.frameId && norm.aiItemId && norm.clusterItemId && norm.globalAgentItemId);
}

function mergeActionItems(primary, secondary) {
  const a = normalizeActionItems(primary);
  const b = normalizeActionItems(secondary);
  return {
    aiItemId: a.aiItemId || b.aiItemId || null,
    clusterItemId: a.clusterItemId || b.clusterItemId || null,
    globalAgentItemId: a.globalAgentItemId || b.globalAgentItemId || null,
    globalAgentInputItemId: a.globalAgentInputItemId || b.globalAgentInputItemId || null,
    frameId: a.frameId || b.frameId || null
  };
}

function uniqueIds(ids) {
  return Array.from(new Set((ids || []).filter(Boolean)));
}

function asTrimmedString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function boardFlowKey(flowId) {
  return DT_STORAGE_KEY_BOARD_FLOW_PREFIX + String(flowId);
}

function normalizeFlowControlMeta(rawMeta) {
  const src = (rawMeta && typeof rawMeta === "object") ? rawMeta : {};
  return {
    version: 1,
    kind: "flow_control",
    flowId: asTrimmedString(src.flowId),
    controlId: asTrimmedString(src.controlId)
  };
}

async function loadBoardFlowIndex(log) {
  await ensureMiroReady(log);
  const col = getStorageCollection();
  if (!col) return [];

  try {
    const raw = await col.get(DT_STORAGE_KEY_BOARD_FLOW_INDEX);
    return uniqueIds(raw);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Board-Flow-Index: " + e.message);
    return [];
  }
}

async function saveBoardFlowIndex(flowIds, log) {
  await ensureMiroReady(log);
  const col = getStorageCollection();
  const normalized = uniqueIds(flowIds);
  if (!col) return normalized;

  try {
    await col.set(DT_STORAGE_KEY_BOARD_FLOW_INDEX, normalized);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Board-Flow-Index: " + e.message);
  }
  return normalized;
}

export async function loadBoardFlow(flowId, log) {
  await ensureMiroReady(log);
  const normalizedId = asTrimmedString(flowId);
  if (!normalizedId) return null;

  const col = getStorageCollection();
  if (!col) return null;

  try {
    const raw = await col.get(boardFlowKey(normalizedId));
    return raw ? normalizeBoardFlow(raw) : null;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Board-Flows '" + normalizedId + "': " + e.message);
    return null;
  }
}

export async function saveBoardFlow(flow, log) {
  await ensureMiroReady(log);
  const normalized = normalizeBoardFlow(flow);
  const flowId = asTrimmedString(normalized?.id);
  if (!flowId) {
    throw new Error("Board-Flow kann nicht gespeichert werden: id fehlt.");
  }

  const col = getStorageCollection();
  if (col) {
    try {
      await col.set(boardFlowKey(flowId), normalized);
      const index = await loadBoardFlowIndex(log);
      if (!index.includes(flowId)) {
        index.push(flowId);
        await saveBoardFlowIndex(index, log);
      }
    } catch (e) {
      if (typeof log === "function") log("Fehler beim Speichern des Board-Flows '" + flowId + "': " + e.message);
    }
  }

  return normalized;
}

export async function listBoardFlows(log) {
  await ensureMiroReady(log);
  const flowIds = await loadBoardFlowIndex(log);
  if (!flowIds.length) return [];

  const result = [];
  for (const flowId of flowIds) {
    const flow = await loadBoardFlow(flowId, log);
    if (flow) result.push(flow);
  }
  return result;
}

export async function readFlowControlMeta(itemOrId, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.getMetadata) return null;

  try {
    const rawMeta = await item.getMetadata(DT_SHAPE_META_KEY_FLOW_CONTROL);
    const normalized = normalizeFlowControlMeta(rawMeta);
    return normalized.flowId && normalized.controlId ? normalized : null;
  } catch (_) {
    return null;
  }
}

export async function writeFlowControlMeta(itemOrId, meta, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.setMetadata) return null;

  const normalized = normalizeFlowControlMeta(meta);
  try {
    await item.setMetadata(DT_SHAPE_META_KEY_FLOW_CONTROL, normalized);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern der Flow-Control-Metadata: " + e.message);
  }
  return normalized;
}

export async function removeFlowControlMeta(itemOrId, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.setMetadata) return false;

  try {
    await item.setMetadata(DT_SHAPE_META_KEY_FLOW_CONTROL, null);
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeBoardMode(value) {
  return value === "exercise" ? "exercise" : "generic";
}

export function normalizeBoardConfig(rawConfig, { defaultCanvasTypeId = null } = {}) {
  const src = (rawConfig && typeof rawConfig === "object") ? rawConfig : {};
  const exercisePackId = asTrimmedString(src.exercisePackId);
  const normalizedDefaultCanvasTypeId = asTrimmedString(src.defaultCanvasTypeId) || asTrimmedString(defaultCanvasTypeId);

  let boardMode = normalizeBoardMode(src.boardMode);
  if (exercisePackId) boardMode = "exercise";

  const feedbackFrameName = asTrimmedString(src.feedbackFrameName) || DT_DEFAULT_FEEDBACK_FRAME_NAME;
  const feedbackChannelDefault = asTrimmedString(src.feedbackChannelDefault) || DT_DEFAULT_FEEDBACK_CHANNEL;
  const appAdminPolicy = asTrimmedString(src.appAdminPolicy) || DT_DEFAULT_APP_ADMIN_POLICY;
  const appAdminUserIds = Array.from(new Set((Array.isArray(src.appAdminUserIds) ? src.appAdminUserIds : [])
    .map((value) => asTrimmedString(value))
    .filter(Boolean)));

  return {
    version: 1,
    boardMode,
    exercisePackId: exercisePackId || null,
    defaultCanvasTypeId: normalizedDefaultCanvasTypeId || null,
    feedbackFrameName,
    feedbackChannelDefault,
    userMayChangePack: src.userMayChangePack === true,
    userMayChangeStep: src.userMayChangeStep === true,
    appAdminPolicy,
    appAdminUserIds
  };
}

export function normalizeExerciseRuntime(rawRuntime) {
  const src = (rawRuntime && typeof rawRuntime === "object") ? rawRuntime : {};
  return {
    version: 1,
    currentStepId: asTrimmedString(src.currentStepId),
    adminOverrideText: asTrimmedString(src.adminOverrideText),
    lastTriggerKey: asTrimmedString(src.lastTriggerKey),
    lastTriggerSource: asTrimmedString(src.lastTriggerSource),
    lastTriggerAt: asTrimmedString(src.lastTriggerAt),
    recommendedNextTrigger: asTrimmedString(src.recommendedNextTrigger),
    recommendedNextStepId: asTrimmedString(src.recommendedNextStepId),
    advanceStepSuggested: src.advanceStepSuggested === true,
    recommendationReason: asTrimmedString(src.recommendationReason),
    feedbackTextCounter: normalizePositiveInt(src.feedbackTextCounter) || 0,
    lastFeedbackTextIds: Array.from(new Set((Array.isArray(src.lastFeedbackTextIds) ? src.lastFeedbackTextIds : [])
      .map((value) => value == null ? null : String(value))
      .filter(Boolean))),
    lastUpdatedAt: asTrimmedString(src.lastUpdatedAt)
  };
}

const BOARD_ANCHOR_LAYOUT = {
  x: 0,
  y: 0,
  width: 8,
  height: 8
};

export async function isBoardAnchorItem(item, log) {
  await ensureMiroReady(log);

  if (!item?.getMetadata) return false;

  try {
    const meta = await item.getMetadata(DT_ANCHOR_META_KEY_BOARD);
    return !!(meta && typeof meta === "object" && meta.version === 1);
  } catch (_) {
    return false;
  }
}

async function listBoardAnchorItems(log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.get) return [];

  let shapes = [];
  try {
    shapes = await board.get({ type: "shape" }) || [];
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Board-Anchor-Kandidaten: " + e.message);
    return [];
  }

  const anchors = [];
  for (const shape of shapes) {
    if (!shape?.getMetadata) continue;
    try {
      const meta = await shape.getMetadata(DT_ANCHOR_META_KEY_BOARD);
      if (meta && typeof meta === "object" && meta.version === 1) {
        anchors.push(shape);
      }
    } catch (_) {}
  }

  anchors.sort(compareItemIdsAsc);

  if (anchors.length > 1 && typeof log === "function") {
    log("WARNUNG: Mehrere Board-Anchors gefunden. Verwende Item " + anchors[0].id + ".");
  }

  return anchors;
}

async function createBoardAnchorItem(log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.createShape) {
    throw new Error("Board-Anchor kann nicht erstellt werden: miro.board.createShape nicht verfügbar");
  }

  const anchor = await board.createShape({
    content: "",
    shape: "rectangle",
    x: BOARD_ANCHOR_LAYOUT.x,
    y: BOARD_ANCHOR_LAYOUT.y,
    width: BOARD_ANCHOR_LAYOUT.width,
    height: BOARD_ANCHOR_LAYOUT.height,
    style: {
      fillColor: "#ffffff",
      fillOpacity: 0,
      borderOpacity: 0,
      borderWidth: 0,
      color: "#ffffff"
    }
  });

  try {
    if (typeof anchor?.sendToBack === "function") {
      await anchor.sendToBack();
    }
  } catch (_) {}

  if (typeof log === "function") {
    log("Board-Anchor erstellt (Item " + anchor.id + ").");
  }

  return anchor;
}

export async function ensureBoardAnchor({ defaultCanvasTypeId = null, log } = {}) {
  await ensureMiroReady(log);

  const existingAnchors = await listBoardAnchorItems(log);
  if (existingAnchors.length > 0) {
    return existingAnchors[0];
  }

  const anchor = await createBoardAnchorItem(log);
  const initialConfig = normalizeBoardConfig(null, { defaultCanvasTypeId });

  try {
    if (anchor?.setMetadata) {
      await anchor.setMetadata(DT_ANCHOR_META_KEY_BOARD, initialConfig);
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Initialisieren des Board-Anchors: " + e.message);
  }

  return anchor;
}

export async function loadBoardConfigFromAnchor({ defaultCanvasTypeId = null, log } = {}) {
  await ensureMiroReady(log);

  const anchor = await ensureBoardAnchor({ defaultCanvasTypeId, log });
  let rawMeta = null;

  try {
    rawMeta = anchor?.getMetadata ? await anchor.getMetadata(DT_ANCHOR_META_KEY_BOARD) : null;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Board-Konfiguration aus dem Anchor: " + e.message);
  }

  const normalized = normalizeBoardConfig(rawMeta, { defaultCanvasTypeId });

  try {
    if (anchor?.setMetadata && JSON.stringify(rawMeta || null) !== JSON.stringify(normalized)) {
      await anchor.setMetadata(DT_ANCHOR_META_KEY_BOARD, normalized);
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Normalisieren der Board-Konfiguration im Anchor: " + e.message);
  }

  return normalized;
}

export async function saveBoardConfigToAnchor(config, { defaultCanvasTypeId = null, log } = {}) {
  await ensureMiroReady(log);

  const anchor = await ensureBoardAnchor({ defaultCanvasTypeId, log });
  const normalized = normalizeBoardConfig(config, { defaultCanvasTypeId });

  try {
    if (anchor?.setMetadata) {
      await anchor.setMetadata(DT_ANCHOR_META_KEY_BOARD, normalized);
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern der Board-Konfiguration im Anchor: " + e.message);
  }

  return normalized;
}

export async function loadPersistedBaselineMeta(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) {
    if (typeof log === "function") {
      log("WARNUNG: Keine Storage Collection verfügbar. Globales Change-Tracking ist nicht persistent.");
    }
    return { hasGlobalBaseline: false, baselineAt: null, persistent: false };
  }

  try {
    const meta = await col.get(DT_STORAGE_KEY_META);
    if (meta && typeof meta === "object" && meta.version === 1 && meta.hasGlobalBaseline === true) {
      return {
        hasGlobalBaseline: true,
        baselineAt: (typeof meta.baselineAt === "string") ? meta.baselineAt : null,
        persistent: true
      };
    }
    return { hasGlobalBaseline: false, baselineAt: null, persistent: true };
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Baseline-Meta: " + e.message);
    return { hasGlobalBaseline: false, baselineAt: null, persistent: true };
  }
}

export async function savePersistedBaselineMeta({ hasGlobalBaseline, baselineAt }, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return;

  try {
    await col.set(DT_STORAGE_KEY_META, {
      version: 1,
      hasGlobalBaseline: !!hasGlobalBaseline,
      baselineAt: baselineAt || null
    });
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern der Baseline-Meta: " + e.message);
  }
}

export async function loadBaselineSignatureForImageId(imageId, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col || !imageId) return null;

  try {
    const sig = await col.get(baselineKeyForImageId(imageId));
    if (sig && typeof sig === "object" && sig.version === 1) return sig;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Baseline-Signatur (" + imageId + "): " + e.message);
  }
  return null;
}

export async function saveBaselineSignatureForImageId(imageId, signature, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col || !imageId || !signature) return;

  try {
    await col.set(baselineKeyForImageId(imageId), signature);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern der Baseline-Signatur (" + imageId + "): " + e.message);
  }
}

export async function removeBaselineSignatureForImageId(imageId, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col || !imageId) return;

  try {
    await col.remove(baselineKeyForImageId(imageId));
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Entfernen der Baseline-Signatur (" + imageId + "): " + e.message);
  }
}

async function loadActionBindingIndex(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return [];

  try {
    const rec = await col.get(DT_STORAGE_KEY_ACTION_BINDING_INDEX);
    if (rec && typeof rec === "object" && rec.version === 1 && Array.isArray(rec.imageIds)) {
      return Array.from(new Set(rec.imageIds.map((id) => String(id)).filter(Boolean))).sort();
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Action-Binding-Index: " + e.message);
  }

  return [];
}

async function saveActionBindingIndex(imageIds, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return;

  const normalizedImageIds = Array.from(new Set((imageIds || []).map((id) => String(id)).filter(Boolean))).sort();

  try {
    await col.set(DT_STORAGE_KEY_ACTION_BINDING_INDEX, {
      version: 1,
      imageIds: normalizedImageIds
    });
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Action-Binding-Index: " + e.message);
  }
}

async function addImageIdToActionBindingIndex(imageId, log) {
  if (!imageId) return;

  const ids = await loadActionBindingIndex(log);
  const key = String(imageId);
  if (!ids.includes(key)) {
    ids.push(key);
    await saveActionBindingIndex(ids, log);
  }
}

async function removeImageIdFromActionBindingIndex(imageId, log) {
  if (!imageId) return;

  const key = String(imageId);
  const ids = await loadActionBindingIndex(log);
  const nextIds = ids.filter((id) => id !== key);
  if (nextIds.length !== ids.length) {
    await saveActionBindingIndex(nextIds, log);
  }
}

async function loadActionBindingForImageId(imageId, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col || !imageId) return null;

  try {
    const rec = await col.get(actionBindingKeyForImageId(imageId));
    if (rec && typeof rec === "object" && rec.version === 1) {
      return normalizeActionItems(rec);
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Action-Bindings (" + imageId + "): " + e.message);
  }

  return null;
}

async function saveActionBindingForImageId(imageId, actionItems, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  const normalized = normalizeActionItems(actionItems);
  if (!col || !imageId || !hasCompleteActionBinding(normalized)) return;

  try {
    await col.set(actionBindingKeyForImageId(imageId), {
      version: 1,
      imageId: String(imageId),
      ...normalized
    });
    await addImageIdToActionBindingIndex(imageId, log);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Action-Bindings (" + imageId + "): " + e.message);
  }
}

async function removeActionBindingForImageId(imageId, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col || !imageId) return;

  try {
    await col.remove(actionBindingKeyForImageId(imageId));
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Entfernen des Action-Bindings (" + imageId + "): " + e.message);
  }

  await removeImageIdFromActionBindingIndex(imageId, log);
}

async function loadMemoryLogIndex(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return [];

  try {
    const rec = await col.get(DT_STORAGE_KEY_MEMORY_LOG_INDEX);
    if (rec && typeof rec === "object" && rec.version === 1 && Array.isArray(rec.entryIds)) {
      return Array.from(new Set(rec.entryIds.map((id) => String(id)).filter(Boolean)));
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Memory-Log-Index: " + e.message);
  }

  return [];
}

async function saveMemoryLogIndex(entryIds, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return;

  const normalizedEntryIds = Array.from(new Set((entryIds || []).map((id) => String(id)).filter(Boolean)));

  try {
    await col.set(DT_STORAGE_KEY_MEMORY_LOG_INDEX, {
      version: 1,
      entryIds: normalizedEntryIds
    });
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Memory-Log-Index: " + e.message);
  }
}

function memoryLogEntryKey(entryId) {
  return DT_STORAGE_KEY_MEMORY_LOG_ENTRY_PREFIX + String(entryId);
}

function buildMemoryLogEntryId() {
  return "m-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
}

export async function loadMemoryState(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return null;

  try {
    const value = await col.get(DT_STORAGE_KEY_MEMORY_STATE);
    return (value && typeof value === "object") ? value : null;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Memory-State: " + e.message);
    return null;
  }
}

export async function saveMemoryState(memoryState, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col || !memoryState || typeof memoryState !== "object") return;

  try {
    await col.set(DT_STORAGE_KEY_MEMORY_STATE, memoryState);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Memory-State: " + e.message);
  }
}

export async function loadExerciseRuntime(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return normalizeExerciseRuntime(null);

  try {
    return normalizeExerciseRuntime(await col.get(DT_STORAGE_KEY_EXERCISE_RUNTIME));
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Exercise-Runtime-State: " + e.message);
    return normalizeExerciseRuntime(null);
  }
}

export async function saveExerciseRuntime(runtime, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  const normalized = normalizeExerciseRuntime({
    ...(runtime && typeof runtime === "object" ? runtime : {}),
    lastUpdatedAt: new Date().toISOString()
  });

  if (!col) return normalized;

  try {
    await col.set(DT_STORAGE_KEY_EXERCISE_RUNTIME, normalized);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Exercise-Runtime-State: " + e.message);
  }

  return normalized;
}


function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createFeedbackTitle(counter, triggerContext, exercisePack, currentStep, feedback) {
  const prefix = String(counter).padStart(DT_FEEDBACK_TEXT_LAYOUT.counterPadLength, "0");
  const parts = [`[${prefix}]`];

  const packLabel = asTrimmedString(exercisePack?.label);
  const stepLabel = asTrimmedString(currentStep?.label);
  const triggerKey = asTrimmedString(triggerContext?.triggerKey);
  const feedbackTitle = asTrimmedString(feedback?.title);

  if (packLabel) parts.push(packLabel);
  if (stepLabel) parts.push(stepLabel);
  if (triggerKey) parts.push(triggerKey);
  else if (feedbackTitle) parts.push(feedbackTitle);

  return parts.join(" · ");
}

function buildBulletSection(heading, bullets) {
  const cleanBullets = Array.from(new Set((Array.isArray(bullets) ? bullets : [])
    .map((entry) => asTrimmedString(entry))
    .filter(Boolean)));
  if (!cleanBullets.length) return "";

  const headingHtml = heading ? `<p><strong>${escapeHtml(heading)}</strong></p>` : "";
  const bulletsHtml = cleanBullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
  return `${headingHtml}<ul>${bulletsHtml}</ul>`;
}

function buildEvaluationHtml(evaluation) {
  if (!evaluation || typeof evaluation !== "object") return "";

  const parts = [];
  const score = evaluation.score;
  const scale = asTrimmedString(evaluation.scale);
  const verdict = asTrimmedString(evaluation.verdict);

  if (score != null || scale || verdict) {
    const textParts = [];
    if (score != null) textParts.push(String(score));
    if (scale) textParts.push(scale);
    const scoreText = textParts.length ? textParts.join(" / ") : null;
    const verdictText = verdict ? ` – ${escapeHtml(verdict)}` : "";
    if (scoreText || verdictText) {
      parts.push(`<p><strong>Bewertung</strong><br>${scoreText ? escapeHtml(scoreText) : ""}${verdictText}</p>`);
    }
  }

  if (Array.isArray(evaluation.rubric) && evaluation.rubric.length) {
    const bullets = evaluation.rubric
      .map((entry) => {
        const criterion = asTrimmedString(entry?.criterion);
        const status = asTrimmedString(entry?.status);
        const comment = asTrimmedString(entry?.comment);
        const bulletParts = [];
        if (criterion) bulletParts.push(criterion);
        if (status) bulletParts.push(`(${status})`);
        if (comment) bulletParts.push(`– ${comment}`);
        return bulletParts.join(" ").trim();
      })
      .filter(Boolean);

    if (bullets.length) {
      parts.push(buildBulletSection("Rubrik", bullets));
    }
  }

  return parts.join("");
}

export function buildFeedbackTextContent({ counter, triggerContext, feedback, recommendations, evaluation, exercisePack, currentStep }) {
  const title = createFeedbackTitle(counter, triggerContext, exercisePack, currentStep, feedback);
  const summary = asTrimmedString(feedback?.summary);
  const sections = Array.isArray(feedback?.sections) ? feedback.sections : [];
  const recommendedNextTrigger = asTrimmedString(recommendations?.recommendedNextTrigger);
  const recommendedNextStepId = asTrimmedString(recommendations?.recommendedNextStepId);
  const recommendationReason = asTrimmedString(recommendations?.reason);
  const advanceStepSuggested = recommendations?.advanceStepSuggested === true;

  const chunks = [`<p><strong>${escapeHtml(title)}</strong></p>`];

  if (summary) {
    chunks.push(`<p><strong>Zusammenfassung</strong><br>${escapeHtml(summary)}</p>`);
  }

  for (const section of sections) {
    chunks.push(buildBulletSection(asTrimmedString(section?.heading), section?.bullets));
  }

  const recommendationBullets = [];
  if (recommendedNextTrigger) recommendationBullets.push(`Empfohlener nächster Trigger: ${recommendedNextTrigger}`);
  if (recommendedNextStepId) recommendationBullets.push(`Empfohlener nächster Schritt: ${recommendedNextStepId}`);
  if (advanceStepSuggested) recommendationBullets.push("Step-Wechsel empfohlen: ja");
  if (recommendationReason) recommendationBullets.push(`Begründung: ${recommendationReason}`);
  if (recommendationBullets.length) {
    chunks.push(buildBulletSection("Empfehlungen", recommendationBullets));
  }

  const evaluationHtml = buildEvaluationHtml(evaluation);
  if (evaluationHtml) chunks.push(evaluationHtml);

  return chunks.filter(Boolean).join("");
}

async function listFramesByTitle(frameTitle, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.get) return [];

  let frames = [];
  try {
    frames = await board.get({ type: "frame" }) || [];
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Feedback-Frames: " + e.message);
    return [];
  }

  const wantedTitle = asTrimmedString(frameTitle);
  const matches = frames.filter((frame) => asTrimmedString(frame?.title) === wantedTitle);
  matches.sort(compareItemIdsAsc);
  return matches;
}

async function createFeedbackFrame(frameTitle, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.createFrame) {
    throw new Error("Feedback-Frame kann nicht erstellt werden: miro.board.createFrame nicht verfügbar");
  }

  const viewport = await getViewport(log);
  const x = isFiniteNumber(viewport?.x) && isFiniteNumber(viewport?.width)
    ? viewport.x + viewport.width * 0.75 + DT_FEEDBACK_TEXT_LAYOUT.frameWidthPx / 2
    : DT_FEEDBACK_TEXT_LAYOUT.frameWidthPx / 2;
  const y = isFiniteNumber(viewport?.y) && isFiniteNumber(viewport?.height)
    ? viewport.y + viewport.height / 2
    : 0;

  const frame = await board.createFrame({
    title: frameTitle,
    x,
    y,
    width: DT_FEEDBACK_TEXT_LAYOUT.frameWidthPx,
    height: DT_FEEDBACK_TEXT_LAYOUT.frameHeightPx,
    style: {
      fillColor: "#ffffff"
    }
  });

  if (typeof log === "function") {
    log("Feedback-Frame erstellt: " + frameTitle + " (Frame " + frame.id + ").");
  }

  return frame;
}

export async function ensureFeedbackFrame(frameTitle, log) {
  await ensureMiroReady(log);

  const normalizedTitle = asTrimmedString(frameTitle) || DT_DEFAULT_FEEDBACK_FRAME_NAME;
  const existingFrames = await listFramesByTitle(normalizedTitle, log);
  if (existingFrames.length > 0) {
    if (existingFrames.length > 1 && typeof log === "function") {
      log("WARNUNG: Mehrere Feedback-Frames mit demselben Titel gefunden. Verwende Frame " + existingFrames[0].id + ".");
    }
    return existingFrames[0];
  }

  return await createFeedbackFrame(normalizedTitle, log);
}

export async function listFeedbackTextItemsInFrame(frameId, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.get || !frameId) return [];

  let texts = [];
  try {
    texts = await board.get({ type: "text" }) || [];
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Feedback-Texte: " + e.message);
    return [];
  }

  const result = [];
  for (const text of texts) {
    if (text?.parentId !== frameId) continue;

    let feedbackMeta = null;
    if (typeof text?.getMetadata === "function") {
      try {
        feedbackMeta = await text.getMetadata(DT_TEXT_META_KEY_FEEDBACK);
      } catch (_) {}
    }

    const counter = normalizePositiveInt(feedbackMeta?.counter) || 0;
    result.push({ text, meta: feedbackMeta || null, counter });
  }

  result.sort((a, b) => {
    const aCounter = a.counter || 0;
    const bCounter = b.counter || 0;
    if (aCounter !== bCounter) return aCounter - bCounter;
    return compareItemIdsAsc(a.text, b.text);
  });

  return result;
}

function computeNextFeedbackTextPosition(frame, existingItems, counter) {
  const usableWidth = Math.max(
    DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx,
    Number(frame?.width || DT_FEEDBACK_TEXT_LAYOUT.frameWidthPx) - 2 * DT_FEEDBACK_TEXT_LAYOUT.framePaddingXPx
  );
  const computedColumns = Math.floor((usableWidth + DT_FEEDBACK_TEXT_LAYOUT.gapXPx) / (DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx + DT_FEEDBACK_TEXT_LAYOUT.gapXPx));
  const columns = Math.max(1, Math.min(DT_FEEDBACK_TEXT_LAYOUT.maxColumns, computedColumns || 1));
  const index = Math.max(0, Number(counter || 1) - 1);
  const col = index % columns;
  const row = Math.floor(index / columns);

  return {
    width: DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx,
    x: DT_FEEDBACK_TEXT_LAYOUT.framePaddingXPx + DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx / 2 + col * (DT_FEEDBACK_TEXT_LAYOUT.itemWidthPx + DT_FEEDBACK_TEXT_LAYOUT.gapXPx),
    y: DT_FEEDBACK_TEXT_LAYOUT.framePaddingYPx + DT_FEEDBACK_TEXT_LAYOUT.itemMinHeightPx / 2 + row * (DT_FEEDBACK_TEXT_LAYOUT.itemMinHeightPx + DT_FEEDBACK_TEXT_LAYOUT.gapYPx)
  };
}

async function createFeedbackTextItem({ frameId, x, y, width, content, metadata }, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.createText) {
    throw new Error("Feedback-Text kann nicht erstellt werden: miro.board.createText nicht verfügbar");
  }

  const frame = frameId ? await getItemById(frameId, log) : null;
  const frameLeft = Number(frame?.x || 0) - Number(frame?.width || 0) / 2;
  const frameTop = Number(frame?.y || 0) - Number(frame?.height || 0) / 2;
  const boardX = frame ? frameLeft + Number(x || 0) : Number(x || 0);
  const boardY = frame ? frameTop + Number(y || 0) : Number(y || 0);

  const textItem = await board.createText({
    content,
    x: boardX,
    y: boardY,
    width,
    style: {
      color: "#111827",
      fillColor: "#ffffff",
      fillOpacity: 1,
      fontFamily: "arial",
      fontSize: 14,
      textAlign: "left"
    }
  });

  if (frame?.type === "frame" && typeof frame.add === "function") {
    try {
      await frame.add(textItem);
      await frame.sync();
    } catch (e) {
      if (typeof log === "function") {
        log("WARNUNG: Feedback-Text konnte dem Frame " + frame.id + " nicht hinzugefügt werden: " + e.message);
      }
    }
  }

  if (metadata && typeof textItem?.setMetadata === "function") {
    try {
      await textItem.setMetadata(DT_TEXT_META_KEY_FEEDBACK, metadata);
    } catch (e) {
      if (typeof log === "function") log("WARNUNG: Konnte Feedback-Metadata für Text " + textItem.id + " nicht speichern: " + e.message);
    }
  }

  return textItem;
}

export async function renderFeedbackTextForRun({
  boardConfig,
  runtime,
  triggerContext,
  feedback,
  recommendations,
  evaluation,
  exercisePack,
  currentStep,
  log
} = {}) {
  await ensureMiroReady(log);

  if (!feedback || typeof feedback !== "object") return null;

  const frameTitle = asTrimmedString(boardConfig?.feedbackFrameName) || DT_DEFAULT_FEEDBACK_FRAME_NAME;
  const frame = await ensureFeedbackFrame(frameTitle, log);
  const existingItems = await listFeedbackTextItemsInFrame(frame.id, log);
  const nextCounter = Math.max(normalizePositiveInt(runtime?.feedbackTextCounter) || 0, existingItems.length) + 1;
  const position = computeNextFeedbackTextPosition(frame, existingItems, nextCounter);
  const createdAt = new Date().toISOString();
  const content = buildFeedbackTextContent({
    counter: nextCounter,
    triggerContext,
    feedback,
    recommendations,
    evaluation,
    exercisePack,
    currentStep
  });

  const textItem = await createFeedbackTextItem({
    frameId: frame.id,
    x: position.x,
    y: position.y,
    width: position.width,
    content,
    metadata: {
      version: 1,
      counter: nextCounter,
      triggerKey: asTrimmedString(triggerContext?.triggerKey),
      stepId: asTrimmedString(currentStep?.id),
      exercisePackId: asTrimmedString(exercisePack?.id),
      createdAt
    }
  }, log);

  return {
    counter: nextCounter,
    frameId: frame.id,
    frameTitle,
    textItemIds: textItem?.id ? [textItem.id] : [],
    createdAt
  };
}

export async function loadMemoryLog(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return [];

  const entryIds = await loadMemoryLogIndex(log);
  if (!entryIds.length) return [];

  try {
    const values = await Promise.all(entryIds.map((entryId) => col.get(memoryLogEntryKey(entryId)).catch(() => undefined)));
    const result = [];

    for (let i = 0; i < entryIds.length; i++) {
      const value = values[i];
      if (!value || typeof value !== "object") continue;
      result.push({
        entryId: value.entryId || entryIds[i],
        ...value
      });
    }

    result.sort((a, b) => {
      const aTs = typeof a?.ts === "string" ? a.ts : "";
      const bTs = typeof b?.ts === "string" ? b.ts : "";
      if (aTs !== bTs) return aTs.localeCompare(bTs);
      return String(a?.entryId || "").localeCompare(String(b?.entryId || ""));
    });

    return result;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Memory-Logs: " + e.message);
    return [];
  }
}

export async function appendMemoryLogEntry(entry, log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!entry || typeof entry !== "object") return null;

  const entryId = (typeof entry.entryId === "string" && entry.entryId.trim()) ? entry.entryId.trim() : buildMemoryLogEntryId();
  const storedEntry = {
    version: 1,
    ...entry,
    entryId
  };

  if (!col) return storedEntry;

  try {
    await col.set(memoryLogEntryKey(entryId), storedEntry);

    const entryIds = await loadMemoryLogIndex(log);
    if (!entryIds.includes(entryId)) {
      entryIds.push(entryId);
      await saveMemoryLogIndex(entryIds, log);
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Anhängen eines Memory-Log-Eintrags: " + e.message);
  }

  return storedEntry;
}

// --------------------------------------------------------------------
// Board Get/Create wrappers
// --------------------------------------------------------------------
export async function getSelection(log) {
  await ensureMiroReady(log);
  const board = getBoard();
  return board?.getSelection ? (await board.getSelection()) : [];
}

export async function getItems(query, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  return board?.get ? (await board.get(query)) : [];
}

export async function getItemsById(ids, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.get || !ids) return [];

  const arr = await board.get({ id: ids });
  if (Array.isArray(arr)) return arr;
  if (arr) return [arr];
  return [];
}

export async function getItemById(id, log) {
  const items = await getItemsById(id, log);
  return items[0] || null;
}

export async function createImage(payload, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createImage) throw new Error("miro.board.createImage nicht verfügbar");
  return await board.createImage(payload);
}

export async function computeSuggestedFlowControlPosition(instance, { offsetIndex = 0 } = {}, log) {
  await ensureMiroReady(log);
  const geom = instance ? (await computeTemplateGeometry(instance, log)) : null;
  const fallbackX = Number(instance?.lastGeometry?.x) || 0;
  const fallbackY = Number(instance?.lastGeometry?.y) || 0;
  const fallbackHeight = Number(instance?.lastGeometry?.height) || 0;
  const baseX = geom?.x || fallbackX;
  const baseY = geom?.y || fallbackY;
  const baseHeight = geom?.height || fallbackHeight;

  return {
    x: baseX + offsetIndex * (DT_FLOW_CONTROL_LAYOUT.widthPx + DT_FLOW_CONTROL_LAYOUT.gapXPx),
    y: baseY + baseHeight / 2 + DT_FLOW_CONTROL_LAYOUT.offsetFromCanvasBottomPx,
    width: DT_FLOW_CONTROL_LAYOUT.widthPx,
    height: DT_FLOW_CONTROL_LAYOUT.heightPx
  };
}

export async function createFlowControlShape({ label, x, y, frameId = null, width = DT_FLOW_CONTROL_LAYOUT.widthPx, height = DT_FLOW_CONTROL_LAYOUT.heightPx }, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createShape) throw new Error("miro.board.createShape nicht verfügbar");

  const shape = await board.createShape({
    content: asTrimmedString(label) || "Flow Control",
    shape: "round_rectangle",
    x,
    y,
    width,
    height,
    style: {
      fillColor: "#e0f2fe",
      borderColor: "#0369a1",
      borderWidth: 2,
      color: "#0f172a",
      fontSize: 14,
      textAlign: "center",
      textAlignVertical: "middle"
    }
  });

  if (frameId) {
    try {
      const frame = await getItemById(frameId, log);
      if (frame?.type === "frame" && typeof frame.add === "function") {
        await frame.add(shape);
        await frame.sync();
      }
    } catch (e) {
      if (typeof log === "function") log("Konnte Flow-Control-Shape nicht dem Frame hinzufügen: " + e.message);
    }
  }

  return shape;
}

export async function getViewport(log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.viewport?.get) return null;
  return await board.viewport.get();
}

export async function zoomTo(item, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (board?.viewport?.zoomTo && item) {
    await board.viewport.zoomTo(item);
  }
}

// Sticky create/remove/move (low-level)
export async function createStickyNoteAtBoardCoords({ content, x, y, frameId = null }, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createStickyNote) throw new Error("miro.board.createStickyNote nicht verfügbar");

  const sticky = await board.createStickyNote({
    content: content || "(leer)",
    x,
    y
  });

  if (frameId) {
    try {
      const frame = await getItemById(frameId, log);
      if (frame?.type === "frame" && typeof frame.add === "function") {
        await frame.add(sticky);
        await frame.sync();
      }
    } catch (e) {
      if (typeof log === "function") log("Konnte Sticky nicht dem Frame hinzufügen: " + e.message);
    }
  }

  return sticky;
}

export async function createConnectorBetweenItems({ startItemId, endItemId, directed = true, frameId = null }, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createConnector) throw new Error("miro.board.createConnector nicht verfügbar");
  if (!startItemId || !endItemId) {
    throw new Error("createConnectorBetweenItems benötigt startItemId und endItemId");
  }

  const connector = await board.createConnector({
    start: {
      item: startItemId,
      snapTo: "auto"
    },
    end: {
      item: endItemId,
      snapTo: "auto"
    },
    style: {
      startStrokeCap: "none",
      endStrokeCap: directed === false ? "none" : "stealth"
    }
  });

  if (frameId) {
    try {
      const frame = await getItemById(frameId, log);
      if (frame?.type === "frame" && typeof frame.add === "function") {
        await frame.add(connector);
        await frame.sync();
      }
    } catch (e) {
      if (typeof log === "function") log("Konnte Connector nicht dem Frame hinzufügen: " + e.message);
    }
  }

  return connector;
}

export async function removeItemById(itemId, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.remove) throw new Error("miro.board.remove nicht verfügbar");

  const item = await getItemById(itemId, log);
  if (!item) {
    if (typeof log === "function") log("remove: Item nicht gefunden: " + itemId);
    return;
  }
  await board.remove(item);
}

export async function moveItemByIdToBoardCoords(itemId, boardX, boardY, log) {
  await ensureMiroReady(log);

  const item = await getItemById(itemId, log);
  if (!item) {
    if (typeof log === "function") log("move: Item nicht gefunden: " + itemId);
    return;
  }

  const parentGeomCache = new Map();
  const local = await boardToLocalCoords(item, boardX, boardY, parentGeomCache, log);
  if (!local) {
    if (typeof log === "function") log("move: Konnte lokale Koordinaten nicht berechnen: " + itemId);
    return;
  }

  item.x = local.x;
  item.y = local.y;
  await item.sync();
}

// --------------------------------------------------------------------
// Parent/Child Koordinaten: Board-Level <-> Local
// --------------------------------------------------------------------
async function getParentGeometry(parentId, cache, log) {
  if (!parentId) return null;
  if (cache?.has(parentId)) return cache.get(parentId);

  const parent = await getItemById(parentId, log);
  if (
    parent &&
    isFiniteNumber(parent.x) &&
    isFiniteNumber(parent.y) &&
    isFiniteNumber(parent.width) &&
    isFiniteNumber(parent.height)
  ) {
    const geom = { x: parent.x, y: parent.y, width: parent.width, height: parent.height };
    cache?.set(parentId, geom);
    return geom;
  }

  cache?.set(parentId, null);
  return null;
}

// Item-x/y -> Board-x/y (wenn Item in Frame/Parent ist)
export async function resolveBoardCoords(item, parentGeomCache = null, log) {
  if (!item || !isFiniteNumber(item.x) || !isFiniteNumber(item.y)) return null;

  let boardX = item.x;
  let boardY = item.y;

  const rel = (typeof item.relativeTo === "string") ? item.relativeTo : null;
  if (item.parentId && rel !== "canvas_center") {
    const parentGeom = await getParentGeometry(item.parentId, parentGeomCache, log);
    if (parentGeom) {
      if (rel === "parent_center") {
        boardX = parentGeom.x + item.x;
        boardY = parentGeom.y + item.y;
      } else {
        // Default: parent_top_left
        const parentLeft = parentGeom.x - parentGeom.width / 2;
        const parentTop  = parentGeom.y - parentGeom.height / 2;
        boardX = parentLeft + item.x;
        boardY = parentTop + item.y;
      }
    }
  }

  return { x: boardX, y: boardY };
}

// Board-x/y -> lokale Item-x/y (wenn Item Parent hat)
export async function boardToLocalCoords(item, boardX, boardY, parentGeomCache = null, log) {
  if (!item || !isFiniteNumber(boardX) || !isFiniteNumber(boardY)) return null;

  const rel = (typeof item.relativeTo === "string") ? item.relativeTo : null;

  if (item.parentId && rel !== "canvas_center") {
    const parentGeom = await getParentGeometry(item.parentId, parentGeomCache, log);
    if (parentGeom) {
      if (rel === "parent_center") {
        return { x: boardX - parentGeom.x, y: boardY - parentGeom.y };
      } else {
        const parentLeft = parentGeom.x - parentGeom.width / 2;
        const parentTop  = parentGeom.y - parentGeom.height / 2;
        return { x: boardX - parentLeft, y: boardY - parentTop };
      }
    }
  }

  return { x: boardX, y: boardY };
}

// --------------------------------------------------------------------
// Board Context (Stickies/Connectors/Tags)
// --------------------------------------------------------------------
export async function getBoardBaseContext(log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.get) return { stickies: [], connectors: [], tagsById: {} };

  try {
    const [stickies, connectors, tags] = await Promise.all([
      board.get({ type: "sticky_note" }),
      board.get({ type: "connector" }),
      board.get({ type: "tag" })
    ]);

    const tagsById = Object.create(null);
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        const title = tag.title || tag.text || tag.content || "";
        tagsById[tag.id] = title;
      }
    }

    return {
      stickies: stickies || [],
      connectors: connectors || [],
      tagsById
    };
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Board-Kontexts: " + e.message);
    return { stickies: [], connectors: [], tagsById: {} };
  }
}

// --------------------------------------------------------------------
// Instance Geometry + Lookup
// --------------------------------------------------------------------
export async function computeTemplateGeometry(instance, log) {
  await ensureMiroReady(log);

  if (!instance) return null;

  // Primärquelle: Template-Image selbst
  if (instance.imageId) {
    try {
      const img = await getItemById(instance.imageId, log);
      if (
        img &&
        isFiniteNumber(img.width) &&
        isFiniteNumber(img.height)
      ) {
        const parentGeomCache = new Map();
        const pos = await resolveBoardCoords(img, parentGeomCache, log);
        const geom = {
          x: pos?.x ?? img.x,
          y: pos?.y ?? img.y,
          width: img.width,
          height: img.height
        };
        instance.lastGeometry = geom;
        return geom;
      }
    } catch (e) {
      if (typeof log === "function") log("Fehler bei computeTemplateGeometry (Image): " + e.message);
    }
  }

  // Fallback: lastGeometry
  const g = instance.lastGeometry;
  if (g && isFiniteNumber(g.x) && isFiniteNumber(g.y) && isFiniteNumber(g.width) && isFiniteNumber(g.height)) {
    return g;
  }

  // Dummy
  const dummy = { x: 0, y: 0, width: 2000, height: 1000 };
  instance.lastGeometry = dummy;
  if (typeof log === "function") {
    log("WARNUNG: Keine echte Geometrie gefunden, verwende Dummy für Instanz " + (instance.instanceLabel || instance.instanceId));
  }
  return dummy;
}

export async function buildInstanceGeometryIndex(instancesById, log) {
  await ensureMiroReady(log);
  const entries = [];
  for (const inst of instancesById.values()) {
    const geom = await computeTemplateGeometry(inst, log);
    entries.push({ inst, geom });
  }
  return entries;
}

export function findInstanceByPoint(x, y, geomEntries) {
  let bestInst = null;
  let bestDistSq = Infinity;

  for (const entry of geomEntries) {
    const geom = entry.geom;
    if (!geom) continue;

    const left   = geom.x - geom.width / 2;
    const top    = geom.y - geom.height / 2;
    const right  = geom.x + geom.width / 2;
    const bottom = geom.y + geom.height / 2;

    if (x >= left && x <= right && y >= top && y <= bottom) {
      const dx = x - geom.x;
      const dy = y - geom.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestInst = entry.inst;
      }
    }
  }

  return bestInst;
}

// --------------------------------------------------------------------
// Template-Detection + Action-Frames/Buttons
// --------------------------------------------------------------------
function detectCanvasTypeIdFromImage(image, templateCatalog) {
  if (!image || image.type !== "image") return null;
  const url = (typeof image.url === "string") ? image.url : "";
  if (!url) return null;

  for (const id of Object.keys(templateCatalog || {})) {
    const cfg = templateCatalog[id];
    if (cfg?.imageUrl && url.includes(cfg.imageUrl)) return id;
  }

  return null;
}

const ACTION_LABELS = {
  ai: "Send to OpenAI",
  cluster: "Cluster",
  global: "Global Agent"
};

const ACTION_LAYOUT = {
  frameWidthPaddingPx: 200,
  frameHeightPaddingPx: 260,
  frameCenterYOffsetPx: 80,
  buttonOffsetXPx: 260,
  buttonWidthPx: 260,
  buttonHeightPx: 60,
  buttonRowOffsetFromImageBottomPx: 80,
  inputOffsetFromButtonTopPx: 100
};

const ACTION_REBIND_GEO = {
  maxButtonRowSpreadPx: 140,
  minButtonGapPx: 120,
  maxButtonGapPx: 480,
  maxInputDxPx: 220,
  minInputDyPx: 20,
  maxInputDyPx: 240
};

function compareByX(a, b) {
  return a.x - b.x;
}

async function removeKnownItemsById(itemIds, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.remove) return;

  const ids = uniqueIds(itemIds);
  if (ids.length === 0) return;

  const items = await getItemsById(ids, log);
  for (const item of items) {
    try {
      await board.remove(item);
    } catch (e) {
      if (typeof log === "function") log("Fehler beim Entfernen von Item " + item.id + ": " + e.message);
    }
  }
}

async function cleanupOrphanedActionArtifacts(imageId, actionItems, log) {
  const normalized = normalizeActionItems(actionItems);
  if (!hasAnyActionItems(normalized)) return;

  await removeKnownItemsById([
    normalized.aiItemId,
    normalized.clusterItemId,
    normalized.globalAgentItemId,
    normalized.globalAgentInputItemId
  ], log);

  await removeKnownItemsById([normalized.frameId], log);

  if (typeof log === "function") {
    log("Verwaiste Action-Artefakte entfernt für Bild-ID " + imageId);
  }
}

async function validateActionBindingForImage(image, actionItems, log) {
  const normalized = normalizeActionItems(actionItems);
  if (!image || !hasAnyActionItems(normalized)) return null;

  const idsToLoad = uniqueIds([
    normalized.frameId,
    normalized.aiItemId,
    normalized.clusterItemId,
    normalized.globalAgentItemId,
    normalized.globalAgentInputItemId
  ]);
  if (idsToLoad.length === 0) return null;

  const items = await getItemsById(idsToLoad, log);
  const itemsById = new Map();
  for (const item of items) itemsById.set(item.id, item);

  let frameId = normalized.frameId;
  if (image.parentId) {
    frameId = image.parentId;
  }
  if (frameId && !itemsById.has(frameId)) {
    const frame = await getItemById(frameId, log);
    if (frame) itemsById.set(frame.id, frame);
  }
  if (frameId && !itemsById.has(frameId)) {
    frameId = null;
  }

  function validateChildId(itemId) {
    if (!itemId) return null;
    const item = itemsById.get(itemId);
    if (!item) return null;
    if (frameId && item.parentId !== frameId) return null;
    return itemId;
  }

  const validated = {
    aiItemId: validateChildId(normalized.aiItemId),
    clusterItemId: validateChildId(normalized.clusterItemId),
    globalAgentItemId: validateChildId(normalized.globalAgentItemId),
    globalAgentInputItemId: validateChildId(normalized.globalAgentInputItemId),
    frameId
  };

  return hasAnyActionItems(validated) ? validated : null;
}

function chooseBestButtonShapeTriplet(shapeEntries) {
  if (!Array.isArray(shapeEntries) || shapeEntries.length < 3) return null;

  let best = null;
  let bestScore = Infinity;

  for (let i = 0; i < shapeEntries.length - 2; i++) {
    for (let j = i + 1; j < shapeEntries.length - 1; j++) {
      for (let k = j + 1; k < shapeEntries.length; k++) {
        const trio = [shapeEntries[i], shapeEntries[j], shapeEntries[k]].slice().sort(compareByX);
        const [left, middle, right] = trio;

        const rowSpread = Math.max(left.y, middle.y, right.y) - Math.min(left.y, middle.y, right.y);
        if (rowSpread > ACTION_REBIND_GEO.maxButtonRowSpreadPx) continue;

        const gap1 = middle.x - left.x;
        const gap2 = right.x - middle.x;
        if (gap1 < ACTION_REBIND_GEO.minButtonGapPx || gap2 < ACTION_REBIND_GEO.minButtonGapPx) continue;
        if (gap1 > ACTION_REBIND_GEO.maxButtonGapPx || gap2 > ACTION_REBIND_GEO.maxButtonGapPx) continue;

        const widthPenalty =
          Math.abs((left.item.width || 0) - (middle.item.width || 0)) +
          Math.abs((middle.item.width || 0) - (right.item.width || 0));
        const heightPenalty =
          Math.abs((left.item.height || 0) - (middle.item.height || 0)) +
          Math.abs((middle.item.height || 0) - (right.item.height || 0));

        const score =
          Math.abs(gap1 - gap2) * Math.abs(gap1 - gap2) +
          rowSpread * rowSpread +
          widthPenalty +
          heightPenalty;

        if (score < bestScore) {
          bestScore = score;
          best = { left, middle, right };
        }
      }
    }
  }

  return best;
}

function chooseGlobalInputText(textEntries, rightButtonEntry) {
  if (!Array.isArray(textEntries) || textEntries.length === 0 || !rightButtonEntry) return null;

  let best = null;
  let bestScore = Infinity;

  for (const entry of textEntries) {
    const dx = Math.abs(entry.x - rightButtonEntry.x);
    const dy = entry.y - rightButtonEntry.y;
    if (dx > ACTION_REBIND_GEO.maxInputDxPx) continue;
    if (dy < ACTION_REBIND_GEO.minInputDyPx || dy > ACTION_REBIND_GEO.maxInputDyPx) continue;

    const score = (dx * dx) + Math.pow(dy - ACTION_LAYOUT.inputOffsetFromButtonTopPx, 2);
    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best;
}

async function inferActionItemsFromFrameGeometry(image, frameId, frameShapes, frameTexts, log) {
  if (!image || !frameId) return null;

  const parentGeomCache = new Map();
  const shapeEntries = [];
  for (const shape of frameShapes || []) {
    const pos = await resolveBoardCoords(shape, parentGeomCache, log);
    if (!pos) continue;
    shapeEntries.push({ item: shape, x: pos.x, y: pos.y });
  }

  const textEntries = [];
  for (const text of frameTexts || []) {
    const pos = await resolveBoardCoords(text, parentGeomCache, log);
    if (!pos) continue;
    textEntries.push({ item: text, x: pos.x, y: pos.y });
  }

  const buttons = chooseBestButtonShapeTriplet(shapeEntries);
  if (!buttons) return null;

  const globalInput = chooseGlobalInputText(textEntries, buttons.right);

  return {
    aiItemId: buttons.left.item.id,
    clusterItemId: buttons.middle.item.id,
    globalAgentItemId: buttons.right.item.id,
    globalAgentInputItemId: globalInput ? globalInput.item.id : null,
    frameId
  };
}

async function createInstanceActionShapes(instance, image, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  const hasCreateShape = typeof board?.createShape === "function";
  const hasCreateText  = typeof board?.createText === "function";
  const hasCreateFrame = typeof board?.createFrame === "function";

  if (!hasCreateShape || !hasCreateFrame) return;

  const frameWidth  = image.width + ACTION_LAYOUT.frameWidthPaddingPx;
  const frameHeight = image.height + ACTION_LAYOUT.frameHeightPaddingPx;
  const frameY = image.y + ACTION_LAYOUT.frameCenterYOffsetPx;

  const frame = await board.createFrame({
    title: image.title || "Datentreiber 3-Boxes",
    x: image.x,
    y: frameY,
    width: frameWidth,
    height: frameHeight
  });

  const baseY = image.y + image.height / 2 + ACTION_LAYOUT.buttonRowOffsetFromImageBottomPx;
  const baseX = image.x;
  const dx = ACTION_LAYOUT.buttonOffsetXPx;
  const buttonWidth = ACTION_LAYOUT.buttonWidthPx;
  const buttonHeight = ACTION_LAYOUT.buttonHeightPx;

  const aiShape = await board.createShape({
    content: ACTION_LABELS.ai,
    shape: "round_rectangle",
    x: baseX - dx,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  });

  const clusterShape = await board.createShape({
    content: ACTION_LABELS.cluster,
    shape: "round_rectangle",
    x: baseX,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  });

  const globalAgentShape = await board.createShape({
    content: ACTION_LABELS.global,
    shape: "round_rectangle",
    x: baseX + dx,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  });

  let globalInput = null;
  if (hasCreateText) {
    globalInput = await board.createText({
      content: "",
      x: baseX + dx,
      y: baseY + ACTION_LAYOUT.inputOffsetFromButtonTopPx
    });
  }

  try {
    await frame.add(image);
    await frame.add(aiShape);
    await frame.add(clusterShape);
    await frame.add(globalAgentShape);
    if (globalInput) await frame.add(globalInput);
    await frame.sync();
  } catch (e) {
    console.error("[DT] Fehler beim Hinzufügen der Items zum Frame:", e);
  }

  instance.actionItems = normalizeActionItems({
    aiItemId: aiShape.id,
    clusterItemId: clusterShape.id,
    globalAgentItemId: globalAgentShape.id,
    globalAgentInputItemId: globalInput ? globalInput.id : null,
    frameId: frame.id
  });

  await saveActionBindingForImageId(image.id, instance.actionItems, log);
}

async function maybeSetFrameIdFromParent(instance, itemWithParent, log) {
  if (!instance || !itemWithParent?.parentId) return;
  if (instance.actionItems?.frameId) return;

  try {
    const parent = await getItemById(itemWithParent.parentId, log);
    if (parent?.type === "frame") {
      instance.actionItems = instance.actionItems || {};
      instance.actionItems.frameId = parent.id;
    }
  } catch (_) {}
}

// --------------------------------------------------------------------
// Register/Scan/Rebind Instanzen
// --------------------------------------------------------------------
export async function registerInstanceFromImage(image, {
  templateCatalog,
  defaultTemplateId,
  instancesByImageId,
  instancesById,
  hasGlobalBaseline,
  createActionShapes = true,
  canvasTypeId = null,
  log
}) {
  await ensureMiroReady(log);

  if (!image?.id) return null;

  const detectedCanvasTypeId =
    canvasTypeId ||
    detectCanvasTypeIdFromImage(image, templateCatalog) ||
    defaultTemplateId;

  const canvasTypeLabel = getCanvasTypeDisplayName(templateCatalog, detectedCanvasTypeId, defaultTemplateId);

  let meta = await readCanvasInstanceMeta(image, templateCatalog, defaultTemplateId, log);
  let instanceSerial = normalizePositiveInt(meta.instanceSerial);
  let instanceLabel = instanceSerial
    ? formatInstanceLabel(templateCatalog, detectedCanvasTypeId, instanceSerial, defaultTemplateId)
    : null;

  if (!instanceSerial) {
    instanceSerial = computeNextInstanceSerial(instancesById, detectedCanvasTypeId);
    instanceLabel = formatInstanceLabel(templateCatalog, detectedCanvasTypeId, instanceSerial, defaultTemplateId);
    meta = await writeCanvasInstanceMeta(image, {
      version: 1,
      canvasTypeId: detectedCanvasTypeId,
      instanceSerial,
      instanceLabel
    }, templateCatalog, defaultTemplateId, log);
  } else if (meta.canvasTypeId !== detectedCanvasTypeId || meta.instanceLabel !== instanceLabel) {
    meta = await writeCanvasInstanceMeta(image, {
      version: 1,
      canvasTypeId: detectedCanvasTypeId,
      instanceSerial,
      instanceLabel
    }, templateCatalog, defaultTemplateId, log);
  }

  instanceSerial = normalizePositiveInt(meta.instanceSerial) || instanceSerial;
  instanceLabel = meta.instanceLabel || instanceLabel;
  const internalInstanceId = buildInternalInstanceIdFromImageId(image.id);

  let instance = instancesByImageId.get(image.id);
  if (instance) {
    const previousInstanceId = instance.instanceId;
    instance.title = image.title || instance.title || "Canvas";
    instance.canvasTypeId = detectedCanvasTypeId || instance.canvasTypeId || defaultTemplateId;
    instance.canvasTypeLabel = canvasTypeLabel;
    instance.instanceSerial = instanceSerial;
    instance.instanceLabel = instanceLabel;
    instance.instanceId = internalInstanceId;
    instance.lastGeometry = { x: image.x, y: image.y, width: image.width, height: image.height };
    instance.actionItems = normalizeActionItems(instance.actionItems);

    if (previousInstanceId && previousInstanceId !== internalInstanceId) {
      instancesById.delete(previousInstanceId);
      instancesById.set(internalInstanceId, instance);
    } else if (!instancesById.has(internalInstanceId)) {
      instancesById.set(internalInstanceId, instance);
    }

    if (!createActionShapes) {
      await maybeSetFrameIdFromParent(instance, image, log);
    }

    if (hasGlobalBaseline && !instance.baselineSignatureLoaded) {
      instance.baselineSignature = await loadBaselineSignatureForImageId(image.id, log);
      instance.baselineSignatureLoaded = true;
    }

    return instance;
  }

  instance = {
    instanceId: internalInstanceId,
    canvasTypeId: detectedCanvasTypeId || defaultTemplateId,
    canvasTypeLabel,
    instanceSerial,
    instanceLabel,
    imageId: image.id,
    title: image.title || "Canvas",
    lastGeometry: { x: image.x, y: image.y, width: image.width, height: image.height },

    baselineSignature: null,
    baselineSignatureLoaded: false,
    lastSignature: null,
    lastStateHash: null,

    lastClassification: null,
    lastStateJson: null,
    lastStickyCount: 0,
    lastChangedAt: null,
    lastDiff: null,

    lastAgentRunAt: null,
    actionItems: normalizeActionItems(null),
    liveCatalog: null
  };

  if (!createActionShapes) {
    await maybeSetFrameIdFromParent(instance, image, log);
  }

  instancesByImageId.set(image.id, instance);
  instancesById.set(internalInstanceId, instance);

  if (typeof log === "function") {
    log("Neue Canvas-Instanz registriert: " + instance.instanceLabel + " (Bild-ID " + image.id + ")");
  }

  if (hasGlobalBaseline && !instance.baselineSignatureLoaded) {
    instance.baselineSignature = await loadBaselineSignatureForImageId(image.id, log);
    instance.baselineSignatureLoaded = true;
  }

  if (createActionShapes) {
    try {
      await createInstanceActionShapes(instance, image, log);
    } catch (e) {
      console.error("[DT] Fehler beim Erzeugen der Action-Shapes:", e);
    }
  }

  return instance;
}

async function rebindActionShapesAfterScan(images, instancesByImageId, instancesById, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.get) return;

  let shapes = [];
  let textItems = [];

  try {
    shapes = await board.get({ type: "shape" }) || [];
    textItems = await board.get({ type: "text" }) || [];
  } catch (e) {
    if (typeof log === "function") log("Fehler bei Rebind der Action-Shapes: " + e.message);
    return;
  }

  const shapesByParent = new Map();
  for (const s of shapes) {
    const pid = s.parentId;
    if (!pid) continue;
    if (!shapesByParent.has(pid)) shapesByParent.set(pid, []);
    shapesByParent.get(pid).push(s);
  }

  const textsByParent = new Map();
  for (const t of textItems) {
    const pid = t.parentId;
    if (!pid) continue;
    if (!textsByParent.has(pid)) textsByParent.set(pid, []);
    textsByParent.get(pid).push(t);
  }

  const imageById = new Map();
  for (const img of images || []) imageById.set(img.id, img);

  for (const [imageId, inst] of instancesByImageId.entries()) {
    const img = imageById.get(imageId);
    if (!img) continue;

    const frameId = img.parentId || inst?.actionItems?.frameId || null;
    if (!frameId) {
      inst.actionItems = normalizeActionItems(inst.actionItems);
      continue;
    }

    const frameShapes = shapesByParent.get(frameId) || [];
    const frameTexts  = textsByParent.get(frameId) || [];

    let rebound = await validateActionBindingForImage(img, inst.actionItems, log);

    if (!hasCompleteActionBinding(rebound)) {
      const persisted = await loadActionBindingForImageId(imageId, log);
      const validatedPersisted = await validateActionBindingForImage(img, persisted, log);
      rebound = mergeActionItems(rebound, validatedPersisted);
    }

    if (!hasCompleteActionBinding(rebound)) {
      const inferred = await inferActionItemsFromFrameGeometry(img, frameId, frameShapes, frameTexts, log);
      rebound = mergeActionItems(rebound, inferred);
    }

    inst.actionItems = normalizeActionItems(rebound);

    if (hasCompleteActionBinding(inst.actionItems)) {
      if (typeof log === "function") log("Action-Shapes re-gebunden für Instanz " + (inst.instanceLabel || inst.instanceId));
      await saveActionBindingForImageId(imageId, inst.actionItems, log);
    }
  }

  // optional: instancesById ist derselbe Object-Graph; nichts weiter nötig
}

export async function scanTemplateInstances({
  templateCatalog,
  defaultTemplateId,
  instancesByImageId,
  instancesById,
  hasGlobalBaseline,
  log
}) {
  await ensureMiroReady(log);

  const board = getBoard();
  if (!board?.get) return [];

  let images = [];
  try {
    images = await board.get({ type: "image" });
  } catch (e) {
    console.error("[DT] Fehler beim Laden der Images:", e);
    return [];
  }
  if (!Array.isArray(images)) return [];

  await ensureReadableInstanceLabelsForImages(images, templateCatalog, defaultTemplateId, log);

  const templateImageIdsOnBoard = new Set();

  for (const img of images) {
    const canvasTypeId = detectCanvasTypeIdFromImage(img, templateCatalog);
    if (canvasTypeId) {
      templateImageIdsOnBoard.add(img.id);
      await registerInstanceFromImage(img, {
        templateCatalog,
        defaultTemplateId,
        instancesByImageId,
        instancesById,
        hasGlobalBaseline,
        createActionShapes: false,
        canvasTypeId,
        log
      });
    }
  }

  const orphanImageIds = new Set();

  for (const imageId of await loadActionBindingIndex(log)) {
    if (!templateImageIdsOnBoard.has(imageId)) {
      orphanImageIds.add(imageId);
    }
  }

  for (const imageId of Array.from(instancesByImageId.keys())) {
    if (!templateImageIdsOnBoard.has(imageId)) {
      orphanImageIds.add(imageId);
    }
  }

  for (const imageId of orphanImageIds) {
    const inst = instancesByImageId.get(imageId) || null;
    const actionItems = hasAnyActionItems(inst?.actionItems)
      ? normalizeActionItems(inst.actionItems)
      : (await loadActionBindingForImageId(imageId, log));

    instancesByImageId.delete(imageId);
    if (inst) {
      instancesById.delete(inst.instanceId);
      if (typeof log === "function") {
        log("Canvas-Instanz entfernt (Template-Bild gelöscht): " + (inst.instanceLabel || inst.instanceId) + " (Bild-ID " + imageId + ")");
      }
    }

    if (actionItems) {
      await cleanupOrphanedActionArtifacts(imageId, actionItems, log).catch(() => {});
    }

    await removeBaselineSignatureForImageId(imageId, log).catch(() => {});
    await removeActionBindingForImageId(imageId, log).catch(() => {});
  }

  // Rebind nach Scan (Buttons/Frames wieder verbinden)
  await rebindActionShapesAfterScan(images, instancesByImageId, instancesById, log);

  return images;
}
