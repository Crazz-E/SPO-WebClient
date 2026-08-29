/**
 * The bench-port-guard hook (.claude/hooks/bench-port-guard.sh).
 *
 * Tests that the guard refuses starting a gateway on the bench port and driving the live
 * world outside the worker, and allows the sanctioned forms. The port-8080 single-owner
 * check is the guard's whole job; the heartbeat stamp and the refusal-ledger escalation
 * message it used to also carry were pilot-driver machinery, retired along with the rest
 * of the anti-drift hooks (see the commit that removed them).
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const ROOT = process.cwd();
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'bench-port-guard.sh');

interface RunResult {
  code: number;
  err: string;
}

function run(command: string): RunResult {
  try {
    execFileSync('bash', [WRAPPER], {
      input: JSON.stringify({ tool_input: { command } }),
      encoding: 'utf8',
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
