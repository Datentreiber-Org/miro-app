import {
  ensureMiroReady as ensureMiroReadyInternal,
  getBoard as getBoardInternal
} from "./sdk.js?v=20260316-patch18-business-model-case-pack";

export { ensureMiroReady, getBoard, registerSelectionUpdateHandler } from "./sdk.js?v=20260316-patch18-business-model-case-pack";

export {
  normalizeBoardConfig,
  normalizeExerciseRuntime,
  isBoardAnchorItem,
  ensureBoardAnchor,
  loadBoardConfigFromAnchor,
  saveBoardConfigToAnchor,
  loadPersistedBaselineMeta,
  savePersistedBaselineMeta,
  loadBaselineSignatureForImageId,
  saveBaselineSignatureForImageId,
  removeBaselineSignatureForImageId,
  loadMemoryState,
  saveMemoryState,
  clearMemoryState,
  clearMemoryLog,
  loadExerciseRuntime,
  saveExerciseRuntime,
  loadMemoryLog,
  appendMemoryLogEntry,
  normalizeProposalRecord,
  loadActiveProposal,
  saveActiveProposal,
  clearActiveProposal,
  loadBoardFlow,
  saveBoardFlow,
  listBoardFlows,
  normalizeBoardRunState,
  loadBoardRunState,
  saveBoardRunState
} from "./storage.js?v=20260316-patch18-business-model-case-pack";

export async function getVotingResults(log) {
  await ensureMiroReadyInternal(log);
  const board = getBoardInternal();
  if (typeof board?.experimental?.getVotingResults !== "function") return null;

  try {
    return await board.experimental.getVotingResults();
  } catch (error) {
    if (typeof log === "function") {
      log("Hinweis: Voting-Ergebnisse konnten nicht geladen werden: " + (error?.message || String(error)));
    }
    return null;
  }
}


export {
  buildAgentFeedbackContent,
  buildQuestionAnswerContent
} from "./feedback.js?v=20260316-patch18-business-model-case-pack";

export {
  normalizeChatInterfaceShapeIds,
  hasAnyChatInterfaceShapeIds,
  hasCompleteChatInterfaceShapeIds,
  hasProposeChatInterfaceShapeId,
  hasApplyChatInterfaceShapeId,
  computeChatInterfaceLayout,
  createChatInterfaceForInstance,
  ensureChatProposeShapeForInstance,
  ensureChatApplyShapeForInstance,
  readChatInterfaceMeta,
  writeChatInterfaceMeta,
  removeChatInterfaceShapes,
  getChatInterfaceItemByRole,
  readChatInputContent,
  writeChatOutputContent,
  buildChatProposeContent,
  buildChatApplyContent,
  getChatPlaceholderText,
  getChatPlaceholderVariants,
  isKnownChatPlaceholderContent,
  syncChatPlaceholdersForLanguage,
  syncChatProposeButtonState,
  syncChatApplyButtonState,
  syncChatInterfaceLayoutForInstance
} from "./chat-interface.js?v=20260316-patch18-business-model-case-pack";

export {
  getSelection,
  selectItems,
  deselectItems,
  getItems,
  getItemsById,
  getItemById,
  createImage,
  createShape,
  getViewport,
  zoomTo,
  createStickyNoteAtBoardCoords,
  createConnectorBetweenItems,
  removeItemById,
  moveItemByIdToBoardCoords,
  resolveBoardCoords,
  resolveBoardRect,
  boardToLocalCoords,
  getTags,
  findBoardTagByTitle,
  ensureBoardTag,
  setStickyNoteTagPresence,
  setStickyNoteFillColor,
  getBoardBaseContext
} from "./items.js?v=20260316-patch18-business-model-case-pack";

export {
  readFlowControlMeta,
  writeFlowControlMeta,
  removeFlowControlMeta,
  computeSuggestedFlowControlPosition,
  createFlowControlShape,
  syncFlowControlShapeAppearance
} from "./flow-controls.js?v=20260316-patch18-business-model-case-pack";

export {
  computeTemplateGeometry,
  buildInstanceGeometryIndex,
  findInstanceByPoint,
  findInstanceByRect,
  registerInstanceFromImage,
  scanTemplateInstances
} from "./instances.js?v=20260316-patch18-business-model-case-pack";
