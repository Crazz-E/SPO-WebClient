/**
 * Empire Store — Owned facilities from the Favorites tree.
 * Populated via RDOFavoritesGetSubItems on the InterfaceServer.
 */

import { create } from 'zustand';
import type { FavoritesLinkItem } from '@/shared/types';

interface EmpireState {
  // Data
  facilities: FavoritesLinkItem[];
  isLoading: boolean;

  // Actions
  setFacilities: (facilities: FavoritesLinkItem[]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useEmpireStore = create<EmpireState>((set) => ({
  facilities: [],
  isLoading: false,

  setFacilities: (facilities) => set({ facilities, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      facilities: [],
      isLoading: false,
    }),
}));
