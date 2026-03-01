/**
 * StatusOverlay — Compact floating building info bubble.
 *
 * Shown above a building after the first map click (overlay mode).
 * A second click on the same building opens the full inspector panel.
 * Uses requestAnimationFrame to track the building's screen position
 * during scroll/zoom via the worldToScreenCentered bridge utility.
 */

import { useState, useEffect, useRef } from 'react';
import { useBuildingStore } from '../../store/building-store';
import { worldToScreenCentered } from '../../bridge/client-bridge';
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

  const detailLines = building.detailsText
    ? building.detailsText.split('\n').filter(Boolean)
    : [];

  const direction = revenueDirection(building.revenue);

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

      {building.ownerName && (
        <div className={styles.ownerName}>{building.ownerName}</div>
      )}

      {building.salesInfo && (
        <div className={styles.salesLine}>{building.salesInfo}</div>
      )}

      {building.revenue && (
        <div className={`${styles.revenueLine} ${revenueClass(building.revenue)}`}>
          <span className={styles.revenueArrow}>
            {direction === 'up' ? '\u25B2' : direction === 'down' ? '\u25BC' : '\u25CF'}
          </span>
          <span className={styles.revenueText}>{building.revenue}</span>
        </div>
      )}

      {detailLines.length > 0 && (
        <div className={styles.details}>
          {detailLines.map((line, i) => (
            <div key={i} className={styles.detailLine}>{line}</div>
          ))}
        </div>
      )}

      {building.hintsText && (
        <div className={styles.hints}>{building.hintsText}</div>
      )}

      <div className={styles.caret} />
    </div>
  );
}
