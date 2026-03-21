export function createEndpointExecutionController(deps) {
  const {
    Board,
    Catalog,
    DT_GLOBAL_SYSTEM_PROMPT,
    DT_MEMORY_RECENT_LOG_LIMIT,
    DT_PROMPT_CATALOG,
    DT_TEMPLATE_CATALOG,
    ExerciseEngine,
    ExerciseLibrary,
    Exercises,
    FrameSources,
    IS_HEADLESS,
    Memory,
    OpenAI,
    PromptComposer,
    TEMPLATE_ID,
    acquireBoardSoftLock,
    applyFlowControlDirectivesAfterAgentRun,
    applyResolvedAgentActions,
    applyStoredProposalMechanically,
    buildBoardCatalogForSelectedInstances,
    buildConversationContextForPrompt,
    buildMemoryTimelineForPrompt,
    buildPendingProposalContextForPrompt,
    buildPromptRuntimeFromEndpoint,
    buildRunFailureResult,
    buildRunSuccessResult,
    buildSignatureSnapshot,
    buildStoredProposalRecord,
    clearPendingProposalForInstanceStep,
    computeInstanceStatesById,
    createRunStatusItems,
    ensureInstancesScanned,
    finalizeBoardSoftLock,
    findProposalEndpointForStep,
    formatExistingBoardRunMessage,
    formatRuntimeErrorMessage,
    getApiKey,
    getCurrentDisplayLanguage,
    getCurrentUserQuestion,
    getEffectiveFlowEndpointById,
    getInstanceLabelsFromIds,
    getInternalInstanceIdByLabel,
    getModel,
    getSelectedInstanceIds,
    hasMutatingActions,
    isFlowEndpointOverrideEligible,
    loadMemoryRuntimeState,
    log,
    logRuntimeNotice,
    normalizeTargetInstanceIds,
    notifyRuntime,
    performPreApplyConflictCheck,
    persistExerciseRuntime,
    pickFirstNonEmptyString,
    recordConversationTurn,
    refreshBoardState,
    refreshFlowEndpointOverridesFromStorage,
    refreshSelectionStatusFromBoard,
    refreshSelectionStatusFromItems,
    releaseAgentRunLock,
    renderAgentResponseToInstanceOutput,
    renderExerciseControls,
    resolveAllowedActionAreasForRun,
    resolveCurrentPackAndStepFromFlow,
    resolveFlowPromptContext,
    resolveRelevantFlowForInstance,
    resolveTargetInstanceIdsFromScope,
    restoreSelectionAfterBoardButtonRun,
    sanitizeProposalActionsForEndpoint,
    simplifyMemoryStateForPrompt,
    state,
    stripHtml,
    summarizeAppliedActions,
    syncBoardSoftLock,
    syncChatApplyButtonsForInstanceIds,
    syncChatProposeButtonsForInstanceIds,
    t,
    tryAcquireAgentRunLock,
  } = deps;

  function getPromptConfigForSelectedInstances(selectedInstanceIds) {
    const firstId = Array.isArray(selectedInstanceIds) && selectedInstanceIds.length ? selectedInstanceIds[0] : null;
    const firstInst = firstId ? state.instancesById.get(firstId) : null;
    return DT_PROMPT_CATALOG[firstInst?.canvasTypeId] || DT_PROMPT_CATALOG[TEMPLATE_ID];
  }
  
  function isBusinessModelCasePack(exercisePack) {
    return exercisePack?.id === "business-model-case-ai-usecase-ideation-v1";
  }
  
  function isBusinessModelVotingStep(currentStep) {
    return currentStep?.id === "step4_human_voting_and_ai_recommendation";
  }
  
  function listStickyAliasIdsFromActiveCanvasStates(activeCanvasStates) {
    const aliases = new Set();
    const states = (activeCanvasStates && typeof activeCanvasStates === "object") ? Object.values(activeCanvasStates) : [];
    for (const stateEntry of states) {
      for (const template of Array.isArray(stateEntry?.templates) ? stateEntry.templates : []) {
        for (const sticky of Array.isArray(template?.header?.stickies) ? template.header.stickies : []) {
          if (sticky?.id) aliases.add(sticky.id);
        }
        for (const area of Array.isArray(template?.areas) ? template.areas : []) {
          for (const sticky of Array.isArray(area?.stickies) ? area.stickies : []) {
            if (sticky?.id) aliases.add(sticky.id);
          }
        }
      }
    }
    return aliases;
  }
  
  function normalizeVotingSessions(rawResults) {
    if (Array.isArray(rawResults)) return rawResults;
    if (rawResults && typeof rawResults === "object") {
      if (Array.isArray(rawResults.sessions)) return rawResults.sessions;
      if (Array.isArray(rawResults.results)) return [rawResults];
    }
    return [];
  }
  
  function normalizeVotingEntries(session) {
    if (Array.isArray(session?.results)) return session.results;
    if (Array.isArray(session?.items)) return session.items;
    if (Array.isArray(session?.votes)) return session.votes;
    return [];
  }
  
  async function buildVotingContextForPrompt(activeCanvasStates) {
    const rawResults = await Board.getVotingResults(log);
    const sessions = normalizeVotingSessions(rawResults);
    if (!sessions.length) {
      return { available: false };
    }
  
    const allowedAliasIds = listStickyAliasIdsFromActiveCanvasStates(activeCanvasStates);
    const voteMap = new Map();
  
    for (const session of sessions) {
      for (const entry of normalizeVotingEntries(session)) {
        const rawItemId = pickFirstNonEmptyString(
          entry?.itemId,
          entry?.id,
          entry?.widgetId
        );
        if (!rawItemId) continue;
  
        const aliasId = state.aliasState?.stickyReverse?.[rawItemId] || null;
        if (!aliasId) continue;
        if (allowedAliasIds.size && !allowedAliasIds.has(aliasId)) continue;
  
        const votes = Number(entry?.count ?? entry?.votes ?? entry?.value ?? 0);
        if (!Number.isFinite(votes) || votes <= 0) continue;
  
        voteMap.set(aliasId, (voteMap.get(aliasId) || 0) + votes);
      }
    }
  
    const items = Array.from(voteMap.entries())
      .map(([stickyId, votes]) => ({ stickyId, votes }))
      .sort((a, b) => b.votes - a.votes || String(a.stickyId).localeCompare(String(b.stickyId)));
  
    if (!items.length) {
      return { available: false };
    }
  
    return {
      available: true,
      source: "miro_voting_session",
      items
    };
  }
  
  function createEmptyEndpointActionResult(extra = {}) {
    return {
      appliedCount: 0,
      skippedCount: 0,
      infoCount: 0,
      targetedInstanceCount: 0,
      ...createEmptyActionExecutionStats(),
      ...extra
    };
  }
  
  function buildEndpointExecutionContext({
    exercisePack,
    currentStep,
    endpoint,
    targetInstanceIds,
    controlContext = null,
    adminOverride = null,
    sourceLabel = "Endpoint"
  } = {}) {
    const normalizedTargetIds = normalizeTargetInstanceIds(targetInstanceIds);
    const targetInstanceLabels = getInstanceLabelsFromIds(normalizedTargetIds);
    const endpointContext = ExerciseEngine.resolveEndpointContext({
      exercisePack,
      currentStep,
      endpoint,
      targetInstanceIds: normalizedTargetIds,
      targetInstanceLabels,
      boardConfig: state.boardConfig
    });
    const promptRuntimeOverride = buildPromptRuntimeFromEndpoint({
      exercisePack,
      currentStep,
      endpoint,
      controlContext,
      adminOverride: pickFirstNonEmptyString(adminOverride, state.exerciseRuntime?.adminOverride) || null
    });
    const resolvedSourceLabel = pickFirstNonEmptyString(sourceLabel, controlContext?.controlLabel, endpoint?.label, "Endpoint");
    const activeStepId = pickFirstNonEmptyString(currentStep?.id);
    const sourceFrameNames = FrameSources.normalizeSourceFrameNames(endpoint?.sourceFrameNames || []);
    const flowPromptContext = resolveFlowPromptContext({
      promptRuntimeOverride,
      targetInstanceIds: normalizedTargetIds
    });
    const activeAnchorContext = flowPromptContext.exercisePackId && flowPromptContext.anchorInstanceId
      ? { exercisePackId: flowPromptContext.exercisePackId, anchorInstanceId: flowPromptContext.anchorInstanceId }
      : null;
  
    return {
      normalizedTargetIds,
      targetInstanceLabels,
      endpointContext,
      promptRuntimeOverride,
      resolvedSourceLabel,
      activeStepId,
      sourceFrameNames,
      flowPromptContext,
      activeAnchorContext
    };
  }
  
  function buildActiveCanvasStatesFromStateById(normalizedTargetIds, stateById) {
    const activeCanvasStates = Object.create(null);
  
    for (const instanceId of normalizeTargetInstanceIds(normalizedTargetIds)) {
      const instanceState = stateById?.[instanceId] || null;
      const instance = state.instancesById.get(instanceId) || null;
      const instanceLabel = instance?.instanceLabel || null;
      if (!instanceState?.classification || !instanceLabel) continue;
  
      const payload = Catalog.buildPromptPayloadFromClassification(instanceState.classification, {
        useAliases: true,
        aliasState: state.aliasState,
        log
      });
      if (payload) activeCanvasStates[instanceLabel] = payload;
    }
  
    const resolvedActiveLabels = Object.keys(activeCanvasStates);
    const resolvedActiveIds = resolvedActiveLabels
      .map((label) => getInternalInstanceIdByLabel(label))
      .filter((instanceId) => state.instancesById.has(instanceId));
  
    return {
      activeCanvasStates,
      resolvedActiveLabels,
      resolvedActiveIds
    };
  }
  
  async function buildStructuredEndpointPromptArtifacts({
    exercisePack,
    currentStep,
    endpointContext,
    promptRuntimeOverride,
    flowPromptContext,
    stateById,
    activeCanvasStates,
    resolvedActiveIds,
    resolvedActiveLabels,
    activeStepId,
    sourceFrameNames = [],
    userText = null
  } = {}) {
    const singleLabel = resolvedActiveLabels.length === 1 ? resolvedActiveLabels[0] : null;
    const singleInstanceId = resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null;
    const conversationContext = singleInstanceId ? buildConversationContextForPrompt(singleInstanceId) : null;
    const boardCatalog = buildBoardCatalogForSelectedInstances(resolvedActiveIds);
    let sourceFrames = null;
    if (Array.isArray(sourceFrameNames) && sourceFrameNames.length) {
      try {
        sourceFrames = await FrameSources.resolvePromptSourceFramesByName(sourceFrameNames, { log });
      } catch (error) {
        sourceFrames = FrameSources.createEmptySourceFramesPayload({ configuredFrameNames: sourceFrameNames });
        log("Hinweis: Zusätzliche Source-Frames konnten nicht vollständig aufgelöst werden: " + (error?.message || String(error)));
      }
    }
    const memoryState = simplifyMemoryStateForPrompt(state.memoryState);
    const memoryTimeline = buildMemoryTimelineForPrompt(state.memoryLog);
    const expectedSignatureSnapshot = buildSignatureSnapshot(stateById, resolvedActiveIds);
    const pendingProposalContext = singleInstanceId
      ? await buildPendingProposalContextForPrompt(singleInstanceId, { stepId: activeStepId })
      : null;
    const votingContext =
      isBusinessModelCasePack(exercisePack) && isBusinessModelVotingStep(currentStep)
        ? await buildVotingContextForPrompt(activeCanvasStates)
        : null;
    const resolvedAllowedActionAreas = resolveAllowedActionAreasForRun({
      endpointContext,
      activeCanvasStates
    });
    const promptCfg = getPromptConfigForSelectedInstances(resolvedActiveIds);
    const promptText = PromptComposer.composePrompt(promptRuntimeOverride, {
      lang: getCurrentDisplayLanguage(),
      systemPrompt: promptCfg?.system || DT_GLOBAL_SYSTEM_PROMPT,
      templateCatalog: DT_TEMPLATE_CATALOG,
      involvedCanvasTypeIds: getInvolvedCanvasTypeIdsFromInstanceIds(resolvedActiveIds),
      endpointContext: { ...endpointContext, allowedActionAreas: resolvedAllowedActionAreas },
      sourceFrames: sourceFrames?.enabled ? sourceFrames : null
    });
    const userQuestion = pickFirstNonEmptyString(userText, getCurrentUserQuestion());
  
    const userPayload = {
      userQuestion,
      activeInstanceLabel: singleLabel,
      selectedInstanceLabels: resolvedActiveLabels,
      boardCatalog,
      activeCanvasStates,
      memoryState,
      memoryTimeline,
      pendingProposalContext,
      conversationContext,
      flowGuidance: flowPromptContext.flowGuidance,
      allowedActionAreas: resolvedAllowedActionAreas,
      votingContext
    };
    if (sourceFrames?.enabled) {
      userPayload.sourceFrames = sourceFrames;
    }
  
    return {
      singleLabel,
      singleInstanceId,
      expectedSignatureSnapshot,
      resolvedAllowedActionAreas,
      promptText,
      userQuestion,
      userPayload
    };
  }
  
  async function syncEndpointChatButtons(instanceIds, { stepId = null } = {}) {
    await syncChatProposeButtonsForInstanceIds(instanceIds, { stepId });
    await syncChatApplyButtonsForInstanceIds(instanceIds, { stepId });
  }
  
  async function applyEndpointRunArtifactsAndSyncUi({
    endpoint,
    flowControlDirectives = null,
    promptRuntimeOverride = null,
    targetInstanceIds = [],
    sourceLabel = "Endpoint",
    activeAnchorContext = null,
    activeStepId = null,
    renderResponse = null,
    fallbackToOriginalFlowDirectives = true
  } = {}) {
    const flowDirectiveResult = await applyFlowControlDirectivesAfterAgentRun({
      flowControlDirectives,
      promptRuntimeOverride,
      targetInstanceIds,
      sourceLabel
    });
    const appliedFlowControlDirectives = flowDirectiveResult?.flowControlDirectives || (fallbackToOriginalFlowDirectives ? flowControlDirectives : null);
  
    if (renderResponse) {
      await renderAgentResponseToInstanceOutput({
        ...renderResponse,
        flowControlDirectives: appliedFlowControlDirectives,
        sourceLabel
      });
    }
  
    await persistExerciseRuntimeAfterEndpointRun({
      endpoint,
      flowControlDirectives: appliedFlowControlDirectives,
      activeAnchorContext: flowDirectiveResult?.activeAnchorContext || activeAnchorContext
    });
    await syncEndpointChatButtons(targetInstanceIds, { stepId: activeStepId });
  
    return {
      flowDirectiveResult,
      appliedFlowControlDirectives
    };
  }
  
  async function handleStructuredEndpointNoneMode({
    agentObj,
    currentStep,
    endpoint,
    promptRuntimeOverride,
    activeAnchorContext,
    flowControlDirectives,
    feedback,
    evaluation,
    executionMode,
    resolvedSourceLabel,
    resolvedActiveIds,
    resolvedActiveLabels,
    activeStepId,
    userText = null
  } = {}) {
    const actionResult = createEmptyEndpointActionResult();
    const responseTargetInstanceId = resolveResponseTargetInstanceId({
      promptRuntimeOverride,
      targetInstanceIds: resolvedActiveIds,
      anchorInstanceId: resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null
    });
  
    await persistMemoryAfterAgentRun(agentObj, {
      runMode: "endpoint",
      targetInstanceLabels: resolvedActiveLabels,
      userRequest: pickFirstNonEmptyString(userText, getCurrentUserQuestion())
    }, actionResult);
  
    await applyEndpointRunArtifactsAndSyncUi({
      endpoint,
      flowControlDirectives,
      promptRuntimeOverride,
      targetInstanceIds: resolvedActiveIds,
      sourceLabel: resolvedSourceLabel,
      activeAnchorContext,
      activeStepId,
      renderResponse: {
        instanceId: responseTargetInstanceId,
        feedback,
        evaluation,
        conversationMeta: {
          stepLabel: currentStep?.label || null,
          endpointLabel: endpoint?.label || null,
          channel: endpoint?.surface?.channel || null,
          executionMode
        }
      }
    });
  
    return buildRunSuccessResult({
      sourceLabel: resolvedSourceLabel,
      targetInstanceLabels: resolvedActiveLabels,
      actionResult,
      executionMode
    });
  }
  
  async function handleStructuredEndpointProposalMode({
    agentObj,
    currentStep,
    endpoint,
    endpointContext,
    promptRuntimeOverride,
    activeAnchorContext,
    flowControlDirectives,
    feedback,
    evaluation,
    executionMode,
    resolvedSourceLabel,
    resolvedActiveIds,
    resolvedActiveLabels,
    resolvedAllowedActionAreas,
    activeStepId,
    singleInstanceId,
    stateById,
    userText = null
  } = {}) {
    if (resolvedActiveIds.length !== 1 || !singleInstanceId) {
      const msg = resolvedSourceLabel + ": executionMode=proposal_only benötigt genau eine Ziel-Instanz.";
      logRuntimeNotice("precondition", msg);
      return buildRunFailureResult("precondition", msg);
    }
  
    const executableActions = sanitizeProposalActionsForEndpoint(agentObj.actions, {
      allowedActions: endpointContext?.allowedActions || [],
      allowedActionAreas: resolvedAllowedActionAreas,
      logFn: log
    }).filter((action) => action && action.type !== "inform");
  
    let proposalRecord = null;
    if (executableActions.length) {
      proposalRecord = buildStoredProposalRecord({
        instanceId: singleInstanceId,
        stepId: activeStepId,
        stepLabel: currentStep?.label || null,
        exercisePackId: promptRuntimeOverride?.exercisePack?.id || null,
        endpointId: promptRuntimeOverride?.endpoint?.id || null,
        promptRuntimeOverride,
        userRequest: pickFirstNonEmptyString(userText, getCurrentUserQuestion()),
        basedOnStateHash: stateById[singleInstanceId]?.signature?.stateHash || null,
        agentObj: {
          ...agentObj,
          actions: executableActions,
          executionMode
        },
        feedback,
        flowDirectives: flowControlDirectives,
        evaluation
      });
      await Board.saveActiveProposal(proposalRecord, log);
    } else {
      await Board.clearActiveProposal({
        anchorInstanceId: singleInstanceId,
        stepId: activeStepId
      }, log);
    }
  
    await applyEndpointRunArtifactsAndSyncUi({
      endpoint,
      flowControlDirectives,
      promptRuntimeOverride,
      targetInstanceIds: resolvedActiveIds,
      sourceLabel: resolvedSourceLabel,
      activeAnchorContext,
      activeStepId,
      fallbackToOriginalFlowDirectives: false,
      renderResponse: {
        instanceId: singleInstanceId,
        feedback,
        evaluation,
        conversationMeta: {
          stepLabel: currentStep?.label || null,
          endpointLabel: endpoint?.label || null,
          channel: endpoint?.surface?.channel || null,
          executionMode
        }
      }
    });
  
    return buildRunSuccessResult({
      sourceLabel: resolvedSourceLabel,
      targetInstanceLabels: resolvedActiveLabels,
      proposalId: proposalRecord?.proposalId || null,
      proposalStored: !!proposalRecord,
      actionResult: createEmptyEndpointActionResult({
        proposedCount: executableActions.length,
        queuedCount: executableActions.length,
        targetedInstanceCount: executableActions.length ? 1 : 0
      }),
      executionMode
    });
  }
  
  async function handleStructuredEndpointDirectApplyMode({
    agentObj,
    currentStep,
    endpoint,
    endpointContext,
    promptRuntimeOverride,
    activeAnchorContext,
    flowControlDirectives,
    feedback,
    evaluation,
    executionMode,
    resolvedSourceLabel,
    resolvedActiveIds,
    resolvedActiveLabels,
    resolvedAllowedActionAreas,
    activeStepId,
    expectedSignatureSnapshot,
    userText = null
  } = {}) {
    const executableDirectActions = sanitizeProposalActionsForEndpoint(agentObj.actions, {
      allowedActions: endpointContext?.allowedActions || [],
      allowedActionAreas: resolvedAllowedActionAreas,
      logFn: log
    }).filter((action) => action && action.type !== "inform");
  
    if (hasMutatingActions(executableDirectActions)) {
      const conflictCheck = await performPreApplyConflictCheck(expectedSignatureSnapshot, resolvedSourceLabel);
      if (!conflictCheck.ok) {
        logRuntimeNotice("stale_state_conflict", conflictCheck.message, conflictCheck.conflicts);
        return buildRunFailureResult("stale_state_conflict", conflictCheck.message, { conflicts: conflictCheck.conflicts });
      }
    }
  
    const actionResult = executableDirectActions.length
      ? await applyResolvedAgentActions(executableDirectActions, {
          candidateInstanceIds: resolvedActiveIds,
          anchorInstanceId: resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null,
          sourceLabel: resolvedSourceLabel
        })
      : createEmptyEndpointActionResult();
  
    await refreshBoardState();
  
    if (activeStepId) {
      for (const instanceId of resolvedActiveIds) {
        await clearPendingProposalForInstanceStep(instanceId, activeStepId);
      }
    }
  
    await persistMemoryAfterAgentRun(agentObj, {
      runMode: "endpoint",
      targetInstanceLabels: resolvedActiveLabels,
      userRequest: pickFirstNonEmptyString(userText, getCurrentUserQuestion())
    }, actionResult);
  
    await applyEndpointRunArtifactsAndSyncUi({
      endpoint,
      flowControlDirectives,
      promptRuntimeOverride,
      targetInstanceIds: resolvedActiveIds,
      sourceLabel: resolvedSourceLabel,
      activeAnchorContext,
      activeStepId,
      renderResponse: {
        instanceId: resolveResponseTargetInstanceId({
          promptRuntimeOverride,
          targetInstanceIds: resolvedActiveIds,
          anchorInstanceId: resolvedActiveIds.length === 1 ? resolvedActiveIds[0] : null
        }),
        feedback,
        evaluation,
        conversationMeta: {
          stepId: activeStepId,
          channel: endpoint?.surface?.channel || null,
          executionMode
        }
      }
    });
  
    return buildRunSuccessResult({
      sourceLabel: resolvedSourceLabel,
      targetInstanceLabels: resolvedActiveLabels,
      actionResult,
      executionMode
    });
  }
  
  async function runStructuredEndpointExecution({
    exercisePack,
    currentStep,
    endpoint,
    targetInstanceIds,
    userText = null,
    controlContext = null,
    adminOverride = null,
    sourceLabel = "Endpoint",
    anchorInstanceId = null
  } = {}) {
    await Board.ensureMiroReady(log);
    await ensureInstancesScanned();
    await loadMemoryRuntimeState();
  
    const {
      normalizedTargetIds,
      targetInstanceLabels,
      endpointContext,
      promptRuntimeOverride,
      resolvedSourceLabel,
      activeStepId,
      sourceFrameNames,
      flowPromptContext,
      activeAnchorContext
    } = buildEndpointExecutionContext({
      exercisePack,
      currentStep,
      endpoint,
      targetInstanceIds,
      controlContext,
      adminOverride,
      sourceLabel
    });
    const pureApplyEndpoint = endpoint?.surface?.channel === "chat_apply";
  
    if (pureApplyEndpoint) {
      return await applyStoredProposalMechanically({
        exercisePack,
        currentStep,
        endpoint,
        targetInstanceIds: normalizedTargetIds,
        userText: pickFirstNonEmptyString(userText, getCurrentUserQuestion()),
        sourceLabel: resolvedSourceLabel,
        anchorInstanceId: activeAnchorContext?.anchorInstanceId || anchorInstanceId || null
      });
    }
  
    const apiKey = getApiKey();
    if (!apiKey) {
      const msg = "Bitte OpenAI API Key eingeben (Endpoint).";
      logRuntimeNotice("precondition", msg);
      if (IS_HEADLESS) await notifyRuntime(msg, { level: "error" });
      return buildRunFailureResult("precondition", msg);
    }
  
    const model = getModel();
    const runLock = tryAcquireAgentRunLock(resolvedSourceLabel);
    if (!runLock) {
      return buildRunFailureResult("run_locked", resolvedSourceLabel + ": Ein Endpoint-Run läuft bereits.");
    }
  
    let boardRunToken = null;
    let finalBoardRunStatus = "failed";
    let finalBoardRunMessage = null;
  
    try {
      const boardRunStart = await acquireBoardSoftLock({
        sourceLabel: resolvedSourceLabel,
        targetInstanceIds: normalizedTargetIds
      });
      if (!boardRunStart.ok) {
        const msg = formatExistingBoardRunMessage(resolvedSourceLabel, boardRunStart.current);
        logRuntimeNotice("run_locked", msg);
        await notifyRuntime(msg, { level: "warning" });
        return buildRunFailureResult("run_locked", msg, { currentRunState: boardRunStart.current || null });
      }
  
      boardRunToken = boardRunStart.token;
  
      const { liveCatalog } = await refreshBoardState();
      const stateById = await computeInstanceStatesById(liveCatalog);
      const {
        activeCanvasStates,
        resolvedActiveLabels,
        resolvedActiveIds
      } = buildActiveCanvasStatesFromStateById(normalizedTargetIds, stateById);
  
      if (!resolvedActiveLabels.length) {
        const msg = resolvedSourceLabel + ": Konnte für die Ziel-Canvas keine Zustandsdaten aufbauen.";
        logRuntimeNotice("precondition", msg);
        finalBoardRunStatus = "aborted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("precondition", msg);
      }
  
      boardRunToken.targetInstanceIds = resolvedActiveIds.slice();
      boardRunToken.statusItemIds = await createRunStatusItems(resolvedActiveIds, resolvedSourceLabel, boardRunToken.runId);
      await syncBoardSoftLock(boardRunToken, {
        targetInstanceIds: resolvedActiveIds,
        statusItemIds: boardRunToken.statusItemIds
      });
      await notifyRuntime("AI arbeitet: " + resolvedSourceLabel, { level: "info" });
  
      const {
        singleLabel,
        singleInstanceId,
        expectedSignatureSnapshot,
        resolvedAllowedActionAreas,
        promptText,
        userQuestion,
        userPayload
      } = await buildStructuredEndpointPromptArtifacts({
        exercisePack,
        currentStep,
        endpointContext,
        promptRuntimeOverride,
        flowPromptContext,
        stateById,
        activeCanvasStates,
        resolvedActiveIds,
        resolvedActiveLabels,
        activeStepId,
        sourceFrameNames,
        userText
      });
  
      if (singleInstanceId && userQuestion) {
        recordConversationTurn(singleInstanceId, {
          role: "user",
          channel: endpoint.surface?.channel || controlContext?.sourceChannel || "endpoint",
          textSummary: userQuestion,
          stepLabel: currentStep?.label,
          endpointLabel: endpoint?.label
        });
      }
  
      log("Starte " + resolvedSourceLabel + " via Endpoint '" + endpoint.id + "' für: " + (resolvedActiveLabels.join(", ") || "(keine)") + " ...");
      const structuredResult = await OpenAI.callOpenAIEndpointStructured({
        apiKey,
        model,
        systemPrompt: promptText,
        userText: JSON.stringify(userPayload, null, 2)
      });
  
      if (structuredResult.refusal) {
        const msg = resolvedSourceLabel + ": Modell verweigert die Antwort: " + structuredResult.refusal;
        logRuntimeNotice("model_refusal", msg);
        finalBoardRunStatus = "aborted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("model_refusal", msg, { refusal: structuredResult.refusal });
      }
  
      const agentObj = structuredResult.parsed;
      if (!agentObj) {
        const msg = resolvedSourceLabel + ": Antwort ist kein valides strukturiertes JSON.";
        logRuntimeNotice("invalid_json", msg, structuredResult.outputText || "(keine output_text-Antwort)");
        finalBoardRunStatus = "aborted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("invalid_json", msg, { rawOutputText: structuredResult.outputText || null });
      }
  
      const executionMode = resolveEndpointExecutionMode(agentObj, endpointContext);
      const { feedback, flowControlDirectives, evaluation } = normalizeEndpointExecutionArtifacts(agentObj, endpoint, resolvedSourceLabel);
      log(resolvedSourceLabel + ": executionMode=" + executionMode + ".");
  
      if (executionMode === "none") {
        const runResult = await handleStructuredEndpointNoneMode({
          agentObj,
          currentStep,
          endpoint,
          promptRuntimeOverride,
          activeAnchorContext,
          flowControlDirectives,
          feedback,
          evaluation,
          executionMode,
          resolvedSourceLabel,
          resolvedActiveIds,
          resolvedActiveLabels,
          activeStepId,
          userText
        });
        finalBoardRunStatus = "completed";
        finalBoardRunMessage = resolvedSourceLabel + ": abgeschlossen.";
        return runResult;
      }
  
      if (executionMode === "proposal_only") {
        const runResult = await handleStructuredEndpointProposalMode({
          agentObj,
          currentStep,
          endpoint,
          endpointContext,
          promptRuntimeOverride,
          activeAnchorContext,
          flowControlDirectives,
          feedback,
          evaluation,
          executionMode,
          resolvedSourceLabel,
          resolvedActiveIds,
          resolvedActiveLabels,
          resolvedAllowedActionAreas,
          activeStepId,
          singleInstanceId,
          stateById,
          userText
        });
        if (!runResult?.ok) {
          finalBoardRunStatus = runResult?.errorType === "precondition" ? "aborted" : "failed";
          finalBoardRunMessage = runResult?.message || null;
          return runResult;
        }
        finalBoardRunStatus = "completed";
        finalBoardRunMessage = runResult.proposalStored
          ? (resolvedSourceLabel + ": Vorschlag gespeichert.")
          : (resolvedSourceLabel + ": Kein ausführbarer Vorschlag gespeichert.");
        return runResult;
      }
  
      const runResult = await handleStructuredEndpointDirectApplyMode({
        agentObj,
        currentStep,
        endpoint,
        endpointContext,
        promptRuntimeOverride,
        activeAnchorContext,
        flowControlDirectives,
        feedback,
        evaluation,
        executionMode,
        resolvedSourceLabel,
        resolvedActiveIds,
        resolvedActiveLabels,
        resolvedAllowedActionAreas,
        activeStepId,
        expectedSignatureSnapshot,
        userText
      });
      if (!runResult?.ok) {
        finalBoardRunStatus = runResult?.errorType === "stale_state_conflict" ? "conflicted" : "aborted";
        finalBoardRunMessage = runResult?.message || null;
        return runResult;
      }
  
      finalBoardRunStatus = "completed";
      finalBoardRunMessage = resolvedSourceLabel + ": abgeschlossen.";
      return runResult;
    } catch (e) {
      const msg = "Exception beim " + resolvedSourceLabel + "-Run: " + formatRuntimeErrorMessage(e);
      logRuntimeNotice("fatal", msg, e?.stack || null);
      finalBoardRunStatus = "failed";
      finalBoardRunMessage = msg;
      return buildRunFailureResult("fatal", msg, { error: e });
    } finally {
      if (boardRunToken) {
        await finalizeBoardSoftLock(boardRunToken, {
          status: finalBoardRunStatus,
          message: finalBoardRunMessage
        });
      }
      releaseAgentRunLock(runLock);
    }
  }
  
  async function runEndpoint(endpoint, options = {}) {
    if (!endpoint?.id) {
      const msg = "Endpoint konnte nicht gestartet werden – Endpoint fehlt.";
      log(msg);
      return buildRunFailureResult("precondition", msg);
    }
  
    const lang = getCurrentDisplayLanguage();
    const effectiveEndpoint = isFlowEndpointOverrideEligible(endpoint)
      ? getEffectiveFlowEndpointById(endpoint.id, { lang })
      : endpoint;
    const exercisePack = Exercises.getExercisePackById(effectiveEndpoint.exercisePackId, { lang });
    const currentStep = Exercises.getExerciseStep(exercisePack, effectiveEndpoint.stepId, { lang });
    if (!exercisePack || !currentStep) {
      const msg = "Endpoint konnte nicht gestartet werden – Pack oder Schritt fehlen.";
      log(msg);
      return buildRunFailureResult("precondition", msg);
    }
  
    const targetInstanceIds = resolveTargetInstanceIdsFromScope(effectiveEndpoint.scope, {
      exercisePack,
      anchorInstanceId: options.anchorInstanceId || null,
      selectedInstanceIds: options.selectedInstanceIds || getSelectedInstanceIds()
    });
  
    return await runStructuredEndpointExecution({
      exercisePack,
      currentStep,
      endpoint: effectiveEndpoint,
      targetInstanceIds,
      userText: pickFirstNonEmptyString(options.userText) || await resolveBoardUserSeedText(options.anchorInstanceId || targetInstanceIds[0] || null, getCurrentUserQuestion()),
      controlContext: options.controlContext || null,
      adminOverride: options.adminOverride || null,
      sourceLabel: pickFirstNonEmptyString(options.sourceLabel, options.controlContext?.controlLabel, effectiveEndpoint.label, "Endpoint"),
      anchorInstanceId: options.anchorInstanceId || null
    });
  }
  
  async function runEndpointById(endpointId, options = {}) {
    await refreshFlowEndpointOverridesFromStorage();
    const lang = getCurrentDisplayLanguage();
    const endpoint = getEffectiveFlowEndpointById(endpointId, { lang });
    if (!endpoint?.id) {
      log("Endpoint nicht gefunden: " + String(endpointId || "(leer)"));
      return buildRunFailureResult("precondition", "Endpoint nicht gefunden.");
    }
    return await runEndpoint(endpoint, options);
  }
  
  function getInvolvedCanvasTypeIdsFromInstanceIds(instanceIds) {
    const ids = [];
    const seen = new Set();
  
    for (const instanceId of instanceIds || []) {
      const canvasTypeId = state.instancesById.get(instanceId)?.canvasTypeId || null;
      if (!canvasTypeId || seen.has(canvasTypeId)) continue;
      seen.add(canvasTypeId);
      ids.push(canvasTypeId);
    }
  
    return ids;
  }
  
  async function persistMemoryAfterAgentRun(agentObj, runContext, actionResult) {
    const fallbackSummary = pickFirstNonEmptyString(agentObj?.analysis, "Agent-Run ohne Summary.");
    const normalizedMemoryEntry = Memory.normalizeMemoryEntry(agentObj?.memoryEntry, { fallbackSummary });
  
    if (!agentObj?.memoryEntry) {
      log("WARNUNG: Agent lieferte kein memoryEntry. Verwende Fallback aus analysis.");
    }
  
    const timestampIso = new Date().toISOString();
    const nextMemoryState = Memory.mergeMemoryEntryIntoState(state.memoryState, normalizedMemoryEntry, {
      timestamp: timestampIso
    });
    const storedLogEntry = Memory.buildStoredMemoryLogEntry(
      normalizedMemoryEntry,
      runContext,
      summarizeAppliedActions(actionResult),
      { timestamp: timestampIso }
    );
  
    await Board.saveMemoryState(nextMemoryState, log);
    const appendedLogEntry = await Board.appendMemoryLogEntry(storedLogEntry, log);
  
    state.memoryState = nextMemoryState;
    state.memoryLog = Memory.getRecentMemoryEntries(
      Memory.normalizeMemoryLog([
        ...(Array.isArray(state.memoryLog) ? state.memoryLog : []),
        appendedLogEntry || storedLogEntry
      ]),
      DT_MEMORY_RECENT_LOG_LIMIT
    );
  
    log(
      "Memory aktualisiert: " + state.memoryLog.length +
      " Einträge, stepStatus=" + (state.memoryState.stepStatus || "(leer)") + "."
    );
  }
  
  function buildFeedbackFallbackTitle(endpoint, sourceLabel = "Feedback") {
    return pickFirstNonEmptyString(endpoint?.label, sourceLabel);
  }
  
  function normalizeEndpointExecutionArtifacts(agentObj, endpoint, sourceLabel = "Endpoint") {
    const fallbackSummary = pickFirstNonEmptyString(agentObj?.analysis, null);
    const feedback = ExerciseEngine.normalizeFeedbackBlock(agentObj?.feedback, {
      fallbackTitle: buildFeedbackFallbackTitle(endpoint, sourceLabel),
      fallbackSummary
    });
    const flowControlDirectives = ExerciseEngine.normalizeFlowControlDirectivesBlock(agentObj?.flowControlDirectives);
    const evaluation = ExerciseEngine.normalizeEvaluationBlock(agentObj?.evaluation);
    return { feedback, flowControlDirectives, evaluation };
  }
  
  function resolveEndpointExecutionMode(agentObj, endpointContext) {
    return ExerciseEngine.resolveEffectiveExecutionMode({
      rawExecutionMode: agentObj?.executionMode,
      forcedExecutionMode: null,
      allowedExecutionModes: endpointContext?.allowedExecutionModes || ["none"]
    });
  }
  
  async function persistExerciseRuntimeAfterEndpointRun({
    endpoint = null,
    flowControlDirectives = null,
    activeAnchorContext = null
  } = {}) {
    const runtimePatch = {
      lastEndpointId: endpoint?.id || null,
      lastFlowDirectiveUnlockEndpointIds: Array.isArray(flowControlDirectives?.unlockEndpointIds)
        ? flowControlDirectives.unlockEndpointIds.slice()
        : [],
      lastFlowDirectiveCompleteEndpointIds: Array.isArray(flowControlDirectives?.completeEndpointIds)
        ? flowControlDirectives.completeEndpointIds.slice()
        : []
    };
  
    if (activeAnchorContext?.anchorInstanceId) {
      runtimePatch.lastActiveFlowAnchorInstanceId = activeAnchorContext.anchorInstanceId;
    }
  
    await persistExerciseRuntime(runtimePatch);
    renderExerciseControls();
    return null;
  }
  
  function normalizeComparableChatText(value) {
    return String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/[…]/g, "...")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }
  
  function normalizeChatQuestionText(rawContent) {
    const plain = stripHtml(rawContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim();
    if (!plain) return "";
  
    if (Board.isKnownChatPlaceholderContent(plain, "input") || Board.isKnownChatPlaceholderContent(plain, "submit") || Board.isKnownChatPlaceholderContent(plain, "output")) {
      return "";
    }
  
    return plain;
  }
  
  async function resolveBoardUserSeedText(instanceId, fallbackText = "") {
    const fallback = pickFirstNonEmptyString(fallbackText, "") || "";
    const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
    if (!instance || !Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface)) {
      return fallback;
    }
  
    try {
      const rawInputContent = await Board.readChatInputContent(instance.chatInterface, log);
      const normalized = normalizeChatQuestionText(rawInputContent);
      return normalized || fallback;
    } catch (_) {
      return fallback;
    }
  }
  
  function resolveResponseTargetInstanceId({ promptRuntimeOverride = null, targetInstanceIds = [], anchorInstanceId = null } = {}) {
    const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
    const explicitAnchor = pickFirstNonEmptyString(runtime?.controlContext?.anchorInstanceId, runtime?.anchorInstanceId, anchorInstanceId);
    if (explicitAnchor && state.instancesById.has(explicitAnchor)) return explicitAnchor;
  
    const normalizedTargets = normalizeTargetInstanceIds(targetInstanceIds);
    if (normalizedTargets.length === 1) return normalizedTargets[0];
    return null;
  }
  
  async function resolveSelectedChatSubmit(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length !== 1) return null;
  
    const item = list[0];
    const meta = await Board.readChatInterfaceMeta(item, log);
    if (!meta || meta.role !== "submit") return null;
  
    const instance = meta.instanceId ? state.instancesById.get(meta.instanceId) : null;
    if (!instance) return null;
    return { item, meta, instance };
  }
  
  async function executeSelectedChatSubmit(chatSelection, items) {
    const instanceId = chatSelection?.instance?.instanceId;
    if (!instanceId) {
      await refreshSelectionStatusFromItems(items);
      return;
    }
  
    const flow = resolveRelevantFlowForInstance(instanceId);
    if (!flow) {
      await notifyRuntime("Kein eindeutiger Flow für diese Canvas vorhanden.", { level: "warning" });
      await restoreSelectionAfterBoardButtonRun(instanceId);
      await refreshSelectionStatusFromBoard();
      return;
    }
  
    const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow);
    const endpoint = exercisePack && currentStep
      ? ExerciseLibrary.findFirstEndpointByChannel(exercisePack, currentStep.id, "chat_submit", {
          lang: getCurrentDisplayLanguage()
        })
      : null;
  
    if (!endpoint) {
      await notifyRuntime("Kein Chat-Submit-Endpoint für den aktuellen Schritt vorhanden.", { level: "warning" });
      await restoreSelectionAfterBoardButtonRun(instanceId);
      await refreshSelectionStatusFromBoard();
      return;
    }
  
    const rawInputContent = await Board.readChatInputContent(chatSelection.instance.chatInterface, log);
    const userText = normalizeChatQuestionText(rawInputContent);
    if (!userText) {
      log("Bitte eine Frage eingeben.");
      await notifyRuntime("Bitte eine Frage eingeben.", { level: "warning" });
      await restoreSelectionAfterBoardButtonRun(instanceId);
      await refreshSelectionStatusFromBoard();
      return;
    }
  
    recordConversationTurn(instanceId, {
      text: userText,
      channel: "chat_submit",
      stepId: currentStep?.id || null
    });
  
    await runEndpoint(endpoint, {
      sourceLabel: endpoint.label || "Senden",
      userText,
      selectedInstanceIds: [instanceId],
      anchorInstanceId: instanceId
    });
  
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
  }
  
  async function resolveSelectedChatPropose(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length !== 1) return null;
  
    const item = list[0];
    const meta = await Board.readChatInterfaceMeta(item, log);
    if (!meta || meta.role !== "propose") return null;
  
    const instance = meta.instanceId ? state.instancesById.get(meta.instanceId) : null;
    if (!instance) return null;
    return { item, meta, instance };
  }
  
  async function executeSelectedChatPropose(chatSelection, items) {
    const instanceId = chatSelection?.instance?.instanceId;
    if (!instanceId) {
      await refreshSelectionStatusFromItems(items);
      return;
    }
  
    const flow = resolveRelevantFlowForInstance(instanceId);
    if (!flow) {
      await notifyRuntime("Kein eindeutiger Flow für diese Canvas vorhanden.", { level: "warning" });
      await restoreSelectionAfterBoardButtonRun(instanceId);
      await refreshSelectionStatusFromBoard();
      return;
    }
  
    const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow);
    const endpoint = exercisePack && currentStep
      ? findProposalEndpointForStep(exercisePack, currentStep.id, { lang: getCurrentDisplayLanguage() })
      : null;
  
    if (!endpoint) {
      await notifyRuntime("Kein Vorschlags-Endpoint für den aktuellen Schritt vorhanden.", { level: "warning" });
      await restoreSelectionAfterBoardButtonRun(instanceId);
      await refreshSelectionStatusFromBoard();
      return;
    }
  
    const rawInputContent = await Board.readChatInputContent(chatSelection.instance.chatInterface, log);
    const userText = normalizeChatQuestionText(rawInputContent) || null;
    if (userText) {
      recordConversationTurn(instanceId, {
        text: userText,
        channel: "chat_propose",
        stepId: currentStep?.id || null
      });
    }
  
    await runEndpoint(endpoint, {
      sourceLabel: endpoint.label || "Vorschlag ausarbeiten",
      userText,
      selectedInstanceIds: [instanceId],
      anchorInstanceId: instanceId
    });
  
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
  }
  
  async function resolveSelectedChatApply(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length !== 1) return null;
  
    const item = list[0];
    const meta = await Board.readChatInterfaceMeta(item, log);
    if (!meta || meta.role !== "apply") return null;
  
    const instance = meta.instanceId ? state.instancesById.get(meta.instanceId) : null;
    if (!instance) return null;
    return { item, meta, instance };
  }
  
  async function executeSelectedChatApply(chatSelection, items) {
    const instanceId = chatSelection?.instance?.instanceId;
    if (!instanceId) {
      await refreshSelectionStatusFromItems(items);
      return;
    }
  
    const flow = resolveRelevantFlowForInstance(instanceId);
    if (!flow) {
      await notifyRuntime("Kein eindeutiger Flow für diese Canvas vorhanden.", { level: "warning" });
      await restoreSelectionAfterBoardButtonRun(instanceId);
      await refreshSelectionStatusFromBoard();
      return;
    }
  
    const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow);
    const endpoint = exercisePack && currentStep
      ? ExerciseLibrary.findFirstEndpointByChannel(exercisePack, currentStep.id, "chat_apply", {
          lang: getCurrentDisplayLanguage()
        })
      : null;
  
    if (!endpoint) {
      await notifyRuntime("Kein Chat-Apply-Endpoint für den aktuellen Schritt vorhanden.", { level: "warning" });
      await restoreSelectionAfterBoardButtonRun(instanceId);
      await refreshSelectionStatusFromBoard();
      return;
    }
  
    await applyStoredProposalMechanically({
      exercisePack,
      currentStep,
      endpoint,
      targetInstanceIds: [instanceId],
      sourceLabel: endpoint.label || "Vorschläge anwenden",
      anchorInstanceId: instanceId
    });
  
    await restoreSelectionAfterBoardButtonRun(instanceId);
    await refreshSelectionStatusFromBoard();
  }
  

  return {
    getPromptConfigForSelectedInstances,
    isBusinessModelCasePack,
    isBusinessModelVotingStep,
    listStickyAliasIdsFromActiveCanvasStates,
    normalizeVotingSessions,
    normalizeVotingEntries,
    buildVotingContextForPrompt,
    createEmptyEndpointActionResult,
    buildEndpointExecutionContext,
    buildActiveCanvasStatesFromStateById,
    buildStructuredEndpointPromptArtifacts,
    syncEndpointChatButtons,
    applyEndpointRunArtifactsAndSyncUi,
    handleStructuredEndpointNoneMode,
    handleStructuredEndpointProposalMode,
    handleStructuredEndpointDirectApplyMode,
    runStructuredEndpointExecution,
    runEndpoint,
    runEndpointById,
    getInvolvedCanvasTypeIdsFromInstanceIds,
    persistMemoryAfterAgentRun,
    buildFeedbackFallbackTitle,
    normalizeEndpointExecutionArtifacts,
    resolveEndpointExecutionMode,
    persistExerciseRuntimeAfterEndpointRun,
    normalizeComparableChatText,
    normalizeChatQuestionText,
    resolveBoardUserSeedText,
    resolveResponseTargetInstanceId,
    resolveSelectedChatSubmit,
    executeSelectedChatSubmit,
    resolveSelectedChatPropose,
    executeSelectedChatPropose,
    resolveSelectedChatApply,
    executeSelectedChatApply,
  };
}
