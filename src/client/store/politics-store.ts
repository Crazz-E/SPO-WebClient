/**
 * Politics Store — Town politics, elections, campaigns.
 */

import { create } from 'zustand';
import type { PoliticsData, PoliticalRoleInfo } from '@/shared/types';

export type CapitolTab = 'towns' | 'ministries' | 'jobs' | 'residentials' | 'votes' | 'ratings';

/** The four sub-tabs of the ratings rail — `ratingtabs.asp:75-135`. */
export type RatingRail = 'popular' | 'tycoons' | 'ifel' | 'publicity';

/** The two sub-tabs of the campaign rail — `campaigntabs.asp:88-119`. */
export type CampaignRail = 'mine' | 'all';

/**
 * How far the Politics tab has got with its own fetch.
 *
 * The tab is lazy on purpose: `getPoliticsData` costs five HTTP round-trips to
 * the world's IIS plus two cache reads, and every civic building click would pay
 * them. Nothing is requested until the player opens a tab that needs the data,
 * which is the loading model the gate work settled on (`efe0b04`).
 */
export type PoliticsLoadState = 'idle' | 'loading' | 'loaded' | 'error';

interface PoliticsState {
  // State
  data: PoliticsData | null;
  townName: string;
  buildingX: number;
  buildingY: number;
  isCapitol: boolean;
  isLoading: boolean;
  loadState: PoliticsLoadState;
  /**
   * `x:y` of the building `data` describes. Guards against a response for the
   * previous building landing after the player has clicked another one.
   */
  loadedFor: string;
  activeCapitolTab: CapitolTab;
  activeRatingRail: RatingRail;
  activeCampaignRail: CampaignRail;

  /**
   * Ratings the player has just sent, by rating id.
   *
   * `RDOSetRatingFrom` is a `procedure`: nothing comes back, and the cached ASP
   * page will not show the new figure until the server re-caches. Voyager has
   * the same problem and solves it the same way — it paints the value it sent in
   * red with an asterisk and says so in a footnote (`tycoonratings.asp:111-114`,
   * `StrTycoonRatings_1`). These are those values.
   */
  pendingRatings: Map<string, number>;
  /** Same idea for the publicity rail (`mayorpub.asp:120-137`). */
  pendingPublicity: Map<string, number>;
  /** Same idea for the campaign projects (`tycooncampaign.asp:201`). */
  pendingProjects: Map<string, string>;

  // Political roles cache (keyed by lowercase tycoon name)
  politicalRoles: Map<string, PoliticalRoleInfo>;
  roleQueryPending: Set<string>;

  // Actions
  setData: (data: PoliticsData) => void;
  setTownContext: (townName: string, x: number, y: number, isCapitol: boolean) => void;
  setLoading: (loading: boolean) => void;
  setLoadState: (state: PoliticsLoadState) => void;
  setActiveCapitolTab: (tab: CapitolTab) => void;
  setActiveRatingRail: (rail: RatingRail) => void;
  setActiveCampaignRail: (rail: CampaignRail) => void;
  setPendingRating: (ratingId: string, value: number) => void;
  setPendingPublicity: (ratingId: string, value: number) => void;
  setPendingProject: (projectId: string, data: string) => void;
  setTycoonRole: (role: PoliticalRoleInfo) => void;
  getTycoonRole: (tycoonName: string) => PoliticalRoleInfo | undefined;
  setRoleQueryPending: (tycoonName: string, pending: boolean) => void;
  isRoleQueryPending: (tycoonName: string) => boolean;
  clearRoles: () => void;
  reset: () => void;
}

/** Everything a new building context invalidates. Roles survive — they are global. */
const CONTEXT_DEFAULTS = {
  data: null,
  isLoading: false,
  loadState: 'idle' as PoliticsLoadState,
  loadedFor: '',
  activeRatingRail: 'popular' as RatingRail,
  activeCampaignRail: 'mine' as CampaignRail,
  pendingRatings: new Map<string, number>(),
  pendingPublicity: new Map<string, number>(),
  pendingProjects: new Map<string, string>(),
};

export const usePoliticsStore = create<PoliticsState>((set, get) => ({
  ...CONTEXT_DEFAULTS,
  townName: '',
  buildingX: 0,
  buildingY: 0,
  isCapitol: false,
  activeCapitolTab: 'towns',
  politicalRoles: new Map(),
  roleQueryPending: new Set(),

  setData: (data) => set((state) => ({
    data,
    isLoading: false,
    loadState: 'loaded',
    loadedFor: `${state.buildingX}:${state.buildingY}`,
    // A fresh read supersedes what we painted optimistically.
    pendingRatings: new Map(),
    pendingPublicity: new Map(),
    pendingProjects: new Map(),
  })),

  setTownContext: (townName, x, y, isCapitol) => set((state) =>
    // Re-opening the SAME building keeps its loaded data; only a different one
    // clears it, so switching tabs inside one modal never refetches.
    state.buildingX === x && state.buildingY === y && state.isCapitol === isCapitol
      ? { townName }
      : { ...CONTEXT_DEFAULTS, townName, buildingX: x, buildingY: y, isCapitol }
  ),

  setLoading: (loading) => set({ isLoading: loading }),
  setLoadState: (loadState) => set({ loadState, isLoading: loadState === 'loading' }),
  setActiveCapitolTab: (tab) => set({ activeCapitolTab: tab }),
  setActiveRatingRail: (rail) => set({ activeRatingRail: rail }),
  setActiveCampaignRail: (rail) => set({ activeCampaignRail: rail }),

  setPendingRating: (ratingId, value) => set((state) => {
    const next = new Map(state.pendingRatings);
    next.set(ratingId, value);
    return { pendingRatings: next };
  }),

  setPendingPublicity: (ratingId, value) => set((state) => {
    const next = new Map(state.pendingPublicity);
    next.set(ratingId, value);
    return { pendingPublicity: next };
  }),

  setPendingProject: (projectId, data) => set((state) => {
    const next = new Map(state.pendingProjects);
    next.set(projectId, data);
    return { pendingProjects: next };
  }),

  setTycoonRole: (role) => set((state) => {
    const newMap = new Map(state.politicalRoles);
    newMap.set(role.tycoonName.toLowerCase(), role);
    // Cap at 100 entries to prevent unbounded growth
    if (newMap.size > 100) {
      const firstKey = newMap.keys().next().value;
      if (firstKey !== undefined) newMap.delete(firstKey);
    }
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
      ...CONTEXT_DEFAULTS,
      townName: '',
      buildingX: 0,
      buildingY: 0,
      isCapitol: false,
      activeCapitolTab: 'towns',
      politicalRoles: new Map(),
      roleQueryPending: new Set(),
    }),
}));
