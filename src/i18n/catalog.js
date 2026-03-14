const BASE_UI_STRINGS = Object.freeze({
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
    de: "Admin-Panel aktiv. Operative Läufe laufen über Board-Buttons und Chat-Endpoints.",
    en: "Admin panel active. Operational runs execute via board buttons and chat endpoints."
  },

  "user.text.label": { de: "Frage / Aufgabe für den Agenten", en: "Question / task for the agent" },
  "user.text.placeholder": {
    de: "Optionaler Zusatzauftrag für den aktuellen Endpoint-Lauf.",
    en: "Optional extra instruction for the current endpoint run."
  },

  "status.exerciseContext.loading": { de: "Flow-Kontext wird geladen ...", en: "Loading flow context ..." },
  "status.exerciseInstruction.empty": { de: "Noch keine sichtbare Schrittanweisung geladen.", en: "No visible step instruction loaded yet." },
  "status.recommendation.empty": { de: "Noch keine Endpoint-Freischaltungen gespeichert.", en: "No endpoint unlocks stored yet." },
  "status.selection.loading": { de: "Selektion wird geladen ...", en: "Loading selection ..." },

  "section.exerciseActions": { de: "Empfohlene Aktionen", en: "Recommended actions" },
  "section.exerciseActionsPrimary": { de: "Primäre Aktionen", en: "Primary actions" },
  "section.exerciseActionsProposal": { de: "Vorschläge", en: "Proposals" },

  "section.adminControl": { de: "Admin-Steuerung", en: "Admin controls" },
  "admin.apiKey.label": { de: "OpenAI API Key", en: "OpenAI API key" },
  "admin.model.label": { de: "Modell", en: "Model" },
  "admin.canvasType.label": { de: "Canvas-Typ auswählen", en: "Select canvas type" },
  "admin.canvasType.loading": { de: "Canvas-Typen werden geladen ...", en: "Loading canvas types ..." },
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

  "section.flowControls": { de: "Board Flow Controls", en: "Board flow controls" },
  "flow.authoring.help": {
    de: "Selektiere eine oder mehrere Canvas-Instanzen auf dem Board. Die erste Instanz dient als visuelle Ankerposition für den Shape-Button; der Scope kann trotzdem die aktuelle Selektion oder das Pack aller passenden Instanzen abdecken.",
    en: "Select one or more canvas instances on the board. The first instance is used as the visual anchor for the shape button; the scope can still cover the current selection or the pack of all matching instances."
  },
  "flow.exercisePack.label": { de: "Flow-Paket", en: "Flow pack" },
  "flow.step.label": { de: "Schritt", en: "Step" },
  "flow.endpoint.label": { de: "Endpoint", en: "Endpoint" },
  "flow.scope.label": { de: "Scope", en: "Scope" },
  "flow.scope.current": { de: "Selektierte / aktuelle Instanzen", en: "Selected / current instances" },
  "flow.scope.pack": { de: "Pack (alle passenden Instanzen)", en: "Pack (all matching instances)" },
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
    de: "Setzt den aktuellen Schritt des relevanten Flows auf den gewählten Schritt. Operativ zählen nur bereits materialisierte Board-Buttons dieses Flows.",
    en: "Sets the current step of the relevant flow to the selected step. Operationally, only already materialized board buttons of that flow count."
  },
  "flow.admin.controlHelp": {
    de: "Freischalten wirkt nur auf den selektierten Flow-Button. Erledigt markiert ihn als done. Zurücksetzen entfernt manuelle Freischaltungen oder Done-Markierungen und stellt den modellseitigen Zustand wieder her.",
    en: "Unlock only affects the selected flow button. Done marks it as done. Reset clears manual unlock or done markers and restores the model-driven state."
  },
  "flow.authoring.status.empty": { de: "Noch keine Flow-Information geladen.", en: "No flow information loaded yet." },
  "flow.noSteps": { de: "Keine Schritte verfügbar.", en: "No steps available." },
  "flow.noEndpoints": { de: "Keine Endpoints verfügbar.", en: "No endpoints available." },
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
  "canvas.notAllowedMeta": { de: "{canvasTypeId} · im aktuellen Flow-Paket nicht freigegeben", en: "{canvasTypeId} · not enabled in the current flow pack" },

  "selection.none": { de: "Keine Canvas selektiert.", en: "No canvas selected." },
  "selection.none.detail": { de: "Instanz-Agent erwartet mindestens eine selektierte Canvas-Instanz auf dem Board.", en: "The instance agent expects at least one selected canvas instance on the board." },
  "selection.unresolved": { de: "Aktuelle Selektion enthält keine auflösbare Canvas.", en: "The current selection does not contain a resolvable canvas." },
  "selection.unresolved.items": { de: "Selektierte Board-Items: {count}", en: "Selected board items: {count}" },
  "selection.unresolved.hint": { de: "Wähle mindestens eine Canvas oder ein Item innerhalb einer Canvas aus.", en: "Select at least one canvas or an item inside a canvas." },
  "selection.selectedCount": { de: "Selektierte Canvas: {count}", en: "Selected canvases: {count}" },
  "selection.instances": { de: "Instanzen: {labels}", en: "Instances: {labels}" },
  "selection.itemCount": { de: "Selektierte Board-Items: {count}", en: "Selected board items: {count}" },

  "exercise.context.boardMode": { de: "Board-Modus: {value}", en: "Board mode: {value}" },
  "exercise.context.pack": { de: "Flow-Paket: {value}", en: "Flow pack: {value}" },
  "exercise.context.pack.none": { de: "keins", en: "none" },
  "exercise.context.currentStep": { de: "Flow-Schritt: {value}", en: "Flow step: {value}" },
  "exercise.context.currentStep.none": { de: "kein Flow-Schritt aktiv", en: "no active flow step" },
  "exercise.context.canvasType": { de: "Standard-Canvas-Typ: {value}", en: "Default canvas type: {value}" },
  "exercise.instruction.none": {
    de: "Kein sichtbarer Flow-Schritt aktiv. Der Agent läuft ohne aktiven Flow-Kontext.",
    en: "No visible flow step is active. The agent runs without an active flow context."
  },

  "recommendation.primaryActions": { de: "Primäre Aktionen jetzt: {value}", en: "Primary actions now: {value}" },
  "recommendation.secondaryActions": { de: "Sekundäre Aktionen jetzt: {value}", en: "Secondary actions now: {value}" },
  "recommendation.proposalActions": { de: "Vorschlagsmodus: {value}", en: "Proposal lane: {value}" },
  "recommendation.proposalState.ready": { de: "für die aktuelle Selektion anwendbar", en: "applicable for the current selection" },
  "recommendation.proposalState.missing": { de: "noch kein passender Vorschlag gespeichert", en: "no matching proposal stored yet" },
  "recommendation.nextStep.ready": { de: "Nächster Schritt ist freigegeben: {value}", en: "Next step is available: {value}" },
  "recommendation.nextStep.blocked": { de: "Nächster Schritt ist noch nicht freigegeben.", en: "The next step is not available yet." },
  "recommendation.lastEndpoint.none": { de: "noch kein Endpoint", en: "no endpoint yet" },
  "recommendation.lastUnlocked": { de: "Zuletzt freigeschaltete Buttons: {value}", en: "Most recently unlocked buttons: {value}" },
  "recommendation.lastUnlocked.none": { de: "keine", en: "none" },
  "recommendation.lastCompleted": { de: "Zuletzt erledigte Buttons: {value}", en: "Most recently completed buttons: {value}" },
  "recommendation.lastCompleted.none": { de: "keine", en: "none" },
  "recommendation.lastFlowAnchor": { de: "Letzter Flow-Anchor: {value}", en: "Last flow anchor: {value}" },

  "flow.status.boardFlows": { de: "Board Flows: {count}", en: "Board flows: {count}" },
  "flow.status.exercisePack": { de: "Flow-Paket: {value}", en: "Flow pack: {value}" },
  "flow.status.none": { de: "keins", en: "none" },
  "flow.status.step": { de: "Schritt: {value}", en: "Step: {value}" },
  "flow.status.endpoint": { de: "Endpoint: {value}", en: "Endpoint: {value}" },
  "flow.status.selectedCanvas": { de: "Selektierte Canvas: {value}", en: "Selected canvases: {value}" },
  "flow.status.selectedCanvas.none": { de: "keine", en: "none" },
  "flow.status.scope": { de: "Scope-Vorgabe: {value}", en: "Scope preset: {value}" },
  "flow.status.endpointSummary": { de: "Endpoint-Zusammenfassung: {value}", en: "Endpoint summary: {value}" },
  "flow.status.adminHint": { de: "Admin-Hinweis: {value}", en: "Admin hint: {value}" },

  "mode.generic": { de: "generic", en: "generic" },
  "mode.exercise": { de: "exercise", en: "exercise" },

  "busyIndicator.title": { de: "AI arbeitet …", en: "AI is working …" },
  "busyIndicator.defaultSource": { de: "Agent", en: "Agent" },

  "chat.inputPlaceholder": { de: "Frage hier eingeben …", en: "Enter question here …" },
  "chat.outputPlaceholder": { de: "Agentenantwort erscheint hier.", en: "The agent’s answer appears here." },
  "chat.submit": { de: "Senden", en: "Send" },
  "chat.propose": { de: "Vorschlag ausarbeiten", en: "Draft proposal" },
  "chat.propose.disabled": { de: "Für diesen Schritt ist gerade kein Vorschlagsmodus verfügbar", en: "No proposal mode is currently available for this step" },
  "chat.propose.ready": { de: "Konkreten Vorschlag für den aktuellen Schritt ausarbeiten", en: "Draft a concrete proposal for the current step" },
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

});

export const UI_STRINGS = BASE_UI_STRINGS;

export const METHOD_I18N_OVERRIDES = Object.freeze({
  exercisePacks: Object.freeze({
    "analytics-ai-usecase-fit-sprint-v1": Object.freeze({
      description: { en: "Guided single-canvas exercise on the Analytics & AI Use Case canvas with four didactic phases: Preparation & Focus, User Needs Analysis, Solution Design, and Fit Validation & Minimum Desired Product." }
    })
  }),

  steps: Object.freeze({
    "analytics-ai-usecase-fit-sprint-v1": Object.freeze({
      "step0_preparation_and_focus": Object.freeze({
        label: { en: "Preparation & Focus" },
        visibleInstruction: { en: "Start with focus and scope: name the use case in the header, note critical assumptions or open questions in white, and consciously park side topics in Sorted out." },
        flowInstruction: { en: "Start with focus and scope: define the concrete use case in the header, collect critical assumptions or open questions as white stickies, and consciously park side topics instead of jumping straight into users or solutions." },
        summary: { en: "Preparation phase before the real analysis: set the focus in the header, sharpen the scope, make open assumptions visible, and consciously park side topics." }
      }),
      "step1_user_perspective": Object.freeze({
        label: { en: "User Needs Analysis" },
        visibleInstruction: { en: "Now build the user perspective: collect several plausible user roles, focus on one main user, make the situation concrete, structure Objectives & Results, structure Decisions & Actions, and attach Gains/Pains." },
        flowInstruction: { en: "Build the problem space now: diverge and focus user roles, sharpen the situation, structure Objectives & Results as a small driver tree, sketch Decisions & Actions as a small workflow, and attach and prioritise Gains/Pains from the user perspective." },
        summary: { en: "Step 1 is divergence and convergence in the problem space: do not solve too early, but make user work, goals, results, decisions, actions, and critical gains/pains robust first." }
      }),
      "step2_solution_perspective": Object.freeze({
        label: { en: "Solution Design" },
        visibleInstruction: { en: "Now derive the solution perspective: collect several solution variants, choose one main variant, park alternatives on the right, derive Information and Functions from it, and only then formulate Benefits." },
        flowInstruction: { en: "Develop the left-hand side from the problem space: collect and focus variants, derive Information and Functions from user work, and formulate concrete Benefits from them." },
        summary: { en: "Step 2 is divergence, selection, concretisation, and benefit derivation – not free technology choice and not full networking." }
      }),
      "step3_fit_check_and_synthesis": Object.freeze({
        label: { en: "Fit Validation & Minimum Desired Product" },
        visibleInstruction: { en: "Validate the problem-solution fit now: test Benefits against the right-hand side, mark robust relations with checkmarks, thin out unvalidated content, and condense the core in the Check field." },
        flowInstruction: { en: "Check which Benefits really address Gains, Pains, Objectives, Results, Decisions, or Actions. Mark robust relations, reduce the board to a Minimum Desired Product, and only then condense the core in the Check field." },
        summary: { en: "Step 3 validates, marks, reduces, and condenses. The goal is a Minimum Desired Product rather than the sum of all earlier ideas." }
      })
    })
  }),

  endpoints: Object.freeze({
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
  })
});
