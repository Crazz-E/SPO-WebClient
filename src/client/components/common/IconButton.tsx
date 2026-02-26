/**
 * IconButton — Standardized icon button with tooltip.
 * Used in LeftRail, RightRail, action bars, etc.
 */

import { type ReactNode, forwardRef } from 'react';
import styles from './IconButton.module.css';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonVariant = 'ghost' | 'glass' | 'solid';

interface IconButtonProps {
  icon: ReactNode;
  label: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  badge?: number;
  onClick?: () => void;
  className?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      size = 'md',
      variant = 'ghost',
      active = false,
      danger = false,
      disabled = false,
      badge,
      onClick,
      className,
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        className={`${styles.button} ${styles[size]} ${styles[variant]} ${active ? styles.active : ''} ${danger ? styles.danger : ''} ${className ?? ''}`}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        title={label}
      >
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className={styles.badge}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
  },
);
