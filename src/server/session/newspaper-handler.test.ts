/**
 * newspaper-handler — two scrapes of `Visual/News/boardmsg.asp` and one form POST.
 *
 * There is no RDO here: the board is a `NewsBoard.NewsObject` COM tree reachable
 * only through the ASP pages, which is why "Rate the Mayor" navigates to
 * `boardreader.asp` (Voyager/TownHallSheet.pas:343) rather than calling anything.
 *
 * The fixtures below are instantiated from
 * `IIS_ROOT/Five/0/Visual/News/boardmsg.asp`, not from the parsers.
 */

jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import fetch from 'node-fetch';
import type { Response } from 'node-fetch';
import {
  parseNewspaperIndex,
  parseNewspaperArticle,
  getNewspaperBoard,
  postNewspaperColumn,
  type NewspaperTarget,
} from './newspaper-handler';
import { makeSessionCtx } from '../__tests__/session/fake-session-context';
import type { FakeSessionCtx } from '../__tests__/session/fake-session-context';
import type { SessionContext } from './session-context';
import type { WorldInfo } from '../../shared/types';

const mockFetch = fetch as unknown as jest.MockedFunction<
  (url: string, init?: unknown) => Promise<Response>
>;

function htmlResponse(body: string, status = 200): Response {
  return { status, ok: status === 200, text: async () => body } as unknown as Response;
}

const WORLD: WorldInfo = { name: 'Planitia', url: 'http://158.69.153.134', ip: '158.69.153.134', port: 7000 };

const TARGET: NewspaperTarget = {
  paperName: 'Helartia Herald',
  townName: 'Helartia',
  isCapitol: false,
  buildingX: 118,
  buildingY: 226,
};

const ROOT = 'boards\\Planitia\\Helartia Herald\\';

function makeWebCtx(overrides: Partial<SessionContext> = {}): FakeSessionCtx {
  return makeSessionCtx({
    currentWorldInfo: WORLD, activeUsername: 'SPO_test3', cachedPassword: 'test3',
    daAddr: '10.0.0.5', daPort: 1111, ...overrides,
  });
}

function queryOf(n: number): URLSearchParams {
  const url = mockFetch.mock.calls[n][0];
  return new URLSearchParams(url.substring(url.indexOf('?') + 1));
}

beforeEach(() => {
  mockFetch.mockReset();
});

// =============================================================================
// ASP FIXTURES
// =============================================================================

/**
 * `boardmsg.asp:186-225` — `RenderGlobal`, the "Latest 10 columns" index, plus
 * the welcome block `:262-272` that surrounds it on the folder page.
 */
function indexPage(entries: Array<{ author: string; subject: string; summary: string; path: string }>): string {
  const rows = entries.map(({ author, subject, summary, path }) => [
    '\t\t\t\t\t<tr>',                                                   // :203
    '\t\t\t\t\t\t<td valign="bottom">',
    `\t\t\t\t\t\t\t<div class=author><b>${author}</b></div>`,           // :205
    '\t\t\t\t\t\t</td>',
    '\t\t\t\t\t\t<td width=10>',
    '\t\t\t\t\t\t</td>',
    '\t\t\t\t\t\t<td valign="top">',
    `\t\t\t\t\t\t\t<a target="BoardMain" href="BoardMsg.asp?root=${ROOT}&path=${encodeURIComponent(path)}&TownName=Helartia&WorldName=Planitia&tycoon=SPO_test3&PaperName=Helartia%20Herald&DAAddr=10.0.0.5&DAPort=1111">${subject}</a>`,
    '\t\t\t\t\t\t</td>',
    '\t\t\t\t\t</tr>',
    '\t\t\t\t\t<tr>',                                                   // :214
    '\t\t\t\t\t\t<td colspan=2>',
    '\t\t\t\t\t\t</td>',
    `\t\t\t\t\t\t<td class=comment>${summary}</td>`,                    // :217
    '\t\t\t\t\t</tr>',
  ].join('\n')).join('\n');

  return [
    '\t<img id=picture style="display: none">',                         // :263
    "\t<h1>Welcome to the Helartia Herald's editorial section</h1>",     // :264
    '\t<div class=message style="width: 400">',
    '\t  Click on the links at the left to read the columns published by your fellow investors.',
    '\t</div>',
    '\t<h2>"Latest 10 columns:"</h2>',                                  // :269
    '\t\t<div style="margin-left: 20px">',                              // :194
    '\t\t\t<table cellspacing=0 cellpading=0>',
    rows,
    '\t\t\t</table>',
    '\t\t</div>',
    '<div style="margin-top: 20px">',                                   // :280 — the form block
    '\t<input id=showForm type=button value="Post a column" onClick="showForm()">',
    '</div>',
  ].join('\n');
}

/**
 * `boardmsg.asp:231-259` — one open column, with `RenderLevel` replies
 * (`:167-182`) below it.
 */
function articlePage(opts: {
  subject: string;
  author: string;
  authorDesc?: string;
  body: string;
  replies?: Array<{ author: string; subject: string; summary: string; path: string }>;
}): string {
  const { subject, author, authorDesc = '', body, replies = [] } = opts;
  const replyBlock = replies.map((r) => [
    '\t\t\t\t<div style="margin-top: 5px">',                            // :169
    `\t\t\t\t\t<b>${r.author}</b> - <a href="boardmsg.asp?root=${ROOT}&path=${encodeURIComponent(r.path)}&TownName=Helartia&WorldName=Planitia&tycoon=SPO_test3&DAAddr=10.0.0.5&DAPort=1111"> ${r.subject}</a><br>`,
    '\t\t\t\t</div>',
    '\t\t\t\t<div class=comment style="margin-left: 20px">',            // :172
    `\t\t\t\t\t${r.summary}...`,
    '\t\t\t\t</div>',
    '\t\t\t\t<div style="margin-left: 20px">',
    '\t\t\t\t</div>',
  ].join('\n')).join('\n');

  return [
    '\t\t<div style="text-align: right; border-style-bottom: solid; border-style-size: 1;">',
    '\t\t\t<a href="boardmsg.asp?root=' + ROOT + '&path=&tycoon=SPO_test3">',
    '\t\t\t\t<img src="images\\up.gif" width=36 height=30 border=0></a>',
    '\t\t</div>',
    '\t\t<table>',                                                      // :242
    '\t\t\t<tr>',
    '\t\t\t\t<td valign="top">',
    `\t\t\t\t\t<img id=picture src="/fivedata/userinfo/Planitia/${author}/largephoto.jpg" width=75 height=100>`,
    '\t\t\t\t</td>',
    '\t\t\t\t<td valign="top">',
    '\t\t\t\t\t<div class=message>',                                    // :249
    '\t\t\t\t\t\t<div class=title>',
    `\t\t\t\t\t\t\t${subject}`,
    '\t\t\t\t\t\t</div>',
    '\t\t\t\t\t\t<div class=author>',
    `\t\t\t\t\t\t\tBy ${author}</b> ${authorDesc}`,                     // :258
    '\t\t\t\t\t\t</div>',
    '\t\t\t\t\t\t<br>',
    `\t\t\t\t\t${body}`,                                                // :255 — NewsObj.BodyHTML
    '\t\t\t\t\t</div>',
    '\t\t\t\t</td>',
    '\t\t\t</tr>',
    '\t\t</table>',
    ...(replies.length > 0 ? ['\t\t<h2>Replies:</h2>', replyBlock] : []),
  ].join('\n');
}

// =============================================================================
// parseNewspaperIndex
// =============================================================================
describe('parseNewspaperIndex', () => {
  it('reads author, subject, summary and path from each index entry', () => {
    expect(parseNewspaperIndex(indexPage([
      { author: 'SPO_test3', subject: 'VERY NICE GUY', summary: 'VOTE FOR HIM', path: 'msg1.five' },
      { author: 'Innos', subject: 'Roads', summary: 'We need more', path: 'msg2.five' },
    ]))).toEqual([
      { author: 'SPO_test3', subject: 'VERY NICE GUY', summary: 'VOTE FOR HIM', path: 'msg1.five' },
      { author: 'Innos', subject: 'Roads', summary: 'We need more', path: 'msg2.five' },
    ]);
  });

  it('decodes a path carrying an escaped space', () => {
    const [entry] = parseNewspaperIndex(indexPage([
      { author: 'A', subject: 'S', summary: 'x', path: 'sub folder\\m.five' },
    ]));
    expect(entry.path).toBe('sub folder\\m.five');
  });

  it('drops an entry whose link carries no path — it opens nothing', () => {
    const html = indexPage([{ author: 'A', subject: 'S', summary: 'x', path: 'm.five' }])
      .replace('path=m.five', 'other=m.five');
    expect(parseNewspaperIndex(html)).toEqual([]);
  });

  it('an empty board yields an empty list', () => {
    expect(parseNewspaperIndex(indexPage([]))).toEqual([]);
  });

  it('returns nothing for a page carrying no index', () => {
    expect(parseNewspaperIndex('<html><body>Nothing here</body></html>')).toEqual([]);
  });

  it('strips the ellipsis the summary is printed with', () => {
    const [entry] = parseNewspaperIndex(indexPage([
      { author: 'A', subject: 'S', summary: 'A long column...', path: 'm.five' },
    ]));
    expect(entry.summary).toBe('A long column');
  });
});

// =============================================================================
// parseNewspaperArticle
// =============================================================================
describe('parseNewspaperArticle', () => {
  it('reads the subject, the byline and the body of an open column', () => {
    const article = parseNewspaperArticle(articlePage({
      subject: 'VERY NICE GUY',
      author: 'SPO_test3',
      authorDesc: 'of Yellow Inc.',
      body: 'VOTE FOR HIM',
    }));
    expect(article).toEqual({
      subject: 'VERY NICE GUY',
      byline: 'By SPO_test3 of Yellow Inc.',
      body: 'VOTE FOR HIM',
      replies: [],
    });
  });

  // `NewsObj.BodyHTML` (`:255`) is markup other players typed. This client has no
  // sanitiser, so nothing may leave the gateway as markup.
  it('strips the markup of a body — the client is never handed HTML', () => {
    const article = parseNewspaperArticle(articlePage({
      subject: 'S', author: 'A',
      body: '<b>Bold</b><script>alert(1)</script><br>Second line',
    }));
    expect(article?.body).not.toContain('<');
    expect(article?.body).not.toContain('script');
    expect(article?.body).toContain('Bold');
    expect(article?.body).toContain('Second line');
  });

  it('decodes the entities the board escapes', () => {
    const article = parseNewspaperArticle(articlePage({
      subject: 'S', author: 'A', body: 'Taxes &amp; jobs &lt;now&gt;',
    }));
    expect(article?.body).toBe('Taxes & jobs <now>');
  });

  it('reads the replies of an open column', () => {
    const article = parseNewspaperArticle(articlePage({
      subject: 'S', author: 'A', body: 'B',
      replies: [
        { author: 'Bob', subject: 'Agreed', summary: 'Well said', path: 'r1.five' },
        { author: 'Eve', subject: 'Nonsense', summary: 'I disagree', path: 'r2.five' },
      ],
    }));
    expect(article?.replies).toEqual([
      { author: 'Bob', subject: 'Agreed', summary: 'Well said', path: 'r1.five' },
      { author: 'Eve', subject: 'Nonsense', summary: 'I disagree', path: 'r2.five' },
    ]);
  });

  // `:231` renders the article block only when `NewsObj.Open(path) = 0` AND the
  // node is not `FolderOnly` — the index page is the other branch.
  it('returns null for the index page', () => {
    expect(parseNewspaperArticle(indexPage([
      { author: 'A', subject: 'S', summary: 'x', path: 'm.five' },
    ]))).toBeNull();
  });

  it('a column with no byline still reads its subject and body', () => {
    const html = articlePage({ subject: 'S', author: 'A', body: 'B' })
      .replace('<div class=author>', '<div class=other>');
    const article = parseNewspaperArticle(html);
    expect(article?.subject).toBe('S');
    expect(article?.byline).toBe('');
    expect(article?.body).toContain('B');
  });
});

// =============================================================================
// getNewspaperBoard
// =============================================================================
describe('getNewspaperBoard', () => {
  it('reads the index with top=TRUE and the board root, %20-encoded', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(indexPage([
      { author: 'SPO_test3', subject: 'VERY NICE GUY', summary: 'VOTE FOR HIM', path: 'm1.five' },
    ])));

    const board = await getNewspaperBoard(fake.ctx, TARGET);

    const url = mockFetch.mock.calls[0][0];
    expect(url).toMatch(/^http:\/\/158\.69\.153\.134\/Five\/0\/Visual\/News\/boardmsg\.asp\?/);
    expect(url).not.toContain('+');
    const q = queryOf(0);
    expect(q.get('top')).toBe('TRUE');
    expect(q.get('root')).toBe(ROOT);
    expect(q.get('path')).toBe(ROOT);
    expect(q.get('PaperName')).toBe('Helartia Herald');
    expect(q.get('TownName')).toBe('Helartia');
    expect(q.get('WorldName')).toBe('Planitia');
    expect(q.get('DAAddr')).toBe('10.0.0.5');
    expect(q.get('DAPort')).toBe('1111');

    expect(board.root).toBe(ROOT);
    expect(board.path).toBe(ROOT);
    expect(board.columns).toHaveLength(1);
    expect(board.article).toBeNull();
    expect(board.error).toBe('');
  });

  // `boardmsg.asp:10` reads `Tycoon`; the Politics pages read `TycoonName`.
  // Sending the wrong one posts as an empty author, which `:93` rejects.
  it('names the reader `Tycoon`, not `TycoonName`', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(''));
    await getNewspaperBoard(fake.ctx, TARGET);
    expect(queryOf(0).get('Tycoon')).toBe('SPO_test3');
    expect(queryOf(0).get('TycoonName')).toBeNull();
  });

  it('opens one column when a path is given', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(articlePage({
      subject: 'Roads', author: 'Innos', body: 'More of them',
    })));

    const board = await getNewspaperBoard(fake.ctx, TARGET, 'm1.five');

    expect(queryOf(0).get('path')).toBe('m1.five');
    expect(board.path).toBe('m1.five');
    expect(board.article?.subject).toBe('Roads');
    // `RenderGlobal` is not called on a column page (`:266-272`), so the index
    // is legitimately empty here rather than missing.
    expect(board.columns).toEqual([]);
  });

  it('a Capitol board carries Capitol=YES with x/y and an empty TownName', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(''));
    await getNewspaperBoard(fake.ctx, { ...TARGET, isCapitol: true });
    const q = queryOf(0);
    expect(q.get('Capitol')).toBe('YES');
    expect(q.get('x')).toBe('118');
    expect(q.get('y')).toBe('226');
    expect(q.get('TownName')).toBe('');
  });

  it('refuses when the DA lock channel is unset, rather than falling back to the directory host/port', async () => {
    const fake = makeWebCtx({ activeUsername: null, cachedUsername: 'Cached', daAddr: null, daPort: null });
    mockFetch.mockResolvedValue(htmlResponse(''));
    const result = await getNewspaperBoard(fake.ctx, TARGET);
    expect(result.error).toBe('ASP call refused: DA lock channel not announced yet (daAddr/daPort unset)');
  });

  it('reports an HTTP failure instead of parsing the error body', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse('<html><title>404</title></html>', 404));

    const board = await getNewspaperBoard(fake.ctx, TARGET);

    expect(board.error).toBe('The newspaper answered HTTP 404.');
    expect(board.columns).toEqual([]);
    expect(fake.log.warn).toHaveBeenCalledWith(expect.stringContaining('board answered HTTP 404'));
  });

  it('reports a transport failure', async () => {
    const fake = makeWebCtx();
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const board = await getNewspaperBoard(fake.ctx, TARGET);
    expect(board.error).toBe('ECONNREFUSED');
    expect(fake.log.warn).toHaveBeenCalledWith('[Newspaper] Board read failed: ECONNREFUSED');
  });

  it('does not fetch when the world is unknown', async () => {
    const fake = makeWebCtx({ currentWorldInfo: null });
    const board = await getNewspaperBoard(fake.ctx, TARGET);
    expect(board.error).toBe('Not connected to a world.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // A town with no paper has no board tree: `boards\<World>\\` would be the
  // world's own folder, and reading it is meaningless rather than empty.
  it('does not fetch when the town has no newspaper', async () => {
    const fake = makeWebCtx();
    const board = await getNewspaperBoard(fake.ctx, { ...TARGET, paperName: '' });
    expect(board.error).toBe('This town has no newspaper.');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// =============================================================================
// postNewspaperColumn
// =============================================================================
describe('postNewspaperColumn', () => {
  const POSTED = indexPage([
    { author: 'SPO_test3', subject: 'VERY NICE GUY', summary: 'VOTE FOR HIM', path: 'm1.five' },
  ]);

  it('posts a form body with action=post and Reply=NO for a new column', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(POSTED));

    const result = await postNewspaperColumn(fake.ctx, TARGET, 'VERY NICE GUY', 'VOTE FOR HIM');

    const [, init] = mockFetch.mock.calls[0];
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const form = new URLSearchParams((init as { body: string }).body);
    expect(form.get('Subject')).toBe('VERY NICE GUY');
    expect(form.get('Body')).toBe('VOTE FOR HIM');
    // `:87` compares to the literal "YES"; anything else posts at the root.
    expect(form.get('Reply')).toBe('NO');

    const q = queryOf(0);
    expect(q.get('action')).toBe('post');
    expect(q.get('path')).toBe(ROOT);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Column published');
    expect(result.board?.columns).toHaveLength(1);
  });

  it('posts a reply under the open column with Reply=YES', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(POSTED));

    await postNewspaperColumn(fake.ctx, TARGET, 'VERY NICE GUY', 'me too', 'm1.five');

    const form = new URLSearchParams((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(form.get('Reply')).toBe('YES');
    expect(queryOf(0).get('path')).toBe('m1.five');
  });

  // `:87-91` — `parentPath` is the root when `Reply` is not YES, so a reply
  // whose path IS the root is a top-level post, not a reply to the folder.
  it('treats a reply to the board root as a new column', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(POSTED));
    await postNewspaperColumn(fake.ctx, TARGET, 'VERY NICE GUY', 'x', ROOT);
    const form = new URLSearchParams((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(form.get('Reply')).toBe('NO');
  });

  // The page answers 200 whether or not it posted (`:94` drops a subject-less
  // post silently), so the re-rendered index is the only oracle.
  it('reports failure when the column is absent from the re-rendered index', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(indexPage([])));

    const result = await postNewspaperColumn(fake.ctx, TARGET, 'VERY NICE GUY', 'x');

    expect(result.success).toBe(false);
    expect(result.message).toBe('The newspaper did not publish the column.');
    // The board still travels: it is the current state of the page.
    expect(result.board).not.toBeNull();
  });

  it('matches the published column on author AND subject', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse(indexPage([
      { author: 'SomeoneElse', subject: 'VERY NICE GUY', summary: 'x', path: 'm1.five' },
    ])));
    const result = await postNewspaperColumn(fake.ctx, TARGET, 'VERY NICE GUY', 'x');
    expect(result.success).toBe(false);
  });

  it('refuses a subject-less post without reaching the server', async () => {
    const fake = makeWebCtx();
    const result = await postNewspaperColumn(fake.ctx, TARGET, '   ', 'body');
    expect(result).toEqual({ success: false, message: 'A column needs a subject.', board: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refuses to post with no signed-in author — `:93` would drop it silently', async () => {
    const fake = makeWebCtx({ activeUsername: null, cachedUsername: null });
    const result = await postNewspaperColumn(fake.ctx, TARGET, 'S', 'B');
    expect(result).toEqual({ success: false, message: 'Not signed in.', board: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not post when the world is unknown', async () => {
    const fake = makeWebCtx({ currentWorldInfo: null });
    const result = await postNewspaperColumn(fake.ctx, TARGET, 'S', 'B');
    expect(result.message).toBe('Not connected to a world.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not post when the town has no newspaper', async () => {
    const fake = makeWebCtx();
    const result = await postNewspaperColumn(fake.ctx, { ...TARGET, paperName: '' }, 'S', 'B');
    expect(result.message).toBe('This town has no newspaper.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports an HTTP failure', async () => {
    const fake = makeWebCtx();
    mockFetch.mockResolvedValue(htmlResponse('', 500));
    const result = await postNewspaperColumn(fake.ctx, TARGET, 'S', 'B');
    expect(result).toEqual({ success: false, message: 'The newspaper answered HTTP 500.', board: null });
  });

  it('reports a transport failure', async () => {
    const fake = makeWebCtx();
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));
    const result = await postNewspaperColumn(fake.ctx, TARGET, 'S', 'B');
    expect(result).toEqual({ success: false, message: 'ECONNRESET', board: null });
    expect(fake.log.warn).toHaveBeenCalledWith('[Newspaper] Post failed: ECONNRESET');
  });
});
