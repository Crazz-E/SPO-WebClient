/**
 * AdministrationSection — Towns + Ministries stacked (Capitol-only, president).
 * Removes the redundant "President: ruler" from individual tabs — that info is in Overview.
 */

import type { BuildingPropertyValue } from '@/shared/types';
import { TownsTab } from './TownsTab';
import { MinistriesTab } from './MinistriesTab';
import { TaxesTab } from './TaxesTab';
import styles from './PoliticsPanel.module.css';

interface AdministrationSectionProps {
  townsProperties: BuildingPropertyValue[];
  ministriesProperties: BuildingPropertyValue[];
  /** Town Hall tax table. Empty on a Capitol, which levies per town instead. */
  taxesProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  /** Does this player govern this facility? See `grantAccess`. */
  canGovern: boolean;
}

export function AdministrationSection({
  townsProperties,
  ministriesProperties,
  taxesProperties,
  buildingX,
  buildingY,
  canGovern,
}: AdministrationSectionProps) {
  // A Town Hall reaches this tab through its tax table alone, so it must lead;
  // a Capitol has no tax table and starts at Towns.
  const showDividerBeforeTowns = taxesProperties.length > 0;

  return (
    <>
      {taxesProperties.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Taxes</h4>
          <TaxesTab
            properties={taxesProperties}
            buildingX={buildingX}
            buildingY={buildingY}
            canGovern={canGovern}
          />
        </div>
      )}

      {townsProperties.length > 0 && showDividerBeforeTowns && (
        <div className={styles.sectionDivider} />
      )}

      {townsProperties.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Towns</h4>
          <TownsTab
            properties={townsProperties}
            buildingX={buildingX}
            buildingY={buildingY}
            canGovern={canGovern}
          />
        </div>
      )}

      {ministriesProperties.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Ministries</h4>
            <MinistriesTab
              properties={ministriesProperties}
              buildingX={buildingX}
              buildingY={buildingY}
              canGovern={canGovern}
            />
          </div>
        </>
      )}
    </>
  );
}
