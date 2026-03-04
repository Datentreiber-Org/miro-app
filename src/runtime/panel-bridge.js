const PANEL_RUNTIME_STORAGE_KEY = "dt-panel-runtime-settings-v1";
const PANEL_RUNTIME_SECRETS_KEY = "dt-panel-runtime-secrets-v1";
const PANEL_HEARTBEAT_STORAGE_KEY = "dt-panel-runtime-heartbeat-v1";
const PENDING_FLOW_TRIGGER_STORAGE_KEY = "dt-pending-flow-trigger-v1";

export const PANEL_HEARTBEAT_INTERVAL_MS = 1500;
export const PANEL_HEARTBEAT_STALE_AFTER_MS = 4500;
export const PENDING_FLOW_TRIGGER_MAX_AGE_MS = 20000;

let heartbeatTimer = null;

function getLocalStorage() {
  try {
    return window.localStorage || null;
  } catch (_) {
    return null;
  }
}

function getSessionStorage() {
  try {
    return window.sessionStorage || null;
  } catch (_) {
    return null;
  }
}

function safeParseJson(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;
  try {
    return JSON.parse(rawValue);
  } catch (_) {
    return null;
  }
}

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeRuntimeSettings(rawSettings) {
  const src = (rawSettings && typeof rawSettings === "object") ? rawSettings : {};
  return {
    version: 1,
    apiKey: asNonEmptyString(src.apiKey),
    model: asNonEmptyString(src.model) || "gpt-5.2",
    updatedAt: asNonEmptyString(src.updatedAt) || null
  };
}

function normalizePendingFlowTrigger(rawTrigger) {
  const src = (rawTrigger && typeof rawTrigger === "object") ? rawTrigger : {};
  const requestedAt = Number(src.requestedAtMs || src.requestedAt || 0);
  return {
    version: 1,
    flowId: asNonEmptyString(src.flowId),
    controlId: asNonEmptyString(src.controlId),
    itemId: src.itemId == null ? null : String(src.itemId),
    requestId: asNonEmptyString(src.requestId),
    requestedAtMs: Number.isFinite(requestedAt) && requestedAt > 0 ? requestedAt : Date.now(),
    source: asNonEmptyString(src.source) || "headless"
  };
}

function normalizeHeartbeat(rawHeartbeat) {
  const src = (rawHeartbeat && typeof rawHeartbeat === "object") ? rawHeartbeat : {};
  const touchedAt = Number(src.touchedAtMs || src.touchedAt || 0);
  return {
    version: 1,
    touchedAtMs: Number.isFinite(touchedAt) && touchedAt > 0 ? touchedAt : 0
  };
}

function readStorageJson(storage, key) {
  if (!storage || !key) return null;
  return safeParseJson(storage.getItem(key));
}

function writeStorageJson(storage, key, value) {
  if (!storage || !key) return null;
  storage.setItem(key, JSON.stringify(value));
  return value;
}

function removeStorageKey(storage, key) {
  if (!storage || !key) return;
  storage.removeItem(key);
}

export function loadRuntimeSettings() {
  const localSrc = readStorageJson(getLocalStorage(), PANEL_RUNTIME_STORAGE_KEY) || {};
  const secretSrc = readStorageJson(getSessionStorage(), PANEL_RUNTIME_SECRETS_KEY) || {};
  return normalizeRuntimeSettings({
    ...localSrc,
    ...secretSrc
  });
}

export function saveRuntimeSettings(patch = {}) {
  const current = loadRuntimeSettings();
  const next = normalizeRuntimeSettings({
    ...current,
    ...(patch && typeof patch === "object" ? patch : {}),
    updatedAt: new Date().toISOString()
  });

  const localStorage = getLocalStorage();
  const sessionStorage = getSessionStorage();

  writeStorageJson(localStorage, PANEL_RUNTIME_STORAGE_KEY, {
    version: 1,
    model: next.model,
    updatedAt: next.updatedAt
  });

  writeStorageJson(sessionStorage, PANEL_RUNTIME_SECRETS_KEY, {
    version: 1,
    apiKey: next.apiKey,
    updatedAt: next.updatedAt
  });

  return next;
}

export function clearRuntimeSettings() {
  removeStorageKey(getLocalStorage(), PANEL_RUNTIME_STORAGE_KEY);
  removeStorageKey(getSessionStorage(), PANEL_RUNTIME_SECRETS_KEY);
}

export function loadPendingFlowControlTrigger() {
  const raw = readStorageJson(getLocalStorage(), PENDING_FLOW_TRIGGER_STORAGE_KEY);
  const normalized = normalizePendingFlowTrigger(raw);
  if (!normalized.flowId || !normalized.controlId) return null;
  if (Date.now() - normalized.requestedAtMs > PENDING_FLOW_TRIGGER_MAX_AGE_MS) {
    clearPendingFlowControlTrigger();
    return null;
  }
  return normalized;
}

export function savePendingFlowControlTrigger(trigger) {
  const normalized = normalizePendingFlowTrigger(trigger);
  if (!normalized.flowId || !normalized.controlId) return null;
  writeStorageJson(getLocalStorage(), PENDING_FLOW_TRIGGER_STORAGE_KEY, normalized);
  return normalized;
}

export function clearPendingFlowControlTrigger() {
  removeStorageKey(getLocalStorage(), PENDING_FLOW_TRIGGER_STORAGE_KEY);
}

export function consumePendingFlowControlTrigger() {
  const pending = loadPendingFlowControlTrigger();
  if (pending) clearPendingFlowControlTrigger();
  return pending;
}

export function touchPanelHeartbeat() {
  const normalized = normalizeHeartbeat({ touchedAtMs: Date.now() });
  writeStorageJson(getLocalStorage(), PANEL_HEARTBEAT_STORAGE_KEY, normalized);
  return normalized;
}

export function isPanelHeartbeatFresh({ maxAgeMs = PANEL_HEARTBEAT_STALE_AFTER_MS } = {}) {
  const heartbeat = normalizeHeartbeat(readStorageJson(getLocalStorage(), PANEL_HEARTBEAT_STORAGE_KEY));
  if (!heartbeat.touchedAtMs) return false;
  return (Date.now() - heartbeat.touchedAtMs) <= Number(maxAgeMs || PANEL_HEARTBEAT_STALE_AFTER_MS);
}

export function startPanelHeartbeat() {
  stopPanelHeartbeat();
  touchPanelHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    touchPanelHeartbeat();
  }, PANEL_HEARTBEAT_INTERVAL_MS);
  return heartbeatTimer;
}

export function stopPanelHeartbeat() {
  if (heartbeatTimer) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  removeStorageKey(getLocalStorage(), PANEL_HEARTBEAT_STORAGE_KEY);
}
