/**
 * Tests for building-store: overlay state + research state management.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useBuildingStore } from './building-store';
import type { BuildingFocusInfo, ResearchCategoryData, ResearchInventionDetails } from '@/shared/types';

const mockFocusInfo: BuildingFocusInfo = {
  buildingId: '12345',
  buildingName: 'Drug Store',
  ownerName: 'TestCorp',
  salesInfo: 'Pharmaceutics sales at 80%',
  revenue: '($120/h)',
  detailsText: 'Hiring: 12 workers\nSupply: good',
  hintsText: 'Consider raising prices',
  x: 100,
  y: 200,
  xsize: 2,
  ysize: 2,
  visualClass: '1234',
};

const mockInventory: ResearchCategoryData = {
  categoryIndex: 0,
  available: [
    { inventionId: 'GreenTech.Level1', name: 'Green Tech 1', enabled: true },
    { inventionId: 'GreenTech.Level2', name: 'Green Tech 2', enabled: false },
  ],
  developing: [
    { inventionId: 'AI.Level1', name: 'AI Level 1' },
  ],
  completed: [
    { inventionId: 'Basic.Level1', name: 'Basic 1', cost: '$1.5M' },
  ],
};

const mockDetails: ResearchInventionDetails = {
  inventionId: 'GreenTech.Level1',
  properties: 'Cost: $500K\nTime: 12 months',
  description: 'Enables green technology research',
};

function resetStore() {
  useBuildingStore.setState({
    focusedBuilding: null,
    isOverlayMode: false,
    details: null,
    currentTab: 'overview',
    isLoading: false,
    currentCompanyName: '',
    isOwner: false,
    connectionPicker: null,
    research: null,
  });
}

describe('Building Store — Overlay state', () => {
  beforeEach(resetStore);

  it('should start with isOverlayMode as false', () => {
    expect(useBuildingStore.getState().isOverlayMode).toBe(false);
  });

  it('setOverlayMode(true) should enable overlay mode', () => {
    useBuildingStore.getState().setOverlayMode(true);
    expect(useBuildingStore.getState().isOverlayMode).toBe(true);
  });

  it('setFocus + setOverlayMode shows overlay for a building', () => {
    const store = useBuildingStore.getState();
    store.setFocus(mockFocusInfo);
    store.setOverlayMode(true);

    const state = useBuildingStore.getState();
    expect(state.focusedBuilding).toBe(mockFocusInfo);
    expect(state.isOverlayMode).toBe(true);
  });

  it('clearOverlay clears overlay mode but keeps focusedBuilding', () => {
    const store = useBuildingStore.getState();
    store.setFocus(mockFocusInfo);
    store.setOverlayMode(true);
    store.clearOverlay();

    const state = useBuildingStore.getState();
    expect(state.isOverlayMode).toBe(false);
    expect(state.focusedBuilding).toBe(mockFocusInfo);
  });

  it('clearFocus clears both overlay mode and focusedBuilding', () => {
    const store = useBuildingStore.getState();
    store.setFocus(mockFocusInfo);
    store.setOverlayMode(true);
    store.clearFocus();

    const state = useBuildingStore.getState();
    expect(state.isOverlayMode).toBe(false);
    expect(state.focusedBuilding).toBeNull();
  });

  it('replacing focus preserves overlay mode', () => {
    const store = useBuildingStore.getState();
    store.setFocus(mockFocusInfo);
    store.setOverlayMode(true);

    const otherBuilding: BuildingFocusInfo = {
      ...mockFocusInfo,
      buildingId: '99999',
      buildingName: 'Mall',
      x: 300,
      y: 400,
    };
    store.setFocus(otherBuilding);

    const state = useBuildingStore.getState();
    expect(state.focusedBuilding?.buildingName).toBe('Mall');
    expect(state.isOverlayMode).toBe(true);
  });

  it('setOverlayMode(false) promotes overlay to panel mode', () => {
    const store = useBuildingStore.getState();
    store.setFocus(mockFocusInfo);
    store.setOverlayMode(true);
    store.setOverlayMode(false);

    const state = useBuildingStore.getState();
    expect(state.isOverlayMode).toBe(false);
    expect(state.focusedBuilding).toBe(mockFocusInfo);
  });
});

describe('Building Store — Research state', () => {
  beforeEach(resetStore);

  it('should start with research as null', () => {
    expect(useBuildingStore.getState().research).toBeNull();
  });

  it('setResearchInventory should create research state with inventory', () => {
    useBuildingStore.getState().setResearchInventory(mockInventory);

    const research = useBuildingStore.getState().research;
    expect(research).not.toBeNull();
    expect(research!.inventory).toBe(mockInventory);
    expect(research!.isLoadingInventory).toBe(false);
    expect(research!.activeSection).toBe('available');
  });

  it('setResearchSelectedInvention should set selectedInventionId and clear details', () => {
    useBuildingStore.getState().setResearchInventory(mockInventory);
    useBuildingStore.getState().setResearchDetails(mockDetails);
    useBuildingStore.getState().setResearchSelectedInvention('AI.Level1');

    const research = useBuildingStore.getState().research;
    expect(research!.selectedInventionId).toBe('AI.Level1');
    expect(research!.selectedDetails).toBeNull();
  });

  it('setResearchDetails should set details', () => {
    useBuildingStore.getState().setResearchInventory(mockInventory);
    useBuildingStore.getState().setResearchDetails(mockDetails);

    const research = useBuildingStore.getState().research;
    expect(research!.selectedDetails).toBe(mockDetails);
    expect(research!.isLoadingDetails).toBe(false);
  });

  it('setResearchActiveSection should change section and clear selection', () => {
    useBuildingStore.getState().setResearchInventory(mockInventory);
    useBuildingStore.getState().setResearchSelectedInvention('GreenTech.Level1');
    useBuildingStore.getState().setResearchActiveSection('developing');

    const research = useBuildingStore.getState().research;
    expect(research!.activeSection).toBe('developing');
    expect(research!.selectedInventionId).toBeNull();
    expect(research!.selectedDetails).toBeNull();
  });

  it('setResearchLoading should toggle loading flags', () => {
    useBuildingStore.getState().setResearchLoading('inventory', true);
    expect(useBuildingStore.getState().research!.isLoadingInventory).toBe(true);
    expect(useBuildingStore.getState().research!.isLoadingDetails).toBe(false);

    useBuildingStore.getState().setResearchLoading('details', true);
    expect(useBuildingStore.getState().research!.isLoadingDetails).toBe(true);
  });

  it('clearResearch should reset research to null', () => {
    useBuildingStore.getState().setResearchInventory(mockInventory);
    expect(useBuildingStore.getState().research).not.toBeNull();

    useBuildingStore.getState().clearResearch();
    expect(useBuildingStore.getState().research).toBeNull();
  });

  it('clearFocus should also clear research', () => {
    useBuildingStore.getState().setResearchInventory(mockInventory);
    expect(useBuildingStore.getState().research).not.toBeNull();

    useBuildingStore.getState().clearFocus();
    expect(useBuildingStore.getState().research).toBeNull();
    expect(useBuildingStore.getState().focusedBuilding).toBeNull();
  });

  it('setResearchInventory preserves existing research fields', () => {
    useBuildingStore.getState().setResearchActiveSection('developing');
    useBuildingStore.getState().setResearchSelectedInvention('AI.Level1');
    useBuildingStore.getState().setResearchInventory(mockInventory);

    const research = useBuildingStore.getState().research;
    // Inventory update preserves other fields
    expect(research!.inventory).toBe(mockInventory);
    // selectedInventionId is preserved since setResearchInventory doesn't clear it
    expect(research!.selectedInventionId).toBe('AI.Level1');
  });
});
