/**
 * Transport Store — Train routes and rail infrastructure.
 */

import { create } from 'zustand';
import type { TransportData, TrainInfo } from '@/shared/types';

interface TransportState {
  // State
  data: TransportData | null;
  selectedTrain: TrainInfo | null;
  isLoading: boolean;

  // Actions
  setData: (data: TransportData) => void;
  selectTrain: (train: TrainInfo | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  data: null,
  selectedTrain: null,
  isLoading: false,

  setData: (data) => set({ data, isLoading: false }),
  selectTrain: (train) => set({ selectedTrain: train }),
  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      data: null,
      selectedTrain: null,
      isLoading: false,
    }),
}));
