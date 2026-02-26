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
  onClick?: () => void;
}

export function GlassCard({ children, className, maxWidth, light, onClick }: GlassCardProps) {
  return (
    <div
      className={`${styles.card} ${light ? styles.light : ''} ${className ?? ''}`}
      style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
