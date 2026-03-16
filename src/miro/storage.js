import {
  DT_STORAGE_COLLECTION_NAME,
  DT_STORAGE_KEY_META,
  DT_STORAGE_KEY_BASELINE_PREFIX,
  DT_STORAGE_KEY_MEMORY_STATE,
  DT_STORAGE_KEY_MEMORY_LOG_INDEX,
  DT_STORAGE_KEY_MEMORY_LOG_ENTRY_PREFIX,
  DT_ANCHOR_META_KEY_BOARD,
  DT_STORAGE_KEY_EXERCISE_RUNTIME,
  DT_STORAGE_KEY_BOARD_FLOW_INDEX,
  DT_STORAGE_KEY_BOARD_FLOW_PREFIX,
  DT_STORAGE_KEY_RUN_STATE,
  DT_STORAGE_KEY_ACTIVE_PROPOSAL_PREFIX,
  DT_STORAGE_KEY_PROPOSAL_INDEX,
  DT_STORAGE_KEY_PROPOSAL_PREFIX,
  DT_MEMORY_RECENT_LOG_LIMIT,
  DT_EXECUTION_MODES
} from "../config.js?v=20260316-patch19-analytics-ai-maturity-pack";

import { normalizeBoardFlow } from "../runtime/board-flow.js?v=20260316-patch19-analytics-ai-maturity-pack";
import { normalizeUiLanguage } from "../i18n/index.js?v=20260316-patch19-analytics-ai-maturity-pack";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260316-patch19-analytics-ai-maturity-pack";
import { compareItemIdsAsc, normalizePositiveInt, asTrimmedString } from "./helpers.js?v=20260316-patch19-analytics-ai-maturity-pack";

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

function uniqueIds(ids) {
  return Array.from(new Set((ids || []).filter(Boolean)));
}

function normalizeStringArray(values) {
  return uniqueIds((Array.isArray(values) ? values : []).map((value) => asTrimmedString(value)).filter(Boolean));
}

function normalizeOptionalStringArray(values) {
  return Array.isArray(values) ? normalizeStringArray(values) : null;
}

function normalizeOptionalExecutionMode(value) {
  const normalized = asTrimmedString(value);
  return normalized && DT_EXECUTION_MODES.includes(normalized) ? normalized : null;
}

function normalizeFlowEndpointRuntimeOverride(rawOverride) {
  const src = (rawOverride && typeof rawOverride === "object") ? rawOverride : {};
  return {
    promptText: asTrimmedString(src.promptText) || null,
    executionMode: normalizeOptionalExecutionMode(src.executionMode),
    allowedActions: normalizeOptionalStringArray(src.allowedActions),
    allowedActionAreas: normalizeOptionalStringArray(src.allowedActionAreas)
  };
}

function normalizeFlowEndpointRuntimeOverrideMap(rawMap) {
  const src = (rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)) ? rawMap : {};
  const entries = Object.entries(src)
    .map(([endpointId, rawOverride]) => {
      const normalizedEndpointId = asTrimmedString(endpointId);
      if (!normalizedEndpointId) return null;
      const normalizedOverride = normalizeFlowEndpointRuntimeOverride(rawOverride);
      const hasMeaningfulValue = !!(
        normalizedOverride.promptText ||
        normalizedOverride.executionMode ||
        normalizedOverride.allowedActions !== null ||
        normalizedOverride.allowedActionAreas !== null
      );
      return hasMeaningfulValue ? [normalizedEndpointId, normalizedOverride] : null;
    })
    .filter(Boolean);
  return Object.freeze(Object.fromEntries(entries));
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

function normalizeRunStateStatus(value) {
  const normalized = asTrimmedString(value);
  if (!normalized) return null;
  return ["running", "completed", "failed", "conflicted", "aborted"].includes(normalized)
    ? normalized
    : null;
}

export function normalizeBoardRunState(rawState) {
  const src = (rawState && typeof rawState === "object") ? rawState : {};
  return {
    version: 1,
    runId: asTrimmedString(src.runId),
    status: normalizeRunStateStatus(src.status),
    startedAt: asTrimmedString(src.startedAt),
    actor: asTrimmedString(src.actor),
    targetInstanceIds: uniqueIds(Array.isArray(src.targetInstanceIds) ? src.targetInstanceIds : []),
    statusItemIds: uniqueIds(Array.isArray(src.statusItemIds) ? src.statusItemIds : []),
    message: asTrimmedString(src.message),
    finishedAt: asTrimmedString(src.finishedAt),
    updatedAt: asTrimmedString(src.updatedAt)
  };
}

export async function loadBoardRunState(log) {
  await ensureMiroReady(log);
  const col = getStorageCollection();
  if (!col) return null;

  try {
    const raw = await col.get(DT_STORAGE_KEY_RUN_STATE);
    const normalized = normalizeBoardRunState(raw);
    return normalized.runId ? normalized : null;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Board-Run-State: " + e.message);
    return null;
  }
}

export async function saveBoardRunState(runState, log) {
  await ensureMiroReady(log);

  const normalized = normalizeBoardRunState({
    ...(runState && typeof runState === "object" ? runState : {}),
    updatedAt: new Date().toISOString()
  });

  if (!normalized.runId) return null;

  const col = getStorageCollection();
  if (!col) return normalized;

  try {
    await col.set(DT_STORAGE_KEY_RUN_STATE, normalized);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Board-Run-State: " + e.message);
  }

  return normalized;
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

export function normalizeBoardConfig(rawConfig = {}) {
  const src = (rawConfig && typeof rawConfig === "object") ? rawConfig : {};
  return {
    mode: asTrimmedString(src.mode) || null,
    defaultCanvasTypeId: asTrimmedString(src.defaultCanvasTypeId) || null,
    lang: normalizeUiLanguage(src.lang),
    defaultFeedbackTarget: asTrimmedString(src.defaultFeedbackTarget) || null,
    adminPolicy: asTrimmedString(src.adminPolicy) || null,
    systemTags: normalizeStringArray(src.systemTags),
    flowControlsStaticLayout: src.flowControlsStaticLayout === false ? false : true
  };
}

export function normalizeExerciseRuntime(rawRuntime = {}) {
  const src = (rawRuntime && typeof rawRuntime === "object") ? rawRuntime : {};
  return {
    adminOverride: asTrimmedString(src.adminOverride) || null,
    flowEndpointOverridesById: normalizeFlowEndpointRuntimeOverrideMap(src.flowEndpointOverridesById),
    lastEndpointId: asTrimmedString(src.lastEndpointId) || null,
    lastFlowDirectiveUnlockEndpointIds: normalizeStringArray(src.lastFlowDirectiveUnlockEndpointIds),
    lastFlowDirectiveCompleteEndpointIds: normalizeStringArray(src.lastFlowDirectiveCompleteEndpointIds),
    lastActiveFlowAnchorInstanceId: asTrimmedString(src.lastActiveFlowAnchorInstanceId) || null
  };
}

const BOARD_ANCHOR_LAYOUT = {
  x: 0,
  y: 0,
  width: 8,
  height: 8
};

function isBoardAnchorMeta(meta) {
  return !!(meta && typeof meta === "object" && !Array.isArray(meta));
}

function pickCanonicalBoardAnchor(anchors) {
  const normalized = Array.isArray(anchors) ? anchors.filter(Boolean).slice() : [];
  normalized.sort(compareItemIdsAsc);
  return normalized[0] || null;
}

async function removeBoardAnchorItem(item, log) {
  await ensureMiroReady(log);
  if (!item?.id) return false;

  const board = getBoard();
  if (!board?.remove) return false;

  try {
    await board.remove(item);
    if (typeof log === "function") {
      log("WARNUNG: Zusätzlicher Board-Anchor entfernt (Item " + item.id + ").");
    }
    return true;
  } catch (e) {
    if (typeof log === "function") {
      log("WARNUNG: Zusätzlicher Board-Anchor konnte nicht entfernt werden (Item " + item.id + "): " + e.message);
    }
    return false;
  }
}

async function cleanupDuplicateBoardAnchors(anchors, canonical, log) {
  if (!canonical?.id) return canonical || null;

  const duplicates = (Array.isArray(anchors) ? anchors : []).filter((anchor) => anchor?.id && anchor.id !== canonical.id);
  for (const duplicate of duplicates) {
    await removeBoardAnchorItem(duplicate, log);
  }
  return canonical;
}

export async function isBoardAnchorItem(item, log) {
  await ensureMiroReady(log);

  if (!item?.getMetadata) return false;

  try {
    const meta = await item.getMetadata(DT_ANCHOR_META_KEY_BOARD);
    return isBoardAnchorMeta(meta);
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
      if (isBoardAnchorMeta(meta)) {
        anchors.push(shape);
      }
    } catch (error) {
      if (typeof log === "function") log("WARNUNG: Board-Anchor-Metadata konnte für Shape " + (shape?.id || "(unbekannt)") + " nicht gelesen werden: " + (error?.message || String(error)));
    }
  }

  anchors.sort(compareItemIdsAsc);
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
  } catch (error) {
    if (typeof log === "function") log("WARNUNG: Board-Anchor konnte nicht in den Hintergrund gelegt werden: " + (error?.message || String(error)));
  }

  if (typeof log === "function") {
    log("Board-Anchor erstellt (Item " + anchor.id + ").");
  }

  return anchor;
}

export async function ensureBoardAnchor({ defaultCanvasTypeId = null, log } = {}) {
  await ensureMiroReady(log);

  let anchors = await listBoardAnchorItems(log);
  let createdAnchor = null;

  if (!anchors.length) {
    createdAnchor = await createBoardAnchorItem(log);
    const initialConfig = normalizeBoardConfig({ defaultCanvasTypeId });

    try {
      if (createdAnchor?.setMetadata) {
        await createdAnchor.setMetadata(DT_ANCHOR_META_KEY_BOARD, initialConfig);
      }
    } catch (e) {
      if (typeof log === "function") log("Fehler beim Initialisieren des Board-Anchors: " + e.message);
    }

    anchors = await listBoardAnchorItems(log);
    if (!anchors.length && createdAnchor) {
      anchors = [createdAnchor];
    }
  }

  const canonical = pickCanonicalBoardAnchor(anchors);
  if (!canonical) {
    throw new Error("Board-Anchor konnte nicht sichergestellt werden.");
  }

  await cleanupDuplicateBoardAnchors(anchors, canonical, log);

  let rawMeta = null;
  try {
    rawMeta = canonical?.getMetadata ? await canonical.getMetadata(DT_ANCHOR_META_KEY_BOARD) : null;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Lesen der Board-Konfiguration aus dem Anchor: " + e.message);
  }

  const normalized = normalizeBoardConfig(rawMeta);
  try {
    if (canonical?.setMetadata && JSON.stringify(rawMeta || null) !== JSON.stringify(normalized)) {
      await canonical.setMetadata(DT_ANCHOR_META_KEY_BOARD, normalized);
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Normalisieren des Board-Anchors: " + e.message);
  }

  return canonical;
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

  const normalized = normalizeBoardConfig(rawMeta);

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
  const normalized = normalizeBoardConfig(config);

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

function compareMemoryLogEntriesAsc(a, b) {
  const aTs = typeof a?.ts === "string" ? a.ts : "";
  const bTs = typeof b?.ts === "string" ? b.ts : "";
  if (aTs !== bTs) return aTs.localeCompare(bTs);
  return String(a?.entryId || "").localeCompare(String(b?.entryId || ""));
}

function getMemoryLogRetentionLimit() {
  return normalizePositiveInt(DT_MEMORY_RECENT_LOG_LIMIT) || 5;
}

async function loadPersistedMemoryLogEntries(entryIds, col) {
  const values = await Promise.all((entryIds || []).map((entryId) => col.get(memoryLogEntryKey(entryId)).catch(() => undefined)));
  const result = [];

  for (let i = 0; i < (entryIds || []).length; i++) {
    const value = values[i];
    if (!value || typeof value !== "object") continue;
    result.push({
      entryId: value.entryId || entryIds[i],
      ...value
    });
  }

  result.sort(compareMemoryLogEntriesAsc);
  return result;
}

async function prunePersistedMemoryLog(col, log) {
  if (!col) return [];

  const entryIds = await loadMemoryLogIndex(log);
  if (!entryIds.length) return [];

  const persistedEntries = await loadPersistedMemoryLogEntries(entryIds, col);
  const retentionLimit = getMemoryLogRetentionLimit();
  const retainedEntries = retentionLimit > 0
    ? persistedEntries.slice(Math.max(0, persistedEntries.length - retentionLimit))
    : persistedEntries;
  const retainedEntryIds = retainedEntries.map((entry) => entry.entryId).filter(Boolean);
  const retainedIdSet = new Set(retainedEntryIds);
  const staleEntryIds = entryIds.filter((entryId) => !retainedIdSet.has(entryId));

  if (staleEntryIds.length) {
    await Promise.all(staleEntryIds.map((entryId) => col.remove(memoryLogEntryKey(entryId)).catch(() => undefined)));
  }

  const indexNeedsUpdate = staleEntryIds.length > 0
    || retainedEntryIds.length !== entryIds.length
    || retainedEntryIds.some((entryId, index) => entryId !== entryIds[index]);

  if (indexNeedsUpdate) {
    await saveMemoryLogIndex(retainedEntryIds, log);
  }

  return retainedEntries;
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

export async function clearMemoryState(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return false;

  try {
    await col.remove(DT_STORAGE_KEY_MEMORY_STATE);
    return true;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Löschen des Memory-State: " + e.message);
    return false;
  }
}

export async function clearMemoryLog(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return 0;

  try {
    const entryIds = await loadMemoryLogIndex(log);
    if (entryIds.length) {
      await Promise.all(entryIds.map((entryId) => col.remove(memoryLogEntryKey(entryId)).catch(() => undefined)));
    }
    await col.remove(DT_STORAGE_KEY_MEMORY_LOG_INDEX).catch(() => undefined);
    return entryIds.length;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Löschen des Memory-Logs: " + e.message);
    return 0;
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
  const normalized = normalizeExerciseRuntime(runtime);

  if (!col) return normalized;

  try {
    await col.set(DT_STORAGE_KEY_EXERCISE_RUNTIME, normalized);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Exercise-Runtime-State: " + e.message);
  }

  return normalized;
}


function proposalRecordKey(proposalId) {
  return DT_STORAGE_KEY_PROPOSAL_PREFIX + String(proposalId);
}

function activeProposalKey(anchorInstanceId, stepId = null) {
  const normalizedAnchorInstanceId = asTrimmedString(anchorInstanceId);
  const normalizedStepId = asTrimmedString(stepId) || "__default__";
  if (!normalizedAnchorInstanceId) return null;
  return DT_STORAGE_KEY_ACTIVE_PROPOSAL_PREFIX + normalizedAnchorInstanceId + "::" + normalizedStepId;
}

function buildProposalRecordId() {
  return "p-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
}

function normalizeProposalStatus(value) {
  const normalized = asTrimmedString(value);
  if (!normalized) return "pending";
  return ["pending", "applied", "superseded", "discarded", "stale"].includes(normalized)
    ? normalized
    : "pending";
}

export function normalizeProposalRecord(rawRecord) {
  const src = (rawRecord && typeof rawRecord === "object") ? rawRecord : {};
  const targetInstanceLabels = uniqueIds(Array.isArray(src.targetInstanceLabels) ? src.targetInstanceLabels.map((value) => asTrimmedString(value)).filter(Boolean) : []);
  const actions = Array.isArray(src.actions) ? src.actions.map((action) => ({ ...(action && typeof action === "object" ? action : {}) })) : [];
  const endpointId = asTrimmedString(src.endpointId);
  const exercisePackId = asTrimmedString(src.exercisePackId);
  const id = asTrimmedString(src.id) || asTrimmedString(src.proposalId);
  const flowDirectives = {
    unlockEndpointIds: uniqueIds(Array.isArray(src.flowDirectives?.unlockEndpointIds) ? src.flowDirectives.unlockEndpointIds : []),
    completeEndpointIds: uniqueIds(Array.isArray(src.flowDirectives?.completeEndpointIds) ? src.flowDirectives.completeEndpointIds : [])
  };
  return {
    version: 2,
    id,
    proposalId: id,
    status: normalizeProposalStatus(src.status),
    createdAt: asTrimmedString(src.createdAt),
    updatedAt: asTrimmedString(src.updatedAt),
    anchorInstanceId: asTrimmedString(src.anchorInstanceId),
    anchorInstanceLabel: asTrimmedString(src.anchorInstanceLabel),
    targetInstanceLabels,
    canvasTypeId: asTrimmedString(src.canvasTypeId),
    exercisePackId,
    stepId: asTrimmedString(src.stepId),
    stepLabel: asTrimmedString(src.stepLabel),
    endpointId,
    controlId: asTrimmedString(src.controlId),
    basedOnStateHash: asTrimmedString(src.basedOnStateHash),
    basedOnHeaderSummary: asTrimmedString(src.basedOnHeaderSummary),
    basedOnStickyCount: Number.isFinite(Number(src.basedOnStickyCount)) ? Number(src.basedOnStickyCount) : null,
    userRequest: asTrimmedString(src.userRequest),
    analysis: (src.analysis && typeof src.analysis === "object") ? { ...src.analysis } : asTrimmedString(src.analysis),
    feedback: (src.feedback && typeof src.feedback === "object") ? { ...src.feedback } : null,
    actions,
    memoryEntry: (src.memoryEntry && typeof src.memoryEntry === "object") ? { ...src.memoryEntry } : null,
    flowDirectives,
    evaluation: (src.evaluation && typeof src.evaluation === "object") ? { ...src.evaluation } : null
  };
}

async function loadLegacyProposalIndex(log) {
  await ensureMiroReady(log);
  const col = getStorageCollection();
  if (!col) return [];

  try {
    const value = await col.get(DT_STORAGE_KEY_PROPOSAL_INDEX);
    if (value && typeof value === "object" && value.version === 1 && Array.isArray(value.proposalIds)) {
      return uniqueIds(value.proposalIds.map((id) => String(id)).filter(Boolean));
    }
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Legacy-Proposal-Index: " + e.message);
  }

  return [];
}

export async function purgeLegacyProposalStorage(log) {
  await ensureMiroReady(log);
  const col = getStorageCollection();
  if (!col) return { removedProposalIds: [], removedIndex: false };

  const proposalIds = await loadLegacyProposalIndex(log);
  const removedProposalIds = [];
  for (const proposalId of proposalIds) {
    try {
      await col.remove(proposalRecordKey(proposalId));
      removedProposalIds.push(proposalId);
    } catch (error) {
      if (typeof log === "function") log("WARNUNG: Legacy-Proposal '" + proposalId + "' konnte nicht entfernt werden: " + (error?.message || String(error)));
    }
  }

  let removedIndex = false;
  try {
    await col.remove(DT_STORAGE_KEY_PROPOSAL_INDEX);
    removedIndex = true;
  } catch (error) {
    if (typeof log === "function") log("WARNUNG: Legacy-Proposal-Index konnte nicht entfernt werden: " + (error?.message || String(error)));
  }

  return { removedProposalIds, removedIndex };
}

export async function loadActiveProposal({ anchorInstanceId = null, stepId = null } = {}, log) {
  await ensureMiroReady(log);
  const storageKey = activeProposalKey(anchorInstanceId, stepId);
  if (!storageKey) return null;

  const col = getStorageCollection();
  if (!col) return null;

  try {
    const raw = await col.get(storageKey);
    const normalized = normalizeProposalRecord(raw);
    return normalized.proposalId && normalized.status === "pending" ? normalized : null;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Active-Proposal-Slots '" + storageKey + "': " + e.message);
    return null;
  }
}

export async function saveActiveProposal(record, log) {
  await ensureMiroReady(log);
  const col = getStorageCollection();
  const nowIso = new Date().toISOString();
  const normalized = normalizeProposalRecord({
    ...(record && typeof record === "object" ? record : {}),
    proposalId: asTrimmedString(record?.proposalId) || buildProposalRecordId(),
    createdAt: asTrimmedString(record?.createdAt) || nowIso,
    updatedAt: nowIso,
    status: "pending"
  });

  const storageKey = activeProposalKey(normalized.anchorInstanceId, normalized.stepId);
  if (!storageKey || !normalized.proposalId) return null;
  if (!col) return normalized;

  try {
    await col.set(storageKey, normalized);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern des Active-Proposal-Slots '" + storageKey + "': " + e.message);
  }

  return normalized;
}

export async function clearActiveProposal({ anchorInstanceId = null, stepId = null } = {}, log) {
  await ensureMiroReady(log);
  const storageKey = activeProposalKey(anchorInstanceId, stepId);
  if (!storageKey) return false;

  const col = getStorageCollection();
  if (!col) return false;

  try {
    await col.remove(storageKey);
    return true;
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Entfernen des Active-Proposal-Slots '" + storageKey + "': " + e.message);
    return false;
  }
}

export async function loadMemoryLog(log) {
  await ensureMiroReady(log);

  const col = getStorageCollection();
  if (!col) return [];

  try {
    return await prunePersistedMemoryLog(col, log);
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

    await prunePersistedMemoryLog(col, log);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Anhängen eines Memory-Log-Eintrags: " + e.message);
  }

  return storedEntry;
}
