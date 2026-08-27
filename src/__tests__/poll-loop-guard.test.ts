/**
 * The poll-loop-guard hook (.claude/hooks/poll-loop-guard.sh).
 *
 * Tests that the guard refuses poll loops and suggests concrete commands with extracted IDs.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const ROOT = process.cwd();
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'poll-loop-guard.sh');

interface RunResult {
  code: number;
  err: string;
}

function run(command: string, runInBackground: boolean = false): RunResult {
  try {
    execFileSync('bash', [WRAPPER], {
      input: JSON.stringify({
        tool_input: { command, run_in_background: runInBackground },
      }),
      encoding: 'utf8',
      env: process.env,
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
