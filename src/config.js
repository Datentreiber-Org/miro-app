// OpenAI
export const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";

// --------------------------------------------------------------------
// Template / Canvas / Storage Konfiguration
// --------------------------------------------------------------------
export const TEMPLATE_ID = "datentreiber-3boxes";
export const TEMPLATE_IMAGE_URL =
  "https://www.datentreiber.com/wp-content/uploads/2024/12/Datentreiber_EN_3-Boxes_v1-1_20240610.png";

export const ANALYTICS_AI_USE_CASE_TEMPLATE_ID = "datentreiber-analytics-ai-use-case";
export const ANALYTICS_AI_USE_CASE_IMAGE_URL =
  "https://www.datentreiber.com/wp-content/uploads/2024/08/Datentreiber_EN_Analytics-AI-Use-Case_v1-1_20240610.png";

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
  },
  [ANALYTICS_AI_USE_CASE_TEMPLATE_ID]: {
    canvasTypeId: ANALYTICS_AI_USE_CASE_TEMPLATE_ID,
    displayName: "Analytics & AI Use Case",
    agentLabelPrefix: "Analytics & AI Use Case",
    thumbnailUrl: ANALYTICS_AI_USE_CASE_IMAGE_URL,
    imageUrl: ANALYTICS_AI_USE_CASE_IMAGE_URL,
    insertWidthPx: 2000,
    promptContext: `
Dieser Canvas-Typ ist das Analytics & AI Use Case Canvas.
Ziel dieses Canvas ist es, einen Analytics- oder KI-Anwendungsfall konsequent aus einer realen Nutzer- und Entscheidungssituation herzuleiten.

Die rechte Seite beschreibt die Nutzerperspektive. Sie sollte fachlich zuerst tragfähig werden:
- User & Situation: konkrete Nutzerrolle oder Nutzergruppe, Auslöser, Arbeitssituation, Kontext, Job to be done.
- Objectives & Results: angestrebte Ziele oder messbare gewünschte Ergebnisse.
- Decisions & Actions: reale Entscheidungen oder Handlungen, die der Nutzer treffen oder ausführen muss.
- User Gains: gewünschte positive Effekte aus Nutzersicht.
- User Pains: Hindernisse, Unsicherheiten, Friktionen, Risiken oder Aufwände aus Nutzersicht.

Die linke Seite beschreibt die Lösungsperspektive, die aus der rechten Seite abgeleitet werden muss:
- Solutions: Lösungsideen oder Interventionen auf Use-Case-Ebene, keine bloßen Buzzwords.
- Information: konkrete Informationen, Signale oder Erkenntnisse, die Entscheidungen oder Handlungen verbessern.
- Functions: Funktionen oder Mechanismen, mit denen diese Informationen erzeugt, bereitgestellt oder nutzbar gemacht werden.
- Benefits: resultierende Vorteile der Lösung, die Pains reduzieren, Gains verstärken oder zu besseren Ergebnissen und Zielen beitragen.

Das Feld Check in der Mitte dient dem Problem-Solution-Fit. Dort werden kurze Verdichtungen festgehalten, warum die Lösung für die konkrete Nutzer- und Entscheidungssituation Sinn ergibt.

Fachliche Arbeitslogik dieses Canvas:
- Arbeite grundsätzlich erst rechts, dann links und zuletzt das Feld Check.
- Gute Inhalte sind konkret, atomar und area-genau; eine Sticky Note sollte möglichst nur eine klare Aussage enthalten.
- Entscheidungen und Handlungen sind der methodische Drehpunkt: Informationen und Funktionen sind nur dann wertvoll, wenn sie Entscheidungen oder Handlungen tatsächlich verbessern.
- Nutze als Leitlinie die Kette Information → Decisions & Actions → Results → Objectives.
- Benefits sind nur dann tragfähig, wenn sie aus der Lösung ableitbar sind und einen Bezug zu Pains, Gains, Results oder Objectives haben.
- Vermeide zu frühe Technologiediskussionen, Systemarchitekturen oder generische KI-Floskeln ohne Bezug zur Nutzerarbeit.
- Connectoren sind sinnvoll, wenn klare semantische Beziehungen lesbar gemacht werden, insbesondere zwischen Information und Decisions & Actions sowie zwischen Benefits und den adressierten Pains, Gains, Results oder Objectives.

Qualitätskriterien:
- Lieber konkrete, überprüfbare Formulierungen als abstrakte Schlagworte.
- Objectives & Results beschreiben erwünschte Zustände oder Outcomes, nicht bloß Maßnahmen.
- Decisions & Actions beschreiben Verhalten oder Auswahlhandlungen, nicht Features.
- User Gains sind nicht dasselbe wie Benefits: Gains kommen aus Nutzersicht, Benefits aus der Lösungsperspektive.
- User Pains sind nicht dasselbe wie Objectives: Pains beschreiben Probleme oder Friktionen, Objectives beschreiben Zielzustände.

Didaktischer Reifegrad:
- Wenn die relevante Seite des Canvas leer oder fast leer ist, wechsle von harter Bewertung zu aktivierender Anleitung: erkläre einen sinnvollen Einstieg, schlage eine Reihenfolge vor und gib konkrete Formulierungsanstöße.
- Wenn bereits Material vorhanden ist, arbeite anschlussfähig an den vorhandenen Inhalten statt das Canvas völlig neu zu erfinden.
- Wenn der Canvas reif ist, darfst du strenger auf Konsistenz, Präzision und Problem-Solution-Fit prüfen.`.trim()
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
export const DT_STORAGE_KEY_BOARD_FLOW_INDEX = "dt-board-flow-index-v1";
export const DT_STORAGE_KEY_BOARD_FLOW_PREFIX = "dt-board-flow-v1:";
export const DT_SHAPE_META_KEY_FLOW_CONTROL = "dt-flow-control-v1";
export const DT_MEMORY_RECENT_LOG_LIMIT = 12;

export const DT_FLOW_SCOPE_TYPES = Object.freeze(["fixed_instances", "global"]);
export const DT_FLOW_CONTROL_STATES = Object.freeze(["active", "disabled", "done"]);
export const DT_FLOW_CONTROL_LAYOUT = Object.freeze({
  widthPx: 180,
  heightPx: 52,
  gapXPx: 24,
  offsetFromCanvasBottomPx: 120
});

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
  },
  [ANALYTICS_AI_USE_CASE_TEMPLATE_ID]: {
    originalWidth: 1000,
    originalHeight: 720,
    headerPolygons: [
      {
        id: "1a_header",
        title: "Header",
        polygonNorm: [
          [0.1560, 0.0194],
          [0.6260, 0.0194],
          [0.6260, 0.1042],
          [0.1560, 0.1042]
        ]
      }
    ],
    footerPolygons: [
      {
        id: "1b_footer",
        title: "Footer",
        polygonNorm: [
          [0.0160, 0.9236],
          [0.5690, 0.9236],
          [0.5690, 0.9806],
          [0.0160, 0.9806]
        ]
      }
    ],
    regionPolygons: [
      {
        id: "2_user_and_situation",
        title: "User & Situation",
        polygonNorm: [
          [0.7090, 0.4625],
          [0.7940, 0.4625],
          [0.7940, 0.5458],
          [0.7090, 0.5458]
        ]
      },
      {
        id: "3_objectives_and_results",
        title: "Objectives & Results",
        polygonNorm: [
          [0.8990, 0.3083],[0.7900, 0.4583],[0.7980, 0.4583],[0.7980, 0.5500],[0.7250, 0.5500],[0.6120, 0.7042],[0.6390, 0.7333],[0.6620, 0.7528],[0.6930, 0.7708],[0.7270, 0.7806],[0.7590, 0.7833],[0.7930, 0.7778],[0.8210, 0.7667],[0.8550, 0.7458],[0.8920, 0.7056],[0.9190, 0.6625],[0.9420, 0.6042],[0.9540, 0.5319],[0.9530, 0.4625],[0.9400, 0.3972],[0.9230, 0.3514]
        ]
      },
      {
        id: "4_decisions_and_actions",
        title: "Decisions & Actions",
        polygonNorm: [
          [0.8920, 0.3000],[0.7780, 0.4583],[0.7070, 0.4583],[0.7070, 0.5486],[0.7130, 0.5486],[0.6060, 0.6958],[0.5830, 0.6556],[0.5680, 0.6153],[0.5570, 0.5722],[0.5510, 0.5194],[0.5530, 0.4583],[0.5620, 0.4097],[0.5760, 0.3667],[0.5950, 0.3264],[0.6170, 0.2944],[0.6390, 0.2694],[0.6700, 0.2472],[0.7040, 0.2306],[0.7440, 0.2222],[0.7760, 0.2236],[0.8040, 0.2319],[0.8400, 0.2500],[0.8660, 0.2708]
        ]
      },
      {
        id: "5a_user_gains",
        title: "User Gains",
        polygonNorm: [
          [0.5020, 0.4722],[0.5040, 0.1542],[0.9960, 0.1542],[0.9980, 0.4736],[0.9570, 0.4736],[0.9520, 0.4361],[0.9430, 0.3931],[0.9290, 0.3569],[0.9110, 0.3208],[0.8870, 0.2861],[0.8630, 0.2597],[0.8300, 0.2375],[0.7940, 0.2222],[0.7610, 0.2167],[0.7220, 0.2194],[0.6870, 0.2306],[0.6480, 0.2542],[0.6150, 0.2889],[0.5850, 0.3333],[0.5650, 0.3833],[0.5530, 0.4278],[0.5480, 0.4708]
        ]
      },
      {
        id: "5b_user_pains",
        title: "User Pains",
        polygonNorm: [
          [0.5010, 0.5306],[0.5030, 0.8500],[0.9990, 0.8569],[0.9990, 0.5347],[0.9570, 0.5347],[0.9510, 0.5722],[0.9420, 0.6139],[0.9250, 0.6569],[0.9020, 0.6986],[0.8710, 0.7347],[0.8370, 0.7625],[0.7980, 0.7806],[0.7520, 0.7875],[0.7040, 0.7792],[0.6620, 0.7583],[0.6250, 0.7250],[0.5990, 0.6917],[0.5720, 0.6389],[0.5550, 0.5819],[0.5490, 0.5306]
        ]
      },
      {
        id: "6_solutions",
        title: "Solutions",
        polygonNorm: [
          [0.0220, 0.3944],[0.0220, 0.6097],[0.2570, 0.6083],[0.2770, 0.5000],[0.2570, 0.3944]
        ]
      },
      {
        id: "6a_information",
        title: "Information",
        polygonNorm: [
          [0.0210, 0.1861],[0.2180, 0.1847],[0.2570, 0.3931],[0.0220, 0.3931]
        ]
      },
      {
        id: "6b_functions",
        title: "Functions",
        polygonNorm: [
          [0.0220, 0.8153],[0.2180, 0.8153],[0.2570, 0.6097],[0.0220, 0.6111]
        ]
      },
      {
        id: "7_benefits",
        title: "Benefits",
        polygonNorm: [
          [0.2200, 0.8153],[0.4750, 0.8153],[0.4750, 0.1875],[0.2200, 0.1847],[0.2790, 0.5014]
        ]
      },
      {
        id: "8_check",
        title: "Check",
        polygonNorm: [
          [0.5010, 0.4750],[0.5480, 0.4750],[0.5480, 0.5278],[0.5010, 0.5278]
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
- Gib niemals Markdown, keine Code-Fences und keine Vor- oder Nachbemerkungen aus.
- Der API-Call erzwingt zusätzlich ein JSON-Schema. Deshalb müssen alle Top-Level-Felder immer vorhanden sein.
- Wenn recommendations oder evaluation inhaltlich leer sind, liefere dennoch das Objekt mit leeren Strings/null-Werten und leeren Arrays gemäß Schema.
{

  "analysis": "kurze Erklärung in natürlicher Sprache",
  "actions": [ ... ],
  "memoryEntry": {
    "summary": "kurze semantische Zusammenfassung dieses Laufs",
    "workSteps": [
      { "instanceLabel": "Analytics & AI Use Case #1", "text": "Kurzer semantischer Arbeitsschritt." }
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

function buildSelectionSystemPrompt() {
  return `
Du bist ein Facilitation-Bot für Miro-Workshops.
Du siehst:
- eine oder mehrere selektierte Canvas-Instanzen mit Sticky Notes als JSON unter activeCanvasState bzw. activeCanvasStates
- einen Board-Katalog mit allen weiteren Instanzen (nur als Zusammenfassung)
- ein aktuelles Gedächtnisobjekt unter memoryState
- eine kleine Verlaufsliste jüngerer Gedächtniseinträge unter recentMemoryLogEntries
- optional einen Übungs-/Trainingskontext unter exerciseContext.

Die genaue fachliche Bedeutung der Canvas-Instanzen wird in nachgelagerten Canvas-Typ-Kontextblöcken erklärt. Verlasse dich nicht auf stillschweigendes Vorwissen über einen bestimmten Canvas-Typ.

Deine Aufgabe besteht aus vier gleichwertigen Teilen:
1) sinnvolle Sticky Notes planen, verschieben, ergänzen oder löschen,
2) semantische Beziehungen zwischen Sticky Notes als sichtbare Connectoren auf dem Board planen,
3) den semantischen Arbeitsschritt dieses Laufs als memoryEntry verdichten,
4) ein verständliches feedback für Menschen erzeugen.

Standardregel:
- Sobald aus der Nutzeranfrage, dem Canvas-Kontext oder dem Exercise-Kontext ableitbar ist, dass Sticky Notes zusammengehören, voneinander abhängen, in Beziehung stehen oder als gemeinsame Einheit gelesen werden sollen, musst du dafür Connectoren einplanen.
- Beispiele für solche Beziehungen sind u.a.: "gehört zu", "hängt von ... ab", "führt zu", "unterstützt", "ist Teil von", "steht im Zusammenhang mit".
- Wenn mehrere getrennte Gruppen erzeugt werden, verbinde nur die Stickies innerhalb derselben Gruppe. Verbinde verschiedene Gruppen nur dann miteinander, wenn der aktuelle Kontext das ausdrücklich verlangt.

WICHTIG:
- Jede bestehende Sticky Note in activeCanvasState bzw. activeCanvasStates hat eine kurze ID im Feld "id" (z.B. "S0001"). Wenn du eine bestehende Sticky Note in einer Action referenzierst, verwende genau diese ID.
- Wenn du neue Stickies anlegst und diese später in derselben Antwort in weiteren Actions referenzieren willst, gib der create_sticky-Action zusätzlich ein Feld "refId" (z.B. "P1_NAME"). Danach darfst du diese refId in move_sticky, delete_sticky und create_connector wie eine Sticky-ID verwenden.
- Canvas-Instanzen werden immer über menschenlesbare Labels referenziert, z.B. "Datentreiber 3-Boxes #1" oder "Analytics & AI Use Case #1".
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

${buildCommonAgentContractBlock("selection / instanzbezogenen Agentenlauf")}`;
}

// --------------------------------------------------------------------
// Prompt-Katalog (Modus B, instanzspezifisch)
// --------------------------------------------------------------------
export const DT_PROMPT_CATALOG = {
  [TEMPLATE_ID]: {
    system: buildSelectionSystemPrompt()
  },
  [ANALYTICS_AI_USE_CASE_TEMPLATE_ID]: {
    system: buildSelectionSystemPrompt()
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
- { "type": "move_sticky", "instanceLabel": "Analytics & AI Use Case #1", "stickyId": "S0001", "targetArea": "Objectives & Results" }
- { "type": "create_sticky", "instanceLabel": "Analytics & AI Use Case #1", "refId": "FIT_1", "area": "Check", "text": "Information improves a critical decision." }
- { "type": "delete_sticky", "instanceLabel": "Analytics & AI Use Case #1", "stickyId": "S0002" }
- { "type": "create_connector", "instanceLabel": "Analytics & AI Use Case #1", "fromStickyId": "S0001", "toStickyId": "FIT_1", "directed": true }
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
