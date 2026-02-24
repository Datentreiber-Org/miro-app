import {
  DT_STORAGE_COLLECTION_NAME,
  DT_STORAGE_KEY_META,
  DT_STORAGE_KEY_BASELINE_PREFIX
} from "../config.js";

import { isFiniteNumber } from "../utils.js";

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
    log("WARNUNG: Keine echte Geometrie gefunden, verwende Dummy für Instanz " + instance.instanceId);
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

async function createInstanceActionShapes(instance, image, log) {
  await ensureMiroReady(log);

  const board = getBoard();
  const hasCreateShape = typeof board?.createShape === "function";
  const hasCreateText  = typeof board?.createText === "function";
  const hasCreateFrame = typeof board?.createFrame === "function";

  if (!hasCreateShape || !hasCreateFrame) return;

  const frameWidth  = image.width + 200;
  const frameHeight = image.height + 260;
  const frameY = image.y + 80;

  const frame = await board.createFrame({
    title: image.title || "Datentreiber 3-Boxes",
    x: image.x,
    y: frameY,
    width: frameWidth,
    height: frameHeight
  });

  const baseY = image.y + image.height / 2 + 80;
  const baseX = image.x;
  const dx = 260;
  const buttonWidth = 260;
  const buttonHeight = 60;

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
      y: baseY + buttonHeight + 40
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

  instance.actionItems = {
    aiItemId: aiShape.id,
    clusterItemId: clusterShape.id,
    globalAgentItemId: globalAgentShape.id,
    globalAgentInputItemId: globalInput ? globalInput.id : null,
    frameId: frame.id
  };
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
  nextInstanceId,
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

  let instance = instancesByImageId.get(image.id);
  if (instance) {
    instance.title = image.title || instance.title || "Canvas";
    instance.canvasTypeId = detectedCanvasTypeId || instance.canvasTypeId || defaultTemplateId;
    instance.lastGeometry = { x: image.x, y: image.y, width: image.width, height: image.height };

    if (!createActionShapes) {
      await maybeSetFrameIdFromParent(instance, image, log);
    }

    if (hasGlobalBaseline && !instance.baselineSignatureLoaded) {
      instance.baselineSignature = await loadBaselineSignatureForImageId(image.id, log);
      instance.baselineSignatureLoaded = true;
    }

    return instance;
  }

  const id = nextInstanceId();
  instance = {
    instanceId: id,
    canvasTypeId: detectedCanvasTypeId || defaultTemplateId,
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
    actionItems: {},
    liveCatalog: null
  };

  if (!createActionShapes) {
    await maybeSetFrameIdFromParent(instance, image, log);
  }

  instancesByImageId.set(image.id, instance);
  instancesById.set(id, instance);

  if (typeof log === "function") {
    log("Neue Canvas-Instanz registriert: " + id + " (Bild-ID " + image.id + ")");
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

  const frameIdByImageId = new Map();
  for (const [imgId, img] of imageById.entries()) {
    if (img.parentId) frameIdByImageId.set(imgId, img.parentId);
  }

  for (const [imageId, inst] of instancesByImageId.entries()) {
    const img = imageById.get(imageId);
    if (!img) continue;

    const frameId = frameIdByImageId.get(imageId);
    if (!frameId) continue;

    const frameShapes = shapesByParent.get(frameId) || [];
    const frameTexts  = textsByParent.get(frameId) || [];

    let aiShape = null;
    let clusterShape = null;
    let globalShape = null;

    for (const s of frameShapes) {
      const raw = (s.content || "").toLowerCase();
      if (!aiShape && raw.includes("send to openai")) aiShape = s;
      else if (!clusterShape && raw.includes("cluster")) clusterShape = s;
      else if (!globalShape && raw.includes("global agent")) globalShape = s;
    }

    const globalInput = frameTexts.length > 0 ? frameTexts[0] : null;

    if (aiShape || clusterShape || globalShape || globalInput) {
      inst.actionItems = {
        aiItemId: aiShape ? aiShape.id : null,
        clusterItemId: clusterShape ? clusterShape.id : null,
        globalAgentItemId: globalShape ? globalShape.id : null,
        globalAgentInputItemId: globalInput ? globalInput.id : null,
        frameId: frameId
      };
      if (typeof log === "function") log("Action-Shapes re-gebunden für Instanz " + inst.instanceId);
    }
  }

  // optional: instancesById ist derselbe Object-Graph; nichts weiter nötig
}

export async function scanTemplateInstances({
  templateCatalog,
  defaultTemplateId,
  instancesByImageId,
  instancesById,
  nextInstanceId,
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
        nextInstanceId,
        hasGlobalBaseline,
        createActionShapes: false,
        canvasTypeId,
        log
      });
    }
  }

  // Instanzen entfernen, deren Template-Bild nicht mehr existiert
  for (const imageId of Array.from(instancesByImageId.keys())) {
    if (!templateImageIdsOnBoard.has(imageId)) {
      const inst = instancesByImageId.get(imageId);
      instancesByImageId.delete(imageId);
      if (inst) instancesById.delete(inst.instanceId);

      if (typeof log === "function") {
        log("Canvas-Instanz entfernt (Template-Bild gelöscht): " + (inst?.instanceId || "?") + " (Bild-ID " + imageId + ")");
      }

      await removeBaselineSignatureForImageId(imageId, log).catch(() => {});
    }
  }

  // Rebind nach Scan (Buttons/Frames wieder verbinden)
  await rebindActionShapesAfterScan(images, instancesByImageId, instancesById, log);

  return images;
}
