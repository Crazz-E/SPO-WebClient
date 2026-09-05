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

/**
 * A world-server page about to be rendered inside the app's own origin: scripts and inline
 * handlers removed (the sandbox already refuses to run them — this is the second fence), and a
 * `<base href>` pointing at the page's directory so its relative stylesheets keep resolving.
 */
export function prepareInlinedMailPage(html: string, pageUrl: string): string {
  let stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  const url = new URL(pageUrl);
  // The Delphi server writes doubled slashes into these paths (`Five//0/…//MsgZoned.asp`);
  // collapse them so the directory a stylesheet resolves against is the one that exists.
  const cleanPath = url.pathname.replace(/\/{2,}/g, '/');
  const dir = `${url.origin}${cleanPath.slice(0, cleanPath.lastIndexOf('/') + 1)}`;
  const base = `<base href="${dir}">`;

  const headMatch = stripped.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = stripped.indexOf(headMatch[0]) + headMatch[0].length;
    stripped = stripped.slice(0, idx) + base + stripped.slice(idx);
  } else {
    stripped = `<head>${base}</head>${stripped}`;
  }

  return stripped;
}
