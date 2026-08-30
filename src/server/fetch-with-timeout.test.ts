import * as http from 'http';
import type { AddressInfo } from 'net';
import { fetchWithTimeout, FetchTimeoutError } from './fetch-with-timeout';
import { TIMEOUTS } from '../shared/constants';

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

describe('fetchWithTimeout', () => {
  it('abandons a slow upstream at the deadline', async () => {
    const server = http.createServer(() => {
      // Accept the connection and never respond.
    });
    const url = await listen(server);

    const start = Date.now();
    await expect(fetchWithTimeout(url, {}, 150)).rejects.toThrow(FetchTimeoutError);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);

    server.close();
  });

  it('preserves the caller init', async () => {
    let seenMethod = '';
    let seenBody = '';
    const server = http.createServer((req, res) => {
      seenMethod = req.method ?? '';
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        seenBody = Buffer.concat(chunks).toString();
        res.writeHead(200);
        res.end('ok');
      });
    });
    const url = await listen(server);

    const response = await fetchWithTimeout(url, { method: 'POST', body: 'x' }, 2000);
    expect(response.status).toBe(200);
    expect(seenMethod).toBe('POST');
    expect(seenBody).toBe('x');

    server.close();
  });

  it('defaults the timeout to TIMEOUTS.FETCH and honors an explicit value', async () => {
    const spy = jest.spyOn(AbortSignal, 'timeout');
    const server = http.createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    const url = await listen(server);

    await fetchWithTimeout(url);
    expect(spy).toHaveBeenLastCalledWith(TIMEOUTS.FETCH);

    await fetchWithTimeout(url, {}, 5000);
    expect(spy).toHaveBeenLastCalledWith(5000);

    spy.mockRestore();
    server.close();
  });

  it('passes non-timeout errors through unmapped', async () => {
    // An invalid URL fails validation before any network I/O.
    let error: unknown;
    try {
      await fetchWithTimeout('not-a-valid-url', {}, 2000);
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(error).not.toBeInstanceOf(FetchTimeoutError);
  });
});
