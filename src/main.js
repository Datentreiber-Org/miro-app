import {
  TEMPLATE_ID,
  DT_TEMPLATE_CATALOG,
  DT_CANVAS_DEFS,
  DT_PROMPT_CATALOG,
  DT_GLOBAL_SYSTEM_PROMPT,
  DT_MEMORY_RECENT_LOG_LIMIT,
  DT_RUN_STATE_STALE_AFTER_MS,
  DT_RUN_STATUS_LAYOUT,
  DT_QUESTION_SYSTEM_PROMPT,
  DT_CHECK_TAG_TITLE,
  DT_CHECK_TAG_COLOR,
  normalizeStickyColorToken,
  STICKY_LAYOUT
} from "./config.js?v=20260310-batch10-3b";

import { createLogger, stripHtml, extractUnderlinedText, isFiniteNumber } from "./utils.js?v=20260301-step11-hotfix2";
import { normalizeUiLanguage, t, getLocaleForLanguage } from "./i18n/index.js?v=20260310-batch92";

import * as Board from "./miro/board.js?v=20260310-batch10-3b";
import * as Catalog from "./domain/catalog.js?v=20260311-batch83fix1";
import * as OpenAI from "./ai/openai.js?v=20260310-batch10-3b";
import * as Memory from "./runtime/memory.js?v=20260301-step11-hotfix2";
import * as Exercises from "./exercises/registry.js?v=20260310-batch10-3b";
import * as ExerciseLibrary from "./exercises/library.js?v=20260310-batch10-3b";
import * as PromptComposer from "./prompt/composer.js?v=20260310-batch10-3b";
import * as ExerciseEngine from "./runtime/exercise-engine.js?v=20260310-batch10-3b";
import * as BoardFlow from "./runtime/board-flow.js?v=20260310-batch10-3b";
import * as PanelBridge from "./runtime/panel-bridge.js?v=20260310-batch10-2";
import { buildPayloadMappingHint } from "./app/payload-hints.js?v=20260305-batch06";
import { getInsertWidthPxForCanvasType, computeTemplateInsertPosition } from "./app/template-insertion.js?v=20260308-batch76";
import {
  pickFirstNonEmptyString,
  makeDirectedConnectorKey,
  makeUndirectedConnectorKey,
  normalizeAgentAction
} from "./agent/action-normalization.js?v=20260307-batch75";
import { createEmptyActionExecutionStats, mergeActionExecutionStats, summarizeAppliedActions } from "./agent/action-stats.js?v=20260305-batch1";

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
  agentRunLock: false,
  activeAgentRunLabel: null,
  activeAgentRunStartedAt: 0,
  lastTriggeredFlowControlItemId: null,
  lastTriggeredFlowControlAt: 0,
  flowControlLabelDirty: false,
  lastAutoFlowControlLabel: "",

  // UI state
  selectedCanvasTypeId: TEMPLATE_ID,
  panelMode: "admin",
  panelInteractionState: {
    currentStepId: null,
    selectedInstanceIds: [],
    hasPendingProposalForCurrentStep: false,
    pendingProposalInstanceIds: []
  },

  // Runtime lease / ownership
  runtimeIdentity: null,
  panelRuntimeBridgeLifecycleInstalled: false,

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
const boardLanguageEl = document.getElementById("board-language");
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
const flowStaticLayoutToggleEl = document.getElementById("flow-static-layout-toggle");
const flowAuthoringStatusEl = document.getElementById("flow-authoring-status");
const btnFlowCreateControlEl = document.getElementById("btn-flow-create-control");
const btnFlowSetCurrentStepEl = document.getElementById("btn-flow-set-current-step");
const btnFlowActivateSelectedControlEl = document.getElementById("btn-flow-activate-selected-control");
const btnFlowCompleteSelectedControlEl = document.getElementById("btn-flow-complete-selected-control");
const btnFlowResetSelectedControlEl = document.getElementById("btn-flow-reset-selected-control");
const exerciseActionHelpEl = document.getElementById("exercise-action-help");
const exercisePrimaryActionsTitleEl = document.getElementById("exercise-primary-actions-title");
const exercisePrimaryActionsEl = document.getElementById("exercise-primary-actions");
const exerciseSecondaryActionsTitleEl = document.getElementById("exercise-secondary-actions-title");
const exerciseSecondaryActionsEl = document.getElementById("exercise-secondary-actions");
const exerciseProposalTitleEl = document.getElementById("exercise-proposal-title");
const exerciseProposalActionsEl = document.getElementById("exercise-proposal-actions");
const btnExerciseNextStepEl = document.getElementById("btn-exercise-next-step");
const exerciseAdminTriggerEl = document.getElementById("exercise-admin-trigger");
const btnExerciseAdminTriggerRunEl = document.getElementById("btn-exercise-admin-trigger-run");
const exerciseAdminTriggerHelpEl = document.getElementById("exercise-admin-trigger-help");
const btnMemoryClearAdminEl = document.getElementById("btn-memory-clear-admin");
const RUNTIME_CONTEXT = window.__DT_RUNTIME_CONTEXT === "headless" ? "headless" : "panel";
const IS_HEADLESS = RUNTIME_CONTEXT === "headless";
const log = logEl
  ? createLogger(logEl)
  : function logHeadless(msg) {
      const text = (typeof msg === "string") ? msg : JSON.stringify(msg, null, 2);
      console.log("[DT][" + RUNTIME_CONTEXT + "] " + text);
    };

const DT_CLUSTER_SESSION_BRIDGE_KEY = "dt-cluster-session-v1::" + String(document.referrer || window.location.href || "default");
const DT_CLUSTER_CUSTOM_ACTION_EVENT = "cluster-stickies";
const DT_CLUSTER_CUSTOM_ACTION_UI = {
  label: {
    de: "Stickies clustern",
    en: "Cluster stickies"
  },
  description: {
    de: "Clustert ausgewählte Sticky Notes mit der Datentreiber-Logik.",
    en: "Cluster selected sticky notes with the Datentreiber logic."
  },
  icon: "chat-two"
};

(function initialLog() {
  if (logEl) {
    const lang = getCurrentDisplayLanguage();
    logEl.textContent =
      t("runtime.initial.loaded", lang, { time: formatLocaleTime(Date.now(), lang) }) +
      "\n" +
      t("runtime.initial.waitForMiro", lang);
  }
  console.log("[DT] main.js geladen");
})();

window.onerror = function (msg, src, line, col) {
  logRuntimeNotice("fatal", "JS-Fehler: " + msg + " @ " + line + ":" + col);
};

window.onunhandledrejection = function (event) {
  const reason = event?.reason;
  logRuntimeNotice("fatal", "Unhandled Promise Rejection: " + formatRuntimeErrorMessage(reason), reason?.stack || null);
};

function formatRuntimeErrorMessage(error) {
  if (!error) return "Unbekannter Fehler";
  if (typeof error === "string") return error;
  if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

function logRuntimeNotice(kind, message, details = null) {
  const normalizedKind = (typeof kind === "string" && kind.trim()) ? kind.trim() : "info";
  const severity = ["fatal", "invalid_json", "action_failed"].includes(normalizedKind)
    ? "FEHLER"
    : (["skipped_action", "run_locked", "model_refusal", "precondition", "stale_state_conflict"].includes(normalizedKind) ? "WARNUNG" : "INFO");

  log(severity + " [" + normalizedKind + "] " + message);
  if (details !== null && details !== undefined) {
    log(details);
  }
}

function buildRunFailureResult(errorType, message, extra = {}) {
  return {
    ok: false,
    errorType: errorType || "fatal",
    message: message || "",
    ...extra
  };
}

function buildRunSuccessResult(extra = {}) {
  return { ok: true, ...extra };
}

function formatRunFailure(runResult) {
  if (!runResult) return "Unbekannter Fehler";
  const parts = [];
  if (runResult.errorType) parts.push(String(runResult.errorType));
  if (runResult.message) parts.push(String(runResult.message));
  return parts.join(": ") || "Unbekannter Fehler";
}

function isStaticFlowControlLayoutEnabled() {
  return state.boardConfig?.staticFlowControlLayout !== false;
}

function getManagedAgentRunButtons() {
  const dynamicButtons = Array.from(document.querySelectorAll('[data-dt-agent-run="1"]'));
  return [
    ...dynamicButtons,
    btnExerciseAdminTriggerRunEl
  ].filter(Boolean);
}

function setManagedAgentRunButtonsDisabled(disabled) {
  for (const button of getManagedAgentRunButtons()) {
    if (!(button instanceof HTMLButtonElement)) continue;
    if (disabled) {
      button.dataset.dtRunLockPrevDisabled = button.disabled ? "1" : "0";
      button.disabled = true;
      continue;
    }

    const prevDisabled = button.dataset.dtRunLockPrevDisabled === "1";
    delete button.dataset.dtRunLockPrevDisabled;
    button.disabled = prevDisabled;
  }
}

function tryAcquireAgentRunLock(sourceLabel) {
  if (state.agentRunLock) {
    const activeLabel = state.activeAgentRunLabel || "anderer Agent-Run";
    logRuntimeNotice("run_locked", (sourceLabel || "Agent") + ": Ein Agent-Run läuft bereits (" + activeLabel + "). Neuer Start übersprungen.");
    return null;
  }

  state.agentRunLock = true;
  state.activeAgentRunLabel = sourceLabel || "Agent";
  state.activeAgentRunStartedAt = Date.now();
  setManagedAgentRunButtonsDisabled(true);

  return {
    label: state.activeAgentRunLabel,
    startedAt: state.activeAgentRunStartedAt
  };
}

function releaseAgentRunLock(lockToken) {
  if (!state.agentRunLock) return;
  if (lockToken?.startedAt && state.activeAgentRunStartedAt && lockToken.startedAt !== state.activeAgentRunStartedAt) {
    return;
  }

  state.agentRunLock = false;
  state.activeAgentRunLabel = null;
  state.activeAgentRunStartedAt = 0;
  setManagedAgentRunButtonsDisabled(false);
  renderRecommendationStatus();
  renderExerciseActionSurface();
  renderAdminTriggerPicker();
  void refreshExerciseInteractionSurface();
}

function buildBoardRunId() {
  return "run-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
}

function normalizeTargetInstanceIds(ids) {
  return Array.from(new Set((ids || []).filter((id) => state.instancesById.has(id))));
}

function isBoardRunStateStale(runState) {
  if (!runState || runState.status !== "running") return false;
  const startedAtMs = Date.parse(runState.startedAt || "");
  if (!Number.isFinite(startedAtMs)) return false;
  return (Date.now() - startedAtMs) > DT_RUN_STATE_STALE_AFTER_MS;
}

async function resolveCurrentRunActor() {
  try {
    const board = Board.getBoard();
    if (typeof board?.getUserInfo === "function") {
      const userInfo = await board.getUserInfo();
      const userId = (typeof userInfo?.id === "string" && userInfo.id.trim()) ? userInfo.id.trim() : null;
      const displayName = pickFirstNonEmptyString(userInfo?.name, userInfo?.displayName, userInfo?.userName);
      if (displayName && userId) return displayName + " (" + userId + ")";
      if (displayName) return displayName;
      if (userId) return userId;
    }
  } catch (_) {}

  return IS_HEADLESS ? "headless-runtime" : "panel-runtime";
}

function buildBusyIndicatorContent(sourceLabel) {
  const lang = getCurrentDisplayLanguage();
  return [t("busyIndicator.title", lang), String(sourceLabel || t("busyIndicator.defaultSource", lang))].filter(Boolean).join("\n");
}

async function removeRunStatusItems(itemIds) {
  const normalizedIds = Array.from(new Set((itemIds || []).filter(Boolean)));
  for (const itemId of normalizedIds) {
    try {
      await Board.removeItemById(itemId, log);
    } catch (_) {}
  }
}

async function createRunStatusItems(instanceIds, sourceLabel, runId) {
  const normalizedIds = normalizeTargetInstanceIds(instanceIds);
  if (!normalizedIds.length) return [];

  const board = Board.getBoard();
  if (!board?.createShape) return [];

  const createdIds = [];
  const content = buildBusyIndicatorContent(sourceLabel);

  for (const instanceId of normalizedIds) {
    const instance = state.instancesById.get(instanceId);
    if (!instance) continue;

    let geom = null;
    try {
      geom = await Board.computeTemplateGeometry(instance, log);
    } catch (_) {}
    if (!geom) continue;

    const shapeX = geom.x;
    const shapeY = geom.y - geom.height / 2 + DT_RUN_STATUS_LAYOUT.offsetFromCanvasTopPx;

    try {
      const shape = await board.createShape({
        content,
        shape: "round_rectangle",
        x: shapeX,
        y: shapeY,
        width: DT_RUN_STATUS_LAYOUT.widthPx,
        height: DT_RUN_STATUS_LAYOUT.heightPx,
        style: {
          fillColor: "#fef3c7",
          borderColor: "#d97706",
          borderWidth: 2,
          color: "#111827",
          fontSize: 14,
          textAlign: "center",
          textAlignVertical: "middle"
        }
      });

      if (shape?.id) createdIds.push(String(shape.id));
    } catch (e) {
      log("WARNUNG: Busy-Signal konnte für Instanz " + (instance.instanceLabel || instanceId) + " nicht erstellt werden: " + e.message);
    }
  }

  return createdIds;
}

function formatExistingBoardRunMessage(sourceLabel, runState) {
  const actor = runState?.actor || "unbekannter Actor";
  const startedAt = runState?.startedAt ? formatLocaleTime(runState.startedAt) : "unbekannt";
  return (sourceLabel || t("busyIndicator.defaultSource", getCurrentDisplayLanguage())) + ": Ein anderer AI-Run läuft bereits (Actor: " + actor + ", Start: " + startedAt + ").";
}

async function acquireBoardSoftLock({ sourceLabel, targetInstanceIds }) {
  const current = await Board.loadBoardRunState(log);
  if (current?.status === "running" && !isBoardRunStateStale(current)) {
    return { ok: false, current };
  }

  if (current?.status === "running" && isBoardRunStateStale(current)) {
    await removeRunStatusItems(current.statusItemIds || []);
    log("WARNUNG: Veralteter Board-Run-State wird ersetzt (runId=" + (current.runId || "(leer)") + ").");
  }

  const token = {
    runId: buildBoardRunId(),
    sourceLabel: sourceLabel || "Agent",
    startedAt: new Date().toISOString(),
    actor: await resolveCurrentRunActor(),
    targetInstanceIds: normalizeTargetInstanceIds(targetInstanceIds),
    statusItemIds: []
  };

  await Board.saveBoardRunState({
    runId: token.runId,
    status: "running",
    startedAt: token.startedAt,
    actor: token.actor,
    targetInstanceIds: token.targetInstanceIds,
    statusItemIds: token.statusItemIds,
    message: null,
    finishedAt: null
  }, log);

  const confirmed = await Board.loadBoardRunState(log);
  if (confirmed?.runId && confirmed.runId !== token.runId && confirmed.status === "running") {
    return { ok: false, current: confirmed };
  }

  return { ok: true, token };
}

async function syncBoardSoftLock(token, { targetInstanceIds = null, statusItemIds = null } = {}) {
  if (!token?.runId) return null;

  if (targetInstanceIds) token.targetInstanceIds = normalizeTargetInstanceIds(targetInstanceIds);
  if (statusItemIds) token.statusItemIds = Array.from(new Set((statusItemIds || []).filter(Boolean)));

  return await Board.saveBoardRunState({
    runId: token.runId,
    status: "running",
    startedAt: token.startedAt,
    actor: token.actor,
    targetInstanceIds: token.targetInstanceIds,
    statusItemIds: token.statusItemIds,
    message: null,
    finishedAt: null
  }, log);
}

async function finalizeBoardSoftLock(token, { status = "completed", message = null } = {}) {
  if (!token?.runId) return;

  await removeRunStatusItems(token.statusItemIds || []);
  token.statusItemIds = [];

  const current = await Board.loadBoardRunState(log);
  if (current?.runId && current.runId !== token.runId) return;

  await Board.saveBoardRunState({
    runId: token.runId,
    status,
    startedAt: token.startedAt,
    actor: token.actor,
    targetInstanceIds: token.targetInstanceIds,
    statusItemIds: [],
    message: message || null,
    finishedAt: new Date().toISOString()
  }, log);

  const notificationMessage = message || (status === "completed"
    ? (token.sourceLabel || "Agent") + ": abgeschlossen."
    : (token.sourceLabel || "Agent") + ": beendet.");

  const notificationLevel = status === "completed"
    ? "info"
    : ((status === "conflicted" || status === "aborted") ? "warning" : "error");

  await notifyRuntime(notificationMessage, { level: notificationLevel });
}

function buildSignatureSnapshot(stateById, instanceIds) {
  const snapshot = new Map();
  for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
    const stateEntry = stateById?.[instanceId] || null;
    snapshot.set(instanceId, stateEntry?.signature?.stateHash || null);
  }
  return snapshot;
}

function hasMutatingActions(actions) {
  return Array.isArray(actions) && actions.some((action) => {
    const normalized = normalizeAgentAction(action);
    return normalized && normalized.type !== "inform";
  });
}

function formatConflictMessage(sourceLabel, conflicts) {
  const labels = Array.from(new Set((conflicts || []).map((entry) => entry?.instanceLabel).filter(Boolean)));
  const suffix = labels.length ? (": " + labels.join(", ")) : ".";
  return (sourceLabel || "Agent") + ": Board-Zustand hat sich seit dem Prompt geändert. Action-Apply wird ohne Partial-Apply abgebrochen" + suffix;
}

async function performPreApplyConflictCheck(expectedSignatureSnapshot, sourceLabel) {
  const entries = Array.from(expectedSignatureSnapshot?.entries?.() || []);
  if (!entries.length) return { ok: true };

  await ensureInstancesScanned();
  const { liveCatalog } = await refreshBoardState();
  const currentStateById = await computeInstanceStatesById(liveCatalog);
  const conflicts = [];

  for (const [instanceId, expectedHash] of entries) {
    const currentState = currentStateById[instanceId] || null;
    const currentHash = currentState?.signature?.stateHash || null;
    if (!currentState) {
      conflicts.push({
        instanceId,
        instanceLabel: getInstanceLabelByInternalId(instanceId) || instanceId,
        expectedHash,
        currentHash: null,
        reason: "missing_instance"
      });
      continue;
    }

    if (currentHash !== expectedHash) {
      conflicts.push({
        instanceId,
        instanceLabel: getInstanceLabelByInternalId(instanceId) || instanceId,
        expectedHash,
        currentHash,
        reason: "signature_changed"
      });
    }
  }

  if (conflicts.length) {
    return {
      ok: false,
      message: formatConflictMessage(sourceLabel, conflicts),
      conflicts
    };
  }

  return { ok: true, currentStateById };
}

// --------------------------------------------------------------------
// UI helpers
// --------------------------------------------------------------------
const PANEL_MODE_STORAGE_KEY = "dt-panel-mode-v1";

function normalizePanelMode(_value) {
  return "admin";
}

function loadPersistedPanelMode() {
  return "admin";
}

function persistPanelMode(_mode) {
  try {
    window.localStorage?.setItem(PANEL_MODE_STORAGE_KEY, "admin");
  } catch (_) {}
}

function setPanelMode(_mode, { persist = true } = {}) {
  state.panelMode = "admin";
  if (persist) persistPanelMode("admin");
  renderPanelMode();
}

function setElementHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle("hidden", !!hidden);
}

function getCurrentDisplayLanguage() {
  return normalizeUiLanguage(state.boardConfig?.displayLanguage || boardLanguageEl?.value || "de");
}

function getCurrentLocale() {
  return getLocaleForLanguage(getCurrentDisplayLanguage());
}

function formatLocaleTime(value, lang = getCurrentDisplayLanguage()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || "");
  return date.toLocaleTimeString(getLocaleForLanguage(lang));
}

function formatLocaleDateTime(value, lang = getCurrentDisplayLanguage()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value || "");
  return date.toLocaleString(getLocaleForLanguage(lang));
}

function translateTextKeyOrFallback(key, fallback, lang = getCurrentDisplayLanguage(), vars = {}) {
  const translated = t(key, lang, vars);
  return translated === key ? (fallback || key) : translated;
}

function getBoardModeLabel(mode = getCurrentBoardMode(), lang = getCurrentDisplayLanguage()) {
  return t("mode." + (mode === "exercise" ? "exercise" : "generic"), lang);
}

function getCanvasTypeDisplayName(canvasTypeId, fallback = null, lang = getCurrentDisplayLanguage()) {
  const key = "canvasType." + String(canvasTypeId || "").trim() + ".name";
  const fallbackText = (typeof fallback === "string" && fallback.trim()) ? fallback.trim() : (canvasTypeId || "");
  return translateTextKeyOrFallback(key, fallbackText, lang);
}


function applyStaticUiLanguage(lang = getCurrentDisplayLanguage()) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalizeUiLanguage(lang);
    document.title = t("panel.documentTitle", lang);
  }

  for (const el of Array.from(document.querySelectorAll("[data-i18n]"))) {
    const key = el.getAttribute("data-i18n");
    if (!key) continue;
    el.textContent = t(key, lang);
  }

  for (const el of Array.from(document.querySelectorAll("[data-i18n-placeholder]"))) {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) continue;
    el.setAttribute("placeholder", t(key, lang));
  }

  if (boardLanguageEl) {
    boardLanguageEl.value = normalizeUiLanguage(lang);
  }

}

async function syncBoardChromeLanguage(lang = getCurrentDisplayLanguage()) {
  for (const instance of state.instancesById.values()) {
    if (!Board.hasCompleteChatInterfaceShapeIds(instance?.chatInterface)) continue;
    try {
      await Board.syncChatPlaceholdersForLanguage(instance.chatInterface, lang, log);
    } catch (error) {
      log("WARNUNG: Chat-Placeholder konnten nicht synchronisiert werden: " + formatRuntimeErrorMessage(error));
    }
  }

  await syncAllChatApplyButtonsForCurrentStep();

  for (const [flowId, rawFlow] of state.boardFlowsById.entries()) {
    const normalizedFlow = await ensureBoardFlowHealthy(rawFlow, { persist: true, pruneMissingControls: true });
    state.boardFlowsById.set(flowId, normalizedFlow);
    const exercisePack = normalizedFlow.exercisePackId
      ? Exercises.getExercisePackById(normalizedFlow.exercisePackId, { lang })
      : null;
    const anchorLabel = getInstanceLabelByInternalId(normalizedFlow.anchorInstanceId) || normalizedFlow.anchorInstanceId || t("flow.status.none", lang);
    let changed = false;

    let nextFlow = {
      ...normalizedFlow,
      steps: (normalizedFlow.steps || []).map((step) => {
        const templateStep = packTemplate ? ExerciseLibrary.getStepTemplateForPack(packTemplate, step.id, { lang }) : null;
        let nextStep = step;
        if (step?.labelMode !== "custom" && templateStep?.label && step.label !== templateStep.label) {
          nextStep = { ...nextStep, label: templateStep.label };
          changed = true;
        }
        if (!step?.instructionOverride && templateStep?.instruction && step.instruction !== templateStep.instruction) {
          nextStep = { ...nextStep, instruction: templateStep.instruction };
          changed = true;
        }
        return nextStep;
      }),
      controls: Object.fromEntries(Object.entries(normalizedFlow.controls || {}).map(([controlId, control]) => {
        const endpoint = control?.endpointId ? ExerciseLibrary.getEndpointById(control.endpointId, { lang }) : null;
        const autoLabel = pickFirstNonEmptyString(endpoint?.label, t("flow.defaultControlLabel", lang));
        if (control?.labelMode !== "custom" && autoLabel && control.label !== autoLabel) {
          changed = true;
          return [controlId, { ...control, label: autoLabel }];
        }
        return [controlId, control];
      }))
    };

    if (normalizedFlow.labelMode !== "custom") {
      const autoFlowLabel = [exercisePack?.label || normalizedFlow.exercisePackId || null, anchorLabel].filter(Boolean).join(" – ");
      if (autoFlowLabel && nextFlow.label !== autoFlowLabel) {
        nextFlow = { ...nextFlow, label: autoFlowLabel };
        changed = true;
      }
    }

    if (changed) {
      nextFlow = await Board.saveBoardFlow({
        ...nextFlow,
        updatedAt: new Date().toISOString()
      }, log);
      state.boardFlowsById.set(flowId, nextFlow);
    }

    await syncBoardFlowVisuals(nextFlow, { reflow: false });
  }
}

async function applyBoardLanguage(nextLang, { syncBoardChrome = false } = {}) {
  const normalizedLang = normalizeUiLanguage(nextLang);
  if (state.boardConfig?.displayLanguage !== normalizedLang) {
    await persistBoardConfig({ displayLanguage: normalizedLang });
  } else if (boardLanguageEl && boardLanguageEl.value !== normalizedLang) {
    boardLanguageEl.value = normalizedLang;
  }

  applyStaticUiLanguage(normalizedLang);
  renderCanvasTypePicker();
  renderExerciseControls();
  if (!IS_HEADLESS) {
    await refreshSelectionStatusFromBoard();
  }
  if (syncBoardChrome) {
    await syncBoardChromeLanguage(normalizedLang);
  }
}

function renderPanelMode() {
  state.panelMode = "admin";

  if (panelModeEl) {
    panelModeEl.value = "admin";
    panelModeEl.disabled = true;
  }

  setElementHidden(adminPanelEl, false);
  setElementHidden(userActionsPanelEl, true);

  if (panelModeStatusEl) {
    const lang = getCurrentDisplayLanguage();
    panelModeStatusEl.textContent = t("panel.mode.status.adminOnly", lang);
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

function buildRuntimeId() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return RUNTIME_CONTEXT + "-" + window.crypto.randomUUID();
    }
  } catch (_) {}

  return RUNTIME_CONTEXT + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function buildFallbackBoardScopeId() {
  const referrer = pickFirstNonEmptyString(document.referrer);
  if (referrer) return "referrer:" + encodeURIComponent(referrer);

  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return "location:" + encodeURIComponent(url.toString());
  } catch (_) {}

  const pathname = pickFirstNonEmptyString(window.location.pathname);
  if (pathname) return "location:" + encodeURIComponent(pathname);
  return "runtime:" + RUNTIME_CONTEXT;
}

async function ensureRuntimeIdentity() {
  if (state.runtimeIdentity?.boardScopeId && state.runtimeIdentity?.runtimeId) {
    return state.runtimeIdentity;
  }

  let boardScopeId = pickFirstNonEmptyString(state.runtimeIdentity?.boardScopeId);
  let runtimeId = pickFirstNonEmptyString(state.runtimeIdentity?.runtimeId);
  let claimedAtMs = Number(state.runtimeIdentity?.claimedAtMs || 0);

  if (!runtimeId) runtimeId = buildRuntimeId();
  if (!Number.isFinite(claimedAtMs) || claimedAtMs <= 0) claimedAtMs = Date.now();

  if (!boardScopeId) {
    try {
      const board = Board.getBoard();
      if (typeof board?.getInfo === "function") {
        const boardInfo = await board.getInfo();
        boardScopeId = pickFirstNonEmptyString(boardInfo?.id != null ? String(boardInfo.id) : null);
      }
    } catch (error) {
      log("WARNUNG: Board-ID konnte für die Runtime-Lease nicht geladen werden: " + formatRuntimeErrorMessage(error));
    }
  }

  if (!boardScopeId) {
    boardScopeId = buildFallbackBoardScopeId();
    log("WARNUNG: Runtime-Lease nutzt einen Fallback-Board-Scope, weil keine Board-ID verfügbar war.");
  }

  state.runtimeIdentity = {
    boardScopeId,
    runtimeId,
    ownerType: IS_HEADLESS ? "headless" : "panel",
    claimedAtMs
  };

  return state.runtimeIdentity;
}

function getRuntimeBoardScopeId() {
  return pickFirstNonEmptyString(state.runtimeIdentity?.boardScopeId);
}

function startPanelRuntimeBridge() {
  if (IS_HEADLESS) return null;

  const identity = state.runtimeIdentity || null;
  if (!identity?.boardScopeId || !identity?.runtimeId) return null;

  return PanelBridge.startPanelRuntimeLease({
    boardScopeId: identity.boardScopeId,
    runtimeId: identity.runtimeId,
    ownerType: identity.ownerType || "panel",
    claimedAtMs: identity.claimedAtMs
  });
}

function stopPanelRuntimeBridge() {
  if (IS_HEADLESS) return;

  const identity = state.runtimeIdentity || null;
  PanelBridge.stopPanelRuntimeLease({
    boardScopeId: identity?.boardScopeId || null,
    runtimeId: identity?.runtimeId || null
  });
}

function installPanelRuntimeBridgeLifecycle() {
  if (IS_HEADLESS || state.panelRuntimeBridgeLifecycleInstalled) return;

  state.panelRuntimeBridgeLifecycleInstalled = true;
  window.addEventListener("beforeunload", () => {
    stopPanelRuntimeBridge();
  }, { once: true });
}

function getSelectedExercisePackId() {
  return Exercises.normalizeExercisePackId(state.boardConfig?.exercisePackId);
}

function getSelectedExercisePack(options = {}) {
  const lang = normalizeUiLanguage(options.lang || getCurrentDisplayLanguage());
  return Exercises.getExercisePackById(getSelectedExercisePackId(), { lang });
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

function getCurrentExerciseStep(pack = getSelectedExercisePack(), options = {}) {
  const stepId = getCurrentExerciseStepId(pack);
  const lang = normalizeUiLanguage(options.lang || getCurrentDisplayLanguage());
  return pack && stepId ? Exercises.getExerciseStep(pack, stepId, { lang }) : null;
}

function getCurrentUserQuestion() {
  const text = getPanelUserText();
  if (text) return text;

  const currentStep = getCurrentExerciseStep();
  const visibleInstruction = (typeof currentStep?.visibleInstruction === "string")
    ? currentStep.visibleInstruction.trim()
    : "";

  return visibleInstruction || t("runtime.genericUserQuestion", getCurrentDisplayLanguage());
}


function getCurrentTriggerSource() {
  return "admin";
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

function normalizeClusterSessionBridgePayload(rawPayload) {
  const src = (rawPayload && typeof rawPayload === "object") ? rawPayload : {};
  const assignments = Array.isArray(src.assignments)
    ? src.assignments.map((entry) => {
        if (Array.isArray(entry)) return [String(entry[0] || "").trim(), typeof entry[1] === "string" ? entry[1].trim() : ""];
        if (entry && typeof entry === "object") return [String(entry.stickyId || "").trim(), typeof entry.clusterName === "string" ? entry.clusterName.trim() : ""];
        return ["", ""];
      }).filter(([stickyId, clusterName]) => !!stickyId && !!clusterName)
    : [];

  const counters = Array.isArray(src.counters)
    ? src.counters.map((entry) => {
        if (Array.isArray(entry)) return [String(entry[0] || "").trim(), Number(entry[1])];
        if (entry && typeof entry === "object") return [String(entry.instanceId || "").trim(), Number(entry.count)];
        return ["", Number.NaN];
      }).filter(([instanceId, count]) => !!instanceId && Number.isInteger(count) && count >= 0)
    : [];

  return {
    version: 1,
    updatedAt: (typeof src.updatedAt === "string" && src.updatedAt.trim()) ? src.updatedAt.trim() : null,
    assignments,
    counters
  };
}

function readClusterSessionBridgePayload() {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const rawValue = window.sessionStorage.getItem(DT_CLUSTER_SESSION_BRIDGE_KEY);
    if (!rawValue) return null;
    return normalizeClusterSessionBridgePayload(JSON.parse(rawValue));
  } catch (_) {
    return null;
  }
}

function restoreClusterSessionStateFromBridge() {
  const payload = readClusterSessionBridgePayload();
  if (!payload) return false;

  state.clusterAssignments = new Map(payload.assignments || []);
  state.clusterCounterByInstanceId = new Map(payload.counters || []);
  return true;
}

function persistClusterSessionStateToBridge() {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return false;
    const payload = normalizeClusterSessionBridgePayload({
      version: 1,
      updatedAt: new Date().toISOString(),
      assignments: Array.from(state.clusterAssignments.entries()),
      counters: Array.from(state.clusterCounterByInstanceId.entries())
    });
    window.sessionStorage.setItem(DT_CLUSTER_SESSION_BRIDGE_KEY, JSON.stringify(payload));
    return true;
  } catch (_) {
    return false;
  }
}

function bindClusterSessionBridge() {
  if (typeof window === "undefined" || window.__DT_CLUSTER_SESSION_BRIDGE_BOUND__) return;

  window.addEventListener("storage", (event) => {
    if (event?.key !== DT_CLUSTER_SESSION_BRIDGE_KEY) return;
    restoreClusterSessionStateFromBridge();
  });

  window.__DT_CLUSTER_SESSION_BRIDGE_BOUND__ = true;
}

async function registerHeadlessClusterCustomAction() {
  if (!IS_HEADLESS || window.__DT_CLUSTER_CUSTOM_ACTION_REGISTERED__) return;

  const board = Board.getBoard();
  if (!board?.ui?.on || !board?.experimental?.action?.register) {
    log("Hinweis: Miro Custom Actions sind in dieser Runtime nicht verfügbar.");
    return;
  }

  try {
    await board.ui.on(`custom:${DT_CLUSTER_CUSTOM_ACTION_EVENT}`, async (payload) => {
      const selectedItems = Array.isArray(payload)
        ? payload
        : (Array.isArray(payload?.items) ? payload.items : []);
      const stickyIds = selectedItems
        .filter((item) => item?.type === "sticky_note" && item?.id)
        .map((item) => item.id);

      if (!stickyIds.length) {
        const lang = getCurrentDisplayLanguage();
        const msg = lang === "de" ? "Keine Sticky Notes ausgewählt." : "No sticky notes selected.";
        log(msg);
        await notifyRuntime(msg, { level: "warning" });
        return;
      }

      const result = await clusterSelectionWithIds(stickyIds, null);
      if (!result?.ok) {
        const lang = getCurrentDisplayLanguage();
        const fallback = lang === "de" ? "Clustern fehlgeschlagen." : "Clustering failed.";
        await notifyRuntime(result?.message || fallback, { level: result?.warning ? "warning" : "error" });
        return;
      }

      const lang = getCurrentDisplayLanguage();
      const msg = lang === "de"
        ? `Cluster '${result.clusterName}' gesetzt (${result.count} Stickies).`
        : `Cluster '${result.clusterName}' set (${result.count} stickies).`;
      await notifyRuntime(msg, { level: "info" });
    });

    await board.experimental.action.register({
      event: DT_CLUSTER_CUSTOM_ACTION_EVENT,
      ui: {
        label: DT_CLUSTER_CUSTOM_ACTION_UI.label,
        icon: DT_CLUSTER_CUSTOM_ACTION_UI.icon,
        description: DT_CLUSTER_CUSTOM_ACTION_UI.description
      },
      scope: "local",
      selection: "multi",
      predicate: {
        type: "sticky_note"
      },
      contexts: {
        item: {}
      }
    });

    window.__DT_CLUSTER_CUSTOM_ACTION_REGISTERED__ = true;
    log("Custom Action registriert: Stickies clustern.");
  } catch (error) {
    log("Hinweis: Cluster-Kontextaktion konnte nicht registriert werden – " + formatRuntimeErrorMessage(error));
  }
}

function shouldHeadlessHandleFlowControls() {
  if (!IS_HEADLESS) return false;

  const boardScopeId = getRuntimeBoardScopeId();
  if (!boardScopeId) return true;
  return !PanelBridge.isBoardRuntimeLeaseFresh(boardScopeId);
}

function shouldPanelHandleFlowControls() {
  if (IS_HEADLESS) return false;

  const boardScopeId = getRuntimeBoardScopeId();
  const runtimeId = pickFirstNonEmptyString(state.runtimeIdentity?.runtimeId);
  if (!boardScopeId || !runtimeId) return false;

  return PanelBridge.isRuntimeLeaseOwner(boardScopeId, runtimeId);
}

function buildBoardConfigPatchForPack(pack) {
  const defaults = Exercises.getPackDefaults(pack);
  return {
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
  const lang = getCurrentDisplayLanguage();
  return Object.entries(DT_TEMPLATE_CATALOG || {}).map(([canvasTypeId, cfg]) => ({
    canvasTypeId,
    displayName: getCanvasTypeDisplayName(canvasTypeId, (typeof cfg?.displayName === "string" && cfg.displayName.trim()) ? cfg.displayName.trim() : canvasTypeId, lang),
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

async function ensureSystemCheckTagId() {
  const existingId = typeof state.boardConfig?.systemTagIds?.check === "string"
    ? state.boardConfig.systemTagIds.check.trim()
    : "";

  const tag = await Board.ensureBoardTag({
    title: DT_CHECK_TAG_TITLE,
    color: DT_CHECK_TAG_COLOR,
    preferredId: existingId || null
  }, log);

  const tagId = typeof tag?.id === "string" ? tag.id : null;
  if (!tagId) return null;

  if (existingId !== tagId) {
    await persistBoardConfig({
      systemTagIds: {
        ...(state.boardConfig?.systemTagIds || {}),
        check: tagId
      }
    });
  }

  return tagId;
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

  const lang = getCurrentDisplayLanguage();
  const selectedPackId = getSelectedExercisePackId() || "";
  const packs = Exercises.listExercisePacks({ lang });

  exercisePackEl.textContent = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = t("admin.exercisePack.none", lang);
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

  const lang = getCurrentDisplayLanguage();
  const pack = getSelectedExercisePack({ lang });
  const currentStepId = getCurrentExerciseStepId(pack);

  exerciseStepEl.textContent = "";

  if (!pack) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("admin.exerciseStep.none", lang);
    option.selected = true;
    exerciseStepEl.appendChild(option);
    exerciseStepEl.disabled = true;
    return;
  }

  const steps = Exercises.listExerciseSteps(pack, { lang });
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
  const lang = getCurrentDisplayLanguage();
  const pack = getSelectedExercisePack({ lang });
  const currentStep = getCurrentExerciseStep(pack, { lang });
  const selectedCanvasType = getCanvasTypeEntry(getSelectedCanvasTypeId());

  if (exerciseContextStatusEl) {
    const lines = [
      t("exercise.context.boardMode", lang, { value: getBoardModeLabel(getCurrentBoardMode(), lang) }),
      t("exercise.context.pack", lang, { value: pack ? pack.label : t("exercise.context.pack.none", lang) }),
      t("exercise.context.currentStep", lang, { value: currentStep?.label || t("exercise.context.currentStep.none", lang) }),
      t("exercise.context.canvasType", lang, { value: selectedCanvasType?.displayName || getSelectedCanvasTypeId() })
    ];
    exerciseContextStatusEl.textContent = lines.join("\n");
  }

  if (exerciseStepInstructionEl) {
    exerciseStepInstructionEl.textContent = currentStep?.visibleInstruction || t("exercise.instruction.none", lang);
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
  const lang = getCurrentDisplayLanguage();
  const step = pack ? Exercises.getExerciseStep(pack, stepId, { lang }) : null;
  if (!pack) return t("exercise.context.pack.none", lang);
  return step ? `${pack.label} / ${step.label}` : pack.label;
}

function getCurrentStepTransition(pack, currentStep) {
  const source = getCurrentTriggerSource();
  return pack && currentStep
    ? ExerciseEngine.resolveNextTransition({
        pack,
        step: currentStep,
        source,
        lastTriggerKey: state.exerciseRuntime?.lastTriggerKey,
        memoryStepStatus: getCurrentMemoryStepStatus()
      })
    : null;
}

function buildExerciseActionSurfaceModel() {
  const lang = getCurrentDisplayLanguage();
  const pack = getSelectedExercisePack({ lang });
  const currentStep = getCurrentExerciseStep(pack, { lang });
  const exercisePackId = pickFirstNonEmptyString(pack?.id);
  const interactionState = (state.panelInteractionState && typeof state.panelInteractionState === "object") ? state.panelInteractionState : {};
  const selectedInstanceIds = Array.isArray(interactionState.selectedInstanceIds)
    ? interactionState.selectedInstanceIds.filter(Boolean)
    : (Array.isArray(state.lastCanvasSelectionInstanceIds) ? state.lastCanvasSelectionInstanceIds.filter(Boolean) : []);
  const pendingProposalInstanceIds = Array.isArray(interactionState.pendingProposalInstanceIds)
    ? interactionState.pendingProposalInstanceIds.filter(Boolean)
    : [];
  const hasPendingProposalForCurrentStep = interactionState.currentStepId === currentStep?.id && pendingProposalInstanceIds.length > 0;
  const nextTransition = getCurrentStepTransition(pack, currentStep);

  const primaryEndpoints = exercisePackId && currentStep?.id
    ? ExerciseLibrary.listStepEndpointsForSurface(exercisePackId, currentStep.id, { panelRole: "primary", lang })
    : [];
  const secondaryEndpoints = exercisePackId && currentStep?.id
    ? ExerciseLibrary.listStepEndpointsForSurface(exercisePackId, currentStep.id, { panelRole: "secondary", lang })
    : [];
  const proposalEndpoints = exercisePackId && currentStep?.id
    ? ExerciseLibrary.listStepEndpointsForSurface(exercisePackId, currentStep.id, { panelRole: "proposal", lang }).map((endpoint) => ({
        ...endpoint,
        disabled: endpoint?.triggerKey === "selection.apply" ? !hasPendingProposalForCurrentStep : false
      }))
    : [];

  return {
    lang,
    pack,
    currentStep,
    exercisePackId,
    selectedInstanceIds,
    pendingProposalInstanceIds,
    hasPendingProposalForCurrentStep,
    nextTransition,
    primaryEndpoints,
    secondaryEndpoints,
    proposalEndpoints
  };
}

function clearExerciseButtonGroup(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function renderRunProfileButtonGroup(containerEl, endpoints = []) {
  clearExerciseButtonGroup(containerEl);
  if (!containerEl) return;
  for (const endpoint of Array.isArray(endpoints) ? endpoints : []) {
    if (!endpoint?.id) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = endpoint.label || endpoint.id;
    button.title = [endpoint.summary, endpoint.uiHint].filter(Boolean).join("\n\n");
    button.dataset.dtAgentRun = "1";
    button.dataset.endpointId = endpoint.id;
    button.disabled = state.agentRunLock || endpoint.disabled === true;
    button.addEventListener("click", () => {
      void runEndpointById(endpoint.id);
    });
    containerEl.appendChild(button);
  }
}

async function computePendingProposalAvailabilityForSelection(stepId, instanceIds) {
  const normalizedStepId = pickFirstNonEmptyString(stepId);
  const pendingProposalInstanceIds = [];
  for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
    const proposal = await loadPendingProposalForInstance(instanceId, { stepId: normalizedStepId });
    if (proposal?.proposalId) pendingProposalInstanceIds.push(instanceId);
  }
  return {
    hasPendingProposalForCurrentStep: pendingProposalInstanceIds.length > 0,
    pendingProposalInstanceIds
  };
}

async function refreshPanelInteractionState() {
  const lang = getCurrentDisplayLanguage();
  const pack = getSelectedExercisePack({ lang });
  const currentStep = getCurrentExerciseStep(pack, { lang });
  const selectedInstanceIds = Array.isArray(state.lastCanvasSelectionInstanceIds)
    ? state.lastCanvasSelectionInstanceIds.filter(Boolean)
    : [];
  const nextState = {
    currentStepId: currentStep?.id || null,
    selectedInstanceIds: selectedInstanceIds.slice(),
    hasPendingProposalForCurrentStep: false,
    pendingProposalInstanceIds: []
  };

  const exercisePackId = pickFirstNonEmptyString(pack?.id);
  const hasProposalApply = !!(exercisePackId && currentStep?.id && ExerciseLibrary
    .listStepEndpointsForSurface(exercisePackId, currentStep.id, { panelRole: "proposal", lang })
    .some((endpoint) => endpoint?.triggerKey === "selection.apply"));

  if (currentStep?.id && hasProposalApply && selectedInstanceIds.length) {
    const proposalState = await computePendingProposalAvailabilityForSelection(currentStep.id, selectedInstanceIds);
    nextState.hasPendingProposalForCurrentStep = proposalState.hasPendingProposalForCurrentStep;
    nextState.pendingProposalInstanceIds = proposalState.pendingProposalInstanceIds;
  }

  state.panelInteractionState = nextState;
  return nextState;
}

async function refreshExerciseInteractionSurface() {
  await refreshPanelInteractionState();
  renderExerciseActionSurface();
  renderRecommendationStatus();
  renderAdminTriggerPicker();
}

function renderRecommendationStatus() {
  if (!exerciseRecommendationStatusEl) return;

  const model = buildExerciseActionSurfaceModel();
  const lang = model.lang;
  const lines = [];
  const lastTriggerKey = state.exerciseRuntime?.lastTriggerKey || null;
  const lastTriggerSource = state.exerciseRuntime?.lastTriggerSource || null;
  const lastTriggerAt = state.exerciseRuntime?.lastTriggerAt || null;
  const lastUnlocked = Array.isArray(state.exerciseRuntime?.lastFlowDirectiveUnlockEndpointIds)
    ? state.exerciseRuntime.lastFlowDirectiveUnlockEndpointIds.filter(Boolean)
    : [];
  const lastCompleted = Array.isArray(state.exerciseRuntime?.lastFlowDirectiveCompleteEndpointIds)
    ? state.exerciseRuntime.lastFlowDirectiveCompleteEndpointIds.filter(Boolean)
    : [];
  const lastDirectiveAt = state.exerciseRuntime?.lastFlowDirectiveAt || null;
  const lastActiveAnchorInstanceId = state.exerciseRuntime?.lastActiveAnchorInstanceId || null;
  const lastActiveExercisePackId = state.exerciseRuntime?.lastActiveExercisePackId || null;
  const formatRunProfileLabels = (runProfiles) => (Array.isArray(runProfiles) ? runProfiles : [])
    .map((profile) => profile?.label || profile?.id)
    .filter(Boolean)
    .join(", ") || t("recommendation.lastUnlocked.none", lang);

  lines.push(t("recommendation.primaryActions", lang, { value: formatRunProfileLabels(model.primaryProfiles) }));
  lines.push(t("recommendation.secondaryActions", lang, { value: formatRunProfileLabels(model.secondaryProfiles) }));
  if (model.proposalProfiles.length) {
    lines.push(t("recommendation.proposalActions", lang, {
      value: formatRunProfileLabels(model.proposalProfiles) + " · " + t(model.hasPendingProposalForCurrentStep ? "recommendation.proposalState.ready" : "recommendation.proposalState.missing", lang)
    }));
  }
  if (model.nextTransition) {
    const nextStep = Exercises.getExerciseStep(model.pack, model.nextTransition.toStepId, { lang });
    lines.push(t("recommendation.nextStep.ready", lang, { value: nextStep?.label || model.nextTransition.toStepId }));
  } else {
    lines.push(t("recommendation.nextStep.blocked", lang));
  }

  lines.push(t("recommendation.lastTrigger", lang, {
    value: lastTriggerKey ? `${lastTriggerKey} (${lastTriggerSource || "system"})` : t("recommendation.lastTrigger.none", lang)
  }));
  if (lastTriggerAt) lines.push(t("recommendation.lastTriggerAt", lang, { value: formatLocaleDateTime(lastTriggerAt, lang) }));
  lines.push(t("recommendation.lastUnlocked", lang, { value: lastUnlocked.join(", ") || t("recommendation.lastUnlocked.none", lang) }));
  lines.push(t("recommendation.lastCompleted", lang, { value: lastCompleted.join(", ") || t("recommendation.lastCompleted.none", lang) }));
  if (lastDirectiveAt) lines.push(t("recommendation.lastDirectiveAt", lang, { value: formatLocaleDateTime(lastDirectiveAt, lang) }));
  if (lastActiveExercisePackId || lastActiveAnchorInstanceId) {
    lines.push(t("recommendation.lastFlowAnchor", lang, {
      value: [
        Exercises.getExercisePackById(lastActiveExercisePackId, { lang })?.label || lastActiveExercisePackId || null,
        getInstanceLabelByInternalId(lastActiveAnchorInstanceId) || lastActiveAnchorInstanceId || null
      ].filter(Boolean).join(" · ")
    }));
  }

  exerciseRecommendationStatusEl.textContent = lines.join("\n");
}

function renderExerciseActionSurface() {
  const model = buildExerciseActionSurfaceModel();
  const lang = model.lang;

  renderRunProfileButtonGroup(exercisePrimaryActionsEl, model.primaryEndpoints);
  renderRunProfileButtonGroup(exerciseSecondaryActionsEl, model.secondaryEndpoints);
  renderRunProfileButtonGroup(exerciseProposalActionsEl, model.proposalEndpoints);

  setElementHidden(exercisePrimaryActionsTitleEl, model.primaryEndpoints.length === 0);
  setElementHidden(exerciseSecondaryActionsTitleEl, model.secondaryEndpoints.length === 0);
  setElementHidden(exerciseProposalTitleEl, model.proposalEndpoints.length === 0);

  if (btnExerciseNextStepEl) {
    btnExerciseNextStepEl.disabled = state.agentRunLock || !model.nextTransition;
  }

  if (exerciseActionHelpEl) {
    const lines = [];
    if (!model.pack) {
      lines.push(t("exercise.action.help.noPack", lang));
    } else if (!model.currentStep) {
      lines.push(t("exercise.action.help.noStep", lang));
    } else {
      if (!model.primaryEndpoints.length && !model.secondaryEndpoints.length && !model.proposalEndpoints.length) {
        lines.push(t("exercise.action.noneAvailable", lang));
      }
      if (model.nextTransition) {
        const nextStep = Exercises.getExerciseStep(model.pack, model.nextTransition.toStepId, { lang });
        lines.push(t("exercise.action.help.nextStep", lang, { step: nextStep?.label || model.nextTransition.toStepId }));
      } else {
        lines.push(t("exercise.action.help.noTransition", lang));
      }
      if (model.proposalEndpoints.some((endpoint) => endpoint?.triggerKey === "selection.apply") && !model.hasPendingProposalForCurrentStep) {
        lines.push(t("exercise.action.applyUnavailable", lang));
      }
    }
    exerciseActionHelpEl.textContent = lines.filter(Boolean).join("\n");
  }

}

function renderAdminTriggerPicker() {
  const lang = getCurrentDisplayLanguage();
  const pack = getSelectedExercisePack({ lang });
  const currentStep = getCurrentExerciseStep(pack, { lang });
  const panel = document.getElementById("admin-trigger-panel");
  if (panel) {
    setElementHidden(panel, state.panelMode !== "admin");
  }
  if (!exerciseAdminTriggerEl) return;

  const triggerKeys = currentStep ? Exercises.listAllowedTriggerKeys(currentStep) : [];
  const exercisePackId = pickFirstNonEmptyString(pack?.id);
  const runProfiles = exercisePackId && currentStep?.id
    ? ExerciseLibrary.listStepEndpoints(exercisePackId, currentStep.id, { lang })
    : [];
  const currentValue = pickFirstNonEmptyString(exerciseAdminTriggerEl.value);
  exerciseAdminTriggerEl.innerHTML = "";

  if (!triggerKeys.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = currentStep?.id || t("admin.exerciseStep.none", lang);
    exerciseAdminTriggerEl.appendChild(option);
    exerciseAdminTriggerEl.disabled = true;
    if (btnExerciseAdminTriggerRunEl) btnExerciseAdminTriggerRunEl.disabled = true;
    if (exerciseAdminTriggerHelpEl) {
      exerciseAdminTriggerHelpEl.textContent = currentStep
        ? t("admin.stepTrigger.help", lang)
        : t("exercise.action.help.noStep", lang);
    }
    return;
  }

  for (const triggerKey of triggerKeys) {
    const option = document.createElement("option");
    option.value = triggerKey;
    const matchingProfile = runProfiles.find((profile) => profile?.triggerKey === triggerKey);
    option.textContent = matchingProfile?.label ? `${triggerKey} — ${matchingProfile.label}` : triggerKey;
    exerciseAdminTriggerEl.appendChild(option);
  }
  if (currentValue && triggerKeys.includes(currentValue)) {
    exerciseAdminTriggerEl.value = currentValue;
  }
  exerciseAdminTriggerEl.disabled = false;
  if (btnExerciseAdminTriggerRunEl) btnExerciseAdminTriggerRunEl.disabled = state.agentRunLock || !triggerKeys.length;
  if (exerciseAdminTriggerHelpEl) exerciseAdminTriggerHelpEl.textContent = t("admin.stepTrigger.help", lang);
}

function renderExerciseControls() {
  renderExercisePackPicker();
  renderExerciseStepPicker();
  renderExerciseContextStatus();
  renderRecommendationStatus();
  renderAdminOverrideEditor();
  renderExerciseActionSurface();
  renderAdminTriggerPicker();
  renderFlowAuthoringControls();
  renderPanelMode();
  void refreshExerciseInteractionSurface();
}

function getSelectedFlowPackTemplateId() {
  return (flowPackTemplateEl?.value || "").trim() || null;
}

function getSelectedFlowPackTemplate(options = {}) {
  const lang = normalizeUiLanguage(options.lang || getCurrentDisplayLanguage());
  return Exercises.getExercisePackById(getSelectedFlowPackTemplateId(), { lang });
}

function getSelectedFlowStepTemplateId(packTemplate = getSelectedFlowPackTemplate()) {
  if (!packTemplate) return null;
  const requestedId = (flowStepTemplateEl?.value || "").trim() || null;
  const exact = requestedId ? Exercises.getExerciseStep(packTemplate, requestedId) : null;
  if (exact) return exact.id;
  return Exercises.listExerciseSteps(packTemplate)[0]?.id || null;
}

function getSelectedFlowStepTemplate(packTemplate = getSelectedFlowPackTemplate(), options = {}) {
  const lang = normalizeUiLanguage(options.lang || getCurrentDisplayLanguage());
  const stepId = getSelectedFlowStepTemplateId(packTemplate);
  return stepId ? Exercises.getExerciseStep(packTemplate, stepId, { lang }) : null;
}

function getSelectedFlowRunProfileId(packTemplate = getSelectedFlowPackTemplate(), stepTemplate = getSelectedFlowStepTemplate(packTemplate)) {
  if (!packTemplate) return null;
  const requestedId = (flowRunProfileEl?.value || "").trim() || null;
  const exact = requestedId ? ExerciseLibrary.getEndpointById(requestedId) : null;
  if (exact && !isSidecarOnlyEndpoint(exact) && exact.exercisePackId === packTemplate.id && (!stepTemplate || exact.stepId === stepTemplate.id)) {
    return exact.id;
  }
  return listAuthorableRunProfilesForPack(packTemplate, { stepTemplateId: stepTemplate?.id || null })[0]?.id || null;
}

function getSelectedFlowRunProfile(packTemplate = getSelectedFlowPackTemplate(), stepTemplate = getSelectedFlowStepTemplate(packTemplate), options = {}) {
  const lang = normalizeUiLanguage(options.lang || getCurrentDisplayLanguage());
  const profileId = getSelectedFlowRunProfileId(packTemplate, stepTemplate);
  return profileId ? ExerciseLibrary.getEndpointById(profileId, { lang }) : null;
}

function renderFlowPackTemplatePicker() {
  if (!flowPackTemplateEl) return;
  const lang = getCurrentDisplayLanguage();
  const selectedId = getSelectedFlowPackTemplateId();
  const templates = ExerciseLibrary.listPackTemplates({ lang });

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
  const lang = getCurrentDisplayLanguage();
  const packTemplate = getSelectedFlowPackTemplate({ lang });
  const selectedStepId = getSelectedFlowStepTemplateId(packTemplate);
  const steps = ExerciseLibrary.listStepTemplatesForPack(packTemplate, { lang });

  flowStepTemplateEl.textContent = "";
  if (!steps.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("flow.noStepTemplates", lang);
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
  const lang = getCurrentDisplayLanguage();
  const packTemplate = getSelectedFlowPackTemplate({ lang });
  const stepTemplate = getSelectedFlowStepTemplate(packTemplate, { lang });
  const selectedProfileId = getSelectedFlowRunProfileId(packTemplate, stepTemplate);
  const profiles = listAuthorableRunProfilesForPack(packTemplate, { stepTemplateId: stepTemplate?.id || null, lang });

  flowRunProfileEl.textContent = "";
  if (!profiles.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("flow.noRunProfiles", lang);
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
  const endpointId = getSelectedFlowRunProfileId() || "";
  return [packId, stepId, endpointId].join("::");
}

function syncFlowControlLabelFromRunProfile({ force = false } = {}) {
  const lang = getCurrentDisplayLanguage();
  const runProfile = getSelectedFlowRunProfile(undefined, undefined, { lang });
  if (!flowControlLabelEl || !runProfile) return;

  const nextLabel = (pickFirstNonEmptyString(runProfile.label, t("flow.defaultControlLabel", lang)) || "").trim();
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
  const lang = getCurrentDisplayLanguage();
  const packTemplate = getSelectedFlowPackTemplate({ lang });
  const stepTemplate = getSelectedFlowStepTemplate(packTemplate, { lang });
  const runProfile = getSelectedFlowRunProfile(packTemplate, stepTemplate, { lang });
  const selectedLabels = getInstanceLabelsFromIds(state.lastCanvasSelectionInstanceIds || []);
  const scopeType = (flowScopeTypeEl?.value || runProfile?.defaultScopeType || "fixed_instances");
  const scopeLabel = scopeType === "global" ? t("flow.scope.global", lang) : t("flow.scope.fixed", lang);
  const lines = [
    t("flow.status.boardFlows", lang, { count: state.boardFlowsById.size }),
    t("flow.status.packTemplate", lang, { value: packTemplate?.label || t("flow.status.none", lang) }),
    t("flow.status.stepTemplate", lang, { value: stepTemplate?.label || t("flow.status.none", lang) }),
    t("flow.status.runProfile", lang, { value: runProfile?.label || t("flow.status.none", lang) }),
    t("flow.status.selectedCanvas", lang, { value: selectedLabels.join(", ") || t("flow.status.selectedCanvas.none", lang) }),
    t("flow.status.scope", lang, { value: scopeLabel }),
    t("flow.status.layoutMode", lang, { value: t(isStaticFlowControlLayoutEnabled() ? "flow.layoutMode.static" : "flow.layoutMode.dynamic", lang) })
  ];
  if (runProfile?.summary) lines.push(t("flow.status.profileEffect", lang, { value: runProfile.summary }));
  if (runProfile?.uiHint) lines.push(t("flow.status.adminHint", lang, { value: runProfile.uiHint }));
  flowAuthoringStatusEl.textContent = lines.join("\n");
}

function renderFlowAuthoringControls({ forceLabelSync = false } = {}) {
  renderFlowPackTemplatePicker();
  renderFlowStepTemplatePicker();
  renderFlowRunProfilePicker();
  if (flowStaticLayoutToggleEl) {
    flowStaticLayoutToggleEl.checked = isStaticFlowControlLayoutEnabled();
  }
  syncFlowControlLabelFromRunProfile({ force: forceLabelSync });
  renderFlowAuthoringStatus();
}

function mergeBoardFlowWithPackTemplate(flow, packTemplate, { lang = getCurrentDisplayLanguage() } = {}) {
  const normalizedFlow = BoardFlow.normalizeBoardFlow(flow);
  if (!normalizedFlow?.id || !packTemplate?.id) {
    return { flow: normalizedFlow, changed: false };
  }

  const templateSteps = ExerciseLibrary.listStepTemplatesForPack(packTemplate, { lang })
    .slice()
    .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
  if (!templateSteps.length) {
    return { flow: normalizedFlow, changed: false };
  }

  const existingStepsById = new Map((normalizedFlow.steps || []).map((step) => [step.id, step]));
  const templateStepIds = new Set(templateSteps.map((step) => step.id));
  let changed = false;

  const mergedTemplateSteps = templateSteps.map((templateStep) => {
    const existing = existingStepsById.get(templateStep.id) || null;
    const labelMode = existing?.labelMode === 'custom' ? 'custom' : 'auto';
    const label = labelMode === 'custom'
      ? pickFirstNonEmptyString(existing?.label, templateStep.label, templateStep.id)
      : pickFirstNonEmptyString(templateStep.label, existing?.label, templateStep.id);
    const instructionOverride = pickFirstNonEmptyString(existing?.instructionOverride);
    const instruction = instructionOverride
      ? pickFirstNonEmptyString(existing?.instruction, templateStep.instruction)
      : pickFirstNonEmptyString(templateStep.instruction, existing?.instruction);
    const controlIds = Array.from(new Set((Array.isArray(existing?.controlIds) ? existing.controlIds : []).filter(Boolean)));
    const nextStep = {
      id: templateStep.id,
      label,
      labelMode,
      order: Number.isFinite(Number(templateStep.order)) ? Number(templateStep.order) : Number(existing?.order || 0),
      instruction: instruction || null,
      instructionOverride: instructionOverride || null,
      controlIds
    };
    if (!existing) {
      changed = true;
    } else if (
      existing.label !== nextStep.label ||
      (existing.labelMode || 'auto') !== nextStep.labelMode ||
      Number(existing.order || 0) !== nextStep.order ||
      (existing.instruction || null) !== nextStep.instruction ||
      (existing.instructionOverride || null) !== nextStep.instructionOverride ||
      JSON.stringify(existing.controlIds || []) !== JSON.stringify(nextStep.controlIds)
    ) {
      changed = true;
    }
    return nextStep;
  });

  const extraSteps = (normalizedFlow.steps || []).filter((step) => step?.id && !templateStepIds.has(step.id));
  const nextSteps = [...mergedTemplateSteps, ...extraSteps].sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0));
  const validStepIds = new Set(nextSteps.map((step) => step.id));

  const nextControls = {};
  for (const [controlId, control] of Object.entries(normalizedFlow.controls || {})) {
    const endpoint = control?.endpointId ? ExerciseLibrary.getEndpointById(control.endpointId, { lang }) : null;
    const desiredStepId = pickFirstNonEmptyString(control?.stepId, endpoint?.stepId);
    const nextLabel = control?.labelMode === 'custom'
      ? control.label
      : pickFirstNonEmptyString(endpoint?.label, control?.label);
    const nextControl = {
      ...control,
      stepId: desiredStepId || control?.stepId || null,
      label: nextLabel || control?.label || null
    };
    if ((control?.stepId || null) !== (nextControl.stepId || null) || (control?.label || null) !== (nextControl.label || null)) {
      changed = true;
    }
    nextControls[controlId] = nextControl;
  }

  let nextCurrentStepId = pickFirstNonEmptyString(normalizedFlow?.runtime?.currentStepId);
  if (!nextCurrentStepId || !validStepIds.has(nextCurrentStepId)) {
    const preferredStepId = pickFirstNonEmptyString(
      (normalizedFlow?.exercisePackId || normalizedFlow?.exercisePackId) === getSelectedExercisePackId() ? state.exerciseRuntime?.currentStepId : null,
      templateSteps[0]?.id,
      nextSteps[0]?.id
    );
    nextCurrentStepId = preferredStepId || null;
    changed = true;
  }

  const validControlIds = new Set(Object.keys(nextControls));
  const finalSteps = nextSteps.map((step) => {
    const filteredControlIds = Array.from(new Set((Array.isArray(step.controlIds) ? step.controlIds : []).filter((controlId) => validControlIds.has(controlId))));
    if (JSON.stringify(step.controlIds || []) !== JSON.stringify(filteredControlIds)) {
      changed = true;
      return { ...step, controlIds: filteredControlIds };
    }
    return step;
  });

  const nextFlow = BoardFlow.normalizeBoardFlow({
    ...normalizedFlow,
    steps: finalSteps,
    controls: nextControls,
    runtime: {
      ...(normalizedFlow.runtime || {}),
      currentStepId: nextCurrentStepId
    },
    updatedAt: changed ? new Date().toISOString() : normalizedFlow.updatedAt
  });

  return { flow: nextFlow, changed };
}

async function pruneMissingBoardFlowControls(flow) {
  const normalizedFlow = BoardFlow.normalizeBoardFlow(flow);
  const controls = Object.entries(normalizedFlow.controls || {});
  const itemIds = controls.map(([, control]) => String(control?.itemId || '')).filter(Boolean);
  if (!itemIds.length) return { flow: normalizedFlow, changed: false, removedControlIds: [] };

  let items = [];
  try {
    items = await Board.getItemsById(itemIds, log);
  } catch (error) {
    log('WARNUNG: Board-Flow-Controls konnten nicht geprüft werden: ' + formatRuntimeErrorMessage(error));
    return { flow: normalizedFlow, changed: false, removedControlIds: [] };
  }

  const presentItemIds = new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id || '')).filter(Boolean));
  const removedControlIds = controls
    .filter(([, control]) => control?.itemId && !presentItemIds.has(String(control.itemId)))
    .map(([controlId]) => controlId);

  if (!removedControlIds.length) {
    return { flow: normalizedFlow, changed: false, removedControlIds: [] };
  }

  const removedSet = new Set(removedControlIds);
  const nextControls = Object.fromEntries(controls.filter(([controlId]) => !removedSet.has(controlId)));
  const nextSteps = (normalizedFlow.steps || []).map((step) => ({
    ...step,
    controlIds: (Array.isArray(step.controlIds) ? step.controlIds : []).filter((controlId) => !removedSet.has(controlId))
  }));

  const nextFlow = BoardFlow.normalizeBoardFlow({
    ...normalizedFlow,
    controls: nextControls,
    steps: nextSteps,
    updatedAt: new Date().toISOString()
  });
  return { flow: nextFlow, changed: true, removedControlIds };
}

async function ensureBoardFlowHealthy(flow, {
  persist = false,
  pruneMissingControls = true,
  preferredStepId = null,
  forcePreferredWhenNoControls = false
} = {}) {
  let nextFlow = BoardFlow.normalizeBoardFlow(flow);
  if (!nextFlow?.id) return nextFlow;

  const lang = getCurrentDisplayLanguage();
  const packTemplate = nextFlow.exercisePackId
    ? Exercises.getExercisePackById(nextFlow.exercisePackId, { lang })
    : null;
  let changed = false;

  if (packTemplate) {
    const merged = mergeBoardFlowWithPackTemplate(nextFlow, packTemplate, { lang });
    nextFlow = merged.flow;
    changed = changed || merged.changed;
  }

  const effectivePreferredStepId = pickFirstNonEmptyString(preferredStepId);
  const hasControls = Object.keys(nextFlow.controls || {}).length > 0;
  const validStepIds = new Set((nextFlow.steps || []).map((step) => step.id));
  if (effectivePreferredStepId && validStepIds.has(effectivePreferredStepId)) {
    const currentStepId = pickFirstNonEmptyString(nextFlow?.runtime?.currentStepId);
    if (!currentStepId || !validStepIds.has(currentStepId) || (forcePreferredWhenNoControls && !hasControls)) {
      const updatedFlow = BoardFlow.setFlowCurrentStep(nextFlow, effectivePreferredStepId);
      if (updatedFlow.runtime?.currentStepId !== nextFlow.runtime?.currentStepId) {
        nextFlow = updatedFlow;
        changed = true;
      }
    }
  }

  if (pruneMissingControls) {
    const pruned = await pruneMissingBoardFlowControls(nextFlow);
    nextFlow = pruned.flow;
    changed = changed || pruned.changed;
    if (pruned.removedControlIds?.length) {
      log('WARNUNG: Verwaiste Board-Flow-Controls entfernt: ' + pruned.removedControlIds.join(', '));
    }
  }

  if (changed && persist) {
    nextFlow = await Board.saveBoardFlow({
      ...nextFlow,
      updatedAt: new Date().toISOString()
    }, log);
  }

  return nextFlow;
}

async function loadBoardFlows() {
  const flows = await Board.listBoardFlows(log);
  const entries = [];
  for (const flow of flows) {
    const healthyFlow = await ensureBoardFlowHealthy(flow, { persist: true, pruneMissingControls: true });
    if (healthyFlow?.id) entries.push([healthyFlow.id, healthyFlow]);
  }
  state.boardFlowsById = new Map(entries);
  await syncAllBoardFlowVisuals({ reflow: !isStaticFlowControlLayoutEnabled() });
  renderFlowAuthoringStatus();
}

function getRunProfileSurfaceMeta(endpointId) {
  const endpoint = ExerciseLibrary.getEndpointById(endpointId, { lang: getCurrentDisplayLanguage() });
  return {
    sortOrder: Number.isFinite(Number(endpoint?.sortOrder)) ? Number(endpoint.sortOrder) : Number.MAX_SAFE_INTEGER,
    panelRole: endpoint?.surface?.panelRole || endpoint?.panelRole || null,
    boardGroup: endpoint?.surface?.boardGroup || endpoint?.boardGroup || "core",
    seedByDefault: endpoint?.surface?.seedByDefault === true || endpoint?.seedByDefault === true
  };
}

function getRunProfileSortOrder(endpointId) {
  return getRunProfileSurfaceMeta(endpointId).sortOrder;
}

function getRunProfilePanelRoleRank(endpointId) {
  const panelRole = getRunProfileSurfaceMeta(endpointId).panelRole;
  if (panelRole === "primary") return 0;
  if (panelRole === "secondary") return 1;
  if (panelRole === "proposal") return 2;
  return 3;
}

function isSidecarOnlyEndpoint(endpoint) {
  const triggerKey = ExerciseEngine.normalizeTriggerKey(endpoint?.triggerKey);
  return triggerKey === "selection.apply" || triggerKey === "global.apply";
}

function listAuthorableRunProfilesForPack(packTemplate, { stepTemplateId = null, lang = getCurrentDisplayLanguage() } = {}) {
  return ExerciseLibrary.listEndpointsForPack(packTemplate, { stepId: stepTemplateId, lang })
    .filter((endpoint) => !isSidecarOnlyEndpoint(endpoint));
}

function getFlowControlDisplayBucket(flow, control) {
  const currentStepId = pickFirstNonEmptyString(flow?.runtime?.currentStepId);
  const boardGroup = getRunProfileSurfaceMeta(control?.endpointId).boardGroup;
  const isCurrentStep = !!(control?.stepId && currentStepId && control.stepId === currentStepId);
  const isActiveLike = control?.state === "active";

  if (isCurrentStep) {
    if (boardGroup === "core") return 0;
    if (boardGroup === "proposal") return 1;
    return 2;
  }
  if (isActiveLike) return 2;
  return 3;
}

function getFlowControlDisplayLane(flow, control) {
  const bucket = getFlowControlDisplayBucket(flow, control);
  if (bucket === 0) return 0;
  if (bucket === 1) return 1;
  if (bucket === 2) return 2;
  return 3;
}

function sortFlowControlsForDisplay(flow, controls) {
  return (Array.isArray(controls) ? controls : [])
    .slice()
    .sort((a, b) => (
      getFlowControlDisplayBucket(flow, a) - getFlowControlDisplayBucket(flow, b) ||
      getRunProfilePanelRoleRank(a?.endpointId) - getRunProfilePanelRoleRank(b?.endpointId) ||
      getRunProfileSortOrder(a?.endpointId) - getRunProfileSortOrder(b?.endpointId) ||
      String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" })
    ));
}

async function syncBoardFlowVisuals(flow, { reflow = false } = {}) {
  if (!flow?.id) return flow;

  const lang = getCurrentDisplayLanguage();
  const orderedControls = sortFlowControlsForDisplay(flow, Object.values(flow.controls || {}));
  const anchorInstance = flow.anchorInstanceId ? state.instancesById.get(flow.anchorInstanceId) : null;

  if (reflow && anchorInstance) {
    const laneOffsets = new Map();
    for (const control of orderedControls) {
      if (!control?.itemId) continue;
      const laneIndex = getFlowControlDisplayLane(flow, control);
      const offsetIndex = laneOffsets.get(laneIndex) || 0;
      laneOffsets.set(laneIndex, offsetIndex + 1);
      try {
        const position = await Board.computeSuggestedFlowControlPosition(anchorInstance, { offsetIndex, laneIndex }, log);
        await Board.moveItemByIdToBoardCoords(control.itemId, position.x, position.y, log);
      } catch (e) {
        log("WARNUNG: Flow-Control-Layout konnte nicht aktualisiert werden: " + e.message);
      }
    }
  }

  for (const control of orderedControls) {
    if (!control?.itemId) continue;
    try {
      await Board.syncFlowControlShapeAppearance(control.itemId, {
        label: control.label,
        state: control.state,
        lang
      }, log);
    } catch (e) {
      log("WARNUNG: Flow-Control-Darstellung konnte nicht synchronisiert werden: " + e.message);
    }
  }

  return flow;
}

async function syncAllBoardFlowVisuals({ reflow = false } = {}) {
  const shouldReflow = !!reflow && !isStaticFlowControlLayoutEnabled();
  for (const flow of state.boardFlowsById.values()) {
    await syncBoardFlowVisuals(flow, { reflow: shouldReflow });
  }
}

function buildFlowId(exercisePackId, anchorInstanceId) {
  return [exercisePackId || "flow", anchorInstanceId || "anchor", Date.now().toString(36), Math.random().toString(36).slice(2, 7)].join(":");
}

function buildFlowControlId(stepId, endpointId) {
  return [stepId || "step", endpointId || "endpoint", Date.now().toString(36), Math.random().toString(36).slice(2, 7)].join(":");
}

function getSelectedExercisePackTemplateId() {
  return getSelectedExercisePackId();
}

function getExistingBoardFlowForPack(exercisePackId, anchorInstanceId) {
  for (const flow of state.boardFlowsById.values()) {
    if ((flow?.exercisePackId || flow?.exercisePackId) === exercisePackId && flow?.anchorInstanceId === anchorInstanceId) {
      return flow;
    }
  }
  return null;
}

async function saveBoardFlowAndCache(flow, { reflow = false } = {}) {
  const saved = await Board.saveBoardFlow(flow, log);
  state.boardFlowsById.set(saved.id, saved);
  await syncBoardFlowVisuals(saved, { reflow: !!reflow && !isStaticFlowControlLayoutEnabled() });
  renderFlowAuthoringStatus();
  return saved;
}

function resolveRelevantBoardFlowForCurrentStep(exercisePackId, preferredAnchorInstanceId = null) {
  const normalizedExercisePackId = pickFirstNonEmptyString(exercisePackId);
  if (!normalizedExercisePackId) return null;

  if (preferredAnchorInstanceId) {
    const preferred = getExistingBoardFlowForPack(normalizedExercisePackId, preferredAnchorInstanceId);
    if (preferred) return preferred;
  }

  const lastActiveExercisePackId = pickFirstNonEmptyString(state.exerciseRuntime?.lastActiveExercisePackId, state.exerciseRuntime?.lastActiveExercisePackId);
  const lastActiveAnchorInstanceId = pickFirstNonEmptyString(state.exerciseRuntime?.lastActiveAnchorInstanceId);
  if (lastActiveExercisePackId === normalizedExercisePackId && lastActiveAnchorInstanceId) {
    const lastActive = getExistingBoardFlowForPack(normalizedExercisePackId, lastActiveAnchorInstanceId);
    if (lastActive) return lastActive;
  }

  const selectedInstanceIds = Array.isArray(state.lastCanvasSelectionInstanceIds) ? state.lastCanvasSelectionInstanceIds.filter(Boolean) : [];
  if (selectedInstanceIds.length === 1) {
    const selectedFlow = getExistingBoardFlowForPack(normalizedExercisePackId, selectedInstanceIds[0]);
    if (selectedFlow) return selectedFlow;
  }

  const matchingFlows = Array.from(state.boardFlowsById.values()).filter((flow) => (flow?.exercisePackId || flow?.exercisePackId) === normalizedExercisePackId);
  if (!matchingFlows.length) return null;

  matchingFlows.sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || ""), undefined, { sensitivity: "base" }));
  return matchingFlows[0] || null;
}

async function ensureDefaultBoardControlsForStep(flow, stepId) {
  const normalizedStepId = pickFirstNonEmptyString(stepId);
  if (!flow?.id || !flow?.anchorInstanceId || !normalizedStepId) {
    return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
  }
  if (isStaticFlowControlLayoutEnabled()) {
    return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
  }

  const endpointIds = ExerciseLibrary.listStepEndpointsForSurface(flow.exercisePackId || flow.exercisePackId, normalizedStepId, {
    seedByDefaultOnly: true,
    lang: getCurrentDisplayLanguage()
  }).map((endpoint) => endpoint?.id).filter(Boolean);

  if (!endpointIds.length) {
    return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
  }

  return await ensureFlowControlsForRunProfiles({
    flow,
    anchorInstanceId: flow.anchorInstanceId,
    endpointIds: endpointIds
  });
}

async function syncExerciseStepToBoardFlow(stepId, { exercisePackId = null, anchorInstanceId = null } = {}) {
  const normalizedStepId = pickFirstNonEmptyString(stepId);
  const normalizedExercisePackId = pickFirstNonEmptyString(exercisePackId) || getSelectedExercisePackId();
  if (!normalizedStepId || !normalizedExercisePackId) return null;

  const relevantFlow = resolveRelevantBoardFlowForCurrentStep(normalizedExercisePackId, anchorInstanceId);
  if (!relevantFlow?.id) return null;

  let nextFlow = BoardFlow.setFlowCurrentStep(relevantFlow, normalizedStepId);
  const stepChanged = nextFlow.runtime?.currentStepId !== relevantFlow.runtime?.currentStepId;
  const ensured = await ensureDefaultBoardControlsForStep(nextFlow, normalizedStepId);
  nextFlow = ensured.flow;

  if (stepChanged || ensured.createdEndpointIds?.length) {
    nextFlow = await saveBoardFlowAndCache(nextFlow, { reflow: !isStaticFlowControlLayoutEnabled() });
  } else {
    state.boardFlowsById.set(nextFlow.id, nextFlow);
  }
  return nextFlow;
}

async function findOrCreateBoardFlowForPack(exercisePackId, anchorInstanceId, { preferredStepId = null, seedDefaults = true } = {}) {
  const normalizedExercisePackId = pickFirstNonEmptyString(exercisePackId);
  const normalizedAnchorInstanceId = pickFirstNonEmptyString(anchorInstanceId);
  const lang = getCurrentDisplayLanguage();
  const exercisePack = Exercises.getExercisePackById(normalizedExercisePackId, { lang });
  if (!exercisePack) {
    throw new Error("Exercise Pack konnte nicht gefunden werden: " + String(exercisePackId || "(leer)"));
  }
  if (!normalizedAnchorInstanceId || !state.instancesById.has(normalizedAnchorInstanceId)) {
    throw new Error("Anchor-Instanz für Board Flow ist ungültig.");
  }

  const existingFlow = getExistingBoardFlowForPack(normalizedExercisePackId, normalizedAnchorInstanceId);
  if (existingFlow?.id) {
    const healthyFlow = await ensureBoardFlowHealthy(existingFlow, {
      persist: true,
      pruneMissingControls: true,
      preferredStepId,
      forcePreferredWhenNoControls: true
    });
    state.boardFlowsById.set(healthyFlow.id, healthyFlow);
    return healthyFlow;
  }

  const selectedStepId = pickFirstNonEmptyString(preferredStepId, getSelectedFlowStepTemplateId(exercisePack), exercisePack?.defaultStepId);
  const flow = BoardFlow.createBoardFlowFromPack(exercisePack, {
    id: buildFlowId(normalizedExercisePackId, normalizedAnchorInstanceId),
    exercisePackId: normalizedExercisePackId,
    anchorInstanceId: normalizedAnchorInstanceId,
    currentStepId: selectedStepId || null,
    labelMode: "auto"
  });

  let nextFlow = flow;
  let createdEndpointIds = [];
  if (seedDefaults) {
    const ensured = await ensureDefaultBoardControlsForStep(flow, flow.runtime?.currentStepId || selectedStepId);
    nextFlow = ensured.flow;
    createdEndpointIds = ensured.createdEndpointIds || [];
  }

  return await saveBoardFlowAndCache(nextFlow, { reflow: createdEndpointIds.length > 0 && !isStaticFlowControlLayoutEnabled() });
}

function buildFlowControlCatalogForPackTemplate(packTemplate) {
  if (!packTemplate?.id) return [];
  const lang = getCurrentDisplayLanguage();
  return listAuthorableRunProfilesForPack(packTemplate.id, { lang })
    .map((endpoint) => {
      const step = Exercises.getExerciseStep(packTemplate.id, endpoint?.stepId, { lang });
      return {
        endpointId: endpoint?.id || null,
        label: endpoint?.label || null,
        stepId: endpoint?.stepId || null,
        stepLabel: step?.label || endpoint?.stepId || null,
        scopeType: endpoint?.scope?.type || endpoint?.defaultScopeType || null,
        summary: endpoint?.summary || null
      };
    })
    .filter((entry) => !!entry.endpointId);
}

function buildBoardFlowStateForPrompt(flow) {
  if (!flow?.id) return null;
  const currentStep = BoardFlow.getFlowStep(flow, flow.runtime?.currentStepId);
  return {
    flowId: flow.id,
    anchorInstanceLabel: getInstanceLabelByInternalId(flow.anchorInstanceId) || null,
    currentStepId: flow.runtime?.currentStepId || null,
    currentStepLabel: currentStep?.label || null,
    controls: sortFlowControlsForDisplay(flow, Object.values(flow.controls || {})).map((control) => ({
      endpointId: control.endpointId || control.endpointId || null,
      label: control.label || null,
      stepId: control.stepId || null,
      state: control.state || "disabled"
    }))
  };
}

function resolveFlowPromptContext({ promptRuntimeOverride = null, targetInstanceIds = [] } = {}) {
  const lang = getCurrentDisplayLanguage();
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  const exercisePack = runtime?.exercisePack || Exercises.getExercisePackById(getSelectedExercisePackId(), { lang });
  const exercisePackId = exercisePack?.id || null;

  let anchorInstanceId = pickFirstNonEmptyString(runtime?.controlContext?.anchorInstanceId, runtime?.anchorInstanceId);
  if (anchorInstanceId && !state.instancesById.has(anchorInstanceId)) anchorInstanceId = null;
  if (!anchorInstanceId && Array.isArray(targetInstanceIds) && targetInstanceIds.length === 1 && state.instancesById.has(targetInstanceIds[0])) {
    anchorInstanceId = targetInstanceIds[0];
  }
  const flow = exercisePackId && anchorInstanceId
    ? getExistingBoardFlowForPack(exercisePackId, anchorInstanceId)
    : null;

  return {
    exercisePack,
    exercisePackId,
    anchorInstanceId,
    flow,
    flowControlCatalog: buildFlowControlCatalogForPackTemplate(exercisePack),
    boardFlowState: flow ? buildBoardFlowStateForPrompt(flow) : null
  };
}

function buildFlowScopeForRunProfile(runProfile, anchorInstanceId) {
  return pickFirstNonEmptyString(runProfile?.scope?.type, runProfile?.defaultScopeType) === "global"
    ? { type: "global" }
    : { type: "fixed_instances", instanceIds: anchorInstanceId ? [anchorInstanceId] : [] };
}

async function createBoardFlowControlForRunProfile({ flow, anchorInstanceId, runProfile, label = null, labelMode = "auto", scope = null } = {}) {
  const endpoint = runProfile;
  if (!flow?.id || !anchorInstanceId || !endpoint?.id || !endpoint?.stepId) {
    throw new Error("Flow-Control kann nicht erzeugt werden: Flow, Anchor oder Endpoint fehlen.");
  }

  const lang = getCurrentDisplayLanguage();
  const exercisePack = Exercises.getExercisePackById(flow.exercisePackId || flow.exercisePackId, { lang });
  const step = Exercises.getExerciseStep(exercisePack, endpoint.stepId, { lang });
  if (!step?.id) {
    throw new Error("Schritt für Endpoint nicht gefunden: " + endpoint.id);
  }

  let workingFlow = await ensureBoardFlowHealthy(flow, {
    persist: false,
    pruneMissingControls: true,
    preferredStepId: step.id,
    forcePreferredWhenNoControls: true
  });

  const orderedControls = sortFlowControlsForDisplay(workingFlow, Object.values(workingFlow.controls || {}));
  const initialState = (!orderedControls.length || workingFlow.runtime?.currentStepId === step.id) ? "active" : "disabled";
  const draftControl = {
    endpointId: endpoint.id,
    stepId: step.id,
    state: initialState,
    label: pickFirstNonEmptyString(label, endpoint.label, t("flow.defaultControlLabel", lang))
  };
  const orderedWithDraft = sortFlowControlsForDisplay(workingFlow, [...orderedControls, draftControl]);
  const draftIndex = orderedWithDraft.indexOf(draftControl);
  const laneIndex = getFlowControlDisplayLane(workingFlow, draftControl);
  const offsetIndex = orderedWithDraft.slice(0, draftIndex).filter((control) => getFlowControlDisplayLane(workingFlow, control) === laneIndex).length;
  const position = await Board.computeSuggestedFlowControlPosition(state.instancesById.get(anchorInstanceId), { offsetIndex, laneIndex }, log);
  const nextLabel = draftControl.label;
  const shape = await Board.createFlowControlShape({
    label: nextLabel,
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    state: initialState,
    lang
  }, log);

  const controlId = buildFlowControlId(step.id, endpoint.id);
  const control = BoardFlow.createFlowControlRecord({
    id: controlId,
    itemId: shape.id,
    label: nextLabel,
    labelMode,
    endpointId: endpoint.id,
    stepId: step.id,
    anchorInstanceId,
    scope: scope || buildFlowScopeForRunProfile(endpoint, anchorInstanceId),
    state: initialState
  });

  let nextFlow = BoardFlow.upsertFlowControl(workingFlow, control);
  nextFlow = await saveBoardFlowAndCache(nextFlow, { reflow: true });

  await Board.writeFlowControlMeta(shape.id, {
    flowId: nextFlow.id,
    controlId: control.id
  }, log);

  return nextFlow;
}

async function ensureFlowControlsForRunProfiles({ flow, anchorInstanceId, endpointIds = [] } = {}) {
  let nextFlow = flow;
  const createdEndpointIds = [];
  const skippedEndpointIds = [];

  for (const endpointId of Array.from(new Set((endpointIds || []).filter(Boolean)))) {
    if (BoardFlow.findFlowControlsByEndpointId(nextFlow, endpointId).length) continue;

    const endpoint = ExerciseLibrary.getEndpointById(endpointId, { lang: getCurrentDisplayLanguage() });
    if (!endpoint || endpoint.exercisePackId !== (nextFlow.exercisePackId || nextFlow.exercisePackId)) {
      skippedEndpointIds.push(endpointId);
      continue;
    }

    try {
      nextFlow = await createBoardFlowControlForRunProfile({
        flow: nextFlow,
        anchorInstanceId,
        runProfile: endpoint
      });
      createdEndpointIds.push(endpointId);
    } catch (e) {
      skippedEndpointIds.push(endpointId);
      log("WARNUNG: Board Flow Control konnte nicht automatisch erzeugt werden: " + endpointId + " – " + e.message);
    }
  }

  return { flow: nextFlow, createdEndpointIds, skippedEndpointIds };
}

async function applyFlowControlDirectivesAfterAgentRun({
  flowControlDirectives = null,
  promptRuntimeOverride = null,
  targetInstanceIds = [],
  sourceLabel = "Agent"
} = {}) {
  const directives = ExerciseEngine.normalizeFlowControlDirectivesBlock(flowControlDirectives);
  const flowContext = resolveFlowPromptContext({ promptRuntimeOverride, targetInstanceIds });
  const result = {
    flowControlDirectives: directives ? { unlockEndpointIds: [], completeEndpointIds: [] } : null,
    activeAnchorContext: flowContext.exercisePackId && flowContext.anchorInstanceId
      ? { exercisePackId: flowContext.exercisePackId, anchorInstanceId: flowContext.anchorInstanceId }
      : null,
    skippedEndpointIds: [],
    createdEndpointIds: []
  };

  if (!directives) {
    return result;
  }

  const exercisePackId = flowContext.exercisePackId;
  if (!exercisePackId) {
    if ((directives.unlockEndpointIds || directives.completeEndpointIds || []).length) {
      log(sourceLabel + ": Flow-Directives ignoriert, weil kein Exercise Pack im Flow-Kontext aufgelöst werden konnte.");
    }
    return result;
  }

  let flow = flowContext.flow;
  const validUnlockEndpointIds = [];
  const validCompleteEndpointIds = [];

  for (const endpointId of directives.unlockEndpointIds || []) {
    const endpoint = ExerciseLibrary.getEndpointById(endpointId);
    if (!endpoint || endpoint.exercisePackId !== exercisePackId || isSidecarOnlyEndpoint(endpoint)) {
      result.skippedEndpointIds.push(endpointId);
      if (endpoint && isSidecarOnlyEndpoint(endpoint)) {
        log("INFO: Sidecar-Only-Endpoint wird nicht als Board-Button freigeschaltet: " + endpointId);
      } else {
        log("WARNUNG: Unbekannte oder unpassende unlockEndpointId übersprungen: " + endpointId);
      }
      continue;
    }
    validUnlockEndpointIds.push(endpointId);
  }

  for (const endpointId of directives.completeEndpointIds || []) {
    const endpoint = ExerciseLibrary.getEndpointById(endpointId);
    if (!endpoint || endpoint.exercisePackId !== exercisePackId || isSidecarOnlyEndpoint(endpoint)) {
      result.skippedEndpointIds.push(endpointId);
      if (endpoint && isSidecarOnlyEndpoint(endpoint)) {
        log("INFO: Sidecar-Only-Endpoint wird nicht als Board-Button erledigt markiert: " + endpointId);
      } else {
        log("WARNUNG: Unbekannte oder unpassende completeEndpointId übersprungen: " + endpointId);
      }
      continue;
    }
    validCompleteEndpointIds.push(endpointId);
  }

  if (!flow && flowContext.anchorInstanceId && (validUnlockEndpointIds.length || validCompleteEndpointIds.length)) {
    flow = await findOrCreateBoardFlowForPack(exercisePackId, flowContext.anchorInstanceId);
  }
  if (!flow) {
    return result;
  }

  const needsControlCreation = validUnlockEndpointIds.some((endpointId) => !BoardFlow.findFlowControlsByEndpointId(flow, endpointId).length);
  if (needsControlCreation && !isStaticFlowControlLayoutEnabled()) {
    const ensured = await ensureFlowControlsForRunProfiles({
      flow,
      anchorInstanceId: flowContext.anchorInstanceId,
      endpointIds: validUnlockEndpointIds
    });
    flow = ensured.flow;
    result.createdEndpointIds = ensured.createdEndpointIds || [];
  } else if (needsControlCreation) {
    const missingEndpointIds = validUnlockEndpointIds.filter((endpointId) => !BoardFlow.findFlowControlsByEndpointId(flow, endpointId).length);
    result.skippedEndpointIds.push(...missingEndpointIds);
    validUnlockEndpointIds.splice(0, validUnlockEndpointIds.length, ...validUnlockEndpointIds.filter((endpointId) => BoardFlow.findFlowControlsByEndpointId(flow, endpointId).length));
  }

  const nextFlow = BoardFlow.applyFlowControlDirectives(flow, {
    unlockEndpointIds: validUnlockEndpointIds,
    completeEndpointIds: validCompleteEndpointIds
  });

  result.flowControlDirectives.unlockEndpointIds = validUnlockEndpointIds.slice();
  result.flowControlDirectives.completeEndpointIds = validCompleteEndpointIds.slice();
  await saveBoardFlowAndCache(nextFlow, { reflow: !isStaticFlowControlLayoutEnabled() });

  if (result.createdEndpointIds.length || validUnlockEndpointIds.length || validCompleteEndpointIds.length) {
    log(
      sourceLabel + ": Button-Zustände aktualisiert. Freigeschaltet=" + (validUnlockEndpointIds.join(", ") || "keine") +
      ", erledigt=" + (validCompleteEndpointIds.join(", ") || "keine") +
      (result.createdEndpointIds.length ? (", neu erzeugt=" + result.createdEndpointIds.join(", ")) : "") + "."
    );
  }

  return result;
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
  const lang = getCurrentDisplayLanguage();
  const packTemplate = getSelectedFlowPackTemplate({ lang });
  const stepTemplate = getSelectedFlowStepTemplate(packTemplate, { lang });
  const runProfile = getSelectedFlowRunProfile(packTemplate, stepTemplate, { lang });

  if (!packTemplate || !stepTemplate || !runProfile) {
    log("Board Flow: Bitte Pack Template, Step Template und Run Profile wählen.");
    return;
  }

  try {
    const { anchorInstanceId, scope } = await resolveAuthoringScopeFromCurrentSelection(packTemplate, flowScopeTypeEl?.value || runProfile.defaultScopeType);
    let flow = await findOrCreateBoardFlowForPack(packTemplate.id, anchorInstanceId, { preferredStepId: stepTemplate.id, seedDefaults: false });
    if (BoardFlow.findFlowControlsByRunProfileId(flow, runProfile.id).length) {
      log("Board Flow: Für dieses Run Profile existiert bereits ein Button auf dieser Instanz. Kein Duplikat erzeugt.");
      return;
    }
    const inputLabel = ((flowControlLabelEl?.value || "").trim());
    const autoLabel = (flowControlLabelEl?.dataset.autoLabel || pickFirstNonEmptyString(runProfile.label, t("flow.defaultControlLabel", lang)) || "").trim();
    const nextLabel = inputLabel || autoLabel || t("flow.defaultControlLabel", lang);
    const labelMode = inputLabel && inputLabel !== autoLabel ? "custom" : "auto";
    flow = await createBoardFlowControlForRunProfile({
      flow,
      anchorInstanceId,
      runProfile,
      label: nextLabel,
      labelMode,
      scope
    });
    flow = await saveBoardFlowAndCache(flow, { reflow: !isStaticFlowControlLayoutEnabled() });

    log("Board Flow Control erzeugt: '" + nextLabel + "' für " + (getInstanceLabelByInternalId(anchorInstanceId) || anchorInstanceId) + " | Scope=" + scope.type + ".");
    renderFlowAuthoringControls();
  } catch (e) {
    log("Board Flow: Control konnte nicht erzeugt werden – " + e.message);
  }
}

async function setCurrentFlowStepFromAdmin() {
  const lang = getCurrentDisplayLanguage();
  const packTemplate = getSelectedFlowPackTemplate({ lang });
  const stepTemplate = getSelectedFlowStepTemplate(packTemplate, { lang });
  if (!packTemplate || !stepTemplate) {
    log("Board Flow: Bitte Pack Template und Step Template wählen.");
    return;
  }

  try {
    const { anchorInstanceId } = await resolveAuthoringScopeFromCurrentSelection(packTemplate, "fixed_instances");
    let flow = await findOrCreateBoardFlowForPack(packTemplate.id, anchorInstanceId, { preferredStepId: stepTemplate.id, seedDefaults: !isStaticFlowControlLayoutEnabled() });
    flow = BoardFlow.setFlowCurrentStep(flow, stepTemplate.id);
    const ensuredDefaults = await ensureDefaultBoardControlsForStep(flow, stepTemplate.id);
    flow = ensuredDefaults.flow;
    flow = await saveBoardFlowAndCache(flow, { reflow: !isStaticFlowControlLayoutEnabled() });
    log("Board Flow: Aktiver Schritt gesetzt auf '" + (stepTemplate.label || stepTemplate.id) + "' für " + (flow.label || flow.id) + ".");
    renderFlowAuthoringControls();
  } catch (e) {
    log("Board Flow: Schritt konnte nicht gesetzt werden – " + e.message);
  }
}

function getSelectedFlowControlLabel(controlSelection) {
  const control = controlSelection?.control || null;
  return pickFirstNonEmptyString(control?.label, control?.id, "Flow Control");
}

async function activateSelectedFlowControlFromAdmin() {
  if (state.panelMode !== "admin") {
    log("Board Flow: Diese Admin-Aktion ist nur im Admin-Modus verfügbar.");
    return;
  }

  const selection = await Board.getSelection(log).catch(() => []);
  const controlSelection = await resolveSelectedFlowControl(selection || []);
  if (!controlSelection) {
    log("Board Flow: Bitte genau einen platzierten Flow-Button selektieren.");
    return;
  }

  const control = controlSelection.control;
  if (!control?.endpointId) {
    log("Board Flow: Der selektierte Button hat keine endpointId und kann nicht fachlich freigeschaltet werden.");
    return;
  }

  if (control.state === "active") {
    log("Board Flow: Der selektierte Button ist bereits aktiv.");
    return;
  }

  let nextFlow = BoardFlow.forceFlowControlActive(controlSelection.flow, control.id);
  nextFlow = await saveBoardFlowAndCache(nextFlow);
  const nextControl = BoardFlow.findFlowControlByItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;

  log("Board Flow: Button freigeschaltet: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ".");
  renderFlowAuthoringControls();
  await refreshSelectionStatusFromItems(selection || []);
}

async function markSelectedFlowControlDoneFromAdmin() {
  if (state.panelMode !== "admin") {
    log("Board Flow: Diese Admin-Aktion ist nur im Admin-Modus verfügbar.");
    return;
  }

  const selection = await Board.getSelection(log).catch(() => []);
  const controlSelection = await resolveSelectedFlowControl(selection || []);
  if (!controlSelection) {
    log("Board Flow: Bitte genau einen platzierten Flow-Button selektieren.");
    return;
  }

  const control = controlSelection.control;
  if (!control?.endpointId) {
    log("Board Flow: Der selektierte Button hat keine endpointId und kann nicht als erledigt markiert werden.");
    return;
  }

  if (control.state === "done") {
    log("Board Flow: Der selektierte Button ist bereits als erledigt markiert.");
    return;
  }

  let nextFlow = BoardFlow.markFlowControlDone(controlSelection.flow, control.id);
  nextFlow = await saveBoardFlowAndCache(nextFlow);
  const nextControl = BoardFlow.findFlowControlByItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;

  log("Board Flow: Button als erledigt markiert: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ".");
  renderFlowAuthoringControls();
  await refreshSelectionStatusFromItems(selection || []);
}

async function resetSelectedFlowControlFromAdmin() {
  if (state.panelMode !== "admin") {
    log("Board Flow: Diese Admin-Aktion ist nur im Admin-Modus verfügbar.");
    return;
  }

  const selection = await Board.getSelection(log).catch(() => []);
  const controlSelection = await resolveSelectedFlowControl(selection || []);
  if (!controlSelection) {
    log("Board Flow: Bitte genau einen platzierten Flow-Button selektieren.");
    return;
  }

  const control = controlSelection.control;
  if (!control?.endpointId) {
    log("Board Flow: Der selektierte Button hat keine endpointId und kann nicht zurückgesetzt werden.");
    return;
  }

  let nextFlow = BoardFlow.resetFlowControlState(controlSelection.flow, control.id);
  nextFlow = await saveBoardFlowAndCache(nextFlow);
  const nextControl = BoardFlow.findFlowControlByItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;

  log("Board Flow: Button zurückgesetzt: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ". Neuer Status: " + (nextControl?.state || "disabled") + ".");
  renderFlowAuthoringControls();
  await refreshSelectionStatusFromItems(selection || []);
}

async function clearMemoryFromAdmin() {
  if (state.panelMode !== "admin") {
    log("Memory-Reset: Diese Aktion ist nur im Admin-Modus verfügbar.");
    return;
  }

  if (state.agentRunLock || state.flowControlRunLock) {
    log("Memory-Reset: Während eines laufenden Agent- oder Flow-Runs gesperrt.");
    return;
  }

  await Board.clearMemoryState(log);
  const removedLogEntries = await Board.clearMemoryLog(log);
  state.memoryState = Memory.createEmptyMemoryState();
  state.memoryLog = [];
  renderExerciseControls();

  log("Memory gelöscht: kumulativer Memory-State geleert, entfernte Log-Einträge=" + removedLogEntries + ".");
}

async function resolveSelectedFlowControl(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length !== 1) return null;

  const item = list[0];
  const meta = await Board.readFlowControlMeta(item, log);
  if (!meta) return null;

  const persistedFlow = await Board.loadBoardFlow(meta.flowId, log).catch(() => null);
  const rawFlow = persistedFlow || state.boardFlowsById.get(meta.flowId) || null;
  if (!rawFlow) return null;
  const flow = await ensureBoardFlowHealthy(rawFlow, { persist: true, pruneMissingControls: true });
  state.boardFlowsById.set(flow.id, flow);
  await syncBoardFlowVisuals(flow);

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

function buildPromptRuntimeFromEndpoint({
  flow = null,
  control = null,
  endpoint = null,
  currentStep = null,
  exercisePack = null,
  targetInstanceIds = []
} = {}) {
  const promptModules = ExerciseLibrary.getPromptModulesByIds(endpoint?.prompt?.moduleIds || endpoint?.moduleIds || [], { lang: getCurrentDisplayLanguage() });
  const targetInstanceLabels = getInstanceLabelsFromIds(targetInstanceIds);
  const resolvedStep = currentStep || null;
  return {
    exercisePack: exercisePack || null,
    currentStep: resolvedStep,
    endpoint: endpoint || null,
    promptModules,
    controlContext: {
      flowId: flow?.id || null,
      controlId: control?.id || null,
      controlLabel: control?.label || endpoint?.label || null,
      endpointId: endpoint?.id || null,
      anchorInstanceId: flow?.anchorInstanceId || control?.anchorInstanceId || null,
      scopeType: control?.scope?.type || endpoint?.scope?.type || null,
      targetInstanceLabels
    }
  };
}

async function runAgentFromFlowControl(flow, control, selectedItem) {
  const lang = getCurrentDisplayLanguage();
  const healthyFlow = await ensureBoardFlowHealthy(flow, { persist: true, pruneMissingControls: true });
  state.boardFlowsById.set(healthyFlow.id, healthyFlow);

  const healthyControl = healthyFlow.controls?.[control?.id] || BoardFlow.findFlowControlByItemId(healthyFlow, selectedItem?.id) || control;
  const endpointId = pickFirstNonEmptyString(healthyControl?.endpointId, healthyControl?.endpointId);
  const endpoint = ExerciseLibrary.getEndpointById(endpointId, { lang });
  const exercisePack = Exercises.getExercisePackById(endpoint?.exercisePackId || getSelectedExercisePackId(), { lang });
  const resolvedStepId = pickFirstNonEmptyString(healthyControl?.stepId, endpoint?.stepId);
  const currentStep = Exercises.getExerciseStep(exercisePack, resolvedStepId, { lang }) || getCurrentExerciseStep(exercisePack, { lang });

  if (!endpoint || !exercisePack || !currentStep) {
    const missing = [
      endpoint ? null : "endpoint",
      exercisePack ? null : "exercisePack",
      currentStep ? null : "step"
    ].filter(Boolean).join(", ");
    const msg = "Board Flow: Control ist unvollständig konfiguriert" + (missing ? " (" + missing + ")" : "") + ".";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return;
  }

  if (healthyControl.state !== "active") {
    const msg = "Board Flow: Control '" + (healthyControl.label || healthyControl.id) + "' ist derzeit nicht aktiv.";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "warning" });
    return;
  }

  const requiresApiKey = endpoint.triggerKey !== "selection.apply" && endpoint.triggerKey !== "global.apply";
  if (requiresApiKey && !getApiKey()) {
    const msg = "Board Flow: Kein OpenAI API Key verfügbar.";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return;
  }

  const targetInstanceIds = resolveTargetInstanceIdsFromFlowScope(healthyControl.scope, packTemplate);
  const targetInstanceLabels = getInstanceLabelsFromIds(targetInstanceIds);
  const triggerContext = ExerciseEngine.resolveEndpointContext({
    endpoint,
    pack: exercisePack,
    step: currentStep,
    source: "user",
    selectionCount: targetInstanceIds.length,
    targetInstanceLabels,
    boardConfig: state.boardConfig
  });

  if (!triggerContext.valid) {
    const msg = "Board Flow: " + (triggerContext.reason || "Endpoint ist im aktuellen Kontext nicht ausführbar.");
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "warning" });
    return;
  }

  const promptRuntimeOverride = buildPromptRuntimeFromEndpoint({
    flow: healthyFlow,
    control: healthyControl,
    endpoint,
    currentStep,
    exercisePack,
    packTemplate,
    targetInstanceIds
  });
  const sourceLabel = healthyControl.label || endpoint.label || "Flow Control";
  const runMode = buildRunModeFromTriggerKey(triggerContext.triggerKey);

  const nextFlow = {
    ...healthyFlow,
    controls: {
      ...healthyFlow.controls,
      [healthyControl.id]: {
        ...healthyControl,
        state: healthyControl.state
      }
    }
  };
  state.boardFlowsById.set(nextFlow.id, nextFlow);

  if (triggerContext.scope === "global") {
    await runGlobalAgent(healthyFlow.anchorInstanceId || null, resolveBoardUserSeedText(healthyFlow.anchorInstanceId, getCurrentUserQuestion()), {
      runMode,
      triggerContext,
      sourceLabel,
      forcedInstanceIds: targetInstanceIds,
      updateGlobalBaseline: false,
      forceTargetSet: true,
      promptRuntimeOverride
    });
  } else {
    await runAgentForSelectedInstances(targetInstanceIds, {
      runMode,
      triggerContext,
      sourceLabel,
      userText: resolveBoardUserSeedText(healthyFlow.anchorInstanceId, getCurrentUserQuestion()),
      promptRuntimeOverride
    });
  }
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

async function runEndpoint(endpoint) {
  if (!endpoint?.id || !endpoint?.triggerKey) {
    log("Exercise-Modus: Endpoint konnte nicht gestartet werden – Endpoint oder Trigger fehlt.");
    return null;
  }

  const lang = getCurrentDisplayLanguage();
  const exercisePack = Exercises.getExercisePackById(endpoint.exercisePackId || getSelectedExercisePackId(), { lang }) || getSelectedExercisePack({ lang });
  const currentStep = Exercises.getExerciseStep(exercisePack, endpoint.stepId, { lang }) || getCurrentExerciseStep(exercisePack, { lang });

  if (!exercisePack || !currentStep) {
    log("Exercise-Modus: Endpoint konnte nicht gestartet werden – Pack oder Schritt fehlen.");
    return null;
  }

  let targetInstanceIds = [];
  const scopeType = pickFirstNonEmptyString(endpoint?.scope?.type, endpoint?.defaultScopeType, "fixed_instances");
  if (scopeType === "global") {
    const allowedCanvasTypes = new Set(Exercises.getAllowedCanvasTypesForPack(exercisePack));
    targetInstanceIds = Array.from(state.instancesById.keys()).filter((instanceId) => {
      const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
      return !allowedCanvasTypes.size || (canvasTypeId && allowedCanvasTypes.has(canvasTypeId));
    });
  } else {
    const selectedInstanceIds = await refreshSelectionStatusFromBoard();
    const allowedCanvasTypes = new Set(Exercises.getAllowedCanvasTypesForPack(exercisePack));
    targetInstanceIds = selectedInstanceIds.filter((instanceId) => {
      const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
      return !allowedCanvasTypes.size || (canvasTypeId && allowedCanvasTypes.has(canvasTypeId));
    });
  }

  const targetInstanceLabels = targetInstanceIds.map((instanceId) => getInstanceLabelByInternalId(instanceId)).filter(Boolean);
  const triggerContext = ExerciseEngine.resolveEndpointContext({
    endpoint,
    pack: exercisePack,
    step: currentStep,
    source: getCurrentTriggerSource(),
    selectionCount: targetInstanceIds.length,
    targetInstanceLabels,
    boardConfig: state.boardConfig
  });

  if (!triggerContext.valid) {
    log(buildTriggerSourceLabel(triggerContext) + ": " + (triggerContext.reason || "Endpoint ist im aktuellen Kontext nicht ausführbar."));
    return null;
  }

  const promptRuntimeOverride = buildPromptRuntimeFromEndpoint({
    endpoint,
    currentStep,
    exercisePack,
    targetInstanceIds
  });

  if (scopeType === "global") {
    return await runGlobalAgent(null, getCurrentUserQuestion(), {
      runMode: buildRunModeFromTriggerKey(triggerContext.triggerKey),
      triggerContext,
      sourceLabel: endpoint.label || buildTriggerSourceLabel(triggerContext),
      forcedInstanceIds: targetInstanceIds,
      updateGlobalBaseline: false,
      forceTargetSet: true,
      promptRuntimeOverride
    });
  }

  return await runAgentForSelectedInstances(targetInstanceIds, {
    triggerContext,
    runMode: buildRunModeFromTriggerKey(triggerContext.triggerKey),
    sourceLabel: endpoint.label || buildTriggerSourceLabel(triggerContext),
    userText: getCurrentUserQuestion(),
    promptRuntimeOverride
  });
}

async function runEndpointById(endpointId) {
  const lang = getCurrentDisplayLanguage();
  const endpoint = ExerciseLibrary.getEndpointById(endpointId, { lang });
  if (!endpoint?.id) {
    log("Exercise-Modus: Endpoint nicht gefunden: " + String(endpointId || "(leer)"));
    return null;
  }
  return await runEndpoint(endpoint);
}

async function runExerciseRunProfile(runProfile) {
  return await runEndpoint(runProfile);
}

async function runExerciseRunProfileById(endpointId) {
  return await runEndpointById(endpointId);
}

async function runExerciseAdminTriggerSelection() {
  const triggerKey = pickFirstNonEmptyString(exerciseAdminTriggerEl?.value);
  if (!triggerKey) {
    log("Exercise-Modus: Kein Admin-Trigger ausgewählt.");
    return null;
  }
  return await runExerciseTriggerRequest({
    triggerKey,
    source: getCurrentTriggerSource()
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
    memoryStepStatus: getCurrentMemoryStepStatus()
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

  await persistExerciseRuntime({
    currentStepId: nextStep.id,
    lastFlowDirectiveUnlockEndpointIds: [],
    lastFlowDirectiveCompleteEndpointIds: [],
    lastFlowDirectiveAt: null
  });
  if (pack?.id && nextStep?.id) {
    await syncExerciseStepToBoardFlow(nextStep.id, { exercisePackId: pack.id });
  }
  renderExerciseControls();
  await syncAllChatApplyButtonsForCurrentStep();

  log(
    "Exercise-Schritt weitergeschaltet: " +
    (currentStep?.label || "(kein Schritt)") +
    " -> " +
    (nextStep.label || nextStep.id)
  );
}

function renderCanvasTypePicker() {
  if (!canvasTypePickerEl) return;

  const lang = getCurrentDisplayLanguage();
  const entries = getCanvasTypeCatalogEntries();
  const selectedCanvasTypeId = getSelectedCanvasTypeId();
  const allowedCanvasTypeIds = new Set(getAllowedCanvasTypeIdsForCurrentPack());
  const hasRestriction = allowedCanvasTypeIds.size > 0;

  canvasTypePickerEl.textContent = "";

  if (entries.length === 0) {
    canvasTypePickerEl.textContent = t("canvas.noneConfigured", lang);
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
      : t("canvas.notAllowedMeta", lang, { canvasTypeId: entry.canvasTypeId });

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
  applyStaticUiLanguage(getCurrentDisplayLanguage());
  installPanelRuntimeBridgeLifecycle();
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
  boardLanguageEl?.addEventListener("change", async () => {
    await applyBoardLanguage(boardLanguageEl?.value || "de", { syncBoardChrome: true });
  });
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
  flowStaticLayoutToggleEl?.addEventListener("change", onStaticFlowLayoutToggleChange);

  document.getElementById("btn-save-admin-override")?.addEventListener("click", saveAdminOverrideFromUi);
  document.getElementById("btn-clear-admin-override")?.addEventListener("click", clearAdminOverrideFromUi);

  btnExerciseAdminTriggerRunEl?.addEventListener("click", runExerciseAdminTriggerSelection);
  btnExerciseNextStepEl?.addEventListener("click", advanceExerciseStep);
  btnFlowCreateControlEl?.addEventListener("click", createFlowControlFromAdmin);
  btnFlowSetCurrentStepEl?.addEventListener("click", setCurrentFlowStepFromAdmin);
  btnFlowActivateSelectedControlEl?.addEventListener("click", activateSelectedFlowControlFromAdmin);
  btnFlowCompleteSelectedControlEl?.addEventListener("click", markSelectedFlowControlDoneFromAdmin);
  btnFlowResetSelectedControlEl?.addEventListener("click", resetSelectedFlowControlFromAdmin);

  document.getElementById("btn-insert-template")?.addEventListener("click", insertTemplateImage);
  btnMemoryClearAdminEl?.addEventListener("click", clearMemoryFromAdmin);

  // optional exports for debugging/back-compat
  window.dtInsertTemplateImage = insertTemplateImage;
  window.dtClassifyStickies = (opts) => classifyStickies(opts || {});
  window.dtCallOpenAI = callOpenAIClassic;
  window.dtClusterSelection = clusterSelectionFromPanel;
  window.dtRunAgentForCurrentSelection = runAgentForCurrentSelection;
  window.dtRunAgentForInstance = runAgentForInstance;
  window.dtRunExerciseCheck = runExerciseCheck;
  window.dtRunExerciseHint = runExerciseHint;
  window.dtRunExerciseAutocorrect = runExerciseAutocorrect;
  window.dtRunExerciseReview = () => runExerciseTriggerRequest({ scope: "selection", intent: "review", source: getCurrentTriggerSource() });
  window.dtRunExerciseCoach = () => runExerciseTriggerRequest({ scope: "selection", intent: "coach", source: getCurrentTriggerSource() });
  window.dtRunExerciseTrigger = runExerciseTriggerRequest;
  window.dtAdvanceExerciseStep = advanceExerciseStep;
  window.dtCreateFlowControl = createFlowControlFromAdmin;
  window.dtSetFlowStep = setCurrentFlowStepFromAdmin;
  window.dtActivateSelectedFlowControl = activateSelectedFlowControlFromAdmin;
  window.dtMarkSelectedFlowControlDone = markSelectedFlowControlDoneFromAdmin;
  window.dtResetSelectedFlowControl = resetSelectedFlowControlFromAdmin;
  window.dtClearMemory = clearMemoryFromAdmin;

  renderPanelMode();
}
if (!IS_HEADLESS) initPanelButtons();

// --------------------------------------------------------------------
// Boot
// --------------------------------------------------------------------
(async function boot() {
  await Board.ensureMiroReady(log);
  bindClusterSessionBridge();
  restoreClusterSessionStateFromBridge();
  log("Runtime-Kontext: " + RUNTIME_CONTEXT);
  await afterMiroReady();
})().catch((e) => {
  console.error("[DT] Boot fehlgeschlagen:", e);
  log("Boot Fehler: " + (e?.message || String(e)));
});

async function afterMiroReady() {
  if (state.initialized) return;
  state.initialized = true;

  await ensureRuntimeIdentity();
  if (!IS_HEADLESS) {
    startPanelRuntimeBridge();
  }

  // Baseline meta laden
  const meta = await Board.loadPersistedBaselineMeta(log);
  state.hasGlobalBaseline = !!meta.hasGlobalBaseline;
  state.globalBaselineAt = meta.baselineAt || null;

  // Initial scan
  await ensureInstancesScanned(true);
  await loadMemoryRuntimeState();
  await loadBoardExerciseState();
  await Board.purgeLegacyProposalStorage(log);
  await syncAllChatInterfacesLayout();
  await loadBoardFlows();
  renderFlowAuthoringControls({ forceLabelSync: true });
  await registerHeadlessClusterCustomAction();

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
  state.memoryLog = Memory.getRecentMemoryEntries(
    Memory.normalizeMemoryLog(await Board.loadMemoryLog(log)),
    DT_MEMORY_RECENT_LOG_LIMIT
  );
}

function buildMemoryInjectionPayload({ proposalMode = false } = {}) {
  const memoryState = Memory.normalizeMemoryState(state.memoryState || Memory.createEmptyMemoryState());
  if (!proposalMode) {
    return {
      memoryState,
      recentMemoryLogEntries: Memory.getRecentMemoryEntries(state.memoryLog, DT_MEMORY_RECENT_LOG_LIMIT)
    };
  }

  return {
    memoryState: {
      ...memoryState,
      nextFocus: null,
      lastSummary: null
    },
    recentMemoryLogEntries: []
  };
}

function buildProposalId() {
  return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function resolveRunStepId(promptRuntimeOverride = null) {
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  return pickFirstNonEmptyString(runtime?.flowStep?.id, getCurrentExerciseStepId());
}

function resolveRunStepLabel(promptRuntimeOverride = null) {
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  const lang = getCurrentDisplayLanguage();
  return pickFirstNonEmptyString(runtime?.flowStep?.label, getCurrentExerciseStep(undefined, { lang })?.label);
}

function resolveRunPackTemplateId(promptRuntimeOverride = null) {
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  return pickFirstNonEmptyString(runtime?.packTemplate?.id, getSelectedExercisePackTemplateId());
}

function buildAreaTitleFromAreaKey(areaKey, canvasTypeId = null) {
  const normalizedAreaKey = pickFirstNonEmptyString(areaKey);
  if (!normalizedAreaKey) return null;
  const region = Catalog.areaNameToRegion(normalizedAreaKey, canvasTypeId) || Catalog.areaNameToRegion(normalizedAreaKey, null);
  return region?.title || normalizedAreaKey;
}

function truncateProposalText(value, maxLength = 72) {
  const text = pickFirstNonEmptyString(value);
  if (!text) return null;
  return text.length > maxLength ? (text.slice(0, maxLength - 1).trimEnd() + "…") : text;
}

function summarizeProposalActionsForPrompt(actions, canvasTypeId = null) {
  const bullets = [];
  for (const rawAction of Array.isArray(actions) ? actions : []) {
    const action = normalizeAgentAction(rawAction);
    if (!action || action.type === "inform") continue;

    if (action.type === "create_sticky") {
      const areaTitle = buildAreaTitleFromAreaKey(action.area, canvasTypeId) || "dem Canvas";
      const textPreview = truncateProposalText(action.text, 56);
      bullets.push(textPreview
        ? (`würde eine Sticky in ${areaTitle} anlegen: „${textPreview}“`)
        : (`würde eine Sticky in ${areaTitle} anlegen`));
      continue;
    }

    if (action.type === "move_sticky") {
      const areaTitle = buildAreaTitleFromAreaKey(action.targetArea || action.area, canvasTypeId) || "einen anderen Bereich";
      bullets.push(`würde eine Sticky nach ${areaTitle} verschieben`);
      continue;
    }

    if (action.type === "delete_sticky") {
      bullets.push("würde eine Sticky entfernen");
      continue;
    }

    if (action.type === "create_connector") {
      bullets.push("würde eine explizite Beziehung als Connector ergänzen");
      continue;
    }

    if (action.type === "set_sticky_color") {
      bullets.push(`würde eine Sticky farblich auf ${action.color || "eine Miro-Farbe"} setzen`);
      continue;
    }

    if (action.type === "set_check_status") {
      bullets.push(action.checked === false
        ? "würde einen Check-Status entfernen"
        : "würde einen Check-Status setzen");
      continue;
    }
  }
  return Array.from(new Set(bullets)).slice(0, 8);
}

function simplifyProposalForPrompt(proposal, instanceId = null) {
  if (!proposal || typeof proposal !== "object") return null;
  const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
  const canvasTypeId = proposal.canvasTypeId || instance?.canvasTypeId || null;
  return {
    proposalId: proposal.proposalId || null,
    status: proposal.status || null,
    stepId: proposal.stepId || null,
    createdAt: proposal.createdAt || null,
    summary: pickFirstNonEmptyString(proposal.feedback?.summary, proposal.memoryEntry?.summary, proposal.analysis),
    actionPreview: summarizeProposalActionsForPrompt(proposal.actions, canvasTypeId)
  };
}

async function loadPendingProposalForInstance(instanceId, { stepId = null } = {}) {
  if (!instanceId || !state.instancesById.has(instanceId)) return null;
  return await Board.loadActiveProposal({
    anchorInstanceId: instanceId,
    stepId: pickFirstNonEmptyString(stepId)
  }, log);
}


async function syncAllChatInterfacesLayout() {
  for (const instance of state.instancesById.values()) {
    if (!Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface)) continue;
    try {
      await Board.syncChatInterfaceLayoutForInstance(instance, instance.chatInterface, log, {
        lang: getCurrentDisplayLanguage()
      });
    } catch (error) {
      log("WARNUNG: Chat-Layout konnte nicht synchronisiert werden: " + formatRuntimeErrorMessage(error));
    }
  }
}

async function hasPendingProposalForInstanceStep(instanceId, stepId) {
  const proposal = await loadPendingProposalForInstance(instanceId, { stepId });
  return !!proposal?.proposalId;
}

async function syncChatApplyButtonForInstance(instanceId, { stepId = null } = {}) {
  const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
  if (!instance || !Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface) || !Board.hasApplyChatInterfaceShapeId(instance.chatInterface)) {
    return false;
  }

  const normalizedStepId = pickFirstNonEmptyString(stepId, getCurrentExerciseStepId());
  const enabled = !!(normalizedStepId && await hasPendingProposalForInstanceStep(instanceId, normalizedStepId));
  try {
    await Board.syncChatApplyButtonState(instance.chatInterface, {
      enabled,
      lang: getCurrentDisplayLanguage()
    }, log);
  } catch (error) {
    log("WARNUNG: Apply-Button konnte nicht synchronisiert werden: " + formatRuntimeErrorMessage(error));
  }
  return enabled;
}

async function syncChatApplyButtonsForInstanceIds(instanceIds, { stepId = null } = {}) {
  for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
    await syncChatApplyButtonForInstance(instanceId, { stepId });
  }
}

async function syncAllChatApplyButtonsForCurrentStep() {
  await syncChatApplyButtonsForInstanceIds(Array.from(state.instancesById.keys()), {
    stepId: getCurrentExerciseStepId()
  });
}

async function clearPendingProposalForInstanceStep(instanceId, stepId) {
  if (!instanceId || !stepId) return false;
  return await Board.clearActiveProposal({
    anchorInstanceId: instanceId,
    stepId
  }, log);
}

async function buildPendingProposalPayloadForInstances(instanceIds, { stepId = null } = {}) {
  const payload = Object.create(null);
  for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
    const instance = state.instancesById.get(instanceId);
    if (!instance?.instanceLabel) continue;
    const proposal = await loadPendingProposalForInstance(instanceId, { stepId });
    if (!proposal) continue;
    payload[instance.instanceLabel] = simplifyProposalForPrompt(proposal, instanceId);
  }
  return payload;
}

function findRunProfileIdForStepTrigger(exercisePackId, stepId, triggerKey) {
  const normalizedPackId = pickFirstNonEmptyString(exercisePackId);
  const normalizedStepId = pickFirstNonEmptyString(stepId);
  const normalizedTriggerKey = ExerciseEngine.normalizeTriggerKey(triggerKey);
  if (!normalizedPackId || !normalizedStepId || !normalizedTriggerKey) return null;

  const lang = getCurrentDisplayLanguage();
  const endpoints = ExerciseLibrary.listStepEndpoints(normalizedPackId, normalizedStepId, { lang });
  const match = endpoints.find((entry) => entry?.stepId === normalizedStepId && entry?.triggerKey === normalizedTriggerKey);
  return match?.id || null;
}

function cloneJsonValue(value) {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function hasExecutableProposalActions(actions) {
  return Array.isArray(actions) && actions.some((rawAction) => {
    const normalized = normalizeAgentAction(rawAction);
    return normalized && normalized.type !== "inform";
  });
}

function buildStoredProposalRecord({
  instanceId,
  stepId,
  stepLabel = null,
  exercisePackId = null,
  triggerContext = null,
  promptRuntimeOverride = null,
  userRequest = null,
  basedOnStateHash = null,
  agentObj = null,
  feedback = null,
  flowControlDirectives = null,
  evaluation = null
} = {}) {
  const instance = state.instancesById.get(instanceId) || null;
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  const controlContext = runtime?.controlContext || null;
  return {
    version: 1,
    proposalId: buildProposalId(),
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    anchorInstanceId: instance?.instanceId || instanceId || null,
    anchorInstanceLabel: instance?.instanceLabel || null,
    canvasTypeId: instance?.canvasTypeId || null,
    exercisePackId: pickFirstNonEmptyString(exercisePackId, runtime?.packTemplate?.id),
    stepId: pickFirstNonEmptyString(stepId),
    stepLabel: pickFirstNonEmptyString(stepLabel, runtime?.flowStep?.label),
    triggerKey: triggerContext?.triggerKey || null,
    triggerSource: triggerContext?.source || null,
    endpointId: controlContext?.endpointId || runtime?.runProfile?.id || null,
    controlId: controlContext?.controlId || null,
    userRequest: pickFirstNonEmptyString(userRequest),
    basedOnStateHash: pickFirstNonEmptyString(basedOnStateHash),
    analysis: pickFirstNonEmptyString(agentObj?.analysis),
    feedback: cloneJsonValue(feedback),
    actions: cloneJsonValue(agentObj?.actions || []),
    memoryEntry: cloneJsonValue(agentObj?.memoryEntry),
    flowControlDirectives: cloneJsonValue(flowControlDirectives),
    evaluation: cloneJsonValue(evaluation)
  };
}

function buildNoPendingProposalFeedback(sourceLabel = "Vorschläge anwenden", lang = null) {
  const uiLang = normalizeUiLanguage(lang || getCurrentDisplayLanguage());
  if (uiLang === "en") {
    return {
      title: "No pending proposal",
      summary: "There is currently no saved proposal for this canvas and step.",
      sections: [
        {
          heading: "Next step",
          bullets: [`Use ${sourceLabel} only after a proposal has been generated for the current step.`]
        }
      ]
    };
  }
  return {
    title: "Kein offener Vorschlag",
    summary: "Für diese Canvas-Instanz und diesen Schritt liegt aktuell kein gespeicherter Vorschlag vor.",
    sections: [
      {
        heading: "Nächster Schritt",
        bullets: [`Nutze „${sourceLabel}“ erst dann, wenn zuvor ein Vorschlag für den aktuellen Schritt erzeugt wurde.`]
      }
    ]
  };
}

function buildStaleProposalFeedback(sourceLabel = "Vorschläge anwenden", lang = null) {
  const uiLang = normalizeUiLanguage(lang || getCurrentDisplayLanguage());
  if (uiLang === "en") {
    return {
      title: "Proposal is outdated",
      summary: "The canvas changed after the proposal was created. The stored proposal was therefore not applied.",
      sections: [
        {
          heading: "Next step",
          bullets: [`Generate a fresh proposal before using ${sourceLabel} again.`]
        }
      ]
    };
  }
  return {
    title: "Vorschlag ist veraltet",
    summary: "Der Canvas wurde nach dem Erzeugen des Vorschlags verändert. Der gespeicherte Vorschlag wurde deshalb nicht angewendet.",
    sections: [
      {
        heading: "Nächster Schritt",
        bullets: [`Erzeuge bitte zuerst einen neuen Vorschlag, bevor du „${sourceLabel}“ erneut nutzt.`]
      }
    ]
  };
}

function buildAppliedProposalFeedback(proposal, actionResult, lang = null) {
  const uiLang = normalizeUiLanguage(lang || getCurrentDisplayLanguage());
  const executed = Number(actionResult?.executedMutationCount || 0);
  const failed = Number(actionResult?.failedActionCount || 0);
  const skipped = Number(actionResult?.skippedCount || 0);
  const summary = uiLang === "en"
    ? "The saved proposal was applied to the current canvas."
    : "Der gespeicherte Vorschlag wurde auf die aktuelle Canvas-Instanz angewendet.";
  const bullets = [];
  if (executed > 0) bullets.push(uiLang === "en" ? `${executed} mutation(s) executed.` : `${executed} Mutation(en) ausgeführt.`);
  if (failed > 0) bullets.push(uiLang === "en" ? `${failed} action(s) failed.` : `${failed} Action(s) fehlgeschlagen.`);
  if (skipped > 0) bullets.push(uiLang === "en" ? `${skipped} action(s) skipped.` : `${skipped} Action(s) übersprungen.`);
  if (proposal?.feedback?.summary) {
    bullets.push(uiLang === "en"
      ? `Original proposal summary: ${proposal.feedback.summary}`
      : `Zusammenfassung des bestätigten Vorschlags: ${proposal.feedback.summary}`);
  }
  return {
    title: uiLang === "en" ? "Proposal applied" : "Vorschlag angewendet",
    summary,
    sections: bullets.length ? [{ heading: uiLang === "en" ? "Result" : "Ergebnis", bullets }] : []
  };
}

async function renderAgentResponseToInstanceOutput({
  instanceId,
  feedback,
  flowControlDirectives = null,
  evaluation = null,
  sourceLabel = "Agent"
} = {}) {
  const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
  if (!instance) {
    return { instanceId: null, instanceLabel: null, outputShapeId: null };
  }

  if (!Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface)) {
    log(`WARNUNG: ${sourceLabel}: Keine vollständige Chat-Ausgabe für '${instance.instanceLabel || instanceId}'.`);
    return {
      instanceId,
      instanceLabel: instance.instanceLabel || instanceId,
      outputShapeId: null
    };
  }

  const html = Board.buildAgentFeedbackContent({
    feedback,
    flowControlDirectives,
    evaluation,
    lang: getCurrentDisplayLanguage()
  });
  await Board.writeChatOutputContent(instance.chatInterface, html, log);
  return {
    instanceId,
    instanceLabel: instance.instanceLabel || instanceId,
    outputShapeId: instance.chatInterface.outputShapeId || null
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
    exercisePack: runtime?.exercisePack || getSelectedExercisePack(),
    currentStep: runtime?.currentStep || runtime?.flowStep || getCurrentExerciseStep(),
    packTemplate: runtime?.packTemplate || null,
    flowStep: runtime?.flowStep || runtime?.currentStep || null,
    runProfile: runtime?.runProfile || runtime?.endpoint || null,
    endpoint: runtime?.endpoint || null,
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
    grade: "Bewertung",
    propose: "Vorschlag",
    apply: "Anwenden"
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
  const flowControlDirectives = ExerciseEngine.normalizeFlowControlDirectivesBlock(agentObj?.flowControlDirectives);
  const evaluation = ExerciseEngine.normalizeEvaluationBlock(agentObj?.evaluation);

  if (triggerContext?.intent === "grade" && !evaluation) {
    log("WARNUNG: Grade-Trigger ohne evaluation im Agent-Output.");
  }

  return { feedback, flowControlDirectives, evaluation };
}


function resolveAgentExecutionMode(agentObj, triggerContext, triggerIntent) {
  const forcedExecutionMode = triggerIntent === "hint"
    ? "none"
    : (triggerIntent === "propose" ? "proposal_only" : null);

  return ExerciseEngine.resolveEffectiveExecutionMode({
    rawExecutionMode: agentObj?.executionMode,
    forcedExecutionMode,
    allowedExecutionModes: triggerContext?.allowedExecutionModes || ["none"]
  });
}

async function persistExerciseRuntimeAfterAgentRun({
  triggerContext = null,
  flowControlDirectives = null,
  activeAnchorContext = null
} = {}) {
  if (!triggerContext) return null;

  const runtimePatch = {
    lastTriggerKey: triggerContext.triggerKey || null,
    lastTriggerSource: triggerContext.source || null,
    lastTriggerAt: new Date().toISOString(),
    lastFlowDirectiveUnlockEndpointIds: Array.isArray(flowControlDirectives?.unlockEndpointIds) ? flowControlDirectives.unlockEndpointIds.slice() : [],
    lastFlowDirectiveCompleteEndpointIds: Array.isArray(flowControlDirectives?.completeEndpointIds) ? flowControlDirectives.completeEndpointIds.slice() : [],
    lastFlowDirectiveAt: (flowControlDirectives?.unlockEndpointIds?.length || flowControlDirectives?.completeEndpointIds?.length) ? new Date().toISOString() : null
  };

  if (activeAnchorContext?.exercisePackId && activeAnchorContext?.anchorInstanceId) {
    runtimePatch.lastActiveExercisePackId = activeAnchorContext.exercisePackId;
    runtimePatch.lastActiveAnchorInstanceId = activeAnchorContext.anchorInstanceId;
  }

  await persistExerciseRuntime(runtimePatch);
  renderExerciseControls();
  return null;
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
      createChatInterface: !IS_HEADLESS,
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

    const chatMeta = await Board.readChatInterfaceMeta(item, log);
    if (chatMeta?.instanceId) {
      addInstanceId(chatMeta.instanceId);
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
      const boardRect = await Board.resolveBoardRect(item, parentGeomCache, log).catch(() => null);
      if (boardRect) {
        const instanceByRect = Board.findInstanceByRect(boardRect, geomEntries)
          || Board.findInstanceByPoint(boardRect.x, boardRect.y, geomEntries);
        if (instanceByRect?.instanceId) {
          addInstanceId(instanceByRect.instanceId);
          continue;
        }
      }

      const pos = await Board.resolveBoardCoords(item, parentGeomCache, log);
      if (!pos) continue;
      const instance = Board.findInstanceByPoint(pos.x, pos.y, geomEntries);
      if (instance?.instanceId) addInstanceId(instance.instanceId);
    } catch (_) {}
  }

  return resolved;
}

function buildSelectionStatusText({ itemCount, instanceIds }) {
  const lang = getCurrentDisplayLanguage();
  const ids = Array.isArray(instanceIds) ? instanceIds : [];
  const labels = getInstanceLabelsFromIds(ids);

  if (itemCount === 0) {
    return [
      t("selection.none", lang),
      t("selection.none.detail", lang)
    ].join("\n");
  }

  if (labels.length === 0) {
    return [
      t("selection.unresolved", lang),
      t("selection.unresolved.items", lang, { count: itemCount }),
      t("selection.unresolved.hint", lang)
    ].join("\n");
  }

  return [
    t("selection.selectedCount", lang, { count: labels.length }),
    t("selection.instances", lang, { labels: labels.join(", ") }),
    t("selection.itemCount", lang, { count: itemCount })
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
  renderExerciseActionSurface();
  renderRecommendationStatus();
  void refreshExerciseInteractionSurface();

  return instanceIds;
}

async function refreshSelectionStatusFromBoard() {
  const selection = await Board.getSelection(log).catch(() => []);
  return await refreshSelectionStatusFromItems(selection || []);
}

async function restoreSelectionAfterBoardButtonRun(instanceId = null) {
  const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
  const imageId = pickFirstNonEmptyString(instance?.imageId ? String(instance.imageId) : null);

  state.handlingSelection = true;
  try {
    if (imageId) {
      await Board.selectItems({ id: imageId }, log);
    } else {
      await Board.deselectItems(null, log);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  } catch (error) {
    log("WARNUNG: Board-Selektion konnte nach Button-Run nicht zurückgesetzt werden: " + formatRuntimeErrorMessage(error));
    try {
      await Board.deselectItems(null, log);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    } catch (_) {}
  } finally {
    state.handlingSelection = false;
  }
}

async function executeSelectedFlowControl(controlSelection, items) {
  const anchorInstanceId = pickFirstNonEmptyString(
    controlSelection?.flow?.anchorInstanceId,
    controlSelection?.control?.anchorInstanceId
  );
  const now = Date.now();
  if (
    state.lastTriggeredFlowControlItemId === controlSelection.item.id &&
    now - Number(state.lastTriggeredFlowControlAt || 0) < 1200
  ) {
    await restoreSelectionAfterBoardButtonRun(anchorInstanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  state.flowControlRunLock = true;
  state.lastTriggeredFlowControlItemId = controlSelection.item.id;
  state.lastTriggeredFlowControlAt = now;
  try {
    await runAgentFromFlowControl(controlSelection.flow, controlSelection.control, controlSelection.item);
  } finally {
    await restoreSelectionAfterBoardButtonRun(anchorInstanceId);
    state.flowControlRunLock = false;
    await refreshSelectionStatusFromBoard();
  }
}

async function onSelectionUpdate(event) {
  if (state.handlingSelection || state.flowControlRunLock || state.agentRunLock) return;
  const items = event?.items || [];

  const chatSelection = await resolveSelectedChatSubmit(items);
  if (chatSelection) {
    const headlessShouldRun = shouldHeadlessHandleFlowControls();
    const panelShouldRun = shouldPanelHandleFlowControls();

    if (headlessShouldRun || panelShouldRun) {
      await executeSelectedChatSubmit(chatSelection, items);
    } else {
      await refreshSelectionStatusFromItems(items);
    }
    return;
  }

  const chatApplySelection = await resolveSelectedChatApply(items);
  if (chatApplySelection) {
    const headlessShouldRun = shouldHeadlessHandleFlowControls();
    const panelShouldRun = shouldPanelHandleFlowControls();

    if (headlessShouldRun || panelShouldRun) {
      await executeSelectedChatApply(chatApplySelection, items);
    } else {
      await refreshSelectionStatusFromItems(items);
    }
    return;
  }

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
  defaultWidthPx: 4550,
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
  const lang = getCurrentDisplayLanguage();
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
      getCanvasTypeEntry,
      canvasDefs: DT_CANVAS_DEFS,
      defaultTemplateId: TEMPLATE_ID,
      isFiniteNumber,
      log
    });

    const image = await Board.createImage({
      url: selectedCanvasType.imageUrl,
      x: placement.x,
      y: placement.y,
      width: placement.imageWidth || insertWidthPx
    }, log);

    let backgroundShape = null;
    try {
      backgroundShape = await Board.createShape({
        content: "",
        shape: "rectangle",
        x: placement.x,
        y: placement.y,
        width: placement.footprintWidth,
        height: placement.footprintHeight,
        style: {
          fillColor: "#f3c316",
          fillOpacity: 1,
          borderOpacity: 0,
          borderWidth: 0,
          color: "#f3c316"
        }
      }, log);
      try {
        if (typeof backgroundShape?.sendBehindOf === "function") {
          await backgroundShape.sendBehindOf(image);
        }
      } catch (_) {}
      try {
        if (typeof backgroundShape?.sendToBack === "function") {
          await backgroundShape.sendToBack();
        }
      } catch (_) {}
    } catch (bgError) {
      log("WARNUNG: Gelber Canvas-Hintergrund konnte nicht erzeugt werden: " + bgError.message);
    }

    const instance = await Board.registerInstanceFromImage(image, {
      templateCatalog: DT_TEMPLATE_CATALOG,
      defaultTemplateId: TEMPLATE_ID,
      instancesByImageId: state.instancesByImageId,
      instancesById: state.instancesById,
      hasGlobalBaseline: state.hasGlobalBaseline,
      canvasTypeId: selectedCanvasTypeId,
      displayLanguage: lang,
      log,
      createChatInterface: true
    });
    rebuildInstancesByLabelIndex();

    const placementInfo = placement.usedViewportCenter
      ? "Neue Instanz wurde mittig in der aktuellen View platziert."
      : "Neue Instanz wurde nahe der aktuellen View platziert, mit Überlappungsschutz.";

    log(`Canvas eingefügt: ${instance?.instanceLabel || selectedCanvasType.displayName} (${selectedCanvasTypeId}), Bild-ID ${image.id}
${placementInfo}
Die Steuerung erfolgt jetzt über das Side Panel.`);

    await Board.zoomTo(backgroundShape || image, log);
    await refreshSelectionStatusFromBoard();
    await syncChatApplyButtonForInstance(instance.instanceId);
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
  restoreClusterSessionStateFromBridge();
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
    const message = "Keine Sticky Notes ausgewählt.";
    log(message);
    return { ok: false, warning: true, message };
  }

  const geomEntries = await Board.buildInstanceGeometryIndex(state.instancesById, log);

  const byInstance = Object.create(null);
  const outside = [];

  const parentGeomCache = new Map();

  for (const s of stickyNotes) {
    let boardRect = null;
    let boardPos = null;
    try {
      boardRect = await Board.resolveBoardRect(s, parentGeomCache, log);
    } catch (_) {}
    if (!boardRect) {
      try {
        boardPos = await Board.resolveBoardCoords(s, parentGeomCache, log);
      } catch (_) {}
    }

    const instance = boardRect
      ? (Board.findInstanceByRect(boardRect, geomEntries) || Board.findInstanceByPoint(boardRect.x, boardRect.y, geomEntries))
      : (boardPos ? Board.findInstanceByPoint(boardPos.x, boardPos.y, geomEntries) : null);

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
    const message = "Keine der ausgewählten Stickies liegt über einem Canvas.";
    log(message);
    return { ok: false, warning: true, message };
  }
  if (instanceIds.length > 1) {
    const message = "Auswahl enthält Stickies aus mehreren Instanzen. Bitte nur eine Instanz clustern.";
    log(message);
    return { ok: false, warning: true, message };
  }

  const instanceId = instanceIds[0];

  if (expectedInstanceIdOrNull && instanceId !== expectedInstanceIdOrNull) {
    const message = "Cluster-Button gehört zu einer anderen Instanz als die Sticky-Auswahl.";
    log(message);
    return { ok: false, warning: true, message };
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
      const message = "Unterstrichener Sticky ist leer. Bitte lesbaren Namen unterstreichen.";
      log(message);
      return { ok: false, warning: true, message };
    }
    clusterName = candidate;
  } else {
    const countSeed = (state.clusterCounterByInstanceId.get(instanceId) || 0) + 1;
    state.clusterCounterByInstanceId.set(instanceId, countSeed);
    clusterName = "Cluster " + countSeed;
  }

  for (const s of notesInInstance) state.clusterAssignments.set(s.id, clusterName);
  for (const s of outside) state.clusterAssignments.set(s.id, clusterName);

  persistClusterSessionStateToBridge();
  await refreshBoardState();

  const count = notesInInstance.length + outside.length;
  log("Cluster '" + clusterName + "' gesetzt für " + count + " Stickies (Session-State).");
  return { ok: true, clusterName, count, instanceId };
}

// --------------------------------------------------------------------
// Live catalog refresh
// --------------------------------------------------------------------
async function refreshBoardState() {
  restoreClusterSessionStateFromBridge();
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();

  const ctx = await Board.getBoardBaseContext(log);

  const { liveCatalog, stickyOwnerCache } = await Catalog.rebuildLiveCatalog({
    ctx,
    instancesById: state.instancesById,
    clusterAssignments: state.clusterAssignments,
    boardConfig: state.boardConfig,
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
    logRuntimeNotice("action_failed", "applyAgentActions: Unbekannte Instanz " + instanceId);
    executionStats.failedActionCount += actions.length;
    return executionStats;
  }

  const instanceLabel = instance.instanceLabel || instanceId;

  const geom = await Board.computeTemplateGeometry(instance, log);
  if (!geom) {
    logRuntimeNotice("action_failed", "applyAgentActions: Keine Geometrie für Instanz " + instanceLabel);
    executionStats.failedActionCount += actions.length;
    return executionStats;
  }

  if (!state.liveCatalog || !state.liveCatalog.instances?.[instanceId]) {
    await refreshBoardState();
  }

  const liveInst = state.liveCatalog?.instances?.[instanceId] || null;
  const createdStickyIdsByRef = new Map();
  const directedConnectorSet = new Set();
  const undirectedConnectorSet = new Set();

  for (const connection of liveInst?.connections || []) {
    if (!connection?.fromStickyId || !connection?.toStickyId) continue;
    if (connection.directed === false) {
      undirectedConnectorSet.add(makeUndirectedConnectorKey(connection.fromStickyId, connection.toStickyId));
    } else {
      directedConnectorSet.add(makeDirectedConnectorKey(connection.fromStickyId, connection.toStickyId));
    }
  }

  function markSuccess(type) {
    executionStats.executedMutationCount += 1;

    if (type === "create_sticky") executionStats.createdStickyCount += 1;
    if (type === "move_sticky") executionStats.movedStickyCount += 1;
    if (type === "delete_sticky") executionStats.deletedStickyCount += 1;
    if (type === "create_connector") executionStats.createdConnectorCount += 1;
  }

  function markSkipped(message, details = null) {
    executionStats.skippedActionCount += 1;
    if (message) logRuntimeNotice("skipped_action", message, details);
  }

  function markFailure(message, details = null) {
    executionStats.failedActionCount += 1;
    if (message) logRuntimeNotice("action_failed", message, details);
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
  occupiedByRegion.header = buildOccupied(liveInst?.regions?.header?.stickies);
  for (const region of Catalog.getBodyRegionDefs(instance.canvasTypeId || TEMPLATE_ID)) {
    occupiedByRegion[region.id] = buildOccupied(liveInst?.regions?.body?.[region.id]?.stickies);
  }

  function deriveStickySize() {
    return {
      width: STICKY_LAYOUT.defaultWidthPx,
      height: STICKY_LAYOUT.defaultHeightPx,
      shape: STICKY_LAYOUT.defaultShape || "rectangle"
    };
  }

  function removeFromAllOccupied(stickyId) {
    if (!stickyId) return;
    for (const rid of Object.keys(occupiedByRegion)) {
      occupiedByRegion[rid] = (occupiedByRegion[rid] || []).filter((r) => r && r.id !== stickyId);
    }
  }

  function detectBodyRegionIdFromBoardRect(canvasTypeId, boardRect) {
    if (!geom || !boardRect) return null;
    const loc = Catalog.classifyBoardRectAgainstCanvas(canvasTypeId, boardRect, geom, { includeFooter: false });
    const rid = (loc?.role === "body" || loc?.role === "header") ? (loc.regionId || (loc.role === "header" ? "header" : null)) : null;
    return (rid && Object.prototype.hasOwnProperty.call(occupiedByRegion, rid)) ? rid : null;
  }

  function detectBodyRegionIdFromBoardCoords(canvasTypeId, x, y, width = STICKY_LAYOUT.defaultWidthPx, height = STICKY_LAYOUT.defaultHeightPx) {
    if (!geom || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
    const boardRect = {
      x,
      y,
      width,
      height,
      left: x - width / 2,
      right: x + width / 2,
      top: y - height / 2,
      bottom: y + height / 2
    };
    return detectBodyRegionIdFromBoardRect(canvasTypeId, boardRect);
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

  function rememberConnector(fromStickyId, toStickyId, directed = true) {
    if (!fromStickyId || !toStickyId) return;
    if (directed === false) {
      undirectedConnectorSet.add(makeUndirectedConnectorKey(fromStickyId, toStickyId));
      return;
    }
    directedConnectorSet.add(makeDirectedConnectorKey(fromStickyId, toStickyId));
  }

  function detectConnectorCollision(fromStickyId, toStickyId, directed = true) {
    const undirectedKey = makeUndirectedConnectorKey(fromStickyId, toStickyId);
    const forwardKey = makeDirectedConnectorKey(fromStickyId, toStickyId);
    const reverseKey = makeDirectedConnectorKey(toStickyId, fromStickyId);

    if (directed === false) {
      if (undirectedConnectorSet.has(undirectedKey)) return { type: "exact_undirected_duplicate" };
      if (directedConnectorSet.has(forwardKey)) return { type: "directed_forward_exists" };
      if (directedConnectorSet.has(reverseKey)) return { type: "directed_reverse_exists" };
      return null;
    }

    if (undirectedConnectorSet.has(undirectedKey)) return { type: "undirected_exists" };
    if (directedConnectorSet.has(forwardKey)) return { type: "exact_directed_duplicate" };
    return null;
  }

  function buildConnectorCollisionMessage(collision, fromStickyId, toStickyId) {
    if (!collision) return null;
    const pairLabel = fromStickyId + " → " + toStickyId;
    switch (collision.type) {
      case "exact_directed_duplicate":
        return "create_connector: Gerichtete Verbindung " + pairLabel + " existiert bereits – übersprungen.";
      case "exact_undirected_duplicate":
        return "create_connector: Ungerichtete Verbindung zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits – übersprungen.";
      case "undirected_exists":
        return "create_connector: Zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits eine ungerichtete Verbindung; gerichtete Duplikate werden nicht angelegt – übersprungen.";
      case "directed_forward_exists":
        return "create_connector: Zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits eine gerichtete Verbindung; ungerichtete Duplikate werden nicht angelegt – übersprungen.";
      case "directed_reverse_exists":
        return "create_connector: Zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits die Gegenrichtung; ungerichtete Duplikate werden nicht angelegt – übersprungen.";
      default:
        return "create_connector: Verbindungskollision erkannt (" + collision.type + ") – übersprungen.";
    }
  }

  async function createStickyAtBoardPosition(action, x, y, sizeHint = null) {
    const normalizedColor = normalizeStickyColorToken(action?.color) || null;
    const shouldCheck = action?.checked === true;
    const checkTagId = shouldCheck ? await ensureSystemCheckTagId() : null;
    const width = isFiniteNumber(sizeHint?.width) ? Number(sizeHint.width) : STICKY_LAYOUT.defaultWidthPx;
    const height = isFiniteNumber(sizeHint?.height) ? Number(sizeHint.height) : STICKY_LAYOUT.defaultHeightPx;
    const shape = (sizeHint?.shape === "square" || sizeHint?.shape === "rectangle")
      ? sizeHint.shape
      : (STICKY_LAYOUT.defaultShape || "rectangle");

    const sticky = await Board.createStickyNoteAtBoardCoords({
      content: action.text || "(leer)",
      x,
      y,
      width,
      shape,
      fillColor: normalizedColor,
      tagIds: checkTagId ? [checkTagId] : null
    }, log);

    if (sticky?.id && action.refId) {
      registerCreatedStickyRef(action.refId, sticky.id);
    }
    if (sticky?.id && state.stickyOwnerCache instanceof Map) {
      state.stickyOwnerCache.set(sticky.id, instanceId);
    }

    if (sticky?.id) {
      const actualWidth = isFiniteNumber(sticky.width) ? Number(sticky.width) : (width || STICKY_LAYOUT.defaultWidthPx);
      const actualHeight = isFiniteNumber(sticky.height) ? Number(sticky.height) : (height || STICKY_LAYOUT.defaultHeightPx);
      const regionId = detectBodyRegionIdFromBoardCoords(instance.canvasTypeId || TEMPLATE_ID, x, y, actualWidth, actualHeight);
      if (regionId && occupiedByRegion[regionId]) {
        occupiedByRegion[regionId].push({
          id: sticky.id,
          x,
          y,
          width: actualWidth,
          height: actualHeight
        });
      }
    }

    return sticky;
  }

  const handlers = {
    "move_sticky": async (action) => {
      const stickyId = resolveActionStickyReference(action.stickyId);
      if (!stickyId) {
        markSkipped("move_sticky: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
        return;
      }

      const canvasTypeId = instance.canvasTypeId || TEMPLATE_ID;
      const region = Catalog.areaNameToRegion(action.targetArea, canvasTypeId);
      const regionId = region?.id || null;
      if (!regionId || !occupiedByRegion[regionId]) {
        markSkipped("move_sticky: Unbekannte targetArea '" + String(action.targetArea || "(leer)") + "' – übersprungen.");
        return;
      }

      let stickyItem = null;
      try {
        stickyItem = await Board.getItemById(stickyId, log);
      } catch (_) {}

      const stickyW = isFiniteNumber(stickyItem?.width) ? stickyItem.width : STICKY_LAYOUT.defaultWidthPx;
      const stickyH = isFiniteNumber(stickyItem?.height) ? stickyItem.height : STICKY_LAYOUT.defaultHeightPx;

      removeFromAllOccupied(stickyId);

      let targetX = null;
      let targetY = null;

      const pos = Catalog.computeNextFreeStickyPositionInBodyRegion({
        templateGeometry: geom,
        canvasTypeId,
        regionId,
        stickyWidthPx: stickyW,
        stickyHeightPx: stickyH,
        marginPx: STICKY_LAYOUT.marginPx,
        gapPx: STICKY_LAYOUT.gapPx,
        occupiedRects: occupiedByRegion[regionId],
        occupiedRectsByRegion: occupiedByRegion
      });

      if (pos) {
        if (pos.overflowed && pos.resolvedRegionId && pos.resolvedRegionId !== regionId) {
          log("INFO: Sorted-out-Region '" + regionId + "' ist voll; weiche auf '" + pos.resolvedRegionId + "' aus.");
        }
        if (pos.isFull) {
          log(
            "WARNUNG: Region '" + regionId + "' wirkt voll (Grid " +
            (pos.cols || 1) + "x" + (pos.rows || 1) +
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

      if (!isFiniteNumber(targetX) || !isFiniteNumber(targetY)) {
        markFailure("move_sticky: Zielkoordinaten ungültig für Sticky " + stickyId);
        return;
      }

      await Board.moveItemByIdToBoardCoords(stickyId, targetX, targetY, log);

      const destRegionId = detectBodyRegionIdFromBoardCoords(canvasTypeId, targetX, targetY, stickyW, stickyH);
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
        markSkipped("create_sticky: Unbekannte area '" + String(areaName || "(leer)") + "' – übersprungen.");
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
        occupiedRects: occupiedByRegion[regionId],
        occupiedRectsByRegion: occupiedByRegion
      });

      if (!pos) {
        log("create_sticky: Konnte keine Platzierung berechnen (Region=" + regionId + "). Fallback Center.");
        const center = Catalog.areaCenterNormalized(regionId, canvasTypeId);
        const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
        const sticky = await createStickyAtBoardPosition({ ...action, text }, coords.x, coords.y, size);
        if (sticky?.id) markSuccess("create_sticky");
        else markFailure("create_sticky: Miro lieferte kein Sticky-Item zurück.");
        return;
      }

      if (pos.overflowed && pos.resolvedRegionId && pos.resolvedRegionId !== regionId) {
        log("INFO: Sorted-out-Region '" + regionId + "' ist voll; platziere Sticky stattdessen in '" + pos.resolvedRegionId + "'.");
      }
      if (pos.isFull) {
        log(
          "WARNUNG: Region '" + regionId + "' wirkt voll (Grid " +
          (pos.cols || 1) + "x" + (pos.rows || 1) +
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
        markSkipped("delete_sticky: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
        return;
      }

      removeFromAllOccupied(stickyId);
      await Board.removeItemById(stickyId, log);
      markSuccess("delete_sticky");
    },

    "set_sticky_color": async (action) => {
      const stickyId = resolveActionStickyReference(action.stickyId);
      if (!stickyId) {
        markSkipped("set_sticky_color: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
        return;
      }

      const color = normalizeStickyColorToken(action.color);
      if (!color) {
        markSkipped("set_sticky_color: Ungültige Farbe '" + String(action.color || "(leer)") + "' – übersprungen.");
        return;
      }

      const sticky = await Board.setStickyNoteFillColor(stickyId, color, log);
      if (!sticky) {
        markFailure("set_sticky_color: Sticky konnte nicht eingefärbt werden: " + stickyId);
        return;
      }

      markSuccess("set_sticky_color");
    },

    "set_check_status": async (action) => {
      const stickyId = resolveActionStickyReference(action.stickyId);
      if (!stickyId) {
        markSkipped("set_check_status: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
        return;
      }

      const checkTagId = await ensureSystemCheckTagId();
      if (!checkTagId) {
        markFailure("set_check_status: Check-Tag konnte nicht bereitgestellt werden.");
        return;
      }

      const sticky = await Board.setStickyNoteTagPresence(stickyId, checkTagId, action.checked === true, log);
      if (!sticky) {
        markFailure("set_check_status: Sticky konnte nicht markiert werden: " + stickyId);
        return;
      }

      markSuccess("set_check_status");
    },

    "create_connector": async (action) => {
      const fromStickyId = resolveActionStickyReference(action.fromStickyId);
      const toStickyId = resolveActionStickyReference(action.toStickyId);

      if (!fromStickyId || !toStickyId) {
        markSkipped(
          "create_connector: Sticky-Referenzen nicht auflösbar (from=" +
          String(action.fromStickyId || "(leer)") +
          ", to=" + String(action.toStickyId || "(leer)") + ")."
        );
        return;
      }

      if (fromStickyId === toStickyId) {
        markSkipped("create_connector: Quelle und Ziel sind identisch – übersprungen (" + fromStickyId + ").");
        return;
      }

      const directed = action.directed !== false;
      const collision = detectConnectorCollision(fromStickyId, toStickyId, directed);
      if (collision) {
        markSkipped(buildConnectorCollisionMessage(collision, fromStickyId, toStickyId));
        return;
      }

      await Board.createConnectorBetweenItems({
        startItemId: fromStickyId,
        endItemId: toStickyId,
        directed
      }, log);
      rememberConnector(fromStickyId, toStickyId, directed);
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
        markFailure("Action '" + action.type + "' fehlgeschlagen: " + formatRuntimeErrorMessage(e), e?.stack || null);
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


function normalizeComparableChatText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/[…]/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeChatQuestionText(rawContent) {
  const plain = stripHtml(rawContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
  if (!plain) return "";

  if (Board.isKnownChatPlaceholderContent(plain, "input") || Board.isKnownChatPlaceholderContent(plain, "submit") || Board.isKnownChatPlaceholderContent(plain, "output")) {
    return "";
  }

  return plain;
}


async function resolveBoardUserSeedText(instanceId, fallbackText = "") {
  const fallback = pickFirstNonEmptyString(fallbackText, "") || "";
  const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
  if (!instance || !Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface)) {
    return fallback;
  }

  try {
    const rawInputContent = await Board.readChatInputContent(instance.chatInterface, log);
    const normalized = normalizeChatQuestionText(rawInputContent);
    return normalized || fallback;
  } catch (_) {
    return fallback;
  }
}

function resolveResponseTargetInstanceId({ promptRuntimeOverride = null, targetInstanceIds = [], triggerInstanceId = null } = {}) {
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  const explicitAnchor = pickFirstNonEmptyString(runtime?.controlContext?.anchorInstanceId, runtime?.anchorInstanceId, triggerInstanceId);
  if (explicitAnchor && state.instancesById.has(explicitAnchor)) return explicitAnchor;

  const normalizedTargets = normalizeTargetInstanceIds(targetInstanceIds);
  if (normalizedTargets.length === 1) return normalizedTargets[0];
  return null;
}

function buildQuestionPromptRuntimeOverride(instanceId) {
  const lang = getCurrentDisplayLanguage();
  const instance = state.instancesById.get(instanceId) || null;
  if (!instance || getCurrentBoardMode() !== "exercise") {
    return {
      exercisePack: null,
      packTemplate: null,
      flowStep: null,
      promptModules: []
    };
  }

  const exercisePack = getSelectedExercisePack({ lang }) || null;
  const currentStepId = exercisePack ? getCurrentExerciseStepId(exercisePack) : null;
  const flowStep = exercisePack && currentStepId
    ? Exercises.getExerciseStep(exercisePack, currentStepId, { lang })
    : null;
  const questionModuleIds = Array.isArray(flowStep?.questionModuleIds)
    ? flowStep.questionModuleIds
    : [];
  const promptModules = ExerciseLibrary.getPromptModulesByIds(questionModuleIds, { lang });

  return {
    exercisePack,
    packTemplate,
    flowStep,
    promptModules
  };
}

async function buildQuestionPromptBundleForInstance(instanceId, userQuestion) {
  const lang = getCurrentDisplayLanguage();
  const instance = state.instancesById.get(instanceId) || null;
  if (!instance) return null;

  const { liveCatalog } = await refreshBoardState();
  const stateById = await computeInstanceStatesById(liveCatalog);
  const instanceState = stateById[instanceId] || null;
  if (!instanceState?.promptPayload) return null;

  const runtime = buildQuestionPromptRuntimeOverride(instanceId);
  const flowPromptContext = resolveFlowPromptContext({
    promptRuntimeOverride: runtime?.packTemplate
      ? {
          packTemplate: runtime.packTemplate,
          flowStep: runtime.flowStep,
          promptModules: runtime.promptModules,
          anchorInstanceId: instanceId
        }
      : null,
    targetInstanceIds: [instanceId]
  });
  const memoryPayload = buildMemoryInjectionPayload();
  const pendingProposal = await loadPendingProposalForInstance(instanceId, {
    stepId: runtime?.flowStep?.id || null
  });
  const instanceLabel = instance.instanceLabel || null;
  const boardCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
    mode: "generic",
    activeInstanceId: instanceId,
    hasGlobalBaseline: state.hasGlobalBaseline
  });

  const activeInstanceChangesSinceLastAgent = {};
  if (!state.hasGlobalBaseline || !instanceState?.diff || !instanceLabel) {
    activeInstanceChangesSinceLastAgent[instanceLabel || instanceId] = null;
  } else {
    activeInstanceChangesSinceLastAgent[instanceLabel || instanceId] = Catalog.aliasDiffForActiveInstance(instanceState.diff, state.aliasState);
  }

  const baseUserPayload = {
    activeInstanceLabel: instanceLabel,
    selectedInstanceLabels: instanceLabel ? [instanceLabel] : [],
    boardCatalog,
    activeCanvasState: instanceState.promptPayload,
    activeCanvasStates: instanceLabel ? { [instanceLabel]: instanceState.promptPayload } : {},
    activeInstanceChangesSinceLastAgent,
    instanceMeta: {
      instanceId: instance.instanceId || null,
      instanceLabel,
      canvasTypeId: instance.canvasTypeId || null,
      canvasTypeLabel: instance.canvasTypeLabel || null,
      imageId: instance.imageId || null
    },
    memoryState: memoryPayload.memoryState,
    recentMemoryLogEntries: memoryPayload.recentMemoryLogEntries,
    pendingProposal: simplifyProposalForPrompt(pendingProposal, instanceId),
    flowControlCatalog: flowPromptContext.flowControlCatalog,
    boardFlowState: flowPromptContext.boardFlowState,
    hint: buildPayloadMappingHint({
      scopeLabel: "aktiven Instanz",
      labelListKey: "selectedInstanceLabels",
      mentionArea: true
    })
  };

  return PromptComposer.composePrompt({
    baseSystemPrompt: DT_QUESTION_SYSTEM_PROMPT,
    runMode: "exercise-question-instance",
    triggerContext: {
      source: "user",
      mutationPolicy: "none",
      feedbackPolicy: "text",
      requiresSelection: true
    },
    userQuestion,
    baseUserPayload,
    involvedCanvasTypeIds: [instance.canvasTypeId].filter(Boolean),
    templateCatalog: DT_TEMPLATE_CATALOG,
    boardConfig: state.boardConfig,
    exercisePack: runtime?.exercisePack || null,
    currentStep: runtime?.exercisePack && runtime?.flowStep?.id
      ? Exercises.getExerciseStep(runtime.exercisePack, runtime.flowStep.id, { lang })
      : getCurrentExerciseStep(undefined, { lang }),
    packTemplate: runtime?.packTemplate || null,
    flowStep: runtime?.flowStep || null,
    promptModules: runtime?.promptModules || [],
    questionMode: true
  });
}

async function runQuestionCallForInstance(instanceId, rawQuestionText, { sourceLabel = null } = {}) {
  const lang = getCurrentDisplayLanguage();
  const resolvedSourceLabel = pickFirstNonEmptyString(sourceLabel, t("sourceLabel.question", lang));
  const questionText = normalizeChatQuestionText(rawQuestionText);
  if (!questionText) {
    const msg = t("question.emptyInput", lang, { sourceLabel: resolvedSourceLabel });
    logRuntimeNotice("precondition", msg);
    return buildRunFailureResult("precondition", msg);
  }

  const instance = state.instancesById.get(instanceId);
  if (!instance) {
    const msg = t("question.instanceMissing", lang, { sourceLabel: resolvedSourceLabel });
    logRuntimeNotice("precondition", msg);
    return buildRunFailureResult("precondition", msg);
  }

  if (!Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface)) {
    const msg = t("question.chatIncomplete", lang, { sourceLabel: resolvedSourceLabel });
    logRuntimeNotice("precondition", msg);
    return buildRunFailureResult("precondition", msg);
  }

  const apiKey = getApiKey();
  const model = getModel();
  if (!apiKey) {
    const msg = t("question.missingApiKey", lang, { sourceLabel: resolvedSourceLabel });
    logRuntimeNotice("precondition", msg);
    return buildRunFailureResult("precondition", msg);
  }

  const runLock = tryAcquireAgentRunLock(resolvedSourceLabel);
  if (!runLock) {
    return buildRunFailureResult("run_locked", t("question.agentRunLocked", lang, { sourceLabel: resolvedSourceLabel }));
  }

  let boardRunToken = null;
  let finalBoardRunStatus = "failed";
  let finalBoardRunMessage = t("question.failed", lang, { sourceLabel: resolvedSourceLabel });

  try {
    const boardRunStart = await acquireBoardSoftLock({
      sourceLabel: resolvedSourceLabel,
      targetInstanceIds: [instanceId]
    });
    if (!boardRunStart.ok) {
      const msg = formatExistingBoardRunMessage(resolvedSourceLabel, boardRunStart.current);
      logRuntimeNotice("run_locked", msg);
      return buildRunFailureResult("run_locked", msg, { currentRunState: boardRunStart.current || null });
    }

    boardRunToken = boardRunStart.token;
    boardRunToken.statusItemIds = await createRunStatusItems([instanceId], resolvedSourceLabel, boardRunToken.runId);
    await syncBoardSoftLock(boardRunToken, { statusItemIds: boardRunToken.statusItemIds });

    const promptBundle = await buildQuestionPromptBundleForInstance(instanceId, questionText);
    if (!promptBundle) {
      const msg = t("question.contextUnavailable", lang, { sourceLabel: resolvedSourceLabel });
      logRuntimeNotice("precondition", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("precondition", msg);
    }

    const structuredResult = await OpenAI.callOpenAIQuestionStructured({
      apiKey,
      model,
      systemPrompt: promptBundle.systemPrompt,
      userText: JSON.stringify(promptBundle.userPayload, null, 2)
    });

    if (structuredResult.refusal) {
      const msg = t("question.modelRefusal", lang, {
        sourceLabel: resolvedSourceLabel,
        reason: structuredResult.refusal
      });
      logRuntimeNotice("model_refusal", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("model_refusal", msg, { refusal: structuredResult.refusal });
    }

    const answer = pickFirstNonEmptyString(structuredResult.parsed?.answer, structuredResult.outputText);
    if (!answer) {
      const msg = t("question.invalidJson", lang, { sourceLabel: resolvedSourceLabel });
      logRuntimeNotice("invalid_json", msg, structuredResult.outputText || "(keine output_text-Antwort)");
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("invalid_json", msg, { rawOutputText: structuredResult.outputText || null });
    }

    const outputHtml = Board.buildQuestionAnswerContent({ answer, lang });
    await Board.writeChatOutputContent(instance.chatInterface, outputHtml, log);
    log(t("question.outputWritten", lang, {
      sourceLabel: resolvedSourceLabel,
      instanceLabel: instance.instanceLabel || instanceId
    }));

    finalBoardRunStatus = "completed";
    finalBoardRunMessage = t("question.completed", lang, { sourceLabel: resolvedSourceLabel });
    return buildRunSuccessResult({
      sourceLabel: resolvedSourceLabel,
      targetInstanceLabels: [instance.instanceLabel || instanceId],
      answer
    });
  } catch (e) {
    const msg = t("question.exception", lang, {
      sourceLabel: resolvedSourceLabel,
      message: formatRuntimeErrorMessage(e)
    });
    logRuntimeNotice("fatal", msg, e?.stack || null);
    finalBoardRunStatus = "failed";
    finalBoardRunMessage = msg;
    return buildRunFailureResult("fatal", msg, { error: e });
  } finally {
    if (boardRunToken) {
      await finalizeBoardSoftLock(boardRunToken, {
        status: finalBoardRunStatus,
        message: finalBoardRunMessage
      });
    }
    releaseAgentRunLock(runLock);
  }
}

async function resolveSelectedChatSubmit(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length !== 1) return null;

  const item = list[0];
  const meta = await Board.readChatInterfaceMeta(item, log);
  if (!meta || meta.role !== "submit") return null;

  const instance = meta.instanceId ? state.instancesById.get(meta.instanceId) : null;
  if (!instance) return null;
  return { item, meta, instance };
}

async function executeSelectedChatSubmit(chatSelection, items) {
  if (!chatSelection?.instance) {
    await refreshSelectionStatusFromItems(items);
    return;
  }

  const instanceId = chatSelection.instance.instanceId;
  const rawInputContent = await Board.readChatInputContent(chatSelection.instance.chatInterface, log);
  await runQuestionCallForInstance(instanceId, rawInputContent, {
    sourceLabel: t("question.source.canvas", getCurrentDisplayLanguage())
  });
  await restoreSelectionAfterBoardButtonRun(instanceId);
  await refreshSelectionStatusFromBoard();
}


async function resolveSelectedChatApply(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length !== 1) return null;

  const item = list[0];
  const meta = await Board.readChatInterfaceMeta(item, log);
  if (!meta || meta.role !== "apply") return null;

  const instance = meta.instanceId ? state.instancesById.get(meta.instanceId) : null;
  if (!instance) return null;
  return { item, meta, instance };
}

async function executeSelectedChatApply(chatSelection, items) {
  if (!chatSelection?.instance) {
    await refreshSelectionStatusFromItems(items);
    return;
  }

  const pack = getSelectedExercisePack();
  const currentStep = getCurrentExerciseStep(pack);
  const instanceId = chatSelection.instance.instanceId;
  const currentStepId = currentStep?.id || null;
  const lang = getCurrentDisplayLanguage();

  if (!pack || !currentStep || !currentStepId) {
    await notifyRuntime(t("exercise.action.help.noStep", lang), { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  const pendingProposal = await loadPendingProposalForInstance(instanceId, { stepId: currentStepId });
  if (!pendingProposal?.proposalId) {
    await notifyRuntime(t("chat.apply.noPending", lang), { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  const triggerContext = ExerciseEngine.resolveTriggerContext({
    triggerKey: "selection.apply",
    source: "user",
    pack,
    step: currentStep,
    selectionCount: 1,
    targetInstanceLabels: [chatSelection.instance.instanceLabel || instanceId],
    boardConfig: state.boardConfig
  });

  if (!triggerContext.valid) {
    await notifyRuntime(triggerContext.reason || t("chat.apply.noPending", lang), { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  await runAgentForSelectedInstances([instanceId], {
    triggerContext,
    runMode: buildRunModeFromTriggerKey(triggerContext.triggerKey),
    sourceLabel: t("chat.apply", lang),
    userText: getCurrentUserQuestion()
  });
  await restoreSelectionAfterBoardButtonRun(instanceId);
  await refreshSelectionStatusFromBoard();
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
    const msg = "Instanz-Agent: Keine gültigen Ziel-Instanzen übergeben.";
    logRuntimeNotice("precondition", msg);
    return buildRunFailureResult("precondition", msg);
  }

  const triggerContext = options.triggerContext || null;
  const parsedTrigger = triggerContext ? ExerciseEngine.parseTriggerKey(triggerContext.triggerKey) : null;
  const triggerIntent = parsedTrigger?.intent || null;
  const isApplyRun = triggerIntent === "apply";
  const requiresSingleInstance = triggerIntent === "propose" || isApplyRun;

  if (requiresSingleInstance && normalizedSelectedIds.length !== 1) {
    const msg = "Proposal/Apply-Modus benötigt genau eine selektierte Canvas-Instanz.";
    logRuntimeNotice("precondition", msg);
    return buildRunFailureResult("precondition", msg);
  }

  const apiKey = isApplyRun ? null : getApiKey();
  const model = getModel();
  const userText = options.userText || getCurrentUserQuestion();
  const promptRuntimeOverride = (options.promptRuntimeOverride && typeof options.promptRuntimeOverride === "object")
    ? options.promptRuntimeOverride
    : null;
  const runMode = pickFirstNonEmptyString(options.runMode, (triggerContext ? buildRunModeFromTriggerKey(triggerContext.triggerKey) : null), "selection");
  const sourceLabel = pickFirstNonEmptyString(options.sourceLabel, (triggerContext ? buildTriggerSourceLabel(triggerContext) : null), "Instanz-Agent");

  if (!isApplyRun && !apiKey) {
    const msg = "Bitte OpenAI API Key eingeben (Agent).";
    logRuntimeNotice("precondition", msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return buildRunFailureResult("precondition", msg);
  }

  const runLock = tryAcquireAgentRunLock(sourceLabel);
  if (!runLock) {
    return buildRunFailureResult("run_locked", sourceLabel + ": Ein Agent-Run läuft bereits.");
  }

  let boardRunToken = null;
  let finalBoardRunStatus = "failed";
  let finalBoardRunMessage = null;

  try {
    const boardRunStart = await acquireBoardSoftLock({
      sourceLabel,
      targetInstanceIds: normalizedSelectedIds
    });

    if (!boardRunStart.ok) {
      const msg = formatExistingBoardRunMessage(sourceLabel, boardRunStart.current);
      logRuntimeNotice("run_locked", msg);
      await notifyRuntime(msg, { level: "warning" });
      return buildRunFailureResult("run_locked", msg, { currentRunState: boardRunStart.current || null });
    }

    boardRunToken = boardRunStart.token;

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
      const msg = sourceLabel + ": Konnte für die selektierten Canvas keine Zustandsdaten aufbauen.";
      logRuntimeNotice("precondition", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("precondition", msg);
    }

    const resolvedActiveIds = resolvedActiveLabels
      .map((label) => getInternalInstanceIdByLabel(label))
      .filter((id) => state.instancesById.has(id));

    if (requiresSingleInstance && resolvedActiveIds.length !== 1) {
      const msg = sourceLabel + ": Proposal/Apply-Modus benötigt genau eine auflösbare Ziel-Instanz.";
      logRuntimeNotice("precondition", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("precondition", msg);
    }

    boardRunToken.targetInstanceIds = resolvedActiveIds.slice();
    boardRunToken.statusItemIds = await createRunStatusItems(resolvedActiveIds, sourceLabel, boardRunToken.runId);
    await syncBoardSoftLock(boardRunToken, {
      targetInstanceIds: resolvedActiveIds,
      statusItemIds: boardRunToken.statusItemIds
    });
    await notifyRuntime("AI arbeitet: " + sourceLabel, { level: "info" });

    const singleLabel = resolvedActiveLabels.length === 1 ? resolvedActiveLabels[0] : null;
    const singleInstanceId = resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null;
    const boardCatalog = buildBoardCatalogForSelectedInstances(resolvedActiveIds);
    const memoryPayload = buildMemoryInjectionPayload({ proposalMode: triggerIntent === "propose" });
    const expectedSignatureSnapshot = buildSignatureSnapshot(stateById, resolvedActiveIds);
    const flowPromptContext = resolveFlowPromptContext({
      promptRuntimeOverride,
      targetInstanceIds: resolvedActiveIds
    });
    const activeAnchorContext = flowPromptContext.exercisePackId && flowPromptContext.anchorInstanceId
      ? { exercisePackId: flowPromptContext.exercisePackId, anchorInstanceId: flowPromptContext.anchorInstanceId }
      : null;
    const currentStepId = resolveRunStepId(promptRuntimeOverride);
    const currentStepLabel = resolveRunStepLabel(promptRuntimeOverride);
    const pendingProposals = await buildPendingProposalPayloadForInstances(resolvedActiveIds, { stepId: currentStepId });

    const baseUserPayload = {
      activeInstanceLabel: singleLabel,
      selectedInstanceLabels: resolvedActiveLabels,
      boardCatalog,
      activeCanvasState: singleLabel ? activeCanvasStates[singleLabel] : null,
      activeCanvasStates,
      activeInstanceChangesSinceLastAgent,
      memoryState: memoryPayload.memoryState,
      recentMemoryLogEntries: memoryPayload.recentMemoryLogEntries,
      pendingProposal: singleLabel ? (pendingProposals[singleLabel] || null) : null,
      pendingProposals,
      flowControlCatalog: flowPromptContext.flowControlCatalog,
      boardFlowState: flowPromptContext.boardFlowState,
      hint: buildPayloadMappingHint({
        scopeLabel: "selektierten Instanzen",
        labelListKey: "selectedInstanceLabels"
      })
    };

    if (isApplyRun) {
      const proposal = await Board.loadActiveProposal({
        anchorInstanceId: singleInstanceId,
        stepId: currentStepId
      }, log);

      if (!proposal) {
        const feedback = buildNoPendingProposalFeedback(sourceLabel, getCurrentDisplayLanguage());
        await renderAgentResponseToInstanceOutput({
          instanceId: singleInstanceId,
          feedback,
          flowControlDirectives: null,
          evaluation: null,
          sourceLabel
        });
        await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: currentStepId });
        const msg = sourceLabel + ": Kein offener Vorschlag zum Anwenden vorhanden.";
        finalBoardRunStatus = "aborted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("precondition", msg);
      }

      const currentHash = stateById[singleInstanceId]?.signature?.stateHash || null;
      if (proposal.basedOnStateHash && proposal.basedOnStateHash !== currentHash) {
        await Board.clearActiveProposal({
          anchorInstanceId: singleInstanceId,
          stepId: currentStepId
        }, log);
        const feedback = buildStaleProposalFeedback(sourceLabel, getCurrentDisplayLanguage());
        await renderAgentResponseToInstanceOutput({
          instanceId: singleInstanceId,
          feedback,
          flowControlDirectives: null,
          evaluation: null,
          sourceLabel
        });
        await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: currentStepId });
        const msg = sourceLabel + ": Gespeicherter Vorschlag ist veraltet und wurde nicht angewendet.";
        finalBoardRunStatus = "aborted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("stale_state_conflict", msg);
      }

      const proposalActions = Array.isArray(proposal.actions) ? proposal.actions : [];
      const actionResult = proposalActions.length
        ? await applyResolvedAgentActions(proposalActions, {
            candidateInstanceIds: resolvedActiveIds,
            triggerInstanceId: singleInstanceId,
            sourceLabel
          })
        : {
            appliedCount: 0,
            skippedCount: 0,
            infoCount: 0,
            targetedInstanceCount: 0,
            ...createEmptyActionExecutionStats()
          };

      await refreshBoardState();

      const nowIso = new Date().toISOString();
      for (const id of resolvedActiveIds) {
        const inst = state.instancesById.get(id);
        if (!inst) continue;
        inst.lastAgentRunAt = nowIso;
        if (Number(actionResult.executedMutationCount || 0) > 0) {
          inst.lastChangedAt = nowIso;
        }
      }

      if (proposal.memoryEntry) {
        await persistMemoryAfterAgentRun({
          analysis: proposal.analysis,
          memoryEntry: proposal.memoryEntry
        }, {
          runMode,
          trigger: triggerContext?.triggerKey || "selection.apply",
          targetInstanceLabels: resolvedActiveLabels,
          userRequest: userText
        }, actionResult);
      }

      await Board.clearActiveProposal({
        anchorInstanceId: singleInstanceId,
        stepId: currentStepId
      }, log);

      const storedFlowDirectives = ExerciseEngine.normalizeFlowControlDirectivesBlock(proposal.flowControlDirectives);
      const flowDirectiveResult = triggerContext
        ? await applyFlowControlDirectivesAfterAgentRun({
            flowControlDirectives: storedFlowDirectives,
            promptRuntimeOverride,
            targetInstanceIds: resolvedActiveIds,
            sourceLabel
          })
        : null;

      const feedback = buildAppliedProposalFeedback(proposal, actionResult, getCurrentDisplayLanguage());
      const responseRenderResult = await renderAgentResponseToInstanceOutput({
        instanceId: singleInstanceId,
        feedback,
        flowControlDirectives: null,
        evaluation: proposal.evaluation || null,
        sourceLabel
      });

      if (triggerContext) {
        await persistExerciseRuntimeAfterAgentRun({
          triggerContext,
          flowControlDirectives: flowDirectiveResult?.flowControlDirectives || null,
          activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
        });
      }

      await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: currentStepId });

      if (responseRenderResult?.outputShapeId) {
        log(sourceLabel + ": Antwort in Ausgabebox von '" + responseRenderResult.instanceLabel + "' geschrieben (Shape " + responseRenderResult.outputShapeId + ").");
      }

      finalBoardRunStatus = "completed";
      finalBoardRunMessage = sourceLabel + ": Vorschlag angewendet.";
      return buildRunSuccessResult({
        sourceLabel,
        targetInstanceLabels: resolvedActiveLabels,
        actionResult,
        proposalApplied: true,
        executionMode: "direct_apply"
      });
    }

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

    log("Sende " + sourceLabel + "-Request an OpenAI ...");
    const structuredResult = await OpenAI.callOpenAIAgentStructured({
      apiKey,
      model,
      systemPrompt: composedPrompt.systemPrompt,
      userText: JSON.stringify(composedPrompt.userPayload, null, 2)
    });

    if (structuredResult.refusal) {
      const msg = sourceLabel + ": Modell verweigert die Antwort: " + structuredResult.refusal;
      logRuntimeNotice("model_refusal", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("model_refusal", msg, { refusal: structuredResult.refusal });
    }

    const agentObj = structuredResult.parsed;
    if (!agentObj) {
      const msg = sourceLabel + ": Antwort ist kein valides strukturiertes JSON.";
      logRuntimeNotice("invalid_json", msg, structuredResult.outputText || "(keine output_text-Antwort)");
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("invalid_json", msg, { rawOutputText: structuredResult.outputText || null });
    }

    const executionMode = resolveAgentExecutionMode(agentObj, triggerContext, triggerIntent);
    const { feedback, flowControlDirectives, evaluation } = normalizeAgentExerciseArtifacts(agentObj, triggerContext, sourceLabel);

    log(sourceLabel + " analysis:");
    log(agentObj.analysis || "(keine analysis)");
    log(sourceLabel + ": executionMode=" + executionMode + ".");

    if (executionMode === "none") {
      if (Array.isArray(agentObj.actions) && agentObj.actions.length) {
        log("INFO: " + sourceLabel + ": Actions werden ignoriert, da executionMode=none.");
      }

      await persistMemoryAfterAgentRun(agentObj, {
        runMode,
        trigger: triggerContext?.triggerKey || "generic",
        targetInstanceLabels: resolvedActiveLabels,
        userRequest: userText
      }, {
        appliedCount: 0,
        skippedCount: 0,
        infoCount: 0,
        targetedInstanceCount: 0,
        ...createEmptyActionExecutionStats()
      });

      const flowDirectiveResult = triggerContext
        ? await applyFlowControlDirectivesAfterAgentRun({
            flowControlDirectives,
            promptRuntimeOverride,
            targetInstanceIds: resolvedActiveIds,
            sourceLabel
          })
        : null;

      const appliedFlowControlDirectives = flowDirectiveResult?.flowControlDirectives || flowControlDirectives;
      const responseRenderResult = await renderAgentResponseToInstanceOutput({
        instanceId: resolveResponseTargetInstanceId({
          promptRuntimeOverride,
          targetInstanceIds: resolvedActiveIds,
          triggerInstanceId: resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null
        }),
        feedback,
        flowControlDirectives: appliedFlowControlDirectives,
        evaluation,
        sourceLabel
      });

      if (triggerContext) {
        await persistExerciseRuntimeAfterAgentRun({
          triggerContext,
          flowControlDirectives: appliedFlowControlDirectives,
          activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
        });
      }

      await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: currentStepId });

      if (responseRenderResult?.outputShapeId) {
        log(sourceLabel + ": Antwort in Ausgabebox von '" + responseRenderResult.instanceLabel + "' geschrieben (Shape " + responseRenderResult.outputShapeId + ").");
      }

      finalBoardRunStatus = "completed";
      finalBoardRunMessage = sourceLabel + ": abgeschlossen.";
      return buildRunSuccessResult({
        sourceLabel,
        targetInstanceLabels: resolvedActiveLabels,
        actionResult: {
          appliedCount: 0,
          skippedCount: 0,
          infoCount: 0,
          targetedInstanceCount: 0,
          ...createEmptyActionExecutionStats()
        },
        executionMode
      });
    }

    if (executionMode === "proposal_only") {
      if (resolvedActiveIds.length !== 1 || !singleInstanceId) {
        const msg = sourceLabel + ": executionMode=proposal_only benötigt genau eine Ziel-Instanz.";
        logRuntimeNotice("precondition", msg);
        finalBoardRunStatus = "aborted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("precondition", msg);
      }

      const executableActions = sanitizeProposalActionsForCurrentStep(agentObj.actions, {
        stepId: currentStepId,
        activeCanvasPayload: singleLabel ? activeCanvasStates[singleLabel] : null,
        userText,
        logFn: log
      }).filter((action) => action && action.type !== "inform");

      let proposalRecord = null;
      if (executableActions.length) {
        proposalRecord = buildStoredProposalRecord({
          instanceId: singleInstanceId,
          stepId: currentStepId,
          stepLabel: currentStepLabel,
          exercisePackId: resolveRunPackTemplateId(promptRuntimeOverride),
          triggerContext,
          promptRuntimeOverride,
          userRequest: userText,
          basedOnStateHash: stateById[singleInstanceId]?.signature?.stateHash || null,
          agentObj: {
            ...agentObj,
            actions: executableActions,
            executionMode
          },
          feedback,
          flowControlDirectives,
          evaluation
        });
        await Board.saveActiveProposal(proposalRecord, log);
      } else {
        await Board.clearActiveProposal({
          anchorInstanceId: singleInstanceId,
          stepId: currentStepId
        }, log);
      }

      const flowDirectiveResult = triggerContext
        ? await applyFlowControlDirectivesAfterAgentRun({
            flowControlDirectives,
            promptRuntimeOverride,
            targetInstanceIds: resolvedActiveIds,
            sourceLabel
          })
        : null;

      const responseRenderResult = await renderAgentResponseToInstanceOutput({
        instanceId: singleInstanceId,
        feedback,
        flowControlDirectives: flowDirectiveResult?.flowControlDirectives || null,
        evaluation,
        sourceLabel
      });

      if (triggerContext) {
        await persistExerciseRuntimeAfterAgentRun({
          triggerContext,
          flowControlDirectives: flowDirectiveResult?.flowControlDirectives || null,
          activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
        });
      }

      await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: currentStepId });

      if (responseRenderResult?.outputShapeId) {
        log(sourceLabel + ": Antwort in Ausgabebox von '" + responseRenderResult.instanceLabel + "' geschrieben (Shape " + responseRenderResult.outputShapeId + ").");
      }

      finalBoardRunStatus = "completed";
      finalBoardRunMessage = proposalRecord
        ? (sourceLabel + ": Vorschlag gespeichert.")
        : (sourceLabel + ": Kein ausführbarer Vorschlag gespeichert.");
      return buildRunSuccessResult({
        sourceLabel,
        targetInstanceLabels: resolvedActiveLabels,
        proposalId: proposalRecord?.proposalId || null,
        proposalStored: !!proposalRecord,
        actionResult: {
          appliedCount: executableActions.length,
          skippedCount: 0,
          infoCount: 0,
          targetedInstanceCount: 1,
          ...createEmptyActionExecutionStats()
        },
        executionMode
      });
    }

    if (hasMutatingActions(agentObj.actions)) {
      const conflictCheck = await performPreApplyConflictCheck(expectedSignatureSnapshot, sourceLabel);
      if (!conflictCheck.ok) {
        logRuntimeNotice("stale_state_conflict", conflictCheck.message, conflictCheck.conflicts);
        finalBoardRunStatus = "conflicted";
        finalBoardRunMessage = conflictCheck.message;
        return buildRunFailureResult("stale_state_conflict", conflictCheck.message, { conflicts: conflictCheck.conflicts });
      }
    }

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

    if (currentStepId) {
      for (const instanceId of resolvedActiveIds) {
        await clearPendingProposalForInstanceStep(instanceId, currentStepId);
      }
    }

    await persistMemoryAfterAgentRun(agentObj, {
      runMode,
      trigger: triggerContext?.triggerKey || "generic",
      targetInstanceLabels: resolvedActiveLabels,
      userRequest: userText
    }, actionResult);

    const flowDirectiveResult = triggerContext
      ? await applyFlowControlDirectivesAfterAgentRun({
          flowControlDirectives,
          promptRuntimeOverride,
          targetInstanceIds: resolvedActiveIds,
          sourceLabel
        })
      : null;

    const appliedFlowControlDirectives = flowDirectiveResult?.flowControlDirectives || flowControlDirectives;
    const responseRenderResult = await renderAgentResponseToInstanceOutput({
      instanceId: resolveResponseTargetInstanceId({
        promptRuntimeOverride,
        targetInstanceIds: resolvedActiveIds,
        triggerInstanceId: resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null
      }),
      feedback,
      flowControlDirectives: appliedFlowControlDirectives,
      evaluation,
      sourceLabel
    });

    if (triggerContext) {
      await persistExerciseRuntimeAfterAgentRun({
        triggerContext,
        flowControlDirectives: appliedFlowControlDirectives,
        activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
      });
    }

    await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: currentStepId });

    if (responseRenderResult?.outputShapeId) {
      log(sourceLabel + ": Antwort in Ausgabebox von '" + responseRenderResult.instanceLabel + "' geschrieben (Shape " + responseRenderResult.outputShapeId + ").");
    }

    finalBoardRunStatus = "completed";
    finalBoardRunMessage = sourceLabel + ": abgeschlossen.";

    return buildRunSuccessResult({
      sourceLabel,
      targetInstanceLabels: resolvedActiveLabels,
      actionResult,
      executionMode
    });
  } catch (e) {
    const msg = "Exception beim " + sourceLabel + "-Run: " + formatRuntimeErrorMessage(e);
    logRuntimeNotice("fatal", msg, e?.stack || null);
    finalBoardRunStatus = "failed";
    finalBoardRunMessage = msg;
    return buildRunFailureResult("fatal", msg, { error: e });
  } finally {
    if (boardRunToken) {
      await finalizeBoardSoftLock(boardRunToken, {
        status: finalBoardRunStatus,
        message: finalBoardRunMessage
      });
    }
    releaseAgentRunLock(runLock);
  }
}

function resolveOwnerInstanceIdForStickyReference(stickyRef) {
  if (!stickyRef) return null;
  const resolvedStickyId = Catalog.resolveStickyId(stickyRef, state.aliasState);
  if (!resolvedStickyId) return null;
  return state.stickyOwnerCache?.get(resolvedStickyId) || null;
}

function validateNormalizedAction(action) {
  if (!action || typeof action !== "object" || !action.type) {
    return { ok: false, message: "Unbekanntes oder nicht unterstütztes Action-Schema." };
  }

  if (action.type === "move_sticky") {
    const targetArea = pickFirstNonEmptyString(action.targetArea, action.area);
    if (!action.stickyId) return { ok: false, message: "move_sticky ohne stickyId." };
    if (!targetArea) return { ok: false, message: "move_sticky ohne targetArea." };
    return { ok: true, action: { ...action, targetArea } };
  }

  if (action.type === "create_sticky") {
    const area = pickFirstNonEmptyString(action.area, action.targetArea);
    const color = action.color == null ? null : normalizeStickyColorToken(action.color);
    const checked = action.checked == null ? null : action.checked === true;
    if (!action.text) return { ok: false, message: "create_sticky ohne text." };
    if (!area) return { ok: false, message: "create_sticky ohne area." };
    if (action.color != null && !color) return { ok: false, message: "create_sticky mit ungültiger color." };
    return { ok: true, action: { ...action, area, targetArea: area, color, checked } };
  }

  if (action.type === "delete_sticky") {
    if (!action.stickyId) return { ok: false, message: "delete_sticky ohne stickyId." };
    return { ok: true, action };
  }

  if (action.type === "set_sticky_color") {
    const color = normalizeStickyColorToken(action.color);
    if (!action.stickyId) return { ok: false, message: "set_sticky_color ohne stickyId." };
    if (!color) return { ok: false, message: "set_sticky_color ohne gültige color." };
    return { ok: true, action: { ...action, color } };
  }

  if (action.type === "set_check_status") {
    if (!action.stickyId) return { ok: false, message: "set_check_status ohne stickyId." };
    if (typeof action.checked !== "boolean") return { ok: false, message: "set_check_status ohne checked=true/false." };
    return { ok: true, action: { ...action, checked: action.checked === true } };
  }

  if (action.type === "create_connector") {
    if (!action.fromStickyId || !action.toStickyId) {
      return { ok: false, message: "create_connector ohne fromStickyId/toStickyId." };
    }
    return { ok: true, action: { ...action, directed: action.directed !== false } };
  }

  if (action.type === "inform") {
    return { ok: true, action };
  }

  return { ok: true, action };
}

function resolveActionInstanceId(action, { candidateInstanceIds = null, triggerInstanceId = null, sourceLabel = "Agent" } = {}) {
  const candidateIds = Array.from(new Set((candidateInstanceIds || []).filter((id) => state.instancesById.has(id))));

  const explicitInstanceIdByLabel = action?.instanceLabel
    ? getInternalInstanceIdByLabel(action.instanceLabel)
    : null;

  const explicitInstanceId = explicitInstanceIdByLabel || ((action?.instanceId && state.instancesById.has(action.instanceId)) ? action.instanceId : null);

  if (action?.instanceLabel && !explicitInstanceIdByLabel) {
    logRuntimeNotice("skipped_action", sourceLabel + ": Unbekanntes instanceLabel '" + action.instanceLabel + "' in Action-Output.");
  }

  const ownerInstanceIds = Array.from(new Set([
    resolveOwnerInstanceIdForStickyReference(action?.stickyId),
    resolveOwnerInstanceIdForStickyReference(action?.fromStickyId),
    resolveOwnerInstanceIdForStickyReference(action?.toStickyId)
  ].filter(Boolean)));

  if (ownerInstanceIds.length > 1) {
    logRuntimeNotice("skipped_action", sourceLabel + ": Action referenziert Sticky Notes aus mehreren Instanzen – übersprungen.");
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
      logRuntimeNotice(
        "skipped_action",
        sourceLabel + ": Abgeleitete Ziel-Instanz " +
        (getInstanceLabelByInternalId(preferredInstanceId) || preferredInstanceId) +
        " liegt außerhalb des erlaubten Zielsets – Action übersprungen."
      );
      return null;
    }
    return preferredInstanceId;
  }

  if (candidateIds.length === 1) return candidateIds[0];
  if (triggerInstanceId && candidateIds.includes(triggerInstanceId)) return triggerInstanceId;
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
      logRuntimeNotice("skipped_action", sourceLabel + ": Unbekanntes oder nicht unterstütztes Action-Schema – übersprungen.", rawAction);
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

    const validation = validateNormalizedAction(action);
    if (!validation.ok) {
      skippedCount++;
      logRuntimeNotice("skipped_action", sourceLabel + ": " + validation.message + " – übersprungen.", rawAction);
      continue;
    }
    action = validation.action || action;

    if (action.type === "inform") {
      infoCount++;
      log(sourceLabel + " info:");
      log(action.message || "(keine Nachricht)");
      continue;
    }

    const targetInstanceId = resolveActionInstanceId(action, {
      candidateInstanceIds,
      triggerInstanceId,
      sourceLabel
    });

    if (!targetInstanceId) {
      skippedCount++;
      logRuntimeNotice("skipped_action", sourceLabel + ": Keine Ziel-Instanz für Action ableitbar – übersprungen.", rawAction);
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
    log(sourceLabel + ": Wende " + instanceActions.length + " Action(s) auf Instanz " + (getInstanceLabelByInternalId(instanceId) || instanceId) + " an.");
    const executionStats = await applyAgentActionsToInstance(instanceId, instanceActions);
    mergeActionExecutionStats(aggregatedExecutionStats, executionStats);
  }

  const totalSkippedCount = skippedCount + Number(aggregatedExecutionStats.skippedActionCount || 0);

  return {
    appliedCount,
    skippedCount: totalSkippedCount,
    infoCount,
    targetedInstanceCount: grouped.size,
    ...aggregatedExecutionStats,
    skippedActionCount: totalSkippedCount
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
    logRuntimeNotice("precondition", msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return buildRunFailureResult("precondition", msg);
  }

  const runLock = tryAcquireAgentRunLock(sourceLabel);
  if (!runLock) {
    return buildRunFailureResult("run_locked", sourceLabel + ": Ein Agent-Run läuft bereits.");
  }

  let boardRunToken = null;
  let finalBoardRunStatus = "failed";
  let finalBoardRunMessage = null;

  try {
    log(
      "Starte globalen Agenten-Run, Trigger-Instanz: " +
      (getInstanceLabelByInternalId(triggerInstanceId) || triggerInstanceId || "(keine)") +
      (triggerContext?.triggerKey ? (" | Trigger: " + triggerContext.triggerKey) : "")
    );

    const preliminaryTargetIds = forceTargetSet
      ? forcedInstanceIds.slice()
      : Array.from(state.instancesById.keys());

    const boardRunStart = await acquireBoardSoftLock({
      sourceLabel,
      targetInstanceIds: preliminaryTargetIds
    });

    if (!boardRunStart.ok) {
      const msg = formatExistingBoardRunMessage(sourceLabel, boardRunStart.current);
      logRuntimeNotice("run_locked", msg);
      await notifyRuntime(msg, { level: "warning" });
      return buildRunFailureResult("run_locked", msg, { currentRunState: boardRunStart.current || null });
    }

    boardRunToken = boardRunStart.token;

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
      const msg = sourceLabel + ": Keine gültigen Ziel-Instanzen für den globalen Exercise-Lauf gefunden.";
      logRuntimeNotice("precondition", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("precondition", msg);
    }

    boardRunToken.targetInstanceIds = activeInstanceIds.slice();
    boardRunToken.statusItemIds = await createRunStatusItems(activeInstanceIds, sourceLabel, boardRunToken.runId);
    await syncBoardSoftLock(boardRunToken, {
      targetInstanceIds: activeInstanceIds,
      statusItemIds: boardRunToken.statusItemIds
    });
    await notifyRuntime("AI arbeitet: " + sourceLabel, { level: "info" });

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
    const expectedSignatureSnapshot = buildSignatureSnapshot(stateById, activeInstanceIds);
    const flowPromptContext = resolveFlowPromptContext({
      promptRuntimeOverride,
      targetInstanceIds: activeInstanceIds
    });
    const baseUserPayload = {
      triggerInstanceLabel: getInstanceLabelByInternalId(triggerInstanceId) || null,
      hasBaseline: state.hasGlobalBaseline,
      boardCatalog,
      activeInstanceLabels,
      activeCanvasStates,
      activeInstanceChangesSinceLastAgent,
      memoryState: memoryPayload.memoryState,
      recentMemoryLogEntries: memoryPayload.recentMemoryLogEntries,
      flowControlCatalog: flowPromptContext.flowControlCatalog,
      boardFlowState: flowPromptContext.boardFlowState,
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

    log("Sende " + sourceLabel + "-Request an OpenAI ...");
    const structuredResult = await OpenAI.callOpenAIAgentStructured({
      apiKey,
      model,
      systemPrompt: composedPrompt.systemPrompt,
      userText: JSON.stringify(composedPrompt.userPayload, null, 2)
    });

    if (structuredResult.refusal) {
      const msg = sourceLabel + ": Modell verweigert die Antwort: " + structuredResult.refusal;
      logRuntimeNotice("model_refusal", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("model_refusal", msg, { refusal: structuredResult.refusal });
    }

    const agentObj = structuredResult.parsed;
    if (!agentObj) {
      const msg = sourceLabel + ": Antwort ist kein valides strukturiertes JSON.";
      logRuntimeNotice("invalid_json", msg, structuredResult.outputText || "(keine output_text-Antwort)");
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("invalid_json", msg, { rawOutputText: structuredResult.outputText || null });
    }

    if (hasMutatingActions(agentObj.actions)) {
      const conflictCheck = await performPreApplyConflictCheck(expectedSignatureSnapshot, sourceLabel);
      if (!conflictCheck.ok) {
        logRuntimeNotice("stale_state_conflict", conflictCheck.message, conflictCheck.conflicts);
        finalBoardRunStatus = "conflicted";
        finalBoardRunMessage = conflictCheck.message;
        return buildRunFailureResult("stale_state_conflict", conflictCheck.message, { conflicts: conflictCheck.conflicts });
      }
    }

    const { feedback, flowControlDirectives, evaluation } = normalizeAgentExerciseArtifacts(agentObj, triggerContext, sourceLabel);

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

    const flowDirectiveResult = triggerContext
      ? await applyFlowControlDirectivesAfterAgentRun({
          flowControlDirectives,
          promptRuntimeOverride,
          targetInstanceIds: activeInstanceIds,
          sourceLabel
        })
      : null;

    const appliedFlowControlDirectives = flowDirectiveResult?.flowControlDirectives || flowControlDirectives;
    const responseRenderResult = await renderAgentResponseToInstanceOutput({
      instanceId: resolveResponseTargetInstanceId({
        promptRuntimeOverride,
        targetInstanceIds: activeInstanceIds,
        triggerInstanceId
      }),
      feedback,
      flowControlDirectives: appliedFlowControlDirectives,
      evaluation,
      sourceLabel
    });

    if (triggerContext) {
      await persistExerciseRuntimeAfterAgentRun({
        triggerContext,
        flowControlDirectives: appliedFlowControlDirectives,
        activeAnchorContext: flowDirectiveResult?.activeAnchorContext || null
      });
    }

    if (responseRenderResult?.outputShapeId) {
      log(sourceLabel + ": Antwort in Ausgabebox von '" + responseRenderResult.instanceLabel + "' geschrieben (Shape " + responseRenderResult.outputShapeId + ").");
    }

    finalBoardRunStatus = "completed";
    finalBoardRunMessage = sourceLabel + ": abgeschlossen.";

    return buildRunSuccessResult({
      sourceLabel,
      targetInstanceLabels: activeInstanceLabels,
      actionResult,
      baselineUpdated: updateGlobalBaseline
    });
  } catch (e) {
    const msg = "Exception beim globalen Agent-Run: " + formatRuntimeErrorMessage(e);
    logRuntimeNotice("fatal", msg, e?.stack || null);
    finalBoardRunStatus = "failed";
    finalBoardRunMessage = msg;
    return buildRunFailureResult("fatal", msg, { error: e });
  } finally {
    if (boardRunToken) {
      await finalizeBoardSoftLock(boardRunToken, {
        status: finalBoardRunStatus,
        message: finalBoardRunMessage
      });
    }
    releaseAgentRunLock(runLock);
  }
}

function promptPayloadHasVisibleContent(promptPayload) {
  if (!promptPayload || typeof promptPayload !== "object") return false;
  const templates = Array.isArray(promptPayload.templates) ? promptPayload.templates : [];
  for (const tpl of templates) {
    if (Array.isArray(tpl?.header?.stickies) && tpl.header.stickies.length) return true;
    for (const area of Array.isArray(tpl?.areas) ? tpl.areas : []) {
      if (Array.isArray(area?.stickies) && area.stickies.length) return true;
    }
  }
  return false;
}

function userExplicitlyAskedForExampleStickies(userText) {
  const value = pickFirstNonEmptyString(userText);
  if (!value) return false;
  const norm = value.toLowerCase();
  return /beispiel|beispiel-sticky|beispielsticky|beispielhafte? sticky|setze .*beispiel|platziere .*beispiel|lege .*beispiel/.test(norm);
}

function sanitizeProposalActionsForCurrentStep(actions, {
  stepId = null,
  activeCanvasPayload = null,
  userText = null,
  logFn = null
} = {}) {
  const normalizedStepId = pickFirstNonEmptyString(stepId);
  const normalizedActions = Array.isArray(actions)
    ? actions.map((raw) => normalizeAgentAction(raw)).filter(Boolean)
    : [];

  if (normalizedStepId !== "step0_preparation_and_focus") {
    return normalizedActions;
  }

  const boardHasContent = promptPayloadHasVisibleContent(activeCanvasPayload);
  const explicitExamples = userExplicitlyAskedForExampleStickies(userText);
  const logSafe = typeof logFn === "function" ? logFn : (() => {});
  const allowedAreas = new Set(["header", "sorted_out_left"]);
  const sanitized = [];
  let createdHeaderCount = 0;
  let createdSupportCount = 0;

  for (const action of normalizedActions) {
    if (!action || action.type === "inform") continue;

    if (action.type === "create_sticky") {
      const area = pickFirstNonEmptyString(action.area, action.targetArea);
      if (!allowedAreas.has(area)) {
        logSafe("INFO: Step-0-Proposal verwirft create_sticky außerhalb von Header oder Sorted-out links: " + String(area || "(leer)"));
        continue;
      }
      if (!boardHasContent && !explicitExamples) {
        if (area === "header") {
          if (createdHeaderCount >= 1) {
            logSafe("INFO: Step-0-Proposal auf leerem Canvas begrenzt Header-Vorschläge auf eine Sticky.");
            continue;
          }
          createdHeaderCount += 1;
        } else {
          if (createdSupportCount >= 2) {
            logSafe("INFO: Step-0-Proposal auf leerem Canvas begrenzt Scope-/Annahmen-Vorschläge auf zwei Stickies.");
            continue;
          }
          createdSupportCount += 1;
        }
      }

      sanitized.push(action);
      continue;
    }

    if (action.type === "move_sticky") {
      const area = pickFirstNonEmptyString(action.targetArea, action.area);
      if (!allowedAreas.has(area)) {
        logSafe("INFO: Step-0-Proposal verwirft move_sticky außerhalb von Header oder Sorted-out links: " + String(area || "(leer)"));
        continue;
      }
      sanitized.push(action);
      continue;
    }

    if (action.type === "set_sticky_color" || action.type === "set_check_status" || action.type === "delete_sticky") {
      sanitized.push(action);
      continue;
    }

    sanitized.push(action);
  }

  return sanitized;
}


