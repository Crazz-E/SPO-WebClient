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
    ownedCompanyNames: new Set<string>(),
    isOwner: false,
    connectionPicker: null,
    research: null,
    pendingUpdates: new Map(),
    failedUpdates: new Map(),
    confirmedUpdates: new Map(),
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

describe('Building Store — clearDetails (stale data prevention)', () => {
  beforeEach(resetStore);

  it('clearDetails nulls details and sets isLoading=true', () => {
    const store = useBuildingStore.getState();
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: 'TestCorp',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });

    store.clearDetails();

    const state = useBuildingStore.getState();
    expect(state.details).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.currentTab).toBe('overview');
    expect(state.isOwner).toBe(false);
    expect(state.research).toBeNull();
  });

  it('clearDetails preserves focusedBuilding and isOverlayMode', () => {
    const store = useBuildingStore.getState();
    store.setFocus(mockFocusInfo);
    store.setOverlayMode(true);
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: 'TestCorp',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });

    store.clearDetails();

    const state = useBuildingStore.getState();
    expect(state.focusedBuilding).toBe(mockFocusInfo);
    expect(state.isOverlayMode).toBe(true);
    expect(state.details).toBeNull();
  });

  it('clearDetails clears optimistic update maps', () => {
    const store = useBuildingStore.getState();
    store.setPending('price', '100');
    store.failPending('other', '50', 'rejected');

    store.clearDetails();

    const state = useBuildingStore.getState();
    expect(state.pendingUpdates.size).toBe(0);
    expect(state.failedUpdates.size).toBe(0);
    expect(state.confirmedUpdates.size).toBe(0);
  });
});

describe('Building Store — Ownership for under-construction buildings', () => {
  beforeEach(resetStore);

  it('isOwner true when details.ownerName matches currentCompanyName', () => {
    const store = useBuildingStore.getState();
    store.setOwnedCompanyNames(new Set(['TestCorp']));
    store.setCurrentCompanyName('TestCorp');
    store.setFocus(mockFocusInfo);
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: 'TestCorp',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });
    expect(useBuildingStore.getState().isOwner).toBe(true);
  });

  it('isOwner false when details.ownerName does not match', () => {
    const store = useBuildingStore.getState();
    store.setOwnedCompanyNames(new Set(['TestCorp']));
    store.setCurrentCompanyName('TestCorp');
    store.setFocus(mockFocusInfo);
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: 'OtherCorp',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });
    expect(useBuildingStore.getState().isOwner).toBe(false);
  });

  it('isOwner falls back to focusedBuilding.ownerName when details.ownerName is empty', () => {
    const store = useBuildingStore.getState();
    store.setOwnedCompanyNames(new Set(['TestCorp']));
    store.setCurrentCompanyName('TestCorp');
    store.setFocus(mockFocusInfo); // ownerName = 'TestCorp'
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: '',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });
    expect(useBuildingStore.getState().isOwner).toBe(true);
  });

  it('isOwner false when both details and focus owner are empty', () => {
    const store = useBuildingStore.getState();
    store.setOwnedCompanyNames(new Set(['TestCorp']));
    store.setCurrentCompanyName('TestCorp');
    store.setFocus({ ...mockFocusInfo, ownerName: '' });
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: '',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });
    expect(useBuildingStore.getState().isOwner).toBe(false);
  });

  it('isOwner false when focus owner does not match (fallback path)', () => {
    const store = useBuildingStore.getState();
    store.setOwnedCompanyNames(new Set(['TestCorp']));
    store.setCurrentCompanyName('TestCorp');
    store.setFocus({ ...mockFocusInfo, ownerName: 'OtherCorp' });
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: '',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });
    expect(useBuildingStore.getState().isOwner).toBe(false);
  });

  it('isOwner true when building belongs to a different owned company (cross-company)', () => {
    const store = useBuildingStore.getState();
    // Tycoon owns both TestCorp and OtherCorp, but active company is TestCorp
    store.setOwnedCompanyNames(new Set(['TestCorp', 'OtherCorp']));
    store.setCurrentCompanyName('TestCorp');
    store.setFocus(mockFocusInfo);
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: 'OtherCorp',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });
    // Should be true — tycoon owns OtherCorp even though it's not the active company
    expect(useBuildingStore.getState().isOwner).toBe(true);
  });

  it('setOwnedCompanyNames recomputes isOwner for focused building', () => {
    const store = useBuildingStore.getState();
    store.setFocus(mockFocusInfo); // ownerName = 'TestCorp'
    store.setDetails({
      buildingId: '12345', buildingName: 'Drug Store', ownerName: '',
      x: 100, y: 200, visualClass: '1234', templateName: 'Building',
      securityId: '', tabs: [], groups: {}, timestamp: Date.now(),
    });
    // Initially no owned companies — not owner
    expect(useBuildingStore.getState().isOwner).toBe(false);

    // Add TestCorp to owned set — now owner via focus fallback
    useBuildingStore.getState().setOwnedCompanyNames(new Set(['TestCorp']));
    expect(useBuildingStore.getState().isOwner).toBe(true);
  });
});

describe('Building Store — Research state', () => {
  beforeEach(resetStore);

  it('should start with research as null', () => {
    expect(useBuildingStore.getState().research).toBeNull();
  });

  it('setResearchInventory should create research state with inventory in category map', () => {
    useBuildingStore.getState().setResearchInventory(mockInventory);

    const research = useBuildingStore.getState().research;
    expect(research).not.toBeNull();
    expect(research!.inventoryByCategory.get(0)).toBe(mockInventory);
    expect(research!.loadedCategories.has(0)).toBe(true);
    expect(research!.isLoadingInventory).toBe(false);
    expect(research!.activeCategoryIndex).toBe(0);
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

  it('setResearchActiveCategoryIndex should change tab and clear selection', () => {
    useBuildingStore.getState().setResearchInventory(mockInventory);
    useBuildingStore.getState().setResearchSelectedInvention('GreenTech.Level1');
    useBuildingStore.getState().setResearchActiveCategoryIndex(2);

    const research = useBuildingStore.getState().research;
    expect(research!.activeCategoryIndex).toBe(2);
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
    useBuildingStore.getState().setResearchActiveCategoryIndex(1);
    useBuildingStore.getState().setResearchSelectedInvention('AI.Level1');
    useBuildingStore.getState().setResearchInventory(mockInventory);

    const research = useBuildingStore.getState().research;
    expect(research!.inventoryByCategory.get(0)).toBe(mockInventory);
    // selectedInventionId is preserved since setResearchInventory doesn't clear it
    expect(research!.selectedInventionId).toBe('AI.Level1');
  });

  it('setResearchCategoryTabs should store tab labels', () => {
    const tabs = ['GENERAL', 'COMMERCE', 'REAL ESTATE', 'INDUSTRY', 'CIVICS'];
    useBuildingStore.getState().setResearchCategoryTabs(tabs);

    const research = useBuildingStore.getState().research;
    expect(research!.categoryTabs).toEqual(tabs);
  });

  it('setResearchInventory caches multiple categories independently', () => {
    const cat1: ResearchCategoryData = {
      categoryIndex: 1,
      available: [{ inventionId: 'Commerce.L1', name: 'Commerce 1', enabled: true }],
      developing: [],
      completed: [],
    };
    useBuildingStore.getState().setResearchInventory(mockInventory);
    useBuildingStore.getState().setResearchInventory(cat1);

    const research = useBuildingStore.getState().research;
    expect(research!.inventoryByCategory.size).toBe(2);
    expect(research!.inventoryByCategory.get(0)).toBe(mockInventory);
    expect(research!.inventoryByCategory.get(1)).toBe(cat1);
    expect(research!.loadedCategories.has(0)).toBe(true);
    expect(research!.loadedCategories.has(1)).toBe(true);
  });
});

describe('Building Store — Optimistic SET feedback', () => {
  beforeEach(resetStore);

  it('should start with empty pending/failed/confirmed maps', () => {
    const state = useBuildingStore.getState();
    expect(state.pendingUpdates.size).toBe(0);
    expect(state.failedUpdates.size).toBe(0);
    expect(state.confirmedUpdates.size).toBe(0);
  });

  it('setPending adds an entry to pendingUpdates', () => {
    useBuildingStore.getState().setPending('RDOSetPrice:{"index":"0"}', '250');
    const pending = useBuildingStore.getState().pendingUpdates;
    expect(pending.size).toBe(1);
    expect(pending.get('RDOSetPrice:{"index":"0"}')).toMatchObject({ value: '250' });
  });

  it('setPending clears any previous failure for the same key', () => {
    const store = useBuildingStore.getState();
    store.failPending('RDOSetPrice:{"index":"0"}', '100', 'Server error');
    expect(useBuildingStore.getState().failedUpdates.size).toBe(1);

    store.setPending('RDOSetPrice:{"index":"0"}', '200');
    expect(useBuildingStore.getState().failedUpdates.size).toBe(0);
    expect(useBuildingStore.getState().pendingUpdates.size).toBe(1);
  });

  it('confirmPending moves entry from pending to confirmed', () => {
    const store = useBuildingStore.getState();
    store.setPending('RDOSetPrice:{"index":"0"}', '250');
    expect(useBuildingStore.getState().pendingUpdates.size).toBe(1);

    store.confirmPending('RDOSetPrice:{"index":"0"}');
    expect(useBuildingStore.getState().pendingUpdates.size).toBe(0);
    expect(useBuildingStore.getState().confirmedUpdates.size).toBe(1);
    expect(useBuildingStore.getState().confirmedUpdates.has('RDOSetPrice:{"index":"0"}')).toBe(true);
  });

  it('failPending moves entry from pending to failed with error info', () => {
    const store = useBuildingStore.getState();
    store.setPending('RDOSetSalaries', '500');
    store.failPending('RDOSetSalaries', '500', 'Request Timeout');

    expect(useBuildingStore.getState().pendingUpdates.size).toBe(0);
    const failed = useBuildingStore.getState().failedUpdates.get('RDOSetSalaries');
    expect(failed).toMatchObject({ originalValue: '500', error: 'Request Timeout' });
  });

  it('clearFailed removes a specific failed entry', () => {
    const store = useBuildingStore.getState();
    store.failPending('key1', '10', 'Error 1');
    store.failPending('key2', '20', 'Error 2');
    expect(useBuildingStore.getState().failedUpdates.size).toBe(2);

    store.clearFailed('key1');
    expect(useBuildingStore.getState().failedUpdates.size).toBe(1);
    expect(useBuildingStore.getState().failedUpdates.has('key1')).toBe(false);
    expect(useBuildingStore.getState().failedUpdates.has('key2')).toBe(true);
  });

  it('clearConfirmed removes a specific confirmed entry', () => {
    const store = useBuildingStore.getState();
    store.setPending('k1', '1');
    store.setPending('k2', '2');
    store.confirmPending('k1');
    store.confirmPending('k2');
    expect(useBuildingStore.getState().confirmedUpdates.size).toBe(2);

    store.clearConfirmed('k1');
    expect(useBuildingStore.getState().confirmedUpdates.size).toBe(1);
    expect(useBuildingStore.getState().confirmedUpdates.has('k2')).toBe(true);
  });

  it('clearFocus clears all optimistic maps', () => {
    const store = useBuildingStore.getState();
    store.setPending('p1', '1');
    store.failPending('p2', '2', 'fail');
    store.setPending('p3', '3');
    store.confirmPending('p3');

    store.clearFocus();
    expect(useBuildingStore.getState().pendingUpdates.size).toBe(0);
    expect(useBuildingStore.getState().failedUpdates.size).toBe(0);
    expect(useBuildingStore.getState().confirmedUpdates.size).toBe(0);
  });

  it('multiple pending keys tracked independently', () => {
    const store = useBuildingStore.getState();
    store.setPending('RDOSetPrice:{"index":"0"}', '100');
    store.setPending('RDOSetPrice:{"index":"1"}', '200');
    store.setPending('RDOSetSalaries', '500');

    expect(useBuildingStore.getState().pendingUpdates.size).toBe(3);

    store.confirmPending('RDOSetPrice:{"index":"0"}');
    expect(useBuildingStore.getState().pendingUpdates.size).toBe(2);
    expect(useBuildingStore.getState().confirmedUpdates.size).toBe(1);
  });

  it('setPending overwrites previous pending value for same key', () => {
    const store = useBuildingStore.getState();
    store.setPending('key', '100');
    store.setPending('key', '200');

    const pending = useBuildingStore.getState().pendingUpdates;
    expect(pending.size).toBe(1);
    expect(pending.get('key')?.value).toBe('200');
  });
});
