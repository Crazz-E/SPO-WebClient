/**
 * UIManager - Orchestrates all UI components
 */

import { LoginUI } from './login-ui';
import { ChatUI } from './chat-ui';
import { MapNavigationUI } from './map-navigation-ui';
import { ToolbarUI } from './toolbar-ui';
import { TycoonStatsUI, TycoonStats } from './tycoon-stats-ui';
import { BuildMenuUI } from './build-menu-ui';
import { ZoneOverlayUI } from './zone-overlay-ui';
import { BuildingDetailsPanel } from './building-details';
import { SearchMenuPanel } from './search-menu';
import { MailPanel } from './mail-panel';
import { ProfilePanel } from './profile-panel';
import { PoliticsPanel } from './politics-panel';
import { MinimapUI } from './minimap-ui';
import { SettingsPanel } from './settings-panel';
import { TransportPanel } from './transport-panel';
import {
  BuildingDetailsResponse,
  WsMessage,
  WsMessageType,
  WsRespSearchMenuHome,
  WsRespSearchMenuTowns,
  WsRespSearchMenuTycoonProfile,
  WsRespSearchMenuPeopleSearch,
  WsRespSearchMenuRankings,
  WsRespSearchMenuRankingDetail,
  WsRespSearchMenuBanks,
  WsRespMailFolder,
  WsRespMailMessage,
  WsRespMailSent,
  WsRespMailDeleted,
  WsRespMailUnreadCount,
  WsRespMailDraftSaved,
  MapBuilding,
  MapSegment,
  MailFolder,
} from '../../shared/types';

export class UIManager {
  // UI Components
  public loginUI: LoginUI;
  public chatUI: ChatUI | null = null;
  public mapNavigationUI: MapNavigationUI | null = null;
  public toolbarUI: ToolbarUI | null = null;
  public tycoonStatsUI: TycoonStatsUI | null = null;
  public buildMenuUI: BuildMenuUI | null = null;
  public zoneOverlayUI: ZoneOverlayUI | null = null;
  public buildingDetailsPanel: BuildingDetailsPanel | null = null;
  public searchMenuPanel: SearchMenuPanel | null = null;
  public mailPanel: MailPanel | null = null;
  public profilePanel: ProfilePanel | null = null;
  public politicsPanel: PoliticsPanel | null = null;
  public minimapUI: MinimapUI | null = null;
  public settingsPanel: SettingsPanel | null = null;
  public transportPanel: TransportPanel | null = null;

  // Console
  private uiConsole: HTMLElement;

  constructor() {
    this.uiConsole = document.getElementById('console-output')!;
    this.loginUI = new LoginUI();
  }

  /**
   * Initialize game components (called after successful connection)
   */
  public initGameUI(gamePanel: HTMLElement, sendMessage?: (msg: WsMessage) => void) {
    // Map & Navigation
    this.mapNavigationUI = new MapNavigationUI(gamePanel);
    this.mapNavigationUI.init();

    // Chat (now a draggable modal)
    this.chatUI = new ChatUI();

    // Toolbar (now in header)
    this.toolbarUI = new ToolbarUI();
    this.toolbarUI.init();
    // Tycoon Stats (in header)
    this.tycoonStatsUI = new TycoonStatsUI();

    // Building Construction UI
    this.buildMenuUI = new BuildMenuUI();

    // Zone Overlay UI
    this.zoneOverlayUI = new ZoneOverlayUI();

    // Minimap (toggle with 'M' key)
    this.minimapUI = new MinimapUI();

    // Settings Panel
    this.settingsPanel = new SettingsPanel();

    // Building Details Panel (new detailed panel)
    this.buildingDetailsPanel = new BuildingDetailsPanel(gamePanel, {
      onPropertyChange: undefined, // Will be set when showing the panel
      onClose: undefined,
      onNavigateToBuilding: undefined,
    });

    // Search Menu Panel
    if (sendMessage) {
      this.searchMenuPanel = new SearchMenuPanel(sendMessage);
    }

    // Mail Panel
    if (sendMessage) {
      this.mailPanel = new MailPanel({
        getMailFolder: (folder: MailFolder) => {
          sendMessage({ type: WsMessageType.REQ_MAIL_GET_FOLDER, folder });
        },
        readMailMessage: (folder: MailFolder, messageId: string) => {
          sendMessage({ type: WsMessageType.REQ_MAIL_READ_MESSAGE, folder, messageId });
        },
        composeMail: (to: string, subject: string, body: string[], headers?: string) => {
          sendMessage({ type: WsMessageType.REQ_MAIL_COMPOSE, to, subject, body, headers });
        },
        saveDraft: (to: string, subject: string, body: string[], headers?: string, existingDraftId?: string) => {
          sendMessage({ type: WsMessageType.REQ_MAIL_SAVE_DRAFT, to, subject, body, headers, existingDraftId });
        },
        deleteMailMessage: (folder: MailFolder, messageId: string) => {
          sendMessage({ type: WsMessageType.REQ_MAIL_DELETE, folder, messageId });
        },
      });
    }

    // Profile Panel
    if (sendMessage) {
      this.profilePanel = new ProfilePanel({
        sendMessage,
      });
    }

    // Politics Panel
    if (sendMessage) {
      this.politicsPanel = new PoliticsPanel({
        sendMessage,
      });
    }

    // Transport Panel
    if (sendMessage) {
      this.transportPanel = new TransportPanel({
        sendMessage,
      });
    }
  }

  /**
   * Show the search menu
   */
  public showSearchMenu() {
    if (this.searchMenuPanel) {
      this.searchMenuPanel.show();
    }
  }

  /**
   * Display a message in the console
   */
  public log(source: string, message: string) {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] [${source}] ${message}`;
    this.uiConsole.appendChild(line);
    this.uiConsole.scrollTop = this.uiConsole.scrollHeight;
  }

  /**
   * Display a chat message
   */
  public renderChatMessage(from: string, message: string, isSystem: boolean = false) {
    if (this.chatUI) {
      this.chatUI.renderMessage(from, message, isSystem);
    }
  }

  /**
   * Update map data
   */
  public updateMapData(mapData: { x: number; y: number; w: number; h: number; buildings: MapBuilding[]; segments: MapSegment[] }) {
    if (this.mapNavigationUI) {
      const renderer = this.mapNavigationUI.getRenderer();
      if (renderer) {
        renderer.updateMapData(mapData);
      }
    }
  }


  public initTycoonStats(username: string) {
    if (this.tycoonStatsUI) {
      this.tycoonStatsUI.init(username);
  }
}

/**
 * Update tycoon financial stats
 */
  public updateTycoonStats(stats: TycoonStats) {
    if (this.tycoonStatsUI) {
      this.tycoonStatsUI.updateStats(stats);
    }
  }

  /**
   * Show the building details panel with full property data
   */
  public showBuildingDetailsPanel(
    details: BuildingDetailsResponse,
    onPropertyChange?: (propertyName: string, value: string, additionalParams?: Record<string, string>) => Promise<void>,
    onNavigateToBuilding?: (x: number, y: number) => void,
    onUpgradeAction?: (action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE', count?: number) => Promise<void>,
    onRefresh?: () => Promise<void>,
    onRename?: (newName: string) => Promise<void>,
    onDelete?: () => Promise<void>,
    onActionButton?: (actionId: string, details: BuildingDetailsResponse) => void,
    currentCompanyName?: string,
    onSearchConnections?: (fluidId: string, fluidName: string, direction: 'input' | 'output') => void
  ) {
    if (this.buildingDetailsPanel) {
      // Update options with callbacks
      this.buildingDetailsPanel.updateOptions({
        onPropertyChange,
        onNavigateToBuilding,
        onUpgradeAction,
        onRefresh,
        onRename,
        onDelete,
        onActionButton,
        onSearchConnections,
        currentCompanyName,
      });
      this.buildingDetailsPanel.show(details);
    }
  }

  /**
   * Update the building details panel with new data
   */
  public updateBuildingDetailsPanel(details: BuildingDetailsResponse) {
    if (this.buildingDetailsPanel) {
      this.buildingDetailsPanel.update(details);
    }
  }

  /**
   * Hide the building details panel
   */
  public hideBuildingDetailsPanel() {
    if (this.buildingDetailsPanel) {
      this.buildingDetailsPanel.hide();
    }
  }

  /**
   * Check if building details panel is visible
   */
  public isBuildingDetailsPanelVisible(): boolean {
    return this.buildingDetailsPanel?.isVisible() ?? false;
  }

  // ===========================================================================
  // MAIL PANEL METHODS
  // ===========================================================================

  /**
   * Show the mail panel
   */
  public showMailPanel() {
    if (this.mailPanel) {
      this.mailPanel.show();
    }
  }

  /**
   * Handle mail responses and route to mail panel
   */
  public handleMailResponse(msg: WsMessage) {
    if (!this.mailPanel) {
      console.error('[UIManager] mailPanel is null!');
      return;
    }
    this.mailPanel.handleResponse(msg);
  }

  // ===========================================================================
  // SEARCH MENU METHODS
  // ===========================================================================

  /**
   * Handle search menu responses and render appropriate page
   */
  public handleSearchMenuResponse(msg: WsMessage) {
    if (!this.searchMenuPanel) {
      console.error('[UIManager] searchMenuPanel is null!');
      return;
    }

    switch (msg.type) {
      case WsMessageType.RESP_SEARCH_MENU_HOME:
        this.searchMenuPanel.renderHomePage(msg as WsRespSearchMenuHome);
        break;
      case WsMessageType.RESP_SEARCH_MENU_TOWNS:
        this.searchMenuPanel.renderTownsPage(msg as WsRespSearchMenuTowns);
        break;
      case WsMessageType.RESP_SEARCH_MENU_TYCOON_PROFILE:
        this.searchMenuPanel.renderTycoonProfile(msg as WsRespSearchMenuTycoonProfile);
        break;
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE:
        // Just acknowledges the page is ready
        break;
      case WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH:
        this.searchMenuPanel.renderPeopleSearchResults(msg as WsRespSearchMenuPeopleSearch);
        break;
      case WsMessageType.RESP_SEARCH_MENU_RANKINGS:
        this.searchMenuPanel.renderRankingsPage(msg as WsRespSearchMenuRankings);
        break;
      case WsMessageType.RESP_SEARCH_MENU_RANKING_DETAIL:
        this.searchMenuPanel.renderRankingDetail(msg as WsRespSearchMenuRankingDetail);
        break;
      case WsMessageType.RESP_SEARCH_MENU_BANKS:
        this.searchMenuPanel.renderBanksPage(msg as WsRespSearchMenuBanks);
        break;
    }
  }

  /**
   * Show an error in the search menu panel (for fire-and-forget error responses)
   */
  public handleSearchMenuError(errorMessage: string) {
    if (this.searchMenuPanel) {
      this.searchMenuPanel.showError(errorMessage);
    }
  }

  // ===========================================================================
  // PROFILE PANEL METHODS
  // ===========================================================================

  /**
   * Show the profile panel (optionally opening a specific tab)
   */
  public showProfilePanel(tab?: 'curriculum' | 'bank' | 'profitloss' | 'suppliers' | 'companies' | 'strategy') {
    if (this.profilePanel) {
      this.profilePanel.show(tab);
    }
  }

  /**
   * Handle profile tab responses and route to profile panel
   */
  public handleProfileResponse(msg: WsMessage) {
    if (!this.profilePanel) {
      console.error('[UIManager] profilePanel is null!');
      return;
    }
    this.profilePanel.handleResponse(msg);
  }

  // ===========================================================================
  // POLITICS PANEL METHODS
  // ===========================================================================

  public showPoliticsPanel(townName: string, buildingX: number, buildingY: number) {
    if (this.politicsPanel) {
      this.politicsPanel.show(townName, buildingX, buildingY);
    }
  }

  public handlePoliticsResponse(msg: WsMessage) {
    if (this.politicsPanel) {
      this.politicsPanel.handleResponse(msg);
    }
  }
}
