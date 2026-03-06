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
    usePoliticsStore.getState().setTownContext('Shamba', 100, 200);
    usePoliticsStore.getState().setTycoonRole(makeRole('Alice'));

    usePoliticsStore.getState().reset();

    expect(usePoliticsStore.getState().townName).toBe('');
    expect(usePoliticsStore.getState().politicalRoles.size).toBe(0);
  });
});
