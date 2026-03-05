import {
  DT_SHAPE_META_KEY_FLOW_CONTROL,
  DT_FLOW_CONTROL_LAYOUT
} from "../config.js?v=20260303-flowbatch1";

import { ensureMiroReady, getBoard } from "./sdk.js?v=20260305-batch05";
import { asTrimmedString } from "./helpers.js?v=20260305-batch05";
import { getItemById } from "./items.js?v=20260305-batch05";
import { computeTemplateGeometry } from "./instances.js?v=20260305-batch05";

// --------------------------------------------------------------------
// Flow-control metadata and shape helpers
// --------------------------------------------------------------------
function normalizeFlowControlMeta(rawMeta) {
  const src = (rawMeta && typeof rawMeta === "object") ? rawMeta : {};
  return {
    version: 1,
    kind: "flow_control",
    flowId: asTrimmedString(src.flowId),
    controlId: asTrimmedString(src.controlId)
  };
}

export async function readFlowControlMeta(itemOrId, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.getMetadata) return null;

  try {
    const rawMeta = await item.getMetadata(DT_SHAPE_META_KEY_FLOW_CONTROL);
    const normalized = normalizeFlowControlMeta(rawMeta);
    return normalized.flowId && normalized.controlId ? normalized : null;
  } catch (_) {
    return null;
  }
}

export async function writeFlowControlMeta(itemOrId, meta, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.setMetadata) return null;

  const normalized = normalizeFlowControlMeta(meta);
  try {
    await item.setMetadata(DT_SHAPE_META_KEY_FLOW_CONTROL, normalized);
  } catch (e) {
    if (typeof log === "function") log("Fehler beim Speichern der Flow-Control-Metadata: " + e.message);
  }
  return normalized;
}

export async function removeFlowControlMeta(itemOrId, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.setMetadata) return false;

  try {
    await item.setMetadata(DT_SHAPE_META_KEY_FLOW_CONTROL, null);
    return true;
  } catch (_) {
    return false;
  }
}

export async function computeSuggestedFlowControlPosition(instance, { offsetIndex = 0 } = {}, log) {
  await ensureMiroReady(log);
  const geom = instance ? (await computeTemplateGeometry(instance, log)) : null;
  const fallbackX = Number(instance?.lastGeometry?.x) || 0;
  const fallbackY = Number(instance?.lastGeometry?.y) || 0;
  const fallbackHeight = Number(instance?.lastGeometry?.height) || 0;
  const baseX = geom?.x || fallbackX;
  const baseY = geom?.y || fallbackY;
  const baseHeight = geom?.height || fallbackHeight;

  return {
    x: baseX + offsetIndex * (DT_FLOW_CONTROL_LAYOUT.widthPx + DT_FLOW_CONTROL_LAYOUT.gapXPx),
    y: baseY + baseHeight / 2 + DT_FLOW_CONTROL_LAYOUT.offsetFromCanvasBottomPx,
    width: DT_FLOW_CONTROL_LAYOUT.widthPx,
    height: DT_FLOW_CONTROL_LAYOUT.heightPx
  };
}

export async function createFlowControlShape({ label, x, y, frameId = null, width = DT_FLOW_CONTROL_LAYOUT.widthPx, height = DT_FLOW_CONTROL_LAYOUT.heightPx }, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createShape) throw new Error("miro.board.createShape nicht verfügbar");

  const shape = await board.createShape({
    content: asTrimmedString(label) || "Flow Control",
    shape: "round_rectangle",
    x,
    y,
    width,
    height,
    style: {
      fillColor: "#e0f2fe",
      borderColor: "#0369a1",
      borderWidth: 2,
      color: "#0f172a",
      fontSize: 14,
      textAlign: "center",
      textAlignVertical: "middle"
    }
  });

  if (frameId) {
    try {
      const frame = await getItemById(frameId, log);
      if (frame?.type === "frame" && typeof frame.add === "function") {
        await frame.add(shape);
        await frame.sync();
      }
    } catch (e) {
      if (typeof log === "function") log("Konnte Flow-Control-Shape nicht dem Frame hinzufügen: " + e.message);
    }
  }

  return shape;
}
