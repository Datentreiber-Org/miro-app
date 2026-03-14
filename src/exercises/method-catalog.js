import {
  DT_DEFAULT_APP_ADMIN_POLICY,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_EXECUTION_MODES
} from "../config.js?v=20260313-patch11-chatpatch1";

import { METHOD_I18N_OVERRIDES } from "../i18n/catalog.js?v=20260313-patch11-chatpatch1";
import { normalizeUiLanguage, pickLocalized } from "../i18n/index.js?v=20260313-patch11-chatpatch1";

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStringArray(values) {
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

function normalizeAllowedExecutionModes(values, fallback = ["none"]) {
  const normalized = normalizeStringArray(values).filter((value) => DT_EXECUTION_MODES.includes(value));
  if (normalized.length) return normalized;
  const normalizedFallback = normalizeStringArray(fallback).filter((value) => DT_EXECUTION_MODES.includes(value));
  return normalizedFallback.length ? normalizedFallback : ["none"];
}

function resolveI18nText(value, lang = "de") {
  if (value == null) return null;
  if (typeof value === "string") return asNonEmptyString(value);
  if (typeof value !== "object") return null;
  return asNonEmptyString(pickLocalized(value, normalizeUiLanguage(lang)));
}

function resolveDefaultStepId(rawPack, steps) {
  const preferred = asNonEmptyString(rawPack?.defaultStepId);
  if (preferred && Array.isArray(steps) && steps.some((step) => step?.id === preferred)) return preferred;
  return Array.isArray(steps) && steps.length ? steps[0].id : null;
}

const EXTRA_STICKY_MUTATION_ACTIONS = Object.freeze(["set_sticky_color", "set_check_status"]);

function augmentAllowedActions(values) {
  const base = normalizeStringArray(values);
  if (!base.some((value) => ["create_sticky", "move_sticky", "delete_sticky"].includes(value))) {
    return base;
  }
  return normalizeStringArray([...base, ...EXTRA_STICKY_MUTATION_ACTIONS]);
}

function normalizeFeedbackPolicy(value, fallback = "text") {
  const normalized = asNonEmptyString(value);
  return normalized || fallback;
}

function normalizeMutationPolicy(value, fallback = "none") {
  const normalized = asNonEmptyString(value);
  return normalized || fallback;
}

function normalizeSurfaceGroup(value) {
  const normalized = asNonEmptyString(value);
  if (["primary", "secondary", "proposal", "hidden"].includes(normalized)) return normalized;
  return "hidden";
}

function normalizeSurfaceChannel(value) {
  const normalized = asNonEmptyString(value);
  if (["board_button", "chat_submit", "chat_apply", "hidden"].includes(normalized)) return normalized;
  return "hidden";
}

function normalizeScopeMode(value) {
  const normalized = asNonEmptyString(value);
  if (["selection", "current", "pack", "board"].includes(normalized)) return normalized;
  return "selection";
}

function normalizeTransitions(transitions) {
  return (Array.isArray(transitions) ? transitions : [])
    .map((transition) => ({
      toStepId: asNonEmptyString(transition?.toStepId),
      requiredDoneEndpointIds: Object.freeze(normalizeStringArray(transition?.requiredDoneEndpointIds)),
      requiredMemoryStepStatus: asNonEmptyString(transition?.requiredMemoryStepStatus) || null
    }))
    .filter((transition) => !!transition.toStepId);
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

function getEndpointOverride(endpointId) {
  return METHOD_I18N_OVERRIDES.endpoints?.[endpointId] || null;
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
    summary: applyLocalizedField(step.summary, override.summary, normalizedLang),
    visibleInstruction: applyLocalizedField(step.visibleInstruction, override.visibleInstruction, normalizedLang),
    flowInstruction: applyLocalizedField(step.flowInstruction, override.flowInstruction || override.instruction, normalizedLang),
    stateModelText: applyLocalizedField(step.stateModelText, override.stateModelText, normalizedLang),
    exitCriteriaText: applyLocalizedField(step.exitCriteriaText, override.exitCriteriaText, normalizedLang)
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
    description: applyLocalizedField(pack.description, override.description, normalizedLang),
    globalPrompt: applyLocalizedField(pack.globalPrompt, override.globalPrompt, normalizedLang),
    didacticGlobalPrompt: applyLocalizedField(pack.didacticGlobalPrompt, override.didacticGlobalPrompt, normalizedLang),
    steps: Object.freeze((Array.isArray(pack.steps) ? pack.steps : []).map((step) => localizeExerciseStepProjection(step, pack.id, normalizedLang)))
  });
}

function localizeEndpointProjection(endpoint, lang = "de") {
  const normalizedLang = normalizeUiLanguage(lang);
  if (!endpoint || normalizedLang === "de") return endpoint;
  const override = getEndpointOverride(endpoint.id);
  if (!override) return endpoint;
  return Object.freeze({
    ...endpoint,
    label: applyLocalizedField(endpoint.label, override.label, normalizedLang),
    summary: applyLocalizedField(endpoint.summary, override.summary, normalizedLang),
    prompt: Object.freeze({
      ...endpoint.prompt,
      text: applyLocalizedField(endpoint.prompt?.text, override.promptText || override.text, normalizedLang)
    })
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

function buildExerciseStepProjection(rawStep, rawPack, { lang = "de", order = 0 } = {}) {
  const endpoints = Array.isArray(rawStep?.endpoints) ? rawStep.endpoints : [];
  return Object.freeze({
    id: asNonEmptyString(rawStep?.id),
    exercisePackId: asNonEmptyString(rawPack?.exercisePackId) || asNonEmptyString(rawPack?.id),
    order: Number.isFinite(Number(order)) ? Number(order) : 0,
    label: resolveI18nText(rawStep?.label, lang) || asNonEmptyString(rawStep?.id),
    summary: resolveI18nText(rawStep?.summary, lang),
    visibleInstruction: resolveI18nText(rawStep?.visibleInstruction, lang),
    flowInstruction: resolveI18nText(rawStep?.flowInstruction, lang),
    stateModelText: resolveI18nText(rawStep?.stateModelText, lang),
    exitCriteriaText: resolveI18nText(rawStep?.exitCriteriaText, lang),
    endpointIds: Object.freeze(normalizeStringArray(endpoints.map((endpoint) => endpoint?.id))),
    transitions: Object.freeze(normalizeTransitions(rawStep?.transitions))
  });
}

function buildEndpointProjection(rawEndpoint, rawStep, rawPack, { lang = "de" } = {}) {
  const endpoint = Object.freeze({
    id: asNonEmptyString(rawEndpoint?.id),
    exercisePackId: asNonEmptyString(rawPack?.exercisePackId) || asNonEmptyString(rawPack?.id),
    stepId: asNonEmptyString(rawStep?.id),
    familyKey: asNonEmptyString(rawEndpoint?.familyKey) || null,
    label: resolveI18nText(rawEndpoint?.label, lang),
    summary: resolveI18nText(rawEndpoint?.summary, lang),
    scope: Object.freeze({
      mode: normalizeScopeMode(rawEndpoint?.scope?.mode),
      allowedCanvasTypeIds: Object.freeze(normalizeStringArray(rawEndpoint?.scope?.allowedCanvasTypeIds || rawPack?.allowedCanvasTypeIds))
    }),
    prompt: Object.freeze({
      text: resolveI18nText(rawEndpoint?.prompt?.text, lang) || "",
      moduleIds: Object.freeze(normalizeStringArray(rawEndpoint?.prompt?.moduleIds))
    }),
    run: Object.freeze({
      mutationPolicy: normalizeMutationPolicy(rawEndpoint?.run?.mutationPolicy),
      feedbackPolicy: normalizeFeedbackPolicy(rawEndpoint?.run?.feedbackPolicy),
      allowedExecutionModes: Object.freeze(normalizeAllowedExecutionModes(rawEndpoint?.run?.allowedExecutionModes)),
      allowedActions: Object.freeze(augmentAllowedActions(rawEndpoint?.run?.allowedActions))
    }),
    surface: Object.freeze({
      channel: normalizeSurfaceChannel(rawEndpoint?.surface?.channel),
      group: normalizeSurfaceGroup(rawEndpoint?.surface?.group),
      sidecarOnly: Boolean(rawEndpoint?.surface?.sidecarOnly),
      seedByDefault: Boolean(rawEndpoint?.surface?.seedByDefault)
    }),
    order: Number.isFinite(Number(rawEndpoint?.order)) ? Number(rawEndpoint.order) : 0
  });
  return localizeEndpointProjection(endpoint, lang);
}

function buildExercisePackProjection(packDef, { lang = "de" } = {}) {
  const rawSteps = Object.entries((packDef?.steps && typeof packDef.steps === "object") ? packDef.steps : {});
  const steps = rawSteps.map(([stepId, stepDef], index) => buildExerciseStepProjection({ id: stepId, ...stepDef }, packDef, { lang, order: (index + 1) * 10 }));
  const projection = Object.freeze({
    id: asNonEmptyString(packDef?.exercisePackId) || asNonEmptyString(packDef?.id),
    label: resolveI18nText(packDef?.label, lang),
    version: Number.isFinite(Number(packDef?.version)) ? Number(packDef.version) : 1,
    description: resolveI18nText(packDef?.description, lang),
    boardMode: asNonEmptyString(packDef?.boardMode) || "exercise",
    allowedCanvasTypeIds: Object.freeze(normalizeStringArray(packDef?.allowedCanvasTypeIds)),
    defaultCanvasTypeId: asNonEmptyString(packDef?.defaultCanvasTypeId),
    defaultStepId: resolveDefaultStepId(packDef, steps),
    defaults: Object.freeze({
      feedbackChannel: asNonEmptyString(packDef?.defaults?.feedbackChannel) || DT_DEFAULT_FEEDBACK_CHANNEL,
      userMayChangePack: packDef?.defaults?.userMayChangePack === true,
      userMayChangeStep: packDef?.defaults?.userMayChangeStep === true,
      appAdminPolicy: asNonEmptyString(packDef?.defaults?.appAdminPolicy) || DT_DEFAULT_APP_ADMIN_POLICY
    }),
    globalPrompt: resolveI18nText(packDef?.globalPrompt, lang) || "",
    didacticGlobalPrompt: resolveI18nText(packDef?.didacticGlobalPrompt, lang) || "",
    steps: Object.freeze(steps)
  });
  return localizeExercisePackProjection(projection, lang);
}

function buildPromptModuleProjection(moduleDef, lang = "de") {
  return Object.freeze({
    id: asNonEmptyString(moduleDef?.id),
    label: resolveI18nText(moduleDef?.label, lang),
    summary: resolveI18nText(moduleDef?.summary, lang),
    prompt: resolveI18nText(moduleDef?.prompt, lang) || ""
  });
}

function compareEndpointOrder(a, b) {
  const aOrder = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
  const bOrder = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" });
}

const RAW_METHOD_CATALOG = deepFreeze(JSON.parse(String.raw`{
  "version": 1,
  "packs": {
    "persona-basics-v1": {
      "exercisePackId": "persona-basics-v1",
      "label": {
        "de": "Persona Basics"
      },
      "version": 2,
      "description": {
        "de": "Geführte Persona-Übung auf dem Datentreiber-3-Boxes-Canvas."
      },
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
      "globalPrompt": {
        "de": "Auf diesem Board läuft die Übung \"Persona Basics\".\n\nÜbergeordnetes Ziel:\n- Arbeite persona-orientiert.\n- Jede Persona soll als zusammenhängende Einheit lesbar bleiben.\n- Das Board soll methodisch sauber bleiben: Inhalte präzisieren, unklare Einträge konkretisieren, Lücken sichtbar machen und offensichtliche Fehlzuordnungen korrigieren.\n- Nutze Connectoren, wenn Inhalte innerhalb einer Persona logisch zusammengehören. Vermeide Verbindungen zwischen verschiedenen Personas, außer die Aufgabe verlangt es ausdrücklich.\n\nLeitregel:\n- Behandle die sichtbaren Canvas als methodische Arbeitsflächen, nicht als freie Notizzettel.\n- Prüfe stets, ob die Inhalte dem aktuellen Schritt und der Übungslogik entsprechen.\n- Nutze den aktuellen Übungsschritt aus exerciseContext verbindlich."
      },
      "promptModules": {},
      "steps": {
        "collect_personas": {
          "id": "collect_personas",
          "label": {
            "de": "Personas anlegen"
          },
          "visibleInstruction": {
            "de": "Lege pro Persona eine lesbare Kette aus Name (links), Tätigkeit (Mitte) und Erwartung (rechts) an."
          },
          "endpoints": [
            {
              "id": "persona-basics-v1.collect_personas.global.autocorrect",
              "familyKey": "global.autocorrect",
              "label": {
                "de": "global.autocorrect"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Autokorrekturmodus für den Schritt \"Personas anlegen\":\n- Korrigiere selektionsunabhängig über alle relevanten Canvas hinweg.\n- Halte jede Persona als getrennte Einheit lesbar."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.global.check",
              "familyKey": "global.check",
              "label": {
                "de": "global.check"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Prüfmodus für den Schritt \"Personas anlegen\":\n- Prüfe über alle relevanten Canvas hinweg, ob konsistente Persona-Strukturen vorhanden sind.\n- Markiere globale Lücken oder Inkonsistenzen.\n- Nimm nur dann Mutationen vor, wenn sie eindeutig sinnvoll sind."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.global.coach",
              "familyKey": "global.coach",
              "label": {
                "de": "global.coach"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Coachmodus für den Schritt \"Personas anlegen\":\n- Gib dem Team eine klare Anleitung, wie es übergreifend weiterarbeiten soll.\n- Fokus auf nächste methodische Schritte, nicht auf Bewertung."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.global.grade",
              "familyKey": "global.grade",
              "label": {
                "de": "global.grade"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Bewertungsmodus für den Schritt \"Personas anlegen\":\n- Bewerte die Gesamtqualität des bisherigen Boards für diesen Schritt.\n- Liefere zusätzlich eine evaluation mit Rubrik."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.global.hint",
              "familyKey": "global.hint",
              "label": {
                "de": "global.hint"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Hinweismodus für den Schritt \"Personas anlegen\":\n- Gib globale Hinweise über alle relevanten Canvas hinweg.\n- Bevorzuge feedback und memoryEntry; handle Board-Mutationen sehr sparsam."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.global.review",
              "familyKey": "global.review",
              "label": {
                "de": "global.review"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Reviewmodus für den Schritt \"Personas anlegen\":\n- Führe einen qualitativen Board-Review über alle relevanten Canvas durch.\n- Fokus: Konsistenz, Lesbarkeit, fehlende Persona-Bestandteile."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.global.synthesize",
              "familyKey": "global.synthesize",
              "label": {
                "de": "global.synthesize"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Synthesemodus für den Schritt \"Personas anlegen\":\n- Fasse die übergreifenden Muster der Personas über alle relevanten Canvas zusammen.\n- Keine Standard-Mutationen; Fokus auf Verdichtung und Erkenntnisse."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.selection.autocorrect",
              "familyKey": "selection.autocorrect",
              "label": {
                "de": "selection.autocorrect"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Autokorrekturmodus für den Schritt \"Personas anlegen\":\n- Fehlende oder falsch platzierte Persona-Elemente dürfen aktiv korrigiert werden.\n- Stelle eine saubere Persona-Kettenstruktur auf dem Board her."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.selection.check",
              "familyKey": "selection.check",
              "label": {
                "de": "selection.check"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Prüfmodus für den Schritt \"Personas anlegen\":\n- Bewerte, ob pro Persona eine vollständige Dreierstruktur vorhanden ist.\n- Markiere fehlende oder unscharfe Elemente als offene Punkte im memoryEntry.\n- Nimm nur dann Board-Mutationen vor, wenn sie zur Korrektur ausdrücklich erwünscht oder offensichtlich nötig sind."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.selection.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "selection.coach"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Coachmodus für den Schritt \"Personas anlegen\":\n- Erkläre didaktisch, worauf das Team als Nächstes achten sollte.\n- Formuliere konkrete nächste Schritte für die Arbeit an den selektierten Canvas.\n- Nimm standardmäßig keine Board-Mutationen vor."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.selection.grade",
              "familyKey": "selection.grade",
              "label": {
                "de": "selection.grade"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Bewertungsmodus für den Schritt \"Personas anlegen\":\n- Bewerte die selektierten Canvas gegen die Kriterien Vollständigkeit, korrekte Zuordnung und Lesbarkeit.\n- Liefere zusätzlich eine evaluation mit Rubrik.\n- Nimm standardmäßig keine Board-Mutationen vor."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.selection.hint",
              "familyKey": "selection.hint",
              "label": {
                "de": "selection.hint"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Hinweismodus für den Schritt \"Personas anlegen\":\n- Gib möglichst wenig invasive Unterstützung.\n- Bevorzuge analysis, feedback und memoryEntry.\n- Setze nur dann Board-Aktionen ein, wenn ein konkreter, kleiner Hilfsschritt sinnvoll ist."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.selection.review",
              "familyKey": "selection.review",
              "label": {
                "de": "selection.review"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Reviewmodus für den Schritt \"Personas anlegen\":\n- Beurteile die Qualität und Lesbarkeit der Persona-Strukturen.\n- Gib klares feedback zu Vollständigkeit, Verständlichkeit und methodischer Sauberkeit.\n- Nimm standardmäßig keine Board-Mutationen vor."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.collect_personas.selection.synthesize",
              "familyKey": "selection.synthesize",
              "label": {
                "de": "selection.synthesize"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Synthesemodus für den Schritt \"Personas anlegen\":\n- Verdichte, was die selektierten Personas gemeinsam zeigen.\n- Hebe Muster, Unterschiede und übergreifende Einsichten hervor.\n- Nimm standardmäßig keine Board-Mutationen vor."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            }
          ],
          "transitions": [
            {
              "toStepId": "refine_personas",
              "requiredDoneEndpointIds": [],
              "requiredMemoryStepStatus": null
            }
          ]
        },
        "refine_personas": {
          "id": "refine_personas",
          "label": {
            "de": "Personas schärfen"
          },
          "visibleInstruction": {
            "de": "Präzisiere Tätigkeiten und Erwartungshaltungen. Vage Formulierungen sollen konkreter werden."
          },
          "endpoints": [
            {
              "id": "persona-basics-v1.refine_personas.global.autocorrect",
              "familyKey": "global.autocorrect",
              "label": {
                "de": "global.autocorrect"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Autokorrekturmodus für den Schritt \"Personas schärfen\":\n- Korrigiere selektionsunabhängig über alle relevanten Canvas hinweg.\n- Präzisiere Inhalte dort, wo es methodisch eindeutig sinnvoll ist."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.global.check",
              "familyKey": "global.check",
              "label": {
                "de": "global.check"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Prüfmodus für den Schritt \"Personas schärfen\":\n- Prüfe über alle relevanten Canvas hinweg, ob Tätigkeiten und Erwartungen konsistent präzisiert wurden.\n- Markiere globale Lücken und Unschärfen."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.global.coach",
              "familyKey": "global.coach",
              "label": {
                "de": "global.coach"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Coachmodus für den Schritt \"Personas schärfen\":\n- Gib dem Team eine klare Anleitung für den nächsten übergreifenden Arbeitsschritt."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.global.grade",
              "familyKey": "global.grade",
              "label": {
                "de": "global.grade"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Bewertungsmodus für den Schritt \"Personas schärfen\":\n- Bewerte die Gesamtqualität des Boards für diesen Schritt.\n- Liefere zusätzlich eine evaluation mit Rubrik."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.global.hint",
              "familyKey": "global.hint",
              "label": {
                "de": "global.hint"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Hinweismodus für den Schritt \"Personas schärfen\":\n- Gib globale Hinweise zu Unschärfen, Redundanzen und fehlender Präzision."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.global.review",
              "familyKey": "global.review",
              "label": {
                "de": "global.review"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Reviewmodus für den Schritt \"Personas schärfen\":\n- Führe einen qualitativen Gesamtreview über alle relevanten Canvas durch.\n- Fokus: Reifegrad, Klarheit, Vergleichbarkeit."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.global.synthesize",
              "familyKey": "global.synthesize",
              "label": {
                "de": "global.synthesize"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Synthesemodus für den Schritt \"Personas schärfen\":\n- Verdichte die wichtigsten Persona-Erkenntnisse über alle relevanten Canvas hinweg."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.selection.autocorrect",
              "familyKey": "selection.autocorrect",
              "label": {
                "de": "selection.autocorrect"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Autokorrekturmodus für den Schritt \"Personas schärfen\":\n- Unklare Tätigkeiten oder Erwartungen dürfen konkretisiert, verschoben oder ergänzt werden.\n- Halte die Persona-Struktur stabil."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.selection.check",
              "familyKey": "selection.check",
              "label": {
                "de": "selection.check"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Prüfmodus für den Schritt \"Personas schärfen\":\n- Beurteile, ob Tätigkeiten und Erwartungen bereits konkret genug sind.\n- Erfasse offene Punkte im memoryEntry.\n- Mutationen nur, wenn sie zur Korrektur sinnvoll und vertretbar sind."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.selection.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "selection.coach"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Coachmodus für den Schritt \"Personas schärfen\":\n- Erkläre, wie die Präzisierung der Inhalte sinnvoll weitergeführt werden sollte.\n- Formuliere klare nächste Arbeitsimpulse."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.selection.grade",
              "familyKey": "selection.grade",
              "label": {
                "de": "selection.grade"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Bewertungsmodus für den Schritt \"Personas schärfen\":\n- Bewerte die selektierten Canvas gegen die Kriterien Präzision, methodische Passung und Lesbarkeit.\n- Liefere zusätzlich eine evaluation mit Rubrik."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.selection.hint",
              "familyKey": "selection.hint",
              "label": {
                "de": "selection.hint"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Hinweismodus für den Schritt \"Personas schärfen\":\n- Gib prägnante Verbesserungshinweise.\n- Nutze Board-Mutationen sparsam."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.selection.review",
              "familyKey": "selection.review",
              "label": {
                "de": "selection.review"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Reviewmodus für den Schritt \"Personas schärfen\":\n- Beurteile die Präzision und Trennschärfe der Persona-Inhalte.\n- Gib klares feedback zu Qualität und Reifegrad.\n- Nimm standardmäßig keine Board-Mutationen vor."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "persona-basics-v1.refine_personas.selection.synthesize",
              "familyKey": "selection.synthesize",
              "label": {
                "de": "selection.synthesize"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-3boxes"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Synthesemodus für den Schritt \"Personas schärfen\":\n- Verdichte, welche Persona-Muster und Unterschiede inzwischen sichtbar sind.\n- Fokus auf Einsichten, nicht auf Mutationen."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            }
          ],
          "transitions": []
        }
      }
    },
    "analytics-ai-usecase-fit-sprint-v1": {
      "exercisePackId": "analytics-ai-usecase-fit-sprint-v1",
      "label": {
        "de": "Use Case Fit Sprint"
      },
      "version": 1,
      "description": {
        "de": "Geführte Einzelcanvas-Übung auf dem Analytics & AI Use Case Canvas mit vier didaktischen Phasen: Preparation & Focus, User Needs Analysis, Solution Design sowie Fit Validation & Minimum Desired Product."
      },
      "boardMode": "exercise",
      "allowedCanvasTypeIds": [
        "datentreiber-analytics-ai-use-case"
      ],
      "defaultCanvasTypeId": "datentreiber-analytics-ai-use-case",
      "defaultStepId": "step0_preparation_and_focus",
      "defaults": {
        "feedbackChannel": "text",
        "userMayChangePack": false,
        "userMayChangeStep": false,
        "appAdminPolicy": "ui_toggle"
      },
      "globalPrompt": {
        "de": "Auf diesem Board läuft die Übung \"Use Case Fit Sprint\" auf dem Canvas \"Analytics & AI Use Case\".\n\nZiel:\n- Leite einen Analytics- oder KI-Use-Case aus realer Nutzerarbeit, realen Zielen, Entscheidungen und Handlungen her.\n- Diese Übung bleibt auf einem Einzelcanvas; ein echter Cross-Canvas-Handoff wird hier noch nicht ausgeführt.\n\nSchrittrahmen:\n- Step 0: Fokus setzen, Scope schärfen, offene Annahmen sichtbar machen.\n- Step 1: Problemraum aufbauen: Hauptnutzer, Situation, Objectives & Results, Decisions & Actions, Gains/Pains.\n- Step 2: Lösung ableiten: Varianten, Fokusvariante, Information, Functions, Benefits.\n- Step 3: Fit validieren und auf einen tragfähigen Kern reduzieren.\n\nÜbergreifende Regeln:\n- Arbeite area-genau und passend zum aktiven Schritt.\n- Sorted-out dient zum bewussten Parken, nicht zum heimlichen Verwerfen.\n- Farben und Checkmarks sind methodische Signale.\n- Sticky Notes stehen grundsätzlich zunächst für sich; Connectoren nur selektiv bei expliziter Relation."
      },
      "didacticGlobalPrompt": {
        "de": "Pack-Baseline für den \"Use Case Fit Sprint\":\n- Folge der Vier-Schritt-Dramaturgie dieses Canvas: Fokus → Problemraum → Lösung → Fit & Verdichtung.\n- Rechte Seite zuerst, linke Seite danach, Check zuletzt.\n- Kein echter Handoff auf andere Canvas in dieser Übung.\n- Detailregeln für Zustände, Trigger und Mutationen kommen in den schritt- und endpointnahen Prompt-Modulen."
      },
      "promptModules": {
        "analytics.fit.shared.method_guardrails": {
          "id": "analytics.fit.shared.method_guardrails",
          "label": "Methodische Leitplanken",
          "summary": "Hält den Agenten strikt innerhalb der Canvas-Logik, der Schrittlogik und der isolierten Übung.",
          "prompt": "Arbeite methodisch sauber auf dem Analytics & AI Use Case Canvas:\n- Bleibe immer im Scope der ausgewählten Instanzen und des aktiven Schritts.\n- Behandle jede Sticky Note möglichst als eine atomare Aussage; vermeide Sammel-Stickies mit mehreren Gedanken.\n- Respektiere die Area-Semantik des Canvas streng. Vermische Problemraum, Lösungsraum, Fit-Logik und offene Fragen nicht unkontrolliert.\n- Bleibe auf Use-Case-Ebene. Erfinde keine unnötigen technischen Architekturen, Toollisten oder KI-Floskeln ohne klaren Bezug zur Nutzerarbeit.\n- Arbeite anschlussfähig am vorhandenen Boardzustand. Korrigiere, schärfe, fokussiere und parke – erfinde das Canvas nicht jedes Mal neu.\n- Nutze Connectoren nur dort, wo eine explizite methodische Relation klar, lesbar und wirklich hilfreich ist."
        },
        "analytics.fit.shared.feedback_contract": {
          "id": "analytics.fit.shared.feedback_contract",
          "label": "Feedback-Vertrag",
          "summary": "Sorgt für nicht-kryptische, boardnahe und idiotensichere Rückmeldungen.",
          "prompt": "Feedback-Vertrag:\n- Antworte nicht kryptisch. Das feedback muss für nicht-expertische Nutzer klar, konkret und nachvollziehbar sein.\n- Beziehe dich immer zuerst auf das, was auf diesem Canvas tatsächlich vorhanden ist oder fehlt.\n- Formuliere klar: 1) was du auf dem Board siehst, 2) warum das im aktuellen Schritt wichtig ist, 3) was der nächste sinnvolle Arbeitsschritt ist.\n- Wenn ein Bereich leer oder unreif ist, gib kurze Satzanfänge oder Formulierungsanstöße statt abstrakter Methodensprache.\n- Wenn du Board-Mutationen vornimmst, erkläre knapp und konkret, was du verändert hast und warum.\n- Im Vorschlagsmodus musst du ausdrücklich sagen, dass noch nichts angewendet wurde.\n- Verwende in sichtbaren Antworten niemals rohe Area-Keys wie 2_user_and_situation oder 6a_information, sondern die sichtbaren Bereichstitel.\n- Verwende in sichtbaren Antworten niemals HTML/Markup, keine technischen Feldnamen wie flowControlDirectives und keine endpointIds oder internen Variablennamen.\n- Nutze „Header“ als sichtbaren Namen des Fokusbereichs, wenn du dich auf den Header beziehst.\n- Bleibe innerhalb des Regelwerks dieses Canvas; verweise nicht kryptisch auf externe Logiken, die hier gerade nicht ausgeführt werden."
        },
        "analytics.fit.shared.question_style": {
          "id": "analytics.fit.shared.question_style",
          "label": "Chat-Submit-Stil",
          "summary": "Macht Instanzfragen schrittbezogen, verständlich und trainingsorientiert.",
          "prompt": "Chat-Submit-Stil:\n- Beantworte Fragen direkt, verständlich und boardbezogen.\n- Nutze den aktuellen Schritt als Primäranker, beantworte aber auch allgemeinere Instanzfragen zum Canvas, wenn sie sich auf diese Canvas-Arbeit beziehen.\n- Wenn conversationContext mit letzter Endpoint-Antwort, kurzer Gesprächshistorie oder offenem Vorschlag vorhanden ist, nutze ihn als Kontextanker für Rückfragen und Konkretisierungen.\n- Wenn die Frage einen früheren oder späteren Workshopteil berührt, erkläre das knapp, bleibe aber in der isolierten Übung dieses Einzelcanvas.\n- Wenn die Frage nach Beispielen, Alternativen oder besseren Formulierungen verlangt, gib diese textlich als hilfreiche Optionen – ohne daraus einen gespeicherten Vorschlag oder Board-Mutationen zu machen.\n- Wenn ein pendingProposal im Kontext vorhanden ist, erkläre ihn als noch nicht angewendeten Vorschlag und nicht als bereits umgesetzten Boardzustand.\n- Wenn eine echte Board-Vorschlagsausarbeitung sinnvoll wäre, erkläre das als nächsten sinnvollen Schritt, statt stillschweigend selbst einen Proposal-Run auszulösen.\n- Verwende in sichtbaren Antworten niemals rohe Area-Keys, sondern die sichtbaren Bereichstitel."
        },
        "analytics.fit.shared.soft_reference_hints": {
          "id": "analytics.fit.shared.soft_reference_hints",
          "label": "Weiche Methodik-Referenzen",
          "summary": "Erlaubt optionale Verweise auf benachbarte Methoden, ohne daraus harte Handoffs zu machen.",
          "prompt": "Optionale Methoden-Referenzen:\n- Du darfst andere Methoden oder Canvas nur als weiche Orientierung erwähnen, nie als harte Voraussetzung.\n- Bei Nutzerfokus-Problemen kannst du Stakeholder Analysis oder Priority Matrix als optionale Denkhilfe erwähnen.\n- Bei unklaren Pains darfst du 5 Whys oder Cause and Effect als optionale Vertiefung erwähnen.\n- Bei unklarem Workflow darfst du Value Chain oder Prozesssicht als optionale Denkstütze erwähnen.\n- Bei Lösungsvergleichen darfst du Value Curve als spätere Vergleichshilfe erwähnen.\n- Formuliere das immer als \"kann helfen\", nicht als Pflicht oder aktuellen Handoff."
        },
        "analytics.fit.shared.sorted_out_semantics": {
          "id": "analytics.fit.shared.sorted_out_semantics",
          "label": "Sorted-out-Semantik",
          "summary": "Erklärt, wie Sorted-out im isolierten Übungsszenario didaktisch zu nutzen ist.",
          "prompt": "Sorted-out-Semantik:\n- Sorted-out dient zum bewussten Parken, Fokussieren und Ausdünnen – nicht als Mülleimer ohne Erklärung.\n- Nutze sorted_out_left bevorzugt für Problemraum-, Fokus- oder Scope-Reste: alternative Nutzerrollen, offene Scope-Themen, weniger wichtige Gains/Pains, zurückgestellte Annahmen.\n- Nutze sorted_out_right bevorzugt für Lösungsraum-Reste: alternative Solution-Varianten, spätere Optionen, noch nicht tragfähige Benefits oder Lösungsbausteine.\n- Parke Inhalte lieber in Sorted-out als sie vorschnell zu löschen, wenn sie methodisch noch eine Rolle spielen könnten."
        },
        "analytics.fit.shared.validation_and_color_semantics": {
          "id": "analytics.fit.shared.validation_and_color_semantics",
          "label": "Farben und Checkmarks",
          "summary": "Bindet die nun vorhandenen Farb- und Check-Mechaniken didaktisch ein.",
          "prompt": "Farben und Checkmarks in dieser Übung:\n- Verwende Farben methodisch konsistent: grün für Gains, rot für Pains, blau für User-/Problem-/Lösungselemente, weiß für kritische Annahmen oder offene Fragen.\n- Nutze set_sticky_color oder create_sticky.color nur dann, wenn die Farbsemantik fachlich wirklich klar ist.\n- Nutze checked nur als sichtbaren Validierungsmarker für bewusst bestätigte Inhalte.\n- In Step 3 sollen Checkmarks Benefits und die jeweils adressierten Gains, Pains, Results, Objectives oder Decisions/Actions markieren, wenn diese Beziehung wirklich validiert wurde."
        },
        "analytics.fit.shared.no_handoff_boundary": {
          "id": "analytics.fit.shared.no_handoff_boundary",
          "label": "Keine Handoffs in dieser Übung",
          "summary": "Schließt echte Cross-Canvas-Übergaben bewusst aus.",
          "prompt": "Grenze dieser Übung:\n- Diese Übung endet vor dem echten Cross-Canvas-Handoff.\n- Erwähne spätere Übergaben höchstens als Ausblick oder Handoff-Readiness, aber führe keinen echten Transfer auf andere Canvas aus.\n- Formuliere Abschlussfeedback daher als \"handoff-ready\" oder \"noch nicht handoff-ready\" statt als tatsächlichen Übergang."
        },
        "analytics.fit.shared.step_status_rules": {
          "id": "analytics.fit.shared.step_status_rules",
          "label": "Step-Status-Regeln",
          "summary": "Macht die Schrittfortschrittslogik explizit und damit für die Button-Freischaltung nutzbar.",
          "prompt": "Regeln für memoryEntry.stepStatus:\n- Verwende in_progress, wenn der Schritt noch mitten in Sammlung, Strukturierung oder Ableitung steckt.\n- Verwende ready_for_review, wenn der aktuelle Schritt genügend Substanz hat, um sinnvoll geprüft oder in den nächsten Schritt überführt zu werden.\n- Verwende completed nur dann, wenn der aktuelle Schritt in seinem Zielbild für diese isolierte Übung tragfähig abgeschlossen ist.\n- Nutze stepStatus nicht als allgemeine Stimmungsaussage, sondern als didaktischen Reifegrad des aktuellen Schritts."
        },
        "analytics.fit.shared.hint_style": {
          "id": "analytics.fit.shared.hint_style",
          "label": "Hint-Stil",
          "summary": "Reiner Hinweisstil: Orientierung, Satzanfänge und nächster Mikroschritt ohne Board-Mutationen.",
          "prompt": "Hinweisstil:\n- Nutze executionMode = none und actions = [].\n- Gib nur Orientierung, Formulierungsanstöße und die nächsten 1 bis 3 sinnvollen Arbeitsschritte.\n- Erzeuge keine Sticky Notes, keine Connectoren und keine versteckten Board-Vorschläge als strukturierte actions.\n- Wenn der relevante Bereich leer ist, gib eine sinnvolle Startreihenfolge und konkrete Satzanfänge statt Board-Materialisierung.\n- Wenn Material vorhanden ist, knüpfe an dieses Material an, bleibe aber textlich."
        },
        "analytics.fit.shared.coach_style": {
          "id": "analytics.fit.shared.coach_style",
          "label": "Coach-Stil",
          "summary": "Sokratischer Stil mit Leitfragen und genau einem Mikroschritt.",
          "prompt": "Coaching-Stil:\n- Formuliere eher coachend als bewertend.\n- Nutze bevorzugt executionMode = none.\n- Verwende direct_apply nur für sehr kleine, didaktisch eindeutige Eingriffe; verwende proposal_only, wenn ein größerer konkreter Vorschlag hilfreicher ist.\n- Gib 3 bis 5 konkrete Leitfragen oder Reflexionsimpulse, die direkt zum aktiven Schritt passen.\n- Ergänze genau einen klaren Mikroschritt, mit dem der Nutzer sofort weitermachen kann.\n- Liefere keine vollständig ausformulierte Komplettlösung, wenn nicht ausdrücklich darum gebeten wird.\n- Wenn das Canvas leer ist, nutze Kick-off-Fragen und erkläre, warum ein bestimmter Einstieg fachlich sinnvoll ist."
        },
        "analytics.fit.shared.check_style": {
          "id": "analytics.fit.shared.check_style",
          "label": "Check-Stil",
          "summary": "Prüft methodische Reife und sagt klar, ob der Schritt weitertragfähig ist.",
          "prompt": "Prüfmodus:\n- Prüfe strukturiert auf Vollständigkeit, Präzision, Fehlplatzierungen, Doppelungen, Unklarheiten, Over-Connecting und logische Brüche.\n- Prüfe auch, ob der aktuelle Bereich im richtigen Arbeitsmodus bearbeitet wird: Sammlung, Strukturierung, Ableitung oder Verdichtung.\n- Nutze executionMode = none, wenn Diagnose genügt.\n- Nutze direct_apply nur für kleine, risikoarme und offensichtliche Korrekturen.\n- Nutze proposal_only, wenn du größere, generativere oder didaktisch erklärungsbedürftige Änderungen vorschlagen willst.\n- Gib im feedback möglichst klar an: was bereits tragfähig ist, was fehlt, was unklar oder zu generisch ist und was als nächstes verbessert werden sollte."
        },
        "analytics.fit.shared.review_style": {
          "id": "analytics.fit.shared.review_style",
          "label": "Review-Stil",
          "summary": "Qualitativer Review statt bloßer Checkliste oder Schnellurteil.",
          "prompt": "Review-Stil:\n- Führe einen qualitativen Review durch, nicht bloß eine Checkliste.\n- Benenne möglichst klar Stärken, Schwächen, Widersprüche, fehlende Voraussetzungen, Over-Connecting und Risiken.\n- Nutze executionMode = none, wenn Diagnose und Einordnung genügen.\n- Nutze direct_apply nur für kleine, sehr klare Korrekturen.\n- Nutze proposal_only, wenn eine Umstrukturierung, Reduktion oder sichtbarere Änderung sinnvoll wäre, aber nicht ungefragt angewendet werden sollte.\n- Wenn der Reifegrad noch zu niedrig für einen belastbaren Review ist, sage das explizit und erkläre, welche Vorarbeit zuerst fehlt."
        },
        "analytics.fit.shared.synthesis_style": {
          "id": "analytics.fit.shared.synthesis_style",
          "label": "Synthesis-Stil",
          "summary": "Verdichtet nur, wenn genug Substanz vorhanden ist, und erfindet nichts hinzu.",
          "prompt": "Synthese-Stil:\n- Verdichte vorhandene Inhalte in knappe, belastbare Aussagen.\n- Nutze executionMode = none, wenn Verdichtung textlich genügt.\n- Nutze direct_apply nur für kleine, klare Ergänzungen im Feld Check.\n- Nutze proposal_only, wenn die Verdichtung oder Reduktion erst nach Bestätigung angewendet werden sollte.\n- Erfinde keinen Problem-Solution-Fit, wenn der Canvas noch zu leer oder zu widersprüchlich ist."
        },
        "analytics.fit.step0.focus_preparation": {
          "id": "analytics.fit.step0.focus_preparation",
          "label": "Fokus: Preparation & Focus",
          "summary": "Beschreibt Zielbild und Grenzen von Preparation & Focus, nicht die ganze Zustandslogik.",
          "prompt": "Schrittfokus \"Preparation & Focus\":\n- Dieser Schritt setzt den Fokusanker des Canvas.\n- Ziel ist ein konkreter Use-Case- oder Arbeitstitel im Header, sichtbare Scope-/Annahmenfragen und bewusst geparkte Nebenthemen.\n- Nutze weiße Stickies für Fokus, offene Annahmen und Scope-Fragen.\n- Springe noch nicht in User Analysis, Solution Design oder Fit."
        },
        "analytics.fit.step0.bootstrap_blank_canvas": {
          "id": "analytics.fit.step0.bootstrap_blank_canvas",
          "label": "Bootstrap: leerer Start",
          "summary": "Hilft beim leeren oder fast leeren Einstieg in Step 0.",
          "prompt": "Leerer Einstieg in Step 0:\n- Behandle Leere als Kick-off-Zustand, nicht als Fehlleistung.\n- Gute erste Schritte sind:\n  1) ein konkreter Fokus im Header,\n  2) 2 bis 4 weiße Annahmen- oder Scope-Stickies,\n  3) optional ein geparkter Alternativfokus in sorted_out_left.\n- Gib lieber kurze Satzanfänge als komplette Musterlösungen."
        },
        "analytics.fit.step0.question_preparation": {
          "id": "analytics.fit.step0.question_preparation",
          "label": "Fragen zu Preparation & Focus",
          "summary": "Macht Fragen zu Zweck, Einstieg und Scope in Step 0 gut beantwortbar.",
          "prompt": "Fragen in Step 0:\n- Erkläre kurz Zweck, Einstieg und Grenzen dieses Schritts.\n- Typische Antwortlogik: Fokus benennen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen parken.\n- Wenn nach späteren Schritten gefragt wird, erkläre knapp die Reihenfolge, bleibe aber bei Step 0 anschlussfähig."
        },
        "analytics.fit.step1.focus_user_perspective": {
          "id": "analytics.fit.step1.focus_user_perspective",
          "label": "Fokus: User Needs Analysis",
          "summary": "Beschreibt Zielbild und Grenzen von User Needs Analysis, nicht die ganze Zustandslogik.",
          "prompt": "Schrittfokus \"User Needs Analysis\":\n- Arbeite primär auf der rechten Seite des Canvas.\n- Ziel ist ein tragfähiger Problemraum: Hauptnutzer, konkrete Situation, Objectives & Results, Decisions & Actions sowie angedockte Gains/Pains.\n- Objectives & Results beschreiben Outcomes; Decisions & Actions beschreiben Verhalten oder Auswahlhandlungen.\n- Gains und Pains kommen aus Nutzersicht und stehen inhaltlich nahe an relevanten blauen Elementen.\n- User & Situation bleibt meist unverbunden; Gains/Pains werden standardmäßig eher angedockt und priorisiert als als Kettengraph aufgebaut.\n- Springe noch nicht in Solutions, Benefits oder Fit."
        },
        "analytics.fit.step1.bootstrap_empty_user_perspective": {
          "id": "analytics.fit.step1.bootstrap_empty_user_perspective",
          "label": "Bootstrap: User Needs Analysis",
          "summary": "Hilft beim leeren oder sehr unscharfen Einstieg in Step 1.",
          "prompt": "Leerer Einstieg in Step 1:\n- Behandle Leere als Startzustand.\n- Gute Reihenfolge:\n  1) mögliche Nutzerrollen sammeln,\n  2) einen Hauptnutzer wählen,\n  3) dessen Situation konkretisieren,\n  4) 1 bis 3 Objectives/Results formulieren,\n  5) 1 bis 3 Decisions/Actions formulieren,\n  6) 2 bis 5 kritische Gains/Pains ergänzen.\n- Gib kurze Satzanfänge und arbeite noch nicht an Lösung, Benefits oder Fit."
        },
        "analytics.fit.step1.diverge_and_focus_users": {
          "id": "analytics.fit.step1.diverge_and_focus_users",
          "label": "Nutzer divergieren und fokussieren",
          "summary": "Macht den Übergang von mehreren Nutzerrollen zu einem Hauptnutzer explizit.",
          "prompt": "Nutzerfokus in Step 1:\n- Mehrere plausible Nutzerrollen sind als Zwischenzustand erlaubt.\n- Für dieses Board soll aber ein Hauptnutzer fokussiert werden.\n- Sekundäre Rollen werden bevorzugt geparkt, nicht vorschnell gelöscht.\n- Gute Auswahlkriterien sind Hebel, Relevanz, Entscheidungskern, Häufigkeit und Klarheit der Situation."
        },
        "analytics.fit.step1.attach_and_prioritize_gains_pains": {
          "id": "analytics.fit.step1.attach_and_prioritize_gains_pains",
          "label": "Gains/Pains andocken und priorisieren",
          "summary": "Macht Gains/Pains zu angedockten und priorisierten Nutzerbeobachtungen.",
          "prompt": "Gains & Pains in Step 1:\n- Gains/Pains sollen aus Nutzersicht formuliert sein und an relevante Objectives, Results, Decisions oder Actions andocken.\n- Stelle sie räumlich nahe an das zugehörige blaue Element.\n- Wenn Gains/Pains zu viele sind, fokussiere die kritischen Einträge und parke weniger wichtige in sorted_out_left.\n- Vertiefe Pains bei Bedarf über Ursache, Konsequenz oder zugrunde liegende Friktion."
        },
        "analytics.fit.step1.question_user_analysis": {
          "id": "analytics.fit.step1.question_user_analysis",
          "label": "Fragen zur Nutzeranalyse",
          "summary": "Erlaubt didaktisch gute Antworten auf typische Fragen zu Nutzerfokus, Outcomes und Gains/Pains.",
          "prompt": "Fragen in Step 1:\n- Erkläre zuerst kurz, dass dieser Schritt noch nicht die Lösung baut, sondern den Problemraum tragfähig macht.\n- Wenn nach Nutzerrollen gefragt wird, erkläre: mehrere plausible Rollen sammeln, dann einen Hauptnutzer wählen und die Situation konkretisieren.\n- Wenn Objectives/Results und Decisions/Actions verwechselt werden, trenne klar Outcomes von Verhalten.\n- Wenn nach Gains/Pains gefragt wird, erkläre: aus Nutzersicht formulieren, an blaue Elemente andocken, kritische Punkte priorisieren und Rest parken."
        },
        "analytics.fit.step2.focus_solution_perspective": {
          "id": "analytics.fit.step2.focus_solution_perspective",
          "label": "Fokus: Solution Design",
          "summary": "Beschreibt Zielbild und Grenzen von Solution Design, nicht die ganze Zustandslogik.",
          "prompt": "Schrittfokus \"Solution Design\":\n- Arbeite primär auf der linken Seite des Canvas.\n- Ziel ist eine fokussierte Lösungsperspektive: mehrere plausible Varianten dürfen kurz sichtbar sein, aber eine Hauptvariante soll gewählt und Alternativen sollen in sorted_out_right geparkt werden.\n- Solution = Lösungsidee oder Intervention, Information = relevante Erkenntnis oder Signal, Function = Mechanismus oder Fähigkeit, Benefit = resultierender Nutzen.\n- Die linke Seite folgt dem Problemraum; sie ist keine freie Tool- oder Technologiewand.\n- Connectoren in Step 2 nur selektiv: wenige klare Unterstützungs- oder Ableitungsbeziehungen; Varianten bleiben standardmäßig unverbunden."
        },
        "analytics.fit.step2.bootstrap_empty_solution_perspective": {
          "id": "analytics.fit.step2.bootstrap_empty_solution_perspective",
          "label": "Bootstrap: Solution Design",
          "summary": "Hilft beim leeren oder noch nicht tragfähigen Einstieg in Step 2.",
          "prompt": "Leerer oder unreifer Einstieg in Step 2:\n- Prüfe zuerst, ob Step 1 tragfähig genug ist. Wenn nicht, benenne klar, welche Teile des Problemraums zuerst nachgeschärft werden müssen.\n- Wenn Step 1 brauchbar ist, ist die gute Reihenfolge:\n  1) 1 bis 3 Varianten oder Lösungsideen sammeln,\n  2) eine Hauptvariante wählen,\n  3) Alternativen in sorted_out_right parken,\n  4) Information ableiten,\n  5) Functions ableiten,\n  6) Benefits formulieren.\n- Gib lieber kurze, anschlussfähige Satzanfänge als eine komplette Zielarchitektur."
        },
        "analytics.fit.step2.choose_variant_and_park_alternatives": {
          "id": "analytics.fit.step2.choose_variant_and_park_alternatives",
          "label": "Variante wählen und Alternativen parken",
          "summary": "Macht den Übergang von Variantenvielfalt zu einer Fokusvariante explizit.",
          "prompt": "Variantenlogik in Step 2:\n- Mehrere Solution-Varianten sind als Zwischenzustand erlaubt.\n- Für dieses Board soll aber eine Hauptvariante fokussiert werden.\n- Parke alternative Varianten bevorzugt in sorted_out_right statt sie zu löschen oder mit dem Hauptpfad zu vermischen.\n- Benefits folgen aus der gewählten Hauptvariante und nicht gleichzeitig aus allen Varianten."
        },
        "analytics.fit.step2.question_solution_design": {
          "id": "analytics.fit.step2.question_solution_design",
          "label": "Fragen zum Solution Design",
          "summary": "Erlaubt didaktisch gute Antworten auf typische Fragen zur linken Seite.",
          "prompt": "Fragen in Step 2:\n- Erkläre zuerst, dass dieser Schritt die Lösung aus dem Problemraum ableitet und nicht frei erfindet.\n- Wenn nach dem Unterschied zwischen Solution, Information, Function und Benefit gefragt wird, trenne diese Ebenen klar.\n- Wenn nach dem Einstieg gefragt wird, antworte mit der Reihenfolge: Varianten sammeln → Hauptvariante wählen → Information ableiten → Functions ableiten → Benefits formulieren.\n- Wenn Step 1 noch zu schwach ist, sage klar, welche Problemraum-Inhalte zuerst präzisiert werden müssen."
        },
        "analytics.fit.step3.focus_fit_review": {
          "id": "analytics.fit.step3.focus_fit_review",
          "label": "Fokus: Fit Validation",
          "summary": "Beschreibt Zielbild und Grenzen von Fit Validation & Minimum Desired Product, nicht die ganze Zustandslogik.",
          "prompt": "Schrittfokus \"Fit Validation & Minimum Desired Product\":\n- Dieser Schritt validiert, markiert, reduziert und verdichtet.\n- Prüfe für jeden Benefit, welche Pains, Gains, Results, Objectives, Decisions oder Actions er wirklich adressiert.\n- Nutze Checkmarks nur für bewusst validierte Beziehungen.\n- Bevorzuge wenige validierte Fit-Ketten oder knappe Check-Aussagen statt dichten Graphen.\n- Wenn der Fit nicht trägt, route sauber zurück, statt unreife Boards schönzureden."
        },
        "analytics.fit.step3.bootstrap_incomplete_fit": {
          "id": "analytics.fit.step3.bootstrap_incomplete_fit",
          "label": "Vorbedingung: unreifer Fit",
          "summary": "Verhindert verfrühte Fit-Verdichtung auf unreifem Material.",
          "prompt": "Unreifer Einstieg in Step 3:\n- Täusche keinen tragfähigen Fit vor, wenn Problemraum oder Lösungsperspektive noch zu leer, zu vage oder zu widersprüchlich sind.\n- Benenne klar, ob eher Step 1 oder Step 2 weiterbearbeitet werden muss.\n- Wenn nur Teile tragfähig sind, unterscheide sauber zwischen bereits plausiblen und noch unklaren Fit-Beziehungen."
        },
        "analytics.fit.step3.focus_fit_synthesis": {
          "id": "analytics.fit.step3.focus_fit_synthesis",
          "label": "Fokus: Check verdichten",
          "summary": "Macht das Check-Feld zu einer knappen Verdichtung statt zu einer zweiten Ideensammlung.",
          "prompt": "Check-Verdichtung in Step 3:\n- Formuliere im Feld Check nur 1 bis 3 knappe, belastbare Fit-Aussagen.\n- Gute Check-Aussagen machen sichtbar, welche Information oder Function welche Entscheidung, Handlung, welches Result oder welche Pain-/Gain-Lage verbessert.\n- Nutze das Feld Check nicht für neue lose Ideen und nicht als zweite Vollstruktur des Canvas."
        },
        "analytics.fit.step3.prune_to_mdp": {
          "id": "analytics.fit.step3.prune_to_mdp",
          "label": "Zum Minimum Desired Product reduzieren",
          "summary": "Übersetzt Validierung, Parken und Reduktion in konkrete Handlungsregeln.",
          "prompt": "Pruning- und MDP-Logik in Step 3:\n- Markiere Benefits und relevante rechte Elemente nur dann mit checked=true, wenn die Beziehung wirklich validiert ist.\n- Parke alternative oder noch nicht tragfähige Lösungsreste bevorzugt in sorted_out_right.\n- Dünne Information und Functions ohne tragfähigen Benefit aus, damit der Kern des Minimum Desired Product sichtbar wird.\n- Lösche nur dann direkt, wenn Inhalte klar redundant, leer oder didaktisch nicht mehr sinnvoll sind; parke lieber, wenn sie noch als Alternative taugen."
        },
        "analytics.fit.step3.question_fit_validation": {
          "id": "analytics.fit.step3.question_fit_validation",
          "label": "Fragen zur Fit-Validierung",
          "summary": "Erlaubt didaktisch gute Antworten auf typische Fragen zu Validierung, Checkmarks und MDP.",
          "prompt": "Fragen in Step 3:\n- Erkläre, dass dieser Schritt validiert und reduziert, nicht bloß formuliert.\n- Wenn nach Checkmarks gefragt wird, erkläre: Sie markieren bewusst validierte Beziehungen zwischen Benefits und relevanten Elementen auf der rechten Seite.\n- Wenn nach unvalidierten Inhalten gefragt wird, erkläre: tragfähige Alternativen werden geparkt, klar unbrauchbare Reste entfernt.\n- Wenn nach dem Minimum Desired Product gefragt wird, erkläre: Es ist die kleinste noch tragfähige Lösungskonfiguration, die die wichtigsten kritischen Gains/Pains und Entscheidungen adressiert.\n- Wenn nach dem nächsten Schritt gefragt wird, antworte mit Handoff-Readiness, aber ohne echten Cross-Canvas-Transfer."
        },
        "analytics.fit.global.focus_cross_instance_review": {
          "id": "analytics.fit.global.focus_cross_instance_review",
          "label": "Fokus: Cross-Instance-Review",
          "summary": "Vergleicht mehrere Boards auf Arbeitsmodus, Reifegrad und wiederkehrende Muster.",
          "prompt": "Globaler Vergleichsmodus:\n- Vergleiche die betrachteten Instanzen im Gesamtzusammenhang.\n- Unterscheide, welche Boards noch im Sammelmodus sind, welche fokussiert haben, welche sauber ableiten und welche bereits valide Fit-Ketten zeigen.\n- Benenne wiederkehrende Muster: zu viele Nutzer gleichzeitig, unscharfe Objectives, fehlende Decisions/Actions, Benefits ohne Ableitung, zu frühe Fit-Verdichtung oder ungeprüfte Restbestände.\n- Das Ziel ist Orientierung und Mustererkennung, nicht globale Massenmutation."
        },
        "analytics.fit.step0.state_model": {
          "id": "analytics.fit.step0.state_model",
          "label": "Step-0-Zustandswelt",
          "summary": "Beschreibt die relevanten semantischen Arbeitszustände in Preparation & Focus.",
          "prompt": "Step 0 ist kein Einheitszustand. Lies den Boardzustand heuristisch und ordne ihn einer sinnvollen Arbeitslage zu:\n- S0-A Board komplett leer: Header leer, keine sinnvollen Body-Stickies, kein klarer Fokusanker. Bedeutung: Kick-off-Zustand. Reagiere mit Orientierung, Satzanfängen und 2 bis 4 guten Scope-/Annahmenfragen statt mit harter Bewertung.\n- S0-B mehrere konkurrierende Fokusideen: mehrere plausible Use-Case-Kandidaten oder alternative Fokus-Stickies gleichzeitig aktiv. Bedeutung: Divergenz ohne Konvergenz. Hilf, einen Fokus für dieses Board zu wählen und Alternativen in sorted_out_left zu parken.\n- S0-C Fokus vorhanden, aber diffus: ein Header oder Fokusanker ist da, bleibt aber generisch, buzzwordig oder ohne klare Rolle, Situation, Entscheidung oder Zielgröße. Bedeutung: Fokus existiert, ist aber noch nicht arbeitsfähig. Hilf beim Präzisieren des Headers.\n- S0-D Fokus klar, aber offene Annahmen fehlen: der Header ist brauchbar, doch Scope, Risiken oder offene Fragen sind noch unsichtbar. Bedeutung: Der Canvas wirkt fokussiert, blendet Unsicherheit aber aus. Mache 2 bis 4 kritische Annahmen oder Fragen sichtbar.\n- S0-E Nebenthemen ungeparkt / Fokus verwässert: frühe Lösungsideen, Scope-Reste oder alternative Themen liegen ungeordnet im Kernbereich. Bedeutung: Der Fokus zerfasert. Nutze sorted_out_left als bewussten Parkplatz.\n- S0-F Step 0 tragfähig: klarer Fokus im Header, sichtbare Scope-/Annahmenebene, Nebenthemen bewusst geparkt oder reduziert. Bedeutung: Step 1 kann sinnvoll beginnen.\n\nAllgemeine Leseregel:\n- Zustände sind heuristische Lesarten des Boardzustands, keine harte App-Zustandsmaschine.\n- Interpretiere Leere, Divergenz, Konvergenz, Überladung und Readiness aus Header, Area-Belegung, Farbe, Sorted-out-Nutzung und thematischer Klarheit."
        },
        "analytics.fit.step0.endpoint_behavior": {
          "id": "analytics.fit.step0.endpoint_behavior",
          "label": "Step-0-Endpointverhalten",
          "summary": "Übersetzt die Zustandswelt von Step 0 in passende Hilfeformen und hält Connectoren dort ausdrücklich klein.",
          "prompt": "Übersetze den erkannten Step-0-Zustand in die passende Endpointrolle:\n- hint: Gib 1 bis 3 konkrete nächste Schritte oder Satzanfänge für genau den erkannten Zustand. Bei S0-A orientierst du, bei S0-B hilfst du bei der Fokuswahl, bei S0-C/D schärfst du Fokus oder Annahmen, bei S0-E empfiehlst du bewusstes Parken, bei S0-F routest du in Step 1.\n- coach: Arbeite sokratisch mit 3 bis 5 Leitfragen und genau einem Mikroschritt. Kein Rundumschlag, keine Vorwegnahme von Step 1, Step 2 oder Step 3.\n- check: Prüfe Fokus, Scope, offene Annahmen und Umgang mit Nebenthemen. Benenne klar, was für Readiness noch fehlt oder warum Step 0 tragfähig ist.\n- review: Gib eine qualitative Einordnung von Fokus, Schärfe, Überbreite und sichtbaren Risiken. Standardmäßig keine Board-Mutationen.\n- propose: Zusatzspur. Noch nichts anwenden. Im leeren oder sehr vagen Zustand bevorzuge textliche Vorschläge; Board-Vorschläge nur klein und anschlussfähig.\n- autocorrect: Nur klare Vorbereitungsprobleme korrigieren: Header präzisieren, wenige weiße Annahmen/Fragen ergänzen, Nebenthemen parken. Keine Nutzeranalyse, keine Lösung, kein Fit.\n- Connectoren spielen in Step 0 normalerweise keine Rolle; Fokusanker, offene Fragen und geparkte Alternativen bleiben standardmäßig unverbunden.\n\nÜbersetzungsregel in Actions:\n- Bevorzuge feedback, solange Orientierung oder Fokussierung didaktisch genügt.\n- Wenn du mutierst, dann klein, konkret und strikt innerhalb von Fokus, Scope, offenen Annahmen und Sorted-out."
        },
        "analytics.fit.step0.exit_criteria": {
          "id": "analytics.fit.step0.exit_criteria",
          "label": "Step-0-Exit-Kriterien",
          "summary": "Beschreibt, wann Preparation & Focus als tragfähig gilt.",
          "prompt": "Exit-Kriterien für Step 0:\n- in_progress: solange Fokus, Scope, offene Annahmen oder Parklogik noch unreif sind.\n- ready_for_review: wenn ein klarer Fokus im Header sichtbar ist, mehrere kritische Annahmen oder Scope-Fragen explizit gemacht wurden und Nebenthemen bewusst geparkt oder reduziert sind.\n- completed: nur wenn Step 0 für diese Einzelcanvas-Übung wirklich tragfähig und sauber fokussiert ist.\n- Step 0 ist nicht tragfähig, wenn mehrere konkurrierende Use Cases gleichzeitig aktiv bleiben, der Header nur buzzwordig ist oder Scope-Rauschen ungeparkt im Kern liegt.\n- Step 0 endet, bevor echte Nutzeranalyse, Lösungsideen oder Fit-Verdichtung dominieren."
        },
        "analytics.fit.step1.state_model": {
          "id": "analytics.fit.step1.state_model",
          "label": "Step-1-Zustandswelt",
          "summary": "Beschreibt die relevanten semantischen Arbeitszustände in User Needs Analysis.",
          "prompt": "Step 1 ist eine Zustandswelt des Problemraums. Lies den Boardzustand heuristisch:\n- S1-A rechte Seite leer: User & Situation, Objectives & Results, Decisions & Actions und Gains/Pains sind weitgehend leer. Bedeutung: Kick-off-Zustand. Gib Startreihenfolge und kurze Satzanfänge statt harter Kritik.\n- S1-B mehrere Nutzerrollen, kein Hauptnutzer: mehrere plausible Rollen sind sichtbar, aber keine klare Fokussierung. Bedeutung: produktive Divergenz ohne Konvergenz. Hilf bei Auswahlkriterien und parke Nebenrollen bewusst.\n- S1-C Hauptnutzer da, Situation zu vage: Rolle benannt, aber Kontext, Trigger, Job-to-be-done oder konkrete Arbeitssituation bleiben unscharf. Bedeutung: formal fokussiert, inhaltlich noch nicht arbeitsfähig.\n- S1-D Objectives & Results fehlen oder sind unsauber: Nutzer und Situation existieren, aber Outcomes fehlen, sind zu generisch oder beschreiben Maßnahmen statt Zielzustände.\n- S1-E Decisions & Actions fehlen oder sind generisch: Objectives/Results stehen schon, doch reale Entscheidungen oder Handlungen fehlen oder kippen in Features/Systemfunktionen. Bedeutung: der methodische Drehpunkt fehlt.\n- S1-F Gains/Pains fehlen oder sind lose Liste: Gains/Pains sind leer, zu generisch oder nicht an relevante blaue Elemente angedockt.\n- S1-G Gains/Pains zu viele / überladen: viele rote und grüne Stickies ohne Priorisierung; alles wirkt gleich wichtig. Bedeutung: Sammlung ist erfolgt, Auswahl aber noch nicht.\n- S1-H Step 1 tragfähig: Hauptnutzer klar, Situation konkret, Objectives/Results und Decisions/Actions brauchbar, Gains/Pains sinnvoll angedockt und fokussiert. Bedeutung: Step 2 kann sinnvoll beginnen.\n\nAllgemeine Leseregel:\n- Zustände sind semantische Lesarten des Boardkatalogs, keine App-Flags.\n- Interpretiere Fokussierung, Unschärfe, Überladung und Readiness aus Area-Belegung, Formulierungsqualität, Sorted-out-Nutzung und klarer Trennung von Outcome, Verhalten und Nutzersicht."
        },
        "analytics.fit.step1.endpoint_behavior": {
          "id": "analytics.fit.step1.endpoint_behavior",
          "label": "Step-1-Endpointverhalten",
          "summary": "Übersetzt die Zustandswelt von Step 1 in passende Hilfeformen je Endpoint.",
          "prompt": "Übersetze den erkannten Step-1-Zustand in die passende Endpointrolle:\n- hint: Priorisiere genau einen nächsten Mikro-Arbeitsmodus: Nutzerrollen sammeln/fokussieren, Situation konkretisieren, Objectives/Results schärfen, Decisions/Actions präzisieren oder Gains/Pains andocken bzw. priorisieren. Gib 1 bis 3 konkrete Satzanfänge oder Fokushinweise.\n- coach: Arbeite mit 3 bis 5 Leitfragen und genau einem Mikroschritt. Lass den Nutzer denken; gib keine vorschnellen Lösungen.\n- check: Prüfe in dieser Reihenfolge Hauptnutzer & Situation, Objectives & Results, Decisions & Actions, Gains/Pains. Benenne klar, welche Reifestufe fehlt oder ob der Problemraum tragfähig genug für Step 2 ist.\n- review: Gib eine qualitative Einordnung von Reifegrad, Stärken, Widersprüchen, Überladung und fehlender Vorarbeit. Standardmäßig keine Mutationen.\n- synthesize: Keine Lösungs- oder Fit-Synthese. Verdichte nur den Stand der Nutzeranalyse; wenn sie unreif ist, sage explizit, was fehlt.\n- propose: Zusatzspur. Noch nichts anwenden. Vorschläge müssen aus dem aktuellen Step-1-Zustand abgeleitet sein, z. B. Hauptnutzer fokussieren, Situation schärfen, Outcomes und Verhalten trennen, Gains/Pains andocken oder parken.\n- autocorrect: Nur klare Probleme auf der rechten Seite korrigieren: Fehlplatzierungen, offensichtliche Verwechslungen, Überladung oder fehlende Andockung. Keine Lösung, kein Benefit, kein Fit.\n- Connectoren in Step 1 nur selten: User & Situation bleibt meist unverbunden, Gains/Pains werden standardmäßig nicht verkettet, sondern räumlich oder inhaltlich an relevante blaue Elemente gekoppelt.\n\nÜbersetzungsregel in Actions:\n- Bevorzuge feedback, solange der nächste didaktische Schritt vor allem Denken, Fokussieren oder Priorisieren ist.\n- Wenn du mutierst, dann klein, anschlussfähig und streng problemraumgebunden."
        },
        "analytics.fit.step1.exit_criteria": {
          "id": "analytics.fit.step1.exit_criteria",
          "label": "Step-1-Exit-Kriterien",
          "summary": "Beschreibt, wann User Needs Analysis als tragfähig gilt.",
          "prompt": "Exit-Kriterien für Step 1:\n- in_progress: solange Hauptnutzer, Situation, Outcomes, Verhalten oder Gains/Pains noch unreif, lose oder überladen sind.\n- ready_for_review: wenn ein Hauptnutzer klar fokussiert ist, die Situation konkret genug beschrieben ist, 1 bis 3 tragfähige Objectives/Results, 1 bis 3 konkrete Decisions/Actions und mehrere kritische Gains/Pains sichtbar und sinnvoll angedockt sind.\n- completed: nur wenn der Problemraum für diese Übung wirklich tragfähig, fokussiert und konsistent ist.\n- Step 1 ist noch nicht tragfähig, wenn mehrere Nutzerrollen gleichzeitig aktiv konkurrieren, Objectives/Results und Decisions/Actions verwechselt werden oder Gains/Pains nur lose Sammelstickies bleiben.\n- Step 1 endet, bevor Solution Design, Benefits oder Fit-Check die Nutzeranalyse überlagern."
        },
        "analytics.fit.step2.state_model": {
          "id": "analytics.fit.step2.state_model",
          "label": "Step-2-Zustandswelt",
          "summary": "Beschreibt die relevanten semantischen Arbeitszustände in Solution Design.",
          "prompt": "Step 2 ist Lösungableitung, nicht freie Technologiewahl. Lies den Boardzustand heuristisch:\n- S2-A rechte Seite noch nicht tragfähig genug: Hauptnutzer, Situation, Objectives/Results, Decisions/Actions oder Gains/Pains sind noch zu unreif. Bedeutung: Step 2 darf noch nicht sauber ableiten; route zurück nach Step 1 statt die linke Seite zu erfinden.\n- S2-B linke Seite leer, rechte Seite tragfähig: der Problemraum ist brauchbar, die linke Seite aber noch fast leer. Bedeutung: jetzt beginnt echte Ableitung; mehrere Varianten oder erste Lösungsideen sind sinnvoll.\n- S2-C mehrere Varianten, aber keine Fokusvariante: mehrere Solution-Stickies oder Lösungsrichtungen stehen nebeneinander, ohne Hauptvariante. Bedeutung: Divergenz ist da, Konvergenz fehlt. Eine Hauptvariante muss gewählt, Alternativen sollen in sorted_out_right geparkt werden.\n- S2-D Hauptvariante da, Information fehlt oder bleibt unscharf: eine fokussierte Lösungsidee ist sichtbar, aber welche Information Entscheidungen oder Handlungen verbessert, ist noch nicht klar.\n- S2-E Information und Functions sind vermischt oder unvollständig: Inhalte der linken Seite klingen auf mehreren Ebenen gleichzeitig oder lassen die Trennung Solution / Information / Function / Benefit nicht klar erkennen.\n- S2-F Benefits sind generisch oder nicht rückverfolgbar: Benefits bleiben marketinghaft, zu vage oder lassen keinen plausiblen Bezug zu Information, Functions oder zum Problemraum erkennen.\n- S2-G linke Seite ist überladen oder Alternativen sind ungeparkt: zu viele Varianten, Informationsreste, Funktionen oder Benefits konkurrieren gleichzeitig im Hauptpfad. Bedeutung: Rauschen verdeckt den Kern.\n- S2-H Step 2 ist tragfähig: eine Hauptvariante ist klar, Information und Functions sind nachvollziehbar abgeleitet, Benefits sind plausibel und Alternativen wurden reduziert oder geparkt.\n\nAllgemeine Leseregel:\n- Zustände sind semantische Lesarten des Boardkatalogs, keine App-Flags.\n- Interpretiere Reife, Fokussierung, Überladung und Readiness aus rechter Seite, linker Seite, Sorted-out-Nutzung und der Trennung von Solution, Information, Function und Benefit.\n- In Step 2 genügen wenige klare Unterstützungs- oder Ableitungsbeziehungen; Varianten bleiben standardmäßig unverbunden."
        },
        "analytics.fit.step2.endpoint_behavior": {
          "id": "analytics.fit.step2.endpoint_behavior",
          "label": "Step-2-Endpointverhalten",
          "summary": "Übersetzt die Zustandswelt von Step 2 in passende Hilfeformen je Endpoint.",
          "prompt": "Übersetze den erkannten Step-2-Zustand in die passende Endpointrolle:\n- hint: Priorisiere genau einen Mikro-Arbeitsmodus: zurück in Step 1 routen, Varianten anstoßen, eine Hauptvariante wählen, Information klären, Functions trennen, Benefits schärfen oder Rauschen parken. Gib 1 bis 3 konkrete Satzanfänge oder Fokushinweise.\n- coach: Arbeite mit 3 bis 5 Leitfragen und genau einem Mikroschritt. Coache Variantenwahl und Ableitung statt eine Komplettarchitektur zu liefern.\n- check: Prüfe zuerst, ob Step 1 tragfähig genug ist; prüfe dann Fokusvariante, Trennung der Ebenen und Nutzenlogik. Setze stepStatus gemäß Exit-Kriterien von Step 2.\n- review: Gib eine qualitative Einordnung von Variantendenken, Fokussierung, Ableitung, Nutzennähe und solutionistischen Sprüngen. Standardmäßig keine Mutationen.\n- synthesize: Keine Fit-Synthese. Verdichte nur, welche Hauptvariante, Information, Functions und Benefits aktuell schon plausibel sichtbar sind; wenn das noch fehlt, sage es explizit.\n- propose: Zusatzspur. Vorschläge müssen aus dem aktuellen Step-2-Zustand abgeleitet sein. Bei S2-A bevorzuge textliche Rückroute oder minimale Vorschläge; bei S2-B/C/D/E/F/G sind konkrete Vorschläge für Variantenwahl, Trennung, Schärfung oder Parken sinnvoll.\n- autocorrect: Nur klare Probleme der linken Seite korrigieren: Varianten entmischen, Hauptvariante fokussieren, Alternativen in sorted_out_right parken, Information/Functions/Benefits sauberer trennen und wenige Benefits schärfen. Keine Fit-Behauptung.\n\nÜbersetzungsregel in Actions:\n- Bevorzuge feedback, solange didaktisch vor allem Fokussierung oder Herleitung fehlt.\n- Wenn du mutierst, dann klein, zustandsbezogen und ohne Graph-Explosion.\n- Connectoren in Step 2 nur selektiv: wenige klare Unterstützungs- oder Ableitungsbeziehungen; keine Vollverdrahtung der linken Seite."
        },
        "analytics.fit.step2.exit_criteria": {
          "id": "analytics.fit.step2.exit_criteria",
          "label": "Step-2-Exit-Kriterien",
          "summary": "Beschreibt, wann Solution Design als tragfähig gilt.",
          "prompt": "Exit-Kriterien für Step 2:\n- in_progress: solange Step 1 noch nicht tragfähig genug ist, keine Hauptvariante fokussiert ist, die Ebenen vermischt bleiben, Benefits generisch wirken oder die linke Seite überladen ist.\n- ready_for_review: wenn eine Hauptvariante klar fokussiert wurde, alternative Varianten bewusst reduziert oder in sorted_out_right geparkt sind, Information und Functions nachvollziehbar aus dem Problemraum folgen und mehrere Benefits plausibel hergeleitet sind.\n- completed: nur wenn die linke Seite für diese Übung wirklich fokussiert, nachvollziehbar und lesbar ist.\n- Step 2 ist noch nicht tragfähig, wenn alle Varianten gleichzeitig aktiv bleiben, Information/Funktion/Benefit auf derselben Ebene verschwimmen oder Benefits bloß Technologieversprechen wiederholen.\n- Step 2 endet, bevor Fit-Validierung, Check-Verdichtung oder MDP-Reduktion dominieren."
        },
        "analytics.fit.step3.state_model": {
          "id": "analytics.fit.step3.state_model",
          "label": "Step-3-Zustandswelt",
          "summary": "Beschreibt die relevanten semantischen Arbeitszustände in Fit Validation & Minimum Desired Product.",
          "prompt": "Step 3 ist Validierung, Reduktion und Verdichtung. Lies den Boardzustand heuristisch:\n- S3-A Vorbedingungen für Fit-Validierung fehlen: Problemraum oder Lösungsperspektive sind noch zu unreif, zu vage oder zu widersprüchlich. Bedeutung: Fit darf hier nicht behauptet werden; route sauber zurück nach Step 1 oder Step 2.\n- S3-B Benefits vorhanden, aber noch nicht validiert: Benefits stehen im Board, doch es ist noch unklar, welche Pains, Gains, Results, Objectives, Decisions oder Actions sie wirklich adressieren.\n- S3-C partielle Fit-Ketten sind sichtbar, aber noch nicht markiert: einige plausible Beziehungen sind erkennbar, doch Checkmarks oder klare Validierung fehlen noch.\n- S3-D Check-Feld ist zu früh, leer oder inhaltsfremd: 8_check ist noch leer, zu voll oder enthält lose Ideen statt knapper Fit-Aussagen.\n- S3-E zu viel unvalidiertes Rauschen: unvalidierte Benefits, Information, Functions oder Alternativen verdecken den Kern. Bedeutung: Minimum Desired Product ist noch nicht sichtbar.\n- S3-F Minimum Desired Product ist teilweise sichtbar, aber noch nicht sauber reduziert: ein valider Kern zeichnet sich ab, wird aber noch von Restbeständen überlagert.\n- S3-G validierter Kern ist sichtbar: mehrere belastbare Benefit-Beziehungen oder Fit-Ketten sind erkennbar, und unvalidierte Reste wurden reduziert oder geparkt.\n- S3-H Step 3 ist tragfähig bzw. handoff-ready im Rahmen dieser Übung: der validierte Kern ist sichtbar, wenige knappe Check-Aussagen verdichten ihn, ohne dass ein echter Cross-Canvas-Handoff ausgeführt wird.\n\nAllgemeine Leseregel:\n- Zustände sind semantische Lesarten des Boardkatalogs, keine App-Flags.\n- Interpretiere Validierung, Reduktion, Restrauschen und Readiness aus Benefits, Checkmarks, Check-Feld, Sorted-out-Nutzung und dem Anteil wirklich belastbarer Beziehungen.\n- In Step 3 sind wenige validierte Fit-Ketten oder knappe Check-Aussagen besser als dichte Graphen."
        },
        "analytics.fit.step3.endpoint_behavior": {
          "id": "analytics.fit.step3.endpoint_behavior",
          "label": "Step-3-Endpointverhalten",
          "summary": "Übersetzt die Zustandswelt von Step 3 in passende Hilfeformen je Endpoint.",
          "prompt": "Übersetze den erkannten Step-3-Zustand in die passende Endpointrolle:\n- hint: Priorisiere genau den nächsten Validierungs- oder Reduktionsschritt. Bei S3-A route zurück, bei S3-B/C fokussiere auf belastbare Beziehungen, bei S3-D/E/F auf Check-Feld, Ausdünnung und Kern, bei S3-G/H auf knappe Verdichtung.\n- coach: Arbeite mit 3 bis 5 Leitfragen und genau einem Mikroschritt. Frage explizit, welcher Benefit was auf der rechten Seite adressiert und was für einen validierten Kern wirklich nötig ist.\n- check: Prüfe Vorbedingungen, belastbare Fit-Ketten, sinnvolle Checkmarks, Restrauschen und Sichtbarkeit des Minimum Desired Product. Setze stepStatus gemäß Exit-Kriterien von Step 3.\n- review: Gib eine qualitative Einordnung des Fits, der Validierungstiefe, des Rauschens und der Handoff-Readiness innerhalb dieser Übung. Standardmäßig keine Mutationen.\n- synthesize: Verdichte nur validierten oder weitgehend tragfähigen Fit in 1 bis 3 knappe Check-Aussagen. Wenn die Vorbedingungen fehlen, verweigere die saubere Synthese nicht stillschweigend, sondern benenne, was zuerst validiert oder reduziert werden muss.\n- propose: Zusatzspur. Vorschläge müssen aus dem aktuellen Step-3-Zustand abgeleitet sein. Bei unreifen Vorbedingungen keine aggressive MDP-Reduktion oder Checkmarks vortäuschen; bei partiellem Fit gezielte Validierungs-, Pruning- und Check-Vorschläge machen.\n- autocorrect: Nutze Checkmarks, Parken, Ausdünnen und wenige belastbare Fit-Kanten vorsichtig und nur zustandsbezogen. Markiere nur validierte Beziehungen und mache den Kern sichtbar, ohne das Board neu zu erfinden.\n- grade: Werte die Tragfähigkeit des validierten Kerns, nicht die Menge der Inhalte.\n\nÜbersetzungsregel in Actions:\n- Bevorzuge wenige validierte Markierungen, wenige belastbare Fit-Kanten und knappe Check-Aussagen.\n- Keine Graph-Explosion und keine Schönfärbung unreifer Boards."
        },
        "analytics.fit.step3.exit_criteria": {
          "id": "analytics.fit.step3.exit_criteria",
          "label": "Step-3-Exit-Kriterien",
          "summary": "Beschreibt, wann Fit Validation & Minimum Desired Product als tragfähig gilt.",
          "prompt": "Exit-Kriterien für Step 3:\n- in_progress: solange Vorbedingungen fehlen, Benefits nur behauptet statt validiert sind, zu viel unvalidiertes Rauschen dominiert oder der Kern noch nicht reduziert wurde.\n- ready_for_review: wenn mehrere plausible Benefit-Beziehungen geprüft wurden, erste validierte Beziehungen oder Checkmarks sinnvoll sichtbar sind, Restrauschen reduziert wurde und der Kern des Minimum Desired Product erkennbar ist.\n- completed: nur wenn der validierte Kern klar sichtbar ist, wenige knappe Check-Aussagen im Feld Check stehen und die Übung als handoff-ready beschrieben werden kann, ohne einen echten Handoff auszuführen.\n- Step 3 ist noch nicht tragfähig, wenn Fit nur behauptet wird, Alternativen den Hauptpfad dominieren oder Check-Feld und Checkmarks bloß Dekoration sind.\n- Step 3 darf sauber zurück nach Step 1 oder Step 2 routen, wenn Problemraum oder Lösungsperspektive noch nicht tragfähig genug sind."
        },
        "analytics.fit.shared.proposal_mode": {
          "id": "analytics.fit.shared.proposal_mode",
          "label": "Vorschlagsmodus",
          "summary": "Beschreibt den Zwischenmodus: konkrete Vorschläge zuerst, Umsetzung erst nach Bestätigung.",
          "prompt": "Vorschlagsmodus:\n- In diesem Endpoint ist executionMode = proposal_only Pflicht.\n- actions beschreiben die vorgeschlagenen Änderungen, nicht bereits vollzogene Änderungen.\n- feedback muss für Menschen klar sagen: 1) was du auf dem Board siehst, 2) was du konkret vorschlägst, 3) warum das im aktuellen Schritt sinnvoll ist, 4) dass noch nichts angewendet wurde und was nach einer Bestätigung passieren würde.\n- Bleibe streng im Scope des aktuellen Schritts. Der Vorschlagsmodus ist nicht dazu da, den gesamten Workshop vorwegzunehmen.\n- Materialisiere keine Coaching-Satzanfänge, keine Tutorialformulierungen, keine Platzhalter in eckigen Klammern und keine Meta-Präfixe wie „(HEADER)“, „Offene Frage:“ oder „Geparkt:“ als Sticky-Text.\n- Nutze den Canvas-Chat-Input, falls vorhanden, als optionalen Seed für das Verständnis der Problemstellung oder des gewünschten Fokus.\n- Wenn der relevante Canvas-Bereich leer ist, darfst du einen kleinen, fachlich konkreten Starter-Vorschlag erzeugen – aber nur in dem Umfang, der für den aktuellen Schritt wirklich anschlussfähig ist."
        },
        "analytics.fit.step0.proposal_focus": {
          "id": "analytics.fit.step0.proposal_focus",
          "label": "Vorschläge für Preparation & Focus",
          "summary": "Macht konkrete, aber noch nicht angewendete Fokus- und Scope-Vorschläge.",
          "prompt": "Step-0-Vorschlagslogik:\n- Dieser Vorschlagsmodus ist der sichtbare Start von Preparation & Focus.\n- Nutze vorhandenen Board-Inhalt plus optionalen Chat-Seed, um einen kleinen, klaren Startvorschlag zu erzeugen.\n- Gute Vorschläge sind z. B.: ein konkreter Header-Fokus, 1 bis 2 weiße Scope-/Annahmen-Stickies, das Parken offensichtlicher Alternativen in sorted_out_left.\n- Wenn der Canvas leer ist, darfst du einen kleinen anschlussfähigen Startsatz vorschlagen. Er soll fachlich konkret sein, nicht tutorialhaft.\n- Erkläre im feedback sichtbar, warum genau diese Vorschläge jetzt in Step 0 sinnvoll sind.\n- Entwickle noch keine Nutzeranalyse, keine Lösung und keinen Fit."
        },
        "analytics.fit.step1.proposal_user_analysis": {
          "id": "analytics.fit.step1.proposal_user_analysis",
          "label": "Vorschläge für User Needs Analysis",
          "summary": "Macht konkrete, aber noch nicht angewendete Vorschläge innerhalb der Nutzeranalyse.",
          "prompt": "Step-1-Vorschlagslogik:\n- Dieser Vorschlagsmodus ist der sichtbare Start oder Delta-Modus der Nutzeranalyse.\n- Nutze vorhandenen Board-Inhalt plus optionalen Chat-Seed, um einen kleinen, klaren Vorschlag für die rechte Seite zu erzeugen.\n- Gute Vorschläge sind z. B.: einen Hauptnutzer fokussieren, die Situation konkretisieren, 1 bis 3 Objectives/Results ergänzen, Decisions/Actions präzisieren oder Gains/Pains besser andocken bzw. priorisieren.\n- Wenn die rechte Seite noch sehr leer ist, darfst du einen kleinen Starter-Satz erzeugen. Wenn schon Material vorhanden ist, schlage eher Deltas als einen Komplettneuaufbau vor.\n- Erkläre im feedback sichtbar, warum genau diese Vorschläge jetzt in Step 1 sinnvoll sind.\n- Mache keine Lösungsvorschläge und verdichte keinen Fit vorzeitig."
        },
        "analytics.fit.step2.proposal_solution_design": {
          "id": "analytics.fit.step2.proposal_solution_design",
          "label": "Vorschläge für Solution Design",
          "summary": "Macht konkrete, aber noch nicht angewendete Vorschläge für Variantenwahl und Ableitung der linken Seite.",
          "prompt": "Step-2-Vorschlagslogik:\n- Dieser Vorschlagsmodus ist der sichtbare Start oder Delta-Modus des Solution Design.\n- Lies zuerst den aktuellen Step-2-Zustand.\n- Wenn die rechte Seite noch zu unreif ist, tue nicht so, als sei gute Lösungsableitung schon möglich; benenne die Rückroute nach Step 1 und bevorzuge textliche oder sehr kleine Vorschläge.\n- Wenn die rechte Seite tragfähig ist, schlage einen kleinen, klaren Vorschlag für Variantenwahl und linke Ableitung vor: z. B. eine Hauptvariante fokussieren, Alternativen parken, Information präzisieren, Functions trennen oder Benefits schärfen.\n- Erkläre im feedback sichtbar, warum genau diese Vorschläge jetzt in Step 2 sinnvoll sind.\n- Verdichte keinen Fit und erfinde keine große Architektur."
        },
        "analytics.fit.step3.proposal_fit_validation": {
          "id": "analytics.fit.step3.proposal_fit_validation",
          "label": "Vorschläge für Fit Validation & MDP",
          "summary": "Macht konkrete, aber noch nicht angewendete Vorschläge für Validierung, Checkmarks und Reduktion.",
          "prompt": "Step-3-Vorschlagslogik:\n- Lies zuerst den aktuellen Step-3-Zustand.\n- Wenn Vorbedingungen für Fit-Validierung noch fehlen, tue nicht so, als seien Checkmarks, Check-Feld oder Minimum Desired Product schon belastbar; benenne die Rückroute nach Step 1 oder Step 2 und bevorzuge vorsichtige Vorschläge.\n- Gute zustandsbezogene Vorschläge sind z. B.: wenige Checkmarks für belastbare Benefit-Beziehungen setzen, unvalidierte Benefits/Information/Functions parken oder reduzieren, wenige Check-Aussagen verdichten oder Restrauschen ausdünnen.\n- Beschreibe klar, welche Inhalte bereits belastbar sind, welche nur Alternativen bleiben und welche nach Bestätigung reduziert würden."
        }
      },
      "steps": {
        "step0_preparation_and_focus": {
          "id": "step0_preparation_and_focus",
          "label": {
            "de": "Preparation & Focus"
          },
          "summary": {
            "de": "Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken."
          },
          "visibleInstruction": {
            "de": "Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich."
          },
          "flowInstruction": {
            "de": "Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen."
          },
          "endpoints": [
            {
              "id": "analytics.fit.step0.hint",
              "familyKey": "selection.hint",
              "label": {
                "de": "Hinweis geben"
              },
              "summary": {
                "de": "Gibt einen reinen Hinweis zum nächsten sinnvollen Arbeitsschritt in Step 0."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Hinweismodus für den Schritt \"Preparation & Focus\":\n- Nutze executionMode = none und actions = [].\n- Gib nur Orientierung: 1 bis 3 konkrete nächste Schritte oder Satzanfänge für genau diesen Zustand.\n- Springe nicht in User Analysis, Solution Design oder Fit.\n- Noch keine Board-Vorschläge, noch keine Sticky Notes."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step0.endpoint_behavior",
                  "analytics.fit.step0.bootstrap_blank_canvas"
                ]
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "secondary",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 1
            },
            {
              "id": "analytics.fit.step0.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Fokus coachen"
              },
              "summary": {
                "de": "Coacht Fokus, Scope und offene Annahmen mit Leitfragen und einem Mikroschritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Coachmodus für den Schritt \"Preparation & Focus\":\n- Lies zuerst den semantischen Zustand dieses Schritts.\n- Arbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\n- Kein Rundumschlag und keine Vorwegnahme späterer Schritte.\n- actions sollen normalerweise leer bleiben."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.step0.endpoint_behavior",
                  "analytics.fit.step0.bootstrap_blank_canvas"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "secondary",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "analytics.fit.step0.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Fokus prüfen"
              },
              "summary": {
                "de": "Prüft, ob Fokus und Scope klar genug sind, um in die Nutzeranalyse zu starten."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Prüfmodus für den Schritt \"Preparation & Focus\":\n- Prüfe Fokus, Scope, offene Annahmen und den Umgang mit Nebenthemen.\n- Benenne klar, was für Readiness noch fehlt oder warum Step 0 tragfähig ist.\n- Nimm nur kleine, risikoarme Korrekturen vor.\n- Setze stepStatus gemäß den Exit-Kriterien von Step 0."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.shared.check_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step0.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "primary",
                "sidecarOnly": false,
                "seedByDefault": true
              },
              "order": 3
            },
            {
              "id": "analytics.fit.step0.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Vorbereitung starten"
              },
              "summary": {
                "de": "Erzeugt einen kleinen, konkreten Startvorschlag für Fokus, Scope und offene Annahmen."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Vorschlagsmodus für den Schritt \"Preparation & Focus\":\n- Nutze executionMode = proposal_only.\n- Dieser Endpoint ist der sichtbare Start von Step 0.\n- Nutze vorhandenen Board-Inhalt plus optionalen Chat-Seed, um einen kleinen, anschlussfähigen Startvorschlag für Fokus, Scope und offene Annahmen zu erzeugen.\n- Wenn das Board leer ist, darfst du einen kleinen, fachlich konkreten Starter-Satz vorschlagen: Header plus 1 bis 2 weiße Scope-/Annahmen-Stickies.\n- Erkläre im feedback sichtbar, warum genau diese Vorschläge jetzt sinnvoll sind und dass noch nichts angewendet wurde."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.proposal_mode",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.step0.endpoint_behavior",
                  "analytics.fit.step0.proposal_focus"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "primary",
                "sidecarOnly": false,
                "seedByDefault": true
              },
              "order": 4
            },
            {
              "id": "analytics.fit.step0.apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Fokus-/Scope-Vorschlag auf diese Canvas-Instanz an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Bestätigungsmodus für den Schritt \"Preparation & Focus\":\n- Dieser Endpoint wendet einen zuvor gespeicherten Vorschlag an.\n- Es sollen keine neuen Vorschläge erzeugt und keine neuen Board-Ideen erfunden werden."
                },
                "moduleIds": [
                  "analytics.fit.shared.proposal_mode"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "direct_apply"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "chat_apply",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 5
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step0_preparation_and_focus.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen",
                "en": "Ask question"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt.",
                "en": "Answers questions about the current step."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Canvas-Assistent für den Schritt \"Preparation & Focus\":\n- Antworte instanzbezogen, verständlich und hilfreich auf Fragen zum aktuellen Canvas und nutze den aktuellen Schritt als Primäranker.\n- Nutze den aktuellen Canvas-Zustand, den Schrittkontext und – falls vorhanden – conversationContext mit letzter Endpoint-Antwort, kurzem Gesprächsverlauf und offenem Vorschlag als Grundlage.\n- Du darfst textlich Satzstarter, Alternativen und konkrete Formulierungsoptionen vorschlagen, aber keine Board-Mutationen ausführen und keinen gespeicherten Proposal-Run erzeugen.",
                  "en": "Canvas assistant for the step \"Preparation & Focus\":\n- Answer instance-specific questions helpfully and use the current step as your primary anchor.\n- Use the current canvas state, step context, and – if present – conversationContext with the last endpoint answer, short turn history, and pending proposal as grounding.\n- You may suggest wording and alternatives in text, but do not perform board mutations and do not create a stored proposal run."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.question_style",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.step0.exit_criteria",
                  "analytics.fit.step0.question_preparation"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 1000
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step0_preparation_and_focus.global.hint",
              "familyKey": "global.hint",
              "label": {
                "de": "global.hint"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Hinweismodus für den Schritt \"Preparation & Focus\":\n- Vergleiche über mehrere Instanzen hinweg, welche Boards noch leer, diffus, konkurrierend oder bereits tragfähig fokussiert sind.\n- Gib knappe, wiederverwendbare Hinweise für Fokuswahl, Scope und sichtbare Annahmen."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step0.endpoint_behavior",
                  "analytics.fit.step0.bootstrap_blank_canvas",
                  "analytics.fit.step0.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step0_preparation_and_focus.global.review",
              "familyKey": "global.review",
              "label": {
                "de": "global.review"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Reviewmodus für den Schritt \"Preparation & Focus\":\n- Vergleiche über mehrere Instanzen hinweg Reifegrad, Überbreite, fehlende Abgrenzung und sichtbare Fokusqualität.\n- Fokus auf Muster und Unterschiede, nicht auf Mutationen."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.step0.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step0_preparation_and_focus.selection.autocorrect",
              "familyKey": "selection.autocorrect",
              "label": {
                "de": "selection.autocorrect"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Autokorrekturmodus für den Schritt \"Preparation & Focus\":\n- Korrigiere nur klare Vorbereitungsprobleme dieses Schritts.\n- Erlaube höchstens kleine Eingriffe: Header präzisieren, wenige weiße Annahmen/Fragen ergänzen, Nebenthemen parken.\n- Erfinde keinen neuen Use Case und baue keine Nutzeranalyse, Lösung oder Fit-Logik auf.\n- Erkläre im feedback knapp, was du geändert hast und warum."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step0.endpoint_behavior",
                  "analytics.fit.step0.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step0_preparation_and_focus.selection.review",
              "familyKey": "selection.review",
              "label": {
                "de": "selection.review"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Reviewmodus für den Schritt \"Preparation & Focus\":\n- Gib eine qualitative Einordnung von Fokus, Schärfe, Überbreite und sichtbaren Risiken.\n- Benenne Stärken, Unschärfen und fehlendes Parken.\n- Nimm standardmäßig keine Board-Mutationen vor.\n- Setze stepStatus gemäß den Exit-Kriterien von Step 0."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step0.focus_preparation",
                  "analytics.fit.step0.state_model",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.step0.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            }
          ],
          "transitions": [
            {
              "toStepId": "step1_user_perspective",
              "requiredDoneEndpointIds": [
                "analytics.fit.step0.check",
                "analytics-ai-usecase-fit-sprint-v1.step0_preparation_and_focus.selection.review"
              ],
              "requiredMemoryStepStatus": "ready_for_review"
            },
            {
              "toStepId": "step1_user_perspective",
              "requiredDoneEndpointIds": [
                "analytics.fit.step0.check",
                "analytics-ai-usecase-fit-sprint-v1.step0_preparation_and_focus.selection.review"
              ],
              "requiredMemoryStepStatus": "completed"
            }
          ]
        },
        "step1_user_perspective": {
          "id": "step1_user_perspective",
          "label": {
            "de": "User Needs Analysis"
          },
          "summary": {
            "de": "Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen."
          },
          "visibleInstruction": {
            "de": "Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken."
          },
          "flowInstruction": {
            "de": "Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren."
          },
          "endpoints": [
            {
              "id": "analytics.fit.step1.hint",
              "familyKey": "selection.hint",
              "label": {
                "de": "Hinweis geben"
              },
              "summary": {
                "de": "Gibt einen reinen Hinweis zum nächsten sinnvollen Arbeitsschritt in Step 1."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Hinweismodus für den Schritt \"User Needs Analysis\":\n- Nutze executionMode = none und actions = [].\n- Priorisiere genau einen nächsten Mikro-Arbeitsmodus und gib dazu 1 bis 3 konkrete Formulierungsanstöße.\n- Noch keine Lösung, keine Benefits, kein Fit und keine Board-Vorschläge."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step1.endpoint_behavior",
                  "analytics.fit.step1.bootstrap_empty_user_perspective",
                  "analytics.fit.step1.diverge_and_focus_users",
                  "analytics.fit.step1.attach_and_prioritize_gains_pains"
                ]
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "secondary",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 11
            },
            {
              "id": "analytics.fit.step1.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Nutzeranalyse coachen"
              },
              "summary": {
                "de": "Coacht die Nutzeranalyse mit Leitfragen und genau einem Mikroschritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Coachmodus für den Schritt \"User Needs Analysis\":\n- Lies zuerst den semantischen Zustand dieses Schritts.\n- Arbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\n- Hilf bei Nutzerfokus, Situation, Outcomes, Verhalten und Gains/Pains, ohne die Lösung vorzuziehen.\n- actions sollen normalerweise leer bleiben."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.step1.endpoint_behavior",
                  "analytics.fit.step1.bootstrap_empty_user_perspective",
                  "analytics.fit.step1.diverge_and_focus_users",
                  "analytics.fit.step1.attach_and_prioritize_gains_pains"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "secondary",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 12
            },
            {
              "id": "analytics.fit.step1.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Nutzeranalyse prüfen"
              },
              "summary": {
                "de": "Prüft, ob die Nutzeranalyse tragfähig genug ist, um daraus eine Lösung abzuleiten."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Prüfmodus für den Schritt \"User Needs Analysis\":\n- Prüfe in dieser Reihenfolge: Hauptnutzer & Situation, Objectives & Results, Decisions & Actions, Gains/Pains.\n- Benenne klar, welche Reifestufe fehlt oder warum Step 1 tragfähig genug für Step 2 ist.\n- Korrigiere nur klare Fehlplatzierungen, Verwechslungen oder offensichtliche Überladung.\n- Setze stepStatus gemäß den Exit-Kriterien von Step 1."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.shared.check_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step1.exit_criteria",
                  "analytics.fit.step1.diverge_and_focus_users",
                  "analytics.fit.step1.attach_and_prioritize_gains_pains"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "primary",
                "sidecarOnly": false,
                "seedByDefault": true
              },
              "order": 13
            },
            {
              "id": "analytics.fit.step1.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Nutzeranalyse starten"
              },
              "summary": {
                "de": "Erzeugt einen kleinen, konkreten Start- oder Delta-Vorschlag für die Nutzeranalyse."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Vorschlagsmodus für den Schritt \"User Needs Analysis\":\n- Nutze executionMode = proposal_only.\n- Dieser Endpoint ist der sichtbare Start oder Delta-Modus von Step 1.\n- Nutze vorhandenen Board-Inhalt plus optionalen Chat-Seed, um einen kleinen, klaren Vorschlag für Hauptnutzer, Situation, Objectives/Results, Decisions/Actions und Gains/Pains zu erzeugen.\n- Wenn die rechte Seite noch leer ist, darfst du einen kleinen Starter-Satz vorschlagen. Wenn schon Material vorhanden ist, schlage eher Deltas als einen Komplettneuaufbau vor.\n- Erkläre im feedback sichtbar, warum genau diese Vorschläge jetzt sinnvoll sind und dass noch nichts angewendet wurde."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.proposal_mode",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.step1.endpoint_behavior",
                  "analytics.fit.step1.diverge_and_focus_users",
                  "analytics.fit.step1.attach_and_prioritize_gains_pains",
                  "analytics.fit.step1.proposal_user_analysis"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "primary",
                "sidecarOnly": false,
                "seedByDefault": true
              },
              "order": 14
            },
            {
              "id": "analytics.fit.step1.apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag zur Nutzeranalyse auf diese Canvas-Instanz an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Bestätigungsmodus für den Schritt \"User Needs Analysis\":\n- Dieser Endpoint wendet einen zuvor gespeicherten Vorschlag an.\n- Erzeuge keine neuen Ideen und keine neue Analyse, sondern führe nur den bestätigten Vorschlag aus."
                },
                "moduleIds": [
                  "analytics.fit.shared.proposal_mode"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "direct_apply"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "chat_apply",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 15
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen",
                "en": "Ask question"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt.",
                "en": "Answers questions about the current step."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Canvas-Assistent für den Schritt \"User Needs Analysis\":\n- Antworte instanzbezogen, verständlich und hilfreich auf Fragen zum aktuellen Canvas und nutze den aktuellen Schritt als Primäranker.\n- Nutze den aktuellen Canvas-Zustand, den Schrittkontext und – falls vorhanden – conversationContext mit letzter Endpoint-Antwort, kurzem Gesprächsverlauf und offenem Vorschlag als Grundlage.\n- Du darfst textlich Satzstarter, Alternativen und konkrete Formulierungsoptionen vorschlagen, aber keine Board-Mutationen ausführen und keinen gespeicherten Proposal-Run erzeugen.",
                  "en": "Canvas assistant for the step \"User Needs Analysis\":\n- Answer instance-specific questions helpfully and use the current step as your primary anchor.\n- Use the current canvas state, step context, and – if present – conversationContext with the last endpoint answer, short turn history, and pending proposal as grounding.\n- You may suggest wording and alternatives in text, but do not perform board mutations and do not create a stored proposal run."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.question_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.step1.exit_criteria",
                  "analytics.fit.step1.diverge_and_focus_users",
                  "analytics.fit.step1.attach_and_prioritize_gains_pains",
                  "analytics.fit.step1.question_user_analysis"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 1000
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.global.autocorrect",
              "familyKey": "global.autocorrect",
              "label": {
                "de": "global.autocorrect"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Autokorrekturmodus für den Schritt \"User Needs Analysis\":\n- Korrigiere über mehrere Instanzen hinweg nur eindeutige Fehlplatzierungen oder sehr offensichtliche Strukturprobleme der rechten Seite.\n- Keine Vorwegnahme der linken Lösungsperspektive."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.global.check",
              "familyKey": "global.check",
              "label": {
                "de": "global.check"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Prüfmodus für den Schritt \"User Needs Analysis\":\n- Vergleiche über mehrere Instanzen hinweg Reifegrad und Step-2-Bereitschaft der Nutzeranalyse.\n- Benenne klar, wo Hauptnutzer, Situation, Outcomes, Verhalten oder Gains/Pains noch nicht tragfähig genug sind."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.shared.check_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step1.exit_criteria",
                  "analytics.fit.step1.diverge_and_focus_users",
                  "analytics.fit.step1.attach_and_prioritize_gains_pains"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.global.coach",
              "familyKey": "global.coach",
              "label": {
                "de": "global.coach"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Coachmodus für den Schritt \"User Needs Analysis\":\n- Gib übergreifende Leitfragen und eine klare Orientierung, wie Teams ihre Nutzeranalyse weiter schärfen sollten.\n- Mache sichtbar, wo noch Divergenz nötig ist und wo bereits fokussiert werden sollte."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.global.hint",
              "familyKey": "global.hint",
              "label": {
                "de": "global.hint"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Hinweismodus für den Schritt \"User Needs Analysis\":\n- Vergleiche über mehrere Instanzen hinweg, welche Boards noch in Nutzerdivergenz, Situationsunschärfe, Outcome-/Verhaltensunklarheit oder Gains/Pains-Überladung stecken.\n- Gib knappe Hinweise, welcher Mikro-Arbeitsmodus je Board als Nächstes sinnvoll wäre."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step1.endpoint_behavior",
                  "analytics.fit.step1.bootstrap_empty_user_perspective",
                  "analytics.fit.step1.diverge_and_focus_users",
                  "analytics.fit.step1.attach_and_prioritize_gains_pains",
                  "analytics.fit.step1.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.global.review",
              "familyKey": "global.review",
              "label": {
                "de": "global.review"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Reviewmodus für den Schritt \"User Needs Analysis\":\n- Vergleiche mehrere Nutzeranalysen hinsichtlich Fokus, Präzision, Strukturierung und Didaktik.\n- Hebe hervor, welche Boards bereit für Step 2 sind und welche noch im Problemraum vertieft werden müssen."
                },
                "moduleIds": []
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.selection.autocorrect",
              "familyKey": "selection.autocorrect",
              "label": {
                "de": "selection.autocorrect"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Autokorrekturmodus für den Schritt \"User Needs Analysis\":\n- Korrigiere nur klare Probleme auf der rechten Seite.\n- Fokussiere Hauptnutzer, schärfe Situation, trenne Outcomes von Verhalten und docke Gains/Pains sinnvoll an.\n- Ergänze höchstens wenige notwendige Stickies und parke Überfluss bewusst.\n- Entwickle keine Lösung, keine Benefits und keinen Fit."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step1.endpoint_behavior",
                  "analytics.fit.step1.diverge_and_focus_users",
                  "analytics.fit.step1.attach_and_prioritize_gains_pains",
                  "analytics.fit.step1.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.selection.review",
              "familyKey": "selection.review",
              "label": {
                "de": "selection.review"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Reviewmodus für den Schritt \"User Needs Analysis\":\n- Gib eine qualitative Einordnung des Problemraums: Reifegrad, Stärken, Widersprüche, Überladung und fehlende Vorarbeit.\n- Prüfe besonders, ob zu früh in Lösungen gesprungen wird oder Gains/Pains nur lose gesammelt bleiben.\n- Nimm standardmäßig keine Board-Mutationen vor.\n- Setze stepStatus gemäß den Exit-Kriterien von Step 1."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step1.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.selection.synthesize",
              "familyKey": "selection.synthesize",
              "label": {
                "de": "selection.synthesize"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Synthesemodus für den Schritt \"User Needs Analysis\":\n- Führe keine Lösungs- oder Fit-Synthese durch.\n- Verdichte nur den Stand der Nutzeranalyse: Hauptnutzer, Situation, wichtigste Objectives/Results, Decisions/Actions und kritische Gains/Pains.\n- Wenn die Nutzeranalyse noch unreif ist, sage das explizit.\n- actions sollen normalerweise leer bleiben."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step1.focus_user_perspective",
                  "analytics.fit.step1.state_model",
                  "analytics.fit.shared.synthesis_style",
                  "analytics.fit.step1.endpoint_behavior",
                  "analytics.fit.step1.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            }
          ],
          "transitions": [
            {
              "toStepId": "step2_solution_perspective",
              "requiredDoneEndpointIds": [
                "analytics.fit.step1.check",
                "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.selection.review"
              ],
              "requiredMemoryStepStatus": "ready_for_review"
            },
            {
              "toStepId": "step2_solution_perspective",
              "requiredDoneEndpointIds": [
                "analytics.fit.step1.check",
                "analytics-ai-usecase-fit-sprint-v1.step1_user_perspective.selection.review"
              ],
              "requiredMemoryStepStatus": "completed"
            }
          ]
        },
        "step2_solution_perspective": {
          "id": "step2_solution_perspective",
          "label": {
            "de": "Solution Design"
          },
          "summary": {
            "de": "Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung."
          },
          "visibleInstruction": {
            "de": "Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren."
          },
          "flowInstruction": {
            "de": "Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren."
          },
          "endpoints": [
            {
              "id": "analytics.fit.step2.hint",
              "familyKey": "selection.hint",
              "label": {
                "de": "Hinweis geben"
              },
              "summary": {
                "de": "Gibt einen reinen Hinweis zum nächsten sinnvollen Arbeitsschritt in Step 2."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Hinweismodus für den Schritt \"Solution Design\":\n- Nutze executionMode = none und actions = [].\n- Priorisiere genau einen Mikro-Arbeitsmodus: Rückroute, Variantenwahl, Informationsableitung, Funktionsableitung oder Benefit-Schärfung.\n- Gib nur textliche Orientierung und keine Board-Vorschläge."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "secondary",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 21
            },
            {
              "id": "analytics.fit.step2.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Solution Design coachen"
              },
              "summary": {
                "de": "Coacht Variantenwahl und Ableitung von Information, Functions und Benefits."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Coachmodus für den Schritt \"Solution Design\":\n- Lies zuerst den semantischen Zustand dieses Schritts.\n- Arbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\n- Hilf bei Variantenwahl, Ableitung und Trennung der linken Ebenen, ohne eine Komplettarchitektur vorzugeben.\n- actions sollen normalerweise leer bleiben."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "secondary",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 22
            },
            {
              "id": "analytics.fit.step2.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Solution Design prüfen"
              },
              "summary": {
                "de": "Prüft, ob die Lösungsperspektive fokussiert und sauber aus Step 1 abgeleitet ist."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Prüfmodus für den Schritt \"Solution Design\":\n- Prüfe zuerst, ob Step 1 tragfähig genug für saubere Ableitung ist.\n- Prüfe dann Hauptvariante, Sorted-out-Nutzung, Trennung von Solution / Information / Function / Benefit und die Plausibilität der Benefits.\n- Korrigiere nur klare Fehlplatzierungen oder grobe Unschärfen.\n- Setze stepStatus gemäß den Exit-Kriterien von Step 2."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.check_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "primary",
                "sidecarOnly": false,
                "seedByDefault": true
              },
              "order": 23
            },
            {
              "id": "analytics.fit.step2.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Lösungsperspektive starten"
              },
              "summary": {
                "de": "Erzeugt einen kleinen, konkreten Start- oder Delta-Vorschlag für die linke Seite."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Vorschlagsmodus für den Schritt \"Solution Design\":\n- Nutze executionMode = proposal_only.\n- Dieser Endpoint ist der sichtbare Start oder Delta-Modus von Step 2.\n- Lies zuerst, ob die rechte Seite schon tragfähig genug ist. Wenn nicht, benenne die Rückroute nach Step 1 und mache höchstens kleine Vorschläge.\n- Wenn die rechte Seite tragfähig ist, schlage einen kleinen, klaren Vorschlag für Variantenwahl und Ableitung der linken Seite vor.\n- Erkläre im feedback sichtbar, warum genau diese Vorschläge jetzt sinnvoll sind und dass noch nichts angewendet wurde."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.proposal_mode",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.choose_variant_and_park_alternatives",
                  "analytics.fit.step2.proposal_solution_design"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "primary",
                "sidecarOnly": false,
                "seedByDefault": true
              },
              "order": 24
            },
            {
              "id": "analytics.fit.step2.apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Lösungsvorschlag auf diese Canvas-Instanz an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Bestätigungsmodus für den Schritt \"Solution Design\":\n- Dieser Endpoint wendet einen zuvor gespeicherten Vorschlag an.\n- Erzeuge keine neue Lösungsanalyse, sondern führe nur den bestätigten Vorschlag aus."
                },
                "moduleIds": [
                  "analytics.fit.shared.proposal_mode"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "direct_apply"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "chat_apply",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 25
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen",
                "en": "Ask question"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt.",
                "en": "Answers questions about the current step."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Canvas-Assistent für den Schritt \"Solution Design\":\n- Antworte instanzbezogen, verständlich und hilfreich auf Fragen zum aktuellen Canvas und nutze den aktuellen Schritt als Primäranker.\n- Nutze den aktuellen Canvas-Zustand, den Schrittkontext und – falls vorhanden – conversationContext mit letzter Endpoint-Antwort, kurzem Gesprächsverlauf und offenem Vorschlag als Grundlage.\n- Du darfst textlich Satzstarter, Alternativen und konkrete Formulierungsoptionen vorschlagen, aber keine Board-Mutationen ausführen und keinen gespeicherten Proposal-Run erzeugen.",
                  "en": "Canvas assistant for the step \"Solution Design\":\n- Answer instance-specific questions helpfully and use the current step as your primary anchor.\n- Use the current canvas state, step context, and – if present – conversationContext with the last endpoint answer, short turn history, and pending proposal as grounding.\n- You may suggest wording and alternatives in text, but do not perform board mutations and do not create a stored proposal run."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.question_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.choose_variant_and_park_alternatives",
                  "analytics.fit.step2.question_solution_design"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 1000
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.global.autocorrect",
              "familyKey": "global.autocorrect",
              "label": {
                "de": "global.autocorrect"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Autokorrekturmodus für den Schritt \"Solution Design\":\n- Korrigiere über mehrere Instanzen hinweg nur eindeutige Vermischungen oder Fehlplatzierungen auf der linken Seite.\n- Keine globale Vollvernetzung und keine freie Architektur-Erfindung."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.global.check",
              "familyKey": "global.check",
              "label": {
                "de": "global.check"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Prüfmodus für den Schritt \"Solution Design\":\n- Vergleiche über mehrere Instanzen hinweg Reifegrad und Step-3-Bereitschaft der Lösungsperspektive.\n- Benenne klar, wo Hauptvariante, Ableitung, Informationslogik, Funktionslogik oder Benefit-Qualität noch nicht tragfähig genug sind."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.check_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.global.coach",
              "familyKey": "global.coach",
              "label": {
                "de": "global.coach"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Coachmodus für den Schritt \"Solution Design\":\n- Gib übergreifende Leitfragen dazu, wie Teams ihre Lösungsperspektive fokussieren und sauber ableiten können.\n- Mache deutlich, ob eher Variantenwahl, Informationsableitung, Funktionsableitung oder Benefit-Qualität das Problem ist."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.global.hint",
              "familyKey": "global.hint",
              "label": {
                "de": "global.hint"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Hinweismodus für den Schritt \"Solution Design\":\n- Vergleiche über mehrere Instanzen hinweg, welche Boards noch in Step-1-Rückroute, Variantendivergenz, fehlender Fokusvariante, Ebenenvermischung oder generischen Benefits stecken.\n- Gib knappe Hinweise, welcher Mikro-Arbeitsmodus je Board als Nächstes sinnvoll wäre."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.shared.soft_reference_hints",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.bootstrap_empty_solution_perspective",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.global.review",
              "familyKey": "global.review",
              "label": {
                "de": "global.review"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Reviewmodus für den Schritt \"Solution Design\":\n- Vergleiche mehrere Boards hinsichtlich Variantenwahl, Fokussierung, Ableitung und Nutzennähe der linken Seite.\n- Hebe hervor, welche Instanzen bereit für Step 3 sind und welche noch in Step 2 nachschärfen müssen."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.selection.autocorrect",
              "familyKey": "selection.autocorrect",
              "label": {
                "de": "selection.autocorrect"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Autokorrekturmodus für den Schritt \"Solution Design\":\n- Korrigiere nur klare Probleme der linken Seite.\n- Trenne vermischte Ebenen, fokussiere eine Hauptvariante, parke Alternativen in sorted_out_right und schärfe nur wenige notwendige Benefits.\n- Ergänze Connectoren nur selektiv, wo eine konkrete Unterstützungs- oder Ableitungsbeziehung klar ist.\n- Erfinde keinen validierten Fit und keine große Architektur."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.selection.review",
              "familyKey": "selection.review",
              "label": {
                "de": "selection.review"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Reviewmodus für den Schritt \"Solution Design\":\n- Gib eine qualitative Einordnung der linken Seite: Variantendenken, Fokussierung, Ableitung, Nutzennähe und solutionistische Sprünge.\n- Benenne klar, ob Step 2 bereit für Step 3 ist oder noch im Problemraum oder in der Lösungsperspektive nachgeschärft werden muss.\n- Nimm standardmäßig keine Board-Mutationen vor.\n- Setze stepStatus gemäß den Exit-Kriterien von Step 2."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria",
                  "analytics.fit.step2.choose_variant_and_park_alternatives"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.selection.synthesize",
              "familyKey": "selection.synthesize",
              "label": {
                "de": "selection.synthesize"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Synthesemodus für den Schritt \"Solution Design\":\n- Führe keine Fit-Synthese durch.\n- Verdichte nur, welche Hauptvariante, Information, Functions und Benefits aktuell plausibel sichtbar sind.\n- Wenn noch keine klare Hauptvariante oder keine tragfähige Ableitung erkennbar ist, sage das explizit.\n- actions sollen normalerweise leer bleiben."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step2.focus_solution_perspective",
                  "analytics.fit.step2.state_model",
                  "analytics.fit.shared.synthesis_style",
                  "analytics.fit.step2.endpoint_behavior",
                  "analytics.fit.step2.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            }
          ],
          "transitions": [
            {
              "toStepId": "step3_fit_check_and_synthesis",
              "requiredDoneEndpointIds": [
                "analytics.fit.step2.check",
                "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.selection.review"
              ],
              "requiredMemoryStepStatus": "ready_for_review"
            },
            {
              "toStepId": "step3_fit_check_and_synthesis",
              "requiredDoneEndpointIds": [
                "analytics.fit.step2.check",
                "analytics-ai-usecase-fit-sprint-v1.step2_solution_perspective.selection.review"
              ],
              "requiredMemoryStepStatus": "completed"
            }
          ]
        },
        "step3_fit_check_and_synthesis": {
          "id": "step3_fit_check_and_synthesis",
          "label": {
            "de": "Fit Validation & Minimum Desired Product"
          },
          "summary": {
            "de": "Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen."
          },
          "visibleInstruction": {
            "de": "Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check."
          },
          "flowInstruction": {
            "de": "Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check."
          },
          "endpoints": [
            {
              "id": "analytics.fit.step3.review",
              "familyKey": "selection.review",
              "label": {
                "de": "Fit validieren"
              },
              "summary": {
                "de": "Führt einen qualitativen Fit-Review durch und zeigt, ob der Canvas schon handoff-ready wäre oder noch nicht."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Reviewmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Gib eine qualitative Einordnung des Fits: Validierungstiefe, adressierte Pains/Gains/Outcomes, Restrauschen und Handoff-Readiness innerhalb dieser Übung.\n- Benenne klar, ob der Canvas weiter validieren, reduzieren oder sauber in frühere Schritte zurückmuss.\n- Nimm standardmäßig keine Board-Mutationen vor.\n- Setze stepStatus gemäß den Exit-Kriterien von Step 3."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "primary",
                "sidecarOnly": false,
                "seedByDefault": true
              },
              "order": 31
            },
            {
              "id": "analytics.fit.step3.autocorrect",
              "familyKey": "selection.autocorrect",
              "label": {
                "de": "Minimum Desired Product herausarbeiten"
              },
              "summary": {
                "de": "Markiert validierte Inhalte, dünnt Reste aus und arbeitet den tragfähigen Kern als Minimum Desired Product heraus."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Autokorrekturmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Nutze Checkmarks, Parken, Ausdünnen und wenige belastbare Fit-Kanten nur zustandsbezogen.\n- Markiere nur validierte Beziehungen, parke Alternativen bevorzugt in sorted_out_right und mache den Kern des Minimum Desired Product sichtbar.\n- Erfinde keine neue Struktur und erkläre im feedback klar, was validiert, geparkt oder reduziert wurde."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "both",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "primary",
                "sidecarOnly": false,
                "seedByDefault": true
              },
              "order": 32
            },
            {
              "id": "analytics.fit.step3.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Fit-Validierung coachen"
              },
              "summary": {
                "de": "Coacht die Validierung des Fits mit Leitfragen, ohne den Schritt vorwegzunehmen."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Coachmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Lies zuerst den semantischen Zustand dieses Schritts.\n- Arbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\n- Frage explizit, welcher Benefit was auf der rechten Seite wirklich adressiert und was für den validierten Kern nötig ist.\n- actions sollen normalerweise leer bleiben."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "secondary",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 33
            },
            {
              "id": "analytics.fit.step3.synthesize",
              "familyKey": "selection.synthesize",
              "label": {
                "de": "Check verdichten"
              },
              "summary": {
                "de": "Verdichtet den validierten Kern des Fits in kurze Aussagen im Check-Feld."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Synthesemodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Verdichte nur validierten oder weitgehend tragfähigen Fit.\n- Formuliere 1 bis 3 knappe Check-Aussagen im Feld Check.\n- Wenn die Vorbedingungen noch nicht ausreichen, sage klar, was zuerst validiert oder reduziert werden muss.\n- Ergänze höchstens wenige belastbare Fit-Kanten und nimm keine große Restrukturierung vor."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_synthesis",
                  "analytics.fit.shared.synthesis_style",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_check_status",
                  "set_sticky_color"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "secondary",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 34
            },
            {
              "id": "analytics.fit.step3.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Validierungs-/MDP-Vorschläge erzeugen"
              },
              "summary": {
                "de": "Erzeugt konkrete, aber noch nicht angewendete Vorschläge für Checkmarks, Pruning und Minimum Desired Product."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Vorschlagsmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Analysiere die bestehende Fit-Logik und schlage konkrete Board-Änderungen vor, die validieren, markieren, ausdünnen und auf ein Minimum Desired Product reduzieren.\n- Gute Vorschläge benennen klar, welche Benefits und rechten Elemente Checkmarks bekommen sollten, welche Inhalte als Alternative in sorted_out_right bleiben und welche Inhalte nach Bestätigung reduziert oder entfernt würden.\n- Noch nichts davon ist angewendet. Beschreibe im feedback klar den Unterschied zwischen aktuellem Zustand und Vorschlag."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.proposal_mode",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.exit_criteria",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.proposal_fit_validation"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 34
            },
            {
              "id": "analytics.fit.step3.apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Validierungs-/MDP-Vorschlag auf diese Canvas-Instanz an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Bestätigungsmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Dieser Endpoint wendet einen zuvor gespeicherten Vorschlag an.\n- Erzeuge keine neue Validierungsanalyse, sondern führe nur den bestätigten Vorschlag aus."
                },
                "moduleIds": [
                  "analytics.fit.shared.proposal_mode"
                ]
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "direct_apply"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "chat_apply",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 35
            },
            {
              "id": "analytics.fit.global.review",
              "familyKey": "global.review",
              "label": {
                "de": "Boards vergleichen"
              },
              "summary": {
                "de": "Vergleicht mehrere Boards auf Fit-Reife, MDP-Fokus und wiederkehrende Qualitätsmuster."
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Reviewmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Vergleiche mehrere Instanzen auf Validierungstiefe, Minimum-Desired-Product-Fokus, Rest-Rauschen und Handoff-Readiness innerhalb dieser Übung.\n- Fokus auf Muster und Unterschiede, nicht auf Massenmutation."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.review_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.exit_criteria",
                  "analytics.fit.global.focus_cross_instance_review"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "board_button",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 39
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step3_fit_check_and_synthesis.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen",
                "en": "Ask question"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt.",
                "en": "Answers questions about the current step."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Canvas-Assistent für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Antworte instanzbezogen, verständlich und hilfreich auf Fragen zum aktuellen Canvas und nutze den aktuellen Schritt als Primäranker.\n- Nutze den aktuellen Canvas-Zustand, den Schrittkontext und – falls vorhanden – conversationContext mit letzter Endpoint-Antwort, kurzem Gesprächsverlauf und offenem Vorschlag als Grundlage.\n- Du darfst textlich Satzstarter, Alternativen und konkrete Formulierungsoptionen vorschlagen, aber keine Board-Mutationen ausführen und keinen gespeicherten Proposal-Run erzeugen.",
                  "en": "Canvas assistant for the step \"Fit Validation & Minimum Desired Product\":\n- Answer instance-specific questions helpfully and use the current step as your primary anchor.\n- Use the current canvas state, step context, and – if present – conversationContext with the last endpoint answer, short turn history, and pending proposal as grounding.\n- You may suggest wording and alternatives in text, but do not perform board mutations and do not create a stored proposal run."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.question_style",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.exit_criteria",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.question_fit_validation"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": []
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 1000
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step3_fit_check_and_synthesis.global.coach",
              "familyKey": "global.coach",
              "label": {
                "de": "global.coach"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Coachmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Gib übergreifende Leitfragen dazu, welche Boards weiter validieren, welche reduzieren und welche sauber in frühere Schritte zurück sollten."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.coach_style",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria",
                  "analytics.fit.global.focus_cross_instance_review"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step3_fit_check_and_synthesis.global.grade",
              "familyKey": "global.grade",
              "label": {
                "de": "global.grade"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Bewertungsmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Bewerte die Gesamtqualität des validierten Kerns über mehrere Instanzen hinweg.\n- Liefere zusätzlich eine evaluation mit Rubrik."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria",
                  "analytics.fit.global.focus_cross_instance_review"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step3_fit_check_and_synthesis.global.hint",
              "familyKey": "global.hint",
              "label": {
                "de": "global.hint"
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Globaler Hinweismodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Vergleiche über mehrere Instanzen hinweg, welche Boards noch Vorbedingungen klären, welche validieren, welche reduzieren und welche bereits einen sichtbaren Kern haben.\n- Gib knappe Hinweise, welcher Mikro-Arbeitsmodus je Board als Nächstes sinnvoll wäre."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria",
                  "analytics.fit.global.focus_cross_instance_review"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step3_fit_check_and_synthesis.selection.check",
              "familyKey": "selection.check",
              "label": {
                "de": "selection.check"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Prüfmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Prüfe Vorbedingungen, belastbare Fit-Ketten, sinnvolle Checkmarks, Restrauschen und Sichtbarkeit des Minimum Desired Product.\n- Nimm nur kleine, klare Korrekturen vor.\n- Setze stepStatus gemäß den Exit-Kriterien von Step 3."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.check_style",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step3_fit_check_and_synthesis.selection.grade",
              "familyKey": "selection.grade",
              "label": {
                "de": "selection.grade"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Bewertungsmodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Bewerte Validierungstiefe, Kernfokus, Rest-Rauschen, Check-Feld-Qualität und Handoff-Readiness innerhalb dieser Übung.\n- Werte den tragfähigen Kern, nicht die Menge der Inhalte.\n- Liefere zusätzlich eine evaluation mit Rubrik."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.step_status_rules",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            },
            {
              "id": "analytics-ai-usecase-fit-sprint-v1.step3_fit_check_and_synthesis.selection.hint",
              "familyKey": "selection.hint",
              "label": {
                "de": "selection.hint"
              },
              "scope": {
                "mode": "selection",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Hinweismodus für den Schritt \"Fit Validation & Minimum Desired Product\":\n- Nutze executionMode = none und actions = [].\n- Priorisiere genau den nächsten Validierungs- oder Reduktionsschritt.\n- Gib nur textliche Orientierung und keine Board-Vorschläge."
                },
                "moduleIds": [
                  "analytics.fit.shared.method_guardrails",
                  "analytics.fit.shared.feedback_contract",
                  "analytics.fit.shared.no_handoff_boundary",
                  "analytics.fit.step3.state_model",
                  "analytics.fit.step3.focus_fit_review",
                  "analytics.fit.shared.hint_style",
                  "analytics.fit.shared.validation_and_color_semantics",
                  "analytics.fit.shared.sorted_out_semantics",
                  "analytics.fit.step3.endpoint_behavior",
                  "analytics.fit.step3.bootstrap_incomplete_fit",
                  "analytics.fit.step3.prune_to_mdp",
                  "analytics.fit.step3.exit_criteria"
                ]
              },
              "run": {
                "mutationPolicy": "none",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ]
              },
              "surface": {
                "channel": "hidden",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 9007199254740991
            }
          ],
          "transitions": []
        }
      }
    }
  }
}`));

export const METHOD_CATALOG = RAW_METHOD_CATALOG;

const exercisePacks = {};
const endpoints = {};
const promptModules = {};

for (const [packId, packDef] of Object.entries(METHOD_CATALOG.packs || {})) {
  const exercisePack = buildExercisePackProjection({ exercisePackId: packId, ...cloneJson(packDef) });
  if (exercisePack?.id) {
    exercisePacks[exercisePack.id] = exercisePack;
  }

  for (const rawModule of Object.values((packDef?.promptModules && typeof packDef.promptModules === "object") ? packDef.promptModules : {})) {
    const moduleProjection = buildPromptModuleProjection(rawModule);
    if (moduleProjection?.id) {
      promptModules[moduleProjection.id] = moduleProjection;
    }
  }

  for (const [stepId, rawStepDef] of Object.entries((packDef?.steps && typeof packDef.steps === "object") ? packDef.steps : {})) {
    const rawStep = rawStepDef && typeof rawStepDef === "object" ? { id: stepId, ...rawStepDef } : { id: stepId };
    for (const rawEndpoint of Array.isArray(rawStep.endpoints) ? rawStep.endpoints : []) {
      const endpointProjection = buildEndpointProjection(rawEndpoint, rawStep, { exercisePackId: packId, ...packDef });
      if (endpointProjection?.id) {
        endpoints[endpointProjection.id] = endpointProjection;
      }
    }
  }
}

export const EXERCISE_PACKS = Object.freeze(exercisePacks);
export const ENDPOINTS = Object.freeze(endpoints);
export const PROMPT_MODULES = Object.freeze(promptModules);

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
  if (!pack || !Array.isArray(pack.allowedCanvasTypeIds)) return [];
  return normalizeStringArray(pack.allowedCanvasTypeIds);
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
  if (!Array.isArray(pack?.steps)) return [];
  const lang = getMethodLanguage(options);
  return pack.steps.map((step) => localizeExerciseStepProjection(step, pack.id, lang));
}

export function getExerciseStep(packOrId, stepId, options = {}) {
  const pack = getRawExercisePack(packOrId);
  const normalizedStepId = asNonEmptyString(stepId);
  if (!pack || !normalizedStepId || !Array.isArray(pack.steps)) return null;
  const step = pack.steps.find((entry) => entry.id === normalizedStepId) || null;
  return step ? localizeExerciseStepProjection(step, pack.id, getMethodLanguage(options)) : null;
}

export function getDefaultStepId(packOrId) {
  const pack = getRawExercisePack(packOrId);
  const explicit = asNonEmptyString(pack?.defaultStepId);
  if (explicit && getExerciseStep(pack, explicit)) return explicit;
  const firstStep = listExerciseSteps(pack)[0];
  return firstStep?.id || null;
}

export function getNextExerciseStep(packOrId, afterStepId, options = {}) {
  const steps = listExerciseSteps(packOrId, options);
  if (!steps.length) return null;
  const normalizedAfterStepId = asNonEmptyString(afterStepId);
  if (!normalizedAfterStepId) return steps[0] || null;
  const currentIndex = steps.findIndex((step) => step?.id === normalizedAfterStepId);
  if (currentIndex === -1) return steps[0] || null;
  return steps[currentIndex + 1] || null;
}


export function listStepTransitions(packOrStep, maybeStepId = null) {
  const step = maybeStepId == null ? packOrStep : getExerciseStep(packOrStep, maybeStepId);
  if (!Array.isArray(step?.transitions)) return [];
  return step.transitions.map((transition) => ({
    toStepId: asNonEmptyString(transition?.toStepId),
    requiredDoneEndpointIds: normalizeStringArray(transition?.requiredDoneEndpointIds),
    requiredMemoryStepStatus: asNonEmptyString(transition?.requiredMemoryStepStatus) || null
  })).filter((transition) => !!transition.toStepId);
}

export function resolveNamedTransition(packOrStep, stepIdOrToStepId, maybeToStepId = null) {
  const transitions = maybeToStepId == null ? listStepTransitions(packOrStep) : listStepTransitions(packOrStep, stepIdOrToStepId);
  const wantedToStepId = asNonEmptyString(maybeToStepId == null ? stepIdOrToStepId : maybeToStepId);
  if (!wantedToStepId) return null;
  return transitions.find((transition) => transition.toStepId === wantedToStepId) || null;
}

export function listEndpointsForPack(packOrId, options = {}) {
  const pack = getRawExercisePack(packOrId);
  if (!pack) return [];
  const lang = getMethodLanguage(options);
  return Object.values(ENDPOINTS).filter((endpoint) => endpoint.exercisePackId === pack.id).map((endpoint) => localizeEndpointProjection(endpoint, lang)).sort(compareEndpointOrder);
}

export function listStepEndpoints(packOrId, stepId, options = {}) {
  const pack = getRawExercisePack(packOrId);
  const normalizedStepId = asNonEmptyString(stepId);
  if (!pack || !normalizedStepId) return [];
  const lang = getMethodLanguage(options);
  return listEndpointsForPack(pack, options).filter((endpoint) => endpoint.stepId === normalizedStepId).map((endpoint) => localizeEndpointProjection(endpoint, lang)).sort(compareEndpointOrder);
}

export function listStepEndpointsForSurface(packOrId, stepId, surfaceGroup, options = {}) {
  const group = normalizeSurfaceGroup(surfaceGroup);
  return listStepEndpoints(packOrId, stepId, options).filter((endpoint) => endpoint.surface?.group === group);
}

export function getEndpointById(id, options = {}) {
  const normalizedId = asNonEmptyString(id);
  const endpoint = normalizedId && ENDPOINTS[normalizedId] ? ENDPOINTS[normalizedId] : null;
  return localizeEndpointProjection(endpoint, getMethodLanguage(options));
}



export function isSidecarOnlyEndpoint(endpoint) {
  return endpoint?.surface?.sidecarOnly === true;
}

export function getPromptModuleById(id, options = {}) {
  const normalizedId = asNonEmptyString(id);
  const moduleProjection = normalizedId && PROMPT_MODULES[normalizedId] ? PROMPT_MODULES[normalizedId] : null;
  return localizePromptModuleProjection(moduleProjection, getMethodLanguage(options));
}

export function getPromptModulesByIds(ids, options = {}) {
  const lang = getMethodLanguage(options);
  return normalizeStringArray(ids)
    .map((id) => PROMPT_MODULES[id])
    .filter(Boolean)
    .map((moduleProjection) => localizePromptModuleProjection(moduleProjection, lang));
}
