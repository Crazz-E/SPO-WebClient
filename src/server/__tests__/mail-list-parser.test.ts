/**
 * Tests for MessageList.asp HTML parser.
 * HTML format is based on live captures from the SPO World Web Server.
 */

import { describe, it, expect } from '@jest/globals';
import { parseMessageListHtml } from '../mail-list-parser';

// Realistic HTML from live capture of MessageList.asp (Sent folder, 1 message)
const SENT_FOLDER_HTML = `<html>
<head>
	<title>FIVE Logon</title>
	<link rel="STYLESHEET" href="mail.css" type="text/css">
	<link rel="STYLESHEET" href="../voyager.css" type="text/css">
</head>
<script language="JScript">
	var selectedRow = null;
	function selectRow(row) {}
	function onRowClick() {}
	function onRowDblClick() {}
</script>
<body style="background-color: #395950; margin: 0px; padding: 0px">
<div id=everything style="display: none"></div>
<table id="MsgTable" width="100%" cellpadding="0" cellspacing="0">
	<tr style="background-image: url(images/listtopback.gif)">
		<td width=10% height=20></td>
		<td class=mailFolderHeader width="20%">To</td>
		<td class=mailFolderHeader qwidth="50%">Subject</td>
		<td class=mailFolderHeader qwidth="20%">Date</td>
	</tr>

	<tr id="row_0" onClick="onRowClick()" onDblClick="onRowDblClick()" msgId=2691B06053334348R>
		<td align="right" valign="top" style="padding-left: 40px; padding-right: 20px">
			<input id="msgReply0" name="msgReply0" type=hidden value="">
		</td>
		<td valign="top">
			<span class=mailFolderItem>
			Mayor of Olympus
			</span>
		</td>
		<td valign="top" nowrap=true>
			<span class=mailFolderItem>
			test subjct
			</span>
		</td>
		<td valign="top">
			<span class=mailFolderItem id="dateRow0" name="dateRow0">
				<input id="msgDate0" name="msgDate0" type=hidden value="3/9/2244">
			</span>
		</td>
	</tr>

</table>
<input id="MsgCount" name="MsgCount" type=hidden value="1">
</body>
</html>`;

// Inbox-style HTML with 2 messages (one read, one unread with bold class)
const INBOX_FOLDER_HTML = `<html>
<head><title>FIVE Logon</title></head>
<body>
<table id="MsgTable" width="100%" cellpadding="0" cellspacing="0">
	<tr style="background-image: url(images/listtopback.gif)">
		<td width=10% height=20></td>
		<td class=mailFolderHeader width="20%">From</td>
		<td class=mailFolderHeader>Subject</td>
		<td class=mailFolderHeader>Date</td>
	</tr>

	<tr id="row_0" onClick="onRowClick()" msgId=MSG001>
		<td>
			<input id="msgReply0" name="msgReply0" type=hidden value="">
		</td>
		<td valign="top">
			<span class=mailFolderItemBold>
			Alice Tycoon
			</span>
		</td>
		<td valign="top">
			<span class=mailFolderItemBold>
			Important business proposal
			</span>
		</td>
		<td valign="top">
			<span class=mailFolderItemBold id="dateRow0">
				<input id="msgDate0" name="msgDate0" type=hidden value="2/15/2244">
			</span>
		</td>
	</tr>

	<tr id="row_1" onClick="onRowClick()" msgId=MSG002>
		<td>
			<input id="msgReply1" name="msgReply1" type=hidden value="1">
		</td>
		<td valign="top">
			<span class=mailFolderItem>
			System
			</span>
		</td>
		<td valign="top">
			<span class=mailFolderItem>
			Welcome to Shamba
			</span>
		</td>
		<td valign="top">
			<span class=mailFolderItem id="dateRow1">
				<input id="msgDate1" name="msgDate1" type=hidden value="1/1/2244">
			</span>
		</td>
	</tr>

</table>
<input id="MsgCount" name="MsgCount" type=hidden value="2">
</body>
</html>`;

describe('parseMessageListHtml', () => {
  describe('Sent folder parsing', () => {
    it('should extract one message from Sent folder HTML', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages).toHaveLength(1);
    });

    it('should extract messageId from msgId attribute', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].messageId).toBe('2691B06053334348R');
    });

    it('should assign person name to "to" field for Sent folder', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].to).toBe('Mayor of Olympus');
      expect(messages[0].from).toBe('');
    });

    it('should extract subject text', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].subject).toBe('test subjct');
    });

    it('should extract date from hidden input', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].dateFmt).toBe('3/9/2244');
    });

    it('should mark as read (no unread indicator)', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].read).toBe(true);
    });

    it('should set noReply to false (empty msgReply value)', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].noReply).toBe(false);
    });
  });

  describe('Inbox folder parsing', () => {
    it('should extract two messages from Inbox folder HTML', () => {
      const messages = parseMessageListHtml(INBOX_FOLDER_HTML, 'Inbox');
      expect(messages).toHaveLength(2);
    });

    it('should assign person name to "from" field for Inbox folder', () => {
      const messages = parseMessageListHtml(INBOX_FOLDER_HTML, 'Inbox');
      expect(messages[0].from).toBe('Alice Tycoon');
      expect(messages[0].to).toBe('');
      expect(messages[1].from).toBe('System');
    });

    it('should detect unread messages via mailFolderItemBold class', () => {
      const messages = parseMessageListHtml(INBOX_FOLDER_HTML, 'Inbox');
      expect(messages[0].read).toBe(false); // Bold = unread
      expect(messages[1].read).toBe(true);   // Normal = read
    });

    it('should detect noReply from msgReply hidden input value', () => {
      const messages = parseMessageListHtml(INBOX_FOLDER_HTML, 'Inbox');
      expect(messages[0].noReply).toBe(false); // value=""
      expect(messages[1].noReply).toBe(true);   // value="1"
    });

    it('should extract correct messageIds', () => {
      const messages = parseMessageListHtml(INBOX_FOLDER_HTML, 'Inbox');
      expect(messages[0].messageId).toBe('MSG001');
      expect(messages[1].messageId).toBe('MSG002');
    });

    it('should extract correct dates', () => {
      const messages = parseMessageListHtml(INBOX_FOLDER_HTML, 'Inbox');
      expect(messages[0].dateFmt).toBe('2/15/2244');
      expect(messages[1].dateFmt).toBe('1/1/2244');
    });
  });

  describe('Empty folder', () => {
    it('should return empty array for empty folder HTML', () => {
      const emptyHtml = `<html><body>
<table id="MsgTable">
	<tr><td class=mailFolderHeader>From</td><td>Subject</td><td>Date</td></tr>
</table>
<input id="MsgCount" type=hidden value="0">
</body></html>`;

      const messages = parseMessageListHtml(emptyHtml, 'Inbox');
      expect(messages).toHaveLength(0);
    });
  });

  describe('Graceful degradation', () => {
    it('should return empty array for null input', () => {
      const messages = parseMessageListHtml(null as unknown as string, 'Inbox');
      expect(messages).toHaveLength(0);
    });

    it('should return empty array for empty string', () => {
      const messages = parseMessageListHtml('', 'Inbox');
      expect(messages).toHaveLength(0);
    });

    it('should return empty array for non-HTML input', () => {
      const messages = parseMessageListHtml('not html at all', 'Inbox');
      expect(messages).toHaveLength(0);
    });

    it('should return empty array for HTML without message rows', () => {
      const messages = parseMessageListHtml('<html><body><table><tr><td>Hello</td></tr></table></body></html>', 'Inbox');
      expect(messages).toHaveLength(0);
    });
  });

  describe('Default field values', () => {
    it('should set fromAddr and toAddr to empty string (not available from listing)', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].fromAddr).toBe('');
      expect(messages[0].toAddr).toBe('');
    });

    it('should set date to empty string (raw float not in listing)', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].date).toBe('');
    });

    it('should set stamp to 0 (not in listing HTML)', () => {
      const messages = parseMessageListHtml(SENT_FOLDER_HTML, 'Sent');
      expect(messages[0].stamp).toBe(0);
    });
  });

  describe('Quoted msgId attribute', () => {
    it('should handle msgId with double quotes', () => {
      const html = `<html><body><table>
<tr msgId="QUOTED_MSG_123">
  <td><input id="msgReply0" type=hidden value=""></td>
  <td><span class=mailFolderItem>Bob</span></td>
  <td><span class=mailFolderItem>Hello</span></td>
  <td><span class=mailFolderItem><input id="msgDate0" type=hidden value="5/1/2244"></span></td>
</tr>
</table></body></html>`;

      const messages = parseMessageListHtml(html, 'Inbox');
      expect(messages).toHaveLength(1);
      expect(messages[0].messageId).toBe('QUOTED_MSG_123');
    });
  });

  describe('Draft folder', () => {
    it('should assign person name to "to" field for Draft folder (same as Sent)', () => {
      // Draft folder shows "To" column because drafts are outgoing
      const html = `<html><body><table>
<tr msgId=DRAFT001>
  <td><input id="msgReply0" type=hidden value=""></td>
  <td><span class=mailFolderItem>Charlie</span></td>
  <td><span class=mailFolderItem>Draft subject</span></td>
  <td><span class=mailFolderItem><input id="msgDate0" type=hidden value="4/1/2244"></span></td>
</tr>
</table></body></html>`;

      // Draft is an outgoing folder like Sent, so the name is the recipient.
      const messages = parseMessageListHtml(html, 'Draft');
      expect(messages).toHaveLength(1);
      expect(messages[0].messageId).toBe('DRAFT001');
      expect(messages[0].to).toBe('Charlie');
      expect(messages[0].from).toBe('');
    });
  });
});
