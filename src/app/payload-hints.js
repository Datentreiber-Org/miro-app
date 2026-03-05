export function buildPayloadMappingHint({
  scopeLabel = "aktuellen Ziel-Instanzen",
  labelListKey = "selectedInstanceLabels",
  mentionArea = false
} = {}) {
  const lines = [
    `boardCatalog = Kurzüberblick über alle Canvas, activeCanvasStates = Detaildaten für die ${scopeLabel}.`,
    `Verwende instanceLabel exakt wie in ${labelListKey} bzw. den Schlüsseln von activeCanvasStates.`,
    "Verwende create_connector für Beziehungen zwischen Stickies.",
    "fromStickyId/toStickyId dürfen bestehende Alias-IDs oder refId-Werte aus create_sticky-Actions derselben Antwort sein.",
    "Referenziere Canvas in memoryEntry nur über instanceLabel."
  ];

  if (mentionArea) {
    lines.splice(2, 0, "area/targetArea muss exakt einem vorhandenen Area-Key der Ziel-Instanz entsprechen, also einem Wert aus templates[].areas[].name.");
  }

  return lines.join(" ");
}
