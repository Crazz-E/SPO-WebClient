/**
 * ProgressBar — Horizontal progress/ratio bar.
 */

import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  /** Value between 0 and 1 */
  value: number;
  /** Color variant */
  variant?: 'primary' | 'gold' | 'success' | 'warning' | 'error';
  /** Height in px. Defaults to 4. */
  height?: number;
  /** Show percentage label */
  showLabel?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  variant = 'primary',
  height = 4,
  showLabel = false,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const percent = Math.round(clamped * 100);

  return (
    <div className={`${styles.container} ${className ?? ''}`}>
      <div
        className={styles.track}
        style={{ height: `${height}px` }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`${styles.fill} ${styles[variant]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && <span className={styles.label}>{percent}%</span>}
    </div>
  );
}
