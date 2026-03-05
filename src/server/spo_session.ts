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
  DIRECTORY_QUERY,
  WsMessageType,
  WsEventChatMsg,
  WsEventTycoonUpdate,
  CompanyInfo,
  MapData,
  WsEventRdoPush,
  WsEventEndOfPeriod,
  WsEventRefreshDate,
  ChatUser,
  WsEventChatUserTyping,
  WsEventChatChannelChange,
  WsEventChatUserListChange,
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
  WsEventNewMail,
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
  ConnectionSearchResult,
  FavoritesItem,
  ResearchCategoryData,
  ResearchInventionItem,
  ResearchInventionDetails,
  WsEventShowNotification,
  WsEventCacheRefresh,
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

/** Parse WorldSeason value — real server sends integer (#2), test harness sends string (%Spring) */
function parseSeasonValue(value: string): number {
  const num = parseInt(value, 10);
  if (!isNaN(num) && num >= 0 && num <= 3) return num;
  const map: Record<string, number> = { winter: 0, spring: 1, summer: 2, autumn: 3, fall: 3 };
  return map[value.toLowerCase()] ?? 2; // default Summer
}

// Favorites protocol constants (from Delphi FavProtocol.pas)
const FAV_PROP_SEP = '\x01';  // chrPropSeparator = char(1)
const FAV_ITEM_SEP = '\x02';  // chrItemSeparator = char(2)
const FAV_KIND_LINK = 1;      // fvkLink — a bookmark with coordinates

/**
 * Parse the RDOFavoritesGetSubItems response string.
 *
 * Wire format per item: id \x01 kind \x01 name \x01 info \x01 subFolderCount \x01
 * Items separated by \x02.
 * For links (kind=1): info = "displayName,x,y,select"
 */
export function parseFavoritesResponse(raw: string): FavoritesItem[] {
  if (!raw) return [];

  const items: FavoritesItem[] = [];
  const entries = raw.split(FAV_ITEM_SEP);

  for (const entry of entries) {
    if (!entry) continue;
    const fields = entry.split(FAV_PROP_SEP);
    // fields: [id, kind, name, info, subFolderCount, '']
    if (fields.length < 4) continue;

    const kind = parseInt(fields[1], 10);
    if (kind !== FAV_KIND_LINK) continue; // skip folders

    const id = parseInt(fields[0], 10);
    const name = fields[2];
    const info = fields[3]; // "displayName,x,y,select"

    // Parse info cookie: last 3 comma-separated values are x, y, select
    const lastComma = info.lastIndexOf(',');
    if (lastComma < 0) continue;
    const beforeLast = info.lastIndexOf(',', lastComma - 1);
    if (beforeLast < 0) continue;
    const beforeXY = info.lastIndexOf(',', beforeLast - 1);
    if (beforeXY < 0) continue;

    const x = parseInt(info.substring(beforeXY + 1, beforeLast), 10);
    const y = parseInt(info.substring(beforeLast + 1, lastComma), 10);

    if (isNaN(id) || isNaN(x) || isNaN(y)) continue;

    items.push({ id, name, x, y });
  }

  return items;
}

export class StarpeaceSession extends EventEmitter {
  private readonly log = createLogger('Session');
  private sockets: Map<string, net.Socket> = new Map();
  private framers: Map<string, RdoFramer> = new Map();
  private phase: SessionPhase = SessionPhase.DISCONNECTED;
  private requestIdCounter: number = 1000;

  /**
   * Convert remote image URL to local proxy URL
   * Keeps original filename for debugging
   */
  private convertToProxyUrl(remoteUrl: string): string {
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
  private worldContextId: string | null = null;
  private tycoonId: string | null = null;
  private currentWorldInfo: WorldInfo | null = null;
  private rdoCnntId: string | null = null;
  private cacherId: string | null = null;
  private worldId: string | null = null;
  private daAddr: string | null = null;
  private daPort: number | null = null;

  /** Cache of action URLs extracted from ASP HTML responses, keyed by ASP page path */
  private aspActionCache: Map<string, Map<string, AspActionUrl>> = new Map();

  // InitClient data (received during login)
  private virtualDate: number | null = null; // Server virtual date (Double)
  private accountMoney: string | null = null; // Account money (can be very large)
  private failureLevel: number | null = null; // Company status (0 = nominal, >0 = in debt)
  private fTycoonProxyId: number | null = null; // Tycoon proxy ID (IS-local handle, NOT valid on World server)

  // RefreshTycoon push data (updated periodically by server)
  private lastRanking: number = 0;
  private lastBuildingCount: number = 0;
  private lastMaxBuildings: number = 0;

  // Credentials cache
  private cachedUsername: string | null = null;
  private cachedPassword: string | null = null;
  private cachedZonePath: string = 'Root/Areas/Asia/Worlds';

  // Active login identity — differs from cachedUsername during role-based company switches
  // (e.g., "President of Shamba" vs original tycoon "SPO_test3")
  private activeUsername: string | null = null;

  // Current company info (for role-based switching)
  private currentCompany: CompanyInfo | null = null;
  private availableCompanies: CompanyInfo[] = [];

  // Additional world properties
  private mailAccount: string | null = null;
  private interfaceServerId: string | null = null;
  private mailAddr: string | null = null;
  private mailPort: number | null = null;
  private mailServerId: string | null = null;
  private worldXSize: number | null = null;
  private worldYSize: number | null = null;
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
  private currentFocusedBuildingId: string | null = null;
  private currentFocusedCoords: { x: number, y: number } | null = null;
  
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
    private pendingMapRequests: Set<string> = new Set();



  constructor() {
    super();
  }

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

  /**
   * Connects to Directory Service in two ephemeral phases:
   * 1. Authentication Check
   * 2. World List Retrieval
   */
  public async connectDirectory(username: string, pass: string, zonePath?: string): Promise<WorldInfo[]> {
    this.phase = SessionPhase.DIRECTORY_CONNECTED;
    this.cachedUsername = username;
    this.activeUsername = username;
    this.cachedPassword = pass;
    this.cachedZonePath = zonePath || 'Root/Areas/Asia/Worlds';

    // Run auth and world query in parallel (independent sockets & sessions)
    this.log.info('Directory: connecting...');
    const [, worlds] = await Promise.all([
      this.performDirectoryAuth(username, pass),
      this.performDirectoryQuery(zonePath)
    ]);
    this.log.info('Directory: auth + query complete');
    return worlds;
  }

  /**
   * Helper Phase 1: Auth -> EndSession
   */
  private async performDirectoryAuth(username: string, pass: string): Promise<void> {
    const socket = await this.createSocket('directory_auth', config.rdo.directoryHost, config.rdo.ports.directory);
    try {
      // 1. Resolve & Open Session
      const idPacket = await this.sendRdoRequest('directory_auth', { verb: RdoVerb.IDOF, targetId: 'DirectoryServer' });
      const directoryServerId = parseIdOfResponseHelper(idPacket.payload);
      const sessionPacket = await this.sendRdoRequest('directory_auth', {
        verb: RdoVerb.SEL, targetId: directoryServerId, action: RdoAction.GET, member: 'RDOOpenSession'
      });
      const sessionId = parsePropertyResponseHelper(sessionPacket.payload || '', 'RDOOpenSession');

      // 2. Map & Logon
      await this.sendRdoRequest('directory_auth', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOMapSegaUser',
        args: [username]
      });
      const logonPacket = await this.sendRdoRequest('directory_auth', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOLogonUser',
        args: [username, pass]
      });
      const res = parsePropertyResponseHelper(logonPacket.payload || '', 'res');
      if (res !== '0') throw new Error(`Directory Authentication failed (Code: ${res})`);

      // 3. End Session & Close (fire-and-forget — void push, no RID)
      socket.write(`C sel ${sessionId} call RDOEndSession "*";`);
      this.log.debug('[Session] Directory Authentication Success');
    } finally {
      socket.end();
      this.sockets.delete('directory_auth');
    }
  }

  /**
   * Helper Phase 2: OpenSession -> QueryKey -> EndSession
   */
  private async performDirectoryQuery(zonePath?: string): Promise<WorldInfo[]> {
    const socket = await this.createSocket('directory_query', config.rdo.directoryHost, config.rdo.ports.directory);
    try {
      // 1. Resolve & Open NEW Session
      const idPacket = await this.sendRdoRequest('directory_query', { verb: RdoVerb.IDOF, targetId: 'DirectoryServer' });
      const directoryServerId = parseIdOfResponseHelper(idPacket.payload);
      const sessionPacket = await this.sendRdoRequest('directory_query', {
        verb: RdoVerb.SEL, targetId: directoryServerId, action: RdoAction.GET, member: 'RDOOpenSession'
      });
      const sessionId = parsePropertyResponseHelper(sessionPacket.payload || '', 'RDOOpenSession');

      // 2. Query Worlds - Use provided zonePath or default to BETA (Asia/Worlds)
      const worldPath = zonePath || 'Root/Areas/Asia/Worlds';
      const queryPacket = await this.sendRdoRequest('directory_query', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOQueryKey',
        args: [worldPath, DIRECTORY_QUERY.QUERY_BLOCK]
      });
      const resValue = parsePropertyResponseHelper(queryPacket.payload || '', 'res');
      const worlds = this.parseDirectoryResult(resValue);
      this.availableWorlds.clear();
      for (const w of worlds) {
        this.availableWorlds.set(w.name, w);
      }

      // 3. End Session & Close (fire-and-forget — void push, no RID)
      socket.write(`C sel ${sessionId} call RDOEndSession "*";`);
      return worlds;
    } finally {
      socket.end();
      this.sockets.delete('directory_query');
    }
  }

  public getWorldInfo(name: string): WorldInfo | undefined {
    return this.availableWorlds.get(name);
  }

  /**
   * Search for people/tycoons via RDOSearchKey on the Directory Server.
   * Opens an ephemeral directory session, searches, and closes.
   */
  public async searchPeople(searchStr: string): Promise<string[]> {
    const socket = await this.createSocket('directory_search', config.rdo.directoryHost, config.rdo.ports.directory);
    try {
      // 1. Resolve DirectoryServer object
      const idPacket = await this.sendRdoRequest('directory_search', {
        verb: RdoVerb.IDOF, targetId: 'DirectoryServer'
      });
      const directoryServerId = parseIdOfResponseHelper(idPacket.payload);

      // 2. Open Session
      const sessionPacket = await this.sendRdoRequest('directory_search', {
        verb: RdoVerb.SEL, targetId: directoryServerId, action: RdoAction.GET, member: 'RDOOpenSession'
      });
      const sessionId = parsePropertyResponseHelper(sessionPacket.payload || '', 'RDOOpenSession');

      // 3. Navigate to the world's directory root
      const worldName = this.currentWorldInfo?.name || '';
      const worldPath = `${this.cachedZonePath}/${worldName}`;
      await this.sendRdoRequest('directory_search', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOSetCurrentKey',
        args: [worldPath]
      });

      // 4. Search for matching keys under the world
      const searchPacket = await this.sendRdoRequest('directory_search', {
        verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOSearchKey',
        args: [`*${searchStr}*`, '']
      });
      const resValue = parsePropertyResponseHelper(searchPacket.payload || '', 'res');

      // 5. Parse results (Count=N, Key0=name0, Key1=name1, ...)
      const names = this.parseSearchKeyResults(resValue);

      // 6. End Session (fire-and-forget — void push, no RID)
      socket.write(`C sel ${sessionId} call RDOEndSession "*";`);

      return names;
    } catch (err: unknown) {
      this.log.error('[Session] searchPeople failed:', toErrorMessage(err));
      return [];
    } finally {
      socket.end();
      this.sockets.delete('directory_search');
    }
  }

  private parseSearchKeyResults(payload: string): string[] {
    let raw = payload.trim();
    raw = raw.replace(/^[%#$@]/, '');
    const lines = raw.split(/\n/);
    const data: Map<string, string> = new Map();

    for (const line of lines) {
      if (!line.includes('=')) continue;
      const parts = line.split('=');
      const key = parts[0].trim().toLowerCase();
      const value = parts.slice(1).join('=').trim();
      data.set(key, value);
    }

    const countStr = data.get('count');
    if (!countStr) {
      this.log.warn('[Session] SearchKey: no "count" key in response');
      return [];
    }

    const count = parseInt(countStr, 10);
    const names: string[] = [];

    for (let i = 0; i < count; i++) {
      const name = data.get(`key${i}`);
      if (name) names.push(name);
    }

    return names;
  }

public async loginWorld(username: string, pass: string, world: WorldInfo): Promise<{
  contextId: string;
  tycoonId: string;
  companies: CompanyInfo[];
  worldXSize: number | null;
  worldYSize: number | null;
  worldSeason: number | null;
}> {
  this.phase = SessionPhase.WORLD_CONNECTING;
  this.currentWorldInfo = world;

  this.log.info(`Connecting to world ${world.name} (${world.ip}:${world.port})`);

  // Connect to World Server
  await this.createSocket("world", world.ip, world.port);

  // Generate Virtual Client ID for InterfaceEvents BEFORE any requests
  const virtualEventId = (Math.floor(Math.random() * 6000000) + 38000000).toString();
  this.knownObjects.set("InterfaceEvents", virtualEventId);
  this.log.debug(`[Session] Virtual InterfaceEvents ID: ${virtualEventId}`);

  // 1. Resolve InterfaceServer
  const idPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.IDOF,
    targetId: "InterfaceServer"
  });
  this.interfaceServerId = parseIdOfResponseHelper(idPacket.payload);
  this.log.debug(`[Session] InterfaceServer ID: ${this.interfaceServerId}`);

  // 2. Retrieve World Properties (10 properties)
  await this.fetchWorldProperties(this.interfaceServerId);

  // 3. Check AccountStatus
  const statusPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.interfaceServerId,
    action: RdoAction.CALL,
    member: "AccountStatus",
    args: [username, pass]
  });
  const statusPayload = parsePropertyResponseHelper(statusPacket.payload!, "res");
  this.log.debug(`[Session] AccountStatus: ${statusPayload}`);

  // 4. Authenticate (call Logon)
  const logonPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.interfaceServerId,
    action: RdoAction.CALL,
    member: "Logon",
    args: [username, pass]
  });

  let contextId = cleanPayloadHelper(logonPacket.payload!);
  if (contextId.includes("res")) {
    contextId = parsePropertyResponseHelper(logonPacket.payload!, "res");
  }

  if (!contextId || contextId === "0" || contextId.startsWith("error")) {
    throw new Error(`Login failed: ${logonPacket.payload}`);
  }

  this.worldContextId = contextId;
  this.log.debug(`[Session] Authenticated. Context RDO: ${this.worldContextId}`);

  // 5. Retrieve User Properties — sequential (legacy client sends one at a time)
  const mailPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL, targetId: this.worldContextId,
    action: RdoAction.GET, member: "MailAccount"
  });
  this.mailAccount = parsePropertyResponseHelper(mailPacket.payload!, "MailAccount");
  this.log.debug(`[Session] MailAccount: ${this.mailAccount}`);

  const tycoonPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL, targetId: this.worldContextId,
    action: RdoAction.GET, member: "TycoonId"
  });
  this.tycoonId = parsePropertyResponseHelper(tycoonPacket.payload!, "TycoonId");

  const cnntPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL, targetId: this.worldContextId,
    action: RdoAction.GET, member: "RDOCnntId"
  });
  this.rdoCnntId = parsePropertyResponseHelper(cnntPacket.payload!, "RDOCnntId");

  // 6. Setup InitClient waiter BEFORE RegisterEventsById
  this.waitingForInitClient = true;
  this.initClientReceived = new Promise<void>((resolve) => {
    this.initClientResolver = resolve;
  });

  // 7. Register Events - This triggers server's "C <rid> idof InterfaceEvents"
  // IMPORTANT: Don't await this! The server sends InitClient push BEFORE responding
  // to RegisterEventsById, so we'd timeout waiting for the response.
  this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: "RegisterEventsById",
    args: [this.rdoCnntId]
  }).catch(err => {
    // RegisterEventsById may timeout because server responds after InitClient push
    // This is expected behavior, ignore the timeout
    this.log.debug(`[Session] RegisterEventsById completed (or timed out, which is normal)`);
  });

  // CRITICAL: Wait for server to send InitClient push command (with timeout)
  this.log.debug(`[Session] Waiting for server InitClient push...`);
  let initTimeoutHandle: ReturnType<typeof setTimeout>;
  const initClientTimeout = new Promise<never>((_, reject) =>
    initTimeoutHandle = setTimeout(() => reject(new Error('InitClient push timeout after 15s')), 15000)
  );
  await Promise.race([this.initClientReceived, initClientTimeout]);
  clearTimeout(initTimeoutHandle!);
  this.log.debug(`[Session] InitClient received, continuing...`);

  // 8. SetLanguage - CLIENT sends this as PUSH command (no RID)
  const socket = this.sockets.get('world');
  if (socket) {
    const setLangCmd = RdoCommand.sel(this.worldContextId!)
      .call('SetLanguage')
      .push()
      .args(RdoValue.string('0'))
      .build();
    socket.write(setLangCmd);
    this.log.debug(`[Session] Sent SetLanguage push command`);
  }

  // 9. GetCompanyCount
  const companyCountPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.GET,
    member: "GetCompanyCount"
  });
  const companyCountStr = parsePropertyResponseHelper(companyCountPacket.payload!, "GetCompanyCount");
  const companyCount = parseInt(companyCountStr, 10) || 0;
  this.log.debug(`[Session] Company Count: ${companyCount}`);

  // 10. Fetch companies via HTTP for UI
  const { companies } = await this.fetchCompaniesViaHttp(world.ip, username);
  this.availableCompanies = companies;

  this.log.info('Login phase complete. Waiting for company selection...');

  // NOTE: Phase remains WORLD_CONNECTING until selectCompany() is called
  return {
    contextId: this.worldContextId, tycoonId: this.tycoonId, companies,
    worldXSize: this.worldXSize, worldYSize: this.worldYSize, worldSeason: this.worldSeason,
  };
}

public async selectCompany(companyId: string): Promise<void> {
  if (!this.worldContextId) {
    throw new Error('Not logged into world');
  }

  this.log.debug(`[Session] Selecting company ID: ${companyId}`);

  // Store the selected company for ASP requests (bank, profile, etc.)
  const matched = this.availableCompanies.find(c => c.id === companyId);
  if (matched) {
    this.currentCompany = matched;
    this.log.debug(`[Session] Current company set: ${matched.name}`);
  }

  // 1. EnableEvents (set to -1 to activate)
  await this.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.SET,
    member: 'EnableEvents',
    args: ['-1']
  });
  this.log.debug(`[Session] EnableEvents activated`);

  // 2. First PickEvent - Subscribe to Tycoon updates
  await this.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: 'PickEvent',
    args: [this.tycoonId!]
  });
  this.log.debug(`[Session] PickEvent #1 sent`);

  // 3. Get Tycoon Cookies — sequential (legacy client sends one at a time)
  const lastYPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL, targetId: this.worldContextId,
    action: RdoAction.CALL, member: "GetTycoonCookie",
    args: [this.tycoonId!, "LastY.0"]
  });
  const lastY = parsePropertyResponseHelper(lastYPacket.payload!, "res");
  this.lastPlayerY = parseInt(lastY, 10) || 0;
  this.log.debug(`[Session] Cookie LastY.0: ${this.lastPlayerY}`);

  const lastXPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL, targetId: this.worldContextId,
    action: RdoAction.CALL, member: "GetTycoonCookie",
    args: [this.tycoonId!, "LastX.0"]
  });
  const lastX = parsePropertyResponseHelper(lastXPacket.payload!, "res");
  this.lastPlayerX = parseInt(lastX, 10) || 0;
  this.log.debug(`[Session] Cookie LastX.0: ${this.lastPlayerX}`);

  const allCookiesPacket = await this.sendRdoRequest("world", {
    verb: RdoVerb.SEL, targetId: this.worldContextId,
    action: RdoAction.CALL, member: "GetTycoonCookie",
    args: [this.tycoonId!, ""]
  });
  const allCookies = parsePropertyResponseHelper(allCookiesPacket.payload!, "res");
  this.log.debug(`[Session] All Cookies:\n${allCookies}`);

  // 4. ClientAware - Notify ready (first call)
  const socket = this.sockets.get('world');
  if (socket) {
    const clientAwareCmd = RdoCommand.sel(this.worldContextId!)
      .call('ClientAware')
      .push()
      .build();
    socket.write(clientAwareCmd);
    this.log.debug(`[Session] Sent ClientAware #1`);
  }

  // 5. Second PickEvent
  await this.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: this.worldContextId,
    action: RdoAction.CALL,
    member: 'PickEvent',
    args: [this.tycoonId!]
  });
  this.log.debug(`[Session] PickEvent #2 sent`);

  // 6. Second ClientAware
  if (socket) {
    const clientAwareCmd2 = RdoCommand.sel(this.worldContextId!)
      .call('ClientAware')
      .push()
      .build();
    socket.write(clientAwareCmd2);
    this.log.debug(`[Session] Sent ClientAware #2`);
  }

  // NOW the session is fully ready for game
  this.phase = SessionPhase.WORLD_CONNECTED;

  // Start ServerBusy polling now that we're fully connected
  this.startServerBusyPolling();

  this.log.info(`Company ${companyId} selected - Ready for game!`);
  this.log.info(`Player spawn: (${this.lastPlayerX}, ${this.lastPlayerY})`);
}

/**
 * Create a new company via RDO on the InterfaceServer.
 *
 * The legacy client calls rdoCreateCompany.asp which internally calls:
 *   InterfaceServer.NewCompany(name, cluster) — 2 params, username from IS session.
 *
 * Our gateway calls the same method directly via RDO socket:
 *   sel <worldContextId> call NewCompany "^" "%<name>","%<cluster>"
 *
 * The InterfaceServer internally calls:
 *   World.RDONewCompany(username, name, cluster) — 3 params, adds username.
 *
 * Response is always a widestring (IS casts to widestring):
 *   Success: res="%[CompanyName,CompanyId]"
 *   Error:   res="%<errorCode>"  (e.g. "%6" for unknown cluster)
 */
public async createCompany(
  companyName: string,
  cluster: string
): Promise<{ success: boolean; companyName: string; companyId: string; message?: string }> {
  if (!this.worldContextId) {
    return { success: false, companyName: '', companyId: '', message: 'Not connected to world' };
  }

  const username = this.cachedUsername || '';
  this.log.debug(`[Session] Creating company: "${companyName}" in cluster "${cluster}" for user "${username}"`);

  try {
    // InterfaceServer.NewCompany(name, cluster) — only 2 args.
    // Username is filled from the IS session automatically.
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'NewCompany',
      separator: '"^"',
      args: [RdoValue.string(companyName).format(), RdoValue.string(cluster).format()]
    });

    const payload = packet.payload || '';
    this.log.debug(`[Session] NewCompany response: ${payload}`);

    // Response is always a widestring (InterfaceServer casts to widestring):
    //   Success: res="%[CompanyName,CompanyId]"
    //   Error:   res="%<errorCode>"
    const resMatch = /res="%(.*)"/.exec(payload);
    if (resMatch) {
      const resultStr = resMatch[1];

      // Success: "[Name,Id]"
      const companyMatch = /^\[(.+),(\d+)]$/.exec(resultStr);
      if (companyMatch) {
        const newName = companyMatch[1];
        const newId = companyMatch[2];
        this.log.info(`[Session] Company created: "${newName}" (ID: ${newId})`);
        this.availableCompanies.push({ id: newId, name: newName, ownerRole: username });
        return { success: true, companyName: newName, companyId: newId };
      }

      // Error: numeric error code as string (e.g. "6", "11")
      const errorCode = parseInt(resultStr, 10);
      if (!isNaN(errorCode)) {
        const errorMessages: Record<number, string> = {
          6: 'Unknown cluster',
          11: 'Company name already taken',
          28: 'Zone tier mismatch',
          33: 'Maximum number of companies reached',
        };
        const msg = errorMessages[errorCode] || `Failed with error code ${errorCode}`;
        this.log.warn(`[Session] Company creation failed: ${msg}`);
        return { success: false, companyName: '', companyId: '', message: msg };
      }

      // Non-numeric, non-bracket string — unexpected
      this.log.warn(`[Session] Unexpected NewCompany result: "${resultStr}"`);
      return { success: false, companyName: '', companyId: '', message: `Unexpected result: ${resultStr}` };
    }

    // Fallback: integer-typed error
    const intMatch = /res="#(-?\d+)"/.exec(payload);
    if (intMatch) {
      const errorCode = parseInt(intMatch[1], 10);
      this.log.warn(`[Session] Company creation failed with integer error: ${errorCode}`);
      return { success: false, companyName: '', companyId: '', message: `Failed with error code ${errorCode}` };
    }

    this.log.warn(`[Session] Unexpected NewCompany payload: ${payload}`);
    return { success: false, companyName: '', companyId: '', message: 'Unexpected response from server' };
  } catch (e: unknown) {
    this.log.error('[Session] Failed to create company:', e);
    return { success: false, companyName: '', companyId: '', message: toErrorMessage(e) };
  }
}

/**
 * Switch to a different company (public role or player company)
 * Performs a full re-login using the ownerRole as username
 */
public async switchCompany(company: CompanyInfo): Promise<void> {
  if (!this.currentWorldInfo || !this.cachedPassword) {
    throw new Error('Cannot switch company: world or credentials not available');
  }

  this.log.debug(`[Session] Switching to company: ${company.name} (ownerRole: ${company.ownerRole})`);

  // Store the company we're switching to
  this.currentCompany = company;

  // Determine the username to use for login
  const loginUsername = company.ownerRole || this.cachedUsername || '';

  // Update the active identity so ASP page fetches use the correct tycoon
  this.activeUsername = loginUsername;

  // If ownerRole is different from original username, we need to do a "role switch"
  if (company.ownerRole && company.ownerRole !== this.cachedUsername) {
    this.log.debug(`[Session] Role-based login detected: switching from "${this.cachedUsername}" to role "${company.ownerRole}"`);
  }

  // Stop cacher KeepAlive before closing sockets
  this.stopCacherKeepAlive();

  // Close existing sockets except directory
  this.log.debug('[Session] Closing existing world connections for company switch...');
  const socketsToClose = Array.from(this.sockets.keys()).filter(name => name !== 'directory_auth' && name !== 'directory_query');

  for (const socketName of socketsToClose) {
    const socket = this.sockets.get(socketName);
    if (socket) {
      // CRITICAL: Remove all event listeners before destroying
      // Otherwise the 'close' event will delete the NEW socket from the Map
      socket.removeAllListeners();
      socket.destroy();
      this.sockets.delete(socketName);
      this.framers.delete(socketName);
    }
  }

  // Reset session state
  this.worldContextId = null;
  this.tycoonId = null;
  this.interfaceServerId = null;
  this.rdoCnntId = null;
  this.cacherId = null;
  this.worldId = null;
  this.daPort = null;
  this.aspActionCache.clear();
  this.currentFocusedBuildingId = null;
  this.currentFocusedCoords = null;

  // Re-login to world with the role username
  const result = await this.loginWorld(loginUsername, this.cachedPassword, this.currentWorldInfo);

  this.log.debug(`[Session] Re-logged in as "${loginUsername}", contextId: ${result.contextId}`);
  this.log.debug(`[Session] After switchCompany - interfaceServerId: ${this.interfaceServerId}, worldId: ${this.worldId}`);

  // Small delay to ensure socket is fully ready before selecting company
  await new Promise(resolve => setTimeout(resolve, 200));

  // Select the specific company
  await this.selectCompany(company.id);

  this.log.debug(`[Session] Company switch complete - now playing as ${company.name}`);
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
  private buildAspBaseParams(): URLSearchParams {
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
  private buildAspUrl(aspPath: string, extraParams?: Record<string, string>): string {
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
  private async fetchAspPage(aspPath: string, extraParams?: Record<string, string>): Promise<string> {
    const url = this.buildAspUrl(aspPath, extraParams);
    this.log.debug(`[ASP] Fetching ${aspPath}`);
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`ASP request failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  /**
   * Fetch companies via HTTP (ASP endpoint) [CRIT-02]
   */
  private async fetchCompaniesViaHttp(
    worldIp: string,
    username: string
  ): Promise<{ companies: CompanyInfo[], realContextId: string | null }> {
    const params = new URLSearchParams({
      frame_Id: 'LogonView',
      frame_Class: 'HTMLView',
      frame_Align: 'client',
      ResultType: 'NORMAL',
      Logon: 'FALSE',
      frame_NoBorder: 'True',
      frame_NoScrollBars: 'true',
      ClientViewId: '0',
      WorldName: this.currentWorldInfo?.name || 'Shamba',
      UserName: username,
      DSAddr: config.rdo.directoryHost,
      DSPort: String(config.rdo.ports.directory),
      ISAddr: worldIp,
      ISPort: '8000',
      LangId: '0'
    });

    const url = `http://${worldIp}/Five/0/Visual/Voyager/NewLogon/logonComplete.asp?${params.toString().replace(/\+/g, '%20')}`;
    this.log.debug(`[HTTP] Fetching companies from ${url}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const text = await response.text();
      const finalUrl = response.url;

      // Extract ClientViewId (priority: URL > body)
      let realId: string | null = null;
      const matchUrl = /ClientViewId=(\d+)/i.exec(finalUrl);
      if (matchUrl) realId = matchUrl[1];

      if (!realId) {
        const matchBody = /ClientViewId=(\d+)/i.exec(text);
        if (matchBody) realId = matchBody[1];
      }

      // Parse companies with regex (include companyOwnerRole)
      // Note: Attributes can appear in any order in HTML, so we need to capture them separately
      const companies: CompanyInfo[] = [];

      // Match all <td> elements with company attributes
      const tdRegex = /<td[^>]*companyId="(\d+)"[^>]*>/gi;
      let tdMatch;

      while ((tdMatch = tdRegex.exec(text)) !== null) {
        const companyId = tdMatch[1];
        const tdElement = tdMatch[0]; // Full <td> tag

        // Extract companyName from this specific <td>
        const nameMatch = /companyName="([^"]+)"/i.exec(tdElement);
        const companyName = nameMatch ? nameMatch[1] : `Company ${companyId}`;

        // Extract companyOwnerRole from this specific <td>
        const roleMatch = /companyOwnerRole="([^"]*)"/i.exec(tdElement);
        const ownerRole = roleMatch ? roleMatch[1] : username;

        this.log.debug(`[HTTP] Company parsed - ID: ${companyId}, Name: ${companyName}, ownerRole: ${ownerRole} ${roleMatch ? '(from HTML)' : '(defaulted to username)'}`);

        companies.push({
          id: companyId,
          name: companyName,
          ownerRole: ownerRole
        });
      }

      this.log.debug(`[HTTP] Found ${companies.length} companies, realContextId: ${realId}`);
      return { companies, realContextId: realId };
    } catch (e) {
      this.log.error('[HTTP] Failed to fetch companies:', e);
      return { companies: [], realContextId: null };
    }
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
   * Compose and send a mail message.
   * Reference: MsgComposerHandler.pas:316-329
   * Flow: NewMail → AddLine (per line) → Post
   */
  /**
   * Compose and send a mail message.
   * Reference: MsgComposerHandler.pas:302-344 (SendEvent)
   * Flow: NewMail → AddHeaders? → AddLine (per line) → Post → CloseMessage
   */
  public async composeMail(to: string, subject: string, bodyLines: string[], headers?: string): Promise<boolean> {
    if (!this.mailServerId || !this.mailAccount) {
      throw new Error('Mail service not connected');
    }

    const worldName = this.currentWorldInfo?.name || '';

    // 1. Create in-memory message
    const newMailPacket = await this.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: this.mailServerId,
      action: RdoAction.CALL,
      member: 'NewMail',
      args: [
        RdoValue.string(this.mailAccount).toString(),
        RdoValue.string(to).toString(),
        RdoValue.string(subject).toString()
      ]
    });
    const msgId = parsePropertyResponseHelper(newMailPacket.payload!, 'NewMail');
    this.log.debug(`[Mail] Created message, msgId: ${msgId}`);

    if (!msgId || msgId === '0') {
      this.log.error('[Mail] Failed to create message');
      return false;
    }

    // 2a. Add original headers for reply/forward threading
    if (headers) {
      await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: msgId,
        action: RdoAction.CALL,
        member: 'AddHeaders',
        args: [RdoValue.string(headers).toString()],
        separator: '*'  // void procedure (Delphi: procedure AddHeaders)
      });
    }

    // 2b. Add body lines
    for (const line of bodyLines) {
      await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: msgId,
        action: RdoAction.CALL,
        member: 'AddLine',
        args: [RdoValue.string(line).toString()],
        separator: '*'  // void procedure (Delphi: procedure AddLine)
      });
    }

    // 3. Post (send) the message
    const postPacket = await this.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: this.mailServerId,
      action: RdoAction.CALL,
      member: 'Post',
      args: [RdoValue.string(worldName).toString(), RdoValue.int(parseInt(msgId, 10)).toString()]
    });
    // Post returns wordbool: #-1 = true (success), #0 = false (failure)
    const resultStr = parsePropertyResponseHelper(postPacket.payload!, 'Post');
    const success = resultStr === '-1';
    this.log.debug(`[Mail] Post result: ${resultStr} (success=${success})`);

    // 4. Close message to release server memory (MsgComposerHandler.pas:331)
    try {
      await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: this.mailServerId,
        action: RdoAction.CALL,
        member: 'CloseMessage',
        args: [RdoValue.int(parseInt(msgId, 10)).toString()],
        separator: '*'  // void procedure (Delphi: procedure CloseMessage)
      });
    } catch (e) {
      this.log.warn('[Mail] Failed to close message after post:', e);
    }

    return success;
  }

  /**
   * Save a mail message as draft (not sent).
   * Reference: MsgComposerHandler.pas:346-387
   * Flow: [DeleteMessage old draft?] → NewMail → AddHeaders? → AddLine (per line) → Save → CloseMessage
   */
  public async saveDraft(
    to: string,
    subject: string,
    bodyLines: string[],
    headers?: string,
    existingDraftId?: string
  ): Promise<boolean> {
    if (!this.mailServerId || !this.mailAccount) {
      throw new Error('Mail service not connected');
    }

    const worldName = this.currentWorldInfo?.name || '';

    // If editing existing draft, delete old one first
    if (existingDraftId) {
      await this.deleteMailMessage('Draft', existingDraftId);
    }

    // 1. Create in-memory message
    const newMailPacket = await this.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: this.mailServerId,
      action: RdoAction.CALL,
      member: 'NewMail',
      args: [
        RdoValue.string(this.mailAccount).toString(),
        RdoValue.string(to).toString(),
        RdoValue.string(subject).toString()
      ]
    });
    const msgId = parsePropertyResponseHelper(newMailPacket.payload!, 'NewMail');

    if (!msgId || msgId === '0') {
      this.log.error('[Mail] Failed to create draft message');
      return false;
    }

    // 2. Add original headers for reply/forward threading
    if (headers) {
      await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: msgId,
        action: RdoAction.CALL,
        member: 'AddHeaders',
        args: [RdoValue.string(headers).toString()],
        separator: '*'  // void procedure (Delphi: procedure AddHeaders)
      });
    }

    // 3. Add body lines
    for (const line of bodyLines) {
      await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: msgId,
        action: RdoAction.CALL,
        member: 'AddLine',
        args: [RdoValue.string(line).toString()],
        separator: '*'  // void procedure (Delphi: procedure AddLine)
      });
    }

    // 4. Save to Draft folder (not Post/send)
    const savePacket = await this.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: this.mailServerId,
      action: RdoAction.CALL,
      member: 'Save',
      args: [RdoValue.string(worldName).toString(), RdoValue.int(parseInt(msgId, 10)).toString()]
    });
    // Save returns wordbool: #-1 = true (success), #0 = false (failure)
    const resultStr = parsePropertyResponseHelper(savePacket.payload!, 'Save');
    const success = resultStr === '-1';
    this.log.debug(`[Mail] Save draft result: ${resultStr} (success=${success})`);

    // 5. Close message to release server memory
    try {
      await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: this.mailServerId,
        action: RdoAction.CALL,
        member: 'CloseMessage',
        args: [RdoValue.int(parseInt(msgId, 10)).toString()],
        separator: '*'  // void procedure (Delphi: procedure CloseMessage)
      });
    } catch (e) {
      this.log.warn('[Mail] Failed to close message after save:', e);
    }

    return success;
  }

  /**
   * Open and read a mail message.
   * Reference: MsgComposerHandler.pas:416-420
   * Flow: OpenMessage → GetHeaders → GetLines → GetAttachmentCount → GetAttachment → CloseMessage
   */
  public async readMailMessage(folder: string, messageId: string): Promise<MailMessageFull> {
    if (!this.mailServerId || !this.mailAccount) {
      throw new Error('Mail service not connected');
    }

    const worldName = this.currentWorldInfo?.name || '';

    // 1. Open message (loads from disk into server memory)
    const openPacket = await this.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: this.mailServerId,
      action: RdoAction.CALL,
      member: 'OpenMessage',
      args: [
        RdoValue.string(worldName).toString(),
        RdoValue.string(this.mailAccount).toString(),
        RdoValue.string(folder).toString(),
        RdoValue.string(messageId).toString()
      ]
    });
    const msgId = parsePropertyResponseHelper(openPacket.payload!, 'OpenMessage');
    this.log.debug(`[Mail] Opened message, msgId: ${msgId}`);

    try {
      // 2. Get headers (ini-style key=value text)
      const headersPacket = await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: msgId,
        action: RdoAction.CALL,
        member: 'GetHeaders',
        args: [RdoValue.int(0).toString()]
      });
      const headersText = headersPacket.payload || '';

      // 3. Get body lines
      const linesPacket = await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: msgId,
        action: RdoAction.CALL,
        member: 'GetLines',
        args: [RdoValue.int(0).toString()]
      });
      const bodyText = linesPacket.payload || '';

      // 4. Get attachments
      const attachCountPacket = await this.sendRdoRequest('mail', {
        verb: RdoVerb.SEL,
        targetId: msgId,
        action: RdoAction.CALL,
        member: 'GetAttachmentCount',
        args: [RdoValue.int(0).toString()]
      });
      const attachCountStr = parsePropertyResponseHelper(attachCountPacket.payload!, 'GetAttachmentCount');
      const attachCount = parseInt(attachCountStr, 10) || 0;

      const attachments: MailAttachment[] = [];
      for (let i = 0; i < attachCount; i++) {
        const attachPacket = await this.sendRdoRequest('mail', {
          verb: RdoVerb.SEL,
          targetId: msgId,
          action: RdoAction.CALL,
          member: 'GetAttachment',
          args: [RdoValue.int(i).toString()]
        });
        const attachText = attachPacket.payload || '';
        attachments.push(this.parseMailAttachment(attachText));
      }

      // Parse headers and body into structured format
      const headers = this.parseMailHeaders(headersText);

      return {
        ...headers,
        messageId,
        body: bodyText.split('\n').filter(l => l.length > 0),
        attachments,
      };
    } finally {
      // 5. Always close message to release server memory
      try {
        await this.sendRdoRequest('mail', {
          verb: RdoVerb.SEL,
          targetId: this.mailServerId,
          action: RdoAction.CALL,
          member: 'CloseMessage',
          args: [RdoValue.int(parseInt(msgId, 10)).toString()],
          separator: '*'  // void procedure (Delphi: procedure CloseMessage)
        });
      } catch (e) {
        this.log.warn('[Mail] Failed to close message:', e);
      }
    }
  }

  /**
   * Delete a mail message from a folder.
   */
  public async deleteMailMessage(folder: string, messageId: string): Promise<void> {
    if (!this.mailServerId || !this.mailAccount) {
      throw new Error('Mail service not connected');
    }

    const worldName = this.currentWorldInfo?.name || '';

    await this.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: this.mailServerId,
      action: RdoAction.CALL,
      member: 'DeleteMessage',
      args: [
        RdoValue.string(worldName).toString(),
        RdoValue.string(this.mailAccount).toString(),
        RdoValue.string(folder).toString(),
        RdoValue.string(messageId).toString()
      ],
      separator: '*'  // void procedure (Delphi: procedure DeleteMessage)
    });
    this.log.debug(`[Mail] Deleted message ${messageId} from ${folder}`);
  }

  /**
   * Get unread mail count for Inbox.
   * Reference: InterfaceServer.pas:4345 — CountUnreadMessages proxies CheckNewMail
   * Note: CheckNewMail takes ServerId (from LogServerOn) + Account. Since we're
   * not an InterfaceServer, we pass 0 as ServerId (the MailServer uses it for
   * routing notifications, which we don't need for a count query).
   */
  public async getMailUnreadCount(): Promise<number> {
    if (!this.mailServerId || !this.mailAccount) {
      throw new Error('Mail service not connected');
    }

    const packet = await this.sendRdoRequest('mail', {
      verb: RdoVerb.SEL,
      targetId: this.mailServerId,
      action: RdoAction.CALL,
      member: 'CheckNewMail',
      args: [RdoValue.int(0).toString(), RdoValue.string(this.mailAccount).toString()]
    });
    const countStr = parsePropertyResponseHelper(packet.payload!, 'CheckNewMail');
    return parseInt(countStr, 10) || 0;
  }

  /**
   * Get mail account address.
   */
  public getMailAccount(): string | null {
    return this.mailAccount;
  }

  /**
   * Fetch mail folder listing via HTTP (MessageList.asp on World Web Server).
   * The original Voyager used ASP pages backed by a COM MailBrowser DLL
   * to enumerate mail directories — there is no RDO method for folder listing.
   */
  public async getMailFolder(folder: string): Promise<MailMessageHeader[]> {
    if (!this.currentWorldInfo || !this.mailAccount) {
      this.log.warn('[Mail] Cannot fetch folder: not logged into world or no mail account');
      return [];
    }

    const params = new URLSearchParams({
      Folder: folder,
      WorldName: this.currentWorldInfo.name,
      Account: this.mailAccount,
      MsgId: '',
      Action: '',
    });

    const url = `http://${this.currentWorldInfo.ip}/five/0/visual/voyager/mail/MessageList.asp?${params.toString().replace(/\+/g, '%20')}`;
    this.log.debug(`[Mail] Fetching folder listing from ${url}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) {
        this.log.warn(`[Mail] MessageList.asp returned ${response.status}`);
        return [];
      }
      const html = await response.text();
      const folderType = folder as import('../shared/types/domain-types').MailFolder;
      return parseMessageListHtml(html, folderType);
    } catch (e) {
      this.log.error('[Mail] Failed to fetch folder listing:', toErrorMessage(e));
      return [];
    }
  }

  /**
   * Parse ini-style mail headers text into MailMessageHeader.
   * Headers format: key=value per line (from TStringList)
   */
  private parseMailHeaders(headersText: string): MailMessageHeader {
    const headers: Record<string, string> = {};
    for (const line of headersText.split('\n')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.substring(0, eqIdx).trim();
        const value = line.substring(eqIdx + 1).trim();
        headers[key] = value;
      }
    }

    return {
      messageId: headers['MessageId'] || '',
      fromAddr: headers['FromAddr'] || '',
      toAddr: headers['ToAddr'] || '',
      from: headers['From'] || '',
      to: headers['To'] || '',
      subject: headers['Subject'] || '',
      date: headers['Date'] || '',
      dateFmt: headers['DateFmt'] || '',
      read: headers['Read'] === '1',
      stamp: parseInt(headers['Stamp'] || '0', 10),
      noReply: headers['NoReply'] === '1',
    };
  }

  /**
   * Parse attachment properties text into MailAttachment.
   * Format: key=value per line (from TAttachment properties TStringList)
   */
  private parseMailAttachment(attachText: string): MailAttachment {
    const props: Record<string, string> = {};
    for (const line of attachText.split('\n')) {
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.substring(0, eqIdx).trim();
        const value = line.substring(eqIdx + 1).trim();
        props[key] = value;
      }
    }

    const cls = props['Class'] || '';
    const executed = props['Executed'] === 'Yes';
    delete props['Class'];
    delete props['Executed'];

    return { class: cls, properties: props, executed };
  }

  // =========================================================================
  // TYCOON PROFILE
  // =========================================================================

  /**
   * Fetch extended tycoon profile data.
   *
   * Uses session-cached data from InitClient/RefreshTycoon pushes (budget, ranking,
   * building count) plus TClientView.GetUserName via IS proxy for the name.
   * fTycoonProxyId is an IS-local handle and CANNOT be used for World server RDO queries.
   *
   * For detailed curriculum data (prestige, licenceLevel, etc.), fetchCurriculumData()
   * fetches TycoonCurriculum.asp from the IS HTTP server.
   */
  public async fetchTycoonProfile(): Promise<TycoonProfileFull> {
    // Get name via IS proxy (TClientView.GetUserName is published)
    let name = this.activeUsername || this.cachedUsername || '';
    if (this.interfaceServerId) {
      try {
        const namePacket = await this.sendRdoRequest('world', {
          verb: RdoVerb.SEL,
          targetId: String(this.interfaceServerId),
          action: RdoAction.CALL,
          member: 'GetUserName',
          args: [],
        });
        const parsed = parsePropertyResponseHelper(namePacket.payload!, 'res');
        if (parsed && !parsed.startsWith('error')) name = parsed;
      } catch (e) {
        this.log.warn('[Profile] GetUserName failed, using cached username:', e);
      }
    }

    const profile: TycoonProfileFull = {
      name,
      realName: '',
      ranking: this.lastRanking,
      budget: this.accountMoney || '0',
      prestige: 0,
      facPrestige: 0,
      researchPrestige: 0,
      facCount: this.lastBuildingCount,
      facMax: this.lastMaxBuildings,
      area: 0,
      nobPoints: 0,
      licenceLevel: 0,
      failureLevel: this.failureLevel || 0,
      levelName: '',
      levelTier: 0,
    };

    // Try to enrich with curriculum ASP page data
    try {
      const html = await this.fetchAspPage('NewTycoon/TycoonCurriculum.asp', { RIWS: '' });
      this.parseCurriculumHtml(html, profile);
    } catch (e) {
      this.log.warn('[Profile] TycoonCurriculum.asp fetch failed, using push data only:', e);
    }

    // Try to fetch avatar photo from RenderTycoon.asp
    try {
      const worldIp = this.currentWorldInfo?.ip;
      const worldName = this.currentWorldInfo?.name || '';
      if (worldIp && name) {
        const renderUrl = `http://${worldIp}/five/0/visual/voyager/new%20directory/RenderTycoon.asp?WorldName=${encodeURIComponent(worldName)}&Tycoon=${encodeURIComponent(name)}&RIWS=`;
        const renderHtml = await (await fetch(renderUrl, { redirect: 'follow' })).text();
        const photoMatch = /<img[^>]+id=["']?picture["']?[^>]+src=["']([^"']+)["']/i.exec(renderHtml)
          || /<img[^>]+src=["']([^"']+)["'][^>]+id=["']?picture["']?/i.exec(renderHtml);
        if (photoMatch) {
          const rawUrl = photoMatch[1];
          const baseUrl = `http://${worldIp}/five/0/visual/voyager/new%20directory`;
          const fullUrl = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}/${rawUrl}`;
          profile.photoUrl = `/proxy-image?url=${encodeURIComponent(fullUrl)}`;
        }
      }
    } catch (e) {
      this.log.warn('[Profile] RenderTycoon.asp photo fetch failed:', e);
    }

    this.log.debug(`[Profile] Fetched tycoon profile: ${profile.name} (Ranking #${profile.ranking})`);
    return profile;
  }

  /**
   * Parse TycoonCurriculum.asp HTML to extract level/prestige data into a profile.
   * The ASP page renders level images (e.g., levelParadigm.gif) and prestige values.
   */
  private parseCurriculumHtml(html: string, profile: TycoonProfileFull): void {
    // Level image: src="images/level<Name>.gif" — extract level name
    const levelMatch = /images\/level(\w+)\.gif/i.exec(html);
    if (levelMatch) {
      profile.levelName = levelMatch[1]; // e.g., "Paradigm"
    }

    // Parse key-value pairs from HTML (format: <span class=label>Key:</span> ... <span class=value>Value</span>)
    const kvPattern = /class=label[^>]*>\s*([^<:]+):\s*<\/(?:span|div)>\s*(?:<[^>]*>\s*)*?class=value[^>]*>\s*([^<]+)/gi;
    let kvMatch;
    while ((kvMatch = kvPattern.exec(html)) !== null) {
      const key = kvMatch[1].trim().toLowerCase();
      const val = kvMatch[2].trim().replace(/[$,\s]/g, '');
      switch (key) {
        case 'prestige': profile.prestige = parseFloat(val) || 0; break;
        case 'facility prestige': profile.facPrestige = parseFloat(val) || 0; break;
        case 'research prestige': profile.researchPrestige = parseFloat(val) || 0; break;
        case 'buildings': {
          // Format: "13 / 100"
          const parts = val.split('/');
          if (parts.length === 2) {
            profile.facCount = parseInt(parts[0], 10) || profile.facCount;
            profile.facMax = parseInt(parts[1], 10) || profile.facMax;
          }
          break;
        }
        case 'area': profile.area = parseFloat(val) || 0; break;
        case 'nobility': profile.nobPoints = parseFloat(val) || 0; break;
      }
    }

    // Level names → tier mapping
    const levelTiers: Record<string, number> = {
      apprentice: 0, entrepreneur: 1, tycoon: 2, master: 3,
      paradigm: 4, legend: 5, beyondlegend: 6,
    };
    if (profile.levelName) {
      const tier = levelTiers[profile.levelName.toLowerCase()];
      if (tier !== undefined) {
        profile.levelTier = tier;
        profile.licenceLevel = tier;
      }
    }
  }

  // ===========================================================================
  // PROFILE TABS
  // ===========================================================================

  /**
   * Fetch curriculum data — fetches TycoonCurriculum.asp and parses all sections:
   * summary stats, level progression, rankings, and curriculum items.
   */
  public async fetchCurriculumData(): Promise<CurriculumData> {
    const profile = await this.fetchTycoonProfile();
    const levelNames = ['Apprentice', 'Entrepreneur', 'Tycoon', 'Master', 'Paradigm', 'Legend', 'BeyondLegend'];
    const level = Math.min(profile.licenceLevel, levelNames.length - 1);

    // Fetch the raw HTML again for detailed curriculum-specific parsing
    const aspPath = 'NewTycoon/TycoonCurriculum.asp';
    let html = '';
    let baseUrl = '';
    try {
      baseUrl = this.buildAspUrl(aspPath, { RIWS: '' });
      html = await this.fetchAspPage(aspPath, { RIWS: '' });
    } catch {
      this.log.warn('[Profile] TycoonCurriculum.asp re-fetch for curriculum details failed');
    }

    return this.parseCurriculumDetails(html, profile, level, levelNames, baseUrl);
  }

  /**
   * Parse full curriculum details from TycoonCurriculum.asp HTML.
   * Extracts: fortune, average profit, level descriptions, rankings, curriculum items.
   */
  private parseCurriculumDetails(
    html: string,
    profile: TycoonProfileFull,
    level: number,
    levelNames: string[],
    baseUrl: string
  ): CurriculumData {
    // Fortune & Average Profit — from label/value spans
    let fortune = profile.budget;
    let averageProfit = '';
    const fortuneMatch = /Personal\s+Fortune:\s*(?:<[^>]*>\s*)*\$([^<]+)/i.exec(html);
    if (fortuneMatch) fortune = fortuneMatch[1].trim().replace(/,/g, '');
    const profitMatch = /Average\s+Profit[^:]*:\s*(?:<[^>]*>\s*)*\$([^<]+)/i.exec(html);
    if (profitMatch) averageProfit = '$' + profitMatch[1].trim();

    // Current level description — the <div class=label> text after the level image section
    let currentLevelDescription = '';
    // Find the first level description block (after first level image, in the first td)
    const levelDescMatch = /<td[^>]*valign="top"[^>]*align="left"[^>]*width=190>[\s\S]*?<div\s+class=label>\s*([\s\S]*?)\s*<\/div>\s*(?:<div|$)/i.exec(html);
    if (levelDescMatch) {
      // Clean HTML: remove tags, normalize whitespace
      currentLevelDescription = levelDescMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Next level name — second <div class=header1>
    let nextLevelName = '';
    const headerMatches = html.match(/<div\s+class=header1>\s*([^<]+)/gi);
    if (headerMatches && headerMatches.length >= 2) {
      const nextMatch = /<div\s+class=header1>\s*([^<]+)/i.exec(headerMatches[1]);
      if (nextMatch) nextLevelName = nextMatch[1].trim();
    }

    // Next level description — label div in the second (right) level td
    let nextLevelDescription = '';
    // Split by the header1 divs to find the next level section
    const nextLevelSectionIdx = html.indexOf(nextLevelName, html.indexOf('Next Level'));
    if (nextLevelSectionIdx > -1) {
      const afterNext = html.substring(nextLevelSectionIdx);
      const descMatch = /<div\s+class=label>\s*([\s\S]*?)\s*<\/div>/i.exec(afterNext);
      if (descMatch) {
        nextLevelDescription = descMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      }
    }

    // Next level requirements — after "Requires:" heading
    let nextLevelRequirements = '';
    const reqHeaderIdx = html.indexOf('Requires:');
    if (reqHeaderIdx > -1) {
      const afterReq = html.substring(reqHeaderIdx);
      const reqMatch = /<div\s+class=label[^>]*>\s*([\s\S]*?)\s*<\/div>/i.exec(afterReq);
      if (reqMatch) {
        nextLevelRequirements = reqMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      }
    }

    // Can upgrade — presence of onAdvanceClick checkbox
    const canUpgrade = /onAdvanceClick/i.test(html);
    // Is upgrade requested — checkbox is checked
    const isUpgradeRequested = canUpgrade && /type="checkbox"[^>]*checked/i.test(html);

    // Rankings — 3-column grid: <td class=label>Category</td><td ... class=value>N</td>
    const rankings: Array<{ category: string; rank: number | null }> = [];
    const rankSectionMatch = /in\s+the\s+rankings[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i.exec(html);
    if (rankSectionMatch) {
      const rankTable = rankSectionMatch[1];
      const rankCellRegex = /<td\s+class=label>\s*([^<]+)<\/td>\s*<td[^>]*class=value[^>]*>\s*([^<]*)/gi;
      let rankMatch;
      while ((rankMatch = rankCellRegex.exec(rankTable)) !== null) {
        const category = rankMatch[1].trim();
        const val = rankMatch[2].trim();
        rankings.push({
          category,
          rank: val === '-' || val === '' ? null : parseInt(val, 10) || null,
        });
      }
    }

    // Curriculum Items — table after "Curriculum items" header
    const curriculumItems: Array<{ item: string; prestige: number }> = [];
    const currItemsMatch = /Curriculum\s+items[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i.exec(html);
    if (currItemsMatch) {
      const itemTable = currItemsMatch[1];
      // Each item row: <td class=value>Item text</td> <td class=value>+/-N</td>
      const itemRowRegex = /<td[^>]*class=value[^>]*>\s*([\s\S]*?)\s*<\/td>\s*<td[^>]*class=value[^>]*>\s*([^<]+)/gi;
      let itemMatch;
      while ((itemMatch = itemRowRegex.exec(itemTable)) !== null) {
        const item = itemMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const prestige = parseInt(itemMatch[2].trim().replace(/[+,\s]/g, ''), 10) || 0;
        if (item) {
          curriculumItems.push({ item, prestige });
        }
      }
    }

    // Extract and cache action URLs from ASP HTML (links to resetTycoon.asp, abandonRole.asp, etc.)
    if (baseUrl && html) {
      const actionUrls = extractAllActionUrls(html, baseUrl);
      if (actionUrls.size > 0) {
        this.aspActionCache.set('NewTycoon/TycoonCurriculum.asp', actionUrls);
        this.log.debug(`[Curriculum] Cached ${actionUrls.size} action URL(s) from ASP HTML`);
      }
    }

    return {
      tycoonName: profile.name,
      currentLevel: level,
      currentLevelName: profile.levelName || levelNames[level] || 'Unknown',
      currentLevelDescription,
      nextLevelName,
      nextLevelDescription,
      nextLevelRequirements,
      canUpgrade,
      isUpgradeRequested,
      fortune,
      averageProfit,
      prestige: profile.prestige,
      facPrestige: profile.facPrestige,
      researchPrestige: profile.researchPrestige,
      budget: profile.budget,
      ranking: profile.ranking,
      facCount: profile.facCount,
      facMax: profile.facMax,
      area: profile.area,
      nobPoints: profile.nobPoints,
      rankings,
      curriculumItems,
    };
  }

  /**
   * Fetch bank account data via TycoonBankAccount.asp on IS HTTP server.
   * Parses budget, loan list, interest rates, and terms from the ASP HTML response.
   */
  public async fetchBankAccount(): Promise<BankAccountData> {
    const aspPath = 'NewTycoon/TycoonBankAccount.asp';
    const baseUrl = this.buildAspUrl(aspPath, { RIWS: '' });
    const html = await this.fetchAspPage(aspPath, { RIWS: '' });
    return this.parseBankAccountHtml(html, baseUrl);
  }

  /**
   * Parse TycoonBankAccount.asp HTML response.
   * Budget: `var budget = <number>;` in script block.
   * MaxLoan: `var maxVal = new Number(NNN)` in script block.
   * TotalLoans: `var loans = new Number(NNN)` in script block.
   * Loan rows: `<tr id="rN" lid="N">` with cells: Bank, Date, Amount, Interest, Term, Next payment.
   */
  private parseBankAccountHtml(html: string, baseUrl: string): BankAccountData {
    // Extract budget from JS variable
    let balance = this.accountMoney || '0';
    const budgetMatch = /var\s+budget\s*=\s*(-?\d+)\s*;/i.exec(html);
    if (budgetMatch) {
      balance = budgetMatch[1];
    }

    // Extract max loan from JS: var maxVal = new Number(NNN)
    let maxLoan = '2500000000';
    const maxValMatch = /var\s+maxVal\s*=\s*new\s+Number\((\d+)\)/i.exec(html);
    if (maxValMatch) {
      maxLoan = maxValMatch[1];
    }

    // Extract total loans from JS: var loans = new Number(NNN)
    let totalLoans = '0';
    const totalLoansMatch = /var\s+loans\s*=\s*new\s+Number\((\d+)\)/i.exec(html);
    if (totalLoansMatch) {
      totalLoans = totalLoansMatch[1];
    }

    // Extract max transfer from "You can transfer up to $X"
    let maxTransfer = '0';
    const maxTransferMatch = /You can transfer up to \$([0-9,]+)/i.exec(html);
    if (maxTransferMatch) {
      maxTransfer = maxTransferMatch[1].replace(/,/g, '');
    }

    // Parse loan rows — actual HTML format: <tr id="r0" lid="0">
    const loans: LoanInfo[] = [];
    const loanRowRegex = /<tr[^>]*\bid\s*=\s*"?r(\d+)"?[^>]*\blid\s*=\s*"?(\d+)"?/gi;
    let loanMatch;
    while ((loanMatch = loanRowRegex.exec(html)) !== null) {
      const loanIndex = parseInt(loanMatch[2], 10);
      const rowStart = loanMatch.index;
      const nextRowIdx = html.indexOf('</tr>', rowStart);
      if (nextRowIdx === -1) continue;
      const rowHtml = html.substring(rowStart, nextRowIdx);

      // Extract TD values in order: Bank, Date, Amount, Interest, Term, Next payment
      const cellValues: string[] = [];
      const cellRegex = /<td[^>]*>\s*(?:<[^>]*>\s*)*([^<]*)/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const val = cellMatch[1].trim();
        if (val) cellValues.push(val);
      }

      if (cellValues.length >= 6) {
        loans.push({
          bank: cellValues[0],
          date: cellValues[1],
          amount: cellValues[2].replace(/[$,\s]/g, ''),
          interest: parseFloat(cellValues[3].replace('%', '')) || 0,
          term: parseInt(cellValues[4], 10) || 0,
          slice: cellValues[5].replace(/[$,\s]/g, ''),
          loanIndex,
        });
      }
    }

    // Total next payment — sum of all loan slices
    const totalNextPayment = String(
      loans.reduce((sum, l) => sum + (parseFloat(l.slice) || 0), 0)
    );

    // Compute interest/term defaults using server-provided totalLoans
    const existingLoanTotal = parseFloat(totalLoans) || 0;
    const defaultMaxLoan = parseFloat(maxLoan) || 0;
    const defaultInterest = Math.round((existingLoanTotal + defaultMaxLoan) / 100_000_000);
    let defaultTerm = 200 - Math.round((existingLoanTotal + defaultMaxLoan) / 10_000_000);
    if (defaultTerm < 5) defaultTerm = 5;

    // Extract and cache action URLs from ASP HTML (forms, JS handlers)
    if (baseUrl) {
      const actionUrls = extractAllActionUrls(html, baseUrl);
      if (actionUrls.size > 0) {
        this.aspActionCache.set('NewTycoon/TycoonBankAccount.asp', actionUrls);
        this.log.debug(`[Bank] Cached ${actionUrls.size} action URL(s) from ASP HTML`);
      }
    }

    return {
      balance,
      maxLoan,
      totalLoans,
      maxTransfer,
      totalNextPayment,
      loans,
      defaultInterest,
      defaultTerm,
    };
  }

  /**
   * Execute a bank action (borrow, send, payoff) via TycoonBankAccount.asp.
   * The legacy Voyager client performs these as GET requests with Action params.
   */
  public async executeBankAction(
    action: string,
    amount?: string,
    toTycoon?: string,
    reason?: string,
    loanIndex?: number
  ): Promise<BankActionResult> {
    try {
      const worldIp = this.currentWorldInfo?.ip;
      if (!worldIp) return { success: false, message: 'World IP not available' };

      // Validate inputs before URL construction
      switch (action) {
        case 'borrow':
          if (!amount) return { success: false, message: 'Amount required' };
          break;
        case 'send':
          if (!amount || !toTycoon) return { success: false, message: 'Amount and recipient required' };
          break;
        case 'payoff':
          if (loanIndex === undefined || loanIndex < 0) return { success: false, message: 'Loan index required' };
          break;
        default:
          return { success: false, message: `Unknown action: ${action}` };
      }

      // Action-specific query params (appended to base URL)
      const actionMap: Record<string, string> = { borrow: 'LOAN', send: 'SEND', payoff: 'PAYOFF' };
      const extraParams = new URLSearchParams({ Action: actionMap[action] });
      if (action === 'borrow') extraParams.set('LoanValue', amount!);
      if (action === 'send') {
        extraParams.set('SendValue', amount!);
        extraParams.set('SendDest', toTycoon!);
        extraParams.set('SendReason', reason || '');
      }
      if (action === 'payoff') extraParams.set('LID', String(loanIndex));

      // 1. Try cached form action URL from last fetchBankAccount() ASP parse
      const cached = this.aspActionCache.get('NewTycoon/TycoonBankAccount.asp');
      const formAction = cached?.get('TycoonBankAccount.asp');

      let url: string;
      if (formAction) {
        // Append action-specific params to cached base URL
        const separator = formAction.url.includes('?') ? '&' : '?';
        url = formAction.url + separator + extraParams.toString().replace(/\+/g, '%20');
        this.log.debug(`[Bank] Using cached form action URL for ${action}`);
      } else {
        // Fallback: reconstruct URL from session state
        const baseParams = new URLSearchParams({
          Tycoon: this.activeUsername || this.cachedUsername || '',
          Password: this.cachedPassword || '',
          Company: this.currentCompany?.name || '',
          WorldName: this.currentWorldInfo?.name || '',
          DAAddr: this.daAddr || config.rdo.directoryHost,
          DAPort: String(this.daPort || config.rdo.ports.directory),
          SecurityId: '',
        });
        for (const [k, v] of extraParams) baseParams.set(k, v);
        url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/TycoonBankAccount.asp?${baseParams.toString().replace(/\+/g, '%20')}`;
        this.log.debug(`[Bank] No cached URL for ${action}, reconstructing`);
      }

      this.log.debug(`[Bank] Executing ${action}: ${url}`);
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();

      // Check for error messages in response HTML
      const errorMatch = /class=errorText[^>]*>\s*([^<]+)/i.exec(html);
      if (errorMatch) {
        return { success: false, message: errorMatch[1].trim() };
      }

      // If the page reloaded successfully with updated budget, it worked
      const budgetMatch = /var\s+budget\s*=\s*(-?\d+)\s*;/i.exec(html);
      if (budgetMatch) {
        this.accountMoney = budgetMatch[1];
      }

      return { success: true, message: `${action} completed successfully` };
    } catch (e) {
      return { success: false, message: toErrorMessage(e) };
    }
  }

  /**
   * Fetch profit & loss data via TycoonProfitAndLoses.asp on IS HTTP server.
   * Parses the full hierarchical P&L tree from the ASP HTML response.
   */
  public async fetchProfitLoss(): Promise<ProfitLossData> {
    const html = await this.fetchAspPage('NewTycoon/TycoonProfitAndLoses.asp', { RIWS: '' });
    return this.parseProfitLossHtml(html);
  }

  /**
   * Parse TycoonProfitAndLoses.asp HTML response.
   * Each row: `<div class=labelAccountLevel{N}>` label, then `$<amount>` in sibling div.
   * Chart data: `ChartInfo=<count>,<values...>` in href attributes.
   * Builds hierarchical ProfitLossNode tree by nesting levels.
   */
  private parseProfitLossHtml(html: string): ProfitLossData {
    const root: ProfitLossNode = {
      label: 'Net Profit (losses)',
      level: 0,
      amount: '0',
      children: [],
    };

    // Parse all P&L rows in sequence
    // Pattern: <div class=labelAccountLevelN> ... label text ... </div> followed by amount
    const rowRegex = /<div\s+class=labelAccountLevel(\d)[^>]*>[\s\S]*?<nobr>([\s\S]*?)<\/nobr>[\s\S]*?<\/td>\s*<td[^>]*>[\s\S]*?(?:\$([0-9,.-]+)|<\/nobr>)/gi;
    let match;
    const nodes: ProfitLossNode[] = [];

    while ((match = rowRegex.exec(html)) !== null) {
      const level = parseInt(match[1], 10);
      // Clean label: strip HTML tags and img elements
      let label = match[2].replace(/<[^>]*>/g, '').trim();
      const amount = match[3] ? match[3].replace(/,/g, '') : '';

      // Extract chart data if available nearby
      const chartMatch = /ChartInfo=(\d+),([-\d,]+)/i.exec(html.substring(match.index, match.index + 500));
      let chartData: number[] | undefined;
      if (chartMatch) {
        const values = chartMatch[2].split(',').map(v => parseInt(v, 10));
        chartData = values;
      }

      // Level 2 items with margin-top are sub-headers (e.g., "RESIDENTIALS")
      const isHeader = level === 2 && !amount;

      const node: ProfitLossNode = {
        label: label || 'Unknown',
        level,
        amount: amount || '0',
        chartData,
        isHeader,
        children: [],
      };

      nodes.push(node);
    }

    // Build tree: level 0 = root, higher levels nest under their parent
    if (nodes.length > 0) {
      // First node is the root (Net Profit)
      root.label = nodes[0].label;
      root.amount = nodes[0].amount;
      root.chartData = nodes[0].chartData;
    }

    // Stack-based nesting: each node is child of nearest lower-level ancestor
    const stack: ProfitLossNode[] = [root];
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      // Pop stack until we find a parent with lower level
      while (stack.length > 1 && stack[stack.length - 1].level >= node.level) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      if (!parent.children) parent.children = [];
      parent.children.push(node);
      stack.push(node);
    }

    return { root };
  }

  /**
   * Fetch companies list via chooseCompany.asp on IS HTTP server.
   * This matches the legacy Voyager client and shows cluster, facility count, etc.
   */
  public async fetchCompanies(): Promise<CompaniesData> {
    const currentCompany = this.currentCompany?.name || '';

    try {
      const html = await this.fetchAspPage('NewLogon/chooseCompany.asp', {
        Logon: 'FALSE',
        UserName: this.activeUsername || this.cachedUsername || '',
        RIWS: '',
      });
      const companies = this.parseCompaniesHtml(html);
      const worldName = this.currentWorldInfo?.name || '';
      return { companies, currentCompany, worldName };
    } catch (e) {
      this.log.warn('[Companies] ASP fetch failed:', e);
      const worldName = this.currentWorldInfo?.name || '';
      return { companies: [], currentCompany, worldName };
    }
  }

  /**
   * Parse chooseCompany.asp HTML response.
   * Companies: `<td ... companyId="N" companyName="..." companyOwnerRole="...">` elements.
   * Cluster: from CompanyCluster= in "more info" link.
   * Facility count: from "<nobr> N Facilities </nobr>" text.
   */
  private parseCompaniesHtml(html: string): CompanyListItem[] {
    const companies: CompanyListItem[] = [];

    // Match company <td> elements with attributes
    const tdRegex = /<td[^>]*companyId="(\d+)"[^>]*>/gi;
    let tdMatch;

    while ((tdMatch = tdRegex.exec(html)) !== null) {
      const companyId = parseInt(tdMatch[1], 10);
      const tdElement = tdMatch[0];

      // Extract company name
      const nameMatch = /companyName="([^"]+)"/i.exec(tdElement);
      const name = nameMatch ? nameMatch[1] : `Company ${companyId}`;

      // Extract owner role
      const roleMatch = /companyOwnerRole="([^"]*)"/i.exec(tdElement);
      const ownerRole = roleMatch ? roleMatch[1] : this.cachedUsername || '';

      // Look ahead in the HTML after this td for cluster and facility count
      const nextTdIdx = html.indexOf('<td', tdMatch.index + tdMatch[0].length);
      const sectionEnd = nextTdIdx > 0 ? nextTdIdx : tdMatch.index + 2000;
      const section = html.substring(tdMatch.index, sectionEnd);

      // Extract cluster from "more info" link: CompanyCluster=<cluster>
      const clusterMatch = /CompanyCluster=(\w+)/i.exec(section);
      const cluster = clusterMatch ? clusterMatch[1] : '';

      // Extract facility count: "N Facilities"
      const facMatch = /(\d+)\s+Facilities/i.exec(section);
      const facilityCount = facMatch ? parseInt(facMatch[1], 10) : 0;

      // Extract company type: "Private" or other text in <nobr>
      const typeMatch = /<nobr>\s*(Private|Public|Mayor|Minister|President)\s*<\/nobr>/i.exec(section);
      const companyType = typeMatch ? typeMatch[1] : 'Private';

      companies.push({
        name,
        companyId,
        ownerRole,
        cluster,
        facilityCount,
        companyType,
      });
    }

    return companies;
  }

  /**
   * Fetch auto-connections (initial suppliers) via TycoonAutoConnections.asp on IS HTTP server.
   */
  public async fetchAutoConnections(): Promise<AutoConnectionsData> {
    try {
      const aspPath = 'NewTycoon/TycoonAutoConnections.asp';
      const baseUrl = this.buildAspUrl(aspPath, { RIWS: '' });
      const html = await this.fetchAspPage(aspPath, { RIWS: '' });
      return this.parseAutoConnectionsHtml(html, baseUrl);
    } catch (e) {
      this.log.warn('[AutoConnections] ASP fetch failed:', e);
      return { fluids: [] };
    }
  }

  /**
   * Parse TycoonAutoConnections.asp HTML response.
   * Fluid headers: `<div id="FluidName" class=header3>`.
   * Supplier rows: `<tr id=FluidN fluid=Fluid facilityId="x,y,">` with facility/company names.
   * Checkboxes: HireTC (trade center) and HireWH (warehouses only).
   */
  private parseAutoConnectionsHtml(html: string, baseUrl: string): AutoConnectionsData {
    const fluids: AutoConnectionFluid[] = [];

    // Find all fluid header divs: <div id="FluidName" class=header3 style="color: #EEEECC">
    const headerRegex = /<div\s+id="([^"]+)"\s+class=header3[^>]*>\s*([^<]*)/gi;
    let headerMatch;
    const fluidPositions: Array<{ fluidName: string; startIdx: number }> = [];

    while ((headerMatch = headerRegex.exec(html)) !== null) {
      fluidPositions.push({
        fluidName: headerMatch[1],
        startIdx: headerMatch.index,
      });
    }

    // Process each fluid section
    for (let fi = 0; fi < fluidPositions.length; fi++) {
      const { fluidName, startIdx } = fluidPositions[fi];
      const endIdx = fi + 1 < fluidPositions.length ? fluidPositions[fi + 1].startIdx : html.length;
      const section = html.substring(startIdx, endIdx);

      const suppliers: SupplierEntry[] = [];

      // Parse supplier rows: <tr id=FluidN fluid=Fluid onClick="onRowClick()" facilityId="x,y,">
      const rowRegex = /<tr[^>]*\bfluid=(\w+)[^>]*\bfacilityId="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      while ((rowMatch = rowRegex.exec(section)) !== null) {
        const facilityId = rowMatch[2].trim();
        const rowContent = rowMatch[3];

        // Extract facility name and company name from <div class=value> elements
        const valueRegex = /<div\s+class=value[^>]*>\s*([^<]+)/gi;
        const values: string[] = [];
        let valMatch;
        while ((valMatch = valueRegex.exec(rowContent)) !== null) {
          values.push(valMatch[1].trim());
        }

        suppliers.push({
          facilityName: values[0] || 'Unknown',
          facilityId,
          companyName: values[1] || '',
        });
      }

      // Parse trade center checkbox: <input id=FluidHireTC ... fluidId="Fluid" checked>
      const tcRegex = new RegExp(`<input[^>]*id=${fluidName}HireTC[^>]*\\bchecked\\b`, 'i');
      const hireTradeCenter = tcRegex.test(section);

      // Parse warehouse checkbox: <input id=FluidHireWH ... checked>
      const whRegex = new RegExp(`<input[^>]*id=${fluidName}HireWH[^>]*\\bchecked\\b`, 'i');
      const onlyWarehouses = whRegex.test(section);

      fluids.push({
        fluidName,
        fluidId: fluidName,
        suppliers,
        hireTradeCenter,
        onlyWarehouses,
      });
    }

    // Extract and cache action URLs from ASP HTML (onclick handlers, href links)
    if (baseUrl) {
      const actionUrls = extractAllActionUrls(html, baseUrl);
      if (actionUrls.size > 0) {
        this.aspActionCache.set('NewTycoon/TycoonAutoConnections.asp', actionUrls);
        this.log.debug(`[AutoConnections] Cached ${actionUrls.size} action URL(s) from ASP HTML`);
      }
    }

    return { fluids };
  }

  /**
   * Execute an auto-connection action via IS HTTP ASP pages.
   * Delete: DeleteDefaultSupplier.asp, Toggle TC: ModifyTradeCenterStatus.asp,
   * Toggle WH: ModifyWarehouseStatus.asp. These match the legacy Voyager pattern.
   */
  public async executeAutoConnectionAction(
    action: string,
    fluidId: string,
    suppliers?: string
  ): Promise<{ success: boolean; message?: string }> {
    const worldIp = this.currentWorldInfo?.ip;
    if (!worldIp) return { success: false, message: 'World IP not available' };

    // Map action names to ASP filenames for cache lookup
    const actionToAsp: Record<string, string> = {
      add: 'AddDefaultSupplier.asp',
      delete: 'DeleteDefaultSupplier.asp',
      hireTradeCenter: 'ModifyTradeCenterStatus.asp',
      dontHireTradeCenter: 'ModifyTradeCenterStatus.asp',
      onlyWarehouses: 'ModifyWarehouseStatus.asp',
      dontOnlyWarehouses: 'ModifyWarehouseStatus.asp',
    };

    const basePath = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/`;
    const tycoonId = this.tycoonId || '';

    try {
      // 1. Try cached URL from last fetchAutoConnections() ASP parse
      const cached = this.aspActionCache.get('NewTycoon/TycoonAutoConnections.asp');
      const aspKey = actionToAsp[action];
      const cachedAction = aspKey ? cached?.get(aspKey) : undefined;

      let url: string;

      if (cachedAction) {
        // Use cached base URL, replace dynamic per-action query params
        const cachedUrl = new URL(cachedAction.url);
        cachedUrl.searchParams.set('TycoonId', tycoonId);
        cachedUrl.searchParams.set('FluidId', fluidId);
        if (suppliers) cachedUrl.searchParams.set('Supplier', suppliers);
        if (action === 'hireTradeCenter' || action === 'dontHireTradeCenter') {
          cachedUrl.searchParams.set('Hire', action === 'hireTradeCenter' ? 'YES' : 'NO');
        }
        if (action === 'onlyWarehouses' || action === 'dontOnlyWarehouses') {
          cachedUrl.searchParams.set('Hire', action === 'onlyWarehouses' ? 'YES' : 'NO');
        }
        url = cachedUrl.toString();
        this.log.debug(`[AutoConnections] Using cached URL for ${action}`);
      } else {
        // Fallback: reconstruct URL from session state
        switch (action) {
          case 'add': {
            if (!suppliers) return { success: false, message: 'Supplier facility coordinates required' };
            const params = new URLSearchParams({
              TycoonId: tycoonId,
              FluidId: fluidId,
              DAAddr: this.daAddr || config.rdo.directoryHost,
              DAPort: String(this.daPort || config.rdo.ports.directory),
              Supplier: suppliers,
            });
            url = `${basePath}AddDefaultSupplier.asp?${params.toString().replace(/\+/g, '%20')}`;
            break;
          }
          case 'delete': {
            if (!suppliers) return { success: false, message: 'Supplier facility ID required' };
            const params = new URLSearchParams({
              TycoonId: tycoonId,
              FluidId: fluidId,
              DAAddr: this.daAddr || config.rdo.directoryHost,
              DAPort: String(this.daPort || config.rdo.ports.directory),
              Supplier: suppliers,
            });
            url = `${basePath}DeleteDefaultSupplier.asp?${params.toString().replace(/\+/g, '%20')}`;
            break;
          }
          case 'hireTradeCenter':
          case 'dontHireTradeCenter': {
            const params = new URLSearchParams({
              TycoonId: tycoonId,
              FluidId: fluidId,
              DAAddr: this.daAddr || config.rdo.directoryHost,
              WorldName: this.currentWorldInfo?.name || '',
              Tycoon: this.activeUsername || this.cachedUsername || '',
              Password: this.cachedPassword || '',
              DAPort: String(this.daPort || config.rdo.ports.directory),
              Hire: action === 'hireTradeCenter' ? 'YES' : 'NO',
            });
            url = `${basePath}ModifyTradeCenterStatus.asp?${params.toString().replace(/\+/g, '%20')}`;
            break;
          }
          case 'onlyWarehouses':
          case 'dontOnlyWarehouses': {
            const params = new URLSearchParams({
              TycoonId: tycoonId,
              FluidId: fluidId,
              DAAddr: this.daAddr || config.rdo.directoryHost,
              WorldName: this.currentWorldInfo?.name || '',
              Tycoon: this.activeUsername || this.cachedUsername || '',
              Password: this.cachedPassword || '',
              DAPort: String(this.daPort || config.rdo.ports.directory),
              Hire: action === 'onlyWarehouses' ? 'YES' : 'NO',
            });
            url = `${basePath}ModifyWarehouseStatus.asp?${params.toString().replace(/\+/g, '%20')}`;
            break;
          }
          default:
            return { success: false, message: `Unknown action: ${action}` };
        }
        this.log.debug(`[AutoConnections] No cached URL for ${action}, reconstructing`);
      }

      this.log.debug(`[AutoConnections] Executing ${action}: ${url}`);
      await fetch(url, { redirect: 'follow' });
      return { success: true };
    } catch (e) {
      return { success: false, message: toErrorMessage(e) };
    }
  }

  /**
   * Fetch policy data (diplomatic relationships) via TycoonPolicy.asp on IS HTTP server.
   */
  public async fetchPolicy(): Promise<PolicyData> {
    try {
      const aspPath = 'NewTycoon/TycoonPolicy.asp';
      const baseUrl = this.buildAspUrl(aspPath, { RIWS: '' });
      const html = await this.fetchAspPage(aspPath, { RIWS: '' });
      return this.parsePolicyHtml(html, baseUrl);
    } catch (e) {
      this.log.warn('[Policy] ASP fetch failed:', e);
      return { policies: [] };
    }
  }

  /**
   * Parse TycoonPolicy.asp HTML response.
   * Tycoon rows: name in `<div class=label style="color: #94B9B0">`, your policy in
   * `<select ... tycoon="name">` with selected option (0=Ally,1=Neutral,2=Enemy),
   * their policy in `<span id=otherspan\d+>` (A/N/E).
   * Also extracts and caches form action URLs for subsequent setPolicyStatus calls.
   */
  private parsePolicyHtml(html: string, baseUrl: string): PolicyData {
    const policies: PolicyEntry[] = [];
    const policyLetterMap: Record<string, number> = { A: 0, N: 1, E: 2 };

    // Match select elements with tycoon attribute
    const selectRegex = /<select[^>]*\btycoon="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi;
    let selectMatch;
    let idx = 0;

    while ((selectMatch = selectRegex.exec(html)) !== null) {
      const tycoonName = selectMatch[1];
      const selectContent = selectMatch[2];

      // Find selected option value
      const selectedMatch = /<option\s+value="(\d)"[^>]*\bselected\b/i.exec(selectContent);
      const yourPolicy = selectedMatch ? parseInt(selectedMatch[1], 10) : 1;

      // Find their policy: <span id=otherspan{idx}> text
      const otherSpanRegex = new RegExp(`<span\\s+id=otherspan${idx}[^>]*>\\s*([ANE])`, 'i');
      const otherMatch = otherSpanRegex.exec(html);
      const theirPolicyLetter = otherMatch ? otherMatch[1].toUpperCase() : 'N';
      const theirPolicy = policyLetterMap[theirPolicyLetter] ?? 1;

      policies.push({ tycoonName, yourPolicy, theirPolicy });
      idx++;
    }

    // Extract and cache action URLs from ASP HTML (forms, links, onclick handlers)
    const actionUrls = extractAllActionUrls(html, baseUrl);
    if (actionUrls.size > 0) {
      this.aspActionCache.set('NewTycoon/TycoonPolicy.asp', actionUrls);
      this.log.debug(`[Policy] Cached ${actionUrls.size} action URL(s) from ASP HTML`);
    }

    return { policies };
  }

  /**
   * Set diplomatic policy towards another tycoon via TycoonPolicy.asp POST.
   * Uses the form action URL extracted from the last fetchPolicy() ASP response
   * when available, falling back to URL reconstruction if the cache is cold.
   */
  public async setPolicyStatus(tycoonName: string, status: number): Promise<{ success: boolean; message?: string }> {
    const worldIp = this.currentWorldInfo?.ip;
    if (!worldIp) return { success: false, message: 'World IP not available' };

    try {
      // 1. Try cached form action URL from last ASP HTML parse
      const cached = this.aspActionCache.get('NewTycoon/TycoonPolicy.asp');
      const formAction = cached?.get('TycoonPolicy.asp');

      let url: string;
      if (formAction) {
        url = formAction.url;
        this.log.debug('[Policy] Using cached form action URL');
      } else {
        // Fallback: reconstruct URL from session state
        const queryParams = new URLSearchParams({
          Action: 'modify',
          WorldName: this.currentWorldInfo?.name || '',
          Tycoon: this.activeUsername || this.cachedUsername || '',
          TycoonId: this.tycoonId || '',
          Password: this.cachedPassword || '',
          DAAddr: this.daAddr || config.rdo.directoryHost,
          DAPort: String(this.daPort || config.rdo.ports.directory),
        });
        url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/TycoonPolicy.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
        this.log.debug('[Policy] No cached URL, reconstructing');
      }

      // 2. POST body matches the form: NextStatus + SubTycoon + Subject + Status
      const body = new URLSearchParams({
        NextStatus: String(status),
        SubTycoon: tycoonName,
        Subject: tycoonName,
        Status: String(status),
      });

      this.log.debug(`[Policy] Setting policy for ${tycoonName} to ${status}`);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        redirect: 'follow',
      });

      return { success: true };
    } catch (e) {
      return { success: false, message: toErrorMessage(e) };
    }
  }

  // ===========================================================================
  // PROFILE CURRICULUM ACTIONS
  // ===========================================================================

  /**
   * Execute a curriculum action: reset account, abandon role, upgrade level, or rebuild links.
   */
  public async executeCurriculumAction(
    action: string,
    value?: boolean
  ): Promise<{ success: boolean; message?: string }> {
    const worldIp = this.currentWorldInfo?.ip;
    if (!worldIp) return { success: false, message: 'World IP not available' };

    // Map action names to ASP filenames for cache lookup
    const actionToAsp: Record<string, string> = {
      resetAccount: 'resetTycoon.asp',
      abandonRole: 'abandonRole.asp',
      upgradeLevel: 'rdoSetAdvanceLevel.asp',
      rebuildLinks: 'links.asp',
    };

    try {
      // 1. Try cached URL from last fetchCurriculumData() ASP parse
      const cached = this.aspActionCache.get('NewTycoon/TycoonCurriculum.asp');
      const aspKey = actionToAsp[action];
      const cachedAction = aspKey ? cached?.get(aspKey) : undefined;

      let url: string;
      if (cachedAction) {
        url = cachedAction.url;
        this.log.debug(`[Curriculum] Using cached URL for ${action}`);
      } else {
        // Fallback: reconstruct URL from session state
        switch (action) {
          case 'resetAccount': {
            const params = new URLSearchParams({
              Tycoon: this.activeUsername || this.cachedUsername || '',
              WorldName: this.currentWorldInfo?.name || '',
              DAAddr: this.daAddr || config.rdo.directoryHost,
              DAPort: String(this.daPort || config.rdo.ports.directory),
              TycoonId: '',
              Password: this.cachedPassword || '',
            });
            url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/resetTycoon.asp?${params.toString().replace(/\+/g, '%20')}`;
            break;
          }
          case 'abandonRole': {
            const params = new URLSearchParams({
              Tycoon: this.activeUsername || this.cachedUsername || '',
              WorldName: this.currentWorldInfo?.name || '',
              DAAddr: this.daAddr || config.rdo.directoryHost,
              DAPort: String(this.daPort || config.rdo.ports.directory),
              TycoonId: '',
              Password: this.cachedPassword || '',
            });
            url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/abandonRole.asp?${params.toString().replace(/\+/g, '%20')}`;
            break;
          }
          case 'upgradeLevel': {
            const params = new URLSearchParams({
              TycoonId: this.tycoonId || '',
              Password: this.cachedPassword || '',
              Value: String(value ?? true),
              WorldName: this.currentWorldInfo?.name || '',
              DAAddr: this.daAddr || config.rdo.directoryHost,
              DAPort: String(this.daPort || config.rdo.ports.directory),
              Tycoon: this.activeUsername || this.cachedUsername || '',
            });
            url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/rdoSetAdvanceLevel.asp?${params.toString().replace(/\+/g, '%20')}`;
            break;
          }
          case 'rebuildLinks': {
            const params = new URLSearchParams({
              Tycoon: this.activeUsername || this.cachedUsername || '',
              Password: this.cachedPassword || '',
              Company: this.currentCompany?.name || '',
              WorldName: this.currentWorldInfo?.name || '',
              DAAddr: this.daAddr || config.rdo.directoryHost,
              DAPort: String(this.daPort || config.rdo.ports.directory),
              ISAddr: worldIp,
              ISPort: '8000',
              ClientViewId: String(this.interfaceServerId || ''),
              RIWS: '',
            });
            url = `http://${worldIp}/Five/0/visual/voyager/util/links.asp?${params.toString().replace(/\+/g, '%20')}`;
            break;
          }
          default:
            return { success: false, message: `Unknown curriculum action: ${action}` };
        }
        this.log.debug(`[Curriculum] No cached URL for ${action}, reconstructing`);
      }

      this.log.debug(`[Curriculum] Executing ${action}: ${url}`);
      await fetch(url, { redirect: 'follow' });
      return { success: true, message: `${action} completed successfully` };
    } catch (e) {
      return { success: false, message: toErrorMessage(e) };
    }
  }

  // =========================================================================
  // EMPIRE — Owned Facilities (Favorites)
  // =========================================================================

  /**
   * Fetch owned facilities via the Favorites tree.
   *
   * RDO: sel <worldContextId> call RDOFavoritesGetSubItems "^" "%";
   *
   * The response is a string of items separated by \x02. Each item has
   * fields separated by \x01: id, kind, name, info, subFolderCount.
   * For links (kind=1), info is "name,x,y,select".
   */
  public async fetchOwnedFacilities(): Promise<FavoritesItem[]> {
    if (!this.worldContextId) {
      throw new Error('Not logged in — no worldContextId');
    }

    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesGetSubItems',
      args: [RdoValue.string('').format()],
    });

    const raw = parsePropertyResponseHelper(packet.payload!, 'res');
    return parseFavoritesResponse(raw);
  }

  /**
   * Fetch politics data for a Town Hall building.
   * Fetches mayor info and ratings from the game server's politics ASP pages.
   */
  public async getPoliticsData(townName: string, buildingX: number, buildingY: number): Promise<PoliticsData> {
    const worldIp = this.currentWorldInfo?.ip;
    if (!worldIp) {
      return this.getDefaultPoliticsData(townName);
    }

    try {
      const queryParams = new URLSearchParams({
        WorldName: this.currentWorldInfo?.name || '',
        TycoonName: this.activeUsername || this.cachedUsername || '',
        Password: this.cachedPassword || '',
        TownName: townName,
        DAAddr: this.daAddr || config.rdo.directoryHost,
        DAPort: String(this.daPort || config.rdo.ports.directory),
      });

      const baseUrl = `http://${worldIp}/Five/0/Visual/Voyager/Politics`;

      // Fetch popular ratings page
      const ratingsUrl = `${baseUrl}/popularratings.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
      this.log.debug(`[Politics] Fetching popular ratings from ${ratingsUrl}`);
      const ratingsResp = await fetch(ratingsUrl, { redirect: 'follow' });
      const ratingsHtml = await ratingsResp.text();
      const popularRatings = this.parsePoliticsRatings(ratingsHtml);

      // Fetch IFEL ratings page
      const ifelUrl = `${baseUrl}/ifelratings.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
      this.log.debug(`[Politics] Fetching IFEL ratings from ${ifelUrl}`);
      const ifelResp = await fetch(ifelUrl, { redirect: 'follow' });
      const ifelHtml = await ifelResp.text();
      const ifelRatings = this.parsePoliticsRatings(ifelHtml);

      // Fetch tycoons ratings page
      let tycoonsRatings: PoliticsRatingEntry[] = [];
      try {
        const tycoonsUrl = `${baseUrl}/tycoonsratings.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
        this.log.debug(`[Politics] Fetching tycoons ratings from ${tycoonsUrl}`);
        const tycoonsResp = await fetch(tycoonsUrl, { redirect: 'follow' });
        const tycoonsHtml = await tycoonsResp.text();
        tycoonsRatings = this.parsePoliticsRatings(tycoonsHtml);
      } catch (e) {
        this.log.debug(`[Politics] Tycoons ratings fetch failed: ${toErrorMessage(e)}`);
      }

      // Fetch mayor data from the town hall building properties
      const mayorData = await this.fetchMayorDataFromBuilding(buildingX, buildingY);

      // Prestige-based campaign validation (Delphi: prestige >= 200 to run for mayor)
      const canLaunchCampaign = mayorData.mayorPrestige >= 200
        || (mayorData.mayorName === '' && mayorData.campaignCount === 0);
      const campaignMessage = canLaunchCampaign
        ? ''
        : `Prestige of ${mayorData.mayorPrestige} is below the minimum 200 required to launch a campaign.`;

      return {
        townName,
        yearsToElections: mayorData.yearsToElections,
        mayorName: mayorData.mayorName,
        mayorPrestige: mayorData.mayorPrestige,
        mayorRating: mayorData.mayorRating,
        tycoonsRating: mayorData.tycoonsRating,
        campaignCount: mayorData.campaignCount,
        popularRatings,
        ifelRatings,
        tycoonsRatings,
        campaigns: [],
        canLaunchCampaign,
        campaignMessage,
      };
    } catch (e) {
      this.log.warn(`[Politics] Failed to fetch politics data: ${toErrorMessage(e)}`);
      return this.getDefaultPoliticsData(townName);
    }
  }

  private parsePoliticsRatings(html: string): PoliticsRatingEntry[] {
    const ratings: PoliticsRatingEntry[] = [];
    // Pattern: <td class=label>Name</td> ... <td class=value ...>Value%</td>
    const rowRegex = /<td\s+class=label>\s*([\s\S]*?)\s*<\/td>[\s\S]*?<td\s+class=value[^>]*>\s*([\d.]+)%?\s*<\/td>/gi;
    let match: RegExpExecArray | null;
    while ((match = rowRegex.exec(html)) !== null) {
      const name = match[1].trim();
      const value = parseFloat(match[2]) || 0;
      if (name) {
        ratings.push({ name, value });
      }
    }
    return ratings;
  }

  private async fetchMayorDataFromBuilding(x: number, y: number): Promise<{
    mayorName: string; mayorPrestige: number; mayorRating: number;
    tycoonsRating: number; yearsToElections: number; campaignCount: number;
  }> {
    try {
      const propNames = ['ActualRuler', 'RulerPrestige', 'RulerRating', 'TycoonsRating', 'YearsToElections', 'RulerPeriods'];
      const values = await this.getCacherPropertyListAt(x, y, propNames);
      return {
        mayorName: values[0] || '',
        mayorPrestige: parseInt(values[1]) || 0,
        mayorRating: parseInt(values[2]) || 0,
        tycoonsRating: parseInt(values[3]) || 0,
        yearsToElections: parseInt(values[4]) || 0,
        campaignCount: parseInt(values[5]) || 0,
      };
    } catch (e) {
      this.log.debug(`[Politics] Could not fetch mayor data from building: ${toErrorMessage(e)}`);
    }
    return { mayorName: '', mayorPrestige: 0, mayorRating: 0, tycoonsRating: 0, yearsToElections: 0, campaignCount: 0 };
  }

  /**
   * Cast a vote for a candidate in a Town Hall election.
   * Voyager: VotesSheet.pas — RDOVote(voter, votee) on CurrBlock
   */
  public async politicsVote(buildingX: number, buildingY: number, candidateName: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.connectConstructionService();
      if (!this.worldId) throw new Error('Construction service not initialized');

      await this.connectMapService();
      const tempObjectId = await this.cacherCreateObject();
      let currBlock: string;

      try {
        await this.cacherSetObject(tempObjectId, buildingX, buildingY);
        const values = await this.cacherGetPropertyList(tempObjectId, ['CurrBlock']);
        currBlock = values[0];
        if (!currBlock) throw new Error(`No CurrBlock at (${buildingX}, ${buildingY})`);
      } finally {
        await this.cacherCloseObject(tempObjectId);
      }

      const socket = this.sockets.get('construction');
      if (!socket) throw new Error('Construction socket unavailable');

      const voterName = this.activeUsername || this.cachedUsername || '';
      const cmd = RdoCommand
        .sel(parseInt(currBlock))
        .call('RDOVote').push()
        .args(RdoValue.string(voterName), RdoValue.string(candidateName))
        .build();

      this.log.debug(`[Politics] Voting: ${voterName} → ${candidateName}`);
      socket.write(cmd);
      await new Promise(resolve => setTimeout(resolve, 200));

      return { success: true, message: `Voted for ${candidateName}` };
    } catch (e) {
      this.log.warn(`[Politics] Vote failed: ${toErrorMessage(e)}`);
      return { success: false, message: toErrorMessage(e) };
    }
  }

  /**
   * Launch a political campaign at a Town Hall.
   * Voyager: VotesSheet.pas / TownPolitics.pas — RDOLaunchCampaign(TycoonId)
   */
  public async politicsLaunchCampaign(buildingX: number, buildingY: number): Promise<{ success: boolean; message: string }> {
    try {
      await this.connectConstructionService();
      if (!this.worldId) throw new Error('Construction service not initialized');

      await this.connectMapService();
      const tempObjectId = await this.cacherCreateObject();
      let currBlock: string;

      try {
        await this.cacherSetObject(tempObjectId, buildingX, buildingY);
        const values = await this.cacherGetPropertyList(tempObjectId, ['CurrBlock']);
        currBlock = values[0];
        if (!currBlock) throw new Error(`No CurrBlock at (${buildingX}, ${buildingY})`);
      } finally {
        await this.cacherCloseObject(tempObjectId);
      }

      const socket = this.sockets.get('construction');
      if (!socket) throw new Error('Construction socket unavailable');

      const tycoonName = this.activeUsername || this.cachedUsername || '';
      const cmd = RdoCommand
        .sel(parseInt(currBlock))
        .call('RDOLaunchCampaign').push()
        .args(RdoValue.string(tycoonName))
        .build();

      this.log.debug(`[Politics] Launching campaign for ${tycoonName}`);
      socket.write(cmd);
      await new Promise(resolve => setTimeout(resolve, 200));

      return { success: true, message: 'Campaign launched' };
    } catch (e) {
      this.log.warn(`[Politics] LaunchCampaign failed: ${toErrorMessage(e)}`);
      return { success: false, message: toErrorMessage(e) };
    }
  }

  /**
   * Search for available suppliers or clients to connect to.
   * Uses RDO FindSuppliers/FindClients on the Cache Server (port 6000, WSObjectCacher).
   *
   * FindSuppliers response: x}y}FacName}Company}Town}$Price}Quality (7 fields)
   * FindClients response:   x}y}FacName}Company}Town (5 fields)
   */
  public async searchConnections(
    buildingX: number, buildingY: number,
    fluidId: string, direction: 'input' | 'output',
    filters?: { company?: string; town?: string; maxResults?: number; roles?: number }
  ): Promise<ConnectionSearchResult[]> {
    const worldName = this.currentWorldInfo?.name || '';
    if (!worldName) {
      this.log.warn('[Connections] No world name available for search');
      return [];
    }

    try {
      // Ensure map service is connected (port 6000)
      await this.connectMapService();
      if (!this.cacherId) {
        this.log.warn('[Connections] No cacherId available for search');
        return [];
      }

      const method = direction === 'input' ? 'FindSuppliers' : 'FindClients';
      this.log.debug(`[Connections] ${method} for ${fluidId} at (${buildingX}, ${buildingY})`);

      const packet = await this.sendRdoRequest('map', {
        verb: RdoVerb.SEL,
        targetId: this.cacherId,
        action: RdoAction.CALL,
        member: method,
        args: [
          fluidId,                              // Fluid name (e.g., "Drugs")
          worldName,                            // World (e.g., "Shamba")
          filters?.town || '',                  // Town filter (empty = all)
          filters?.company || '',               // Company filter (empty = all)
          String(filters?.maxResults || 20),    // Count
          String(buildingX),                    // XPos
          String(buildingY),                    // YPos
          '1',                                  // SortMode (1=quality)
          String(filters?.roles || 31),         // Roles bitmask (31 = all 5 roles)
        ],
      });

      const results = this.parseRdoConnectionResults(packet.payload || '', direction);
      this.log.debug(`[Connections] ${method} returned ${results.length} results`);
      return results;
    } catch (e) {
      this.log.warn(`[Connections] ${direction} search failed: ${toErrorMessage(e)}`);
      return [];
    }
  }

  /**
   * Parse RDO FindSuppliers/FindClients response.
   * Format: newline-separated rows, each with } delimiters.
   *   FindSuppliers: x}y}FacName}Company}Town}$Price}Quality (7 fields)
   *   FindClients:   x}y}FacName}Company}Town (5 fields)
   */
  private parseRdoConnectionResults(
    payload: string, direction: 'input' | 'output'
  ): ConnectionSearchResult[] {
    const lines = splitMultilinePayloadHelper(payload);
    if (lines.length === 0) return [];

    return lines.map(line => {
      const fields = line.split('}');
      const x = parseInt(fields[0], 10);
      const y = parseInt(fields[1], 10);
      if (isNaN(x) || isNaN(y)) return null;

      const result: ConnectionSearchResult = {
        x, y,
        facilityName: fields[2] || 'Unknown',
        companyName: fields[3] || '',
        town: fields[4] || undefined,
      };

      if (direction === 'input' && fields.length >= 7) {
        result.price = fields[5] || undefined;
        result.quality = fields[6] || undefined;
      }

      return result;
    }).filter((r): r is ConnectionSearchResult => r !== null);
  }

  private getDefaultPoliticsData(townName: string): PoliticsData {
    return {
      townName,
      yearsToElections: 0,
      mayorName: '',
      mayorPrestige: 0,
      mayorRating: 0,
      tycoonsRating: 0,
      campaignCount: 0,
      popularRatings: [],
      ifelRatings: [],
      tycoonsRatings: [],
      campaigns: [],
      canLaunchCampaign: false,
      campaignMessage: 'Politics data is not available.',
    };
  }

public async loadMapArea(x?: number, y?: number, w: number = 64, h: number = 64): Promise<MapData> {
    if (!this.worldContextId) throw new Error('Not logged into world');

    const targetX = x !== undefined ? x : this.lastPlayerX;
    const targetY = y !== undefined ? y : this.lastPlayerY;

    // Track current camera position for save on disconnect
    if (x !== undefined && y !== undefined) {
      this.lastPlayerX = targetX;
      this.lastPlayerY = targetY;
    }

    // --- DEDUPLICATION: Check if already pending ---
    const requestKey = `${targetX},${targetY}`;
    if (this.pendingMapRequests.has(requestKey)) {
        this.log.debug(`[Session] Skipping duplicate map request for ${requestKey}`);
        throw new Error(`Map area ${requestKey} already loading`);
    }

    // --- MAP CONCURRENCY LIMIT: Check if at max concurrent map requests ---
    if (this.activeMapRequests >= this.MAX_CONCURRENT_MAP_REQUESTS) {
        this.log.debug(`[Session] Too many concurrent map requests (${this.activeMapRequests}/${this.MAX_CONCURRENT_MAP_REQUESTS})`);
        throw new Error(`Maximum concurrent map requests reached (${this.MAX_CONCURRENT_MAP_REQUESTS})`);
    }

    // Mark as pending
    this.pendingMapRequests.add(requestKey);
    this.activeMapRequests++;

    try {
        this.log.debug(`[Session] Loading map area at ${targetX}, ${targetY} (size ${w}x${h}) [${this.activeMapRequests}/${this.MAX_CONCURRENT_MAP_REQUESTS}]`);

        // --- FIXED: ObjectsInArea with correct separator (consistant avec SwitchFocusEx) ---
        const objectsPacket = await this.sendRdoRequest('world', {
            verb: RdoVerb.SEL,
            targetId: this.worldContextId,
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
            targetId: this.worldContextId,
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

  private async cacherCreateObject(): Promise<string> {
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
  private async cacherSetObject(tempObjectId: string, x: number, y: number): Promise<void> {
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

  private async cacherGetPropertyList(tempObjectId: string, propertyNames: string[]): Promise<string[]> {
    const query = propertyNames.join('\t') + '\t';
    const packet = await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: tempObjectId,
      action: RdoAction.CALL,
      member: 'GetPropertyList',
      args: [query]
    });
    const raw = cleanPayloadHelper(packet.payload || '');

    // Handle tab-delimited or space-delimited responses
    if (raw.includes('\t')) {
      return raw.split('\t').map(v => v.trim());
    }
    return raw.split(/\s+/).map(v => v.trim());
  }

  private async cacherCloseObject(tempObjectId: string): Promise<void> {
    if (!this.cacherId) throw new Error('Missing cacherId');
    await this.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: this.cacherId,
      action: RdoAction.CALL,
      member: 'CloseObject',
      args: [tempObjectId],
	  separator: '*'
    });
  }

  /**
   * NEW [HIGH-03]: Manage construction operations with RDOAcceptCloning semaphore
   * Sequence: Check(255) -> Lock(-1) -> Action -> Verify
   *
   * @param x - Building X coordinate
   * @param y - Building Y coordinate
   * @param action - Construction action: START (upgrade), STOP (cancel), DOWN (downgrade)
   * @param count - Number of upgrades (for START only, default: 1)
   */
  public async manageConstruction(
    x: number,
    y: number,
    action: 'START' | 'STOP' | 'DOWN',
    count: number = 1
  ): Promise<{ status: string, error?: string }> {
    this.log.debug(`[Construction] Request: ${action} at (${x}, ${y}) count=${count}`);
    try {
      // Step 0: Connect to construction service if needed
      await this.connectConstructionService();

      // Step 1: Get building info from Map Service
      this.log.debug(`[Construction] Fetching building info at (${x}, ${y})...`);
      await this.connectMapService();
      const props = await this.getCacherPropertyListAt(x, y, ['CurrBlock', 'ObjectId']);

      if (props.length < 2) {
        return {
          status: 'ERROR',
          error: `No building found at (${x}, ${y})`
        };
      }

      const currBlock = props[0]; // CurrBlock (zone ID)
      const targetId = props[1]; // ObjectId (RDO ID for the building)
      this.log.debug(`[Construction] Building found: Block=${currBlock}, ObjectId=${targetId}`);

      // Step 2: Check RDOAcceptCloning (must be available: 1=existing building, 255=empty zone)
      const initialCloning = await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: currBlock,
        action: RdoAction.GET,
        member: 'RDOAcceptCloning'
      });
      const cloningValue = parsePropertyResponseHelper(initialCloning.payload || '', 'RDOAcceptCloning');
      const cloningInt = parseInt(cloningValue, 10);
      this.log.debug(`[Construction] RDOAcceptCloning initial value: ${cloningInt}`);

      // Valid values: 1 (existing building), 255 (empty zone)
      // Invalid: -1 (locked/busy)
      if (cloningInt !== 1 && cloningInt !== 255) {
        return {
          status: 'ERROR',
          error: `Block not available (RDOAcceptCloning=${cloningInt}). Zone may be locked or busy.`
        };
      }

      // Step 3: Lock the block (set RDOAcceptCloning = -1)
      this.log.debug(`[Construction] Locking block ${currBlock}...`);
      await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: currBlock,
        action: RdoAction.SET,
        member: 'RDOAcceptCloning',
        args: ['-1']
      });

      // Step 4: Execute construction action (no request ID - push command)
      const socket = this.sockets.get('construction');
      if (!socket) {
        return { status: 'ERROR', error: 'Construction socket unavailable' };
      }

      let actionCmd = '';
      switch (action) {
        case 'START':
          actionCmd = RdoCommand.sel(targetId)
            .call('RDOStartUpgrades')
            .push()
            .args(RdoValue.int(count))
            .build();
          this.log.debug(`[Construction] Starting ${count} upgrade(s)...`);
          break;
        case 'STOP':
          actionCmd = RdoCommand.sel(targetId)
            .call('RDOStopUpgrade')
            .push()
            .build();
          this.log.debug(`[Construction] Stopping upgrade...`);
          break;
        case 'DOWN':
          actionCmd = RdoCommand.sel(targetId)
            .call('RDODowngrade')
            .push()
            .build();
          this.log.debug(`[Construction] Downgrading building...`);
          break;
        default:
          return { status: 'ERROR', error: `Unknown action: ${action}` };
      }

      socket.write(actionCmd);
      this.log.debug(`[Construction] Command sent: ${actionCmd.substring(0, 50)}...`);

      // Step 5: Wait for server to process
      await new Promise(resolve => setTimeout(resolve, 200));

      // Step 6: Verify unlock (RDOAcceptCloning should return to 255)
      const finalCloning = await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: currBlock,
        action: RdoAction.GET,
        member: 'RDOAcceptCloning'
      });
      const finalValue = parsePropertyResponseHelper(finalCloning.payload || '', 'RDOAcceptCloning');
      this.log.debug(`[Construction] RDOAcceptCloning final value: ${finalValue}`);

      return {
        status: 'OK'
      };
    } catch (e: unknown) {
      this.log.error(`[Construction] Error:`, e);
      return {
        status: 'ERROR',
        error: toErrorMessage(e)
      };
    }
  }

  /**
   * Wrapper for building upgrade actions (WebSocket API)
   * Maps WebSocket action names to internal action names
   */
  public async upgradeBuildingAction(
    x: number,
    y: number,
    action: 'DOWNGRADE' | 'START_UPGRADE' | 'STOP_UPGRADE',
    count?: number
  ): Promise<{ success: boolean, message?: string }> {
    // Map WebSocket action names to internal action names
    let internalAction: 'START' | 'STOP' | 'DOWN';
    switch (action) {
      case 'START_UPGRADE':
        internalAction = 'START';
        break;
      case 'STOP_UPGRADE':
        internalAction = 'STOP';
        break;
      case 'DOWNGRADE':
        internalAction = 'DOWN';
        break;
      default:
        return { success: false, message: `Unknown action: ${action}` };
    }

    const result = await this.manageConstruction(x, y, internalAction, count || 1);

    if (result.status === 'OK') {
      const actionMsg = action === 'DOWNGRADE' ? 'Building downgraded' :
                        action === 'START_UPGRADE' ? `Upgrade started (${count} level${count !== 1 ? 's' : ''})` :
                        'Upgrade stopped';
      return { success: true, message: actionMsg };
    } else {
      return { success: false, message: result.error || 'Operation failed' };
    }
  }

  /**
   * Rename a facility (building)
   * Uses RDO protocol: C sel <CurrBlock> set Name="%<newName>";
   */
  public async renameFacility(x: number, y: number, newName: string): Promise<{ success: boolean, message?: string }> {
    try {
      // Use currently focused building ID if coordinates match
      let buildingId = this.currentFocusedBuildingId;

      // If not focused or different coordinates, focus first
      if (!buildingId ||
          !this.currentFocusedCoords ||
          this.currentFocusedCoords.x !== x ||
          this.currentFocusedCoords.y !== y) {
        this.log.debug(`[Session] Building not focused, focusing at (${x}, ${y})`);
        const focusInfo = await this.focusBuilding(x, y);
        if (!focusInfo.buildingId) {
          return { success: false, message: 'Could not find building at specified coordinates' };
        }
        buildingId = focusInfo.buildingId;
      } else {
        this.log.debug(`[Session] Using already focused building ID: ${buildingId}`);
      }

      this.log.debug(`[Session] Renaming building ${buildingId} to "${newName}"`);

      // Ensure construction service is connected (handles building operations on port 7001)
      if (!this.sockets.has('construction')) {
        this.log.debug('[Session] Construction service not connected, connecting now...');
        await this.connectConstructionService();
      }

      // Send RDO SET command to Construction server (port 7001)
      // Format: C sel <CurrBlock> set Name="%<newName>";
      await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: buildingId,
        action: RdoAction.SET,
        member: 'Name',
        args: [RdoValue.string(newName).format()]
      });

      this.log.debug(`[Session] Building renamed successfully`);
      return { success: true, message: 'Building renamed successfully' };
    } catch (e: unknown) {
      this.log.error(`[Session] Failed to rename building:`, e);
      return { success: false, message: toErrorMessage(e) };
    }
  }

  /**
   * Delete a facility (building)
   * RDO command: C sel <World ID> call RDODelFacility "^" "#<x>","#<y>";
   * Note: sel uses worldId (from idof World), NOT building's CurrBlock ID
   */
  public async deleteFacility(x: number, y: number): Promise<{ success: boolean, message?: string }> {
    try {
      this.log.debug(`[Session] Deleting building at (${x}, ${y})`);

      // Ensure construction service is connected (handles building operations on port 7001)
      if (!this.sockets.has('construction')) {
        this.log.debug('[Session] Construction service not connected, connecting now...');
        await this.connectConstructionService();
      }

      // Verify worldId is available (obtained from "idof World" during connection)
      if (!this.worldId) {
        return { success: false, message: 'Construction service not properly initialized - worldId is null' };
      }

      // Send RDO CALL command to Construction server (port 7001)
      // Format: C sel <World ID> call RDODelFacility "^" "#<x>","#<y>";
      // Note: sel must use worldId (from idof World), NOT buildingId (CurrBlock)
      const result = await this.sendRdoRequest('construction', {
        verb: RdoVerb.SEL,
        targetId: this.worldId,  // Use World ID, not building CurrBlock ID
        action: RdoAction.CALL,
        member: 'RDODelFacility',
        separator: '"^"',  // Variant return type
        args: [RdoValue.int(x).format(), RdoValue.int(y).format()]
      });

      this.log.debug(`[Session] Building deleted successfully, result: ${result}`);

      // Clear focused building since it no longer exists
      this.currentFocusedBuildingId = null;
      this.currentFocusedCoords = null;

      return { success: true, message: 'Building deleted successfully' };
    } catch (e: unknown) {
      this.log.error(`[Session] Failed to delete building:`, e);
      return { success: false, message: toErrorMessage(e) };
    }
  }

  // =============================================================================
  // ROAD BUILDING FEATURE
  // =============================================================================

  /** Cost per road tile in dollars */
  private readonly ROAD_COST_PER_TILE = 2000000;

  /**
   * Generate individual road segments for a path from (x1,y1) to (x2,y2)
   *
   * For horizontal/vertical paths: returns a single segment
   * For diagonal paths: returns multiple 1-tile segments in staircase pattern
   *
   * Algorithm for diagonal (staircase pattern):
   * - Alternate between horizontal and vertical 1-tile segments
   * - Prioritize the axis with more distance remaining
   *
   * @param x1 Start X
   * @param y1 Start Y
   * @param x2 End X
   * @param y2 End Y
   * @returns Array of segments, each with start/end coordinates
   */
  private generateRoadSegments(
    x1: number, y1: number, x2: number, y2: number
  ): Array<{ sx: number; sy: number; ex: number; ey: number }> {
    const segments: Array<{ sx: number; sy: number; ex: number; ey: number }> = [];

    const dx = x2 - x1;
    const dy = y2 - y1;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Pure horizontal segment
    if (dy === 0 && dx !== 0) {
      segments.push({ sx: x1, sy: y1, ex: x2, ey: y2 });
      return segments;
    }

    // Pure vertical segment
    if (dx === 0 && dy !== 0) {
      segments.push({ sx: x1, sy: y1, ex: x2, ey: y2 });
      return segments;
    }

    // Diagonal: create staircase pattern with 1-tile segments
    // Direction increments
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;

    let currentX = x1;
    let currentY = y1;
    let remainingX = absDx;
    let remainingY = absDy;

    // Alternate between X and Y moves, prioritizing the axis with more remaining distance
    while (remainingX > 0 || remainingY > 0) {
      // Decide whether to move X or Y
      // Prioritize the axis with more remaining steps
      const moveX = remainingX > 0 && (remainingX >= remainingY || remainingY === 0);

      if (moveX) {
        // Horizontal 1-tile segment
        const nextX = currentX + stepX;
        segments.push({ sx: currentX, sy: currentY, ex: nextX, ey: currentY });
        currentX = nextX;
        remainingX--;
      } else if (remainingY > 0) {
        // Vertical 1-tile segment
        const nextY = currentY + stepY;
        segments.push({ sx: currentX, sy: currentY, ex: currentX, ey: nextY });
        currentY = nextY;
        remainingY--;
      }
    }

    return segments;
  }

  /**
   * Build a road path between two points
   *
   * For horizontal/vertical: sends single segment
   * For diagonal: sends multiple 1-tile segments in staircase pattern (like official client)
   *
   * RDO command: C sel <Context ID> call CreateCircuitSeg "^" "#<circuitId>","#<ownerId>","#<x1>","#<y1>","#<x2>","#<y2>","#<cost>";
   *
   * CRITICAL: Uses worldContextId (from Logon response), NOT interfaceServerId
   *
   * @param x1 Start X coordinate
   * @param y1 Start Y coordinate
   * @param x2 End X coordinate
   * @param y2 End Y coordinate
   * @returns Result with success status, total cost, and tile count
   */
  public async buildRoad(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): Promise<{ success: boolean; cost: number; tileCount: number; message?: string; errorCode?: number }> {
    try {
      this.log.debug(`[RoadBuilding] Building road from (${x1}, ${y1}) to (${x2}, ${y2})`);

      // Validate points are different
      if (x1 === x2 && y1 === y2) {
        this.log.warn(`[RoadBuilding] Invalid: start and end points are the same`);
        return {
          success: false,
          cost: 0,
          tileCount: 0,
          message: 'Start and end points must be different.',
          errorCode: 2 // CIRCUIT_ERROR_InvalidSegment
        };
      }

      // Verify world socket is connected
      if (!this.sockets.has('world')) {
        this.log.error('[RoadBuilding] Interface server not connected');
        return {
          success: false,
          cost: 0,
          tileCount: 0,
          message: 'Interface server not connected',
          errorCode: 1
        };
      }

      // Verify worldContextId is available
      if (!this.worldContextId) {
        this.log.error('[RoadBuilding] World context not initialized');
        return {
          success: false,
          cost: 0,
          tileCount: 0,
          message: 'World context not initialized',
          errorCode: 1
        };
      }

      // Generate segments (single for H/V, multiple for diagonal)
      const segments = this.generateRoadSegments(x1, y1, x2, y2);
      this.log.debug(`[RoadBuilding] Generated ${segments.length} segment(s)`);

      // Get owner and circuit IDs
      const ownerId = this.fTycoonProxyId || 0;
      const circuitId = 1; // Road circuit type

      let totalCost = 0;
      let totalTiles = 0;
      let failedSegment: { message: string; errorCode: number } | null = null;

      // Send each segment sequentially
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        // Calculate segment cost (each segment is 1 tile for diagonal, or full length for H/V)
        const segDx = Math.abs(seg.ex - seg.sx);
        const segDy = Math.abs(seg.ey - seg.sy);
        const segTiles = Math.max(segDx, segDy);
        const segCost = segTiles * this.ROAD_COST_PER_TILE;

        this.log.debug(`[RoadBuilding] Segment ${i + 1}/${segments.length}: (${seg.sx},${seg.sy}) to (${seg.ex},${seg.ey}), tiles=${segTiles}, cost=${segCost}`);

        const args = [
          `#${circuitId}`,
          `#${ownerId}`,
          `#${seg.sx}`,
          `#${seg.sy}`,
          `#${seg.ex}`,
          `#${seg.ey}`,
          `#${segCost}`
        ];

        const result = await this.sendRdoRequest('world', {
          verb: RdoVerb.SEL,
          targetId: this.worldContextId!,
          action: RdoAction.CALL,
          member: 'CreateCircuitSeg',
          separator: '"^"',
          args
        });

        // Parse response
        const resultMatch = /res="#(-?\d+)"/.exec(result.payload || '');
        const resultCode = resultMatch ? parseInt(resultMatch[1], 10) : -1;

        if (resultCode === 0) {
          totalCost += segCost;
          totalTiles += segTiles;
        } else {
          // Map error codes to user-friendly messages
          const errorMessages: Record<number, string> = {
            1: 'Road construction failed — please try a different location',
            2: 'Invalid road segment — check your coordinates',
            3: 'Permission denied — you may not have sufficient funds or rights to build here',
            4: 'Insufficient funds to build this road segment',
            5: 'Your company was not recognized — please reconnect',
            21: 'Unsupported road type',
            22: 'Cannot build a road at this location — area may be occupied or restricted',
            23: 'Cannot modify an existing road segment here',
          };

          failedSegment = {
            message: errorMessages[resultCode] || `Failed with code ${resultCode}`,
            errorCode: resultCode
          };
          this.log.warn(`[RoadBuilding] Segment ${i + 1} failed: ${failedSegment.message}`);
          // Continue with other segments (partial road is better than nothing)
        }
      }

      // Return overall result
      if (totalTiles > 0) {
        const message = failedSegment
          ? `Road partially built (${totalTiles} tiles). Some segments failed: ${failedSegment.message}`
          : `Road built successfully: ${totalTiles} tiles`;

        this.log.debug(`[RoadBuilding] ${message}`);
        return {
          success: true,
          cost: totalCost,
          tileCount: totalTiles,
          message
        };
      } else {
        return {
          success: false,
          cost: 0,
          tileCount: 0,
          message: failedSegment?.message || 'Failed to build road',
          errorCode: failedSegment?.errorCode || 1
        };
      }
    } catch (e: unknown) {
      this.log.error(`[RoadBuilding] Failed to build road:`, e);
      return {
        success: false,
        cost: 0,
        tileCount: 0,
        message: toErrorMessage(e),
        errorCode: 1
      };
    }
  }

  /**
   * Get road building cost estimate without actually building
   * @param x1 Start X coordinate
   * @param y1 Start Y coordinate
   * @param x2 End X coordinate
   * @param y2 End Y coordinate
   * @returns Cost estimate with tile count
   */
  public getRoadCostEstimate(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): { cost: number; tileCount: number; costPerTile: number; valid: boolean; error?: string } {
    // Validate start and end points are different
    if (x1 === x2 && y1 === y2) {
      return {
        cost: 0,
        tileCount: 0,
        costPerTile: this.ROAD_COST_PER_TILE,
        valid: false,
        error: 'Start and end points must be different'
      };
    }

    // Calculate tile count using Chebyshev distance (max of dx, dy) for diagonal support
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const tileCount = Math.max(dx, dy);
    const cost = tileCount * this.ROAD_COST_PER_TILE;

    return {
      cost,
      tileCount,
      costPerTile: this.ROAD_COST_PER_TILE,
      valid: true
    };
  }

  /**
   * Demolish a road segment at (x, y)
   *
   * Delphi reference (World.pas:4311-4354):
   *   function RDOBreakCircuitAt(CircuitId, TycoonId, x, y: integer): OleVariant;
   *   CircuitId: 1=Roads, 2=Rail
   *   Returns: 0=success (also returned if no segment at location), 1=unknown, 15=accessDenied, 21=unknownCircuit
   *
   * Uses worldContextId (same as road building)
   */
  public async demolishRoad(x: number, y: number): Promise<{ success: boolean; message?: string; errorCode?: number }> {
    if (!this.worldContextId) {
      return { success: false, message: 'Not connected to world', errorCode: 1 };
    }

    const circuitId = 1; // Road circuit type
    const ownerId = this.fTycoonProxyId || 0;

    try {
      const result = await this.sendRdoRequest('world', {
        verb: RdoVerb.SEL,
        targetId: this.worldContextId,
        action: RdoAction.CALL,
        member: 'BreakCircuitAt',
        separator: '"^"',
        args: [
          `#${circuitId}`,
          `#${ownerId}`,
          `#${x}`,
          `#${y}`
        ]
      });

      const resultMatch = /res="#(-?\d+)"/.exec(result.payload || '');
      const resultCode = resultMatch ? parseInt(resultMatch[1], 10) : -1;

      if (resultCode === 0) {
        this.log.debug(`[RoadDemolish] Road demolished at (${x}, ${y})`);
        return { success: true };
      }

      // Delphi return codes (World.pas / Protocol.pas):
      //   0 = NOERROR (success OR no segment found — ambiguous)
      //   1 = ERROR_Unknown
      //  15 = ERROR_AccessDenied
      //  21 = ERROR_UnknownCircuit
      const errorMessages: Record<number, string> = {
        1: 'Road demolition failed — please try a different location',
        15: 'Permission denied — you do not have rights to demolish roads here',
        21: 'Invalid circuit type',
      };

      const message = errorMessages[resultCode] || `Failed with code ${resultCode}`;
      this.log.warn(`[RoadDemolish] Failed at (${x}, ${y}): ${message}`);
      return { success: false, message, errorCode: resultCode };
    } catch (e: unknown) {
      this.log.error(`[RoadDemolish] Failed to demolish road:`, e);
      return { success: false, message: toErrorMessage(e), errorCode: 1 };
    }
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

  /**
   * Fetch world properties from InterfaceServer
   */
  private async fetchWorldProperties(interfaceServerId: string): Promise<void> {
    // Legacy Delphi client sends GET commands one at a time, waiting for each
    // response before sending the next. The RDO server is single-threaded and
    // crashes or deadlocks when bombarded with concurrent requests on one socket.
    const props = [
      "WorldName", "WorldURL", "DAAddr", "DAPort", "DALockPort",
      "MailAddr", "MailPort", "WorldXSize", "WorldYSize", "WorldSeason"
    ] as const;

    // Sequential: send one GET, wait for response, then send the next
    for (const prop of props) {
      const packet = await this.sendRdoRequest("world", {
        verb: RdoVerb.SEL,
        targetId: interfaceServerId,
        action: RdoAction.GET,
        member: prop
      });
      const value = parsePropertyResponseHelper(packet.payload!, prop);
      this.log.debug(`[Session] ${prop}: ${value}`);

      if (prop === "WorldName" && value && this.currentWorldInfo) {
        // Use InterfaceServer's proper-case WorldName (e.g., "Shamba" not "shamba")
        this.currentWorldInfo.name = value;
      }
      if (prop === "DAAddr") {
        this.daAddr = value;
      }
      if (prop === "DAPort") {
        this.daPort = parseInt(value, 10);
      }
      if (prop === "MailAddr") {
        this.mailAddr = value;
      }
      if (prop === "MailPort") {
        this.mailPort = parseInt(value, 10);
      }
      if (prop === "WorldXSize") {
        this.worldXSize = parseInt(value, 10) || null;
        if (this.currentWorldInfo) this.currentWorldInfo.mapSizeX = this.worldXSize ?? undefined;
      }
      if (prop === "WorldYSize") {
        this.worldYSize = parseInt(value, 10) || null;
        if (this.currentWorldInfo) this.currentWorldInfo.mapSizeY = this.worldYSize ?? undefined;
      }
      if (prop === "WorldSeason") {
        this.worldSeason = parseSeasonValue(value);
      }
    }
  }

  /**
   * Retrieve Tycoon cookies (last position, etc.)
   */
  
private createSocket(name: string, host: string, port: number): Promise<net.Socket> {
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
  private startServerBusyPolling(): void {
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
      } catch (e) {
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
  private stopCacherKeepAlive(): void {
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
private sendRdoRequest(socketName: string, packetData: Partial<RdoPacket>): Promise<RdoPacket> {
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
  // CRITICAL: Detect InitClient push during login
  if (this.waitingForInitClient) {
    const hasInitClient = packet.member === "InitClient" ||
      (packet.raw && packet.raw.includes("InitClient"));
    if (hasInitClient) {
      this.log.debug(`[Session] Server sent InitClient push (detected in ${packet.member ? 'member' : 'raw'})`);

      // Parse InitClient data
      // Example: C sel 44917624 call InitClient "*" "@78006","%419278163478","#0","#223892356";
      // Args: [Date, Money, FailureLevel, fTycoonProxyId]
      if (packet.args && packet.args.length >= 4) {
        try {
          // Parse virtual date (Double: @value)
          this.virtualDate = RdoParser.asFloat(packet.args[0]);

          // Parse money (OLEString: %value - can be very large number)
          this.accountMoney = RdoParser.getValue(packet.args[1]);

          // Parse failure level (Integer: #value)
          this.failureLevel = RdoParser.asInt(packet.args[2]);

          // Parse fTycoonProxyId (Integer: #value)
          this.fTycoonProxyId = RdoParser.asInt(packet.args[3]);

          this.log.debug(`[Session] InitClient parsed - Date: ${this.virtualDate}, Money: ${this.accountMoney}, FailureLevel: ${this.failureLevel}, fTycoonProxyId: ${this.fTycoonProxyId}`);

          // Forward initial game date to client
          if (this.virtualDate !== null) {
            this.emit('ws_event', {
              type: WsMessageType.EVENT_REFRESH_DATE,
              dateDouble: this.virtualDate,
            } as WsEventRefreshDate);
          }
        } catch (error) {
          this.log.error(`[Session] Failed to parse InitClient data:`, error);
          this.log.debug(`[Session] Raw args:`, packet.args);
        }
      } else {
        this.log.warn(`[Session] InitClient packet has insufficient args (expected 4, got ${packet.args?.length || 0})`);
      }

      this.waitingForInitClient = false;
      if (this.initClientResolver) {
        this.initClientResolver();
        this.initClientResolver = null;
      }
      return;
    }
  }

  // Server-initiated SetLanguage (just log it, no action needed)
  if (packet.member === "SetLanguage") {
    this.log.debug(`[Session] Server sent SetLanguage push (ignored)`);
    return;
  }

  // NewMail notification — push from InterfaceServer via fClientEventsProxy.NewMail(MsgCount)
  if (packet.member === "NewMail") {
    const count = packet.args?.[0] ? parseInt(packet.args[0].replace(/^#/, ''), 10) : 0;
    this.log.debug(`[Session] NewMail notification: ${count} unread message(s)`);
    const event: WsEventNewMail = {
      type: WsMessageType.EVENT_NEW_MAIL,
      unreadCount: count,
    };
    this.emit('ws_event', event);
    return;
  }

	// 1. ChatMsg parsing 
    if (packet.member === 'ChatMsg') {
      this.log.debug(`[Chat] Raw ChatMsg packet:`, packet);
      this.log.debug(`[Chat] Args:`, packet.args);
      this.log.debug(`[Chat] Args length:`, packet.args?.length);
      
      if (packet.args && packet.args.length >= 2) {
        // Parse from field (format: "name/id/status" or just "name")
        let from = packet.args[0].replace(/^[%#@$]/, '');
        const message = packet.args[1].replace(/^[%#@$]/, '');
        
        // Extract just the name if format is "name/id/status"
        if (from.includes('/')) {
          from = from.split('/')[0];
        }
        
        this.log.debug(`[Chat] Parsed - from: "${from}", message: "${message}"`);
        
        const event: WsEventChatMsg = {
          type: WsMessageType.EVENT_CHAT_MSG,
          channel: this.currentChannel || 'Lobby',
          from: from,
          message: message
        };
        
        this.log.debug(`[Chat] Emitting event:`, event);
        this.emit('ws_event', event);
        return;
      } else {
        this.log.warn(`[Chat] ChatMsg packet has insufficient args:`, packet);
      }
    }

  // 2. NotifyMsgCompositionState - User typing status
  if (packet.member === 'NotifyMsgCompositionState' && packet.args && packet.args.length >= 2) {
    const username = packet.args[0].replace(/^[%#@$]/, '');
    const statusStr = packet.args[1].replace(/^[%#@$]/, '');
    const isTyping = statusStr === '1';

    this.log.debug(`[Chat] ${username} is ${isTyping ? 'typing' : 'idle'}`);

    const event: WsEventChatUserTyping = {
      type: WsMessageType.EVENT_CHAT_USER_TYPING,
      username,
      isTyping
    };

    this.emit('ws_event', event);
    return;
  }

  // 3. NotifyChannelChange - Channel switched
  if (packet.member === 'NotifyChannelChange' && packet.args && packet.args.length >= 1) {
    const channelName = packet.args[0].replace(/^[%#@$]/, '');
    this.currentChannel = channelName;

    this.log.debug(`[Chat] Channel changed to: ${channelName || 'Lobby'}`);

    const event: WsEventChatChannelChange = {
      type: WsMessageType.EVENT_CHAT_CHANNEL_CHANGE,
      channelName: channelName || 'Lobby'
    };

    this.emit('ws_event', event);
    return;
  }

  // 4. NotifyUserListChange - User joined/left
  if (packet.member === 'NotifyUserListChange' && packet.args && packet.args.length >= 2) {
    const userInfo = packet.args[0].replace(/^[%#@$]/, '');
    const actionCode = packet.args[1].replace(/^[%#@$]/, '');
    const userParts = userInfo.split('/');

    if (userParts.length >= 3) {
      const user: ChatUser = {
        name: userParts[0],
        id: userParts[1],
        status: parseInt(userParts[2], 10) || 0
      };

      const action = actionCode === '0' ? 'JOIN' : 'LEAVE';
      this.log.debug(`[Chat] User ${user.name} ${action === 'JOIN' ? 'joined' : 'left'}`);

      const event: WsEventChatUserListChange = {
        type: WsMessageType.EVENT_CHAT_USER_LIST_CHANGE,
        user,
        action
      };

      this.emit('ws_event', event);
    }
    return;
  }

  // 5. RefreshTycoon parsing
  if (packet.member === 'RefreshTycoon' && packet.args && packet.args.length >= 5) {
    try {
      // Clean type prefixes (%, #, @, $) from args
      const cleanArgs = packet.args.map(arg => arg.replace(/^[%#@$]/, ''));

      const tycoonUpdate: WsEventTycoonUpdate = {
        type: WsMessageType.EVENT_TYCOON_UPDATE,
        cash: cleanArgs[0],
        incomePerHour: cleanArgs[1],
        ranking: parseInt(cleanArgs[2], 10) || 0,
        buildingCount: parseInt(cleanArgs[3], 10) || 0,
        maxBuildings: parseInt(cleanArgs[4], 10) || 0,
        // Include last-known failureLevel from InitClient (0=nominal, >0=debt)
        failureLevel: this.failureLevel ?? undefined,
      };

      // Cache push data for profile queries
      this.accountMoney = tycoonUpdate.cash;
      this.lastRanking = tycoonUpdate.ranking;
      this.lastBuildingCount = tycoonUpdate.buildingCount;
      this.lastMaxBuildings = tycoonUpdate.maxBuildings;

      this.log.debug(`[Push] Tycoon Update: Cash=${tycoonUpdate.cash}, Income/h=${tycoonUpdate.incomePerHour}, Rank=${tycoonUpdate.ranking}, Buildings=${tycoonUpdate.buildingCount}/${tycoonUpdate.maxBuildings}`);
      this.emit('ws_event', tycoonUpdate);
      return;
    } catch (e) {
      this.log.error('[Push] Error parsing RefreshTycoon:', e);
      // Fallback to generic push
    }
  }

  // 6. EndOfPeriod — server signals a financial period has ended
  if (packet.member === 'EndOfPeriod') {
    this.log.debug('[Push] EndOfPeriod received');
    const endOfPeriodEvent: WsEventEndOfPeriod = {
      type: WsMessageType.EVENT_END_OF_PERIOD,
    };
    this.emit('ws_event', endOfPeriodEvent);
    return;
  }

  // 7. RefreshDate — server sends updated virtual date periodically
  if (packet.member === 'RefreshDate' && packet.args && packet.args.length >= 1) {
    const dateDouble = RdoParser.asFloat(packet.args[0]);
    this.virtualDate = dateDouble;
    this.log.debug(`[Push] RefreshDate: ${dateDouble}`);
    const dateEvent: WsEventRefreshDate = {
      type: WsMessageType.EVENT_REFRESH_DATE,
      dateDouble,
    };
    this.emit('ws_event', dateEvent);
    return;
  }

  // 8. ShowNotification — server game notification (research complete, events, etc.)
  // Format: C sel <proxy> call ShowNotification "*" "#<kind>","%<title>","%<body>","#<options>";
  // Kind: 0=MessageBox, 1=URLFrame, 2=ChatMessage, 3=Sound, 4=GenericEvent
  if (packet.member === 'ShowNotification') {
    const kind = packet.args?.[0] ? RdoParser.asInt(packet.args[0]) : 0;
    const title = packet.args?.[1] ? RdoParser.getValue(packet.args[1]) : '';
    const body = packet.args?.[2] ? RdoParser.getValue(packet.args[2]) : '';
    const options = packet.args?.[3] ? RdoParser.asInt(packet.args[3]) : 0;
    this.log.debug(`[Push] ShowNotification: kind=${kind}, title="${title}", body="${body}", options=${options}`);
    const notifEvent: WsEventShowNotification = {
      type: WsMessageType.EVENT_SHOW_NOTIFICATION,
      kind,
      title,
      body,
      options,
    };
    this.emit('ws_event', notifEvent);
    return;
  }

  // 9. Refresh — cache proxy invalidation (server tells client to re-fetch building data)
  // Format: C <connId> sel <objectId> call Refresh "*" ;
  if (packet.member === 'Refresh' && (!packet.args || packet.args.length === 0)) {
    this.log.debug('[Push] Cache Refresh received — building data invalidated');
    const refreshEvent: WsEventCacheRefresh = {
      type: WsMessageType.EVENT_CACHE_REFRESH,
    };
    this.emit('ws_event', refreshEvent);
    return;
  }

  // 10. Generic push fallback (for unhandled events)
  const event: WsEventRdoPush = {
    type: WsMessageType.EVENT_RDO_PUSH,
    rawPacket: packet.raw
  };

  this.emit('ws_event', event);
}


  // =========================================================================
  // PARSING UTILS
  // =========================================================================

  private parseDirectoryResult(payload: string): WorldInfo[] {
    let raw = payload.trim();
    raw = raw.replace(/^[%#$@]/, '');
    const lines = raw.split(/\n/);
    const data: Map<string, string> = new Map();

    for (const line of lines) {
      if (!line.includes('=')) continue;
      const parts = line.split('=');
      const key = parts[0].trim().toLowerCase();
      const value = parts.slice(1).join('=').trim();
      data.set(key, value);
    }

    const countStr = data.get('count');
    if (!countStr) {
      this.log.warn('[Session] Directory Parse Error: "count" key not found in response.');
      this.log.warn('[Session] First 5 keys:', Array.from(data.keys()).slice(0, 5));
      return [];
    }

    const count = parseInt(countStr, 10);
    const worlds: WorldInfo[] = [];

    for (let i = 0; i < count; i++) {
      const name = data.get(`key${i}`) || 'Unknown';
      const url = data.get(`interface/url${i}`) || '';
      const ip = data.get(`interface/ip${i}`) || '127.0.0.1';
      const port = parseInt(data.get(`interface/port${i}`) || '0', 10);
      const date = data.get(`general/date${i}`);
      const population = parseInt(data.get(`general/population${i}`) || '0', 10);
      const investors = parseInt(data.get(`general/investors${i}`) || '0', 10);
      const online = parseInt(data.get(`general/online${i}`) || '0', 10);
      const runningStr = data.get(`interface/running${i}`) || '';
      const running3 = runningStr.toLowerCase() === 'true';

      if (port === 0) continue;

      worlds.push({
        name, url, ip, port,
        season: date,
        date: date,
        population: population,
        investors: investors,
        online: online,
        players: online,  // online and players are the same
        mapSizeX: 0,
        mapSizeY: 0,
        running3: running3
      });
    }

    return worlds;
  }

  /**
   * Get list of users in current chat channel
   */
  public async getChatUserList(): Promise<ChatUser[]> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    
    this.log.debug('[Chat] Getting user list...');
    
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'GetUserList',
      separator: '"^"'
    });

    const rawUsers = parsePropertyResponseHelper(packet.payload || '', 'res');
    return this.parseChatUserList(rawUsers);
  }

  /**
   * Get list of available chat channels
   */
  public async getChatChannelList(): Promise<string[]> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    
    this.log.debug('[Chat] Getting channel list...');
    
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'GetChannelList',
      args: [RdoValue.string('ROOT').format()],
      separator: '"^"'
    });
    
    const rawChannels = parsePropertyResponseHelper(packet.payload || '', 'res');
    return this.parseChatChannelList(rawChannels);
  }

  /**
   * Get information about a specific channel
   */
  public async getChatChannelInfo(channelName: string): Promise<string> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    
    this.log.debug(`[Chat] Getting info for channel: ${channelName}`);
    
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'GetChannelInfo',
      args: [channelName],
      separator: '^'
    });
    
    return parsePropertyResponseHelper(packet.payload || '', 'res');
  }

  /**
   * Join a chat channel
   * @param channelName - Channel name, or "" for lobby
   */
  public async joinChatChannel(channelName: string): Promise<void> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    
    const displayName = channelName || 'Lobby';
    this.log.debug(`[Chat] Joining channel: ${displayName}`);
    
    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'JoinChannel',
      args: [channelName, ''],
      separator: '^'
    });
    
    const result = parsePropertyResponseHelper(packet.payload || '', 'res');
    if (result !== '0') {
      throw new Error(`Failed to join channel: ${result}`);
    }
    
    this.currentChannel = channelName;
    this.log.debug(`[Chat] Successfully joined: ${displayName}`);
  }

  /**
   * Send a chat message to current channel
   */
  public async sendChatMessage(message: string): Promise<void> {
    if (!this.worldContextId) throw new Error('Not logged into world');
    if (!message.trim()) return;
    
    this.log.debug(`[Chat] Sending message: ${message}`);
    
    await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'SayThis',
      args: ['', message],
      separator: '*'
    });
  }
  
  /**
   * Notify server of typing status
   */
  public async setChatTypingStatus(isTyping: boolean): Promise<void> {
    if (!this.worldContextId) throw new Error('Not logged into world');

    const status = isTyping ? 1 : 0;

    // Send as push command (no await needed)
    const socket = this.sockets.get('world');
    if (socket) {
      const cmd = RdoCommand.sel(this.worldContextId!)
        .call('MsgCompositionChanged')
        .push()
        .args(RdoValue.int(status))
        .build();
      socket.write(cmd);
    }
  }

  /**
   * Get current channel name
   */
  public getCurrentChannel(): string {
    return this.currentChannel || 'Lobby';
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
    } catch (e) {
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
      } catch (err) {
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
      } catch (err) {
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
        } catch (err) {
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
      } catch (err) {
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

    this.log.debug('[Session] Session destroyed successfully');
  }

  // =========================================================================
  // CHAT PARSING HELPERS
  // =========================================================================

  /**
   * Parse user list format: "name/id/status\n..."
   */
  private parseChatUserList(rawData: string): ChatUser[] {
    const users: ChatUser[] = [];
    const lines = rawData.split(/\r?\n/).filter(l => l.trim().length > 0);
    
    for (const line of lines) {
      const parts = line.split('/');
      if (parts.length >= 3) {
        users.push({
          name: parts[0].trim(),
          id: parts[1].trim(),
          status: parseInt(parts[2], 10) || 0
        });
      }
    }
    
    this.log.debug(`[Chat] Parsed ${users.length} users`);
    return users;
  }

  /**
   * Parse channel list format: "channelName\npassword\n..." (alternating name/password pairs).
   * Server returns pairs: line 0=name, line 1=password, line 2=name, line 3=password, etc.
   * Returns channel names only, with "Lobby" prepended as the default main channel.
   */
  private parseChatChannelList(rawData: string): string[] {
    const lines = rawData
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    // Extract only channel names (even-indexed lines: 0, 2, 4, ...)
    const channelNames: string[] = ['Lobby'];
    for (let i = 0; i < lines.length; i += 2) {
      channelNames.push(lines[i]);
    }

    this.log.debug(`[Chat] Parsed ${channelNames.length} channels (including Lobby)`);
    return channelNames;
  }

  // =========================================================================
  // DEFINEZONE PROTOCOL (Zone Painting)
  // =========================================================================

  /**
   * Define a zone area on the map.
   * RDO: sel <worldContextId> call DefineZone "^" #tycoonId, #zoneId, #x1, #y1, #x2, #y2
   */
  public async defineZone(
    zoneId: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.worldContextId) {
      throw new Error('Not logged into world - cannot define zone');
    }
    if (!this.tycoonId) {
      throw new Error('No tycoon ID - cannot define zone');
    }

    // Normalize coordinates (ensure min/max)
    const nx1 = Math.min(x1, x2);
    const ny1 = Math.min(y1, y2);
    const nx2 = Math.max(x1, x2);
    const ny2 = Math.max(y1, y2);

    this.log.debug(`[Zone] Defining zone ${zoneId} from (${nx1},${ny1}) to (${nx2},${ny2})`);

    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'DefineZone',
      separator: '"^"',
      args: [
        RdoValue.int(parseInt(this.tycoonId, 10)).format(),
        RdoValue.int(zoneId).format(),
        RdoValue.int(nx1).format(),
        RdoValue.int(ny1).format(),
        RdoValue.int(nx2).format(),
        RdoValue.int(ny2).format(),
      ]
    });

    const result = packet.payload || '';
    this.log.debug(`[Zone] DefineZone response: ${result}`);

    return { success: true, message: result };
  }

  // =========================================================================
  // GETSURFACE PROTOCOL (Zone Overlays)
  // =========================================================================

  /**
   * Request surface data (zones, pollution, etc.) for a map area
   * Uses RLE (Run-Length Encoding) compression for efficient transmission
   */
  public async getSurfaceData(
    surfaceType: SurfaceType,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): Promise<SurfaceData> {
    if (!this.worldContextId) {
      throw new Error('Not logged into world - cannot get surface data');
    }

    this.log.debug(`[Surface] Requesting ${surfaceType} data for area (${x1},${y1}) to (${x2},${y2})`);

    const packet = await this.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: this.worldContextId,
      action: RdoAction.CALL,
      member: 'GetSurface',
      separator: '"^"',
      args: [RdoValue.string(surfaceType).format(), RdoValue.int(x1).format(), RdoValue.int(y1).format(), RdoValue.int(x2).format(), RdoValue.int(y2).format()]
    });

    return this.parseRLEResponse(packet.payload || '');
  }

  /**
   * Parse RLE-encoded surface response
   * Format: res="%width:height:row1_data,:row2_data,:..."
   */
  private parseRLEResponse(response: string): SurfaceData {
    // Extract data after 'res="' or just use the response directly
    let data = response;
    const dataMatch = response.match(/res="([^"]+)"/);
    if (dataMatch) {
      data = dataMatch[1];
    }

    // Remove leading '%' if present
    if (data.startsWith('%')) {
      data = data.substring(1);
    }

    const parts = data.split(':');

    if (parts.length < 3) {
      this.log.warn('[Surface] Invalid RLE response format');
      return { width: 0, height: 0, rows: [] };
    }

    // Parse dimensions
    const width = parseInt(parts[0], 10);
    const height = parseInt(parts[1], 10);

    // Parse rows (skip first two parts which are dimensions)
    const rows: number[][] = [];
    for (let i = 2; i < parts.length; i++) {
      const rowData = parts[i].replace(/^,/, ''); // Remove leading comma
      if (rowData) {
        rows.push(this.decodeRLERow(rowData));
      }
    }

    this.log.debug(`[Surface] Parsed surface data: ${width}x${height}, ${rows.length} rows`);
    return { width, height, rows };
  }

  /**
   * Decode a single RLE-encoded row.
   * Format: "value1=count1,value2=count2,..."
   *
   * Delphi CompressMap multiplies all values by Scale=1000 before encoding.
   * We divide by 1000 here to restore original values, matching Delphi DecompressMap.
   */
  private decodeRLERow(encodedRow: string): number[] {
    const cells: number[] = [];
    const segments = encodedRow.split(',');

    for (const segment of segments) {
      if (!segment) continue;

      const parts = segment.split('=');
      if (parts.length === 2) {
        const scaledValue = parseInt(parts[0], 10);
        const count = parseInt(parts[1], 10);
        // Delphi CompressMap uses Scale=1000; divide to restore original values
        const value = scaledValue / 1000;

        for (let i = 0; i < count; i++) {
          cells.push(value);
        }
      }
    }

    return cells;
  }

  // =========================================================================
  // BUILDING CONSTRUCTION FEATURE
  // =========================================================================

  // ===========================================================================
  // CLUSTER BROWSING (company creation)
  // ===========================================================================

  /**
   * Fetch cluster info (description + building categories) from NewLogon/info.asp.
   * This ASP page does not require a company — suitable for pre-creation browsing.
   */
  public async fetchClusterInfo(clusterName: string): Promise<ClusterInfo> {
    if (!this.currentWorldInfo) {
      throw new Error('Not logged into world - cannot fetch cluster info');
    }

    const url = `http://${this.currentWorldInfo.ip}/Five/0/Visual/Voyager/NewLogon/info.asp?ClusterName=${encodeURIComponent(clusterName)}`;
    this.log.debug(`[ClusterBrowse] Fetching cluster info: ${clusterName}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();
      return this.parseClusterInfo(clusterName, html);
    } catch (e) {
      this.log.error(`[ClusterBrowse] Failed to fetch cluster info for ${clusterName}:`, e);
      return { id: clusterName, displayName: clusterName, description: '', categories: [] };
    }
  }

  /**
   * Parse info.asp HTML to extract cluster description and building categories.
   *
   * HTML structure (from trace):
   *   <div class="sealExpln" ...>description text</div>
   *   <td id="finger0" ... folder="00000002.DissidentsDirectionFacilities.five" ...>
   *     <div class="hiLabel"><nobr>Headquarters</nobr></div>
   *   </td>
   */
  private parseClusterInfo(clusterName: string, html: string): ClusterInfo {
    // Extract display name from cluster attribute on main table
    const clusterAttrMatch = /cluster\s*=\s*["']?([^"'\s>]+)/i.exec(html);
    const displayName = clusterAttrMatch?.[1] || clusterName;

    // Extract description from sealExpln div
    const descMatch = /<div[^>]*class\s*=\s*["']?sealExpln["']?[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    let description = '';
    if (descMatch) {
      description = descMatch[1]
        .replace(/<p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();
    }

    // Extract categories from finger elements with folder attribute
    const categories: ClusterCategory[] = [];
    const fingerRegex = /<td[^>]*\sfolder\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/td>/gi;
    let match;
    while ((match = fingerRegex.exec(html)) !== null) {
      const folder = match[1];
      const content = match[2];
      const nameMatch = /<nobr>([\s\S]*?)<\/nobr>/i.exec(content);
      const name = nameMatch ? nameMatch[1].trim() : '';
      if (name && folder) {
        categories.push({ name, folder });
      }
    }

    this.log.debug(`[ClusterBrowse] Parsed cluster "${clusterName}": ${categories.length} categories`);
    return { id: clusterName, displayName, description, categories };
  }

  /**
   * Fetch facility previews for a cluster/folder from NewLogon/facilityList.asp.
   * This ASP page does not require a company — suitable for pre-creation browsing.
   */
  public async fetchClusterFacilities(cluster: string, folder: string): Promise<ClusterFacilityPreview[]> {
    if (!this.currentWorldInfo) {
      throw new Error('Not logged into world - cannot fetch cluster facilities');
    }

    const params = new URLSearchParams({ Cluster: cluster, Folder: folder });
    const url = `http://${this.currentWorldInfo.ip}/Five/0/Visual/Voyager/NewLogon/facilityList.asp?${params.toString().replace(/\+/g, '%20')}`;
    this.log.debug(`[ClusterBrowse] Fetching facilities: ${cluster}/${folder}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();
      return this.parseClusterFacilities(html);
    } catch (e) {
      this.log.error(`[ClusterBrowse] Failed to fetch facilities for ${cluster}/${folder}:`, e);
      return [];
    }
  }

  /**
   * Parse facilityList.asp HTML to extract facility previews.
   *
   * HTML structure (from trace):
   *   <span ...>
   *     <div class=comment ...>Company Headquarters</div>
   *     <table><tr height=80>
   *       <td><img src=/five/icons/MapDisHQ1.gif /></td>
   *       <td>
   *         <img src="images/zone-commerce.gif" title="Building must be located in...">
   *         <div class=comment ...>$8,000K<br><nobr>3600 m.</nobr></div>
   *       </td>
   *     </tr></table>
   *     <div class="description" ...>optional description</div>
   *   </span>
   */
  private parseClusterFacilities(html: string): ClusterFacilityPreview[] {
    const facilities: ClusterFacilityPreview[] = [];

    // Split on <span> blocks — each facility is wrapped in a <span>
    const spanRegex = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    let match;
    while ((match = spanRegex.exec(html)) !== null) {
      const block = match[1];

      // Extract facility name from first comment div
      const nameMatch = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*font-size:\s*11px[^>]*>([\s\S]*?)<\/div>/i.exec(block);
      const name = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      if (!name) continue;

      // Extract icon URL (first <img src=...> pointing to /five/icons/ or similar)
      const iconMatch = /<img\s+src\s*=\s*["']?([^"'\s>]*icons[^"'\s>]*)["']?/i.exec(block);
      const iconUrl = iconMatch ? this.convertToProxyUrl(iconMatch[1]) : '';

      // Extract zone type from zone image title
      const zoneMatch = /<img[^>]*zone[^>]*title\s*=\s*["']([^"']+)["']/i.exec(block);
      const zoneType = zoneMatch?.[1] || '';

      // Extract cost and build time from the second comment div (smaller font)
      const metaMatch = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*font-size:\s*9px[^>]*>([\s\S]*?)<\/div>/i.exec(block);
      let cost = '';
      let buildTime = '';
      if (metaMatch) {
        const metaText = metaMatch[1];
        const costMatch = /(\$[\d,]+\.?\d*\s*[KM]?)/i.exec(metaText);
        cost = costMatch?.[1] || '';
        const timeMatch = /<nobr>([\d,]+\s*m\.)<\/nobr>/i.exec(metaText);
        buildTime = timeMatch?.[1] || '';
      }

      // Extract description
      const descMatch = /<div[^>]*class\s*=\s*["']?description["']?[^>]*>([\s\S]*?)<\/div>/i.exec(block);
      let description = '';
      if (descMatch) {
        description = descMatch[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
      }

      facilities.push({ name, iconUrl, cost, buildTime, zoneType, description });
    }

    this.log.debug(`[ClusterBrowse] Parsed ${facilities.length} facility previews`);
    return facilities;
  }

  // ===========================================================================
  // BUILD CONSTRUCTION
  // ===========================================================================

  /**
   * Fetch building categories via HTTP (KindList.asp)
   */
  public async fetchBuildingCategories(companyName: string): Promise<BuildingCategory[]> {
    if (!this.currentWorldInfo || !this.cachedUsername) {
      throw new Error('Not logged into world - cannot fetch building categories');
    }

    const params = new URLSearchParams({
      Company: companyName,
      WorldName: this.currentWorldInfo.name,
      Cluster: '',
      Tycoon: this.activeUsername || this.cachedUsername
    });

    const url = `http://${this.currentWorldInfo.ip}/five/0/visual/voyager/Build/KindList.asp?${params.toString().replace(/\+/g, '%20')}`;
    this.log.debug(`[BuildConstruction] Fetching categories from ${url}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();

      return this.parseBuildingCategories(html);
    } catch (e) {
      this.log.error('[BuildConstruction] Failed to fetch categories:', e);
      return [];
    }
  }

  /**
   * Parse HTML response from KindList.asp to extract building categories
   */
  private parseBuildingCategories(html: string): BuildingCategory[] {
    const categories: BuildingCategory[] = [];

    // Match <td> elements with ref attribute containing FacilityList.asp
    // Handle both quoted and unquoted ref attributes
    // If quoted, capture everything until closing quote; if unquoted, capture until space/bracket
    const tdRegex = /<td[^>]*\sref=(["']?)([^"']*FacilityList\.asp[^"']*)\1[^>]*>([\s\S]*?)<\/td>/gi;
    let match;

    while ((match = tdRegex.exec(html)) !== null) {
      const ref = match[2];  // Second capture group contains the ref URL
      const content = match[3];  // Third capture group contains the content

      this.log.debug(`[BuildConstruction] Found category ref: ${ref.substring(0, 100)}`);

      // Parse query parameters from ref
      const urlParams = new URLSearchParams(ref.split('?')[1] || '');

      // Extract category name from content
      // Try multiple patterns:
      // 1. <div class=link> or <div class="link">
      // 2. title attribute on img tag
      let kindName = '';

      // Pattern 1: <div> with class=link (quoted or unquoted)
      const divMatch = /<div[^>]*class\s*=\s*["']?link["']?[^>]*>\s*([^<]+)\s*<\/div>/i.exec(content);
      if (divMatch) {
        kindName = divMatch[1].trim();
      }

      // Pattern 2: title attribute (fallback)
      if (!kindName) {
        const titleMatch = /title\s*=\s*["']([^"']+)["']/i.exec(content);
        if (titleMatch) {
          kindName = titleMatch[1].trim();
        }
      }

      // Extract icon path (handle both quoted and unquoted src)
      const iconMatch = /src\s*=\s*["']?([^"'\s>]+)["']?/i.exec(content);
      const iconPath = iconMatch?.[1] || '';

      if (kindName && urlParams.get('Kind')) {
        const category = {
          kindName: kindName,
          kind: urlParams.get('Kind') || '',
          cluster: urlParams.get('Cluster') || '',
          folder: urlParams.get('Folder') || '',
          tycoonLevel: parseInt(urlParams.get('TycoonLevel') || '0', 10),
          iconPath: this.convertToProxyUrl(iconPath)
        };

        this.log.debug(`[BuildConstruction] Parsed category: ${category.kindName} (${category.kind})`);
        categories.push(category);
      } else {
        this.log.warn(`[BuildConstruction] Skipped category - kindName: "${kindName}", Kind: "${urlParams.get('Kind')}"`);
      }
    }

    this.log.debug(`[BuildConstruction] Parsed ${categories.length} categories total`);
    return categories;
  }

  /**
   * Fetch facilities (buildings) for a specific category via HTTP (FacilityList.asp)
   */
  public async fetchBuildingFacilities(
    companyName: string,
    cluster: string,
    kind: string,
    kindName: string,
    folder: string,
    tycoonLevel: number
  ): Promise<BuildingInfo[]> {
    if (!this.currentWorldInfo) {
      throw new Error('Not logged into world - cannot fetch facilities');
    }

    const params = new URLSearchParams({
      Company: companyName,
      WorldName: this.currentWorldInfo.name,
      Cluster: cluster,
      Kind: kind,
      KindName: kindName,
      Folder: folder,
      TycoonLevel: tycoonLevel.toString()
    });

    const url = `http://${this.currentWorldInfo.ip}/five/0/visual/voyager/Build/FacilityList.asp?${params.toString().replace(/\+/g, '%20')}`;
    this.log.debug(`[BuildConstruction] Fetching facilities from ${url}`);

    try {
      const response = await fetch(url, { redirect: 'follow' });
      const html = await response.text();

      return this.parseBuildingFacilities(html);
    } catch (e) {
      this.log.error('[BuildConstruction] Failed to fetch facilities:', e);
      return [];
    }
  }

  /**
   * Parse HTML response from FacilityList.asp to extract building information
   */
  private parseBuildingFacilities(html: string): BuildingInfo[] {
    const facilities: BuildingInfo[] = [];

    // Pre-scan: extract ALL FacilityClass→VisualClassId pairs from "info" attribute URLs.
    // The real server HTML has nested <table>/<tr> inside each Cell_N, and VisualClassId
    // lives in the "Build now" button's info attribute deep in the second inner <tr>.
    // The cellRegex below only captures up to the first inner </tr> (non-greedy),
    // so we must extract VisualClassId from the full HTML before cell-level processing.
    const visualClassMap = new Map<string, string>();
    // Strategy 1: FacilityClass before VisualClassId (standard order)
    const infoRegex = /FacilityClass=([A-Za-z0-9]+)[^"']*VisualClassId=(\d+)/gi;
    let infoMatch;
    while ((infoMatch = infoRegex.exec(html)) !== null) {
      visualClassMap.set(infoMatch[1], infoMatch[2]);
    }
    // Strategy 2: VisualClassId before FacilityClass (reversed order)
    const reverseInfoRegex = /VisualClassId=(\d+)[^"']*FacilityClass=([A-Za-z0-9]+)/gi;
    while ((infoMatch = reverseInfoRegex.exec(html)) !== null) {
      if (!visualClassMap.has(infoMatch[2])) {
        visualClassMap.set(infoMatch[2], infoMatch[1]);
      }
    }
    if (visualClassMap.size > 0) {
      this.log.debug(`[BuildConstruction] Pre-scanned ${visualClassMap.size} FacilityClass→VisualClassId pairs from info attributes`);
    }

    // Match each building's detail cell (Cell_N) - handle both quoted and unquoted id
    const cellRegex = /<tr[^>]*\sid\s*=\s*["']?Cell_(\d+)["']?[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;

    while ((match = cellRegex.exec(html)) !== null) {
      const cellIndex = match[1];
      const cellContent = match[2];

      // Find corresponding LinkText div for building name and availability
      // Handle both quoted and unquoted attributes, in any order
      const linkTextRegex = new RegExp(
        `<div[^>]*id\\s*=\\s*["']?LinkText_${cellIndex}["']?[^>]*available\\s*=\\s*["']?(\\d+)["']?[^>]*>([^<]+)<`,
        'i'
      );
      const linkMatch = linkTextRegex.exec(html);

      if (!linkMatch) {
        this.log.warn(`[BuildConstruction] No LinkText found for Cell_${cellIndex}`);
        continue;
      }

      const available = linkMatch[1] === '1';
      const name = linkMatch[2].trim();

      // Extract building icon - handle both quoted and unquoted src
      const iconMatch = /src\s*=\s*["']?([^"'\s>]+)["']?/i.exec(cellContent);
      const iconPath = iconMatch?.[1] || '';

      // Extract FacilityClass from info attribute (authoritative RDO class name).
      // Icon filenames use visual asset names that may differ from the kernel class
      // (e.g., icon "MapPGIHQ1.gif" → "PGIHQ1", but real class is "PGIGeneralHeadquarterSTA").
      // The info attribute on the "Build now" button has the correct FacilityClass.
      let facilityClass = '';
      let visualClassId = '';

      // PRIMARY: Extract FacilityClass from info attribute near this Cell_N
      const cellAnchor = html.indexOf(`Cell_${cellIndex}`);
      if (cellAnchor >= 0) {
        const nextCellPos = html.indexOf('Cell_', cellAnchor + 5);
        const searchEnd = nextCellPos >= 0 ? nextCellPos : cellAnchor + 3000;
        const searchWindow = html.substring(cellAnchor, searchEnd);
        const fcMatch = /FacilityClass=([A-Za-z0-9]+)/i.exec(searchWindow);
        if (fcMatch) {
          facilityClass = fcMatch[1];
          this.log.debug(`[BuildConstruction] Extracted facilityClass "${facilityClass}" from info attribute`);
        }
      }

      // FALLBACK: Extract from icon filename (for HTML without info attributes)
      if (!facilityClass && iconPath) {
        const iconFilenameMatch = /Map([A-Z][a-zA-Z0-9]+?)(?:\d+x\d+x\d+)?\.gif/i.exec(iconPath);
        if (iconFilenameMatch) {
          facilityClass = iconFilenameMatch[1];
          this.log.warn(`[BuildConstruction] FacilityClass from icon fallback: "${facilityClass}" (may differ from kernel class)`);
        }
      }

      // Look up VisualClassId from pre-scanned info attributes (handles nested-table HTML),
      // then fall back to searching cellContent directly (handles simplified/mock HTML),
      // then fall back to searching the full HTML near the Cell_N anchor.
      if (facilityClass && visualClassMap.has(facilityClass)) {
        visualClassId = visualClassMap.get(facilityClass)!;
      } else {
        const visualIdMatch = /VisualClassId[=:](\d+)/i.exec(cellContent);
        if (visualIdMatch) {
          visualClassId = visualIdMatch[1];
        } else if (facilityClass) {
          // Last resort: search the full HTML for VisualClassId near this Cell_N
          const cellAnchor = html.indexOf(`Cell_${cellIndex}`);
          if (cellAnchor >= 0) {
            const searchWindow = html.substring(cellAnchor, cellAnchor + 2000);
            const windowMatch = /VisualClassId[=:](\d+)/i.exec(searchWindow);
            if (windowMatch) {
              visualClassId = windowMatch[1];
            }
          }
        }
      }

      if (!visualClassId) {
        this.log.warn(`[BuildConstruction] No VisualClassId found for "${facilityClass}" — building dimensions will be unavailable`);
      }

      // Extract cost (e.g., "$140K") - handle both quoted and unquoted class
      const costMatch = /<div[^>]*class\s*=\s*["']?comment["']?[^>]*>\s*\$?([\d,]+\.?\d*)\s*([KM]?)/i.exec(cellContent);
      let cost = 0;
      if (costMatch) {
        const value = parseFloat(costMatch[1].replace(/,/g, ''));
        const multiplier = costMatch[2] === 'K' ? 1000 : costMatch[2] === 'M' ? 1000000 : 1;
        cost = value * multiplier;
      }

      // Extract area (e.g., "400 m.")
      const areaMatch = /([\d,]+)\s*m\./i.exec(cellContent);
      const area = areaMatch ? parseInt(areaMatch[1].replace(/,/g, ''), 10) : 0;

      // Extract description - handle both quoted and unquoted class
      const descMatch = /<div[^>]*class\s*=\s*["']?description["']?[^>]*>([^<]+)</i.exec(cellContent);
      const description = descMatch?.[1]?.trim() || '';

      // Extract zone requirement from zone image title
      const zoneMatch = /<img[^>]*src\s*=\s*["']?[^"']*zone[^"']*["']?[^>]*title\s*=\s*["']([^"']+)["']/i.exec(cellContent);
      const zoneRequirement = zoneMatch?.[1] || '';

      if (facilityClass && name) {
        const facility = {
          name,
          facilityClass,
          visualClassId,
          cost,
          area,
          description,
          zoneRequirement,
          iconPath: this.convertToProxyUrl(iconPath),
          available
        };

        this.log.debug(`[BuildConstruction] Parsed facility: ${facility.name} (${facility.facilityClass}) - $${facility.cost}, ${facility.area}m², available: ${facility.available}`);
        facilities.push(facility);
      } else {
        this.log.warn(`[BuildConstruction] Skipped facility - name: "${name}", facilityClass: "${facilityClass}"`);
      }
    }

    this.log.debug(`[BuildConstruction] Parsed ${facilities.length} facilities total`);
    return facilities;
  }

  /**
   * Place a new building via RDO NewFacility command
   */
  public async placeBuilding(
    facilityClass: string,
    x: number,
    y: number
  ): Promise<{ success: boolean; buildingId: string | null }> {
    if (!this.worldContextId) {
      throw new Error('Not logged into world - cannot place building');
    }
    if (!this.currentCompany) {
      throw new Error('No company selected - cannot place building');
    }

    const companyId = parseInt(this.currentCompany.id, 10);
    if (isNaN(companyId)) {
      throw new Error(`Invalid company ID: ${this.currentCompany.id}`);
    }

    this.log.debug(`[BuildConstruction] Placing ${facilityClass} at (${x}, ${y}) for company ${companyId}`);

    try {
      const packet = await this.sendRdoRequest('world', {
        verb: RdoVerb.SEL,
        targetId: this.worldContextId,
        action: RdoAction.CALL,
        member: 'NewFacility',
        separator: '"^"',
        args: [RdoValue.string(facilityClass).format(), RdoValue.int(companyId).format(), RdoValue.int(x).format(), RdoValue.int(y).format()]
      });

      // Parse response for result code
      const resultMatch = /res="#(\d+)"/.exec(packet.payload || '');
      const resultCode = resultMatch ? parseInt(resultMatch[1], 10) : -1;

      if (resultCode === 0) {
        // Extract new building ID if available
        const buildingIdMatch = /sel (\d+)/.exec(packet.payload || '');
        const buildingId = buildingIdMatch?.[1] || null;

        this.log.debug(`[BuildConstruction] Building placed successfully. ID: ${buildingId}`);
        return { success: true, buildingId };
      } else {
        this.log.warn(`[BuildConstruction] Building placement failed. Result code: ${resultCode}`);
        return { success: false, buildingId: null };
      }
    } catch (e) {
      this.log.error('[BuildConstruction] Failed to place building:', e);
      return { success: false, buildingId: null };
    }
  }

  /**
   * Place the Capitol building via RDO NewFacility command.
   * Capitol uses facilityClass "Capitol" and companyId 1 (hardcoded).
   * RDO: sel <worldContextId> call NewFacility "^" "%Capitol","#1","#x","#y"
   */
  public async placeCapitol(
    x: number,
    y: number
  ): Promise<{ success: boolean; buildingId: string | null }> {
    if (!this.worldContextId) {
      throw new Error('Not logged into world - cannot place Capitol');
    }

    this.log.debug(`[Capitol] Placing Capitol at (${x}, ${y})`);

    try {
      const packet = await this.sendRdoRequest('world', {
        verb: RdoVerb.SEL,
        targetId: this.worldContextId,
        action: RdoAction.CALL,
        member: 'NewFacility',
        separator: '"^"',
        args: [
          RdoValue.string('Capitol').format(),
          RdoValue.int(1).format(),
          RdoValue.int(x).format(),
          RdoValue.int(y).format(),
        ]
      });

      const resultMatch = /res="#(\d+)"/.exec(packet.payload || '');
      const resultCode = resultMatch ? parseInt(resultMatch[1], 10) : -1;

      if (resultCode === 0) {
        const buildingIdMatch = /sel (\d+)/.exec(packet.payload || '');
        const buildingId = buildingIdMatch?.[1] || null;
        this.log.debug(`[Capitol] Capitol placed successfully. ID: ${buildingId}`);
        return { success: true, buildingId };
      } else {
        this.log.warn(`[Capitol] Capitol placement failed. Result code: ${resultCode}`);
        return { success: false, buildingId: null };
      }
    } catch (e) {
      this.log.error('[Capitol] Failed to place Capitol:', e);
      return { success: false, buildingId: null };
    }
  }

  // =============================================================================
  // BUILDING DETAILS FEATURE
  // =============================================================================

  /**
   * Get detailed building properties based on template
   * Fetches all properties defined in the building's template
   */
  public async getBuildingDetails(
    x: number,
    y: number,
    visualClass: string
  ): Promise<BuildingDetailsResponse> {
    this.log.debug(`[BuildingDetails] Fetching details for building at (${x}, ${y}), visualClass: ${visualClass}`);

    // Get template for this building type
    const template = getTemplateForVisualClass(visualClass);
    this.log.debug(`[BuildingDetails] Using template: ${template.name}`);

    // First, get basic building info via focusBuilding (this always works)
    let buildingName = '';
    let ownerName = '';
    let buildingId = '';
    try {
      const focusInfo = await this.focusBuilding(x, y);
      buildingName = focusInfo.buildingName;
      ownerName = focusInfo.ownerName;
      buildingId = focusInfo.buildingId;
      this.log.debug(`[BuildingDetails] Focus info: name="${buildingName}", owner="${ownerName}"`);
    } catch (e) {
      this.log.warn(`[BuildingDetails] Could not focus building:`, e);
    }

    // Connect to map service
    await this.connectMapService();
    if (!this.cacherId) {
      throw new Error('Map service not initialized');
    }

    // Create temporary object for property queries
    const tempObjectId = await this.cacherCreateObject();

    try {
      // Set object to the building coordinates
      await this.cacherSetObject(tempObjectId, x, y);

      // Collect property names with structured output for two-phase fetching
      const collected = collectTemplatePropertyNamesStructured(template);
      const allValues = new Map<string, string>();
      const BATCH_SIZE = 50;

      // Phase 1: Fetch regular properties and count properties
      const phase1Props = [...collected.regularProperties, ...collected.countProperties];

      for (let i = 0; i < phase1Props.length; i += BATCH_SIZE) {
        const batch = phase1Props.slice(i, i + BATCH_SIZE);
        const values = await this.cacherGetPropertyList(tempObjectId, batch);

        for (let j = 0; j < batch.length; j++) {
          const value = j < values.length ? values[j] : '';
          // Allow empty strings — server returns '' for unset properties (e.g. blank Name field)
          if (value !== 'error') {
            allValues.set(batch[j], value);
          }
        }
      }

      // Phase 2: Fetch indexed properties based on count values
		const indexedProps: string[] = [];
		const countValues = new Map<string, number>();

		for (const countProp of collected.countProperties) {
		  const countStr = allValues.get(countProp);
		  const count = countStr ? parseInt(countStr, 10) : 0;
		  countValues.set(countProp, count);
		  this.log.debug(`[BuildingDetails] Count: ${countProp} = "${countStr}" (parsed: ${count})`);

		  // Build indexed property names based on actual count
		  const indexedDefs = collected.indexedByCount.get(countProp) || [];
		  for (const def of indexedDefs) {
			const suffix = def.indexSuffix || '';

			if (def.columns) {
			  // TABLE type: columns loop generates all needed property names
			  // (skip base rdoName to avoid duplicates when a column rdoSuffix matches it)
			  for (const col of def.columns) {
				const colSuffix = col.indexSuffix !== undefined ? col.indexSuffix : suffix;
				for (let idx = 0; idx < count; idx++) {
				  indexedProps.push(`${col.rdoSuffix}${idx}${col.columnSuffix || ''}${colSuffix}`);
				}
			  }
			} else {
			  // Non-TABLE indexed property
			  for (let idx = 0; idx < count; idx++) {
				indexedProps.push(`${def.rdoName}${idx}${suffix}`);
				if (def.maxProperty) {
				  indexedProps.push(`${def.maxProperty}${idx}${suffix}`);
				}
			  }
			}
		  }
		}

      // Fetch indexed properties
      if (indexedProps.length > 0) {
        this.log.debug(`[BuildingDetails] Fetching ${indexedProps.length} indexed properties: ${indexedProps.slice(0, 20).join(', ')}${indexedProps.length > 20 ? '...' : ''}`);
        for (let i = 0; i < indexedProps.length; i += BATCH_SIZE) {
          const batch = indexedProps.slice(i, i + BATCH_SIZE);
          const values = await this.cacherGetPropertyList(tempObjectId, batch);

          for (let j = 0; j < batch.length; j++) {
            const value = j < values.length ? values[j] : '';
            // Allow empty strings — server returns '' for unset properties (e.g. blank Name field)
            if (value !== 'error') {
              allValues.set(batch[j], value);
              // Log TABLE column values for debugging (srvNames/srvPrices/etc.)
              if (batch[j].startsWith('srv')) {
                this.log.debug(`[BuildingDetails] TABLE: ${batch[j]} = "${value}"`);
              }
            }
          }
        }
      }

      // Build response grouped by tabs
      // Build response grouped by tabs
		const groups: { [groupId: string]: BuildingPropertyValue[] } = {};

		for (const group of template.groups) {
		  const groupValues: BuildingPropertyValue[] = [];
		  const includedCountProps = new Set<string>();

		  for (const prop of group.properties) {
			const suffix = prop.indexSuffix || '';

			// Handle WORKFORCE_TABLE type specially
			if (prop.type === 'WORKFORCE_TABLE') {
			  // Add all workforce properties for 3 worker classes (0, 1, 2)
			  for (let i = 0; i < 3; i++) {
				const workerProps = [
				  `Workers${i}`,
				  `WorkersMax${i}`,
				  `WorkersK${i}`,
				  `Salaries${i}`,
				  `WorkForcePrice${i}`,
				];

				for (const propName of workerProps) {
				  const value = allValues.get(propName);
				  if (value) {
					groupValues.push({
					  name: propName,
					  value: value,
					  index: i,
					});
				  }
				}
			  }
			  continue;
			}

			if ((prop.type === 'TABLE' || prop.type === 'SERVICE_CARDS') && prop.columns && prop.countProperty) {
			  // TABLE/SERVICE_CARDS type: include count + individual column values grouped by row index
			  const count = countValues.get(prop.countProperty) || 0;
			  // Include the count property so the client renderer knows how many rows to render
			  const countVal = allValues.get(prop.countProperty);
			  if (countVal) {
				groupValues.push({ name: prop.countProperty, value: countVal });
			  }
			  for (let idx = 0; idx < count; idx++) {
				for (const col of prop.columns) {
				  const colSuffix = col.indexSuffix !== undefined ? col.indexSuffix : suffix;
				  const colName = `${col.rdoSuffix}${idx}${col.columnSuffix || ''}${colSuffix}`;
				  const colValue = allValues.get(colName);
				  if (colValue) {
					groupValues.push({
					  name: colName,
					  value: colValue,
					  index: idx,
					});
				  }
				}
			  }
			} else if (prop.indexed && prop.countProperty) {
			  // Handle indexed properties using the count value
			  const count = countValues.get(prop.countProperty) || 0;

			  // Include the count property so the client knows how many items exist
			  if (!includedCountProps.has(prop.countProperty)) {
				includedCountProps.add(prop.countProperty);
				const countVal = allValues.get(prop.countProperty);
				if (countVal) {
				  groupValues.push({ name: prop.countProperty, value: countVal });
				}
			  }

			  for (let idx = 0; idx < count; idx++) {
				const propName = `${prop.rdoName}${idx}${suffix}`;
				const value = allValues.get(propName);

				if (value) {
				  groupValues.push({
					name: propName,
					value: value,
					index: idx,
				  });
				}

				// Also get max property if defined
				if (prop.maxProperty) {
				  const maxPropName = `${prop.maxProperty}${idx}${suffix}`;
				  const maxValue = allValues.get(maxPropName);
				  if (maxValue) {
					groupValues.push({
					  name: maxPropName,
					  value: maxValue,
					  index: idx,
					});
				  }
				}
			  }
			} else if (prop.indexed) {
			  // Indexed without count property - use fixed range (0-9)
			  for (let idx = 0; idx < 10; idx++) {
				const propName = `${prop.rdoName}${idx}${suffix}`;
				const value = allValues.get(propName);
				
				if (value) {
				  groupValues.push({
					name: propName,
					value: value,
					index: idx,
				  });
				  
				  if (prop.maxProperty) {
					const maxPropName = `${prop.maxProperty}${idx}${suffix}`;
					const maxValue = allValues.get(maxPropName);
					if (maxValue) {
					  groupValues.push({
						name: maxPropName,
						value: maxValue,
						index: idx,
					  });
					}
				  }
				}
			  }
			} else {
            // Regular property
            const value = allValues.get(prop.rdoName);
            if (value) {
              groupValues.push({
                name: prop.rdoName,
                value: value,
              });

              // Also get max property if defined
              if (prop.maxProperty) {
                const maxValue = allValues.get(prop.maxProperty);
                if (maxValue) {
                  groupValues.push({
                    name: prop.maxProperty,
                    value: maxValue,
                  });
                }
              }
            }
          }
        }

        if (groupValues.length > 0) {
          groups[group.id] = groupValues;
        }
      }

      // Parse money graph if available
      let moneyGraph: number[] | undefined;
      const moneyGraphInfo = allValues.get('MoneyGraphInfo');
      if (moneyGraphInfo) {
        moneyGraph = this.parseMoneyGraph(moneyGraphInfo);
      }

      // Fetch supply data if this template has supplies group
      let supplies: BuildingSupplyData[] | undefined;
      const suppliesGroup = template.groups.find(g => g.special === 'supplies');
      if (suppliesGroup) {
        supplies = await this.fetchBuildingSupplies(tempObjectId, x, y);
      }

      // Fetch product/output data if this template has products group
      let products: BuildingProductData[] | undefined;
      const productsGroup = template.groups.find(g => g.special === 'products');
      if (productsGroup) {
        products = await this.fetchBuildingProducts(tempObjectId, x, y);
      }

      // Fetch company input data (eager — cInputCount + indexed cInput{i}.* properties)
      let compInputs: CompInputData[] | undefined;
      const compInputsGroup = template.groups.find(g => g.special === 'compInputs');
      if (compInputsGroup) {
        compInputs = await this.fetchCompInputData(tempObjectId);
      }

      const response: BuildingDetailsResponse = {
        buildingId: buildingId || allValues.get('ObjectId') || allValues.get('CurrBlock') || '',
        x,
        y,
        visualClass,
        templateName: template.name,
        buildingName,
        ownerName,
        securityId: allValues.get('SecurityId') || '',
        tabs: template.groups.map(g => ({
          id: g.id,
          name: g.name,
          icon: g.icon || '',
          order: g.order,
          special: g.special,
          handlerName: g.handlerName || '',
        })),
        groups,
        supplies,
        products,
        compInputs,
        moneyGraph,
        timestamp: Date.now(),
      };

      return response;

    } finally {
      // Clean up temporary object
      await this.cacherCloseObject(tempObjectId);
    }
  }

  /**
   * Parse MoneyGraphInfo into array of numbers
   * Format: "count,val1,val2,val3,..."
   */
  private parseMoneyGraph(graphInfo: string): number[] {
    const parts = graphInfo.split(',');
    if (parts.length < 2) return [];

    const values: number[] = [];
    // Skip first value (count), parse rest as numbers
    for (let i = 1; i < parts.length; i++) {
      const num = parseFloat(parts[i]);
      if (!isNaN(num)) {
        values.push(num);
      }
    }

    return values;
  }

  /**
   * Fetch supply/input data with connections for a building
   * Uses GetInputNames and SetPath to navigate supply structure
   */
  private async fetchBuildingSupplies(
    tempObjectId: string,
    x: number,
    y: number
  ): Promise<BuildingSupplyData[]> {
    const supplies: BuildingSupplyData[] = [];

    try {
      // Get input names
      const inputNamesPacket = await this.sendRdoRequest('map', {
        verb: RdoVerb.SEL,
        targetId: tempObjectId,
        action: RdoAction.CALL,
        member: 'GetInputNames',
        args: ['0', '0'], // index=0, language=0 (English)
      });

      const inputNamesRaw = cleanPayloadHelper(inputNamesPacket.payload || '');
      if (!inputNamesRaw || inputNamesRaw === '0' || inputNamesRaw === '-1') {
        return supplies;
      }

      // Parse input names (format: "path::\nname\r\n" separated entries)
      // split('\r') then trim() strips leading '\n' from entries 2+ (CRLF separators)
      const entries = inputNamesRaw.split('\r').map(e => e.trim()).filter(Boolean);

      for (const entry of entries) {
        const colonIdx = entry.indexOf(':');
        if (colonIdx === -1) continue;

        const path = entry.substring(0, colonIdx);
        // Skip 2 chars after colon, then read name until null
        let name = entry.substring(colonIdx + 3);
        const nullIdx = name.indexOf('\0');
        if (nullIdx !== -1) {
          name = name.substring(0, nullIdx);
        }

        // Create new temp object for this supply path
        const supplyTempId = await this.cacherCreateObject();

        try {
          // Position object at building coordinates first (required for SetPath to work)
          await this.cacherSetObject(supplyTempId, x, y);

          // Navigate to supply path
          const setPathPacket = await this.sendRdoRequest('map', {
            verb: RdoVerb.SEL,
            targetId: supplyTempId,
            action: RdoAction.CALL,
            member: 'SetPath',
            args: [path],
          });

          const setPathResult = cleanPayloadHelper(setPathPacket.payload || '');
          this.log.debug(`[BuildingDetails] SetPath('${path}') result: "${setPathResult}"`);
          if (setPathResult === '-1') {
            // Successfully navigated (-1 = Delphi WordBool TRUE), now get properties
            const supplyProps = await this.cacherGetPropertyList(supplyTempId, [
              'MetaFluid', 'FluidValue', 'LastCostPerc', 'minK', 'MaxPrice',
              'QPSorted', 'SortMode', 'cnxCount', 'ObjectId'
            ]);

            const connectionCount = parseInt(supplyProps[7] || '0', 10);
            const connections: BuildingConnectionData[] = [];

            // Fetch connection details
            for (let i = 0; i < connectionCount && i < 20; i++) {
              const cnxProps = await this.fetchSubObjectProperties(supplyTempId, i, [
                `cnxFacilityName${i}`,
                `cnxCreatedBy${i}`,
                `cnxCompanyName${i}`,
                `cnxNfPrice${i}`,
                `OverPriceCnxInfo${i}`,
                `LastValueCnxInfo${i}`,
                `tCostCnxInfo${i}`,
                `cnxQuality${i}`,
                `ConnectedCnxInfo${i}`,
                `cnxXPos${i}`,
                `cnxYPos${i}`,
              ]);

              if (cnxProps.length >= 11) {
                connections.push({
                  facilityName: cnxProps[0] || '',
                  createdBy: cnxProps[1] || '',
                  companyName: cnxProps[2] || '',
                  price: cnxProps[3] || '0',
                  overprice: cnxProps[4] || '0',
                  lastValue: cnxProps[5] || '',
                  cost: cnxProps[6] || '$0',
                  quality: cnxProps[7] || '0%',
                  connected: cnxProps[8] === '1',
                  x: parseInt(cnxProps[9] || '0', 10),
                  y: parseInt(cnxProps[10] || '0', 10),
                });
              }
            }

            supplies.push({
              path,
              name,
              metaFluid: supplyProps[0] || '',
              fluidValue: supplyProps[1] || '',
              lastCostPerc: supplyProps[2] || undefined,
              minK: supplyProps[3] || undefined,
              maxPrice: supplyProps[4] || undefined,
              qpSorted: supplyProps[5] || undefined,
              sortMode: supplyProps[6] || undefined,
              connectionCount,
              connections,
            });
          }
        } finally {
          await this.cacherCloseObject(supplyTempId);
        }
      }
    } catch (e) {
      this.log.warn('[BuildingDetails] Error fetching supplies:', e);
    }

    return supplies;
  }

  /**
   * Fetch company input data (compInputs tab).
   * Protocol: GetPropertyList cInputCount → batch GetPropertyList cInput{i}.* for all inputs.
   * Handler: compInputs (CompanyServicesSheetForm.pas)
   *
   * Wire format:
   *   C sel <id> call GetPropertyList "^" "%...\tcInputCount\t";
   *   C sel <id> call GetPropertyList "^" "%cInput0.0\tcInputSup0\tcInputDem0\tcInputRatio0\tcInputMax0\tcEditable0\tcUnits0.0\t...";
   */
  private async fetchCompInputData(tempObjectId: string): Promise<CompInputData[]> {
    const result: CompInputData[] = [];

    try {
      // Step 1: get count
      const countProps = await this.cacherGetPropertyList(tempObjectId, ['cInputCount']);
      const count = parseInt(countProps[0] || '0', 10);
      if (count <= 0) return result;

      // Step 2: batch all 7 indexed properties per input (max 50 props per batch = ~7 inputs)
      const BATCH_SIZE = 49; // keep under 50-prop limit
      const propNames: string[] = [];
      for (let i = 0; i < count; i++) {
        propNames.push(
          `cInput${i}.0`,
          `cInputSup${i}`,
          `cInputDem${i}`,
          `cInputRatio${i}`,
          `cInputMax${i}`,
          `cEditable${i}`,
          `cUnits${i}.0`,
        );
      }

      // Fetch in batches of BATCH_SIZE properties
      const allValues: string[] = [];
      for (let offset = 0; offset < propNames.length; offset += BATCH_SIZE) {
        const batch = propNames.slice(offset, offset + BATCH_SIZE);
        const vals = await this.cacherGetPropertyList(tempObjectId, batch);
        allValues.push(...vals);
      }

      // Step 3: parse into CompInputData objects (7 props per input)
      for (let i = 0; i < count; i++) {
        const base = i * 7;
        result.push({
          name:      allValues[base]     ?? '',
          supplied:  parseFloat(allValues[base + 1] || '0'),
          demanded:  parseFloat(allValues[base + 2] || '0'),
          ratio:     parseInt(allValues[base + 3]   || '0', 10),
          maxDemand: parseInt(allValues[base + 4]   || '100', 10),
          editable:  (allValues[base + 5] ?? '').toLowerCase() === 'yes',
          units:     allValues[base + 6] ?? '',
        });
      }
    } catch (e) {
      this.log.warn('[BuildingDetails] Error fetching comp input data:', e);
    }

    return result;
  }

  /**
   * Fetch product/output data with connections for a building
   * Uses GetOutputNames and SetPath to navigate output gate structure
   * Mirror of fetchBuildingSupplies() but for output gates (ProdSheetForm.pas)
   *
   * Output gate properties: MetaFluid, LastFluid, FluidQuality, PricePc, AvgPrice, MarketPrice, cnxCount
   * Per-connection: cnxFacilityName, cnxCompanyName, LastValueCnxInfo, ConnectedCnxInfo, tCostCnxInfo, cnxXPos, cnxYPos
   */
  private async fetchBuildingProducts(
    tempObjectId: string,
    x: number,
    y: number
  ): Promise<BuildingProductData[]> {
    const products: BuildingProductData[] = [];

    try {
      // Get output names (same RDO pattern as GetInputNames but for outputs)
      const outputNamesPacket = await this.sendRdoRequest('map', {
        verb: RdoVerb.SEL,
        targetId: tempObjectId,
        action: RdoAction.CALL,
        member: 'GetOutputNames',
        args: ['0', '0'], // index=0, language=0 (English)
      });

      const outputNamesRaw = cleanPayloadHelper(outputNamesPacket.payload || '');
      if (!outputNamesRaw || outputNamesRaw === '0' || outputNamesRaw === '-1') {
        return products;
      }

      // Parse output names (format: "path::\nname\r\n" separated entries — same as inputs)
      // split('\r') then trim() strips leading '\n' from entries 2+ (CRLF separators)
      const entries = outputNamesRaw.split('\r').map(e => e.trim()).filter(Boolean);

      for (const entry of entries) {
        const colonIdx = entry.indexOf(':');
        if (colonIdx === -1) continue;

        const path = entry.substring(0, colonIdx);
        // Skip 2 chars after colon (:: separator), then read name until null
        let name = entry.substring(colonIdx + 3);
        const nullIdx = name.indexOf('\0');
        if (nullIdx !== -1) {
          name = name.substring(0, nullIdx);
        }

        // Create new temp object for this output path
        const productTempId = await this.cacherCreateObject();

        try {
          // Position object at building coordinates first (required for SetPath to work)
          await this.cacherSetObject(productTempId, x, y);

          // Navigate to output path
          const setPathPacket = await this.sendRdoRequest('map', {
            verb: RdoVerb.SEL,
            targetId: productTempId,
            action: RdoAction.CALL,
            member: 'SetPath',
            args: [path],
          });

          const setPathResult = cleanPayloadHelper(setPathPacket.payload || '');
          this.log.debug(`[BuildingDetails] Product SetPath('${path}') result: "${setPathResult}"`);
          if (setPathResult === '-1') {
            // Successfully navigated (-1 = Delphi WordBool TRUE) — fetch output gate properties
            const outputProps = await this.cacherGetPropertyList(productTempId, [
              'MetaFluid', 'LastFluid', 'FluidQuality', 'PricePc',
              'AvgPrice', 'MarketPrice', 'cnxCount'
            ]);

            const connectionCount = parseInt(outputProps[6] || '0', 10);
            const connections: BuildingConnectionData[] = [];

            // Fetch connection details (clients/buyers of this output)
            for (let i = 0; i < connectionCount && i < 20; i++) {
              const cnxProps = await this.fetchSubObjectProperties(productTempId, i, [
                `cnxFacilityName${i}`,
                `cnxCompanyName${i}`,
                `LastValueCnxInfo${i}`,
                `ConnectedCnxInfo${i}`,
                `tCostCnxInfo${i}`,
                `cnxXPos${i}`,
                `cnxYPos${i}`,
              ]);

              if (cnxProps.length >= 7) {
                connections.push({
                  facilityName: cnxProps[0] || '',
                  companyName: cnxProps[1] || '',
                  createdBy: '',
                  price: '',
                  overprice: '',
                  lastValue: cnxProps[2] || '',
                  cost: cnxProps[4] || '',
                  quality: '',
                  connected: cnxProps[3] === '1',
                  x: parseInt(cnxProps[5] || '0', 10),
                  y: parseInt(cnxProps[6] || '0', 10),
                });
              }
            }

            products.push({
              path,
              name,
              metaFluid: outputProps[0] || '',
              lastFluid: outputProps[1] || '',
              quality: outputProps[2] || '',
              pricePc: outputProps[3] || '',
              avgPrice: outputProps[4] || '',
              marketPrice: outputProps[5] || '',
              connectionCount,
              connections,
            });
          }
        } finally {
          await this.cacherCloseObject(productTempId);
        }
      }
    } catch (e) {
      this.log.warn('[BuildingDetails] Error fetching products:', e);
    }

    return products;
  }

  /**
   * Fetch sub-object properties (for indexed connections)
   */
  private async fetchSubObjectProperties(
    tempObjectId: string,
    subIndex: number,
    propertyNames: string[]
  ): Promise<string[]> {
    try {
      const query = propertyNames.join('\t') + '\t';
      const packet = await this.sendRdoRequest('map', {
        verb: RdoVerb.SEL,
        targetId: tempObjectId,
        action: RdoAction.CALL,
        member: 'GetSubObjectProps',
        args: [subIndex.toString(), query],
      });

      const raw = cleanPayloadHelper(packet.payload || '');
      if (raw.includes('\t')) {
        return raw.split('\t').map(v => v.trim());
      }
      return raw.split(/\s+/).map(v => v.trim()).filter(v => v.length > 0);
    } catch (e) {
      this.log.warn(`[BuildingDetails] Error fetching sub-object ${subIndex}:`, e);
      return [];
    }
  }

  /**
   * Set a building property value
   * Used for editable properties like salaries, prices, input demands, etc.
   *
   * RDO Command Formats:
   * - RDOSetPrice: 2 args -> index of srvPrices (e.g., #0), new value
   * - RDOSetSalaries: 3 args -> Salaries0 value, Salaries1 value, Salaries2 value
   * - RDOSetCompanyInputDemand: 2 args -> index of cInput, new ratio (cInputDem * 100 / cInputMax) without %
   * - RDOSetInputMaxPrice: 2 args -> MetaFluid value, new MaxPrice value
   * - RDOSetInputMinK: 2 args -> MetaFluid value, new minK value
   *
   * Note: CurrBlock is the building's block ID, NOT the worldId
   */
  public async setBuildingProperty(
    x: number,
    y: number,
    propertyName: string,
    value: string,
    additionalParams?: Record<string, string>
  ): Promise<{ success: boolean; newValue: string }> {
    this.log.debug(`[BuildingDetails] Setting ${propertyName}=${value} at (${x}, ${y})`);

    try {
      // Connect to construction service (establishes worldId and RDOLogonClient)
      await this.connectConstructionService();
      if (!this.worldId) {
        throw new Error('Construction service not initialized - worldId is null');
      }

      // Get the building's CurrBlock ID via map service
      await this.connectMapService();
      const tempObjectId = await this.cacherCreateObject();
      let currBlock: string;

      try {
        await this.cacherSetObject(tempObjectId, x, y);
        const values = await this.cacherGetPropertyList(tempObjectId, ['CurrBlock']);
        currBlock = values[0];

        if (!currBlock) {
          throw new Error(`No CurrBlock found for building at (${x}, ${y})`);
        }

        this.log.debug(`[BuildingDetails] Found CurrBlock: ${currBlock} for building at (${x}, ${y})`);
      } finally {
        await this.cacherCloseObject(tempObjectId);
      }

      // For RDOSetTaxValue, resolve row index → actual TaxId from building properties
      // Voyager: TownTaxesSheet.pas — TaxId comes from Tax[idx].Id, not the row index
      if (propertyName === 'RDOSetTaxValue' && additionalParams?.index && !additionalParams.taxId) {
        const lookupObjectId = await this.cacherCreateObject();
        try {
          await this.cacherSetObject(lookupObjectId, x, y);
          const taxIdProp = `Tax${additionalParams.index}Id`;
          const [taxId] = await this.cacherGetPropertyList(lookupObjectId, [taxIdProp]);
          if (taxId) {
            additionalParams.taxId = taxId;
            this.log.debug(`[BuildingDetails] Resolved ${taxIdProp}=${taxId} for RDOSetTaxValue`);
          }
        } finally {
          await this.cacherCloseObject(lookupObjectId);
        }
      }

      // Build the RDO command arguments based on the command type
      const rdoArgs = this.buildRdoCommandArgs(propertyName, value, additionalParams);

      // Send SetProperty command via construction service
      // The sel on CurrBlock is persistent (no closure needed)
      let setCmd: string;
      if (propertyName === 'property' && additionalParams?.propertyName) {
        // Direct property set: use SET verb
        const actualPropName = additionalParams.propertyName;
        setCmd = RdoCommand.sel(currBlock)
          .set(actualPropName)
          .args(...rdoArgs)
          .build();
      } else {
        // RDO method call: use CALL verb, fire-and-forget (no RID).
        // Functions (olevariant return) use "^" separator; procedures (void) use "*".
        const RDO_FUNCTIONS: ReadonlySet<string> = new Set([
          'RDOSetOutputPrice', 'RDOSetInputOverPrice', 'RDOSetInputMaxPrice', 'RDOSetInputMinK',
          'RDOConnectInput', 'RDODisconnectInput', 'RDOConnectOutput', 'RDODisconnectOutput',
          'RDOConnectToTycoon', 'RDODisconnectFromTycoon',
        ]);
        const builder = RdoCommand.sel(currBlock).call(propertyName);
        if (RDO_FUNCTIONS.has(propertyName)) {
          builder.method(); // "^" — function returning olevariant
        } else {
          builder.push();   // "*" — void procedure
        }
        setCmd = builder.args(...rdoArgs).build();
      }
      const socket = this.sockets.get('construction');
      if (!socket) throw new Error('Construction socket unavailable');
      socket.write(setCmd);
      this.log.debug(`[BuildingDetails] Sent: ${setCmd}`);

      // Wait for server to process the command
      await new Promise(resolve => setTimeout(resolve, 200));

      // Read back the new value via map service to confirm the change
      const verifyObjectId = await this.cacherCreateObject();
      try {
        await this.cacherSetObject(verifyObjectId, x, y);

        // Extract property name from RDO command for verification
        const propertyToRead = this.mapRdoCommandToPropertyName(propertyName, additionalParams);
        const readValues = await this.cacherGetPropertyList(verifyObjectId, [propertyToRead]);
        const newValue = readValues[0] || value;

        this.log.debug(`[BuildingDetails] Property ${propertyName} updated successfully to ${newValue}`);
        return { success: true, newValue };
      } finally {
        await this.cacherCloseObject(verifyObjectId);
      }

    } catch (e) {
      this.log.error(`[BuildingDetails] Failed to set property:`, e);
      return { success: false, newValue: '' };
    }
  }

  /**
   * Build RDO command arguments based on command type
   * Uses RdoValue for type-safe argument formatting
   *
   * Examples:
   * - RDOSetPrice(index=0, value=220) -> "#0","#220"
   * - RDOSetSalaries(sal0=100, sal1=120, sal2=150) -> "#100","#120","#150"
   * - RDOSetCompanyInputDemand(index=0, ratio=75) -> "#0","#75"
   * - RDOSetInputMaxPrice(metaFluid=5, maxPrice=500) -> "#5","#500"
   * - RDOSetInputMinK(metaFluid=5, minK=10) -> "#5","#10"
   */
  private buildRdoCommandArgs(
    rdoCommand: string,
    value: string,
    additionalParams?: Record<string, string>
  ): RdoValue[] {
    const params = additionalParams || {};
    const args: RdoValue[] = [];

    switch (rdoCommand) {
      case 'RDOSetPrice': {
        // Args: index of srvPrices (e.g., #0), new value
        const index = parseInt(params.index || '0', 10);
        const price = parseInt(value, 10);
        args.push(RdoValue.int(index), RdoValue.int(price));
        break;
      }

      case 'RDOSetSalaries': {
        // Args: Salaries0, Salaries1, Salaries2 (all 3 values required)
        const sal0 = parseInt(params.salary0 || value, 10);
        const sal1 = parseInt(params.salary1 || value, 10);
        const sal2 = parseInt(params.salary2 || value, 10);
        args.push(RdoValue.int(sal0), RdoValue.int(sal1), RdoValue.int(sal2));
        break;
      }

      case 'RDOSetCompanyInputDemand': {
        // Args: index of cInput, new ratio (cInputDem * 100 / cInputMax) without %
        const index = parseInt(params.index || '0', 10);
        const ratio = parseInt(value, 10);
        args.push(RdoValue.int(index), RdoValue.int(ratio));
        break;
      }

      case 'RDOSetInputMaxPrice': {
        // Args: MetaFluid (WideString), new MaxPrice value (integer)
        // Voyager: SupplySheetForm.pas — Proxy.RDOSetInputMaxPrice(fCurrFluidId, maxPrice)
        const fluidId = params.fluidId || params.metaFluid;
        if (!fluidId) {
          throw new Error('RDOSetInputMaxPrice requires fluidId parameter');
        }
        args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOSetInputMinK': {
        // Args: MetaFluid (WideString), new minK value (integer)
        // Voyager: SupplySheetForm.pas — Proxy.RDOSetInputMinK(fCurrFluidId, minK)
        const fluidId = params.fluidId || params.metaFluid;
        if (!fluidId) {
          throw new Error('RDOSetInputMinK requires fluidId parameter');
        }
        args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOSetTradeLevel':
      case 'RDOSetRole':
      case 'RDOSetLoanPerc': {
        // Single integer argument
        args.push(RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOSetTaxValue': {
        // Args: TaxId (integer), percentage (widestring)
        // Voyager: TownTaxesSheet.pas — MSProxy.RDOSetTaxValue(TaxId, valueString)
        // TaxId is the actual tax identifier (100, 110, 120...), resolved from Tax{idx}Id
        const taxId = parseInt(params.taxId || params.index || '0', 10);
        args.push(RdoValue.int(taxId), RdoValue.string(value));
        break;
      }

      case 'RDOAutoProduce':
      case 'RDOAutoRelease': {
        // Boolean as WordBool (#-1 = true, #0 = false)
        const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
        args.push(RdoValue.int(boolVal));
        break;
      }

      case 'RDOSetOutputPrice': {
        // Args: fluidId (widestring), price (integer)
        // Voyager: ProdSheetForm.pas line 567 — Proxy.RDOSetOutputPrice(fCurrFluidId, price)
        const fluidId = params.fluidId;
        if (!fluidId) {
          throw new Error('RDOSetOutputPrice requires fluidId parameter');
        }
        args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOConnectInput':
      case 'RDODisconnectInput': {
        // Args: fluidId (widestring), connectionList (widestring "x1,y1,x2,y2,...")
        // Voyager: SupplySheetForm.pas line 295/418
        const fluidId = params.fluidId;
        const connectionList = params.connectionList;
        if (!fluidId || !connectionList) {
          throw new Error(`${rdoCommand} requires fluidId and connectionList parameters`);
        }
        args.push(RdoValue.string(fluidId), RdoValue.string(connectionList));
        break;
      }

      case 'RDOConnectOutput':
      case 'RDODisconnectOutput': {
        // Args: fluidId (widestring), connectionList (widestring "x1,y1,x2,y2,...")
        // Voyager: ProdSheetForm.pas line 265/363
        const fluidId = params.fluidId;
        const connectionList = params.connectionList;
        if (!fluidId || !connectionList) {
          throw new Error(`${rdoCommand} requires fluidId and connectionList parameters`);
        }
        args.push(RdoValue.string(fluidId), RdoValue.string(connectionList));
        break;
      }

      case 'RDOSetInputOverPrice': {
        // Args: fluidId (widestring), index (integer), overprice (integer)
        // Voyager: SupplySheetForm.pas line 435
        const fluidId = params.fluidId;
        const index = params.index;
        if (!fluidId || index === undefined) {
          throw new Error('RDOSetInputOverPrice requires fluidId and index parameters');
        }
        args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(index, 10)), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOSetInputSortMode': {
        // Args: fluidId (widestring), mode (integer: 0=cost, 1=quality)
        // Voyager: SupplySheetForm.pas line 722
        const fluidId = params.fluidId;
        if (!fluidId) {
          throw new Error('RDOSetInputSortMode requires fluidId parameter');
        }
        args.push(RdoValue.string(fluidId), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOSelSelected': {
        // Args: boolean as WordBool (#-1 = true, #0 = false)
        // Voyager: SupplySheetForm.pas line 699
        const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
        args.push(RdoValue.int(boolVal));
        break;
      }

      case 'RDOSetBuyingStatus': {
        // Args: fingerIndex (integer), boolean as WordBool
        // Voyager: SupplySheetForm.pas line 741
        const fingerIndex = params.fingerIndex;
        if (fingerIndex === undefined) {
          throw new Error('RDOSetBuyingStatus requires fingerIndex parameter');
        }
        const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
        args.push(RdoValue.int(parseInt(fingerIndex, 10)), RdoValue.int(boolVal));
        break;
      }

      case 'RDOConnectToTycoon':
      case 'RDODisconnectFromTycoon': {
        // Args: tycoonId (integer), kind (integer), flag (wordbool = true)
        // Voyager: IndustryGeneralSheet.pas line 345/357
        // tycoonId auto-injected from session if not provided by client
        const tycoonId = params.tycoonId || this.tycoonId;
        const kind = params.kind;
        if (!tycoonId || !kind) {
          throw new Error(`${rdoCommand} requires kind parameter (and tycoonId must be available)`);
        }
        args.push(RdoValue.int(parseInt(tycoonId, 10)), RdoValue.int(parseInt(kind, 10)), RdoValue.int(-1));
        break;
      }

      case 'RDOAcceptCloning': {
        // Args: boolean as WordBool (#-1 = true, #0 = false)
        // Voyager: ManagementSheet.pas — toggle cloning acceptance
        const boolVal = parseInt(value, 10) !== 0 ? -1 : 0;
        args.push(RdoValue.int(boolVal));
        break;
      }

      case 'CloneFacility': {
        // Args: x (integer), y (integer), limitToTown (integer), limitToCompany (integer), tycoonId (integer)
        // Voyager: TClientView.CloneFacility — doc/spo-original-reference.md:297
        const cloneX = params.x;
        const cloneY = params.y;
        const limitToTown = params.limitToTown || '0';
        const limitToCompany = params.limitToCompany || '0';
        const cloneTycoonId = params.tycoonId || '0';
        if (!cloneX || !cloneY) {
          throw new Error('CloneFacility requires x and y parameters');
        }
        args.push(
          RdoValue.int(parseInt(cloneX, 10)),
          RdoValue.int(parseInt(cloneY, 10)),
          RdoValue.int(parseInt(limitToTown, 10)),
          RdoValue.int(parseInt(limitToCompany, 10)),
          RdoValue.int(parseInt(cloneTycoonId, 10))
        );
        break;
      }

      case 'RDOSetMinSalaryValue': {
        // Args: levelIndex (integer: 0=hi, 1=mid, 2=lo), value (integer)
        // Voyager: TownHallJobsSheet.pas — Proxy.RDOSetMinSalaryValue(Sender.Tag, Value)
        const levelIndex = params.levelIndex || '0';
        args.push(RdoValue.int(parseInt(levelIndex, 10)), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOLaunchMovie': {
        // Args: name (widestring), budget (double), months (integer), autoInfo (word bitmask)
        // MovieStudios.pas — flgAutoRelease=$01 (bit0), flgAutoProduce=$02 (bit1)
        const filmName = params.filmName || '';
        const budget = params.budget || '1000000';
        const months = params.months || '12';
        const autoRelBit = parseInt(params.autoRel || '0', 10) !== 0 ? 1 : 0;
        const autoProdBit = parseInt(params.autoProd || '0', 10) !== 0 ? 1 : 0;
        const autoInfo = autoRelBit | (autoProdBit << 1);
        args.push(
          RdoValue.string(filmName),
          RdoValue.double(parseFloat(budget)),
          RdoValue.int(parseInt(months, 10)),
          RdoValue.int(autoInfo)
        );
        break;
      }

      case 'RDOCancelMovie':
      case 'RDOReleaseMovie': {
        // Args: dummy integer (always 0)
        // Voyager: FilmsSheet.pas lines 330/350 — Proxy.RDOCancelMovie(0) / RDOReleaseMovie(0)
        args.push(RdoValue.int(0));
        break;
      }

      case 'RDOSetMinistryBudget': {
        // Args: MinId (integer), Budget (widestring)
        // Voyager: MinisteriesSheet.pas line 251 — Proxy.RDOSetMinistryBudget(MinId, Budget)
        const minId = parseInt(params.ministryId || '0', 10);
        args.push(RdoValue.int(minId), RdoValue.string(value));
        break;
      }

      case 'RDOBanMinister': {
        // Args: MinId (integer)
        // Voyager: MinisteriesSheet.pas line 271 — Proxy.RDOBanMinister(MinId)
        const minId = parseInt(params.ministryId || '0', 10);
        args.push(RdoValue.int(minId));
        break;
      }

      case 'RDOSitMinister': {
        // Args: MinId (integer), MinName (widestring)
        // Voyager: MinisteriesSheet.pas line 293 — Proxy.RDOSitMinister(MinId, MinName)
        const minId = parseInt(params.ministryId || '0', 10);
        const minName = params.ministerName || '';
        args.push(RdoValue.int(minId), RdoValue.string(minName));
        break;
      }

      case 'RDOQueueResearch': {
        // Args: inventionId (widestring), priority (integer, default=10)
        // Delphi: procedure RDOQueueResearch(InventionId: widestring; Priority: integer)
        const inventionId = params.inventionId || '';
        const priority = parseInt(params.priority || '10', 10);
        args.push(RdoValue.string(inventionId), RdoValue.int(priority));
        break;
      }

      case 'RDOCancelResearch': {
        // Args: inventionId (widestring)
        // Delphi: procedure RDOCancelResearch(InventionId: widestring)
        const cancelId = params.inventionId || '';
        args.push(RdoValue.string(cancelId));
        break;
      }

      case 'RdoRepair': {
        // Args: dummy integer (0)
        // Voyager: IndustryGeneralSheet.pas — Proxy.RdoRepair(0)
        args.push(RdoValue.int(0));
        break;
      }

      case 'RdoStopRepair': {
        // Args: dummy integer (0)
        // Voyager: IndustryGeneralSheet.pas — Proxy.RdoStopRepair(0)
        args.push(RdoValue.int(0));
        break;
      }

      case 'RDOSelectWare': {
        // Args: index (integer), value (integer)
        // Voyager: WHGeneralSheet.pas — Proxy.RDOSelectWare(index, value)
        const index = parseInt(params.index || '0', 10);
        args.push(RdoValue.int(index), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOSetWordsOfWisdom': {
        // Args: words (widestring)
        // Voyager: MausoleumSheet.pas — Proxy.RDOSetWordsOfWisdom(words)
        args.push(RdoValue.string(value));
        break;
      }

      case 'RDOCacncelTransc': {
        // No args (void)
        // Voyager: MausoleumSheet.pas — Proxy.RDOCacncelTransc (note: original Delphi typo)
        break;
      }

      case 'RDOVote': {
        // Args: voterName (widestring), voteeName (widestring)
        // Voyager: VotesSheet.pas — Proxy.RDOVote(voterName, voteeName)
        const voterName = params.voterName || '';
        args.push(RdoValue.string(voterName), RdoValue.string(value));
        break;
      }

      case 'RDOVoteOf': {
        // Args: voterName (widestring)
        // Voyager: VotesSheet.pas — Proxy.RDOVoteOf(voterName)
        args.push(RdoValue.string(value));
        break;
      }

      case 'RDOSetTownTaxes': {
        // Args: index (integer), value (integer)
        // Voyager: CapitolTownsSheet.pas — Proxy.RDOSetTownTaxes(index, value)
        const index = parseInt(params.index || '0', 10);
        args.push(RdoValue.int(index), RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'RDOSitMayor': {
        // Args: townName (widestring), tycoonName (widestring)
        // Voyager: CapitolTownsSheet.pas — Proxy.RDOSitMayor(townName, tycoonName)
        const townName = params.townName || '';
        args.push(RdoValue.string(townName), RdoValue.string(value));
        break;
      }

      case 'RDOSetInputFluidPerc': {
        // Args: perc (integer: 0-100)
        // Voyager: AdvSheetForm.pas — Proxy.RDOSetInputFluidPerc(perc)
        args.push(RdoValue.int(parseInt(value, 10)));
        break;
      }

      case 'property': {
        // Direct property set — widestring properties use string prefix, others use integer
        const WIDESTRING_PROPERTIES = new Set(['Name']);
        const actualPropName = params.propertyName || '';
        if (WIDESTRING_PROPERTIES.has(actualPropName)) {
          args.push(RdoValue.string(value));
        } else {
          args.push(RdoValue.int(parseInt(value, 10)));
        }
        break;
      }

      default:
        // Fallback: single value parameter
        args.push(RdoValue.int(parseInt(value, 10)));
        break;
    }

    return args;
  }

  /**
   * Map RDO command name to property name for reading back values
   *
   * Examples:
   * - RDOSetPrice(index=0) -> "srvPrices0"
   * - RDOSetSalaries(salary0=100, salary1=120, salary2=150) -> "Salaries0" (returns first salary for verification)
   * - RDOSetInputMaxPrice(metaFluid=5) -> "MaxPrice" (needs sub-object access)
   */
  private mapRdoCommandToPropertyName(
    rdoCommand: string,
    additionalParams?: Record<string, string>
  ): string {
    const params = additionalParams || {};

    switch (rdoCommand) {
      case 'RDOSetPrice': {
        const index = params.index || '0';
        return `srvPrices${index}`;
      }

      case 'RDOSetSalaries':
        // Return first salary for verification (all 3 are updated together)
        return 'Salaries0';

      case 'RDOSetCompanyInputDemand': {
        const index = params.index || '0';
        return `cInputDem${index}`;
      }

      case 'RDOSetInputMaxPrice':
        return 'MaxPrice';

      case 'RDOSetInputMinK':
        return 'minK';

      case 'RDOSetTradeLevel':
        return 'TradeLevel';

      case 'RDOSetRole':
        return 'Role';

      case 'RDOSetLoanPerc':
        return 'BudgetPerc';

      case 'RDOSetTaxValue':
        return `Tax${params.index || '0'}Percent`;

      case 'RDOAutoProduce':
        return 'AutoProd';

      case 'RDOAutoRelease':
        return 'AutoRel';

      case 'RDOSetOutputPrice': {
        // Output price is per-fluid; read back via PricePc (single-product) or indexed
        const fluidId = params.fluidId;
        if (fluidId) {
          // Multi-product: read back the output PricePc for the specific fluid
          // The cacher stores output properties per-fluid under the output sub-object
          return 'PricePc';
        }
        return 'PricePc';
      }

      case 'RDOConnectInput':
      case 'RDODisconnectInput':
        return 'cnxCount';

      case 'RDOConnectOutput':
      case 'RDODisconnectOutput':
        return 'cnxCount';

      case 'RDOSetInputOverPrice':
        return 'OverPriceCnxInfo';

      case 'RDOSetInputSortMode':
        return 'SortMode';

      case 'RDOSelSelected':
        return 'Selected';

      case 'RDOSetBuyingStatus':
        return 'Selected';

      case 'RDOConnectToTycoon':
      case 'RDODisconnectFromTycoon':
        return 'TradeRole';

      case 'RDOAcceptCloning':
        return 'CloneMenu0';

      case 'CloneFacility':
        return 'UpgradeLevel';

      case 'RDOSetMinSalaryValue': {
        const level = params.levelIndex || '0';
        const prefix = level === '0' ? 'hi' : level === '1' ? 'mid' : 'lo';
        return `${prefix}ActualMinSalary`;
      }

      case 'RDOLaunchMovie':
      case 'RDOCancelMovie':
      case 'RDOReleaseMovie':
        return 'InProd';

      case 'RDOSetMinistryBudget':
        return `MinisterBudget${params.ministryId || '0'}`;

      case 'RDOBanMinister':
      case 'RDOSitMinister':
        return `Minister${params.ministryId || '0'}`;

      case 'RDOSelectWare':
        return 'GateMap';

      case 'RDOSetWordsOfWisdom':
        return 'WordsOfWisdom';

      case 'RDOCacncelTransc':
        return 'Transcended';

      case 'RDOVote':
      case 'RDOVoteOf':
        return 'RulerVotes';

      case 'RDOSetTownTaxes': {
        const index = params.index || '0';
        return `TownTax${index}`;
      }

      case 'RDOSitMayor':
        return `HasMayor${params.index || '0'}`;

      case 'RDOSetInputFluidPerc':
        return 'nfActualMaxFluidValue';

      case 'property':
        return params.propertyName || rdoCommand;

      default:
        // Fallback: skip read-back for unknown commands — return the command name as-is
        // so the caller gets a likely-stale value rather than querying a wrong property
        this.log.warn(`[BuildingDetails] mapRdoCommandToPropertyName: unknown command "${rdoCommand}", read-back may be inaccurate`);
        return rdoCommand;
    }
  }

  // =========================================================================
  // RESEARCH / INVENTIONS
  // =========================================================================

  /**
   * Fetch all invention items for a category from the building cache.
   *
   * Cache property naming (from ResearchCenter.pas StoreToCache):
   *   {prefix}{cat}RsId{idx}      — invention string ID (all states)
   *   {prefix}{cat}RsName{idx}    — display name (volatile only)
   *   {prefix}{cat}RsDyn{idx}     — "yes" if volatile
   *   {prefix}{cat}RsParent{idx}  — parent category name (volatile only)
   *   avl{cat}RsEnabled{idx}      — boolean (available only)
   *   has{cat}RsCost{idx}         — formatted cost (completed only)
   */
  public async getResearchInventory(
    x: number, y: number, categoryIndex: number
  ): Promise<ResearchCategoryData> {
    await this.connectMapService();
    const tempObjectId = await this.cacherCreateObject();

    try {
      await this.cacherSetObject(tempObjectId, x, y);
      const cat = categoryIndex;

      // Phase 1: Get counts
      const countProps = [`avlCount${cat}`, `devCount${cat}`, `hasCount${cat}`];
      const countValues = await this.cacherGetPropertyList(tempObjectId, countProps);
      const avlCount = parseInt(countValues[0] || '0', 10);
      const devCount = parseInt(countValues[1] || '0', 10);
      const hasCount = parseInt(countValues[2] || '0', 10);

      this.log.debug(`[Research] Counts for cat=${cat}: avl=${avlCount}, dev=${devCount}, has=${hasCount}`);

      // Phase 2: Build per-item property names
      const itemProps: string[] = [];

      for (let i = 0; i < avlCount; i++) {
        itemProps.push(
          `avl${cat}RsId${i}`, `avl${cat}RsEnabled${i}`,
          `avl${cat}RsName${i}`, `avl${cat}RsDyn${i}`, `avl${cat}RsParent${i}`
        );
      }
      for (let i = 0; i < devCount; i++) {
        itemProps.push(
          `dev${cat}RsId${i}`,
          `dev${cat}RsName${i}`, `dev${cat}RsDyn${i}`, `dev${cat}RsParent${i}`
        );
      }
      for (let i = 0; i < hasCount; i++) {
        itemProps.push(
          `has${cat}RsId${i}`, `has${cat}RsCost${i}`,
          `has${cat}RsName${i}`, `has${cat}RsDyn${i}`, `has${cat}RsParent${i}`
        );
      }

      // Fetch in batches
      const allItemValues = new Map<string, string>();
      const BATCH_SIZE = 50;
      for (let i = 0; i < itemProps.length; i += BATCH_SIZE) {
        const batch = itemProps.slice(i, i + BATCH_SIZE);
        const values = await this.cacherGetPropertyList(tempObjectId, batch);
        for (let j = 0; j < batch.length; j++) {
          // Allow empty strings — server returns '' for unset properties
          if (j < values.length && values[j] !== 'error') {
            allItemValues.set(batch[j], values[j]);
          }
        }
      }

      const available = parseResearchItems('avl', cat, avlCount, allItemValues, true);
      const developing = parseResearchItems('dev', cat, devCount, allItemValues, false);
      const completed = parseResearchItems('has', cat, hasCount, allItemValues, false);

      return { categoryIndex, available, developing, completed };
    } finally {
      await this.cacherCloseObject(tempObjectId);
    }
  }

  /**
   * Fetch detailed properties + description for a single invention.
   *
   * Calls RDOGetInvPropsByLang (function, "^" separator) and
   * RDOGetInvDescEx (function, "^" separator) via sendRdoRequest on the
   * construction socket. Both are olevariant-returning functions — safe to
   * use with sendRdoRequest (which adds a QueryId).
   */
  public async getResearchDetails(
    x: number, y: number, inventionId: string
  ): Promise<ResearchInventionDetails> {
    await this.connectConstructionService();
    if (!this.worldId) {
      throw new Error('Construction service not initialized - worldId is null');
    }

    // Get CurrBlock for this building
    await this.connectMapService();
    const tempObjectId = await this.cacherCreateObject();
    let currBlock: string;

    try {
      await this.cacherSetObject(tempObjectId, x, y);
      const values = await this.cacherGetPropertyList(tempObjectId, ['CurrBlock']);
      currBlock = values[0];
      if (!currBlock) throw new Error(`No CurrBlock for building at (${x}, ${y})`);
    } finally {
      await this.cacherCloseObject(tempObjectId);
    }

    this.log.debug(`[Research] Getting details for "${inventionId}" on block ${currBlock}`);

    // Call RDOGetInvPropsByLang — function (olevariant return), "^" separator
    const propsPacket = await this.sendRdoRequest('construction', {
      verb: RdoVerb.SEL,
      targetId: currBlock,
      action: RdoAction.CALL,
      member: 'RDOGetInvPropsByLang',
      separator: '"^"',
      args: [RdoValue.string(inventionId).format(), RdoValue.string('0').format()],
    });
    const properties = parsePropertyResponseHelper(propsPacket.payload || '', 'res') || '';

    // Call RDOGetInvDescEx — function (olevariant return), "^" separator
    const descPacket = await this.sendRdoRequest('construction', {
      verb: RdoVerb.SEL,
      targetId: currBlock,
      action: RdoAction.CALL,
      member: 'RDOGetInvDescEx',
      separator: '"^"',
      args: [RdoValue.string(inventionId).format(), RdoValue.string('0').format()],
    });
    const description = parsePropertyResponseHelper(descPacket.payload || '', 'res') || '';

    this.log.debug(`[Research] Details for "${inventionId}": props=${properties.length} chars, desc=${description.length} chars`);

    return { inventionId, properties, description };
  }

}

/**
 * Parse invention items from cache property values.
 * Cache naming: {prefix}{cat}RsId{idx}, {prefix}{cat}RsName{idx}, etc.
 * @internal Exported for testing.
 */
export function parseResearchItems(
  prefix: string,
  cat: number,
  count: number,
  values: Map<string, string>,
  includeEnabled: boolean
): ResearchInventionItem[] {
  const items: ResearchInventionItem[] = [];
  for (let i = 0; i < count; i++) {
    const id = values.get(`${prefix}${cat}RsId${i}`) || '';
    if (!id) continue;

    const isVolatile = values.get(`${prefix}${cat}RsDyn${i}`) === 'yes';
    const name = values.get(`${prefix}${cat}RsName${i}`) || id;
    const parent = values.get(`${prefix}${cat}RsParent${i}`) || undefined;
    const cost = prefix === 'has' ? values.get(`has${cat}RsCost${i}`) || undefined : undefined;

    let enabled: boolean | undefined;
    if (includeEnabled) {
      const enabledVal = values.get(`avl${cat}RsEnabled${i}`);
      // Delphi TObjectCache.WriteBoolean writes '1'/'0'; also accept 'true'/'-1' for safety
      enabled = enabledVal === '1' || enabledVal === 'true' || enabledVal === '-1';
    }

    items.push({ inventionId: id, name, enabled, cost, parent, volatile: isVolatile || undefined });
  }
  return items;
}
