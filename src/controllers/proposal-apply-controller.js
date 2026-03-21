export function createProposalApplyController(deps) {
  const {
    Board,
    Catalog,
    ExerciseEngine,
    ExerciseLibrary,
    Exercises,
    acquireBoardSoftLock,
    applyEndpointRunArtifactsAndSyncUi,
    applyResolvedAgentActions,
    buildEndpointExecutionContext,
    buildRunFailureResult,
    buildRunSuccessResult,
    computeInstanceStatesById,
    createEmptyEndpointActionResult,
    createRunStatusItems,
    ensureInstancesScanned,
    finalizeBoardSoftLock,
    formatExistingBoardRunMessage,
    formatRuntimeErrorMessage,
    getCurrentDisplayLanguage,
    getCurrentUserQuestion,
    getEffectiveFlowEndpointById,
    listAuthorableEndpointsForStep,
    loadMemoryRuntimeState,
    log,
    logRuntimeNotice,
    normalizeAgentAction,
    normalizeTargetInstanceIds,
    normalizeUiLanguage,
    notifyRuntime,
    persistMemoryAfterAgentRun,
    pickFirstNonEmptyString,
    refreshBoardState,
    refreshFlowEndpointOverridesFromStorage,
    releaseAgentRunLock,
    resolveCurrentPackAndStepFromFlow,
    resolveRelevantFlowForInstance,
    sanitizeProposalActionsForEndpoint,
    state,
    stripHtml,
    syncBoardSoftLock,
    t,
    tryAcquireAgentRunLock,
  } = deps;

  const MAX_CONVERSATION_TURNS = 4;
  function buildProposalId() {
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
  
  function buildAreaTitleFromAreaKey(areaKey, canvasTypeId = null) {
    const normalizedAreaKey = pickFirstNonEmptyString(areaKey);
    if (!normalizedAreaKey) return null;
    const region = Catalog.areaNameToRegion(normalizedAreaKey, canvasTypeId) || Catalog.areaNameToRegion(normalizedAreaKey, null);
    return region?.title || normalizedAreaKey;
  }
  
  function truncateProposalText(value, maxLength = 72) {
    const text = pickFirstNonEmptyString(value);
    if (!text) return null;
    return text.length > maxLength ? (text.slice(0, maxLength - 1).trimEnd() + "…") : text;
  }
  
  function summarizeProposalActionsForPrompt(actions, canvasTypeId = null) {
    const bullets = [];
    for (const rawAction of Array.isArray(actions) ? actions : []) {
      const action = normalizeAgentAction(rawAction);
      if (!action || action.type === "inform") continue;
  
      if (action.type === "create_sticky") {
        const areaTitle = buildAreaTitleFromAreaKey(action.area, canvasTypeId) || "dem Canvas";
        const textPreview = truncateProposalText(action.text, 56);
        bullets.push(textPreview
          ? (`würde eine Sticky in ${areaTitle} anlegen: „${textPreview}“`)
          : (`würde eine Sticky in ${areaTitle} anlegen`));
        continue;
      }
  
      if (action.type === "move_sticky") {
        const areaTitle = buildAreaTitleFromAreaKey(action.targetArea || action.area, canvasTypeId) || "einen anderen Bereich";
        bullets.push(`würde eine Sticky nach ${areaTitle} verschieben`);
        continue;
      }
  
      if (action.type === "delete_sticky") {
        bullets.push("würde eine Sticky entfernen");
        continue;
      }
  
      if (action.type === "create_connector") {
        bullets.push("würde eine explizite Beziehung als Connector ergänzen");
        continue;
      }
  
      if (action.type === "set_sticky_color") {
        bullets.push(`würde eine Sticky farblich auf ${action.color || "eine Miro-Farbe"} setzen`);
        continue;
      }
  
      if (action.type === "set_check_status") {
        bullets.push(action.checked === false
          ? "würde einen Check-Status entfernen"
          : "würde einen Check-Status setzen");
        continue;
      }
    }
    return Array.from(new Set(bullets)).slice(0, 8);
  }
  
  function buildProposalActionPreview(actions, canvasTypeId = null) {
    return summarizeProposalActionsForPrompt(actions, canvasTypeId).slice(0, 5);
  }
  
  function buildPendingProposalContextForPrompt(instanceId, { stepId = null } = {}) {
    const normalizedInstanceId = pickFirstNonEmptyString(instanceId);
    if (!normalizedInstanceId || !state.instancesById.has(normalizedInstanceId)) return null;
    const instance = state.instancesById.get(normalizedInstanceId) || null;
    return Board.loadActiveProposal({
      anchorInstanceId: normalizedInstanceId,
      stepId: pickFirstNonEmptyString(stepId)
    }, log).then((proposal) => {
      if (!proposal || typeof proposal !== "object") return null;
      const flow = resolveRelevantFlowForInstance(normalizedInstanceId);
      const { exercisePack } = resolveCurrentPackAndStepFromFlow(flow, { lang: getCurrentDisplayLanguage() });
      const proposalStep = exercisePack && proposal.stepId
        ? Exercises.getExerciseStep(exercisePack, proposal.stepId, { lang: getCurrentDisplayLanguage() })
        : null;
      return {
        proposalId: pickFirstNonEmptyString(proposal.proposalId) || null,
        createdAt: pickFirstNonEmptyString(proposal.createdAt) || null,
        stepLabel: pickFirstNonEmptyString(proposal.stepLabel, proposalStep?.label) || null,
        summary: pickFirstNonEmptyString(proposal.feedback?.summary, proposal.memoryEntry?.summary, proposal.analysis) || null,
        actionPreview: buildProposalActionPreview(proposal.actions, proposal.canvasTypeId || instance?.canvasTypeId || null)
      };
    });
  }
  

  function summarizeFeedbackForConversation(feedback = null) {
    if (!feedback || typeof feedback !== "object") return null;
    const title = pickFirstNonEmptyString(feedback.title) || null;
    const summary = pickFirstNonEmptyString(feedback.summary) || null;
    const bullets = [];
    for (const section of Array.isArray(feedback.sections) ? feedback.sections : []) {
      for (const bullet of Array.isArray(section?.bullets) ? section.bullets : []) {
        const normalized = pickFirstNonEmptyString(stripHtml(String(bullet || "")));
        if (!normalized || bullets.includes(normalized)) continue;
        bullets.push(normalized);
        if (bullets.length >= 5) break;
      }
      if (bullets.length >= 5) break;
    }
    if (!title && !summary && !bullets.length) return null;
    return { title, summary, bullets };
  }
  
  function getConversationRecord(instanceId) {
    const normalizedInstanceId = pickFirstNonEmptyString(instanceId);
    if (!normalizedInstanceId) return null;
    const existing = state.conversationStateByInstanceId.get(normalizedInstanceId);
    if (existing && typeof existing === "object") return existing;
    const created = {
      lastStepLabel: null,
      lastEndpointLabel: null,
      lastChannel: null,
      lastExecutionMode: null,
      lastFeedback: null,
      recentTurns: []
    };
    state.conversationStateByInstanceId.set(normalizedInstanceId, created);
    return created;
  }
  
  function recordConversationTurn(instanceId, turn = null) {
    const record = getConversationRecord(instanceId);
    if (!record || !turn || typeof turn !== "object") return;
    const role = pickFirstNonEmptyString(turn.role);
    const textSummary = pickFirstNonEmptyString(turn.textSummary, turn.text);
    if (!role || !textSummary) return;
    const nextTurn = {
      role,
      channel: pickFirstNonEmptyString(turn.channel) || null,
      textSummary,
      ts: new Date().toISOString(),
      stepLabel: pickFirstNonEmptyString(turn.stepLabel) || null,
      endpointLabel: pickFirstNonEmptyString(turn.endpointLabel) || null,
      executionMode: pickFirstNonEmptyString(turn.executionMode) || null
    };
    record.recentTurns = [...(Array.isArray(record.recentTurns) ? record.recentTurns : []), nextTurn].slice(-MAX_CONVERSATION_TURNS);
  }
  
  function buildConversationContextForPrompt(instanceId) {
    const record = getConversationRecord(instanceId);
    if (!record) return null;
    const recentTurns = Array.isArray(record.recentTurns) ? cloneJsonValue(record.recentTurns) : [];
    const hasContent = record.lastEndpointLabel || record.lastFeedback || recentTurns.length;
    if (!hasContent) return null;
    return {
      lastEndpoint: record.lastEndpointLabel ? {
        stepLabel: record.lastStepLabel || null,
        endpointLabel: record.lastEndpointLabel || null,
        channel: record.lastChannel || null,
        executionMode: record.lastExecutionMode || null
      } : null,
      lastFeedback: cloneJsonValue(record.lastFeedback || null),
      recentTurns
    };
  }
  
  function updateConversationStateAfterAssistantResponse(instanceId, { feedback = null, stepLabel = null, endpointLabel = null, channel = null, executionMode = null } = {}) {
    const record = getConversationRecord(instanceId);
    if (!record) return;
    record.lastStepLabel = pickFirstNonEmptyString(stepLabel) || record.lastStepLabel || null;
    record.lastEndpointLabel = pickFirstNonEmptyString(endpointLabel) || record.lastEndpointLabel || null;
    record.lastChannel = pickFirstNonEmptyString(channel) || record.lastChannel || null;
    record.lastExecutionMode = pickFirstNonEmptyString(executionMode) || record.lastExecutionMode || null;
    record.lastFeedback = summarizeFeedbackForConversation(feedback);
    const assistantSummary = pickFirstNonEmptyString(record.lastFeedback?.summary, record.lastFeedback?.title, Array.isArray(record.lastFeedback?.bullets) ? record.lastFeedback.bullets.join(" • ") : null);
    if (assistantSummary) {
      recordConversationTurn(instanceId, {
        role: "assistant",
        channel: record.lastChannel,
        textSummary: assistantSummary,
        stepLabel: record.lastStepLabel,
        endpointLabel: record.lastEndpointLabel,
        executionMode: record.lastExecutionMode
      });
    }
  }
  
  async function loadPendingProposalForInstance(instanceId, { stepId = null } = {}) {
    if (!instanceId || !state.instancesById.has(instanceId)) return null;
    return await Board.loadActiveProposal({
      anchorInstanceId: instanceId,
      stepId: pickFirstNonEmptyString(stepId)
    }, log);
  }
  
  async function syncAllChatInterfacesLayout() {
    for (const instance of state.instancesById.values()) {
      if (!Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface)) continue;
      try {
        await Board.syncChatInterfaceLayoutForInstance(instance, instance.chatInterface, log, {
          lang: getCurrentDisplayLanguage()
        });
      } catch (error) {
        log("WARNUNG: Chat-Layout konnte nicht synchronisiert werden: " + formatRuntimeErrorMessage(error));
      }
    }
  }
  
  async function hasPendingProposalForInstanceStep(instanceId, stepId) {
    const proposal = await loadPendingProposalForInstance(instanceId, { stepId });
    return !!proposal?.proposalId;
  }
  
  async function syncChatApplyButtonForInstance(instanceId, { stepId = null } = {}) {
    const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
    if (!instance || !Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface) || !Board.hasApplyChatInterfaceShapeId(instance.chatInterface)) {
      return false;
    }
  
    const flow = resolveRelevantFlowForInstance(instanceId);
    const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow, { lang: getCurrentDisplayLanguage() });
    const normalizedStepId = pickFirstNonEmptyString(stepId, currentStep?.id, flow?.runtime?.currentStepId);
    const chatApplyEndpoint = exercisePack && currentStep?.id
      ? ExerciseLibrary.findFirstEndpointByChannel(exercisePack, currentStep.id, "chat_apply", { lang: getCurrentDisplayLanguage() })
      : null;
    const enabled = !!(chatApplyEndpoint && normalizedStepId && await hasPendingProposalForInstanceStep(instanceId, normalizedStepId));
    try {
      await Board.syncChatApplyButtonState(instance.chatInterface, {
        enabled,
        lang: getCurrentDisplayLanguage()
      }, log);
    } catch (error) {
      log("WARNUNG: Apply-Button konnte nicht synchronisiert werden: " + formatRuntimeErrorMessage(error));
    }
    return enabled;
  }
  
  async function syncChatProposeButtonForInstance(instanceId, { stepId = null } = {}) {
    const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
    if (!instance || !Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface) || !Board.hasProposeChatInterfaceShapeId(instance.chatInterface)) {
      return false;
    }
  
    const flow = resolveRelevantFlowForInstance(instanceId);
    const { exercisePack, currentStep } = resolveCurrentPackAndStepFromFlow(flow, { lang: getCurrentDisplayLanguage() });
    const normalizedStepId = pickFirstNonEmptyString(stepId, currentStep?.id, flow?.runtime?.currentStepId);
    const proposalEndpoint = exercisePack && normalizedStepId
      ? findProposalEndpointForStep(exercisePack, normalizedStepId, { lang: getCurrentDisplayLanguage() })
      : null;
    const enabled = !!proposalEndpoint;
    try {
      await Board.syncChatProposeButtonState(instance.chatInterface, {
        enabled,
        lang: getCurrentDisplayLanguage()
      }, log);
    } catch (error) {
      log("WARNUNG: Propose-Button konnte nicht synchronisiert werden: " + formatRuntimeErrorMessage(error));
    }
    return enabled;
  }
  
  async function syncChatProposeButtonsForInstanceIds(instanceIds, { stepId = null } = {}) {
    for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
      await syncChatProposeButtonForInstance(instanceId, { stepId });
    }
  }
  
  async function syncAllChatProposeButtonsForCurrentFlows() {
    for (const instanceId of Array.from(state.instancesById.keys())) {
      await syncChatProposeButtonForInstance(instanceId);
    }
  }
  
  async function syncChatApplyButtonsForInstanceIds(instanceIds, { stepId = null } = {}) {
    for (const instanceId of normalizeTargetInstanceIds(instanceIds)) {
      await syncChatApplyButtonForInstance(instanceId, { stepId });
    }
  }
  
  async function syncAllChatApplyButtonsForCurrentFlows() {
    for (const instanceId of Array.from(state.instancesById.keys())) {
      await syncChatApplyButtonForInstance(instanceId);
    }
  }
  
  async function clearPendingProposalForInstanceStep(instanceId, stepId) {
    if (!instanceId || !stepId) return false;
    return await Board.clearActiveProposal({
      anchorInstanceId: instanceId,
      stepId
    }, log);
  }
  
  function findProposalEndpointForStep(exercisePack, stepId, { lang = getCurrentDisplayLanguage() } = {}) {
    if (!exercisePack || !stepId) return null;
    return listAuthorableEndpointsForStep(exercisePack, stepId, { lang })
      .map((endpoint) => getEffectiveFlowEndpointById(endpoint.id, { lang }))
      .find((endpoint) => {
        const modes = Array.isArray(endpoint?.run?.allowedExecutionModes) ? endpoint.run.allowedExecutionModes : [];
        return endpoint?.surface?.channel === "board_button" && modes.includes("proposal_only");
      }) || null;
  }
  
  function cloneJsonValue(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }
  
  function hasExecutableProposalActions(actions) {
    return Array.isArray(actions) && actions.some((rawAction) => {
      const normalized = normalizeAgentAction(rawAction);
      return normalized && normalized.type !== "inform";
    });
  }
  
  function buildStoredProposalRecord({
    instanceId,
    stepId,
    stepLabel = null,
    exercisePackId = null,
    endpointId = null,
    promptRuntimeOverride = null,
    userRequest = null,
    basedOnStateHash = null,
    agentObj = null,
    feedback = null,
    flowDirectives = null,
    evaluation = null
  } = {}) {
    const instance = state.instancesById.get(instanceId) || null;
    const runtime = (promptRuntimeOverride && typeof promptRuntimeOverride === "object") ? promptRuntimeOverride : null;
    const controlContext = runtime?.controlContext || null;
    const proposalId = buildProposalId();
    return {
      version: 1,
      id: proposalId,
      proposalId,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      anchorInstanceId: instance?.instanceId || instanceId || null,
      anchorInstanceLabel: instance?.instanceLabel || null,
      canvasTypeId: instance?.canvasTypeId || null,
      exercisePackId: pickFirstNonEmptyString(exercisePackId, runtime?.exercisePack?.id),
      stepId: pickFirstNonEmptyString(stepId),
      stepLabel: pickFirstNonEmptyString(stepLabel, runtime?.currentStep?.label),
      endpointId: pickFirstNonEmptyString(endpointId, controlContext?.endpointId, runtime?.endpoint?.id),
      controlId: controlContext?.controlId || null,
      userRequest: pickFirstNonEmptyString(userRequest),
      basedOnStateHash: pickFirstNonEmptyString(basedOnStateHash),
      analysis: pickFirstNonEmptyString(agentObj?.analysis),
      feedback: cloneJsonValue(feedback),
      actions: cloneJsonValue(agentObj?.actions || []),
      memoryEntry: cloneJsonValue(agentObj?.memoryEntry),
      flowDirectives: cloneJsonValue(flowDirectives),
      evaluation: cloneJsonValue(evaluation)
    };
  }
  
  function buildStaleProposalFeedback(sourceLabel = "Vorschläge anwenden", lang = null) {
    const uiLang = normalizeUiLanguage(lang || getCurrentDisplayLanguage());
    if (uiLang === "en") {
      return {
        title: "Proposal is outdated",
        summary: "The canvas changed after the proposal was created. The stored proposal was therefore not applied.",
        sections: [
          {
            heading: "Next step",
            bullets: [`Generate a fresh proposal before using ${sourceLabel} again.`]
          }
        ]
      };
    }
    return {
      title: "Vorschlag ist veraltet",
      summary: "Der Canvas wurde nach dem Erzeugen des Vorschlags verändert. Der gespeicherte Vorschlag wurde deshalb nicht angewendet.",
      sections: [
        {
          heading: "Nächster Schritt",
          bullets: [`Erzeuge bitte zuerst einen neuen Vorschlag, bevor du „${sourceLabel}“ erneut nutzt.`]
        }
      ]
    };
  }
  
  async function renderAgentResponseToInstanceOutput({
    instanceId,
    feedback,
    flowControlDirectives = null,
    evaluation = null,
    sourceLabel = "Agent",
    conversationMeta = null
  } = {}) {
    const instance = instanceId ? (state.instancesById.get(instanceId) || null) : null;
    if (!instance) {
      return { instanceId: null, instanceLabel: null, outputShapeId: null };
    }
  
    if (!Board.hasCompleteChatInterfaceShapeIds(instance.chatInterface)) {
      log(`WARNUNG: ${sourceLabel}: Keine vollständige Chat-Ausgabe für '${instance.instanceLabel || instanceId}'.`);
      return {
        instanceId,
        instanceLabel: instance.instanceLabel || instanceId,
        outputShapeId: null
      };
    }
  
    const html = Board.buildAgentFeedbackContent({
      feedback,
      flowControlDirectives,
      evaluation,
      lang: getCurrentDisplayLanguage()
    });
    await Board.writeChatOutputContent(instance.chatInterface, html, log);
    if (conversationMeta) {
      updateConversationStateAfterAssistantResponse(instanceId, {
        ...conversationMeta,
        feedback
      });
    }
    return {
      instanceId,
      instanceLabel: instance.instanceLabel || instanceId,
      outputShapeId: instance.chatInterface.outputShapeId || null
    };
  }
  
  function getStoredProposalExecutableActions(proposal, { logFn = null, lang = getCurrentDisplayLanguage() } = {}) {
    const proposalActions = Array.isArray(proposal?.actions) ? proposal.actions : [];
    const proposalEndpoint = proposal?.endpointId
      ? getEffectiveFlowEndpointById(proposal.endpointId, { lang })
      : null;
  
    return sanitizeProposalActionsForEndpoint(proposalActions, {
      allowedActions: proposalEndpoint?.run?.allowedActions || [],
      allowedActionAreas: proposalEndpoint?.run?.allowedActionAreas || [],
      logFn
    }).filter((action) => action && action.type !== "inform");
  }
  
  async function applyStoredProposalMechanically({
    exercisePack,
    currentStep,
    endpoint,
    targetInstanceIds,
    userText = null,
    sourceLabel = "Vorschläge anwenden",
    anchorInstanceId = null
  } = {}) {
    await Board.ensureMiroReady(log);
    await ensureInstancesScanned();
    await loadMemoryRuntimeState();
    await refreshFlowEndpointOverridesFromStorage();
  
    const {
      normalizedTargetIds,
      targetInstanceLabels,
      promptRuntimeOverride,
      resolvedSourceLabel,
      activeStepId,
      activeAnchorContext
    } = buildEndpointExecutionContext({
      exercisePack,
      currentStep,
      endpoint,
      targetInstanceIds,
      sourceLabel
    });
  
    if (normalizedTargetIds.length !== 1) {
      const msg = resolvedSourceLabel + ": direct_apply benötigt genau eine Ziel-Instanz.";
      logRuntimeNotice("precondition", msg);
      await notifyRuntime(msg, { level: "warning" });
      return buildRunFailureResult("precondition", msg);
    }
  
    const instanceId = normalizedTargetIds[0];
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
      boardRunToken.statusItemIds = await createRunStatusItems(normalizedTargetIds, resolvedSourceLabel, boardRunToken.runId);
      await syncBoardSoftLock(boardRunToken, {
        targetInstanceIds: normalizedTargetIds,
        statusItemIds: boardRunToken.statusItemIds
      });
  
      const proposal = await loadPendingProposalForInstance(instanceId, { stepId: activeStepId });
      if (!proposal) {
        const msg = resolvedSourceLabel + ": Kein offener Vorschlag zum Anwenden vorhanden.";
        logRuntimeNotice("precondition", msg);
        await syncChatApplyButtonsForInstanceIds(normalizedTargetIds, { stepId: activeStepId });
        await notifyRuntime(t("chat.apply.noPending", getCurrentDisplayLanguage()), { level: "warning" });
        finalBoardRunStatus = "aborted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("precondition", msg);
      }
  
      const { liveCatalog } = await refreshBoardState();
      const stateById = await computeInstanceStatesById(liveCatalog);
      const currentHash = stateById[instanceId]?.signature?.stateHash || null;
      if (proposal.basedOnStateHash && proposal.basedOnStateHash !== currentHash) {
        await Board.clearActiveProposal({
          anchorInstanceId: instanceId,
          stepId: activeStepId
        }, log);
        await syncChatApplyButtonsForInstanceIds(normalizedTargetIds, { stepId: activeStepId });
        const msg = resolvedSourceLabel + ": Gespeicherter Vorschlag ist veraltet und wurde nicht angewendet.";
        logRuntimeNotice("stale_state_conflict", msg);
        await notifyRuntime(buildStaleProposalFeedback(resolvedSourceLabel, getCurrentDisplayLanguage()).summary, { level: "warning" });
        finalBoardRunStatus = "conflicted";
        finalBoardRunMessage = msg;
        return buildRunFailureResult("stale_state_conflict", msg);
      }
  
      const sanitizedProposalActions = getStoredProposalExecutableActions(proposal, { logFn: log });
      const actionResult = sanitizedProposalActions.length
        ? await applyResolvedAgentActions(sanitizedProposalActions, {
            candidateInstanceIds: normalizedTargetIds,
            anchorInstanceId: instanceId,
            sourceLabel: resolvedSourceLabel
          })
        : createEmptyEndpointActionResult();
  
      await refreshBoardState();
  
      if (proposal.memoryEntry) {
        await persistMemoryAfterAgentRun({
          analysis: proposal.analysis,
          memoryEntry: proposal.memoryEntry
        }, {
          runMode: "endpoint",
          endpointId: endpoint?.id || proposal.endpointId || null,
          targetInstanceLabels,
          userRequest: pickFirstNonEmptyString(userText, proposal.userRequest, getCurrentUserQuestion())
        }, actionResult);
      }
  
      await Board.clearActiveProposal({
        anchorInstanceId: instanceId,
        stepId: activeStepId
      }, log);
  
      const fallbackAnchorContext = activeAnchorContext || (anchorInstanceId
        ? { exercisePackId: exercisePack?.id || null, anchorInstanceId }
        : null);
      const storedFlowDirectives = ExerciseEngine.normalizeFlowControlDirectivesBlock(proposal.flowDirectives);
  
      await applyEndpointRunArtifactsAndSyncUi({
        endpoint,
        flowControlDirectives: storedFlowDirectives,
        promptRuntimeOverride,
        targetInstanceIds: normalizedTargetIds,
        sourceLabel: resolvedSourceLabel,
        activeAnchorContext: fallbackAnchorContext,
        activeStepId
      });
      await notifyRuntime("Vorschlag angewendet.", { level: "info" });
  
      finalBoardRunStatus = "completed";
      finalBoardRunMessage = resolvedSourceLabel + ": angewendet.";
      return buildRunSuccessResult({
        sourceLabel: resolvedSourceLabel,
        targetInstanceLabels,
        actionResult,
        proposalApplied: true,
        executionMode: "direct_apply"
      });
    } catch (e) {
      const msg = "Exception beim " + resolvedSourceLabel + "-Apply: " + formatRuntimeErrorMessage(e);
      logRuntimeNotice("fatal", msg, e?.stack || null);
      await notifyRuntime(msg, { level: "error" });
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
  

  return {
    buildProposalId,
    buildAreaTitleFromAreaKey,
    truncateProposalText,
    summarizeProposalActionsForPrompt,
    buildProposalActionPreview,
    buildPendingProposalContextForPrompt,
    summarizeFeedbackForConversation,
    getConversationRecord,
    recordConversationTurn,
    buildConversationContextForPrompt,
    updateConversationStateAfterAssistantResponse,
    loadPendingProposalForInstance,
    syncAllChatInterfacesLayout,
    hasPendingProposalForInstanceStep,
    syncChatApplyButtonForInstance,
    syncChatProposeButtonForInstance,
    syncChatProposeButtonsForInstanceIds,
    syncAllChatProposeButtonsForCurrentFlows,
    syncChatApplyButtonsForInstanceIds,
    syncAllChatApplyButtonsForCurrentFlows,
    clearPendingProposalForInstanceStep,
    findProposalEndpointForStep,
    cloneJsonValue,
    hasExecutableProposalActions,
    buildStoredProposalRecord,
    buildStaleProposalFeedback,
    renderAgentResponseToInstanceOutput,
    getStoredProposalExecutableActions,
    applyStoredProposalMechanically,
  };
}
