/**
 * Building Store — Focused building state, details, and inspection data.
 */

import { create } from 'zustand';
import type {
  BuildingFocusInfo,
  BuildingDetailsResponse,
  ConnectionSearchResult,
} from '@/shared/types';

interface BuildingState {
  // Focus
  focusedBuilding: BuildingFocusInfo | null;

  // Details panel
  details: BuildingDetailsResponse | null;
  currentTab: string;
  isLoading: boolean;

  // Ownership context (set by client.ts when showing panel)
  currentCompanyName: string;
  isOwner: boolean;

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

  // Actions
  setFocus: (info: BuildingFocusInfo) => void;
  setDetails: (details: BuildingDetailsResponse) => void;
  setCurrentTab: (tab: string) => void;
  setLoading: (loading: boolean) => void;
  setCurrentCompanyName: (name: string) => void;
  clearFocus: () => void;
  setConnectionPicker: (data: { fluidName: string; fluidId: string; direction: 'input' | 'output'; buildingX: number; buildingY: number }) => void;
  setConnectionResults: (results: ConnectionSearchResult[]) => void;
  setConnectionSearching: (searching: boolean) => void;
  clearConnectionPicker: () => void;
}

export const useBuildingStore = create<BuildingState>((set) => ({
  focusedBuilding: null,
  details: null,
  currentTab: 'overview',
  isLoading: false,
  currentCompanyName: '',
  isOwner: false,

  setFocus: (info) => set({ focusedBuilding: info }),

  setDetails: (details) =>
    set((state) => ({
      details,
      isLoading: false,
      isOwner: details.ownerName === state.currentCompanyName,
    })),

  setCurrentTab: (tab) => set({ currentTab: tab }),

  setLoading: (loading) => set({ isLoading: loading }),

  setCurrentCompanyName: (name) =>
    set((state) => ({
      currentCompanyName: name,
      isOwner: state.details ? state.details.ownerName === name : false,
    })),

  clearFocus: () =>
    set({
      focusedBuilding: null,
      details: null,
      currentTab: 'overview',
      isLoading: false,
      isOwner: false,
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
}));
