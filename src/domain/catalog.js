import { TEMPLATE_ID, DT_CANVAS_DEFS } from "../config.js?v=20260301-step9";
import {
  stripHtml,
  isFiniteNumber,
  buildInstanceSignatureFromClassification,
  computeInstanceDiffFromSignatures,
  diffHasChanges
} from "../utils.js?v=20260301-step9";
import {
  computeTemplateGeometry,
  buildInstanceGeometryIndex,
  resolveBoardCoords,
  findInstanceByPoint
} from "../miro/board.js?v=20260301-step9";

// --------------------------------------------------------------------
// Canvas Definitions / Region Mapping
// --------------------------------------------------------------------
export function getCanvasDef(canvasTypeId) {
  return DT_CANVAS_DEFS[canvasTypeId] || null;
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

export function classifyNormalizedLocation(canvasTypeId, px, py) {
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

  if (Array.isArray(def.headerPolygons)) {
    for (const h of def.headerPolygons) {
      if (pointInPolygonNorm(px, py, h.polygonNorm)) {
        return { role: "header", regionId: null, regionTitle: h.title || "Header" };
      }
    }
  }

  if (Array.isArray(def.footerPolygons)) {
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

export function areaNameToRegion(areaName) {
  if (!areaName) return null;
  const norm = areaName.toLowerCase();
  if (norm.includes("box 1") || norm.includes("links")) return { id: "left", title: "Box 1 (links)" };
  if (norm.includes("box 2") || norm.includes("mitte")) return { id: "middle", title: "Box 2 (Mitte)" };
  if (norm.includes("box 3") || norm.includes("rechts")) return { id: "right", title: "Box 3 (rechts)" };
  return null;
}

export function normalizedToBoardCoords(templateGeometry, px, py) {
  const { x, y, width, height } = templateGeometry;
  const left = x - width / 2;
  const top = y - height / 2;
  return { x: left + px * width, y: top + py * height };
}

function areaCenterNormalizedFromDef(canvasTypeId, regionId) {
  const def = getCanvasDef(canvasTypeId);
  if (!def?.regionPolygons) return null;

  const r = def.regionPolygons.find((rp) => rp.id === regionId || rp.title === regionId);
  if (!r?.polygonNorm?.length) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of r.polygonNorm) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { px: (minX + maxX) / 2, py: (minY + maxY) / 2 };
}

export function areaCenterNormalized(regionId, canvasTypeId) {
  if (regionId && canvasTypeId) {
    const c = areaCenterNormalizedFromDef(canvasTypeId, regionId);
    if (c) return c;
  }

  const yMin = 0.20;
  const yMax = 0.95;
  const py = (yMin + yMax) / 2;

  if (regionId === "left") return { px: 1 / 6, py };
  if (regionId === "middle") return { px: 0.5, py };
  if (regionId === "right") return { px: 5 / 6, py };
  return { px: 0.5, py: 0.5 };
}

// --------------------------------------------------------------------
// Region Bounds + Sticky Auto-Layout (Grid mit Wrap, collision-aware)
// --------------------------------------------------------------------
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

export function getBodyRegionBoundsNorm(canvasTypeId, regionId) {
  const def = getCanvasDef(canvasTypeId);

  // Primär: aus Canvas-Def (Polygon)
  if (def?.regionPolygons && regionId) {
    const r = def.regionPolygons.find((rp) => rp.id === regionId);
    if (r?.polygonNorm?.length) {
      return polygonBoundsNorm(r.polygonNorm);
    }
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

  const b = getBodyRegionBoundsNorm(canvasTypeId, regionId);
  if (!b) return null;

  const left0 = templateGeometry.x - templateGeometry.width / 2;
  const top0  = templateGeometry.y - templateGeometry.height / 2;

  const left   = left0 + b.minX * templateGeometry.width;
  const right  = left0 + b.maxX * templateGeometry.width;
  const top    = top0  + b.minY * templateGeometry.height;
  const bottom = top0  + b.maxY * templateGeometry.height;

  return {
    left, right, top, bottom,
    width: right - left,
    height: bottom - top,
    norm: b
  };
}

function rectsOverlap(a, b, padding = 0) {
  const aL = a.x - a.width / 2 - padding;
  const aR = a.x + a.width / 2 + padding;
  const aT = a.y - a.height / 2 - padding;
  const aB = a.y + a.height / 2 + padding;

  const bL = b.x - b.width / 2;
  const bR = b.x + b.width / 2;
  const bT = b.y - b.height / 2;
  const bB = b.y + b.height / 2;

  return !(aR <= bL || aL >= bR || aB <= bT || aT >= bB);
}

function boardToNormalized(templateGeometry, x, y) {
  const left0 = templateGeometry.x - templateGeometry.width / 2;
  const top0  = templateGeometry.y - templateGeometry.height / 2;
  return {
    px: (x - left0) / templateGeometry.width,
    py: (y - top0) / templateGeometry.height
  };
}

/**
 * Liefert die nächste freie Position in einer Body-Region (left/middle/right),
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
  occupiedRects = []
}) {
  const bounds = getBodyRegionBoundsBoard(templateGeometry, canvasTypeId, regionId);
  if (!bounds) return null;

  const w = Math.max(10, Number(stickyWidthPx) || 200);
  const h = Math.max(10, Number(stickyHeightPx) || 200);

  const regionW = bounds.width;
  const regionH = bounds.height;

  // Margin adaptiv, falls Region kleiner als Sticky
  const marginX = Math.max(0, Math.min(marginPx, (regionW - w) / 2));
  const marginY = Math.max(0, Math.min(marginPx, (regionH - h) / 2));

  const availW = Math.max(0, regionW - 2 * marginX);
  const availH = Math.max(0, regionH - 2 * marginY);

  const stepX = w + gapPx;
  const stepY = h + gapPx;

  const cols = Math.max(1, Math.floor((availW + gapPx) / stepX));
  const rows = Math.max(1, Math.floor((availH + gapPx) / stepY));

  const padding = Math.max(0, gapPx * 0.5);

  function isInsideRegionByClassification(x, y) {
    // robust für Polygon-Regionen: Center muss in derselben Region liegen
    const n = boardToNormalized(templateGeometry, x, y);
    if (n.px < 0 || n.px > 1 || n.py < 0 || n.py > 1) return false;
    const loc = classifyNormalizedLocation(canvasTypeId, n.px, n.py);
    return loc?.role === "body" && loc?.regionId === regionId;
  }

  function overlapsAny(candidate) {
    for (const occ of occupiedRects || []) {
      if (!occ || typeof occ.x !== "number" || typeof occ.y !== "number") continue;
      const ow = Math.max(10, Number(occ.width) || w);
      const oh = Math.max(10, Number(occ.height) || h);
      if (rectsOverlap(candidate, { ...occ, width: ow, height: oh }, padding)) return true;
    }
    return false;
  }

  // Zeilenweise füllen: erste freie Zelle finden
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = bounds.left + marginX + w / 2 + c * stepX;
      const y = bounds.top  + marginY + h / 2 + r * stepY;

      // zusätzliche Sicherheit (Polygon-Regionen)
      if (!isInsideRegionByClassification(x, y)) continue;

      const candidate = { x, y, width: w, height: h };
      if (!overlapsAny(candidate)) {
        return { x, y, col: c, row: r, cols, rows, isFull: false, bounds };
      }
    }
  }

  // Kein freier Slot gefunden → "voll"
  const lastC = cols - 1;
  const lastR = rows - 1;
  const x = bounds.left + marginX + w / 2 + lastC * stepX;
  const y = bounds.top  + marginY + h / 2 + lastR * stepY;

  return { x, y, col: lastC, row: lastR, cols, rows, isFull: true, bounds };
}

// --------------------------------------------------------------------
// Live Catalog
// --------------------------------------------------------------------
export async function rebuildLiveCatalog({ ctx, instancesById, clusterAssignments, log }) {
  const liveCatalog = {
    canvasTypes: Object.create(null),
    instances: Object.create(null),
    unassignedStickies: [],
    lastFullRebuildAt: new Date().toISOString()
  };

  const stickyOwnerCache = new Map();

  const geomEntries = await buildInstanceGeometryIndex(instancesById, log);
  const instGeom = new Map();
  for (const e of geomEntries) {
    if (e?.geom) instGeom.set(e.inst.instanceId, e.geom);
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
          body: {
            left:   { stickies: [] },
            middle: { stickies: [] },
            right:  { stickies: [] },
            none:   { stickies: [] }
          }
        },
        allStickies: [],
        connections: [],
        meta: { stickyCount: 0, connectorCount: 0, lastUpdated: null }
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

  // ensure all instances exist in catalog
  for (const inst of instancesById.values()) ensureLiveInstance(inst);

  const parentGeomCache = new Map();

  // Stickies verteilen
  for (const s of (ctx?.stickies || [])) {
    if (!isFiniteNumber(s.x) || !isFiniteNumber(s.y)) continue;

    const pos = await resolveBoardCoords(s, parentGeomCache, log);
    if (!pos) {
      liveCatalog.unassignedStickies.push(s.id);
      continue;
    }

    const owningInst = findInstanceByPoint(pos.x, pos.y, geomEntries);
    if (!owningInst) {
      liveCatalog.unassignedStickies.push(s.id);
      continue;
    }

    const geom = instGeom.get(owningInst.instanceId);
    if (!geom) {
      liveCatalog.unassignedStickies.push(s.id);
      continue;
    }

    const left = geom.x - geom.width / 2;
    const top  = geom.y - geom.height / 2;

    const px = (pos.x - left) / geom.width;
    const py = (pos.y - top)  / geom.height;

    if (px < 0 || px > 1 || py < 0 || py > 1) {
      liveCatalog.unassignedStickies.push(s.id);
      continue;
    }

    const loc = classifyNormalizedLocation(owningInst.canvasTypeId, px, py);

    const color = (s.style && (s.style.fillColor || s.style.backgroundColor)) || null;

    const tagIds = Array.isArray(s.tagIds) ? s.tagIds : [];
    const tags = tagIds
      .map((id) => ctx.tagsById?.[id])
      .filter(Boolean);

    const clusterName = clusterAssignments?.get(s.id) || null;

    const stickObj = {
      id: s.id,
      text: stripHtml(s.content),

      // Board-Koordinaten (wichtig für Overlap-Checks/Layout)
      x: pos.x,
      y: pos.y,

      // Miro liefert i.d.R. width/height – falls nicht: null (Fallback später)
      width: isFiniteNumber(s.width) ? s.width : null,
      height: isFiniteNumber(s.height) ? s.height : null,

      px: Math.round(px * 10000) / 10000,
      py: Math.round(py * 10000) / 10000,

      role: loc.role,
      regionId: loc.regionId || null,
      regionTitle: loc.regionTitle || null,
      color,
      tags,
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
      const key = (stickObj.regionId === "left" || stickObj.regionId === "middle" || stickObj.regionId === "right")
        ? stickObj.regionId
        : "none";
      liveInst.regions.body[key].stickies.push(stickObj);
    }

    liveInst.allStickies.push(stickObj);
    stickyOwnerCache.set(s.id, owningInst.instanceId);
  }

  // Konnektoren zuordnen (nur intra-instanz)
  for (const c of (ctx?.connectors || [])) {
    const fromId = c.start?.item;
    const toId   = c.end?.item;
    if (!fromId || !toId) continue;

    const instFrom = stickyOwnerCache.get(fromId);
    const instTo   = stickyOwnerCache.get(toId);
    if (!instFrom || instFrom !== instTo) continue;

    const liveInst = liveCatalog.instances[instFrom];
    if (!liveInst) continue;

    liveInst.connections.push({ connectorId: c.id, fromStickyId: fromId, toStickyId: toId });
  }

  // Meta aktualisieren
  for (const liveInst of Object.values(liveCatalog.instances)) {
    liveInst.meta.stickyCount = liveInst.allStickies.length;
    liveInst.meta.connectorCount = liveInst.connections.length;
    liveInst.meta.lastUpdated = liveCatalog.lastFullRebuildAt;
  }

  // Instances meta (Sticky counts) updaten
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
  const items = [];
  const headerStickies = [];

  // Header
  for (const s of liveInst.regions.header.stickies) {
    items.push({
      stickyId: s.id,
      text: s.text,
      role: "header",
      regionId: null,
      regionTitle: "Header",
      color: s.color,
      tags: s.tags.map((title) => ({ id: null, title })),
      clusterName: s.clusterName,
      connectionsOut: [],
      connectionsIn: []
    });

    headerStickies.push({
      stickyId: s.id,
      text: s.text,
      px: s.px,
      py: s.py,
      color: s.color,
      tagIds: [],
      tags: s.tags.map((title) => ({ id: null, title }))
    });
  }

  function addBodyRegion(regionId, regionTitle, list) {
    for (const s of list) {
      items.push({
        stickyId: s.id,
        text: s.text,
        role: "body",
        regionId,
        regionTitle,
        color: s.color,
        tags: s.tags.map((title) => ({ id: null, title })),
        clusterName: s.clusterName,
        connectionsOut: [],
        connectionsIn: []
      });
    }
  }

  addBodyRegion("left",   "Box 1 (links)",  liveInst.regions.body.left.stickies);
  addBodyRegion("middle", "Box 2 (Mitte)",  liveInst.regions.body.middle.stickies);
  addBodyRegion("right",  "Box 3 (rechts)", liveInst.regions.body.right.stickies);
  addBodyRegion(null,     null,             liveInst.regions.body.none.stickies);

  // Footer
  for (const s of liveInst.regions.footer.stickies) {
    items.push({
      stickyId: s.id,
      text: s.text,
      role: "footer",
      regionId: null,
      regionTitle: "Footer",
      color: s.color,
      tags: s.tags.map((title) => ({ id: null, title })),
      clusterName: s.clusterName,
      connectionsOut: [],
      connectionsIn: []
    });
  }

  // Connections in Items eintragen
  const idToItem = Object.create(null);
  for (const it of items) if (it?.stickyId) idToItem[it.stickyId] = it;

  const connections = [];
  for (const c of (liveInst.connections || [])) {
    const fromItem = idToItem[c.fromStickyId];
    const toItem   = idToItem[c.toStickyId];
    if (!fromItem || !toItem) continue;

    connections.push({ connectorId: c.connectorId, fromStickyId: c.fromStickyId, toStickyId: c.toStickyId });

    fromItem.connectionsOut.push({ connectorId: c.connectorId, toStickyId: c.toStickyId });
    toItem.connectionsIn.push({ connectorId: c.connectorId, fromStickyId: c.fromStickyId });
  }

  // Counts
  const counts = { total: items.length, byRegion: {} };
  for (const it of items) {
    if (it.role === "body" && it.regionId) {
      counts.byRegion[it.regionId] = (counts.byRegion[it.regionId] || 0) + 1;
    }
  }

  const headerSummaryRaw = headerStickies.map((h) => h.text).filter(Boolean).join(" | ");
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
      headerSummary
    },
    header: { stickies: headerStickies },
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
    sticky: Object.create(null),        // alias -> stickyId
    stickyReverse: Object.create(null)  // stickyId -> alias
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
    created: (diff.created || []).map((e) => ({ ...e, stickyId: aliasId(e.stickyId) })),
    deleted: (diff.deleted || []).map((e) => ({ ...e, stickyId: aliasId(e.stickyId) })),
    updated: (diff.updated || []).map((e) => ({ stickyId: aliasId(e.stickyId), before: e.before, after: e.after })),
    connectorsCreated: (diff.connectorsCreated || []).map((e) => ({ fromStickyId: aliasId(e.fromStickyId), toStickyId: aliasId(e.toStickyId) })),
    connectorsDeleted: (diff.connectorsDeleted || []).map((e) => ({ fromStickyId: aliasId(e.fromStickyId), toStickyId: aliasId(e.toStickyId) }))
  };
}

export function buildPromptPayloadFromClassification(classification, { useAliases = false, aliasState = null, log } = {}) {
  if (!classification) return null;

  if (useAliases && !aliasState) {
    // Sicherer Fallback: lokale Alias-Map (nicht ideal für Action-Resolution, aber verhindert Crash)
    aliasState = createAliasState();
    if (typeof log === "function") log("WARNUNG: buildPromptPayloadFromClassification(useAliases=true) ohne aliasState – es wurde ein lokaler AliasState erzeugt.");
  }

  const perTemplate =
    (Array.isArray(classification.templates) && classification.templates.length)
      ? classification.templates
      : [classification];

  function getOrCreateStickyAlias(stickyId) {
    if (!useAliases || !stickyId) return null;

    const rev = aliasState.stickyReverse;
    const existing = rev[stickyId];
    if (existing) return existing;

    const index = aliasState.nextStickyAliasIndex++;
    const alias = "S" + String(index).padStart(4, "0");
    aliasState.sticky[alias] = stickyId;
    rev[stickyId] = alias;
    return alias;
  }

  function transformOne(one) {
    const idToItem = Object.create(null);
    if (Array.isArray(one.items)) {
      for (const item of one.items) if (item?.stickyId) idToItem[item.stickyId] = item;
    }

    function buildConnectionsOut(item) {
      const result = [];
      if (!item?.connectionsOut) return result;
      for (const co of item.connectionsOut) {
        const target = co?.toStickyId ? idToItem[co.toStickyId] : null;
        result.push({
          connectorId: co.connectorId,
          toId: target?.stickyId ? getOrCreateStickyAlias(target.stickyId) : null,
          toText: target ? target.text : null,
          toArea: target ? (target.regionTitle || (target.role === "header" ? "Header" : null)) : null
        });
      }
      return result;
    }

    function buildConnectionsIn(item) {
      const result = [];
      if (!item?.connectionsIn) return result;
      for (const ci of item.connectionsIn) {
        const source = ci?.fromStickyId ? idToItem[ci.fromStickyId] : null;
        result.push({
          connectorId: ci.connectorId,
          fromId: source?.stickyId ? getOrCreateStickyAlias(source.stickyId) : null,
          fromText: source ? source.text : null,
          fromArea: source ? (source.regionTitle || (source.role === "header" ? "Header" : null)) : null
        });
      }
      return result;
    }

    const headerStickiesRaw = one.header?.stickies || [];
    const header = {
      summary: one.template?.headerSummary,
      stickies: headerStickiesRaw.map((h) => {
        const item = h.stickyId ? idToItem[h.stickyId] : null;
        const tagObjs = (item?.tags && Array.isArray(item.tags)) ? item.tags : (Array.isArray(h.tags) ? h.tags : []);
        const tags = tagObjs.map((t) => t?.title).filter(Boolean);

        const alias = item?.stickyId ? getOrCreateStickyAlias(item.stickyId) : null;

        return {
          id: alias,
          text: h.text,
          color: (item?.color) || h.color || null,
          tags,
          clusterName: item?.clusterName || null,
          connectionsOut: buildConnectionsOut(item),
          connectionsIn: buildConnectionsIn(item)
        };
      })
    };

    const areasByName = Object.create(null);

    if (Array.isArray(one.items)) {
      for (const item of one.items) {
        if (!item || item.role === "header") continue;

        const areaName = item.regionTitle || "Ohne Area";
        if (!areasByName[areaName]) areasByName[areaName] = { name: areaName, stickies: [] };

        const tags = Array.isArray(item.tags)
          ? item.tags.map((t) => t?.title).filter(Boolean)
          : [];

        const alias = getOrCreateStickyAlias(item.stickyId);

        areasByName[areaName].stickies.push({
          id: alias,
          text: item.text,
          color: item.color || null,
          tags,
          clusterName: item.clusterName || null,
          connectionsOut: buildConnectionsOut(item),
          connectionsIn: buildConnectionsIn(item)
        });
      }
    }

    const connectionsSummary = Array.isArray(one.connections)
      ? one.connections.map((c) => {
          const fromItem = c.fromStickyId ? idToItem[c.fromStickyId] : null;
          const toItem = c.toStickyId ? idToItem[c.toStickyId] : null;

          const fromArea = fromItem ? (fromItem.regionTitle || (fromItem.role === "header" ? "Header" : null)) : null;
          const toArea = toItem ? (toItem.regionTitle || (toItem.role === "header" ? "Header" : null)) : null;

          return {
            connectorId: c.connectorId,
            fromId: fromItem?.stickyId ? getOrCreateStickyAlias(fromItem.stickyId) : null,
            fromText: fromItem ? fromItem.text : null,
            fromArea,
            toId: toItem?.stickyId ? getOrCreateStickyAlias(toItem.stickyId) : null,
            toText: toItem ? toItem.text : null,
            toArea
          };
        })
      : [];

    return {
      instanceLabel: one.template?.instanceLabel || null,
      canvasTypeId: one.template?.canvasTypeId || one.template?.id || null,
      canvasTypeLabel: one.template?.canvasTypeLabel || one.template?.name || null,
      template: {
        name: one.template?.name,
        headerSummary: one.template?.headerSummary,
        instanceLabel: one.template?.instanceLabel || null,
        canvasTypeId: one.template?.canvasTypeId || one.template?.id || null,
        canvasTypeLabel: one.template?.canvasTypeLabel || one.template?.name || null
      },
      header,
      areas: Object.keys(areasByName).map((k) => areasByName[k]),
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
  mode = "generic",            // "global" | "instance" | "generic"
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
