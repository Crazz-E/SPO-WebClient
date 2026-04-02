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
import { parseDetailsText } from './QuickStats';
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

/* ------------------------------------------------------------------ */
/*  Rich detail types                                                  */
/* ------------------------------------------------------------------ */

type TickerCategory = 'farm' | 'storage' | 'store' | 'residential' | 'public' | 'townhall' | 'hq' | 'generic';
type MetricColor = 'success' | 'warning' | 'error' | 'gold' | 'default';

interface ProductionItem {
  name: string;
  volume: string;
  quality?: string;
  efficiency?: string;
}

interface StorageItem {
  name: string;
  amount: string;
  quality?: string;
}

interface MetricEntry {
  label: string;
  value: string;
  color?: MetricColor;
}

interface RichDetails {
  category: TickerCategory;
  upgradeLevel?: number;
  producing?: ProductionItem[];
  storing?: StorageItem[];
  metrics?: MetricEntry[];
  customers?: { potential: string; actual: string };
  inhabitants?: string;
  desirability?: string;
  qolMetrics?: MetricEntry[];
  coverages?: MetricEntry[];
  classes?: MetricEntry[];
  status?: string;
  research?: string;
  entries?: { label: string; value: string }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Color for percentage based on data-viz thresholds. */
export function percentColor(pctStr: string): MetricColor {
  const n = parseInt(pctStr, 10);
  if (isNaN(n)) return 'default';
  if (n > 100) return 'gold';
  if (n >= 80) return 'success';
  if (n >= 50) return 'warning';
  return 'error';
}

/** Locale-aware number formatting (thousands separators). */
export function formatNumber(value: string): string {
  const n = parseInt(value.replace(/,/g, ''), 10);
  if (isNaN(n)) return value;
  return n.toLocaleString('en-US');
}

function extractUpgrade(text: string): [number | undefined, string] {
  const m = text.match(/^Upgrade Level:\s*(\d+)\s*/);
  if (!m) return [undefined, text];
  return [parseInt(m[1], 10), text.substring(m[0].length)];
}

function trimValue(v: string): string {
  return v.replace(/\.+\s*$/, '').trim();
}

/* ------------------------------------------------------------------ */
/*  Rich parsers per building type                                     */
/* ------------------------------------------------------------------ */

function parseFarmRich(text: string): RichDetails {
  const [upgradeLevel, rest] = extractUpgrade(text);
  const items: ProductionItem[] = [];

  const normalized = rest.replace(/\.(?=[A-Z])/g, '. ');
  const producingMatch = normalized.match(/^Producing:\s*(.*)/s);
  if (producingMatch) {
    const products = producingMatch[1].split(/\.\.\s*/).filter(s => s.trim());
    for (const p of products) {
      const m = p.match(/^([\d,]+)\s+([\w/]+)\s+of\s+(.+?)\s+at\s+(\d+)%\s*qual\w*\s*index(?:,\s*(\d+)%\s*efficiency)?/);
      if (m) {
        items.push({
          name: m[3],
          volume: `${formatNumber(m[1])} ${m[2]}`,
          quality: `${m[4]}%`,
          efficiency: m[5] ? `${m[5]}%` : undefined,
        });
      }
    }
  }

  const metrics: MetricEntry[] = [];
  const workforceKeys = [...normalized.matchAll(/(Professionals|Workers):\s*([^.]*(?:\.\s*(?=[A-Z])|$))/g)];
  for (const wk of workforceKeys) {
    metrics.push({ label: wk[1], value: trimValue(wk[2]) });
  }

  return { category: 'farm', upgradeLevel, producing: items.length > 0 ? items : undefined, metrics: metrics.length > 0 ? metrics : undefined };
}

function parseStorageRich(text: string): RichDetails {
  const [upgradeLevel, rest] = extractUpgrade(text);
  const items: StorageItem[] = [];

  const storingMatch = rest.match(/^Storing:\s*(.*)/s);
  if (storingMatch) {
    const rawItems = storingMatch[1].split(/\.\s{2,}/).filter(s => s.trim());
    for (const raw of rawItems) {
      const m = raw.match(/^([\d,]+)\s+([\w]+)\s+of\s+(.+?)\s+at\s+(\d+)%/);
      if (m) {
        items.push({ name: m[3], amount: `${formatNumber(m[1])} ${m[2]}`, quality: `${m[4]}%` });
      }
    }
  }

  return { category: 'storage', upgradeLevel, storing: items.length > 0 ? items : undefined };
}

function parseStoreRich(text: string): RichDetails {
  const ulIndex = text.indexOf('Upgrade Level:');
  const cleaned = ulIndex > 0 ? text.substring(ulIndex) : text;
  const [upgradeLevel, rest] = extractUpgrade(cleaned);

  const metrics: MetricEntry[] = [];
  const segments = rest.split(/ {2,}/).map(s => s.trim()).filter(Boolean);
  let customers: { potential: string; actual: string } | undefined;

  for (const seg of segments) {
    const kvMatch = seg.match(/^(Potential customers \(per day\)|Actual customers|Items Sold|Efficiency|Desirability|Professionals|Workers):\s*(.*)/s);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    const rawVal = kvMatch[2];

    if (key === 'Potential customers (per day)') {
      const potActual = rawVal.match(/^(.*?)\.\s*Actual customers:\s*(.*)/s);
      if (potActual) {
        customers = { potential: trimValue(potActual[1]), actual: trimValue(potActual[2]) };
      } else {
        customers = { potential: trimValue(rawVal), actual: '' };
      }
    } else if (key === 'Actual customers') {
      if (customers) customers.actual = trimValue(rawVal);
      else customers = { potential: '', actual: trimValue(rawVal) };
    } else if (key === 'Efficiency') {
      metrics.push({ label: key, value: trimValue(rawVal), color: percentColor(rawVal) });
    } else if (key === 'Desirability') {
      const n = parseInt(rawVal, 10);
      metrics.push({ label: key, value: trimValue(rawVal), color: n >= 50 ? 'success' : n >= 30 ? 'warning' : 'error' });
    } else {
      metrics.push({ label: key, value: trimValue(rawVal) });
    }
  }

  return { category: 'store', upgradeLevel, metrics, customers };
}

function parseResidentialRich(text: string): RichDetails {
  const [upgradeLevel, rest] = extractUpgrade(text);

  const inhab = rest.match(/([\d,]+)\s+inhabitants/);
  const desir = rest.match(/(\d+)\s+desirability/);

  const qolMetrics: MetricEntry[] = [];
  const qolKeys = ['QOL', 'Neighborhood Quality', 'Beauty', 'Crime', 'Pollution'];
  for (const key of qolKeys) {
    const re = new RegExp(key.replace(/\s/g, '\\s') + ':\\s*(\\d+)%?');
    const m = rest.match(re);
    if (m) {
      const val = m[1] + '%';
      let color: MetricColor = 'default';
      if (key === 'Crime' || key === 'Pollution') {
        const n = parseInt(m[1], 10);
        color = n <= 10 ? 'success' : n <= 30 ? 'warning' : 'error';
      } else {
        color = percentColor(m[1]);
      }
      qolMetrics.push({ label: key, value: val, color });
    }
  }

  return {
    category: 'residential',
    upgradeLevel,
    inhabitants: inhab?.[1] ? formatNumber(inhab[1]) : undefined,
    desirability: desir?.[1],
    qolMetrics: qolMetrics.length > 0 ? qolMetrics : undefined,
  };
}

function parsePublicRich(text: string): RichDetails {
  const [upgradeLevel, rest] = extractUpgrade(text);
  const coverages: MetricEntry[] = [];

  const coverageMatches = [...rest.matchAll(/(\w+(?:\s+\w+)?) Coverage coverage accross the city reported at (\d+)%/g)];
  for (const cm of coverageMatches) {
    coverages.push({ label: `${cm[1]} Coverage`, value: `${cm[2]}%`, color: percentColor(cm[2]) });
  }

  return { category: 'public', upgradeLevel, coverages: coverages.length > 0 ? coverages : undefined };
}

function parseTownHallRich(text: string): RichDetails {
  const classes: MetricEntry[] = [];
  const classMatches = [...text.matchAll(/([\d,]+)\s+(High|Middle|Low) class\s+\((\d+)%\s+unemp\)/g)];
  for (const cm of classMatches) {
    const unemp = parseInt(cm[3], 10);
    const color: MetricColor = unemp <= 10 ? 'success' : unemp <= 30 ? 'warning' : 'error';
    classes.push({ label: `${cm[2]} class`, value: formatNumber(cm[1]), color });
  }
  return { category: 'townhall', classes: classes.length > 0 ? classes : undefined };
}

function parseHQRich(text: string): RichDetails {
  const riMatch = text.match(/Research Implementation:\s*(.*)/);
  let status: string | undefined;
  let research: string | undefined;

  if (riMatch) {
    const before = text.substring(0, riMatch.index).trim();
    if (before) status = trimValue(before);
    research = trimValue(riMatch[1]);
  }

  return { category: 'hq', status, research };
}

/* ------------------------------------------------------------------ */
/*  Main rich parser entry point                                       */
/* ------------------------------------------------------------------ */

export function parseRichDetails(text: string): RichDetails | null {
  if (!text) return null;

  if (text.includes('Items Sold:'))        return parseStoreRich(text);
  if (text.includes('Producing:'))         return parseFarmRich(text);
  if (text.includes('Storing:'))           return parseStorageRich(text);
  if (/\d+\s+inhabitants/.test(text))      return parseResidentialRich(text);
  if (text.includes('Coverage coverage'))  return parsePublicRich(text);
  if (/\d+.*High class.*Middle class.*Low class/.test(text)) return parseTownHallRich(text);
  if (text.includes('Research Implementation:')) return parseHQRich(text);

  const entries = parseDetailsText(text);
  if (entries.length === 0) return null;
  return { category: 'generic', entries };
}

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
