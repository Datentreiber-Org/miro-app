export const UI_STRINGS = Object.freeze({
  "panel.documentTitle": { de: "Datentreiber Canvas – Miro Panel", en: "Datentreiber Canvas – Miro Panel" },
  "panel.heading": { de: "Datentreiber Canvas – Panel", en: "Datentreiber Canvas – Panel" },
  "panel.mode.label": { de: "Panel-Modus", en: "Panel mode" },
  "panel.mode.user": { de: "User-Modus", en: "User mode" },
  "panel.mode.admin": { de: "Admin-Modus", en: "Admin mode" },
  "board.language.label": { de: "App- und Boardsprache", en: "App and board language" },
  "board.language.option.de": { de: "Deutsch", en: "German" },
  "board.language.option.en": { de: "Englisch", en: "English" },
  "panel.mode.status.admin": {
    de: "Admin-Modus aktiv. Alle Konfigurations- und Diagnosefunktionen sind sichtbar.",
    en: "Admin mode is active. All configuration and diagnostic controls are visible."
  },
  "panel.mode.status.user": {
    de: "User-Modus aktiv. Die Übungsaktionen bleiben sichtbar, Admin-Steuerung ist ausgeblendet.",
    en: "User mode is active. Exercise actions stay visible while admin controls are hidden."
  },
  "panel.mode.status.adminOnly": {
    de: "Admin-Panel aktiv. User-Aktionen laufen über Board-Buttons und Chatflächen.",
    en: "Admin panel active. User actions run via board buttons and chat surfaces."
  },

  "user.text.label": { de: "Frage / Aufgabe für den Agenten", en: "Question / task for the agent" },
  "user.text.placeholder": {
    de: "Optionaler Zusatzauftrag für Check, Hint, Autocorrect oder generische Agentenläufe.",
    en: "Optional extra instruction for check, hint, autocorrect, or generic agent runs."
  },

  "status.exerciseContext.loading": { de: "Exercise-Kontext wird geladen ...", en: "Loading exercise context ..." },
  "status.exerciseInstruction.empty": { de: "Noch keine sichtbare Schrittanweisung geladen.", en: "No visible step instruction loaded yet." },
  "status.recommendation.empty": { de: "Noch keine Button-Freischaltungen gespeichert.", en: "No button activations stored yet." },
  "status.selection.loading": { de: "Selektion wird geladen ...", en: "Loading selection ..." },

  "section.exerciseActions": { de: "Empfohlene Aktionen", en: "Recommended actions" },
  "section.exerciseActionsPrimary": { de: "Primäre Aktionen", en: "Primary actions" },
  "section.exerciseActionsProposal": { de: "Vorschläge", en: "Proposals" },
  "exercise.action.secondaryHeading": { de: "Weitere Aktionen", en: "Additional actions" },
  "exercise.action.noneAvailable": { de: "Für diesen Schritt sind aktuell keine kuratierten Aktionen sichtbar.", en: "No curated actions are currently visible for this step." },
  "exercise.action.proposalUnavailable": { de: "Noch kein passender Vorschlag für den aktuellen Schritt und die aktuelle Selektion gespeichert.", en: "No matching proposal is stored yet for the current step and current selection." },
  "exercise.action.applyUnavailable": { de: "Vorschläge anwenden wird aktiv, sobald für die aktuelle Selektion ein passender Vorschlag vorliegt.", en: "Apply proposals becomes active once a matching proposal exists for the current selection." },
  "exercise.action.check": { de: "Antworten prüfen", en: "Check answers" },
  "exercise.action.hint": { de: "Hinweis geben", en: "Give hint" },
  "exercise.action.autocorrect": { de: "Korrektur anwenden", en: "Apply correction" },
  "exercise.action.review": { de: "Review", en: "Review" },
  "exercise.action.coach": { de: "Coach", en: "Coach" },
  "exercise.action.nextStep": { de: "Nächster Schritt", en: "Next step" },
  "exercise.action.help.default": {
    de: "Die Übungsaktionen arbeiten auf den aktuell selektierten Canvas-Instanzen. Ohne Selektion erscheint ein Warnhinweis im Log.",
    en: "Exercise actions work on the currently selected canvas instances. Without a selection, a warning is shown in the log."
  },

  "section.adminControl": { de: "Admin-Steuerung", en: "Admin controls" },
  "admin.apiKey.label": { de: "OpenAI API Key", en: "OpenAI API key" },
  "admin.model.label": { de: "Modell", en: "Model" },
  "admin.canvasType.label": { de: "Canvas-Typ auswählen", en: "Select canvas type" },
  "admin.canvasType.loading": { de: "Canvas-Typen werden geladen ...", en: "Loading canvas types ..." },
  "admin.exercisePack.label": { de: "Exercise Pack", en: "Exercise pack" },
  "admin.exercisePack.none": { de: "Kein Exercise Pack (generischer Modus)", en: "No exercise pack (generic mode)" },
  "admin.exerciseStep.label": { de: "Aktueller Schritt", en: "Current step" },
  "admin.exerciseStep.none": { de: "Kein Exercise Pack aktiv", en: "No exercise pack active" },
  "admin.override.label": { de: "Admin-Override (optional)", en: "Admin override (optional)" },
  "admin.override.placeholder": {
    de: "Zusätzliche Admin-Anweisung, die in den Prompt Composer injiziert wird.",
    en: "Additional admin instruction injected into the prompt composer."
  },
  "admin.override.save": { de: "Override speichern", en: "Save override" },
  "admin.override.clear": { de: "Override leeren", en: "Clear override" },
  "admin.override.help": {
    de: "Der Admin-Override wird im Exercise-Runtime-State gespeichert und bei Agentenläufen zusätzlich in den Systemprompt injiziert.",
    en: "The admin override is stored in the exercise runtime state and additionally injected into the system prompt during agent runs."
  },
  "section.adminStepTriggers": { de: "Erweiterte Schritt-Trigger", en: "Advanced step triggers" },
  "admin.stepTrigger.label": { de: "Erlaubter Trigger", en: "Allowed trigger" },
  "admin.stepTrigger.run": { de: "Trigger ausführen", en: "Run trigger" },
  "admin.stepTrigger.help": {
    de: "Führt jeden im aktuellen Schritt erlaubten Trigger direkt aus. Versteckte Trigger bleiben so testbar, ohne als Standard-Board-Interaktion prominent zu erscheinen.",
    en: "Runs any trigger that is allowed in the current step directly. Hidden triggers stay testable without becoming part of the default board interaction."
  },

  "section.flowControls": { de: "Board Flow Controls", en: "Board flow controls" },
  "flow.authoring.help": {
    de: "Selektiere eine oder mehrere Canvas-Instanzen auf dem Board. Die erste Instanz dient als visuelle Ankerposition für den Shape-Button; der Scope kann trotzdem mehrere Instanzen oder den globalen Board-Kontext abdecken.",
    en: "Select one or more canvas instances on the board. The first instance is used as the visual anchor for the shape button; the scope can still cover multiple instances or the global board context."
  },
  "flow.packTemplate.label": { de: "Pack Template", en: "Pack template" },
  "flow.stepTemplate.label": { de: "Step Template", en: "Step template" },
  "flow.runProfile.label": { de: "Run Profile", en: "Run profile" },
  "flow.scope.label": { de: "Scope", en: "Scope" },
  "flow.scope.fixed": { de: "Selektierte Instanzen", en: "Selected instances" },
  "flow.scope.global": { de: "Global (alle passenden Instanzen)", en: "Global (all matching instances)" },
  "flow.staticLayout.label": { de: "Statisches Button-Layout verwenden", en: "Use static button layout" },
  "flow.staticLayout.help": { de: "Wenn aktiv, darf der Agent vorhandene Buttons nur freischalten oder als erledigt markieren. Es werden keine fehlenden Buttons automatisch erzeugt und keine bestehenden Buttons automatisch neu positioniert.", en: "When enabled, the agent may only unlock existing buttons or mark them as done. Missing buttons will not be created automatically and existing buttons will not be repositioned automatically." },
  "flow.status.layoutMode": { de: "Button-Layout: {value}", en: "Button layout: {value}" },
  "flow.layoutMode.static": { de: "statisch", en: "static" },
  "flow.layoutMode.dynamic": { de: "dynamisch", en: "dynamic" },
  "flow.controlLabel.label": { de: "Button-Label", en: "Button label" },
  "flow.controlLabel.placeholder": { de: "z. B. Prüfen", en: "e.g. Check" },
  "flow.createControl": { de: "Control erzeugen", en: "Create control" },
  "flow.setCurrentStep": { de: "Aktiven Schritt des Flows setzen", en: "Set active flow step" },
  "flow.activateSelectedControl": { de: "Selektierten Flow-Button freischalten", en: "Unlock selected flow button" },
  "flow.completeSelectedControl": { de: "Selektierten Flow-Button als erledigt markieren", en: "Mark selected flow button as done" },
  "flow.resetSelectedControl": { de: "Selektierten Flow-Button zurücksetzen", en: "Reset selected flow button" },
  "flow.admin.stepHelp": {
    de: "Setzt den aktuellen Schritt des relevanten Flows auf das gewählte Step Template. Bei dynamischem Layout können dabei bei Bedarf Default-Buttons dieses Schritts ergänzt werden.",
    en: "Sets the current step of the relevant flow to the selected step template. In dynamic layout mode, the step’s default buttons can be seeded when needed."
  },
  "flow.admin.controlHelp": {
    de: "Freischalten wirkt nur auf den selektierten Flow-Button. Erledigt markiert ihn als done. Zurücksetzen entfernt manuelle Freischaltungen oder Done-Markierungen und stellt den modellseitigen Zustand wieder her.",
    en: "Unlock only affects the selected flow button. Done marks it as done. Reset clears manual unlock or done markers and restores the model-driven state."
  },
  "flow.authoring.status.empty": { de: "Noch keine Flow-Information geladen.", en: "No flow information loaded yet." },
  "flow.noStepTemplates": { de: "Keine Step Templates", en: "No step templates" },
  "flow.noRunProfiles": { de: "Keine Run Profiles", en: "No run profiles" },
  "flow.defaultControlLabel": { de: "Flow Control", en: "Flow control" },

  "button.insertTemplate": { de: "Canvas einfügen", en: "Insert canvas" },
  "button.agentSelection": { de: "Instanz-Agent (Selektion)", en: "Instance agent (selection)" },
  "button.clusterPanel": { de: "Auswahl clustern (Side-Panel)", en: "Cluster selection (side panel)" },
  "button.classifyDebug": { de: "Stickies klassifizieren (Debug)", en: "Classify stickies (debug)" },
  "button.openaiClassic": { de: "Klassischer OpenAI-Call", en: "Classic OpenAI call" },
  "button.memoryClear": { de: "Memory löschen", en: "Clear memory" },
  "button.memoryClear.help": {
    de: "Löscht kumulativen Memory-State und Memory-Log, nicht aber Board-Flows, gespeicherte Proposals oder andere Board-Artefakte.",
    en: "Clears cumulative memory state and memory log, but not board flows, stored proposals, or other board artifacts."
  },

  "canvasType.datentreiber-3boxes.name": { de: "Datentreiber 3-Boxes", en: "Datentreiber 3-Boxes" },
  "canvasType.datentreiber-analytics-ai-use-case.name": { de: "Analytics & AI Use Case", en: "Analytics & AI Use Case" },
  "canvas.noneConfigured": { de: "Keine Canvas-Typen konfiguriert.", en: "No canvas types configured." },
  "canvas.notAllowedMeta": { de: "{canvasTypeId} · im aktuellen Exercise Pack nicht freigegeben", en: "{canvasTypeId} · not enabled in the current exercise pack" },

  "selection.none": { de: "Keine Canvas selektiert.", en: "No canvas selected." },
  "selection.none.detail": { de: "Instanz-Agent erwartet mindestens eine selektierte Canvas-Instanz auf dem Board.", en: "The instance agent expects at least one selected canvas instance on the board." },
  "selection.unresolved": { de: "Aktuelle Selektion enthält keine auflösbare Canvas.", en: "The current selection does not contain a resolvable canvas." },
  "selection.unresolved.items": { de: "Selektierte Board-Items: {count}", en: "Selected board items: {count}" },
  "selection.unresolved.hint": { de: "Wähle mindestens eine Canvas oder ein Item innerhalb einer Canvas aus.", en: "Select at least one canvas or an item inside a canvas." },
  "selection.selectedCount": { de: "Selektierte Canvas: {count}", en: "Selected canvases: {count}" },
  "selection.instances": { de: "Instanzen: {labels}", en: "Instances: {labels}" },
  "selection.itemCount": { de: "Selektierte Board-Items: {count}", en: "Selected board items: {count}" },

  "exercise.context.boardMode": { de: "Board-Modus: {value}", en: "Board mode: {value}" },
  "exercise.context.pack": { de: "Exercise Pack: {value}", en: "Exercise pack: {value}" },
  "exercise.context.pack.none": { de: "keins (generischer Agentenmodus)", en: "none (generic agent mode)" },
  "exercise.context.currentStep": { de: "Aktueller Schritt: {value}", en: "Current step: {value}" },
  "exercise.context.currentStep.none": { de: "kein Schritt aktiv", en: "no active step" },
  "exercise.context.canvasType": { de: "Standard-Canvas-Typ: {value}", en: "Default canvas type: {value}" },
  "exercise.instruction.none": {
    de: "Kein sichtbarer Übungsschritt aktiv. Der Agent läuft im generischen Modus.",
    en: "No visible exercise step is active. The agent runs in generic mode."
  },

  "recommendation.primaryActions": { de: "Primäre Aktionen jetzt: {value}", en: "Primary actions now: {value}" },
  "recommendation.secondaryActions": { de: "Sekundäre Aktionen jetzt: {value}", en: "Secondary actions now: {value}" },
  "recommendation.proposalActions": { de: "Vorschlagsmodus: {value}", en: "Proposal lane: {value}" },
  "recommendation.proposalState.ready": { de: "für die aktuelle Selektion anwendbar", en: "applicable for the current selection" },
  "recommendation.proposalState.missing": { de: "noch kein passender Vorschlag gespeichert", en: "no matching proposal stored yet" },
  "recommendation.nextStep.ready": { de: "Nächster Schritt ist freigegeben: {value}", en: "Next step is available: {value}" },
  "recommendation.nextStep.blocked": { de: "Nächster Schritt ist noch nicht freigegeben.", en: "The next step is not available yet." },
  "recommendation.lastTrigger": { de: "Letzter Trigger: {value}", en: "Last trigger: {value}" },
  "recommendation.lastTrigger.none": { de: "noch keiner", en: "none yet" },
  "recommendation.lastTriggerAt": { de: "Letzter Trigger-Zeitpunkt: {value}", en: "Last trigger time: {value}" },
  "recommendation.lastUnlocked": { de: "Zuletzt freigeschaltete Buttons: {value}", en: "Most recently unlocked buttons: {value}" },
  "recommendation.lastUnlocked.none": { de: "keine", en: "none" },
  "recommendation.lastCompleted": { de: "Zuletzt erledigte Buttons: {value}", en: "Most recently completed buttons: {value}" },
  "recommendation.lastCompleted.none": { de: "keine", en: "none" },
  "recommendation.lastDirectiveAt": { de: "Letzte Button-Aktion: {value}", en: "Last button action: {value}" },
  "recommendation.lastFlowAnchor": { de: "Letzter Flow-Anchor: {value}", en: "Last flow anchor: {value}" },

  "exercise.action.help.noPack": {
    de: "Kein Exercise Pack aktiv. Bitte im Admin-Modus zuerst ein Exercise Pack auswählen.",
    en: "No exercise pack is active. In admin mode, select an exercise pack first."
  },
  "exercise.action.help.noStep": {
    de: "Kein aktiver Schritt gesetzt. Bitte im Admin-Modus einen gültigen Schritt auswählen.",
    en: "No active step is set. In admin mode, select a valid step first."
  },
  "exercise.action.help.nextStep": {
    de: "Die Übungsaktionen arbeiten auf den aktuell selektierten Canvas-Instanzen. Ohne Selektion erscheint ein Warnhinweis im Log. Der nächste gültige Schritt wäre: {step}.",
    en: "Exercise actions work on the currently selected canvas instances. Without a selection, a warning is shown in the log. The next valid step would be: {step}."
  },
  "exercise.action.help.noTransition": {
    de: "Die Übungsaktionen arbeiten auf den aktuell selektierten Canvas-Instanzen. Ohne Selektion erscheint ein Warnhinweis im Log. Für den aktuellen Schritt ist kein weiterer Transition-Pfad freigegeben.",
    en: "Exercise actions work on the currently selected canvas instances. Without a selection, a warning is shown in the log. No further transition path is enabled for the current step."
  },

  "flow.status.boardFlows": { de: "Board Flows: {count}", en: "Board flows: {count}" },
  "flow.status.packTemplate": { de: "Pack Template: {value}", en: "Pack template: {value}" },
  "flow.status.none": { de: "keins", en: "none" },
  "flow.status.stepTemplate": { de: "Step Template: {value}", en: "Step template: {value}" },
  "flow.status.runProfile": { de: "Run Profile: {value}", en: "Run profile: {value}" },
  "flow.status.selectedCanvas": { de: "Selektierte Canvas: {value}", en: "Selected canvases: {value}" },
  "flow.status.selectedCanvas.none": { de: "keine", en: "none" },
  "flow.status.scope": { de: "Scope-Vorgabe: {value}", en: "Scope preset: {value}" },
  "flow.status.profileEffect": { de: "Profilwirkung: {value}", en: "Profile effect: {value}" },
  "flow.status.adminHint": { de: "Admin-Hinweis: {value}", en: "Admin hint: {value}" },

  "mode.generic": { de: "generic", en: "generic" },
  "mode.exercise": { de: "exercise", en: "exercise" },

  "busyIndicator.title": { de: "AI arbeitet …", en: "AI is working …" },
  "busyIndicator.defaultSource": { de: "Agent", en: "Agent" },

  "chat.inputPlaceholder": { de: "Frage hier eingeben …", en: "Enter question here …" },
  "chat.outputPlaceholder": { de: "Agentenantwort erscheint hier.", en: "The agent’s answer appears here." },
  "chat.submit": { de: "Submit", en: "Submit" },
  "chat.apply": { de: "Vorschläge anwenden", en: "Apply suggestions" },
  "chat.apply.disabled": { de: "Kein Vorschlag gespeichert", en: "No saved proposal yet" },
  "chat.apply.ready": { de: "Gespeicherten Vorschlag jetzt auf das Board anwenden", en: "Apply the saved proposal to the board now" },
  "chat.apply.noPending": { de: "Für diesen Schritt liegt aktuell kein offener Vorschlag vor.", en: "There is currently no pending proposal for this step." },

  "feedback.heading.evaluation": { de: "Bewertung", en: "Evaluation" },
  "feedback.heading.rubric": { de: "Rubrik", en: "Rubric" },
  "feedback.heading.flowActions": { de: "Button-Aktionen", en: "Button actions" },
  "feedback.noAgentResponse": { de: "Keine Agentenantwort verfügbar.", en: "No agent response available." },
  "feedback.noAnswer": { de: "Keine Antwort verfügbar.", en: "No answer available." },
  "feedback.flowAction.unlock": { de: "Button freischalten: {endpointId}", en: "Unlock button: {endpointId}" },
  "feedback.flowAction.complete": { de: "Button erledigt markieren: {endpointId}", en: "Mark button as done: {endpointId}" },

  "runtime.initial.loaded": { de: "Panel-JS geladen: {time}", en: "Panel JS loaded: {time}" },
  "runtime.initial.waitForMiro": { de: "Warte auf Miro SDK (Board.ensureMiroReady) ...", en: "Waiting for Miro SDK (Board.ensureMiroReady) ..." },
  "runtime.genericUserQuestion": {
    de: "Bitte analysiere die relevanten Canvas-Instanzen und führe sinnvolle nächste Schritte innerhalb des Workshop-Workflows aus.",
    en: "Please analyze the relevant canvas instances and carry out sensible next steps within the workshop workflow."
  },

  "trigger.scope.selection": { de: "Selection", en: "Selection" },
  "trigger.scope.global": { de: "Global", en: "Global" },
  "trigger.intent.check": { de: "Check", en: "Check" },
  "trigger.intent.hint": { de: "Hint", en: "Hint" },
  "trigger.intent.autocorrect": { de: "Autocorrect", en: "Autocorrect" },
  "trigger.intent.review": { de: "Review", en: "Review" },
  "trigger.intent.synthesize": { de: "Synthesize", en: "Synthesize" },
  "trigger.intent.coach": { de: "Coach", en: "Coach" },
  "trigger.intent.grade": { de: "Grade", en: "Grade" },
  "trigger.intent.propose": { de: "Vorschlag", en: "Proposal" },
  "trigger.intent.apply": { de: "Anwenden", en: "Apply" },

  "sourceLabel.exerciseAgent": { de: "Exercise-Agent", en: "Exercise agent" },
  "sourceLabel.globalAgent": { de: "Global Agent", en: "Global agent" },
  "sourceLabel.question": { de: "Frage", en: "Question" },

  "question.source.canvas": { de: "Canvas-Frage", en: "Canvas question" },
  "question.emptyInput": { de: "{sourceLabel}: Die Eingabebox ist leer.", en: "{sourceLabel}: The input box is empty." },
  "question.instanceMissing": { de: "{sourceLabel}: Zielinstanz konnte nicht gefunden werden.", en: "{sourceLabel}: The target instance could not be found." },
  "question.chatIncomplete": { de: "{sourceLabel}: Chat-Interface der Instanz ist unvollständig.", en: "{sourceLabel}: The instance chat interface is incomplete." },
  "question.missingApiKey": { de: "{sourceLabel}: Kein OpenAI API Key vorhanden.", en: "{sourceLabel}: No OpenAI API key available." },
  "question.agentRunLocked": { de: "{sourceLabel}: Ein Agent-Run läuft bereits.", en: "{sourceLabel}: An agent run is already in progress." },
  "question.contextUnavailable": { de: "{sourceLabel}: Konnte keinen Instanzkontext für den Frage-Call aufbauen.", en: "{sourceLabel}: Could not build an instance context for the question call." },
  "question.modelRefusal": { de: "{sourceLabel}: Modell verweigert die Antwort: {reason}", en: "{sourceLabel}: The model refused to answer: {reason}" },
  "question.invalidJson": { de: "{sourceLabel}: Antwort ist kein valides strukturiertes JSON.", en: "{sourceLabel}: The answer is not valid structured JSON." },
  "question.outputWritten": { de: "{sourceLabel}: Antwort in die Ausgabebox von {instanceLabel} geschrieben.", en: "{sourceLabel}: Wrote the answer into the output box of {instanceLabel}." },
  "question.completed": { de: "{sourceLabel}: abgeschlossen.", en: "{sourceLabel}: completed." },
  "question.failed": { de: "{sourceLabel}: fehlgeschlagen.", en: "{sourceLabel}: failed." },
  "question.exception": { de: "Exception beim {sourceLabel}-Call: {message}", en: "Exception during the {sourceLabel} call: {message}" },
  "question.outputBoxMissing": { de: "WARNUNG: Keine vollständige Ausgabebox für Instanz {instanceLabel}. {sourceLabel}-Antwort wird nicht auf dem Board gerendert.", en: "WARNING: No complete output box for instance {instanceLabel}. The {sourceLabel} response is not rendered on the board." },
});

export const METHOD_I18N_OVERRIDES = Object.freeze({
  exercisePacks: Object.freeze({
    "persona-basics-v1": Object.freeze({
      description: { en: "Guided persona exercise on the Datentreiber 3-Boxes canvas." }
    }),
    "analytics-ai-usecase-fit-sprint-v1": Object.freeze({
      description: { en: "Guided single-canvas exercise on the Analytics & AI Use Case canvas with four didactic phases: Preparation & Focus, User Needs Analysis, Solution Design, and Fit Validation & Minimum Desired Product." }
    })
  }),

  steps: Object.freeze({
    "persona-basics-v1": Object.freeze({
      "collect_personas": Object.freeze({
        label: { en: "Create personas" },
        visibleInstruction: { en: "Create one readable chain per persona: name (left), activity (middle), and expectation (right)." }
      }),
      "refine_personas": Object.freeze({
        label: { en: "Refine personas" },
        visibleInstruction: { en: "Sharpen activities and expectations. Vague wording should become more concrete." }
      })
    }),
    "analytics-ai-usecase-fit-sprint-v1": Object.freeze({
      "step0_preparation_and_focus": Object.freeze({
        label: { en: "Preparation & Focus" },
        visibleInstruction: { en: "Start with focus and scope: name the use case in the header, note critical assumptions or open questions in white, and consciously park side topics in Sorted out." },
        flowInstruction: { en: "Start with focus and scope: define the concrete use case in the header, collect critical assumptions or open questions as white stickies, and consciously park side topics instead of jumping straight into users or solutions." },
        flowSummary: { en: "Preparation phase before the real analysis: set the focus in the header, sharpen the scope, make open assumptions visible, and consciously park side topics." }
      }),
      "step1_user_perspective": Object.freeze({
        label: { en: "User Needs Analysis" },
        visibleInstruction: { en: "Now build the user perspective: collect several plausible user roles, focus on one main user, make the situation concrete, structure Objectives & Results, structure Decisions & Actions, and attach Gains/Pains." },
        flowInstruction: { en: "Build the problem space now: diverge and focus user roles, sharpen the situation, structure Objectives & Results as a small driver tree, sketch Decisions & Actions as a small workflow, and attach and prioritise Gains/Pains from the user perspective." },
        flowSummary: { en: "Step 1 is divergence and convergence in the problem space: do not solve too early, but make user work, goals, results, decisions, actions, and critical gains/pains robust first." }
      }),
      "step2_solution_perspective": Object.freeze({
        label: { en: "Solution Design" },
        visibleInstruction: { en: "Now derive the solution perspective: collect several solution variants, choose one main variant, park alternatives on the right, derive Information and Functions from it, and only then formulate Benefits." },
        flowInstruction: { en: "Develop the left-hand side from the problem space: collect and focus variants, derive Information and Functions from user work, and formulate concrete Benefits from them." },
        flowSummary: { en: "Step 2 is divergence, selection, concretisation, and benefit derivation – not free technology choice and not full networking." }
      }),
      "step3_fit_check_and_synthesis": Object.freeze({
        label: { en: "Fit Validation & Minimum Desired Product" },
        visibleInstruction: { en: "Validate the problem-solution fit now: test Benefits against the right-hand side, mark robust relations with checkmarks, thin out unvalidated content, and condense the core in the Check field." },
        flowInstruction: { en: "Check which Benefits really address Gains, Pains, Objectives, Results, Decisions, or Actions. Mark robust relations, reduce the board to a Minimum Desired Product, and only then condense the core in the Check field." },
        flowSummary: { en: "Step 3 validates, marks, reduces, and condenses. The goal is a Minimum Desired Product rather than the sum of all earlier ideas." }
      })
    })
  }),

  packTemplates: Object.freeze({
    "analytics-ai-usecase-fit-sprint-template-v1": Object.freeze({
      description: { en: "Guided exercise for the Analytics & AI Use Case canvas with a four-phase didactic sequence from preparation through user needs analysis and solution design to fit validation and Minimum Desired Product." }
    })
  }),

  stepTemplates: Object.freeze({
    "analytics-ai-usecase-fit-sprint-template-v1": Object.freeze({
      "step0_preparation_and_focus": Object.freeze({
        label: { en: "Preparation & Focus" },
        instruction: { en: "Start with focus and scope: define the concrete use case in the header, collect critical assumptions or open questions as white stickies, and consciously park side topics instead of jumping straight into users or solutions." },
        summary: { en: "Preparation phase before the real analysis: set the focus in the header, sharpen the scope, make open assumptions visible, and consciously park side topics." }
      }),
      "step1_user_perspective": Object.freeze({
        label: { en: "User Needs Analysis" },
        instruction: { en: "Build the problem space now: diverge and focus user roles, sharpen the situation, structure Objectives & Results as a small driver tree, sketch Decisions & Actions as a small workflow, and attach and prioritise Gains/Pains from the user perspective." },
        summary: { en: "Step 1 is divergence and convergence in the problem space: do not solve too early, but make user work, goals, results, decisions, actions, and critical gains/pains robust first." }
      }),
      "step2_solution_perspective": Object.freeze({
        label: { en: "Solution Design" },
        instruction: { en: "Develop the left-hand side from the problem space: collect and focus variants, derive Information and Functions from user work, and formulate concrete Benefits from them." },
        summary: { en: "Step 2 is divergence, selection, concretisation, and benefit derivation – not free technology choice and not full networking." }
      }),
      "step3_fit_check_and_synthesis": Object.freeze({
        label: { en: "Fit Validation & Minimum Desired Product" },
        instruction: { en: "Check which Benefits really address Gains, Pains, Objectives, Results, Decisions, or Actions. Mark robust relations, reduce the board to a Minimum Desired Product, and only then condense the core in the Check field." },
        summary: { en: "Step 3 validates, marks, reduces, and condenses. The goal is a Minimum Desired Product rather than the sum of all earlier ideas." }
      })
    })
  }),

  runProfiles: Object.freeze({
    "analytics.fit.step0.check": Object.freeze({
      label: { en: "Check focus" },
      summary: { en: "Checks whether focus and scope are clear enough to start the user needs analysis." },
      uiHint: { en: "Use this before moving from preparation into the user needs analysis." }
    }),
    "analytics.fit.step0.hint": Object.freeze({
      label: { en: "Give hint" },
      summary: { en: "Gives a short orientation on what should happen next in preparation and focus without creating board suggestions." },
      uiHint: { en: "Use this when a team needs a short textual hint, not concrete sticky-note suggestions." }
    }),
    "analytics.fit.step0.coach": Object.freeze({
      label: { en: "Coach focus" },
      summary: { en: "Coaches focus, scope, and open assumptions with guiding questions and one micro-step." },
      uiHint: { en: "Use this when participants need help narrowing the use case and surfacing assumptions." }
    }),
    "analytics.fit.step0.propose": Object.freeze({
      label: { en: "Start preparation" },
      summary: { en: "Generates a concrete, not-yet-applied starter proposal for focus, scope, and open assumptions in this step." },
      uiHint: { en: "Use this when the board should receive a visible preparation proposal that can be applied afterwards." }
    }),
    "analytics.fit.step0.apply": Object.freeze({
      label: { en: "Apply suggestions" },
      summary: { en: "Applies the latest stored focus/scope proposal to this canvas instance." },
      uiHint: { en: "Becomes useful once a proposal exists for the current step." }
    }),
    "analytics.fit.step1.check": Object.freeze({
      label: { en: "Check user needs analysis" },
      summary: { en: "Checks whether the user needs analysis is focused and strong enough to serve as the basis for solution design." },
      uiHint: { en: "Use this when the right-hand side already has substance and you want to know whether step 2 can start." }
    }),
    "analytics.fit.step1.hint": Object.freeze({
      label: { en: "Give hint" },
      summary: { en: "Gives a short textual hint for the next sensible move in the user needs analysis without creating board suggestions." },
      uiHint: { en: "Use this when the team only needs orientation, not a concrete proposal." }
    }),
    "analytics.fit.step1.coach": Object.freeze({
      label: { en: "Coach user needs analysis" },
      summary: { en: "Coaches the user needs analysis with guiding questions and one micro-step." },
      uiHint: { en: "Use this when participants should keep thinking for themselves instead of getting a ready-made answer." }
    }),
    "analytics.fit.step1.propose": Object.freeze({
      label: { en: "Start user needs analysis" },
      summary: { en: "Generates a concrete, not-yet-applied starter proposal for the user needs analysis in this step." },
      uiHint: { en: "Use this when the board should receive a visible user-analysis proposal that can be applied afterwards." }
    }),
    "analytics.fit.step1.apply": Object.freeze({
      label: { en: "Apply suggestions" },
      summary: { en: "Applies the latest stored user-analysis proposal to this canvas instance." },
      uiHint: { en: "Becomes useful once a proposal exists for the current step." }
    }),
    "analytics.fit.step2.check": Object.freeze({
      label: { en: "Check solution design" },
      summary: { en: "Checks whether the solution design is focused and cleanly derived from the user needs analysis." },
      uiHint: { en: "Use this when the left-hand side has substance and you want to know whether fit validation can begin." }
    }),
    "analytics.fit.step2.hint": Object.freeze({
      label: { en: "Give hint" },
      summary: { en: "Gives a short textual hint for the next sensible move on the solution side without creating board suggestions." },
      uiHint: { en: "Use this when the team only needs orientation, not a concrete proposal." }
    }),
    "analytics.fit.step2.coach": Object.freeze({
      label: { en: "Coach solution design" },
      summary: { en: "Coaches variant choice and the derivation of Information, Functions, and Benefits." },
      uiHint: { en: "Use this when participants should derive the left-hand side themselves instead of receiving a ready-made design." }
    }),
    "analytics.fit.step2.propose": Object.freeze({
      label: { en: "Start solution design" },
      summary: { en: "Generates a concrete, not-yet-applied starter proposal for solution design in this step." },
      uiHint: { en: "Use this when the board should receive a visible solution-design proposal that can be applied afterwards." }
    }),
    "analytics.fit.step2.apply": Object.freeze({
      label: { en: "Apply suggestions" },
      summary: { en: "Applies the latest stored solution-design proposal to this canvas instance." },
      uiHint: { en: "Becomes useful once a proposal exists for the current step." }
    }),
    "analytics.fit.step3.review": Object.freeze({
      label: { en: "Validate fit" },
      summary: { en: "Conducts a qualitative fit review and shows whether the canvas would already be handoff-ready or not." },
      uiHint: { en: "Use this before you reduce or condense the board further." }
    }),
    "analytics.fit.step3.autocorrect": Object.freeze({
      label: { en: "Prune to Minimum Desired Product" },
      summary: { en: "Marks validated content, parks alternatives, and reduces the board to the smallest still-viable solution core." },
      uiHint: { en: "Use this once the board has enough substance to validate and cut back to the robust core." }
    }),
    "analytics.fit.step3.synthesize": Object.freeze({
      label: { en: "Condense Check field" },
      summary: { en: "Condenses the validated fit core into short statements in the Check field." },
      uiHint: { en: "Use this only after validation and pruning, not as an early shortcut." }
    }),
    "analytics.fit.step3.coach": Object.freeze({
      label: { en: "Coach fit validation" },
      summary: { en: "Coaches fit validation with guiding questions instead of jumping straight to judgement or condensation." },
      uiHint: { en: "Useful when the team should validate relationships together before reducing or condensing." }
    }),
    "analytics.fit.step3.propose": Object.freeze({
      label: { en: "Generate validation / MDP suggestions" },
      summary: { en: "Generates concrete but not-yet-applied suggestions for validation, checkmarks, pruning, and the Minimum Desired Product." },
      uiHint: { en: "Use this when you want concrete board suggestions before applying anything." }
    }),
    "analytics.fit.step3.apply": Object.freeze({
      label: { en: "Apply suggestions" },
      summary: { en: "Applies the latest stored validation / MDP proposal to this canvas instance." },
      uiHint: { en: "Becomes useful once a proposal exists for the current step." }
    }),
    "analytics.fit.global.review": Object.freeze({
      label: { en: "Compare boards" },
      summary: { en: "Compares multiple boards for fit maturity, Minimum Desired Product focus, and recurring quality patterns." },
      uiHint: { en: "Useful for a meta-review across multiple canvas instances or teams." }
    })
  }),

  promptModules: Object.freeze({
    "analytics.fit.shared.method_guardrails": Object.freeze({
      label: { en: "Method guardrails" },
      summary: { en: "Keeps the agent aligned with use-case logic, canvas logic, and workshop logic." }
    }),
    "analytics.fit.shared.check_style": Object.freeze({
      label: { en: "Check style" },
      summary: { en: "Structured check mode with clear strengths, gaps, and next steps." }
    }),
    "analytics.fit.shared.hint_style": Object.freeze({
      label: { en: "Hint style" },
      summary: { en: "Short, helpful, and actionable hint style with concrete next steps." }
    }),
    "analytics.fit.shared.coach_style": Object.freeze({
      label: { en: "Coach style" },
      summary: { en: "Socratic, motivating coaching style with guiding questions and one micro-step." }
    }),
    "analytics.fit.shared.proposal_mode": Object.freeze({
      label: { en: "Proposal mode" },
      summary: { en: "Describes the intermediate mode: concrete suggestions first, application only after confirmation." }
    }),
    "analytics.fit.shared.review_style": Object.freeze({
      label: { en: "Review style" },
      summary: { en: "Qualitative review focused on consistency, maturity, and risk instead of mutation." }
    }),
    "analytics.fit.shared.synthesis_style": Object.freeze({
      label: { en: "Synthesis style" },
      summary: { en: "Condenses only when enough substance is already present; otherwise it names the missing prerequisites." }
    }),
    "analytics.fit.step1.focus_user_perspective": Object.freeze({
      label: { en: "Focus: user perspective first" },
      summary: { en: "Keeps the agent focused on the right-hand side and its internal logic." }
    }),
    "analytics.fit.step1.bootstrap_empty_user_perspective": Object.freeze({
      label: { en: "Bootstrap: empty user perspective" },
      summary: { en: "Helps with step 1 when it is empty or almost empty by suggesting a starting order and wording prompts." }
    }),
    "analytics.fit.step2.focus_solution_perspective": Object.freeze({
      label: { en: "Focus: solution perspective" },
      summary: { en: "Directs the agent to the left-hand side and its derivation from the user perspective." }
    }),
    "analytics.fit.step2.bootstrap_empty_solution_perspective": Object.freeze({
      label: { en: "Bootstrap: empty solution perspective" },
      summary: { en: "Helps with an empty left-hand side or an immature right-hand side by providing the right derivation guidance." }
    }),
    "analytics.fit.step3.focus_fit_review": Object.freeze({
      label: { en: "Focus: fit check review" },
      summary: { en: "Assesses problem-solution fit, consistency, and the robustness of the chain." }
    }),
    "analytics.fit.step3.bootstrap_incomplete_fit": Object.freeze({
      label: { en: "Precondition: immature fit check" },
      summary: { en: "Prevents premature fit assessments on incomplete canvases." }
    }),
    "analytics.fit.step3.focus_fit_synthesis": Object.freeze({
      label: { en: "Focus: fit check synthesis" },
      summary: { en: "Condenses fit into short statements for the Check field." }
    }),
    "analytics.fit.global.focus_cross_instance_review": Object.freeze({
      label: { en: "Focus: cross-instance review" },
      summary: { en: "Compares multiple instances for maturity, patterns, strengths, and recurring weaknesses." }
    })
  })
});
