/**
 * Skeleton — Loading placeholder with shimmer animation.
 */

import styles from './Skeleton.module.css';

interface SkeletonProps {
  /** Width (CSS value). Defaults to 100%. */
  width?: string;
  /** Height (CSS value). Defaults to 1em. */
  height?: string;
  /** Border radius. Defaults to var(--radius-md). */
  radius?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = '1em', radius, className }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${className ?? ''}`}
      style={{
        width,
        height,
        borderRadius: radius ?? 'var(--radius-md)',
      }}
      aria-hidden="true"
    />
  );
}

/** Skeleton text block — multiple lines */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.lines}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height="0.875em"
        />
      ))}
    </div>
  );
}
