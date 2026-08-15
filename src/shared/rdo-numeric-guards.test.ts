import { RdoValue, stripRdoPrefix, RDO_PREFIX_CHARS } from './rdo-types';
import { TIMEOUT_CONFIG, TimeoutCategory } from './timeout-categories';

/**
 * Annex findings P-M4, P-M6 and O-L4.
 */

// =============================================================================
// P-M4 — the numeric constructors could emit a non-numeric literal
// =============================================================================
describe('RdoValue numeric guards (P-M4)', () => {
  it('formats ordinary values unchanged', () => {
    expect(RdoValue.int(42).format()).toBe('"#42"');
    expect(RdoValue.int(-1).format()).toBe('"#-1"'); // Delphi wordbool TRUE
    expect(RdoValue.double(1234.5).format()).toBe('"@1234.5"');
    expect(RdoValue.float(3.14).format()).toBe('"!3.14"');
  });

  // `Math.floor(NaN)` is `NaN`, so the old int() produced `"#NaN"` and handed a
  // malformed query to the shared server. Coordinates arrive from browser JSON
  // with nothing validating them at the WS boundary.
  it.each([NaN, Infinity, -Infinity])('refuses %p rather than emitting it', bad => {
    expect(() => RdoValue.int(bad)).toThrow(RangeError);
    expect(() => RdoValue.double(bad)).toThrow(RangeError);
    expect(() => RdoValue.float(bad)).toThrow(RangeError);
  });

  // Above 2^53 a number stringifies as `1e+21`, which is not an RDO ordinal.
  it('refuses an integer beyond the safe range', () => {
    expect(() => RdoValue.int(1e21)).toThrow(/safe integer/);
  });

  it('never produces a literal that is not numeric', () => {
    for (const value of [0, -0, 1, -1, 2 ** 31, -(2 ** 31), Number.MAX_SAFE_INTEGER]) {
      const formatted = RdoValue.int(value).format();
      expect(formatted).toMatch(/^"#-?\d+"$/);
    }
  });
});

// =============================================================================
// P-M6 — `!` and `^` were missing from every prefix-strip
// =============================================================================
describe('stripRdoPrefix (P-M6)', () => {
  it('covers all seven prefixes, not the four that were hardcoded', () => {
    expect(RDO_PREFIX_CHARS).toHaveLength(7);
    for (const prefix of RDO_PREFIX_CHARS) {
      expect(stripRdoPrefix(`${prefix}value`)).toBe('value');
    }
  });

  // The concrete failure: a `single` property arrives as `!0.85`, the old
  // `[$#%@]` strip left the `!` in place, and parseFloat gave NaN.
  it('strips SingleId so the value stays parseable as a number', () => {
    expect(parseFloat(stripRdoPrefix('!0.85'))).toBeCloseTo(0.85);
    // What the old strip produced:
    expect(parseFloat('!0.85'.replace(/^[$#%@]/, ''))).toBeNaN();
  });

  it('strips VariantId', () => {
    expect(stripRdoPrefix('^whatever')).toBe('whatever');
  });

  it('leaves a value with no prefix alone', () => {
    expect(stripRdoPrefix('plain')).toBe('plain');
    expect(stripRdoPrefix('')).toBe('');
  });

  it('removes only the first prefix character', () => {
    expect(stripRdoPrefix('##42')).toBe('#42');
  });
});

// =============================================================================
// O-L4 — wsMs is not consumed anywhere; keep the invariant it encodes
// =============================================================================
describe('TIMEOUT_CONFIG (O-L4)', () => {
  // The header used to claim "L3 always rejects first" as if a WS timer enforced
  // it. There is no WS timer. These values only describe what one would have to
  // respect, so the ordering is what is worth pinning.
  it.each(Object.values(TimeoutCategory))('%s keeps wsMs above rdoMs', category => {
    const { rdoMs, wsMs } = TIMEOUT_CONFIG[category as TimeoutCategory];
    expect(wsMs).toBeGreaterThan(rdoMs);
  });
});
