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
} from '../shared/types';
import { getErrorMessage } from '../shared/error-codes';
import { toErrorMessage } from '../shared/error-utils';
import { Season } from '../shared/map-config';
import { UIManager } from './ui/ui-manager';
import { getFacilityDimensionsCache } from './facility-dimensions-cache';
import { ConnectionPickerDialog } from './ui/building-details';
import { SoundManager } from './audio/sound-manager';
import { CompanyCreationDialog } from './ui/company-creation-dialog';
import { KeyBindingRegistry } from './input/key-binding-registry';

export class StarpeaceClient {
  private ws: WebSocket | null = null;
  private isConnected: boolean = false;
  private pendingRequests = new Map<string, { resolve: (msg: WsMessage) => void, reject: (err: unknown) => void }>();

  // UI Manager
  private ui: UIManager;

  // UI Elements (kept for status only)
  private uiGamePanel: HTMLElement;
  private uiStatus: HTMLElement;

  // Session state
  private storedUsername = '';
  private storedPassword = '';
  private availableCompanies: CompanyInfo[] = [];
  private currentCompanyName: string = '';
  private currentWorldName: string = '';
  private worldXSize: number | null = null;
  private worldYSize: number | null = null;
  private worldSeason: number | null = null;

  // Building focus state
  private currentFocusedBuilding: BuildingFocusInfo | null = null;
  private currentFocusedVisualClass: string | null = null;

  // Building construction state
  private buildingCategories: BuildingCategory[] = [];
  private currentBuildingToPlace: BuildingInfo | null = null;

  // Double-click prevention flags
  private isFocusingBuilding: boolean = false;
  private isSendingChatMessage: boolean = false;
  private isJoiningChannel: boolean = false;
  private isSelectingCompany: boolean = false;

  // Clone facility state
  private isCloneMode: boolean = false;
  private cloneSourceBuilding: BuildingDetailsResponse | null = null;

  // Connection picker dialog state
  private connectionPickerDialog: ConnectionPickerDialog | null = null;

  // Road building state
  private isRoadBuildingMode: boolean = false;
  private isBuildingRoad: boolean = false;
  private isRoadDemolishMode: boolean = false;

  // Logout state
  private isLoggingOut: boolean = false;

  // Audio
  private soundManager: SoundManager;

  // Company creation dialog
  private companyCreationDialog: CompanyCreationDialog | null = null;

  // Key binding registry
  private keyBindingRegistry: KeyBindingRegistry;

  constructor() {
    this.uiGamePanel = document.getElementById('game-panel')!;
    this.uiStatus = document.getElementById('status-indicator')!;

    this.ui = new UIManager();
    this.soundManager = new SoundManager();
    this.keyBindingRegistry = new KeyBindingRegistry();
    this.setupUICallbacks();
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
   * Configure les callbacks des composants UI
   */
  private setupUICallbacks() {
    // LoginUI callbacks
    this.ui.loginUI.setOnDirectoryConnect((username, password, zonePath) => {
      this.performDirectoryLogin(username, password, zonePath);
    });

    this.ui.loginUI.setOnWorldSelect((worldName) => {
      this.login(worldName);
    });

    this.ui.loginUI.setOnCompanySelect((companyId) => {
      this.selectCompanyAndStart(companyId);
    });

    this.ui.loginUI.setOnCreateCompany(() => {
      this.showCompanyCreationDialog();
    });
  }

  /**
   * Configure les callbacks des composants Game UI
   */
  private setupGameUICallbacks() {
    // ChatUI callbacks
    if (this.ui.chatUI) {
      this.ui.chatUI.setOnSendMessage((message) => {
        this.sendChatMessage(message);
      });

      this.ui.chatUI.setOnJoinChannel((channel) => {
        this.joinChannel(channel);
      });

      this.ui.chatUI.setOnGetUsers(() => {
        this.requestUserList();
      });

      this.ui.chatUI.setOnGetChannels(() => {
        this.requestChannelList();
      });

      this.ui.chatUI.setOnTypingStatus((isTyping) => {
        this.sendTypingStatus(isTyping);
      });
    }

    // MapNavigationUI callbacks
    if (this.ui.mapNavigationUI) {
      this.ui.mapNavigationUI.setOnLoadZone((x, y, w, h) => {
        this.ui.log('Map', `Requesting zone (${x}, ${y}) ${w}x${h}`);
        this.loadMapArea(x, y, w, h);
      });

      this.ui.mapNavigationUI.setOnBuildingClick((x, y, visualClass) => {
        this.handleMapClick(x, y, visualClass);
      });

      this.ui.mapNavigationUI.setOnFetchFacilityDimensions(async (visualClass) => {
        return await this.getFacilityDimensions(visualClass);
      });
    }

    // ToolbarUI callbacks (unimplemented features)
    if (this.ui.toolbarUI) {
      this.ui.toolbarUI.setOnBuildMenu(() => {
        this.openBuildMenu();
      });

      this.ui.toolbarUI.setOnBuildRoad(() => {
        this.toggleRoadBuildingMode();
      });

      this.ui.toolbarUI.setOnDemolishRoad(() => {
        this.toggleRoadDemolishMode();
      });

      this.ui.toolbarUI.setOnSearch(() => {
        this.ui.showSearchMenu();
      });

      this.ui.toolbarUI.setOnCompanyMenu(() => {
        this.ui.showProfilePanel('companies');
      });

      this.ui.toolbarUI.setOnMail(() => {
        this.ui.showMailPanel();
      });

      this.ui.toolbarUI.setOnLogout(() => {
        this.logout();
      });

      this.ui.toolbarUI.setOnRefresh(() => {
        this.refreshMapData();
      });

      this.ui.toolbarUI.setOnSettings(() => {
        if (this.ui.settingsPanel) {
          this.ui.settingsPanel.toggle();
        }
      });

      this.ui.toolbarUI.setOnTransport(() => {
        if (this.ui.transportPanel) {
          this.ui.transportPanel.toggle();
        }
      });
    }

    // BuildMenuUI callbacks
    if (this.ui.buildMenuUI) {
      this.ui.buildMenuUI.setOnCategorySelected((category) => {
        this.loadBuildingFacilities(category);
      });

      this.ui.buildMenuUI.setOnBuildingSelected((building) => {
        this.startBuildingPlacement(building);
      });

      this.ui.buildMenuUI.setOnClose(() => {
        this.cancelBuildingPlacement();
      });
    }

    // ZoneOverlayUI callbacks
    if (this.ui.zoneOverlayUI) {
      this.ui.zoneOverlayUI.setOnToggle((enabled, type) => {
        this.toggleZoneOverlay(enabled, type);
      });
    }
  }

  private init() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    this.ui.log('System', `Connecting to Gateway at ${url}...`);

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.isConnected = true;
      this.uiStatus.textContent = "● Online";
      this.uiStatus.style.color = "#0f0";
      this.ui.log('System', 'Gateway Connected.');
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
      this.uiStatus.textContent = "● Offline";
      this.uiStatus.style.color = "#f00";
      this.ui.log('System', 'Gateway Disconnected.');
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
    this.ws.send(JSON.stringify(msg));
  }

  private handleMessage(msg: WsMessage) {
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
      case WsMessageType.EVENT_CHAT_MSG:
        const chat = msg as WsEventChatMsg;
        const isSystem = chat.from === 'SYSTEM';
        this.ui.renderChatMessage(chat.from, chat.message, isSystem);
        this.ui.log('Chat', `[${chat.channel}] ${chat.from}: ${chat.message}`);
        this.soundManager.play('chat-message');
        break;

      case WsMessageType.EVENT_CHAT_USER_TYPING:
        const typing = msg as WsEventChatUserTyping;
        if (this.ui.chatUI) {
          this.ui.chatUI.updateUserTypingStatus(typing.username, typing.isTyping);
        }
        break;

      case WsMessageType.EVENT_CHAT_CHANNEL_CHANGE:
        const channelChange = msg as WsEventChatChannelChange;
        if (this.ui.chatUI) {
          this.ui.chatUI.setCurrentChannel(channelChange.channelName);
        }
        this.requestUserList();
        break;

      case WsMessageType.EVENT_CHAT_USER_LIST_CHANGE:
        const userChange = msg as WsEventChatUserListChange;
        // User list will be refreshed on next request
        break;

      case WsMessageType.EVENT_MAP_DATA:
      case WsMessageType.RESP_MAP_DATA:
        const mapMsg = msg as WsRespMapData;
        this.ui.log('Map', `Received area (${mapMsg.data.x}, ${mapMsg.data.y}): ${mapMsg.data.buildings.length} buildings, ${mapMsg.data.segments.length} segments`);
        this.ui.updateMapData(mapMsg.data);
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
              this.ui.updateBuildingDetailsPanel(refreshedDetails);
            }
          }).catch(err => {
            this.ui.log('Error', `Failed to refresh building: ${toErrorMessage(err)}`);
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
          this.ui.log('Tycoon', `Cash: ${tycoonUpdate.cash} | Income/h: ${tycoonUpdate.incomePerHour} | Rank: ${tycoonUpdate.ranking} | Buildings: ${tycoonUpdate.buildingCount}/${tycoonUpdate.maxBuildings}`);

          // --- UPDATE: Update the UI ---
          this.ui.updateTycoonStats({
            username: this.storedUsername,
            ...this.currentTycoonData,
            failureLevel: tycoonUpdate.failureLevel,
          });
        break;

      case WsMessageType.EVENT_RDO_PUSH:
        const pushData = (msg as any).rawPacket || msg;
        this.ui.log('Push', `Received: ${JSON.stringify(pushData).substring(0, 100)}...`);
        break;

      case WsMessageType.EVENT_END_OF_PERIOD:
        this.ui.log('Period', 'Financial period ended — refreshing data');
        this.showNotification('Financial period ended', 'info');
        this.soundManager.play('period-end');
        // Refresh tycoon stats to reflect latest P&L
        this.refreshTycoonData();
        break;

      // Mail Events
      case WsMessageType.EVENT_NEW_MAIL: {
        const newMail = msg as WsEventNewMail;
        this.ui.log('Mail', `New mail! ${newMail.unreadCount} unread message(s)`);
        this.soundManager.play('mail');
        if (this.ui.toolbarUI) {
          this.ui.toolbarUI.setMailBadge(newMail.unreadCount);
        }
        if (this.ui.mailPanel) {
          this.ui.mailPanel.setUnreadCount(newMail.unreadCount);
        }
        break;
      }

      // Mail Responses (delegated to mail panel)
      case WsMessageType.RESP_MAIL_CONNECTED: {
        const mailConn = msg as WsRespMailConnected;
        this.ui.log('Mail', `Mail service connected. ${mailConn.unreadCount} unread.`);
        if (this.ui.toolbarUI) {
          this.ui.toolbarUI.setMailBadge(mailConn.unreadCount);
        }
        break;
      }

      case WsMessageType.RESP_MAIL_FOLDER:
      case WsMessageType.RESP_MAIL_MESSAGE:
      case WsMessageType.RESP_MAIL_SENT:
      case WsMessageType.RESP_MAIL_DELETED:
      case WsMessageType.RESP_MAIL_UNREAD_COUNT:
      case WsMessageType.RESP_MAIL_DRAFT_SAVED:
        this.ui.handleMailResponse(msg);
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
        this.ui.handleSearchMenuResponse(msg);
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
        this.ui.handleProfileResponse(msg);
        break;

      // Politics Response
      case WsMessageType.RESP_POLITICS_DATA:
        this.ui.handlePoliticsResponse(msg);
        break;

      // Transport Response
      case WsMessageType.RESP_TRANSPORT_DATA:
        if (this.ui.transportPanel) {
          this.ui.transportPanel.handleMessage(msg);
        }
        break;

      // Connection Search Response
      case WsMessageType.RESP_SEARCH_CONNECTIONS: {
        const searchResp = msg as WsRespSearchConnections;
        if (this.connectionPickerDialog) {
          this.connectionPickerDialog.updateResults(searchResp.results);
        }
        break;
      }

      // Profile Response
      case WsMessageType.RESP_GET_PROFILE: {
        const profile = (msg as WsRespGetProfile).profile;
        this.ui.log('Profile', `Profile loaded: ${profile.name} (${profile.levelName})`);
        const baseStats = this.currentTycoonData ?? {
          cash: profile.budget,
          incomePerHour: '0',
          ranking: profile.ranking,
          buildingCount: profile.facCount,
          maxBuildings: profile.facMax,
        };
        this.ui.updateTycoonStats({
          username: this.storedUsername,
          ...baseStats,
          prestige: profile.prestige,
          levelName: profile.levelName,
          levelTier: profile.levelTier,
          area: profile.area,
        });
        // Update profile panel tycoon info
        if (this.ui.profilePanel) {
          this.ui.profilePanel.setTycoonInfo(profile.name, profile.ranking, this.currentWorldName, profile.photoUrl);
        }
        break;
      }

      // Error responses without wsRequestId (from fire-and-forget messages like search menu)
      case WsMessageType.RESP_ERROR: {
        const errorResp = msg as WsRespError;
        this.ui.log('Error', errorResp.errorMessage || 'Unknown error');
        // If search menu is open, show the error there
        if (this.ui.searchMenuPanel) {
          this.ui.handleSearchMenuError(errorResp.errorMessage || 'Request failed');
        }
        break;
      }
    }
  }

  // --- Actions ---

  private async performDirectoryLogin(username: string, password: string, zonePath?: string) {
    this.storedUsername = username;
    this.storedPassword = password;
    const zoneDisplay = zonePath?.split('/').pop() || 'BETA';
    this.ui.log('Directory', `Authenticating for ${zoneDisplay}...`);

    try {
      const req: WsReqConnectDirectory = {
        type: WsMessageType.REQ_CONNECT_DIRECTORY,
        username,
        password,
        zonePath
      };

      const resp = (await this.sendRequest(req)) as WsRespConnectSuccess;
      this.ui.log('Directory', `Authentication Success. Found ${resp.worlds.length} world(s) in ${zoneDisplay}.`);
      this.ui.loginUI.renderWorldList(resp.worlds);
      this.ui.loginUI.hideConnectButton();
    } catch (err: unknown) {
      this.ui.log('Error', `Directory Auth Failed: ${toErrorMessage(err)}`);
      alert('Login Failed: ' + toErrorMessage(err));
    }
  }

  private async login(worldName: string) {
    if (!this.storedUsername || !this.storedPassword) {
      alert('Session lost, please reconnect');
      return;
    }

    this.ui.log('Login', `Joining world ${worldName}...`);
    this.ui.loginUI.showWorldListLoading(`Connecting to ${worldName}...`);
    this.currentWorldName = worldName;

    try {
      const req: WsReqLoginWorld = {
        type: WsMessageType.REQ_LOGIN_WORLD,
        username: this.storedUsername,
        password: this.storedPassword,
        worldName
      };
      const resp = (await this.sendRequest(req)) as WsRespLoginSuccess;
      this.ui.log('Login', `Success! Tycoon: ${resp.tycoonId}`);

      // Store world properties from InterfaceServer
      if (resp.worldXSize !== undefined) this.worldXSize = resp.worldXSize;
      if (resp.worldYSize !== undefined) this.worldYSize = resp.worldYSize;
      if (resp.worldSeason !== undefined) this.worldSeason = resp.worldSeason;

      if (resp.companies && resp.companies.length > 0) {
        this.availableCompanies = resp.companies;
        this.ui.log('Login', `Found ${resp.companies.length} compan${resp.companies.length > 1 ? 'ies' : 'y'}`);

        this.ui.loginUI.showCompanyListLoading('Loading companies...');

        // Small delay for loading state visibility
        setTimeout(() => {
          this.ui.loginUI.renderCompanySelection(resp.companies || []);
        }, 300);
      } else {
        this.ui.log('Error', 'No companies found - cannot proceed');
        this.showNotification('No companies available for this account', 'error');
      }

    } catch (err: unknown) {
      this.ui.log('Error', `Login failed: ${toErrorMessage(err)}`);
      this.ui.loginUI.showWorldListLoading('Connection failed. Please try again.');
      this.showNotification(`World login failed: ${toErrorMessage(err)}`, 'error');
    }
  }

  private async selectCompanyAndStart(companyId: string) {
    // Double-click prevention
    if (this.isSelectingCompany) {
      return;
    }

    this.isSelectingCompany = true;
    this.ui.log('Company', `Selecting company ID: ${companyId}...`);
    this.ui.loginUI.showCompanyListLoading('Loading world...');

    try {
      // Find the selected company
      const company = this.availableCompanies.find(c => c.id === companyId);

      if (!company) {
        throw new Error('Company not found');
      }

      // Check if we need to switch company (role-based)
      const needsSwitch = company.ownerRole && company.ownerRole !== this.storedUsername;

      if (needsSwitch) {
        this.ui.log('Company', `Switching to role-based company: ${company.name} (${company.ownerRole})...`);

        // Use switchCompany instead of selectCompany
        const req: WsReqSwitchCompany = {
          type: WsMessageType.REQ_SWITCH_COMPANY,
          company: company
        };

        await this.sendRequest(req);
        this.ui.log('Company', 'Company switch successful');
      } else {
        // Normal company selection
        const req: WsReqSelectCompany = {
          type: WsMessageType.REQ_SELECT_COMPANY,
          companyId
        };

        await this.sendRequest(req);
        this.ui.log('Company', 'Company selected successfully');
      }

      // Store company name for building construction
      this.currentCompanyName = company.name;

      // Preload all facility dimensions (one-time, ~15KB)
      await this.preloadFacilityDimensions();

      // Switch to game view
      this.switchToGameView();

      // Apply server WorldSeason to renderer (overrides default SUMMER)
      if (this.worldSeason !== null) {
        const renderer = this.ui.mapNavigationUI?.getRenderer();
        if (renderer) {
          renderer.setSeason(this.worldSeason as Season);
        }
      }

      // Connect to mail service (non-blocking, fire-and-forget)
      this.connectMailService().catch(err => {
        this.ui.log('Mail', `Mail service connection failed: ${toErrorMessage(err)}`);
      });

      // Fetch extended tycoon profile (non-blocking)
      this.getProfile().catch(err => {
        this.ui.log('Profile', `Profile fetch failed: ${toErrorMessage(err)}`);
      });

      // NOTE: Initial map area is loaded by the zone system via triggerZoneCheck()
      // Do NOT call loadMapArea() here to avoid duplicate requests
    } catch (err: unknown) {
      this.ui.log('Error', `Company selection failed: ${toErrorMessage(err)}`);
      this.ui.loginUI.showCompanyListLoading('Failed to load world. Please try again.');
      this.showNotification(`Company selection failed: ${toErrorMessage(err)}`, 'error');
    } finally {
      this.isSelectingCompany = false;
    }
  }

  private showCompanyCreationDialog(): void {
    // Known clusters — could be fetched from server in future
    const defaultClusters = ['PGI', 'Moab', 'Dissidents', 'Magna', 'Mariko'];

    if (!this.companyCreationDialog) {
      this.companyCreationDialog = new CompanyCreationDialog({
        onCreateCompany: async (companyName: string, cluster: string) => {
          const req: WsReqCreateCompany = {
            type: WsMessageType.REQ_CREATE_COMPANY,
            companyName,
            cluster,
          };

          const resp = await this.sendRequest(req) as WsRespCreateCompany;
          this.ui.log('Company', `Company created: "${resp.companyName}" (ID: ${resp.companyId})`);
          this.showNotification(`Company "${resp.companyName}" created!`, 'success');
          this.soundManager.play('notification');

          // Add new company to list and auto-select it
          this.availableCompanies.push({
            id: resp.companyId,
            name: resp.companyName,
            ownerRole: this.storedUsername,
          });
          this.selectCompanyAndStart(resp.companyId);
        },
        onCancel: () => {
          // Nothing to do
        },
      });
    }

    this.companyCreationDialog.show(defaultClusters);
  }

  private loadMapArea(x?: number, y?: number, w: number = 64, h: number = 64) {
    const coords = x !== undefined && y !== undefined ? ` at (${x}, ${y})` : ' at player position';
    this.ui.log('Map', `Loading area${coords} ${w}x${h}...`);

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
    this.ui.loginUI.hide();
    this.uiGamePanel.style.display = 'flex';
    this.uiGamePanel.style.flexDirection = 'column';

    // Initialize Game UI
    this.ui.initGameUI(this.uiGamePanel, (msg) => this.sendMessage(msg));
    this.setupGameUICallbacks();
    this.ui.initTycoonStats(this.storedUsername);

    // Wire profile panel company switching callback
    if (this.ui.profilePanel) {
      this.ui.profilePanel.setOnSwitchCompany((companyName: string, _companyId: number) => {
        // Find matching company from available companies
        const company = this.availableCompanies.find(c => c.name === companyName);
        if (company) {
          this.ui.log('Profile', `Switching to company: ${companyName}`);
          this.selectCompanyAndStart(company.id);
        }
      });
    }

    // Wire minimap and settings to renderer
    if (this.ui.mapNavigationUI) {
      const renderer = this.ui.mapNavigationUI.getRenderer();
      if (renderer) {
        if (this.ui.minimapUI) {
          this.ui.minimapUI.setRenderer(renderer);
        }
        if (this.ui.settingsPanel) {
          this.ui.settingsPanel.setRenderer(renderer);
        }
      }
    }

    // Wire key binding registry to settings panel
    if (this.ui.settingsPanel) {
      this.ui.settingsPanel.setKeyBindingRegistry(this.keyBindingRegistry);
    }

    // Wire sound manager to settings
    if (this.ui.settingsPanel) {
      const initialSettings = this.ui.settingsPanel.getSettings();
      this.soundManager.setEnabled(initialSettings.soundEnabled);
      this.soundManager.setVolume(initialSettings.soundVolume);
      this.ui.settingsPanel.setOnSettingsChange((settings) => {
        this.soundManager.setEnabled(settings.soundEnabled);
        this.soundManager.setVolume(settings.soundVolume);
        if (this.ui.mapNavigationUI) {
          const renderer = this.ui.mapNavigationUI.getRenderer();
          if (renderer) {
            renderer.setVehicleAnimationsEnabled(settings.vehicleAnimations);
            renderer.setEdgeScrollEnabled(settings.edgeScrollEnabled);
          }
        }
      });
    }

    this.ui.log('Renderer', 'Game view initialized');
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
      this.ui.log('Error', `Failed to send message: ${toErrorMessage(err)}`);
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

      if (this.ui.chatUI) {
        this.ui.chatUI.updateUserList(resp.users);
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to get user list: ${toErrorMessage(err)}`);
    }
  }

  private async requestChannelList() {
    try {
      const req: WsReqChatGetChannels = {
        type: WsMessageType.REQ_CHAT_GET_CHANNELS
      };
      const resp = (await this.sendRequest(req)) as WsRespChatChannelList;

      if (this.ui.chatUI) {
        this.ui.chatUI.updateChannelList(resp.channels);
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to get channel list: ${toErrorMessage(err)}`);
    }
  }

  private async joinChannel(channelName: string) {
    // Double-click prevention
    if (this.isJoiningChannel) {
      return;
    }

    this.isJoiningChannel = true;

    try {
      this.ui.log('Chat', `Joining channel: ${channelName || 'Lobby'}`);
      const req: WsReqChatJoinChannel = {
        type: WsMessageType.REQ_CHAT_JOIN_CHANNEL,
        channelName
      };
      await this.sendRequest(req);

      if (this.ui.chatUI) {
        this.ui.chatUI.clearMessages();
        this.ui.chatUI.hideChannelList();
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to join channel: ${toErrorMessage(err)}`);
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
    this.ui.log('Building', `Requesting focus at (${x}, ${y})`);

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
      if (details) {
        // Show BuildingDetailsPanel with full details
        this.ui.showBuildingDetailsPanel(
          details,
          async (propertyName, value, additionalParams) => {
            await this.setBuildingProperty(x, y, propertyName, value, additionalParams);
          },
          (targetX: number, targetY: number) => {
            this.focusBuilding(targetX, targetY);
          },
          async (action, count) => {
            await this.upgradeBuildingAction(x, y, action, count);
          },
          async () => {
            // Refresh callback: re-fetch building details
            const refreshedDetails = await this.requestBuildingDetails(x, y, visualClass || '0');
            if (refreshedDetails) {
              this.ui.updateBuildingDetailsPanel(refreshedDetails);
            }
          },
          async (newName) => {
            // Rename callback
            await this.renameFacility(x, y, newName);
          },
          async () => {
            // Delete callback
            await this.deleteFacility(x, y);
          },
          (actionId, buildingDetails) => {
            this.handleBuildingAction(actionId, buildingDetails);
          },
          this.currentCompanyName,
          (fluidId, fluidName, direction) => {
            this.openConnectionPicker(x, y, fluidId, fluidName, direction);
          }
        );
      } else {
        // Fallback: create minimal details from BuildingFocusInfo
        const fallbackDetails: BuildingDetailsResponse = {
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
        };
        // Also provide callback for fallback case
        this.ui.showBuildingDetailsPanel(
          fallbackDetails,
          async (propertyName, value, additionalParams) => {
            await this.setBuildingProperty(x, y, propertyName, value, additionalParams);
          },
          (targetX: number, targetY: number) => {
            this.focusBuilding(targetX, targetY);
          },
          async (action, count) => {
            await this.upgradeBuildingAction(x, y, action, count);
          },
          async () => {
            // Refresh callback for fallback mode
            const refreshedDetails = await this.requestBuildingDetails(x, y, visualClass || '0');
            if (refreshedDetails) {
              this.ui.updateBuildingDetailsPanel(refreshedDetails);
            }
          },
          async (newName) => {
            // Rename callback
            await this.renameFacility(x, y, newName);
          },
          async () => {
            // Delete callback
            await this.deleteFacility(x, y);
          },
          (actionId, buildingDetails) => {
            this.handleBuildingAction(actionId, buildingDetails);
          },
          this.currentCompanyName,
          (fluidId, fluidName, direction) => {
            this.openConnectionPicker(x, y, fluidId, fluidName, direction);
          }
        );
      }

      this.ui.log('Building', `Focused: ${response.building.buildingName}`);

    } catch (err: unknown) {
      this.ui.log('Error', `Failed to focus building: ${toErrorMessage(err)}`);
    } finally {
      this.isFocusingBuilding = false;
    }
  }

  private async unfocusBuilding() {
    if (!this.currentFocusedBuilding) return;

    this.ui.log('Building', 'Unfocusing building');

    try {
      const req: WsReqBuildingUnfocus = {
        type: WsMessageType.REQ_BUILDING_UNFOCUS
      };
      this.ws?.send(JSON.stringify(req));

      this.ui.hideBuildingDetailsPanel();
      this.currentFocusedBuilding = null;
      this.currentFocusedVisualClass = null;
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to unfocus building: ${toErrorMessage(err)}`);
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
    this.ui.log('Building', `Requesting details at (${x}, ${y})`);

    try {
      const req: WsReqBuildingDetails = {
        type: WsMessageType.REQ_BUILDING_DETAILS,
        x,
        y,
        visualClass
      };

      const response = await this.sendRequest(req) as WsRespBuildingDetails;
      this.ui.log('Building', `Got details: ${response.details.templateName}`);
      return response.details;
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to get building details: ${toErrorMessage(err)}`);
      return null;
    }
  }

  /**
   * Re-fetch building details and update the panel in-place
   */
  private async refreshBuildingDetails(x: number, y: number): Promise<void> {
    const details = await this.requestBuildingDetails(x, y, '0');
    if (details) {
      this.ui.updateBuildingDetailsPanel(details);
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
    this.ui.log('Building', `Setting ${propertyName}=${value} at (${x}, ${y})`);

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
        this.ui.log('Building', `Property ${propertyName} updated to ${response.newValue}`);
        return true;
      } else {
        this.ui.log('Error', `Failed to set ${propertyName}`);
        return false;
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to set property: ${toErrorMessage(err)}`);
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
    this.ui.log('Building', `${actionName} at (${x}, ${y})`);

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
        this.ui.log('Building', response.message || 'Upgrade action completed');
        return true;
      } else {
        this.ui.log('Error', response.message || 'Failed to perform upgrade action');
        return false;
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to perform upgrade action: ${toErrorMessage(err)}`);
      return false;
    }
  }

  /**
   * Rename a facility (building)
   */
  public async renameFacility(x: number, y: number, newName: string): Promise<boolean> {
    this.ui.log('Building', `Renaming building at (${x}, ${y}) to "${newName}"`);

    try {
      const req: WsReqRenameFacility = {
        type: WsMessageType.REQ_RENAME_FACILITY,
        x,
        y,
        newName
      };

      const response = await this.sendRequest(req) as WsRespRenameFacility;

      if (response.success) {
        this.ui.log('Building', `Building renamed to "${response.newName}"`);
        return true;
      } else {
        this.ui.log('Error', response.message || 'Failed to rename building');
        return false;
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to rename building: ${toErrorMessage(err)}`);
      return false;
    }
  }

  /**
   * Delete a facility (building)
   */
  public async deleteFacility(x: number, y: number): Promise<boolean> {
    this.ui.log('Building', `Deleting building at (${x}, ${y})`);

    try {
      const req: WsReqDeleteFacility = {
        type: WsMessageType.REQ_DELETE_FACILITY,
        x,
        y
      };

      const response = await this.sendRequest(req) as WsRespDeleteFacility;

      if (response.success) {
        this.ui.log('Building', 'Building deleted successfully');
        // Refresh the map to remove the deleted building (use building coordinates as center)
        this.loadMapArea(x, y);
        return true;
      } else {
        this.ui.log('Error', response.message || 'Failed to delete building');
        return false;
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to delete building: ${toErrorMessage(err)}`);
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
      this.ui.showPoliticsPanel(townName, buildingDetails.x, buildingDetails.y);
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

    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(true, `Clone: ${buildingDetails.buildingName}`, 0, 0, '', xsize, ysize);
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

    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(false);
    }
  }

  private async executeCloneFacility(targetX: number, targetY: number): Promise<void> {
    if (!this.cloneSourceBuilding) return;

    const source = this.cloneSourceBuilding;
    this.ui.log('Clone', `Cloning ${source.buildingName} to (${targetX}, ${targetY})...`);

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
      this.ui.log('Error', `Failed to clone facility: ${toErrorMessage(err)}`);
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

  private openConnectionPicker(
    buildingX: number,
    buildingY: number,
    fluidId: string,
    fluidName: string,
    direction: 'input' | 'output'
  ): void {
    // Close any existing dialog
    if (this.connectionPickerDialog) {
      this.connectionPickerDialog.close();
      this.connectionPickerDialog = null;
    }

    this.connectionPickerDialog = new ConnectionPickerDialog(
      document.body,
      {
        fluidName,
        fluidId,
        direction,
        buildingX,
        buildingY,
        onSearch: (searchFluidId, searchDirection, filters) => {
          this.searchConnections(buildingX, buildingY, searchFluidId, searchDirection, filters);
        },
        onConnect: async (connectFluidId, connectDirection, selectedCoords) => {
          await this.connectFacilities(buildingX, buildingY, connectFluidId, connectDirection, selectedCoords);
        },
        onClose: () => {
          this.connectionPickerDialog = null;
        },
      }
    );
  }

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
        this.ui.updateBuildingDetailsPanel(refreshedDetails);
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to connect: ${toErrorMessage(err)}`);
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

    const renderer = this.ui.mapNavigationUI?.getRenderer();
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

        this.ui.log('Road', 'Road building mode enabled. Click and drag to draw roads. Right-click or press ESC to cancel.');
      } else {
        this.ui.log('Road', 'Road building mode disabled');
      }
    }

    // Update toolbar button state if available
    if (this.ui.toolbarUI) {
      this.ui.toolbarUI.setRoadBuildingActive(this.isRoadBuildingMode);
    }
  }

  /**
   * Cancel road building mode
   */
  private cancelRoadBuildingMode(): void {
    this.isRoadBuildingMode = false;

    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setRoadDrawingMode(false);
    }

    // Update toolbar button state
    if (this.ui.toolbarUI) {
      this.ui.toolbarUI.setRoadBuildingActive(false);
    }

    this.ui.log('Road', 'Road building mode cancelled');
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
    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      const validation = renderer.validateRoadPath(x1, y1, x2, y2);
      if (!validation.valid) {
        this.ui.log('Road', `Cannot build road: ${validation.error}`);
        this.showNotification(validation.error || 'Invalid road placement', 'error');
        return;
      }
    }

    this.isBuildingRoad = true;
    this.ui.log('Road', `Building road from (${x1}, ${y1}) to (${x2}, ${y2})...`);

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
        this.ui.log('Road', `Road built: ${response.tileCount} tiles, cost $${response.cost}`);
        // Refresh the map to show the new road (use road start as center)
        this.loadMapArea(x1, y1);
      } else {
        this.ui.log('Error', response.message || 'Failed to build road');
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to build road: ${toErrorMessage(err)}`);
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

    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      if (this.isRoadDemolishMode) {
        // Cancel any building placement
        if (this.currentBuildingToPlace) {
          this.cancelBuildingPlacement();
        }

        renderer.setRoadDemolishClickCallback((x: number, y: number) => {
          this.demolishRoadAt(x, y);
        });

        this.ui.log('Road', 'Road demolish mode enabled. Click on a road segment to demolish it. Press ESC to cancel.');
      } else {
        renderer.setRoadDemolishClickCallback(null);
        this.ui.log('Road', 'Road demolish mode disabled');
      }
    }

    if (this.ui.toolbarUI) {
      this.ui.toolbarUI.setRoadDemolishActive(this.isRoadDemolishMode);
    }
  }

  /**
   * Cancel road demolition mode
   */
  private cancelRoadDemolishMode(): void {
    this.isRoadDemolishMode = false;

    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setRoadDemolishClickCallback(null);
    }

    if (this.ui.toolbarUI) {
      this.ui.toolbarUI.setRoadDemolishActive(false);
    }
  }

  /**
   * Demolish a road segment at (x, y)
   */
  private async demolishRoadAt(x: number, y: number): Promise<void> {
    this.ui.log('Road', `Demolishing road at (${x}, ${y})...`);

    try {
      const req: WsReqDemolishRoad = {
        type: WsMessageType.REQ_DEMOLISH_ROAD,
        x,
        y
      };

      const response = await this.sendRequest(req) as WsRespDemolishRoad;

      if (response.success) {
        this.ui.log('Road', `Road demolished at (${x}, ${y})`);
        this.showNotification('Road demolished', 'success');
        // Refresh the map to remove the demolished road
        this.loadMapArea(x, y);
      } else {
        this.ui.log('Error', response.message || 'Failed to demolish road');
        this.showNotification(response.message || 'Failed to demolish road', 'error');
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to demolish road: ${toErrorMessage(err)}`);
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
      this.ui.log('Error', 'No company selected');
      return;
    }

    this.ui.log('Build', 'Opening build menu...');

    try {
      const req: WsReqGetBuildingCategories = {
        type: WsMessageType.REQ_GET_BUILDING_CATEGORIES,
        companyName: this.currentCompanyName
      };

      const response = await this.sendRequest(req) as WsRespBuildingCategories;
      this.buildingCategories = response.categories;

      if (this.ui.buildMenuUI) {
        this.ui.buildMenuUI.show(response.categories);
      }

      this.ui.log('Build', `Loaded ${response.categories.length} building categories`);
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to load building categories: ${toErrorMessage(err)}`);
    }
  }

  /**
   * Load facilities for a specific category
   */
  private async loadBuildingFacilities(category: BuildingCategory) {
    this.ui.log('Build', `Loading facilities for ${category.kindName}...`);

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

      if (this.ui.buildMenuUI) {
        this.ui.buildMenuUI.showFacilities(category, response.facilities);
      }

      this.ui.log('Build', `Loaded ${response.facilities.length} facilities`);
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to load facilities: ${toErrorMessage(err)}`);
    }
  }

  /**
   * Preload all facility dimensions (called once on startup)
   */
  private async preloadFacilityDimensions(): Promise<void> {
    this.ui.log('Cache', 'Preloading facility dimensions...');

    try {
      const req: WsReqGetAllFacilityDimensions = {
        type: WsMessageType.REQ_GET_ALL_FACILITY_DIMENSIONS
      };

      const response = await this.sendRequest(req) as WsRespAllFacilityDimensions;

      // Initialize client-side cache
      const cache = getFacilityDimensionsCache();
      cache.initialize(response.dimensions);

      this.ui.log('Cache', `Loaded ${cache.getSize()} facility dimensions`);
    } catch (err: unknown) {
      console.error('[Client] Failed to preload facility dimensions:', err);
      this.ui.log('Error', 'Failed to load facility dimensions. Building placement may not work correctly.');
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
    this.ui.log('Build', `Placing ${building.name}. Click on map to build.`);

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
    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(
        true,
        building.name,
        building.cost,
        building.area,
        building.zoneRequirement,
        xsize,
        ysize
      );
    }

    // Set cancel placement callback for right-click
    const cancelRenderer = this.ui.mapNavigationUI?.getRenderer();
    if (cancelRenderer) {
      cancelRenderer.setCancelPlacementCallback(() => {
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
    this.ui.log('Build', `Placing ${building.name} at (${x}, ${y})...`);

    try {
      const req: WsReqPlaceBuilding = {
        type: WsMessageType.REQ_PLACE_BUILDING,
        facilityClass: building.facilityClass,
        x,
        y
      };

      await this.sendRequest(req);

      // Show success message
      this.ui.log('Build', `✓ Successfully placed ${building.name}!`);
      this.showNotification(`${building.name} built successfully!`, 'success');

      // Reload the map area to show the new building
      this.loadMapArea(x, y);

      // Exit placement mode
      this.cancelBuildingPlacement();
    } catch (err: unknown) {
      // Show detailed error message
      const errorMsg = toErrorMessage(err);
      this.ui.log('Error', `✗ Failed to place ${building.name}: ${errorMsg}`);
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
    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (renderer) {
      renderer.setPlacementMode(false);
    }

    // No need to restore callback - handleMapClick already checks currentBuildingToPlace state
  }

  /**
   * Show a temporary notification to the user
   */
  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: ${type === 'success' ? '#4ade80' : type === 'error' ? '#ff6b6b' : '#4dabf7'};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      animation: slideDown 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideUp 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Toggle zone overlay
   */
  private async toggleZoneOverlay(enabled: boolean, type: SurfaceType) {
    this.ui.log('Zones', enabled ? `Enabling ${type} overlay` : 'Disabling overlay');

    const renderer = this.ui.mapNavigationUI?.getRenderer();
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

      this.ui.log('Zones', `Loaded ${type} overlay data`);
    } catch (err: unknown) {
      this.ui.log('Error', `Failed to load zone overlay: ${toErrorMessage(err)}`);
      // Disable overlay on error
      renderer.setZoneOverlay(false);
      if (this.ui.zoneOverlayUI) {
        this.ui.zoneOverlayUI.setEnabled(false);
      }
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
    this.ui.log('Map', 'Refreshing map data...');

    // Get current camera position from renderer
    const renderer = this.ui.mapNavigationUI?.getRenderer();
    if (!renderer || !renderer.getCameraPosition) {
      this.ui.log('Error', 'Cannot refresh: renderer not available');
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
      this.ui.log('Error', `Failed to refresh tycoon data: ${toErrorMessage(err)}`);
    });
  }

  public async logout(): Promise<void> {
    if (this.isLoggingOut) {
      return;
    }

    this.isLoggingOut = true;
    this.ui.log('System', 'Logging out...');

    try {
      const req: WsReqLogout = {
        type: WsMessageType.REQ_LOGOUT
      };

      const response = await this.sendRequest(req) as WsRespLogout;

      if (response.success) {
        this.ui.log('System', 'Logged out successfully');
        // Server will close the WebSocket connection
        // onclose handler will update UI state
      } else {
        this.ui.log('Error', response.message || 'Logout failed');
      }
    } catch (err: unknown) {
      this.ui.log('Error', `Logout error: ${toErrorMessage(err)}`);
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
}

window.addEventListener('DOMContentLoaded', () => {
  new StarpeaceClient();
});
