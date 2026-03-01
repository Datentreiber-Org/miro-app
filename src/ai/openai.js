import { OPENAI_ENDPOINT } from "../config.js?v=20260228-step7";

// ------------------------------------------------------------
// Robust JSON aus Modell-Output parsen
// - entfernt ```json ... ``` Code-Fences
// - extrahiert bei Bedarf das erste vollständige {...}-Objekt
// ------------------------------------------------------------
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

// --------------------------------------------------------------------
// OpenAI Responses API Call: return output_text (string)
// --------------------------------------------------------------------
export async function callOpenAIResponses({
  apiKey,
  model,
  systemPrompt,
  userText,
  maxOutputTokens = 4000,
  endpoint = OPENAI_ENDPOINT
}) {
  const body = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userText }]
      }
    ],
    max_output_tokens: maxOutputTokens
  };

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

  const data = JSON.parse(raw);
  const firstMessage = data.output && data.output[0];
  const contentArr = firstMessage?.content;
  const textPart = Array.isArray(contentArr) ? contentArr.find((c) => c.type === "output_text") : null;
  return textPart?.text || null;
}

// --------------------------------------------------------------------
// Action Dispatcher (generic)
// --------------------------------------------------------------------
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
