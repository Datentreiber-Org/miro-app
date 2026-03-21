import {
  TEMPLATE_ID,
  BUSINESS_MODEL_CASE_TEMPLATE_ID,
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
} from "./config.js?v=20260316-patch20-data-monetization-pack";

import { createLogger, stripHtml, extractUnderlinedText, isFiniteNumber } from "./utils.js?v=20260316-patch20-data-monetization-pack";
import { normalizeUiLanguage, t, getLocaleForLanguage } from "./i18n/index.js?v=20260316-patch20-data-monetization-pack";

import * as Board from "./miro/board.js?v=20260316-patch20-data-monetization-pack";
import * as FrameSources from "./miro/frame-sources.js?v=20260316-patch20-data-monetization-pack";
import * as Catalog from "./domain/catalog.js?v=20260316-patch20-data-monetization-pack";
import * as OpenAI from "./ai/openai.js?v=20260316-patch20-data-monetization-pack";
import * as Memory from "./runtime/memory.js?v=20260316-patch20-data-monetization-pack";
import * as Exercises from "./exercises/registry.js?v=20260316-patch20-data-monetization-pack";
import * as ExerciseLibrary from "./exercises/library.js?v=20260316-patch20-data-monetization-pack";
import * as PromptComposer from "./prompt/composer.js?v=20260316-patch20-data-monetization-pack";
import * as ExerciseEngine from "./runtime/exercise-engine.js?v=20260316-patch20-data-monetization-pack";
import * as BoardFlow from "./runtime/board-flow.js?v=20260316-patch20-data-monetization-pack";
import * as PanelBridge from "./runtime/panel-bridge.js?v=20260316-patch20-data-monetization-pack";
import { getInsertWidthPxForCanvasType, computeTemplateInsertPosition } from "./app/template-insertion.js?v=20260316-patch20-data-monetization-pack";
import {
  pickFirstNonEmptyString,
  makeDirectedConnectorKey,
  makeUndirectedConnectorKey,
  normalizeAgentAction
} from "./agent/action-normalization.js?v=20260316-patch20-data-monetization-pack";
import { createEmptyActionExecutionStats, mergeActionExecutionStats, summarizeAppliedActions } from "./agent/action-stats.js?v=20260316-patch20-data-monetization-pack";

import { createBootRuntimeController } from "./controllers/boot-runtime-controller.js?v=20260316-patch20-data-monetization-pack";
import { createFlowOrchestrationController } from "./controllers/flow-orchestration-controller.js?v=20260316-patch20-data-monetization-pack";
import { createProposalApplyController } from "./controllers/proposal-apply-controller.js?v=20260316-patch20-data-monetization-pack";
import { createEndpointExecutionController } from "./controllers/endpoint-execution-controller.js?v=20260316-patch20-data-monetization-pack";
import { createBoardMutationController } from "./controllers/board-mutation-controller.js?v=20260316-patch20-data-monetization-pack";

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
const flowEndpointOverrideSourceFramesEl = document.getElementById("flow-endpoint-override-source-frames");
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

let bootRuntimeController = null;
let flowOrchestrationController = null;
let proposalApplyController = null;
let endpointExecutionController = null;
let boardMutationController = null;

function buildBaseControllerDeps() {
  return {
    Board,
    DT_CLUSTER_CUSTOM_ACTION_EVENT,
    DT_CLUSTER_CUSTOM_ACTION_UI,
    DT_CLUSTER_SESSION_BRIDGE_KEY,
    Exercises,
    IS_HEADLESS,
    PanelBridge,
    RUNTIME_CONTEXT,
    apiKeyEl,
    clusterSelectionWithIds,
    formatRuntimeErrorMessage,
    getCurrentDisplayLanguage,
    log,
    logSuppressedRuntimeWarning,
    modelEl,
    pickFirstNonEmptyString,
    state,
    t,
    BoardFlow,
    ExerciseEngine,
    ExerciseLibrary,
    TEMPLATE_ID,
    applyStaticUiLanguage,
    buildRunFailureResult,
    flowAuthoringStatusEl,
    flowControlLabelEl,
    flowScopeTypeEl,
    flowStaticLayoutToggleEl,
    getEffectiveFlowEndpointById,
    getInstanceLabelByInternalId,
    getInstanceLabelsFromIds,
    getSelectedFlowEndpoint,
    getSelectedFlowEndpointId,
    getSelectedFlowExercisePack,
    getSelectedFlowExercisePackId,
    getSelectedFlowStep,
    getSelectedFlowStepId,
    isStaticFlowControlLayoutEnabled,
    listAuthorableEndpointsForStep,
    normalizeCanvasTypeId,
    persistBoardConfig,
    refreshFlowEndpointOverridesFromStorage,
    refreshSelectionStatusFromBoard,
    refreshSelectionStatusFromItems,
    renderCanvasTypePicker,
    renderExerciseControls,
    renderFlowEndpointOverrideEditor,
    renderFlowEndpointPicker,
    renderFlowExercisePackPicker,
    renderFlowStepPicker,
    setSelectedCanvasTypeId,
    syncBoardChromeLanguage,
    Catalog,
    acquireBoardSoftLock,
    buildRunSuccessResult,
    createRunStatusItems,
    ensureInstancesScanned,
    finalizeBoardSoftLock,
    formatExistingBoardRunMessage,
    loadMemoryRuntimeState,
    logRuntimeNotice,
    normalizeAgentAction,
    normalizeTargetInstanceIds,
    normalizeUiLanguage,
    refreshBoardState,
    releaseAgentRunLock,
    stripHtml,
    syncBoardSoftLock,
    tryAcquireAgentRunLock,
    DT_GLOBAL_SYSTEM_PROMPT,
    DT_MEMORY_RECENT_LOG_LIMIT,
    DT_PROMPT_CATALOG,
    DT_TEMPLATE_CATALOG,
    FrameSources,
    Memory,
    OpenAI,
    PromptComposer,
    buildMemoryTimelineForPrompt,
    buildSignatureSnapshot,
    getInternalInstanceIdByLabel,
    hasMutatingActions,
    isFlowEndpointOverrideEligible,
    performPreApplyConflictCheck,
    persistExerciseRuntime,
    restoreSelectionAfterBoardButtonRun,
    simplifyMemoryStateForPrompt,
    summarizeAppliedActions,
    STICKY_LAYOUT,
    createEmptyActionExecutionStats,
    ensureSystemCheckTagId,
    isFiniteNumber,
    makeDirectedConnectorKey,
    makeUndirectedConnectorKey,
    mergeActionExecutionStats,
    normalizeStickyColorToken,
  };
}

boardMutationController = createBoardMutationController({
  ...buildBaseControllerDeps(),
});

const {
  classifyStickies,
  getInstanceStateForAgent,
  computeInstanceStatesById,
  applyAgentActionsToInstance,
  buildBoardCatalogForSelectedInstances,
  validateNormalizedAction,
  resolveOwnerInstanceIdForStickyReference,
  resolveActionInstanceId,
  applyResolvedAgentActions,
  listAreaNamesFromActiveCanvasStates,
  resolveAllowedActionAreasForRun,
  sanitizeProposalActionsForEndpoint,
} = boardMutationController;

proposalApplyController = createProposalApplyController({
  ...buildBaseControllerDeps(),
  applyEndpointRunArtifactsAndSyncUi: (...args) => endpointExecutionController.applyEndpointRunArtifactsAndSyncUi(...args),
  applyResolvedAgentActions: (...args) => boardMutationController.applyResolvedAgentActions(...args),
  buildEndpointExecutionContext: (...args) => endpointExecutionController.buildEndpointExecutionContext(...args),
  computeInstanceStatesById: (...args) => boardMutationController.computeInstanceStatesById(...args),
  createEmptyEndpointActionResult: (...args) => endpointExecutionController.createEmptyEndpointActionResult(...args),
  getCurrentUserQuestion: (...args) => bootRuntimeController.getCurrentUserQuestion(...args),
  notifyRuntime: (...args) => bootRuntimeController.notifyRuntime(...args),
  persistMemoryAfterAgentRun: (...args) => endpointExecutionController.persistMemoryAfterAgentRun(...args),
  resolveCurrentPackAndStepFromFlow: (...args) => bootRuntimeController.resolveCurrentPackAndStepFromFlow(...args),
  resolveRelevantFlowForInstance: (...args) => bootRuntimeController.resolveRelevantFlowForInstance(...args),
  sanitizeProposalActionsForEndpoint: (...args) => boardMutationController.sanitizeProposalActionsForEndpoint(...args),
});

const {
  buildProposalId,
  buildAreaTitleFromAreaKey,
  truncateProposalText,
  summarizeProposalActionsForPrompt,
  buildProposalActionPreview,
  buildPendingProposalContextForPrompt,
  summarizeFeedbackForConversation,
  getConversationRecord,
  recordConversationTurn,
  buildConversationContextForPrompt,
  updateConversationStateAfterAssistantResponse,
  loadPendingProposalForInstance,
  syncAllChatInterfacesLayout,
  hasPendingProposalForInstanceStep,
  syncChatApplyButtonForInstance,
  syncChatProposeButtonForInstance,
  syncChatProposeButtonsForInstanceIds,
  syncAllChatProposeButtonsForCurrentFlows,
  syncChatApplyButtonsForInstanceIds,
  syncAllChatApplyButtonsForCurrentFlows,
  clearPendingProposalForInstanceStep,
  findProposalEndpointForStep,
  cloneJsonValue,
  hasExecutableProposalActions,
  buildStoredProposalRecord,
  buildStaleProposalFeedback,
  renderAgentResponseToInstanceOutput,
  getStoredProposalExecutableActions,
  applyStoredProposalMechanically,
} = proposalApplyController;

endpointExecutionController = createEndpointExecutionController({
  ...buildBaseControllerDeps(),
  applyFlowControlDirectivesAfterAgentRun: (...args) => flowOrchestrationController.applyFlowControlDirectivesAfterAgentRun(...args),
  applyResolvedAgentActions: (...args) => boardMutationController.applyResolvedAgentActions(...args),
  applyStoredProposalMechanically: (...args) => proposalApplyController.applyStoredProposalMechanically(...args),
  buildBoardCatalogForSelectedInstances: (...args) => boardMutationController.buildBoardCatalogForSelectedInstances(...args),
  buildConversationContextForPrompt: (...args) => proposalApplyController.buildConversationContextForPrompt(...args),
  buildPendingProposalContextForPrompt: (...args) => proposalApplyController.buildPendingProposalContextForPrompt(...args),
  buildPromptRuntimeFromEndpoint: (...args) => flowOrchestrationController.buildPromptRuntimeFromEndpoint(...args),
  buildStoredProposalRecord: (...args) => proposalApplyController.buildStoredProposalRecord(...args),
  clearPendingProposalForInstanceStep: (...args) => proposalApplyController.clearPendingProposalForInstanceStep(...args),
  computeInstanceStatesById: (...args) => boardMutationController.computeInstanceStatesById(...args),
  findProposalEndpointForStep: (...args) => proposalApplyController.findProposalEndpointForStep(...args),
  getApiKey: (...args) => bootRuntimeController.getApiKey(...args),
  getCurrentUserQuestion: (...args) => bootRuntimeController.getCurrentUserQuestion(...args),
  getModel: (...args) => bootRuntimeController.getModel(...args),
  getSelectedInstanceIds: (...args) => bootRuntimeController.getSelectedInstanceIds(...args),
  notifyRuntime: (...args) => bootRuntimeController.notifyRuntime(...args),
  recordConversationTurn: (...args) => proposalApplyController.recordConversationTurn(...args),
  renderAgentResponseToInstanceOutput: (...args) => proposalApplyController.renderAgentResponseToInstanceOutput(...args),
  resolveAllowedActionAreasForRun: (...args) => boardMutationController.resolveAllowedActionAreasForRun(...args),
  resolveCurrentPackAndStepFromFlow: (...args) => bootRuntimeController.resolveCurrentPackAndStepFromFlow(...args),
  resolveFlowPromptContext: (...args) => flowOrchestrationController.resolveFlowPromptContext(...args),
  resolveRelevantFlowForInstance: (...args) => bootRuntimeController.resolveRelevantFlowForInstance(...args),
  resolveTargetInstanceIdsFromScope: (...args) => flowOrchestrationController.resolveTargetInstanceIdsFromScope(...args),
  sanitizeProposalActionsForEndpoint: (...args) => boardMutationController.sanitizeProposalActionsForEndpoint(...args),
  syncChatApplyButtonsForInstanceIds: (...args) => proposalApplyController.syncChatApplyButtonsForInstanceIds(...args),
  syncChatProposeButtonsForInstanceIds: (...args) => proposalApplyController.syncChatProposeButtonsForInstanceIds(...args),
});

const {
  getPromptConfigForSelectedInstances,
  isBusinessModelCasePack,
  isBusinessModelVotingStep,
  listStickyAliasIdsFromActiveCanvasStates,
  normalizeVotingSessions,
  normalizeVotingEntries,
  buildVotingContextForPrompt,
  createEmptyEndpointActionResult,
  buildEndpointExecutionContext,
  buildActiveCanvasStatesFromStateById,
  buildStructuredEndpointPromptArtifacts,
  syncEndpointChatButtons,
  applyEndpointRunArtifactsAndSyncUi,
  handleStructuredEndpointNoneMode,
  handleStructuredEndpointProposalMode,
  handleStructuredEndpointDirectApplyMode,
  runStructuredEndpointExecution,
  runEndpoint,
  runEndpointById,
  getInvolvedCanvasTypeIdsFromInstanceIds,
  persistMemoryAfterAgentRun,
  buildFeedbackFallbackTitle,
  normalizeEndpointExecutionArtifacts,
  resolveEndpointExecutionMode,
  persistExerciseRuntimeAfterEndpointRun,
  normalizeComparableChatText,
  normalizeChatQuestionText,
  resolveBoardUserSeedText,
  resolveResponseTargetInstanceId,
  resolveSelectedChatSubmit,
  executeSelectedChatSubmit,
  resolveSelectedChatPropose,
  executeSelectedChatPropose,
  resolveSelectedChatApply,
  executeSelectedChatApply,
} = endpointExecutionController;

flowOrchestrationController = createFlowOrchestrationController({
  ...buildBaseControllerDeps(),
  getCurrentUserQuestion: (...args) => bootRuntimeController.getCurrentUserQuestion(...args),
  getSelectedInstanceIds: (...args) => bootRuntimeController.getSelectedInstanceIds(...args),
  notifyRuntime: (...args) => bootRuntimeController.notifyRuntime(...args),
  resolveBoardUserSeedText: (...args) => endpointExecutionController.resolveBoardUserSeedText(...args),
  resolveCurrentPackAndStepFromFlow: (...args) => bootRuntimeController.resolveCurrentPackAndStepFromFlow(...args),
  resolveRelevantFlowForInstance: (...args) => bootRuntimeController.resolveRelevantFlowForInstance(...args),
  resolveRelevantFlowForSelection: (...args) => bootRuntimeController.resolveRelevantFlowForSelection(...args),
  runStructuredEndpointExecution: (...args) => endpointExecutionController.runStructuredEndpointExecution(...args),
  syncAllChatApplyButtonsForCurrentFlows: (...args) => proposalApplyController.syncAllChatApplyButtonsForCurrentFlows(...args),
  syncAllChatProposeButtonsForCurrentFlows: (...args) => proposalApplyController.syncAllChatProposeButtonsForCurrentFlows(...args),
});

const {
  buildFlowControlLabelSourceKey,
  syncFlowControlLabelFromEndpoint,
  updateFlowControlLabelDirtyState,
  listDirectiveCandidateEndpointsForStep,
  buildAdjacentStepGuidance,
  buildFlowGuidanceForPrompt,
  resolveFlowPromptContext,
  getEndpointSurfaceMeta,
  getEndpointSortOrder,
  getEndpointPanelRoleRank,
  getFlowControlDisplayBucket,
  getFlowControlDisplayLane,
  sortFlowControlsForDisplay,
  syncBoardFlowVisuals,
  syncAllBoardFlowVisuals,
  buildFlowId,
  getExistingBoardFlowForPack,
  saveBoardFlowAndCache,
  buildAuthorableFlowPack,
  ensureDefaultBoardControlsForStep,
  findOrCreateBoardFlowForPack,
  renderFlowAuthoringStatus,
  renderFlowAuthoringControls,
  pruneMissingBoardFlowControls,
  ensureBoardFlowHealthy,
  loadBoardFlows,
  buildFlowScopeForEndpoint,
  createBoardFlowControlForEndpoint,
  ensureFlowControlsForEndpoints,
  applyFlowControlDirectivesAfterAgentRun,
  resolveAuthoringScopeFromCurrentSelection,
  createFlowControlFromAdmin,
  setCurrentFlowStepFromAdmin,
  getSelectedFlowControlLabel,
  resolveSelectedFlowControl,
  activateSelectedFlowControlFromAdmin,
  markSelectedFlowControlDoneFromAdmin,
  resetSelectedFlowControlFromAdmin,
  resolveTargetInstanceIdsFromScope,
  buildPromptRuntimeFromEndpoint,
  runAgentFromFlowControl,
  syncDefaultCanvasTypeToBoardConfig,
  loadBoardRuntimeState,
} = flowOrchestrationController;

bootRuntimeController = createBootRuntimeController({
  ...buildBaseControllerDeps(),
});

const {
  loadRuntimeSettings,
  applyRuntimeSettingsToUi,
  persistRuntimeSettingsFromUi,
  getApiKey,
  getModel,
  getPanelUserText,
  buildRuntimeId,
  buildFallbackBoardScopeId,
  ensureRuntimeIdentity,
  getRuntimeBoardScopeId,
  startPanelRuntimeBridge,
  stopPanelRuntimeBridge,
  installPanelRuntimeBridgeLifecycle,
  getCurrentBoardMode,
  getSelectedInstanceIds,
  resolveRelevantFlowForInstance,
  resolveRelevantFlowForSelection,
  resolveCurrentPackAndStepFromFlow,
  resolveActiveFlowContext,
  getCurrentUserQuestion,
  notifyRuntime,
  normalizeClusterSessionBridgePayload,
  readClusterSessionBridgePayload,
  restoreClusterSessionStateFromBridge,
  persistClusterSessionStateToBridge,
  bindClusterSessionBridge,
  registerHeadlessClusterCustomAction,
  shouldHeadlessHandleFlowControls,
  shouldPanelHandleFlowControls,
} = bootRuntimeController;

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

  const nextEndpoint = {
    ...rawEndpoint,
    prompt: {
      ...(rawEndpoint.prompt || {}),
      text: override.promptText || rawEndpoint.prompt?.text || ""
    },
    run: nextRun
  };

  const nextSourceFrameNames = Array.isArray(override.sourceFrameNames)
    ? FrameSources.normalizeSourceFrameNames(override.sourceFrameNames)
    : FrameSources.normalizeSourceFrameNames(rawEndpoint.sourceFrameNames);
  if (nextSourceFrameNames.length) {
    nextEndpoint.sourceFrameNames = nextSourceFrameNames;
  } else if (Object.prototype.hasOwnProperty.call(nextEndpoint, "sourceFrameNames")) {
    delete nextEndpoint.sourceFrameNames;
  }

  return nextEndpoint;
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

function sameOrderedSourceFrameList(a, b) {
  const left = FrameSources.normalizeSourceFrameNames(a);
  const right = FrameSources.normalizeSourceFrameNames(b);
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function formatSourceFrameNamesForTextarea(values) {
  return FrameSources.formatSourceFrameNamesInput(values);
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

  const sourceFrameNames = hasEligibleEndpoint
    ? FrameSources.normalizeSourceFrameNames(override?.sourceFrameNames || endpoint.sourceFrameNames || [])
    : [];
  if (flowEndpointOverrideSourceFramesEl) {
    flowEndpointOverrideSourceFramesEl.value = formatSourceFrameNamesForTextarea(sourceFrameNames);
    flowEndpointOverrideSourceFramesEl.disabled = !hasEligibleEndpoint;
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
  const sourceFrameNames = FrameSources.parseSourceFrameNamesInput(flowEndpointOverrideSourceFramesEl?.value || "");

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
  const catalogSourceFrameNames = FrameSources.normalizeSourceFrameNames(endpoint.sourceFrameNames || []);

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
  if (!sameOrderedSourceFrameList(sourceFrameNames, catalogSourceFrameNames)) {
    overridePatch.sourceFrameNames = sourceFrameNames;
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
