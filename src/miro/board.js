export { ensureMiroReady, getBoard, registerSelectionUpdateHandler } from "./sdk.js?v=20260305-batch05";

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
  loadBoardFlow,
  saveBoardFlow,
  listBoardFlows,
  normalizeBoardRunState,
  loadBoardRunState,
  saveBoardRunState
} from "./storage.js?v=20260306-batch6";

export {
  buildAgentFeedbackContent,
  buildQuestionAnswerContent
} from "./feedback.js?v=20260306-batch6";

export {
  normalizeChatInterfaceShapeIds,
  hasCompleteChatInterfaceShapeIds,
  computeChatInterfaceLayout,
  createChatInterfaceForInstance,
  readChatInterfaceMeta,
  writeChatInterfaceMeta,
  removeChatInterfaceShapes,
  getChatInterfaceItemByRole,
  readChatInputContent,
  writeChatOutputContent,
  getChatPlaceholderText,
  getChatPlaceholderVariants,
  isKnownChatPlaceholderContent,
  syncChatPlaceholdersForLanguage
} from "./chat-interface.js?v=20260306-batch6";

export {
  getSelection,
  getItems,
  getItemsById,
  getItemById,
  createImage,
  getViewport,
  zoomTo,
  createStickyNoteAtBoardCoords,
  createConnectorBetweenItems,
  removeItemById,
  moveItemByIdToBoardCoords,
  resolveBoardCoords,
  boardToLocalCoords,
  getBoardBaseContext
} from "./items.js?v=20260305-batch05";

export {
  readFlowControlMeta,
  writeFlowControlMeta,
  removeFlowControlMeta,
  computeSuggestedFlowControlPosition,
  createFlowControlShape,
  syncFlowControlShapeAppearance
} from "./flow-controls.js?v=20260306-batch6";

export {
  computeTemplateGeometry,
  buildInstanceGeometryIndex,
  findInstanceByPoint,
  registerInstanceFromImage,
  scanTemplateInstances
} from "./instances.js?v=20260306-batch6";
