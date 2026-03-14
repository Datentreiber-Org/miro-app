import {
  DT_SORTED_OUT_REGION_WIDTH_PX,
  DT_SORTED_OUT_BUFFER_WIDTH_PX
} from "../config.js?v=20260315-patch13-submit-proposals-fix1";

function getCanvasDef(canvasTypeId, { canvasDefs, defaultTemplateId }) {
  return canvasDefs?.[canvasTypeId] || canvasDefs?.[defaultTemplateId] || null;
}

function resolveCanvasTypeEntry(canvasTypeId, getCanvasTypeEntryFn) {
  return typeof getCanvasTypeEntryFn === "function" ? (getCanvasTypeEntryFn(canvasTypeId) || null) : null;
}

export function estimateTemplateSize(canvasTypeId, widthPx, { getCanvasTypeEntry, canvasDefs, defaultTemplateId }) {
  const entry = resolveCanvasTypeEntry(canvasTypeId, getCanvasTypeEntry);
  const def = getCanvasDef(canvasTypeId, { canvasDefs, defaultTemplateId });

  const requestedWidth = Number(widthPx) || Number(entry?.assetWidthPx) || Number(entry?.insertWidthPx) || Number(def?.originalWidth) || 0;
  const assetWidth = Number(entry?.assetWidthPx) || requestedWidth;
  const assetHeight = Number(entry?.assetHeightPx) || 0;
  const fallbackHeight = Number(def?.originalHeight) || 0;
  const fallbackWidth = Number(def?.originalWidth) || 0;

  if (requestedWidth > 0 && assetWidth > 0 && assetHeight > 0) {
    return {
      width: requestedWidth,
      height: requestedWidth * (assetHeight / assetWidth)
    };
  }

  if (requestedWidth > 0 && fallbackWidth > 0 && fallbackHeight > 0) {
    return {
      width: requestedWidth,
      height: requestedWidth * (fallbackHeight / fallbackWidth)
    };
  }

  return {
    width: requestedWidth > 0 ? requestedWidth : 0,
    height: requestedWidth > 0 ? requestedWidth : 0
  };
}

export function getInsertWidthPxForCanvasType(canvasTypeId, { getCanvasTypeEntry, fallbackWidthPx }) {
  const entry = resolveCanvasTypeEntry(canvasTypeId, getCanvasTypeEntry);
  const configuredWidth = Number(entry?.assetWidthPx) || Number(entry?.insertWidthPx) || 0;
  return configuredWidth > 0 ? configuredWidth : fallbackWidthPx;
}

export function estimateTemplateChromeMarginPx(canvasTypeId, imageWidthPx, { canvasDefs, defaultTemplateId }) {
  const def = getCanvasDef(canvasTypeId, { canvasDefs, defaultTemplateId });
  const mapWidth = Number(def?.originalWidth) || 0;
  const boardImageWidth = Number(imageWidthPx) || 0;
  if (!(mapWidth > 0) || !(boardImageWidth > 0)) return 0;
  const logicalChromePx = DT_SORTED_OUT_REGION_WIDTH_PX + DT_SORTED_OUT_BUFFER_WIDTH_PX;
  return boardImageWidth * (logicalChromePx / mapWidth);
}

export function estimateTemplateFootprint(canvasTypeId, widthPx, { getCanvasTypeEntry, canvasDefs, defaultTemplateId }) {
  const image = estimateTemplateSize(canvasTypeId, widthPx, { getCanvasTypeEntry, canvasDefs, defaultTemplateId });
  const chromeMarginPx = estimateTemplateChromeMarginPx(canvasTypeId, image.width, { canvasDefs, defaultTemplateId });
  return {
    imageWidth: image.width,
    imageHeight: image.height,
    chromeMarginPx,
    width: image.width + 2 * chromeMarginPx,
    height: image.height + 2 * chromeMarginPx
  };
}

function rectsOverlapByCenter(a, b, padding = 0) {
  if (!a || !b) return false;

  const dx = Math.abs((a.x || 0) - (b.x || 0));
  const dy = Math.abs((a.y || 0) - (b.y || 0));
  const limitX = ((a.width || 0) + (b.width || 0)) / 2 + padding;
  const limitY = ((a.height || 0) + (b.height || 0)) / 2 + padding;

  return dx < limitX && dy < limitY;
}

function buildInsertionCandidates(centerX, centerY, stepX, stepY, maxRings) {
  const candidates = [];
  const seen = new Set();

  function pushCandidate(gridX, gridY) {
    const x = centerX + (gridX * stepX);
    const y = centerY + (gridY * stepY);
    const key = String(gridX) + ":" + String(gridY);
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ x, y, gridX, gridY });
  }

  pushCandidate(0, 0);

  for (let ring = 1; ring <= maxRings; ring++) {
    for (let gx = -ring; gx <= ring; gx++) {
      pushCandidate(gx, -ring);
      pushCandidate(gx, ring);
    }
    for (let gy = -ring + 1; gy <= ring - 1; gy++) {
      pushCandidate(-ring, gy);
      pushCandidate(ring, gy);
    }
  }

  return candidates;
}

async function getOccupiedTemplateFootprints(instances, {
  computeTemplateGeometry,
  estimateChromeMarginPx,
  log
}) {
  const occupied = [];

  for (const inst of instances || []) {
    const geom = await computeTemplateGeometry(inst, log);
    if (!geom) continue;

    const chromeMarginPx = Math.max(0, Number(estimateChromeMarginPx?.(inst?.canvasTypeId, geom.width) || 0));
    occupied.push({
      instanceId: inst.instanceId,
      x: geom.x,
      y: geom.y,
      width: geom.width + 2 * chromeMarginPx,
      height: geom.height + 2 * chromeMarginPx
    });
  }

  return occupied;
}

export async function computeTemplateInsertPosition({
  canvasTypeId,
  insertWidthPx,
  ensureInstancesScanned,
  getViewport,
  instances,
  computeTemplateGeometry,
  templateInsertion,
  getCanvasTypeEntry,
  canvasDefs,
  defaultTemplateId,
  isFiniteNumber,
  log
}) {
  await ensureInstancesScanned(true);

  const viewport = await getViewport();
  const viewportCenterX = viewport && isFiniteNumber(viewport.x) && isFiniteNumber(viewport.width)
    ? viewport.x + viewport.width / 2
    : 0;
  const viewportCenterY = viewport && isFiniteNumber(viewport.y) && isFiniteNumber(viewport.height)
    ? viewport.y + viewport.height / 2
    : 0;

  const footprint = estimateTemplateFootprint(canvasTypeId, insertWidthPx, {
    getCanvasTypeEntry,
    canvasDefs,
    defaultTemplateId
  });

  const occupied = await getOccupiedTemplateFootprints(instances, {
    computeTemplateGeometry,
    estimateChromeMarginPx: (candidateCanvasTypeId, imageWidth) => estimateTemplateChromeMarginPx(candidateCanvasTypeId, imageWidth, { canvasDefs, defaultTemplateId }),
    log
  });

  const stepX = footprint.width + templateInsertion.footprintGapPx;
  const stepY = footprint.height + templateInsertion.footprintGapPx;

  const candidates = buildInsertionCandidates(
    viewportCenterX,
    viewportCenterY,
    stepX,
    stepY,
    templateInsertion.maxSearchRings
  );

  for (const candidate of candidates) {
    const candidateRect = {
      x: candidate.x,
      y: candidate.y,
      width: footprint.width,
      height: footprint.height
    };

    const overlaps = occupied.some((rect) => rectsOverlapByCenter(candidateRect, rect, 0));
    if (!overlaps) {
      return {
        x: candidate.x,
        y: candidate.y,
        viewportCenterX,
        viewportCenterY,
        usedViewportCenter: candidate.gridX === 0 && candidate.gridY === 0,
        imageWidth: footprint.imageWidth,
        imageHeight: footprint.imageHeight,
        chromeMarginPx: footprint.chromeMarginPx,
        footprintWidth: footprint.width,
        footprintHeight: footprint.height
      };
    }
  }

  throw new Error("Kein kollisionsfreier Einfügepunkt für den Canvas gefunden.");
}
