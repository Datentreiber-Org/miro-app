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
  return (el?.value || "gpt-4.1-mini").trim();
}
function getPanelUserText() {
  const el = document.getElementById("user-text");
  return (el?.value || "").trim();
}
function getCurrentUserQuestion() {
  const t = getPanelUserText();
  return t || "Bitte analysiere diese Canvas-Instanz und führe sinnvolle nächste Schritte innerhalb des Workshop-Workflows aus.";
}

// --------------------------------------------------------------------
// Init Panel Buttons
// --------------------------------------------------------------------
function initPanelButtons() {
  document.getElementById("btn-insert-template")?.addEventListener("click", insertTemplateImage);
  document.getElementById("btn-cluster-panel")?.addEventListener("click", clusterSelectionFromPanel);
  document.getElementById("btn-classify-debug")?.addEventListener("click", () => classifyStickies({ silent: false }));
  document.getElementById("btn-openai-classic")?.addEventListener("click", callOpenAIClassic);

  // optional exports for debugging/back-compat
  window.dtInsertTemplateImage = insertTemplateImage;
  window.dtClassifyStickies = (opts) => classifyStickies(opts || {});
  window.dtCallOpenAI = callOpenAIClassic;
  window.dtClusterSelection = clusterSelectionFromPanel;
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
// Selection update (Board Buttons)
// --------------------------------------------------------------------
async function onSelectionUpdate(event) {
  if (state.handlingSelection) return;

  const items = event?.items || [];

  // Sticky selection cache
  const stickyIds = items.filter((it) => it.type === "sticky_note").map((it) => it.id);
  if (stickyIds.length > 0) state.lastStickySelectionIds = stickyIds.slice();

  // Canvas selection cache
  const canvasInstanceIdSet = new Set();
  for (const it of items) {
    if (it.type === "image") {
      const inst = state.instancesByImageId.get(it.id);
      if (inst) canvasInstanceIdSet.add(inst.instanceId);
    }
    if (it.type === "frame") {
      for (const inst of state.instancesById.values()) {
        if (inst.actionItems?.frameId === it.id) canvasInstanceIdSet.add(inst.instanceId);
      }
    }
  }
  if (canvasInstanceIdSet.size > 0) state.lastCanvasSelectionInstanceIds = Array.from(canvasInstanceIdSet);

  // Board buttons are shapes, and we only react to single selection
  if (items.length !== 1) return;
  const item = items[0];
  if (item.type !== "shape") return;

  // Re-scan to ensure rebind after panel restart
  await ensureInstancesScanned(true);

  let instanceId = null;
  let buttonType = null;

  for (const [id, inst] of state.instancesById.entries()) {
    const aiId = inst.actionItems?.aiItemId;
    const clId = inst.actionItems?.clusterItemId;
    const glId = inst.actionItems?.globalAgentItemId;

    if (aiId && aiId === item.id) { instanceId = id; buttonType = "ai"; break; }
    if (clId && clId === item.id) { instanceId = id; buttonType = "cluster"; break; }
    if (glId && glId === item.id) { instanceId = id; buttonType = "global"; break; }
  }

  if (!instanceId || !buttonType) return;

  state.handlingSelection = true;
  try {
    if (buttonType === "ai") {
      log("Agent-Button (Shape, Modus B) für Instanz " + instanceId + " ausgelöst.");
      await runAgentForInstance(instanceId);
    } else if (buttonType === "cluster") {
      if (!state.lastStickySelectionIds?.length) {
        log("Cluster-Button: Keine vorherige Sticky-Auswahl gefunden. Bitte zuerst Stickies auswählen.");
        return;
      }
      log("Cluster-Button (Shape) für Instanz " + instanceId + " ausgelöst.");
      await clusterSelectionWithIds(state.lastStickySelectionIds, instanceId);
    } else if (buttonType === "global") {
      const inst = state.instancesById.get(instanceId);
      const inputId = inst?.actionItems?.globalAgentInputItemId;

      let userText = "";
      if (inputId) {
        const textItem = await Board.getItemById(inputId, log);
        if (textItem?.content) userText = stripHtml(textItem.content).trim();
      }
      if (!userText) {
        userText = "Bitte gib einen globalen Überblick über alle relevanten Canvas-Instanzen und schlage sinnvolle nächste Schritte vor.";
      }

      log("Global-Agent-Button (Shape, Modus A) für Instanz " + instanceId + " ausgelöst.");
      await runGlobalAgent(instanceId, userText);
    }
  } finally {
    state.handlingSelection = false;
  }
}

// --------------------------------------------------------------------
// Board snapshot refresh: ctx + liveCatalog
// --------------------------------------------------------------------
async function refreshBoardState() {
  await ensureInstancesScanned();

  const ctx = await Board.getBoardBaseContext(log);
  const { liveCatalog, stickyOwnerCache } = await Catalog.rebuildLiveCatalog({
    ctx,
    instancesById: state.instancesById,
    clusterAssignments: state.clusterAssignments,
    log
  });

  state.liveCatalog = liveCatalog;
  state.stickyOwnerCache = stickyOwnerCache;

  return { ctx, liveCatalog, stickyOwnerCache };
}

// --------------------------------------------------------------------
// Insert Template Image
// --------------------------------------------------------------------
async function insertTemplateImage() {
  log("Button: Template-Bild einfügen.");
  await Board.ensureMiroReady(log);

  try {
    const image = await Board.createImage({
      url: TEMPLATE_IMAGE_URL,
      x: 0,
      y: 0,
      width: 2000
    }, log);

    await Board.registerInstanceFromImage(image, {
      templateCatalog: DT_TEMPLATE_CATALOG,
      defaultTemplateId: TEMPLATE_ID,
      instancesByImageId: state.instancesByImageId,
      instancesById: state.instancesById,
      nextInstanceId: nextInstanceId,
      hasGlobalBaseline: state.hasGlobalBaseline,
      createActionShapes: true,
      log
    });

    log(
      "Template eingefügt: Bild-ID " + image.id +
      "\nUnterhalb des Canvas findest du Buttons im Frame:\n" +
      "- Send to OpenAI (Modus B)\n" +
      "- Cluster (nutzt vorherige Sticky-Auswahl)\n" +
      "- Global Agent (Modus A, nutzt Text-Input im Frame)"
    );

    await Board.zoomTo(image, log);
  } catch (e) {
    log("Fehler beim Einfügen des Templates: " + e.message);
  }
}

// --------------------------------------------------------------------
// Cluster Selection (Panel + Board Button)
// --------------------------------------------------------------------
async function clusterSelectionFromPanel() {
  log("Button: Auswahl clustern (Side-Panel).");
  await clusterSelectionWithIds(null, null);
}

async function clusterSelectionWithIds(stickyIds, expectedInstanceId) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();

  let stickyNotes = [];
  try {
    if (Array.isArray(stickyIds) && stickyIds.length > 0) {
      const items = await Board.getItemsById(stickyIds, log);
      stickyNotes = items.filter((it) => it.type === "sticky_note");
    } else {
      const selection = await Board.getSelection(log);
      stickyNotes = (selection || []).filter((it) => it.type === "sticky_note");
    }
  } catch (e) {
    log("Fehler beim Lesen der Sticky-Auswahl: " + e.message);
    return;
  }

  if (!stickyNotes.length) {
    log("Keine Sticky Notes in der Auswahl. Bitte Stickies auswählen.");
    return;
  }

  const geomEntries = await Board.buildInstanceGeometryIndex(state.instancesById, log);

  const expectedInstance = expectedInstanceId ? state.instancesById.get(expectedInstanceId) : null;
  const expectedFrameId = expectedInstance?.actionItems?.frameId || null;

  const byInstance = Object.create(null);
  const outside = [];

  const parentGeomCache = new Map();

  for (const s of stickyNotes) {
    let inst = null;

    // Fast path: gleicher Frame wie Button
    if (expectedInstance && expectedFrameId && s.parentId === expectedFrameId) {
      inst = expectedInstance;
    } else {
      const pos = await Board.resolveBoardCoords(s, parentGeomCache, log);
      if (!pos) {
        outside.push(s);
        continue;
      }
      inst = Board.findInstanceByPoint(pos.x, pos.y, geomEntries);
    }

    if (!inst) {
      outside.push(s);
      continue;
    }

    if (!byInstance[inst.instanceId]) byInstance[inst.instanceId] = [];
    byInstance[inst.instanceId].push(s);
  }

  const instanceIds = Object.keys(byInstance);
  if (instanceIds.length === 0) {
    log("Keine der ausgewählten Stickies liegt über einem Canvas.");
    return;
  }
  if (instanceIds.length > 1) {
    log("Auswahl enthält Stickies aus mehreren Instanzen. Bitte nur eine Instanz gleichzeitig clustern.");
    return;
  }

  const instanceId = instanceIds[0];
  if (expectedInstanceId && instanceId !== expectedInstanceId) {
    log("Cluster-Button gehört zu einer anderen Instanz als die Sticky-Auswahl.");
    return;
  }

  const notesInInstance = byInstance[instanceId];

  if (outside.length > 0) {
    log("Hinweis: Es gibt Stickies außerhalb des Canvas – sie werden dennoch dem Cluster zugeordnet.");
  }

  // Clustername: unterstrichener Sticky bevorzugt
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
    const underlined = extractUnderlinedText(headerSticky.content);
    const candidate = (underlined || stripHtml(headerSticky.content)).trim();
    if (!candidate) {
      log("Unterstrichener Sticky-Text ist leer. Bitte einen Namen unterstreichen oder ohne Unterstreichung arbeiten.");
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

  log("Cluster '" + clusterName + "' gesetzt für " + (notesInInstance.length + outside.length) + " Stickies (nur Panel-Session).");
}

// --------------------------------------------------------------------
// Classification Debug
// --------------------------------------------------------------------
async function classifyStickies({ silent = false } = {}) {
  if (!silent) log("Button: Stickies klassifizieren (Debug).");
  await Board.ensureMiroReady(log);

  const { liveCatalog } = await refreshBoardState();
  const classification = Catalog.buildClassificationForAllInstances(state.instancesById, liveCatalog);

  if (!classification) {
    if (!silent) log("Keine Canvas-Instanzen mit Stickies gefunden.");
    return null;
  }

  if (!silent) {
    log("Klassifikation:");
    log(classification);
  }
  return classification;
}

// --------------------------------------------------------------------
// Classic OpenAI Call (Panel)
// --------------------------------------------------------------------
async function callOpenAIClassic() {
  await Board.ensureMiroReady(log);

  const apiKey = getApiKey();
  const model = getModel();
  const userText = getPanelUserText();

  if (!apiKey) { log("Bitte OpenAI API Key eingeben."); return; }
  if (!userText) { log("Bitte eine Frage / Aufgabe im Textfeld eingeben."); return; }

  const classification = await classifyStickies({ silent: true });

  const promptPayload = classification
    ? Catalog.buildPromptPayloadFromClassification(classification, { useAliases: false })
    : null;

  const classificationPart = promptPayload
    ? "\n\nAktuelle Sticky-Notiz-Klassifikation (reduziertes JSON):\n" + JSON.stringify(promptPayload, null, 2)
    : "\n\nHinweis: Keine Klassifikation vorhanden (kein Template oder keine Stickies im Template).";

  const fullUserText = userText + classificationPart;

  const systemPrompt =
    "Du bist ein Assistent, der Miro-Boards analysiert. " +
    "Du bekommst Sticky-Notes als JSON und eine Nutzerfrage und sollst exakte Antworten liefern. " +
    "Antworte standardmäßig auf Deutsch.";

  try {
    log("Sende Anfrage an OpenAI (klassischer Call) ...");
    const answer = await OpenAI.callOpenAIResponses({
      apiKey,
      model,
      systemPrompt,
      userText: fullUserText,
      maxOutputTokens: 10000
    });

    log("Antwort von OpenAI:");
    log(answer || "(keine Antwort gefunden)");
  } catch (e) {
    log("Fehler bei OpenAI-Anfrage: " + e.message);
  }
}

// --------------------------------------------------------------------
// Apply Agent Actions (Modus B)
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
// Agent Modus B
// --------------------------------------------------------------------
async function runAgentForInstance(instanceId, options = {}) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();

  const apiKey = getApiKey();
  const model = getModel();
  const userText = options.userText || getCurrentUserQuestion();

  if (!apiKey) { log("Bitte OpenAI API Key eingeben (Agent)."); return; }

  const instance = state.instancesById.get(instanceId);
  if (!instance) { log("Unbekannte Instanz: " + instanceId); return; }

  const promptCfg = DT_PROMPT_CATALOG[instance.canvasTypeId] || DT_PROMPT_CATALOG[TEMPLATE_ID];
  const systemPrompt = promptCfg.system;

  log("Starte Agent (Modus B) für Instanz " + instanceId + " ...");

  const { liveCatalog } = await refreshBoardState();

  const instState = await Catalog.computeInstanceState(instance, {
    liveCatalog,
    hasGlobalBaseline: state.hasGlobalBaseline,
    loadBaselineSignatureForImageId: Board.loadBaselineSignatureForImageId,
    log
  });

  if (!instState?.classification) {
    log("Konnte Instanzzustand nicht ermitteln.");
    return;
  }

  const boardCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "instance",
    activeInstanceId: instanceId,
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  const activeCanvasState = Catalog.buildPromptPayloadFromClassification(instState.classification, {
    useAliases: true,
    aliasState: state.aliasState,
    log
  });

  const userPayload = {
    userQuestion: userText,
    activeInstanceId: instanceId,
    selectedInstanceIds: [instanceId],
    boardCatalog,
    activeCanvasState,
    activeCanvasStates: { [instanceId]: activeCanvasState },
    activeInstanceChangesSinceLastAgent: null,
    hint: "boardCatalog = Kurzüberblick, activeCanvasState = Detaildaten für diese Instanz."
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

    if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
      await applyAgentActionsToInstance(instanceId, agentObj.actions);
    } else {
      log("Agent lieferte keine Actions.");
    }

    // Refresh + cache update (kein Baseline Update im Modus B)
    await refreshBoardState();
    await Catalog.computeInstanceState(instance, {
      liveCatalog: state.liveCatalog,
      hasGlobalBaseline: state.hasGlobalBaseline,
      loadBaselineSignatureForImageId: Board.loadBaselineSignatureForImageId,
      log
    });

    const nowIso = new Date().toISOString();
    instance.lastAgentRunAt = nowIso;
    instance.lastChangedAt = nowIso;
  } catch (e) {
    log("Exception beim Agent-Run: " + e.message);
  }
}

// --------------------------------------------------------------------
// Agent Modus A (Global)
// --------------------------------------------------------------------
async function runGlobalAgent(triggerInstanceId, userText) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();

  const apiKey = getApiKey();
  const model = getModel();

  const finalUserText = (userText || "").trim()
    ? userText.trim()
    : "Bitte gib mir einen globalen Überblick über alle relevanten Canvas-Instanzen und schlage sinnvolle nächste Schritte vor.";

  if (!apiKey) {
    log("Bitte OpenAI API Key eingeben (Global Agent).");
    return;
  }

  log("Starte globalen Agenten-Run (Modus A), ausgelöst von Instanz " + (triggerInstanceId || "(keine)") + ".");

  const { liveCatalog } = await refreshBoardState();

  const stateById = Object.create(null);

  // Compute state for all instances (populates lastDiff used by boardCatalog)
  for (const inst of state.instancesById.values()) {
    const st = await Catalog.computeInstanceState(inst, {
      liveCatalog,
      hasGlobalBaseline: state.hasGlobalBaseline,
      loadBaselineSignatureForImageId: Board.loadBaselineSignatureForImageId,
      log
    });
    if (st) stateById[inst.instanceId] = st;
  }

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
    activeCanvasStates[id] = Catalog.buildPromptPayloadFromClassification(st.classification, {
      useAliases: true,
      aliasState: state.aliasState,
      log
    });
  }

  for (const id of activeInstanceIds) {
    const st = stateById[id];
    if (!state.hasGlobalBaseline) {
      activeInstanceChangesSinceLastAgent[id] = null;
    } else {
      activeInstanceChangesSinceLastAgent[id] = st?.diff
        ? Catalog.aliasDiffForActiveInstance(st.diff, state.aliasState)
        : null;
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
    hint: "boardCatalog = Übersicht, activeCanvasStates = Detaildaten nur für aktive Instanzen."
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
      log("Global Agent: Keine Antwort (output_text) gefunden.");
      return;
    }

    const agentObj = OpenAI.parseJsonFromModelOutput(answer);
    if (!agentObj) {
      log("Global Agent: Antwort ist kein valides JSON. Rohantwort:");
      log(answer);
      return;
    }

    log("Globale Agent-Analyse (analysis):");
    log(agentObj.analysis || "(keine analysis)");

    if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
      log("Globale Agent-Actions (werden nur geloggt, nicht automatisch angewendet):");
      log(agentObj.actions);
    } else {
      log("Global Agent lieferte keine Actions.");
    }

    // Baseline persistieren (Snapshot über alle Instanzen)
    const nowIso = new Date().toISOString();
    const savePromises = [];

    for (const inst of state.instancesById.values()) {
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
    }

    state.hasGlobalBaseline = true;
    state.globalBaselineAt = nowIso;

    await Promise.all(savePromises);
    await Board.savePersistedBaselineMeta({ hasGlobalBaseline: true, baselineAt: nowIso }, log);

    log("Global Baseline aktualisiert: " + nowIso);
  } catch (e) {
    log("Exception beim globalen Agent-Run: " + e.message);
  }
}
