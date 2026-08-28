/**
 * The item-list-guard hook (.claude/hooks/item-list-guard.sh).
 *
 * Tests that the guard refuses `gh project item-list` (the ~103-GraphQL-point read that
 * emptied the bucket on 2026-08-25), points at the cheap `board:claim` alternative, allows
 * the override token and every other `gh` call, and — card #369 — escalates its message from
 * the third refusal onward via the shared refusal ledger.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'item-list-guard.sh');

interface RunResult {
  code: number;
  err: string;
}

// Isolate the refusal ledger per test file — see verdict-pipe-guard.test.ts for the same
// convention.
const SESSION_STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'ilg-ledger-'));

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

describe('item-list-guard.sh — blocks the expensive read', () => {
  it('blocks gh project item-list', () => {
    const result = run('gh project item-list 1 --limit 100 --owner Crazz-Org');
    expect(result.code).toBe(2);
    expect(result.err).toContain('BLOCKED');
    expect(result.err).toContain('gh project item-list');
  });

  it('names the cheap alternative', () => {
    const result = run('gh project item-list 1');
    expect(result.code).toBe(2);
    expect(result.err).toContain('npm run board:claim');
  });

  it('blocks it chained after another command', () => {
    const result = run('echo hi && gh project item-list 1');
    expect(result.code).toBe(2);
    expect(result.err).toContain('gh project item-list');
  });
});

describe('item-list-guard.sh — it must not cry wolf', () => {
  it('allows other gh project subcommands', () => {
    const result = run('gh project view 1');
    expect(result.code).toBe(0);
  });

  it('allows gh pr and gh issue calls', () => {
    expect(run('gh pr view 123 --json state').code).toBe(0);
    expect(run('gh issue view 45 --json state,title').code).toBe(0);
  });

  it('allows npm run board:claim itself', () => {
    const result = run('npm run board:claim');
    expect(result.code).toBe(0);
  });

  it('honours the override token', () => {
    const result = run('SPO_ITEM_LIST_OVERRIDE=human gh project item-list 1');
    expect(result.code).toBe(0);
  });

  it('reads a heredoc body as text, not as commands', () => {
    const command = `cat > /tmp/note.md <<EOF\nwe used to run gh project item-list here\nEOF`;
    const result = run(command);
    expect(result.code).toBe(0);
  });

  it('a read-only mention is not an invocation', () => {
    const result = run('grep -r "item-list" doc/');
    expect(result.code).toBe(0);
  });
});

describe('item-list-guard.sh — refusal ledger escalation (card #369)', () => {
  it('does not escalate on the first two refusals', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'ilg-ledger-esc-'));
    const first = run('gh project item-list 1', store);
    const second = run('gh project item-list 1', store);
    expect(first.err).not.toContain('This is refusal #');
    expect(second.err).not.toContain('This is refusal #');
  });

  it('escalates on the third refusal', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'ilg-ledger-esc-'));
    run('gh project item-list 1', store);
    run('gh project item-list 1', store);
    const third = run('gh project item-list 1', store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('This is refusal #3 from this guard in this session.');
    expect(third.err).toContain('Needs triage');
  });

  it('a fresh store starts counting from 1 again', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'ilg-ledger-fresh-'));
    const first = run('gh project item-list 1', store);
    expect(first.err).not.toContain('This is refusal #');
  });
});
