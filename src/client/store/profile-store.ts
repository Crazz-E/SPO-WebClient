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
} from '@/shared/types';

export type ProfileTab = 'curriculum' | 'bank' | 'profitloss' | 'companies' | 'autoconnections' | 'policy';

interface ProfileState {
  // State
  profile: TycoonProfileFull | null;
  currentTab: ProfileTab;
  isLoading: boolean;

  // Tab data (loaded on demand)
  curriculum: CurriculumData | null;
  bankAccount: BankAccountData | null;
  profitLoss: ProfitLossData | null;
  companies: CompaniesData | null;
  autoConnections: AutoConnectionsData | null;
  policy: PolicyData | null;

  // Refresh counter — incremented after successful actions to trigger re-fetch
  refreshCounter: number;

  // Actions
  setProfile: (profile: TycoonProfileFull) => void;
  setCurrentTab: (tab: ProfileTab) => void;
  setLoading: (loading: boolean) => void;
  setCurriculum: (data: CurriculumData) => void;
  setBankAccount: (data: BankAccountData) => void;
  setProfitLoss: (data: ProfitLossData) => void;
  setCompanies: (data: CompaniesData) => void;
  setAutoConnections: (data: AutoConnectionsData) => void;
  setPolicy: (data: PolicyData) => void;
  incrementRefresh: () => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  currentTab: 'curriculum',
  isLoading: false,
  curriculum: null,
  bankAccount: null,
  profitLoss: null,
  companies: null,
  autoConnections: null,
  policy: null,
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
  incrementRefresh: () => set((s) => ({ refreshCounter: s.refreshCounter + 1 })),

  reset: () =>
    set((s) => ({
      profile: null,
      currentTab: 'curriculum',
      isLoading: false,
      curriculum: null,
      bankAccount: null,
      profitLoss: null,
      companies: null,
      autoConnections: null,
      policy: null,
      // Increment (not zero) so the useEffect re-triggers even if already on 'curriculum'
      refreshCounter: s.refreshCounter + 1,
    })),
}));
