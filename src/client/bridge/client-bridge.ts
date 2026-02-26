/**
 * ClientBridge — Adapter between legacy client.ts and React/Zustand.
 *
 * Phase 1: Thin bridge using window globals for bidirectional communication.
 * - Legacy client.ts calls bridge methods to push state into Zustand stores.
 * - React components read from stores and call bridge callbacks to trigger client.ts actions.
 *
 * Phase 2+: This will be replaced by a proper React context provider
 * that directly wraps the WebSocket client.
 */

import { useGameStore, type GameSettings } from '../store/game-store';
import { useBuildingStore } from '../store/building-store';
import { useChatStore } from '../store/chat-store';
import { useMailStore } from '../store/mail-store';
import { useProfileStore } from '../store/profile-store';
import { useSearchStore } from '../store/search-store';
import { usePoliticsStore } from '../store/politics-store';
import { useTransportStore } from '../store/transport-store';
import { useUiStore } from '../store/ui-store';
import { useLogStore } from '../store/log-store';
import { showToast } from '../components/common/Toast';
import type {
  WorldInfo,
  CompanyInfo,
  BuildingFocusInfo,
  BuildingDetailsResponse,
  TycoonProfileFull,
  BuildingCategory,
  BuildingInfo,
  MailFolder,
  ConnectionSearchResult,
} from '@/shared/types';
import {
  WsMessageType,
  type WsMessage,
  type WsRespMailFolder,
  type WsRespMailMessage,
  type WsRespMailSent,
  type WsRespMailDeleted,
  type WsRespMailUnreadCount,
  type WsRespMailDraftSaved,
  type WsRespProfileCurriculum,
  type WsRespProfileBank,
  type WsRespProfileBankAction,
  type WsRespProfileProfitLoss,
  type WsRespProfileCompanies,
  type WsRespProfileAutoConnections,
  type WsRespProfileAutoConnectionAction,
  type WsRespProfilePolicy,
  type WsRespProfilePolicySet,
  type WsRespSearchMenuHome,
  type WsRespSearchMenuTowns,
  type WsRespSearchMenuTycoonProfile,
  type WsRespSearchMenuPeopleSearch,
  type WsRespSearchMenuRankings,
  type WsRespSearchMenuRankingDetail,
  type WsRespSearchMenuBanks,
  type WsRespPoliticsData,
  type WsRespTransportData,
} from '@/shared/types';

/**
 * Callbacks that React UI can invoke on the legacy client.
 * Registered by client.ts during initialization.
 */
export interface ClientCallbacks {
  // Login flow
  onDirectoryConnect: (username: string, password: string, zonePath?: string) => void;
  onWorldSelect: (worldName: string) => void;
  onCompanySelect: (companyId: string) => void;
  onCreateCompany: () => void;
  onCreateCompanySubmit: (companyName: string, cluster: string) => Promise<void>;

  // Game actions
  onBuildMenu: () => void;
  onBuildRoad: () => void;
  onDemolishRoad: () => void;
  onRefreshMap: () => void;
  onLogout: () => void;

  // Chat
  onSendChatMessage: (message: string) => void;
  onJoinChannel: (channelName: string) => void;

  // Build menu
  onRequestBuildingCategories: () => void;
  onRequestBuildingFacilities: (kind: number, cluster: string) => void;
  onPlaceBuilding: (facilityClass: string, visualClassId: number) => void;

  // Settings
  onSettingsChange: (settings: GameSettings) => void;

  // Building
  onSetBuildingProperty: (x: number, y: number, propertyName: string, value: string, additionalParams?: Record<string, string>) => void;
  onUpgradeBuilding: (x: number, y: number, action: string, count?: number) => void;
  onRefreshBuilding: (x: number, y: number) => void;
  onRenameBuilding: (x: number, y: number, newName: string) => void;
  onDeleteBuilding: (x: number, y: number) => void;
  onNavigateToBuilding: (x: number, y: number) => void;
  onBuildingAction: (actionId: string) => void;
  onSearchConnections: (x: number, y: number, fluidId: string, fluidName: string, direction: 'input' | 'output') => void;
  onConnectionSearch: (buildingX: number, buildingY: number, fluidId: string, direction: 'input' | 'output', filters: { company?: string; town?: string; maxResults?: number; roles?: number }) => void;
  onConnectionConnect: (fluidId: string, direction: 'input' | 'output', selectedCoords: Array<{ x: number; y: number }>) => void;

  // Mail
  onMailGetFolder: (folder: MailFolder) => void;
  onMailReadMessage: (messageId: string) => void;
  onMailSend: (to: string, subject: string, body: string) => void;
  onMailDelete: (messageId: string) => void;
  onMailSaveDraft: (to: string, subject: string, body: string) => void;

  // Search menu
  onSearchMenuHome: () => void;
  onSearchMenuNavigate: (page: string) => void;

  // Profile
  onSwitchCompany: (companyName: string, companyId: number) => void;
  onProfileRequestTab: (tab: string) => void;
}

declare global {
  interface Window {
    __spoReactCallbacks?: Partial<ClientCallbacks>;
    __spoLoginHandlers?: {
      showWorlds: (worlds: WorldInfo[]) => void;
      showCompanies: (companies: CompanyInfo[]) => void;
      setLoading: (loading: boolean) => void;
    };
    __spoBuildMenuHandlers?: {
      setCategories: (cats: BuildingCategory[]) => void;
      setFacilities: (facs: BuildingInfo[]) => void;
    };
  }
}

/**
 * Register callbacks from the legacy client so React components can invoke them.
 * Called once during client.ts initialization.
 */
export function registerClientCallbacks(callbacks: Partial<ClientCallbacks>): void {
  window.__spoReactCallbacks = callbacks;
}

/**
 * Store-pushing methods — called by the legacy client.ts message handler
 * to sync game state into Zustand stores for React consumption.
 */
export const ClientBridge = {
  // ---- Logging ----

  log(source: string, message: string): void {
    useLogStore.getState().addEntry(source, message);
  },

  // ---- Settings persistence ----

  /** Load settings from localStorage into Zustand store (call once at init). */
  loadPersistedSettings(): void {
    try {
      const stored = localStorage.getItem('spo_settings');
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<GameSettings>;
        useGameStore.getState().updateSettings(parsed);
      }
    } catch {
      // Ignore parse errors — defaults stay
    }
  },

  /** Persist current settings to localStorage. */
  persistSettings(settings: GameSettings): void {
    try {
      localStorage.setItem('spo_settings', JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }
  },

  /** Get current settings from Zustand store. */
  getSettings(): GameSettings {
    return useGameStore.getState().settings;
  },

  // ---- Tool modes ----

  setRoadBuildingMode(active: boolean): void {
    useGameStore.getState().setRoadBuildingMode(active);
  },

  setRoadDemolishMode(active: boolean): void {
    useGameStore.getState().setRoadDemolishMode(active);
  },

  // ---- Connection state ----

  setConnecting(): void {
    useGameStore.getState().setStatus('connecting');
  },

  setConnected(): void {
    useGameStore.getState().setStatus('connected');
  },

  setDisconnected(): void {
    useGameStore.getState().setStatus('disconnected');
  },

  setCredentials(username: string): void {
    useGameStore.getState().setCredentials(username);
  },

  setWorld(worldName: string): void {
    useGameStore.getState().setWorld(worldName);
  },

  setCompany(name: string, id: string): void {
    useGameStore.getState().setCompany(name, id);
  },

  // ---- Login flow ----

  showWorlds(worlds: WorldInfo[]): void {
    window.__spoLoginHandlers?.showWorlds(worlds);
  },

  showCompanies(companies: CompanyInfo[]): void {
    useGameStore.getState().setCompanies(companies);
    window.__spoLoginHandlers?.showCompanies(companies);
  },

  setLoginLoading(loading: boolean): void {
    window.__spoLoginHandlers?.setLoading(loading);
  },

  // ---- Tycoon stats ----

  updateTycoonStats(stats: {
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
    failureLevel?: number;
  }): void {
    useGameStore.getState().setTycoonStats(stats);
  },

  // ---- Build menu ----

  setBuildMenuCategories(categories: BuildingCategory[]): void {
    window.__spoBuildMenuHandlers?.setCategories(categories);
  },

  setBuildMenuFacilities(facilities: BuildingInfo[]): void {
    window.__spoBuildMenuHandlers?.setFacilities(facilities);
  },

  // ---- Building ----

  setFocusedBuilding(info: BuildingFocusInfo): void {
    useBuildingStore.getState().setFocus(info);
  },

  setBuildingDetails(details: BuildingDetailsResponse): void {
    useBuildingStore.getState().setDetails(details);
  },

  clearBuildingFocus(): void {
    useBuildingStore.getState().clearFocus();
    useUiStore.getState().closeRightPanel();
  },

  setBuildingLoading(loading: boolean): void {
    useBuildingStore.getState().setLoading(loading);
  },

  /** Show the building panel in the right panel with ownership context. */
  showBuildingPanel(details: BuildingDetailsResponse, currentCompanyName: string): void {
    const bld = useBuildingStore.getState();
    bld.setCurrentCompanyName(currentCompanyName);
    bld.setDetails(details);
    useUiStore.getState().openRightPanel('building');
  },

  /** Update building details in-place (smart refresh). */
  updateBuildingDetails(details: BuildingDetailsResponse): void {
    useBuildingStore.getState().setDetails(details);
  },

  /** Hide the building panel. */
  hideBuildingPanel(): void {
    useBuildingStore.getState().clearFocus();
    const uiState = useUiStore.getState();
    if (uiState.rightPanel === 'building') {
      uiState.closeRightPanel();
    }
  },

  // ---- Chat ----

  setChatChannels(channels: string[]): void {
    useChatStore.getState().setChannels(channels);
  },

  addChatMessage(channel: string, message: {
    id: string;
    from: string;
    text: string;
    timestamp: number;
    isSystem: boolean;
    isGM: boolean;
  }): void {
    useChatStore.getState().addMessage(channel, message);
  },

  setChatUsers(users: Array<{ name: string; id: string; status: number }>): void {
    useChatStore.getState().setUsers(users);
  },

  setChatUserTyping(username: string, isTyping: boolean): void {
    useChatStore.getState().setUserTyping(username, isTyping);
  },

  setCurrentChannel(channel: string): void {
    useChatStore.getState().setCurrentChannel(channel);
  },

  // ---- Mail ----

  setMailUnreadCount(count: number): void {
    useMailStore.getState().setUnreadCount(count);
  },

  // ---- Profile ----

  setProfile(data: TycoonProfileFull): void {
    useProfileStore.getState().setProfile(data);
  },

  // ---- Notifications ----

  showInfo(message: string): void {
    showToast(message, 'info');
  },

  showSuccess(message: string): void {
    showToast(message, 'success');
  },

  showWarning(message: string): void {
    showToast(message, 'warning');
  },

  showError(message: string): void {
    showToast(message, 'error');
  },

  // ---- Mail response handling ----

  handleMailResponse(msg: WsMessage): void {
    const mail = useMailStore.getState();
    switch (msg.type) {
      case WsMessageType.RESP_MAIL_FOLDER: {
        const resp = msg as WsRespMailFolder;
        mail.setMessages(resp.messages);
        break;
      }
      case WsMessageType.RESP_MAIL_MESSAGE: {
        const resp = msg as WsRespMailMessage;
        mail.setCurrentMessage(resp.message);
        break;
      }
      case WsMessageType.RESP_MAIL_SENT: {
        const resp = msg as WsRespMailSent;
        if (resp.success) {
          mail.clearCompose();
          showToast('Message sent', 'success');
        }
        break;
      }
      case WsMessageType.RESP_MAIL_DELETED: {
        const resp = msg as WsRespMailDeleted;
        if (resp.success) {
          mail.setView('list');
          showToast('Message deleted', 'info');
        }
        break;
      }
      case WsMessageType.RESP_MAIL_UNREAD_COUNT: {
        const resp = msg as WsRespMailUnreadCount;
        mail.setUnreadCount(resp.count);
        break;
      }
      case WsMessageType.RESP_MAIL_DRAFT_SAVED: {
        const resp = msg as WsRespMailDraftSaved;
        if (resp.success) {
          mail.clearCompose();
          mail.setFolder('Drafts');
          showToast('Draft saved', 'info');
        }
        break;
      }
    }
  },

  // ---- Search menu response handling ----

  handleSearchMenuResponse(msg: WsMessage): void {
    const search = useSearchStore.getState();
    switch (msg.type) {
      case WsMessageType.RESP_SEARCH_MENU_HOME:
        search.setHomeData(msg as WsRespSearchMenuHome);
        break;
      case WsMessageType.RESP_SEARCH_MENU_TOWNS:
        search.setTownsData(msg as WsRespSearchMenuTowns);
        break;
      case WsMessageType.RESP_SEARCH_MENU_TYCOON_PROFILE:
        search.setTycoonData(msg as WsRespSearchMenuTycoonProfile);
        break;
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE:
        // Acknowledges page ready — no data to store
        search.setLoading(false);
        break;
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH:
        search.setPeopleData(msg as WsRespSearchMenuPeopleSearch);
        break;
      case WsMessageType.RESP_SEARCH_MENU_RANKINGS:
        search.setRankingsData(msg as WsRespSearchMenuRankings);
        break;
      case WsMessageType.RESP_SEARCH_MENU_RANKING_DETAIL:
        search.setRankingDetailData(msg as WsRespSearchMenuRankingDetail);
        break;
      case WsMessageType.RESP_SEARCH_MENU_BANKS:
        search.setBanksData(msg as WsRespSearchMenuBanks);
        break;
    }
  },

  handleSearchMenuError(errorMessage: string): void {
    useSearchStore.getState().setLoading(false);
    showToast(errorMessage, 'error');
  },

  // ---- Profile response handling ----

  handleProfileResponse(msg: WsMessage): void {
    const profile = useProfileStore.getState();
    switch (msg.type) {
      case WsMessageType.RESP_PROFILE_CURRICULUM:
        profile.setCurriculum((msg as WsRespProfileCurriculum).data);
        break;
      case WsMessageType.RESP_PROFILE_BANK:
        profile.setBankAccount((msg as WsRespProfileBank).data);
        break;
      case WsMessageType.RESP_PROFILE_BANK_ACTION: {
        const resp = msg as WsRespProfileBankAction;
        showToast(resp.result.message || 'Bank action completed', resp.result.success ? 'success' : 'error');
        break;
      }
      case WsMessageType.RESP_PROFILE_PROFITLOSS:
        profile.setProfitLoss((msg as WsRespProfileProfitLoss).data);
        break;
      case WsMessageType.RESP_PROFILE_COMPANIES:
        profile.setCompanies((msg as WsRespProfileCompanies).data);
        break;
      case WsMessageType.RESP_PROFILE_AUTOCONNECTIONS:
        profile.setAutoConnections((msg as WsRespProfileAutoConnections).data);
        break;
      case WsMessageType.RESP_PROFILE_AUTOCONNECTION_ACTION: {
        const resp = msg as WsRespProfileAutoConnectionAction;
        showToast(resp.message || 'Connection updated', resp.success ? 'success' : 'error');
        break;
      }
      case WsMessageType.RESP_PROFILE_POLICY:
        profile.setPolicy((msg as WsRespProfilePolicy).data);
        break;
      case WsMessageType.RESP_PROFILE_POLICY_SET: {
        const resp = msg as WsRespProfilePolicySet;
        showToast(resp.message || 'Policy updated', resp.success ? 'success' : 'error');
        break;
      }
    }
  },

  // ---- Politics response handling ----

  handlePoliticsResponse(msg: WsMessage): void {
    if (msg.type === WsMessageType.RESP_POLITICS_DATA) {
      usePoliticsStore.getState().setData((msg as WsRespPoliticsData).data);
    }
  },

  showPoliticsPanel(townName: string, buildingX: number, buildingY: number): void {
    usePoliticsStore.getState().setTownContext(townName, buildingX, buildingY);
    usePoliticsStore.getState().setLoading(true);
    useUiStore.getState().openRightPanel('politics');
  },

  // ---- Transport response handling ----

  handleTransportResponse(msg: WsMessage): void {
    if (msg.type === WsMessageType.RESP_TRANSPORT_DATA) {
      useTransportStore.getState().setData((msg as WsRespTransportData).data);
    }
  },

  // ---- Connection picker ----

  showConnectionPicker(data: {
    fluidName: string;
    fluidId: string;
    direction: 'input' | 'output';
    buildingX: number;
    buildingY: number;
  }): void {
    useBuildingStore.getState().setConnectionPicker(data);
    useUiStore.getState().openModal('connectionPicker');
  },

  updateConnectionResults(results: ConnectionSearchResult[]): void {
    useBuildingStore.getState().setConnectionResults(results);
  },

  closeConnectionPicker(): void {
    useBuildingStore.getState().clearConnectionPicker();
    const uiState = useUiStore.getState();
    if (uiState.modal === 'connectionPicker') {
      uiState.closeModal();
    }
  },

  // ---- Company creation ----

  showCompanyCreationDialog(clusters: string[]): void {
    useGameStore.getState().setCompanyCreationClusters(clusters);
    useUiStore.getState().openModal('createCompany');
  },

  // ---- Reset ----

  reset(): void {
    useGameStore.getState().reset();
    useBuildingStore.getState().clearFocus();
    useSearchStore.getState().reset();
    usePoliticsStore.getState().reset();
    useTransportStore.getState().reset();
    useProfileStore.getState().reset();
  },
};
