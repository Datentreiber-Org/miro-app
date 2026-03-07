import { DT_CHECK_TAG, DT_STICKY_COLOR_TOKENS } from "../config.js?v=20260308-batch7-5";
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
function normalizeStickyColorToken(color) {
  if (typeof color !== "string") return null;
  const token = color.trim().toLowerCase();
  return DT_STICKY_COLOR_TOKENS.includes(token) ? token : null;
}

function uniqueTagIds(tagIds) {
  return Array.from(new Set((Array.isArray(tagIds) ? tagIds : []).map((id) => String(id).trim()).filter(Boolean)));
}

function normalizeCheckTagTitle(title) {
  return String(title || "").trim().toLowerCase();
}

function isCheckTagTitle(title) {
  const normalized = normalizeCheckTagTitle(title);
  return !!normalized && DT_CHECK_TAG.aliases.some((alias) => normalizeCheckTagTitle(alias) === normalized);
}

export async function createStickyNoteAtBoardCoords({ content, x, y, frameId = null, color = null, tagIds = [] }, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createStickyNote) throw new Error("miro.board.createStickyNote nicht verfügbar");

  const sticky = await board.createStickyNote({
    content: content || "(leer)",
    x,
    y
  });

  const normalizedColor = normalizeStickyColorToken(color);
  const normalizedTagIds = uniqueTagIds(tagIds);
  let needsSync = false;

  if (normalizedColor) {
    sticky.style = {
      ...(sticky.style && typeof sticky.style === "object" ? sticky.style : {}),
      fillColor: normalizedColor
    };
    needsSync = true;
  }

  if (normalizedTagIds.length) {
    sticky.tagIds = normalizedTagIds;
    needsSync = true;
  }

  if (needsSync && typeof sticky.sync === "function") {
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

export async function getItemBoardRect(item, parentGeomCache = null, log) {
  if (!item || !isFiniteNumber(item.width) || !isFiniteNumber(item.height)) return null;
  const pos = await resolveBoardCoords(item, parentGeomCache, log);
  if (!pos) return null;
  return {
    x: pos.x,
    y: pos.y,
    width: item.width,
    height: item.height,
    left: pos.x - item.width / 2,
    right: pos.x + item.width / 2,
    top: pos.y - item.height / 2,
    bottom: pos.y + item.height / 2
  };
}

export async function listTags(log) {
  await ensureMiroReady(log);
  const board = getBoard();
  return board?.get ? (await board.get({ type: "tag" })) || [] : [];
}

export async function ensureBoardTag({ title = DT_CHECK_TAG.title, color = DT_CHECK_TAG.color } = {}, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createTag || !board?.get) {
    throw new Error("miro.board.createTag nicht verfügbar");
  }

  const desiredTitle = String(title || DT_CHECK_TAG.title).trim();
  const tags = await listTags(log);
  const existing = tags.find((tag) => String(tag?.title || tag?.text || tag?.content || "").trim() === desiredTitle);
  if (existing) return existing;

  return await board.createTag({
    title: desiredTitle,
    color: String(color || DT_CHECK_TAG.color).trim() || DT_CHECK_TAG.color
  });
}

export async function setItemTagMembership(itemId, tagId, enabled, log) {
  await ensureMiroReady(log);
  const item = await getItemById(itemId, log);
  if (!item) throw new Error("Item für Tag-Mutation nicht gefunden: " + itemId);
  const ids = new Set((Array.isArray(item.tagIds) ? item.tagIds : []).map((id) => String(id)).filter(Boolean));
  if (enabled) ids.add(String(tagId));
  else ids.delete(String(tagId));
  item.tagIds = Array.from(ids);
  await item.sync();
  return item;
}

export async function setStickyColorById(itemId, color, log) {
  await ensureMiroReady(log);
  const item = await getItemById(itemId, log);
  if (!item) throw new Error("Sticky für Farbänderung nicht gefunden: " + itemId);
  const normalizedColor = normalizeStickyColorToken(color);
  if (!normalizedColor) throw new Error("Ungültiger Sticky-Farbwert: " + String(color || "(leer)"));
  item.style = {
    ...(item.style && typeof item.style === "object" ? item.style : {}),
    fillColor: normalizedColor
  };
  await item.sync();
  return item;
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
        tagsById[tag.id] = {
          id: tag.id,
          title,
          color: tag.color || tag.fillColor || tag?.style?.fillColor || null,
          isCheck: isCheckTagTitle(title)
        };
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
