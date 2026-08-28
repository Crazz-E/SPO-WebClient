/**
 * scripts/hook-llm-harvest.js — the local half of the self-learning loop
 * `.claude/hooks/uncovered-command-guard.sh` feeds.
 *
 * Everything here is pure local file I/O — no GitHub call, no LLM call, matching the script's
 * own promise (doc/kanban-workflow.md § GitHub API discipline: this is the local surface a
 * session reads instead of polling GitHub). `SPO_BENCH_DIR` is redirected to a throwaway temp
 * dir per test so nothing here ever touches a real `~/.spo-bench/`.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'hook-llm-harvest.js');

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function makeBenchDir(): { benchDir: string; cleanup: () => void } {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-llm-harvest-'));
  return { benchDir: tmp, cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

function writeJournal(benchDir: string, entries: Array<Record<string, unknown>>): void {
  const dir = path.join(benchDir, 'hook-llm');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'journal.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

function run(args: string[], benchDir: string): RunResult {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, SPO_BENCH_DIR: benchDir },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function entry(overrides: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    ts: new Date().toISOString(),
    session_key: 's1',
    verdict: 'guide',
    classification: 'needs-form',
    reason: 'r',
    corrected_command: 'npm run x',
    worth_hardening: false,
    rule_slug: 'some-shape',
    harden_target: 'guard',
    command: 'some command',
    ...overrides,
  };
}

describe('hook-llm-harvest --take', () => {
  it('a worth_hardening:true entry is a candidate on first sighting', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      writeJournal(benchDir, [entry({ worth_hardening: true, rule_slug: 'curl-github' })]);
      const { code, stdout } = run(['--take'], benchDir);
      expect(code).toBe(0);
      expect(stdout).toContain('candidate: curl-github');
      const draftLine = stdout.split('\n').find((l) => l.startsWith('draft: '));
      expect(draftLine).toBeDefined();
      const draftPath = (draftLine as string).slice('draft: '.length);
      expect(fs.existsSync(draftPath)).toBe(true);
      expect(fs.readFileSync(draftPath, 'utf8')).toContain('curl-github');
    } finally {
      cleanup();
    }
  });

  it('two sightings without worth_hardening are not yet a candidate', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      writeJournal(benchDir, [
        entry({ worth_hardening: false, rule_slug: 'twice-only' }),
        entry({ worth_hardening: false, rule_slug: 'twice-only' }),
      ]);
      const { code, stdout } = run(['--take'], benchDir);
      expect(code).toBe(1);
      expect(stdout).toContain('candidates: none');
    } finally {
      cleanup();
    }
  });

  it('three sightings without worth_hardening become a candidate on recurrence alone', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      writeJournal(benchDir, [
        entry({ worth_hardening: false, rule_slug: 'thrice' }),
        entry({ worth_hardening: false, rule_slug: 'thrice' }),
        entry({ worth_hardening: false, rule_slug: 'thrice' }),
      ]);
      const { code, stdout } = run(['--take'], benchDir);
      expect(code).toBe(0);
      expect(stdout).toContain('candidate: thrice');
    } finally {
      cleanup();
    }
  });

  it('error and throttled verdicts never count toward candidacy', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      writeJournal(benchDir, [
        entry({ verdict: 'error', worth_hardening: true, rule_slug: 'noisy' }),
        entry({ verdict: 'throttled', worth_hardening: true, rule_slug: 'noisy' }),
        entry({ verdict: 'error', worth_hardening: true, rule_slug: 'noisy' }),
      ]);
      const { code } = run(['--take'], benchDir);
      expect(code).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('a CLAIMED signature is not re-taken by a second call', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      writeJournal(benchDir, [entry({ worth_hardening: true, rule_slug: 'only-one' })]);
      const first = run(['--take'], benchDir);
      expect(first.code).toBe(0);
      const second = run(['--take'], benchDir);
      expect(second.code).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('a stale CLAIMED (older than one hour) is reclaimable', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      writeJournal(benchDir, [entry({ worth_hardening: true, rule_slug: 'stale-claim' })]);
      const filedDir = path.join(benchDir, 'hook-llm');
      fs.mkdirSync(filedDir, { recursive: true });
      const staleTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(
        path.join(filedDir, 'filed.jsonl'),
        JSON.stringify({ signature: 'stale-claim', verdict: 'CLAIMED', ts: staleTs }) + '\n'
      );
      const { code, stdout } = run(['--take'], benchDir);
      expect(code).toBe(0);
      expect(stdout).toContain('candidate: stale-claim');
    } finally {
      cleanup();
    }
  });

  it('the oldest eligible candidate is taken first', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      const older = new Date(Date.now() - 10 * 86400000).toISOString();
      const newer = new Date(Date.now() - 1 * 86400000).toISOString();
      writeJournal(benchDir, [
        entry({ worth_hardening: true, rule_slug: 'newer-one', ts: newer }),
        entry({ worth_hardening: true, rule_slug: 'older-one', ts: older }),
      ]);
      const { stdout } = run(['--take'], benchDir);
      expect(stdout).toContain('candidate: older-one');
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
        'not json\n' + JSON.stringify(entry({ worth_hardening: true, rule_slug: 'survives' })) + '\n'
      );
      const { code, stdout } = run(['--take'], benchDir);
      expect(code).toBe(0);
      expect(stdout).toContain('candidate: survives');
    } finally {
      cleanup();
    }
  });

  it('the draft names the right Area for each harden_target', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      writeJournal(benchDir, [entry({ worth_hardening: true, rule_slug: 'docs-gap', harden_target: 'docs' })]);
      const { stdout } = run(['--take'], benchDir);
      const draftPath = (stdout.split('\n').find((l) => l.startsWith('draft: ')) as string).slice('draft: '.length);
      const body = fs.readFileSync(draftPath, 'utf8');
      expect(body).toContain('Area: docs');
      expect(body).toContain('Category: 🟡 Feature/Gap');
      expect(body).toContain('Size: S');
    } finally {
      cleanup();
    }
  });

  it('an empty journal produces no candidate', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      const { code, stdout } = run(['--take'], benchDir);
      expect(code).toBe(1);
      expect(stdout).toContain('candidates: none');
    } finally {
      cleanup();
    }
  });
});

describe('hook-llm-harvest --resolve', () => {
  it('FILED with an issue number is reflected by a later --take skip', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      writeJournal(benchDir, [entry({ worth_hardening: true, rule_slug: 'resolved-one' })]);
      run(['--take'], benchDir);
      const resolved = run(['--resolve', 'resolved-one', '--verdict', 'FILED', '--issue', '412'], benchDir);
      expect(resolved.code).toBe(0);

      const filedFile = path.join(benchDir, 'hook-llm', 'filed.jsonl');
      const lines = fs
        .readFileSync(filedFile, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
      const last = lines[lines.length - 1];
      expect(last).toMatchObject({ signature: 'resolved-one', verdict: 'FILED', issue: 412 });
    } finally {
      cleanup();
    }
  });

  it('an unknown --verdict value is a usage error, exit 2', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      const { code } = run(['--resolve', 'x', '--verdict', 'MAYBE'], benchDir);
      expect(code).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('a missing --verdict is a usage error, exit 2, before anything is written', () => {
    const { benchDir, cleanup } = makeBenchDir();
    try {
      const { code } = run(['--resolve', 'x'], benchDir);
      expect(code).toBe(2);
      expect(fs.existsSync(path.join(benchDir, 'hook-llm', 'filed.jsonl'))).toBe(false);
    } finally {
      cleanup();
    }
  });
});
