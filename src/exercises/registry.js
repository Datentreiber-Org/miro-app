import {
  TEMPLATE_ID,
  ANALYTICS_AI_USE_CASE_TEMPLATE_ID,
  DT_DEFAULT_APP_ADMIN_POLICY,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_DEFAULT_FEEDBACK_FRAME_NAME,
  DT_TRIGGER_KEYS,
  DT_TRIGGER_DEFAULTS
} from "../config.js?v=20260301-step11";

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

function normalizeTriggerInput(input) {
  if (typeof input === "string") {
    return { prompt: input };
  }
  return (input && typeof input === "object") ? input : { prompt: null };
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
  const sc = normalizeTriggerInput(selectionCheck);
  const sh = normalizeTriggerInput(selectionHint);
  const sa = normalizeTriggerInput(selectionAutocorrect);
  const sr = normalizeTriggerInput(selectionReview);
  const ss = normalizeTriggerInput(selectionSynthesize);
  const sco = normalizeTriggerInput(selectionCoach);
  const sg = normalizeTriggerInput(selectionGrade);
  const gc = normalizeTriggerInput(globalCheck);
  const gh = normalizeTriggerInput(globalHint);
  const ga = normalizeTriggerInput(globalAutocorrect);
  const gr = normalizeTriggerInput(globalReview);
  const gs = normalizeTriggerInput(globalSynthesize);
  const gco = normalizeTriggerInput(globalCoach);
  const gg = normalizeTriggerInput(globalGrade);

  return {
    "selection.check": createTriggerConfig("selection.check", sc.prompt, sc),
    "selection.hint": createTriggerConfig("selection.hint", sh.prompt, sh),
    "selection.autocorrect": createTriggerConfig("selection.autocorrect", sa.prompt, { feedbackPolicy: "both", ...sa }),
    "selection.review": createTriggerConfig("selection.review", sr.prompt, sr),
    "selection.synthesize": createTriggerConfig("selection.synthesize", ss.prompt, ss),
    "selection.coach": createTriggerConfig("selection.coach", sco.prompt, sco),
    "selection.grade": createTriggerConfig("selection.grade", sg.prompt, sg),
    "global.check": createTriggerConfig("global.check", gc.prompt, gc),
    "global.hint": createTriggerConfig("global.hint", gh.prompt, gh),
    "global.autocorrect": createTriggerConfig("global.autocorrect", ga.prompt, { feedbackPolicy: "both", ...ga }),
    "global.review": createTriggerConfig("global.review", gr.prompt, gr),
    "global.synthesize": createTriggerConfig("global.synthesize", gs.prompt, gs),
    "global.coach": createTriggerConfig("global.coach", gco.prompt, gco),
    "global.grade": createTriggerConfig("global.grade", gg.prompt, gg)
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


const ANALYTICS_AI_USECASE_FIT_SPRINT_PACK = {
  id: "analytics-ai-usecase-fit-sprint-v1",
  label: "Use Case Fit Sprint",
  version: 1,
  description: "Geführte Miniübung auf dem Analytics & AI Use Case Canvas, um Nutzerperspektive, Lösungsperspektive und Problem-Solution-Fit schrittweise auszuarbeiten.",
  boardMode: "exercise",
  allowedCanvasTypes: [ANALYTICS_AI_USE_CASE_TEMPLATE_ID],
  defaultCanvasTypeId: ANALYTICS_AI_USE_CASE_TEMPLATE_ID,
  defaultStepId: "step1_user_perspective",
  defaults: {
    feedbackFrameName: DT_DEFAULT_FEEDBACK_FRAME_NAME,
    feedbackChannel: DT_DEFAULT_FEEDBACK_CHANNEL,
    userMayChangePack: false,
    userMayChangeStep: false,
    appAdminPolicy: DT_DEFAULT_APP_ADMIN_POLICY
  },
  globalPrompt: `
Auf diesem Board läuft die Übung "Use Case Fit Sprint" auf dem Canvas "Analytics & AI Use Case".

Übergeordnetes Ziel:
- Entwickle einen Analytics- oder KI-Anwendungsfall konsequent aus der Nutzerperspektive.
- Arbeite erst die rechte Seite des Canvas tragfähig aus und leite danach die linke Seite als Antwort darauf ab.
- Verdichte anschließend den Problem-Solution-Fit im Feld Check.

Methodische Leitregeln:
- Die rechte Seite beschreibt die Nutzerperspektive: User & Situation, Objectives & Results, Decisions & Actions, User Gains, User Pains.
- Die linke Seite beschreibt die Lösungsperspektive: Solutions, Information, Functions, Benefits.
- Das Feld Check verdichtet den Problem-Solution-Fit.
- Verwende die Kette Information → Decisions & Actions → Results → Objectives als fachliche Leitlinie.
- Benefits sind nur dann tragfähig, wenn sie Pains reduzieren, Gains verstärken oder zu besseren Ergebnissen und Zielen beitragen.
- Nutze Connectoren nur dort, wo Beziehungen methodisch klar und lesbar sind.
- Erfinde keine unnötigen Systemarchitekturen oder technischen Details; bleibe auf Use-Case-Ebene.
- Arbeite präzise, atomar und area-genau.`.trim(),
  steps: {
    step1_user_perspective: {
      id: "step1_user_perspective",
      order: 10,
      label: "User Perspective First",
      visibleInstruction: "Fülle zuerst die Nutzerperspektive aus: User & Situation, Objectives & Results, Decisions & Actions, User Gains und User Pains.",
      allowedActions: ["create_sticky", "move_sticky", "delete_sticky", "create_connector"],
      defaultEnterTrigger: null,
      allowedTriggers: buildStepAllowedTriggers({
        selectionCheck: `
Prüfmodus für den Schritt "User Perspective First":
- Fokus ausschließlich auf der rechten Seite des Canvas.
- Prüfe, ob User & Situation konkret genug sind.
- Prüfe, ob Objectives & Results als gewünschte Ziele oder erwartete Ergebnisse formuliert sind.
- Prüfe, ob Decisions & Actions echte Entscheidungen oder Handlungen beschreiben.
- Prüfe, ob User Gains und User Pains plausibel aus Nutzersicht formuliert sind.
- Prüfe Fehlplatzierungen und verschiebe nur dann, wenn die Korrektur eindeutig und unstrittig ist.
- Connectoren sind nur dann sinnvoll, wenn Beziehungen klar sind, insbesondere Decisions & Actions → Objectives & Results.
- Liefere feedback mit korrekten Punkten, Lücken, Unklarheiten und Fehlplatzierungen.`.trim(),
        selectionHint: `
Hinweismodus für den Schritt "User Perspective First":
- Gib möglichst wenig invasive Unterstützung.
- Formuliere knappe Hinweise, was auf der rechten Seite noch fehlt oder zu vage ist.
- Nutze Board-Mutationen nur in Ausnahmefällen; bevorzuge feedback und recommendations.`.trim(),
        selectionAutocorrect: `
Autokorrekturmodus für den Schritt "User Perspective First":
- Korrigiere aktiv die rechte Seite des Canvas.
- Verschiebe eindeutig falsch platzierte Sticky Notes in die passende Area der Nutzerperspektive.
- Ergänze nur klar notwendige Sticky Notes, um offensichtliche Lücken zu schließen.
- Entferne nur leere, redundante oder doppelte Inhalte.
- Entwickle in diesem Schritt noch keine vollständige linke Lösungsperspektive.
- Ergänze Connectoren nur dort, wo sie methodisch klar sind, insbesondere Decisions & Actions → Objectives & Results.
- Erkläre in feedback, welche Korrekturen vorgenommen wurden und ob die Instanz für den nächsten Schritt tragfähig ist.`.trim(),
        selectionReview: `
Reviewmodus für den Schritt "User Perspective First":
- Beurteile die Qualität, Lesbarkeit und methodische Sauberkeit der rechten Seite.
- Nimm standardmäßig keine Board-Mutationen vor.
- Gib präzises feedback zu Vollständigkeit, Spezifität und Reifegrad.`.trim(),
        selectionSynthesize: `
Synthesemodus für den Schritt "User Perspective First":
- Verdichte, welche Nutzer, Ziele, Entscheidungen, Gains und Pains bereits sichtbar sind.
- Fokus auf Einsichten und Muster, nicht auf Mutationen.`.trim(),
        selectionCoach: `
Coachmodus für den Schritt "User Perspective First":
- Coache die selektierten Canvas-Instanzen, wie die rechte Seite sinnvoll ausgefüllt werden soll.
- Erkläre konkret, was in User & Situation, Objectives & Results, Decisions & Actions, User Gains und User Pains gehört.
- Nutze vorhandene Stickies als Ausgangspunkt.
- actions sollen normalerweise leer bleiben.
- Liefere starkes feedback und recommendations in Richtung selection.check oder selection.hint.`.trim(),
        selectionGrade: `
Bewertungsmodus für den Schritt "User Perspective First":
- Bewerte die rechte Seite anhand der Kriterien User Clarity, Objective Quality, Decision/Action Quality, Pain/Gain Quality und Area Correctness.
- Führe keine oder praktisch keine Board-Mutationen aus.
- Liefere zusätzlich eine evaluation mit Rubrik.
- Setze advanceStepSuggested nur dann auf true, wenn die rechte Seite tragfähig genug ist, um daraus die Lösungsperspektive abzuleiten.`.trim(),
        globalCheck: `
Globaler Prüfmodus für den Schritt "User Perspective First":
- Prüfe über alle relevanten Instanzen hinweg, ob Nutzerperspektiven konsistent, konkret und methodisch tragfähig sind.
- Hebe globale Lücken und wiederkehrende Fehlplatzierungen hervor.`.trim(),
        globalHint: `
Globaler Hinweismodus für den Schritt "User Perspective First":
- Gib globale Hinweise, welche Aspekte der Nutzerperspektive typischerweise noch fehlen oder unscharf sind.
- Bevorzuge feedback und recommendations; handle Board-Mutationen sehr sparsam.`.trim(),
        globalAutocorrect: `
Globaler Autokorrekturmodus für den Schritt "User Perspective First":
- Korrigiere über alle relevanten Instanzen hinweg nur eindeutige Fehlplatzierungen oder Lücken auf der rechten Seite.
- Entwickle noch keine vollständige linke Lösungsperspektive.`.trim(),
        globalReview: `
Globaler Reviewmodus für den Schritt "User Perspective First":
- Führe einen qualitativen Gesamt-Review über die Nutzerperspektiven aller relevanten Instanzen durch.
- Fokus: Reifegrad, Präzision, Area-Korrektheit und Vergleichbarkeit.`.trim(),
        globalSynthesize: `
Globaler Synthesemodus für den Schritt "User Perspective First":
- Verdichte über alle relevanten Instanzen hinweg die wichtigsten Nutzerziele, Pains, Gains und Handlungsmuster.
- Keine Standard-Mutationen; Fokus auf Muster und Erkenntnisse.`.trim(),
        globalCoach: `
Globaler Coachmodus für den Schritt "User Perspective First":
- Gib dem Team eine klare übergreifende Anleitung, wie es die Nutzerperspektive weiter schärfen soll.`.trim(),
        globalGrade: `
Globaler Bewertungsmodus für den Schritt "User Perspective First":
- Bewerte die Gesamtqualität der Nutzerperspektive über alle relevanten Instanzen.
- Liefere zusätzlich eine evaluation mit Rubrik.`.trim()
      }),
      transitions: [
        createManualTransition("step2_solution_perspective", {
          allowedAfterTriggers: ["selection.check", "selection.grade", "global.review"],
          requiredStepStatuses: ["ready_for_review", "completed"]
        })
      ]
    },
    step2_solution_perspective: {
      id: "step2_solution_perspective",
      order: 20,
      label: "Solution Perspective",
      visibleInstruction: "Leite nun aus der Nutzerperspektive die Lösungsperspektive ab: Solutions, Information, Functions und Benefits.",
      allowedActions: ["create_sticky", "move_sticky", "delete_sticky", "create_connector"],
      defaultEnterTrigger: null,
      allowedTriggers: buildStepAllowedTriggers({
        selectionCheck: `
Prüfmodus für den Schritt "Solution Perspective":
- Fokus auf der linken Seite des Canvas.
- Prüfe, ob Solutions, Information, Functions und Benefits nachvollziehbar aus der Nutzerperspektive abgeleitet sind.
- Prüfe, ob Information Entscheidungen oder Handlungen verbessert.
- Prüfe, ob Functions reale Entscheidungen oder Handlungen unterstützen.
- Prüfe, ob Benefits Pains reduzieren, Gains verstärken oder zu Ergebnissen und Zielen beitragen.
- Ergänze Connectoren nur dort, wo Beziehungen klar ableitbar sind, insbesondere Information → Decisions & Actions, Functions → Decisions & Actions sowie Benefits → User Pains/User Gains/Objectives & Results.`.trim(),
        selectionHint: `
Hinweismodus für den Schritt "Solution Perspective":
- Gib präzise Hinweise, wie die linke Seite aus der rechten Seite abgeleitet werden sollte.
- Board-Mutationen nur in Ausnahmefällen; bevorzuge feedback und recommendations.`.trim(),
        selectionAutocorrect: `
Autokorrekturmodus für den Schritt "Solution Perspective":
- Korrigiere aktiv die linke Seite des Canvas.
- Verschiebe fehlplatzierte Inhalte in Solutions, Information, Functions oder Benefits.
- Ergänze nur klar notwendige Sticky Notes, um offensichtliche Lücken zu schließen.
- Ergänze sinnvolle Connectoren zwischen linker und rechter Seite.
- Bleibe auf Use-Case-Ebene und erfinde keine komplexen Systemarchitekturen.
- Erkläre in feedback, welche Korrekturen du vorgenommen hast und ob der Check-Schritt sinnvoll ist.`.trim(),
        selectionReview: `
Reviewmodus für den Schritt "Solution Perspective":
- Beurteile die Relevanz, Präzision und Nutzennähe der Lösungsperspektive.
- Nimm standardmäßig keine Board-Mutationen vor.`.trim(),
        selectionSynthesize: `
Synthesemodus für den Schritt "Solution Perspective":
- Verdichte, welche Lösungsmuster, Informationsbedarfe, Funktionen und Benefits bereits sichtbar sind.
- Fokus auf übergreifende Einsichten, nicht auf Mutationen.`.trim(),
        selectionCoach: `
Coachmodus für den Schritt "Solution Perspective":
- Erkläre klar den Unterschied zwischen Solutions, Information, Functions und Benefits.
- Hilf dabei, aus Decisions & Actions sinnvolle Information und Functions und aus Pains/Gains tragfähige Benefits abzuleiten.
- actions sollen normalerweise leer bleiben.`.trim(),
        selectionGrade: `
Bewertungsmodus für den Schritt "Solution Perspective":
- Bewerte die linke Seite anhand der Kriterien Solution Relevance, Information Quality, Function Usefulness, Benefit Strength und Cross-Side Traceability.
- Führe keine oder praktisch keine Board-Mutationen aus.
- Liefere zusätzlich eine evaluation mit Rubrik.
- Setze advanceStepSuggested nur dann auf true, wenn die Lösungsperspektive tragfähig genug ist, um den Problem-Solution-Fit explizit zu verdichten.`.trim(),
        globalCheck: `
Globaler Prüfmodus für den Schritt "Solution Perspective":
- Prüfe über alle relevanten Instanzen hinweg, ob die Lösungsperspektiven nachvollziehbar aus der Nutzerperspektive abgeleitet sind.`.trim(),
        globalHint: `
Globaler Hinweismodus für den Schritt "Solution Perspective":
- Gib globale Hinweise zu fehlenden Informationsbedarfen, vagen Funktionen und schwachen Benefits.`.trim(),
        globalAutocorrect: `
Globaler Autokorrekturmodus für den Schritt "Solution Perspective":
- Korrigiere selektionsunabhängig über alle relevanten Instanzen hinweg eindeutige Probleme der linken Seite.`.trim(),
        globalReview: `
Globaler Reviewmodus für den Schritt "Solution Perspective":
- Führe einen qualitativen Gesamt-Review über alle relevanten Lösungsperspektiven durch.
- Fokus: Relevanz, Lesbarkeit, Ableitung aus der Nutzerperspektive.`.trim(),
        globalSynthesize: `
Globaler Synthesemodus für den Schritt "Solution Perspective":
- Verdichte die wichtigsten Lösungs-, Informations-, Funktions- und Benefit-Muster über alle relevanten Instanzen hinweg.`.trim(),
        globalCoach: `
Globaler Coachmodus für den Schritt "Solution Perspective":
- Gib dem Team eine klare Anleitung für die nächste übergreifende Ausarbeitung der Lösungsperspektive.`.trim(),
        globalGrade: `
Globaler Bewertungsmodus für den Schritt "Solution Perspective":
- Bewerte die Gesamtqualität der Lösungsperspektiven über alle relevanten Instanzen.
- Liefere zusätzlich eine evaluation mit Rubrik.`.trim()
      }),
      transitions: [
        createManualTransition("step3_fit_check_and_synthesis", {
          allowedAfterTriggers: ["selection.check", "selection.grade", "global.review"],
          requiredStepStatuses: ["ready_for_review", "completed"]
        })
      ]
    },
    step3_fit_check_and_synthesis: {
      id: "step3_fit_check_and_synthesis",
      order: 30,
      label: "Fit Check & Synthesis",
      visibleInstruction: "Verdichte den Problem-Solution-Fit im Feld Check und prüfe die Konsistenz zwischen Nutzer- und Lösungsperspektive.",
      allowedActions: ["create_sticky", "move_sticky", "delete_sticky", "create_connector"],
      defaultEnterTrigger: null,
      allowedTriggers: buildStepAllowedTriggers({
        selectionCheck: `
Prüfmodus für den Schritt "Fit Check & Synthesis":
- Prüfe die Konsistenz zwischen rechter und linker Seite.
- Prüfe, ob Benefits tatsächlich Pains reduzieren, Gains verstärken oder Entscheidungen, Handlungen, Ergebnisse und Ziele unterstützen.
- Das Feld Check dient der Verdichtung des Problem-Solution-Fit.`.trim(),
        selectionHint: `
Hinweismodus für den Schritt "Fit Check & Synthesis":
- Gib knappe Hinweise, wie der Problem-Solution-Fit klarer und belastbarer formuliert werden kann.`.trim(),
        selectionAutocorrect: `
Autokorrekturmodus für den Schritt "Fit Check & Synthesis":
- Korrigiere aktiv klare Inkonsistenzen zwischen rechter und linker Seite.
- Ergänze bei Bedarf fehlende, eindeutige Connectoren oder kleine Präzisierungen im Check-Feld.
- Keine große Restrukturierung des Canvas.`.trim(),
        selectionReview: `
Reviewmodus für den Schritt "Fit Check & Synthesis":
- Führe einen qualitativen Review des Problem-Solution-Fit durch.
- Nimm standardmäßig keine Board-Mutationen vor.`.trim(),
        selectionSynthesize: {
          mutationPolicy: "limited",
          feedbackPolicy: "text",
          prompt: `
Synthesemodus für den Schritt "Fit Check & Synthesis":
- Verdichte die selektierte Instanz oder die selektierten Instanzen und mache den Problem-Solution-Fit sichtbar.
- Formuliere pro Instanz 1 bis 3 knappe Fit-Aussagen für das Feld Check.
- In diesem Trigger darfst du begrenzte Mutationen durchführen: bis zu drei neue Sticky Notes im Feld Check und sinnvolle ergänzende Connectoren.
- Nimm keine große Restrukturierung des restlichen Canvas vor.
- Liefere feedback, das die Verdichtung erklärt, und recommendations, ob global.review, global.synthesize oder der Abschluss sinnvoll ist.`.trim()
        },
        selectionCoach: `
Coachmodus für den Schritt "Fit Check & Synthesis":
- Erkläre, wie aus Nutzerperspektive und Lösungsperspektive belastbare Fit-Aussagen im Feld Check formuliert werden.
- actions sollen normalerweise leer bleiben.`.trim(),
        selectionGrade: `
Bewertungsmodus für den Schritt "Fit Check & Synthesis":
- Bewerte den Problem-Solution-Fit anhand der Kriterien Fit Clarity, Fit Evidence, Consistency, Actionability und Overall Coherence.
- Führe keine oder praktisch keine Board-Mutationen aus.
- Liefere zusätzlich eine evaluation mit Rubrik.`.trim(),
        globalCheck: `
Globaler Prüfmodus für den Schritt "Fit Check & Synthesis":
- Prüfe über alle aktiven Instanzen hinweg, wo Problem-Solution-Fit bereits klar ist und wo noch Schwächen bestehen.`.trim(),
        globalHint: `
Globaler Hinweismodus für den Schritt "Fit Check & Synthesis":
- Gib globale Hinweise, wo Fit-Aussagen fehlen oder die Konsistenz noch nicht überzeugend ist.`.trim(),
        globalAutocorrect: `
Globaler Autokorrekturmodus für den Schritt "Fit Check & Synthesis":
- Korrigiere nur klare globale Inkonsistenzen oder fehlende Verdichtungen mit Bedacht.`.trim(),
        globalReview: `
Globaler Reviewmodus für den Schritt "Fit Check & Synthesis":
- Prüfe alle aktiven Instanzen dieses Exercise Packs im Zusammenhang.
- Ziel ist ein qualitativer Gesamt-Review: Welche Instanzen haben einen klaren Problem-Solution-Fit, wo sind Nutzerperspektiven zu vage, wo sind Lösungen zu allgemein oder nicht ausreichend an Entscheidungen und Handlungen gekoppelt, und welche Stärken oder Schwächen wiederholen sich über mehrere Instanzen hinweg?
- Dieser Trigger dient primär Analyse und feedback; nimm normalerweise keine oder nur minimale Board-Mutationen vor.`.trim(),
        globalSynthesize: `
Globaler Synthesemodus für den Schritt "Fit Check & Synthesis":
- Verdichte alle aktiven Instanzen dieses Exercise Packs zu einer übergreifenden Synthese.
- Suche nach wiederkehrenden Nutzerzielen, Pains, Entscheidungs- und Handlungsmustern, Informations- und Funktionsmustern, Benefits und Fit-Lücken.
- Dieser Trigger dient primär der übergreifenden Zusammenfassung und dem feedback, nicht der massiven Board-Manipulation.`.trim(),
        globalCoach: `
Globaler Coachmodus für den Schritt "Fit Check & Synthesis":
- Gib dem Team eine klare Anleitung, ob es vertiefen, korrigieren oder abschließen sollte.`.trim(),
        globalGrade: `
Globaler Bewertungsmodus für den Schritt "Fit Check & Synthesis":
- Bewerte die Gesamtqualität des Problem-Solution-Fit über alle relevanten Instanzen.
- Liefere zusätzlich eine evaluation mit Rubrik.`.trim()
      }),
      transitions: []
    }
  }
};

export const EXERCISE_PACKS = Object.freeze({
  [PERSONA_BASICS_PACK.id]: PERSONA_BASICS_PACK,
  [ANALYTICS_AI_USECASE_FIT_SPRINT_PACK.id]: ANALYTICS_AI_USECASE_FIT_SPRINT_PACK
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
