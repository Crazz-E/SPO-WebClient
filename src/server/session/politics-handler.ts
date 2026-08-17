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
  PoliticsCampaignEntry,
  PoliticsRatingEntry,
  ConnectionSearchResult,
} from '../../shared/types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { RdoValue, RdoCommand } from '../../shared/rdo-types';
import { parsePropertyResponse as parsePropertyResponseHelper, writeRdoFrame } from '../rdo-helpers';
import { splitMultilinePayload as splitMultilinePayloadHelper } from '../rdo-helpers';
import { parseFavoritesResponse } from './session-utils';
import { toErrorMessage } from '../../shared/error-utils';
import { config } from '../../shared/config';
import fetch from 'node-fetch';

// =========================================================================
// PRIVATE HELPERS
// =========================================================================

/** Drop every tag and collapse the ASP source's tabs/newlines to single spaces. */
function stripTags(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * `<td>` whose `class` is exactly `className`, quoted or not, with any number of
 * further attributes before the closing `>`.
 *
 * The `(?![\w-])` boundary is what keeps `class=label` from matching
 * `class=labelAccountLevel2`; the trailing `[^>]*>` is what lets it match the
 * four event handlers `tycoonratings.asp:136-139` hangs off the same cell.
 */
function cellPattern(className: string): RegExp {
  return new RegExp(
    `<td\\b[^>]*\\bclass\\s*=\\s*["']?${className}(?![\\w-])["']?[^>]*>([\\s\\S]*?)</td>`,
    'i',
  );
}

const RATING_LABEL_CELL = cellPattern('label');
const RATING_VALUE_CELL = cellPattern('value');

/**
 * One table row. The trailing alternation accepts a row the server never closed
 * (a truncated response) without letting the body run into the next row.
 */
const TABLE_ROW = /<tr\b[^>]*>([\s\S]*?)(?:<\/tr>|(?=<tr\b)|$)/gi;

/** `tycoonratings.asp:153-159` — the opinion dropdown, whose options are percentages too. */
const OPINION_SELECT = /<select\b[\s\S]*?<\/select>/gi;

/**
 * Parse one ratings table. The three Politics pages render the same two-cell row.
 *
 * `popularratings.asp:66-73` (and `ifelratings.asp:64-71`, identical but for the
 * property read):
 *
 *     <tr style="margin-top: 2px">
 *         <td class=label>
 *             <%= CacheObj.Name( LangId ) %>
 *         </td>
 *         <td class=value align="right">
 *             <%= CacheObj.PeopleRating %>%
 *         </td>
 *     </tr>
 *
 * `tycoonratings.asp:135-162` renders the same pair, but hangs four event
 * handlers off each cell and wraps the number two levels deep:
 *
 *     <td class=label
 *         OnMouseOver="onRowMouseOver()" … onClick="onRowMouseClick()">
 *     <td class=value align="right" OnMouseOver=… >
 *         <div id=LabelDiv_<Id> class=value>
 *             <span id=Value_<Id>><%= CacheObj.TycoonsRating %>%</span>
 *
 * Two defects this row-scoped form kills:
 *
 *  - the old pattern demanded `<td class=label>` with an IMMEDIATE `>`, so it
 *    never matched one single `tycoonratings.asp` row — the tab was structurally
 *    empty (audit B-4, second half);
 *  - it also let `[\s\S]*?` run across row boundaries: a value the server
 *    rendered empty paired label N with the value of row N+1 and shifted the
 *    whole table, silently (audit B-18). A row now stands or falls alone.
 *
 * Rows without both cells are skipped by construction: the 1-pixel separator
 * (`popularratings.asp:74-77`) and the trailing note (`tycoonratings.asp:174-187`,
 * a `class=label` cell with no value cell) never reach the output.
 */
export function parsePoliticsRatings(html: string): PoliticsRatingEntry[] {
  const ratings: PoliticsRatingEntry[] = [];
  TABLE_ROW.lastIndex = 0;
  let row: RegExpExecArray | null;
  while ((row = TABLE_ROW.exec(html)) !== null) {
    const labelCell = RATING_LABEL_CELL.exec(row[1]);
    const valueCell = RATING_VALUE_CELL.exec(row[1]);
    if (!labelCell || !valueCell) continue;

    const name = stripTags(labelCell[1]);
    if (!name) continue;

    const text = stripTags(valueCell[1].replace(OPINION_SELECT, ' '));
    const numeric = /-?\d+(?:\.\d+)?/.exec(text);
    ratings.push({ name, value: numeric ? parseFloat(numeric[0]) : 0 });
  }
  return ratings;
}

/**
 * Fetch one Politics ratings page.
 *
 * `resp.ok` is the only signal these pages give for "page missing", and it went
 * unread for the whole life of this code: `tycoonratings.asp` was requested as
 * `tycoonsratings.asp`, IIS answered 404 with an HTML error body, the
 * surrounding `try/catch` therefore never fired, and the tab stayed empty
 * without a single log line (audit A-12 / B-4, first half).
 *
 * An absent ratings FOLDER is a different case and is NOT an error: it is a 200
 * with an empty table (`popularratings.asp:60` `if not Itr.Empty`), which
 * legitimately parses to `[]`.
 */
async function fetchRatingsPage(
  ctx: SessionContext, url: string, label: string
): Promise<PoliticsRatingEntry[]> {
  ctx.log.debug(`[Politics] Fetching ${label} from ${url}`);
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) {
    ctx.log.warn(`[Politics] ${label} page answered HTTP ${resp.status} — ${url}`);
    return [];
  }
  return parsePoliticsRatings(await resp.text());
}

async function fetchMayorDataFromBuilding(ctx: SessionContext, x: number, y: number): Promise<{
  mayorName: string; mayorPrestige: number; mayorRating: number;
  tycoonsRating: number; yearsToElections: number; campaignCount: number;
  campaigns: PoliticsCampaignEntry[];
}> {
  const empty = { mayorName: '', mayorPrestige: 0, mayorRating: 0, tycoonsRating: 0, yearsToElections: 0, campaignCount: 0, campaigns: [] as PoliticsCampaignEntry[] };
  try {
    const propNames = ['ActualRuler', 'RulerPrestige', 'RulerRating', 'TycoonsRating', 'YearsToElections', 'CampaignCount'];
    const values = await ctx.getCacherPropertyListAt(x, y, propNames);
    const campaignCount = parseInt(values[5]) || 0;

    // Fetch campaign candidate data if any campaigns exist
    const campaigns: PoliticsCampaignEntry[] = [];
    if (campaignCount > 0) {
      const candidateProps: string[] = [];
      for (let i = 0; i < campaignCount; i++) {
        candidateProps.push(`Candidate${i}`, `CmpRat${i}`);
      }
      try {
        const candidateValues = await ctx.getCacherPropertyListAt(x, y, candidateProps);
        for (let i = 0; i < campaignCount; i++) {
          const name = candidateValues[i * 2] || '';
          const rating = parseInt(candidateValues[i * 2 + 1]) || 0;
          if (name) {
            campaigns.push({ candidateName: name, rating });
          }
        }
      } catch (e: unknown) {
        ctx.log.debug(`[Politics] Could not fetch campaign candidates: ${toErrorMessage(e)}`);
      }
    }

    return {
      mayorName: values[0] || '',
      mayorPrestige: parseInt(values[1]) || 0,
      mayorRating: parseInt(values[2]) || 0,
      tycoonsRating: parseInt(values[3]) || 0,
      yearsToElections: parseInt(values[4]) || 0,
      campaignCount,
      campaigns,
    };
  } catch (e: unknown) {
    ctx.log.debug(`[Politics] Could not fetch mayor data from building: ${toErrorMessage(e)}`);
  }
  return empty;
}

/**
 * Build URL params for tycooncampaign.asp — parameter for parameter the form the
 * page's own buttons carry (`tycooncampaign.asp:233`, `:380`).
 *
 * Capitol (president): Capitol=YES, x/y = building coords, TownName empty.
 * Town Hall (mayor): TownName=<name>, Capitol/x/y empty.
 *
 * `Recache=YES` is not decoration: `:12` reads it, `:29` and `:90` push it into
 * `Town.Recache` and `CacheObject.Recache`, so the response is re-rendered from
 * a FRESH read of the campaign cache. That is what makes the state-after oracle
 * of `parseCampaignResponse` sound on this page.
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
 * The two mutually exclusive state markers `tycooncampaign.asp` publishes.
 *
 * `:233` renders the "Withdraw Campaign" button — and only that button carries
 * `Cancel=TRUE` — when the campaign exists (`:222` `FullAccess and LaunchError = 0`,
 * `:223` not the ruler, `:224` `CacheObjectValid`).
 * `:380` renders the "Launch Campaign" button — the only `Launch=TRUE` — on the
 * same page when the campaign does NOT exist (`:362`).
 *
 * The third button (`:339`, "Check Minister Names") carries neither, so the two
 * patterns cannot both be true.
 */
const CAMPAIGN_CANCEL_BUTTON = /info\s*=\s*["'][^"']*tycooncampaign\.asp\?[^"']*[?&]Cancel=TRUE/i;
const CAMPAIGN_LAUNCH_BUTTON = /info\s*=\s*["'][^"']*tycooncampaign\.asp\?[^"']*[?&]Launch=TRUE/i;

/** `tycooncampaign.asp:364`, `:391`, `:400` — the only three `<div class=label>` on the page. */
const CAMPAIGN_LABEL_DIV = /<div\s+class\s*=\s*["']?label(?![\w-])["']?[^>]*>([\s\S]*?)<\/div>/i;

/** The sentence the page shows, without the button table `:364`/`:372` nests inside it. */
function campaignLabelText(html: string): string {
  const match = CAMPAIGN_LABEL_DIV.exec(html);
  return match ? stripTags(match[1].split(/<table\b/i)[0]) : '';
}

export type CampaignAction = 'Launch' | 'Cancel';

/**
 * Read the outcome of a campaign mutation off `tycooncampaign.asp`.
 *
 * **The state after is the oracle.** The page this returns IS the campaign page
 * re-rendered: `:89-96` re-reads the campaign cache object after the RDO call,
 * and `:90` honours `Recache` — which `buildCampaignParams` always sends as
 * `Recache=YES` (`:233`, `:380`, our `:12`). So a launch that took effect is
 * visible in this very response, and the usual COM-cache-freshness reservation
 * does NOT apply to this page.
 *
 * What the previous heuristic — "success = the page carries no `<div class=label>`" —
 * got wrong, in both directions (audit B-5):
 *
 *  ① a **wrong password** makes `FullAccess` false (`:48`), the RDO call is never
 *    issued (`:50`, `:67`), and `:400-413` renders a label div that is EMPTY
 *    because its inner `if FullAccess` is false → reported as success;
 *  ② a `LaunchError` outside {100, 101, 102} falls through a `select case` with
 *    no `case else` (`:402-411`) → same empty div → reported as success;
 *  ③ a **successful withdrawal** makes `CacheObjectValid` false (`:91-96`), so
 *    `:364` renders the "you are not participating" invitation — a non-empty
 *    label div → reported as failure. The nominal path was the failing one.
 *
 * `RDOCancelCampaign`'s own result is not usable: `:76` calls it without
 * assigning (unlike `:59`), so the code never reaches the page.
 */
export function parseCampaignResponse(
  html: string, action: CampaignAction
): { success: boolean; message: string } {
  const campaignRuns = CAMPAIGN_CANCEL_BUTTON.test(html);
  const campaignAbsent = CAMPAIGN_LAUNCH_BUTTON.test(html);
  const published = campaignLabelText(html);

  if (action === 'Launch') {
    if (campaignRuns) {
      return { success: true, message: 'Campaign launched' };
    }
    // Still no campaign: either the page published a reason (`:403` code 100,
    // `:406`/`:408` code 101, `:410` code 102, `:391` already the ruler, `:364`
    // the launch invitation) or it published nothing at all — cases ① and ②.
    return {
      success: false,
      message: published || 'Campaign launch refused — the page published no reason',
    };
  }

  if (campaignAbsent) {
    return { success: true, message: 'Campaign withdrawn' };
  }
  if (campaignRuns) {
    return { success: false, message: 'Campaign withdrawal refused — the campaign is still running' };
  }
  return {
    success: false,
    message: published || 'Campaign withdrawal refused — the page published no reason',
  };
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
  }, undefined, TimeoutCategory.NORMAL);

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
    const query = queryParams.toString().replace(/\+/g, '%20');

    const popularRatings = await fetchRatingsPage(ctx, `${baseUrl}/popularratings.asp?${query}`, 'popular ratings');
    const ifelRatings = await fetchRatingsPage(ctx, `${baseUrl}/ifelratings.asp?${query}`, 'IFEL ratings');

    // `tycoonratings.asp` — SINGULAR. This call asked for `tycoonsratings.asp`
    // for the whole life of the file; no such page exists among the 2 774 `.asp`
    // of the Voyager tree, so every request 404'd and the tab was permanently
    // empty (audit A-12 / B-4). The page reads the same five parameters as its
    // two siblings (`tycoonratings.asp:6-22`), plus `Password` (`:103`), which
    // `queryParams` already carries.
    let tycoonsRatings: PoliticsRatingEntry[] = [];
    try {
      tycoonsRatings = await fetchRatingsPage(ctx, `${baseUrl}/tycoonratings.asp?${query}`, 'tycoon ratings');
    } catch (e: unknown) {
      // Kept narrower than the outer catch on purpose: a transport failure on
      // this optional tab must not empty the two ratings lists already read.
      ctx.log.warn(`[Politics] Tycoons ratings fetch failed: ${toErrorMessage(e)}`);
    }

    // Fetch mayor data from the town hall building properties
    const mayorData = await fetchMayorDataFromBuilding(ctx, buildingX, buildingY);

    // Always enable the campaign button — server-side ASP (tycooncampaign.asp) validates
    // prestige, timing, and eligibility and returns a specific denial message if rejected.
    // The old check used mayorPrestige (the ruler's prestige, not the user's).
    const canLaunchCampaign = true;
    const campaignMessage = '';

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
      campaigns: mayorData.campaigns,
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
    writeRdoFrame(socket, cmd);
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
    // `resp.ok` catches the absent page and the IIS fault, nothing more: the 298
    // Voyager pages carry no `Response.Status`, so a refused launch and a wrong
    // password both answer 200. The body is the oracle — see parseCampaignResponse.
    if (!resp.ok) {
      return { success: false, message: `Launch campaign failed: HTTP ${resp.status}` };
    }
    return parseCampaignResponse(html, 'Launch');
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
    // Same reasoning as politicsLaunchCampaign above.
    if (!resp.ok) {
      return { success: false, message: `Cancel campaign failed: HTTP ${resp.status}` };
    }
    return parseCampaignResponse(html, 'Cancel');
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
      // Delphi: FindSuppliers/FindClients(Output, World, Town, Name: widestring;
      //         Count, X, Y, SortMode, Role: integer) — CacheServerReportForm.pas:108-109
      // Explicit OLEString on every widestring parameter (P-M2): the town and
      // company filters are free text typed by the player.
      args: [
        RdoValue.string(fluidId).format(),                  // Output (widestring)
        RdoValue.string(worldName).format(),                // World (widestring)
        RdoValue.string(filters?.town || '').format(),      // Town filter (empty = all)
        RdoValue.string(filters?.company || '').format(),   // Name/company filter (empty = all)
        RdoValue.int(filters?.maxResults || 20).format(),   // Count
        RdoValue.int(buildingX).format(),                   // X
        RdoValue.int(buildingY).format(),                   // Y
        RdoValue.int(1).format(),                           // SortMode (1=quality)
        RdoValue.int(filters?.roles || 31).format(),        // Role bitmask (31 = all 5 roles)
      ],
      // Cache Server supply-chain search across the whole world — the member is
      // chosen at runtime (FindSuppliers / FindClients), so no literal to key on.
    }, undefined, TimeoutCategory.SLOW);

    const results = parseRdoConnectionResults(packet.payload || '', direction);
    ctx.log.debug(`[Connections] ${method} returned ${results.length} results`);
    return results;
  } catch (e: unknown) {
    ctx.log.warn(`[Connections] ${direction} search failed: ${toErrorMessage(e)}`);
    return [];
  }
}
