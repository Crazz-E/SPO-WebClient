/**
 * Mail handler — extracted from StarpeaceSession.
 *
 * Every exported function takes `ctx: SessionContext` as first argument.
 * Private helpers are module-private functions.
 */

import type { SessionContext } from './session-context';
import type { MailMessageHeader, MailMessageFull, MailAttachment } from '../../shared/types';
import type { MailFolder } from '../../shared/types/domain-types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { RdoValue } from '../../shared/rdo-types';
import { parsePropertyResponse as parsePropertyResponseHelper } from '../rdo-helpers';
import { parseMessageListHtml } from '../mail-list-parser';
import { toErrorMessage } from '../../shared/error-utils';
import fetch from 'node-fetch';

// ── Private Helpers ────────────────────────────────────────────────────────

/**
 * Parse ini-style mail headers text into MailMessageHeader.
 * Headers format: key=value per line (from TStringList)
 */
function parseMailHeaders(headersText: string): MailMessageHeader {
  const headers: Record<string, string> = {};
  for (const line of headersText.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.substring(0, eqIdx).trim();
      const value = line.substring(eqIdx + 1).trim();
      headers[key] = value;
    }
  }

  return {
    messageId: headers['MessageId'] || '',
    fromAddr: headers['FromAddr'] || '',
    toAddr: headers['ToAddr'] || '',
    from: headers['From'] || '',
    to: headers['To'] || '',
    subject: headers['Subject'] || '',
    date: headers['Date'] || '',
    dateFmt: headers['DateFmt'] || '',
    read: headers['Read'] === '1',
    stamp: parseInt(headers['Stamp'] || '0', 10),
    noReply: headers['NoReply'] === '1',
  };
}

/**
 * Parse attachment properties text into MailAttachment.
 * Format: key=value per line (from TAttachment properties TStringList)
 */
function parseMailAttachment(attachText: string): MailAttachment {
  const props: Record<string, string> = {};
  for (const line of attachText.split('\n')) {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.substring(0, eqIdx).trim();
      const value = line.substring(eqIdx + 1).trim();
      props[key] = value;
    }
  }

  const cls = props['Class'] || '';
  const executed = props['Executed'] === 'Yes';
  delete props['Class'];
  delete props['Executed'];

  return { class: cls, properties: props, executed };
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function composeMail(
  ctx: SessionContext,
  to: string,
  subject: string,
  bodyLines: string[],
  headers?: string
): Promise<boolean> {
  await ctx.ensureMailConnection();
  if (!ctx.mailServerId || !ctx.mailAccount) {
    throw new Error('Mail service not connected');
  }

  const worldName = ctx.currentWorldInfo?.name || '';

  // 1. Create in-memory message
  const newMailPacket = await ctx.sendRdoRequest('mail', {
    verb: RdoVerb.SEL,
    targetId: ctx.mailServerId,
    action: RdoAction.CALL,
    member: 'NewMail',
    args: [
      RdoValue.string(ctx.mailAccount).toString(),
      RdoValue.string(to).toString(),
      RdoValue.string(subject).toString()
    ]
  });
  const msgId = parsePropertyResponseHelper(newMailPacket.payload!, 'NewMail');
  ctx.log.debug(`[Mail] Created message, msgId: ${msgId}`);

  if (!msgId || msgId === '0') {
    ctx.log.error('[Mail] Failed to create message');
    return false;
  }

  // 2a. Add original headers for reply/forward threading
  if (headers) {
    await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: msgId,
      action: RdoAction.CALL,
      member: 'AddHeaders',
      args: [RdoValue.string(headers).toString()],
      separator: '*'  // void procedure (Delphi: procedure AddHeaders)
    });
  }

  // 2b. Add body lines
  for (const line of bodyLines) {
    await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: msgId,
      action: RdoAction.CALL,
      member: 'AddLine',
      args: [RdoValue.string(line).toString()],
      separator: '*'  // void procedure (Delphi: procedure AddLine)
    });
  }

  // 3. Post (send) the message
  const postPacket = await ctx.sendRdoRequest('mail', {
    verb: RdoVerb.SEL,
    targetId: ctx.mailServerId,
    action: RdoAction.CALL,
    member: 'Post',
    args: [RdoValue.string(worldName).toString(), RdoValue.int(parseInt(msgId, 10)).toString()]
  });
  // Post returns wordbool: #-1 = true (success), #0 = false (failure)
  const resultStr = parsePropertyResponseHelper(postPacket.payload!, 'Post');
  const success = resultStr === '-1';
  ctx.log.debug(`[Mail] Post result: ${resultStr} (success=${success})`);

  // 4. Close message to release server memory (MsgComposerHandler.pas:331)
  try {
    await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: ctx.mailServerId,
      action: RdoAction.CALL,
      member: 'CloseMessage',
      args: [RdoValue.int(parseInt(msgId, 10)).toString()],
      separator: '*'  // void procedure (Delphi: procedure CloseMessage)
    });
  } catch (e) {
    ctx.log.warn('[Mail] Failed to close message after post:', e);
  }

  return success;
}

/**
 * Save a mail message as draft (not sent).
 * Reference: MsgComposerHandler.pas:346-387
 * Flow: [DeleteMessage old draft?] -> NewMail -> AddHeaders? -> AddLine (per line) -> Save -> CloseMessage
 */
export async function saveDraft(
  ctx: SessionContext,
  to: string,
  subject: string,
  bodyLines: string[],
  headers?: string,
  existingDraftId?: string
): Promise<boolean> {
  await ctx.ensureMailConnection();
  if (!ctx.mailServerId || !ctx.mailAccount) {
    throw new Error('Mail service not connected');
  }

  const worldName = ctx.currentWorldInfo?.name || '';

  // If editing existing draft, delete old one first
  if (existingDraftId) {
    await deleteMailMessage(ctx, 'Draft', existingDraftId);
  }

  // 1. Create in-memory message
  const newMailPacket = await ctx.sendRdoRequest('mail', {
    verb: RdoVerb.SEL,
    targetId: ctx.mailServerId,
    action: RdoAction.CALL,
    member: 'NewMail',
    args: [
      RdoValue.string(ctx.mailAccount).toString(),
      RdoValue.string(to).toString(),
      RdoValue.string(subject).toString()
    ]
  });
  const msgId = parsePropertyResponseHelper(newMailPacket.payload!, 'NewMail');

  if (!msgId || msgId === '0') {
    ctx.log.error('[Mail] Failed to create draft message');
    return false;
  }

  // 2. Add original headers for reply/forward threading
  if (headers) {
    await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: msgId,
      action: RdoAction.CALL,
      member: 'AddHeaders',
      args: [RdoValue.string(headers).toString()],
      separator: '*'  // void procedure (Delphi: procedure AddHeaders)
    });
  }

  // 3. Add body lines
  for (const line of bodyLines) {
    await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: msgId,
      action: RdoAction.CALL,
      member: 'AddLine',
      args: [RdoValue.string(line).toString()],
      separator: '*'  // void procedure (Delphi: procedure AddLine)
    });
  }

  // 4. Save to Draft folder (not Post/send)
  const savePacket = await ctx.sendRdoRequest('mail', {
    verb: RdoVerb.SEL,
    targetId: ctx.mailServerId,
    action: RdoAction.CALL,
    member: 'Save',
    args: [RdoValue.string(worldName).toString(), RdoValue.int(parseInt(msgId, 10)).toString()]
  });
  // Save returns wordbool: #-1 = true (success), #0 = false (failure)
  const resultStr = parsePropertyResponseHelper(savePacket.payload!, 'Save');
  const success = resultStr === '-1';
  ctx.log.debug(`[Mail] Save draft result: ${resultStr} (success=${success})`);

  // 5. Close message to release server memory
  try {
    await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: ctx.mailServerId,
      action: RdoAction.CALL,
      member: 'CloseMessage',
      args: [RdoValue.int(parseInt(msgId, 10)).toString()],
      separator: '*'  // void procedure (Delphi: procedure CloseMessage)
    });
  } catch (e) {
    ctx.log.warn('[Mail] Failed to close message after save:', e);
  }

  return success;
}

/**
 * Open and read a mail message.
 * Reference: MsgComposerHandler.pas:416-420
 * Flow: OpenMessage -> GetHeaders -> GetLines -> GetAttachmentCount -> GetAttachment -> CloseMessage
 */
export async function readMailMessage(
  ctx: SessionContext,
  folder: string,
  messageId: string
): Promise<MailMessageFull> {
  await ctx.ensureMailConnection();
  if (!ctx.mailServerId || !ctx.mailAccount) {
    throw new Error('Mail service not connected');
  }

  const worldName = ctx.currentWorldInfo?.name || '';

  // 1. Open message (loads from disk into server memory)
  const openPacket = await ctx.sendRdoRequest('mail', {
    verb: RdoVerb.SEL,
    targetId: ctx.mailServerId,
    action: RdoAction.CALL,
    member: 'OpenMessage',
    args: [
      RdoValue.string(worldName).toString(),
      RdoValue.string(ctx.mailAccount).toString(),
      RdoValue.string(folder).toString(),
      RdoValue.string(messageId).toString()
    ]
  });
  const msgId = parsePropertyResponseHelper(openPacket.payload!, 'OpenMessage');
  ctx.log.debug(`[Mail] Opened message, msgId: ${msgId}`);

  try {
    // 2. Get headers (ini-style key=value text)
    const headersPacket = await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: msgId,
      action: RdoAction.CALL,
      member: 'GetHeaders',
      args: [RdoValue.int(0).toString()]
    });
    const headersText = parsePropertyResponseHelper(headersPacket.payload || '', 'res');

    // 3. Get body lines
    const linesPacket = await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: msgId,
      action: RdoAction.CALL,
      member: 'GetLines',
      args: [RdoValue.int(0).toString()]
    });
    const bodyText = parsePropertyResponseHelper(linesPacket.payload || '', 'res');

    // 4. Get attachments
    const attachCountPacket = await ctx.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: msgId,
      action: RdoAction.CALL,
      member: 'GetAttachmentCount',
      args: [RdoValue.int(0).toString()]
    });
    const attachCountStr = parsePropertyResponseHelper(attachCountPacket.payload!, 'GetAttachmentCount');
    const attachCount = parseInt(attachCountStr, 10) || 0;

    const attachments: MailAttachment[] = [];
    for (let i = 0; i < attachCount; i++) {
      const attachPacket = await ctx.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: msgId,
        action: RdoAction.CALL,
        member: 'GetAttachment',
        args: [RdoValue.int(i).toString()]
      });
      const attachText = attachPacket.payload || '';
      attachments.push(parseMailAttachment(attachText));
    }

    // Parse headers and body into structured format
    const parsedHeaders = parseMailHeaders(headersText);

    return {
      ...parsedHeaders,
      messageId,
      body: bodyText.split('\n').filter(l => l.length > 0),
      attachments,
    };
  } finally {
    // 5. Always close message to release server memory
    try {
      await ctx.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: ctx.mailServerId,
        action: RdoAction.CALL,
        member: 'CloseMessage',
        args: [RdoValue.int(parseInt(msgId, 10)).toString()],
        separator: '*'  // void procedure (Delphi: procedure CloseMessage)
      });
    } catch (e) {
      ctx.log.warn('[Mail] Failed to close message:', e);
    }
  }
}

/**
 * Delete a mail message from a folder.
 */
export async function deleteMailMessage(
  ctx: SessionContext,
  folder: string,
  messageId: string
): Promise<void> {
  await ctx.ensureMailConnection();
  if (!ctx.mailServerId || !ctx.mailAccount) {
    throw new Error('Mail service not connected');
  }

  const worldName = ctx.currentWorldInfo?.name || '';

  await ctx.sendRdoRequest('mail', {
    verb: RdoVerb.SEL,
    targetId: ctx.mailServerId,
    action: RdoAction.CALL,
    member: 'DeleteMessage',
    args: [
      RdoValue.string(worldName).toString(),
      RdoValue.string(ctx.mailAccount).toString(),
      RdoValue.string(folder).toString(),
      RdoValue.string(messageId).toString()
    ],
    separator: '*'  // void procedure (Delphi: procedure DeleteMessage)
  });
  ctx.log.debug(`[Mail] Deleted message ${messageId} from ${folder}`);
}

/**
 * Get unread mail count for Inbox.
 * Reference: InterfaceServer.pas:4345 -- CountUnreadMessages proxies CheckNewMail
 * Note: CheckNewMail takes ServerId (from LogServerOn) + Account. Since we're
 * not an InterfaceServer, we pass 0 as ServerId (the MailServer uses it for
 * routing notifications, which we don't need for a count query).
 */
export async function getMailUnreadCount(ctx: SessionContext): Promise<number> {
  await ctx.ensureMailConnection();
  if (!ctx.mailServerId || !ctx.mailAccount) {
    throw new Error('Mail service not connected');
  }

  const packet = await ctx.sendRdoRequest('mail', {
    verb: RdoVerb.SEL,
    targetId: ctx.mailServerId,
    action: RdoAction.CALL,
    member: 'CheckNewMail',
    args: [RdoValue.int(0).toString(), RdoValue.string(ctx.mailAccount).toString()]
  });
  const countStr = parsePropertyResponseHelper(packet.payload!, 'CheckNewMail');
  return parseInt(countStr, 10) || 0;
}

/**
 * Get mail account address.
 */
export function getMailAccount(ctx: SessionContext): string | null {
  return ctx.mailAccount;
}

/**
 * Fetch mail folder listing via HTTP (MessageList.asp on World Web Server).
 * The original Voyager used ASP pages backed by a COM MailBrowser DLL
 * to enumerate mail directories -- there is no RDO method for folder listing.
 */
export async function getMailFolder(
  ctx: SessionContext,
  folder: string
): Promise<MailMessageHeader[]> {
  if (!ctx.currentWorldInfo || !ctx.mailAccount) {
    ctx.log.warn('[Mail] Cannot fetch folder: not logged into world or no mail account');
    return [];
  }

  const params = new URLSearchParams({
    Folder: folder,
    WorldName: ctx.currentWorldInfo.name,
    Account: ctx.mailAccount,
    MsgId: '',
    Action: '',
  });

  const url = `http://${ctx.currentWorldInfo.ip}/five/0/visual/voyager/mail/MessageList.asp?${params.toString().replace(/\+/g, '%20')}`;
  ctx.log.debug(`[Mail] Fetching folder listing from ${url}`);

  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      ctx.log.warn(`[Mail] MessageList.asp returned ${response.status}`);
      return [];
    }
    const html = await response.text();
    const folderType = folder as MailFolder;
    return parseMessageListHtml(html, folderType);
  } catch (e) {
    ctx.log.error('[Mail] Failed to fetch folder listing:', toErrorMessage(e));
    return [];
  }
}
