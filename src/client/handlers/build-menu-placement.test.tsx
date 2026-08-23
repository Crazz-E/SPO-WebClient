/**
 * build-menu-handler — the placement lifecycle publishes what is being placed (name, cost)
 * so the mode bar can show it, and clears it on cancel.
 */

import { placeBuildingFromMenu, cancelBuildingPlacement } from './build-menu-handler';
import { useUiStore } from '../store/ui-store';
import type { ClientHandlerContext } from './client-context';

jest.mock('../bridge/client-bridge', () => ({
  ClientBridge: { log: jest.fn(), showNotification: jest.fn() },
}));
jest.mock('../facility-dimensions-cache', () => ({
  getFacilityDimensions: jest.fn().mockResolvedValue({ xsize: 2, ysize: 2 }),
  getFacilityDimensionsCache: () => ({ getFacility: () => ({ xsize: 2, ysize: 2 }) }),
}));

function makeCtx(): ClientHandlerContext {
  return {
    currentBuildingToPlace: null,
    currentBuildingXSize: 1,
    currentBuildingYSize: 1,
    lastLoadedFacilities: [{ name: 'Textile Mill', cost: 240000, facilityClass: 'TextileMill', visualClassId: '123' }],
    showNotification: jest.fn(),
    getRenderer: () => null,
    activeOverlayType: null,
    toggleZoneOverlay: jest.fn(),
    isRoadBuildingMode: false,
    isRoadDemolishMode: false,
    isZonePaintingMode: false,
  } as unknown as ClientHandlerContext;
}

describe('placement lifecycle and the mode bar', () => {
  beforeEach(() => {
    useUiStore.setState({ isPlacingBuilding: false, placementValid: false, placingFacility: null });
  });

  it('publishes the facility being placed, then clears it on cancel', async () => {
    const ctx = makeCtx();
    placeBuildingFromMenu(ctx, 'TextileMill', '123');
    // startBuildingPlacement is async (dimensions lookup); let it settle
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(useUiStore.getState().isPlacingBuilding).toBe(true);
    expect(useUiStore.getState().placingFacility).toEqual({ name: 'Textile Mill', cost: 240000 });
    cancelBuildingPlacement(ctx);
    expect(useUiStore.getState().isPlacingBuilding).toBe(false);
    expect(useUiStore.getState().placingFacility).toBeNull();
  });

  it('an unknown facility is logged, not placed', () => {
    const ctx = makeCtx();
    placeBuildingFromMenu(ctx, 'Nope', '0');
    expect(useUiStore.getState().isPlacingBuilding).toBe(false);
  });
});
