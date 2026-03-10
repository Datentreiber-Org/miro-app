import { DT_IMAGE_META_KEY_INSTANCE, DT_CANVAS_DEFS, DT_SORTED_OUT_REGION_WIDTH_PX, DT_SORTED_OUT_BUFFER_WIDTH_PX } from "../config.js?v=20260310-batch92";
import { isFiniteNumber } from "../utils.js?v=20260301-step11-hotfix2";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260308-batch76";
import {
  compareItemIdsAsc,
  normalizePositiveInt,
  getCanvasTypeDisplayName,
  formatInstanceLabel,
  buildInternalInstanceIdFromImageId
} from "./helpers.js?v=20260305-batch05";
import { getItemById, resolveBoardCoords } from "./items.js?v=20260308-batch76";
import {
  normalizeChatInterfaceShapeIds,
  hasCompleteChatInterfaceShapeIds,
  createChatInterfaceForInstance,
  removeChatInterfaceShapes,
  hasApplyChatInterfaceShapeId,
  ensureChatApplyShapeForInstance
} from "./chat-interface.js?v=20260310-batch92";
import {
  loadBaselineSignatureForImageId,
  removeBaselineSignatureForImageId
} from "./storage.js?v=20260308-batch76";

// --------------------------------------------------------------------
// Template instance registration, geometry and scan/rebind logic
// --------------------------------------------------------------------
function normalizeCanvasInstanceChatInterface(rawShapeIds) {
  return normalizeChatInterfaceShapeIds(rawShapeIds);
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
  const chatInterface = normalizeCanvasInstanceChatInterface(src.chatInterface);

  return {
    version: 2,
    canvasTypeId,
    instanceSerial,
    instanceLabel,
    chatInterface
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
      originalChatInterface: normalizeCanvasInstanceChatInterface(meta.chatInterface),
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
          version: 2,
          canvasTypeId,
          instanceSerial: record.instanceSerial,
          instanceLabel: record.instanceLabel,
          chatInterface: normalizeCanvasInstanceChatInterface(record.originalChatInterface || null)
        }, templateCatalog, defaultTemplateId, log);
      }
    }
  }

  return records;
}

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

function getSortedOutOutsideOffsetBoard(canvasTypeId, geom) {
  const def = DT_CANVAS_DEFS?.[canvasTypeId] || null;
  const originalWidth = Number(def?.originalWidth);
  if (!geom || !isFiniteNumber(geom.width) || !Number.isFinite(originalWidth) || originalWidth <= 0) {
    return 0;
  }
  return geom.width * ((DT_SORTED_OUT_REGION_WIDTH_PX + DT_SORTED_OUT_BUFFER_WIDTH_PX) / originalWidth);
}

function normalizeBoardRect(rect) {
  if (!rect) return null;
  const left = isFiniteNumber(rect.left) ? Number(rect.left) : (isFiniteNumber(rect.x) && isFiniteNumber(rect.width) ? Number(rect.x) - Number(rect.width) / 2 : null);
  const right = isFiniteNumber(rect.right) ? Number(rect.right) : (isFiniteNumber(rect.x) && isFiniteNumber(rect.width) ? Number(rect.x) + Number(rect.width) / 2 : null);
  const top = isFiniteNumber(rect.top) ? Number(rect.top) : (isFiniteNumber(rect.y) && isFiniteNumber(rect.height) ? Number(rect.y) - Number(rect.height) / 2 : null);
  const bottom = isFiniteNumber(rect.bottom) ? Number(rect.bottom) : (isFiniteNumber(rect.y) && isFiniteNumber(rect.height) ? Number(rect.y) + Number(rect.height) / 2 : null);
  if (!isFiniteNumber(left) || !isFiniteNumber(right) || !isFiniteNumber(top) || !isFiniteNumber(bottom)) return null;
  if (right <= left || bottom <= top) return null;
  return {
    left,
    right,
    top,
    bottom,
    x: isFiniteNumber(rect.x) ? Number(rect.x) : (left + right) / 2,
    y: isFiniteNumber(rect.y) ? Number(rect.y) : (top + bottom) / 2,
    width: isFiniteNumber(rect.width) ? Number(rect.width) : (right - left),
    height: isFiniteNumber(rect.height) ? Number(rect.height) : (bottom - top)
  };
}

function buildOwnershipRectForEntry(entry) {
  const geom = entry?.geom;
  if (!geom || !isFiniteNumber(geom.x) || !isFiniteNumber(geom.y) || !isFiniteNumber(geom.width) || !isFiniteNumber(geom.height)) {
    return null;
  }
  const extra = getSortedOutOutsideOffsetBoard(entry?.inst?.canvasTypeId, geom);
  return {
    left: geom.x - geom.width / 2 - extra,
    right: geom.x + geom.width / 2 + extra,
    top: geom.y - geom.height / 2,
    bottom: geom.y + geom.height / 2,
    x: geom.x,
    y: geom.y,
    width: geom.width + extra * 2,
    height: geom.height
  };
}

function computeRectOverlapArea(a, b) {
  if (!a || !b) return 0;
  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (overlapX <= 0 || overlapY <= 0) return 0;
  return overlapX * overlapY;
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

export function findInstanceByRect(boardRect, geomEntries) {
  const rect = normalizeBoardRect(boardRect);
  if (!rect) return null;

  let bestInst = null;
  let bestOverlapArea = 0;
  let bestDistSq = Infinity;

  for (const entry of Array.isArray(geomEntries) ? geomEntries : []) {
    const ownershipRect = buildOwnershipRectForEntry(entry);
    if (!ownershipRect) continue;

    const overlapArea = computeRectOverlapArea(rect, ownershipRect);
    if (overlapArea <= 0) continue;

    const dx = rect.x - ownershipRect.x;
    const dy = rect.y - ownershipRect.y;
    const distSq = dx * dx + dy * dy;

    if (overlapArea > bestOverlapArea || (overlapArea === bestOverlapArea && distSq < bestDistSq)) {
      bestOverlapArea = overlapArea;
      bestDistSq = distSq;
      bestInst = entry.inst;
    }
  }

  return bestInst;
}

// --------------------------------------------------------------------
// Template-Detection und Instanz-Scan
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

export async function registerInstanceFromImage(image, {
  templateCatalog,
  defaultTemplateId,
  instancesByImageId,
  instancesById,
  hasGlobalBaseline,
  canvasTypeId = null,
  log,
  createChatInterface = false,
  displayLanguage = "de"
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
      version: 2,
      canvasTypeId: detectedCanvasTypeId,
      instanceSerial,
      instanceLabel,
      chatInterface: meta.chatInterface
    }, templateCatalog, defaultTemplateId, log);
  } else if (meta.canvasTypeId !== detectedCanvasTypeId || meta.instanceLabel !== instanceLabel) {
    meta = await writeCanvasInstanceMeta(image, {
      version: 2,
      canvasTypeId: detectedCanvasTypeId,
      instanceSerial,
      instanceLabel,
      chatInterface: meta.chatInterface
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
    instance.chatInterface = normalizeCanvasInstanceChatInterface(meta.chatInterface);
    instance.lastGeometry = { x: image.x, y: image.y, width: image.width, height: image.height };

    if (previousInstanceId && previousInstanceId !== internalInstanceId) {
      instancesById.delete(previousInstanceId);
      instancesById.set(internalInstanceId, instance);
    } else if (!instancesById.has(internalInstanceId)) {
      instancesById.set(internalInstanceId, instance);
    }


    if (createChatInterface) {
      try {
        if (!hasCompleteChatInterfaceShapeIds(instance.chatInterface)) {
          const shapeIds = await createChatInterfaceForInstance(instance, log, { lang: displayLanguage });
          instance.chatInterface = normalizeCanvasInstanceChatInterface(shapeIds);
        } else if (!hasApplyChatInterfaceShapeId(instance.chatInterface)) {
          const shapeIds = await ensureChatApplyShapeForInstance(instance, instance.chatInterface, log, { lang: displayLanguage });
          instance.chatInterface = normalizeCanvasInstanceChatInterface(shapeIds);
        }
        await writeCanvasInstanceMeta(image, {
          version: 2,
          canvasTypeId: detectedCanvasTypeId,
          instanceSerial,
          instanceLabel,
          chatInterface: instance.chatInterface
        }, templateCatalog, defaultTemplateId, log);
      } catch (e) {
        if (typeof log === "function") {
          log("WARNUNG: Chat-Interface konnte für Instanz " + (instance.instanceLabel || instance.instanceId) + " nicht erstellt oder ergänzt werden: " + e.message);
        }
      }
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
    chatInterface: normalizeCanvasInstanceChatInterface(meta.chatInterface),
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
    liveCatalog: null
  };


  instancesByImageId.set(image.id, instance);
  instancesById.set(internalInstanceId, instance);

  if (typeof log === "function") {
    log("Neue Canvas-Instanz registriert: " + instance.instanceLabel + " (Bild-ID " + image.id + ")");
  }

  if (createChatInterface) {
    try {
      if (!hasCompleteChatInterfaceShapeIds(instance.chatInterface)) {
        const shapeIds = await createChatInterfaceForInstance(instance, log, { lang: displayLanguage });
        instance.chatInterface = normalizeCanvasInstanceChatInterface(shapeIds);
      } else if (!hasApplyChatInterfaceShapeId(instance.chatInterface)) {
        const shapeIds = await ensureChatApplyShapeForInstance(instance, instance.chatInterface, log, { lang: displayLanguage });
        instance.chatInterface = normalizeCanvasInstanceChatInterface(shapeIds);
      }
      await writeCanvasInstanceMeta(image, {
        version: 2,
        canvasTypeId: detectedCanvasTypeId,
        instanceSerial,
        instanceLabel,
        chatInterface: instance.chatInterface
      }, templateCatalog, defaultTemplateId, log);
    } catch (e) {
      if (typeof log === "function") {
        log("WARNUNG: Chat-Interface konnte für Instanz " + (instance.instanceLabel || instance.instanceId) + " nicht erstellt oder ergänzt werden: " + e.message);
      }
    }
  }

  if (hasGlobalBaseline && !instance.baselineSignatureLoaded) {
    instance.baselineSignature = await loadBaselineSignatureForImageId(image.id, log);
    instance.baselineSignatureLoaded = true;
  }

  return instance;
}

export async function scanTemplateInstances({
  templateCatalog,
  defaultTemplateId,
  instancesByImageId,
  instancesById,
  hasGlobalBaseline,
  log,
  createChatInterface = false
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
        canvasTypeId,
        log,
        createChatInterface
      });
    }
  }

  const orphanImageIds = new Set();

  for (const imageId of Array.from(instancesByImageId.keys())) {
    if (!templateImageIdsOnBoard.has(imageId)) {
      orphanImageIds.add(imageId);
    }
  }

  for (const imageId of orphanImageIds) {
    const inst = instancesByImageId.get(imageId) || null;

    instancesByImageId.delete(imageId);
    if (inst) {
      instancesById.delete(inst.instanceId);
      if (hasCompleteChatInterfaceShapeIds(inst.chatInterface)) {
        await removeChatInterfaceShapes(inst.chatInterface, log);
      }
      if (typeof log === "function") {
        log("Canvas-Instanz entfernt (Template-Bild gelöscht): " + (inst.instanceLabel || inst.instanceId) + " (Bild-ID " + imageId + ")");
      }
    }

    await removeBaselineSignatureForImageId(imageId, log).catch(() => {});
  }

  return images;
}
