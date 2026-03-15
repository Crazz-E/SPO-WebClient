/**
 * AdministrationSection — Towns + Ministries stacked (Capitol-only, president).
 * Removes the redundant "President: ruler" from individual tabs — that info is in Overview.
 */

import type { BuildingPropertyValue } from '@/shared/types';
import { TownsTab } from './TownsTab';
import { MinistriesTab } from './MinistriesTab';
import styles from './PoliticsPanel.module.css';

interface AdministrationSectionProps {
  townsProperties: BuildingPropertyValue[];
  ministriesProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}

export function AdministrationSection({
  townsProperties,
  ministriesProperties,
  buildingX,
  buildingY,
}: AdministrationSectionProps) {
  return (
    <>
      {townsProperties.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Towns</h4>
          <TownsTab properties={townsProperties} buildingX={buildingX} buildingY={buildingY} />
        </div>
      )}

      {ministriesProperties.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Ministries</h4>
            <MinistriesTab properties={ministriesProperties} buildingX={buildingX} buildingY={buildingY} />
          </div>
        </>
      )}
    </>
  );
}
