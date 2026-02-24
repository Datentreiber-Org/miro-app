// OpenAI
export const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

// --------------------------------------------------------------------
// Template / Canvas / Storage Konfiguration
// --------------------------------------------------------------------
export const TEMPLATE_ID = "datentreiber-3boxes";
export const TEMPLATE_IMAGE_URL =
  "https://www.datentreiber.com/wp-content/uploads/2024/12/Datentreiber_EN_3-Boxes_v1-1_20240610.png";

// Template-Katalog: Canvas-Typ-Erkennung über PNG-URL
export const DT_TEMPLATE_CATALOG = {
  [TEMPLATE_ID]: {
    canvasTypeId: TEMPLATE_ID,
    imageUrl: TEMPLATE_IMAGE_URL
  }
};

// Persistenz (Global-Baseline)
export const DT_STORAGE_COLLECTION_NAME = "datentreiber-mirobot";
export const DT_STORAGE_KEY_META = "dt-global-meta-v1";
export const DT_STORAGE_KEY_BASELINE_PREFIX = "dt-baseline-v1:";

// Canvas-Definitions (Polygon-basiert, normalisiert 0..1)
export const DT_CANVAS_DEFS = {
  [TEMPLATE_ID]: {
    originalWidth: 4550,
    originalHeight: 3219,
    headerPolygons: [
      {
        id: "header",
        title: "Header",
        polygonNorm: [
          [0.0, 0.0],
          [1.0, 0.0],
          [1.0, 0.18],
          [0.0, 0.18]
        ]
      }
    ],
    footerPolygons: [
      {
        id: "footer",
        title: "Footer",
        polygonNorm: [
          [0.0, 0.95],
          [1.0, 0.95],
          [1.0, 1.0],
          [0.0, 1.0]
        ]
      }
    ],
    regionPolygons: [
      {
        id: "left",
        title: "Box 1 (links)",
        polygonNorm: [
          [0.0, 0.18],
          [1.0 / 3.0, 0.18],
          [1.0 / 3.0, 0.95],
          [0.0, 0.95]
        ]
      },
      {
        id: "middle",
        title: "Box 2 (Mitte)",
        polygonNorm: [
          [1.0 / 3.0, 0.18],
          [2.0 / 3.0, 0.18],
          [2.0 / 3.0, 0.95],
          [1.0 / 3.0, 0.95]
        ]
      },
      {
        id: "right",
        title: "Box 3 (rechts)",
        polygonNorm: [
          [2.0 / 3.0, 0.18],
          [1.0, 0.18],
          [1.0, 0.95],
          [2.0 / 3.0, 0.95]
        ]
      }
    ]
  }
};

// --------------------------------------------------------------------
// Prompt-Katalog (Modus B, instanzspezifisch)
// --------------------------------------------------------------------
export const DT_PROMPT_CATALOG = {
  [TEMPLATE_ID]: {
    system: (
      "Du bist ein Facilitation-Bot für Miro-Workshops.\n" +
      "Du siehst:\n" +
      "- eine oder mehrere Canvas-Instanzen (3-Boxes-Canvas) mit Sticky Notes als JSON\n" +
      "- einen Board-Katalog mit allen weiteren Instanzen (nur als Zusammenfassung).\n" +
      "Du sollst:\n" +
      "1) die Situation auf den übergebenen Instanzen verstehen (Input / Processing / Output),\n" +
      "2) sinnvolle nächste Schritte vorschlagen und\n" +
      "3) optionale Board-Aktionen als JSON liefern (z.B. Stickies verschieben oder anlegen).\n" +
      "Jede Sticky Note in den Strukturen unter 'activeCanvasState' bzw. 'activeCanvasStates' hat eine kurze ID im Feld 'id' (z.B. \"S0001\"). " +
      "Wenn du eine Sticky Note in einer Action referenzierst, verwende genau diese kurze ID im Feld 'stickyId'.\n" +
      "WICHTIG: Antworte ausschließlich mit einem JSON-Objekt im folgenden Format:\n" +
      "{\n" +
      '  "analysis": "kurze Erklärung in natürlicher Sprache",\n' +
      '  "actions": [\n' +
      '    { "type": "move_sticky", "stickyId": "S0001", "targetArea": "Box 2 (Mitte)" },\n' +
      '    { "type": "create_sticky", "area": "Box 3 (rechts)", "text": "Neuer Inhalt" },\n' +
      '    { "type": "delete_sticky", "stickyId": "S0002" }\n' +
      "  ]\n" +
      "}\n" +
      "Falls du keine Aktionen vorschlagen möchtest, setze actions auf ein leeres Array []."
    )
  }
};

// --------------------------------------------------------------------
// Globaler Agent (Modus A)
// --------------------------------------------------------------------
export const DT_GLOBAL_SYSTEM_PROMPT = (
  "Du bist ein Facilitation-Bot für Miro-Workshops mit globalem Überblick über alle Canvas-Instanzen.\n" +
  "Du siehst:\n" +
  "- einen Board-Katalog mit allen Instanzen (boardCatalog)\n" +
  "- detaillierte JSON-Daten zu allen aktiven Instanzen (activeCanvasStates)\n" +
  "- optionale Changes seit dem letzten Agent-Run (activeInstanceChangesSinceLastAgent).\n" +
  "Analysiere die Gesamtsituation auf dem Board, schlage sinnvolle nächste Schritte vor und formuliere bei Bedarf Board-Aktionen als JSON.\n" +
  "Wenn du einzelne Sticky Notes in Actions referenzierst, verwende die Kurz-IDs aus den JSON-Strukturen.\n" +
  "Antworte ausschließlich mit einem JSON-Objekt mit den Feldern \"analysis\" und \"actions\"."
);
