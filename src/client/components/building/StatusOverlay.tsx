/**
 * StatusOverlay — Minimal floating popover shown on first building click.
 *
 * Displays building name, owner, revenue pill, and an Inspect button.
 * Clicking Inspect opens the full inspector panel (same as double-clicking
 * the building on the map).
 *
 * Uses requestAnimationFrame to track the building's screen position
 * during scroll/zoom via the worldToScreenCentered bridge utility.
 */

import { useState, useEffect, useRef } from 'react';
import { useBuildingStore } from '../../store/building-store';
import { worldToScreenCentered } from '../../bridge/client-bridge';
import { useClient } from '../../context/ClientContext';
import { isCivicBuilding } from '@/shared/building-details/civic-buildings';
import styles from './StatusOverlay.module.css';

/** Gap between caret tip and texture top (pixels). */
const CARET_GAP = 8;

export function revenueClass(revenue: string): string {
  if (!revenue) return styles.revenueNeutral;
  if (revenue.includes('-')) return styles.revenueNegative;
  if (revenue.includes('$') && !revenue.includes('$0')) return styles.revenuePositive;
  return styles.revenueNeutral;
}

/** Determine revenue direction for arrow indicator. */
export function revenueDirection(revenue: string): 'up' | 'down' | 'neutral' {
  if (!revenue) return 'neutral';
  if (revenue.includes('-')) return 'down';
  if (revenue.includes('$') && !revenue.includes('$0')) return 'up';
  return 'neutral';
}

export function StatusOverlay() {
  const building = useBuildingStore((s) => s.focusedBuilding);
  const isOverlay = useBuildingStore((s) => s.isOverlayMode);
  const client = useClient();
  const [screenPos, setScreenPos] = useState<{
    x: number; y: number; textureHeight: number;
  } | null>(null);
  const rafRef = useRef<number>(0);

  // Track building position on screen via rAF
  useEffect(() => {
    if (!building || !isOverlay) {
      setScreenPos(null);
      return;
    }

    const update = () => {
      const pos = worldToScreenCentered(
        building.x, building.y,
        building.xsize ?? 1, building.ysize ?? 1
      );
      if (pos) {
        setScreenPos(pos);
      }
      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [building, isOverlay]);

  if (!building || !isOverlay || !screenPos) return null;

  const direction = revenueDirection(building.revenue);
  const isCivic = isCivicBuilding(building.visualClass || '0');

  return (
    <div
      className={styles.overlay}
      style={{
        left: screenPos.x,
        top: screenPos.y - CARET_GAP,
      }}
      data-testid="status-overlay"
    >
      <div className={styles.buildingName}>{building.buildingName}</div>

      <div className={styles.infoRow}>
        {building.ownerName && (
          <span className={styles.ownerName}>{building.ownerName}</span>
        )}
        {building.revenue && (
          <span className={`${styles.revenuePill} ${revenueClass(building.revenue)}`}>
            <span className={styles.revenueArrow}>
              {direction === 'up' ? '\u25B2' : direction === 'down' ? '\u25BC' : '\u25CF'}
            </span>
            {building.revenue}
          </span>
        )}
      </div>

      <button
        className={styles.inspectBtn}
        onClick={() => client.onInspectFocusedBuilding()}
        data-testid="inspect-button"
      >
        {isCivic ? 'VISIT' : 'INSPECT'}
      </button>

      <div className={styles.caret} />
    </div>
  );
}
