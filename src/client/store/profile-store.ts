/**
 * Profile Store — Tycoon profile tabs (curriculum, bank, P&L, companies, auto-connections, policy).
 */

import { create } from 'zustand';
import type {
  TycoonProfileFull,
  CurriculumData,
  BankAccountData,
  ProfitLossData,
  CompaniesData,
  AutoConnectionsData,
  PolicyData,
  ConnectionSearchResult,
} from '@/shared/types';

export type ProfileTab = 'curriculum' | 'bank' | 'profitloss' | 'companies' | 'autoconnections' | 'policy';

interface ProfileState {
  // State
  profile: TycoonProfileFull | null;
  /** Open section, or null when the panel shows only the section list. */
  currentTab: ProfileTab | null;
  isLoading: boolean;

  // Tab data (loaded on demand)
  curriculum: CurriculumData | null;
  bankAccount: BankAccountData | null;
  profitLoss: ProfitLossData | null;
  companies: CompaniesData | null;
  autoConnections: AutoConnectionsData | null;
  policy: PolicyData | null;

  // Supplier search modal state (for auto-connections "Add Supplier" flow)
  supplierSearch: { fluidId: string; fluidName: string } | null;
  supplierSearchResults: ConnectionSearchResult[];
  supplierSearchLoading: boolean;

  // Refresh counter — incremented after successful actions to trigger re-fetch
  refreshCounter: number;

  // Actions
  setProfile: (profile: TycoonProfileFull) => void;
  setCurrentTab: (tab: ProfileTab | null) => void;
  setLoading: (loading: boolean) => void;
  setCurriculum: (data: CurriculumData) => void;
  setBankAccount: (data: BankAccountData) => void;
  setProfitLoss: (data: ProfitLossData) => void;
  setCompanies: (data: CompaniesData) => void;
  setAutoConnections: (data: AutoConnectionsData) => void;
  setPolicy: (data: PolicyData) => void;
  openSupplierSearch: (fluidId: string, fluidName: string) => void;
  setSupplierSearchResults: (results: ConnectionSearchResult[]) => void;
  setSupplierSearchLoading: (loading: boolean) => void;
  clearSupplierSearch: () => void;
  incrementRefresh: () => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  currentTab: null,
  isLoading: false,
  curriculum: null,
  bankAccount: null,
  profitLoss: null,
  companies: null,
  autoConnections: null,
  policy: null,
  supplierSearch: null,
  supplierSearchResults: [],
  supplierSearchLoading: false,
  refreshCounter: 0,

  setProfile: (profile) => set({ profile, isLoading: false }),
  setCurrentTab: (tab) => set({ currentTab: tab }),
  setLoading: (loading) => set({ isLoading: loading }),
  setCurriculum: (data) => set({ curriculum: data, isLoading: false }),
  setBankAccount: (data) => set({ bankAccount: data, isLoading: false }),
  setProfitLoss: (data) => set({ profitLoss: data, isLoading: false }),
  setCompanies: (data) => set({ companies: data, isLoading: false }),
  setAutoConnections: (data) => set({ autoConnections: data, isLoading: false }),
  setPolicy: (data) => set({ policy: data, isLoading: false }),
  openSupplierSearch: (fluidId, fluidName) => set({
    supplierSearch: { fluidId, fluidName },
    supplierSearchResults: [],
    supplierSearchLoading: false,
  }),
  setSupplierSearchResults: (results) => set({ supplierSearchResults: results, supplierSearchLoading: false }),
  setSupplierSearchLoading: (loading) => set({ supplierSearchLoading: loading }),
  clearSupplierSearch: () => set({ supplierSearch: null, supplierSearchResults: [], supplierSearchLoading: false }),
  incrementRefresh: () => set((s) => ({ refreshCounter: s.refreshCounter + 1 })),

  reset: () =>
    set((s) => ({
      profile: null,
      currentTab: null,
      isLoading: false,
      curriculum: null,
      bankAccount: null,
      profitLoss: null,
      companies: null,
      autoConnections: null,
      policy: null,
      supplierSearch: null,
      supplierSearchResults: [],
      supplierSearchLoading: false,
      // Increment (not zero) so the useEffect re-triggers even on an unchanged section
      refreshCounter: s.refreshCounter + 1,
    })),
}));
