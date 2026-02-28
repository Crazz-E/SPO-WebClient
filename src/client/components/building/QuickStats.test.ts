import { parseConstructionPercent } from './QuickStats';

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
