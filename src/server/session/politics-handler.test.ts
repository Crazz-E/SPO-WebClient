/// <reference path="../__tests__/matchers/rdo-matchers.d.ts" />

/**
 * politics-handler — three ASP scrapes (popular / IFEL / tycoons ratings,
 * tycoonCampaign.asp) around a handful of RDO members:
 *   - `RDOFavoritesGetSubItems` on the world context (function → `"^"` via QueryId);
 *   - `procedure RDOVote(voterTycoon, choiceTycoon : widestring)` —
 *     Kernel/TownPolitics.pas:46 — a PROCEDURE, so fire-and-forget `"*"` on the
 *     construction socket with NO QueryId is the safe form (the mission notes
 *     name `RDOVoteOf`, :47, which is the getter; the handler emits `RDOVote`);
 *   - `FindSuppliers` / `FindClients` on the cacher (map socket), function.
 *
 * The three pure parsers were already covered here; the sections after them
 * drive every exported entry point through `makeSessionCtx` and a mocked
 * `node-fetch`. `searchConnections` argument bytes are pinned by
 * `__tests__/rdo/rdo-callsite-wire-format.test.ts:112+`; only the branches it
 * leaves open are added.
 */

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import {
  parsePoliticsRatings,
  parseCampaignResponse,
  getDefaultPoliticsData,
  fetchOwnedFacilities,
  getPoliticsData,
  politicsVote,
  politicsLaunchCampaign,
  politicsCancelCampaign,
  searchConnections,
} from './politics-handler';
import { makeSessionCtx, FAKE_CONTEXT_IDS } from '../__tests__/session/fake-session-context';
import type { FakeSessionCtx } from '../__tests__/session/fake-session-context';
import type { SessionContext } from './session-context';
import type { RdoPacket, WorldInfo } from '../../shared/types';
import { RdoValue, RdoCommand } from '../../shared/rdo-types';
import { RdoVerb, RdoAction } from '../../shared/types';
import { TimeoutCategory } from '../../shared/timeout-categories';
import { config } from '../../shared/config';

const mockFetch = fetch as unknown as jest.MockedFunction<
  (url: string, init?: unknown) => Promise<Response>
>;

function htmlResponse(body: string, status = 200): Response {
  return { status, ok: status === 200, text: async () => body } as unknown as Response;
}

const WORLD: WorldInfo = { name: 'Shamba', url: 'http://158.69.153.134', ip: '158.69.153.134', port: 7000 };
// §4bis: distinct from every context id and every coordinate.
const TEMP_OBJ = '7734';
const CURR_BLOCK = '40133601';

type CacherListAt = jest.MockedFunction<SessionContext['getCacherPropertyListAt']>;
function propsAt(fake: FakeSessionCtx): CacherListAt {
  return fake.ctx.getCacherPropertyListAt as CacherListAt;
}

function makeWebCtx(overrides: Partial<SessionContext> = {}): FakeSessionCtx {
  return makeSessionCtx({
    currentWorldInfo: WORLD, activeUsername: 'SPO_test3', cachedPassword: 'test3',
    daAddr: '10.0.0.5', daPort: 1111, ...overrides,
  });
}

/** Query string of the n-th fetch call, decoded. */
function queryOf(n: number): URLSearchParams {
  const url = mockFetch.mock.calls[n][0];
  return new URLSearchParams(url.substring(url.indexOf('?') + 1));
}

beforeEach(() => {
  mockFetch.mockReset();
});

// =============================================================================
// ASP FIXTURES — instantiated from the pages in
// C:\Users\Robin Aleman\Documents\SPO\IIS_ROOT\Five\0\Visual\Voyager\Politics,
// NOT from the parsers. Tabs, unquoted attributes and blank conditional lines
// are the source's own: a `<% … %>` line emits only the literal text that
// surrounds it, which is why so many lines are a lone tab.
//
// The four language strings come from `Five/0/language/ePolitics.lng` (cited
// per use), resolved through the `#include` at `tycooncampaign.asp:1`.
// =============================================================================

/**
 * `popularratings.asp:54-86` with N rows.
 *
 * `ifelratings.asp:52-84` is byte-identical but for the property it interpolates
 * (`CacheObj.IFELRating` at `:69` instead of `CacheObj.PeopleRating` at `:71`),
 * so one builder covers both. `rating` is the raw text the page interpolates —
 * pass `''` to model a property that renders empty.
 */
function ratingsPage(rows: Array<[name: string, rating: string]>): string {
  const body = rows.map(([name, rating]) => [
    '\t\t<tr style="margin-top: 2px">',           // :66
    '\t\t\t<td class=label>',                     // :67
    `\t\t\t\t${name}`,                            // :68
    '\t\t\t</td>',                                // :69
    '\t\t\t<td class=value align="right">',       // :70
    `\t\t\t\t${rating}%`,                         // :71
    '\t\t\t</td>',                                // :72
    '\t\t</tr>',                                  // :73
    '\t\t<tr>',                                   // :74 — 1px separator row
    '\t\t\t<td height="1" colspan=2 bgcolor=#244843>',
    '\t\t\t</td>',
    '\t\t</tr>',                                  // :77
  ].join('\n')).join('\n');

  return [
    '<body style="background-color: #143833; margin: 10px; padding: 0px">',  // :54
    '',
    '\t<table cellpadding=0 cellspacing=0 width="100%">',                    // :56
    '\t',
    body,
    '\t',
    '\t</table>',                                                            // :84
    '',
    '<body>',                                                                // :86 — the source really does re-open it
  ].join('\n');
}

/**
 * `tycoonratings.asp:123-194` with N rows, `IsMayor` = true (hardcoded at `:25`,
 * the real test is commented out at `:24`).
 *
 * The shape the old parser could not read: `class=label` is followed by three
 * event handlers on separate lines instead of an immediate `>` (`:136-139`), and
 * the value is `<span id=Value_<Id>>` nested two levels deep inside the value
 * cell (`:146-148`), next to an opinion `<select>` whose options are percentages
 * as well (`:153-159`).
 */
function tycoonRatingsPage(rows: Array<{ id: string; name: string; rating: string }>): string {
  const body = rows.map(({ id, name, rating }) => {
    const bucket = 25 * Math.floor((parseInt(rating, 10) || 0) / 25);   // :152
    const options = [100, 75, 50, 25, 0].map(v =>
      `\t\t\t\t\t\t<option value="${v}" ${v === bucket ? 'selected' : ''}>${v}%`).join('\n');
    return [
      `\t\t<tr style="margin-top: 2px" id=${id}>`,                      // :135
      '\t\t\t<td class=label',                                          // :136
      '\t\t\t\tOnMouseOver="onRowMouseOver()"',
      '\t\t\t\tOnMouseOut="onRowMouseOut()"',
      '\t\t\t\tonClick="onRowMouseClick()">',                           // :139
      `\t\t\t\t${name}`,                                                // :140
      '\t\t\t</td>',
      '\t\t\t<td class=value align="right"',                            // :142
      '\t\t\t\tOnMouseOver="onRowMouseOver()"',
      '\t\t\t\tOnMouseOut="onRowMouseOut()"',
      '\t\t\t\tOnClick="onRowMouseClick()">',                           // :145
      `\t\t\t\t<div id=LabelDiv_${id} class=value>`,                    // :146
      `\t\t\t\t\t<span id=Value_${id}>${rating}%</span>`,               // :147
      '\t\t\t\t</div>',
      `\t\t\t\t<div id=OpinionDiv_${id} `,                              // :149
      '\t\t\t\t\tclass=value ',
      '\t\t\t\t\tstyle="text-align: right; margin: 0px; display: none; font-size: 10px">',
      '\t\t\t\t\t',
      `\t\t\t\t\t<select name=Opinion_${id} OnChange="onOpinionChange()" ratingId="${id}">`,
      options,
      '\t\t\t\t\t</select>',                                            // :159
      '\t\t\t\t</div>',
      '\t\t\t</td>',
      '\t\t</tr>',                                                      // :162
      '\t\t<tr>',                                                       // :163
      '\t\t\t<td height="1" colspan=2 bgcolor=#244843>',
      '\t\t\t</td>',
      '\t\t</tr>',
    ].join('\n');
  }).join('\n');

  return [
    '<body style="background-color: #143833; margin-left: 10px; margin-top: 10px; padding: 0px">',
    '',
    '\t<table cellpadding=0 cellspacing=0 width="100%">',               // :125
    '\t',
    body,
    '\t',
    '\t',
    '\t\t<tr>',                                                         // :181 — the IsMayor note
    '\t\t\t<td colspan=2 class=label align="left" style="font-size: 10px; padding-top: 5px">',
    '\t\t\t\t<span id=comment>',
    // StrTycoonRatings_3 — ePolitics.lng:52
    "\t\t\t\t  Note: Visit the local newspaper's forum to set your ratings for this politician.",
    '\t\t\t\t</span>',
    '\t\t\t</td>',
    '\t\t</tr>',                                                        // :187
    '\t',
    '\t</table>',
    '\t',
    '<iframe id=hiddenFrame style="display: none">',
    '</iframe>',
    '',
    '<body>',
  ].join('\n');
}

/**
 * `tycooncampaign.asp:220-419`. `view` selects which of the four mutually
 * exclusive render branches the server took:
 *
 *   'running' — `:224` `CacheObjectValid`: the campaign exists. Only this branch
 *               emits the `Cancel=TRUE` button (`:233`).
 *   'invite'  — `:362`: no campaign. Only this branch emits `Launch=TRUE` (`:380`).
 *   'ruler'   — `:390`: `IsMayor`, computed at `:98`.
 *   'silent'  — `:399`: `not FullAccess` OR `LaunchError <> 0`. The inner
 *               `if FullAccess` (`:401`) plus a `select case` with no `case else`
 *               (`:402-411`) is what makes this div empty for a wrong password
 *               and for any code outside {100, 101, 102}.
 */
function campaignPage(opts: {
  view: 'running' | 'invite' | 'ruler' | 'silent';
  capitol?: boolean;
  launchError?: 100 | 101 | 102;
  town?: string;
}): string {
  const { view, capitol = false, launchError, town = 'New Town' } = opts;
  const q = (extra: string) =>
    `tycooncampaign.asp?WorldName=Shamba&TownName=${town}&TycoonName=SPO_test3&Password=test3` +
    `&DAAddr=10.0.0.5&DAPort=1111${extra}&x=${capitol ? '118' : ''}&y=${capitol ? '226' : ''}` +
    `&Capitol=${capitol ? 'YES' : ''}&Recache=YES`;
  const threshold = capitol ? '1000' : '200';

  let block: string[];
  if (view === 'running') {
    block = [
      '\t', '\t\t',
      '\t\t<table style="margin-bottom: 10px">',                       // :225
      '\t\t\t<tr>',
      '\t\t\t\t<td class=button align="left" width="100" style="padding-left: 5px; padding-right: 5px"',
      '\t\t\t\t\tonMouseOver="onMouseOverFrame()"',
      '\t\t\t\t\tonMouseOut="onMouseOutFrame()"',
      '\t\t\t\t\tonMouseUp="onMouseUp()"',
      '\t\t\t\t\tonMouseDown="onMouseDown()"',
      '\t\t\t\t\tonClick="onBtnClick()"',
      `\t\t\t\t\tinfo="${q('&Cancel=TRUE')}"`,                         // :233
      '\t\t\t\t\tnormColor="#345950"',
      '\t\t\t\t\thiColor="white">',
      '',
      '\t\t\t\t\t<nobr>Withdraw Campaign</nobr>',                      // :237, StrCo0nCampaign_1
      '\t\t\t\t</td>',
      '\t\t\t</tr>',
      '\t\t</table>',
      '\t\t<table cellpadding=0 cellspacing=0 width="100%">',          // :241 — projects, none here
      '\t\t',
      '\t\t</table>',                                                  // :350
      '\t\t',
    ];
  } else if (view === 'invite') {
    block = [
      '\t', '\t\t', '',
      '\t\t\t<div class=label style="margin: 30px; text-align: center">',   // :364
      '',
      '\t\t\t\t',
      // StrCo0nCampaign_6 — ePolitics.lng:43, %1 replaced at :367 / :369
      '\t\t\t\tYou are not participating in the coming elections. Click on the button below to launch ' +
        `your political campaign. To be accepted, your prestige should be higher than ${threshold} points.`,
      '\t\t\t\t',
      '',
      '\t\t\t\t<table style="margin-top: 20px">',                      // :372
      '\t\t\t\t\t<tr>',
      '\t\t\t\t\t\t<td class=button align="left" width="100"',
      '\t\t\t\t\t\t\tonMouseOver="onMouseOverFrame()"',
      '\t\t\t\t\t\t\tonMouseOut="onMouseOutFrame()"',
      '\t\t\t\t\t\t\tonMouseUp="onMouseUp()"',
      '\t\t\t\t\t\t\tonMouseDown="onMouseDown()"',
      '\t\t\t\t\t\t\tonClick="onBtnClick()"',
      `\t\t\t\t\t\t\tinfo="${q('&Launch=TRUE')}"`,                     // :380
      '\t\t\t\t\t\t\tnormColor="#345950"',
      '\t\t\t\t\t\t\thiColor="white">',
      '',
      '\t\t\t\t\t\t\tLaunch Campaign',                                 // :384, StrCo0nCampaign_7
      '\t\t\t\t\t\t</td>',
      '\t\t\t\t\t</tr>',
      '\t\t\t\t</table>',
      '\t\t\t</div>',                                                  // :388
      '\t\t',
    ];
  } else if (view === 'ruler') {
    block = [
      '\t',
      '\t\t<div class=label style="margin: 30px; text-align: center">',     // :391
      '\t\t  ',
      // StrCo0nCampaign_8 — ePolitics.lng:45; %1 = strMayorOfThisCity / strPresident (:66-67)
      `\t\t  You are the ${capitol ? 'President' : 'Mayor'}. You cannot have a campaign.`,
      '\t\t  ',
      '\t\t</div>',                                                    // :397
      '\t',
    ];
  } else {
    // ePolitics.lng:46-48, rendered at :403 / :406 / :408 / :410.
    const reason = launchError === 100
      ? '\t\t\t Your application has been denied. Our records show that you already have a public commitment.'
      : launchError === 101
        ? `   \t\t\tSorry, you don't fulfill the requisites for having your own campaign. Your prestige should be higher than ${threshold} points.`
        : launchError === 102
          ? '\t\t\t It is too late to launch a campaign. Campaigns can only be started during the first half of the political period..'
          : null;
    block = [
      '\t<div class=label style="margin: 30px; text-align: center">',   // :400
      '\t\t',
      ...(reason === null ? [] : ['\t\t\t', reason]),
      '\t\t',
      '\t</div>',                                                      // :413
    ];
  }

  return [
    '<body style="background-color: #143833; margin: 10px; padding: 0px">',  // :220
    '',
    ...block,
    '',
    '<iframe id=hiddenFrame style="display:none;">',                   // :416
    '</iframe>',
    '',
    '<body>',
  ].join('\n');
}

// =============================================================================
// parsePoliticsRatings
// =============================================================================
describe('parsePoliticsRatings', () => {
  it('reads the two-cell rows of popularratings.asp and ignores the 1px separators', () => {
    expect(parsePoliticsRatings(ratingsPage([['Unemployment', '85'], ['Public Services', '62']]))).toEqual([
      { name: 'Unemployment', value: 85 },
      { name: 'Public Services', value: 62 },
    ]);
  });

  it('reads ifelratings.asp, whose rows differ only by the interpolated property', () => {
    // ifelratings.asp:64-71 vs popularratings.asp:66-73 — same markup.
    expect(parsePoliticsRatings(ratingsPage([['IFEL Rating', '40']]))).toEqual([
      { name: 'IFEL Rating', value: 40 },
    ]);
  });

  // B-4, second half. Regression guard: the old pattern demanded
  // `<td\s+class=label>` with an IMMEDIATE `>`, and tycoonratings.asp:136-139
  // hangs three event handlers off that cell. Not one row ever matched, so the
  // tab was structurally empty even once the 404 on the page name was fixed.
  it('reads tycoonratings.asp rows, whose label cell carries three event handlers', () => {
    const html = tycoonRatingsPage([
      { id: '1', name: 'Salary', rating: '42' },
      { id: '2', name: 'Taxes', rating: '75' },
    ]);
    expect(parsePoliticsRatings(html)).toEqual([
      { name: 'Salary', value: 42 },
      { name: 'Taxes', value: 75 },
    ]);
  });

  // tycoonratings.asp:153-159 puts an opinion dropdown in the SAME value cell,
  // and every one of its five options is a percentage.
  it('does not mistake an option of the opinion dropdown for the rating', () => {
    const [entry] = parsePoliticsRatings(tycoonRatingsPage([{ id: '9', name: 'Health', rating: '25' }]));
    expect(entry).toEqual({ name: 'Health', value: 25 });
  });

  // tycoonratings.asp:181-187 — a `class=label` cell with no value cell beside it.
  it('does not turn the trailing note of tycoonratings.asp into a rating', () => {
    const names = parsePoliticsRatings(tycoonRatingsPage([{ id: '1', name: 'Salary', rating: '10' }]))
      .map(r => r.name);
    expect(names).toEqual(['Salary']);
  });

  // B-18. Regression guard: `[\s\S]*?` used to run across row boundaries, so a
  // value the server rendered empty paired label N with the value of row N+1 and
  // shifted every remaining row. Matching is row-scoped now.
  it('an empty value cell reads 0 and leaves the following rows on their own values', () => {
    const html = ratingsPage([['Crime', ''], ['Pollution', '31'], ['Health', '77']]);
    expect(parsePoliticsRatings(html)).toEqual([
      { name: 'Crime', value: 0 },
      { name: 'Pollution', value: 31 },
      { name: 'Health', value: 77 },
    ]);
  });

  it('an empty ratings folder yields an empty list — the table has no row at all', () => {
    // popularratings.asp:60 `if not Itr.Empty` — a missing Ratings\ folder is a
    // 200 with an empty table, not an error.
    expect(parsePoliticsRatings(ratingsPage([]))).toEqual([]);
  });

  it('returns an empty list for a page carrying no table', () => {
    expect(parsePoliticsRatings('<body>No data</body>')).toEqual([]);
  });

  it('keeps the decimals of a fractional rating', () => {
    expect(parsePoliticsRatings(ratingsPage([['Growth', '73.5']]))).toEqual([{ name: 'Growth', value: 73.5 }]);
  });

  it('keeps the sign of a negative rating', () => {
    expect(parsePoliticsRatings(ratingsPage([['Deficit', '-12']]))).toEqual([{ name: 'Deficit', value: -12 }]);
  });

  it('skips a row whose label cell renders empty', () => {
    expect(parsePoliticsRatings(ratingsPage([['', '50'], ['Real', '20']]))).toEqual([{ name: 'Real', value: 20 }]);
  });

  it('reads a value cell with no percent sign', () => {
    expect(parsePoliticsRatings('<tr><td class=label>Wealth</td><td class=value>90</td></tr>')).toEqual([
      { name: 'Wealth', value: 90 },
    ]);
  });

  it('a value cell holding only a dot is not a number and reads 0', () => {
    expect(parsePoliticsRatings('<tr><td class=label>Broken</td><td class=value>.%</td></tr>')).toEqual([
      { name: 'Broken', value: 0 },
    ]);
  });

  it('reads the last row of a response truncated before its closing </tr>', () => {
    const html = '<tr><td class=label>A</td><td class=value>1%</td></tr><tr><td class=label>B</td><td class=value>2%</td>';
    expect(parsePoliticsRatings(html)).toEqual([{ name: 'A', value: 1 }, { name: 'B', value: 2 }]);
  });

  it('ignores a cell whose class merely starts with label or value', () => {
    // The `(?![\w-])` boundary — `labelAccountLevel2` is a real class name on the
    // profit & loss page and must not be read as a rating label.
    const html = '<tr><td class=labelAccountLevel2>Flush</td><td class=valueBig>9%</td></tr>';
    expect(parsePoliticsRatings(html)).toEqual([]);
  });
});

// =============================================================================
// parseCampaignResponse — the state after is the oracle (audit B-5)
// =============================================================================
describe('parseCampaignResponse', () => {
  describe('Launch', () => {
    it('succeeds when the answer carries the Withdraw button — the campaign now exists', () => {
      // tycooncampaign.asp:224-233: only `CacheObjectValid` renders `Cancel=TRUE`,
      // and `:90` honours the `Recache=YES` we always send, so this response is
      // the state AFTER RDOLaunchCampaign, not a stale cache.
      expect(parseCampaignResponse(campaignPage({ view: 'running' }), 'Launch'))
        .toEqual({ success: true, message: 'Campaign launched' });
    });

    it('fails when the answer still invites the player to launch, quoting the page', () => {
      const r = parseCampaignResponse(campaignPage({ view: 'invite' }), 'Launch');
      expect(r.success).toBe(false);
      expect(r.message).toBe(
        'You are not participating in the coming elections. Click on the button below to launch ' +
        'your political campaign. To be accepted, your prestige should be higher than 200 points.'
      );
      // The button label lives in a <table> nested inside the same label div and
      // is not part of the sentence (:372).
      expect(r.message).not.toContain('Launch Campaign');
    });

    it('fails with the capitol threshold when Capitol=YES', () => {
      const r = parseCampaignResponse(campaignPage({ view: 'invite', capitol: true }), 'Launch');
      expect(r.message).toContain('higher than 1000 points');
    });

    it.each([
      [100, 'Your application has been denied. Our records show that you already have a public commitment.'],
      [101, "Sorry, you don't fulfill the requisites for having your own campaign. Your prestige should be higher than 200 points."],
      [102, 'It is too late to launch a campaign. Campaigns can only be started during the first half of the political period..'],
    ] as const)('reports the RDOLaunchCampaign code %i with the page\'s own wording', (code, text) => {
      // tycooncampaign.asp:402-411, ePolitics.lng:46-48. The codes are established
      // by source: `LaunchError = pxy_townHall.RDOLaunchCampaign(...)` at :59.
      expect(parseCampaignResponse(campaignPage({ view: 'silent', launchError: code }), 'Launch'))
        .toEqual({ success: false, message: text });
    });

    // Case ① of the audit: a wrong password makes FullAccess false (:48), the RDO
    // call is never issued (:50) and the inner `if FullAccess` (:401) leaves the
    // div empty. The old parser read "no denial div" as success.
    it('fails on the empty label div a wrong password produces', () => {
      expect(parseCampaignResponse(campaignPage({ view: 'silent' }), 'Launch')).toEqual({
        success: false,
        message: 'Campaign launch refused — the page published no reason',
      });
    });

    // Case ② — `select case LaunchError` has no `case else` (:402-411).
    it('fails on a LaunchError outside {100, 101, 102}, which renders nothing', () => {
      expect(parseCampaignResponse(campaignPage({ view: 'silent' }), 'Launch').success).toBe(false);
    });

    it('fails when the player already rules the town, quoting the page', () => {
      expect(parseCampaignResponse(campaignPage({ view: 'ruler' }), 'Launch')).toEqual({
        success: false,
        message: 'You are the Mayor. You cannot have a campaign.',
      });
    });

    it('names the president rather than the mayor on the capitol', () => {
      expect(parseCampaignResponse(campaignPage({ view: 'ruler', capitol: true }), 'Launch').message)
        .toBe('You are the President. You cannot have a campaign.');
    });
  });

  describe('Cancel', () => {
    // Case ③, the one that mattered: a SUCCESSFUL withdrawal invalidates the
    // campaign cache object (:91-96), so the page falls to :362 and shows the
    // launch invitation — a non-empty `<div class=label>`. The old parser called
    // the nominal path a failure. RDOCancelCampaign's own result is unusable:
    // `:76` calls it without assigning, unlike `:59`.
    it('succeeds when the answer carries the Launch button — the campaign is gone', () => {
      expect(parseCampaignResponse(campaignPage({ view: 'invite' }), 'Cancel'))
        .toEqual({ success: true, message: 'Campaign withdrawn' });
    });

    it('fails when the Withdraw button is still there — the campaign survived', () => {
      expect(parseCampaignResponse(campaignPage({ view: 'running' }), 'Cancel')).toEqual({
        success: false,
        message: 'Campaign withdrawal refused — the campaign is still running',
      });
    });

    it('fails on the empty label div a wrong password produces', () => {
      expect(parseCampaignResponse(campaignPage({ view: 'silent' }), 'Cancel')).toEqual({
        success: false,
        message: 'Campaign withdrawal refused — the page published no reason',
      });
    });

    it('fails with the page wording when the player already rules the town', () => {
      expect(parseCampaignResponse(campaignPage({ view: 'ruler' }), 'Cancel')).toEqual({
        success: false,
        message: 'You are the Mayor. You cannot have a campaign.',
      });
    });
  });

  it('a body with no label div and no button is a failure, not a success', () => {
    expect(parseCampaignResponse('<body></body>', 'Launch').success).toBe(false);
    expect(parseCampaignResponse('<body></body>', 'Cancel').success).toBe(false);
  });
});

// =============================================================================
// getDefaultPoliticsData
// =============================================================================
describe('getDefaultPoliticsData', () => {
  it('returns default structure with given town name', () => {
    const data = getDefaultPoliticsData('Paraiso');
    expect(data.townName).toBe('Paraiso');
    expect(data.campaigns).toEqual([]);
    expect(data.popularRatings).toEqual([]);
    expect(data.canLaunchCampaign).toBe(false);
    expect(data.campaignMessage).toBeTruthy();
  });

  it('returns zero for all numeric fields', () => {
    const data = getDefaultPoliticsData('TestTown');
    expect(data.yearsToElections).toBe(0);
    expect(data.mayorPrestige).toBe(0);
    expect(data.mayorRating).toBe(0);
    expect(data.campaignCount).toBe(0);
  });
});

// =============================================================================
// fetchOwnedFacilities — RDOFavoritesGetSubItems("")
// =============================================================================
describe('fetchOwnedFacilities', () => {
  it('calls RDOFavoritesGetSubItems on the world context with an empty OLEString, no explicit separator', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => 'res="%"');

    await fetchOwnedFacilities(fake.ctx);

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0].socketName).toBe('world');
    expect(fake.sent[0].category).toBe(TimeoutCategory.NORMAL);
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.worldContextId,
      action: RdoAction.CALL,
      member: 'RDOFavoritesGetSubItems',
      args: [RdoValue.string('').format()],
    });
  });

  it('parses the \\x01/\\x02-separated favorites through the real parseFavoritesResponse (links only)', async () => {
    const fake = makeSessionCtx();
    // id \x01 kind \x01 name \x01 info \x01 subCount \x01 '' — kind 1 = link, 0 = folder
    const link = ['4210', '1', 'Farm 1', 'Farm 1,118,226,0', '0', ''].join('\x01');
    const folder = ['9', '0', 'Folder', 'Folder,0,0,0', '2', ''].join('\x01');
    fake.respond(() => `res="%${[folder, link].join('\x02')}"`);

    const items = await fetchOwnedFacilities(fake.ctx);

    expect(items).toEqual([{ id: 4210, name: 'Farm 1', x: 118, y: 226 }]);
  });

  it('returns [] for an empty payload', async () => {
    const fake = makeSessionCtx();
    expect(await fetchOwnedFacilities(fake.ctx)).toEqual([]);
  });

  it('refuses without a world context and sends nothing', async () => {
    const fake = makeSessionCtx({ worldContextId: null });
    await expect(fetchOwnedFacilities(fake.ctx)).rejects.toThrow('Not logged in — no worldContextId');
    expect(fake.sent).toHaveLength(0);
  });

  it('propagates a timeout', async () => {
    const fake = makeSessionCtx();
    fake.respond(() => new Error('Request timeout: RDOFavoritesGetSubItems'));
    await expect(fetchOwnedFacilities(fake.ctx)).rejects.toThrow('Request timeout: RDOFavoritesGetSubItems');
  });
});

// =============================================================================
// getPoliticsData — three ASP pages then the town hall cache
// =============================================================================
describe('getPoliticsData', () => {
  const RATINGS = (name: string, v: string) => ratingsPage([[name, v]]);

  it('fetches popularratings / ifelratings / tycoonratings with the session credentials, %20-encoded, then the cache', async () => {
    const fake = makeWebCtx();
    mockFetch
      .mockResolvedValueOnce(htmlResponse(RATINGS('Unemployment', '85')))
      .mockResolvedValueOnce(htmlResponse(RATINGS('IFEL A', '40')))
      .mockResolvedValueOnce(htmlResponse(tycoonRatingsPage([{ id: '3', name: 'Tycoon B', rating: '12' }])));
    propsAt(fake).mockResolvedValueOnce(['Rio', '55', '70', '60', '3', '0']);

    const data = await getPoliticsData(fake.ctx, 'New Town', 118, 226);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const urls = mockFetch.mock.calls.map(c => c[0]);
    expect(urls[0]).toMatch(/^http:\/\/158\.69\.153\.134\/Five\/0\/Visual\/Voyager\/Politics\/popularratings\.asp\?/);
    expect(urls[1]).toContain('/ifelratings.asp?');
    // A-12 / B-4, first half. The file is `tycoonratings.asp` — SINGULAR. The
    // plural form does not exist among the 2 774 Voyager pages, so this call
    // 404'd for the whole life of the handler; the 404 body is HTML, so the
    // surrounding try/catch never fired and nothing was ever logged.
    expect(urls[2]).toContain('/tycoonratings.asp?');
    expect(urls[2]).not.toContain('tycoonsratings');
    expect(urls[0]).toContain('TownName=New%20Town');
    expect(urls[0]).not.toContain('+');
    expect(mockFetch.mock.calls[0][1]).toEqual({ redirect: 'follow' });
    const q = queryOf(0);
    expect(q.get('WorldName')).toBe('Shamba');
    expect(q.get('TycoonName')).toBe('SPO_test3');
    expect(q.get('Password')).toBe('test3');
    expect(q.get('DAAddr')).toBe('10.0.0.5');
    expect(q.get('DAPort')).toBe('1111');

    expect(propsAt(fake)).toHaveBeenCalledWith(118, 226, ['ActualRuler', 'RulerPrestige', 'RulerRating', 'TycoonsRating', 'YearsToElections', 'CampaignCount']);
    expect(data).toEqual({
      townName: 'New Town',
      yearsToElections: 3,
      mayorName: 'Rio',
      mayorPrestige: 55,
      mayorRating: 70,
      tycoonsRating: 60,
      campaignCount: 0,
      popularRatings: [{ name: 'Unemployment', value: 85 }],
      ifelRatings: [{ name: 'IFEL A', value: 40 }],
      tycoonsRatings: [{ name: 'Tycoon B', value: 12 }],
      campaigns: [],
      canLaunchCampaign: true,
      campaignMessage: '',
    });
  });

  it('falls back to cachedUsername and the config directory host/port when the session has none', async () => {
    const fake = makeWebCtx({ activeUsername: null, cachedUsername: 'Cached', cachedPassword: null, daAddr: null, daPort: null });
    mockFetch.mockResolvedValue(htmlResponse(''));
    propsAt(fake).mockResolvedValue([]);

    await getPoliticsData(fake.ctx, 'T', 1, 2);

    const q = queryOf(0);
    expect(q.get('TycoonName')).toBe('Cached');
    expect(q.get('Password')).toBe('');
    expect(q.get('DAAddr')).toBe(config.rdo.directoryHost);
    expect(q.get('DAPort')).toBe(String(config.rdo.ports.directory));
  });

  it('with no username at all sends an empty TycoonName, and an empty WorldName when the world has none', async () => {
    const fake = makeWebCtx({ activeUsername: null, cachedUsername: null, currentWorldInfo: { ...WORLD, name: '' } });
    mockFetch.mockResolvedValue(htmlResponse(''));
    propsAt(fake).mockResolvedValue([]);
    await getPoliticsData(fake.ctx, 'T', 1, 2);
    expect(queryOf(0).get('TycoonName')).toBe('');
    expect(queryOf(0).get('WorldName')).toBe('');
  });

  it('reads the campaign candidates in a second cache call when CampaignCount > 0, skipping unnamed ones', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(''));
    propsAt(fake)
      .mockResolvedValueOnce(['Rio', '1', '2', '3', '4', '3'])
      .mockResolvedValueOnce(['Alice', '61', '', '10', 'Carol', 'x']);

    const data = await getPoliticsData(fake.ctx, 'T', 1, 2);

    expect(propsAt(fake)).toHaveBeenNthCalledWith(2, 1, 2, ['Candidate0', 'CmpRat0', 'Candidate1', 'CmpRat1', 'Candidate2', 'CmpRat2']);
    expect(data.campaignCount).toBe(3);
    expect(data.campaigns).toEqual([{ candidateName: 'Alice', rating: 61 }, { candidateName: 'Carol', rating: 0 }]);
  });

  it('keeps the mayor data when the candidate read fails', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(''));
    propsAt(fake)
      .mockResolvedValueOnce(['Rio', '1', '2', '3', '4', '2'])
      .mockRejectedValueOnce(new Error('Request timeout: GetPropertyList'));

    const data = await getPoliticsData(fake.ctx, 'T', 1, 2);

    expect(data.mayorName).toBe('Rio');
    expect(data.campaignCount).toBe(2);
    expect(data.campaigns).toEqual([]);
    expect(fake.log.debug).toHaveBeenCalledWith('[Politics] Could not fetch campaign candidates: Request timeout: GetPropertyList');
  });

  it('when the mayor cache read fails, returns zeros for the mayor block but keeps the ratings', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(RATINGS('X', '5')));
    propsAt(fake).mockRejectedValue(new Error('Request timeout: GetPropertyList'));

    const data = await getPoliticsData(fake.ctx, 'T', 1, 2);

    expect(data).toMatchObject({ mayorName: '', mayorPrestige: 0, campaignCount: 0, campaigns: [], popularRatings: [{ name: 'X', value: 5 }] });
    expect(fake.log.debug).toHaveBeenCalledWith('[Politics] Could not fetch mayor data from building: Request timeout: GetPropertyList');
  });

  it('non-numeric mayor values become 0 and an empty ruler becomes ""', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(''));
    propsAt(fake).mockResolvedValue(['', 'a', 'b', 'c', 'd', 'e']);
    const data = await getPoliticsData(fake.ctx, 'T', 1, 2);
    expect(data).toMatchObject({ mayorName: '', mayorPrestige: 0, mayorRating: 0, tycoonsRating: 0, yearsToElections: 0, campaignCount: 0 });
  });

  it('a failing tycoon ratings fetch leaves tycoonsRatings empty and the rest intact', async () => {
    const fake = makeWebCtx();
    mockFetch
      .mockResolvedValueOnce(htmlResponse(RATINGS('P', '1')))
      .mockResolvedValueOnce(htmlResponse(RATINGS('I', '2')))
      .mockRejectedValueOnce(new Error('ECONNRESET'));
    propsAt(fake).mockResolvedValue([]);

    const data = await getPoliticsData(fake.ctx, 'T', 1, 2);

    expect(data.popularRatings).toEqual([{ name: 'P', value: 1 }]);
    expect(data.ifelRatings).toEqual([{ name: 'I', value: 2 }]);
    expect(data.tycoonsRatings).toEqual([]);
    expect(fake.log.warn).toHaveBeenCalledWith('[Politics] Tycoons ratings fetch failed: ECONNRESET');
  });

  it('a failing popularratings fetch returns the default data with the warning', async () => {
    const fake = makeWebCtx();
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const data = await getPoliticsData(fake.ctx, 'T', 1, 2);

    expect(data).toEqual(getDefaultPoliticsData('T'));
    expect(fake.log.warn).toHaveBeenCalledWith('[Politics] Failed to fetch politics data: ECONNREFUSED');
    expect(propsAt(fake)).not.toHaveBeenCalled();
  });

  // Regression guard for A-12. The three pages used to be fetched without ever
  // reading `response.status`: the 404 answered to `tycoonsratings.asp` was
  // parsed as ratings, produced `[]`, and left no trace at all.
  it('reports a page the server did not serve, instead of parsing its error body', async () => {
    const fake = makeWebCtx();
    mockFetch
      .mockResolvedValueOnce(htmlResponse(RATINGS('P', '1')))
      .mockResolvedValueOnce(htmlResponse(RATINGS('I', '2')))
      .mockResolvedValueOnce(htmlResponse('<html><head><title>404 - File or directory not found.</title></head></html>', 404));
    propsAt(fake).mockResolvedValue([]);

    const data = await getPoliticsData(fake.ctx, 'T', 1, 2);

    expect(data.tycoonsRatings).toEqual([]);
    expect(data.popularRatings).toEqual([{ name: 'P', value: 1 }]);
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('[Politics] tycoon ratings page answered HTTP 404')
    );
  });

  it('a 500 on the popular ratings page empties that list and says so', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse('<html><body>500 Internal Server Error</body></html>', 500));
    propsAt(fake).mockResolvedValue([]);

    const data = await getPoliticsData(fake.ctx, 'T', 1, 2);

    expect(data.popularRatings).toEqual([]);
    expect(data.canLaunchCampaign).toBe(true);
    expect(fake.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('[Politics] popular ratings page answered HTTP 500')
    );
  });

  it('returns the default data without fetching when the world ip is unknown', async () => {
    const fake = makeWebCtx({ currentWorldInfo: null });
    expect(await getPoliticsData(fake.ctx, 'T', 1, 2)).toEqual(getDefaultPoliticsData('T'));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// =============================================================================
// politicsVote — fire-and-forget RDOVote on CurrBlock (TownPolitics.pas:46, procedure)
// =============================================================================
describe('politicsVote', () => {
  function makeVoteCtx(overrides: Partial<SessionContext> = {}): FakeSessionCtx {
    const fake = makeSessionCtx({ sockets: ['construction'], activeUsername: 'SPO_test3', ...overrides });
    fake.cacher.createObject.mockResolvedValue(TEMP_OBJ);
    fake.cacher.getPropertyList.mockResolvedValue([CURR_BLOCK]);
    return fake;
  }

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('reads CurrBlock through a temp object it closes, then writes RDOVote "*" (voter, candidate) on that block — no QueryId', async () => {
    const fake = makeVoteCtx();

    const pending = politicsVote(fake.ctx, 118, 226, 'Alice');
    await jest.advanceTimersByTimeAsync(200);
    const result = await pending;

    expect(fake.ctx.connectConstructionService).toHaveBeenCalled();
    expect(fake.ctx.connectMapService).toHaveBeenCalled();
    expect(fake.cacher.setObject).toHaveBeenCalledWith(TEMP_OBJ, 118, 226);
    expect(fake.cacher.getPropertyList).toHaveBeenCalledWith(TEMP_OBJ, ['CurrBlock']);
    expect(fake.cacher.closeObject).toHaveBeenCalledWith(TEMP_OBJ);

    expect(fake.sent).toHaveLength(0);
    expect(fake.frames.construction).toEqual([
      RdoCommand.sel(CURR_BLOCK).call('RDOVote').push().args(RdoValue.string('SPO_test3'), RdoValue.string('Alice')).build(),
    ]);
    expect(fake.frames.construction[0]).toMatchRdoCallFormat('RDOVote');
    expect(fake.frames.construction[0]).not.toContain('"^"');
    expect(result).toEqual({ success: true, message: 'Voted for Alice' });
  });

  it('parks 200 ms after the frame before resolving', async () => {
    const fake = makeVoteCtx();
    let settled = false;
    const pending = politicsVote(fake.ctx, 1, 2, 'A').then(r => { settled = true; return r; });
    await jest.advanceTimersByTimeAsync(199);
    expect(fake.frames.construction).toHaveLength(1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it('falls back to cachedUsername, then to an empty voter', async () => {
    const a = makeVoteCtx({ activeUsername: null, cachedUsername: 'Cached' });
    const pa = politicsVote(a.ctx, 1, 2, 'A');
    await jest.advanceTimersByTimeAsync(200);
    await pa;
    expect(a.frames.construction[0]).toBe(RdoCommand.sel(CURR_BLOCK).call('RDOVote').push().args(RdoValue.string('Cached'), RdoValue.string('A')).build());

    const b = makeVoteCtx({ activeUsername: null, cachedUsername: null });
    const pb = politicsVote(b.ctx, 1, 2, 'A');
    await jest.advanceTimersByTimeAsync(200);
    await pb;
    expect(b.frames.construction[0]).toBe(RdoCommand.sel(CURR_BLOCK).call('RDOVote').push().args(RdoValue.string(''), RdoValue.string('A')).build());
  });

  it('with no worldId: failure, nothing read, nothing written', async () => {
    const fake = makeVoteCtx({ worldId: null });
    expect(await politicsVote(fake.ctx, 1, 2, 'A')).toEqual({ success: false, message: 'Construction service not initialized' });
    expect(fake.cacher.createObject).not.toHaveBeenCalled();
    expect(fake.frames.construction).toHaveLength(0);
  });

  it('with an empty CurrBlock: failure, temp object closed, nothing written', async () => {
    const fake = makeVoteCtx();
    fake.cacher.getPropertyList.mockResolvedValue(['']);
    expect(await politicsVote(fake.ctx, 5, 6, 'A')).toEqual({ success: false, message: 'No CurrBlock at (5, 6)' });
    expect(fake.cacher.closeObject).toHaveBeenCalledWith(TEMP_OBJ);
    expect(fake.frames.construction).toHaveLength(0);
  });

  it('with no construction socket: failure after the cache read', async () => {
    const fake = makeSessionCtx({ activeUsername: 'X' });
    fake.cacher.createObject.mockResolvedValue(TEMP_OBJ);
    fake.cacher.getPropertyList.mockResolvedValue([CURR_BLOCK]);
    expect(await politicsVote(fake.ctx, 1, 2, 'A')).toEqual({ success: false, message: 'Construction socket unavailable' });
    expect(fake.log.warn).toHaveBeenCalledWith('[Politics] Vote failed: Construction socket unavailable');
  });

  it('a cache timeout is caught and reported', async () => {
    const fake = makeVoteCtx();
    fake.cacher.getPropertyList.mockRejectedValue(new Error('Request timeout: GetPropertyList'));
    expect(await politicsVote(fake.ctx, 1, 2, 'A')).toEqual({ success: false, message: 'Request timeout: GetPropertyList' });
    expect(fake.frames.construction).toHaveLength(0);
  });
});

// =============================================================================
// politicsLaunchCampaign / politicsCancelCampaign — tycooncampaign.asp
// =============================================================================
describe.each([
  // The 5th and 6th columns are the state the page must show for the mutation to
  // count as done: after a launch the Withdraw button (`tycooncampaign.asp:233`),
  // after a withdrawal the Launch invitation (`:364-388`).
  ['politicsLaunchCampaign', politicsLaunchCampaign, 'Launch', 'LaunchCampaign', 'running', 'Campaign launched'],
  ['politicsCancelCampaign', politicsCancelCampaign, 'Cancel', 'CancelCampaign', 'invite', 'Campaign withdrawn'],
] as const)('%s', (_name, fn, action, logTag, doneView, doneMessage) => {
  const donePage = (capitol = false) => campaignPage({ view: doneView, capitol });

  it(`GETs tycooncampaign.asp with ${action}=TRUE, TownName set and Capitol/x/y empty for a town hall`, async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(donePage()));

    const result = await fn(fake.ctx, 118, 226, 'New Town');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0];
    expect(url).toMatch(/^http:\/\/158\.69\.153\.134\/Five\/0\/Visual\/Voyager\/Politics\/tycooncampaign\.asp\?/);
    expect(url).toContain('TownName=New%20Town');
    expect(url).not.toContain('+');
    expect(mockFetch.mock.calls[0][1]).toEqual({ redirect: 'follow' });
    const q = queryOf(0);
    expect(q.get(action)).toBe('TRUE');
    expect(q.get('Capitol')).toBe('');
    expect(q.get('x')).toBe('');
    expect(q.get('y')).toBe('');
    expect(q.get('Recache')).toBe('YES');
    expect(q.get('WorldName')).toBe('Shamba');
    expect(q.get('TycoonName')).toBe('SPO_test3');
    expect(q.get('Password')).toBe('test3');
    expect(q.get('DAAddr')).toBe('10.0.0.5');
    expect(q.get('DAPort')).toBe('1111');
    expect(result).toEqual({ success: true, message: doneMessage });
  });

  it('for the capitol (no town name) sets Capitol=YES with x/y and an empty TownName', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(donePage(true)));

    await fn(fake.ctx, 118, 226);

    const q = queryOf(0);
    expect(q.get('Capitol')).toBe('YES');
    expect(q.get('x')).toBe('118');
    expect(q.get('y')).toBe('226');
    expect(q.get('TownName')).toBe('');
  });

  it('falls back to cachedUsername and the config directory host/port', async () => {
    const fake = makeWebCtx({ activeUsername: null, cachedUsername: 'Cached', cachedPassword: null, daAddr: null, daPort: null });
    mockFetch.mockResolvedValue(htmlResponse(donePage()));
    await fn(fake.ctx, 1, 2, 'T');
    const q = queryOf(0);
    expect(q.get('TycoonName')).toBe('Cached');
    expect(q.get('Password')).toBe('');
    expect(q.get('DAAddr')).toBe(config.rdo.directoryHost);
    expect(q.get('DAPort')).toBe(String(config.rdo.ports.directory));
  });

  it('with no username at all sends an empty TycoonName and empty WorldName when the world has none', async () => {
    const fake = makeWebCtx({ activeUsername: null, cachedUsername: null, currentWorldInfo: { ...WORLD, name: '' } });
    mockFetch.mockResolvedValue(htmlResponse(donePage()));
    await fn(fake.ctx, 1, 2, 'T');
    expect(queryOf(0).get('TycoonName')).toBe('');
    expect(queryOf(0).get('WorldName')).toBe('');
  });

  it('returns the refusal the ASP page carries when the player already rules the town', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(campaignPage({ view: 'ruler' })));
    expect(await fn(fake.ctx, 1, 2, 'T')).toEqual({
      success: false, message: 'You are the Mayor. You cannot have a campaign.',
    });
  });

  // B-5. Regression guard, and the reason the whole oracle was rewritten: this
  // body carries no `<div class=label>` at all, so the old "success = no denial
  // div" rule called it a success — for a launch that never happened and for a
  // withdrawal the server never acknowledged. Neither button is present, so
  // neither end state is proven.
  it('a body proving neither end state is a failure, not a success', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse('<body>\n<table><tr><td>Campaign projects</td></tr></table>\n</body>'));
    expect((await fn(fake.ctx, 1, 2, 'T')).success).toBe(false);
  });

  // Wrong password: `tycooncampaign.asp:48` leaves FullAccess false, `:50`/`:67`
  // skip the RDO call entirely and `:401` leaves the div empty. Reported as
  // success until now.
  it('an empty label div — the wrong-password rendering — is a failure', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(campaignPage({ view: 'silent' })));
    const r = await fn(fake.ctx, 1, 2, 'T');
    expect(r.success).toBe(false);
    expect(r.message).toContain('the page published no reason');
  });

  it('a 500 status is a failure — absence of a denial div is not evidence of success', async () => {
    // Regression guard for A-9. parseCampaignResponse reads success as "the page carries
    // no denial div", so a server error page used to read as a launched/cancelled
    // campaign. The status is now checked before the body is trusted.
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse('<html><body>500 Internal Server Error</body></html>', 500));
    expect(await fn(fake.ctx, 1, 2, 'T')).toEqual({ success: false, message: `${action} campaign failed: HTTP 500` });
  });

  it('a rejected fetch is caught, warned and returned as failure', async () => {
    const fake = makeWebCtx();
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await fn(fake.ctx, 1, 2, 'T')).toEqual({ success: false, message: 'ECONNREFUSED' });
    expect(fake.log.warn).toHaveBeenCalledWith(`[Politics] ${logTag} failed: ECONNREFUSED`);
  });

  it('without a world ip: "Not connected to world", no fetch', async () => {
    const fake = makeWebCtx({ currentWorldInfo: null });
    expect(await fn(fake.ctx, 1, 2, 'T')).toEqual({ success: false, message: 'Not connected to world' });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// =============================================================================
// searchConnections — the branches rdo-callsite-wire-format.test.ts leaves open
// =============================================================================
describe('searchConnections', () => {
  function makeSearchCtx(overrides: Partial<SessionContext> = {}): FakeSessionCtx {
    return makeSessionCtx({ currentWorldInfo: WORLD, ...overrides });
  }

  it('FindSuppliers on the cacher (map socket), SLOW, with the nine args in Delphi order', async () => {
    const fake = makeSearchCtx();
    fake.respond(() => 'res="%"');

    await searchConnections(fake.ctx, 706, 436, 'Plastics', 'input', { company: 'ACME', town: 'Rio', maxResults: 5, roles: 3 });

    expect(fake.ctx.connectMapService).toHaveBeenCalled();
    expect(fake.sent[0].socketName).toBe('map');
    expect(fake.sent[0].category).toBe(TimeoutCategory.SLOW);
    expect(fake.sent[0].packet).toEqual({
      verb: RdoVerb.SEL,
      targetId: FAKE_CONTEXT_IDS.cacherId,
      action: RdoAction.CALL,
      member: 'FindSuppliers',
      args: [
        RdoValue.string('Plastics').format(), RdoValue.string('Shamba').format(),
        RdoValue.string('Rio').format(), RdoValue.string('ACME').format(),
        RdoValue.int(5).format(), RdoValue.int(706).format(), RdoValue.int(436).format(),
        RdoValue.int(1).format(), RdoValue.int(3).format(),
      ],
    });
  });

  it('FindClients for the output direction, defaulting count 20 and roles 31', async () => {
    const fake = makeSearchCtx();
    fake.respond(() => 'res="%"');
    await searchConnections(fake.ctx, 1, 2, 'Food', 'output');
    expect(fake.sent[0].packet.member).toBe('FindClients');
    expect(fake.sent[0].packet.args?.slice(4)).toEqual([
      RdoValue.int(20).format(), RdoValue.int(1).format(), RdoValue.int(2).format(), RdoValue.int(1).format(), RdoValue.int(31).format(),
    ]);
  });

  it('parses 7-field supplier rows with price and quality, 5-field client rows without', async () => {
    const fake = makeSearchCtx();
    fake.respond(p => (p.member === 'FindSuppliers'
      ? 'res="%10}20}Farm A}ACME}Rio}$12.5}88\r\n30}40}Farm B}}"'
      : 'res="%50}60}Store}Mega}Town}$1}9"'));

    const suppliers = await searchConnections(fake.ctx, 1, 2, 'F', 'input');
    expect(suppliers).toEqual([
      { x: 10, y: 20, facilityName: 'Farm A', companyName: 'ACME', town: 'Rio', price: '$12.5', quality: '88' },
      { x: 30, y: 40, facilityName: 'Farm B', companyName: '', town: undefined },
    ]);

    const clients = await searchConnections(fake.ctx, 1, 2, 'F', 'output');
    // 7 fields on an output row: price/quality are NOT read
    expect(clients).toEqual([{ x: 50, y: 60, facilityName: 'Store', companyName: 'Mega', town: 'Town' }]);
  });

  it('drops rows whose coordinates are not numeric, names an unnamed facility "Unknown", and empties price/quality slots', async () => {
    const fake = makeSearchCtx();
    fake.respond(() => 'res="%a}b}Bad\r\n1}2}}}}}"');
    expect(await searchConnections(fake.ctx, 1, 2, 'F', 'input')).toEqual([
      { x: 1, y: 2, facilityName: 'Unknown', companyName: '', town: undefined, price: undefined, quality: undefined },
    ]);
  });

  it('returns [] for an empty payload and for a packet without payload', async () => {
    const fake = makeSearchCtx();
    fake.respond((_p, i) => (i === 0 ? '' : { raw: '', type: 'RESPONSE', rid: i } as RdoPacket));
    expect(await searchConnections(fake.ctx, 1, 2, 'F', 'input')).toEqual([]);
    expect(await searchConnections(fake.ctx, 1, 2, 'F', 'input')).toEqual([]);
  });

  it('returns [] and warns without a world name, sending nothing', async () => {
    const fake = makeSearchCtx({ currentWorldInfo: null });
    expect(await searchConnections(fake.ctx, 1, 2, 'F', 'input')).toEqual([]);
    expect(fake.sent).toHaveLength(0);
    expect(fake.log.warn).toHaveBeenCalledWith('[Connections] No world name available for search');
  });

  it('returns [] and warns without a cacherId after connecting the map service', async () => {
    const fake = makeSearchCtx({ cacherId: null });
    expect(await searchConnections(fake.ctx, 1, 2, 'F', 'input')).toEqual([]);
    expect(fake.ctx.connectMapService).toHaveBeenCalled();
    expect(fake.sent).toHaveLength(0);
    expect(fake.log.warn).toHaveBeenCalledWith('[Connections] No cacherId available for search');
  });

  it('a timeout is caught and reported as []', async () => {
    const fake = makeSearchCtx();
    fake.respond(() => new Error('Request timeout: FindSuppliers'));
    expect(await searchConnections(fake.ctx, 1, 2, 'F', 'input')).toEqual([]);
    expect(fake.log.warn).toHaveBeenCalledWith('[Connections] input search failed: Request timeout: FindSuppliers');
  });
});
