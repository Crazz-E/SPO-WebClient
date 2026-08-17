/**
 * Tests for the image proxy URL helpers.
 *
 * The gateway serves every remote image through `/proxy-image?url=…` so the
 * browser never talks to the game server directly. The contract that matters is
 * that the original URL survives the round trip intact — an under-encoded `&`
 * or `?` would split into a second query parameter and the proxy would fetch
 * the wrong thing (or nothing).
 */

import { PROXY_IMAGE_ENDPOINT, fileToProxyUrl, isProxyUrl, toProxyUrl } from './proxy-utils';

/** Read back the `url` parameter the way the proxy endpoint does. */
function proxiedTarget(proxyUrl: string): string {
  const query = proxyUrl.slice(proxyUrl.indexOf('?') + 1);
  return new URLSearchParams(query).get('url') ?? '';
}

describe('PROXY_IMAGE_ENDPOINT', () => {
  it('is the path the gateway registers', () => {
    expect(PROXY_IMAGE_ENDPOINT).toBe('/proxy-image');
  });
});

describe('toProxyUrl', () => {
  // The three documented examples (proxy-utils.ts:20-33) are the published
  // contract; pinning them byte for byte is the point of these three cases.
  it('passes an absolute http URL through, encoded', () => {
    expect(toProxyUrl('http://server.com/image.gif'))
      .toBe('/proxy-image?url=http%3A%2F%2Fserver.com%2Fimage.gif');
  });

  it('prefixes a relative path with the base host', () => {
    expect(toProxyUrl('/images/logo.png', 'game.server.com:8080'))
      .toBe('/proxy-image?url=http%3A%2F%2Fgame.server.com%3A8080%2Fimages%2Flogo.png');
  });

  it('passes a file URL through, encoded', () => {
    expect(toProxyUrl('file:///C:/path/to/image.bmp'))
      .toBe('/proxy-image?url=file%3A%2F%2F%2FC%3A%2Fpath%2Fto%2Fimage.bmp');
  });

  it('leaves an https URL absolute even when a base host is supplied', () => {
    expect(proxiedTarget(toProxyUrl('https://cdn.example/img.png', 'game.server.com')))
      .toBe('https://cdn.example/img.png');
  });

  it('inserts the missing slash when the relative path has none', () => {
    expect(proxiedTarget(toProxyUrl('images/logo.png', 'game.server.com:8080')))
      .toBe('http://game.server.com:8080/images/logo.png');
  });

  it('leaves a relative path alone when there is no base host', () => {
    // Nothing to resolve against — the path is passed on as-is rather than
    // being turned into a URL pointing at the gateway itself.
    expect(proxiedTarget(toProxyUrl('/images/logo.png'))).toBe('/images/logo.png');
  });

  it('keeps a query string in one piece', () => {
    const remote = 'http://158.69.153.134/Visual/Render.asp?id=42&size=large';

    const proxied = toProxyUrl(remote);

    // Under-encoding here would make `size=large` a parameter of the proxy
    // endpoint instead of part of the target URL.
    expect(proxied.split('&')).toHaveLength(1);
    expect(proxiedTarget(proxied)).toBe(remote);
  });

  it('double-proxies an already-proxied URL rather than detecting it', () => {
    // Documented behaviour, not an endorsement: toProxyUrl is unconditional, so
    // callers are the ones responsible for not proxying twice (isProxyUrl).
    const once = toProxyUrl('http://server.com/image.gif');

    expect(proxiedTarget(toProxyUrl(once))).toBe(once);
  });

  it('encodes an empty URL to an empty target', () => {
    expect(toProxyUrl('')).toBe('/proxy-image?url=');
  });
});

describe('fileToProxyUrl', () => {
  it('builds the documented file URL', () => {
    expect(fileToProxyUrl('C:/cache/Maps/Antiqua/Antiqua.bmp'))
      .toBe('/proxy-image?url=file%3A%2F%2FC%3A%2Fcache%2FMaps%2FAntiqua%2FAntiqua.bmp');
  });

  it('normalises Windows separators — the client runs on win32', () => {
    expect(proxiedTarget(fileToProxyUrl('C:\\cache\\Maps\\Antiqua\\Antiqua.bmp')))
      .toBe('file://C:/cache/Maps/Antiqua/Antiqua.bmp');
  });

  it('keeps a path containing spaces in one piece', () => {
    expect(proxiedTarget(fileToProxyUrl('C:/Program Files/spo/logo.bmp')))
      .toBe('file://C:/Program Files/spo/logo.bmp');
  });
});

describe('isProxyUrl', () => {
  it('recognises what toProxyUrl produced', () => {
    expect(isProxyUrl(toProxyUrl('http://server.com/image.gif'))).toBe(true);
    expect(isProxyUrl(fileToProxyUrl('C:/cache/x.bmp'))).toBe(true);
  });

  it('rejects a remote URL', () => {
    expect(isProxyUrl('http://server.com/image.gif')).toBe(false);
    expect(isProxyUrl('')).toBe(false);
  });

  it('only matches at the start, so an embedded endpoint is not a proxy URL', () => {
    // This is the encoded form of a target that happens to mention the
    // endpoint; treating it as already-proxied would skip a needed proxy pass.
    expect(isProxyUrl('http://server.com/proxy-image?url=x')).toBe(false);
  });
});
