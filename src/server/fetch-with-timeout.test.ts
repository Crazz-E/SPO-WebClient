import { describe, it, expect, afterAll } from '@jest/globals';
import * as http from 'http';
import { fetchWithTimeout, isTimeoutError } from './fetch-with-timeout';

describe('fetchWithTimeout', () => {
  const neverRespondingServer = http.createServer(() => {
    // Never call res.end() — the connection hangs until aborted.
  });
  const fastServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Method': req.method ?? '',
        'X-Header': req.headers['x-test'] ?? '',
      });
      res.end(body || 'ok');
    });
  });

  let hangingUrl: string;
  let fastUrl: string;

  beforeAll(async () => {
    await new Promise<void>(resolve => {
      neverRespondingServer.listen(0, '127.0.0.1', () => {
        const addr = neverRespondingServer.address();
        if (addr && typeof addr === 'object') hangingUrl = `http://127.0.0.1:${addr.port}/`;
        resolve();
      });
    });
    await new Promise<void>(resolve => {
      fastServer.listen(0, '127.0.0.1', () => {
        const addr = fastServer.address();
        if (addr && typeof addr === 'object') fastUrl = `http://127.0.0.1:${addr.port}/`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>(resolve => neverRespondingServer.close(() => resolve()));
    await new Promise<void>(resolve => fastServer.close(() => resolve()));
  });

  it('abandons a never-responding upstream at the deadline', async () => {
    const start = Date.now();
    let caught: unknown;
    try {
      await fetchWithTimeout(hangingUrl, {}, 100);
    } catch (err) {
      caught = err;
    }
    expect(isTimeoutError(caught)).toBe(true);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('resolves against a fast upstream using the default timeout and passes init through', async () => {
    const response = await fetchWithTimeout(fastUrl, {
      method: 'POST',
      headers: { 'X-Test': 'value' },
      body: 'payload',
    });
    expect(response.ok).toBe(true);
    expect(response.headers.get('x-method')).toBe('POST');
    expect(response.headers.get('x-header')).toBe('value');
    expect(await response.text()).toBe('payload');
  });
});

describe('isTimeoutError', () => {
  it('is true for node-fetch v2 AbortError', () => {
    const err = new Error('The user aborted a request.');
    err.name = 'AbortError';
    expect(isTimeoutError(err)).toBe(true);
  });

  it('is true for undici TimeoutError', () => {
    const err = new Error('The operation timed out.');
    err.name = 'TimeoutError';
    expect(isTimeoutError(err)).toBe(true);
  });

  it('is false for other Error instances', () => {
    expect(isTimeoutError(new Error('boom'))).toBe(false);
  });

  it('is false for non-Error values', () => {
    expect(isTimeoutError('boom')).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
  });
});
