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
    assetWidthPx: 4550,
    assetHeightPx: 3219,
    insertWidthPx: 4550,
    promptContext: `
Dieser Canvas-Typ hat drei Body-Bereiche plus Header und Footer.
Verwende für area bzw. targetArea ausschließlich diese Area-Keys:
- header = Header: Fokus oder Arbeitstitel des Canvas.
- left = Box 1 (links)
- middle = Box 2 (Mitte)
- right = Box 3 (rechts)
- sorted_out_left = seitlicher Sorted-out-Bereich links außerhalb des sichtbaren Canvas
- sorted_out_right = seitlicher Sorted-out-Bereich rechts außerhalb des sichtbaren Canvas
Sticky Notes müssen inhaltlich sinnvoll diesen Bereichen zugeordnet werden.
Die Sorted-out-Bereiche dienen zum bewussten Parken, Aussortieren oder späteren Wiederaufgreifen von Notizen; sie sind kein normaler Arbeitsbereich innerhalb der sichtbaren Canvas-Fläche.
Plane Connectoren nur dann, wenn eine konkrete fachliche Beziehung explizit sichtbar gemacht werden soll. Bloße thematische Nähe, Brainstorm-Sammlungen oder Cluster sind kein automatischer Grund für Connectoren.`.trim()
  },
  [ANALYTICS_AI_USE_CASE_TEMPLATE_ID]: {
    canvasTypeId: ANALYTICS_AI_USE_CASE_TEMPLATE_ID,
    displayName: "Analytics & AI Use Case",
    agentLabelPrefix: "Analytics & AI Use Case",
    thumbnailUrl: ANALYTICS_AI_USE_CASE_IMAGE_URL,
    imageUrl: ANALYTICS_AI_USE_CASE_IMAGE_URL,
    assetWidthPx: 4550,
    assetHeightPx: 3219,
    insertWidthPx: 4550,
    promptContext: `
Dieser Canvas-Typ ist das Analytics & AI Use Case Canvas.

Verwende für area bzw. targetArea ausschließlich diese Area-Keys:
- header = Header: Fokus, Use-Case-Name oder konkreter Arbeitstitel dieses Canvas.
- 2_user_and_situation = User & Situation: konkrete Nutzerrolle oder Nutzergruppe, Auslöser, Arbeitssituation, Kontext, Job to be done.
- 3_objectives_and_results = Objectives & Results: angestrebte Ziele oder messbare gewünschte Ergebnisse.
- 4_decisions_and_actions = Decisions & Actions: reale Entscheidungen oder Handlungen, die der Nutzer treffen oder ausführen muss.
- 5a_user_gains = User Gains: gewünschte positive Effekte aus Nutzersicht.
- 5b_user_pains = User Pains: Hindernisse, Unsicherheiten, Friktionen, Risiken oder Aufwände aus Nutzersicht.
- 6_solutions = Solutions: Lösungsideen oder Interventionen auf Use-Case-Ebene.
- 6a_information = Information: konkrete Informationen, Signale oder Erkenntnisse, die Entscheidungen oder Handlungen verbessern.
- 6b_functions = Functions: Funktionen oder Mechanismen, mit denen diese Informationen erzeugt, bereitgestellt oder nutzbar gemacht werden.
- 7_benefits = Benefits: resultierende Vorteile der Lösung.
- 8_check = Check: späte Verdichtungen zum Problem-Solution-Fit.
- sorted_out_left = seitlicher Sorted-out-Bereich links außerhalb des sichtbaren Canvas
- sorted_out_right = seitlicher Sorted-out-Bereich rechts außerhalb des sichtbaren Canvas

Canvas-Invarianten:
- Rechte Seite = Problemraum; linke Seite = Lösungsperspektive; 8_check kommt zuletzt.
- Objectives & Results beschreibt Outcomes; Decisions & Actions beschreibt Verhalten oder Auswahlhandlungen.
- User Gains kommen aus Nutzersicht; Benefits kommen aus der Lösungsperspektive.
- Sorted-out links/rechts dienen zum bewussten Parken außerhalb der sichtbaren Canvas-Fläche.
- Sticky Notes stehen grundsätzlich zunächst für sich; Connectoren nur bei expliziter methodischer Relation.
- Die Footer-/Legend-Region ist nicht Teil des Agentenkatalogs und kein zu füllender Arbeitsbereich.`.trim()
  }
};

// Persistenz (Global-Baseline + Memory)
export const DT_STORAGE_COLLECTION_NAME = "datentreiber-mirobot";
export const DT_STORAGE_KEY_META = "dt-global-meta-v1";
export const DT_STORAGE_KEY_BASELINE_PREFIX = "dt-baseline-v1:";
export const DT_STORAGE_KEY_MEMORY_STATE = "dt-memory-state-v1";
export const DT_STORAGE_KEY_MEMORY_LOG_INDEX = "dt-memory-log-index-v1";
export const DT_STORAGE_KEY_MEMORY_LOG_ENTRY_PREFIX = "dt-memory-log-entry-v1:";
export const DT_IMAGE_META_KEY_INSTANCE = "dt-canvas-instance-v1";
export const DT_ANCHOR_META_KEY_BOARD = "dt-board-config-v1";
export const DT_STORAGE_KEY_EXERCISE_RUNTIME = "dt-exercise-runtime-v1";
export const DT_STORAGE_KEY_BOARD_FLOW_INDEX = "dt-board-flow-index-v1";
export const DT_STORAGE_KEY_BOARD_FLOW_PREFIX = "dt-board-flow-v1:";
export const DT_STORAGE_KEY_RUN_STATE = "dt-run-state-v1";
export const DT_STORAGE_KEY_PROPOSAL_INDEX = "dt-proposal-index-v1";
export const DT_STORAGE_KEY_PROPOSAL_PREFIX = "dt-proposal-v1:";
export const DT_SHAPE_META_KEY_FLOW_CONTROL = "dt-flow-control-v1";
export const DT_SHAPE_META_KEY_CHAT_INTERFACE = "dt-chat-interface-v1";
export const DT_MEMORY_RECENT_LOG_LIMIT = 5;
export const DT_RUN_STATE_STALE_AFTER_MS = 15 * 60 * 1000;

export const DT_SORTED_OUT_REGION_WIDTH_PX = 50 * (2 / 3);
export const DT_SORTED_OUT_BUFFER_WIDTH_PX = 50 * (2 / 3);
export const DT_SORTED_OUT_REGION_IDS = Object.freeze(["sorted_out_left", "sorted_out_right"]);
export const DT_SORTED_OUT_REGION_TITLES = Object.freeze({
  sorted_out_left: "Sorted out (left)",
  sorted_out_right: "Sorted out (right)"
});
export const DT_EXCLUDE_FOOTER_FROM_AGENT_CATALOG_DEFAULT = true;
export const DT_CHECK_TAG_TITLE = "✔️";
export const DT_CHECK_TAG_COLOR = "green";
export const DT_STICKY_COLOR_VALUES = Object.freeze([
  "gray",
  "light_yellow",
  "yellow",
  "orange",
  "light_green",
  "green",
  "dark_green",
  "cyan",
  "light_pink",
  "pink",
  "violet",
  "red",
  "light_blue",
  "blue",
  "dark_blue",
  "black"
]);

const DT_STICKY_COLOR_ALIASES = Object.freeze({
  grey: "gray",
  magenta: "pink",
  purple: "violet",
  teal: "cyan",
  sky: "light_blue",
  sky_blue: "light_blue",
  lightblue: "light_blue",
  lightgreen: "light_green",
  darkgreen: "dark_green",
  darkblue: "dark_blue",
  lightyellow: "light_yellow",
  offwhite: "light_yellow",
  white: "light_yellow"
});

export function normalizeStickyColorToken(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  if (DT_STICKY_COLOR_VALUES.includes(normalized)) return normalized;
  return DT_STICKY_COLOR_ALIASES[normalized] || null;
}

export const DT_FLOW_SCOPE_TYPES = Object.freeze(["fixed_instances", "global"]);
export const DT_FLOW_CONTROL_STATES = Object.freeze(["active", "disabled", "done"]);
export const DT_FLOW_CONTROL_LAYOUT = Object.freeze({
  widthPx: 180,
  heightPx: 52,
  gapXPx: 24,
  offsetFromCanvasBottomPx: 120
});

export const DT_FLOW_CONTROL_STATE_STYLES = Object.freeze({
  active: Object.freeze({
    fillColor: "#22c55e",
    borderColor: "#15803d",
    textColor: "#052e16"
  }),
  disabled: Object.freeze({
    fillColor: "#facc15",
    borderColor: "#ca8a04",
    textColor: "#422006"
  }),
  done: Object.freeze({
    fillColor: "#166534",
    borderColor: "#14532d",
    textColor: "#ecfdf5"
  })
});


export const DT_CHAT_INTERFACE_LAYOUT = Object.freeze({
  outerGapXPx: 260,
  columnGapXPx: 88,
  submitGapYPx: 44,
  outputHeightPerCanvasHeight: 0.5,
  outputWidthPerCanvasHeight: 0.54,
  inputWidthPerOutputWidth: 0.9,
  inputHeightPerOutputHeight: 0.52,
  submitWidthPerInputWidth: 0.72,
  submitHeightPx: 88,
  minOutputWidthPx: 420,
  maxOutputWidthPx: 720,
  minInputWidthPx: 360,
  maxInputWidthPx: 640,
  minSubmitWidthPx: 220,
  maxSubmitWidthPx: 340
});

export const DT_CHAT_INTERFACE_STYLES = Object.freeze({
  input: Object.freeze({
    fillColor: "#dfe8e4",
    borderColor: "#7c8a86",
    textColor: "#111827",
    fontSize: 18,
    textAlign: "left",
    textAlignVertical: "top",
    borderWidth: 2
  }),
  output: Object.freeze({
    fillColor: "#e9e8f5",
    borderColor: "#8b89a7",
    textColor: "#111827",
    fontSize: 18,
    textAlign: "left",
    textAlignVertical: "top",
    borderWidth: 2
  }),
  submit: Object.freeze({
    fillColor: "#9ed0f2",
    borderColor: "#5a9ecb",
    textColor: "#111827",
    fontSize: 22,
    textAlign: "center",
    textAlignVertical: "middle",
    borderWidth: 2
  })
});

export const DT_CHAT_INTERFACE_PLACEHOLDERS = Object.freeze({
  input: "Frage hier eingeben …",
  output: "Agentenantwort erscheint hier.",
  submit: "Submit"
});

export const DT_QUESTION_SYSTEM_PROMPT = `
Du bist ein hilfreicher Canvas-Assistent für Miro-Workshops.
Beantworte allgemeine Fragen zur zugehörigen Canvas-Instanz klar, knapp und verständlich.
Nutze den Board-Katalog nur als Überblick, aber stütze deine Antwort inhaltlich primär auf activeCanvasState der zugehörigen Instanz.
Führe keine Board-Aktionen aus.
Plane keine Mutationen.
Schalte keine Buttons frei.
Schreibe kein memoryEntry.
Antworte ausschließlich mit einem JSON-Objekt dieses Formats:
{
  "answer": "..."
}
Gib niemals Markdown, keine Code-Fences und keine Vor- oder Nachbemerkungen aus.
`.trim();

export const DT_RUN_STATUS_LAYOUT = Object.freeze({
  widthPx: 240,
  heightPx: 64,
  offsetFromCanvasTopPx: 54
});

// Trigger / Feedback Engine Defaults
export const DT_TRIGGER_SCOPES = Object.freeze(["selection", "global"]);
export const DT_TRIGGER_INTENTS = Object.freeze(["check", "hint", "autocorrect", "review", "synthesize", "coach", "grade", "propose", "apply"]);
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
  "selection.propose":      { scope: "selection", intent: "propose",      requiresSelection: true,  mutationPolicy: "full",    feedbackPolicy: "text" },
  "selection.apply":        { scope: "selection", intent: "apply",        requiresSelection: true,  mutationPolicy: "full",    feedbackPolicy: "text" },
  "global.check":           { scope: "global",    intent: "check",        requiresSelection: false, mutationPolicy: "limited", feedbackPolicy: "text" },
  "global.hint":            { scope: "global",    intent: "hint",         requiresSelection: false, mutationPolicy: "minimal", feedbackPolicy: "text" },
  "global.autocorrect":     { scope: "global",    intent: "autocorrect",  requiresSelection: false, mutationPolicy: "full",    feedbackPolicy: "both" },
  "global.review":          { scope: "global",    intent: "review",       requiresSelection: false, mutationPolicy: "none",    feedbackPolicy: "text" },
  "global.synthesize":      { scope: "global",    intent: "synthesize",   requiresSelection: false, mutationPolicy: "none",    feedbackPolicy: "text" },
  "global.coach":           { scope: "global",    intent: "coach",        requiresSelection: false, mutationPolicy: "none",    feedbackPolicy: "text" },
  "global.grade":           { scope: "global",    intent: "grade",        requiresSelection: false, mutationPolicy: "none",    feedbackPolicy: "text" },
  "global.propose":         { scope: "global",    intent: "propose",      requiresSelection: false, mutationPolicy: "full",    feedbackPolicy: "text" },
  "global.apply":           { scope: "global",    intent: "apply",        requiresSelection: false, mutationPolicy: "full",    feedbackPolicy: "text" }
});

export const DT_DEFAULT_FEEDBACK_CHANNEL = "text";
export const DT_DEFAULT_APP_ADMIN_POLICY = "ui_toggle";

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

function buildExerciseContextBindingBlock() {
  return `
Wenn exerciseContext vorhanden ist, ist er verbindlich:
- exerciseContext.triggerKey beschreibt den aktuellen Ausführungsmodus, z.B. selection.check oder global.review.
- exerciseContext.triggerIntent, exerciseContext.mutationPolicy und exerciseContext.feedbackPolicy sind verbindliche Ausführungsrichtlinien.
- Halte dich an exerciseContext.allowedActions. Erfinde keine Action-Typen außerhalb des Vertrags.
- Für Exercise-Läufe ist feedback Pflicht. Feedback ist die sichtbare Erklärung für Nutzer und Facilitators.
- feedback.title enthält niemals eine Nummerierung; die App rendert die sichtbare Antwort selbst in die instanzgebundene Ausgabebox.
- flowControlDirectives sind app-seitige Freischaltungen für Board-Buttons. Nutze sie sparsam und nur dann, wenn didaktisch sinnvoll ein weiterer Button freigeschaltet oder als erledigt markiert werden soll.
- Verwende in flowControlDirectives ausschließlich runProfileIds aus flowControlCatalog.
- Wenn flowControlCatalog oder boardFlowState fehlen, lasse flowControlDirectives leer.
- Wenn exerciseContext.triggerKey auf ".grade" endet, ist evaluation Pflicht.
- Wenn keine Button-Freischaltung oder Erledigung nötig ist, setze beide Arrays in flowControlDirectives auf [].`.trim();
}

function buildActionReferenceRulesBlock({ instanceLabelRule = null } = {}) {
  const lines = [
    'WICHTIG:',
    '- Referenziere bestehende Stickies nur über ihre Kurz-ID im Feld "id" (z.B. "S0001").',
    '- Neue Stickies kannst du über refId für spätere Actions derselben Antwort referenzieren.',
    '- Referenziere Canvas-Instanzen nur über menschenlesbare instanceLabel-Werte.'
  ];

  if (instanceLabelRule) {
    lines.push(`- ${instanceLabelRule}`);
  }

  lines.push('- Für create_sticky und move_sticky gib nur area bzw. targetArea an. Verwende dafür exakt einen vorhandenen Area-Key aus activeCanvasState/activeCanvasStates → templates[].areas[].name; die App übernimmt die Platzierung. sorted_out_left und sorted_out_right sind seitliche Off-Canvas-Parkbereiche.');
  lines.push('- In memoryEntry referenziere Canvas nur über instanceLabel.');
  return lines.join("\n");
}

function buildConnectorRulesBlock({ forbidAltNames = false } = {}) {
  const lines = [
    'Regeln für create_connector:',
    '- fromStickyId und toStickyId müssen bestehende Sticky-IDs oder refId-Werte aus derselben Antwort sein.',
    '- directed=true = Pfeil von fromStickyId nach toStickyId.',
    '- directed=false = Verbindung ohne Pfeil.',
    '- Nutze create_connector nur für explizite Relationslogik: Beitrag, Ursache/Wirkung, Ablauf/Reihenfolge, Unterstützung, Feedback-Loop oder validierte Fit-/Traceability-Beziehung.',
    '- Erzeuge keine Connectoren nur wegen gleicher Area, gleicher Farbe, thematischer Nähe, Clusterzugehörigkeit, Brainstorm-Sammlung oder alternativer Varianten.',
    '- Nicht jede Sticky Note braucht einen Connector. Bevorzuge wenige, gut lesbare Kanten statt dichten Netzen.',
    '- Wenn neue Stickies verbunden werden sollen, gib zuerst create_sticky und danach create_connector aus.'
  ];

  if (forbidAltNames) {
    lines.push('- Verwende KEINE alternativen Action-Namen wie createStickyNote, moveSticky, deleteStickyNote oder createConnection.');
  }

  return lines.join("\n");
}

function buildCommonAgentContractBlock(modeLabel) {
  return `
${buildExerciseContextBindingBlock()}

Antworte ausschließlich mit einem JSON-Objekt in diesem Format:
- Gib niemals Markdown, keine Code-Fences und keine Vor- oder Nachbemerkungen aus.
- Der API-Call erzwingt zusätzlich ein JSON-Schema. Deshalb müssen alle Top-Level-Felder immer vorhanden sein.
- Wenn flowControlDirectives oder evaluation inhaltlich leer sind, liefere dennoch das Objekt mit leeren Arrays bzw. null/leer gemäß Schema.
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
    "summary": "Kurzfassung für die sichtbare Antwortbox",
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
  "flowControlDirectives": {
    "unlockRunProfileIds": ["analytics.fit.step1.hint"],
    "completeRunProfileIds": []
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

Regeln für flowControlDirectives:
- unlockRunProfileIds und completeRunProfileIds enthalten ausschließlich runProfileIds aus flowControlCatalog.
- unlockRunProfileIds schaltet vorhandene Buttons frei; fehlende Buttons darf die App im passenden Anchor-Kontext erzeugen.
- completeRunProfileIds markiert vorhandene Buttons als erledigt.
- Nutze flowControlDirectives nur sparsam und nur dann, wenn dies didaktisch wirklich sinnvoll ist.

Regeln für evaluation:
- evaluation ist optional, außer bei Triggern vom Typ *.grade.
- Nutze evaluation nur für qualitative Bewertung, nicht für technische Board-Diagnosen.

Regeln für memoryEntry:
- memoryEntry ist Pflicht.
- summary beschreibt semantisch, was in diesem Lauf passiert bzw. entschieden wurde.
- workSteps enthält kurze semantische Arbeitsschritte; jeder Eintrag darf optional ein instanceLabel enthalten.
- decisionsAdded/decisionsRemoved beschreiben aktive methodische oder inhaltliche Festlegungen, nicht technische Details.
- openIssuesAdded/openIssuesResolved beschreiben offene fachliche Punkte.
- Referenziere dort niemals Sticky-IDs, keine Rohkoordinaten und keine internen technischen IDs. Referenziere Canvas ausschließlich über instanceLabel.
- Wenn es für ein Feld nichts zu melden gibt, setze ein leeres Array [] oder null/leer, aber lasse memoryEntry nicht weg.
- Falls du keine Board-Mutationen vorschlägst, setze actions auf ein leeres Array [], liefere aber trotzdem analysis, memoryEntry und feedback.

Mechanische Zusatzregeln für Actions:
- create_sticky darf optional ein Feld color mit einer Miro-Sticky-Farbe tragen: gray, light_yellow, yellow, orange, light_green, green, dark_green, cyan, light_pink, pink, violet, red, light_blue, blue, dark_blue, black.
- create_sticky darf optional checked=true setzen; die App markiert die Sticky dann sichtbar als geprüft.
- set_sticky_color ändert die Farbe einer bestehenden Sticky und benötigt stickyId plus color.
- set_check_status ändert den sichtbaren Prüfstatus einer bestehenden Sticky und benötigt stickyId plus checked=true/false.
- Verwende keine Hex-Farben und keine freien Farbnamen außerhalb der unterstützten Miro-Palette.
- checked beschreibt einen sichtbaren Validierungsmarker der App. Nutze ihn nur, wenn ein Inhalt bewusst als geprüft, validiert oder bestätigt markiert werden soll.

Zusatz für ${modeLabel}:
- flowControlDirectives und evaluation dürfen niemals die eigentliche Board-Manipulation ersetzen; actions, memoryEntry und feedback bleiben gleichwertige Bestandteile des Outputs.`.trim();
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
- optional einen kleinen Button-Katalog unter flowControlCatalog sowie den aktuellen Board-Button-Zustand unter boardFlowState.

Die genaue fachliche Bedeutung der Canvas-Instanzen wird in nachgelagerten Canvas-Typ-Kontextblöcken erklärt. Verlasse dich nicht auf stillschweigendes Vorwissen über einen bestimmten Canvas-Typ.

Deine Aufgabe besteht aus vier koordinierten Teilen:
1) sinnvolle Sticky Notes planen, verschieben, ergänzen oder löschen,
2) nur dann semantische Beziehungen zwischen Sticky Notes als sichtbare Connectoren auf dem Board planen, wenn sie methodisch wirklich nötig sind,
3) den semantischen Arbeitsschritt dieses Laufs als memoryEntry verdichten,
4) ein verständliches feedback für Menschen erzeugen.

Standardregel für Connectoren:
- Plane Connectoren nicht automatisch.
- Eine gemeinsame Area, Farbe, thematische Nähe, Clusterzugehörigkeit, Brainstorm-Sammlung, Alternativsammlung oder das bloße Gefühl "das gehört zusammen" reicht nicht aus.
- Plane Connectoren nur dann, wenn eine explizite methodische Relation sichtbar gemacht werden soll, z. B. Beitrag, Ursache/Wirkung, Ablauf/Reihenfolge, Unterstützung einer Entscheidung/Handlung, Feedback-Loop oder validierter Problem-Solution-Fit.
- Nicht jede Sticky Note braucht einen eingehenden oder ausgehenden Connector. Unverbundene Stickies sind korrekt, wenn sie Sammlung, Alternative, Beobachtung oder Hypothese repräsentieren.
- Wenn mehrere getrennte Gruppen erzeugt werden, verbinde nur die Stickies innerhalb derselben klaren Relationsgruppe. Verbinde verschiedene Gruppen nur dann miteinander, wenn der aktuelle Kontext das ausdrücklich verlangt.
- Bevorzuge wenige, lesbare Kanten statt dichten Netzen.

${buildActionReferenceRulesBlock({
  instanceLabelRule: 'Wenn activeCanvasStates mehr als eine Instanz enthält, muss jede mutierende Action zusätzlich ein Feld "instanceLabel" enthalten. Der Wert muss exakt einem Label aus selectedInstanceLabels bzw. den Schlüsseln von activeCanvasStates entsprechen.'
})}

${buildConnectorRulesBlock()}

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
- optional einen kleinen Button-Katalog unter flowControlCatalog sowie den aktuellen Board-Button-Zustand unter boardFlowState.

Analysiere die Gesamtsituation auf dem Board, schlage sinnvolle nächste Schritte vor und formuliere bei Bedarf Board-Aktionen als JSON.
Dabei sind Sticky Notes, Connectoren, memoryEntry und feedback koordinierte Bestandteile der Aufgabe; Connectoren bleiben dabei optional und nie Selbstzweck.

Standardregel für Connectoren:
- Plane Connectoren nicht automatisch.
- Eine gemeinsame Area, Farbe, thematische Nähe, Clusterzugehörigkeit, Brainstorm-Sammlung, Alternativsammlung oder das bloße Gefühl "das gehört zusammen" reicht nicht aus.
- Plane Connectoren nur dann, wenn eine explizite methodische Relation sichtbar gemacht werden soll, z. B. Beitrag, Ursache/Wirkung, Ablauf/Reihenfolge, Unterstützung, Feedback-Loop oder validierter Problem-Solution-Fit.
- Nicht jede Sticky Note braucht einen eingehenden oder ausgehenden Connector. Unverbundene Stickies sind korrekt, wenn sie Sammlung, Alternative oder Beobachtung repräsentieren.
- Verbinde nur die logisch zusammengehörigen Stickies innerhalb derselben klaren Relationsgruppe. Erzeuge keine Verbindungen zwischen unabhängigen Gruppen oder Instanzen, außer die Anfrage verlangt es ausdrücklich.
- Bevorzuge wenige, lesbare Kanten statt dichten Netzen.

${buildActionReferenceRulesBlock({
  instanceLabelRule: 'Jede mutierende Action muss genau eine Ziel-Instanz angeben. Verwende dafür das Feld "instanceLabel" und nur Werte, die als Labels in activeInstanceLabels bzw. als Schlüssel in activeCanvasStates vorhanden sind.'
})}

Verwende für Actions nur die Vertragstypen move_sticky, create_sticky, delete_sticky, create_connector, set_sticky_color, set_check_status und optional inform.

${buildConnectorRulesBlock({ forbidAltNames: true })}

${buildCommonAgentContractBlock("globalen Agentenlauf")}`;

// --------------------------------------------------------------------
// Sticky Auto-Layout (Create/Move Sticky) – Region Fill
// --------------------------------------------------------------------
export const STICKY_LAYOUT = {
  marginPx: 20,              // Abstand zur Region (oben/links/rechts/unten)
  gapPx: 20,                 // Abstand zwischen Stickies (horizontal/vertikal)
  defaultShape: "rectangle",
  defaultWidthPx: 350,       // Miro Sticky Note Größe M (Breite)
  defaultHeightPx: 228       // Miro Sticky Note Größe M (Höhe, nur intern für Layout)
};
