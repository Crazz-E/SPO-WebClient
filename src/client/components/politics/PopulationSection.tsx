/**
 * PopulationSection — Town Hall population & demographics.
 *
 * Renders the demographics parsed from the RefreshObject status text
 * (total inhabitants, per-class breakdown with unemployment, and citizen
 * movement reports). Shown at the top of the civic Demographics tab.
 *
 * Returns null for buildings without demographics (every non-Town-Hall), so it
 * is safe to render unconditionally.
 */

import type { TownHallDemographics, TownHallMovement } from '@/shared/types';
import { StatCard, MiniBar, Badge } from '../common';
import { formatCompact } from './capitol-utils';
import styles from './PoliticsPanel.module.css';
import local from './PopulationSection.module.css';

interface PopulationSectionProps {
  demographics: TownHallDemographics | null | undefined;
}

/** Pick a MiniBar color band for an unemployment percentage (higher = worse). */
function unemploymentVariant(pct: number): 'success' | 'warning' | 'error' {
  if (pct < 25) return 'success';
  if (pct < 60) return 'warning';
  return 'error';
}

export function PopulationSection({ demographics }: PopulationSectionProps) {
  if (!demographics) return null;
  const { totalInhabitants, totalInhabitantsLabel, classes, movements } = demographics;

  return (
    <>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Population</h4>

        {totalInhabitants > 0 && (
          <div className={local.total}>
            <StatCard label="Total Population" value={totalInhabitantsLabel} variant="gold" />
          </div>
        )}

        <div className={styles.columnGrid}>
          {classes.map((c) => (
            <div key={c.className} className={styles.column}>
              <div className={styles.columnHeader}>{c.className}</div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Population</span>
                <span className={styles.statValue}>{c.populationLabel}</span>
              </div>
              <div className={local.unempCell}>
                <span className={styles.statLabel}>Unemployment</span>
                <MiniBar
                  value={c.unemploymentPct / 100}
                  label={`${c.unemploymentPct}%`}
                  variant={unemploymentVariant(c.unemploymentPct)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {movements.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Citizen Movements (last day)</h4>
            <div className={local.movements}>
              {movements.map((m) => (
                <MovementRow key={m.className} movement={m} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** A single per-class movement report: direction badge + reason breakdown. */
function MovementRow({ movement }: { movement: TownHallMovement }) {
  const { className, direction, count, reasons } = movement;

  const badge =
    direction === 'in' ? (
      <Badge variant="success">↑ {formatCompact(count)} moved in</Badge>
    ) : direction === 'out' ? (
      <Badge variant="warning">↓ {formatCompact(count)} moved out</Badge>
    ) : (
      <Badge variant="default">No movements</Badge>
    );

  return (
    <div className={local.movementRow}>
      <div className={local.movementHead}>
        <span className={local.movementClass}>{className} class</span>
        {badge}
      </div>
      {reasons.length > 0 && (
        <ul className={local.reasons}>
          {reasons.map((r, i) => (
            <li key={`${r.reason}-${i}`} className={local.reason}>
              <span className={local.reasonPct}>{r.pct}%</span>
              <span className={local.reasonText}>{r.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
