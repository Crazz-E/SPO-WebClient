import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  listReports,
  fetchReport,
  ackReport,
  tokenMatches,
  isSafeReportFilename,
  handleReportPullList,
  handleReportPullFetch,
  handleReportPullAck,
} from './report-pull-endpoint';

const TOKEN = 'a'.repeat(32);
const REPORT_A = '2026-08-24T09-15-00-123Z_desktop_a1b2c3d4.json';
const REPORT_B = '2026-08-24T09-16-00-456Z_mobile_e5f6a7b8.json';

let queueDir: string;

beforeEach(() => {
  queueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-reportpull-'));
});

afterEach(() => {
  fs.rmSync(queueDir, { recursive: true, force: true });
});

function writeReport(name: string, content = '{"version":1}'): void {
  fs.writeFileSync(path.join(queueDir, name), content);
}

describe('isSafeReportFilename', () => {
  it('accepts the exact deposit filename shape', () => {
    expect(isSafeReportFilename(REPORT_A)).toBe(true);
  });
  it('rejects a path-traversal attempt or anything not matching the shape', () => {
    expect(isSafeReportFilename('../../etc/passwd')).toBe(false);
    expect(isSafeReportFilename('pulled/x.json')).toBe(false);
    expect(isSafeReportFilename('not-a-report.json')).toBe(false);
    expect(isSafeReportFilename('')).toBe(false);
  });
});

describe('tokenMatches', () => {
  it('accepts the exact configured token', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
  });
  it('rejects a wrong token, a missing token, an unset/short expected token', () => {
    expect(tokenMatches('wrong-token-wrong-token-wrong-t', TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
    expect(tokenMatches(TOKEN, null)).toBe(false);
    expect(tokenMatches(TOKEN, 'short')).toBe(false);
  });
  it('never throws on a length mismatch (constant-time compare guard)', () => {
    expect(() => tokenMatches('x', TOKEN)).not.toThrow();
    expect(tokenMatches('x', TOKEN)).toBe(false);
  });
});

describe('listReports', () => {
  it('lists top-level report files with byte size and sha256, sorted', () => {
    writeReport(REPORT_B);
    writeReport(REPORT_A);
    const result = listReports(queueDir);
    expect(result.body.reports.map((r) => r.file)).toEqual([REPORT_A, REPORT_B]);
    expect(result.body.reports[0].sha256).toHaveLength(64);
  });
  it('never lists pulled/ or a non-matching filename', () => {
    writeReport(REPORT_A);
    fs.mkdirSync(path.join(queueDir, 'pulled'), { recursive: true });
    writeReport('notes.txt');
    const result = listReports(queueDir);
    expect(result.body.reports.map((r) => r.file)).toEqual([REPORT_A]);
  });
  it('a missing queue directory is an empty list, not an error', () => {
    const result = listReports(path.join(queueDir, 'does-not-exist'));
    expect(result.status).toBe(200);
    expect(result.body.reports).toEqual([]);
  });
});

describe('fetchReport', () => {
  it('returns the exact bytes and their sha256 for a valid filename', () => {
    writeReport(REPORT_A, '{"hello":"world"}');
    const result = fetchReport(queueDir, REPORT_A);
    expect(result.status).toBe(200);
    if (result.status === 200) {
      expect(result.body.toString('utf8')).toBe('{"hello":"world"}');
      expect(result.sha256).toHaveLength(64);
    }
  });
  it('refuses a path-traversal filename with 400, never touches the filesystem outside queueDir', () => {
    const result = fetchReport(queueDir, '../outside.json');
    expect(result.status).toBe(400);
  });
  it('answers 404 for a well-shaped but absent filename', () => {
    const result = fetchReport(queueDir, REPORT_A);
    expect(result.status).toBe(404);
  });
});

describe('ackReport', () => {
  it('moves the file to pulled/ with a disposition sidecar', () => {
    writeReport(REPORT_A, '{"x":1}');
    const sha = fetchReport(queueDir, REPORT_A);
    const sha256 = sha.status === 200 ? sha.sha256 : '';

    const result = ackReport(queueDir, REPORT_A, sha256, { peerIp: '1.2.3.4' });

    expect(result.status).toBe(200);
    expect(fs.existsSync(path.join(queueDir, REPORT_A))).toBe(false);
    const pulled = path.join(queueDir, 'pulled', REPORT_A);
    expect(fs.existsSync(pulled)).toBe(true);
    expect(fs.readFileSync(`${pulled}.disposition.txt`, 'utf8')).toContain('1.2.3.4');
  });

  it('is idempotent — acking an already-pulled file answers {ok:true, already:true}, never errors', () => {
    writeReport(REPORT_A);
    ackReport(queueDir, REPORT_A, null, { peerIp: '1.2.3.4' });
    const second = ackReport(queueDir, REPORT_A, null, { peerIp: '1.2.3.4' });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ ok: true, already: true });
  });

  it('refuses a sha256 mismatch with 409, leaves the file in place', () => {
    writeReport(REPORT_A);
    const result = ackReport(queueDir, REPORT_A, 'deadbeef'.repeat(8), { peerIp: '1.2.3.4' });
    expect(result.status).toBe(409);
    expect(fs.existsSync(path.join(queueDir, REPORT_A))).toBe(true);
  });

  it('answers 400 for an unsafe filename, never touches the filesystem', () => {
    const result = ackReport(queueDir, '../escape.json', null, { peerIp: '1.2.3.4' });
    expect(result.status).toBe(400);
  });

  it('answers 404 for a well-shaped but absent (never-deposited) filename', () => {
    const result = ackReport(queueDir, REPORT_A, null, { peerIp: '1.2.3.4' });
    expect(result.status).toBe(404);
  });

  it('answers 400 rather than throwing when the move itself fails', () => {
    writeReport(REPORT_A);
    // A plain FILE already sitting where pulled/ needs to be a directory makes mkdirSync throw
    // ENOTDIR -- a portable way to force the move to fail without relying on permission bits,
    // which root (this sandbox) ignores.
    fs.writeFileSync(path.join(queueDir, 'pulled'), 'not a directory');

    const result = ackReport(queueDir, REPORT_A, null, { peerIp: '1.2.3.4' });

    expect(result.status).toBe(400);
    if (result.status === 400) expect(result.body.error).toContain('Could not move the report');
  });

  it('sweeps pulled/ entries past the retention window on the next ack', () => {
    writeReport(REPORT_A);
    writeReport(REPORT_B);
    const old = new Date('2026-01-01T00:00:00.000Z');
    ackReport(queueDir, REPORT_A, null, { peerIp: '1.2.3.4', now: old, retentionDays: 7 });
    // Backdate the pulled file's mtime so the next ack's sweep sees it as stale.
    const pulledA = path.join(queueDir, 'pulled', REPORT_A);
    fs.utimesSync(pulledA, old, old);

    const recent = new Date('2026-08-30T00:00:00.000Z');
    ackReport(queueDir, REPORT_B, null, { peerIp: '1.2.3.4', now: recent, retentionDays: 7 });

    expect(fs.existsSync(pulledA)).toBe(false);
    expect(fs.existsSync(`${pulledA}.disposition.txt`)).toBe(false);
    expect(fs.existsSync(path.join(queueDir, 'pulled', REPORT_B))).toBe(true);
  });
});

/** Minimal fake req/res, same convention as bug-report-endpoint.test.ts's fakeRequest/fakeResponse. */
function fakeRequest(opts: { headers?: Record<string, string>; url?: string; chunks?: Buffer[] }) {
  const listeners: { data: Array<(c: Buffer) => void>; end: Array<() => void> } = { data: [], end: [] };
  return {
    headers: opts.headers ?? {},
    url: opts.url,
    on(event: 'data' | 'end', listener: never) {
      (listeners[event] as Array<unknown>).push(listener);
      return this;
    },
    flush() {
      for (const chunk of opts.chunks ?? []) for (const l of listeners.data) l(chunk);
      for (const l of listeners.end) l();
    },
  };
}

function fakeResponse() {
  const res = {
    status: 0,
    body: undefined as unknown,
    rawBody: undefined as Buffer | undefined,
    headers: {} as Record<string, string>,
    writeHead(status: number, headers: Record<string, string>) {
      res.status = status;
      res.headers = headers;
      return res;
    },
    end(body?: string | Buffer) {
      if (Buffer.isBuffer(body)) {
        res.rawBody = body;
      } else if (typeof body === 'string') {
        try {
          res.body = JSON.parse(body);
        } catch {
          res.body = body;
        }
      }
      return res;
    },
  };
  return res;
}

describe('handleReportPullList — the transport', () => {
  it('answers 404 with no/wrong token, never lists', () => {
    writeReport(REPORT_A);
    const req = fakeRequest({});
    const res = fakeResponse();
    handleReportPullList(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4' });
    expect(res.status).toBe(404);
  });

  it('lists reports with a valid bearer token', () => {
    writeReport(REPORT_A);
    const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` } });
    const res = fakeResponse();
    handleReportPullList(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4' });
    expect(res.status).toBe(200);
    expect((res.body as { reports: unknown[] }).reports).toHaveLength(1);
  });

  it('answers 404 when the surface is disabled (no token configured)', () => {
    const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` } });
    const res = fakeResponse();
    handleReportPullList(req as never, res, { token: null, queueDir, peerIp: '1.2.3.4' });
    expect(res.status).toBe(404);
  });

  it('answers 429 without ever checking the token when the caller is over its allowance', () => {
    const req = fakeRequest({ headers: {} }); // no Authorization at all
    const res = fakeResponse();
    handleReportPullList(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4', allowRequest: () => false });
    expect(res.status).toBe(429);
  });
});

describe('handleReportPullFetch — the transport', () => {
  it('streams the raw bytes with the sha256 header on a valid request', () => {
    writeReport(REPORT_A, '{"a":1}');
    const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, url: `/api/report-pull/fetch?file=${REPORT_A}` });
    const res = fakeResponse();
    handleReportPullFetch(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4' });
    expect(res.status).toBe(200);
    expect(res.rawBody?.toString('utf8')).toBe('{"a":1}');
    expect(res.headers['X-SPO-Report-Sha256']).toHaveLength(64);
  });

  it('answers 429 when the caller is over its allowance', () => {
    const req = fakeRequest({ headers: {} });
    const res = fakeResponse();
    handleReportPullFetch(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4', allowRequest: () => false });
    expect(res.status).toBe(429);
  });

  it('forwards a fetchReport failure (e.g. 404 for an absent file) as JSON, not raw bytes', () => {
    const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, url: `/api/report-pull/fetch?file=${REPORT_A}` });
    const res = fakeResponse();
    handleReportPullFetch(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('handleReportPullAck — the transport', () => {
  it('reassembles a chunked JSON body and acks', () => {
    writeReport(REPORT_A);
    const raw = Buffer.from(JSON.stringify({ file: REPORT_A }));
    const req = fakeRequest({
      headers: { authorization: `Bearer ${TOKEN}` },
      chunks: [raw.subarray(0, 5), raw.subarray(5)],
    });
    const res = fakeResponse();
    handleReportPullAck(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4' });
    req.flush();
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(queueDir, 'pulled', REPORT_A))).toBe(true);
  });

  it('answers 400 on a body that is not JSON', () => {
    const req = fakeRequest({ headers: { authorization: `Bearer ${TOKEN}` }, chunks: [Buffer.from('{ broken')] });
    const res = fakeResponse();
    handleReportPullAck(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4' });
    req.flush();
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid JSON body' });
  });

  it('answers 429 (never reads the body) when the caller is over its allowance', () => {
    writeReport(REPORT_A);
    const req = fakeRequest({ headers: {}, chunks: [Buffer.from(JSON.stringify({ file: REPORT_A }))] });
    const res = fakeResponse();
    handleReportPullAck(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4', allowRequest: () => false });
    req.flush();
    expect(res.status).toBe(429);
    expect(fs.existsSync(path.join(queueDir, REPORT_A))).toBe(true);
  });

  it('answers 404 (never reads the body) with a wrong token', () => {
    writeReport(REPORT_A);
    const req = fakeRequest({ headers: {}, chunks: [Buffer.from(JSON.stringify({ file: REPORT_A }))] });
    const res = fakeResponse();
    handleReportPullAck(req as never, res, { token: TOKEN, queueDir, peerIp: '1.2.3.4' });
    req.flush();
    expect(res.status).toBe(404);
    expect(fs.existsSync(path.join(queueDir, REPORT_A))).toBe(true); // untouched
  });
});
