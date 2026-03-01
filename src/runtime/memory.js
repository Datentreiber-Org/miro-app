function asTrimmedString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUniqueStringArray(values) {
  if (!Array.isArray(values)) return [];

  const result = [];
  const seen = new Set();

  for (const value of values) {
    const text = asTrimmedString(typeof value === "string" ? value : null);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }

  return result;
}

function normalizeActionStats(rawActionStats) {
  const src = (rawActionStats && typeof rawActionStats === "object") ? rawActionStats : {};

  function intOrZero(key) {
    const n = Number(src[key]);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  }

  return {
    createdStickyCount: intOrZero("createdStickyCount"),
    movedStickyCount: intOrZero("movedStickyCount"),
    deletedStickyCount: intOrZero("deletedStickyCount"),
    createdConnectorCount: intOrZero("createdConnectorCount"),
    failedActionCount: intOrZero("failedActionCount"),
    skippedActionCount: intOrZero("skippedActionCount"),
    infoCount: intOrZero("infoCount"),
    targetedInstanceCount: intOrZero("targetedInstanceCount"),
    executedMutationCount: intOrZero("executedMutationCount"),
    plannedMutationCount: intOrZero("plannedMutationCount")
  };
}

function normalizeWorkSteps(rawWorkSteps) {
  if (!Array.isArray(rawWorkSteps)) return [];

  const result = [];
  const seen = new Set();

  for (const entry of rawWorkSteps) {
    if (entry === null || entry === undefined) continue;

    let instanceLabel = null;
    let text = null;

    if (typeof entry === "string") {
      text = asTrimmedString(entry);
    } else if (typeof entry === "object") {
      instanceLabel = asTrimmedString(entry.instanceLabel);
      text = asTrimmedString(entry.text) || asTrimmedString(entry.summary) || asTrimmedString(entry.description);
    }

    if (!text) continue;

    const dedupeKey = (instanceLabel || "") + "\n" + text;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    result.push({
      instanceLabel: instanceLabel || null,
      text
    });
  }

  return result;
}

function mergeStringState(currentValues, addedValues, removedValues) {
  const removed = new Set(normalizeUniqueStringArray(removedValues));
  const next = [];
  const seen = new Set();

  for (const value of normalizeUniqueStringArray(currentValues)) {
    if (removed.has(value) || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }

  for (const value of normalizeUniqueStringArray(addedValues)) {
    if (removed.has(value) || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
  }

  return next;
}

export function createEmptyMemoryState() {
  return {
    version: 1,
    activeDecisions: [],
    openIssues: [],
    nextFocus: null,
    stepStatus: null,
    lastSummary: null,
    lastUpdatedAt: null
  };
}

export function normalizeMemoryEntry(rawEntry, { fallbackSummary = null } = {}) {
  const entry = (rawEntry && typeof rawEntry === "object") ? rawEntry : {};

  return {
    version: 1,
    summary: asTrimmedString(entry.summary) || asTrimmedString(entry.lastSummary) || asTrimmedString(fallbackSummary),
    workSteps: normalizeWorkSteps(entry.workSteps),
    decisionsAdded: normalizeUniqueStringArray(entry.decisionsAdded),
    decisionsRemoved: normalizeUniqueStringArray(entry.decisionsRemoved),
    openIssuesAdded: normalizeUniqueStringArray(entry.openIssuesAdded),
    openIssuesResolved: normalizeUniqueStringArray(entry.openIssuesResolved),
    nextFocus: asTrimmedString(entry.nextFocus),
    stepStatus: asTrimmedString(entry.stepStatus)
  };
}

export function normalizeMemoryState(rawState) {
  const src = (rawState && typeof rawState === "object") ? rawState : {};

  return {
    version: 1,
    activeDecisions: normalizeUniqueStringArray(src.activeDecisions),
    openIssues: normalizeUniqueStringArray(src.openIssues),
    nextFocus: asTrimmedString(src.nextFocus),
    stepStatus: asTrimmedString(src.stepStatus),
    lastSummary: asTrimmedString(src.lastSummary),
    lastUpdatedAt: asTrimmedString(src.lastUpdatedAt)
  };
}

export function mergeMemoryEntryIntoState(prevState, memoryEntry, { timestamp = null } = {}) {
  const prev = normalizeMemoryState(prevState || createEmptyMemoryState());
  const entry = normalizeMemoryEntry(memoryEntry);

  return {
    version: 1,
    activeDecisions: mergeStringState(prev.activeDecisions, entry.decisionsAdded, entry.decisionsRemoved),
    openIssues: mergeStringState(prev.openIssues, entry.openIssuesAdded, entry.openIssuesResolved),
    nextFocus: entry.nextFocus || prev.nextFocus || null,
    stepStatus: entry.stepStatus || prev.stepStatus || null,
    lastSummary: entry.summary || prev.lastSummary || null,
    lastUpdatedAt: asTrimmedString(timestamp) || new Date().toISOString()
  };
}

export function normalizeStoredMemoryLogEntry(rawEntry) {
  const src = (rawEntry && typeof rawEntry === "object") ? rawEntry : {};
  const normalizedEntry = normalizeMemoryEntry(src);

  return {
    version: 1,
    entryId: asTrimmedString(src.entryId),
    ts: asTrimmedString(src.ts),
    runMode: asTrimmedString(src.runMode),
    trigger: asTrimmedString(src.trigger),
    targetInstanceLabels: normalizeUniqueStringArray(src.targetInstanceLabels),
    userRequest: asTrimmedString(src.userRequest),
    summary: normalizedEntry.summary,
    workSteps: normalizedEntry.workSteps,
    decisionsAdded: normalizedEntry.decisionsAdded,
    decisionsRemoved: normalizedEntry.decisionsRemoved,
    openIssuesAdded: normalizedEntry.openIssuesAdded,
    openIssuesResolved: normalizedEntry.openIssuesResolved,
    nextFocus: normalizedEntry.nextFocus,
    stepStatus: normalizedEntry.stepStatus,
    actionStats: normalizeActionStats(src.actionStats)
  };
}

export function buildStoredMemoryLogEntry(memoryEntry, runContext, actionStats, { timestamp = null } = {}) {
  const entry = normalizeMemoryEntry(memoryEntry);
  const ctx = (runContext && typeof runContext === "object") ? runContext : {};

  return normalizeStoredMemoryLogEntry({
    version: 1,
    ts: asTrimmedString(timestamp) || new Date().toISOString(),
    runMode: asTrimmedString(ctx.runMode),
    trigger: asTrimmedString(ctx.trigger),
    targetInstanceLabels: Array.isArray(ctx.targetInstanceLabels) ? ctx.targetInstanceLabels : [],
    userRequest: asTrimmedString(ctx.userRequest),
    summary: entry.summary,
    workSteps: entry.workSteps,
    decisionsAdded: entry.decisionsAdded,
    decisionsRemoved: entry.decisionsRemoved,
    openIssuesAdded: entry.openIssuesAdded,
    openIssuesResolved: entry.openIssuesResolved,
    nextFocus: entry.nextFocus,
    stepStatus: entry.stepStatus,
    actionStats: normalizeActionStats(actionStats)
  });
}

export function normalizeMemoryLog(rawLog) {
  if (!Array.isArray(rawLog)) return [];

  const normalized = rawLog
    .map((entry) => normalizeStoredMemoryLogEntry(entry))
    .filter((entry) => entry.summary || entry.workSteps.length || entry.decisionsAdded.length || entry.openIssuesAdded.length || entry.decisionsRemoved.length || entry.openIssuesResolved.length || entry.entryId || entry.ts);

  normalized.sort((a, b) => {
    const aTs = a.ts || "";
    const bTs = b.ts || "";
    if (aTs !== bTs) return aTs.localeCompare(bTs);
    return String(a.entryId || "").localeCompare(String(b.entryId || ""));
  });

  return normalized;
}

export function getRecentMemoryEntries(memoryLog, limit = 12) {
  const normalized = normalizeMemoryLog(memoryLog);
  const n = Number(limit);
  if (!Number.isInteger(n) || n <= 0) return normalized;
  return normalized.slice(Math.max(0, normalized.length - n));
}
