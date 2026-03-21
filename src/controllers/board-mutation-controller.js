export function createBoardMutationController(deps) {
  const {
    Board,
    Catalog,
    ExerciseEngine,
    STICKY_LAYOUT,
    TEMPLATE_ID,
    createEmptyActionExecutionStats,
    ensureSystemCheckTagId,
    formatRuntimeErrorMessage,
    getInstanceLabelByInternalId,
    getInstanceLabelsFromIds,
    getInternalInstanceIdByLabel,
    isFiniteNumber,
    log,
    logRuntimeNotice,
    logSuppressedRuntimeWarning,
    makeDirectedConnectorKey,
    makeUndirectedConnectorKey,
    mergeActionExecutionStats,
    normalizeAgentAction,
    normalizeStickyColorToken,
    pickFirstNonEmptyString,
    refreshBoardState,
    state,
  } = deps;

  async function classifyStickies({ silent = false } = {}) {
    if (!silent) log("Button: Stickies klassifizieren (Debug).");
  
    await refreshBoardState();
  
    const results = [];
    for (const inst of state.instancesById.values()) {
      const li = state.liveCatalog?.instances?.[inst.instanceId];
      if (!li) continue;
      const classification = Catalog.buildClassificationFromLiveInstance(inst, li);
      results.push(classification);
    }
  
    if (!results.length) {
      if (!silent) log("Keine Canvas-Instanzen mit Stickies gefunden.");
      return null;
    }
  
    const out = (results.length === 1) ? results[0] : { templates: results };
    if (!silent) {
      log("Klassifikation fertig:");
      log(out);
    }
    return out;
  }
  
  // --------------------------------------------------------------------
  // Instance state for agent (signature + diff + prompt payload)
  // --------------------------------------------------------------------
  
  async function getInstanceStateForAgent(instance, { liveCatalog, hasGlobalBaseline }) {
    return await Catalog.computeInstanceState(instance, {
      liveCatalog,
      hasGlobalBaseline,
      loadBaselineSignatureForImageId: Board.loadBaselineSignatureForImageId,
      log
    });
  }
  
  async function computeInstanceStatesById(liveCatalog) {
    const stateById = Object.create(null);
  
    for (const inst of state.instancesById.values()) {
      const st = await getInstanceStateForAgent(inst, {
        liveCatalog,
        hasGlobalBaseline: state.hasGlobalBaseline
      });
      if (st) stateById[inst.instanceId] = st;
    }
  
    return stateById;
  }
  
  // --------------------------------------------------------------------
  // Apply agent actions (dispatcher + board ops)
  // --------------------------------------------------------------------
  
  async function applyAgentActionsToInstance(instanceId, actions) {
    const executionStats = createEmptyActionExecutionStats();
  
    if (!Array.isArray(actions) || actions.length === 0) {
      log("Keine Actions vom Agenten (leer).");
      return executionStats;
    }
  
    const instance = state.instancesById.get(instanceId);
    if (!instance) {
      logRuntimeNotice("action_failed", "applyAgentActions: Unbekannte Instanz " + instanceId);
      executionStats.failedActionCount += actions.length;
      return executionStats;
    }
  
    const instanceLabel = instance.instanceLabel || instanceId;
  
    const geom = await Board.computeTemplateGeometry(instance, log);
    if (!geom) {
      logRuntimeNotice("action_failed", "applyAgentActions: Keine Geometrie für Instanz " + instanceLabel);
      executionStats.failedActionCount += actions.length;
      return executionStats;
    }
  
    if (!state.liveCatalog || !state.liveCatalog.instances?.[instanceId]) {
      await refreshBoardState();
    }
  
    const liveInst = state.liveCatalog?.instances?.[instanceId] || null;
    const createdStickyIdsByRef = new Map();
    const directedConnectorSet = new Set();
    const undirectedConnectorSet = new Set();
  
    for (const connection of liveInst?.connections || []) {
      if (!connection?.fromStickyId || !connection?.toStickyId) continue;
      if (connection.directed === false) {
        undirectedConnectorSet.add(makeUndirectedConnectorKey(connection.fromStickyId, connection.toStickyId));
      } else {
        directedConnectorSet.add(makeDirectedConnectorKey(connection.fromStickyId, connection.toStickyId));
      }
    }
  
    function markSuccess(type) {
      executionStats.executedMutationCount += 1;
  
      if (type === "create_sticky") executionStats.createdStickyCount += 1;
      if (type === "move_sticky") executionStats.movedStickyCount += 1;
      if (type === "delete_sticky") executionStats.deletedStickyCount += 1;
      if (type === "create_connector") executionStats.createdConnectorCount += 1;
    }
  
    function markSkipped(message, details = null) {
      executionStats.skippedActionCount += 1;
      if (message) logRuntimeNotice("skipped_action", message, details);
    }
  
    function markFailure(message, details = null) {
      executionStats.failedActionCount += 1;
      if (message) logRuntimeNotice("action_failed", message, details);
    }
  
    function rectFromLiveSticky(st) {
      if (!st || typeof st.x !== "number" || typeof st.y !== "number") return null;
      return {
        id: st.id,
        x: st.x,
        y: st.y,
        width: isFiniteNumber(st.width) ? st.width : STICKY_LAYOUT.defaultWidthPx,
        height: isFiniteNumber(st.height) ? st.height : STICKY_LAYOUT.defaultHeightPx
      };
    }
  
    function buildOccupied(list) {
      const out = [];
      for (const st of list || []) {
        const r = rectFromLiveSticky(st);
        if (r) out.push(r);
      }
      return out;
    }
  
    const occupiedByRegion = Object.create(null);
    occupiedByRegion.header = buildOccupied(liveInst?.regions?.header?.stickies);
    for (const region of Catalog.getBodyRegionDefs(instance.canvasTypeId || TEMPLATE_ID)) {
      occupiedByRegion[region.id] = buildOccupied(liveInst?.regions?.body?.[region.id]?.stickies);
    }
  
    function deriveStickySize() {
      return {
        width: STICKY_LAYOUT.defaultWidthPx,
        height: STICKY_LAYOUT.defaultHeightPx,
        shape: STICKY_LAYOUT.defaultShape || "rectangle"
      };
    }
  
    function removeFromAllOccupied(stickyId) {
      if (!stickyId) return;
      for (const rid of Object.keys(occupiedByRegion)) {
        occupiedByRegion[rid] = (occupiedByRegion[rid] || []).filter((r) => r && r.id !== stickyId);
      }
    }
  
    function detectBodyRegionIdFromBoardRect(canvasTypeId, boardRect) {
      if (!geom || !boardRect) return null;
      const loc = Catalog.classifyBoardRectAgainstCanvas(canvasTypeId, boardRect, geom, { includeFooter: false });
      const rid = (loc?.role === "body" || loc?.role === "header") ? (loc.regionId || (loc.role === "header" ? "header" : null)) : null;
      return (rid && Object.prototype.hasOwnProperty.call(occupiedByRegion, rid)) ? rid : null;
    }
  
    function detectBodyRegionIdFromBoardCoords(canvasTypeId, x, y, width = STICKY_LAYOUT.defaultWidthPx, height = STICKY_LAYOUT.defaultHeightPx) {
      if (!geom || !isFiniteNumber(x) || !isFiniteNumber(y)) return null;
      const boardRect = {
        x,
        y,
        width,
        height,
        left: x - width / 2,
        right: x + width / 2,
        top: y - height / 2,
        bottom: y + height / 2
      };
      return detectBodyRegionIdFromBoardRect(canvasTypeId, boardRect);
    }
  
    function registerCreatedStickyRef(refId, stickyId) {
      if (!refId || !stickyId) return;
      createdStickyIdsByRef.set(refId, stickyId);
    }
  
    function resolveActionStickyReference(stickyRef) {
      if (!stickyRef) return null;
      if (createdStickyIdsByRef.has(stickyRef)) {
        return createdStickyIdsByRef.get(stickyRef) || null;
      }
      return Catalog.resolveStickyId(stickyRef, state.aliasState);
    }
  
    function rememberConnector(fromStickyId, toStickyId, directed = true) {
      if (!fromStickyId || !toStickyId) return;
      if (directed === false) {
        undirectedConnectorSet.add(makeUndirectedConnectorKey(fromStickyId, toStickyId));
        return;
      }
      directedConnectorSet.add(makeDirectedConnectorKey(fromStickyId, toStickyId));
    }
  
    function detectConnectorCollision(fromStickyId, toStickyId, directed = true) {
      const undirectedKey = makeUndirectedConnectorKey(fromStickyId, toStickyId);
      const forwardKey = makeDirectedConnectorKey(fromStickyId, toStickyId);
      const reverseKey = makeDirectedConnectorKey(toStickyId, fromStickyId);
  
      if (directed === false) {
        if (undirectedConnectorSet.has(undirectedKey)) return { type: "exact_undirected_duplicate" };
        if (directedConnectorSet.has(forwardKey)) return { type: "directed_forward_exists" };
        if (directedConnectorSet.has(reverseKey)) return { type: "directed_reverse_exists" };
        return null;
      }
  
      if (undirectedConnectorSet.has(undirectedKey)) return { type: "undirected_exists" };
      if (directedConnectorSet.has(forwardKey)) return { type: "exact_directed_duplicate" };
      return null;
    }
  
    function buildConnectorCollisionMessage(collision, fromStickyId, toStickyId) {
      if (!collision) return null;
      const pairLabel = fromStickyId + " → " + toStickyId;
      switch (collision.type) {
        case "exact_directed_duplicate":
          return "create_connector: Gerichtete Verbindung " + pairLabel + " existiert bereits – übersprungen.";
        case "exact_undirected_duplicate":
          return "create_connector: Ungerichtete Verbindung zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits – übersprungen.";
        case "undirected_exists":
          return "create_connector: Zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits eine ungerichtete Verbindung; gerichtete Duplikate werden nicht angelegt – übersprungen.";
        case "directed_forward_exists":
          return "create_connector: Zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits eine gerichtete Verbindung; ungerichtete Duplikate werden nicht angelegt – übersprungen.";
        case "directed_reverse_exists":
          return "create_connector: Zwischen " + fromStickyId + " und " + toStickyId + " existiert bereits die Gegenrichtung; ungerichtete Duplikate werden nicht angelegt – übersprungen.";
        default:
          return "create_connector: Verbindungskollision erkannt (" + collision.type + ") – übersprungen.";
      }
    }
  
    async function createStickyAtBoardPosition(action, x, y, sizeHint = null) {
      const normalizedColor = normalizeStickyColorToken(action?.color) || null;
      const shouldCheck = action?.checked === true;
      const checkTagId = shouldCheck ? await ensureSystemCheckTagId() : null;
      const width = isFiniteNumber(sizeHint?.width) ? Number(sizeHint.width) : STICKY_LAYOUT.defaultWidthPx;
      const height = isFiniteNumber(sizeHint?.height) ? Number(sizeHint.height) : STICKY_LAYOUT.defaultHeightPx;
      const shape = (sizeHint?.shape === "square" || sizeHint?.shape === "rectangle")
        ? sizeHint.shape
        : (STICKY_LAYOUT.defaultShape || "rectangle");
  
      const sticky = await Board.createStickyNoteAtBoardCoords({
        content: action.text || "(leer)",
        x,
        y,
        width,
        shape,
        fillColor: normalizedColor,
        tagIds: checkTagId ? [checkTagId] : null
      }, log);
  
      if (sticky?.id && action.refId) {
        registerCreatedStickyRef(action.refId, sticky.id);
      }
      if (sticky?.id && state.stickyOwnerCache instanceof Map) {
        state.stickyOwnerCache.set(sticky.id, instanceId);
      }
  
      if (sticky?.id) {
        const actualWidth = isFiniteNumber(sticky.width) ? Number(sticky.width) : (width || STICKY_LAYOUT.defaultWidthPx);
        const actualHeight = isFiniteNumber(sticky.height) ? Number(sticky.height) : (height || STICKY_LAYOUT.defaultHeightPx);
        const regionId = detectBodyRegionIdFromBoardCoords(instance.canvasTypeId || TEMPLATE_ID, x, y, actualWidth, actualHeight);
        if (regionId && occupiedByRegion[regionId]) {
          occupiedByRegion[regionId].push({
            id: sticky.id,
            x,
            y,
            width: actualWidth,
            height: actualHeight
          });
        }
      }
  
      return sticky;
    }
  
    const handlers = {
      "move_sticky": async (action) => {
        const stickyId = resolveActionStickyReference(action.stickyId);
        if (!stickyId) {
          markSkipped("move_sticky: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
          return;
        }
  
        const canvasTypeId = instance.canvasTypeId || TEMPLATE_ID;
        const region = Catalog.areaNameToRegion(action.targetArea, canvasTypeId);
        const regionId = region?.id || null;
        if (!regionId || !occupiedByRegion[regionId]) {
          markSkipped("move_sticky: Unbekannte targetArea '" + String(action.targetArea || "(leer)") + "' – übersprungen.");
          return;
        }
  
        let stickyItem = null;
        try {
          stickyItem = await Board.getItemById(stickyId, log);
        } catch (error) {
          logSuppressedRuntimeWarning("Sticky-Geometrie konnte vor move_sticky nicht geladen werden", error);
        }
  
        const stickyW = isFiniteNumber(stickyItem?.width) ? stickyItem.width : STICKY_LAYOUT.defaultWidthPx;
        const stickyH = isFiniteNumber(stickyItem?.height) ? stickyItem.height : STICKY_LAYOUT.defaultHeightPx;
  
        removeFromAllOccupied(stickyId);
  
        let targetX = null;
        let targetY = null;
  
        const pos = Catalog.computeNextFreeStickyPositionInBodyRegion({
          templateGeometry: geom,
          canvasTypeId,
          regionId,
          stickyWidthPx: stickyW,
          stickyHeightPx: stickyH,
          marginPx: STICKY_LAYOUT.marginPx,
          gapPx: STICKY_LAYOUT.gapPx,
          occupiedRects: occupiedByRegion[regionId],
          occupiedRectsByRegion: occupiedByRegion
        });
  
        if (pos) {
          if (pos.overflowed && pos.resolvedRegionId && pos.resolvedRegionId !== regionId) {
            log("INFO: Sorted-out-Region '" + regionId + "' ist voll; weiche auf '" + pos.resolvedRegionId + "' aus.");
          }
          if (pos.isFull) {
            log(
              "WARNUNG: Region '" + regionId + "' wirkt voll (Grid " +
              (pos.cols || 1) + "x" + (pos.rows || 1) +
              "). move_sticky setzt auf letzte Zelle."
            );
          }
          targetX = pos.x;
          targetY = pos.y;
        } else {
          const center = Catalog.areaCenterNormalized(regionId, canvasTypeId);
          const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
          targetX = coords.x;
          targetY = coords.y;
        }
  
        if (!isFiniteNumber(targetX) || !isFiniteNumber(targetY)) {
          markFailure("move_sticky: Zielkoordinaten ungültig für Sticky " + stickyId);
          return;
        }
  
        await Board.moveItemByIdToBoardCoords(stickyId, targetX, targetY, log);
  
        const destRegionId = detectBodyRegionIdFromBoardCoords(canvasTypeId, targetX, targetY, stickyW, stickyH);
        if (destRegionId && occupiedByRegion[destRegionId]) {
          occupiedByRegion[destRegionId].push({
            id: stickyId,
            x: targetX,
            y: targetY,
            width: stickyW,
            height: stickyH
          });
        }
  
        markSuccess("move_sticky");
      },
  
      "create_sticky": async (action) => {
        const text = action.text || "(leer)";
        const canvasTypeId = instance.canvasTypeId || TEMPLATE_ID;
        const areaName = action.area || action.targetArea || null;
        const region = Catalog.areaNameToRegion(areaName, canvasTypeId);
        const regionId = region?.id || null;
  
        if (!regionId || !occupiedByRegion[regionId]) {
          markSkipped("create_sticky: Unbekannte area '" + String(areaName || "(leer)") + "' – übersprungen.");
          return;
        }
  
        const size = deriveStickySize(regionId);
        const pos = Catalog.computeNextFreeStickyPositionInBodyRegion({
          templateGeometry: geom,
          canvasTypeId,
          regionId,
          stickyWidthPx: size.width,
          stickyHeightPx: size.height,
          marginPx: STICKY_LAYOUT.marginPx,
          gapPx: STICKY_LAYOUT.gapPx,
          occupiedRects: occupiedByRegion[regionId],
          occupiedRectsByRegion: occupiedByRegion
        });
  
        if (!pos) {
          log("create_sticky: Konnte keine Platzierung berechnen (Region=" + regionId + "). Fallback Center.");
          const center = Catalog.areaCenterNormalized(regionId, canvasTypeId);
          const coords = Catalog.normalizedToBoardCoords(geom, center.px, center.py);
          const sticky = await createStickyAtBoardPosition({ ...action, text }, coords.x, coords.y, size);
          if (sticky?.id) markSuccess("create_sticky");
          else markFailure("create_sticky: Miro lieferte kein Sticky-Item zurück.");
          return;
        }
  
        if (pos.overflowed && pos.resolvedRegionId && pos.resolvedRegionId !== regionId) {
          log("INFO: Sorted-out-Region '" + regionId + "' ist voll; platziere Sticky stattdessen in '" + pos.resolvedRegionId + "'.");
        }
        if (pos.isFull) {
          log(
            "WARNUNG: Region '" + regionId + "' wirkt voll (Grid " +
            (pos.cols || 1) + "x" + (pos.rows || 1) +
            "). Sticky wird auf die letzte Zelle gesetzt."
          );
        }
  
        const sticky = await createStickyAtBoardPosition({ ...action, text }, pos.x, pos.y, size);
        if (sticky?.id) markSuccess("create_sticky");
        else markFailure("create_sticky: Miro lieferte kein Sticky-Item zurück.");
      },
  
      "delete_sticky": async (action) => {
        const stickyId = resolveActionStickyReference(action.stickyId);
        if (!stickyId) {
          markSkipped("delete_sticky: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
          return;
        }
  
        removeFromAllOccupied(stickyId);
        await Board.removeItemById(stickyId, log);
        markSuccess("delete_sticky");
      },
  
      "set_sticky_color": async (action) => {
        const stickyId = resolveActionStickyReference(action.stickyId);
        if (!stickyId) {
          markSkipped("set_sticky_color: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
          return;
        }
  
        const color = normalizeStickyColorToken(action.color);
        if (!color) {
          markSkipped("set_sticky_color: Ungültige Farbe '" + String(action.color || "(leer)") + "' – übersprungen.");
          return;
        }
  
        const sticky = await Board.setStickyNoteFillColor(stickyId, color, log);
        if (!sticky) {
          markFailure("set_sticky_color: Sticky konnte nicht eingefärbt werden: " + stickyId);
          return;
        }
  
        markSuccess("set_sticky_color");
      },
  
      "set_check_status": async (action) => {
        const stickyId = resolveActionStickyReference(action.stickyId);
        if (!stickyId) {
          markSkipped("set_check_status: Sticky-Referenz nicht auflösbar: " + String(action.stickyId || "(leer)"));
          return;
        }
  
        const checkTagId = await ensureSystemCheckTagId();
        if (!checkTagId) {
          markFailure("set_check_status: Check-Tag konnte nicht bereitgestellt werden.");
          return;
        }
  
        const sticky = await Board.setStickyNoteTagPresence(stickyId, checkTagId, action.checked === true, log);
        if (!sticky) {
          markFailure("set_check_status: Sticky konnte nicht markiert werden: " + stickyId);
          return;
        }
  
        markSuccess("set_check_status");
      },
  
      "create_connector": async (action) => {
        const fromStickyId = resolveActionStickyReference(action.fromStickyId);
        const toStickyId = resolveActionStickyReference(action.toStickyId);
  
        if (!fromStickyId || !toStickyId) {
          markSkipped(
            "create_connector: Sticky-Referenzen nicht auflösbar (from=" +
            String(action.fromStickyId || "(leer)") +
            ", to=" + String(action.toStickyId || "(leer)") + ")."
          );
          return;
        }
  
        if (fromStickyId === toStickyId) {
          markSkipped("create_connector: Quelle und Ziel sind identisch – übersprungen (" + fromStickyId + ").");
          return;
        }
  
        const directed = action.directed !== false;
        const collision = detectConnectorCollision(fromStickyId, toStickyId, directed);
        if (collision) {
          markSkipped(buildConnectorCollisionMessage(collision, fromStickyId, toStickyId));
          return;
        }
  
        await Board.createConnectorBetweenItems({
          startItemId: fromStickyId,
          endItemId: toStickyId,
          directed
        }, log);
        rememberConnector(fromStickyId, toStickyId, directed);
        markSuccess("create_connector");
      }
    };
  
    async function runActionsSequentially(actionList) {
      for (const action of actionList || []) {
        const handler = handlers[action?.type];
        if (typeof handler !== "function") {
          markFailure("Unbekannter Action-Typ innerhalb applyAgentActionsToInstance: " + String(action?.type || "(leer)"));
          continue;
        }
  
        try {
          await handler(action);
        } catch (e) {
          markFailure("Action '" + action.type + "' fehlgeschlagen: " + formatRuntimeErrorMessage(e), e?.stack || null);
        }
      }
    }
  
    const regularActions = actions.filter((action) => action?.type !== "create_connector");
    const connectorActions = actions.filter((action) => action?.type === "create_connector");
  
    log("Wende " + actions.length + " Action(s) an (Instanz " + instanceLabel + ").");
    if (regularActions.length) {
      await runActionsSequentially(regularActions);
    }
    if (connectorActions.length) {
      await runActionsSequentially(connectorActions);
    }
  
    return executionStats;
  }
  
  // --------------------------------------------------------------------
  // Agent Modus B (selektierte Canvas-Instanzen)
  // --------------------------------------------------------------------
  
  function buildBoardCatalogForSelectedInstances(selectedInstanceIds) {
    const selectedLabels = new Set(getInstanceLabelsFromIds(selectedInstanceIds));
    const baseCatalog = Catalog.buildBoardCatalogSummary(state.instancesById, {
      mode: "generic",
      hasGlobalBaseline: state.hasGlobalBaseline
    });
  
    return {
      instances: (baseCatalog.instances || []).map((entry) => ({
        ...entry,
        isActive: selectedLabels.has(entry.instanceLabel)
      }))
    };
  }
  
  function validateNormalizedAction(action) {
    if (!action || typeof action !== "object" || !action.type) {
      return { ok: false, message: "Unbekanntes oder nicht unterstütztes Action-Schema." };
    }
  
    if (action.type === "move_sticky") {
      const targetArea = pickFirstNonEmptyString(action.targetArea, action.area);
      if (!action.stickyId) return { ok: false, message: "move_sticky ohne stickyId." };
      if (!targetArea) return { ok: false, message: "move_sticky ohne targetArea." };
      return { ok: true, action: { ...action, targetArea } };
    }
  
    if (action.type === "create_sticky") {
      const area = pickFirstNonEmptyString(action.area, action.targetArea);
      const color = action.color == null ? null : normalizeStickyColorToken(action.color);
      const checked = action.checked == null ? null : action.checked === true;
      if (!action.text) return { ok: false, message: "create_sticky ohne text." };
      if (!area) return { ok: false, message: "create_sticky ohne area." };
      if (action.color != null && !color) return { ok: false, message: "create_sticky mit ungültiger color." };
      return { ok: true, action: { ...action, area, targetArea: area, color, checked } };
    }
  
    if (action.type === "delete_sticky") {
      if (!action.stickyId) return { ok: false, message: "delete_sticky ohne stickyId." };
      return { ok: true, action };
    }
  
    if (action.type === "set_sticky_color") {
      const color = normalizeStickyColorToken(action.color);
      if (!action.stickyId) return { ok: false, message: "set_sticky_color ohne stickyId." };
      if (!color) return { ok: false, message: "set_sticky_color ohne gültige color." };
      return { ok: true, action: { ...action, color } };
    }
  
    if (action.type === "set_check_status") {
      if (!action.stickyId) return { ok: false, message: "set_check_status ohne stickyId." };
      if (typeof action.checked !== "boolean") return { ok: false, message: "set_check_status ohne checked=true/false." };
      return { ok: true, action: { ...action, checked: action.checked === true } };
    }
  
    if (action.type === "create_connector") {
      if (!action.fromStickyId || !action.toStickyId) {
        return { ok: false, message: "create_connector ohne fromStickyId/toStickyId." };
      }
      return { ok: true, action: { ...action, directed: action.directed !== false } };
    }
  
    if (action.type === "inform") {
      return { ok: true, action };
    }
  
    return { ok: true, action };
  }
  
  function resolveOwnerInstanceIdForStickyReference(stickyRef) {
    if (!stickyRef) return null;
  
    const resolvedStickyId = Catalog.resolveStickyId(stickyRef, state.aliasState);
    if (!resolvedStickyId) return null;
  
    return state.stickyOwnerCache?.get(resolvedStickyId) || null;
  }
  
  function resolveActionInstanceId(action, { candidateInstanceIds = null, anchorInstanceId = null, sourceLabel = "Agent" } = {}) {
    const candidateIds = Array.from(new Set((candidateInstanceIds || []).filter((id) => state.instancesById.has(id))));
  
    const explicitInstanceIdByLabel = action?.instanceLabel
      ? getInternalInstanceIdByLabel(action.instanceLabel)
      : null;
  
    const explicitInstanceId = explicitInstanceIdByLabel || ((action?.instanceId && state.instancesById.has(action.instanceId)) ? action.instanceId : null);
  
    if (action?.instanceLabel && !explicitInstanceIdByLabel) {
      logRuntimeNotice("skipped_action", sourceLabel + ": Unbekanntes instanceLabel '" + action.instanceLabel + "' in Action-Output.");
    }
  
    const ownerInstanceIds = Array.from(new Set([
      resolveOwnerInstanceIdForStickyReference(action?.stickyId),
      resolveOwnerInstanceIdForStickyReference(action?.fromStickyId),
      resolveOwnerInstanceIdForStickyReference(action?.toStickyId)
    ].filter(Boolean)));
  
    if (ownerInstanceIds.length > 1) {
      logRuntimeNotice("skipped_action", sourceLabel + ": Action referenziert Sticky Notes aus mehreren Instanzen – übersprungen.");
      return null;
    }
  
    const ownerInstanceId = ownerInstanceIds[0] || null;
    const ownerInstanceLabel = ownerInstanceId ? getInstanceLabelByInternalId(ownerInstanceId) : null;
  
    if (ownerInstanceId && explicitInstanceId && explicitInstanceId !== ownerInstanceId) {
      log(
        "WARNUNG: " + sourceLabel + "-Action referenziert Sticky(s) mit Instanz " +
        (action.instanceLabel || getInstanceLabelByInternalId(explicitInstanceId) || explicitInstanceId) +
        ", gehört aber zu " + (ownerInstanceLabel || ownerInstanceId) + ". Verwende Eigentümer-Instanz."
      );
    }
  
    const preferredInstanceId = ownerInstanceId || explicitInstanceId || null;
    if (preferredInstanceId) {
      if (candidateIds.length > 0 && !candidateIds.includes(preferredInstanceId)) {
        logRuntimeNotice(
          "skipped_action",
          sourceLabel + ": Abgeleitete Ziel-Instanz " +
          (getInstanceLabelByInternalId(preferredInstanceId) || preferredInstanceId) +
          " liegt außerhalb des erlaubten Zielsets – Action übersprungen."
        );
        return null;
      }
      return preferredInstanceId;
    }
  
    if (candidateIds.length === 1) return candidateIds[0];
    if (anchorInstanceId && candidateIds.includes(anchorInstanceId)) return anchorInstanceId;
    return null;
  }
  
  async function applyResolvedAgentActions(actions, { candidateInstanceIds, anchorInstanceId = null, sourceLabel = "Agent" }) {
    if (!Array.isArray(actions) || actions.length === 0) {
      log(sourceLabel + ": Keine Actions geliefert.");
      return {
        appliedCount: 0,
        skippedCount: 0,
        infoCount: 0,
        targetedInstanceCount: 0,
        ...createEmptyActionExecutionStats()
      };
    }
  
    const grouped = new Map();
    const aggregatedExecutionStats = createEmptyActionExecutionStats();
    let queuedCount = 0;
    let skippedCount = 0;
    let infoCount = 0;
  
    for (const rawAction of actions) {
      let action = normalizeAgentAction(rawAction);
  
      if (!action) {
        skippedCount++;
        logRuntimeNotice("skipped_action", sourceLabel + ": Unbekanntes oder nicht unterstütztes Action-Schema – übersprungen.", rawAction);
        continue;
      }
  
      if (action.type === "create_connector" && action.reverseDirection) {
        action = {
          ...action,
          fromStickyId: action.toStickyId,
          toStickyId: action.fromStickyId,
          reverseDirection: false
        };
      }
  
      const validation = validateNormalizedAction(action);
      if (!validation.ok) {
        skippedCount++;
        logRuntimeNotice("skipped_action", sourceLabel + ": " + validation.message + " – übersprungen.", rawAction);
        continue;
      }
      action = validation.action || action;
  
      if (action.type === "inform") {
        infoCount++;
        log(sourceLabel + " info:");
        log(action.message || "(keine Nachricht)");
        continue;
      }
  
      const targetInstanceId = resolveActionInstanceId(action, {
        candidateInstanceIds,
        anchorInstanceId,
        sourceLabel
      });
  
      if (!targetInstanceId) {
        skippedCount++;
        logRuntimeNotice("skipped_action", sourceLabel + ": Keine Ziel-Instanz für Action ableitbar – übersprungen.", rawAction);
        continue;
      }
  
      if (!grouped.has(targetInstanceId)) grouped.set(targetInstanceId, []);
      grouped.get(targetInstanceId).push({
        ...action,
        instanceId: targetInstanceId,
        instanceLabel: getInstanceLabelByInternalId(targetInstanceId) || action.instanceLabel || null
      });
      queuedCount++;
    }
  
    for (const [instanceId, instanceActions] of grouped.entries()) {
      log(sourceLabel + ": Wende " + instanceActions.length + " Action(s) auf Instanz " + (getInstanceLabelByInternalId(instanceId) || instanceId) + " an.");
      const executionStats = await applyAgentActionsToInstance(instanceId, instanceActions);
      mergeActionExecutionStats(aggregatedExecutionStats, executionStats);
    }
  
    const nestedSkippedCount = Number(aggregatedExecutionStats.skippedActionCount || 0);
    const failedCount = Number(aggregatedExecutionStats.failedActionCount || 0);
    const totalSkippedCount = skippedCount + nestedSkippedCount;
    const appliedCount = Math.max(0, queuedCount - failedCount - nestedSkippedCount);
  
    return {
      queuedCount,
      appliedCount,
      skippedCount: totalSkippedCount,
      infoCount,
      targetedInstanceCount: grouped.size,
      failedCount,
      ...aggregatedExecutionStats,
      skippedActionCount: totalSkippedCount
    };
  }
  
  // --------------------------------------------------------------------
  // Global Agent Modus A
  // --------------------------------------------------------------------
  
  function listAreaNamesFromActiveCanvasStates(activeCanvasStates) {
    const areaNames = [];
    const seen = new Set();
    for (const payload of Object.values((activeCanvasStates && typeof activeCanvasStates === "object") ? activeCanvasStates : {})) {
      for (const tpl of Array.isArray(payload?.templates) ? payload.templates : []) {
        for (const area of Array.isArray(tpl?.areas) ? tpl.areas : []) {
          const name = pickFirstNonEmptyString(area?.name);
          if (!name || seen.has(name)) continue;
          seen.add(name);
          areaNames.push(name);
        }
      }
    }
    return areaNames;
  }
  
  function resolveAllowedActionAreasForRun({ endpointContext = null, activeCanvasStates = null } = {}) {
    const explicitAreas = ExerciseEngine.normalizeStringArray(endpointContext?.allowedActionAreas);
    if (explicitAreas.length) return explicitAreas;
    return listAreaNamesFromActiveCanvasStates(activeCanvasStates);
  }
  
  function sanitizeProposalActionsForEndpoint(actions, {
    allowedActions = [],
    allowedActionAreas = [],
    logFn = null
  } = {}) {
    const normalizedActions = Array.isArray(actions)
      ? actions.map((raw) => normalizeAgentAction(raw)).filter(Boolean)
      : [];
  
    const allowedActionSet = new Set(ExerciseEngine.normalizeStringArray(allowedActions));
    const allowedAreas = new Set(ExerciseEngine.normalizeStringArray(allowedActionAreas));
    const logSafe = typeof logFn === "function" ? logFn : (() => {});
    const sanitized = [];
  
    for (const action of normalizedActions) {
      if (!action) continue;
  
      if (action.type === "inform") {
        sanitized.push(action);
        continue;
      }
  
      if (allowedActionSet.size && !allowedActionSet.has(action.type)) {
        logSafe("INFO: Proposal verwirft nicht freigegebenen Action-Typ: " + String(action.type || "(leer)"));
        continue;
      }
  
      if (allowedAreas.size && action.type === "create_sticky") {
        const area = pickFirstNonEmptyString(action.area, action.targetArea);
        if (!area || !allowedAreas.has(area)) {
          logSafe("INFO: Proposal verwirft Action außerhalb erlaubter Bereiche: " + String(area || "(leer)"));
          continue;
        }
      }
  
      if (allowedAreas.size && action.type === "move_sticky") {
        const area = pickFirstNonEmptyString(action.targetArea, action.area);
        if (!area || !allowedAreas.has(area)) {
          logSafe("INFO: Proposal verwirft Action außerhalb erlaubter Bereiche: " + String(area || "(leer)"));
          continue;
        }
      }
  
      sanitized.push(action);
    }
  
    return sanitized;
  }
  

  return {
    classifyStickies,
    getInstanceStateForAgent,
    computeInstanceStatesById,
    applyAgentActionsToInstance,
    buildBoardCatalogForSelectedInstances,
    validateNormalizedAction,
    resolveOwnerInstanceIdForStickyReference,
    resolveActionInstanceId,
    applyResolvedAgentActions,
    listAreaNamesFromActiveCanvasStates,
    resolveAllowedActionAreasForRun,
    sanitizeProposalActionsForEndpoint,
  };
}
