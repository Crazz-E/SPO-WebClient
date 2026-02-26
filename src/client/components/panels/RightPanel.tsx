/**
 * RightPanel — Slide-in panel from right edge.
 * Used for building inspector, mail, search, politics, transport.
 * Only one at a time — controlled by ui-store.rightPanel.
 */

import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { usePanel } from '../../hooks/usePanel';
import styles from './RightPanel.module.css';

interface RightPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function RightPanel({ open, onClose, title, icon, children }: RightPanelProps) {
  const { visible, animating } = usePanel(open);

  if (!visible) return null;

  return (
    <>
      {/* Scrim — click to close */}
      <div
        className={`${styles.scrim} ${animating ? styles.scrimVisible : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
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
    </>
  );
}
