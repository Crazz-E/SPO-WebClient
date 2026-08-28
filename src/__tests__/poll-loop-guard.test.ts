/**
 * The poll-loop-guard hook (.claude/hooks/poll-loop-guard.sh).
 *
 * Tests that the guard refuses poll loops and suggests concrete commands with extracted IDs.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'poll-loop-guard.sh');

interface RunResult {
  code: number;
  err: string;
}

// Each refusal now bumps a per-session ledger (.claude/hooks/refusal-ledger.js, card #369).
// Isolate it per test file so these runs never touch this machine's real
// `~/.spo-bench/sessions/<key>.refusals` for this worktree.
const SESSION_STORE = fs.mkdtempSync(path.join(os.tmpdir(), 'plg-ledger-'));

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

describe('poll-loop-guard.sh — loop detection and suggestions', () => {
  it('blocks until loop waiting for bench job', () => {
    const command = `until [ -f ~/.spo-bench/done/job-abc123.json ]; do sleep 10; done`;
    const result = run(command);
    expect(result.code).toBe(2);
    expect(result.err).toContain('BLOCKED');
    expect(result.err).toContain('hand-rolls the wait for a bench job');
  });

  it('extracts job ID from bench loop', () => {
    const command = `until [ -f ~/.spo-bench/done/job-abc123.json ]; do sleep 10; done`;
    const result = run(command);
    expect(result.code).toBe(2);
    expect(result.err).toContain('npm run bench:wait -- job-abc123');
  });

  it('blocks until loop polling gh pr', () => {
    const command = `until gh pr view 276 --json mergedAt --jq '.mergedAt' | grep -qv null; do sleep 5; done`;
    const result = run(command);
    expect(result.code).toBe(2);
    expect(result.err).toContain('polls GitHub in a loop');
  });

  it('extracts PR number from gh pr loop', () => {
    const command = `until gh pr view 276 --json mergedAt --jq '.mergedAt' | grep -qv null; do sleep 5; done`;
    const result = run(command);
    expect(result.code).toBe(2);
    expect(result.err).toContain('npm run pr:wait -- 276');
  });

  it('blocks for loop with sleep', () => {
    const command = `for i in {1..24}; do status=$(gh pr view 276 -q); [ "$status" = "merged" ] && break; sleep 5; done`;
    const result = run(command);
    expect(result.code).toBe(2);
    expect(result.err).toContain('polls GitHub in a loop');
  });

  it('allows loop with no sleep (working, not waiting)', () => {
    const command = `until [ -d dir ]; do cd $(ls -d */); done`;
    const result = run(command);
    expect(result.code).toBe(0);
  });

  it('blocks trailing ampersand on verdict command', () => {
    const command = `npm run verdict -- test &`;
    const result = run(command);
    expect(result.code).toBe(2);
    expect(result.err).toContain('trailing `&` destroys the verdict');
  });

  it('blocks compound (backgrounded) after verdict', () => {
    const command = `npm run verdict -- test; echo done`;
    const result = run(command, true);
    expect(result.code).toBe(2);
    expect(result.err).toContain('chains a second command after a verdict command AND backgrounds it');
  });

  it('allows compound (foreground) after verdict', () => {
    const command = `npm run gate > /tmp/log.txt 2>&1; echo "EXIT=$?"`;
    const result = run(command, false);
    expect(result.code).toBe(0);
  });

  it('allows backgrounded redirect', () => {
    const command = `npm run gate > /tmp/gate.log 2>&1`;
    const result = run(command, true);
    expect(result.code).toBe(0);
  });

  it('ignores sleeps in heredocs', () => {
    const command = `cat <<EOF\nuntil false; do sleep 5; done\nEOF`;
    const result = run(command);
    expect(result.code).toBe(0);
  });

  it('includes venue (bench) in verdict output', () => {
    const command = `until [ -f ~/.spo-bench/verdicts/sha.json ]; do sleep 10; done`;
    const result = run(command);
    expect(result.err).toContain('bench');
  });

  it('includes venue (pr) in verdict output', () => {
    const command = `while ! gh api repos/Crazz-Org/SPO-WebClient/pulls/123 --jq '.merged'; do sleep 5; done`;
    const result = run(command);
    expect(result.err).toContain('pr');
  });
});

describe('poll-loop-guard.sh — refusal ledger escalation (card #369)', () => {
  const benchLoop = `until [ -f ~/.spo-bench/done/job-abc123.json ]; do sleep 10; done`;

  it('does not escalate on the first two refusals', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'plg-ledger-esc-'));
    const first = run(benchLoop, false, store);
    const second = run(benchLoop, false, store);
    expect(first.err).not.toContain('This is refusal #');
    expect(second.err).not.toContain('This is refusal #');
  });

  it('escalates on the third refusal', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'plg-ledger-esc-'));
    run(benchLoop, false, store);
    run(benchLoop, false, store);
    const third = run(benchLoop, false, store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('This is refusal #3 from this guard in this session.');
    expect(third.err).toContain('Needs triage');
  });

  it('the amp shape (trailing &) escalates too, counted under the same guard name', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'plg-ledger-esc-amp-'));
    run(benchLoop, false, store);
    run(`npm run verdict -- test &`, false, store);
    const third = run(benchLoop, false, store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('This is refusal #3 from this guard in this session.');
  });

  it('the pr-poll shape escalates on its own third refusal', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'plg-ledger-esc-pr-'));
    const prLoop = `until gh pr view 276 --json mergedAt --jq '.mergedAt' | grep -qv null; do sleep 5; done`;
    run(prLoop, false, store);
    run(prLoop, false, store);
    const third = run(prLoop, false, store);
    expect(third.code).toBe(2);
    expect(third.err).toContain('refusal #3 from this guard');
  });

  it('a fresh store starts counting from 1 again', () => {
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'plg-ledger-fresh-'));
    const first = run(benchLoop, false, store);
    expect(first.err).not.toContain('This is refusal #');
  });
});
