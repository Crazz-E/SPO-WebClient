/**
 * StatusTicker — Floating status bar showing detailsText (green) and hintsText (orange)
 * from the currently focused building's RefreshObject data.
 *
 * Centered horizontally near the top of the screen (z-350).
 * Visible whenever a building is focused and has status text,
 * regardless of overlay vs panel mode. Click-through (pointer-events: none).
 */

import { useBuildingStore } from '../../store/building-store';
import { parseDetailsText } from '../building/QuickStats';
import styles from './StatusTicker.module.css';

export function StatusTicker() {
  const building = useBuildingStore((s) => s.focusedBuilding);
  const isOverlay = useBuildingStore((s) => s.isOverlayMode);

  const detailsText = building?.detailsText || '';
  const hintsText = building?.hintsText || '';

  // Hide when inspector panel/modal is open — hints are shown in QuickStats
  if (!isOverlay) return null;
  if (!detailsText && !hintsText) return null;

  const entries = detailsText ? parseDetailsText(detailsText) : [];
  const hasEntries = entries.length > 0;
  const showHint = hintsText && hintsText !== 'No hints for this facility.';

  return (
    <div className={styles.ticker} data-testid="status-ticker">
      {hasEntries ? (
        <div className={styles.detailGrid}>
          {entries.map((entry, i) => (
            <div key={i} className={styles.detailRow}>
              <span className={styles.detailLabel}>{entry.label}</span>
              <span className={styles.detailValue}>{entry.value}</span>
            </div>
          ))}
        </div>
      ) : (
        detailsText && (
          <div className={styles.detailsLine}>{detailsText}</div>
        )
      )}
      {showHint && (
        <div className={styles.hintsLine}>{hintsText}</div>
      )}
    </div>
  );
}
