import * as Board from "../miro/board.js?v=20260304-batch2";
import * as PanelBridge from "../runtime/panel-bridge.js?v=20260304-batch2";

const PANEL_BASE_URL = new URL("../../app.html", import.meta.url).toString();
let lastOpenedControlItemId = null;
let lastOpenedAt = 0;

function buildPanelUrl(extraParams = {}) {
  const url = new URL(PANEL_BASE_URL);
  url.searchParams.set("panel", "1");
  url.searchParams.set("v", Date.now().toString());
  for (const [key, value] of Object.entries(extraParams || {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(String(key), String(value));
  }
  return url.toString();
}

async function openPanelFresh(extraParams = {}) {
  await Board.ensureMiroReady();
  const board = Board.getBoard();
  if (!board?.ui?.openPanel) return null;
  return await board.ui.openPanel({ url: buildPanelUrl(extraParams) });
}

async function onSelectionUpdate(event) {
  if (PanelBridge.isPanelHeartbeatFresh()) return;

  const items = Array.isArray(event?.items) ? event.items : [];
  if (items.length !== 1) return;

  const item = items[0];
  const meta = await Board.readFlowControlMeta(item);
  if (!meta?.flowId || !meta?.controlId) return;

  const now = Date.now();
  if (lastOpenedControlItemId === String(item.id) && now - lastOpenedAt < 1200) {
    return;
  }

  const existing = PanelBridge.loadPendingFlowControlTrigger();
  if (existing && existing.itemId === String(item.id) && now - existing.requestedAtMs < 1200) {
    return;
  }

  lastOpenedControlItemId = String(item.id);
  lastOpenedAt = now;

  PanelBridge.savePendingFlowControlTrigger({
    flowId: meta.flowId,
    controlId: meta.controlId,
    itemId: String(item.id),
    requestedAtMs: now,
    source: "headless-selection"
  });

  await openPanelFresh({ source: "flow_control", flowId: meta.flowId, controlId: meta.controlId });
}

(async function bootHeadlessRuntime() {
  await Board.ensureMiroReady();
  const board = Board.getBoard();
  if (board?.ui?.on) {
    board.ui.on("icon:click", () => openPanelFresh({ source: "icon_click" }));
  }
  await Board.registerSelectionUpdateHandler(onSelectionUpdate);
  console.log("[DT][headless] Runtime bereit.");
})().catch((error) => {
  console.error("[DT][headless] Boot fehlgeschlagen", error);
});
