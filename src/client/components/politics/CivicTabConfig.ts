/**
 * CivicTabConfig — Maps server-sent group IDs to consolidated civic tabs.
 *
 * Capitol: 7 server groups → 4 tabs (Overview, Administration, Demographics, Elections)
 * TownHall: 5 server groups → 3 tabs (Overview, Demographics, Elections)
 */

import type { BuildingDetailsTab } from '@/shared/types';

/** Composite tab IDs used by the civic modal. */
export type CivicTabId = 'overview' | 'administration' | 'demographics' | 'elections';

interface CivicTab {
  id: CivicTabId;
  label: string;
}

/** Server group IDs that map to each composite civic tab. */
const GROUP_TO_CIVIC_TAB: Record<string, CivicTabId> = {
  capitolGeneral: 'overview',
  townGeneral: 'overview',
  capitolTowns: 'administration',
  ministeries: 'administration',
  townJobs: 'demographics',
  townRes: 'demographics',
  votes: 'elections',
};

/** Ordered tab definitions. */
const CIVIC_TABS: CivicTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'administration', label: 'Administration' },
  { id: 'demographics', label: 'Demographics' },
  { id: 'elections', label: 'Elections' },
];

/**
 * Build the list of civic tabs based on which server groups are present.
 * Only includes tabs whose source groups actually exist in the building data.
 * The synthetic "elections" tab is always included (Ratings comes from PoliticsData).
 */
export function buildCivicTabs(
  serverTabs: BuildingDetailsTab[],
): { id: string; label: string }[] {
  const serverGroupIds = new Set(serverTabs.map((t) => t.id));

  // Always include elections (has synthetic Ratings from PoliticsData even if no votes group)
  const activeCivicTabs = new Set<CivicTabId>(['elections']);

  // Check which server groups are present → activate their civic tab
  for (const tab of serverTabs) {
    const civicTab = GROUP_TO_CIVIC_TAB[tab.id];
    if (civicTab) activeCivicTabs.add(civicTab);
  }

  // Also add overview if any general group exists
  if (serverGroupIds.has('capitolGeneral') || serverGroupIds.has('townGeneral')) {
    activeCivicTabs.add('overview');
  }

  return CIVIC_TABS.filter((t) => activeCivicTabs.has(t.id));
}

/**
 * Determine which server group ID acts as the "general" group for Overview.
 */
export function getGeneralGroupId(serverTabs: BuildingDetailsTab[]): string | undefined {
  const ids = new Set(serverTabs.map((t) => t.id));
  if (ids.has('capitolGeneral')) return 'capitolGeneral';
  if (ids.has('townGeneral')) return 'townGeneral';
  return undefined;
}

/**
 * Check if the building is a Capitol (has administration tabs) vs TownHall.
 */
export function isCapitolBuilding(serverTabs: BuildingDetailsTab[]): boolean {
  return serverTabs.some((t) => t.id === 'capitolTowns' || t.id === 'ministeries');
}
