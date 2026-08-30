/**
 * Integration coverage for the hardened `/proxy-image` route (issue 439): the
 * DNS-resolution-based SSRF guard and the sanitized-filename write path, driven
 * over a real socket bound to 127.0.0.1:0 — never 8080 — using the exported
 * `httpServer`, same pattern as debug-log-rate-limit.test.ts.
 *
 * LOG_FILE must be set BEFORE the module graph loads (shared/config.ts reads it
 * at evaluation) and SPO_CACHE_DIR points at an empty temp dir so the
 * update-server directory loop is a no-op and every request reaches the
 * game-server fallback path this change guards.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const mockLookup = jest.fn();
jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: { lookup: (...args: unknown[]) => mockLookup(...args) },
  lookup: (...args: unknown[]) => mockLookup(...args),
}));

describe('/proxy-image — hardened route', () => {
  let httpServer: http.Server;
  let port: number;
  let webclientCacheDir: string;
  const savedLogFile = process.env.LOG_FILE;
  const savedCacheDir = process.env.SPO_CACHE_DIR;
  const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-cache-'));

  beforeAll(async () => {
    process.env.LOG_FILE = path.join(os.tmpdir(), `spo-proxy-image-${Date.now()}.log`);
    process.env.SPO_CACHE_DIR = tmpCacheDir;
    jest.resetModules();
    jest.useFakeTimers();
    const mod = require('../server') as typeof import('../server');
    const paths = require('../paths') as typeof import('../paths');
    jest.clearAllTimers();
    jest.useRealTimers();
    webclientCacheDir = paths.getWebclientCacheDir();
    fs.mkdirSync(webclientCacheDir, { recursive: true });

    httpServer = mod.httpServer;
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        if (addr && typeof addr === 'object') port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (savedLogFile === undefined) delete process.env.LOG_FILE;
    else process.env.LOG_FILE = savedLogFile;
    if (savedCacheDir === undefined) delete process.env.SPO_CACHE_DIR;
    else process.env.SPO_CACHE_DIR = savedCacheDir;
    fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockLookup.mockReset();
  });

  function getProxyImage(imageUrl: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: `/proxy-image?url=${encodeURIComponent(imageUrl)}`,
          method: 'GET',
        },
        (res) => {
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

  it('rejects a URL resolving to a private address with 403, never touching the filesystem', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    const res = await getProxyImage('http://internal.example.com/photo.png');
    expect(res.status).toBe(403);
  });

  it('rejects a path-traversal filename with 400 and writes nothing outside the cache dir', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const before = fs.readdirSync(webclientCacheDir);
    const res = await getProxyImage('http://public.example.com/..%2F..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
    expect(fs.readdirSync(webclientCacheDir)).toEqual(before);
  });

  it('downloads via the fallback fetch and caches the file under webclient-cache', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/photo-439.png')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from('fake-image-bytes')),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as unknown as Response);
    }) as typeof fetch);

    const res = await getProxyImage('http://public.example.com/photo-439.png');
    expect(res.status).toBe(200);

    const written = path.join(webclientCacheDir, 'photo-439.png');
    expect(fs.existsSync(written)).toBe(true);
    expect(path.resolve(written).startsWith(path.resolve(webclientCacheDir) + path.sep)).toBe(true);
    fs.rmSync(written, { force: true });
    fetchSpy.mockRestore();
  });

  it('caches a placeholder under webclient-cache when the fallback fetch fails', async () => {
    mockLookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation((() => Promise.reject(new Error('network down'))) as typeof fetch);

    const res = await getProxyImage('http://public.example.com/broken-439.png');
    expect(res.status).toBe(200);

    const written = path.join(webclientCacheDir, 'broken-439.png');
    expect(fs.existsSync(written)).toBe(true);
    fs.rmSync(written, { force: true });
    fetchSpy.mockRestore();
  });
});
