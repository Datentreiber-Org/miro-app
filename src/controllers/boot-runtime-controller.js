export function createBootRuntimeController(deps) {
  const {
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
  } = deps;

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
  

  return {
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
  };
}
