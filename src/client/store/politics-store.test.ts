/**
 * Tests for politics-store — political roles cache.
 */

import { usePoliticsStore } from './politics-store';
import type { PoliticalRoleInfo } from '@/shared/types';

const makeRole = (name: string, overrides: Partial<PoliticalRoleInfo> = {}): PoliticalRoleInfo => ({
  tycoonName: name,
  isMayor: false,
  town: '',
  isCapitalMayor: false,
  isPresident: false,
  isMinister: false,
  ministry: '',
  queriedAt: Date.now(),
  ...overrides,
});

describe('politics-store political roles cache', () => {
  beforeEach(() => {
    usePoliticsStore.getState().reset();
  });

  it('should have empty roles on init', () => {
    const state = usePoliticsStore.getState();
    expect(state.politicalRoles.size).toBe(0);
    expect(state.roleQueryPending.size).toBe(0);
  });

  it('setTycoonRole should store and retrieve by lowercase key', () => {
    const role = makeRole('SPO_test3', { isPresident: true });
    usePoliticsStore.getState().setTycoonRole(role);

    expect(usePoliticsStore.getState().getTycoonRole('SPO_test3')).toEqual(role);
    expect(usePoliticsStore.getState().getTycoonRole('spo_test3')).toEqual(role);
    expect(usePoliticsStore.getState().getTycoonRole('SPO_TEST3')).toEqual(role);
  });

  it('setTycoonRole should overwrite existing entry', () => {
    const role1 = makeRole('Alice', { isMayor: true, town: 'Shamba' });
    const role2 = makeRole('Alice', { isMinister: true, ministry: 'Defense' });

    usePoliticsStore.getState().setTycoonRole(role1);
    expect(usePoliticsStore.getState().getTycoonRole('alice')?.isMayor).toBe(true);

    usePoliticsStore.getState().setTycoonRole(role2);
    expect(usePoliticsStore.getState().getTycoonRole('alice')?.isMinister).toBe(true);
    expect(usePoliticsStore.getState().getTycoonRole('alice')?.isMayor).toBe(false);
  });

  it('should cache multiple tycoons simultaneously', () => {
    usePoliticsStore.getState().setTycoonRole(makeRole('Alice', { isPresident: true }));
    usePoliticsStore.getState().setTycoonRole(makeRole('Bob', { isMayor: true }));
    usePoliticsStore.getState().setTycoonRole(makeRole('Carol', { isMinister: true }));

    expect(usePoliticsStore.getState().politicalRoles.size).toBe(3);
    expect(usePoliticsStore.getState().getTycoonRole('alice')?.isPresident).toBe(true);
    expect(usePoliticsStore.getState().getTycoonRole('bob')?.isMayor).toBe(true);
    expect(usePoliticsStore.getState().getTycoonRole('carol')?.isMinister).toBe(true);
  });

  it('getTycoonRole should return undefined for unknown tycoon', () => {
    expect(usePoliticsStore.getState().getTycoonRole('unknown')).toBeUndefined();
  });

  it('setRoleQueryPending should track pending queries', () => {
    usePoliticsStore.getState().setRoleQueryPending('Alice', true);
    expect(usePoliticsStore.getState().isRoleQueryPending('alice')).toBe(true);
    expect(usePoliticsStore.getState().isRoleQueryPending('ALICE')).toBe(true);

    usePoliticsStore.getState().setRoleQueryPending('Alice', false);
    expect(usePoliticsStore.getState().isRoleQueryPending('alice')).toBe(false);
  });

  it('clearRoles should empty both collections', () => {
    usePoliticsStore.getState().setTycoonRole(makeRole('Alice', { isPresident: true }));
    usePoliticsStore.getState().setRoleQueryPending('Bob', true);

    usePoliticsStore.getState().clearRoles();

    expect(usePoliticsStore.getState().politicalRoles.size).toBe(0);
    expect(usePoliticsStore.getState().roleQueryPending.size).toBe(0);
  });

  it('reset should clear roles and pending queries', () => {
    usePoliticsStore.getState().setTycoonRole(makeRole('Alice', { isMayor: true }));
    usePoliticsStore.getState().setRoleQueryPending('Bob', true);

    usePoliticsStore.getState().reset();

    expect(usePoliticsStore.getState().politicalRoles.size).toBe(0);
    expect(usePoliticsStore.getState().roleQueryPending.size).toBe(0);
  });

  it('reset should also clear existing politics data', () => {
    usePoliticsStore.getState().setTownContext('Shamba', 100, 200, false);
    usePoliticsStore.getState().setTycoonRole(makeRole('Alice'));

    usePoliticsStore.getState().reset();

    expect(usePoliticsStore.getState().townName).toBe('');
    expect(usePoliticsStore.getState().politicalRoles.size).toBe(0);
  });
});

// =============================================================================
// Building context and the optimistic maps
// =============================================================================
describe('politics-store — building context', () => {
  beforeEach(() => {
    usePoliticsStore.getState().reset();
  });

  it('a new building context clears what was read for the previous one', () => {
    usePoliticsStore.getState().setTownContext('Shamba', 100, 200, false);
    usePoliticsStore.getState().setLoadState('loaded');
    usePoliticsStore.getState().setPendingRating('1', 70);

    usePoliticsStore.getState().setTownContext('Helartia', 300, 400, false);

    const s = usePoliticsStore.getState();
    expect(s.townName).toBe('Helartia');
    expect(s.buildingX).toBe(300);
    expect(s.loadState).toBe('idle');
    expect(s.pendingRatings.size).toBe(0);
  });

  // Switching tabs inside one modal re-runs showBuildingPanel; refetching the
  // five Politics pages each time would be paid for nothing.
  it('re-entering the SAME building keeps its loaded data', () => {
    usePoliticsStore.getState().setTownContext('Shamba', 100, 200, false);
    usePoliticsStore.getState().setLoadState('loaded');

    usePoliticsStore.getState().setTownContext('Shamba', 100, 200, false);

    expect(usePoliticsStore.getState().loadState).toBe('loaded');
  });

  it('the same coordinates with a different kind are a different context', () => {
    usePoliticsStore.getState().setTownContext('Shamba', 100, 200, false);
    usePoliticsStore.getState().setLoadState('loaded');

    usePoliticsStore.getState().setTownContext('Shamba', 100, 200, true);

    expect(usePoliticsStore.getState().loadState).toBe('idle');
    expect(usePoliticsStore.getState().isCapitol).toBe(true);
  });

  it('setLoadState keeps isLoading in step', () => {
    usePoliticsStore.getState().setLoadState('loading');
    expect(usePoliticsStore.getState().isLoading).toBe(true);
    usePoliticsStore.getState().setLoadState('loaded');
    expect(usePoliticsStore.getState().isLoading).toBe(false);
  });

  it('the three pending maps each record their own edit', () => {
    usePoliticsStore.getState().setPendingRating('r1', 70);
    usePoliticsStore.getState().setPendingPublicity('r1', 25);
    usePoliticsStore.getState().setPendingProject('p1', 'Bob');

    const s = usePoliticsStore.getState();
    expect(s.pendingRatings.get('r1')).toBe(70);
    expect(s.pendingPublicity.get('r1')).toBe(25);
    expect(s.pendingProjects.get('p1')).toBe('Bob');
  });

  // A fresh read is the server's answer; whatever we painted optimistically is
  // superseded by it, right or wrong.
  it('a fresh read drops every optimistic value', () => {
    usePoliticsStore.getState().setPendingRating('r1', 70);
    usePoliticsStore.getState().setPendingPublicity('r1', 25);
    usePoliticsStore.getState().setPendingProject('p1', 'Bob');

    usePoliticsStore.getState().setData({
      townName: 'Shamba', isCapitol: false, hasRuler: false, yearsToElections: 0,
      mayorName: '', mayorPrestige: 0, mayorRating: 0, tycoonsRating: 0, ifelRating: 0,
      mandateNo: 0, rulerPhotoUrl: '', popularRatings: [], ifelRatings: [], tycoonsRatings: [],
      publicity: [], publicityAds: '', campaignCount: 0, campaigns: [],
      campaignState: 'available', campaignMessage: '', canLaunchCampaign: true,
      prestigeThreshold: 200, projects: [], promise: '', townHallId: 0,
    });

    const s = usePoliticsStore.getState();
    expect(s.loadState).toBe('loaded');
    expect(s.pendingRatings.size).toBe(0);
    expect(s.pendingPublicity.size).toBe(0);
    expect(s.pendingProjects.size).toBe(0);
  });

  it('remembers which rail each side is on', () => {
    usePoliticsStore.getState().setActiveRatingRail('publicity');
    usePoliticsStore.getState().setActiveCampaignRail('all');
    expect(usePoliticsStore.getState().activeRatingRail).toBe('publicity');
    expect(usePoliticsStore.getState().activeCampaignRail).toBe('all');
  });
});
