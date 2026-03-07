import {
  DT_DEFAULT_APP_ADMIN_POLICY,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_TRIGGER_KEYS
} from "../config.js?v=20260307-batch75";

import { METHOD_I18N_OVERRIDES } from "../i18n/catalog.js?v=20260306-batch6";
import { normalizeUiLanguage, pickLocalized } from "../i18n/index.js?v=20260306-batch6";

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

const EXTRA_STICKY_MUTATION_ACTIONS = Object.freeze(["set_sticky_color", "set_check_status"]);

function augmentAllowedActions(values) {
  const base = normalizeUniqueStrings(values);
  if (!base.some((value) => ["create_sticky", "move_sticky", "delete_sticky"].includes(value))) {
    return base;
  }
  return normalizeUniqueStrings([...base, ...EXTRA_STICKY_MUTATION_ACTIONS]);
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

function getMethodLanguage(options = null) {
  return normalizeUiLanguage(options?.lang);
}

function getExercisePackOverride(packId) {
  return METHOD_I18N_OVERRIDES.exercisePacks?.[packId] || null;
}

function getExerciseStepOverride(packId, stepId) {
  return METHOD_I18N_OVERRIDES.steps?.[packId]?.[stepId] || null;
}

function getPackTemplateOverride(packTemplateId) {
  return METHOD_I18N_OVERRIDES.packTemplates?.[packTemplateId] || null;
}

function getStepTemplateOverride(packTemplateId, stepId) {
  return METHOD_I18N_OVERRIDES.stepTemplates?.[packTemplateId]?.[stepId] || null;
}

function getRunProfileOverride(runProfileId) {
  return METHOD_I18N_OVERRIDES.runProfiles?.[runProfileId] || null;
}

function getPromptModuleOverride(moduleId) {
  return METHOD_I18N_OVERRIDES.promptModules?.[moduleId] || null;
}

function applyLocalizedField(baseValue, localizedOverride, lang) {
  if (!localizedOverride) return baseValue;
  const resolved = pickLocalized(localizedOverride, lang);
  return asNonEmptyString(resolved) || baseValue;
}

function localizeExerciseStepProjection(step, packId, lang = "de") {
  const normalizedLang = normalizeUiLanguage(lang);
  if (!step || normalizedLang === "de") return step;
  const override = getExerciseStepOverride(packId, step.id);
  if (!override) return step;
  return Object.freeze({
    ...step,
    label: applyLocalizedField(step.label, override.label, normalizedLang),
    visibleInstruction: applyLocalizedField(step.visibleInstruction, override.visibleInstruction, normalizedLang)
  });
}

function localizeExercisePackProjection(pack, lang = "de") {
  const normalizedLang = normalizeUiLanguage(lang);
  if (!pack || normalizedLang === "de") return pack;
  const override = getExercisePackOverride(pack.id);
  if (!override) return pack;
  return Object.freeze({
    ...pack,
    label: applyLocalizedField(pack.label, override.label, normalizedLang),
    description: applyLocalizedField(pack.description, override.description, normalizedLang)
  });
}

function localizePackTemplateProjection(packTemplate, lang = "de") {
  const normalizedLang = normalizeUiLanguage(lang);
  if (!packTemplate || normalizedLang === "de") return packTemplate;
  const override = getPackTemplateOverride(packTemplate.id);
  if (!override) return packTemplate;
  return Object.freeze({
    ...packTemplate,
    label: applyLocalizedField(packTemplate.label, override.label, normalizedLang),
    description: applyLocalizedField(packTemplate.description, override.description, normalizedLang)
  });
}

function localizeStepTemplateProjection(stepTemplate, packTemplateId, lang = "de") {
  const normalizedLang = normalizeUiLanguage(lang);
  if (!stepTemplate || normalizedLang === "de") return stepTemplate;
  const override = getStepTemplateOverride(packTemplateId, stepTemplate.id);
  if (!override) return stepTemplate;
  return Object.freeze({
    ...stepTemplate,
    label: applyLocalizedField(stepTemplate.label, override.label, normalizedLang),
    instruction: applyLocalizedField(stepTemplate.instruction, override.instruction, normalizedLang),
    summary: applyLocalizedField(stepTemplate.summary, override.summary, normalizedLang)
  });
}

function localizeRunProfileProjection(runProfile, lang = "de") {
  const normalizedLang = normalizeUiLanguage(lang);
  if (!runProfile || normalizedLang === "de") return runProfile;
  const override = getRunProfileOverride(runProfile.id);
  if (!override) return runProfile;
  return Object.freeze({
    ...runProfile,
    label: applyLocalizedField(runProfile.label, override.label, normalizedLang),
    summary: applyLocalizedField(runProfile.summary, override.summary, normalizedLang),
    uiHint: applyLocalizedField(runProfile.uiHint, override.uiHint, normalizedLang)
  });
}

function localizePromptModuleProjection(moduleProjection, lang = "de") {
  const normalizedLang = normalizeUiLanguage(lang);
  if (!moduleProjection || normalizedLang === "de") return moduleProjection;
  const override = getPromptModuleOverride(moduleProjection.id);
  if (!override) return moduleProjection;
  return Object.freeze({
    ...moduleProjection,
    label: applyLocalizedField(moduleProjection.label, override.label, normalizedLang),
    summary: applyLocalizedField(moduleProjection.summary, override.summary, normalizedLang)
  });
}

function getRawExercisePack(packOrId) {
  if (typeof packOrId === "string") {
    const normalizedId = normalizeExercisePackId(packOrId);
    return normalizedId ? EXERCISE_PACKS[normalizedId] : null;
  }
  if (packOrId?.id && EXERCISE_PACKS[packOrId.id]) return EXERCISE_PACKS[packOrId.id];
  return packOrId && typeof packOrId === "object" ? packOrId : null;
}

function getRawPackTemplate(packOrId) {
  if (typeof packOrId === "string") {
    const normalizedId = asNonEmptyString(packOrId);
    return normalizedId && PACK_TEMPLATES[normalizedId] ? PACK_TEMPLATES[normalizedId] : null;
  }
  if (packOrId?.id && PACK_TEMPLATES[packOrId.id]) return PACK_TEMPLATES[packOrId.id];
  return packOrId && typeof packOrId === "object" ? packOrId : null;
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
    allowedActions: augmentAllowedActions(stepDef?.allowedActions),
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
    allowedActions: augmentAllowedActions(flowControl.allowedActions),
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

function setPromptModuleText(pack, moduleId, patch = {}) {
  const moduleDef = pack?.promptModules?.[moduleId];
  if (!moduleDef || typeof moduleDef !== "object") return;
  if (typeof patch.label === "string") moduleDef.label = patch.label;
  if (typeof patch.summary === "string") moduleDef.summary = patch.summary;
  if (typeof patch.prompt === "string") moduleDef.prompt = patch.prompt;
}

function setStepFields(pack, stepId, patch = {}) {
  const stepDef = pack?.steps?.[stepId];
  if (!stepDef || typeof stepDef !== "object") return;
  if (typeof patch.label === "string") stepDef.label = patch.label;
  if (typeof patch.visibleInstruction === "string") stepDef.visibleInstruction = patch.visibleInstruction;
  if (typeof patch.flowInstruction === "string") stepDef.flowInstruction = patch.flowInstruction;
  if (typeof patch.flowSummary === "string") stepDef.flowSummary = patch.flowSummary;
}

function setTriggerPrompt(pack, stepId, triggerKey, prompt) {
  const trigger = pack?.steps?.[stepId]?.triggerProfiles?.[triggerKey];
  if (!trigger || typeof trigger !== "object" || typeof prompt !== "string") return;
  trigger.prompt = prompt;
}

function applyAnalyticsUseCaseBatch7Patch(catalog) {
  const pack = catalog?.packs?.["analytics-ai-usecase-fit-sprint-v1"];
  if (!pack || typeof pack !== "object") return catalog;

  pack.description = `Geführte Miniübung auf dem Analytics & AI Use Case Canvas, die erst Nutzerkontext sammelt und strukturiert, daraus selektiv eine Lösung ableitet und den Problem-Solution-Fit erst am Ende verdichtet.`;
  pack.packTemplateDescription = `Geführte Übung für das Analytics & AI Use Case Canvas mit Sammel-, Struktur-, Ableitungs- und Fit-Logik statt pauschaler Vollvernetzung.`;

  pack.exerciseGlobalPrompt = `Auf diesem Board läuft die Übung "Use Case Fit Sprint" auf dem Canvas "Analytics & AI Use Case".

Übergeordnetes Ziel:
- Entwickle einen Analytics- oder KI-Anwendungsfall konsequent aus einer realen Nutzer- und Entscheidungssituation.
- Baue zuerst einen belastbaren Problemraum auf, leite daraus selektiv eine Lösungsperspektive ab und verdichte den Problem-Solution-Fit erst am Ende im Feld Check.

Didaktische Arbeitslogik:
- Arbeite in vier Modi: sammeln, strukturieren, ableiten, prüfen und verdichten.
- Step 1 baut die Nutzerperspektive in dieser Reihenfolge auf: User & Situation → Objectives & Results → Decisions & Actions → User Gains / User Pains.
- Step 2 arbeitet die Lösungsperspektive aus: zuerst Solution-Varianten oder Lösungsideen, dann Information und Functions, danach Benefits.
- Step 3 prüft nur dann Fit und verdichtet im Feld Check, wenn genug Substanz vorhanden ist.

Connector-Leitregeln:
- Connectoren sind sparsam, optional und nur für explizite methodische Relationen gedacht.
- Sammlungen, Brainstorms, Varianten und Cluster bleiben standardmäßig unverbunden.
- Objectives & Results dürfen als kleiner Driver Tree strukturiert werden.
- Decisions & Actions dürfen als kleiner Workflow mit einzelnen Feedback-Loops strukturiert werden.
- Gains & Pains bleiben standardmäßig unverbunden.
- Information, Functions und Benefits werden nur selektiv verbunden, wenn eine konkrete Ableitungs- oder Fit-Beziehung explizit ist.

Qualitätskriterien:
- Arbeite präzise, atomar, area-genau und anschlussfähig an vorhandene Inhalte.
- Erfinde keine unnötigen Systemarchitekturen oder generischen KI-Floskeln.
- Nicht jede Sticky Note braucht einen Connector; unverbundene Stickies sind in diesem Canvas oft korrekt.`;

  pack.packTemplateGlobalPrompt = `Auf diesem Board läuft die Übung "Use Case Fit Sprint" auf dem Canvas "Analytics & AI Use Case".

Übergeordnetes Ziel:
- Entwickle einen Analytics- oder KI-Anwendungsfall konsequent aus einer realen Nutzer- und Entscheidungssituation.
- Arbeite zuerst die Nutzerperspektive tragfähig aus, leite daraus die Lösungsperspektive ab und verdichte den Problem-Solution-Fit erst am Ende im Feld Check.

Didaktische Leitidee dieses Packs:
- Step 1 baut den Problemraum über vier Arbeitsmodi auf: User & Situation klären, Objectives & Results strukturieren, Decisions & Actions strukturieren, Gains & Pains sammeln.
- Step 2 leitet daraus eine belastbare Lösungsperspektive ab: erst Solution-Varianten oder Lösungsideen, dann Information und Functions, danach Benefits.
- Step 3 prüft und verdichtet den Problem-Solution-Fit, aber nur dann, wenn genug Substanz vorhanden ist.
- Wenn ein Canvas oder Teilbereich noch leer ist, soll der Agent nicht nur Mängel melden, sondern didaktisch erklären, wie man fachlich sinnvoll startet.
- In Hint-Modi soll der Agent konkrete nächste Schritte und Formulierungsanstöße geben.
- In Coach-Modi soll der Agent mit Leitfragen arbeiten und genau einen sinnvollen Mikroschritt vorschlagen.
- In Review-Modi soll der Agent Stärken, Risiken, fehlende Voraussetzungen, Over-Connecting und Konsistenzprobleme klar benennen.
- In Synthesis-Modi soll der Agent nur verdichten, nicht künstlich Fit erfinden.

Methodische Regeln:
- Brainstorming zuerst, Strukturierung zweitens, Ableitung drittens, Fit-Check und Verdichtung zuletzt.
- Die rechte Seite beschreibt die Nutzerperspektive: User & Situation, Objectives & Results, Decisions & Actions, User Gains, User Pains.
- Die linke Seite beschreibt die Lösungsperspektive: Solutions, Information, Functions, Benefits.
- Das Feld Check verdichtet den Problem-Solution-Fit.
- Nutze Connectoren nur dort, wo Beziehungen methodisch klar, konkret und lesbar sind.
- Gains und Pains sind standardmäßig Sammelbereiche, nicht Ketten.
- Alternative Solutions sind standardmäßig Varianten, nicht automatisch vernetzte Bausteine.
- Vermeide reine Technologiebehauptungen ohne Bezug zur Nutzerarbeit.
- Arbeite präzise, atomar, area-genau und immer passend zum Reifegrad des aktuellen Canvas.`;

  setPromptModuleText(pack, "analytics.fit.shared.method_guardrails", {
    summary: "Hält den Agenten auf Tutorial-, Canvas- und Arbeitslogik-Kurs und bremst unnötige Vernetzung.",
    prompt: `Arbeite methodisch sauber auf dem Analytics & AI Use Case Canvas:
- Bleibe immer im Scope der ausgewählten Instanzen und des aktiven Schritts.
- Behandle jede Sticky Note möglichst als eine atomare Aussage; vermeide Sammel-Stickies mit mehreren Gedanken.
- Bleibe auf Use-Case-Ebene und erfinde keine unnötigen technischen Architekturen, Toollisten oder KI-Floskeln ohne Bezug zur Nutzerarbeit.
- Arbeite in der Logik sammeln → strukturieren → ableiten → prüfen/verdichten.
- Respektiere die Area-Semantik des Canvas: mische nicht Nutzerperspektive, Lösungsperspektive und Fit-Aussagen unkontrolliert.
- Nutze Connectoren nur dort, wo eine explizite methodische Beziehung klar, lesbar und nützlich ist.
- Gleiche Area, thematische Nähe, Clusterzugehörigkeit oder Brainstorming reichen nicht als Connector-Grund.
- Gains/Pains und alternative Solutions sind standardmäßig Sammlungen, keine Ketten.
- Arbeite anschlussfähig an vorhandenen Inhalten statt das Board vollständig neu zu erfinden.
- Wenn Inhalte noch unreif sind, benenne Lücken präzise und erkläre den nächsten sinnvollen Arbeitsschritt statt pauschal nur Mängel festzustellen.`
  });

  setPromptModuleText(pack, "analytics.fit.shared.check_style", {
    summary: "Strukturierter Prüfmodus mit Fokus auf Reifegrad, richtigen Arbeitsmodus und klaren nächsten Schritten.",
    prompt: `Prüfmodus:
- Prüfe strukturiert auf Vollständigkeit, Präzision, Fehlplatzierungen, Doppelungen, Unklarheiten, Over-Connecting und logische Brüche.
- Prüfe auch, ob der aktuelle Bereich im richtigen Arbeitsmodus bearbeitet wird: Sammlung, Strukturierung, Ableitung oder Verdichtung.
- Gib im feedback möglichst klar an: was bereits tragfähig ist, was fehlt, was unklar oder zu generisch ist und was als nächstes verbessert werden sollte.
- Wenn Board-Mutationen in diesem Trigger erlaubt sind, nimm nur offensichtliche, risikoarme Korrekturen vor.
- Wenn der relevante Bereich noch leer oder sehr unreif ist, wechsle von strenger Bewertung zu didaktischer Aktivierung: erkläre, womit man sinnvoll beginnen sollte, statt nur Leere zu protokollieren.`
  });

  setPromptModuleText(pack, "analytics.fit.shared.hint_style", {
    summary: "Kurzer, anschlussfähiger Hinweisstil mit nächstem Mikroschritt statt Vollrundumschlag.",
    prompt: `Hinweisstil:
- Sei knapp, freundlich und konkret, aber nicht zu vage.
- Priorisiere die nächsten 1 bis 3 sinnvollen Arbeitsschritte statt einen Vollrundumschlag zu geben.
- Wenn Material vorhanden ist, knüpfe explizit an dieses Material an.
- Wenn der relevante Bereich leer ist, gib eine sinnvolle Startreihenfolge und konkrete Formulierungsanstöße oder Satzanfänge.
- Dränge nicht auf Connectoren, wenn der aktuelle Arbeitsmodus eher Sammlung oder Brainstorming ist.
- Erzeuge normalerweise keine oder nur minimale Board-Mutationen; der Mehrwert soll vor allem im feedback liegen.`
  });

  setPromptModuleText(pack, "analytics.fit.shared.coach_style", {
    summary: "Sokratischer, motivierender Coaching-Stil mit Leitfragen und genau einem Mikroschritt.",
    prompt: `Coaching-Stil:
- Formuliere eher coachend als bewertend.
- Gib 3 bis 5 konkrete Leitfragen oder Reflexionsimpulse, die direkt zum aktiven Schritt passen.
- Ergänze genau einen klaren Mikroschritt, mit dem der Nutzer sofort weitermachen kann.
- Liefere keine vollständig ausformulierte Komplettlösung, wenn nicht ausdrücklich darum gebeten wird.
- Wenn das Canvas leer ist, nutze Kick-off-Fragen und erkläre, warum ein bestimmter Einstieg fachlich sinnvoll ist.
- Nutze Connectoren im Coaching höchstens als Ausnahme und nur dann, wenn der nächste Mikroschritt wirklich eine explizite Relation sichtbar machen soll.`
  });

  setPromptModuleText(pack, "analytics.fit.shared.review_style", {
    summary: "Qualitativer Review mit Fokus auf Konsistenz, Reifegrad, Over-Connecting und Risiken statt auf Mutation.",
    prompt: `Review-Stil:
- Führe einen qualitativen Review durch, nicht bloß eine Checkliste.
- Benenne möglichst klar Stärken, Schwächen, Widersprüche, fehlende Voraussetzungen, Over-Connecting und Risiken.
- Wenn der Reifegrad noch zu niedrig für einen belastbaren Review ist, sage das explizit und erkläre, welche Vorarbeit zuerst fehlt.
- Werte unverbundene Gains/Pains oder alternative Solutions nicht automatisch als Fehler.
- Nimm standardmäßig keine Board-Mutationen vor; der Mehrwert liegt in Diagnose, Einordnung und Empfehlungen.`
  });

  setPromptModuleText(pack, "analytics.fit.shared.synthesis_style", {
    summary: "Verdichtet nur dann, wenn genug Substanz vorhanden ist; neue Kanten bleiben selten und streng begründet.",
    prompt: `Synthese-Stil:
- Verdichte vorhandene Inhalte in knappe, belastbare Fit-Aussagen.
- Erfinde keinen Problem-Solution-Fit, wenn der Canvas noch zu leer oder zu widersprüchlich ist.
- Wenn die Vorarbeit noch nicht reicht, benenne präzise, was vor der Synthese zuerst geklärt werden muss.
- Wenn Mutationen erlaubt sind, beschränke sie auf kleine, gezielte Ergänzungen im Feld Check und höchstens wenige, klar begründete Connectoren.
- Nutze Check-Aussagen lieber für Verdichtung als zusätzliche Kanten ohne klaren Prüfwert.`
  });

  setPromptModuleText(pack, "analytics.fit.step1.focus_user_perspective", {
    summary: "Konzentriert den Agenten auf die rechte Seite als Kombination aus Sammlung und selektiver Strukturierung.",
    prompt: `Schrittfokus "User Perspective First":
- Arbeite ausschließlich oder nahezu ausschließlich auf der rechten Seite des Canvas.
- Gute Reihenfolge für die Nutzerperspektive: zuerst User & Situation, dann Objectives & Results, danach Decisions & Actions und anschließend User Pains sowie User Gains.
- User & Situation ist ein Klärungs- und Fokussierungsmodus: Wer genau arbeitet in welcher Situation an welcher Aufgabe? Hier sind Connectoren normalerweise nicht nötig.
- Objectives & Results ist ein Strukturmodus: Outcomes und messbare Ergebnisse dürfen als kleiner Driver Tree mit wenigen Result → Objective-Kanten sichtbar gemacht werden.
- Decisions & Actions ist ein Strukturmodus: reale Entscheidungen oder Handlungen dürfen als kleiner Workflow mit wenigen klaren Ablauf- oder Feedback-Loop-Kanten sichtbar gemacht werden.
- User Pains und User Gains sind ein Sammelmodus aus Nutzersicht. Sie sollen nahe an passenden blauen Stickies stehen, bleiben aber standardmäßig unverbunden.
- Lenke die Aufmerksamkeit noch nicht auf Solutions, Functions oder Benefits, solange die Nutzerperspektive nicht tragfähig ist.`
  });

  setPromptModuleText(pack, "analytics.fit.step1.bootstrap_empty_user_perspective", {
    summary: "Hilft bei leerem oder fast leerem Step 1 mit tutorial-naher Startreihenfolge und Formulierungsanstößen.",
    prompt: `Wenn die rechte Seite des Canvas leer oder fast leer ist:
- Behandle die Situation als fachlichen Kick-off und nicht als bloßen Mangelbericht.
- Erkläre kurz, warum der sinnvollste Einstieg über User & Situation und anschließend Objectives & Results läuft.
- Gib eine klare Startreihenfolge für die ersten Stickies vor:
  1) User & Situation,
  2) Objectives & Results,
  3) Decisions & Actions,
  4) User Pains und User Gains.
- Gib konkrete Formulierungsanstöße oder Satzanfänge, z. B.:
  - User & Situation: "<Rolle> muss in <Situation/Kontext> ..."
  - Objectives & Results: "Ziel ist ..., messbar daran, dass ..."
  - Decisions & Actions: "<Rolle> entscheidet, ob ..." oder "<Rolle> führt heute ... aus"
  - User Pains: "Schwierig ist derzeit ..., weil ..."
  - User Gains: "Hilfreich wäre für den Nutzer ..., damit ..."
- Ermutige dazu, Gains und Pains zunächst als Sammlung zu behandeln und noch nicht künstlich miteinander zu verdrahten.
- Wenn der Trigger ein Hint oder Coach ist, gib lieber gute Startimpulse als fertige Inhalte.`
  });

  setPromptModuleText(pack, "analytics.fit.step2.focus_solution_perspective", {
    summary: "Lenkt den Agenten auf die linke Seite als Ableitung aus dem Problemraum statt als Vollverdrahtung.",
    prompt: `Schrittfokus "Solution Perspective":
- Arbeite schwerpunktmäßig auf der linken Seite des Canvas.
- Gute Reihenfolge für die Lösungsperspektive: zuerst Solutions als Varianten oder grobe Lösungsideen, danach Information und Functions, anschließend Benefits.
- Prüfe oder erläutere, ob Solutions, Information, Functions und Benefits nachvollziehbar aus der Nutzerperspektive abgeleitet werden.
- Solutions können zunächst alternative Varianten sein und bleiben standardmäßig unverbunden, solange keine konkrete Auswahl- oder Ableitungsbeziehung sichtbar gemacht werden soll.
- Information beschreibt Inhalte, Signale oder Erkenntnisse; Functions beschreiben Mechanismen oder Fähigkeiten; Solutions beschreiben die Lösungsidee als Ganzes.
- Leite Information und Functions aus konkreten Decisions & Actions sowie aus kritischen Pains und Gains ab.
- Verbinde Information oder Functions nur dann, wenn eine konkrete Entscheidung oder Handlung dadurch verbessert wird.
- Benefits müssen einen plausiblen Bezug zu User Pains, User Gains, Objectives & Results oder Decisions & Actions haben und werden nur selektiv verbunden.
- Vermeide generische Aussagen wie "KI-Tool", "Dashboard" oder "Automatisierung", wenn nicht klar ist, welche Information, welche Funktion und welcher Nutzen dahinter steckt.`
  });

  setPromptModuleText(pack, "analytics.fit.step2.bootstrap_empty_solution_perspective", {
    summary: "Hilft bei leerer linker Seite oder unreifer rechter Seite mit tutorial-naher Ableitungsdidaktik.",
    prompt: `Wenn die linke Seite noch leer oder sehr unreif ist:
- Prüfe zuerst knapp, ob die rechte Seite bereits genug Substanz für sinnvolle Ableitungen hat.
- Wenn die rechte Seite noch zu schwach ist, erkläre offen, welche Teile der Nutzerperspektive zuerst präzisiert werden müssen, bevor gute Lösungen ableitbar sind.
- Wenn die rechte Seite brauchbar ist, führe didaktisch in die Ableitung ein:
  1) Solutions als 1 bis 3 Varianten oder grobe Lösungsideen sammeln,
  2) Information ableiten: "Um Entscheidung/Aktion X besser auszuführen, braucht der Nutzer ...",
  3) Functions ableiten: "Die Lösung sollte den Nutzer dabei unterstützen, indem ...",
  4) Benefits formulieren: "Dadurch sinkt/steigt/verbessert sich ...".
- Alternative Solutions müssen nicht miteinander verbunden werden.
- Gib lieber 2 bis 4 gute Ableitungsanstöße als eine große, komplett ausformulierte Lösungsarchitektur.`
  });

  setPromptModuleText(pack, "analytics.fit.step3.focus_fit_review", {
    summary: "Bewertet Problem-Solution-Fit über wenige belastbare Fit-Ketten statt über Gesamtvernetzung.",
    prompt: `Schrittfokus "Fit Check & Synthesis" im Review:
- Prüfe, ob eine nachvollziehbare Kette von User & Situation über Objectives & Results und Decisions & Actions hin zu Solutions, Information, Functions und Benefits erkennbar ist.
- Achte besonders auf fehlende Ableitungen, unbegründete Benefits, solutionistische Sprünge, Over-Connecting und unklare Ziel- oder Ergebnislogik.
- Ein guter Review verlangt keine Vollvernetzung. Wichtiger sind wenige belastbare Fit-Ketten als ein dichtes Netz.
- Prüfe selektiv, welche Benefits klar einen Pain, Gain, Result, Objective oder eine Action adressieren.
- Wenn mehrere Instanzen betrachtet werden, arbeite pro Instanz klar getrennt und vergleiche erst danach Muster.`
  });

  setPromptModuleText(pack, "analytics.fit.step3.bootstrap_incomplete_fit", {
    summary: "Verhindert verfrühte Fit-Bewertungen bei unvollständigem Canvas und routet gezielt zurück in Step 1 oder Step 2.",
    prompt: `Wenn die rechte oder linke Seite noch zu leer, zu allgemein oder zu widersprüchlich ist:
- Täusche keinen belastbaren Fit Check vor.
- Benenne stattdessen präzise, welche Vorbedingungen noch fehlen.
- Gib an, ob eher Step 1 oder Step 2 weiterbearbeitet werden sollte und welcher Arbeitsmodus dort fehlt: Sammlung, Strukturierung oder Ableitung.
- Wenn der Problemraum noch unklar ist, route zurück zu User & Situation, Objectives & Results, Decisions & Actions oder Gains/Pains.
- Wenn die Lösungsperspektive noch zu schwach ist, route zurück zu Solutions, Information, Functions oder Benefits.
- Empfiehl als nächsten sinnvollen Trigger möglichst konkret check, hint oder coach auf dem passenden Schritt, statt schon eine Abschlussbewertung zu liefern.`
  });

  setPromptModuleText(pack, "analytics.fit.step3.focus_fit_synthesis", {
    summary: "Verdichtet den Fit in kurze Check-Aussagen und ergänzt nur wenige validierte Fit-Kanten.",
    prompt: `Schrittfokus "Fit Check & Synthesis" in der Synthese:
- Verdichte pro betrachteter Instanz den Problem-Solution-Fit in 1 bis 3 kurze Aussagen für das Feld Check.
- Gute Check-Aussagen machen sichtbar, welche Information oder Funktion welche Entscheidung oder Handlung verbessert und warum dies zu besseren Ergebnissen, geringeren Pains oder stärkeren Gains führt.
- Nutze das Feld Check nicht für lange Erklärungen oder neue lose Ideen, sondern für knappe Verdichtungen des bereits erarbeiteten Kerns.
- Ergänze höchstens wenige validierte Connectoren, wenn sie den Kern-Fit lesbarer machen; vermeide neue Graphnetze.`
  });

  setPromptModuleText(pack, "analytics.fit.global.focus_cross_instance_review", {
    summary: "Vergleicht mehrere Instanzen auf Reifegrad, Arbeitsmodus, Over-Connecting und wiederkehrende Qualitätsmuster.",
    prompt: `Globaler Vergleichsmodus:
- Vergleiche die betrachteten Instanzen im Gesamtzusammenhang.
- Erkenne wiederkehrende Muster: z. B. zu vage Nutzerbeschreibungen, zu schwach strukturierte Objectives & Results, unklare Decisions & Actions, Benefits ohne Ableitung oder Over-Connecting.
- Hebe Unterschiede im Reifegrad hervor: Welche Instanzen sind bereits belastbar, welche sind noch im Sammelmodus, welche springen zu schnell in Lösungen und welche verdichten zu früh Fit?
- Gib dem feedback eine nützliche Aggregation, damit Teams sehen, welche Qualitätsmuster sich über mehrere Boards hinweg wiederholen.`
  });

  setStepFields(pack, "step1_user_perspective", {
    visibleInstruction: `Arbeite zuerst die Nutzerperspektive aus: User & Situation klären, Objectives & Results strukturieren, Decisions & Actions skizzieren und anschließend Gains & Pains sammeln.`,
    flowInstruction: `Arbeite zuerst die rechte Seite aus: Beginne mit User & Situation, strukturiere danach Objectives & Results, skizziere Decisions & Actions und ergänze anschließend Gains & Pains als Nutzersammlung.`,
    flowSummary: `Zuerst den Problemraum sammeln und strukturieren: User & Situation klären, Objectives/Results als kleinen Driver Tree, Decisions/Actions als kleinen Workflow, Gains/Pains als Sammlung. Noch nicht in Lösungen springen.`
  });

  setStepFields(pack, "step2_solution_perspective", {
    visibleInstruction: `Leite nun aus der Nutzerperspektive die Lösungsperspektive ab: erst Lösungsideen sammeln, dann Information und Functions konkretisieren und daraus Benefits ableiten.`,
    flowInstruction: `Leite nun aus der Nutzerperspektive die linke Seite ab: Welche Solution-Varianten sind denkbar, welche Information würde Entscheidungen oder Handlungen verbessern, welche Functions machen das nutzbar und welche Benefits entstehen daraus?`,
    flowSummary: `Die Lösungsperspektive soll selektiv aus dem Problemraum folgen: Varianten sammeln, Information/Functions ableiten, Benefits begründen und nur wenige explizite Relationen sichtbar machen.`
  });

  setStepFields(pack, "step3_fit_check_and_synthesis", {
    visibleInstruction: `Prüfe jetzt den Problem-Solution-Fit, verdichte ihn im Feld Check und ergänze nur wenige validierte Fit-Beziehungen.`,
    flowInstruction: `Prüfe jetzt, ob Nutzerperspektive und Lösungsperspektive konsistent zusammenpassen. Erst wenn genug Substanz vorhanden ist, verdichte den Problem-Solution-Fit im Feld Check und ergänze höchstens wenige validierte Fit-Kanten.`,
    flowSummary: `Konsistenz, Reifegrad und Problem-Solution-Fit prüfen und nur dann verdichten, wenn die Vorarbeit tragfähig genug ist. Wenige belastbare Fit-Ketten sind wichtiger als Vollvernetzung.`
  });

  setTriggerPrompt(pack, "step1_user_perspective", "selection.check", `Prüfmodus für den Schritt "User Perspective First":
- Fokus ausschließlich auf der rechten Seite des Canvas.
- Prüfe die tutorial-nahe Reihenfolge und Arbeitsmodi: User & Situation klären, Objectives & Results strukturieren, Decisions & Actions strukturieren, Gains & Pains sammeln.
- Prüfe, ob User & Situation konkret genug sind.
- Prüfe, ob Objectives & Results als gewünschte Ziele oder erwartete Ergebnisse formuliert sind und ob ein kleiner Driver Tree mit wenigen Result → Objective-Kanten sinnvoll wäre.
- Prüfe, ob Decisions & Actions echte Entscheidungen oder Handlungen beschreiben und ob ein kleiner Workflow mit wenigen Kanten sinnvoll wäre.
- Prüfe, ob User Gains und User Pains plausibel aus Nutzersicht formuliert sind und nicht künstlich miteinander verkettet wurden.
- Prüfe Fehlplatzierungen und verschiebe nur dann, wenn die Korrektur eindeutig und unstrittig ist.
- Liefere feedback mit tragfähigen Punkten, Lücken, Unklarheiten, Fehlplatzierungen und möglichem Over-Connecting.`);

  setTriggerPrompt(pack, "step1_user_perspective", "selection.hint", `Hinweismodus für den Schritt "User Perspective First":
- Gib möglichst wenig invasive Unterstützung.
- Formuliere knappe Hinweise, was auf der rechten Seite noch fehlt oder zu vage ist.
- Priorisiere den nächsten sinnvollen Arbeitsmodus: erst User & Situation, dann Objectives & Results, dann Decisions & Actions, dann Gains/Pains.
- Dränge nicht auf Connectoren, wenn der aktuelle Bedarf eher Sammlung oder Brainstorming ist.
- Nutze Board-Mutationen nur in Ausnahmefällen; bevorzuge feedback. Nutze flowControlDirectives nur sparsam, wenn didaktisch ein weiterer Button freigeschaltet oder als erledigt markiert werden soll.`);

  setTriggerPrompt(pack, "step1_user_perspective", "selection.autocorrect", `Autokorrekturmodus für den Schritt "User Perspective First":
- Korrigiere aktiv die rechte Seite des Canvas.
- Verschiebe eindeutig falsch platzierte Sticky Notes in die passende Area der Nutzerperspektive.
- Ergänze nur klar notwendige Sticky Notes, um offensichtliche Lücken zu schließen.
- Entferne nur leere, redundante oder doppelte Inhalte.
- Entwickle in diesem Schritt noch keine vollständige linke Lösungsperspektive.
- Ergänze Connectoren nur dort, wo eine explizite Strukturbeziehung wirklich fehlt: wenige Result → Objective-Kanten oder wenige Workflow-Kanten in Decisions & Actions.
- Ergänze standardmäßig keine Connectoren in User & Situation, Gains oder Pains.
- Wenn vorhandene Connectoren bereits zu dicht wirken, benenne das im feedback statt weitere hinzuzufügen.
- Erkläre in feedback, welche Korrekturen vorgenommen wurden und ob die Instanz für den nächsten Schritt tragfähig ist.`);

  setTriggerPrompt(pack, "step1_user_perspective", "selection.review", `Reviewmodus für den Schritt "User Perspective First":
- Beurteile die Qualität, Lesbarkeit und methodische Sauberkeit der rechten Seite.
- Prüfe, ob Sammlung und Strukturierung an den richtigen Stellen passieren und ob Gains/Pains nicht fälschlich als Vollgraph behandelt werden.
- Nimm standardmäßig keine Board-Mutationen vor.
- Gib präzises feedback zu Vollständigkeit, Spezifität, Reifegrad und möglichem Over-Connecting.`);

  setTriggerPrompt(pack, "step1_user_perspective", "selection.synthesize", `Synthesemodus für den Schritt "User Perspective First":
- Verdichte, welche Nutzer, Ziele, Ergebnisse, Entscheidungen, Gains und Pains bereits sichtbar sind.
- Mache sichtbar, welche Teile schon gesammelt sind und welche bereits strukturiert wurden.
- Fokus auf Einsichten und Muster, nicht auf Mutationen oder zusätzliche Connectoren.`);

  setTriggerPrompt(pack, "step1_user_perspective", "selection.coach", `Coachmodus für den Schritt "User Perspective First":
- Coache die selektierten Canvas-Instanzen, wie die rechte Seite sinnvoll ausgefüllt werden soll.
- Erkläre konkret, was in User & Situation, Objectives & Results, Decisions & Actions, User Gains und User Pains gehört.
- Nutze vorhandene Stickies als Ausgangspunkt und schlage genau einen sinnvollen Mikroschritt vor.
- Mache klar, dass Gains/Pains zunächst gesammelt und nicht automatisch verbunden werden.
- actions sollen normalerweise leer bleiben.
- Liefere starkes feedback. Nutze flowControlDirectives nur dann, wenn didaktisch ein weiterer Button freigeschaltet oder als erledigt markiert werden soll.`);

  setTriggerPrompt(pack, "step1_user_perspective", "selection.grade", `Bewertungsmodus für den Schritt "User Perspective First":
- Bewerte die rechte Seite anhand der Kriterien User Clarity, Objective/Result Quality, Decision/Action Quality, Pain/Gain Quality, Area Correctness und sparsame Strukturierung.
- Führe keine oder praktisch keine Board-Mutationen aus.
- Liefere zusätzlich eine evaluation mit Rubrik.
- Werte fehlende Vollvernetzung nicht negativ, solange der Arbeitsmodus stimmt.
- Wenn die rechte Seite tragfähig genug ist, kannst du den passenden nächsten Button per flowControlDirectives freischalten.`);

  setTriggerPrompt(pack, "step1_user_perspective", "global.check", `Globaler Prüfmodus für den Schritt "User Perspective First":
- Prüfe über alle relevanten Instanzen hinweg, ob Nutzerperspektiven konsistent, konkret und methodisch tragfähig sind.
- Hebe globale Lücken, wiederkehrende Fehlplatzierungen, fehlende Strukturierung und Over-Connecting hervor.`);

  setTriggerPrompt(pack, "step1_user_perspective", "global.hint", `Globaler Hinweismodus für den Schritt "User Perspective First":
- Gib globale Hinweise, welche Aspekte der Nutzerperspektive typischerweise noch fehlen oder unscharf sind.
- Priorisiere den nächsten Arbeitsmodus je Instanz: User & Situation, Objectives & Results, Decisions & Actions oder Gains/Pains.
- Bevorzuge feedback; nutze flowControlDirectives nur sparsam und handle Board-Mutationen sehr zurückhaltend.`);

  setTriggerPrompt(pack, "step1_user_perspective", "global.autocorrect", `Globaler Autokorrekturmodus für den Schritt "User Perspective First":
- Korrigiere über alle relevanten Instanzen hinweg nur eindeutige Fehlplatzierungen oder Lücken auf der rechten Seite.
- Entwickle noch keine vollständige linke Lösungsperspektive.
- Ergänze Connectoren global nur dort, wo klare Driver-Tree- oder Workflow-Lücken bestehen; Gains/Pains bleiben standardmäßig unverbunden.`);

  setTriggerPrompt(pack, "step1_user_perspective", "global.review", `Globaler Reviewmodus für den Schritt "User Perspective First":
- Führe einen qualitativen Gesamt-Review über die Nutzerperspektiven aller relevanten Instanzen durch.
- Fokus: Reifegrad, Präzision, Arbeitsmodus, sparsame Strukturierung und Vergleichbarkeit.`);

  setTriggerPrompt(pack, "step1_user_perspective", "global.synthesize", `Globaler Synthesemodus für den Schritt "User Perspective First":
- Verdichte über alle relevanten Instanzen hinweg die wichtigsten Nutzerziele, Results, Pains, Gains und Handlungsmuster.
- Keine Standard-Mutationen; Fokus auf Muster, Arbeitsmodi und Erkenntnisse.`);

  setTriggerPrompt(pack, "step1_user_perspective", "global.coach", `Globaler Coachmodus für den Schritt "User Perspective First":
- Gib dem Team eine klare übergreifende Anleitung, wie es die Nutzerperspektive weiter schärfen soll.
- Mache deutlich, in welchem Arbeitsmodus die Teams jeweils hängen: Sammlung, Strukturierung oder beides.`);

  setTriggerPrompt(pack, "step1_user_perspective", "global.grade", `Globaler Bewertungsmodus für den Schritt "User Perspective First":
- Bewerte die Gesamtqualität der Nutzerperspektive über alle relevanten Instanzen.
- Berücksichtige dabei User Clarity, Objective/Result Quality, Decision/Action Quality, Pain/Gain Quality, Area Correctness und angemessene Sparsamkeit bei Connectoren.
- Liefere zusätzlich eine evaluation mit Rubrik.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "selection.check", `Prüfmodus für den Schritt "Solution Perspective":
- Fokus auf der linken Seite des Canvas.
- Prüfe, ob Solutions, Information, Functions und Benefits nachvollziehbar aus der Nutzerperspektive abgeleitet sind.
- Prüfe, ob Solutions zunächst als Varianten oder grobe Lösungsideen gesammelt und nicht unnötig miteinander vernetzt wurden.
- Prüfe, ob Information konkrete Entscheidungen oder Handlungen verbessert.
- Prüfe, ob Functions reale Entscheidungen oder Handlungen unterstützen.
- Prüfe, ob Benefits Pains reduzieren, Gains verstärken oder zu Ergebnissen und Zielen beitragen.
- Ergänze Connectoren nur dort, wo Beziehungen klar ableitbar sind, insbesondere Information → Decisions & Actions, Functions → Decisions & Actions oder selektiv Benefit → adressierter Pain/Gain/Result/Objective/Action.
- Liefere feedback zu Relevanz, Ableitungslogik, Traceability und möglichem Over-Connecting.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "selection.hint", `Hinweismodus für den Schritt "Solution Perspective":
- Gib präzise Hinweise, wie die linke Seite aus der rechten Seite abgeleitet werden sollte.
- Priorisiere die nächste sinnvolle Teilaufgabe: Solution-Varianten sammeln, Information ableiten, Functions ableiten oder Benefits formulieren.
- Board-Mutationen nur in Ausnahmefällen; bevorzuge feedback. Nutze flowControlDirectives nur sparsam.
- Dränge nicht auf Connectoren, solange Varianten oder lose Lösungsideen erst gesammelt werden.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "selection.autocorrect", `Autokorrekturmodus für den Schritt "Solution Perspective":
- Korrigiere aktiv die linke Seite des Canvas.
- Verschiebe fehlplatzierte Inhalte in Solutions, Information, Functions oder Benefits.
- Ergänze nur klar notwendige Sticky Notes, um offensichtliche Lücken zu schließen.
- Ergänze Connectoren nur dort, wo eine konkrete Ableitungs- oder Unterstützungsbeziehung klar fehlt.
- Verbinde alternative Solutions standardmäßig nicht miteinander.
- Bleibe auf Use-Case-Ebene und erfinde keine komplexen Systemarchitekturen.
- Wenn vorhandene Connectoren bereits zu dicht wirken, benenne das im feedback statt weitere hinzuzufügen.
- Erkläre in feedback, welche Korrekturen du vorgenommen hast und ob der Fit-Check-Schritt sinnvoll ist.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "selection.review", `Reviewmodus für den Schritt "Solution Perspective":
- Beurteile die Relevanz, Präzision und Nutzennähe der Lösungsperspektive.
- Prüfe, ob die linke Seite wirklich aus dem Problemraum abgeleitet ist und nicht zu früh in generische Technologie springt.
- Nimm standardmäßig keine Board-Mutationen vor.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "selection.synthesize", `Synthesemodus für den Schritt "Solution Perspective":
- Verdichte, welche Lösungsmuster, Informationsbedarfe, Funktionen und Benefits bereits sichtbar sind.
- Hebe hervor, welche Ableitungsketten bereits belastbar sind und wo Benefits noch zu lose bleiben.
- Fokus auf übergreifende Einsichten, nicht auf Mutationen oder zusätzliche Connectoren.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "selection.coach", `Coachmodus für den Schritt "Solution Perspective":
- Erkläre klar den Unterschied zwischen Solutions, Information, Functions und Benefits.
- Hilf dabei, aus Decisions & Actions sinnvolle Information und Functions und aus Pains/Gains tragfähige Benefits abzuleiten.
- Nutze vorhandene Stickies als Ausgangspunkt und schlage genau einen sinnvollen Mikroschritt vor.
- actions sollen normalerweise leer bleiben.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "selection.grade", `Bewertungsmodus für den Schritt "Solution Perspective":
- Bewerte die linke Seite anhand der Kriterien Solution Relevance, Information Quality, Function Usefulness, Benefit Strength, Cross-Side Traceability und sparsame Connector-Nutzung.
- Führe keine oder praktisch keine Board-Mutationen aus.
- Liefere zusätzlich eine evaluation mit Rubrik.
- Werte fehlende Vollvernetzung nicht negativ, solange die wichtigsten Ableitungsketten plausibel sind.
- Wenn die Lösungsperspektive tragfähig genug ist, kannst du den passenden nächsten Button per flowControlDirectives freischalten.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "global.check", `Globaler Prüfmodus für den Schritt "Solution Perspective":
- Prüfe über alle relevanten Instanzen hinweg, ob die Lösungsperspektiven nachvollziehbar aus der Nutzerperspektive abgeleitet sind.
- Benenne, wo Varianten sauber gesammelt sind, wo Information/Functions fehlen und wo Benefits ohne klare Ableitung bleiben.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "global.hint", `Globaler Hinweismodus für den Schritt "Solution Perspective":
- Gib globale Hinweise zu fehlenden Solution-Varianten, Informationsbedarfen, vagen Funktionen und schwachen Benefits.
- Mache deutlich, auf welcher Teilaufgabe die Teams als Nächstes arbeiten sollten.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "global.autocorrect", `Globaler Autokorrekturmodus für den Schritt "Solution Perspective":
- Korrigiere selektionsunabhängig über alle relevanten Instanzen hinweg eindeutige Probleme der linken Seite.
- Ergänze Connectoren nur dort, wo klare Ableitungs- oder Unterstützungsbeziehungen fehlen; vermeide globale Vollvernetzung.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "global.review", `Globaler Reviewmodus für den Schritt "Solution Perspective":
- Führe einen qualitativen Gesamt-Review über alle relevanten Lösungsperspektiven durch.
- Fokus: Relevanz, Lesbarkeit, Ableitung aus der Nutzerperspektive, Variantendenken und sparsame Traceability.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "global.synthesize", `Globaler Synthesemodus für den Schritt "Solution Perspective":
- Verdichte die wichtigsten Lösungs-, Informations-, Funktions- und Benefit-Muster über alle relevanten Instanzen hinweg.
- Hebe hervor, welche Ableitungslogiken sich wiederholen und wo Benefits oder Funktionen noch zu generisch bleiben.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "global.coach", `Globaler Coachmodus für den Schritt "Solution Perspective":
- Gib dem Team eine klare Anleitung für die nächste übergreifende Ausarbeitung der Lösungsperspektive.
- Sage, ob zuerst Varianten, Information, Functions oder Benefits vertieft werden sollten.`);

  setTriggerPrompt(pack, "step2_solution_perspective", "global.grade", `Globaler Bewertungsmodus für den Schritt "Solution Perspective":
- Bewerte die Gesamtqualität der Lösungsperspektiven über alle relevanten Instanzen.
- Berücksichtige Relevanz, Informationsqualität, Funktionsnutzwert, Benefit-Stärke, Cross-Side Traceability und sparsame Connector-Nutzung.
- Liefere zusätzlich eine evaluation mit Rubrik.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "selection.check", `Prüfmodus für den Schritt "Fit Check & Synthesis":
- Prüfe die Konsistenz zwischen rechter und linker Seite.
- Prüfe, ob Benefits tatsächlich Pains reduzieren, Gains verstärken oder Entscheidungen, Handlungen, Ergebnisse und Ziele unterstützen.
- Prüfe über wenige belastbare Fit-Ketten statt über Vollvernetzung.
- Das Feld Check dient der Verdichtung des Problem-Solution-Fit und nicht dem Aufbau eines zweiten Graphen.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "selection.hint", `Hinweismodus für den Schritt "Fit Check & Synthesis":
- Gib knappe Hinweise, wie der Problem-Solution-Fit klarer und belastbarer formuliert werden kann.
- Zeige lieber, welche 1 bis 3 Fit-Ketten tragfähig sind oder noch fehlen, statt neue Vernetzung zu fordern.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "selection.autocorrect", `Autokorrekturmodus für den Schritt "Fit Check & Synthesis":
- Korrigiere aktiv klare Inkonsistenzen zwischen rechter und linker Seite.
- Ergänze bei Bedarf kleine Präzisierungen im Check-Feld und höchstens wenige, eindeutige Fit-Connectoren.
- Keine große Restrukturierung des Canvas und keine künstliche Vollvernetzung.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "selection.review", `Reviewmodus für den Schritt "Fit Check & Synthesis":
- Führe einen qualitativen Review des Problem-Solution-Fit durch.
- Prüfe, welche Benefits belastbar adressiert sind, wo Fit nur behauptet wird und wo noch Vorarbeit aus Step 1 oder Step 2 fehlt.
- Nimm standardmäßig keine Board-Mutationen vor.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "selection.synthesize", `Synthesemodus für den Schritt "Fit Check & Synthesis":
- Verdichte die selektierte Instanz oder die selektierten Instanzen und mache den Problem-Solution-Fit sichtbar.
- Formuliere pro Instanz 1 bis 3 knappe Fit-Aussagen für das Feld Check.
- In diesem Trigger darfst du begrenzte Mutationen durchführen: bis zu drei neue Sticky Notes im Feld Check und höchstens wenige validierte ergänzende Connectoren.
- Nimm keine große Restrukturierung des restlichen Canvas vor.
- Liefere feedback, das die Verdichtung erklärt. Nutze flowControlDirectives nur dann, wenn didaktisch weitere Buttons freigeschaltet oder als erledigt markiert werden sollen.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "selection.coach", `Coachmodus für den Schritt "Fit Check & Synthesis":
- Erkläre, wie aus Nutzerperspektive und Lösungsperspektive belastbare Fit-Aussagen im Feld Check formuliert werden.
- Hilf dem Team, wenige belastbare Fit-Ketten zu erkennen statt alles miteinander zu verbinden.
- actions sollen normalerweise leer bleiben.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "selection.grade", `Bewertungsmodus für den Schritt "Fit Check & Synthesis":
- Bewerte den Problem-Solution-Fit anhand der Kriterien Fit Clarity, Fit Evidence, Consistency, Actionability und Overall Coherence.
- Berücksichtige dabei, ob die Fit-Logik über wenige belastbare Ketten statt über künstliche Vollvernetzung gezeigt wird.
- Führe keine oder praktisch keine Board-Mutationen aus.
- Liefere zusätzlich eine evaluation mit Rubrik.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "global.check", `Globaler Prüfmodus für den Schritt "Fit Check & Synthesis":
- Prüfe über alle aktiven Instanzen hinweg, wo Problem-Solution-Fit bereits klar ist und wo noch Schwächen bestehen.
- Hebe hervor, wo Teams belastbare Fit-Ketten zeigen und wo sie entweder zu früh verdichten oder zu stark vernetzen.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "global.hint", `Globaler Hinweismodus für den Schritt "Fit Check & Synthesis":
- Gib globale Hinweise, wo Fit-Aussagen fehlen oder die Konsistenz noch nicht überzeugend ist.
- Zeige, ob eher Step 1 oder Step 2 weiter vertieft werden sollte, bevor weiter verdichtet wird.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "global.autocorrect", `Globaler Autokorrekturmodus für den Schritt "Fit Check & Synthesis":
- Korrigiere nur klare globale Inkonsistenzen oder fehlende Verdichtungen mit Bedacht.
- Ergänze höchstens wenige validierte Fit-Kanten und vermeide globale Vollvernetzung.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "global.review", `Globaler Reviewmodus für den Schritt "Fit Check & Synthesis":
- Prüfe alle aktiven Instanzen dieses Exercise Packs im Zusammenhang.
- Ziel ist ein qualitativer Gesamt-Review: Welche Instanzen haben einen klaren Problem-Solution-Fit, wo sind Nutzerperspektiven zu vage, wo sind Lösungen zu allgemein oder nicht ausreichend an Entscheidungen und Handlungen gekoppelt, wo wird zu früh verdichtet und wo zeigt sich Over-Connecting?
- Dieser Trigger dient primär Analyse und feedback; nimm normalerweise keine oder nur minimale Board-Mutationen vor.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "global.synthesize", `Globaler Synthesemodus für den Schritt "Fit Check & Synthesis":
- Verdichte alle aktiven Instanzen dieses Exercise Packs zu einer übergreifenden Synthese.
- Suche nach wiederkehrenden Nutzerzielen, Pains, Entscheidungs- und Handlungsmustern, Informations- und Funktionsmustern, Benefits und Fit-Lücken.
- Hebe hervor, welche Fit-Ketten sich über mehrere Instanzen wiederholen und wo Boards eher unter- oder überstrukturiert sind.
- Dieser Trigger dient primär der übergreifenden Zusammenfassung und dem feedback, nicht der massiven Board-Manipulation.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "global.coach", `Globaler Coachmodus für den Schritt "Fit Check & Synthesis":
- Gib dem Team eine klare Anleitung, ob es vertiefen, korrigieren oder abschließen sollte.
- Sage, ob zuerst Problemraum, Lösungsperspektive oder Check-Verdichtung reifer gemacht werden muss.`);

  setTriggerPrompt(pack, "step3_fit_check_and_synthesis", "global.grade", `Globaler Bewertungsmodus für den Schritt "Fit Check & Synthesis":
- Bewerte die Gesamtqualität des Problem-Solution-Fit über alle relevanten Instanzen.
- Berücksichtige dabei Fit Clarity, Fit Evidence, Consistency, Actionability, Overall Coherence und angemessene Sparsamkeit bei Connectoren.
- Liefere zusätzlich eine evaluation mit Rubrik.`);

  return catalog;
}

function createBatch7MethodCatalog(rawCatalog) {
  const cloned = cloneJson(rawCatalog);
  applyAnalyticsUseCaseBatch7Patch(cloned);
  return deepFreeze(cloned);
}

export const METHOD_CATALOG = createBatch7MethodCatalog(RAW_METHOD_CATALOG);

const exercisePacks = {};
const packTemplates = {};
const runProfiles = {};
const promptModules = {};

for (const [packId, packDef] of Object.entries(METHOD_CATALOG.packs || {})) {
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

export function listExercisePacks(options = {}) {
  const lang = getMethodLanguage(options);
  return sortByLabel(Object.values(EXERCISE_PACKS).map((pack) => localizeExercisePackProjection(pack, lang)));
}

export function getExercisePackById(id, options = {}) {
  const normalizedId = normalizeExercisePackId(id);
  const pack = normalizedId ? EXERCISE_PACKS[normalizedId] : null;
  return localizeExercisePackProjection(pack, getMethodLanguage(options));
}

export function getPackDefaults(packOrId) {
  const pack = getRawExercisePack(packOrId);
  const defaults = (pack?.defaults && typeof pack.defaults === "object") ? pack.defaults : {};

  return {
    feedbackChannel: asNonEmptyString(defaults.feedbackChannel) || DT_DEFAULT_FEEDBACK_CHANNEL,
    userMayChangePack: defaults.userMayChangePack === true,
    userMayChangeStep: defaults.userMayChangeStep === true,
    appAdminPolicy: asNonEmptyString(defaults.appAdminPolicy) || DT_DEFAULT_APP_ADMIN_POLICY
  };
}

export function getAllowedCanvasTypesForPack(packOrId) {
  const pack = getRawExercisePack(packOrId);
  if (!pack || !Array.isArray(pack.allowedCanvasTypes)) return [];
  return normalizeUniqueStrings(pack.allowedCanvasTypes);
}

export function getDefaultCanvasTypeIdForPack(packOrId) {
  const pack = getRawExercisePack(packOrId);
  const explicit = asNonEmptyString(pack?.defaultCanvasTypeId);
  if (explicit) return explicit;
  const allowed = getAllowedCanvasTypesForPack(pack);
  return allowed[0] || null;
}

export function listExerciseSteps(packOrId, options = {}) {
  const pack = getRawExercisePack(packOrId);
  if (!pack?.steps || typeof pack.steps !== "object") return [];
  const lang = getMethodLanguage(options);

  return Object.values(pack.steps)
    .filter((step) => step && typeof step === "object" && asNonEmptyString(step.id))
    .map((step) => localizeExerciseStepProjection(step, pack.id, lang))
    .slice()
    .sort((a, b) => {
      const aOrder = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" });
    });
}

export function getExerciseStep(packOrId, stepId, options = {}) {
  const pack = getRawExercisePack(packOrId);
  const normalizedStepId = asNonEmptyString(stepId);
  if (!pack || !normalizedStepId || !pack.steps || typeof pack.steps !== "object") return null;
  const step = pack.steps[normalizedStepId];
  return step && typeof step === "object"
    ? localizeExerciseStepProjection(step, pack.id, getMethodLanguage(options))
    : null;
}

export function getDefaultStepId(packOrId) {
  const pack = getRawExercisePack(packOrId);
  const explicit = asNonEmptyString(pack?.defaultStepId);
  if (explicit && getExerciseStep(pack, explicit)) return explicit;
  const firstStep = listExerciseSteps(pack)[0];
  return firstStep?.id || null;
}

export function getNextExerciseStep(packOrId, currentStepId, options = {}) {
  const steps = listExerciseSteps(packOrId, options);
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

export function listPackTemplates(options = {}) {
  const lang = getMethodLanguage(options);
  return sortByLabel(Object.values(PACK_TEMPLATES).map((pack) => localizePackTemplateProjection(pack, lang)));
}

export function getPackTemplateById(id, options = {}) {
  const normalizedId = asNonEmptyString(id);
  const packTemplate = normalizedId && PACK_TEMPLATES[normalizedId] ? PACK_TEMPLATES[normalizedId] : null;
  return localizePackTemplateProjection(packTemplate, getMethodLanguage(options));
}

export function listStepTemplatesForPack(packOrId, options = {}) {
  const pack = getRawPackTemplate(packOrId);
  const steps = Object.values((pack?.stepTemplates && typeof pack.stepTemplates === "object") ? pack.stepTemplates : {});
  const lang = getMethodLanguage(options);
  return steps
    .map((step) => localizeStepTemplateProjection(step, pack?.id || null, lang))
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: "base" }));
}

export function getStepTemplateForPack(packOrId, stepId, options = {}) {
  const pack = getRawPackTemplate(packOrId);
  const normalizedStepId = asNonEmptyString(stepId);
  if (!pack || !normalizedStepId) return null;
  const stepTemplate = pack.stepTemplates?.[normalizedStepId] || null;
  return localizeStepTemplateProjection(stepTemplate, pack.id, getMethodLanguage(options));
}

export function listRunProfilesForPack(packOrId, options = {}) {
  const pack = getRawPackTemplate(packOrId);
  if (!pack) return [];

  const stepTemplateId = asNonEmptyString(options?.stepTemplateId);
  const lang = getMethodLanguage(options);
  const profiles = normalizeUniqueStrings(pack.runProfileIds)
    .map((id) => RUN_PROFILES[id])
    .filter(Boolean)
    .filter((profile) => !stepTemplateId || profile.stepTemplateId === stepTemplateId)
    .map((profile) => localizeRunProfileProjection(profile, lang));

  return profiles.slice().sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: "base" }));
}

export function getRunProfileById(id, options = {}) {
  const normalizedId = asNonEmptyString(id);
  const profile = normalizedId && RUN_PROFILES[normalizedId] ? RUN_PROFILES[normalizedId] : null;
  return localizeRunProfileProjection(profile, getMethodLanguage(options));
}

export function getPromptModuleById(id, options = {}) {
  const normalizedId = asNonEmptyString(id);
  const moduleProjection = normalizedId && PROMPT_MODULES[normalizedId] ? PROMPT_MODULES[normalizedId] : null;
  return localizePromptModuleProjection(moduleProjection, getMethodLanguage(options));
}

export function getPromptModulesByIds(ids, options = {}) {
  const lang = getMethodLanguage(options);
  return normalizeUniqueStrings(ids)
    .map((id) => PROMPT_MODULES[id])
    .filter(Boolean)
    .map((moduleProjection) => localizePromptModuleProjection(moduleProjection, lang));
}
