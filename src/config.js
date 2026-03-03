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
    insertWidthPx: 2000,
    promptContext: `
Dieser Canvas-Typ hat drei Body-Bereiche plus Header und Footer:
- Box 1 (links)
- Box 2 (Mitte)
- Box 3 (rechts)
Sticky Notes müssen inhaltlich sinnvoll diesen Bereichen zugeordnet werden.
Wenn Beziehungen zwischen Stickies bestehen, sollen Connectoren so geplant werden, dass die inhaltliche Einheit lesbar bleibt.`.trim()
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
export const DT_ANCHOR_META_KEY_BOARD = "dt-board-config-v1";
export const DT_STORAGE_KEY_EXERCISE_RUNTIME = "dt-exercise-runtime-v1";
export const DT_MEMORY_RECENT_LOG_LIMIT = 12;

// Trigger / Feedback Engine Defaults
export const DT_TRIGGER_SCOPES = Object.freeze(["selection", "global"]);
export const DT_TRIGGER_INTENTS = Object.freeze(["check", "hint", "autocorrect", "review", "synthesize", "coach", "grade"]);
export const DT_TRIGGER_SOURCES = Object.freeze(["user", "admin", "system", "agent_recommendation"]);
export const DT_FEEDBACK_CHANNELS = Object.freeze(["panel", "text", "both"]);
export const DT_MUTATION_POLICIES = Object.freeze(["none", "minimal", "limited", "full"]);
export const DT_TRIGGER_KEYS = Object.freeze(
  DT_TRIGGER_SCOPES.flatMap((scope) => DT_TRIGGER_INTENTS.map((intent) => `${scope}.${intent}`))
);

export const DT_TRIGGER_DEFAULTS = Object.freeze({
  "selection.check":        { scope: "selection", intent: "check",        requiresSelection: true,  mutationPolicy: "limited", feedbackPolicy: "text" },
  "selection.hint":         { scope: "selection", intent: "hint",         requiresSelection: true,  mutationPolicy: "minimal", feedbackPolicy: "text" },
  "selection.autocorrect":  { scope: "selection", intent: "autocorrect",  requiresSelection: true,  mutationPolicy: "full",    feedbackPolicy: "both" },
  "selection.review":       { scope: "selection", intent: "review",       requiresSelection: true,  mutationPolicy: "none",    feedbackPolicy: "text" },
  "selection.synthesize":   { scope: "selection", intent: "synthesize",   requiresSelection: true,  mutationPolicy: "none",    feedbackPolicy: "text" },
  "selection.coach":        { scope: "selection", intent: "coach",        requiresSelection: true,  mutationPolicy: "none",    feedbackPolicy: "text" },
  "selection.grade":        { scope: "selection", intent: "grade",        requiresSelection: true,  mutationPolicy: "none",    feedbackPolicy: "text" },
  "global.check":           { scope: "global",    intent: "check",        requiresSelection: false, mutationPolicy: "limited", feedbackPolicy: "text" },
  "global.hint":            { scope: "global",    intent: "hint",         requiresSelection: false, mutationPolicy: "minimal", feedbackPolicy: "text" },
  "global.autocorrect":     { scope: "global",    intent: "autocorrect",  requiresSelection: false, mutationPolicy: "full",    feedbackPolicy: "both" },
  "global.review":          { scope: "global",    intent: "review",       requiresSelection: false, mutationPolicy: "none",    feedbackPolicy: "text" },
  "global.synthesize":      { scope: "global",    intent: "synthesize",   requiresSelection: false, mutationPolicy: "none",    feedbackPolicy: "text" },
  "global.coach":           { scope: "global",    intent: "coach",        requiresSelection: false, mutationPolicy: "none",    feedbackPolicy: "text" },
  "global.grade":           { scope: "global",    intent: "grade",        requiresSelection: false, mutationPolicy: "none",    feedbackPolicy: "text" }
});

export const DT_DEFAULT_FEEDBACK_FRAME_NAME = "AI Coach Output";
export const DT_DEFAULT_FEEDBACK_CHANNEL = "text";
export const DT_DEFAULT_APP_ADMIN_POLICY = "ui_toggle";
export const DT_TEXT_META_KEY_FEEDBACK = "dt-feedback-text-v1";

export const DT_FEEDBACK_TEXT_LAYOUT = {
  frameWidthPx: 2400,
  frameHeightPx: 1600,
  framePaddingXPx: 48,
  framePaddingYPx: 48,
  itemWidthPx: 480,
  itemMinHeightPx: 240,
  gapXPx: 32,
  gapYPx: 32,
  maxColumns: 4,
  counterPadLength: 3
};

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

function buildCommonAgentContractBlock(modeLabel) {
  return `
Wenn exerciseContext vorhanden ist, sind zusätzlich folgende Regeln verbindlich:
- exerciseContext.triggerKey beschreibt den aktuellen Ausführungsmodus, z.B. selection.check oder global.review.
- exerciseContext.triggerIntent, exerciseContext.mutationPolicy und exerciseContext.feedbackPolicy sind verbindliche Ausführungsrichtlinien.
- Halte dich an exerciseContext.allowedActions. Erfinde keine Action-Typen außerhalb des Vertrags.
- Für Exercise-Läufe ist feedback Pflicht. Feedback ist die sichtbare Erklärung für Nutzer und Facilitators.
- feedback.title enthält niemals eine Nummerierung; die Nummerierung und Platzierung im Feedback-Frame übernimmt die App.
- recommendations sind Empfehlungen, keine technischen Befehle. Nutze sie, um den sinnvoll nächsten Trigger oder Schritt vorzuschlagen.
- Wenn exerciseContext.triggerKey auf ".grade" endet, ist evaluation Pflicht.
- Wenn du keinen sinnvollen nächsten Trigger oder Schritt empfehlen willst, setze die Felder in recommendations auf null/false.

Antworte ausschließlich mit einem JSON-Objekt in diesem Format:
{
  "analysis": "kurze Erklärung in natürlicher Sprache",
  "actions": [ ... ],
  "memoryEntry": {
    "summary": "kurze semantische Zusammenfassung dieses Laufs",
    "workSteps": [
      { "instanceLabel": "Datentreiber 3-Boxes #1", "text": "Kurzer semantischer Arbeitsschritt." }
    ],
    "decisionsAdded": [],
    "decisionsRemoved": [],
    "openIssuesAdded": [],
    "openIssuesResolved": [],
    "nextFocus": "Sinnvoller nächster Fokus.",
    "stepStatus": "in_progress"
  },
  "feedback": {
    "title": "Kurzer Titel ohne Nummerierung",
    "summary": "Kurzfassung für das Board-Feedback",
    "sections": [
      {
        "heading": "Beobachtungen",
        "bullets": ["Kurzer Punkt 1", "Kurzer Punkt 2"]
      },
      {
        "heading": "Empfehlungen",
        "bullets": ["Nächster sinnvoller Hinweis"]
      }
    ]
  },
  "recommendations": {
    "recommendedNextTrigger": "selection.hint",
    "recommendedNextStepId": null,
    "advanceStepSuggested": false,
    "reason": "Kurze Begründung für die Empfehlung."
  },
  "evaluation": {
    "score": 72,
    "scale": "0-100",
    "verdict": "solide, aber noch unvollständig",
    "rubric": [
      {
        "criterion": "Korrekte Platzierung",
        "status": "mostly_met",
        "comment": "Die meisten Stickies liegen korrekt, einzelne Ausnahmen bleiben."
      }
    ]
  }
}

Regeln für feedback:
- feedback ist für Exercise-Läufe Pflicht.
- Nutze nur menschenlesbare Sprache. Keine technischen IDs, keine Rohkoordinaten.
- sections ist optional, aber empfohlen.
- Wenn exerciseContext.feedbackPolicy = panel, bleibt feedback dennoch Pflicht; die App entscheidet über die Darstellung.

Regeln für recommendations:
- recommendedNextTrigger muss, wenn gesetzt, einer gültigen Trigger-Sprache folgen, z.B. selection.check oder global.synthesize.
- recommendedNextStepId muss, wenn gesetzt, einem realen Schritt im aktuellen Exercise Pack entsprechen.
- advanceStepSuggested ist nur eine Empfehlung und keine Ausführungsanweisung.

Regeln für evaluation:
- evaluation ist optional, außer bei Triggern vom Typ *.grade.
- Nutze evaluation nur für qualitative Bewertung, nicht für technische Board-Diagnosen.

Regeln für memoryEntry:
- summary beschreibt semantisch, was in diesem Lauf passiert bzw. entschieden wurde.
- workSteps enthält kurze semantische Arbeitsschritte; jeder Eintrag darf optional ein instanceLabel enthalten.
- decisionsAdded/decisionsRemoved beschreiben aktive methodische oder inhaltliche Festlegungen, nicht technische Details.
- openIssuesAdded/openIssuesResolved beschreiben offene fachliche Punkte.
- Wenn es für ein Feld nichts zu melden gibt, setze ein leeres Array [] oder null/leer, aber lasse memoryEntry nicht weg.
- Falls du keine Board-Mutationen vorschlägst, setze actions auf ein leeres Array [], liefere aber trotzdem analysis, memoryEntry und feedback.

Zusatz für ${modeLabel}:
- recommendations und evaluation dürfen niemals die eigentliche Board-Manipulation ersetzen; actions, memoryEntry und feedback bleiben gleichwertige Bestandteile des Outputs.`.trim();
}

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
- eine kleine Verlaufsliste jüngerer Gedächtniseinträge unter recentMemoryLogEntries
- optional einen Übungs-/Trainingskontext unter exerciseContext.

Deine Aufgabe besteht aus vier gleichwertigen Teilen:
1) sinnvolle Sticky Notes planen, verschieben, ergänzen oder löschen,
2) semantische Beziehungen zwischen Sticky Notes als sichtbare Connectoren auf dem Board planen,
3) den semantischen Arbeitsschritt dieses Laufs als memoryEntry verdichten,
4) ein verständliches feedback für Menschen erzeugen.

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
- Wenn exerciseContext vorhanden ist, behandle ihn als verbindlichen Zusatzkontext für Ziel, Schritt, erlaubte Aktionen, Mutation Policy und sichtbare Instruktion.

Regeln für create_connector:
- fromStickyId und toStickyId müssen entweder bestehende Sticky-IDs aus dem JSON (z.B. "S0001") oder refId-Werte aus create_sticky-Actions derselben Antwort sein.
- directed=true bedeutet: sichtbarer Pfeil von fromStickyId nach toStickyId.
- directed=false bedeutet: sichtbare Verbindung ohne Pfeil.
- Wenn du Connectoren für neu erzeugte Stickies planst, gib zuerst die create_sticky-Actions aus und danach die create_connector-Actions.

${buildCommonAgentContractBlock("selection / instanzbezogenen Agentenlauf")}`
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
- eine kleine Verlaufsliste jüngerer Gedächtniseinträge unter recentMemoryLogEntries
- optional einen Übungs-/Trainingskontext unter exerciseContext.

Analysiere die Gesamtsituation auf dem Board, schlage sinnvolle nächste Schritte vor und formuliere bei Bedarf Board-Aktionen als JSON.
Dabei sind Sticky Notes, Connectoren, memoryEntry und feedback gleichwertige Bestandteile der Aufgabe.

Standardregel:
- Wenn die Nutzeranfrage oder der aktuelle Kontext erkennen lassen, dass Sticky Notes zusammengehören, in Relation stehen oder als gemeinsame Einheit dargestellt werden sollen, musst du dafür Connectoren einplanen.
- Verbinde nur die logisch zusammengehörigen Stickies. Erzeuge keine Verbindungen zwischen unabhängigen Gruppen oder Instanzen, außer die Anfrage verlangt es ausdrücklich.

WICHTIG:
- Jede mutierende Action muss genau eine Ziel-Instanz angeben. Verwende dafür das Feld "instanceLabel" und nur Werte, die als Labels in activeInstanceLabels bzw. als Schlüssel in activeCanvasStates vorhanden sind.
- Wenn du bestehende Sticky Notes in Actions referenzierst, verwende die Kurz-IDs aus den JSON-Strukturen.
- Wenn du neue Stickies anlegst und diese später in derselben Antwort in weiteren Actions referenzieren willst, gib der create_sticky-Action zusätzlich ein Feld "refId". Diese refId darfst du danach in move_sticky, delete_sticky und create_connector wie eine Sticky-ID verwenden.
- Connectoren sind ein fester Teil der Aufgabe, sobald Relationen erkennbar sind.
- memoryEntry ist Pflicht. Es beschreibt semantisch, was dieser globale Lauf bedeutet. Referenziere dort niemals Sticky-IDs, keine Rohkoordinaten und keine internen technischen IDs. Referenziere Canvas ausschließlich über instanceLabel.
- Wenn exerciseContext vorhanden ist, behandle ihn als verbindlichen Zusatzkontext für Ziel, Schritt, erlaubte Aktionen, Mutation Policy und sichtbare Instruktion.

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

${buildCommonAgentContractBlock("globalen Agentenlauf")}`;

// --------------------------------------------------------------------
// Sticky Auto-Layout (Create/Move Sticky) – Region Fill
// --------------------------------------------------------------------
export const STICKY_LAYOUT = {
  marginPx: 20,              // Abstand zur Region (oben/links/rechts/unten)
  gapPx: 20,                 // Abstand zwischen Stickies (horizontal/vertikal)
  defaultWidthPx: 200,       // Fallback, falls Miro keine width/height liefert
  defaultHeightPx: 200
};
