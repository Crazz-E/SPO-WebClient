/**
 * Tests for server switch overlay — state transitions and escape handling.
 *
 * Since tests run in Node (no jsdom), we test the store logic and
 * state machine that drives the overlay rather than React rendering.
 */

import { useGameStore } from '../../store/game-store';
import { useUiStore } from '../../store/ui-store';

describe('ServerSwitchOverlay state machine', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    // ui-store doesn't have reset, manually close everything
    useUiStore.setState({
      rightPanel: null,
      leftPanel: null,
      modal: null,
      confirmPayload: null,
      commandPaletteOpen: false,
    });
  });

  it('enterServerSwitch sets mode, origin world, and stage', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().setStatus('connected');
    useGameStore.getState().enterServerSwitch();

    const state = useGameStore.getState();
    expect(state.serverSwitchMode).toBe(true);
    expect(state.serverSwitchOriginWorld).toBe('Shamba');
    expect(state.loginStage).toBe('zones');
    expect(state.loginLoading).toBe(false);
    // Status remains connected (game keeps running)
    expect(state.status).toBe('connected');
  });

  it('cancelServerSwitch restores state without side effects', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().setStatus('connected');
    useGameStore.getState().enterServerSwitch();

    useGameStore.getState().cancelServerSwitch();

    const state = useGameStore.getState();
    expect(state.serverSwitchMode).toBe(false);
    expect(state.serverSwitchOriginWorld).toBe('');
    // Status still connected — game was never interrupted
    expect(state.status).toBe('connected');
    // World name preserved
    expect(state.worldName).toBe('Shamba');
  });

  it('zone selection advances to worlds stage', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().enterServerSwitch();

    // Simulate directory connect response
    const worlds = [
      { name: 'Movistar', status: 'online', players: 3 },
    ];
    useGameStore.getState().setLoginWorlds(worlds as never[]);

    const state = useGameStore.getState();
    expect(state.loginStage).toBe('worlds');
    expect(state.loginWorlds).toEqual(worlds);
    // Still in switch mode
    expect(state.serverSwitchMode).toBe(true);
  });

  it('world selection advances to companies stage', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().enterServerSwitch();

    // Simulate loginWorld response
    const companies = [{ id: '1', name: 'NewCorp' }];
    useGameStore.getState().setLoginCompanies(companies as never[]);

    const state = useGameStore.getState();
    expect(state.loginStage).toBe('companies');
    expect(state.companies).toEqual(companies);
    // Still in switch mode until company selected
    expect(state.serverSwitchMode).toBe(true);
  });

  it('completeServerSwitch clears overlay at company stage', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().enterServerSwitch();
    useGameStore.getState().setLoginCompanies([{ id: '1', name: 'X' }] as never[]);

    // Simulate selectCompanyAndStart completing
    useGameStore.getState().completeServerSwitch();

    const state = useGameStore.getState();
    expect(state.serverSwitchMode).toBe(false);
    expect(state.serverSwitchOriginWorld).toBe('');
    // loginStage remains 'companies' (not reset)
    expect(state.loginStage).toBe('companies');
  });
});

describe('ServerSwitchOverlay escape key handling', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useUiStore.setState({
      rightPanel: null,
      leftPanel: null,
      modal: null,
      confirmPayload: null,
      commandPaletteOpen: false,
    });
  });

  it('Escape cancels server switch on zones stage', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().setStatus('connected');
    useGameStore.getState().enterServerSwitch();

    useUiStore.getState().dismissTopmost();

    expect(useGameStore.getState().serverSwitchMode).toBe(false);
  });

  it('Escape cancels server switch on worlds stage', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().enterServerSwitch();
    useGameStore.getState().setLoginWorlds([{ name: 'X' }] as never[]);

    useUiStore.getState().dismissTopmost();

    expect(useGameStore.getState().serverSwitchMode).toBe(false);
  });

  it('Escape does NOT cancel at companies stage', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().enterServerSwitch();
    useGameStore.getState().setLoginCompanies([{ id: '1', name: 'X' }] as never[]);

    useUiStore.getState().dismissTopmost();

    // Cannot cancel at companies stage — old server already disconnected
    expect(useGameStore.getState().serverSwitchMode).toBe(true);
  });

  it('Escape does NOT cancel when loading after world selection', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().enterServerSwitch();
    useGameStore.getState().setLoginWorlds([{ name: 'X' }] as never[]);
    useGameStore.getState().setLoginLoading(true);

    useUiStore.getState().dismissTopmost();

    // Cannot cancel while loading — old session may be torn down
    expect(useGameStore.getState().serverSwitchMode).toBe(true);
  });

  it('command palette takes priority over server switch overlay', () => {
    useGameStore.getState().setWorld('Shamba');
    useGameStore.getState().enterServerSwitch();
    useUiStore.setState({ commandPaletteOpen: true });

    useUiStore.getState().dismissTopmost();

    // Command palette closed, but server switch still active
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
    expect(useGameStore.getState().serverSwitchMode).toBe(true);
  });
});
