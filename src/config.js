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
Canvas-Weltmodell für Datentreiber 3-Boxes:
- Dieses Canvas hat einen Header als Fokusanker und drei inhaltliche Arbeitsboxen: left, middle und right.
- Sorted-out links/rechts sind Off-Canvas-Parkbereiche für Alternativen, verworfene Ideen oder spätere Themen.

Verwende für area bzw. targetArea ausschließlich diese Area-Keys:
- header = Header: Fokus, Arbeitstitel oder Leitfrage des Canvas.
- left = Box 1 (links)
- middle = Box 2 (Mitte)
- right = Box 3 (rechts)
- sorted_out_left = seitlicher Sorted-out-Bereich links außerhalb des sichtbaren Canvas
- sorted_out_right = seitlicher Sorted-out-Bereich rechts außerhalb des sichtbaren Canvas

Canvas-Semantik:
- Der Header setzt den gemeinsamen Fokus. Ohne klaren Header fehlt dem restlichen Canvas der Arbeitsanker.
- Die drei Boxen sind gleichwertige Arbeitsflächen; ihre genaue Bedeutung ergibt sich aus dem aktiven Pack oder der sichtbaren Aufgabenstellung.
- Sorted-out ist kein normaler Arbeitsbereich, sondern ein bewusster Parkplatz.

Menschlicher Workflow:
1) Fokus im Header klären.
2) Inhalte in left/middle/right sammeln oder strukturieren.
3) Alternativen oder Nebenthemen bewusst in Sorted-out parken.
4) Nur explizite Beziehungen sichtbar machen; Sammlungen bleiben standardmäßig unverbunden.`.trim()
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
Canvas-Weltmodell für Analytics & AI Use Case:
- Dieses Canvas beschreibt einen Use Case in vier logisch aufeinander aufbauenden Ebenen: Fokus, Problemraum, Lösungsraum und Fit.
- Die rechte Seite beschreibt den Problemraum aus Nutzersicht; die linke Seite leitet daraus die Lösungsperspektive ab; das Feld Check verdichtet den validierten Fit erst am Ende.
- Sorted-out links/rechts sind Off-Canvas-Parkbereiche für Alternativen, Nebenthemen oder bewusst zurückgestellte Inhalte.

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

Canvas-Semantik:
- header setzt den Fokusanker. Ohne klaren Header fehlt dem gesamten Canvas die gemeinsame Arbeitshypothese.
- 2_user_and_situation, 3_objectives_and_results, 4_decisions_and_actions, 5a_user_gains und 5b_user_pains bilden gemeinsam den Problemraum.
- 4_decisions_and_actions ist der methodische Drehpunkt zwischen Problemraum und Lösungsraum.
- 6_solutions, 6a_information, 6b_functions und 7_benefits bilden gemeinsam den Lösungsraum.
- 8_check ist kein Sammelbereich für neue Ideen, sondern ein spätes Verdichtungsfeld für belastbare Fit-Aussagen.
- Objectives & Results beschreibt Outcomes; Decisions & Actions beschreibt Verhalten oder Auswahlhandlungen.
- User Gains kommen aus Nutzersicht; Benefits kommen aus der Lösungsperspektive.
- Die Footer-/Legend-Region ist nicht Teil des Agentenkatalogs und kein zu füllender Arbeitsbereich.

Menschlicher Workflow auf diesem Canvas:
1) Fokus im Header klären und Scope/Annahmen sichtbar machen.
2) Rechten Problemraum aufbauen: User & Situation → Objectives & Results → Decisions & Actions → Gains/Pains.
3) Linken Lösungsraum aus dem Problemraum ableiten: Solutions → Information → Functions → Benefits.
4) Erst dann belastbare Fit-Aussagen im Feld Check verdichten.

Typische Arbeitslogik:
- Rechte Seite vor linker Seite, Check zuletzt.
- Nicht jedes Feld muss sofort gefüllt sein; gute Arbeit entsteht in kleinen, anschlussfähigen Schritten.
- Alternative Nutzer, Varianten oder Nebenthemen werden eher geparkt als gelöscht.
- Gains/Pains sind standardmäßig keine Benefits und Benefits sind nicht automatisch validierter Fit.
- Connectoren sind nie Default-Dekoration, sondern nur selektive Sichtbarmachung expliziter Beziehungen.`.trim()
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
export const DT_STORAGE_KEY_ACTIVE_PROPOSAL_PREFIX = "dt-active-proposal-v1:";
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

export const DT_FLOW_SCOPE_TYPES = Object.freeze(["current", "pack"]);
export const DT_FLOW_CONTROL_STATES = Object.freeze(["active", "disabled", "done"]);
export const DT_FLOW_CONTROL_LAYOUT = Object.freeze({
  widthPx: 300,
  heightPx: 84,
  gapXPx: 30,
  laneGapYPx: 20,
  offsetFromCanvasBottomPx: 130,
  historyLaneOffsetYPx: 120
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
  submitGapYPx: 28,
  buttonStackGapYPx: 22,
  outputHeightPerCanvasHeight: 0.5,
  outputWidthPerCanvasHeight: 0.54,
  inputWidthPerOutputWidth: 0.9,
  inputHeightPerOutputHeight: 0.66,
  submitWidthPerInputWidth: 0.72,
  submitHeightPx: 88,
  applyHeightPx: 108,
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
  }),
  apply_ready: Object.freeze({
    fillColor: "#bfdbfe",
    borderColor: "#2563eb",
    textColor: "#0f172a",
    fontSize: 24,
    textAlign: "center",
    textAlignVertical: "middle",
    borderWidth: 2
  }),
  apply_disabled: Object.freeze({
    fillColor: "#e5e7eb",
    borderColor: "#9ca3af",
    textColor: "#4b5563",
    fontSize: 24,
    textAlign: "center",
    textAlignVertical: "middle",
    borderWidth: 2
  })
});

export const DT_CHAT_INTERFACE_PLACEHOLDERS = Object.freeze({
  input: "Frage hier eingeben …",
  output: "Agentenantwort erscheint hier.",
  submit: "Submit",
  apply: "Vorschläge anwenden"
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

// Endpoint / Feedback Engine Defaults
export const DT_ENDPOINT_SCOPE_TYPES = Object.freeze(["selection", "current", "pack", "board"]);
export const DT_FEEDBACK_CHANNELS = Object.freeze(["panel", "text", "both"]);
export const DT_MUTATION_POLICIES = Object.freeze(["none", "minimal", "limited", "full"]);
export const DT_EXECUTION_MODES = Object.freeze(["none", "direct_apply", "proposal_only"]);

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
  return `Wenn exerciseContext vorhanden ist, ist er verbindlich:
- exerciseContext.endpointId und exerciseContext.scopeType beschreiben diesen Lauf.
- exerciseContext.allowedActions und exerciseContext.allowedExecutionModes sind harte Grenzen.
- Wähle executionMode immer explizit und nur innerhalb von exerciseContext.allowedExecutionModes.
- Für Exercise-Läufe ist Feedback Pflicht.
- flowControlDirectives dürfen nur vorhandene Buttons freischalten oder als erledigt markieren.`.trim();
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
    '- Verwende create_connector nur für explizite methodische Beziehungen.',
    '- Gleiche Area, thematische Nähe, Brainstorm-Sammlungen, Cluster oder Varianten reichen nicht als Connector-Grund.',
    '- fromStickyId und toStickyId müssen bestehende Sticky-IDs oder refId-Werte aus derselben Antwort sein.',
    '- directed=true = Pfeil von fromStickyId nach toStickyId; directed=false = Verbindung ohne Pfeil.',
    '- Wenn neue Stickies verbunden werden sollen, gib zuerst create_sticky und danach create_connector aus.'
  ];

  if (forbidAltNames) {
    lines.push('- Verwende keine alternativen Action-Namen außerhalb des Vertrags.');
  }

  return lines.join("\n");
}

function buildCommonAgentContractBlock(modeLabel) {
  return `${buildExerciseContextBindingBlock()}

Antworte ausschließlich mit einem JSON-Objekt in diesem Format:
- Gib niemals Markdown, keine Code-Fences und keine Vor- oder Nachbemerkungen aus.
- Alle Top-Level-Felder müssen immer vorhanden sein.
{
  "analysis": "kurze Erklärung in natürlicher Sprache",
  "executionMode": "proposal_only",
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
      }
    ]
  },
  "flowControlDirectives": {
    "unlockEndpointIds": [],
    "completeEndpointIds": []
  },
  "evaluation": {
    "score": 72,
    "scale": "0-100",
    "verdict": "solide, aber noch unvollständig",
    "rubric": []
  }
}

Vertragsregeln:
- analysis erklärt kurz, was du im aktuellen Lauf erkannt oder entschieden hast.
- feedback ist für Menschen geschrieben: klar, konkret, ohne technische IDs, endpointIds oder Roh-Keys.
- executionMode ist Pflicht: none, direct_apply oder proposal_only.
- none bedeutet actions=[].
- direct_apply bedeutet: actions sind für direkte Anwendung gedacht.
- proposal_only bedeutet: actions sind konkrete Vorschläge, werden aber noch nicht angewendet.
- evaluation ist nur für Bewertungsmodi zwingend; sonst leer oder knapp halten.
- memoryEntry ist Pflicht und verdichtet semantisch, was in diesem Lauf passiert ist.
- Referenziere in memoryEntry Canvas nur über instanceLabel.
- Verwende color nur mit unterstützten Miro-Farbwerten.
- Verwende checked nur für bewusst validierte Inhalte.
- flowControlDirectives sind optional und dürfen die eigentliche Board-Arbeit nicht ersetzen.

Zusatz für ${modeLabel}:
- actions, memoryEntry und feedback bleiben gleichwertige Bestandteile des Outputs.`.trim();
}

function buildSelectionSystemPrompt() {
  return `Du bist ein Facilitation-Bot für Miro-Workshops.
Du arbeitest strikt auf Basis des gelieferten JSON-Kontexts.
Du siehst je nach Lauf:
- eine oder mehrere aktive Canvas-Instanzen unter activeCanvasState bzw. activeCanvasStates,
- einen Board-Katalog als Überblick,
- memoryState und recentMemoryLogEntries,
- optional exerciseContext sowie optional flowControlCatalog und boardFlowState.

Deine Kernaufgabe in instanzbezogenen Läufen:
1) sinnvolle Board-Aktionen als actions planen,
2) den Arbeitsschritt semantisch als memoryEntry verdichten,
3) verständliches feedback für Menschen formulieren.

${buildActionReferenceRulesBlock({
  instanceLabelRule: 'Wenn activeCanvasStates mehr als eine Instanz enthält, muss jede mutierende Action zusätzlich ein Feld "instanceLabel" enthalten. Der Wert muss exakt einem Label aus selectedInstanceLabels bzw. den Schlüsseln von activeCanvasStates entsprechen.'
})}

${buildConnectorRulesBlock()}

${buildCommonAgentContractBlock("selection / instanzbezogenen Agentenlauf")}`.trim();
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
Du bist ein Facilitation-Bot für Miro-Workshops mit globalem Überblick über alle relevanten Canvas-Instanzen.
Du arbeitest strikt auf Basis des gelieferten JSON-Kontexts.
Du siehst je nach Lauf:
- boardCatalog als Überblick,
- activeCanvasStates für die aktuell relevanten Instanzen,
- optional activeInstanceChangesSinceLastAgent,
- memoryState und recentMemoryLogEntries,
- optional exerciseContext sowie optional flowControlCatalog und boardFlowState.

Deine Kernaufgabe in globalen Läufen:
1) die Gesamtsituation über mehrere Instanzen analysieren,
2) daraus sinnvolle actions ableiten,
3) den Arbeitsschritt semantisch als memoryEntry verdichten,
4) verständliches feedback für Menschen formulieren.

${buildActionReferenceRulesBlock({
  instanceLabelRule: 'Jede mutierende Action muss genau eine Ziel-Instanz über das Feld "instanceLabel" angeben. Verwende nur Labels aus activeCanvasStates bzw. activeInstanceLabels.'
})}

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
