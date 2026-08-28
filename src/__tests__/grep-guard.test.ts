/**
 * The grep-guard hook (.claude/hooks/grep-guard.sh) — card #395.
 *
 * Tests that the guard refuses a shell `grep` that searches a FILE (any form: bare, piped,
 * with -A/-B/-C context flags), points at the native Grep() tool instead, allows `grep` used
 * as a plain filter on another command's piped output (no file argument of its own), allows
 * every non-grep command, and — card #369 — escalates its message from the third refusal
 * onward via the shared refusal ledger.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'grep-guard.sh');

interface RunResult {
  code: number;
  err: string;
}

// Isolate the refusal ledger per test file — see item-list-guard.test.ts /
// verdict-pipe-guard.test.ts for the same convention.
const SESSION_STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-ledger-'));

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

describe('grep-guard.sh — blocks a shell grep that searches a file', () => {
  it('blocks grep piped into head', () => {
    const result = run('grep -n "pattern" file | head -30');
    expect(result.code).toBe(2);
    expect(result.err).toContain('BLOCKED');
    expect(result.err).toContain('Grep()');
  });

  it('blocks grep with -A/-B/-C context flags, still piped', () => {
    const result = run('grep -n "pattern" -A 30 file | head -30');
    expect(result.code).toBe(2);
    expect(result.err).toContain('BLOCKED');
  });

  it('blocks a bare grep with a file argument and no pipe', () => {
    const result = run('grep -n "pattern" package.json');
    expect(result.code).toBe(2);
    expect(result.err).toContain('BLOCKED');
  });

  it('blocks a recursive grep over a directory', () => {
    const result = run('grep -r "item-list" doc/');
    expect(result.code).toBe(2);
  });

  it('blocks it chained after another command', () => {
    const result = run('echo hi && grep -n "pattern" file');
    expect(result.code).toBe(2);
  });

  it('names the native Grep() tool as the alternative', () => {
    const result = run('grep -n "pattern" file');
    expect(result.code).toBe(2);
    expect(result.err).toContain('Grep(pattern');
  });
});

describe('grep-guard.sh — it must not cry wolf', () => {
  it('allows grep used as a plain filter on piped output (no file argument)', () => {
    const result = run('ps aux | grep node');
    expect(result.code).toBe(0);
  });

  it('allows another pipeline filter example', () => {
    const result = run('git status | grep modified');
    expect(result.code).toBe(0);
  });

  it('allows non-grep commands entirely', () => {
    expect(run('echo hello world').code).toBe(0);
    expect(run('npm test').code).toBe(0);
  });

  it('allows git grep (a different command, not shell grep)', () => {
    const result = run('git grep "pattern"');
    expect(result.code).toBe(0);
  });

  it('reads a heredoc body as text, not as commands', () => {
    const command = `cat > /tmp/note.md <<EOF\nwe used to run grep -n "x" file here\nEOF`;
    const result = run(command);
    expect(result.code).toBe(0);
  });
});

describe('grep-guard.sh — refusal ledger escalation (card #369)', () => {
  it('does not escalate on the first two refusals', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-ledger-esc-'));
    const first = run('grep -n "pattern" file', store);
    const second = run('grep -n "pattern" file', store);
    expect(first.err).not.toContain('This is refusal #');
    expect(second.err).not.toContain('This is refusal #');
  });

  it('escalates on the third refusal', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-ledger-esc-'));
    run('grep -n "pattern" file', store);
    run('grep -n "pattern" file', store);
    const third = run('grep -n "pattern" file', store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('This is refusal #3 from this guard in this session.');
    expect(third.err).toContain('Needs triage');
  });

  it('a fresh store starts counting from 1 again', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-ledger-fresh-'));
    const first = run('grep -n "pattern" file', store);
    expect(first.err).not.toContain('This is refusal #');
  });
});
