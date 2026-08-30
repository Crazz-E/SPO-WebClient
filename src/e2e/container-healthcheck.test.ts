/**
 * The container readiness probe — the `HEALTHCHECK` the Dockerfile ships.
 *
 * Why it exists: the previous probe asked `/api/startup-status` for a status code, and
 * that endpoint is a Server-Sent Events stream whose `200` header is written before
 * initialisation finishes (`server.ts`). A gateway that was listening but hung therefore
 * reported healthy forever, and the deploy health gate — now in SPO-Deploy's `deploy.sh` —
 * delegates its own failure handling to exactly that signal (policy SEC-R-3).
 *
 * The suite runs the probe *as the image runs it* — the snippet is read out of the
 * Dockerfile rather than restated here, so an edit to the image that breaks the probe
 * breaks this test.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';

const DOCKERFILE = path.join(process.cwd(), 'Dockerfile');

/** The `node -e '<snippet>'` the HEALTHCHECK instruction runs. */
function probeSnippet(): string {
  const dockerfile = fs.readFileSync(DOCKERFILE, 'utf8');
  const match = /^\s*CMD node -e '([\s\S]*?)'\s*$/m.exec(dockerfile);
  if (!match) throw new Error('no `CMD node -e` healthcheck snippet found in the Dockerfile');
  return match[1];
}

/**
 * Same snippet, pointed at a throwaway port instead of the image's 8080. Spawned
 * asynchronously on purpose: `spawnSync` would block this process's event loop, and the
 * fake server the probe is aimed at lives in it — it would never accept the connection.
 */
function runProbe(port: number): Promise<number> {
  const snippet = probeSnippet().replace('localhost:8080', `127.0.0.1:${port}`);
  const child = spawn(process.execPath, ['-e', snippet], { stdio: 'ignore', timeout: 15_000 });
  return new Promise<number>(resolve => {
    child.on('exit', code => resolve(code ?? -1));
    child.on('error', () => resolve(-1));
  });
}

type Responder = (res: http.ServerResponse) => void;

/** A throwaway HTTP server on an ephemeral port. Never the bench port. */
async function serving(respond: Responder): Promise<number> {
  const server = http.createServer((_req, res) => respond(res));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await runProbe((server.address() as AddressInfo).port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function sseHead(res: http.ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.flushHeaders();
}

function statusEvent(phase: string, message: string): string {
  return `event: status\ndata: ${JSON.stringify({ phase, progress: 1, message, services: [] })}\n\n`;
}

describe('the readiness probe the Dockerfile ships', () => {
  it('is extractable — the HEALTHCHECK still runs a node snippet', () => {
    const snippet = probeSnippet();
    expect(snippet).toContain('/api/startup-status');
    expect(snippet).toContain('phase');
  });

  it('succeeds when the server answers ready and closes (the initialised case)', async () => {
    const code = await serving(res => {
      sseHead(res);
      res.write(statusEvent('ready', 'Server ready'));
      res.end();
    });
    expect(code).toBe(0);
  });

  it('succeeds when ready arrives after progress events, without closing first', async () => {
    const code = await serving(res => {
      sseHead(res);
      res.write(statusEvent('initializing', 'Loading facilities'));
      setTimeout(() => res.write(statusEvent('ready', 'Server ready')), 150);
    });
    expect(code).toBe(0);
  });

  it('FAILS for a server that is listening but hung — the whole point', async () => {
    // 200 headers written, progress that never reaches ready, stream held open. The old
    // probe returned 0 here. Note the message: "already" contains "ready", so a probe that
    // merely searched the body for that word would pass this too.
    const code = await serving(res => {
      sseHead(res);
      res.write(statusEvent('initializing', 'Cache already up to date'));
    });
    expect(code).toBe(1);
  }, 20_000);

  it('fails on a non-200 answer', async () => {
    const code = await serving(res => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end('{"phase":"ready"}');
    });
    expect(code).toBe(1);
  });

  it('fails when nothing is listening', async () => {
    // Take a port, learn its number, give it back: nothing is listening on it afterwards.
    const closed = http.createServer();
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>(resolve => closed.close(() => resolve()));
    await expect(runProbe(port)).resolves.toBe(1);
  });
});
