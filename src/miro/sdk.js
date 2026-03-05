// --------------------------------------------------------------------
// Miro SDK bootstrap + selection wiring
// --------------------------------------------------------------------
let miroReadyPromise = null;

export function ensureMiroReady(log) {
  if (miroReadyPromise) return miroReadyPromise;

  miroReadyPromise = new Promise((resolve) => {
    const onReady = () => {
      console.log("[DT] Miro SDK v2 bereit");
      if (typeof log === "function") log("Miro SDK bereit.");
      resolve();
    };

    if (window.miro && typeof window.miro.board !== "undefined") {
      onReady();
    } else if (window.miro && typeof window.miro.onReady === "function") {
      window.miro.onReady(onReady);
    } else {
      if (typeof log === "function") log("Warnung: miro.onReady nicht verfügbar, versuche SDK direkt zu verwenden.");
      onReady();
    }
  });

  return miroReadyPromise;
}

export function getBoard() {
  return window.miro?.board || null;
}

export async function registerSelectionUpdateHandler(handler, log) {
  await ensureMiroReady(log);
  const board = getBoard();
  if (board?.ui?.on && typeof handler === "function") {
    board.ui.on("selection:update", handler);
  }
}
