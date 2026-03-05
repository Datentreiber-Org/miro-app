export function estimateTemplateSize(canvasTypeId, widthPx, { canvasDefs, defaultTemplateId }) {
  const def = canvasDefs?.[canvasTypeId] || canvasDefs?.[defaultTemplateId] || null;
  const originalWidth = Number(def?.originalWidth) || 0;
  const originalHeight = Number(def?.originalHeight) || 0;

  if (originalWidth > 0 && originalHeight > 0) {
    return {
      width: widthPx,
      height: widthPx * (originalHeight / originalWidth)
    };
  }

  return {
    width: widthPx,
    height: widthPx
  };
}

export function getInsertWidthPxForCanvasType(canvasTypeId, { getCanvasTypeEntry, fallbackWidthPx }) {
  const entry = typeof getCanvasTypeEntry === "function" ? getCanvasTypeEntry(canvasTypeId) : null;
  const configuredWidth = Number(entry?.insertWidthPx) || 0;
  return configuredWidth > 0 ? configuredWidth : fallbackWidthPx;
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

async function getOccupiedTemplateFootprints(instances, { computeTemplateGeometry, log }) {
  const occupied = [];

  for (const inst of instances || []) {
    const geom = await computeTemplateGeometry(inst, log);
    if (!geom) continue;

    occupied.push({
      instanceId: inst.instanceId,
      x: geom.x,
      y: geom.y,
      width: geom.width,
      height: geom.height
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

  const estimatedImage = estimateTemplateSize(canvasTypeId, insertWidthPx, { canvasDefs, defaultTemplateId });
  const footprint = {
    width: estimatedImage.width,
    height: estimatedImage.height
  };
  const occupied = await getOccupiedTemplateFootprints(instances, { computeTemplateGeometry, log });

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
        usedViewportCenter: candidate.gridX === 0 && candidate.gridY === 0
      };
    }
  }

  throw new Error("Kein kollisionsfreier Einfügepunkt für den Canvas gefunden.");
}
