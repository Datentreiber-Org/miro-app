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

export function normalizeFlowControl(rawControl) {
  const src = (rawControl && typeof rawControl === "object") ? rawControl : {};
  const state = asNonEmptyString(src.state) || "disabled";
  const endpointId = asNonEmptyString(src.endpointId);
  return {
    id: asNonEmptyString(src.id),
    itemId: src.itemId == null ? (src.boardItemId == null ? null : String(src.boardItemId)) : String(src.itemId),
    boardItemId: src.boardItemId == null ? (src.itemId == null ? null : String(src.itemId)) : String(src.boardItemId),
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

export function normalizeBoardFlow(rawFlow) {
  const src = (rawFlow && typeof rawFlow === "object") ? rawFlow : {};
  const steps = (Array.isArray(src.steps) ? src.steps : []).map((step) => normalizeFlowStep(step)).filter((step) => !!step.id);
  const controlsSrc = Array.isArray(src.controls) ? src.controls : ((src.controls && typeof src.controls === "object") ? Object.values(src.controls) : []);
  const controls = {};
  for (const rawControl of controlsSrc) {
    const control = normalizeFlowControl(rawControl);
    if (!control.id) continue;
    controls[control.id] = control;
  }
  const fallbackStepId = steps.length ? steps.slice().sort((a, b) => a.order - b.order)[0].id : null;
  const normalized = {
    version: 1,
    id: asNonEmptyString(src.id) || createBoardFlowId(),
    exercisePackId: asNonEmptyString(src.exercisePackId),
    anchorInstanceId: asNonEmptyString(src.anchorInstanceId),
    steps,
    controls,
    runtime: normalizeFlowRuntime(src.runtime, fallbackStepId),
    createdAt: asNonEmptyString(src.createdAt) || new Date().toISOString(),
    updatedAt: asNonEmptyString(src.updatedAt) || new Date().toISOString()
  };
  return syncFlowControlStatesWithCurrentStep(normalized);
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

  const controls = {};
  for (const step of steps) {
    for (const [index, endpointId] of (step.endpointIds || []).entries()) {
      const control = normalizeFlowControl({
        id: createBoardFlowControlId(step.id, endpointId),
        stepId: step.id,
        endpointId,
        label: endpointId,
        scope: { mode: "selection", allowedCanvasTypeIds: exercisePack?.allowedCanvasTypeIds || [] },
        order: index,
        itemId: null,
        boardItemId: null,
        anchorInstanceId,
        createdAt: new Date().toISOString(),
        lastTriggeredAt: null
      });
      controls[control.id] = control;
      step.controlIds = uniqueStrings([...(step.controlIds || []), control.id]);
    }
  }

  const firstStepId = steps.length ? steps[0].id : null;
  return normalizeBoardFlow({
    version: 1,
    id: null,
    exercisePackId: exercisePack?.id || null,
    anchorInstanceId,
    steps,
    controls,
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
  });
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
  return Object.values(normalized.controls).filter((control) => control.stepId === wanted);
}

export function findFlowControlsByEndpointId(flow, endpointId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(endpointId);
  if (!wanted) return [];
  return Object.values(normalized.controls).filter((control) => control.endpointId === wanted);
}


export function findFlowControlByItemId(flow, itemId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = itemId == null ? null : String(itemId);
  if (!wanted) return null;
  return Object.values(normalized.controls).find((control) => String(control.itemId || control.boardItemId || "") === wanted) || null;
}

export function syncFlowControlStatesWithCurrentStep(flow) {
  const normalized = (flow && flow.version === 1) ? { ...flow } : normalizeBoardFlow(flow);
  const currentStepId = asNonEmptyString(normalized?.runtime?.currentStepId);
  const unlockedEndpointIds = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds));
  const doneEndpointIds = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds));
  const controls = {};
  for (const [controlId, rawControl] of Object.entries((normalized?.controls && typeof normalized.controls === "object") ? normalized.controls : {})) {
    const control = normalizeFlowControl({ id: controlId, ...rawControl });
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
    runtime: normalizeFlowRuntime(normalized?.runtime, currentStepId),
    controls
  };
}

export function upsertFlowControl(flow, control) {
  const normalizedFlow = normalizeBoardFlow(flow);
  const normalizedControl = normalizeFlowControl(control);
  if (!normalizedControl.id) return normalizedFlow;
  const controls = {
    ...normalizedFlow.controls,
    [normalizedControl.id]: normalizedControl
  };
  const steps = normalizedFlow.steps.map((step) => (
    step.id === normalizedControl.stepId
      ? { ...step, controlIds: uniqueStrings([...(step.controlIds || []), normalizedControl.id]) }
      : step
  ));
  return syncFlowControlStatesWithCurrentStep({
    ...normalizedFlow,
    steps,
    controls,
    updatedAt: new Date().toISOString()
  });
}

export function setFlowCurrentStep(flow, stepId) {
  const normalized = normalizeBoardFlow(flow);
  const nextStep = getFlowStep(normalized, stepId);
  if (!nextStep) return normalized;
  return syncFlowControlStatesWithCurrentStep({
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
  const normalizedFlow = normalizeBoardFlow(boardFlow);
  const base = createBoardFlowFromPack(exercisePack, normalizedFlow.anchorInstanceId, { lang });
  const existingControlsById = new Map(Object.values(normalizedFlow.controls || {}).map((control) => [control.id, control]));
  const mergedControls = {};
  for (const control of Object.values(base.controls || {})) {
    const existing = existingControlsById.get(control.id);
    mergedControls[control.id] = existing ? {
      ...control,
      itemId: existing.itemId || existing.boardItemId || null,
      boardItemId: existing.boardItemId || existing.itemId || null,
      label: existing.label || control.label,
      labelMode: existing.labelMode || control.labelMode,
      scope: normalizeFlowScope(existing.scope || control.scope),
      createdAt: existing.createdAt || control.createdAt,
      lastTriggeredAt: existing.lastTriggeredAt || null
    } : control;
  }
  return normalizeBoardFlow({
    ...base,
    id: normalizedFlow.id,
    runtime: normalizedFlow.runtime,
    controls: mergedControls,
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
  return syncFlowControlStatesWithCurrentStep({
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
  if (!wanted || !normalized.controls[wanted]) return normalized;
  return {
    ...normalized,
    controls: {
      ...normalized.controls,
      [wanted]: {
        ...normalized.controls[wanted],
        state: ["active", "disabled", "done"].includes(nextState) ? nextState : normalized.controls[wanted].state
      }
    },
    updatedAt: new Date().toISOString()
  };
}

export function forceFlowControlActive(flow, endpointOrControlId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(endpointOrControlId);
  const control = Object.values(normalized.controls || {}).find((entry) => entry.id === wanted || entry.endpointId === wanted) || null;
  if (!control || !control.endpointId) return normalized;
  const unlockedEndpointIds = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds || []));
  const doneEndpointIds = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds || []));
  doneEndpointIds.delete(control.endpointId);
  unlockedEndpointIds.add(control.endpointId);
  return syncFlowControlStatesWithCurrentStep({
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
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(endpointOrControlId);
  const control = Object.values(normalized.controls || {}).find((entry) => entry.id === wanted || entry.endpointId === wanted) || null;
  if (!control || !control.endpointId) return normalized;
  const unlockedEndpointIds = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds || []));
  const doneEndpointIds = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds || []));
  unlockedEndpointIds.delete(control.endpointId);
  doneEndpointIds.add(control.endpointId);
  return syncFlowControlStatesWithCurrentStep({
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
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(endpointOrControlId);
  const control = Object.values(normalized.controls || {}).find((entry) => entry.id === wanted || entry.endpointId === wanted) || null;
  if (!control || !control.endpointId) return normalized;
  const unlockedEndpointIds = new Set(uniqueStrings(normalized?.runtime?.unlockedEndpointIds || []));
  const doneEndpointIds = new Set(uniqueStrings(normalized?.runtime?.doneEndpointIds || []));
  unlockedEndpointIds.delete(control.endpointId);
  doneEndpointIds.delete(control.endpointId);
  return syncFlowControlStatesWithCurrentStep({
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
