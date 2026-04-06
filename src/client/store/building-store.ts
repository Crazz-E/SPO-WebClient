/**
 * Building Store — Focused building state, details, and inspection data.
 */

import { create } from 'zustand';
import type {
  BuildingFocusInfo,
  BuildingDetailsResponse,
  ConnectionSearchResult,
  ResearchCategoryData,
  ResearchInventionDetails,
} from '@/shared/types';
import { registerInspectorTabs } from '@/shared/building-details';

interface ResearchState {
  /** Cached inventory per category tab (key = categoryIndex 0..4). */
  inventoryByCategory: Map<number, ResearchCategoryData>;
  /** Currently viewed category tab index (0..4). */
  activeCategoryIndex: number;
  /** Tab labels from research.0.dat (e.g. ["GENERAL","COMMERCE",...]). */
  categoryTabs: string[];
  /** Which categories have been fetched at least once. */
  loadedCategories: Set<number>;
  /** Selected invention (shared across tabs). */
  selectedInventionId: string | null;
  selectedDetails: ResearchInventionDetails | null;
  isLoadingInventory: boolean;
  isLoadingDetails: boolean;
}

/** Tracks an in-flight SET command (optimistic feedback). */
interface PendingUpdate {
  value: string;
  timestamp: number;
}

/** Tracks a failed SET command (revert + error display). */
interface FailedUpdate {
  originalValue: string;
  error: string;
  timestamp: number;
}

/** Tracks a recently confirmed SET command (success feedback). */
interface ConfirmedUpdate {
  timestamp: number;
}

/** Loading state for lazy tab data. */
type TabLoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface BuildingState {
  // Focus
  focusedBuilding: BuildingFocusInfo | null;

  // Overlay mode — first click shows overlay, second click opens panel
  isOverlayMode: boolean;

  // Details panel
  details: BuildingDetailsResponse | null;
  currentTab: string;
  isLoading: boolean;
  detailsError: string | null;

  // Lazy tab loading states (keyed by tab special id: 'supplies', 'products', etc.)
  tabLoadingStates: Record<string, TabLoadState>;

  // Ownership context (set by client.ts when showing panel)
  currentCompanyName: string;
  /** All company names owned by the logged-in tycoon (for cross-company ownership). */
  ownedCompanyNames: Set<string>;
  isOwner: boolean;

  // Optimistic SET feedback
  pendingUpdates: Map<string, PendingUpdate>;
  failedUpdates: Map<string, FailedUpdate>;
  confirmedUpdates: Map<string, ConfirmedUpdate>;

  // Connection picker state
  connectionPicker: {
    fluidName: string;
    fluidId: string;
    direction: 'input' | 'output';
    buildingX: number;
    buildingY: number;
    results: ConnectionSearchResult[];
    isSearching: boolean;
  } | null;

  // Research state
  research: ResearchState | null;

  // Actions
  setFocus: (info: BuildingFocusInfo) => void;
  setOverlayMode: (mode: boolean) => void;
  setDetails: (details: BuildingDetailsResponse) => void;
  setCurrentTab: (tab: string) => void;
  setLoading: (loading: boolean) => void;
  setDetailsError: (error: string | null) => void;
  setCurrentCompanyName: (name: string) => void;
  setOwnedCompanyNames: (names: Set<string>) => void;
  clearFocus: () => void;
  clearDetails: () => void;
  clearOverlay: () => void;
  setConnectionPicker: (data: { fluidName: string; fluidId: string; direction: 'input' | 'output'; buildingX: number; buildingY: number }) => void;
  setConnectionResults: (results: ConnectionSearchResult[]) => void;
  setConnectionSearching: (searching: boolean) => void;
  clearConnectionPicker: () => void;

  // Lazy tab loading actions
  setTabLoading: (tabId: string) => void;
  mergeTabData: (tabId: string, data: Partial<BuildingDetailsResponse>, forX: number, forY: number) => void;
  resetTabLoadingStates: () => void;

  // Optimistic SET actions
  setPending: (key: string, value: string) => void;
  confirmPending: (key: string) => void;
  failPending: (key: string, originalValue: string, error: string) => void;
  clearFailed: (key: string) => void;
  clearConfirmed: (key: string) => void;

  // Research actions
  setResearchCategoryTabs: (tabs: string[]) => void;
  setResearchInventory: (data: ResearchCategoryData) => void;
  setResearchSelectedInvention: (inventionId: string | null) => void;
  setResearchDetails: (details: ResearchInventionDetails) => void;
  setResearchActiveCategoryIndex: (index: number) => void;
  setResearchLoading: (field: 'inventory' | 'details', loading: boolean) => void;
  clearResearch: () => void;
}

const INITIAL_RESEARCH: ResearchState = {
  inventoryByCategory: new Map(),
  activeCategoryIndex: 0,
  categoryTabs: [],
  loadedCategories: new Set(),
  selectedInventionId: null,
  selectedDetails: null,
  isLoadingInventory: false,
  isLoadingDetails: false,
};

export const useBuildingStore = create<BuildingState>((set) => ({
  focusedBuilding: null,
  isOverlayMode: false,
  details: null,
  currentTab: 'overview',
  isLoading: false,
  detailsError: null,
  currentCompanyName: '',
  ownedCompanyNames: new Set<string>(),
  isOwner: false,

  // Lazy tab loading
  tabLoadingStates: {},

  // Optimistic SET feedback
  pendingUpdates: new Map(),
  failedUpdates: new Map(),
  confirmedUpdates: new Map(),

  setFocus: (info) => set({ focusedBuilding: info }),

  setOverlayMode: (mode) => set({ isOverlayMode: mode }),

  setDetails: (details) => {
    // Guard against malformed responses that would crash the render tree.
    // Missing tabs/groups indicate a corrupted or incomplete server response.
    if (!details.tabs || !details.groups) {
      set({ detailsError: 'Received malformed building data', isLoading: false });
      return;
    }
    // Lazily populate the client-side template cache from the server-sent tab config.
    // The server sends handlerName for each tab; HANDLER_TO_GROUP maps those to property
    // group definitions (with TABLE, SLIDER, etc. types) that the renderer needs.
    if (details.tabs.length) {
      registerInspectorTabs(
        details.visualClass,
        details.tabs.map((t) => ({ tabName: t.name, tabHandler: t.handlerName })),
        details.templateName,
      );
    }
    set((state) => {
      const ownerName = details.ownerName || state.focusedBuilding?.ownerName || '';
      const isSameBuilding = state.details?.x === details.x && state.details?.y === details.y;

      // Auto-mark lazy tabs as 'loaded' if the legacy path already fetched their data.
      // This prevents the lazy useEffect from re-fetching data that's already present.
      const preloaded: Record<string, TabLoadState> = {};
      if (details.supplies) preloaded['supplies'] = 'loaded';
      if (details.products) preloaded['products'] = 'loaded';
      if (details.compInputs) preloaded['compInputs'] = 'loaded';
      if (details.warehouseWares) preloaded['whGeneral'] = 'loaded';

      // Carry forward lazy tab data when refreshing the same building.
      // EVENT_BUILDING_REFRESH sends basic details (products/supplies/warehouseWares
      // undefined). Without this merge, the UI shows empty tabs because
      // tabLoadingStates still says 'loaded' but the data is gone.
      const mergedDetails = isSameBuilding ? {
        ...details,
        supplies: details.supplies ?? state.details?.supplies,
        products: details.products ?? state.details?.products,
        compInputs: details.compInputs ?? state.details?.compInputs,
        warehouseWares: details.warehouseWares ?? state.details?.warehouseWares,
      } : details;

      return {
        details: mergedDetails,
        isLoading: false,
        detailsError: null,
        isOwner: ownerName !== '' && state.ownedCompanyNames.has(ownerName),
        tabLoadingStates: isSameBuilding
          ? { ...state.tabLoadingStates, ...preloaded }
          : preloaded,
        // Clear optimistic feedback when switching to a different building
        // to prevent phantom SaveIndicator from cross-building leaks
        ...(isSameBuilding ? {} : {
          pendingUpdates: new Map(),
          failedUpdates: new Map(),
          confirmedUpdates: new Map(),
        }),
      };
    });
  },

  setCurrentTab: (tab) => set({ currentTab: tab }),

  setLoading: (loading) => set({ isLoading: loading, ...(loading ? { detailsError: null } : {}) }),

  setDetailsError: (error) => set({ detailsError: error, isLoading: false }),

  setCurrentCompanyName: (name) =>
    set((state) => {
      const ownerName = state.details
        ? (state.details.ownerName || state.focusedBuilding?.ownerName || '')
        : '';
      return {
        currentCompanyName: name,
        isOwner: ownerName !== '' && state.ownedCompanyNames.has(ownerName),
      };
    }),

  setOwnedCompanyNames: (names) =>
    set((state) => {
      const ownerName = state.details
        ? (state.details.ownerName || state.focusedBuilding?.ownerName || '')
        : '';
      return {
        ownedCompanyNames: names,
        isOwner: ownerName !== '' && names.has(ownerName),
      };
    }),

  clearFocus: () =>
    set({
      focusedBuilding: null,
      isOverlayMode: false,
      details: null,
      currentTab: 'overview',
      isLoading: false,
      detailsError: null,
      isOwner: false,
      research: null,
      tabLoadingStates: {},
      pendingUpdates: new Map(),
      failedUpdates: new Map(),
      confirmedUpdates: new Map(),
      connectionPicker: null,
    }),

  clearDetails: () =>
    set({
      details: null,
      currentTab: 'overview',
      isLoading: true,
      detailsError: null,
      isOwner: false,
      research: null,
      tabLoadingStates: {},
      pendingUpdates: new Map(),
      failedUpdates: new Map(),
      confirmedUpdates: new Map(),
      connectionPicker: null,
    }),

  clearOverlay: () => set({ isOverlayMode: false }),

  // Lazy tab loading actions
  setTabLoading: (tabId) =>
    set((state) => ({
      tabLoadingStates: { ...state.tabLoadingStates, [tabId]: 'loading' as TabLoadState },
    })),

  mergeTabData: (tabId, data, forX, forY) =>
    set((state) => {
      if (!state.details) return state;
      // Reject stale data from a previously inspected building
      if (state.details.x !== forX || state.details.y !== forY) return state;
      return {
        details: {
          ...state.details,
          ...(data.supplies !== undefined ? { supplies: data.supplies } : {}),
          ...(data.products !== undefined ? { products: data.products } : {}),
          ...(data.compInputs !== undefined ? { compInputs: data.compInputs } : {}),
          ...(data.warehouseWares !== undefined ? { warehouseWares: data.warehouseWares } : {}),
        },
        tabLoadingStates: { ...state.tabLoadingStates, [tabId]: 'loaded' as TabLoadState },
      };
    }),

  resetTabLoadingStates: () => set((state) => ({
    tabLoadingStates: {},
    // Wipe lazy tab data so stale values aren't carried forward by setDetails
    // after an explicit refresh. The lazy useEffect will re-fetch from scratch.
    details: state.details ? {
      ...state.details,
      supplies: undefined,
      products: undefined,
      compInputs: undefined,
      warehouseWares: undefined,
    } : null,
  })),

  // Optimistic SET actions
  setPending: (key, value) =>
    set((state) => {
      const next = new Map(state.pendingUpdates);
      next.set(key, { value, timestamp: Date.now() });
      // Clear any previous failure for this key
      const nextFailed = new Map(state.failedUpdates);
      nextFailed.delete(key);
      return { pendingUpdates: next, failedUpdates: nextFailed };
    }),

  confirmPending: (key) =>
    set((state) => {
      const nextPending = new Map(state.pendingUpdates);
      nextPending.delete(key);
      const nextConfirmed = new Map(state.confirmedUpdates);
      nextConfirmed.set(key, { timestamp: Date.now() });
      return { pendingUpdates: nextPending, confirmedUpdates: nextConfirmed };
    }),

  failPending: (key, originalValue, error) =>
    set((state) => {
      const nextPending = new Map(state.pendingUpdates);
      nextPending.delete(key);
      const nextFailed = new Map(state.failedUpdates);
      nextFailed.set(key, { originalValue, error, timestamp: Date.now() });
      return { pendingUpdates: nextPending, failedUpdates: nextFailed };
    }),

  clearFailed: (key) =>
    set((state) => {
      const next = new Map(state.failedUpdates);
      next.delete(key);
      return { failedUpdates: next };
    }),

  clearConfirmed: (key) =>
    set((state) => {
      const next = new Map(state.confirmedUpdates);
      next.delete(key);
      return { confirmedUpdates: next };
    }),

  // Connection picker
  connectionPicker: null,

  setConnectionPicker: (data) =>
    set({ connectionPicker: { ...data, results: [], isSearching: false } }),

  setConnectionResults: (results) =>
    set((state) => ({
      connectionPicker: state.connectionPicker
        ? { ...state.connectionPicker, results, isSearching: false }
        : null,
    })),

  setConnectionSearching: (searching) =>
    set((state) => ({
      connectionPicker: state.connectionPicker
        ? { ...state.connectionPicker, isSearching: searching }
        : null,
    })),

  clearConnectionPicker: () => set({ connectionPicker: null }),

  // Research
  research: null,

  setResearchCategoryTabs: (tabs) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        categoryTabs: tabs,
      },
    })),

  setResearchInventory: (data) =>
    set((state) => {
      // Reject stale data if building was cleared or research not yet initialized
      if (!state.details || !state.research) return state;
      const prev = state.research;
      const nextMap = new Map(prev.inventoryByCategory);
      nextMap.set(data.categoryIndex, data);
      const nextLoaded = new Set(prev.loadedCategories);
      nextLoaded.add(data.categoryIndex);
      return {
        research: {
          ...prev,
          inventoryByCategory: nextMap,
          loadedCategories: nextLoaded,
          isLoadingInventory: false,
        },
      };
    }),

  setResearchSelectedInvention: (inventionId) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        selectedInventionId: inventionId,
        selectedDetails: null,
      },
    })),

  setResearchDetails: (details) =>
    set((state) => {
      // Reject stale data if building was cleared or research not yet initialized
      if (!state.details || !state.research) return state;
      return {
        research: {
          ...state.research,
          selectedDetails: details,
          isLoadingDetails: false,
        },
      };
    }),

  setResearchActiveCategoryIndex: (index) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        activeCategoryIndex: index,
        selectedInventionId: null,
        selectedDetails: null,
      },
    })),

  setResearchLoading: (field, loading) =>
    set((state) => ({
      research: {
        ...(state.research ?? INITIAL_RESEARCH),
        [field === 'inventory' ? 'isLoadingInventory' : 'isLoadingDetails']: loading,
      },
    })),

  clearResearch: () => set({ research: null }),
}));
