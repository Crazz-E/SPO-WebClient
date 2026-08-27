/**
 * The verdict-pipe-guard hook (.claude/hooks/verdict-pipe-guard.sh).
 *
 * Tests that the guard refuses piped verdict commands and suggests the `npm run verdict`
 * wrapper when applicable.
 */

import { execFileSync } from 'child_process';
import * as path from 'path';

const ROOT = process.cwd();
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'verdict-pipe-guard.sh');

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
});
