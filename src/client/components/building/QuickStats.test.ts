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
  it('parses storage building details with multi-word values', () => {
    const input = 'Upgrade Level: 1  Storing: 211370 kg of Fresh Food at 51% qualiy index.  35229 kg of Organic Materials at 51% qualiy index.';
    const result = parseDetailsText(input);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
    expect(result[1].label).toBe('Storing');
  });

  it('parses market building details', () => {
    const input = 'Upgrade Level: 1  Items Sold: 18/h  Efficiency: 92%  Desirability: 53';
    const result = parseDetailsText(input);
    expect(result).toEqual([
      { label: 'Upgrade Level', value: '1' },
      { label: 'Items Sold', value: '18/h' },
      { label: 'Efficiency', value: '92%' },
      { label: 'Desirability', value: '53' },
    ]);
  });

  it('parses details with leading building type', () => {
    const input = 'Drug Store.  Upgrade Level: 1  Items Sold: 1/h  Efficiency: 87%';
    const result = parseDetailsText(input);
    expect(result.some(e => e.label === 'Upgrade Level')).toBe(true);
    expect(result.some(e => e.label === 'Efficiency')).toBe(true);
  });

  it('parses farm building workforce details', () => {
    const input = 'Upgrade Level: 1  Professionals: 1 of 1.Workers: 9 of 27.';
    const result = parseDetailsText(input);
    expect(result[0]).toEqual({ label: 'Upgrade Level', value: '1' });
  });

  it('returns empty array for empty string', () => {
    expect(parseDetailsText('')).toEqual([]);
  });

  it('returns empty array for text without colons', () => {
    expect(parseDetailsText('Producing goods')).toEqual([]);
  });
});
