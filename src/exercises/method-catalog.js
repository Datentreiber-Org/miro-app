import {
  DT_DEFAULT_APP_ADMIN_POLICY,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_EXECUTION_MODES
} from "../config.js?v=20260314-patch12-cleanup6";

import { METHOD_I18N_OVERRIDES } from "../i18n/catalog.js?v=20260314-patch12-cleanup6";
import { normalizeUiLanguage, pickLocalized } from "../i18n/index.js?v=20260314-patch12-cleanup6";

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
      text: resolveI18nText(rawEndpoint?.prompt?.text, lang) || ""
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
    steps: Object.freeze(steps)
  });
  return localizeExercisePackProjection(projection, lang);
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nAktuelle Arbeitsanweisung: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nGive brief, actionable guidance for the next sensible micro-step within this exact step.\n\nCurrent visible instruction: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nArbeite coachend mit Leitfragen und genau einem Mikroschritt, ohne den nächsten größeren Schritt vorwegzunehmen.\n\nAktuelle Arbeitsanweisung: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nCoach with guiding questions and exactly one micro-step without jumping ahead into larger downstream work.\n\nCurrent visible instruction: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nPrüfe Reife, Klarheit und Anschlussfähigkeit dieses Schritts und setze stepStatus nur auf Basis des aktuellen Boardzustands.\n\nFlow-Fokus dieses Schritts: Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nCheck readiness, clarity, and continuity for this step and set stepStatus only from the current board state.\n\nFlow focus of this step: Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt. Der Vorschlag bleibt unange­wendet und dient nur als Proposal.\n\nAktuelle Arbeitsanweisung: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nNutze executionMode = proposal_only.\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt und bleibe eng am vorhandenen Boardzustand.\nWenn das Canvas in diesem Schritt noch sehr leer ist, mache nur einen kleinen Start und keinen Komplettneuaufbau.\nEs wird nichts angewendet; das Feedback muss den Mehrwert des Vorschlags erklären.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nCreate a small, connected proposal for this exact step. The result remains unapplied and only exists as a proposal.\n\nCurrent visible instruction: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nNutze executionMode = proposal_only.\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt und bleibe eng am vorhandenen Boardzustand.\nWenn das Canvas in diesem Schritt noch sehr leer ist, mache nur einen kleinen Start und keinen Komplettneuaufbau.\nEs wird nichts angewendet; das Feedback muss den Mehrwert des Vorschlags erklären."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an. Keine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nWende den bereits gespeicherten Vorschlag dieses Schritts direkt an.\nKeine neue Analyse, keine neue Planung, keine neue Board-Generierung.\nKeine zusätzliche didaktische Bewertung erzeugen.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nApply only the already stored proposal for this step. Do not perform new analysis, planning, or feedback generation.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nWende den bereits gespeicherten Vorschlag dieses Schritts direkt an.\nKeine neue Analyse, keine neue Planung, keine neue Board-Generierung.\nKeine zusätzliche didaktische Bewertung erzeugen."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nAntworte instanzbezogen und hilfreich auf Fragen zum aktuellen Canvas. Nutze den aktuellen Schritt als Primäranker, erlaube knappe Vor- und Rückgriffe, führe aber keine Board-Mutationen aus und erzeuge keinen Proposal-Record.\n\nAktuelle Arbeitsanweisung: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas.\nNutze Step „Preparation & Focus“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen.\nWenn Kontext zu letzter Antwort oder offenem Vorschlag sichtbar ist, beantworte die Rückfrage darauf bezogen.\nTextliche Alternativen, Formulierungen und nächste Schritte sind erlaubt.\nFühre keine Board-Mutationen aus und erzeuge keinen Proposal-Run.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nAnswer helpfully for this specific canvas instance. Use the current step as the primary anchor, allow brief forward/backward references, but do not perform board mutations and do not create a proposal record.\n\nCurrent visible instruction: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas.\nNutze Step „Preparation & Focus“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen.\nWenn Kontext zu letzter Antwort oder offenem Vorschlag sichtbar ist, beantworte die Rückfrage darauf bezogen.\nTextliche Alternativen, Formulierungen und nächste Schritte sind erlaubt.\nFühre keine Board-Mutationen aus und erzeuge keinen Proposal-Run."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nAktuelle Arbeitsanweisung: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nGive brief, actionable guidance for the next sensible micro-step within this exact step.\n\nCurrent visible instruction: Starte mit Fokus und Scope: Benenne den Use Case im Header, notiere kritische Annahmen oder offene Fragen in Weiß und parke Nebenthemen bewusst im Sorted-out-Bereich.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nBewerte den aktuellen Stand qualitativ für diesen Schritt, benenne Reifegrad und Rücksprungbedarf klar und bleibe eng am aktuellen Canvaszustand.\n\nFlow-Fokus dieses Schritts: Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nAssess the current state qualitatively for this step, state the maturity level clearly, and stay close to the current board state.\n\nFlow focus of this step: Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nNimm nur zustandsbezogene Korrekturen und Verdichtungen für diesen Schritt vor; keine neue Ideensammlung und kein Schrittwechsel.\n\nFlow-Fokus dieses Schritts: Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nMake only state-based corrections and reductions for this step; do not open a new ideation round or shift the step.\n\nFlow focus of this step: Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nBewerte den aktuellen Stand qualitativ für diesen Schritt, benenne Reifegrad und Rücksprungbedarf klar und bleibe eng am aktuellen Canvaszustand.\n\nFlow-Fokus dieses Schritts: Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Vorbereitungsphase vor der eigentlichen Analyse: Fokus im Header setzen, Scope schärfen, offene Annahmen sichtbar machen, Nebenthemen bewusst parken.\n\nAssess the current state qualitatively for this step, state the maturity level clearly, and stay close to the current board state.\n\nFlow focus of this step: Starte mit Fokus und Scope: Lege im Header den konkreten Use Case fest, sammle kritische Annahmen oder offene Fragen als weiße Stickies und parke Nebenthemen bewusst, statt direkt in User oder Lösungen zu springen.\n\nDu arbeitest in Step „Preparation & Focus“.\nZiel ist, den Use Case im Header zu fokussieren, Scope und offene Annahmen sichtbar zu machen und Nebenthemen bewusst zu parken.\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nArbeite zuerst mit Header, Scope-Fragen, Annahmen und bewusstem Parken in Sorted-out.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nAktuelle Arbeitsanweisung: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nGive brief, actionable guidance for the next sensible micro-step within this exact step.\n\nCurrent visible instruction: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nArbeite coachend mit Leitfragen und genau einem Mikroschritt, ohne den nächsten größeren Schritt vorwegzunehmen.\n\nAktuelle Arbeitsanweisung: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nCoach with guiding questions and exactly one micro-step without jumping ahead into larger downstream work.\n\nCurrent visible instruction: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nPrüfe Reife, Klarheit und Anschlussfähigkeit dieses Schritts und setze stepStatus nur auf Basis des aktuellen Boardzustands.\n\nFlow-Fokus dieses Schritts: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nCheck readiness, clarity, and continuity for this step and set stepStatus only from the current board state.\n\nFlow focus of this step: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt. Der Vorschlag bleibt unange­wendet und dient nur als Proposal.\n\nAktuelle Arbeitsanweisung: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nNutze executionMode = proposal_only.\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt und bleibe eng am vorhandenen Boardzustand.\nWenn das Canvas in diesem Schritt noch sehr leer ist, mache nur einen kleinen Start und keinen Komplettneuaufbau.\nEs wird nichts angewendet; das Feedback muss den Mehrwert des Vorschlags erklären.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nCreate a small, connected proposal for this exact step. The result remains unapplied and only exists as a proposal.\n\nCurrent visible instruction: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nNutze executionMode = proposal_only.\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt und bleibe eng am vorhandenen Boardzustand.\nWenn das Canvas in diesem Schritt noch sehr leer ist, mache nur einen kleinen Start und keinen Komplettneuaufbau.\nEs wird nichts angewendet; das Feedback muss den Mehrwert des Vorschlags erklären."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an. Keine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nWende den bereits gespeicherten Vorschlag dieses Schritts direkt an.\nKeine neue Analyse, keine neue Planung, keine neue Board-Generierung.\nKeine zusätzliche didaktische Bewertung erzeugen.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nApply only the already stored proposal for this step. Do not perform new analysis, planning, or feedback generation.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nWende den bereits gespeicherten Vorschlag dieses Schritts direkt an.\nKeine neue Analyse, keine neue Planung, keine neue Board-Generierung.\nKeine zusätzliche didaktische Bewertung erzeugen."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nAntworte instanzbezogen und hilfreich auf Fragen zum aktuellen Canvas. Nutze den aktuellen Schritt als Primäranker, erlaube knappe Vor- und Rückgriffe, führe aber keine Board-Mutationen aus und erzeuge keinen Proposal-Record.\n\nAktuelle Arbeitsanweisung: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas.\nNutze Step „User Needs Analysis“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen.\nWenn Kontext zu letzter Antwort oder offenem Vorschlag sichtbar ist, beantworte die Rückfrage darauf bezogen.\nTextliche Alternativen, Formulierungen und nächste Schritte sind erlaubt.\nFühre keine Board-Mutationen aus und erzeuge keinen Proposal-Run.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nAnswer helpfully for this specific canvas instance. Use the current step as the primary anchor, allow brief forward/backward references, but do not perform board mutations and do not create a proposal record.\n\nCurrent visible instruction: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas.\nNutze Step „User Needs Analysis“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen.\nWenn Kontext zu letzter Antwort oder offenem Vorschlag sichtbar ist, beantworte die Rückfrage darauf bezogen.\nTextliche Alternativen, Formulierungen und nächste Schritte sind erlaubt.\nFühre keine Board-Mutationen aus und erzeuge keinen Proposal-Run."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nNimm nur zustandsbezogene Korrekturen und Verdichtungen für diesen Schritt vor; keine neue Ideensammlung und kein Schrittwechsel.\n\nFlow-Fokus dieses Schritts: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nMake only state-based corrections and reductions for this step; do not open a new ideation round or shift the step.\n\nFlow focus of this step: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nPrüfe Reife, Klarheit und Anschlussfähigkeit dieses Schritts und setze stepStatus nur auf Basis des aktuellen Boardzustands.\n\nFlow-Fokus dieses Schritts: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nCheck readiness, clarity, and continuity for this step and set stepStatus only from the current board state.\n\nFlow focus of this step: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nArbeite coachend mit Leitfragen und genau einem Mikroschritt, ohne den nächsten größeren Schritt vorwegzunehmen.\n\nAktuelle Arbeitsanweisung: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nCoach with guiding questions and exactly one micro-step without jumping ahead into larger downstream work.\n\nCurrent visible instruction: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nAktuelle Arbeitsanweisung: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nGive brief, actionable guidance for the next sensible micro-step within this exact step.\n\nCurrent visible instruction: Arbeite jetzt die Nutzerperspektive aus: mehrere plausible Nutzerrollen sammeln, auf einen Hauptnutzer fokussieren, Situation konkretisieren, Objectives & Results strukturieren, Decisions & Actions strukturieren und Gains/Pains andocken.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nBewerte den aktuellen Stand qualitativ für diesen Schritt, benenne Reifegrad und Rücksprungbedarf klar und bleibe eng am aktuellen Canvaszustand.\n\nFlow-Fokus dieses Schritts: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nAssess the current state qualitatively for this step, state the maturity level clearly, and stay close to the current board state.\n\nFlow focus of this step: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nNimm nur zustandsbezogene Korrekturen und Verdichtungen für diesen Schritt vor; keine neue Ideensammlung und kein Schrittwechsel.\n\nFlow-Fokus dieses Schritts: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nMake only state-based corrections and reductions for this step; do not open a new ideation round or shift the step.\n\nFlow focus of this step: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nBewerte den aktuellen Stand qualitativ für diesen Schritt, benenne Reifegrad und Rücksprungbedarf klar und bleibe eng am aktuellen Canvaszustand.\n\nFlow-Fokus dieses Schritts: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nAssess the current state qualitatively for this step, state the maturity level clearly, and stay close to the current board state.\n\nFlow focus of this step: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nVerdichte nur belastbare, bereits vorbereitete Inhalte dieses Schritts in knappe Aussagen.\n\nFlow-Fokus dieses Schritts: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nVerdichte den aktuellen Stand dieses Schritts in wenige klare Aussagen oder eine kleine, anschlussfähige Struktur.\nErfinde kein neues Material, sondern kondensiere nur das, was aus dem aktuellen Zustand bereits tragfähig ableitbar ist.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Step 1 ist Divergenz und Konvergenz im Problemraum: nicht sofort lösen, sondern Nutzerarbeit, Ziele, Ergebnisse, Entscheidungen, Handlungen und kritische Gains/Pains tragfähig machen.\n\nCondense only grounded material from this step into short, usable statements.\n\nFlow focus of this step: Baue jetzt den Problemraum auf: Nutzerrollen sammeln und fokussieren, Situation präzisieren, Objectives & Results als kleinen Driver Tree strukturieren, Decisions & Actions als kleinen Workflow skizzieren und Gains/Pains aus Nutzersicht andocken und priorisieren.\n\nDu arbeitest in Step „User Needs Analysis“.\nZiel ist, Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig zu machen.\nZiehe die Lösungsperspektive noch nicht vor.\nHalte den Problemraum sauber und leite nichts technisch vorweg.\nVerdichte den aktuellen Stand dieses Schritts in wenige klare Aussagen oder eine kleine, anschlussfähige Struktur.\nErfinde kein neues Material, sondern kondensiere nur das, was aus dem aktuellen Zustand bereits tragfähig ableitbar ist."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nAktuelle Arbeitsanweisung: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nGive brief, actionable guidance for the next sensible micro-step within this exact step.\n\nCurrent visible instruction: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nArbeite coachend mit Leitfragen und genau einem Mikroschritt, ohne den nächsten größeren Schritt vorwegzunehmen.\n\nAktuelle Arbeitsanweisung: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nCoach with guiding questions and exactly one micro-step without jumping ahead into larger downstream work.\n\nCurrent visible instruction: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nPrüfe Reife, Klarheit und Anschlussfähigkeit dieses Schritts und setze stepStatus nur auf Basis des aktuellen Boardzustands.\n\nFlow-Fokus dieses Schritts: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nCheck readiness, clarity, and continuity for this step and set stepStatus only from the current board state.\n\nFlow focus of this step: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt. Der Vorschlag bleibt unange­wendet und dient nur als Proposal.\n\nAktuelle Arbeitsanweisung: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nNutze executionMode = proposal_only.\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt und bleibe eng am vorhandenen Boardzustand.\nWenn das Canvas in diesem Schritt noch sehr leer ist, mache nur einen kleinen Start und keinen Komplettneuaufbau.\nEs wird nichts angewendet; das Feedback muss den Mehrwert des Vorschlags erklären.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nCreate a small, connected proposal for this exact step. The result remains unapplied and only exists as a proposal.\n\nCurrent visible instruction: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nNutze executionMode = proposal_only.\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt und bleibe eng am vorhandenen Boardzustand.\nWenn das Canvas in diesem Schritt noch sehr leer ist, mache nur einen kleinen Start und keinen Komplettneuaufbau.\nEs wird nichts angewendet; das Feedback muss den Mehrwert des Vorschlags erklären."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an. Keine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nWende den bereits gespeicherten Vorschlag dieses Schritts direkt an.\nKeine neue Analyse, keine neue Planung, keine neue Board-Generierung.\nKeine zusätzliche didaktische Bewertung erzeugen.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nApply only the already stored proposal for this step. Do not perform new analysis, planning, or feedback generation.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nWende den bereits gespeicherten Vorschlag dieses Schritts direkt an.\nKeine neue Analyse, keine neue Planung, keine neue Board-Generierung.\nKeine zusätzliche didaktische Bewertung erzeugen."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nAntworte instanzbezogen und hilfreich auf Fragen zum aktuellen Canvas. Nutze den aktuellen Schritt als Primäranker, erlaube knappe Vor- und Rückgriffe, führe aber keine Board-Mutationen aus und erzeuge keinen Proposal-Record.\n\nAktuelle Arbeitsanweisung: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas.\nNutze Step „Solution Design“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen.\nWenn Kontext zu letzter Antwort oder offenem Vorschlag sichtbar ist, beantworte die Rückfrage darauf bezogen.\nTextliche Alternativen, Formulierungen und nächste Schritte sind erlaubt.\nFühre keine Board-Mutationen aus und erzeuge keinen Proposal-Run.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nAnswer helpfully for this specific canvas instance. Use the current step as the primary anchor, allow brief forward/backward references, but do not perform board mutations and do not create a proposal record.\n\nCurrent visible instruction: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas.\nNutze Step „Solution Design“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen.\nWenn Kontext zu letzter Antwort oder offenem Vorschlag sichtbar ist, beantworte die Rückfrage darauf bezogen.\nTextliche Alternativen, Formulierungen und nächste Schritte sind erlaubt.\nFühre keine Board-Mutationen aus und erzeuge keinen Proposal-Run."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nNimm nur zustandsbezogene Korrekturen und Verdichtungen für diesen Schritt vor; keine neue Ideensammlung und kein Schrittwechsel.\n\nFlow-Fokus dieses Schritts: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nMake only state-based corrections and reductions for this step; do not open a new ideation round or shift the step.\n\nFlow focus of this step: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nPrüfe Reife, Klarheit und Anschlussfähigkeit dieses Schritts und setze stepStatus nur auf Basis des aktuellen Boardzustands.\n\nFlow-Fokus dieses Schritts: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nCheck readiness, clarity, and continuity for this step and set stepStatus only from the current board state.\n\nFlow focus of this step: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nArbeite coachend mit Leitfragen und genau einem Mikroschritt, ohne den nächsten größeren Schritt vorwegzunehmen.\n\nAktuelle Arbeitsanweisung: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nCoach with guiding questions and exactly one micro-step without jumping ahead into larger downstream work.\n\nCurrent visible instruction: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nAktuelle Arbeitsanweisung: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nGive brief, actionable guidance for the next sensible micro-step within this exact step.\n\nCurrent visible instruction: Leite jetzt die Lösungsperspektive ab: mehrere Solution-Varianten sammeln, eine Hauptvariante wählen, Alternativen rechts parken, daraus Information und Functions ableiten und erst danach Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nBewerte den aktuellen Stand qualitativ für diesen Schritt, benenne Reifegrad und Rücksprungbedarf klar und bleibe eng am aktuellen Canvaszustand.\n\nFlow-Fokus dieses Schritts: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nAssess the current state qualitatively for this step, state the maturity level clearly, and stay close to the current board state.\n\nFlow focus of this step: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nNimm nur zustandsbezogene Korrekturen und Verdichtungen für diesen Schritt vor; keine neue Ideensammlung und kein Schrittwechsel.\n\nFlow-Fokus dieses Schritts: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nMake only state-based corrections and reductions for this step; do not open a new ideation round or shift the step.\n\nFlow focus of this step: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nBewerte den aktuellen Stand qualitativ für diesen Schritt, benenne Reifegrad und Rücksprungbedarf klar und bleibe eng am aktuellen Canvaszustand.\n\nFlow-Fokus dieses Schritts: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nAssess the current state qualitatively for this step, state the maturity level clearly, and stay close to the current board state.\n\nFlow focus of this step: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nVerdichte nur belastbare, bereits vorbereitete Inhalte dieses Schritts in knappe Aussagen.\n\nFlow-Fokus dieses Schritts: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nVerdichte den aktuellen Stand dieses Schritts in wenige klare Aussagen oder eine kleine, anschlussfähige Struktur.\nErfinde kein neues Material, sondern kondensiere nur das, was aus dem aktuellen Zustand bereits tragfähig ableitbar ist.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Step 2 ist Divergenz, Auswahl, Konkretisierung und Nutzenableitung – nicht freie Technologiewahl und nicht Vollvernetzung.\n\nCondense only grounded material from this step into short, usable statements.\n\nFlow focus of this step: Entwickle jetzt die linke Seite aus dem Problemraum heraus: Varianten sammeln und fokussieren, Information und Functions aus Nutzerarbeit ableiten und daraus konkrete Benefits formulieren.\n\nDu arbeitest in Step „Solution Design“.\nZiel ist, aus dem Problemraum eine fokussierte Lösungsperspektive mit Variantenwahl, Information, Functions und Benefits abzuleiten.\nErfinde keine beliebige Technologielösung ohne Bezug zu Step 1.\nLeite die linke Seite aus dem Problemraum ab und halte Varianten bewusst getrennt.\nVerdichte den aktuellen Stand dieses Schritts in wenige klare Aussagen oder eine kleine, anschlussfähige Struktur.\nErfinde kein neues Material, sondern kondensiere nur das, was aus dem aktuellen Zustand bereits tragfähig ableitbar ist."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nBewerte den aktuellen Stand qualitativ für diesen Schritt, benenne Reifegrad und Rücksprungbedarf klar und bleibe eng am aktuellen Canvaszustand.\n\nFlow-Fokus dieses Schritts: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nAssess the current state qualitatively for this step, state the maturity level clearly, and stay close to the current board state.\n\nFlow focus of this step: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nNimm nur zustandsbezogene Korrekturen und Verdichtungen für diesen Schritt vor; keine neue Ideensammlung und kein Schrittwechsel.\n\nFlow-Fokus dieses Schritts: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nMake only state-based corrections and reductions for this step; do not open a new ideation round or shift the step.\n\nFlow focus of this step: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nNimm nur gezielte, zustandsbezogene Korrekturen vor und halte den Eingriff klein.\nErhalte gültiges Material, schärfe Fehlplatzierungen, reduziere Rauschen und parke Nebenpfade bewusst.\nBaue den Canvas nicht neu auf."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nArbeite coachend mit Leitfragen und genau einem Mikroschritt, ohne den nächsten größeren Schritt vorwegzunehmen.\n\nAktuelle Arbeitsanweisung: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nCoach with guiding questions and exactly one micro-step without jumping ahead into larger downstream work.\n\nCurrent visible instruction: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nVerdichte nur belastbare, bereits vorbereitete Inhalte dieses Schritts in knappe Aussagen.\n\nFlow-Fokus dieses Schritts: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nVerdichte den aktuellen Stand dieses Schritts in wenige klare Aussagen oder eine kleine, anschlussfähige Struktur.\nErfinde kein neues Material, sondern kondensiere nur das, was aus dem aktuellen Zustand bereits tragfähig ableitbar ist.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nCondense only grounded material from this step into short, usable statements.\n\nFlow focus of this step: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nVerdichte den aktuellen Stand dieses Schritts in wenige klare Aussagen oder eine kleine, anschlussfähige Struktur.\nErfinde kein neues Material, sondern kondensiere nur das, was aus dem aktuellen Zustand bereits tragfähig ableitbar ist."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt. Der Vorschlag bleibt unange­wendet und dient nur als Proposal.\n\nAktuelle Arbeitsanweisung: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nNutze executionMode = proposal_only.\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt und bleibe eng am vorhandenen Boardzustand.\nWenn das Canvas in diesem Schritt noch sehr leer ist, mache nur einen kleinen Start und keinen Komplettneuaufbau.\nEs wird nichts angewendet; das Feedback muss den Mehrwert des Vorschlags erklären.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nCreate a small, connected proposal for this exact step. The result remains unapplied and only exists as a proposal.\n\nCurrent visible instruction: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nNutze executionMode = proposal_only.\nErzeuge einen kleinen, anschlussfähigen Vorschlag für genau diesen Schritt und bleibe eng am vorhandenen Boardzustand.\nWenn das Canvas in diesem Schritt noch sehr leer ist, mache nur einen kleinen Start und keinen Komplettneuaufbau.\nEs wird nichts angewendet; das Feedback muss den Mehrwert des Vorschlags erklären."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an. Keine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nWende den bereits gespeicherten Vorschlag dieses Schritts direkt an.\nKeine neue Analyse, keine neue Planung, keine neue Board-Generierung.\nKeine zusätzliche didaktische Bewertung erzeugen.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nApply only the already stored proposal for this step. Do not perform new analysis, planning, or feedback generation.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nWende den bereits gespeicherten Vorschlag dieses Schritts direkt an.\nKeine neue Analyse, keine neue Planung, keine neue Board-Generierung.\nKeine zusätzliche didaktische Bewertung erzeugen."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nBewerte den aktuellen Stand qualitativ für diesen Schritt, benenne Reifegrad und Rücksprungbedarf klar und bleibe eng am aktuellen Canvaszustand.\n\nFlow-Fokus dieses Schritts: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nAssess the current state qualitatively for this step, state the maturity level clearly, and stay close to the current board state.\n\nFlow focus of this step: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nFühre ein qualitatives Review dieses Schritts bzw. des relevanten Canvas-Zustands durch.\nBenutze klare Aussagen zu Stärken, Lücken, Risiken und dazu, ob der Schritt tragfähig ist oder vorherige Arbeit nachgeschärft werden muss.\nFühre standardmäßig keine großen Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nAntworte instanzbezogen und hilfreich auf Fragen zum aktuellen Canvas. Nutze den aktuellen Schritt als Primäranker, erlaube knappe Vor- und Rückgriffe, führe aber keine Board-Mutationen aus und erzeuge keinen Proposal-Record.\n\nAktuelle Arbeitsanweisung: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas.\nNutze Step „Fit Validation & Minimum Desired Product“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen.\nWenn Kontext zu letzter Antwort oder offenem Vorschlag sichtbar ist, beantworte die Rückfrage darauf bezogen.\nTextliche Alternativen, Formulierungen und nächste Schritte sind erlaubt.\nFühre keine Board-Mutationen aus und erzeuge keinen Proposal-Run.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nAnswer helpfully for this specific canvas instance. Use the current step as the primary anchor, allow brief forward/backward references, but do not perform board mutations and do not create a proposal record.\n\nCurrent visible instruction: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas.\nNutze Step „Fit Validation & Minimum Desired Product“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen.\nWenn Kontext zu letzter Antwort oder offenem Vorschlag sichtbar ist, beantworte die Rückfrage darauf bezogen.\nTextliche Alternativen, Formulierungen und nächste Schritte sind erlaubt.\nFühre keine Board-Mutationen aus und erzeuge keinen Proposal-Run."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nArbeite coachend mit Leitfragen und genau einem Mikroschritt, ohne den nächsten größeren Schritt vorwegzunehmen.\n\nAktuelle Arbeitsanweisung: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nCoach with guiding questions and exactly one micro-step without jumping ahead into larger downstream work.\n\nCurrent visible instruction: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des aktuellen Schritts, aber liefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\nFühre normalerweise keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nPrüfe Reife, Klarheit und Anschlussfähigkeit dieses Schritts und setze stepStatus nur auf Basis des aktuellen Boardzustands.\n\nFlow-Fokus dieses Schritts: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nBewerte den Zustand dieses Schritts knapp und nachvollziehbar anhand von Zielklarheit, inhaltlicher Tragfähigkeit und Reifegrad.\nErzeuge eine klare Einordnung im evaluation-Teil und führe keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nCheck readiness, clarity, and continuity for this step and set stepStatus only from the current board state.\n\nFlow focus of this step: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nBewerte den Zustand dieses Schritts knapp und nachvollziehbar anhand von Zielklarheit, inhaltlicher Tragfähigkeit und Reifegrad.\nErzeuge eine klare Einordnung im evaluation-Teil und führe keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nAktuelle Arbeitsanweisung: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nGive brief, actionable guidance for the next sensible micro-step within this exact step.\n\nCurrent visible instruction: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nPrüfe Reife, Klarheit und Anschlussfähigkeit dieses Schritts und setze stepStatus nur auf Basis des aktuellen Boardzustands.\n\nFlow-Fokus dieses Schritts: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nCheck readiness, clarity, and continuity for this step and set stepStatus only from the current board state.\n\nFlow focus of this step: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nPrüfe den Reifegrad dieses Schritts gegen sein Zielbild und benenne klar, was noch fehlt oder warum er tragfähig ist.\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen oder Unschärfen.\nSetze stepStatus passend zum Reifegrad dieses Schritts."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nPrüfe Reife, Klarheit und Anschlussfähigkeit dieses Schritts und setze stepStatus nur auf Basis des aktuellen Boardzustands.\n\nFlow-Fokus dieses Schritts: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nBewerte den Zustand dieses Schritts knapp und nachvollziehbar anhand von Zielklarheit, inhaltlicher Tragfähigkeit und Reifegrad.\nErzeuge eine klare Einordnung im evaluation-Teil und führe keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nCheck readiness, clarity, and continuity for this step and set stepStatus only from the current board state.\n\nFlow focus of this step: Prüfe jetzt, welche Benefits wirklich Gains, Pains, Objectives, Results, Decisions oder Actions adressieren. Markiere belastbare Beziehungen, reduziere auf das Minimum Desired Product und verdichte erst dann den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nBewerte den Zustand dieses Schritts knapp und nachvollziehbar anhand von Zielklarheit, inhaltlicher Tragfähigkeit und Reifegrad.\nErzeuge eine klare Einordnung im evaluation-Teil und führe keine Board-Mutationen aus."
                }
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nAktuelle Arbeitsanweisung: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Step 3 validiert, markiert, reduziert und verdichtet. Ziel ist ein Minimum Desired Product und nicht die Summe aller bisherigen Ideen.\n\nGive brief, actionable guidance for the next sensible micro-step within this exact step.\n\nCurrent visible instruction: Validiere jetzt den Problem-Solution-Fit: prüfe Benefits gegen die rechte Seite, markiere belastbare Beziehungen mit Checkmarks, dünne unvalidierte Inhalte aus und verdichte den Kern im Feld Check.\n\nDu arbeitest in Step „Fit Validation & Minimum Desired Product“.\nZiel ist, den Fit zu validieren, auf einen tragfähigen Kern zu reduzieren und das Minimum Desired Product sichtbar zu machen.\nStarte keine neue Ideensammlung.\nArbeite mit Validierung, Reduktion, Checkmarks und Verdichtung im Check-Feld.\nGib 1 bis 3 konkrete nächste Schritte oder Satzstarter für genau diesen Zustand.\nBleibe im aktuellen Schritt und mache deutlich, was jetzt als Nächstes sinnvoll ist.\nFühre keine Board-Mutationen aus."
                }
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

for (const [packId, packDef] of Object.entries(METHOD_CATALOG.packs || {})) {
  const exercisePack = buildExercisePackProjection({ exercisePackId: packId, ...cloneJson(packDef) });
  if (exercisePack?.id) {
    exercisePacks[exercisePack.id] = exercisePack;
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

