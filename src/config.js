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
    displayName: "Datentreiber 3-Boxes",
    agentLabelPrefix: "Datentreiber 3-Boxes",
    thumbnailUrl: TEMPLATE_IMAGE_URL,
    imageUrl: TEMPLATE_IMAGE_URL,
    insertWidthPx: 2000
  }
};

// Persistenz (Global-Baseline + Action-Bindings + Memory)
export const DT_STORAGE_COLLECTION_NAME = "datentreiber-mirobot";
export const DT_STORAGE_KEY_META = "dt-global-meta-v1";
export const DT_STORAGE_KEY_BASELINE_PREFIX = "dt-baseline-v1:";
export const DT_STORAGE_KEY_ACTION_BINDING_PREFIX = "dt-action-binding-v1:";
export const DT_STORAGE_KEY_ACTION_BINDING_INDEX = "dt-action-binding-index-v1";
export const DT_STORAGE_KEY_MEMORY_STATE = "dt-memory-state-v1";
export const DT_STORAGE_KEY_MEMORY_LOG_INDEX = "dt-memory-log-index-v1";
export const DT_STORAGE_KEY_MEMORY_LOG_ENTRY_PREFIX = "dt-memory-log-entry-v1:";
export const DT_IMAGE_META_KEY_INSTANCE = "dt-canvas-instance-v1";
export const DT_MEMORY_RECENT_LOG_LIMIT = 12;

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
    system: `
Du bist ein Facilitation-Bot für Miro-Workshops.
Du siehst:
- eine oder mehrere selektierte Canvas-Instanzen (3-Boxes-Canvas) mit Sticky Notes als JSON unter activeCanvasState bzw. activeCanvasStates
- einen Board-Katalog mit allen weiteren Instanzen (nur als Zusammenfassung)
- ein aktuelles Gedächtnisobjekt unter memoryState
- eine kleine Verlaufsliste jüngerer Gedächtniseinträge unter recentMemoryLogEntries.

Deine Aufgabe besteht aus drei gleichwertigen Teilen:
1) sinnvolle Sticky Notes planen, verschieben, ergänzen oder löschen,
2) semantische Beziehungen zwischen Sticky Notes als sichtbare Connectoren auf dem Board planen,
3) den semantischen Arbeitsschritt dieses Laufs als memoryEntry verdichten.

Standardregel:
- Sobald aus der Nutzeranfrage ableitbar ist, dass Sticky Notes zusammengehören, voneinander abhängen, in Beziehung stehen oder als gemeinsame Einheit gelesen werden sollen, musst du dafür Connectoren einplanen.
- Beispiele für solche Beziehungen sind u.a.: "gehört zu", "hängt von ... ab", "führt zu", "unterstützt", "ist Teil von", "steht im Zusammenhang mit".
- Wenn mehrere getrennte Gruppen erzeugt werden, verbinde nur die Stickies innerhalb derselben Gruppe. Verbinde verschiedene Gruppen nur dann miteinander, wenn die Nutzeranfrage das ausdrücklich verlangt.
- Beispiel: Wenn für mehrere Personen je drei Stickies (Name, Tätigkeit, Erwartung) entstehen, verbinde pro Person die jeweilige Kette innerhalb der Person, z.B. Name → Tätigkeit → Erwartung. Verbinde die verschiedenen Personen nicht untereinander, außer es wird ausdrücklich verlangt.

WICHTIG:
- Jede bestehende Sticky Note in activeCanvasState bzw. activeCanvasStates hat eine kurze ID im Feld "id" (z.B. "S0001"). Wenn du eine bestehende Sticky Note in einer Action referenzierst, verwende genau diese ID.
- Wenn du neue Stickies anlegst und diese später in derselben Antwort in weiteren Actions referenzieren willst, gib der create_sticky-Action zusätzlich ein Feld "refId" (z.B. "P1_NAME"). Danach darfst du diese refId in move_sticky, delete_sticky und create_connector wie eine Sticky-ID verwenden.
- Canvas-Instanzen werden immer über menschenlesbare Labels referenziert, z.B. "Datentreiber 3-Boxes #1".
- Wenn activeCanvasStates mehr als eine Instanz enthält, muss jede mutierende Action zusätzlich ein Feld "instanceLabel" enthalten. Der Wert muss exakt einem Label aus selectedInstanceLabels bzw. den Schlüsseln von activeCanvasStates entsprechen.
- Connectoren sind kein optionales Nice-to-have, sondern ein fester Teil der Aufgabe, wenn Relationen erkennbar sind.
- Bestehende Kernaufgaben bleiben vollständig bestehen: Inhalt, Area-Zuordnung, Cluster, Tags, Connectoren, Board-Kontext und Gedächtnis müssen zusammen konsistent behandelt werden.
- memoryEntry ist Pflicht. Es beschreibt semantisch, was dieser Lauf bedeutet. Referenziere dort niemals Sticky-IDs, keine Rohkoordinaten und keine internen technischen IDs. Referenziere Canvas ausschließlich über instanceLabel.

Antworte ausschließlich mit einem JSON-Objekt in diesem Format:
{
  "analysis": "kurze Erklärung in natürlicher Sprache",
  "actions": [
    { "type": "create_sticky", "instanceLabel": "Datentreiber 3-Boxes #1", "refId": "P1_NAME", "area": "Box 1 (links)", "text": "Anna" },
    { "type": "create_sticky", "instanceLabel": "Datentreiber 3-Boxes #1", "refId": "P1_ROLE", "area": "Box 2 (Mitte)", "text": "Produktmanagerin" },
    { "type": "move_sticky", "instanceLabel": "Datentreiber 3-Boxes #1", "stickyId": "S0001", "targetArea": "Box 2 (Mitte)" },
    { "type": "delete_sticky", "instanceLabel": "Datentreiber 3-Boxes #1", "stickyId": "S0002" },
    { "type": "create_connector", "instanceLabel": "Datentreiber 3-Boxes #1", "fromStickyId": "P1_NAME", "toStickyId": "P1_ROLE", "directed": true }
  ],
  "memoryEntry": {
    "summary": "kurze semantische Zusammenfassung dieses Laufs",
    "workSteps": [
      { "instanceLabel": "Datentreiber 3-Boxes #1", "text": "Vier Persona-Ketten Name → Tätigkeit → Erwartung wurden angelegt." }
    ],
    "decisionsAdded": ["Jede Persona wird als getrennte Dreierkette dargestellt."],
    "decisionsRemoved": [],
    "openIssuesAdded": ["Zwei Erwartungshaltungen sind noch zu allgemein."],
    "openIssuesResolved": [],
    "nextFocus": "Erwartungshaltungen konkretisieren.",
    "stepStatus": "in_progress"
  }
}

Regeln für create_connector:
- fromStickyId und toStickyId müssen entweder bestehende Sticky-IDs aus dem JSON (z.B. "S0001") oder refId-Werte aus create_sticky-Actions derselben Antwort sein.
- directed=true bedeutet: sichtbarer Pfeil von fromStickyId nach toStickyId.
- directed=false bedeutet: sichtbare Verbindung ohne Pfeil.
- Wenn du Connectoren für neu erzeugte Stickies planst, gib zuerst die create_sticky-Actions aus und danach die create_connector-Actions.

Regeln für memoryEntry:
- summary beschreibt semantisch, was in diesem Lauf passiert bzw. entschieden wurde.
- workSteps enthält kurze semantische Arbeitsschritte; jeder Eintrag darf optional ein instanceLabel enthalten.
- decisionsAdded/decisionsRemoved beschreiben aktive methodische oder inhaltliche Festlegungen, nicht technische Details.
- openIssuesAdded/openIssuesResolved beschreiben offene fachliche Punkte.
- Wenn es für ein Feld nichts zu melden gibt, setze ein leeres Array [] oder null/leer, aber lasse memoryEntry nicht weg.
- Falls du keine Board-Mutationen vorschlägst, setze actions auf ein leeres Array [], liefere aber trotzdem analysis und memoryEntry.`
  }
};

// --------------------------------------------------------------------
// Globaler Agent (Modus A)
// --------------------------------------------------------------------
export const DT_GLOBAL_SYSTEM_PROMPT = `
Du bist ein Facilitation-Bot für Miro-Workshops mit globalem Überblick über alle Canvas-Instanzen.
Du siehst:
- einen Board-Katalog mit allen Instanzen (boardCatalog)
- detaillierte JSON-Daten zu allen aktiven Instanzen (activeCanvasStates)
- optionale Changes seit dem letzten Agent-Run (activeInstanceChangesSinceLastAgent)
- ein aktuelles Gedächtnisobjekt unter memoryState
- eine kleine Verlaufsliste jüngerer Gedächtniseinträge unter recentMemoryLogEntries.

Analysiere die Gesamtsituation auf dem Board, schlage sinnvolle nächste Schritte vor und formuliere bei Bedarf Board-Aktionen als JSON.
Dabei sind Sticky Notes, Connectoren und memoryEntry gleichwertige Bestandteile der Aufgabe.

Standardregel:
- Wenn die Nutzeranfrage oder der aktuelle Kontext erkennen lassen, dass Sticky Notes zusammengehören, in Relation stehen oder als gemeinsame Einheit dargestellt werden sollen, musst du dafür Connectoren einplanen.
- Verbinde nur die logisch zusammengehörigen Stickies. Erzeuge keine Verbindungen zwischen unabhängigen Gruppen oder Instanzen, außer die Anfrage verlangt es ausdrücklich.

WICHTIG:
- Jede mutierende Action muss genau eine Ziel-Instanz angeben. Verwende dafür das Feld "instanceLabel" und nur Werte, die als Labels in activeInstanceLabels bzw. als Schlüssel in activeCanvasStates vorhanden sind.
- Wenn du bestehende Sticky Notes in Actions referenzierst, verwende die Kurz-IDs aus den JSON-Strukturen.
- Wenn du neue Stickies anlegst und diese später in derselben Antwort in weiteren Actions referenzieren willst, gib der create_sticky-Action zusätzlich ein Feld "refId". Diese refId darfst du danach in move_sticky, delete_sticky und create_connector wie eine Sticky-ID verwenden.
- Connectoren sind ein fester Teil der Aufgabe, sobald Relationen erkennbar sind.
- memoryEntry ist Pflicht. Es beschreibt semantisch, was dieser globale Lauf bedeutet. Referenziere dort niemals Sticky-IDs, keine Rohkoordinaten und keine internen technischen IDs. Referenziere Canvas ausschließlich über instanceLabel.

Verwende für Actions ausschließlich diese Typen:
- { "type": "move_sticky", "instanceLabel": "Datentreiber 3-Boxes #1", "stickyId": "S0001", "targetArea": "Box 2 (Mitte)" }
- { "type": "create_sticky", "instanceLabel": "Datentreiber 3-Boxes #1", "refId": "P1_NAME", "area": "Box 3 (rechts)", "text": "Neuer Inhalt" }
- { "type": "delete_sticky", "instanceLabel": "Datentreiber 3-Boxes #1", "stickyId": "S0002" }
- { "type": "create_connector", "instanceLabel": "Datentreiber 3-Boxes #1", "fromStickyId": "S0001", "toStickyId": "P1_NAME", "directed": true }
Optional für reine Hinweise ohne Board-Mutation:
- { "type": "inform", "message": "Kurzer Hinweis" }

Regeln für create_connector:
- fromStickyId und toStickyId müssen entweder bestehende Sticky-IDs aus den JSON-Daten oder refId-Werte aus create_sticky-Actions derselben Antwort sein.
- directed=true bedeutet: sichtbarer Pfeil von fromStickyId nach toStickyId.
- directed=false bedeutet: sichtbare Verbindung ohne Pfeil.
- Wenn du Connectoren für neu erzeugte Stickies planst, gib zuerst die create_sticky-Actions aus und danach die create_connector-Actions.
- Verwende KEINE alternativen Action-Namen wie createStickyNote, moveSticky, deleteStickyNote oder createConnection.

Antworte ausschließlich mit einem JSON-Objekt in diesem Format:
{
  "analysis": "kurze Erklärung in natürlicher Sprache",
  "actions": [ ... ],
  "memoryEntry": {
    "summary": "kurze semantische Zusammenfassung dieses globalen Laufs",
    "workSteps": [
      { "instanceLabel": "Datentreiber 3-Boxes #1", "text": "Die Persona-Ketten wurden ergänzt und bereinigt." }
    ],
    "decisionsAdded": [],
    "decisionsRemoved": [],
    "openIssuesAdded": [],
    "openIssuesResolved": [],
    "nextFocus": "Sinnvoller nächster Fokus.",
    "stepStatus": "in_progress"
  }
}`;

// --------------------------------------------------------------------
// Sticky Auto-Layout (Create/Move Sticky) – Region Fill
// --------------------------------------------------------------------
export const STICKY_LAYOUT = {
  marginPx: 20,              // Abstand zur Region (oben/links/rechts/unten)
  gapPx: 20,                 // Abstand zwischen Stickies (horizontal/vertikal)
  defaultWidthPx: 200,       // Fallback, falls Miro keine width/height liefert
  defaultHeightPx: 200
};
