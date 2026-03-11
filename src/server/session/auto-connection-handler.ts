/**
 * Auto-connection, policy, and curriculum-action handler functions.
 *
 * Extracted from `StarpeaceSession` — each public function takes a
 * `SessionContext` as its first argument so it can be tested in isolation.
 */

import type { SessionContext } from './session-context';
import type {
  AutoConnectionsData,
  AutoConnectionFluid,
  SupplierEntry,
  PolicyData,
  PolicyEntry,
} from '../../shared/types';
import { extractAllActionUrls } from '../asp-url-extractor';
import { toErrorMessage } from '../../shared/error-utils';
import { config } from '../../shared/config';
import fetch from 'node-fetch';

// ===========================================================================
// AUTO-CONNECTIONS
// ===========================================================================

/**
 * Fetch the auto-connections page and return parsed fluid/supplier data.
 */
export async function fetchAutoConnections(ctx: SessionContext): Promise<AutoConnectionsData> {
  try {
    const aspPath = 'NewTycoon/TycoonAutoConnections.asp';
    const baseUrl = ctx.buildAspUrl(aspPath, { RIWS: '' });
    const html = await ctx.fetchAspPage(aspPath, { RIWS: '' });
    return parseAutoConnectionsHtml(ctx, html, baseUrl);
  } catch (e: unknown) {
    ctx.log.warn('[AutoConnections] ASP fetch failed:', e);
    return { fluids: [] };
  }
}

/**
 * Parse TycoonAutoConnections.asp HTML response.
 * Fluid headers: `<div id="FluidName" class=header3>`.
 * Supplier rows: `<tr id=FluidN fluid=Fluid facilityId="x,y,">` with facility/company names.
 * Checkboxes: HireTC (trade center) and HireWH (warehouses only).
 */
function parseAutoConnectionsHtml(ctx: SessionContext, html: string, baseUrl: string): AutoConnectionsData {
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
      ctx.setAspActionCache('NewTycoon/TycoonAutoConnections.asp', actionUrls);
      ctx.log.debug(`[AutoConnections] Cached ${actionUrls.size} action URL(s) from ASP HTML`);
    }
  }

  return { fluids };
}

/**
 * Execute an auto-connection action via IS HTTP ASP pages.
 * Delete: DeleteDefaultSupplier.asp, Toggle TC: ModifyTradeCenterStatus.asp,
 * Toggle WH: ModifyWarehouseStatus.asp. These match the legacy Voyager pattern.
 */
export async function executeAutoConnectionAction(
  ctx: SessionContext,
  action: string,
  fluidId: string,
  suppliers?: string
): Promise<{ success: boolean; message?: string }> {
  const worldIp = ctx.currentWorldInfo?.ip;
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
  const tycoonId = ctx.tycoonId || '';

  try {
    // 1. Try cached URL from last fetchAutoConnections() ASP parse
    const cached = ctx.getAspActionCache('NewTycoon/TycoonAutoConnections.asp');
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
      ctx.log.debug(`[AutoConnections] Using cached URL for ${action}`);
    } else {
      // Fallback: reconstruct URL from session state
      switch (action) {
        case 'add': {
          if (!suppliers) return { success: false, message: 'Supplier facility coordinates required' };
          const params = new URLSearchParams({
            TycoonId: tycoonId,
            FluidId: fluidId,
            DAAddr: ctx.daAddr || config.rdo.directoryHost,
            DAPort: String(ctx.daPort || config.rdo.ports.directory),
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
            DAAddr: ctx.daAddr || config.rdo.directoryHost,
            DAPort: String(ctx.daPort || config.rdo.ports.directory),
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
            DAAddr: ctx.daAddr || config.rdo.directoryHost,
            WorldName: ctx.currentWorldInfo?.name || '',
            Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
            Password: ctx.cachedPassword || '',
            DAPort: String(ctx.daPort || config.rdo.ports.directory),
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
            DAAddr: ctx.daAddr || config.rdo.directoryHost,
            WorldName: ctx.currentWorldInfo?.name || '',
            Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
            Password: ctx.cachedPassword || '',
            DAPort: String(ctx.daPort || config.rdo.ports.directory),
            Hire: action === 'onlyWarehouses' ? 'YES' : 'NO',
          });
          url = `${basePath}ModifyWarehouseStatus.asp?${params.toString().replace(/\+/g, '%20')}`;
          break;
        }
        default:
          return { success: false, message: `Unknown action: ${action}` };
      }
      ctx.log.debug(`[AutoConnections] No cached URL for ${action}, reconstructing`);
    }

    ctx.log.debug(`[AutoConnections] Executing ${action}: ${url}`);
    await fetch(url, { redirect: 'follow' });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, message: toErrorMessage(e) };
  }
}

// ===========================================================================
// POLICY
// ===========================================================================

/**
 * Fetch policy data (diplomatic relationships) via TycoonPolicy.asp on IS HTTP server.
 */
export async function fetchPolicy(ctx: SessionContext): Promise<PolicyData> {
  try {
    const aspPath = 'NewTycoon/TycoonPolicy.asp';
    const baseUrl = ctx.buildAspUrl(aspPath, { RIWS: '' });
    const html = await ctx.fetchAspPage(aspPath, { RIWS: '' });
    return parsePolicyHtml(ctx, html, baseUrl);
  } catch (e: unknown) {
    ctx.log.warn('[Policy] ASP fetch failed:', e);
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
function parsePolicyHtml(ctx: SessionContext, html: string, baseUrl: string): PolicyData {
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
    ctx.setAspActionCache('NewTycoon/TycoonPolicy.asp', actionUrls);
    ctx.log.debug(`[Policy] Cached ${actionUrls.size} action URL(s) from ASP HTML`);
  }

  return { policies };
}

/**
 * Set diplomatic policy towards another tycoon via TycoonPolicy.asp POST.
 * Uses the form action URL extracted from the last fetchPolicy() ASP response
 * when available, falling back to URL reconstruction if the cache is cold.
 */
export async function setPolicyStatus(
  ctx: SessionContext,
  tycoonName: string,
  status: number
): Promise<{ success: boolean; message?: string }> {
  const worldIp = ctx.currentWorldInfo?.ip;
  if (!worldIp) return { success: false, message: 'World IP not available' };

  try {
    // 1. Try cached form action URL from last ASP HTML parse
    const cached = ctx.getAspActionCache('NewTycoon/TycoonPolicy.asp');
    const formAction = cached?.get('TycoonPolicy.asp');

    let url: string;
    if (formAction) {
      url = formAction.url;
      ctx.log.debug('[Policy] Using cached form action URL');
    } else {
      // Fallback: reconstruct URL from session state
      const queryParams = new URLSearchParams({
        Action: 'modify',
        WorldName: ctx.currentWorldInfo?.name || '',
        Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
        TycoonId: ctx.tycoonId || '',
        Password: ctx.cachedPassword || '',
        DAAddr: ctx.daAddr || config.rdo.directoryHost,
        DAPort: String(ctx.daPort || config.rdo.ports.directory),
      });
      url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/TycoonPolicy.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
      ctx.log.debug('[Policy] No cached URL, reconstructing');
    }

    // 2. POST body matches the form: NextStatus + SubTycoon + Subject + Status
    const body = new URLSearchParams({
      NextStatus: String(status),
      SubTycoon: tycoonName,
      Subject: tycoonName,
      Status: String(status),
    });

    ctx.log.debug(`[Policy] Setting policy for ${tycoonName} to ${status}`);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'follow',
    });

    return { success: true };
  } catch (e: unknown) {
    return { success: false, message: toErrorMessage(e) };
  }
}

// ===========================================================================
// PROFILE CURRICULUM ACTIONS
// ===========================================================================

/**
 * Execute a curriculum action: reset account, abandon role, upgrade level, or rebuild links.
 */
export async function executeCurriculumAction(
  ctx: SessionContext,
  action: string,
  value?: boolean
): Promise<{ success: boolean; message?: string }> {
  const worldIp = ctx.currentWorldInfo?.ip;
  if (!worldIp) return { success: false, message: 'World IP not available' };

  // Map action names to ASP filenames for cache lookup
  const actionToAsp: Record<string, string> = {
    resetAccount: 'rdoResetTycoon.asp',
    abandonRole: 'abandonRole.asp',
    upgradeLevel: 'rdoSetAdvanceLevel.asp',
    rebuildLinks: 'links.asp',
  };

  try {
    // 1. Try cached URL from last fetchCurriculumData() ASP parse
    const cached = ctx.getAspActionCache('NewTycoon/TycoonCurriculum.asp');
    const aspKey = actionToAsp[action];
    const cachedAction = aspKey ? cached?.get(aspKey) : undefined;

    let url: string;
    if (cachedAction) {
      url = cachedAction.url;
      // For upgradeLevel, the cached URL has an empty Value= (dynamic in ASP JS).
      // Substitute with the actual boolean value.
      if (action === 'upgradeLevel' && value !== undefined) {
        url = url.replace(/Value=[^&]*/, `Value=${value}`);
      }
      ctx.log.debug(`[Curriculum] Using cached URL for ${action}`);
    } else {
      // Fallback: reconstruct URL from session state
      switch (action) {
        case 'resetAccount': {
          const params = new URLSearchParams({
            Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
            WorldName: ctx.currentWorldInfo?.name || '',
            DAAddr: ctx.daAddr || config.rdo.directoryHost,
            DAPort: String(ctx.daPort || config.rdo.ports.directory),
            TycoonId: '',
            Password: ctx.cachedPassword || '',
          });
          url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/rdoResetTycoon.asp?${params.toString().replace(/\+/g, '%20')}`;
          break;
        }
        case 'abandonRole': {
          const params = new URLSearchParams({
            Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
            WorldName: ctx.currentWorldInfo?.name || '',
            DAAddr: ctx.daAddr || config.rdo.directoryHost,
            DAPort: String(ctx.daPort || config.rdo.ports.directory),
            TycoonId: '',
            Password: ctx.cachedPassword || '',
          });
          url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/abandonRole.asp?${params.toString().replace(/\+/g, '%20')}`;
          break;
        }
        case 'upgradeLevel': {
          const params = new URLSearchParams({
            TycoonId: ctx.tycoonId || '',
            Password: ctx.cachedPassword || '',
            Value: String(value ?? true),
            WorldName: ctx.currentWorldInfo?.name || '',
            DAAddr: ctx.daAddr || config.rdo.directoryHost,
            DAPort: String(ctx.daPort || config.rdo.ports.directory),
            Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
          });
          url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/rdoSetAdvanceLevel.asp?${params.toString().replace(/\+/g, '%20')}`;
          break;
        }
        case 'rebuildLinks': {
          const params = new URLSearchParams({
            Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
            Password: ctx.cachedPassword || '',
            Company: ctx.currentCompany?.name || '',
            WorldName: ctx.currentWorldInfo?.name || '',
            DAAddr: ctx.daAddr || config.rdo.directoryHost,
            DAPort: String(ctx.daPort || config.rdo.ports.directory),
            ISAddr: worldIp,
            ISPort: '8000',
            ClientViewId: String(ctx.interfaceServerId || ''),
            RIWS: '',
          });
          url = `http://${worldIp}/Five/0/visual/voyager/util/links.asp?${params.toString().replace(/\+/g, '%20')}`;
          break;
        }
        default:
          return { success: false, message: `Unknown curriculum action: ${action}` };
      }
      ctx.log.debug(`[Curriculum] No cached URL for ${action}, reconstructing`);
    }

    ctx.log.debug(`[Curriculum] Executing ${action}: ${url}`);
    const resp = await fetch(url, { redirect: 'follow' });
    const body = await resp.text();
    ctx.log.debug(`[Curriculum] ${action} response: ${resp.status} (${body.length} bytes)`);
    if (!resp.ok) {
      return { success: false, message: `${action} failed: HTTP ${resp.status}` };
    }
    return { success: true, message: `${action} completed successfully` };
  } catch (e: unknown) {
    return { success: false, message: toErrorMessage(e) };
  }
}
