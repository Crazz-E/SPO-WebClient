/**
 * GlassCard — Reusable glassmorphism container.
 * Used for floating overlays, auth cards, tooltips.
 */

import { type ReactNode } from 'react';
import styles from './GlassCard.module.css';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Max width in pixels. Defaults to none. */
  maxWidth?: number;
  /** Whether to use a lighter glass variant */
  light?: boolean;
  /** Surface style: 'solid' (default, opaque) or 'glass' (translucent blur) */
  variant?: 'solid' | 'glass';
  onClick?: () => void;
}

export function GlassCard({ children, className, maxWidth, light, variant = 'solid', onClick }: GlassCardProps) {
  const variantClass = variant === 'glass' ? styles.glass : styles.solid;
  return (
    <div
      className={`${styles.card} ${variantClass} ${light ? styles.light : ''} ${className ?? ''}`}
      style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
