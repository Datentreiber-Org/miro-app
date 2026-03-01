import { TEMPLATE_ID } from "../config.js?v=20260301-step9";

const PERSONA_BASICS_PACK = {
  id: "persona-basics-v1",
  label: "Persona Basics",
  version: 1,
  description: "Geführte Persona-Übung auf dem Datentreiber-3-Boxes-Canvas.",
  boardMode: "exercise",
  allowedCanvasTypes: [TEMPLATE_ID],
  defaultCanvasTypeId: TEMPLATE_ID,
  defaultStepId: "collect_personas",
  globalPrompt: `
Auf diesem Board läuft die Übung "Persona Basics".

Übergeordnetes Ziel:
- Arbeite persona-orientiert.
- Jede Persona soll als zusammenhängende Einheit lesbar bleiben.
- Das Board soll methodisch sauber bleiben: Inhalte präzisieren, unklare Einträge konkretisieren, Lücken sichtbar machen und offensichtliche Fehlzuordnungen korrigieren.
- Nutze Connectoren, wenn Inhalte innerhalb einer Persona logisch zusammengehören. Vermeide Verbindungen zwischen verschiedenen Personas, außer die Aufgabe verlangt es ausdrücklich.

Leitregel:
- Behandle die sichtbaren Canvas als methodische Arbeitsflächen, nicht als freie Notizzettel.
- Prüfe stets, ob die Inhalte dem aktuellen Schritt und der Übungslogik entsprechen.
- Nutze den aktuellen Übungsschritt aus exerciseContext verbindlich.`.trim(),
  steps: {
    collect_personas: {
      id: "collect_personas",
      order: 10,
      label: "Personas anlegen",
      visibleInstruction: "Lege pro Persona eine lesbare Kette aus Name (links), Tätigkeit (Mitte) und Erwartung (rechts) an.",
      allowedActions: ["create_sticky", "move_sticky", "delete_sticky", "create_connector"],
      triggerPrompts: {
        generic: `
Aktueller Schritt: Personas anlegen.

Achte darauf:
- Pro Persona entsteht eine klare Dreierstruktur: Name → Tätigkeit → Erwartung.
- Fehlende Elemente dürfen ergänzt werden.
- Unpassende oder doppelte Elemente dürfen bereinigt werden.
- Wenn die Nutzeranfrage keine andere Struktur verlangt, verbinde die drei zugehörigen Stickies pro Persona linear miteinander.`.trim(),
        check: `
Prüfmodus für den Schritt "Personas anlegen":
- Bewerte, ob pro Persona eine vollständige Dreierstruktur vorhanden ist.
- Markiere fehlende oder unscharfe Elemente als offene Punkte im memoryEntry.
- Nimm nur dann Board-Mutationen vor, wenn sie zur Korrektur ausdrücklich erwünscht oder offensichtlich nötig sind.`.trim(),
        hint: `
Hinweismodus für den Schritt "Personas anlegen":
- Gib möglichst wenig invasive Unterstützung.
- Bevorzuge analysis + memoryEntry.
- Setze nur dann Board-Aktionen ein, wenn ein konkreter, kleiner Hilfsschritt sinnvoll ist.`.trim(),
        autocorrect: `
Autokorrekturmodus für den Schritt "Personas anlegen":
- Fehlende oder falsch platzierte Persona-Elemente dürfen aktiv korrigiert werden.
- Stelle eine saubere Persona-Kettenstruktur auf dem Board her.`.trim()
      }
    },
    refine_personas: {
      id: "refine_personas",
      order: 20,
      label: "Personas schärfen",
      visibleInstruction: "Präzisiere Tätigkeiten und Erwartungshaltungen. Vage Formulierungen sollen konkreter werden.",
      allowedActions: ["create_sticky", "move_sticky", "delete_sticky", "create_connector"],
      triggerPrompts: {
        generic: `
Aktueller Schritt: Personas schärfen.

Achte darauf:
- Tätigkeiten und Erwartungen sollen konkret, handlungsnah und unterscheidbar sein.
- Sehr allgemeine Formulierungen dürfen präzisiert oder ersetzt werden.
- Bestehende Persona-Ketten sollen erhalten bleiben.`.trim(),
        check: `
Prüfmodus für den Schritt "Personas schärfen":
- Beurteile, ob Tätigkeiten und Erwartungen bereits konkret genug sind.
- Erfasse offene Punkte im memoryEntry.
- Mutationen nur, wenn sie zur Korrektur sinnvoll und vertretbar sind.`.trim(),
        hint: `
Hinweismodus für den Schritt "Personas schärfen":
- Gib prägnante Verbesserungshinweise.
- Nutze Board-Mutationen sparsam.`.trim(),
        autocorrect: `
Autokorrekturmodus für den Schritt "Personas schärfen":
- Unklare Tätigkeiten oder Erwartungen dürfen konkretisiert, verschoben oder ergänzt werden.
- Halte die Persona-Struktur stabil.`.trim()
      }
    }
  }
};

export const EXERCISE_PACKS = Object.freeze({
  [PERSONA_BASICS_PACK.id]: PERSONA_BASICS_PACK
});

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeExercisePackId(value) {
  const id = asNonEmptyString(value);
  return id && EXERCISE_PACKS[id] ? id : null;
}

export function listExercisePacks() {
  return Object.values(EXERCISE_PACKS).slice().sort((a, b) => {
    const aLabel = String(a?.label || a?.id || "");
    const bLabel = String(b?.label || b?.id || "");
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
  });
}

export function getExercisePackById(id) {
  const normalizedId = normalizeExercisePackId(id);
  return normalizedId ? EXERCISE_PACKS[normalizedId] : null;
}

export function getAllowedCanvasTypesForPack(packOrId) {
  const pack = typeof packOrId === "string" ? getExercisePackById(packOrId) : packOrId;
  if (!pack || !Array.isArray(pack.allowedCanvasTypes)) return [];

  const result = [];
  const seen = new Set();
  for (const canvasTypeId of pack.allowedCanvasTypes) {
    const normalized = asNonEmptyString(canvasTypeId);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function getDefaultCanvasTypeIdForPack(packOrId) {
  const pack = typeof packOrId === "string" ? getExercisePackById(packOrId) : packOrId;
  const explicit = asNonEmptyString(pack?.defaultCanvasTypeId);
  if (explicit) return explicit;
  const allowed = getAllowedCanvasTypesForPack(pack);
  return allowed[0] || null;
}

export function listExerciseSteps(packOrId) {
  const pack = typeof packOrId === "string" ? getExercisePackById(packOrId) : packOrId;
  if (!pack?.steps || typeof pack.steps !== "object") return [];

  return Object.values(pack.steps)
    .filter((step) => step && typeof step === "object" && asNonEmptyString(step.id))
    .slice()
    .sort((a, b) => {
      const aOrder = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" });
    });
}

export function getExerciseStep(packOrId, stepId) {
  const pack = typeof packOrId === "string" ? getExercisePackById(packOrId) : packOrId;
  const normalizedStepId = asNonEmptyString(stepId);
  if (!pack || !normalizedStepId || !pack.steps || typeof pack.steps !== "object") return null;
  const step = pack.steps[normalizedStepId];
  return step && typeof step === "object" ? step : null;
}

export function getDefaultStepId(packOrId) {
  const pack = typeof packOrId === "string" ? getExercisePackById(packOrId) : packOrId;
  const explicit = asNonEmptyString(pack?.defaultStepId);
  if (explicit && getExerciseStep(pack, explicit)) return explicit;
  const firstStep = listExerciseSteps(pack)[0];
  return firstStep?.id || null;
}

export function getNextExerciseStep(packOrId, currentStepId) {
  const steps = listExerciseSteps(packOrId);
  if (!steps.length) return null;

  const normalizedCurrentStepId = asNonEmptyString(currentStepId);
  if (!normalizedCurrentStepId) return steps[0] || null;

  const currentIndex = steps.findIndex((step) => step?.id === normalizedCurrentStepId);
  if (currentIndex === -1) return steps[0] || null;
  return steps[currentIndex + 1] || null;
}
