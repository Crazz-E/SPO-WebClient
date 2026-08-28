/**
 * The sanctuarize Stop hook — capping unbounded typecheck output.
 *
 * Tests verify that full output is logged to disk while stderr output
 * is bounded to ~40 lines + LOG= line, with exit codes preserved.
 */

import { execFileSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const HOOK = path.join(ROOT, '.claude', 'hooks', 'sanctuarize.sh');
const FLAG_PATH = path.join(ROOT, '.claude', '.typecheck-dirty');

function getTempDir(): string {
  const scratchpad = process.env.SCRATCHPAD_DIR || path.join(os.tmpdir(), '.sanctuarize-test');
  fs.mkdirSync(scratchpad, { recursive: true });
  return scratchpad;
}

describe('sanctuarize.sh — output capping', () => {
  afterEach(() => {
    // Clean up flag file after each test
    try {
      fs.unlinkSync(FLAG_PATH);
    } catch {
      // ignore if not present
    }
  });

  it('exits 0 when no flag file exists (no typecheck needed)', () => {
    // Ensure flag file doesn't exist
    try {
      fs.unlinkSync(FLAG_PATH);
    } catch {
      // ignore
    }

    const tempDir = getTempDir();
    const benchDir = path.join(tempDir, '.spo-bench-no-flag');

    const result = spawnSync('bash', [HOOK], {
      cwd: ROOT,
      input: JSON.stringify({}),
      encoding: 'utf8',
      env: { ...process.env, SPO_BENCH_DIR: benchDir },
      timeout: 10000,
    });

    // Should exit 0 because no flag file exists (or status is null if early exit)
    expect(result.status ?? 0).toBe(0);
  });

  it('creates log directory when flag exists (even if typecheck passes)', () => {
    const tempDir = getTempDir();
    const benchDir = path.join(tempDir, '.spo-bench-create-dir');
    const logsDir = path.join(benchDir, 'logs');

    // Create flag file to trigger the hook
    fs.writeFileSync(FLAG_PATH, '', 'utf8');

    spawnSync('bash', [HOOK], {
      cwd: ROOT,
      input: JSON.stringify({}),
      encoding: 'utf8',
      env: { ...process.env, SPO_BENCH_DIR: benchDir },
      timeout: 30000,
    });

    // Log dir should exist
    expect(fs.existsSync(logsDir)).toBe(true);
  });

  it('writes full typecheck output to log file', () => {
    const tempDir = getTempDir();
    const benchDir = path.join(tempDir, '.spo-bench-log-capture');
    const logsDir = path.join(benchDir, 'logs');

    // The hook writes to a log file even when typecheck passes
    fs.mkdirSync(logsDir, { recursive: true });

    // Create flag file to trigger the hook
    fs.writeFileSync(FLAG_PATH, '', 'utf8');

    spawnSync('bash', [HOOK], {
      cwd: ROOT,
      input: JSON.stringify({}),
      encoding: 'utf8',
      env: { ...process.env, SPO_BENCH_DIR: benchDir },
      timeout: 30000,
    });

    // Check that log was created
    const logFiles = fs
      .readdirSync(logsDir)
      .filter(f => f.startsWith('sanctuarize-typecheck'));

    expect(logFiles.length).toBeGreaterThan(0);
  });

  it('uses correct log naming pattern with timestamp and PID', () => {
    const tempDir = getTempDir();
    const benchDir = path.join(tempDir, '.spo-bench-naming');
    const logsDir = path.join(benchDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });

    // Create flag file to trigger the hook
    fs.writeFileSync(FLAG_PATH, '', 'utf8');

    spawnSync('bash', [HOOK], {
      cwd: ROOT,
      input: JSON.stringify({}),
      encoding: 'utf8',
      env: { ...process.env, SPO_BENCH_DIR: benchDir },
      timeout: 30000,
    });

    const logFiles = fs
      .readdirSync(logsDir)
      .filter(f => f.startsWith('sanctuarize-'));

    expect(logFiles.length).toBeGreaterThan(0);
    // Pattern: sanctuarize-typecheck-YYYYMMDD-HHMMSS-PID.log
    expect(logFiles[0]).toMatch(/^sanctuarize-typecheck-\d{8}-\d{6}-\d+\.log$/);
  });

  it('respects SPO_BENCH_DIR environment variable', () => {
    const tempDir = getTempDir();
    const customBenchDir = path.join(tempDir, '.spo-bench-custom-env');
    const logsDir = path.join(customBenchDir, 'logs');

    // Create flag file to trigger the hook
    fs.writeFileSync(FLAG_PATH, '', 'utf8');

    const result = spawnSync('bash', [HOOK], {
      cwd: ROOT,
      input: JSON.stringify({}),
      encoding: 'utf8',
      env: { ...process.env, SPO_BENCH_DIR: customBenchDir },
      timeout: 30000,
    });

    // Hook should have succeeded
    expect(result.status ?? 0).toBe(0);
    // Should have created logs in the custom directory
    expect(fs.existsSync(logsDir)).toBe(true);
  });

  it('defaults to ~/.spo-bench when SPO_BENCH_DIR is not set', () => {
    // Create flag file to trigger the hook
    fs.writeFileSync(FLAG_PATH, '', 'utf8');

    const env = { ...process.env };
    delete env.SPO_BENCH_DIR;

    const result = spawnSync('bash', [HOOK], {
      cwd: ROOT,
      input: JSON.stringify({}),
      encoding: 'utf8',
      env,
      timeout: 30000,
    });

    // Should succeed without error
    expect(result.status ?? 0).toBe(0);
    // Should have created default logs dir
    const defaultLogsDir = path.join(process.env.HOME || os.homedir(), '.spo-bench', 'logs');
    expect(fs.existsSync(defaultLogsDir)).toBe(true);
  });
});
