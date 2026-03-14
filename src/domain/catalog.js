import {
  TEMPLATE_ID,
  DT_CANVAS_DEFS,
  DT_SORTED_OUT_REGION_WIDTH_PX,
  DT_SORTED_OUT_BUFFER_WIDTH_PX,
  DT_SORTED_OUT_REGION_IDS,
  DT_SORTED_OUT_REGION_TITLES,
  DT_EXCLUDE_FOOTER_FROM_AGENT_CATALOG_DEFAULT,
  DT_CHECK_TAG_TITLE,
  normalizeStickyColorToken,
  STICKY_LAYOUT
} from "../config.js?v=20260314-patch12-cleanup6";
import {
  stripHtml,
  isFiniteNumber,
  buildInstanceSignatureFromClassification,
  computeInstanceDiffFromSignatures,
  diffHasChanges
} from "../utils.js?v=20260314-patch12-cleanup6";
import {
  computeTemplateGeometry,
  buildInstanceGeometryIndex,
  resolveBoardCoords,
  resolveBoardRect,
  findInstanceByPoint,
  findInstanceByRect
} from "../miro/board.js?v=20260314-patch12-cleanup6";

// --------------------------------------------------------------------
// Canvas Definitions / Region Mapping
// --------------------------------------------------------------------
export function getCanvasDef(canvasTypeId) {
  return DT_CANVAS_DEFS[canvasTypeId] || null;
}

function getSortedOutWidthNorm(canvasTypeId) {
  const def = getCanvasDef(canvasTypeId);
  const originalWidth = Number(def?.originalWidth);
  if (!Number.isFinite(originalWidth) || originalWidth <= 0) return 0;
  return DT_SORTED_OUT_REGION_WIDTH_PX / originalWidth;
}

function getSortedOutBufferWidthNorm(canvasTypeId) {
  const def = getCanvasDef(canvasTypeId);
  const originalWidth = Number(def?.originalWidth);
  if (!Number.isFinite(originalWidth) || originalWidth <= 0) return 0;
  return DT_SORTED_OUT_BUFFER_WIDTH_PX / originalWidth;
}

function getSortedOutOutsideOffsetNorm(canvasTypeId) {
  return getSortedOutWidthNorm(canvasTypeId) + getSortedOutBufferWidthNorm(canvasTypeId);
}

export function getSortedOutRegionDefs(canvasTypeId) {
  const widthNorm = getSortedOutWidthNorm(canvasTypeId);
  const bufferNorm = getSortedOutBufferWidthNorm(canvasTypeId);
  if (!(widthNorm > 0)) return [];

  return DT_SORTED_OUT_REGION_IDS.map((regionId) => {
    const isLeft = regionId === "sorted_out_left";
    const minX = isLeft ? -(bufferNorm + widthNorm) : 1 + bufferNorm;
    const maxX = isLeft ? -bufferNorm : 1 + bufferNorm + widthNorm;
    return {
      id: regionId,
      title: DT_SORTED_OUT_REGION_TITLES[regionId] || "Sorted out",
      semanticGroup: "sorted_out",
      polygonNorm: [
        [minX, 0],
        [maxX, 0],
        [maxX, 1],
        [minX, 1]
      ]
    };
  });
}

export function isSortedOutRegionId(regionId) {
  return DT_SORTED_OUT_REGION_IDS.includes(String(regionId || ""));
}

export function getBodyRegionDefs(canvasTypeId) {
  const def = getCanvasDef(canvasTypeId);
  const result = [];
  const seen = new Set();

  for (const region of def?.regionPolygons || []) {
    if (!region?.id || seen.has(region.id)) continue;
    seen.add(region.id);
    result.push({
      id: region.id,
      title: region.title || region.id,
      polygonNorm: Array.isArray(region.polygonNorm) ? region.polygonNorm : []
    });
  }

  for (const region of getSortedOutRegionDefs(canvasTypeId)) {
    if (!region?.id || seen.has(region.id)) continue;
    seen.add(region.id);
    result.push(region);
  }

  if (!result.length) {
    return [
      { id: "left", title: "Box 1 (links)" },
      { id: "middle", title: "Box 2 (Mitte)" },
      { id: "right", title: "Box 3 (rechts)" },
      ...getSortedOutRegionDefs(TEMPLATE_ID)
    ];
  }

  return result;
}

export function getHeaderRegionDef(canvasTypeId) {
  const def = getCanvasDef(canvasTypeId);
  const header = Array.isArray(def?.headerPolygons) ? def.headerPolygons[0] : null;
  if (header?.polygonNorm?.length) {
    return {
      id: "header",
      title: header.title || "Header",
      polygonNorm: header.polygonNorm
    };
  }

  return {
    id: "header",
    title: "Header",
    polygonNorm: [
      [0, 0],
      [1, 0],
      [1, 0.18],
      [0, 0.18]
    ]
  };
}

export function getHeaderRegionBoundsNorm(canvasTypeId) {
  const header = getHeaderRegionDef(canvasTypeId);
  return header?.polygonNorm?.length ? polygonBoundsNorm(header.polygonNorm) : null;
}

export function getHeaderRegionBoundsBoard(templateGeometry, canvasTypeId) {
  if (!templateGeometry) return null;
  const boundsNorm = getHeaderRegionBoundsNorm(canvasTypeId);
  if (!boundsNorm) return null;
  return normalizedRectToBoardRect(templateGeometry, {
    left: boundsNorm.minX,
    right: boundsNorm.maxX,
    top: boundsNorm.minY,
    bottom: boundsNorm.maxY
  });
}

export function pointInPolygonNorm(px, py, polygonNorm) {
  let inside = false;
  const n = polygonNorm.length;
  if (n < 3) return false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygonNorm[i][0];
    const yi = polygonNorm[i][1];
    const xj = polygonNorm[j][0];
    const yj = polygonNorm[j][1];

    const intersect =
      (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi) / ((yj - yi) || 1e-9)) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonBoundsNorm(polygonNorm) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of polygonNorm || []) {
    const x = pt[0];
    const y = pt[1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

function normalizeRectBounds(rect) {
  if (!rect) return null;
  const left = isFiniteNumber(rect.left) ? Number(rect.left) : (isFiniteNumber(rect.x) && isFiniteNumber(rect.width) ? Number(rect.x) - Number(rect.width) / 2 : null);
  const right = isFiniteNumber(rect.right) ? Number(rect.right) : (isFiniteNumber(rect.x) && isFiniteNumber(rect.width) ? Number(rect.x) + Number(rect.width) / 2 : null);
  const top = isFiniteNumber(rect.top) ? Number(rect.top) : (isFiniteNumber(rect.y) && isFiniteNumber(rect.height) ? Number(rect.y) - Number(rect.height) / 2 : null);
  const bottom = isFiniteNumber(rect.bottom) ? Number(rect.bottom) : (isFiniteNumber(rect.y) && isFiniteNumber(rect.height) ? Number(rect.y) + Number(rect.height) / 2 : null);
  if (!isFiniteNumber(left) || !isFiniteNumber(right) || !isFiniteNumber(top) || !isFiniteNumber(bottom)) return null;
  if (right <= left || bottom <= top) return null;
  return {
    left,
    right,
    top,
    bottom,
    x: isFiniteNumber(rect.x) ? Number(rect.x) : (left + right) / 2,
    y: isFiniteNumber(rect.y) ? Number(rect.y) : (top + bottom) / 2,
    width: isFiniteNumber(rect.width) ? Number(rect.width) : (right - left),
    height: isFiniteNumber(rect.height) ? Number(rect.height) : (bottom - top)
  };
}

function computeRectOverlapArea(a, b) {
  const ra = normalizeRectBounds(a);
  const rb = normalizeRectBounds(b);
  if (!ra || !rb) return 0;
  const overlapX = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
  const overlapY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
  if (overlapX <= 0 || overlapY <= 0) return 0;
  return overlapX * overlapY;
}

function normalizedRectToBoardRect(templateGeometry, normRect) {
  const left0 = templateGeometry.x - templateGeometry.width / 2;
  const top0 = templateGeometry.y - templateGeometry.height / 2;
  const left = left0 + normRect.left * templateGeometry.width;
  const right = left0 + normRect.right * templateGeometry.width;
  const top = top0 + normRect.top * templateGeometry.height;
  const bottom = top0 + normRect.bottom * templateGeometry.height;
  return {
    left,
    right,
    top,
    bottom,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top
  };
}

export function boardRectToNormalizedRect(boardRect, templateGeometry) {
  const rect = normalizeRectBounds(boardRect);
  if (!rect || !templateGeometry) return null;
  const left0 = templateGeometry.x - templateGeometry.width / 2;
  const top0 = templateGeometry.y - templateGeometry.height / 2;
  const left = (rect.left - left0) / templateGeometry.width;
  const right = (rect.right - left0) / templateGeometry.width;
  const top = (rect.top - top0) / templateGeometry.height;
  const bottom = (rect.bottom - top0) / templateGeometry.height;
  return {
    left,
    right,
    top,
    bottom,
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left,
    height: bottom - top
  };
}

export function shouldExcludeFooterFromAgentCatalog(canvasTypeId) {
  const def = getCanvasDef(canvasTypeId);
  if (typeof def?.excludeFooterFromAgentCatalog === "boolean") {
    return def.excludeFooterFromAgentCatalog;
  }
  return DT_EXCLUDE_FOOTER_FROM_AGENT_CATALOG_DEFAULT;
}

// Fallback (alte Logik)
function roleFromNormalizedY(py) {
  if (py < 0.20) return "header";
  if (py > 0.95) return "footer";
  return "body";
}

function mapToRegionFallback(px, py) {
  const yMin = 0.20;
  const yMax = 0.95;
  if (py < yMin || py > yMax) return null;
  if (px < 0 || px > 1) return null;

  const third = 1 / 3;
  if (px < third) return { id: "left", title: "Box 1 (links)" };
  if (px < 2 * third) return { id: "middle", title: "Box 2 (Mitte)" };
  return { id: "right", title: "Box 3 (rechts)" };
}

export function classifyNormalizedLocation(canvasTypeId, px, py, { includeFooter = true } = {}) {
  const def = getCanvasDef(canvasTypeId);
  if (!def) {
    const role = roleFromNormalizedY(py);
    let regionId = null;
    let regionTitle = null;
    if (role === "body") {
      const region = mapToRegionFallback(px, py);
      if (region) {
        regionId = region.id;
        regionTitle = region.title;
      }
    }
    return { role, regionId, regionTitle };
  }

  for (const region of getSortedOutRegionDefs(canvasTypeId)) {
    if (pointInPolygonNorm(px, py, region.polygonNorm)) {
      return { role: "body", regionId: region.id, regionTitle: region.title, semanticGroup: region.semanticGroup || null };
    }
  }

  if (Array.isArray(def.headerPolygons)) {
    for (const h of def.headerPolygons) {
      if (pointInPolygonNorm(px, py, h.polygonNorm)) {
        return { role: "header", regionId: null, regionTitle: h.title || "Header" };
      }
    }
  }

  if (includeFooter && Array.isArray(def.footerPolygons)) {
    for (const f of def.footerPolygons) {
      if (pointInPolygonNorm(px, py, f.polygonNorm)) {
        return { role: "footer", regionId: null, regionTitle: f.title || "Footer" };
      }
    }
  }

  if (Array.isArray(def.regionPolygons)) {
    for (const r of def.regionPolygons) {
      if (pointInPolygonNorm(px, py, r.polygonNorm)) {
        return { role: "body", regionId: r.id, regionTitle: r.title };
      }
    }
  }

  return { role: "body", regionId: null, regionTitle: null };
}

export function classifyBoardRectAgainstCanvas(canvasTypeId, boardRect, templateGeometry, { includeFooter = true } = {}) {
  const rect = boardRectToNormalizedRect(boardRect, templateGeometry);
  if (!rect) return null;

  let bestSortedOut = null;
  for (const region of getSortedOutRegionDefs(canvasTypeId)) {
    const bounds = polygonBoundsNorm(region.polygonNorm);
    if (!bounds) continue;
    const overlapArea = computeRectOverlapArea(
      rect,
      { left: bounds.minX, right: bounds.maxX, top: bounds.minY, bottom: bounds.maxY }
    );
    if (overlapArea <= 0) continue;
    if (!bestSortedOut || overlapArea > bestSortedOut.overlapArea) {
      bestSortedOut = {
        overlapArea,
        role: "body",
        regionId: region.id,
        regionTitle: region.title,
        semanticGroup: region.semanticGroup || null
      };
    }
  }
  if (bestSortedOut) return bestSortedOut;

  const centerX = rect.x;
  const centerY = rect.y;
  if (centerX < 0 || centerX > 1 || centerY < 0 || centerY > 1) {
    return null;
  }

  return classifyNormalizedLocation(canvasTypeId, centerX, centerY, { includeFooter });
}

function normalizeAreaLookupToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function areaNameToRegion(areaName, canvasTypeId = null) {
  if (!areaName) return null;

  const raw = String(areaName).trim();
  if (!raw) return null;

  const norm = normalizeAreaLookupToken(raw);
  const candidates = canvasTypeId
    ? [{ canvasTypeId, regions: getBodyRegionDefs(canvasTypeId) }]
    : Object.keys(DT_CANVAS_DEFS).map((id) => ({ canvasTypeId: id, regions: getBodyRegionDefs(id) }));

  for (const candidate of candidates) {
    const headerRegion = getHeaderRegionDef(candidate.canvasTypeId);
    if (headerRegion?.id) {
      const headerId = String(headerRegion.id || "").trim();
      const headerTitle = String(headerRegion.title || headerId).trim();
      const normalizedHeaderId = normalizeAreaLookupToken(headerId);
      const normalizedHeaderTitle = normalizeAreaLookupToken(headerTitle);
      if (norm === normalizedHeaderId || norm === normalizedHeaderTitle || norm.includes(normalizedHeaderTitle)) {
        return { id: headerId, title: headerTitle, canvasTypeId: candidate.canvasTypeId };
      }
    }

    for (const region of candidate.regions) {
      const regionId = String(region.id || "").trim();
      const regionTitle = String(region.title || regionId).trim();
      if (!regionId) continue;

      const normalizedId = normalizeAreaLookupToken(regionId);
      const normalizedTitle = normalizeAreaLookupToken(regionTitle);
      if (norm === normalizedId || norm === normalizedTitle || norm.includes(normalizedTitle)) {
        return { id: regionId, title: regionTitle, canvasTypeId: candidate.canvasTypeId };
      }
    }
  }

  if (norm.includes("box 1") || norm.includes("links")) return { id: "left", title: "Box 1 (links)", canvasTypeId: canvasTypeId || TEMPLATE_ID };
  if (norm.includes("box 2") || norm.includes("mitte")) return { id: "middle", title: "Box 2 (Mitte)", canvasTypeId: canvasTypeId || TEMPLATE_ID };
  if (norm.includes("box 3") || norm.includes("rechts")) return { id: "right", title: "Box 3 (rechts)", canvasTypeId: canvasTypeId || TEMPLATE_ID };
  if (norm.includes("sorted out") && norm.includes("left")) return { id: "sorted_out_left", title: DT_SORTED_OUT_REGION_TITLES.sorted_out_left, canvasTypeId: canvasTypeId || TEMPLATE_ID };
  if (norm.includes("sorted out") && norm.includes("right")) return { id: "sorted_out_right", title: DT_SORTED_OUT_REGION_TITLES.sorted_out_right, canvasTypeId: canvasTypeId || TEMPLATE_ID };

  return null;
}

export function normalizedToBoardCoords(templateGeometry, px, py) {
  const { x, y, width, height } = templateGeometry;
  const left = x - width / 2;
  const top = y - height / 2;
  return { x: left + px * width, y: top + py * height };
}

function areaCenterNormalizedFromDef(canvasTypeId, regionId) {
  const regions = getBodyRegionDefs(canvasTypeId);
  const region = regions.find((candidate) => candidate.id === regionId || candidate.title === regionId);
  if (!region?.polygonNorm?.length) return null;
  const bounds = polygonBoundsNorm(region.polygonNorm);
  if (!bounds) return null;
  return { px: (bounds.minX + bounds.maxX) / 2, py: (bounds.minY + bounds.maxY) / 2 };
}

export function areaCenterNormalized(regionId, canvasTypeId) {
  if (regionId && canvasTypeId) {
    const center = areaCenterNormalizedFromDef(canvasTypeId, regionId);
    if (center) return center;
  }

  const yMin = 0.20;
  const yMax = 0.95;
  const py = (yMin + yMax) / 2;

  if (regionId === "header") {
    const bounds = getHeaderRegionBoundsNorm(canvasTypeId);
    if (bounds) return { px: (bounds.minX + bounds.maxX) / 2, py: (bounds.minY + bounds.maxY) / 2 };
    return { px: 0.5, py: 0.09 };
  }
  if (regionId === "left") return { px: 1 / 6, py };
  if (regionId === "middle") return { px: 0.5, py };
  if (regionId === "right") return { px: 5 / 6, py };
  if (regionId === "sorted_out_left") return { px: -(getSortedOutBufferWidthNorm(canvasTypeId) + getSortedOutWidthNorm(canvasTypeId) / 2), py: 0.5 };
  if (regionId === "sorted_out_right") return { px: 1 + getSortedOutBufferWidthNorm(canvasTypeId) + getSortedOutWidthNorm(canvasTypeId) / 2, py: 0.5 };
  return { px: 0.5, py: 0.5 };
}

// --------------------------------------------------------------------
// Region Bounds + Sticky Auto-Layout (Grid mit Wrap, collision-aware)
// --------------------------------------------------------------------
export function getBodyRegionBoundsNorm(canvasTypeId, regionId) {
  const region = getBodyRegionDefs(canvasTypeId).find((candidate) => candidate.id === regionId);
  if (region?.polygonNorm?.length) {
    return polygonBoundsNorm(region.polygonNorm);
  }

  // Fallback: 3-Boxes Default (falls defs fehlen)
  const yMin = 0.18;
  const yMax = 0.95;

  if (regionId === "left") {
    return { minX: 0.0, maxX: 1.0 / 3.0, minY: yMin, maxY: yMax };
  }
  if (regionId === "middle") {
    return { minX: 1.0 / 3.0, maxX: 2.0 / 3.0, minY: yMin, maxY: yMax };
  }
  if (regionId === "right") {
    return { minX: 2.0 / 3.0, maxX: 1.0, minY: yMin, maxY: yMax };
  }

  return null;
}

export function getBodyRegionBoundsBoard(templateGeometry, canvasTypeId, regionId) {
  if (!templateGeometry) return null;

  const boundsNorm = getBodyRegionBoundsNorm(canvasTypeId, regionId);
  if (!boundsNorm) return null;

  return normalizedRectToBoardRect(templateGeometry, {
    left: boundsNorm.minX,
    right: boundsNorm.maxX,
    top: boundsNorm.minY,
    bottom: boundsNorm.maxY
  });
}

function rectsOverlap(a, b, padding = 0) {
  const ra = normalizeRectBounds(a);
  const rb = normalizeRectBounds(b);
  if (!ra || !rb) return false;

  const aL = ra.left - padding;
  const aR = ra.right + padding;
  const aT = ra.top - padding;
  const aB = ra.bottom + padding;

  return !(aR <= rb.left || aL >= rb.right || aB <= rb.top || aT >= rb.bottom);
}

function boardToNormalized(templateGeometry, x, y) {
  const left0 = templateGeometry.x - templateGeometry.width / 2;
  const top0 = templateGeometry.y - templateGeometry.height / 2;
  return {
    px: (x - left0) / templateGeometry.width,
    py: (y - top0) / templateGeometry.height
  };
}

function computeNextFreeStickyPositionInHeaderRegion({
  templateGeometry,
  canvasTypeId,
  stickyWidthPx,
  stickyHeightPx,
  marginPx = 20,
  gapPx = 20,
  occupiedRects = []
}) {
  const bounds = getHeaderRegionBoundsBoard(templateGeometry, canvasTypeId);
  if (!bounds) return null;

  const stickyWidth = Math.max(10, Number(stickyWidthPx) || STICKY_LAYOUT.defaultWidthPx);
  const stickyHeight = Math.max(10, Number(stickyHeightPx) || STICKY_LAYOUT.defaultHeightPx);

  const innerWidth = Math.max(1, bounds.width - 2 * marginPx);
  const innerHeight = Math.max(1, bounds.height - 2 * marginPx);
  const stepX = stickyWidth + gapPx;
  const stepY = stickyHeight + gapPx;

  const cols = Math.max(1, Math.floor((innerWidth - stickyWidth) / Math.max(1, stepX)) + 1);
  const rows = Math.max(1, Math.floor((innerHeight - stickyHeight) / Math.max(1, stepY)) + 1);

  const usedWidth = cols * stickyWidth + Math.max(0, cols - 1) * gapPx;
  const usedHeight = rows * stickyHeight + Math.max(0, rows - 1) * gapPx;
  const marginX = Math.max(marginPx, (bounds.width - usedWidth) / 2);
  const marginY = Math.max(marginPx, (bounds.height - usedHeight) / 2);

  function overlapsAny(candidate) {
    for (const rect of occupiedRects || []) {
      if (rectsOverlap(candidate, rect, 0)) return true;
    }
    return false;
  }

  function isInsideHeader(x, y) {
    const normalized = boardToNormalized(templateGeometry, x, y);
    const loc = classifyNormalizedLocation(canvasTypeId, normalized.px, normalized.py, { includeFooter: false });
    return loc?.role === "header";
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = bounds.left + marginX + stickyWidth / 2 + col * stepX;
      const y = bounds.top + marginY + stickyHeight / 2 + row * stepY;
      if (!isInsideHeader(x, y)) continue;
      const candidate = { x, y, width: stickyWidth, height: stickyHeight };
      if (!overlapsAny(candidate)) {
        return { x, y, col, row, cols, rows, isFull: false, bounds };
      }
    }
  }

  const lastCol = cols - 1;
  const lastRow = rows - 1;
  const x = bounds.left + marginX + stickyWidth / 2 + lastCol * stepX;
  const y = bounds.top + marginY + stickyHeight / 2 + lastRow * stepY;
  return { x, y, col: lastCol, row: lastRow, cols, rows, isFull: true, bounds };
}

function computeSingleSortedOutPosition({
  templateGeometry,
  canvasTypeId,
  regionId,
  stickyWidthPx,
  stickyHeightPx,
  gapPx = 20,
  occupiedRects = []
}) {
  const bounds = getBodyRegionBoundsBoard(templateGeometry, canvasTypeId, regionId);
  if (!bounds) return null;

  const stickyWidth = Math.max(10, Number(stickyWidthPx) || STICKY_LAYOUT.defaultWidthPx);
  const stickyHeight = Math.max(10, Number(stickyHeightPx) || STICKY_LAYOUT.defaultHeightPx);
  const x = regionId === "sorted_out_left"
    ? bounds.right - stickyWidth / 2
    : bounds.left + stickyWidth / 2;

  const top = templateGeometry.y - templateGeometry.height / 2;
  const bottom = templateGeometry.y + templateGeometry.height / 2;
  const stepY = stickyHeight + gapPx;
  const minY = top + stickyHeight / 2;
  const maxY = bottom - stickyHeight / 2;
  const rows = Math.max(1, Math.floor((maxY - minY) / Math.max(1, stepY)) + 1);

  for (let row = 0; row < rows; row++) {
    const y = minY + row * stepY;
    if (y > maxY + 0.0001) break;
    const candidate = { x, y, width: stickyWidth, height: stickyHeight };
    if (!(occupiedRects || []).some((rect) => rectsOverlap(candidate, rect, 0))) {
      return { x, y, row, rows, isFull: false, bounds };
    }
  }

  const fallbackRow = Math.max(0, rows - 1);
  return {
    x,
    y: Math.min(maxY, minY + fallbackRow * stepY),
    row: fallbackRow,
    rows,
    isFull: true,
    bounds
  };
}

function getSiblingSortedOutRegionId(regionId) {
  if (regionId === "sorted_out_left") return "sorted_out_right";
  if (regionId === "sorted_out_right") return "sorted_out_left";
  return null;
}

function computeNextFreeStickyPositionInSortedOutRegion({
  templateGeometry,
  canvasTypeId,
  regionId,
  stickyWidthPx,
  stickyHeightPx,
  gapPx = 20,
  occupiedRects = [],
  occupiedRectsByRegion = null
}) {
  const primary = computeSingleSortedOutPosition({
    templateGeometry,
    canvasTypeId,
    regionId,
    stickyWidthPx,
    stickyHeightPx,
    gapPx,
    occupiedRects
  });
  if (primary && !primary.isFull) {
    return {
      ...primary,
      requestedRegionId: regionId,
      resolvedRegionId: regionId,
      overflowed: false
    };
  }

  const siblingRegionId = getSiblingSortedOutRegionId(regionId);
  const siblingRects = siblingRegionId && occupiedRectsByRegion && Array.isArray(occupiedRectsByRegion[siblingRegionId])
    ? occupiedRectsByRegion[siblingRegionId]
    : [];
  const sibling = siblingRegionId
    ? computeSingleSortedOutPosition({
        templateGeometry,
        canvasTypeId,
        regionId: siblingRegionId,
        stickyWidthPx,
        stickyHeightPx,
        gapPx,
        occupiedRects: siblingRects
      })
    : null;

  if (sibling && !sibling.isFull) {
    return {
      ...sibling,
      requestedRegionId: regionId,
      resolvedRegionId: siblingRegionId,
      overflowed: true
    };
  }

  if (primary) {
    return {
      ...primary,
      requestedRegionId: regionId,
      resolvedRegionId: regionId,
      overflowed: false,
      bothSidesFull: !!(sibling && sibling.isFull)
    };
  }

  if (sibling) {
    return {
      ...sibling,
      requestedRegionId: regionId,
      resolvedRegionId: siblingRegionId,
      overflowed: true,
      bothSidesFull: sibling.isFull === true
    };
  }

  return null;
}

/**
 * Liefert die nächste freie Position in einer Body-Region,
 * füllt zeilenweise, wrappt, vermeidet Overlaps mit bestehenden Stickies.
 *
 * occupiedRects: [{x,y,width,height}, ...] in Board-Koordinaten
 */
export function computeNextFreeStickyPositionInBodyRegion({
  templateGeometry,
  canvasTypeId,
  regionId,
  stickyWidthPx,
  stickyHeightPx,
  marginPx = 20,
  gapPx = 20,
  occupiedRects = [],
  occupiedRectsByRegion = null
}) {
  if (regionId === "header") {
    return computeNextFreeStickyPositionInHeaderRegion({
      templateGeometry,
      canvasTypeId,
      stickyWidthPx,
      stickyHeightPx,
      marginPx,
      gapPx,
      occupiedRects
    });
  }

  if (isSortedOutRegionId(regionId)) {
    return computeNextFreeStickyPositionInSortedOutRegion({
      templateGeometry,
      canvasTypeId,
      regionId,
      stickyWidthPx,
      stickyHeightPx,
      gapPx,
      occupiedRects,
      occupiedRectsByRegion
    });
  }

  const bounds = getBodyRegionBoundsBoard(templateGeometry, canvasTypeId, regionId);
  if (!bounds) return null;

  const stickyWidth = Math.max(10, Number(stickyWidthPx) || STICKY_LAYOUT.defaultWidthPx);
  const stickyHeight = Math.max(10, Number(stickyHeightPx) || STICKY_LAYOUT.defaultHeightPx);

  const innerWidth = Math.max(1, bounds.width - 2 * marginPx);
  const innerHeight = Math.max(1, bounds.height - 2 * marginPx);

  const stepX = stickyWidth + gapPx;
  const stepY = stickyHeight + gapPx;

  const cols = Math.max(1, Math.floor((innerWidth - stickyWidth) / Math.max(1, stepX)) + 1);
  const rows = Math.max(1, Math.floor((innerHeight - stickyHeight) / Math.max(1, stepY)) + 1);

  const usedWidth = cols * stickyWidth + Math.max(0, cols - 1) * gapPx;
  const usedHeight = rows * stickyHeight + Math.max(0, rows - 1) * gapPx;

  const marginX = Math.max(marginPx, (bounds.width - usedWidth) / 2);
  const marginY = Math.max(marginPx, (bounds.height - usedHeight) / 2);

  function overlapsAny(candidate) {
    for (const rect of occupiedRects || []) {
      if (rectsOverlap(candidate, rect, 0)) return true;
    }
    return false;
  }

  function isInsideRegionByClassification(x, y) {
    const normalized = boardToNormalized(templateGeometry, x, y);
    const loc = classifyNormalizedLocation(canvasTypeId, normalized.px, normalized.py, { includeFooter: false });
    return loc?.role === "body" && loc?.regionId === regionId;
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = bounds.left + marginX + stickyWidth / 2 + col * stepX;
      const y = bounds.top + marginY + stickyHeight / 2 + row * stepY;

      if (!isInsideRegionByClassification(x, y)) continue;

      const candidate = { x, y, width: stickyWidth, height: stickyHeight };
      if (!overlapsAny(candidate)) {
        return { x, y, col, row, cols, rows, isFull: false, bounds };
      }
    }
  }

  const lastCol = cols - 1;
  const lastRow = rows - 1;
  const x = bounds.left + marginX + stickyWidth / 2 + lastCol * stepX;
  const y = bounds.top + marginY + stickyHeight / 2 + lastRow * stepY;

  return { x, y, col: lastCol, row: lastRow, cols, rows, isFull: true, bounds };
}

function connectorHasVisibleArrow(cap) {
  if (typeof cap !== "string") return false;
  return cap.trim().toLowerCase() !== "none";
}

function isConnectorDirected(connector) {
  if (!connector || typeof connector !== "object") return true;
  return connectorHasVisibleArrow(connector?.style?.endStrokeCap) || connectorHasVisibleArrow(connector?.style?.startStrokeCap);
}

function deriveCheckedState(tagIds, tagsById, boardConfig) {
  const ids = Array.isArray(tagIds) ? tagIds : [];
  const checkTagId = typeof boardConfig?.systemTagIds?.check === "string" ? boardConfig.systemTagIds.check : null;
  if (checkTagId && ids.includes(checkTagId)) return true;
  return ids.some((tagId) => String(tagsById?.[tagId] || "").trim() === DT_CHECK_TAG_TITLE);
}

function countAgentRelevantStickies(liveInst, canvasTypeId) {
  const excludeFooter = shouldExcludeFooterFromAgentCatalog(canvasTypeId);
  let count = liveInst?.regions?.header?.stickies?.length || 0;
  if (!excludeFooter) {
    count += liveInst?.regions?.footer?.stickies?.length || 0;
  }
  for (const bucket of Object.values(liveInst?.regions?.body || {})) {
    count += bucket?.stickies?.length || 0;
  }
  return count;
}

// --------------------------------------------------------------------
// Live Catalog
// --------------------------------------------------------------------
export async function rebuildLiveCatalog({ ctx, instancesById, clusterAssignments, boardConfig = null, log }) {
  const liveCatalog = {
    canvasTypes: Object.create(null),
    instances: Object.create(null),
    unassignedStickies: [],
    lastFullRebuildAt: new Date().toISOString()
  };

  const stickyOwnerCache = new Map();

  const geomEntries = await buildInstanceGeometryIndex(instancesById, log);
  const instGeom = new Map();
  for (const entry of geomEntries) {
    if (entry?.geom) instGeom.set(entry.inst.instanceId, entry.geom);
  }

  function ensureLiveInstance(inst) {
    let live = liveCatalog.instances[inst.instanceId];
    if (!live) {
      live = {
        instanceId: inst.instanceId,
        instanceLabel: inst.instanceLabel || null,
        canvasTypeId: inst.canvasTypeId,
        canvasTypeLabel: inst.canvasTypeLabel || inst.title || inst.canvasTypeId || TEMPLATE_ID,
        imageId: inst.imageId,
        geometry: instGeom.get(inst.instanceId) || null,
        regions: {
          header: { stickies: [] },
          footer: { stickies: [] },
          body: (() => {
            const body = Object.create(null);
            for (const region of getBodyRegionDefs(inst.canvasTypeId)) {
              body[region.id] = {
                id: region.id,
                title: region.title || region.id,
                semanticGroup: region.semanticGroup || null,
                stickies: []
              };
            }
            body.none = { id: null, title: null, semanticGroup: null, stickies: [] };
            return body;
          })()
        },
        allStickies: [],
        connections: [],
        meta: {
          stickyCount: 0,
          totalStickyCount: 0,
          footerStickyCount: 0,
          connectorCount: 0,
          lastUpdated: null
        }
      };

      liveCatalog.instances[inst.instanceId] = live;

      const ctId = inst.canvasTypeId || TEMPLATE_ID;
      if (!liveCatalog.canvasTypes[ctId]) {
        liveCatalog.canvasTypes[ctId] = { canvasTypeId: ctId, instances: Object.create(null) };
      }
      liveCatalog.canvasTypes[ctId].instances[inst.instanceId] = live;
    }
    return live;
  }

  for (const inst of instancesById.values()) ensureLiveInstance(inst);

  const parentGeomCache = new Map();

  for (const sticky of (ctx?.stickies || [])) {
    const boardRect = await resolveBoardRect(sticky, parentGeomCache, log).catch(() => null);
    const boardPos = boardRect || await resolveBoardCoords(sticky, parentGeomCache, log).catch(() => null);
    if (!boardRect && !boardPos) {
      liveCatalog.unassignedStickies.push(sticky.id);
      continue;
    }

    const owningInst = boardRect
      ? (findInstanceByRect(boardRect, geomEntries) || findInstanceByPoint(boardRect.x, boardRect.y, geomEntries))
      : findInstanceByPoint(boardPos.x, boardPos.y, geomEntries);
    if (!owningInst) {
      liveCatalog.unassignedStickies.push(sticky.id);
      continue;
    }

    const geom = instGeom.get(owningInst.instanceId);
    if (!geom) {
      liveCatalog.unassignedStickies.push(sticky.id);
      continue;
    }

    const loc = boardRect
      ? classifyBoardRectAgainstCanvas(owningInst.canvasTypeId, boardRect, geom, { includeFooter: true })
      : (() => {
          const left = geom.x - geom.width / 2;
          const top = geom.y - geom.height / 2;
          const px = (boardPos.x - left) / geom.width;
          const py = (boardPos.y - top) / geom.height;
          if (px < 0 || px > 1 || py < 0 || py > 1) return null;
          return classifyNormalizedLocation(owningInst.canvasTypeId, px, py, { includeFooter: true });
        })();

    if (!loc) {
      liveCatalog.unassignedStickies.push(sticky.id);
      continue;
    }

    const centerX = boardRect?.x ?? boardPos?.x ?? sticky.x;
    const centerY = boardRect?.y ?? boardPos?.y ?? sticky.y;
    const normalizedCenter = boardToNormalized(geom, centerX, centerY);
    const rawColor = (sticky.style && (sticky.style.fillColor || sticky.style.backgroundColor)) || null;
    const color = normalizeStickyColorToken(rawColor) || rawColor || null;
    const tagIds = Array.isArray(sticky.tagIds) ? sticky.tagIds : [];
    const tags = tagIds.map((tagId) => ctx.tagsById?.[tagId]).filter(Boolean);
    const clusterName = clusterAssignments?.get(sticky.id) || null;
    const checked = deriveCheckedState(tagIds, ctx.tagsById || {}, boardConfig);

    const stickObj = {
      id: sticky.id,
      text: stripHtml(sticky.content),
      x: centerX,
      y: centerY,
      width: isFiniteNumber(sticky.width) ? sticky.width : STICKY_LAYOUT.defaultWidthPx,
      height: isFiniteNumber(sticky.height) ? sticky.height : STICKY_LAYOUT.defaultHeightPx,
      px: Math.round(normalizedCenter.px * 10000) / 10000,
      py: Math.round(normalizedCenter.py * 10000) / 10000,
      role: loc.role,
      regionId: loc.regionId || null,
      regionTitle: loc.regionTitle || null,
      semanticGroup: loc.semanticGroup || null,
      color,
      tags,
      checked,
      clusterName,
      connectionsOut: [],
      connectionsIn: []
    };

    const liveInst = ensureLiveInstance(owningInst);

    if (stickObj.role === "header") {
      liveInst.regions.header.stickies.push(stickObj);
    } else if (stickObj.role === "footer") {
      liveInst.regions.footer.stickies.push(stickObj);
    } else {
      const key = (stickObj.regionId && liveInst.regions.body[stickObj.regionId]) ? stickObj.regionId : "none";
      if (!liveInst.regions.body[key]) {
        liveInst.regions.body[key] = {
          id: key === "none" ? null : key,
          title: stickObj.regionTitle || null,
          semanticGroup: stickObj.semanticGroup || null,
          stickies: []
        };
      }
      liveInst.regions.body[key].stickies.push(stickObj);
    }

    liveInst.allStickies.push(stickObj);
    stickyOwnerCache.set(sticky.id, owningInst.instanceId);
  }

  for (const connector of (ctx?.connectors || [])) {
    const fromId = connector.start?.item;
    const toId = connector.end?.item;
    if (!fromId || !toId) continue;

    const instFrom = stickyOwnerCache.get(fromId);
    const instTo = stickyOwnerCache.get(toId);
    if (!instFrom || instFrom !== instTo) continue;

    const liveInst = liveCatalog.instances[instFrom];
    if (!liveInst) continue;

    liveInst.connections.push({
      connectorId: connector.id,
      fromStickyId: fromId,
      toStickyId: toId,
      directed: isConnectorDirected(connector)
    });
  }

  for (const liveInst of Object.values(liveCatalog.instances)) {
    liveInst.meta.totalStickyCount = liveInst.allStickies.length;
    liveInst.meta.footerStickyCount = liveInst.regions.footer.stickies.length;
    liveInst.meta.stickyCount = countAgentRelevantStickies(liveInst, liveInst.canvasTypeId);
    liveInst.meta.connectorCount = liveInst.connections.length;
    liveInst.meta.lastUpdated = liveCatalog.lastFullRebuildAt;
  }

  for (const inst of instancesById.values()) {
    const liveInst = liveCatalog.instances[inst.instanceId];
    inst.lastStickyCount = liveInst?.meta?.stickyCount || 0;
  }

  return { liveCatalog, stickyOwnerCache };
}

// --------------------------------------------------------------------
// Classification
// --------------------------------------------------------------------
export function buildClassificationFromLiveInstance(instance, liveInst) {
  const excludeFooter = shouldExcludeFooterFromAgentCatalog(instance.canvasTypeId);
  const items = [];
  const headerStickies = [];
  const footerStickies = [];

  function mapTags(tags) {
    return Array.isArray(tags)
      ? tags.map((title) => ({ id: null, title }))
      : [];
  }

  for (const sticky of liveInst.regions.header.stickies) {
    items.push({
      stickyId: sticky.id,
      text: sticky.text,
      role: "header",
      regionId: null,
      regionTitle: "Header",
      color: sticky.color,
      tags: mapTags(sticky.tags),
      checked: sticky.checked === true,
      clusterName: sticky.clusterName,
      connectionsOut: [],
      connectionsIn: []
    });

    headerStickies.push({
      stickyId: sticky.id,
      text: sticky.text,
      px: sticky.px,
      py: sticky.py,
      color: sticky.color,
      checked: sticky.checked === true,
      tagIds: [],
      tags: mapTags(sticky.tags)
    });
  }

  function addBodyRegion(regionId, regionTitle, list) {
    for (const sticky of list || []) {
      items.push({
        stickyId: sticky.id,
        text: sticky.text,
        role: "body",
        regionId,
        regionTitle,
        color: sticky.color,
        tags: mapTags(sticky.tags),
        checked: sticky.checked === true,
        clusterName: sticky.clusterName,
        connectionsOut: [],
        connectionsIn: []
      });
    }
  }

  for (const region of getBodyRegionDefs(instance.canvasTypeId)) {
    const bucket = liveInst.regions.body?.[region.id];
    addBodyRegion(region.id, region.title, bucket?.stickies || []);
  }
  addBodyRegion(null, null, liveInst.regions.body?.none?.stickies || []);

  for (const sticky of liveInst.regions.footer.stickies) {
    const footerItem = {
      stickyId: sticky.id,
      text: sticky.text,
      role: "footer",
      regionId: null,
      regionTitle: "Footer",
      color: sticky.color,
      tags: mapTags(sticky.tags),
      checked: sticky.checked === true,
      clusterName: sticky.clusterName,
      connectionsOut: [],
      connectionsIn: []
    };
    footerStickies.push(footerItem);
    if (!excludeFooter) {
      items.push(footerItem);
    }
  }

  const idToItem = Object.create(null);
  for (const item of items) {
    if (item?.stickyId) idToItem[item.stickyId] = item;
  }

  const connections = [];
  for (const connection of (liveInst.connections || [])) {
    const fromItem = idToItem[connection.fromStickyId];
    const toItem = idToItem[connection.toStickyId];
    if (!fromItem || !toItem) continue;

    connections.push({
      connectorId: connection.connectorId,
      fromStickyId: connection.fromStickyId,
      toStickyId: connection.toStickyId,
      directed: connection.directed !== false
    });

    fromItem.connectionsOut.push({
      connectorId: connection.connectorId,
      toStickyId: connection.toStickyId,
      directed: connection.directed !== false
    });
    toItem.connectionsIn.push({
      connectorId: connection.connectorId,
      fromStickyId: connection.fromStickyId,
      directed: connection.directed !== false
    });
  }

  const counts = { total: items.length, byRegion: {} };
  for (const item of items) {
    if (item.role === "body" && item.regionId) {
      counts.byRegion[item.regionId] = (counts.byRegion[item.regionId] || 0) + 1;
    }
  }

  const headerSummaryRaw = headerStickies.map((sticky) => sticky.text).filter(Boolean).join(" | ");
  const headerSummary = headerSummaryRaw
    ? (headerSummaryRaw.length > 200 ? headerSummaryRaw.slice(0, 197) + "..." : headerSummaryRaw)
    : null;

  return {
    template: {
      id: instance.canvasTypeId,
      name: instance.canvasTypeLabel || instance.title || "Datentreiber 3-Boxes",
      canvasTypeId: instance.canvasTypeId,
      canvasTypeLabel: instance.canvasTypeLabel || instance.title || "Datentreiber 3-Boxes",
      instanceLabel: instance.instanceLabel || null,
      imageId: instance.imageId,
      headerSummary,
      footerExcludedFromAgentCatalog: excludeFooter === true
    },
    header: { stickies: headerStickies },
    footer: { stickies: footerStickies },
    counts,
    items,
    connections
  };
}

export function buildClassificationForAllInstances(instancesById, liveCatalog) {
  const results = [];

  for (const inst of instancesById.values()) {
    const liveInst = liveCatalog.instances?.[inst.instanceId];
    if (!liveInst) continue;
    results.push(buildClassificationFromLiveInstance(inst, liveInst));
  }

  if (!results.length) return null;
  return (results.length === 1) ? results[0] : { templates: results };
}

// --------------------------------------------------------------------
// Aliases + Prompt Payload
// --------------------------------------------------------------------
export function createAliasState() {
  return {
    nextStickyAliasIndex: 1,
    sticky: Object.create(null),
    stickyReverse: Object.create(null)
  };
}

export function resolveStickyId(stickyIdOrAlias, aliasState) {
  if (!stickyIdOrAlias) return null;
  if (aliasState?.sticky?.[stickyIdOrAlias]) return aliasState.sticky[stickyIdOrAlias];
  return stickyIdOrAlias;
}

export function aliasDiffForActiveInstance(diff, aliasState) {
  if (!diff) return null;
  if (!aliasState?.stickyReverse) return diff;

  const reverse = aliasState.stickyReverse;
  const aliasId = (id) => (id ? (reverse[id] || id) : id);

  return {
    created: (diff.created || []).map((entry) => ({ ...entry, stickyId: aliasId(entry.stickyId) })),
    deleted: (diff.deleted || []).map((entry) => ({ ...entry, stickyId: aliasId(entry.stickyId) })),
    updated: (diff.updated || []).map((entry) => ({ stickyId: aliasId(entry.stickyId), before: entry.before, after: entry.after })),
    connectorsCreated: (diff.connectorsCreated || []).map((entry) => ({ fromStickyId: aliasId(entry.fromStickyId), toStickyId: aliasId(entry.toStickyId) })),
    connectorsDeleted: (diff.connectorsDeleted || []).map((entry) => ({ fromStickyId: aliasId(entry.fromStickyId), toStickyId: aliasId(entry.toStickyId) }))
  };
}

export function buildPromptPayloadFromClassification(classification, { useAliases = false, aliasState = null, log } = {}) {
  if (!classification) return null;

  if (useAliases && !aliasState) {
    aliasState = createAliasState();
    if (typeof log === "function") log("WARNUNG: buildPromptPayloadFromClassification(useAliases=true) ohne aliasState – es wurde ein lokaler AliasState erzeugt.");
  }

  const perTemplate = (Array.isArray(classification.templates) && classification.templates.length)
    ? classification.templates
    : [classification];

  function getOrCreateStickyAlias(stickyId) {
    if (!useAliases || !stickyId) return null;
    const existing = aliasState.stickyReverse[stickyId];
    if (existing) return existing;
    const alias = "S" + String(aliasState.nextStickyAliasIndex++).padStart(4, "0");
    aliasState.sticky[alias] = stickyId;
    aliasState.stickyReverse[stickyId] = alias;
    return alias;
  }

  function transformOne(one) {
    const idToItem = Object.create(null);
    for (const item of Array.isArray(one.items) ? one.items : []) {
      if (item?.stickyId) idToItem[item.stickyId] = item;
    }

    const canvasTypeId = one.template?.canvasTypeId || one.template?.id || null;
    const headerRegion = getHeaderRegionDef(canvasTypeId);
    const orderedBodyRegions = getBodyRegionDefs(canvasTypeId);
    const orderedPromptAreas = [headerRegion, ...orderedBodyRegions].filter((region) => region?.id);
    const knownAreaIds = new Set(orderedPromptAreas.map((region) => region.id).filter(Boolean));

    function resolveAreaKey(item) {
      if (!item) return null;
      if (item.role === "header") return "header";
      if (item.role === "footer") return "footer";

      const directRegionId = typeof item.regionId === "string" ? item.regionId.trim() : null;
      if (directRegionId && knownAreaIds.has(directRegionId)) return directRegionId;

      const mappedRegion = areaNameToRegion(item.regionTitle, canvasTypeId);
      const mappedRegionId = typeof mappedRegion?.id === "string" ? mappedRegion.id.trim() : null;
      if (mappedRegionId && knownAreaIds.has(mappedRegionId)) return mappedRegionId;
      return null;
    }

    function resolveAreaTitle(item) {
      if (!item) return null;
      if (item.role === "header") return "Header";
      if (item.role === "footer") return "Footer";
      if (typeof item.regionTitle === "string" && item.regionTitle.trim()) return item.regionTitle.trim();
      const mappedRegion = areaNameToRegion(item.regionId || item.regionTitle, canvasTypeId);
      return mappedRegion?.title || null;
    }

    function buildConnectionsOut(item) {
      const result = [];
      for (const connection of item?.connectionsOut || []) {
        const target = connection?.toStickyId ? idToItem[connection.toStickyId] : null;
        result.push({
          connectorId: connection.connectorId,
          toId: target?.stickyId ? getOrCreateStickyAlias(target.stickyId) : null,
          toText: target ? target.text : null,
          toArea: resolveAreaKey(target),
          toAreaTitle: resolveAreaTitle(target),
          directed: connection.directed !== false
        });
      }
      return result;
    }

    function buildConnectionsIn(item) {
      const result = [];
      for (const connection of item?.connectionsIn || []) {
        const source = connection?.fromStickyId ? idToItem[connection.fromStickyId] : null;
        result.push({
          connectorId: connection.connectorId,
          fromId: source?.stickyId ? getOrCreateStickyAlias(source.stickyId) : null,
          fromText: source ? source.text : null,
          fromArea: resolveAreaKey(source),
          fromAreaTitle: resolveAreaTitle(source),
          directed: connection.directed !== false
        });
      }
      return result;
    }

    const headerStickiesRaw = one.header?.stickies || [];
    const header = {
      summary: one.template?.headerSummary,
      stickies: headerStickiesRaw.map((sticky) => {
        const item = sticky.stickyId ? idToItem[sticky.stickyId] : null;
        const tagObjs = Array.isArray(item?.tags) ? item.tags : (Array.isArray(sticky.tags) ? sticky.tags : []);
        const tags = tagObjs.map((tag) => tag?.title).filter(Boolean);
        return {
          id: item?.stickyId ? getOrCreateStickyAlias(item.stickyId) : null,
          text: sticky.text,
          color: item?.color || sticky.color || null,
          checked: item?.checked === true,
          tags,
          clusterName: item?.clusterName || null,
          connectionsOut: buildConnectionsOut(item),
          connectionsIn: buildConnectionsIn(item)
        };
      })
    };

    const areasByName = Object.create(null);
    for (const region of orderedPromptAreas) {
      if (!region?.id) continue;
      areasByName[region.id] = { name: region.id, title: region.title || region.id, stickies: [] };
    }

    if (areasByName.header) {
      areasByName.header.stickies = header.stickies.slice();
    }

    for (const item of Array.isArray(one.items) ? one.items : []) {
      if (!item || item.role !== "body") continue;
      const areaKey = resolveAreaKey(item);
      if (!areaKey || !areasByName[areaKey]) continue;
      const tags = Array.isArray(item.tags) ? item.tags.map((tag) => tag?.title).filter(Boolean) : [];
      areasByName[areaKey].stickies.push({
        id: getOrCreateStickyAlias(item.stickyId),
        text: item.text,
        color: item.color || null,
        checked: item.checked === true,
        tags,
        clusterName: item.clusterName || null,
        connectionsOut: buildConnectionsOut(item),
        connectionsIn: buildConnectionsIn(item)
      });
    }

    const connectionsSummary = Array.isArray(one.connections)
      ? one.connections.map((connection) => {
          const fromItem = connection.fromStickyId ? idToItem[connection.fromStickyId] : null;
          const toItem = connection.toStickyId ? idToItem[connection.toStickyId] : null;
          return {
            connectorId: connection.connectorId,
            fromId: fromItem?.stickyId ? getOrCreateStickyAlias(fromItem.stickyId) : null,
            fromText: fromItem ? fromItem.text : null,
            fromArea: resolveAreaKey(fromItem),
            fromAreaTitle: resolveAreaTitle(fromItem),
            toId: toItem?.stickyId ? getOrCreateStickyAlias(toItem.stickyId) : null,
            toText: toItem ? toItem.text : null,
            toArea: resolveAreaKey(toItem),
            toAreaTitle: resolveAreaTitle(toItem),
            directed: connection.directed !== false
          };
        })
      : [];

    return {
      instanceLabel: one.template?.instanceLabel || null,
      canvasTypeId,
      canvasTypeLabel: one.template?.canvasTypeLabel || one.template?.name || null,
      template: {
        name: one.template?.name,
        headerSummary: one.template?.headerSummary,
        instanceLabel: one.template?.instanceLabel || null,
        canvasTypeId,
        canvasTypeLabel: one.template?.canvasTypeLabel || one.template?.name || null,
        footerExcludedFromAgentCatalog: one.template?.footerExcludedFromAgentCatalog === true
      },
      header,
      areas: orderedPromptAreas.map((region) => areasByName[region.id] || { name: region.id, title: region.title || region.id, stickies: [] }),
      connections: connectionsSummary
    };
  }

  return { templates: perTemplate.map(transformOne) };
}

// --------------------------------------------------------------------
// Instance state for Agent (Classification + Signature + Diff) + Cache update
// --------------------------------------------------------------------
export async function computeInstanceState(instance, {
  liveCatalog,
  hasGlobalBaseline,
  loadBaselineSignatureForImageId,
  log
}) {
  if (!instance) return null;

  const liveInst = liveCatalog.instances?.[instance.instanceId];
  if (!liveInst) {
    if (typeof log === "function") log("computeInstanceState: Keine Live-Daten für Instanz " + instance.instanceId);
    return null;
  }

  const classification = buildClassificationFromLiveInstance(instance, liveInst);
  const signature = buildInstanceSignatureFromClassification(instance, classification);

  instance.lastSignature = signature;
  instance.lastStateHash = signature?.stateHash || null;

  if (hasGlobalBaseline && instance.imageId && !instance.baselineSignatureLoaded && typeof loadBaselineSignatureForImageId === "function") {
    instance.baselineSignature = await loadBaselineSignatureForImageId(instance.imageId, log);
    instance.baselineSignatureLoaded = true;
  }

  const diff = hasGlobalBaseline
    ? computeInstanceDiffFromSignatures(instance.baselineSignature || null, signature || null)
    : null;

  const payloadNoAlias = buildPromptPayloadFromClassification(classification, { useAliases: false });
  const stateJson = JSON.stringify(payloadNoAlias, null, 2);

  instance.lastClassification = classification;
  instance.lastStateJson = stateJson;
  instance.lastStickyCount = liveInst?.meta?.stickyCount || 0;
  instance.lastDiff = diff;
  instance.liveCatalog = liveInst;

  return { classification, signature, diff, promptPayload: payloadNoAlias, stateJson };
}

// --------------------------------------------------------------------
// Board Catalog Summary (für Agent Payloads)
// --------------------------------------------------------------------
export function buildBoardCatalogSummary(instancesById, {
  mode = "generic",
  activeInstanceId = null,
  hasGlobalBaseline = false
} = {}) {
  const instances = [];

  for (const [id, inst] of instancesById.entries()) {
    const diff = inst.lastDiff;
    const hasChanges = diffHasChanges(diff);

    let changesSummary = null;
    if (hasChanges && diff) {
      const shouldSummarize = !(mode === "global" && !hasGlobalBaseline);
      if (shouldSummarize) {
        changesSummary = {
          createdCount: diff.created?.length || 0,
          deletedCount: diff.deleted?.length || 0,
          updatedCount: diff.updated?.length || 0,
          connectorsCreatedCount: diff.connectorsCreated?.length || 0,
          connectorsDeletedCount: diff.connectorsDeleted?.length || 0
        };
      }
    }

    const headerSummary = inst.lastClassification?.template?.headerSummary || null;

    let isActive;
    if (mode === "global") {
      isActive = !hasGlobalBaseline ? true : hasChanges;
    } else {
      isActive = (id === activeInstanceId) || hasChanges;
    }

    instances.push({
      instanceLabel: inst.instanceLabel || null,
      canvasTypeId: inst.canvasTypeId,
      canvasTypeLabel: inst.canvasTypeLabel || inst.title || inst.canvasTypeId || TEMPLATE_ID,
      lastStickyCount: inst.lastStickyCount || 0,
      headerSummary,
      isActive,
      changesSinceLastAgent: changesSummary
    });
  }

  return { instances };
}
