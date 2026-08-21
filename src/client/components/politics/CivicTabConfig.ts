/**
 * CivicTabConfig — Maps server-sent group IDs to consolidated civic tabs.
 *
 * Capitol: 7 server groups → 4 tabs (Overview, Administration, Demographics, Elections)
 * TownHall: 5 server groups → 3 tabs (Overview, Demographics, Elections)
 */

import type { BuildingDetailsTab } from '@/shared/types';

/** Composite tab IDs used by the civic modal. */
export type CivicTabId = 'overview' | 'administration' | 'demographics' | 'elections' | 'politics';

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
  // The mayor's tax table. It sits with the other governance levers rather than
  // in its own tab, which is where Voyager puts it (`TAXES`), because the modal
  // keeps four composite tabs instead of the reference client's six.
  townTaxes: 'administration',
  townJobs: 'demographics',
  townRes: 'demographics',
  // Town Hall `COMMERCE` / Capitol `SERVICES` — read-only provision figures for
  // the population the rest of this tab describes.
  townServices: 'demographics',
  votes: 'elections',
};

/** Ordered tab definitions. */
const CIVIC_TABS: CivicTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'administration', label: 'Administration' },
  { id: 'demographics', label: 'Demographics' },
  { id: 'elections', label: 'Elections' },
  { id: 'politics', label: 'Politics' },
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

  // Elections and Politics are synthetic: their content comes from PoliticsData
  // and from the votes group, never from a server group of their own. Politics
  // is Voyager's `politics.asp`, reachable there from a button on General —
  // here it is a tab, because the modal has no place to open a second window.
  const activeCivicTabs = new Set<CivicTabId>(['elections', 'politics']);

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
 * Server groups one civic tab needs, restricted to those this building declares.
 *
 * The inverse of `GROUP_TO_CIVIC_TAB`, and the reason `WsReqBuildingTabData`
 * takes a list: Administration alone consolidates `capitolTowns`,
 * `ministeries` and `townTaxes`, and the panel reads them in one round-trip
 * when the section opens rather than at inspector open.
 *
 * `elections` also claims `votes`, which is why it is not synthetic here even
 * though `buildCivicTabs` always offers it; `politics` has no server group at
 * all — its content comes from PoliticsData — and yields an empty list.
 */
/**
 * Groups a tab reads without owning them.
 *
 * `GROUP_TO_CIVIC_TAB` says which tab a group BELONGS to — it is what decides
 * the tab list. Overview also READS the votes group: the ruler banner takes
 * `RulerName`, `RulerVotes` and the campaign figures from it
 * (`OverviewSection`). Without this the banner would stay blank until the user
 * opened Elections.
 */
const EXTRA_GROUPS_READ: Partial<Record<CivicTabId, string[]>> = {
  overview: ['votes'],
};

export function civicTabGroupIds(
  tabId: CivicTabId,
  serverTabs: BuildingDetailsTab[],
): string[] {
  const present = new Set(serverTabs.map((t) => t.id));
  const owned = Object.entries(GROUP_TO_CIVIC_TAB)
    .filter(([groupId, civicTab]) => civicTab === tabId && present.has(groupId))
    .map(([groupId]) => groupId);
  const alsoRead = (EXTRA_GROUPS_READ[tabId] ?? []).filter((id) => present.has(id));
  return [...new Set([...owned, ...alsoRead])];
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
