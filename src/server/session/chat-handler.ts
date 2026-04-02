/**
 * Chat handler — extracted from StarpeaceSession.
 *
 * Every public function takes `ctx: SessionContext` as its first argument.
 * Private helpers (`parseChatUserList`, `parseChatChannelList`) are
 * module-private functions (not exported).
 */

import type { SessionContext } from './session-context';
import type { ChatUser } from '../../shared/types';
import { RdoVerb, RdoAction, parseAccDesc } from '../../shared/types';
import { RdoValue, RdoCommand } from '../../shared/rdo-types';
import { parsePropertyResponse as parsePropertyResponseHelper } from '../rdo-helpers';

// =========================================================================
// PRIVATE HELPERS
// =========================================================================

/**
 * Parse user list format: "name/id/status\n..."
 */
function parseChatUserList(ctx: SessionContext, rawData: string): ChatUser[] {
  const users: ChatUser[] = [];
  const lines = rawData.split(/\r?\n/).filter(l => l.trim().length > 0);

  for (const line of lines) {
    const parts = line.split('/');
    if (parts[0]?.trim()) {
      const accDescStr = parts[1]?.trim() ?? '0';
      const { nobilityPoints, modifiers, nobilityTier } = parseAccDesc(accDescStr);
      users.push({
        name: parts[0].trim(),
        id: accDescStr,
        status: parseInt(parts[2], 10) || 0,
        nobilityPoints,
        nobilityTier,
        modifiers,
      });
    }
  }

  ctx.log.debug(`[Chat] Parsed ${users.length} users`);
  return users;
}

/**
 * Parse channel list format: "channelName\npassword\n..." (alternating name/password pairs).
 * Server returns pairs: line 0=name, line 1=password, line 2=name, line 3=password, etc.
 * Returns channel names only, with "Lobby" prepended as the default main channel.
 */
function parseChatChannelList(ctx: SessionContext, rawData: string): string[] {
  const lines = rawData
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Extract only channel names (even-indexed lines: 0, 2, 4, ...)
  const channelNames: string[] = ['Lobby'];
  for (let i = 0; i < lines.length; i += 2) {
    channelNames.push(lines[i]);
  }

  ctx.log.debug(`[Chat] Parsed ${channelNames.length} channels (including Lobby)`);
  return channelNames;
}

// =========================================================================
// PUBLIC API
// =========================================================================

export async function getChatUserList(ctx: SessionContext): Promise<ChatUser[]> {
  if (!ctx.worldContextId) throw new Error('Not logged into world');

  ctx.log.debug('[Chat] Getting user list...');

  const packet = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: ctx.worldContextId,
    action: RdoAction.CALL,
    member: 'GetUserList',
    separator: '"^"'
  });

  const rawUsers = parsePropertyResponseHelper(packet.payload || '', 'res');
  return parseChatUserList(ctx, rawUsers);
}

export async function getChatChannelList(ctx: SessionContext): Promise<string[]> {
  if (!ctx.worldContextId) throw new Error('Not logged into world');

  ctx.log.debug('[Chat] Getting channel list...');

  const packet = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: ctx.worldContextId,
    action: RdoAction.CALL,
    member: 'GetChannelList',
    args: [RdoValue.string('ROOT').format()],
    separator: '"^"'
  });

  const rawChannels = parsePropertyResponseHelper(packet.payload || '', 'res');
  return parseChatChannelList(ctx, rawChannels);
}

export async function getChatChannelInfo(ctx: SessionContext, channelName: string): Promise<string> {
  if (!ctx.worldContextId) throw new Error('Not logged into world');

  ctx.log.debug(`[Chat] Getting info for channel: ${channelName}`);

  const packet = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: ctx.worldContextId,
    action: RdoAction.CALL,
    member: 'GetChannelInfo',
    args: [channelName],
    // WARN: unquoted '^' — should be '"^"' per protocol convention.
    // No issue observed as of 2026-04-02 (RdoProtocol.format() auto-quotes),
    // but inconsistent with the rest of the codebase. Fix if chat breaks.
    separator: '^'
  });

  return parsePropertyResponseHelper(packet.payload || '', 'res');
}

export async function joinChatChannel(ctx: SessionContext, channelName: string): Promise<void> {
  if (!ctx.worldContextId) throw new Error('Not logged into world');

  const displayName = channelName || 'Lobby';
  ctx.log.debug(`[Chat] Joining channel: ${displayName}`);

  const packet = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: ctx.worldContextId,
    action: RdoAction.CALL,
    member: 'JoinChannel',
    args: [channelName, ''],
    // WARN: unquoted '^' — should be '"^"' per protocol convention.
    // No issue observed as of 2026-04-02 (RdoProtocol.format() auto-quotes),
    // but inconsistent with the rest of the codebase. Fix if chat breaks.
    separator: '^'
  });

  const result = parsePropertyResponseHelper(packet.payload || '', 'res');
  if (result !== '0') {
    throw new Error(`Failed to join channel: ${result}`);
  }

  ctx.setCurrentChannel(channelName);
  ctx.log.debug(`[Chat] Successfully joined: ${displayName}`);
}

export async function sendChatMessage(ctx: SessionContext, message: string): Promise<void> {
  if (!ctx.worldContextId) throw new Error('Not logged into world');
  if (!message.trim()) return;

  ctx.log.debug(`[Chat] Sending message: ${message}`);

  // WARN: sendRdoRequest() + separator '*' adds a QueryId to a void push.
  // Per RDO rules this risks crashing the Delphi server (see building-property-handler.ts fix).
  // No issue observed as of 2026-04-02 — the mail server may tolerate QueryId on void calls.
  // If chat sends start crashing the server, switch to socket.write() with .push() (no RID).
  await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: ctx.worldContextId,
    action: RdoAction.CALL,
    member: 'SayThis',
    args: ['', message],
    separator: '*'
  });
}

export async function setChatTypingStatus(ctx: SessionContext, isTyping: boolean): Promise<void> {
  if (!ctx.worldContextId) throw new Error('Not logged into world');

  const status = isTyping ? 1 : 0;

  // Send as push command (no await needed)
  const socket = ctx.getSocket('world');
  if (socket) {
    const cmd = RdoCommand.sel(ctx.worldContextId!)
      .call('MsgCompositionChanged')
      .push()
      .args(RdoValue.int(status))
      .build();
    socket.write(cmd);
  }
}

/**
 * Get current channel name.
 *
 * NOTE: Requires `readonly currentChannel: string | null` on SessionContext.
 * Add it to session-context.ts if not already present.
 */
export function getCurrentChannel(ctx: SessionContext): string {
  return (ctx as SessionContext & { currentChannel: string | null }).currentChannel || 'Lobby';
}
