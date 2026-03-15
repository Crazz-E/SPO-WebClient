/**
 * EconomyTab — Unified labor market + housing view.
 * Merges the old JobsTab (Executive/Professional/Worker) and ResidentialsTab
 * (High/Middle/Low Class) into a single 3-column economic overview.
 */

import { useState, useCallback } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { useGameStore } from '../../store/game-store';
import { buildValueMap, getNum, formatCompact, formatPercent, isPresidentRole, isMayorRole } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface EconomyTabProps {
  jobProperties: BuildingPropertyValue[];
  resProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  /** True when viewing Capitol (president edits); false for Town Hall (mayor edits). */
  isCapitol: boolean;
}

interface EconomyColumn {
  label: string;
  levelIndex: string;
  // Labor
  vacancies: number;
  privateVacancies: number;
  avgWage: number;
  spendingPower: number;
  minWage: number;
  // Housing
  resVacancies: number;
  rentPrice: number;
  quality: number;
}

const COLUMNS: { label: string; jobPrefix: string; resPrefix: string }[] = [
  { label: 'Executive / High', jobPrefix: 'hi', resPrefix: 'hi' },
  { label: 'Professional / Mid', jobPrefix: 'mid', resPrefix: 'mid' },
  { label: 'Worker / Low', jobPrefix: 'lo', resPrefix: 'lo' },
];

export function EconomyTab({ jobProperties, resProperties, buildingX, buildingY, isCapitol }: EconomyTabProps) {
  const ownerRole = useGameStore((s) => s.ownerRole);
  const canEdit = isCapitol ? isPresidentRole(ownerRole) : isMayorRole(ownerRole);
  const jobMap = buildValueMap(jobProperties);
  const resMap = buildValueMap(resProperties);

  const columns: EconomyColumn[] = COLUMNS.map((col, i) => ({
    label: col.label,
    levelIndex: String(i),
    // Labor market
    vacancies: getNum(jobMap, `${col.jobPrefix}WorkDemand`),
    privateVacancies: getNum(jobMap, `${col.jobPrefix}PrivateWorkDemand`),
    avgWage: getNum(jobMap, `${col.jobPrefix}Salary`),
    spendingPower: getNum(jobMap, `${col.jobPrefix}SalaryValue`),
    minWage: getNum(jobMap, `${col.jobPrefix}MinSalary`),
    // Housing market
    resVacancies: getNum(resMap, `${col.resPrefix}ResDemand`),
    rentPrice: getNum(resMap, `${col.resPrefix}RentPrice`),
    quality: getNum(resMap, `${col.resPrefix}ResQ`),
  }));

  return (
    <div className={styles.columnGrid}>
      {columns.map((col) => (
        <div key={col.levelIndex} className={styles.column}>
          <div className={styles.columnHeader}>{col.label}</div>

          {/* ── Labor Market ── */}
          <div className={styles.columnSubheader}>Labor</div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Vacancies</span>
            <span className={styles.statValue}>{formatCompact(col.vacancies)}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Private Vacancies</span>
            <span className={styles.statValue}>{formatCompact(col.privateVacancies)}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Avg Wage</span>
            <span className={styles.statValue}>{formatPercent(col.avgWage)}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Spending Power</span>
            <span className={styles.statValue}>{formatPercent(col.spendingPower)}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Min Wage</span>
          </div>
          <MinWageSlider
            value={col.minWage}
            levelIndex={col.levelIndex}
            buildingX={buildingX}
            buildingY={buildingY}
            editable={canEdit}
          />

          {/* ── Housing ── */}
          <div className={styles.economyDivider} />
          <div className={styles.columnSubheader}>Housing</div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Vacancies</span>
            <span className={styles.statValue}>{formatCompact(col.resVacancies)}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Rent Price</span>
            <span className={styles.statValue}>{formatPercent(col.rentPrice)}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Quality</span>
            <span className={styles.statValue}>{formatPercent(col.quality)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MinWageSlider({
  value: initialValue,
  levelIndex,
  buildingX,
  buildingY,
  editable,
}: {
  value: number;
  levelIndex: string;
  buildingX: number;
  buildingY: number;
  editable: boolean;
}) {
  const client = useClient();
  const [value, setValue] = useState(initialValue);

  const handleChange = useCallback(
    (newValue: number) => {
      setValue(newValue);
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetMinSalaryValue', String(newValue), { levelIndex });
    },
    [client, buildingX, buildingY, levelIndex],
  );

  return (
    <div className={styles.sliderCell}>
      <input
        type="range"
        className={styles.slider}
        min={0}
        max={200}
        step={1}
        value={value}
        disabled={!editable}
        onChange={(e) => handleChange(parseInt(e.target.value, 10))}
      />
      <span className={styles.sliderValue}>{formatPercent(value)}</span>
    </div>
  );
}
