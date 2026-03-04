import { ANALYTICS_AI_USE_CASE_TEMPLATE_ID } from "../config.js?v=20260303-flowbatch1";

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

function createPromptModule(id, label, summary, prompt, extra = {}) {
  return Object.freeze({
    id,
    label,
    summary,
    prompt: asNonEmptyString(prompt) || "",
    ...extra
  });
}

function createRunProfile(id, label, summary, payload = {}) {
  return Object.freeze({
    id,
    label,
    summary,
    packTemplateId: asNonEmptyString(payload.packTemplateId),
    stepTemplateId: asNonEmptyString(payload.stepTemplateId),
    triggerKey: asNonEmptyString(payload.triggerKey),
    moduleIds: normalizeUniqueStrings(payload.moduleIds),
    mutationPolicy: asNonEmptyString(payload.mutationPolicy),
    feedbackPolicy: asNonEmptyString(payload.feedbackPolicy),
    defaultScopeType: asNonEmptyString(payload.defaultScopeType) || "fixed_instances",
    allowedActions: normalizeUniqueStrings(payload.allowedActions),
    uiHint: asNonEmptyString(payload.uiHint)
  });
}

function createStepTemplate(id, payload = {}) {
  return Object.freeze({
    id,
    order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : 0,
    label: asNonEmptyString(payload.label) || id,
    instruction: asNonEmptyString(payload.instruction),
    summary: asNonEmptyString(payload.summary)
  });
}

export const PROMPT_MODULES = Object.freeze({
  "analytics.fit.step1.selection.check": createPromptModule(
    "analytics.fit.step1.selection.check",
    "User Perspective – Prüfen",
    "Prüft die rechte Seite des Analytics & AI Use Case Canvas auf Vollständigkeit, Präzision und Fehlplatzierungen.",
    `Prüfmodus für den Schritt "User Perspective First":
- Fokus ausschließlich auf der rechten Seite des Canvas.
- Prüfe, ob User & Situation konkret genug sind.
- Prüfe, ob Objectives & Results als gewünschte Ziele oder erwartete Ergebnisse formuliert sind.
- Prüfe, ob Decisions & Actions echte Entscheidungen oder Handlungen beschreiben.
- Prüfe, ob User Gains und User Pains plausibel aus Nutzersicht formuliert sind.
- Prüfe Fehlplatzierungen und verschiebe nur dann, wenn die Korrektur eindeutig und unstrittig ist.
- Connectoren sind nur dann sinnvoll, wenn Beziehungen klar sind, insbesondere Decisions & Actions → Objectives & Results.
- Liefere feedback mit korrekten Punkten, Lücken, Unklarheiten und Fehlplatzierungen.`
  ),
  "analytics.fit.step1.selection.hint": createPromptModule(
    "analytics.fit.step1.selection.hint",
    "User Perspective – Hinweis",
    "Gibt knappe Hinweise zur Nutzerperspektive, ohne stark in das Board einzugreifen.",
    `Hinweismodus für den Schritt "User Perspective First":
- Gib möglichst wenig invasive Unterstützung.
- Formuliere knappe Hinweise, was auf der rechten Seite noch fehlt oder zu vage ist.
- Nutze Board-Mutationen nur in Ausnahmefällen; bevorzuge feedback und recommendations.`
  ),
  "analytics.fit.step2.selection.check": createPromptModule(
    "analytics.fit.step2.selection.check",
    "Solution Perspective – Prüfen",
    "Prüft die linke Seite des Analytics & AI Use Case Canvas auf Ableitung aus der Nutzerperspektive.",
    `Prüfmodus für den Schritt "Solution Perspective":
- Fokus auf der linken Seite des Canvas.
- Prüfe, ob Solutions, Information, Functions und Benefits nachvollziehbar aus der Nutzerperspektive abgeleitet sind.
- Prüfe, ob Information Entscheidungen oder Handlungen verbessert.
- Prüfe, ob Functions reale Entscheidungen oder Handlungen unterstützen.
- Prüfe, ob Benefits Pains reduzieren, Gains verstärken oder zu Ergebnissen und Zielen beitragen.
- Ergänze Connectoren nur dort, wo Beziehungen klar ableitbar sind, insbesondere Information → Decisions & Actions, Functions → Decisions & Actions sowie Benefits → User Pains/User Gains/Objectives & Results.`
  ),
  "analytics.fit.step2.selection.hint": createPromptModule(
    "analytics.fit.step2.selection.hint",
    "Solution Perspective – Hinweis",
    "Gibt präzise Hinweise, wie die linke Seite aus der rechten Seite abgeleitet werden sollte.",
    `Hinweismodus für den Schritt "Solution Perspective":
- Gib präzise Hinweise, wie die linke Seite aus der rechten Seite abgeleitet werden sollte.
- Board-Mutationen nur in Ausnahmefällen; bevorzuge feedback und recommendations.`
  ),
  "analytics.fit.step3.selection.review": createPromptModule(
    "analytics.fit.step3.selection.review",
    "Fit Check – Review",
    "Führt einen qualitativen Review des Problem-Solution-Fit durch, ohne standardmäßig Board-Mutationen vorzunehmen.",
    `Reviewmodus für den Schritt "Fit Check & Synthesis":
- Führe einen qualitativen Review des Problem-Solution-Fit durch.
- Nimm standardmäßig keine Board-Mutationen vor.`
  ),
  "analytics.fit.step3.selection.synthesize": createPromptModule(
    "analytics.fit.step3.selection.synthesize",
    "Fit Check – Synthese",
    "Verdichtet den Problem-Solution-Fit sichtbar im Feld Check und darf dafür begrenzte Mutationen durchführen.",
    `Synthesemodus für den Schritt "Fit Check & Synthesis":
- Verdichte die selektierte Instanz oder die selektierten Instanzen und mache den Problem-Solution-Fit sichtbar.
- Formuliere pro Instanz 1 bis 3 knappe Fit-Aussagen für das Feld Check.
- In diesem Trigger darfst du begrenzte Mutationen durchführen: bis zu drei neue Sticky Notes im Feld Check und sinnvolle ergänzende Connectoren.
- Nimm keine große Restrukturierung des restlichen Canvas vor.
- Liefere feedback, das die Verdichtung erklärt, und recommendations, ob global.review, global.synthesize oder der Abschluss sinnvoll ist.`
  ),
  "analytics.fit.global.review": createPromptModule(
    "analytics.fit.global.review",
    "Global Review",
    "Prüft alle relevanten Instanzen im Zusammenhang und hebt wiederkehrende Stärken und Schwächen hervor.",
    `Globaler Reviewmodus für den Schritt "Fit Check & Synthesis":
- Prüfe alle aktiven Instanzen dieses Exercise Packs im Zusammenhang.
- Ziel ist ein qualitativer Gesamt-Review: Welche Instanzen haben einen klaren Problem-Solution-Fit, wo sind Nutzerperspektiven zu vage, wo sind Lösungen zu allgemein oder nicht ausreichend an Entscheidungen und Handlungen gekoppelt, und welche Stärken oder Schwächen wiederholen sich über mehrere Instanzen hinweg?
- Dieser Trigger dient primär Analyse und feedback; nimm normalerweise keine oder nur minimale Board-Mutationen vor.`
  )
});

export const PACK_TEMPLATES = Object.freeze({
  "analytics-ai-usecase-fit-sprint-template-v1": Object.freeze({
    id: "analytics-ai-usecase-fit-sprint-template-v1",
    label: "Use Case Fit Sprint",
    description: "Geführte Übung für das Analytics & AI Use Case Canvas.",
    allowedCanvasTypeIds: Object.freeze([ANALYTICS_AI_USE_CASE_TEMPLATE_ID]),
    globalPrompt: `Auf diesem Board läuft die Übung "Use Case Fit Sprint" auf dem Canvas "Analytics & AI Use Case".

Übergeordnetes Ziel:
- Entwickle einen Analytics- oder KI-Anwendungsfall konsequent aus der Nutzerperspektive.
- Arbeite erst die rechte Seite des Canvas tragfähig aus und leite danach die linke Seite als Antwort darauf ab.
- Verdichte anschließend den Problem-Solution-Fit im Feld Check.
- Die rechte Seite beschreibt die Nutzerperspektive: User & Situation, Objectives & Results, Decisions & Actions, User Gains, User Pains.
- Die linke Seite beschreibt die Lösungsperspektive: Solutions, Information, Functions, Benefits.
- Das Feld Check verdichtet den Problem-Solution-Fit.
- Verwende die Kette Information → Decisions & Actions → Results → Objectives als fachliche Leitlinie.
- Benefits sind nur dann tragfähig, wenn sie Pains reduzieren, Gains verstärken oder zu besseren Ergebnissen und Zielen beitragen.
- Nutze Connectoren nur dort, wo Beziehungen methodisch klar und lesbar sind.
- Erfinde keine unnötigen Systemarchitekturen oder technischen Details; bleibe auf Use-Case-Ebene.
- Arbeite präzise, atomar und area-genau.`.trim(),
    stepTemplates: Object.freeze({
      step1_user_perspective: createStepTemplate("step1_user_perspective", {
        order: 10,
        label: "User Perspective First",
        instruction: "Fülle zuerst die Nutzerperspektive aus: User & Situation, Objectives & Results, Decisions & Actions, User Gains und User Pains.",
        summary: "Rechte Seite des Canvas ausarbeiten und strukturieren."
      }),
      step2_solution_perspective: createStepTemplate("step2_solution_perspective", {
        order: 20,
        label: "Solution Perspective",
        instruction: "Leite nun aus der Nutzerperspektive die Lösungsperspektive ab: Solutions, Information, Functions und Benefits.",
        summary: "Linke Seite des Canvas aus der Nutzerperspektive ableiten."
      }),
      step3_fit_check_and_synthesis: createStepTemplate("step3_fit_check_and_synthesis", {
        order: 30,
        label: "Fit Check & Synthesis",
        instruction: "Verdichte den Problem-Solution-Fit im Feld Check und prüfe die Konsistenz zwischen Nutzer- und Lösungsperspektive.",
        summary: "Problem-Solution-Fit verdichten und qualitativ prüfen."
      })
    }),
    runProfileIds: Object.freeze([
      "analytics.fit.step1.check",
      "analytics.fit.step1.hint",
      "analytics.fit.step2.check",
      "analytics.fit.step2.hint",
      "analytics.fit.step3.review",
      "analytics.fit.step3.synthesize",
      "analytics.fit.global.review"
    ])
  })
});

export const RUN_PROFILES = Object.freeze({
  "analytics.fit.step1.check": createRunProfile("analytics.fit.step1.check", "User Perspective prüfen", "Prüft die rechte Seite des Canvas auf Vollständigkeit und Fehlplatzierungen.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step1_user_perspective",
    triggerKey: "selection.check",
    moduleIds: ["analytics.fit.step1.selection.check"],
    mutationPolicy: "limited",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Sinnvoll, wenn die Teilnehmer ihre erste Version der Nutzerperspektive ausgefüllt haben."
  }),
  "analytics.fit.step1.hint": createRunProfile("analytics.fit.step1.hint", "Hinweis zur User Perspective", "Gibt knappe, coachende Hinweise zur rechten Seite des Canvas.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step1_user_perspective",
    triggerKey: "selection.hint",
    moduleIds: ["analytics.fit.step1.selection.hint"],
    mutationPolicy: "minimal",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Optionaler Hilfe-Button für Teilnehmende, ohne den Flow zu unterbrechen."
  }),
  "analytics.fit.step2.check": createRunProfile("analytics.fit.step2.check", "Solution Perspective prüfen", "Prüft die linke Seite des Canvas auf Ableitung und Nutzenlogik.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step2_solution_perspective",
    triggerKey: "selection.check",
    moduleIds: ["analytics.fit.step2.selection.check"],
    mutationPolicy: "limited",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances"
  }),
  "analytics.fit.step2.hint": createRunProfile("analytics.fit.step2.hint", "Hinweis zur Solution Perspective", "Gibt präzise Hinweise zur Ableitung der linken Seite.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step2_solution_perspective",
    triggerKey: "selection.hint",
    moduleIds: ["analytics.fit.step2.selection.hint"],
    mutationPolicy: "minimal",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances"
  }),
  "analytics.fit.step3.review": createRunProfile("analytics.fit.step3.review", "Fit Check reviewen", "Führt einen qualitativen Review des Problem-Solution-Fit durch.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step3_fit_check_and_synthesis",
    triggerKey: "selection.review",
    moduleIds: ["analytics.fit.step3.selection.review"],
    mutationPolicy: "none",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances"
  }),
  "analytics.fit.step3.synthesize": createRunProfile("analytics.fit.step3.synthesize", "Fit Check synthetisieren", "Verdichtet den Problem-Solution-Fit sichtbar im Check-Feld.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step3_fit_check_and_synthesis",
    triggerKey: "selection.synthesize",
    moduleIds: ["analytics.fit.step3.selection.synthesize"],
    mutationPolicy: "limited",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances"
  }),
  "analytics.fit.global.review": createRunProfile("analytics.fit.global.review", "Global Review", "Prüft alle relevanten Instanzen im Gesamtzusammenhang.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step3_fit_check_and_synthesis",
    triggerKey: "global.review",
    moduleIds: ["analytics.fit.global.review"],
    mutationPolicy: "none",
    feedbackPolicy: "text",
    defaultScopeType: "global"
  })
});

export function listPackTemplates() {
  return Object.values(PACK_TEMPLATES).slice().sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: "base" }));
}

export function getPackTemplateById(id) {
  const normalizedId = asNonEmptyString(id);
  return normalizedId && PACK_TEMPLATES[normalizedId] ? PACK_TEMPLATES[normalizedId] : null;
}

export function listStepTemplatesForPack(packOrId) {
  const pack = typeof packOrId === "string" ? getPackTemplateById(packOrId) : packOrId;
  const steps = Object.values((pack?.stepTemplates && typeof pack.stepTemplates === "object") ? pack.stepTemplates : {});
  return steps.slice().sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: "base" }));
}

export function getStepTemplateForPack(packOrId, stepId) {
  const pack = typeof packOrId === "string" ? getPackTemplateById(packOrId) : packOrId;
  const normalizedStepId = asNonEmptyString(stepId);
  if (!pack || !normalizedStepId) return null;
  return pack.stepTemplates?.[normalizedStepId] || null;
}

export function listRunProfilesForPack(packOrId, options = {}) {
  const pack = typeof packOrId === "string" ? getPackTemplateById(packOrId) : packOrId;
  if (!pack) return [];

  const stepTemplateId = asNonEmptyString(options?.stepTemplateId);
  const profiles = normalizeUniqueStrings(pack.runProfileIds)
    .map((id) => RUN_PROFILES[id])
    .filter(Boolean)
    .filter((profile) => !stepTemplateId || profile.stepTemplateId === stepTemplateId);

  return profiles.slice().sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: "base" }));
}

export function getRunProfileById(id) {
  const normalizedId = asNonEmptyString(id);
  return normalizedId && RUN_PROFILES[normalizedId] ? RUN_PROFILES[normalizedId] : null;
}

export function getPromptModuleById(id) {
  const normalizedId = asNonEmptyString(id);
  return normalizedId && PROMPT_MODULES[normalizedId] ? PROMPT_MODULES[normalizedId] : null;
}

export function getPromptModulesByIds(ids) {
  return normalizeUniqueStrings(ids).map((id) => PROMPT_MODULES[id]).filter(Boolean);
}
