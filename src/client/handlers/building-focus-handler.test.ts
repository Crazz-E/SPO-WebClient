/**
 * Tests for building-focus-handler — map click routing and inspector switching.
 */

import { handleMapClick } from './building-focus-handler';
import { useBuildingStore } from '../store/building-store';
import { useUiStore } from '../store/ui-store';
import type { ClientHandlerContext } from './client-context';
import type { BuildingFocusInfo, WsRespBuildingFocus } from '../../shared/types';

/* ── Mocks ──────────────────────────────────────────────────────────── */

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: {
    log: jest.fn(),
    showBuildingOverlay: jest.fn(),
    showBuildingPanel: jest.fn(),
    hideBuildingPanel: jest.fn(),
  },
}));

jest.mock('../../shared/building-details/civic-buildings', () => ({
  isCivicBuilding: (vc: string) => vc === '9999',
}));

jest.mock('../facility-dimensions-cache', () => ({
  getFacilityDimensionsCache: () => ({
    getFacility: () => ({ xsize: 1, ysize: 1 }),
  }),
}));

function makeFocusInfo(x: number, y: number): BuildingFocusInfo {
  return {
    buildingName: `Building_${x}_${y}`,
    ownerName: 'TestCorp',
    x,
    y,
    xsize: 1,
    ysize: 1,
    visualClass: '100',
  } as BuildingFocusInfo;
}

function makeCtx(overrides: Partial<ClientHandlerContext> = {}): ClientHandlerContext {
  const focusResp: WsRespBuildingFocus = {
    type: 'RESP_BUILDING_FOCUS' as never,
    building: makeFocusInfo(10, 20),
  };
  return {
    currentBuildingToPlace: null,
    currentFocusedBuilding: null,
    currentFocusedVisualClass: null,
    currentCompanyName: 'TestCorp',
    isFocusingBuilding: false,
    sendRequest: jest.fn().mockResolvedValue(focusResp),
    rawSend: jest.fn(),
    getRenderer: () => ({
      setSelectedBuilding: jest.fn(),
      clearSelectedBuilding: jest.fn(),
    }) as never,
    getMapNavigationUI: () => null,
    nextGeneration: jest.fn().mockReturnValue(1),
    isCurrentGeneration: jest.fn().mockReturnValue(true),
    requestBuildingDetails: jest.fn().mockResolvedValue(null),
    refreshBuildingDetails: jest.fn().mockResolvedValue(undefined),
    speculativeBuildingDetails: new Map(),
    speculativeBuildingResolved: new Map(),
    focusBuilding: jest.fn(),
    showNotification: jest.fn(),
    soundManager: { play: jest.fn() } as never,
    ...overrides,
  } as unknown as ClientHandlerContext;
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe('handleMapClick', () => {
  beforeEach(() => {
    useBuildingStore.getState().clearFocus();
    useUiStore.getState().closeRightPanel();
    useUiStore.getState().closeModal();
  });

  it('ignores portal visual classes', () => {
    const ctx = makeCtx();
    handleMapClick(ctx, 5, 5, '6031');
    handleMapClick(ctx, 5, 5, '6032');
    expect(ctx.sendRequest).not.toHaveBeenCalled();
  });

  it('delegates civic buildings to focusBuilding', () => {
    const ctx = makeCtx();
    handleMapClick(ctx, 5, 5, '9999');
    expect(ctx.focusBuilding).toHaveBeenCalledWith(5, 5, '9999');
  });

  it('skips click when in placement mode', () => {
    const ctx = makeCtx({ currentBuildingToPlace: { name: 'Factory' } as never });
    handleMapClick(ctx, 5, 5, '100');
    expect(ctx.sendRequest).not.toHaveBeenCalled();
  });

  it('shows overlay on first click (two-click flow)', () => {
    const ctx = makeCtx();
    handleMapClick(ctx, 10, 20, '100');
    // Should have sent a focus request for the overlay
    expect(ctx.sendRequest).toHaveBeenCalled();
  });

  it('single-click switches building when inspector is already open', async () => {
    const ctx = makeCtx();
    // Simulate: inspector already open with a different building focused
    useUiStore.getState().openRightPanel('building');
    useBuildingStore.getState().setFocus(makeFocusInfo(1, 1));

    handleMapClick(ctx, 10, 20, '100');

    // Should send a request to switch (not ignored)
    expect(ctx.sendRequest).toHaveBeenCalled();
  });

  it('does nothing when clicking the already-inspected building', () => {
    const ctx = makeCtx();
    // Simulate: inspector open, same building focused
    useUiStore.getState().openRightPanel('building');
    useBuildingStore.getState().setFocus(makeFocusInfo(10, 20));

    handleMapClick(ctx, 10, 20, '100');

    // Should NOT send any request — already inspecting this one
    expect(ctx.sendRequest).not.toHaveBeenCalled();
  });
});
