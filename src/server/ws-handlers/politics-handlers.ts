import {
  WsMessageType,
  type WsMessage,
  type WsReqPoliticsData,
  type WsRespPoliticsData,
  type WsReqPoliticsVote,
  type WsRespPoliticsVote,
  type WsReqPoliticsLaunchCampaign,
  type WsRespPoliticsLaunchCampaign,
  type WsReqPoliticsCancelCampaign,
  type WsRespPoliticsCancelCampaign,
  type WsReqPoliticsSetRating,
  type WsRespPoliticsSetRating,
  type WsReqPoliticsSetPublicity,
  type WsRespPoliticsSetPublicity,
  type WsReqPoliticsSetProject,
  type WsRespPoliticsSetProject,
  type WsReqTycoonRole,
  type WsRespTycoonRole,
} from '../../shared/types';
import type { WsHandlerContext, WsHandler } from './types';
import { sendResponse } from './ws-utils';

export const handlePoliticsData: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsData;
  console.log(`[Gateway] Getting politics data for ${req.isCapitol ? 'the Capitol' : `town: ${req.townName}`}`);
  const data = await ctx.session.getPoliticsData(req.townName, req.buildingX, req.buildingY, req.isCapitol ?? false);
  const response: WsRespPoliticsData = {
    type: WsMessageType.RESP_POLITICS_DATA,
    wsRequestId: msg.wsRequestId,
    data,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsVote: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsVote;
  console.log(`[Gateway] Voting for ${req.candidateName}`);
  const result = await ctx.session.politicsVote(req.buildingX, req.buildingY, req.candidateName);
  const response: WsRespPoliticsVote = {
    type: WsMessageType.RESP_POLITICS_VOTE,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsLaunchCampaign: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsLaunchCampaign;
  console.log(`[Gateway] Launching political campaign`);
  const result = await ctx.session.politicsLaunchCampaign(req.buildingX, req.buildingY, req.townName);
  const response: WsRespPoliticsLaunchCampaign = {
    type: WsMessageType.RESP_POLITICS_LAUNCH_CAMPAIGN,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsCancelCampaign: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsCancelCampaign;
  console.log(`[Gateway] Cancelling political campaign`);
  const result = await ctx.session.politicsCancelCampaign(req.buildingX, req.buildingY, req.townName);
  const response: WsRespPoliticsCancelCampaign = {
    type: WsMessageType.RESP_POLITICS_CANCEL_CAMPAIGN,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsSetRating: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsSetRating;
  console.log(`[Gateway] Rating ${req.ratingId} = ${req.value}%`);
  const result = await ctx.session.politicsSetRating(req.buildingX, req.buildingY, req.ratingId, req.value);
  const response: WsRespPoliticsSetRating = {
    type: WsMessageType.RESP_POLITICS_SET_RATING,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    ratingId: req.ratingId,
    value: req.value,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsSetPublicity: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsSetPublicity;
  console.log(`[Gateway] Publicity ${req.ratingId} = ${req.value}`);
  const result = await ctx.session.politicsSetPublicity(req.buildingX, req.buildingY, req.ratingId, req.value);
  const response: WsRespPoliticsSetPublicity = {
    type: WsMessageType.RESP_POLITICS_SET_PUBLICITY,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    ratingId: req.ratingId,
    value: req.value,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsSetProject: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsSetProject;
  console.log(`[Gateway] Campaign project ${req.projectId}`);
  const result = await ctx.session.politicsSetProjectData(req.buildingX, req.buildingY, req.projectId, req.data);
  const response: WsRespPoliticsSetProject = {
    type: WsMessageType.RESP_POLITICS_SET_PROJECT,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    projectId: req.projectId,
    data: req.data,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handleTycoonRole: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqTycoonRole;
  console.log(`[Gateway] Querying political role for: ${req.tycoonName}`);
  const role = await ctx.session.queryTycoonPoliticalRole(req.tycoonName);
  const response: WsRespTycoonRole = {
    type: WsMessageType.RESP_TYCOON_ROLE,
    wsRequestId: msg.wsRequestId,
    role,
  };
  sendResponse(ctx.ws, response);
};
