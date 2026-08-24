/**
 * Tests for the directory-listing metadata path in UpdateService.
 *
 * The IIS listing already prints the size and last-modified time of every entry, so
 * `syncAll` must decide "changed / unchanged" from it and issue no HTTP HEAD at all.
 * The HEAD survives only as the fallback for a row that did not parse.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../cab-extractor', () => ({
  isCabExtractorAvailable: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  extractCabArchive: jest.fn(),
}));

const mockFetch = jest.fn<typeof fetch>();
(globalThis as Record<string, unknown>).fetch = mockFetch;

import { UpdateService } from '../update-service';

const CACHE_URL = 'http://update.starpeaceonline.com/five/client/cache';

/** One file row exactly as IIS prints it (date, time, byte size, then the anchor). */
function fileRow(date: string, time: string, size: string, name: string, dir = ''): string {
  const href = `/five/client/cache/${dir}${name}`;
  return `${date} ${time} ${size} <A HREF="${href}">${name}</A><br>`;
}

function listing(rows: string[]): string {
  return `<html><head><title>listing</title></head><body><hr>\n<pre>`
    + `<A HREF="/five/client/">[To Parent Directory]</A><br><br>`
    + rows.join('')
    + `</pre><hr></body></html>`;
}

/** Root listing with a single file, plus an empty listing for anything else fetched. */
function respondWith(rootHtml: string): void {
  mockFetch.mockImplementation((input: unknown) => {
    const url = String(input);
    if (url === CACHE_URL) {
      return Promise.resolve(new Response(rootHtml, { status: 200 }));
    }
    return Promise.resolve(new Response(listing([]), { status: 200 }));
  });
}

/** Every HEAD request the service issued during the run. */
function headCalls(): string[] {
  return mockFetch.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === 'HEAD')
    .map(([input]) => String(input));
}

describe('UpdateService directory-listing metadata', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-svc-listing-'));
    mockFetch.mockReset();
    delete process.env.CACHE_SKIP_SYNC;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Write a local file and stamp its mtime, mirroring what downloadFile does. */
  function seed(name: string, contents: string, mtimeIso: string): void {
    const target = path.join(tmpDir, name);
    fs.writeFileSync(target, contents);
    const when = new Date(mtimeIso);
    fs.utimesSync(target, when, when);
  }

  it('skips an unchanged file without a single HEAD request', async () => {
    // 1649 bytes, 11/19/1999 11:15 AM GMT — the local copy carries the exact second.
    seed('Default.ini', 'x'.repeat(1649), '1999-11-19T11:15:42Z');
    respondWith(listing([fileRow('11/19/1999', '11:15 AM', '1649', 'Default.ini')]));

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(headCalls()).toEqual([]);
    expect(service.getStats().skipped).toBe(1);
    expect(service.getStats().updated).toBe(0);
  });

  it('re-downloads when the listing size differs from the local file', async () => {
    seed('Default.ini', 'x'.repeat(10), '1999-11-19T11:15:42Z');
    respondWith(listing([fileRow('11/19/1999', '11:15 AM', '1649', 'Default.ini')]));

    mockFetch.mockImplementation((input: unknown, init?: unknown) => {
      const url = String(input);
      if (url === CACHE_URL) {
        return Promise.resolve(new Response(
          listing([fileRow('11/19/1999', '11:15 AM', '1649', 'Default.ini')]), { status: 200 }));
      }
      if (url.endsWith('/Default.ini') && (init as RequestInit | undefined)?.method !== 'HEAD') {
        return Promise.resolve(new Response('y'.repeat(1649), {
          status: 200,
          headers: { 'last-modified': 'Fri, 19 Nov 1999 11:15:42 GMT' },
        }));
      }
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(headCalls()).toEqual([]);
    expect(service.getStats().updated).toBe(1);
    expect(fs.readFileSync(path.join(tmpDir, 'Default.ini'), 'utf8')).toBe('y'.repeat(1649));
  });

  it('re-downloads when the listing time is newer than the local mtime', async () => {
    seed('Default.ini', 'x'.repeat(1649), '1999-11-19T11:15:42Z');

    mockFetch.mockImplementation((input: unknown, init?: unknown) => {
      const url = String(input);
      const html = listing([fileRow('11/19/1999', '11:20 AM', '1649', 'Default.ini')]);
      if (url === CACHE_URL) {
        return Promise.resolve(new Response(html, { status: 200 }));
      }
      if (url.endsWith('/Default.ini') && (init as RequestInit | undefined)?.method !== 'HEAD') {
        return Promise.resolve(new Response('z'.repeat(1649), { status: 200 }));
      }
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(headCalls()).toEqual([]);
    expect(service.getStats().updated).toBe(1);
  });

  it('reads the 12-hour clock as GMT — noon and midnight included', async () => {
    // Midnight row: 12:30 AM is 00:30 UTC. A local copy stamped 00:30:10 is not stale.
    seed('a.ini', 'x'.repeat(5), '2024-02-29T00:30:10Z');
    // Noon row: 12:30 PM is 12:30 UTC. A local copy stamped 11:00 IS stale.
    seed('b.ini', 'x'.repeat(5), '2024-02-29T11:00:00Z');

    mockFetch.mockImplementation((input: unknown, init?: unknown) => {
      const url = String(input);
      const html = listing([
        fileRow('2/29/2024', '12:30 AM', '5', 'a.ini'),
        fileRow('2/29/2024', '12:30 PM', '5', 'b.ini'),
      ]);
      if (url === CACHE_URL) {
        return Promise.resolve(new Response(html, { status: 200 }));
      }
      if (url.endsWith('/b.ini') && (init as RequestInit | undefined)?.method !== 'HEAD') {
        return Promise.resolve(new Response('q'.repeat(5), { status: 200 }));
      }
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(headCalls()).toEqual([]);
    expect(service.getStats().skipped).toBe(1); // a.ini
    expect(service.getStats().updated).toBe(1); // b.ini
  });

  it('ignores directory rows, which print <dir> instead of a byte count', async () => {
    fs.mkdirSync(path.join(tmpDir, 'Cursors'));
    seed(path.join('Cursors', 'index.sync'), 'x'.repeat(311), '2008-06-20T17:17:00Z');

    mockFetch.mockImplementation((input: unknown) => {
      const url = String(input);
      if (url === CACHE_URL) {
        return Promise.resolve(new Response(listing([
          ' 2/29/2024  2:37 PM        &lt;dir&gt; <A HREF="/five/client/cache/Cursors/">Cursors</A><br>',
        ]), { status: 200 }));
      }
      if (url === `${CACHE_URL}/Cursors`) {
        return Promise.resolve(new Response(listing([
          fileRow(' 6/20/2008', ' 5:17 PM', '311', 'index.sync', 'Cursors/'),
        ]), { status: 200 }));
      }
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(headCalls()).toEqual([]);
    // index.sync is an IGNORED_PATTERN, so it is not in the remote inventory at all,
    // and the directory row never produced a file item.
    expect(service.getStats().downloaded).toBe(0);
    expect(service.getStats().updated).toBe(0);
  });

  it('falls back to HTTP HEAD when the listing row carries no size or date', async () => {
    seed('Default.ini', 'x'.repeat(1649), '1999-11-19T11:15:42Z');

    mockFetch.mockImplementation((input: unknown, init?: unknown) => {
      const url = String(input);
      if (url === CACHE_URL) {
        // Bare anchor: the metadata prefix IIS normally prints is absent.
        return Promise.resolve(new Response(listing([
          '<A HREF="/five/client/cache/Default.ini">Default.ini</A><br>',
        ]), { status: 200 }));
      }
      if ((init as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve(new Response(null, {
          status: 200,
          headers: { 'content-length': '1649', 'last-modified': 'Fri, 19 Nov 1999 11:15:42 GMT' },
        }));
      }
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(headCalls()).toEqual([`${CACHE_URL}/Default.ini`]);
    expect(service.getStats().skipped).toBe(1);
  });

  it('does not re-download when the HEAD fallback states no size and no date', async () => {
    seed('Default.ini', 'x'.repeat(1649), '1999-11-19T11:15:42Z');

    mockFetch.mockImplementation((input: unknown, init?: unknown) => {
      const url = String(input);
      if (url === CACHE_URL) {
        return Promise.resolve(new Response(listing([
          '<A HREF="/five/client/cache/Default.ini">Default.ini</A><br>',
        ]), { status: 200 }));
      }
      if ((init as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(service.getStats().skipped).toBe(1);
    expect(service.getStats().updated).toBe(0);
  });

  it('treats a failed HEAD fallback as unchanged', async () => {
    seed('Default.ini', 'x'.repeat(1649), '1999-11-19T11:15:42Z');

    mockFetch.mockImplementation((input: unknown, init?: unknown) => {
      const url = String(input);
      if (url === CACHE_URL) {
        return Promise.resolve(new Response(listing([
          '<A HREF="/five/client/cache/Default.ini">Default.ini</A><br>',
        ]), { status: 200 }));
      }
      if ((init as RequestInit | undefined)?.method === 'HEAD') {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(service.getStats().skipped).toBe(1);
    expect(service.getStats().updated).toBe(0);
  });

  it('downloads a file the local cache does not hold, metadata or not', async () => {
    mockFetch.mockImplementation((input: unknown, init?: unknown) => {
      const url = String(input);
      if (url === CACHE_URL) {
        return Promise.resolve(new Response(
          listing([fileRow('11/19/1999', '11:15 AM', '1649', 'Default.ini')]), { status: 200 }));
      }
      if (url.endsWith('/Default.ini') && (init as RequestInit | undefined)?.method !== 'HEAD') {
        return Promise.resolve(new Response('n'.repeat(1649), {
          status: 200,
          headers: { 'last-modified': 'Fri, 19 Nov 1999 11:15:42 GMT' },
        }));
      }
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(headCalls()).toEqual([]);
    expect(service.getStats().downloaded).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, 'Default.ini'))).toBe(true);
  });

  // Orphan removal (step 4 of syncAll) deletes every local file absent from the discovered
  // set, so the metadata pass must not change which entries discovery yields.
  it('leaves the discovered file and directory set untouched', async () => {
    seed('Default.ini', 'x'.repeat(1649), '1999-11-19T11:15:42Z');
    seed('stray.txt', 'orphan', '2020-01-01T00:00:00Z');

    const rootHtml = listing([
      ' 2/29/2024  2:37 PM        &lt;dir&gt; <A HREF="/five/client/cache/Cursors/">Cursors</A><br>',
      fileRow(' 6/20/2008', ' 5:12 PM', '14', 'cindex.bat'),
      fileRow('10/11/2001', ' 6:58 PM', '295', 'folders.sync'),
      fileRow(' 1/15/2010', ' 9:00 AM', '512', 'web.config'),
      fileRow('11/19/1999', '11:15 AM', '1649', 'Default.ini'),
    ]);

    const fetched: string[] = [];
    mockFetch.mockImplementation((input: unknown) => {
      const url = String(input);
      fetched.push(url);
      if (url === CACHE_URL) return Promise.resolve(new Response(rootHtml, { status: 200 }));
      return Promise.resolve(new Response(listing([]), { status: 200 }));
    });

    const service = new UpdateService(tmpDir);
    await service.initialize();

    // The <dir> row still drives recursion into the subdirectory.
    expect(fetched).toContain(`${CACHE_URL}/Cursors`);
    // cindex.bat and web.config are IGNORED_PATTERNS; folders.sync is a real file but absent
    // locally, so it is the only download. Default.ini matches the listing and is skipped.
    expect(service.getStats().downloaded).toBe(1);
    expect(service.getStats().skipped).toBe(1);
    // stray.txt is not on the remote, so orphan removal takes it — unchanged behaviour.
    expect(fs.existsSync(path.join(tmpDir, 'stray.txt'))).toBe(false);
    expect(headCalls()).toEqual([]);
  });

  it('accepts a comma-grouped size in a listing row', async () => {
    seed('big.bin', 'x'.repeat(1234), '2026-07-20T13:32:02Z');

    respondWith(listing([fileRow(' 7/20/2026', ' 1:32 PM', '1,234', 'big.bin')]));

    const service = new UpdateService(tmpDir);
    await service.initialize();

    expect(headCalls()).toEqual([]);
    expect(service.getStats().skipped).toBe(1);
    expect(service.getStats().updated).toBe(0);
  });
});
