/**
 * The verdict-pipe-guard hook (.claude/hooks/verdict-pipe-guard.sh).
 *
 * Tests that the guard refuses piped verdict commands and suggests the `npm run verdict`
 * wrapper when applicable.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'verdict-pipe-guard.sh');

interface RunResult {
  code: number;
  err: string;
}

// Each refusal now bumps a per-session ledger (.claude/hooks/refusal-ledger.js, card #369).
// Point it at an isolated store per test file so these runs never touch this machine's real
// `~/.spo-bench/sessions/<key>.refusals` for this worktree, and so ordinary (non-escalation)
// tests below never see a stray count leak into their assertions.
const SESSION_STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'vpg-ledger-'));

function run(command: string, runInBackground: boolean = false, sessionDir: string = SESSION_STORE): RunResult {
  try {
    execFileSync('bash', [WRAPPER], {
      input: JSON.stringify({
        tool_input: { command, run_in_background: runInBackground },
      }),
      encoding: 'utf8',
      env: { ...process.env, SPO_SESSION_DIR: sessionDir },
    });
    return { code: 0, err: '' };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { code: err.status ?? -1, err: err.stderr ?? '' };
  }
}

describe('verdict-pipe-guard.sh — pipe detection and suggestions', () => {
  it('blocks npm test piped to tail', () => {
    const result = run('npm test | tail -20');
    expect(result.code).toBe(2);
    expect(result.err).toContain('BLOCKED');
    expect(result.err).toContain('pipes a command whose exit code IS the verdict');
  });

  it('suggests npm run verdict for npm test pipe', () => {
    const result = run('npm test | tail -20');
    expect(result.code).toBe(2);
    expect(result.err).toContain('npm run verdict -- test');
  });

  it('suggests npm run verdict for npm run coverage pipe', () => {
    const result = run('npm run coverage:changed | grep -E "fail"');
    expect(result.code).toBe(2);
    expect(result.err).toContain('npm run verdict -- coverage:changed');
  });

  it('blocks npm run verdict piped (recursive verdict command)', () => {
    const result = run('npm run verdict -- test | head');
    expect(result.code).toBe(2);
    expect(result.err).toContain('pipes a command whose exit code IS the verdict');
  });

  it('allows npm run gate piped (not in VERDICT list)', () => {
    const result = run('npm run gate | head');
    expect(result.code).toBe(2);
    expect(result.err).toContain('BLOCKED');
    // Should NOT suggest npm run verdict for gate (gate is in VERDICT but likely not wanted here)
  });

  it('allows pipefail escape', () => {
    const result = run('set -o pipefail; npm test 2>&1 | tail -40');
    expect(result.code).toBe(0);
  });

  it('allows heredoc quoting a pipe pattern', () => {
    const command = `cat > /tmp/test.sh <<'EOF'\nnpm test | tail\nEOF`;
    const result = run(command);
    expect(result.code).toBe(0);
  });

  it('blocks npm run coverage pipe without run_in_background', () => {
    const result = run('npm run coverage:changed | grep FAIL', false);
    expect(result.code).toBe(2);
  });

  it('suggests jest alias for jest piped', () => {
    const result = run('jest | tail -10');
    expect(result.code).toBe(2);
    expect(result.err).toContain('npm run verdict -- test');
  });

  it('suggests typecheck alias for tsc piped', () => {
    const result = run('tsc | grep error');
    expect(result.code).toBe(2);
    expect(result.err).toContain('npm run verdict -- typecheck');
  });

  it('suggests lint alias for eslint piped', () => {
    const result = run('eslint src | grep error');
    expect(result.code).toBe(2);
    expect(result.err).toContain('npm run verdict -- lint');
  });

  // Regression, 2026-08-28: the guard's own pipe-branch message SUGGESTS this exact form —
  // it must pass the guard, not be refused by the (separate) non-final-position check.
  it('allows the guard\'s own suggested foreground-separation form', () => {
    const result = run('npm test > /tmp/x.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/x.log');
    expect(result.code).toBe(0);
  });
});

describe('verdict-pipe-guard.sh — refusal ledger escalation (card #369)', () => {
  it('does not escalate on the first two refusals', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'vpg-ledger-esc-'));
    const first = run('npm test | tail -20', false, store);
    const second = run('npm test | tail -20', false, store);
    expect(first.err).not.toContain('Do not compose another');
    expect(second.err).not.toContain('Do not compose another');
  });

  it('escalates on the third refusal, quoting the refusal number', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'vpg-ledger-esc-'));
    run('npm test | tail -20', false, store);
    run('npm test | tail -20', false, store);
    const third = run('npm test | tail -20', false, store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('This is refusal #3 from this guard in this session.');
    expect(third.err).toContain('Do not compose another');
    expect(third.err).toContain('Needs triage');
  });

  it('escalation fires for the nonfinal-position refusal shape too', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'vpg-ledger-esc-nonfinal-'));
    run('npm test; echo done', false, store);
    run('npm test; echo done', false, store);
    const third = run('npm test; echo done', false, store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('refusal #3 from this guard');
  });

  it('a session with its own isolated store starts counting from 1 again', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'vpg-ledger-fresh-'));
    const first = run('npm test | tail -20', false, store);
    expect(first.err).not.toContain('This is refusal #');
  });
});
