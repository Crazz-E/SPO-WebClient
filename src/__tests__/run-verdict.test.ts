/**
 * scripts/run-verdict.sh (card #337, `npm run verdict`).
 *
 * A thin, script-agnostic wrapper the driver or a CI step can run instead of a bare
 * `npm run <alias>`: it captures the full output to a log file OUTSIDE the worktree (so a
 * gate's dirty-tree check never sees it), tails a short excerpt to stdout, and — the property
 * that makes it usable by anything that branches on `$?` — the process exit code IS the
 * underlying command's exit code, never the tail's or the mkdir's.
 *
 * These tests fake `npm` on PATH so the suite never actually runs Jest/tsc/eslint recursively:
 * the fake prints a marker, writes to stdout/stderr, and exits with a code the test controls.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'run-verdict.sh');

interface RunResult {
  code: number;
  stdout: string;
}

/** A throwaway $HOME-like bench dir, and a fake `npm` on PATH ahead of the real one. */
function makeHarness(npmBody: string): { benchDir: string; binDir: string; cleanup: () => void } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-verdict-'));
  const benchDir = path.join(tmp, 'bench');
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const npmPath = path.join(binDir, 'npm');
  fs.writeFileSync(npmPath, `#!/usr/bin/env bash\n${npmBody}\n`, { mode: 0o755 });
  return {
    benchDir,
    binDir,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

/** Run the script for real, with a fake npm ahead of the real one on PATH. */
function run(args: string[], benchDir: string, binDir: string): RunResult {
  try {
    const stdout = execFileSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, SPO_BENCH_DIR: benchDir, PATH: `${binDir}:${process.env.PATH}` },
    });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? '' };
  }
}

describe('run-verdict — exit code is the verdict', () => {
  it('exits 0 when the underlying npm script succeeds', () => {
    const { benchDir, binDir, cleanup } = makeHarness('echo "all good"\nexit 0');
    try {
      const { code } = run(['test'], benchDir, binDir);
      expect(code).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('exits 1 when the underlying npm script fails', () => {
    const { benchDir, binDir, cleanup } = makeHarness('echo "boom" >&2\nexit 1');
    try {
      const { code } = run(['test'], benchDir, binDir);
      expect(code).toBe(1);
    } finally {
      cleanup();
    }
  });
});

describe('run-verdict — the log file', () => {
  it('writes the full output to a log file outside the worktree', () => {
    const { benchDir, binDir, cleanup } = makeHarness('echo "line one"\necho "line two"\nexit 0');
    try {
      const { stdout } = run(['test'], benchDir, binDir);
      const logLine = stdout.split('\n').find((l) => l.startsWith('LOG='));
      expect(logLine).toBeDefined();
      const logPath = (logLine as string).slice('LOG='.length);
      expect(logPath.startsWith(benchDir)).toBe(true);
      expect(fs.existsSync(logPath)).toBe(true);
      const content = fs.readFileSync(logPath, 'utf8');
      expect(content).toContain('line one');
      expect(content).toContain('line two');
    } finally {
      cleanup();
    }
  });
});

describe('run-verdict — stdout format', () => {
  it('always ends with LOG= then EXIT= lines', () => {
    const { benchDir, binDir, cleanup } = makeHarness('echo "hello"\nexit 0');
    try {
      const { stdout } = run(['test'], benchDir, binDir);
      const lines = stdout.trimEnd().split('\n');
      expect(lines[lines.length - 2]).toMatch(/^LOG=/);
      expect(lines[lines.length - 1]).toBe('EXIT=0');
    } finally {
      cleanup();
    }
  });
});

describe('run-verdict — unknown alias', () => {
  it('exits 64 before npm ever runs', () => {
    const marker = path.join(os.tmpdir(), `run-verdict-marker-${process.pid}`);
    fs.rmSync(marker, { force: true });
    const { benchDir, binDir, cleanup } = makeHarness(`touch ${marker}\nexit 0`);
    try {
      const { code } = run(['not-a-real-alias'], benchDir, binDir);
      expect(code).toBe(64);
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      cleanup();
      fs.rmSync(marker, { force: true });
    }
  });
});

describe('run-verdict — --tail', () => {
  it('tails exactly N lines to stdout', () => {
    const npmBody = Array.from({ length: 10 }, (_, i) => `echo "line ${i + 1}"`).join('\n') + '\nexit 0';
    const { benchDir, binDir, cleanup } = makeHarness(npmBody);
    try {
      const { stdout } = run(['test', '--tail=2'], benchDir, binDir);
      const lines = stdout.trimEnd().split('\n');
      // last two lines are LOG= and EXIT=, so the tailed body is the two before those
      expect(lines.length).toBe(4);
      expect(lines[0]).toBe('line 9');
      expect(lines[1]).toBe('line 10');
      expect(lines[2]).toMatch(/^LOG=/);
      expect(lines[3]).toBe('EXIT=0');
    } finally {
      cleanup();
    }
  });
});
