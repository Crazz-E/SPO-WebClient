import { parseStartupStream, preflight } from './preflight';

/** The endpoint speaks Server-Sent Events, so the stub must too. */
function sseResponse(events: unknown[], ok = true): Response {
  const body = events.map(e => `event: status\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return { ok, status: ok ? 200 : 500, text: async () => body } as unknown as Response;
}

function jsonResponse(body: unknown, ok = true): Response {
  return sseResponse([body], ok);
}

const logUrl = 'http://logs/Survival%2026-08-21.log';

describe('parseStartupStream', () => {
  it('takes the last event, not the first — a cold boot streams progress before ready', () => {
    const body = [
      'event: status',
      'data: {"phase":"initializing","message":"Downloading game assets..."}',
      '',
      'event: status',
      'data: {"phase":"ready","progress":1}',
      '',
    ].join('\n');
    expect(parseStartupStream(body).phase).toBe('ready');
  });

  it('handles CRLF line endings', () => {
    expect(parseStartupStream('event: status\r\ndata: {"phase":"ready"}\r\n\r\n').phase).toBe('ready');
  });

  it('returns an empty status for an empty body rather than throwing', () => {
    expect(parseStartupStream('')).toEqual({});
  });

  it('returns an empty status when the payload is not JSON', () => {
    expect(parseStartupStream('data: <html>proxy error</html>')).toEqual({});
  });
});

describe('preflight', () => {
  it('passes when the gateway is ready and the log is reachable', async () => {
    const result = await preflight(
      (async () => jsonResponse({ phase: 'ready' })) as unknown as typeof fetch,
      async () => logUrl,
    );
    expect(result.ok).toBe(true);
    expect(result.environmentAbort).toBe(false);
    expect(result.survivalLogUrl).toBe(logUrl);
  });

  it('fails when the gateway is still starting up', async () => {
    const result = await preflight(
      (async () => sseResponse([{ phase: 'initializing' }, { phase: 'loading-terrain' }])) as unknown as typeof fetch,
      async () => logUrl,
    );
    expect(result.ok).toBe(false);
    expect(result.checks[0]).toMatchObject({ what: 'gateway is ready', ok: false });
    expect(result.checks[0].detail).toContain('loading-terrain');
  });

  it('tells the operator how to start the gateway when it is not there at all', async () => {
    const result = await preflight(
      (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
      async () => logUrl,
    );
    expect(result.checks[0].detail).toMatch(/npm run dev/);
  });

  it('fails when the model-server log cannot be read — no mutation could be proven', async () => {
    const result = await preflight(
      (async () => jsonResponse({ phase: 'ready' })) as unknown as typeof fetch,
      async () => {
        throw new Error('host down');
      },
    );
    expect(result.ok).toBe(false);
    expect(result.checks[1]).toMatchObject({ what: 'model-server log reachable', ok: false });
    expect(result.survivalLogUrl).toBeUndefined();
  });

  it('classifies every failure as an environment abort, not a failed attempt', async () => {
    const result = await preflight(
      (async () => jsonResponse({}, false)) as unknown as typeof fetch,
      async () => logUrl,
    );
    expect(result.environmentAbort).toBe(true);
  });
});
