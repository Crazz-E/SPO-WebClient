/**
 * StatusOverlay — Unified floating building popover.
 *
 * Tracks the focused building's screen position via rAF and displays:
 * - Header: building name + upgrade level badge
 * - Rich details: type-aware parsed production/storage/metrics
 * - Sales bars with progress indicators
 * - Owner + revenue pill
 * - Hints text (yellow)
 * - INSPECT / VISIT button
 *
 * Replaces both the old StatusOverlay and StatusTicker components.
 */

import { useState, useEffect, useRef } from 'react';
import { useBuildingStore } from '../../store/building-store';
import { worldToScreenCentered } from '../../bridge/client-bridge';
import { useClient } from '../../context/ClientContext';
import { isCivicBuilding } from '@/shared/building-details/civic-buildings';
import { ProgressBar } from '../common';
import {
  parseRichDetails,
  percentColor,
  formatNumber,
  type RichDetails,
  type MetricColor,
} from './RichDetails';
import styles from './StatusOverlay.module.css';

/** Gap between caret tip and texture top (pixels). */
const CARET_GAP = 8;

/** Max visible sales rows in the overlay (full details via INSPECT). */
const MAX_SALES_ROWS = 4;

/* ------------------------------------------------------------------ */
/*  Sales parsing (preserved API)                                      */
/* ------------------------------------------------------------------ */

/** Parsed sales line from "Category sales at N%" format. */
export interface SalesLine {
  category: string;
  percent: number;
}

/** Parse multi-line salesInfo into structured data. */
export function parseSalesLines(salesInfo: string): SalesLine[] {
  const lines = salesInfo
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const salesAtResults = lines
    .map(line => {
      const match = line.match(/^(.+?)\s+(?:sales|production)\s+at\s+(\d+)%$/i);
      return match ? { category: match[1], percent: parseInt(match[2], 10) } : null;
    })
    .filter((item): item is SalesLine => item !== null);

  if (salesAtResults.length > 0) return salesAtResults;

  const full = salesInfo.trim().replace(/\.$/, '');
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

export function revenueDirection(revenue: string): 'up' | 'down' | 'neutral' {
  if (!revenue) return 'neutral';
  if (revenue.includes('-')) return 'down';
  if (revenue.includes('$') && !revenue.includes('$0')) return 'up';
  return 'neutral';
}

/* Rich detail types, parsers, and helpers imported from RichDetails. */

/* ------------------------------------------------------------------ */
/*  Color + rendering helpers                                          */
/* ------------------------------------------------------------------ */

function colorClass(color?: MetricColor): string {
  switch (color) {
    case 'success': return styles.colorSuccess;
    case 'warning': return styles.colorWarning;
    case 'error':   return styles.colorError;
    case 'gold':    return styles.colorGold;
    default:        return styles.colorDefault;
  }
}

/** Render a small colored dot indicator for a percentage. */
function PerfDot({ value }: { value: string }) {
  const color = percentColor(value);
  return <span className={`${styles.perfDot} ${colorClass(color)}`} />;
}

/* ------------------------------------------------------------------ */
/*  Sub-renderers per building type                                    */
/* ------------------------------------------------------------------ */

function renderFarm(details: RichDetails) {
  return (
    <>
      {details.producing && details.producing.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Producing</div>
          {details.producing.map((item, i) => (
            <div key={i} className={styles.productCard}>
              <span className={styles.productName}>{item.name}</span>
              <div className={styles.chipRow}>
                <span className={styles.chipVolume}>{item.volume}</span>
                {item.quality && (
                  <span className={`${styles.chip} ${colorClass(percentColor(item.quality))}`}>
                    <PerfDot value={item.quality} />{item.quality} quality
                  </span>
                )}
                {item.efficiency && (
                  <span className={`${styles.chip} ${colorClass(percentColor(item.efficiency))}`}>
                    <PerfDot value={item.efficiency} />{item.efficiency} eff.
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {details.metrics && details.metrics.length > 0 && (
        <div className={styles.metricRow}>
          {details.metrics.map((m, i) => (
            <span key={i} className={styles.metricInline}>
              <span className={styles.metricLabel}>{m.label}</span>
              <span className={`${styles.metricValue} ${colorClass(m.color)}`}>{m.value}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function renderStorage(details: RichDetails) {
  return (
    <>
      {details.storing && details.storing.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Storing</div>
          {details.storing.map((item, i) => (
            <div key={i} className={styles.productCard}>
              <span className={styles.productName}>{item.name}</span>
              <div className={styles.chipRow}>
                <span className={styles.chipVolume}>{item.amount}</span>
                {item.quality && (
                  <span className={`${styles.chip} ${colorClass(percentColor(item.quality))}`}>
                    <PerfDot value={item.quality} />{item.quality} quality
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function renderStore(details: RichDetails) {
  return (
    <>
      {details.metrics && details.metrics.length > 0 && (
        <div className={styles.metricRow}>
          {details.metrics.map((m, i) => (
            <span key={i} className={styles.metricInline}>
              <span className={styles.metricLabel}>{m.label}</span>
              <span className={`${styles.metricValue} ${colorClass(m.color)}`}>{m.value}</span>
            </span>
          ))}
        </div>
      )}
      {details.customers && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Customers</div>
          {details.customers.potential && (
            <div className={styles.customerRow}>
              <span className={styles.customerLabel}>Potential /day</span>
              <span className={styles.customerValue}>{details.customers.potential}</span>
            </div>
          )}
          {details.customers.actual && (
            <div className={styles.customerRow}>
              <span className={styles.customerLabel}>Actual</span>
              <span className={styles.customerValue}>{details.customers.actual}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function renderResidential(details: RichDetails) {
  return (
    <>
      <div className={styles.metricRow}>
        {details.inhabitants && (
          <span className={styles.metricInline}>
            <span className={styles.metricLabel}>Inhabitants</span>
            <span className={`${styles.metricValue} ${styles.colorDefault}`}>{details.inhabitants}</span>
          </span>
        )}
        {details.desirability && (
          <span className={styles.metricInline}>
            <span className={styles.metricLabel}>Desirability</span>
            <span className={`${styles.metricValue} ${styles.colorDefault}`}>{details.desirability}</span>
          </span>
        )}
      </div>
      {details.qolMetrics && details.qolMetrics.length > 0 && (
        <div className={styles.pillRow}>
          {details.qolMetrics.map((m, i) => (
            <span key={i} className={`${styles.pill} ${colorClass(m.color)}`}>
              <PerfDot value={m.value} />{m.label} {m.value}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function renderPublic(details: RichDetails) {
  return (
    <>
      {details.coverages && details.coverages.length > 0 && (
        <div className={styles.metricRow}>
          {details.coverages.map((c, i) => (
            <span key={i} className={styles.metricInline}>
              <span className={styles.metricLabel}>{c.label}</span>
              <span className={`${styles.metricValue} ${colorClass(c.color)}`}>
                <PerfDot value={c.value} />{c.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function renderTownHall(details: RichDetails) {
  if (!details.classes) return null;
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeader}>Population</div>
      {details.classes.map((c, i) => (
        <div key={i} className={styles.classRow}>
          <span className={styles.classLabel}>{c.label}</span>
          <span className={styles.classValue}>{c.value}</span>
        </div>
      ))}
    </div>
  );
}

function renderHQ(details: RichDetails) {
  return (
    <>
      {details.status && (
        <div className={styles.hqStatus}>{details.status}</div>
      )}
      {details.research && (
        <div className={styles.metricRow}>
          <span className={styles.metricInline}>
            <span className={styles.metricLabel}>Research Implementation</span>
            <span className={`${styles.metricValue} ${styles.colorDefault}`}>{details.research}</span>
          </span>
        </div>
      )}
    </>
  );
}

function renderGeneric(details: RichDetails) {
  if (!details.entries || details.entries.length === 0) return null;
  return (
    <div className={styles.genericGrid}>
      {details.entries.map((e, i) => (
        <div key={i} className={styles.genericRow}>
          <span className={styles.genericLabel}>{e.label}</span>
          <span className={styles.genericValue}>{e.value}</span>
        </div>
      ))}
    </div>
  );
}

function renderRichDetails(details: RichDetails) {
  switch (details.category) {
    case 'farm':        return renderFarm(details);
    case 'storage':     return renderStorage(details);
    case 'store':       return renderStore(details);
    case 'residential': return renderResidential(details);
    case 'public':      return renderPublic(details);
    case 'townhall':    return renderTownHall(details);
    case 'hq':          return renderHQ(details);
    case 'generic':     return renderGeneric(details);
  }
}

/* ------------------------------------------------------------------ */
/*  StatusOverlay component                                            */
/* ------------------------------------------------------------------ */

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
  const richDetails = building.detailsText ? parseRichDetails(building.detailsText) : null;
  const showHint = building.hintsText && building.hintsText !== 'No hints for this facility.';

  return (
    <div
      className={styles.overlay}
      style={{
        left: screenPos.x,
        top: screenPos.y - CARET_GAP,
      }}
      data-testid="status-overlay"
    >
      {/* Header: building name + upgrade level badge */}
      <div className={styles.header}>
        <div className={styles.buildingName}>{building.buildingName}</div>
        {richDetails?.upgradeLevel !== undefined && (
          <span className={styles.levelBadge}>Lvl {richDetails.upgradeLevel}</span>
        )}
      </div>

      {/* Rich details section */}
      {richDetails && (
        <div className={styles.detailsSection}>
          {renderRichDetails(richDetails)}
        </div>
      )}

      {/* Fallback raw detailsText when parser returns nothing */}
      {!richDetails && building.detailsText && (
        <div className={styles.detailsRaw}>{building.detailsText}</div>
      )}

      {/* Sales bars */}
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
        return <div className={styles.salesInfo}>{building.salesInfo}</div>;
      })()}

      {/* Owner + revenue row */}
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

      {/* Hints */}
      {showHint && (
        <div className={styles.hintsLine}>{building.hintsText}</div>
      )}

      {/* Action button */}
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
