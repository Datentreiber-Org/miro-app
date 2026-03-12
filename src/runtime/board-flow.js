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

export function normalizeFlowScope(rawScope) {
  const src = (rawScope && typeof rawScope === "object") ? rawScope : {};
  const type = asNonEmptyString(src.type) === "global" ? "global" : "fixed_instances";
  return {
    type,
    instanceIds: type === "fixed_instances" ? uniqueStrings(src.instanceIds) : []
  };
}


function normalizeFlowLabelMode(value) {
  return asNonEmptyString(value) === "custom" ? "custom" : "auto";
}

export function normalizeFlowControl(rawControl) {
  const src = (rawControl && typeof rawControl === "object") ? rawControl : {};
  const state = asNonEmptyString(src.state) || "disabled";
  return {
    id: asNonEmptyString(src.id),
    itemId: src.itemId == null ? null : String(src.itemId),
    label: asNonEmptyString(src.label),
    labelMode: normalizeFlowLabelMode(src.labelMode),
    endpointId: asNonEmptyString(src.endpointId),
    stepId: asNonEmptyString(src.stepId),
    anchorInstanceId: asNonEmptyString(src.anchorInstanceId),
    scope: normalizeFlowScope(src.scope),
    state: ["active", "disabled", "done"].includes(state) ? state : "disabled",
    optional: src.optional === true,
    createdAt: asNonEmptyString(src.createdAt),
    lastTriggeredAt: asNonEmptyString(src.lastTriggeredAt)
  };
}

export function normalizeFlowStep(rawStep) {
  const src = (rawStep && typeof rawStep === "object") ? rawStep : {};
  return {
    id: asNonEmptyString(src.id),
    label: asNonEmptyString(src.label),
    labelMode: normalizeFlowLabelMode(src.labelMode),
    order: Number.isFinite(Number(src.order)) ? Number(src.order) : 0,
    instruction: asNonEmptyString(src.instruction),
    instructionOverride: asNonEmptyString(src.instructionOverride),
    controlIds: uniqueStrings(src.controlIds)
  };
}

function normalizeFlowRuntime(rawRuntime, fallbackStepId = null) {
  const src = (rawRuntime && typeof rawRuntime === "object") ? rawRuntime : {};
  return {
    currentStepId: asNonEmptyString(src.currentStepId) || asNonEmptyString(fallbackStepId),
    status: asNonEmptyString(src.status) || "active",
    lastTriggeredControlId: asNonEmptyString(src.lastTriggeredControlId),
    lastTriggeredAt: asNonEmptyString(src.lastTriggeredAt),
    unlockedEndpointIds: uniqueStrings(src.unlockedEndpointIds),
    doneEndpointIds: uniqueStrings(src.doneEndpointIds),
    lastDirectiveAt: asNonEmptyString(src.lastDirectiveAt)
  };
}

export function normalizeBoardFlow(rawFlow) {
  const src = (rawFlow && typeof rawFlow === "object") ? rawFlow : {};
  const steps = (Array.isArray(src.steps) ? src.steps : []).map((step) => normalizeFlowStep(step)).filter((step) => !!step.id);
  const controlsSrc = (src.controls && typeof src.controls === "object") ? src.controls : {};
  const controls = {};
  for (const [controlId, rawControl] of Object.entries(controlsSrc)) {
    const control = normalizeFlowControl({ id: controlId, ...rawControl });
    if (!control.id) continue;
    controls[control.id] = control;
  }

  const fallbackStepId = steps.length ? steps.slice().sort((a, b) => a.order - b.order)[0].id : null;
  const normalized = {
    version: 1,
    id: asNonEmptyString(src.id),
    label: asNonEmptyString(src.label),
    labelMode: normalizeFlowLabelMode(src.labelMode),
    exercisePackId: asNonEmptyString(src.exercisePackId),
    anchorInstanceId: asNonEmptyString(src.anchorInstanceId),
    steps,
    controls,
    runtime: normalizeFlowRuntime(src.runtime, fallbackStepId),
    createdAt: asNonEmptyString(src.createdAt),
    updatedAt: asNonEmptyString(src.updatedAt)
  };

  return syncFlowControlStatesWithCurrentStep(normalized);
}

export function createBoardFlowFromPack(pack, overrides = {}) {
  const steps = (Object.values((pack?.steps && typeof pack.steps === "object") ? pack.steps : {}) || [])
    .slice()
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((step) => normalizeFlowStep({
      id: step.id,
      label: step.label,
      order: step.order,
      instruction: step.flowInstruction || step.visibleInstruction || step.instruction,
      controlIds: []
    }));

  const firstStepId = steps.length ? steps[0].id : null;
  return normalizeBoardFlow({
    version: 1,
    id: asNonEmptyString(overrides.id) || null,
    label: asNonEmptyString(overrides.label) || asNonEmptyString(pack?.label) || null,
    exercisePackId: asNonEmptyString(overrides.exercisePackId) || asNonEmptyString(pack?.id),
    anchorInstanceId: asNonEmptyString(overrides.anchorInstanceId),
    steps,
    controls: {},
    runtime: {
      currentStepId: asNonEmptyString(overrides.currentStepId) || firstStepId,
      status: "active",
      lastTriggeredControlId: null,
      lastTriggeredAt: null,
      unlockedEndpointIds: [],
      doneEndpointIds: [],
      lastDirectiveAt: null
    },
    createdAt: asNonEmptyString(overrides.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function createBoardFlowFromPackTemplate(packTemplate, overrides = {}) {
  return createBoardFlowFromPack(packTemplate, overrides);
}

export function createFlowControlRecord(payload = {}) {
  return normalizeFlowControl({
    id: payload.id,
    itemId: payload.itemId,
    label: payload.label,
    labelMode: payload.labelMode,
    endpointId: payload.endpointId,
    stepId: payload.stepId,
    anchorInstanceId: payload.anchorInstanceId,
    scope: payload.scope,
    state: payload.state || "disabled",
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

export function findFlowControlsByRunProfileId(flow, runProfileId) {
  return findFlowControlsByEndpointId(flow, runProfileId);
}

export function findFlowControlByItemId(flow, itemId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = itemId == null ? null : String(itemId);
  if (!wanted) return null;
  return Object.values(normalized.controls).find((control) => String(control.itemId || "") === wanted) || null;
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

    controls[control.id] = {
      ...control,
      state: nextState
    };
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

export function applyFlowControlDirectives(flow, directives = {}) {
  const normalized = normalizeBoardFlow(flow);
  const unlockEndpointIds = uniqueStrings(directives.unlockEndpointIds || directives.unlockRunProfileIds || []);
  const completeEndpointIds = uniqueStrings(directives.completeEndpointIds || directives.completeRunProfileIds || []);
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

export function forceFlowControlActive(flow, controlId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(controlId);
  const control = wanted ? normalized.controls?.[wanted] : null;
  if (!control) return normalized;
  if (!control.endpointId) return normalized;

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
      lastDirectiveAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  });
}

export function markFlowControlDone(flow, controlId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(controlId);
  const control = wanted ? normalized.controls?.[wanted] : null;
  if (!control) return normalized;
  if (!control.endpointId) return normalized;

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
      lastDirectiveAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  });
}

export function resetFlowControlState(flow, controlId) {
  const normalized = normalizeBoardFlow(flow);
  const wanted = asNonEmptyString(controlId);
  const control = wanted ? normalized.controls?.[wanted] : null;
  if (!control) return normalized;
  if (!control.endpointId) return normalized;

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
      lastDirectiveAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  });
}
