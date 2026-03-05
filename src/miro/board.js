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
  listBoardFlows
} from "./storage.js?v=20260305-batch06";

export {
  buildFeedbackTextContent,
  ensureFeedbackFrame,
  listFeedbackTextItemsInFrame,
  renderFeedbackTextForRun
} from "./feedback.js?v=20260305-batch05";

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
  createFlowControlShape
} from "./flow-controls.js?v=20260305-batch06";

export {
  computeTemplateGeometry,
  buildInstanceGeometryIndex,
  findInstanceByPoint,
  registerInstanceFromImage,
  scanTemplateInstances
} from "./instances.js?v=20260305-batch05";
