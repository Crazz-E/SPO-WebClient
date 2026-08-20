/**
 * JobsTab — Side-by-side 3-column comparison of job classes.
 * Executive (hi*), Professional (mid*), Worker (lo*)
 */

import { useState, useCallback, useEffect } from 'react';
import type { BuildingPropertyValue } from '@/shared/types';
import { useClient } from '../../context';
import { SaveIndicator } from '../building/SaveIndicator';
import { buildValueMap, getNum, formatCompact } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface JobsTabProps {
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  /** True when viewing Capitol (president edits); false for Town Hall (mayor edits). */
  isCapitol: boolean;
  /**
   * Does this player govern this facility? Both the Capitol and the Town Hall
   * gate on the same thing — Voyager reads `fOwnsFacility` off the facility's
   * own SecurityId on both sheets (`TownHallJobsSheet.pas:142-145`), never off a
   * role name — so `isCapitol` no longer selects between two different tests.
   */
  canGovern: boolean;
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

export function JobsTab({ properties, buildingX, buildingY, isCapitol, canGovern }: JobsTabProps) {
  const canEdit = canGovern;
  const valueMap = buildValueMap(properties);

  const classes: JobClass[] = [
    {
      label: 'Executive',
      prefix: 'hi',
      vacancies: getNum(valueMap, 'hiWorkDemand'),
      privateVacancies: valueMap.get('hiPrivateWorkDemand') ?? '0',
      avgWage: getNum(valueMap, 'hiSalary'),
      spendingPower: getNum(valueMap, 'hiSalaryValue'),
      minWage: getNum(valueMap, 'hiMinSalary'),
    },
    {
      label: 'Professional',
      prefix: 'mid',
      vacancies: getNum(valueMap, 'midWorkDemand'),
      privateVacancies: valueMap.get('midPrivateWorkDemand') ?? '0',
      avgWage: getNum(valueMap, 'midSalary'),
      spendingPower: getNum(valueMap, 'midSalaryValue'),
      minWage: getNum(valueMap, 'midMinSalary'),
    },
    {
      label: 'Worker',
      prefix: 'lo',
      vacancies: getNum(valueMap, 'loWorkDemand'),
      privateVacancies: valueMap.get('loPrivateWorkDemand') ?? '0',
      avgWage: getNum(valueMap, 'loSalary'),
      spendingPower: getNum(valueMap, 'loSalaryValue'),
      minWage: getNum(valueMap, 'loMinSalary'),
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
            {/* Two tiers, and the higher one wins: the mayor sets the town's
                floor, the president the world's, and the wage actually enforced
                is max(town, world) — Kernel/Kernel.pas:9342-9345. Saying which
                one this slider writes is the difference between a control the
                player understands and one that looks broken. */}
            <span className={styles.statLabel}>
              {isCapitol ? 'Min Wage (world)' : 'Min Wage (town)'}
            </span>
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
  const pendingKey = `RDOSetMinSalaryValue:{"levelIndex":"${levelIndex}"}`;

  // Re-sync when the server sends a fresh figure. Without this the local state
  // captured at mount wins forever, and the 30 s auto-refresh leaves the slider
  // showing a value the town no longer has.
  useEffect(() => { setValue(initialValue); }, [initialValue]);

  const commitValue = useCallback(
    (next: number) => {
      if (next === initialValue) return;
      client.onSetBuildingProperty(buildingX, buildingY, 'RDOSetMinSalaryValue', String(next), { levelIndex });
    },
    [client, buildingX, buildingY, levelIndex, initialValue],
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
        onChange={(e) => setValue(parseInt(e.target.value, 10))}
        // Voyager emits once, on MouseUp (`PercentEdit.pas:357-362`), and so do
        // we — one frame per gesture, not one per pixel dragged. `onPointerUp`
        // alone missed two of them: arrow keys never fire it, and a cancelled
        // touch swallows the edit. `onKeyUp` covers the keyboard, `onBlur` is
        // the catch-all for anything that ends the interaction another way.
        onPointerUp={(e) => commitValue(parseInt(e.currentTarget.value, 10))}
        onKeyUp={(e) => commitValue(parseInt(e.currentTarget.value, 10))}
        onBlur={(e) => commitValue(parseInt(e.currentTarget.value, 10))}
      />
      <span className={styles.sliderValue}>{value}%</span>
      <SaveIndicator propertyKey={pendingKey} />
    </div>
  );
}
