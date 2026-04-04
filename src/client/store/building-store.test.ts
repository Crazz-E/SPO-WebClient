/**
 * Tests for building-store: overlay state + research state management.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { useBuildingStore } from './building-store';
import type { BuildingFocusInfo, BuildingDetailsResponse, ResearchCategoryData, ResearchInventionDetails } from '@/shared/types';

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

const makeBuildingDetails = (x: number, y: number): BuildingDetailsResponse => ({
  buildingId: `bld-${x}-${y}`,
  x,
  y,
  visualClass: '1234',
  templateName: 'DrugStore',
  buildingName: 'Drug Store',
  ownerName: 'TestCorp',
  securityId: 'sec-1',
  tabs: [],
  groups: {},
  timestamp: Date.now(),
});

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

  /** Sets up details + initializes research state (required precondition for B4 guards). */
  function setupResearchContext() {
    useBuildingStore.getState().setDetails(makeBuildingDetails(100, 200));
    useBuildingStore.getState().setResearchCategoryTabs(['GENERAL']);
  }

  it('should start with research as null', () => {
    expect(useBuildingStore.getState().research).toBeNull();
  });

  it('setResearchInventory should create research state with inventory in category map', () => {
    setupResearchContext();
    useBuildingStore.getState().setResearchInventory(mockInventory);

    const research = useBuildingStore.getState().research;
    expect(research).not.toBeNull();
    expect(research!.inventoryByCategory.get(0)).toBe(mockInventory);
    expect(research!.loadedCategories.has(0)).toBe(true);
    expect(research!.isLoadingInventory).toBe(false);
    expect(research!.activeCategoryIndex).toBe(0);
  });

  it('setResearchSelectedInvention should set selectedInventionId and clear details', () => {
    setupResearchContext();
    useBuildingStore.getState().setResearchInventory(mockInventory);
    useBuildingStore.getState().setResearchDetails(mockDetails);
    useBuildingStore.getState().setResearchSelectedInvention('AI.Level1');

    const research = useBuildingStore.getState().research;
    expect(research!.selectedInventionId).toBe('AI.Level1');
    expect(research!.selectedDetails).toBeNull();
  });

  it('setResearchDetails should set details', () => {
    setupResearchContext();
    useBuildingStore.getState().setResearchInventory(mockInventory);
    useBuildingStore.getState().setResearchDetails(mockDetails);

    const research = useBuildingStore.getState().research;
    expect(research!.selectedDetails).toBe(mockDetails);
    expect(research!.isLoadingDetails).toBe(false);
  });

  it('setResearchActiveCategoryIndex should change tab and clear selection', () => {
    setupResearchContext();
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
    setupResearchContext();
    useBuildingStore.getState().setResearchInventory(mockInventory);
    expect(useBuildingStore.getState().research).not.toBeNull();

    useBuildingStore.getState().clearResearch();
    expect(useBuildingStore.getState().research).toBeNull();
  });

  it('clearFocus should also clear research', () => {
    setupResearchContext();
    useBuildingStore.getState().setResearchInventory(mockInventory);
    expect(useBuildingStore.getState().research).not.toBeNull();

    useBuildingStore.getState().clearFocus();
    expect(useBuildingStore.getState().research).toBeNull();
    expect(useBuildingStore.getState().focusedBuilding).toBeNull();
  });

  it('setResearchInventory preserves existing research fields', () => {
    setupResearchContext();
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
    setupResearchContext();
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

// =============================================================================
// Context Loss Prevention (B1–B5)
// =============================================================================

describe('Building Store — Context Loss Prevention', () => {
  beforeEach(resetStore);

  // B1: mergeTabData coordinate guard
  it('mergeTabData rejects data when coordinates do not match current building', () => {
    const details = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(details);
    useBuildingStore.getState().setTabLoading('supplies');

    // Attempt to merge supply data for a DIFFERENT building (x=999, y=999)
    useBuildingStore.getState().mergeTabData('supplies', { supplies: [] }, 999, 999);

    // Should NOT have merged — supplies should remain undefined
    expect(useBuildingStore.getState().details!.supplies).toBeUndefined();
    // Tab state should still be 'loading' (not 'loaded')
    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBe('loading');
  });

  it('mergeTabData accepts data when coordinates match current building', () => {
    const details = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(details);
    useBuildingStore.getState().setTabLoading('supplies');

    const supplyData = [{ path: 'test', name: 'Books' }];
    useBuildingStore.getState().mergeTabData(
      'supplies', { supplies: supplyData as never }, 100, 200,
    );

    expect(useBuildingStore.getState().details!.supplies).toBe(supplyData);
    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBe('loaded');
  });

  it('mergeTabData is a no-op when details is null', () => {
    // No building loaded
    useBuildingStore.getState().mergeTabData('supplies', { supplies: [] }, 100, 200);
    expect(useBuildingStore.getState().details).toBeNull();
  });

  // B3: connectionPicker cleared by clearDetails and clearFocus
  it('clearDetails resets connectionPicker to null', () => {
    useBuildingStore.getState().setConnectionPicker({
      fluidName: 'Oil', fluidId: 'oil-1', direction: 'input', buildingX: 100, buildingY: 200,
    });
    expect(useBuildingStore.getState().connectionPicker).not.toBeNull();

    useBuildingStore.getState().clearDetails();
    expect(useBuildingStore.getState().connectionPicker).toBeNull();
  });

  it('clearFocus resets connectionPicker to null', () => {
    useBuildingStore.getState().setConnectionPicker({
      fluidName: 'Oil', fluidId: 'oil-1', direction: 'input', buildingX: 100, buildingY: 200,
    });
    expect(useBuildingStore.getState().connectionPicker).not.toBeNull();

    useBuildingStore.getState().clearFocus();
    expect(useBuildingStore.getState().connectionPicker).toBeNull();
  });

  // B4: Research guards — reject when details or research is null
  it('setResearchInventory is a no-op when details is null', () => {
    // No building loaded — research response should be silently dropped
    useBuildingStore.getState().setResearchInventory(mockInventory);
    expect(useBuildingStore.getState().research).toBeNull();
  });

  it('setResearchInventory is a no-op when research is null (not yet initialized)', () => {
    // Building loaded but research not yet initialized via setResearchCategoryTabs
    useBuildingStore.getState().setDetails(makeBuildingDetails(100, 200));
    expect(useBuildingStore.getState().research).toBeNull();

    useBuildingStore.getState().setResearchInventory(mockInventory);
    expect(useBuildingStore.getState().research).toBeNull();
  });

  it('setResearchDetails is a no-op when details is null', () => {
    useBuildingStore.getState().setResearchDetails(mockDetails);
    expect(useBuildingStore.getState().research).toBeNull();
  });

  it('setResearchDetails is a no-op when research is null', () => {
    useBuildingStore.getState().setDetails(makeBuildingDetails(100, 200));
    useBuildingStore.getState().setResearchDetails(mockDetails);
    expect(useBuildingStore.getState().research).toBeNull();
  });

  // B5: setDetails clears optimistic maps when switching buildings
  it('setDetails clears optimistic maps when switching to a different building', () => {
    const detailsA = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(detailsA);
    useBuildingStore.getState().setPending('RDOSetPrice', '250');
    useBuildingStore.getState().failPending('salary', '500', 'timeout');
    expect(useBuildingStore.getState().pendingUpdates.size).toBe(1);
    expect(useBuildingStore.getState().failedUpdates.size).toBe(1);

    // Switch to building B
    const detailsB = makeBuildingDetails(300, 400);
    useBuildingStore.getState().setDetails(detailsB);

    expect(useBuildingStore.getState().pendingUpdates.size).toBe(0);
    expect(useBuildingStore.getState().failedUpdates.size).toBe(0);
    expect(useBuildingStore.getState().confirmedUpdates.size).toBe(0);
  });

  it('setDetails preserves optimistic maps when refreshing the same building', () => {
    const details = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(details);
    useBuildingStore.getState().setPending('RDOSetPrice', '250');

    // Refresh same building (same x,y)
    const refreshed = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(refreshed);

    expect(useBuildingStore.getState().pendingUpdates.size).toBe(1);
  });
});

describe('Building Store — Lazy tab data preservation', () => {
  beforeEach(resetStore);

  const mockProducts = [{ metaFluid: 'oil', name: 'Oil', quality: '80', pricePc: '100', avgPrice: '50', marketPrice: '60', lastFluid: '', connectionCount: 0, connections: [] }];
  const mockSupplies = [{ metaFluid: 'steel', name: 'Steel', connectionCount: 0, connections: [] }];
  const mockWarehouseWares = [{ name: 'Oil', enabled: true, index: 0 }];

  it('setDetails carries forward lazy fields when refreshing the same building', () => {
    const details = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(details);

    // Simulate mergeTabData loading products + warehouseWares
    useBuildingStore.getState().mergeTabData(
      'products', { products: mockProducts as never, warehouseWares: mockWarehouseWares as never }, 100, 200,
    );
    expect(useBuildingStore.getState().details!.products).toBe(mockProducts);
    expect(useBuildingStore.getState().details!.warehouseWares).toBe(mockWarehouseWares);

    // Simulate EVENT_BUILDING_REFRESH: basic details with undefined lazy fields
    const refreshed = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(refreshed);

    // Lazy fields should be preserved (not wiped to undefined)
    expect(useBuildingStore.getState().details!.products).toBe(mockProducts);
    expect(useBuildingStore.getState().details!.warehouseWares).toBe(mockWarehouseWares);
  });

  it('setDetails does NOT carry forward lazy fields when switching buildings', () => {
    const detailsA = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(detailsA);
    useBuildingStore.getState().mergeTabData(
      'products', { products: mockProducts as never }, 100, 200,
    );

    // Switch to a different building
    const detailsB = makeBuildingDetails(300, 400);
    useBuildingStore.getState().setDetails(detailsB);

    expect(useBuildingStore.getState().details!.products).toBeUndefined();
  });

  it('setDetails uses new lazy data when explicitly provided (not carry-forward)', () => {
    const details = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(details);
    useBuildingStore.getState().mergeTabData(
      'supplies', { supplies: mockSupplies as never }, 100, 200,
    );

    // Refresh with explicitly provided supplies (e.g., legacy full-fetch path)
    const newSupplies = [{ metaFluid: 'iron', name: 'Iron', connectionCount: 1, connections: [] }];
    const refreshed = { ...makeBuildingDetails(100, 200), supplies: newSupplies as never };
    useBuildingStore.getState().setDetails(refreshed);

    // Should use the NEW data, not the old carry-forward
    expect(useBuildingStore.getState().details!.supplies).toBe(newSupplies);
  });

  it('resetTabLoadingStates wipes lazy fields from details', () => {
    const details = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(details);
    useBuildingStore.getState().mergeTabData(
      'products', { products: mockProducts as never, warehouseWares: mockWarehouseWares as never }, 100, 200,
    );
    useBuildingStore.getState().mergeTabData(
      'supplies', { supplies: mockSupplies as never }, 100, 200,
    );

    expect(useBuildingStore.getState().details!.products).toBe(mockProducts);
    expect(useBuildingStore.getState().details!.supplies).toBe(mockSupplies);
    expect(useBuildingStore.getState().details!.warehouseWares).toBe(mockWarehouseWares);
    expect(useBuildingStore.getState().tabLoadingStates['products']).toBe('loaded');
    expect(useBuildingStore.getState().tabLoadingStates['supplies']).toBe('loaded');

    // Explicit refresh: resetTabLoadingStates should wipe everything
    useBuildingStore.getState().resetTabLoadingStates();

    expect(useBuildingStore.getState().tabLoadingStates).toEqual({});
    expect(useBuildingStore.getState().details!.products).toBeUndefined();
    expect(useBuildingStore.getState().details!.supplies).toBeUndefined();
    expect(useBuildingStore.getState().details!.warehouseWares).toBeUndefined();
    expect(useBuildingStore.getState().details!.compInputs).toBeUndefined();
    // Non-lazy fields should be preserved
    expect(useBuildingStore.getState().details!.buildingName).toBe('Drug Store');
    expect(useBuildingStore.getState().details!.x).toBe(100);
  });

  it('resetTabLoadingStates is safe when details is null', () => {
    // No building loaded
    expect(useBuildingStore.getState().details).toBeNull();
    useBuildingStore.getState().resetTabLoadingStates();
    expect(useBuildingStore.getState().details).toBeNull();
    expect(useBuildingStore.getState().tabLoadingStates).toEqual({});
  });

  it('setDetails carry-forward + resetTabLoadingStates prevents stale data on next refresh', () => {
    const details = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(details);
    useBuildingStore.getState().mergeTabData(
      'products', { products: mockProducts as never }, 100, 200,
    );

    // Explicit refresh: wipe lazy data
    useBuildingStore.getState().resetTabLoadingStates();
    expect(useBuildingStore.getState().details!.products).toBeUndefined();

    // Next basic details refresh should NOT carry forward the wiped data
    const refreshed = makeBuildingDetails(100, 200);
    useBuildingStore.getState().setDetails(refreshed);
    expect(useBuildingStore.getState().details!.products).toBeUndefined();
  });
});
