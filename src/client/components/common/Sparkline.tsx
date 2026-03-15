/**
 * Sparkline — Tiny inline SVG chart for showing trends.
 * Renders a polyline with optional end dot and gradient area fill.
 */

import styles from './Sparkline.module.css';

type SparklineColor = 'positive' | 'negative' | 'gold' | 'neutral';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Color variant. Auto-detects from trend direction if omitted. */
  color?: SparklineColor;
  /** Show dot on last data point. Default true. */
  showDot?: boolean;
  className?: string;
}

function autoColor(data: number[]): SparklineColor {
  if (data.length < 2) return 'neutral';
  const first = data[0];
  const last = data[data.length - 1];
  if (last > first) return 'positive';
  if (last < first) return 'negative';
  return 'neutral';
}

export function Sparkline({
  data,
  width = 40,
  height = 16,
  color,
  showDot = true,
  className,
}: SparklineProps) {
  if (data.length < 2) return null;

  const resolvedColor = color ?? autoColor(data);
  const pad = showDot ? 2 : 0;
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * plotW;
    const y = pad + plotH - ((v - min) / range) * plotH;
    return `${x},${y}`;
  });

  const lastX = pad + plotW;
  const lastY = pad + plotH - ((data[data.length - 1] - min) / range) * plotH;

  const areaPath = `M${points.join(' L')} L${lastX},${height} L${pad},${height} Z`;

  return (
    <svg
      className={`${styles.sparkline} ${styles[resolvedColor]} ${className ?? ''}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Trend sparkline"
    >
      <path className={styles.area} d={areaPath} />
      <polyline className={styles.line} points={points.join(' ')} />
      {showDot && <circle className={styles.dot} cx={lastX} cy={lastY} r={1.5} />}
    </svg>
  );
}
