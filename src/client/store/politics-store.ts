/**
 * Politics Store — Town politics, elections, campaigns.
 */

import { create } from 'zustand';
import type { PoliticsData, PoliticalRoleInfo } from '@/shared/types';

export type CapitolTab = 'towns' | 'ministries' | 'jobs' | 'residentials' | 'votes' | 'ratings';

interface PoliticsState {
  // State
  data: PoliticsData | null;
  townName: string;
  buildingX: number;
  buildingY: number;
  isLoading: boolean;
  activeCapitolTab: CapitolTab;

  // Political roles cache (keyed by lowercase tycoon name)
  politicalRoles: Map<string, PoliticalRoleInfo>;
  roleQueryPending: Set<string>;

  // Actions
  setData: (data: PoliticsData) => void;
  setTownContext: (townName: string, x: number, y: number) => void;
  setLoading: (loading: boolean) => void;
  setActiveCapitolTab: (tab: CapitolTab) => void;
  setTycoonRole: (role: PoliticalRoleInfo) => void;
  getTycoonRole: (tycoonName: string) => PoliticalRoleInfo | undefined;
  setRoleQueryPending: (tycoonName: string, pending: boolean) => void;
  isRoleQueryPending: (tycoonName: string) => boolean;
  clearRoles: () => void;
  reset: () => void;
}

export const usePoliticsStore = create<PoliticsState>((set, get) => ({
  data: null,
  townName: '',
  buildingX: 0,
  buildingY: 0,
  isLoading: false,
  activeCapitolTab: 'towns',
  politicalRoles: new Map(),
  roleQueryPending: new Set(),

  setData: (data) => set({ data, isLoading: false }),
  setTownContext: (townName, x, y) => set({ townName, buildingX: x, buildingY: y }),
  setLoading: (loading) => set({ isLoading: loading }),
  setActiveCapitolTab: (tab) => set({ activeCapitolTab: tab }),

  setTycoonRole: (role) => set((state) => {
    const newMap = new Map(state.politicalRoles);
    newMap.set(role.tycoonName.toLowerCase(), role);
    return { politicalRoles: newMap };
  }),

  getTycoonRole: (tycoonName) => get().politicalRoles.get(tycoonName.toLowerCase()),

  setRoleQueryPending: (tycoonName, pending) => set((state) => {
    const newSet = new Set(state.roleQueryPending);
    if (pending) {
      newSet.add(tycoonName.toLowerCase());
    } else {
      newSet.delete(tycoonName.toLowerCase());
    }
    return { roleQueryPending: newSet };
  }),

  isRoleQueryPending: (tycoonName) => get().roleQueryPending.has(tycoonName.toLowerCase()),

  clearRoles: () => set({ politicalRoles: new Map(), roleQueryPending: new Set() }),

  reset: () =>
    set({
      data: null,
      townName: '',
      buildingX: 0,
      buildingY: 0,
      isLoading: false,
      activeCapitolTab: 'towns',
      politicalRoles: new Map(),
      roleQueryPending: new Set(),
    }),
}));
