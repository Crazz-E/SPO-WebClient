/**
 * Empire Store — Owned facilities from the Favorites tree.
 * Populated via RDOFavoritesGetSubItems on the InterfaceServer.
 */

import { create } from 'zustand';
import type { FavoritesItem } from '@/shared/types';
import { flattenFavoriteLinks } from '@/shared/favorites-tree';

interface EmpireState {
  // Data
  /** The tree exactly as the server served it — root items, folders with `children`. */
  tree: FavoritesItem[];
  /** Links only, depth-first — what every existing bookmark consumer reads. */
  facilities: FavoritesItem[];
  isLoading: boolean;

  // Actions
  setFacilities: (tree: FavoritesItem[]) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useEmpireStore = create<EmpireState>((set) => ({
  tree: [],
  facilities: [],
  isLoading: false,

  // Derived at set time, never in a selector — a selector would return a
  // fresh array on every render and break subscriber equality checks.
  setFacilities: (tree) => set({ tree, facilities: flattenFavoriteLinks(tree), isLoading: false }),

  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      tree: [],
      facilities: [],
      isLoading: false,
    }),
}));
