window.__DT_RUNTIME_CONTEXT = "headless";

(async function bootstrapHeadlessRuntime() {
  try {
    console.log("[DT][headless] Bootstrap startet");
    await import("../main.js?v=20260308-batch7-5");
  } catch (error) {
    console.error("[DT][headless] Bootstrap fehlgeschlagen", error);
  }
})();
