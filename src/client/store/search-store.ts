/**
 * Search Store — Directory search pages (home, towns, tycoons, rankings, banks).
 */

import { create } from 'zustand';
import type {
  WsRespSearchMenuHome,
  WsRespSearchMenuTowns,
  WsRespSearchMenuPeopleSearch,
  WsRespSearchMenuTycoonProfile,
  WsRespSearchMenuRankings,
  WsRespSearchMenuRankingDetail,
  WsRespSearchMenuBanks,
} from '@/shared/types';

export type SearchPage = 'home' | 'towns' | 'people' | 'rankings' | 'ranking-detail' | 'banks' | 'tycoon-profile';

interface SearchState {
  // Navigation
  currentPage: SearchPage;
  pageHistory: SearchPage[];
  isLoading: boolean;

  // Page data
  homeData: WsRespSearchMenuHome | null;
  townsData: WsRespSearchMenuTowns | null;
  peopleData: WsRespSearchMenuPeopleSearch | null;
  rankingsData: WsRespSearchMenuRankings | null;
  rankingDetailData: WsRespSearchMenuRankingDetail | null;
  tycoonProfileData: WsRespSearchMenuTycoonProfile | null;
  banksData: WsRespSearchMenuBanks | null;

  // Actions
  navigateTo: (page: SearchPage) => void;
  goBack: () => void;
  setLoading: (loading: boolean) => void;
  setHomeData: (data: WsRespSearchMenuHome) => void;
  setTownsData: (data: WsRespSearchMenuTowns) => void;
  setPeopleData: (data: WsRespSearchMenuPeopleSearch) => void;
  setRankingsData: (data: WsRespSearchMenuRankings) => void;
  setRankingDetailData: (data: WsRespSearchMenuRankingDetail) => void;
  clearRankingDetail: () => void;
  setTycoonProfileData: (data: WsRespSearchMenuTycoonProfile) => void;
  setBanksData: (data: WsRespSearchMenuBanks) => void;
  reset: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  currentPage: 'home',
  pageHistory: [],
  isLoading: false,

  homeData: null,
  townsData: null,
  peopleData: null,
  rankingsData: null,
  rankingDetailData: null,
  tycoonProfileData: null,
  banksData: null,

  navigateTo: (page) =>
    set((state) => ({
      currentPage: page,
      pageHistory: [...state.pageHistory, state.currentPage],
      isLoading: true,
    })),

  goBack: () => {
    const history = get().pageHistory;
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    set({
      currentPage: previous,
      pageHistory: history.slice(0, -1),
    });
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setHomeData: (data) => set({ homeData: data, isLoading: false }),
  setTownsData: (data) => set({ townsData: data, isLoading: false }),
  setPeopleData: (data) => set({ peopleData: data, isLoading: false }),
  setRankingsData: (data) => set({ rankingsData: data, isLoading: false }),
  setRankingDetailData: (data) => set({ rankingDetailData: data, isLoading: false }),
  clearRankingDetail: () => set({ rankingDetailData: null }),
  setTycoonProfileData: (data) => set({ tycoonProfileData: data, isLoading: false }),
  setBanksData: (data) => set({ banksData: data, isLoading: false }),

  reset: () =>
    set({
      currentPage: 'home',
      pageHistory: [],
      isLoading: false,
      homeData: null,
      townsData: null,
      peopleData: null,
      rankingsData: null,
      rankingDetailData: null,
      tycoonProfileData: null,
      banksData: null,
    }),
}));
