/**
 * ResidentialsTab — Side-by-side 3-column comparison of residential classes.
 * High Class (hi*), Middle Class (mid*), Low Class (lo*)
 */

import type { BuildingPropertyValue } from '@/shared/types';
import { buildValueMap, getNum, formatCompact } from './capitol-utils';
import styles from './PoliticsPanel.module.css';

interface ResidentialsTabProps {
  properties: BuildingPropertyValue[];
}

interface ResClass {
  label: string;
  prefix: string;
  vacancies: number;
  rentPrice: number;
  qualityIndex: number;
}

export function ResidentialsTab({ properties }: ResidentialsTabProps) {
  const valueMap = buildValueMap(properties);

  const classes: ResClass[] = [
    {
      label: 'High Class',
      prefix: 'hi',
      vacancies: getNum(valueMap, 'hiResDemand'),
      rentPrice: getNum(valueMap, 'hiRentPrice'),
      qualityIndex: getNum(valueMap, 'hiResQ'),
    },
    {
      label: 'Middle Class',
      prefix: 'mid',
      vacancies: getNum(valueMap, 'midResDemand'),
      rentPrice: getNum(valueMap, 'midRentPrice'),
      qualityIndex: getNum(valueMap, 'midResQ'),
    },
    {
      label: 'Low Class',
      prefix: 'lo',
      vacancies: getNum(valueMap, 'loResDemand'),
      rentPrice: getNum(valueMap, 'loRentPrice'),
      qualityIndex: getNum(valueMap, 'loResQ'),
    },
  ];

  return (
    <div className={styles.columnGrid}>
      {classes.map((cls) => (
        <div key={cls.prefix} className={styles.column}>
          <div className={styles.columnHeader}>{cls.label}</div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Vacancies</span>
            <span className={styles.statValue}>{formatCompact(cls.vacancies)}</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Rent Price</span>
            <span className={styles.statValue}>{cls.rentPrice}%</span>
          </div>

          <div className={styles.statRow}>
            <span className={styles.statLabel}>Quality</span>
            <span className={styles.statValue}>{formatCompact(cls.qualityIndex)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
