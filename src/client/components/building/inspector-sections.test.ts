/**
 * `resolveSectionFetch` / `sectionDisplayState` — the section-at-a-time rules.
 *
 * The inspector opens on the header group and reads nothing else until a menu
 * entry is opened. These tests pin both halves of that: what a given open
 * section owes the server, and what its drawer shows while it waits.
 */

import { describe, it, expect } from '@jest/globals';
import { resolveSectionFetch, sectionDisplayState, type SectionLoadState } from './inspector-sections';
import type { BuildingDetailsResponse, BuildingDetailsTab } from '@/shared/types';

const STANDARD_TABS: BuildingDetailsTab[] = [
  { id: 'indGeneral', name: 'GENERAL', order: 0, icon: 'G', handlerName: 'IndGeneral' },
  { id: 'workforce', name: 'WORKFORCE', order: 1, icon: 'W', handlerName: 'Workforce' },
  { id: 'supplies', name: 'SUPPLIES', order: 2, icon: 'S', handlerName: 'Supplies', special: 'supplies' },
];

const CIVIC_TABS: BuildingDetailsTab[] = [
  { id: 'capitolGeneral', name: 'GENERAL', order: 0, icon: 'G', handlerName: 'CapitolGeneral' },
  { id: 'capitolTowns', name: 'TOWNS', order: 1, icon: 'T', handlerName: 'CapitolTowns' },
  { id: 'ministeries', name: 'MINISTRIES', order: 2, icon: 'M', handlerName: 'Ministeries' },
  { id: 'votes', name: 'VOTES', order: 3, icon: 'V', handlerName: 'Votes' },
];

function makeDetails(
  tabs: BuildingDetailsTab[],
  groups: BuildingDetailsResponse['groups'],
): BuildingDetailsResponse {
  return {
    buildingId: 'b1', x: 10, y: 20, visualClass: '200', templateName: 'T',
    buildingName: 'Farm', ownerName: 'TestCo', securityId: 's', canGovern: false,
    tabs, groups, timestamp: 0,
  };
}

describe('resolveSectionFetch — standard facilities', () => {
  const details = makeDetails(STANDARD_TABS, { indGeneral: [{ name: 'ROI', value: '12%' }] });

  it('asks for nothing while the menu is showing', () => {
    // `currentTab` defaults to 'overview', which matches no standard group.
    expect(resolveSectionFetch(details, 'overview', false, {})).toBeNull();
  });

  it('asks for a section the opening read skipped, by group id', () => {
    expect(resolveSectionFetch(details, 'workforce', false, {}))
      .toEqual({ tabId: 'workforce', groupIds: ['workforce'] });
  });

  it('asks for nothing when the group is already in hand', () => {
    // The store marks every group a response carried as 'loaded' — the opening
    // read carries the header group, so opening it costs no round-trip.
    expect(resolveSectionFetch(details, 'indGeneral', false, { indGeneral: 'loaded' })).toBeNull();
  });

  /**
   * A refresh clears the load states and keeps the values. The open section has
   * to be read again — reading `details.groups` here instead would freeze it on
   * whatever it held before the refresh.
   */
  it('asks again after a refresh cleared the load state, even though values remain', () => {
    expect(resolveSectionFetch(details, 'indGeneral', false, {}))
      .toEqual({ tabId: 'indGeneral', groupIds: ['indGeneral'] });
  });

  it('asks for a gate tab by id, with no group list', () => {
    expect(resolveSectionFetch(details, 'supplies', false, {})).toEqual({ tabId: 'supplies' });
  });

  it.each<SectionLoadState>(['loading', 'loaded', 'error'])(
    'asks for nothing again once the section is %s',
    (state) => {
      expect(resolveSectionFetch(details, 'workforce', false, { workforce: state })).toBeNull();
      expect(resolveSectionFetch(details, 'supplies', false, { supplies: state })).toBeNull();
    },
  );

  it('retries a section left idle', () => {
    expect(resolveSectionFetch(details, 'workforce', false, { workforce: 'idle' }))
      .toEqual({ tabId: 'workforce', groupIds: ['workforce'] });
  });

  it('routes a gate tab declared through `special` to its special id', () => {
    const tabs: BuildingDetailsTab[] = [
      { id: 'whProducts', name: 'PRODUCTS', order: 1, icon: 'P', handlerName: 'Products', special: 'products' },
    ];
    expect(resolveSectionFetch(makeDetails(tabs, {}), 'whProducts', false, {}))
      .toEqual({ tabId: 'products' });
  });
});

describe('resolveSectionFetch — civic facilities', () => {
  const details = makeDetails(CIVIC_TABS, { capitolGeneral: [{ name: 'Town', value: 'Helartia' }] });

  it('asks for every group the consolidated tab needs, in one request', () => {
    const fetch = resolveSectionFetch(details, 'administration', true, {});
    expect(fetch?.tabId).toBe('administration');
    expect(fetch?.groupIds?.sort()).toEqual(['capitolTowns', 'ministeries']);
  });

  it('asks for the votes group when Elections opens', () => {
    expect(resolveSectionFetch(details, 'elections', true, {}))
      .toEqual({ tabId: 'elections', groupIds: ['votes'] });
  });

  it('asks for nothing for a tab with no server group', () => {
    // Politics is `politics.asp` — its content comes from PoliticsData.
    expect(resolveSectionFetch(details, 'politics', true, {})).toBeNull();
  });

  it('asks for the votes group Overview reads, on top of the general group', () => {
    // The ruler banner takes its figures from `votes`; the general group alone
    // would open it blank.
    const fetch = resolveSectionFetch(details, 'overview', true, { capitolGeneral: 'loaded' });
    expect(fetch?.groupIds?.sort()).toEqual(['capitolGeneral', 'votes']);
  });

  it('asks for nothing for Overview once both its groups are in hand', () => {
    expect(resolveSectionFetch(details, 'overview', true, {
      capitolGeneral: 'loaded', votes: 'loaded',
    })).toBeNull();
  });

  it('asks again while only part of a consolidated tab is in hand', () => {
    const fetch = resolveSectionFetch(details, 'administration', true, { capitolTowns: 'loaded' });
    expect(fetch?.groupIds?.sort()).toEqual(['capitolTowns', 'ministeries']);
  });

  it('stops asking once the request is in flight', () => {
    expect(resolveSectionFetch(details, 'administration', true, { administration: 'loading' })).toBeNull();
  });
});

describe('sectionDisplayState', () => {
  const details = makeDetails(STANDARD_TABS, { indGeneral: [{ name: 'ROI', value: '12%' }] });

  it('is ready when no section is open', () => {
    expect(sectionDisplayState(details, null, {})).toBe('ready');
  });

  it('is ready for a tab the template does not declare', () => {
    expect(sectionDisplayState(details, 'nosuchtab', {})).toBe('ready');
  });

  it('is ready as soon as the group has values', () => {
    expect(sectionDisplayState(details, 'indGeneral', {})).toBe('ready');
  });

  it('is loading while a group is on its way', () => {
    expect(sectionDisplayState(details, 'workforce', { workforce: 'loading' })).toBe('loading');
  });

  it('is error when the group read failed', () => {
    expect(sectionDisplayState(details, 'workforce', { workforce: 'error' })).toBe('error');
  });

  /**
   * A gate tab's data lands in `supplies`/`products`/`compInputs`, never in a
   * group, so only its load state can say it is ready.
   */
  it('waits on the load state for a gate tab, not on the groups', () => {
    expect(sectionDisplayState(details, 'supplies', {})).toBe('loading');
    expect(sectionDisplayState(details, 'supplies', { supplies: 'loaded' })).toBe('ready');
    expect(sectionDisplayState(details, 'supplies', { supplies: 'error' })).toBe('error');
  });
});
