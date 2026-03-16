import { isFiniteNumber } from "../utils.js?v=20260316-patch20-data-monetization-pack";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260316-patch20-data-monetization-pack";

const STICKY_RECT_FALLBACK = Object.freeze({ width: 350, height: 228 });

// --------------------------------------------------------------------
// Basic board item access, mutation and coordinate transforms
// --------------------------------------------------------------------
export async function getSelection(log) {
  await ensureMiroReady(log);
  const board = getBoard();
  return board?.getSelection ? (await board.getSelection()) : [];
}

export async function selectItems(filter = null, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.select) return [];

  const selected = filter == null ? await board.select() : await board.select(filter);
  if (Array.isArray(selected)) return selected;
  if (selected) return [selected];
  return [];
}

export async function deselectItems(filter = null, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.deselect) return [];

  const deselected = filter == null ? await board.deselect() : await board.deselect(filter);
  if (Array.isArray(deselected)) return deselected;
  if (deselected) return [deselected];
  return [];
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

export async function createShape(payload, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createShape) throw new Error("miro.board.createShape nicht verfügbar");
  return await board.createShape(payload);
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
export async function createStickyNoteAtBoardCoords({
  content,
  x,
  y,
  frameId = null,
  fillColor = null,
  tagIds = null,
  width = null,
  height = null,
  shape = null
}, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createStickyNote) throw new Error("miro.board.createStickyNote nicht verfügbar");

  const payload = {
    content: content || "(leer)",
    x,
    y
  };

  const normalizedWidth = isFiniteNumber(width) ? Number(width) : null;
  const normalizedHeight = isFiniteNumber(height) ? Number(height) : null;
  if (normalizedWidth != null) {
    payload.width = normalizedWidth;
  } else if (normalizedHeight != null) {
    payload.height = normalizedHeight;
  }
  if (shape === "square" || shape === "rectangle") payload.shape = shape;
  if (fillColor) {
    payload.style = {
      ...(payload.style || {}),
      fillColor
    };
  }
  if (Array.isArray(tagIds) && tagIds.length) {
    payload.tagIds = Array.from(new Set(tagIds.filter(Boolean)));
  }

  const sticky = await board.createStickyNote(payload);

  if (Array.isArray(payload.tagIds) && payload.tagIds.length && typeof sticky?.sync === "function") {
    sticky.tagIds = payload.tagIds;
    await sticky.sync();
  }

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

export async function resolveBoardRect(item, parentGeomCache = null, log) {
  const center = await resolveBoardCoords(item, parentGeomCache, log);
  if (!center) return null;

  const width = isFiniteNumber(item?.width)
    ? Number(item.width)
    : (item?.type === "sticky_note" ? STICKY_RECT_FALLBACK.width : null);
  const height = isFiniteNumber(item?.height)
    ? Number(item.height)
    : (item?.type === "sticky_note" ? STICKY_RECT_FALLBACK.height : null);

  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null;

  return {
    x: center.x,
    y: center.y,
    width,
    height,
    left: center.x - width / 2,
    right: center.x + width / 2,
    top: center.y - height / 2,
    bottom: center.y + height / 2
  };
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
// Tags
// --------------------------------------------------------------------
export async function getTags(log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.get) return [];

  try {
    const tags = await board.get({ type: "tag" });
    return Array.isArray(tags) ? tags : [];
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden der Tags: " + e.message);
    return [];
  }
}

export async function findBoardTagByTitle(title, log) {
  const needle = typeof title === "string" ? title.trim() : "";
  if (!needle) return null;
  const tags = await getTags(log);
  return tags.find((tag) => String(tag?.title || tag?.text || tag?.content || "").trim() === needle) || null;
}

export async function ensureBoardTag({ title, color = null, preferredId = null } = {}, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createTag || !board?.get) throw new Error("miro.board.createTag nicht verfügbar");

  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  if (!normalizedTitle) throw new Error("ensureBoardTag benötigt einen Titel.");

  const tags = await getTags(log);
  if (preferredId) {
    const byId = tags.find((tag) => tag?.id === preferredId) || null;
    if (byId) return byId;
  }

  const existing = tags.find((tag) => String(tag?.title || tag?.text || tag?.content || "").trim() === normalizedTitle) || null;
  if (existing) return existing;

  const payload = { title: normalizedTitle };
  if (color) payload.color = color;
  return await board.createTag(payload);
}

export async function setStickyNoteTagPresence(stickyOrId, tagId, present = true, log) {
  await ensureMiroReady(log);
  if (!tagId) return null;

  const sticky = typeof stickyOrId === "string"
    ? await getItemById(stickyOrId, log)
    : stickyOrId;
  if (!sticky || sticky.type !== "sticky_note") return null;

  const nextIds = new Set(Array.isArray(sticky.tagIds) ? sticky.tagIds : []);
  if (present) nextIds.add(tagId);
  else nextIds.delete(tagId);

  const normalized = Array.from(nextIds);
  const current = Array.isArray(sticky.tagIds) ? sticky.tagIds : [];
  const changed = normalized.length !== current.length || normalized.some((id, index) => id !== current[index]);
  if (!changed) return sticky;

  sticky.tagIds = normalized;
  if (typeof sticky.sync === "function") {
    await sticky.sync();
  }
  return sticky;
}

export async function setStickyNoteFillColor(stickyOrId, fillColor, log) {
  await ensureMiroReady(log);
  const sticky = typeof stickyOrId === "string"
    ? await getItemById(stickyOrId, log)
    : stickyOrId;
  if (!sticky || sticky.type !== "sticky_note") return null;
  if (!fillColor) return sticky;

  const current = sticky?.style?.fillColor || sticky?.style?.backgroundColor || null;
  if (current === fillColor) return sticky;

  sticky.style = {
    ...(sticky.style || {}),
    fillColor
  };
  if (typeof sticky.sync === "function") {
    await sticky.sync();
  }
  return sticky;
}

// --------------------------------------------------------------------
// Board Context (Stickies/Connectors/Tags)
// --------------------------------------------------------------------
export async function getBoardBaseContext(log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.get) return { stickies: [], connectors: [], tags: [], tagsById: {} };

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
      tags: tags || [],
      tagsById
    };
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Laden des Board-Kontexts: " + e.message);
    return { stickies: [], connectors: [], tags: [], tagsById: {} };
  }
}
