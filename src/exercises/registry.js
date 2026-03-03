import {
  TEMPLATE_ID,
  DT_DEFAULT_APP_ADMIN_POLICY,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_DEFAULT_FEEDBACK_FRAME_NAME,
  DT_TRIGGER_KEYS,
  DT_TRIGGER_DEFAULTS
} from "../config.js?v=20260301-step10";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUniqueStrings(values) {
  if (!Array.isArray(values)) return [];

  const result = [];
  const seen = new Set();
  for (const value of values) {
    const text = asNonEmptyString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalizeTriggerKey(value) {
  const key = asNonEmptyString(value);
  return key && DT_TRIGGER_KEYS.includes(key) ? key : null;
}

function createTriggerConfig(triggerKey, prompt, overrides = {}) {
  const defaults = DT_TRIGGER_DEFAULTS[triggerKey] || null;
  if (!defaults) {
    throw new Error(`Unbekannter Trigger-Key: ${triggerKey}`);
  }

  return {
    triggerKey,
    scope: defaults.scope,
    intent: defaults.intent,
    requiresSelection: typeof overrides.requiresSelection === "boolean" ? overrides.requiresSelection : defaults.requiresSelection,
    mutationPolicy: asNonEmptyString(overrides.mutationPolicy) || defaults.mutationPolicy,
    feedbackPolicy: asNonEmptyString(overrides.feedbackPolicy) || defaults.feedbackPolicy,
    prompt: asNonEmptyString(prompt) || null
  };
}

function buildStepAllowedTriggers({
  selectionCheck,
  selectionHint,
  selectionAutocorrect,
  selectionReview,
  selectionSynthesize,
  selectionCoach,
  selectionGrade,
  globalCheck,
  globalHint,
  globalAutocorrect,
  globalReview,
  globalSynthesize,
  globalCoach,
  globalGrade
}) {
  return {
    "selection.check": createTriggerConfig("selection.check", selectionCheck),
    "selection.hint": createTriggerConfig("selection.hint", selectionHint),
    "selection.autocorrect": createTriggerConfig("selection.autocorrect", selectionAutocorrect, { feedbackPolicy: "both" }),
    "selection.review": createTriggerConfig("selection.review", selectionReview),
    "selection.synthesize": createTriggerConfig("selection.synthesize", selectionSynthesize),
    "selection.coach": createTriggerConfig("selection.coach", selectionCoach),
    "selection.grade": createTriggerConfig("selection.grade", selectionGrade),
    "global.check": createTriggerConfig("global.check", globalCheck),
    "global.hint": createTriggerConfig("global.hint", globalHint),
    "global.autocorrect": createTriggerConfig("global.autocorrect", globalAutocorrect, { feedbackPolicy: "both" }),
    "global.review": createTriggerConfig("global.review", globalReview),
    "global.synthesize": createTriggerConfig("global.synthesize", globalSynthesize),
    "global.coach": createTriggerConfig("global.coach", globalCoach),
    "global.grade": createTriggerConfig("global.grade", globalGrade)
  };
}

function createManualTransition(toStepId, overrides = {}) {
  return {
    toStepId: asNonEmptyString(toStepId),
    policy: asNonEmptyString(overrides.policy) || "manual",
    allowedSources: normalizeUniqueStrings(overrides.allowedSources || ["user", "admin", "agent_recommendation"]),
    allowedAfterTriggers: normalizeUniqueStrings(overrides.allowedAfterTriggers || []),
    requiredStepStatuses: normalizeUniqueStrings(overrides.requiredStepStatuses || [])
  };
}

const PERSONA_BASICS_PACK = {
  id: "persona-basics-v1",
  label: "Persona Basics",
  version: 2,
  description: "Geführte Persona-Übung auf dem Datentreiber-3-Boxes-Canvas.",
  boardMode: "exercise",
  allowedCanvasTypes: [TEMPLATE_ID],
  defaultCanvasTypeId: TEMPLATE_ID,
  defaultStepId: "collect_personas",
  defaults: {
    feedbackFrameName: DT_DEFAULT_FEEDBACK_FRAME_NAME,
    feedbackChannel: DT_DEFAULT_FEEDBACK_CHANNEL,
    userMayChangePack: false,
    userMayChangeStep: false,
    appAdminPolicy: DT_DEFAULT_APP_ADMIN_POLICY
  },
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
      defaultEnterTrigger: null,
      allowedTriggers: buildStepAllowedTriggers({
        selectionCheck: `
Prüfmodus für den Schritt "Personas anlegen":
- Bewerte, ob pro Persona eine vollständige Dreierstruktur vorhanden ist.
- Markiere fehlende oder unscharfe Elemente als offene Punkte im memoryEntry.
- Nimm nur dann Board-Mutationen vor, wenn sie zur Korrektur ausdrücklich erwünscht oder offensichtlich nötig sind.`.trim(),
        selectionHint: `
Hinweismodus für den Schritt "Personas anlegen":
- Gib möglichst wenig invasive Unterstützung.
- Bevorzuge analysis, feedback und memoryEntry.
- Setze nur dann Board-Aktionen ein, wenn ein konkreter, kleiner Hilfsschritt sinnvoll ist.`.trim(),
        selectionAutocorrect: `
Autokorrekturmodus für den Schritt "Personas anlegen":
- Fehlende oder falsch platzierte Persona-Elemente dürfen aktiv korrigiert werden.
- Stelle eine saubere Persona-Kettenstruktur auf dem Board her.`.trim(),
        selectionReview: `
Reviewmodus für den Schritt "Personas anlegen":
- Beurteile die Qualität und Lesbarkeit der Persona-Strukturen.
- Gib klares feedback zu Vollständigkeit, Verständlichkeit und methodischer Sauberkeit.
- Nimm standardmäßig keine Board-Mutationen vor.`.trim(),
        selectionSynthesize: `
Synthesemodus für den Schritt "Personas anlegen":
- Verdichte, was die selektierten Personas gemeinsam zeigen.
- Hebe Muster, Unterschiede und übergreifende Einsichten hervor.
- Nimm standardmäßig keine Board-Mutationen vor.`.trim(),
        selectionCoach: `
Coachmodus für den Schritt "Personas anlegen":
- Erkläre didaktisch, worauf das Team als Nächstes achten sollte.
- Formuliere konkrete nächste Schritte für die Arbeit an den selektierten Canvas.
- Nimm standardmäßig keine Board-Mutationen vor.`.trim(),
        selectionGrade: `
Bewertungsmodus für den Schritt "Personas anlegen":
- Bewerte die selektierten Canvas gegen die Kriterien Vollständigkeit, korrekte Zuordnung und Lesbarkeit.
- Liefere zusätzlich eine evaluation mit Rubrik.
- Nimm standardmäßig keine Board-Mutationen vor.`.trim(),
        globalCheck: `
Globaler Prüfmodus für den Schritt "Personas anlegen":
- Prüfe über alle relevanten Canvas hinweg, ob konsistente Persona-Strukturen vorhanden sind.
- Markiere globale Lücken oder Inkonsistenzen.
- Nimm nur dann Mutationen vor, wenn sie eindeutig sinnvoll sind.`.trim(),
        globalHint: `
Globaler Hinweismodus für den Schritt "Personas anlegen":
- Gib globale Hinweise über alle relevanten Canvas hinweg.
- Bevorzuge feedback und memoryEntry; handle Board-Mutationen sehr sparsam.`.trim(),
        globalAutocorrect: `
Globaler Autokorrekturmodus für den Schritt "Personas anlegen":
- Korrigiere selektionsunabhängig über alle relevanten Canvas hinweg.
- Halte jede Persona als getrennte Einheit lesbar.`.trim(),
        globalReview: `
Globaler Reviewmodus für den Schritt "Personas anlegen":
- Führe einen qualitativen Board-Review über alle relevanten Canvas durch.
- Fokus: Konsistenz, Lesbarkeit, fehlende Persona-Bestandteile.`.trim(),
        globalSynthesize: `
Globaler Synthesemodus für den Schritt "Personas anlegen":
- Fasse die übergreifenden Muster der Personas über alle relevanten Canvas zusammen.
- Keine Standard-Mutationen; Fokus auf Verdichtung und Erkenntnisse.`.trim(),
        globalCoach: `
Globaler Coachmodus für den Schritt "Personas anlegen":
- Gib dem Team eine klare Anleitung, wie es übergreifend weiterarbeiten soll.
- Fokus auf nächste methodische Schritte, nicht auf Bewertung.`.trim(),
        globalGrade: `
Globaler Bewertungsmodus für den Schritt "Personas anlegen":
- Bewerte die Gesamtqualität des bisherigen Boards für diesen Schritt.
- Liefere zusätzlich eine evaluation mit Rubrik.`.trim()
      }),
      transitions: [
        createManualTransition("refine_personas")
      ]
    },
    refine_personas: {
      id: "refine_personas",
      order: 20,
      label: "Personas schärfen",
      visibleInstruction: "Präzisiere Tätigkeiten und Erwartungshaltungen. Vage Formulierungen sollen konkreter werden.",
      allowedActions: ["create_sticky", "move_sticky", "delete_sticky", "create_connector"],
      defaultEnterTrigger: null,
      allowedTriggers: buildStepAllowedTriggers({
        selectionCheck: `
Prüfmodus für den Schritt "Personas schärfen":
- Beurteile, ob Tätigkeiten und Erwartungen bereits konkret genug sind.
- Erfasse offene Punkte im memoryEntry.
- Mutationen nur, wenn sie zur Korrektur sinnvoll und vertretbar sind.`.trim(),
        selectionHint: `
Hinweismodus für den Schritt "Personas schärfen":
- Gib prägnante Verbesserungshinweise.
- Nutze Board-Mutationen sparsam.`.trim(),
        selectionAutocorrect: `
Autokorrekturmodus für den Schritt "Personas schärfen":
- Unklare Tätigkeiten oder Erwartungen dürfen konkretisiert, verschoben oder ergänzt werden.
- Halte die Persona-Struktur stabil.`.trim(),
        selectionReview: `
Reviewmodus für den Schritt "Personas schärfen":
- Beurteile die Präzision und Trennschärfe der Persona-Inhalte.
- Gib klares feedback zu Qualität und Reifegrad.
- Nimm standardmäßig keine Board-Mutationen vor.`.trim(),
        selectionSynthesize: `
Synthesemodus für den Schritt "Personas schärfen":
- Verdichte, welche Persona-Muster und Unterschiede inzwischen sichtbar sind.
- Fokus auf Einsichten, nicht auf Mutationen.`.trim(),
        selectionCoach: `
Coachmodus für den Schritt "Personas schärfen":
- Erkläre, wie die Präzisierung der Inhalte sinnvoll weitergeführt werden sollte.
- Formuliere klare nächste Arbeitsimpulse.`.trim(),
        selectionGrade: `
Bewertungsmodus für den Schritt "Personas schärfen":
- Bewerte die selektierten Canvas gegen die Kriterien Präzision, methodische Passung und Lesbarkeit.
- Liefere zusätzlich eine evaluation mit Rubrik.`.trim(),
        globalCheck: `
Globaler Prüfmodus für den Schritt "Personas schärfen":
- Prüfe über alle relevanten Canvas hinweg, ob Tätigkeiten und Erwartungen konsistent präzisiert wurden.
- Markiere globale Lücken und Unschärfen.`.trim(),
        globalHint: `
Globaler Hinweismodus für den Schritt "Personas schärfen":
- Gib globale Hinweise zu Unschärfen, Redundanzen und fehlender Präzision.`.trim(),
        globalAutocorrect: `
Globaler Autokorrekturmodus für den Schritt "Personas schärfen":
- Korrigiere selektionsunabhängig über alle relevanten Canvas hinweg.
- Präzisiere Inhalte dort, wo es methodisch eindeutig sinnvoll ist.`.trim(),
        globalReview: `
Globaler Reviewmodus für den Schritt "Personas schärfen":
- Führe einen qualitativen Gesamtreview über alle relevanten Canvas durch.
- Fokus: Reifegrad, Klarheit, Vergleichbarkeit.`.trim(),
        globalSynthesize: `
Globaler Synthesemodus für den Schritt "Personas schärfen":
- Verdichte die wichtigsten Persona-Erkenntnisse über alle relevanten Canvas hinweg.`.trim(),
        globalCoach: `
Globaler Coachmodus für den Schritt "Personas schärfen":
- Gib dem Team eine klare Anleitung für den nächsten übergreifenden Arbeitsschritt.`.trim(),
        globalGrade: `
Globaler Bewertungsmodus für den Schritt "Personas schärfen":
- Bewerte die Gesamtqualität des Boards für diesen Schritt.
- Liefere zusätzlich eine evaluation mit Rubrik.`.trim()
      }),
      transitions: []
    }
  }
};

export const EXERCISE_PACKS = Object.freeze({
  [PERSONA_BASICS_PACK.id]: PERSONA_BASICS_PACK
});

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

export function getPackDefaults(packOrId) {
  const pack = typeof packOrId === "string" ? getExercisePackById(packOrId) : packOrId;
  const defaults = (pack?.defaults && typeof pack.defaults === "object") ? pack.defaults : {};

  return {
    feedbackFrameName: asNonEmptyString(defaults.feedbackFrameName) || DT_DEFAULT_FEEDBACK_FRAME_NAME,
    feedbackChannel: asNonEmptyString(defaults.feedbackChannel) || DT_DEFAULT_FEEDBACK_CHANNEL,
    userMayChangePack: defaults.userMayChangePack === true,
    userMayChangeStep: defaults.userMayChangeStep === true,
    appAdminPolicy: asNonEmptyString(defaults.appAdminPolicy) || DT_DEFAULT_APP_ADMIN_POLICY
  };
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

export function listAllowedTriggerKeys(stepOrPack, maybeStepId = null) {
  const step = maybeStepId == null
    ? stepOrPack
    : getExerciseStep(stepOrPack, maybeStepId);

  if (!step?.allowedTriggers || typeof step.allowedTriggers !== "object") return [];

  return Object.keys(step.allowedTriggers)
    .map((key) => normalizeTriggerKey(key))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function getStepTriggerConfig(packOrStep, stepIdOrTriggerKey, maybeTriggerKey = null) {
  let step = null;
  let triggerKey = null;

  if (maybeTriggerKey == null) {
    step = packOrStep;
    triggerKey = stepIdOrTriggerKey;
  } else {
    step = getExerciseStep(packOrStep, stepIdOrTriggerKey);
    triggerKey = maybeTriggerKey;
  }

  const normalizedTriggerKey = normalizeTriggerKey(triggerKey);
  if (!step || !normalizedTriggerKey || !step.allowedTriggers || typeof step.allowedTriggers !== "object") return null;

  const config = step.allowedTriggers[normalizedTriggerKey];
  return config && typeof config === "object" ? config : null;
}

export function isTriggerAllowedForStep(packOrStep, stepIdOrTriggerKey, maybeTriggerKey = null) {
  return !!getStepTriggerConfig(packOrStep, stepIdOrTriggerKey, maybeTriggerKey);
}

export function getDefaultEnterTrigger(packOrStep, maybeStepId = null) {
  const step = maybeStepId == null ? packOrStep : getExerciseStep(packOrStep, maybeStepId);
  return normalizeTriggerKey(step?.defaultEnterTrigger) || null;
}

export function listStepTransitions(packOrStep, maybeStepId = null) {
  const step = maybeStepId == null ? packOrStep : getExerciseStep(packOrStep, maybeStepId);
  if (!Array.isArray(step?.transitions)) return [];

  return step.transitions
    .map((transition) => ({
      toStepId: asNonEmptyString(transition?.toStepId),
      policy: asNonEmptyString(transition?.policy) || "manual",
      allowedSources: normalizeUniqueStrings(transition?.allowedSources),
      allowedAfterTriggers: normalizeUniqueStrings(transition?.allowedAfterTriggers),
      requiredStepStatuses: normalizeUniqueStrings(transition?.requiredStepStatuses)
    }))
    .filter((transition) => !!transition.toStepId);
}

export function resolveNamedTransition(packOrStep, stepIdOrToStepId, maybeToStepId = null) {
  const transitions = maybeToStepId == null
    ? listStepTransitions(packOrStep)
    : listStepTransitions(packOrStep, stepIdOrToStepId);
  const wantedToStepId = asNonEmptyString(maybeToStepId == null ? stepIdOrToStepId : maybeToStepId);
  if (!wantedToStepId) return null;
  return transitions.find((transition) => transition.toStepId === wantedToStepId) || null;
}
