import {
  WsMessageType,
  type WsMessage,
  type WsReqNewspaperBoard,
  type WsRespNewspaperBoard,
  type WsReqNewspaperPost,
  type WsRespNewspaperPost,
} from '../../shared/types';
import type { NewspaperTarget } from '../session/newspaper-handler';
import type { WsHandlerContext, WsHandler } from './types';
import { sendResponse } from './ws-utils';

function targetOf(req: WsReqNewspaperBoard | WsReqNewspaperPost): NewspaperTarget {
  return {
    paperName: req.paperName,
    townName: req.townName,
    isCapitol: req.isCapitol,
    buildingX: req.buildingX,
    buildingY: req.buildingY,
  };
}

export const handleNewspaperBoard: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqNewspaperBoard;
  console.log(`[Gateway] Reading newspaper: ${req.paperName}${req.path ? ` (${req.path})` : ''}`);
  const board = await ctx.session.getNewspaperBoard(targetOf(req), req.path);
  const response: WsRespNewspaperBoard = {
    type: WsMessageType.RESP_NEWSPAPER_BOARD,
    wsRequestId: msg.wsRequestId,
    board,
  };
  sendResponse(ctx.ws, response);
};

export const handleNewspaperPost: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqNewspaperPost;
  console.log(`[Gateway] Posting a column to ${req.paperName}`);
  const result = await ctx.session.postNewspaperColumn(
    targetOf(req), req.subject, req.body, req.replyToPath,
  );
  const response: WsRespNewspaperPost = {
    type: WsMessageType.RESP_NEWSPAPER_POST,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    message: result.message,
    board: result.board,
  };
  sendResponse(ctx.ws, response);
};
