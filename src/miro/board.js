export { ensureMiroReady, getBoard, registerSelectionUpdateHandler } from "./sdk.js?v=20260308-batch76";

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
} from "./storage.js?v=20260313-patch11e";

export {
  buildAgentFeedbackContent,
  buildQuestionAnswerContent
} from "./feedback.js?v=20260310-batch92";

export {
  normalizeChatInterfaceShapeIds,
  hasCompleteChatInterfaceShapeIds,
  hasApplyChatInterfaceShapeId,
  computeChatInterfaceLayout,
  createChatInterfaceForInstance,
  ensureChatApplyShapeForInstance,
  readChatInterfaceMeta,
  writeChatInterfaceMeta,
  removeChatInterfaceShapes,
  getChatInterfaceItemByRole,
  readChatInputContent,
  writeChatOutputContent,
  buildChatApplyContent,
  getChatPlaceholderText,
  getChatPlaceholderVariants,
  isKnownChatPlaceholderContent,
  syncChatPlaceholdersForLanguage,
  syncChatApplyButtonState,
  syncChatInterfaceLayoutForInstance
} from "./chat-interface.js?v=20260310-batch92";

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
} from "./items.js?v=20260312-patch11";

export {
  readFlowControlMeta,
  writeFlowControlMeta,
  removeFlowControlMeta,
  computeSuggestedFlowControlPosition,
  createFlowControlShape,
  syncFlowControlShapeAppearance
} from "./flow-controls.js?v=20260310-batch92";

export {
  computeTemplateGeometry,
  buildInstanceGeometryIndex,
  findInstanceByPoint,
  findInstanceByRect,
  registerInstanceFromImage,
  scanTemplateInstances
} from "./instances.js?v=20260310-batch92";
