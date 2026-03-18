/**
 * PropertyDisplays — Read-only display components for building property values.
 *
 * RatioValue: progress bar showing current/max
 * BooleanValue: checkbox (editable) or Yes/No text (read-only)
 * StopToggle: Close/Open building button
 *
 * Extracted from PropertyGroup.tsx.
 */

import styles from './PropertyGroup.module.css';

// =============================================================================
// RATIO VALUE (progress bar)
// =============================================================================

export function RatioValue({ current, max }: { current: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  return (
    <div className={styles.ratioContainer}>
      <div className={styles.ratioBar}>
        <div className={styles.ratioFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.ratioText}>
        {max > 0 ? `${current}/${max}` : `${current}`}
      </span>
    </div>
  );
}

// =============================================================================
// BOOLEAN VALUE (checkbox for editable, text for read-only)
// =============================================================================

export function BooleanValue({
  value,
  canEdit,
  rdoName,
  onPropertyChange,
}: {
  value: string;
  canEdit: boolean;
  rdoName: string;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const numVal = parseInt(value, 10);
  const isTrue = (!isNaN(numVal) && numVal !== 0) || value.toLowerCase() === 'yes' || value.toLowerCase() === 'true';

  if (canEdit) {
    return (
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={isTrue}
        onChange={(e) => onPropertyChange(rdoName, e.target.checked ? -1 : 0)}
      />
    );
  }

  return (
    <span className={`${styles.value} ${isTrue ? styles.positive : styles.muted}`}>
      {isTrue ? 'Yes' : 'No'}
    </span>
  );
}

// =============================================================================
// STOP TOGGLE BUTTON (Close/Open building)
// =============================================================================

/**
 * Renders a "Close" or "Open" button based on the Stopped wordbool property.
 * Stopped=0  → building is open   → shows "Close" (danger: will stop operations)
 * Stopped≠0  → building is closed → shows "Open"  (safe: resumes operations)
 * Click sends: SET Stopped "#-1" (close) or "#0" (open) on CurrBlock.
 */
export function StopToggle({
  stoppedValue,
  onPropertyChange,
}: {
  stoppedValue: string;
  onPropertyChange: (name: string, value: number) => void;
}) {
  const numVal = parseInt(stoppedValue, 10);
  const isStopped = !isNaN(numVal) && numVal !== 0;
  const label = isStopped ? 'Open' : 'Close';
  const isDanger = !isStopped; // Closing an open building = destructive action

  return (
    <div className={styles.stopToggleRow}>
      <button
        className={`${styles.stopToggleBtn} ${isDanger ? styles.stopToggleBtnDanger : ''}`}
        onClick={() => onPropertyChange('Stopped', isStopped ? 0 : -1)}
      >
        {label}
      </button>
    </div>
  );
}
