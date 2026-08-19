/**
 * Lot L2 — hardening of the `rdo.ts` / `RdoCommand` frontier.
 *
 * Covers, in order:
 *   §1  P-M2 byte-identity: the new `formatTypedToken` must be bit-for-bit
 *       identical to the old one on every legitimate input, and differ ONLY by
 *       escaping on the hostile ones.
 *   §2  P-H3 identifier validation at `RdoProtocol.format` and `RdoCommand`.
 *   §3  targetId / separator hardening (same injection family as P-M2).
 *   §4  P-M1 `RDOSearchKey` — the pattern must reach the wire as OLEString.
 *
 * P-L4 (`withRequestId` / separator decoupling) lives with the rest of the
 * builder in `src/shared/rdo-types.test.ts`.
 */

import type { Socket } from 'net';
import type { RdoPacket } from '../../../shared/types';
import { RDO_CONSTANTS, RdoAction, RdoVerb } from '../../../shared/types';
import {
  RdoCommand,
  RdoIdentifierError,
  RdoParser,
  RdoValue,
  RDO_TYPE_PREFIXES,
} from '../../../shared/rdo-types';
import { RdoFramer, RdoProtocol } from '../../rdo';
import { writeRdoFrame } from '../../rdo-helpers';
import { StarpeaceSession } from '../../spo_session';

// ---------------------------------------------------------------------------
// §1 — Byte identity against the pre-L2 implementation
// ---------------------------------------------------------------------------

/** `formatTypedToken` exactly as it stood before lot L2 (rdo.ts:398-427). */
function legacyFormatTypedToken(val: string, autoTypeNumeric = true): string {
  if (val.startsWith('"') && val.endsWith('"')) {
    const extracted = RdoParser.extract(val);
    if (extracted.prefix) return val;
  }
  let cleaned = val;
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1);
  }
  if (RDO_TYPE_PREFIXES.includes(cleaned.charAt(0))) {
    return `"${cleaned}"`;
  }
  if (autoTypeNumeric && /^-?\d+$/.test(cleaned)) {
    return RdoValue.int(parseInt(cleaned, 10)).format();
  }
  return RdoValue.string(cleaned).format();
}

/** Current implementation, reached the only way it is reachable: through format(). */
function currentCallToken(arg: string): string {
  const frame = RdoProtocol.format({
    raw: '', type: 'PUSH', verb: RdoVerb.SEL, targetId: '42',
    action: RdoAction.CALL, member: 'M', separator: '"^"', args: [arg],
  } as RdoPacket);
  return frame.substring('C sel 42 call M "^" '.length);
}

function currentSetToken(arg: string): string {
  const frame = RdoProtocol.format({
    raw: '', type: 'PUSH', verb: RdoVerb.SEL, targetId: '42',
    action: RdoAction.SET, member: 'P', args: [arg],
  } as RdoPacket);
  return frame.substring('C sel 42 set P='.length);
}

/**
 * Every shape a production call site actually passes today, plus the awkward
 * ones. None contains a `"` — that is the whole definition of "legitimate"
 * here, since the reference client is structurally incapable of putting an
 * unescaped quote in an argument (`RDOStrEncode`, `RDOUtils.pas:246-254`).
 */
const LEGITIMATE_ARGS: readonly string[] = [
  // Already-formatted literals produced by RdoValue.format() — the common case.
  RdoValue.int(42).format(),
  RdoValue.int(-1).format(),
  RdoValue.int(0).format(),
  RdoValue.string('SPO_test3').format(),
  RdoValue.string('').format(),
  RdoValue.string('déjà vu, señor').format(),
  RdoValue.string('General/Population\nGeneral/Investors').format(),
  RdoValue.string('Tycoons\\SPO_test3.five\\').format(),
  RdoValue.float(3.14).format(),
  RdoValue.double(1.5).format(),
  RdoValue.stringId('id').format(),
  // Bare typed tokens — road-handler.ts:182-188, `#${circuitId}` style (P-L3).
  '#42', '#-1', '#0', '%Inbox', '%LastY.0', '!3.14', '@1.5', '$id',
  // Untyped raw text.
  'hello', '', '42', '-1', '0', 'Root/Areas/Free Space/Worlds',
  'LastY.0', 'X-Thread-Id: 12345', 'IsMayor\tTown\t',
  'déjà vu', 'wait; then go', 'a,b',
  // Quoted but untyped.
  '"hello"', '""',
];

describe('P-M2 §1 — byte identity with the pre-L2 formatter on legitimate input', () => {
  it.each(LEGITIMATE_ARGS)('CALL arg %j is byte-identical', (arg) => {
    expect(currentCallToken(arg)).toBe(legacyFormatTypedToken(arg, false));
  });

  it.each(LEGITIMATE_ARGS)('SET value %j is byte-identical', (arg) => {
    expect(currentSetToken(arg)).toBe(legacyFormatTypedToken(arg, true));
  });

  it('keeps SET numeric auto-typing alive (O-L7 — EnableEvents)', () => {
    // If this ever regresses to "%-1", every push dies silently.
    expect(currentSetToken('-1')).toBe('"#-1"');
    expect(currentSetToken(RdoValue.int(-1).format())).toBe('"#-1"');
    expect(
      RdoProtocol.format({
        raw: '', type: 'REQUEST', rid: 34, verb: RdoVerb.SEL, targetId: '8161308',
        action: RdoAction.SET, member: 'EnableEvents', args: [RdoValue.int(-1).format()],
      } as RdoPacket)
    ).toBe('C 34 sel 8161308 set EnableEvents="#-1"'); // (live capture)
  });

  it('does NOT auto-type numeric CALL args (numeric usernames stay OLEString)', () => {
    expect(currentCallToken('12345')).toBe('"%12345"');
  });
});

describe('P-M2 §1 — the only divergences are hostile inputs, and they become safe', () => {
  /** Payloads that took the unescaped prefix branch — the P-M2 hole itself. */
  const PREFIXED_HOSTILE: readonly string[] = [
    '%evil" call Evil "*" "',
    '$a"; C sel 1 call Evil "*" "',
    '"%evil" call Evil "*" "',
    '#1" call Evil "*" "',
  ];

  /** Payloads the old code already escaped — included to pin the non-regression. */
  const ALREADY_SAFE: readonly string[] = ['plain" call Evil "*" "', '"'];

  it.each([...PREFIXED_HOSTILE, ...ALREADY_SAFE])(
    '%j is re-escaped into one balanced literal',
    (arg) => {
      const token = currentCallToken(arg);
      expect(token.startsWith('"')).toBe(true);
      expect(token.endsWith('"')).toBe(true);
      // Balanced: strip escaped pairs, exactly two delimiters must remain.
      expect(token.replace(/""/g, '').match(/"/g)).toHaveLength(2);
      // Frames cleanly: the literal cannot terminate the frame early.
      expect(
        new RdoFramer().ingest(Buffer.from(`C sel 42 call M "^" ${token};`, 'latin1'))
      ).toHaveLength(1);
    }
  );

  /** Unescaped `"` — i.e. a quote not part of an escaped `""` pair — inside the body. */
  function hasUnescapedInnerQuote(token: string): boolean {
    return /"/.test(token.slice(1, -1).replace(/""/g, ''));
  }

  it.each(PREFIXED_HOSTILE)('%j went out unescaped before the fix', (arg) => {
    const legacy = legacyFormatTypedToken(arg, false);
    const current = currentCallToken(arg);
    expect(hasUnescapedInnerQuote(legacy)).toBe(true);   // the hole
    expect(hasUnescapedInnerQuote(current)).toBe(false); // closed
    expect(current).not.toBe(legacy);
  });

  it.each(ALREADY_SAFE)('%j was already safe and is unchanged', (arg) => {
    expect(currentCallToken(arg)).toBe(legacyFormatTypedToken(arg, false));
  });

  it('round-trips the hostile value back through the parser intact', () => {
    // The declared `%` becomes the literal's OLEString type prefix; the rest is
    // the value, quote included and correctly un-doubled on the way back.
    expect(RdoParser.getValue(currentCallToken('%evil" call Evil "*" "')))
      .toBe('evil" call Evil "*" "');
    expect(RdoParser.getPrefix(currentCallToken('%evil" call Evil "*" "'))).toBe('%');
  });

  it('preserves the caller-declared type prefix while escaping the body', () => {
    // The value keeps its OLEString type; only the quote is neutralised.
    expect(currentCallToken('%a"b')).toBe('"%a""b"');
    expect(currentCallToken('#1"x')).toBe('"#1""x"');
  });
});

// ---------------------------------------------------------------------------
// §2 — P-H3, identifier validation
// ---------------------------------------------------------------------------

describe('P-H3 — member names must be Delphi identifiers', () => {
  const REJECTED: readonly string[] = [
    'Foo" call Evil "*" "',   // the injection itself
    'Foo Bar',                // ReadIdent stops at the space
    'Foo;',                   // frame terminator glued on
    'Foo=1',
    '1Foo',                   // must not start with a digit
    'Foo.Bar',
    'Foo-Bar',
    'Prop\tName',
  ];

  const ACCEPTED: readonly string[] = [
    'RDOOpenSession', 'ServerBusy', 'EnableEvents', '_private', 'Tax0Id', 'a',
  ];

  it.each(REJECTED)('RdoProtocol.format rejects member %j', (member) => {
    expect(() =>
      RdoProtocol.format({
        raw: '', type: 'PUSH', verb: RdoVerb.SEL, targetId: '42',
        action: RdoAction.CALL, member, args: [],
      } as RdoPacket)
    ).toThrow(RdoIdentifierError);
  });

  it.each(REJECTED)('RdoCommand.call rejects %j', (member) => {
    expect(() => RdoCommand.sel(42).call(member)).toThrow(RdoIdentifierError);
  });

  it.each(REJECTED)('RdoCommand.get/set reject %j', (member) => {
    expect(() => RdoCommand.sel(42).get(member)).toThrow(RdoIdentifierError);
    expect(() => RdoCommand.sel(42).set(member)).toThrow(RdoIdentifierError);
  });

  it.each(ACCEPTED)('accepts %j', (member) => {
    expect(() => RdoCommand.sel(42).call(member).build()).not.toThrow();
    expect(() =>
      RdoProtocol.format({
        raw: '', type: 'PUSH', verb: RdoVerb.SEL, targetId: '42',
        action: RdoAction.GET, member,
      } as RdoPacket)
    ).not.toThrow();
  });

  it('carries a protocol error code instead of being a bare Error', () => {
    try {
      RdoCommand.sel(42).call('Foo Bar');
      throw new Error('should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(RdoIdentifierError);
      const typed = err as RdoIdentifierError;
      expect(typed.errorCode).toBe(29); // ERROR_InvalidParameter
      expect(typed.identifier).toBe('Foo Bar');
      expect(typed.context).toBe('call');
      expect(typed.name).toBe('RdoIdentifierError');
    }
  });

  it('rejects an empty member only at the WS frontier, not in format()', () => {
    // format() simply omits a falsy member — pre-existing behaviour, and not an
    // injection vector. `RdoCommand` rejects it before that point.
    expect(
      RdoProtocol.format({
        raw: '', type: 'PUSH', verb: RdoVerb.SEL, targetId: '42',
        action: RdoAction.CALL, member: '', args: [],
      } as RdoPacket)
    ).toBe('C sel 42 call "*"');
    expect(() => RdoCommand.sel(42).call('')).toThrow(RdoIdentifierError);
  });

  it('rejects the building-property injection path end to end', () => {
    // ws-handlers/building-handlers.ts relays req.propertyName into
    // RdoCommand.set / .call verbatim (building-property-handler.ts:147-174).
    expect(() =>
      RdoCommand.sel(4242).set('RDOAcceptCloning" call SellFacility "*" "').args(RdoValue.int(-1)).build()
    ).toThrow(RdoIdentifierError);
  });
});

// ---------------------------------------------------------------------------
// §3 — targetId and separator
// ---------------------------------------------------------------------------

describe('P-M2 §3 — targetId and separator cannot smuggle a sub-command', () => {
  const format = (over: Partial<RdoPacket>): string =>
    RdoProtocol.format({
      raw: '', type: 'PUSH', verb: RdoVerb.SEL, targetId: '42',
      action: RdoAction.CALL, member: 'M', separator: '"^"', args: [],
      ...over,
    } as RdoPacket);

  it('rejects a non-decimal sel targetId', () => {
    // targetId is spliced into the frame unquoted, so a malformed one becomes a
    // second sub-command; format() must refuse it at the chokepoint.
    expect(() => format({ targetId: '42 call Evil "*" "' })).toThrow('Invalid RDO target ID');
    expect(() => format({ targetId: '4 2' })).toThrow('Invalid RDO target ID');
    expect(() => format({ targetId: '-1' })).toThrow('Invalid RDO target ID');
    expect(() => format({ targetId: 'DirectoryServer' })).toThrow('Invalid RDO target ID');
  });

  it('still accepts a legitimate decimal object id', () => {
    expect(format({ targetId: '142217260' })).toBe('C sel 142217260 call M "^"');
  });

  it('escapes quotes in an idof name instead of breaking out of the literal', () => {
    const frame = format({ verb: RdoVerb.IDOF, targetId: 'X" call Evil "*" "', action: undefined, member: undefined });
    expect(frame).toBe('C idof "X"" call Evil ""*"" """');
    expect(new RdoFramer().ingest(Buffer.from(frame + ';', 'latin1'))).toHaveLength(1);
  });

  it('leaves a benign idof name byte-identical', () => {
    expect(format({ verb: RdoVerb.IDOF, targetId: 'DirectoryServer', action: undefined, member: undefined }))
      .toBe('C idof "DirectoryServer"'); // (live capture)
  });

  it('rejects a separator that is not a ReturnMarker', () => {
    expect(() => format({ separator: '^" "%x" get Password "' })).toThrow('Invalid RDO separator');
    expect(() => format({ separator: '~' })).toThrow('Invalid RDO separator');
    // An absent/empty separator is not an error — it falls back to the
    // QueryId-driven default (rdo.ts:386-388), which is existing behaviour.
    expect(format({ separator: '' })).toContain('"*"');
  });

  it('still normalises the four legitimate separator spellings', () => {
    expect(format({ separator: '^' })).toContain('"^"');
    expect(format({ separator: '"^"' })).toContain('"^"');
    expect(format({ separator: '*' })).toContain('"*"');
    expect(format({ separator: '"*"' })).toContain('"*"');
  });
});

// ---------------------------------------------------------------------------
// §4 — P-M1, RDOSearchKey
// ---------------------------------------------------------------------------

describe('P-M1 — RDOSearchKey pattern reaches the wire as OLEString', () => {
  afterEach(() => jest.restoreAllMocks());

  it('emits "%*pattern*", never "*pattern*"', async () => {
    const writes: Buffer[] = [];
    const socket = {
      write(chunk: Buffer | string): boolean {
        writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'latin1'));
        return true;
      },
      end(): void { /* no-op */ },
      destroyed: false,
    } as unknown as Socket;

    const session = new StarpeaceSession();
    jest.spyOn(session, 'createSocket').mockResolvedValue(socket);
    jest.spyOn(session, 'deleteSocket').mockImplementation(() => undefined);
    let rid = 1;
    jest.spyOn(session, 'sendRdoRequest').mockImplementation(
      async (_n: string, pd: Partial<RdoPacket>): Promise<RdoPacket> => {
        const packet = { ...pd, rid: rid++ } as RdoPacket;
        writeRdoFrame(socket, RdoProtocol.format(packet) + RDO_CONSTANTS.PACKET_DELIMITER, true);
        const payload = pd.verb === RdoVerb.IDOF
          ? 'objid="39751288"'
          : pd.member === 'RDOOpenSession' ? 'RDOOpenSession="#142217260"' : 'res="%"';
        return { raw: '', type: 'RESPONSE', rid: packet.rid, payload };
      }
    );
    session.setCurrentWorldInfo({ name: 'planitia' } as never);
    session.setCachedZonePath('Root/Areas/America/Worlds');

    await session.searchPeople('SPO_test3');

    const frames = new RdoFramer().ingest(Buffer.concat(writes));
    const search = frames.find((f) => RdoProtocol.parse(f).member === 'RDOSearchKey');
    expect(search).toBeDefined();

    // Delphi RDOSearchKey(SearchPattern, ValueNameList : widestring)
    // — Directory Server/DirectoryServer.pas:78. VoidId would decode the first
    // parameter to Unassigned (RDOUtils.pas:351-352) and destroy the pattern.
    expect(search!.replace(/^C \d+ /, 'C ')).toBe(
      'C sel 142217260 call RDOSearchKey "^" "%*SPO_test3*","%"'
    );
    expect(search).not.toContain('"*SPO_test3*"');
  });
});
