import { isFiniteNumber } from "../utils.js?v=20260301-step11-hotfix2";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260305-batch05";

// --------------------------------------------------------------------
// Basic board item access, mutation and coordinate transforms
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
