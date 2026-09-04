/**
 * Parser for MessageList.asp HTML responses from the World Web Server.
 *
 * The original Voyager client loaded mail folder listings via ASP pages
 * backed by a COM MailBrowser DLL. This parser scrapes the HTML table
 * to extract MailMessageHeader[] for our WebSocket-based client.
 *
 * HTML structure (from live capture):
 *   <table id="MsgTable">
 *     <tr> <!-- header row: From/To, Subject, Date -->
 *     <tr id="row_0" msgId=2691B06053334348R>
 *       <td> <input id="msgReply0" type=hidden value=""> </td>
 *       <td> <span class=mailFolderItem> Person Name </span> </td>
 *       <td> <span class=mailFolderItem> Subject </span> </td>
 *       <td> <span class=mailFolderItem> <input id="msgDate0" type=hidden value="3/9/2244"> </span> </td>
 *     </tr>
 *   </table>
 *   <input id="MsgCount" type=hidden value="1">
 */

import type { MailMessageHeader, MailFolder } from '../shared/types/domain-types';

/**
 * Parse a MessageList.asp HTML response into MailMessageHeader[].
 * Returns empty array on malformed or empty HTML (graceful degradation).
 */
export function parseMessageListHtml(html: string, folder: MailFolder): MailMessageHeader[] {
  const messages: MailMessageHeader[] = [];

  if (!html || typeof html !== 'string') {
    return messages;
  }

  // Match <tr> elements that have a msgId attribute (message rows, not header row)
  // msgId can be quoted or unquoted: msgId=ABC123 or msgId="ABC123"
  const rowRegex = /<tr\b[^>]*\bmsgId\s*=\s*"?([^"\s>]+)"?[^>]*>([\s\S]*?)<\/tr>/gi;

  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const messageId = match[1];
    const rowHtml = match[2];

    // Extract person name and subject from <span class=mailFolderItem> elements
    // There are 2-3 spans per row: name, subject, and optionally date display
    const spanRegex = /<span\s+class\s*=\s*"?mailFolderItem(?:Bold)?"?\s*[^>]*>([\s\S]*?)<\/span>/gi;
    const spans: string[] = [];
    let spanMatch;
    while ((spanMatch = spanRegex.exec(rowHtml)) !== null) {
      // Strip inner HTML tags (like hidden inputs) and trim whitespace
      const text = spanMatch[1].replace(/<[^>]*>/g, '').trim();
      spans.push(text);
    }

    const personName = spans[0] || '';
    const subject = spans[1] || '';

    // Extract raw date from hidden input: <input id="msgDate{i}" ... value="3/9/2244">
    const dateMatch = rowHtml.match(
      /<input\b[^>]*\bid\s*=\s*"?msgDate\d+"?[^>]*\bvalue\s*=\s*"?([^">\s]*)"?/i
    );
    const dateFmt = dateMatch?.[1] || '';

    // Extract noReply from hidden input: <input id="msgReply{i}" ... value="">
    // Empty value = reply allowed, "1" = no reply
    const replyMatch = rowHtml.match(
      /<input\b[^>]*\bid\s*=\s*"?msgReply\d+"?[^>]*\bvalue\s*=\s*"?([^">\s]*)"?/i
    );
    const noReply = replyMatch?.[1] === '1';

    // Detect read status: unread messages may have mailFolderItemBold class
    // or an unread envelope image in the first column
    const isUnread = /mailFolderItemBold/i.test(rowHtml)
      || /unread/i.test(rowHtml)
      || /newmail/i.test(rowHtml);

    // Sent and Draft are outgoing folders: the person column is the recipient.
    // Inbox is the only incoming folder: the person column is the sender.
    const lower = folder.toLowerCase();
    const isOutgoingFolder = lower === 'sent' || lower === 'draft';

    const header: MailMessageHeader = {
      messageId,
      fromAddr: '',     // Not available from listing HTML
      toAddr: '',       // Not available from listing HTML
      from: isOutgoingFolder ? '' : personName,
      to: isOutgoingFolder ? personName : '',
      subject,
      date: '',         // Raw float not in listing HTML
      dateFmt,
      read: !isUnread,
      stamp: 0,         // Not in listing HTML
      noReply,
    };

    messages.push(header);
  }

  return messages;
}
