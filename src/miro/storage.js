import {
  DT_STORAGE_COLLECTION_NAME,
  DT_STORAGE_KEY_META,
  DT_STORAGE_KEY_BASELINE_PREFIX,
  DT_STORAGE_KEY_ACTION_BINDING_PREFIX,
  DT_STORAGE_KEY_ACTION_BINDING_INDEX,
  DT_STORAGE_KEY_MEMORY_STATE,
  DT_STORAGE_KEY_MEMORY_LOG_INDEX,
  DT_STORAGE_KEY_MEMORY_LOG_ENTRY_PREFIX,
  DT_ANCHOR_META_KEY_BOARD,
  DT_STORAGE_KEY_EXERCISE_RUNTIME,
  DT_STORAGE_KEY_BOARD_FLOW_INDEX,
  DT_STORAGE_KEY_BOARD_FLOW_PREFIX,
  DT_DEFAULT_FEEDBACK_FRAME_NAME,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_DEFAULT_APP_ADMIN_POLICY
} from "../config.js?v=20260303-flowbatch1";

import { normalizeBoardFlow } from "../runtime/board-flow.js?v=20260303-flowbatch1";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260305-batch05";
import { compareItemIdsAsc, normalizePositiveInt, uniqueIds, asTrimmedString } from "./helpers.js?v=20260305-batch05";

// --------------------------------------------------------------------
// Storage, board config, baseline, memory and exercise runtime
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

export function normalizeActionItems(actionItems) {
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

export function hasAnyActionItems(actionItems) {
  const norm = normalizeActionItems(actionItems);
  return !!(norm.aiItemId || norm.clusterItemId || norm.globalAgentItemId || norm.globalAgentInputItemId || norm.frameId);
}

export function hasCompleteActionBinding(actionItems) {
  const norm = normalizeActionItems(actionItems);
  return !!(norm.frameId && norm.aiItemId && norm.clusterItemId && norm.globalAgentItemId);
}

export function mergeActionItems(primary, secondary) {
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

export async function loadActionBindingIndex(log) {
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

export async function saveActionBindingIndex(imageIds, log) {
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

export async function addImageIdToActionBindingIndex(imageId, log) {
  if (!imageId) return;

  const ids = await loadActionBindingIndex(log);
  const key = String(imageId);
  if (!ids.includes(key)) {
    ids.push(key);
    await saveActionBindingIndex(ids, log);
  }
}

export async function removeImageIdFromActionBindingIndex(imageId, log) {
  if (!imageId) return;

  const key = String(imageId);
  const ids = await loadActionBindingIndex(log);
  const nextIds = ids.filter((id) => id !== key);
  if (nextIds.length !== ids.length) {
    await saveActionBindingIndex(nextIds, log);
  }
}

export async function loadActionBindingForImageId(imageId, log) {
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

export async function saveActionBindingForImageId(imageId, actionItems, log) {
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

export async function removeActionBindingForImageId(imageId, log) {
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
