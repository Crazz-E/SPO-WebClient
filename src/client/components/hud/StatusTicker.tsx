/**
 * StatusTicker — Floating HUD bar showing structured building details.
 *
 * Parses raw detailsText into a rich, categorized structure and renders
 * building-type-specific layouts (farm, storage, store, residential, etc.).
 *
 * Centered horizontally near the top of the screen (z-350).
 * Visible whenever a building is focused in overlay mode.
 * Click-through (pointer-events: none).
 */

import { useBuildingStore } from '../../store/building-store';
import { parseDetailsText } from '../building/QuickStats';
import styles from './StatusTicker.module.css';

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

/** Color for a percentage value based on performance thresholds. */
function percentColor(pctStr: string): MetricColor {
  const n = parseInt(pctStr, 10);
  if (isNaN(n)) return 'default';
  if (n > 100) return 'gold';
  if (n >= 80) return 'success';
  if (n >= 50) return 'warning';
  return 'error';
}

/** Extract "Upgrade Level: N" from text start. Returns [level, remainder]. */
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
      // "2333 kg/day of Fresh Food at 51% quality index, 100% efficiency"
      const m = p.match(/^([\d,]+)\s+([\w/]+)\s+of\s+(.+?)\s+at\s+(\d+)%\s*qual\w*\s*index(?:,\s*(\d+)%\s*efficiency)?/);
      if (m) {
        items.push({
          name: m[3],
          volume: `${m[1]} ${m[2]}`,
          quality: `${m[4]}%`,
          efficiency: m[5] ? `${m[5]}%` : undefined,
        });
      }
    }
  }

  // Workforce metrics
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
      // "684375 kg of Fresh Food at 51% qualiy index"
      const m = raw.match(/^([\d,]+)\s+([\w]+)\s+of\s+(.+?)\s+at\s+(\d+)%/);
      if (m) {
        items.push({ name: m[3], amount: `${m[1]} ${m[2]}`, quality: `${m[4]}%` });
      }
    }
  }

  return { category: 'storage', upgradeLevel, storing: items.length > 0 ? items : undefined };
}

function parseStoreRich(text: string): RichDetails {
  // Strip preamble before "Upgrade Level"
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
        // Lower is better
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
    inhabitants: inhab?.[1],
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
    // High unemployment is bad
    const color: MetricColor = unemp <= 10 ? 'success' : unemp <= 30 ? 'warning' : 'error';
    classes.push({ label: `${cm[2]} class`, value: `${cm[1]}`, color });
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

  // Generic fallback — use flat parser
  const entries = parseDetailsText(text);
  if (entries.length === 0) return null;
  return { category: 'generic', entries };
}

/* ------------------------------------------------------------------ */
/*  CSS class helper for metric colors                                 */
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

/* ------------------------------------------------------------------ */
/*  Sub-renderers per building type                                    */
/* ------------------------------------------------------------------ */

function renderUpgradeLevel(level?: number) {
  if (level === undefined) return null;
  return (
    <div className={styles.upgradeRow}>
      <span className={styles.upgradeLabel}>Upgrade Level</span>
      <span className={styles.upgradeValue}>{level}</span>
    </div>
  );
}

function renderFarm(details: RichDetails) {
  return (
    <>
      {renderUpgradeLevel(details.upgradeLevel)}
      {details.producing && details.producing.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Producing</div>
          {details.producing.map((item, i) => (
            <div key={i} className={styles.productCard}>
              <span className={styles.productName}>{item.name}</span>
              <div className={styles.chipRow}>
                <span className={styles.chip}>{item.volume}</span>
                {item.quality && (
                  <span className={`${styles.chip} ${colorClass(percentColor(item.quality))}`}>
                    {item.quality} quality
                  </span>
                )}
                {item.efficiency && (
                  <span className={`${styles.chip} ${colorClass(percentColor(item.efficiency))}`}>
                    {item.efficiency} efficiency
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
      {renderUpgradeLevel(details.upgradeLevel)}
      {details.storing && details.storing.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>Storing</div>
          {details.storing.map((item, i) => (
            <div key={i} className={styles.productCard}>
              <span className={styles.productName}>{item.name}</span>
              <div className={styles.chipRow}>
                <span className={styles.chip}>{item.amount}</span>
                {item.quality && (
                  <span className={`${styles.chip} ${colorClass(percentColor(item.quality))}`}>
                    {item.quality} quality
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
      {renderUpgradeLevel(details.upgradeLevel)}
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
              <span className={styles.customerLabel}>Potential (per day)</span>
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
      {renderUpgradeLevel(details.upgradeLevel)}
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
              {m.label}: {m.value}
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
      {renderUpgradeLevel(details.upgradeLevel)}
      {details.coverages && details.coverages.length > 0 && (
        <div className={styles.metricRow}>
          {details.coverages.map((c, i) => (
            <span key={i} className={styles.metricInline}>
              <span className={styles.metricLabel}>{c.label}</span>
              <span className={`${styles.metricValue} ${colorClass(c.color)}`}>{c.value}</span>
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
          <span className={`${styles.classBadge} ${colorClass(c.color)}`}>
            {/* Extract unemp from original parsing */}
          </span>
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

function renderDetails(details: RichDetails) {
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
/*  StatusTicker component                                             */
/* ------------------------------------------------------------------ */

export function StatusTicker() {
  const building = useBuildingStore((s) => s.focusedBuilding);
  const isOverlay = useBuildingStore((s) => s.isOverlayMode);

  const detailsText = building?.detailsText || '';
  const hintsText = building?.hintsText || '';

  // Hide when inspector panel/modal is open — hints are shown in QuickStats
  if (!isOverlay) return null;
  if (!detailsText && !hintsText) return null;

  const richDetails = parseRichDetails(detailsText);
  const showHint = hintsText && hintsText !== 'No hints for this facility.';

  return (
    <div className={styles.ticker} data-testid="status-ticker">
      {richDetails ? (
        renderDetails(richDetails)
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
