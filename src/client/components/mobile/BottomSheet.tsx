/**
 * BottomSheet — Slide-up panel for mobile building inspector.
 *
 * Shows a drag handle at top, content area scrolls.
 * Three states: collapsed (peek header), half-screen, full-screen.
 */

import { type ReactNode, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import styles from './BottomSheet.module.css';

type SheetHeight = 'peek' | 'half' | 'full';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const [height, setHeight] = useState<SheetHeight>('half');

  const cycleHeight = useCallback(() => {
    setHeight((prev) => {
      if (prev === 'peek') return 'half';
      if (prev === 'half') return 'full';
      return 'half';
    });
  }, []);

  if (!open) return null;

  const heightClass =
    height === 'full' ? styles.full : height === 'half' ? styles.half : styles.peek;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div className={`${styles.sheet} ${heightClass}`} role="dialog" aria-label={title}>
        {/* Drag handle */}
        <button className={styles.handleArea} onClick={cycleHeight} aria-label="Resize panel">
          <span className={styles.handle} />
        </button>

        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>{children}</div>
      </div>
    </>
  );
}
