/**
 * Politics Store — Town politics, elections, campaigns.
 */

import { create } from 'zustand';
import type { PoliticsData } from '@/shared/types';

interface PoliticsState {
  // State
  data: PoliticsData | null;
  townName: string;
  buildingX: number;
  buildingY: number;
  isLoading: boolean;

  // Actions
  setData: (data: PoliticsData) => void;
  setTownContext: (townName: string, x: number, y: number) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const usePoliticsStore = create<PoliticsState>((set) => ({
  data: null,
  townName: '',
  buildingX: 0,
  buildingY: 0,
  isLoading: false,

  setData: (data) => set({ data, isLoading: false }),
  setTownContext: (townName, x, y) => set({ townName, buildingX: x, buildingY: y }),
  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      data: null,
      townName: '',
      buildingX: 0,
      buildingY: 0,
      isLoading: false,
    }),
}));
