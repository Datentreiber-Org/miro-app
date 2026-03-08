import {
  DT_SHAPE_META_KEY_FLOW_CONTROL,
  DT_FLOW_CONTROL_LAYOUT,
  DT_FLOW_CONTROL_STATE_STYLES
} from "../config.js?v=20260307-batch5";

import { normalizeUiLanguage, t } from "../i18n/index.js?v=20260306-batch6";
import { ensureMiroReady, getBoard } from "./sdk.js?v=20260307-batch5";
import { asTrimmedString } from "./helpers.js?v=20260305-batch05";
import { getItemById } from "./items.js?v=20260305-batch05";
import { computeTemplateGeometry } from "./instances.js?v=20260307-batch5";

function normalizeFlowControlMeta(rawMeta) {
  const src = (rawMeta && typeof rawMeta === "object") ? rawMeta : {};
  return {
    version: 1,
    kind: "flow_control",
    flowId: asTrimmedString(src.flowId),
    controlId: asTrimmedString(src.controlId)
  };
}

function normalizeFlowControlState(value) {
  const normalized = asTrimmedString(value) || "disabled";
  return ["active", "disabled", "done"].includes(normalized) ? normalized : "disabled";
}

export function getFlowControlStyleForState(state) {
  const normalizedState = normalizeFlowControlState(state);
  const cfg = DT_FLOW_CONTROL_STATE_STYLES[normalizedState] || DT_FLOW_CONTROL_STATE_STYLES.disabled;
  return {
    fillColor: cfg.fillColor,
    borderColor: cfg.borderColor,
    borderWidth: 2,
    color: cfg.textColor,
    fontSize: 14,
    textAlign: "center",
    textAlignVertical: "middle"
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

export async function computeSuggestedFlowControlPosition(instance, { offsetIndex = 0, laneIndex = 0 } = {}, log) {
  await ensureMiroReady(log);
  const geom = instance ? (await computeTemplateGeometry(instance, log)) : null;
  const fallbackX = Number(instance?.lastGeometry?.x) || 0;
  const fallbackY = Number(instance?.lastGeometry?.y) || 0;
  const fallbackHeight = Number(instance?.lastGeometry?.height) || 0;
  const baseX = geom?.x || fallbackX;
  const baseY = geom?.y || fallbackY;
  const baseHeight = geom?.height || fallbackHeight;
  const normalizedLaneIndex = Number.isFinite(Number(laneIndex)) ? Math.max(0, Number(laneIndex)) : 0;
  const laneOffsetY = normalizedLaneIndex * (DT_FLOW_CONTROL_LAYOUT.heightPx + DT_FLOW_CONTROL_LAYOUT.laneGapYPx);
  const historyOffsetY = normalizedLaneIndex >= 3 ? DT_FLOW_CONTROL_LAYOUT.historyLaneOffsetYPx : 0;

  return {
    x: baseX + offsetIndex * (DT_FLOW_CONTROL_LAYOUT.widthPx + DT_FLOW_CONTROL_LAYOUT.gapXPx),
    y: baseY + baseHeight / 2 + DT_FLOW_CONTROL_LAYOUT.offsetFromCanvasBottomPx + laneOffsetY + historyOffsetY,
    width: DT_FLOW_CONTROL_LAYOUT.widthPx,
    height: DT_FLOW_CONTROL_LAYOUT.heightPx
  };
}

export async function createFlowControlShape({ label, x, y, width = DT_FLOW_CONTROL_LAYOUT.widthPx, height = DT_FLOW_CONTROL_LAYOUT.heightPx, state = "disabled", lang = "de" }, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (!board?.createShape) throw new Error("miro.board.createShape nicht verfügbar");

  const shape = await board.createShape({
    content: asTrimmedString(label) || t("flow.defaultControlLabel", normalizeUiLanguage(lang)),
    shape: "round_rectangle",
    x,
    y,
    width,
    height,
    style: getFlowControlStyleForState(state)
  });

  return shape;
}

export async function syncFlowControlShapeAppearance(itemOrId, { label = null, state = null, lang = "de" } = {}, log) {
  await ensureMiroReady(log);
  const item = typeof itemOrId === "object" && itemOrId
    ? itemOrId
    : (itemOrId ? await getItemById(itemOrId, log) : null);

  if (!item?.sync) return null;

  const normalizedLabel = asTrimmedString(label) || t("flow.defaultControlLabel", normalizeUiLanguage(lang));
  if (normalizedLabel) item.content = normalizedLabel;

  const nextState = normalizeFlowControlState(state);
  item.style = {
    ...(item.style || {}),
    ...getFlowControlStyleForState(nextState)
  };

  await item.sync();
  return item;
}
