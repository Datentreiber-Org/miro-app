const PANEL_RUNTIME_STORAGE_KEY = "dt-panel-runtime-settings-v1";
const PANEL_RUNTIME_SECRETS_KEY = "dt-panel-runtime-secrets-v1";
const PANEL_RUNTIME_LEASE_STORAGE_KEY_PREFIX = "dt-runtime-lease-v2::";

export const PANEL_RUNTIME_LEASE_REFRESH_INTERVAL_MS = 1500;
export const PANEL_RUNTIME_LEASE_STALE_AFTER_MS = 4500;

let leaseTimer = null;
let activeLeaseIdentity = null;

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

function normalizePositiveTimestampMs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
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

function normalizeBoardScopeId(value) {
  return asNonEmptyString(value);
}

function normalizeRuntimeId(value) {
  return asNonEmptyString(value);
}

function normalizeLeaseOwnerType(value) {
  return asNonEmptyString(value) || "panel";
}

function normalizeRuntimeLease(rawLease) {
  const src = (rawLease && typeof rawLease === "object") ? rawLease : {};
  return {
    version: 2,
    boardScopeId: normalizeBoardScopeId(src.boardScopeId || src.boardId),
    runtimeId: normalizeRuntimeId(src.runtimeId),
    ownerType: normalizeLeaseOwnerType(src.ownerType),
    claimedAtMs: normalizePositiveTimestampMs(src.claimedAtMs || src.claimedAt),
    touchedAtMs: normalizePositiveTimestampMs(src.touchedAtMs || src.touchedAt)
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

function runtimeLeaseStorageKey(boardScopeId) {
  const normalizedBoardScopeId = normalizeBoardScopeId(boardScopeId);
  if (!normalizedBoardScopeId) return null;
  return PANEL_RUNTIME_LEASE_STORAGE_KEY_PREFIX + normalizedBoardScopeId;
}

function isLeaseFresh(lease, { maxAgeMs = PANEL_RUNTIME_LEASE_STALE_AFTER_MS } = {}) {
  const normalizedLease = normalizeRuntimeLease(lease);
  if (!normalizedLease.touchedAtMs) return false;

  const normalizedMaxAgeMs = Number(maxAgeMs || PANEL_RUNTIME_LEASE_STALE_AFTER_MS);
  const effectiveMaxAgeMs = Number.isFinite(normalizedMaxAgeMs) && normalizedMaxAgeMs > 0
    ? normalizedMaxAgeMs
    : PANEL_RUNTIME_LEASE_STALE_AFTER_MS;

  return (Date.now() - normalizedLease.touchedAtMs) <= effectiveMaxAgeMs;
}

function canLeaseBeReplaced(currentLease, nextLease) {
  const current = normalizeRuntimeLease(currentLease);
  const next = normalizeRuntimeLease(nextLease);

  if (!next.boardScopeId || !next.runtimeId) return false;
  if (!current.boardScopeId || current.boardScopeId !== next.boardScopeId) return true;
  if (current.runtimeId === next.runtimeId) return true;
  if (!isLeaseFresh(current)) return true;

  const currentClaimedAtMs = normalizePositiveTimestampMs(current.claimedAtMs);
  const nextClaimedAtMs = normalizePositiveTimestampMs(next.claimedAtMs);

  if (!currentClaimedAtMs) return true;
  if (!nextClaimedAtMs) return false;
  return nextClaimedAtMs >= currentClaimedAtMs;
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
    apiKey: next.apiKey,
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

export function readBoardRuntimeLease(boardScopeId) {
  const storageKey = runtimeLeaseStorageKey(boardScopeId);
  if (!storageKey) return null;

  const lease = normalizeRuntimeLease(readStorageJson(getLocalStorage(), storageKey));
  return lease.boardScopeId ? lease : null;
}

export function refreshPanelRuntimeLease({ boardScopeId = null, runtimeId = null, ownerType = "panel", claimedAtMs = 0 } = {}) {
  const normalizedClaimedAtMs = normalizePositiveTimestampMs(claimedAtMs) || Date.now();
  const nextLease = normalizeRuntimeLease({
    boardScopeId,
    runtimeId,
    ownerType,
    claimedAtMs: normalizedClaimedAtMs,
    touchedAtMs: Date.now()
  });

  if (!nextLease.boardScopeId || !nextLease.runtimeId) {
    return { ok: false, lease: null };
  }

  const currentLease = readBoardRuntimeLease(nextLease.boardScopeId);
  if (!canLeaseBeReplaced(currentLease, nextLease)) {
    return { ok: false, lease: currentLease };
  }

  const storageKey = runtimeLeaseStorageKey(nextLease.boardScopeId);
  if (!storageKey) {
    return { ok: false, lease: null };
  }

  const writtenLease = writeStorageJson(getLocalStorage(), storageKey, nextLease);
  const confirmedLease = readBoardRuntimeLease(nextLease.boardScopeId) || normalizeRuntimeLease(writtenLease);
  return {
    ok: !!(confirmedLease && confirmedLease.runtimeId === nextLease.runtimeId),
    lease: confirmedLease || null
  };
}

export function isBoardRuntimeLeaseFresh(boardScopeId, { maxAgeMs = PANEL_RUNTIME_LEASE_STALE_AFTER_MS } = {}) {
  const lease = readBoardRuntimeLease(boardScopeId);
  return isLeaseFresh(lease, { maxAgeMs });
}

export function isRuntimeLeaseOwner(boardScopeId, runtimeId, { maxAgeMs = PANEL_RUNTIME_LEASE_STALE_AFTER_MS } = {}) {
  const normalizedRuntimeId = normalizeRuntimeId(runtimeId);
  if (!normalizedRuntimeId) return false;

  const lease = readBoardRuntimeLease(boardScopeId);
  return !!(lease && lease.runtimeId === normalizedRuntimeId && isLeaseFresh(lease, { maxAgeMs }));
}

export function startPanelRuntimeLease({ boardScopeId = null, runtimeId = null, ownerType = "panel", claimedAtMs = 0 } = {}) {
  stopPanelRuntimeLease();

  const identity = {
    boardScopeId: normalizeBoardScopeId(boardScopeId),
    runtimeId: normalizeRuntimeId(runtimeId),
    ownerType: normalizeLeaseOwnerType(ownerType),
    claimedAtMs: normalizePositiveTimestampMs(claimedAtMs) || Date.now()
  };

  if (!identity.boardScopeId || !identity.runtimeId) return null;

  activeLeaseIdentity = identity;
  refreshPanelRuntimeLease(identity);

  leaseTimer = window.setInterval(() => {
    if (!activeLeaseIdentity) return;
    refreshPanelRuntimeLease(activeLeaseIdentity);
  }, PANEL_RUNTIME_LEASE_REFRESH_INTERVAL_MS);

  return { ...activeLeaseIdentity };
}

export function stopPanelRuntimeLease(identity = null) {
  if (leaseTimer) {
    window.clearInterval(leaseTimer);
    leaseTimer = null;
  }

  const target = (identity && typeof identity === "object") ? identity : activeLeaseIdentity;
  const boardScopeId = normalizeBoardScopeId(target?.boardScopeId);
  const runtimeId = normalizeRuntimeId(target?.runtimeId);

  if (boardScopeId && runtimeId) {
    const currentLease = readBoardRuntimeLease(boardScopeId);
    if (currentLease && currentLease.runtimeId === runtimeId) {
      removeStorageKey(getLocalStorage(), runtimeLeaseStorageKey(boardScopeId));
    }
  }

  activeLeaseIdentity = null;
}
