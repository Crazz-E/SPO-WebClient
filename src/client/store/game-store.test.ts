/**
 * Tests for game-store — login flow state.
 */

import { useGameStore, delphiTDateTimeToJsDate } from './game-store';

describe('game-store login flow state', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('should have correct initial login state', () => {
    const state = useGameStore.getState();
    expect(state.loginWorlds).toEqual([]);
    expect(state.loginStage).toBe('auth');
    expect(state.loginLoading).toBe(false);
  });

  it('setLoginWorlds should set worlds, stage, and clear loading', () => {
    useGameStore.getState().setLoginLoading(true);
    const worlds = [
      { name: 'Shamba', status: 'online', players: 5 },
      { name: 'Movistar', status: 'online', players: 3 },
    ];
    useGameStore.getState().setLoginWorlds(worlds as never[]);

    const state = useGameStore.getState();
    expect(state.loginWorlds).toEqual(worlds);
    expect(state.loginStage).toBe('worlds');
    expect(state.loginLoading).toBe(false);
  });

  it('setLoginCompanies should set companies, stage, and clear loading', () => {
    useGameStore.getState().setLoginLoading(true);
    const companies = [
      { id: '1', name: 'TestCorp', cluster: 'General' },
    ];
    useGameStore.getState().setLoginCompanies(companies as never[]);

    const state = useGameStore.getState();
    expect(state.companies).toEqual(companies);
    expect(state.loginStage).toBe('companies');
    expect(state.loginLoading).toBe(false);
  });

  it('setLoginStage should update stage independently', () => {
    useGameStore.getState().setLoginStage('worlds');
    expect(useGameStore.getState().loginStage).toBe('worlds');

    useGameStore.getState().setLoginStage('auth');
    expect(useGameStore.getState().loginStage).toBe('auth');
  });

  it('setLoginLoading should update loading independently', () => {
    useGameStore.getState().setLoginLoading(true);
    expect(useGameStore.getState().loginLoading).toBe(true);

    useGameStore.getState().setLoginLoading(false);
    expect(useGameStore.getState().loginLoading).toBe(false);
  });

  it('reset should clear login state', () => {
    useGameStore.getState().setLoginWorlds([{ name: 'Shamba' }] as never[]);
    useGameStore.getState().setLoginStage('companies');
    useGameStore.getState().setLoginLoading(true);

    useGameStore.getState().reset();

    const state = useGameStore.getState();
    expect(state.loginWorlds).toEqual([]);
    expect(state.loginStage).toBe('auth');
    expect(state.loginLoading).toBe(false);
  });
});

describe('game-store existing state', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('should preserve existing setCompanies behavior', () => {
    const companies = [{ id: '1', name: 'Foo' }];
    useGameStore.getState().setCompanies(companies as never[]);
    expect(useGameStore.getState().companies).toEqual(companies);
  });

  it('should preserve existing status transitions', () => {
    useGameStore.getState().setStatus('connecting');
    expect(useGameStore.getState().status).toBe('connecting');

    useGameStore.getState().setStatus('connected');
    expect(useGameStore.getState().status).toBe('connected');
  });
});

describe('game-store gameDate', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('should start with null gameDate', () => {
    expect(useGameStore.getState().gameDate).toBeNull();
  });

  it('setGameDate should store the date', () => {
    const date = new Date(2050, 0, 1);
    useGameStore.getState().setGameDate(date);
    expect(useGameStore.getState().gameDate).toEqual(date);
  });

  it('reset should clear gameDate', () => {
    useGameStore.getState().setGameDate(new Date());
    useGameStore.getState().reset();
    expect(useGameStore.getState().gameDate).toBeNull();
  });
});

describe('game-store cluster browsing state', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('should start with empty cluster browsing state', () => {
    const state = useGameStore.getState();
    expect(state.companyCreationClusters).toEqual([]);
    expect(state.clusterInfo).toBeNull();
    expect(state.clusterInfoLoading).toBe(false);
    expect(state.clusterFacilities).toEqual([]);
    expect(state.clusterFacilitiesLoading).toBe(false);
  });

  it('setCompanyCreationClusters should store cluster IDs', () => {
    useGameStore.getState().setCompanyCreationClusters(['PGI', 'Moab']);
    expect(useGameStore.getState().companyCreationClusters).toEqual(['PGI', 'Moab']);
  });

  it('setClusterInfoLoading should set loading flag', () => {
    useGameStore.getState().setClusterInfoLoading(true);
    expect(useGameStore.getState().clusterInfoLoading).toBe(true);
  });

  it('setClusterInfo should store info and clear loading', () => {
    useGameStore.getState().setClusterInfoLoading(true);
    const info = {
      id: 'Dissidents',
      displayName: 'Dissidents',
      description: 'A rebel cluster.',
      categories: [{ name: 'Farms', folder: '00000003.DissidentsFarms.five' }],
    };
    useGameStore.getState().setClusterInfo(info);

    const state = useGameStore.getState();
    expect(state.clusterInfo).toEqual(info);
    expect(state.clusterInfoLoading).toBe(false);
  });

  it('setClusterInfo(null) should clear info', () => {
    useGameStore.getState().setClusterInfo({
      id: 'PGI', displayName: 'PGI', description: 'test', categories: [],
    });
    useGameStore.getState().setClusterInfo(null);
    expect(useGameStore.getState().clusterInfo).toBeNull();
  });

  it('setClusterFacilitiesLoading should set loading flag', () => {
    useGameStore.getState().setClusterFacilitiesLoading(true);
    expect(useGameStore.getState().clusterFacilitiesLoading).toBe(true);
  });

  it('setClusterFacilities should store facilities and clear loading', () => {
    useGameStore.getState().setClusterFacilitiesLoading(true);
    const facilities = [
      { name: 'Farm A', iconUrl: '/icon.gif', cost: '$500K', buildTime: '100 m.', zoneType: 'Rural', description: '' },
    ];
    useGameStore.getState().setClusterFacilities(facilities);

    const state = useGameStore.getState();
    expect(state.clusterFacilities).toEqual(facilities);
    expect(state.clusterFacilitiesLoading).toBe(false);
  });

  it('reset should clear all cluster browsing state', () => {
    useGameStore.getState().setCompanyCreationClusters(['PGI']);
    useGameStore.getState().setClusterInfo({
      id: 'PGI', displayName: 'PGI', description: 'test', categories: [],
    });
    useGameStore.getState().setClusterFacilities([
      { name: 'X', iconUrl: '', cost: '', buildTime: '', zoneType: '', description: '' },
    ]);

    useGameStore.getState().reset();

    const state = useGameStore.getState();
    expect(state.companyCreationClusters).toEqual([]);
    expect(state.clusterInfo).toBeNull();
    expect(state.clusterInfoLoading).toBe(false);
    expect(state.clusterFacilities).toEqual([]);
    expect(state.clusterFacilitiesLoading).toBe(false);
  });
});

describe('delphiTDateTimeToJsDate', () => {
  it('should convert 0 to Dec 30, 1899', () => {
    const result = delphiTDateTimeToJsDate(0);
    expect(result.getFullYear()).toBe(1899);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(30);
  });

  it('should convert 1 to Dec 31, 1899', () => {
    const result = delphiTDateTimeToJsDate(1);
    expect(result.getFullYear()).toBe(1899);
    expect(result.getMonth()).toBe(11);
    expect(result.getDate()).toBe(31);
  });

  it('should convert 2 to Jan 1, 1900', () => {
    const result = delphiTDateTimeToJsDate(2);
    expect(result.getFullYear()).toBe(1900);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(1);
  });

  it('should convert a known game date (78006) to a reasonable date', () => {
    // 78006 days after Dec 30, 1899 ≈ year 2113
    const result = delphiTDateTimeToJsDate(78006);
    expect(result.getFullYear()).toBeGreaterThan(2000);
    expect(result instanceof Date).toBe(true);
    expect(isNaN(result.getTime())).toBe(false);
  });
});
