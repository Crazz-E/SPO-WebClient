/**
 * Chat Handler — extracted from StarpeaceClient.
 *
 * Handles chat messages, typing status, channel management, and user list.
 */

import {
  WsMessageType,
  WsMessage,
  WsReqChatSendMessage,
  WsReqChatGetUsers,
  WsRespChatUserList,
  WsReqChatGetChannels,
  WsRespChatChannelList,
  WsReqChatJoinChannel,
  WsReqChatTypingStatus
} from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { ClientBridge } from '../bridge/client-bridge';
import type { ClientHandlerContext } from './client-context';

export async function sendChatMessage(ctx: ClientHandlerContext, message: string): Promise<void> {
  if (ctx.isSendingChatMessage) return;

  // GM chat: messages starting with /gm are broadcast to all players
  if (message.startsWith('/gm ')) {
    const gmMessage = message.substring(4).trim();
    if (gmMessage) {
      ctx.sendMessage({
        type: WsMessageType.REQ_GM_CHAT_SEND,
        message: gmMessage,
      } as WsMessage);
    }
    return;
  }

  ctx.isSendingChatMessage = true;

  try {
    const req: WsReqChatSendMessage = {
      type: WsMessageType.REQ_CHAT_SEND_MESSAGE,
      message
    };
    await ctx.sendRequest(req);
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to send message: ${toErrorMessage(err)}`);
  } finally {
    ctx.isSendingChatMessage = false;
  }
}

/**
 * Tell the world whether we are composing a message.
 *
 * Fire-and-forget on purpose: the gateway turns this into `MsgCompositionChanged`,
 * a void RDO push that answers nothing, and a lost notice must never cost the
 * user a keystroke. Only the two transitions go out — never one frame per
 * character — which is what the flag guards.
 */
export function setTypingStatus(ctx: ClientHandlerContext, isTyping: boolean): void {
  if (ctx.isTypingInChat === isTyping) return;
  ctx.isTypingInChat = isTyping;

  const req: WsReqChatTypingStatus = {
    type: WsMessageType.REQ_CHAT_TYPING_STATUS,
    isTyping,
  };
  ctx.sendMessage(req);
}

export async function requestUserList(ctx: ClientHandlerContext): Promise<void> {
  try {
    const req: WsReqChatGetUsers = {
      type: WsMessageType.REQ_CHAT_GET_USERS
    };
    const resp = (await ctx.sendRequest(req)) as WsRespChatUserList;
    ClientBridge.setChatUsers(resp.users);
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to get user list: ${toErrorMessage(err)}`);
  }
}

export async function initChatChannels(ctx: ClientHandlerContext): Promise<void> {
  await requestChannelList(ctx);
  await joinChannel(ctx, '');
  ClientBridge.setCurrentChannel('Lobby');
  await requestUserList(ctx);
}

async function requestChannelList(ctx: ClientHandlerContext): Promise<void> {
  try {
    const req: WsReqChatGetChannels = {
      type: WsMessageType.REQ_CHAT_GET_CHANNELS
    };
    const resp = (await ctx.sendRequest(req)) as WsRespChatChannelList;
    ClientBridge.setChatChannels(resp.channels);
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to get channel list: ${toErrorMessage(err)}`);
  }
}

export async function joinChannel(ctx: ClientHandlerContext, channelName: string): Promise<void> {
  if (ctx.isJoiningChannel) return;

  ctx.isJoiningChannel = true;

  try {
    ClientBridge.log('Chat', `Joining channel: ${channelName || 'Lobby'}`);
    ClientBridge.setCurrentChannel(channelName);
    const req: WsReqChatJoinChannel = {
      type: WsMessageType.REQ_CHAT_JOIN_CHANNEL,
      channelName
    };
    await ctx.sendRequest(req);
  } catch (err: unknown) {
    ClientBridge.log('Error', `Failed to join channel: ${toErrorMessage(err)}`);
  } finally {
    ctx.isJoiningChannel = false;
  }
}
