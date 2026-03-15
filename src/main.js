import {
  TEMPLATE_ID,
  DT_TEMPLATE_CATALOG,
  DT_CANVAS_DEFS,
  DT_PROMPT_CATALOG,
  DT_GLOBAL_SYSTEM_PROMPT,
  DT_MEMORY_RECENT_LOG_LIMIT,
  DT_RUN_STATE_STALE_AFTER_MS,
  DT_RUN_STATUS_LAYOUT,
  DT_CHECK_TAG_TITLE,
  DT_CHECK_TAG_COLOR,
  normalizeStickyColorToken,
  STICKY_LAYOUT
} from "./config.js?v=20260315-patch17-analytics-prompt-refresh2";

import { createLogger, stripHtml, extractUnderlinedText, isFiniteNumber } from "./utils.js?v=20260315-patch17-analytics-prompt-refresh2";
import { normalizeUiLanguage, t, getLocaleForLanguage } from "./i18n/index.js?v=20260315-patch15-flow-endpoint-overrides";

import * as Board from "./miro/board.js?v=20260315-patch15-flow-endpoint-overrides";
import * as Catalog from "./domain/catalog.js?v=20260315-patch17-analytics-prompt-refresh2";
import * as OpenAI from "./ai/openai.js?v=20260315-patch17-analytics-prompt-refresh2";
import * as Memory from "./runtime/memory.js?v=20260315-patch17-analytics-prompt-refresh2";
import * as Exercises from "./exercises/registry.js?v=20260315-patch17-analytics-prompt-refresh2";
import * as ExerciseLibrary from "./exercises/library.js?v=20260315-patch17-analytics-prompt-refresh2";
import * as PromptComposer from "./prompt/composer.js?v=20260315-patch17-analytics-prompt-refresh2";
import * as ExerciseEngine from "./runtime/exercise-engine.js?v=20260315-patch17-analytics-prompt-refresh2";
import * as BoardFlow from "./runtime/board-flow.js?v=20260315-patch17-analytics-prompt-refresh2";
import * as PanelBridge from "./runtime/panel-bridge.js?v=20260315-patch14-runtime-cleanup";
import { getInsertWidthPxForCanvasType, computeTemplateInsertPosition } from "./app/template-insertion.js?v=20260315-patch17-analytics-prompt-refresh2";
import {
  pickFirstNonEmptyString,
  makeDirectedConnectorKey,
  makeUndirectedConnectorKey,
  normalizeAgentAction
} from "./agent/action-normalization.js?v=20260315-patch17-analytics-prompt-refresh2";
import { createEmptyActionExecutionStats, mergeActionExecutionStats, summarizeAppliedActions } from "./agent/action-stats.js?v=20260315-patch14-runtime-cleanup";

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
  lastActivatedFlowControlItemId: null,
  lastActivatedFlowControlAt: 0,
  flowControlLabelDirty: false,
  lastAutoFlowControlLabel: "",

  // UI state
  conversationStateByInstanceId: new Map(),
  selectedCanvasTypeId: TEMPLATE_ID,
  panelInteractionState: {
    flowId: null,
    flowStepId: null,
    selectedInstanceIds: [],
    hasPendingProposalForFlowStep: false,
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
const boardLanguageEl = document.getElementById("board-language");
const panelModeStatusEl = document.getElementById("panel-mode-status");
const selectionStatusEl = document.getElementById("selection-status");
const canvasTypePickerEl = document.getElementById("canvas-type-picker");
const exerciseContextStatusEl = document.getElementById("exercise-context-status");
const exerciseStepInstructionEl = document.getElementById("exercise-step-instruction");
const exerciseRecommendationStatusEl = document.getElementById("exercise-recommendation-status");
const apiKeyEl = document.getElementById("api-key");
const modelEl = document.getElementById("model");
const adminOverrideTextEl = document.getElementById("admin-override-text");
const flowExercisePackEl = document.getElementById("flow-exercise-pack");
const flowStepEl = document.getElementById("flow-step");
const flowEndpointEl = document.getElementById("flow-endpoint");
const flowEndpointOverrideStatusEl = document.getElementById("flow-endpoint-override-status");
const flowEndpointOverridePromptEl = document.getElementById("flow-endpoint-override-prompt");
const flowEndpointOverrideExecutionModeEl = document.getElementById("flow-endpoint-override-execution-mode");
const flowEndpointOverrideActionsEl = document.getElementById("flow-endpoint-override-actions");
const flowEndpointOverrideAreasEl = document.getElementById("flow-endpoint-override-areas");
const btnFlowEndpointOverrideSaveEl = document.getElementById("btn-flow-endpoint-override-save");
const btnFlowEndpointOverrideResetEl = document.getElementById("btn-flow-endpoint-override-reset");
const flowScopeTypeEl = document.getElementById("flow-scope-type");
const flowControlLabelEl = document.getElementById("flow-control-label");
const flowStaticLayoutToggleEl = document.getElementById("flow-static-layout-toggle");
const flowAuthoringStatusEl = document.getElementById("flow-authoring-status");
const btnFlowCreateControlEl = document.getElementById("btn-flow-create-control");
const btnFlowSetCurrentStepEl = document.getElementById("btn-flow-set-current-step");
const btnFlowActivateSelectedControlEl = document.getElementById("btn-flow-activate-selected-control");
const btnFlowCompleteSelectedControlEl = document.getElementById("btn-flow-complete-selected-control");
const btnFlowResetSelectedControlEl = document.getElementById("btn-flow-reset-selected-control");
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

const FLOW_ENDPOINT_OVERRIDE_ACTION_TYPES = Object.freeze([
  "create_sticky",
  "move_sticky",
  "delete_sticky",
  "create_connector",
  "set_sticky_color",
  "set_check_status"
]);

const FLOW_ENDPOINT_OVERRIDE_EXECUTION_MODE_OPTIONS = Object.freeze([
  "none",
  "proposal_only",
  "direct_apply"
]);

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

function logSuppressedRuntimeWarning(context, error, details = null) {
  log("WARNUNG: " + context + ": " + formatRuntimeErrorMessage(error));
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
  return state.boardConfig?.flowControlsStaticLayout !== false;
}

function getManagedAgentRunButtons() {
  return Array.from(document.querySelectorAll('[data-dt-agent-run="1"]'));
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
  } catch (error) {
    logSuppressedRuntimeWarning("Aktueller Run-Akteur konnte nicht aufgelöst werden", error);
  }

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
    } catch (error) {
      logSuppressedRuntimeWarning("Run-Status-Item konnte nicht entfernt werden (" + itemId + ")", error);
    }
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
    } catch (error) {
      logSuppressedRuntimeWarning("Canvas-Geometrie für Run-Status konnte nicht berechnet werden", error);
    }
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
function getCurrentDisplayLanguage() {
  return normalizeUiLanguage(state.boardConfig?.lang || boardLanguageEl?.value || "de");
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

  await syncAllChatProposeButtonsForCurrentFlows();
  await syncAllChatApplyButtonsForCurrentFlows();

  for (const [flowId, rawFlow] of state.boardFlowsById.entries()) {
    const normalizedFlow = await ensureBoardFlowHealthy(rawFlow, { persist: true, pruneMissingControls: true });
    const exercisePack = normalizedFlow.exercisePackId
      ? Exercises.getExercisePackById(normalizedFlow.exercisePackId, { lang })
      : null;
    const anchorLabel = getInstanceLabelByInternalId(normalizedFlow.anchorInstanceId) || normalizedFlow.anchorInstanceId || t("flow.status.none", lang);
    let changed = false;

    let nextFlow = {
      ...normalizedFlow,
      steps: (normalizedFlow.steps || []).map((step) => {
        const canonicalStep = exercisePack ? Exercises.getExerciseStep(exercisePack, step.stepId || step.id, { lang }) : null;
        let nextStep = step;
        if (step?.labelMode !== "custom" && canonicalStep?.label && step.label !== canonicalStep.label) {
          nextStep = { ...nextStep, label: canonicalStep.label };
          changed = true;
        }
        if (!step?.instructionOverride && canonicalStep?.flowInstruction && step.instruction !== canonicalStep.flowInstruction) {
          nextStep = { ...nextStep, instruction: canonicalStep.flowInstruction };
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
    }

    state.boardFlowsById.set(flowId, nextFlow);
    await syncBoardFlowVisuals(nextFlow, { reflow: false });
  }
}

async function applyBoardLanguage(nextLang, { syncBoardChrome = false } = {}) {
  const normalizedLang = normalizeUiLanguage(nextLang);
  if (state.boardConfig?.lang !== normalizedLang) {
    await persistBoardConfig({ lang: normalizedLang });
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

function renderPanelStatus() {
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

function getCurrentBoardMode() {
  return state.boardConfig?.mode === "exercise" ? "exercise" : "generic";
}

function getSelectedInstanceIds() {
  return Array.isArray(state.lastCanvasSelectionInstanceIds)
    ? state.lastCanvasSelectionInstanceIds.filter(Boolean)
    : [];
}

function resolveRelevantFlowForInstance(instanceId) {
  const normalized = pickFirstNonEmptyString(instanceId);
  if (!normalized) return null;

  const matching = Array.from(state.boardFlowsById.values())
    .filter((flow) => flow?.anchorInstanceId === normalized);

  return matching.length === 1 ? matching[0] : null;
}

function resolveRelevantFlowForSelection(instanceIds) {
  const normalized = Array.from(new Set((Array.isArray(instanceIds) ? instanceIds : [])
    .map((value) => pickFirstNonEmptyString(value))
    .filter(Boolean)));
  if (!normalized.length) return null;

  const matching = normalized
    .map((instanceId) => resolveRelevantFlowForInstance(instanceId))
    .filter(Boolean);

  const unique = Array.from(new Map(matching.map((flow) => [flow.id, flow])).values());
  return unique.length === 1 ? unique[0] : null;
}

function resolveCurrentPackAndStepFromFlow(flow, { lang = getCurrentDisplayLanguage() } = {}) {
  if (!flow?.exercisePackId) return { exercisePack: null, currentStep: null };

  const exercisePack = Exercises.getExercisePackById(flow.exercisePackId, { lang });
  const currentStep = exercisePack
    ? Exercises.getExerciseStep(exercisePack, flow.runtime?.currentStepId, { lang })
    : null;

  return { exercisePack, currentStep };
}

function resolveActiveFlowContext(instanceIds = getSelectedInstanceIds(), { lang = getCurrentDisplayLanguage() } = {}) {
  const flow = resolveRelevantFlowForSelection(instanceIds);
  const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow, { lang });
  return { flow, exercisePack, currentStep };
}

function getCurrentUserQuestion() {
  const text = getPanelUserText();
  if (text) return text;

  const { currentStep } = resolveActiveFlowContext();
  const visibleInstruction = (typeof currentStep?.visibleInstruction === "string")
    ? currentStep.visibleInstruction.trim()
    : "";

  return visibleInstruction || t("runtime.genericUserQuestion", getCurrentDisplayLanguage());
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
  } catch (error) {
    logSuppressedRuntimeWarning("Board-Benachrichtigung konnte nicht angezeigt werden", error);
  }
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
  const tag = await Board.ensureBoardTag({
    title: DT_CHECK_TAG_TITLE,
    color: DT_CHECK_TAG_COLOR,
    preferredId: null
  }, log);

  return (typeof tag?.id === "string" && tag.id.trim()) ? tag.id.trim() : null;
}

async function persistExerciseRuntime(partialRuntime = {}) {
  const merged = Board.normalizeExerciseRuntime({
    ...(state.exerciseRuntime || {}),
    ...(partialRuntime || {})
  });

  state.exerciseRuntime = await Board.saveExerciseRuntime(merged, log);
  return state.exerciseRuntime;
}

function renderExerciseContextStatus() {
  const lang = getCurrentDisplayLanguage();
  const { flow, exercisePack, currentStep } = resolveActiveFlowContext();
  const selectedCanvasType = getCanvasTypeEntry(getSelectedCanvasTypeId());
  const flowLabel = pickFirstNonEmptyString(flow?.label, flow?.id, t("flow.status.none", lang));
  const packLabel = pickFirstNonEmptyString(exercisePack?.label, t("exercise.context.pack.none", lang));
  const stepLabel = pickFirstNonEmptyString(currentStep?.label, t("exercise.context.currentStep.none", lang));

  if (exerciseContextStatusEl) {
    const lines = [
      t("exercise.context.boardMode", lang, { value: getBoardModeLabel(getCurrentBoardMode(), lang) }),
      `Flow: ${flowLabel}`,
      t("exercise.context.pack", lang, { value: packLabel }),
      t("exercise.context.currentStep", lang, { value: stepLabel }),
      t("exercise.context.canvasType", lang, { value: selectedCanvasType?.displayName || getSelectedCanvasTypeId() })
    ];
    if (!flow) {
      lines.push(lang === "en"
        ? "No unique flow could be resolved from the current selection."
        : "Aus der aktuellen Selektion konnte kein eindeutiger Flow bestimmt werden.");
    }
    exerciseContextStatusEl.textContent = lines.join("\n");
  }

  if (exerciseStepInstructionEl) {
    exerciseStepInstructionEl.textContent = currentStep?.visibleInstruction || t("exercise.instruction.none", lang);
  }
}

function renderAdminOverrideEditor() {
  if (!adminOverrideTextEl) return;
  const nextText = state.exerciseRuntime?.adminOverride || "";
  if (document.activeElement !== adminOverrideTextEl) {
    adminOverrideTextEl.value = nextText;
  }
}

function buildExerciseActionSurfaceModel() {
  const lang = getCurrentDisplayLanguage();
  const interactionState = (state.panelInteractionState && typeof state.panelInteractionState === "object") ? state.panelInteractionState : {};
  const selectedInstanceIds = Array.isArray(interactionState.selectedInstanceIds)
    ? interactionState.selectedInstanceIds.filter(Boolean)
    : getSelectedInstanceIds();
  const { flow, exercisePack, currentStep } = resolveActiveFlowContext(selectedInstanceIds, { lang });
  const pendingProposalInstanceIds = Array.isArray(interactionState.pendingProposalInstanceIds)
    ? interactionState.pendingProposalInstanceIds.filter(Boolean)
    : [];
  const hasPendingProposalForFlowStep = !!(
    flow?.id &&
    currentStep?.id &&
    interactionState.flowId === flow.id &&
    interactionState.flowStepId === currentStep.id &&
    pendingProposalInstanceIds.length
  );

  const runtimeDoneIds = new Set(Array.isArray(flow?.runtime?.doneEndpointIds) ? flow.runtime.doneEndpointIds.filter(Boolean) : []);
  const runtimeUnlockedIds = new Set(Array.isArray(flow?.runtime?.unlockedEndpointIds) ? flow.runtime.unlockedEndpointIds.filter(Boolean) : []);
  const endpoints = exercisePack && currentStep?.id
    ? ExerciseLibrary.listBoardButtonEndpointsForStep(exercisePack, currentStep.id, { lang })
    : [];

  const decorate = (entries) => entries.map((endpoint) => ({
    ...endpoint,
    isDone: runtimeDoneIds.has(endpoint.id),
    isUnlocked: runtimeDoneIds.has(endpoint.id) || runtimeUnlockedIds.has(endpoint.id),
    isMaterialized: !!(flow && BoardFlow.findFlowControlsByEndpointId(flow, endpoint.id).length),
    disabled: true
  }));

  const primaryEndpoints = decorate(endpoints.filter((endpoint) => endpoint.surface?.group === "primary"));
  const secondaryEndpoints = decorate(endpoints.filter((endpoint) => endpoint.surface?.group === "secondary"));
  const proposalEndpoints = decorate(endpoints.filter((endpoint) => endpoint.surface?.group === "proposal"));
  const nextTransition = currentStep
    ? ExerciseEngine.resolveNextStepTransition(currentStep, flow?.runtime || null, state.memoryState || null)
    : null;

  return {
    lang,
    flow,
    exercisePack,
    currentStep,
    selectedInstanceIds,
    pendingProposalInstanceIds,
    hasPendingProposalForFlowStep,
    nextTransition,
    primaryEndpoints,
    secondaryEndpoints,
    proposalEndpoints
  };
}


async function computePendingProposalAvailabilityForSelection(flow, currentStep, instanceIds) {
  const normalizedStepId = pickFirstNonEmptyString(currentStep?.id);
  const pendingProposalInstanceIds = [];
  if (!flow?.id || !normalizedStepId) {
    return {
      hasPendingProposalForFlowStep: false,
      pendingProposalInstanceIds
    };
  }
  for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
    const proposal = await loadPendingProposalForInstance(instanceId, { stepId: normalizedStepId });
    if (proposal?.proposalId) pendingProposalInstanceIds.push(instanceId);
  }
  return {
    hasPendingProposalForFlowStep: pendingProposalInstanceIds.length > 0,
    pendingProposalInstanceIds
  };
}

async function refreshPanelInteractionState() {
  const lang = getCurrentDisplayLanguage();
  const selectedInstanceIds = getSelectedInstanceIds();
  const { flow, exercisePack, currentStep } = resolveActiveFlowContext(selectedInstanceIds, { lang });
  const nextState = {
    flowId: flow?.id || null,
    flowStepId: currentStep?.id || null,
    selectedInstanceIds: selectedInstanceIds.slice(),
    hasPendingProposalForFlowStep: false,
    pendingProposalInstanceIds: []
  };

  const hasChatApplyEndpoint = !!(exercisePack && currentStep?.id && ExerciseLibrary.findFirstEndpointByChannel(
    exercisePack,
    currentStep.id,
    "chat_apply",
    { lang }
  ));

  if (flow?.id && currentStep?.id && hasChatApplyEndpoint && selectedInstanceIds.length) {
    const proposalState = await computePendingProposalAvailabilityForSelection(flow, currentStep, selectedInstanceIds);
    nextState.hasPendingProposalForFlowStep = proposalState.hasPendingProposalForFlowStep;
    nextState.pendingProposalInstanceIds = proposalState.pendingProposalInstanceIds;
  }

  state.panelInteractionState = nextState;
  return nextState;
}

async function refreshExerciseInteractionSurface() {
  await refreshPanelInteractionState();
  renderRecommendationStatus();
}

function renderRecommendationStatus() {
  if (!exerciseRecommendationStatusEl) return;

  const model = buildExerciseActionSurfaceModel();
  const lang = model.lang;
  const lines = [];
  const lastEndpointId = state.exerciseRuntime?.lastEndpointId || null;
  const lastUnlocked = Array.isArray(state.exerciseRuntime?.lastFlowDirectiveUnlockEndpointIds)
    ? state.exerciseRuntime.lastFlowDirectiveUnlockEndpointIds.filter(Boolean)
    : [];
  const lastCompleted = Array.isArray(state.exerciseRuntime?.lastFlowDirectiveCompleteEndpointIds)
    ? state.exerciseRuntime.lastFlowDirectiveCompleteEndpointIds.filter(Boolean)
    : [];
  const lastActiveFlowAnchorInstanceId = state.exerciseRuntime?.lastActiveFlowAnchorInstanceId || null;
  const formatEndpointLabels = (endpoints) => (Array.isArray(endpoints) ? endpoints : [])
    .map((endpoint) => endpoint?.label || endpoint?.id)
    .filter(Boolean)
    .join(", ") || t("recommendation.lastUnlocked.none", lang);

  lines.push(`Flow: ${pickFirstNonEmptyString(model.flow?.label, model.flow?.id, t("flow.status.none", lang))}`);
  lines.push(t("recommendation.primaryActions", lang, { value: formatEndpointLabels(model.primaryEndpoints) }));
  lines.push(t("recommendation.secondaryActions", lang, { value: formatEndpointLabels(model.secondaryEndpoints) }));
  if (model.proposalEndpoints.length) {
    lines.push(t("recommendation.proposalActions", lang, {
      value: formatEndpointLabels(model.proposalEndpoints) + " · " + (model.hasPendingProposalForFlowStep
        ? t("recommendation.proposalState.ready", lang)
        : t("recommendation.proposalState.missing", lang))
    }));
  }
  if (model.nextTransition) {
    const nextStep = Exercises.getExerciseStep(model.exercisePack, model.nextTransition.toStepId, { lang });
    lines.push(t("recommendation.nextStep.ready", lang, { value: nextStep?.label || model.nextTransition.toStepId }));
  } else {
    lines.push(t("recommendation.nextStep.blocked", lang));
  }
  lines.push(`Last endpoint: ${lastEndpointId || t("recommendation.lastEndpoint.none", lang)}`);
  lines.push(t("recommendation.lastUnlocked", lang, { value: lastUnlocked.join(", ") || t("recommendation.lastUnlocked.none", lang) }));
  lines.push(t("recommendation.lastCompleted", lang, { value: lastCompleted.join(", ") || t("recommendation.lastCompleted.none", lang) }));
  if (lastActiveFlowAnchorInstanceId) {
    lines.push(t("recommendation.lastFlowAnchor", lang, {
      value: getInstanceLabelByInternalId(lastActiveFlowAnchorInstanceId) || lastActiveFlowAnchorInstanceId
    }));
  }

  exerciseRecommendationStatusEl.textContent = lines.join("\n");
}

function renderExerciseControls() {
  renderExerciseContextStatus();
  renderRecommendationStatus();
  renderAdminOverrideEditor();
  renderFlowAuthoringControls();
  renderPanelStatus();
  void refreshExerciseInteractionSurface();
}

function getSelectedFlowExercisePackId() {
  const requested = pickFirstNonEmptyString(flowExercisePackEl?.value);
  if (requested) return requested;
  return Exercises.listExercisePacks({ lang: getCurrentDisplayLanguage() })[0]?.id || null;
}

function getSelectedFlowExercisePack(options = {}) {
  const lang = normalizeUiLanguage(options.lang || getCurrentDisplayLanguage());
  return Exercises.getExercisePackById(getSelectedFlowExercisePackId(), { lang });
}

function getSelectedFlowStepId(exercisePack = getSelectedFlowExercisePack()) {
  if (!exercisePack) return null;
  const requestedId = pickFirstNonEmptyString(flowStepEl?.value);
  const exact = requestedId ? Exercises.getExerciseStep(exercisePack, requestedId) : null;
  if (exact) return exact.id;
  return Exercises.getDefaultStepId(exercisePack) || Exercises.listExerciseSteps(exercisePack)[0]?.id || null;
}

function getSelectedFlowStep(exercisePack = getSelectedFlowExercisePack(), options = {}) {
  const lang = normalizeUiLanguage(options.lang || getCurrentDisplayLanguage());
  const stepId = getSelectedFlowStepId(exercisePack);
  return stepId ? Exercises.getExerciseStep(exercisePack, stepId, { lang }) : null;
}

function getSelectedFlowEndpointId(exercisePack = getSelectedFlowExercisePack(), step = getSelectedFlowStep(exercisePack)) {
  if (!exercisePack || !step) return null;
  const requestedId = pickFirstNonEmptyString(flowEndpointEl?.value);
  const exact = requestedId ? ExerciseLibrary.getEndpointById(requestedId) : null;
  if (exact && exact.exercisePackId === exercisePack.id && exact.stepId === step.id && !ExerciseLibrary.isSidecarOnlyEndpoint(exact) && exact.surface?.group !== 'hidden') {
    return exact.id;
  }
  return listAuthorableEndpointsForStep(exercisePack, step.id)[0]?.id || null;
}

function getSelectedFlowEndpoint(exercisePack = getSelectedFlowExercisePack(), step = getSelectedFlowStep(exercisePack), options = {}) {
  const lang = normalizeUiLanguage(options.lang || getCurrentDisplayLanguage());
  const endpointId = getSelectedFlowEndpointId(exercisePack, step);
  return endpointId ? ExerciseLibrary.getEndpointById(endpointId, { lang }) : null;
}

function isFlowEndpointOverrideEligible(endpoint) {
  return !!(
    endpoint?.id &&
    endpoint?.surface?.channel === "board_button" &&
    endpoint?.surface?.group !== "hidden" &&
    !ExerciseLibrary.isSidecarOnlyEndpoint(endpoint)
  );
}

function getFlowEndpointOverride(endpointId) {
  const normalizedEndpointId = pickFirstNonEmptyString(endpointId);
  if (!normalizedEndpointId) return null;
  const override = state.exerciseRuntime?.flowEndpointOverridesById?.[normalizedEndpointId];
  return override && typeof override === "object" ? override : null;
}

function getEffectiveFlowEndpointById(endpointId, { lang = getCurrentDisplayLanguage() } = {}) {
  const rawEndpoint = endpointId ? ExerciseLibrary.getEndpointById(endpointId, { lang }) : null;
  if (!isFlowEndpointOverrideEligible(rawEndpoint)) return rawEndpoint;
  const override = getFlowEndpointOverride(rawEndpoint.id);
  if (!override) return rawEndpoint;

  const nextRun = {
    ...(rawEndpoint.run || {}),
    allowedExecutionModes: Array.isArray(rawEndpoint.run?.allowedExecutionModes) ? rawEndpoint.run.allowedExecutionModes.slice() : ["none"],
    allowedActions: Array.isArray(rawEndpoint.run?.allowedActions) ? rawEndpoint.run.allowedActions.slice() : [],
    allowedActionAreas: Array.isArray(rawEndpoint.run?.allowedActionAreas) ? rawEndpoint.run.allowedActionAreas.slice() : []
  };

  if (override.executionMode) {
    nextRun.allowedExecutionModes = [override.executionMode];
  }
  if (override.allowedActions !== null) {
    nextRun.allowedActions = Array.isArray(override.allowedActions) ? override.allowedActions.slice() : [];
  }
  if (override.allowedActionAreas !== null) {
    nextRun.allowedActionAreas = Array.isArray(override.allowedActionAreas) ? override.allowedActionAreas.slice() : [];
  }

  return {
    ...rawEndpoint,
    prompt: {
      ...(rawEndpoint.prompt || {}),
      text: override.promptText || rawEndpoint.prompt?.text || ""
    },
    run: nextRun
  };
}


function normalizeStringSet(values) {
  return ExerciseEngine.normalizeStringArray(values).slice().sort();
}

function sameStringSet(a, b) {
  const left = normalizeStringSet(a);
  const right = normalizeStringSet(b);
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function normalizeUnrestrictedCheckboxSelection(selectedValues, availableValues) {
  const normalizedSelected = ExerciseEngine.normalizeStringArray(selectedValues);
  const normalizedAvailable = ExerciseEngine.normalizeStringArray(availableValues);
  if (!normalizedSelected.length) return [];
  if (normalizedAvailable.length && sameStringSet(normalizedSelected, normalizedAvailable)) return [];
  return normalizedSelected;
}

function getCheckedValuesFromCheckboxContainer(containerEl) {
  if (!containerEl) return [];
  return Array.from(containerEl.querySelectorAll('input[type="checkbox"]'))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function getFlowEndpointExecutionModeValue(endpoint) {
  const modes = ExerciseEngine.normalizeAllowedExecutionModes(endpoint?.run?.allowedExecutionModes, ["none"]);
  return modes[0] || "none";
}

function listAvailableAreaOptionsForFlowEndpoint(endpoint, exercisePack = null) {
  const explicitCanvasTypeIds = ExerciseEngine.normalizeStringArray(endpoint?.scope?.allowedCanvasTypeIds);
  const packCanvasTypeIds = ExerciseEngine.normalizeStringArray(
    exercisePack?.allowedCanvasTypeIds || Exercises.getAllowedCanvasTypesForPack(exercisePack)
  );
  const fallbackCanvasTypeId = normalizeCanvasTypeId(state.selectedCanvasTypeId || TEMPLATE_ID);
  const canvasTypeIds = explicitCanvasTypeIds.length
    ? explicitCanvasTypeIds
    : (packCanvasTypeIds.length ? packCanvasTypeIds : [fallbackCanvasTypeId]);

  const seen = new Set();
  const options = [];

  for (const canvasTypeId of canvasTypeIds) {
    const header = Catalog.getHeaderRegionDef(canvasTypeId);
    if (header?.id && !seen.has(header.id)) {
      seen.add(header.id);
      options.push({
        id: header.id,
        label: header.title || header.id,
        meta: header.id
      });
    }

    for (const area of Catalog.getBodyRegionDefs(canvasTypeId)) {
      if (!area?.id || seen.has(area.id)) continue;
      seen.add(area.id);
      options.push({
        id: area.id,
        label: area.title || area.id,
        meta: area.id
      });
    }
  }

  return options;
}

function getFlowEndpointActionOptions(lang = getCurrentDisplayLanguage()) {
  const normalizeActionLabel = (actionType) => {
    switch (actionType) {
      case "create_sticky": return lang === "de" ? "Sticky erstellen" : "Create sticky";
      case "move_sticky": return lang === "de" ? "Sticky bewegen" : "Move sticky";
      case "delete_sticky": return lang === "de" ? "Sticky löschen" : "Delete sticky";
      case "create_connector": return lang === "de" ? "Connector erstellen" : "Create connector";
      case "set_sticky_color": return lang === "de" ? "Sticky-Farbe setzen" : "Set sticky color";
      case "set_check_status": return lang === "de" ? "Check-Status setzen" : "Set check status";
      default: return actionType;
    }
  };

  return FLOW_ENDPOINT_OVERRIDE_ACTION_TYPES.map((actionType) => ({
    id: actionType,
    label: normalizeActionLabel(actionType),
    meta: actionType
  }));
}

function renderFlowEndpointOverrideCheckboxList(containerEl, options, selectedIds) {
  if (!containerEl) return;
  containerEl.textContent = "";
  const selectedSet = new Set(ExerciseEngine.normalizeStringArray(selectedIds));

  for (const option of Array.isArray(options) ? options : []) {
    const labelEl = document.createElement("label");
    labelEl.className = "checkbox-option";

    const inputEl = document.createElement("input");
    inputEl.type = "checkbox";
    inputEl.value = option.id;
    inputEl.checked = selectedSet.has(option.id);

    const textWrapperEl = document.createElement("span");
    textWrapperEl.textContent = option.label || option.id;

    const metaEl = document.createElement("span");
    metaEl.className = "checkbox-option-meta";
    metaEl.textContent = option.meta || option.id;

    const contentEl = document.createElement("span");
    contentEl.appendChild(textWrapperEl);
    contentEl.appendChild(metaEl);

    labelEl.appendChild(inputEl);
    labelEl.appendChild(contentEl);
    containerEl.appendChild(labelEl);
  }
}

function renderFlowEndpointOverrideExecutionModePicker(selectedMode) {
  if (!flowEndpointOverrideExecutionModeEl) return;
  const lang = getCurrentDisplayLanguage();
  const wantedMode = FLOW_ENDPOINT_OVERRIDE_EXECUTION_MODE_OPTIONS.includes(selectedMode) ? selectedMode : "none";

  flowEndpointOverrideExecutionModeEl.textContent = "";
  for (const mode of FLOW_ENDPOINT_OVERRIDE_EXECUTION_MODE_OPTIONS) {
    const optionEl = document.createElement("option");
    optionEl.value = mode;
    optionEl.textContent = t("flow.endpointOverride.executionMode." + mode, lang);
    optionEl.selected = mode === wantedMode;
    flowEndpointOverrideExecutionModeEl.appendChild(optionEl);
  }
}

function renderFlowEndpointOverrideEditor() {
  const lang = getCurrentDisplayLanguage();
  const exercisePack = getSelectedFlowExercisePack({ lang });
  const endpoint = getSelectedFlowEndpoint(exercisePack, getSelectedFlowStep(exercisePack, { lang }), { lang });
  const override = endpoint?.id ? getFlowEndpointOverride(endpoint.id) : null;
  const hasEligibleEndpoint = isFlowEndpointOverrideEligible(endpoint);

  if (flowEndpointOverrideStatusEl) {
    flowEndpointOverrideStatusEl.textContent = hasEligibleEndpoint
      ? t(override ? "flow.endpointOverride.status.override" : "flow.endpointOverride.status.catalog", lang)
      : t("flow.endpointOverride.status.empty", lang);
  }

  const promptText = hasEligibleEndpoint
    ? (override?.promptText || endpoint.prompt?.text || "")
    : "";
  if (flowEndpointOverridePromptEl) {
    flowEndpointOverridePromptEl.value = promptText;
    flowEndpointOverridePromptEl.disabled = !hasEligibleEndpoint;
  }

  const effectiveMode = hasEligibleEndpoint
    ? (override?.executionMode || getFlowEndpointExecutionModeValue(endpoint))
    : "none";
  renderFlowEndpointOverrideExecutionModePicker(effectiveMode);
  if (flowEndpointOverrideExecutionModeEl) {
    flowEndpointOverrideExecutionModeEl.disabled = !hasEligibleEndpoint;
  }

  const actionOptions = getFlowEndpointActionOptions(lang);
  const selectedActions = hasEligibleEndpoint
    ? (override?.allowedActions != null
        ? override.allowedActions
        : ExerciseEngine.normalizeStringArray(endpoint.run?.allowedActions))
    : [];
  renderFlowEndpointOverrideCheckboxList(flowEndpointOverrideActionsEl, actionOptions, selectedActions);

  const areaOptions = hasEligibleEndpoint ? listAvailableAreaOptionsForFlowEndpoint(endpoint, exercisePack) : [];
  const selectedAreas = hasEligibleEndpoint
    ? (override?.allowedActionAreas != null
        ? override.allowedActionAreas
        : ExerciseEngine.normalizeStringArray(endpoint.run?.allowedActionAreas))
    : [];
  renderFlowEndpointOverrideCheckboxList(flowEndpointOverrideAreasEl, areaOptions, selectedAreas);

  if (flowEndpointOverrideActionsEl) {
    flowEndpointOverrideActionsEl.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.disabled = !hasEligibleEndpoint; });
  }
  if (flowEndpointOverrideAreasEl) {
    flowEndpointOverrideAreasEl.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.disabled = !hasEligibleEndpoint; });
  }

  if (btnFlowEndpointOverrideSaveEl) btnFlowEndpointOverrideSaveEl.disabled = !hasEligibleEndpoint;
  if (btnFlowEndpointOverrideResetEl) btnFlowEndpointOverrideResetEl.disabled = !hasEligibleEndpoint || !override;
}

async function saveFlowEndpointOverrideFromUi() {
  const lang = getCurrentDisplayLanguage();
  const exercisePack = getSelectedFlowExercisePack({ lang });
  const endpoint = getSelectedFlowEndpoint(exercisePack, getSelectedFlowStep(exercisePack, { lang }), { lang });
  if (!isFlowEndpointOverrideEligible(endpoint)) {
    log("Flow-Endpoint-Override: Bitte zuerst einen gültigen Flow-Endpoint auswählen.");
    return;
  }

  const promptText = (flowEndpointOverridePromptEl?.value || "").trim();
  const executionMode = pickFirstNonEmptyString(flowEndpointOverrideExecutionModeEl?.value) || "none";
  const actionOptions = getFlowEndpointActionOptions(lang);
  const areaOptions = listAvailableAreaOptionsForFlowEndpoint(endpoint, exercisePack);
  const normalizedActions = normalizeUnrestrictedCheckboxSelection(
    getCheckedValuesFromCheckboxContainer(flowEndpointOverrideActionsEl),
    actionOptions.map((option) => option.id)
  );
  const normalizedAreas = normalizeUnrestrictedCheckboxSelection(
    getCheckedValuesFromCheckboxContainer(flowEndpointOverrideAreasEl),
    areaOptions.map((option) => option.id)
  );

  const catalogPromptText = endpoint.prompt?.text || "";
  const catalogExecutionMode = getFlowEndpointExecutionModeValue(endpoint);
  const catalogActions = normalizeUnrestrictedCheckboxSelection(
    ExerciseEngine.normalizeStringArray(endpoint.run?.allowedActions),
    actionOptions.map((option) => option.id)
  );
  const catalogAreas = normalizeUnrestrictedCheckboxSelection(
    ExerciseEngine.normalizeStringArray(endpoint.run?.allowedActionAreas),
    areaOptions.map((option) => option.id)
  );

  const overridePatch = {};
  if (promptText && promptText !== catalogPromptText) {
    overridePatch.promptText = promptText;
  }
  if (executionMode !== catalogExecutionMode) {
    overridePatch.executionMode = executionMode;
  }
  if (!sameStringSet(normalizedActions, catalogActions)) {
    overridePatch.allowedActions = normalizedActions;
  }
  if (!sameStringSet(normalizedAreas, catalogAreas)) {
    overridePatch.allowedActionAreas = normalizedAreas;
  }

  const nextOverrides = {
    ...(state.exerciseRuntime?.flowEndpointOverridesById || {})
  };

  if (Object.keys(overridePatch).length) {
    nextOverrides[endpoint.id] = overridePatch;
  } else {
    delete nextOverrides[endpoint.id];
  }

  await persistExerciseRuntime({ flowEndpointOverridesById: nextOverrides });
  renderExerciseControls();
  await syncAllChatProposeButtonsForCurrentFlows();
  await syncAllChatApplyButtonsForCurrentFlows();

  log("Flow-Endpoint-Override gespeichert: " + (endpoint.label || endpoint.id) + ".");
}

async function resetFlowEndpointOverrideFromUi() {
  const lang = getCurrentDisplayLanguage();
  const exercisePack = getSelectedFlowExercisePack({ lang });
  const endpoint = getSelectedFlowEndpoint(exercisePack, getSelectedFlowStep(exercisePack, { lang }), { lang });
  if (!isFlowEndpointOverrideEligible(endpoint)) {
    log("Flow-Endpoint-Override: Bitte zuerst einen gültigen Flow-Endpoint auswählen.");
    return;
  }

  const nextOverrides = {
    ...(state.exerciseRuntime?.flowEndpointOverridesById || {})
  };
  delete nextOverrides[endpoint.id];

  await persistExerciseRuntime({ flowEndpointOverridesById: nextOverrides });
  renderExerciseControls();
  await syncAllChatProposeButtonsForCurrentFlows();
  await syncAllChatApplyButtonsForCurrentFlows();

  log("Flow-Endpoint-Override zurückgesetzt: " + (endpoint.label || endpoint.id) + ".");
}

async function refreshFlowEndpointOverridesFromStorage() {
  state.exerciseRuntime = Board.normalizeExerciseRuntime(await Board.loadExerciseRuntime(log));
  return state.exerciseRuntime?.flowEndpointOverridesById || {};
}

function renderFlowExercisePackPicker() {
  if (!flowExercisePackEl) return;
  const lang = getCurrentDisplayLanguage();
  const selectedId = getSelectedFlowExercisePackId();
  const packs = Exercises.listExercisePacks({ lang });

  flowExercisePackEl.textContent = "";
  for (const pack of packs) {
    const option = document.createElement("option");
    option.value = pack.id;
    option.textContent = pack.label;
    option.selected = pack.id === selectedId || (!selectedId && packs[0]?.id === pack.id);
    flowExercisePackEl.appendChild(option);
  }
  flowExercisePackEl.disabled = packs.length === 0;
}

function renderFlowStepPicker() {
  if (!flowStepEl) return;
  const lang = getCurrentDisplayLanguage();
  const exercisePack = getSelectedFlowExercisePack({ lang });
  const selectedStepId = getSelectedFlowStepId(exercisePack);
  const steps = exercisePack ? Exercises.listExerciseSteps(exercisePack, { lang }) : [];

  flowStepEl.textContent = "";
  if (!steps.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("flow.noSteps", lang);
    flowStepEl.appendChild(option);
    flowStepEl.disabled = true;
    return;
  }

  for (const step of steps) {
    const option = document.createElement("option");
    option.value = step.id;
    option.textContent = step.label;
    option.selected = step.id === selectedStepId;
    flowStepEl.appendChild(option);
  }
  flowStepEl.disabled = false;
}

function listAuthorableEndpointsForStep(exercisePack, stepId, { lang = getCurrentDisplayLanguage() } = {}) {
  return ExerciseLibrary.listBoardButtonEndpointsForStep(exercisePack, stepId, { lang });
}

function renderFlowEndpointPicker() {
  if (!flowEndpointEl) return;
  const lang = getCurrentDisplayLanguage();
  const exercisePack = getSelectedFlowExercisePack({ lang });
  const step = getSelectedFlowStep(exercisePack, { lang });
  const selectedEndpointId = getSelectedFlowEndpointId(exercisePack, step);
  const endpoints = exercisePack && step ? listAuthorableEndpointsForStep(exercisePack, step.id, { lang }) : [];

  flowEndpointEl.textContent = "";
  if (!endpoints.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = t("flow.noEndpoints", lang);
    flowEndpointEl.appendChild(option);
    flowEndpointEl.disabled = true;
    return;
  }

  for (const endpoint of endpoints) {
    const option = document.createElement("option");
    option.value = endpoint.id;
    option.textContent = endpoint.label;
    option.selected = endpoint.id === selectedEndpointId;
    flowEndpointEl.appendChild(option);
  }
  flowEndpointEl.disabled = false;
}

function buildFlowControlLabelSourceKey() {
  const packId = getSelectedFlowExercisePackId() || "";
  const stepId = getSelectedFlowStepId() || "";
  const endpointId = getSelectedFlowEndpointId() || "";
  return [packId, stepId, endpointId].join("::");
}

function syncFlowControlLabelFromEndpoint({ force = false } = {}) {
  const lang = getCurrentDisplayLanguage();
  const endpoint = getSelectedFlowEndpoint(undefined, undefined, { lang });
  if (!flowControlLabelEl || !endpoint) return;

  const nextLabel = (pickFirstNonEmptyString(endpoint.label, t("flow.defaultControlLabel", lang)) || "").trim();
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

function listDirectiveCandidateEndpointsForStep(exercisePack, stepId, { lang = getCurrentDisplayLanguage() } = {}) {
  if (!exercisePack?.id || !stepId) return [];
  return ExerciseLibrary.listBoardButtonEndpointsForStep(exercisePack, stepId, { lang }).map((endpoint) => ({
    endpointId: endpoint.id,
    label: endpoint.label || null,
    summary: endpoint.summary || null
  }));
}

function buildAdjacentStepGuidance(exercisePack, activeStepId, { lang = getCurrentDisplayLanguage() } = {}) {
  const steps = exercisePack?.id ? Exercises.listExerciseSteps(exercisePack, { lang }) : [];
  const currentIndex = steps.findIndex((step) => step?.id === activeStepId);
  const simplifyStep = (step) => step ? ({ stepId: step.id, label: step.label || null, summary: step.summary || null }) : null;
  return {
    previousStep: currentIndex > 0 ? simplifyStep(steps[currentIndex - 1]) : null,
    currentStep: currentIndex >= 0 ? simplifyStep(steps[currentIndex]) : null,
    nextStep: currentIndex >= 0 && currentIndex < steps.length - 1 ? simplifyStep(steps[currentIndex + 1]) : null
  };
}

function buildFlowGuidanceForPrompt({ exercisePack, flow, lang = getCurrentDisplayLanguage() } = {}) {
  if (!exercisePack?.id || !flow?.id) return null;
  const activeStepId = pickFirstNonEmptyString(flow?.runtime?.currentStepId);
  if (!activeStepId) return null;

  const adjacent = buildAdjacentStepGuidance(exercisePack, activeStepId, { lang });
  const currentDirectives = listDirectiveCandidateEndpointsForStep(exercisePack, activeStepId, { lang }).map((directive) => {
    const materializedControls = BoardFlow.findFlowControlsByEndpointId(flow, directive.endpointId);
    const activeControl = materializedControls[0] || null;
    return {
      endpointId: directive.endpointId,
      label: directive.label,
      summary: directive.summary,
      controlState: activeControl?.state || 'disabled'
    };
  });

  const nextStepDirectives = adjacent.nextStep?.stepId
    ? listDirectiveCandidateEndpointsForStep(exercisePack, adjacent.nextStep.stepId, { lang }).map((directive) => ({
        endpointId: directive.endpointId,
        label: directive.label
      }))
    : [];

  return {
    currentStep: adjacent.currentStep
      ? {
          ...adjacent.currentStep,
          directives: currentDirectives
        }
      : null,
    previousStep: adjacent.previousStep,
    nextStep: adjacent.nextStep
      ? {
          ...adjacent.nextStep,
          directives: nextStepDirectives
        }
      : null
  };
}

function resolveFlowPromptContext({ promptRuntimeOverride = null, targetInstanceIds = [] } = {}) {
  const lang = getCurrentDisplayLanguage();
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;

  let anchorInstanceId = pickFirstNonEmptyString(runtime?.controlContext?.anchorInstanceId, runtime?.anchorInstanceId);
  if (anchorInstanceId && !state.instancesById.has(anchorInstanceId)) anchorInstanceId = null;
  if (!anchorInstanceId && Array.isArray(targetInstanceIds) && targetInstanceIds.length === 1 && state.instancesById.has(targetInstanceIds[0])) {
    anchorInstanceId = targetInstanceIds[0];
  }

  const flow = anchorInstanceId ? resolveRelevantFlowForInstance(anchorInstanceId) : resolveRelevantFlowForSelection(targetInstanceIds);
  const flowContext = resolveCurrentPackAndStepFromFlow(flow, { lang });
  const exercisePack = runtime?.exercisePack || flowContext.exercisePack || null;
  const exercisePackId = exercisePack?.id || flow?.exercisePackId || null;

  return {
    exercisePack,
    exercisePackId,
    anchorInstanceId: anchorInstanceId || flow?.anchorInstanceId || null,
    flow,
    flowGuidance: buildFlowGuidanceForPrompt({ exercisePack, flow, lang })
  };
}

function getEndpointSurfaceMeta(endpointId) {
  const endpoint = ExerciseLibrary.getEndpointById(endpointId, { lang: getCurrentDisplayLanguage() });
  return {
    sortOrder: Number.isFinite(Number(endpoint?.order)) ? Number(endpoint.order) : Number.MAX_SAFE_INTEGER,
    panelRole: endpoint?.surface?.group || null,
    boardGroup: endpoint?.surface?.group === "proposal" ? "proposal" : "core",
    seedByDefault: endpoint?.surface?.seedByDefault === true
  };
}

function getEndpointSortOrder(endpointId) {
  return getEndpointSurfaceMeta(endpointId).sortOrder;
}

function getEndpointPanelRoleRank(endpointId) {
  const panelRole = getEndpointSurfaceMeta(endpointId).panelRole;
  if (panelRole === "primary") return 0;
  if (panelRole === "proposal") return 1;
  if (panelRole === "secondary") return 2;
  return 3;
}

function getFlowControlDisplayBucket(flow, control) {
  const activeStepId = pickFirstNonEmptyString(flow?.runtime?.currentStepId);
  const boardGroup = getEndpointSurfaceMeta(control?.endpointId).boardGroup;
  const isCurrentStep = !!(control?.stepId && activeStepId && control.stepId === activeStepId);
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
      getEndpointPanelRoleRank(a?.endpointId) - getEndpointPanelRoleRank(b?.endpointId) ||
      getEndpointSortOrder(a?.endpointId) - getEndpointSortOrder(b?.endpointId) ||
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
      if (!control?.boardItemId) continue;
      const laneIndex = getFlowControlDisplayLane(flow, control);
      const offsetIndex = laneOffsets.get(laneIndex) || 0;
      laneOffsets.set(laneIndex, offsetIndex + 1);
      try {
        const position = await Board.computeSuggestedFlowControlPosition(anchorInstance, { offsetIndex, laneIndex }, log);
        await Board.moveItemByIdToBoardCoords(control.boardItemId, position.x, position.y, log);
      } catch (e) {
        log("WARNUNG: Flow-Control-Layout konnte nicht aktualisiert werden: " + e.message);
      }
    }
  }

  for (const control of orderedControls) {
    if (!control?.boardItemId) continue;
    try {
      await Board.syncFlowControlShapeAppearance(control.boardItemId, { label: control.label, state: control.state, lang }, log);
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

function getExistingBoardFlowForPack(exercisePackId, anchorInstanceId) {
  for (const flow of state.boardFlowsById.values()) {
    if (flow?.exercisePackId === exercisePackId && flow?.anchorInstanceId === anchorInstanceId) return flow;
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



function buildAuthorableFlowPack(exercisePack, { lang = getCurrentDisplayLanguage() } = {}) {
  if (!exercisePack?.id) return null;
  const steps = Exercises.listExerciseSteps(exercisePack, { lang }).map((step) => ({
    ...step,
    endpointIds: listAuthorableEndpointsForStep(exercisePack, step.id, { lang }).map((endpoint) => endpoint.id)
  }));
  return { ...exercisePack, steps };
}

async function ensureDefaultBoardControlsForStep(flow, stepId) {
  const normalizedStepId = pickFirstNonEmptyString(stepId);
  if (!flow?.id || !flow?.anchorInstanceId || !normalizedStepId || isStaticFlowControlLayoutEnabled()) {
    return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
  }
  const exercisePack = Exercises.getExercisePackById(flow.exercisePackId, { lang: getCurrentDisplayLanguage() });
  if (!exercisePack) return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
  const endpointIds = listAuthorableEndpointsForStep(exercisePack, normalizedStepId, { lang: getCurrentDisplayLanguage() })
    .filter((endpoint) => endpoint.surface?.seedByDefault === true)
    .map((endpoint) => endpoint.id);
  if (!endpointIds.length) return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
  return await ensureFlowControlsForEndpoints({ flow, anchorInstanceId: flow.anchorInstanceId, endpointIds });
}



async function findOrCreateBoardFlowForPack(exercisePackId, anchorInstanceId, { preferredStepId = null, seedDefaults = true } = {}) {
  const normalizedExercisePackId = pickFirstNonEmptyString(exercisePackId);
  const normalizedAnchorInstanceId = pickFirstNonEmptyString(anchorInstanceId);
  const lang = getCurrentDisplayLanguage();
  const exercisePack = Exercises.getExercisePackById(normalizedExercisePackId, { lang });
  if (!exercisePack) throw new Error("Exercise Pack konnte nicht gefunden werden: " + String(exercisePackId || "(leer)"));
  const selectedStepId = pickFirstNonEmptyString(preferredStepId, getSelectedFlowStepId(exercisePack));
  const shouldSeedDefaults = !!seedDefaults && !isStaticFlowControlLayoutEnabled();
  const authorablePack = buildAuthorableFlowPack(exercisePack, { lang });

  const existing = normalizedAnchorInstanceId ? getExistingBoardFlowForPack(normalizedExercisePackId, normalizedAnchorInstanceId) : null;
  if (existing) {
    let healthyExisting = await ensureBoardFlowHealthy(existing, {
      persist: true,
      pruneMissingControls: true,
      preferredStepId: selectedStepId,
      forcePreferredWhenNoControls: true
    });
    if (shouldSeedDefaults) {
      const ensured = await ensureDefaultBoardControlsForStep(healthyExisting, healthyExisting.runtime?.currentStepId || selectedStepId);
      healthyExisting = ensured.flow;
      if (ensured.createdEndpointIds.length) {
        healthyExisting = await saveBoardFlowAndCache(healthyExisting, { reflow: !isStaticFlowControlLayoutEnabled() });
      } else {
        state.boardFlowsById.set(healthyExisting.id, healthyExisting);
      }
    } else {
      state.boardFlowsById.set(healthyExisting.id, healthyExisting);
    }
    return healthyExisting;
  }

  const anchorLabel = getInstanceLabelByInternalId(normalizedAnchorInstanceId) || normalizedAnchorInstanceId || "Board";
  let flow = BoardFlow.createBoardFlowFromPack(authorablePack, normalizedAnchorInstanceId, { lang });
  flow = BoardFlow.normalizeBoardFlow({
    ...flow,
    id: buildFlowId(exercisePack.id, normalizedAnchorInstanceId),
    anchorInstanceId: normalizedAnchorInstanceId,
    runtime: { ...(flow.runtime || {}), currentStepId: selectedStepId || flow.runtime?.currentStepId || null },
    label: exercisePack.label + " – " + anchorLabel,
    labelMode: "auto"
  });

  let createdEndpointIds = [];
  if (shouldSeedDefaults) {
    const ensured = await ensureDefaultBoardControlsForStep(flow, flow.runtime?.currentStepId || selectedStepId);
    flow = ensured.flow;
    createdEndpointIds = ensured.createdEndpointIds;
  }
  return await saveBoardFlowAndCache(flow, { reflow: createdEndpointIds.length > 0 && !isStaticFlowControlLayoutEnabled() });
}

function renderFlowAuthoringStatus() {
  if (!flowAuthoringStatusEl) return;
  const lang = getCurrentDisplayLanguage();
  const exercisePack = getSelectedFlowExercisePack({ lang });
  const step = getSelectedFlowStep(exercisePack, { lang });
  const endpoint = getSelectedFlowEndpoint(exercisePack, step, { lang });
  const selectedLabels = getInstanceLabelsFromIds(state.lastCanvasSelectionInstanceIds || []);
  const scopeType = (flowScopeTypeEl?.value || endpoint?.scope?.mode || "current");
  const scopeLabel = scopeType === "pack" ? t("flow.scope.pack", lang) : t("flow.scope.current", lang);
  const lines = [
    t("flow.status.boardFlows", lang, { count: state.boardFlowsById.size }),
    t("flow.status.exercisePack", lang, { value: exercisePack?.label || t("flow.status.none", lang) }),
    t("flow.status.step", lang, { value: step?.label || t("flow.status.none", lang) }),
    t("flow.status.endpoint", lang, { value: endpoint?.label || t("flow.status.none", lang) }),
    t("flow.status.selectedCanvas", lang, { value: selectedLabels.join(", ") || t("flow.status.selectedCanvas.none", lang) }),
    t("flow.status.scope", lang, { value: scopeLabel }),
    t("flow.status.layoutMode", lang, { value: t(isStaticFlowControlLayoutEnabled() ? "flow.layoutMode.static" : "flow.layoutMode.dynamic", lang) })
  ];
  if (endpoint?.summary) lines.push(t("flow.status.endpointSummary", lang, { value: endpoint.summary }));
  flowAuthoringStatusEl.textContent = lines.join("\n");
}

function renderFlowAuthoringControls({ forceLabelSync = false } = {}) {
  renderFlowExercisePackPicker();
  renderFlowStepPicker();
  renderFlowEndpointPicker();
  renderFlowEndpointOverrideEditor();
  if (flowStaticLayoutToggleEl) flowStaticLayoutToggleEl.checked = isStaticFlowControlLayoutEnabled();
  syncFlowControlLabelFromEndpoint({ force: forceLabelSync });
  renderFlowAuthoringStatus();
}

async function pruneMissingBoardFlowControls(flow) {
  const normalizedFlow = BoardFlow.normalizeBoardFlow(flow);
  const controls = Object.entries(normalizedFlow.controls || {});
  const itemIds = controls.map(([, control]) => String(control?.boardItemId || '')).filter(Boolean);
  if (!itemIds.length) return { flow: normalizedFlow, changed: false, removedControlIds: [] };

  let items = [];
  try {
    items = await Board.getItemsById(itemIds, log);
  } catch (error) {
    log('WARNUNG: Board-Flow-Controls konnten nicht geprüft werden: ' + formatRuntimeErrorMessage(error));
    return { flow: normalizedFlow, changed: false, removedControlIds: [] };
  }

  const presentItemIds = new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id || '')).filter(Boolean));
  const removedControlIds = controls.filter(([, control]) => control?.boardItemId && !presentItemIds.has(String(control.boardItemId))).map(([controlId]) => controlId);
  if (!removedControlIds.length) return { flow: normalizedFlow, changed: false, removedControlIds: [] };
  const removedSet = new Set(removedControlIds);
  const nextControls = Object.fromEntries(controls.filter(([controlId]) => !removedSet.has(controlId)));
  const nextSteps = (normalizedFlow.steps || []).map((step) => ({ ...step, controlIds: (Array.isArray(step.controlIds) ? step.controlIds : []).filter((controlId) => !removedSet.has(controlId)) }));
  const nextFlow = BoardFlow.normalizeBoardFlow({ ...normalizedFlow, controls: nextControls, steps: nextSteps, updatedAt: new Date().toISOString() });
  return { flow: nextFlow, changed: true, removedControlIds };
}

async function ensureBoardFlowHealthy(flow, { persist = false, pruneMissingControls = true, preferredStepId = null, forcePreferredWhenNoControls = false } = {}) {
  let nextFlow = BoardFlow.normalizeBoardFlow(flow);
  if (!nextFlow?.id) return nextFlow;
  const lang = getCurrentDisplayLanguage();
  const exercisePack = nextFlow.exercisePackId ? Exercises.getExercisePackById(nextFlow.exercisePackId, { lang }) : null;
  let changed = false;
  if (exercisePack) {
    const mergedFlow = BoardFlow.mergeBoardFlowWithPack(nextFlow, buildAuthorableFlowPack(exercisePack, { lang }), { lang });
    changed = changed || JSON.stringify(mergedFlow) !== JSON.stringify(nextFlow);
    nextFlow = mergedFlow;
  }
  const effectivePreferredStepId = pickFirstNonEmptyString(preferredStepId);
  const hasControls = Object.keys(nextFlow.controls || {}).length > 0;
  const validStepIds = new Set((nextFlow.steps || []).map((step) => step.id));
  if (effectivePreferredStepId && validStepIds.has(effectivePreferredStepId)) {
    const flowStepId = pickFirstNonEmptyString(nextFlow?.runtime?.currentStepId);
    if (!flowStepId || !validStepIds.has(flowStepId) || (forcePreferredWhenNoControls && !hasControls)) {
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
    if (pruned.removedControlIds?.length) log('WARNUNG: Verwaiste Board-Flow-Controls entfernt: ' + pruned.removedControlIds.join(', '));
  }
  if (changed && persist) {
    nextFlow = await Board.saveBoardFlow({ ...nextFlow, updatedAt: new Date().toISOString() }, log);
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

function buildFlowScopeForEndpoint(endpoint, anchorInstanceId) {
  return endpoint?.scope?.mode === "pack" || endpoint?.scope?.mode === "board"
    ? { mode: endpoint.scope.mode, allowedCanvasTypeIds: endpoint.scope.allowedCanvasTypeIds || [] }
    : { mode: "current", allowedCanvasTypeIds: endpoint?.scope?.allowedCanvasTypeIds || [], instanceIds: anchorInstanceId ? [anchorInstanceId] : [] };
}

async function createBoardFlowControlForEndpoint({ flow, anchorInstanceId, endpoint, label = null, labelMode = "auto", scope = null } = {}) {
  if (!flow?.id || !anchorInstanceId || !endpoint?.id || !endpoint?.stepId) {
    throw new Error("Flow-Control kann nicht erzeugt werden: Flow, Anchor oder Endpoint fehlen.");
  }

  let workingFlow = await ensureBoardFlowHealthy(flow, {
    persist: false,
    pruneMissingControls: true,
    preferredStepId: endpoint.stepId,
    forcePreferredWhenNoControls: true
  });

  const orderedControls = sortFlowControlsForDisplay(workingFlow, Object.values(workingFlow.controls || {}));
  const initialState = (!orderedControls.length || workingFlow.runtime?.currentStepId === endpoint.stepId) ? "active" : "disabled";
  const draftControl = {
    endpointId: endpoint.id,
    stepId: endpoint.stepId,
    state: initialState,
    label: pickFirstNonEmptyString(label, endpoint.label, t("flow.defaultControlLabel", getCurrentDisplayLanguage()))
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
    lang: getCurrentDisplayLanguage()
  }, log);

  const controlId = BoardFlow.createBoardFlowControlId(endpoint.stepId, endpoint.id);
  const control = BoardFlow.createFlowControlRecord({
    id: controlId,
    boardItemId: shape.id,
    label: nextLabel,
    labelMode,
    endpointId: endpoint.id,
    stepId: endpoint.stepId,
    anchorInstanceId,
    scope: scope || buildFlowScopeForEndpoint(endpoint, anchorInstanceId),
    state: initialState
  });

  let nextFlow = BoardFlow.addMaterializedFlowControl(workingFlow, control);
  if (!orderedControls.length && nextFlow.runtime?.currentStepId !== endpoint.stepId) {
    nextFlow = BoardFlow.setFlowCurrentStep(nextFlow, endpoint.stepId);
  }
  await Board.writeFlowControlMeta(shape, { flowId: nextFlow.id, controlId }, log);
  return nextFlow;
}

async function ensureFlowControlsForEndpoints({ flow, anchorInstanceId, endpointIds = [] } = {}) {
  let nextFlow = flow;
  const createdEndpointIds = [];
  const skippedEndpointIds = [];
  for (const endpointId of Array.from(new Set((endpointIds || []).filter(Boolean)))) {
    if (BoardFlow.findFlowControlsByEndpointId(nextFlow, endpointId).length) continue;
    const endpoint = ExerciseLibrary.getEndpointById(endpointId, { lang: getCurrentDisplayLanguage() });
    if (!endpoint || endpoint.exercisePackId !== nextFlow.exercisePackId || ExerciseLibrary.isSidecarOnlyEndpoint(endpoint) || endpoint.surface?.group === 'hidden') {
      skippedEndpointIds.push(endpointId);
      continue;
    }
    try {
      nextFlow = await createBoardFlowControlForEndpoint({ flow: nextFlow, anchorInstanceId, endpoint });
      createdEndpointIds.push(endpointId);
    } catch (e) {
      skippedEndpointIds.push(endpointId);
      log("WARNUNG: Board Flow Control konnte nicht automatisch erzeugt werden: " + endpointId + " – " + e.message);
    }
  }
  return { flow: nextFlow, createdEndpointIds, skippedEndpointIds };
}

async function applyFlowControlDirectivesAfterAgentRun({ flowControlDirectives = null, promptRuntimeOverride = null, targetInstanceIds = [], sourceLabel = "Agent" } = {}) {
  const directives = ExerciseEngine.normalizeFlowControlDirectivesBlock(flowControlDirectives);
  const flowContext = resolveFlowPromptContext({ promptRuntimeOverride, targetInstanceIds });
  const result = {
    flowControlDirectives: directives ? { unlockEndpointIds: [], completeEndpointIds: [] } : null,
    activeAnchorContext: flowContext.exercisePackId && flowContext.anchorInstanceId ? { exercisePackId: flowContext.exercisePackId, anchorInstanceId: flowContext.anchorInstanceId } : null,
    createdEndpointIds: [],
    skippedEndpointIds: []
  };
  if (!directives) return result;
  if (!flowContext.exercisePackId) {
    log("WARNUNG: Flow-Control-Directives konnten nicht angewendet werden – kein Exercise Pack aktiv.");
    return result;
  }

  const allowedDirectiveEndpointIds = new Set([
    ...(Array.isArray(flowContext.flowGuidance?.currentStep?.directives) ? flowContext.flowGuidance.currentStep.directives : []),
    ...(Array.isArray(flowContext.flowGuidance?.nextStep?.directives) ? flowContext.flowGuidance.nextStep.directives : [])
  ].map((entry) => pickFirstNonEmptyString(entry?.endpointId)).filter(Boolean));

  const validUnlockEndpointIds = [];
  const validCompleteEndpointIds = [];
  for (const endpointId of directives.unlockEndpointIds || []) {
    if (!allowedDirectiveEndpointIds.has(endpointId)) {
      result.skippedEndpointIds.push(endpointId);
      continue;
    }
    validUnlockEndpointIds.push(endpointId);
  }
  for (const endpointId of directives.completeEndpointIds || []) {
    if (!allowedDirectiveEndpointIds.has(endpointId)) {
      result.skippedEndpointIds.push(endpointId);
      continue;
    }
    validCompleteEndpointIds.push(endpointId);
  }

  result.flowControlDirectives = {
    unlockEndpointIds: validUnlockEndpointIds.slice(),
    completeEndpointIds: validCompleteEndpointIds.slice()
  };

  let flow = flowContext.flow || null;
  const needsControlCreation = validUnlockEndpointIds.some((endpointId) => !flow || !BoardFlow.findFlowControlsByEndpointId(flow, endpointId).length);
  if ((!flow || needsControlCreation) && !flowContext.anchorInstanceId) {
    log("WARNUNG: Flow-Control-Directives konnten ohne eindeutigen Anchor nicht vollständig umgesetzt werden.");
    return result;
  }
  const staticLayout = isStaticFlowControlLayoutEnabled();
  if (!flow && flowContext.anchorInstanceId && !staticLayout) {
    flow = await findOrCreateBoardFlowForPack(flowContext.exercisePackId, flowContext.anchorInstanceId);
  }
  if (!flow) {
    if (staticLayout && (validUnlockEndpointIds.length || validCompleteEndpointIds.length)) {
      log("INFO: Statisches Button-Layout aktiv – ohne vorhandenen Flow werden Flow-Control-Directives nicht materialisiert.");
    }
    return result;
  }
  if (validUnlockEndpointIds.length && flowContext.anchorInstanceId && !staticLayout) {
    const ensured = await ensureFlowControlsForEndpoints({ flow, anchorInstanceId: flowContext.anchorInstanceId, endpointIds: validUnlockEndpointIds });
    flow = ensured.flow;
    result.createdEndpointIds.push(...ensured.createdEndpointIds);
    result.skippedEndpointIds.push(...ensured.skippedEndpointIds);
  } else if (validUnlockEndpointIds.length && staticLayout) {
    const missingEndpointIds = validUnlockEndpointIds.filter((endpointId) => !BoardFlow.findFlowControlsByEndpointId(flow, endpointId).length);
    if (missingEndpointIds.length) {
      result.skippedEndpointIds.push(...missingEndpointIds);
      log("INFO: Statisches Button-Layout aktiv – fehlende Buttons werden nicht erzeugt: " + missingEndpointIds.join(", ") + ".");
    }
  }
  flow = BoardFlow.applyFlowControlDirectives(flow, {
    unlockEndpointIds: validUnlockEndpointIds,
    completeEndpointIds: validCompleteEndpointIds
  });
  flow = await saveBoardFlowAndCache(flow, { reflow: result.createdEndpointIds.length > 0 && !isStaticFlowControlLayoutEnabled() });
  if (result.createdEndpointIds.length || validUnlockEndpointIds.length || validCompleteEndpointIds.length) {
    log(sourceLabel + ": Button-Zustände aktualisiert. Freigeschaltet=" + (validUnlockEndpointIds.join(", ") || "keine") + ", erledigt=" + (validCompleteEndpointIds.join(", ") || "keine") + (result.createdEndpointIds.length ? (", neu erzeugt=" + result.createdEndpointIds.join(", ")) : "") + ".");
  }
  return result;
}

async function resolveAuthoringScopeFromCurrentSelection(exercisePack, requestedScopeType) {
  const selectedInstanceIds = await refreshSelectionStatusFromBoard();
  const selected = Array.from(new Set((selectedInstanceIds || []).filter((id) => state.instancesById.has(id))));
  if (!selected.length) throw new Error("Bitte mindestens eine Canvas-Instanz auf dem Board selektieren.");
  const allowedCanvasTypeIds = new Set((exercisePack?.allowedCanvasTypeIds || []).filter(Boolean));
  const allowedSelected = selected.filter((instanceId) => {
    const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
    return !allowedCanvasTypeIds.size || (canvasTypeId && allowedCanvasTypeIds.has(canvasTypeId));
  });
  if (!allowedSelected.length) throw new Error("Die aktuelle Selektion enthält keine zum Exercise Pack passende Canvas-Instanz.");
  const scopeMode = requestedScopeType === "pack" ? "pack" : "current";
  return {
    anchorInstanceId: allowedSelected[0],
    scope: {
      mode: scopeMode,
      allowedCanvasTypeIds: Array.from(allowedCanvasTypeIds),
      instanceIds: scopeMode === 'current' ? allowedSelected : []
    }
  };
}

async function createFlowControlFromAdmin() {
  const lang = getCurrentDisplayLanguage();
  const exercisePack = getSelectedFlowExercisePack({ lang });
  const step = getSelectedFlowStep(exercisePack, { lang });
  const endpoint = getSelectedFlowEndpoint(exercisePack, step, { lang });
  if (!exercisePack || !step || !endpoint) {
    log("Board Flow: Bitte Exercise Pack, Schritt und Endpoint wählen.");
    return;
  }
  try {
    const { anchorInstanceId, scope } = await resolveAuthoringScopeFromCurrentSelection(exercisePack, flowScopeTypeEl?.value || endpoint.scope?.mode);
    let flow = await findOrCreateBoardFlowForPack(exercisePack.id, anchorInstanceId, { preferredStepId: step.id, seedDefaults: false });
    const existingMaterialized = BoardFlow.findFlowControlsByEndpointId(flow, endpoint.id);
    if (existingMaterialized.length) {
      log("Board Flow: Für diesen Endpoint existiert bereits ein materialisierter Button auf dieser Instanz. Kein Duplikat erzeugt.");
      return;
    }
    const inputLabel = ((flowControlLabelEl?.value || "").trim());
    const autoLabel = (flowControlLabelEl?.dataset.autoLabel || pickFirstNonEmptyString(endpoint.label, t("flow.defaultControlLabel", lang)) || "").trim();
    const nextLabel = inputLabel || autoLabel || t("flow.defaultControlLabel", lang);
    const labelMode = inputLabel && inputLabel !== autoLabel ? "custom" : "auto";
    flow = await createBoardFlowControlForEndpoint({ flow, anchorInstanceId, endpoint, label: nextLabel, labelMode, scope });
    flow = await saveBoardFlowAndCache(flow, { reflow: !isStaticFlowControlLayoutEnabled() });
    log("Board Flow Control erzeugt: '" + nextLabel + "'.");
    renderFlowAuthoringControls();
  } catch (e) {
    log("Board Flow: Control konnte nicht erzeugt werden – " + e.message);
  }
}

async function setCurrentFlowStepFromAdmin() {
  const lang = getCurrentDisplayLanguage();
  const exercisePack = getSelectedFlowExercisePack({ lang });
  const step = getSelectedFlowStep(exercisePack, { lang });
  if (!exercisePack || !step) {
    log("Board Flow: Bitte Exercise Pack und Schritt wählen.");
    return;
  }
  try {
    const { anchorInstanceId } = await resolveAuthoringScopeFromCurrentSelection(exercisePack, "current");
    let flow = await findOrCreateBoardFlowForPack(exercisePack.id, anchorInstanceId, { preferredStepId: step.id, seedDefaults: false });
    flow = BoardFlow.setFlowCurrentStep(flow, step.id);
    flow = await saveBoardFlowAndCache(flow, { reflow: false });
    log("Board Flow: Aktiver Schritt gesetzt auf '" + (step.label || step.id) + "' für " + (flow.label || flow.id) + ".");
    renderFlowAuthoringControls();
  } catch (e) {
    log("Board Flow: Schritt konnte nicht gesetzt werden – " + e.message);
  }
}

function getSelectedFlowControlLabel(controlSelection) {
  const control = controlSelection?.control || null;
  return pickFirstNonEmptyString(control?.label, control?.id, "Flow Control");
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

  const control = BoardFlow.findFlowControlByBoardItemId(flow, item.id) || flow.controls?.[meta.controlId] || null;
  if (!control) return null;

  return { item, meta, flow, control };
}

async function activateSelectedFlowControlFromAdmin() {
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
  const nextControl = BoardFlow.findFlowControlByBoardItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;
  log("Board Flow: Button freigeschaltet: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ".");
  renderFlowAuthoringControls();
  await refreshSelectionStatusFromItems(selection || []);
}

async function markSelectedFlowControlDoneFromAdmin() {
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
  const nextControl = BoardFlow.findFlowControlByBoardItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;
  log("Board Flow: Button als erledigt markiert: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ".");
  renderFlowAuthoringControls();
  await refreshSelectionStatusFromItems(selection || []);
}

async function resetSelectedFlowControlFromAdmin() {
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
  const nextControl = BoardFlow.findFlowControlByBoardItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;
  log("Board Flow: Button zurückgesetzt: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ".");
  renderFlowAuthoringControls();
  await refreshSelectionStatusFromItems(selection || []);
}



function resolveTargetInstanceIdsFromScope(scope, {
  exercisePack,
  anchorInstanceId = null,
  selectedInstanceIds = []
} = {}) {
  const normalizedScope = BoardFlow.normalizeFlowScope(scope);
  const mode = normalizedScope.mode || normalizedScope.type || 'selection';
  const allowedCanvasTypeIds = new Set(normalizedScope.allowedCanvasTypeIds || exercisePack?.allowedCanvasTypeIds || []);
  const filterAllowed = (instanceIds) => (Array.isArray(instanceIds) ? instanceIds : []).filter((instanceId) => {
    const instance = state.instancesById.get(instanceId) || null;
    if (!instance) return false;
    if (!allowedCanvasTypeIds.size) return true;
    return !!instance.canvasTypeId && allowedCanvasTypeIds.has(instance.canvasTypeId);
  });
  if (mode === 'current') {
    const instanceIds = normalizedScope.instanceIds?.length ? normalizedScope.instanceIds : selectedInstanceIds;
    return filterAllowed(instanceIds);
  }
  if (mode === 'pack' || mode === 'board') {
    return filterAllowed(Array.from(state.instancesById.keys()));
  }
  if (anchorInstanceId) {
    return filterAllowed([anchorInstanceId]);
  }
  return filterAllowed(getSelectedInstanceIds());
}

function buildPromptRuntimeFromEndpoint({
  exercisePack,
  currentStep,
  endpoint,
  controlContext = null,
  adminOverride = null
}) {
  return {
    mode: 'endpoint',
    exercisePack,
    currentStep,
    endpoint,
    controlContext,
    adminOverride
  };
}

async function runAgentFromFlowControl(flow, control, selectedItem) {
  const lang = getCurrentDisplayLanguage();
  await refreshFlowEndpointOverridesFromStorage();
  const healthyFlow = await ensureBoardFlowHealthy(flow, { persist: true, pruneMissingControls: true });
  state.boardFlowsById.set(healthyFlow.id, healthyFlow);

  const healthyControl = healthyFlow.controls?.[control?.id] || BoardFlow.findFlowControlByBoardItemId(healthyFlow, selectedItem?.id) || control;
  const endpoint = getEffectiveFlowEndpointById(healthyControl?.endpointId, { lang });
  const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(healthyFlow, { lang });

  if (!endpoint || !exercisePack || !currentStep) {
    const msg = "Board Flow: Control ist unvollständig konfiguriert (endpoint / step / exercisePack).";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return buildRunFailureResult("precondition", msg);
  }

  if (healthyControl.state !== "active") {
    const msg = "Board Flow: Control '" + (healthyControl.label || healthyControl.id) + "' ist derzeit nicht aktiv.";
    log(msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "warning" });
    return buildRunFailureResult("precondition", msg);
  }

  const targetInstanceIds = resolveTargetInstanceIdsFromScope(healthyControl.scope || endpoint.scope, {
    exercisePack,
    anchorInstanceId: healthyFlow.anchorInstanceId,
    selectedInstanceIds: healthyControl.scope?.instanceIds || [healthyFlow.anchorInstanceId]
  });
  const targetInstanceLabels = getInstanceLabelsFromIds(targetInstanceIds);
  const sourceLabel = healthyControl.label || endpoint.label || "Flow Control";

  const nextFlow = {
    ...healthyFlow,
    runtime: {
      ...(healthyFlow.runtime || {}),
      lastActiveEndpointId: endpoint.id || null
    }
  };
  await saveBoardFlowAndCache(nextFlow);

  return await runStructuredEndpointExecution({
    exercisePack,
    currentStep,
    endpoint,
    targetInstanceIds,
    userText: await resolveBoardUserSeedText(healthyFlow.anchorInstanceId || healthyControl.anchorInstanceId || targetInstanceIds[0] || null, getCurrentUserQuestion()),
    controlContext: {
      flowId: healthyFlow.id,
      controlId: healthyControl.id,
      controlLabel: healthyControl.label || null,
      anchorInstanceId: healthyFlow.anchorInstanceId || healthyControl.anchorInstanceId || null,
      scopeType: healthyControl.scope?.mode || healthyControl.scope?.type || null,
      targetInstanceLabels
    },
    anchorInstanceId: healthyFlow.anchorInstanceId || healthyControl.anchorInstanceId || null,
    sourceLabel
  });
}

async function syncDefaultCanvasTypeToBoardConfig(canvasTypeId) {
  const normalizedCanvasTypeId = normalizeCanvasTypeId(canvasTypeId);
  setSelectedCanvasTypeId(normalizedCanvasTypeId);
  await persistBoardConfig({ defaultCanvasTypeId: normalizedCanvasTypeId });
  renderCanvasTypePicker();
  renderExerciseControls();
}

async function loadBoardRuntimeState() {
  const fallbackCanvasTypeId = normalizeCanvasTypeId(state.selectedCanvasTypeId || TEMPLATE_ID);
  const loadedBoardConfig = await Board.loadBoardConfigFromAnchor({ defaultCanvasTypeId: fallbackCanvasTypeId, log });
  const normalizedBoardConfig = Board.normalizeBoardConfig(loadedBoardConfig, { defaultCanvasTypeId: fallbackCanvasTypeId });
  state.boardConfig = await Board.saveBoardConfigToAnchor(normalizedBoardConfig, { defaultCanvasTypeId: fallbackCanvasTypeId, log });
  setSelectedCanvasTypeId(state.boardConfig.defaultCanvasTypeId || fallbackCanvasTypeId);
  state.exerciseRuntime = Board.normalizeExerciseRuntime(await Board.loadExerciseRuntime(log));
  await loadBoardFlows();
  applyStaticUiLanguage(state.boardConfig.lang);
  renderCanvasTypePicker();
  renderExerciseControls();
  await syncAllChatProposeButtonsForCurrentFlows();
  await syncAllChatApplyButtonsForCurrentFlows();
  await syncBoardChromeLanguage(state.boardConfig.lang);
}


async function saveAdminOverrideFromUi() {
  const text = (adminOverrideTextEl?.value || "").trim() || null;
  await persistExerciseRuntime({ adminOverride: text });
  renderExerciseControls();
  log("Admin-Override gespeichert: " + (text ? ("" + text.length + " Zeichen") : "leer"));
}

async function clearAdminOverrideFromUi() {
  if (adminOverrideTextEl) adminOverrideTextEl.value = "";
  await persistExerciseRuntime({ adminOverride: null });
  renderExerciseControls();
  log("Admin-Override geleert.");
}

async function onStaticFlowLayoutToggleChange() {
  const nextValue = flowStaticLayoutToggleEl?.checked !== false;
  await persistBoardConfig({ flowControlsStaticLayout: nextValue });
  await syncAllBoardFlowVisuals({ reflow: !nextValue });
  renderExerciseControls();
  log("Board Flow Layout-Modus gesetzt: " + (nextValue ? "statisch" : "dynamisch") + ".");
}

function getPromptConfigForSelectedInstances(selectedInstanceIds) {
  const firstId = Array.isArray(selectedInstanceIds) && selectedInstanceIds.length ? selectedInstanceIds[0] : null;
  const firstInst = firstId ? state.instancesById.get(firstId) : null;
  return DT_PROMPT_CATALOG[firstInst?.canvasTypeId] || DT_PROMPT_CATALOG[TEMPLATE_ID];
}

async function applyStoredProposalMechanically({
  exercisePack,
  currentStep,
  endpoint,
  targetInstanceIds,
  userText = null,
  sourceLabel = "Vorschläge anwenden",
  anchorInstanceId = null
} = {}) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();
  await loadMemoryRuntimeState();
  await refreshFlowEndpointOverridesFromStorage();

  const normalizedTargetIds = Array.from(new Set((targetInstanceIds || []).filter((id) => state.instancesById.has(id))));
  if (normalizedTargetIds.length !== 1) {
    const msg = sourceLabel + ": direct_apply benötigt genau eine Ziel-Instanz.";
    logRuntimeNotice("precondition", msg);
    await notifyRuntime(msg, { level: "warning" });
    return buildRunFailureResult("precondition", msg);
  }

  const instanceId = normalizedTargetIds[0];
  const activeStepId = pickFirstNonEmptyString(currentStep?.id);
  const targetInstanceLabels = getInstanceLabelsFromIds(normalizedTargetIds);
  const runLock = tryAcquireAgentRunLock(sourceLabel);
  if (!runLock) {
    return buildRunFailureResult("run_locked", sourceLabel + ": Ein Endpoint-Run läuft bereits.");
  }

  let boardRunToken = null;
  let finalBoardRunStatus = "failed";
  let finalBoardRunMessage = null;

  try {
    const boardRunStart = await acquireBoardSoftLock({
      sourceLabel,
      targetInstanceIds: normalizedTargetIds
    });
    if (!boardRunStart.ok) {
      const msg = formatExistingBoardRunMessage(sourceLabel, boardRunStart.current);
      logRuntimeNotice("run_locked", msg);
      await notifyRuntime(msg, { level: "warning" });
      return buildRunFailureResult("run_locked", msg, { currentRunState: boardRunStart.current || null });
    }

    boardRunToken = boardRunStart.token;
    boardRunToken.statusItemIds = await createRunStatusItems(normalizedTargetIds, sourceLabel, boardRunToken.runId);
    await syncBoardSoftLock(boardRunToken, {
      targetInstanceIds: normalizedTargetIds,
      statusItemIds: boardRunToken.statusItemIds
    });

    const proposal = await Board.loadActiveProposal({
      anchorInstanceId: instanceId,
      stepId: activeStepId
    }, log);

    if (!proposal) {
      const msg = sourceLabel + ": Kein offener Vorschlag zum Anwenden vorhanden.";
      logRuntimeNotice("precondition", msg);
      await syncChatApplyButtonsForInstanceIds(normalizedTargetIds, { stepId: activeStepId });
      await notifyRuntime(t("chat.apply.noPending", getCurrentDisplayLanguage()), { level: "warning" });
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("precondition", msg);
    }

    const { liveCatalog } = await refreshBoardState();
    const stateById = await computeInstanceStatesById(liveCatalog);
    const currentHash = stateById[instanceId]?.signature?.stateHash || null;
    if (proposal.basedOnStateHash && proposal.basedOnStateHash !== currentHash) {
      await Board.clearActiveProposal({
        anchorInstanceId: instanceId,
        stepId: activeStepId
      }, log);
        await syncChatApplyButtonsForInstanceIds(normalizedTargetIds, { stepId: activeStepId });
      const msg = sourceLabel + ": Gespeicherter Vorschlag ist veraltet und wurde nicht angewendet.";
      logRuntimeNotice("stale_state_conflict", msg);
      await notifyRuntime(buildStaleProposalFeedback(sourceLabel, getCurrentDisplayLanguage()).summary, { level: "warning" });
      finalBoardRunStatus = "conflicted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("stale_state_conflict", msg);
    }

    const proposalActions = Array.isArray(proposal.actions) ? proposal.actions : [];
    const proposalEndpoint = proposal?.endpointId
      ? getEffectiveFlowEndpointById(proposal.endpointId, { lang: getCurrentDisplayLanguage() })
      : null;
    const sanitizedProposalActions = sanitizeProposalActionsForEndpoint(proposalActions, {
      allowedActions: proposalEndpoint?.run?.allowedActions || [],
      allowedActionAreas: proposalEndpoint?.run?.allowedActionAreas || [],
      logFn: log
    }).filter((action) => action && action.type !== "inform");
    const actionResult = sanitizedProposalActions.length
      ? await applyResolvedAgentActions(sanitizedProposalActions, {
          candidateInstanceIds: normalizedTargetIds,
          anchorInstanceId: instanceId,
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

    if (proposal.memoryEntry) {
      await persistMemoryAfterAgentRun({
        analysis: proposal.analysis,
        memoryEntry: proposal.memoryEntry
      }, {
        runMode: "endpoint",
        endpointId: endpoint?.id || proposal.endpointId || null,
        targetInstanceLabels,
        userRequest: pickFirstNonEmptyString(userText, proposal.userRequest, getCurrentUserQuestion())
      }, actionResult);
    }

    await Board.clearActiveProposal({
      anchorInstanceId: instanceId,
      stepId: activeStepId
    }, log);

    const promptRuntimeOverride = buildPromptRuntimeFromEndpoint({
      exercisePack,
      currentStep,
      endpoint,
      controlContext: null,
      adminOverride: pickFirstNonEmptyString(state.exerciseRuntime?.adminOverride) || null
    });
    const flowPromptContext = resolveFlowPromptContext({
      promptRuntimeOverride,
      targetInstanceIds: normalizedTargetIds
    });
    const activeAnchorContext = flowPromptContext.exercisePackId && flowPromptContext.anchorInstanceId
      ? { exercisePackId: flowPromptContext.exercisePackId, anchorInstanceId: flowPromptContext.anchorInstanceId }
      : (anchorInstanceId ? { exercisePackId: exercisePack?.id || null, anchorInstanceId } : null);

    const storedFlowDirectives = ExerciseEngine.normalizeFlowControlDirectivesBlock(proposal.flowDirectives);
    const flowDirectiveResult = await applyFlowControlDirectivesAfterAgentRun({
      flowControlDirectives: storedFlowDirectives,
      promptRuntimeOverride,
      targetInstanceIds: normalizedTargetIds,
      sourceLabel
    });

    await persistExerciseRuntimeAfterEndpointRun({
      endpoint,
      flowControlDirectives: flowDirectiveResult?.flowControlDirectives || storedFlowDirectives || null,
      activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
    });
    await syncChatProposeButtonsForInstanceIds(normalizedTargetIds, { stepId: activeStepId });
    await syncChatApplyButtonsForInstanceIds(normalizedTargetIds, { stepId: activeStepId });
    await notifyRuntime("Vorschlag angewendet.", { level: "info" });

    finalBoardRunStatus = "completed";
    finalBoardRunMessage = sourceLabel + ": angewendet.";
    return buildRunSuccessResult({
      sourceLabel,
      targetInstanceLabels,
      actionResult,
      proposalApplied: true,
      executionMode: "direct_apply"
    });
  } catch (e) {
    const msg = "Exception beim " + sourceLabel + "-Apply: " + formatRuntimeErrorMessage(e);
    logRuntimeNotice("fatal", msg, e?.stack || null);
    await notifyRuntime(msg, { level: "error" });
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

async function runStructuredEndpointExecution({
  exercisePack,
  currentStep,
  endpoint,
  targetInstanceIds,
  userText = null,
  controlContext = null,
  adminOverride = null,
  sourceLabel = "Endpoint",
  anchorInstanceId = null
} = {}) {
  await Board.ensureMiroReady(log);
  await ensureInstancesScanned();
  await loadMemoryRuntimeState();

  const normalizedTargetIds = Array.from(new Set((targetInstanceIds || []).filter((id) => state.instancesById.has(id))));
  const targetInstanceLabels = getInstanceLabelsFromIds(normalizedTargetIds);
  const endpointContext = ExerciseEngine.resolveEndpointContext({
    exercisePack,
    currentStep,
    endpoint,
    targetInstanceIds: normalizedTargetIds,
    targetInstanceLabels,
    boardConfig: state.boardConfig
  });
  const promptRuntimeOverride = buildPromptRuntimeFromEndpoint({
    exercisePack,
    currentStep,
    endpoint,
    controlContext,
    adminOverride: pickFirstNonEmptyString(adminOverride, state.exerciseRuntime?.adminOverride) || null
  });
  const resolvedSourceLabel = pickFirstNonEmptyString(sourceLabel, controlContext?.controlLabel, endpoint?.label, "Endpoint");
  const activeStepId = pickFirstNonEmptyString(currentStep?.id);
  const flowPromptContext = resolveFlowPromptContext({
    promptRuntimeOverride,
    targetInstanceIds: normalizedTargetIds
  });
  const activeAnchorContext = flowPromptContext.exercisePackId && flowPromptContext.anchorInstanceId
    ? { exercisePackId: flowPromptContext.exercisePackId, anchorInstanceId: flowPromptContext.anchorInstanceId }
    : null;
  const pureApplyEndpoint = endpoint?.surface?.channel === "chat_apply";

  if (pureApplyEndpoint) {
    return await applyStoredProposalMechanically({
      exercisePack,
      currentStep,
      endpoint,
      targetInstanceIds: normalizedTargetIds,
      userText: pickFirstNonEmptyString(userText, getCurrentUserQuestion()),
      sourceLabel: resolvedSourceLabel,
      anchorInstanceId: activeAnchorContext?.anchorInstanceId || anchorInstanceId || null
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    const msg = "Bitte OpenAI API Key eingeben (Endpoint).";
    logRuntimeNotice("precondition", msg);
    if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
    return buildRunFailureResult("precondition", msg);
  }

  const model = getModel();
  const runLock = tryAcquireAgentRunLock(resolvedSourceLabel);
  if (!runLock) {
    return buildRunFailureResult("run_locked", resolvedSourceLabel + ": Ein Endpoint-Run läuft bereits.");
  }

  let boardRunToken = null;
  let finalBoardRunStatus = "failed";
  let finalBoardRunMessage = null;

  try {
    const boardRunStart = await acquireBoardSoftLock({
      sourceLabel: resolvedSourceLabel,
      targetInstanceIds: normalizedTargetIds
    });
    if (!boardRunStart.ok) {
      const msg = formatExistingBoardRunMessage(resolvedSourceLabel, boardRunStart.current);
      logRuntimeNotice("run_locked", msg);
      await notifyRuntime(msg, { level: "warning" });
      return buildRunFailureResult("run_locked", msg, { currentRunState: boardRunStart.current || null });
    }

    boardRunToken = boardRunStart.token;

    const { liveCatalog } = await refreshBoardState();
    const stateById = await computeInstanceStatesById(liveCatalog);
    const activeCanvasStates = Object.create(null);

    for (const id of normalizedTargetIds) {
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
    }

    const resolvedActiveLabels = Object.keys(activeCanvasStates);
    if (!resolvedActiveLabels.length) {
      const msg = resolvedSourceLabel + ": Konnte für die Ziel-Canvas keine Zustandsdaten aufbauen.";
      logRuntimeNotice("precondition", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("precondition", msg);
    }

    const resolvedActiveIds = resolvedActiveLabels
      .map((label) => getInternalInstanceIdByLabel(label))
      .filter((id) => state.instancesById.has(id));

    boardRunToken.targetInstanceIds = resolvedActiveIds.slice();
    boardRunToken.statusItemIds = await createRunStatusItems(resolvedActiveIds, resolvedSourceLabel, boardRunToken.runId);
    await syncBoardSoftLock(boardRunToken, {
      targetInstanceIds: resolvedActiveIds,
      statusItemIds: boardRunToken.statusItemIds
    });
    await notifyRuntime("AI arbeitet: " + resolvedSourceLabel, { level: "info" });

    const singleLabel = resolvedActiveLabels.length === 1 ? resolvedActiveLabels[0] : null;
    const singleInstanceId = resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null;
    const conversationContext = singleInstanceId ? buildConversationContextForPrompt(singleInstanceId) : null;
    const boardCatalog = buildBoardCatalogForSelectedInstances(resolvedActiveIds);
    const memoryState = simplifyMemoryStateForPrompt(state.memoryState);
    const memoryTimeline = buildMemoryTimelineForPrompt(state.memoryLog);
    const expectedSignatureSnapshot = buildSignatureSnapshot(stateById, resolvedActiveIds);
    const pendingProposalContext = singleInstanceId
      ? await buildPendingProposalContextForPrompt(singleInstanceId, { stepId: activeStepId })
      : null;
    const resolvedAllowedActionAreas = resolveAllowedActionAreasForRun({
      endpointContext,
      activeCanvasStates
    });
    const promptCfg = getPromptConfigForSelectedInstances(resolvedActiveIds);
    const promptText = PromptComposer.composePrompt(promptRuntimeOverride, {
      lang: getCurrentDisplayLanguage(),
      systemPrompt: promptCfg?.system || DT_GLOBAL_SYSTEM_PROMPT,
      templateCatalog: DT_TEMPLATE_CATALOG,
      involvedCanvasTypeIds: getInvolvedCanvasTypeIdsFromInstanceIds(resolvedActiveIds),
      endpointContext: { ...endpointContext, allowedActionAreas: resolvedAllowedActionAreas }
    });
    const userQuestion = pickFirstNonEmptyString(userText, getCurrentUserQuestion());
    if (singleInstanceId && userQuestion) {
      recordConversationTurn(singleInstanceId, {
        role: "user",
        channel: endpoint.surface?.channel || controlContext?.sourceChannel || "endpoint",
        textSummary: userQuestion,
        stepLabel: currentStep?.label,
        endpointLabel: endpoint?.label
      });
    }
    const userPayload = {
      userQuestion,
      activeInstanceLabel: singleLabel,
      selectedInstanceLabels: resolvedActiveLabels,
      boardCatalog,
      activeCanvasStates,
      memoryState,
      memoryTimeline,
      pendingProposalContext,
      conversationContext,
      flowGuidance: flowPromptContext.flowGuidance,
      allowedActionAreas: resolvedAllowedActionAreas
    };

    log("Starte " + resolvedSourceLabel + " via Endpoint '" + endpoint.id + "' für: " + (resolvedActiveLabels.join(", ") || "(keine)") + " ...");
    const structuredResult = await OpenAI.callOpenAIEndpointStructured({
      apiKey,
      model,
      systemPrompt: promptText,
      userText: JSON.stringify(userPayload, null, 2)
    });

    if (structuredResult.refusal) {
      const msg = resolvedSourceLabel + ": Modell verweigert die Antwort: " + structuredResult.refusal;
      logRuntimeNotice("model_refusal", msg);
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("model_refusal", msg, { refusal: structuredResult.refusal });
    }

    const agentObj = structuredResult.parsed;
    if (!agentObj) {
      const msg = resolvedSourceLabel + ": Antwort ist kein valides strukturiertes JSON.";
      logRuntimeNotice("invalid_json", msg, structuredResult.outputText || "(keine output_text-Antwort)");
      finalBoardRunStatus = "aborted";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("invalid_json", msg, { rawOutputText: structuredResult.outputText || null });
    }

    const executionMode = resolveEndpointExecutionMode(agentObj, endpointContext);
    const { feedback, flowControlDirectives, evaluation } = normalizeEndpointExecutionArtifacts(agentObj, endpoint, resolvedSourceLabel);
    log(resolvedSourceLabel + ": executionMode=" + executionMode + ".");

    if (executionMode === "none") {
      await persistMemoryAfterAgentRun(agentObj, {
        runMode: "endpoint",
          targetInstanceLabels: resolvedActiveLabels,
        userRequest: pickFirstNonEmptyString(userText, getCurrentUserQuestion())
      }, {
        appliedCount: 0,
        skippedCount: 0,
        infoCount: 0,
        targetedInstanceCount: 0,
        ...createEmptyActionExecutionStats()
      });

      const flowDirectiveResult = await applyFlowControlDirectivesAfterAgentRun({
        flowControlDirectives,
        promptRuntimeOverride,
        targetInstanceIds: resolvedActiveIds,
        sourceLabel: resolvedSourceLabel
      });
      const appliedFlowControlDirectives = flowDirectiveResult?.flowControlDirectives || flowControlDirectives;
      await renderAgentResponseToInstanceOutput({
        instanceId: resolveResponseTargetInstanceId({
          promptRuntimeOverride,
          targetInstanceIds: resolvedActiveIds,
          anchorInstanceId: resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null
        }),
        feedback,
        flowControlDirectives: appliedFlowControlDirectives,
        evaluation,
        sourceLabel: resolvedSourceLabel,
        conversationMeta: {
          stepLabel: currentStep?.label || null,
          endpointLabel: endpoint?.label || null,
          channel: endpoint?.surface?.channel || null,
          executionMode
        }
      });
      await persistExerciseRuntimeAfterEndpointRun({
        endpoint,
        flowControlDirectives: appliedFlowControlDirectives,
        activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
      });
      await syncChatProposeButtonsForInstanceIds(resolvedActiveIds, { stepId: activeStepId });
      await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: activeStepId });
      finalBoardRunStatus = "completed";
      finalBoardRunMessage = resolvedSourceLabel + ": abgeschlossen.";
      return buildRunSuccessResult({
        sourceLabel: resolvedSourceLabel,
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
        const msg = resolvedSourceLabel + ": executionMode=proposal_only benötigt genau eine Ziel-Instanz.";
        logRuntimeNotice("precondition", msg);
        finalBoardRunStatus = "aborted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("precondition", msg);
      }

      const executableActions = sanitizeProposalActionsForEndpoint(agentObj.actions, {
        allowedActions: endpointContext?.allowedActions || [],
        allowedActionAreas: resolvedAllowedActionAreas,
        logFn: log
      }).filter((action) => action && action.type !== "inform");

      let proposalRecord = null;
      if (executableActions.length) {
        proposalRecord = buildStoredProposalRecord({
          instanceId: singleInstanceId,
          stepId: activeStepId,
          stepLabel: currentStep?.label || null,
          exercisePackId: promptRuntimeOverride?.exercisePack?.id || null,
          endpointId: promptRuntimeOverride?.endpoint?.id || null,
          promptRuntimeOverride,
          userRequest: pickFirstNonEmptyString(userText, getCurrentUserQuestion()),
          basedOnStateHash: stateById[singleInstanceId]?.signature?.stateHash || null,
          agentObj: {
            ...agentObj,
            actions: executableActions,
            executionMode
          },
          feedback,
          flowDirectives: flowControlDirectives,
          evaluation
        });
        await Board.saveActiveProposal(proposalRecord, log);
      } else {
        await Board.clearActiveProposal({
          anchorInstanceId: singleInstanceId,
          stepId: activeStepId
        }, log);
      }

      const flowDirectiveResult = await applyFlowControlDirectivesAfterAgentRun({
        flowControlDirectives,
        promptRuntimeOverride,
        targetInstanceIds: resolvedActiveIds,
        sourceLabel: resolvedSourceLabel
      });
      await renderAgentResponseToInstanceOutput({
        instanceId: singleInstanceId,
        feedback,
        flowControlDirectives: flowDirectiveResult?.flowControlDirectives || null,
        evaluation,
        sourceLabel: resolvedSourceLabel,
        conversationMeta: {
          stepLabel: currentStep?.label || null,
          endpointLabel: endpoint?.label || null,
          channel: endpoint?.surface?.channel || null,
          executionMode,
        }
      });
      await persistExerciseRuntimeAfterEndpointRun({
        endpoint,
        flowControlDirectives: flowDirectiveResult?.flowControlDirectives || null,
        activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
      });
      await syncChatProposeButtonsForInstanceIds(resolvedActiveIds, { stepId: activeStepId });
      await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: activeStepId });
      finalBoardRunStatus = "completed";
      finalBoardRunMessage = proposalRecord
        ? (resolvedSourceLabel + ": Vorschlag gespeichert.")
        : (resolvedSourceLabel + ": Kein ausführbarer Vorschlag gespeichert.");
      return buildRunSuccessResult({
        sourceLabel: resolvedSourceLabel,
        targetInstanceLabels: resolvedActiveLabels,
        proposalId: proposalRecord?.proposalId || null,
        proposalStored: !!proposalRecord,
        actionResult: {
          proposedCount: executableActions.length,
          queuedCount: executableActions.length,
          appliedCount: 0,
          skippedCount: 0,
          infoCount: 0,
          targetedInstanceCount: executableActions.length ? 1 : 0,
          ...createEmptyActionExecutionStats()
        },
        executionMode
      });
    }

    const executableDirectActions = sanitizeProposalActionsForEndpoint(agentObj.actions, {
      allowedActions: endpointContext?.allowedActions || [],
      allowedActionAreas: resolvedAllowedActionAreas,
      logFn: log
    }).filter((action) => action && action.type !== "inform");

    if (hasMutatingActions(executableDirectActions)) {
      const conflictCheck = await performPreApplyConflictCheck(expectedSignatureSnapshot, resolvedSourceLabel);
      if (!conflictCheck.ok) {
        logRuntimeNotice("stale_state_conflict", conflictCheck.message, conflictCheck.conflicts);
        finalBoardRunStatus = "conflicted";
        finalBoardRunMessage = conflictCheck.message;
        return buildRunFailureResult("stale_state_conflict", conflictCheck.message, { conflicts: conflictCheck.conflicts });
      }
    }

    const actionResult = executableDirectActions.length
      ? await applyResolvedAgentActions(executableDirectActions, {
          candidateInstanceIds: resolvedActiveIds,
          anchorInstanceId: resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null,
          sourceLabel: resolvedSourceLabel
        })
      : {
          appliedCount: 0,
          skippedCount: 0,
          infoCount: 0,
          targetedInstanceCount: 0,
          ...createEmptyActionExecutionStats()
        };

    await refreshBoardState();

    if (activeStepId) {
      for (const instanceId of resolvedActiveIds) {
        await clearPendingProposalForInstanceStep(instanceId, activeStepId);
          }
    }

    await persistMemoryAfterAgentRun(agentObj, {
      runMode: "endpoint",
      targetInstanceLabels: resolvedActiveLabels,
      userRequest: pickFirstNonEmptyString(userText, getCurrentUserQuestion())
    }, actionResult);

    const flowDirectiveResult = await applyFlowControlDirectivesAfterAgentRun({
      flowControlDirectives,
      promptRuntimeOverride,
      targetInstanceIds: resolvedActiveIds,
      sourceLabel: resolvedSourceLabel
    });
    const appliedFlowControlDirectives = flowDirectiveResult?.flowControlDirectives || flowControlDirectives;
    await renderAgentResponseToInstanceOutput({
      instanceId: resolveResponseTargetInstanceId({
        promptRuntimeOverride,
        targetInstanceIds: resolvedActiveIds,
        anchorInstanceId: resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null
      }),
      feedback,
      flowControlDirectives: appliedFlowControlDirectives,
      evaluation,
      sourceLabel: resolvedSourceLabel,
      conversationMeta: {
        stepId: activeStepId,
          channel: endpoint?.surface?.channel || null,
        executionMode
      }
    });
    await persistExerciseRuntimeAfterEndpointRun({
      endpoint,
      flowControlDirectives: appliedFlowControlDirectives,
      activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
    });
    await syncChatProposeButtonsForInstanceIds(resolvedActiveIds, { stepId: activeStepId });
    await syncChatApplyButtonsForInstanceIds(resolvedActiveIds, { stepId: activeStepId });

    finalBoardRunStatus = "completed";
    finalBoardRunMessage = resolvedSourceLabel + ": abgeschlossen.";
    return buildRunSuccessResult({
      sourceLabel: resolvedSourceLabel,
      targetInstanceLabels: resolvedActiveLabels,
      actionResult,
      executionMode
    });
  } catch (e) {
    const msg = "Exception beim " + resolvedSourceLabel + "-Run: " + formatRuntimeErrorMessage(e);
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

async function runEndpoint(endpoint, options = {}) {
  if (!endpoint?.id) {
    const msg = "Endpoint konnte nicht gestartet werden – Endpoint fehlt.";
    log(msg);
    return buildRunFailureResult("precondition", msg);
  }

  const lang = getCurrentDisplayLanguage();
  const effectiveEndpoint = isFlowEndpointOverrideEligible(endpoint)
    ? getEffectiveFlowEndpointById(endpoint.id, { lang })
    : endpoint;
  const exercisePack = Exercises.getExercisePackById(effectiveEndpoint.exercisePackId, { lang });
  const currentStep = Exercises.getExerciseStep(exercisePack, effectiveEndpoint.stepId, { lang });
  if (!exercisePack || !currentStep) {
    const msg = "Endpoint konnte nicht gestartet werden – Pack oder Schritt fehlen.";
    log(msg);
    return buildRunFailureResult("precondition", msg);
  }

  const targetInstanceIds = resolveTargetInstanceIdsFromScope(effectiveEndpoint.scope, {
    exercisePack,
    anchorInstanceId: options.anchorInstanceId || null,
    selectedInstanceIds: options.selectedInstanceIds || getSelectedInstanceIds()
  });

  return await runStructuredEndpointExecution({
    exercisePack,
    currentStep,
    endpoint: effectiveEndpoint,
    targetInstanceIds,
    userText: pickFirstNonEmptyString(options.userText) || await resolveBoardUserSeedText(options.anchorInstanceId || targetInstanceIds[0] || null, getCurrentUserQuestion()),
    controlContext: options.controlContext || null,
    adminOverride: options.adminOverride || null,
    sourceLabel: pickFirstNonEmptyString(options.sourceLabel, options.controlContext?.controlLabel, effectiveEndpoint.label, "Endpoint"),
    anchorInstanceId: options.anchorInstanceId || null
  });
}

async function runEndpointById(endpointId, options = {}) {
  await refreshFlowEndpointOverridesFromStorage();
  const lang = getCurrentDisplayLanguage();
  const endpoint = getEffectiveFlowEndpointById(endpointId, { lang });
  if (!endpoint?.id) {
    log("Endpoint nicht gefunden: " + String(endpointId || "(leer)"));
    return buildRunFailureResult("precondition", "Endpoint nicht gefunden.");
  }
  return await runEndpoint(endpoint, options);
}

async function clearMemoryFromAdmin() {
  const clearedState = await Board.clearMemoryState(log);
  const clearedLogEntries = await Board.clearMemoryLog(log);

  state.memoryState = Memory.createEmptyMemoryState();
  state.memoryLog = [];
  renderExerciseControls();

  log(
    "Memory gelöscht: State=" +
    (clearedState ? "ja" : "nein") +
    ", Log-Einträge=" +
    String(clearedLogEntries || 0) +
    "."
  );
}

function renderCanvasTypePicker() {
  if (!canvasTypePickerEl) return;

  const lang = getCurrentDisplayLanguage();
  const entries = getCanvasTypeCatalogEntries();
  const selectedCanvasTypeId = getSelectedCanvasTypeId();

  canvasTypePickerEl.textContent = "";

  if (entries.length === 0) {
    canvasTypePickerEl.textContent = t("canvas.noneConfigured", lang);
    return;
  }

  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "canvas-option-button" + (entry.canvasTypeId === selectedCanvasTypeId ? " is-selected" : "");
    button.disabled = false;
    button.setAttribute("aria-pressed", entry.canvasTypeId === selectedCanvasTypeId ? "true" : "false");
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
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
    meta.textContent = entry.canvasTypeId;

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

  boardLanguageEl?.addEventListener("change", async () => {
    await applyBoardLanguage(boardLanguageEl?.value || "de", { syncBoardChrome: true });
  });
  flowExercisePackEl?.addEventListener("change", () => renderFlowAuthoringControls({ forceLabelSync: true }));
  flowStepEl?.addEventListener("change", () => renderFlowAuthoringControls({ forceLabelSync: true }));
  flowEndpointEl?.addEventListener("change", () => {
    syncFlowControlLabelFromEndpoint({ force: true });
    renderFlowEndpointOverrideEditor();
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

  btnFlowEndpointOverrideSaveEl?.addEventListener("click", saveFlowEndpointOverrideFromUi);
  btnFlowEndpointOverrideResetEl?.addEventListener("click", resetFlowEndpointOverrideFromUi);

  btnFlowCreateControlEl?.addEventListener("click", createFlowControlFromAdmin);
  btnFlowSetCurrentStepEl?.addEventListener("click", setCurrentFlowStepFromAdmin);
  btnFlowActivateSelectedControlEl?.addEventListener("click", activateSelectedFlowControlFromAdmin);
  btnFlowCompleteSelectedControlEl?.addEventListener("click", markSelectedFlowControlDoneFromAdmin);
  btnFlowResetSelectedControlEl?.addEventListener("click", resetSelectedFlowControlFromAdmin);

  document.getElementById("btn-insert-template")?.addEventListener("click", insertTemplateImage);
  btnMemoryClearAdminEl?.addEventListener("click", clearMemoryFromAdmin);

  window.dtInsertTemplateImage = insertTemplateImage;
  window.dtClassifyStickies = (opts) => classifyStickies(opts || {});
  window.dtClusterSelection = clusterSelectionFromPanel;
  window.dtRunEndpointById = runEndpointById;
  window.dtCreateFlowControl = createFlowControlFromAdmin;
  window.dtSetFlowStep = setCurrentFlowStepFromAdmin;
  window.dtActivateSelectedFlowControl = activateSelectedFlowControlFromAdmin;
  window.dtMarkSelectedFlowControlDone = markSelectedFlowControlDoneFromAdmin;
  window.dtResetSelectedFlowControl = resetSelectedFlowControlFromAdmin;
  window.dtClearMemory = clearMemoryFromAdmin;

  renderPanelStatus();
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

  const meta = await Board.loadPersistedBaselineMeta(log);
  state.hasGlobalBaseline = !!meta.hasGlobalBaseline;
  state.globalBaselineAt = meta.baselineAt || null;

  await ensureInstancesScanned(true);
  await loadMemoryRuntimeState();
  await loadBoardRuntimeState();
  await syncAllChatInterfacesLayout();
  renderFlowAuthoringControls({ forceLabelSync: true });
  await registerHeadlessClusterCustomAction();

  await Board.registerSelectionUpdateHandler(onSelectionUpdate, log);
  await refreshSelectionStatusFromBoard();

  log(
    "Init abgeschlossen. Global baseline: " +
    (state.hasGlobalBaseline ? ("JA (" + (state.globalBaselineAt || "unknown") + ")") : "NEIN") +
    ", Memory-Log: " + state.memoryLog.length + " Einträge." +
    " Board Flows: " + state.boardFlowsById.size + "."
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

function simplifyMemoryStateForPrompt(memoryState) {
  const normalized = Memory.normalizeMemoryState(memoryState || Memory.createEmptyMemoryState());
  return {
    activeDecisions: Array.isArray(normalized.activeDecisions) ? cloneJsonValue(normalized.activeDecisions) : [],
    openIssues: Array.isArray(normalized.openIssues) ? cloneJsonValue(normalized.openIssues) : [],
    nextFocus: pickFirstNonEmptyString(normalized.nextFocus) || null,
    stepStatus: pickFirstNonEmptyString(normalized.stepStatus) || null,
    lastSummary: pickFirstNonEmptyString(normalized.lastSummary) || null
  };
}

function summarizeMemoryLogEntryForPrompt(entry, detailLevel = "summary") {
  const normalized = Memory.normalizeStoredMemoryLogEntry(entry);
  if (detailLevel === "detailed") {
    return {
      summary: pickFirstNonEmptyString(normalized.summary) || null,
      workSteps: Array.isArray(normalized.workSteps) ? cloneJsonValue(normalized.workSteps) : [],
      nextFocus: pickFirstNonEmptyString(normalized.nextFocus) || null,
      stepStatus: pickFirstNonEmptyString(normalized.stepStatus) || null,
      userRequest: pickFirstNonEmptyString(normalized.userRequest) || null,
      openIssuesAdded: Array.isArray(normalized.openIssuesAdded) ? cloneJsonValue(normalized.openIssuesAdded) : [],
      openIssuesResolved: Array.isArray(normalized.openIssuesResolved) ? cloneJsonValue(normalized.openIssuesResolved) : [],
      ts: pickFirstNonEmptyString(normalized.ts) || null
    };
  }
  return {
    summary: pickFirstNonEmptyString(normalized.summary) || null,
    stepStatus: pickFirstNonEmptyString(normalized.stepStatus) || null,
    ts: pickFirstNonEmptyString(normalized.ts) || null
  };
}

function buildMemoryTimelineForPrompt(memoryLog) {
  const entries = Array.isArray(memoryLog) ? memoryLog : [];
  const recentDetailed = entries.slice(-3).map((entry) => summarizeMemoryLogEntryForPrompt(entry, "detailed"));
  const olderSummaries = entries.slice(-7, -3).map((entry) => summarizeMemoryLogEntryForPrompt(entry, "summary"));
  return {
    recentDetailed,
    olderSummaries
  };
}

function buildProposalId() {
  return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
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

function buildProposalActionPreview(actions, canvasTypeId = null) {
  return summarizeProposalActionsForPrompt(actions, canvasTypeId).slice(0, 5);
}

function buildPendingProposalContextForPrompt(instanceId, { stepId = null } = {}) {
  const normalizedInstanceId = pickFirstNonEmptyString(instanceId);
  if (!normalizedInstanceId || !state.instancesById.has(normalizedInstanceId)) return null;
  const instance = state.instancesById.get(normalizedInstanceId) || null;
  return Board.loadActiveProposal({
    anchorInstanceId: normalizedInstanceId,
    stepId: pickFirstNonEmptyString(stepId)
  }, log).then((proposal) => {
    if (!proposal || typeof proposal !== "object") return null;
    const flow = resolveRelevantFlowForInstance(normalizedInstanceId);
    const { exercisePack } = resolveCurrentPackAndStepFromFlow(flow, { lang: getCurrentDisplayLanguage() });
    const proposalStep = exercisePack && proposal.stepId
      ? Exercises.getExerciseStep(exercisePack, proposal.stepId, { lang: getCurrentDisplayLanguage() })
      : null;
    return {
      proposalId: pickFirstNonEmptyString(proposal.proposalId) || null,
      createdAt: pickFirstNonEmptyString(proposal.createdAt) || null,
      stepLabel: pickFirstNonEmptyString(proposal.stepLabel, proposalStep?.label) || null,
      summary: pickFirstNonEmptyString(proposal.feedback?.summary, proposal.memoryEntry?.summary, proposal.analysis) || null,
      actionPreview: buildProposalActionPreview(proposal.actions, proposal.canvasTypeId || instance?.canvasTypeId || null)
    };
  });
}

const MAX_CONVERSATION_TURNS = 4;

function summarizeFeedbackForConversation(feedback = null) {
  if (!feedback || typeof feedback !== "object") return null;
  const title = pickFirstNonEmptyString(feedback.title) || null;
  const summary = pickFirstNonEmptyString(feedback.summary) || null;
  const bullets = [];
  for (const section of Array.isArray(feedback.sections) ? feedback.sections : []) {
    for (const bullet of Array.isArray(section?.bullets) ? section.bullets : []) {
      const normalized = pickFirstNonEmptyString(stripHtml(String(bullet || "")));
      if (!normalized || bullets.includes(normalized)) continue;
      bullets.push(normalized);
      if (bullets.length >= 5) break;
    }
    if (bullets.length >= 5) break;
  }
  if (!title && !summary && !bullets.length) return null;
  return { title, summary, bullets };
}

function getConversationRecord(instanceId) {
  const normalizedInstanceId = pickFirstNonEmptyString(instanceId);
  if (!normalizedInstanceId) return null;
  const existing = state.conversationStateByInstanceId.get(normalizedInstanceId);
  if (existing && typeof existing === "object") return existing;
  const created = {
    lastStepLabel: null,
    lastEndpointLabel: null,
    lastChannel: null,
    lastExecutionMode: null,
    lastFeedback: null,
    recentTurns: []
  };
  state.conversationStateByInstanceId.set(normalizedInstanceId, created);
  return created;
}

function recordConversationTurn(instanceId, turn = null) {
  const record = getConversationRecord(instanceId);
  if (!record || !turn || typeof turn !== "object") return;
  const role = pickFirstNonEmptyString(turn.role);
  const textSummary = pickFirstNonEmptyString(turn.textSummary, turn.text);
  if (!role || !textSummary) return;
  const nextTurn = {
    role,
    channel: pickFirstNonEmptyString(turn.channel) || null,
    textSummary,
    ts: new Date().toISOString(),
    stepLabel: pickFirstNonEmptyString(turn.stepLabel) || null,
    endpointLabel: pickFirstNonEmptyString(turn.endpointLabel) || null,
    executionMode: pickFirstNonEmptyString(turn.executionMode) || null
  };
  record.recentTurns = [...(Array.isArray(record.recentTurns) ? record.recentTurns : []), nextTurn].slice(-MAX_CONVERSATION_TURNS);
}

function buildConversationContextForPrompt(instanceId) {
  const record = getConversationRecord(instanceId);
  if (!record) return null;
  const recentTurns = Array.isArray(record.recentTurns) ? cloneJsonValue(record.recentTurns) : [];
  const hasContent = record.lastEndpointLabel || record.lastFeedback || recentTurns.length;
  if (!hasContent) return null;
  return {
    lastEndpoint: record.lastEndpointLabel ? {
      stepLabel: record.lastStepLabel || null,
      endpointLabel: record.lastEndpointLabel || null,
      channel: record.lastChannel || null,
      executionMode: record.lastExecutionMode || null
    } : null,
    lastFeedback: cloneJsonValue(record.lastFeedback || null),
    recentTurns
  };
}

function updateConversationStateAfterAssistantResponse(instanceId, { feedback = null, stepLabel = null, endpointLabel = null, channel = null, executionMode = null } = {}) {
  const record = getConversationRecord(instanceId);
  if (!record) return;
  record.lastStepLabel = pickFirstNonEmptyString(stepLabel) || record.lastStepLabel || null;
  record.lastEndpointLabel = pickFirstNonEmptyString(endpointLabel) || record.lastEndpointLabel || null;
  record.lastChannel = pickFirstNonEmptyString(channel) || record.lastChannel || null;
  record.lastExecutionMode = pickFirstNonEmptyString(executionMode) || record.lastExecutionMode || null;
  record.lastFeedback = summarizeFeedbackForConversation(feedback);
  const assistantSummary = pickFirstNonEmptyString(record.lastFeedback?.summary, record.lastFeedback?.title, Array.isArray(record.lastFeedback?.bullets) ? record.lastFeedback.bullets.join(" • ") : null);
  if (assistantSummary) {
    recordConversationTurn(instanceId, {
      role: "assistant",
      channel: record.lastChannel,
      textSummary: assistantSummary,
      stepLabel: record.lastStepLabel,
      endpointLabel: record.lastEndpointLabel,
      executionMode: record.lastExecutionMode
    });
  }
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

  const flow = resolveRelevantFlowForInstance(instanceId);
  const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow, { lang: getCurrentDisplayLanguage() });
  const normalizedStepId = pickFirstNonEmptyString(stepId, currentStep?.id, flow?.runtime?.currentStepId);
  const chatApplyEndpoint = exercisePack && currentStep?.id
    ? ExerciseLibrary.findFirstEndpointByChannel(exercisePack, currentStep.id, "chat_apply", { lang: getCurrentDisplayLanguage() })
    : null;
  const enabled = !!(chatApplyEndpoint && normalizedStepId && await hasPendingProposalForInstanceStep(instanceId, normalizedStepId));
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

async function syncChatProposeButtonForInstance(instanceId, { stepId = null } = {}) {
  const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
  if (!instance || !Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface) || !Board.hasProposeChatInterfaceShapeId(instance.chatInterface)) {
    return false;
  }

  const flow = resolveRelevantFlowForInstance(instanceId);
  const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow, { lang: getCurrentDisplayLanguage() });
  const normalizedStepId = pickFirstNonEmptyString(stepId, currentStep?.id, flow?.runtime?.currentStepId);
  const proposalEndpoint = exercisePack && normalizedStepId
    ? findProposalEndpointForStep(exercisePack, normalizedStepId, { lang: getCurrentDisplayLanguage() })
    : null;
  const enabled = !!proposalEndpoint;
  try {
    await Board.syncChatProposeButtonState(instance.chatInterface, {
      enabled,
      lang: getCurrentDisplayLanguage()
    }, log);
  } catch (error) {
    log("WARNUNG: Propose-Button konnte nicht synchronisiert werden: " + formatRuntimeErrorMessage(error));
  }
  return enabled;
}

async function syncChatProposeButtonsForInstanceIds(instanceIds, { stepId = null } = {}) {
  for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
    await syncChatProposeButtonForInstance(instanceId, { stepId });
  }
}

async function syncAllChatProposeButtonsForCurrentFlows() {
  for (const instanceId of Array.from(state.instancesById.keys())) {
    await syncChatProposeButtonForInstance(instanceId);
  }
}

async function syncChatApplyButtonsForInstanceIds(instanceIds, { stepId = null } = {}) {
  for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
    await syncChatApplyButtonForInstance(instanceId, { stepId });
  }
}

async function syncAllChatApplyButtonsForCurrentFlows() {
  for (const instanceId of Array.from(state.instancesById.keys())) {
    await syncChatApplyButtonForInstance(instanceId);
  }
}

async function clearPendingProposalForInstanceStep(instanceId, stepId) {
  if (!instanceId || !stepId) return false;
  return await Board.clearActiveProposal({
    anchorInstanceId: instanceId,
    stepId
  }, log);
}

function findProposalEndpointForStep(exercisePack, stepId, { lang = getCurrentDisplayLanguage() } = {}) {
  if (!exercisePack || !stepId) return null;
  return listAuthorableEndpointsForStep(exercisePack, stepId, { lang })
    .map((endpoint) => getEffectiveFlowEndpointById(endpoint.id, { lang }))
    .find((endpoint) => {
      const modes = Array.isArray(endpoint?.run?.allowedExecutionModes) ? endpoint.run.allowedExecutionModes : [];
      return endpoint?.surface?.channel === "board_button" && modes.includes("proposal_only");
    }) || null;
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
  endpointId = null,
  promptRuntimeOverride = null,
  userRequest = null,
  basedOnStateHash = null,
  agentObj = null,
  feedback = null,
  flowDirectives = null,
  evaluation = null
} = {}) {
  const instance = state.instancesById.get(instanceId) || null;
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  const controlContext = runtime?.controlContext || null;
  const proposalId = buildProposalId();
  return {
    version: 1,
    id: proposalId,
    proposalId,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    anchorInstanceId: instance?.instanceId || instanceId || null,
    anchorInstanceLabel: instance?.instanceLabel || null,
    canvasTypeId: instance?.canvasTypeId || null,
    exercisePackId: pickFirstNonEmptyString(exercisePackId, runtime?.exercisePack?.id),
    stepId: pickFirstNonEmptyString(stepId),
    stepLabel: pickFirstNonEmptyString(stepLabel, runtime?.currentStep?.label),
    endpointId: pickFirstNonEmptyString(endpointId, controlContext?.endpointId, runtime?.endpoint?.id),
    controlId: controlContext?.controlId || null,
    userRequest: pickFirstNonEmptyString(userRequest),
    basedOnStateHash: pickFirstNonEmptyString(basedOnStateHash),
    analysis: pickFirstNonEmptyString(agentObj?.analysis),
    feedback: cloneJsonValue(feedback),
    actions: cloneJsonValue(agentObj?.actions || []),
    memoryEntry: cloneJsonValue(agentObj?.memoryEntry),
    flowDirectives: cloneJsonValue(flowDirectives),
    evaluation: cloneJsonValue(evaluation)
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

async function renderAgentResponseToInstanceOutput({
  instanceId,
  feedback,
  flowControlDirectives = null,
  evaluation = null,
  sourceLabel = "Agent",
  conversationMeta = null
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
  if (conversationMeta) {
    updateConversationStateAfterAssistantResponse(instanceId, {
      ...conversationMeta,
      feedback
    });
  }
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

function buildFeedbackFallbackTitle(endpoint, sourceLabel = "Feedback") {
  return pickFirstNonEmptyString(endpoint?.label, sourceLabel);
}

function normalizeEndpointExecutionArtifacts(agentObj, endpoint, sourceLabel = "Endpoint") {
  const fallbackSummary = pickFirstNonEmptyString(agentObj?.analysis, null);
  const feedback = ExerciseEngine.normalizeFeedbackBlock(agentObj?.feedback, {
    fallbackTitle: buildFeedbackFallbackTitle(endpoint, sourceLabel),
    fallbackSummary
  });
  const flowControlDirectives = ExerciseEngine.normalizeFlowControlDirectivesBlock(agentObj?.flowControlDirectives);
  const evaluation = ExerciseEngine.normalizeEvaluationBlock(agentObj?.evaluation);
  return { feedback, flowControlDirectives, evaluation };
}

function resolveEndpointExecutionMode(agentObj, endpointContext) {
  return ExerciseEngine.resolveEffectiveExecutionMode({
    rawExecutionMode: agentObj?.executionMode,
    forcedExecutionMode: null,
    allowedExecutionModes: endpointContext?.allowedExecutionModes || ["none"]
  });
}

async function persistExerciseRuntimeAfterEndpointRun({
  endpoint = null,
  flowControlDirectives = null,
  activeAnchorContext = null
} = {}) {
  const runtimePatch = {
    lastEndpointId: endpoint?.id || null,
    lastFlowDirectiveUnlockEndpointIds: Array.isArray(flowControlDirectives?.unlockEndpointIds)
      ? flowControlDirectives.unlockEndpointIds.slice()
      : [],
    lastFlowDirectiveCompleteEndpointIds: Array.isArray(flowControlDirectives?.completeEndpointIds)
      ? flowControlDirectives.completeEndpointIds.slice()
      : []
  };

  if (activeAnchorContext?.anchorInstanceId) {
    runtimePatch.lastActiveFlowAnchorInstanceId = activeAnchorContext.anchorInstanceId;
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
    } catch (error) {
      logSuppressedRuntimeWarning("Selektion konnte keiner Canvas-Instanz zugeordnet werden", error);
    }
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
    } catch (error) {
      logSuppressedRuntimeWarning("Fallback-Deselection nach Button-Run fehlgeschlagen", error);
    }
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
    state.lastActivatedFlowControlItemId === controlSelection.item.id &&
    now - Number(state.lastActivatedFlowControlAt || 0) < 1200
  ) {
    await restoreSelectionAfterBoardButtonRun(anchorInstanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  state.flowControlRunLock = true;
  state.lastActivatedFlowControlItemId = controlSelection.item.id;
  state.lastActivatedFlowControlAt = now;
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

  const chatProposeSelection = await resolveSelectedChatPropose(items);
  if (chatProposeSelection) {
    const headlessShouldRun = shouldHeadlessHandleFlowControls();
    const panelShouldRun = shouldPanelHandleFlowControls();

    if (headlessShouldRun || panelShouldRun) {
      await executeSelectedChatPropose(chatProposeSelection, items);
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
    } catch (error) {
      logSuppressedRuntimeWarning("Board-Viewport konnte nicht geladen werden", error);
    }
  }

  const sdkViewport = window.miro?.board?.viewport;
  if (sdkViewport && typeof sdkViewport.get === "function") {
    try {
      return await sdkViewport.get();
    } catch (error) {
      logSuppressedRuntimeWarning("SDK-Viewport konnte nicht geladen werden", error);
    }
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
      } catch (error) {
        logSuppressedRuntimeWarning("Gelber Canvas-Hintergrund konnte nicht hinter das Bild gelegt werden", error);
      }
      try {
        if (typeof backgroundShape?.sendToBack === "function") {
          await backgroundShape.sendToBack();
        }
      } catch (error) {
        logSuppressedRuntimeWarning("Gelber Canvas-Hintergrund konnte nicht in den Hintergrund gelegt werden", error);
      }
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
    await syncChatProposeButtonForInstance(instance.instanceId);
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
    } catch (error) {
      logSuppressedRuntimeWarning("Sticky-Board-Rect konnte nicht aufgelöst werden", error);
    }
    if (!boardRect) {
      try {
        boardPos = await Board.resolveBoardCoords(s, parentGeomCache, log);
      } catch (error) {
        logSuppressedRuntimeWarning("Sticky-Board-Koordinaten konnten nicht aufgelöst werden", error);
      }
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
      } catch (error) {
        logSuppressedRuntimeWarning("Sticky-Geometrie konnte vor move_sticky nicht geladen werden", error);
      }

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

function resolveResponseTargetInstanceId({ promptRuntimeOverride = null, targetInstanceIds = [], anchorInstanceId = null } = {}) {
  const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  const explicitAnchor = pickFirstNonEmptyString(runtime?.controlContext?.anchorInstanceId, runtime?.anchorInstanceId, anchorInstanceId);
  if (explicitAnchor && state.instancesById.has(explicitAnchor)) return explicitAnchor;

  const normalizedTargets = normalizeTargetInstanceIds(targetInstanceIds);
  if (normalizedTargets.length === 1) return normalizedTargets[0];
  return null;
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
  const instanceId = chatSelection?.instance?.instanceId;
  if (!instanceId) {
    await refreshSelectionStatusFromItems(items);
    return;
  }

  const flow = resolveRelevantFlowForInstance(instanceId);
  if (!flow) {
    await notifyRuntime("Kein eindeutiger Flow für diese Canvas vorhanden.", { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow);
  const endpoint = exercisePack && currentStep
    ? ExerciseLibrary.findFirstEndpointByChannel(exercisePack, currentStep.id, "chat_submit", {
        lang: getCurrentDisplayLanguage()
      })
    : null;

  if (!endpoint) {
    await notifyRuntime("Kein Chat-Submit-Endpoint für den aktuellen Schritt vorhanden.", { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  const rawInputContent = await Board.readChatInputContent(chatSelection.instance.chatInterface, log);
  const userText = normalizeChatQuestionText(rawInputContent);
  if (!userText) {
    log("Bitte eine Frage eingeben.");
    await notifyRuntime("Bitte eine Frage eingeben.", { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  recordConversationTurn(instanceId, {
    text: userText,
    channel: "chat_submit",
    stepId: currentStep?.id || null
  });

  await runEndpoint(endpoint, {
    sourceLabel: endpoint.label || "Senden",
    userText,
    selectedInstanceIds: [instanceId],
    anchorInstanceId: instanceId
  });

  await restoreSelectionAfterBoardButtonRun(instanceId);
  await refreshSelectionStatusFromBoard();
}


async function resolveSelectedChatPropose(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length !== 1) return null;

  const item = list[0];
  const meta = await Board.readChatInterfaceMeta(item, log);
  if (!meta || meta.role !== "propose") return null;

  const instance = meta.instanceId ? state.instancesById.get(meta.instanceId) : null;
  if (!instance) return null;
  return { item, meta, instance };
}

async function executeSelectedChatPropose(chatSelection, items) {
  const instanceId = chatSelection?.instance?.instanceId;
  if (!instanceId) {
    await refreshSelectionStatusFromItems(items);
    return;
  }

  const flow = resolveRelevantFlowForInstance(instanceId);
  if (!flow) {
    await notifyRuntime("Kein eindeutiger Flow für diese Canvas vorhanden.", { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow);
  const endpoint = exercisePack && currentStep
    ? findProposalEndpointForStep(exercisePack, currentStep.id, { lang: getCurrentDisplayLanguage() })
    : null;

  if (!endpoint) {
    await notifyRuntime("Kein Vorschlags-Endpoint für den aktuellen Schritt vorhanden.", { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  const rawInputContent = await Board.readChatInputContent(chatSelection.instance.chatInterface, log);
  const userText = normalizeChatQuestionText(rawInputContent) || null;
  if (userText) {
    recordConversationTurn(instanceId, {
      text: userText,
      channel: "chat_propose",
      stepId: currentStep?.id || null
    });
  }

  await runEndpoint(endpoint, {
    sourceLabel: endpoint.label || "Vorschlag ausarbeiten",
    userText,
    selectedInstanceIds: [instanceId],
    anchorInstanceId: instanceId
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
  const instanceId = chatSelection?.instance?.instanceId;
  if (!instanceId) {
    await refreshSelectionStatusFromItems(items);
    return;
  }

  const flow = resolveRelevantFlowForInstance(instanceId);
  if (!flow) {
    await notifyRuntime("Kein eindeutiger Flow für diese Canvas vorhanden.", { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow);
  const endpoint = exercisePack && currentStep
    ? ExerciseLibrary.findFirstEndpointByChannel(exercisePack, currentStep.id, "chat_apply", {
        lang: getCurrentDisplayLanguage()
      })
    : null;

  if (!endpoint) {
    await notifyRuntime("Kein Chat-Apply-Endpoint für den aktuellen Schritt vorhanden.", { level: "warning" });
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
    return;
  }

  await applyStoredProposalMechanically({
    exercisePack,
    currentStep,
    endpoint,
    targetInstanceIds: [instanceId],
    sourceLabel: endpoint.label || "Vorschläge anwenden",
    anchorInstanceId: instanceId
  });

  await restoreSelectionAfterBoardButtonRun(instanceId);
  await refreshSelectionStatusFromBoard();
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

function resolveOwnerInstanceIdForStickyReference(stickyRef) {
  if (!stickyRef) return null;

  const resolvedStickyId = Catalog.resolveStickyId(stickyRef, state.aliasState);
  if (!resolvedStickyId) return null;

  return state.stickyOwnerCache?.get(resolvedStickyId) || null;
}

function resolveActionInstanceId(action, { candidateInstanceIds = null, anchorInstanceId = null, sourceLabel = "Agent" } = {}) {
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
  if (anchorInstanceId && candidateIds.includes(anchorInstanceId)) return anchorInstanceId;
  return null;
}

async function applyResolvedAgentActions(actions, { candidateInstanceIds, anchorInstanceId = null, sourceLabel = "Agent" }) {
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
  let queuedCount = 0;
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
      anchorInstanceId,
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
    queuedCount++;
  }

  for (const [instanceId, instanceActions] of grouped.entries()) {
    log(sourceLabel + ": Wende " + instanceActions.length + " Action(s) auf Instanz " + (getInstanceLabelByInternalId(instanceId) || instanceId) + " an.");
    const executionStats = await applyAgentActionsToInstance(instanceId, instanceActions);
    mergeActionExecutionStats(aggregatedExecutionStats, executionStats);
  }

  const nestedSkippedCount = Number(aggregatedExecutionStats.skippedActionCount || 0);
  const failedCount = Number(aggregatedExecutionStats.failedActionCount || 0);
  const totalSkippedCount = skippedCount + nestedSkippedCount;
  const appliedCount = Math.max(0, queuedCount - failedCount - nestedSkippedCount);

  return {
    queuedCount,
    appliedCount,
    skippedCount: totalSkippedCount,
    infoCount,
    targetedInstanceCount: grouped.size,
    failedCount,
    ...aggregatedExecutionStats,
    skippedActionCount: totalSkippedCount
  };
}

// --------------------------------------------------------------------
// Global Agent Modus A
// --------------------------------------------------------------------
function listAreaNamesFromActiveCanvasStates(activeCanvasStates) {
  const areaNames = [];
  const seen = new Set();
  for (const payload of Object.values((activeCanvasStates && typeof activeCanvasStates === "object") ? activeCanvasStates : {})) {
    for (const tpl of Array.isArray(payload?.templates) ? payload.templates : []) {
      for (const area of Array.isArray(tpl?.areas) ? tpl.areas : []) {
        const name = pickFirstNonEmptyString(area?.name);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        areaNames.push(name);
      }
    }
  }
  return areaNames;
}

function resolveAllowedActionAreasForRun({ endpointContext = null, activeCanvasStates = null } = {}) {
  const explicitAreas = ExerciseEngine.normalizeStringArray(endpointContext?.allowedActionAreas);
  if (explicitAreas.length) return explicitAreas;
  return listAreaNamesFromActiveCanvasStates(activeCanvasStates);
}

function sanitizeProposalActionsForEndpoint(actions, {
  allowedActions = [],
  allowedActionAreas = [],
  logFn = null
} = {}) {
  const normalizedActions = Array.isArray(actions)
    ? actions.map((raw) => normalizeAgentAction(raw)).filter(Boolean)
    : [];

  const allowedActionSet = new Set(ExerciseEngine.normalizeStringArray(allowedActions));
  const allowedAreas = new Set(ExerciseEngine.normalizeStringArray(allowedActionAreas));
  const logSafe = typeof logFn === "function" ? logFn : (() => {});
  const sanitized = [];

  for (const action of normalizedActions) {
    if (!action) continue;

    if (action.type === "inform") {
      sanitized.push(action);
      continue;
    }

    if (allowedActionSet.size && !allowedActionSet.has(action.type)) {
      logSafe("INFO: Proposal verwirft nicht freigegebenen Action-Typ: " + String(action.type || "(leer)"));
      continue;
    }

    if (allowedAreas.size && action.type === "create_sticky") {
      const area = pickFirstNonEmptyString(action.area, action.targetArea);
      if (!area || !allowedAreas.has(area)) {
        logSafe("INFO: Proposal verwirft Action außerhalb erlaubter Bereiche: " + String(area || "(leer)"));
        continue;
      }
    }

    if (allowedAreas.size && action.type === "move_sticky") {
      const area = pickFirstNonEmptyString(action.targetArea, action.area);
      if (!area || !allowedAreas.has(area)) {
        logSafe("INFO: Proposal verwirft Action außerhalb erlaubter Bereiche: " + String(area || "(leer)"));
        continue;
      }
    }

    sanitized.push(action);
  }

  return sanitized;
}


