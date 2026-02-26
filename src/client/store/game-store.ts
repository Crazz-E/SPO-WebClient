/**
 * Game Store — Central reactive state for connection, tycoon stats, and settings.
 * Panel navigation is now in ui-store.ts.
 */

import { create } from 'zustand';
import type { CompanyInfo } from '@/shared/types';

/* ---- Types ---- */

export interface TycoonStats {
  username: string;
  cash: string;
  incomePerHour: string;
  ranking: number;
  buildingCount: number;
  maxBuildings: number;
  prestige?: number;
  levelName?: string;
  levelTier?: number;
  area?: number;
  /** 0 = nominal, 1 = warning (debt), 2 = alert (near bankruptcy) */
  failureLevel?: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface GameSettings {
  hideVegetationOnMove: boolean;
  vehicleAnimations: boolean;
  edgeScrollEnabled: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  debugOverlay: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  hideVegetationOnMove: false,
  vehicleAnimations: true,
  edgeScrollEnabled: true,
  soundEnabled: true,
  soundVolume: 0.5,
  debugOverlay: false,
};

/* ---- Store ---- */

interface GameState {
  // Connection
  status: ConnectionStatus;
  username: string;
  worldName: string;
  companyName: string;
  companyId: string;

  // World data
  gameDate: string;
  companies: CompanyInfo[];

  // Tycoon stats (updated by EVENT_TYCOON_UPDATE)
  tycoonStats: TycoonStats | null;

  // Tool modes
  isRoadBuildingMode: boolean;
  isRoadDemolishMode: boolean;

  // Company creation
  companyCreationClusters: string[];

  // Settings
  settings: GameSettings;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setCredentials: (username: string) => void;
  setWorld: (worldName: string) => void;
  setCompany: (name: string, id: string) => void;
  setGameDate: (date: string) => void;
  setCompanies: (companies: CompanyInfo[]) => void;
  setTycoonStats: (stats: TycoonStats) => void;
  setRoadBuildingMode: (active: boolean) => void;
  setRoadDemolishMode: (active: boolean) => void;
  setCompanyCreationClusters: (clusters: string[]) => void;
  updateSettings: (partial: Partial<GameSettings>) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  // Initial state
  status: 'disconnected',
  username: '',
  worldName: '',
  companyName: '',
  companyId: '',
  gameDate: '',
  companies: [],
  tycoonStats: null,
  isRoadBuildingMode: false,
  isRoadDemolishMode: false,
  companyCreationClusters: [],
  settings: { ...DEFAULT_SETTINGS },

  // Actions
  setStatus: (status) => set({ status }),
  setCredentials: (username) => set({ username }),
  setWorld: (worldName) => set({ worldName }),
  setCompany: (name, id) => set({ companyName: name, companyId: id }),
  setGameDate: (date) => set({ gameDate: date }),
  setCompanies: (companies) => set({ companies }),

  setTycoonStats: (stats) => set({ tycoonStats: stats }),

  setRoadBuildingMode: (active) => set({ isRoadBuildingMode: active }),
  setRoadDemolishMode: (active) => set({ isRoadDemolishMode: active }),

  setCompanyCreationClusters: (clusters) => set({ companyCreationClusters: clusters }),

  updateSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),

  reset: () =>
    set({
      status: 'disconnected',
      username: '',
      worldName: '',
      companyName: '',
      companyId: '',
      gameDate: '',
      companies: [],
      tycoonStats: null,
      isRoadBuildingMode: false,
      isRoadDemolishMode: false,
      companyCreationClusters: [],
    }),
}));
