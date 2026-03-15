export function createEmptyActionExecutionStats() {
  return {
    createdStickyCount: 0,
    movedStickyCount: 0,
    deletedStickyCount: 0,
    createdConnectorCount: 0,
    failedActionCount: 0,
    skippedActionCount: 0,
    executedMutationCount: 0
  };
}

export function mergeActionExecutionStats(target, addition) {
  if (!target || !addition) return target;
  target.createdStickyCount += Number(addition.createdStickyCount || 0);
  target.movedStickyCount += Number(addition.movedStickyCount || 0);
  target.deletedStickyCount += Number(addition.deletedStickyCount || 0);
  target.createdConnectorCount += Number(addition.createdConnectorCount || 0);
  target.failedActionCount += Number(addition.failedActionCount || 0);
  target.skippedActionCount += Number(addition.skippedActionCount || 0);
  target.executedMutationCount += Number(addition.executedMutationCount || 0);
  return target;
}

export function summarizeAppliedActions(actionResult) {
  const src = (actionResult && typeof actionResult === "object") ? actionResult : {};

  return {
    createdStickyCount: Number(src.createdStickyCount || 0),
    movedStickyCount: Number(src.movedStickyCount || 0),
    deletedStickyCount: Number(src.deletedStickyCount || 0),
    createdConnectorCount: Number(src.createdConnectorCount || 0),
    failedActionCount: Number(src.failedActionCount || 0),
    skippedActionCount: Number((src.skippedActionCount ?? src.skippedCount) || 0),
    infoCount: Number(src.infoCount || 0),
    targetedInstanceCount: Number(src.targetedInstanceCount || 0),
    executedMutationCount: Number(src.executedMutationCount || 0),
    plannedMutationCount: Number((src.plannedMutationCount ?? src.queuedCount ?? src.proposedCount ?? src.appliedCount) || 0)
  };
}
