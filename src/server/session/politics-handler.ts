/**
 * Politics handler — extracted from StarpeaceSession.
 *
 * Every public function takes `ctx: SessionContext` as its first argument.
 * Private helpers (`parsePoliticsRatings`, `fetchMayorDataFromBuilding`,
 * `buildCampaignParams`, `parseCampaignResponse`, `parseRdoConnectionResults`,
 * `getDefaultPoliticsData`) are module-private functions.
 */

import type { SessionContext } from './session-context';
import type {
  FavoritesItem,
  PoliticsData,
  PoliticsRatingEntry,
  ConnectionSearchResult,
} from '../../shared/types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { RdoValue, RdoCommand } from '../../shared/rdo-types';
import { parsePropertyResponse as parsePropertyResponseHelper } from '../rdo-helpers';
import { splitMultilinePayload as splitMultilinePayloadHelper } from '../rdo-helpers';
import { parseFavoritesResponse } from './session-utils';
import { toErrorMessage } from '../../shared/error-utils';
import { config } from '../../shared/config';
import fetch from 'node-fetch';

// =========================================================================
// PRIVATE HELPERS
// =========================================================================

function parsePoliticsRatings(html: string): PoliticsRatingEntry[] {
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

async function fetchMayorDataFromBuilding(ctx: SessionContext, x: number, y: number): Promise<{
  mayorName: string; mayorPrestige: number; mayorRating: number;
  tycoonsRating: number; yearsToElections: number; campaignCount: number;
}> {
  try {
    const propNames = ['ActualRuler', 'RulerPrestige', 'RulerRating', 'TycoonsRating', 'YearsToElections', 'RulerPeriods'];
    const values = await ctx.getCacherPropertyListAt(x, y, propNames);
    return {
      mayorName: values[0] || '',
      mayorPrestige: parseInt(values[1]) || 0,
      mayorRating: parseInt(values[2]) || 0,
      tycoonsRating: parseInt(values[3]) || 0,
      yearsToElections: parseInt(values[4]) || 0,
      campaignCount: parseInt(values[5]) || 0,
    };
  } catch (e: unknown) {
    ctx.log.debug(`[Politics] Could not fetch mayor data from building: ${toErrorMessage(e)}`);
  }
  return { mayorName: '', mayorPrestige: 0, mayorRating: 0, tycoonsRating: 0, yearsToElections: 0, campaignCount: 0 };
}

/**
 * Build URL params for tycoonCampaign.asp.
 * Capitol (president): Capitol=YES, x/y = building coords, TownName empty.
 * Town Hall (mayor): TownName=<name>, Capitol/x/y empty.
 */
function buildCampaignParams(
  ctx: SessionContext,
  action: 'Launch' | 'Cancel', buildingX: number, buildingY: number, townName?: string
): URLSearchParams {
  const isCapitol = !townName;
  return new URLSearchParams({
    WorldName: ctx.currentWorldInfo?.name || '',
    TycoonName: ctx.activeUsername || ctx.cachedUsername || '',
    Password: ctx.cachedPassword || '',
    TownName: townName || '',
    DAAddr: ctx.daAddr || config.rdo.directoryHost,
    DAPort: String(ctx.daPort || config.rdo.ports.directory),
    [action]: 'TRUE',
    Capitol: isCapitol ? 'YES' : '',
    Recache: 'YES',
    x: isCapitol ? String(buildingX) : '',
    y: isCapitol ? String(buildingY) : '',
  });
}

/**
 * Parse the HTML response from tycoonCampaign.asp for success/denial.
 * Denial: contains a `<div class=label>` with an error message.
 * Success: no denial div (may contain project sliders or empty body).
 */
function parseCampaignResponse(html: string): { success: boolean; message: string } {
  // Check for denial message: <div class=label ...>message text</div>
  const denialMatch = html.match(/<div\s+class=label[^>]*>\s*([\s\S]*?)\s*<\/div>/i);
  if (denialMatch) {
    const message = denialMatch[1]
      .replace(/<[^>]*>/g, '')  // strip nested HTML tags
      .replace(/\s+/g, ' ')    // normalize whitespace
      .trim();
    if (message) {
      return { success: false, message };
    }
  }
  // No denial found — treat as success
  return { success: true, message: 'Campaign updated successfully' };
}

/**
 * Parse RDO FindSuppliers/FindClients response.
 * Format: newline-separated rows, each with } delimiters.
 *   FindSuppliers: x}y}FacName}Company}Town}$Price}Quality (7 fields)
 *   FindClients:   x}y}FacName}Company}Town (5 fields)
 */
function parseRdoConnectionResults(
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

/** Default politics data returned when the server is unreachable. */
export function getDefaultPoliticsData(townName: string): PoliticsData {
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

// =========================================================================
// PUBLIC FUNCTIONS
// =========================================================================

export async function fetchOwnedFacilities(ctx: SessionContext): Promise<FavoritesItem[]> {
  if (!ctx.worldContextId) {
    throw new Error('Not logged in — no worldContextId');
  }

  const packet = await ctx.sendRdoRequest('world', {
    verb: RdoVerb.SEL,
    targetId: ctx.worldContextId,
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
export async function getPoliticsData(
  ctx: SessionContext, townName: string, buildingX: number, buildingY: number
): Promise<PoliticsData> {
  const worldIp = ctx.currentWorldInfo?.ip;
  if (!worldIp) {
    return getDefaultPoliticsData(townName);
  }

  try {
    const queryParams = new URLSearchParams({
      WorldName: ctx.currentWorldInfo?.name || '',
      TycoonName: ctx.activeUsername || ctx.cachedUsername || '',
      Password: ctx.cachedPassword || '',
      TownName: townName,
      DAAddr: ctx.daAddr || config.rdo.directoryHost,
      DAPort: String(ctx.daPort || config.rdo.ports.directory),
    });

    const baseUrl = `http://${worldIp}/Five/0/Visual/Voyager/Politics`;

    // Fetch popular ratings page
    const ratingsUrl = `${baseUrl}/popularratings.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
    ctx.log.debug(`[Politics] Fetching popular ratings from ${ratingsUrl}`);
    const ratingsResp = await fetch(ratingsUrl, { redirect: 'follow' });
    const ratingsHtml = await ratingsResp.text();
    const popularRatings = parsePoliticsRatings(ratingsHtml);

    // Fetch IFEL ratings page
    const ifelUrl = `${baseUrl}/ifelratings.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
    ctx.log.debug(`[Politics] Fetching IFEL ratings from ${ifelUrl}`);
    const ifelResp = await fetch(ifelUrl, { redirect: 'follow' });
    const ifelHtml = await ifelResp.text();
    const ifelRatings = parsePoliticsRatings(ifelHtml);

    // Fetch tycoons ratings page
    let tycoonsRatings: PoliticsRatingEntry[] = [];
    try {
      const tycoonsUrl = `${baseUrl}/tycoonsratings.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
      ctx.log.debug(`[Politics] Fetching tycoons ratings from ${tycoonsUrl}`);
      const tycoonsResp = await fetch(tycoonsUrl, { redirect: 'follow' });
      const tycoonsHtml = await tycoonsResp.text();
      tycoonsRatings = parsePoliticsRatings(tycoonsHtml);
    } catch (e: unknown) {
      ctx.log.debug(`[Politics] Tycoons ratings fetch failed: ${toErrorMessage(e)}`);
    }

    // Fetch mayor data from the town hall building properties
    const mayorData = await fetchMayorDataFromBuilding(ctx, buildingX, buildingY);

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
  } catch (e: unknown) {
    ctx.log.warn(`[Politics] Failed to fetch politics data: ${toErrorMessage(e)}`);
    return getDefaultPoliticsData(townName);
  }
}

/**
 * Cast a vote for a candidate in a Town Hall election.
 * Voyager: VotesSheet.pas — RDOVote(voter, votee) on CurrBlock
 */
export async function politicsVote(
  ctx: SessionContext, buildingX: number, buildingY: number, candidateName: string
): Promise<{ success: boolean; message: string }> {
  try {
    await ctx.connectConstructionService();
    if (!ctx.worldId) throw new Error('Construction service not initialized');

    await ctx.connectMapService();
    const tempObjectId = await ctx.cacherCreateObject();
    let currBlock: string;

    try {
      await ctx.cacherSetObject(tempObjectId, buildingX, buildingY);
      const values = await ctx.cacherGetPropertyList(tempObjectId, ['CurrBlock']);
      currBlock = values[0];
      if (!currBlock) throw new Error(`No CurrBlock at (${buildingX}, ${buildingY})`);
    } finally {
      await ctx.cacherCloseObject(tempObjectId);
    }

    const socket = ctx.getSocket('construction');
    if (!socket) throw new Error('Construction socket unavailable');

    const voterName = ctx.activeUsername || ctx.cachedUsername || '';
    const cmd = RdoCommand
      .sel(parseInt(currBlock))
      .call('RDOVote').push()
      .args(RdoValue.string(voterName), RdoValue.string(candidateName))
      .build();

    ctx.log.debug(`[Politics] Voting: ${voterName} → ${candidateName}`);
    socket.write(cmd);
    await new Promise(resolve => setTimeout(resolve, 200));

    return { success: true, message: `Voted for ${candidateName}` };
  } catch (e: unknown) {
    ctx.log.warn(`[Politics] Vote failed: ${toErrorMessage(e)}`);
    return { success: false, message: toErrorMessage(e) };
  }
}

/**
 * Launch a political campaign via ASP proxy.
 * Fetches tycoonCampaign.asp?Launch=TRUE which calls RDOLaunchCampaign
 * and returns HTML with success or denial message.
 * townName: non-empty for Town Hall (mayor), empty for Capitol (president).
 */
export async function politicsLaunchCampaign(
  ctx: SessionContext, buildingX: number, buildingY: number, townName?: string
): Promise<{ success: boolean; message: string }> {
  const worldIp = ctx.currentWorldInfo?.ip;
  if (!worldIp) {
    return { success: false, message: 'Not connected to world' };
  }

  try {
    const queryParams = buildCampaignParams(ctx, 'Launch', buildingX, buildingY, townName);
    const url = `http://${worldIp}/Five/0/Visual/Voyager/Politics/tycooncampaign.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
    ctx.log.debug(`[Politics] Launching campaign via ASP: ${url}`);
    const resp = await fetch(url, { redirect: 'follow' });
    const html = await resp.text();
    return parseCampaignResponse(html);
  } catch (e: unknown) {
    ctx.log.warn(`[Politics] LaunchCampaign failed: ${toErrorMessage(e)}`);
    return { success: false, message: toErrorMessage(e) };
  }
}

/**
 * Cancel a political campaign via ASP proxy.
 * Fetches tycoonCampaign.asp?Cancel=TRUE which calls RDOCancelCampaign.
 * townName: non-empty for Town Hall (mayor), empty for Capitol (president).
 */
export async function politicsCancelCampaign(
  ctx: SessionContext, buildingX: number, buildingY: number, townName?: string
): Promise<{ success: boolean; message: string }> {
  const worldIp = ctx.currentWorldInfo?.ip;
  if (!worldIp) {
    return { success: false, message: 'Not connected to world' };
  }

  try {
    const queryParams = buildCampaignParams(ctx, 'Cancel', buildingX, buildingY, townName);
    const url = `http://${worldIp}/Five/0/Visual/Voyager/Politics/tycooncampaign.asp?${queryParams.toString().replace(/\+/g, '%20')}`;
    ctx.log.debug(`[Politics] Cancelling campaign via ASP: ${url}`);
    const resp = await fetch(url, { redirect: 'follow' });
    const html = await resp.text();
    return parseCampaignResponse(html);
  } catch (e: unknown) {
    ctx.log.warn(`[Politics] CancelCampaign failed: ${toErrorMessage(e)}`);
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
export async function searchConnections(
  ctx: SessionContext,
  buildingX: number, buildingY: number,
  fluidId: string, direction: 'input' | 'output',
  filters?: { company?: string; town?: string; maxResults?: number; roles?: number }
): Promise<ConnectionSearchResult[]> {
  const worldName = ctx.currentWorldInfo?.name || '';
  if (!worldName) {
    ctx.log.warn('[Connections] No world name available for search');
    return [];
  }

  try {
    // Ensure map service is connected (port 6000)
    await ctx.connectMapService();
    if (!ctx.cacherId) {
      ctx.log.warn('[Connections] No cacherId available for search');
      return [];
    }

    const method = direction === 'input' ? 'FindSuppliers' : 'FindClients';
    ctx.log.debug(`[Connections] ${method} for ${fluidId} at (${buildingX}, ${buildingY})`);

    const packet = await ctx.sendRdoRequest('map', {
      verb: RdoVerb.SEL,
      targetId: ctx.cacherId,
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

    const results = parseRdoConnectionResults(packet.payload || '', direction);
    ctx.log.debug(`[Connections] ${method} returned ${results.length} results`);
    return results;
  } catch (e: unknown) {
    ctx.log.warn(`[Connections] ${direction} search failed: ${toErrorMessage(e)}`);
    return [];
  }
}
