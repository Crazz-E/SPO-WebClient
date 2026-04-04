import {
  WsMessageType,
  type WsMessage,
  type WsReqBuildingFocus,
  type WsRespBuildingFocus,
  type WsReqGetBuildingCategories,
  type WsRespBuildingCategories,
  type WsReqGetBuildingFacilities,
  type WsRespBuildingFacilities,
  type WsReqPlaceBuilding,
  type WsRespBuildingPlaced,
  type WsReqBuildCapitol,
  type WsRespCapitolPlaced,
  type WsReqBuildingDetails,
  type WsRespBuildingDetails,
  type WsReqBuildingTabData,
  type WsRespBuildingTabData,
  type WsReqBuildingRefreshProperties,
  type WsRespBuildingRefreshProperties,
  type WsReqBuildingSetProperty,
  type WsRespBuildingSetProperty,
  type WsReqCloneFacility,
  type WsRespCloneFacility,
  type WsReqBuildingUpgrade,
  type WsRespBuildingUpgrade,
  type WsReqRenameFacility,
  type WsRespRenameFacility,
  type WsReqDeleteFacility,
  type WsRespDeleteFacility,
  type WsReqConnectFacilities,
  type WsRespConnectFacilities,
} from '../../shared/types';
import * as ErrorCodes from '../../shared/error-codes';
import { toErrorMessage } from '../../shared/error-utils';
import type { WsHandlerContext } from './types';
import { sendResponse, sendError, withErrorHandler } from './ws-utils';

export async function handleBuildingFocus(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqBuildingFocus;
  console.log(`[Gateway] Focusing building at (${req.x}, ${req.y})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_FacilityNotFound, async () => {
    const buildingInfo = await ctx.session.focusBuilding(req.x, req.y);
    const response: WsRespBuildingFocus = {
      type: WsMessageType.RESP_BUILDING_FOCUS,
      wsRequestId: msg.wsRequestId,
      building: buildingInfo,
    };

    console.log(`[Gateway] Sending building focus response:`, {
      buildingId: buildingInfo.buildingId,
      name: buildingInfo.buildingName,
      wsRequestId: msg.wsRequestId,
    });

    sendResponse(ctx.ws, response);
  });
}

export async function handleBuildingUnfocus(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  console.log(`[Gateway] Unfocusing building`);
  await ctx.session.unfocusBuilding();
  const response: WsMessage = {
    type: WsMessageType.RESP_CHAT_SUCCESS, // Reuse generic success
    wsRequestId: msg.wsRequestId,
  };
  sendResponse(ctx.ws, response);
}

export async function handleGetBuildingCategories(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqGetBuildingCategories;
  console.log(`[Gateway] Fetching building categories for company: ${req.companyName}`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_UnknownClass, async () => {
    const categories = await ctx.session.fetchBuildingCategories(req.companyName);
    const capitolIconUrl = ctx.session.getCapitolIconUrl();
    const response: WsRespBuildingCategories = {
      type: WsMessageType.RESP_BUILDING_CATEGORIES,
      wsRequestId: msg.wsRequestId,
      categories,
      capitolIconUrl,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleGetBuildingFacilities(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqGetBuildingFacilities;
  console.log(`[Gateway] Fetching facilities for category: ${req.kindName}`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_UnknownClass, async () => {
    const facilities = await ctx.session.fetchBuildingFacilities(
      req.companyName,
      req.cluster,
      req.kind,
      req.kindName,
      req.folder,
      req.tycoonLevel,
    );
    const response: WsRespBuildingFacilities = {
      type: WsMessageType.RESP_BUILDING_FACILITIES,
      wsRequestId: msg.wsRequestId,
      facilities,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handlePlaceBuilding(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqPlaceBuilding;
  console.log(`[Gateway] Placing building: ${req.facilityClass} at (${req.x}, ${req.y})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_CannotInstantiate, async () => {
    const result = await ctx.session.placeBuilding(req.facilityClass, req.x, req.y);

    if (result.success) {
      const response: WsRespBuildingPlaced = {
        type: WsMessageType.RESP_BUILDING_PLACED,
        wsRequestId: msg.wsRequestId,
        x: req.x,
        y: req.y,
        buildingId: result.buildingId || '',
      };
      sendResponse(ctx.ws, response);
    } else {
      sendError(ctx.ws, msg.wsRequestId, 'Failed to place building - check placement location and requirements', ErrorCodes.ERROR_AreaNotClear);
    }
  });
}

export async function handleBuildCapitol(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqBuildCapitol;
  console.log(`[Gateway] Build Capitol at (${req.x}, ${req.y})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.placeCapitol(req.x, req.y);

    if (result.success) {
      const response: WsRespCapitolPlaced = {
        type: WsMessageType.RESP_CAPITOL_PLACED,
        wsRequestId: msg.wsRequestId,
        x: req.x,
        y: req.y,
        buildingId: result.buildingId || '',
      };
      sendResponse(ctx.ws, response);
    } else {
      sendError(ctx.ws, msg.wsRequestId, 'Failed to place Capitol - check placement location', ErrorCodes.ERROR_AccessDenied);
    }
  });
}

export async function handleBuildingDetails(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqBuildingDetails;

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_FacilityNotFound, async () => {
    const details = await ctx.session.getBuildingBasicDetails(req.x, req.y, req.visualClass);

    const response: WsRespBuildingDetails = {
      type: WsMessageType.RESP_BUILDING_DETAILS,
      wsRequestId: msg.wsRequestId,
      details,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleBuildingTabData(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqBuildingTabData;

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_FacilityNotFound, async () => {
    const tabData = await ctx.session.getBuildingTabData(req.x, req.y, req.tabId, req.visualClass);

    const response: WsRespBuildingTabData = {
      type: WsMessageType.RESP_BUILDING_TAB_DATA,
      wsRequestId: msg.wsRequestId,
      x: req.x,
      y: req.y,
      tabId: req.tabId,
      ...tabData,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleBuildingRefreshProperties(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqBuildingRefreshProperties;

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_FacilityNotFound, async () => {
    const details = await ctx.session.refreshBuildingProperties(req.x, req.y, req.visualClass);

    const response: WsRespBuildingRefreshProperties = {
      type: WsMessageType.RESP_BUILDING_REFRESH_PROPERTIES,
      wsRequestId: msg.wsRequestId,
      details,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleBuildingSetProperty(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqBuildingSetProperty;
  console.log(`[Gateway] Setting building property ${req.propertyName}=${req.value} at (${req.x}, ${req.y})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.setBuildingProperty(
      req.x,
      req.y,
      req.propertyName,
      req.value,
      req.additionalParams,
    );

    const response: WsRespBuildingSetProperty = {
      type: WsMessageType.RESP_BUILDING_SET_PROPERTY,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      propertyName: req.propertyName,
      newValue: result.newValue,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleCloneFacility(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqCloneFacility;
  console.log(`[Gateway] Clone facility at (${req.x},${req.y}) options=0x${req.options.toString(16)}`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    ctx.session.cloneFacility(req.x, req.y, req.options);
    const response: WsRespCloneFacility = {
      type: WsMessageType.RESP_CLONE_FACILITY,
      wsRequestId: msg.wsRequestId,
      success: true,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleBuildingUpgrade(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqBuildingUpgrade;
  console.log(`[Gateway] Building upgrade action: ${req.action} at (${req.x}, ${req.y}), count: ${req.count || 'N/A'}`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.upgradeBuildingAction(
      req.x,
      req.y,
      req.action,
      req.count,
    );

    const response: WsRespBuildingUpgrade = {
      type: WsMessageType.RESP_BUILDING_UPGRADE,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      action: req.action,
      message: result.message,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleRenameFacility(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqRenameFacility;
  console.log(`[Gateway] Rename facility at (${req.x}, ${req.y}) to: "${req.newName}"`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.renameFacility(req.x, req.y, req.newName);

    const response: WsRespRenameFacility = {
      type: WsMessageType.RESP_RENAME_FACILITY,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      newName: req.newName,
      message: result.message,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleDeleteFacility(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqDeleteFacility;
  console.log(`[Gateway] Delete facility at (${req.x}, ${req.y})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.deleteFacility(req.x, req.y);

    const response: WsRespDeleteFacility = {
      type: WsMessageType.RESP_DELETE_FACILITY,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      message: result.message,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleConnectFacilities(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqConnectFacilities;
  console.log(`[Gateway] Connect facilities: source=(${req.sourceX},${req.sourceY}) target=(${req.targetX},${req.targetY})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.connectFacilitiesByCoords(
      req.sourceX, req.sourceY, req.targetX, req.targetY,
    );

    const response: WsRespConnectFacilities = {
      type: WsMessageType.RESP_CONNECT_FACILITIES,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      resultMessage: result.resultMessage,
    };
    sendResponse(ctx.ws, response);
  });
}
