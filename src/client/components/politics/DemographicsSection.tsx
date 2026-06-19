/**
 * DemographicsSection — Jobs + Housing stacked (replaces separate Jobs/Residentials tabs).
 */

import type { BuildingPropertyValue, BuildingDetailsTab, TownHallDemographics } from '@/shared/types';
import { JobsTab } from './JobsTab';
import { ResidentialsTab } from './ResidentialsTab';
import { PopulationSection } from './PopulationSection';
import { isCapitolBuilding } from './CivicTabConfig';
import styles from './PoliticsPanel.module.css';

interface DemographicsSectionProps {
  jobsProperties: BuildingPropertyValue[];
  residentialsProperties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
  serverTabs: BuildingDetailsTab[];
  /** Population summary parsed from the focused building's status text (Town Hall only). */
  demographics?: TownHallDemographics | null;
}

export function DemographicsSection({
  jobsProperties,
  residentialsProperties,
  buildingX,
  buildingY,
  serverTabs,
  demographics,
}: DemographicsSectionProps) {
  const isCapitol = isCapitolBuilding(serverTabs);

  return (
    <>
      <PopulationSection demographics={demographics} />

      {jobsProperties.length > 0 && (
        <>
          {demographics && <div className={styles.sectionDivider} />}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Employment</h4>
            <JobsTab
              properties={jobsProperties}
              buildingX={buildingX}
              buildingY={buildingY}
              isCapitol={isCapitol}
            />
          </div>
        </>
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
