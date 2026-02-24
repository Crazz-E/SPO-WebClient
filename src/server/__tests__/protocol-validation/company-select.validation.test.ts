/**
 * Protocol Validation: Select Company
 *
 * Validates that selectCompany() would produce correct RDO commands matching
 * captured protocol exchanges. Since selectCompany() requires session state
 * normally set by loginWorld(), this test validates individual command FORMAT
 * patterns by building them with RdoProtocol.format() (same as spo_session does)
 * and feeding them through RdoMock loaded with the select-company scenario.
 *
 * Flow under test:
 *   1. sel <worldContextId> set EnableEvents="#-1"
 *   2. sel <worldContextId> call PickEvent "^" "#22"
 *   3. sel <worldContextId> call GetTycoonCookie "^" "#22","%LastY.0"  -> res="%395"
 *   4. sel <worldContextId> call GetTycoonCookie "^" "#22","%LastX.0"  -> res="%467"
 *   5. sel <worldContextId> call GetTycoonCookie "^" "#22","%"         -> full cookie
 */

// Must mock before any imports that use them
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
import {
  createSelectCompanyScenario,
  CAPTURED_COOKIE,
} from '../../../mock-server/scenarios/select-company-scenario';
import { RdoProtocol } from '../../../server/rdo';
import { RdoParser, RdoTypePrefix } from '../../../shared/rdo-types';
import { RdoVerb, RdoAction } from '../../../shared/types/protocol-types';
import type { RdoPacket } from '../../../shared/types/protocol-types';
import { DEFAULT_VARIABLES } from '../../../mock-server/scenarios/scenario-variables';

describe('Protocol Validation: selectCompany()', () => {
  let rdoMock: RdoMock;
  let validator: RdoStrictValidator;
  const scenario = createSelectCompanyScenario();
  const worldContextId = DEFAULT_VARIABLES.clientViewId; // '8161308'
  const tycoonId = 22;

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

  describe('EnableEvents SET command', () => {
    it('should format as SET EnableEvents="#-1" with correct structure', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 34,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.SET,
        member: 'EnableEvents',
        args: ['-1'],
      });

      // SET format: C <rid> sel <id> set EnableEvents="#-1"
      expect(command).toContain(`sel ${worldContextId} set`);
      expect(command).toContain('EnableEvents');
      expect(command).toContain('#-1');
    });

    it('should use "#-1" as integer value for EnableEvents', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 34,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.SET,
        member: 'EnableEvents',
        args: ['-1'],
      });

      // The formatted command should contain "#-1" (integer type prefix)
      expect(command).toContain('#-1');
      // Verify SET format includes member and value together
      const parsed = RdoProtocol.parse(command);
      // SET parser includes value in member: 'EnableEvents="#-1"'
      expect(parsed.member).toContain('EnableEvents');
      expect(parsed.action).toBe(RdoAction.SET);
    });
  });

  describe('PickEvent CALL command', () => {
    it('should match scenario when formatted as CALL PickEvent with tycoon ID', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 35,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'PickEvent',
        args: [`#${tycoonId}`],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('sc-rdo-002');
    });

    it('should use tycoon ID as integer argument', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 35,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'PickEvent',
        args: [`#${tycoonId}`],
      });

      // Verify the formatted command includes the tycoon ID with integer prefix
      expect(command).toContain(`"#${tycoonId}"`);

      // Parse and verify the argument
      const parsed = RdoProtocol.parse(command);
      expect(parsed.args).toBeDefined();
      expect(parsed.args!.length).toBeGreaterThanOrEqual(1);
      const tycoonArg = parsed.args![0];
      expect(tycoonArg).toContain(`${tycoonId}`);
    });
  });

  describe('GetTycoonCookie CALL commands', () => {
    it('should match GetTycoonCookie with "%LastY.0" to sc-rdo-003', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 36,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'GetTycoonCookie',
        args: [`#${tycoonId}`, '%LastY.0'],
      });

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);
      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('sc-rdo-003');
    });

    it('should match GetTycoonCookie with "%LastX.0" argument', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 37,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'GetTycoonCookie',
        args: [`#${tycoonId}`, '%LastX.0'],
      });

      // Verify command format contains the LastX.0 argument
      expect(command).toContain('GetTycoonCookie');
      expect(command).toContain('%LastX.0');
      // Should match a GetTycoonCookie exchange (keyFieldMatch)
      const result = rdoMock.match(command);
      expect(result).not.toBeNull();
      expect(result!.exchange.matchKeys?.member).toBe('GetTycoonCookie');
    });

    it('should match GetTycoonCookie with "%" (full cookie) argument', () => {
      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 38,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'GetTycoonCookie',
        args: [`#${tycoonId}`, '%'],
      });

      // Verify command format for full cookie request
      expect(command).toContain('GetTycoonCookie');
      // The "%" arg requests all cookie data
      const parsed = RdoProtocol.parse(command);
      expect(parsed.member).toBe('GetTycoonCookie');
      // Should match a GetTycoonCookie exchange
      const result = rdoMock.match(command);
      expect(result).not.toBeNull();
    });
  });

  describe('Command targeting', () => {
    it('should target worldContextId in all commands', () => {
      const commands: RdoPacket[] = [
        {
          raw: '', type: 'REQUEST', rid: 34,
          verb: RdoVerb.SEL, targetId: worldContextId,
          action: RdoAction.SET, member: 'EnableEvents', args: ['-1'],
        },
        {
          raw: '', type: 'REQUEST', rid: 35,
          verb: RdoVerb.SEL, targetId: worldContextId,
          action: RdoAction.CALL, member: 'PickEvent', args: [`#${tycoonId}`],
        },
        {
          raw: '', type: 'REQUEST', rid: 36,
          verb: RdoVerb.SEL, targetId: worldContextId,
          action: RdoAction.CALL, member: 'GetTycoonCookie',
          args: [`#${tycoonId}`, '%LastY.0'],
        },
        {
          raw: '', type: 'REQUEST', rid: 37,
          verb: RdoVerb.SEL, targetId: worldContextId,
          action: RdoAction.CALL, member: 'GetTycoonCookie',
          args: [`#${tycoonId}`, '%LastX.0'],
        },
        {
          raw: '', type: 'REQUEST', rid: 38,
          verb: RdoVerb.SEL, targetId: worldContextId,
          action: RdoAction.CALL, member: 'GetTycoonCookie',
          args: [`#${tycoonId}`, '%'],
        },
      ];

      for (const packet of commands) {
        const formatted = RdoProtocol.format(packet);
        const parsed = RdoProtocol.parse(formatted);
        expect(parsed.verb).toBe(RdoVerb.SEL);
        expect(parsed.targetId).toBe(worldContextId);
      }
    });
  });

  describe('ClientAware push command', () => {
    it('should use "*" push separator (no RID) for ClientAware', () => {
      // ClientAware is sent as a push command (no RID, uses "*" separator)
      const command = RdoProtocol.format({
        raw: '',
        type: 'PUSH',
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'ClientAware',
        separator: '*',
      });

      // Push commands should NOT have a RID
      expect(command).not.toMatch(/^C \d+ /);
      // Should use "*" separator
      expect(command).toContain('"*"');
      // Should contain ClientAware method name
      expect(command).toContain('ClientAware');

      // Parse and verify separator
      const parsed = RdoProtocol.parse(command);
      expect(parsed.type).toBe('PUSH');
      expect(parsed.rid).toBeUndefined();
      expect(parsed.member).toBe('ClientAware');
    });
  });

  describe('Cookie response parsing', () => {
    it('should extract lastY=395 from GetTycoonCookie LastY.0 response', () => {
      rdoMock.reset();

      const command = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 36,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'GetTycoonCookie',
        args: [`#${tycoonId}`, '%LastY.0'],
      });

      const result = rdoMock.match(command);
      expect(result).not.toBeNull();

      // Response format: A36 res="%395"
      const response = result!.response;
      expect(response).toContain('res=');

      // Parse the response to extract the value
      const responsePacket = RdoProtocol.parse(response);
      const payload = responsePacket.payload ?? '';
      // Extract the value from res="%395"
      const resMatch = payload.match(/res="(%[^"]*)"/);
      expect(resMatch).not.toBeNull();

      const extracted = RdoParser.extract(resMatch![1]);
      expect(extracted.prefix).toBe(RdoTypePrefix.OLESTRING);
      expect(extracted.value).toBe(CAPTURED_COOKIE.lastY);
    });

    it('should have lastX=467 in sc-rdo-004 scenario response', () => {
      // Directly verify the scenario exchange response contains the expected cookie value
      const exchange = scenario.rdo.exchanges.find(e => e.id === 'sc-rdo-004');
      expect(exchange).toBeDefined();
      expect(exchange!.response).toContain(`res="%${CAPTURED_COOKIE.lastX}"`);

      // Parse and verify the value
      const resMatch = exchange!.response.match(/res="(%[^"]*)"/);
      expect(resMatch).not.toBeNull();

      const extracted = RdoParser.extract(resMatch![1]);
      expect(extracted.prefix).toBe(RdoTypePrefix.OLESTRING);
      expect(extracted.value).toBe(CAPTURED_COOKIE.lastX);
    });
  });
});
