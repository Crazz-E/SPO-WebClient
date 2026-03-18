/**
 * PlacementHUD — Mobile building placement controls.
 *
 * Replaces BottomNav during placement mode with Cancel / Rotate / Confirm buttons.
 * Ghost building stays at screen center; user pans map to position it.
 */

import { X, RotateCw, Check } from 'lucide-react';
import styles from './PlacementHUD.module.css';

interface PlacementHUDProps {
  onCancel: () => void;
  onRotate: () => void;
  onConfirm: () => void;
  canConfirm: boolean;
}

export function PlacementHUD({ onCancel, onRotate, onConfirm, canConfirm }: PlacementHUDProps) {
  return (
    <div className={styles.hud}>
      <button className={`${styles.btn} ${styles.cancel}`} onClick={onCancel} aria-label="Cancel placement">
        <X size={24} />
        <span className={styles.label}>Cancel</span>
      </button>

      <button className={`${styles.btn} ${styles.rotate}`} onClick={onRotate} aria-label="Rotate building">
        <RotateCw size={24} />
        <span className={styles.label}>Rotate</span>
      </button>

      <button
        className={`${styles.btn} ${styles.confirm}`}
        onClick={onConfirm}
        disabled={!canConfirm}
        aria-label="Confirm placement"
      >
        <Check size={24} />
        <span className={styles.label}>Confirm</span>
      </button>
    </div>
  );
}
