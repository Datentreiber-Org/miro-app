import { ANALYTICS_AI_USE_CASE_TEMPLATE_ID } from "../config.js?v=20260304-editorial15";

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
  "analytics.fit.shared.method_guardrails": createPromptModule(
    "analytics.fit.shared.method_guardrails",
    "Methodische Leitplanken",
    "Hält den Agenten auf Use-Case-, Canvas- und Arbeitslogik-Kurs.",
    `Arbeite methodisch sauber auf dem Analytics & AI Use Case Canvas:
- Bleibe immer im Scope der ausgewählten Instanzen und des aktiven Schritts.
- Behandle jede Sticky Note möglichst als eine atomare Aussage; vermeide Sammel-Stickies mit mehreren Gedanken.
- Bleibe auf Use-Case-Ebene und erfinde keine unnötigen technischen Architekturen, Toollisten oder KI-Floskeln ohne Bezug zur Nutzerarbeit.
- Respektiere die Area-Semantik des Canvas: mische nicht Nutzerperspektive, Lösungsperspektive und Fit-Aussagen unkontrolliert.
- Nutze Connectoren nur dort, wo eine fachliche Beziehung klar, lesbar und nützlich ist.
- Arbeite anschlussfähig an vorhandenen Inhalten statt das Board vollständig neu zu erfinden.
- Wenn Inhalte noch unreif sind, benenne Lücken präzise und erkläre den nächsten sinnvollen Arbeitsschritt statt pauschal nur Mängel festzustellen.`
  ),
  "analytics.fit.shared.check_style": createPromptModule(
    "analytics.fit.shared.check_style",
    "Check-Stil",
    "Strukturierter Prüfmodus mit klaren Stärken, Lücken und nächsten Schritten.",
    `Prüfmodus:
- Prüfe strukturiert auf Vollständigkeit, Präzision, Fehlplatzierungen, Doppelungen, Unklarheiten und logische Brüche.
- Gib im feedback möglichst klar an: was bereits tragfähig ist, was fehlt, was unklar oder zu generisch ist und was als nächstes verbessert werden sollte.
- Wenn Board-Mutationen in diesem Trigger erlaubt sind, nimm nur offensichtliche, risikoarme Korrekturen vor.
- Wenn der relevante Bereich noch leer oder sehr unreif ist, wechsle von strenger Bewertung zu didaktischer Aktivierung: erkläre, womit man sinnvoll beginnen sollte, statt nur Leere zu protokollieren.`
  ),
  "analytics.fit.shared.hint_style": createPromptModule(
    "analytics.fit.shared.hint_style",
    "Hint-Stil",
    "Kurzer, hilfreicher und anschlussfähiger Hinweisstil mit konkreten nächsten Schritten.",
    `Hinweisstil:
- Sei knapp, freundlich und konkret, aber nicht zu vage.
- Priorisiere die nächsten 1 bis 3 sinnvollen Arbeitsschritte statt einen Vollrundumschlag zu geben.
- Wenn Material vorhanden ist, knüpfe explizit an dieses Material an.
- Wenn der relevante Bereich leer ist, gib eine sinnvolle Startreihenfolge und konkrete Formulierungsanstöße oder Satzanfänge.
- Erzeuge normalerweise keine oder nur minimale Board-Mutationen; der Mehrwert soll vor allem im feedback liegen.`
  ),
  "analytics.fit.shared.coach_style": createPromptModule(
    "analytics.fit.shared.coach_style",
    "Coach-Stil",
    "Sokratischer, motivierender Coaching-Stil mit Leitfragen und Mikroschritt.",
    `Coaching-Stil:
- Formuliere eher coachend als bewertend.
- Gib 3 bis 5 konkrete Leitfragen oder Reflexionsimpulse, die direkt zum aktiven Schritt passen.
- Ergänze genau einen klaren Mikroschritt, mit dem der Nutzer sofort weitermachen kann.
- Liefere keine vollständig ausformulierte Komplettlösung, wenn nicht ausdrücklich darum gebeten wird.
- Wenn das Canvas leer ist, nutze Kick-off-Fragen und erkläre, warum ein bestimmter Einstieg fachlich sinnvoll ist.`
  ),
  "analytics.fit.shared.review_style": createPromptModule(
    "analytics.fit.shared.review_style",
    "Review-Stil",
    "Qualitativer Review mit Fokus auf Konsistenz, Reifegrad und Risiken statt auf Mutation.",
    `Review-Stil:
- Führe einen qualitativen Review durch, nicht bloß eine Checkliste.
- Benenne möglichst klar Stärken, Schwächen, Widersprüche, fehlende Voraussetzungen und Risiken.
- Wenn der Reifegrad noch zu niedrig für einen belastbaren Review ist, sage das explizit und erkläre, welche Vorarbeit zuerst fehlt.
- Nimm standardmäßig keine Board-Mutationen vor; der Mehrwert liegt in Diagnose, Einordnung und Empfehlungen.`
  ),
  "analytics.fit.shared.synthesis_style": createPromptModule(
    "analytics.fit.shared.synthesis_style",
    "Synthese-Stil",
    "Verdichtet nur dann, wenn bereits genug Substanz vorhanden ist; sonst benennt er fehlende Voraussetzungen.",
    `Synthese-Stil:
- Verdichte vorhandene Inhalte in knappe, belastbare Fit-Aussagen.
- Erfinde keinen Problem-Solution-Fit, wenn der Canvas noch zu leer oder zu widersprüchlich ist.
- Wenn die Vorarbeit noch nicht reicht, benenne präzise, was vor der Synthese zuerst geklärt werden muss.
- Wenn Mutationen erlaubt sind, beschränke sie auf kleine, gezielte Ergänzungen im Feld Check und auf wenige, klar begründete Connectoren.`
  ),
  "analytics.fit.step1.focus_user_perspective": createPromptModule(
    "analytics.fit.step1.focus_user_perspective",
    "Fokus: User Perspective First",
    "Konzentriert den Agenten auf die rechte Seite und ihre innere Logik.",
    `Schrittfokus "User Perspective First":
- Arbeite ausschließlich oder nahezu ausschließlich auf der rechten Seite des Canvas.
- Gute Reihenfolge für die Nutzerperspektive: zuerst User & Situation, dann Decisions & Actions, danach Objectives & Results und anschließend User Pains sowie User Gains.
- Prüfe oder erläutere, ob User & Situation konkret genug sind: Wer genau arbeitet in welcher Situation an welcher Aufgabe?
- Prüfe oder erläutere, ob Decisions & Actions echte Entscheidungen oder Handlungen beschreiben und nicht bloß Systemfunktionen oder Ziele.
- Prüfe oder erläutere, ob Objectives & Results erwünschte Outcomes beschreiben und nicht mit Maßnahmen oder Features verwechselt werden.
- User Pains sollen Friktionen, Risiken, Unsicherheiten oder Aufwände aus Nutzersicht beschreiben.
- User Gains sollen positive Effekte oder gewünschte Erleichterungen aus Nutzersicht beschreiben.
- Lenke die Aufmerksamkeit noch nicht auf Solutions, Functions oder Benefits, solange die Nutzerperspektive nicht tragfähig ist.`
  ),
  "analytics.fit.step1.bootstrap_empty_user_perspective": createPromptModule(
    "analytics.fit.step1.bootstrap_empty_user_perspective",
    "Startdidaktik: leere User Perspective",
    "Hilft bei leerem oder fast leerem Step 1 mit Startreihenfolge und Formulierungsanstößen.",
    `Wenn die rechte Seite des Canvas leer oder fast leer ist:
- Behandle die Situation als fachlichen Kick-off und nicht als bloßen Mangelbericht.
- Erkläre kurz, warum der sinnvollste Einstieg meist über User & Situation und Decisions & Actions läuft.
- Gib eine klare Startreihenfolge für die ersten Stickies vor.
- Gib konkrete Formulierungsanstöße oder Satzanfänge, z. B.:
  - User & Situation: "<Rolle> muss in <Situation/Kontext> ..."
  - Decisions & Actions: "<Rolle> entscheidet, ob ..." oder "<Rolle> führt heute ... aus"
  - Objectives & Results: "Ziel ist ..., messbar daran, dass ..."
  - User Pains: "Schwierig ist derzeit ..., weil ..."
  - User Gains: "Hilfreich wäre für den Nutzer ..., damit ..."
- Wenn der Trigger ein Hint oder Coach ist, gib lieber gute Startimpulse als fertige Inhalte.`
  ),
  "analytics.fit.step2.focus_solution_perspective": createPromptModule(
    "analytics.fit.step2.focus_solution_perspective",
    "Fokus: Solution Perspective",
    "Lenkt den Agenten auf die linke Seite und ihre Ableitung aus der Nutzerperspektive.",
    `Schrittfokus "Solution Perspective":
- Arbeite schwerpunktmäßig auf der linken Seite des Canvas.
- Prüfe oder erläutere, ob Solutions, Information, Functions und Benefits nachvollziehbar aus der Nutzerperspektive abgeleitet werden.
- Eine gute Ableitungslogik ist: Welche Entscheidung oder Handlung ist kritisch? Welche Information würde sie verbessern? Welche Funktion macht diese Information nutzbar? Welche Benefits entstehen daraus?
- Information beschreibt Inhalte, Signale oder Erkenntnisse; Functions beschreiben Mechanismen oder Fähigkeiten; Solutions beschreiben die Lösungsidee als Ganzes.
- Vermeide generische Aussagen wie "KI-Tool", "Dashboard" oder "Automatisierung", wenn nicht klar ist, welche Information, welche Funktion und welcher Nutzen dahinter steckt.
- Benefits müssen einen plausiblen Bezug zu User Pains, User Gains, Objectives & Results oder Decisions & Actions haben.`
  ),
  "analytics.fit.step2.bootstrap_empty_solution_perspective": createPromptModule(
    "analytics.fit.step2.bootstrap_empty_solution_perspective",
    "Startdidaktik: leere Solution Perspective",
    "Hilft bei leerer linker Seite oder unreifer rechter Seite mit der passenden Ableitungsdidaktik.",
    `Wenn die linke Seite noch leer oder sehr unreif ist:
- Prüfe zuerst knapp, ob die rechte Seite bereits genug Substanz für sinnvolle Ableitungen hat.
- Wenn die rechte Seite noch zu schwach ist, erkläre offen, welche Nutzerperspektiven zuerst präzisiert werden müssen, bevor gute Lösungen ableitbar sind.
- Wenn die rechte Seite brauchbar ist, führe didaktisch in die Ableitung ein:
  - Information: "Um Entscheidung/Aktion X besser auszuführen, braucht der Nutzer ..."
  - Functions: "Die Lösung sollte den Nutzer dabei unterstützen, indem ..."
  - Solutions: "Eine sinnvolle Lösungsidee wäre ..."
  - Benefits: "Dadurch sinkt/steigt/verbessert sich ..."
- Gib lieber 2 bis 4 gute Ableitungsanstöße als eine große, komplett ausformulierte Lösungsarchitektur.`
  ),
  "analytics.fit.step3.focus_fit_review": createPromptModule(
    "analytics.fit.step3.focus_fit_review",
    "Fokus: Fit Check Review",
    "Bewertet Problem-Solution-Fit, Konsistenz und Tragfähigkeit der Kette.",
    `Schrittfokus "Fit Check & Synthesis" im Review:
- Prüfe, ob eine nachvollziehbare Kette von User & Situation über Decisions & Actions und Objectives & Results hin zu Information, Functions, Solutions und Benefits erkennbar ist.
- Achte besonders auf fehlende Verbindungen, unbegründete Benefits, solutionistische Sprünge und unklare Ziel- oder Ergebnislogik.
- Ein guter Review benennt nicht nur Lücken, sondern auch, welche Teile bereits tragfähig zusammenpassen.
- Wenn mehrere Instanzen betrachtet werden, arbeite pro Instanz klar getrennt und vergleiche erst danach Muster.`
  ),
  "analytics.fit.step3.bootstrap_incomplete_fit": createPromptModule(
    "analytics.fit.step3.bootstrap_incomplete_fit",
    "Vorbedingung: unreifer Fit Check",
    "Verhindert verfrühte Fit-Bewertungen bei unvollständigem Canvas.",
    `Wenn die rechte oder linke Seite noch zu leer, zu allgemein oder zu widersprüchlich ist:
- Täusche keinen belastbaren Fit Check vor.
- Benenne stattdessen präzise, welche Vorbedingungen noch fehlen.
- Gib an, ob eher Step 1 oder Step 2 weiterbearbeitet werden sollte.
- Empfiehl als nächsten sinnvollen Trigger möglichst konkret check, hint oder coach auf dem passenden Schritt, statt schon eine Abschlussbewertung zu liefern.`
  ),
  "analytics.fit.step3.focus_fit_synthesis": createPromptModule(
    "analytics.fit.step3.focus_fit_synthesis",
    "Fokus: Fit Check Synthese",
    "Verdichtet den Fit in kurze Aussagen für das Check-Feld.",
    `Schrittfokus "Fit Check & Synthesis" in der Synthese:
- Verdichte pro betrachteter Instanz den Problem-Solution-Fit in 1 bis 3 kurze Aussagen für das Feld Check.
- Gute Check-Aussagen machen sichtbar, welche Information oder Funktion welche Entscheidung oder Handlung verbessert und warum dies zu besseren Ergebnissen, geringeren Pains oder stärkeren Gains führt.
- Nutze das Feld Check nicht für lange Erklärungen oder neue lose Ideen, sondern für knappe Verdichtungen des bereits erarbeiteten Kerns.`
  ),
  "analytics.fit.global.focus_cross_instance_review": createPromptModule(
    "analytics.fit.global.focus_cross_instance_review",
    "Fokus: Cross-Instance Review",
    "Vergleicht mehrere Instanzen auf Reifegrad, Muster, Stärken und wiederkehrende Schwächen.",
    `Globaler Vergleichsmodus:
- Vergleiche die betrachteten Instanzen im Gesamtzusammenhang.
- Erkenne wiederkehrende Muster: z. B. häufig zu vage Nutzerbeschreibungen, häufig nicht sauber abgeleitete Benefits oder starke, gut begründete Informations-zu-Entscheidungs-Ketten.
- Hebe Unterschiede im Reifegrad hervor: Welche Instanzen sind bereits belastbar, welche sind noch im Problemraum stecken geblieben, welche springen zu schnell in Lösungen?
- Gib dem feedback eine nützliche Aggregation, damit Teams sehen, welche Qualitätsmuster sich über mehrere Boards hinweg wiederholen.`
  )
});

export const PACK_TEMPLATES = Object.freeze({
  "analytics-ai-usecase-fit-sprint-template-v1": Object.freeze({
    id: "analytics-ai-usecase-fit-sprint-template-v1",
    label: "Use Case Fit Sprint",
    description: "Geführte Übung für das Analytics & AI Use Case Canvas mit didaktischer Sequenz von Nutzerperspektive über Lösungsperspektive bis zum Fit Check.",
    allowedCanvasTypeIds: Object.freeze([ANALYTICS_AI_USE_CASE_TEMPLATE_ID]),
    globalPrompt: `Auf diesem Board läuft die Übung "Use Case Fit Sprint" auf dem Canvas "Analytics & AI Use Case".

Übergeordnetes Ziel:
- Entwickle einen Analytics- oder KI-Anwendungsfall konsequent aus einer realen Nutzer- und Entscheidungssituation.
- Arbeite zuerst die Nutzerperspektive tragfähig aus, leite daraus die Lösungsperspektive ab und verdichte den Problem-Solution-Fit erst am Ende im Feld Check.

Didaktische Leitidee dieses Packs:
- Step 1 baut den Problemraum und die Nutzerlogik auf.
- Step 2 leitet daraus eine belastbare Lösungsperspektive ab.
- Step 3 prüft und verdichtet den Problem-Solution-Fit.
- Wenn ein Canvas oder Teilbereich noch leer ist, soll der Agent nicht nur Mängel melden, sondern didaktisch erklären, wie man fachlich sinnvoll startet.
- In Hint-Modi soll der Agent konkrete nächste Schritte und Formulierungsanstöße geben.
- In Coach-Modi soll der Agent mit Leitfragen arbeiten und einen Mikroschritt vorschlagen.
- In Review-Modi soll der Agent Stärken, Risiken, fehlende Voraussetzungen und Konsistenzprobleme klar benennen.

Methodische Regeln:
- Die rechte Seite beschreibt die Nutzerperspektive: User & Situation, Objectives & Results, Decisions & Actions, User Gains, User Pains.
- Die linke Seite beschreibt die Lösungsperspektive: Solutions, Information, Functions, Benefits.
- Das Feld Check verdichtet den Problem-Solution-Fit.
- Verwende die Kette Information → Decisions & Actions → Results → Objectives als fachliche Leitlinie.
- Benefits sind nur dann tragfähig, wenn sie Pains reduzieren, Gains verstärken oder zu besseren Ergebnissen und Zielen beitragen.
- Nutze Connectoren nur dort, wo Beziehungen methodisch klar, konkret und lesbar sind.
- Vermeide reine Technologiebehauptungen ohne Bezug zur Nutzerarbeit.
- Arbeite präzise, atomar, area-genau und immer passend zum Reifegrad des aktuellen Canvas.`.trim(),
    stepTemplates: Object.freeze({
      step1_user_perspective: createStepTemplate("step1_user_perspective", {
        order: 10,
        label: "User Perspective First",
        instruction: "Arbeite zuerst die rechte Seite aus: Beginne mit User & Situation und Decisions & Actions, ergänze danach Objectives & Results sowie User Pains und User Gains.",
        summary: "Zuerst einen belastbaren Problemraum und eine klare Nutzer- und Entscheidungssituation herstellen. Noch nicht in Lösungen springen."
      }),
      step2_solution_perspective: createStepTemplate("step2_solution_perspective", {
        order: 20,
        label: "Solution Perspective",
        instruction: "Leite nun aus der Nutzerperspektive die linke Seite ab: Welche Information würde Entscheidungen oder Handlungen verbessern, welche Functions und Solutions machen das möglich und welche Benefits entstehen daraus?",
        summary: "Die Lösungsperspektive soll klar aus der Nutzerperspektive folgen und nicht generisch oder technologiegetrieben sein."
      }),
      step3_fit_check_and_synthesis: createStepTemplate("step3_fit_check_and_synthesis", {
        order: 30,
        label: "Fit Check & Synthesis",
        instruction: "Prüfe jetzt, ob Nutzerperspektive und Lösungsperspektive konsistent zusammenpassen. Erst wenn genug Substanz vorhanden ist, verdichte den Problem-Solution-Fit im Feld Check.",
        summary: "Konsistenz, Reifegrad und Problem-Solution-Fit prüfen und nur dann verdichten, wenn die Vorarbeit tragfähig genug ist."
      })
    }),
    runProfileIds: Object.freeze([
      "analytics.fit.step1.check",
      "analytics.fit.step1.hint",
      "analytics.fit.step1.coach",
      "analytics.fit.step2.check",
      "analytics.fit.step2.hint",
      "analytics.fit.step2.coach",
      "analytics.fit.step3.review",
      "analytics.fit.step3.coach",
      "analytics.fit.step3.synthesize",
      "analytics.fit.global.review"
    ])
  })
});

export const RUN_PROFILES = Object.freeze({
  "analytics.fit.step1.check": createRunProfile("analytics.fit.step1.check", "User Perspective prüfen", "Prüft die rechte Seite strukturiert auf Vollständigkeit, Präzision und Fehlplatzierungen und hilft bei Leere mit einer sinnvollen Startdidaktik.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step1_user_perspective",
    triggerKey: "selection.check",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.check_style",
      "analytics.fit.step1.bootstrap_empty_user_perspective",
      "analytics.fit.step1.focus_user_perspective"
    ],
    mutationPolicy: "limited",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Nutze dieses Profil, wenn die erste Version der Nutzerperspektive geprüft oder bei leerem Canvas fachlich angeschoben werden soll."
  }),
  "analytics.fit.step1.hint": createRunProfile("analytics.fit.step1.hint", "Hinweis zur User Perspective", "Gibt anschlussfähige, konkrete Hinweise zur rechten Seite und hilft bei leerem Canvas mit einer klaren Einstiegsreihenfolge.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step1_user_perspective",
    triggerKey: "selection.hint",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.hint_style",
      "analytics.fit.step1.bootstrap_empty_user_perspective",
      "analytics.fit.step1.focus_user_perspective"
    ],
    mutationPolicy: "minimal",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Guter Hilfe-Button für Teilnehmende, wenn sie einen kleinen, aber konkreten nächsten Schritt brauchen."
  }),
  "analytics.fit.step1.coach": createRunProfile("analytics.fit.step1.coach", "User Perspective coachen", "Coacht die rechte Seite mit Leitfragen, Reflexionsimpulsen und einem klaren Mikroschritt.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step1_user_perspective",
    triggerKey: "selection.coach",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.coach_style",
      "analytics.fit.step1.bootstrap_empty_user_perspective",
      "analytics.fit.step1.focus_user_perspective"
    ],
    mutationPolicy: "none",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Nutze dieses Profil, wenn Teilnehmende nicht einfach eine Bewertung, sondern Denk- und Gesprächsimpulse brauchen."
  }),
  "analytics.fit.step2.check": createRunProfile("analytics.fit.step2.check", "Solution Perspective prüfen", "Prüft die linke Seite auf Ableitung, Nutzwert und saubere Unterscheidung zwischen Information, Functions, Solutions und Benefits.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step2_solution_perspective",
    triggerKey: "selection.check",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.check_style",
      "analytics.fit.step2.bootstrap_empty_solution_perspective",
      "analytics.fit.step2.focus_solution_perspective"
    ],
    mutationPolicy: "limited",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Sinnvoll, wenn die linke Seite bereits befüllt ist oder gezielt aus der rechten Seite abgeleitet werden soll."
  }),
  "analytics.fit.step2.hint": createRunProfile("analytics.fit.step2.hint", "Hinweis zur Solution Perspective", "Gibt präzise Ableitungs-Hinweise für die linke Seite und erklärt bei Leere, wie man von Entscheidungen zu Information, Functions und Benefits kommt.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step2_solution_perspective",
    triggerKey: "selection.hint",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.hint_style",
      "analytics.fit.step2.bootstrap_empty_solution_perspective",
      "analytics.fit.step2.focus_solution_perspective"
    ],
    mutationPolicy: "minimal",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Gut geeignet, wenn die Nutzerperspektive schon brauchbar ist, die Lösungsperspektive aber noch nicht sauber abgeleitet wurde."
  }),
  "analytics.fit.step2.coach": createRunProfile("analytics.fit.step2.coach", "Solution Perspective coachen", "Coacht die Ableitung der linken Seite mit Leitfragen statt mit fertiger Lösungsskizze.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step2_solution_perspective",
    triggerKey: "selection.coach",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.coach_style",
      "analytics.fit.step2.bootstrap_empty_solution_perspective",
      "analytics.fit.step2.focus_solution_perspective"
    ],
    mutationPolicy: "none",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Nutze dieses Profil, wenn Teilnehmende selbst auf gute Ableitungen kommen sollen, statt eine direkte Lösung zu bekommen."
  }),
  "analytics.fit.step3.review": createRunProfile("analytics.fit.step3.review", "Fit Check reviewen", "Führt einen reifen qualitativen Review des Problem-Solution-Fit durch und behandelt unvollständige Boards ausdrücklich als Vorstufe statt als fertige Bewertung.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step3_fit_check_and_synthesis",
    triggerKey: "selection.review",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.review_style",
      "analytics.fit.step3.bootstrap_incomplete_fit",
      "analytics.fit.step3.focus_fit_review"
    ],
    mutationPolicy: "none",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Geeignet, wenn beide Seiten zumindest teilweise ausgearbeitet sind und ihr wissen wollt, wie belastbar der Fit bereits ist."
  }),
  "analytics.fit.step3.coach": createRunProfile("analytics.fit.step3.coach", "Fit Check coachen", "Coacht die Bewertung des Problem-Solution-Fit mit Leitfragen und zeigt fehlende Voraussetzungen für eine spätere Synthese auf.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step3_fit_check_and_synthesis",
    triggerKey: "selection.coach",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.coach_style",
      "analytics.fit.step3.bootstrap_incomplete_fit",
      "analytics.fit.step3.focus_fit_review"
    ],
    mutationPolicy: "none",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Sinnvoll, wenn der Fit noch nicht hart bewertet, sondern gemeinsam reflektiert werden soll."
  }),
  "analytics.fit.step3.synthesize": createRunProfile("analytics.fit.step3.synthesize", "Fit Check synthetisieren", "Verdichtet nur dann in das Check-Feld, wenn genug Substanz vorhanden ist; sonst werden fehlende Voraussetzungen benannt.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step3_fit_check_and_synthesis",
    triggerKey: "selection.synthesize",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.synthesis_style",
      "analytics.fit.step3.bootstrap_incomplete_fit",
      "analytics.fit.step3.focus_fit_synthesis"
    ],
    mutationPolicy: "limited",
    feedbackPolicy: "text",
    defaultScopeType: "fixed_instances",
    uiHint: "Erst verwenden, wenn Problem- und Lösungsperspektive schon genügend reif sind, um echte Fit-Aussagen zu verdichten."
  }),
  "analytics.fit.global.review": createRunProfile("analytics.fit.global.review", "Global Review", "Vergleicht mehrere Instanzen auf Reifegrad, Muster, Stärken und wiederkehrende Schwächen im Gesamtzusammenhang.", {
    packTemplateId: "analytics-ai-usecase-fit-sprint-template-v1",
    stepTemplateId: "step3_fit_check_and_synthesis",
    triggerKey: "global.review",
    moduleIds: [
      "analytics.fit.shared.method_guardrails",
      "analytics.fit.shared.review_style",
      "analytics.fit.global.focus_cross_instance_review"
    ],
    mutationPolicy: "none",
    feedbackPolicy: "text",
    defaultScopeType: "global",
    uiHint: "Nützlich für einen Meta-Review über mehrere Canvas-Instanzen oder Teams hinweg."
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
