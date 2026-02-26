/**
 * LeftPanel — Slide-in panel from left edge.
 * Used for Empire Overview. Independent of RightPanel (both can be open).
 */

import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { usePanel } from '../../hooks/usePanel';
import styles from './LeftPanel.module.css';

interface LeftPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function LeftPanel({ open, onClose, title, icon, children }: LeftPanelProps) {
  const { visible, animating } = usePanel(open);

  if (!visible) return null;

  return (
    <aside
      className={`${styles.panel} ${animating ? styles.open : styles.closed}`}
      role="complementary"
      aria-label={title}
    >
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <h2 className={styles.title}>{title}</h2>
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
          <X size={18} />
        </button>
      </div>
      <div className={styles.content}>
        {children}
      </div>
    </aside>
  );
}
