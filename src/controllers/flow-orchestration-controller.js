export function createFlowOrchestrationController(deps) {
  const {
    Board,
    BoardFlow,
    ExerciseEngine,
    ExerciseLibrary,
    Exercises,
    IS_HEADLESS,
    TEMPLATE_ID,
    applyStaticUiLanguage,
    buildRunFailureResult,
    flowAuthoringStatusEl,
    flowControlLabelEl,
    flowScopeTypeEl,
    flowStaticLayoutToggleEl,
    formatRuntimeErrorMessage,
    getCurrentDisplayLanguage,
    getCurrentUserQuestion,
    getEffectiveFlowEndpointById,
    getInstanceLabelByInternalId,
    getInstanceLabelsFromIds,
    getSelectedFlowEndpoint,
    getSelectedFlowEndpointId,
    getSelectedFlowExercisePack,
    getSelectedFlowExercisePackId,
    getSelectedFlowStep,
    getSelectedFlowStepId,
    getSelectedInstanceIds,
    isStaticFlowControlLayoutEnabled,
    listAuthorableEndpointsForStep,
    log,
    normalizeCanvasTypeId,
    notifyRuntime,
    persistBoardConfig,
    pickFirstNonEmptyString,
    refreshFlowEndpointOverridesFromStorage,
    refreshSelectionStatusFromBoard,
    refreshSelectionStatusFromItems,
    renderCanvasTypePicker,
    renderExerciseControls,
    renderFlowEndpointOverrideEditor,
    renderFlowEndpointPicker,
    renderFlowExercisePackPicker,
    renderFlowStepPicker,
    resolveBoardUserSeedText,
    resolveCurrentPackAndStepFromFlow,
    resolveRelevantFlowForInstance,
    resolveRelevantFlowForSelection,
    runStructuredEndpointExecution,
    setSelectedCanvasTypeId,
    state,
    syncAllChatApplyButtonsForCurrentFlows,
    syncAllChatProposeButtonsForCurrentFlows,
    syncBoardChromeLanguage,
    t,
  } = deps;

  function buildFlowControlLabelSourceKey() {
    const packId = getSelectedFlowExercisePackId() || "";
    const stepId = getSelectedFlowStepId() || "";
    const endpointId = getSelectedFlowEndpointId() || "";
    return [packId, stepId, endpointId].join("::");
  }
  
  function syncFlowControlLabelFromEndpoint({ force = false } = {}) {
    const lang = getCurrentDisplayLanguage();
    const endpoint = getSelectedFlowEndpoint(undefined, undefined, { lang });
    if (!flowControlLabelEl || !endpoint) return;
  
    const nextLabel = (pickFirstNonEmptyString(endpoint.label, t("flow.defaultControlLabel", lang)) || "").trim();
    const currentText = (flowControlLabelEl.value || "").trim();
    const autoText = (flowControlLabelEl.dataset.autoLabel || state.lastAutoFlowControlLabel || "").trim();
    const sourceKey = buildFlowControlLabelSourceKey();
    const previousSourceKey = (flowControlLabelEl.dataset.autoSourceKey || "").trim();
    const isManual = flowControlLabelEl.dataset.manualLabel === "1" || (!!state.flowControlLabelDirty && currentText !== autoText);
    const mayOverwrite = !currentText || !isManual || currentText === autoText;
  
    if (mayOverwrite && currentText !== nextLabel) {
      flowControlLabelEl.value = nextLabel;
    }
  
    if (mayOverwrite || force || previousSourceKey !== sourceKey) {
      flowControlLabelEl.dataset.autoLabel = nextLabel;
      flowControlLabelEl.dataset.autoSourceKey = sourceKey;
      flowControlLabelEl.dataset.manualLabel = mayOverwrite ? "0" : (isManual ? "1" : "0");
      state.lastAutoFlowControlLabel = nextLabel;
      state.flowControlLabelDirty = flowControlLabelEl.dataset.manualLabel === "1";
    }
  }
  
  function updateFlowControlLabelDirtyState() {
    if (!flowControlLabelEl) return;
    const currentText = (flowControlLabelEl.value || "").trim();
    const autoText = (flowControlLabelEl.dataset.autoLabel || state.lastAutoFlowControlLabel || "").trim();
    const manual = !!currentText && currentText !== autoText;
    flowControlLabelEl.dataset.manualLabel = manual ? "1" : "0";
    state.flowControlLabelDirty = manual;
  }
  
  function listDirectiveCandidateEndpointsForStep(exercisePack, stepId, { lang = getCurrentDisplayLanguage() } = {}) {
    if (!exercisePack?.id || !stepId) return [];
    return ExerciseLibrary.listBoardButtonEndpointsForStep(exercisePack, stepId, { lang }).map((endpoint) => ({
      endpointId: endpoint.id,
      label: endpoint.label || null,
      summary: endpoint.summary || null
    }));
  }
  
  function buildAdjacentStepGuidance(exercisePack, activeStepId, { lang = getCurrentDisplayLanguage() } = {}) {
    const steps = exercisePack?.id ? Exercises.listExerciseSteps(exercisePack, { lang }) : [];
    const currentIndex = steps.findIndex((step) => step?.id === activeStepId);
    const simplifyStep = (step) => step ? ({ stepId: step.id, label: step.label || null, summary: step.summary || null }) : null;
    return {
      previousStep: currentIndex > 0 ? simplifyStep(steps[currentIndex - 1]) : null,
      currentStep: currentIndex >= 0 ? simplifyStep(steps[currentIndex]) : null,
      nextStep: currentIndex >= 0 && currentIndex < steps.length - 1 ? simplifyStep(steps[currentIndex + 1]) : null
    };
  }
  
  function buildFlowGuidanceForPrompt({ exercisePack, flow, lang = getCurrentDisplayLanguage() } = {}) {
    if (!exercisePack?.id || !flow?.id) return null;
    const activeStepId = pickFirstNonEmptyString(flow?.runtime?.currentStepId);
    if (!activeStepId) return null;
  
    const adjacent = buildAdjacentStepGuidance(exercisePack, activeStepId, { lang });
    const currentDirectives = listDirectiveCandidateEndpointsForStep(exercisePack, activeStepId, { lang }).map((directive) => {
      const materializedControls = BoardFlow.findFlowControlsByEndpointId(flow, directive.endpointId);
      const activeControl = materializedControls[0] || null;
      return {
        endpointId: directive.endpointId,
        label: directive.label,
        summary: directive.summary,
        controlState: activeControl?.state || 'disabled'
      };
    });
  
    const nextStepDirectives = adjacent.nextStep?.stepId
      ? listDirectiveCandidateEndpointsForStep(exercisePack, adjacent.nextStep.stepId, { lang }).map((directive) => ({
          endpointId: directive.endpointId,
          label: directive.label
        }))
      : [];
  
    return {
      currentStep: adjacent.currentStep
        ? {
            ...adjacent.currentStep,
            directives: currentDirectives
          }
        : null,
      previousStep: adjacent.previousStep,
      nextStep: adjacent.nextStep
        ? {
            ...adjacent.nextStep,
            directives: nextStepDirectives
          }
        : null
    };
  }
  
  function resolveFlowPromptContext({ promptRuntimeOverride = null, targetInstanceIds = [] } = {}) {
    const lang = getCurrentDisplayLanguage();
    const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
  
    let anchorInstanceId = pickFirstNonEmptyString(runtime?.controlContext?.anchorInstanceId, runtime?.anchorInstanceId);
    if (anchorInstanceId && !state.instancesById.has(anchorInstanceId)) anchorInstanceId = null;
    if (!anchorInstanceId && Array.isArray(targetInstanceIds) && targetInstanceIds.length === 1 && state.instancesById.has(targetInstanceIds[0])) {
      anchorInstanceId = targetInstanceIds[0];
    }
  
    const flow = anchorInstanceId ? resolveRelevantFlowForInstance(anchorInstanceId) : resolveRelevantFlowForSelection(targetInstanceIds);
    const flowContext = resolveCurrentPackAndStepFromFlow(flow, { lang });
    const exercisePack = runtime?.exercisePack || flowContext.exercisePack || null;
    const exercisePackId = exercisePack?.id || flow?.exercisePackId || null;
  
    return {
      exercisePack,
      exercisePackId,
      anchorInstanceId: anchorInstanceId || flow?.anchorInstanceId || null,
      flow,
      flowGuidance: buildFlowGuidanceForPrompt({ exercisePack, flow, lang })
    };
  }
  
  function getEndpointSurfaceMeta(endpointId) {
    const endpoint = ExerciseLibrary.getEndpointById(endpointId, { lang: getCurrentDisplayLanguage() });
    return {
      sortOrder: Number.isFinite(Number(endpoint?.order)) ? Number(endpoint.order) : Number.MAX_SAFE_INTEGER,
      panelRole: endpoint?.surface?.group || null,
      boardGroup: endpoint?.surface?.group === "proposal" ? "proposal" : "core",
      seedByDefault: endpoint?.surface?.seedByDefault === true
    };
  }
  
  function getEndpointSortOrder(endpointId) {
    return getEndpointSurfaceMeta(endpointId).sortOrder;
  }
  
  function getEndpointPanelRoleRank(endpointId) {
    const panelRole = getEndpointSurfaceMeta(endpointId).panelRole;
    if (panelRole === "primary") return 0;
    if (panelRole === "proposal") return 1;
    if (panelRole === "secondary") return 2;
    return 3;
  }
  
  function getFlowControlDisplayBucket(flow, control) {
    const activeStepId = pickFirstNonEmptyString(flow?.runtime?.currentStepId);
    const boardGroup = getEndpointSurfaceMeta(control?.endpointId).boardGroup;
    const isCurrentStep = !!(control?.stepId && activeStepId && control.stepId === activeStepId);
    const isActiveLike = control?.state === "active";
    if (isCurrentStep) {
      if (boardGroup === "core") return 0;
      if (boardGroup === "proposal") return 1;
      return 2;
    }
    if (isActiveLike) return 2;
    return 3;
  }
  
  function getFlowControlDisplayLane(flow, control) {
    const bucket = getFlowControlDisplayBucket(flow, control);
    if (bucket === 0) return 0;
    if (bucket === 1) return 1;
    if (bucket === 2) return 2;
    return 3;
  }
  
  function sortFlowControlsForDisplay(flow, controls) {
    return (Array.isArray(controls) ? controls : [])
      .slice()
      .sort((a, b) => (
        getFlowControlDisplayBucket(flow, a) - getFlowControlDisplayBucket(flow, b) ||
        getEndpointPanelRoleRank(a?.endpointId) - getEndpointPanelRoleRank(b?.endpointId) ||
        getEndpointSortOrder(a?.endpointId) - getEndpointSortOrder(b?.endpointId) ||
        String(a?.label || a?.id || "").localeCompare(String(b?.label || b?.id || ""), undefined, { sensitivity: "base" })
      ));
  }
  
  async function syncBoardFlowVisuals(flow, { reflow = false } = {}) {
    if (!flow?.id) return flow;
    const lang = getCurrentDisplayLanguage();
    const orderedControls = sortFlowControlsForDisplay(flow, Object.values(flow.controls || {}));
    const anchorInstance = flow.anchorInstanceId ? state.instancesById.get(flow.anchorInstanceId) : null;
  
    if (reflow && anchorInstance) {
      const laneOffsets = new Map();
      for (const control of orderedControls) {
        if (!control?.boardItemId) continue;
        const laneIndex = getFlowControlDisplayLane(flow, control);
        const offsetIndex = laneOffsets.get(laneIndex) || 0;
        laneOffsets.set(laneIndex, offsetIndex + 1);
        try {
          const position = await Board.computeSuggestedFlowControlPosition(anchorInstance, { offsetIndex, laneIndex }, log);
          await Board.moveItemByIdToBoardCoords(control.boardItemId, position.x, position.y, log);
        } catch (e) {
          log("WARNUNG: Flow-Control-Layout konnte nicht aktualisiert werden: " + e.message);
        }
      }
    }
  
    for (const control of orderedControls) {
      if (!control?.boardItemId) continue;
      try {
        await Board.syncFlowControlShapeAppearance(control.boardItemId, { label: control.label, state: control.state, lang }, log);
      } catch (e) {
        log("WARNUNG: Flow-Control-Darstellung konnte nicht synchronisiert werden: " + e.message);
      }
    }
    return flow;
  }
  
  async function syncAllBoardFlowVisuals({ reflow = false } = {}) {
    const shouldReflow = !!reflow && !isStaticFlowControlLayoutEnabled();
    for (const flow of state.boardFlowsById.values()) {
      await syncBoardFlowVisuals(flow, { reflow: shouldReflow });
    }
  }
  
  function buildFlowId(exercisePackId, anchorInstanceId) {
    return [exercisePackId || "flow", anchorInstanceId || "anchor", Date.now().toString(36), Math.random().toString(36).slice(2, 7)].join(":");
  }
  
  function getExistingBoardFlowForPack(exercisePackId, anchorInstanceId) {
    for (const flow of state.boardFlowsById.values()) {
      if (flow?.exercisePackId === exercisePackId && flow?.anchorInstanceId === anchorInstanceId) return flow;
    }
    return null;
  }
  
  async function saveBoardFlowAndCache(flow, { reflow = false } = {}) {
    const saved = await Board.saveBoardFlow(flow, log);
    state.boardFlowsById.set(saved.id, saved);
    await syncBoardFlowVisuals(saved, { reflow: !!reflow && !isStaticFlowControlLayoutEnabled() });
    renderFlowAuthoringStatus();
    return saved;
  }
  
  function buildAuthorableFlowPack(exercisePack, { lang = getCurrentDisplayLanguage() } = {}) {
    if (!exercisePack?.id) return null;
    const steps = Exercises.listExerciseSteps(exercisePack, { lang }).map((step) => ({
      ...step,
      endpointIds: listAuthorableEndpointsForStep(exercisePack, step.id, { lang }).map((endpoint) => endpoint.id)
    }));
    return { ...exercisePack, steps };
  }
  
  async function ensureDefaultBoardControlsForStep(flow, stepId) {
    const normalizedStepId = pickFirstNonEmptyString(stepId);
    if (!flow?.id || !flow?.anchorInstanceId || !normalizedStepId || isStaticFlowControlLayoutEnabled()) {
      return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
    }
    const exercisePack = Exercises.getExercisePackById(flow.exercisePackId, { lang: getCurrentDisplayLanguage() });
    if (!exercisePack) return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
    const endpointIds = listAuthorableEndpointsForStep(exercisePack, normalizedStepId, { lang: getCurrentDisplayLanguage() })
      .filter((endpoint) => endpoint.surface?.seedByDefault === true)
      .map((endpoint) => endpoint.id);
    if (!endpointIds.length) return { flow, createdEndpointIds: [], skippedEndpointIds: [] };
    return await ensureFlowControlsForEndpoints({ flow, anchorInstanceId: flow.anchorInstanceId, endpointIds });
  }
  
  async function findOrCreateBoardFlowForPack(exercisePackId, anchorInstanceId, { preferredStepId = null, seedDefaults = true } = {}) {
    const normalizedExercisePackId = pickFirstNonEmptyString(exercisePackId);
    const normalizedAnchorInstanceId = pickFirstNonEmptyString(anchorInstanceId);
    const lang = getCurrentDisplayLanguage();
    const exercisePack = Exercises.getExercisePackById(normalizedExercisePackId, { lang });
    if (!exercisePack) throw new Error("Exercise Pack konnte nicht gefunden werden: " + String(exercisePackId || "(leer)"));
    const selectedStepId = pickFirstNonEmptyString(preferredStepId, getSelectedFlowStepId(exercisePack));
    const shouldSeedDefaults = !!seedDefaults && !isStaticFlowControlLayoutEnabled();
    const authorablePack = buildAuthorableFlowPack(exercisePack, { lang });
  
    const existing = normalizedAnchorInstanceId ? getExistingBoardFlowForPack(normalizedExercisePackId, normalizedAnchorInstanceId) : null;
    if (existing) {
      let healthyExisting = await ensureBoardFlowHealthy(existing, {
        persist: true,
        pruneMissingControls: true,
        preferredStepId: selectedStepId,
        forcePreferredWhenNoControls: true
      });
      if (shouldSeedDefaults) {
        const ensured = await ensureDefaultBoardControlsForStep(healthyExisting, healthyExisting.runtime?.currentStepId || selectedStepId);
        healthyExisting = ensured.flow;
        if (ensured.createdEndpointIds.length) {
          healthyExisting = await saveBoardFlowAndCache(healthyExisting, { reflow: !isStaticFlowControlLayoutEnabled() });
        } else {
          state.boardFlowsById.set(healthyExisting.id, healthyExisting);
        }
      } else {
        state.boardFlowsById.set(healthyExisting.id, healthyExisting);
      }
      return healthyExisting;
    }
  
    const anchorLabel = getInstanceLabelByInternalId(normalizedAnchorInstanceId) || normalizedAnchorInstanceId || "Board";
    let flow = BoardFlow.createBoardFlowFromPack(authorablePack, normalizedAnchorInstanceId, { lang });
    flow = BoardFlow.normalizeBoardFlow({
      ...flow,
      id: buildFlowId(exercisePack.id, normalizedAnchorInstanceId),
      anchorInstanceId: normalizedAnchorInstanceId,
      runtime: { ...(flow.runtime || {}), currentStepId: selectedStepId || flow.runtime?.currentStepId || null },
      label: exercisePack.label + " – " + anchorLabel,
      labelMode: "auto"
    });
  
    let createdEndpointIds = [];
    if (shouldSeedDefaults) {
      const ensured = await ensureDefaultBoardControlsForStep(flow, flow.runtime?.currentStepId || selectedStepId);
      flow = ensured.flow;
      createdEndpointIds = ensured.createdEndpointIds;
    }
    return await saveBoardFlowAndCache(flow, { reflow: createdEndpointIds.length > 0 && !isStaticFlowControlLayoutEnabled() });
  }
  
  function renderFlowAuthoringStatus() {
    if (!flowAuthoringStatusEl) return;
    const lang = getCurrentDisplayLanguage();
    const exercisePack = getSelectedFlowExercisePack({ lang });
    const step = getSelectedFlowStep(exercisePack, { lang });
    const endpoint = getSelectedFlowEndpoint(exercisePack, step, { lang });
    const selectedLabels = getInstanceLabelsFromIds(state.lastCanvasSelectionInstanceIds || []);
    const scopeType = (flowScopeTypeEl?.value || endpoint?.scope?.mode || "current");
    const scopeLabel = scopeType === "pack" ? t("flow.scope.pack", lang) : t("flow.scope.current", lang);
    const lines = [
      t("flow.status.boardFlows", lang, { count: state.boardFlowsById.size }),
      t("flow.status.exercisePack", lang, { value: exercisePack?.label || t("flow.status.none", lang) }),
      t("flow.status.step", lang, { value: step?.label || t("flow.status.none", lang) }),
      t("flow.status.endpoint", lang, { value: endpoint?.label || t("flow.status.none", lang) }),
      t("flow.status.selectedCanvas", lang, { value: selectedLabels.join(", ") || t("flow.status.selectedCanvas.none", lang) }),
      t("flow.status.scope", lang, { value: scopeLabel }),
      t("flow.status.layoutMode", lang, { value: t(isStaticFlowControlLayoutEnabled() ? "flow.layoutMode.static" : "flow.layoutMode.dynamic", lang) })
    ];
    if (endpoint?.summary) lines.push(t("flow.status.endpointSummary", lang, { value: endpoint.summary }));
    flowAuthoringStatusEl.textContent = lines.join("\n");
  }
  
  function renderFlowAuthoringControls({ forceLabelSync = false } = {}) {
    renderFlowExercisePackPicker();
    renderFlowStepPicker();
    renderFlowEndpointPicker();
    renderFlowEndpointOverrideEditor();
    if (flowStaticLayoutToggleEl) flowStaticLayoutToggleEl.checked = isStaticFlowControlLayoutEnabled();
    syncFlowControlLabelFromEndpoint({ force: forceLabelSync });
    renderFlowAuthoringStatus();
  }
  
  async function pruneMissingBoardFlowControls(flow) {
    const normalizedFlow = BoardFlow.normalizeBoardFlow(flow);
    const controls = Object.entries(normalizedFlow.controls || {});
    const itemIds = controls.map(([, control]) => String(control?.boardItemId || '')).filter(Boolean);
    if (!itemIds.length) return { flow: normalizedFlow, changed: false, removedControlIds: [] };
  
    let items = [];
    try {
      items = await Board.getItemsById(itemIds, log);
    } catch (error) {
      log('WARNUNG: Board-Flow-Controls konnten nicht geprüft werden: ' + formatRuntimeErrorMessage(error));
      return { flow: normalizedFlow, changed: false, removedControlIds: [] };
    }
  
    const presentItemIds = new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id || '')).filter(Boolean));
    const removedControlIds = controls.filter(([, control]) => control?.boardItemId && !presentItemIds.has(String(control.boardItemId))).map(([controlId]) => controlId);
    if (!removedControlIds.length) return { flow: normalizedFlow, changed: false, removedControlIds: [] };
    const removedSet = new Set(removedControlIds);
    const nextControls = Object.fromEntries(controls.filter(([controlId]) => !removedSet.has(controlId)));
    const nextSteps = (normalizedFlow.steps || []).map((step) => ({ ...step, controlIds: (Array.isArray(step.controlIds) ? step.controlIds : []).filter((controlId) => !removedSet.has(controlId)) }));
    const nextFlow = BoardFlow.normalizeBoardFlow({ ...normalizedFlow, controls: nextControls, steps: nextSteps, updatedAt: new Date().toISOString() });
    return { flow: nextFlow, changed: true, removedControlIds };
  }
  
  async function ensureBoardFlowHealthy(flow, { persist = false, pruneMissingControls = true, preferredStepId = null, forcePreferredWhenNoControls = false } = {}) {
    let nextFlow = BoardFlow.normalizeBoardFlow(flow);
    if (!nextFlow?.id) return nextFlow;
    const lang = getCurrentDisplayLanguage();
    const exercisePack = nextFlow.exercisePackId ? Exercises.getExercisePackById(nextFlow.exercisePackId, { lang }) : null;
    let changed = false;
    if (exercisePack) {
      const mergedFlow = BoardFlow.mergeBoardFlowWithPack(nextFlow, buildAuthorableFlowPack(exercisePack, { lang }), { lang });
      changed = changed || JSON.stringify(mergedFlow) !== JSON.stringify(nextFlow);
      nextFlow = mergedFlow;
    }
    const effectivePreferredStepId = pickFirstNonEmptyString(preferredStepId);
    const hasControls = Object.keys(nextFlow.controls || {}).length > 0;
    const validStepIds = new Set((nextFlow.steps || []).map((step) => step.id));
    if (effectivePreferredStepId && validStepIds.has(effectivePreferredStepId)) {
      const flowStepId = pickFirstNonEmptyString(nextFlow?.runtime?.currentStepId);
      if (!flowStepId || !validStepIds.has(flowStepId) || (forcePreferredWhenNoControls && !hasControls)) {
        const updatedFlow = BoardFlow.setFlowCurrentStep(nextFlow, effectivePreferredStepId);
        if (updatedFlow.runtime?.currentStepId !== nextFlow.runtime?.currentStepId) {
          nextFlow = updatedFlow;
          changed = true;
        }
      }
    }
    if (pruneMissingControls) {
      const pruned = await pruneMissingBoardFlowControls(nextFlow);
      nextFlow = pruned.flow;
      changed = changed || pruned.changed;
      if (pruned.removedControlIds?.length) log('WARNUNG: Verwaiste Board-Flow-Controls entfernt: ' + pruned.removedControlIds.join(', '));
    }
    if (changed && persist) {
      nextFlow = await Board.saveBoardFlow({ ...nextFlow, updatedAt: new Date().toISOString() }, log);
    }
    return nextFlow;
  }
  
  async function loadBoardFlows() {
    const flows = await Board.listBoardFlows(log);
    const entries = [];
    for (const flow of flows) {
      const healthyFlow = await ensureBoardFlowHealthy(flow, { persist: true, pruneMissingControls: true });
      if (healthyFlow?.id) entries.push([healthyFlow.id, healthyFlow]);
    }
    state.boardFlowsById = new Map(entries);
    await syncAllBoardFlowVisuals({ reflow: !isStaticFlowControlLayoutEnabled() });
    renderFlowAuthoringStatus();
  }
  
  function buildFlowScopeForEndpoint(endpoint, anchorInstanceId) {
    return endpoint?.scope?.mode === "pack" || endpoint?.scope?.mode === "board"
      ? { mode: endpoint.scope.mode, allowedCanvasTypeIds: endpoint.scope.allowedCanvasTypeIds || [] }
      : { mode: "current", allowedCanvasTypeIds: endpoint?.scope?.allowedCanvasTypeIds || [], instanceIds: anchorInstanceId ? [anchorInstanceId] : [] };
  }
  
  async function createBoardFlowControlForEndpoint({ flow, anchorInstanceId, endpoint, label = null, labelMode = "auto", scope = null } = {}) {
    if (!flow?.id || !anchorInstanceId || !endpoint?.id || !endpoint?.stepId) {
      throw new Error("Flow-Control kann nicht erzeugt werden: Flow, Anchor oder Endpoint fehlen.");
    }
  
    let workingFlow = await ensureBoardFlowHealthy(flow, {
      persist: false,
      pruneMissingControls: true,
      preferredStepId: endpoint.stepId,
      forcePreferredWhenNoControls: true
    });
  
    const orderedControls = sortFlowControlsForDisplay(workingFlow, Object.values(workingFlow.controls || {}));
    const initialState = (!orderedControls.length || workingFlow.runtime?.currentStepId === endpoint.stepId) ? "active" : "disabled";
    const draftControl = {
      endpointId: endpoint.id,
      stepId: endpoint.stepId,
      state: initialState,
      label: pickFirstNonEmptyString(label, endpoint.label, t("flow.defaultControlLabel", getCurrentDisplayLanguage()))
    };
    const orderedWithDraft = sortFlowControlsForDisplay(workingFlow, [...orderedControls, draftControl]);
    const draftIndex = orderedWithDraft.indexOf(draftControl);
    const laneIndex = getFlowControlDisplayLane(workingFlow, draftControl);
    const offsetIndex = orderedWithDraft.slice(0, draftIndex).filter((control) => getFlowControlDisplayLane(workingFlow, control) === laneIndex).length;
    const position = await Board.computeSuggestedFlowControlPosition(state.instancesById.get(anchorInstanceId), { offsetIndex, laneIndex }, log);
    const nextLabel = draftControl.label;
    const shape = await Board.createFlowControlShape({
      label: nextLabel,
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      state: initialState,
      lang: getCurrentDisplayLanguage()
    }, log);
  
    const controlId = BoardFlow.createBoardFlowControlId(endpoint.stepId, endpoint.id);
    const control = BoardFlow.createFlowControlRecord({
      id: controlId,
      boardItemId: shape.id,
      label: nextLabel,
      labelMode,
      endpointId: endpoint.id,
      stepId: endpoint.stepId,
      anchorInstanceId,
      scope: scope || buildFlowScopeForEndpoint(endpoint, anchorInstanceId),
      state: initialState
    });
  
    let nextFlow = BoardFlow.addMaterializedFlowControl(workingFlow, control);
    if (!orderedControls.length && nextFlow.runtime?.currentStepId !== endpoint.stepId) {
      nextFlow = BoardFlow.setFlowCurrentStep(nextFlow, endpoint.stepId);
    }
    await Board.writeFlowControlMeta(shape, { flowId: nextFlow.id, controlId }, log);
    return nextFlow;
  }
  
  async function ensureFlowControlsForEndpoints({ flow, anchorInstanceId, endpointIds = [] } = {}) {
    let nextFlow = flow;
    const createdEndpointIds = [];
    const skippedEndpointIds = [];
    for (const endpointId of Array.from(new Set((endpointIds || []).filter(Boolean)))) {
      if (BoardFlow.findFlowControlsByEndpointId(nextFlow, endpointId).length) continue;
      const endpoint = ExerciseLibrary.getEndpointById(endpointId, { lang: getCurrentDisplayLanguage() });
      if (!endpoint || endpoint.exercisePackId !== nextFlow.exercisePackId || ExerciseLibrary.isSidecarOnlyEndpoint(endpoint) || endpoint.surface?.group === 'hidden') {
        skippedEndpointIds.push(endpointId);
        continue;
      }
      try {
        nextFlow = await createBoardFlowControlForEndpoint({ flow: nextFlow, anchorInstanceId, endpoint });
        createdEndpointIds.push(endpointId);
      } catch (e) {
        skippedEndpointIds.push(endpointId);
        log("WARNUNG: Board Flow Control konnte nicht automatisch erzeugt werden: " + endpointId + " – " + e.message);
      }
    }
    return { flow: nextFlow, createdEndpointIds, skippedEndpointIds };
  }
  
  async function applyFlowControlDirectivesAfterAgentRun({ flowControlDirectives = null, promptRuntimeOverride = null, targetInstanceIds = [], sourceLabel = "Agent" } = {}) {
    const directives = ExerciseEngine.normalizeFlowControlDirectivesBlock(flowControlDirectives);
    const flowContext = resolveFlowPromptContext({ promptRuntimeOverride, targetInstanceIds });
    const result = {
      flowControlDirectives: directives ? { unlockEndpointIds: [], completeEndpointIds: [] } : null,
      activeAnchorContext: flowContext.exercisePackId && flowContext.anchorInstanceId ? { exercisePackId: flowContext.exercisePackId, anchorInstanceId: flowContext.anchorInstanceId } : null,
      createdEndpointIds: [],
      skippedEndpointIds: []
    };
    if (!directives) return result;
    if (!flowContext.exercisePackId) {
      log("WARNUNG: Flow-Control-Directives konnten nicht angewendet werden – kein Exercise Pack aktiv.");
      return result;
    }
  
    const allowedDirectiveEndpointIds = new Set([
      ...(Array.isArray(flowContext.flowGuidance?.currentStep?.directives) ? flowContext.flowGuidance.currentStep.directives : []),
      ...(Array.isArray(flowContext.flowGuidance?.nextStep?.directives) ? flowContext.flowGuidance.nextStep.directives : [])
    ].map((entry) => pickFirstNonEmptyString(entry?.endpointId)).filter(Boolean));
  
    const validUnlockEndpointIds = [];
    const validCompleteEndpointIds = [];
    for (const endpointId of directives.unlockEndpointIds || []) {
      if (!allowedDirectiveEndpointIds.has(endpointId)) {
        result.skippedEndpointIds.push(endpointId);
        continue;
      }
      validUnlockEndpointIds.push(endpointId);
    }
    for (const endpointId of directives.completeEndpointIds || []) {
      if (!allowedDirectiveEndpointIds.has(endpointId)) {
        result.skippedEndpointIds.push(endpointId);
        continue;
      }
      validCompleteEndpointIds.push(endpointId);
    }
  
    result.flowControlDirectives = {
      unlockEndpointIds: validUnlockEndpointIds.slice(),
      completeEndpointIds: validCompleteEndpointIds.slice()
    };
  
    let flow = flowContext.flow || null;
    const needsControlCreation = validUnlockEndpointIds.some((endpointId) => !flow || !BoardFlow.findFlowControlsByEndpointId(flow, endpointId).length);
    if ((!flow || needsControlCreation) && !flowContext.anchorInstanceId) {
      log("WARNUNG: Flow-Control-Directives konnten ohne eindeutigen Anchor nicht vollständig umgesetzt werden.");
      return result;
    }
    const staticLayout = isStaticFlowControlLayoutEnabled();
    if (!flow && flowContext.anchorInstanceId && !staticLayout) {
      flow = await findOrCreateBoardFlowForPack(flowContext.exercisePackId, flowContext.anchorInstanceId);
    }
    if (!flow) {
      if (staticLayout && (validUnlockEndpointIds.length || validCompleteEndpointIds.length)) {
        log("INFO: Statisches Button-Layout aktiv – ohne vorhandenen Flow werden Flow-Control-Directives nicht materialisiert.");
      }
      return result;
    }
    if (validUnlockEndpointIds.length && flowContext.anchorInstanceId && !staticLayout) {
      const ensured = await ensureFlowControlsForEndpoints({ flow, anchorInstanceId: flowContext.anchorInstanceId, endpointIds: validUnlockEndpointIds });
      flow = ensured.flow;
      result.createdEndpointIds.push(...ensured.createdEndpointIds);
      result.skippedEndpointIds.push(...ensured.skippedEndpointIds);
    } else if (validUnlockEndpointIds.length && staticLayout) {
      const missingEndpointIds = validUnlockEndpointIds.filter((endpointId) => !BoardFlow.findFlowControlsByEndpointId(flow, endpointId).length);
      if (missingEndpointIds.length) {
        result.skippedEndpointIds.push(...missingEndpointIds);
        log("INFO: Statisches Button-Layout aktiv – fehlende Buttons werden nicht erzeugt: " + missingEndpointIds.join(", ") + ".");
      }
    }
    flow = BoardFlow.applyFlowControlDirectives(flow, {
      unlockEndpointIds: validUnlockEndpointIds,
      completeEndpointIds: validCompleteEndpointIds
    });
    flow = await saveBoardFlowAndCache(flow, { reflow: result.createdEndpointIds.length > 0 && !isStaticFlowControlLayoutEnabled() });
    if (result.createdEndpointIds.length || validUnlockEndpointIds.length || validCompleteEndpointIds.length) {
      log(sourceLabel + ": Button-Zustände aktualisiert. Freigeschaltet=" + (validUnlockEndpointIds.join(", ") || "keine") + ", erledigt=" + (validCompleteEndpointIds.join(", ") || "keine") + (result.createdEndpointIds.length ? (", neu erzeugt=" + result.createdEndpointIds.join(", ")) : "") + ".");
    }
    return result;
  }
  
  async function resolveAuthoringScopeFromCurrentSelection(exercisePack, requestedScopeType) {
    const selectedInstanceIds = await refreshSelectionStatusFromBoard();
    const selected = Array.from(new Set((selectedInstanceIds || []).filter((id) => state.instancesById.has(id))));
    if (!selected.length) throw new Error("Bitte mindestens eine Canvas-Instanz auf dem Board selektieren.");
    const allowedCanvasTypeIds = new Set((exercisePack?.allowedCanvasTypeIds || []).filter(Boolean));
    const allowedSelected = selected.filter((instanceId) => {
      const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
      return !allowedCanvasTypeIds.size || (canvasTypeId && allowedCanvasTypeIds.has(canvasTypeId));
    });
    if (!allowedSelected.length) throw new Error("Die aktuelle Selektion enthält keine zum Exercise Pack passende Canvas-Instanz.");
    const scopeMode = requestedScopeType === "pack" ? "pack" : "current";
    return {
      anchorInstanceId: allowedSelected[0],
      scope: {
        mode: scopeMode,
        allowedCanvasTypeIds: Array.from(allowedCanvasTypeIds),
        instanceIds: scopeMode === 'current' ? allowedSelected : []
      }
    };
  }
  
  async function createFlowControlFromAdmin() {
    const lang = getCurrentDisplayLanguage();
    const exercisePack = getSelectedFlowExercisePack({ lang });
    const step = getSelectedFlowStep(exercisePack, { lang });
    const endpoint = getSelectedFlowEndpoint(exercisePack, step, { lang });
    if (!exercisePack || !step || !endpoint) {
      log("Board Flow: Bitte Exercise Pack, Schritt und Endpoint wählen.");
      return;
    }
    try {
      const { anchorInstanceId, scope } = await resolveAuthoringScopeFromCurrentSelection(exercisePack, flowScopeTypeEl?.value || endpoint.scope?.mode);
      let flow = await findOrCreateBoardFlowForPack(exercisePack.id, anchorInstanceId, { preferredStepId: step.id, seedDefaults: false });
      const existingMaterialized = BoardFlow.findFlowControlsByEndpointId(flow, endpoint.id);
      if (existingMaterialized.length) {
        log("Board Flow: Für diesen Endpoint existiert bereits ein materialisierter Button auf dieser Instanz. Kein Duplikat erzeugt.");
        return;
      }
      const inputLabel = ((flowControlLabelEl?.value || "").trim());
      const autoLabel = (flowControlLabelEl?.dataset.autoLabel || pickFirstNonEmptyString(endpoint.label, t("flow.defaultControlLabel", lang)) || "").trim();
      const nextLabel = inputLabel || autoLabel || t("flow.defaultControlLabel", lang);
      const labelMode = inputLabel && inputLabel !== autoLabel ? "custom" : "auto";
      flow = await createBoardFlowControlForEndpoint({ flow, anchorInstanceId, endpoint, label: nextLabel, labelMode, scope });
      flow = await saveBoardFlowAndCache(flow, { reflow: !isStaticFlowControlLayoutEnabled() });
      log("Board Flow Control erzeugt: '" + nextLabel + "'.");
      renderFlowAuthoringControls();
    } catch (e) {
      log("Board Flow: Control konnte nicht erzeugt werden – " + e.message);
    }
  }
  
  async function setCurrentFlowStepFromAdmin() {
    const lang = getCurrentDisplayLanguage();
    const exercisePack = getSelectedFlowExercisePack({ lang });
    const step = getSelectedFlowStep(exercisePack, { lang });
    if (!exercisePack || !step) {
      log("Board Flow: Bitte Exercise Pack und Schritt wählen.");
      return;
    }
    try {
      const { anchorInstanceId } = await resolveAuthoringScopeFromCurrentSelection(exercisePack, "current");
      let flow = await findOrCreateBoardFlowForPack(exercisePack.id, anchorInstanceId, { preferredStepId: step.id, seedDefaults: false });
      flow = BoardFlow.setFlowCurrentStep(flow, step.id);
      flow = await saveBoardFlowAndCache(flow, { reflow: false });
      log("Board Flow: Aktiver Schritt gesetzt auf '" + (step.label || step.id) + "' für " + (flow.label || flow.id) + ".");
      renderFlowAuthoringControls();
    } catch (e) {
      log("Board Flow: Schritt konnte nicht gesetzt werden – " + e.message);
    }
  }
  
  function getSelectedFlowControlLabel(controlSelection) {
    const control = controlSelection?.control || null;
    return pickFirstNonEmptyString(control?.label, control?.id, "Flow Control");
  }
  
  async function resolveSelectedFlowControl(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length !== 1) return null;
  
    const item = list[0];
    const meta = await Board.readFlowControlMeta(item, log);
    if (!meta) return null;
  
    const persistedFlow = await Board.loadBoardFlow(meta.flowId, log).catch(() => null);
    const rawFlow = persistedFlow || state.boardFlowsById.get(meta.flowId) || null;
    if (!rawFlow) return null;
  
    const flow = await ensureBoardFlowHealthy(rawFlow, { persist: true, pruneMissingControls: true });
    state.boardFlowsById.set(flow.id, flow);
    await syncBoardFlowVisuals(flow);
  
    const control = BoardFlow.findFlowControlByBoardItemId(flow, item.id) || flow.controls?.[meta.controlId] || null;
    if (!control) return null;
  
    return { item, meta, flow, control };
  }
  
  async function activateSelectedFlowControlFromAdmin() {
    const selection = await Board.getSelection(log).catch(() => []);
    const controlSelection = await resolveSelectedFlowControl(selection || []);
    if (!controlSelection) {
      log("Board Flow: Bitte genau einen platzierten Flow-Button selektieren.");
      return;
    }
    const control = controlSelection.control;
    if (!control?.endpointId) {
      log("Board Flow: Der selektierte Button hat keine endpointId und kann nicht fachlich freigeschaltet werden.");
      return;
    }
    if (control.state === "active") {
      log("Board Flow: Der selektierte Button ist bereits aktiv.");
      return;
    }
    let nextFlow = BoardFlow.forceFlowControlActive(controlSelection.flow, control.id);
    nextFlow = await saveBoardFlowAndCache(nextFlow);
    const nextControl = BoardFlow.findFlowControlByBoardItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;
    log("Board Flow: Button freigeschaltet: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ".");
    renderFlowAuthoringControls();
    await refreshSelectionStatusFromItems(selection || []);
  }
  
  async function markSelectedFlowControlDoneFromAdmin() {
    const selection = await Board.getSelection(log).catch(() => []);
    const controlSelection = await resolveSelectedFlowControl(selection || []);
    if (!controlSelection) {
      log("Board Flow: Bitte genau einen platzierten Flow-Button selektieren.");
      return;
    }
    const control = controlSelection.control;
    if (!control?.endpointId) {
      log("Board Flow: Der selektierte Button hat keine endpointId und kann nicht als erledigt markiert werden.");
      return;
    }
    if (control.state === "done") {
      log("Board Flow: Der selektierte Button ist bereits als erledigt markiert.");
      return;
    }
    let nextFlow = BoardFlow.markFlowControlDone(controlSelection.flow, control.id);
    nextFlow = await saveBoardFlowAndCache(nextFlow);
    const nextControl = BoardFlow.findFlowControlByBoardItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;
    log("Board Flow: Button als erledigt markiert: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ".");
    renderFlowAuthoringControls();
    await refreshSelectionStatusFromItems(selection || []);
  }
  
  async function resetSelectedFlowControlFromAdmin() {
    const selection = await Board.getSelection(log).catch(() => []);
    const controlSelection = await resolveSelectedFlowControl(selection || []);
    if (!controlSelection) {
      log("Board Flow: Bitte genau einen platzierten Flow-Button selektieren.");
      return;
    }
    const control = controlSelection.control;
    if (!control?.endpointId) {
      log("Board Flow: Der selektierte Button hat keine endpointId und kann nicht zurückgesetzt werden.");
      return;
    }
    let nextFlow = BoardFlow.resetFlowControlState(controlSelection.flow, control.id);
    nextFlow = await saveBoardFlowAndCache(nextFlow);
    const nextControl = BoardFlow.findFlowControlByBoardItemId(nextFlow, controlSelection.item.id) || nextFlow.controls?.[control.id] || control;
    log("Board Flow: Button zurückgesetzt: '" + getSelectedFlowControlLabel({ control: nextControl }) + "' in " + (nextFlow.label || nextFlow.id) + ".");
    renderFlowAuthoringControls();
    await refreshSelectionStatusFromItems(selection || []);
  }
  
  function resolveTargetInstanceIdsFromScope(scope, {
    exercisePack,
    anchorInstanceId = null,
    selectedInstanceIds = []
  } = {}) {
    const normalizedScope = BoardFlow.normalizeFlowScope(scope);
    const mode = normalizedScope.mode || normalizedScope.type || 'selection';
    const allowedCanvasTypeIds = new Set(normalizedScope.allowedCanvasTypeIds || exercisePack?.allowedCanvasTypeIds || []);
    const filterAllowed = (instanceIds) => (Array.isArray(instanceIds) ? instanceIds : []).filter((instanceId) => {
      const instance = state.instancesById.get(instanceId) || null;
      if (!instance) return false;
      if (!allowedCanvasTypeIds.size) return true;
      return !!instance.canvasTypeId && allowedCanvasTypeIds.has(instance.canvasTypeId);
    });
    if (mode === 'current') {
      const instanceIds = normalizedScope.instanceIds?.length ? normalizedScope.instanceIds : selectedInstanceIds;
      return filterAllowed(instanceIds);
    }
    if (mode === 'pack' || mode === 'board') {
      return filterAllowed(Array.from(state.instancesById.keys()));
    }
    if (anchorInstanceId) {
      return filterAllowed([anchorInstanceId]);
    }
    return filterAllowed(getSelectedInstanceIds());
  }
  
  function buildPromptRuntimeFromEndpoint({
    exercisePack,
    currentStep,
    endpoint,
    controlContext = null,
    adminOverride = null
  }) {
    return {
      mode: 'endpoint',
      exercisePack,
      currentStep,
      endpoint,
      controlContext,
      adminOverride
    };
  }
  
  async function runAgentFromFlowControl(flow, control, selectedItem) {
    const lang = getCurrentDisplayLanguage();
    await refreshFlowEndpointOverridesFromStorage();
    const healthyFlow = await ensureBoardFlowHealthy(flow, { persist: true, pruneMissingControls: true });
    state.boardFlowsById.set(healthyFlow.id, healthyFlow);
  
    const healthyControl = healthyFlow.controls?.[control?.id] || BoardFlow.findFlowControlByBoardItemId(healthyFlow, selectedItem?.id) || control;
    const endpoint = getEffectiveFlowEndpointById(healthyControl?.endpointId, { lang });
    const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(healthyFlow, { lang });
  
    if (!endpoint || !exercisePack || !currentStep) {
      const msg = "Board Flow: Control ist unvollständig konfiguriert (endpoint / step / exercisePack).";
      log(msg);
      if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
      return buildRunFailureResult("precondition", msg);
    }
  
    if (healthyControl.state !== "active") {
      const msg = "Board Flow: Control '" + (healthyControl.label || healthyControl.id) + "' ist derzeit nicht aktiv.";
      log(msg);
      if (IS_HEADLESS) await notifyRuntime(msg, { level: "warning" });
      return buildRunFailureResult("precondition", msg);
    }
  
    const targetInstanceIds = resolveTargetInstanceIdsFromScope(healthyControl.scope || endpoint.scope, {
      exercisePack,
      anchorInstanceId: healthyFlow.anchorInstanceId,
      selectedInstanceIds: healthyControl.scope?.instanceIds || [healthyFlow.anchorInstanceId]
    });
    const targetInstanceLabels = getInstanceLabelsFromIds(targetInstanceIds);
    const sourceLabel = healthyControl.label || endpoint.label || "Flow Control";
  
    const nextFlow = {
      ...healthyFlow,
      runtime: {
        ...(healthyFlow.runtime || {}),
        lastActiveEndpointId: endpoint.id || null
      }
    };
    await saveBoardFlowAndCache(nextFlow);
  
    return await runStructuredEndpointExecution({
      exercisePack,
      currentStep,
      endpoint,
      targetInstanceIds,
      userText: await resolveBoardUserSeedText(healthyFlow.anchorInstanceId || healthyControl.anchorInstanceId || targetInstanceIds[0] || null, getCurrentUserQuestion()),
      controlContext: {
        flowId: healthyFlow.id,
        controlId: healthyControl.id,
        controlLabel: healthyControl.label || null,
        anchorInstanceId: healthyFlow.anchorInstanceId || healthyControl.anchorInstanceId || null,
        scopeType: healthyControl.scope?.mode || healthyControl.scope?.type || null,
        targetInstanceLabels
      },
      anchorInstanceId: healthyFlow.anchorInstanceId || healthyControl.anchorInstanceId || null,
      sourceLabel
    });
  }
  
  async function syncDefaultCanvasTypeToBoardConfig(canvasTypeId) {
    const normalizedCanvasTypeId = normalizeCanvasTypeId(canvasTypeId);
    setSelectedCanvasTypeId(normalizedCanvasTypeId);
    await persistBoardConfig({ defaultCanvasTypeId: normalizedCanvasTypeId });
    renderCanvasTypePicker();
    renderExerciseControls();
  }
  
  async function loadBoardRuntimeState() {
    const fallbackCanvasTypeId = normalizeCanvasTypeId(state.selectedCanvasTypeId || TEMPLATE_ID);
    const loadedBoardConfig = await Board.loadBoardConfigFromAnchor({ defaultCanvasTypeId: fallbackCanvasTypeId, log });
    const normalizedBoardConfig = Board.normalizeBoardConfig(loadedBoardConfig, { defaultCanvasTypeId: fallbackCanvasTypeId });
    state.boardConfig = await Board.saveBoardConfigToAnchor(normalizedBoardConfig, { defaultCanvasTypeId: fallbackCanvasTypeId, log });
    setSelectedCanvasTypeId(state.boardConfig.defaultCanvasTypeId || fallbackCanvasTypeId);
    state.exerciseRuntime = Board.normalizeExerciseRuntime(await Board.loadExerciseRuntime(log));
    await loadBoardFlows();
    applyStaticUiLanguage(state.boardConfig.lang);
    renderCanvasTypePicker();
    renderExerciseControls();
    await syncAllChatProposeButtonsForCurrentFlows();
    await syncAllChatApplyButtonsForCurrentFlows();
    await syncBoardChromeLanguage(state.boardConfig.lang);
  }
  

  return {
    buildFlowControlLabelSourceKey,
    syncFlowControlLabelFromEndpoint,
    updateFlowControlLabelDirtyState,
    listDirectiveCandidateEndpointsForStep,
    buildAdjacentStepGuidance,
    buildFlowGuidanceForPrompt,
    resolveFlowPromptContext,
    getEndpointSurfaceMeta,
    getEndpointSortOrder,
    getEndpointPanelRoleRank,
    getFlowControlDisplayBucket,
    getFlowControlDisplayLane,
    sortFlowControlsForDisplay,
    syncBoardFlowVisuals,
    syncAllBoardFlowVisuals,
    buildFlowId,
    getExistingBoardFlowForPack,
    saveBoardFlowAndCache,
    buildAuthorableFlowPack,
    ensureDefaultBoardControlsForStep,
    findOrCreateBoardFlowForPack,
    renderFlowAuthoringStatus,
    renderFlowAuthoringControls,
    pruneMissingBoardFlowControls,
    ensureBoardFlowHealthy,
    loadBoardFlows,
    buildFlowScopeForEndpoint,
    createBoardFlowControlForEndpoint,
    ensureFlowControlsForEndpoints,
    applyFlowControlDirectivesAfterAgentRun,
    resolveAuthoringScopeFromCurrentSelection,
    createFlowControlFromAdmin,
    setCurrentFlowStepFromAdmin,
    getSelectedFlowControlLabel,
    resolveSelectedFlowControl,
    activateSelectedFlowControlFromAdmin,
    markSelectedFlowControlDoneFromAdmin,
    resetSelectedFlowControlFromAdmin,
    resolveTargetInstanceIdsFromScope,
    buildPromptRuntimeFromEndpoint,
    runAgentFromFlowControl,
    syncDefaultCanvasTypeToBoardConfig,
    loadBoardRuntimeState,
  };
}
