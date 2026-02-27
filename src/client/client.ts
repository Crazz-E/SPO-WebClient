import {
  WsMessageType,
  WsMessage,
  WsReqConnectDirectory,
  WsReqLoginWorld,
  WsRespConnectSuccess,
  WsRespLoginSuccess,
  WsRespError,
  WsEventChatMsg,
  WsRespMapData,
  WsReqMapLoad,
  WsReqSelectCompany,
  CompanyInfo,
  WsReqChatGetUsers,
  WsReqChatGetChannels,
  WsReqChatJoinChannel,
  WsReqChatSendMessage,
  WsReqChatTypingStatus,
  WsRespChatUserList,
  WsRespChatChannelList,
  WsEventChatUserTyping,
  WsEventChatChannelChange,
  WsEventChatUserListChange,
  WsReqBuildingFocus,
  WsReqBuildingUnfocus,
  WsRespBuildingFocus,
  WsEventBuildingRefresh,
  BuildingFocusInfo,
  WsEventTycoonUpdate,
  WsReqGetBuildingCategories,
  WsReqGetBuildingFacilities,
  WsReqPlaceBuilding,
  WsReqGetSurface,
  WsRespBuildingCategories,
  WsRespBuildingFacilities,
  WsRespSurfaceData,
  BuildingCategory,
  BuildingInfo,
  SurfaceType,
  WsReqGetAllFacilityDimensions,
  WsRespAllFacilityDimensions,
  FacilityDimensions,
  // Building Details
  WsReqBuildingDetails,
  WsRespBuildingDetails,
  WsReqBuildingSetProperty,
  WsRespBuildingSetProperty,
  BuildingDetailsResponse,
  // Building Upgrades
  WsReqBuildingUpgrade,
  WsRespBuildingUpgrade,
  // Building Rename
  WsReqRenameFacility,
  WsRespRenameFacility,
  // Building Deletion
  WsReqDeleteFacility,
  WsRespDeleteFacility,
  // Road Building
  WsReqBuildRoad,
  WsRespBuildRoad,
  WsReqDemolishRoad,
  WsRespDemolishRoad,
  // Company Switching
  WsReqSwitchCompany,
  // Logout
  WsReqLogout,
  WsRespLogout,
  // Mail
  WsReqMailConnect,
  WsReqMailGetFolder,
  WsReqMailReadMessage,
  WsReqMailCompose,
  WsReqMailDelete,
  WsReqMailGetUnreadCount,
  WsRespMailConnected,
  WsRespMailFolder,
  WsRespMailMessage,
  WsRespMailSent,
  WsRespMailDeleted,
  WsRespMailUnreadCount,
  WsEventNewMail,
  WsReqMailSaveDraft,
  WsRespMailDraftSaved,
  MailFolder,
  // Profile
  WsReqGetProfile,
  WsRespGetProfile,
  TycoonProfileFull,
  // Connection Search
  WsReqSearchConnections,
  WsRespSearchConnections,
  // Company Creation
  WsReqCreateCompany,
  WsRespCreateCompany,
  // Date
  WsEventRefreshDate,
} from '../shared/types';
import { getErrorMessage } from '../shared/error-codes';
import { toErrorMessage } from '../shared/error-utils';
import { Season } from '../shared/map-config';
import { MapNavigationUI } from './ui/map-navigation-ui';
import { MinimapUI } from './ui/minimap-ui';
import { ClientBridge, type ClientCallbacks } from './bridge/client-bridge';
import { useGameStore, delphiTDateTimeToJsDate } from './store/game-store';
import type { GameSettings } from './store/game-store';
import { useUiStore } from './store/ui-store';
import { useChatStore } from './store/chat-store';
import { useBuildingStore } from './store/building-store';
import { useMailStore } from './store/mail-store';
import { getFacilityDimensionsCache } from './facility-dimensions-cache';
import { SoundManager } from './audio/sound-manager';

// [E2E-DEBUG] Wire-level debug tracker exposed on window.__spoDebug
// To remove all E2E debug code: search for "[E2E-DEBUG]" and delete those lines/blocks
interface SpoDebugWire {
  sent: number;
  received: number;
  errors: number;
  lastSent: string;
  lastReceived: string;
  history: Array<{ dir: '→' | '←'; type: string; ts: number; reqId?: string }>;
  maxHistory: number;
  getState: (() => SpoDebugState) | null;
}

interface SpoDebugState {
  session: {
    connected: boolean;
    worldName: string;
    companyName: string;
    worldSize: { x: number | null; y: number | null };
  };
  renderer: {
    mapLoaded: boolean;
    zoom: number;
    rotation: string;
    cameraPosition: { x: number; y: number };
    buildingCount: number;
    segmentCount: number;
    mapDimensions: { width: number; height: number };
    debugMode: boolean;
    canvasSize: { width: number; height: number };
    canvasHasContent: boolean;
  } | null;
  panels: Record<string, boolean>;
  tycoonStats: Record<string, string>;
  chat: {
    visible: boolean;
    messageCount: number;
    lastMessage: string;
  };
  buildingDetails: {
    buildingName: string;
    ownerName: string;
    templateName: string;
    currentTab: string;
    tabs: Array<{ id: string; name: string }>;
    isOwner: boolean;
    coords: { x: number; y: number };
  } | null;
  settings: {
    hideVegetationOnMove: boolean;
    vehicleAnimations: boolean;
    soundEnabled: boolean;
    soundVolume: number;
    debugOverlay: boolean;
  } | null;
  wire: {
    sent: number;
    received: number;
    errors: number;
    lastSent: string;
    lastReceived: string;
  };
}

function initSpoDebug(): SpoDebugWire {
  const debug: SpoDebugWire = {
    sent: 0,
    received: 0,
    errors: 0,
    lastSent: '',
    lastReceived: '',
    history: [],
    maxHistory: 200,
    getState: null, // wired by StarpeaceClient constructor
  };
  (window as unknown as Record<string, unknown>).__spoDebug = debug;
  return debug;
}

function updateDebugBadge(debug: SpoDebugWire): void {
  const badge = document.getElementById('e2e-debug-badge');
  if (badge) {
    badge.textContent = `↑${debug.sent} ↓${debug.received}` + (debug.errors > 0 ? ` ✗${debug.errors}` : '');
    badge.style.color = debug.errors > 0 ? '#f44' : '#8f8';
  }
}

function appendConsoleEntry(dir: '→' | '←', type: string): void {
  const output = document.getElementById('console-output');
  if (!output) return;
  const el = document.createElement('div');
  el.textContent = `${dir} ${type}`;
  el.style.cssText = 'font-family:var(--font-mono);font-size:0.7rem;padding:1px 6px;color:#aaa;';
  output.appendChild(el);
  while (output.children.length > 200) output.removeChild(output.firstChild!);
}
// [/E2E-DEBUG]

export class StarpeaceClient {
  public readonly callbacks!: ClientCallbacks;

  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private pendingRequests = new Map<string, { resolve: (msg: WsMessage) => void, reject: (err: unknown) => void }>();

  // Canvas-level UI components (owned directly)
  private mapNavigationUI: MapNavigationUI | null = null;
  private minimapUI: MinimapUI | null = null;

  // UI Elements (kept for status only)
  private uiGamePanel: HTMLElement;

  // Session state
  private storedUsername = '';
  private storedPassword = '';
  private availableCompanies: CompanyInfo[] = [];
  private currentCompanyName: string = '';
  private currentWorldName: string = '';
  private worldXSize: number | null = null;
  private worldYSize: number | null = null;
  private savedPlayerX: number | undefined;
  private savedPlayerY: number | undefined;
  private worldSeason: number | null = null;

  // Building focus state
  private currentFocusedBuilding: BuildingFocusInfo | null = null;
  private currentFocusedVisualClass: string | null = null;

  // Building construction state
  private buildingCategories: BuildingCategory[] = [];
  private lastLoadedFacilities: BuildingInfo[] = [];
  private currentBuildingToPlace: BuildingInfo | null = null;

  // Double-click prevention flags
  private isFocusingBuilding: boolean = false;
  private isSendingChatMessage: boolean = false;
  private isJoiningChannel: boolean = false;
  private isSelectingCompany: boolean = false;

  // Clone facility state
  private isCloneMode: boolean = false;
  private cloneSourceBuilding: BuildingDetailsResponse | null = null;

  // Road building state
  private isRoadBuildingMode: boolean = false;
  private isBuildingRoad: boolean = false;
  private isRoadDemolishMode: boolean = false;

  // Logout state
  private isLoggingOut: boolean = false;

  // Audio
  private soundManager: SoundManager;


  private debugWire: SpoDebugWire; // [E2E-DEBUG]

  constructor() {
    this.uiGamePanel = document.getElementById('game-panel')!;

    this.debugWire = initSpoDebug(); // [E2E-DEBUG]
    this.debugWire.getState = () => this.getDebugState(); // [E2E-DEBUG]
    this.soundManager = new SoundManager();
    const callbacks: Partial<ClientCallbacks> = {
      onBuildRoad: () => this.toggleRoadBuildingMode(),
      onDemolishRoad: () => this.toggleRoadDemolishMode(),
      onRefreshMap: () => this.refreshMapData(),
      onZoomIn: () => this.mapNavigationUI?.getRenderer()?.zoomIn(),
      onZoomOut: () => this.mapNavigationUI?.getRenderer()?.zoomOut(),
      onToggleMinimap: () => { /* minimap is always visible */ },
      onToggleDebugOverlay: () => {
        const renderer = this.mapNavigationUI?.getRenderer();
        if (renderer) {
          renderer.debugMode = !renderer.debugMode;
          renderer.requestRender();
        }
      },
      onLogout: () => this.logout(),
      onSendChatMessage: (message: string) => this.sendChatMessage(message),
      onDirectoryConnect: (username: string, password: string, zonePath?: string) =>
        this.performDirectoryLogin(username, password, zonePath),
      onWorldSelect: (worldName: string) => this.login(worldName),
      onCompanySelect: (companyId: string) => this.selectCompanyAndStart(companyId),
      onCreateCompany: () => this.showCompanyCreationDialog(),
      onCreateCompanySubmit: (companyName: string, cluster: string) =>
        this.handleCreateCompany(companyName, cluster),
      onRequestBuildingCategories: () => this.openBuildMenu(),
      onRequestBuildingFacilities: (kind: number, cluster: string) =>
        this.loadBuildingFacilitiesByKind(kind, cluster),
      onPlaceBuilding: (facilityClass: string, visualClassId: number) =>
        this.placeBuildingFromMenu(facilityClass, visualClassId),
      onSettingsChange: (settings) => this.applySettings(settings),

      // Building actions (called from React BuildingInspector)
      onSetBuildingProperty: (x, y, propertyName, value, additionalParams) =>
        this.setBuildingProperty(x, y, propertyName, value, additionalParams),
      onUpgradeBuilding: (x, y, action, count) =>
        this.upgradeBuildingAction(x, y, action as 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE', count),
      onRefreshBuilding: (x, y) => this.refreshBuildingDetails(x, y),
      onRenameBuilding: (x, y, newName) => this.renameFacility(x, y, newName),
      onDeleteBuilding: (x, y) => this.deleteFacility(x, y).then(success => {
        if (success) ClientBridge.hideBuildingPanel();
      }),
      onNavigateToBuilding: (x, y) => this.focusBuilding(x, y),
      onBuildingAction: (actionId) => {
        const details = useBuildingStore.getState().details;
        if (details) this.handleBuildingAction(actionId, details);
      },
      onSearchConnections: (x, y, fluidId, fluidName, direction) => {
        ClientBridge.showConnectionPicker({ fluidName, fluidId, direction, buildingX: x, buildingY: y });
      },
      onConnectionSearch: (buildingX, buildingY, fluidId, direction, filters) => {
        useBuildingStore.getState().setConnectionSearching(true);
        this.searchConnections(buildingX, buildingY, fluidId, direction, filters);
      },
      onConnectionConnect: (fluidId, direction, selectedCoords) => {
        const picker = useBuildingStore.getState().connectionPicker;
        if (picker) {
          this.connectFacilities(picker.buildingX, picker.buildingY, fluidId, direction, selectedCoords);
        }
      },

      // Mail
      onMailGetFolder: (folder) => this.sendMessage({ type: WsMessageType.REQ_MAIL_GET_FOLDER, folder }),
      onMailReadMessage: (messageId) => this.sendMessage({
        type: WsMessageType.REQ_MAIL_READ_MESSAGE,
        folder: useMailStore.getState().currentFolder,
        messageId,
      }),
      onMailSend: (to, subject, body) => this.sendMessage({
        type: WsMessageType.REQ_MAIL_COMPOSE,
        to, subject, body: [body],
      }),
      onMailDelete: (messageId) => this.sendMessage({
        type: WsMessageType.REQ_MAIL_DELETE,
        folder: useMailStore.getState().currentFolder,
        messageId,
      }),

      // Search menu
      onSearchMenuHome: () => this.sendMessage({ type: WsMessageType.REQ_SEARCH_MENU_HOME }),
      onSearchMenuTowns: () => this.sendMessage({ type: WsMessageType.REQ_SEARCH_MENU_TOWNS }),
      onSearchMenuTycoonProfile: (tycoonName) => this.sendMessage({
        type: WsMessageType.REQ_SEARCH_MENU_TYCOON_PROFILE, tycoonName,
      }),
      onSearchMenuPeople: () => this.sendMessage({ type: WsMessageType.REQ_SEARCH_MENU_PEOPLE }),
      onSearchMenuPeopleSearch: (searchStr) => this.sendMessage({
        type: WsMessageType.REQ_SEARCH_MENU_PEOPLE_SEARCH, searchStr,
      }),
      onSearchMenuRankings: () => this.sendMessage({ type: WsMessageType.REQ_SEARCH_MENU_RANKINGS }),
      onSearchMenuRankingDetail: (rankingPath) => this.sendMessage({
        type: WsMessageType.REQ_SEARCH_MENU_RANKING_DETAIL, rankingPath,
      }),
      onSearchMenuBanks: () => this.sendMessage({ type: WsMessageType.REQ_SEARCH_MENU_BANKS }),

      // Profile tabs
      onProfileCurriculum: () => this.sendMessage({ type: WsMessageType.REQ_PROFILE_CURRICULUM }),
      onProfileBank: () => this.sendMessage({ type: WsMessageType.REQ_PROFILE_BANK }),
      onProfileProfitLoss: () => this.sendMessage({ type: WsMessageType.REQ_PROFILE_PROFITLOSS }),
      onProfileCompanies: () => this.sendMessage({ type: WsMessageType.REQ_PROFILE_COMPANIES }),
      onProfileAutoConnections: () => this.sendMessage({ type: WsMessageType.REQ_PROFILE_AUTOCONNECTIONS }),
      onProfilePolicy: () => this.sendMessage({ type: WsMessageType.REQ_PROFILE_POLICY }),

      // Profile actions
      onProfileBankAction: (action, amount, toTycoon, reason, loanIndex) => this.sendMessage({
        type: WsMessageType.REQ_PROFILE_BANK_ACTION, action, amount, toTycoon, reason, loanIndex,
      }),
      onProfileAutoConnectionAction: (action, fluidId, suppliers) => this.sendMessage({
        type: WsMessageType.REQ_PROFILE_AUTOCONNECTION_ACTION, action, fluidId, suppliers,
      }),
      onProfilePolicySet: (tycoonName, status) => this.sendMessage({
        type: WsMessageType.REQ_PROFILE_POLICY_SET, tycoonName, status,
      }),
      onProfileCurriculumAction: (action, value) => this.sendMessage({
        type: WsMessageType.REQ_PROFILE_CURRICULUM_ACTION, action, value,
      }),
      onProfileSwitchCompany: (companyId, companyName, ownerRole) => {
        const company: CompanyInfo = { id: String(companyId), name: companyName, ownerRole, cluster: '' };
        this.sendRequest({
          type: WsMessageType.REQ_SWITCH_COMPANY,
          company,
        } as WsReqSwitchCompany).then(() => {
          ClientBridge.setCompany(companyName, String(companyId));
          ClientBridge.showSuccess(`Switched to ${companyName}`);
        }).catch((err: unknown) => {
          ClientBridge.showError(`Failed to switch company: ${toErrorMessage(err)}`);
        });
      },

      // Politics
      onLaunchCampaign: (buildingX, buildingY) => this.sendMessage({
        type: WsMessageType.REQ_POLITICS_LAUNCH_CAMPAIGN,
        buildingX, buildingY,
      }),
    };

    this.callbacks = callbacks as ClientCallbacks;

    this.setupAudio();
    this.init();
  }

  /**
   * Initialize audio: unlock on first user interaction, wire settings
   */
  private setupAudio(): void {
    const initAudio = () => {
      this.soundManager.initOnInteraction();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
  }

  /**
   * Apply settings to renderer + sound manager, and persist to localStorage.
   */
  private applySettings(settings: GameSettings): void {
    // Apply to renderer
    if (this.mapNavigationUI) {
      const renderer = this.mapNavigationUI.getRenderer();
      if (renderer) {
        renderer.setHideVegetationOnMove(settings.hideVegetationOnMove);
        renderer.setDebugMode(settings.debugOverlay);
        renderer.setVehicleAnimationsEnabled(settings.vehicleAnimations);
      }
    }

    // Apply to sound manager
    this.soundManager.setEnabled(settings.soundEnabled);
    this.soundManager.setVolume(settings.soundVolume);

    // Persist to localStorage
    ClientBridge.persistSettings(settings);
  }

  /**
   * Configure les callbacks des composants Game UI
   */
  private setupGameUICallbacks() {
    // MapNavigationUI callbacks
    if (this.mapNavigationUI) {
      this.mapNavigationUI.setOnLoadZone((x, y, w, h) => {
        ClientBridge.log('Map', `Requesting zone (${x}, ${y}) ${w}x${h}`);
        this.loadMapArea(x, y, w, h);
      });

      this.mapNavigationUI.setOnBuildingClick((x, y, visualClass) => {
        this.handleMapClick(x, y, visualClass);
      });

      this.mapNavigationUI.setOnFetchFacilityDimensions(async (visualClass) => {
        return await this.getFacilityDimensions(visualClass);
      });
    }

    // buildMenuUI callbacks — migrated to React BuildMenu + bridge

    // ZoneOverlayUI removed — zone overlays are toggled via keyboard shortcuts (number keys)
  }

  private init() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    ClientBridge.log('System', `Connecting to Gateway at ${url}...`);

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected = true;
      ClientBridge.log('System', 'Gateway Connected.');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      ClientBridge.log('System', 'Gateway Disconnected.');
    };

    // Handle browser close/refresh - send logout request
    window.addEventListener('beforeunload', () => {
      this.sendLogoutBeacon();
    });
  }

  private sendRequest(msg: Partial<WsMessage>): Promise<WsMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isConnected) return reject(new Error('WebSocket not connected'));

      const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      msg.wsRequestId = requestId;
      this.pendingRequests.set(requestId, { resolve, reject });
      // [E2E-DEBUG] Log outgoing request
      this.debugWire.sent++;
      this.debugWire.lastSent = msg.type || '';
      this.debugWire.history.push({ dir: '→', type: msg.type || '?', ts: Date.now(), reqId: requestId });
      if (this.debugWire.history.length > this.debugWire.maxHistory) this.debugWire.history.shift();
      ClientBridge.log('Wire', `→ SEND ${msg.type} [${requestId.slice(-6)}]`);
      updateDebugBadge(this.debugWire);
      appendConsoleEntry('→', msg.type || '?');
      // [/E2E-DEBUG]
      this.ws.send(JSON.stringify(msg));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request Timeout'));
        }
      }, 15000);
    });
  }

  /**
   * Send message without Promise (for event-based responses like search menu)
   */
  private sendMessage(msg: Partial<WsMessage>): void {
    if (!this.ws || !this.isConnected) {
      console.error('[Client] Cannot send message: WebSocket not connected');
      return;
    }
    // [E2E-DEBUG] Log outgoing fire-and-forget message
    this.debugWire.sent++;
    this.debugWire.lastSent = msg.type || '';
    this.debugWire.history.push({ dir: '→', type: msg.type || '?', ts: Date.now() });
    if (this.debugWire.history.length > this.debugWire.maxHistory) this.debugWire.history.shift();
    ClientBridge.log('Wire', `→ SEND ${msg.type}`);
    updateDebugBadge(this.debugWire);
    appendConsoleEntry('→', msg.type || '?');
    // [/E2E-DEBUG]
    this.ws.send(JSON.stringify(msg));
  }

  private handleMessage(msg: WsMessage) {
    // [E2E-DEBUG] Log every incoming message
    const isError = msg.type === WsMessageType.RESP_ERROR;
    this.debugWire.received++;
    if (isError) this.debugWire.errors++;
    this.debugWire.lastReceived = msg.type;
    const reqTag = msg.wsRequestId ? ` [${msg.wsRequestId.slice(-6)}]` : '';
    this.debugWire.history.push({ dir: '←', type: msg.type, ts: Date.now(), reqId: msg.wsRequestId });
    if (this.debugWire.history.length > this.debugWire.maxHistory) this.debugWire.history.shift();
    ClientBridge.log('Wire', `← RECV ${msg.type}${reqTag}${isError ? ' ✗ERROR' : ''}`);
    updateDebugBadge(this.debugWire);
    appendConsoleEntry('←', msg.type + (isError ? ' ✗' : ''));
    // [/E2E-DEBUG]

    // 1. Pending Requests
    if (msg.wsRequestId && this.pendingRequests.has(msg.wsRequestId)) {
      const { resolve, reject } = this.pendingRequests.get(msg.wsRequestId)!;
      this.pendingRequests.delete(msg.wsRequestId);
      if (msg.type === WsMessageType.RESP_ERROR) {
        const errorResp = msg as WsRespError;
        const localizedMessage = getErrorMessage(errorResp.code);
        reject(new Error(localizedMessage));
      } else {
        resolve(msg);
      }
      return;
    }

    // 2. Events & Pushes
    switch (msg.type) {
      case WsMessageType.EVENT_CHAT_MSG: {
        const chat = msg as WsEventChatMsg;
        const isSystem = chat.from === 'SYSTEM';
        ClientBridge.addChatMessage(chat.channel, {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from: chat.from,
          text: chat.message,
          timestamp: Date.now(),
          isSystem,
          isGM: chat.from === 'GM',
        });
        ClientBridge.log('Chat', `[${chat.channel}] ${chat.from}: ${chat.message}`);
        this.soundManager.play('chat-message');
        break;
      }

      case WsMessageType.EVENT_CHAT_USER_TYPING: {
        const typing = msg as WsEventChatUserTyping;
        ClientBridge.setChatUserTyping(typing.username, typing.isTyping);
        break;
      }

      case WsMessageType.EVENT_CHAT_CHANNEL_CHANGE: {
        const channelChange = msg as WsEventChatChannelChange;
        ClientBridge.setCurrentChannel(channelChange.channelName);
        this.requestUserList();
        break;
      }

      case WsMessageType.EVENT_CHAT_USER_LIST_CHANGE:
        const userChange = msg as WsEventChatUserListChange;
        // User list will be refreshed on next request
        break;

      case WsMessageType.EVENT_MAP_DATA:
      case WsMessageType.RESP_MAP_DATA:
        const mapMsg = msg as WsRespMapData;
        ClientBridge.log('Map', `Received area (${mapMsg.data.x}, ${mapMsg.data.y}): ${mapMsg.data.buildings.length} buildings, ${mapMsg.data.segments.length} segments`);
        this.mapNavigationUI?.getRenderer()?.updateMapData(mapMsg.data);
        break;

      case WsMessageType.EVENT_BUILDING_REFRESH: {
        const refreshEvt = msg as WsEventBuildingRefresh;
        // If the refreshed building matches the one currently viewed, re-fetch details
        if (this.currentFocusedBuilding &&
            this.currentFocusedBuilding.buildingId === refreshEvt.building.buildingId) {
          this.requestBuildingDetails(
            this.currentFocusedBuilding.x,
            this.currentFocusedBuilding.y,
            this.currentFocusedVisualClass || '0'
          ).then(refreshedDetails => {
            if (refreshedDetails) {
              ClientBridge.updateBuildingDetails(refreshedDetails);
            }
          }).catch(err => {
            ClientBridge.log('Error', `Failed to refresh building: ${toErrorMessage(err)}`);
          });
        }
        break;
      }

        case WsMessageType.EVENT_TYCOON_UPDATE:
          const tycoonUpdate = msg as WsEventTycoonUpdate;
          this.currentTycoonData = {
            cash: tycoonUpdate.cash,
            incomePerHour: tycoonUpdate.incomePerHour,
            ranking: tycoonUpdate.ranking,
            buildingCount: tycoonUpdate.buildingCount,
            maxBuildings: tycoonUpdate.maxBuildings
          };
          ClientBridge.log('Tycoon', `Cash: ${tycoonUpdate.cash} | Income/h: ${tycoonUpdate.incomePerHour} | Rank: ${tycoonUpdate.ranking} | Buildings: ${tycoonUpdate.buildingCount}/${tycoonUpdate.maxBuildings}`);

          // --- UPDATE: Push stats to React TopBar via Zustand ---
          ClientBridge.updateTycoonStats({
            username: this.storedUsername,
            ...this.currentTycoonData,
            failureLevel: tycoonUpdate.failureLevel,
          });
        break;

      case WsMessageType.EVENT_RDO_PUSH:
        const pushData = (msg as any).rawPacket || msg;
        ClientBridge.log('Push', `Received: ${JSON.stringify(pushData).substring(0, 100)}...`);
        break;

      case WsMessageType.EVENT_END_OF_PERIOD:
        ClientBridge.log('Period', 'Financial period ended — refreshing data');
        this.showNotification('Financial period ended', 'info');
        this.soundManager.play('period-end');
        // Refresh tycoon stats to reflect latest P&L
        this.refreshTycoonData();
        break;

      case WsMessageType.EVENT_REFRESH_DATE: {
        const dateEvent = msg as WsEventRefreshDate;
        useGameStore.getState().setGameDate(delphiTDateTimeToJsDate(dateEvent.dateDouble));
        break;
      }

      // Mail Events
      case WsMessageType.EVENT_NEW_MAIL: {
        const newMail = msg as WsEventNewMail;
        ClientBridge.log('Mail', `New mail! ${newMail.unreadCount} unread message(s)`);
        this.soundManager.play('mail');
        ClientBridge.setMailUnreadCount(newMail.unreadCount);
        break;
      }

      // Mail Responses (delegated to mail panel)
      case WsMessageType.RESP_MAIL_CONNECTED: {
        const mailConn = msg as WsRespMailConnected;
        ClientBridge.log('Mail', `Mail service connected. ${mailConn.unreadCount} unread.`);
        ClientBridge.setMailUnreadCount(mailConn.unreadCount);
        break;
      }

      case WsMessageType.RESP_MAIL_FOLDER:
      case WsMessageType.RESP_MAIL_MESSAGE:
      case WsMessageType.RESP_MAIL_SENT:
      case WsMessageType.RESP_MAIL_DELETED:
      case WsMessageType.RESP_MAIL_UNREAD_COUNT:
      case WsMessageType.RESP_MAIL_DRAFT_SAVED:
        ClientBridge.handleMailResponse(msg);
        break;

      // Search Menu Responses
      case WsMessageType.RESP_SEARCH_MENU_HOME:
      case WsMessageType.RESP_SEARCH_MENU_TOWNS:
      case WsMessageType.RESP_SEARCH_MENU_TYCOON_PROFILE:
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE:
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH:
      case WsMessageType.RESP_SEARCH_MENU_RANKINGS:
      case WsMessageType.RESP_SEARCH_MENU_RANKING_DETAIL:
      case WsMessageType.RESP_SEARCH_MENU_BANKS:
        ClientBridge.handleSearchMenuResponse(msg);
        break;

      // Profile Tab Responses (delegated to profile panel)
      case WsMessageType.RESP_PROFILE_CURRICULUM:
      case WsMessageType.RESP_PROFILE_BANK:
      case WsMessageType.RESP_PROFILE_BANK_ACTION:
      case WsMessageType.RESP_PROFILE_PROFITLOSS:
      case WsMessageType.RESP_PROFILE_COMPANIES:
      case WsMessageType.RESP_PROFILE_AUTOCONNECTIONS:
      case WsMessageType.RESP_PROFILE_AUTOCONNECTION_ACTION:
      case WsMessageType.RESP_PROFILE_POLICY:
      case WsMessageType.RESP_PROFILE_POLICY_SET:
      case WsMessageType.RESP_PROFILE_CURRICULUM_ACTION:
        ClientBridge.handleProfileResponse(msg);
        break;

      // Politics Response
      case WsMessageType.RESP_POLITICS_DATA:
        ClientBridge.handlePoliticsResponse(msg);
        break;

      // Transport Response
      case WsMessageType.RESP_TRANSPORT_DATA:
        ClientBridge.handleTransportResponse(msg);
        break;

      // Connection Search Response
      case WsMessageType.RESP_SEARCH_CONNECTIONS: {
        const searchResp = msg as WsRespSearchConnections;
        ClientBridge.updateConnectionResults(searchResp.results);
        break;
      }

      // Profile Response
      case WsMessageType.RESP_GET_PROFILE: {
        const profile = (msg as WsRespGetProfile).profile;
        ClientBridge.log('Profile', `Profile loaded: ${profile.name} (${profile.levelName})`);
        const baseStats = this.currentTycoonData ?? {
          cash: profile.budget,
          incomePerHour: '0',
          ranking: profile.ranking,
          buildingCount: profile.facCount,
          maxBuildings: profile.facMax,
        };
        ClientBridge.updateTycoonStats({
          username: this.storedUsername,
          ...baseStats,
          prestige: profile.prestige,
          levelName: profile.levelName,
          levelTier: profile.levelTier,
          area: profile.area,
        });
        // Update profile store with full tycoon data
        ClientBridge.setProfile(profile);
        break;
      }

      // Error responses without wsRequestId (from fire-and-forget messages like search menu)
      case WsMessageType.RESP_ERROR: {
        const errorResp = msg as WsRespError;
        ClientBridge.log('Error', errorResp.errorMessage || 'Unknown error');
        ClientBridge.handleSearchMenuError(errorResp.errorMessage || 'Request failed');
        break;
      }
    }
  }

  // --- Actions ---

  private async performDirectoryLogin(username: string, password: string, zonePath?: string) {
    this.storedUsername = username;
    this.storedPassword = password;
    const zoneDisplay = zonePath?.split('/').pop() || 'BETA';
    ClientBridge.log('Directory', `Authenticating for ${zoneDisplay}...`);

    try {
      const req: WsReqConnectDirectory = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        username,
        password,
        zonePath
      };

      const resp = (await this.sendRequest(req)) as WsRespConnectSuccess;
      ClientBridge.log('Directory', `Authentication Success. Found ${resp.worlds.length} world(s) in ${zoneDisplay}.`);
      ClientBridge.showWorlds(resp.worlds);
    } catch (err: unknown) {
      ClientBridge.log('Error', `Directory Auth Failed: ${toErrorMessage(err)}`);
      alert('Login Failed: ' + toErrorMessage(err));
    }
  }

  private async login(worldName: string) {
    if (!this.storedUsername || !this.storedPassword) {
      alert('Session lost, please reconnect');
      return;
    }

    ClientBridge.log('Login', `Joining world ${worldName}...`);
    // React LoginScreen already sets isLoading=true before calling onWorldSelect
    this.currentWorldName = worldName;

    try {
      const req: WsReqLoginWorld = {
        type: WsMessageType.REQ_LOGIN_WORLD,
        username: this.storedUsername,
        password: this.storedPassword,
        worldName
      };
      const resp = (await this.sendRequest(req)) as WsRespLoginSuccess;
      ClientBridge.log('Login', `Success! Tycoon: ${resp.tycoonId}`);

      // Store world properties from InterfaceServer
      if (resp.worldXSize !== undefined) this.worldXSize = resp.worldXSize;
      if (resp.worldYSize !== undefined) this.worldYSize = resp.worldYSize;
      if (resp.worldSeason !== undefined) this.worldSeason = resp.worldSeason;

      if (resp.companies && resp.companies.length > 0) {
        this.availableCompanies = resp.companies;
        ClientBridge.log('Login', `Found ${resp.companies.length} compan${resp.companies.length > 1 ? 'ies' : 'y'}`);

        ClientBridge.showCompanies(resp.companies || []);
      } else {
        ClientBridge.log('Error', 'No companies found - cannot proceed');
        this.showNotification('No companies available for this account', 'error');
      }

    } catch (err: unknown) {
      ClientBridge.log('Error', `Login failed: ${toErrorMessage(err)}`);
      ClientBridge.setLoginLoading(false);
      this.showNotification(`World login failed: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async selectCompanyAndStart(companyId: string) {
    // Double-click prevention
    if (this.isSelectingCompany) {
      return;
    }

    this.isSelectingCompany = true;
    ClientBridge.log('Company', `Selecting company ID: ${companyId}...`);
    // React LoginScreen already sets isLoading=true before calling onCompanySelect

    try {
      // Find the selected company
      const company = this.availableCompanies.find(c => c.id === companyId);

      if (!company) {
        throw new Error('Company not found');
      }

      // Check if we need to switch company (role-based)
      const needsSwitch = company.ownerRole && company.ownerRole !== this.storedUsername;

      if (needsSwitch) {
        ClientBridge.log('Company', `Switching to role-based company: ${company.name} (${company.ownerRole})...`);

        // Use switchCompany instead of selectCompany
        const req: WsReqSwitchCompany = {
          type: WsMessageType.REQ_SWITCH_COMPANY,
          company: company
        };

        await this.sendRequest(req);
        ClientBridge.log('Company', 'Company switch successful');
      } else {
        // Normal company selection
        const req: WsReqSelectCompany = {
          type: WsMessageType.REQ_SELECT_COMPANY,
          companyId
        };

        const selectResp = await this.sendRequest(req);
        ClientBridge.log('Company', 'Company selected successfully');

        // Restore camera to player's last saved position (Bug 14)
        const respAny = selectResp as Record<string, unknown>;
        if (typeof respAny.playerX === 'number' && typeof respAny.playerY === 'number'
            && (respAny.playerX !== 0 || respAny.playerY !== 0)) {
          this.savedPlayerX = respAny.playerX;
          this.savedPlayerY = respAny.playerY;
          ClientBridge.log('Map', `Restoring camera to saved position (${this.savedPlayerX}, ${this.savedPlayerY})`);
        }
      }

      // Store company name for building construction
      this.currentCompanyName = company.name;

      // Preload all facility dimensions (one-time, ~15KB)
      await this.preloadFacilityDimensions();

      // Switch to game view — set React status to 'connected' so App.tsx
      // routes from LoginScreen to GameScreen
      ClientBridge.setConnected();
      ClientBridge.setWorld(this.currentWorldName);
      ClientBridge.setCompany(company.name, company.id);
      this.switchToGameView();

      // Apply server WorldSeason to renderer (overrides default SUMMER)
      if (this.worldSeason !== null) {
        const renderer = this.mapNavigationUI?.getRenderer();
        if (renderer) {
          renderer.setSeason(this.worldSeason as Season);
        }
      }

      // Center camera on saved position if available
      if (this.savedPlayerX !== undefined && this.savedPlayerY !== undefined) {
        const renderer = this.mapNavigationUI?.getRenderer();
        if (renderer) {
          renderer.centerOn(this.savedPlayerX, this.savedPlayerY);
        }
      }

      // Connect to mail service (non-blocking, fire-and-forget)
      this.connectMailService().catch(err => {
        ClientBridge.log('Mail', `Mail service connection failed: ${toErrorMessage(err)}`);
      });

      // Fetch extended tycoon profile (non-blocking)
      this.getProfile().catch(err => {
        ClientBridge.log('Profile', `Profile fetch failed: ${toErrorMessage(err)}`);
      });

      // Initialize chat channels after login (non-blocking)
      this.initChatChannels().catch(err => {
        ClientBridge.log('Chat', `Chat init failed: ${toErrorMessage(err)}`);
      });

      // NOTE: Initial map area is loaded by the zone system via triggerZoneCheck()
      // Do NOT call loadMapArea() here to avoid duplicate requests
    } catch (err: unknown) {
      ClientBridge.log('Error', `Company selection failed: ${toErrorMessage(err)}`);
      ClientBridge.setLoginLoading(false);
      this.showNotification(`Company selection failed: ${toErrorMessage(err)}`, 'error');
    } finally {
      this.isSelectingCompany = false;
    }
  }

  private showCompanyCreationDialog(): void {
    // Known clusters — could be fetched from server in future
    const defaultClusters = ['PGI', 'Moab', 'Dissidents', 'Magna', 'Mariko'];
    ClientBridge.showCompanyCreationDialog(defaultClusters);
  }

  private async handleCreateCompany(companyName: string, cluster: string): Promise<void> {
    const req: WsReqCreateCompany = {
      type: WsMessageType.REQ_CREATE_COMPANY,
      companyName,
      cluster,
    };

    const resp = await this.sendRequest(req) as WsRespCreateCompany;
    ClientBridge.log('Company', `Company created: "${resp.companyName}" (ID: ${resp.companyId})`);
    this.showNotification(`Company "${resp.companyName}" created!`, 'success');
    this.soundManager.play('notification');

    // Add new company to list and auto-select it
    this.availableCompanies.push({
      id: resp.companyId,
      name: resp.companyName,
      ownerRole: this.storedUsername,
    });
    this.selectCompanyAndStart(resp.companyId);
  }

  private loadMapArea(x?: number, y?: number, w: number = 64, h: number = 64) {
    const coords = x !== undefined && y !== undefined ? ` at (${x}, ${y})` : ' at player position';
    ClientBridge.log('Map', `Loading area${coords} ${w}x${h}...`);

    // Use provided coordinates or 0,0 (server will use player position)
    const req: WsReqMapLoad = {
      type: WsMessageType.REQ_MAP_LOAD,
      x: x !== undefined ? x : 0,
      y: y !== undefined ? y : 0,
      width: w,
      height: h
    };

    // NOTE: Uses send() without awaiting response because response arrives via EVENT_MAP_DATA
    this.ws?.send(JSON.stringify(req));
  }

  private switchToGameView() {
    // React App.tsx switches to GameScreen when status becomes 'connected'
    this.uiGamePanel.style.display = 'flex';
    this.uiGamePanel.style.flexDirection = 'column';

    // Initialize Map & Navigation
    this.mapNavigationUI = new MapNavigationUI(this.uiGamePanel, this.currentWorldName);
    this.mapNavigationUI.init();
    this.setupGameUICallbacks();

    // Tycoon stats: push initial username to React TopBar via Zustand
    ClientBridge.updateTycoonStats({
      username: this.storedUsername,
      cash: '0', incomePerHour: '0', ranking: 0, buildingCount: 0, maxBuildings: 0,
    });

    // Create minimap and wire to renderer
    this.minimapUI = new MinimapUI();
    const renderer = this.mapNavigationUI.getRenderer();
    if (renderer) {
      this.minimapUI.setRenderer(renderer);
    }

    // Load persisted settings and apply to renderer + sound
    ClientBridge.loadPersistedSettings();
    const initialSettings = ClientBridge.getSettings();
    this.applySettings(initialSettings);

    ClientBridge.log('Renderer', 'Game view initialized');
  }

  // --- Chat Functions ---

  private async sendChatMessage(message: string) {
    // Double-click prevention
    if (this.isSendingChatMessage) {
      return;
    }

    // GM chat: messages starting with /gm are broadcast to all players
    if (message.startsWith('/gm ')) {
      const gmMessage = message.substring(4).trim();
      if (gmMessage) {
        this.sendMessage({
          type: WsMessageType.REQ_GM_CHAT_SEND,
          message: gmMessage,
        } as WsMessage);
      }
      return;
    }

    this.isSendingChatMessage = true;

    try {
      const req: WsReqChatSendMessage = {
        type: WsMessageType.REQ_CHAT_SEND_MESSAGE,
        message
      };
      await this.sendRequest(req);
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to send message: ${toErrorMessage(err)}`);
    } finally {
      this.isSendingChatMessage = false;
    }
  }

  private sendTypingStatus(isTyping: boolean) {
    const req: WsReqChatTypingStatus = {
      type: WsMessageType.REQ_CHAT_TYPING_STATUS,
      isTyping
    };
    this.ws?.send(JSON.stringify(req));
  }

  private async requestUserList() {
    try {
      const req: WsReqChatGetUsers = {
        type: WsMessageType.REQ_CHAT_GET_USERS
      };
      const resp = (await this.sendRequest(req)) as WsRespChatUserList;

      ClientBridge.setChatUsers(resp.users);
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to get user list: ${toErrorMessage(err)}`);
    }
  }

  private async initChatChannels(): Promise<void> {
    await this.requestChannelList();
    const { channels } = useChatStore.getState();
    if (channels.length > 0) {
      await this.joinChannel(channels[0]);
    }
  }

  private async requestChannelList() {
    try {
      const req: WsReqChatGetChannels = {
        type: WsMessageType.REQ_CHAT_GET_CHANNELS
      };
      const resp = (await this.sendRequest(req)) as WsRespChatChannelList;

      ClientBridge.setChatChannels(resp.channels);
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to get channel list: ${toErrorMessage(err)}`);
    }
  }

  private async joinChannel(channelName: string) {
    // Double-click prevention
    if (this.isJoiningChannel) {
      return;
    }

    this.isJoiningChannel = true;

    try {
      ClientBridge.log('Chat', `Joining channel: ${channelName || 'Lobby'}`);
      const req: WsReqChatJoinChannel = {
        type: WsMessageType.REQ_CHAT_JOIN_CHANNEL,
        channelName
      };
      await this.sendRequest(req);

      // React ChatStrip shows messages per-channel from store — no clearing needed
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to join channel: ${toErrorMessage(err)}`);
    } finally {
      this.isJoiningChannel = false;
    }
  }

  // --- Building Focus Functions ---

  /**
   * Handle map clicks - delegates to placement or focus based on mode
   */
  private handleMapClick(x: number, y: number, visualClass?: string) {
    if (this.currentBuildingToPlace) {
      this.placeBuilding(x, y);
    } else if (this.isCloneMode) {
      this.executeCloneFacility(x, y);
    } else {
      this.focusBuilding(x, y, visualClass);
    }
  }

  private async focusBuilding(x: number, y: number, visualClass?: string) {
    // Double-click prevention
    if (this.isFocusingBuilding) {
      return;
    }

    this.isFocusingBuilding = true;
    ClientBridge.log('Building', `Requesting focus at (${x}, ${y})`);

    try {
      // Auto-unfocus previous building
      if (this.currentFocusedBuilding) {
        await this.unfocusBuilding();
      }

      const req: WsReqBuildingFocus = {
        type: WsMessageType.REQ_BUILDING_FOCUS,
        x,
        y
      };

      const response = await this.sendRequest(req) as WsRespBuildingFocus;

      this.currentFocusedBuilding = response.building;
      this.currentFocusedVisualClass = visualClass || null;

      // Request detailed building info using visualClass from ObjectsInArea
      const details = await this.requestBuildingDetails(x, y, visualClass || '0');
      // Show building in React panel via ClientBridge
      const displayDetails = details ?? {
        buildingId: response.building.buildingId || '',
        buildingName: response.building.buildingName || 'Building',
        ownerName: response.building.ownerName || 'Unknown',
        x,
        y,
        visualClass: visualClass || '0',
        templateName: 'Building',
        securityId: '',
        groups: {
          generic: [
            { name: 'Name', value: response.building.buildingName },
            { name: 'Owner', value: response.building.ownerName },
            { name: 'Revenue', value: response.building.revenue },
          ]
        },
        timestamp: Date.now()
      } as BuildingDetailsResponse;

      ClientBridge.showBuildingPanel(displayDetails, this.currentCompanyName, response.building);

      ClientBridge.log('Building', `Focused: ${response.building.buildingName}`);

    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to focus building: ${toErrorMessage(err)}`);
    } finally {
      this.isFocusingBuilding = false;
    }
  }

  private async unfocusBuilding() {
    if (!this.currentFocusedBuilding) return;

    ClientBridge.log('Building', 'Unfocusing building');

    try {
      const req: WsReqBuildingUnfocus = {
        type: WsMessageType.REQ_BUILDING_UNFOCUS
      };
      this.ws?.send(JSON.stringify(req));

      ClientBridge.hideBuildingPanel();
      this.currentFocusedBuilding = null;
      this.currentFocusedVisualClass = null;
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to unfocus building: ${toErrorMessage(err)}`);
    }
  }

  private currentTycoonData: {
    cash: string;
    incomePerHour: string;
    ranking: number;
    buildingCount: number;
    maxBuildings: number;
  } | null = null;

  // =========================================================================
  // BUILDING DETAILS METHODS
  // =========================================================================

  /**
   * Request detailed building information
   */
  public async requestBuildingDetails(
    x: number,
    y: number,
    visualClass: string
  ): Promise<BuildingDetailsResponse | null> {
    ClientBridge.log('Building', `Requesting details at (${x}, ${y})`);

    try {
      const req: WsReqBuildingDetails = {
        type: WsMessageType.REQ_BUILDING_DETAILS,
        x,
        y,
        visualClass
      };

      const response = await this.sendRequest(req) as WsRespBuildingDetails;
      ClientBridge.log('Building', `Got details: ${response.details.templateName}`);
      return response.details;
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to get building details: ${toErrorMessage(err)}`);
      return null;
    }
  }

  /**
   * Re-fetch building details and update the panel in-place
   */
  private async refreshBuildingDetails(x: number, y: number): Promise<void> {
    const details = await this.requestBuildingDetails(x, y, '0');
    if (details) {
      ClientBridge.updateBuildingDetails(details);
    }
  }

  /**
   * Set a building property value for editable properties
   * propertyName is now the RDO command name (e.g., 'RDOSetPrice', 'RDOSetSalaries')
   */
  public async setBuildingProperty(
    x: number,
    y: number,
    propertyName: string,
    value: string,
    additionalParams?: Record<string, string>
  ): Promise<boolean> {
    ClientBridge.log('Building', `Setting ${propertyName}=${value} at (${x}, ${y})`);

    try {
      const req: WsReqBuildingSetProperty = {
        type: WsMessageType.REQ_BUILDING_SET_PROPERTY,
        x,
        y,
        propertyName, // This is now the RDO command name
        value,
        additionalParams
      };

      const response = await this.sendRequest(req) as WsRespBuildingSetProperty;

      if (response.success) {
        ClientBridge.log('Building', `Property ${propertyName} updated to ${response.newValue}`);
        return true;
      } else {
        ClientBridge.log('Error', `Failed to set ${propertyName}`);
        return false;
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to set property: ${toErrorMessage(err)}`);
      return false;
    }
  }

  /**
   * Upgrade or downgrade a building
   */
  public async upgradeBuildingAction(
    x: number,
    y: number,
    action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE',
    count?: number
  ): Promise<boolean> {
    const actionName = action === 'DOWNGRADE' ? 'Downgrading' :
                       action === 'START_UPGRADE' ? `Starting ${count} upgrade(s)` :
                       'Stopping upgrade';
    ClientBridge.log('Building', `${actionName} at (${x}, ${y})`);

    try {
      const req: WsReqBuildingUpgrade = {
        type: WsMessageType.REQ_BUILDING_UPGRADE,
        x,
        y,
        action,
        count
      };

      const response = await this.sendRequest(req) as WsRespBuildingUpgrade;

      if (response.success) {
        ClientBridge.log('Building', response.message || 'Upgrade action completed');
        return true;
      } else {
        ClientBridge.log('Error', response.message || 'Failed to perform upgrade action');
        return false;
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to perform upgrade action: ${toErrorMessage(err)}`);
      return false;
    }
  }

  /**
   * Rename a facility (building)
   */
  public async renameFacility(x: number, y: number, newName: string): Promise<boolean> {
    ClientBridge.log('Building', `Renaming building at (${x}, ${y}) to "${newName}"`);

    try {
      const req: WsReqRenameFacility = {
        type: WsMessageType.REQ_RENAME_FACILITY,
        x,
        y,
        newName
      };

      const response = await this.sendRequest(req) as WsRespRenameFacility;

      if (response.success) {
        ClientBridge.log('Building', `Building renamed to "${response.newName}"`);
        return true;
      } else {
        ClientBridge.log('Error', response.message || 'Failed to rename building');
        return false;
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to rename building: ${toErrorMessage(err)}`);
      return false;
    }
  }

  /**
   * Delete a facility (building)
   */
  public async deleteFacility(x: number, y: number): Promise<boolean> {
    ClientBridge.log('Building', `Deleting building at (${x}, ${y})`);

    try {
      const req: WsReqDeleteFacility = {
        type: WsMessageType.REQ_DELETE_FACILITY,
        x,
        y
      };

      const response = await this.sendRequest(req) as WsRespDeleteFacility;

      if (response.success) {
        ClientBridge.log('Building', 'Building deleted successfully');
        // Refresh the map to remove the deleted building (use building coordinates as center)
        this.loadMapArea(x, y);
        return true;
      } else {
        ClientBridge.log('Error', response.message || 'Failed to delete building');
        return false;
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to delete building: ${toErrorMessage(err)}`);
      return false;
    }
  }

  // =========================================================================
  // BUILDING ACTION BUTTON HANDLERS
  // =========================================================================

  private handleBuildingAction(actionId: string, buildingDetails: BuildingDetailsResponse): void {
    if (actionId === 'visitPolitics') {
      const townName = buildingDetails.groups['townGeneral']
        ?.find(p => p.name === 'Town')?.value || '';
      ClientBridge.showPoliticsPanel(townName, buildingDetails.x, buildingDetails.y);
    } else if (actionId === 'clone') {
      this.startCloneFacility(buildingDetails);
    } else if (actionId === 'launchMovie') {
      this.launchMovie(buildingDetails);
    } else if (actionId === 'cancelMovie') {
      this.cancelMovie(buildingDetails);
    } else if (actionId === 'releaseMovie') {
      this.releaseMovie(buildingDetails);
    } else if (actionId === 'vote') {
      this.voteForCandidate(buildingDetails);
    } else if (actionId === 'banMinister') {
      this.banMinister(buildingDetails);
    } else if (actionId === 'sitMinister') {
      this.sitMinister(buildingDetails);
    } else if (actionId === 'startRepair') {
      this.startRepair(buildingDetails);
    } else if (actionId === 'stopRepair') {
      this.stopRepair(buildingDetails);
    } else if (actionId === 'queueResearch') {
      this.queueResearch(buildingDetails);
    } else if (actionId === 'cancelResearch') {
      this.cancelResearch(buildingDetails);
    } else {
      console.warn(`[Client] Unhandled building action: ${actionId}`);
      this.showNotification(`Action "${actionId}" is not yet implemented`, 'error');
    }
  }

  // =========================================================================
  // CLONE FACILITY
  // =========================================================================

  private async startCloneFacility(buildingDetails: BuildingDetailsResponse): void {
    this.isCloneMode = true;
    this.cloneSourceBuilding = buildingDetails;

    // Get facility dimensions from the source building's visual class
    let xsize = 1;
    let ysize = 1;
    try {
      const dimensions = await this.getFacilityDimensions(buildingDetails.visualClass);
      if (dimensions) {
        xsize = dimensions.xsize;
        ysize = dimensions.ysize;
      }
    } catch (err) {
      console.error('Failed to fetch facility dimensions for clone:', err);
    }

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(true, `Clone: ${buildingDetails.buildingName}`, 0, 0, '', xsize, ysize, buildingDetails.visualClass);
    }

    this.setupCloneKeyboardHandler();
    this.showNotification(`Click on map to clone ${buildingDetails.buildingName}. Press ESC to cancel.`, 'info');
  }

  private setupCloneKeyboardHandler(): void {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isCloneMode) {
        this.cancelCloneMode();
        document.removeEventListener('keydown', handler);
      }
    };
    document.addEventListener('keydown', handler);
  }

  private cancelCloneMode(): void {
    this.isCloneMode = false;
    this.cloneSourceBuilding = null;

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(false);
    }
  }

  private async executeCloneFacility(targetX: number, targetY: number): Promise<void> {
    if (!this.cloneSourceBuilding) return;

    const source = this.cloneSourceBuilding;
    ClientBridge.log('Clone', `Cloning ${source.buildingName} to (${targetX}, ${targetY})...`);

    try {
      await this.setBuildingProperty(source.x, source.y, 'CloneFacility', '0', {
        x: String(targetX),
        y: String(targetY),
        tycoonId: '0',
        limitToTown: '0',
        limitToCompany: '0',
      });

      this.showNotification(`${source.buildingName} cloned successfully!`, 'success');
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to clone facility: ${toErrorMessage(err)}`);
      this.showNotification('Failed to clone facility', 'error');
    } finally {
      this.cancelCloneMode();
    }
  }

  // =========================================================================
  // FILM ACTIONS (Launch / Cancel / Release Movie)
  // =========================================================================

  private async launchMovie(buildingDetails: BuildingDetailsResponse): Promise<void> {
    const filmName = prompt('Movie name:');
    if (!filmName) return;
    const budgetStr = prompt('Budget ($):', '1000000');
    if (!budgetStr) return;
    const monthsStr = prompt('Production months:', '12');
    if (!monthsStr) return;

    // Read current AutoRel/AutoProd toggles from building data
    const filmsGroup = buildingDetails.groups['films'] || [];
    const autoRel = filmsGroup.find(p => p.name === 'AutoRel')?.value || '0';
    const autoProd = filmsGroup.find(p => p.name === 'AutoProd')?.value || '0';

    try {
      await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RDOLaunchMovie', '0', {
        filmName,
        budget: budgetStr,
        months: monthsStr,
        autoRel,
        autoProd,
      });
      this.showNotification(`Launching movie: ${filmName}`, 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Failed to launch movie: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async cancelMovie(buildingDetails: BuildingDetailsResponse): Promise<void> {
    if (!confirm('Cancel current movie production?')) return;
    try {
      await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RDOCancelMovie', '0');
      this.showNotification('Movie production cancelled', 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Failed to cancel movie: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async releaseMovie(buildingDetails: BuildingDetailsResponse): Promise<void> {
    try {
      await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RDOReleaseMovie', '0');
      this.showNotification('Movie released!', 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Failed to release movie: ${toErrorMessage(err)}`, 'error');
    }
  }

  // =========================================================================
  // VOTE FOR CANDIDATE
  // =========================================================================

  private async voteForCandidate(buildingDetails: BuildingDetailsResponse): Promise<void> {
    // Get candidate list from the Votes group data
    const votesData = buildingDetails.groups['votes'];
    if (!votesData) {
      this.showNotification('No voting data available', 'error');
      return;
    }

    // Collect candidate names from the table data
    const candidateNames: string[] = [];
    for (const prop of votesData) {
      if (prop.name.startsWith('Candidate') && !prop.name.includes('Count')) {
        const match = prop.name.match(/^Candidate(\d+)$/);
        if (match && prop.value) {
          candidateNames.push(prop.value);
        }
      }
    }

    if (candidateNames.length === 0) {
      this.showNotification('No candidates available', 'error');
      return;
    }

    const candidateChoice = prompt(
      `Vote for a candidate:\n${candidateNames.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\nEnter candidate number:`
    );
    if (!candidateChoice) return;

    const idx = parseInt(candidateChoice, 10) - 1;
    if (idx < 0 || idx >= candidateNames.length) {
      this.showNotification('Invalid candidate number', 'error');
      return;
    }

    const candidateName = candidateNames[idx];
    this.ws?.send(JSON.stringify({
      type: WsMessageType.REQ_POLITICS_VOTE,
      buildingX: buildingDetails.x,
      buildingY: buildingDetails.y,
      candidateName,
    }));
    this.showNotification(`Voted for ${candidateName}`, 'success');
  }

  // =========================================================================
  // MINISTRY ACTIONS (Ban / Sit Minister)
  // =========================================================================

  private async banMinister(buildingDetails: BuildingDetailsResponse): Promise<void> {
    const ministryIdStr = prompt('Ministry ID to depose minister from:');
    if (!ministryIdStr) return;
    try {
      await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RDOBanMinister', '0', {
        ministryId: ministryIdStr,
      });
      this.showNotification('Minister deposed', 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Failed to depose minister: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async sitMinister(buildingDetails: BuildingDetailsResponse): Promise<void> {
    const ministryIdStr = prompt('Ministry ID to appoint minister for:');
    if (!ministryIdStr) return;
    const ministerName = prompt('Minister name to appoint:');
    if (!ministerName) return;
    try {
      await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RDOSitMinister', '0', {
        ministryId: ministryIdStr,
        ministerName,
      });
      this.showNotification(`${ministerName} appointed as minister`, 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Failed to appoint minister: ${toErrorMessage(err)}`, 'error');
    }
  }

  // =========================================================================
  // REPAIR ACTIONS (Start / Stop Repair)
  // =========================================================================

  private async startRepair(buildingDetails: BuildingDetailsResponse): Promise<void> {
    try {
      await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RdoRepair', '0');
      this.showNotification('Repair started', 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Failed to start repair: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async stopRepair(buildingDetails: BuildingDetailsResponse): Promise<void> {
    try {
      await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RdoStopRepair', '0');
      this.showNotification('Repair stopped', 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Failed to stop repair: ${toErrorMessage(err)}`, 'error');
    }
  }

  // =========================================================================
  // RESEARCH ACTIONS
  // =========================================================================

  private async queueResearch(_buildingDetails: BuildingDetailsResponse): Promise<void> {
    // Research system requires an invention selection UI that doesn't exist yet.
    // Sending empty inventionId would silently fail on the server.
    this.showNotification('Research queue is not yet available', 'info');
  }

  private async cancelResearch(_buildingDetails: BuildingDetailsResponse): Promise<void> {
    // Research system requires knowing which invention to cancel.
    // Sending empty inventionId would silently fail on the server.
    this.showNotification('Research cancellation is not yet available', 'info');
  }

  // =========================================================================
  // CONNECTION PICKER (Find Suppliers / Find Clients)
  // =========================================================================

  private searchConnections(
    buildingX: number,
    buildingY: number,
    fluidId: string,
    direction: 'input' | 'output',
    filters?: { company?: string; town?: string; maxResults?: number; roles?: number }
  ): void {
    const req: WsReqSearchConnections = {
      type: WsMessageType.REQ_SEARCH_CONNECTIONS,
      buildingX,
      buildingY,
      fluidId,
      direction,
      filters,
    };
    this.ws?.send(JSON.stringify(req));
  }

  private async connectFacilities(
    buildingX: number,
    buildingY: number,
    fluidId: string,
    direction: 'input' | 'output',
    selectedCoords: Array<{ x: number; y: number }>
  ): Promise<void> {
    if (selectedCoords.length === 0) return;

    // Build connection list: "x1,y1,x2,y2,..." format
    const connectionList = selectedCoords.map(c => `${c.x},${c.y}`).join(',');

    const rdoCommand = direction === 'input' ? 'RDOConnectInput' : 'RDOConnectOutput';

    try {
      await this.setBuildingProperty(buildingX, buildingY, rdoCommand, '0', {
        fluidId,
        connectionList,
      });

      this.showNotification(
        `Connected ${selectedCoords.length} ${direction === 'input' ? 'supplier' : 'client'}${selectedCoords.length !== 1 ? 's' : ''}`,
        'success'
      );

      // Refresh building details to show new connections
      const visualClass = this.currentFocusedVisualClass || '0';
      const refreshedDetails = await this.requestBuildingDetails(buildingX, buildingY, visualClass);
      if (refreshedDetails) {
        ClientBridge.updateBuildingDetails(refreshedDetails);
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to connect: ${toErrorMessage(err)}`);
      this.showNotification('Failed to connect facilities', 'error');
    }
  }

  // =========================================================================
  // ROAD BUILDING METHODS
  // =========================================================================

  /**
   * Toggle road building mode
   */
  public toggleRoadBuildingMode(): void {
    this.isRoadBuildingMode = !this.isRoadBuildingMode;

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setRoadDrawingMode(this.isRoadBuildingMode);

      // Setup callbacks when entering road mode
      if (this.isRoadBuildingMode) {
        // Cancel any building placement mode
        if (this.currentBuildingToPlace) {
          this.cancelBuildingPlacement();
        }

        renderer.setRoadSegmentCompleteCallback((x1, y1, x2, y2) => {
          this.buildRoadSegment(x1, y1, x2, y2);
        });

        renderer.setCancelRoadDrawingCallback(() => {
          this.cancelRoadBuildingMode();
        });

        // Setup ESC key handler
        this.setupRoadBuildingKeyboardHandler();

        ClientBridge.log('Road', 'Road building mode enabled. Click and drag to draw roads. Right-click or press ESC to cancel.');
      } else {
        ClientBridge.log('Road', 'Road building mode disabled');
      }
    }

    ClientBridge.setRoadBuildingMode(this.isRoadBuildingMode);
  }

  /**
   * Cancel road building mode
   */
  private cancelRoadBuildingMode(): void {
    this.isRoadBuildingMode = false;

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setRoadDrawingMode(false);
    }

    ClientBridge.setRoadBuildingMode(false);

    ClientBridge.log('Road', 'Road building mode cancelled');
  }

  /**
   * Build a road segment between two points
   */
  private async buildRoadSegment(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    // Prevent multiple simultaneous road building requests
    if (this.isBuildingRoad) {
      return;
    }

    // Validate road path before sending to server
    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      const validation = renderer.validateRoadPath(x1, y1, x2, y2);
      if (!validation.valid) {
        ClientBridge.log('Road', `Cannot build road: ${validation.error}`);
        this.showNotification(validation.error || 'Invalid road placement', 'error');
        return;
      }
    }

    this.isBuildingRoad = true;
    ClientBridge.log('Road', `Building road from (${x1}, ${y1}) to (${x2}, ${y2})...`);

    try {
      const req: WsReqBuildRoad = {
        type: WsMessageType.REQ_BUILD_ROAD,
        x1,
        y1,
        x2,
        y2
      };

      const response = await this.sendRequest(req) as WsRespBuildRoad;

      if (response.success) {
        ClientBridge.log('Road', `Road built: ${response.tileCount} tiles, cost $${response.cost}`);
        // Refresh the map to show the new road (use road start as center)
        this.loadMapArea(x1, y1);
      } else {
        ClientBridge.log('Error', response.message || 'Failed to build road');
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to build road: ${toErrorMessage(err)}`);
    } finally {
      this.isBuildingRoad = false;
    }
  }

  /**
   * Check if road building mode is active
   */
  public isRoadModeActive(): boolean {
    return this.isRoadBuildingMode;
  }

  // =========================================================================
  // ROAD DEMOLITION METHODS
  // =========================================================================

  /**
   * Toggle road demolition mode
   */
  public toggleRoadDemolishMode(): void {
    this.isRoadDemolishMode = !this.isRoadDemolishMode;

    // Cancel road building mode if active
    if (this.isRoadDemolishMode && this.isRoadBuildingMode) {
      this.cancelRoadBuildingMode();
    }

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      if (this.isRoadDemolishMode) {
        // Cancel any building placement
        if (this.currentBuildingToPlace) {
          this.cancelBuildingPlacement();
        }

        renderer.setRoadDemolishClickCallback((x: number, y: number) => {
          this.demolishRoadAt(x, y);
        });

        ClientBridge.log('Road', 'Road demolish mode enabled. Click on a road segment to demolish it. Press ESC to cancel.');
      } else {
        renderer.setRoadDemolishClickCallback(null);
        ClientBridge.log('Road', 'Road demolish mode disabled');
      }
    }

    ClientBridge.setRoadDemolishMode(this.isRoadDemolishMode);
  }

  /**
   * Cancel road demolition mode
   */
  private cancelRoadDemolishMode(): void {
    this.isRoadDemolishMode = false;

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setRoadDemolishClickCallback(null);
    }

    ClientBridge.setRoadDemolishMode(false);
  }

  /**
   * Demolish a road segment at (x, y)
   */
  private async demolishRoadAt(x: number, y: number): Promise<void> {
    ClientBridge.log('Road', `Demolishing road at (${x}, ${y})...`);

    try {
      const req: WsReqDemolishRoad = {
        type: WsMessageType.REQ_DEMOLISH_ROAD,
        x,
        y
      };

      const response = await this.sendRequest(req) as WsRespDemolishRoad;

      if (response.success) {
        ClientBridge.log('Road', `Road demolished at (${x}, ${y})`);
        this.showNotification('Road demolished', 'success');
        // Refresh the map to remove the demolished road
        this.loadMapArea(x, y);
      } else {
        ClientBridge.log('Error', response.message || 'Failed to demolish road');
        this.showNotification(response.message || 'Failed to demolish road', 'error');
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to demolish road: ${toErrorMessage(err)}`);
      this.showNotification(`Failed to demolish road: ${toErrorMessage(err)}`, 'error');
    }
  }

  // =========================================================================
  // BUILDING CONSTRUCTION METHODS
  // =========================================================================

  /**
   * Open the build menu and fetch building categories
   */
  private async openBuildMenu() {
    if (!this.currentCompanyName) {
      ClientBridge.log('Error', 'No company selected');
      return;
    }

    ClientBridge.log('Build', 'Opening build menu...');

    try {
      const req: WsReqGetBuildingCategories = {
        type: WsMessageType.REQ_GET_BUILDING_CATEGORIES,
        companyName: this.currentCompanyName
      };

      const response = await this.sendRequest(req) as WsRespBuildingCategories;
      this.buildingCategories = response.categories;

      ClientBridge.setBuildMenuCategories(response.categories);

      ClientBridge.log('Build', `Loaded ${response.categories.length} building categories`);
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to load building categories: ${toErrorMessage(err)}`);
    }
  }

  /**
   * Load facilities for a specific category
   */
  private async loadBuildingFacilities(category: BuildingCategory) {
    ClientBridge.log('Build', `Loading facilities for ${category.kindName}...`);

    try {
      const req: WsReqGetBuildingFacilities = {
        type: WsMessageType.REQ_GET_BUILDING_FACILITIES,
        companyName: this.currentCompanyName,
        cluster: category.cluster,
        kind: category.kind,
        kindName: category.kindName,
        folder: category.folder,
        tycoonLevel: category.tycoonLevel
      };

      const response = await this.sendRequest(req) as WsRespBuildingFacilities;
      this.lastLoadedFacilities = response.facilities;

      ClientBridge.setBuildMenuFacilities(response.facilities);

      ClientBridge.log('Build', `Loaded ${response.facilities.length} facilities`);
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to load facilities: ${toErrorMessage(err)}`);
    }
  }

  /**
   * Load facilities by kind/cluster (React build menu callback)
   */
  private async loadBuildingFacilitiesByKind(kind: number, cluster: string) {
    const category = this.buildingCategories.find(c => c.kind === kind && c.cluster === cluster);
    if (!category) {
      ClientBridge.log('Error', `Category not found: kind=${kind}, cluster=${cluster}`);
      return;
    }
    await this.loadBuildingFacilities(category);
  }

  /**
   * Place a building from React build menu selection
   */
  private placeBuildingFromMenu(facilityClass: string, visualClassId: number) {
    const facility = this.lastLoadedFacilities.find(
      f => f.facilityClass === facilityClass && f.visualClassId === visualClassId
    );
    if (!facility) {
      ClientBridge.log('Error', `Facility not found: ${facilityClass}`);
      return;
    }
    this.startBuildingPlacement(facility);
  }

  /**
   * Preload all facility dimensions (called once on startup)
   */
  private async preloadFacilityDimensions(): Promise<void> {
    ClientBridge.log('Cache', 'Preloading facility dimensions...');

    try {
      const req: WsReqGetAllFacilityDimensions = {
        type: WsMessageType.REQ_GET_ALL_FACILITY_DIMENSIONS
      };

      const response = await this.sendRequest(req) as WsRespAllFacilityDimensions;

      // Initialize client-side cache
      const cache = getFacilityDimensionsCache();
      cache.initialize(response.dimensions);

      ClientBridge.log('Cache', `Loaded ${cache.getSize()} facility dimensions`);
    } catch (err: unknown) {
      console.error('[Client] Failed to preload facility dimensions:', err);
      ClientBridge.log('Error', 'Failed to load facility dimensions. Building placement may not work correctly.');
    }
  }

  /**
   * Get facility dimensions from local cache (instant lookup, no network request)
   */
  private async getFacilityDimensions(visualClass: string): Promise<FacilityDimensions | null> {
    const cache = getFacilityDimensionsCache();

    if (!cache.isInitialized()) {
      console.warn('[Client] Facility cache not initialized yet');
      return null;
    }

    return cache.getFacility(visualClass) || null;
  }

  /**
   * Start building placement mode
   */
  private async startBuildingPlacement(building: BuildingInfo) {
    this.currentBuildingToPlace = building;
    ClientBridge.log('Build', `Placing ${building.name}. Click on map to build.`);

    // Fetch facility dimensions using VisualClassId (numeric ID from CLASSES.BIN)
    // Per Voyager original: VisualClassId is the lookup key, facilityClass is only for the RDO call
    let xsize = 1;
    let ysize = 1;
    try {
      const dimensions = await this.getFacilityDimensions(building.visualClassId);
      if (dimensions) {
        xsize = dimensions.xsize;
        ysize = dimensions.ysize;
      }
    } catch (err) {
      console.error('Failed to fetch facility dimensions:', err);
    }

    // Show placement help notification
    this.showNotification(`${building.name} placement mode - Click map to place, ESC to cancel`, 'info');

    // Enable placement mode in renderer
    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(
        true,
        building.name,
        building.cost,
        building.area,
        building.zoneRequirement,
        xsize,
        ysize,
        building.visualClassId
      );
    }

    // Set placement callbacks
    const callbackRenderer = this.mapNavigationUI?.getRenderer();
    if (callbackRenderer) {
      callbackRenderer.setPlacementConfirmCallback((x, y) => {
        this.placeBuilding(x, y);
      });
      callbackRenderer.setCancelPlacementCallback(() => {
        this.cancelBuildingPlacement();
      });
    }

    // Setup ESC key to cancel placement
    this.setupPlacementKeyboardHandler();
  }


  /**
   * Setup keyboard handler for placement mode
   */
  private setupPlacementKeyboardHandler() {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.currentBuildingToPlace) {
          this.cancelBuildingPlacement();
          document.removeEventListener('keydown', handler);
        } else if (this.isRoadBuildingMode) {
          this.cancelRoadBuildingMode();
          document.removeEventListener('keydown', handler);
        } else if (this.isRoadDemolishMode) {
          this.cancelRoadDemolishMode();
          document.removeEventListener('keydown', handler);
        }
      }
    };
    document.addEventListener('keydown', handler);
  }

  /**
   * Setup global ESC handler for road building mode
   * Called when entering road building mode
   */
  private setupRoadBuildingKeyboardHandler() {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isRoadBuildingMode) {
        this.cancelRoadBuildingMode();
        document.removeEventListener('keydown', handler);
      }
    };
    document.addEventListener('keydown', handler);
  }

  /**
   * Place a building at coordinates
   */
  private async placeBuilding(x: number, y: number) {
    if (!this.currentBuildingToPlace) return;

    const building = this.currentBuildingToPlace;
    ClientBridge.log('Build', `Placing ${building.name} at (${x}, ${y})...`);

    try {
      const req: WsReqPlaceBuilding = {
        type: WsMessageType.REQ_PLACE_BUILDING,
        facilityClass: building.facilityClass,
        x,
        y
      };

      await this.sendRequest(req);

      // Show success message
      ClientBridge.log('Build', `✓ Successfully placed ${building.name}!`);
      this.showNotification(`${building.name} built successfully!`, 'success');

      // Reload the map area to show the new building
      this.loadMapArea(x, y);

      // Exit placement mode
      this.cancelBuildingPlacement();
    } catch (err: unknown) {
      // Show detailed error message
      const errorMsg = toErrorMessage(err);
      ClientBridge.log('Error', `✗ Failed to place ${building.name}: ${errorMsg}`);
      this.showNotification(`Failed to place building: ${errorMsg}`, 'error');

      // Don't exit placement mode on error - let user try again or cancel manually
    }
  }

  /**
   * Cancel building placement mode
   */
  private cancelBuildingPlacement() {
    this.currentBuildingToPlace = null;

    // Remove placement notification
    const notification = document.getElementById('placement-notification');
    if (notification) {
      notification.remove();
    }

    // Disable placement mode in renderer
    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(false);
    }

    // No need to restore callback - handleMapClick already checks currentBuildingToPlace state
  }

  /**
   * Show a temporary notification to the user
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
    if (type === 'success') ClientBridge.showSuccess(message);
    else if (type === 'error') ClientBridge.showError(message);
    else ClientBridge.showInfo(message);
  }

  /**
   * Toggle zone overlay
   */
  private async toggleZoneOverlay(enabled: boolean, type: SurfaceType) {
    ClientBridge.log('Zones', enabled ? `Enabling ${type} overlay` : 'Disabling overlay');

    const renderer = this.mapNavigationUI?.getRenderer();
    if (!renderer) return;

    if (!enabled) {
      renderer.setZoneOverlay(false);
      return;
    }

    try {
      // Get current camera position to request zone data
      const cameraPos = renderer.getCameraPosition();
      const cameraX = Math.floor(cameraPos.x);
      const cameraY = Math.floor(cameraPos.y);

      // Request 65x65 area centered on camera
      const x1 = cameraX - 32;
      const y1 = cameraY - 32;
      const x2 = cameraX + 32;
      const y2 = cameraY + 32;

      const req: WsReqGetSurface = {
        type: WsMessageType.REQ_GET_SURFACE,
        surfaceType: type,
        x1,
        y1,
        x2,
        y2
      };

      const response = await this.sendRequest(req) as WsRespSurfaceData;
      renderer.setZoneOverlay(true, response.data, x1, y1);

      ClientBridge.log('Zones', `Loaded ${type} overlay data`);
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to load zone overlay: ${toErrorMessage(err)}`);
      // Disable overlay on error
      renderer.setZoneOverlay(false);
    }
  }

  // =========================================================================
  // MAP REFRESH METHODS
  // =========================================================================

  /**
   * Refresh map data - re-request segments and objects in area
   * Called when user clicks the refresh button
   */
  public refreshMapData(): void {
    ClientBridge.log('Map', 'Refreshing map data...');

    // Get current camera position from renderer
    const renderer = this.mapNavigationUI?.getRenderer();
    if (!renderer || !renderer.getCameraPosition) {
      ClientBridge.log('Error', 'Cannot refresh: renderer not available');
      return;
    }

    // Get camera position and invalidate visible area
    const cameraPos = renderer.getCameraPosition();
    const x = Math.floor(cameraPos.x);
    const y = Math.floor(cameraPos.y);

    // Invalidate 128x128 area around camera (2x2 zones)
    renderer.invalidateArea(x - 64, y - 64, x + 64, y + 64);

    // Trigger zone check to reload invalidated zones
    renderer.triggerZoneCheck();

    this.showNotification('Map refreshed', 'info');
  }

  // =========================================================================
  // LOGOUT METHODS
  // =========================================================================

  /**
   * Logout from the game - sends Logoff to server
   * Called when user clicks logout button
   */
  // =========================================================================
  // MAIL SERVICE
  // =========================================================================

  public async connectMailService(): Promise<void> {
    const req: WsReqMailConnect = { type: WsMessageType.REQ_MAIL_CONNECT };
    this.sendMessage(req);
  }

  public async getMailFolder(folder: MailFolder): Promise<void> {
    const req: WsReqMailGetFolder = { type: WsMessageType.REQ_MAIL_GET_FOLDER, folder };
    this.sendMessage(req);
  }

  public async readMailMessage(folder: MailFolder, messageId: string): Promise<void> {
    const req: WsReqMailReadMessage = { type: WsMessageType.REQ_MAIL_READ_MESSAGE, folder, messageId };
    this.sendMessage(req);
  }

  public async composeMail(to: string, subject: string, body: string[], headers?: string): Promise<void> {
    const req: WsReqMailCompose = { type: WsMessageType.REQ_MAIL_COMPOSE, to, subject, body, headers };
    this.sendMessage(req);
  }

  public async saveDraft(to: string, subject: string, body: string[], headers?: string, existingDraftId?: string): Promise<void> {
    const req: WsReqMailSaveDraft = { type: WsMessageType.REQ_MAIL_SAVE_DRAFT, to, subject, body, headers, existingDraftId };
    this.sendMessage(req);
  }

  public async deleteMailMessage(folder: MailFolder, messageId: string): Promise<void> {
    const req: WsReqMailDelete = { type: WsMessageType.REQ_MAIL_DELETE, folder, messageId };
    this.sendMessage(req);
  }

  public async getMailUnreadCount(): Promise<void> {
    const req: WsReqMailGetUnreadCount = { type: WsMessageType.REQ_MAIL_GET_UNREAD_COUNT };
    this.sendMessage(req);
  }

  // =========================================================================
  // PROFILE
  // =========================================================================

  public async getProfile(): Promise<void> {
    const req: WsReqGetProfile = { type: WsMessageType.REQ_GET_PROFILE };
    this.sendMessage(req);
  }

  /**
   * Refresh tycoon financial data (e.g., after EndOfPeriod push)
   */
  private refreshTycoonData(): void {
    this.getProfile().catch(err => {
      ClientBridge.log('Error', `Failed to refresh tycoon data: ${toErrorMessage(err)}`);
    });
  }

  public async logout(): Promise<void> {
    if (this.isLoggingOut) {
      return;
    }

    this.isLoggingOut = true;
    ClientBridge.log('System', 'Logging out...');

    try {
      const req: WsReqLogout = {
        type: WsMessageType.REQ_LOGOUT
      };

      const response = await this.sendRequest(req) as WsRespLogout;

      if (response.success) {
        ClientBridge.log('System', 'Logged out successfully');
        // Server will close the WebSocket connection
        // onclose handler will update UI state
      } else {
        ClientBridge.log('Error', response.message || 'Logout failed');
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Logout error: ${toErrorMessage(err)}`);
      // Force close connection on error
      this.ws?.close();
    } finally {
      this.isLoggingOut = false;
    }
  }

  /**
   * Send logout request as a beacon when page is closing
   * Uses sendBeacon for reliable delivery during page unload
   */
  private sendLogoutBeacon(): void {
    if (!this.isConnected || !this.ws) {
      return;
    }

    // Try to send a synchronous close message
    // WebSocket doesn't support sendBeacon, so we send message and close
    try {
      const req: WsReqLogout = {
        type: WsMessageType.REQ_LOGOUT
      };
      this.ws.send(JSON.stringify(req));
    } catch (err) {
      // Ignore errors during page unload
    }
  }

  // [E2E-DEBUG] Expose full game state for programmatic E2E verification
  private getDebugState(): SpoDebugState {
    const renderer = this.mapNavigationUI?.getRenderer() ?? null;
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;

    let canvasHasContent = false;
    if (canvas) {
      try {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const sample = ctx.getImageData(
            Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1
          );
          canvasHasContent = sample.data[3] > 0; // alpha > 0 means drawn
        }
      } catch (_) { /* security or empty canvas */ }
    }

    // Panel visibility — query React ui-store for panel state
    const uiState = useUiStore.getState();
    const panels: Record<string, boolean> = {
      login: useGameStore.getState().status !== 'connected',
      chat: useChatStore.getState().isExpanded,
      mail: uiState.rightPanel === 'mail',
      profile: uiState.leftPanel === 'empire',
      politics: uiState.rightPanel === 'politics',
      settings: uiState.modal === 'settings',
      transport: uiState.rightPanel === 'transport',
      minimap: this.minimapUI?.isVisible() ?? false,
      buildMenu: uiState.modal === 'buildMenu',
      buildingDetails: uiState.rightPanel === 'building',
      searchMenu: uiState.rightPanel === 'search',
    };

    // Tycoon stats from Zustand game store
    const rawStats = useGameStore.getState().tycoonStats;
    const tycoonStats: Record<string, string> = {
      ranking:  rawStats ? `#${rawStats.ranking}` : '',
      buildings: rawStats ? `${rawStats.buildingCount}/${rawStats.maxBuildings}` : '',
      cash:     rawStats?.cash ?? '',
      income:   rawStats ? `${rawStats.incomePerHour}/h` : '',
      prestige: rawStats?.prestige !== undefined ? String(rawStats.prestige) : '',
      area:     rawStats?.area !== undefined ? String(rawStats.area) : '',
      debt:     '',
    };

    // Chat info from Zustand chat store
    const chatStoreState = useChatStore.getState();
    const channelMsgs = chatStoreState.messages[chatStoreState.currentChannel] ?? [];
    const lastMsg = channelMsgs[channelMsgs.length - 1]?.text ?? '';

    // Access private renderer internals via cast (debug-only, not for production)
    const rendererAny = renderer as unknown as Record<string, unknown> | null;
    const terrainRenderer = rendererAny?.terrainRenderer as Record<string, unknown> | undefined;
    const ROTATION_NAMES = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const rotation = typeof terrainRenderer?.getRotation === 'function'
      ? (ROTATION_NAMES[terrainRenderer.getRotation() as number] ?? 'UNKNOWN') : 'UNKNOWN';

    // Building details panel introspection (from Zustand store)
    const bldState = useBuildingStore.getState();
    const bdDetails = bldState.details;
    const buildingDetails = panels.buildingDetails && bdDetails ? {
      buildingName: bdDetails.buildingName,
      ownerName: bdDetails.ownerName,
      templateName: bdDetails.templateName,
      currentTab: bldState.currentTab,
      tabs: bdDetails.tabs.map(t => ({ id: t.id, name: t.name })),
      isOwner: bldState.isOwner,
      coords: { x: bdDetails.x, y: bdDetails.y },
    } : null;

    // Settings values
    const settingsValues = ClientBridge.getSettings();

    return {
      session: {
        connected: this.isConnected,
        worldName: this.currentWorldName,
        companyName: this.currentCompanyName,
        worldSize: { x: this.worldXSize, y: this.worldYSize },
      },
      renderer: renderer ? {
        mapLoaded: renderer.getAllBuildings().length > 0 || renderer.getAllSegments().length > 0,
        zoom: renderer.getZoom(),
        rotation,
        cameraPosition: renderer.getCameraPosition(),
        buildingCount: renderer.getAllBuildings().length,
        segmentCount: renderer.getAllSegments().length,
        mapDimensions: renderer.getMapDimensions(),
        debugMode: rendererAny?.debugMode === true,
        canvasSize: canvas ? { width: canvas.width, height: canvas.height } : { width: 0, height: 0 },
        canvasHasContent,
      } : null,
      panels,
      tycoonStats,
      chat: {
        visible: chatStoreState.isExpanded,
        messageCount: channelMsgs.length,
        lastMessage: lastMsg,
      },
      buildingDetails,
      settings: settingsValues,
      wire: {
        sent: this.debugWire.sent,
        received: this.debugWire.received,
        errors: this.debugWire.errors,
        lastSent: this.debugWire.lastSent,
        lastReceived: this.debugWire.lastReceived,
      },
    };
  }
  // [/E2E-DEBUG]
}

