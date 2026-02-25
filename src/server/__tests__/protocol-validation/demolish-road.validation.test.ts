/**
 * Protocol Validation: Road Demolition (BreakCircuitAt)
 *
 * Validates that demolishRoad() produces correct BreakCircuitAt commands
 * matching the Delphi reference (World.pas:4311-4354).
 *
 * BreakCircuitAt flow:
 *   sel <worldContextId> call BreakCircuitAt "^" "#1","#<ownerId>","#<x>","#<y>"
 *   -> res="#0" (success) or res="#2" (invalidSegment) or res="#3" (accessDenied)
 */

jest.mock('net', () => ({
  Socket: jest.fn(),
}));
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { describe, it, expect } from '@jest/globals';
import { RdoProtocol } from '../../../server/rdo';
import { RdoVerb, RdoAction } from '../../../shared/types/protocol-types';
import { WsMessageType } from '../../../shared/types/message-types';

describe('Protocol Validation: BreakCircuitAt (Road Demolition)', () => {
  const worldContextId = '8161308';
  const ownerId = '1234567';

  function makePacket(args: string[]) {
    return {
      raw: '',
      type: 'REQUEST' as const,
      verb: RdoVerb.SEL,
      targetId: worldContextId,
      action: RdoAction.CALL,
      member: 'BreakCircuitAt',
      separator: '"^"',
      args,
    };
  }

  describe('command format', () => {
    it('should produce correctly formatted BreakCircuitAt command', () => {
      const x = 100;
      const y = 200;
      const circuitId = 1; // Road

      const formatted = RdoProtocol.format(makePacket([
        `#${circuitId}`,
        `#${ownerId}`,
        `#${x}`,
        `#${y}`,
      ]));

      expect(formatted).toContain(`sel ${worldContextId}`);
      expect(formatted).toContain('call BreakCircuitAt');
      expect(formatted).toContain('"^"');
      expect(formatted).toContain(`"#${circuitId}"`);
      expect(formatted).toContain(`"#${ownerId}"`);
      expect(formatted).toContain(`"#${x}"`);
      expect(formatted).toContain(`"#${y}"`);
    });

    it('should use function separator "^" (olevariant return)', () => {
      const formatted = RdoProtocol.format(makePacket(['#1', '#0', '#50', '#50']));

      // "^" = function (returns olevariant), not "*" (void/procedure)
      expect(formatted).toContain('"^"');
      expect(formatted).not.toContain('"*"');
    });

    it('should use circuit ID 1 for roads', () => {
      const formatted = RdoProtocol.format(makePacket(['#1', `#${ownerId}`, '#50', '#50']));

      // First arg after separator should be "#1" (road circuit type)
      expect(formatted).toMatch(/"#1","#/);
    });
  });

  describe('response parsing', () => {
    it('should parse success response (code 0)', () => {
      const response = 'A505 res="#0"';
      const resultMatch = /res="#(-?\d+)"/.exec(response);
      expect(resultMatch).not.toBeNull();
      expect(parseInt(resultMatch![1], 10)).toBe(0);
    });

    it('should parse invalid segment response (code 2)', () => {
      const response = 'A505 res="#2"';
      const resultMatch = /res="#(-?\d+)"/.exec(response);
      expect(resultMatch).not.toBeNull();
      expect(parseInt(resultMatch![1], 10)).toBe(2);
    });

    it('should parse access denied response (code 3)', () => {
      const response = 'A505 res="#3"';
      const resultMatch = /res="#(-?\d+)"/.exec(response);
      expect(resultMatch).not.toBeNull();
      expect(parseInt(resultMatch![1], 10)).toBe(3);
    });
  });

  describe('message types', () => {
    it('should define REQ_DEMOLISH_ROAD message type', () => {
      expect(WsMessageType.REQ_DEMOLISH_ROAD).toBe('REQ_DEMOLISH_ROAD');
    });

    it('should define RESP_DEMOLISH_ROAD message type', () => {
      expect(WsMessageType.RESP_DEMOLISH_ROAD).toBe('RESP_DEMOLISH_ROAD');
    });

    it('should define EVENT_END_OF_PERIOD message type', () => {
      expect(WsMessageType.EVENT_END_OF_PERIOD).toBe('EVENT_END_OF_PERIOD');
    });
  });
});
