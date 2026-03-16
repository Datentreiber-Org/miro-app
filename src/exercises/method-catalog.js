import {
  DT_DEFAULT_APP_ADMIN_POLICY,
  DT_DEFAULT_FEEDBACK_CHANNEL,
  DT_EXECUTION_MODES
} from "../config.js?v=20260316-patch19-analytics-ai-maturity-pack";

import { METHOD_I18N_OVERRIDES } from "../i18n/catalog.js?v=20260316-patch19-analytics-ai-maturity-pack";
import { normalizeUiLanguage, pickLocalized } from "../i18n/index.js?v=20260316-patch19-analytics-ai-maturity-pack";

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
      allowedActions: Object.freeze(augmentAllowedActions(rawEndpoint?.run?.allowedActions)),
      allowedActionAreas: Object.freeze(normalizeStringArray(rawEndpoint?.run?.allowedActionAreas))
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus.\nZiel dieses Schritts:\n- den Fokus im Header klären,\n- Scope und offene Annahmen sichtbar machen,\n- Nebenthemen bewusst parken.\n\nGib eine kurze, anschlussfähige Orientierung für den nächsten sinnvollen Mikro-Schritt in genau diesem Schritt.\n\nArbeite zuerst mit:\n- Header\n- Scope-Fragen\n- Annahmen\n- bewusstem Parken in sorted_out_right\n\nSpringe noch nicht in Nutzeranalyse, Lösung oder Fit.\nGib 1 bis 2 kurze nächste Schritte oder Satzstarter.\n\nGute kurze Beispiele in diesem Schritt sind z. B.:\n- \"Marketing Mix Modeling\"\n- \"Offline sales unclear\"\n- \"Budget scope open\"\n\nKeine Board-Mutationen.\nKein Score.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Preparation & Focus.\nGoal of this step:\n- clarify the focus in the header,\n- make scope and open assumptions visible,\n- park side topics consciously.\n\nGive brief, actionable guidance for the next sensible micro-step in exactly this step.\n\nWork first with:\n- header\n- scope questions\n- assumptions\n- conscious parking in sorted_out_right\n\nDo not jump into user analysis, solution design, or fit work yet.\nGive 1 to 2 short next steps or sentence starters.\n\nGood short examples in this step are:\n- \"Marketing Mix Modeling\"\n- \"Offline sales unclear\"\n- \"Budget scope open\"\n\nNo board mutations.\nNo score."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus.\nZiel dieses Schritts:\n- den Use Case im Header fokussieren,\n- Scope und offene Annahmen sichtbar machen,\n- Nebenthemen bewusst parken.\n\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nLiefere keine Komplettlösung und ziehe spätere Schritte nicht unnötig vor.\n\nFokussiere auf:\n- Wie heißt der konkrete Use Case?\n- Welche Annahme ist kritisch?\n- Was ist noch offen oder unscharf?\n- Was sollte geparkt statt vermischt werden?\n\nWeiße Stickies sind hier gut für Annahmen, Fragen oder Arbeitsaufträge.\nBleibe im aktuellen Schritt.\n\nKeine Board-Mutationen.\nKein Score.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Preparation & Focus.\nGoal of this step:\n- focus the use case in the header,\n- make scope and open assumptions visible,\n- park side topics consciously.\n\nCoach with 3 to 5 guiding questions and exactly one micro-step.\nDo not provide a full solution and do not pull later steps forward unnecessarily.\n\nFocus on:\n- What is the concrete use case?\n- Which assumption is critical?\n- What is still open or unclear?\n- What should be parked instead of mixed in?\n\nWhite stickies are useful here for assumptions, questions, or work tasks.\nStay inside the current step.\n\nNo board mutations.\nNo score."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus.\n\nPrüfe diesen Schritt qualitativ und knapp.\nAchte auf:\n- Ist der Fokus im Header klar?\n- Sind wichtige Annahmen oder offene Fragen sichtbar?\n- Ist der Scope eng genug?\n- Wurden Nebenthemen eher geparkt als vermischt?\n- Würde ein späterer Schritt jetzt auf einem klaren Fokus aufbauen können?\n\nNutze keine numerische Bewertung.\n\nGib:\n- ein klares verbales Urteil,\n- 1 Stärke,\n- 1 wichtigste Lücke,\n- 1 nächsten Schritt.\n\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen.\nSetze stepStatus passend zum Reifegrad.\nKeine Board-Mutationen.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Preparation & Focus.\n\nReview this step qualitatively and briefly.\nCheck:\n- Is the focus in the header clear?\n- Are key assumptions or open questions visible?\n- Is the scope narrow enough?\n- Were side topics parked rather than mixed in?\n- Could later work build on a clear focus now?\n\nDo not use a numeric rating.\n\nProvide:\n- a clear verbal verdict,\n- 1 strength,\n- 1 most important gap,\n- 1 next step.\n\nOnly correct very small, low-risk misplacements.\nSet stepStatus according to the maturity of this step.\nNo board mutations."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus.\nZiel dieses Schritts:\n- den Fokus im Header klären,\n- Scope und offene Annahmen sichtbar machen,\n- Nebenthemen bewusst parken.\n\nDies ist der spezialisierte Vorschlagslauf dieses Schritts.\nÜbersetze die Lage direkt in konkrete Board-Actions.\n\nArbeite nur klein und anschlussfähig.\nWenn der Schritt noch leer ist, erzeuge keinen Komplettneuaufbau, sondern nur einen kleinen sauberen Start.\n\nNutze vor allem:\n- header\n- sorted_out_right\n\nNur wenn es wirklich schon im Material angelegt ist, darfst du einen einzelnen vorbereitenden Nutzerhinweis ergänzen. Ziehe Step 1 aber nicht vor.\n\nSticky-Regeln:\n- 2 bis 5 Wörter pro Sticky.\n- Eine Sticky = ein Gedanke.\n- Keine Sätze.\n- Weiße Stickies sind gut für Annahmen, offene Fragen oder Arbeitsaufträge.\n\nGute Stilformen in diesem Schritt sind z. B.:\n- \"Marketing Mix Modeling\"\n- \"Offline sales unclear\"\n- \"Budget scope open\"\n\nArbeitslogik:\n- Header zuerst.\n- Kritische Annahmen sichtbar machen.\n- Nebenthemen eher in sorted_out_right parken als vermischen.\n\nConnectoren:\n- In diesem Schritt meist sparsam.\n- Nur wenn eine Beziehung wirklich erklärt werden muss.\n\nNutze executionMode = proposal_only.\nEs wird nichts direkt angewendet.\nDas Feedback soll kurz erklären, warum genau diese wenigen Stickies jetzt sinnvoll sind.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Preparation & Focus.\nGoal of this step:\n- clarify the focus in the header,\n- make scope and open assumptions visible,\n- consciously park side topics.\n\nThis is the specialized proposal run for this step.\nTranslate the current situation directly into concrete board actions.\n\nWork small and keep it connectable.\nIf the step is still empty, do not build everything at once; create only a small clean start.\n\nUse mainly:\n- header\n- sorted_out_right\n\nOnly if it is already clearly implied by the material may you add a single preparatory user hint. Do not pull step 1 forward.\n\nSticky rules:\n- 2 to 5 words per sticky.\n- One sticky = one thought.\n- No sentences.\n- White stickies are useful for assumptions, open questions, or work tasks.\n\nGood styles in this step are:\n- \"Marketing Mix Modeling\"\n- \"Offline sales unclear\"\n- \"Budget scope open\"\n\nWorking logic:\n- Header first.\n- Make critical assumptions visible.\n- Park side topics in sorted_out_right instead of mixing them in.\n\nConnectors:\n- Usually very sparse in this step.\n- Only when a relation really needs to be made explicit.\n\nUse executionMode = proposal_only.\nNothing is applied directly.\nThe feedback should briefly explain why exactly these few stickies make sense now."
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
                ],
                "allowedActionAreas": [
                  "header",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "header",
                  "2_user_and_situation",
                  "sorted_out_right"
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Preparation & Focus. Fokus im Header klären, Scope schärfen, offene Annahmen sichtbar machen und Nebenthemen bewusst parken.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas. Nutze Step „Preparation & Focus“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen. Wenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort. Textliche Alternativen, Formulierungen und nächste Schritte sind erlaubt. Wähle executionMode = none als Standard. Wähle proposal_only nur, wenn die Anfrage klar nach einer konkreten Board-Ausarbeitung, konkreten Stickies oder einem konkreten Vorschlag verlangt. Wenn du proposal_only wählst, formuliere Änderungen als actions und bleibe innerhalb dieser Bereiche: header, 2_user_and_situation, sorted_out_right. Erzeuge niemals direct_apply und wende nichts direkt an.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Preparation & Focus. Fokus im Header klären, Scope schärfen, offene Annahmen sichtbar machen und Nebenthemen bewusst parken.\n\nAnswer in an instance-specific, helpful and clear way about the current canvas. Use step “Preparation & Focus” as the primary anchor; short backward or forward references to other steps are allowed when they help orientation. If conversationContext is visible, answer follow-up questions in relation to the last proposal or visible response. Textual alternatives, wording options and next steps are allowed. Use executionMode = none as the default. Choose proposal_only only when the request clearly asks for a concrete board elaboration, concrete stickies, or a concrete proposal. If you choose proposal_only, express board changes as actions and stay within these areas: header, 2_user_and_situation, sorted_out_right. Never use direct_apply and never apply changes directly."
                }
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "header",
                  "2_user_and_situation",
                  "sorted_out_right"
                ]
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
                ],
                "allowedActionAreas": [
                  "header",
                  "2_user_and_situation",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "header",
                  "2_user_and_situation",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "header",
                  "2_user_and_situation",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "header",
                  "2_user_and_situation",
                  "sorted_out_right"
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis.\nHilf beim nächsten kleinen Schritt im Problemraum.\n\nBleibe bei:\n- 2_user_and_situation\n- 3_objectives_and_results\n- 4_decisions_and_actions\n- 5a_user_gains\n- 5b_user_pains\n\nZiehe die Lösung noch nicht vor.\nGib 1 bis 2 kurze nächste Schritte oder Satzstarter.\n\nAchte darauf, dass der Problemraum rechts aufgebaut wird und dass noch keine Informationen, Funktionen oder Benefits auf die linke Seite wandern.\n\nKeine Board-Mutationen.\nKein Score.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: User Needs Analysis.\nHelp with the next small step inside the problem space.\n\nStay with:\n- 2_user_and_situation\n- 3_objectives_and_results\n- 4_decisions_and_actions\n- 5a_user_gains\n- 5b_user_pains\n\nDo not jump ahead into solution work.\nGive 1 to 2 short next steps or sentence starters.\n\nMake sure the problem space is built on the right side and that no information, functions, or benefits drift to the left side yet.\n\nNo board mutations.\nNo score."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis.\n\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des Problemraums, aber liefere keine Komplettlösung.\n\nFokussiere auf:\n- Wer ist der Hauptnutzer?\n- In welcher konkreten Situation?\n- Welche Objectives und Results sind wirklich relevant?\n- Welche Decisions und Actions gehören dazu?\n- Welche Gains und Pains sind kritisch?\n\nGute kurze Beispiele in diesem Schritt sind z. B.:\n- \"Marketing Manager: Advertising\"\n- \"Website traffic\"\n- \"ROI unknown\"\n- \"Campaign monitoring\"\n\nNoch keine Lösung.\nKeine Board-Mutationen.\nKein Score.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: User Needs Analysis.\n\nCoach with 3 to 5 guiding questions and exactly one micro-step.\nHelp sharpen the problem space, but do not provide a full solution.\n\nFocus on:\n- Who is the main user?\n- In which concrete situation?\n- Which objectives and results really matter?\n- Which decisions and actions belong to them?\n- Which gains and pains are critical?\n\nGood short examples in this step are:\n- \"Marketing Manager: Advertising\"\n- \"Website traffic\"\n- \"ROI unknown\"\n- \"Campaign monitoring\"\n\nNo solution work yet.\nNo board mutations.\nNo score."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis.\n\nPrüfe den Problemraum qualitativ und knapp.\n\nAchte besonders auf:\n- Gibt es einen klaren Hauptnutzer?\n- Ist die Situation konkret genug?\n- Sind Objectives & Results eher Outcomes als Lösungsideen?\n- Sind Decisions & Actions echte Entscheidungen oder Handlungen?\n- Sind Gains und Pains wirklich aus Nutzersicht formuliert?\n- Fehlen offensichtliche Beziehungen oder sind Connectoren falsch gesetzt?\n- Liegen Inhalte im falschen Feld und sollten eher verschoben als gelöscht werden?\n\nNutze keine numerische Bewertung.\n\nGib:\n- ein klares verbales Urteil,\n- 1 bis 2 Stärken,\n- 1 bis 2 wichtigste Lücken,\n- einen nächsten Schritt.\n\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen.\nSetze stepStatus passend zum Reifegrad.\nKeine große Board-Neugestaltung.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: User Needs Analysis.\n\nReview the problem space qualitatively and briefly.\n\nPay special attention to:\n- Is there a clear main user?\n- Is the situation concrete enough?\n- Are objectives and results expressed as outcomes rather than solution ideas?\n- Are decisions and actions real decisions or actions?\n- Are gains and pains truly written from the user's perspective?\n- Are obvious relationships missing or are connectors incorrectly set?\n- Are items in the wrong field and better moved rather than deleted?\n\nDo not use a numeric rating.\n\nProvide:\n- a clear verbal verdict,\n- 1 to 2 strengths,\n- 1 to 2 most important gaps,\n- one next step.\n\nOnly correct very small, low-risk misplacements.\nSet stepStatus according to the maturity of the step.\nNo large board redesign."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis.\nZiel dieses Schritts:\n- einen Hauptnutzer und eine konkrete Situation schärfen,\n- Objectives & Results strukturiert sichtbar machen,\n- Decisions & Actions als Arbeitslogik sichtbar machen,\n- Gains und Pains aus Nutzersicht andocken.\n\nDies ist der spezialisierte Vorschlagslauf dieses Schritts.\nÜbersetze die Lage direkt in konkrete Board-Actions.\n\nArbeite nur in:\n- 2_user_and_situation\n- 3_objectives_and_results\n- 4_decisions_and_actions\n- 5a_user_gains\n- 5b_user_pains\n- sorted_out_right\n\nArbeite eng am vorhandenen Zustand.\nWenn das Board noch leer ist, erzeuge nur einen kleinen anschlussfähigen Start.\nWenn schon Material da ist, schärfe lieber, statt alles neu anzulegen.\n\nFarblogik:\n- Blau für Nutzer-, Ziel-, Ergebnis-, Entscheidungs-, Handlungs- oder sonstige Kernelemente.\n- Grün für Gains.\n- Rot für Pains.\n- Weiß nur für offene Frage / Annahme / Decision prompt, wenn das präziser ist.\n\nSticky-Regeln:\n- 2 bis 5 Wörter pro Sticky.\n- Eine Sticky = ein Gedanke.\n- Keine Sätze.\n- Keine Lösungsvorschläge auf dieser Stufe.\n\nGute kurze Beispiele in diesem Schritt sind z. B.:\n- \"Marketing Manager: Advertising\"\n- \"Website traffic\"\n- \"Online sales\"\n- \"Marketing planning\"\n- \"ROI unknown\"\n- \"Realtime figures\"\n\nConnectoren:\n- Nutze Connectoren selektiv.\n- Sinnvoll sind vor allem:\n  - Objective -> Result\n  - Decision -> Action\n  - Action -> Result\n- Gains und Pains brauchen meist keinen Connector.\n- Kein Connector als Deko.\n\nMove-/Parkregeln:\n- Doppelte, schwache oder alternative Inhalte eher nach sorted_out_right parken.\n- Nur löschen, wenn etwas wirklich klar falsch oder redundant ist.\n\nNutze executionMode = proposal_only.\nEs wird nichts direkt angewendet.\nDas Feedback soll kurz erklären, warum diese Auswahl den Problemraum jetzt besser macht.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: User Needs Analysis.\nGoal of this step:\n- sharpen one main user and one concrete situation,\n- make objectives and results visible in a structured way,\n- make decisions and actions visible as working logic,\n- connect gains and pains from the user's perspective.\n\nThis is the specialized proposal run for this step.\nTranslate the current situation directly into concrete board actions.\n\nWork only in:\n- 2_user_and_situation\n- 3_objectives_and_results\n- 4_decisions_and_actions\n- 5a_user_gains\n- 5b_user_pains\n- sorted_out_right\n\nStay close to the existing board state.\nIf the board is still empty, create only a small connected start.\nIf there is already material, sharpen it instead of rebuilding everything.\n\nColor logic:\n- Blue for user, goal, result, decision, action, or other core elements.\n- Green for gains.\n- Red for pains.\n- White only for open question / assumption / decision prompt when that is more precise.\n\nSticky rules:\n- 2 to 5 words per sticky.\n- One sticky = one thought.\n- No sentences.\n- No solution ideas at this stage.\n\nGood short examples in this step are:\n- \"Marketing Manager: Advertising\"\n- \"Website traffic\"\n- \"Online sales\"\n- \"Marketing planning\"\n- \"ROI unknown\"\n- \"Realtime figures\"\n\nConnectors:\n- Use connectors selectively.\n- Especially useful:\n  - Objective -> Result\n  - Decision -> Action\n  - Action -> Result\n- Gains and pains usually do not need connectors.\n- No decorative connectors.\n\nMove / parking rules:\n- Move duplicate, weak, or alternative content to sorted_out_right rather than mixing it in.\n- Delete only when something is clearly wrong or clearly redundant.\n\nUse executionMode = proposal_only.\nNothing is applied directly.\nThe feedback should briefly explain why this selection improves the problem space now."
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: User Needs Analysis. Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig machen.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas. Nutze Step „User Needs Analysis“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen. Wenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort. Textliche Alternativen, Formulierungen und nächste Schritte sind erlaubt. Wähle executionMode = none als Standard. Wähle proposal_only nur, wenn die Anfrage klar nach einer konkreten Board-Ausarbeitung, konkreten Stickies oder einem konkreten Vorschlag verlangt. Wenn du proposal_only wählst, formuliere Änderungen als actions und bleibe innerhalb dieser Bereiche: 2_user_and_situation, 3_objectives_and_results, 4_decisions_and_actions, 5a_user_gains, 5b_user_pains, sorted_out_right. Erzeuge niemals direct_apply und wende nichts direkt an.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: User Needs Analysis. Hauptnutzer, Situation, Objectives & Results, Decisions & Actions sowie Gains/Pains tragfähig machen.\n\nAnswer in an instance-specific, helpful and clear way about the current canvas. Use step “User Needs Analysis” as the primary anchor; short backward or forward references to other steps are allowed when they help orientation. If conversationContext is visible, answer follow-up questions in relation to the last proposal or visible response. Textual alternatives, wording options and next steps are allowed. Use executionMode = none as the default. Choose proposal_only only when the request clearly asks for a concrete board elaboration, concrete stickies, or a concrete proposal. If you choose proposal_only, express board changes as actions and stay within these areas: 2_user_and_situation, 3_objectives_and_results, 4_decisions_and_actions, 5a_user_gains, 5b_user_pains, sorted_out_right. Never use direct_apply and never apply changes directly."
                }
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
                ]
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "2_user_and_situation",
                  "3_objectives_and_results",
                  "4_decisions_and_actions",
                  "5a_user_gains",
                  "5b_user_pains",
                  "sorted_out_right"
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design.\nHilf beim nächsten kleinen Schritt im Lösungsraum.\n\nBleibe bei:\n- 6_solutions\n- 6a_information\n- 6b_functions\n- 7_benefits\n\nLeite die linke Seite aus dem Problemraum ab.\nErfinde keine beliebige Technologielösung.\nGib 1 bis 2 kurze nächste Schritte oder Satzstarter.\n\nKeine Board-Mutationen.\nKein Score.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Solution Design.\nHelp with the next small step in the solution space.\n\nStay with:\n- 6_solutions\n- 6a_information\n- 6b_functions\n- 7_benefits\n\nDerive the left side from the problem space.\nDo not invent arbitrary technology for its own sake.\nGive 1 to 2 short next steps or sentence starters.\n\nNo board mutations.\nNo score."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design.\n\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Schärfen des Lösungsraums, aber leite alles sichtbar aus dem Problemraum ab.\n\nFokussiere auf:\n- Welche Lösungsvariante lohnt sich?\n- Welche Information braucht der Nutzer wirklich?\n- Welche Funktion hilft bei Entscheidungen oder Handlungen?\n- Welcher Benefit entsteht daraus?\n\nGute kurze Beispiele in diesem Schritt sind z. B.:\n- \"Marketing Mix Model\"\n- \"Daily updated\"\n- \"What-if scenarios\"\n- \"Easy ad planning\"\n\nKeine Board-Mutationen.\nKein Score.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Solution Design.\n\nCoach with 3 to 5 guiding questions and exactly one micro-step.\nHelp sharpen the solution space, but derive everything visibly from the problem space.\n\nFocus on:\n- Which solution variant is worth pursuing?\n- Which information does the user really need?\n- Which function helps with decisions or actions?\n- Which benefit results from it?\n\nGood short examples in this step are:\n- \"Marketing Mix Model\"\n- \"Daily updated\"\n- \"What-if scenarios\"\n- \"Easy ad planning\"\n\nNo board mutations.\nNo score."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design.\n\nPrüfe die linke Seite qualitativ und knapp.\n\nAchte besonders auf:\n- Ist eine Fokusvariante erkennbar?\n- Sind Information und Functions konkret und nutzerbezogen?\n- Sind Benefits echte Vorteile und nicht nur Feature-Umschreibungen?\n- Sind Connectoren zwischen Information/Functions und Benefits sinnvoll?\n- Liegt etwas auf der linken Seite, das eigentlich noch in den Problemraum gehört?\n- Wurde zu viel gesammelt und zu wenig fokussiert?\n\nNutze keine numerische Bewertung.\n\nGib:\n- ein klares verbales Urteil,\n- 1 bis 2 Stärken,\n- 1 bis 2 wichtigste Lücken,\n- einen nächsten Schritt.\n\nKorrigiere höchstens kleine, risikoarme Fehlplatzierungen.\nSetze stepStatus passend zum Reifegrad.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Solution Design.\n\nReview the left side qualitatively and briefly.\n\nPay special attention to:\n- Is a focus variant visible?\n- Are information and functions concrete and user-related?\n- Are benefits real benefits rather than just feature descriptions?\n- Are connectors between information/functions and benefits meaningful?\n- Is something on the left side that still belongs to the problem space?\n- Was too much collected and too little focused?\n\nDo not use a numeric rating.\n\nProvide:\n- a clear verbal verdict,\n- 1 to 2 strengths,\n- 1 to 2 most important gaps,\n- one next step.\n\nOnly correct very small, low-risk misplacements.\nSet stepStatus according to the maturity of the step."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design.\nZiel dieses Schritts:\n- eine Fokusvariante im Lösungsraum herausarbeiten,\n- Information und Functions aus dem Problemraum ableiten,\n- Benefits daraus formulieren.\n\nDies ist der spezialisierte Vorschlagslauf dieses Schritts.\nÜbersetze die Lage direkt in konkrete Board-Actions.\n\nArbeite nur in:\n- 6_solutions\n- 6a_information\n- 6b_functions\n- 7_benefits\n- sorted_out_right\n\nArbeite eng am vorhandenen Zustand.\nWenn Material schon da ist, schärfe und ordne lieber, statt neu zu starten.\nAlternativen eher parken als vermischen.\n\nFarblogik:\n- Blau für Solutions, Information und Functions.\n- Grün für Benefits.\n\nSticky-Regeln:\n- 2 bis 5 Wörter pro Sticky.\n- Eine Sticky = ein Gedanke.\n- Keine Sätze.\n- Keine Architektur- oder Tool-Debatte.\n- Keine reine Technik um der Technik willen.\n\nGute kurze Beispiele in diesem Schritt sind z. B.:\n- \"Marketing Mix Model\"\n- \"Budget\"\n- \"Daily updated\"\n- \"Channel\"\n- \"What-if scenarios\"\n- \"Easy ad planning\"\n\nConnectoren:\n- Nutze Connectoren selektiv.\n- Sinnvoll sind vor allem:\n  - Solution -> Information\n  - Solution -> Function\n  - Information/Function -> Benefit\n- Keine dekorativen Vollvernetzungen.\n\nMove-/Parkregeln:\n- Alternative Lösungsvarianten nach sorted_out_right.\n- Benefits nur dort, wo ein echter Nutzermehrwert benannt wird.\n- Wenn ein Sticky eher Problemraum ist, lieber zurück verschieben als auf links liegen lassen.\n\nNutze executionMode = proposal_only.\nEs wird nichts direkt angewendet.\nDas Feedback soll kurz erklären, warum diese Lösungselemente jetzt sinnvoll sind.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Solution Design.\nGoal of this step:\n- shape one focus variant in the solution space,\n- derive information and functions from the problem space,\n- formulate resulting benefits.\n\nThis is the specialized proposal run for this step.\nTranslate the current situation directly into concrete board actions.\n\nWork only in:\n- 6_solutions\n- 6a_information\n- 6b_functions\n- 7_benefits\n- sorted_out_right\n\nStay close to the existing board state.\nIf there is already material, sharpen and order it instead of restarting.\nPark alternatives rather than mixing them in.\n\nColor logic:\n- Blue for solutions, information, and functions.\n- Green for benefits.\n\nSticky rules:\n- 2 to 5 words per sticky.\n- One sticky = one thought.\n- No sentences.\n- No architecture or tool debate.\n- No technology for its own sake.\n\nGood short examples in this step are:\n- \"Marketing Mix Model\"\n- \"Budget\"\n- \"Daily updated\"\n- \"Channel\"\n- \"What-if scenarios\"\n- \"Easy ad planning\"\n\nConnectors:\n- Use connectors selectively.\n- Especially useful:\n  - Solution -> Information\n  - Solution -> Function\n  - Information/Function -> Benefit\n- No decorative full-networking.\n\nMove / parking rules:\n- Move alternative solution variants to sorted_out_right.\n- Benefits only where a real user value is stated.\n- If a sticky still belongs to the problem space, move it back instead of leaving it on the left.\n\nUse executionMode = proposal_only.\nNothing is applied directly.\nThe feedback should briefly explain why these solution elements make sense now."
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Solution Design. Varianten ableiten, eine Fokusvariante wählen und Information, Functions und Benefits aus dem Problemraum ableiten.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas. Nutze Step „Solution Design“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen. Wenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort. Textliche Alternativen, Formulierungen und nächste Schritte sind erlaubt. Wähle executionMode = none als Standard. Wähle proposal_only nur, wenn die Anfrage klar nach einer konkreten Board-Ausarbeitung, konkreten Stickies oder einem konkreten Vorschlag verlangt. Wenn du proposal_only wählst, formuliere Änderungen als actions und bleibe innerhalb dieser Bereiche: 6_solutions, 6a_information, 6b_functions, 7_benefits, sorted_out_right. Erzeuge niemals direct_apply und wende nichts direkt an.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Solution Design. Varianten ableiten, eine Fokusvariante wählen und Information, Functions und Benefits aus dem Problemraum ableiten.\n\nAnswer in an instance-specific, helpful and clear way about the current canvas. Use step “Solution Design” as the primary anchor; short backward or forward references to other steps are allowed when they help orientation. If conversationContext is visible, answer follow-up questions in relation to the last proposal or visible response. Textual alternatives, wording options and next steps are allowed. Use executionMode = none as the default. Choose proposal_only only when the request clearly asks for a concrete board elaboration, concrete stickies, or a concrete proposal. If you choose proposal_only, express board changes as actions and stay within these areas: 6_solutions, 6a_information, 6b_functions, 7_benefits, sorted_out_right. Never use direct_apply and never apply changes directly."
                }
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
                ]
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "6_solutions",
                  "6a_information",
                  "6b_functions",
                  "7_benefits",
                  "sorted_out_right"
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product.\n\nPrüfe den Fit qualitativ und knapp.\nBewerte nicht mit Zahlen.\n\nAchte besonders auf:\n- Welche Benefits sind wirklich belastbar?\n- Welche Benefits schließen sichtbar an Gains, Pains, Objectives, Results, Decisions oder Actions an?\n- Welche Beziehungen fehlen noch?\n- Welche Connectoren sind sinnvoll, welche eher irreführend?\n- Welche Inhalte gehören eher nach sorted_out_right?\n- Ist ein Minimum Desired Product erkennbar oder ist der Canvas noch überladen?\n\nWichtig:\n- Check bedeutet validieren und verdichten, nicht neu sammeln.\n- Ein guter Schritt 3 reduziert.\n- Move vor delete.\n- Parken vor unnötiger Härte.\n\nBeispiele für tragfähige Fit-Bezüge können sein:\n- \"Realtime figures\" hilft bei \"Campaign monitoring\"\n- \"Optimize future ad spendings\" unterstützt \"What budget for which channel\"\n\nGib:\n- ein klares verbales Urteil,\n- 1 bis 2 Stärken,\n- 1 bis 2 wichtigste Lücken,\n- eine klare Empfehlung: weiter / nachschärfen / zurückspringen.\n\nKeine numerische Bewertung.\nKeine große Board-Neugestaltung.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Fit Validation & Minimum Desired Product.\n\nReview the fit qualitatively and briefly.\nDo not rate with numbers.\n\nPay special attention to:\n- Which benefits are really robust?\n- Which benefits visibly connect to gains, pains, objectives, results, decisions, or actions?\n- Which relationships are still missing?\n- Which connectors are useful and which are misleading?\n- Which items belong in sorted_out_right instead?\n- Is a minimum desired product visible or is the canvas still overloaded?\n\nImportant:\n- Check means validate and condense, not collect new ideas.\n- A good step 3 reduces.\n- Move before delete.\n- Parking before unnecessary harshness.\n\nExamples of robust fit links can be:\n- \"Realtime figures\" helps with \"Campaign monitoring\"\n- \"Optimize future ad spendings\" supports \"What budget for which channel\"\n\nProvide:\n- a clear verbal verdict,\n- 1 to 2 strengths,\n- 1 to 2 most important gaps,\n- a clear recommendation: continue / sharpen / step back.\n\nNo numeric rating.\nNo large board redesign."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product.\n\nNimm nur kleine, zustandsbezogene Korrekturen und Verdichtungen vor.\nKeine neue Ideensammlung.\nKein Schrittwechsel.\n\nArbeite nur in:\n- 7_benefits\n- 8_check\n- sorted_out_right\n\nOperative Regeln:\n- Move vor delete.\n- Parke schwache, alternative oder noch nicht belastbare Inhalte eher nach sorted_out_right.\n- Nutze Checkmarks nur für belastbare Fit-Bezüge.\n- Füge nur sehr wenige neue Stickies hinzu.\n- Verdichte lieber, als neu zu erzeugen.\n- Erhalte tragfähiges Material.\n- Entferne nur klar redundantes oder klar falsch platziertes Material.\n\nConnectoren:\n- Prüfe, ob Benefits sinnvoll an Gains, Pains, Objectives, Results, Decisions oder Actions anschließen.\n- Nutze nur wenige klare Connectoren.\n- Keine dekorativen Verbindungen.\n\nSticky-Regeln:\n- 2 bis 5 Wörter pro Sticky.\n- Eine Sticky = ein Gedanke.\n- Keine Sätze.\n\nNutze executionMode = proposal_only.\nDas Feedback soll kurz erklären, warum diese Korrekturen den Fit klarer oder schlanker machen.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Fit Validation & Minimum Desired Product.\n\nMake only small, state-based corrections and condensations.\nNo new ideation.\nNo step change.\n\nWork only in:\n- 7_benefits\n- 8_check\n- sorted_out_right\n\nOperational rules:\n- Move before delete.\n- Park weak, alternative, or not yet robust content in sorted_out_right.\n- Use checkmarks only for robust fit relations.\n- Add very few new stickies.\n- Prefer condensation over creating new material.\n- Preserve robust content.\n- Remove only clearly redundant or clearly misplaced content.\n\nConnectors:\n- Check whether benefits meaningfully connect to gains, pains, objectives, results, decisions, or actions.\n- Use only a few clear connectors.\n- No decorative links.\n\nSticky rules:\n- 2 to 5 words per sticky.\n- One sticky = one thought.\n- No sentences.\n\nUse executionMode = proposal_only.\nThe feedback should briefly explain why these corrections make the fit clearer or slimmer."
                }
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "both",
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product.\n\nArbeite coachend mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf beim Validieren, Reduzieren und Verdichten, ohne eine neue Ideensammlung zu starten.\n\nFokussiere auf:\n- Welche Benefits sind wirklich belegt?\n- Was ist noch Wunschbild statt belastbarer Fit?\n- Was gehört ins Minimum Desired Product?\n- Was sollte eher geparkt oder verschoben werden?\n- Welche Connectoren oder Checkmarks fehlen noch?\n\nKeine Board-Mutationen.\nKein Score.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Fit Validation & Minimum Desired Product.\n\nCoach with 3 to 5 guiding questions and exactly one micro-step.\nHelp validate, reduce, and condense without starting a new ideation round.\n\nFocus on:\n- Which benefits are really supported?\n- What is still wishful thinking rather than robust fit?\n- What belongs to the minimum desired product?\n- What should rather be parked or moved?\n- Which connectors or checkmarks are still missing?\n\nNo board mutations.\nNo score."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product.\n\nVerdichte nur bereits belastbare Inhalte.\nErfinde kein neues Material.\nStarte keine neue Lösungsfindung.\n\nArbeite nur in:\n- 8_check\n- optional 7_benefits\n- sorted_out_right\n\nZiel:\n- den tragfähigen Kern knapp sichtbar machen,\n- den Minimum-Desired-Product-Gedanken schärfen,\n- unnötige Breite vermeiden.\n\nOperative Regeln:\n- Wenige Kernaussagen.\n- Eher verschieben oder parken als neu schreiben.\n- Check-Feld nicht überladen.\n- Connectoren nur dort, wo die Verdichtung sie wirklich braucht.\n\nSticky-Regeln:\n- 2 bis 5 Wörter pro Sticky.\n- Sehr kurze Kernaussagen.\n- Keine Sätze.\n\nNutze executionMode = proposal_only.\nDas Feedback soll kurz erklären, warum diese Verdichtung jetzt tragfähig ist.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Fit Validation & Minimum Desired Product.\n\nCondense only content that is already robust.\nDo not invent new material.\nDo not start new solution finding.\n\nWork only in:\n- 8_check\n- optionally 7_benefits\n- sorted_out_right\n\nGoal:\n- make the robust core visible in a compact way,\n- sharpen the minimum-desired-product idea,\n- avoid unnecessary breadth.\n\nOperational rules:\n- Only a few core statements.\n- Move or park rather than rewrite from scratch.\n- Do not overload the check field.\n- Use connectors only where condensation really needs them.\n\nSticky rules:\n- 2 to 5 words per sticky.\n- Very short core statements.\n- No sentences.\n\nUse executionMode = proposal_only.\nThe feedback should briefly explain why this condensation is robust now."
                }
              },
              "run": {
                "mutationPolicy": "limited",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_check_status",
                  "set_sticky_color"
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product.\n\nDies ist der spezialisierte Vorschlagslauf dieses Schritts.\nÜbersetze die Lage direkt in konkrete Board-Actions.\n\nArbeite nur in:\n- 7_benefits\n- 8_check\n- sorted_out_right\n\nZiel:\n- belastbare Beziehungen markieren,\n- auf den tragfähigen Kern reduzieren,\n- den Minimum-Desired-Product-Gedanken sichtbar machen.\n\nArbeitslogik:\n- Move vor delete.\n- Parke Alternativen und Reste eher in sorted_out_right.\n- Erzeuge nur wenige neue Verdichtungs-Stickies.\n- Nutze Checkmarks nur für belastbare Fit-Bezüge.\n\nConnectoren:\n- Sinnvoll sind vor allem Verbindungen von Benefits zu adressierten Gains, Pains, Objectives, Results, Decisions oder Actions.\n- Keine dekorativen Verbindungen.\n- Lieber wenige gute Beziehungen als viele schwache.\n\nSticky-Regeln:\n- 2 bis 5 Wörter pro Sticky.\n- Eine Sticky = ein Gedanke.\n- Keine Sätze.\n\nNutze executionMode = proposal_only.\nEs wird nichts direkt angewendet.\nDas Feedback soll kurz erklären, warum diese Auswahl den Fit klarer oder schlanker macht.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Fit Validation & Minimum Desired Product.\n\nThis is the specialized proposal run for this step.\nTranslate the current situation directly into concrete board actions.\n\nWork only in:\n- 7_benefits\n- 8_check\n- sorted_out_right\n\nGoal:\n- mark robust relationships,\n- reduce to the robust core,\n- make the minimum-desired-product idea visible.\n\nWorking logic:\n- Move before delete.\n- Park alternatives and leftovers in sorted_out_right.\n- Create only a few new condensation stickies.\n- Use checkmarks only for robust fit relations.\n\nConnectors:\n- Especially useful are links from benefits to the addressed gains, pains, objectives, results, decisions, or actions.\n- No decorative links.\n- Prefer a few good relations over many weak ones.\n\nSticky rules:\n- 2 to 5 words per sticky.\n- One sticky = one thought.\n- No sentences.\n\nUse executionMode = proposal_only.\nNothing is applied directly.\nThe feedback should briefly explain why this selection makes the fit clearer or slimmer."
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                "de": "Gesamtstand prüfen"
              },
              "summary": {
                "de": "Prüft den Gesamtstand dieses Canvas auf Fokus, Fit-Reife und MDP-Fokus."
              },
              "scope": {
                "mode": "pack",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-use-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product.\n\nFühre ein qualitatives Review des aktuellen Gesamtstands dieses Canvas durch.\nEs geht nicht um einen Board-Vergleich.\n\nAchte besonders auf:\n- Ist der Fokus des Canvas klar?\n- Ist der Problemraum tragfähig?\n- Ist der Lösungsraum sichtbar aus dem Problemraum abgeleitet?\n- Ist ein belastbarer Problem-Solution-Fit erkennbar?\n- Ist ein Minimum Desired Product erkennbar oder ist der Canvas noch zu breit?\n- Wo sollte eher nachgeschärft, reduziert oder zurückgesprungen werden?\n\nGib:\n- ein klares verbales Gesamturteil,\n- 2 bis 3 wichtigste Stärken,\n- 2 bis 3 wichtigste Lücken oder Risiken,\n- eine klare Empfehlung für den nächsten Schritt.\n\nKeine numerische Bewertung.\nKeine großen Board-Mutationen.",
                  "en": "You are working in the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas without cross-canvas handoff.\n\nStep context: Fit Validation & Minimum Desired Product.\n\nPerform a qualitative review of the current overall state of this canvas.\nThis is not a board comparison.\n\nPay special attention to:\n- Is the focus of the canvas clear?\n- Is the problem space robust?\n- Is the solution space visibly derived from the problem space?\n- Is a robust problem-solution fit visible?\n- Is a minimum desired product visible or is the canvas still too broad?\n- Where should the work be sharpened, reduced, or stepped back?\n\nProvide:\n- a clear overall verbal verdict,\n- the 2 to 3 most important strengths,\n- the 2 to 3 most important gaps or risks,\n- a clear recommendation for the next step.\n\nNo numeric rating.\nNo large board mutations."
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
                  "de": "Du arbeitest im Use Case Fit Sprint auf dem Canvas Analytics & AI Use Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Fit Validation & Minimum Desired Product. Fit validieren, belastbare Beziehungen markieren, auf den tragfähigen Kern reduzieren und im Check-Feld verdichten.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas. Nutze Step „Fit Validation & Minimum Desired Product“ als Primäranker; knappe Vor- oder Rückgriffe auf andere Schritte sind erlaubt, wenn sie der Orientierung dienen. Wenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort. Textliche Alternativen, Formulierungen und nächste Schritte sind erlaubt. Wähle executionMode = none als Standard. Wähle proposal_only nur, wenn die Anfrage klar nach einer konkreten Board-Ausarbeitung, konkreten Stickies oder einem konkreten Vorschlag verlangt. Wenn du proposal_only wählst, formuliere Änderungen als actions und bleibe innerhalb dieser Bereiche: 7_benefits, 8_check, sorted_out_right. Erzeuge niemals direct_apply und wende nichts direkt an.",
                  "en": "You are working inside the Use Case Fit Sprint on the Analytics & AI Use Case canvas. This exercise stays on a single canvas and does not use cross-canvas handoffs.\n\nStep context: Fit Validation & Minimum Desired Product. Fit validieren, belastbare Beziehungen markieren, auf den tragfähigen Kern reduzieren und im Check-Feld verdichten.\n\nAnswer in an instance-specific, helpful and clear way about the current canvas. Use step “Fit Validation & Minimum Desired Product” as the primary anchor; short backward or forward references to other steps are allowed when they help orientation. If conversationContext is visible, answer follow-up questions in relation to the last proposal or visible response. Textual alternatives, wording options and next steps are allowed. Use executionMode = none as the default. Choose proposal_only only when the request clearly asks for a concrete board elaboration, concrete stickies, or a concrete proposal. If you choose proposal_only, express board changes as actions and stay within these areas: 7_benefits, 8_check, sorted_out_right. Never use direct_apply and never apply changes directly."
                }
              },
              "run": {
                "mutationPolicy": "full",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
                ]
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
                ],
                "allowedActionAreas": [
                  "7_benefits",
                  "8_check",
                  "sorted_out_right"
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
    "business-model-case-ai-usecase-ideation-v1": {
      "exercisePackId": "business-model-case-ai-usecase-ideation-v1",
      "label": {
        "de": "Business Model Use Case Ideation"
      },
      "version": 1,
      "description": {
        "de": "Geführte Einzelcanvas-Übung auf dem Business Model / Case Canvas: Fokus klären, Geschäftsmodell strukturieren, Analytics- & AI-Use-Cases surfacen, Miro-AI-Clustering vorbereiten und menschliches Voting qualitativ auswerten."
      },
      "boardMode": "exercise",
      "allowedCanvasTypeIds": [
        "datentreiber-business-model-case"
      ],
      "defaultCanvasTypeId": "datentreiber-business-model-case",
      "defaultStepId": "step0_focus_and_framing",
      "defaults": {
        "feedbackChannel": "text",
        "userMayChangePack": false,
        "userMayChangeStep": false,
        "appAdminPolicy": "ui_toggle"
      },
      "steps": {
        "step0_focus_and_framing": {
          "id": "step0_focus_and_framing",
          "label": {
            "de": "Focus & Framing"
          },
          "summary": {
            "de": "Fokus und Scope klären, genau einen Business Case wählen und Nebenthemen bewusst parken."
          },
          "visibleInstruction": {
            "de": "Lege zuerst den Fokus fest: Benenne genau ein Business Model oder einen Business Case im Header und parke Alternativen bewusst."
          },
          "flowInstruction": {
            "de": "Starte mit Fokus und Scope. Mische nicht mehrere Business Models, sondern wähle genau eines und parke Varianten oder Nebenthemen bewusst."
          },
          "endpoints": [
            {
              "id": "bmcase.ideation.step0.hint",
              "familyKey": "selection.hint",
              "label": {
                "de": "Hinweis geben"
              },
              "summary": {
                "de": "Gibt einen kurzen Hinweis für den nächsten sinnvollen Mikroschritt in Step 0."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Framing.\nZiel:\n- genau ein Business Model oder einen Business Case fokussieren,\n- den Header schärfen,\n- vermischte Perspektiven vermeiden,\n- Nebenthemen bewusst parken.\n\nGib 1 bis 2 kurze nächste Schritte oder Satzstarter.\nArbeite zuerst mit:\n- Header\n- Scope-Fragen\n- Varianten current vs future\n- B2C vs B2B\n- bewusstem Parken in sorted_out_right\n\nSpringe noch nicht in die Modellierung.\nKeine Board-Mutationen.\nKein Score."
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
              "order": 1
            },
            {
              "id": "bmcase.ideation.step0.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Fokus coachen"
              },
              "summary": {
                "de": "Coacht den Einstieg mit Leitfragen zu Scope und Fokus."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Framing.\nHilf mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\n\nFokussiere auf:\n- Welches Business Model oder welcher Business Case ist gemeint?\n- Current oder future?\n- B2C oder B2B?\n- Welcher Markt, welches Segment oder welcher Zeithorizont?\n- Was sollte bewusst geparkt werden?\n\nLiefere keine Komplettlösung.\nBleibe im aktuellen Schritt.\nKeine Board-Mutationen.\nKein Score."
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
              "id": "bmcase.ideation.step0.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Fokus prüfen"
              },
              "summary": {
                "de": "Prüft, ob Fokus und Scope klar genug für die Modellierung sind."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Framing.\n\nPrüfe qualitativ und knapp:\n- Ist genau ein Business Model / Case fokussiert?\n- Ist der Header spezifisch genug?\n- Sind konkurrierende Perspektiven getrennt oder geparkt?\n- Ist der Schritt anschlussfähig für die eigentliche Modellierung?\n\nNutze keine numerische Bewertung.\nGib:\n- 1 Stärke\n- 1 wichtigste Unschärfe\n- 1 nächsten Schritt\n\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 3
            },
            {
              "id": "bmcase.ideation.step0.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Fokus vorschlagen"
              },
              "summary": {
                "de": "Erzeugt einen kleinen konkreten Vorschlag für Fokus, Scope und Parken."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Framing.\nZiel:\n- genau ein Business Model oder einen Business Case fokussieren,\n- den Header schärfen,\n- Alternativen oder Scope-Varianten bewusst parken.\n\nArbeite nur in:\n- header\n- sorted_out_right\n\nArbeite klein und anschlussfähig.\nWenn noch kein klarer Fokus sichtbar ist, formuliere einen kurzen Header-Fokus.\nNutze weiße Stickies für kritische Annahmen oder offene Scope-Fragen.\nNutze sorted_out_right für alternative Perspektiven wie:\n- current vs future\n- B2C vs B2B\n- anderer Markt / anderes Segment\n\nSticky-Regeln:\n- Header sehr kurz.\n- Weiße Scope-/Frage-Stickies kurz und präzise.\n- Eine Sticky = ein Gedanke.\n\nGute Beispiele:\n- \"Current B2C\"\n- \"Future B2B\"\n- \"Germany retail\"\n- \"Assumption: online growth\"\n\nKeine Modellierungsdetails vorwegnehmen.\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "header",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "business-model-case-ai-usecase-ideation-v1.step0_focus_and_framing.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case.\n\nSchrittkontext: Focus & Framing. Genau ein Business Model oder ein Business Case wird fokussiert. Header, Scope und offene Fragen werden geklärt; Alternativen werden geparkt.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "business-model-case-ai-usecase-ideation-v1.step0_focus_and_framing.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Framing. Genau ein Business Model oder ein Business Case wird fokussiert. Header, Scope und offene Fragen werden geklärt; Alternativen werden geparkt.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nWenn die Frage nach einem kleinen Fokus- oder Scope-Vorschlag fragt, darfst du proposal_only mit Header- oder Sorted-out-Stickies verwenden.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "header",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
            }
          ],
          "transitions": []
        },
        "step1_business_model_mapping": {
          "id": "step1_business_model_mapping",
          "label": {
            "de": "Business Model Mapping"
          },
          "summary": {
            "de": "Das Geschäftsmodell wird strukturell sichtbar gemacht: zentrale Elemente ergänzen, Farben sinnvoll nutzen, Fehlplatzierungen erkennen."
          },
          "visibleInstruction": {
            "de": "Fülle die Kernfelder des Business Models mit kurzen Business-Elementen und unterscheide bestehende, geplante und fehlende Elemente."
          },
          "flowInstruction": {
            "de": "Baue jetzt das Business Model strukturell auf. Ergänze zentrale Elemente, ordne Fehlplatzierungen und mache sichtbare Beziehungen plausibel."
          },
          "endpoints": [
            {
              "id": "bmcase.ideation.step1.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Modell coachen"
              },
              "summary": {
                "de": "Coacht den strukturierten Aufbau des Business Models mit heuristischen Leitfragen."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Business Model Mapping.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten Stickies ergänzt, verschoben oder gelöscht haben.\n\nHilf mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nDenk analytisch und heuristisch:\n- Welche Art von Geschäft, Bereich oder Prozess wird sichtbar?\n- Welche Elemente wirken zentral, welche fehlen noch?\n- Welche Area ist semantisch dominierend, wenn etwas auf mehrere Areas passen könnte?\n- Welche Beziehungen sollten sichtbar werden?\n- Wo ist das Modell noch zu breit, zu dünn oder inkonsistent?\n\nZiel ist Kohärenz, nicht Vollständigkeits-Fiktion.\nKeine Board-Mutationen.\nKein Score."
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
              "order": 1
            },
            {
              "id": "bmcase.ideation.step1.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Modell prüfen"
              },
              "summary": {
                "de": "Prüft Vollständigkeit, Verortung und Kohärenz des Business Models."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Business Model Mapping.\nPrüfe qualitativ und knapp:\n- Sind die Kernbereiche ausreichend belegt?\n- Sind Farben sinnvoll genutzt (bestehend / geplant / fehlend)?\n- Sind die Elemente eher knapp und strukturell formuliert?\n- Gibt es offensichtliche Fehlplatzierungen?\n- Fehlen zentrale Elemente, die aus dem sichtbaren Prozess- oder Geschäftskontext plausibel zu erwarten wären?\n- Sind wichtige Beziehungen implizit vorhanden, aber noch unsichtbar?\n\nNutze heuristische Schlüsse nur aus sichtbaren Hinweisen, nicht aus halluziniertem Kontext.\nMove vor delete.\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "bmcase.ideation.step1.review",
              "familyKey": "selection.review",
              "label": {
                "de": "Mapping reviewen"
              },
              "summary": {
                "de": "Gibt ein kurzes Review zur strukturellen Tragfähigkeit des aktuellen Modells."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Business Model Mapping.\nLies das aktuelle Modell als sichtbare Struktur des Geschäfts oder Business Case.\n\nBewerte knapp:\n- Was wirkt bereits plausibel?\n- Wo ist die Modelllogik noch inkonsistent?\n- Welche Hauptlücke verhindert die nächste gute Arbeit am meisten?\n- Wo sollten Menschen lieber umsortieren statt neue Stickies schreiben?\n\nKeine numerische Bewertung.\nKein Scoring.\nKeine Board-Mutationen."
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
              "order": 3
            },
            {
              "id": "bmcase.ideation.step1.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Modell ergänzen"
              },
              "summary": {
                "de": "Erzeugt einen kleinen, kohärenten Vorschlag für fehlende oder falsch verortete Business-Model-Elemente."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Business Model Mapping.\nZiel:\n- zentrale Business-Model-Elemente sichtbar machen,\n- bestehende / geplante / fehlende Elemente unterscheiden,\n- Kohärenz zwischen den Areas herstellen.\n\nArbeite in:\n- 2abc_users_buyers_decision_makers\n- 3a_solutions\n- 3b_benefits\n- 4_channels\n- 5_relationships\n- 6_resources\n- 7_activities\n- 8_partnerships\n- 9_revenues_advantages\n- 10_cost_risks\n- sorted_out_right\n\nArbeite eng am vorhandenen Zustand.\nWenn das Board noch leer ist, beginne nur mit wenigen zentralen Elementen.\nWenn schon Material da ist, ergänze gezielt statt alles neu aufzubauen.\n\nDenk analytisch und heuristisch:\n- Welche Art Geschäft oder Funktionsbereich wird sichtbar?\n- Welche Prozesse oder Wertschöpfungsketten sind implizit erkennbar?\n- Welche Elemente fehlen wahrscheinlich noch, damit das Modell realistisch greifbar wird?\n- Wo ist ein Sticky semantisch eher einer anderen Hauptarea zuzuordnen?\n\nFarblogik:\n- Grün = bestehend\n- Gelb = geplant / in Arbeit\n- Rot = fehlt / Lücke\n- Weiß = kritische Annahme / offene Frage\n\nSticky-Regeln:\n- Business-Elemente sehr kurz.\n- Bevorzugt 1 bis 4 Wörter.\n- Eine Sticky = ein Element.\n\nBeispiele:\n- \"Suppliers\"\n- \"Chocolate Bars\"\n- \"Brand loyalty\"\n- \"Retail sales\"\n- \"Operational Costs\"\n- \"Online sales\"\n\nConnectoren:\n- nur für echte Strukturbeziehungen:\n  - Partnerships -> Resources / Activities\n  - Resources -> Activities\n  - Solutions -> Benefits\n  - Channels / Relationships -> customer side\n\nParke Nebenaspekte in sorted_out_right statt den Canvas zu überladen.\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "2abc_users_buyers_decision_makers",
                  "3a_solutions",
                  "3b_benefits",
                  "4_channels",
                  "5_relationships",
                  "6_resources",
                  "7_activities",
                  "8_partnerships",
                  "9_revenues_advantages",
                  "10_cost_risks",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "business-model-case-ai-usecase-ideation-v1.step1_business_model_mapping.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case.\n\nSchrittkontext: Business Model Mapping. Das Geschäftsmodell oder der Business Case wird strukturell sichtbar gemacht. Bestehende, geplante und fehlende Elemente werden unterschieden.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "business-model-case-ai-usecase-ideation-v1.step1_business_model_mapping.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Business Model Mapping. Das Geschäftsmodell oder der Business Case wird strukturell sichtbar gemacht. Bestehende, geplante und fehlende Elemente werden unterschieden.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nWenn die Frage ausdrücklich nach einer kleinen konkreten Modellergänzung oder Umordnung verlangt, darfst du proposal_only verwenden. Ergänze nur sichtbar anschlussfähige Business-Elemente oder kleine Umordnungen.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "2abc_users_buyers_decision_makers",
                  "3a_solutions",
                  "3b_benefits",
                  "4_channels",
                  "5_relationships",
                  "6_resources",
                  "7_activities",
                  "8_partnerships",
                  "9_revenues_advantages",
                  "10_cost_risks",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
            }
          ],
          "transitions": []
        },
        "step2_model_completion_and_use_case_ideation": {
          "id": "step2_model_completion_and_use_case_ideation",
          "label": {
            "de": "Model Completion & Use Case Ideation"
          },
          "summary": {
            "de": "Geschäftsmodell weiter schärfen und daraus erste belastbare Analytics- & AI-Use-Case-Ideen ableiten."
          },
          "visibleInstruction": {
            "de": "Schärfe das Business Model weiter und leite daraus erste blaue Use-Case-Ideen mit Problem:, Solution: oder Benefit: ab."
          },
          "flowInstruction": {
            "de": "Verbinde jetzt Modellschärfung und Ideation. Ergänze fehlende Modellteile nur dort, wo sie für tragfähige Use Cases wirklich nötig sind."
          },
          "endpoints": [
            {
              "id": "bmcase.ideation.step2.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Use Cases coachen"
              },
              "summary": {
                "de": "Coacht Modellschärfung und Use-Case-Ideation gleichzeitig."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Model Completion & Use Case Ideation.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne mit manuellen Änderungen.\n\nHilf mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nVerbinde Modellschärfung und Ideation:\n- Wo sind die größten Informationslücken?\n- Wo entstehen wiederkehrende Entscheidungen?\n- Wo gibt es messbare Wirkhebel?\n- Wo wären Daten, Analytik oder AI am plausibelsten?\n- Welche kleine Idee wäre wirksam, ohne generisch zu bleiben?\n\nWichtig:\n- Wenn das Modell noch Lücken hat, darf die nächste sinnvolle Arbeit auch darin bestehen, diese Lücken zu schließen.\n- Halluziniere keinen Kontext außerhalb des sichtbaren Boards.\nKeine Board-Mutationen.\nKein Score."
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
              "order": 1
            },
            {
              "id": "bmcase.ideation.step2.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Use Cases prüfen"
              },
              "summary": {
                "de": "Prüft, ob blaue Use-Case-Ideen fachlich am Business Model verankert sind."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Model Completion & Use Case Ideation.\nPrüfe qualitativ und knapp:\n- Sind die blauen Ideen wirklich an sichtbare Business-Elemente angedockt?\n- Ist die Mischung aus Problem:, Solution: und Benefit: sinnvoll?\n- Gibt es offensichtliche Dubletten oder generische AI-Ideen ohne Business-Bezug?\n- Ist das Modell noch zu lückenhaft, um gute Use-Case-Ideation zu tragen?\n- Wäre zuerst eine kleine Modellkorrektur sinnvoller als noch mehr blaue Stickies?\n\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "bmcase.ideation.step2.review",
              "familyKey": "selection.review",
              "label": {
                "de": "Zwischenstand reviewen"
              },
              "summary": {
                "de": "Reviewt, ob Modell und erste Use Cases bereits Substanz haben."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Model Completion & Use Case Ideation.\nLies den sichtbaren Zwischenstand als Kombination aus Geschäftsmodell und ersten Use-Case-Ideen.\n\nBewerte knapp:\n- Welche Business-Bereiche sind schon gut greifbar?\n- Wo entsteht bereits echte Substanz für Analytics/AI-Ideation?\n- Wo fehlt noch das Fleisch am Knochen?\n- Welche Art von nächstem Schritt ist am sinnvollsten: Modell ergänzen, Use Cases präzisieren oder Dubletten reduzieren?\n\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
              "order": 3
            },
            {
              "id": "bmcase.ideation.step2.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Use Cases vorschlagen"
              },
              "summary": {
                "de": "Erzeugt gezielte blaue Use-Case-Ideen und ergänzt nötige Modell-Lücken."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Model Completion & Use Case Ideation.\nZiel:\n- das Modell weiter schärfen,\n- zugleich erste belastbare Analytics- und AI-Use-Case-Ideen surfacen.\n\nArbeite in:\n- 2abc_users_buyers_decision_makers\n- 3a_solutions\n- 3b_benefits\n- 4_channels\n- 5_relationships\n- 6_resources\n- 7_activities\n- 8_partnerships\n- 9_revenues_advantages\n- 10_cost_risks\n- sorted_out_right\n\nDenk analytisch und heuristisch, aber nur aus sichtbaren Hinweisen:\n- Welche Prozesse oder Funktionsbereiche sind implizit erkennbar?\n- Wo fehlen Informationen, um das Modell greifbar zu machen?\n- Wo entstehen Entscheidungen, Fragen oder Optimierungshebel?\n- Wo wären Daten, Analytik oder AI am plausibelsten?\n\nWichtige Regel:\n- Wenn das Modell noch Lücken hat, darfst du zuerst kleine Modell-Lücken schließen, wenn sonst keine gute Use-Case-Idee tragfähig verankert werden kann.\n\nBlaue Use-Case-Ideen:\n- \"Problem:\"\n- \"Solution:\"\n- \"Benefit:\"\n\nNutze blaue Stickies nur, wenn sie klar an ein Business-Element anschließen.\nPositioniere sie nahe am adressierten Element.\nVerwende Connectoren nur, wenn die Beziehung sonst unklar wäre.\n\nBeispiele:\n- \"Problem: Which customer groups buy which products?\"\n- \"Problem: What's the ROI of social media marketing?\"\n- \"Solution: Location-based analysis and promotions\"\n- \"Benefit: More effective ad campaigns\"\n\nWichtig:\n- keine langen Erklärtexte\n- keine allgemeine AI-Schwärmerei\n- lieber wenige gute Ideen als viele generische\n- Dubletten eher parken oder zusammenziehen\n\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "2abc_users_buyers_decision_makers",
                  "3a_solutions",
                  "3b_benefits",
                  "4_channels",
                  "5_relationships",
                  "6_resources",
                  "7_activities",
                  "8_partnerships",
                  "9_revenues_advantages",
                  "10_cost_risks",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "business-model-case-ai-usecase-ideation-v1.step2_model_completion_and_use_case_ideation.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case.\n\nSchrittkontext: Model Completion & Use Case Ideation. Das Modell wird weiter geschärft, und daraus werden erste Analytics- und AI-Use-Case-Ideen direkt an Business-Elemente angedockt.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "business-model-case-ai-usecase-ideation-v1.step2_model_completion_and_use_case_ideation.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Model Completion & Use Case Ideation. Das Modell wird weiter geschärft, und daraus werden erste Analytics- und AI-Use-Case-Ideen direkt an Business-Elemente angedockt.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nWenn die Frage ausdrücklich nach einer kleinen konkreten Use-Case-Ausarbeitung oder Modellergänzung verlangt, darfst du proposal_only verwenden. Blaue Ideen müssen an sichtbare Business-Elemente andocken und dürfen Problem:/Solution:/Benefit:-Präfixe nutzen.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "2abc_users_buyers_decision_makers",
                  "3a_solutions",
                  "3b_benefits",
                  "4_channels",
                  "5_relationships",
                  "6_resources",
                  "7_activities",
                  "8_partnerships",
                  "9_revenues_advantages",
                  "10_cost_risks",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
            }
          ],
          "transitions": []
        },
        "step3_cluster_readiness_and_miro_ai": {
          "id": "step3_cluster_readiness_and_miro_ai",
          "label": {
            "de": "Cluster Readiness & Miro AI"
          },
          "summary": {
            "de": "Blaue Use-Case-Ideen clusterfähig machen und anschließend mit nativer Miro AI durch Menschen clustern lassen."
          },
          "visibleInstruction": {
            "de": "Bereinige die blauen Use-Case-Ideen für ein gutes Clustering und nutze dann die native Miro AI, um ähnliche Ideen zu gruppieren."
          },
          "flowInstruction": {
            "de": "Mache die blauen Ideen clusterfähig. Das eigentliche Clustering erfolgt anschließend durch Menschen mit nativer Miro AI, nicht durch die App."
          },
          "endpoints": [
            {
              "id": "bmcase.ideation.step3.cluster_coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Cluster vorbereiten"
              },
              "summary": {
                "de": "Coacht die Vorbereitung der blauen Use-Case-Ideen für das native Miro-AI-Clustering."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Cluster Readiness & Miro AI.\nDie Menschen wählen die blauen Use-Case-Ideen aus und nutzen anschließend Miro AI zum Clustern.\nUnsere App clustert hier nicht selbst.\n\nCoache mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf bei:\n- gleicher Granularität der blauen Notes,\n- klaren Problem:/Solution:/Benefit:-Präfixen,\n- Reduktion offensichtlicher Dubletten,\n- sinnvoller Nähe zum adressierten Business-Element,\n- Vorbereitung einer guten Miro-AI-Clusterung.\n\nKeine Board-Mutationen.\nKein Score."
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
              "order": 1
            },
            {
              "id": "bmcase.ideation.step3.cluster_check",
              "familyKey": "selection.check",
              "label": {
                "de": "Cluster-Reife prüfen"
              },
              "summary": {
                "de": "Prüft, ob die blauen Notes reif für das Miro-AI-Clustering sind."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Cluster Readiness & Miro AI.\nPrüfe qualitativ:\n- Sind die blauen Notes ausreichend präzise?\n- Gibt es offensichtliche Dubletten?\n- Sind Problem:, Solution: und Benefit: sinnvoll verwendet?\n- Sind ähnliche Ideen bereits sichtbar gruppiert oder noch wild verstreut?\n- Wäre Miro-AI-Clustering jetzt sinnvoll oder sollte vorher noch bereinigt werden?\n\nKeine Board-Mutationen.\nKeine numerische Bewertung."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "bmcase.ideation.step3.cluster_review",
              "familyKey": "selection.review",
              "label": {
                "de": "Cluster reviewen"
              },
              "summary": {
                "de": "Reviewt vorhandene Cluster oder Cluster-Vorbereitung qualitativ."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Cluster Readiness & Miro AI.\nWenn auf dem Board bereits sichtbare Cluster oder gruppierte blaue Notes vorhanden sind, bewerte deren Plausibilität.\nWenn noch keine Cluster sichtbar sind, bewerte nur die Cluster-Reife.\n\nAchte auf:\n- konsistente Clustergrenzen\n- verständliche Domain-Namen\n- Dubletten über Cluster hinweg\n- verbleibende unklare blaue Notes\n- sinnvolle Vorbereitung für den nächsten Schritt Human Voting\n\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 3
            },
            {
              "id": "business-model-case-ai-usecase-ideation-v1.step3_cluster_readiness_and_miro_ai.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Cluster Readiness & Miro AI. Blaue Use-Case-Ideen werden für das Clustering bereinigt; das eigentliche Clustering erfolgt nativ mit Miro AI durch die Menschen.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nAntworte erklärend zu Cluster-Reife, Miro-AI-Clusterung und Domain-Bildung. Bleibe bei executionMode = none.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
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
              "order": 4
            }
          ],
          "transitions": []
        },
        "step4_human_voting_and_ai_recommendation": {
          "id": "step4_human_voting_and_ai_recommendation",
          "label": {
            "de": "Human Voting & AI Recommendation"
          },
          "summary": {
            "de": "Menschen voten; die KI liest sichtbare Signale und gibt nur qualitative Empfehlungen oder eine knappe Verdichtung."
          },
          "visibleInstruction": {
            "de": "Lass Menschen über die blauen Use-Case-Ideen oder Cluster abstimmen. Nutze die KI danach nur für qualitative Review- und Empfehlungslogik."
          },
          "flowInstruction": {
            "de": "Das Voting machen Menschen. Die KI darf nur sichtbare Voting-Signale lesen und daraus qualitative Empfehlungen oder kurze Check-Notizen ableiten."
          },
          "endpoints": [
            {
              "id": "bmcase.ideation.step4.voting_coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Voting coachen"
              },
              "summary": {
                "de": "Erklärt das menschliche Voting und den Umgang mit sichtbaren Votes."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Human Voting & AI Recommendation.\nWichtig:\n- Das Voting machen immer Menschen.\n- Die KI stimmt nicht ab.\n- Wenn möglich, sollte eine Miro Voting Session auf den blauen Sticky Notes oder Clustern genutzt werden.\n\nCoache mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nHilf bei:\n- Was genau sollte abgestimmt werden?\n- Einzelne blaue Ideen oder bereits gebildete Cluster?\n- Sind die Kandidaten vergleichbar genug?\n- Ist das Modell tragfähig genug, um sinnvoll zu voten?\n- Sind sichtbare Voting-Signale später auswertbar?\n\nKeine Board-Mutationen.\nKein Score."
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
              "order": 1
            },
            {
              "id": "bmcase.ideation.step4.voting_review",
              "familyKey": "selection.review",
              "label": {
                "de": "Voting reviewen"
              },
              "summary": {
                "de": "Reviewt sichtbare Votes oder Voting-Signale qualitativ, ohne Entscheidungen zu erzwingen."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Human Voting & AI Recommendation.\nPrüfe sichtbare Voting-Signale qualitativ.\nWenn votingContext verfügbar ist, nutze ihn als menschliches Präferenzsignal.\nWenn votingContext nicht verfügbar ist, interpretiere nur sichtbare Punkte, Markierungen oder Anordnungen — und nenne klar, wenn keine belastbaren Voting-Daten vorhanden sind.\n\nAchte auf:\n- Sind die Top-Ideen oder Top-Cluster im sichtbaren Geschäftsmodell plausibel verankert?\n- Wirkt das Voting konsistent oder rein oberflächlich?\n- Gibt es sichtbare Kandidaten mit hoher Aufmerksamkeit, aber schwacher fachlicher Verankerung?\n- Welche Idee oder Domäne wirkt robust, welche eher fragil?\n\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "bmcase.ideation.step4.grade",
              "familyKey": "selection.grade",
              "label": {
                "de": "Empfehlung graden"
              },
              "summary": {
                "de": "Gibt eine qualitative 5-Sterne-Empfehlung auf Basis von Modellankern und menschlichem Voting."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Human Voting & AI Recommendation.\nGib eine qualitative Empfehlung, kein automatisches Urteil.\nWenn votingContext verfügbar ist, nutze ihn als menschliches Präferenzsignal.\nWenn votingContext nicht verfügbar ist, bleibe ausdrücklich bei einer qualitativen Empfehlung ohne behauptetes Voting-Ergebnis.\n\nBewerte nur auf Basis sichtbarer Informationen:\n- fachliche Verankerung im Geschäftsmodell\n- Klarheit und Substanz der Idee oder Domäne\n- sichtbare menschliche Präferenzsignale, falls vorhanden\n\nNutze im evaluation.score eine 5-Sterne-Empfehlung als String, zum Beispiel:\n- \"★★★★★\"\n- \"★★★☆☆\"\n- \"★☆☆☆☆\"\n\nDas ist nur eine Empfehlung, keine Entscheidung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 3
            },
            {
              "id": "bmcase.ideation.step4.synthesize",
              "familyKey": "selection.synthesize",
              "label": {
                "de": "Fokus verdichten"
              },
              "summary": {
                "de": "Verdichtet den aktuellen Stand in 1 bis 3 kurze Check-Notizen."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Human Voting & AI Recommendation.\nVerdichte den aktuellen Stand in 1 bis 3 kurze, hilfreiche Notizen im Feld 11_check.\nDiese Notizen sollen keine Entscheidung erzwingen, sondern den sichtbaren Stand knapp interpretieren.\n\nRegeln:\n- Nur kurze Aussagen.\n- Keine erfundenen Voting-Ergebnisse.\n- Wenn votes sichtbar sind, darfst du sie knapp interpretieren.\n- Wenn keine votes sichtbar sind, benenne die Empfehlung als qualitative Tendenz.\n- Schreibe keine langen Sätze.\n- Verwende bevorzugt weiße Notizen für solche knappen Check-/Decision-/Task-Hinweise.\n\nBeispiele:\n- \"Likely focus: Marketing Analytics\"\n- \"Votes visible, but shallow\"\n- \"Strong model anchor\"\n\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "11_check",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "business-model-case-ai-usecase-ideation-v1.step4_human_voting_and_ai_recommendation.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case.\n\nSchrittkontext: Human Voting & AI Recommendation. Menschen stimmen über die Use-Case-Ideen oder Cluster ab; die KI gibt auf Basis sichtbarer Informationen nur qualitative Empfehlungen.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "business-model-case-ai-usecase-ideation-v1.step4_human_voting_and_ai_recommendation.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-business-model-case"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Business Model / Case. Diese Übung bleibt auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Human Voting & AI Recommendation. Menschen stimmen über die Use-Case-Ideen oder Cluster ab; die KI gibt auf Basis sichtbarer Informationen nur qualitative Empfehlungen.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nAntworte zu menschlichem Voting, sichtbaren Votes und qualitativer Empfehlung. Wenn die Frage ausdrücklich nach einer knappen Check-Verdichtung fragt, darfst du proposal_only für kurze Notizen in 11_check verwenden.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "11_check",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
            }
          ],
          "transitions": []
        }
      }
    },
    "analytics-ai-maturity-assessment-planning-v1": {
      "exercisePackId": "analytics-ai-maturity-assessment-planning-v1",
      "label": {
        "de": "Analytics & AI Maturity Assessment & Planning"
      },
      "version": 1,
      "description": {
        "de": "Geführte Einzelcanvas-Übung auf dem Analytics & AI Maturity Canvas: Domäne fokussieren, aktuelle Reife verorten, fehlende Anwendungen aus Use-Case-Ideen ableiten, Vorläufer und Capabilities ergänzen und die nächste sinnvolle Anwendung qualitativ empfehlen."
      },
      "boardMode": "exercise",
      "allowedCanvasTypeIds": [
        "datentreiber-analytics-ai-maturity"
      ],
      "defaultCanvasTypeId": "datentreiber-analytics-ai-maturity",
      "defaultStepId": "step0_focus_and_input_framing",
      "defaults": {
        "feedbackChannel": "text",
        "userMayChangePack": false,
        "userMayChangeStep": false,
        "appAdminPolicy": "ui_toggle"
      },
      "steps": {
        "step0_focus_and_input_framing": {
          "id": "step0_focus_and_input_framing",
          "label": {
            "de": "Focus & Input Framing"
          },
          "summary": {
            "de": "Application Domain fokussieren, Input-Kontext sammeln und Scope sauber klären."
          },
          "visibleInstruction": {
            "de": "Benutze den Header für genau eine Application Domain. Sammle importierte blaue Input-Notizen links und parke Nebenthemen bewusst."
          },
          "flowInstruction": {
            "de": "Starte mit Fokus und Input-Framing. Trenne Domain, Input-Kontext und Nebenthemen sauber, bevor du mit Maturity-Mapping beginnst."
          },
          "endpoints": [
            {
              "id": "maturity.assess.step0.hint",
              "familyKey": "selection.hint",
              "label": {
                "de": "Hinweis geben"
              },
              "summary": {
                "de": "Gibt einen kurzen Hinweis für den nächsten sinnvollen Mikroschritt in Step 0"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Input Framing.\nZiel:\n- genau eine Application Domain im Header festlegen,\n- importierte blaue Input-Notizen links als Kontext sammeln,\n- Scope begrenzen,\n- Nebenthemen bewusst parken.\n\nGib 1 bis 2 kurze nächste Schritte oder Satzstarter.\nArbeite zuerst mit:\n- Header\n- Domänenfokus\n- Input-Lane links\n- bewusstem Parken in sorted_out_right\n\nSpringe noch nicht ins eigentliche Maturity-Mapping.\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 1
            },
            {
              "id": "maturity.assess.step0.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Fokus coachen"
              },
              "summary": {
                "de": "Coacht Fokus, Input-Lane und Scope mit Leitfragen"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Input Framing.\nHilf mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\n\nFokussiere auf:\n- Welche Application Domain ist gemeint?\n- Welche importierten blauen Notizen sind Input-Kontext und welche nicht?\n- Was gehört noch nicht in dieses Canvas?\n- Welche Nebenthemen sollten bewusst geparkt werden?\n\nLiefere keine Komplettlösung.\nBleibe im aktuellen Schritt.\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "maturity.assess.step0.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Fokus prüfen"
              },
              "summary": {
                "de": "Prüft, ob Fokus und Input-Kontext für das Maturity-Mapping tragfähig sind"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Input Framing.\n\nPrüfe qualitativ und knapp:\n- Ist genau eine Application Domain fokussiert?\n- Ist der Header spezifisch genug?\n- Ist sichtbar, was Input-Kontext ist und was schon echtes Maturity-Mapping wäre?\n- Sind Nebenthemen getrennt oder geparkt?\n- Ist der Canvas bereit für Step 1?\n\nNutze keine numerische Bewertung.\nGib:\n- 1 Stärke\n- 1 wichtigste Unschärfe\n- 1 nächsten Schritt\n\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 3
            },
            {
              "id": "maturity.assess.step0.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Fokus vorschlagen"
              },
              "summary": {
                "de": "Macht einen kleinen Vorschlag für Header, Input-Lane oder geparkte Scope-Varianten"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Input Framing.\nZiel:\n- genau eine Application Domain im Header benennen,\n- importierte blaue Input-Notizen links als Input-Kontext sichtbar machen,\n- Nebenthemen oder Alternativen bewusst parken.\n\nArbeite nur in:\n- header\n- sorted_out_left\n- sorted_out_right\n\nArbeite klein und anschlussfähig.\nWenn noch kein klarer Fokus sichtbar ist, formuliere einen kurzen Header-Fokus.\nNutze weiße Stickies für kritische Scope-Fragen oder riskante Annahmen.\nNutze sorted_out_left als Input-Lane für importierte blaue Use-Case-Ideen.\nNutze sorted_out_right für alternative Domänen oder spätere Themen.\n\nSticky-Regeln:\n- Header sehr kurz.\n- Weiße Scope-/Frage-Stickies kurz und präzise.\n- Eine Sticky = ein Gedanke.\n\nBeispiele:\n- \"Marketing Analytics & AI\"\n- \"Retail Pricing Domain\"\n- \"Input: copied use cases\"\n- \"Assumption: single domain\"\n\nKeine Maturity-Details vorwegnehmen.\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "header",
                  "sorted_out_left",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "analytics-ai-maturity-assessment-planning-v1.step0_focus_and_input_framing.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity.\n\nSchrittkontext: Focus & Input Framing. Die Application Domain wird im Header festgelegt. Importierte blaue Use-Case-Ideen können links als Input-Kontext gesammelt werden. Scope und Nebenthemen werden sauber getrennt.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "analytics-ai-maturity-assessment-planning-v1.step0_focus_and_input_framing.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Focus & Input Framing. Die Application Domain wird im Header festgelegt. Importierte blaue Use-Case-Ideen können links als Input-Kontext gesammelt werden. Scope und Nebenthemen werden sauber getrennt.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nWenn die Frage nach einem kleinen Fokus-, Scope- oder Input-Vorschlag fragt, darfst du proposal_only mit Header- oder Sorted-out-Notizen verwenden.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "header",
                  "sorted_out_left",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
            }
          ],
          "transitions": []
        },
        "step1_current_maturity_mapping": {
          "id": "step1_current_maturity_mapping",
          "label": {
            "de": "Current Maturity Mapping"
          },
          "summary": {
            "de": "Bestehende und geplante Anwendungen sowie zentrale Capabilities entlang der Reifestufen verorten."
          },
          "visibleInstruction": {
            "de": "Ordne bestehende und geplante Anwendungen sowie erste zentrale Capabilities den passenden Reifestufen zu."
          },
          "flowInstruction": {
            "de": "Baue jetzt das Maturity-Bild der gewählten Domain auf. Verorte Anwendungen und Capabilities plausibel und korrigiere Fehlplatzierungen."
          },
          "endpoints": [
            {
              "id": "maturity.assess.step1.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Reifegrad coachen"
              },
              "summary": {
                "de": "Coacht die Einordnung von Anwendungen und Capabilities mit heuristischen Leitfragen"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Current Maturity Mapping.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten Stickies ergänzt, verschoben oder gelöscht haben.\n\nHilf mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nDenk analytisch und heuristisch:\n- Welche Elemente sind eher Anwendungen für Business User?\n- Welche Elemente sind eher Capabilities wie Tools, Datenplattformen, Rollen oder Skills?\n- Welche Maturity-Stufe ist semantisch dominierend?\n- Welche vorhandenen Elemente fehlen noch, damit die Domäne realistisch greifbar wird?\n- Wo ist etwas wahrscheinlich im falschen Feld?\n\nZiel ist Kohärenz, nicht Vollständigkeits-Fiktion.\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 1
            },
            {
              "id": "maturity.assess.step1.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Reifegrad prüfen"
              },
              "summary": {
                "de": "Prüft Einordnung, Trennung von Anwendungen und Capabilities sowie offensichtliche Lücken"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Current Maturity Mapping.\nPrüfe qualitativ und knapp:\n- Sind bestehende und geplante Elemente plausibel über die Reifestufen verteilt?\n- Sind Anwendungen und Capabilities sauber getrennt?\n- Sind Farben sinnvoll genutzt (bestehend / geplant / fehlend)?\n- Gibt es offensichtliche Fehlplatzierungen?\n- Fehlen zentrale vorhandene oder geplante Bausteine, die aus dem sichtbaren Domänenkontext plausibel zu erwarten wären?\n\nNutze heuristische Schlüsse nur aus sichtbaren Hinweisen, nicht aus halluziniertem Kontext.\nMove vor delete.\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "maturity.assess.step1.review",
              "familyKey": "selection.review",
              "label": {
                "de": "Maturity Review"
              },
              "summary": {
                "de": "Gibt ein kompaktes qualitatives Zwischenreview zum aktuellen Maturity-Bild"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Current Maturity Mapping.\nLies das sichtbare Maturity-Bild als Struktur der Domain.\n\nBewerte knapp:\n- Was wirkt bereits plausibel?\n- Wo ist die Reife-Logik noch inkonsistent?\n- Welche Hauptlücke verhindert den nächsten sinnvollen Schritt am meisten?\n- Wo sollten Menschen eher umsortieren statt neue Stickies schreiben?\n\nKeine numerische Bewertung.\nKein Scoring.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 3
            },
            {
              "id": "maturity.assess.step1.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Maturity abbilden"
              },
              "summary": {
                "de": "Macht einen kleinen Vorschlag zum Mapping bestehender und geplanter Anwendungen/Capabilities"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Current Maturity Mapping.\nZiel:\n- bestehende und geplante Anwendungen auf 2a bis 2f verorten,\n- erste zentrale Capabilities auf 3a bis 3f verorten,\n- das Maturity-Bild kohärent machen.\n\nArbeite in:\n- 2a_business_operations\n- 2b_business_reporting\n- 2c_business_discovery\n- 2d_business_forecasting\n- 2e_business_optimization\n- 2f_business_automation\n- 3a_data_management\n- 3b_descriptive_analytics\n- 3c_diagnostic_analytics\n- 3d_predictive_analytics\n- 3e_prescriptive_analytics\n- 3f_autonomous_analytics\n- sorted_out_right\n\nArbeite eng am vorhandenen Zustand.\nWenn das Board noch leer ist, beginne nur mit wenigen zentralen Elementen.\nWenn schon Material da ist, ergänze gezielt statt alles neu aufzubauen.\n\nHeuristik:\n- End-user-facing application -> eher 2x\n- enabling capability / tool / skill / role -> eher 3x\n- Links stehen frühere, stärker operative und datennahe Stufen.\n- Rechts stehen fortgeschrittene und stärker autonome Stufen.\n\nSticky-Regeln:\n- Anwendungen und Capabilities sehr kurz.\n- Bevorzugt 1 bis 4 Wörter.\n- Eine Sticky = ein Element.\n\nBeispiele:\n- \"Social Media Management Suite\"\n- \"Marketing ROI Dashboard\"\n- \"Web Analytics\"\n- \"Data Warehouse\"\n- \"Data Engineer\"\n\nConnectoren:\n- nur für echte Entwicklungs- oder Abhängigkeitsbeziehungen.\n- Keine dekorativen Verbindungen.\n\nParke unsichere Randideen in sorted_out_right statt den Canvas zu überladen.\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "2a_business_operations",
                  "2b_business_reporting",
                  "2c_business_discovery",
                  "2d_business_forecasting",
                  "2e_business_optimization",
                  "2f_business_automation",
                  "3a_data_management",
                  "3b_descriptive_analytics",
                  "3c_diagnostic_analytics",
                  "3d_predictive_analytics",
                  "3e_prescriptive_analytics",
                  "3f_autonomous_analytics",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "analytics-ai-maturity-assessment-planning-v1.step1_current_maturity_mapping.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity.\n\nSchrittkontext: Current Maturity Mapping. Bestehende und geplante Anwendungen sowie erste Capabilities werden entlang der Reifestufen verortet. Die App hilft bei Einordnung, Fehlplatzierungen und impliziten Lücken.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "analytics-ai-maturity-assessment-planning-v1.step1_current_maturity_mapping.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Current Maturity Mapping. Bestehende und geplante Anwendungen sowie erste Capabilities werden entlang der Reifestufen verortet. Die App hilft bei Einordnung, Fehlplatzierungen und impliziten Lücken.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nWenn die Frage ausdrücklich nach einer kleinen Maturity-Ausarbeitung oder Korrektur fragt, darfst du proposal_only für kurze Anwendungen oder Capabilities in den passenden Reifestufen verwenden.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "2a_business_operations",
                  "2b_business_reporting",
                  "2c_business_discovery",
                  "2d_business_forecasting",
                  "2e_business_optimization",
                  "2f_business_automation",
                  "3a_data_management",
                  "3b_descriptive_analytics",
                  "3c_diagnostic_analytics",
                  "3d_predictive_analytics",
                  "3e_prescriptive_analytics",
                  "3f_autonomous_analytics",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
            }
          ],
          "transitions": []
        },
        "step2_missing_applications_and_use_case_mapping": {
          "id": "step2_missing_applications_and_use_case_mapping",
          "label": {
            "de": "Missing Applications & Use Case Mapping"
          },
          "summary": {
            "de": "Fehlende Anwendungen aus importierten Use-Case-Ideen ableiten und plausibel auf Reifestufen verorten."
          },
          "visibleInstruction": {
            "de": "Leite aus sichtbaren Use-Case-Ideen fehlende Anwendungen ab und ordne sie plausiblen Maturity-Stufen zu."
          },
          "flowInstruction": {
            "de": "Verknüpfe importierte Use-Case-Ideen mit fehlenden Anwendungen. Schärfe bei Bedarf das Modell, wenn sonst die Ableitung nicht tragfähig wäre."
          },
          "endpoints": [
            {
              "id": "maturity.assess.step2.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Use Cases coachen"
              },
              "summary": {
                "de": "Coacht die Ableitung fehlender Anwendungen aus sichtbaren Use-Case-Ideen"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Missing Applications & Use Case Mapping.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten blaue Use-Case-Ideen importiert, verschoben oder ergänzt haben.\n\nHilf mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\nDenk analytisch und heuristisch:\n- Welche importierte Problem-, Solution- oder Benefit-Notiz ist fachlich am klarsten?\n- Welche fehlende Anwendung würde diese Idee am ehesten adressieren?\n- Auf welcher Maturity-Stufe wäre diese Anwendung plausibel?\n- Fehlt eine naheliegende niedrigere Vorstufe?\n- Muss das Modell noch an einer Stelle geschärft werden, damit die Idee tragfähig verankert ist?\n\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 1
            },
            {
              "id": "maturity.assess.step2.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Use-Case-Mapping prüfen"
              },
              "summary": {
                "de": "Prüft, ob rote fehlende Anwendungen plausibel aus sichtbaren Input-Ideen ableitbar sind"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Missing Applications & Use Case Mapping.\nPrüfe qualitativ:\n- Sind die roten fehlenden Anwendungen wirklich aus sichtbaren blauen Input-Ideen ableitbar?\n- Ist die Maturity-Stufe plausibel?\n- Gibt es zu große Sprünge ohne erkennbare Vorstufe?\n- Sind rote Anwendungen präzise genug benannt?\n- Wurden blaue Input-Ideen mit zu wenig Modellanker in rote Anwendungen übersetzt?\n\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "maturity.assess.step2.review",
              "familyKey": "selection.review",
              "label": {
                "de": "Roadmap-Readiness reviewen"
              },
              "summary": {
                "de": "Gibt ein kompaktes Zwischenreview zur Güte der abgeleiteten fehlenden Anwendungen"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Missing Applications & Use Case Mapping.\nLies den sichtbaren Stand als Übergang von Use-Case-Input zu Maturity-Roadmap.\n\nBewerte knapp:\n- Welche fehlenden Anwendungen wirken gut verankert?\n- Wo ist der Ableitungsweg noch schwach oder spekulativ?\n- Welche blaue Idee ist fachlich stark, aber noch schlecht in eine Anwendung übersetzt?\n- Wo wäre weniger Breite und mehr Fokussierung sinnvoll?\n\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 3
            },
            {
              "id": "maturity.assess.step2.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Fehlende Anwendungen ableiten"
              },
              "summary": {
                "de": "Leitet aus sichtbaren Input-Ideen fehlende Anwendungen ab und verortet sie auf Reifestufen"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Missing Applications & Use Case Mapping.\nZiel:\n- aus sichtbaren blauen Use-Case-Ideen fehlende Anwendungen ableiten,\n- diese roten Anwendungen plausiblen Reifestufen zuordnen,\n- das Maturity-Bild dort ergänzen, wo eine sinnvolle Roadmap sichtbar wird.\n\nArbeite in:\n- 2a_business_operations\n- 2b_business_reporting\n- 2c_business_discovery\n- 2d_business_forecasting\n- 2e_business_optimization\n- 2f_business_automation\n- 3a_data_management\n- 3b_descriptive_analytics\n- 3c_diagnostic_analytics\n- 3d_predictive_analytics\n- 3e_prescriptive_analytics\n- 3f_autonomous_analytics\n- sorted_out_left\n- sorted_out_right\n\nNutze blaue Input-Notizen in sorted_out_left oder an sichtbaren Stellen des Canvas als Kontext.\nLeite fehlende Anwendungen nur dann ab, wenn der Business- oder Domain-Kontext sie plausibel trägt.\nWenn nötig, darfst du das Modell an kleinen Stellen weiter schärfen, damit die Ableitung tragfähig wird.\n\nHeuristik:\n- Reporting / KPI / Dashboard -> eher 2b\n- Analyse von Ursachen, Tests, Drivern -> eher 2c\n- Scoring / Forecast / Wahrscheinlichkeit -> eher 2d\n- Optimierung / beste Maßnahme -> eher 2e\n- autonome Entscheidung / Aktion -> eher 2f\n\nBlaue Input-Beispiele:\n- \"Problem: What's the ROI of social media marketing?\"\n- \"Problem: Which customer groups buy which products?\"\n- \"Solution: Demographic analysis of customer buying behavior\"\n- \"Benefit: More effective ad campaigns\"\n\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "2a_business_operations",
                  "2b_business_reporting",
                  "2c_business_discovery",
                  "2d_business_forecasting",
                  "2e_business_optimization",
                  "2f_business_automation",
                  "3a_data_management",
                  "3b_descriptive_analytics",
                  "3c_diagnostic_analytics",
                  "3d_predictive_analytics",
                  "3e_prescriptive_analytics",
                  "3f_autonomous_analytics",
                  "sorted_out_left",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "analytics-ai-maturity-assessment-planning-v1.step2_missing_applications_and_use_case_mapping.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity.\n\nSchrittkontext: Missing Applications & Use Case Mapping. Importierte blaue Use-Case-Ideen werden mit fehlenden Anwendungen verknüpft. Das Modell darf weiter geschärft werden, wenn dies die Ableitung roter Anwendungen plausibler macht.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "analytics-ai-maturity-assessment-planning-v1.step2_missing_applications_and_use_case_mapping.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Missing Applications & Use Case Mapping. Importierte blaue Use-Case-Ideen werden mit fehlenden Anwendungen verknüpft. Das Modell darf weiter geschärft werden, wenn dies die Ableitung roter Anwendungen plausibler macht.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nWenn die Frage ausdrücklich nach einer kleinen Ableitung fehlender Anwendungen oder Modellergänzung fragt, darfst du proposal_only verwenden.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "2a_business_operations",
                  "2b_business_reporting",
                  "2c_business_discovery",
                  "2d_business_forecasting",
                  "2e_business_optimization",
                  "2f_business_automation",
                  "3a_data_management",
                  "3b_descriptive_analytics",
                  "3c_diagnostic_analytics",
                  "3d_predictive_analytics",
                  "3e_prescriptive_analytics",
                  "3f_autonomous_analytics",
                  "sorted_out_left",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
            }
          ],
          "transitions": []
        },
        "step3_prerequisites_dependencies_and_capabilities": {
          "id": "step3_prerequisites_dependencies_and_capabilities",
          "label": {
            "de": "Prerequisites, Dependencies & Capabilities"
          },
          "summary": {
            "de": "Vorläufer, Abhängigkeiten und Capability-Lücken ergänzen, damit die Roadmap logisch und bottom-up tragfähig wird."
          },
          "visibleInstruction": {
            "de": "Denke von links nach rechts bei Anwendungen und bottom-up bei Capabilities. Ergänze nur echte prerequisites und sinnvolle Ausbaupfade."
          },
          "flowInstruction": {
            "de": "Mache jetzt die Roadmap logisch: Welche Vorläufer fehlen? Welche Capabilities tragen den nächsten Sprung? Welche Pfeile zeigen echte Abhängigkeiten?"
          },
          "endpoints": [
            {
              "id": "maturity.assess.step3.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Abhängigkeiten coachen"
              },
              "summary": {
                "de": "Coacht die Suche nach Vorläufern, Capabilities und echten Ausbaupfaden"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Prerequisites, Dependencies & Capabilities.\nHilf mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\n\nFokussiere auf:\n- Welche fehlende Anwendung setzt eine niedrigere Vorstufe voraus?\n- Welche Capability fehlt, damit dieser Sprung plausibel wird?\n- Welche Verbindung ist wirklich Voraussetzung und welche nur hilfreich?\n- Wo ist etwas eher Anwendung und wo eher Capability?\n- Welche rote Anwendung ist eigentlich nur die nächste Ausbauversion einer bestehenden oder geplanten Anwendung?\n\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 1
            },
            {
              "id": "maturity.assess.step3.check",
              "familyKey": "selection.check",
              "label": {
                "de": "Roadmap-Logik prüfen"
              },
              "summary": {
                "de": "Prüft Roadmap-Logik, prerequisite-Ketten und fehlende Capabilities"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Prerequisites, Dependencies & Capabilities.\nPrüfe qualitativ:\n- Ist die Roadmap logisch von links nach rechts und bottom-up aufgebaut?\n- Fehlen Vorläufer für rote Anwendungen?\n- Fehlen Capabilities, die den nächsten Sprung tragen müssten?\n- Gibt es Pfeile ohne echte Abhängigkeitslogik?\n- Gibt es zu ambitionierte Sprünge ohne Unterbau?\n\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "maturity.assess.step3.review",
              "familyKey": "selection.review",
              "label": {
                "de": "Roadmap reviewen"
              },
              "summary": {
                "de": "Gibt ein kompaktes qualitatives Review zur Tragfähigkeit der Roadmap"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Prerequisites, Dependencies & Capabilities.\nLies den sichtbaren Stand als Roadmap-Logik.\n\nBewerte knapp:\n- Welche Kette wirkt plausibel und anschlussfähig?\n- Wo fehlt noch der tragende Unterbau?\n- Welche Capability-Lücke ist aktuell die kritischste?\n- Welche rote Anwendung ist derzeit noch zu weit rechts für den sichtbaren Reifegrad?\n\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 3
            },
            {
              "id": "maturity.assess.step3.propose",
              "familyKey": "selection.propose",
              "label": {
                "de": "Prerequisites ergänzen"
              },
              "summary": {
                "de": "Ergänzt Vorläufer, Abhängigkeiten und notwendige Capabilities für eine tragfähige Roadmap"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Prerequisites, Dependencies & Capabilities.\nZiel:\n- rote Vorläufer oder prerequisite applications ergänzen,\n- Ausbaupfade mit klaren Pfeilen sichtbar machen,\n- fehlende Capabilities ergänzen,\n- die Roadmap logisch und stufenweise machen.\n\nArbeite in:\n- 2a_business_operations\n- 2b_business_reporting\n- 2c_business_discovery\n- 2d_business_forecasting\n- 2e_business_optimization\n- 2f_business_automation\n- 3a_data_management\n- 3b_descriptive_analytics\n- 3c_diagnostic_analytics\n- 3d_predictive_analytics\n- 3e_prescriptive_analytics\n- 3f_autonomous_analytics\n- sorted_out_left\n- sorted_out_right\n\nDenke von unten nach oben:\n- Data Management -> Descriptive -> Diagnostic -> Predictive -> Prescriptive -> Autonomous\n\nDenke bei Anwendungen von links nach rechts:\n- Operations -> Reporting -> Discovery -> Forecasting -> Optimization -> Automation\n\nConnectoren:\n- nur für echte prerequisite-, dependency- oder progression-Beziehungen.\n- Keine dekorativen Verbindungen.\n\nWenn eine Capability fehlt, ergänze sie lieber als kurze Capability-Notiz im passenden 3x-Feld, statt eine zu große rote Anwendung ohne Unterbau stehen zu lassen.\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "2a_business_operations",
                  "2b_business_reporting",
                  "2c_business_discovery",
                  "2d_business_forecasting",
                  "2e_business_optimization",
                  "2f_business_automation",
                  "3a_data_management",
                  "3b_descriptive_analytics",
                  "3c_diagnostic_analytics",
                  "3d_predictive_analytics",
                  "3e_prescriptive_analytics",
                  "3f_autonomous_analytics",
                  "sorted_out_left",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "analytics-ai-maturity-assessment-planning-v1.step3_prerequisites_dependencies_and_capabilities.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity.\n\nSchrittkontext: Prerequisites, Dependencies & Capabilities. Fehlende Anwendungen werden in logische Reihenfolgen gebracht. Vorläufer, Abhängigkeiten und notwendige Capabilities werden ergänzt.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "analytics-ai-maturity-assessment-planning-v1.step3_prerequisites_dependencies_and_capabilities.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Prerequisites, Dependencies & Capabilities. Fehlende Anwendungen werden in logische Reihenfolgen gebracht. Vorläufer, Abhängigkeiten und notwendige Capabilities werden ergänzt.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nWenn die Frage ausdrücklich nach einer kleinen Roadmap-Ergänzung oder Capability-Ergänzung fragt, darfst du proposal_only verwenden.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "2a_business_operations",
                  "2b_business_reporting",
                  "2c_business_discovery",
                  "2d_business_forecasting",
                  "2e_business_optimization",
                  "2f_business_automation",
                  "3a_data_management",
                  "3b_descriptive_analytics",
                  "3c_diagnostic_analytics",
                  "3d_predictive_analytics",
                  "3e_prescriptive_analytics",
                  "3f_autonomous_analytics",
                  "sorted_out_left",
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
            }
          ],
          "transitions": []
        },
        "step4_next_best_application_review": {
          "id": "step4_next_best_application_review",
          "label": {
            "de": "Next-Best Application Review"
          },
          "summary": {
            "de": "Den aktuellen Maturity-Stand reviewen und 1 bis 2 plausible nächste Anwendungen qualitativ empfehlen."
          },
          "visibleInstruction": {
            "de": "Prüfe, welche fehlenden Anwendungen am besten vorbereitet sind. Die KI empfiehlt, der Mensch entscheidet."
          },
          "flowInstruction": {
            "de": "Suche den plausibelsten nächsten Ausbauschritt. Nutze den sichtbaren Roadmap-Unterbau, aber ersetze keine menschliche Entscheidung."
          },
          "endpoints": [
            {
              "id": "maturity.assess.step4.coach",
              "familyKey": "selection.coach",
              "label": {
                "de": "Nächsten Schritt coachen"
              },
              "summary": {
                "de": "Coacht die Suche nach der plausibelsten nächsten Anwendung ohne Entscheidungshoheit zu übernehmen"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Next-Best Application Review.\nHilf mit 3 bis 5 Leitfragen und genau einem Mikroschritt.\n\nFokussiere auf:\n- Welche fehlende Anwendung baut am stärksten auf bestehenden oder plausibel geplanten Bausteinen auf?\n- Welche Anwendung hätte innerhalb der sichtbaren Domain den größten plausiblen Hebel?\n- Welche Anwendung wirkt noch zu früh?\n- Welche Capability-Lücke ist vor einer Umsetzung noch kritisch?\n- Wo sollte der Mensch genauer entscheiden statt der KI zu folgen?\n\nKeine Board-Mutationen.\nKein Score."
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
                "seedByDefault": false
              },
              "order": 1
            },
            {
              "id": "maturity.assess.step4.review",
              "familyKey": "selection.review",
              "label": {
                "de": "Empfehlung reviewen"
              },
              "summary": {
                "de": "Prüft qualitativ, welche fehlenden Anwendungen aktuell am besten vorbereitet sind"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Next-Best Application Review.\nPrüfe qualitativ:\n- Welche fehlenden Anwendungen sind am besten vorbereitet?\n- Welche bauen nur auf bestehenden oder plausibel geplanten Bausteinen auf?\n- Wo ist der Hebel sichtbar, ohne dass der Sprung zu groß wird?\n- Welche Kandidaten wirken attraktiv, sind aber noch schwach unterfüttert?\n\nKeine numerische Bewertung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 2
            },
            {
              "id": "maturity.assess.step4.grade",
              "familyKey": "selection.grade",
              "label": {
                "de": "Nächste Anwendung graden"
              },
              "summary": {
                "de": "Gibt eine qualitative 5-Sterne-Empfehlung für plausible nächste Anwendungen"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Next-Best Application Review.\nGib eine qualitative Empfehlung, kein automatisches Urteil.\n\nBewerte nur auf Basis sichtbarer Informationen:\n- fachliche Verankerung in der Domain\n- Stärke des vorhandenen Unterbaus\n- Klarheit des Ausbaupfads\n- sichtbare Capability-Lücken\n\nNutze im evaluation.score eine 5-Sterne-Empfehlung als String, zum Beispiel:\n- \"★★★★★\"\n- \"★★★☆☆\"\n- \"★☆☆☆☆\"\n\nDas ist nur eine Empfehlung, keine Entscheidung.\nKeine Board-Mutationen."
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
                "seedByDefault": false
              },
              "order": 3
            },
            {
              "id": "maturity.assess.step4.synthesize",
              "familyKey": "selection.synthesize",
              "label": {
                "de": "Empfehlung verdichten"
              },
              "summary": {
                "de": "Verdichtet den aktuellen Stand in 1 bis 3 kurze weiße Empfehlungs- oder Annahmen-Notizen"
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Next-Best Application Review.\nVerdichte den aktuellen Stand in 1 bis 3 kurze, hilfreiche weiße Notizen in sorted_out_right.\nDiese Notizen sollen keine Entscheidung erzwingen, sondern den sichtbaren Stand knapp interpretieren.\n\nRegeln:\n- Nur kurze Aussagen.\n- Keine erfundenen Votes oder Prioritäten.\n- Benenne Empfehlungen ausdrücklich als Tendenz oder Annahme.\n- Schreibe keine langen Sätze.\n- Verwende bevorzugt weiße Notizen für solche knappen Check-/Decision-/Task-Hinweise.\n\nBeispiele:\n- \"Likely next: ROI Dashboard\"\n- \"Need capability first\"\n- \"Forecasting too early\"\n\nNutze executionMode = proposal_only."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": [
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "board_button",
                "group": "proposal",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 4
            },
            {
              "id": "analytics-ai-maturity-assessment-planning-v1.step4_next_best_application_review.chat_apply",
              "familyKey": null,
              "label": {
                "de": "Vorschläge anwenden"
              },
              "summary": {
                "de": "Wendet den zuletzt erzeugten Vorschlag dieses Schritts an."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity.\n\nSchrittkontext: Next-Best Application Review. Der sichtbare Maturity- und Roadmap-Stand wird qualitativ bewertet, um eine oder zwei plausible nächste Anwendungen vorzubereiten. Die finale Entscheidung bleibt menschlich.\n\nWende nur den bereits gespeicherten Vorschlag für diesen Schritt an.\nKeine neue inhaltliche Analyse, keine neue Planung, kein neues Feedback."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
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
                ],
                "allowedActionAreas": []
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
              "id": "analytics-ai-maturity-assessment-planning-v1.step4_next_best_application_review.chat_submit",
              "familyKey": null,
              "label": {
                "de": "Frage stellen"
              },
              "summary": {
                "de": "Beantwortet Fragen zum aktuellen Schritt."
              },
              "scope": {
                "mode": "current",
                "allowedCanvasTypeIds": [
                  "datentreiber-analytics-ai-maturity"
                ]
              },
              "prompt": {
                "text": {
                  "de": "Du arbeitest auf dem Canvas Analytics & AI Maturity. Diese Übung bleibt in V1 auf einem Einzelcanvas ohne Cross-Canvas-Handoff.\n\nSchrittkontext: Next-Best Application Review. Der sichtbare Maturity- und Roadmap-Stand wird qualitativ bewertet, um eine oder zwei plausible nächste Anwendungen vorzubereiten. Die finale Entscheidung bleibt menschlich.\n\nAntworte instanzbezogen, verständlich und hilfreich auf Fragen zu diesem Canvas und zu genau diesem Schritt.\nDer sichtbare Boardzustand ist die Wahrheit. Rechne damit, dass Menschen zwischen den Schritten manuelle Änderungen vorgenommen haben.\n\nWenn die Frage ausdrücklich nach einer kleinen Check- oder Empfehlungsverdichtung fragt, darfst du proposal_only für kurze weiße Notizen in sorted_out_right verwenden.\n\nWenn conversationContext sichtbar ist, beantworte Rückfragen in Bezug auf den letzten Vorschlag oder die letzte Antwort.\nWenn keine konkrete Board-Ausarbeitung verlangt wird, bleibe bei executionMode = none.\nNur wenn die Frage ausdrücklich nach einer kleinen konkreten Board-Ausarbeitung in genau diesem Schritt verlangt, darfst du proposal_only wählen.\nHalluziniere keinen Kontext außerhalb des sichtbaren Boards."
                }
              },
              "run": {
                "mutationPolicy": "minimal",
                "feedbackPolicy": "text",
                "allowedExecutionModes": [
                  "none",
                  "proposal_only"
                ],
                "allowedActions": [
                  "create_sticky",
                  "move_sticky",
                  "delete_sticky",
                  "create_connector",
                  "set_sticky_color",
                  "set_check_status"
                ],
                "allowedActionAreas": [
                  "sorted_out_right"
                ]
              },
              "surface": {
                "channel": "chat_submit",
                "group": "hidden",
                "sidecarOnly": false,
                "seedByDefault": false
              },
              "order": 6
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

