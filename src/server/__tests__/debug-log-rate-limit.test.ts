/**
 * The 429 body for /api/debug-log must state the real retry delay, derived from
 * RATE_LIMIT_WINDOW_MS (60s), not a hardcoded 30s. Drives the endpoint over a real
 * socket bound to 127.0.0.1:0 — never 8080 — using the exported `httpServer` rather
 * than `startGateway()`, which boots asset-downloading services unacceptable in Jest.
 *
 * LOG_FILE must be set BEFORE the module graph loads: shared/config.ts reads it at
 * evaluation and shared/logger.ts only creates the file transport when it is
 * non-empty — without it the endpoint answers 503 before the rate limiter is reached.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

describe('POST /api/debug-log — rate limit body', () => {
  let httpServer: http.Server;
  let port: number;
  const savedLogFile = process.env.LOG_FILE;

  beforeAll(() => {
    process.env.LOG_FILE = path.join(os.tmpdir(), `spo-debug-log-rate-limit-${Date.now()}.log`);
    jest.resetModules();
    jest.useFakeTimers();
    const mod = require('../server') as typeof import('../server');
    jest.clearAllTimers();
    jest.useRealTimers();

    httpServer = mod.httpServer;
    return new Promise<void>(resolve => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
    if (savedLogFile === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = savedLogFile;
    jest.resetModules();
  });

  function postDebugLog(): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ player: 'test', history: [] });
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/debug-log',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        },
        res => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
          );
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  it('returns 429 with the real 60s window once the limit is exceeded', async () => {
    const first = await postDebugLog();
    expect(first.status).not.toBe(429);

    const second = await postDebugLog();
    expect(second.status).not.toBe(429);

    const third = await postDebugLog();
    expect(third.status).toBe(429);
    expect(JSON.parse(third.body)).toEqual({
      error: `Too many debug reports. Try again in ${60_000 / 1000} seconds.`
    });
    expect(third.body).toContain(`Try again in ${60_000 / 1000} seconds`);
  });
});
