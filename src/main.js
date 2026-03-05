import {
  TEMPLATE_ID,
  DT_TEMPLATE_CATALOG,
  DT_CANVAS_DEFS,
  DT_PROMPT_CATALOG,
  DT_GLOBAL_SYSTEM_PROMPT,
  DT_MEMORY_RECENT_LOG_LIMIT,
  STICKY_LAYOUT
} from "./config.js?v=20260305-batch06";

import { createLogger, stripHtml, extractUnderlinedText, isFiniteNumber } from "./utils.js?v=20260301-step11-hotfix2";

import * as Board from "./miro/board.js?v=20260305-batch06";
import * as Catalog from "./domain/catalog.js?v=20260305-batch06";
import * as OpenAI from "./ai/openai.js?v=20260305-schemafix2";
import * as Memory from "./runtime/memory.js?v=20260301-step11-hotfix2";
import * as Exercises from "./exercises/registry.js?v=20260304-editorial15";
import * as ExerciseLibrary from "./exercises/library.js?v=20260304-editorial15";
import * as PromptComposer from "./prompt/composer.js?v=20260305-batch06";
import * as ExerciseEngine from "./runtime/exercise-engine.js?v=20260304-editorial15";
import * as BoardFlow from "./runtime/board-flow.js?v=20260303-flowbatch1";
import * as PanelBridge from "./runtime/panel-bridge.js?v=20260305-schemafix2";
import { buildPayloadMappingHint } from "./app/payload-hints.js?v=20260305-batch06";
import { getInsertWidthPxForCanvasType, computeTemplateInsertPosition } from "./app/template-insertion.js?v=20260305-batch05";
import { pickFirstNonEmptyString, makeCanonicalStickyPairKey, normalizeAgentAction } from "./agent/action-normalization.js?v=20260305-batch05";
import { createEmptyActionExecutionStats, mergeActionExecutionStats, summarizeAppliedActions } from "./agent/action-stats.js?v=20260305-batch05";

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

  // New Board Flow runtime
  boardFlowsById: new Map(),
  flowControlRunLock: false,
  lastTriggeredFlowControlItemId: null,
  lastTriggeredFlowControlAt: 0,
  flowControlLabelDirty: false,
  lastAutoFlowControlLabel: "",

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
const exerciseRecommendationStatusEl = document.getElementById("exercise-recommendation-status");
const userActionsPanelEl = document.getElementById("user-actions-panel");
const adminPanelEl = document.getElementById("admin-panel");
const apiKeyEl = document.getElementById("api-key");
const modelEl = document.getElementById("model");
const adminOverrideTextEl = document.getElementById("admin-override-text");
const flowPackTemplateEl = document.getElementById("flow-pack-template");
const flowStepTemplateEl = document.getElementById("flow-step-template");
const flowRunProfileEl = document.getElementById("flow-run-profile");
const flowScopeTypeEl = document.getElementById("flow-scope-type");
const flowControlLabelEl = document.getElementById("flow-control-label");
const flowAuthoringStatusEl = document.getElementById("flow-authoring-status");
const btnFlowCreateControlEl = document.getElementById("btn-flow-create-control");
const btnFlowSetCurrentStepEl = document.getElementById("btn-flow-set-current-step");
const exerciseActionHelpEl = document.getElementById("exercise-action-help");
const btnExerciseCheckEl = document.getElementById("btn-exercise-check");
const btnExerciseHintEl = document.getElementById("btn-exercise-hint");
const btnExerciseAutocorrectEl = document.getElementById("btn-exercise-autocorrect");
const btnExerciseReviewEl = document.getElementById("btn-exercise-review");
const btnExerciseCoachEl = document.getElementById("btn-exercise-coach");
const btnExerciseNextStepEl = document.getElementById("btn-exercise-next-step");
const RUNTIME_CONTEXT = window.__DT_RUNTIME_CONTEXT === "headless" ? "headless" : "panel";
const IS_HEADLESS = RUNTIME_CONTEXT === "headless";
const log = logEl
  ? createLogger(logEl)
  : function logHeadless(msg) {
      const text = (typeof msg === "string") ? msg : JSON.stringify(msg, null, 2);
      console.log("[DT][" + RUNTIME_CONTEXT + "] " + text);
    };

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

function loadRuntimeSettings() {
  return PanelBridge.loadRuntimeSettings();
}

function applyRuntimeSettingsToUi() {
  const settings = loadRuntimeSettings();
  if (apiKeyEl && !apiKeyEl.value && settings.apiKey) {
    apiKeyEl.value = settings.apiKey;
  }
  if (modelEl) {
    const wantedModel = settings.model || "gpt-5.2";
    const optionValues = Array.from(modelEl.options || []).map((option) => option.value);
    modelEl.value = optionValues.includes(wantedModel) ? wantedModel : "gpt-5.2";
  }
}

function persistRuntimeSettingsFromUi() {
  PanelBridge.saveRuntimeSettings({
    apiKey: (apiKeyEl?.value || "").trim(),
    model: (modelEl?.value || "gpt-5.2").trim() || "gpt-5.2"
  });
}

function getApiKey() {
  const uiValue = (apiKeyEl?.value || "").trim();
  if (uiValue) return uiValue;
  return loadRuntimeSettings().apiKey || "";
}
function getModel() {
  const uiValue = (modelEl?.value || "").trim();
  if (uiValue) return uiValue;
  return loadRuntimeSettings().model || "gpt-5.2";
}
function getPanelUserText() {
  const el = document.getElementById("user-text");
  return (el?.value || "").trim();
}

function startPanelRuntimeBridge() {
  PanelBridge.startPanelHeartbeat();
  window.addEventListener("beforeunload", () => {
    PanelBridge.stopPanelHeartbeat();
  }, { once: true });
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


function getCurrentTriggerSource() {
  return state.panelMode === "admin" ? "admin" : "user";
}

async function notifyRuntime(message, { level = "info" } = {}) {
  if (!message) return;
  try {
    const notifications = window.miro?.board?.notifications;
    if (!notifications) return;
    if (level === "error" && typeof notifications.showError === "function") {
      await notifications.showError(message);
      return;
    }
    if (level === "warning" && typeof notifications.showWarning === "function") {
      await notifications.showWarning(message);
      return;
    }
    if (typeof notifications.showInfo === "function") {
      await notifications.showInfo(message);
    }
  } catch (_) {}
}

function shouldHeadlessHandleFlowControls() {
  return IS_HEADLESS && !PanelBridge.isPanelHeartbeatFresh();
}

function shouldPanelHandleFlowControls() {
  return !IS_HEADLESS;
}

function buildBoardConfigPatchForPack(pack) {
  const defaults = Exercises.getPackDefaults(pack);
  return {
    feedbackFrameName: defaults.feedbackFrameName,
    feedbackChannelDefault: defaults.feedbackChannel,
    userMayChangePack: defaults.userMayChangePack,
    userMayChangeStep: defaults.userMayChangeStep,
    appAdminPolicy: defaults.appAdminPolicy
  };
}

function getCurrentMemoryStepStatus() {
  return (typeof state.memoryState?.stepStatus === "string" && state.memoryState.stepStatus.trim())
    ? state.memoryState.stepStatus.trim()
    : null;
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

  exercisePackEl.disabled = state.panelMode !== "admin";
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

  exerciseStepEl.disabled = steps.length === 0 || state.panelMode !== "admin";
}

function renderExerciseContextStatus() {
  const pack = getSelectedExercisePack();
  const currentStep = getCurrentExerciseStep(pack);
  const selectedCanvasType = getCanvasTypeEntry(getSelectedCanvasTypeId());
  const feedbackFrameName = state.boardConfig?.feedbackFrameName || "AI Coach Output";

  if (exerciseContextStatusEl) {
    const lines = [
      "Board-Modus: " + getCurrentBoardMode(),
      "Exercise Pack: " + (pack ? pack.label : "keins (generischer Agentenmodus)"),
      "Aktueller Schritt: " + (currentStep?.label || "kein Schritt aktiv"),
      "Standard-Canvas-Typ: " + (selectedCanvasType?.displayName || getSelectedCanvasTypeId()),
      "Feedback-Frame: " + feedbackFrameName
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


function packLabelWithStep(pack, stepId) {
  const step = pack ? Exercises.getExerciseStep(pack, stepId) : null;
  if (!pack) return "keins";
  return step ? `${pack.label} / ${step.label}` : pack.label;
}

function renderRecommendationStatus() {
  if (!exerciseRecommendationStatusEl) return;

  const lines = [];
  const lastTriggerKey = state.exerciseRuntime?.lastTriggerKey || null;
  const lastTriggerSource = state.exerciseRuntime?.lastTriggerSource || null;
  const lastTriggerAt = state.exerciseRuntime?.lastTriggerAt || null;
  const recommendedNextTrigger = state.exerciseRuntime?.recommendedNextTrigger || null;
  const recommendedNextStepId = state.exerciseRuntime?.recommendedNextStepId || null;
  const recommendationReason = state.exerciseRuntime?.recommendationReason || null;
  const feedbackCounter = Number(state.exerciseRuntime?.feedbackTextCounter || 0);
  const lastFeedbackIds = Array.isArray(state.exerciseRuntime?.lastFeedbackTextIds)
    ? state.exerciseRuntime.lastFeedbackTextIds.filter(Boolean)
    : [];

  lines.push("Letzter Trigger: " + (lastTriggerKey ? `${lastTriggerKey} (${lastTriggerSource || "system"})` : "noch keiner"));
  if (lastTriggerAt) lines.push("Letzter Trigger-Zeitpunkt: " + lastTriggerAt);
  lines.push("Empfohlener nächster Trigger: " + (recommendedNextTrigger || "keine Empfehlung"));
  lines.push("Empfohlener nächster Schritt: " + (recommendedNextStepId || "keine Empfehlung"));
  lines.push("Step-Wechsel empfohlen: " + (state.exerciseRuntime?.advanceStepSuggested ? "ja" : "nein"));
  if (recommendationReason) lines.push("Begründung: " + recommendationReason);
  lines.push("Feedback-Texte erzeugt: " + feedbackCounter);
  if (lastFeedbackIds.length) lines.push("Letzte Feedback-Textitems: " + lastFeedbackIds.join(", "));

  exerciseRecommendationStatusEl.textContent = lines.join("\n");
}

function renderExerciseActionButtons() {
  const pack = getSelectedExercisePack();
  const currentStep = getCurrentExerciseStep(pack);
  const source = getCurrentTriggerSource();
  const nextTransition = pack && currentStep
    ? ExerciseEngine.resolveNextTransition({
        pack,
        step: currentStep,
        source,
        lastTriggerKey: state.exerciseRuntime?.lastTriggerKey,
        memoryStepStatus: getCurrentMemoryStepStatus(),
        recommendedNextStepId: state.exerciseRuntime?.recommendedNextStepId
      })
    : null;
  const hasExerciseContext = !!pack && !!currentStep;

  const triggerAvailability = (triggerKey) => hasExerciseContext && Exercises.isTriggerAllowedForStep(currentStep, triggerKey);

  if (btnExerciseCheckEl) btnExerciseCheckEl.disabled = !triggerAvailability("selection.check");
  if (btnExerciseHintEl) btnExerciseHintEl.disabled = !triggerAvailability("selection.hint");
  if (btnExerciseAutocorrectEl) btnExerciseAutocorrectEl.disabled = !triggerAvailability("selection.autocorrect");
  if (btnExerciseReviewEl) btnExerciseReviewEl.disabled = !triggerAvailability("selection.review");
  if (btnExerciseCoachEl) btnExerciseCoachEl.disabled = !triggerAvailability("selection.coach");
  if (btnExerciseNextStepEl) btnExerciseNextStepEl.disabled = !nextTransition;

  if (exerciseActionHelpEl) {
    if (!pack) {
      exerciseActionHelpEl.textContent = "Kein Exercise Pack aktiv. Bitte im Admin-Modus zuerst ein Exercise Pack auswählen.";
    } else if (!currentStep) {
      exerciseActionHelpEl.textContent = "Kein aktiver Schritt gesetzt. Bitte im Admin-Modus einen gültigen Schritt auswählen.";
    } else if (nextTransition) {
      const nextStep = Exercises.getExerciseStep(pack, nextTransition.toStepId);
      exerciseActionHelpEl.textContent = "Die Übungsaktionen arbeiten auf den aktuell selektierten Canvas-Instanzen. Ohne Selektion erscheint ein Warnhinweis im Log. Der nächste gültige Schritt wäre: " + (nextStep?.label || nextTransition.toStepId) + ".";
    } else {
      exerciseActionHelpEl.textContent = "Die Übungsaktionen arbeiten auf den aktuell selektierten Canvas-Instanzen. Ohne Selektion erscheint ein Warnhinweis im Log. Für den aktuellen Schritt ist kein weiterer Transition-Pfad freigegeben.";
    }
  }
}

function renderExerciseControls() {
  renderExercisePackPicker();
  renderExerciseStepPicker();
  renderExerciseContextStatus();
  renderRecommendationStatus();
  renderAdminOverrideEditor();
  renderExerciseActionButtons();
  renderFlowAuthoringControls();
  renderPanelMode();
}

function getSelectedFlowPackTemplateId() {
  return (flowPackTemplateEl?.value || "").trim() || null;
}

function getSelectedFlowPackTemplate() {
  return ExerciseLibrary.getPackTemplateById(getSelectedFlowPackTemplateId());
}

function getSelectedFlowStepTemplateId(packTemplate = getSelectedFlowPackTemplate()) {
  if (!packTemplate) return null;
  const requestedId = (flowStepTemplateEl?.value || "").trim() || null;
  const exact = requestedId ? ExerciseLibrary.getStepTemplateForPack(packTemplate, requestedId) : null;
  if (exact) return exact.id;
  return ExerciseLibrary.listStepTemplatesForPack(packTemplate)[0]?.id || null;
}

function getSelectedFlowStepTemplate(packTemplate = getSelectedFlowPackTemplate()) {
  const stepId = getSelectedFlowStepTemplateId(packTemplate);
  return stepId ? ExerciseLibrary.getStepTemplateForPack(packTemplate, stepId) : null;
}

function getSelectedFlowRunProfileId(packTemplate = getSelectedFlowPackTemplate(), stepTemplate = getSelectedFlowStepTemplate(packTemplate)) {
  if (!packTemplate) return null;
  const requestedId = (flowRunProfileEl?.value || "").trim() || null;
  const exact = requestedId ? ExerciseLibrary.getRunProfileById(requestedId) : null;
  if (exact && exact.packTemplateId === packTemplate.id && (!stepTemplate || exact.stepTemplateId === stepTemplate.id)) {
    return exact.id;
  }
  return ExerciseLibrary.listRunProfilesForPack(packTemplate, { stepTemplateId: stepTemplate?.id || null })[0]?.id || null;
}

function getSelectedFlowRunProfile(packTemplate = getSelectedFlowPackTemplate(), stepTemplate = getSelectedFlowStepTemplate(packTemplate)) {
  const profileId = getSelectedFlowRunProfileId(packTemplate, stepTemplate);
  return profileId ? ExerciseLibrary.getRunProfileById(profileId) : null;
}

function renderFlowPackTemplatePicker() {
  if (!flowPackTemplateEl) return;
  const selectedId = getSelectedFlowPackTemplateId();
  const templates = ExerciseLibrary.listPackTemplates();

  flowPackTemplateEl.textContent = "";
  for (const template of templates) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.label;
    option.selected = template.id === selectedId || (!selectedId && templates[0]?.id === template.id);
    flowPackTemplateEl.appendChild(option);
  }
  flowPackTemplateEl.disabled = state.panelMode !== "admin" || templates.length === 0;
}

function renderFlowStepTemplatePicker() {
  if (!flowStepTemplateEl) return;
  const packTemplate = getSelectedFlowPackTemplate();
  const selectedStepId = getSelectedFlowStepTemplateId(packTemplate);
  const steps = ExerciseLibrary.listStepTemplatesForPack(packTemplate);

  flowStepTemplateEl.textContent = "";
  if (!steps.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine Step Templates";
    flowStepTemplateEl.appendChild(option);
    flowStepTemplateEl.disabled = true;
    return;
  }

  for (const step of steps) {
    const option = document.createElement("option");
    option.value = step.id;
    option.textContent = step.label;
    option.selected = step.id === selectedStepId;
    flowStepTemplateEl.appendChild(option);
  }
  flowStepTemplateEl.disabled = state.panelMode !== "admin";
}

function renderFlowRunProfilePicker() {
  if (!flowRunProfileEl) return;
  const packTemplate = getSelectedFlowPackTemplate();
  const stepTemplate = getSelectedFlowStepTemplate(packTemplate);
  const selectedProfileId = getSelectedFlowRunProfileId(packTemplate, stepTemplate);
  const profiles = ExerciseLibrary.listRunProfilesForPack(packTemplate, { stepTemplateId: stepTemplate?.id || null });

  flowRunProfileEl.textContent = "";
  if (!profiles.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Keine Run Profiles";
    flowRunProfileEl.appendChild(option);
    flowRunProfileEl.disabled = true;
    return;
  }

  for (const profile of profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.label;
    option.selected = profile.id === selectedProfileId;
    flowRunProfileEl.appendChild(option);
  }
  flowRunProfileEl.disabled = state.panelMode !== "admin";
}

function buildFlowControlLabelSourceKey() {
  const packId = getSelectedFlowPackTemplateId() || "";
  const stepId = getSelectedFlowStepTemplateId() || "";
  const runProfileId = getSelectedFlowRunProfileId() || "";
  return [packId, stepId, runProfileId].join("::");
}

function syncFlowControlLabelFromRunProfile({ force = false } = {}) {
  const runProfile = getSelectedFlowRunProfile();
  if (!flowControlLabelEl || !runProfile) return;

  const nextLabel = (runProfile.label || "").trim();
  const currentText = (flowControlLabelEl.value || "").trim();
  const autoText = (flowControlLabelEl.dataset.autoLabel || state.lastAutoFlowControlLabel || "").trim();
  const sourceKey = buildFlowControlLabelSourceKey();
  const previousSourceKey = (flowControlLabelEl.dataset.autoSourceKey || "").trim();
  const isManual = flowControlLabelEl.dataset.manualLabel === "1" || (!!state.flowControlLabelDirty && currentText !== autoText);
  const mayOverwrite = !currentText || !isManual || currentText === autoText;

  if (mayOverwrite && currentText !== nextLabel) {
    flowControlLabelEl.value = nextLabel;
  }

  if (mayOverwrite || force || previousSourceKey !== sourceKey) {
    flowControlLabelEl.dataset.autoLabel = nextLabel;
    flowControlLabelEl.dataset.autoSourceKey = sourceKey;
    flowControlLabelEl.dataset.manualLabel = mayOverwrite ? "0" : (isManual ? "1" : "0");
    state.lastAutoFlowControlLabel = nextLabel;
    state.flowControlLabelDirty = flowControlLabelEl.dataset.manualLabel === "1";
  }
}

function updateFlowControlLabelDirtyState() {
  if (!flowControlLabelEl) return;
  const currentText = (flowControlLabelEl.value || "").trim();
  const autoText = (flowControlLabelEl.dataset.autoLabel || state.lastAutoFlowControlLabel || "").trim();
  const manual = !!currentText && currentText !== autoText;
  flowControlLabelEl.dataset.manualLabel = manual ? "1" : "0";
  state.flowControlLabelDirty = manual;
}

function renderFlowAuthoringStatus() {
  if (!flowAuthoringStatusEl) return;
  const packTemplate = getSelectedFlowPackTemplate();
  const stepTemplate = getSelectedFlowStepTemplate(packTemplate);
  const runProfile = getSelectedFlowRunProfile(packTemplate, stepTemplate);
  const selectedLabels = getInstanceLabelsFromIds(state.lastCanvasSelectionInstanceIds || []);
  const lines = [
    "Board Flows: " + state.boardFlowsById.size,
    "Pack Template: " + (packTemplate?.label || "keins"),
    "Step Template: " + (stepTemplate?.label || "keins"),
    "Run Profile: " + (runProfile?.label || "keins"),
    "Selektierte Canvas: " + (selectedLabels.join(", ") || "keine"),
    "Scope-Vorgabe: " + ((flowScopeTypeEl?.value || runProfile?.defaultScopeType || "fixed_instances"))
  ];
  if (runProfile?.summary) lines.push("Profilwirkung: " + runProfile.summary);
  if (runProfile?.uiHint) lines.push("Admin-Hinweis: " + runProfile.uiHint);
  flowAuthoringStatusEl.textContent = lines.join("\n");
}

function renderFlowAuthoringControls({ forceLabelSync = false } = {}) {
  renderFlowPackTemplatePicker();
  renderFlowStepTemplatePicker();
  renderFlowRunProfilePicker();
  syncFlowControlLabelFromRunProfile({ force: forceLabelSync });
  renderFlowAuthoringStatus();
}

async function loadBoardFlows() {
  const flows = await Board.listBoardFlows(log);
  state.boardFlowsById = new Map(flows.map((flow) => [flow.id, flow]));
  renderFlowAuthoringStatus();
}

function buildFlowId(packTemplateId, anchorInstanceId) {
  const base = [packTemplateId || "flow", anchorInstanceId || "anchor", Date.now().toString(36), Math.random().toString(36).slice(2, 7)].join(":");
  return base;
}

function buildFlowControlId(stepId, runProfileId) {
  return [stepId || "step", runProfileId || "profile", Date.now().toString(36), Math.random().toString(36).slice(2, 7)].join(":");
}

function getExistingBoardFlowForPack(packTemplateId, anchorInstanceId) {
  for (const flow of state.boardFlowsById.values()) {
    if (flow?.packTemplateId === packTemplateId && flow?.anchorInstanceId === anchorInstanceId) {
      return flow;
    }
  }
  return null;
}

async function saveBoardFlowAndCache(flow) {
  const saved = await Board.saveBoardFlow(flow, log);
  state.boardFlowsById.set(saved.id, saved);
  renderFlowAuthoringStatus();
  return saved;
}

async function findOrCreateBoardFlowForPack(packTemplateId, anchorInstanceId) {
  const existing = getExistingBoardFlowForPack(packTemplateId, anchorInstanceId);
  if (existing) return existing;

  const packTemplate = ExerciseLibrary.getPackTemplateById(packTemplateId);
  if (!packTemplate) {
    throw new Error("Pack Template konnte nicht gefunden werden: " + String(packTemplateId || "(leer)"));
  }

  const anchorLabel = getInstanceLabelByInternalId(anchorInstanceId) || anchorInstanceId || "Board";
  const flow = BoardFlow.createBoardFlowFromPackTemplate(packTemplate, {
    id: buildFlowId(packTemplate.id, anchorInstanceId),
    label: packTemplate.label + " – " + anchorLabel,
    anchorInstanceId
  });
  return await saveBoardFlowAndCache(flow);
}

async function resolveAuthoringScopeFromCurrentSelection(packTemplate, requestedScopeType) {
  const selectedInstanceIds = await refreshSelectionStatusFromBoard();
  const selected = Array.from(new Set((selectedInstanceIds || []).filter((id) => state.instancesById.has(id))));
  if (!selected.length) {
    throw new Error("Bitte mindestens eine Canvas-Instanz auf dem Board selektieren.");
  }

  const allowedCanvasTypeIds = new Set((packTemplate?.allowedCanvasTypeIds || []).filter(Boolean));
  const allowedSelected = selected.filter((instanceId) => {
    const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
    return !allowedCanvasTypeIds.size || (canvasTypeId && allowedCanvasTypeIds.has(canvasTypeId));
  });

  if (!allowedSelected.length) {
    throw new Error("Die aktuelle Selektion enthält keine zum Pack Template passende Canvas-Instanz.");
  }

  const scopeType = requestedScopeType === "global" ? "global" : "fixed_instances";
  return {
    anchorInstanceId: allowedSelected[0],
    scope: scopeType === "global"
      ? { type: "global" }
      : { type: "fixed_instances", instanceIds: allowedSelected }
  };
}

async function createFlowControlFromAdmin() {
  const packTemplate = getSelectedFlowPackTemplate();
  const stepTemplate = getSelectedFlowStepTemplate(packTemplate);
  const runProfile = getSelectedFlowRunProfile(packTemplate, stepTemplate);

  if (!packTemplate || !stepTemplate || !runProfile) {
    log("Board Flow: Bitte Pack Template, Step Template und Run Profile wählen.");
    return;
  }

  try {
    const { anchorInstanceId, scope } = await resolveAuthoringScopeFromCurrentSelection(packTemplate, flowScopeTypeEl?.value || runProfile.defaultScopeType);
    let flow = await findOrCreateBoardFlowForPack(packTemplate.id, anchorInstanceId);

    const existingControls = BoardFlow.listFlowControlsForStep(flow, stepTemplate.id).filter((control) => control.anchorInstanceId === anchorInstanceId);
    const position = await Board.computeSuggestedFlowControlPosition(state.instancesById.get(anchorInstanceId), { offsetIndex: existingControls.length }, log);
    const label = ((flowControlLabelEl?.value || "").trim()) || runProfile.label || "Flow Control";
    const shape = await Board.createFlowControlShape({
      label,
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      frameId: state.instancesById.get(anchorInstanceId)?.actionItems?.frameId || null
    }, log);

    const controlId = buildFlowControlId(stepTemplate.id, runProfile.id);
    const control = BoardFlow.createFlowControlRecord({
      id: controlId,
      itemId: shape.id,
      label,
      runProfileId: runProfile.id,
      stepId: stepTemplate.id,
      anchorInstanceId,
      scope,
      state: stepTemplate.id === flow.runtime?.currentStepId ? "active" : "disabled"
    });

    flow = BoardFlow.upsertFlowControl(flow, control);
    flow = await saveBoardFlowAndCache(flow);
    await Board.writeFlowControlMeta(shape, {
      flowId: flow.id,
      controlId
    }, log);

    log("Board Flow Control erzeugt: '" + label + "' für " + (getInstanceLabelByInternalId(anchorInstanceId) || anchorInstanceId) + " | Scope=" + control.scope.type + ".");
    renderFlowAuthoringControls();
  } catch (e) {
    log("Board Flow: Control konnte nicht erzeugt werden – " + e.message);
  }
}

async function setCurrentFlowStepFromAdmin() {
  const packTemplate = getSelectedFlowPackTemplate();
  const stepTemplate = getSelectedFlowStepTemplate(packTemplate);
  if (!packTemplate || !stepTemplate) {
    log("Board Flow: Bitte Pack Template und Step Template wählen.");
    return;
  }

  try {
    const { anchorInstanceId } = await resolveAuthoringScopeFromCurrentSelection(packTemplate, "fixed_instances");
    let flow = await findOrCreateBoardFlowForPack(packTemplate.id, anchorInstanceId);
    flow = BoardFlow.setFlowCurrentStep(flow, stepTemplate.id);
    flow = await saveBoardFlowAndCache(flow);
    log("Board Flow: Aktiver Schritt gesetzt auf '" + (stepTemplate.label || stepTemplate.id) + "' für " + (flow.label || flow.id) + ".");
    renderFlowAuthoringControls();
  } catch (e) {
    log("Board Flow: Schritt konnte nicht gesetzt werden – " + e.message);
  }
}

async function resolveSelectedFlowControl(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length !== 1) return null;

  const item = list[0];
  const meta = await Board.readFlowControlMeta(item, log);
  if (!meta) return null;

  const flow = state.boardFlowsById.get(meta.flowId) || (await Board.loadBoardFlow(meta.flowId, log));
  if (!flow) return null;
  state.boardFlowsById.set(flow.id, flow);

  const control = BoardFlow.findFlowControlByItemId(flow, item.id) || flow.controls?.[meta.controlId] || null;
  if (!control) return null;

  return { item, meta, flow, control };
}

function resolveTargetInstanceIdsFromFlowScope(scope, packTemplate = null) {
  const normalizedScope = BoardFlow.normalizeFlowScope(scope);
  if (normalizedScope.type === "fixed_instances") {
    return normalizedScope.instanceIds.filter((instanceId) => state.instancesById.has(instanceId));
  }

  const allowedCanvasTypes = new Set((packTemplate?.allowedCanvasTypeIds || []).filter(Boolean));
  return Array.from(state.instancesById.keys()).filter((instanceId) => {
    if (!state.instancesById.has(instanceId)) return false;
    if (!allowedCanvasTypes.size) return true;
    const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
    return !!canvasTypeId && allowedCanvasTypes.has(canvasTypeId);
  });
}

function buildPromptRuntimeFromFlow(flow, control, runProfile, flowStep, packTemplate, targetInstanceIds) {
  const promptModules = ExerciseLibrary.getPromptModulesByIds(runProfile?.moduleIds || []);
  const targetInstanceLabels = getInstanceLabelsFromIds(targetInstanceIds);
  return {
    packTemplate,
    flowStep,
    runProfile,
    promptModules,
    controlContext: {
      flowId: flow?.id || null,
      controlId: control?.id || null,
      controlLabel: control?.label || null,
      scopeType: control?.scope?.type || null,
      targetInstanceLabels
    }
  };
}

async function runAgentFromFlowControl(flow, control, selectedItem) {
  const runProfile = ExerciseLibrary.getRunProfileById(control?.runProfileId);
  const packTemplate = ExerciseLibrary.getPackTemplateById(flow?.packTemplateId);
  const flowStep = BoardFlow.getFlowStep(flow, control?.stepId);

  if (!runProfile || !packTemplate || !flowStep) {
    const msg = "Board Flow: Control ist unvollständig konfiguriert.";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return;
  }

  if (control.state !== "active") {
    const msg = "Board Flow: Control '" + (control.label || control.id) + "' ist derzeit nicht aktiv.";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "warning" });
    return;
  }

  if (!getApiKey()) {
    const msg = "Board Flow: Kein OpenAI API Key verfügbar.";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return;
  }

  const targetInstanceIds = resolveTargetInstanceIdsFromFlowScope(control.scope, packTemplate);
  const targetInstanceLabels = getInstanceLabelsFromIds(targetInstanceIds);
  const triggerContext = ExerciseEngine.resolveTriggerContextForRunProfile({
    runProfile,
    source: "user",
    selectionCount: targetInstanceIds.length,
    targetInstanceLabels,
    boardConfig: state.boardConfig
  });

  if (!triggerContext.valid) {
    const msg = "Board Flow: " + (triggerContext.reason || "Run Profile ist im aktuellen Kontext nicht ausführbar.");
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "warning" });
    return;
  }

  const promptRuntimeOverride = buildPromptRuntimeFromFlow(flow, control, runProfile, flowStep, packTemplate, targetInstanceIds);
  const sourceLabel = control.label || runProfile.label || "Flow Control";

  const nextFlow = {
    ...flow,
    runtime: {
      ...(flow.runtime || {}),
      lastTriggeredControlId: control.id,
      lastTriggeredAt: new Date().toISOString()
    },
    controls: {
      ...(flow.controls || {}),
      [control.id]: {
        ...control,
        lastTriggeredAt: new Date().toISOString()
      }
    }
  };
  await saveBoardFlowAndCache(nextFlow);

  log("Board Flow Trigger: '" + sourceLabel + "' → " + runProfile.triggerKey + " | Ziele: " + (targetInstanceLabels.join(", ") || "(keine)"));
  if (IS_HEADLESS) {
    await notifyRuntime("AI Flow startet: " + sourceLabel, { level: "info" });
  }

  try {
    if (runProfile.triggerKey.startsWith("global.")) {
      await runGlobalAgent(null, getCurrentUserQuestion(), {
        triggerContext,
        sourceLabel,
        promptRuntimeOverride,
        forcedInstanceIds: targetInstanceIds,
        forceTargetSet: true,
        runMode: buildRunModeFromTriggerKey(runProfile.triggerKey),
        updateGlobalBaseline: false
      });
    } else {
      await runAgentForSelectedInstances(targetInstanceIds, {
        triggerContext,
        sourceLabel,
        promptRuntimeOverride,
        runMode: buildRunModeFromTriggerKey(runProfile.triggerKey),
        userText: getCurrentUserQuestion()
      });
    }
    if (IS_HEADLESS) {
      await notifyRuntime("AI Flow abgeschlossen: " + sourceLabel, { level: "info" });
    }
  } catch (error) {
    const msg = "Board Flow: Trigger '" + sourceLabel + "' fehlgeschlagen – " + (error?.message || String(error));
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    throw error;
  }
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
  const pack = normalizedPackId ? Exercises.getExercisePackById(normalizedPackId) : null;
  const packDefaults = Exercises.getPackDefaults(pack);

  normalizedBoardConfig = {
    ...normalizedBoardConfig,
    boardMode: normalizedPackId ? "exercise" : "generic",
    exercisePackId: normalizedPackId || null,
    feedbackFrameName: normalizedBoardConfig.feedbackFrameName || packDefaults.feedbackFrameName,
    feedbackChannelDefault: normalizedBoardConfig.feedbackChannelDefault || packDefaults.feedbackChannel,
    userMayChangePack: normalizedBoardConfig.userMayChangePack === true ? true : packDefaults.userMayChangePack,
    userMayChangeStep: normalizedBoardConfig.userMayChangeStep === true ? true : packDefaults.userMayChangeStep,
    appAdminPolicy: normalizedBoardConfig.appAdminPolicy || packDefaults.appAdminPolicy
  };

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
    defaultCanvasTypeId,
    ...buildBoardConfigPatchForPack(selectedPack)
  });

  const nextStepId = selectedPack
    ? (Exercises.getExerciseStep(selectedPack, state.exerciseRuntime?.currentStepId)?.id || Exercises.getDefaultStepId(selectedPack))
    : null;

  await persistExerciseRuntime({
    currentStepId: nextStepId,
    lastTriggerKey: null,
    lastTriggerSource: null,
    lastTriggerAt: null,
    recommendedNextTrigger: Exercises.getDefaultEnterTrigger(selectedPack, nextStepId) || null,
    recommendedNextStepId: null,
    advanceStepSuggested: false,
    recommendationReason: null
  });

  renderCanvasTypePicker();
  renderExerciseControls();

  log("Exercise Pack gesetzt: " + (selectedPack ? packLabelWithStep(selectedPack, nextStepId) : "keins (generischer Modus)"));
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
  const defaultEnterTrigger = Exercises.getDefaultEnterTrigger(pack, validStepId);

  await persistExerciseRuntime({
    currentStepId: validStepId,
    recommendedNextTrigger: defaultEnterTrigger || null,
    recommendedNextStepId: null,
    advanceStepSuggested: false,
    recommendationReason: defaultEnterTrigger
      ? "Dieser Schritt definiert einen Standard-Enter-Trigger."
      : null
  });
  renderExerciseControls();

  const step = Exercises.getExerciseStep(pack, validStepId);
  log("Exercise-Schritt gesetzt: " + (step?.label || validStepId || "(leer)"));
}

function buildRunModeFromTriggerKey(triggerKey) {
  const parsed = ExerciseEngine.parseTriggerKey(triggerKey);
  if (!parsed) return "exercise";
  return `exercise-${parsed.scope}-${parsed.intent}`;
}

function buildTriggerSourceLabel(triggerContext) {
  const parsed = triggerContext ? ExerciseEngine.parseTriggerKey(triggerContext.triggerKey) : null;
  if (!parsed) return "Exercise-Agent";

  const scopeLabel = parsed.scope === "global" ? "Global" : "Selection";
  const intentMap = {
    check: "Check",
    hint: "Hint",
    autocorrect: "Autocorrect",
    review: "Review",
    synthesize: "Synthesize",
    coach: "Coach",
    grade: "Grade"
  };
  const intentLabel = intentMap[parsed.intent] || parsed.intent;
  return `Exercise-${scopeLabel}-${intentLabel}`;
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

async function runExerciseTriggerRequest(request) {
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

  const source = ExerciseEngine.normalizeTriggerSource(request?.source || getCurrentTriggerSource());
  const triggerRequest = ExerciseEngine.buildTriggerRequest(request || {});
  if (!triggerRequest.triggerKey) {
    log("Exercise-Modus: Konnte keinen gültigen Trigger aus der Anfrage ableiten.");
    return;
  }

  const parsed = ExerciseEngine.parseTriggerKey(triggerRequest.triggerKey);
  if (!parsed) {
    log("Exercise-Modus: Trigger-Key ist ungültig: " + String(triggerRequest.triggerKey));
    return;
  }

  let targetInstanceIds = [];
  if (parsed.scope === "selection") {
    const selectedInstanceIds = await refreshSelectionStatusFromBoard();
    const allowedCanvasTypes = new Set(Exercises.getAllowedCanvasTypesForPack(pack));
    targetInstanceIds = selectedInstanceIds.filter((instanceId) => {
      const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
      return !allowedCanvasTypes.size || (canvasTypeId && allowedCanvasTypes.has(canvasTypeId));
    });
  } else if (parsed.scope === "global") {
    const allowedCanvasTypes = new Set(Exercises.getAllowedCanvasTypesForPack(pack));
    targetInstanceIds = Array.from(state.instancesById.keys()).filter((instanceId) => {
      const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
      return !allowedCanvasTypes.size || (canvasTypeId && allowedCanvasTypes.has(canvasTypeId));
    });
  }

  const targetInstanceLabels = targetInstanceIds
    .map((instanceId) => getInstanceLabelByInternalId(instanceId))
    .filter(Boolean);

  const triggerContext = ExerciseEngine.resolveTriggerContext({
    triggerKey: triggerRequest.triggerKey,
    source,
    pack,
    step: currentStep,
    selectionCount: targetInstanceIds.length,
    targetInstanceLabels,
    boardConfig: state.boardConfig
  });

  if (!triggerContext.valid) {
    log(buildTriggerSourceLabel(triggerContext) + ": " + (triggerContext.reason || "Trigger ist im aktuellen Kontext nicht ausführbar."));
    return;
  }

  if (parsed.scope === "selection") {
    await runAgentForSelectedInstances(targetInstanceIds, {
      userText: getCurrentUserQuestion(),
      runMode: buildRunModeFromTriggerKey(triggerContext.triggerKey),
      triggerContext,
      sourceLabel: buildTriggerSourceLabel(triggerContext)
    });
    return;
  }

  await runGlobalAgent(null, getCurrentUserQuestion(), {
    runMode: buildRunModeFromTriggerKey(triggerContext.triggerKey),
    triggerContext,
    sourceLabel: buildTriggerSourceLabel(triggerContext),
    forcedInstanceIds: targetInstanceIds,
    updateGlobalBaseline: false,
    forceTargetSet: true
  });
}

async function runExerciseCheck() {
  return await runExerciseTriggerRequest({ scope: "selection", intent: "check", source: getCurrentTriggerSource() });
}

async function runExerciseHint() {
  return await runExerciseTriggerRequest({ scope: "selection", intent: "hint", source: getCurrentTriggerSource() });
}

async function runExerciseAutocorrect() {
  return await runExerciseTriggerRequest({ scope: "selection", intent: "autocorrect", source: getCurrentTriggerSource() });
}

async function advanceExerciseStep() {
  const pack = getSelectedExercisePack();
  const currentStep = getCurrentExerciseStep(pack);

  if (!pack) {
    log("Nächster Schritt: Kein Exercise Pack aktiv.");
    return;
  }
  if (!currentStep) {
    log("Nächster Schritt: Kein aktiver Schritt gesetzt.");
    return;
  }

  const source = getCurrentTriggerSource();
  const transition = ExerciseEngine.resolveNextTransition({
    pack,
    step: currentStep,
    source,
    lastTriggerKey: state.exerciseRuntime?.lastTriggerKey,
    memoryStepStatus: getCurrentMemoryStepStatus(),
    recommendedNextStepId: state.exerciseRuntime?.recommendedNextStepId
  });

  if (!transition) {
    log("Nächster Schritt: Für den aktuellen Schritt ist kein gültiger Transition-Pfad freigegeben.");
    return;
  }

  const nextStep = Exercises.getExerciseStep(pack, transition.toStepId);
  if (!nextStep) {
    log("Nächster Schritt: Zielschritt konnte nicht gefunden werden.");
    return;
  }

  const defaultEnterTrigger = Exercises.getDefaultEnterTrigger(pack, nextStep.id);

  await persistExerciseRuntime({
    currentStepId: nextStep.id,
    recommendedNextTrigger: defaultEnterTrigger || null,
    recommendedNextStepId: null,
    advanceStepSuggested: false,
    recommendationReason: defaultEnterTrigger
      ? "Dieser Schritt definiert einen Standard-Enter-Trigger."
      : null
  });
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

    const button = document.createElement("button");
    button.type = "button";
    button.className = "canvas-option-button" + (entry.canvasTypeId === selectedCanvasTypeId ? " is-selected" : "") + (!isAllowed ? " is-disabled" : "");
    button.disabled = !isAllowed;
    button.setAttribute("aria-pressed", entry.canvasTypeId === selectedCanvasTypeId ? "true" : "false");
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      await syncDefaultCanvasTypeToBoardConfig(entry.canvasTypeId);
    });

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
    button.appendChild(thumb);
    button.appendChild(textWrap);
    canvasTypePickerEl.appendChild(button);
  }
}

// --------------------------------------------------------------------
// Init Panel Buttons
// --------------------------------------------------------------------
function initPanelButtons() {
  state.panelMode = loadPersistedPanelMode();
  applyRuntimeSettingsToUi();
  startPanelRuntimeBridge();
  renderCanvasTypePicker();
  renderExerciseControls();

  apiKeyEl?.addEventListener("input", () => {
    persistRuntimeSettingsFromUi();
  });
  apiKeyEl?.addEventListener("change", () => {
    persistRuntimeSettingsFromUi();
  });
  modelEl?.addEventListener("change", () => {
    persistRuntimeSettingsFromUi();
  });

  panelModeEl?.addEventListener("change", onPanelModeChange);
  exercisePackEl?.addEventListener("change", onExercisePackChange);
  exerciseStepEl?.addEventListener("change", onExerciseStepChange);
  flowPackTemplateEl?.addEventListener("change", () => renderFlowAuthoringControls({ forceLabelSync: true }));
  flowStepTemplateEl?.addEventListener("change", () => renderFlowAuthoringControls({ forceLabelSync: true }));
  flowRunProfileEl?.addEventListener("change", () => {
    syncFlowControlLabelFromRunProfile({ force: true });
    renderFlowAuthoringStatus();
  });
  flowScopeTypeEl?.addEventListener("change", renderFlowAuthoringStatus);
  flowControlLabelEl?.addEventListener("input", () => {
    updateFlowControlLabelDirtyState();
    renderFlowAuthoringStatus();
  });

  document.getElementById("btn-save-admin-override")?.addEventListener("click", saveAdminOverrideFromUi);
  document.getElementById("btn-clear-admin-override")?.addEventListener("click", clearAdminOverrideFromUi);

  btnExerciseCheckEl?.addEventListener("click", runExerciseCheck);
  btnExerciseHintEl?.addEventListener("click", runExerciseHint);
  btnExerciseAutocorrectEl?.addEventListener("click", runExerciseAutocorrect);
  btnExerciseReviewEl?.addEventListener("click", () => runExerciseTriggerRequest({ scope: "selection", intent: "review", source: getCurrentTriggerSource() }));
  btnExerciseCoachEl?.addEventListener("click", () => runExerciseTriggerRequest({ scope: "selection", intent: "coach", source: getCurrentTriggerSource() }));
  btnExerciseNextStepEl?.addEventListener("click", advanceExerciseStep);
  btnFlowCreateControlEl?.addEventListener("click", createFlowControlFromAdmin);
  btnFlowSetCurrentStepEl?.addEventListener("click", setCurrentFlowStepFromAdmin);

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
  window.dtRunExerciseReview = () => runExerciseTriggerRequest({ scope: "selection", intent: "review", source: getCurrentTriggerSource() });
  window.dtRunExerciseCoach = () => runExerciseTriggerRequest({ scope: "selection", intent: "coach", source: getCurrentTriggerSource() });
  window.dtRunExerciseTrigger = runExerciseTriggerRequest;
  window.dtAdvanceExerciseStep = advanceExerciseStep;
  window.dtCreateFlowControl = createFlowControlFromAdmin;
  window.dtSetFlowStep = setCurrentFlowStepFromAdmin;

  renderPanelMode();
}
if (!IS_HEADLESS) initPanelButtons();

// --------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------
(async function boot() {
  await Board.ensureMiroReady(log);
  log("Runtime-Kontext: " + RUNTIME_CONTEXT);
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
  await loadBoardFlows();
  renderFlowAuthoringControls({ forceLabelSync: true });

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
  triggerContext = null,
  baseSystemPrompt,
  involvedCanvasTypeIds = [],
  baseUserPayload,
  userQuestion,
  promptRuntimeOverride = null
}) {
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  return PromptComposer.composePrompt({
    baseSystemPrompt,
    runMode,
    triggerContext,
    userQuestion,
    baseUserPayload,
    involvedCanvasTypeIds,
    templateCatalog: DT_TEMPLATE_CATALOG,
    boardConfig: state.boardConfig,
    exercisePack: runtime?.packTemplate || getSelectedExercisePack(),
    currentStep: runtime?.flowStep || getCurrentExerciseStep(),
    packTemplate: runtime?.packTemplate || null,
    flowStep: runtime?.flowStep || null,
    runProfile: runtime?.runProfile || null,
    promptModules: runtime?.promptModules || [],
    controlContext: runtime?.controlContext || null,
    adminOverrideText: state.exerciseRuntime?.adminOverrideText || null
  });
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
  state.memoryLog = Memory.getRecentMemoryEntries(
    Memory.normalizeMemoryLog([
      ...(Array.isArray(state.memoryLog) ? state.memoryLog : []),
      appendedLogEntry || storedLogEntry
    ]),
    DT_MEMORY_RECENT_LOG_LIMIT
  );

  log(
    "Memory aktualisiert: " + state.memoryLog.length +
    " Einträge, stepStatus=" + (state.memoryState.stepStatus || "(leer)") + "."
  );
}

function buildFeedbackFallbackTitle(triggerContext, sourceLabel = "Feedback") {
  const parsed = triggerContext ? ExerciseEngine.parseTriggerKey(triggerContext.triggerKey) : null;
  if (!parsed) return sourceLabel;

  const intentMap = {
    check: "Check",
    hint: "Hinweis",
    autocorrect: "Autokorrektur",
    review: "Review",
    synthesize: "Synthese",
    coach: "Coach",
    grade: "Bewertung"
  };
  const scopeLabel = parsed.scope === "global" ? "Global" : "Selection";
  const intentLabel = intentMap[parsed.intent] || parsed.intent || sourceLabel;
  return `${intentLabel} · ${scopeLabel}`;
}

function normalizeAgentExerciseArtifacts(agentObj, triggerContext, sourceLabel = "Agent") {
  const fallbackSummary = pickFirstNonEmptyString(agentObj?.analysis, null);
  const feedback = ExerciseEngine.normalizeFeedbackBlock(agentObj?.feedback, {
    fallbackTitle: buildFeedbackFallbackTitle(triggerContext, sourceLabel),
    fallbackSummary
  });
  const recommendations = ExerciseEngine.normalizeRecommendationsBlock(agentObj?.recommendations);
  const evaluation = ExerciseEngine.normalizeEvaluationBlock(agentObj?.evaluation);

  if (triggerContext?.intent === "grade" && !evaluation) {
    log("WARNUNG: Grade-Trigger ohne evaluation im Agent-Output.");
  }

  return { feedback, recommendations, evaluation };
}

async function persistExerciseRuntimeAfterAgentRun({
  triggerContext = null,
  feedback = null,
  recommendations = null,
  evaluation = null,
  exercisePack = null,
  currentStep = null
} = {}) {
  if (!triggerContext) return null;

  const runtimePatch = {
    lastTriggerKey: triggerContext.triggerKey || null,
    lastTriggerSource: triggerContext.source || null,
    lastTriggerAt: new Date().toISOString(),
    recommendedNextTrigger: recommendations?.recommendedNextTrigger || null,
    recommendedNextStepId: recommendations?.recommendedNextStepId || null,
    advanceStepSuggested: recommendations?.advanceStepSuggested === true,
    recommendationReason: recommendations?.reason || null
  };

  let feedbackRenderResult = null;
  if (triggerContext.feedbackPolicy === "text" || triggerContext.feedbackPolicy === "both") {
    try {
      feedbackRenderResult = await Board.renderFeedbackTextForRun({
        boardConfig: state.boardConfig,
        runtime: state.exerciseRuntime,
        triggerContext,
        feedback,
        recommendations,
        evaluation,
        exercisePack,
        currentStep,
        log
      });
    } catch (e) {
      log("WARNUNG: Feedback-Text konnte nicht gerendert werden: " + e.message);
    }
  }

  if (feedbackRenderResult) {
    runtimePatch.feedbackTextCounter = feedbackRenderResult.counter;
    runtimePatch.lastFeedbackTextIds = Array.isArray(feedbackRenderResult.textItemIds)
      ? feedbackRenderResult.textItemIds.filter(Boolean)
      : [];
  }

  await persistExerciseRuntime(runtimePatch);
  renderExerciseControls();
  return feedbackRenderResult;
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
  renderFlowAuthoringStatus();

  return instanceIds;
}

async function refreshSelectionStatusFromBoard() {
  const selection = await Board.getSelection(log).catch(() => []);
  return await refreshSelectionStatusFromItems(selection || []);
}

async function executeSelectedFlowControl(controlSelection, items) {
  const now = Date.now();
  if (
    state.lastTriggeredFlowControlItemId === controlSelection.item.id &&
    now - Number(state.lastTriggeredFlowControlAt || 0) < 1200
  ) {
    return;
  }

  state.flowControlRunLock = true;
  state.lastTriggeredFlowControlItemId = controlSelection.item.id;
  state.lastTriggeredFlowControlAt = now;
  try {
    await runAgentFromFlowControl(controlSelection.flow, controlSelection.control, controlSelection.item);
  } finally {
    state.flowControlRunLock = false;
    await refreshSelectionStatusFromItems(items);
  }
}

async function onSelectionUpdate(event) {
  if (state.handlingSelection || state.flowControlRunLock) return;
  const items = event?.items || [];

  const controlSelection = await resolveSelectedFlowControl(items);
  if (controlSelection) {
    const headlessShouldRun = shouldHeadlessHandleFlowControls();
    const panelShouldRun = shouldPanelHandleFlowControls();

    if (headlessShouldRun || panelShouldRun) {
      await executeSelectedFlowControl(controlSelection, items);
    } else {
      await refreshSelectionStatusFromItems(items);
    }
    return;
  }

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

async function insertTemplateImage() {
  const selectedCanvasTypeId = getSelectedCanvasTypeId();
  const selectedCanvasType = getCanvasTypeEntry(selectedCanvasTypeId);
  const insertWidthPx = getInsertWidthPxForCanvasType(selectedCanvasTypeId, {
    getCanvasTypeEntry,
    fallbackWidthPx: TEMPLATE_INSERTION.defaultWidthPx
  });

  if (!selectedCanvasType?.imageUrl) {
    log("Fehler beim Einfügen des Canvas: Kein gültiger Canvas-Typ ausgewählt.");
    return;
  }

  log("Button: Canvas einfügen (" + selectedCanvasTypeId + ").");
  await Board.ensureMiroReady(log);

  try {
    const placement = await computeTemplateInsertPosition({
      canvasTypeId: selectedCanvasTypeId,
      insertWidthPx,
      ensureInstancesScanned,
      getViewport: getViewportSafe,
      instances: Array.from(state.instancesById.values()),
      computeTemplateGeometry: (instance, runLog) => Board.computeTemplateGeometry(instance, runLog),
      templateInsertion: TEMPLATE_INSERTION,
      canvasDefs: DT_CANVAS_DEFS,
      defaultTemplateId: TEMPLATE_ID,
      isFiniteNumber,
      log
    });

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
      userText: fullUserText
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

  const occupiedByRegion = Object.create(null);
  for (const region of Catalog.getBodyRegionDefs(instance.canvasTypeId || TEMPLATE_ID)) {
    occupiedByRegion[region.id] = buildOccupied(liveInst?.regions?.body?.[region.id]?.stickies);
  }

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
    return (rid && Object.prototype.hasOwnProperty.call(occupiedByRegion, rid)) ? rid : null;
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

      const region = Catalog.areaNameToRegion(action.targetArea, canvasTypeId);
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
      const region = Catalog.areaNameToRegion(areaName, canvasTypeId);
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
  const triggerContext = options.triggerContext || null;
  const promptRuntimeOverride = (options.promptRuntimeOverride && typeof options.promptRuntimeOverride === "object")
    ? options.promptRuntimeOverride
    : null;
  const runMode = pickFirstNonEmptyString(options.runMode, (triggerContext ? buildRunModeFromTriggerKey(triggerContext.triggerKey) : null), "selection");
  const sourceLabel = pickFirstNonEmptyString(options.sourceLabel, (triggerContext ? buildTriggerSourceLabel(triggerContext) : null), "Instanz-Agent");

  if (!apiKey) {
    const msg = "Bitte OpenAI API Key eingeben (Agent).";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
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
    if (!st?.classification || !instanceLabel) continue;

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
    hint: buildPayloadMappingHint({
      scopeLabel: "selektierten Instanzen",
      labelListKey: "selectedInstanceLabels"
    })
  };

  const composedPrompt = composePromptForRun({
    runMode,
    triggerContext,
    baseSystemPrompt: promptCfg.system,
    involvedCanvasTypeIds: getInvolvedCanvasTypeIdsFromInstanceIds(resolvedActiveIds),
    baseUserPayload,
    userQuestion: userText,
    promptRuntimeOverride
  });

  const exerciseInfo = composedPrompt.exerciseContext?.exercisePackLabel
    ? (" | Exercise: " + composedPrompt.exerciseContext.exercisePackLabel + " / " + (composedPrompt.exerciseContext.currentStepLabel || "kein Schritt"))
    : "";

  log(
    "Starte " + sourceLabel + " für selektierte Instanzen: " +
    resolvedActiveLabels.join(", ") +
    exerciseInfo +
    (triggerContext?.triggerKey ? (" | Trigger: " + triggerContext.triggerKey) : "") +
    " ..."
  );

  try {
    log("Sende " + sourceLabel + "-Request an OpenAI ...");
    const structuredResult = await OpenAI.callOpenAIAgentStructured({
      apiKey,
      model,
      systemPrompt: composedPrompt.systemPrompt,
      userText: JSON.stringify(composedPrompt.userPayload, null, 2)
    });

    if (structuredResult.refusal) {
      log(sourceLabel + ": Modell verweigert die Antwort: " + structuredResult.refusal);
      return;
    }

    const agentObj = structuredResult.parsed;
    if (!agentObj) {
      log(sourceLabel + ": Antwort ist kein valides strukturiertes JSON. Rohantwort:");
      log(structuredResult.outputText || "(keine output_text-Antwort)");
      return;
    }

    const { feedback, recommendations, evaluation } = normalizeAgentExerciseArtifacts(agentObj, triggerContext, sourceLabel);

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
      trigger: triggerContext?.triggerKey || "generic",
      targetInstanceLabels: resolvedActiveLabels,
      userRequest: userText
    }, actionResult);

    if (triggerContext) {
      const feedbackRenderResult = await persistExerciseRuntimeAfterAgentRun({
        triggerContext,
        feedback,
        recommendations,
        evaluation,
        exercisePack: promptRuntimeOverride?.packTemplate || getSelectedExercisePack(),
        currentStep: promptRuntimeOverride?.flowStep || getCurrentExerciseStep()
      });

      if (feedbackRenderResult?.textItemIds?.length) {
        log(sourceLabel + ": Feedback-Text erzeugt in Frame '" + (feedbackRenderResult.frameTitle || state.boardConfig?.feedbackFrameName || "AI Coach Output") + "' – Item(s): " + feedbackRenderResult.textItemIds.join(", ") + ".");
      }
    }

  } catch (e) {
    log("Exception beim " + sourceLabel + "-Run: " + e.message);
  }
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
async function runGlobalAgent(triggerInstanceId, userText, options = {}) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();
  await loadMemoryRuntimeState();

  const apiKey = getApiKey();
  const model = getModel();
  const finalUserText = (userText || "").trim() ? userText.trim() : getCurrentUserQuestion();
  const triggerContext = options.triggerContext || null;
  const promptRuntimeOverride = (options.promptRuntimeOverride && typeof options.promptRuntimeOverride === "object")
    ? options.promptRuntimeOverride
    : null;
  const sourceLabel = pickFirstNonEmptyString(options.sourceLabel, (triggerContext ? buildTriggerSourceLabel(triggerContext) : null), "Global Agent");
  const runMode = pickFirstNonEmptyString(options.runMode, (triggerContext ? buildRunModeFromTriggerKey(triggerContext.triggerKey) : null), "global");
  const updateGlobalBaseline = options.updateGlobalBaseline !== false;
  const forceTargetSet = options.forceTargetSet === true;
  const forcedInstanceIds = Array.from(new Set((options.forcedInstanceIds || []).filter((id) => state.instancesById.has(id))));

  if (!apiKey) {
    const msg = "Bitte OpenAI API Key eingeben (Global Agent).";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return;
  }

  log(
    "Starte globalen Agenten-Run, Trigger-Instanz: " +
    (getInstanceLabelByInternalId(triggerInstanceId) || triggerInstanceId || "(keine)") +
    (triggerContext?.triggerKey ? (" | Trigger: " + triggerContext.triggerKey) : "")
  );

  const { liveCatalog } = await refreshBoardState();
  const stateById = await computeInstanceStatesById(liveCatalog);

  const baseBoardCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "global",
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  let activeInstanceIds = [];
  if (forceTargetSet) {
    activeInstanceIds = forcedInstanceIds.slice();
  } else {
    activeInstanceIds = (baseBoardCatalog.instances || [])
      .filter((entry) => entry.isActive)
      .map((entry) => getInternalInstanceIdByLabel(entry.instanceLabel))
      .filter((id) => state.instancesById.has(id));
  }

  const activeInstanceLabels = getInstanceLabelsFromIds(activeInstanceIds);
  const forcedLabelSet = new Set(activeInstanceLabels);
  const boardCatalog = forceTargetSet
    ? {
        instances: (baseBoardCatalog.instances || []).map((entry) => ({
          ...entry,
          isActive: forcedLabelSet.has(entry.instanceLabel)
        }))
      }
    : baseBoardCatalog;

  if (forceTargetSet && !activeInstanceIds.length) {
    log(sourceLabel + ": Keine gültigen Ziel-Instanzen für den globalen Exercise-Lauf gefunden.");
    return;
  }

  const activeCanvasStates = Object.create(null);
  const activeInstanceChangesSinceLastAgent = Object.create(null);

  for (const id of activeInstanceIds) {
    const st = stateById[id];
    const instance = state.instancesById.get(id) || null;
    const instanceLabel = instance?.instanceLabel || null;
    if (!st?.classification || !instanceLabel) continue;

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
    hint: buildPayloadMappingHint({
      scopeLabel: "im aktuellen Lauf relevanten Instanzen",
      labelListKey: "activeInstanceLabels",
      mentionArea: true
    })
  };

  const composedPrompt = composePromptForRun({
    runMode,
    triggerContext,
    baseSystemPrompt: DT_GLOBAL_SYSTEM_PROMPT,
    involvedCanvasTypeIds: getInvolvedCanvasTypeIdsFromInstanceIds(activeInstanceIds),
    baseUserPayload,
    userQuestion: finalUserText,
    promptRuntimeOverride
  });

  const exerciseInfo = composedPrompt.exerciseContext?.exercisePackLabel
    ? (" | Exercise: " + composedPrompt.exerciseContext.exercisePackLabel + " / " + (composedPrompt.exerciseContext.currentStepLabel || "kein Schritt"))
    : "";
  log(sourceLabel + "-Kontext" + exerciseInfo + ". Ziel-Canvas: " + (activeInstanceLabels.join(", ") || "(keine)"));

  try {
    log("Sende " + sourceLabel + "-Request an OpenAI ...");
    const structuredResult = await OpenAI.callOpenAIAgentStructured({
      apiKey,
      model,
      systemPrompt: composedPrompt.systemPrompt,
      userText: JSON.stringify(composedPrompt.userPayload, null, 2)
    });

    if (structuredResult.refusal) {
      log(sourceLabel + ": Modell verweigert die Antwort: " + structuredResult.refusal);
      return;
    }

    const agentObj = structuredResult.parsed;
    if (!agentObj) {
      log(sourceLabel + ": Antwort ist kein valides strukturiertes JSON. Rohantwort:");
      log(structuredResult.outputText || "(keine output_text-Antwort)");
      return;
    }

    const { feedback, recommendations, evaluation } = normalizeAgentExerciseArtifacts(agentObj, triggerContext, sourceLabel);

    log(sourceLabel + " analysis:");
    log(agentObj.analysis || "(keine analysis)");

    const actionResult = Array.isArray(agentObj.actions) && agentObj.actions.length
      ? await applyResolvedAgentActions(agentObj.actions, {
          candidateInstanceIds: activeInstanceIds,
          triggerInstanceId,
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
      log(sourceLabel + " lieferte keine Actions.");
    }

    const { liveCatalog: refreshedLiveCatalog } = await refreshBoardState();
    const postActionStateById = await computeInstanceStatesById(refreshedLiveCatalog);
    const nowIso = new Date().toISOString();

    if (updateGlobalBaseline) {
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
      log(sourceLabel + ": Baseline aktualisiert (" + nowIso + ").");
    } else {
      for (const id of activeInstanceIds) {
        const inst = state.instancesById.get(id);
        if (!inst) continue;
        inst.lastAgentRunAt = nowIso;
        inst.lastChangedAt = nowIso;
      }
    }

    await persistMemoryAfterAgentRun(agentObj, {
      runMode,
      trigger: triggerContext?.triggerKey || "generic",
      targetInstanceLabels: activeInstanceLabels,
      userRequest: finalUserText
    }, actionResult);

    if (triggerContext) {
      const feedbackRenderResult = await persistExerciseRuntimeAfterAgentRun({
        triggerContext,
        feedback,
        recommendations,
        evaluation,
        exercisePack: promptRuntimeOverride?.packTemplate || getSelectedExercisePack(),
        currentStep: promptRuntimeOverride?.flowStep || getCurrentExerciseStep()
      });

      if (feedbackRenderResult?.textItemIds?.length) {
        log(sourceLabel + ": Feedback-Text erzeugt in Frame '" + (feedbackRenderResult.frameTitle || state.boardConfig?.feedbackFrameName || "AI Coach Output") + "' – Item(s): " + feedbackRenderResult.textItemIds.join(", ") + ".");
      }
    }

  } catch (e) {
    log("Exception beim globalen Agent-Run: " + e.message);
  }
}
