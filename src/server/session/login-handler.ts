/**
 * Login Handler — extracted from StarpeaceSession.
 *
 * Contains the login/company lifecycle: directory authentication, world login,
 * company selection, company creation, and company switching.
 * Also includes directory query helpers (parseDirectoryResult, fetchCompaniesViaHttp, etc.)
 */

import * as net from 'net';
import fetch from 'node-fetch';
import type { RdoPacket, WorldInfo, CompanyInfo } from '../../shared/types';
import { RdoVerb, RdoAction, SessionPhase, DIRECTORY_QUERY } from '../../shared/types';
import { RdoValue, RdoCommand } from '../../shared/rdo-types';
import { config } from '../../shared/config';
import { AuthError } from '../../shared/auth-error';
import { toErrorMessage } from '../../shared/error-utils';
import {
  parsePropertyResponse as parsePropertyResponseHelper,
  parseIdOfResponse as parseIdOfResponseHelper,
  cleanPayload as cleanPayloadHelper,
} from '../rdo-helpers';

// ── Login Context ───────────────────────────────────────────────────────────

/**
 * Narrow interface for login/directory lifecycle operations.
 * StarpeaceSession implements this so login functions can access
 * the session state they need without importing the full class.
 */
export interface LoginContext {
  // ── Logging ──
  readonly log: {
    info(...args: unknown[]): void;
    debug(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
  };

  // ── RDO Transport ──
  sendRdoRequest(socketName: string, packetData: Partial<RdoPacket>): Promise<RdoPacket>;
  getSocket(name: string): net.Socket | undefined;
  createSocket(name: string, host: string, port: number): Promise<net.Socket>;
  deleteSocket(name: string): void;
  /** Initialize per-user world connection pool after primary socket is connected */
  initWorldPool(host: string, port: number): void;

  // ── Event Emission ──
  emit(event: string, ...args: unknown[]): boolean;

  // ── Read-only state ──
  readonly worldContextId: string | null;
  readonly tycoonId: string | null;
  readonly interfaceServerId: string | null;
  readonly worldId: string | null;
  readonly currentWorldInfo: WorldInfo | null;
  readonly cachedUsername: string | null;
  readonly cachedPassword: string | null;
  readonly rdoCnntId: string | null;
  readonly currentCompany: CompanyInfo | null;

  // ── Phase management ──
  getPhase(): SessionPhase;
  setPhase(phase: SessionPhase): void;

  // ── Session state setters ──
  setWorldContextId(value: string | null): void;
  setInterfaceServerId(value: string | null): void;
  setTycoonId(value: string | null): void;
  setRdoCnntId(value: string | null): void;
  setCacherId(value: string | null): void;
  setWorldId(value: string | null): void;
  setDaPort(value: number | null): void;
  setDaAddr(value: string | null): void;
  setMailAccount(value: string | null): void;
  setMailAddr(value: string | null): void;
  setMailPort(value: number | null): void;
  setWorldXSize(value: number | null): void;
  setWorldYSize(value: number | null): void;
  setWorldSeason(value: number | null): void;
  setCurrentWorldInfo(value: WorldInfo | null): void;
  setCachedUsername(value: string | null): void;
  setCachedPassword(value: string | null): void;
  setCachedZonePath(value: string): void;
  setActiveUsername(value: string | null): void;
  setCurrentCompany(value: CompanyInfo | null): void;
  setLastPlayerX(value: number): void;
  setLastPlayerY(value: number): void;

  // ── Collections ──
  getAvailableWorlds(): Map<string, WorldInfo>;
  setAvailableWorlds(worlds: Map<string, WorldInfo>): void;
  getAvailableCompanies(): CompanyInfo[];
  setAvailableCompanies(companies: CompanyInfo[]): void;
  pushAvailableCompany(company: CompanyInfo): void;

  // ── Known Objects ──
  setKnownObject(name: string, id: string): void;

  // ── InitClient synchronization ──
  setWaitingForInitClient(value: boolean): void;
  getInitClientReceived(): Promise<void> | null;
  setInitClientReceived(value: Promise<void> | null): void;
  setInitClientResolver(value: (() => void) | null): void;

  // ── Lifecycle hooks ──
  startServerBusyPolling(): void;
  startGcSweep(): void;
  stopCacherKeepAlive(): void;

  // ── Socket management (for switchCompany cleanup) ──
  getSocketNames(): string[];
  removeAllSocketListeners(name: string): void;
  destroySocket(name: string): void;
  deleteFramer(name: string): void;

  // ── State reset (for switchCompany) ──
  clearAspActionCache(): void;
  clearBuildingFocus(): void;
}

// ── Parse Season Value ──────────────────────────────────────────────────────

function parseSeasonValue(value: string): number {
  const num = parseInt(value, 10);
  if (!isNaN(num) && num >= 0 && num <= 3) return num;
  const map: Record<string, number> = { winter: 0, spring: 1, summer: 2, autumn: 3, fall: 3 };
  return map[value.toLowerCase()] ?? 2; // default Summer
}

// ── Directory Methods ───────────────────────────────────────────────────────

/**
 * Auth-only check: validates credentials against the Directory Server
 * without querying the world list. Throws AuthError on failure.
 */
export async function checkAuth(ctx: LoginContext, username: string, password: string): Promise<void> {
  return performDirectoryAuth(ctx, username, password);
}

/**
 * Connect to Directory Service in two ephemeral phases:
 * 1. Authentication Check
 * 2. World List Retrieval
 */
export async function connectDirectory(
  ctx: LoginContext,
  username: string,
  pass: string,
  zonePath?: string,
): Promise<WorldInfo[]> {
  ctx.setPhase(SessionPhase.DIRECTORY_CONNECTED);
  ctx.setCachedUsername(username);
  ctx.setActiveUsername(username);
  ctx.setCachedPassword(pass);
  ctx.setCachedZonePath(zonePath || 'Root/Areas/Asia/Worlds');

  // Run auth and world query in parallel (independent sockets & sessions)
  ctx.log.info('Directory: connecting...');
  const [, worlds] = await Promise.all([
    performDirectoryAuth(ctx, username, pass),
    performDirectoryQuery(ctx, zonePath),
  ]);
  ctx.log.info('Directory: auth + query complete');
  return worlds;
}

/**
 * Helper Phase 1: Auth -> EndSession
 */
async function performDirectoryAuth(ctx: LoginContext, username: string, pass: string): Promise<void> {
  const socket = await ctx.createSocket('directory_auth', config.rdo.directoryHost, config.rdo.ports.directory);
  try {
    // 1. Resolve & Open Session
    const idPacket = await ctx.sendRdoRequest('directory_auth', { verb: RdoVerb.IDOF, targetId: 'DirectoryServer' });
    const directoryServerId = parseIdOfResponseHelper(idPacket.payload);
    const sessionPacket = await ctx.sendRdoRequest('directory_auth', {
      verb: RdoVerb.SEL, targetId: directoryServerId, action: RdoAction.GET, member: 'RDOOpenSession',
    });
    const sessionId = parsePropertyResponseHelper(sessionPacket.payload || '', 'RDOOpenSession');

    // 2. Map & Logon
    await ctx.sendRdoRequest('directory_auth', {
      verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOMapSegaUser',
      args: [username],
    });
    const logonPacket = await ctx.sendRdoRequest('directory_auth', {
      verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOLogonUser',
      args: [username, pass],
    });
    const res = parsePropertyResponseHelper(logonPacket.payload || '', 'res');
    const authCode = parseInt(res, 10);
    if (authCode !== 0) throw new AuthError(authCode);

    // 3. End Session & Close (fire-and-forget — void push, no RID)
    socket.write(RdoCommand.sel(sessionId).call('RDOEndSession').push().build());
    ctx.log.debug('[Session] Directory Authentication Success');
  } finally {
    socket.end();
    ctx.deleteSocket('directory_auth');
  }
}

/**
 * Helper Phase 2: OpenSession -> QueryKey -> EndSession
 */
async function performDirectoryQuery(ctx: LoginContext, zonePath?: string): Promise<WorldInfo[]> {
  const socket = await ctx.createSocket('directory_query', config.rdo.directoryHost, config.rdo.ports.directory);
  try {
    // 1. Resolve & Open NEW Session
    const idPacket = await ctx.sendRdoRequest('directory_query', { verb: RdoVerb.IDOF, targetId: 'DirectoryServer' });
    const directoryServerId = parseIdOfResponseHelper(idPacket.payload);
    const sessionPacket = await ctx.sendRdoRequest('directory_query', {
      verb: RdoVerb.SEL, targetId: directoryServerId, action: RdoAction.GET, member: 'RDOOpenSession',
    });
    const sessionId = parsePropertyResponseHelper(sessionPacket.payload || '', 'RDOOpenSession');

    // 2. Query Worlds
    const worldPath = zonePath || 'Root/Areas/Asia/Worlds';
    const queryPacket = await ctx.sendRdoRequest('directory_query', {
      verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOQueryKey',
      args: [worldPath, DIRECTORY_QUERY.QUERY_BLOCK],
    });
    const resValue = parsePropertyResponseHelper(queryPacket.payload || '', 'res');
    const worlds = parseDirectoryResult(ctx, resValue);
    const worldMap = new Map<string, WorldInfo>();
    for (const w of worlds) {
      worldMap.set(w.name, w);
    }
    ctx.setAvailableWorlds(worldMap);

    // 3. End Session & Close (fire-and-forget — void push, no RID)
    socket.write(RdoCommand.sel(sessionId).call('RDOEndSession').push().build());
    return worlds;
  } finally {
    socket.end();
    ctx.deleteSocket('directory_query');
  }
}

/**
 * Search for people/tycoons via RDOSearchKey on the Directory Server.
 * Opens an ephemeral directory session, searches, and closes.
 */
export async function searchPeople(ctx: LoginContext, searchStr: string, cachedZonePath: string): Promise<string[]> {
  const currentWorldInfo = ctx.currentWorldInfo;
  const socket = await ctx.createSocket('directory_search', config.rdo.directoryHost, config.rdo.ports.directory);
  try {
    // 1. Resolve DirectoryServer object
    const idPacket = await ctx.sendRdoRequest('directory_search', {
      verb: RdoVerb.IDOF, targetId: 'DirectoryServer',
    });
    const directoryServerId = parseIdOfResponseHelper(idPacket.payload);

    // 2. Open Session
    const sessionPacket = await ctx.sendRdoRequest('directory_search', {
      verb: RdoVerb.SEL, targetId: directoryServerId, action: RdoAction.GET, member: 'RDOOpenSession',
    });
    const sessionId = parsePropertyResponseHelper(sessionPacket.payload || '', 'RDOOpenSession');

    // 3. Navigate to the world's directory root
    const worldName = currentWorldInfo?.name || '';
    const worldPath = `${cachedZonePath}/${worldName}`;
    await ctx.sendRdoRequest('directory_search', {
      verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOSetCurrentKey',
      args: [worldPath],
    });

    // 4. Search for matching keys under the world
    const searchPacket = await ctx.sendRdoRequest('directory_search', {
      verb: RdoVerb.SEL, targetId: sessionId, action: RdoAction.CALL, member: 'RDOSearchKey',
      args: [`*${searchStr}*`, ''],
    });
    const resValue = parsePropertyResponseHelper(searchPacket.payload || '', 'res');

    // 5. Parse results
    const names = parseSearchKeyResults(ctx, resValue);

    // 6. End Session (fire-and-forget — void push, no RID)
    socket.write(RdoCommand.sel(sessionId).call('RDOEndSession').push().build());

    return names;
  } catch (err: unknown) {
    ctx.log.error('[Session] searchPeople failed:', toErrorMessage(err));
    return [];
  } finally {
    socket.end();
    ctx.deleteSocket('directory_search');
  }
}

// ── World Login ─────────────────────────────────────────────────────────────

export async function loginWorld(
  ctx: LoginContext,
  username: string,
  pass: string,
  world: WorldInfo,
): Promise<{
  contextId: string;
  tycoonId: string;
  companies: CompanyInfo[];
  worldXSize: number | null;
  worldYSize: number | null;
  worldSeason: number | null;
}> {
  ctx.setPhase(SessionPhase.WORLD_CONNECTING);
  ctx.setCurrentWorldInfo(world);

  ctx.log.info(`Connecting to world ${world.name} (${world.ip}:${world.port})`);

  // Connect to World Server
  await ctx.createSocket('world', world.ip, world.port);

  // Initialize per-user DA connection pool (mirrors Delphi TRDOConnectionPool)
  ctx.initWorldPool(world.ip, world.port);

  // Generate Virtual Client ID for InterfaceEvents BEFORE any requests
  const virtualEventId = (Math.floor(Math.random() * 6000000) + 38000000).toString();
  ctx.setKnownObject('InterfaceEvents', virtualEventId);
  ctx.log.debug(`[Session] Virtual InterfaceEvents ID: ${virtualEventId}`);

  // 1. Resolve InterfaceServer
  const idPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.IDOF,
    targetId: 'InterfaceServer',
  });
  const interfaceServerId = parseIdOfResponseHelper(idPacket.payload);
  ctx.setInterfaceServerId(interfaceServerId);
  ctx.log.debug(`[Session] InterfaceServer ID: ${interfaceServerId}`);

  // 2. Retrieve World Properties (10 properties)
  await fetchWorldProperties(ctx, interfaceServerId);

  // 3. Check AccountStatus
  const statusPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: interfaceServerId,
    action: RdoAction.CALL,
    member: 'AccountStatus',
    args: [username, pass],
  });
  const statusPayload = parsePropertyResponseHelper(statusPacket.payload!, 'res');
  ctx.log.debug(`[Session] AccountStatus: ${statusPayload}`);

  // 4. Authenticate (call Logon)
  const logonPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: interfaceServerId,
    action: RdoAction.CALL,
    member: 'Logon',
    args: [username, pass],
  });

  let contextId = cleanPayloadHelper(logonPacket.payload!);
  if (contextId.includes('res')) {
    contextId = parsePropertyResponseHelper(logonPacket.payload!, 'res');
  }

  if (!contextId || contextId === '0' || contextId.startsWith('error')) {
    throw new Error(`Login failed: ${logonPacket.payload}`);
  }

  ctx.setWorldContextId(contextId);
  ctx.log.debug(`[Session] Authenticated. Context RDO: ${contextId}`);

  // 5. Retrieve User Properties — sequential (legacy client sends one at a time)
  const mailPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL, targetId: contextId,
    action: RdoAction.GET, member: 'MailAccount',
  });
  ctx.setMailAccount(parsePropertyResponseHelper(mailPacket.payload!, 'MailAccount'));
  ctx.log.debug(`[Session] MailAccount: ${ctx.currentWorldInfo?.name}`);

  const tycoonPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL, targetId: contextId,
    action: RdoAction.GET, member: 'TycoonId',
  });
  const tycoonId = parsePropertyResponseHelper(tycoonPacket.payload!, 'TycoonId');
  ctx.setTycoonId(tycoonId);

  const cnntPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL, targetId: contextId,
    action: RdoAction.GET, member: 'RDOCnntId',
  });
  const rdoCnntId = parsePropertyResponseHelper(cnntPacket.payload!, 'RDOCnntId');
  ctx.setRdoCnntId(rdoCnntId);

  // 6. Setup InitClient waiter BEFORE RegisterEventsById
  ctx.setWaitingForInitClient(true);
  const initClientPromise = new Promise<void>((resolve) => {
    ctx.setInitClientResolver(resolve);
  });
  ctx.setInitClientReceived(initClientPromise);

  // 7. Register Events - This triggers server's "C <rid> idof InterfaceEvents"
  // IMPORTANT: Don't await this! The server sends InitClient push BEFORE responding
  ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: contextId,
    action: RdoAction.CALL,
    member: 'RegisterEventsById',
    args: [rdoCnntId],
  }).catch(() => {
    ctx.log.debug(`[Session] RegisterEventsById completed (or timed out, which is normal)`);
  });

  // CRITICAL: Wait for server to send InitClient push command (with timeout)
  ctx.log.debug(`[Session] Waiting for server InitClient push...`);
  let initTimeoutHandle: ReturnType<typeof setTimeout>;
  const initClientTimeout = new Promise<never>((_, reject) =>
    initTimeoutHandle = setTimeout(() => reject(new Error('InitClient push timeout after 15s')), 15000),
  );
  await Promise.race([initClientPromise, initClientTimeout]);
  clearTimeout(initTimeoutHandle!);
  ctx.log.debug(`[Session] InitClient received, continuing...`);

  // 8. SetLanguage - CLIENT sends this as PUSH command (no RID)
  const socket = ctx.getSocket('world');
  if (socket) {
    const setLangCmd = RdoCommand.sel(contextId)
      .call('SetLanguage')
      .push()
      .args(RdoValue.string('0'))
      .build();
    socket.write(setLangCmd);
    ctx.log.debug(`[Session] Sent SetLanguage push command`);
  }

  // 9. GetCompanyCount
  const companyCountPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: contextId,
    action: RdoAction.GET,
    member: 'GetCompanyCount',
  });
  const companyCountStr = parsePropertyResponseHelper(companyCountPacket.payload!, 'GetCompanyCount');
  const companyCount = parseInt(companyCountStr, 10) || 0;
  ctx.log.debug(`[Session] Company Count: ${companyCount}`);

  // 10. Fetch companies via HTTP for UI
  const { companies } = await fetchCompaniesViaHttp(ctx, world.ip, username);
  ctx.setAvailableCompanies(companies);

  ctx.log.info('Login phase complete. Waiting for company selection...');

  // NOTE: Phase remains WORLD_CONNECTING until selectCompany() is called
  return {
    contextId, tycoonId, companies,
    worldXSize: ctx.currentWorldInfo?.mapSizeX ?? null,
    worldYSize: ctx.currentWorldInfo?.mapSizeY ?? null,
    worldSeason: null, // worldSeason is set during fetchWorldProperties
  };
}

// ── Company Selection ───────────────────────────────────────────────────────

export async function selectCompany(ctx: LoginContext, companyId: string): Promise<void> {
  const worldContextId = ctx.worldContextId;
  if (!worldContextId) {
    throw new Error('Not logged into world');
  }

  ctx.log.debug(`[Session] Selecting company ID: ${companyId}`);

  // Store the selected company for ASP requests (bank, profile, etc.)
  const matched = ctx.getAvailableCompanies().find(c => c.id === companyId);
  if (matched) {
    ctx.setCurrentCompany(matched);
    ctx.log.debug(`[Session] Current company set: ${matched.name}`);
  }

  // 1. EnableEvents (set to -1 to activate)
  await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: worldContextId,
    action: RdoAction.SET,
    member: 'EnableEvents',
    args: ['-1'],
  });
  ctx.log.debug(`[Session] EnableEvents activated`);

  // 2. First PickEvent - Subscribe to Tycoon updates
  await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: worldContextId,
    action: RdoAction.CALL,
    member: 'PickEvent',
    args: [ctx.tycoonId!],
  });
  ctx.log.debug(`[Session] PickEvent #1 sent`);

  // 3. Get Tycoon Cookies — sequential (legacy client sends one at a time)
  const lastYPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL, targetId: worldContextId,
    action: RdoAction.CALL, member: 'GetTycoonCookie',
    args: [ctx.tycoonId!, 'LastY.0'],
  });
  const lastY = parsePropertyResponseHelper(lastYPacket.payload!, 'res');
  ctx.setLastPlayerY(parseInt(lastY, 10) || 0);
  ctx.log.debug(`[Session] Cookie LastY.0: ${lastY}`);

  const lastXPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL, targetId: worldContextId,
    action: RdoAction.CALL, member: 'GetTycoonCookie',
    args: [ctx.tycoonId!, 'LastX.0'],
  });
  const lastX = parsePropertyResponseHelper(lastXPacket.payload!, 'res');
  ctx.setLastPlayerX(parseInt(lastX, 10) || 0);
  ctx.log.debug(`[Session] Cookie LastX.0: ${lastX}`);

  const allCookiesPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL, targetId: worldContextId,
    action: RdoAction.CALL, member: 'GetTycoonCookie',
    args: [ctx.tycoonId!, ''],
  });
  const allCookies = parsePropertyResponseHelper(allCookiesPacket.payload!, 'res');
  ctx.log.debug(`[Session] All Cookies:\n${allCookies}`);

  // 4. ClientAware - Notify ready (first call)
  const socket = ctx.getSocket('world');
  if (socket) {
    const clientAwareCmd = RdoCommand.sel(worldContextId)
      .call('ClientAware')
      .push()
      .build();
    socket.write(clientAwareCmd);
    ctx.log.debug(`[Session] Sent ClientAware #1`);
  }

  // 5. Second PickEvent
  await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: worldContextId,
    action: RdoAction.CALL,
    member: 'PickEvent',
    args: [ctx.tycoonId!],
  });
  ctx.log.debug(`[Session] PickEvent #2 sent`);

  // 6. Second ClientAware
  if (socket) {
    const clientAwareCmd2 = RdoCommand.sel(worldContextId)
      .call('ClientAware')
      .push()
      .build();
    socket.write(clientAwareCmd2);
    ctx.log.debug(`[Session] Sent ClientAware #2`);
  }

  // NOW the session is fully ready for game
  ctx.setPhase(SessionPhase.WORLD_CONNECTED);

  // Start ServerBusy polling and GC sweep now that we're fully connected
  ctx.startServerBusyPolling();
  ctx.startGcSweep();

  ctx.log.info(`Company ${companyId} selected - Ready for game!`);
}

// ── Company Creation ────────────────────────────────────────────────────────

export async function createCompany(
  ctx: LoginContext,
  companyName: string,
  cluster: string,
): Promise<{ success: boolean; companyName: string; companyId: string; message?: string }> {
  if (!ctx.worldContextId) {
    return { success: false, companyName: '', companyId: '', message: 'Not connected to world' };
  }

  const username = ctx.cachedUsername || '';
  ctx.log.debug(`[Session] Creating company: "${companyName}" in cluster "${cluster}" for user "${username}"`);

  try {
    // InterfaceServer.NewCompany(name, cluster) — only 2 args.
    const packet = await ctx.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: ctx.worldContextId,
      action: RdoAction.CALL,
      member: 'NewCompany',
      separator: '"^"',
      args: [RdoValue.string(companyName).format(), RdoValue.string(cluster).format()],
    });

    const payload = packet.payload || '';
    ctx.log.debug(`[Session] NewCompany response: ${payload}`);

    // Response is always a widestring:
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
        ctx.log.info(`[Session] Company created: "${newName}" (ID: ${newId})`);
        ctx.pushAvailableCompany({ id: newId, name: newName, ownerRole: username });
        return { success: true, companyName: newName, companyId: newId };
      }

      // Error: numeric error code as string
      const errorCode = parseInt(resultStr, 10);
      if (!isNaN(errorCode)) {
        const errorMessages: Record<number, string> = {
          6: 'Unknown cluster',
          11: 'Company name already taken',
          28: 'Zone tier mismatch',
          33: 'Maximum number of companies reached',
        };
        const msg = errorMessages[errorCode] || `Failed with error code ${errorCode}`;
        ctx.log.warn(`[Session] Company creation failed: ${msg}`);
        return { success: false, companyName: '', companyId: '', message: msg };
      }

      // Non-numeric, non-bracket string — unexpected
      ctx.log.warn(`[Session] Unexpected NewCompany result: "${resultStr}"`);
      return { success: false, companyName: '', companyId: '', message: `Unexpected result: ${resultStr}` };
    }

    // Fallback: integer-typed error
    const intMatch = /res="#(-?\d+)"/.exec(payload);
    if (intMatch) {
      const errorCode = parseInt(intMatch[1], 10);
      ctx.log.warn(`[Session] Company creation failed with integer error: ${errorCode}`);
      return { success: false, companyName: '', companyId: '', message: `Failed with error code ${errorCode}` };
    }

    ctx.log.warn(`[Session] Unexpected NewCompany payload: ${payload}`);
    return { success: false, companyName: '', companyId: '', message: 'Unexpected response from server' };
  } catch (e: unknown) {
    ctx.log.error('[Session] Failed to create company:', e);
    return { success: false, companyName: '', companyId: '', message: toErrorMessage(e) };
  }
}

// ── Company Switching ───────────────────────────────────────────────────────

export async function switchCompany(ctx: LoginContext, company: CompanyInfo): Promise<void> {
  if (!ctx.currentWorldInfo || !ctx.cachedPassword) {
    throw new Error('Cannot switch company: world or credentials not available');
  }

  ctx.log.debug(`[Session] Switching to company: ${company.name} (ownerRole: ${company.ownerRole})`);

  // Store the company we're switching to
  ctx.setCurrentCompany(company);

  // Determine the username to use for login
  const loginUsername = company.ownerRole || ctx.cachedUsername || '';

  // Update the active identity so ASP page fetches use the correct tycoon
  ctx.setActiveUsername(loginUsername);

  if (company.ownerRole && company.ownerRole !== ctx.cachedUsername) {
    ctx.log.debug(`[Session] Role-based login detected: switching from "${ctx.cachedUsername}" to role "${company.ownerRole}"`);
  }

  // Stop cacher KeepAlive before closing sockets
  ctx.stopCacherKeepAlive();

  // Close existing sockets except directory
  ctx.log.debug('[Session] Closing existing world connections for company switch...');
  const socketsToClose = ctx.getSocketNames().filter(name => name !== 'directory_auth' && name !== 'directory_query');

  for (const socketName of socketsToClose) {
    ctx.removeAllSocketListeners(socketName);
    ctx.destroySocket(socketName);
    ctx.deleteSocket(socketName);
    ctx.deleteFramer(socketName);
  }

  // Reset session state
  ctx.setWorldContextId(null);
  ctx.setTycoonId(null);
  ctx.setInterfaceServerId(null);
  ctx.setRdoCnntId(null);
  ctx.setCacherId(null);
  ctx.setWorldId(null);
  ctx.setDaPort(null);
  ctx.clearAspActionCache();
  ctx.clearBuildingFocus();

  // Re-login to world with the role username
  const result = await loginWorld(ctx, loginUsername, ctx.cachedPassword!, ctx.currentWorldInfo);

  ctx.log.debug(`[Session] Re-logged in as "${loginUsername}", contextId: ${result.contextId}`);
  ctx.log.debug(`[Session] After switchCompany - interfaceServerId: ${ctx.interfaceServerId}, worldId: ${ctx.worldId}`);

  // Ensure the target company exists in the refreshed list — the ASP endpoint
  // may serve a cached response that does not yet include a freshly created company.
  const exists = ctx.getAvailableCompanies().find(c => c.id === company.id);
  if (!exists) {
    ctx.log.warn(`[Session] Company "${company.name}" (${company.id}) missing from refreshed list — re-injecting`);
    ctx.pushAvailableCompany(company);
  }

  // Small delay to ensure socket is fully ready before selecting company
  await new Promise(resolve => setTimeout(resolve, 200));

  // Select the specific company
  await selectCompany(ctx, company.id);

  ctx.log.debug(`[Session] Company switch complete - now playing as ${company.name}`);
}

// ── Private Helpers ─────────────────────────────────────────────────────────

/**
 * Fetch world properties from InterfaceServer (10 sequential GET commands).
 */
async function fetchWorldProperties(ctx: LoginContext, interfaceServerId: string): Promise<void> {
  const props = [
    'WorldName', 'WorldURL', 'DAAddr', 'DAPort', 'DALockPort',
    'MailAddr', 'MailPort', 'WorldXSize', 'WorldYSize', 'WorldSeason',
  ] as const;

  for (const prop of props) {
    const packet = await ctx.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: interfaceServerId,
      action: RdoAction.GET,
      member: prop,
    });
    const value = parsePropertyResponseHelper(packet.payload!, prop);
    ctx.log.debug(`[Session] ${prop}: ${value}`);

    if (prop === 'WorldName' && value && ctx.currentWorldInfo) {
      const wi = { ...ctx.currentWorldInfo, name: value };
      ctx.setCurrentWorldInfo(wi);
    }
    if (prop === 'DAAddr') ctx.setDaAddr(value);
    if (prop === 'DAPort') ctx.setDaPort(parseInt(value, 10));
    if (prop === 'MailAddr') ctx.setMailAddr(value);
    if (prop === 'MailPort') ctx.setMailPort(parseInt(value, 10));
    if (prop === 'WorldXSize') {
      const xSize = parseInt(value, 10) || null;
      ctx.setWorldXSize(xSize);
      if (ctx.currentWorldInfo) {
        const wi = { ...ctx.currentWorldInfo, mapSizeX: xSize ?? undefined };
        ctx.setCurrentWorldInfo(wi);
      }
    }
    if (prop === 'WorldYSize') {
      const ySize = parseInt(value, 10) || null;
      ctx.setWorldYSize(ySize);
      if (ctx.currentWorldInfo) {
        const wi = { ...ctx.currentWorldInfo, mapSizeY: ySize ?? undefined };
        ctx.setCurrentWorldInfo(wi);
      }
    }
    if (prop === 'WorldSeason') ctx.setWorldSeason(parseSeasonValue(value));
  }
}

/**
 * Fetch companies via HTTP (ASP endpoint)
 */
async function fetchCompaniesViaHttp(
  ctx: LoginContext,
  worldIp: string,
  username: string,
): Promise<{ companies: CompanyInfo[]; realContextId: string | null }> {
  const params = new URLSearchParams({
    frame_Id: 'LogonView',
    frame_Class: 'HTMLView',
    frame_Align: 'client',
    ResultType: 'NORMAL',
    Logon: 'FALSE',
    frame_NoBorder: 'True',
    frame_NoScrollBars: 'true',
    ClientViewId: '0',
    WorldName: ctx.currentWorldInfo?.name || 'Shamba',
    UserName: username,
    DSAddr: config.rdo.directoryHost,
    DSPort: String(config.rdo.ports.directory),
    ISAddr: worldIp,
    ISPort: '8000',
    LangId: '0',
  });

  const url = `http://${worldIp}/Five/0/Visual/Voyager/NewLogon/logonComplete.asp?${params.toString().replace(/\+/g, '%20')}`;
  ctx.log.debug(`[HTTP] Fetching companies from ${url}`);

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

    // Parse companies with regex
    const companies: CompanyInfo[] = [];
    const tdRegex = /<td[^>]*companyId="(\d+)"[^>]*>/gi;
    let tdMatch;

    while ((tdMatch = tdRegex.exec(text)) !== null) {
      const companyId = tdMatch[1];
      const tdElement = tdMatch[0];

      const nameMatch = /companyName="([^"]+)"/i.exec(tdElement);
      const companyName = nameMatch ? nameMatch[1] : `Company ${companyId}`;

      const roleMatch = /companyOwnerRole="([^"]*)"/i.exec(tdElement);
      const ownerRole = roleMatch ? roleMatch[1] : username;

      ctx.log.debug(`[HTTP] Company parsed - ID: ${companyId}, Name: ${companyName}, ownerRole: ${ownerRole} ${roleMatch ? '(from HTML)' : '(defaulted to username)'}`);

      companies.push({ id: companyId, name: companyName, ownerRole });
    }

    ctx.log.debug(`[HTTP] Found ${companies.length} companies, realContextId: ${realId}`);
    return { companies, realContextId: realId };
  } catch (e: unknown) {
    ctx.log.error('[HTTP] Failed to fetch companies:', e);
    return { companies: [], realContextId: null };
  }
}

/**
 * Parse directory query result into WorldInfo array.
 */
function parseDirectoryResult(ctx: LoginContext, payload: string): WorldInfo[] {
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
    ctx.log.warn('[Session] Directory Parse Error: "count" key not found in response.');
    ctx.log.warn('[Session] First 5 keys:', Array.from(data.keys()).slice(0, 5));
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
      population,
      investors,
      online,
      players: online,
      mapSizeX: 0,
      mapSizeY: 0,
      running3,
    });
  }

  return worlds;
}

/**
 * Parse RDOSearchKey results (Count=N, Key0=name0, Key1=name1, ...)
 */
function parseSearchKeyResults(ctx: LoginContext, payload: string): string[] {
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
    ctx.log.warn('[Session] SearchKey: no "count" key in response');
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

// ── World Socket Reconnection ────────────────────────────────────────────────

/**
 * Light reconnection: new TCP socket + IDOF + session validation.
 * Mirrors Delphi InterfaceServer.RenewWorldProxy() pattern.
 * Falls back to full re-login if session expired server-side.
 */
export async function reconnectWorldSocket(ctx: LoginContext): Promise<void> {
  const world = ctx.currentWorldInfo;
  if (!world) throw new Error('No world info for reconnection');

  ctx.log.info(`[Reconnect] Connecting to ${world.ip}:${world.port}...`);

  // 1. Create new TCP socket
  await ctx.createSocket('world', world.ip, world.port);

  // 1b. Re-initialize world connection pool
  ctx.initWorldPool(world.ip, world.port);

  // 2. Re-resolve InterfaceServer IDOF (may have changed after server restart)
  const idPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.IDOF,
    targetId: 'InterfaceServer',
  });
  const newId = parseIdOfResponseHelper(idPacket.payload);
  ctx.setInterfaceServerId(newId);
  ctx.log.debug(`[Reconnect] InterfaceServer ID: ${newId}`);

  // 3. Verify session still valid by reading a property
  try {
    const tycoonPacket = await ctx.sendRdoRequest('world', {
      verb: RdoVerb.SEL,
      targetId: ctx.worldContextId!,
      action: RdoAction.GET,
      member: 'TycoonId',
    });
    const tid = parsePropertyResponseHelper(tycoonPacket.payload!, 'TycoonId');
    ctx.log.info(`[Reconnect] Light reconnection OK (tycoon=${tid})`);
  } catch {
    ctx.log.warn('[Reconnect] Session expired, performing full re-login...');
    await fullWorldRelogin(ctx);
  }
}

/**
 * Full re-login: Logon + RegisterEvents + re-select company.
 * Used when server-side session has expired during disconnect.
 */
async function fullWorldRelogin(ctx: LoginContext): Promise<void> {
  const username = ctx.cachedUsername;
  const password = ctx.cachedPassword;
  if (!username || !password) throw new Error('No cached credentials for re-login');

  const interfaceServerId = ctx.interfaceServerId;
  if (!interfaceServerId) throw new Error('No interfaceServerId for re-login');

  // Logon
  const logonPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: interfaceServerId,
    action: RdoAction.CALL,
    member: 'Logon',
    args: [username, password],
  });

  let contextId = cleanPayloadHelper(logonPacket.payload!);
  if (contextId.includes('res')) {
    contextId = parsePropertyResponseHelper(logonPacket.payload!, 'res');
  }
  if (!contextId || contextId === '0') throw new Error('Re-login failed');

  ctx.setWorldContextId(contextId);

  // Re-read essential properties
  const tycoonPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL, targetId: contextId,
    action: RdoAction.GET, member: 'TycoonId',
  });
  ctx.setTycoonId(parsePropertyResponseHelper(tycoonPacket.payload!, 'TycoonId'));

  const cnntPacket = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL, targetId: contextId,
    action: RdoAction.GET, member: 'RDOCnntId',
  });
  ctx.setRdoCnntId(parsePropertyResponseHelper(cnntPacket.payload!, 'RDOCnntId'));

  // RegisterEvents + SetLanguage
  const rdoCnntId = ctx.rdoCnntId;
  if (rdoCnntId) {
    ctx.sendRdoRequest('world', {
      verb: RdoVerb.SEL, targetId: contextId,
      action: RdoAction.CALL, member: 'RegisterEventsById',
      args: [rdoCnntId],
    }).catch(() => {
      ctx.log.debug('[Reconnect] RegisterEventsById completed (or timed out, normal)');
    });
  }

  const socket = ctx.getSocket('world');
  if (socket) {
    const setLangCmd = RdoCommand.sel(contextId)
      .call('SetLanguage').push()
      .args(RdoValue.string('0')).build();
    socket.write(setLangCmd);
  }

  // Re-select company if one was active
  const company = ctx.currentCompany;
  if (company) {
    await selectCompany(ctx, company.id);
  }

  ctx.log.info(`[Reconnect] Full re-login complete (contextId=${contextId})`);
}
