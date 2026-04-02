/**
 * Shared currency/number formatting utilities for the client UI.
 */

/** Format a numeric string or number as $X,XXX (with thousands separators, no decimals). */
export function formatMoney(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(num)) return '$0';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** Format an income-per-hour string with sign prefix, dollar sign, and thousands separators.
 *  Input: raw string like "5000", "-1200", "+800" from the server.
 *  Output: "+$5,000/h", "-$1,200/h", "$0/h".
 */
export function formatIncome(income: string): string {
  const cleaned = income.replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num === 0) return '$0/h';
  const abs = Math.abs(num).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return num > 0 ? `+$${abs}/h` : `-$${abs}/h`;
}

/** Determine sign of income string for color coding. */
export function incomeSign(income: string): 'positive' | 'negative' | 'neutral' {
  const cleaned = income.replace(/[^0-9.\-]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num) || num === 0) return 'neutral';
  return num > 0 ? 'positive' : 'negative';
}
