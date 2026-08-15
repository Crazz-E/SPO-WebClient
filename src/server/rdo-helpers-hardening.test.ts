import { parsePropertyResponse, parseResultCode, redactSensitiveRdoFrame } from './rdo-helpers';

/**
 * Annex findings P-L8, P-M5 and P-L9.
 *
 * Three small defects that share one shape: a regex written for the easy input,
 * which then failed silently on the hard one.
 */

// =============================================================================
// P-L8 — a password containing a quote leaked in the clear
// =============================================================================
describe('redactSensitiveRdoFrame (P-L8)', () => {
  it('redacts an ordinary password', () => {
    const frame = 'C 3 sel 42 call RDOLogonUser "^" "%SPO_test3","%hunter2";';
    expect(redactSensitiveRdoFrame(frame)).toContain('[REDACTED]');
    expect(redactSensitiveRdoFrame(frame)).not.toContain('hunter2');
  });

  // The defect: on the wire a `"` inside a value is doubled (RDOStrEncode,
  // RDOUtils.pas:246-254). `[^"]*` stopped at the first one, the anchor then
  // failed, and the whole frame — password included — went to the log.
  it('redacts a password containing a quote', () => {
    const frame = 'C 3 sel 42 call RDOLogonUser "^" "%SPO_test3","%pa""ss";';
    const redacted = redactSensitiveRdoFrame(frame);

    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('pa""ss');
  });

  it.each([
    'C 3 sel 42 call Logon "^" "%user","%p""w""d";',
    'C 3 sel 42 call AccountStatus "^" "%user","%""quoted""";',
    'C 3 sel 42 call RDOLogonClient "^" "%user","%end""";',
  ])('redacts every sensitive member: %s', frame => {
    expect(redactSensitiveRdoFrame(frame)).not.toMatch(/,"%(?!\[REDACTED\])/);
  });

  it('leaves non-sensitive frames untouched', () => {
    const frame = 'C 3 sel 42 call SayThis "*" "%","%hello";';
    expect(redactSensitiveRdoFrame(frame)).toBe(frame);
  });
});

// =============================================================================
// P-M5 — the property regex was unescaped, unanchored and case-insensitive
// =============================================================================
describe('parsePropertyResponse (P-M5)', () => {
  it('reads the requested property', () => {
    expect(parsePropertyResponse('TycoonId="#22"', 'TycoonId')).toBe('22');
  });

  // The defect: unanchored, so `Property` matched inside `XProperty` and
  // returned the wrong value — silently, with no sign anything was wrong.
  it('does not match a property whose name merely ends with the one asked for', () => {
    const payload = 'XProperty="%wrong",Property="%right"';
    expect(parsePropertyResponse(payload, 'Property')).toBe('right');
  });

  // RDO identifiers are case-sensitive (ReadIdent, RDOUtils.pas:70-78); the `i`
  // flag made us accept a name the server would not have.
  //
  // The assertion is "does not return the value", not "returns empty": when no
  // property matches, the function falls through to a backward-compatibility
  // path that returns the cleaned payload. That fallback is pre-existing and
  // load-bearing for callers that pass a bare value, so P-M5 leaves it alone.
  it('is case-sensitive', () => {
    expect(parsePropertyResponse('TaxId="#5"', 'taxid')).not.toBe('5');
  });

  // Reachable because propertyName crosses the WS boundary (P-H3 / M-D).
  it('treats regex metacharacters in the name as literals', () => {
    expect(parsePropertyResponse('Tax0Id="#5"', 'Tax.Id')).not.toBe('5');
    expect(parsePropertyResponse('a+b="#7"', 'a+b')).toBe('7');
  });

  it('still unescapes doubled quotes inside the value', () => {
    expect(parsePropertyResponse('Name="%say ""hi"""', 'Name')).toBe('say "hi"');
  });
});

// =============================================================================
// P-L9 — two different result-code regexes across seven call sites
// =============================================================================
describe('parseResultCode (P-L9)', () => {
  it('reads a success code', () => {
    expect(parseResultCode('res="#0"')).toBe(0);
  });

  it('reads a positive error code', () => {
    expect(parseResultCode('res="#33"')).toBe(33);
  });

  // The unsigned variant `/res="#(\d+)"/` failed to match this and fell through
  // to -1. Callers then reported failure — the right answer, by accident.
  it('reads a negative code instead of falling through to the default', () => {
    expect(parseResultCode('res="#-1"')).toBe(-1);
    expect(parseResultCode('res="#-22"')).toBe(-22);
  });

  it.each([undefined, null, '', 'no result here', 'res="%text"'])(
    'returns -1 for %p', payload => {
      expect(parseResultCode(payload)).toBe(-1);
    }
  );
});
