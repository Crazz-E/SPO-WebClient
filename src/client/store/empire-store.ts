/**
 * Empire Store — Owned facilities, aggregated financial metrics.
 * The player's "command center" data: all buildings they own, with status and revenue.
 */

import { create } from 'zustand';

export type FacilityStatus = 'operating' | 'alert' | 'upgrading' | 'closed';

export interface OwnedFacility {
  buildingId: string;
  name: string;
  visualClass: string;
  x: number;
  y: number;
  revenue: string;
  status: FacilityStatus;
  category: string;
  level: number;
}

interface EmpireState {
  // Data
  facilities: OwnedFacility[];
  totalRevenue: string;
  totalExpenses: string;
  netProfit: string;
  isLoading: boolean;

  // Actions
  setFacilities: (facilities: OwnedFacility[]) => void;
  updateFacility: (buildingId: string, data: Partial<OwnedFacility>) => void;
  removeFacility: (buildingId: string) => void;
  addFacility: (facility: OwnedFacility) => void;
  setFinancials: (revenue: string, expenses: string, profit: string) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useEmpireStore = create<EmpireState>((set) => ({
  facilities: [],
  totalRevenue: '0',
  totalExpenses: '0',
  netProfit: '0',
  isLoading: false,

  setFacilities: (facilities) => set({ facilities, isLoading: false }),

  updateFacility: (buildingId, data) =>
    set((state) => ({
      facilities: state.facilities.map((f) =>
        f.buildingId === buildingId ? { ...f, ...data } : f,
      ),
    })),

  removeFacility: (buildingId) =>
    set((state) => ({
      facilities: state.facilities.filter((f) => f.buildingId !== buildingId),
    })),

  addFacility: (facility) =>
    set((state) => ({
      facilities: [...state.facilities, facility],
    })),

  setFinancials: (revenue, expenses, profit) =>
    set({ totalRevenue: revenue, totalExpenses: expenses, netProfit: profit }),

  setLoading: (loading) => set({ isLoading: loading }),

  reset: () =>
    set({
      facilities: [],
      totalRevenue: '0',
      totalExpenses: '0',
      netProfit: '0',
      isLoading: false,
    }),
}));
