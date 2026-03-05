// --------------------------------------------------------------------
// Shared pure helpers for Miro board modules
// --------------------------------------------------------------------
export function compareItemIdsAsc(a, b) {
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export function normalizePositiveInt(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function getCanvasTypeConfig(templateCatalog, canvasTypeId, defaultTemplateId = null) {
  if (canvasTypeId && templateCatalog?.[canvasTypeId]) return templateCatalog[canvasTypeId];
  if (defaultTemplateId && templateCatalog?.[defaultTemplateId]) return templateCatalog[defaultTemplateId];
  const first = Object.values(templateCatalog || {})[0];
  return first || null;
}

export function getCanvasTypeDisplayName(templateCatalog, canvasTypeId, defaultTemplateId = null) {
  const cfg = getCanvasTypeConfig(templateCatalog, canvasTypeId, defaultTemplateId);
  const raw = cfg?.agentLabelPrefix || cfg?.displayName || canvasTypeId || defaultTemplateId || "Canvas";
  return String(raw || "Canvas").trim() || "Canvas";
}

export function formatInstanceLabel(templateCatalog, canvasTypeId, serial, defaultTemplateId = null) {
  return getCanvasTypeDisplayName(templateCatalog, canvasTypeId, defaultTemplateId) + " #" + String(serial);
}

export function buildInternalInstanceIdFromImageId(imageId) {
  return "img:" + String(imageId);
}

export function uniqueIds(ids) {
  return Array.from(new Set((ids || []).filter(Boolean)));
}

export function asTrimmedString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
