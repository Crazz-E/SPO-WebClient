import { RdoProtocol } from '../../rdo';
import { RdoVerb, RdoAction } from '../../../shared/types';
import type { RdoPacket } from '../../../shared/types';

/**
 * C-1 — `action` was the fourth unquoted field, and the only one left unvalidated.
 *
 * `verb`, `member` and `targetId` were all locked down by lot L2; `action` was
 * pushed verbatim at the <SubCmd> position of the grammar (§1.3) — the position
 * the `repeat … until QueryTerm` loop of ExecQuery re-iterates
 * (RDOQueryServer.pas:133-160). Found by the adversarial review of that lot,
 * confirmed by three independent verifiers.
 *
 * `action?: RdoAction` is a compile-time annotation only: WebSocket messages are
 * plain `JSON.parse` output, so nothing stops a hostile string at runtime.
 */
function format(overrides: Partial<RdoPacket>): string {
  return RdoProtocol.format({
    type: 'REQUEST',
    rid: 12,
    verb: RdoVerb.SEL,
    targetId: '8161308',
    action: RdoAction.CALL,
    member: 'Name',
    ...overrides,
  } as RdoPacket);
}

describe('RdoProtocol.format — action validation (C-1)', () => {
  it('emits the three legitimate actions unchanged', () => {
    expect(format({ action: RdoAction.CALL })).toBe('C 12 sel 8161308 call Name "^"');
    expect(format({ action: RdoAction.GET })).toBe('C 12 sel 8161308 get Name');
    expect(format({ action: RdoAction.SET, args: ['#1'] })).toBe('C 12 sel 8161308 set Name="#1"');
  });

  // The exact payload the review measured against the pre-fix build:
  //   C 12 sel 8161308 call Evil "*" "%pwn" get Name;
  // — two sub-commands, both executed server-side, on one rate-limit token.
  it('rejects an action carrying a second sub-command', () => {
    expect(() => format({ action: 'call Evil "*" "%pwn" get' as RdoAction })).toThrow(
      /Invalid RDO action/
    );
  });

  // Reaches the one row of the §8.5 matrix marked MUST NOT — no QueryId + "^",
  // which is unreachable through the legitimate path (sendRdoRequest always
  // allocates a rid, and the separator whitelist blocks the rest).
  it('rejects an action that would forge a separator', () => {
    expect(() => format({ action: 'call X "^" ;C sel 1 call Y' as RdoAction })).toThrow(
      /Invalid RDO action/
    );
  });

  // 'idof' is a VERB, not an action — the two axes were conflated at the WS
  // boundary before this fix, so it is worth pinning that they stay separate.
  it.each([';', '"', 'CALL', 'call ', ' call', 'idof'])(
    'rejects the malformed action %p',
    action => {
      expect(() => format({ action: action as RdoAction })).toThrow(/Invalid RDO action/);
    }
  );

  // An absent action is not a malformed one: `idof` carries no sub-command, so
  // the field is legitimately omitted. The guard sits inside `if (packet.action)`
  // and must not turn that supported case into an error.
  it('accepts an absent action rather than rejecting it', () => {
    const wire = RdoProtocol.format({
      type: 'REQUEST',
      rid: 3,
      verb: RdoVerb.IDOF,
      targetId: 'DirectoryServer',
    } as RdoPacket);

    expect(wire).toBe('C 3 idof "DirectoryServer"');
  });

  // Regression sentinel: if the guard is removed, this is the assertion that
  // fails first, and it fails with the injected frame visible in the message.
  it('never emits a frame containing two action keywords', () => {
    let wire: string;
    try {
      wire = format({ action: 'call Evil "*" "%pwn" get' as RdoAction });
    } catch {
      return; // guard held
    }
    throw new Error(`action guard bypassed — emitted: ${wire}`);
  });
});
