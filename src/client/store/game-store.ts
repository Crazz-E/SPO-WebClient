/**
 * Game Store — Central reactive state for connection, tycoon stats, and settings.
 * Panel navigation is now in ui-store.ts.
 */

import { create } from 'zustand';
import type { CompanyInfo, WorldInfo, ClusterInfo, ClusterFacilityPreview } from '@/shared/types';

/* ---- Utilities ---- */

/** Delphi TDateTime epoch: Dec 30, 1899. TDateTime is days since epoch as a float. */
const DELPHI_EPOCH_MS = new Date(1899, 11, 30).getTime();

export function delphiTDateTimeToJsDate(dDate: number): Date {
  return new Date(DELPHI_EPOCH_MS + dDate * 86_400_000);
}

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
  soundEnabled: boolean;
  soundVolume: number;
  debugOverlay: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  hideVegetationOnMove: false,
  vehicleAnimations: true,
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
  companies: CompanyInfo[];

  // Tycoon stats (updated by EVENT_TYCOON_UPDATE)
  tycoonStats: TycoonStats | null;

  // Game date (from server RefreshDate push)
  gameDate: Date | null;

  // Tool modes
  isRoadBuildingMode: boolean;
  isRoadDemolishMode: boolean;

  // Login flow
  loginWorlds: WorldInfo[];
  loginStage: 'auth' | 'zones' | 'worlds' | 'companies';
  loginLoading: boolean;

  // Company creation / cluster browsing
  companyCreationClusters: string[];
  clusterInfo: ClusterInfo | null;
  clusterInfoLoading: boolean;
  clusterFacilities: ClusterFacilityPreview[];
  clusterFacilitiesLoading: boolean;

  // Settings
  settings: GameSettings;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setCredentials: (username: string) => void;
  setWorld: (worldName: string) => void;
  setCompany: (name: string, id: string) => void;
  setCompanies: (companies: CompanyInfo[]) => void;
  setTycoonStats: (stats: TycoonStats) => void;
  setGameDate: (date: Date) => void;
  setRoadBuildingMode: (active: boolean) => void;
  setRoadDemolishMode: (active: boolean) => void;
  setLoginWorlds: (worlds: WorldInfo[]) => void;
  setLoginCompanies: (companies: CompanyInfo[]) => void;
  setLoginStage: (stage: 'auth' | 'zones' | 'worlds' | 'companies') => void;
  setLoginLoading: (loading: boolean) => void;
  setCompanyCreationClusters: (clusters: string[]) => void;
  setClusterInfo: (info: ClusterInfo | null) => void;
  setClusterInfoLoading: (loading: boolean) => void;
  setClusterFacilities: (facilities: ClusterFacilityPreview[]) => void;
  setClusterFacilitiesLoading: (loading: boolean) => void;
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
  companies: [],
  tycoonStats: null,
  gameDate: null,
  isRoadBuildingMode: false,
  isRoadDemolishMode: false,
  loginWorlds: [],
  loginStage: 'auth',
  loginLoading: false,
  companyCreationClusters: [],
  clusterInfo: null,
  clusterInfoLoading: false,
  clusterFacilities: [],
  clusterFacilitiesLoading: false,
  settings: { ...DEFAULT_SETTINGS },

  // Actions
  setStatus: (status) => set({ status }),
  setCredentials: (username) => set({ username }),
  setWorld: (worldName) => set({ worldName }),
  setCompany: (name, id) => set({ companyName: name, companyId: id }),
  setCompanies: (companies) => set({ companies }),

  setTycoonStats: (stats) => set({ tycoonStats: stats }),
  setGameDate: (date) => set({ gameDate: date }),

  setRoadBuildingMode: (active) => set({ isRoadBuildingMode: active }),
  setRoadDemolishMode: (active) => set({ isRoadDemolishMode: active }),

  setLoginWorlds: (worlds) => set({ loginWorlds: worlds, loginStage: 'worlds', loginLoading: false }),
  setLoginCompanies: (companies) => set({ companies, loginStage: 'companies', loginLoading: false }),
  setLoginStage: (stage) => set({ loginStage: stage }),
  setLoginLoading: (loading) => set({ loginLoading: loading }),

  setCompanyCreationClusters: (clusters) => set({ companyCreationClusters: clusters }),
  setClusterInfo: (info) => set({ clusterInfo: info, clusterInfoLoading: false }),
  setClusterInfoLoading: (loading) => set({ clusterInfoLoading: loading }),
  setClusterFacilities: (facilities) => set({ clusterFacilities: facilities, clusterFacilitiesLoading: false }),
  setClusterFacilitiesLoading: (loading) => set({ clusterFacilitiesLoading: loading }),

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
      companies: [],
      tycoonStats: null,
      gameDate: null,
      isRoadBuildingMode: false,
      isRoadDemolishMode: false,
      loginWorlds: [],
      loginStage: 'auth',
      loginLoading: false,
      companyCreationClusters: [],
      clusterInfo: null,
      clusterInfoLoading: false,
      clusterFacilities: [],
      clusterFacilitiesLoading: false,
    }),
}));
