import { normalizeStickyColorToken } from "../config.js?v=20260316-patch19-analytics-ai-maturity-pack";

export function pickFirstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function coerceBooleanLike(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if ([
    "true", "yes", "ja", "1", "directed", "with_arrow", "arrow",
    "checked", "check", "valid", "validated", "done", "complete", "completed"
  ].includes(normalized)) return true;
  if ([
    "false", "no", "nein", "0", "none", "undirected", "without_arrow", "no_arrow",
    "unchecked", "uncheck", "invalid", "not_validated", "open", "pending"
  ].includes(normalized)) return false;
  return null;
}

export function normalizeConnectorDirection(rawAction) {
  const rawDirection = pickFirstNonEmptyString(
    rawAction?.direction,
    rawAction?.arrowDirection,
    rawAction?.connectorDirection
  );

  if (rawDirection) {
    const dir = rawDirection.trim().toLowerCase();
    if (["none", "undirected", "without_arrow", "no_arrow"].includes(dir)) {
      return { directed: false, reverseDirection: false };
    }
    if (["to_from", "reverse", "backward", "target_to_source", "end_to_start"].includes(dir)) {
      return { directed: true, reverseDirection: true };
    }
    if (["from_to", "forward", "source_to_target", "start_to_end"].includes(dir)) {
      return { directed: true, reverseDirection: false };
    }
  }

  const coerced = coerceBooleanLike(
    rawAction?.directed ??
    rawAction?.isDirected ??
    rawAction?.withArrow ??
    rawAction?.hasArrow ??
    rawAction?.arrow
  );

  return {
    directed: coerced == null ? true : coerced,
    reverseDirection: false
  };
}

export function makeDirectedConnectorKey(fromStickyId, toStickyId) {
  if (!fromStickyId || !toStickyId) return null;
  return String(fromStickyId) + "->" + String(toStickyId);
}

export function makeUndirectedConnectorKey(a, b) {
  if (!a || !b) return null;
  return [String(a), String(b)].sort().join("<->");
}

export function makeCanonicalStickyPairKey(a, b) {
  return makeUndirectedConnectorKey(a, b);
}

function normalizeActionTypeToken(rawType) {
  if (typeof rawType !== "string") return null;
  return rawType
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_")
    .toLowerCase();
}

function inferCheckStatusFromRawType(rawType) {
  const token = normalizeActionTypeToken(rawType);
  if (!token) return null;
  if (token.includes("uncheck") || token.includes("remove_check") || token.includes("clear_check")) return false;
  if (token.includes("check") || token.includes("validate") || token.includes("mark_checked")) return true;
  return null;
}

export function canonicalizeAgentActionType(rawType) {
  const snake = normalizeActionTypeToken(rawType);
  if (!snake) return null;

  const compact = snake.replace(/_/g, "");

  const typeMap = {
    movesticky: "move_sticky",
    movestickynote: "move_sticky",
    movenote: "move_sticky",
    createsticky: "create_sticky",
    createstickynote: "create_sticky",
    createnote: "create_sticky",
    addsticky: "create_sticky",
    addstickynote: "create_sticky",
    addnote: "create_sticky",
    deletesticky: "delete_sticky",
    deletestickynote: "delete_sticky",
    deletenote: "delete_sticky",
    removesticky: "delete_sticky",
    removestickynote: "delete_sticky",
    removenote: "delete_sticky",
    createconnector: "create_connector",
    addconnector: "create_connector",
    connectsticky: "create_connector",
    connectstickies: "create_connector",
    connectnote: "create_connector",
    connectnotes: "create_connector",
    createconnection: "create_connector",
    addconnection: "create_connector",
    linksticky: "create_connector",
    linkstickies: "create_connector",
    linknote: "create_connector",
    linknotes: "create_connector",
    setstickycolor: "set_sticky_color",
    setcolor: "set_sticky_color",
    setnotecolor: "set_sticky_color",
    recolorsticky: "set_sticky_color",
    recolornote: "set_sticky_color",
    colorsticky: "set_sticky_color",
    colornote: "set_sticky_color",
    changestickycolor: "set_sticky_color",
    changenotecolor: "set_sticky_color",
    setcheckstatus: "set_check_status",
    checksticky: "set_check_status",
    checknote: "set_check_status",
    markchecked: "set_check_status",
    markstickychecked: "set_check_status",
    validate_sticky: "set_check_status",
    validatesticky: "set_check_status",
    unchecksticky: "set_check_status",
    unchecknote: "set_check_status",
    clearcheck: "set_check_status",
    removecheck: "set_check_status",
    inform: "inform",
    message: "inform",
    note: "inform",
    log: "inform"
  };

  return typeMap[compact] || null;
}

export function normalizeAgentAction(rawAction) {
  if (!rawAction || typeof rawAction !== "object") return null;

  const rawType = rawAction.type || rawAction.action || rawAction.kind || rawAction.operation;
  const type = canonicalizeAgentActionType(rawType);
  if (!type) return null;

  const normalizedDirection = normalizeConnectorDirection(rawAction);
  const inferredChecked = inferCheckStatusFromRawType(rawType);
  const explicitChecked = coerceBooleanLike(
    rawAction.checked ??
    rawAction.isChecked ??
    rawAction.check ??
    rawAction.validated ??
    rawAction.isValidated ??
    rawAction.status
  );
  const checked = explicitChecked == null ? inferredChecked : explicitChecked;

  const color = normalizeStickyColorToken(
    pickFirstNonEmptyString(
      rawAction.color,
      rawAction.fillColor,
      rawAction.stickyColor,
      rawAction.backgroundColor,
      rawAction?.style?.fillColor,
      rawAction?.style?.backgroundColor
    )
  );

  return {
    type,
    instanceLabel: pickFirstNonEmptyString(
      rawAction.instanceLabel,
      rawAction.targetInstanceLabel,
      rawAction.canvasLabel,
      rawAction.instanceName,
      typeof rawAction.instance === "string" ? rawAction.instance : null,
      typeof rawAction.targetInstance === "string" ? rawAction.targetInstance : null
    ),
    instanceId: pickFirstNonEmptyString(
      rawAction.instanceId,
      rawAction.targetInstanceId,
      rawAction.canvasInstanceId,
      rawAction.instance,
      rawAction.targetCanvasInstanceId
    ),
    stickyId: pickFirstNonEmptyString(
      rawAction.stickyId,
      rawAction.noteId,
      rawAction.stickyAlias,
      rawAction.sticky?.id,
      typeof rawAction.sticky === "string" ? rawAction.sticky : null
    ),
    refId: pickFirstNonEmptyString(
      rawAction.refId,
      rawAction.tempId,
      rawAction.localId,
      rawAction.clientRefId,
      rawAction.referenceId,
      rawAction.newStickyRefId
    ),
    fromStickyId: pickFirstNonEmptyString(
      rawAction.fromStickyId,
      rawAction.fromId,
      rawAction.sourceStickyId,
      rawAction.sourceNoteId,
      rawAction.startStickyId,
      rawAction.startNoteId,
      rawAction.from?.id,
      rawAction.start?.id,
      typeof rawAction.from === "string" ? rawAction.from : null,
      typeof rawAction.start === "string" ? rawAction.start : null
    ),
    toStickyId: pickFirstNonEmptyString(
      rawAction.toStickyId,
      rawAction.toId,
      rawAction.targetStickyId,
      rawAction.targetNoteId,
      rawAction.endStickyId,
      rawAction.endNoteId,
      rawAction.to?.id,
      rawAction.end?.id,
      typeof rawAction.to === "string" ? rawAction.to : null,
      typeof rawAction.end === "string" ? rawAction.end : null
    ),
    area: pickFirstNonEmptyString(
      rawAction.area,
      rawAction.targetArea,
      rawAction.target_area,
      rawAction.destinationArea
    ),
    targetArea: pickFirstNonEmptyString(
      rawAction.targetArea,
      rawAction.target_area,
      rawAction.area,
      rawAction.destinationArea
    ),
    text: pickFirstNonEmptyString(
      rawAction.text,
      rawAction.content,
      rawAction.note,
      rawAction.stickyText
    ),
    message: pickFirstNonEmptyString(
      rawAction.message,
      rawAction.text,
      rawAction.content,
      rawAction.note
    ),
    color,
    checked,
    directed: normalizedDirection.directed,
    reverseDirection: normalizedDirection.reverseDirection
  };
}
