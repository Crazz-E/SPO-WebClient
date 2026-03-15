/**
 * DemographicsSection — Jobs + Housing stacked (replaces separate Jobs/Residentials tabs).
 */

import type { BuildingPropertyValue, BuildingDetailsTab } from '@/shared/types';
import { JobsTab } from './JobsTab';
import { ResidentialsTab } from './ResidentialsTab';
import { isCapitolBuilding } from './CivicTabConfig';
import styles from './PoliticsPanel.module.css';

interface DemographicsSectionProps {
  jobsProperties: BuildingPropertyValue[];
  residentialsProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  serverTabs: BuildingDetailsTab[];
}

export function DemographicsSection({
  jobsProperties,
  residentialsProperties,
  buildingX,
  buildingY,
  serverTabs,
}: DemographicsSectionProps) {
  const isCapitol = isCapitolBuilding(serverTabs);

  return (
    <>
      {jobsProperties.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Employment</h4>
          <JobsTab
            properties={jobsProperties}
            buildingX={buildingX}
            buildingY={buildingY}
            isCapitol={isCapitol}
          />
        </div>
      )}

      {residentialsProperties.length > 0 && (
        <>
          <div className={styles.sectionDivider} />
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Housing</h4>
            <ResidentialsTab properties={residentialsProperties} />
          </div>
        </>
      )}
    </>
  );
}
