// src/main.js
import {
  TEMPLATE_ID,
  TEMPLATE_IMAGE_URL,
  DT_TEMPLATE_CATALOG,
  DT_PROMPT_CATALOG,
  DT_GLOBAL_SYSTEM_PROMPT,
  STICKY_LAYOUT
} from "./config.js";

import {
  stripHtml
} from "./utils.js";

import * as Board from "./miro/board.js";
import * as Catalog from "./domain/catalog.js";
import * as OpenAI from "./ai/openai.js";

// --------------------------------------------------------------------
// Panel log helper
// --------------------------------------------------------------------
function log(msg) {
  const el = document.getElementById("log");
  if (!el) return;

  const text =
    typeof msg === "string"
      ? msg
      : JSON.stringify(msg, null, 2);

  el.textContent = (el.textContent ? el.textContent + "\n\n" : "") + text;
  el.scrollTop = el.scrollHeight;
}

(function initialLog() {
  const el = document.getElementById("log");
  if (el) {
    el.textContent =
      "Panel-JS geladen: " + new Date().toLocaleTimeString() +
      "\nWarte auf Miro SDK ...";
  }
  console.log("[DT] main.js geladen");
})();

window.onerror = function (msg, src, line, col) {
  log("JS-Fehler: " + msg + " @ " + line + ":" + col);
};

// --------------------------------------------------------------------
// State (runtime only)
// --------------------------------------------------------------------
const state = {
  initialized: false,

  // Instance registry
  nextInstanceCounter: 1,
  instancesByImageId: new Map(), // imageId -> instance
  instancesById: new Map(),      // instanceId -> instance

  // Cluster (session)
  clusterAssignments: new Map(), // stickyId -> clusterName
  clusterCounterByInstanceId: new Map(), // instanceId -> number

  // Last selections
  lastStickySelectionIds: [],
  lastCanvasSelectionInstanceIds: [],

  // Prevent recursion on selection:update
  handlingSelection: false,

  // Alias state for LLM actions
  aliasState: {
    nextStickyAliasIndex: 1,
    sticky: {},        // alias -> real stickyId
    stickyReverse: {}  // real stickyId -> alias
  },

  // Live catalog snapshot (rebuild on demand)
  liveCatalog: null,
  stickyOwnerCache: new Map(), // stickyId -> instanceId

  // Global baseline meta
  hasLoadedPersistedBaselineMeta: false,
  hasGlobalBaseline: false,
  globalBaselineAt: null
};

// --------------------------------------------------------------------
// Init
// --------------------------------------------------------------------
async function initIfNeeded() {
  if (state.initialized) return;
  state.initialized = true;

  await Board.ensureMiroReady(log);

  // Load baseline meta
  try {
    const meta = await Board.loadPersistedBaselineMeta(log);
    if (meta && typeof meta === "object" && meta.version === 1 && meta.hasGlobalBaseline === true) {
      state.hasGlobalBaseline = true;
      state.globalBaselineAt = typeof meta.baselineAt === "string" ? meta.baselineAt : null;
    }
  } catch (e) {
    log("Baseline Meta load Fehler: " + e.message);
  }

  // Initial scan
  await scanTemplateInstances({ throttleMs: 0 });

  // Selection handler for board "buttons"
  Board.onSelectionUpdate(onSelectionUpdate, log);
}

// --------------------------------------------------------------------
// UI helpers
// --------------------------------------------------------------------
function getApiKey() {
  return (document.getElementById("api-key")?.value || "").trim();
}

function getModel() {
  return document.getElementById("model")?.value || "gpt-4.1-mini";
}

function getUserTextFromPanel() {
  const t = (document.getElementById("user-text")?.value || "").trim();
  return t || "Bitte analysiere diese Canvas-Instanz und führe sinnvolle nächste Schritte innerhalb des Workshop-Workflows aus.";
}

// --------------------------------------------------------------------
// Template detection
// --------------------------------------------------------------------
function detectCanvasTypeIdFromImage(image) {
  if (!image || image.type !== "image") return null;
  const url = typeof image.url === "string" ? image.url : "";
  if (!url) return null;

  const ids = Object.keys(DT_TEMPLATE_CATALOG);
  for (const id of ids) {
    const cfg = DT_TEMPLATE_CATALOG[id];
    if (cfg && typeof cfg.imageUrl === "string" && cfg.imageUrl && url.indexOf(cfg.imageUrl) !== -1) {
      return id;
    }
  }
  return null;
}

// --------------------------------------------------------------------
// Instance actions: create buttons inside frame
// --------------------------------------------------------------------
async function createInstanceActionShapes(instance, image) {
  const board = Board.getBoard();
  if (!board) return;

  const hasCreateShape = typeof board.createShape === "function";
  const hasCreateText  = typeof board.createText  === "function";
  const hasCreateFrame = typeof board.createFrame === "function";

  if (!hasCreateShape || !hasCreateFrame) return;

  // Frame to keep image + buttons together
  const frameWidth  = image.width + 200;
  const frameHeight = image.height + 260;
  const frameY      = image.y + 80;

  const frame = await Board.createFrame({
    title: image.title || "Datentreiber 3-Boxes",
    x: image.x,
    y: frameY,
    width: frameWidth,
    height: frameHeight
  }, log);

  const baseY = image.y + image.height / 2 + 80;
  const baseX = image.x;
  const dx = 260;
  const buttonWidth  = 260;
  const buttonHeight = 60;

  // AI button
  const aiShape = await Board.createShape({
    content: "Send to OpenAI",
    shape: "round_rectangle",
    x: baseX - dx,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  }, log);

  // Cluster button
  const clusterShape = await Board.createShape({
    content: "Cluster",
    shape: "round_rectangle",
    x: baseX,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  }, log);

  // Global agent button
  const globalAgentShape = await Board.createShape({
    content: "Global Agent",
    shape: "round_rectangle",
    x: baseX + dx,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  }, log);

  // Global input text
  let globalInput = null;
  if (hasCreateText) {
    globalInput = await Board.createText({
      content: "",
      x: baseX + dx,
      y: baseY + buttonHeight + 40
    }, log);
  }

  try {
    await frame.add(image);
    await frame.add(aiShape);
    await frame.add(clusterShape);
    await frame.add(globalAgentShape);
    if (globalInput) await frame.add(globalInput);
    await frame.sync();
  } catch (e) {
    log("Frame.add Fehler: " + e.message);
  }

  instance.actionItems = {
    aiItemId: aiShape.id,
    clusterItemId: clusterShape.id,
    globalAgentItemId: globalAgentShape.id,
    globalAgentInputItemId: globalInput ? globalInput.id : null,
    frameId: frame.id
  };
}

// Rebind existing action shapes after scan (panel restart)
async function rebindActionShapesAfterScan(images) {
  const board = Board.getBoard();
  if (!board) return;

  let shapes = [];
  let textItems = [];

  try {
    shapes = await Board.getItems({ type: "shape" }, log);
    textItems = await Board.getItems({ type: "text" }, log);
  } catch (e) {
    log("Rebind Fehler: " + e.message);
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
  for (const img of images) imageById.set(img.id, img);

  const frameIdByImageId = new Map();
  imageById.forEach((img, imgId) => {
    if (img.parentId) frameIdByImageId.set(imgId, img.parentId);
  });

  state.instancesByImageId.forEach((instance, imageId) => {
    const img = imageById.get(imageId);
    if (!img) return;

    const frameId = frameIdByImageId.get(imageId);
    if (!frameId) return;

    const frameShapes = shapesByParent.get(frameId) || [];
    const frameTexts  = textsByParent.get(frameId) || [];

    let aiShape = null;
    let clusterShape = null;
    let globalShape = null;
    let globalInput = null;

    for (const s of frameShapes) {
      const raw = (s.content || "").toLowerCase();
      if (!aiShape && raw.includes("send to openai")) aiShape = s;
      else if (!clusterShape && raw.includes("cluster")) clusterShape = s;
      else if (!globalShape && raw.includes("global agent")) globalShape = s;
    }

    if (frameTexts.length > 0) globalInput = frameTexts[0];

    if (aiShape || clusterShape || globalShape || globalInput) {
      instance.actionItems = {
        aiItemId: aiShape ? aiShape.id : null,
        clusterItemId: clusterShape ? clusterShape.id : null,
        globalAgentItemId: globalShape ? globalShape.id : null,
        globalAgentInputItemId: globalInput ? globalInput.id : null,
        frameId
      };
      log("Action-Shapes re-gebunden für Instanz " + instance.instanceId);
    }
  });
}

// --------------------------------------------------------------------
// Instance registry: register from template image
// --------------------------------------------------------------------
async function registerInstanceFromImage(image, options = {}) {
  if (!image || !image.id) return null;

  const createActionShapes = options.createActionShapes !== false;
  const detectedCanvasTypeId = options.canvasTypeId || detectCanvasTypeIdFromImage(image) || TEMPLATE_ID;

  let instance = state.instancesByImageId.get(image.id);
  if (instance) {
    instance.title = image.title || instance.title || "Datentreiber 3-Boxes";
    instance.canvasTypeId = detectedCanvasTypeId || instance.canvasTypeId || TEMPLATE_ID;

    instance.lastGeometry = { x: image.x, y: image.y, width: image.width, height: image.height };

    // If image already inside frame, keep frameId (copy/paste)
    if (!createActionShapes && image.parentId) {
      if (!instance.actionItems) instance.actionItems = {};
      if (!instance.actionItems.frameId) {
        const parent = await Board.getItemById(image.parentId, log);
        if (parent && parent.type === "frame") instance.actionItems.frameId = parent.id;
      }
    }

    // Load persisted baseline signature if needed
    if (state.hasGlobalBaseline && !instance.baselineSignatureLoaded) {
      instance.baselineSignature = await Board.loadBaselineSignatureForImageId(image.id, log);
      instance.baselineSignatureLoaded = true;
    }

    return instance;
  }

  const instanceId = "inst-" + (state.nextInstanceCounter++);
  instance = {
    instanceId,
    canvasTypeId: detectedCanvasTypeId || TEMPLATE_ID,
    imageId: image.id,
    title: image.title || "Datentreiber 3-Boxes",
    lastGeometry: { x: image.x, y: image.y, width: image.width, height: image.height },

    baselineSignature: null,
    baselineSignatureLoaded: false,

    lastSignature: null,
    lastStateHash: null,
    lastDiff: null,

    lastStickyCount: 0,
    lastClassification: null,
    lastStateJson: null,

    lastChangedAt: null,
    lastAgentRunAt: null,

    actionItems: {}
  };

  // If image already inside frame, keep frameId
  if (!createActionShapes && image.parentId) {
    const parent = await Board.getItemById(image.parentId, log);
    if (parent && parent.type === "frame") {
      instance.actionItems.frameId = parent.id;
    }
  }

  state.instancesByImageId.set(image.id, instance);
  state.instancesById.set(instanceId, instance);
  log("Neue Canvas-Instanz registriert: " + instanceId + " (Bild-ID " + image.id + ")");

  if (state.hasGlobalBaseline && !instance.baselineSignatureLoaded) {
    instance.baselineSignature = await Board.loadBaselineSignatureForImageId(image.id, log);
    instance.baselineSignatureLoaded = true;
  }

  if (createActionShapes) {
    await createInstanceActionShapes(instance, image);
  }

  return instance;
}

// --------------------------------------------------------------------
// Scan all template instances on board
// --------------------------------------------------------------------
let lastScanAt = 0;

async function scanTemplateInstances({ throttleMs = 500 } = {}) {
  await Board.ensureMiroReady(log);
  const now = Date.now();
  if (throttleMs > 0 && (now - lastScanAt) < throttleMs) return;
  lastScanAt = now;

  const images = await Board.getItems({ type: "image" }, log);
  const templateImageIdsOnBoard = new Set();

  for (const img of images) {
    const canvasTypeId = detectCanvasTypeIdFromImage(img);
    if (canvasTypeId) {
      templateImageIdsOnBoard.add(img.id);
      await registerInstanceFromImage(img, { createActionShapes: false, canvasTypeId });
    }
  }

  // Remove instances whose image is gone
  const knownImageIds = Array.from(state.instancesByImageId.keys());
  for (const imageId of knownImageIds) {
    if (!templateImageIdsOnBoard.has(imageId)) {
      const inst = state.instancesByImageId.get(imageId);
      state.instancesByImageId.delete(imageId);
      if (inst) {
        state.instancesById.delete(inst.instanceId);
        log("Canvas-Instanz entfernt (Template gelöscht): " + inst.instanceId);
      }
      await Board.removeBaselineSignatureForImageId(imageId, log);
    }
  }

  // Rebind action shapes
  await rebindActionShapesAfterScan(images);
}

// --------------------------------------------------------------------
// Selection update: detect board buttons + remember last selections
// --------------------------------------------------------------------
async function onSelectionUpdate(event) {
  if (state.handlingSelection) return;

  const items = event?.items || [];

  // Remember last sticky selection
  const stickyIds = items.filter((it) => it.type === "sticky_note").map((it) => it.id);
  if (stickyIds.length) state.lastStickySelectionIds = stickyIds.slice();

  // Remember last selected instance(s)
  const instSet = new Set();
  for (const it of items) {
    if (it.type === "image") {
      const inst = state.instancesByImageId.get(it.id);
      if (inst) instSet.add(inst.instanceId);
    }
    if (it.type === "frame") {
      state.instancesById.forEach((inst) => {
        if (inst.actionItems?.frameId === it.id) instSet.add(inst.instanceId);
      });
    }
  }
  if (instSet.size) state.lastCanvasSelectionInstanceIds = Array.from(instSet);

  if (items.length !== 1) return;
  const item = items[0];
  if (item.type !== "shape") return;

  // Ensure instances are bound
  await scanTemplateInstances({ throttleMs: 0 });

  let instanceId = null;
  let buttonType = null;

  state.instancesById.forEach((inst, id) => {
    const aiId = inst.actionItems?.aiItemId;
    const clId = inst.actionItems?.clusterItemId;
    const glId = inst.actionItems?.globalAgentItemId;

    if (aiId === item.id) {
      instanceId = id; buttonType = "ai";
    } else if (clId === item.id) {
      instanceId = id; buttonType = "cluster";
    } else if (glId === item.id) {
      instanceId = id; buttonType = "global";
    }
  });

  if (!instanceId || !buttonType) return;

  state.handlingSelection = true;
  try {
    if (buttonType === "ai") {
      log("Agent-Button (Board Shape) für Instanz " + instanceId);
      await runAgentForInstance(instanceId);
    } else if (buttonType === "cluster") {
      if (!state.lastStickySelectionIds.length) {
        log("Cluster-Button: Bitte zuerst Sticky Notes auswählen.");
        return;
      }
      log("Cluster-Button (Board Shape) für Instanz " + instanceId);
      await clusterSelectionWithIds(state.lastStickySelectionIds, instanceId);
    } else if (buttonType === "global") {
      const inst = state.instancesById.get(instanceId);
      const inputId = inst?.actionItems?.globalAgentInputItemId;

      let txt = "";
      if (inputId) {
        const tItem = await Board.getItemById(inputId, log);
        if (tItem && typeof tItem.content === "string") txt = tItem.content.trim();
      }
      if (!txt) {
        txt = "Bitte gib einen globalen Überblick über alle relevanten Canvas-Instanzen und schlage sinnvolle nächste Schritte vor.";
      }

      log("Global-Agent-Button (Board Shape) ausgelöst (Instanz " + instanceId + ")");
      await runGlobalAgent(instanceId, txt);
    }
  } finally {
    state.handlingSelection = false;
  }
}

// --------------------------------------------------------------------
// Insert template image
// --------------------------------------------------------------------
async function insertTemplateImage() {
  await initIfNeeded();

  try {
    const image = await Board.createImage({
      url: TEMPLATE_IMAGE_URL,
      x: 0,
      y: 0,
      width: 2000
    }, log);

    await registerInstanceFromImage(image, { createActionShapes: true });

    log(
      "Template eingefügt: " + image.id + "\n" +
      "Unterhalb des Canvas findest du die Buttons im Frame:\n" +
      "- Send to OpenAI\n" +
      "- Cluster\n" +
      "- Global Agent"
    );

    await Board.zoomTo(image, log);
  } catch (e) {
    log("Fehler beim Einfügen des Template-Bildes: " + e.message);
  }
}

// --------------------------------------------------------------------
// Cluster selection (panel + board button)
// --------------------------------------------------------------------
async function clusterSelectionPanel() {
  log("Button: Auswahl clustern (Panel).");
  await clusterSelectionWithIds(null, null);
}

async function clusterSelectionWithIds(stickyIds, expectedInstanceId) {
  await initIfNeeded();
  await scanTemplateInstances({ throttleMs: 0 });

  let stickyNotes = [];

  if (Array.isArray(stickyIds) && stickyIds.length) {
    const arr = await Board.getItems({ id: stickyIds }, log);
    stickyNotes = arr.filter((it) => it.type === "sticky_note");
  } else {
    const selection = await Board.getSelection(log);
    stickyNotes = selection.filter((it) => it.type === "sticky_note");
  }

  if (!stickyNotes.length) {
    log("Keine Sticky Notes ausgewählt.");
    return;
  }

  const byInstance = {};
  const outside = [];

  const expectedInstance = expectedInstanceId ? state.instancesById.get(expectedInstanceId) : null;
  const expectedFrameId = expectedInstance?.actionItems?.frameId || null;

  for (const s of stickyNotes) {
    let instance = null;

    // Prefer frame match if cluster button belongs to instance frame
    if (expectedInstance && expectedFrameId && s.parentId === expectedFrameId) {
      instance = expectedInstance;
    } else {
      // fallback: find instance by geometry (rough)
      instance = findInstanceForPoint(s.x, s.y);
    }

    if (!instance) {
      outside.push(s);
      continue;
    }

    if (!byInstance[instance.instanceId]) byInstance[instance.instanceId] = [];
    byInstance[instance.instanceId].push(s);
  }

  const instanceIds = Object.keys(byInstance);
  if (!instanceIds.length) {
    log("Keine ausgewählten Stickies auf einem Canvas gefunden.");
    return;
  }

  if (instanceIds.length > 1) {
    log("Auswahl enthält Stickies aus mehreren Canvas-Instanzen. Bitte nur eine Instanz clustern.");
    return;
  }

  const instanceId = instanceIds[0];
  if (expectedInstanceId && instanceId !== expectedInstanceId) {
    log("Cluster-Button gehört zu anderer Instanz als Sticky-Auswahl.");
    return;
  }

  const notesInInstance = byInstance[instanceId];

  // Detect underlined header sticky -> cluster name
  let headerSticky = null;
  for (const s of notesInInstance) {
    const html = s.content || "";
    if (html.includes("<u>") || html.includes("text-decoration:underline")) {
      headerSticky = s;
      break;
    }
  }

  let clusterName = null;
  if (headerSticky) {
    const candidate = stripHtml(headerSticky.content).trim();
    if (!candidate) {
      log("Unterstrichener Sticky ist leer → bitte Cluster-Namen eintragen.");
      return;
    }
    clusterName = candidate;
  } else {
    const count = (state.clusterCounterByInstanceId.get(instanceId) || 0) + 1;
    state.clusterCounterByInstanceId.set(instanceId, count);
    clusterName = "Cluster " + count;
  }

  for (const s of notesInInstance) {
    state.clusterAssignments.set(s.id, clusterName);
  }
  for (const s of outside) {
    state.clusterAssignments.set(s.id, clusterName);
  }

  log("Cluster '" + clusterName + "' gesetzt für " + (notesInInstance.length + outside.length) + " Sticky Notes (Session-State).");
}

// Fallback: point -> instance by lastGeometry
function findInstanceForPoint(x, y) {
  let found = null;
  state.instancesById.forEach((inst) => {
    const g = inst.lastGeometry;
    if (!g) return;
    const left = g.x - g.width / 2;
    const right = g.x + g.width / 2;
    const top = g.y - g.height / 2;
    const bottom = g.y + g.height / 2;
    if (x >= left && x <= right && y >= top && y <= bottom) {
      if (!found) found = inst;
    }
  });
  return found;
}

// --------------------------------------------------------------------
// Rebuild live catalog snapshot
// --------------------------------------------------------------------
async function refreshBoardState() {
  await initIfNeeded();
  await scanTemplateInstances({ throttleMs: 0 });

  const ctx = await Board.getBoardBaseContext(log);

  const liveCatalog = await Catalog.rebuildLiveCatalog({
    ctx,
    instancesById: state.instancesById,
    clusterAssignments: state.clusterAssignments,
    computeTemplateGeometry: (inst) => Board.computeTemplateGeometry(inst, log),
    log
  });

  state.liveCatalog = liveCatalog;
  state.stickyOwnerCache = liveCatalog.stickyOwnerCache || new Map();

  // Update instance sticky counts
  state.instancesById.forEach((inst) => {
    const liveInst = liveCatalog.instances?.[inst.instanceId];
    inst.lastStickyCount = liveInst?.meta?.stickyCount || 0;
  });
}

// --------------------------------------------------------------------
// Agent action dispatcher (apply actions to instance)
// --------------------------------------------------------------------
async function applyAgentActionsToInstance(instanceId, actions) {
  if (!Array.isArray(actions) || !actions.length) {
    log("Keine Actions vom Agenten (leer).");
    return;
  }

  const instance = state.instancesById.get(instanceId);
  if (!instance) {
    log("Unbekannte Instanz: " + instanceId);
    return;
  }

  const geom = await Board.computeTemplateGeometry(instance, log);
  if (!geom) {
    log("Keine Geometrie für Instanz: " + instanceId);
    return;
  }

  // Preload catalog snapshot (for region occupancy + existing connectors)
  await refreshBoardState();

  const liveInst = state.liveCatalog?.instances?.[instanceId] || null;

  // ---- NEU: "ref" -> echte Sticky-ID (nur für dieses Action-Batch) ----
  // Ermöglicht: create_sticky {ref:"p1_name"} + spätere Actions (connect/move/delete) mit "p1_name"
  const createdRefToId = new Map();

  // Falls Connector-Actions vor den create_sticky Actions kommen,
  // können refs noch nicht aufgelöst werden. Wir deferen diese Actions
  // und versuchen nach dem ersten Pass erneut.
  const deferredConnectorActions = [];

  function rememberCreatedRef(ref, sticky) {
    if (!ref) return;
    if (!sticky?.id) return;
    createdRefToId.set(ref, sticky.id);
  }

  // Keep owner cache for newly created stickies
  function rememberStickyOwner(stickyId) {
    if (!stickyId) return;
    state.stickyOwnerCache.set(stickyId, instanceId);
  }

  // Resolve either alias ("S0001") or ref ("p1_name") or raw stickyId
  function resolveStickyIdAny(idOrRefOrAlias) {
    if (!idOrRefOrAlias) return null;

    // 1) ref created in this batch
    if (createdRefToId.has(idOrRefOrAlias)) return createdRefToId.get(idOrRefOrAlias);

    // 2) alias mapping
    const aliasMap = state.aliasState?.sticky;
    if (aliasMap && aliasMap[idOrRefOrAlias]) return aliasMap[idOrRefOrAlias];

    // 3) raw
    return idOrRefOrAlias;
  }

  // Region occupancy index (body regions)
  // We build simple rect-occupied lists per regionId for collision-aware placement.
  const occupiedByRegion = {
    left: [],
    middle: [],
    right: []
  };

  // Populate from current live catalog stickies in body regions (existing items)
  function addOccupiedFromLive(liveStickies) {
    for (const s of liveStickies) {
      const id = s?.id;
      if (!id) continue;

      // Approx sizes: try to load actual sticky to get width/height (expensive),
      // so we keep lightweight defaults and update after creation.
      occupiedByRegion[s.regionId]?.push({
        id,
        x: s.boardX,
        y: s.boardY,
        width: STICKY_LAYOUT.defaultWidthPx,
        height: STICKY_LAYOUT.defaultHeightPx
      });
    }
  }

  // Helpers: convert liveInst stickies to board coords occupancy
  if (liveInst) {
    // Body regions left/middle/right
    const b = liveInst.regions?.body || null;
    if (b?.left?.stickies?.length) {
      addOccupiedFromLive(b.left.stickies.map((st) => ({
        id: st.id,
        regionId: "left",
        boardX: st.boardX,
        boardY: st.boardY
      })));
    }
    if (b?.middle?.stickies?.length) {
      addOccupiedFromLive(b.middle.stickies.map((st) => ({
        id: st.id,
        regionId: "middle",
        boardX: st.boardX,
        boardY: st.boardY
      })));
    }
    if (b?.right?.stickies?.length) {
      addOccupiedFromLive(b.right.stickies.map((st) => ({
        id: st.id,
        regionId: "right",
        boardX: st.boardX,
        boardY: st.boardY
      })));
    }
  }

  // Remove from occupied lists (when deleting)
  function removeFromAllOccupied(stickyId) {
    for (const key of Object.keys(occupiedByRegion)) {
      occupiedByRegion[key] = occupiedByRegion[key].filter((r) => r.id !== stickyId);
    }
  }

  // Try to infer regionId from a target area name
  function areaNameToRegionId(areaName) {
    const region = Catalog.areaNameToRegion(areaName);
    return region?.id || null;
  }

  // Quick detection: where does a given board point land (body only)
  function detectBodyRegionIdFromBoardCoords(canvasTypeId, boardX, boardY) {
    const left = geom.x - geom.width / 2;
    const top = geom.y - geom.height / 2;
    const px = (boardX - left) / geom.width;
    const py = (boardY - top) / geom.height;
    if (px < 0 || px > 1 || py < 0 || py > 1) return null;

    const loc = Catalog.classifyNormalizedLocation(canvasTypeId, px, py);
    if (loc?.role !== "body") return null;
    const rid = loc.regionId;
    if (rid === "left" || rid === "middle" || rid === "right") return rid;
    return null;
  }

  // Decide sticky size (optional: can vary by region)
  function deriveStickySize(regionId) {
    // Right now: fixed defaults
    return { width: STICKY_LAYOUT.defaultWidthPx, height: STICKY_LAYOUT.defaultHeightPx };
  }

  // ------------------------------------------------------------------
  // Connector helpers (intra-instance)
  // ------------------------------------------------------------------
  // Build a quick lookup of existing connectors in this instance (undirected pair key)
  const connectorIndex = new Map(); // key "A|B" -> [connectorId,...]
  const existingConnections = Array.isArray(liveInst?.connections) ? liveInst.connections : [];

  function pairKey(a, b) {
    const A = String(a);
    const B = String(b);
    return (A < B) ? (A + "|" + B) : (B + "|" + A);
  }

  for (const c of existingConnections) {
    const fromId = c?.fromStickyId;
    const toId = c?.toStickyId;
    const cid = c?.connectorId;
    if (!fromId || !toId || !cid) continue;
    const k = pairKey(fromId, toId);
    if (!connectorIndex.has(k)) connectorIndex.set(k, []);
    connectorIndex.get(k).push(cid);
  }

  function isSameInstanceSticky(stickyId) {
    const owner = state.stickyOwnerCache.get(stickyId);
    return owner === instanceId;
  }

  async function createConnectorBetween(fromStickyId, toStickyId, action, { ensure }) {
    if (!fromStickyId || !toStickyId) return;

    if (!isSameInstanceSticky(fromStickyId) || !isSameInstanceSticky(toStickyId)) {
      log("Connector: Cross-Instance Verbindung wird ignoriert (from=" + fromStickyId + ", to=" + toStickyId + ").");
      return;
    }

    const k = pairKey(fromStickyId, toStickyId);
    const existing = connectorIndex.get(k) || [];

    if (ensure && existing.length > 0) {
      log("ensure_connector: Verbindung existiert bereits (" + existing[0] + ").");
      return;
    }

    const caption = (typeof action.caption === "string") ? action.caption : null;
    const shape = (typeof action.shape === "string") ? action.shape : null;
    const style = (action.style && typeof action.style === "object") ? action.style : null;

    const conn = await Board.createConnectorBetweenItems({
      startItemId: fromStickyId,
      endItemId: toStickyId,
      caption,
      shape,
      style
    }, log);

    if (conn?.id) {
      if (!connectorIndex.has(k)) connectorIndex.set(k, []);
      connectorIndex.get(k).push(conn.id);
      log("Connector erstellt: " + conn.id + " (" + fromStickyId + " -> " + toStickyId + ")");
    }
  }

  async function deleteConnectorAction(action) {
    const connectorId = action?.connectorId ? String(action.connectorId) : null;
    if (connectorId) {
      await Board.removeItemById(connectorId, log);
      // best-effort: remove from index
      for (const [k, list] of connectorIndex.entries()) {
        connectorIndex.set(k, list.filter((id) => id !== connectorId));
      }
      return;
    }

    // delete by pair
    const fromId = resolveStickyIdAny(action?.fromStickyId);
    const toId = resolveStickyIdAny(action?.toStickyId);
    if (!fromId || !toId) {
      log("delete_connector: from/to fehlt (oder konnte nicht aufgelöst werden).");
      return;
    }
    const k = pairKey(fromId, toId);
    const list = connectorIndex.get(k) || [];
    if (!list.length) {
      log("delete_connector: Keine Verbindung gefunden (" + fromId + " <-> " + toId + ").");
      return;
    }

    const all = action?.all === true;
    const toDelete = all ? list.slice() : [list[0]];

    for (const cid of toDelete) {
      await Board.removeItemById(cid, log);
    }

    // update index
    if (all) connectorIndex.delete(k);
    else connectorIndex.set(k, list.filter((id) => id !== toDelete[0]));
  }

  // ------------------------------------------------------------------
  // Action handlers
  // ------------------------------------------------------------------
  const handlers = {
    "move_sticky": async (action) => {
      const stickyId = resolveStickyIdAny(action.stickyId);
      if (!stickyId) return;

      // occupied vorher entfernen (wir platzieren neu)
      removeFromAllOccupied(stickyId);

      const canvasTypeId = instance.canvasTypeId || TEMPLATE_ID;

      let targetX = null;
      let targetY = null;

      if (typeof action.targetPx === "number" && typeof action.targetPy === "number") {
        const coords = Catalog.normalizedToBoardCoords(geom, action.targetPx, action.targetPy);
        targetX = coords.x;
        targetY = coords.y;
      } else {
        const region = Catalog.areaNameToRegion(action.targetArea);
        const center = Catalog.areaCenterNormalized(region?.id || null, canvasTypeId);
        const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
        targetX = coords.x;
        targetY = coords.y;
      }

      await Board.moveItemByIdToBoardCoords(stickyId, targetX, targetY, log);

      // occupied best-effort aktualisieren (nur body regions)
      const sticky = await Board.getItemById(stickyId, log);
      const stickyW = Board.isFiniteNumber(sticky?.width) ? sticky.width : STICKY_LAYOUT.defaultWidthPx;
      const stickyH = Board.isFiniteNumber(sticky?.height) ? sticky.height : STICKY_LAYOUT.defaultHeightPx;

      const destRegionId = detectBodyRegionIdFromBoardCoords(canvasTypeId, targetX, targetY);
      if (destRegionId && occupiedByRegion[destRegionId]) {
        occupiedByRegion[destRegionId].push({
          id: stickyId,
          x: targetX,
          y: targetY,
          width: stickyW,
          height: stickyH
        });
      }
    },

    // CREATE: Region-Fill-Layout (Grid + Wrap + collision-aware)
    "create_sticky": async (action) => {
      const text = action.text || "(leer)";
      const canvasTypeId = instance.canvasTypeId || TEMPLATE_ID;

      // Robust: Agenten-Outputs variieren manchmal (area vs targetArea)
      const areaName = action.area || action.targetArea || null;
      const region = Catalog.areaNameToRegion(areaName);
      const regionId = region?.id || null;

      const ref = (typeof action.ref === "string") ? action.ref.trim() : null;

      const frameId = instance.actionItems?.frameId || null;

      // Fallback: unbekannte Area → altes Verhalten (Center)
      if (!regionId || !occupiedByRegion[regionId]) {
        const center = Catalog.areaCenterNormalized(null, canvasTypeId);
        const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);

        const sticky = await Board.createStickyNoteAtBoardCoords({
          content: text,
          x: coords.x,
          y: coords.y,
          frameId
        }, log);

        rememberCreatedRef(ref, sticky);
        rememberStickyOwner(sticky?.id);

        // Optional: Region nachträglich erkennen und "occupied" updaten
        const destRegionId = detectBodyRegionIdFromBoardCoords(canvasTypeId, coords.x, coords.y);
        if (destRegionId && occupiedByRegion[destRegionId] && sticky) {
          const w = isFiniteNumber(sticky.width) ? sticky.width : STICKY_LAYOUT.defaultWidthPx;
          const h = isFiniteNumber(sticky.height) ? sticky.height : STICKY_LAYOUT.defaultHeightPx;
          occupiedByRegion[destRegionId].push({ id: sticky.id, x: coords.x, y: coords.y, width: w, height: h });
        }
        return;
      }

      const size = deriveStickySize(regionId);

      const pos = Catalog.computeNextFreeStickyPositionInBodyRegion({
        templateGeometry: geom,
        canvasTypeId,
        regionId,
        stickyWidthPx: size.width,
        stickyHeightPx: size.height,
        marginPx: STICKY_LAYOUT.marginPx,
        gapPx: STICKY_LAYOUT.gapPx,
        occupiedRects: occupiedByRegion[regionId]
      });

      if (!pos) {
        log("create_sticky: Konnte keine Platzierung berechnen (Region=" + regionId + "). Fallback Center.");
        const center = Catalog.areaCenterNormalized(regionId, canvasTypeId);
        const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);

        const sticky = await Board.createStickyNoteAtBoardCoords({
          content: text,
          x: coords.x,
          y: coords.y,
          frameId
        }, log);

        rememberCreatedRef(ref, sticky);
        rememberStickyOwner(sticky?.id);

        // occupied updaten (best effort)
        if (sticky) {
          const w = isFiniteNumber(sticky.width) ? sticky.width : size.width;
          const h = isFiniteNumber(sticky.height) ? sticky.height : size.height;
          occupiedByRegion[regionId].push({ id: sticky.id, x: coords.x, y: coords.y, width: w, height: h });
        }
        return;
      }

      if (pos.isFull) {
        log(
          "WARNUNG: Region '" + regionId + "' wirkt voll (Grid " +
          pos.cols + "x" + pos.rows +
          "). Sticky wird auf die letzte Zelle gesetzt."
        );
      }

      const sticky = await Board.createStickyNoteAtBoardCoords({
        content: text,
        x: pos.x,
        y: pos.y,
        frameId
      }, log);

      rememberCreatedRef(ref, sticky);
      rememberStickyOwner(sticky?.id);

      // Belegte Fläche updaten (damit mehrere create_sticky Actions sauber fortlaufend platzieren)
      const actualW = (sticky && isFiniteNumber(sticky.width)) ? sticky.width : size.width;
      const actualH = (sticky && isFiniteNumber(sticky.height)) ? sticky.height : size.height;

      occupiedByRegion[regionId].push({
        id: sticky?.id || null,
        x: pos.x,
        y: pos.y,
        width: actualW,
        height: actualH
      });
    },

    "delete_sticky": async (action) => {
      const stickyId = resolveStickyIdAny(action.stickyId);
      if (!stickyId) return;

      // occupied vorher entfernen (damit nachfolgende creates wieder Slots nutzen können)
      removeFromAllOccupied(stickyId);

      await Board.removeItemById(stickyId, log);
    },

    // ---- NEU: Connector Actions ----
    "create_connector": async (action) => {
      const fromId = resolveStickyIdAny(action.fromStickyId);
      const toId   = resolveStickyIdAny(action.toStickyId);
      if (!fromId || !toId) {
        deferredConnectorActions.push(action);
        return;
      }
      await createConnectorBetween(fromId, toId, action, { ensure: false });
    },

    "ensure_connector": async (action) => {
      const fromId = resolveStickyIdAny(action.fromStickyId);
      const toId   = resolveStickyIdAny(action.toStickyId);
      if (!fromId || !toId) {
        deferredConnectorActions.push(action);
        return;
      }
      await createConnectorBetween(fromId, toId, action, { ensure: true });
    },

    "delete_connector": async (action) => {
      // delete by connectorId kann sofort; delete by pair evtl. defer
      if (action?.connectorId) {
        await deleteConnectorAction(action);
        return;
      }
      const fromId = resolveStickyIdAny(action?.fromStickyId);
      const toId   = resolveStickyIdAny(action?.toStickyId);
      if (!fromId || !toId) {
        deferredConnectorActions.push(action);
        return;
      }
      await deleteConnectorAction(action);
    },

    "connect_chain": async (action) => {
      const ids = Array.isArray(action.stickyIds) ? action.stickyIds : null;
      if (!ids || ids.length < 2) {
        log("connect_chain: stickyIds muss ein Array mit mind. 2 Einträgen sein.");
        return;
      }

      // Resolve + connect sequentially (ensure semantics)
      const resolved = ids.map(resolveStickyIdAny);

      // Wenn mind. ein Element nicht auflösbar ist, defer (z.B. wegen refs)
      if (resolved.some((x) => !x)) {
        deferredConnectorActions.push(action);
        return;
      }

      for (let i = 0; i < resolved.length - 1; i++) {
        const a = resolved[i];
        const b = resolved[i + 1];
        if (!a || !b) {
          log("connect_chain: Konnte stickyIds[" + i + "] oder [" + (i + 1) + "] nicht auflösen.");
          continue;
        }
        await createConnectorBetween(a, b, action, { ensure: true });
      }
    }
  };

  log("Wende " + actions.length + " Action(s) an (Instanz " + instanceId + ").");
  await OpenAI.dispatchActions(actions, handlers, log);

  // Second pass: deferred connector actions (refs should now exist)
  if (deferredConnectorActions.length) {
    log("Hinweis: Verarbeite " + deferredConnectorActions.length + " deferred Connector-Action(s) ...");

    for (const action of deferredConnectorActions) {
      const t = action?.type;

      if (t === "create_connector") {
        const fromId = resolveStickyIdAny(action.fromStickyId);
        const toId   = resolveStickyIdAny(action.toStickyId);
        if (!fromId || !toId) {
          log("create_connector (deferred): Konnte from/to nicht auflösen.");
          continue;
        }
        await createConnectorBetween(fromId, toId, action, { ensure: false });
        continue;
      }

      if (t === "ensure_connector") {
        const fromId = resolveStickyIdAny(action.fromStickyId);
        const toId   = resolveStickyIdAny(action.toStickyId);
        if (!fromId || !toId) {
          log("ensure_connector (deferred): Konnte from/to nicht auflösen.");
          continue;
        }
        await createConnectorBetween(fromId, toId, action, { ensure: true });
        continue;
      }

      if (t === "delete_connector") {
        // connectorId wurde im first pass bereits behandelt; hier nur pair delete
        if (action?.connectorId) continue;
        const fromId = resolveStickyIdAny(action?.fromStickyId);
        const toId   = resolveStickyIdAny(action?.toStickyId);
        if (!fromId || !toId) {
          log("delete_connector (deferred): Konnte from/to nicht auflösen.");
          continue;
        }
        await deleteConnectorAction(action);
        continue;
      }

      if (t === "connect_chain") {
        const ids = Array.isArray(action.stickyIds) ? action.stickyIds : null;
        if (!ids || ids.length < 2) continue;

        const resolved = ids.map(resolveStickyIdAny);
        if (resolved.some((x) => !x)) {
          log("connect_chain (deferred): Konnte nicht alle stickyIds auflösen.");
          continue;
        }

        for (let i = 0; i < resolved.length - 1; i++) {
          const a = resolved[i];
          const b = resolved[i + 1];
          if (!a || !b) continue;
          await createConnectorBetween(a, b, action, { ensure: true });
        }
        continue;
      }
    }
  }
}

// --------------------------------------------------------------------
// Agent Modus B
// --------------------------------------------------------------------
async function runAgentForInstance(instanceId, options = {}) {
  await initIfNeeded();
  await scanTemplateInstances({ throttleMs: 0 });

  const apiKey = getApiKey();
  const model = getModel();
  const userText = options.userText || getUserTextFromPanel();

  if (!apiKey) {
    log("Bitte OpenAI API Key eingeben.");
    return;
  }

  const instance = state.instancesById.get(instanceId);
  if (!instance) {
    log("Unbekannte Instanz: " + instanceId);
    return;
  }

  const promptCfg = DT_PROMPT_CATALOG[instance.canvasTypeId] || DT_PROMPT_CATALOG[TEMPLATE_ID];
  const systemPrompt = promptCfg.system;

  log("Agent-Run (Modus B) für Instanz " + instanceId + " ...");

  await refreshBoardState();

  const ctx = await Board.getBoardBaseContext(log);
  await Catalog.rebuildLiveCatalog({
    ctx,
    instancesById: state.instancesById,
    clusterAssignments: state.clusterAssignments,
    computeTemplateGeometry: (inst) => Board.computeTemplateGeometry(inst, log),
    log
  });

  const st = await Catalog.computeInstanceState(instance, {
    ctx,
    liveCatalog: state.liveCatalog,
    stickyOwnerCache: state.stickyOwnerCache,
    clusterAssignments: state.clusterAssignments,
    aliasState: state.aliasState,
    hasGlobalBaseline: state.hasGlobalBaseline,
    loadBaselineSignatureForImageId: (imageId) => Board.loadBaselineSignatureForImageId(imageId, log),
    log
  });

  if (!st?.classification) {
    log("Konnte Instanzzustand nicht ermitteln.");
    return;
  }

  const activeCanvasState = Catalog.buildPromptPayloadFromClassification(st.classification, {
    useAliases: true,
    aliasState: state.aliasState,
    log
  });

  const boardCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "instance",
    activeInstanceId: instanceId,
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  const userPayload = {
    userQuestion: userText,
    activeInstanceId: instanceId,
    selectedInstanceIds: [instanceId],
    boardCatalog,
    activeCanvasState,
    activeCanvasStates: { [instanceId]: activeCanvasState },
    activeInstanceChangesSinceLastAgent: null,
    hint: "boardCatalog = Kurzüberblick über alle Instanzen. activeCanvasState enthält detaillierte Stickies/Areas/Verbindungen nur für diese Instanz."
  };

  const body = OpenAI.buildResponsesBody({
    model,
    systemPrompt,
    userText: JSON.stringify(userPayload, null, 2),
    maxOutputTokens: 4000
  });

  try {
    log("Sende Agent-Request an OpenAI ...");
    const data = await OpenAI.callResponsesApi(apiKey, body);
    const answer = OpenAI.extractFirstOutputText(data);

    if (!answer) {
      log("Agent: Keine output_text-Antwort gefunden.");
      return;
    }

    const agentObj = OpenAI.parseJsonFromModelOutput(answer);
    if (!agentObj) {
      log("Agent-Antwort ist kein valides JSON. Rohantwort:");
      log(answer);
      return;
    }

    log("Agent-Analyse (analysis):");
    log(agentObj.analysis || "(keine analysis)");

    if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
      await applyAgentActionsToInstance(instanceId, agentObj.actions);
    } else {
      log("Agent lieferte keine Actions (leer).");
    }

    // Refresh state after actions
    await refreshBoardState();
    const nowIso = new Date().toISOString();
    instance.lastAgentRunAt = nowIso;
    instance.lastChangedAt = nowIso;
  } catch (e) {
    log("Agent-Run Fehler: " + e.message);
  }
}

// --------------------------------------------------------------------
// Global Agent Modus A
// --------------------------------------------------------------------
async function runGlobalAgent(triggerInstanceId, userText) {
  await initIfNeeded();
  await scanTemplateInstances({ throttleMs: 0 });

  const apiKey = getApiKey();
  const model = getModel();
  const finalUserText = (userText || "").trim()
    ? userText.trim()
    : "Bitte gib mir einen globalen Überblick über alle relevanten Canvas-Instanzen und schlage sinnvolle nächste Schritte vor.";

  if (!apiKey) {
    log("Bitte OpenAI API Key eingeben (global).");
    return;
  }

  log("Global Agent Run (Modus A) ...");

  await refreshBoardState();

  const ctx = await Board.getBoardBaseContext(log);

  const stateById = {};
  const allInstances = [];
  state.instancesById.forEach((inst) => allInstances.push(inst));

  for (const inst of allInstances) {
    const st = await Catalog.computeInstanceState(inst, {
      ctx,
      liveCatalog: state.liveCatalog,
      stickyOwnerCache: state.stickyOwnerCache,
      clusterAssignments: state.clusterAssignments,
      aliasState: state.aliasState,
      hasGlobalBaseline: state.hasGlobalBaseline,
      loadBaselineSignatureForImageId: (imageId) => Board.loadBaselineSignatureForImageId(imageId, log),
      log
    });
    stateById[inst.instanceId] = st;
  }

  const boardCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "global",
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  const activeInstanceIds = boardCatalog.instances
    .filter((entry) => entry.isActive)
    .map((entry) => entry.instanceId);

  const activeCanvasStates = {};
  const activeInstanceChangesSinceLastAgent = {};

  for (const id of activeInstanceIds) {
    const st = stateById[id];
    if (!st?.classification) continue;

    const payload = Catalog.buildPromptPayloadFromClassification(st.classification, {
      useAliases: true,
      aliasState: state.aliasState,
      log
    });
    if (payload) activeCanvasStates[id] = payload;
  }

  for (const id of activeInstanceIds) {
    const st = stateById[id];
    if (!state.hasGlobalBaseline) {
      activeInstanceChangesSinceLastAgent[id] = null;
    } else {
      const aliasDiff = Catalog.aliasDiffForActiveInstance(st?.diff, state.aliasState);
      activeInstanceChangesSinceLastAgent[id] = aliasDiff || null;
    }
  }

  const userPayload = {
    userQuestion: finalUserText,
    triggerInstanceId: triggerInstanceId || null,
    hasBaseline: state.hasGlobalBaseline,
    boardCatalog,
    activeInstanceIds,
    activeCanvasStates,
    activeInstanceChangesSinceLastAgent,
    hint: "boardCatalog enthält eine Übersicht über alle Instanzen. activeCanvasStates enthält Detaildaten nur für aktive Instanzen."
  };

  const body = OpenAI.buildResponsesBody({
    model,
    systemPrompt: DT_GLOBAL_SYSTEM_PROMPT,
    userText: JSON.stringify(userPayload, null, 2),
    maxOutputTokens: 4000
  });

  try {
    log("Sende Global-Agent-Request an OpenAI ...");
    const data = await OpenAI.callResponsesApi(apiKey, body);
    const answer = OpenAI.extractFirstOutputText(data);

    if (!answer) {
      log("Global Agent: Keine output_text-Antwort gefunden.");
      return;
    }

    const agentObj = OpenAI.parseJsonFromModelOutput(answer);
    if (!agentObj) {
      log("Global-Agent-Antwort ist kein valides JSON. Rohantwort:");
      log(answer);
      return;
    }

    log("Globale Agent-Analyse (analysis):");
    log(agentObj.analysis || "(keine analysis)");

    if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
      log("Globale Agent-Actions (werden aktuell nur geloggt, nicht angewendet):");
      log(agentObj.actions);
    } else {
      log("Global Agent: actions leer.");
    }

    // Update baseline (persisted)
    const nowIso = new Date().toISOString();
    const savePromises = [];

    state.instancesById.forEach((inst) => {
      const st = stateById[inst.instanceId];
      if (st?.signature && inst.imageId) {
        inst.baselineSignature = st.signature;
        inst.baselineSignatureLoaded = true;
        inst.lastDiff = null;
        inst.lastAgentRunAt = nowIso;
        inst.lastChangedAt = nowIso;
        savePromises.push(Board.saveBaselineSignatureForImageId(inst.imageId, st.signature, log));
      } else {
        inst.lastDiff = null;
        inst.lastAgentRunAt = nowIso;
        inst.lastChangedAt = nowIso;
      }
    });

    state.hasGlobalBaseline = true;
    state.globalBaselineAt = nowIso;

    await Promise.all(savePromises);
    await Board.savePersistedBaselineMeta({
      version: 1,
      hasGlobalBaseline: state.hasGlobalBaseline,
      baselineAt: state.globalBaselineAt
    }, log);

  } catch (e) {
    log("Global Agent Fehler: " + e.message);
  }
}

// --------------------------------------------------------------------
// Classic OpenAI call (debug button)
// --------------------------------------------------------------------
async function callClassicOpenAI() {
  await initIfNeeded();

  const apiKey = getApiKey();
  const model = getModel();
  const userText = (document.getElementById("user-text")?.value || "").trim();

  if (!apiKey) {
    log("Bitte OpenAI API Key eingeben.");
    return;
  }
  if (!userText) {
    log("Bitte eine Frage / Aufgabe eingeben.");
    return;
  }

  await refreshBoardState();

  const classifications = [];
  state.instancesById.forEach((inst) => {
    const liveInst = state.liveCatalog?.instances?.[inst.instanceId];
    if (!liveInst) return;
    const classification = Catalog.buildClassificationFromLiveInstance(inst, liveInst);
    classifications.push(classification);
  });

  const classification =
    classifications.length === 1 ? classifications[0] :
    classifications.length > 1 ? { templates: classifications } :
    null;

  const promptPayload = classification
    ? Catalog.buildPromptPayloadFromClassification(classification, { useAliases: false, aliasState: state.aliasState, log })
    : null;

  const fullUserText = userText + (
    promptPayload
      ? ("\n\nAktuelle Klassifikation (reduziertes JSON):\n" + JSON.stringify(promptPayload, null, 2))
      : "\n\nHinweis: Keine Klassifikation verfügbar."
  );

  const body = OpenAI.buildResponsesBody({
    model,
    systemPrompt:
      "Du bist ein Assistent, der Miro-Boards analysiert. " +
      "Du bekommst Sticky-Notes als JSON und eine Nutzerfrage und sollst exakte Antworten liefern. " +
      "Antworte standardmäßig auf Deutsch.",
    userText: fullUserText,
    maxOutputTokens: 6000
  });

  try {
    log("Classic OpenAI Call ...");
    const data = await OpenAI.callResponsesApi(apiKey, body);
    const answer = OpenAI.extractFirstOutputText(data) || "(keine Antwort)";
    log("Antwort:");
    log(answer);
  } catch (e) {
    log("Classic OpenAI Fehler: " + e.message);
  }
}

// --------------------------------------------------------------------
// Wire buttons (Panel)
// --------------------------------------------------------------------
window.dtInsertTemplateImage = insertTemplateImage;
window.dtClusterSelection = clusterSelectionPanel;
window.dtRunAgentForInstance = runAgentForInstance;
window.dtRunGlobalAgent = runGlobalAgent;
window.dtCallOpenAI = callClassicOpenAI;

// --------------------------------------------------------------------
// Panel UI wiring (Side-Panel Buttons)
// - vorher fehlte hier die Event-Bindung, daher reagierte der Button
//   "Template-Bild einfügen" nicht.
// --------------------------------------------------------------------
function debugClassifyPanel() {
  // Minimaler Debug-Helfer: rebuild + log Klassifikation (ohne Agent)
  refreshBoardState()
    .then(() => {
      const results = [];
      state.instancesById.forEach((inst) => {
        const liveInst = state.liveCatalog?.instances?.[inst.instanceId];
        if (!liveInst) return;
        const classification = Catalog.buildClassificationFromLiveInstance(inst, liveInst);
        results.push(classification);
      });

      if (!results.length) {
        log("Debug: Keine Canvas-Instanzen mit Stickies gefunden.");
        return;
      }

      const out = results.length === 1 ? results[0] : { templates: results };
      log("Debug-Klassifikation:");
      log(out);
    })
    .catch((e) => {
      log("Debug classify Fehler: " + (e?.message || String(e)));
    });
}

function initPanelButtons() {
  const btnInsert = document.getElementById("btn-insert-template");
  if (btnInsert) {
    btnInsert.addEventListener("click", function () {
      insertTemplateImage();
    });
  }

  const btnCluster = document.getElementById("btn-cluster-panel");
  if (btnCluster) {
    btnCluster.addEventListener("click", function () {
      clusterSelectionPanel();
    });
  }

  const btnClassic = document.getElementById("btn-openai-classic");
  if (btnClassic) {
    btnClassic.addEventListener("click", function () {
      callClassicOpenAI();
    });
  }

  const btnDebug = document.getElementById("btn-classify-debug");
  if (btnDebug) {
    btnDebug.addEventListener("click", function () {
      debugClassifyPanel();
    });
  }
}

initPanelButtons();

// Auto-init (so board buttons work after panel open)
initIfNeeded().catch((e) => {
  console.error("[DT] initIfNeeded failed:", e);
  log("Init Fehler: " + (e?.message || String(e)));
});
