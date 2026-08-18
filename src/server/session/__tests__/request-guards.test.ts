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
    // SAFETY guard since 2026-08-18, not a convention. Under "*" the dispatcher
    // passes no hidden result pointer (RDOObjectServer.pas:281-283) and a
    // compiled `function` writes its OleVariant result anyway, through a
    // register nobody set. One such frame — `call GetUserList "*"` — left the
    // shared Interface Server answering errMalformedQuery to every query.
    it('rejects "*" on a member not proven to be a Delphi procedure', () => {
      expect(() =>
        assertNotVoidPush({ member: 'RDOEndSession', separator: '*' })
      ).toThrow('is not a proven Delphi procedure');
    });

    it('includes the member name in the error message', () => {
      expect(() =>
        assertNotVoidPush({ member: 'RDOSomeCommand', separator: '*' })
      ).toThrow('"RDOSomeCommand"');
    });

    it('uses "unknown" when member is not provided', () => {
      expect(() =>
        assertNotVoidPush({ separator: '*' })
      ).toThrow('"unknown"');
    });

    it('rejects separator containing "*" among other characters', () => {
      expect(() =>
        assertNotVoidPush({ member: 'RDOTest', separator: 'x*y' })
      ).toThrow('is not a proven Delphi procedure');
    });

    it('exempts the members VOID_MEMBERS proves to be procedures', () => {
      expect(() => assertNotVoidPush({ member: 'AddLine', separator: '*' })).not.toThrow();
      expect(() => assertNotVoidPush({ member: 'CloseMessage', separator: '*' })).not.toThrow();
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
