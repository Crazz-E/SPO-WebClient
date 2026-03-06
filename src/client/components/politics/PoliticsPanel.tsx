/**
 * PoliticsPanel — Tabbed Capitol management panel (right panel).
 *
 * Tabs: Towns, Ministries, Jobs, Residentials, Votes, Ratings
 * Data source: BuildingDetailsResponse.groups for Capitol building data,
 *              PoliticsData from ASP pages for the Ratings tab.
 */

import { usePoliticsStore, type CapitolTab } from '../../store/politics-store';
import { useBuildingStore } from '../../store/building-store';
import type { BuildingPropertyValue } from '@/shared/types';
import { Skeleton } from '../common';
import { TownsTab } from './TownsTab';
import { MinistriesTab } from './MinistriesTab';
import { JobsTab } from './JobsTab';
import { ResidentialsTab } from './ResidentialsTab';
import { VotesTab } from './VotesTab';
import { RatingsTab } from './RatingsTab';
import styles from './PoliticsPanel.module.css';

const TABS: { id: CapitolTab; label: string }[] = [
  { id: 'towns', label: 'Towns' },
  { id: 'ministries', label: 'Ministries' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'residentials', label: 'Residentials' },
  { id: 'votes', label: 'Votes' },
  { id: 'ratings', label: 'Ratings' },
];

/** Group ID mapping — tab IDs to building details group keys */
const TAB_GROUP_MAP: Record<string, string> = {
  towns: 'capitolTowns',
  ministries: 'ministeries',
  jobs: 'townJobs',
  residentials: 'townRes',
  votes: 'votes',
};

export function PoliticsPanel() {
  const activeTab = usePoliticsStore((s) => s.activeCapitolTab);
  const setActiveTab = usePoliticsStore((s) => s.setActiveCapitolTab);
  const buildingX = usePoliticsStore((s) => s.buildingX);
  const buildingY = usePoliticsStore((s) => s.buildingY);
  const isLoading = usePoliticsStore((s) => s.isLoading);

  const details = useBuildingStore((s) => s.details);

  if (isLoading) {
    return (
      <div className={styles.panel}>
        <div className={styles.loading}>
          <Skeleton width="100%" height="40px" />
          <Skeleton width="100%" height="120px" />
          <Skeleton width="100%" height="80px" />
        </div>
      </div>
    );
  }

  const groupId = TAB_GROUP_MAP[activeTab];
  const groupProperties = groupId ? details?.groups[groupId] ?? [] : [];

  return (
    <div className={styles.panel}>
      {/* Tab bar */}
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.tabContent}>
        <TabContent
          activeTab={activeTab}
          properties={groupProperties}
          buildingX={buildingX}
          buildingY={buildingY}
        />
      </div>
    </div>
  );
}

function TabContent({
  activeTab,
  properties,
  buildingX,
  buildingY,
}: {
  activeTab: CapitolTab;
  properties: BuildingPropertyValue[];
  buildingX: number;
  buildingY: number;
}) {
  switch (activeTab) {
    case 'towns':
      return <TownsTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'ministries':
      return <MinistriesTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'jobs':
      return <JobsTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'residentials':
      return <ResidentialsTab properties={properties} />;
    case 'votes':
      return <VotesTab properties={properties} buildingX={buildingX} buildingY={buildingY} />;
    case 'ratings':
      return <RatingsTab buildingX={buildingX} buildingY={buildingY} />;
    default:
      return null;
  }
}
