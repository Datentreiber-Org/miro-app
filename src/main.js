import {
  TEMPLATE_ID,
  DT_TEMPLATE_CATALOG,
  DT_CANVAS_DEFS,
  DT_PROMPT_CATALOG,
  DT_GLOBAL_SYSTEM_PROMPT,
  DT_MEMORY_RECENT_LOG_LIMIT,
  STICKY_LAYOUT
} from "./config.js?v=20260301-step9";

import { createLogger, stripHtml, extractUnderlinedText, isFiniteNumber } from "./utils.js?v=20260301-step9";

import * as Board from "./miro/board.js?v=20260301-step9";
import * as Catalog from "./domain/catalog.js?v=20260301-step9";
import * as OpenAI from "./ai/openai.js?v=20260301-step9";
import * as Memory from "./runtime/memory.js?v=20260301-step9";
import * as Exercises from "./exercises/registry.js?v=20260301-step9";
import * as PromptComposer from "./prompt/composer.js?v=20260301-step9";

// --------------------------------------------------------------------
// State (Controller-Level)
// --------------------------------------------------------------------
const state = {
  initialized: false,

  // Baseline (global)
  hasGlobalBaseline: false,
  globalBaselineAt: null,

  // Instances
  instancesByImageId: new Map(),
  instancesById: new Map(),
  instancesByLabel: new Map(),

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

  // Memory v1
  memoryState: Memory.createEmptyMemoryState(),
  memoryLog: [],

  // Exercise / Board context
  boardConfig: Board.normalizeBoardConfig(null, { defaultCanvasTypeId: TEMPLATE_ID }),
  exerciseRuntime: Board.normalizeExerciseRuntime(null),

  // UI state
  selectedCanvasTypeId: TEMPLATE_ID,
  panelMode: "admin",

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
const panelModeEl = document.getElementById("panel-mode");
const panelModeStatusEl = document.getElementById("panel-mode-status");
const selectionStatusEl = document.getElementById("selection-status");
const canvasTypePickerEl = document.getElementById("canvas-type-picker");
const exercisePackEl = document.getElementById("exercise-pack");
const exerciseStepEl = document.getElementById("exercise-step");
const exerciseContextStatusEl = document.getElementById("exercise-context-status");
const exerciseStepInstructionEl = document.getElementById("exercise-step-instruction");
const userActionsPanelEl = document.getElementById("user-actions-panel");
const adminPanelEl = document.getElementById("admin-panel");
const adminOverrideTextEl = document.getElementById("admin-override-text");
const exerciseActionHelpEl = document.getElementById("exercise-action-help");
const btnExerciseCheckEl = document.getElementById("btn-exercise-check");
const btnExerciseHintEl = document.getElementById("btn-exercise-hint");
const btnExerciseAutocorrectEl = document.getElementById("btn-exercise-autocorrect");
const btnExerciseNextStepEl = document.getElementById("btn-exercise-next-step");
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
const PANEL_MODE_STORAGE_KEY = "dt-panel-mode-v1";

function normalizePanelMode(value) {
  return value === "user" ? "user" : "admin";
}

function loadPersistedPanelMode() {
  try {
    return normalizePanelMode(window.localStorage?.getItem(PANEL_MODE_STORAGE_KEY) || "admin");
  } catch (_) {
    return "admin";
  }
}

function persistPanelMode(mode) {
  try {
    window.localStorage?.setItem(PANEL_MODE_STORAGE_KEY, normalizePanelMode(mode));
  } catch (_) {}
}

function setPanelMode(mode, { persist = true } = {}) {
  state.panelMode = normalizePanelMode(mode);
  if (persist) persistPanelMode(state.panelMode);
  renderPanelMode();
}

function setElementHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle("hidden", !!hidden);
}

function renderPanelMode() {
  const mode = normalizePanelMode(state.panelMode);

  if (panelModeEl && panelModeEl.value !== mode) {
    panelModeEl.value = mode;
  }

  setElementHidden(adminPanelEl, mode !== "admin");
  setElementHidden(userActionsPanelEl, false);

  if (panelModeStatusEl) {
    panelModeStatusEl.textContent = mode === "admin"
      ? "Admin-Modus aktiv. Alle Konfigurations- und Diagnosefunktionen sind sichtbar."
      : "User-Modus aktiv. Die Übungsaktionen bleiben sichtbar, Admin-Steuerung ist ausgeblendet.";
  }
}

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

function getSelectedExercisePackId() {
  return Exercises.normalizeExercisePackId(state.boardConfig?.exercisePackId);
}

function getSelectedExercisePack() {
  return Exercises.getExercisePackById(getSelectedExercisePackId());
}

function getCurrentBoardMode() {
  return state.boardConfig?.boardMode === "exercise" ? "exercise" : "generic";
}

function getAllowedCanvasTypeIdsForCurrentPack() {
  return Exercises.getAllowedCanvasTypesForPack(getSelectedExercisePack());
}

function getCurrentExerciseStepId(pack = getSelectedExercisePack()) {
  if (!pack) return null;

  const runtimeStepId = state.exerciseRuntime?.currentStepId || null;
  if (runtimeStepId && Exercises.getExerciseStep(pack, runtimeStepId)) {
    return runtimeStepId;
  }

  return Exercises.getDefaultStepId(pack);
}

function getCurrentExerciseStep(pack = getSelectedExercisePack()) {
  const stepId = getCurrentExerciseStepId(pack);
  return pack && stepId ? Exercises.getExerciseStep(pack, stepId) : null;
}

function getCurrentUserQuestion() {
  const text = getPanelUserText();
  if (text) return text;

  const currentStep = getCurrentExerciseStep();
  const visibleInstruction = (typeof currentStep?.visibleInstruction === "string")
    ? currentStep.visibleInstruction.trim()
    : "";

  return visibleInstruction || "Bitte analysiere die relevanten Canvas-Instanzen und führe sinnvolle nächste Schritte innerhalb des Workshop-Workflows aus.";
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
  const allowedCanvasTypeIds = getAllowedCanvasTypeIdsForCurrentPack();

  if (typeof canvasTypeId === "string" && canvasTypeId && DT_TEMPLATE_CATALOG[canvasTypeId]) {
    if (!allowedCanvasTypeIds.length || allowedCanvasTypeIds.includes(canvasTypeId)) {
      return canvasTypeId;
    }
  }

  if (allowedCanvasTypeIds.length) {
    const firstAllowed = allowedCanvasTypeIds.find((id) => !!DT_TEMPLATE_CATALOG[id]);
    if (firstAllowed) return firstAllowed;
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

async function persistBoardConfig(partialConfig = {}) {
  const fallbackCanvasTypeId = normalizeCanvasTypeId(partialConfig.defaultCanvasTypeId || state.boardConfig?.defaultCanvasTypeId || state.selectedCanvasTypeId || TEMPLATE_ID);
  const merged = Board.normalizeBoardConfig({
    ...(state.boardConfig || {}),
    ...(partialConfig || {}),
    defaultCanvasTypeId: fallbackCanvasTypeId
  }, { defaultCanvasTypeId: fallbackCanvasTypeId });

  state.boardConfig = await Board.saveBoardConfigToAnchor(merged, {
    defaultCanvasTypeId: fallbackCanvasTypeId,
    log
  });

  setSelectedCanvasTypeId(state.boardConfig.defaultCanvasTypeId || fallbackCanvasTypeId);
  return state.boardConfig;
}

async function persistExerciseRuntime(partialRuntime = {}) {
  const merged = Board.normalizeExerciseRuntime({
    ...(state.exerciseRuntime || {}),
    ...(partialRuntime || {})
  });

  state.exerciseRuntime = await Board.saveExerciseRuntime(merged, log);
  return state.exerciseRuntime;
}

function renderExercisePackPicker() {
  if (!exercisePackEl) return;

  const selectedPackId = getSelectedExercisePackId() || "";
  const packs = Exercises.listExercisePacks();

  exercisePackEl.textContent = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Kein Exercise Pack (generischer Modus)";
  emptyOption.selected = !selectedPackId;
  exercisePackEl.appendChild(emptyOption);

  for (const pack of packs) {
    const option = document.createElement("option");
    option.value = pack.id;
    option.textContent = pack.label;
    option.selected = pack.id === selectedPackId;
    exercisePackEl.appendChild(option);
  }
}

function renderExerciseStepPicker() {
  if (!exerciseStepEl) return;

  const pack = getSelectedExercisePack();
  const currentStepId = getCurrentExerciseStepId(pack);

  exerciseStepEl.textContent = "";

  if (!pack) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Kein Exercise Pack aktiv";
    option.selected = true;
    exerciseStepEl.appendChild(option);
    exerciseStepEl.disabled = true;
    return;
  }

  const steps = Exercises.listExerciseSteps(pack);
  for (const step of steps) {
    const option = document.createElement("option");
    option.value = step.id;
    option.textContent = step.label;
    option.selected = step.id === currentStepId;
    exerciseStepEl.appendChild(option);
  }

  exerciseStepEl.disabled = steps.length === 0;
}

function renderExerciseContextStatus() {
  const pack = getSelectedExercisePack();
  const currentStep = getCurrentExerciseStep(pack);
  const selectedCanvasType = getCanvasTypeEntry(getSelectedCanvasTypeId());

  if (exerciseContextStatusEl) {
    const lines = [
      "Board-Modus: " + getCurrentBoardMode(),
      "Exercise Pack: " + (pack ? pack.label : "keins (generischer Agentenmodus)"),
      "Aktueller Schritt: " + (currentStep?.label || "kein Schritt aktiv"),
      "Standard-Canvas-Typ: " + (selectedCanvasType?.displayName || getSelectedCanvasTypeId())
    ];
    exerciseContextStatusEl.textContent = lines.join("\n");
  }

  if (exerciseStepInstructionEl) {
    exerciseStepInstructionEl.textContent = currentStep?.visibleInstruction || "Kein sichtbarer Übungsschritt aktiv. Der Agent läuft im generischen Modus.";
  }
}

function renderAdminOverrideEditor() {
  if (!adminOverrideTextEl) return;
  const nextText = state.exerciseRuntime?.adminOverrideText || "";
  if (document.activeElement !== adminOverrideTextEl) {
    adminOverrideTextEl.value = nextText;
  }
}

function renderExerciseActionButtons() {
  const pack = getSelectedExercisePack();
  const currentStep = getCurrentExerciseStep(pack);
  const nextStep = Exercises.getNextExerciseStep(pack, currentStep?.id || null);
  const hasExerciseContext = !!pack && !!currentStep;

  if (btnExerciseCheckEl) btnExerciseCheckEl.disabled = !hasExerciseContext;
  if (btnExerciseHintEl) btnExerciseHintEl.disabled = !hasExerciseContext;
  if (btnExerciseAutocorrectEl) btnExerciseAutocorrectEl.disabled = !hasExerciseContext;
  if (btnExerciseNextStepEl) btnExerciseNextStepEl.disabled = !nextStep;

  if (exerciseActionHelpEl) {
    if (!pack) {
      exerciseActionHelpEl.textContent = "Kein Exercise Pack aktiv. Bitte im Admin-Modus zuerst ein Exercise Pack auswählen.";
    } else if (!currentStep) {
      exerciseActionHelpEl.textContent = "Kein aktiver Schritt gesetzt. Bitte im Admin-Modus einen gültigen Schritt auswählen.";
    } else if (nextStep) {
      exerciseActionHelpEl.textContent = "Die Übungsaktionen arbeiten auf den aktuell selektierten Canvas-Instanzen. Ohne Selektion erscheint ein Warnhinweis im Log. Der nächste Schritt wäre: " + (nextStep.label || nextStep.id) + ".";
    } else {
      exerciseActionHelpEl.textContent = "Die Übungsaktionen arbeiten auf den aktuell selektierten Canvas-Instanzen. Ohne Selektion erscheint ein Warnhinweis im Log. Der aktuelle Schritt ist bereits der letzte Schritt dieses Exercise Packs.";
    }
  }
}

function renderExerciseControls() {
  renderExercisePackPicker();
  renderExerciseStepPicker();
  renderExerciseContextStatus();
  renderAdminOverrideEditor();
  renderExerciseActionButtons();
  renderPanelMode();
}

async function syncDefaultCanvasTypeToBoardConfig(canvasTypeId) {
  const normalizedCanvasTypeId = normalizeCanvasTypeId(canvasTypeId);
  setSelectedCanvasTypeId(normalizedCanvasTypeId);
  await persistBoardConfig({ defaultCanvasTypeId: normalizedCanvasTypeId });
  renderCanvasTypePicker();
  renderExerciseControls();
}

async function loadBoardExerciseState() {
  const fallbackCanvasTypeId = normalizeCanvasTypeId(state.selectedCanvasTypeId || TEMPLATE_ID);
  let loadedBoardConfig = await Board.loadBoardConfigFromAnchor({
    defaultCanvasTypeId: fallbackCanvasTypeId,
    log
  });

  let normalizedBoardConfig = Board.normalizeBoardConfig(loadedBoardConfig, {
    defaultCanvasTypeId: fallbackCanvasTypeId
  });

  const normalizedPackId = Exercises.normalizeExercisePackId(normalizedBoardConfig.exercisePackId);
  normalizedBoardConfig = {
    ...normalizedBoardConfig,
    boardMode: normalizedPackId ? "exercise" : "generic",
    exercisePackId: normalizedPackId || null
  };

  const pack = normalizedPackId ? Exercises.getExercisePackById(normalizedPackId) : null;
  const allowedCanvasTypeIds = Exercises.getAllowedCanvasTypesForPack(pack);
  let defaultCanvasTypeId = normalizeCanvasTypeId(normalizedBoardConfig.defaultCanvasTypeId || fallbackCanvasTypeId);

  if (allowedCanvasTypeIds.length && !allowedCanvasTypeIds.includes(defaultCanvasTypeId)) {
    defaultCanvasTypeId = normalizeCanvasTypeId(
      Exercises.getDefaultCanvasTypeIdForPack(pack) || allowedCanvasTypeIds[0]
    );
  }

  normalizedBoardConfig.defaultCanvasTypeId = defaultCanvasTypeId;
  state.boardConfig = await Board.saveBoardConfigToAnchor(normalizedBoardConfig, {
    defaultCanvasTypeId,
    log
  });
  setSelectedCanvasTypeId(defaultCanvasTypeId);

  state.exerciseRuntime = Board.normalizeExerciseRuntime(await Board.loadExerciseRuntime(log));

  const currentPack = getSelectedExercisePack();
  const nextStepId = currentPack ? getCurrentExerciseStepId(currentPack) : null;
  if (state.exerciseRuntime.currentStepId !== nextStepId) {
    state.exerciseRuntime = await Board.saveExerciseRuntime({
      ...state.exerciseRuntime,
      currentStepId: nextStepId
    }, log);
  }

  renderCanvasTypePicker();
  renderExerciseControls();
}

async function onExercisePackChange() {
  const selectedPackId = Exercises.normalizeExercisePackId(exercisePackEl?.value);
  const selectedPack = Exercises.getExercisePackById(selectedPackId);
  const allowedCanvasTypeIds = Exercises.getAllowedCanvasTypesForPack(selectedPack);

  let defaultCanvasTypeId = getSelectedCanvasTypeId();
  if (selectedPack) {
    defaultCanvasTypeId = normalizeCanvasTypeId(
      Exercises.getDefaultCanvasTypeIdForPack(selectedPack) || defaultCanvasTypeId
    );
  }
  if (allowedCanvasTypeIds.length && !allowedCanvasTypeIds.includes(defaultCanvasTypeId)) {
    defaultCanvasTypeId = normalizeCanvasTypeId(allowedCanvasTypeIds[0]);
  }

  setSelectedCanvasTypeId(defaultCanvasTypeId);

  await persistBoardConfig({
    boardMode: selectedPack ? "exercise" : "generic",
    exercisePackId: selectedPack?.id || null,
    defaultCanvasTypeId
  });

  const nextStepId = selectedPack
    ? (Exercises.getExerciseStep(selectedPack, state.exerciseRuntime?.currentStepId)?.id || Exercises.getDefaultStepId(selectedPack))
    : null;

  await persistExerciseRuntime({
    currentStepId: nextStepId
  });

  renderCanvasTypePicker();
  renderExerciseControls();

  log("Exercise Pack gesetzt: " + (selectedPack ? selectedPack.label : "keins (generischer Modus)"));
}

async function onExerciseStepChange() {
  const pack = getSelectedExercisePack();
  if (!pack) {
    await persistExerciseRuntime({ currentStepId: null });
    renderExerciseControls();
    return;
  }

  const requestedStepId = exerciseStepEl?.value || null;
  const validStepId = Exercises.getExerciseStep(pack, requestedStepId)?.id || Exercises.getDefaultStepId(pack);

  await persistExerciseRuntime({ currentStepId: validStepId });
  renderExerciseControls();

  const step = Exercises.getExerciseStep(pack, validStepId);
  log("Exercise-Schritt gesetzt: " + (step?.label || validStepId || "(leer)"));
}

function getExerciseRunModeForTrigger(trigger) {
  switch (trigger) {
    case "check": return "exercise-check";
    case "hint": return "exercise-hint";
    case "autocorrect": return "exercise-autocorrect";
    default: return "exercise";
  }
}

function getExerciseSourceLabel(trigger) {
  switch (trigger) {
    case "check": return "Exercise-Check";
    case "hint": return "Exercise-Hinweis";
    case "autocorrect": return "Exercise-Autokorrektur";
    default: return "Exercise-Agent";
  }
}

async function onPanelModeChange() {
  setPanelMode(panelModeEl?.value || "admin");
}

async function saveAdminOverrideFromUi() {
  const text = (adminOverrideTextEl?.value || "").trim() || null;
  await persistExerciseRuntime({ adminOverrideText: text });
  renderExerciseControls();
  log("Admin-Override gespeichert: " + (text ? ("" + text.length + " Zeichen") : "leer"));
}

async function clearAdminOverrideFromUi() {
  if (adminOverrideTextEl) adminOverrideTextEl.value = "";
  await persistExerciseRuntime({ adminOverrideText: null });
  renderExerciseControls();
  log("Admin-Override geleert.");
}

async function runExerciseTrigger(trigger) {
  const pack = getSelectedExercisePack();
  const currentStep = getCurrentExerciseStep(pack);

  if (!pack) {
    log("Exercise-Modus: Kein Exercise Pack aktiv. Bitte im Admin-Modus zuerst ein Exercise Pack auswählen.");
    return;
  }

  if (!currentStep) {
    log("Exercise-Modus: Kein aktiver Schritt vorhanden. Bitte im Admin-Modus einen gültigen Schritt setzen.");
    return;
  }

  const selectedInstanceIds = await refreshSelectionStatusFromBoard();
  if (!selectedInstanceIds.length) {
    log(getExerciseSourceLabel(trigger) + ": Keine Canvas selektiert. Wähle mindestens eine Canvas oder ein Item innerhalb einer Canvas aus.");
    return;
  }

  const allowedCanvasTypes = new Set(Exercises.getAllowedCanvasTypesForPack(pack));
  const filteredInstanceIds = selectedInstanceIds.filter((instanceId) => {
    const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
    return !allowedCanvasTypes.size || (canvasTypeId && allowedCanvasTypes.has(canvasTypeId));
  });

  if (!filteredInstanceIds.length) {
    log(getExerciseSourceLabel(trigger) + ": Die aktuelle Selektion enthält keine Canvas, die für dieses Exercise Pack freigegeben sind.");
    return;
  }

  await runAgentForSelectedInstances(filteredInstanceIds, {
    userText: getCurrentUserQuestion(),
    runMode: getExerciseRunModeForTrigger(trigger),
    trigger,
    sourceLabel: getExerciseSourceLabel(trigger)
  });
}

async function runExerciseCheck() {
  return await runExerciseTrigger("check");
}

async function runExerciseHint() {
  return await runExerciseTrigger("hint");
}

async function runExerciseAutocorrect() {
  return await runExerciseTrigger("autocorrect");
}

async function advanceExerciseStep() {
  const pack = getSelectedExercisePack();
  const currentStep = getCurrentExerciseStep(pack);

  if (!pack) {
    log("Nächster Schritt: Kein Exercise Pack aktiv.");
    return;
  }

  const nextStep = Exercises.getNextExerciseStep(pack, currentStep?.id || null);
  if (!nextStep) {
    log("Nächster Schritt: Bereits letzter Schritt des Exercise Packs erreicht.");
    return;
  }

  await persistExerciseRuntime({ currentStepId: nextStep.id });
  renderExerciseControls();

  log(
    "Exercise-Schritt weitergeschaltet: " +
    (currentStep?.label || "(kein Schritt)") +
    " -> " +
    (nextStep.label || nextStep.id)
  );
}

function renderCanvasTypePicker() {
  if (!canvasTypePickerEl) return;

  const entries = getCanvasTypeCatalogEntries();
  const selectedCanvasTypeId = getSelectedCanvasTypeId();
  const allowedCanvasTypeIds = new Set(getAllowedCanvasTypeIdsForCurrentPack());
  const hasRestriction = allowedCanvasTypeIds.size > 0;

  canvasTypePickerEl.textContent = "";

  if (entries.length === 0) {
    canvasTypePickerEl.textContent = "Keine Canvas-Typen konfiguriert.";
    return;
  }

  for (const entry of entries) {
    const isAllowed = !hasRestriction || allowedCanvasTypeIds.has(entry.canvasTypeId);

    const label = document.createElement("label");
    label.className = "canvas-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "dt-canvas-type";
    input.value = entry.canvasTypeId;
    input.checked = entry.canvasTypeId === selectedCanvasTypeId;
    input.disabled = !isAllowed;
    input.addEventListener("change", async () => {
      if (!input.checked || input.disabled) return;
      await syncDefaultCanvasTypeToBoardConfig(entry.canvasTypeId);
    });

    const card = document.createElement("span");
    card.className = "canvas-option-card";
    if (!isAllowed) {
      card.style.opacity = "0.45";
      card.style.cursor = "not-allowed";
    }

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
    meta.textContent = isAllowed
      ? entry.canvasTypeId
      : (entry.canvasTypeId + " · im aktuellen Exercise Pack nicht freigegeben");

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
  state.panelMode = loadPersistedPanelMode();
  renderCanvasTypePicker();
  renderExerciseControls();

  panelModeEl?.addEventListener("change", onPanelModeChange);
  exercisePackEl?.addEventListener("change", onExercisePackChange);
  exerciseStepEl?.addEventListener("change", onExerciseStepChange);

  document.getElementById("btn-save-admin-override")?.addEventListener("click", saveAdminOverrideFromUi);
  document.getElementById("btn-clear-admin-override")?.addEventListener("click", clearAdminOverrideFromUi);

  btnExerciseCheckEl?.addEventListener("click", runExerciseCheck);
  btnExerciseHintEl?.addEventListener("click", runExerciseHint);
  btnExerciseAutocorrectEl?.addEventListener("click", runExerciseAutocorrect);
  btnExerciseNextStepEl?.addEventListener("click", advanceExerciseStep);

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
  window.dtRunExerciseCheck = runExerciseCheck;
  window.dtRunExerciseHint = runExerciseHint;
  window.dtRunExerciseAutocorrect = runExerciseAutocorrect;
  window.dtAdvanceExerciseStep = advanceExerciseStep;

  renderPanelMode();
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
  await loadMemoryRuntimeState();
  await loadBoardExerciseState();

  // UI selection events
  await Board.registerSelectionUpdateHandler(onSelectionUpdate, log);
  await refreshSelectionStatusFromBoard();

  const selectedPack = getSelectedExercisePack();
  const selectedStep = getCurrentExerciseStep(selectedPack);

  log(
    "Init abgeschlossen. Global baseline: " +
    (state.hasGlobalBaseline ? ("JA (" + (state.globalBaselineAt || "unknown") + ")") : "NEIN") +
    ", Memory-Log: " + state.memoryLog.length + " Einträge." +
    " Exercise Pack: " + (selectedPack?.label || "keins") +
    ", Schritt: " + (selectedStep?.label || "kein aktiver Schritt") + "."
  );
}

// --------------------------------------------------------------------
// Scan throttling + Instance scan
// --------------------------------------------------------------------
function rebuildInstancesByLabelIndex() {
  state.instancesByLabel = new Map();

  for (const inst of state.instancesById.values()) {
    if (!inst?.instanceLabel) continue;
    state.instancesByLabel.set(inst.instanceLabel, inst.instanceId);
  }
}

function getInstanceLabelByInternalId(instanceId) {
  if (!instanceId) return null;
  const inst = state.instancesById.get(instanceId);
  return inst?.instanceLabel || null;
}

function getInternalInstanceIdByLabel(instanceLabel) {
  if (!instanceLabel) return null;
  return state.instancesByLabel.get(instanceLabel) || null;
}

function getInstanceLabelsFromIds(instanceIds) {
  const labels = [];
  const seen = new Set();

  for (const instanceId of instanceIds || []) {
    const label = getInstanceLabelByInternalId(instanceId);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  return labels;
}

async function loadMemoryRuntimeState() {
  state.memoryState = Memory.normalizeMemoryState(await Board.loadMemoryState(log));
  state.memoryLog = Memory.normalizeMemoryLog(await Board.loadMemoryLog(log));
}

function buildMemoryInjectionPayload() {
  return {
    memoryState: Memory.normalizeMemoryState(state.memoryState || Memory.createEmptyMemoryState()),
    recentMemoryLogEntries: Memory.getRecentMemoryEntries(state.memoryLog, DT_MEMORY_RECENT_LOG_LIMIT)
  };
}

function getInvolvedCanvasTypeIdsFromInstanceIds(instanceIds) {
  const ids = [];
  const seen = new Set();

  for (const instanceId of instanceIds || []) {
    const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
    if (!canvasTypeId || seen.has(canvasTypeId)) continue;
    seen.add(canvasTypeId);
    ids.push(canvasTypeId);
  }

  return ids;
}

function composePromptForRun({
  runMode,
  trigger = "generic",
  baseSystemPrompt,
  involvedCanvasTypeIds = [],
  baseUserPayload,
  userQuestion
}) {
  return PromptComposer.composePrompt({
    baseSystemPrompt,
    runMode,
    trigger,
    userQuestion,
    baseUserPayload,
    involvedCanvasTypeIds,
    templateCatalog: DT_TEMPLATE_CATALOG,
    boardConfig: state.boardConfig,
    exercisePack: getSelectedExercisePack(),
    currentStep: getCurrentExerciseStep(),
    adminOverrideText: state.exerciseRuntime?.adminOverrideText || null
  });
}

function createEmptyActionExecutionStats() {
  return {
    createdStickyCount: 0,
    movedStickyCount: 0,
    deletedStickyCount: 0,
    createdConnectorCount: 0,
    failedActionCount: 0,
    executedMutationCount: 0
  };
}

function mergeActionExecutionStats(target, addition) {
  if (!target || !addition) return target;
  target.createdStickyCount += Number(addition.createdStickyCount || 0);
  target.movedStickyCount += Number(addition.movedStickyCount || 0);
  target.deletedStickyCount += Number(addition.deletedStickyCount || 0);
  target.createdConnectorCount += Number(addition.createdConnectorCount || 0);
  target.failedActionCount += Number(addition.failedActionCount || 0);
  target.executedMutationCount += Number(addition.executedMutationCount || 0);
  return target;
}

function summarizeAppliedActions(actionResult) {
  const src = (actionResult && typeof actionResult === "object") ? actionResult : {};

  return {
    createdStickyCount: Number(src.createdStickyCount || 0),
    movedStickyCount: Number(src.movedStickyCount || 0),
    deletedStickyCount: Number(src.deletedStickyCount || 0),
    createdConnectorCount: Number(src.createdConnectorCount || 0),
    failedActionCount: Number(src.failedActionCount || 0),
    skippedActionCount: Number(src.skippedCount || 0),
    infoCount: Number(src.infoCount || 0),
    targetedInstanceCount: Number(src.targetedInstanceCount || 0),
    executedMutationCount: Number(src.executedMutationCount || 0),
    plannedMutationCount: Number(src.appliedCount || 0)
  };
}

async function persistMemoryAfterAgentRun(agentObj, runContext, actionResult) {
  const fallbackSummary = pickFirstNonEmptyString(agentObj?.analysis, "Agent-Run ohne Summary.");
  const normalizedMemoryEntry = Memory.normalizeMemoryEntry(agentObj?.memoryEntry, { fallbackSummary });

  if (!agentObj?.memoryEntry) {
    log("WARNUNG: Agent lieferte kein memoryEntry. Verwende Fallback aus analysis.");
  }

  const timestampIso = new Date().toISOString();
  const nextMemoryState = Memory.mergeMemoryEntryIntoState(state.memoryState, normalizedMemoryEntry, {
    timestamp: timestampIso
  });
  const storedLogEntry = Memory.buildStoredMemoryLogEntry(
    normalizedMemoryEntry,
    runContext,
    summarizeAppliedActions(actionResult),
    { timestamp: timestampIso }
  );

  await Board.saveMemoryState(nextMemoryState, log);
  const appendedLogEntry = await Board.appendMemoryLogEntry(storedLogEntry, log);

  state.memoryState = nextMemoryState;
  state.memoryLog = Memory.normalizeMemoryLog([
    ...(Array.isArray(state.memoryLog) ? state.memoryLog : []),
    appendedLogEntry || storedLogEntry
  ]);

  log(
    "Memory aktualisiert: " + state.memoryLog.length +
    " Einträge, stepStatus=" + (state.memoryState.stepStatus || "(leer)") + "."
  );
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
      hasGlobalBaseline: state.hasGlobalBaseline,
      log
    });
    rebuildInstancesByLabelIndex();
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

    if (await Board.isBoardAnchorItem(item, log)) {
      continue;
    }

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
  const labels = getInstanceLabelsFromIds(ids);

  if (itemCount === 0) {
    return [
      "Keine Canvas selektiert.",
      "Instanz-Agent erwartet mindestens eine selektierte Canvas-Instanz auf dem Board."
    ].join("\n");
  }

  if (labels.length === 0) {
    return [
      "Aktuelle Selektion enthält keine auflösbare Canvas.",
      "Selektierte Board-Items: " + itemCount,
      "Wähle mindestens eine Canvas oder ein Item innerhalb einer Canvas aus."
    ].join("\n");
  }

  return [
    "Selektierte Canvas: " + labels.length,
    "Instanzen: " + labels.join(", "),
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

    const instance = await Board.registerInstanceFromImage(image, {
      templateCatalog: DT_TEMPLATE_CATALOG,
      defaultTemplateId: TEMPLATE_ID,
      instancesByImageId: state.instancesByImageId,
      instancesById: state.instancesById,
      hasGlobalBaseline: state.hasGlobalBaseline,
      createActionShapes: false,
      canvasTypeId: selectedCanvasTypeId,
      log
    });
    rebuildInstancesByLabelIndex();

    const placementInfo = placement.usedViewportCenter
      ? "Neue Instanz wurde mittig in der aktuellen View platziert."
      : "Neue Instanz wurde nahe der aktuellen View platziert, mit Überlappungsschutz.";

    log(`Canvas eingefügt: ${instance?.instanceLabel || selectedCanvasType.displayName} (${selectedCanvasTypeId}), Bild-ID ${image.id}
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
  const executionStats = createEmptyActionExecutionStats();

  if (!Array.isArray(actions) || actions.length === 0) {
    log("Keine Actions vom Agenten (leer).");
    return executionStats;
  }

  const instance = state.instancesById.get(instanceId);
  if (!instance) {
    log("applyAgentActions: Unbekannte Instanz " + instanceId);
    executionStats.failedActionCount += actions.length;
    return executionStats;
  }

  const instanceLabel = instance.instanceLabel || instanceId;

  const geom = await Board.computeTemplateGeometry(instance, log);
  if (!geom) {
    log("applyAgentActions: Keine Geometrie für Instanz " + instanceLabel);
    executionStats.failedActionCount += actions.length;
    return executionStats;
  }

  if (!state.liveCatalog || !state.liveCatalog.instances?.[instanceId]) {
    await refreshBoardState();
  }

  const liveInst = state.liveCatalog?.instances?.[instanceId] || null;
  const createdStickyIdsByRef = new Map();
  const connectedPairSet = new Set();

  for (const connection of liveInst?.connections || []) {
    if (!connection?.fromStickyId || !connection?.toStickyId) continue;
    connectedPairSet.add(makeCanonicalStickyPairKey(connection.fromStickyId, connection.toStickyId));
  }

  function markSuccess(type) {
    executionStats.executedMutationCount += 1;

    if (type === "create_sticky") executionStats.createdStickyCount += 1;
    if (type === "move_sticky") executionStats.movedStickyCount += 1;
    if (type === "delete_sticky") executionStats.deletedStickyCount += 1;
    if (type === "create_connector") executionStats.createdConnectorCount += 1;
  }

  function markFailure(message) {
    executionStats.failedActionCount += 1;
    if (message) log(message);
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

  function registerCreatedStickyRef(refId, stickyId) {
    if (!refId || !stickyId) return;
    createdStickyIdsByRef.set(refId, stickyId);
  }

  function resolveActionStickyReference(stickyRef) {
    if (!stickyRef) return null;
    if (createdStickyIdsByRef.has(stickyRef)) {
      return createdStickyIdsByRef.get(stickyRef) || null;
    }
    return Catalog.resolveStickyId(stickyRef, state.aliasState);
  }

  function rememberConnectorPair(fromStickyId, toStickyId) {
    if (!fromStickyId || !toStickyId) return;
    connectedPairSet.add(makeCanonicalStickyPairKey(fromStickyId, toStickyId));
  }

  function hasKnownConnectorBetween(fromStickyId, toStickyId) {
    if (!fromStickyId || !toStickyId) return false;
    return connectedPairSet.has(makeCanonicalStickyPairKey(fromStickyId, toStickyId));
  }

  async function createStickyAtBoardPosition(action, x, y, sizeHint = null) {
    const sticky = await Board.createStickyNoteAtBoardCoords({
      content: action.text || "(leer)",
      x,
      y,
      frameId: instance.actionItems?.frameId || null
    }, log);

    if (sticky?.id && action.refId) {
      registerCreatedStickyRef(action.refId, sticky.id);
    }
    if (sticky?.id && state.stickyOwnerCache instanceof Map) {
      state.stickyOwnerCache.set(sticky.id, instanceId);
    }

    if (sizeHint && sticky?.id) {
      const regionId = detectBodyRegionIdFromBoardCoords(instance.canvasTypeId || TEMPLATE_ID, x, y);
      if (regionId && occupiedByRegion[regionId]) {
        occupiedByRegion[regionId].push({
          id: sticky.id,
          x,
          y,
          width: isFiniteNumber(sticky.width) ? sticky.width : sizeHint.width,
          height: isFiniteNumber(sticky.height) ? sticky.height : sizeHint.height
        });
      }
    }

    return sticky;
  }

  const handlers = {
    "move_sticky": async (action) => {
      const stickyId = resolveActionStickyReference(action.stickyId);
      if (!stickyId) {
        markFailure("move_sticky: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
        return;
      }

      const canvasTypeId = instance.canvasTypeId || TEMPLATE_ID;

      let stickyItem = null;
      try {
        stickyItem = await Board.getItemById(stickyId, log);
      } catch (_) {}

      const stickyW = isFiniteNumber(stickyItem?.width) ? stickyItem.width : STICKY_LAYOUT.defaultWidthPx;
      const stickyH = isFiniteNumber(stickyItem?.height) ? stickyItem.height : STICKY_LAYOUT.defaultHeightPx;

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
            const center = Catalog.areaCenterNormalized(regionId, canvasTypeId);
            const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
            targetX = coords.x;
            targetY = coords.y;
          }
        } else {
          const center = Catalog.areaCenterNormalized(null, canvasTypeId);
          const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
          targetX = coords.x;
          targetY = coords.y;
        }
      }

      if (!isFiniteNumber(targetX) || !isFiniteNumber(targetY)) {
        markFailure("move_sticky: Zielkoordinaten ungültig für Sticky " + stickyId);
        return;
      }

      await Board.moveItemByIdToBoardCoords(stickyId, targetX, targetY, log);

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

      markSuccess("move_sticky");
    },

    "create_sticky": async (action) => {
      const text = action.text || "(leer)";
      const canvasTypeId = instance.canvasTypeId || TEMPLATE_ID;

      const areaName = action.area || action.targetArea || null;
      const region = Catalog.areaNameToRegion(areaName);
      const regionId = region?.id || null;

      if (!regionId || !occupiedByRegion[regionId]) {
        const center = Catalog.areaCenterNormalized(null, canvasTypeId);
        const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
        const sticky = await createStickyAtBoardPosition({ ...action, text }, coords.x, coords.y, null);
        if (sticky?.id) markSuccess("create_sticky");
        else markFailure("create_sticky: Miro lieferte kein Sticky-Item zurück.");
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
        const sticky = await createStickyAtBoardPosition({ ...action, text }, coords.x, coords.y, null);
        if (sticky?.id) markSuccess("create_sticky");
        else markFailure("create_sticky: Miro lieferte kein Sticky-Item zurück.");
        return;
      }

      if (pos.isFull) {
        log(
          "WARNUNG: Region '" + regionId + "' wirkt voll (Grid " +
          pos.cols + "x" + pos.rows +
          "). Sticky wird auf die letzte Zelle gesetzt."
        );
      }

      const sticky = await createStickyAtBoardPosition({ ...action, text }, pos.x, pos.y, size);
      if (sticky?.id) markSuccess("create_sticky");
      else markFailure("create_sticky: Miro lieferte kein Sticky-Item zurück.");
    },

    "delete_sticky": async (action) => {
      const stickyId = resolveActionStickyReference(action.stickyId);
      if (!stickyId) {
        markFailure("delete_sticky: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
        return;
      }

      removeFromAllOccupied(stickyId);
      await Board.removeItemById(stickyId, log);
      markSuccess("delete_sticky");
    },

    "create_connector": async (action) => {
      const fromStickyId = resolveActionStickyReference(action.fromStickyId);
      const toStickyId = resolveActionStickyReference(action.toStickyId);

      if (!fromStickyId || !toStickyId) {
        markFailure(
          "create_connector: Sticky-Referenzen nicht auflösbar (from=" +
          String(action.fromStickyId || "(leer)") +
          ", to=" + String(action.toStickyId || "(leer)") + ")."
        );
        return;
      }

      if (fromStickyId === toStickyId) {
        markFailure("create_connector: Quelle und Ziel sind identisch – übersprungen (" + fromStickyId + ").");
        return;
      }

      if (hasKnownConnectorBetween(fromStickyId, toStickyId)) {
        markFailure("create_connector: Verbindung zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits – übersprungen.");
        return;
      }

      await Board.createConnectorBetweenItems({
        startItemId: fromStickyId,
        endItemId: toStickyId,
        directed: action.directed !== false,
        frameId: instance.actionItems?.frameId || null
      }, log);
      rememberConnectorPair(fromStickyId, toStickyId);
      markSuccess("create_connector");
    }
  };

  async function runActionsSequentially(actionList) {
    for (const action of actionList || []) {
      const handler = handlers[action?.type];
      if (typeof handler !== "function") {
        markFailure("Unbekannter Action-Typ innerhalb applyAgentActionsToInstance: " + String(action?.type || "(leer)"));
        continue;
      }

      try {
        await handler(action);
      } catch (e) {
        markFailure("Action '" + action.type + "' fehlgeschlagen: " + e.message);
      }
    }
  }

  const regularActions = actions.filter((action) => action?.type !== "create_connector");
  const connectorActions = actions.filter((action) => action?.type === "create_connector");

  log("Wende " + actions.length + " Action(s) an (Instanz " + instanceLabel + ").");
  if (regularActions.length) {
    await runActionsSequentially(regularActions);
  }
  if (connectorActions.length) {
    await runActionsSequentially(connectorActions);
  }

  return executionStats;
}

// --------------------------------------------------------------------
// Agent Modus B (selektierte Canvas-Instanzen)
// --------------------------------------------------------------------
function buildBoardCatalogForSelectedInstances(selectedInstanceIds) {
  const selectedLabels = new Set(getInstanceLabelsFromIds(selectedInstanceIds));
  const baseCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "generic",
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  return {
    instances: (baseCatalog.instances || []).map((entry) => ({
      ...entry,
      isActive: selectedLabels.has(entry.instanceLabel)
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
  await loadMemoryRuntimeState();

  const normalizedSelectedIds = Array.from(new Set((selectedInstanceIds || []).filter((id) => state.instancesById.has(id))));
  if (!normalizedSelectedIds.length) {
    log("Instanz-Agent: Keine gültigen Ziel-Instanzen übergeben.");
    return;
  }

  const apiKey = getApiKey();
  const model = getModel();
  const userText = options.userText || getCurrentUserQuestion();
  const runMode = pickFirstNonEmptyString(options.runMode, "selection");
  const trigger = pickFirstNonEmptyString(options.trigger, "generic");
  const sourceLabel = pickFirstNonEmptyString(options.sourceLabel, "Instanz-Agent");

  if (!apiKey) {
    log("Bitte OpenAI API Key eingeben (Agent).");
    return;
  }

  const promptCfg = getPromptConfigForSelectedInstances(normalizedSelectedIds);

  const { liveCatalog } = await refreshBoardState();
  const stateById = await computeInstanceStatesById(liveCatalog);

  const activeCanvasStates = Object.create(null);
  const activeInstanceChangesSinceLastAgent = Object.create(null);

  for (const id of normalizedSelectedIds) {
    const st = stateById[id];
    const instance = state.instancesById.get(id) || null;
    const instanceLabel = instance?.instanceLabel || null;
    if (!st?.classification) continue;
    if (!instanceLabel) continue;

    const payload = Catalog.buildPromptPayloadFromClassification(st.classification, {
      useAliases: true,
      aliasState: state.aliasState,
      log
    });
    if (payload) activeCanvasStates[instanceLabel] = payload;

    if (!state.hasGlobalBaseline || !st?.diff) {
      activeInstanceChangesSinceLastAgent[instanceLabel] = null;
    } else {
      activeInstanceChangesSinceLastAgent[instanceLabel] = Catalog.aliasDiffForActiveInstance(st.diff, state.aliasState);
    }
  }

  const resolvedActiveLabels = Object.keys(activeCanvasStates);
  if (!resolvedActiveLabels.length) {
    log(sourceLabel + ": Konnte für die selektierten Canvas keine Zustandsdaten aufbauen.");
    return;
  }

  const resolvedActiveIds = resolvedActiveLabels
    .map((label) => getInternalInstanceIdByLabel(label))
    .filter((id) => state.instancesById.has(id));
  const singleLabel = resolvedActiveLabels.length === 1 ? resolvedActiveLabels[0] : null;
  const boardCatalog = buildBoardCatalogForSelectedInstances(resolvedActiveIds);
  const memoryPayload = buildMemoryInjectionPayload();

  const baseUserPayload = {
    activeInstanceLabel: singleLabel,
    selectedInstanceLabels: resolvedActiveLabels,
    boardCatalog,
    activeCanvasState: singleLabel ? activeCanvasStates[singleLabel] : null,
    activeCanvasStates,
    activeInstanceChangesSinceLastAgent,
    memoryState: memoryPayload.memoryState,
    recentMemoryLogEntries: memoryPayload.recentMemoryLogEntries,
    hint: "boardCatalog = Kurzüberblick über alle Canvas, activeCanvasStates = Detaildaten nur für die selektierten Instanzen. Wenn mehrere Instanzen selektiert sind, muss jede mutierende Action eine instanceLabel enthalten. Verwende exakt die menschenlesbaren Canvas-Labels aus selectedInstanceLabels bzw. den Schlüsseln von activeCanvasStates. Verwende create_connector für Beziehungen zwischen Stickies. fromStickyId/toStickyId dürfen bestehende Alias-IDs oder refId-Werte aus create_sticky-Actions derselben Antwort sein. memoryState/recentMemoryLogEntries bilden das semantische Arbeitsgedächtnis; referenziere dort Canvas ebenfalls nur über instanceLabel."
  };

  const composedPrompt = composePromptForRun({
    runMode,
    trigger,
    baseSystemPrompt: promptCfg.system,
    involvedCanvasTypeIds: getInvolvedCanvasTypeIdsFromInstanceIds(resolvedActiveIds),
    baseUserPayload,
    userQuestion: userText
  });

  const exerciseInfo = composedPrompt.exerciseContext?.exercisePackLabel
    ? (" | Exercise: " + composedPrompt.exerciseContext.exercisePackLabel + " / " + (composedPrompt.exerciseContext.currentStepLabel || "kein Schritt"))
    : "";

  log(
    "Starte " + sourceLabel + " für selektierte Instanzen: " +
    resolvedActiveLabels.join(", ") +
    exerciseInfo +
    " ..."
  );

  try {
    log("Sende " + sourceLabel + "-Request an OpenAI ...");
    const answer = await OpenAI.callOpenAIResponses({
      apiKey,
      model,
      systemPrompt: composedPrompt.systemPrompt,
      userText: JSON.stringify(composedPrompt.userPayload, null, 2),
      maxOutputTokens: 4000
    });

    if (!answer) {
      log(sourceLabel + ": Keine Antwort (output_text) gefunden.");
      return;
    }

    const agentObj = OpenAI.parseJsonFromModelOutput(answer);
    if (!agentObj) {
      log(sourceLabel + ": Antwort ist kein valides JSON. Rohantwort:");
      log(answer);
      return;
    }

    log(sourceLabel + " analysis:");
    log(agentObj.analysis || "(keine analysis)");

    const actionResult = Array.isArray(agentObj.actions) && agentObj.actions.length
      ? await applyResolvedAgentActions(agentObj.actions, {
          candidateInstanceIds: resolvedActiveIds,
          triggerInstanceId: singleLabel ? getInternalInstanceIdByLabel(singleLabel) : null,
          sourceLabel
        })
      : {
          appliedCount: 0,
          skippedCount: 0,
          infoCount: 0,
          targetedInstanceCount: 0,
          ...createEmptyActionExecutionStats()
        };

    if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
      log(
        sourceLabel + ": Action-Run abgeschlossen. " +
        "Geplant=" + actionResult.appliedCount +
        ", ausgeführt=" + actionResult.executedMutationCount +
        ", Hinweise=" + actionResult.infoCount +
        ", übersprungen=" + actionResult.skippedCount +
        ", fehlgeschlagen=" + actionResult.failedActionCount +
        ", Ziel-Instanzen=" + actionResult.targetedInstanceCount + "."
      );
    } else {
      log(sourceLabel + ": Keine Actions geliefert.");
    }

    await refreshBoardState();

    const nowIso = new Date().toISOString();
    for (const id of resolvedActiveIds) {
      const inst = state.instancesById.get(id);
      if (!inst) continue;
      inst.lastAgentRunAt = nowIso;
      inst.lastChangedAt = nowIso;
    }

    await persistMemoryAfterAgentRun(agentObj, {
      runMode,
      trigger: composedPrompt.exerciseContext?.trigger || trigger,
      targetInstanceLabels: resolvedActiveLabels,
      userRequest: userText
    }, actionResult);

  } catch (e) {
    log("Exception beim " + sourceLabel + "-Run: " + e.message);
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

function coerceBooleanLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (["true", "yes", "ja", "1", "directed", "with_arrow", "arrow"].includes(normalized)) return true;
  if (["false", "no", "nein", "0", "none", "undirected", "without_arrow", "no_arrow"].includes(normalized)) return false;
  return null;
}

function normalizeConnectorDirection(rawAction) {
  const rawDirection = pickFirstNonEmptyString(
    rawAction?.direction,
    rawAction?.arrowDirection,
    rawAction?.connectorDirection
  );

  if (rawDirection) {
    const dir = rawDirection.trim().toLowerCase();
    if (["none", "undirected", "without_arrow", "no_arrow"].includes(dir)) {
      return { directed: false, reverseDirection: false };
    }
    if (["to_from", "reverse", "backward", "target_to_source", "end_to_start"].includes(dir)) {
      return { directed: true, reverseDirection: true };
    }
    if (["from_to", "forward", "source_to_target", "start_to_end"].includes(dir)) {
      return { directed: true, reverseDirection: false };
    }
  }

  const coerced = coerceBooleanLike(
    rawAction?.directed ??
    rawAction?.isDirected ??
    rawAction?.withArrow ??
    rawAction?.hasArrow ??
    rawAction?.arrow
  );

  return {
    directed: coerced == null ? true : coerced,
    reverseDirection: false
  };
}

function makeCanonicalStickyPairKey(a, b) {
  if (!a || !b) return null;
  return [String(a), String(b)].sort().join("<->");
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
    createconnector: "create_connector",
    addconnector: "create_connector",
    connectsticky: "create_connector",
    connectstickies: "create_connector",
    connectnote: "create_connector",
    connectnotes: "create_connector",
    createconnection: "create_connector",
    addconnection: "create_connector",
    linksticky: "create_connector",
    linkstickies: "create_connector",
    linknote: "create_connector",
    linknotes: "create_connector",
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

  const normalizedDirection = normalizeConnectorDirection(rawAction);

  const normalized = {
    type,
    instanceLabel: pickFirstNonEmptyString(
      rawAction.instanceLabel,
      rawAction.targetInstanceLabel,
      rawAction.canvasLabel,
      rawAction.instanceName,
      typeof rawAction.instance === "string" ? rawAction.instance : null,
      typeof rawAction.targetInstance === "string" ? rawAction.targetInstance : null
    ),
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
      rawAction.sticky?.id,
      typeof rawAction.sticky === "string" ? rawAction.sticky : null
    ),
    refId: pickFirstNonEmptyString(
      rawAction.refId,
      rawAction.tempId,
      rawAction.localId,
      rawAction.clientRefId,
      rawAction.referenceId,
      rawAction.newStickyRefId
    ),
    fromStickyId: pickFirstNonEmptyString(
      rawAction.fromStickyId,
      rawAction.fromId,
      rawAction.sourceStickyId,
      rawAction.sourceNoteId,
      rawAction.startStickyId,
      rawAction.startNoteId,
      rawAction.from?.id,
      rawAction.start?.id,
      typeof rawAction.from === "string" ? rawAction.from : null,
      typeof rawAction.start === "string" ? rawAction.start : null
    ),
    toStickyId: pickFirstNonEmptyString(
      rawAction.toStickyId,
      rawAction.toId,
      rawAction.targetStickyId,
      rawAction.targetNoteId,
      rawAction.endStickyId,
      rawAction.endNoteId,
      rawAction.to?.id,
      rawAction.end?.id,
      typeof rawAction.to === "string" ? rawAction.to : null,
      typeof rawAction.end === "string" ? rawAction.end : null
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
    ),
    directed: normalizedDirection.directed,
    reverseDirection: normalizedDirection.reverseDirection
  };

  if (isFiniteNumber(rawAction.targetPx)) normalized.targetPx = rawAction.targetPx;
  if (isFiniteNumber(rawAction.targetPy)) normalized.targetPy = rawAction.targetPy;

  return normalized;
}

function resolveOwnerInstanceIdForStickyReference(stickyRef) {
  if (!stickyRef) return null;
  const resolvedStickyId = Catalog.resolveStickyId(stickyRef, state.aliasState);
  if (!resolvedStickyId) return null;
  return state.stickyOwnerCache?.get(resolvedStickyId) || null;
}

function resolveActionInstanceId(action, { candidateInstanceIds = null, triggerInstanceId = null, sourceLabel = "Agent" } = {}) {
  const candidateIds = Array.from(new Set((candidateInstanceIds || []).filter((id) => state.instancesById.has(id))));

  const explicitInstanceIdByLabel = action?.instanceLabel
    ? getInternalInstanceIdByLabel(action.instanceLabel)
    : null;

  const explicitInstanceId =
    explicitInstanceIdByLabel || (
      (action?.instanceId && state.instancesById.has(action.instanceId))
        ? action.instanceId
        : null
    );

  if (action?.instanceLabel && !explicitInstanceIdByLabel && typeof log === "function") {
    log(sourceLabel + ": Unbekanntes instanceLabel '" + action.instanceLabel + "' in Action-Output.");
  }

  const ownerInstanceIds = Array.from(new Set([
    resolveOwnerInstanceIdForStickyReference(action?.stickyId),
    resolveOwnerInstanceIdForStickyReference(action?.fromStickyId),
    resolveOwnerInstanceIdForStickyReference(action?.toStickyId)
  ].filter(Boolean)));

  if (ownerInstanceIds.length > 1) {
    log(sourceLabel + ": Action referenziert Sticky Notes aus mehreren Instanzen – übersprungen.");
    return null;
  }

  const ownerInstanceId = ownerInstanceIds[0] || null;
  const ownerInstanceLabel = ownerInstanceId ? getInstanceLabelByInternalId(ownerInstanceId) : null;

  if (ownerInstanceId && explicitInstanceId && explicitInstanceId !== ownerInstanceId) {
    log(
      "WARNUNG: " + sourceLabel + "-Action referenziert Sticky(s) mit Instanz " +
      (action.instanceLabel || getInstanceLabelByInternalId(explicitInstanceId) || explicitInstanceId) +
      ", gehört aber zu " + (ownerInstanceLabel || ownerInstanceId) + ". Verwende Eigentümer-Instanz."
    );
  }

  const preferredInstanceId = ownerInstanceId || explicitInstanceId || null;
  if (preferredInstanceId) {
    if (candidateIds.length > 0 && !candidateIds.includes(preferredInstanceId)) {
      log(
        sourceLabel + ": Abgeleitete Ziel-Instanz " +
        (getInstanceLabelByInternalId(preferredInstanceId) || preferredInstanceId) +
        " liegt außerhalb des erlaubten Zielsets – Action übersprungen."
      );
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
    return {
      appliedCount: 0,
      skippedCount: 0,
      infoCount: 0,
      targetedInstanceCount: 0,
      ...createEmptyActionExecutionStats()
    };
  }

  const grouped = new Map();
  const aggregatedExecutionStats = createEmptyActionExecutionStats();
  let appliedCount = 0;
  let skippedCount = 0;
  let infoCount = 0;

  for (const rawAction of actions) {
    let action = normalizeAgentAction(rawAction);

    if (!action) {
      skippedCount++;
      log(sourceLabel + ": Unbekanntes oder nicht unterstütztes Action-Schema – übersprungen.");
      log(rawAction);
      continue;
    }

    if (action.type === "create_connector" && action.reverseDirection) {
      action = {
        ...action,
        fromStickyId: action.toStickyId,
        toStickyId: action.fromStickyId,
        reverseDirection: false
      };
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

    if (action.type === "create_connector" && (!action.fromStickyId || !action.toStickyId)) {
      skippedCount++;
      log(sourceLabel + ": create_connector ohne fromStickyId/toStickyId – übersprungen.");
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
    grouped.get(targetInstanceId).push({
      ...action,
      instanceId: targetInstanceId,
      instanceLabel: getInstanceLabelByInternalId(targetInstanceId) || action.instanceLabel || null
    });
    appliedCount++;
  }

  for (const [instanceId, instanceActions] of grouped.entries()) {
    log(
      sourceLabel + ": Wende " + instanceActions.length + " Action(s) auf Instanz " +
      (getInstanceLabelByInternalId(instanceId) || instanceId) + " an."
    );
    const executionStats = await applyAgentActionsToInstance(instanceId, instanceActions);
    mergeActionExecutionStats(aggregatedExecutionStats, executionStats);
  }

  return {
    appliedCount,
    skippedCount,
    infoCount,
    targetedInstanceCount: grouped.size,
    ...aggregatedExecutionStats
  };
}

// --------------------------------------------------------------------
// Global Agent Modus A
// --------------------------------------------------------------------
async function runGlobalAgent(triggerInstanceId, userText) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();
  await loadMemoryRuntimeState();

  const apiKey = getApiKey();
  const model = getModel();

  const finalUserText = (userText || "").trim()
    ? userText.trim()
    : getCurrentUserQuestion();

  if (!apiKey) { log("Bitte OpenAI API Key eingeben (Global Agent)."); return; }

  log("Starte globalen Agenten-Run (Modus A), Trigger: " + (getInstanceLabelByInternalId(triggerInstanceId) || triggerInstanceId || "(keine)"));

  const { liveCatalog } = await refreshBoardState();
  const stateById = await computeInstanceStatesById(liveCatalog);

  const boardCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "global",
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  const activeInstanceLabels = boardCatalog.instances
    .filter((e) => e.isActive)
    .map((e) => e.instanceLabel)
    .filter(Boolean);

  const activeInstanceIds = activeInstanceLabels
    .map((label) => getInternalInstanceIdByLabel(label))
    .filter((id) => state.instancesById.has(id));

  const activeCanvasStates = Object.create(null);
  const activeInstanceChangesSinceLastAgent = Object.create(null);

  for (const id of activeInstanceIds) {
    const st = stateById[id];
    const instance = state.instancesById.get(id) || null;
    const instanceLabel = instance?.instanceLabel || null;
    if (!st?.classification) continue;
    if (!instanceLabel) continue;

    const payload = Catalog.buildPromptPayloadFromClassification(st.classification, {
      useAliases: true,
      aliasState: state.aliasState,
      log
    });
    if (payload) activeCanvasStates[instanceLabel] = payload;
  }

  for (const id of activeInstanceIds) {
    const st = stateById[id];
    const instanceLabel = getInstanceLabelByInternalId(id);
    if (!instanceLabel) continue;
    if (!st?.diff || !state.hasGlobalBaseline) {
      activeInstanceChangesSinceLastAgent[instanceLabel] = null;
      continue;
    }
    activeInstanceChangesSinceLastAgent[instanceLabel] = Catalog.aliasDiffForActiveInstance(st.diff, state.aliasState);
  }

  const memoryPayload = buildMemoryInjectionPayload();

  const baseUserPayload = {
    triggerInstanceLabel: getInstanceLabelByInternalId(triggerInstanceId) || null,
    hasBaseline: state.hasGlobalBaseline,
    boardCatalog,
    activeInstanceLabels,
    activeCanvasStates,
    activeInstanceChangesSinceLastAgent,
    memoryState: memoryPayload.memoryState,
    recentMemoryLogEntries: memoryPayload.recentMemoryLogEntries,
    hint: "boardCatalog = Übersicht, activeCanvasStates = Detaildaten nur für aktive Instanzen. Jede mutierende Action muss genau eine instanceLabel enthalten und dieses Label muss exakt einem Wert aus activeInstanceLabels bzw. einem Schlüssel von activeCanvasStates entsprechen. area/targetArea muss exakt einem vorhandenen Area-Namen der Ziel-Instanz entsprechen. Verwende create_connector für Beziehungen zwischen Stickies. fromStickyId/toStickyId dürfen bestehende Alias-IDs oder refId-Werte aus create_sticky-Actions derselben Antwort sein. memoryState/recentMemoryLogEntries bilden das semantische Arbeitsgedächtnis; referenziere dort Canvas ebenfalls nur über instanceLabel."
  };

  const composedPrompt = composePromptForRun({
    runMode: "global",
    trigger: "generic",
    baseSystemPrompt: DT_GLOBAL_SYSTEM_PROMPT,
    involvedCanvasTypeIds: getInvolvedCanvasTypeIdsFromInstanceIds(activeInstanceIds),
    baseUserPayload,
    userQuestion: finalUserText
  });

  const exerciseInfo = composedPrompt.exerciseContext?.exercisePackLabel
    ? (" | Exercise: " + composedPrompt.exerciseContext.exercisePackLabel + " / " + (composedPrompt.exerciseContext.currentStepLabel || "kein Schritt"))
    : "";

  log("Global-Agent-Kontext" + exerciseInfo + ". Aktive Canvas: " + (activeInstanceLabels.join(", ") || "(keine)"));

  try {
    log("Sende globalen Agent-Request an OpenAI (Modus A) ...");
    const answer = await OpenAI.callOpenAIResponses({
      apiKey,
      model,
      systemPrompt: composedPrompt.systemPrompt,
      userText: JSON.stringify(composedPrompt.userPayload, null, 2),
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
      : {
          appliedCount: 0,
          skippedCount: 0,
          infoCount: 0,
          targetedInstanceCount: 0,
          ...createEmptyActionExecutionStats()
        };

    if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
      log(
        "Global Agent: Action-Run abgeschlossen. " +
        "Geplant=" + actionResult.appliedCount +
        ", ausgeführt=" + actionResult.executedMutationCount +
        ", Hinweise=" + actionResult.infoCount +
        ", übersprungen=" + actionResult.skippedCount +
        ", fehlgeschlagen=" + actionResult.failedActionCount +
        ", Ziel-Instanzen=" + actionResult.targetedInstanceCount + "."
      );
    } else {
      log("Global Agent lieferte keine Actions.");
    }

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

    await persistMemoryAfterAgentRun(agentObj, {
      runMode: "global",
      trigger: composedPrompt.exerciseContext?.trigger || "generic",
      targetInstanceLabels: activeInstanceLabels,
      userRequest: finalUserText
    }, actionResult);

  } catch (e) {
    log("Exception beim globalen Agent-Run: " + e.message);
  }
}
