// src/miro/board.js
import {
  DT_STORAGE_COLLECTION_NAME,
  DT_STORAGE_KEY_META,
  DT_STORAGE_KEY_BASELINE_PREFIX
} from "../config.js";

// --------------------------------------------------------------------
// Miro SDK Ready
// --------------------------------------------------------------------
let miroReadyPromise = null;

export function ensureMiroReady(log) {
  if (!miroReadyPromise) {
    miroReadyPromise = new Promise((resolve) => {
      const onReady = () => {
        if (typeof log === "function") log("Miro SDK bereit.");
        console.log("[DT] Miro SDK v2 bereit");
        resolve();
      };

      if (window.miro && window.miro.board) {
        onReady();
      } else if (window.miro && typeof window.miro.onReady === "function") {
        window.miro.onReady(onReady);
      } else {
        if (typeof log === "function") log("Warnung: miro.onReady nicht verfügbar.");
        resolve();
      }
    });
  }
  return miroReadyPromise;
}

export function getBoard() {
  return window.miro?.board || null;
}

// --------------------------------------------------------------------
// Storage helpers
// --------------------------------------------------------------------
export function getStorageCollection(log) {
  try {
    const board = getBoard();
    if (board?.storage?.collection) {
      return board.storage.collection(DT_STORAGE_COLLECTION_NAME);
    }
  } catch (e) {
    if (typeof log === "function") log("Storage-Collection Fehler: " + e.message);
  }
  return null;
}

export function baselineKeyForImageId(imageId) {
  return DT_STORAGE_KEY_BASELINE_PREFIX + String(imageId);
}

export async function loadPersistedBaselineMeta(log) {
  const col = getStorageCollection(log);
  if (!col) return null;
  try {
    return await col.get(DT_STORAGE_KEY_META);
  } catch (e) {
    if (typeof log === "function") log("loadPersistedBaselineMeta Fehler: " + e.message);
    return null;
  }
}

export async function savePersistedBaselineMeta(meta, log) {
  const col = getStorageCollection(log);
  if (!col) return;
  try {
    await col.set(DT_STORAGE_KEY_META, meta);
  } catch (e) {
    if (typeof log === "function") log("savePersistedBaselineMeta Fehler: " + e.message);
  }
}

export async function loadBaselineSignatureForImageId(imageId, log) {
  const col = getStorageCollection(log);
  if (!col) return null;
  if (!imageId) return null;
  try {
    const sig = await col.get(baselineKeyForImageId(imageId));
    if (sig && typeof sig === "object" && sig.version === 1) {
      return sig;
    }
  } catch (e) {
    if (typeof log === "function") log("loadBaselineSignature Fehler: " + e.message);
  }
  return null;
}

export async function saveBaselineSignatureForImageId(imageId, signature, log) {
  const col = getStorageCollection(log);
  if (!col) return;
  if (!imageId || !signature) return;
  try {
    await col.set(baselineKeyForImageId(imageId), signature);
  } catch (e) {
    if (typeof log === "function") log("saveBaselineSignature Fehler: " + e.message);
  }
}

export async function removeBaselineSignatureForImageId(imageId, log) {
  const col = getStorageCollection(log);
  if (!col) return;
  if (!imageId) return;
  try {
    await col.remove(baselineKeyForImageId(imageId));
  } catch (e) {
    if (typeof log === "function") log("removeBaselineSignature Fehler: " + e.message);
  }
}

// --------------------------------------------------------------------
// Generic board helpers
// --------------------------------------------------------------------
export function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

export async function getItems(query, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.get) return [];
  try {
    const items = await board.get(query);
    return Array.isArray(items) ? items : (items ? [items] : []);
  } catch (e) {
    if (typeof log === "function") log("Board.get Fehler: " + e.message);
    return [];
  }
}

export async function getItemById(id, log) {
  if (!id) return null;
  const items = await getItems({ id }, log);
  return items && items[0] ? items[0] : null;
}

export async function getSelection(log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.getSelection) return [];
  try {
    const sel = await board.getSelection();
    return Array.isArray(sel) ? sel : [];
  } catch (e) {
    if (typeof log === "function") log("getSelection Fehler: " + e.message);
    return [];
  }
}

// --------------------------------------------------------------------
// Geometry: Parent cache + coordinate conversion
// --------------------------------------------------------------------
async function getParentGeometry(parentId, cache, log) {
  if (!parentId) return null;
  if (cache && cache.has(parentId)) return cache.get(parentId);

  const parent = await getItemById(parentId, log);
  if (
    parent &&
    isFiniteNumber(parent.x) &&
    isFiniteNumber(parent.y) &&
    isFiniteNumber(parent.width) &&
    isFiniteNumber(parent.height)
  ) {
    const geom = { x: parent.x, y: parent.y, width: parent.width, height: parent.height };
    if (cache) cache.set(parentId, geom);
    return geom;
  }
  return null;
}

// lokale Item-x/y -> Board-x/y (wenn Item Parent hat)
export async function localToBoardCoords(item, parentGeomCache = null, log) {
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

    const tagsById = {};
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        const title = tag.title || tag.text || tag.content || "";
        tagsById[tag.id] = title;
      }
    }

    return {
      stickies: Array.isArray(stickies) ? stickies : [],
      connectors: Array.isArray(connectors) ? connectors : [],
      tagsById
    };
  } catch (e) {
    if (typeof log === "function") log("getBoardBaseContext Fehler: " + e.message);
    return { stickies: [], connectors: [], tagsById: {} };
  }
}

// --------------------------------------------------------------------
// Item creation + move + delete
// --------------------------------------------------------------------
export async function createImage(payload, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createImage) throw new Error("miro.board.createImage nicht verfügbar");
  return await board.createImage(payload);
}

export async function createFrame(payload, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createFrame) throw new Error("miro.board.createFrame nicht verfügbar");
  return await board.createFrame(payload);
}

export async function createShape(payload, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createShape) throw new Error("miro.board.createShape nicht verfügbar");
  return await board.createShape(payload);
}

export async function createText(payload, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createText) throw new Error("miro.board.createText nicht verfügbar");
  return await board.createText(payload);
}

// createStickyNote: board-level x/y, optional frameId (add to frame)
export async function createStickyNoteAtBoardCoords({ content, x, y, frameId }, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createStickyNote) throw new Error("miro.board.createStickyNote nicht verfügbar");

  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    throw new Error("createStickyNoteAtBoardCoords: x/y ungültig");
  }

  const sticky = await board.createStickyNote({ content, x, y });

  if (frameId) {
    try {
      const frame = await getItemById(frameId, log);
      if (frame?.type === "frame" && typeof frame.add === "function") {
        await frame.add(sticky);
        await frame.sync();

        // WICHTIG (Miro): Nach frame.add() wird das Sticky ein Child → Koordinaten werden relativ zum Parent interpretiert.
        // Daher setzen wir danach die Position noch einmal korrekt (relativ zum Frame).
        const local = await boardToLocalCoords(sticky, x, y, null, log);
        if (local && isFiniteNumber(local.x) && isFiniteNumber(local.y)) {
          sticky.x = local.x;
          sticky.y = local.y;
          await sticky.sync();
        }
      }
    } catch (e) {
      if (typeof log === "function") log("createStickyNoteAtBoardCoords frame.add Fehler: " + e.message);
    }
  }

  return sticky;
}


// Connector create (low-level)
export async function createConnectorBetweenItems({
  startItemId,
  endItemId,
  caption = null,
  shape = null,
  style = null,
  startSnapTo = "auto",
  endSnapTo = "auto"
}, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createConnector) throw new Error("miro.board.createConnector nicht verfügbar");

  if (!startItemId || !endItemId) {
    if (typeof log === "function") log("createConnector: start/end ItemId fehlt.");
    return null;
  }

  const payload = {
    start: { item: String(startItemId) },
    end: { item: String(endItemId) }
  };

  // snapTo ist optional; "auto" ist i.d.R. ok.
  if (startSnapTo) payload.start.snapTo = startSnapTo;
  if (endSnapTo) payload.end.snapTo = endSnapTo;

  if (shape) payload.shape = shape;

  // Optional: Beschriftung in der Mitte
  if (caption) {
    payload.captions = [{ content: String(caption), position: 0.5 }];
  }

  // Optional: Style (z.B. strokeColor, strokeWidth, startStrokeCap, endStrokeCap, etc.)
  if (style && typeof style === "object") {
    payload.style = style;
  }

  return await board.createConnector(payload);
}


export async function moveItemByIdToBoardCoords(itemId, boardX, boardY, log) {
  await ensureMiroReady(log);
  const item = await getItemById(itemId, log);
  if (!item) {
    if (typeof log === "function") log("move: Item nicht gefunden: " + itemId);
    return;
  }

  const local = await boardToLocalCoords(item, boardX, boardY, null, log);
  if (!local) {
    if (typeof log === "function") log("move: Konnte lokale Koordinaten nicht berechnen: " + itemId);
    return;
  }

  item.x = local.x;
  item.y = local.y;
  await item.sync();
}

export async function removeItemById(itemId, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.remove) throw new Error("miro.board.remove nicht verfügbar");

  const item = await getItemById(itemId, log);
  if (!item) return;
  try {
    await board.remove(item);
  } catch (e) {
    if (typeof log === "function") log("removeItemById Fehler: " + e.message);
  }
}

// --------------------------------------------------------------------
// Template geometry (Image) -> Board coords
// --------------------------------------------------------------------
export async function computeTemplateGeometry(instance, log) {
  if (!instance) return null;
  await ensureMiroReady(log);

  // 1) Bild selbst
  if (instance.imageId) {
    try {
      const img = await getItemById(instance.imageId, log);
      if (
        img &&
        isFiniteNumber(img.x) &&
        isFiniteNumber(img.y) &&
        isFiniteNumber(img.width) &&
        isFiniteNumber(img.height)
      ) {
        let boardX = null;
        let boardY = null;

        const rel = typeof img.relativeTo === "string" ? img.relativeTo : null;

        if (img.parentId && rel !== "canvas_center") {
          const parent = await getItemById(img.parentId, log);
          if (
            parent &&
            isFiniteNumber(parent.x) &&
            isFiniteNumber(parent.y) &&
            isFiniteNumber(parent.width) &&
            isFiniteNumber(parent.height)
          ) {
            if (rel === "parent_center") {
              boardX = parent.x + img.x;
              boardY = parent.y + img.y;
            } else {
              const parentLeft = parent.x - parent.width / 2;
              const parentTop  = parent.y - parent.height / 2;
              boardX = parentLeft + img.x;
              boardY = parentTop  + img.y;
            }
          }
        }

        if (!isFiniteNumber(boardX) || !isFiniteNumber(boardY)) {
          boardX = img.x;
          boardY = img.y;
        }

        const geom = { x: boardX, y: boardY, width: img.width, height: img.height };
        instance.lastGeometry = geom;
        return geom;
      }
    } catch (e) {
      if (typeof log === "function") log("computeTemplateGeometry Fehler: " + e.message);
    }
  }

  // 2) Fallback: cached
  if (instance.lastGeometry) {
    const g = instance.lastGeometry;
    if (
      g &&
      isFiniteNumber(g.x) &&
      isFiniteNumber(g.y) &&
      isFiniteNumber(g.width) &&
      isFiniteNumber(g.height)
    ) {
      return g;
    }
  }

  // 3) Dummy
  const dummy = { x: 0, y: 0, width: 2000, height: 1000 };
  instance.lastGeometry = dummy;
  if (typeof log === "function") {
    log(
      "WARNUNG: computeTemplateGeometry Dummy-Geometrie für Instanz " +
      (instance.instanceId || "(unbekannt)")
    );
  }
  return dummy;
}

// --------------------------------------------------------------------
// Viewport
// --------------------------------------------------------------------
export async function zoomTo(item, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.viewport?.zoomTo) return;
  try {
    await board.viewport.zoomTo(item);
  } catch (e) {
    if (typeof log === "function") log("zoomTo Fehler: " + e.message);
  }
}

// --------------------------------------------------------------------
// UI events
// --------------------------------------------------------------------
export function onSelectionUpdate(handler, log) {
  const board = getBoard();
  if (!board?.ui?.on) return;
  try {
    board.ui.on("selection:update", handler);
  } catch (e) {
    if (typeof log === "function") log("ui.on selection:update Fehler: " + e.message);
  }
}
