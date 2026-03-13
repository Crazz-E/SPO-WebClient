/**
 * JobsTab — Side-by-side 3-column comparison of job classes.
 * Executive (hi*), Professional (mid*), Worker (lo*)
 */

import { useState, useCallback } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { useGameStore } from '../../store/game-store';
import { buildValueMap, getNum, formatCompact, isFacilityOwnerRole } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface JobsTabProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}

interface JobClass {
  label: string;
  prefix: string;
  vacancies: number;
  privateVacancies: string;
  avgWage: number;
  spendingPower: number;
  minWage: number;
}

export function JobsTab({ properties, buildingX, buildingY }: JobsTabProps) {
  const ownerRole = useGameStore((s) => s.ownerRole);
  const canEdit = isFacilityOwnerRole(ownerRole);
  const valueMap = buildValueMap(properties);

  const classes: JobClass[] = [
    {
      label: 'Executive',
      prefix: 'hi',
      vacancies: getNum(valueMap, 'hiWorkDemand'),
      privateVacancies: valueMap.get('hiPrivateWorkDemand') ?? '0',
      avgWage: getNum(valueMap, 'hiSalary'),
      spendingPower: getNum(valueMap, 'hiSalaryValue'),
      minWage: getNum(valueMap, 'hiActualMinSalary'),
    },
    {
      label: 'Professional',
      prefix: 'mid',
      vacancies: getNum(valueMap, 'midWorkDemand'),
      privateVacancies: valueMap.get('midPrivateWorkDemand') ?? '0',
      avgWage: getNum(valueMap, 'midSalary'),
      spendingPower: getNum(valueMap, 'midSalaryValue'),
      minWage: getNum(valueMap, 'midActualMinSalary'),
    },
    {
      label: 'Worker',
      prefix: 'lo',
      vacancies: getNum(valueMap, 'loWorkDemand'),
      privateVacancies: valueMap.get('loPrivateWorkDemand') ?? '0',
      avgWage: getNum(valueMap, 'loSalary'),
      spendingPower: getNum(valueMap, 'loSalaryValue'),
      minWage: getNum(valueMap, 'loActualMinSalary'),
    },
  ];

  return (
    <div className={styles.columnGrid}>
      {classes.map((cls, i) => (
        <div key={cls.prefix} className={styles.column}>
          <div className={styles.columnHeader}>{cls.label}</div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Vacancies</span>
            <span className={styles.statValue}>{formatCompact(cls.vacancies)}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Private</span>
            <span className={styles.statValue}>{cls.privateVacancies}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Avg Wage</span>
            <span className={styles.statValue}>{cls.avgWage}%</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Spending</span>
            <span className={styles.statValue}>{cls.spendingPower}%</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Min Wage</span>
          </div>
          <MinWageSlider
            value={cls.minWage}
            levelIndex={String(i)}
            buildingX={buildingX}
            buildingY={buildingY}
            editable={canEdit}
          />
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
      <span className={styles.sliderValue}>{value}%</span>
    </div>
  );
}
