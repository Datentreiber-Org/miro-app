// --------------------------------------------------------------------
// Logging
// --------------------------------------------------------------------
export function createLogger(logEl) {
  return function log(msg) {
    if (!logEl) return;
    const text = (typeof msg === "string") ? msg : JSON.stringify(msg, null, 2);
    logEl.textContent = (logEl.textContent ? logEl.textContent + "\n\n" : "") + text;
    logEl.scrollTop = logEl.scrollHeight;
  };
}

// --------------------------------------------------------------------
// DOM/Text Helpers
// --------------------------------------------------------------------
export function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

export function extractUnderlinedText(html) {
  if (!html) return null;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const u = tmp.querySelector("u");
  if (!u) return null;
  const txt = (u.textContent || "").trim();
  return txt || null;
}

// --------------------------------------------------------------------
// Numerics
// --------------------------------------------------------------------
export function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// --------------------------------------------------------------------
// Hashing / Signature / Diff (für Change-Tracking)
// --------------------------------------------------------------------
function fnv1a32(str, seed) {
  let h = (typeof seed === "number") ? (seed >>> 0) : 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hex8(n) {
  const s = (n >>> 0).toString(16);
  return ("00000000" + s).slice(-8);
}

function fnv1aHex(str, seed) {
  return hex8(fnv1a32(str, seed));
}

function normalizeTagsForSignature(tags) {
  if (!Array.isArray(tags)) return "";
  const titles = tags
    .map((t) => {
      if (!t) return "";
      if (typeof t === "string") return t;
      if (typeof t.title === "string") return t.title;
      return "";
    })
    .filter(Boolean)
    .sort();
  return titles.join("|");
}

// Stabiler Area-Key für Change-Tracking:
// - Bewegung innerhalb derselben Region zählt NICHT (px/py ignoriert)
// - Wechsel der Region zählt (regionId / role)
function areaKeyFromItem(item) {
  if (!item) return "unknown";
  if (item.role === "header") return "header";
  if (item.role === "footer") return "footer";
  if (item.role === "body") return "body:" + (item.regionId || "none");
  return "unknown";
}

export function buildInstanceSignatureFromClassification(instance, classification) {
  const nowIso = new Date().toISOString();

  const stickyHashes = {};
  const stickyIds = [];

  if (classification && Array.isArray(classification.items)) {
    for (const item of classification.items) {
      if (!item || !item.stickyId) continue;

      const areaKey = areaKeyFromItem(item);
      const text = (typeof item.text === "string") ? item.text : "";
      const color = item.color ? String(item.color) : "";
      const tagsNorm = normalizeTagsForSignature(item.tags);

      const stickyBase = areaKey + "\n" + color + "\n" + tagsNorm + "\n" + text;
      const stickyHash = fnv1aHex(stickyBase);

      stickyHashes[item.stickyId] = stickyHash;
      stickyIds.push(item.stickyId);
    }
  }

  stickyIds.sort();

  const connectorPairs = [];
  if (classification && Array.isArray(classification.connections)) {
    for (const c of classification.connections) {
      if (!c || !c.fromStickyId || !c.toStickyId) continue;
      connectorPairs.push(String(c.fromStickyId) + "->" + String(c.toStickyId));
    }
  }
  connectorPairs.sort();

  let h = 2166136261;
  for (const id of stickyIds) {
    h = fnv1a32(id, h);
    h = fnv1a32(stickyHashes[id] || "", h);
  }
  for (const p of connectorPairs) {
    h = fnv1a32(p, h);
  }

  return {
    version: 1,
    canvasTypeId: instance?.canvasTypeId ?? classification?.template?.id ?? null,
    imageId: instance?.imageId ?? classification?.template?.imageId ?? null,
    computedAt: nowIso,
    stateHash: hex8(h),
    stickyHashes,
    connectorPairs
  };
}

export function computeInstanceDiffFromSignatures(prevSig, newSig) {
  const diff = {
    created: [],
    deleted: [],
    updated: [],
    connectorsCreated: [],
    connectorsDeleted: []
  };

  const prevSticky = (prevSig?.stickyHashes) ? prevSig.stickyHashes : Object.create(null);
  const newSticky  = (newSig?.stickyHashes)  ? newSig.stickyHashes  : Object.create(null);

  const prevIds = Object.keys(prevSticky);
  const newIds  = Object.keys(newSticky);

  const prevSet = Object.create(null);
  const newSet  = Object.create(null);
  for (const id of prevIds) prevSet[id] = true;
  for (const id of newIds)  newSet[id] = true;

  for (const id of newIds) if (!prevSet[id]) diff.created.push({ stickyId: id });
  for (const id of prevIds) if (!newSet[id]) diff.deleted.push({ stickyId: id });

  for (const id of newIds) {
    if (prevSet[id] && prevSticky[id] !== newSticky[id]) {
      diff.updated.push({ stickyId: id });
    }
  }

  const prevPairs = Array.isArray(prevSig?.connectorPairs) ? prevSig.connectorPairs : [];
  const newPairs  = Array.isArray(newSig?.connectorPairs)  ? newSig.connectorPairs  : [];

  const prevPairSet = new Set(prevPairs);
  const newPairSet  = new Set(newPairs);

  for (const p of newPairSet) {
    if (!prevPairSet.has(p)) {
      const parts = String(p).split("->");
      diff.connectorsCreated.push({ fromStickyId: parts[0] || null, toStickyId: parts[1] || null });
    }
  }
  for (const p of prevPairSet) {
    if (!newPairSet.has(p)) {
      const parts = String(p).split("->");
      diff.connectorsDeleted.push({ fromStickyId: parts[0] || null, toStickyId: parts[1] || null });
    }
  }

  return diff;
}

export function diffHasChanges(diff) {
  if (!diff) return false;

  const createdCount = Array.isArray(diff.created) ? diff.created.length : 0;
  const deletedCount = Array.isArray(diff.deleted) ? diff.deleted.length : 0;
  const updatedCount = Array.isArray(diff.updated) ? diff.updated.length : 0;

  const connectorsCreatedCount = Array.isArray(diff.connectorsCreated) ? diff.connectorsCreated.length : 0;
  const connectorsDeletedCount = Array.isArray(diff.connectorsDeleted) ? diff.connectorsDeleted.length : 0;

  return (
    createdCount > 0 ||
    deletedCount > 0 ||
    updatedCount > 0 ||
    connectorsCreatedCount > 0 ||
    connectorsDeletedCount > 0
  );
}
