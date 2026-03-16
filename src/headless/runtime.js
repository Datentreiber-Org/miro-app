window.__DT_RUNTIME_CONTEXT = "headless";

(async function bootstrapHeadlessRuntime() {
  try {
    console.log("[DT][headless] Bootstrap startet");
    await import("../main.js?v=20260316-patch20-data-monetization-pack");
  } catch (error) {
    console.error("[DT][headless] Bootstrap fehlgeschlagen", error);
  }
})();
