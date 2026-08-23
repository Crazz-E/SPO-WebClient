/**
 * Tests for ClientBridge — verifies store-pushing methods write to correct stores.
 */

import { ClientBridge } from './client-bridge';
import { useGameStore } from '../store/game-store';
import { useUiStore } from '../store/ui-store';
import { useBuildingStore } from '../store/building-store';
import { useLogStore } from '../store/log-store';

// Mock showToast to prevent import issues in test environment
jest.mock('../components/common/Toast', () => ({
  showToast: jest.fn(),
}));

describe('ClientBridge login flow (replaces window.__spoLoginHandlers)', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('showWorlds should push worlds to game-store', () => {
    const worlds = [
      { name: 'Shamba', status: 'online', players: 5 },
      { name: 'Movistar', status: 'online', players: 3 },
    ];
    ClientBridge.showWorlds(worlds as never[]);

    const state = useGameStore.getState();
    expect(state.loginWorlds).toEqual(worlds);
    expect(state.loginStage).toBe('worlds');
    expect(state.loginLoading).toBe(false);
  });

  it('showCompanies should push companies to game-store', () => {
    const companies = [
      { id: '1', name: 'TestCorp', cluster: 'General' },
    ];
    ClientBridge.showCompanies(companies as never[]);

    const state = useGameStore.getState();
    expect(state.companies).toEqual(companies);
    expect(state.loginStage).toBe('companies');
    expect(state.loginLoading).toBe(false);
  });

  it('setLoginLoading should update game-store loading', () => {
    ClientBridge.setLoginLoading(true);
    expect(useGameStore.getState().loginLoading).toBe(true);

    ClientBridge.setLoginLoading(false);
    expect(useGameStore.getState().loginLoading).toBe(false);
  });
});

describe('ClientBridge build menu (replaces window.__spoBuildMenuHandlers)', () => {
  beforeEach(() => {
    useUiStore.getState().clearBuildMenuData();
  });

  it('setBuildMenuCategories should push to ui-store', () => {
    const categories = [
      { kind: 1, kindName: 'Residential', cluster: 'General', tycoonLevel: 0 },
    ];
    ClientBridge.setBuildMenuCategories(categories as never[]);
    expect(useUiStore.getState().buildMenuCategories).toEqual(categories);
  });

  it('setBuildMenuFacilities should push to ui-store', () => {
    const facilities = [
      { facilityClass: 'house1', name: 'Small House', cost: 1000, area: 4, available: true },
    ];
    ClientBridge.setBuildMenuFacilities(facilities as never[]);
    expect(useUiStore.getState().buildMenuFacilities).toEqual(facilities);
  });
});

describe('ClientBridge existing methods', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it('setConnecting should set status to connecting', () => {
    ClientBridge.setConnecting();
    expect(useGameStore.getState().status).toBe('connecting');
  });

  it('setConnected should set status to connected', () => {
    ClientBridge.setConnected();
    expect(useGameStore.getState().status).toBe('connected');
  });

  it('setDisconnected should set status to disconnected', () => {
    ClientBridge.setConnecting();
    ClientBridge.setDisconnected();
    expect(useGameStore.getState().status).toBe('disconnected');
  });

  it('setCredentials should set username', () => {
    ClientBridge.setCredentials('testUser');
    expect(useGameStore.getState().username).toBe('testUser');
  });

  it('setWorld should set worldName', () => {
    ClientBridge.setWorld('Shamba');
    expect(useGameStore.getState().worldName).toBe('Shamba');
  });

  it('setCompany should set companyName and companyId', () => {
    ClientBridge.setCompany('TestCorp', '42');
    const state = useGameStore.getState();
    expect(state.companyName).toBe('TestCorp');
    expect(state.companyId).toBe('42');
  });

  it('log should add entry to log-store', () => {
    const initialCount = useLogStore.getState().entries.length;
    ClientBridge.log('Test', 'hello world');
    expect(useLogStore.getState().entries.length).toBe(initialCount + 1);
  });

  it('reset should clear all stores', () => {
    ClientBridge.setCredentials('user');
    ClientBridge.setWorld('Shamba');
    ClientBridge.setConnected();

    ClientBridge.reset();

    const state = useGameStore.getState();
    expect(state.status).toBe('disconnected');
    expect(state.username).toBe('');
    expect(state.worldName).toBe('');
  });

  it('setRoadBuildingMode should toggle road building', () => {
    ClientBridge.setRoadBuildingMode(true);
    expect(useGameStore.getState().isRoadBuildingMode).toBe(true);

    ClientBridge.setRoadBuildingMode(false);
    expect(useGameStore.getState().isRoadBuildingMode).toBe(false);
  });

  it('setFocusedBuilding should update building-store', () => {
    const info = { x: 10, y: 20, buildingId: 'B1' };
    ClientBridge.setFocusedBuilding(info as never);
    expect(useBuildingStore.getState().focusedBuilding).toEqual(info);
  });
});

describe('ClientBridge building overlay (stale data prevention)', () => {
  beforeEach(() => {
    useBuildingStore.getState().clearFocus();
    useUiStore.getState().closeRightPanel();
  });

  it('showBuildingOverlay should clear old details when rightPanel is building', () => {
    // Setup: stale details in store + panel already open
    useBuildingStore.getState().setDetails({
      buildingId: 'OLD', buildingName: 'Old Building', ownerName: 'OldCorp',
      x: 50, y: 60, visualClass: '1000', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
      canGovern: true,
    } as never);
    useUiStore.getState().openRightPanel('building');

    // Act: overlay a new building
    const newInfo = { x: 10, y: 20, buildingId: 'NEW', buildingName: 'New Building' };
    ClientBridge.showBuildingOverlay(newInfo as never);

    // Assert: old details cleared, new focus set
    const state = useBuildingStore.getState();
    expect(state.details).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.focusedBuilding).toEqual(newInfo);
    expect(state.isOverlayMode).toBe(true);
  });

  it('showBuildingOverlay should NOT clear details when no panel is open', () => {
    // Setup: details set but no panel open
    useBuildingStore.getState().setDetails({
      buildingId: 'OLD', buildingName: 'Old Building', ownerName: 'OldCorp',
      x: 50, y: 60, visualClass: '1000', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
      canGovern: true,
    } as never);

    // Act: overlay a new building (no panel open)
    const newInfo = { x: 10, y: 20, buildingId: 'NEW' };
    ClientBridge.showBuildingOverlay(newInfo as never);

    // Assert: details still present (overlay doesn't interfere with closed panels)
    const state = useBuildingStore.getState();
    expect(state.details).not.toBeNull();
    expect(state.focusedBuilding).toEqual(newInfo);
    expect(state.isOverlayMode).toBe(true);
  });
});

describe('ClientBridge mail responses (T6)', () => {
  const { useMailStore } = jest.requireActual('../store/mail-store') as typeof import('../store/mail-store');
  const { WsMessageType } = jest.requireActual('../../shared/types') as typeof import('../../shared/types');
  const { showToast } = jest.requireMock('../components/common/Toast') as { showToast: jest.Mock };

  beforeEach(() => {
    useMailStore.setState({ currentView: 'compose', composeTo: 'bob', composeSubject: 's', composeBody: 'b', isSending: true, pendingDeleteId: null, messages: [] });
    showToast.mockClear();
  });

  it('a failed send keeps the draft and says so', () => {
    ClientBridge.handleMailResponse({ type: WsMessageType.RESP_MAIL_SENT, success: false } as never);
    const s = useMailStore.getState();
    expect(s.currentView).toBe('compose');
    expect(s.composeTo).toBe('bob');
    expect(s.isSending).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Message not sent. Your draft is kept.', 'error');
  });

  it('a successful send clears the draft', () => {
    ClientBridge.handleMailResponse({ type: WsMessageType.RESP_MAIL_SENT, success: true } as never);
    expect(useMailStore.getState().currentView).toBe('list');
    expect(useMailStore.getState().composeTo).toBe('');
  });

  it('a confirmed delete removes the pending row locally; a failed one keeps it', () => {
    useMailStore.setState({ messages: [{ messageId: 'a' }, { messageId: 'b' }] as never, pendingDeleteId: 'a', currentView: 'read' });
    ClientBridge.handleMailResponse({ type: WsMessageType.RESP_MAIL_DELETED, success: true } as never);
    expect(useMailStore.getState().messages.map((m) => m.messageId)).toEqual(['b']);
    expect(useMailStore.getState().pendingDeleteId).toBeNull();
    useMailStore.setState({ pendingDeleteId: 'b' });
    ClientBridge.handleMailResponse({ type: WsMessageType.RESP_MAIL_DELETED, success: false } as never);
    expect(useMailStore.getState().messages.map((m) => m.messageId)).toEqual(['b']);
    expect(useMailStore.getState().pendingDeleteId).toBeNull();
  });
});
