import { OPENAI_ENDPOINT } from "../config.js?v=20260315-patch17-analytics-prompt-refresh2";

function nullableStringSchema(description = "") {
  return {
    type: ["string", "null"],
    description
  };
}

function nullableNumberSchema(description = "") {
  return {
    type: ["number", "null"],
    description
  };
}

function nullableBooleanSchema(description = "") {
  return {
    type: ["boolean", "null"],
    description
  };
}

function strictObjectSchema(properties) {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties
  };
}

const ENDPOINT_ACTION_SCHEMA = strictObjectSchema({
  type: { type: "string" },
  instanceLabel: nullableStringSchema("Menschenlesbares Canvas-Label der Zielinstanz."),
  instanceId: nullableStringSchema("Optionale interne Zielinstanz-ID; wenn möglich instanceLabel bevorzugen."),
  stickyId: nullableStringSchema("Alias-ID oder Sticky-Referenz einer bestehenden Sticky Note."),
  refId: nullableStringSchema("Temporäre Ref-ID für neu erzeugte Stickies, damit spätere Actions darauf referenzieren können."),
  fromStickyId: nullableStringSchema("Alias-ID oder Ref-ID der Start-Sticky für Connectoren."),
  toStickyId: nullableStringSchema("Alias-ID oder Ref-ID der Ziel-Sticky für Connectoren."),
  area: nullableStringSchema("Area/Region innerhalb der Zielinstanz. Die App platziert Stickies innerhalb der Region automatisch."),
  targetArea: nullableStringSchema("Ziel-Region innerhalb der Zielinstanz. Die App platziert Stickies innerhalb der Region automatisch."),
  text: nullableStringSchema("Textinhalt für create_sticky oder inform."),
  message: nullableStringSchema("Informationsnachricht für inform."),
  color: nullableStringSchema("Optionale Miro-Sticky-Farbe aus der unterstützten Palette, z. B. green, red, blue."),
  checked: nullableBooleanSchema("Optionaler sichtbarer Prüfstatus für create_sticky oder set_check_status."),
  directed: nullableBooleanSchema("Ob der Connector gerichtet sein soll."),
  reverseDirection: nullableBooleanSchema("Ob die vom Modell gedachte Richtung invertiert werden soll.")
});

const ENDPOINT_RESPONSE_JSON_SCHEMA = strictObjectSchema({
  analysis: { type: "string", description: "Kurze Analyse des aktuellen Board-Zustands." },
  executionMode: {
    type: "string",
    enum: ["none", "direct_apply", "proposal_only"],
    description: "Bestimmt, ob keine Actions, direkte Anwendung oder nur ein Vorschlag zurückgegeben wird."
  },
  actions: {
    type: "array",
    items: ENDPOINT_ACTION_SCHEMA
  },
  memoryEntry: strictObjectSchema({
    summary: { type: "string" },
    workSteps: {
      type: "array",
      items: strictObjectSchema({
        instanceLabel: nullableStringSchema("Menschenlesbares Canvas-Label oder null."),
        text: { type: "string" }
      })
    },
    decisionsAdded: { type: "array", items: { type: "string" } },
    decisionsRemoved: { type: "array", items: { type: "string" } },
    openIssuesAdded: { type: "array", items: { type: "string" } },
    openIssuesResolved: { type: "array", items: { type: "string" } },
    nextFocus: nullableStringSchema("Sinnvoller nächster Fokus."),
    stepStatus: nullableStringSchema("z. B. not_started, in_progress, ready_for_review.")
  }),
  feedback: strictObjectSchema({
    title: { type: "string" },
    summary: { type: "string" },
    sections: {
      type: "array",
      items: strictObjectSchema({
        heading: nullableStringSchema("Überschrift des Feedback-Abschnitts."),
        bullets: { type: "array", items: { type: "string" } }
      })
    }
  }),
  flowControlDirectives: strictObjectSchema({
    unlockEndpointIds: {
      type: "array",
      items: { type: "string" },
      description: "Endpoint-IDs von Controls, die freigeschaltet werden sollen."
    },
    completeEndpointIds: {
      type: "array",
      items: { type: "string" },
      description: "Endpoint-IDs von Controls, die als erledigt markiert werden sollen."
    }
  }),
  evaluation: strictObjectSchema({
    score: nullableNumberSchema("Optionaler numerischer Score."),
    scale: nullableStringSchema("Skalenbeschreibung, z. B. 0-100."),
    verdict: nullableStringSchema("Kurzurteil."),
    rubric: {
      type: "array",
      items: strictObjectSchema({
        criterion: nullableStringSchema("Bewertungskriterium."),
        status: nullableStringSchema("z. B. met, partly_met, missing."),
        comment: nullableStringSchema("Kurzer Kommentar zum Kriterium.")
      })
    }
  })
});

function buildMessageInput(systemPrompt, userText) {
  return [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }]
    },
    {
      role: "user",
      content: [{ type: "input_text", text: userText }]
    }
  ];
}

function buildBaseRequestBody({ model, systemPrompt, userText, reasoningEffort = "none" }) {
  return {
    model,
    reasoning: { effort: reasoningEffort },
    input: buildMessageInput(systemPrompt, userText)
  };
}

function extractOutputTextFromResponse(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const chunks = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    if (!item || item.type !== "message") continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }

  const joined = chunks.join("\n").trim();
  return joined || null;
}

function extractRefusalFromResponse(data) {
  if (!data || typeof data !== "object") return null;

  for (const item of Array.isArray(data.output) ? data.output : []) {
    if (!item || item.type !== "message") continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part?.type === "refusal" && typeof part.refusal === "string" && part.refusal.trim()) {
        return part.refusal.trim();
      }
    }
  }

  return null;
}

async function performResponsesRequest({ apiKey, body, endpoint = OPENAI_ENDPOINT }) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(res.status + " " + raw);
  }

  return JSON.parse(raw);
}

export function parseJsonFromModelOutput(rawText) {
  if (typeof rawText !== "string") return null;

  let text = rawText.trim();

  if (text.startsWith("```")) {
    text = text.replace(/^```[a-zA-Z0-9_-]*\s*\r?\n?/, "");
    text = text.replace(/\r?\n```$/, "");
    text = text.replace(/```$/, "");
    text = text.trim();
  }

  try {
    return JSON.parse(text);
  } catch (_) {}

  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1).trim();
        try {
          return JSON.parse(candidate);
        } catch (_) {
          return null;
        }
      }
    }
  }

  return null;
}

export async function callOpenAIResponses({
  apiKey,
  model,
  systemPrompt,
  userText,
  endpoint = OPENAI_ENDPOINT,
  reasoningEffort = "none",
  verbosity = "medium"
}) {
  const body = buildBaseRequestBody({ model, systemPrompt, userText, reasoningEffort });
  body.text = {
    format: { type: "text" },
    verbosity
  };

  const data = await performResponsesRequest({ apiKey, body, endpoint });
  return extractOutputTextFromResponse(data);
}

export function getEndpointResponseJsonSchema() {
  return ENDPOINT_RESPONSE_JSON_SCHEMA;
}

export async function callOpenAIEndpointStructured({
  apiKey,
  model,
  systemPrompt,
  userText,
  endpoint = OPENAI_ENDPOINT,
  reasoningEffort = "none",
  verbosity = "medium"
}) {
  const body = buildBaseRequestBody({ model, systemPrompt, userText, reasoningEffort });
  body.text = {
    verbosity,
    format: {
      type: "json_schema",
      name: "dt_endpoint_response",
      description: "Strukturierter Endpoint-Output für die Datentreiber Miro-App.",
      strict: true,
      schema: ENDPOINT_RESPONSE_JSON_SCHEMA
    }
  };

  const data = await performResponsesRequest({ apiKey, body, endpoint });
  const refusal = extractRefusalFromResponse(data);
  const outputText = extractOutputTextFromResponse(data);
  const parsed = outputText ? (parseJsonFromModelOutput(outputText) || null) : null;

  return {
    rawResponse: data,
    refusal,
    outputText,
    parsed
  };
}

export async function dispatchActions(actions, handlers, log) {
  if (!Array.isArray(actions) || actions.length === 0) {
    if (typeof log === "function") log("Keine Actions (actions-Array ist leer).");
    return;
  }

  for (const action of actions) {
    if (!action || typeof action.type !== "string") continue;

    const fn = handlers?.[action.type];
    if (typeof fn !== "function") {
      if (typeof log === "function") log("Unbekannter Action-Typ: " + action.type);
      continue;
    }

    await fn(action);
  }
}
