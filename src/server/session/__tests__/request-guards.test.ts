/**
 * Request Guard Tests — verifies the REAL extracted guard functions
 * from rdo-request-guards.ts (used by spo_session.ts sendRdoRequest / executeRdoRequest).
 *
 * Regression test for commit 2e750cbef (void push crash guard).
 */

import { describe, it, expect } from '@jest/globals';
import { assertNotVoidPush, canBufferRequest } from '../rdo-request-guards';

describe('Request Guards', () => {
  describe('assertNotVoidPush', () => {
    it('rejects void push "*" separator (project convention guard)', () => {
      // PROJECT CONVENTION, not a crash fact: void+QueryId is wire-legal
      // (the server acks "A<id> ;", capture-proven — doc/rdo-protocol-architecture.md §8.5).
      // The guard enforces one wire form per intent.
      expect(() =>
        assertNotVoidPush({ member: 'RDOEndSession', separator: '*' })
      ).toThrow('Void push separator "*" must not be used with sendRdoRequest()');
    });

    it('includes the command name in the error message', () => {
      expect(() =>
        assertNotVoidPush({ member: 'RDOSomeCommand', separator: '*' })
      ).toThrow('Command: RDOSomeCommand');
    });

    it('uses "unknown" when member is not provided', () => {
      expect(() =>
        assertNotVoidPush({ separator: '*' })
      ).toThrow('Command: unknown');
    });

    it('rejects separator containing "*" among other characters', () => {
      expect(() =>
        assertNotVoidPush({ member: 'RDOTest', separator: 'x*y' })
      ).toThrow('must not be used with sendRdoRequest');
    });

    it('allows synchronous "^" separator (normal RDO call)', () => {
      expect(() =>
        assertNotVoidPush({ member: 'RDOQuery', separator: '^' })
      ).not.toThrow();
    });

    it('allows undefined separator', () => {
      expect(() =>
        assertNotVoidPush({ member: 'RDOQuery' })
      ).not.toThrow();
    });

    it('allows empty separator', () => {
      expect(() =>
        assertNotVoidPush({ member: 'RDOQuery', separator: '' })
      ).not.toThrow();
    });
  });

  describe('canBufferRequest', () => {
    it('returns true when buffer has room', () => {
      expect(canBufferRequest(0, 5)).toBe(true);
      expect(canBufferRequest(4, 5)).toBe(true);
    });

    it('returns false when buffer is at capacity', () => {
      expect(canBufferRequest(5, 5)).toBe(false);
    });

    it('returns false when buffer exceeds capacity', () => {
      expect(canBufferRequest(6, 5)).toBe(false);
    });
  });
});
