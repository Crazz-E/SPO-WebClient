/**
 * Game Store — Central reactive state for connection, tycoon stats, and settings.
 * Panel navigation is now in ui-store.ts.
 */

import { create } from 'zustand';
import type { CompanyInfo, WorldInfo, ClusterInfo, ClusterFacilityPreview } from '@/shared/types';
import { SurfaceType } from '@/shared/types/domain-types';

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
  nobPoints?: number;
  area?: number;
  /** 0 = nominal, 1 = warning (debt), 2 = alert (near bankruptcy) */
  failureLevel?: number;
}

export type MinimapSize = 'small' | 'medium' | 'large';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export type ServiceStatus = 'pending' | 'running' | 'complete' | 'failed';

export interface ServerStartupState {
  ready: boolean;
  progress: number;
  message: string;
  services: Array<{ name: string; status: ServiceStatus; progress: number; subStep?: string }>;
  cacheSteps?: Array<{ name: string; label: string; status: 'pending' | 'running' | 'complete' }>;
}

export interface MapLoadingState {
  active: boolean;
  progress: number;
  message: string;
}

export interface GameSettings {
  hideVegetationOnMove: boolean;
  vehicleAnimations: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  debugOverlay: boolean;
  minimapSize: MinimapSize;
}

const DEFAULT_SETTINGS: GameSettings = {
  hideVegetationOnMove: false,
  vehicleAnimations: true,
  soundEnabled: true,
  soundVolume: 0.5,
  debugOverlay: false,
  minimapSize: 'medium',
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

  // Cash history for sparkline (last 12 values)
  cashHistory: number[];

  // Game date (from server RefreshDate push)
  gameDate: Date | null;

  // Company switching
  isSwitchingCompany: boolean;

  // Tool modes
  isRoadBuildingMode: boolean;
  isRoadDemolishMode: boolean;
  isZonePaintingMode: boolean;
  selectedZoneType: number;
  isPublicOfficeRole: boolean;
  ownerRole: string;

  // Overlays
  isCityZonesEnabled: boolean;
  activeOverlay: SurfaceType | null;

  // Login flow
  loginWorlds: WorldInfo[];
  loginStage: 'auth' | 'zones' | 'worlds' | 'companies';
  loginLoading: boolean;
  authError: { code: number; message: string } | null;

  // Server switch overlay (browse regions/worlds while in-game)
  serverSwitchMode: boolean;
  serverSwitchOriginWorld: string;

  // Company creation / cluster browsing
  companyCreationClusters: string[];
  clusterInfo: ClusterInfo | null;
  clusterInfoLoading: boolean;
  clusterFacilities: ClusterFacilityPreview[];
  clusterFacilitiesLoading: boolean;

  // Capitol location (from DirectoryMain.asp)
  capitolCoords: { x: number; y: number } | null;

  // Server startup progress (SSE-driven)
  serverStartup: ServerStartupState;

  // Map loading progress (company select → playable)
  mapLoading: MapLoadingState;

  // Settings
  settings: GameSettings;

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setCredentials: (username: string) => void;
  setWorld: (worldName: string) => void;
  setCompany: (name: string, id: string) => void;
  setCompanies: (companies: CompanyInfo[]) => void;
  setSwitchingCompany: (switching: boolean) => void;
  setTycoonStats: (stats: TycoonStats) => void;
  setGameDate: (date: Date) => void;
  setRoadBuildingMode: (active: boolean) => void;
  setRoadDemolishMode: (active: boolean) => void;
  setZonePaintingMode: (active: boolean) => void;
  setSelectedZoneType: (zoneType: number) => void;
  setPublicOfficeRole: (isPublicOffice: boolean, role?: string) => void;
  setCityZonesEnabled: (enabled: boolean) => void;
  setActiveOverlay: (overlay: SurfaceType | null) => void;
  setLoginWorlds: (worlds: WorldInfo[]) => void;
  setLoginCompanies: (companies: CompanyInfo[]) => void;
  setLoginStage: (stage: 'auth' | 'zones' | 'worlds' | 'companies') => void;
  setLoginLoading: (loading: boolean) => void;
  setAuthError: (error: { code: number; message: string } | null) => void;
  setCompanyCreationClusters: (clusters: string[]) => void;
  setClusterInfo: (info: ClusterInfo | null) => void;
  setClusterInfoLoading: (loading: boolean) => void;
  setClusterFacilities: (facilities: ClusterFacilityPreview[]) => void;
  setClusterFacilitiesLoading: (loading: boolean) => void;
  setCapitolCoords: (coords: { x: number; y: number } | null) => void;
  setServerStartup: (partial: Partial<ServerStartupState>) => void;
  setMapLoading: (partial: Partial<MapLoadingState>) => void;
  updateSettings: (partial: Partial<GameSettings>) => void;
  enterServerSwitch: () => void;
  cancelServerSwitch: () => void;
  completeServerSwitch: () => void;
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
  cashHistory: [],
  gameDate: null,
  isSwitchingCompany: false,
  isRoadBuildingMode: false,
  isRoadDemolishMode: false,
  isZonePaintingMode: false,
  selectedZoneType: 2,
  isPublicOfficeRole: false,
  ownerRole: '',
  isCityZonesEnabled: false,
  activeOverlay: null,
  loginWorlds: [],
  loginStage: 'auth',
  loginLoading: false,
  authError: null,
  serverSwitchMode: false,
  serverSwitchOriginWorld: '',
  companyCreationClusters: [],
  clusterInfo: null,
  clusterInfoLoading: false,
  clusterFacilities: [],
  clusterFacilitiesLoading: false,
  capitolCoords: null,
  settings: { ...DEFAULT_SETTINGS },
  serverStartup: { ready: false, progress: 0, message: 'Connecting...', services: [] },
  mapLoading: { active: false, progress: 0, message: '' },
  // Actions
  setStatus: (status) => set({ status }),
  setCredentials: (username) => set({ username }),
  setWorld: (worldName) => set({ worldName }),
  setCompany: (name, id) => set({ companyName: name, companyId: id }),
  setCompanies: (companies) => set({ companies }),
  setSwitchingCompany: (switching) => set({ isSwitchingCompany: switching }),

  setTycoonStats: (stats) => set((state) => {
    const cashNum = parseFloat(stats.cash.replace(/[^0-9.\-]/g, ''));
    const prev = state.cashHistory;
    const next = Number.isFinite(cashNum)
      ? [...prev.slice(-(12 - 1)), cashNum]
      : prev;
    return { tycoonStats: stats, cashHistory: next };
  }),
  setGameDate: (date) => set({ gameDate: date }),

  setRoadBuildingMode: (active) => set({ isRoadBuildingMode: active }),
  setRoadDemolishMode: (active) => set({ isRoadDemolishMode: active }),
  setZonePaintingMode: (active) => set({ isZonePaintingMode: active }),
  setSelectedZoneType: (zoneType) => set({ selectedZoneType: zoneType }),
  setPublicOfficeRole: (isPublicOffice, role) => set({ isPublicOfficeRole: isPublicOffice, ownerRole: role ?? '' }),
  setCityZonesEnabled: (enabled) => set({ isCityZonesEnabled: enabled }),
  setActiveOverlay: (overlay) => set({ activeOverlay: overlay }),

  setLoginWorlds: (worlds) => set({ loginWorlds: worlds, loginStage: 'worlds', loginLoading: false }),
  setLoginCompanies: (companies) => set({ companies, loginStage: 'companies', loginLoading: false }),
  setLoginStage: (stage) => set({ loginStage: stage }),
  setLoginLoading: (loading) => set({ loginLoading: loading }),
  setAuthError: (error) => set({ authError: error }),

  setCompanyCreationClusters: (clusters) => set({ companyCreationClusters: clusters }),
  setClusterInfo: (info) => set({ clusterInfo: info, clusterInfoLoading: false }),
  setClusterInfoLoading: (loading) => set({ clusterInfoLoading: loading }),
  setClusterFacilities: (facilities) => set({ clusterFacilities: facilities, clusterFacilitiesLoading: false }),
  setClusterFacilitiesLoading: (loading) => set({ clusterFacilitiesLoading: loading }),

  setCapitolCoords: (coords) => set({ capitolCoords: coords }),

  setServerStartup: (partial) =>
    set((state) => ({ serverStartup: { ...state.serverStartup, ...partial } })),

  setMapLoading: (partial) =>
    set((state) => ({ mapLoading: { ...state.mapLoading, ...partial } })),

  updateSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),

  enterServerSwitch: () =>
    set((state) => ({
      serverSwitchMode: true,
      serverSwitchOriginWorld: state.worldName,
      loginStage: 'zones' as const,
      loginLoading: false,
    })),

  cancelServerSwitch: () =>
    set({
      serverSwitchMode: false,
      serverSwitchOriginWorld: '',
      loginStage: 'auth' as const,
    }),

  completeServerSwitch: () =>
    set({
      serverSwitchMode: false,
      serverSwitchOriginWorld: '',
    }),

  reset: () =>
    set({
      status: 'disconnected',
      username: '',
      worldName: '',
      companyName: '',
      companyId: '',
      companies: [],
      tycoonStats: null,
      cashHistory: [],
      gameDate: null,
      isSwitchingCompany: false,
      isRoadBuildingMode: false,
      isRoadDemolishMode: false,
      isZonePaintingMode: false,
      selectedZoneType: 2,
      isPublicOfficeRole: false,
      ownerRole: '',
      isCityZonesEnabled: false,
      loginWorlds: [],
      loginStage: 'auth',
      loginLoading: false,
      authError: null,
      serverSwitchMode: false,
      serverSwitchOriginWorld: '',
      companyCreationClusters: [],
      clusterInfo: null,
      clusterInfoLoading: false,
      capitolCoords: null,
      clusterFacilities: [],
      clusterFacilitiesLoading: false,
    }),
}));
