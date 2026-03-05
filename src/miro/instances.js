import { DT_IMAGE_META_KEY_INSTANCE } from "../config.js?v=20260303-flowbatch1";
import { isFiniteNumber } from "../utils.js?v=20260301-step11-hotfix2";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260305-batch05";
import {
  compareItemIdsAsc,
  normalizePositiveInt,
  getCanvasTypeDisplayName,
  formatInstanceLabel,
  buildInternalInstanceIdFromImageId,
  uniqueIds
} from "./helpers.js?v=20260305-batch05";
import { getItemsById, getItemById, resolveBoardCoords } from "./items.js?v=20260305-batch05";
import {
  normalizeActionItems,
  hasAnyActionItems,
  hasCompleteActionBinding,
  mergeActionItems,
  loadActionBindingIndex,
  loadActionBindingForImageId,
  saveActionBindingForImageId,
  removeActionBindingForImageId,
  loadBaselineSignatureForImageId,
  removeBaselineSignatureForImageId
} from "./storage.js?v=20260305-batch05";

// --------------------------------------------------------------------
// Template instance registration, geometry and scan/rebind logic
// --------------------------------------------------------------------
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
