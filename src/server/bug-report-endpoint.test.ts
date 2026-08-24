import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { depositBugReport, DEFAULT_QUEUE_DIR } from './bug-report-endpoint';
import { BUG_REPORT_SCHEMA_VERSION, computeAnchorKey, type DomAnchor } from '../shared/bug-report-schema';

const anchor: DomAnchor = {
  kind: 'dom',
  componentChain: ['GameScreen', 'PoliticsPanel', 'button'],
  cssChain: 'div.panel > button',
  text: 'Set tax',
};

function report(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: BUG_REPORT_SCHEMA_VERSION,
    id: '0b6a2b1e-1111-4222-8333-444455556666',
    profile: 'desktop',
    kind: 'wrong-data',
    createdAtUtc: '2026-08-24T09:15:00.123Z',
    username: 'SPO_test3',
    world: 'planitia',
    userAgent: 'Mozilla/5.0',
    viewport: { width: 1920, height: 1080 },
    anchor,
    anchorKey: computeAnchorKey(anchor),
    observed: '12 %',
    expected: '15 %',
    journal: [{ t: 'click', ts: 1, target: 'button.tax' }],
    ...over,
  };
}

let queueDir: string;

beforeEach(() => {
  queueDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-reports-'));
});

afterEach(() => {
  fs.rmSync(queueDir, { recursive: true, force: true });
});

describe('DEFAULT_QUEUE_DIR', () => {
  it('sits outside any worktree — npm run finish must not be able to take the queue with it', () => {
    expect(DEFAULT_QUEUE_DIR).toBe(path.join(os.homedir(), '.spo-reports'));
    expect(DEFAULT_QUEUE_DIR).not.toContain('worktrees');
  });
});

describe('depositBugReport — the happy path', () => {
  it('writes the report under a name built from its timestamp, profile and anchor key', () => {
    const result = depositBugReport(JSON.stringify(report()), { enabled: true, queueDir });

    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);
    expect(result.body.file).toBe(`2026-08-24T09-15-00-123Z_desktop_${computeAnchorKey(anchor)}.json`);
    expect(fs.readdirSync(queueDir)).toEqual([result.body.file]);
  });

  it('parses back to the same report, plus the gateway stamp', () => {
    const before = Date.now();
    const result = depositBugReport(JSON.stringify(report()), { enabled: true, queueDir });
    const written = JSON.parse(fs.readFileSync(path.join(queueDir, result.body.file as string), 'utf8')) as Record<string, unknown>;

    expect(written).toEqual({ ...report(), receivedAtUtc: written.receivedAtUtc });
    expect(Date.parse(written.receivedAtUtc as string)).toBeGreaterThanOrEqual(before);
  });

  it('stamps receivedAtUtc itself, overwriting whatever the client claimed', () => {
    const result = depositBugReport(
      JSON.stringify(report({ receivedAtUtc: '1999-01-01T00:00:00.000Z' })),
      { enabled: true, queueDir },
    );
    const written = JSON.parse(fs.readFileSync(path.join(queueDir, result.body.file as string), 'utf8')) as Record<string, unknown>;

    expect(written.receivedAtUtc).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('creates a nested queue directory that does not exist yet', () => {
    const nested = path.join(queueDir, 'deep', 'deeper');
    const result = depositBugReport(JSON.stringify(report()), { enabled: true, queueDir: nested });

    expect(result.status).toBe(200);
    expect(fs.readdirSync(nested)).toHaveLength(1);
  });
});

describe('depositBugReport — the refusals', () => {
  it('answers 404 and writes nothing when the feature is off', () => {
    const result = depositBugReport(JSON.stringify(report()), { enabled: false, queueDir });

    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: 'Not found' });
    expect(fs.readdirSync(queueDir)).toEqual([]);
  });

  it('answers 404 before even looking at the body', () => {
    expect(depositBugReport('not json at all', { enabled: false, queueDir }).status).toBe(404);
  });

  it('answers 400 on a body that is not JSON', () => {
    const result = depositBugReport('{ broken', { enabled: true, queueDir });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe('Invalid JSON body');
    expect(fs.readdirSync(queueDir)).toEqual([]);
  });

  it('answers 400 with the validator’s reason, and writes nothing', () => {
    const result = depositBugReport(JSON.stringify(report({ kind: 'slow' })), { enabled: true, queueDir });

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('kind');
    expect(fs.readdirSync(queueDir)).toEqual([]);
  });
});

describe('depositBugReport — path safety', () => {
  it('refuses a createdAtUtc carrying a path separator, and writes nowhere', () => {
    const escape = path.join(queueDir, 'escaped');
    fs.mkdirSync(escape);

    const result = depositBugReport(
      JSON.stringify(report({ createdAtUtc: '../escaped/2026-08-24T09-15-00-123Z' })),
      { enabled: true, queueDir: path.join(queueDir, 'queue') },
    );

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('createdAtUtc');
    expect(fs.readdirSync(escape)).toEqual([]);
    expect(fs.existsSync(path.join(queueDir, 'queue'))).toBe(false);
  });

  it('refuses an anchorKey carrying a path separator, and writes nowhere', () => {
    const escape = path.join(queueDir, 'escaped');
    fs.mkdirSync(escape);

    const result = depositBugReport(
      JSON.stringify(report({ anchorKey: '../escaped/owned' })),
      { enabled: true, queueDir: path.join(queueDir, 'queue') },
    );

    expect(result.status).toBe(400);
    expect(result.body.error).toContain('anchorKey');
    expect(fs.readdirSync(escape)).toEqual([]);
    expect(fs.existsSync(path.join(queueDir, 'queue'))).toBe(false);
  });
});

describe('depositBugReport — when the disk refuses', () => {
  it('answers 500 rather than throwing when the queue cannot be written', () => {
    const readOnly = path.join(queueDir, 'readonly');
    fs.mkdirSync(readOnly);
    fs.chmodSync(readOnly, 0o444);

    const result = depositBugReport(JSON.stringify(report()), { enabled: true, queueDir: readOnly });

    fs.chmodSync(readOnly, 0o755);

    expect(result.status).toBe(500);
    expect(result.body.error).toContain('Could not write the report');
  });
});
