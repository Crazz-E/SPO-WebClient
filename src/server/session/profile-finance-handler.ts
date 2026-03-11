/**
 * Profile & Finance handler — extracted from StarpeaceSession.
 *
 * Handles tycoon profile, curriculum, bank account, profit/loss, and companies.
 * Each public function takes `ctx: SessionContext` as its first argument.
 */

import type { SessionContext } from './session-context';
import type {
  TycoonProfileFull,
  CurriculumData,
  BankAccountData,
  LoanInfo,
  BankActionResult,
  ProfitLossData,
  ProfitLossNode,
  CompaniesData,
  CompanyListItem,
} from '../../shared/types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { parsePropertyResponse as parsePropertyResponseHelper } from '../rdo-helpers';
import { extractAllActionUrls } from '../asp-url-extractor';
import { toErrorMessage } from '../../shared/error-utils';
import { config } from '../../shared/config';
import fetch from 'node-fetch';

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC — fetchTycoonProfile
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchTycoonProfile(ctx: SessionContext): Promise<TycoonProfileFull> {
  // Get name via IS proxy (TClientView.GetUserName is published)
  let name = ctx.activeUsername || ctx.cachedUsername || '';
  if (ctx.interfaceServerId) {
    try {
      const namePacket = await ctx.sendRdoRequest('world', {
        verb: RdoVerb.SEL,
        targetId: String(ctx.interfaceServerId),
        action: RdoAction.CALL,
        member: 'GetUserName',
        args: [],
      });
      const parsed = parsePropertyResponseHelper(namePacket.payload!, 'res');
      if (parsed && !parsed.startsWith('error')) name = parsed;
    } catch (e: unknown) {
      ctx.log.warn('[Profile] GetUserName failed, using cached username:', e);
    }
  }

  const profile: TycoonProfileFull = {
    name,
    realName: '',
    ranking: ctx.lastRanking,
    budget: ctx.accountMoney || '0',
    prestige: 0,
    facPrestige: 0,
    researchPrestige: 0,
    facCount: ctx.lastBuildingCount,
    facMax: ctx.lastMaxBuildings,
    area: 0,
    nobPoints: 0,
    licenceLevel: 0,
    failureLevel: ctx.failureLevel || 0,
    levelName: '',
    levelTier: 0,
  };

  // Try to enrich with curriculum ASP page data
  try {
    const html = await ctx.fetchAspPage('NewTycoon/TycoonCurriculum.asp', { RIWS: '' });
    parseCurriculumHtml(html, profile);
  } catch (e: unknown) {
    ctx.log.warn('[Profile] TycoonCurriculum.asp fetch failed, using push data only:', e);
  }

  // Try to fetch avatar photo from RenderTycoon.asp
  try {
    const worldIp = ctx.currentWorldInfo?.ip;
    const worldName = ctx.currentWorldInfo?.name || '';
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
  } catch (e: unknown) {
    ctx.log.warn('[Profile] RenderTycoon.asp photo fetch failed:', e);
  }

  ctx.log.debug(`[Profile] Fetched tycoon profile: ${profile.name} (Ranking #${profile.ranking})`);
  return profile;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE — parseCurriculumHtml
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse TycoonCurriculum.asp HTML to extract level/prestige data into a profile.
 * The ASP page renders level images (e.g., levelParadigm.gif) and prestige values.
 */
function parseCurriculumHtml(html: string, profile: TycoonProfileFull): void {
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

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC — fetchCurriculumData
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch curriculum data — fetches TycoonCurriculum.asp and parses all sections:
 * summary stats, level progression, rankings, and curriculum items.
 */
export async function fetchCurriculumData(ctx: SessionContext): Promise<CurriculumData> {
  const profile = await fetchTycoonProfile(ctx);
  const levelNames = ['Apprentice', 'Entrepreneur', 'Tycoon', 'Master', 'Paradigm', 'Legend', 'BeyondLegend'];
  const level = Math.min(profile.licenceLevel, levelNames.length - 1);

  // Fetch the raw HTML again for detailed curriculum-specific parsing
  const aspPath = 'NewTycoon/TycoonCurriculum.asp';
  let html = '';
  let baseUrl = '';
  try {
    baseUrl = ctx.buildAspUrl(aspPath, { RIWS: '' });
    html = await ctx.fetchAspPage(aspPath, { RIWS: '' });
  } catch {
    ctx.log.warn('[Profile] TycoonCurriculum.asp re-fetch for curriculum details failed');
  }

  return parseCurriculumDetails(ctx, html, profile, level, levelNames, baseUrl);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE — parseCurriculumDetails
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse full curriculum details from TycoonCurriculum.asp HTML.
 * Extracts: fortune, average profit, level descriptions, rankings, curriculum items.
 */
function parseCurriculumDetails(
  ctx: SessionContext,
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
      ctx.setAspActionCache('NewTycoon/TycoonCurriculum.asp', actionUrls);
      ctx.log.debug(`[Curriculum] Cached ${actionUrls.size} action URL(s) from ASP HTML`);
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

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC — fetchBankAccount
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch bank account data via TycoonBankAccount.asp on IS HTTP server.
 * Parses budget, loan list, interest rates, and terms from the ASP HTML response.
 */
export async function fetchBankAccount(ctx: SessionContext): Promise<BankAccountData> {
  const aspPath = 'NewTycoon/TycoonBankAccount.asp';
  const baseUrl = ctx.buildAspUrl(aspPath, { RIWS: '' });
  const html = await ctx.fetchAspPage(aspPath, { RIWS: '' });
  return parseBankAccountHtml(ctx, html, baseUrl);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE — parseBankAccountHtml
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse TycoonBankAccount.asp HTML response.
 * Budget: `var budget = <number>;` in script block.
 * MaxLoan: `var maxVal = new Number(NNN)` in script block.
 * TotalLoans: `var loans = new Number(NNN)` in script block.
 * Loan rows: `<tr id="rN" lid="N">` with cells: Bank, Date, Amount, Interest, Term, Next payment.
 */
function parseBankAccountHtml(ctx: SessionContext, html: string, baseUrl: string): BankAccountData {
  // Extract budget from JS variable
  let balance = ctx.accountMoney || '0';
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
      ctx.setAspActionCache('NewTycoon/TycoonBankAccount.asp', actionUrls);
      ctx.log.debug(`[Bank] Cached ${actionUrls.size} action URL(s) from ASP HTML`);
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

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC — executeBankAction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a bank action (borrow, send, payoff) via TycoonBankAccount.asp.
 * The legacy Voyager client performs these as GET requests with Action params.
 */
export async function executeBankAction(
  ctx: SessionContext,
  action: string,
  amount?: string,
  toTycoon?: string,
  reason?: string,
  loanIndex?: number
): Promise<BankActionResult> {
  try {
    const worldIp = ctx.currentWorldInfo?.ip;
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
    const cached = ctx.getAspActionCache('NewTycoon/TycoonBankAccount.asp');
    const formAction = cached?.get('TycoonBankAccount.asp');

    let url: string;
    if (formAction) {
      // Append action-specific params to cached base URL
      const separator = formAction.url.includes('?') ? '&' : '?';
      url = formAction.url + separator + extraParams.toString().replace(/\+/g, '%20');
      ctx.log.debug(`[Bank] Using cached form action URL for ${action}`);
    } else {
      // Fallback: reconstruct URL from session state
      const baseParams = new URLSearchParams({
        Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
        Password: ctx.cachedPassword || '',
        Company: ctx.currentCompany?.name || '',
        WorldName: ctx.currentWorldInfo?.name || '',
        DAAddr: ctx.daAddr || config.rdo.directoryHost,
        DAPort: String(ctx.daPort || config.rdo.ports.directory),
        SecurityId: '',
      });
      for (const [k, v] of extraParams) baseParams.set(k, v);
      url = `http://${worldIp}/Five/0/Visual/Voyager/NewTycoon/TycoonBankAccount.asp?${baseParams.toString().replace(/\+/g, '%20')}`;
      ctx.log.debug(`[Bank] No cached URL for ${action}, reconstructing`);
    }

    ctx.log.debug(`[Bank] Executing ${action}: ${url}`);
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
      ctx.setAccountMoney(budgetMatch[1]);
    }

    return { success: true, message: `${action} completed successfully` };
  } catch (e: unknown) {
    return { success: false, message: toErrorMessage(e) };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC — fetchProfitLoss
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch profit & loss data via TycoonProfitAndLoses.asp on IS HTTP server.
 * Parses the full hierarchical P&L tree from the ASP HTML response.
 */
export async function fetchProfitLoss(ctx: SessionContext): Promise<ProfitLossData> {
  const html = await ctx.fetchAspPage('NewTycoon/TycoonProfitAndLoses.asp', { RIWS: '' });
  return parseProfitLossHtml(html);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE — parseProfitLossHtml
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse TycoonProfitAndLoses.asp HTML response.
 * Each row: `<div class=labelAccountLevel{N}>` label, then `$<amount>` in sibling div.
 * Chart data: `ChartInfo=<count>,<values...>` in href attributes.
 * Builds hierarchical ProfitLossNode tree by nesting levels.
 */
function parseProfitLossHtml(html: string): ProfitLossData {
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
    const label = match[2].replace(/<[^>]*>/g, '').trim();
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

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC — fetchCompanies
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch companies list via chooseCompany.asp on IS HTTP server.
 * This matches the legacy Voyager client and shows cluster, facility count, etc.
 */
export async function fetchCompanies(ctx: SessionContext): Promise<CompaniesData> {
  const currentCompany = ctx.currentCompany?.name || '';

  try {
    const html = await ctx.fetchAspPage('NewLogon/chooseCompany.asp', {
      Logon: 'FALSE',
      UserName: ctx.activeUsername || ctx.cachedUsername || '',
      RIWS: '',
    });
    const companies = parseCompaniesHtml(ctx, html);
    const worldName = ctx.currentWorldInfo?.name || '';
    return { companies, currentCompany, worldName };
  } catch (e: unknown) {
    ctx.log.warn('[Companies] ASP fetch failed:', e);
    const worldName = ctx.currentWorldInfo?.name || '';
    return { companies: [], currentCompany, worldName };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE — parseCompaniesHtml
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse chooseCompany.asp HTML response.
 * Companies: `<td ... companyId="N" companyName="..." companyOwnerRole="...">` elements.
 * Cluster: from CompanyCluster= in "more info" link.
 * Facility count: from "<nobr> N Facilities </nobr>" text.
 */
function parseCompaniesHtml(ctx: SessionContext, html: string): CompanyListItem[] {
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
    const ownerRole = roleMatch ? roleMatch[1] : ctx.cachedUsername || '';

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
