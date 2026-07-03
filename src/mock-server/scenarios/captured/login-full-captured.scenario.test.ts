/**
 * Validation for the captured login-full scenario (live capture, planitia
 * 2026-07-03). Two layers:
 *  1. Protocol-order conformity of the capture itself against the canonical
 *     sequences in doc/rdo-session-lifecycle.md.
 *  2. RdoMock round-trip: every client-initiated exchange must be matchable.
 */

import { describe, it, expect } from '@jest/globals';
import { RdoMock } from '../../rdo-mock';
import { resolveScenarioVariables } from '../../log-capture-converter';
import { loginFullCapturedScenario } from './login-full-captured.scenario';

const resolved = resolveScenarioVariables(loginFullCapturedScenario);
const requests = resolved.exchanges.filter(e => !e.pushOnly && e.request !== '');

function indexOfMember(member: string, action?: string): number {
  return requests.findIndex(
    e => e.matchKeys?.member === member && (!action || e.matchKeys?.action === action)
  );
}

describe('login-full captured scenario — protocol-order conformity', () => {
  it('starts with idof DirectoryServer', () => {
    expect(resolved.exchanges[0].matchKeys).toEqual({
      verb: 'idof',
      targetId: 'DirectoryServer',
    });
  });

  it('directory auth order: RDOOpenSession → RDOMapSegaUser → RDOLogonUser', () => {
    const open = indexOfMember('RDOOpenSession');
    const mapSega = indexOfMember('RDOMapSegaUser');
    const logonUser = indexOfMember('RDOLogonUser');
    expect(open).toBeGreaterThanOrEqual(0);
    expect(mapSega).toBeGreaterThan(open);
    expect(logonUser).toBeGreaterThan(mapSega);
  });

  it('world login: AccountStatus precedes Logon (lifecycle §4.1)', () => {
    const accountStatus = indexOfMember('AccountStatus');
    const logon = indexOfMember('Logon', 'call');
    expect(accountStatus).toBeGreaterThanOrEqual(0);
    expect(logon).toBeGreaterThan(accountStatus);
  });

  it('graceful logoff form: void ClientNotAware precedes get Logoff (lifecycle §9)', () => {
    const notAware = indexOfMember('ClientNotAware');
    const logoff = indexOfMember('Logoff', 'get');
    expect(notAware).toBeGreaterThanOrEqual(0);
    expect(logoff).toBeGreaterThan(notAware);
    const notAwareEx = requests[notAware];
    expect(notAwareEx.request).toContain('"*"');
    expect(notAwareEx.response).toBe(''); // fire-and-forget — no answer
    expect(requests[logoff].response).toContain('Logoff="#0"');
  });

  it('credentials are placeholders, never literals', () => {
    const source = JSON.stringify(loginFullCapturedScenario.exchanges);
    expect(source).not.toContain('test3","%test3');
    expect(loginFullCapturedScenario.variables.password).toBe('[REDACTED]');
    expect(loginFullCapturedScenario.variables.username).toBe('SPO_test3');
  });

  it('resolution leaves no dangling {{placeholders}}', () => {
    const source = JSON.stringify(resolved.exchanges);
    expect(source).not.toContain('{{');
  });
});

describe('login-full captured scenario — RdoMock round-trip', () => {
  it('every client-initiated exchange is matchable with a consistent member', () => {
    const mock = new RdoMock();
    mock.addScenario(resolved);

    const unmatched: string[] = [];
    for (const exchange of requests) {
      const result = mock.match(exchange.request);
      if (!result) {
        unmatched.push(exchange.id);
        continue;
      }
      // The matcher may pick an equivalent duplicate (ClientAware ×2) but
      // must never cross members.
      if (
        exchange.matchKeys?.member &&
        result.exchange.matchKeys?.member !== exchange.matchKeys.member
      ) {
        unmatched.push(`${exchange.id} → ${result.exchange.id}`);
      }
    }
    expect(unmatched).toEqual([]);
  });

  it('push-only exchanges are never matched as requests', () => {
    const mock = new RdoMock();
    mock.addScenario(resolved);
    const pushOnly = resolved.exchanges.filter(e => e.pushOnly);
    expect(pushOnly.length).toBeGreaterThan(0);
    for (const p of pushOnly) {
      // Feeding the push command back as if a client sent it must not
      // consume the pushOnly exchange.
      const result = mock.match(p.response);
      expect(result?.exchange.pushOnly ?? false).toBe(false);
    }
  });
});
