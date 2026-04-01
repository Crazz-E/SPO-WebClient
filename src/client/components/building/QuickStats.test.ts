import { parseConstructionPercent, parseDetailsText } from './QuickStats';

describe('parseConstructionPercent', () => {
  it('should parse standard "X% completed." format', () => {
    expect(parseConstructionPercent('42% completed.')).toBe(42);
  });

  it('should parse without trailing period', () => {
    expect(parseConstructionPercent('42% completed')).toBe(42);
  });

  it('should parse 0% completed', () => {
    expect(parseConstructionPercent('0% completed.')).toBe(0);
  });

  it('should parse 100% completed', () => {
    expect(parseConstructionPercent('100% completed.')).toBe(100);
  });

  it('should be case-insensitive', () => {
    expect(parseConstructionPercent('75% Completed.')).toBe(75);
    expect(parseConstructionPercent('75% COMPLETED.')).toBe(75);
  });

  it('should return null for normal sales text', () => {
    expect(parseConstructionPercent('Pharmaceutics sales at 1%')).toBeNull();
  });

  it('should return null for revenue text', () => {
    expect(parseConstructionPercent('($144/h)')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseConstructionPercent('')).toBeNull();
  });

  it('should return null for partial match', () => {
    expect(parseConstructionPercent('50% is completed')).toBeNull();
    expect(parseConstructionPercent('about 50% completed.')).toBeNull();
  });
});

describe('parseDetailsText', () => {
  // --- Storage/Warehouse ---
  it('parses storage building with multi-item storing', () => {
    const input = 'Upgrade Level: 1  Storing: 211370 kg of Fresh Food at 51% qualiy index.  35229 kg of Organic Materials at 51% qualiy index.';
    const result = parseDetailsText(input);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result[1].label).toBe('Storing');
    expect(result[1].value).toContain('211370 kg');
  });

  // --- Retail/Commerce (Market) ---
  it('parses market building with all stats', () => {
    const input = 'Upgrade Level: 1  Items Sold: 18/h  Potential customers (per day): 53 hi, 119 mid, 1174 low. Actual customers: 36 hi, 44 mid, 219 low.  Efficiency: 92%  Desirability: 53';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result[1]).toEqual({ label: 'Items Sold', value: '18/h' });
    expect(result.find(e => e.label === 'Potential customers (per day)')?.value).toContain('53 hi');
    expect(result.find(e => e.label === 'Actual customers')?.value).toContain('36 hi');
    expect(result.find(e => e.label === 'Efficiency')?.value).toBe('92%');
    expect(result.find(e => e.label === 'Desirability')?.value).toBe('53');
  });

  // --- Retail (Drug Store with leading type text) ---
  it('strips leading building type text and parses remaining', () => {
    const input = 'Drug Store.  Upgrade Level: 1  Items Sold: 1/h  Efficiency: 87%  Desirability: 46';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result.find(e => e.label === 'Efficiency')?.value).toBe('87%');
    expect(result.find(e => e.label === 'Desirability')?.value).toBe('46');
    // "Drug Store." preamble should be stripped, not appear as an entry
    expect(result.every(e => e.label !== 'Drug Store')).toBe(true);
  });

  // --- Farm (period-abutted keys: "1.Workers") ---
  it('parses farm workforce with period-abutted keys', () => {
    const input = 'Upgrade Level: 1  Professionals: 1 of 1.Workers: 9 of 27.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result.find(e => e.label === 'Professionals')?.value).toBe('1 of 1');
    expect(result.find(e => e.label === 'Workers')?.value).toBe('9 of 27');
  });

  // --- Production/Industry ---
  it('parses production building details', () => {
    const input = 'Upgrade Level: 8 Producing: 1659 kg/day of Fresh Food at 51% quality index, 100% efficiency.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '8' });
    expect(result[1].label).toBe('Producing');
    expect(result[1].value).toContain('1659 kg/day');
  });

  // --- Public facility (Coverage key) ---
  it('parses public facility with Coverage key', () => {
    const input = 'Upgrade Level: 1 School Coverage: coverage accross the city reported at 100%.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result[1].label).toBe('School Coverage');
    expect(result[1].value).toContain('100%');
  });

  // --- Company HQ (no-colon sentence + key:value) ---
  it('parses company HQ with leading status sentence', () => {
    const input = 'Company supported at 200%. Research Implementation: $0.';
    const result = parseDetailsText(input);
    expect(result.some(e => e.label === 'Research Implementation')).toBe(true);
    expect(result.find(e => e.label === 'Research Implementation')?.value).toBe('$0');
  });

  // --- Simple market (fewer fields) ---
  it('parses simple market details', () => {
    const input = 'Upgrade Level: 1  Items Sold: 18/h  Efficiency: 92%  Desirability: 53';
    const result = parseDetailsText(input);
    expect(result).toEqual([
      { label: 'Upgrade Level', value: '1' },
      { label: 'Items Sold', value: '18/h' },
      { label: 'Efficiency', value: '92%' },
      { label: 'Desirability', value: '53' },
    ]);
  });

  // --- Edge cases ---
  it('returns empty array for empty string', () => {
    expect(parseDetailsText('')).toEqual([]);
  });

  it('returns empty array for text without colons', () => {
    expect(parseDetailsText('Producing goods')).toEqual([]);
  });

  it('returns empty array for null-ish input', () => {
    expect(parseDetailsText(undefined as unknown as string)).toEqual([]);
  });
});
