import { formatMoney, formatIncome, incomeSign } from './format-utils';

describe('formatMoney()', () => {
  it('formats numbers with thousands separators', () => {
    expect(formatMoney(1234567)).toBe('$1,234,567');
    expect(formatMoney(1000)).toBe('$1,000');
    expect(formatMoney(999)).toBe('$999');
    expect(formatMoney(0)).toBe('$0');
  });

  it('formats string values', () => {
    expect(formatMoney('1234567')).toBe('$1,234,567');
    expect(formatMoney('500000')).toBe('$500,000');
    expect(formatMoney('0')).toBe('$0');
  });

  it('handles pre-formatted strings with commas', () => {
    expect(formatMoney('1,234,567')).toBe('$1,234,567');
  });

  it('handles negative values', () => {
    expect(formatMoney(-5000)).toBe('-$5,000');
    expect(formatMoney('-15000')).toBe('-$15,000');
  });

  it('handles invalid input', () => {
    expect(formatMoney(NaN)).toBe('$0');
    expect(formatMoney('invalid')).toBe('$0');
    expect(formatMoney('')).toBe('$0');
  });

  it('rounds decimals', () => {
    expect(formatMoney(1234.56)).toBe('$1,235');
    expect(formatMoney('9999.99')).toBe('$10,000');
  });

  it('handles large values', () => {
    expect(formatMoney(1000000000)).toBe('$1,000,000,000');
    expect(formatMoney('50000000000')).toBe('$50,000,000,000');
  });
});

describe('formatIncome()', () => {
  it('formats positive income', () => {
    expect(formatIncome('5000')).toBe('+$5,000/h');
    expect(formatIncome('1234567')).toBe('+$1,234,567/h');
  });

  it('formats negative income', () => {
    expect(formatIncome('-1200')).toBe('-$1,200/h');
    expect(formatIncome('-500000')).toBe('-$500,000/h');
  });

  it('formats zero income', () => {
    expect(formatIncome('0')).toBe('$0/h');
    expect(formatIncome('')).toBe('$0/h');
  });

  it('strips non-numeric chars from input', () => {
    expect(formatIncome('$5000')).toBe('+$5,000/h');
    expect(formatIncome('+800')).toBe('+$800/h');
  });
});

describe('incomeSign()', () => {
  it('returns positive for positive values', () => {
    expect(incomeSign('5000')).toBe('positive');
    expect(incomeSign('+800')).toBe('positive');
  });

  it('returns negative for negative values', () => {
    expect(incomeSign('-1200')).toBe('negative');
  });

  it('returns neutral for zero or invalid', () => {
    expect(incomeSign('0')).toBe('neutral');
    expect(incomeSign('')).toBe('neutral');
    expect(incomeSign('abc')).toBe('neutral');
  });
});
