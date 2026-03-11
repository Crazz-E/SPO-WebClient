import * as net from 'net';
import { EventEmitter } from 'events';
import fetch from 'node-fetch';
import {
  RdoPacket,
  RdoVerb,
  RdoAction,
  RDO_CONSTANTS,
  RDO_PORTS,
  SessionPhase,
  WorldInfo,
  WsMessageType,
  CompanyInfo,
  MapData,
  ChatUser,
  BuildingFocusInfo,
  WsEventBuildingRefresh,
  WsEventAreaRefresh,
  BuildingCategory,
  BuildingInfo,
  SurfaceData,
  SurfaceType,
  BuildingDetailsResponse,
  BuildingPropertyValue,
  BuildingSupplyData,
  BuildingProductData,
  BuildingConnectionData,
  CompInputData,
  MailMessageHeader,
  MailMessageFull,
  MailAttachment,
  TycoonProfileFull,
  CurriculumData,
  BankAccountData,
  LoanInfo,
  BankActionResult,
  ProfitLossData,
  ProfitLossNode,
  CompaniesData,
  CompanyListItem,
  AutoConnectionsData,
  AutoConnectionFluid,
  SupplierEntry,
  PolicyData,
  PolicyEntry,
  PoliticsData,
  PoliticsRatingEntry,
  PoliticalRoleInfo,
  ConnectionSearchResult,
  FavoritesItem,
  ResearchCategoryData,
  ResearchInventionItem,
  ResearchInventionDetails,
  ClusterInfo,
  ClusterCategory,
  ClusterFacilityPreview,
} from '../shared/types';
import {
  getTemplateForVisualClass,
  collectTemplatePropertyNamesStructured,
} from '../shared/building-details';
import { RdoFramer, RdoProtocol } from './rdo';
import {
  RdoValue,
  RdoParser,
  RdoCommand,
  rdoArgs
} from '../shared/rdo-types';
import { config } from '../shared/config';
import { createLogger } from '../shared/logger';
import { toProxyUrl, isProxyUrl } from '../shared/proxy-utils';
import { toErrorMessage } from '../shared/error-utils';
import {
  cleanPayload as cleanPayloadHelper,
  splitMultilinePayload as splitMultilinePayloadHelper,
  parsePropertyResponse as parsePropertyResponseHelper,
  parseIdOfResponse as parseIdOfResponseHelper,
} from './rdo-helpers';
import { parseMessageListHtml } from './mail-list-parser';
import type { AspActionUrl } from './asp-url-extractor';
import { extractAllActionUrls, extractFormActions } from './asp-url-extractor';
import {
  parseBuildings as parseBuildingsHelper,
  parseSegments as parseSegmentsHelper,
  parseBuildingFocusResponse as parseBuildingFocusResponseHelper,
} from './map-parsers';

import * as chatHandler from './session/chat-handler';
import * as mailHandler from './session/mail-handler';
import * as profileFinanceHandler from './session/profile-finance-handler';
import * as autoConnectionHandler from './session/auto-connection-handler';
import * as politicsHandler from './session/politics-handler';
import * as buildingManagementHandler from './session/building-management-handler';
import * as roadHandler from './session/road-handler';
import * as zoneSurfaceHandler from './session/zone-surface-handler';
import * as buildingTemplatesHandler from './session/building-templates-handler';
import * as buildingDetailsHandler from './session/building-details-handler';
import * as buildingPropertyHandler from './session/building-property-handler';
import * as researchHandler from './session/research-handler';
import type { SessionContext } from './session/session-context';
import { dispatchPush } from './session/push-dispatcher';
import * as loginHandler from './session/login-handler';


// Pure utility functions moved to session/session-utils.ts — re-export for backward compat
export { parseFavoritesResponse, deriveResidenceClass } from './session/session-utils';

export class StarpeaceSession extends EventEmitter {
  public readonly log = createLogger('Session');
  private sockets: Map<string, net.Socket> = new Map();
  private framers: Map<string, RdoFramer> = new Map();
  private phase: SessionPhase = SessionPhase.DISCONNECTED;
  private requestIdCounter: number = 1000;

  /**
   * Convert remote image URL to local proxy URL
   * Keeps original filename for debugging
   */
  public convertToProxyUrl(remoteUrl: string): string {
    if (!remoteUrl || isProxyUrl(remoteUrl)) {
      return remoteUrl;
    }

    // Use baseHost for relative URLs
    const baseHost = this.currentWorldInfo?.ip;
    return toProxyUrl(remoteUrl, baseHost);
  }

  /**
   * Get the proxied Capitol icon URL for the current game server.
   */
  public getCapitolIconUrl(): string {
    return this.convertToProxyUrl('/five/0/visual/voyager/Build/images/capitol.jpg');
  }

  // Capitol coordinates (per-world, set from DirectoryMain.asp)
  private capitolCoords: { x: number; y: number } | null = null;

  public getCapitolCoords(): { x: number; y: number } | null {
    return this.capitolCoords;
  }

  public setCapitolCoords(coords: { x: number; y: number } | null): void {
    this.capitolCoords = coords;
  }

  // Pending requests map
  private pendingRequests = new Map<number, {
    resolve: (msg: RdoPacket) => void;
    reject: (err: unknown) => void;
  }>();
  private availableWorlds: Map<string, WorldInfo> = new Map();

  // Event synchronization
  private interfaceEventsId: string | null = null;
  private waitingForInitClient: boolean = false;
  private initClientReceived: Promise<void> | null = null;
  private initClientResolver: (() => void) | null = null;

  // Session State
  private directorySessionId: string | null = null;
  public worldContextId: string | null = null;
  public tycoonId: string | null = null;
  public currentWorldInfo: WorldInfo | null = null;
  private rdoCnntId: string | null = null;
  public cacherId: string | null = null;
  /** Deduplication map for in-flight getBuildingDetails requests by "x,y" key */
  private inFlightBuildingDetails = new Map<string, Promise<BuildingDetailsResponse>>();
  public worldId: string | null = null;
  public daAddr: string | null = null;
  public daPort: number | null = null;

  /** Cache of action URLs extracted from ASP HTML responses, keyed by ASP page path */
  private aspActionCache: Map<string, Map<string, AspActionUrl>> = new Map();

  // InitClient data (received during login)
  private virtualDate: number | null = null; // Server virtual date (Double)
  public accountMoney: string | null = null; // Account money (can be very large)
  public failureLevel: number | null = null; // Company status (0 = nominal, >0 = in debt)
  public fTycoonProxyId: number | null = null; // Tycoon proxy ID (IS-local handle, NOT valid on World server)

  // RefreshTycoon push data (updated periodically by server)
  public lastRanking: number = 0;
  public lastBuildingCount: number = 0;
  public lastMaxBuildings: number = 0;

  // Credentials cache
  public cachedUsername: string | null = null;
  private _cachedPassword: string | null = null;
  public get cachedPassword(): string | null { return this._cachedPassword; }
  private cachedZonePath: string = 'Root/Areas/Asia/Worlds';

  // Active login identity — differs from cachedUsername during role-based company switches
  // (e.g., "President of Shamba" vs original tycoon "SPO_test3")
  public activeUsername: string | null = null;

  // Current company info (for role-based switching)
  public currentCompany: CompanyInfo | null = null;
  private availableCompanies: CompanyInfo[] = [];

  // Additional world properties
  public mailAccount: string | null = null;
  public interfaceServerId: string | null = null;
  private mailAddr: string | null = null;
  private mailPort: number | null = null;
  public mailServerId: string | null = null;
  public worldXSize: number | null = null;
  public worldYSize: number | null = null;
  private worldSeason: number | null = null;  // 0=Winter, 1=Spring, 2=Summer, 3=Autumn

  // Known Objects Registry for bidirectional communication
  private knownObjects: Map<string, string> = new Map();

  //Last known player position from cookies
  private lastPlayerX: number = 0;
  private lastPlayerY: number = 0;
  
    // Chat state
  private currentChannel: string = ''; // Empty = lobby
  private chatUsers: Map<string, ChatUser> = new Map();
  
    // Building focus tracking
  public currentFocusedBuildingId: string | null = null;
  public currentFocusedCoords: { x: number, y: number } | null = null;
  
  // NEW: Request buffering with ServerBusy pause/resume
  private requestBuffer: Array<{
    socketName: string;
    packetData: Partial<RdoPacket>;
    resolve: (packet: RdoPacket) => void;
    reject: (err: unknown) => void;
  }> = [];
  private readonly MAX_BUFFER_SIZE = 5; // Maximum 5 buffered requests
  private isServerBusy: boolean = false;
  private serverBusyCheckInterval: NodeJS.Timeout | null = null;
  private readonly SERVER_BUSY_CHECK_INTERVAL_MS = 10000; // Check every 10 seconds
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private readonly KEEP_ALIVE_INTERVAL_MS = 60000; // Matches Delphi CacheConnectionTimeOut

  // Map-specific throttling
  private activeMapRequests: number = 0;
  private readonly MAX_CONCURRENT_MAP_REQUESTS = 3; // Maximum 3 zone requests at once
  
  // --- REQUEST DEDUPLICATION ---
    private pendingMapRequests: Map<string, Promise<MapData>> = new Map();



  constructor() {
    super();
  }

  // -- SessionContext compliance ------------------------------------------
  public getSocket(name: string): import('net').Socket | undefined {
    return this.sockets.get(name);
  }
  public getAspActionCache(aspPath: string): Map<string, import('./asp-url-extractor').AspActionUrl> | undefined {
    return this.aspActionCache.get(aspPath);
  }
  public setAspActionCache(aspPath: string, actions: Map<string, import('./asp-url-extractor').AspActionUrl>): void {
    this.aspActionCache.set(aspPath, actions);
  }
  public getInFlightBuildingDetails(key: string): Promise<import('../shared/types').BuildingDetailsResponse> | undefined {
    return this.inFlightBuildingDetails.get(key);
  }
  public setInFlightBuildingDetails(key: string, promise: Promise<import('../shared/types').BuildingDetailsResponse>): void {
    this.inFlightBuildingDetails.set(key, promise);
  }
  public deleteInFlightBuildingDetails(key: string): void {
    this.inFlightBuildingDetails.delete(key);
  }
  public setCurrentChannel(channel: string): void {
    this.currentChannel = channel;
  }
  public setChatUsers(users: Map<string, import('../shared/types').ChatUser>): void {
    this.chatUsers = users;
  }
  public setAccountMoney(value: string): void {
    this.accountMoney = value;
  }
  public clearBuildingFocus(): void {
    this.currentFocusedBuildingId = null;
    this.currentFocusedCoords = null;
  }

  // -- PushContext implementation -------------------------------------------
  public getWaitingForInitClient(): boolean { return this.waitingForInitClient; }
  public setWaitingForInitClient(value: boolean): void { this.waitingForInitClient = value; }
  public getInitClientResolver(): (() => void) | null { return this.initClientResolver; }
  public setInitClientResolver(value: (() => void) | null): void { this.initClientResolver = value; }
  public setVirtualDate(value: number | null): void { this.virtualDate = value; }
  public setFailureLevel(value: number | null): void { this.failureLevel = value; }
  public setFTycoonProxyId(value: number | null): void { this.fTycoonProxyId = value; }
  public getLastRanking(): number { return this.lastRanking; }
  public setLastRanking(value: number): void { this.lastRanking = value; }
  public getLastBuildingCount(): number { return this.lastBuildingCount; }
  public setLastBuildingCount(value: number): void { this.lastBuildingCount = value; }
  public getLastMaxBuildings(): number { return this.lastMaxBuildings; }
  public setLastMaxBuildings(value: number): void { this.lastMaxBuildings = value; }

  // -- LoginContext implementation ------------------------------------------
  public getPhase(): SessionPhase { return this.phase; }
  public setPhase(value: SessionPhase): void { this.phase = value; }
  public setWorldContextId(value: string | null): void { this.worldContextId = value; }
  public setInterfaceServerId(value: string | null): void { this.interfaceServerId = value; }
  public setTycoonId(value: string | null): void { this.tycoonId = value; }
  public setRdoCnntId(value: string | null): void { this.rdoCnntId = value; }
  public setCacherId(value: string | null): void { this.cacherId = value; }
  public setWorldId(value: string | null): void { this.worldId = value; }
  public setDaPort(value: number | null): void { this.daPort = value; }
  public setDaAddr(value: string | null): void { this.daAddr = value; }
  public setMailAccount(value: string | null): void { this.mailAccount = value; }
  public setMailAddr(value: string | null): void { this.mailAddr = value; }
  public setMailPort(value: number | null): void { this.mailPort = value; }
  public setWorldXSize(value: number | null): void { this.worldXSize = value; }
  public setWorldYSize(value: number | null): void { this.worldYSize = value; }
  public setWorldSeason(value: number | null): void { this.worldSeason = value; }
  public setCurrentWorldInfo(value: WorldInfo | null): void { this.currentWorldInfo = value; }
  public setCachedUsername(value: string | null): void { this.cachedUsername = value; }
  public setCachedPassword(value: string | null): void { this._cachedPassword = value; }
  public setCachedZonePath(value: string): void { this.cachedZonePath = value; }
  public setActiveUsername(value: string | null): void { this.activeUsername = value; }
  public setCurrentCompany(value: CompanyInfo | null): void { this.currentCompany = value; }
  public setLastPlayerX(value: number): void { this.lastPlayerX = value; }
  public setLastPlayerY(value: number): void { this.lastPlayerY = value; }
  public getAvailableWorlds(): Map<string, WorldInfo> { return this.availableWorlds; }
  public setAvailableWorlds(worlds: Map<string, WorldInfo>): void { this.availableWorlds = worlds; }
  public getAvailableCompanies(): CompanyInfo[] { return this.availableCompanies; }
  public setAvailableCompanies(companies: CompanyInfo[]): void { this.availableCompanies = companies; }
  public pushAvailableCompany(company: CompanyInfo): void { this.availableCompanies.push(company); }
  public setKnownObject(name: string, id: string): void { this.knownObjects.set(name, id); }
  public getInitClientReceived(): Promise<void> | null { return this.initClientReceived; }
  public setInitClientReceived(value: Promise<void> | null): void { this.initClientReceived = value; }
  public deleteSocket(name: string): void { this.sockets.delete(name); }
  public getSocketNames(): string[] { return Array.from(this.sockets.keys()); }
  public removeAllSocketListeners(name: string): void {
    const socket = this.sockets.get(name);
    if (socket) socket.removeAllListeners();
  }
  public destroySocket(name: string): void {
    const socket = this.sockets.get(name);
    if (socket) socket.destroy();
  }
  public deleteFramer(name: string): void { this.framers.delete(name); }
  public clearAspActionCache(): void { this.aspActionCache.clear(); }

  /**
   * Get Directory Agent address for HTTP requests
   */
  public getDAAddr(): string | null {
    return this.daAddr;
  }

  /**
   * Get Directory Agent port (from InterfaceServer DAPort property)
   */
  public getDAPort(): number {
    return this.daPort || config.rdo.ports.directory;
  }

  /**
   * Get server virtual date from InitClient
   */
  public getVirtualDate(): number | null {
    return this.virtualDate;
  }

  /**
   * Get account money from InitClient
   */
  public getAccountMoney(): string | null {
    return this.accountMoney;
  }

  /**
   * Get failure level from InitClient
   * 0 = nominal status, >0 = company in debt
   */
  public getFailureLevel(): number | null {
    return this.failureLevel;
  }

  /**
   * Get fTycoonProxyId from InitClient
   * Different from regular TycoonId
   */
  public getFTycoonProxyId(): number | null {
    return this.fTycoonProxyId;
  }

  public getWorldXSize(): number | null {
    return this.worldXSize;
  }

  public getWorldYSize(): number | null {
    return this.worldYSize;
  }

  /**
   * Get world season from InterfaceServer (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
   */
  public getWorldSeason(): number | null {
    return this.worldSeason;
  }

  // -- LOGIN/DIRECTORY (facade -> login-handler) ----------------------------
  public async checkAuth(username: string, password: string): Promise<void> {
    return loginHandler.checkAuth(this, username, password);
  }

  public async connectDirectory(username: string, pass: string, zonePath?: string): Promise<WorldInfo[]> {
    return loginHandler.connectDirectory(this, username, pass, zonePath);
  }

  public getWorldInfo(name: string): WorldInfo | undefined {
    return this.availableWorlds.get(name);
  }

  public async searchPeople(searchStr: string): Promise<string[]> {
    return loginHandler.searchPeople(this, searchStr, this.cachedZonePath);
  }

public async loginWorld(username: string, pass: string, world: WorldInfo): Promise<{
  contextId: string;
  tycoonId: string;
  companies: CompanyInfo[];
  worldXSize: number | null;
  worldYSize: number | null;
  worldSeason: number | null;
}> {
  return loginHandler.loginWorld(this, username, pass, world);
}

public async selectCompany(companyId: string): Promise<void> {
  return loginHandler.selectCompany(this, companyId);
}

public async createCompany(
  companyName: string,
  cluster: string,
): Promise<{ success: boolean; companyName: string; companyId: string; message?: string }> {
  return loginHandler.createCompany(this, companyName, cluster);
}

public async switchCompany(company: CompanyInfo): Promise<void> {
  return loginHandler.switchCompany(this, company);
}

	/**
	 * NEW: Focus on a building at specific coordinates
	 * Sends SwitchFocusEx command with previous building tracking
	 */
	public async focusBuilding(x: number, y: number): Promise<BuildingFocusInfo> {
	  if (!this.worldContextId) {
		throw new Error('Not logged into world');
	  }

	  this.log.debug(`[Session] Focusing building at (${x}, ${y})`);
	  
	  // Get previous building ID (stored WITHOUT any prefix)
	  const previousBuildingId = this.currentFocusedBuildingId || '0';

	  const packet = await this.sendRdoRequest('world', {
		verb: RdoVerb.SEL,
		targetId: this.worldContextId,
		action: RdoAction.CALL,
		member: 'SwitchFocusEx',
		separator: '"^"',
		args: [RdoValue.int(parseInt(previousBuildingId, 10)).format(), RdoValue.int(x).format(), RdoValue.int(y).format()]
	  });

	  // CRITICAL: Extract the 'res' property first (format is res="%...")
	  const responseData = parsePropertyResponseHelper(packet.payload || '', 'res');

	  const buildingInfo = parseBuildingFocusResponseHelper(responseData, x, y);
	  
	  // Store ID without any prefix
	  this.currentFocusedBuildingId = buildingInfo.buildingId;
	  this.currentFocusedCoords = { x, y };
	  
	  this.log.debug(`[Session] Focused on building ${buildingInfo.buildingId}: ${buildingInfo.buildingName}`);
	  
	  return buildingInfo;
	}



  /**
   * NEW: Remove focus from current building
   * Notifies server to stop sending RefreshObject push commands
   */
	public async unfocusBuilding(): Promise<void> {
	  if (!this.worldContextId || !this.currentFocusedBuildingId) {
		this.log.debug('[Session] No building focused, skipping unfocus');
		return;
	  }

	  this.log.debug(`[Session] Unfocusing building ${this.currentFocusedBuildingId}`);

	  const socket = this.sockets.get('world');
	  if (socket) {
		const unfocusCmd = RdoCommand.sel(this.worldContextId!)
		  .call('UnfocusObject')
		  .push()
		  .args(RdoValue.int(parseInt(this.currentFocusedBuildingId)))
		  .build();
		socket.write(unfocusCmd);
		this.log.debug('[Session] Sent UnfocusObject push command');
	  }

	  // Reset tracking
	  this.currentFocusedBuildingId = null;
	  this.currentFocusedCoords = null;
	}

  /**
   * Get the object ID at given map coordinates via ObjectAt RDO call.
   */
  private async objectAt(x: number, y: number): Promise<string> {
    if (!this.worldContextId) throw new Error('Not logged into world');

    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'ObjectAt',
      separator: '"^"',
      args: [RdoValue.int(x).format(), RdoValue.int(y).format()],
    });

    const objectId = parsePropertyResponseHelper(packet.payload || '', 'res');
    if (!objectId) throw new Error(`No object found at (${x}, ${y})`);
    return objectId;
  }

  /**
   * Connect two facilities by their map coordinates.
   * Uses ObjectAt to resolve IDs, then ConnectFacilities RDO call.
   * Returns the server's connection result message.
   */
  public async connectFacilitiesByCoords(
    sourceX: number, sourceY: number,
    targetX: number, targetY: number,
  ): Promise<{ success: boolean; resultMessage: string }> {
    if (!this.worldContextId) throw new Error('Not logged into world');

    this.log.debug(`[Session] ConnectFacilities: source=(${sourceX},${sourceY}) target=(${targetX},${targetY})`);

    // Resolve object IDs via ObjectAt
    const sourceObjectId = await this.objectAt(sourceX, sourceY);
    const targetObjectId = await this.objectAt(targetX, targetY);

    this.log.debug(`[Session] ConnectFacilities: sourceId=${sourceObjectId} targetId=${targetObjectId}`);

    // Call ConnectFacilities(sourceId, targetId) on worldContextId
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'ConnectFacilities',
      separator: '"^"',
      args: [RdoValue.int(parseInt(sourceObjectId, 10)).format(), RdoValue.int(parseInt(targetObjectId, 10)).format()],
    });

    const resultMessage = parsePropertyResponseHelper(packet.payload || '', 'res') || '';
    this.log.debug(`[Session] ConnectFacilities result: ${resultMessage}`);

    return { success: true, resultMessage };
  }

  /**
   * NEW: Check if a push command is a RefreshObject update
   * Called from handleIncomingMessage when detecting push commands
   */
  public isRefreshObjectPush(packet: RdoPacket): boolean {
    return packet.type === 'PUSH' &&
           packet.member === 'RefreshObject' &&
           packet.separator === '"*"';
  }

  /**
   * Check if a push command is a RefreshArea notification (map visual update).
   * Server format: C sel <tycoonProxy> call RefreshArea "*" "#x","#y","#dx","#dy","%data"
   */
  public isRefreshAreaPush(packet: RdoPacket): boolean {
    return packet.type === 'PUSH' &&
           packet.member === 'RefreshArea' &&
           packet.separator === '"*"';
  }

  /**
   * Parse RefreshArea push payload to extract the affected rectangular area.
   * Args: [x, y, dx, dy, data] where x/y are top-left coords and dx/dy are dimensions.
   */
  public parseRefreshAreaPush(packet: RdoPacket): { x: number; y: number; width: number; height: number } | null {
    try {
      if (!packet.args || packet.args.length < 4) {
        this.log.warn(`[Session] RefreshArea missing args (got ${packet.args?.length ?? 0}, need 4)`);
        return null;
      }

      const x = RdoParser.asInt(packet.args[0]);
      const y = RdoParser.asInt(packet.args[1]);
      const width = RdoParser.asInt(packet.args[2]);
      const height = RdoParser.asInt(packet.args[3]);

      if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
        this.log.warn(`[Session] RefreshArea has non-numeric coords: x=${x}, y=${y}, w=${width}, h=${height}`);
        return null;
      }

      return { x, y, width, height };
    } catch (e: unknown) {
      this.log.warn(`[Session] Failed to parse RefreshArea:`, toErrorMessage(e));
      return null;
    }
  }

  /**
   * Parse RefreshObject push payload.
   * Returns buildingId, kindOfChange, and optionally buildingInfo (only when focused coords available).
   * Format: C sel <proxy> call RefreshObject "*" "#buildingId","#kindOfChange","%extraInfo"
   *   kindOfChange: 0=fchStatus, 1=fchStructure (visual changed), 2=fchDestruction
   */
  public parseRefreshObjectPush(packet: RdoPacket): {
    buildingId: string;
    kindOfChange: number;
    buildingInfo: BuildingFocusInfo | null;
  } | null {
    try {
      if (!packet.args || packet.args.length < 2) {
        this.log.warn(`[Session] RefreshObject missing args`);
        return null;
      }

      // Extract building ID from args[0] — format: "#202334236"
      const buildingId = RdoParser.getValue(packet.args[0]);

      // Extract kindOfChange from args[1] — format: "#0", "#1", or "#2"
      const kindOfChange = RdoParser.asInt(packet.args[1]);

      // Parse building focus info only if we have coords and full data (args[2])
      let buildingInfo: BuildingFocusInfo | null = null;
      if (this.currentFocusedCoords && packet.args.length >= 3) {
        let dataString = packet.args[2];
        dataString = cleanPayloadHelper(dataString);
        if (dataString.startsWith('%')) {
          dataString = dataString.substring(1);
        }
        const fullPayload = buildingId + '\n' + dataString;
        try {
          buildingInfo = parseBuildingFocusResponseHelper(
            fullPayload,
            this.currentFocusedCoords.x,
            this.currentFocusedCoords.y
          );
        } catch {
          this.log.debug(`[Session] Could not parse RefreshObject ExtraInfo for building ${buildingId}`);
        }
      }

      return { buildingId, kindOfChange, buildingInfo };
    } catch (e: unknown) {
      this.log.warn(`[Session] Failed to parse RefreshObject:`, toErrorMessage(e));
      return null;
    }
  }





  // ===========================================================================
  // ASP HTTP HELPERS
  // ===========================================================================

  /**
   * Build common query parameters for IS ASP page requests.
   * All profile ASP pages require these base params to identify the session.
   */
  public buildAspBaseParams(): URLSearchParams {
    return new URLSearchParams({
      Tycoon: this.activeUsername || this.cachedUsername || '',
      Password: this.cachedPassword || '',
      Company: this.currentCompany?.name || '',
      WorldName: this.currentWorldInfo?.name || '',
      DAAddr: this.daAddr || config.rdo.directoryHost,
      DAPort: String(this.daPort || config.rdo.ports.directory),
      ISAddr: this.currentWorldInfo?.ip || '',
      ISPort: '8000',
      ClientViewId: String(this.interfaceServerId || '0'),
    });
  }

  /**
   * Build full URL for an IS ASP page.
   * @param aspPath - Relative path under /Five/0/Visual/Voyager/ (e.g., 'NewTycoon/TycoonBankAccount.asp')
   * @param extraParams - Additional query parameters to append
   */
  public buildAspUrl(aspPath: string, extraParams?: Record<string, string>): string {
    const worldIp = this.currentWorldInfo?.ip;
    if (!worldIp) throw new Error('World IP not available');
    const params = this.buildAspBaseParams();
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) {
        params.set(k, v);
      }
    }
    // Use %20 for spaces (not +) to match the original Voyager client behavior.
    // Legacy IIS/Classic ASP may not decode + as space in URL query strings.
    return `http://${worldIp}/Five/0/Visual/Voyager/${aspPath}?${params.toString().replace(/\+/g, '%20')}`;
  }

  /**
   * Fetch an ASP page and return the HTML text.
   */
  public async fetchAspPage(aspPath: string, extraParams?: Record<string, string>): Promise<string> {
    const url = this.buildAspUrl(aspPath, extraParams);
    this.log.debug(`[ASP] Fetching ${aspPath}`);
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`ASP request failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  public async connectMapService(): Promise<void> {
    if (this.sockets.has('map')) return;
    this.log.debug('[Session] Connecting to Map Service...');
    await this.createSocket('map', this.currentWorldInfo?.ip || '127.0.0.1', RDO_PORTS.MAP_SERVICE);
    const idPacket = await this.sendRdoRequest('map', {
      verb: RdoVerb.IDOF,
      targetId: 'WSObjectCacher'
    });
    this.cacherId = parseIdOfResponseHelper(idPacket.payload);
    this.log.debug(`[Session] Map Service Ready. CacherID: ${this.cacherId}`);
    this.startCacherKeepAlive();
  }

  /**
   * NEW [HIGH-03]: Connect to Construction Service (port 7001)
   * This service handles building upgrades, downgrades, and construction operations
   */
  public async connectConstructionService(): Promise<void> {
    if (this.sockets.has('construction')) {
      this.log.debug('[Construction] Already connected');
      return;
    }

    if (!this.cachedUsername || !this.cachedPassword) {
      throw new Error('Credentials not cached - cannot connect to construction service');
    }

    this.log.debug('[Construction] Connecting to Construction Service (port 7001)...');
    await this.createSocket(
      'construction',
      this.currentWorldInfo?.ip || '127.0.0.1',
      RDO_PORTS.CONSTRUCTION_SERVICE
    );

    // Resolve World object
    const idPacket = await this.sendRdoRequest('construction', {
      verb: RdoVerb.IDOF,
      targetId: 'World'
    });
    this.worldId = parseIdOfResponseHelper(idPacket.payload);
    this.log.debug(`[Construction] World ID: ${this.worldId}`);

    // Logon to World (no request ID - push command with separator "*")
    const socket = this.sockets.get('construction');
    if (socket && this.worldId) {
      const logonCmd = RdoCommand.sel(this.worldId)
        .call('RDOLogonClient')
        .push()
        .args(
          RdoValue.string(this.cachedUsername!),
          RdoValue.string(this.cachedPassword!)
        )
        .build();
      socket.write(logonCmd);
      this.log.debug(`[Construction] Sent RDOLogonClient`);
      // Small delay to let server process logon
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.log.debug('[Construction] Service Ready');
  }

  // =========================================================================
  // MAIL SERVICE
  // =========================================================================

  /**
   * Connect to the Mail Server via RDO.
   * Uses MailAddr/MailPort obtained from InterfaceServer during login.
   * Reference: MsgComposerHandler.pas:394-401 (Voyager direct RDO connection)
   */
  public async connectMailService(): Promise<void> {
    if (this.sockets.has('mail')) {
      this.log.debug('[Mail] Already connected');
      return;
    }

    if (!this.mailAddr || !this.mailPort) {
      throw new Error('Mail server address/port not available - ensure world login completed');
    }

    this.log.debug(`[Mail] Connecting to Mail Server at ${this.mailAddr}:${this.mailPort}...`);
    await this.createSocket('mail', this.mailAddr, this.mailPort);

    // Resolve MailServer hook
    const idPacket = await this.sendRdoRequest('mail', {
      verb: RdoVerb.IDOF,
      targetId: 'MailServer'
    });
    this.mailServerId = parseIdOfResponseHelper(idPacket.payload);
    this.log.debug(`[Mail] Mail Server Ready. ServerId: ${this.mailServerId}`);
  }

  /**
   * Ensure the mail socket is connected, reconnecting if the server closed it.
   * The Delphi MailServer has a 10-second idle timeout (MailConnectionTimeOut)
   * which closes idle TCP connections. This method transparently reconnects.
   */
  public async ensureMailConnection(): Promise<void> {
    if (!this.sockets.has('mail')) {
      this.log.debug('[Mail] Socket was closed (server idle timeout), reconnecting...');
      this.mailServerId = null;
      await this.connectMailService();
    }
  }
  // -- MAIL (facade -> mail-handler) ----------------------------------------
  public async composeMail(to: string, subject: string, bodyLines: string[], headers?: string): Promise<boolean> {
    return mailHandler.composeMail(this, to, subject, bodyLines, headers);
  }

  public async saveDraft(to: string, subject: string, bodyLines: string[], headers?: string, existingDraftId?: string): Promise<boolean> {
    return mailHandler.saveDraft(this, to, subject, bodyLines, headers, existingDraftId);
  }

  public async readMailMessage(folder: string, messageId: string): Promise<MailMessageFull> {
    return mailHandler.readMailMessage(this, folder, messageId);
  }

  public async deleteMailMessage(folder: string, messageId: string): Promise<void> {
    return mailHandler.deleteMailMessage(this, folder, messageId);
  }

  public async getMailUnreadCount(): Promise<number> {
    return mailHandler.getMailUnreadCount(this);
  }

  public getMailAccount(): string | null {
    return mailHandler.getMailAccount(this);
  }

  public async getMailFolder(folder: string): Promise<MailMessageHeader[]> {
    return mailHandler.getMailFolder(this, folder);
  }

  // -- PROFILE/FINANCE (facade -> profile-finance-handler) ------------------
  public async fetchTycoonProfile(): Promise<TycoonProfileFull> {
    return profileFinanceHandler.fetchTycoonProfile(this);
  }

  public async fetchCurriculumData(): Promise<CurriculumData> {
    return profileFinanceHandler.fetchCurriculumData(this);
  }

  public async fetchBankAccount(): Promise<BankAccountData> {
    return profileFinanceHandler.fetchBankAccount(this);
  }

  public async executeBankAction(action: string, amount?: string, toTycoon?: string, reason?: string, loanIndex?: number): Promise<BankActionResult> {
    return profileFinanceHandler.executeBankAction(this, action, amount, toTycoon, reason, loanIndex);
  }

  public async fetchProfitLoss(): Promise<ProfitLossData> {
    return profileFinanceHandler.fetchProfitLoss(this);
  }

  public async fetchCompanies(): Promise<CompaniesData> {
    return profileFinanceHandler.fetchCompanies(this);
  }

  // -- AUTO-CONNECTIONS (facade -> auto-connection-handler) -----------------
  public async fetchAutoConnections(): Promise<AutoConnectionsData> {
    return autoConnectionHandler.fetchAutoConnections(this);
  }

  public async executeAutoConnectionAction(action: string, fluidId: string, suppliers?: string): Promise<{ success: boolean; message?: string }> {
    return autoConnectionHandler.executeAutoConnectionAction(this, action, fluidId, suppliers);
  }

  public async fetchPolicy(): Promise<PolicyData> {
    return autoConnectionHandler.fetchPolicy(this);
  }

  public async setPolicyStatus(tycoonName: string, status: number): Promise<{ success: boolean; message?: string }> {
    return autoConnectionHandler.setPolicyStatus(this, tycoonName, status);
  }

  public async executeCurriculumAction(action: string, value?: boolean): Promise<{ success: boolean; message?: string }> {
    return autoConnectionHandler.executeCurriculumAction(this, action, value);
  }

  // -- POLITICS (facade -> politics-handler) --------------------------------
  public async fetchOwnedFacilities(): Promise<FavoritesItem[]> {
    return politicsHandler.fetchOwnedFacilities(this);
  }

  public async getPoliticsData(townName: string, buildingX: number, buildingY: number): Promise<PoliticsData> {
    return politicsHandler.getPoliticsData(this, townName, buildingX, buildingY);
  }

  public async politicsVote(buildingX: number, buildingY: number, candidateName: string): Promise<{ success: boolean; message: string }> {
    return politicsHandler.politicsVote(this, buildingX, buildingY, candidateName);
  }

  public async politicsLaunchCampaign(buildingX: number, buildingY: number, townName?: string): Promise<{ success: boolean; message: string }> {
    return politicsHandler.politicsLaunchCampaign(this, buildingX, buildingY, townName);
  }

  public async politicsCancelCampaign(buildingX: number, buildingY: number, townName?: string): Promise<{ success: boolean; message: string }> {
    return politicsHandler.politicsCancelCampaign(this, buildingX, buildingY, townName);
  }

  public async searchConnections(buildingX: number, buildingY: number, fluidId: string, direction: 'input' | 'output', filters?: { company?: string; town?: string; maxResults?: number; roles?: number }): Promise<ConnectionSearchResult[]> {
    return politicsHandler.searchConnections(this, buildingX, buildingY, fluidId, direction, filters);
  }

public async loadMapArea(x?: number, y?: number, w: number = 64, h: number = 64): Promise<MapData> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    const worldCtxId = this.worldContextId; // capture for async closure

    const targetX = x !== undefined ? x : this.lastPlayerX;
    const targetY = y !== undefined ? y : this.lastPlayerY;

    // --- DEDUPLICATION: Share pending promise instead of throwing ---
    const requestKey = `${targetX},${targetY}`;
    const pending = this.pendingMapRequests.get(requestKey);
    if (pending) {
        this.log.debug(`[Session] Sharing pending map request for ${requestKey}`);
        return pending;
    }

    // --- MAP CONCURRENCY LIMIT: Check if at max concurrent map requests ---
    if (this.activeMapRequests >= this.MAX_CONCURRENT_MAP_REQUESTS) {
        this.log.debug(`[Session] Too many concurrent map requests (${this.activeMapRequests}/${this.MAX_CONCURRENT_MAP_REQUESTS})`);
        throw new Error(`Maximum concurrent map requests reached (${this.MAX_CONCURRENT_MAP_REQUESTS})`);
    }

    // Build the promise and store it for dedup sharing
    const promise = (async (): Promise<MapData> => {
      this.activeMapRequests++;
      try {
        this.log.debug(`[Session] Loading map area at ${targetX}, ${targetY} (size ${w}x${h}) [${this.activeMapRequests}/${this.MAX_CONCURRENT_MAP_REQUESTS}]`);

        // --- FIXED: ObjectsInArea with correct separator (consistant avec SwitchFocusEx) ---
        const objectsPacket = await this.sendRdoRequest('world', {
            verb: RdoVerb.SEL,
            targetId: worldCtxId,
            action: RdoAction.CALL,
            member: 'ObjectsInArea',
            separator: '"^"',  // FIX: Use '"^"' for consistency with other requests
            args: [targetX.toString(), targetY.toString(), w.toString(), h.toString()]
        });

        // --- FIXED: SegmentsInArea with correct format ---
        const modeOrLayer = 1;
        const x1 = targetX;
        const y1 = targetY;
        const x2 = targetX + w;
        const y2 = targetY + h;

        const segmentsPacket = await this.sendRdoRequest('world', {
            verb: RdoVerb.SEL,
            targetId: worldCtxId,
            action: RdoAction.CALL,
            member: 'SegmentsInArea',
            args: [
                modeOrLayer.toString(),
                x1.toString(), y1.toString(),
                x2.toString(), y2.toString()
            ]
        });

        // Parse
        const buildingsRaw = splitMultilinePayloadHelper(objectsPacket.payload!);
        const buildings = parseBuildingsHelper(buildingsRaw);

        const segmentsRaw = splitMultilinePayloadHelper(segmentsPacket.payload!);
        const segments = parseSegmentsHelper(segmentsRaw);

        this.log.debug(`[Session] Parsed ${buildings.length} buildings (from ${buildingsRaw.length} lines), ${segments.length} segments (from ${segmentsRaw.length} lines)`);

        return { x: targetX, y: targetY, w, h, buildings, segments };

      } finally {
        // Always remove from pending tracker
        this.pendingMapRequests.delete(requestKey);
        this.activeMapRequests--;
      }
    })();

    this.pendingMapRequests.set(requestKey, promise);
    return promise;
}



	/**
	 * Get the last known player position from cookies
	 */
	public getPlayerPosition(): { x: number, y: number } {
	  return {
		x: this.lastPlayerX,
		y: this.lastPlayerY
	  };
	}

  /**
   * Update the player's camera center position (for save on disconnect).
   * When viewport bounds are provided, also tells the game server via SetViewedArea
   * so it knows which area to send RefreshArea/RefreshObject pushes for.
   */
  public updateCameraPosition(x: number, y: number, viewX?: number, viewY?: number, viewW?: number, viewH?: number): void {
    this.lastPlayerX = x;
    this.lastPlayerY = y;
    if (viewX !== undefined && viewY !== undefined && viewW !== undefined && viewH !== undefined) {
      this.setViewedArea(viewX, viewY, viewW, viewH);
    }
  }

  /**
   * Tell the InterfaceServer what map area the client is viewing.
   * Required for the server to send RefreshArea/RefreshObject pushes —
   * without this, IntersectRect(buildArea, clientViewport) always fails.
   * Delphi signature: TClientView.SetViewedArea(x, y, dx, dy: integer)
   */
  private setViewedArea(x: number, y: number, dx: number, dy: number): void {
    if (!this.worldContextId) return;
    if (dx <= 0 || dy <= 0) return; // Skip degenerate viewports
    const socket = this.sockets.get('world');
    if (!socket) return;
    const cmd = RdoCommand.sel(this.worldContextId)
      .call('SetViewedArea')
      .push()  // "*" separator, no RID — fire-and-forget (Delphi: procedure, not function)
      .args(RdoValue.int(x), RdoValue.int(y), RdoValue.int(dx), RdoValue.int(dy))
      .build();
    socket.write(cmd);
  }

  /**
   * Propagate configuration settings from a building to other buildings of the same type.
   * Fire-and-forget call on ClientView (worldContextId) — NOT on CurrBlock.
   * Delphi: TClientView.CloneFacility(x, y, options, useless, tycoonId: integer)
   * Archaeology: ManagementSheet.pas:388-403, ServerCnxHandler.pas:2262
   */
  public cloneFacility(x: number, y: number, options: number): void {
    if (!this.worldContextId) {
      throw new Error('World context not initialized');
    }
    if (!this.tycoonId) {
      throw new Error('Tycoon ID not available');
    }
    const socket = this.sockets.get('world');
    if (!socket) {
      throw new Error('World socket not available');
    }
    const cmd = RdoCommand.sel(this.worldContextId)
      .call('CloneFacility')
      .push()  // "*" separator — void procedure, fire-and-forget
      .args(
        RdoValue.int(x),
        RdoValue.int(y),
        RdoValue.int(options),
        RdoValue.int(0),  // useless param (always 0 in Delphi client)
        RdoValue.int(parseInt(this.tycoonId, 10))
      )
      .build();
    socket.write(cmd);
    this.log.debug(`[CloneFacility] Sent: ${cmd}`);
  }

  /**
   * VERIFIED [HIGH-02]: Get property list at specific coordinates
   * Ensures SetObject is called before GetPropertyList with proper delay
   */
  public async getCacherPropertyListAt(x: number, y: number, propertyNames: string[]): Promise<string[]> {
    await this.connectMapService();
    if (!this.cacherId) throw new Error('Map service not initialized (missing cacherId)');
    const tempObjectId = await this.cacherCreateObject();
    try {
      // CRITICAL: SetObject MUST be called to load data into server cache
      await this.cacherSetObject(tempObjectId, x, y);
      // Now safe to retrieve properties
      return await this.cacherGetPropertyList(tempObjectId, propertyNames);
    } finally {
      await this.cacherCloseObject(tempObjectId);
    }
  }

  /**
   * NEW [HIGH-02]: Helper to get RDO ObjectId at specific coordinates
   * This is the "real" object ID used for construction operations
   */
  public async getObjectRdoId(x: number, y: number): Promise<string> {
    this.log.debug(`[MapService] Getting RDO ObjectId at (${x}, ${y})`);
    const props = await this.getCacherPropertyListAt(x, y, ['ObjectId']);
    if (props.length === 0 || !props[0]) {
      this.log.warn(`[MapService] No ObjectId found at (${x}, ${y})`);
      return '';
    }

    const objectId = props[0];
    this.log.debug(`[MapService] Found ObjectId: ${objectId} at (${x}, ${y})`);
    return objectId;
  }

  public async cacherCreateObject(): Promise<string> {
    if (!this.cacherId) throw new Error('Missing cacherId');
    if (!this.currentWorldInfo?.name) throw new Error('Missing world name for CreateObject');
    const packet = await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: this.cacherId,
      action: RdoAction.CALL,
      member: 'CreateObject',
      args: [this.currentWorldInfo.name]
    });
    return cleanPayloadHelper(packet.payload || '');
  }

  /**
   * VERIFIED [HIGH-02]: SetObject with critical delay
   * This method MUST be called before GetPropertyList to populate server cache
   */
  public async cacherSetObject(tempObjectId: string, x: number, y: number): Promise<void> {
    await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: tempObjectId,
      action: RdoAction.CALL,
      member: 'SetObject',
      args: [x.toString(), y.toString()]
    });
    // Brief delay for server to populate cache (reduced from 100ms)
    await new Promise(resolve => setTimeout(resolve, 30));
  }

  public async cacherSetPath(tempObjectId: string, path: string): Promise<void> {
    await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: tempObjectId,
      action: RdoAction.CALL,
      member: 'SetPath',
      args: [path]
    });
    // No delay needed — Delphi SetPath is synchronous (loads file inline before responding)
  }

  public async cacherGetPropertyList(tempObjectId: string, propertyNames: string[]): Promise<string[]> {
    const query = propertyNames.join('\t') + '\t';
    const packet = await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: tempObjectId,
      action: RdoAction.CALL,
      member: 'GetPropertyList',
      args: [query]
    });
    // Extract tab-delimited values WITHOUT trimming — cleanPayload's .trim()
    // strips leading/trailing tabs, destroying empty values at the boundaries.
    // The Delphi cache server always returns one value per requested property
    // (empty string for unknown properties), so positional alignment is critical.
    const rawPayload = packet.payload || '';
    let raw: string;
    const resMatch = rawPayload.match(/^res="((?:[^"]|"")*)"$/);
    if (resMatch) {
      raw = resMatch[1].replace(/""/g, '"');
      // Strip OLE string type prefix (%) but NOT whitespace/tabs
      if (raw.length > 0 && ['#', '%', '@', '$', '^', '!', '*'].includes(raw[0])) {
        raw = raw.substring(1);
      }
    } else {
      raw = cleanPayloadHelper(rawPayload);
    }

    // Tab-split: the Delphi server appends TAB after each value, so we get
    // N values + 1 trailing empty from the final tab. Trim individual values
    // (spaces only, not tabs) but preserve empty strings for missing properties.
    const values = raw.split('\t').map(v => v.trim());
    // Remove trailing empty element from the final TAB delimiter
    if (values.length > 0 && values[values.length - 1] === '') {
      values.pop();
    }
    if (values.length < propertyNames.length) {
      this.log.warn(
        `[cacherGetPropertyList] Response has ${values.length} values for ${propertyNames.length} requested properties`
      );
      this.log.warn(`[cacherGetPropertyList] Requested: ${propertyNames.join(', ')}`);
      this.log.warn(`[cacherGetPropertyList] Received: ${values.map((v, i) => `[${i}]="${v}"`).join(', ')}`);
    }
    return values;
  }

  public cacherCloseObject(tempObjectId: string): void {
    if (!this.cacherId) return;
    const socket = this.sockets.get('map');
    if (!socket) return;
    // CloseObject is a Delphi procedure (void) — fire-and-forget, no QueryId.
    // Delphi: procedure CloseObject(Obj: integer)
    try {
      const cmd = RdoCommand.sel(this.cacherId)
        .call('CloseObject')
        .push() // "*" separator — void procedure
        .args(RdoValue.int(parseInt(tempObjectId, 10)))
        .build();
      socket.write(cmd);
    } catch (e: unknown) {
      this.log.warn('[cacherCloseObject] Failed:', toErrorMessage(e));
    }
  }


  // -- BUILDING MANAGEMENT (facade -> building-management-handler) ----------
  public async queryTycoonPoliticalRole(tycoonName: string): Promise<PoliticalRoleInfo> {
    return buildingManagementHandler.queryTycoonPoliticalRole(this, tycoonName);
  }

  public async manageConstruction(x: number, y: number, action: 'START' | 'STOP' | 'DOWN', count?: number): Promise<{ status: string; error?: string }> {
    return buildingManagementHandler.manageConstruction(this, x, y, action, count);
  }

  public async upgradeBuildingAction(x: number, y: number, action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE', count?: number): Promise<{ success: boolean, message?: string }> {
    return buildingManagementHandler.upgradeBuildingAction(this, x, y, action, count);
  }

  public async renameFacility(x: number, y: number, newName: string): Promise<{ success: boolean, message?: string }> {
    return buildingManagementHandler.renameFacility(this, x, y, newName);
  }

  public async deleteFacility(x: number, y: number): Promise<{ success: boolean, message?: string }> {
    return buildingManagementHandler.deleteFacility(this, x, y);
  }

  // -- ROADS (facade -> road-handler) ---------------------------------------
  public async buildRoad(x1: number, y1: number, x2: number, y2: number): Promise<{ success: boolean; cost: number; tileCount: number; message?: string; errorCode?: number; partial?: boolean }> {
    return roadHandler.buildRoad(this, x1, y1, x2, y2);
  }

  public getRoadCostEstimate(x1: number, y1: number, x2: number, y2: number): { cost: number; tileCount: number; costPerTile: number; valid: boolean; error?: string } {
    return roadHandler.getRoadCostEstimate(x1, y1, x2, y2);
  }

  public async demolishRoad(x: number, y: number): Promise<{ success: boolean; message?: string; errorCode?: number }> {
    return roadHandler.demolishRoad(this, x, y);
  }

  public async wipeCircuit(x1: number, y1: number, x2: number, y2: number): Promise<{ success: boolean; message?: string; errorCode?: number }> {
    return roadHandler.wipeCircuit(this, x1, y1, x2, y2);
  }

  public async executeRdo(serviceName: string, packetData: Partial<RdoPacket>): Promise<string> {
    if (!this.sockets.has(serviceName)) {
      throw new Error(`Service ${serviceName} not connected`);
    }

    const res = await this.sendRdoRequest(serviceName, packetData);
    return res.payload || '';
  }

  // =========================================================================
  // INTERNAL HELPERS
  // =========================================================================

public createSocket(name: string, host: string, port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const framer = new RdoFramer();
    this.sockets.set(name, socket);
    this.framers.set(name, framer);

    socket.connect(port, host, () => {
      this.log.debug(`[Session] Connected to ${name} (${host}:${port})`);
      resolve(socket);
    });

    socket.on('data', (chunk) => {
      const messages = framer.ingest(chunk);
      messages.forEach(msg => this.processSingleCommand(name, msg));
    });

    socket.on('error', (err) => {
      this.log.error(`[Session] Socket error on ${name}:`, err);
    });

    socket.on('close', () => {
      this.log.debug(`[Session] Socket closed: ${name}`);
      this.sockets.delete(name);
      this.framers.delete(name);
    });
  });
}

/**
   * NEW: Start ServerBusy polling (every 2 seconds)
   * When server is busy, pause all requests except ServerBusy checks
   */
  public startServerBusyPolling(): void {
    if (this.serverBusyCheckInterval) return; // Already running

    this.log.debug('[ServerBusy] Starting 2-second polling...');

    this.serverBusyCheckInterval = setInterval(async () => {
      if (!this.worldContextId || this.phase === SessionPhase.WORLD_CONNECTING) {
        return; // Skip during login
      }

      try {
        const rid = this.requestIdCounter++;
        const packet: RdoPacket = {
          raw: '',
          verb: RdoVerb.SEL,
          targetId: this.worldContextId,
          action: RdoAction.GET,
          member: 'ServerBusy',
          rid,
          type: 'REQUEST'
        };

        const socket = this.sockets.get('world');
        if (!socket) return;

        const rawString = RdoProtocol.format(packet);
        socket.write(rawString + RDO_CONSTANTS.PACKET_DELIMITER);

        const response = await new Promise<RdoPacket>((resolve, reject) => {
          this.pendingRequests.set(rid, { resolve, reject });

          setTimeout(() => {
            if (this.pendingRequests.has(rid)) {
              this.pendingRequests.delete(rid);
              reject(new Error('ServerBusy check timeout'));
            }
          }, 1000);
        });

        const busyValue = parsePropertyResponseHelper(response.payload!, 'ServerBusy');
        const wasBusy = this.isServerBusy;
        this.isServerBusy = busyValue == '1';

        if (wasBusy && !this.isServerBusy) {
          this.log.debug('[ServerBusy] Server now available - resuming requests');
          this.processBufferedRequests();
        } else if (!wasBusy && this.isServerBusy) {
          this.log.debug('[ServerBusy] Server now busy - pausing new requests');
        }
      } catch (e: unknown) {
        this.log.warn('[ServerBusy] Poll failed:', (e as Error).message);
      }
    }, this.SERVER_BUSY_CHECK_INTERVAL_MS);
  }

  /**
   * NEW: Stop ServerBusy polling
   */
  private stopServerBusyPolling(): void {
    if (this.serverBusyCheckInterval) {
      clearInterval(this.serverBusyCheckInterval);
      this.serverBusyCheckInterval = null;
    }
  }

  /**
   * Start KeepAlive timer for the Map Service cacher proxy.
   * Sends a void push every 60s to prevent the server from releasing
   * the WSObjectCacher RDO reference due to inactivity.
   *
   * Delphi reference: ObjectInspectorHandleViewer.pas:1172-1180
   *   fCacheObj.KeepAlive — CacheConnectionTimeOut = 60000ms
   *
   * CRITICAL: Uses socket.write() directly (void push with "*" separator).
   * Must NOT use sendRdoRequest() — that adds a QueryId, and combining
   * QueryId + "*" separator crashes the Delphi server.
   */
  private startCacherKeepAlive(): void {
    if (this.keepAliveInterval) return;
    if (!this.cacherId) {
      this.log.warn('[KeepAlive] Cannot start: no cacherId');
      return;
    }

    this.log.debug(`[KeepAlive] Starting 60s timer for cacherId ${this.cacherId}`);
    this.keepAliveInterval = setInterval(() => {
      const socket = this.sockets.get('map');
      if (!socket || !this.cacherId) {
        this.log.debug('[KeepAlive] Map socket or cacherId gone — stopping');
        this.stopCacherKeepAlive();
        return;
      }
      try {
        const cmd = RdoCommand.sel(this.cacherId)
          .call('KeepAlive')
          .push()
          .build();
        socket.write(cmd);
        this.log.debug('[KeepAlive] Sent to cacher');
      } catch (e: unknown) {
        this.log.warn('[KeepAlive] Failed:', toErrorMessage(e));
      }
    }, this.KEEP_ALIVE_INTERVAL_MS);
  }

  /**
   * Stop the KeepAlive timer for the Map Service cacher.
   */
  public stopCacherKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      this.log.debug('[KeepAlive] Timer stopped');
    }
  }

  /**
   * NEW: Process buffered requests when server becomes available
   */
  private async processBufferedRequests(): Promise<void> {
    while (this.requestBuffer.length > 0 && !this.isServerBusy) {
      const request = this.requestBuffer.shift();
      if (!request) break;

      // Execute the buffered request
      this.executeRdoRequest(request.socketName, request.packetData)
        .then(request.resolve)
        .catch(request.reject);

      // Small delay between requests to avoid flooding
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

	public getQueueStatus(): { buffered: number; maxBuffer: number; serverBusy: boolean; pendingMaps: number; activeMapRequests: number } {
		return {
			buffered: this.requestBuffer.length,
			maxBuffer: this.MAX_BUFFER_SIZE,
			serverBusy: this.isServerBusy,
			pendingMaps: this.pendingMapRequests.size,
			activeMapRequests: this.activeMapRequests
		};
	}

/**
 * NEW: Send RDO request with buffering when server is busy
 */
public sendRdoRequest(socketName: string, packetData: Partial<RdoPacket>): Promise<RdoPacket> {
  return new Promise((resolve, reject) => {
    // If server is busy, buffer the request
    if (this.isServerBusy) {
      if (this.requestBuffer.length >= this.MAX_BUFFER_SIZE) {
        // Buffer is full, drop the request
        this.log.warn('[Buffer] Buffer full, dropping request:', packetData.member);
        reject(new Error('Request buffer full - server busy'));
        return;
      }

      // Add to buffer
      this.requestBuffer.push({ socketName, packetData, resolve, reject });
      this.log.debug(`[Buffer] Request buffered (${this.requestBuffer.length}/${this.MAX_BUFFER_SIZE}):`, packetData.member);
      return;
    }

    // Server not busy, execute immediately
    this.executeRdoRequest(socketName, packetData)
      .then(resolve)
      .catch(reject);
  });
}

private async executeRdoRequest(socketName: string, packetData: Partial<RdoPacket>): Promise<RdoPacket> {
  return new Promise(async (resolve, reject) => {
    const socket = this.sockets.get(socketName);
    if (!socket) {
      return reject(new Error(`Socket ${socketName} not active`));
    }

    const rid = this.requestIdCounter++;
    const packet = { ...packetData, rid, type: 'REQUEST' } as RdoPacket;

    // Set up response handler with timeout
    const timeout = setTimeout(() => {
      if (this.pendingRequests.has(rid)) {
        this.pendingRequests.delete(rid);
        reject(new Error(`Request timeout: ${packetData.member || 'unknown'}`));
      }
    }, 10000); // 10 second timeout

    // Store both callbacks in an object
    this.pendingRequests.set(rid, {
      resolve: (response: RdoPacket) => {
        clearTimeout(timeout);
        resolve(response);
      },
      reject: (err: unknown) => {
        clearTimeout(timeout);
        reject(err);
      }
    });

    // Send the request
    const rawString = RdoProtocol.format(packet);
    socket.write(rawString + RDO_CONSTANTS.PACKET_DELIMITER);
  });
}

private handleIncomingMessage(socketName: string, raw: string) {
  // CRITICAL FIX: Handle multiple commands in single message
  // Split by ';' but keep the delimiter for proper parsing
  const commands = raw.split(';').filter(cmd => cmd.trim().length > 0);
  
  // If multiple commands detected, process each separately
  if (commands.length > 1) {
    this.log.debug(`[Session] Multiple commands detected in message: ${commands.length}`);
    commands.forEach(cmdRaw => {
      const fullCmd = cmdRaw.trim() + ';';
      this.processSingleCommand(socketName, fullCmd);
    });
    return;
  }
  
  // Single command - process normally
  this.processSingleCommand(socketName, raw);
}

	private processSingleCommand(socketName: string, raw: string) {
	  const packet = RdoProtocol.parse(raw);

	  // Check if this is a RefreshArea push (map visual update — buildings/roads changed)
	  if (this.isRefreshAreaPush(packet)) {
		const area = this.parseRefreshAreaPush(packet);
		if (area) {
		  this.log.debug(`[Session] RefreshArea at (${area.x}, ${area.y}) ${area.width}x${area.height}`);
		  this.emit('ws_event', {
			type: WsMessageType.EVENT_AREA_REFRESH,
			x: area.x,
			y: area.y,
			width: area.width,
			height: area.height,
		  } as WsEventAreaRefresh);
		}
		return;
	  }

	  // Check if this is a RefreshObject push (building state changed)
	  if (this.isRefreshObjectPush(packet)) {
		const result = this.parseRefreshObjectPush(packet);
		if (result) {
		  this.log.debug(`[Session] RefreshObject for building ${result.buildingId}, kindOfChange=${result.kindOfChange}`);
		  const building = result.buildingInfo ?? {
			buildingId: result.buildingId,
			buildingName: '',
			ownerName: '',
			salesInfo: '',
			revenue: '',
			detailsText: '',
			hintsText: '',
			x: this.currentFocusedCoords?.x ?? 0,
			y: this.currentFocusedCoords?.y ?? 0,
		  };
		  this.emit('ws_event', {
			type: WsMessageType.EVENT_BUILDING_REFRESH,
			building,
			kindOfChange: result.kindOfChange,
		  } as WsEventBuildingRefresh);
		}
		return;
	  }

	  // Handle server requests (IDOF, etc.)
	  if (packet.type === 'REQUEST' && packet.rid) {
		this.handleServerRequest(socketName, packet);
		return;
	  }

	  // Handle responses
	  if (packet.type === 'RESPONSE') {
		if (packet.rid && this.pendingRequests.has(packet.rid)) {
		  // CORRECTED: Get the callbacks object and call resolve
		  const callbacks = this.pendingRequests.get(packet.rid)!;
		  this.pendingRequests.delete(packet.rid);
		  callbacks.resolve(packet);
		} else {
		  this.log.warn(`[Session] Unmatched response RID ${packet.rid}: ${raw}`);
		}
	  } else {
		// Push command
		this.handlePush(socketName, packet);
	  }
	}


  private handleServerRequest(socketName: string, packet: RdoPacket) {
    this.log.debug(`[Session] Server Request: ${packet.raw}`);
    if (packet.verb === RdoVerb.IDOF && packet.targetId) {
      const objectId = this.knownObjects.get(packet.targetId);
      if (objectId) {
        const response = `${RDO_CONSTANTS.CMD_PREFIX_ANSWER}${packet.rid} objid="${objectId}"${RDO_CONSTANTS.PACKET_DELIMITER}`;
        const socket = this.sockets.get(socketName);
        if (socket) {
          socket.write(response);
          this.log.debug(`[Session] Auto-replied to server: ${response}`);
        }
      } else {
        this.log.warn(`[Session] Server requested unknown object: ${packet.targetId}`);
      }
    }
  }

private handlePush(socketName: string, packet: RdoPacket) {
  dispatchPush(this, socketName, packet);
}


  // -- CHAT (facade -> chat-handler) ----------------------------------------
  public async getChatUserList(): Promise<ChatUser[]> {
    return chatHandler.getChatUserList(this);
  }

  public async getChatChannelList(): Promise<string[]> {
    return chatHandler.getChatChannelList(this);
  }

  public async getChatChannelInfo(channelName: string): Promise<string> {
    return chatHandler.getChatChannelInfo(this, channelName);
  }

  public async joinChatChannel(channelName: string): Promise<void> {
    return chatHandler.joinChatChannel(this, channelName);
  }

  public async sendChatMessage(message: string): Promise<void> {
    return chatHandler.sendChatMessage(this, message);
  }

  public async setChatTypingStatus(isTyping: boolean): Promise<void> {
    return chatHandler.setChatTypingStatus(this, isTyping);
  }

  public getCurrentChannel(): string {
    return chatHandler.getCurrentChannel(this);
  }

  // =========================================================================
  // SESSION LIFECYCLE
  // =========================================================================

  /**
   * Save the player's current camera position to tycoon cookies.
   * Delphi: SetTycoonCookie(TycoonId, 'LastX.0', x) / SetTycoonCookie(TycoonId, 'LastY.0', y)
   * Called before endSession to persist position across sessions.
   */
  public async savePlayerPosition(): Promise<void> {
    if (!this.worldContextId || !this.tycoonId) {
      this.log.debug('[Session] Cannot save position — not connected to world');
      return;
    }
    if (this.lastPlayerX === 0 && this.lastPlayerY === 0) {
      this.log.debug('[Session] Skipping position save — position is (0, 0)');
      return;
    }

    try {
      this.log.debug(`[Session] Saving player position: (${this.lastPlayerX}, ${this.lastPlayerY})`);

      const socket = this.sockets.get('world');
      if (!socket || socket.destroyed) return;

      // SetTycoonCookie(TycoonId, CookieName, CookieValue) — void push
      const cmdX = RdoCommand.sel(this.worldContextId)
        .call('SetTycoonCookie').push()
        .args(RdoValue.int(parseInt(this.tycoonId, 10)), RdoValue.string('LastX.0'), RdoValue.string(String(this.lastPlayerX)))
        .build();
      socket.write(cmdX);

      const cmdY = RdoCommand.sel(this.worldContextId)
        .call('SetTycoonCookie').push()
        .args(RdoValue.int(parseInt(this.tycoonId, 10)), RdoValue.string('LastY.0'), RdoValue.string(String(this.lastPlayerY)))
        .build();
      socket.write(cmdY);

      this.log.debug('[Session] Player position saved');
    } catch (e: unknown) {
      this.log.debug(`[Session] Failed to save position: ${toErrorMessage(e)}`);
    }
  }

  /**
   * Whether the session has an active world connection (WORLD_CONNECTING or WORLD_CONNECTED).
   * Used by the gateway to detect server-switch scenarios.
   */
  public isWorldConnected(): boolean {
    return this.phase === SessionPhase.WORLD_CONNECTING
        || this.phase === SessionPhase.WORLD_CONNECTED;
  }

  /**
   * Cleanup current world session for server switching.
   * Sends RDOEndSession, closes all persistent sockets (world, mail, map, etc.),
   * resets world-level state, but preserves credentials and directory data
   * so the session can loginWorld() to a different server.
   */
  public async cleanupWorldSession(): Promise<void> {
    this.log.debug('[Session] Cleaning up world session for server switch...');

    // 1. Send RDOEndSession to gracefully close the game server session
    await this.endSession();

    // 2. Stop background services
    this.stopServerBusyPolling();
    this.stopCacherKeepAlive();

    // 3. Close all persistent sockets (keep directory data intact)
    for (const [name, socket] of this.sockets.entries()) {
      this.log.debug(`[Session] Closing socket: ${name}`);
      try {
        socket.removeAllListeners();
        socket.destroy();
      } catch (err: unknown) {
        this.log.error(`[Session] Error closing socket ${name}:`, err);
      }
    }
    this.sockets.clear();
    this.framers.clear();

    // 4. Clear pending requests and buffers
    for (const [, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error('Session cleaned up for server switch'));
    }
    this.pendingRequests.clear();
    this.requestBuffer = [];
    this.pendingMapRequests.clear();

    // 5. Reset world-level state (preserve credentials + directory data)
    this.worldContextId = null;
    this.tycoonId = null;
    this.currentWorldInfo = null;
    this.rdoCnntId = null;
    this.cacherId = null;
    this.worldId = null;
    this.daPort = null;
    this.aspActionCache.clear();
    this.interfaceServerId = null;
    this.interfaceEventsId = null;
    this.mailAccount = null;
    this.mailAddr = null;
    this.mailPort = null;
    this.mailServerId = null;
    this.worldXSize = null;
    this.worldYSize = null;
    this.worldSeason = null;
    this.virtualDate = null;
    this.accountMoney = null;
    this.failureLevel = null;
    this.fTycoonProxyId = null;
    this.lastRanking = 0;
    this.lastBuildingCount = 0;
    this.lastMaxBuildings = 0;
    this.currentCompany = null;
    this.availableCompanies = [];
    this.currentFocusedBuildingId = null;
    this.currentFocusedCoords = null;
    this.isServerBusy = false;
    this.activeMapRequests = 0;
    this.knownObjects.clear();
    this.chatUsers.clear();
    this.currentChannel = '';

    // 6. Reset phase to allow new loginWorld()
    this.phase = SessionPhase.DIRECTORY_CONNECTED;

    this.log.debug('[Session] World session cleanup complete, ready for new loginWorld()');
  }

  /**
   * Send RDOEndSession to gracefully close the game server session
   * Should be called before destroy() when user logs out
   * RDO Command: C <RID> sel <interfaceServerId> call RDOEndSession "*" ;
   * Schedules socket closure 2 seconds after RDOEndSession is sent
   */
  public async endSession(): Promise<void> {
    // Save camera position before ending session
    await this.savePlayerPosition();

    if (!this.interfaceServerId) {
      this.log.debug('[Session] No active world session to end (no interfaceServerId)');
      return;
    }

    this.log.debug(`[Session] Ending session for interfaceServerId: ${this.interfaceServerId}`);

    // Build RDOEndSession command (same target as Logon)
    const endSessionCmd = RdoCommand.sel(this.interfaceServerId)
      .call('RDOEndSession')
      .push()
      .build();

    // Send to world socket and schedule delayed closure
    const socket = this.sockets.get('world');
    if (socket && !socket.destroyed) {
      try {
        socket.write(endSessionCmd);
        this.log.debug('[Session] Sent RDOEndSession to world socket');

        // Schedule socket closure 2 seconds after RDOEndSession
        this.scheduleSocketClosure('world', socket, 2000);
      } catch (err: unknown) {
        this.log.error('[Session] Error sending RDOEndSession:', err);
      }
    }

    // Small delay to allow the command to be sent before cleanup
    await new Promise(resolve => setTimeout(resolve, 100));

    this.log.debug('[Session] Session ended successfully (sockets will close in 2 seconds)');
  }

  /**
   * Schedule a socket to be closed after a delay
   * @param socketName Name identifier for logging
   * @param socket The TCP socket to close
   * @param delayMs Delay in milliseconds before closing
   */
  private scheduleSocketClosure(socketName: string, socket: net.Socket, delayMs: number): void {
    setTimeout(() => {
      if (!socket.destroyed) {
        this.log.debug(`[Session] Closing ${socketName} socket after ${delayMs}ms delay`);
        try {
          socket.end(); // Graceful close
          // Force destroy after another second if still open
          setTimeout(() => {
            if (!socket.destroyed) {
              this.log.debug(`[Session] Force destroying ${socketName} socket`);
              socket.destroy();
            }
          }, 1000);
        } catch (err: unknown) {
          this.log.error(`[Session] Error closing ${socketName} socket:`, err);
          socket.destroy();
        }
      }
    }, delayMs);
  }

  /**
   * Cleanup all resources and close all connections
   * Should be called when the WebSocket client disconnects
   */
  public destroy(): void {
    this.log.debug('[Session] Destroying session and cleaning up resources...');

    // Stop ServerBusy polling
    this.stopServerBusyPolling();

    // Stop cacher KeepAlive timer
    this.stopCacherKeepAlive();

    // Close all TCP sockets
    for (const [name, socket] of this.sockets.entries()) {
      this.log.debug(`[Session] Closing socket: ${name}`);
      try {
        socket.destroy();
      } catch (err: unknown) {
        this.log.error(`[Session] Error closing socket ${name}:`, err);
      }
    }

    // Clear all maps and buffers
    this.sockets.clear();
    this.framers.clear();
    this.pendingRequests.clear();
    this.availableWorlds.clear();
    this.knownObjects.clear();
    this.chatUsers.clear();
    this.requestBuffer = [];
    this.pendingMapRequests.clear();

    // Reset state
    this.phase = SessionPhase.DISCONNECTED;
    this.directorySessionId = null;
    this.worldContextId = null;
    this.tycoonId = null;
    this.currentWorldInfo = null;
    this.rdoCnntId = null;
    this.cacherId = null;
    this.worldId = null;
    this.daPort = null;
    this.aspActionCache.clear();
    this.interfaceEventsId = null;
    this.currentFocusedBuildingId = null;
    this.currentFocusedCoords = null;
    this.isServerBusy = false;
    this.activeMapRequests = 0;

    // Zero out credentials from memory
    this._cachedPassword = null;
    this.cachedUsername = null;

    this.log.debug('[Session] Session destroyed successfully');
  }

  // -- ZONE/SURFACE (facade -> zone-surface-handler) -----------------------
  public async defineZone(zoneId: number, x1: number, y1: number, x2: number, y2: number): Promise<{ success: boolean; message?: string }> {
    return zoneSurfaceHandler.defineZone(this, zoneId, x1, y1, x2, y2);
  }

  public async getSurfaceData(surfaceType: SurfaceType, x1: number, y1: number, x2: number, y2: number): Promise<SurfaceData> {
    return zoneSurfaceHandler.getSurfaceData(this, surfaceType, x1, y1, x2, y2);
  }

  // -- BUILDING TEMPLATES (facade -> building-templates-handler) ------------
  public async fetchClusterInfo(clusterName: string): Promise<ClusterInfo> {
    return buildingTemplatesHandler.fetchClusterInfo(this, clusterName);
  }

  public async fetchClusterFacilities(cluster: string, folder: string): Promise<ClusterFacilityPreview[]> {
    return buildingTemplatesHandler.fetchClusterFacilities(this, cluster, folder);
  }

  public async fetchBuildingCategories(companyName: string): Promise<BuildingCategory[]> {
    return buildingTemplatesHandler.fetchBuildingCategories(this, companyName);
  }

  public async fetchBuildingFacilities(companyName: string, cluster: string, kind: string, kindName: string, folder: string, tycoonLevel: number): Promise<BuildingInfo[]> {
    return buildingTemplatesHandler.fetchBuildingFacilities(this, companyName, cluster, kind, kindName, folder, tycoonLevel);
  }

  public async placeBuilding(facilityClass: string, x: number, y: number): Promise<{ success: boolean; buildingId: string | null }> {
    return buildingTemplatesHandler.placeBuilding(this, facilityClass, x, y);
  }

  public async placeCapitol(x: number, y: number): Promise<{ success: boolean; buildingId: string | null }> {
    return buildingTemplatesHandler.placeCapitol(this, x, y);
  }

  // -- BUILDING DETAILS (facade -> building-details-handler) ----------------
  public async getBuildingDetails(x: number, y: number, visualClass: string): Promise<BuildingDetailsResponse> {
    return buildingDetailsHandler.getBuildingDetails(this, x, y, visualClass);
  }

  // -- BUILDING PROPERTY (facade -> building-property-handler) --------------
  public async setBuildingProperty(x: number, y: number, propertyName: string, value: string, additionalParams?: Record<string, string>): Promise<{ success: boolean; newValue: string }> {
    return buildingPropertyHandler.setBuildingProperty(this, x, y, propertyName, value, additionalParams);
  }

  // -- RESEARCH (facade -> research-handler) --------------------------------
  public async getResearchInventory(x: number, y: number, categoryIndex: number): Promise<ResearchCategoryData> {
    return researchHandler.getResearchInventory(this, x, y, categoryIndex);
  }

  public async getResearchDetails(x: number, y: number, inventionId: string): Promise<ResearchInventionDetails> {
    return researchHandler.getResearchDetails(this, x, y, inventionId);
  }

}

// parseResearchItems moved to session/session-utils.ts — re-export for backward compat
export { parseResearchItems } from './session/session-utils';
