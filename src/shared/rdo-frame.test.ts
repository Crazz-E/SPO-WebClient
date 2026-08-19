/**
 * src/shared/rdo-frame.test.ts
 *
 * The acceptance criterion for the RDO control rework is byte-identity: the
 * frames this module produces must equal, byte for byte, what the call sites
 * built by hand. So every builder is checked against the *old* construction
 * written out longhand — not against a re-expression of the new one.
 */

import { describe, it, expect } from '@jest/globals';
import { RdoValue, RdoCommand } from './rdo-types';
import { RdoVerb, RdoAction } from './types';
import { rdoCall, rdoGet, rdoSet, rdoIdOf, RdoFrameError } from './rdo-frame';
import { isCataloguedRdoMember } from './rdo-members';

const TARGET = '12345';

describe('byte-identity with the hand-built packet', () => {
  it('reproduces a function call — the separator the site used to retype', () => {
    // Was: src/server/spo_session.ts:761
    const oldPacket = {
      verb: RdoVerb.SEL,
      targetId: TARGET,
      action: RdoAction.CALL,
      member: 'ObjectAt',
      separator: '"^"',
      args: [RdoValue.int(120).format(), RdoValue.int(64).format()],
    };

    expect(rdoCall('ObjectAt', TARGET, RdoValue.int(120), RdoValue.int(64)).packet)
      .toEqual(oldPacket);
  });

  it('reproduces a procedure call', () => {
    // Was: src/server/session/chat-handler.ts:177
    const oldPacket = {
      verb: RdoVerb.SEL,
      targetId: TARGET,
      action: RdoAction.CALL,
      member: 'SayThis',
      separator: '"*"',
      args: [RdoValue.string('general').format(), RdoValue.string('hello').format()],
    };

    expect(rdoCall('SayThis', TARGET, RdoValue.string('general'), RdoValue.string('hello')).packet)
      .toEqual(oldPacket);
  });

  it('reproduces a get — no separator in the grammar', () => {
    // Was: src/server/session/login-handler.ts:789
    expect(rdoGet('WorldName', TARGET).packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: TARGET,
      action: RdoAction.GET,
      member: 'WorldName',
    });
  });

  it('reproduces a set', () => {
    // Was: src/server/session/login-handler.ts:525
    expect(rdoSet('EnableEvents', TARGET, RdoValue.int(-1)).packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: TARGET,
      action: RdoAction.SET,
      member: 'EnableEvents',
      args: [RdoValue.int(-1).format()],
    });
  });

  it('reproduces an idof', () => {
    // Was: src/server/session/login-handler.ts:187
    expect(rdoIdOf('DirectoryServer').packet).toEqual({
      verb: RdoVerb.IDOF,
      targetId: 'DirectoryServer',
    });
  });
});

describe('byte-identity with the hand-built fire-and-forget frame', () => {
  it('reproduces a procedure push', () => {
    // Was: src/server/spo_session.ts:2026
    const old = RdoCommand.sel(TARGET).call('KeepAlive').push().build();

    expect(rdoCall('KeepAlive', TARGET).toFrame()).toBe(old);
    expect(rdoCall('KeepAlive', TARGET).toFrame()).toBe('C sel 12345 call KeepAlive "*";');
  });

  it('reproduces a push carrying arguments', () => {
    // Was: src/server/spo_session.ts:1336
    const old = RdoCommand.sel(TARGET).call('SetViewedArea').push()
      .args(RdoValue.int(1), RdoValue.int(2), RdoValue.int(3), RdoValue.int(4)).build();

    expect(
      rdoCall('SetViewedArea', TARGET,
        RdoValue.int(1), RdoValue.int(2), RdoValue.int(3), RdoValue.int(4)).toFrame(),
    ).toBe(old);
  });

  it('reproduces a direct property write', () => {
    // Was: src/server/session/building-property-handler.ts:188
    const old = RdoCommand.sel(TARGET).set('Stopped').args(RdoValue.int(-1)).build();

    expect(rdoSet('Stopped', TARGET, RdoValue.int(-1)).toFrame()).toBe(old);
    expect(rdoSet('Stopped', TARGET, RdoValue.int(-1)).toFrame()).toBe('C sel 12345 set Stopped="#-1";');
  });

  it('accepts a numeric target id, as the builders always did', () => {
    expect(rdoCall('KeepAlive', 12345).toFrame()).toBe(rdoCall('KeepAlive', '12345').toFrame());
  });
});

describe('the separator is derived, and cannot be stated', () => {
  it('gives a function "^" and a procedure "*", from the catalogue alone', () => {
    expect(rdoCall('ObjectAt', TARGET, RdoValue.int(1), RdoValue.int(2)).packet.separator).toBe('"^"');
    expect(rdoCall('KeepAlive', TARGET).packet.separator).toBe('"*"');
  });

  it('exposes no way to pass one — the spec carries `kind`, not a separator', () => {
    const spec = rdoCall('KeepAlive', TARGET).spec;

    expect(spec).toEqual({ form: 'call', targetId: TARGET, member: 'KeepAlive', kind: 'procedure', args: [] });
    expect(spec).not.toHaveProperty('separator');
  });
});

describe('the catalogue is the gate', () => {
  it('rejects an uncatalogued member at compile time', () => {
    // @ts-expect-error — the whole point: an uncatalogued name is not an
    // RdoMemberName, so a literal site cannot even express this call. The
    // directive fails the build if the error ever stops being raised.
    const build = () => rdoCall('RDODoesNotExist', TARGET);

    // And still at runtime, for a site that reached the type through a cast.
    expect(build).toThrow(RdoFrameError);
    expect(build).toThrow(/not in RDO_MEMBERS/);
  });

  it('narrows a runtime-chosen name without a cast', () => {
    // This is the shape building-property-handler will use in lot C: the guard
    // is what turns `string` into RdoMemberName, so the runtime check and the
    // static one are the same check.
    const fromBrowser: string = 'RDOSetPrice';

    expect(isCataloguedRdoMember(fromBrowser)).toBe(true);
    if (!isCataloguedRdoMember(fromBrowser)) throw new Error('unreachable');

    expect(rdoCall(fromBrowser, TARGET, RdoValue.int(0), RdoValue.int(220)).packet.separator)
      .toBe('"*"');
  });

  it('refuses a call whose argument count differs from the catalogued arity', () => {
    // ObjectAt is arity 2. Under-emitting makes the callee read a register the
    // dispatcher never set; over-emitting leaves words a register callee never pops.
    expect(() => rdoCall('ObjectAt', TARGET, RdoValue.int(1)))
      .toThrow(/takes 2 argument\(s\), got 1/);
    expect(() => rdoCall('ObjectAt', TARGET, RdoValue.int(1), RdoValue.int(2), RdoValue.int(3)))
      .toThrow(/takes 2 argument\(s\), got 3/);
  });

  it('refuses to call an accessor, and names the builder to use instead', () => {
    expect(() => rdoCall('WorldName', TARGET)).toThrow(/Use rdoGet/);
    expect(() => rdoCall('EnableEvents', TARGET, RdoValue.int(-1))).toThrow(/Use rdoSet/);
  });

  it('refuses to read a member nothing reads, and to write one nothing writes', () => {
    expect(() => rdoGet('EnableEvents', TARGET)).toThrow(/not a catalogued read/);
    expect(() => rdoSet('WorldName', TARGET, RdoValue.string('x'))).toThrow(/not a catalogued write/);
  });

  it('refuses to get or set a callable', () => {
    expect(() => rdoGet('ObjectAt', TARGET)).toThrow(/emitted as a function/);
    expect(() => rdoSet('KeepAlive', TARGET, RdoValue.int(0))).toThrow(/emitted as a procedure/);
  });

  it('lets a member declared for both go either way', () => {
    expect(rdoGet('RDOAcceptCloning', TARGET).packet.action).toBe(RdoAction.GET);
    expect(rdoSet('RDOAcceptCloning', TARGET, RdoValue.int(-1)).packet.action).toBe(RdoAction.SET);
  });
});

describe('idof', () => {
  it('refuses to be sent fire-and-forget — it exists to read an id', () => {
    expect(() => rdoIdOf('DirectoryServer').toFrame()).toThrow(/needs a QueryId/);
  });

  it('refuses an empty name', () => {
    expect(() => rdoIdOf('')).toThrow(RdoFrameError);
  });
});

describe('argument formatting moved off the call sites', () => {
  it('formats RdoValue objects itself, so no site calls .format()', () => {
    const frame = rdoCall('SayThis', TARGET, RdoValue.string('a"b'), RdoValue.int(7));

    // The quote is doubled by the one escaping chokepoint, exactly as when the
    // call site did it: RdoValue.format() → encodeRdoLiteral.
    expect(frame.packet.args).toEqual(['"%a""b"', '"#7"']);
  });

  it('keeps the target-id guard of the engine — sel 0 is a null pointer', () => {
    expect(() => rdoCall('KeepAlive', 0).toFrame()).toThrow(/Invalid RDO target ID/);
  });
});
