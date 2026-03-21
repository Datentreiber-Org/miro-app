import {
  DT_CHECK_TAG_TITLE,
  normalizeStickyColorToken
} from "../config.js?v=20260316-patch20-data-monetization-pack";

import {
  stripHtml,
  isFiniteNumber
} from "../utils.js?v=20260316-patch20-data-monetization-pack";

import { ensureMiroReady } from "./sdk.js?v=20260316-patch20-data-monetization-pack";
import { getItems, resolveBoardRect } from "./items.js?v=20260316-patch20-data-monetization-pack";
import { readChatInterfaceMeta } from "./chat-interface.js?v=20260316-patch20-data-monetization-pack";
import { readFlowControlMeta } from "./flow-controls.js?v=20260316-patch20-data-monetization-pack";
import { isBoardAnchorItem } from "./storage.js?v=20260316-patch20-data-monetization-pack";

const MAX_ITEMS_PER_FRAME = 250;
const MAX_TEXT_LENGTH = 4000;

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeLookupKey(value) {
  const normalized = asNonEmptyString(value);
  return normalized ? normalized.toLocaleLowerCase() : null;
}

function clipText(text, maxLength = MAX_TEXT_LENGTH) {
  const normalized = asNonEmptyString(text);
  if (!normalized) return null;
  const limit = Number.isFinite(Number(maxLength)) ? Math.max(1, Number(maxLength)) : MAX_TEXT_LENGTH;
  return normalized.length > limit ? normalized.slice(0, limit - 1) + "…" : normalized;
}

function normalizeReadableText(value) {
  if (value == null) return null;
  return clipText(stripHtml(String(value)));
}

function appendUniqueTextPart(parts, rawValue, { label = null } = {}) {
  const text = normalizeReadableText(rawValue);
  if (!text) return;
  const rendered = label ? `${label}: ${text}` : text;
  if (!parts.includes(rendered)) parts.push(rendered);
}

function buildTagsById(tags) {
  const tagsById = Object.create(null);
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (!tag?.id) continue;
    const title = asNonEmptyString(tag?.title)
      || asNonEmptyString(tag?.text)
      || normalizeReadableText(tag?.content)
      || null;
    if (title) tagsById[String(tag.id)] = title;
  }
  return tagsById;
}

function makeLocalId(prefix, index) {
  return `${prefix}_${index}`;
}

function compareNumbersAsc(a, b) {
  const left = isFiniteNumber(a) ? Number(a) : Number.POSITIVE_INFINITY;
  const right = isFiniteNumber(b) ? Number(b) : Number.POSITIVE_INFINITY;
  return left - right;
}

function compareStringsAsc(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });
}

function compareRectEntries(a, b) {
  return (
    compareNumbersAsc(a?.rect?.top, b?.rect?.top)
    || compareNumbersAsc(a?.rect?.left, b?.rect?.left)
    || compareNumbersAsc(a?.rect?.y, b?.rect?.y)
    || compareNumbersAsc(a?.rect?.x, b?.rect?.x)
    || compareStringsAsc(a?.item?.id, b?.item?.id)
  );
}

function connectorHasVisibleArrow(cap) {
  const normalized = asNonEmptyString(cap);
  return !!normalized && normalized !== "none";
}

function isConnectorDirected(connector) {
  if (!connector || typeof connector !== "object") return true;
  return connectorHasVisibleArrow(connector?.style?.endStrokeCap) || connectorHasVisibleArrow(connector?.style?.startStrokeCap);
}

export function normalizeSourceFrameNames(values) {
  const src = Array.isArray(values) ? values : [];
  const seen = new Set();
  const out = [];

  for (const rawValue of src) {
    const value = asNonEmptyString(rawValue);
    const key = normalizeLookupKey(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }

  return out;
}

export function parseSourceFrameNamesInput(rawText) {
  if (typeof rawText !== "string") return [];
  return normalizeSourceFrameNames(rawText.split(/[\n,;]+/g));
}

export function formatSourceFrameNamesInput(frameNames) {
  return normalizeSourceFrameNames(frameNames).join("\n");
}

export function createEmptySourceFramesPayload({ configuredFrameNames = [] } = {}) {
  const normalizedConfigured = normalizeSourceFrameNames(configuredFrameNames);
  return {
    enabled: normalizedConfigured.length > 0,
    configuredFrameNames: normalizedConfigured,
    matchedFrameNames: [],
    unresolvedFrameNames: normalizedConfigured.length ? normalizedConfigured.slice() : [],
    frames: []
  };
}

function extractFrameName(frame) {
  return asNonEmptyString(frame?.title)
    || asNonEmptyString(frame?.name)
    || asNonEmptyString(frame?.text)
    || normalizeReadableText(frame?.content)
    || null;
}

function extractStickyText(item) {
  return normalizeReadableText(item?.content)
    || normalizeReadableText(item?.text)
    || normalizeReadableText(item?.title)
    || null;
}

function extractTextItemText(item) {
  return normalizeReadableText(item?.content)
    || normalizeReadableText(item?.text)
    || normalizeReadableText(item?.title)
    || null;
}

function extractShapeText(item) {
  return normalizeReadableText(item?.content)
    || normalizeReadableText(item?.text)
    || normalizeReadableText(item?.title)
    || null;
}

function extractCardText(item) {
  const parts = [];
  appendUniqueTextPart(parts, item?.title);
  appendUniqueTextPart(parts, item?.text);
  appendUniqueTextPart(parts, item?.description);
  appendUniqueTextPart(parts, item?.content);

  if (Array.isArray(item?.fields)) {
    for (const field of item.fields) {
      const label = asNonEmptyString(field?.title) || asNonEmptyString(field?.label) || asNonEmptyString(field?.name) || null;
      const value = field?.value ?? field?.text ?? field?.content ?? null;
      appendUniqueTextPart(parts, value, { label });
    }
  }

  return parts.length ? clipText(parts.join("\n")) : null;
}

function buildStickyPayload(item, tagsById) {
  const text = extractStickyText(item);
  if (!text) return null;

  const tagTitles = Array.isArray(item?.tagIds)
    ? item.tagIds
        .map((tagId) => tagsById?.[String(tagId)] || null)
        .filter(Boolean)
    : [];
  const checked = tagTitles.includes(DT_CHECK_TAG_TITLE);
  const rawColor = item?.style?.fillColor || item?.style?.backgroundColor || null;
  const color = normalizeStickyColorToken(rawColor) || asNonEmptyString(rawColor) || null;

  return {
    type: "sticky_note",
    text,
    color,
    checked,
    tags: tagTitles
  };
}

function buildTextPayload(item) {
  const text = extractTextItemText(item);
  return text ? { type: "text", text } : null;
}

function buildShapePayload(item) {
  const text = extractShapeText(item);
  if (!text) return null;
  return {
    type: "shape",
    shape: asNonEmptyString(item?.shape) || asNonEmptyString(item?.style?.shape) || null,
    text
  };
}

function buildCardPayload(item) {
  const text = extractCardText(item);
  if (!text) return null;
  return {
    type: "card",
    title: asNonEmptyString(item?.title) || null,
    text
  };
}

function createFrameCounts() {
  return {
    usableItems: 0,
    stickyNotes: 0,
    textItems: 0,
    shapesWithText: 0,
    cardsWithText: 0,
    connectors: 0,
    skippedInternalAppItems: 0,
    skippedEmptyItems: 0,
    truncatedItems: 0
  };
}

function relationKey(relation) {
  return [relation?.fromLocalId, relation?.toLocalId, relation?.directed === true ? "1" : "0"].join("|");
}

async function safeGetItemsByType(type, log) {
  try {
    const items = await getItems({ type }, log);
    return Array.isArray(items) ? items : [];
  } catch (error) {
    if (typeof log === "function") {
      log("Hinweis: Board-Items vom Typ '" + String(type) + "' konnten nicht geladen werden: " + (error?.message || String(error)));
    }
    return [];
  }
}

async function sortItemsByResolvedRect(items, parentGeomCache, log) {
  const entries = [];
  for (const item of Array.isArray(items) ? items : []) {
    const rect = await resolveBoardRect(item, parentGeomCache, log);
    entries.push({ item, rect });
  }
  entries.sort(compareRectEntries);
  return entries;
}

function rectFullyContains(containerRect, itemRect) {
  if (!containerRect || !itemRect) return false;
  return (
    itemRect.left >= containerRect.left &&
    itemRect.right <= containerRect.right &&
    itemRect.top >= containerRect.top &&
    itemRect.bottom <= containerRect.bottom
  );
}

async function collectContainedItemEntries(frame, items, parentGeomCache, log) {
  const frameRect = await resolveBoardRect(frame, parentGeomCache, log);
  if (!frameRect) return [];

  const sortedEntries = await sortItemsByResolvedRect(items, parentGeomCache, log);
  return sortedEntries.filter(({ item, rect }) => {
    if (!item?.id || item.id === frame.id) return false;
    if (item?.parentId && String(item.parentId) === String(frame.id)) return true;
    return rectFullyContains(frameRect, rect);
  });
}

async function isInternalAppArtifact(item, log) {
  if (!item || item.type !== "shape") return false;
  if (await readChatInterfaceMeta(item, log)) return true;
  if (await readFlowControlMeta(item, log)) return true;
  if (await isBoardAnchorItem(item, log)) return true;
  return false;
}

async function serializeFrame(frame, datasets, parentGeomCache, log, frameIndex) {
  const frameName = extractFrameName(frame) || `Frame ${frameIndex}`;
  const counts = createFrameCounts();
  const items = [];
  const boardIdToLocalId = new Map();
  const containedEntries = await collectContainedItemEntries(frame, datasets.nonConnectorItems, parentGeomCache, log);

  let nextItemIndex = 1;
  for (const entry of containedEntries) {
    const item = entry?.item || null;
    if (!item?.id) continue;

    if (items.length >= MAX_ITEMS_PER_FRAME) {
      counts.truncatedItems += 1;
      continue;
    }

    if (await isInternalAppArtifact(item, log)) {
      counts.skippedInternalAppItems += 1;
      continue;
    }

    let payload = null;
    if (item.type === "sticky_note") {
      payload = buildStickyPayload(item, datasets.tagsById);
      if (payload) counts.stickyNotes += 1;
    } else if (item.type === "text") {
      payload = buildTextPayload(item);
      if (payload) counts.textItems += 1;
    } else if (item.type === "shape") {
      payload = buildShapePayload(item);
      if (payload) counts.shapesWithText += 1;
    } else if (item.type === "card") {
      payload = buildCardPayload(item);
      if (payload) counts.cardsWithText += 1;
    }

    if (!payload) {
      counts.skippedEmptyItems += 1;
      continue;
    }

    const localId = makeLocalId("sf", nextItemIndex++);
    boardIdToLocalId.set(String(item.id), localId);
    items.push({ localId, ...payload });
  }

  const relationSet = new Set();
  const relations = [];
  for (const connector of datasets.connectors) {
    const fromLocalId = boardIdToLocalId.get(String(connector?.start?.item || ""));
    const toLocalId = boardIdToLocalId.get(String(connector?.end?.item || ""));
    if (!fromLocalId || !toLocalId || fromLocalId === toLocalId) continue;

    const relation = {
      fromLocalId,
      toLocalId,
      directed: isConnectorDirected(connector)
    };
    const key = relationKey(relation);
    if (relationSet.has(key)) continue;
    relationSet.add(key);
    relations.push(relation);
  }

  counts.usableItems = items.length;
  counts.connectors = relations.length;

  return {
    frameLocalId: makeLocalId("frame", frameIndex),
    frameName,
    counts,
    items,
    relations
  };
}

export async function resolvePromptSourceFramesByName(frameNames, { log } = {}) {
  const configuredFrameNames = normalizeSourceFrameNames(frameNames);
  if (!configuredFrameNames.length) return createEmptySourceFramesPayload();

  await ensureMiroReady(log);

  const [frames, stickyNotes, textItems, shapes, cards, connectors, tags] = await Promise.all([
    safeGetItemsByType("frame", log),
    safeGetItemsByType("sticky_note", log),
    safeGetItemsByType("text", log),
    safeGetItemsByType("shape", log),
    safeGetItemsByType("card", log),
    safeGetItemsByType("connector", log),
    safeGetItemsByType("tag", log)
  ]);

  const frameIndexByName = new Map();
  for (const frame of frames) {
    if (!frame?.id) continue;
    const frameName = extractFrameName(frame);
    const lookupKey = normalizeLookupKey(frameName);
    if (!lookupKey) continue;
    const bucket = frameIndexByName.get(lookupKey) || [];
    bucket.push(frame);
    frameIndexByName.set(lookupKey, bucket);
  }

  const parentGeomCache = new Map();
  const matchedFrames = [];
  const unresolvedFrameNames = [];
  const seenFrameIds = new Set();

  for (const configuredFrameName of configuredFrameNames) {
    const matches = frameIndexByName.get(normalizeLookupKey(configuredFrameName)) || [];
    if (!matches.length) {
      unresolvedFrameNames.push(configuredFrameName);
      continue;
    }

    const sortedMatches = await sortItemsByResolvedRect(matches, parentGeomCache, log);
    for (const entry of sortedMatches) {
      const frame = entry?.item || null;
      const frameId = frame?.id ? String(frame.id) : null;
      if (!frameId || seenFrameIds.has(frameId)) continue;
      seenFrameIds.add(frameId);
      matchedFrames.push(frame);
    }
  }

  const datasets = {
    tagsById: buildTagsById(tags),
    connectors: Array.isArray(connectors) ? connectors : [],
    nonConnectorItems: [
      ...(Array.isArray(stickyNotes) ? stickyNotes : []),
      ...(Array.isArray(textItems) ? textItems : []),
      ...(Array.isArray(shapes) ? shapes : []),
      ...(Array.isArray(cards) ? cards : [])
    ]
  };

  const framesPayload = [];
  let nextFrameIndex = 1;
  for (const frame of matchedFrames) {
    const payload = await serializeFrame(frame, datasets, parentGeomCache, log, nextFrameIndex);
    framesPayload.push(payload);
    nextFrameIndex += 1;
  }

  return {
    enabled: true,
    configuredFrameNames,
    matchedFrameNames: Array.from(new Set(framesPayload.map((frame) => frame.frameName).filter(Boolean))),
    unresolvedFrameNames,
    frames: framesPayload
  };
}
