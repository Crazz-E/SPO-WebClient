/**
 * Which section the inspector must read, and whether it still has to.
 *
 * The inspector now opens on the header group alone — every other group is read
 * when its menu entry is opened. This decides, for the section currently open,
 * whether a round-trip is owed and what to ask for:
 *
 *   - a gate-based tab (supplies / products / compInputs) is asked for by id,
 *     with no group list: its data comes from a gate walk, not from properties;
 *   - any other tab is asked for by group id — a civic tab consolidates several
 *     server groups, hence a list;
 *   - a section already in hand, in flight, or that errored asks for nothing.
 */

import type { BuildingDetailsResponse } from '@/shared/types';
import { isLazyTab } from '../../handlers/building-action-handler';
import { civicTabGroupIds, type CivicTabId } from '../politics/CivicTabConfig';

/** Load state per tab, as tracked by the building store. */
export type SectionLoadState = 'idle' | 'loading' | 'loaded' | 'error' | undefined;

export interface SectionFetch {
  /** Key the request and its load state are tracked under. */
  tabId: string;
  /** Template groups to read; omitted for the gate-based tabs. */
  groupIds?: string[];
}

/** A state that already settled the question — nothing more to ask for. */
function isSettled(state: SectionLoadState): boolean {
  return state === 'loading' || state === 'loaded' || state === 'error';
}

export function resolveSectionFetch(
  details: BuildingDetailsResponse,
  currentTab: string,
  isCivic: boolean,
  tabLoadingStates: Record<string, SectionLoadState>,
): SectionFetch | null {
  if (isCivic) {
    const groupIds = civicTabGroupIds(currentTab as CivicTabId, details.tabs);
    // `politics` has no server group; its content comes from PoliticsData.
    if (groupIds.length === 0) return null;
    if (isSettled(tabLoadingStates[currentTab])) return null;
    // Every group this tab consolidates already came back with a response —
    // the general group rides on the opening read, and on every refresh.
    if (groupIds.every((id) => tabLoadingStates[id] === 'loaded')) return null;
    return { tabId: currentTab, groupIds };
  }

  const tab = details.tabs.find((t) => t.id === currentTab);
  // No section open — the menu is showing, and it costs nothing.
  if (!tab) return null;

  const gateTabId = tab.special && isLazyTab(tab.special) ? tab.special
    : isLazyTab(tab.id) ? tab.id
    : null;

  if (gateTabId) {
    return isSettled(tabLoadingStates[gateTabId]) ? null : { tabId: gateTabId };
  }

  // A standard section IS its group, so the load state the store seeds from the
  // response answers this on its own. Deliberately NOT `details.groups[tab.id]`:
  // a refresh clears the load states and keeps the values, and reading the
  // values here would leave an open section frozen on what it had before.
  return isSettled(tabLoadingStates[tab.id]) ? null : { tabId: tab.id, groupIds: [tab.id] };
}

/** What the open section should show right now. */
export type SectionDisplayState = 'ready' | 'loading' | 'error';

/**
 * Ready, still reading, or failed — for the body of the open drawer.
 *
 * A property group is ready the moment its values are in `details.groups`; a
 * gate-based tab is ready only once its load state says so, because its data
 * lands in `supplies`/`products`/`compInputs` rather than in a group.
 */
export function sectionDisplayState(
  details: BuildingDetailsResponse,
  tabId: string | null,
  tabLoadingStates: Record<string, SectionLoadState>,
): SectionDisplayState {
  if (!tabId) return 'ready';

  const tab = details.tabs.find((t) => t.id === tabId);
  if (!tab) return 'ready';

  const gateTabId = tab.special && isLazyTab(tab.special) ? tab.special
    : isLazyTab(tab.id) ? tab.id
    : null;

  if (gateTabId) {
    const state = tabLoadingStates[gateTabId];
    if (state === 'error') return 'error';
    return state === 'loaded' ? 'ready' : 'loading';
  }

  if (tabLoadingStates[tab.id] === 'error') return 'error';
  return details.groups[tab.id] ? 'ready' : 'loading';
}
