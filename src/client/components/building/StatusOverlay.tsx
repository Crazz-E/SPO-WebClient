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
import { ProgressBar } from '../common';
import styles from './StatusOverlay.module.css';

/** Gap between caret tip and texture top (pixels). */
const CARET_GAP = 8;

/** Max visible sales rows in the overlay (full details via INSPECT). */
const MAX_SALES_ROWS = 4;

/** Parsed sales line from "Category sales at N%" format. */
export interface SalesLine {
  category: string;
  percent: number;
}

/** Parse multi-line salesInfo into structured data.
 *  Supports two formats:
 *  - "Category sales at N%" (one per line, commerce buildings)
 *  - "Category1: N% Category2: M%..." (inline, storage/warehouse buildings)
 */
export function parseSalesLines(salesInfo: string): SalesLine[] {
  // Try newline-separated "X sales at N%" format first
  const lines = salesInfo
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const salesAtResults = lines
    .map(line => {
      const match = line.match(/^(.+?)\s+sales\s+at\s+(\d+)%$/i);
      return match ? { category: match[1], percent: parseInt(match[2], 10) } : null;
    })
    .filter((item): item is SalesLine => item !== null);

  if (salesAtResults.length > 0) return salesAtResults;

  // Try inline "Category: N%" format (e.g. "Books: 0% Fresh Food: 4% Organic Materials: 4%.")
  // Pattern: one or more "Name: digits%" segments separated by spaces
  const full = salesInfo.trim().replace(/\.$/, ''); // strip trailing period
  const inlinePattern = /([A-Za-z][A-Za-z &]+?):\s*(\d+)%/g;
  const inlineResults: SalesLine[] = [];
  let m: RegExpExecArray | null;
  while ((m = inlinePattern.exec(full)) !== null) {
    inlineResults.push({ category: m[1].trim(), percent: parseInt(m[2], 10) });
  }

  return inlineResults;
}

/** Determine ProgressBar variant from sales percentage. */
export function salesVariant(percent: number): 'error' | 'warning' | 'success' {
  if (percent <= 25) return 'error';
  if (percent <= 60) return 'warning';
  return 'success';
}

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

      {building.salesInfo && (() => {
        const lines = parseSalesLines(building.salesInfo);
        if (lines.length > 0) {
          const visible = lines.slice(0, MAX_SALES_ROWS);
          const remaining = lines.length - MAX_SALES_ROWS;
          return (
            <div className={styles.salesList}>
              {visible.map((line, i) => (
                <div key={i} className={styles.salesRow}>
                  <div className={styles.salesHeader}>
                    <span className={styles.salesCategory}>{line.category}</span>
                    <span className={`${styles.salesPercent} ${styles[salesVariant(line.percent)]}`}>
                      {line.percent}%
                    </span>
                  </div>
                  <ProgressBar value={line.percent / 100} variant={salesVariant(line.percent)} height={2} />
                </div>
              ))}
              {remaining > 0 && (
                <span className={styles.salesMore}>+{remaining} more</span>
              )}
            </div>
          );
        }
        // Fallback: single-line display for non-sales formats
        return <div className={styles.salesInfo}>{building.salesInfo}</div>;
      })()}

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
