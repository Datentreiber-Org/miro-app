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

  "user.text.label": { de: "Frage / Aufgabe für den Agenten", en: "Question / task for the agent" },
  "user.text.placeholder": {
    de: "Optionaler Zusatzauftrag für Check, Hint, Autocorrect oder generische Agentenläufe.",
    en: "Optional extra instruction for check, hint, autocorrect, or generic agent runs."
  },

  "status.exerciseContext.loading": { de: "Exercise-Kontext wird geladen ...", en: "Loading exercise context ..." },
  "status.exerciseInstruction.empty": { de: "Noch keine sichtbare Schrittanweisung geladen.", en: "No visible step instruction loaded yet." },
  "status.recommendation.empty": { de: "Noch keine Button-Freischaltungen gespeichert.", en: "No button activations stored yet." },
  "status.selection.loading": { de: "Selektion wird geladen ...", en: "Loading selection ..." },

  "section.exerciseActions": { de: "Übungsaktionen", en: "Exercise actions" },
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
  "flow.controlLabel.label": { de: "Button-Label", en: "Button label" },
  "flow.controlLabel.placeholder": { de: "z. B. Prüfen", en: "e.g. Check" },
  "flow.createControl": { de: "Control erzeugen", en: "Create control" },
  "flow.setCurrentStep": { de: "Schritt aktiv setzen", en: "Set current step" },
  "flow.authoring.status.empty": { de: "Noch keine Flow-Information geladen.", en: "No flow information loaded yet." },
  "flow.noStepTemplates": { de: "Keine Step Templates", en: "No step templates" },
  "flow.noRunProfiles": { de: "Keine Run Profiles", en: "No run profiles" },
  "flow.defaultControlLabel": { de: "Flow Control", en: "Flow control" },

  "button.insertTemplate": { de: "Canvas einfügen", en: "Insert canvas" },
  "button.agentSelection": { de: "Instanz-Agent (Selektion)", en: "Instance agent (selection)" },
  "button.clusterPanel": { de: "Auswahl clustern (Side-Panel)", en: "Cluster selection (side panel)" },
  "button.classifyDebug": { de: "Stickies klassifizieren (Debug)", en: "Classify stickies (debug)" },
  "button.openaiClassic": { de: "Klassischer OpenAI-Call", en: "Classic OpenAI call" },

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

  "feedback.heading.evaluation": { de: "Bewertung", en: "Evaluation" },
  "feedback.heading.rubric": { de: "Rubrik", en: "Rubric" },
  "feedback.heading.flowActions": { de: "Button-Aktionen", en: "Button actions" },
  "feedback.noAgentResponse": { de: "Keine Agentenantwort verfügbar.", en: "No agent response available." },
  "feedback.noAnswer": { de: "Keine Antwort verfügbar.", en: "No answer available." },
  "feedback.flowAction.unlock": { de: "Button freischalten: {runProfileId}", en: "Unlock button: {runProfileId}" },
  "feedback.flowAction.complete": { de: "Button erledigt markieren: {runProfileId}", en: "Mark button as done: {runProfileId}" },

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
      description: { en: "Guided mini exercise on the Analytics & AI Use Case canvas to build the user perspective, solution perspective, and problem-solution fit step by step." }
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
      "step1_user_perspective": Object.freeze({
        label: { en: "User Perspective First" },
        visibleInstruction: { en: "Start by filling in the user perspective: User & Situation, Objectives & Results, Decisions & Actions, User Gains, and User Pains." },
        flowInstruction: { en: "Work out the right-hand side first: start with User & Situation and Decisions & Actions, then add Objectives & Results as well as User Pains and User Gains." },
        flowSummary: { en: "Build a solid problem space and a clear user and decision situation first. Do not jump to solutions yet." }
      }),
      "step2_solution_perspective": Object.freeze({
        label: { en: "Solution Perspective" },
        visibleInstruction: { en: "Now derive the solution perspective from the user perspective: Solutions, Information, Functions, and Benefits." },
        flowInstruction: { en: "Now derive the left-hand side from the user perspective: What information would improve decisions or actions, which functions and solutions make that possible, and which benefits result from it?" },
        flowSummary: { en: "The solution perspective should clearly follow from the user perspective rather than being generic or technology-driven." }
      }),
      "step3_fit_check_and_synthesis": Object.freeze({
        label: { en: "Fit Check & Synthesis" },
        visibleInstruction: { en: "Condense the problem-solution fit in the Check field and test the consistency between the user and solution perspectives." },
        flowInstruction: { en: "Check whether the user perspective and the solution perspective fit together consistently. Only condense the problem-solution fit in the Check field once enough substance is available." },
        flowSummary: { en: "Assess consistency, maturity, and problem-solution fit, and only condense it when the groundwork is strong enough." }
      })
    })
  }),

  packTemplates: Object.freeze({
    "analytics-ai-usecase-fit-sprint-template-v1": Object.freeze({
      description: { en: "Guided exercise for the Analytics & AI Use Case canvas with a didactic sequence from user perspective through solution perspective to fit check." }
    })
  }),

  stepTemplates: Object.freeze({
    "analytics-ai-usecase-fit-sprint-template-v1": Object.freeze({
      "step1_user_perspective": Object.freeze({
        label: { en: "User Perspective First" },
        instruction: { en: "Work out the right-hand side first: start with User & Situation and Decisions & Actions, then add Objectives & Results as well as User Pains and User Gains." },
        summary: { en: "Build a solid problem space and a clear user and decision situation first. Do not jump to solutions yet." }
      }),
      "step2_solution_perspective": Object.freeze({
        label: { en: "Solution Perspective" },
        instruction: { en: "Now derive the left-hand side from the user perspective: What information would improve decisions or actions, which functions and solutions make that possible, and which benefits result from it?" },
        summary: { en: "The solution perspective should clearly follow from the user perspective rather than being generic or technology-driven." }
      }),
      "step3_fit_check_and_synthesis": Object.freeze({
        label: { en: "Fit Check & Synthesis" },
        instruction: { en: "Check whether the user perspective and the solution perspective fit together consistently. Only condense the problem-solution fit in the Check field once enough substance is available." },
        summary: { en: "Assess consistency, maturity, and problem-solution fit, and only condense it when the groundwork is strong enough." }
      })
    })
  }),

  runProfiles: Object.freeze({
    "analytics.fit.step1.check": Object.freeze({
      label: { en: "Check user perspective" },
      summary: { en: "Checks the right-hand side in a structured way for completeness, precision, and misplaced content, and helps with an empty canvas through sensible start guidance." },
      uiHint: { en: "Use this profile when you want to review the first version of the user perspective or kick-start an empty canvas with subject-matter guidance." }
    }),
    "analytics.fit.step1.hint": Object.freeze({
      label: { en: "Hint for user perspective" },
      summary: { en: "Provides concrete, usable hints for the right-hand side and offers a clear entry sequence when the canvas is empty." },
      uiHint: { en: "A good help button for participants when they need a small but concrete next step." }
    }),
    "analytics.fit.step1.coach": Object.freeze({
      label: { en: "Coach user perspective" },
      summary: { en: "Coaches the right-hand side with guiding questions, reflection prompts, and one clear micro-step." },
      uiHint: { en: "Use this profile when participants need thinking and conversation prompts rather than just an assessment." }
    }),
    "analytics.fit.step2.check": Object.freeze({
      label: { en: "Check solution perspective" },
      summary: { en: "Checks the left-hand side for derivation quality, user value, and clean distinctions between Information, Functions, Solutions, and Benefits." },
      uiHint: { en: "Useful when the left-hand side is already filled in or should now be derived more deliberately from the right-hand side." }
    }),
    "analytics.fit.step2.hint": Object.freeze({
      label: { en: "Hint for solution perspective" },
      summary: { en: "Provides precise derivation hints for the left-hand side and explains how to move from decisions to information, functions, and benefits when the area is empty." },
      uiHint: { en: "Well suited when the user perspective is already decent but the solution perspective has not yet been derived cleanly." }
    }),
    "analytics.fit.step2.coach": Object.freeze({
      label: { en: "Coach solution perspective" },
      summary: { en: "Coaches the derivation of the left-hand side with guiding questions instead of a finished solution sketch." },
      uiHint: { en: "Use this profile when participants should arrive at strong derivations themselves instead of receiving a direct solution." }
    }),
    "analytics.fit.step3.review": Object.freeze({
      label: { en: "Review fit check" },
      summary: { en: "Conducts a mature qualitative review of the problem-solution fit and explicitly treats incomplete boards as a preliminary stage rather than a finished assessment." },
      uiHint: { en: "Useful when both sides are at least partly developed and you want to know how robust the fit already is." }
    }),
    "analytics.fit.step3.synthesize": Object.freeze({
      label: { en: "Synthesize fit check" },
      summary: { en: "Condenses the content into the Check field only when enough substance exists; otherwise it names the missing prerequisites." },
      uiHint: { en: "Use this only once the problem and solution perspectives are mature enough for real fit statements." }
    }),
    "analytics.fit.step3.coach": Object.freeze({
      label: { en: "Coach fit check" },
      summary: { en: "Coaches the assessment of problem-solution fit with guiding questions and points out missing prerequisites for later synthesis." },
      uiHint: { en: "Useful when the fit should be reflected on together rather than judged harshly right away." }
    }),
    "analytics.fit.global.review": Object.freeze({
      label: { en: "Global review" },
      summary: { en: "Compares multiple instances for maturity, patterns, strengths, and recurring weaknesses in the broader picture." },
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
