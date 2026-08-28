/**
 * The LLM fallback layer (.claude/hooks/uncovered-command-guard.{sh,js}).
 *
 * WHY THIS FILE EXISTS. doc/haiku-permission-analysis.md measured 43 Bash calls stopped
 * across Haiku-4.5-driven /next-task sessions on one day — commands that matched no
 * allowlisted prefix, no deny pattern, and no scripted guard, and so fell through to a human
 * permission prompt. This hook is the automated version of the human who used to read those
 * transcripts by hand: for the same residual, it makes ONE tool-less `claude -p` call and
 * turns the answer into a deny with a corrected form, in this repo's own house style — so the
 * human is never asked. It NEVER allows anything a scripted pattern hasn't already sanctioned
 * (see "the never-allow pin" below).
 *
 * These tests never call the real `claude` CLI — a fake binary on PATH, honouring
 * `FAKE_CLAUDE_EXIT` / `FAKE_CLAUDE_OUTPUT` / `FAKE_CLAUDE_SLEEP` and touching
 * `FAKE_CLAUDE_WITNESS` when invoked, stands in for it, following the pattern
 * src/__tests__/run-verdict.test.ts established for a fake `npm`. The `.sh` wrapper needs a
 * real git repo to resolve `SPO_TOP` (`git rev-parse --show-toplevel`), so each test builds a
 * throwaway one with its own `.claude/settings.json`, the same shape
 * worktree-scope-guard.test.ts uses for its real-git suite.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = process.cwd();
const GUARD_JS = path.join(ROOT, '.claude', 'hooks', 'uncovered-command-guard.js');
const WRAPPER = path.join(ROOT, '.claude', 'hooks', 'uncovered-command-guard.sh');

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@x',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@x',
};

const getTempDir = (): string => {
  const scratchpad = process.env.SCRATCHPAD_DIR || path.join(os.tmpdir(), '.ucg-test');
  fs.mkdirSync(scratchpad, { recursive: true });
  return scratchpad;
};

const FIXTURE_SETTINGS = {
  permissions: {
    allow: ['Bash(npm run *)', 'Bash(git status*)', 'Bash(git add*)', 'Bash(git commit*)'],
    deny: ['Bash(git push --force*)'],
  },
};

interface Repo {
  dir: string;
  binDir: string;
  benchDir: string;
  cleanup: () => void;
}

/** A throwaway git repo with a fixture `.claude/settings.json`, a fake `claude` on its own
 * PATH prefix, and an isolated bench dir — everything one test needs, nothing shared. */
function makeRepo(claudeScript = '#!/usr/bin/env bash\nexit 0\n'): Repo {
  const tempDir = getTempDir();
  const dir = fs.mkdtempSync(path.join(tempDir, 'ucg-repo-'));
  execFileSync('git', ['init', '-q', dir], { env: gitEnv });
  execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', 'x'], { env: gitEnv });
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify(FIXTURE_SETTINGS));

  const binDir = path.join(dir, '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  const claudePath = path.join(binDir, 'claude');
  fs.writeFileSync(claudePath, claudeScript, { mode: 0o755 });

  const benchDir = path.join(dir, '.bench');

  return {
    dir,
    binDir,
    benchDir,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

interface RunOpts {
  command: string;
  permission_mode?: string;
  agent_id?: string;
  env?: Record<string, string>;
}

interface RunResult {
  code: number;
  stderr: string;
}

function run(repo: Repo, opts: RunOpts): RunResult {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: opts.command },
    cwd: repo.dir,
    permission_mode: opts.permission_mode ?? 'default',
    ...(opts.agent_id ? { agent_id: opts.agent_id } : {}),
  };
  try {
    execFileSync('bash', [WRAPPER], {
      cwd: repo.dir,
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: {
        ...gitEnv,
        PATH: `${repo.binDir}:${process.env.PATH}`,
        SPO_BENCH_DIR: repo.benchDir,
        SPO_USER_SETTINGS: path.join(repo.dir, 'nonexistent-user-settings.json'),
        ...opts.env,
      },
    });
    return { code: 0, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { code: err.status ?? -1, stderr: err.stderr ?? '' };
  }
}

function journalLines(repo: Repo): Array<Record<string, unknown>> {
  const file = path.join(repo.benchDir, 'hook-llm', 'journal.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function witnessed(repo: Repo, witness: string): boolean {
  return fs.existsSync(witness);
}

const needsFormClaude = (witness: string): string =>
  `#!/usr/bin/env bash\ntouch "${witness}"\ncat <<'JSON'\n{"structured_output":{"classification":"needs-form","reason":"curl is not allowlisted","explanation":"use the gh CLI instead","corrected_command":"gh api repos/x","worth_hardening":true,"rule_slug":"curl-github-api","harden_target":"allowlist"}}\nJSON\nexit 0\n`;

const capabilityGapClaude = (witness: string): string =>
  `#!/usr/bin/env bash\ntouch "${witness}"\ncat <<'JSON'\n{"structured_output":{"classification":"capability-gap","reason":"no sanctioned form reaches this goal","explanation":"nothing in the allowlist covers it","corrected_command":"","worth_hardening":true,"rule_slug":"gateway-metrics-probe","harden_target":"allowlist"}}\nJSON\nexit 0\n`;

const outOfScopeClaude = (witness: string): string =>
  `#!/usr/bin/env bash\ntouch "${witness}"\ncat <<'JSON'\n{"structured_output":{"classification":"out-of-scope","reason":"probes the live game server directly","explanation":"CLAUDE.md forbids this","corrected_command":"","worth_hardening":true,"rule_slug":"live-server-probe","harden_target":"guard"}}\nJSON\nexit 0\n`;

describe('uncovered-command-guard.sh — covered commands never invoke the classifier', () => {
  it('an allowlisted command exits 0 without touching the classifier', () => {
    const repo = makeRepo();
    const witness = path.join(repo.dir, 'witness');
    try {
      const { code } = run(repo, { command: 'npm run build', env: { FAKE_WITNESS: witness } });
      expect(code).toBe(0);
      expect(witnessed(repo, witness)).toBe(false);
    } finally {
      repo.cleanup();
    }
  });

  it('a compound of two allowlisted statements exits 0 without invocation', () => {
    const repo = makeRepo();
    try {
      const { code } = run(repo, { command: 'git add -A && git commit -m x' });
      expect(code).toBe(0);
      expect(journalLines(repo)).toHaveLength(0);
    } finally {
      repo.cleanup();
    }
  });

  it('a deny-listed command exits 0 here (a sibling guard/the harness itself blocks it)', () => {
    const repo = makeRepo();
    try {
      const { code } = run(repo, { command: 'git push --force origin main' });
      expect(code).toBe(0);
      expect(journalLines(repo)).toHaveLength(0);
    } finally {
      repo.cleanup();
    }
  });

  it('bypassPermissions mode exits 0 without invocation, even for an uncovered command', () => {
    const repo = makeRepo();
    try {
      const { code } = run(repo, { command: 'curl https://x', permission_mode: 'bypassPermissions' });
      expect(code).toBe(0);
      expect(journalLines(repo)).toHaveLength(0);
    } finally {
      repo.cleanup();
    }
  });

  it('the recursion sentinel (SPO_HOOK_LLM_ACTIVE) short-circuits before Node even starts', () => {
    const repo = makeRepo();
    try {
      const { code } = run(repo, { command: 'curl https://x', env: { SPO_HOOK_LLM_ACTIVE: '1' } });
      expect(code).toBe(0);
      expect(journalLines(repo)).toHaveLength(0);
    } finally {
      repo.cleanup();
    }
  });

  it('the human-typed override in the payload text exits 0', () => {
    const repo = makeRepo();
    try {
      const { code } = run(repo, { command: 'curl https://x  # SPO_HOOK_LLM_OVERRIDE=1' });
      expect(code).toBe(0);
    } finally {
      repo.cleanup();
    }
  });
});

describe('uncovered-command-guard.sh — the classifier fires on an uncovered command', () => {
  it('needs-form: exits 2, stderr carries the reason and the exact corrected command', () => {
    const witness = path.join(getTempDir(), `witness-${process.pid}-1`);
    fs.rmSync(witness, { force: true });
    const repo = makeRepo(needsFormClaude(witness));
    try {
      const { code, stderr } = run(repo, { command: 'curl https://api.github.com/x' });
      expect(code).toBe(2);
      expect(stderr).toContain('curl is not allowlisted');
      expect(stderr).toContain('gh api repos/x');
      expect(fs.existsSync(witness)).toBe(true);

      const [entry] = journalLines(repo);
      expect(entry).toMatchObject({
        verdict: 'guide',
        classification: 'needs-form',
        corrected_command: 'gh api repos/x',
        worth_hardening: true,
        rule_slug: 'curl-github-api',
        harden_target: 'allowlist',
      });
    } finally {
      repo.cleanup();
      fs.rmSync(witness, { force: true });
    }
  });

  it('capability-gap: exits 2, says no sanctioned form exists, invents nothing', () => {
    const witness = path.join(getTempDir(), `witness-${process.pid}-2`);
    fs.rmSync(witness, { force: true });
    const repo = makeRepo(capabilityGapClaude(witness));
    try {
      const { code, stderr } = run(repo, { command: 'curl localhost:9999/metrics' });
      expect(code).toBe(2);
      expect(stderr).toContain('No allowlisted form reaches this goal today');
      expect(stderr).not.toMatch(/Run this instead/);

      const [entry] = journalLines(repo);
      expect(entry.verdict).toBe('gap');
      expect(entry.corrected_command).toBe('');
    } finally {
      repo.cleanup();
      fs.rmSync(witness, { force: true });
    }
  });

  it('out-of-scope: exits 2 with the reason, no corrected form offered', () => {
    const witness = path.join(getTempDir(), `witness-${process.pid}-3`);
    fs.rmSync(witness, { force: true });
    const repo = makeRepo(outOfScopeClaude(witness));
    try {
      const { code, stderr } = run(repo, { command: 'nc 158.69.153.134 80' });
      expect(code).toBe(2);
      expect(stderr).toContain('probes the live game server directly');
      const [entry] = journalLines(repo);
      expect(entry.verdict).toBe('out-of-scope');
    } finally {
      repo.cleanup();
      fs.rmSync(witness, { force: true });
    }
  });

  it('an uncovered command reaching a sub-agent is journalled with agent "subagent"', () => {
    const witness = path.join(getTempDir(), `witness-${process.pid}-4`);
    fs.rmSync(witness, { force: true });
    const repo = makeRepo(needsFormClaude(witness));
    try {
      run(repo, { command: 'curl https://api.github.com/x', agent_id: 'sub-1' });
      const [entry] = journalLines(repo);
      expect(entry.agent).toBe('subagent');
    } finally {
      repo.cleanup();
      fs.rmSync(witness, { force: true });
    }
  });

  it('regression (task #369): a pipe onto an allowlisted command still reaches the classifier', () => {
    // git status is allowlisted (FIXTURE_SETTINGS); head is not. Before the fix, the whole
    // command matched `Bash(git status*)` as a raw-string prefix and never fired at all.
    const witness = path.join(getTempDir(), `witness-${process.pid}-6`);
    fs.rmSync(witness, { force: true });
    const repo = makeRepo(needsFormClaude(witness));
    try {
      const { code, stderr } = run(repo, { command: 'git status | head -20' });
      expect(code).toBe(2);
      expect(fs.existsSync(witness)).toBe(true); // the classifier actually fired this time
      expect(stderr).toContain('curl is not allowlisted'); // (the fixture's canned answer)
    } finally {
      repo.cleanup();
      fs.rmSync(witness, { force: true });
    }
  });
});

describe('uncovered-command-guard.sh — fails closed, never hangs, never allows silently', () => {
  it('a nonzero classifier exit produces the generic deny, journalled as an error', () => {
    const repo = makeRepo('#!/usr/bin/env bash\nexit 1\n');
    try {
      const { code, stderr } = run(repo, { command: 'curl https://x' });
      expect(code).toBe(2);
      expect(stderr).toContain('advisory');
      expect(journalLines(repo)[0].verdict).toBe('error');
    } finally {
      repo.cleanup();
    }
  });

  it('garbage classifier output produces the generic deny, journalled as an error', () => {
    const repo = makeRepo('#!/usr/bin/env bash\necho "not json"\nexit 0\n');
    try {
      const { code, stderr } = run(repo, { command: 'curl https://x' });
      expect(code).toBe(2);
      expect(stderr).toContain('advisory');
      expect(journalLines(repo)[0].verdict).toBe('error');
    } finally {
      repo.cleanup();
    }
  });

  it('a slow classifier is killed by the internal timeout and still exits 2 promptly', () => {
    const repo = makeRepo('#!/usr/bin/env bash\nsleep 30\nexit 0\n');
    try {
      const started = Date.now();
      const { code } = run(repo, { command: 'curl https://x', env: { SPO_HOOK_LLM_TIMEOUT: '1' } });
      const elapsedMs = Date.now() - started;
      expect(code).toBe(2);
      expect(elapsedMs).toBeLessThan(15000);
      expect(journalLines(repo)[0].verdict).toBe('error');
    } finally {
      repo.cleanup();
    }
  }, 20000);

  it('throttles after SPO_HOOK_LLM_MAX_PER_HOUR sightings in the same session within an hour', () => {
    const witness = path.join(getTempDir(), `witness-${process.pid}-5`);
    fs.rmSync(witness, { force: true });
    const repo = makeRepo(needsFormClaude(witness));
    try {
      const top = execFileSync('git', ['-C', repo.dir, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
      }).trim();
      const sessionKey = require('crypto').createHash('sha1').update(top).digest('hex').slice(0, 16);
      fs.mkdirSync(path.join(repo.benchDir, 'hook-llm'), { recursive: true });
      const seedLines = Array.from({ length: 2 }, () =>
        JSON.stringify({ ts: new Date().toISOString(), session_key: sessionKey, verdict: 'guide' })
      );
      fs.writeFileSync(path.join(repo.benchDir, 'hook-llm', 'journal.jsonl'), seedLines.join('\n') + '\n');

      const { code, stderr } = run(repo, {
        command: 'curl https://x',
        env: { SPO_HOOK_LLM_MAX_PER_HOUR: '2' },
      });
      expect(code).toBe(2);
      expect(stderr).toContain('advisory');
      expect(fs.existsSync(witness)).toBe(false); // never reached the classifier
      const lines = journalLines(repo);
      expect(lines[lines.length - 1].verdict).toBe('throttled');
    } finally {
      repo.cleanup();
      fs.rmSync(witness, { force: true });
    }
  });
});

describe('the never-allow pin', () => {
  it('neither source file ever emits a permissionDecision JSON block', () => {
    // The header comments discuss the mechanism in prose (why it's deliberately unused) — that
    // is documentation, not emission. What must never appear is the field written as an actual
    // JSON key, `"permissionDecision"`, quoted on both sides.
    const sh = fs.readFileSync(WRAPPER, 'utf8');
    const js = fs.readFileSync(GUARD_JS, 'utf8');
    expect(sh).not.toContain('"permissionDecision"');
    expect(js).not.toContain('"permissionDecision"');
  });

  it('every case above produced only exit 0 or exit 2, and never wrote to stdout', () => {
    const repo = makeRepo(needsFormClaude(path.join(getTempDir(), `witness-${process.pid}-pin`)));
    try {
      const stdout = execFileSync('bash', [WRAPPER], {
        cwd: repo.dir,
        input: JSON.stringify({
          tool_name: 'Bash',
          tool_input: { command: 'curl https://x' },
          cwd: repo.dir,
          permission_mode: 'default',
        }),
        encoding: 'utf8',
        env: {
          ...gitEnv,
          PATH: `${repo.binDir}:${process.env.PATH}`,
          SPO_BENCH_DIR: repo.benchDir,
          SPO_USER_SETTINGS: path.join(repo.dir, 'nope.json'),
        },
      });
      // Unreachable when the classifier denies (exit 2 throws) — assert if it ever doesn't.
      expect(stdout).toBe('');
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      expect([0, 2]).toContain(err.status);
      expect(err.stdout ?? '').toBe('');
    } finally {
      repo.cleanup();
    }
  });
});

describe('uncovered-command-guard.js — trigger, unit-level', () => {
  function trigger(payload: Record<string, unknown>, env: Record<string, string> = {}): string {
    return execFileSync('node', [GUARD_JS, 'trigger'], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, ...env },
    }).trim();
  }

  const settingsEnv = (dir: string, settings: unknown): Record<string, string> => {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify(settings));
    return { SPO_TOP: dir, SPO_USER_SETTINGS: path.join(dir, 'nope.json') };
  };

  it('an env-var-prefixed statement still matches its allowlisted prefix', () => {
    const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
    try {
      const env = settingsEnv(dir, { permissions: { allow: ['Bash(npm test*)'] } });
      const out = trigger({ tool_input: { command: 'CI=1 npm test' } }, env);
      expect(out).toBe('COVERED');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a heredoc body mentioning an uncovered verb is text, not a command', () => {
    const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
    try {
      const env = settingsEnv(dir, { permissions: { allow: ['Bash(cat*)'] } });
      const out = trigger(
        { tool_input: { command: "cat <<'EOF'\ncurl should not trigger here\nEOF" } },
        env
      );
      expect(out).toBe('COVERED');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a missing settings file is skipped silently, not a hard error', () => {
    const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
    try {
      const out = trigger(
        { tool_input: { command: 'echo hi' } },
        { SPO_TOP: dir, SPO_USER_SETTINGS: path.join(dir, 'nope.json') }
      );
      expect(out).toMatch(/^UNCOVERED/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('a corrupt settings file is skipped silently, not a hard error', () => {
    const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
    try {
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), '{ not json');
      const out = trigger(
        { tool_input: { command: 'echo hi' } },
        { SPO_TOP: dir, SPO_USER_SETTINGS: path.join(dir, 'nope.json') }
      );
      expect(out).toMatch(/^UNCOVERED/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an exact (non-prefix) pattern only matches the literal statement', () => {
    const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
    try {
      const env = settingsEnv(dir, { permissions: { allow: ['Bash(pwd)'] } });
      expect(trigger({ tool_input: { command: 'pwd' } }, env)).toBe('COVERED');
      expect(trigger({ tool_input: { command: 'pwd -P' } }, env)).toMatch(/^UNCOVERED/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('an unparseable payload is COVERED (fails open on this layer only, never blocks)', () => {
    const out = execFileSync('node', [GUARD_JS, 'trigger'], {
      input: 'not json',
      encoding: 'utf8',
    }).trim();
    expect(out).toBe('COVERED');
  });

  // Regression cases for task #369 (2026-08-28): a "whole-command fast path" matched
  // `Bash(ls *)` against the ENTIRE raw string "ls -la ... | head -20" before any splitting
  // ran, so a real popup reached the maintainer for a command this guard was supposed to
  // intercept. Fixed by removing the fast path and splitting each statement into pipe/
  // background stages, every one of which must independently match.
  describe('regression: pipe and background stages (task #369)', () => {
    it('the reported incident: a covered head, uncovered pipe stage', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(ls *)'] } });
        const out = trigger(
          { tool_input: { command: 'ls -la ~/.spo-bench/sessions/ 2>/dev/null | head -20' } },
          env
        );
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('the same command is COVERED once every pipe stage is allowlisted', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(ls *)', 'Bash(head *)'] } });
        const out = trigger(
          { tool_input: { command: 'ls -la ~/.spo-bench/sessions/ 2>/dev/null | head -20' } },
          env
        );
        expect(out).toBe('COVERED');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fast-path isolation: an && compound is still checked statement by statement', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(ls *)'] } });
        const out = trigger({ tool_input: { command: 'ls -la && head -1 x' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('pipe-split isolation: an env-prefixed pipe is still checked stage by stage', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(ls *)'] } });
        const out = trigger({ tool_input: { command: 'CI=1 ls -la | head -1' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a bare & backgrounds the command on its left, and both sides are checked', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(ls *)'] } });
        const out = trigger({ tool_input: { command: 'ls -la & head -1 x' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('the redirect-& family (2>&1, &>) is never mistaken for backgrounding', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(ls *)'] } });
        expect(trigger({ tool_input: { command: 'ls -la 2>&1' } }, env)).toBe('COVERED');
        expect(trigger({ tool_input: { command: 'ls -la &> /dev/null' } }, env)).toBe('COVERED');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a quoted $(...) substitution is uncovered — it executes but cannot be vetted', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(echo *)'] } });
        const out = trigger({ tool_input: { command: 'echo "$(rm -rf /)"' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('an unquoted $(...) substitution is uncovered too (not just via the removed fast path)', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(ls *)'] } });
        const out = trigger({ tool_input: { command: 'ls $(date)' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('an exact pattern is checked at pipe-stage level, not just statement level', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const uncoveredEnv = settingsEnv(dir, { permissions: { allow: ['Bash(pwd)'] } });
        expect(trigger({ tool_input: { command: 'pwd | cat' } }, uncoveredEnv)).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      const dir2 = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const coveredEnv = settingsEnv(dir2, { permissions: { allow: ['Bash(pwd)', 'Bash(cat*)'] } });
        expect(trigger({ tool_input: { command: 'pwd | cat' } }, coveredEnv)).toBe('COVERED');
      } finally {
        fs.rmSync(dir2, { recursive: true, force: true });
      }
    });

    it('a pipe character inside quotes is not a real pipe boundary', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(grep *)'] } });
        const out = trigger({ tool_input: { command: 'grep "a|b" f.txt' } }, env);
        expect(out).toBe('COVERED');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('an operators-only degenerate command is not vacuously COVERED', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(ls *)'] } });
        const out = trigger({ tool_input: { command: '; ;' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // Regression, 2026-08-28 (popup 2): a `for ... ; do ... ; done` compound reached a real
  // permission popup in a worktree that predated the #392/#396 merge. Confirmed the merged
  // isCovered() already resolves it to UNCOVERED (no code change needed there) — these pin the
  // guarantee: `do`/`then`/`in`/keyword-headed fragments always sit behind a `;` or newline
  // (STATEMENT_SPLIT delimiters), so they always land in their own fragment, and no current
  // allow/deny pattern's prefix matches a bare shell keyword.
  describe('regression: shell keywords always head their own fragment (task/popup #369-adjacent)', () => {
    it('the reported for/do/done compound is UNCOVERED even with cd/echo/grep/wc all allowed', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, {
          permissions: { allow: ['Bash(cd *)', 'Bash(echo *)', 'Bash(grep *)', 'Bash(wc *)'] },
        });
        const command =
          'cd /tmp/scripts && for f in claim-read.sh board-take.sh; do echo "$f: $(grep -c jq "$f")"; done';
        const out = trigger({ tool_input: { command } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('a for/do/done body that IS fully allowlisted is still UNCOVERED (the keywords themselves are not)', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(echo *)'] } });
        const out = trigger({ tool_input: { command: 'for i in 1 2; do echo x; done' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('while/do/done is UNCOVERED the same way', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(git status*)'] } });
        const out = trigger({ tool_input: { command: 'while true; do git status; done' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('if/then/fi is UNCOVERED', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(git status*)', 'Bash(echo *)'] } });
        const out = trigger({ tool_input: { command: 'if git status; then echo ok; fi' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('case/esac is UNCOVERED', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(git status*)'] } });
        const out = trigger({ tool_input: { command: 'case x in a) git status;; esac' } }, env);
        expect(out).toMatch(/^UNCOVERED/);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('control: a plain && compound with no keywords is COVERED when both sides are allowlisted', () => {
      const dir = fs.mkdtempSync(path.join(getTempDir(), 'ucg-unit-'));
      try {
        const env = settingsEnv(dir, { permissions: { allow: ['Bash(cd *)', 'Bash(echo *)'] } });
        const out = trigger({ tool_input: { command: 'cd /x && echo y' } }, env);
        expect(out).toBe('COVERED');
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
