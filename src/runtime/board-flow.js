function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => asNonEmptyString(value))
    .filter(Boolean)));
}

function normalizeScopeMode(value) {
  const normalized = asNonEmptyString(value);
  if (["selection", "current", "pack", "board"].includes(normalized)) return normalized;
  if (normalized === "fixed_instances") return "current";
  if (normalized === "global") return "pack";
  return "selection";
}

export function normalizeFlowScope(rawScope) {
  const src = (rawScope && typeof rawScope === "object") ? rawScope : {};
  return {
    type: normalizeScopeMode(src.type || src.mode),
    mode: normalizeScopeMode(src.mode || src.type),
    instanceIds: uniqueStrings(src.instanceIds),
    allowedCanvasTypeIds: uniqueStrings(src.allowedCanvasTypeIds)
  };
}

function normalizeFlowLabelMode(value) {
  return asNonEmptyString(value) === "custom" ? "custom" : "auto";
}

function createBoardFlowId() {
  return ["flow", Date.now().toString(36), Math.random().toString(36).slice(2, 7)].join(":");
}

export function createBoardFlowControlId(stepId, endpointId) {
  return [stepId || "step", endpointId || "endpoint"].join("::");
}

function resolveFlowControlBoardItemId(rawControl) {
  const src = (rawControl && typeof rawControl === "object") ? rawControl : {};
  if (src.boardItemId != null) return String(src.boardItemId);
  if (src.itemId != null) return String(src.itemId);
  return null;
}

function buildMissingMaterializedFlowControlFields(control) {
  const missing = [];
  if (!asNonEmptyString(control?.id)) missing.push("id");
  if (!asNonEmptyString(control?.stepId)) missing.push("stepId");
  if (!asNonEmptyString(control?.endpointId)) missing.push("endpointId");
  if (!resolveFlowControlBoardItemId(control)) missing.push("boardItemId");
  return missing;
}

export function normalizeFlowControl(rawControl, { throwOnInvalid = false } = {}) {
  const src = (rawControl && typeof rawControl === "object") ? rawControl : {};
  const missing = buildMissingMaterializedFlowControlFields(src);
  if (missing.length) {
    if (throwOnInvalid) {
      throw new Error("materialized flow control requires " + missing.join(", "));
    }
    return null;
  }

  const state = asNonEmptyString(src.state) || "disabled";
  const endpointId = asNonEmptyString(src.endpointId);
  const boardItemId = resolveFlowControlBoardItemId(src);

  return {
    id: asNonEmptyString(src.id),
    itemId: boardItemId,
    boardItemId,
    label: asNonEmptyString(src.label),
    labelMode: normalizeFlowLabelMode(src.labelMode),
    endpointId,
    stepId: asNonEmptyString(src.stepId),
    anchorInstanceId: asNonEmptyString(src.anchorInstanceId),
    scope: normalizeFlowScope(src.scope),
    state: ["active", "disabled", "done"].includes(state) ? state : "disabled",
    order: Number.isFinite(Number(src.order)) ? Number(src.order) : Number.MAX_SAFE_INTEGER,
    optional: src.optional === true,
    createdAt: asNonEmptyString(src.createdAt),
    lastTriggeredAt: asNonEmptyString(src.lastTriggeredAt)
  };
}

export function normalizeFlowStep(rawStep) {
  const src = (rawStep && typeof rawStep === "object") ? rawStep : {};
  const stepId = asNonEmptyString(src.stepId) || asNonEmptyString(src.id);
  return {
    id: stepId,
    stepId,
    label: asNonEmptyString(src.label),
    labelMode: normalizeFlowLabelMode(src.labelMode),
    order: Number.isFinite(Number(src.order)) ? Number(src.order) : 0,
    instruction: asNonEmptyString(src.instruction) || asNonEmptyString(src.flowInstruction),
    instructionOverride: asNonEmptyString(src.instructionOverride),
    flowInstruction: asNonEmptyString(src.flowInstruction) || asNonEmptyString(src.instruction),
    summary: asNonEmptyString(src.summary),
    endpointIds: uniqueStrings(src.endpointIds),
    controlIds: uniqueStrings(src.controlIds)
  };
}

function normalizeFlowRuntime(rawRuntime, fallbackStepId = null) {
  const src = (rawRuntime && typeof rawRuntime === "object") ? rawRuntime : {};
  const unlockedEndpointIds = uniqueStrings(src.unlockedEndpointIds || []);
  const doneEndpointIds = uniqueStrings(src.doneEndpointIds || []);
  return {
    currentStepId: asNonEmptyString(src.currentStepId) || asNonEmptyString(fallbackStepId),
    status: asNonEmptyString(src.status) || "active",
    lastTriggeredControlId: asNonEmptyString(src.lastTriggeredControlId),
    lastTriggeredAt: asNonEmptyString(src.lastTriggeredAt),
    unlockedEndpointIds,
    doneEndpointIds,
    lastActiveEndpointId: asNonEmptyString(src.lastActiveEndpointId),
    lastDirectiveAt: asNonEmptyString(src.lastDirectiveAt)
  };
}

function listRawFlowControls(rawControls) {
  if (Array.isArray(rawControls)) return rawControls;
  if (rawControls && typeof rawControls === "object") return Object.values(rawControls);
  return [];
}

function normalizeFlowControlsMap(rawControls) {
  const controls = {};
  for (const rawControl of listRawFlowControls(rawControls)) {
    const control = normalizeFlowControl(rawControl);
    if (!control?.id) continue;
    controls[control.id] = control;
  }
  return controls;
}

function syncStepControlIds(steps, controls) {
  const controlEntries = Object.values((controls && typeof controls === "object") ? controls : {})
    .filter((control) => !!control?.id && !!control?.stepId && !!control?.boardItemId)
    .sort((a, b) => (
      (Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER) -
      (Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER) ||
      String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" })
    ));

  const controlIdsByStepId = new Map();
  for (const control of controlEntries) {
    const existing = controlIdsByStepId.get(control.stepId) || [];
    existing.push(control.id);
    controlIdsByStepId.set(control.stepId, existing);
  }

  return (Array.isArray(steps) ? steps : []).map((step) => ({
    ...step,
    controlIds: uniqueStrings(controlIdsByStepId.get(step.id) || [])
  }));
}

function normalizeBoardFlowBase(rawFlow) {
  const src = (rawFlow && typeof rawFlow === "object") ? rawFlow : {};
  const steps = (Array.isArray(src.steps) ? src.steps : [])
    .map((step) => normalizeFlowStep(step))
    .filter((step) => !!step.id);
  const controls = normalizeFlowControlsMap(src.controls);
  const stepsWithControlIds = syncStepControlIds(steps, controls);
  const fallbackStepId = stepsWithControlIds.length
    ? stepsWithControlIds.slice().sort((a, b) => a.order - b.order)[0].id
    : null;

  return {
    version: 1,
    id: asNonEmptyString(src.id) || createBoardFlowId(),
    exercisePackId: asNonEmptyString(src.exercisePackId),
    anchorInstanceId: asNonEmptyString(src.anchorInstanceId),
    steps: stepsWithControlIds,
    controls,
    runtime: normalizeFlowRuntime(src.runtime, fallbackStepId),
    createdAt: asNonEmptyString(src.createdAt) || new Date().toISOString(),
    updatedAt: asNonEmptyString(src.updatedAt) || new Date().toISOString()
  };
}

function syncFlowControlStatesWithCurrentStepInternal(flow) {
  const normalized = normalizeBoardFlowBase(flow);
  const currentStepId = asNonEmptyString(normalized?.runtime?.currentStepId);
  const unlockedEndpointIds = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds));
  const doneEndpointIds = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds));
  const controls = {};

  for (const [controlId, rawControl] of Object.entries(normalized.controls || {})) {
    const control = normalizeFlowControl({ id: controlId, ...rawControl });
    if (!control?.id || !control.boardItemId) continue;

    let nextState = "disabled";
    if (control.endpointId && doneEndpointIds.has(control.endpointId)) {
      nextState = "done";
    } else if (control.endpointId && unlockedEndpointIds.has(control.endpointId)) {
      nextState = "active";
    } else if (control.stepId && currentStepId && control.stepId === currentStepId) {
      nextState = "active";
    }

    controls[control.id] = { ...control, state: nextState };
  }

  return {
    ...normalized,
    steps: syncStepControlIds(normalized.steps, controls),
    runtime: normalizeFlowRuntime(normalized?.runtime, currentStepId),
    controls
  };
}

export function normalizeBoardFlow(rawFlow) {
  return syncFlowControlStatesWithCurrentStepInternal(rawFlow);
}

export function createBoardFlowFromPack(exercisePack, anchorInstanceId, { lang = "de" } = {}) {
  const steps = (Array.isArray(exercisePack?.steps) ? exercisePack.steps : [])
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((step) => normalizeFlowStep({
      id: step.id,
      stepId: step.id,
      label: step.label,
      order: step.order,
      instruction: step.flowInstruction || step.visibleInstruction,
      flowInstruction: step.flowInstruction,
      summary: step.summary,
      endpointIds: step.endpointIds,
      controlIds: []
    }));

  const firstStepId = steps.length ? steps[0].id : null;
  void lang;

  return normalizeBoardFlow({
    version: 1,
    id: null,
    exercisePackId: exercisePack?.id || null,
    anchorInstanceId,
    steps,
    controls: [],
    runtime: {
      currentStepId: exercisePack?.defaultStepId || firstStepId,
      status: "active",
      lastTriggeredControlId: null,
      lastTriggeredAt: null,
      unlockedEndpointIds: [],
      doneEndpointIds: [],
      lastActiveEndpointId: null,
      lastDirectiveAt: null
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function createFlowControlRecord(payload = {}) {
  return normalizeFlowControl({
    id: payload.id,
    itemId: payload.itemId,
    boardItemId: payload.boardItemId,
    label: payload.label,
    labelMode: payload.labelMode,
    endpointId: payload.endpointId,
    stepId: payload.stepId,
    anchorInstanceId: payload.anchorInstanceId,
    scope: payload.scope,
    state: payload.state || "disabled",
    order: payload.order,
    optional: payload.optional === true,
    createdAt: payload.createdAt || new Date().toISOString(),
    lastTriggeredAt: payload.lastTriggeredAt || null
  }, { throwOnInvalid: true });
}

export function getFlowStep(flow, stepId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(stepId);
  if (!wanted) return null;
  return normalized.steps.find((step) => step.id === wanted) || null;
}

export function listFlowControlsForStep(flow, stepId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(stepId);
  if (!wanted) return [];
  return Object.values(normalized.controls).filter((control) => control.stepId === wanted && !!control.boardItemId);
}

export function findFlowControlsByEndpointId(flow, endpointId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(endpointId);
  if (!wanted) return [];
  return Object.values(normalized.controls).filter((control) => (
    control.endpointId === wanted && !!control.boardItemId
  ));
}

export function findFlowControlByItemId(flow, itemId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = itemId == null ? null : String(itemId);
  if (!wanted) return null;
  return Object.values(normalized.controls).find((control) => String(control.boardItemId || control.itemId || "") === wanted) || null;
}

export function syncFlowControlStatesWithCurrentStep(flow) {
  return syncFlowControlStatesWithCurrentStepInternal(flow);
}

export function addMaterializedFlowControl(flow, controlRecord) {
  const normalizedFlow = normalizeBoardFlowBase(flow);
  const normalizedControl = normalizeFlowControl(controlRecord, { throwOnInvalid: true });
  const controls = {
    ...normalizedFlow.controls,
    [normalizedControl.id]: normalizedControl
  };

  return syncFlowControlStatesWithCurrentStepInternal({
    ...normalizedFlow,
    controls,
    updatedAt: new Date().toISOString()
  });
}

export function upsertFlowControl(flow, control) {
  return addMaterializedFlowControl(flow, control);
}

export function setFlowCurrentStep(flow, stepId) {
  const normalized = normalizeBoardFlow(flow);
  const nextStep = getFlowStep(normalized, stepId);
  if (!nextStep) return normalized;
  return syncFlowControlStatesWithCurrentStepInternal({
    ...normalized,
    runtime: {
      ...normalized.runtime,
      currentStepId: nextStep.id,
      lastTriggeredControlId: normalized.runtime?.lastTriggeredControlId || null,
      lastTriggeredAt: normalized.runtime?.lastTriggeredAt || null
    },
    updatedAt: new Date().toISOString()
  });
}

export function mergeBoardFlowWithPack(boardFlow, exercisePack, { lang = "de" } = {}) {
  const normalizedFlow = normalizeBoardFlowBase(boardFlow);
  const refreshedFlow = createBoardFlowFromPack(exercisePack, normalizedFlow.anchorInstanceId, { lang });
  const validStepIds = new Set((refreshedFlow.steps || []).map((step) => step.id));
  const currentStepId = asNonEmptyString(normalizedFlow?.runtime?.currentStepId);
  const controls = {};

  for (const rawControl of Object.values(normalizedFlow.controls || {})) {
    const control = normalizeFlowControl(rawControl);
    if (!control?.id || !control.boardItemId) continue;
    controls[control.id] = control;
  }

  return syncFlowControlStatesWithCurrentStepInternal({
    ...refreshedFlow,
    id: normalizedFlow.id,
    runtime: {
      ...normalizedFlow.runtime,
      currentStepId: currentStepId && validStepIds.has(currentStepId)
        ? currentStepId
        : refreshedFlow.runtime?.currentStepId || null
    },
    controls,
    createdAt: normalizedFlow.createdAt,
    updatedAt: new Date().toISOString()
  });
}

export function applyFlowControlDirectives(flow, directives = {}) {
  const normalized = normalizeBoardFlow(flow);
  const unlockEndpointIds = uniqueStrings(directives.unlockEndpointIds || []);
  const completeEndpointIds = uniqueStrings(directives.completeEndpointIds || []);
  const nextUnlocked = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds || []));
  const nextDone = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds || []));

  for (const endpointId of unlockEndpointIds) {
    if (!endpointId) continue;
    if (!nextDone.has(endpointId)) nextUnlocked.add(endpointId);
  }
  for (const endpointId of completeEndpointIds) {
    if (!endpointId) continue;
    nextDone.add(endpointId);
    nextUnlocked.delete(endpointId);
  }

  return syncFlowControlStatesWithCurrentStepInternal({
    ...normalized,
    runtime: {
      ...normalized.runtime,
      unlockedEndpointIds: Array.from(nextUnlocked),
      doneEndpointIds: Array.from(nextDone),
      lastDirectiveAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  });
}

export function setFlowControlState(flow, controlId, nextState) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(controlId);
  const existing = wanted ? normalized.controls[wanted] : null;
  if (!wanted || !existing?.boardItemId) return normalized;

  return {
    ...normalized,
    controls: {
      ...normalized.controls,
      [wanted]: {
        ...existing,
        state: ["active", "disabled", "done"].includes(nextState) ? nextState : existing.state
      }
    },
    updatedAt: new Date().toISOString()
  };
}

function findMaterializedFlowControlByIdOrEndpoint(flow, endpointOrControlId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(endpointOrControlId);
  if (!wanted) return { flow: normalized, control: null };
  const control = Object.values(normalized.controls || {}).find((entry) => (
    !!entry?.boardItemId && (entry.id === wanted || entry.endpointId === wanted)
  )) || null;
  return { flow: normalized, control };
}

export function forceFlowControlActive(flow, endpointOrControlId) {
  const { flow: normalized, control } = findMaterializedFlowControlByIdOrEndpoint(flow, endpointOrControlId);
  if (!control?.endpointId) return normalized;

  const unlockedEndpointIds = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds || []));
  const doneEndpointIds = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds || []));
  doneEndpointIds.delete(control.endpointId);
  unlockedEndpointIds.add(control.endpointId);

  return syncFlowControlStatesWithCurrentStepInternal({
    ...normalized,
    runtime: {
      ...normalized.runtime,
      unlockedEndpointIds: Array.from(unlockedEndpointIds),
      doneEndpointIds: Array.from(doneEndpointIds),
      lastActiveEndpointId: control.endpointId,
      lastDirectiveAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  });
}

export function markFlowControlDone(flow, endpointOrControlId) {
  const { flow: normalized, control } = findMaterializedFlowControlByIdOrEndpoint(flow, endpointOrControlId);
  if (!control?.endpointId) return normalized;

  const unlockedEndpointIds = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds || []));
  const doneEndpointIds = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds || []));
  unlockedEndpointIds.delete(control.endpointId);
  doneEndpointIds.add(control.endpointId);

  return syncFlowControlStatesWithCurrentStepInternal({
    ...normalized,
    runtime: {
      ...normalized.runtime,
      unlockedEndpointIds: Array.from(unlockedEndpointIds),
      doneEndpointIds: Array.from(doneEndpointIds),
      lastActiveEndpointId: control.endpointId,
      lastDirectiveAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  });
}

export function resetFlowControlState(flow, endpointOrControlId) {
  const { flow: normalized, control } = findMaterializedFlowControlByIdOrEndpoint(flow, endpointOrControlId);
  if (!control?.endpointId) return normalized;

  const unlockedEndpointIds = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds || []));
  const doneEndpointIds = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds || []));
  unlockedEndpointIds.delete(control.endpointId);
  doneEndpointIds.delete(control.endpointId);

  return syncFlowControlStatesWithCurrentStepInternal({
    ...normalized,
    runtime: {
      ...normalized.runtime,
      unlockedEndpointIds: Array.from(unlockedEndpointIds),
      doneEndpointIds: Array.from(doneEndpointIds),
      lastActiveEndpointId: normalized.runtime.lastActiveEndpointId === control.endpointId ? null : normalized.runtime.lastActiveEndpointId,
      lastDirectiveAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  });
}
