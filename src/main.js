import {
  TEMPLATE_ID,
  DT_TEMPLATE_CATALOG,
  DT_CANVAS_DEFS,
  DT_PROMPT_CATALOG,
  DT_GLOBAL_SYSTEM_PROMPT,
  STICKY_LAYOUT
} from "./config.js?v=20260228-step4";

import { createLogger, stripHtml, extractUnderlinedText, isFiniteNumber } from "./utils.js?v=20260228-step4";

import * as Board from "./miro/board.js?v=20260228-step4";
import * as Catalog from "./domain/catalog.js?v=20260228-step4";
import * as OpenAI from "./ai/openai.js?v=20260228-step4";

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

  // UI state
  selectedCanvasTypeId: TEMPLATE_ID,

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
const selectionStatusEl = document.getElementById("selection-status");
const canvasTypePickerEl = document.getElementById("canvas-type-picker");
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
  return (el?.value || "gpt-4.1-mini").trim();
}
function getPanelUserText() {
  const el = document.getElementById("user-text");
  return (el?.value || "").trim();
}
function getCurrentUserQuestion() {
  const t = getPanelUserText();
  return t || "Bitte analysiere die relevanten Canvas-Instanzen und führe sinnvolle nächste Schritte innerhalb des Workshop-Workflows aus.";
}

function getCanvasTypeCatalogEntries() {
  return Object.entries(DT_TEMPLATE_CATALOG || {}).map(([canvasTypeId, cfg]) => ({
    canvasTypeId,
    displayName: (typeof cfg?.displayName === "string" && cfg.displayName.trim()) ? cfg.displayName.trim() : canvasTypeId,
    thumbnailUrl: (typeof cfg?.thumbnailUrl === "string" && cfg.thumbnailUrl.trim()) ? cfg.thumbnailUrl.trim() : (cfg?.imageUrl || ""),
    imageUrl: (typeof cfg?.imageUrl === "string" && cfg.imageUrl.trim()) ? cfg.imageUrl.trim() : "",
    insertWidthPx: Number(cfg?.insertWidthPx) > 0 ? Number(cfg.insertWidthPx) : null
  }));
}

function normalizeCanvasTypeId(canvasTypeId) {
  if (typeof canvasTypeId === "string" && canvasTypeId && DT_TEMPLATE_CATALOG[canvasTypeId]) {
    return canvasTypeId;
  }
  const first = getCanvasTypeCatalogEntries()[0];
  return first?.canvasTypeId || TEMPLATE_ID;
}

function getCanvasTypeEntry(canvasTypeId) {
  const normalizedId = normalizeCanvasTypeId(canvasTypeId);
  return getCanvasTypeCatalogEntries().find((entry) => entry.canvasTypeId === normalizedId) || null;
}

function getSelectedCanvasTypeId() {
  return normalizeCanvasTypeId(state.selectedCanvasTypeId);
}

function setSelectedCanvasTypeId(canvasTypeId) {
  state.selectedCanvasTypeId = normalizeCanvasTypeId(canvasTypeId);
}

function renderCanvasTypePicker() {
  if (!canvasTypePickerEl) return;

  const entries = getCanvasTypeCatalogEntries();
  const selectedCanvasTypeId = getSelectedCanvasTypeId();

  canvasTypePickerEl.textContent = "";

  if (entries.length === 0) {
    canvasTypePickerEl.textContent = "Keine Canvas-Typen konfiguriert.";
    return;
  }

  for (const entry of entries) {
    const label = document.createElement("label");
    label.className = "canvas-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "dt-canvas-type";
    input.value = entry.canvasTypeId;
    input.checked = entry.canvasTypeId === selectedCanvasTypeId;
    input.addEventListener("change", () => {
      if (!input.checked) return;
      setSelectedCanvasTypeId(entry.canvasTypeId);
      renderCanvasTypePicker();
    });

    const card = document.createElement("span");
    card.className = "canvas-option-card";

    const thumb = document.createElement("img");
    thumb.className = "canvas-thumb";
    thumb.alt = entry.displayName;
    thumb.src = entry.thumbnailUrl || entry.imageUrl || "";
    thumb.loading = "lazy";

    const textWrap = document.createElement("span");

    const title = document.createElement("div");
    title.className = "canvas-option-title";
    title.textContent = entry.displayName;

    const meta = document.createElement("div");
    meta.className = "canvas-option-meta";
    meta.textContent = entry.canvasTypeId;

    textWrap.appendChild(title);
    textWrap.appendChild(meta);
    card.appendChild(thumb);
    card.appendChild(textWrap);
    label.appendChild(input);
    label.appendChild(card);
    canvasTypePickerEl.appendChild(label);
  }
}

// --------------------------------------------------------------------
// Init Panel Buttons
// --------------------------------------------------------------------
function initPanelButtons() {
  renderCanvasTypePicker();

  document.getElementById("btn-insert-template")?.addEventListener("click", insertTemplateImage);
  document.getElementById("btn-agent-selection")?.addEventListener("click", runAgentForCurrentSelection);
  document.getElementById("btn-global-agent")?.addEventListener("click", () => runGlobalAgent(null, getPanelUserText()));
  document.getElementById("btn-cluster-panel")?.addEventListener("click", clusterSelectionFromPanel);
  document.getElementById("btn-classify-debug")?.addEventListener("click", () => classifyStickies({ silent: false }));
  document.getElementById("btn-openai-classic")?.addEventListener("click", callOpenAIClassic);

  // optional exports for debugging/back-compat
  window.dtInsertTemplateImage = insertTemplateImage;
  window.dtClassifyStickies = (opts) => classifyStickies(opts || {});
  window.dtCallOpenAI = callOpenAIClassic;
  window.dtClusterSelection = clusterSelectionFromPanel;
  window.dtRunAgentForCurrentSelection = runAgentForCurrentSelection;
  window.dtRunAgentForInstance = runAgentForInstance;
  window.dtRunGlobalAgent = runGlobalAgent;
}
initPanelButtons();

// --------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------
(async function boot() {
  await Board.ensureMiroReady(log);
  await afterMiroReady();
})().catch((e) => {
  console.error("[DT] Boot fehlgeschlagen:", e);
  log("Boot Fehler: " + (e?.message || String(e)));
});

async function afterMiroReady() {
  if (state.initialized) return;
  state.initialized = true;

  // Baseline meta laden
  const meta = await Board.loadPersistedBaselineMeta(log);
  state.hasGlobalBaseline = !!meta.hasGlobalBaseline;
  state.globalBaselineAt = meta.baselineAt || null;

  // Initial scan
  await ensureInstancesScanned(true);

  // UI selection events
  await Board.registerSelectionUpdateHandler(onSelectionUpdate, log);
  await refreshSelectionStatusFromBoard();

  log("Init abgeschlossen. Global baseline: " + (state.hasGlobalBaseline ? ("JA (" + (state.globalBaselineAt || "unknown") + ")") : "NEIN"));
}

// --------------------------------------------------------------------
// Scan throttling + Instance scan
// --------------------------------------------------------------------
function nextInstanceId() {
  return "inst-" + (state.nextInstanceCounter++);
}

async function ensureInstancesScanned(force = false) {
  const now = Date.now();
  const RECENT_MS = 1200;

  if (!force && state.lastScanAt && (now - state.lastScanAt) < RECENT_MS) {
    return;
  }
  if (state.scanPromise) {
    await state.scanPromise;
    return;
  }

  state.scanPromise = (async () => {
    await Board.scanTemplateInstances({
      templateCatalog: DT_TEMPLATE_CATALOG,
      defaultTemplateId: TEMPLATE_ID,
      instancesByImageId: state.instancesByImageId,
      instancesById: state.instancesById,
      nextInstanceId: nextInstanceId,
      hasGlobalBaseline: state.hasGlobalBaseline,
      log
    });
    state.lastScanAt = Date.now();
  })();

  try {
    await state.scanPromise;
  } finally {
    state.scanPromise = null;
  }
}

// --------------------------------------------------------------------
// Selection update (Panel-targeting via board selection)
// --------------------------------------------------------------------
function setSelectionStatus(text) {
  if (!selectionStatusEl) return;
  selectionStatusEl.textContent = text || "Keine Canvas selektiert.";
}

function getActionFrameInstanceId(frameId) {
  if (!frameId) return null;
  for (const inst of state.instancesById.values()) {
    if (inst?.actionItems?.frameId === frameId) return inst.instanceId;
  }
  return null;
}

async function resolveSelectionToInstanceIds(items) {
  await ensureInstancesScanned();

  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];

  const geomEntries = await Board.buildInstanceGeometryIndex(state.instancesById, log);
  const parentGeomCache = new Map();
  const resolved = [];
  const seen = new Set();

  function addInstanceId(instanceId) {
    if (!instanceId || seen.has(instanceId) || !state.instancesById.has(instanceId)) return;
    seen.add(instanceId);
    resolved.push(instanceId);
  }

  for (const item of list) {
    if (!item) continue;

    if (item.type === "image") {
      addInstanceId(state.instancesByImageId.get(item.id)?.instanceId || null);
      continue;
    }

    if (item.type === "frame") {
      addInstanceId(getActionFrameInstanceId(item.id));
      continue;
    }

    if (item.type === "connector") {
      const fromOwner = item.start?.item ? (state.stickyOwnerCache?.get(item.start.item) || null) : null;
      const toOwner = item.end?.item ? (state.stickyOwnerCache?.get(item.end.item) || null) : null;
      if (fromOwner && toOwner && fromOwner === toOwner) {
        addInstanceId(fromOwner);
        continue;
      }
      if (fromOwner) {
        addInstanceId(fromOwner);
        continue;
      }
      if (toOwner) {
        addInstanceId(toOwner);
        continue;
      }
    }

    if (item.type === "sticky_note") {
      const owner = state.stickyOwnerCache?.get(item.id) || null;
      if (owner) {
        addInstanceId(owner);
        continue;
      }
    }

    try {
      const pos = await Board.resolveBoardCoords(item, parentGeomCache, log);
      if (!pos) continue;
      const instance = Board.findInstanceByPoint(pos.x, pos.y, geomEntries);
      if (instance?.instanceId) addInstanceId(instance.instanceId);
    } catch (_) {}
  }

  return resolved;
}

function buildSelectionStatusText({ itemCount, instanceIds }) {
  const ids = Array.isArray(instanceIds) ? instanceIds : [];

  if (itemCount === 0) {
    return [
      "Keine Canvas selektiert.",
      "Instanz-Agent erwartet mindestens eine selektierte Canvas-Instanz auf dem Board."
    ].join("\n");
  }

  if (ids.length === 0) {
    return [
      "Aktuelle Selektion enthält keine auflösbare Canvas.",
      "Selektierte Board-Items: " + itemCount,
      "Wähle mindestens eine Canvas oder ein Item innerhalb einer Canvas aus."
    ].join("\n");
  }

  return [
    "Selektierte Canvas: " + ids.length,
    "Instanzen: " + ids.join(", "),
    "Selektierte Board-Items: " + itemCount
  ].join("\n");
}

async function refreshSelectionStatusFromItems(items) {
  const list = Array.isArray(items) ? items : [];
  const stickyIds = list.filter((it) => it.type === "sticky_note").map((it) => it.id);

  state.lastStickySelectionIds = stickyIds.slice();
  const instanceIds = await resolveSelectionToInstanceIds(list);
  state.lastCanvasSelectionInstanceIds = instanceIds.slice();

  setSelectionStatus(buildSelectionStatusText({
    itemCount: list.length,
    instanceIds
  }));

  return instanceIds;
}

async function refreshSelectionStatusFromBoard() {
  const selection = await Board.getSelection(log).catch(() => []);
  return await refreshSelectionStatusFromItems(selection || []);
}

async function onSelectionUpdate(event) {
  if (state.handlingSelection) return;
  const items = event?.items || [];
  await refreshSelectionStatusFromItems(items);
}

// --------------------------------------------------------------------
// Insert Canvas Instance (viewport-centered, collision-aware)
// --------------------------------------------------------------------
const TEMPLATE_INSERTION = {
  defaultWidthPx: 2000,
  footprintGapPx: 240,
  maxSearchRings: 60
};

function estimateTemplateSize(canvasTypeId, widthPx) {
  const def = DT_CANVAS_DEFS[canvasTypeId] || DT_CANVAS_DEFS[TEMPLATE_ID] || null;
  const originalWidth = Number(def?.originalWidth) || 0;
  const originalHeight = Number(def?.originalHeight) || 0;

  if (originalWidth > 0 && originalHeight > 0) {
    return {
      width: widthPx,
      height: widthPx * (originalHeight / originalWidth)
    };
  }

  return {
    width: widthPx,
    height: widthPx
  };
}

function getInsertWidthPxForCanvasType(canvasTypeId) {
  const entry = getCanvasTypeEntry(canvasTypeId);
  const configuredWidth = Number(entry?.insertWidthPx) || 0;
  return configuredWidth > 0 ? configuredWidth : TEMPLATE_INSERTION.defaultWidthPx;
}

async function getViewportSafe() {
  if (typeof Board.getViewport === "function") {
    try {
      const viewport = await Board.getViewport(log);
      if (viewport) return viewport;
    } catch (_) {}
  }

  const sdkViewport = window.miro?.board?.viewport;
  if (sdkViewport && typeof sdkViewport.get === "function") {
    try {
      return await sdkViewport.get();
    } catch (_) {}
  }

  return null;
}

function rectsOverlapByCenter(a, b, padding = 0) {
  if (!a || !b) return false;

  const dx = Math.abs((a.x || 0) - (b.x || 0));
  const dy = Math.abs((a.y || 0) - (b.y || 0));
  const limitX = ((a.width || 0) + (b.width || 0)) / 2 + padding;
  const limitY = ((a.height || 0) + (b.height || 0)) / 2 + padding;

  return dx < limitX && dy < limitY;
}

function buildInsertionCandidates(centerX, centerY, stepX, stepY, maxRings) {
  const candidates = [];
  const seen = new Set();

  function pushCandidate(gridX, gridY) {
    const x = centerX + (gridX * stepX);
    const y = centerY + (gridY * stepY);
    const key = String(gridX) + ":" + String(gridY);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ x, y, gridX, gridY });
  }

  pushCandidate(0, 0);

  for (let ring = 1; ring <= maxRings; ring++) {
    for (let gx = -ring; gx <= ring; gx++) {
      pushCandidate(gx, -ring);
      pushCandidate(gx, ring);
    }
    for (let gy = -ring + 1; gy <= ring - 1; gy++) {
      pushCandidate(-ring, gy);
      pushCandidate(ring, gy);
    }
  }

  return candidates;
}

async function getOccupiedTemplateFootprints() {
  const occupied = [];

  for (const inst of state.instancesById.values()) {
    const geom = await Board.computeTemplateGeometry(inst, log);
    if (!geom) continue;

    occupied.push({
      instanceId: inst.instanceId,
      x: geom.x,
      y: geom.y,
      width: geom.width,
      height: geom.height
    });
  }

  return occupied;
}

async function computeTemplateInsertPosition(canvasTypeId, insertWidthPx) {
  await ensureInstancesScanned(true);

  const viewport = await getViewportSafe();
  const viewportCenterX = viewport && isFiniteNumber(viewport.x) && isFiniteNumber(viewport.width)
    ? viewport.x + viewport.width / 2
    : 0;
  const viewportCenterY = viewport && isFiniteNumber(viewport.y) && isFiniteNumber(viewport.height)
    ? viewport.y + viewport.height / 2
    : 0;

  const estimatedImage = estimateTemplateSize(canvasTypeId, insertWidthPx);
  const footprint = {
    width: estimatedImage.width,
    height: estimatedImage.height
  };
  const occupied = await getOccupiedTemplateFootprints();

  const stepX = footprint.width + TEMPLATE_INSERTION.footprintGapPx;
  const stepY = footprint.height + TEMPLATE_INSERTION.footprintGapPx;

  const candidates = buildInsertionCandidates(
    viewportCenterX,
    viewportCenterY,
    stepX,
    stepY,
    TEMPLATE_INSERTION.maxSearchRings
  );

  for (const candidate of candidates) {
    const candidateRect = {
      x: candidate.x,
      y: candidate.y,
      width: footprint.width,
      height: footprint.height
    };

    const overlaps = occupied.some((rect) => rectsOverlapByCenter(candidateRect, rect, 0));
    if (!overlaps) {
      return {
        x: candidate.x,
        y: candidate.y,
        viewportCenterX,
        viewportCenterY,
        usedViewportCenter: candidate.gridX === 0 && candidate.gridY === 0
      };
    }
  }

  throw new Error("Kein kollisionsfreier Einfügepunkt für den Canvas gefunden.");
}

async function insertTemplateImage() {
  const selectedCanvasTypeId = getSelectedCanvasTypeId();
  const selectedCanvasType = getCanvasTypeEntry(selectedCanvasTypeId);
  const insertWidthPx = getInsertWidthPxForCanvasType(selectedCanvasTypeId);

  if (!selectedCanvasType?.imageUrl) {
    log("Fehler beim Einfügen des Canvas: Kein gültiger Canvas-Typ ausgewählt.");
    return;
  }

  log("Button: Canvas einfügen (" + selectedCanvasTypeId + ").");
  await Board.ensureMiroReady(log);

  try {
    const placement = await computeTemplateInsertPosition(selectedCanvasTypeId, insertWidthPx);

    const image = await Board.createImage({
      url: selectedCanvasType.imageUrl,
      x: placement.x,
      y: placement.y,
      width: insertWidthPx
    }, log);

    await Board.registerInstanceFromImage(image, {
      templateCatalog: DT_TEMPLATE_CATALOG,
      defaultTemplateId: TEMPLATE_ID,
      instancesByImageId: state.instancesByImageId,
      instancesById: state.instancesById,
      nextInstanceId: nextInstanceId,
      hasGlobalBaseline: state.hasGlobalBaseline,
      createActionShapes: false,
      canvasTypeId: selectedCanvasTypeId,
      log
    });

    const placementInfo = placement.usedViewportCenter
      ? "Neue Instanz wurde mittig in der aktuellen View platziert."
      : "Neue Instanz wurde nahe der aktuellen View platziert, mit Überlappungsschutz.";

    log(`Canvas eingefügt: ${selectedCanvasType.displayName} (${selectedCanvasTypeId}), Bild-ID ${image.id}
${placementInfo}
Die Steuerung erfolgt jetzt über das Side Panel.`);

    await Board.zoomTo(image, log);
    await refreshSelectionStatusFromBoard();
  } catch (e) {
    log("Fehler beim Einfügen des Canvas: " + e.message);
  }
}

// --------------------------------------------------------------------
// Cluster selection (Panel + Shape button)
// --------------------------------------------------------------------
async function clusterSelectionFromPanel() {
  log("Button: Auswahl clustern (Side-Panel).");
  await clusterSelectionWithIds(null, null);
}

async function clusterSelectionWithIds(stickyIdsOrNull, expectedInstanceIdOrNull) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();

  let stickyNotes = [];

  if (Array.isArray(stickyIdsOrNull) && stickyIdsOrNull.length > 0) {
    const arr = await Board.getItemsById(stickyIdsOrNull, log);
    stickyNotes = (arr || []).filter((it) => it.type === "sticky_note");
  } else {
    const selection = await Board.getSelection(log);
    stickyNotes = (selection || []).filter((it) => it.type === "sticky_note");
  }

  if (!stickyNotes.length) {
    log("Keine Sticky Notes ausgewählt.");
    return;
  }

  const geomEntries = await Board.buildInstanceGeometryIndex(state.instancesById, log);

  const byInstance = Object.create(null);
  const outside = [];

  const expectedInst = expectedInstanceIdOrNull ? state.instancesById.get(expectedInstanceIdOrNull) : null;
  const expectedFrameId = expectedInst?.actionItems?.frameId || null;

  const parentGeomCache = new Map();

  for (const s of stickyNotes) {
    let boardPos = null;
    try {
      boardPos = await Board.resolveBoardCoords(s, parentGeomCache, log);
    } catch (_) {}

    const sx = boardPos?.x ?? s.x;
    const sy = boardPos?.y ?? s.y;

    let instance = null;

    // Wenn Cluster via Button in einem Frame ausgelöst wurde, priorisiere ParentId==frameId
    if (expectedInst && expectedFrameId && s.parentId === expectedFrameId) {
      instance = expectedInst;
    } else {
      instance = Board.findInstanceByPoint(sx, sy, geomEntries);
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
    log("Keine der ausgewählten Stickies liegt über einem Canvas.");
    return;
  }
  if (instanceIds.length > 1) {
    log("Auswahl enthält Stickies aus mehreren Instanzen. Bitte nur eine Instanz clustern.");
    return;
  }

  const instanceId = instanceIds[0];

  if (expectedInstanceIdOrNull && instanceId !== expectedInstanceIdOrNull) {
    log("Cluster-Button gehört zu einer anderen Instanz als die Sticky-Auswahl.");
    return;
  }

  const notesInInstance = byInstance[instanceId];

  // Clustername: unterstrichener Sticky (wenn vorhanden) ansonsten "Cluster N"
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
      log("Unterstrichener Sticky ist leer. Bitte lesbaren Namen unterstreichen.");
      return;
    }
    clusterName = candidate;
  } else {
    const count = (state.clusterCounterByInstanceId.get(instanceId) || 0) + 1;
    state.clusterCounterByInstanceId.set(instanceId, count);
    clusterName = "Cluster " + count;
  }

  for (const s of notesInInstance) state.clusterAssignments.set(s.id, clusterName);
  for (const s of outside) state.clusterAssignments.set(s.id, clusterName);

  log("Cluster '" + clusterName + "' gesetzt für " + (notesInInstance.length + outside.length) + " Stickies (Session-State).");
}

// --------------------------------------------------------------------
// Live catalog refresh
// --------------------------------------------------------------------
async function refreshBoardState() {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();

  const ctx = await Board.getBoardBaseContext(log);

  const { liveCatalog, stickyOwnerCache } = await Catalog.rebuildLiveCatalog({
    ctx,
    instancesById: state.instancesById,
    templateId: TEMPLATE_ID,
    templateCatalog: DT_TEMPLATE_CATALOG,
    clusterAssignments: state.clusterAssignments,
    computeTemplateGeometry: (inst) => Board.computeTemplateGeometry(inst, log),
    buildInstanceGeometryIndex: () => Board.buildInstanceGeometryIndex(state.instancesById, log),
    findInstanceByPoint: Board.findInstanceByPoint,
    resolveBoardCoords: Board.resolveBoardCoords,
    log
  });

  state.liveCatalog = liveCatalog;
  state.stickyOwnerCache = stickyOwnerCache;

  // Update instance sticky counts (nice for boardCatalog summaries)
  for (const inst of state.instancesById.values()) {
    const li = liveCatalog.instances?.[inst.instanceId];
    inst.lastStickyCount = li?.meta?.stickyCount || 0;
    inst.liveCatalog = li || null;
  }

  return { ctx, liveCatalog, stickyOwnerCache };
}

// --------------------------------------------------------------------
// Debug classify (from live catalog)
// --------------------------------------------------------------------
async function classifyStickies({ silent = false } = {}) {
  if (!silent) log("Button: Stickies klassifizieren (Debug).");

  await refreshBoardState();

  const results = [];
  for (const inst of state.instancesById.values()) {
    const li = state.liveCatalog?.instances?.[inst.instanceId];
    if (!li) continue;
    const classification = Catalog.buildClassificationFromLiveInstance(inst, li);
    results.push(classification);
  }

  if (!results.length) {
    if (!silent) log("Keine Canvas-Instanzen mit Stickies gefunden.");
    return null;
  }

  const out = (results.length === 1) ? results[0] : { templates: results };
  if (!silent) {
    log("Klassifikation fertig:");
    log(out);
  }
  return out;
}

// --------------------------------------------------------------------
// Classic OpenAI Call (Side panel)
// --------------------------------------------------------------------
async function callOpenAIClassic() {
  await Board.ensureMiroReady(log);

  const apiKey = getApiKey();
  const model = getModel();
  const userText = getPanelUserText();

  if (!apiKey) { log("Bitte OpenAI API Key eingeben."); return; }
  if (!userText) { log("Bitte eine Frage/Aufgabe eingeben."); return; }

  const classification = await classifyStickies({ silent: true });

  const promptPayload = classification
    ? Catalog.buildPromptPayloadFromClassification(classification, { useAliases: false, aliasState: state.aliasState, log })
    : null;

  const classificationPart = promptPayload
    ? "\n\nAktuelle Sticky-Notiz-Klassifikation (reduziertes JSON):\n" + JSON.stringify(promptPayload, null, 2)
    : "\n\nHinweis: Keine Klassifikation verfügbar.";

  const fullUserText = userText + classificationPart;

  try {
    log("Sende OpenAI Anfrage (klassisch) ...");
    const answer = await OpenAI.callOpenAIResponses({
      apiKey,
      model,
      systemPrompt:
        "Du bist ein Assistent, der Miro-Boards analysiert. " +
        "Du bekommst Sticky-Notes als JSON und eine Nutzerfrage und sollst exakte Antworten liefern. " +
        "Antworte standardmäßig auf Deutsch.",
      userText: fullUserText,
      maxOutputTokens: 10000
    });

    log("Antwort von OpenAI (klassisch):");
    log(answer || "(keine Antwort gefunden)");
  } catch (e) {
    log("Exception beim OpenAI Call: " + e.message);
  }
}

// --------------------------------------------------------------------
// Instance state for agent (signature + diff + prompt payload)
// --------------------------------------------------------------------
async function getInstanceStateForAgent(instance, { liveCatalog, hasGlobalBaseline }) {
  return await Catalog.computeInstanceState(instance, {
    liveCatalog,
    hasGlobalBaseline,
    loadBaselineSignatureForImageId: Board.loadBaselineSignatureForImageId,
    log
  });
}

async function computeInstanceStatesById(liveCatalog) {
  const stateById = Object.create(null);

  for (const inst of state.instancesById.values()) {
    const st = await getInstanceStateForAgent(inst, {
      liveCatalog,
      hasGlobalBaseline: state.hasGlobalBaseline
    });
    if (st) stateById[inst.instanceId] = st;
  }

  return stateById;
}

// --------------------------------------------------------------------
// Apply agent actions (dispatcher + board ops)
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

  const handlers = {
    // MOVE: wenn targetPx/targetPy fehlen, dann "snap to next free slot" in targetArea
    "move_sticky": async (action) => {
      const stickyId = Catalog.resolveStickyId(action.stickyId, state.aliasState);
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

      // Fallback: unbekannte Area → altes Verhalten (Center)
      if (!regionId || !occupiedByRegion[regionId]) {
        const center = Catalog.areaCenterNormalized(null, canvasTypeId);
        const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);

        await Board.createStickyNoteAtBoardCoords({
          content: text,
          x: coords.x,
          y: coords.y,
          frameId: instance.actionItems?.frameId || null
        }, log);
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

        await Board.createStickyNoteAtBoardCoords({
          content: text,
          x: coords.x,
          y: coords.y,
          frameId: instance.actionItems?.frameId || null
        }, log);
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
        frameId: instance.actionItems?.frameId || null
      }, log);

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
      const stickyId = Catalog.resolveStickyId(action.stickyId, state.aliasState);
      if (!stickyId) return;

      // occupied vorher entfernen (damit nachfolgende creates wieder Slots nutzen können)
      removeFromAllOccupied(stickyId);

      await Board.removeItemById(stickyId, log);
    }
  };

  log("Wende " + actions.length + " Action(s) an (Instanz " + instanceId + ").");
  await OpenAI.dispatchActions(actions, handlers, log);
}

// --------------------------------------------------------------------
// Agent Modus B (selektierte Canvas-Instanzen)
// --------------------------------------------------------------------
function buildBoardCatalogForSelectedInstances(selectedInstanceIds) {
  const selectedSet = new Set((selectedInstanceIds || []).filter((id) => state.instancesById.has(id)));
  const baseCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "generic",
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  return {
    instances: (baseCatalog.instances || []).map((entry) => ({
      ...entry,
      isActive: selectedSet.has(entry.instanceId)
    }))
  };
}

function getPromptConfigForSelectedInstances(selectedInstanceIds) {
  const firstId = Array.isArray(selectedInstanceIds) && selectedInstanceIds.length ? selectedInstanceIds[0] : null;
  const firstInst = firstId ? state.instancesById.get(firstId) : null;
  return DT_PROMPT_CATALOG[firstInst?.canvasTypeId] || DT_PROMPT_CATALOG[TEMPLATE_ID];
}

async function runAgentForCurrentSelection() {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();
  await refreshBoardState();

  const selection = await Board.getSelection(log);
  const selectedInstanceIds = await refreshSelectionStatusFromItems(selection || []);

  if (!selectedInstanceIds.length) {
    log("Instanz-Agent: Keine Canvas selektiert. Bitte wähle mindestens eine Canvas oder ein Item innerhalb einer Canvas aus.");
    return;
  }

  await runAgentForSelectedInstances(selectedInstanceIds, {
    userText: getCurrentUserQuestion()
  });
}

async function runAgentForInstance(instanceId, options = {}) {
  return await runAgentForSelectedInstances([instanceId], options);
}

async function runAgentForSelectedInstances(selectedInstanceIds, options = {}) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();

  const normalizedSelectedIds = Array.from(new Set((selectedInstanceIds || []).filter((id) => state.instancesById.has(id))));
  if (!normalizedSelectedIds.length) {
    log("Instanz-Agent: Keine gültigen Ziel-Instanzen übergeben.");
    return;
  }

  const apiKey = getApiKey();
  const model = getModel();
  const userText = options.userText || getCurrentUserQuestion();

  if (!apiKey) { log("Bitte OpenAI API Key eingeben (Agent)."); return; }

  const promptCfg = getPromptConfigForSelectedInstances(normalizedSelectedIds);
  const systemPrompt = promptCfg.system;

  log(
    "Starte Agent (Modus B) für selektierte Instanzen: " +
    normalizedSelectedIds.join(", ") +
    " ..."
  );

  const { liveCatalog } = await refreshBoardState();
  const stateById = await computeInstanceStatesById(liveCatalog);

  const activeCanvasStates = Object.create(null);
  const activeInstanceChangesSinceLastAgent = Object.create(null);

  for (const id of normalizedSelectedIds) {
    const st = stateById[id];
    if (!st?.classification) continue;

    const payload = Catalog.buildPromptPayloadFromClassification(st.classification, {
      useAliases: true,
      aliasState: state.aliasState,
      log
    });
    if (payload) activeCanvasStates[id] = payload;

    if (!state.hasGlobalBaseline || !st?.diff) {
      activeInstanceChangesSinceLastAgent[id] = null;
    } else {
      activeInstanceChangesSinceLastAgent[id] = Catalog.aliasDiffForActiveInstance(st.diff, state.aliasState);
    }
  }

  const resolvedActiveIds = Object.keys(activeCanvasStates);
  if (!resolvedActiveIds.length) {
    log("Instanz-Agent: Konnte für die selektierten Canvas keine Zustandsdaten aufbauen.");
    return;
  }

  const singleId = resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null;
  const boardCatalog = buildBoardCatalogForSelectedInstances(resolvedActiveIds);

  const userPayload = {
    userQuestion: userText,
    activeInstanceId: singleId,
    selectedInstanceIds: resolvedActiveIds,
    boardCatalog,
    activeCanvasState: singleId ? activeCanvasStates[singleId] : null,
    activeCanvasStates,
    activeInstanceChangesSinceLastAgent,
    hint: "boardCatalog = Kurzüberblick über alle Canvas, activeCanvasStates = Detaildaten nur für die selektierten Instanzen. Wenn mehrere Instanzen selektiert sind, muss jede mutierende Action eine instanceId enthalten."
  };

  try {
    log("Sende Agent-Request an OpenAI (Modus B) ...");
    const answer = await OpenAI.callOpenAIResponses({
      apiKey,
      model,
      systemPrompt,
      userText: JSON.stringify(userPayload, null, 2),
      maxOutputTokens: 4000
    });

    if (!answer) {
      log("Agent: Keine Antwort (output_text) gefunden.");
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

    const actionResult = Array.isArray(agentObj.actions) && agentObj.actions.length
      ? await applyResolvedAgentActions(agentObj.actions, {
          candidateInstanceIds: resolvedActiveIds,
          triggerInstanceId: singleId,
          sourceLabel: "Instanz-Agent"
        })
      : { appliedCount: 0, skippedCount: 0, infoCount: 0, targetedInstanceCount: 0 };

    if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
      log(
        "Instanz-Agent: Action-Run abgeschlossen. " +
        "Mutationen=" + actionResult.appliedCount +
        ", Hinweise=" + actionResult.infoCount +
        ", übersprungen=" + actionResult.skippedCount +
        ", Ziel-Instanzen=" + actionResult.targetedInstanceCount + "."
      );
    } else {
      log("Agent lieferte keine Actions.");
    }

    await refreshBoardState();

    const nowIso = new Date().toISOString();
    for (const id of resolvedActiveIds) {
      const inst = state.instancesById.get(id);
      if (!inst) continue;
      inst.lastAgentRunAt = nowIso;
      inst.lastChangedAt = nowIso;
    }

  } catch (e) {
    log("Exception beim Agent-Run: " + e.message);
  }
}

function pickFirstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function canonicalizeAgentActionType(rawType) {
  if (typeof rawType !== "string") return null;

  const snake = rawType
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_")
    .toLowerCase();

  const compact = snake.replace(/_/g, "");

  const typeMap = {
    movesticky: "move_sticky",
    movestickynote: "move_sticky",
    movenote: "move_sticky",
    createsticky: "create_sticky",
    createstickynote: "create_sticky",
    createnote: "create_sticky",
    addsticky: "create_sticky",
    addstickynote: "create_sticky",
    addnote: "create_sticky",
    deletesticky: "delete_sticky",
    deletestickynote: "delete_sticky",
    deletenote: "delete_sticky",
    removesticky: "delete_sticky",
    removestickynote: "delete_sticky",
    removenote: "delete_sticky",
    inform: "inform",
    message: "inform",
    note: "inform",
    log: "inform"
  };

  return typeMap[compact] || null;
}

function normalizeAgentAction(rawAction) {
  if (!rawAction || typeof rawAction !== "object") return null;

  const type = canonicalizeAgentActionType(
    rawAction.type || rawAction.action || rawAction.kind || rawAction.operation
  );
  if (!type) return null;

  const normalized = {
    type,
    instanceId: pickFirstNonEmptyString(
      rawAction.instanceId,
      rawAction.targetInstanceId,
      rawAction.canvasInstanceId,
      rawAction.instance,
      rawAction.targetCanvasInstanceId
    ),
    stickyId: pickFirstNonEmptyString(
      rawAction.stickyId,
      rawAction.noteId,
      rawAction.stickyAlias,
      rawAction.sticky?.id
    ),
    area: pickFirstNonEmptyString(
      rawAction.area,
      rawAction.targetArea,
      rawAction.target_area,
      rawAction.destinationArea
    ),
    targetArea: pickFirstNonEmptyString(
      rawAction.targetArea,
      rawAction.target_area,
      rawAction.area,
      rawAction.destinationArea
    ),
    text: pickFirstNonEmptyString(
      rawAction.text,
      rawAction.content,
      rawAction.note,
      rawAction.stickyText
    ),
    message: pickFirstNonEmptyString(
      rawAction.message,
      rawAction.text,
      rawAction.content,
      rawAction.note
    )
  };

  if (isFiniteNumber(rawAction.targetPx)) normalized.targetPx = rawAction.targetPx;
  if (isFiniteNumber(rawAction.targetPy)) normalized.targetPy = rawAction.targetPy;

  return normalized;
}

function resolveActionInstanceId(action, { candidateInstanceIds = null, triggerInstanceId = null, sourceLabel = "Agent" } = {}) {
  const candidateIds = Array.from(new Set((candidateInstanceIds || []).filter((id) => state.instancesById.has(id))));

  const explicitInstanceId =
    (action?.instanceId && state.instancesById.has(action.instanceId))
      ? action.instanceId
      : null;

  const resolvedStickyId = action?.stickyId
    ? Catalog.resolveStickyId(action.stickyId, state.aliasState)
    : null;

  const ownerInstanceId = resolvedStickyId
    ? (state.stickyOwnerCache?.get(resolvedStickyId) || null)
    : null;

  if (ownerInstanceId && explicitInstanceId && explicitInstanceId !== ownerInstanceId) {
    log(
      "WARNUNG: " + sourceLabel + "-Action referenziert Sticky " + action.stickyId +
      " mit Instanz " + explicitInstanceId +
      ", gehört aber zu " + ownerInstanceId + ". Verwende Eigentümer-Instanz."
    );
  }

  const preferredInstanceId = ownerInstanceId || explicitInstanceId || null;
  if (preferredInstanceId) {
    if (candidateIds.length > 0 && !candidateIds.includes(preferredInstanceId)) {
      log(sourceLabel + ": Abgeleitete Ziel-Instanz " + preferredInstanceId + " liegt außerhalb des erlaubten Zielsets – Action übersprungen.");
      return null;
    }
    return preferredInstanceId;
  }

  if (candidateIds.length === 1) {
    return candidateIds[0];
  }

  if (triggerInstanceId && candidateIds.includes(triggerInstanceId)) {
    return triggerInstanceId;
  }

  return null;
}

async function applyResolvedAgentActions(actions, { candidateInstanceIds, triggerInstanceId = null, sourceLabel = "Agent" }) {
  if (!Array.isArray(actions) || actions.length === 0) {
    log(sourceLabel + ": Keine Actions geliefert.");
    return { appliedCount: 0, skippedCount: 0, infoCount: 0, targetedInstanceCount: 0 };
  }

  const grouped = new Map();
  let appliedCount = 0;
  let skippedCount = 0;
  let infoCount = 0;

  for (const rawAction of actions) {
    const action = normalizeAgentAction(rawAction);

    if (!action) {
      skippedCount++;
      log(sourceLabel + ": Unbekanntes oder nicht unterstütztes Action-Schema – übersprungen.");
      log(rawAction);
      continue;
    }

    if (action.type === "inform") {
      infoCount++;
      log(sourceLabel + " info:");
      log(action.message || "(keine Nachricht)");
      continue;
    }

    if ((action.type === "move_sticky" || action.type === "delete_sticky") && !action.stickyId) {
      skippedCount++;
      log(sourceLabel + ": Action ohne stickyId – übersprungen.");
      log(rawAction);
      continue;
    }

    if (action.type === "create_sticky" && !action.text) {
      skippedCount++;
      log(sourceLabel + ": create_sticky ohne text – übersprungen.");
      log(rawAction);
      continue;
    }

    const targetInstanceId = resolveActionInstanceId(action, {
      candidateInstanceIds,
      triggerInstanceId,
      sourceLabel
    });

    if (!targetInstanceId) {
      skippedCount++;
      log(sourceLabel + ": Keine Ziel-Instanz für Action ableitbar – übersprungen.");
      log(rawAction);
      continue;
    }

    if (!grouped.has(targetInstanceId)) grouped.set(targetInstanceId, []);
    grouped.get(targetInstanceId).push({ ...action, instanceId: targetInstanceId });
    appliedCount++;
  }

  for (const [instanceId, instanceActions] of grouped.entries()) {
    log(sourceLabel + ": Wende " + instanceActions.length + " Action(s) auf Instanz " + instanceId + " an.");
    await applyAgentActionsToInstance(instanceId, instanceActions);
  }

  return {
    appliedCount,
    skippedCount,
    infoCount,
    targetedInstanceCount: grouped.size
  };
}

// --------------------------------------------------------------------
// Global Agent Modus A
// --------------------------------------------------------------------
async function runGlobalAgent(triggerInstanceId, userText) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();

  const apiKey = getApiKey();
  const model = getModel();

  const finalUserText = (userText || "").trim()
    ? userText.trim()
    : "Bitte gib mir einen globalen Überblick über alle relevanten Canvas-Instanzen und schlage sinnvolle nächste Schritte vor.";

  if (!apiKey) { log("Bitte OpenAI API Key eingeben (Global Agent)."); return; }

  log("Starte globalen Agenten-Run (Modus A), Trigger: " + (triggerInstanceId || "(keine)"));

  const { liveCatalog } = await refreshBoardState();
  const stateById = await computeInstanceStatesById(liveCatalog);

  const boardCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "global",
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  const activeInstanceIds = boardCatalog.instances
    .filter((e) => e.isActive)
    .map((e) => e.instanceId);

  const activeCanvasStates = Object.create(null);
  const activeInstanceChangesSinceLastAgent = Object.create(null);

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
    if (!st?.diff || !state.hasGlobalBaseline) {
      activeInstanceChangesSinceLastAgent[id] = null;
      continue;
    }
    activeInstanceChangesSinceLastAgent[id] = Catalog.aliasDiffForActiveInstance(st.diff, state.aliasState);
  }

  const userPayload = {
    userQuestion: finalUserText,
    triggerInstanceId: triggerInstanceId || null,
    hasBaseline: state.hasGlobalBaseline,
    boardCatalog,
    activeInstanceIds,
    activeCanvasStates,
    activeInstanceChangesSinceLastAgent,
    hint: "boardCatalog = Übersicht, activeCanvasStates = Detaildaten nur für aktive Instanzen. Jede mutierende Action muss genau eine instanceId enthalten. area/targetArea muss exakt einem vorhandenen Area-Namen der Ziel-Instanz entsprechen."
  };

  try {
    log("Sende globalen Agent-Request an OpenAI (Modus A) ...");
    const answer = await OpenAI.callOpenAIResponses({
      apiKey,
      model,
      systemPrompt: DT_GLOBAL_SYSTEM_PROMPT,
      userText: JSON.stringify(userPayload, null, 2),
      maxOutputTokens: 4000
    });

    if (!answer) {
      log("Global Agent: Keine Antwort (output_text).");
      return;
    }

    const agentObj = OpenAI.parseJsonFromModelOutput(answer);
    if (!agentObj) {
      log("Global Agent: Antwort ist kein valides JSON. Rohantwort:");
      log(answer);
      return;
    }

    log("Global Agent analysis:");
    log(agentObj.analysis || "(keine analysis)");

    const actionResult = Array.isArray(agentObj.actions) && agentObj.actions.length
      ? await applyResolvedAgentActions(agentObj.actions, {
          candidateInstanceIds: activeInstanceIds,
          triggerInstanceId,
          sourceLabel: "Global Agent"
        })
      : { appliedCount: 0, skippedCount: 0, infoCount: 0, targetedInstanceCount: 0 };

    if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
      log(
        "Global Agent: Action-Run abgeschlossen. " +
        "Mutationen=" + actionResult.appliedCount +
        ", Hinweise=" + actionResult.infoCount +
        ", übersprungen=" + actionResult.skippedCount +
        ", Ziel-Instanzen=" + actionResult.targetedInstanceCount + "."
      );
    } else {
      log("Global Agent lieferte keine Actions.");
    }

    // Nach dem Action-Run den aktuellen Ist-Zustand erneut lesen und genau diesen Stand als neue Baseline persistieren.
    const { liveCatalog: refreshedLiveCatalog } = await refreshBoardState();
    const postActionStateById = await computeInstanceStatesById(refreshedLiveCatalog);

    const nowIso = new Date().toISOString();
    const savePromises = [];

    for (const inst of state.instancesById.values()) {
      const st = postActionStateById[inst.instanceId];
      if (st?.signature && inst.imageId) {
        inst.baselineSignature = st.signature;
        inst.baselineSignatureLoaded = true;
        savePromises.push(Board.saveBaselineSignatureForImageId(inst.imageId, st.signature, log));
      }

      inst.lastDiff = null;
      inst.lastAgentRunAt = nowIso;
      inst.lastChangedAt = nowIso;
    }

    state.hasGlobalBaseline = true;
    state.globalBaselineAt = nowIso;

    await Promise.all(savePromises);
    await Board.savePersistedBaselineMeta({ hasGlobalBaseline: true, baselineAt: nowIso }, log);
    log("Global Agent: Baseline aktualisiert (" + nowIso + ").");

  } catch (e) {
    log("Exception beim globalen Agent-Run: " + e.message);
  }
}
