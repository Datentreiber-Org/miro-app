// src/main.js
import {
  TEMPLATE_ID,
  TEMPLATE_IMAGE_URL,
  DT_TEMPLATE_CATALOG,
  DT_PROMPT_CATALOG,
  DT_GLOBAL_SYSTEM_PROMPT,
  STICKY_LAYOUT
} from "./config.js";

import { createLogger, stripHtml, extractUnderlinedText, isFiniteNumber } from "./utils.js";

import * as Board from "./miro/board.js";
import * as Catalog from "./domain/catalog.js";
import * as OpenAI from "./ai/openai.js";

// --------------------------------------------------------------------
// State (Controller-Level)
// --------------------------------------------------------------------
const state = {
  initialized: false,

  // Baseline (global)
  hasGlobalBaseline: false,
  globalBaselineAt: null,

  // Instances
  nextInstanceCounter: 1,
  instancesByImageId: new Map(),
  instancesById: new Map(),

  // Cluster (Panel Session)
  clusterAssignments: new Map(),       // stickyId -> clusterName
  clusterCounterByInstanceId: new Map(),

  // Aliases (für Agent actions)
  aliasState: Catalog.createAliasState(),

  // Selection caches
  lastStickySelectionIds: [],
  lastCanvasSelectionInstanceIds: [],

  // Live Catalog cache
  liveCatalog: null,
  stickyOwnerCache: null,

  // Re-entrancy guard
  handlingSelection: false,

  // Scan throttling
  scanPromise: null,
  lastScanAt: 0
};

// --------------------------------------------------------------------
// Logger + initial log
// --------------------------------------------------------------------
const logEl = document.getElementById("log");
const log = createLogger(logEl);

(function initialLog() {
  if (logEl) {
    logEl.textContent =
      "Panel-JS geladen: " + new Date().toLocaleTimeString() +
      "\nWarte auf Miro SDK (Board.ensureMiroReady) ...";
  }
  console.log("[DT] main.js geladen");
})();

window.onerror = function (msg, src, line, col) {
  log("JS-Fehler: " + msg + " @ " + line + ":" + col);
};

// --------------------------------------------------------------------
// UI helpers
// --------------------------------------------------------------------
function getApiKey() {
  const el = document.getElementById("api-key");
  return (el?.value || "").trim();
}
function getModel() {
  const el = document.getElementById("model");
  return (el?.value || "").trim();
}
function getUserQuestionFallback() {
  return "Bitte analysiere diese Canvas-Instanz und führe sinnvolle nächste Schritte im Workshop-Workflow aus.";
}
function getUserTextFromPanel() {
  const el = document.getElementById("user-text");
  const t = (el?.value || "").trim();
  return t || getUserQuestionFallback();
}

// --------------------------------------------------------------------
// Miro init + Scan
// --------------------------------------------------------------------
async function initIfNeeded() {
  if (state.initialized) return;
  state.initialized = true;

  await Board.ensureMiroReady(log);

  // Load persisted baseline meta
  const meta = await Board.loadPersistedBaselineMeta(log);
  if (meta && typeof meta === "object" && meta.version === 1 && meta.hasGlobalBaseline === true) {
    state.hasGlobalBaseline = true;
    state.globalBaselineAt = typeof meta.baselineAt === "string" ? meta.baselineAt : null;
  } else {
    state.hasGlobalBaseline = false;
    state.globalBaselineAt = null;
  }

  await scanTemplateInstances({ throttleMs: 0 });

  // Selection events
  Board.onSelectionUpdate(onSelectionUpdate, log);
}

async function scanTemplateInstances(options = {}) {
  const now = Date.now();
  const throttleMs = typeof options.throttleMs === "number" ? options.throttleMs : 1500;

  // throttle
  if (state.scanPromise) return state.scanPromise;
  if (now - state.lastScanAt < throttleMs) return;
  state.lastScanAt = now;

  state.scanPromise = (async () => {
    const images = await Board.getItems({ type: "image" }, log);

    const templateImageIdsOnBoard = new Set();

    for (const img of images) {
      const canvasTypeId = Catalog.detectCanvasTypeIdFromImage(img, DT_TEMPLATE_CATALOG);
      if (canvasTypeId) {
        templateImageIdsOnBoard.add(img.id);
        await registerInstanceFromImage(img, { createActionShapes: false, canvasTypeId });
      }
    }

    // Remove instances whose images vanished
    for (const imageId of Array.from(state.instancesByImageId.keys())) {
      if (!templateImageIdsOnBoard.has(imageId)) {
        const inst = state.instancesByImageId.get(imageId);
        state.instancesByImageId.delete(imageId);
        if (inst) {
          state.instancesById.delete(inst.instanceId);
          log("Instanz entfernt: " + inst.instanceId + " (Bild gelöscht)");
        }
        await Board.removeBaselineSignatureForImageId(imageId, log);
      }
    }

    // Rebind action shapes (after panel restart)
    await rebindActionShapesAfterScan(images);

    state.scanPromise = null;
  })();

  return state.scanPromise;
}

// --------------------------------------------------------------------
// Instance mgmt: frames + buttons
// --------------------------------------------------------------------
async function createInstanceActionShapes(instance, image) {
  const board = Board.getBoard();
  if (!board) return;

  const canCreateFrame = typeof board.createFrame === "function";
  const canCreateShape = typeof board.createShape === "function";
  const canCreateText  = typeof board.createText === "function";

  if (!canCreateFrame || !canCreateShape) return;

  const frameWidth = image.width + 200;
  const frameHeight = image.height + 260;
  const frameY = image.y + 80;

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
  const buttonWidth = 260;
  const buttonHeight = 60;

  const aiShape = await Board.createShape({
    content: "Send to OpenAI",
    shape: "round_rectangle",
    x: baseX - dx,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  }, log);

  const clusterShape = await Board.createShape({
    content: "Cluster",
    shape: "round_rectangle",
    x: baseX,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  }, log);

  const globalAgentShape = await Board.createShape({
    content: "Global Agent",
    shape: "round_rectangle",
    x: baseX + dx,
    y: baseY,
    width: buttonWidth,
    height: buttonHeight
  }, log);

  let globalInput = null;
  if (canCreateText) {
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
    log("Fehler beim Hinzufügen zum Frame: " + e.message);
  }

  instance.actionItems = {
    frameId: frame.id,
    aiItemId: aiShape.id,
    clusterItemId: clusterShape.id,
    globalAgentItemId: globalAgentShape.id,
    globalAgentInputItemId: globalInput ? globalInput.id : null
  };
}

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
  for (const img of images || []) imageById.set(img.id, img);

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
    const frameTexts = textsByParent.get(frameId) || [];

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
      instance.actionItems = {
        frameId,
        aiItemId: aiShape ? aiShape.id : null,
        clusterItemId: clusterShape ? clusterShape.id : null,
        globalAgentItemId: globalShape ? globalShape.id : null,
        globalAgentInputItemId: globalInput ? globalInput.id : null
      };
    }
  });
}

async function registerInstanceFromImage(image, options = {}) {
  if (!image?.id) return null;

  const createActionShapesFlag = options.createActionShapes !== false;

  const detectedCanvasTypeId =
    options.canvasTypeId ||
    Catalog.detectCanvasTypeIdFromImage(image, DT_TEMPLATE_CATALOG) ||
    TEMPLATE_ID;

  let instance = state.instancesByImageId.get(image.id);
  if (instance) {
    instance.title = image.title || instance.title || "Datentreiber 3-Boxes";
    instance.canvasTypeId = detectedCanvasTypeId || instance.canvasTypeId || TEMPLATE_ID;
    instance.imageId = image.id;

    instance.lastGeometry = {
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height
    };

    // FrameId nachziehen wenn Bild in Frame liegt
    if (!createActionShapesFlag && image.parentId) {
      if (!instance.actionItems) instance.actionItems = {};
      if (!instance.actionItems.frameId) {
        const parent = await Board.getItemById(image.parentId, log);
        if (parent?.type === "frame") instance.actionItems.frameId = parent.id;
      }
    }

    // Baseline signature lazy load
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
    lastGeometry: {
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height
    },

    // signatures
    baselineSignature: null,
    baselineSignatureLoaded: false,
    lastSignature: null,
    lastStateHash: null,
    lastClassification: null,
    lastStateJson: null,
    lastStickyCount: 0,
    lastDiff: null,

    lastAgentRunAt: null,
    lastChangedAt: null,

    actionItems: {},
    liveCatalog: null
  };

  // FrameId merken wenn Bild in Frame liegt (z.B. copy/paste)
  if (!createActionShapesFlag && image.parentId) {
    const parent = await Board.getItemById(image.parentId, log);
    if (parent?.type === "frame") instance.actionItems.frameId = parent.id;
  }

  state.instancesByImageId.set(image.id, instance);
  state.instancesById.set(instanceId, instance);

  log("Neue Instanz registriert: " + instanceId + " (Bild " + image.id + ")");

  if (state.hasGlobalBaseline && !instance.baselineSignatureLoaded) {
    instance.baselineSignature = await Board.loadBaselineSignatureForImageId(image.id, log);
    instance.baselineSignatureLoaded = true;
  }

  if (createActionShapesFlag) {
    try {
      await createInstanceActionShapes(instance, image);
    } catch (e) {
      log("Fehler createInstanceActionShapes: " + e.message);
    }
  }

  return instance;
}

// --------------------------------------------------------------------
// Selection update: detect button shapes + trigger actions
// --------------------------------------------------------------------
async function onSelectionUpdate(event) {
  if (state.handlingSelection) return;

  const items = event?.items || [];

  const stickyIds = items.filter((it) => it.type === "sticky_note").map((it) => it.id);
  if (stickyIds.length > 0) {
    state.lastStickySelectionIds = stickyIds.slice();
  }

  const canvasInstanceIdSet = new Set();

  for (const it of items) {
    if (it.type === "image") {
      const inst = state.instancesByImageId.get(it.id);
      if (inst) canvasInstanceIdSet.add(inst.instanceId);
    } else if (it.type === "frame") {
      state.instancesById.forEach((inst) => {
        if (inst.actionItems?.frameId === it.id) canvasInstanceIdSet.add(inst.instanceId);
      });
    }
  }

  if (canvasInstanceIdSet.size > 0) {
    state.lastCanvasSelectionInstanceIds = Array.from(canvasInstanceIdSet);
  }

  if (items.length !== 1) return;
  const item = items[0];
  if (item.type !== "shape") return;

  // ensure instances + action shapes exist after panel restart
  await scanTemplateInstances({ throttleMs: 0 });

  let instanceId = null;
  let buttonType = null;

  state.instancesById.forEach((inst, id) => {
    const a = inst.actionItems;
    if (!a) return;
    if (a.aiItemId === item.id) {
      instanceId = id;
      buttonType = "ai";
    } else if (a.clusterItemId === item.id) {
      instanceId = id;
      buttonType = "cluster";
    } else if (a.globalAgentItemId === item.id) {
      instanceId = id;
      buttonType = "global";
    }
  });

  if (!instanceId || !buttonType) return;

  state.handlingSelection = true;
  try {
    if (buttonType === "ai") {
      log("AI-Button (Instanz " + instanceId + ")");
      await runAgentForInstance(instanceId);
    } else if (buttonType === "cluster") {
      if (!state.lastStickySelectionIds?.length) {
        log("Cluster: Bitte zuerst Sticky Notes auswählen.");
      } else {
        log("Cluster-Button (Instanz " + instanceId + ")");
        await clusterSelectionWithIds(state.lastStickySelectionIds, instanceId);
      }
    } else if (buttonType === "global") {
      const inst = state.instancesById.get(instanceId);
      const inputId = inst?.actionItems?.globalAgentInputItemId;
      let userText = "";
      if (inputId) {
        const txt = await Board.getItemById(inputId, log);
        userText = (typeof txt?.content === "string") ? txt.content.trim() : "";
      }
      if (!userText) {
        userText = "Bitte gib einen globalen Überblick über alle relevanten Canvas-Instanzen und schlage sinnvolle nächste Schritte vor.";
      }
      log("Global-Agent (ausgelöst von Instanz " + instanceId + ")");
      await runGlobalAgent(instanceId, userText);
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

  log("Template-Bild einfügen ...");

  try {
    const image = await Board.createImage({
      url: TEMPLATE_IMAGE_URL,
      x: 0,
      y: 0,
      width: 2000
    }, log);

    await registerInstanceFromImage(image, { createActionShapes: true });

    log("Template eingefügt: " + image.id);
    await Board.zoomTo(image, log);
  } catch (e) {
    log("Fehler insertTemplateImage: " + e.message);
  }
}

// --------------------------------------------------------------------
// Cluster selection (Panel button + board button)
// --------------------------------------------------------------------
async function clusterSelectionWithIds(stickyIds, expectedInstanceId) {
  await initIfNeeded();
  await scanTemplateInstances({ throttleMs: 0 });

  let stickyNotes = [];

  if (Array.isArray(stickyIds) && stickyIds.length > 0) {
    const arr = await Board.getItems({ id: stickyIds }, log);
    stickyNotes = arr.filter((it) => it.type === "sticky_note");
  } else {
    const selection = await Board.getSelection(log);
    stickyNotes = selection.filter((item) => item.type === "sticky_note");
  }

  if (!stickyNotes.length) {
    log("Cluster: Bitte nur Sticky Notes auswählen.");
    return;
  }

  // Determine instance of each sticky
  const byInstance = {};
  const outside = [];

  const expectedInstance = expectedInstanceId ? state.instancesById.get(expectedInstanceId) : null;
  const expectedFrameId = expectedInstance?.actionItems?.frameId || null;

  for (const s of stickyNotes) {
    let instance = null;

    // If same frame, quick accept
    if (expectedInstance && expectedFrameId && s.parentId === expectedFrameId) {
      instance = expectedInstance;
    } else {
      instance = Catalog.findInstanceForPoint(s.x, s.y, state.instancesById);
    }

    if (!instance) {
      outside.push(s);
      continue;
    }

    const id = instance.instanceId;
    if (!byInstance[id]) byInstance[id] = [];
    byInstance[id].push(s);
  }

  const instanceIds = Object.keys(byInstance);
  if (instanceIds.length === 0) {
    log("Cluster: Keine der Sticky Notes liegt auf einem bekannten Canvas.");
    return;
  }
  if (instanceIds.length > 1) {
    log("Cluster: Auswahl enthält mehrere Canvas-Instanzen. Bitte nur eine Instanz clustern.");
    return;
  }

  const instanceId = instanceIds[0];
  if (expectedInstanceId && instanceId !== expectedInstanceId) {
    log("Cluster: Auswahl gehört zu anderem Canvas als der Button.");
    return;
  }

  const notesInInstance = byInstance[instanceId];

  // Cluster name: underlined sticky -> text, else auto
  let headerSticky = null;
  for (const s of notesInInstance) {
    if (extractUnderlinedText(s.content)) {
      headerSticky = s;
      break;
    }
  }

  let clusterName = null;

  if (headerSticky) {
    const candidate = stripHtml(headerSticky.content).trim();
    if (!candidate) {
      log("Cluster: Unterstrichener Sticky-Text ist leer.");
      return;
    }
    clusterName = candidate;
  } else {
    let count = state.clusterCounterByInstanceId.get(instanceId) || 0;
    count += 1;
    state.clusterCounterByInstanceId.set(instanceId, count);
    clusterName = "Cluster " + count;
  }

  for (const s of notesInInstance) state.clusterAssignments.set(s.id, clusterName);
  for (const s of outside) state.clusterAssignments.set(s.id, clusterName);

  log("Cluster '" + clusterName + "' gesetzt für " + (notesInInstance.length + outside.length) + " Stickies (Session).");
}

async function clusterSelectionPanel() {
  log("Panel: Auswahl clustern.");
  await clusterSelectionWithIds(null, null);
}

// --------------------------------------------------------------------
// Board state rebuild
// --------------------------------------------------------------------
async function refreshBoardState() {
  await initIfNeeded();
  await scanTemplateInstances({ throttleMs: 0 });

  const ctx = await Board.getBoardBaseContext(log);

  const { liveCatalog, stickyOwnerCache } = await Catalog.rebuildLiveCatalog({
    ctx,
    instancesById: state.instancesById,
    clusterAssignments: state.clusterAssignments,
    computeTemplateGeometry: (inst) => Board.computeTemplateGeometry(inst, log),
    log
  });

  state.liveCatalog = liveCatalog;
  state.stickyOwnerCache = stickyOwnerCache;

  // Update instance sticky counts + store liveInst pointer
  state.instancesById.forEach((inst) => {
    const liveInst = liveCatalog.instances[inst.instanceId];
    if (liveInst) {
      inst.lastStickyCount = liveInst.meta?.stickyCount || 0;
      inst.liveCatalog = liveInst;
    } else {
      inst.lastStickyCount = 0;
      inst.liveCatalog = null;
    }
  });
}

// --------------------------------------------------------------------
// Apply agent actions to instance (Modus B)
// --------------------------------------------------------------------
async function applyAgentActionsToInstance(instanceId, actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    log("Keine Actions vom Agenten (leer).");
    return;
  }

  const instance = state.instancesById.get(instanceId);
  if (!instance) {
    log("applyAgentActions: Unbekannte Instanz " + instanceId);
    return;
  }

  const geom = await Board.computeTemplateGeometry(instance, log);
  if (!geom) {
    log("applyAgentActions: Keine Geometrie für Instanz " + instanceId);
    return;
  }

  // ---- Layout State für create_sticky/move_sticky: pro Region belegte Rects ----
  if (!state.liveCatalog || !state.liveCatalog.instances?.[instanceId]) {
    await refreshBoardState();
  }

  const liveInst = state.liveCatalog?.instances?.[instanceId] || null;

  // ---- NEU: "ref" -> echte Sticky-ID (nur für dieses Action-Batch) ----
  // Ermöglicht: create_sticky {ref:"p1_name"} + spätere Actions (connect/move/delete) mit "p1_name"
  const createdRefToId = new Map();

  function resolveStickyIdAny(idOrAliasOrRef) {
    if (!idOrAliasOrRef) return null;
    const key = String(idOrAliasOrRef);
    if (createdRefToId.has(key)) {
      return createdRefToId.get(key);
    }
    return Catalog.resolveStickyId(idOrAliasOrRef, state.aliasState);
  }

  function rememberCreatedRef(ref, sticky) {
    if (!ref || typeof ref !== "string") return;
    const clean = ref.trim();
    if (!clean) return;
    const stickyId = sticky?.id;
    if (!stickyId) return;

    if (createdRefToId.has(clean) && createdRefToId.get(clean) !== stickyId) {
      log("WARNUNG: create_sticky.ref '" + clean + "' wurde überschrieben.");
    }
    createdRefToId.set(clean, stickyId);
  }

  function rememberStickyOwner(stickyId) {
    if (!stickyId) return;
    if (state.stickyOwnerCache && typeof state.stickyOwnerCache.set === "function") {
      state.stickyOwnerCache.set(stickyId, instanceId);
    }
  }

  function rectFromLiveSticky(st) {
    if (!st || typeof st.x !== "number" || typeof st.y !== "number") return null;
    return {
      id: st.id,
      x: st.x,
      y: st.y,
      width: isFiniteNumber(st.width) ? st.width : STICKY_LAYOUT.defaultWidthPx,
      height: isFiniteNumber(st.height) ? st.height : STICKY_LAYOUT.defaultHeightPx
    };
  }

  function buildOccupied(list) {
    const out = [];
    for (const st of list || []) {
      const r = rectFromLiveSticky(st);
      if (r) out.push(r);
    }
    return out;
  }

  const occupiedByRegion = {
    left:   buildOccupied(liveInst?.regions?.body?.left?.stickies),
    middle: buildOccupied(liveInst?.regions?.body?.middle?.stickies),
    right:  buildOccupied(liveInst?.regions?.body?.right?.stickies)
  };

  function deriveStickySize(regionId) {
    const occ = occupiedByRegion[regionId] || [];
    if (occ.length === 0) {
      return { width: STICKY_LAYOUT.defaultWidthPx, height: STICKY_LAYOUT.defaultHeightPx };
    }
    // Nimm als "typische" Größe die erste (stabil genug für Layout)
    return {
      width: occ[0].width || STICKY_LAYOUT.defaultWidthPx,
      height: occ[0].height || STICKY_LAYOUT.defaultHeightPx
    };
  }

  function removeFromAllOccupied(stickyId) {
    if (!stickyId) return;
    for (const rid of Object.keys(occupiedByRegion)) {
      occupiedByRegion[rid] = (occupiedByRegion[rid] || []).filter((r) => r && r.id !== stickyId);
    }
  }

  function detectBodyRegionIdFromBoardCoords(canvasTypeId, x, y) {
    if (!geom || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
    const left0 = geom.x - geom.width / 2;
    const top0  = geom.y - geom.height / 2;
    const px = (x - left0) / geom.width;
    const py = (y - top0) / geom.height;
    if (px < 0 || px > 1 || py < 0 || py > 1) return null;

    const loc = Catalog.classifyNormalizedLocation(canvasTypeId, px, py);
    const rid = loc?.role === "body" ? loc.regionId : null;
    if (rid === "left" || rid === "middle" || rid === "right") return rid;
    return null;
  }

  // ---- NEU: Connector-Index (für ensure/delete by pair) ----
  const connectorIdsByKey = new Map(); // key -> [connectorId, ...]
  function connectorKey(a, b) {
    if (!a || !b) return null;
    const sa = String(a);
    const sb = String(b);
    // undirected key (A|B == B|A)
    return sa < sb ? (sa + "|" + sb) : (sb + "|" + sa);
  }
  function addConnectorId(key, connectorId) {
    if (!key || !connectorId) return;
    let arr = connectorIdsByKey.get(key);
    if (!arr) {
      arr = [];
      connectorIdsByKey.set(key, arr);
    }
    if (!arr.includes(connectorId)) {
      arr.push(connectorId);
    }
  }
  function hasAnyConnector(key) {
    const arr = key ? connectorIdsByKey.get(key) : null;
    return Array.isArray(arr) && arr.length > 0;
  }
  function removeConnectorIdFromIndex(key, connectorId) {
    if (!key || !connectorId) return;
    const arr = connectorIdsByKey.get(key);
    if (!Array.isArray(arr) || arr.length === 0) return;
    connectorIdsByKey.set(key, arr.filter((id) => id !== connectorId));
  }

  for (const c of liveInst?.connections || []) {
    const key = connectorKey(c.fromStickyId, c.toStickyId);
    addConnectorId(key, c.connectorId);
  }

  async function createConnectorBetween(fromId, toId, action, { ensure = false } = {}) {
    if (!fromId || !toId) {
      log("create_connector: from/to fehlt.");
      return;
    }
    if (fromId === toId) {
      log("create_connector: fromStickyId == toStickyId (ignoriere).");
      return;
    }

    // Guard: Standardmäßig nur innerhalb derselben Instanz verbinden (falls Owner bekannt)
    const ownerA = state.stickyOwnerCache?.get?.(fromId) || null;
    const ownerB = state.stickyOwnerCache?.get?.(toId) || null;
    if ((ownerA && ownerA !== instanceId) || (ownerB && ownerB !== instanceId)) {
      log(
        "create_connector: Cross-Instance Verbindung abgelehnt (Instanz " +
        instanceId +
        "). fromOwner=" + (ownerA || "unknown") +
        ", toOwner=" + (ownerB || "unknown")
      );
      return;
    }

    const key = connectorKey(fromId, toId);

    if (ensure && key && hasAnyConnector(key)) {
      // Schon verbunden -> nichts tun
      return;
    }

    try {
      const connector = await Board.createConnectorBetweenItems({
        startItemId: fromId,
        endItemId: toId,
        caption: action?.caption || null,
        shape: action?.shape || null,
        style: action?.style || null,
        startSnapTo: action?.startSnapTo || "auto",
        endSnapTo: action?.endSnapTo || "auto"
      }, log);

      if (connector?.id && key) {
        addConnectorId(key, connector.id);
      }
    } catch (e) {
      log("Fehler bei create_connector: " + e.message);
    }
  }

  async function deleteConnectorAction(action) {
    const connectorId = action?.connectorId ? String(action.connectorId) : null;

    if (connectorId) {
      try {
        await Board.removeItemById(connectorId, log);
      } catch (e) {
        log("Fehler bei delete_connector (" + connectorId + "): " + e.message);
      }
      return;
    }

    const fromId = resolveStickyIdAny(action?.fromStickyId);
    const toId   = resolveStickyIdAny(action?.toStickyId);
    if (!fromId || !toId) {
      log("delete_connector: Bitte connectorId ODER fromStickyId/toStickyId angeben.");
      return;
    }

    const key = connectorKey(fromId, toId);
    const ids = key ? (connectorIdsByKey.get(key) || []) : [];

    if (!ids.length) {
      log("delete_connector: Kein Connector zwischen den angegebenen Stickies gefunden.");
      return;
    }

    const removeAll = action?.all === true || action?.removeAll === true;
    const toDelete = removeAll ? ids.slice() : [ids[0]];

    for (const id of toDelete) {
      try {
        await Board.removeItemById(id, log);
        removeConnectorIdFromIndex(key, id);
      } catch (e) {
        log("Fehler bei delete_connector (" + id + "): " + e.message);
      }
    }
  }

  const handlers = {
    // MOVE: wenn targetPx/targetPy fehlen, dann "snap to next free slot" in targetArea
    "move_sticky": async (action) => {
      const stickyId = resolveStickyIdAny(action.stickyId);
      if (!stickyId) return;

      const canvasTypeId = instance.canvasTypeId || TEMPLATE_ID;

      // Sticky-Item laden (für echte width/height)
      let stickyItem = null;
      try {
        stickyItem = await Board.getItemById(stickyId, log);
      } catch (_) {}

      const stickyW = isFiniteNumber(stickyItem?.width) ? stickyItem.width : STICKY_LAYOUT.defaultWidthPx;
      const stickyH = isFiniteNumber(stickyItem?.height) ? stickyItem.height : STICKY_LAYOUT.defaultHeightPx;

      // Vorab entfernen (damit wir uns nicht selbst blockieren)
      removeFromAllOccupied(stickyId);

      let targetX = null;
      let targetY = null;

      const hasExplicitTarget =
        (typeof action.targetPx === "number" && typeof action.targetPy === "number");

      if (hasExplicitTarget) {
        const coords = Catalog.normalizedToBoardCoords(geom, action.targetPx, action.targetPy);
        targetX = coords.x;
        targetY = coords.y;
      } else {
        const region = Catalog.areaNameToRegion(action.targetArea);
        const regionId = region?.id || null;

        if (regionId && occupiedByRegion[regionId]) {
          const pos = Catalog.computeNextFreeStickyPositionInBodyRegion({
            templateGeometry: geom,
            canvasTypeId,
            regionId,
            stickyWidthPx: stickyW,
            stickyHeightPx: stickyH,
            marginPx: STICKY_LAYOUT.marginPx,
            gapPx: STICKY_LAYOUT.gapPx,
            occupiedRects: occupiedByRegion[regionId]
          });

          if (pos) {
            if (pos.isFull) {
              log(
                "WARNUNG: Region '" + regionId + "' wirkt voll (Grid " +
                pos.cols + "x" + pos.rows +
                "). move_sticky setzt auf letzte Zelle."
              );
            }
            targetX = pos.x;
            targetY = pos.y;
          } else {
            // Fallback: Center
            const center = Catalog.areaCenterNormalized(regionId, canvasTypeId);
            const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
            targetX = coords.x;
            targetY = coords.y;
          }
        } else {
          // Unbekannte Area -> Center (altes Verhalten)
          const center = Catalog.areaCenterNormalized(null, canvasTypeId);
          const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
          targetX = coords.x;
          targetY = coords.y;
        }
      }

      if (!isFiniteNumber(targetX) || !isFiniteNumber(targetY)) {
        log("move_sticky: Zielkoordinaten ungültig für Sticky " + stickyId);
        return;
      }

      await Board.moveItemByIdToBoardCoords(stickyId, targetX, targetY, log);

      // Occupied updaten (damit nachfolgende create/move nicht kollidieren)
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
      await createConnectorBetween(fromId, toId, action, { ensure: false });
    },

    "ensure_connector": async (action) => {
      const fromId = resolveStickyIdAny(action.fromStickyId);
      const toId   = resolveStickyIdAny(action.toStickyId);
      await createConnectorBetween(fromId, toId, action, { ensure: true });
    },

    "delete_connector": async (action) => {
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

// Auto-init (so board buttons work after panel open)
initIfNeeded().catch((e) => {
  console.error("[DT] initIfNeeded failed:", e);
  log("Init Fehler: " + (e?.message || String(e)));
});
