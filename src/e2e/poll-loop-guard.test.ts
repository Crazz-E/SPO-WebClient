/**
 * The poll-loop guard decides whether a Bash command hand-rolls a wait that already has a
 * sanctioned form.
 *
 * Why it exists: on 2026-08-25 a session composed four such loops in a row — two waits, one
 * for a bench job and three for a pull request leaving the merge queue — and every one of
 * them stopped to ask the human, because a compound matches no allowlist entry. Three of
 * the four also polled GitHub every 5 s, under the 30 s floor in
 * doc/kanban-workflow.md § GitHub API discipline.
 *
 * The prose rule was already written and was already being followed for the steps that HAD
 * an alias. What was missing was the alias for the two steps that did not — so the fix is
 * `bench:wait` + `pr:wait`, and this guard is what makes the loop stop being reachable.
 *
 * The suite pins both halves: the four commands as they were actually proposed, and — just
 * as important, because a false positive costs a session a turn — what must go straight
 * through.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HOOK = path.join(process.cwd(), '.claude', 'hooks', 'poll-loop-guard.sh');

interface HookRun {
  code: number;
  stderr: string;
}

function invoke(command: string): HookRun {
  try {
    execFileSync('bash', [HOOK], {
      input: JSON.stringify({ tool_input: { command } }),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, SPO_SESSION_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'spo-poll-')) },
    });
    return { code: 0, stderr: '' };
  } catch (err: unknown) {
    const failure = err as { status?: number; stderr?: Buffer };
    return { code: failure.status ?? -1, stderr: failure.stderr?.toString() ?? '' };
  }
}

/** 0 = allowed through, 2 = blocked. */
function guard(command: string): number {
  return invoke(command).code;
}

/** The four commands a session actually proposed, verbatim. */
const INCIDENTS = {
  benchJobFile:
    'until [ -f /home/crazz/.spo-bench/done/job-01787684391745-7a0da3.json ]; do sleep 10; done; ' +
    'cat /home/crazz/.spo-bench/done/job-01787684391745-7a0da3.json',
  prViewUntil:
    'until gh pr view 276 --json mergedAt --jq \'.mergedAt\' | grep -qv "null"; do sleep 5; done; echo "MERGED"',
  prViewFor: [
    'for i in {1..24}; do',
    '  status=$(gh pr view 276 --json mergedAt --jq \'.mergedAt\')',
    '  if [ "$status" != "null" ]; then',
    '    echo "MERGED at $status"',
    '    break',
    '  fi',
    '  sleep 5',
    'done',
  ].join('\n'),
  prApiFor: [
    'for i in {1..60}; do',
    '  status=$(gh api repos/Crazz-Org/SPO-WebClient/pulls/276 --jq \'.merged\')',
    '  if [ "$status" == "true" ]; then echo "MERGED"; exit 0; fi',
    '  sleep 5',
    'done',
    'echo "TIMEOUT"',
  ].join('\n'),
};

describe('the four loops that were actually proposed', () => {
  it.each(Object.entries(INCIDENTS))('refuses %s', (_name, command) => {
    expect(guard(command)).toBe(2);
  });

  it('names bench:wait when the subject is a bench job, not pr:wait', () => {
    const { stderr } = invoke(INCIDENTS.benchJobFile);
    expect(stderr).toContain('npm run bench:wait');
    expect(stderr).not.toContain('npm run pr:wait');
  });

  it('names pr:wait when the subject is a pull request, not bench:wait', () => {
    const { stderr } = invoke(INCIDENTS.prApiFor);
    expect(stderr).toContain('npm run pr:wait');
    expect(stderr).not.toContain('npm run bench:wait');
  });

  it('gives the reason a 5 s poll is refused, not just the replacement', () => {
    const { stderr } = invoke(INCIDENTS.prViewUntil);
    expect(stderr).toContain('30 s');
    expect(stderr).toContain('GitHub API discipline');
  });

  it('offers the one-shot read, since a single check is usually all a session needs', () => {
    expect(invoke(INCIDENTS.prViewFor).stderr).toContain('--jq');
  });

  it('tells the bench caller to read the exit code, not the report text', () => {
    expect(invoke(INCIDENTS.benchJobFile).stderr).toContain('EXIT CODE');
  });
});

describe('a wait on the verdict directory is the same wait', () => {
  it.each([
    'while true; do sleep 30; cat ~/.spo-bench/verdicts/abc.json && break; done',
    'while [ ! -f ~/.spo-bench/done/job-42.json ]; do sleep 15; done',
  ])('refuses %s', command => {
    expect(guard(command)).toBe(2);
  });
});

describe('what must go straight through', () => {
  it.each([
    // The aliases themselves — the whole point of the guard is to route here.
    ['npm run gate'],
    ['npm run test:live'],
    ['npm run bench:wait -- job-01787684391745-7a0da3'],
    ['npm run pr:wait -- 276'],
    ['npm run pr:wait -- 276 --timeout-min=45'],
    // One read is not a poll.
    ["gh api repos/Crazz-Org/SPO-WebClient/pulls/276 --jq '{state,merged}'"],
    ['gh pr checks 276'],
    // A loop doing work is not a wait.
    ['for f in a b c; do npx tsc --noEmit; done'],
    // A sleep outside a loop is not a wait loop.
    ['sleep 30; npm run bench:status'],
    // A loop that sleeps but waits for none of this guard's subjects.
    ['for i in 1 2 3; do echo $i; sleep 1; done'],
  ])('allows %s', command => {
    expect(guard(command)).toBe(0);
  });

  it('reads a heredoc body as text, so a doc quoting the loop is not a run', () => {
    const command = [
      'cat > doc/example.md <<EOF',
      'until [ -f ~/.spo-bench/done/job-1.json ]; do sleep 10; done',
      'EOF',
    ].join('\n');
    expect(guard(command)).toBe(0);
  });
});

describe('the alias the guard names exists', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  it.each(['bench:wait', 'pr:wait'])('package.json defines %s', alias => {
    expect(pkg.scripts[alias]).toBeDefined();
  });

  it('routes each alias at a script, never at a composed command line', () => {
    for (const alias of ['bench:wait', 'pr:wait']) {
      expect(pkg.scripts[alias]).toMatch(/^bash scripts\/[a-z-]+\.sh$/);
    }
  });

  it.each(['scripts/bench-wait.sh', 'scripts/pr-wait.sh'])('%s is on disk', script => {
    expect(fs.existsSync(path.join(process.cwd(), script))).toBe(true);
  });

  it('is registered as a PreToolUse hook, or it never runs', () => {
    const settings = fs.readFileSync(path.join(process.cwd(), '.claude', 'settings.json'), 'utf8');
    expect(settings).toContain('.claude/hooks/poll-loop-guard.sh');
  });
});

describe('pr-wait refuses an interval under the floor rather than clamping it', () => {
  it('exits 2 and cites the discipline, so nobody reads a clamp as licence', () => {
    let stderr = '';
    let code = 0;
    try {
      execFileSync('bash', [path.join(process.cwd(), 'scripts', 'pr-wait.sh'), '276', '--interval-sec=5'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      const failure = err as { status?: number; stderr?: Buffer };
      code = failure.status ?? -1;
      stderr = failure.stderr?.toString() ?? '';
    }
    expect(code).toBe(2);
    expect(stderr).toContain('GitHub API discipline');
  });

  it('asks for a PR number instead of guessing one', () => {
    let code = 0;
    try {
      execFileSync('bash', [path.join(process.cwd(), 'scripts', 'pr-wait.sh')], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: unknown) {
      code = (err as { status?: number }).status ?? -1;
    }
    expect(code).toBe(2);
  });
});
