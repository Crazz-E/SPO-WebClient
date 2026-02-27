/**
 * Tests for game-store — login flow state.
 */

import { useGameStore } from './game-store';

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
