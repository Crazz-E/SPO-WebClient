import {
  WsMessageType,
  type WsMessage,
  type WsReqBuildRoad,
  type WsRespBuildRoad,
  type WsReqGetRoadCost,
  type WsRespGetRoadCost,
  type WsReqDemolishRoad,
  type WsRespDemolishRoad,
  type WsReqDemolishRoadArea,
  type WsRespDemolishRoadArea,
} from '../../shared/types';
import * as ErrorCodes from '../../shared/error-codes';
import type { WsHandlerContext } from './types';
import { sendResponse, withErrorHandler } from './ws-utils';

export async function handleBuildRoad(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqBuildRoad;
  console.log(`[Gateway] Build road from (${req.x1}, ${req.y1}) to (${req.x2}, ${req.y2})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.buildRoad(req.x1, req.y1, req.x2, req.y2, req.tileFacts);

    const response: WsRespBuildRoad = {
      type: WsMessageType.RESP_BUILD_ROAD,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      cost: result.cost,
      tileCount: result.tileCount,
      message: result.message,
      errorCode: result.errorCode,
      partial: result.partial,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleGetRoadCost(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqGetRoadCost;
  console.log(`[Gateway] Get road cost from (${req.x1}, ${req.y1}) to (${req.x2}, ${req.y2})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_Unknown, async () => {
    const result = ctx.session.getRoadCostEstimate(req.x1, req.y1, req.x2, req.y2, req.tileFacts);

    const response: WsRespGetRoadCost = {
      type: WsMessageType.RESP_GET_ROAD_COST,
      wsRequestId: msg.wsRequestId,
      cost: result.cost,
      tileCount: result.tileCount,
      costPerTile: result.costPerTile,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleDemolishRoad(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqDemolishRoad;
  console.log(`[Gateway] Demolish road at (${req.x}, ${req.y})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.demolishRoad(req.x, req.y);

    const response: WsRespDemolishRoad = {
      type: WsMessageType.RESP_DEMOLISH_ROAD,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      message: result.message,
      errorCode: result.errorCode,
    };
    sendResponse(ctx.ws, response);
  });
}

export async function handleDemolishRoadArea(ctx: WsHandlerContext, msg: WsMessage): Promise<void> {
  const req = msg as WsReqDemolishRoadArea;
  console.log(`[Gateway] Demolish road area (${req.x1}, ${req.y1}) to (${req.x2}, ${req.y2})`);

  await withErrorHandler(ctx.ws, msg.wsRequestId, ErrorCodes.ERROR_AccessDenied, async () => {
    const result = await ctx.session.wipeCircuit(req.x1, req.y1, req.x2, req.y2);

    const response: WsRespDemolishRoadArea = {
      type: WsMessageType.RESP_DEMOLISH_ROAD_AREA,
      wsRequestId: msg.wsRequestId,
      success: result.success,
      message: result.message,
      errorCode: result.errorCode,
    };
    sendResponse(ctx.ws, response);
  });
}
