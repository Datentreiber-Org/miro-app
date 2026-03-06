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
} from "./storage.js?v=20260307-batch5";

export {
  buildAgentFeedbackContent,
  buildQuestionAnswerContent
} from "./feedback.js?v=20260307-batch5";

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
  writeChatOutputContent
} from "./chat-interface.js?v=20260307-batch5";

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
} from "./flow-controls.js?v=20260307-batch5";

export {
  computeTemplateGeometry,
  buildInstanceGeometryIndex,
  findInstanceByPoint,
  registerInstanceFromImage,
  scanTemplateInstances
} from "./instances.js?v=20260307-batch5";
