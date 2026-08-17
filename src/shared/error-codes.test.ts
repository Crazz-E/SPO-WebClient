/**
 * Tests for the official Starpeace error codes.
 *
 * These numbers are a wire contract, not an internal enum: the model server
 * answers `res="#33"` and the gateway has to say "too many facilities". A value
 * that drifted by one would mislabel every refusal it names, silently. The
 * reference is the Delphi declaration in `Protocol/Protocol.pas:29-77`.
 */

import * as errorCodes from './error-codes';
import { getErrorMessage, NOERROR } from './error-codes';

/**
 * Every numeric constant the module exports, discovered from the module itself
 * so a constant added later is covered without touching this file.
 */
const EXPORTED_CODES: Array<[string, number]> = Object.entries(errorCodes)
  .flatMap(([name, value]) => (typeof value === 'number' ? [[name, value] as [string, number]] : []));

describe('error code values — Protocol.pas:29-77', () => {
  // The general band, Protocol.pas:29-63.
  it.each([
    ['NOERROR', 0],
    ['ERROR_Unknown', 1],
    ['ERROR_CannotInstantiate', 2],
    ['ERROR_AreaNotClear', 3],
    ['ERROR_UnknownClass', 4],
    ['ERROR_UnknownCompany', 5],
    ['ERROR_UnknownCluster', 6],
    ['ERROR_UnknownTycoon', 7],
    ['ERROR_CannotCreateTycoon', 8],
    ['ERROR_FacilityNotFound', 9],
    ['ERROR_TycoonNameNotUnique', 10],
    ['ERROR_CompanyNameNotUnique', 11],
    ['ERROR_InvalidUserName', 12],
    ['ERROR_InvalidPassword', 13],
    ['ERROR_InvalidCompanyId', 14],
    ['ERROR_AccessDenied', 15],
    ['ERROR_CannotSetupEvents', 16],
    ['ERROR_AccountActive', 17],
    ['ERROR_AccountDisabled', 18],
    ['ERROR_InvalidLogonData', 19],
    ['ERROR_ModelServerIsDown', 20],
    ['ERROR_UnknownCircuit', 21],
    ['ERROR_CannotCreateSeg', 22],
    ['ERROR_CannotBreakSeg', 23],
    ['ERROR_LoanNotGranted', 24],
    ['ERROR_InvalidMoneyValue', 25],
    ['ERROR_InvalidProxy', 26],
    ['ERROR_RequestDenied', 27],
    ['ERROR_ZoneMissmatch', 28],
    ['ERROR_InvalidParameter', 29],
    ['ERROR_InsuficientSpace', 30],
    ['ERROR_CannotRegisterEvents', 31],
    ['ERROR_NotEnoughRoom', 32],
    ['ERROR_TooManyFacilities', 33],
    ['ERROR_BuildingTooClose', 34],
    // Politics band, Protocol.pas:68-70.
    ['ERROR_POLITICS_NOTALLOWED', 100],
    ['ERROR_POLITICS_REJECTED', 101],
    ['ERROR_POLITICS_NOTIME', 102],
    // Logon band, Protocol.pas:73-77 — note 111 is absent there too.
    ['ERROR_AccountAlreadyExists', 110],
    ['ERROR_UnexistingAccount', 112],
    ['ERROR_SerialMaxed', 113],
    ['ERROR_InvalidSerial', 114],
    ['ERROR_SubscriberIdNotFound', 115],
  ])('%s is %i on the wire', (name, value) => {
    expect(errorCodes[name as keyof typeof errorCodes]).toBe(value);
  });

  it('declares exactly the codes the Delphi unit declares', () => {
    // 35 general + 3 politics + 5 logon. A new constant here must be added to
    // the table above, with its Protocol.pas line.
    expect(EXPORTED_CODES).toHaveLength(43);
  });

  it('gives each code a distinct value', () => {
    const values = EXPORTED_CODES.map(([, value]) => value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('getErrorMessage', () => {
  it.each(EXPORTED_CODES)('translates %s (%i) to a message of its own', (_name, code) => {
    const message = getErrorMessage(code);

    expect(message).not.toBe('');
    // Falling through to the `Error N` default means the switch lost a case.
    expect(message).not.toBe(`Error ${code}`);
  });

  it('never reuses a message for two different codes', () => {
    const byMessage = new Map<string, string[]>();
    for (const [name, code] of EXPORTED_CODES) {
      const message = getErrorMessage(code);
      byMessage.set(message, [...(byMessage.get(message) ?? []), name]);
    }

    const collisions = [...byMessage].filter(([, names]) => names.length > 1);
    expect(collisions).toEqual([]);
  });

  it('translates success, which is code 0 and therefore falsy', () => {
    // A guard written as `if (!errorCode) return ''` would swallow this one.
    expect(getErrorMessage(NOERROR)).toBe('No error');
  });

  it('names the refusals the build path depends on', () => {
    expect(getErrorMessage(3)).toBe('Area not clear');
    expect(getErrorMessage(33)).toBe('Too many facilities');
    expect(getErrorMessage(34)).toBe('Building too close');
  });

  it.each([
    [35, 'the gap between the general and politics bands'],
    [99, 'just below the politics band'],
    [103, 'just above the politics band'],
    [111, 'the hole the Delphi unit leaves between 110 and 112'],
    [116, 'just above the logon band'],
    [999, 'far outside every band'],
  ])('falls back to "Error %i" for %s', (code) => {
    expect(getErrorMessage(code)).toBe(`Error ${code}`);
  });

  it('falls back rather than throwing on a negative or non-integer code', () => {
    // `parseResultCode` returns -1 when a payload carries no `res="#N"`
    // (rdo-helpers.ts:179), and that value reaches here on the failure path.
    expect(getErrorMessage(-1)).toBe('Error -1');
    expect(getErrorMessage(1.5)).toBe('Error 1.5');
  });
});
