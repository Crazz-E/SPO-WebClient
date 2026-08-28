/**
 * The bench-port-guard hook (.claude/hooks/bench-port-guard.sh).
 *
 * Tests that the guard refuses starting a gateway on the bench port and driving the live
 * world outside the worker, allows the sanctioned forms, and — card #369 — escalates its
 * message from the third refusal onward via the shared refusal ledger.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'bench-port-guard.sh');

interface RunResult {
  code: number;
  err: string;
}

// Isolate the refusal ledger per test file — see verdict-pipe-guard.test.ts for the same
// convention. Also isolates the session heartbeat store, so these runs never touch this
// machine's real ~/.spo-bench/sessions/ files for this worktree.
const SESSION_STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'bpg-ledger-'));

function run(command: string, sessionDir: string = SESSION_STORE): RunResult {
  try {
    execFileSync('bash', [WRAPPER], {
      input: JSON.stringify({ tool_input: { command } }),
      encoding: 'utf8',
      env: { ...process.env, SPO_SESSION_DIR: sessionDir },
    });
    return { code: 0, err: '' };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { code: err.status ?? -1, err: err.stderr ?? '' };
  }
}

describe('bench-port-guard.sh — blocks a gateway on the bench port', () => {
  it('blocks bare npm start (defaults to 8080)', () => {
    const result = run('npm start');
    expect(result.code).toBe(2);
    expect(result.err).toContain('BLOCKED');
    expect(result.err).toContain('bench port');
  });

  it('blocks npm run start', () => {
    const result = run('npm run start');
    expect(result.code).toBe(2);
    expect(result.err).toContain('bench port');
  });

  it('blocks node dist/server/server.js with no PORT set', () => {
    const result = run('node dist/server/server.js');
    expect(result.code).toBe(2);
    expect(result.err).toContain('bench port');
  });

  it('blocks an explicit PORT=8080 in front of npm start', () => {
    const result = run('PORT=8080 npm start');
    expect(result.code).toBe(2);
    expect(result.err).toContain('bench port');
  });

  it('blocks npm run dev:local when PORT=8080 is pinned explicitly', () => {
    const result = run('PORT=8080 npm run dev:local');
    expect(result.code).toBe(2);
    expect(result.err).toContain('bench port');
  });
});

describe('bench-port-guard.sh — blocks driving the live world outside the worker', () => {
  it('blocks npm run test:live:local', () => {
    const result = run('npm run test:live:local');
    expect(result.code).toBe(2);
    expect(result.err).toContain('drives the live world');
  });

  it('blocks node dist/e2e/run.js', () => {
    const result = run('node dist/e2e/run.js');
    expect(result.code).toBe(2);
    expect(result.err).toContain('drives the live world');
  });
});

describe('bench-port-guard.sh — it must not cry wolf', () => {
  it('allows npm run dev:local with no PORT set (picks its own free port)', () => {
    const result = run('npm run dev:local');
    expect(result.code).toBe(0);
  });

  it('allows npm run dev:local with an explicit non-bench PORT', () => {
    const result = run('PORT=8081 npm run dev:local');
    expect(result.code).toBe(0);
  });

  it('allows npm run gate', () => {
    const result = run('npm run gate');
    expect(result.code).toBe(0);
  });

  it('allows npm run test:live (the sanctioned bench-job form)', () => {
    const result = run('npm run test:live');
    expect(result.code).toBe(0);
  });

  it('honours the human override token', () => {
    const result = run('SPO_BENCH_PORT_OVERRIDE=i-own-the-bench npm start');
    expect(result.code).toBe(0);
  });

  it('reads a heredoc body as text, not as commands', () => {
    const command = `cat > /tmp/note.md <<EOF\nwe should run npm start one day\nEOF`;
    const result = run(command);
    expect(result.code).toBe(0);
  });

  it('a read-only mention of npm start is not an invocation', () => {
    const result = run('grep -r "npm start" doc/');
    expect(result.code).toBe(0);
  });
});

describe('bench-port-guard.sh — refusal ledger escalation (card #369)', () => {
  it('does not escalate on the first two refusals', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'bpg-ledger-esc-'));
    const first = run('npm start', store);
    const second = run('npm start', store);
    expect(first.err).not.toContain('This is refusal #');
    expect(second.err).not.toContain('This is refusal #');
  });

  it('escalates on the third refusal', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'bpg-ledger-esc-'));
    run('npm start', store);
    run('npm start', store);
    const third = run('npm start', store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('This is refusal #3 from this guard in this session.');
    expect(third.err).toContain('Needs triage');
  });

  it('the live-world refusal shape escalates too, counted under the same guard name', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'bpg-ledger-esc-mixed-'));
    run('npm start', store);
    run('node dist/e2e/run.js', store);
    const third = run('npm start', store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('This is refusal #3 from this guard in this session.');
  });

  it('a fresh store starts counting from 1 again', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'bpg-ledger-fresh-'));
    const first = run('npm start', store);
    expect(first.err).not.toContain('This is refusal #');
  });
});
