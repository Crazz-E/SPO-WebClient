import {
  WsMessageType,
  WsMessage,
  WsRespError,
  CompanyInfo,
  BuildingFocusInfo,
  BuildingCategory,
  BuildingInfo,
  BuildingDetailsResponse,
  SurfaceType,
  WsReqMailConnect,
  WsReqMailGetFolder,
  WsReqMailReadMessage,
  WsReqMailCompose,
  WsReqMailDelete,
  WsReqMailGetUnreadCount,
  WsReqMailSaveDraft,
  MailFolder,
  WsReqGetProfile,
} from '../shared/types';
import { getErrorMessage } from '../shared/error-codes';
import { toErrorMessage } from '../shared/error-utils';
import { MapNavigationUI } from './ui/map-navigation-ui';
import { MinimapUI } from './ui/minimap-ui';
import { ClientBridge, setWorldToScreenFn, setWorldToScreenCenteredFn, type ClientCallbacks } from './bridge/client-bridge';
import { useGameStore } from './store/game-store';
import type { GameSettings } from './store/game-store';
import { useUiStore } from './store/ui-store';
import { useChatStore } from './store/chat-store';
import { useBuildingStore } from './store/building-store';
import { getFacilityDimensionsCache } from './facility-dimensions-cache';
import { useProfileStore } from './store/profile-store';
import { useMailStore } from './store/mail-store';
import { usePoliticsStore } from './store/politics-store';
import { SoundManager } from './audio/sound-manager';
import type { ClientHandlerContext } from './handlers/client-context';

// Handler modules
import { dispatchEvent } from './handlers/event-handler';
import * as authHandler from './handlers/auth-handler';
import * as chatHandler from './handlers/chat-handler';
import * as buildingFocusHandler from './handlers/building-focus-handler';
import * as buildingActionHandler from './handlers/building-action-handler';
import * as roadHandler from './handlers/road-handler';
import * as zoneHandler from './handlers/zone-handler';
import * as buildMenuHandler from './handlers/build-menu-handler';
import * as mapHandler from './handlers/map-handler';

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
    getState: null,
  };
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__spoDebug = debug;
  }
  return debug;
}

// [/E2E-DEBUG]

export class StarpeaceClient implements ClientHandlerContext {
  public readonly callbacks!: ClientCallbacks;

  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private pendingRequests = new Map<string, { resolve: (msg: WsMessage) => void, reject: (err: unknown) => void }>();

  // Canvas-level UI components (owned directly)
  private mapNavigationUI: MapNavigationUI | null = null;
  private minimapUI: MinimapUI | null = null;

  // UI Elements (kept for status only)
  private uiGamePanel: HTMLElement;

  // ── ClientHandlerContext state (public for handler access) ────────────────
  public storedUsername = '';
  public storedPassword = '';
  public availableCompanies: CompanyInfo[] = [];
  public currentCompanyName: string = '';
  public currentWorldName: string = '';
  public worldXSize: number | null = null;
  public worldYSize: number | null = null;
  public savedPlayerX: number | undefined;
  public savedPlayerY: number | undefined;
  public worldSeason: number | null = null;

  // Building focus state
  public currentFocusedBuilding: BuildingFocusInfo | null = null;
  public currentFocusedVisualClass: string | null = null;
  public currentTycoonData: {
    cash: string;
    incomePerHour: string;
    ranking: number;
    buildingCount: number;
    maxBuildings: number;
  } | null = null;

  // Building construction state
  public buildingCategories: BuildingCategory[] = [];
  public lastLoadedFacilities: BuildingInfo[] = [];
  public currentBuildingToPlace: BuildingInfo | null = null;
  public currentBuildingXSize: number = 1;
  public currentBuildingYSize: number = 1;
  public overlayBeforePlacement: { type: 'zones' | 'overlay' | 'none'; overlay?: SurfaceType } = { type: 'none' };

  // Double-click prevention flags
  public isFocusingBuilding: boolean = false;
  public isSendingChatMessage: boolean = false;
  public isJoiningChannel: boolean = false;
  public isSelectingCompany: boolean = false;

  // Road building state — delegated to game-store (single source of truth)
  public get isRoadBuildingMode(): boolean { return useGameStore.getState().isRoadBuildingMode; }
  public set isRoadBuildingMode(v: boolean) { useGameStore.getState().setRoadBuildingMode(v); }
  public isBuildingRoad: boolean = false;
  public get isRoadDemolishMode(): boolean { return useGameStore.getState().isRoadDemolishMode; }
  public set isRoadDemolishMode(v: boolean) { useGameStore.getState().setRoadDemolishMode(v); }

  // Zone painting state — delegated to game-store (single source of truth)
  public get isZonePaintingMode(): boolean { return useGameStore.getState().isZonePaintingMode; }
  public set isZonePaintingMode(v: boolean) { useGameStore.getState().setZonePaintingMode(v); }
  public get selectedZoneType(): number { return useGameStore.getState().selectedZoneType; }
  public set selectedZoneType(v: number) { useGameStore.getState().setSelectedZoneType(v); }

  // Overlay state — delegated to game-store (single source of truth)
  public get isCityZonesEnabled(): boolean { return useGameStore.getState().isCityZonesEnabled; }
  public set isCityZonesEnabled(v: boolean) { useGameStore.getState().setCityZonesEnabled(v); }
  public get activeOverlayType(): SurfaceType | null { return useGameStore.getState().activeOverlay; }
  public set activeOverlayType(v: SurfaceType | null) { useGameStore.getState().setActiveOverlay(v); }

  // Speculative prefetch
  public speculativeBuildingDetails = new Map<string, Promise<BuildingDetailsResponse | null>>();
  public speculativeBuildingResolved = new Map<string, BuildingDetailsResponse | null>();

  // Generation counters
  private requestGeneration = new Map<string, number>();

  // Connect mode
  public isConnectMode: boolean = false;
  public connectSourceBuilding: BuildingDetailsResponse | null = null;
  public connectKeyboardHandler: ((e: KeyboardEvent) => void) | null = null;

  // Logout state
  public isLoggingOut: boolean = false;

  // In-flight dedup
  public inFlightBuildingDetails = new Map<string, Promise<BuildingDetailsResponse | null>>();

  // Audio
  public soundManager: SoundManager;

  private cameraUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  private viewportHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private debugWire: SpoDebugWire; // [E2E-DEBUG]

  constructor() {
    this.uiGamePanel = document.getElementById('game-panel')!;

    this.debugWire = initSpoDebug(); // [E2E-DEBUG]
    this.debugWire.getState = () => this.getDebugState(); // [E2E-DEBUG]
    this.soundManager = new SoundManager();
    const callbacks: Partial<ClientCallbacks> = {
      onBuildRoad: () => roadHandler.toggleRoadBuildingMode(this),
      onDemolishRoad: () => roadHandler.toggleRoadDemolishMode(this),
      onRefreshMap: () => mapHandler.refreshMapData(this),
      onZoomIn: () => this.mapNavigationUI?.getRenderer()?.zoomIn(),
      onZoomOut: () => this.mapNavigationUI?.getRenderer()?.zoomOut(),
      onToggleMinimap: () => { this.minimapUI?.toggle(); },
      onToggleDebugOverlay: () => {
        const renderer = this.mapNavigationUI?.getRenderer();
        if (renderer) renderer.toggleDebugMode();
      },
      onLogout: () => authHandler.logout(this),
      onSwitchServer: () => authHandler.startServerSwitch(),
      onCancelServerSwitch: () => authHandler.cancelServerSwitch(),
      onServerSwitchZoneSelect: (zonePath: string) => authHandler.serverSwitchZoneSelect(this, zonePath),
      onSendChatMessage: (message: string) => chatHandler.sendChatMessage(this, message),
      onJoinChannel: (channelName: string) => chatHandler.joinChannel(this, channelName),
      onAuthCheck: (username: string, password: string) => authHandler.performAuthCheck(this, username, password),
      onDirectoryConnect: (username: string, password: string, zonePath?: string) =>
        authHandler.performDirectoryLogin(this, username, password, zonePath),
      onWorldSelect: (worldName: string) => authHandler.login(this, worldName),
      onCompanySelect: (companyId: string) => authHandler.selectCompanyAndStart(this, companyId),
      onCreateCompany: () => ClientBridge.showCompanyCreationDialog(),
      onCreateCompanySubmit: (companyName: string, cluster: string) =>
        authHandler.handleCreateCompany(this, companyName, cluster),
      onRequestClusterInfo: (clusterName: string) => authHandler.requestClusterInfo(this, clusterName),
      onRequestClusterFacilities: (cluster: string, folder: string) =>
        authHandler.requestClusterFacilities(this, cluster, folder),
      onRequestBuildingCategories: () => buildMenuHandler.openBuildMenu(this),
      onRequestBuildingFacilities: (kind: string, cluster: string) =>
        buildMenuHandler.loadBuildingFacilitiesByKind(this, kind, cluster),
      onPlaceBuilding: (facilityClass: string, visualClassId: string) =>
        buildMenuHandler.placeBuildingFromMenu(this, facilityClass, visualClassId),
      onBuildCapitol: () => buildMenuHandler.startCapitolPlacement(this),
      onOpenCapitol: () => buildMenuHandler.openCapitolInspector(this),
      onSettingsChange: (settings) => this.applySettings(settings),

      // Building actions (called from React BuildingInspector)
      onSetBuildingProperty: (x, y, propertyName, value, additionalParams) =>
        buildingActionHandler.setBuildingProperty(this, x, y, propertyName, value, additionalParams),
      onUpgradeBuilding: (x, y, action, count) =>
        buildingActionHandler.upgradeBuildingAction(this, x, y, action as 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE', count),
      onRefreshBuilding: (x, y) => buildingActionHandler.refreshBuildingDetails(this, x, y),
      onRenameBuilding: (x, y, newName) => buildingActionHandler.renameFacility(this, x, y, newName),
      onDeleteBuilding: (x, y) => buildingActionHandler.deleteFacility(this, x, y).then(success => {
        if (success) ClientBridge.hideBuildingPanel();
      }),
      onNavigateToBuilding: (x, y) => buildingFocusHandler.focusBuilding(this, x, y),
      onInspectFocusedBuilding: () => {
        const { focusedBuilding } = useBuildingStore.getState();
        if (focusedBuilding) {
          buildingFocusHandler.openInspectorForFocused(
            this,
            focusedBuilding.x, focusedBuilding.y,
            focusedBuilding.visualClass,
          );
        }
      },
      onBuildingAction: (actionId, rowData) => {
        const details = useBuildingStore.getState().details;
        if (details) buildingActionHandler.handleBuildingAction(this, actionId, details, rowData);
      },
      onCloneFacility: (x, y, options) => buildingActionHandler.cloneFacility(this, x, y, options),
      onSearchConnections: (x, y, fluidId, fluidName, direction) => {
        ClientBridge.showConnectionPicker({ fluidName, fluidId, direction, buildingX: x, buildingY: y });
      },
      onConnectionSearch: (buildingX, buildingY, fluidId, direction, filters) => {
        useBuildingStore.getState().setConnectionSearching(true);
        buildingActionHandler.searchConnections(this, buildingX, buildingY, fluidId, direction, filters);
      },
      onConnectionConnect: (fluidId, direction, selectedCoords) => {
        const picker = useBuildingStore.getState().connectionPicker;
        if (picker) {
          buildingActionHandler.connectFacilities(this, picker.buildingX, picker.buildingY, fluidId, direction, selectedCoords);
        }
      },
      onDisconnectConnection: (buildingX, buildingY, fluidId, direction, x, y) => {
        const rdoCommand = direction === 'input' ? 'RDODisconnectInput' : 'RDODisconnectOutput';
        buildingActionHandler.setBuildingProperty(this, buildingX, buildingY, rdoCommand, '0', {
          fluidId, connectionList: `${x},${y}`,
        }).then(success => {
          if (success) {
            this.showNotification('Supplier disconnected', 'success');
            const visualClass = this.currentFocusedVisualClass || '0';
            buildingActionHandler.requestBuildingDetails(this, buildingX, buildingY, visualClass).then(details => {
              if (details) ClientBridge.updateBuildingDetails(details);
            });
          }
        }).catch((err: unknown) => {
          this.showNotification(`Failed to disconnect: ${toErrorMessage(err)}`, 'error');
        });
      },

      // Research / Inventions
      onResearchLoadInventory: (buildingX, buildingY, categoryIndex) =>
        buildingActionHandler.loadResearchInventory(this, buildingX, buildingY, categoryIndex),
      onResearchGetDetails: (buildingX, buildingY, inventionId) =>
        buildingActionHandler.getResearchDetails(this, buildingX, buildingY, inventionId),
      onResearchQueueInvention: (buildingX, buildingY, inventionId) =>
        buildingActionHandler.queueResearchDirect(this, buildingX, buildingY, inventionId),
      onResearchCancelInvention: (buildingX, buildingY, inventionId) =>
        buildingActionHandler.cancelResearchDirect(this, buildingX, buildingY, inventionId),
      onResearchFetchCategoryTabs: () =>
        buildingActionHandler.fetchResearchCategoryTabs(),

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
      onSearchMenuTycoonProfile: (tycoonName) => this.sendMessage({
        type: WsMessageType.REQ_SEARCH_MENU_TYCOON_PROFILE, tycoonName,
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
      onProfileSwitchCompany: (companyId, companyName, ownerRole) =>
        authHandler.profileSwitchCompany(this, companyId, companyName, ownerRole),

      // Politics
      onRequestPoliticsData: (townName, buildingX, buildingY) => {
        this.sendMessage({
          type: WsMessageType.REQ_POLITICS_DATA,
          townName, buildingX, buildingY,
        });
      },
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
      onToggleZonePainting: (zoneType: number) => zoneHandler.toggleZonePaintingMode(this, zoneType),
      onCancelZonePainting: () => zoneHandler.cancelZonePaintingMode(this),

      // Overlays
      onToggleCityZones: () => mapHandler.toggleCityZones(this),
      onSetOverlay: (surfaceType: SurfaceType | null) => mapHandler.setOverlay(this, surfaceType),
    };

    this.callbacks = callbacks as ClientCallbacks;

    this.setupAudio();
    this.init();
  }

  // ── ClientHandlerContext implementation ─────────────────────────────────────

  public sendRequest<T extends WsMessage>(msg: T, timeoutMs = 15000): Promise<WsMessage> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isConnected) return reject(new Error('WebSocket not connected'));

      const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      msg.wsRequestId = requestId;
      this.pendingRequests.set(requestId, { resolve, reject });
      // [E2E-DEBUG]
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

  public sendMessage<T extends WsMessage>(msg: T): void {
    if (!this.ws || !this.isConnected) {
      console.error('[Client] Cannot send message: WebSocket not connected');
      return;
    }
    // [E2E-DEBUG]
    this.debugWire.sent++;
    this.debugWire.lastSent = msg.type || '';
    this.debugWire.history.push({ dir: '→', type: msg.type || '?', ts: Date.now() });
    if (this.debugWire.history.length > this.debugWire.maxHistory) this.debugWire.history.shift();
    ClientBridge.log('Wire', `→ SEND ${msg.type}`);
    // [/E2E-DEBUG]
    this.ws.send(JSON.stringify(msg));
  }

  public rawSend(msg: WsMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  public nextGeneration(category: string): number {
    const gen = (this.requestGeneration.get(category) ?? 0) + 1;
    this.requestGeneration.set(category, gen);
    return gen;
  }

  public isCurrentGeneration(category: string, gen: number): boolean {
    return this.requestGeneration.get(category) === gen;
  }

  public showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info'): void {
    if (type === 'success') ClientBridge.showSuccess(message);
    else if (type === 'error') ClientBridge.showError(message);
    else if (type === 'warning') ClientBridge.showWarning(message);
    else ClientBridge.showInfo(message);
  }

  public getRenderer() {
    return this.mapNavigationUI?.getRenderer() ?? null;
  }

  public getMapNavigationUI() {
    return this.mapNavigationUI;
  }

  // ── Cross-handler delegates ──────────────────────────────────────────────

  public requestBuildingDetails(x: number, y: number, visualClass: string) {
    return buildingActionHandler.requestBuildingDetails(this, x, y, visualClass);
  }

  public refreshBuildingDetails(x: number, y: number) {
    return buildingActionHandler.refreshBuildingDetails(this, x, y);
  }

  public setBuildingProperty(x: number, y: number, propertyName: string, value: string, additionalParams?: Record<string, string>) {
    return buildingActionHandler.setBuildingProperty(this, x, y, propertyName, value, additionalParams);
  }

  public loadMapArea(x?: number, y?: number, w?: number, h?: number) {
    mapHandler.loadMapArea(this, x, y, w, h);
  }

  public loadAlignedMapArea(x: number, y: number, margin?: number) {
    mapHandler.loadAlignedMapArea(this, x, y, margin);
  }

  public loadAlignedMapAreaForRect(x1: number, y1: number, x2: number, y2: number) {
    mapHandler.loadAlignedMapAreaForRect(this, x1, y1, x2, y2);
  }

  public fetchSurfaceForArea(surfaceType: SurfaceType, x1: number, y1: number, x2: number, y2: number) {
    return mapHandler.fetchSurfaceForArea(this, surfaceType, x1, y1, x2, y2);
  }

  public toggleZoneOverlay(enabled: boolean, surfaceType: SurfaceType) {
    mapHandler.toggleZoneOverlay(this, enabled, surfaceType);
  }

  public cancelBuildingPlacement() {
    buildMenuHandler.cancelBuildingPlacement(this);
  }

  public cancelRoadBuildingMode() {
    roadHandler.cancelRoadBuildingMode(this);
  }

  public cancelRoadDemolishMode() {
    roadHandler.cancelRoadDemolishMode(this);
  }

  public cancelZonePaintingMode() {
    zoneHandler.cancelZonePaintingMode(this);
  }

  public requestUserList() {
    return chatHandler.requestUserList(this);
  }

  public focusBuilding(x: number, y: number, visualClass?: string) {
    return buildingFocusHandler.focusBuilding(this, x, y, visualClass);
  }

  public loadResearchInventory(buildingX: number, buildingY: number, categoryIndex: number) {
    buildingActionHandler.loadResearchInventory(this, buildingX, buildingY, categoryIndex);
  }

  public preloadFacilityDimensions() {
    return buildMenuHandler.preloadFacilityDimensions(this);
  }

  public async connectMailService(): Promise<void> {
    const req: WsReqMailConnect = { type: WsMessageType.REQ_MAIL_CONNECT };
    this.sendMessage(req);
  }

  public async getProfile(): Promise<void> {
    const req: WsReqGetProfile = { type: WsMessageType.REQ_GET_PROFILE };
    this.sendMessage(req);
  }

  public initChatChannels() {
    return chatHandler.initChatChannels(this);
  }

  public sendCameraPositionNow(): void {
    const renderer = this.mapNavigationUI?.getRenderer();
    if (!renderer || !this.isConnected || !this.ws) return;
    const pos = renderer.getCameraPosition();
    const bounds = renderer.getVisibleTileBounds();
    this.sendMessage({
      type: WsMessageType.REQ_UPDATE_CAMERA,
      x: pos.x,
      y: pos.y,
      viewX: bounds.minJ,
      viewY: bounds.minI,
      viewW: bounds.maxJ - bounds.minJ,
      viewH: bounds.maxI - bounds.minI,
    });
  }

  // ── Game View Initialization ─────────────────────────────────────────────

  public async switchToGameView(): Promise<void> {
    this.uiGamePanel.style.display = 'flex';
    this.uiGamePanel.style.flexDirection = 'column';

    if (this.mapNavigationUI) {
      this.mapNavigationUI.destroy();
      this.mapNavigationUI = null;
    }
    if (this.minimapUI) {
      this.minimapUI.destroy();
      this.minimapUI = null;
    }

    this.mapNavigationUI = new MapNavigationUI(this.uiGamePanel, this.currentWorldName);
    await this.mapNavigationUI.init();
    this.setupGameUICallbacks();

    this.sendCameraPositionNow();

    this.viewportHeartbeatTimer = setInterval(() => {
      this.sendCameraPositionNow();
    }, 30_000);

    ClientBridge.updateTycoonStats({
      username: this.storedUsername,
      cash: '0', incomePerHour: '0', ranking: 0, buildingCount: 0, maxBuildings: 0,
    });

    this.minimapUI = new MinimapUI();
    const renderer = this.mapNavigationUI.getRenderer();
    if (renderer) {
      this.minimapUI.setRenderer(renderer);
    }

    ClientBridge.loadPersistedSettings();
    const initialSettings = ClientBridge.getSettings();
    this.applySettings(initialSettings);

    ClientBridge.log('Renderer', 'Game view initialized');
  }

  // ── Private infrastructure ───────────────────────────────────────────────

  private setupAudio(): void {
    const initAudio = () => {
      this.soundManager.initOnInteraction();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);
  }

  private applySettings(settings: GameSettings): void {
    if (this.mapNavigationUI) {
      const renderer = this.mapNavigationUI.getRenderer();
      if (renderer) {
        renderer.setHideVegetationOnMove(settings.hideVegetationOnMove);
        renderer.setDebugMode(settings.debugOverlay);
        renderer.setVehicleAnimationsEnabled(settings.vehicleAnimations);
      }
    }
    this.soundManager.setEnabled(settings.soundEnabled);
    this.soundManager.setVolume(settings.soundVolume);
    if (this.minimapUI) {
      this.minimapUI.setSize(settings.minimapSize);
    }
    ClientBridge.persistSettings(settings);
  }

  private setupGameUICallbacks() {
    if (this.mapNavigationUI) {
      this.mapNavigationUI.setOnLoadZone((x, y, w, h) => {
        ClientBridge.log('Map', `Requesting zone (${x}, ${y}) ${w}x${h}`);
        this.loadMapArea(x, y, w, h);
        this.sendCameraPositionDebounced();
      });

      this.mapNavigationUI.setOnViewportChanged(() => {
        this.sendCameraPositionDebounced();
      });

      this.mapNavigationUI.setOnBuildingClick((x, y, visualClass) => {
        if (this.currentBuildingToPlace) {
          buildMenuHandler.placeBuilding(this, x, y);
        } else {
          buildingFocusHandler.handleMapClick(this, x, y, visualClass);
        }
      });

      this.mapNavigationUI.setOnEmptyMapClick(() => {
        buildingFocusHandler.unfocusBuilding(this);
      });

      const renderer = this.mapNavigationUI.getRenderer();
      if (renderer) {
        setWorldToScreenFn((worldX, worldY) => renderer.worldToScreen(worldX, worldY));
        setWorldToScreenCenteredFn((worldX, worldY, xsize, ysize) =>
          renderer.worldToScreenCentered(worldX, worldY, xsize, ysize)
        );
      }

      this.mapNavigationUI.setOnFetchFacilityDimensions(async (visualClass) => {
        const cache = getFacilityDimensionsCache();
        if (!cache.isInitialized()) return null;
        return cache.getFacility(visualClass) || null;
      });
    }
  }

  /** Poll /api/startup-status via SSE; falls back to fetch polling if SSE unavailable. */
  private pollServerStartup(): void {
    interface StartupData {
      phase: string;
      progress: number;
      message: string;
      services?: Array<{ name: string; status: 'pending' | 'running' | 'complete' | 'failed'; progress: number; subStep?: string }>;
      cacheSteps?: Array<{ name: string; label: string; status: 'pending' | 'running' | 'complete' }>;
    }

    const onReady = () => ClientBridge.setServerStartupProgress({ ready: true, progress: 1, message: 'Server ready' });

    const applyData = (data: StartupData) => {
      ClientBridge.setServerStartupProgress({
        ready: data.phase === 'ready',
        progress: data.progress,
        message: data.message,
        services: data.services ?? [],
        cacheSteps: data.cacheSteps,
      });
    };

    const startFetchPoll = () => {
      const check = () => {
        fetch('/api/startup-status', { headers: { Accept: 'application/json' } })
          .then(r => r.json())
          .then((data: StartupData) => {
            applyData(data);
            if (data.phase !== 'ready') setTimeout(check, 2000);
          })
          .catch(() => setTimeout(check, 2000));
      };
      check();
    };

    try {
      const es = new EventSource('/api/startup-status');
      es.addEventListener('status', (e: MessageEvent) => {
        const data = JSON.parse(e.data) as StartupData;
        applyData(data);
        if (data.phase === 'ready') { es.close(); onReady(); }
      });
      es.onerror = () => { es.close(); startFetchPoll(); };
    } catch {
      startFetchPoll();
    }
  }

  private init() {
    this.pollServerStartup();

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
      } catch (e: unknown) {
        console.error('[Client] Failed to parse message:', e);
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      this.cleanupTimers();
      ClientBridge.log('System', 'Gateway Disconnected.');
      ClientBridge.setDisconnected();
    };

    this.ws.onerror = (error) => {
      console.error('[Client] WebSocket error:', error);
      ClientBridge.log('Error', 'WebSocket error occurred');
    };

    // Send logout on page close
    this.beforeUnloadHandler = () => {
      this.sendLogoutBeacon();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
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

    // 2. Events & Pushes — dispatched to handler module
    dispatchEvent(this, msg);
  }

  private cleanupTimers(): void {
    if (this.viewportHeartbeatTimer !== null) {
      clearInterval(this.viewportHeartbeatTimer);
      this.viewportHeartbeatTimer = null;
    }
    if (this.cameraUpdateTimer !== null) {
      clearTimeout(this.cameraUpdateTimer);
      this.cameraUpdateTimer = null;
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }

  private sendCameraPositionDebounced(): void {
    if (this.cameraUpdateTimer !== null) {
      clearTimeout(this.cameraUpdateTimer);
    }
    this.cameraUpdateTimer = setTimeout(() => {
      this.cameraUpdateTimer = null;
      this.sendCameraPositionNow();
    }, 2000);
  }

  private sendLogoutBeacon(): void {
    if (!this.isConnected || !this.ws) return;

    try {
      const req = { type: WsMessageType.REQ_LOGOUT };
      this.ws.send(JSON.stringify(req));
    } catch (_err: unknown) {
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
          canvasHasContent = sample.data[3] > 0;
        }
      } catch (_: unknown) { /* security or empty canvas */ }
    }

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

    const chatStoreState = useChatStore.getState();
    const channelMsgs = chatStoreState.messages[chatStoreState.currentChannel] ?? [];
    const lastMsg = channelMsgs[channelMsgs.length - 1]?.text ?? '';

    const rendererAny = renderer as unknown as Record<string, unknown> | null;
    const terrainRenderer = rendererAny?.terrainRenderer as Record<string, unknown> | undefined;
    const ROTATION_NAMES = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const rotation = typeof terrainRenderer?.getRotation === 'function'
      ? (ROTATION_NAMES[terrainRenderer.getRotation() as number] ?? 'UNKNOWN') : 'UNKNOWN';

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
