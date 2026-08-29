/**
 * Empire Store — Owned facilities from the Favorites tree.
 * Populated via RDOFavoritesGetSubItems on the InterfaceServer.
 */

import { create } from 'zustand';
import type { FavoritesItem, FavoriteFolder } from '@/shared/types';

interface EmpireState {
  // Data
  facilities: FavoritesItem[];
  folders: FavoriteFolder[];
  isLoading: boolean;

  // Actions
  setFacilities: (facilities: FavoritesItem[], folders?: FavoriteFolder[]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useEmpireStore = create<EmpireState>((set) => ({
  facilities: [],
  folders: [],
  isLoading: false,

  setFacilities: (facilities, folders = []) => set({ facilities, folders, isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      facilities: [],
      folders: [],
      isLoading: false,
    }),
}));
