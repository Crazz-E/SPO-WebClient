/**
 * CurrencyDisplay — Formats monetary values with K/M/B suffixes.
 */

interface CurrencyDisplayProps {
  value: string;
  /** Show +/- prefix for positive/negative values */
  showSign?: boolean;
  className?: string;
}

function formatCurrency(raw: string): string {
  const cleaned = raw.replace(/[$\s,]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return '$0';

  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  }
  return `${sign}$${abs.toFixed(2)}`;
}

export function CurrencyDisplay({ value, showSign, className }: CurrencyDisplayProps) {
  const formatted = formatCurrency(value);
  const num = parseFloat(value.replace(/[$\s,]/g, ''));
  const isPositive = num > 0;
  const isNegative = num < 0;

  let colorVar: string | undefined;
  if (showSign) {
    colorVar = isPositive
      ? 'var(--money-positive)'
      : isNegative
        ? 'var(--money-negative)'
        : 'var(--money-neutral)';
  }

  const prefix = showSign && isPositive ? '+' : '';

  return (
    <span
      className={`tabular-nums ${className ?? ''}`}
      style={colorVar ? { color: colorVar } : undefined}
    >
      {prefix}{formatted}
    </span>
  );
}
