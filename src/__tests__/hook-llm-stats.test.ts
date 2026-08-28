/**
 * scripts/hook-llm-stats.js — a read-only local report over the hook-LLM journal. No GitHub
 * call, no LLM call; this is how "the fallback layer's usage trends toward zero" is checked.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'hook-llm-stats.js');

function makeBenchDir(): { benchDir: string; cleanup: () => void } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-llm-stats-'));
  return { benchDir: tmp, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

function run(benchDir: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, SPO_BENCH_DIR: benchDir },
    });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? '' };
  }
}

describe('hook-llm-stats', () => {
  it('an empty journal reports emptiness and exits 0', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      const { code, stdout } = run(benchDir);
      expect(code).toBe(0);
      expect(stdout).toContain('empty');
    } finally {
      cleanup();
    }
  });

  it('counts by verdict and names the top rule_slug', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      const dir = path.join(benchDir, 'hook-llm');
      fs.mkdirSync(dir, { recursive: true });
      const lines = [
        { ts: '2026-08-20T10:00:00Z', verdict: 'guide', rule_slug: 'curl-github' },
        { ts: '2026-08-20T11:00:00Z', verdict: 'guide', rule_slug: 'curl-github' },
        { ts: '2026-08-21T10:00:00Z', verdict: 'gap', rule_slug: 'gateway-metrics' },
        { ts: '2026-08-21T11:00:00Z', verdict: 'error', rule_slug: '' },
      ];
      fs.writeFileSync(path.join(dir, 'journal.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
      const { code, stdout } = run(benchDir);
      expect(code).toBe(0);
      expect(stdout).toContain('4 invocation(s)');
      expect(stdout).toContain('curl-github  2');
      expect(stdout).toContain('Error rate: 1/4');
    } finally {
      cleanup();
    }
  });

  it('shows the filed status next to a slug that has been resolved', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      const dir = path.join(benchDir, 'hook-llm');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'journal.jsonl'),
        JSON.stringify({ ts: new Date().toISOString(), verdict: 'guide', rule_slug: 'filed-shape' }) + '\n'
      );
      fs.writeFileSync(
        path.join(dir, 'filed.jsonl'),
        JSON.stringify({ signature: 'filed-shape', verdict: 'FILED', issue: 500, ts: new Date().toISOString() }) + '\n'
      );
      const { stdout } = run(benchDir);
      expect(stdout).toContain('filed (#500)');
    } finally {
      cleanup();
    }
  });

  it('a corrupt journal line is skipped, not fatal', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      const dir = path.join(benchDir, 'hook-llm');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'journal.jsonl'),
        'not json\n' + JSON.stringify({ ts: new Date().toISOString(), verdict: 'guide', rule_slug: 'ok' }) + '\n'
      );
      const { code, stdout } = run(benchDir);
      expect(code).toBe(0);
      expect(stdout).toContain('1 invocation(s)');
    } finally {
      cleanup();
    }
  });
});
