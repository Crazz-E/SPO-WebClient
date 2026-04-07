/**
 * ClientBridge — Adapter between client.ts and React/Zustand.
 *
 * client.ts calls bridge methods to push state into Zustand stores.
 * React components read from stores and call ClientCallbacks (via
 * ClientContext) to trigger client.ts actions.
 */

import { useGameStore, type GameSettings, type ServerStartupState, type MapLoadingState, type DisconnectReason } from '../store/game-store';
import { useBuildingStore } from '../store/building-store';
import { useChatStore, type ChatUser } from '../store/chat-store';
import { useMailStore } from '../store/mail-store';
import { useProfileStore } from '../store/profile-store';
import { useSearchStore } from '../store/search-store';
import { usePoliticsStore } from '../store/politics-store';
import { useTransportStore } from '../store/transport-store';
import { useUiStore } from '../store/ui-store';
import { useEmpireStore } from '../store/empire-store';
import { useLogStore } from '../store/log-store';
import { showToast } from '../components/common/Toast';
import {
  SurfaceType,
} from '@/shared/types';
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
  ClusterInfo,
  ClusterFacilityPreview,

  BankActionType,
  AutoConnectionActionType,
  CurriculumActionType,
} from '@/shared/types';
import { CLUSTER_IDS } from '@/shared/cluster-data';
import { isCivicBuilding } from '@/shared/building-details/civic-buildings';
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
  type WsRespProfileCurriculumAction,
  type WsRespSearchMenuHome,
  type WsRespSearchMenuTowns,
  type WsRespSearchMenuPeopleSearch,
  type WsRespSearchMenuTycoonProfile,
  type WsRespSearchMenuRankings,
  type WsRespSearchMenuRankingDetail,
  type WsRespSearchMenuBanks,
  type WsRespPoliticsData,
  type WsRespTycoonRole,
  type WsRespTransportData,
  type WsRespEmpireFacilities,
} from '@/shared/types';

/**
 * World-to-screen coordinate converter — set by client.ts when renderer is ready.
 * Used by StatusOverlay to track building position during scroll/zoom.
 */
let worldToScreenFn: ((worldX: number, worldY: number) => { x: number; y: number }) | null = null;

export function setWorldToScreenFn(fn: (worldX: number, worldY: number) => { x: number; y: number }): void {
  worldToScreenFn = fn;
}

export function worldToScreen(worldX: number, worldY: number): { x: number; y: number } | null {
  return worldToScreenFn ? worldToScreenFn(worldX, worldY) : null;
}

/**
 * Centered world-to-screen converter — computes screen position at
 * the footprint center of a multi-tile building, plus its texture height
 * for dynamic vertical offset in the StatusOverlay.
 */
let worldToScreenCenteredFn: ((
  worldX: number, worldY: number,
  xsize: number, ysize: number
) => { x: number; y: number; textureHeight: number }) | null = null;

export function setWorldToScreenCenteredFn(
  fn: (worldX: number, worldY: number, xsize: number, ysize: number) => { x: number; y: number; textureHeight: number }
): void {
  worldToScreenCenteredFn = fn;
}

export function worldToScreenCentered(
  worldX: number, worldY: number,
  xsize: number, ysize: number
): { x: number; y: number; textureHeight: number } | null {
  return worldToScreenCenteredFn
    ? worldToScreenCenteredFn(worldX, worldY, xsize, ysize)
    : null;
}

/**
 * Callbacks that React UI can invoke on client.ts.
 * Registered during initialization.
 */
export interface ClientCallbacks {
  // Login flow
  onAuthCheck: (username: string, password: string) => void;
  onDirectoryConnect: (username: string, password: string, zonePath?: string) => void;
  onWorldSelect: (worldName: string) => void;
  onCompanySelect: (companyId: string) => void;
  onCreateCompany: () => void;
  onCreateCompanySubmit: (companyName: string, cluster: string) => Promise<void>;
  onRequestClusterInfo: (clusterName: string) => void;
  onRequestClusterFacilities: (cluster: string, folder: string) => void;

  // Server switch
  onSwitchServer: () => void;
  onCancelServerSwitch: () => void;
  onServerSwitchZoneSelect: (zonePath: string) => void;

  // Game actions
  onBuildRoad: () => void;
  onDemolishRoad: () => void;
  onRefreshMap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onToggleMinimap: () => void;
  onToggleDebugOverlay: () => void;
  onLogout: () => void;
  onTriggerReconnect: () => void;

  // Chat
  onSendChatMessage: (message: string) => void;
  onJoinChannel: (channelName: string) => void;

  // Build menu
  onRequestBuildingCategories: () => void;
  onRequestBuildingFacilities: (kind: string, cluster: string) => void;
  onPlaceBuilding: (facilityClass: string, visualClassId: string) => void;
  onBuildCapitol: () => void;
  onOpenCapitol: () => void;

  // Settings
  onSettingsChange: (settings: GameSettings) => void;

  // Building
  onSetBuildingProperty: (x: number, y: number, propertyName: string, value: string, additionalParams?: Record<string, string>) => void;
  onUpgradeBuilding: (x: number, y: number, action: string, count?: number) => void;
  onRefreshBuilding: (x: number, y: number) => void;
  onRequestTabData: (x: number, y: number, tabId: string, visualClass: string) => void;
  onRenameBuilding: (x: number, y: number, newName: string) => void;
  onDeleteBuilding: (x: number, y: number) => void;
  onNavigateToBuilding: (x: number, y: number) => void;
  onInspectFocusedBuilding: () => void;
  onBuildingAction: (actionId: string, rowData?: Record<string, string>) => void;
  onCloneFacility: (x: number, y: number, options: number) => void;
  onSearchConnections: (x: number, y: number, fluidId: string, fluidName: string, direction: 'input' | 'output') => void;
  onConnectionSearch: (buildingX: number, buildingY: number, fluidId: string, direction: 'input' | 'output', filters: { company?: string; town?: string; maxResults?: number; roles?: number }) => void;

  // Research / Inventions
  onResearchLoadInventory: (buildingX: number, buildingY: number, categoryIndex: number) => void;
  onResearchGetDetails: (buildingX: number, buildingY: number, inventionId: string) => void;
  onResearchQueueInvention: (buildingX: number, buildingY: number, inventionId: string) => void;
  onResearchCancelInvention: (buildingX: number, buildingY: number, inventionId: string) => void;
  onResearchFetchCategoryTabs: () => void;
  onConnectionConnect: (fluidId: string, direction: 'input' | 'output', selectedCoords: Array<{ x: number; y: number }>) => void;
  onDisconnectConnection: (buildingX: number, buildingY: number, fluidId: string, direction: 'input' | 'output', x: number, y: number) => void;

  // Mail
  onMailGetFolder: (folder: MailFolder) => void;
  onMailReadMessage: (messageId: string) => void;
  onMailSend: (to: string, subject: string, body: string) => void;
  onMailDelete: (messageId: string) => void;

  // Search menu
  onSearchMenuHome: () => void;
  onSearchMenuTowns: () => void;
  onSearchMenuPeopleSearch: (searchStr: string) => void;
  onSearchMenuTycoonProfile: (tycoonName: string) => void;
  onSearchMenuRankings: () => void;
  onSearchMenuRankingDetail: (rankingPath: string) => void;
  onSearchMenuBanks: () => void;

  // Profile tabs
  onProfileCurriculum: () => void;
  onProfileBank: () => void;
  onProfileProfitLoss: () => void;
  onProfileCompanies: () => void;
  onProfileAutoConnections: () => void;
  onProfilePolicy: () => void;

  // Profile actions
  onProfileBankAction: (action: BankActionType, amount?: string, toTycoon?: string, reason?: string, loanIndex?: number) => void;
  onProfileAutoConnectionAction: (action: AutoConnectionActionType, fluidId: string, suppliers?: string) => void;
  onProfilePolicySet: (tycoonName: string, status: number) => void;
  onProfileCurriculumAction: (action: CurriculumActionType, value?: boolean) => void;
  onProfileSwitchCompany: (companyId: number, companyName: string, ownerRole: string) => void;

  // Politics
  onRequestPoliticsData: (townName: string, buildingX: number, buildingY: number) => void;
  onLaunchCampaign: (buildingX: number, buildingY: number) => void;
  onCancelCampaign: (buildingX: number, buildingY: number) => void;
  onQueryTycoonRole: (tycoonName: string) => void;

  // Empire
  onRequestFacilities: () => void;

  // Zone painting
  onToggleZonePainting: (zoneType: number) => void;
  onCancelZonePainting: () => void;

  // Overlays
  onToggleCityZones: () => void;
  onSetOverlay: (surfaceType: SurfaceType | null) => void;

  // Mobile placement controls
  onCancelBuildingPlacement: () => void;
  onConfirmBuildingPlacement: () => void;
  onRotateCW: () => void;
}

/**
 * Store-pushing methods — called by client.ts message handler
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

  setZonePaintingMode(active: boolean): void {
    useGameStore.getState().setZonePaintingMode(active);
  },

  setSelectedZoneType(zoneType: number): void {
    useGameStore.getState().setSelectedZoneType(zoneType);
  },

  setPublicOfficeRole(isPublicOffice: boolean, role?: string): void {
    useGameStore.getState().setPublicOfficeRole(isPublicOffice, role);
  },

  setCityZonesEnabled(enabled: boolean): void {
    useGameStore.getState().setCityZonesEnabled(enabled);
  },

  setActiveOverlay(overlay: SurfaceType | null): void {
    useGameStore.getState().setActiveOverlay(overlay);
  },

  // ---- Connection state ----

  setConnecting(): void {
    useGameStore.getState().setStatus('connecting');
  },

  setConnected(): void {
    useGameStore.getState().setStatus('connected');
  },

  setDisconnected(reason?: DisconnectReason): void {
    if (reason) {
      useGameStore.getState().setDisconnectReason(reason);
    }
    useGameStore.getState().setStatus('disconnected');
  },

  setReconnecting(): void {
    useGameStore.getState().setStatus('reconnecting');
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
    useGameStore.getState().setLoginWorlds(worlds);
  },

  showCompanies(companies: CompanyInfo[]): void {
    useGameStore.getState().setLoginCompanies(companies);
  },

  setLoginLoading(loading: boolean): void {
    useGameStore.getState().setLoginLoading(loading);
  },

  setAuthError(error: { code: number; message: string } | null): void {
    useGameStore.getState().setAuthError(error);
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
    nobPoints?: number;
    area?: number;
    failureLevel?: number;
  }): void {
    useGameStore.getState().setTycoonStats(stats);
  },

  // ---- Build menu ----

  setBuildMenuCategories(categories: BuildingCategory[], capitolIconUrl?: string): void {
    useUiStore.getState().setBuildMenuCategories(categories, capitolIconUrl);
  },

  setBuildMenuFacilities(facilities: BuildingInfo[]): void {
    useUiStore.getState().setBuildMenuFacilities(facilities);
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

  /** Mark a property SET command as in-flight (optimistic feedback). */
  setPendingUpdate(key: string, value: string): void {
    useBuildingStore.getState().setPending(key, value);
  },

  /** Mark a property SET command as confirmed by server. */
  confirmPendingUpdate(key: string): void {
    useBuildingStore.getState().confirmPending(key);
  },

  /** Mark a property SET command as failed — triggers revert + error display. */
  failPendingUpdate(key: string, originalValue: string, error: string): void {
    useBuildingStore.getState().failPending(key, originalValue, error);
  },

  /** Show overlay above building (first click in two-click flow). */
  showBuildingOverlay(info: BuildingFocusInfo): void {
    const bld = useBuildingStore.getState();
    const ui = useUiStore.getState();
    // Clear stale details if inspector panel is currently showing another building
    if (ui.rightPanel === 'building' || ui.modal === 'buildingInspector') {
      bld.clearDetails();
    }
    bld.setFocus(info);
    bld.setOverlayMode(true);
  },

  /** Clear overlay without affecting the panel. */
  clearOverlay(): void {
    useBuildingStore.getState().clearOverlay();
  },

  /** Show the building panel (right panel for normal buildings, modal for civic buildings). */
  showBuildingPanel(details: BuildingDetailsResponse, currentCompanyName: string, focusInfo?: BuildingFocusInfo): void {
    const bld = useBuildingStore.getState();
    bld.setCurrentCompanyName(currentCompanyName);
    // Sync all owned company names so isOwner works across companies
    const companies = useGameStore.getState().companies;
    bld.setOwnedCompanyNames(new Set(companies.map(c => c.name)));
    if (focusInfo) {
      bld.setFocus(focusInfo);
    }
    bld.setOverlayMode(false);
    bld.setDetails(details);
    if (isCivicBuilding(details.visualClass)) {
      // Set politics store context so civic tabs (especially Ratings) have building coords
      const townGroup = details.groups['townGeneral'] ?? [];
      const townName = townGroup.find(p => p.name === 'Town')?.value ?? '';
      usePoliticsStore.getState().setTownContext(townName, details.x, details.y);
      useUiStore.getState().openModal('buildingInspector');
    } else {
      useUiStore.getState().openRightPanel('building');
    }
  },

  /** Update building details in-place (smart refresh). */
  updateBuildingDetails(details: BuildingDetailsResponse): void {
    // Reject stale data if the user already switched to a different building
    const current = useBuildingStore.getState().details;
    if (current && (current.x !== details.x || current.y !== details.y)) return;

    // R1: Tab-scoped refresh — merge only the refreshed groups into existing details,
    // keeping other groups intact. This avoids the corruption checks triggering
    // on intentionally partial responses.
    if (details.refreshedGroups && current?.groups) {
      const mergedGroups = { ...current.groups };
      for (const groupId of details.refreshedGroups) {
        if (details.groups[groupId]) {
          mergedGroups[groupId] = details.groups[groupId];
        }
      }
      const merged: BuildingDetailsResponse = {
        ...current,
        ...details,
        groups: mergedGroups,
        // Preserve lazy fields from previous full load
        supplies: details.supplies ?? current.supplies,
        products: details.products ?? current.products,
        compInputs: details.compInputs ?? current.compInputs,
        warehouseWares: details.warehouseWares ?? current.warehouseWares,
      };
      useBuildingStore.getState().setDetails(merged);
      return;
    }

    // Reject corrupted responses where Delphi returned empty properties
    // (race condition: temp object closed while refresh was in-flight).
    // Keep existing good data rather than overwriting with empty groups.
    const hasAnyGroupData = Object.values(details.groups).some(props => props.length > 0);
    if (!hasAnyGroupData && current?.groups) {
      ClientBridge.log('Building', 'Rejected refresh with empty property groups (corrupted response)');
      return;
    }

    // Reject partial corruption: if >90% of properties vanished, the refresh
    // likely read from a wrong SetPath context (supply gate instead of building root).
    // Legitimate changes (workers leaving, routes disconnecting) cause gradual drops,
    // not catastrophic loss.
    if (current?.groups) {
      const oldCount = Object.values(current.groups).reduce((sum, props) => sum + props.length, 0);
      const newCount = Object.values(details.groups).reduce((sum, props) => sum + props.length, 0);
      if (oldCount > 10 && newCount < oldCount * 0.1) {
        ClientBridge.log('Building', `Rejected refresh: property count dropped from ${oldCount} to ${newCount} (possible corruption)`);
        return;
      }
    }

    useBuildingStore.getState().setDetails(details);
  },

  /** Hide the building panel (right panel or modal). */
  hideBuildingPanel(): void {
    useBuildingStore.getState().clearFocus();
    const uiState = useUiStore.getState();
    if (uiState.modal === 'buildingInspector') {
      uiState.closeModal();
    } else if (uiState.rightPanel === 'building') {
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

  setChatUsers(users: ChatUser[]): void {
    useChatStore.getState().setUsers(users);
  },

  addChatUser(user: ChatUser): void {
    useChatStore.getState().addUser(user);
  },

  removeChatUser(userName: string): void {
    useChatStore.getState().removeUser(userName);
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
          mail.setFolder('Draft');
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
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE:
        // Acknowledges page ready — no data to store
        search.setLoading(false);
        break;
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH:
        search.setPeopleData(msg as WsRespSearchMenuPeopleSearch);
        break;
      case WsMessageType.RESP_SEARCH_MENU_TYCOON_PROFILE:
        search.setTycoonProfileData(msg as WsRespSearchMenuTycoonProfile);
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
        if (resp.result.success) profile.incrementRefresh();
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
        if (resp.success) profile.incrementRefresh();
        break;
      }
      case WsMessageType.RESP_PROFILE_POLICY:
        profile.setPolicy((msg as WsRespProfilePolicy).data);
        break;
      case WsMessageType.RESP_PROFILE_POLICY_SET: {
        const resp = msg as WsRespProfilePolicySet;
        showToast(resp.message || 'Policy updated', resp.success ? 'success' : 'error');
        if (resp.success) profile.incrementRefresh();
        break;
      }
      case WsMessageType.RESP_PROFILE_CURRICULUM_ACTION: {
        const resp = msg as WsRespProfileCurriculumAction;
        showToast(resp.message || 'Action completed', resp.success ? 'success' : 'error');
        if (resp.success) profile.incrementRefresh();
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

  handlePoliticsCampaignResponse(msg: WsMessage): void {
    const resp = msg as unknown as { success: boolean; message?: string };
    if (resp.success) {
      showToast(resp.message || 'Campaign updated', 'success');
    } else {
      showToast(resp.message || 'Campaign action failed', 'error');
    }
  },

  handleTycoonRoleResponse(msg: WsMessage): void {
    if (msg.type !== WsMessageType.RESP_TYCOON_ROLE) return;
    const resp = msg as WsRespTycoonRole;
    const store = usePoliticsStore.getState();
    store.setTycoonRole(resp.role);
    store.setRoleQueryPending(resp.role.tycoonName, false);

    // Update game-store for current user with authoritative cache data
    const gameState = useGameStore.getState();
    const currentUser = gameState.username;
    if (currentUser && resp.role.tycoonName.toLowerCase() === currentUser.toLowerCase()) {
      const isPresident = resp.role.isPresident || resp.role.isCapitalMayor;
      const isPublicOffice = resp.role.isMayor || isPresident || resp.role.isMinister;
      const roleName = isPresident ? 'President'
        : resp.role.isMayor ? 'Mayor'
        : resp.role.isMinister ? 'Minister'
        : '';
      gameState.setPublicOfficeRole(isPublicOffice, roleName);
    }
  },

  // ---- Transport response handling ----

  handleTransportResponse(msg: WsMessage): void {
    if (msg.type === WsMessageType.RESP_TRANSPORT_DATA) {
      useTransportStore.getState().setData((msg as WsRespTransportData).data);
    }
  },

  // ---- Empire ----

  handleEmpireResponse(msg: WsMessage): void {
    if (msg.type === WsMessageType.RESP_EMPIRE_FACILITIES) {
      useEmpireStore.getState().setFacilities((msg as WsRespEmpireFacilities).facilities);
    }
  },

  setEmpireLoading(loading: boolean): void {
    useEmpireStore.getState().setLoading(loading);
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

  // ---- Company creation / cluster browsing ----

  showCompanyCreationDialog(): void {
    useGameStore.getState().setCompanyCreationClusters([...CLUSTER_IDS]);
    useUiStore.getState().openModal('createCompany');
  },

  handleClusterInfoResponse(info: ClusterInfo): void {
    useGameStore.getState().setClusterInfo(info);
  },

  handleClusterFacilitiesResponse(facilities: ClusterFacilityPreview[]): void {
    useGameStore.getState().setClusterFacilities(facilities);
  },

  // ---- Server startup / map loading progress ----

  setServerStartupProgress(state: Partial<ServerStartupState>): void {
    useGameStore.getState().setServerStartup(state);
  },

  setMapLoadingProgress(state: Partial<MapLoadingState>): void {
    useGameStore.getState().setMapLoading(state);
  },

  // ---- Reset ----

  reset(): void {
    useGameStore.getState().reset();
    useBuildingStore.getState().clearFocus();
    useSearchStore.getState().reset();
    usePoliticsStore.getState().reset();
    useTransportStore.getState().reset();
    useProfileStore.getState().reset();
    useEmpireStore.getState().reset();
  },
};
