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
    const input = 'Upgrade Level: 1  Storing: 684375 kg of Fresh Food at 51% qualiy index.  114065 kg of Organic Materials at 51% qualiy index.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result[1].label).toBe('Storing');
    expect(result[1].value).toContain('684375 kg');
    expect(result[1].value).toContain('114065 kg');
  });

  it('parses minimal detailsText (upgrade level only)', () => {
    const result = parseDetailsText('Upgrade Level: 1');
    expect(result).toEqual([{ label: 'Upgrade Level', value: '1' }]);
  });

  // --- Retail/Commerce (Store) ---
  it('parses store building with all stats', () => {
    const input = 'Upgrade Level: 3  Items Sold: 40/h  Potential customers (per day): 1 hi, 6 mid, 2083 low. Actual customers: 1 hi, 3 mid, 949 low.  Efficiency: 89%  Desirability: 51';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '3' });
    expect(result[1]).toEqual({ label: 'Items Sold', value: '40/h' });
    expect(result.find(e => e.label === 'Potential customers (per day)')?.value).toContain('1 hi');
    expect(result.find(e => e.label === 'Actual customers')?.value).toContain('1 hi');
    expect(result.find(e => e.label === 'Efficiency')?.value).toBe('89%');
    expect(result.find(e => e.label === 'Desirability')?.value).toBe('51');
  });

  it('parses store with leading type text (Drug Store)', () => {
    const input = 'Drug Store.  Upgrade Level: 1  Items Sold: 1/h  Efficiency: 87%  Desirability: 46';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result.find(e => e.label === 'Efficiency')?.value).toBe('87%');
    expect(result.find(e => e.label === 'Desirability')?.value).toBe('46');
  });

  it('parses simple store (fewer fields)', () => {
    const input = 'Upgrade Level: 1  Items Sold: 18/h  Efficiency: 92%  Desirability: 53';
    const result = parseDetailsText(input);
    expect(result).toEqual([
      { label: 'Upgrade Level', value: '1' },
      { label: 'Items Sold', value: '18/h' },
      { label: 'Efficiency', value: '92%' },
      { label: 'Desirability', value: '53' },
    ]);
  });

  // --- Farm (Production with double-period sub-items) ---
  it('parses farm with multi-product producing', () => {
    const input = 'Upgrade Level: 8  Producing: 1970 kg/day of Fresh Food at 51% quality index, 100% efficiency.. 329 kg/day of Organic Materials at 51% quality index, 100% efficiency..';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '8' });
    expect(result[1].label).toBe('Producing');
    expect(result[1].value).toContain('1970 kg/day');
    expect(result[1].value).toContain('329 kg/day');
  });

  it('parses farm with single product', () => {
    const input = 'Upgrade Level: 8 Producing: 1659 kg/day of Fresh Food at 51% quality index, 100% efficiency.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '8' });
    expect(result[1].label).toBe('Producing');
    expect(result[1].value).toContain('1659 kg/day');
  });

  it('parses farm workforce with period-abutted keys', () => {
    const input = 'Upgrade Level: 1  Professionals: 1 of 1.Workers: 9 of 27.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result.find(e => e.label === 'Professionals')?.value).toBe('1 of 1');
    expect(result.find(e => e.label === 'Workers')?.value).toBe('9 of 27');
  });

  // --- Residential ---
  it('parses residential building with QOL metrics', () => {
    const input = 'Upgrade Level: 3  4982 inhabitants. 15 desirability. QOL: 14% Neighborhood Quality: 104% Beauty: 1% Crime: 0% Pollution: 36%.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '3' });
    expect(result.find(e => e.label === 'Inhabitants')?.value).toBe('4982');
    expect(result.find(e => e.label === 'Desirability')?.value).toBe('15');
    expect(result.find(e => e.label === 'QOL')?.value).toBe('14%');
    expect(result.find(e => e.label === 'Neighborhood Quality')?.value).toBe('104%');
    expect(result.find(e => e.label === 'Beauty')?.value).toBe('1%');
    expect(result.find(e => e.label === 'Crime')?.value).toBe('0%');
    expect(result.find(e => e.label === 'Pollution')?.value).toBe('36%');
  });

  it('parses residential with different stats', () => {
    const input = 'Upgrade Level: 2  144 inhabitants. 72 desirability. QOL: 4% Neighborhood Quality: 100% Beauty: 5% Crime: 10% Pollution: 0%.';
    const result = parseDetailsText(input);
    expect(result.find(e => e.label === 'Inhabitants')?.value).toBe('144');
    expect(result.find(e => e.label === 'Desirability')?.value).toBe('72');
    expect(result.find(e => e.label === 'QOL')?.value).toBe('4%');
  });

  // --- Public facility (NO colon after Coverage key) ---
  it('parses public facility with Coverage keys (no colon)', () => {
    const input = 'Upgrade Level: 1   Police Coverage coverage accross the city reported at 91%. Fire Coverage coverage accross the city reported at 100%.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result.find(e => e.label === 'Police Coverage')?.value).toBe('91%');
    expect(result.find(e => e.label === 'Fire Coverage')?.value).toBe('100%');
  });

  it('parses single-coverage public facility', () => {
    const input = 'Upgrade Level: 1   School Coverage coverage accross the city reported at 100%.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result[1]).toEqual({ label: 'School Coverage', value: '100%' });
  });

  // --- Town Hall (no colons, comma-separated classes) ---
  it('parses town hall population classes', () => {
    const input = '143 High class (0% unemp), 385 Middle class (15% unemp), 4,981 Low class (57% unemp).';
    const result = parseDetailsText(input);
    expect(result).toEqual([
      { label: 'High class', value: '143 (0% unemp)' },
      { label: 'Middle class', value: '385 (15% unemp)' },
      { label: 'Low class', value: '4,981 (57% unemp)' },
    ]);
  });

  // --- Company HQ ---
  it('parses company HQ with leading status sentence', () => {
    const input = 'Company supported at 200%. Research Implementation: $0.';
    const result = parseDetailsText(input);
    expect(result.find(e => e.label === 'Status')?.value).toBe('Company supported at 200%');
    expect(result.find(e => e.label === 'Research Implementation')?.value).toBe('$0');
  });

  // --- Edge cases ---
  it('returns empty array for empty string', () => {
    expect(parseDetailsText('')).toEqual([]);
  });

  it('returns empty array for null-ish input', () => {
    expect(parseDetailsText(undefined as unknown as string)).toEqual([]);
  });

  it('returns empty array for empty detailsText (Trade Center)', () => {
    expect(parseDetailsText('')).toEqual([]);
  });
});
