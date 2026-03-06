import {
  DT_DEFAULT_APP_ADMIN_POLICY,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_DEFAULT_FEEDBACK_FRAME_NAME,
  DT_TRIGGER_KEYS
} from "../config.js?v=20260306-batch45";

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

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Array.isArray(value) ? value : Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}

function sortByLabel(items) {
  return items.slice().sort((a, b) => String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" }));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTransitions(transitions) {
  return (Array.isArray(transitions) ? transitions : [])
    .map((transition) => ({
      toStepId: asNonEmptyString(transition?.toStepId),
      policy: asNonEmptyString(transition?.policy) || "manual",
      allowedSources: normalizeUniqueStrings(transition?.allowedSources),
      allowedAfterTriggers: normalizeUniqueStrings(transition?.allowedAfterTriggers),
      requiredStepStatuses: normalizeUniqueStrings(transition?.requiredStepStatuses)
    }))
    .filter((transition) => !!transition.toStepId);
}

function buildExerciseStep(stepDef) {
  const triggerProfiles = (stepDef?.triggerProfiles && typeof stepDef.triggerProfiles === "object") ? stepDef.triggerProfiles : {};
  const allowedTriggers = {};
  for (const [triggerKey, profile] of Object.entries(triggerProfiles)) {
    const normalizedTriggerKey = normalizeTriggerKey(triggerKey) || normalizeTriggerKey(profile?.triggerKey);
    if (!normalizedTriggerKey) continue;
    allowedTriggers[normalizedTriggerKey] = Object.freeze({
      triggerKey: normalizedTriggerKey,
      scope: asNonEmptyString(profile?.scope),
      intent: asNonEmptyString(profile?.intent),
      requiresSelection: profile?.requiresSelection === true,
      mutationPolicy: asNonEmptyString(profile?.mutationPolicy),
      feedbackPolicy: asNonEmptyString(profile?.feedbackPolicy),
      prompt: asNonEmptyString(profile?.prompt)
    });
  }

  return Object.freeze({
    id: asNonEmptyString(stepDef?.id),
    order: Number.isFinite(Number(stepDef?.order)) ? Number(stepDef.order) : 0,
    label: asNonEmptyString(stepDef?.label) || asNonEmptyString(stepDef?.id),
    visibleInstruction: asNonEmptyString(stepDef?.visibleInstruction),
    allowedActions: normalizeUniqueStrings(stepDef?.allowedActions),
    defaultEnterTrigger: normalizeTriggerKey(stepDef?.defaultEnterTrigger),
    allowedTriggers: Object.freeze(allowedTriggers),
    transitions: Object.freeze(normalizeTransitions(stepDef?.transitions))
  });
}

function buildExercisePackProjection(packDef) {
  const steps = {};
  for (const [stepId, stepDef] of Object.entries((packDef?.steps && typeof packDef.steps === "object") ? packDef.steps : {})) {
    const step = buildExerciseStep({ id: stepId, ...stepDef });
    if (!step.id) continue;
    steps[step.id] = step;
  }

  return Object.freeze({
    id: asNonEmptyString(packDef?.exercisePackId),
    label: asNonEmptyString(packDef?.label),
    version: Number.isFinite(Number(packDef?.version)) ? Number(packDef.version) : 1,
    description: asNonEmptyString(packDef?.description),
    boardMode: asNonEmptyString(packDef?.boardMode) || "exercise",
    packTemplateId: asNonEmptyString(packDef?.packTemplateId),
    allowedCanvasTypes: normalizeUniqueStrings(packDef?.allowedCanvasTypeIds),
    defaultCanvasTypeId: asNonEmptyString(packDef?.defaultCanvasTypeId),
    defaultStepId: asNonEmptyString(packDef?.defaultStepId),
    defaults: Object.freeze({
      feedbackFrameName: asNonEmptyString(packDef?.defaults?.feedbackFrameName) || DT_DEFAULT_FEEDBACK_FRAME_NAME,
      feedbackChannel: asNonEmptyString(packDef?.defaults?.feedbackChannel) || DT_DEFAULT_FEEDBACK_CHANNEL,
      userMayChangePack: packDef?.defaults?.userMayChangePack === true,
      userMayChangeStep: packDef?.defaults?.userMayChangeStep === true,
      appAdminPolicy: asNonEmptyString(packDef?.defaults?.appAdminPolicy) || DT_DEFAULT_APP_ADMIN_POLICY
    }),
    globalPrompt: asNonEmptyString(packDef?.exerciseGlobalPrompt),
    steps: Object.freeze(steps)
  });
}

function buildPromptModuleProjection(moduleDef) {
  return Object.freeze({
    id: asNonEmptyString(moduleDef?.id),
    label: asNonEmptyString(moduleDef?.label),
    summary: asNonEmptyString(moduleDef?.summary),
    prompt: asNonEmptyString(moduleDef?.prompt) || ""
  });
}

function buildFlowControlProjection(packDef, stepDef, triggerProfile) {
  const flowControl = (triggerProfile?.flowControl && typeof triggerProfile.flowControl === "object") ? triggerProfile.flowControl : null;
  if (!flowControl?.id) return null;

  return Object.freeze({
    id: asNonEmptyString(flowControl.id),
    label: asNonEmptyString(flowControl.label) || asNonEmptyString(flowControl.id),
    summary: asNonEmptyString(flowControl.summary),
    packTemplateId: asNonEmptyString(packDef?.packTemplateId),
    stepTemplateId: asNonEmptyString(stepDef?.id),
    triggerKey: normalizeTriggerKey(triggerProfile?.triggerKey),
    moduleIds: normalizeUniqueStrings(flowControl.moduleIds),
    mutationPolicy: asNonEmptyString(flowControl.mutationPolicy) || asNonEmptyString(triggerProfile?.mutationPolicy),
    feedbackPolicy: asNonEmptyString(flowControl.feedbackPolicy) || asNonEmptyString(triggerProfile?.feedbackPolicy),
    defaultScopeType: asNonEmptyString(flowControl.defaultScopeType) || "fixed_instances",
    allowedActions: normalizeUniqueStrings(flowControl.allowedActions),
    uiHint: asNonEmptyString(flowControl.uiHint),
    sortOrder: Number.isFinite(Number(flowControl.sortOrder)) ? Number(flowControl.sortOrder) : Number.MAX_SAFE_INTEGER
  });
}

function buildPackTemplateProjection(packDef, runProfilesForPack) {
  if (!asNonEmptyString(packDef?.packTemplateId)) return null;

  const stepTemplates = {};
  for (const [stepId, rawStepDef] of Object.entries((packDef?.steps && typeof packDef.steps === "object") ? packDef.steps : {})) {
    const stepDef = rawStepDef && typeof rawStepDef === "object" ? rawStepDef : {};
    const id = asNonEmptyString(stepId) || asNonEmptyString(stepDef?.id);
    if (!id) continue;
    stepTemplates[id] = Object.freeze({
      id,
      order: Number.isFinite(Number(stepDef?.order)) ? Number(stepDef.order) : 0,
      label: asNonEmptyString(stepDef?.label) || id,
      instruction: asNonEmptyString(stepDef?.flowInstruction) || asNonEmptyString(stepDef?.visibleInstruction),
      summary: asNonEmptyString(stepDef?.flowSummary)
    });
  }

  const orderedRunProfiles = runProfilesForPack
    .slice()
    .sort((a, b) => Number(a?.sortOrder ?? Number.MAX_SAFE_INTEGER) - Number(b?.sortOrder ?? Number.MAX_SAFE_INTEGER) || String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" }));

  return Object.freeze({
    id: asNonEmptyString(packDef?.packTemplateId),
    label: asNonEmptyString(packDef?.label),
    description: asNonEmptyString(packDef?.packTemplateDescription) || asNonEmptyString(packDef?.description),
    allowedCanvasTypeIds: normalizeUniqueStrings(packDef?.allowedCanvasTypeIds),
    globalPrompt: asNonEmptyString(packDef?.packTemplateGlobalPrompt),
    stepTemplates: Object.freeze(stepTemplates),
    runProfileIds: Object.freeze(orderedRunProfiles.map((profile) => profile.id))
  });
}

const RAW_METHOD_CATALOG = deepFreeze({
  "version": 1,
  "packs": {
    "persona-basics-v1": {
      "exercisePackId": "persona-basics-v1",
      "packTemplateId": null,
      "label": "Persona Basics",
      "version": 2,
      "description": "Geführte Persona-Übung auf dem Datentreiber-3-Boxes-Canvas.",
      "packTemplateDescription": null,
      "boardMode": "exercise",
      "allowedCanvasTypeIds": [
        "datentreiber-3boxes"
      ],
      "defaultCanvasTypeId": "datentreiber-3boxes",
      "defaultStepId": "collect_personas",
      "defaults": {
        "feedbackFrameName": "AI Coach Output",
        "feedbackChannel": "text",
        "userMayChangePack": false,
        "userMayChangeStep": false,
        "appAdminPolicy": "ui_toggle"
      },
      "exerciseGlobalPrompt": "Auf diesem Board läuft die Übung \"Persona Basics\".\n\nÜbergeordnetes Ziel:\n- Arbeite persona-orientiert.\n- Jede Persona soll als zusammenhängende Einheit lesbar bleiben.\n- Das Board soll methodisch sauber bleiben: Inhalte präzisieren, unklare Einträge konkretisieren, Lücken sichtbar machen und offensichtliche Fehlzuordnungen korrigieren.\n- Nutze Connectoren, wenn Inhalte innerhalb einer Persona logisch zusammengehören. Vermeide Verbindungen zwischen verschiedenen Personas, außer die Aufgabe verlangt es ausdrücklich.\n\nLeitregel:\n- Behandle die sichtbaren Canvas als methodische Arbeitsflächen, nicht als freie Notizzettel.\n- Prüfe stets, ob die Inhalte dem aktuellen Schritt und der Übungslogik entsprechen.\n- Nutze den aktuellen Übungsschritt aus exerciseContext verbindlich.",
      "packTemplateGlobalPrompt": null,
      "promptModules": {},
      "steps": {
        "collect_personas": {
          "id": "collect_personas",
          "order": 10,
          "label": "Personas anlegen",
          "visibleInstruction": "Lege pro Persona eine lesbare Kette aus Name (links), Tätigkeit (Mitte) und Erwartung (rechts) an.",
          "flowInstruction": null,
          "flowSummary": null,
          "allowedActions": [
            "create_sticky",
            "move_sticky",
            "delete_sticky",
            "create_connector"
          ],
          "defaultEnterTrigger": null,
          "transitions": [
            {
              "toStepId": "refine_personas",
              "policy": "manual",
              "allowedSources": [
                "user",
                "admin",
                "agent_recommendation"
              ],
              "allowedAfterTriggers": [],
              "requiredStepStatuses": []
            }
          ],
          "triggerProfiles": {
            "selection.check": {
              "triggerKey": "selection.check",
              "scope": "selection",
              "intent": "check",
              "requiresSelection": true,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Prüfmodus für den Schritt \"Personas anlegen\":\n- Bewerte, ob pro Persona eine vollständige Dreierstruktur vorhanden ist.\n- Markiere fehlende oder unscharfe Elemente als offene Punkte im memoryEntry.\n- Nimm nur dann Board-Mutationen vor, wenn sie zur Korrektur ausdrücklich erwünscht oder offensichtlich nötig sind.",
              "flowControl": null
            },
            "selection.hint": {
              "triggerKey": "selection.hint",
              "scope": "selection",
              "intent": "hint",
              "requiresSelection": true,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Hinweismodus für den Schritt \"Personas anlegen\":\n- Gib möglichst wenig invasive Unterstützung.\n- Bevorzuge analysis, feedback und memoryEntry.\n- Setze nur dann Board-Aktionen ein, wenn ein konkreter, kleiner Hilfsschritt sinnvoll ist.",
              "flowControl": null
            },
            "selection.autocorrect": {
              "triggerKey": "selection.autocorrect",
              "scope": "selection",
              "intent": "autocorrect",
              "requiresSelection": true,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Autokorrekturmodus für den Schritt \"Personas anlegen\":\n- Fehlende oder falsch platzierte Persona-Elemente dürfen aktiv korrigiert werden.\n- Stelle eine saubere Persona-Kettenstruktur auf dem Board her.",
              "flowControl": null
            },
            "selection.review": {
              "triggerKey": "selection.review",
              "scope": "selection",
              "intent": "review",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Reviewmodus für den Schritt \"Personas anlegen\":\n- Beurteile die Qualität und Lesbarkeit der Persona-Strukturen.\n- Gib klares feedback zu Vollständigkeit, Verständlichkeit und methodischer Sauberkeit.\n- Nimm standardmäßig keine Board-Mutationen vor.",
              "flowControl": null
            },
            "selection.synthesize": {
              "triggerKey": "selection.synthesize",
              "scope": "selection",
              "intent": "synthesize",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Synthesemodus für den Schritt \"Personas anlegen\":\n- Verdichte, was die selektierten Personas gemeinsam zeigen.\n- Hebe Muster, Unterschiede und übergreifende Einsichten hervor.\n- Nimm standardmäßig keine Board-Mutationen vor.",
              "flowControl": null
            },
            "selection.coach": {
              "triggerKey": "selection.coach",
              "scope": "selection",
              "intent": "coach",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Coachmodus für den Schritt \"Personas anlegen\":\n- Erkläre didaktisch, worauf das Team als Nächstes achten sollte.\n- Formuliere konkrete nächste Schritte für die Arbeit an den selektierten Canvas.\n- Nimm standardmäßig keine Board-Mutationen vor.",
              "flowControl": null
            },
            "selection.grade": {
              "triggerKey": "selection.grade",
              "scope": "selection",
              "intent": "grade",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Bewertungsmodus für den Schritt \"Personas anlegen\":\n- Bewerte die selektierten Canvas gegen die Kriterien Vollständigkeit, korrekte Zuordnung und Lesbarkeit.\n- Liefere zusätzlich eine evaluation mit Rubrik.\n- Nimm standardmäßig keine Board-Mutationen vor.",
              "flowControl": null
            },
            "global.check": {
              "triggerKey": "global.check",
              "scope": "global",
              "intent": "check",
              "requiresSelection": false,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Globaler Prüfmodus für den Schritt \"Personas anlegen\":\n- Prüfe über alle relevanten Canvas hinweg, ob konsistente Persona-Strukturen vorhanden sind.\n- Markiere globale Lücken oder Inkonsistenzen.\n- Nimm nur dann Mutationen vor, wenn sie eindeutig sinnvoll sind.",
              "flowControl": null
            },
            "global.hint": {
              "triggerKey": "global.hint",
              "scope": "global",
              "intent": "hint",
              "requiresSelection": false,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Globaler Hinweismodus für den Schritt \"Personas anlegen\":\n- Gib globale Hinweise über alle relevanten Canvas hinweg.\n- Bevorzuge feedback und memoryEntry; handle Board-Mutationen sehr sparsam.",
              "flowControl": null
            },
            "global.autocorrect": {
              "triggerKey": "global.autocorrect",
              "scope": "global",
              "intent": "autocorrect",
              "requiresSelection": false,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Globaler Autokorrekturmodus für den Schritt \"Personas anlegen\":\n- Korrigiere selektionsunabhängig über alle relevanten Canvas hinweg.\n- Halte jede Persona als getrennte Einheit lesbar.",
              "flowControl": null
            },
            "global.review": {
              "triggerKey": "global.review",
              "scope": "global",
              "intent": "review",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Reviewmodus für den Schritt \"Personas anlegen\":\n- Führe einen qualitativen Board-Review über alle relevanten Canvas durch.\n- Fokus: Konsistenz, Lesbarkeit, fehlende Persona-Bestandteile.",
              "flowControl": null
            },
            "global.synthesize": {
              "triggerKey": "global.synthesize",
              "scope": "global",
              "intent": "synthesize",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Synthesemodus für den Schritt \"Personas anlegen\":\n- Fasse die übergreifenden Muster der Personas über alle relevanten Canvas zusammen.\n- Keine Standard-Mutationen; Fokus auf Verdichtung und Erkenntnisse.",
              "flowControl": null
            },
            "global.coach": {
              "triggerKey": "global.coach",
              "scope": "global",
              "intent": "coach",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Coachmodus für den Schritt \"Personas anlegen\":\n- Gib dem Team eine klare Anleitung, wie es übergreifend weiterarbeiten soll.\n- Fokus auf nächste methodische Schritte, nicht auf Bewertung.",
              "flowControl": null
            },
            "global.grade": {
              "triggerKey": "global.grade",
              "scope": "global",
              "intent": "grade",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Bewertungsmodus für den Schritt \"Personas anlegen\":\n- Bewerte die Gesamtqualität des bisherigen Boards für diesen Schritt.\n- Liefere zusätzlich eine evaluation mit Rubrik.",
              "flowControl": null
            }
          }
        },
        "refine_personas": {
          "id": "refine_personas",
          "order": 20,
          "label": "Personas schärfen",
          "visibleInstruction": "Präzisiere Tätigkeiten und Erwartungshaltungen. Vage Formulierungen sollen konkreter werden.",
          "flowInstruction": null,
          "flowSummary": null,
          "allowedActions": [
            "create_sticky",
            "move_sticky",
            "delete_sticky",
            "create_connector"
          ],
          "defaultEnterTrigger": null,
          "transitions": [],
          "triggerProfiles": {
            "selection.check": {
              "triggerKey": "selection.check",
              "scope": "selection",
              "intent": "check",
              "requiresSelection": true,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Prüfmodus für den Schritt \"Personas schärfen\":\n- Beurteile, ob Tätigkeiten und Erwartungen bereits konkret genug sind.\n- Erfasse offene Punkte im memoryEntry.\n- Mutationen nur, wenn sie zur Korrektur sinnvoll und vertretbar sind.",
              "flowControl": null
            },
            "selection.hint": {
              "triggerKey": "selection.hint",
              "scope": "selection",
              "intent": "hint",
              "requiresSelection": true,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Hinweismodus für den Schritt \"Personas schärfen\":\n- Gib prägnante Verbesserungshinweise.\n- Nutze Board-Mutationen sparsam.",
              "flowControl": null
            },
            "selection.autocorrect": {
              "triggerKey": "selection.autocorrect",
              "scope": "selection",
              "intent": "autocorrect",
              "requiresSelection": true,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Autokorrekturmodus für den Schritt \"Personas schärfen\":\n- Unklare Tätigkeiten oder Erwartungen dürfen konkretisiert, verschoben oder ergänzt werden.\n- Halte die Persona-Struktur stabil.",
              "flowControl": null
            },
            "selection.review": {
              "triggerKey": "selection.review",
              "scope": "selection",
              "intent": "review",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Reviewmodus für den Schritt \"Personas schärfen\":\n- Beurteile die Präzision und Trennschärfe der Persona-Inhalte.\n- Gib klares feedback zu Qualität und Reifegrad.\n- Nimm standardmäßig keine Board-Mutationen vor.",
              "flowControl": null
            },
            "selection.synthesize": {
              "triggerKey": "selection.synthesize",
              "scope": "selection",
              "intent": "synthesize",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Synthesemodus für den Schritt \"Personas schärfen\":\n- Verdichte, welche Persona-Muster und Unterschiede inzwischen sichtbar sind.\n- Fokus auf Einsichten, nicht auf Mutationen.",
              "flowControl": null
            },
            "selection.coach": {
              "triggerKey": "selection.coach",
              "scope": "selection",
              "intent": "coach",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Coachmodus für den Schritt \"Personas schärfen\":\n- Erkläre, wie die Präzisierung der Inhalte sinnvoll weitergeführt werden sollte.\n- Formuliere klare nächste Arbeitsimpulse.",
              "flowControl": null
            },
            "selection.grade": {
              "triggerKey": "selection.grade",
              "scope": "selection",
              "intent": "grade",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Bewertungsmodus für den Schritt \"Personas schärfen\":\n- Bewerte die selektierten Canvas gegen die Kriterien Präzision, methodische Passung und Lesbarkeit.\n- Liefere zusätzlich eine evaluation mit Rubrik.",
              "flowControl": null
            },
            "global.check": {
              "triggerKey": "global.check",
              "scope": "global",
              "intent": "check",
              "requiresSelection": false,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Globaler Prüfmodus für den Schritt \"Personas schärfen\":\n- Prüfe über alle relevanten Canvas hinweg, ob Tätigkeiten und Erwartungen konsistent präzisiert wurden.\n- Markiere globale Lücken und Unschärfen.",
              "flowControl": null
            },
            "global.hint": {
              "triggerKey": "global.hint",
              "scope": "global",
              "intent": "hint",
              "requiresSelection": false,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Globaler Hinweismodus für den Schritt \"Personas schärfen\":\n- Gib globale Hinweise zu Unschärfen, Redundanzen und fehlender Präzision.",
              "flowControl": null
            },
            "global.autocorrect": {
              "triggerKey": "global.autocorrect",
              "scope": "global",
              "intent": "autocorrect",
              "requiresSelection": false,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Globaler Autokorrekturmodus für den Schritt \"Personas schärfen\":\n- Korrigiere selektionsunabhängig über alle relevanten Canvas hinweg.\n- Präzisiere Inhalte dort, wo es methodisch eindeutig sinnvoll ist.",
              "flowControl": null
            },
            "global.review": {
              "triggerKey": "global.review",
              "scope": "global",
              "intent": "review",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Reviewmodus für den Schritt \"Personas schärfen\":\n- Führe einen qualitativen Gesamtreview über alle relevanten Canvas durch.\n- Fokus: Reifegrad, Klarheit, Vergleichbarkeit.",
              "flowControl": null
            },
            "global.synthesize": {
              "triggerKey": "global.synthesize",
              "scope": "global",
              "intent": "synthesize",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Synthesemodus für den Schritt \"Personas schärfen\":\n- Verdichte die wichtigsten Persona-Erkenntnisse über alle relevanten Canvas hinweg.",
              "flowControl": null
            },
            "global.coach": {
              "triggerKey": "global.coach",
              "scope": "global",
              "intent": "coach",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Coachmodus für den Schritt \"Personas schärfen\":\n- Gib dem Team eine klare Anleitung für den nächsten übergreifenden Arbeitsschritt.",
              "flowControl": null
            },
            "global.grade": {
              "triggerKey": "global.grade",
              "scope": "global",
              "intent": "grade",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Bewertungsmodus für den Schritt \"Personas schärfen\":\n- Bewerte die Gesamtqualität des Boards für diesen Schritt.\n- Liefere zusätzlich eine evaluation mit Rubrik.",
              "flowControl": null
            }
          }
        }
      }
    },
    "analytics-ai-usecase-fit-sprint-v1": {
      "exercisePackId": "analytics-ai-usecase-fit-sprint-v1",
      "packTemplateId": "analytics-ai-usecase-fit-sprint-template-v1",
      "label": "Use Case Fit Sprint",
      "version": 1,
      "description": "Geführte Miniübung auf dem Analytics & AI Use Case Canvas, um Nutzerperspektive, Lösungsperspektive und Problem-Solution-Fit schrittweise auszuarbeiten.",
      "packTemplateDescription": "Geführte Übung für das Analytics & AI Use Case Canvas mit didaktischer Sequenz von Nutzerperspektive über Lösungsperspektive bis zum Fit Check.",
      "boardMode": "exercise",
      "allowedCanvasTypeIds": [
        "datentreiber-analytics-ai-use-case"
      ],
      "defaultCanvasTypeId": "datentreiber-analytics-ai-use-case",
      "defaultStepId": "step1_user_perspective",
      "defaults": {
        "feedbackFrameName": "AI Coach Output",
        "feedbackChannel": "text",
        "userMayChangePack": false,
        "userMayChangeStep": false,
        "appAdminPolicy": "ui_toggle"
      },
      "exerciseGlobalPrompt": "Auf diesem Board läuft die Übung \"Use Case Fit Sprint\" auf dem Canvas \"Analytics & AI Use Case\".\n\nÜbergeordnetes Ziel:\n- Entwickle einen Analytics- oder KI-Anwendungsfall konsequent aus der Nutzerperspektive.\n- Arbeite erst die rechte Seite des Canvas tragfähig aus und leite danach die linke Seite als Antwort darauf ab.\n- Verdichte anschließend den Problem-Solution-Fit im Feld Check.\n\nMethodische Leitregeln:\n- Die rechte Seite beschreibt die Nutzerperspektive: User & Situation, Objectives & Results, Decisions & Actions, User Gains, User Pains.\n- Die linke Seite beschreibt die Lösungsperspektive: Solutions, Information, Functions, Benefits.\n- Das Feld Check verdichtet den Problem-Solution-Fit.\n- Verwende die Kette Information → Decisions & Actions → Results → Objectives als fachliche Leitlinie.\n- Benefits sind nur dann tragfähig, wenn sie Pains reduzieren, Gains verstärken oder zu besseren Ergebnissen und Zielen beitragen.\n- Nutze Connectoren nur dort, wo Beziehungen methodisch klar und lesbar sind.\n- Erfinde keine unnötigen Systemarchitekturen oder technischen Details; bleibe auf Use-Case-Ebene.\n- Arbeite präzise, atomar und area-genau.",
      "packTemplateGlobalPrompt": "Auf diesem Board läuft die Übung \"Use Case Fit Sprint\" auf dem Canvas \"Analytics & AI Use Case\".\n\nÜbergeordnetes Ziel:\n- Entwickle einen Analytics- oder KI-Anwendungsfall konsequent aus einer realen Nutzer- und Entscheidungssituation.\n- Arbeite zuerst die Nutzerperspektive tragfähig aus, leite daraus die Lösungsperspektive ab und verdichte den Problem-Solution-Fit erst am Ende im Feld Check.\n\nDidaktische Leitidee dieses Packs:\n- Step 1 baut den Problemraum und die Nutzerlogik auf.\n- Step 2 leitet daraus eine belastbare Lösungsperspektive ab.\n- Step 3 prüft und verdichtet den Problem-Solution-Fit.\n- Wenn ein Canvas oder Teilbereich noch leer ist, soll der Agent nicht nur Mängel melden, sondern didaktisch erklären, wie man fachlich sinnvoll startet.\n- In Hint-Modi soll der Agent konkrete nächste Schritte und Formulierungsanstöße geben.\n- In Coach-Modi soll der Agent mit Leitfragen arbeiten und einen Mikroschritt vorschlagen.\n- In Review-Modi soll der Agent Stärken, Risiken, fehlende Voraussetzungen und Konsistenzprobleme klar benennen.\n\nMethodische Regeln:\n- Die rechte Seite beschreibt die Nutzerperspektive: User & Situation, Objectives & Results, Decisions & Actions, User Gains, User Pains.\n- Die linke Seite beschreibt die Lösungsperspektive: Solutions, Information, Functions, Benefits.\n- Das Feld Check verdichtet den Problem-Solution-Fit.\n- Verwende die Kette Information → Decisions & Actions → Results → Objectives als fachliche Leitlinie.\n- Benefits sind nur dann tragfähig, wenn sie Pains reduzieren, Gains verstärken oder zu besseren Ergebnissen und Zielen beitragen.\n- Nutze Connectoren nur dort, wo Beziehungen methodisch klar, konkret und lesbar sind.\n- Vermeide reine Technologiebehauptungen ohne Bezug zur Nutzerarbeit.\n- Arbeite präzise, atomar, area-genau und immer passend zum Reifegrad des aktuellen Canvas.",
      "promptModules": {
        "analytics.fit.shared.method_guardrails": {
          "id": "analytics.fit.shared.method_guardrails",
          "label": "Methodische Leitplanken",
          "summary": "Hält den Agenten auf Use-Case-, Canvas- und Arbeitslogik-Kurs.",
          "prompt": "Arbeite methodisch sauber auf dem Analytics & AI Use Case Canvas:\n- Bleibe immer im Scope der ausgewählten Instanzen und des aktiven Schritts.\n- Behandle jede Sticky Note möglichst als eine atomare Aussage; vermeide Sammel-Stickies mit mehreren Gedanken.\n- Bleibe auf Use-Case-Ebene und erfinde keine unnötigen technischen Architekturen, Toollisten oder KI-Floskeln ohne Bezug zur Nutzerarbeit.\n- Respektiere die Area-Semantik des Canvas: mische nicht Nutzerperspektive, Lösungsperspektive und Fit-Aussagen unkontrolliert.\n- Nutze Connectoren nur dort, wo eine fachliche Beziehung klar, lesbar und nützlich ist.\n- Arbeite anschlussfähig an vorhandenen Inhalten statt das Board vollständig neu zu erfinden.\n- Wenn Inhalte noch unreif sind, benenne Lücken präzise und erkläre den nächsten sinnvollen Arbeitsschritt statt pauschal nur Mängel festzustellen."
        },
        "analytics.fit.shared.check_style": {
          "id": "analytics.fit.shared.check_style",
          "label": "Check-Stil",
          "summary": "Strukturierter Prüfmodus mit klaren Stärken, Lücken und nächsten Schritten.",
          "prompt": "Prüfmodus:\n- Prüfe strukturiert auf Vollständigkeit, Präzision, Fehlplatzierungen, Doppelungen, Unklarheiten und logische Brüche.\n- Gib im feedback möglichst klar an: was bereits tragfähig ist, was fehlt, was unklar oder zu generisch ist und was als nächstes verbessert werden sollte.\n- Wenn Board-Mutationen in diesem Trigger erlaubt sind, nimm nur offensichtliche, risikoarme Korrekturen vor.\n- Wenn der relevante Bereich noch leer oder sehr unreif ist, wechsle von strenger Bewertung zu didaktischer Aktivierung: erkläre, womit man sinnvoll beginnen sollte, statt nur Leere zu protokollieren."
        },
        "analytics.fit.shared.hint_style": {
          "id": "analytics.fit.shared.hint_style",
          "label": "Hint-Stil",
          "summary": "Kurzer, hilfreicher und anschlussfähiger Hinweisstil mit konkreten nächsten Schritten.",
          "prompt": "Hinweisstil:\n- Sei knapp, freundlich und konkret, aber nicht zu vage.\n- Priorisiere die nächsten 1 bis 3 sinnvollen Arbeitsschritte statt einen Vollrundumschlag zu geben.\n- Wenn Material vorhanden ist, knüpfe explizit an dieses Material an.\n- Wenn der relevante Bereich leer ist, gib eine sinnvolle Startreihenfolge und konkrete Formulierungsanstöße oder Satzanfänge.\n- Erzeuge normalerweise keine oder nur minimale Board-Mutationen; der Mehrwert soll vor allem im feedback liegen."
        },
        "analytics.fit.shared.coach_style": {
          "id": "analytics.fit.shared.coach_style",
          "label": "Coach-Stil",
          "summary": "Sokratischer, motivierender Coaching-Stil mit Leitfragen und Mikroschritt.",
          "prompt": "Coaching-Stil:\n- Formuliere eher coachend als bewertend.\n- Gib 3 bis 5 konkrete Leitfragen oder Reflexionsimpulse, die direkt zum aktiven Schritt passen.\n- Ergänze genau einen klaren Mikroschritt, mit dem der Nutzer sofort weitermachen kann.\n- Liefere keine vollständig ausformulierte Komplettlösung, wenn nicht ausdrücklich darum gebeten wird.\n- Wenn das Canvas leer ist, nutze Kick-off-Fragen und erkläre, warum ein bestimmter Einstieg fachlich sinnvoll ist."
        },
        "analytics.fit.shared.review_style": {
          "id": "analytics.fit.shared.review_style",
          "label": "Review-Stil",
          "summary": "Qualitativer Review mit Fokus auf Konsistenz, Reifegrad und Risiken statt auf Mutation.",
          "prompt": "Review-Stil:\n- Führe einen qualitativen Review durch, nicht bloß eine Checkliste.\n- Benenne möglichst klar Stärken, Schwächen, Widersprüche, fehlende Voraussetzungen und Risiken.\n- Wenn der Reifegrad noch zu niedrig für einen belastbaren Review ist, sage das explizit und erkläre, welche Vorarbeit zuerst fehlt.\n- Nimm standardmäßig keine Board-Mutationen vor; der Mehrwert liegt in Diagnose, Einordnung und Empfehlungen."
        },
        "analytics.fit.shared.synthesis_style": {
          "id": "analytics.fit.shared.synthesis_style",
          "label": "Synthese-Stil",
          "summary": "Verdichtet nur dann, wenn bereits genug Substanz vorhanden ist; sonst benennt er fehlende Voraussetzungen.",
          "prompt": "Synthese-Stil:\n- Verdichte vorhandene Inhalte in knappe, belastbare Fit-Aussagen.\n- Erfinde keinen Problem-Solution-Fit, wenn der Canvas noch zu leer oder zu widersprüchlich ist.\n- Wenn die Vorarbeit noch nicht reicht, benenne präzise, was vor der Synthese zuerst geklärt werden muss.\n- Wenn Mutationen erlaubt sind, beschränke sie auf kleine, gezielte Ergänzungen im Feld Check und auf wenige, klar begründete Connectoren."
        },
        "analytics.fit.step1.focus_user_perspective": {
          "id": "analytics.fit.step1.focus_user_perspective",
          "label": "Fokus: User Perspective First",
          "summary": "Konzentriert den Agenten auf die rechte Seite und ihre innere Logik.",
          "prompt": "Schrittfokus \"User Perspective First\":\n- Arbeite ausschließlich oder nahezu ausschließlich auf der rechten Seite des Canvas.\n- Gute Reihenfolge für die Nutzerperspektive: zuerst User & Situation, dann Decisions & Actions, danach Objectives & Results und anschließend User Pains sowie User Gains.\n- Prüfe oder erläutere, ob User & Situation konkret genug sind: Wer genau arbeitet in welcher Situation an welcher Aufgabe?\n- Prüfe oder erläutere, ob Decisions & Actions echte Entscheidungen oder Handlungen beschreiben und nicht bloß Systemfunktionen oder Ziele.\n- Prüfe oder erläutere, ob Objectives & Results erwünschte Outcomes beschreiben und nicht mit Maßnahmen oder Features verwechselt werden.\n- User Pains sollen Friktionen, Risiken, Unsicherheiten oder Aufwände aus Nutzersicht beschreiben.\n- User Gains sollen positive Effekte oder gewünschte Erleichterungen aus Nutzersicht beschreiben.\n- Lenke die Aufmerksamkeit noch nicht auf Solutions, Functions oder Benefits, solange die Nutzerperspektive nicht tragfähig ist."
        },
        "analytics.fit.step1.bootstrap_empty_user_perspective": {
          "id": "analytics.fit.step1.bootstrap_empty_user_perspective",
          "label": "Startdidaktik: leere User Perspective",
          "summary": "Hilft bei leerem oder fast leerem Step 1 mit Startreihenfolge und Formulierungsanstößen.",
          "prompt": "Wenn die rechte Seite des Canvas leer oder fast leer ist:\n- Behandle die Situation als fachlichen Kick-off und nicht als bloßen Mangelbericht.\n- Erkläre kurz, warum der sinnvollste Einstieg meist über User & Situation und Decisions & Actions läuft.\n- Gib eine klare Startreihenfolge für die ersten Stickies vor.\n- Gib konkrete Formulierungsanstöße oder Satzanfänge, z. B.:\n  - User & Situation: \"<Rolle> muss in <Situation/Kontext> ...\"\n  - Decisions & Actions: \"<Rolle> entscheidet, ob ...\" oder \"<Rolle> führt heute ... aus\"\n  - Objectives & Results: \"Ziel ist ..., messbar daran, dass ...\"\n  - User Pains: \"Schwierig ist derzeit ..., weil ...\"\n  - User Gains: \"Hilfreich wäre für den Nutzer ..., damit ...\"\n- Wenn der Trigger ein Hint oder Coach ist, gib lieber gute Startimpulse als fertige Inhalte."
        },
        "analytics.fit.step2.focus_solution_perspective": {
          "id": "analytics.fit.step2.focus_solution_perspective",
          "label": "Fokus: Solution Perspective",
          "summary": "Lenkt den Agenten auf die linke Seite und ihre Ableitung aus der Nutzerperspektive.",
          "prompt": "Schrittfokus \"Solution Perspective\":\n- Arbeite schwerpunktmäßig auf der linken Seite des Canvas.\n- Prüfe oder erläutere, ob Solutions, Information, Functions und Benefits nachvollziehbar aus der Nutzerperspektive abgeleitet werden.\n- Eine gute Ableitungslogik ist: Welche Entscheidung oder Handlung ist kritisch? Welche Information würde sie verbessern? Welche Funktion macht diese Information nutzbar? Welche Benefits entstehen daraus?\n- Information beschreibt Inhalte, Signale oder Erkenntnisse; Functions beschreiben Mechanismen oder Fähigkeiten; Solutions beschreiben die Lösungsidee als Ganzes.\n- Vermeide generische Aussagen wie \"KI-Tool\", \"Dashboard\" oder \"Automatisierung\", wenn nicht klar ist, welche Information, welche Funktion und welcher Nutzen dahinter steckt.\n- Benefits müssen einen plausiblen Bezug zu User Pains, User Gains, Objectives & Results oder Decisions & Actions haben."
        },
        "analytics.fit.step2.bootstrap_empty_solution_perspective": {
          "id": "analytics.fit.step2.bootstrap_empty_solution_perspective",
          "label": "Startdidaktik: leere Solution Perspective",
          "summary": "Hilft bei leerer linker Seite oder unreifer rechter Seite mit der passenden Ableitungsdidaktik.",
          "prompt": "Wenn die linke Seite noch leer oder sehr unreif ist:\n- Prüfe zuerst knapp, ob die rechte Seite bereits genug Substanz für sinnvolle Ableitungen hat.\n- Wenn die rechte Seite noch zu schwach ist, erkläre offen, welche Nutzerperspektiven zuerst präzisiert werden müssen, bevor gute Lösungen ableitbar sind.\n- Wenn die rechte Seite brauchbar ist, führe didaktisch in die Ableitung ein:\n  - Information: \"Um Entscheidung/Aktion X besser auszuführen, braucht der Nutzer ...\"\n  - Functions: \"Die Lösung sollte den Nutzer dabei unterstützen, indem ...\"\n  - Solutions: \"Eine sinnvolle Lösungsidee wäre ...\"\n  - Benefits: \"Dadurch sinkt/steigt/verbessert sich ...\"\n- Gib lieber 2 bis 4 gute Ableitungsanstöße als eine große, komplett ausformulierte Lösungsarchitektur."
        },
        "analytics.fit.step3.focus_fit_review": {
          "id": "analytics.fit.step3.focus_fit_review",
          "label": "Fokus: Fit Check Review",
          "summary": "Bewertet Problem-Solution-Fit, Konsistenz und Tragfähigkeit der Kette.",
          "prompt": "Schrittfokus \"Fit Check & Synthesis\" im Review:\n- Prüfe, ob eine nachvollziehbare Kette von User & Situation über Decisions & Actions und Objectives & Results hin zu Information, Functions, Solutions und Benefits erkennbar ist.\n- Achte besonders auf fehlende Verbindungen, unbegründete Benefits, solutionistische Sprünge und unklare Ziel- oder Ergebnislogik.\n- Ein guter Review benennt nicht nur Lücken, sondern auch, welche Teile bereits tragfähig zusammenpassen.\n- Wenn mehrere Instanzen betrachtet werden, arbeite pro Instanz klar getrennt und vergleiche erst danach Muster."
        },
        "analytics.fit.step3.bootstrap_incomplete_fit": {
          "id": "analytics.fit.step3.bootstrap_incomplete_fit",
          "label": "Vorbedingung: unreifer Fit Check",
          "summary": "Verhindert verfrühte Fit-Bewertungen bei unvollständigem Canvas.",
          "prompt": "Wenn die rechte oder linke Seite noch zu leer, zu allgemein oder zu widersprüchlich ist:\n- Täusche keinen belastbaren Fit Check vor.\n- Benenne stattdessen präzise, welche Vorbedingungen noch fehlen.\n- Gib an, ob eher Step 1 oder Step 2 weiterbearbeitet werden sollte.\n- Empfiehl als nächsten sinnvollen Trigger möglichst konkret check, hint oder coach auf dem passenden Schritt, statt schon eine Abschlussbewertung zu liefern."
        },
        "analytics.fit.step3.focus_fit_synthesis": {
          "id": "analytics.fit.step3.focus_fit_synthesis",
          "label": "Fokus: Fit Check Synthese",
          "summary": "Verdichtet den Fit in kurze Aussagen für das Check-Feld.",
          "prompt": "Schrittfokus \"Fit Check & Synthesis\" in der Synthese:\n- Verdichte pro betrachteter Instanz den Problem-Solution-Fit in 1 bis 3 kurze Aussagen für das Feld Check.\n- Gute Check-Aussagen machen sichtbar, welche Information oder Funktion welche Entscheidung oder Handlung verbessert und warum dies zu besseren Ergebnissen, geringeren Pains oder stärkeren Gains führt.\n- Nutze das Feld Check nicht für lange Erklärungen oder neue lose Ideen, sondern für knappe Verdichtungen des bereits erarbeiteten Kerns."
        },
        "analytics.fit.global.focus_cross_instance_review": {
          "id": "analytics.fit.global.focus_cross_instance_review",
          "label": "Fokus: Cross-Instance Review",
          "summary": "Vergleicht mehrere Instanzen auf Reifegrad, Muster, Stärken und wiederkehrende Schwächen.",
          "prompt": "Globaler Vergleichsmodus:\n- Vergleiche die betrachteten Instanzen im Gesamtzusammenhang.\n- Erkenne wiederkehrende Muster: z. B. häufig zu vage Nutzerbeschreibungen, häufig nicht sauber abgeleitete Benefits oder starke, gut begründete Informations-zu-Entscheidungs-Ketten.\n- Hebe Unterschiede im Reifegrad hervor: Welche Instanzen sind bereits belastbar, welche sind noch im Problemraum stecken geblieben, welche springen zu schnell in Lösungen?\n- Gib dem feedback eine nützliche Aggregation, damit Teams sehen, welche Qualitätsmuster sich über mehrere Boards hinweg wiederholen."
        }
      },
      "steps": {
        "step1_user_perspective": {
          "id": "step1_user_perspective",
          "order": 10,
          "label": "User Perspective First",
          "visibleInstruction": "Fülle zuerst die Nutzerperspektive aus: User & Situation, Objectives & Results, Decisions & Actions, User Gains und User Pains.",
          "flowInstruction": "Arbeite zuerst die rechte Seite aus: Beginne mit User & Situation und Decisions & Actions, ergänze danach Objectives & Results sowie User Pains und User Gains.",
          "flowSummary": "Zuerst einen belastbaren Problemraum und eine klare Nutzer- und Entscheidungssituation herstellen. Noch nicht in Lösungen springen.",
          "allowedActions": [
            "create_sticky",
            "move_sticky",
            "delete_sticky",
            "create_connector"
          ],
          "defaultEnterTrigger": null,
          "transitions": [
            {
              "toStepId": "step2_solution_perspective",
              "policy": "manual",
              "allowedSources": [
                "user",
                "admin",
                "agent_recommendation"
              ],
              "allowedAfterTriggers": [
                "selection.check",
                "selection.grade",
                "global.review"
              ],
              "requiredStepStatuses": [
                "ready_for_review",
                "completed"
              ]
            }
          ],
          "triggerProfiles": {
            "selection.check": {
              "triggerKey": "selection.check",
              "scope": "selection",
              "intent": "check",
              "requiresSelection": true,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Prüfmodus für den Schritt \"User Perspective First\":\n- Fokus ausschließlich auf der rechten Seite des Canvas.\n- Prüfe, ob User & Situation konkret genug sind.\n- Prüfe, ob Objectives & Results als gewünschte Ziele oder erwartete Ergebnisse formuliert sind.\n- Prüfe, ob Decisions & Actions echte Entscheidungen oder Handlungen beschreiben.\n- Prüfe, ob User Gains und User Pains plausibel aus Nutzersicht formuliert sind.\n- Prüfe Fehlplatzierungen und verschiebe nur dann, wenn die Korrektur eindeutig und unstrittig ist.\n- Connectoren sind nur dann sinnvoll, wenn Beziehungen klar sind, insbesondere Decisions & Actions → Objectives & Results.\n- Liefere feedback mit korrekten Punkten, Lücken, Unklarheiten und Fehlplatzierungen.",
              "flowControl": {
                "id": "analytics.fit.step1.check",
                "label": "User Perspective prüfen",
                "summary": "Prüft die rechte Seite strukturiert auf Vollständigkeit, Präzision und Fehlplatzierungen und hilft bei Leere mit einer sinnvollen Startdidaktik.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.check_style",
                  "analytics.fit.step1.bootstrap_empty_user_perspective",
                  "analytics.fit.step1.focus_user_perspective"
                ],
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Nutze dieses Profil, wenn die erste Version der Nutzerperspektive geprüft oder bei leerem Canvas fachlich angeschoben werden soll.",
                "sortOrder": 0
              }
            },
            "selection.hint": {
              "triggerKey": "selection.hint",
              "scope": "selection",
              "intent": "hint",
              "requiresSelection": true,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Hinweismodus für den Schritt \"User Perspective First\":\n- Gib möglichst wenig invasive Unterstützung.\n- Formuliere knappe Hinweise, was auf der rechten Seite noch fehlt oder zu vage ist.\n- Nutze Board-Mutationen nur in Ausnahmefällen; bevorzuge feedback. Nutze flowControlDirectives nur sparsam, wenn didaktisch ein weiterer Button freigeschaltet oder als erledigt markiert werden soll.",
              "flowControl": {
                "id": "analytics.fit.step1.hint",
                "label": "Hinweis zur User Perspective",
                "summary": "Gibt anschlussfähige, konkrete Hinweise zur rechten Seite und hilft bei leerem Canvas mit einer klaren Einstiegsreihenfolge.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.step1.bootstrap_empty_user_perspective",
                  "analytics.fit.step1.focus_user_perspective"
                ],
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Guter Hilfe-Button für Teilnehmende, wenn sie einen kleinen, aber konkreten nächsten Schritt brauchen.",
                "sortOrder": 1
              }
            },
            "selection.autocorrect": {
              "triggerKey": "selection.autocorrect",
              "scope": "selection",
              "intent": "autocorrect",
              "requiresSelection": true,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Autokorrekturmodus für den Schritt \"User Perspective First\":\n- Korrigiere aktiv die rechte Seite des Canvas.\n- Verschiebe eindeutig falsch platzierte Sticky Notes in die passende Area der Nutzerperspektive.\n- Ergänze nur klar notwendige Sticky Notes, um offensichtliche Lücken zu schließen.\n- Entferne nur leere, redundante oder doppelte Inhalte.\n- Entwickle in diesem Schritt noch keine vollständige linke Lösungsperspektive.\n- Ergänze Connectoren nur dort, wo sie methodisch klar sind, insbesondere Decisions & Actions → Objectives & Results.\n- Erkläre in feedback, welche Korrekturen vorgenommen wurden und ob die Instanz für den nächsten Schritt tragfähig ist.",
              "flowControl": null
            },
            "selection.review": {
              "triggerKey": "selection.review",
              "scope": "selection",
              "intent": "review",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Reviewmodus für den Schritt \"User Perspective First\":\n- Beurteile die Qualität, Lesbarkeit und methodische Sauberkeit der rechten Seite.\n- Nimm standardmäßig keine Board-Mutationen vor.\n- Gib präzises feedback zu Vollständigkeit, Spezifität und Reifegrad.",
              "flowControl": null
            },
            "selection.synthesize": {
              "triggerKey": "selection.synthesize",
              "scope": "selection",
              "intent": "synthesize",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Synthesemodus für den Schritt \"User Perspective First\":\n- Verdichte, welche Nutzer, Ziele, Entscheidungen, Gains und Pains bereits sichtbar sind.\n- Fokus auf Einsichten und Muster, nicht auf Mutationen.",
              "flowControl": null
            },
            "selection.coach": {
              "triggerKey": "selection.coach",
              "scope": "selection",
              "intent": "coach",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Coachmodus für den Schritt \"User Perspective First\":\n- Coache die selektierten Canvas-Instanzen, wie die rechte Seite sinnvoll ausgefüllt werden soll.\n- Erkläre konkret, was in User & Situation, Objectives & Results, Decisions & Actions, User Gains und User Pains gehört.\n- Nutze vorhandene Stickies als Ausgangspunkt.\n- actions sollen normalerweise leer bleiben.\n- Liefere starkes feedback. Nutze flowControlDirectives nur dann, wenn didaktisch ein weiterer Button freigeschaltet oder als erledigt markiert werden soll.",
              "flowControl": {
                "id": "analytics.fit.step1.coach",
                "label": "User Perspective coachen",
                "summary": "Coacht die rechte Seite mit Leitfragen, Reflexionsimpulsen und einem klaren Mikroschritt.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.step1.bootstrap_empty_user_perspective",
                  "analytics.fit.step1.focus_user_perspective"
                ],
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Nutze dieses Profil, wenn Teilnehmende nicht einfach eine Bewertung, sondern Denk- und Gesprächsimpulse brauchen.",
                "sortOrder": 2
              }
            },
            "selection.grade": {
              "triggerKey": "selection.grade",
              "scope": "selection",
              "intent": "grade",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Bewertungsmodus für den Schritt \"User Perspective First\":\n- Bewerte die rechte Seite anhand der Kriterien User Clarity, Objective Quality, Decision/Action Quality, Pain/Gain Quality und Area Correctness.\n- Führe keine oder praktisch keine Board-Mutationen aus.\n- Liefere zusätzlich eine evaluation mit Rubrik.\n- Wenn die rechte Seite tragfähig genug ist, kannst du den passenden nächsten Button per flowControlDirectives freischalten.",
              "flowControl": null
            },
            "global.check": {
              "triggerKey": "global.check",
              "scope": "global",
              "intent": "check",
              "requiresSelection": false,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Globaler Prüfmodus für den Schritt \"User Perspective First\":\n- Prüfe über alle relevanten Instanzen hinweg, ob Nutzerperspektiven konsistent, konkret und methodisch tragfähig sind.\n- Hebe globale Lücken und wiederkehrende Fehlplatzierungen hervor.",
              "flowControl": null
            },
            "global.hint": {
              "triggerKey": "global.hint",
              "scope": "global",
              "intent": "hint",
              "requiresSelection": false,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Globaler Hinweismodus für den Schritt \"User Perspective First\":\n- Gib globale Hinweise, welche Aspekte der Nutzerperspektive typischerweise noch fehlen oder unscharf sind.\n- Bevorzuge feedback; nutze flowControlDirectives nur sparsam und handle Board-Mutationen sehr zurückhaltend.",
              "flowControl": null
            },
            "global.autocorrect": {
              "triggerKey": "global.autocorrect",
              "scope": "global",
              "intent": "autocorrect",
              "requiresSelection": false,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Globaler Autokorrekturmodus für den Schritt \"User Perspective First\":\n- Korrigiere über alle relevanten Instanzen hinweg nur eindeutige Fehlplatzierungen oder Lücken auf der rechten Seite.\n- Entwickle noch keine vollständige linke Lösungsperspektive.",
              "flowControl": null
            },
            "global.review": {
              "triggerKey": "global.review",
              "scope": "global",
              "intent": "review",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Reviewmodus für den Schritt \"User Perspective First\":\n- Führe einen qualitativen Gesamt-Review über die Nutzerperspektiven aller relevanten Instanzen durch.\n- Fokus: Reifegrad, Präzision, Area-Korrektheit und Vergleichbarkeit.",
              "flowControl": null
            },
            "global.synthesize": {
              "triggerKey": "global.synthesize",
              "scope": "global",
              "intent": "synthesize",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Synthesemodus für den Schritt \"User Perspective First\":\n- Verdichte über alle relevanten Instanzen hinweg die wichtigsten Nutzerziele, Pains, Gains und Handlungsmuster.\n- Keine Standard-Mutationen; Fokus auf Muster und Erkenntnisse.",
              "flowControl": null
            },
            "global.coach": {
              "triggerKey": "global.coach",
              "scope": "global",
              "intent": "coach",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Coachmodus für den Schritt \"User Perspective First\":\n- Gib dem Team eine klare übergreifende Anleitung, wie es die Nutzerperspektive weiter schärfen soll.",
              "flowControl": null
            },
            "global.grade": {
              "triggerKey": "global.grade",
              "scope": "global",
              "intent": "grade",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Bewertungsmodus für den Schritt \"User Perspective First\":\n- Bewerte die Gesamtqualität der Nutzerperspektive über alle relevanten Instanzen.\n- Liefere zusätzlich eine evaluation mit Rubrik.",
              "flowControl": null
            }
          }
        },
        "step2_solution_perspective": {
          "id": "step2_solution_perspective",
          "order": 20,
          "label": "Solution Perspective",
          "visibleInstruction": "Leite nun aus der Nutzerperspektive die Lösungsperspektive ab: Solutions, Information, Functions und Benefits.",
          "flowInstruction": "Leite nun aus der Nutzerperspektive die linke Seite ab: Welche Information würde Entscheidungen oder Handlungen verbessern, welche Functions und Solutions machen das möglich und welche Benefits entstehen daraus?",
          "flowSummary": "Die Lösungsperspektive soll klar aus der Nutzerperspektive folgen und nicht generisch oder technologiegetrieben sein.",
          "allowedActions": [
            "create_sticky",
            "move_sticky",
            "delete_sticky",
            "create_connector"
          ],
          "defaultEnterTrigger": null,
          "transitions": [
            {
              "toStepId": "step3_fit_check_and_synthesis",
              "policy": "manual",
              "allowedSources": [
                "user",
                "admin",
                "agent_recommendation"
              ],
              "allowedAfterTriggers": [
                "selection.check",
                "selection.grade",
                "global.review"
              ],
              "requiredStepStatuses": [
                "ready_for_review",
                "completed"
              ]
            }
          ],
          "triggerProfiles": {
            "selection.check": {
              "triggerKey": "selection.check",
              "scope": "selection",
              "intent": "check",
              "requiresSelection": true,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Prüfmodus für den Schritt \"Solution Perspective\":\n- Fokus auf der linken Seite des Canvas.\n- Prüfe, ob Solutions, Information, Functions und Benefits nachvollziehbar aus der Nutzerperspektive abgeleitet sind.\n- Prüfe, ob Information Entscheidungen oder Handlungen verbessert.\n- Prüfe, ob Functions reale Entscheidungen oder Handlungen unterstützen.\n- Prüfe, ob Benefits Pains reduzieren, Gains verstärken oder zu Ergebnissen und Zielen beitragen.\n- Ergänze Connectoren nur dort, wo Beziehungen klar ableitbar sind, insbesondere Information → Decisions & Actions, Functions → Decisions & Actions sowie Benefits → User Pains/User Gains/Objectives & Results.",
              "flowControl": {
                "id": "analytics.fit.step2.check",
                "label": "Solution Perspective prüfen",
                "summary": "Prüft die linke Seite auf Ableitung, Nutzwert und saubere Unterscheidung zwischen Information, Functions, Solutions und Benefits.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.check_style",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.focus_solution_perspective"
                ],
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Sinnvoll, wenn die linke Seite bereits befüllt ist oder gezielt aus der rechten Seite abgeleitet werden soll.",
                "sortOrder": 3
              }
            },
            "selection.hint": {
              "triggerKey": "selection.hint",
              "scope": "selection",
              "intent": "hint",
              "requiresSelection": true,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Hinweismodus für den Schritt \"Solution Perspective\":\n- Gib präzise Hinweise, wie die linke Seite aus der rechten Seite abgeleitet werden sollte.\n- Board-Mutationen nur in Ausnahmefällen; bevorzuge feedback. Nutze flowControlDirectives nur sparsam.",
              "flowControl": {
                "id": "analytics.fit.step2.hint",
                "label": "Hinweis zur Solution Perspective",
                "summary": "Gibt präzise Ableitungs-Hinweise für die linke Seite und erklärt bei Leere, wie man von Entscheidungen zu Information, Functions und Benefits kommt.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.focus_solution_perspective"
                ],
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Gut geeignet, wenn die Nutzerperspektive schon brauchbar ist, die Lösungsperspektive aber noch nicht sauber abgeleitet wurde.",
                "sortOrder": 4
              }
            },
            "selection.autocorrect": {
              "triggerKey": "selection.autocorrect",
              "scope": "selection",
              "intent": "autocorrect",
              "requiresSelection": true,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Autokorrekturmodus für den Schritt \"Solution Perspective\":\n- Korrigiere aktiv die linke Seite des Canvas.\n- Verschiebe fehlplatzierte Inhalte in Solutions, Information, Functions oder Benefits.\n- Ergänze nur klar notwendige Sticky Notes, um offensichtliche Lücken zu schließen.\n- Ergänze sinnvolle Connectoren zwischen linker und rechter Seite.\n- Bleibe auf Use-Case-Ebene und erfinde keine komplexen Systemarchitekturen.\n- Erkläre in feedback, welche Korrekturen du vorgenommen hast und ob der Check-Schritt sinnvoll ist.",
              "flowControl": null
            },
            "selection.review": {
              "triggerKey": "selection.review",
              "scope": "selection",
              "intent": "review",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Reviewmodus für den Schritt \"Solution Perspective\":\n- Beurteile die Relevanz, Präzision und Nutzennähe der Lösungsperspektive.\n- Nimm standardmäßig keine Board-Mutationen vor.",
              "flowControl": null
            },
            "selection.synthesize": {
              "triggerKey": "selection.synthesize",
              "scope": "selection",
              "intent": "synthesize",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Synthesemodus für den Schritt \"Solution Perspective\":\n- Verdichte, welche Lösungsmuster, Informationsbedarfe, Funktionen und Benefits bereits sichtbar sind.\n- Fokus auf übergreifende Einsichten, nicht auf Mutationen.",
              "flowControl": null
            },
            "selection.coach": {
              "triggerKey": "selection.coach",
              "scope": "selection",
              "intent": "coach",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Coachmodus für den Schritt \"Solution Perspective\":\n- Erkläre klar den Unterschied zwischen Solutions, Information, Functions und Benefits.\n- Hilf dabei, aus Decisions & Actions sinnvolle Information und Functions und aus Pains/Gains tragfähige Benefits abzuleiten.\n- actions sollen normalerweise leer bleiben.",
              "flowControl": {
                "id": "analytics.fit.step2.coach",
                "label": "Solution Perspective coachen",
                "summary": "Coacht die Ableitung der linken Seite mit Leitfragen statt mit fertiger Lösungsskizze.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.focus_solution_perspective"
                ],
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Nutze dieses Profil, wenn Teilnehmende selbst auf gute Ableitungen kommen sollen, statt eine direkte Lösung zu bekommen.",
                "sortOrder": 5
              }
            },
            "selection.grade": {
              "triggerKey": "selection.grade",
              "scope": "selection",
              "intent": "grade",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Bewertungsmodus für den Schritt \"Solution Perspective\":\n- Bewerte die linke Seite anhand der Kriterien Solution Relevance, Information Quality, Function Usefulness, Benefit Strength und Cross-Side Traceability.\n- Führe keine oder praktisch keine Board-Mutationen aus.\n- Liefere zusätzlich eine evaluation mit Rubrik.\n- Wenn die Lösungsperspektive tragfähig genug ist, kannst du den passenden nächsten Button per flowControlDirectives freischalten.",
              "flowControl": null
            },
            "global.check": {
              "triggerKey": "global.check",
              "scope": "global",
              "intent": "check",
              "requiresSelection": false,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Globaler Prüfmodus für den Schritt \"Solution Perspective\":\n- Prüfe über alle relevanten Instanzen hinweg, ob die Lösungsperspektiven nachvollziehbar aus der Nutzerperspektive abgeleitet sind.",
              "flowControl": null
            },
            "global.hint": {
              "triggerKey": "global.hint",
              "scope": "global",
              "intent": "hint",
              "requiresSelection": false,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Globaler Hinweismodus für den Schritt \"Solution Perspective\":\n- Gib globale Hinweise zu fehlenden Informationsbedarfen, vagen Funktionen und schwachen Benefits.",
              "flowControl": null
            },
            "global.autocorrect": {
              "triggerKey": "global.autocorrect",
              "scope": "global",
              "intent": "autocorrect",
              "requiresSelection": false,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Globaler Autokorrekturmodus für den Schritt \"Solution Perspective\":\n- Korrigiere selektionsunabhängig über alle relevanten Instanzen hinweg eindeutige Probleme der linken Seite.",
              "flowControl": null
            },
            "global.review": {
              "triggerKey": "global.review",
              "scope": "global",
              "intent": "review",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Reviewmodus für den Schritt \"Solution Perspective\":\n- Führe einen qualitativen Gesamt-Review über alle relevanten Lösungsperspektiven durch.\n- Fokus: Relevanz, Lesbarkeit, Ableitung aus der Nutzerperspektive.",
              "flowControl": null
            },
            "global.synthesize": {
              "triggerKey": "global.synthesize",
              "scope": "global",
              "intent": "synthesize",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Synthesemodus für den Schritt \"Solution Perspective\":\n- Verdichte die wichtigsten Lösungs-, Informations-, Funktions- und Benefit-Muster über alle relevanten Instanzen hinweg.",
              "flowControl": null
            },
            "global.coach": {
              "triggerKey": "global.coach",
              "scope": "global",
              "intent": "coach",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Coachmodus für den Schritt \"Solution Perspective\":\n- Gib dem Team eine klare Anleitung für die nächste übergreifende Ausarbeitung der Lösungsperspektive.",
              "flowControl": null
            },
            "global.grade": {
              "triggerKey": "global.grade",
              "scope": "global",
              "intent": "grade",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Bewertungsmodus für den Schritt \"Solution Perspective\":\n- Bewerte die Gesamtqualität der Lösungsperspektiven über alle relevanten Instanzen.\n- Liefere zusätzlich eine evaluation mit Rubrik.",
              "flowControl": null
            }
          }
        },
        "step3_fit_check_and_synthesis": {
          "id": "step3_fit_check_and_synthesis",
          "order": 30,
          "label": "Fit Check & Synthesis",
          "visibleInstruction": "Verdichte den Problem-Solution-Fit im Feld Check und prüfe die Konsistenz zwischen Nutzer- und Lösungsperspektive.",
          "flowInstruction": "Prüfe jetzt, ob Nutzerperspektive und Lösungsperspektive konsistent zusammenpassen. Erst wenn genug Substanz vorhanden ist, verdichte den Problem-Solution-Fit im Feld Check.",
          "flowSummary": "Konsistenz, Reifegrad und Problem-Solution-Fit prüfen und nur dann verdichten, wenn die Vorarbeit tragfähig genug ist.",
          "allowedActions": [
            "create_sticky",
            "move_sticky",
            "delete_sticky",
            "create_connector"
          ],
          "defaultEnterTrigger": null,
          "transitions": [],
          "triggerProfiles": {
            "selection.check": {
              "triggerKey": "selection.check",
              "scope": "selection",
              "intent": "check",
              "requiresSelection": true,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Prüfmodus für den Schritt \"Fit Check & Synthesis\":\n- Prüfe die Konsistenz zwischen rechter und linker Seite.\n- Prüfe, ob Benefits tatsächlich Pains reduzieren, Gains verstärken oder Entscheidungen, Handlungen, Ergebnisse und Ziele unterstützen.\n- Das Feld Check dient der Verdichtung des Problem-Solution-Fit.",
              "flowControl": null
            },
            "selection.hint": {
              "triggerKey": "selection.hint",
              "scope": "selection",
              "intent": "hint",
              "requiresSelection": true,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Hinweismodus für den Schritt \"Fit Check & Synthesis\":\n- Gib knappe Hinweise, wie der Problem-Solution-Fit klarer und belastbarer formuliert werden kann.",
              "flowControl": null
            },
            "selection.autocorrect": {
              "triggerKey": "selection.autocorrect",
              "scope": "selection",
              "intent": "autocorrect",
              "requiresSelection": true,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Autokorrekturmodus für den Schritt \"Fit Check & Synthesis\":\n- Korrigiere aktiv klare Inkonsistenzen zwischen rechter und linker Seite.\n- Ergänze bei Bedarf fehlende, eindeutige Connectoren oder kleine Präzisierungen im Check-Feld.\n- Keine große Restrukturierung des Canvas.",
              "flowControl": null
            },
            "selection.review": {
              "triggerKey": "selection.review",
              "scope": "selection",
              "intent": "review",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Reviewmodus für den Schritt \"Fit Check & Synthesis\":\n- Führe einen qualitativen Review des Problem-Solution-Fit durch.\n- Nimm standardmäßig keine Board-Mutationen vor.",
              "flowControl": {
                "id": "analytics.fit.step3.review",
                "label": "Fit Check reviewen",
                "summary": "Führt einen reifen qualitativen Review des Problem-Solution-Fit durch und behandelt unvollständige Boards ausdrücklich als Vorstufe statt als fertige Bewertung.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.focus_fit_review"
                ],
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Geeignet, wenn beide Seiten zumindest teilweise ausgearbeitet sind und ihr wissen wollt, wie belastbar der Fit bereits ist.",
                "sortOrder": 6
              }
            },
            "selection.synthesize": {
              "triggerKey": "selection.synthesize",
              "scope": "selection",
              "intent": "synthesize",
              "requiresSelection": true,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Synthesemodus für den Schritt \"Fit Check & Synthesis\":\n- Verdichte die selektierte Instanz oder die selektierten Instanzen und mache den Problem-Solution-Fit sichtbar.\n- Formuliere pro Instanz 1 bis 3 knappe Fit-Aussagen für das Feld Check.\n- In diesem Trigger darfst du begrenzte Mutationen durchführen: bis zu drei neue Sticky Notes im Feld Check und sinnvolle ergänzende Connectoren.\n- Nimm keine große Restrukturierung des restlichen Canvas vor.\n- Liefere feedback, das die Verdichtung erklärt. Nutze flowControlDirectives nur dann, wenn didaktisch weitere Buttons freigeschaltet oder als erledigt markiert werden sollen.",
              "flowControl": {
                "id": "analytics.fit.step3.synthesize",
                "label": "Fit Check synthetisieren",
                "summary": "Verdichtet nur dann in das Check-Feld, wenn genug Substanz vorhanden ist; sonst werden fehlende Voraussetzungen benannt.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.synthesis_style",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.focus_fit_synthesis"
                ],
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Erst verwenden, wenn Problem- und Lösungsperspektive schon genügend reif sind, um echte Fit-Aussagen zu verdichten.",
                "sortOrder": 8
              }
            },
            "selection.coach": {
              "triggerKey": "selection.coach",
              "scope": "selection",
              "intent": "coach",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Coachmodus für den Schritt \"Fit Check & Synthesis\":\n- Erkläre, wie aus Nutzerperspektive und Lösungsperspektive belastbare Fit-Aussagen im Feld Check formuliert werden.\n- actions sollen normalerweise leer bleiben.",
              "flowControl": {
                "id": "analytics.fit.step3.coach",
                "label": "Fit Check coachen",
                "summary": "Coacht die Bewertung des Problem-Solution-Fit mit Leitfragen und zeigt fehlende Voraussetzungen für eine spätere Synthese auf.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.focus_fit_review"
                ],
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "defaultScopeType": "fixed_instances",
                "allowedActions": [],
                "uiHint": "Sinnvoll, wenn der Fit noch nicht hart bewertet, sondern gemeinsam reflektiert werden soll.",
                "sortOrder": 7
              }
            },
            "selection.grade": {
              "triggerKey": "selection.grade",
              "scope": "selection",
              "intent": "grade",
              "requiresSelection": true,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Bewertungsmodus für den Schritt \"Fit Check & Synthesis\":\n- Bewerte den Problem-Solution-Fit anhand der Kriterien Fit Clarity, Fit Evidence, Consistency, Actionability und Overall Coherence.\n- Führe keine oder praktisch keine Board-Mutationen aus.\n- Liefere zusätzlich eine evaluation mit Rubrik.",
              "flowControl": null
            },
            "global.check": {
              "triggerKey": "global.check",
              "scope": "global",
              "intent": "check",
              "requiresSelection": false,
              "mutationPolicy": "limited",
              "feedbackPolicy": "text",
              "prompt": "Globaler Prüfmodus für den Schritt \"Fit Check & Synthesis\":\n- Prüfe über alle aktiven Instanzen hinweg, wo Problem-Solution-Fit bereits klar ist und wo noch Schwächen bestehen.",
              "flowControl": null
            },
            "global.hint": {
              "triggerKey": "global.hint",
              "scope": "global",
              "intent": "hint",
              "requiresSelection": false,
              "mutationPolicy": "minimal",
              "feedbackPolicy": "text",
              "prompt": "Globaler Hinweismodus für den Schritt \"Fit Check & Synthesis\":\n- Gib globale Hinweise, wo Fit-Aussagen fehlen oder die Konsistenz noch nicht überzeugend ist.",
              "flowControl": null
            },
            "global.autocorrect": {
              "triggerKey": "global.autocorrect",
              "scope": "global",
              "intent": "autocorrect",
              "requiresSelection": false,
              "mutationPolicy": "full",
              "feedbackPolicy": "both",
              "prompt": "Globaler Autokorrekturmodus für den Schritt \"Fit Check & Synthesis\":\n- Korrigiere nur klare globale Inkonsistenzen oder fehlende Verdichtungen mit Bedacht.",
              "flowControl": null
            },
            "global.review": {
              "triggerKey": "global.review",
              "scope": "global",
              "intent": "review",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Reviewmodus für den Schritt \"Fit Check & Synthesis\":\n- Prüfe alle aktiven Instanzen dieses Exercise Packs im Zusammenhang.\n- Ziel ist ein qualitativer Gesamt-Review: Welche Instanzen haben einen klaren Problem-Solution-Fit, wo sind Nutzerperspektiven zu vage, wo sind Lösungen zu allgemein oder nicht ausreichend an Entscheidungen und Handlungen gekoppelt, und welche Stärken oder Schwächen wiederholen sich über mehrere Instanzen hinweg?\n- Dieser Trigger dient primär Analyse und feedback; nimm normalerweise keine oder nur minimale Board-Mutationen vor.",
              "flowControl": {
                "id": "analytics.fit.global.review",
                "label": "Global Review",
                "summary": "Vergleicht mehrere Instanzen auf Reifegrad, Muster, Stärken und wiederkehrende Schwächen im Gesamtzusammenhang.",
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.global.focus_cross_instance_review"
                ],
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "defaultScopeType": "global",
                "allowedActions": [],
                "uiHint": "Nützlich für einen Meta-Review über mehrere Canvas-Instanzen oder Teams hinweg.",
                "sortOrder": 9
              }
            },
            "global.synthesize": {
              "triggerKey": "global.synthesize",
              "scope": "global",
              "intent": "synthesize",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Synthesemodus für den Schritt \"Fit Check & Synthesis\":\n- Verdichte alle aktiven Instanzen dieses Exercise Packs zu einer übergreifenden Synthese.\n- Suche nach wiederkehrenden Nutzerzielen, Pains, Entscheidungs- und Handlungsmustern, Informations- und Funktionsmustern, Benefits und Fit-Lücken.\n- Dieser Trigger dient primär der übergreifenden Zusammenfassung und dem feedback, nicht der massiven Board-Manipulation.",
              "flowControl": null
            },
            "global.coach": {
              "triggerKey": "global.coach",
              "scope": "global",
              "intent": "coach",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Coachmodus für den Schritt \"Fit Check & Synthesis\":\n- Gib dem Team eine klare Anleitung, ob es vertiefen, korrigieren oder abschließen sollte.",
              "flowControl": null
            },
            "global.grade": {
              "triggerKey": "global.grade",
              "scope": "global",
              "intent": "grade",
              "requiresSelection": false,
              "mutationPolicy": "none",
              "feedbackPolicy": "text",
              "prompt": "Globaler Bewertungsmodus für den Schritt \"Fit Check & Synthesis\":\n- Bewerte die Gesamtqualität des Problem-Solution-Fit über alle relevanten Instanzen.\n- Liefere zusätzlich eine evaluation mit Rubrik.",
              "flowControl": null
            }
          }
        }
      }
    }
  }
});

export const METHOD_CATALOG = RAW_METHOD_CATALOG;

const exercisePacks = {};
const packTemplates = {};
const runProfiles = {};
const promptModules = {};

for (const [packId, packDef] of Object.entries(RAW_METHOD_CATALOG.packs || {})) {
  const exercisePack = buildExercisePackProjection({ exercisePackId: packId, ...cloneJson(packDef) });
  if (exercisePack?.id) {
    exercisePacks[exercisePack.id] = exercisePack;
  }

  const packRunProfiles = [];
  for (const rawModule of Object.values((packDef?.promptModules && typeof packDef.promptModules === "object") ? packDef.promptModules : {})) {
    const moduleProjection = buildPromptModuleProjection(rawModule);
    if (moduleProjection?.id) {
      promptModules[moduleProjection.id] = moduleProjection;
    }
  }

  for (const [stepId, rawStepDef] of Object.entries((packDef?.steps && typeof packDef.steps === "object") ? packDef.steps : {})) {
    const stepDef = rawStepDef && typeof rawStepDef === "object" ? rawStepDef : {};
    for (const rawTriggerProfile of Object.values((stepDef?.triggerProfiles && typeof stepDef.triggerProfiles === "object") ? stepDef.triggerProfiles : {})) {
      const runProfile = buildFlowControlProjection(packDef, { id: stepId, ...stepDef }, rawTriggerProfile);
      if (!runProfile?.id) continue;
      const finalProfile = Object.freeze({
        id: runProfile.id,
        label: runProfile.label,
        summary: runProfile.summary,
        packTemplateId: runProfile.packTemplateId,
        stepTemplateId: runProfile.stepTemplateId,
        triggerKey: runProfile.triggerKey,
        moduleIds: Object.freeze(runProfile.moduleIds),
        mutationPolicy: runProfile.mutationPolicy,
        feedbackPolicy: runProfile.feedbackPolicy,
        defaultScopeType: runProfile.defaultScopeType,
        allowedActions: Object.freeze(runProfile.allowedActions),
        uiHint: runProfile.uiHint,
        sortOrder: runProfile.sortOrder
      });
      runProfiles[finalProfile.id] = finalProfile;
      packRunProfiles.push(runProfile);
    }
  }

  const packTemplate = buildPackTemplateProjection(packDef, packRunProfiles);
  if (packTemplate?.id) {
    packTemplates[packTemplate.id] = packTemplate;
  }
}

export const EXERCISE_PACKS = Object.freeze(exercisePacks);
export const PROMPT_MODULES = Object.freeze(promptModules);
export const PACK_TEMPLATES = Object.freeze(packTemplates);
export const RUN_PROFILES = Object.freeze(runProfiles);

export function normalizeExercisePackId(value) {
  const id = asNonEmptyString(value);
  return id && EXERCISE_PACKS[id] ? id : null;
}

export function listExercisePacks() {
  return sortByLabel(Object.values(EXERCISE_PACKS));
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
  return normalizeUniqueStrings(pack.allowedCanvasTypes);
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

export function listPackTemplates() {
  return sortByLabel(Object.values(PACK_TEMPLATES));
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
