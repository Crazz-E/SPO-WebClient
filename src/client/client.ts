import {
  WsMessageType,
  WsMessage,
  WsReqAuthCheck,
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
  WsReqBuildingFocus,
  WsReqBuildingUnfocus,
  WsRespBuildingFocus,
  WsEventBuildingRefresh,
  WsEventAreaRefresh,
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
  WsReqDemolishRoadArea,
  WsRespDemolishRoadArea,
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
  // Cluster Browsing
  WsReqClusterInfo,
  WsRespClusterInfo,
  WsReqClusterFacilities,
  WsRespClusterFacilities,
  // Zone Painting
  WsReqDefineZone,
  WsRespDefineZone,
  // Capitol
  WsReqBuildCapitol,
  WsRespCapitolCoords,
  // Date
  WsEventRefreshDate,
  // Research / Inventions
  WsRespResearchInventory,
  WsRespResearchDetails,
  // Notifications
  WsEventShowNotification,
} from '../shared/types';
import { getErrorMessage } from '../shared/error-codes';
import { toErrorMessage } from '../shared/error-utils';
import { Season } from '../shared/map-config';
import { MapNavigationUI } from './ui/map-navigation-ui';
import { MinimapUI } from './ui/minimap-ui';
import { ClientBridge, setWorldToScreenFn, setWorldToScreenCenteredFn, type ClientCallbacks } from './bridge/client-bridge';
import { useGameStore, delphiTDateTimeToJsDate } from './store/game-store';
import type { GameSettings } from './store/game-store';
import { useUiStore } from './store/ui-store';
import { useChatStore } from './store/chat-store';
import { useBuildingStore } from './store/building-store';
import { useProfileStore } from './store/profile-store';
import { useMailStore } from './store/mail-store';
import { usePoliticsStore } from './store/politics-store';
import { getFacilityDimensionsCache } from './facility-dimensions-cache';
import { isCivicBuilding, registerCivicVisualClass } from '../shared/building-details/civic-buildings';
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
  private cameraUpdateTimer: ReturnType<typeof setTimeout> | null = null;

  // Building focus state
  private currentFocusedBuilding: BuildingFocusInfo | null = null;
  private currentFocusedVisualClass: string | null = null;

  // Building construction state
  private buildingCategories: BuildingCategory[] = [];
  private lastLoadedFacilities: BuildingInfo[] = [];
  private currentBuildingToPlace: BuildingInfo | null = null;
  private currentBuildingXSize: number = 1;
  private currentBuildingYSize: number = 1;
  private overlayBeforePlacement: { type: 'zones' | 'overlay' | 'none'; overlay?: SurfaceType } = { type: 'none' };

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

  // Zone painting state
  private isZonePaintingMode: boolean = false;
  private selectedZoneType: number = 2;

  // City Zones overlay
  private isCityZonesEnabled: boolean = false;
  private activeOverlayType: SurfaceType | null = null;

  // Speculative prefetch: first click caches a details promise for instant second-click
  private speculativeBuildingDetails = new Map<string, Promise<BuildingDetailsResponse | null>>();

  // Generation counters: discard stale responses when a newer request supersedes
  private requestGeneration = new Map<string, number>();

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
      onSwitchServer: () => this.startServerSwitch(),
      onCancelServerSwitch: () => this.cancelServerSwitch(),
      onServerSwitchZoneSelect: (zonePath: string) => this.serverSwitchZoneSelect(zonePath),
      onSendChatMessage: (message: string) => this.sendChatMessage(message),
      onJoinChannel: (channelName: string) => this.joinChannel(channelName),
      onAuthCheck: (username: string, password: string) => this.performAuthCheck(username, password),
      onDirectoryConnect: (username: string, password: string, zonePath?: string) =>
        this.performDirectoryLogin(username, password, zonePath),
      onWorldSelect: (worldName: string) => this.login(worldName),
      onCompanySelect: (companyId: string) => this.selectCompanyAndStart(companyId),
      onCreateCompany: () => this.showCompanyCreationDialog(),
      onCreateCompanySubmit: (companyName: string, cluster: string) =>
        this.handleCreateCompany(companyName, cluster),
      onRequestClusterInfo: (clusterName: string) => this.requestClusterInfo(clusterName),
      onRequestClusterFacilities: (cluster: string, folder: string) =>
        this.requestClusterFacilities(cluster, folder),
      onRequestBuildingCategories: () => this.openBuildMenu(),
      onRequestBuildingFacilities: (kind: number, cluster: string) =>
        this.loadBuildingFacilitiesByKind(kind, cluster),
      onPlaceBuilding: (facilityClass: string, visualClassId: number) =>
        this.placeBuildingFromMenu(facilityClass, visualClassId),
      onBuildCapitol: () => this.startCapitolPlacement(),
      onOpenCapitol: () => this.openCapitolInspector(),
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
      onInspectFocusedBuilding: () => {
        const { focusedBuilding } = useBuildingStore.getState();
        if (focusedBuilding) {
          this.openInspectorForFocused(
            focusedBuilding.x, focusedBuilding.y,
            focusedBuilding.visualClass,
          );
        }
      },
      onBuildingAction: (actionId, rowData) => {
        const details = useBuildingStore.getState().details;
        if (details) this.handleBuildingAction(actionId, details, rowData);
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
      onDisconnectConnection: (buildingX, buildingY, fluidId, direction, x, y) => {
        const rdoCommand = direction === 'input' ? 'RDODisconnectInput' : 'RDODisconnectOutput';
        this.setBuildingProperty(buildingX, buildingY, rdoCommand, '0', {
          fluidId, connectionList: `${x},${y}`,
        }).then(success => {
          if (success) {
            this.showNotification('Supplier disconnected', 'success');
            const visualClass = this.currentFocusedVisualClass || '0';
            this.requestBuildingDetails(buildingX, buildingY, visualClass).then(details => {
              if (details) ClientBridge.updateBuildingDetails(details);
            });
          }
        }).catch((err: unknown) => {
          this.showNotification(`Failed to disconnect: ${toErrorMessage(err)}`, 'error');
        });
      },

      // Research / Inventions
      onResearchLoadInventory: (buildingX, buildingY, categoryIndex) =>
        this.loadResearchInventory(buildingX, buildingY, categoryIndex),
      onResearchGetDetails: (buildingX, buildingY, inventionId) =>
        this.getResearchDetails(buildingX, buildingY, inventionId),
      onResearchQueueInvention: (buildingX, buildingY, inventionId) =>
        this.queueResearchDirect(buildingX, buildingY, inventionId),
      onResearchCancelInvention: (buildingX, buildingY, inventionId) =>
        this.cancelResearchDirect(buildingX, buildingY, inventionId),
      onResearchFetchCategoryTabs: () =>
        this.fetchResearchCategoryTabs(),

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
        useGameStore.getState().setSwitchingCompany(true);
        this.sendRequest({
          type: WsMessageType.REQ_SWITCH_COMPANY,
          company,
        } as WsReqSwitchCompany).then(() => {
          ClientBridge.setCompany(companyName, String(companyId));
          ClientBridge.showSuccess(`Switched to ${companyName}`);
          // Invalidate profile cache — force re-fetch on next tab access
          useProfileStore.getState().reset();
          // Clear building inspector (company context changed)
          useBuildingStore.getState().clearFocus();
        }).catch((err: unknown) => {
          ClientBridge.showError(`Failed to switch company: ${toErrorMessage(err)}`);
        }).finally(() => {
          useGameStore.getState().setSwitchingCompany(false);
        });
      },

      // Politics
      onLaunchCampaign: (buildingX, buildingY) => {
        const townName = usePoliticsStore.getState().townName;
        this.sendMessage({
          type: WsMessageType.REQ_POLITICS_LAUNCH_CAMPAIGN,
          buildingX, buildingY, townName,
        });
      },
      onCancelCampaign: (buildingX, buildingY) => {
        const townName = usePoliticsStore.getState().townName;
        this.sendMessage({
          type: WsMessageType.REQ_POLITICS_CANCEL_CAMPAIGN,
          buildingX, buildingY, townName,
        });
      },
      onQueryTycoonRole: (tycoonName: string) => this.sendMessage({
        type: WsMessageType.REQ_TYCOON_ROLE,
        tycoonName,
      }),

      // Empire
      onRequestFacilities: () => {
        ClientBridge.setEmpireLoading(true);
        this.sendMessage({ type: WsMessageType.REQ_EMPIRE_FACILITIES });
      },

      // Zone painting
      onToggleZonePainting: (zoneType: number) => this.toggleZonePaintingMode(zoneType),
      onCancelZonePainting: () => this.cancelZonePaintingMode(),

      // Overlays
      onToggleCityZones: () => this.toggleCityZones(),
      onSetOverlay: (surfaceType: SurfaceType | null) => this.setOverlay(surfaceType),
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
        this.sendCameraPositionDebounced();
      });

      this.mapNavigationUI.setOnBuildingClick((x, y, visualClass) => {
        this.handleMapClick(x, y, visualClass);
      });

      this.mapNavigationUI.setOnEmptyMapClick(() => {
        this.unfocusBuilding();
      });

      // Expose world-to-screen converters for StatusOverlay positioning
      const renderer = this.mapNavigationUI.getRenderer();
      if (renderer) {
        setWorldToScreenFn((worldX, worldY) => renderer.worldToScreen(worldX, worldY));
        setWorldToScreenCenteredFn((worldX, worldY, xsize, ysize) =>
          renderer.worldToScreenCentered(worldX, worldY, xsize, ysize)
        );
      }

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

    // Handle browser close/refresh - save camera position and send logout request
    window.addEventListener('beforeunload', () => {
      this.sendCameraPositionNow();
      this.sendLogoutBeacon();
    });
  }

  private sendRequest(msg: Partial<WsMessage>, timeoutMs = 15000): Promise<WsMessage> {
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
      // [/E2E-DEBUG]
      this.ws.send(JSON.stringify(msg));

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request Timeout'));
        }
      }, timeoutMs);
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
    // [/E2E-DEBUG]
    this.ws.send(JSON.stringify(msg));
  }

  /**
   * Increment and return the generation counter for a request category.
   * Used to discard stale responses when a newer request has been issued.
   */
  private nextGeneration(category: string): number {
    const gen = (this.requestGeneration.get(category) ?? 0) + 1;
    this.requestGeneration.set(category, gen);
    return gen;
  }

  /** Check if a generation counter is still current (not superseded). */
  private isCurrentGeneration(category: string, gen: number): boolean {
    return this.requestGeneration.get(category) === gen;
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
    // [/E2E-DEBUG]

    // 1. Pending Requests
    if (msg.wsRequestId && this.pendingRequests.has(msg.wsRequestId)) {
      const { resolve, reject } = this.pendingRequests.get(msg.wsRequestId)!;
      this.pendingRequests.delete(msg.wsRequestId);
      if (msg.type === WsMessageType.RESP_ERROR) {
        const errorResp = msg as WsRespError;
        const localizedMessage = getErrorMessage(errorResp.code);
        const err = new Error(localizedMessage);
        (err as Error & { code: number }).code = errorResp.code;
        reject(err);
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
        this.requestUserList();
        break;

      case WsMessageType.EVENT_MAP_DATA:
      case WsMessageType.RESP_MAP_DATA:
        const mapMsg = msg as WsRespMapData;
        ClientBridge.log('Map', `Received area (${mapMsg.data.x}, ${mapMsg.data.y}): ${mapMsg.data.buildings.length} buildings, ${mapMsg.data.segments.length} segments`);
        this.mapNavigationUI?.getRenderer()?.updateMapData(mapMsg.data);
        break;

      case WsMessageType.EVENT_AREA_REFRESH: {
        const areaEvt = msg as WsEventAreaRefresh;
        ClientBridge.log('Map', `Area refresh at (${areaEvt.x}, ${areaEvt.y}) ${areaEvt.width}x${areaEvt.height}`);
        const areaRenderer = this.mapNavigationUI?.getRenderer();
        if (areaRenderer) {
          areaRenderer.invalidateArea(
            areaEvt.x,
            areaEvt.y,
            areaEvt.x + areaEvt.width,
            areaEvt.y + areaEvt.height
          );
          areaRenderer.triggerZoneCheck();
        }
        break;
      }

      case WsMessageType.EVENT_BUILDING_REFRESH: {
        const refreshEvt = msg as WsEventBuildingRefresh;
        const kind = refreshEvt.kindOfChange;

        // If structure changed (1) or destroyed (2), invalidate the renderer zone
        if (kind === 1 || kind === 2) {
          const renderer = this.mapNavigationUI?.getRenderer();
          if (renderer) {
            ClientBridge.log('Map', `Building ${refreshEvt.building.buildingId} ${kind === 1 ? 'structure changed' : 'destroyed'}, invalidating zone at (${refreshEvt.building.x}, ${refreshEvt.building.y})`);
            renderer.invalidateZone(refreshEvt.building.x, refreshEvt.building.y);
            renderer.triggerZoneCheck();
          }
        }

        // If the refreshed building matches the one currently viewed, re-fetch details
        if (this.currentFocusedBuilding &&
            this.currentFocusedBuilding.buildingId === refreshEvt.building.buildingId) {
          // Enrich with footprint dimensions from local cache
          const refreshVc = this.currentFocusedVisualClass || '0';
          const refreshDims = getFacilityDimensionsCache().getFacility(refreshVc);
          refreshEvt.building.xsize = refreshDims?.xsize ?? 1;
          refreshEvt.building.ysize = refreshDims?.ysize ?? 1;
          refreshEvt.building.visualClass = refreshVc;

          // Propagate refreshed focus info to React store immediately
          this.currentFocusedBuilding = refreshEvt.building;
          ClientBridge.setFocusedBuilding(refreshEvt.building);
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

      case WsMessageType.EVENT_SHOW_NOTIFICATION: {
        const notif = msg as WsEventShowNotification;
        ClientBridge.log('Notification', `Kind=${notif.kind}, Options=${notif.options}: ${notif.body || notif.title}`);
        const displayText = notif.body || notif.title || 'Server notification';
        // Kind: 0=MessageBox, 1=URLFrame, 2=ChatMessage, 3=Sound, 4=GenericEvent
        const variant = notif.kind === 4 ? 'success' as const : 'info' as const;
        this.showNotification(displayText, variant);

        // Options handling per Delphi Protocol.pas:
        // For kind=4 (GenericEvent): options=1 (gevnId_RefreshBuildPage) → refresh build catalog
        // because completed research may have unlocked new building types.
        if (notif.kind === 4 && notif.options === 1) {
          ClientBridge.log('Notification', 'Research event — invalidating build catalog cache');
          this.buildingCategories = [];
          ClientBridge.setBuildMenuCategories([]);
        }
        break;
      }

      case WsMessageType.EVENT_CACHE_REFRESH: {
        ClientBridge.log('Cache', 'Server invalidated cache — re-fetching building details');
        if (this.currentFocusedBuilding) {
          this.requestBuildingDetails(
            this.currentFocusedBuilding.x,
            this.currentFocusedBuilding.y,
            this.currentFocusedVisualClass || '0'
          ).then(refreshedDetails => {
            if (refreshedDetails) {
              ClientBridge.updateBuildingDetails(refreshedDetails);
            }
          }).catch(err => {
            ClientBridge.log('Error', `Failed to refresh building after cache invalidation: ${toErrorMessage(err)}`);
          });
        }
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
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH:
      case WsMessageType.RESP_SEARCH_MENU_RANKINGS:
      case WsMessageType.RESP_SEARCH_MENU_RANKING_DETAIL:
      case WsMessageType.RESP_SEARCH_MENU_BANKS:
        ClientBridge.handleSearchMenuResponse(msg);
        break;

      // Capitol coordinates (pushed after login)
      case WsMessageType.RESP_CAPITOL_COORDS: {
        const capitolMsg = msg as WsRespCapitolCoords;
        if (capitolMsg.hasCapitol) {
          useGameStore.getState().setCapitolCoords({ x: capitolMsg.x, y: capitolMsg.y });
          ClientBridge.log('Capitol', `Capitol located at (${capitolMsg.x}, ${capitolMsg.y})`);
        } else {
          useGameStore.getState().setCapitolCoords(null);
          ClientBridge.log('Capitol', 'No Capitol in this world');
        }
        break;
      }

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

      case WsMessageType.RESP_POLITICS_LAUNCH_CAMPAIGN:
      case WsMessageType.RESP_POLITICS_CANCEL_CAMPAIGN:
        ClientBridge.handlePoliticsCampaignResponse(msg);
        break;

      case WsMessageType.RESP_TYCOON_ROLE:
        ClientBridge.handleTycoonRoleResponse(msg);
        break;

      // Transport Response
      case WsMessageType.RESP_TRANSPORT_DATA:
        ClientBridge.handleTransportResponse(msg);
        break;

      // Empire Response
      case WsMessageType.RESP_EMPIRE_FACILITIES:
        ClientBridge.handleEmpireResponse(msg);
        break;

      // Research Responses
      case WsMessageType.RESP_RESEARCH_INVENTORY: {
        const resInv = msg as WsRespResearchInventory;
        useBuildingStore.getState().setResearchInventory(resInv.data);
        break;
      }
      case WsMessageType.RESP_RESEARCH_DETAILS: {
        const resDet = msg as WsRespResearchDetails;
        useBuildingStore.getState().setResearchDetails(resDet.details);
        break;
      }

      // Connection Search Response — route to supplier search or building connection picker
      case WsMessageType.RESP_SEARCH_CONNECTIONS: {
        const searchResp = msg as WsRespSearchConnections;
        if (useUiStore.getState().modal === 'supplierSearch') {
          useProfileStore.getState().setSupplierSearchResults(searchResp.results);
        } else {
          ClientBridge.updateConnectionResults(searchResp.results);
        }
        break;
      }

      // Cluster Browsing Responses
      case WsMessageType.RESP_CLUSTER_INFO: {
        const clusterResp = msg as WsRespClusterInfo;
        ClientBridge.handleClusterInfoResponse(clusterResp.clusterInfo);
        break;
      }
      case WsMessageType.RESP_CLUSTER_FACILITIES: {
        const facResp = msg as WsRespClusterFacilities;
        ClientBridge.handleClusterFacilitiesResponse(facResp.facilities);
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

  private async performAuthCheck(username: string, password: string) {
    ClientBridge.setLoginLoading(true);
    ClientBridge.log('Auth', 'Checking credentials...');

    try {
      const req: WsReqAuthCheck = {
        type: WsMessageType.REQ_AUTH_CHECK,
        username,
        password,
      };
      await this.sendRequest(req);

      // Success — store creds and advance to zone selection
      this.storedUsername = username;
      this.storedPassword = password;
      ClientBridge.setCredentials(username);
      ClientBridge.log('Auth', 'Credentials valid');
      useGameStore.getState().setLoginStage('zones');
    } catch (err: unknown) {
      ClientBridge.log('Auth', `Failed: ${toErrorMessage(err)}`);
      const code = (err as { code?: number }).code ?? 0;
      ClientBridge.setAuthError({ code, message: toErrorMessage(err) });
    } finally {
      ClientBridge.setLoginLoading(false);
    }
  }

  private async performDirectoryLogin(username: string, password: string, zonePath?: string) {
    this.storedUsername = username;
    this.storedPassword = password;
    ClientBridge.setCredentials(username);
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
      ClientBridge.showError('Login Failed: ' + toErrorMessage(err));
      ClientBridge.setLoginLoading(false);
    }
  }

  private async login(worldName: string) {
    if (!this.storedUsername || !this.storedPassword) {
      ClientBridge.showError('Session lost, please reconnect');
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

        const switchResp = await this.sendRequest(req);
        ClientBridge.log('Company', 'Company switch successful');

        // Restore camera to player's last saved position
        const switchRespAny = switchResp as Record<string, unknown>;
        if (typeof switchRespAny.playerX === 'number' && typeof switchRespAny.playerY === 'number'
            && (switchRespAny.playerX !== 0 || switchRespAny.playerY !== 0)) {
          this.savedPlayerX = switchRespAny.playerX;
          this.savedPlayerY = switchRespAny.playerY;
          ClientBridge.log('Map', `Restoring camera to saved position (${this.savedPlayerX}, ${this.savedPlayerY})`);
        }
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

      // Detect public office role for zone painting visibility (fast path from ASP HTML)
      const roleRaw = company.ownerRole ?? '';
      const roleLower = roleRaw.toLowerCase();
      const isPublicOffice = roleLower.includes('president') || roleLower.includes('minister') || roleLower.includes('mayor');
      ClientBridge.setPublicOfficeRole(isPublicOffice, roleRaw);

      // Confirm via server cache (async, authoritative boolean flags)
      if (this.storedUsername) {
        this.sendMessage({ type: WsMessageType.REQ_TYCOON_ROLE, tycoonName: this.storedUsername });
      }

      // Preload all facility dimensions (one-time, ~15KB)
      await this.preloadFacilityDimensions();

      // Switch to game view — set React status to 'connected' so App.tsx
      // routes from LoginScreen to GameScreen
      ClientBridge.setConnected();
      ClientBridge.setWorld(this.currentWorldName);
      ClientBridge.setCompany(company.name, company.id);

      // Close server switch overlay if active
      if (useGameStore.getState().serverSwitchMode) {
        useGameStore.getState().completeServerSwitch();
      }

      await this.switchToGameView();

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
    ClientBridge.showCompanyCreationDialog();
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

    // Add new company to local list
    const newCompany: CompanyInfo = {
      id: resp.companyId,
      name: resp.companyName,
      ownerRole: this.storedUsername,
    };
    this.availableCompanies.push(newCompany);

    // If already in-game (created from ProfilePanel), just update the store
    // without reinitializing the entire game view.
    if (this.mapNavigationUI) {
      ClientBridge.setCompany(resp.companyName, resp.companyId);
      this.currentCompanyName = resp.companyName;
      // Refresh profile companies tab if open
      useProfileStore.getState().reset();
      return;
    }

    // During login flow: auto-select and enter game
    this.selectCompanyAndStart(resp.companyId);
  }

  private requestClusterInfo(clusterName: string): void {
    useGameStore.getState().setClusterInfoLoading(true);
    const req: WsReqClusterInfo = {
      type: WsMessageType.REQ_CLUSTER_INFO,
      clusterName,
    };
    this.ws?.send(JSON.stringify(req));
  }

  private requestClusterFacilities(cluster: string, folder: string): void {
    useGameStore.getState().setClusterFacilitiesLoading(true);
    const req: WsReqClusterFacilities = {
      type: WsMessageType.REQ_CLUSTER_FACILITIES,
      cluster,
      folder,
    };
    this.ws?.send(JSON.stringify(req));
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

    // When any overlay is active, also fetch surface data for this area
    const activeSurface = this.isCityZonesEnabled ? SurfaceType.ZONES : this.activeOverlayType;
    if (activeSurface !== null && x !== undefined && y !== undefined) {
      this.fetchSurfaceForArea(activeSurface, x, y, x + w, y + h);
    }
  }

  /**
   * Fetch surface data for an area and update the renderer overlay.
   * Called alongside ObjectsInArea/SegmentsInArea when any overlay is active.
   */
  private async fetchSurfaceForArea(surfaceType: SurfaceType, x1: number, y1: number, x2: number, y2: number): Promise<void> {
    try {
      const req: WsReqGetSurface = {
        type: WsMessageType.REQ_GET_SURFACE,
        surfaceType,
        x1,
        y1,
        x2,
        y2,
      };
      const response = await this.sendRequest(req) as WsRespSurfaceData;
      const renderer = this.mapNavigationUI?.getRenderer();
      // Check that the overlay is still active (may have been toggled off during fetch)
      const stillActive = this.isCityZonesEnabled
        ? surfaceType === SurfaceType.ZONES
        : surfaceType === this.activeOverlayType;
      if (renderer && stillActive) {
        const isHeatmap = surfaceType !== SurfaceType.ZONES && surfaceType !== SurfaceType.TOWNS;
        renderer.setZoneOverlay(true, response.data, x1, y1, isHeatmap, surfaceType === SurfaceType.TOWNS);
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to fetch ${surfaceType} surface: ${toErrorMessage(err)}`);
    }
  }

  /**
   * Load map zone(s) containing the given world coordinates, aligned to 64-tile zone boundaries.
   *
   * The renderer caches map data in 64×64 zones keyed by aligned coordinates.
   * Requesting unaligned coordinates would replace a zone with partial data, causing
   * buildings/roads outside the returned area (but inside the zone) to vanish.
   *
   * @param x - World column coordinate
   * @param y - World row coordinate
   * @param margin - Extra tiles to consider (e.g. building size). If the point plus margin
   *                 crosses a zone boundary, adjacent zones are refreshed too.
   */
  private loadAlignedMapArea(x: number, y: number, margin: number = 0) {
    const zoneSize = 64;
    const alignedX = Math.floor(x / zoneSize) * zoneSize;
    const alignedY = Math.floor(y / zoneSize) * zoneSize;

    // Always load the primary zone containing (x, y)
    this.loadMapArea(alignedX, alignedY, zoneSize, zoneSize);

    if (margin <= 0) return;

    // Check if the affected area (x..x+margin) spills into adjacent zones
    const xInZone = x - alignedX;
    const yInZone = y - alignedY;

    const needRight = xInZone + margin >= zoneSize;
    const needBelow = yInZone + margin >= zoneSize;

    if (needRight) {
      this.loadMapArea(alignedX + zoneSize, alignedY, zoneSize, zoneSize);
    }
    if (needBelow) {
      this.loadMapArea(alignedX, alignedY + zoneSize, zoneSize, zoneSize);
    }
    if (needRight && needBelow) {
      this.loadMapArea(alignedX + zoneSize, alignedY + zoneSize, zoneSize, zoneSize);
    }
  }

  /**
   * Load all map zones that intersect the rectangle (x1,y1)→(x2,y2).
   * Unlike loadAlignedMapArea which only expands in the positive direction,
   * this correctly handles roads/areas drawn in any direction.
   */
  private loadAlignedMapAreaForRect(x1: number, y1: number, x2: number, y2: number) {
    const zoneSize = 64;
    const minAX = Math.floor(Math.min(x1, x2) / zoneSize) * zoneSize;
    const minAY = Math.floor(Math.min(y1, y2) / zoneSize) * zoneSize;
    const maxAX = Math.floor(Math.max(x1, x2) / zoneSize) * zoneSize;
    const maxAY = Math.floor(Math.max(y1, y2) / zoneSize) * zoneSize;

    for (let ax = minAX; ax <= maxAX; ax += zoneSize) {
      for (let ay = minAY; ay <= maxAY; ay += zoneSize) {
        this.loadMapArea(ax, ay, zoneSize, zoneSize);
      }
    }
  }

  private async switchToGameView(): Promise<void> {
    // React App.tsx switches to GameScreen when status becomes 'connected'
    this.uiGamePanel.style.display = 'flex';
    this.uiGamePanel.style.flexDirection = 'column';

    // Tear down existing map/minimap to prevent duplicate canvases
    if (this.mapNavigationUI) {
      this.mapNavigationUI.destroy();
      this.mapNavigationUI = null;
    }
    if (this.minimapUI) {
      this.minimapUI.destroy();
      this.minimapUI = null;
    }

    // Initialize Map & Navigation
    this.mapNavigationUI = new MapNavigationUI(this.uiGamePanel, this.currentWorldName);
    await this.mapNavigationUI.init();
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
    // Join the Lobby (empty string) by default — this is the main/world channel.
    // Named channels are town-specific. The Delphi server treats "" as the Lobby.
    await this.joinChannel('');
    ClientBridge.setCurrentChannel('Lobby');
    // Fetch initial user list after joining
    await this.requestUserList();
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
      // Optimistically set current channel so ChatStrip shows immediately
      ClientBridge.setCurrentChannel(channelName);
      const req: WsReqChatJoinChannel = {
        type: WsMessageType.REQ_CHAT_JOIN_CHANNEL,
        channelName
      };
      await this.sendRequest(req);
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
      // Portal (visual class 6031) is not inspectable
      if (visualClass === '6031') return;
      // Civic buildings (Capitol, TownHall) skip overlay — open modal directly
      if (visualClass && isCivicBuilding(visualClass)) {
        this.focusBuilding(x, y, visualClass);
        return;
      }
      // Two-click flow: first click → overlay, second click → open inspector
      const overlayBuilding = useBuildingStore.getState().focusedBuilding;
      const isOverlay = useBuildingStore.getState().isOverlayMode;
      if (isOverlay && overlayBuilding && overlayBuilding.x === x && overlayBuilding.y === y) {
        this.openInspectorForFocused(x, y, visualClass);
      } else {
        this.showBuildingOverlay(x, y, visualClass);
      }
    }
  }

  /**
   * First click: focus building on server and show lightweight overlay.
   */
  private async showBuildingOverlay(x: number, y: number, visualClass?: string) {
    if (this.isFocusingBuilding) return;
    this.isFocusingBuilding = true;
    ClientBridge.log('Building', `Requesting overlay at (${x}, ${y})`);

    try {
      // Unfocus previous building on the server (lightweight — no UI panel to close)
      if (this.currentFocusedBuilding) {
        const unfocusReq: WsReqBuildingUnfocus = { type: WsMessageType.REQ_BUILDING_UNFOCUS };
        this.ws?.send(JSON.stringify(unfocusReq));
        this.currentFocusedBuilding = null;
        this.currentFocusedVisualClass = null;
      }

      const req: WsReqBuildingFocus = { type: WsMessageType.REQ_BUILDING_FOCUS, x, y };
      const response = await this.sendRequest(req) as WsRespBuildingFocus;

      this.currentFocusedBuilding = response.building;
      this.currentFocusedVisualClass = visualClass || null;

      // Enrich with footprint dimensions from local cache
      const vc = visualClass || '0';
      const dims = getFacilityDimensionsCache().getFacility(vc);
      response.building.xsize = dims?.xsize ?? 1;
      response.building.ysize = dims?.ysize ?? 1;
      response.building.visualClass = vc;

      ClientBridge.showBuildingOverlay(response.building);

      // Tell renderer which building is selected (gold footprint highlight)
      const selRenderer = this.mapNavigationUI?.getRenderer();
      if (selRenderer) {
        selRenderer.setSelectedBuilding(x, y);
      }

      // Speculative prefetch: start loading details in background so second click is instant
      const cacheKey = `${x},${y}`;
      this.speculativeBuildingDetails.clear();
      this.speculativeBuildingDetails.set(cacheKey, this.requestBuildingDetails(x, y, vc));

      ClientBridge.log('Building', `Overlay: ${response.building.buildingName}`);
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to show overlay: ${toErrorMessage(err)}`);
    } finally {
      this.isFocusingBuilding = false;
    }
  }

  /**
   * Second click on overlayed building: request details and open the full inspector panel.
   */
  private async openInspectorForFocused(x: number, y: number, visualClass?: string) {
    if (this.isFocusingBuilding) return;
    this.isFocusingBuilding = true;
    ClientBridge.log('Building', `Opening inspector at (${x}, ${y})`);

    // Open panel/modal with skeleton immediately (animates in parallel with network)
    const vc = visualClass || this.currentFocusedVisualClass || '0';
    useBuildingStore.getState().setLoading(true);
    if (isCivicBuilding(vc)) {
      useUiStore.getState().openModal('buildingInspector');
    } else {
      useUiStore.getState().openRightPanel('building');
    }

    try {
      const gen = this.nextGeneration('buildingDetails');

      // Consume speculative prefetch if available, otherwise fire fresh request
      const cacheKey = `${x},${y}`;
      const cached = this.speculativeBuildingDetails.get(cacheKey);
      this.speculativeBuildingDetails.delete(cacheKey);
      const details = cached ? await cached : await this.requestBuildingDetails(x, y, vc);

      // Discard if a newer request superseded this one
      if (!this.isCurrentGeneration('buildingDetails', gen)) return;

      const focusInfo = this.currentFocusedBuilding;

      if (details) {
        ClientBridge.showBuildingPanel(details, this.currentCompanyName, focusInfo ?? undefined);
        ClientBridge.log('Building', `Inspector opened: ${focusInfo?.buildingName}`);
      } else {
        // Details unavailable — keep skeleton visible and set panel context.
        // EVENT_BUILDING_REFRESH or the retry below will fill in the real data.
        const bld = useBuildingStore.getState();
        bld.setCurrentCompanyName(this.currentCompanyName);
        if (focusInfo) bld.setFocus(focusInfo);
        bld.setOverlayMode(false);
        ClientBridge.log('Building', `Inspector skeleton (details pending) for ${focusInfo?.buildingName}`);
        setTimeout(() => this.refreshBuildingDetails(x, y), 2000);
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to open inspector: ${toErrorMessage(err)}`);
    } finally {
      this.isFocusingBuilding = false;
    }
  }

  /**
   * Full focus + inspector open in one step (used for programmatic navigation,
   * e.g. clicking a building in the empire facilities list).
   */
  private async focusBuilding(x: number, y: number, visualClass?: string) {
    if (this.isFocusingBuilding) return;
    this.isFocusingBuilding = true;
    ClientBridge.log('Building', `Requesting focus at (${x}, ${y})`);

    try {
      // Quiet unfocus — notify server only, don't close the UI panel
      if (this.currentFocusedBuilding) {
        const unfocusReq: WsReqBuildingUnfocus = { type: WsMessageType.REQ_BUILDING_UNFOCUS };
        this.ws?.send(JSON.stringify(unfocusReq));
        this.currentFocusedBuilding = null;
        this.currentFocusedVisualClass = null;
      }

      // Center the map on the building
      const renderer = this.mapNavigationUI?.getRenderer();
      renderer?.centerOn(x, y);

      // Resolve visualClass from renderer if not provided
      if (!visualClass && renderer) {
        visualClass = renderer.getVisualClassAt(x, y) ?? undefined;
      }

      // Open panel/modal with skeleton immediately (animates in parallel with network)
      useBuildingStore.getState().setLoading(true);
      if (isCivicBuilding(visualClass || '0')) {
        useUiStore.getState().openModal('buildingInspector');
      } else {
        useUiStore.getState().openRightPanel('building');
      }

      const gen = this.nextGeneration('buildingDetails');
      const req: WsReqBuildingFocus = { type: WsMessageType.REQ_BUILDING_FOCUS, x, y };

      // Fire focus + details in parallel (saves one full RTT)
      const [response, details] = await Promise.all([
        this.sendRequest(req) as Promise<WsRespBuildingFocus>,
        this.requestBuildingDetails(x, y, visualClass || '0'),
      ]);

      // Discard if a newer request superseded this one
      if (!this.isCurrentGeneration('buildingDetails', gen)) return;

      this.currentFocusedBuilding = response.building;
      this.currentFocusedVisualClass = visualClass || null;

      if (details) {
        ClientBridge.showBuildingPanel(details, this.currentCompanyName, response.building);
        ClientBridge.log('Building', `Focused: ${response.building.buildingName}`);
      } else {
        // Details unavailable — keep skeleton visible and set panel context.
        // EVENT_BUILDING_REFRESH or the retry below will fill in the real data.
        const bld = useBuildingStore.getState();
        bld.setCurrentCompanyName(this.currentCompanyName);
        bld.setFocus(response.building);
        bld.setOverlayMode(false);
        ClientBridge.log('Building', `Focused skeleton (details pending): ${response.building.buildingName}`);
        setTimeout(() => this.refreshBuildingDetails(x, y), 2000);
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to focus building: ${toErrorMessage(err)}`);
    } finally {
      this.isFocusingBuilding = false;
    }
  }

  private async unfocusBuilding() {
    if (!this.currentFocusedBuilding) return;

    ClientBridge.log('Building', 'Unfocusing building');
    this.speculativeBuildingDetails.clear();

    try {
      const req: WsReqBuildingUnfocus = {
        type: WsMessageType.REQ_BUILDING_UNFOCUS
      };
      this.ws?.send(JSON.stringify(req));

      ClientBridge.hideBuildingPanel();
      this.currentFocusedBuilding = null;
      this.currentFocusedVisualClass = null;

      // Clear renderer selection highlight
      const unfocusRenderer = this.mapNavigationUI?.getRenderer();
      if (unfocusRenderer) {
        unfocusRenderer.clearSelectedBuilding();
      }
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
  /** In-flight building details promises by "x,y" key — prevents duplicate requests */
  private inFlightBuildingDetails = new Map<string, Promise<BuildingDetailsResponse | null>>();

  public requestBuildingDetails(
    x: number,
    y: number,
    visualClass: string
  ): Promise<BuildingDetailsResponse | null> {
    const key = `${x},${y}`;
    const existing = this.inFlightBuildingDetails.get(key);
    if (existing) {
      ClientBridge.log('Building', `Dedup: reusing in-flight request at (${x}, ${y})`);
      return existing;
    }

    const promise = this.requestBuildingDetailsImpl(x, y, visualClass);
    this.inFlightBuildingDetails.set(key, promise);
    promise.finally(() => this.inFlightBuildingDetails.delete(key));
    return promise;
  }

  private async requestBuildingDetailsImpl(
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

      // Use 90s timeout — buildings with many products (e.g. Trade Center: 33)
      // can take 30-60s to fetch from the Delphi server
      const response = await this.sendRequest(req, 90000) as WsRespBuildingDetails;
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
    const vc = this.currentFocusedVisualClass || '0';
    const details = await this.requestBuildingDetails(x, y, vc);
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

    // Unique key for this property (e.g., "RDOSetPrice:{"index":"0"}")
    const pendingKey = additionalParams
      ? `${propertyName}:${JSON.stringify(additionalParams)}`
      : propertyName;

    ClientBridge.setPendingUpdate(pendingKey, value);

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
        ClientBridge.confirmPendingUpdate(pendingKey);
        ClientBridge.log('Building', `Property ${propertyName} updated to ${response.newValue}`);
        return true;
      } else {
        ClientBridge.failPendingUpdate(pendingKey, value, 'Server rejected the change');
        ClientBridge.log('Error', `Failed to set ${propertyName}`);
        return false;
      }
    } catch (err: unknown) {
      ClientBridge.failPendingUpdate(pendingKey, value, toErrorMessage(err));
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
        // Refresh the zone-aligned map area to remove the deleted building
        this.loadAlignedMapArea(x, y);
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

  private handleBuildingAction(actionId: string, buildingDetails: BuildingDetailsResponse, rowData?: Record<string, string>): void {
    if (actionId === 'clone') {
      this.startCloneFacility(buildingDetails);
    } else if (actionId === 'launchMovie') {
      this.launchMovie(buildingDetails);
    } else if (actionId === 'cancelMovie') {
      this.cancelMovie(buildingDetails);
    } else if (actionId === 'releaseMovie') {
      this.releaseMovie(buildingDetails);
    } else if (actionId === 'vote') {
      this.voteForCandidate(buildingDetails);
    } else if (actionId === 'voteCandidate' && rowData) {
      this.voteForCandidateInline(buildingDetails, rowData);
    } else if (actionId === 'banMinister') {
      this.banMinister(buildingDetails);
    } else if (actionId === 'deposeMinister' && rowData) {
      this.deposeMinisterInline(buildingDetails, rowData);
    } else if (actionId === 'sitMinister') {
      this.sitMinister(buildingDetails);
    } else if (actionId === 'electMinister' && rowData) {
      this.electMinisterInline(buildingDetails, rowData);
    } else if (actionId === 'electMayor' && rowData) {
      this.electMayorInline(buildingDetails, rowData);
    } else if (actionId.startsWith('tradeConnect:')) {
      const kind = actionId.split(':')[1];
      this.tradeConnect(buildingDetails, kind);
    } else if (actionId.startsWith('tradeDisconnect:')) {
      const kind = actionId.split(':')[1];
      this.tradeDisconnect(buildingDetails, kind);
    } else if (actionId === 'connectMap') {
      this.startConnectMode(buildingDetails);
    } else if (actionId === 'demolish') {
      useUiStore.getState().requestConfirm(
        'Demolish Building',
        'Are you sure you want to demolish this building? This action cannot be undone.',
        () => this.deleteFacility(buildingDetails.x, buildingDetails.y).then(success => {
          if (success) ClientBridge.hideBuildingPanel();
        }),
      );
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
  // TRADE CONNECT / DISCONNECT (Quick Trade buttons)
  // =========================================================================

  private async tradeConnect(buildingDetails: BuildingDetailsResponse, kind: string): Promise<void> {
    try {
      await this.setBuildingProperty(
        buildingDetails.x, buildingDetails.y, 'RDOConnectToTycoon', '0', { kind },
      );
      const kindLabel = kind === '1' ? 'stores' : kind === '2' ? 'factories' : 'warehouses';
      this.showNotification(`Connected all your ${kindLabel} to this building`, 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Connection failed: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async tradeDisconnect(buildingDetails: BuildingDetailsResponse, kind: string): Promise<void> {
    try {
      await this.setBuildingProperty(
        buildingDetails.x, buildingDetails.y, 'RDODisconnectFromTycoon', '0', { kind },
      );
      const kindLabel = kind === '1' ? 'stores' : kind === '2' ? 'factories' : 'warehouses';
      this.showNotification(`Disconnected all your ${kindLabel} from this building`, 'success');
      this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
    } catch (err: unknown) {
      this.showNotification(`Disconnection failed: ${toErrorMessage(err)}`, 'error');
    }
  }

  // =========================================================================
  // MANUAL CONNECT MODE (Map click selection)
  // =========================================================================

  private isConnectMode: boolean = false;
  private connectSourceBuilding: BuildingDetailsResponse | null = null;
  private connectKeyboardHandler: ((e: KeyboardEvent) => void) | null = null;

  private startConnectMode(buildingDetails: BuildingDetailsResponse): void {
    this.isConnectMode = true;
    this.connectSourceBuilding = buildingDetails;

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setConnectMode(true);
      renderer.setConnectModeCallback((targetX: number, targetY: number) => {
        this.executeConnectFacilities(targetX, targetY);
      });
    }

    this.connectKeyboardHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isConnectMode) {
        this.cancelConnectMode();
      }
    };
    document.addEventListener('keydown', this.connectKeyboardHandler);

    this.showNotification('Click on a building to connect. Press ESC to cancel.', 'info');
  }

  private cancelConnectMode(): void {
    this.isConnectMode = false;
    this.connectSourceBuilding = null;

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setConnectMode(false);
      renderer.setConnectModeCallback(null);
    }

    if (this.connectKeyboardHandler) {
      document.removeEventListener('keydown', this.connectKeyboardHandler);
      this.connectKeyboardHandler = null;
    }
  }

  private async executeConnectFacilities(targetX: number, targetY: number): Promise<void> {
    if (!this.connectSourceBuilding) return;
    const source = this.connectSourceBuilding;

    try {
      const req = {
        type: WsMessageType.REQ_CONNECT_FACILITIES,
        sourceX: source.x,
        sourceY: source.y,
        targetX,
        targetY,
      };
      const resp = await this.sendRequest(req) as WsMessage & { success: boolean; resultMessage: string };

      if (resp.resultMessage) {
        // Collapse multi-line result to readable single-line toast
        const displayMsg = resp.resultMessage.replace(/\n/g, ' | ');
        this.showNotification(displayMsg, resp.success ? 'success' : 'error');
      } else {
        this.showNotification(
          resp.success ? 'Buildings connected successfully' : 'Connection failed',
          resp.success ? 'success' : 'error',
        );
      }

      this.refreshBuildingDetails(source.x, source.y);
    } catch (err: unknown) {
      this.showNotification(`Connection failed: ${toErrorMessage(err)}`, 'error');
    } finally {
      this.cancelConnectMode();
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
  // INLINE ROW ACTIONS (Capitol government tabs)
  // =========================================================================

  private electMayorInline(buildingDetails: BuildingDetailsResponse, rowData: Record<string, string>): void {
    const townName = rowData['Town'];
    if (!townName) {
      this.showNotification('No town selected', 'error');
      return;
    }
    useUiStore.getState().requestPrompt(
      `Elect Mayor of ${townName}`,
      `Enter username to elect as mayor of ${townName}:`,
      async (playerName: string) => {
        try {
          const success = await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RDOSitMayor', playerName, {
            townName,
            index: rowData['_index'] ?? '0',
          });
          if (success) {
            this.showNotification(`${playerName} elected as mayor of ${townName}`, 'success');
            setTimeout(() => this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y), 1000);
          } else {
            this.showNotification(`Failed to elect mayor of ${townName}`, 'error');
          }
        } catch (err: unknown) {
          this.showNotification(`Failed to elect mayor: ${toErrorMessage(err)}`, 'error');
        }
      },
    );
  }

  private electMinisterInline(buildingDetails: BuildingDetailsResponse, rowData: Record<string, string>): void {
    const ministryId = rowData['MinistryId'];
    if (!ministryId) {
      this.showNotification('No ministry selected', 'error');
      return;
    }
    const ministryName = rowData['Ministry'] || `Ministry ${ministryId}`;
    useUiStore.getState().requestPrompt(
      `Appoint ${ministryName}`,
      `Enter username to appoint as ${ministryName}:`,
      async (playerName: string) => {
        try {
          const success = await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RDOSitMinister', '0', {
            ministryId,
            ministerName: playerName,
          });
          if (success) {
            this.showNotification(`${playerName} appointed as ${ministryName}`, 'success');
            setTimeout(() => this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y), 1000);
          } else {
            this.showNotification(`Failed to appoint ${playerName}`, 'error');
          }
        } catch (err: unknown) {
          this.showNotification(`Failed to appoint minister: ${toErrorMessage(err)}`, 'error');
        }
      },
    );
  }

  private async deposeMinisterInline(buildingDetails: BuildingDetailsResponse, rowData: Record<string, string>): Promise<void> {
    const ministryId = rowData['MinistryId'];
    if (!ministryId) {
      this.showNotification('No ministry selected', 'error');
      return;
    }
    try {
      const success = await this.setBuildingProperty(buildingDetails.x, buildingDetails.y, 'RDOBanMinister', '0', {
        ministryId,
      });
      if (success) {
        this.showNotification('Minister deposed', 'success');
        setTimeout(() => this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y), 1000);
      } else {
        this.showNotification('Failed to depose minister', 'error');
      }
    } catch (err: unknown) {
      this.showNotification(`Failed to depose minister: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async voteForCandidateInline(buildingDetails: BuildingDetailsResponse, rowData: Record<string, string>): Promise<void> {
    const candidateName = rowData['Candidate'];
    if (!candidateName) {
      this.showNotification('No candidate selected', 'error');
      return;
    }
    this.ws?.send(JSON.stringify({
      type: WsMessageType.REQ_POLITICS_VOTE,
      buildingX: buildingDetails.x,
      buildingY: buildingDetails.y,
      candidateName,
    }));
    this.showNotification(`Voted for ${candidateName}`, 'success');
    this.refreshBuildingDetails(buildingDetails.x, buildingDetails.y);
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

  private loadResearchInventory(buildingX: number, buildingY: number, categoryIndex: number): void {
    useBuildingStore.getState().setResearchLoading('inventory', true);
    this.sendMessage({
      type: WsMessageType.REQ_RESEARCH_INVENTORY,
      buildingX,
      buildingY,
      categoryIndex,
    });
  }

  private getResearchDetails(buildingX: number, buildingY: number, inventionId: string): void {
    useBuildingStore.getState().setResearchSelectedInvention(inventionId);
    useBuildingStore.getState().setResearchLoading('details', true);
    this.sendMessage({
      type: WsMessageType.REQ_RESEARCH_DETAILS,
      buildingX,
      buildingY,
      inventionId,
    });
  }

  private async queueResearch(buildingDetails: BuildingDetailsResponse): Promise<void> {
    const inventionId = useBuildingStore.getState().research?.selectedInventionId;
    if (!inventionId) {
      this.showNotification('Select an invention to research first', 'info');
      return;
    }
    try {
      await this.setBuildingProperty(
        buildingDetails.x, buildingDetails.y,
        'RDOQueueResearch', '0',
        { inventionId, priority: '10' },
      );
      this.showNotification('Research queued', 'success');
      const activeCat = useBuildingStore.getState().research?.activeCategoryIndex ?? 0;
      this.loadResearchInventory(buildingDetails.x, buildingDetails.y, activeCat);
    } catch (err: unknown) {
      this.showNotification(`Failed to queue research: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async cancelResearch(buildingDetails: BuildingDetailsResponse): Promise<void> {
    const inventionId = useBuildingStore.getState().research?.selectedInventionId;
    if (!inventionId) {
      this.showNotification('Select an invention to cancel first', 'info');
      return;
    }
    try {
      await this.setBuildingProperty(
        buildingDetails.x, buildingDetails.y,
        'RDOCancelResearch', '0',
        { inventionId },
      );
      this.showNotification('Research cancelled', 'success');
      const activeCat = useBuildingStore.getState().research?.activeCategoryIndex ?? 0;
      this.loadResearchInventory(buildingDetails.x, buildingDetails.y, activeCat);
    } catch (err: unknown) {
      this.showNotification(`Failed to cancel research: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async queueResearchDirect(buildingX: number, buildingY: number, inventionId: string): Promise<void> {
    try {
      await this.setBuildingProperty(buildingX, buildingY, 'RDOQueueResearch', '0', { inventionId, priority: '10' });
      this.showNotification('Research queued', 'success');
      const activeCat = useBuildingStore.getState().research?.activeCategoryIndex ?? 0;
      this.loadResearchInventory(buildingX, buildingY, activeCat);
    } catch (err: unknown) {
      this.showNotification(`Failed to queue research: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async cancelResearchDirect(buildingX: number, buildingY: number, inventionId: string): Promise<void> {
    try {
      await this.setBuildingProperty(buildingX, buildingY, 'RDOCancelResearch', '0', { inventionId });
      this.showNotification('Research cancelled', 'success');
      const activeCat = useBuildingStore.getState().research?.activeCategoryIndex ?? 0;
      this.loadResearchInventory(buildingX, buildingY, activeCat);
    } catch (err: unknown) {
      this.showNotification(`Failed to cancel research: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async fetchResearchCategoryTabs(): Promise<void> {
    try {
      const resp = await fetch('/api/research-inventions');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as { categoryTabs?: string[] };
      useBuildingStore.getState().setResearchCategoryTabs(data.categoryTabs ?? []);
    } catch (err: unknown) {
      console.warn('[Client] Failed to fetch category tabs:', toErrorMessage(err));
      useBuildingStore.getState().setResearchCategoryTabs(
        ['GENERAL', 'COMMERCE', 'REAL ESTATE', 'INDUSTRY', 'CIVICS'],
      );
    }
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

      if (response.success && !response.partial) {
        ClientBridge.log('Road', `Road built: ${response.tileCount} tiles, cost $${response.cost}`);
        this.showNotification(`Road built: ${response.tileCount} tiles`, 'success');
        this.loadAlignedMapAreaForRect(x1, y1, x2, y2);
      } else if (response.success && response.partial) {
        ClientBridge.log('Road', `Road partially built: ${response.tileCount} tiles, cost $${response.cost}`);
        this.showNotification(response.message || `Road partially built (${response.tileCount} tiles)`, 'warning');
        this.loadAlignedMapAreaForRect(x1, y1, x2, y2);
      } else {
        ClientBridge.log('Error', response.message || 'Failed to build road');
        this.showNotification(response.message || 'Failed to build road', 'error');
        this.loadAlignedMapAreaForRect(x1, y1, x2, y2);
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
        renderer.setRoadDemolishAreaCompleteCallback((x1: number, y1: number, x2: number, y2: number) => {
          this.demolishRoadArea(x1, y1, x2, y2);
        });

        ClientBridge.log('Road', 'Road demolish mode enabled. Click or drag to select road tiles. Press ESC to cancel.');
      } else {
        renderer.setRoadDemolishClickCallback(null);
        renderer.setRoadDemolishAreaCompleteCallback(null);
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
      renderer.setRoadDemolishAreaCompleteCallback(null);
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
        // Refresh the zone-aligned map area to remove the demolished road
        this.loadAlignedMapArea(x, y);
      } else {
        ClientBridge.log('Error', response.message || 'Failed to demolish road');
        this.showNotification(response.message || 'Failed to demolish road', 'error');
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to demolish road: ${toErrorMessage(err)}`);
      this.showNotification(`Failed to demolish road: ${toErrorMessage(err)}`, 'error');
    }
  }

  /**
   * Demolish all road segments in a rectangular area via WipeCircuit.
   */
  private async demolishRoadArea(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const nx1 = Math.min(x1, x2);
    const ny1 = Math.min(y1, y2);
    const nx2 = Math.max(x1, x2);
    const ny2 = Math.max(y1, y2);

    ClientBridge.log('Road', `Demolishing road area (${nx1},${ny1})→(${nx2},${ny2})...`);

    try {
      const req: WsReqDemolishRoadArea = {
        type: WsMessageType.REQ_DEMOLISH_ROAD_AREA,
        x1: nx1, y1: ny1, x2: nx2, y2: ny2
      };

      const response = await this.sendRequest(req) as WsRespDemolishRoadArea;

      if (response.success) {
        ClientBridge.log('Road', `Road area demolished`);
        this.showNotification('Roads demolished', 'success');
        this.loadAlignedMapAreaForRect(nx1, ny1, nx2, ny2);
      } else {
        ClientBridge.log('Error', response.message || 'Failed to demolish roads');
        this.showNotification(response.message || 'Failed to demolish roads', 'error');
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to demolish road area: ${toErrorMessage(err)}`);
      this.showNotification(`Failed to demolish roads: ${toErrorMessage(err)}`, 'error');
    }
  }

  // =========================================================================
  // ZONE PAINTING METHODS
  // =========================================================================

  /**
   * Toggle zone painting mode for a given zone type
   */
  private toggleZonePaintingMode(zoneType: number): void {
    // If same type active → toggle off
    if (this.isZonePaintingMode && this.selectedZoneType === zoneType) {
      this.cancelZonePaintingMode();
      return;
    }

    // Cancel other modes
    if (this.isRoadBuildingMode) {
      this.cancelRoadBuildingMode();
    }
    if (this.isRoadDemolishMode) {
      this.cancelRoadDemolishMode();
    }
    if (this.currentBuildingToPlace) {
      this.cancelBuildingPlacement();
    }

    this.isZonePaintingMode = true;
    this.selectedZoneType = zoneType;

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setZonePaintingMode(true, zoneType);
      renderer.setZoneAreaCompleteCallback((x1, y1, x2, y2) => {
        this.defineZoneArea(x1, y1, x2, y2);
      });
      renderer.setCancelZonePaintingCallback(() => {
        this.cancelZonePaintingMode();
      });
    }

    // Auto-enable zone overlay
    this.toggleZoneOverlay(true, SurfaceType.ZONES);

    // Setup ESC handler
    this.setupZonePaintingKeyboardHandler();

    // Push state to store
    ClientBridge.setZonePaintingMode(true);
    ClientBridge.setSelectedZoneType(zoneType);
    ClientBridge.log('Zone', `Zone painting mode enabled: type ${zoneType}`);
  }

  /**
   * Cancel zone painting mode
   */
  private cancelZonePaintingMode(): void {
    this.isZonePaintingMode = false;

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setZonePaintingMode(false);
      renderer.setZoneAreaCompleteCallback(null);
      renderer.setCancelZonePaintingCallback(null);
    }

    // If City Zones overlay is not enabled, disable the zone overlay that was auto-enabled for painting
    if (!this.isCityZonesEnabled) {
      this.toggleZoneOverlay(false, SurfaceType.ZONES);
    }

    ClientBridge.setZonePaintingMode(false);
    ClientBridge.log('Zone', 'Zone painting mode disabled');
  }

  /**
   * Setup ESC handler for zone painting mode
   */
  private setupZonePaintingKeyboardHandler(): void {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isZonePaintingMode) {
        this.cancelZonePaintingMode();
        document.removeEventListener('keydown', handler);
      }
    };
    document.addEventListener('keydown', handler);
  }

  /**
   * Define a zone area on the map
   */
  private async defineZoneArea(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    ClientBridge.log('Zone', `Defining zone ${this.selectedZoneType} from (${x1},${y1}) to (${x2},${y2})...`);

    try {
      const req: WsReqDefineZone = {
        type: WsMessageType.REQ_DEFINE_ZONE,
        zoneId: this.selectedZoneType,
        x1,
        y1,
        x2,
        y2,
      };

      const response = await this.sendRequest(req) as WsRespDefineZone;

      if (response.success) {
        const tileCount = (Math.abs(x2 - x1) + 1) * (Math.abs(y2 - y1) + 1);
        this.showNotification(`Zone defined: ${tileCount} tiles`, 'success');
        // Refresh zone overlay
        this.toggleZoneOverlay(true, SurfaceType.ZONES);
      } else {
        this.showNotification(response.message || 'Failed to define zone', 'error');
      }
    } catch (err: unknown) {
      ClientBridge.log('Error', `Failed to define zone: ${toErrorMessage(err)}`);
      this.showNotification(`Failed to define zone: ${toErrorMessage(err)}`, 'error');
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

      ClientBridge.setBuildMenuCategories(response.categories, response.capitolIconUrl);

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
  private placeBuildingFromMenu(facilityClass: string, visualClassId: string) {
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
   * Open the Capitol building inspector using cached coordinates
   * from the DirectoryMain.asp page (fetched at world login).
   */
  private openCapitolInspector() {
    const coords = useGameStore.getState().capitolCoords;
    if (!coords) {
      this.showNotification('No Capitol found in this world', 'error');
      return;
    }

    this.focusBuilding(coords.x, coords.y);
  }

  /**
   * Start Capitol placement mode.
   * Capitol is a special building — no category/facility lookup needed.
   */
  private async startCapitolPlacement() {
    ClientBridge.log('Build', 'Capitol placement mode — click on map to place.');

    // Capitol visualClassId = '152' (from CLASSES.BIN)
    const CAPITOL_VISUAL_CLASS_ID = '152';
    let xsize = 1;
    let ysize = 1;
    try {
      const dimensions = await this.getFacilityDimensions(CAPITOL_VISUAL_CLASS_ID);
      if (dimensions) {
        xsize = dimensions.xsize;
        ysize = dimensions.ysize;
      }
    } catch (err) {
      console.error('Failed to fetch Capitol dimensions:', err);
    }

    this.currentBuildingToPlace = {
      name: 'Capitol',
      facilityClass: 'Capitol',
      visualClassId: CAPITOL_VISUAL_CLASS_ID,
      cost: 0,
      area: xsize * ysize,
      description: 'Capitol building',
      zoneRequirement: '',
      iconPath: useUiStore.getState().capitolIconUrl,
      available: true,
    };
    this.currentBuildingXSize = xsize;
    this.currentBuildingYSize = ysize;

    this.showNotification('Capitol placement mode — Click map to place, ESC to cancel', 'info');

    const renderer = this.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(
        true,
        'Capitol',
        0,
        xsize * ysize,
        '',
        xsize,
        ysize,
        CAPITOL_VISUAL_CLASS_ID
      );
      renderer.setPlacementConfirmCallback((x, y) => {
        this.placeCapitol(x, y);
      });
      renderer.setCancelPlacementCallback(() => {
        this.cancelBuildingPlacement();
      });
    }

    this.setupPlacementKeyboardHandler();
  }

  /**
   * Place the Capitol at coordinates via dedicated message
   */
  private async placeCapitol(x: number, y: number) {
    ClientBridge.log('Build', `Placing Capitol at (${x}, ${y})...`);

    try {
      const req: WsReqBuildCapitol = {
        type: WsMessageType.REQ_BUILD_CAPITOL,
        x,
        y
      };

      await this.sendRequest(req);

      ClientBridge.log('Build', 'Capitol built successfully!');
      this.showNotification('Capitol built successfully!', 'success');

      const buildingMargin = Math.max(this.currentBuildingXSize, this.currentBuildingYSize);
      this.loadAlignedMapArea(x, y, buildingMargin);

      this.cancelBuildingPlacement();
    } catch (err: unknown) {
      const errorMsg = toErrorMessage(err);
      ClientBridge.log('Error', `Failed to place Capitol: ${errorMsg}`);
      this.showNotification(`Failed to place Capitol: ${errorMsg}`, 'error');
    }
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

      // Pre-populate civic building IDs so isCivicBuilding() works on first click
      if (response.civicVisualClassIds) {
        for (const id of response.civicVisualClassIds) {
          registerCivicVisualClass(id);
        }
      }

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
    this.currentBuildingXSize = xsize;
    this.currentBuildingYSize = ysize;

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

    // Auto-enable City Zones overlay so user can see zone boundaries
    this.enableCityZonesForPlacement();
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
        } else if (this.isZonePaintingMode) {
          this.cancelZonePaintingMode();
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

      // Reload the map zone(s) containing the new building (aligned to zone grid)
      const buildingMargin = Math.max(this.currentBuildingXSize, this.currentBuildingYSize);
      this.loadAlignedMapArea(x, y, buildingMargin);

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
   * Auto-enable City Zones overlay when entering building placement mode.
   * Saves the previous overlay state so it can be restored on cancel.
   */
  private enableCityZonesForPlacement(): void {
    // Save current overlay state for restoration
    if (this.isCityZonesEnabled) {
      this.overlayBeforePlacement = { type: 'zones' };
    } else if (this.activeOverlayType !== null) {
      this.overlayBeforePlacement = { type: 'overlay', overlay: this.activeOverlayType };
      // Disable the current overlay first
      this.toggleZoneOverlay(false, this.activeOverlayType);
      this.activeOverlayType = null;
      ClientBridge.setActiveOverlay(null);
    } else {
      this.overlayBeforePlacement = { type: 'none' };
    }

    // Enable City Zones if not already on
    if (!this.isCityZonesEnabled) {
      this.isCityZonesEnabled = true;
      ClientBridge.setCityZonesEnabled(true);
      this.toggleZoneOverlay(true, SurfaceType.ZONES);
    }
  }

  /**
   * Restore the overlay state that was active before building placement.
   */
  private restoreOverlayAfterPlacement(): void {
    const prev = this.overlayBeforePlacement;
    this.overlayBeforePlacement = { type: 'none' };

    if (prev.type === 'zones') {
      // Was already on City Zones — leave it on
      return;
    }

    // City Zones was auto-enabled — disable it
    this.isCityZonesEnabled = false;
    ClientBridge.setCityZonesEnabled(false);
    this.toggleZoneOverlay(false, SurfaceType.ZONES);

    if (prev.type === 'overlay' && prev.overlay) {
      // Restore previous overlay
      this.activeOverlayType = prev.overlay;
      ClientBridge.setActiveOverlay(prev.overlay);
      this.toggleZoneOverlay(true, prev.overlay);
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

    // Restore previous overlay state
    this.restoreOverlayAfterPlacement();
  }

  /**
   * Show a temporary notification to the user
   */
  private showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
    if (type === 'success') ClientBridge.showSuccess(message);
    else if (type === 'error') ClientBridge.showError(message);
    else if (type === 'warning') ClientBridge.showWarning(message);
    else ClientBridge.showInfo(message);
  }

  /**
   * Toggle City Zones overlay ON/OFF.
   * When ON, fetches zone surface data for the current viewport and enables overlay rendering.
   * When OFF, disables the overlay. Zone data is re-fetched on each viewport load (loadMapArea).
   * Mutual exclusion: enabling city zones disables any active overlay.
   */
  private toggleCityZones(): void {
    this.isCityZonesEnabled = !this.isCityZonesEnabled;
    ClientBridge.setCityZonesEnabled(this.isCityZonesEnabled);
    ClientBridge.log('Zones', `City Zones overlay ${this.isCityZonesEnabled ? 'enabled' : 'disabled'}`);

    // Mutual exclusion: disable any active overlay when enabling city zones
    if (this.isCityZonesEnabled && this.activeOverlayType !== null) {
      this.activeOverlayType = null;
      ClientBridge.setActiveOverlay(null);
      this.toggleZoneOverlay(false, SurfaceType.ZONES); // clear previous overlay data
    }

    if (this.isCityZonesEnabled) {
      this.toggleZoneOverlay(true, SurfaceType.ZONES);
    } else {
      this.toggleZoneOverlay(false, SurfaceType.ZONES);
    }
  }

  /**
   * Set the active map overlay (Beauty, Crime, QOL, etc.).
   * Only one overlay can be active at a time. Passing null disables the current overlay.
   * Mutual exclusion: enabling an overlay disables city zones if they are ON.
   */
  private setOverlay(surfaceType: SurfaceType | null): void {
    // Toggle off if same overlay selected
    if (surfaceType !== null && surfaceType === this.activeOverlayType) {
      surfaceType = null;
    }

    // Disable previous overlay rendering
    if (this.activeOverlayType !== null) {
      this.toggleZoneOverlay(false, this.activeOverlayType);
    }

    this.activeOverlayType = surfaceType;
    ClientBridge.setActiveOverlay(surfaceType);

    if (surfaceType === null) {
      ClientBridge.log('Overlay', 'Overlay disabled');
      return;
    }

    // Mutual exclusion: disable city zones when enabling an overlay
    if (this.isCityZonesEnabled) {
      this.isCityZonesEnabled = false;
      ClientBridge.setCityZonesEnabled(false);
      ClientBridge.log('Zones', 'City Zones disabled (overlay activated)');
    }

    ClientBridge.log('Overlay', `Enabling ${surfaceType} overlay`);
    this.toggleZoneOverlay(true, surfaceType);
  }

  /**
   * Toggle zone/surface overlay rendering and fetch data for loaded map zones.
   */
  private toggleZoneOverlay(enabled: boolean, surfaceType: SurfaceType) {
    ClientBridge.log('Overlay', enabled ? `Enabling ${surfaceType} overlay` : 'Disabling overlay');

    const renderer = this.mapNavigationUI?.getRenderer();
    if (!renderer) return;

    if (!enabled) {
      renderer.setZoneOverlay(false);
      return;
    }

    // Enable overlay, then fetch surface data for all currently loaded map zones
    const isHeatmap = surfaceType !== SurfaceType.ZONES && surfaceType !== SurfaceType.TOWNS;
    renderer.setZoneOverlay(true, undefined, undefined, undefined, isHeatmap, surfaceType === SurfaceType.TOWNS);
    const loadedKeys = renderer.getLoadedZoneKeys();
    for (const key of loadedKeys) {
      const [x, y] = key.split(',').map(Number);
      this.fetchSurfaceForArea(surfaceType, x, y, x + 64, y + 64);
    }

    ClientBridge.log('Overlay', `Fetching ${surfaceType} overlay for ${loadedKeys.length} loaded zones`);
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

  // ---- Server switch ----

  private startServerSwitch(): void {
    useGameStore.getState().enterServerSwitch();
  }

  private cancelServerSwitch(): void {
    useGameStore.getState().cancelServerSwitch();
  }

  private serverSwitchZoneSelect(zonePath: string): void {
    if (!this.storedUsername || !this.storedPassword) {
      ClientBridge.log('Error', 'Session lost — cannot switch server');
      useGameStore.getState().cancelServerSwitch();
      return;
    }
    this.performDirectoryLogin(this.storedUsername, this.storedPassword, zonePath);
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
  private sendCameraPositionDebounced(): void {
    if (this.cameraUpdateTimer !== null) {
      clearTimeout(this.cameraUpdateTimer);
    }
    this.cameraUpdateTimer = setTimeout(() => {
      this.cameraUpdateTimer = null;
      this.sendCameraPositionNow();
    }, 2000);
  }

  private sendCameraPositionNow(): void {
    const renderer = this.mapNavigationUI?.getRenderer();
    if (!renderer || !this.isConnected || !this.ws) return;
    const pos = renderer.getCameraPosition();
    this.sendMessage({
      type: WsMessageType.REQ_UPDATE_CAMERA,
      x: pos.x,
      y: pos.y,
    });
  }

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

