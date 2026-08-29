/**
 * /proxy-image must answer 504 (not hold the connection, not cache a placeholder)
 * when the upstream fetch aborts at the timeout deadline. Drives the endpoint over
 * a real socket bound to 127.0.0.1:0 — never 8080 — using the exported `httpServer`.
 *
 * LOG_FILE must be set BEFORE the module graph loads, same as debug-log-rate-limit.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

jest.mock('node-fetch', () => {
  return jest.fn(() => {
    const err = new Error('The user aborted a request.');
    err.name = 'AbortError';
    return Promise.reject(err);
  });
});

describe('GET /proxy-image — upstream timeout', () => {
  let httpServer: http.Server;
  let port: number;
  const savedLogFile = process.env.LOG_FILE;

  beforeAll(() => {
    process.env.LOG_FILE = path.join(os.tmpdir(), `spo-proxy-image-timeout-${Date.now()}.log`);
    jest.resetModules();
    const mod = require('../server') as typeof import('../server');

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

  function getProxyImage(url: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: `/proxy-image?url=${encodeURIComponent(url)}`,
          method: 'GET',
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
      req.end();
    });
  }

  it('returns 504 when the upstream fetch times out', async () => {
    const result = await getProxyImage('http://203.0.113.9/img.gif');
    expect(result.status).toBe(504);
  });
});
