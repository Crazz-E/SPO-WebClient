/**
 * Mail HTML utilities — detect HTML content and extract META REFRESH URLs.
 *
 * Mail bodies from the Delphi game server can be either plain text (user-composed)
 * or HTML (system notifications that redirect to ASP pages on the World Web Server).
 */

/**
 * Check whether mail body lines contain HTML content.
 * System messages start with HTML document tags like `<HEAD>`, `<META>`, `<BODY>`.
 */
export function isHtmlContent(bodyLines: string[]): boolean {
  const joined = bodyLines.join('\n').trimStart();
  return /^<(!DOCTYPE|HTML|HEAD|META|BODY)\b/i.test(joined);
}

/**
 * Extract the redirect URL from a META HTTP-EQUIV="REFRESH" tag.
 * Returns null if no META REFRESH is present.
 *
 * @example
 * extractMetaRefreshUrl('<META HTTP-EQUIV="REFRESH" CONTENT="0; URL=http://example.com/page">')
 * // => 'http://example.com/page'
 */
export function extractMetaRefreshUrl(html: string): string | null {
  const match = html.match(
    /<META[^>]*HTTP-EQUIV\s*=\s*"REFRESH"[^>]*CONTENT\s*=\s*"[^"]*URL\s*=\s*([^">\s]+)/i,
  );
  return match?.[1]?.trim() ?? null;
}

const SCRIPT_BLOCK_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const DANGLING_SCRIPT_TAG_RE = /<script\b[^>]*>/gi;
const INLINE_HANDLER_ATTR_RE = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const HEAD_TAG_RE = /<head[^>]*>/i;

/**
 * A world-server page about to be rendered inside the app's own origin: scripts and inline
 * handlers removed (the sandbox already refuses to run them — this is the second fence), and
 * a `<base href>` pointing at the page's directory so its relative stylesheets keep resolving.
 */
export function prepareInlinedMailPage(html: string, pageUrl: string): string {
  const stripped = html
    .replace(SCRIPT_BLOCK_RE, '')
    .replace(DANGLING_SCRIPT_TAG_RE, '')
    .replace(INLINE_HANDLER_ATTR_RE, '');

  const url = new URL(pageUrl);
  const dir = `${url.origin}${url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1)}`;
  const base = `<base href="${dir}">`;

  const headMatch = stripped.match(HEAD_TAG_RE);
  if (headMatch) {
    const idx = stripped.indexOf(headMatch[0]) + headMatch[0].length;
    return stripped.slice(0, idx) + base + stripped.slice(idx);
  }
  return `<head>${base}</head>${stripped}`;
}
