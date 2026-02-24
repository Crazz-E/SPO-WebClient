/**
 * Protocol Validation: Mail System RDO Commands
 *
 * Validates that all mail system RDO commands produce correct protocol strings
 * matching captured mail-scenario exchanges. Tests cover:
 *
 * Compose/Save flow:
 *   1. idof "MailServer"         -> objid
 *   2. NewMail "^" args          -> res="#msgId"
 *   3. AddLine "*" body          -> (void)
 *   4. AddHeaders "*" headers    -> (void)
 *   5. Save/Post "^" args        -> res="#-1"
 *   6. CloseMessage "*" msgId    -> (void)
 *
 * Read flow:
 *   1. OpenMessage "^" args      -> res="#msgObjId"
 *   2. GetHeaders "^" #0         -> res="%headers"
 *   3. GetLines "^" #0           -> res="%body"
 *   4. GetAttachmentCount "^" #0 -> res="#count"
 *   5. CloseMessage "*" msgObjId -> (void)
 *
 * Delete/Check:
 *   1. DeleteMessage "*" args    -> (void)
 *   2. CheckNewMail "^" args     -> res="#count"
 *
 * Separator rules (from Delphi source):
 *   "^" = call-with-return (published function)
 *   "*" = void procedure (fire-and-forget)
 */

jest.mock('net', () => ({
  Socket: jest.fn(),
}));
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

/// <reference path="../../__tests__/matchers/rdo-matchers.d.ts" />
import { describe, it, expect, beforeEach } from '@jest/globals';
import { RdoMock } from '../../../mock-server/rdo-mock';
import { RdoStrictValidator } from '../../../mock-server/rdo-strict-validator';
import { RdoProtocol } from '../../../server/rdo';
import { RdoVerb, RdoAction } from '../../../shared/types/protocol-types';
import { createMailScenario, CAPTURED_MAIL_SEND } from '../../../mock-server/scenarios/mail-scenario';
import { DEFAULT_VARIABLES } from '../../../mock-server/scenarios/scenario-variables';

describe('Protocol Validation: Mail System', () => {
  let rdoMock: RdoMock;
  let validator: RdoStrictValidator;
  const scenario = createMailScenario();
  const mailServerId = DEFAULT_VARIABLES.mailServerId;
  const mailAccount = DEFAULT_VARIABLES.mailAccount;
  const worldName = DEFAULT_VARIABLES.worldName;
  const messageId = CAPTURED_MAIL_SEND.messageId;
  const msgObjId = '30430750'; // OpenMessage returns this object ID

  beforeEach(() => {
    rdoMock = new RdoMock();
    validator = new RdoStrictValidator();
    rdoMock.addScenario(scenario.rdo);
    validator.addScenario(scenario.rdo);
  });

  afterEach(() => {
    const errors = validator.getErrors();
    if (errors.length > 0) {
      throw new Error(validator.formatReport());
    }
  });

  // =========================================================================
  // COMPOSE FLOW: NewMail -> AddLine -> AddHeaders -> Save/Post -> CloseMessage
  // =========================================================================

  describe('NewMail CALL command', () => {
    it('should match NewMail scenario with from/to/subject args', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2173,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'NewMail',
        separator: '"^"',
        args: [`%${CAPTURED_MAIL_SEND.to}`, `%${CAPTURED_MAIL_SEND.toName}`, `%${CAPTURED_MAIL_SEND.subject}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-002');
    });

    it('should use "^" method separator (function returns msgId)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2173,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'NewMail',
        separator: '"^"',
        args: [`%${CAPTURED_MAIL_SEND.to}`, `%${CAPTURED_MAIL_SEND.toName}`, `%${CAPTURED_MAIL_SEND.subject}`],
      });

      expect(command).toContain('"^"');
      expect(command).not.toContain('"*"');
    });

    it('should pass all three args as OLE strings (% prefix)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2173,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'NewMail',
        separator: '"^"',
        args: [`%${CAPTURED_MAIL_SEND.to}`, `%${CAPTURED_MAIL_SEND.toName}`, `%${CAPTURED_MAIL_SEND.subject}`],
      });

      expect(command).toContain(`"%${CAPTURED_MAIL_SEND.to}"`);
      expect(command).toContain(`"%${CAPTURED_MAIL_SEND.toName}"`);
      expect(command).toContain(`"%${CAPTURED_MAIL_SEND.subject}"`);
    });

    it('should target mailServerId (not messageId)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2173,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'NewMail',
        separator: '"^"',
        args: [`%${CAPTURED_MAIL_SEND.to}`, `%${CAPTURED_MAIL_SEND.toName}`, `%${CAPTURED_MAIL_SEND.subject}`],
      });

      const parsed = RdoProtocol.parse(command);
      expect(parsed.targetId).toBe(mailServerId);
    });
  });

  describe('AddLine CALL command', () => {
    it('should match AddLine scenario with message body', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2174,
        verb: RdoVerb.SEL, targetId: messageId,
        action: RdoAction.CALL, member: 'AddLine',
        separator: '"*"',
        args: [`%${CAPTURED_MAIL_SEND.body}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-003');
    });

    it('should use "*" push separator (void procedure)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2174,
        verb: RdoVerb.SEL, targetId: messageId,
        action: RdoAction.CALL, member: 'AddLine',
        separator: '"*"',
        args: [`%${CAPTURED_MAIL_SEND.body}`],
      });

      expect(command).toContain('"*"');
    });

    it('should target the messageId (not mailServerId)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2174,
        verb: RdoVerb.SEL, targetId: messageId,
        action: RdoAction.CALL, member: 'AddLine',
        separator: '"*"',
        args: [`%${CAPTURED_MAIL_SEND.body}`],
      });

      const parsed = RdoProtocol.parse(command);
      expect(parsed.targetId).toBe(messageId);
      expect(parsed.targetId).not.toBe(mailServerId);
    });
  });

  describe('AddHeaders CALL command', () => {
    it('should match AddHeaders scenario with header text', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2187,
        verb: RdoVerb.SEL, targetId: messageId,
        action: RdoAction.CALL, member: 'AddHeaders',
        separator: '"*"',
        args: ['%X-Thread-Id: 12345'],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-014');
    });

    it('should use "*" push separator (void procedure)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2187,
        verb: RdoVerb.SEL, targetId: messageId,
        action: RdoAction.CALL, member: 'AddHeaders',
        separator: '"*"',
        args: ['%X-Thread-Id: 12345'],
      });

      expect(command).toContain('"*"');
    });

    it('should target the messageId (like AddLine)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2187,
        verb: RdoVerb.SEL, targetId: messageId,
        action: RdoAction.CALL, member: 'AddHeaders',
        separator: '"*"',
        args: ['%X-Thread-Id: 12345'],
      });

      const parsed = RdoProtocol.parse(command);
      expect(parsed.targetId).toBe(messageId);
    });
  });

  // =========================================================================
  // SAVE / POST
  // =========================================================================

  describe('Save CALL command', () => {
    it('should match Save scenario with worldName and messageId', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2176,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'Save',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-005');
    });

    it('should use "^" separator (function returns wordbool)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2176,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'Save',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      expect(command).toContain('"^"');
    });

    it('should pass worldName as string (%) and messageId as integer (#)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2176,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'Save',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      expect(command).toContain(`"%${worldName}"`);
      expect(command).toContain(`"#${messageId}"`);
    });
  });

  describe('Post CALL command', () => {
    it('should match Post scenario with worldName and messageId', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2180,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'Post',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-007');
    });

    it('should use "^" separator (function returns wordbool)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2180,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'Post',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      expect(command).toContain('"^"');
    });

    it('should have same args as Save (worldName + messageId)', () => {
      const postCmd = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2180,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'Post',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });
      const saveCmd = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2176,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'Save',
        separator: '"^"',
        args: [`%${worldName}`, `#${messageId}`],
      });

      // Post and Save have identical arg patterns (worldName + messageId)
      const postArgs = postCmd.replace(/Post/, '').replace(/C 2180/, '');
      const saveArgs = saveCmd.replace(/Save/, '').replace(/C 2176/, '');
      expect(postArgs).toBe(saveArgs);
    });
  });

  describe('CloseMessage CALL command', () => {
    it('should match CloseMessage scenario with messageId as integer', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2177,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'CloseMessage',
        separator: '"*"',
        args: [`#${messageId}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-006');
    });

    it('should use "*" push separator (void procedure)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2177,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'CloseMessage',
        separator: '"*"',
        args: [`#${messageId}`],
      });

      expect(command).toContain('"*"');
    });
  });

  // =========================================================================
  // READ FLOW: OpenMessage -> GetHeaders -> GetLines -> GetAttachmentCount
  // =========================================================================

  describe('OpenMessage CALL command', () => {
    it('should match OpenMessage scenario with 4 string args', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2182,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'OpenMessage',
        separator: '"^"',
        args: [`%${worldName}`, `%${mailAccount}`, '%Inbox', `%${messageId}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-009');
    });

    it('should use "^" separator (function returns msgObjId)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2182,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'OpenMessage',
        separator: '"^"',
        args: [`%${worldName}`, `%${mailAccount}`, '%Inbox', `%${messageId}`],
      });

      expect(command).toContain('"^"');
    });

    it('should pass all 4 args as strings (worldName, account, folder, msgId)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2182,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'OpenMessage',
        separator: '"^"',
        args: [`%${worldName}`, `%${mailAccount}`, '%Inbox', `%${messageId}`],
      });

      expect(command).toContain(`"%${worldName}"`);
      expect(command).toContain(`"%${mailAccount}"`);
      expect(command).toContain('"%Inbox"');
      expect(command).toContain(`"%${messageId}"`);
    });
  });

  describe('GetHeaders CALL command', () => {
    it('should match GetHeaders scenario with #0 dummy arg', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2183,
        verb: RdoVerb.SEL, targetId: msgObjId,
        action: RdoAction.CALL, member: 'GetHeaders',
        separator: '"^"',
        args: ['#0'],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-010');
    });

    it('should target msgObjId (returned from OpenMessage), not mailServerId', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2183,
        verb: RdoVerb.SEL, targetId: msgObjId,
        action: RdoAction.CALL, member: 'GetHeaders',
        separator: '"^"',
        args: ['#0'],
      });

      const parsed = RdoProtocol.parse(command);
      expect(parsed.targetId).toBe(msgObjId);
      expect(parsed.targetId).not.toBe(mailServerId);
    });
  });

  describe('GetLines CALL command', () => {
    it('should match GetLines scenario with #0 dummy arg', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2184,
        verb: RdoVerb.SEL, targetId: msgObjId,
        action: RdoAction.CALL, member: 'GetLines',
        separator: '"^"',
        args: ['#0'],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-011');
    });

    it('should use "^" separator (function returns body text)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2184,
        verb: RdoVerb.SEL, targetId: msgObjId,
        action: RdoAction.CALL, member: 'GetLines',
        separator: '"^"',
        args: ['#0'],
      });

      expect(command).toContain('"^"');
    });
  });

  describe('GetAttachmentCount CALL command', () => {
    it('should match GetAttachmentCount scenario with #0 dummy arg', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2185,
        verb: RdoVerb.SEL, targetId: msgObjId,
        action: RdoAction.CALL, member: 'GetAttachmentCount',
        separator: '"^"',
        args: ['#0'],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-012');
    });
  });

  // =========================================================================
  // DELETE / CHECK
  // =========================================================================

  describe('DeleteMessage CALL command', () => {
    it('should match DeleteMessage scenario with 4 args', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2181,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'DeleteMessage',
        separator: '"*"',
        args: [`%${worldName}`, `%${mailAccount}`, '%Inbox', `#${messageId}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-008');
    });

    it('should use "*" push separator (void procedure)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2181,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'DeleteMessage',
        separator: '"*"',
        args: [`%${worldName}`, `%${mailAccount}`, '%Inbox', `#${messageId}`],
      });

      expect(command).toContain('"*"');
    });

    it('should target mailServerId', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2181,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'DeleteMessage',
        separator: '"*"',
        args: [`%${worldName}`, `%${mailAccount}`, '%Inbox', `#${messageId}`],
      });

      const parsed = RdoProtocol.parse(command);
      expect(parsed.targetId).toBe(mailServerId);
    });
  });

  describe('CheckNewMail CALL command', () => {
    it('should match CheckNewMail scenario with dummy + account args', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2186,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'CheckNewMail',
        separator: '"^"',
        args: ['#0', `%${mailAccount}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('mail-rdo-013');
    });

    it('should use "^" separator (function returns count)', () => {
      const command = RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 2186,
        verb: RdoVerb.SEL, targetId: mailServerId,
        action: RdoAction.CALL, member: 'CheckNewMail',
        separator: '"^"',
        args: ['#0', `%${mailAccount}`],
      });

      expect(command).toContain('"^"');
    });
  });

  // =========================================================================
  // SEPARATOR CONFORMITY (critical: wrong separator = wrong server behavior)
  // =========================================================================

  describe('Separator conformity', () => {
    it('void procedures should use "*" separator', () => {
      // AddLine, CloseMessage, DeleteMessage, AddHeaders are all void procedures
      const voidCommands = [
        { member: 'AddLine', target: messageId, args: ['%body'] },
        { member: 'CloseMessage', target: mailServerId, args: [`#${messageId}`] },
        { member: 'DeleteMessage', target: mailServerId, args: [`%${worldName}`, `%${mailAccount}`, '%Inbox', `#${messageId}`] },
        { member: 'AddHeaders', target: messageId, args: ['%headers'] },
      ];

      for (const { member, target, args } of voidCommands) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 9999,
          verb: RdoVerb.SEL, targetId: target,
          action: RdoAction.CALL, member,
          separator: '"*"',
          args,
        });

        expect(command).toContain('"*"');
      }
    });

    it('functions with return values should use "^" separator', () => {
      // NewMail, Save, Post, OpenMessage, GetHeaders, GetLines, GetAttachmentCount, CheckNewMail
      const funcCommands = [
        { member: 'NewMail', target: mailServerId, args: ['%to', '%name', '%subj'] },
        { member: 'Save', target: mailServerId, args: [`%${worldName}`, `#${messageId}`] },
        { member: 'Post', target: mailServerId, args: [`%${worldName}`, `#${messageId}`] },
        { member: 'OpenMessage', target: mailServerId, args: ['%world', '%acct', '%folder', '%id'] },
        { member: 'GetHeaders', target: msgObjId, args: ['#0'] },
        { member: 'GetLines', target: msgObjId, args: ['#0'] },
        { member: 'GetAttachmentCount', target: msgObjId, args: ['#0'] },
        { member: 'CheckNewMail', target: mailServerId, args: ['#0', '%acct'] },
      ];

      for (const { member, target, args } of funcCommands) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 9999,
          verb: RdoVerb.SEL, targetId: target,
          action: RdoAction.CALL, member,
          separator: '"^"',
          args,
        });

        expect(command).toContain('"^"');
      }
    });
  });

  // =========================================================================
  // TARGETING RULES
  // =========================================================================

  describe('Command targeting rules', () => {
    it('should target mailServerId for server-level operations', () => {
      const serverOps = ['NewMail', 'Save', 'Post', 'OpenMessage', 'DeleteMessage', 'CloseMessage', 'CheckNewMail'];

      for (const member of serverOps) {
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 9999,
          verb: RdoVerb.SEL, targetId: mailServerId,
          action: RdoAction.CALL, member,
          separator: '"^"',
          args: ['%dummy'],
        });

        const parsed = RdoProtocol.parse(command);
        expect(parsed.targetId).toBe(mailServerId);
      }
    });

    it('should target messageId/msgObjId for message-level operations', () => {
      const msgOps = ['AddLine', 'AddHeaders', 'GetHeaders', 'GetLines', 'GetAttachmentCount'];

      for (const member of msgOps) {
        const target = member.startsWith('Get') ? msgObjId : messageId;
        const command = RdoProtocol.format({
          raw: '', type: 'REQUEST', rid: 9999,
          verb: RdoVerb.SEL, targetId: target,
          action: RdoAction.CALL, member,
          separator: '"*"',
          args: ['%dummy'],
        });

        const parsed = RdoProtocol.parse(command);
        expect(parsed.targetId).not.toBe(mailServerId);
      }
    });
  });
});
