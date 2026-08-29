/**
 * Newspaper handler — the town paper's editorial board.
 *
 * This is what Voyager's "Rate the Mayor" button opens: `TownHallSheet.pas:343`
 * navigates to `Visual/News/boardreader.asp` with the town's `PaperName`, not to
 * anything under `Politics/`. The board is a `NewsBoard.NewsObject` COM tree
 * rooted at `boards\<World>\<Paper>\`, reachable only through the ASP pages —
 * there is no RDO member for it.
 *
 * Two operations, both on `boardmsg.asp`:
 *   - read   `?top=TRUE&root=…&path=…`      -> the index, or one column
 *   - post   `?action=post&…` + a form body -> `NewsObj.NewMessage` (`:146`)
 *
 * **Bodies come back as TEXT, never as HTML.** `NewsObj.BodyHTML` (`:255`) is
 * markup typed by other players and stored verbatim; this client has no
 * sanitiser and no `dangerouslySetInnerHTML` anywhere, and adding both to render
 * a column would open an XSS hole for a feature that needs none. The tags are
 * dropped here, at the edge, so nothing downstream has to be trusted.
 */

import type { SessionContext } from './session-context';
import type { NewspaperArticle, NewspaperBoard, NewspaperColumn } from '../../shared/types';
import { toErrorMessage } from '../../shared/error-utils';
import { config } from '../../shared/config';
import { fetchWithTimeout } from '../fetch-with-timeout';
import { redactUrlCredentials } from '../url-redact';

// =========================================================================
// PARSING
// =========================================================================

/** Drop every tag and collapse whitespace — see the file header on why. */
function toText(fragment: string): string {
  return fragment
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** The `path` query parameter of a board link — the id of a column. */
const LINK_PATH = /[?&]path=([^"'&]*)/i;

/**
 * One index entry of `RenderGlobal` (`boardmsg.asp:198-219`): an author cell,
 * a spacer cell, then the subject as a link whose `path` identifies the column,
 * followed by a second row holding the summary.
 */
const INDEX_ENTRY =
  /<div\s+class=author><b>([\s\S]*?)<\/b><\/div>[\s\S]*?<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<td\s+class=comment>([\s\S]*?)<\/td>/gi;

/**
 * One reply of `RenderLevel` (`boardmsg.asp:170-176`).
 *
 * Rendered recursively into nested `<div>`s; we read them FLAT. Recovering the
 * nesting would mean matching `</div>` depth through markup the server does not
 * indent reliably, and the reply list is a navigation aid — every entry is
 * reachable by its own `path` whatever level it sits at.
 */
const REPLY_ENTRY =
  /<b>([\s\S]*?)<\/b>\s*-\s*<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div\s+class=comment[^>]*>([\s\S]*?)<\/div>/gi;

/** `boardmsg.asp:250-256` — the open column: title, byline, body. */
const ARTICLE_TITLE = /<div\s+class=title>([\s\S]*?)<\/div>/i;
const ARTICLE_AUTHOR = /<div\s+class=author>([\s\S]*?)<\/div>/i;
const ARTICLE_MESSAGE = /<div\s+class=message>([\s\S]*?)<\/div>\s*<\/td>/i;

function pathOf(href: string): string {
  const match = LINK_PATH.exec(href);
  return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : '';
}

/** The "Latest 10 columns" index. Empty for a page showing one column. */
export function parseNewspaperIndex(html: string): NewspaperColumn[] {
  const columns: NewspaperColumn[] = [];
  INDEX_ENTRY.lastIndex = 0;
  let entry: RegExpExecArray | null;
  while ((entry = INDEX_ENTRY.exec(html)) !== null) {
    const path = pathOf(entry[2]);
    if (!path) continue;
    columns.push({
      author: toText(entry[1]),
      path,
      subject: toText(entry[3]),
      summary: toText(entry[4]).replace(/\.{3}$/, ''),
    });
  }
  return columns;
}

/**
 * The open column, or `null` when the page rendered the index instead.
 *
 * `boardmsg.asp:231` is the discriminator: the article block exists only when
 * `NewsObj.Open(path) = 0` AND the node is not `FolderOnly`, which is exactly
 * the case where a `<div class=message>` is emitted.
 */
export function parseNewspaperArticle(html: string): NewspaperArticle | null {
  const message = ARTICLE_MESSAGE.exec(html);
  if (!message) return null;

  const title = ARTICLE_TITLE.exec(message[1]);
  const author = ARTICLE_AUTHOR.exec(message[1]);

  // The body is whatever follows the byline inside the message div (`:253-255`).
  const afterByline = author
    ? message[1].slice(author.index + author[0].length)
    : message[1];

  const replies: NewspaperColumn[] = [];
  REPLY_ENTRY.lastIndex = 0;
  let reply: RegExpExecArray | null;
  while ((reply = REPLY_ENTRY.exec(html)) !== null) {
    const path = pathOf(reply[2]);
    if (!path) continue;
    replies.push({
      author: toText(reply[1]),
      path,
      subject: toText(reply[3]),
      summary: toText(reply[4]).replace(/\.{3}$/, ''),
    });
  }

  return {
    subject: title ? toText(title[1]) : '',
    // `:258` prints "By <author> <authorDesc>" — one line, kept as one line.
    byline: author ? toText(author[1]) : '',
    body: toText(afterByline),
    replies,
  };
}

// =========================================================================
// TRANSPORT
// =========================================================================

/** Everything the board pages need to identify the paper and the reader. */
export interface NewspaperTarget {
  paperName: string;
  townName: string;
  isCapitol: boolean;
  buildingX: number;
  buildingY: number;
}

function boardRoot(worldName: string, paperName: string): string {
  // `boardreader.asp:5` — the tree the NewsBoard COM object is rooted at.
  return `boards\\${worldName}\\${paperName}\\`;
}

function boardParams(ctx: SessionContext, target: NewspaperTarget, root: string, path: string): URLSearchParams {
  return new URLSearchParams({
    root,
    path,
    // `boardmsg.asp:10` reads `Tycoon`, NOT `TycoonName` — the Politics pages
    // read the other one. Sending the wrong name posts as an empty author,
    // which `:93` rejects outright.
    Tycoon: ctx.activeUsername || ctx.cachedUsername || '',
    WorldName: ctx.currentWorldInfo?.name || '',
    TownName: target.isCapitol ? '' : target.townName,
    PaperName: target.paperName,
    Capitol: target.isCapitol ? 'YES' : '',
    x: target.isCapitol ? String(target.buildingX) : '',
    y: target.isCapitol ? String(target.buildingY) : '',
    DAAddr: ctx.daAddr || config.rdo.directoryHost,
    DAPort: String(ctx.daPort || config.rdo.ports.directory),
  });
}

/** Paper names and town names carry spaces; `+` is not decoded by these pages. */
function encodeParams(params: URLSearchParams): string {
  return params.toString().replace(/\+/g, '%20');
}

function emptyBoard(target: NewspaperTarget, error: string): NewspaperBoard {
  return {
    paperName: target.paperName,
    root: '',
    path: '',
    columns: [],
    article: null,
    error,
  };
}

/**
 * Read the board index, or one column when `path` names one.
 *
 * `top=TRUE` is what makes `boardmsg.asp` render the standalone page rather than
 * the frame body (`:44-48` reloads the sibling frame without it, which we have
 * no frameset for).
 */
export async function getNewspaperBoard(
  ctx: SessionContext, target: NewspaperTarget, path?: string
): Promise<NewspaperBoard> {
  const worldIp = ctx.currentWorldInfo?.ip;
  const worldName = ctx.currentWorldInfo?.name || '';
  if (!worldIp) return emptyBoard(target, 'Not connected to a world.');
  if (!target.paperName) return emptyBoard(target, 'This town has no newspaper.');

  const root = boardRoot(worldName, target.paperName);
  const wanted = path || root;

  try {
    const params = boardParams(ctx, target, root, wanted);
    params.set('top', 'TRUE');
    const url = `http://${worldIp}/Five/0/Visual/News/boardmsg.asp?${encodeParams(params)}`;
    ctx.log.debug(`[Newspaper] Reading ${redactUrlCredentials(url)}`);

    const resp = await fetchWithTimeout(url, { redirect: 'follow' });
    if (!resp.ok) {
      ctx.log.warn(`[Newspaper] board answered HTTP ${resp.status} — ${redactUrlCredentials(url)}`);
      return emptyBoard(target, `The newspaper answered HTTP ${resp.status}.`);
    }
    const html = await resp.text();

    return {
      paperName: target.paperName,
      root,
      path: wanted,
      // The index is only rendered on the folder page (`:266-272`), so on a
      // column page this is legitimately empty and `article` carries the content.
      columns: parseNewspaperIndex(html),
      article: parseNewspaperArticle(html),
      error: '',
    };
  } catch (e: unknown) {
    ctx.log.warn(`[Newspaper] Board read failed: ${toErrorMessage(e)}`);
    return emptyBoard(target, toErrorMessage(e));
  }
}

/**
 * Publish a column, or a reply to one.
 *
 * `boardmsg.asp:83-153` posts through `NewsObj.NewMessage( parentPath, Tycoon,
 * AuthorDesc, "", Subject, Body )`. `parentPath` is the open `path` when
 * `Reply=YES` and the board `root` otherwise (`:87-91`), so a new top-level
 * column is `Reply=NO`.
 *
 * The page validates exactly two things — a non-empty `parentPath` and a
 * non-empty `Tycoon` (`:93`), then a non-empty `Subject` (`:94`) — and answers
 * 200 either way, so the response body is the only oracle. A post that took
 * effect re-renders the index with the new column in it (`:47` also reloads the
 * list frame), which is what we read back.
 */
export async function postNewspaperColumn(
  ctx: SessionContext,
  target: NewspaperTarget,
  subject: string,
  body: string,
  replyToPath?: string,
): Promise<{ success: boolean; message: string; board: NewspaperBoard | null }> {
  const worldIp = ctx.currentWorldInfo?.ip;
  const worldName = ctx.currentWorldInfo?.name || '';
  if (!worldIp) return { success: false, message: 'Not connected to a world.', board: null };
  if (!target.paperName) return { success: false, message: 'This town has no newspaper.', board: null };
  // `:94` drops a subject-less post silently. Refusing here says why.
  if (subject.trim() === '') {
    return { success: false, message: 'A column needs a subject.', board: null };
  }
  const author = ctx.activeUsername || ctx.cachedUsername || '';
  if (author === '') {
    return { success: false, message: 'Not signed in.', board: null };
  }

  const root = boardRoot(worldName, target.paperName);
  const isReply = replyToPath !== undefined && replyToPath !== '' && replyToPath !== root;

  try {
    const params = boardParams(ctx, target, root, isReply ? replyToPath : root);
    params.set('action', 'post');
    const url = `http://${worldIp}/Five/0/Visual/News/boardmsg.asp?${encodeParams(params)}`;

    // `Reply` is a radio on the page's own form (`:298-300`); the ASP compares
    // it to the literal "YES" (`:87`), so anything else means "post at root".
    const form = new URLSearchParams({
      Subject: subject,
      Body: body,
      Reply: isReply ? 'YES' : 'NO',
    });

    ctx.log.debug(`[Newspaper] Posting "${subject}" to ${target.paperName}`);
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!resp.ok) {
      return { success: false, message: `The newspaper answered HTTP ${resp.status}.`, board: null };
    }
    const html = await resp.text();

    // The state after is the oracle: the response IS the board re-rendered.
    const columns = parseNewspaperIndex(html);
    const published = columns.some(c => c.author.toLowerCase() === author.toLowerCase()
      && c.subject.trim() === subject.trim());

    return {
      success: published,
      message: published
        ? 'Column published'
        : 'The newspaper did not publish the column.',
      board: {
        paperName: target.paperName,
        root,
        path: root,
        columns,
        article: parseNewspaperArticle(html),
        error: '',
      },
    };
  } catch (e: unknown) {
    ctx.log.warn(`[Newspaper] Post failed: ${toErrorMessage(e)}`);
    return { success: false, message: toErrorMessage(e), board: null };
  }
}
