// src/config.js
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
      "3) optionale Board-Aktionen als JSON liefern.\n" +
      "\n" +
      "IDs / Referenzen:\n" +
      "- Jede existierende Sticky Note in 'activeCanvasState' bzw. 'activeCanvasStates' hat eine kurze ID im Feld 'id' (z.B. \"S0001\").\n" +
      "- Wenn du eine existierende Sticky Note referenzierst, verwende diese kurze ID in Feldern wie stickyId/fromStickyId/toStickyId.\n" +
      "- Wenn du neue Stickies erzeugst und sie in derselben Antwort später referenzieren willst (z.B. verbinden oder verschieben), gib bei create_sticky zusätzlich ein Feld \"ref\" an (frei wählbarer, eindeutiger String). Du darfst diese ref später wie eine ID verwenden.\n" +
      "\n" +
      "Unterstützte Actions:\n" +
      "- move_sticky:   { type, stickyId, targetArea? ODER targetPx/targetPy }\n" +
      "- create_sticky: { type, area (oder targetArea), text, ref? }\n" +
      "- delete_sticky: { type, stickyId }\n" +
      "- create_connector: { type, fromStickyId, toStickyId, caption?, shape?, style? }\n" +
      "- ensure_connector: wie create_connector, erzeugt nur wenn noch keine Verbindung existiert\n" +
      "- delete_connector: { type, connectorId } ODER { type, fromStickyId, toStickyId, all? }\n" +
      "- connect_chain: { type, stickyIds: [ ... ] } // verbindet jeweils Nachbarn (A-B, B-C, ...)\n" +
      "\n" +
      "Verbindungen (wichtig):\n" +
      "- Wenn du in mehreren Boxen zusammengehörige Informationen erzeugst (z.B. Personas/Beispiele/Einträge mit Name + Tätigkeit + Erwartung), dann verbinde die jeweils zusammengehörigen Stickies pro Einheit mit Connectoren.\n" +
      "- Nutze dafür bevorzugt connect_chain (z.B. Name → Tätigkeit → Erwartung).\n" +
      "- Der Nutzer muss das Wort \"verbinden\" nicht explizit sagen – wenn Inhalte erkennbar zusammengehören, stelle die Beziehungen her.\n" +
      "\n" +
      "WICHTIG: Antworte ausschließlich mit einem JSON-Objekt im folgenden Format (kein Markdown, keine Code-Fences):\n" +
      "{\n" +
      "  \"analysis\": \"kurze Erklärung in natürlicher Sprache\",\n" +
      "  \"actions\": [\n" +
      "    { \"type\": \"create_sticky\", \"area\": \"Box 1 (links)\", \"text\": \"Paul\", \"ref\": \"p1_name\" },\n" +
      "    { \"type\": \"create_sticky\", \"area\": \"Box 2 (Mitte)\", \"text\": \"IT-Experte\", \"ref\": \"p1_job\" },\n" +
      "    { \"type\": \"create_sticky\", \"area\": \"Box 3 (rechts)\", \"text\": \"Ich will lernen\", \"ref\": \"p1_goal\" },\n" +
      "    { \"type\": \"connect_chain\", \"stickyIds\": [\"p1_name\", \"p1_job\", \"p1_goal\"] }\n" +
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
  "\n" +
  "Analysiere die Gesamtsituation auf dem Board, schlage sinnvolle nächste Schritte vor und formuliere bei Bedarf Board-Aktionen als JSON.\n" +
  "\n" +
  "IDs / Referenzen:\n" +
  "- Wenn du einzelne Sticky Notes in Actions referenzierst, verwende die Kurz-IDs aus den JSON-Strukturen (z.B. \"S0001\").\n" +
  "- Wenn du neue Stickies erzeugst und sie in derselben Antwort referenzieren willst, nutze bei create_sticky zusätzlich \"ref\" und verwende diese ref später wie eine ID.\n" +
  "\n" +
  "Du darfst zusätzlich zu Sticky-Actions auch Connector-Actions vorschlagen:\n" +
  "- create_connector / ensure_connector / delete_connector / connect_chain.\n" +
  "\n" +
  "Verbindungen (wichtig): Wenn du zusammengehörige Inhalte über mehrere Areas/Boxen hinweg identifizierst oder neu anlegst (z.B. Personas/Einträge mit Name + Tätigkeit + Erwartung), dann stelle die Beziehungen über Connectoren her (z.B. per connect_chain).\n" +
  "\n" +
  "Antworte ausschließlich mit einem JSON-Objekt mit den Feldern \"analysis\" und \"actions\" (kein Markdown, keine Code-Fences)."
);

// --------------------------------------------------------------------
// Sticky Auto-Layout (Create/Move Sticky) – Region Fill
// --------------------------------------------------------------------
export const STICKY_LAYOUT = {
  marginPx: 20,              // Abstand zur Region (oben/links/rechts/unten)
  gapPx: 20,                 // Abstand zwischen Stickies (horizontal/vertikal)
  defaultWidthPx: 200,       // Fallback, falls Miro keine width/height liefert
  defaultHeightPx: 200
};
