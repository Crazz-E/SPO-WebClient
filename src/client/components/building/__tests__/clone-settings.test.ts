/**
 * Tests for CloneSettings helpers — parseCloneMenu pipe-delimited parser.
 *
 * Archaeology: ManagementSheet.pas:137-149, CompStringsParser.pas:93-116
 * Format: "Label|decimalValue|Label|decimalValue|..."
 */

import { parseCloneMenu } from '../PropertyGroup';

describe('parseCloneMenu', () => {
  it('returns empty array for empty string', () => {
    expect(parseCloneMenu('')).toEqual([]);
  });

  it('returns empty array for undefined-like falsy input', () => {
    expect(parseCloneMenu(undefined as unknown as string)).toEqual([]);
  });

  it('parses single option pair', () => {
    // WorkCenter: "Salaries|256|"
    expect(parseCloneMenu('Salaries|256|')).toEqual([
      { label: 'Salaries', value: 256 },
    ]);
  });

  it('parses multiple option pairs', () => {
    // ServiceBlock: "Price|65536|Suppliers|4|Ads|131072|"
    expect(parseCloneMenu('Price|65536|Suppliers|4|Ads|131072|')).toEqual([
      { label: 'Price', value: 65536 },
      { label: 'Suppliers', value: 4 },
      { label: 'Ads', value: 131072 },
    ]);
  });

  it('handles trailing pipe (standard Delphi format)', () => {
    expect(parseCloneMenu('Rent|65536|Maintenance|131072|')).toEqual([
      { label: 'Rent', value: 65536 },
      { label: 'Maintenance', value: 131072 },
    ]);
  });

  it('handles no trailing pipe', () => {
    expect(parseCloneMenu('Suppliers|4')).toEqual([
      { label: 'Suppliers', value: 4 },
    ]);
  });

  it('ignores trailing label without value (odd number of parts)', () => {
    expect(parseCloneMenu('Price|65536|Orphan')).toEqual([
      { label: 'Price', value: 65536 },
    ]);
  });

  it('skips pairs with invalid (non-numeric) values', () => {
    expect(parseCloneMenu('Good|42|Bad|notanumber|Also|99|')).toEqual([
      { label: 'Good', value: 42 },
      { label: 'Also', value: 99 },
    ]);
  });

  it('skips pairs where label is empty after filtering', () => {
    // An empty label followed by a value means the pair is ['', '42']
    // After split + filter(s => s.length > 0), empty strings are removed
    // So '|42|Valid|99|' becomes ['42', 'Valid', '99'] — pairs: ('42', 'Valid'), orphan '99'
    expect(parseCloneMenu('|42|Valid|99|')).toEqual([]);
  });

  it('trims whitespace from labels', () => {
    expect(parseCloneMenu(' Salaries |256|')).toEqual([
      { label: 'Salaries', value: 256 },
    ]);
  });

  it('produces correct bitmask values for known Delphi constants', () => {
    // CloneOptions.pas constants
    const result = parseCloneMenu('Suppliers|4|Clients|8|Salaries|256|Price|65536|Ads|131072|');
    expect(result).toHaveLength(5);
    // OR them together like ManagementSheet.pas:btnCloneClick
    let bitmask = 0;
    for (const opt of result) bitmask |= opt.value;
    expect(bitmask).toBe(4 | 8 | 256 | 65536 | 131072);
    expect(bitmask).toBe(0x3010C);
  });
});
