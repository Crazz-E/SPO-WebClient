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
const PIPE_HOOK = path.join(process.cwd(), '.claude', 'hooks', 'verdict-pipe-guard.sh');

interface HookRun {
  code: number;
  stderr: string;
}

function invokeHook(hook: string, command: string, background = false): HookRun {
  try {
    execFileSync('bash', [hook], {
      input: JSON.stringify({
        tool_input: background ? { command, run_in_background: true } : { command },
      }),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, SPO_SESSION_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'spo-poll-')) },
    });
    return { code: 0, stderr: '' };
  } catch (err: unknown) {
    const failure = err as { status?: number; stderr?: Buffer };
    return { code: failure.status ?? -1, stderr: failure.stderr?.toString() ?? '' };
  }
}

/** Invokes poll-loop-guard.sh. `background` puts `run_in_background: true` in tool_input. */
function invoke(command: string, background = false): HookRun {
  return invokeHook(HOOK, command, background);
}

/** 0 = allowed through, 2 = blocked. */
function guard(command: string, background = false): number {
  return invoke(command, background).code;
}

/** Invokes verdict-pipe-guard.sh the same way `invoke` invokes poll-loop-guard.sh. */
function invokePipeGuard(command: string, background = false): HookRun {
  return invokeHook(PIPE_HOOK, command, background);
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

describe('shell-backgrounding a verdict command', () => {
  /**
   * `cmd &` makes the shell report the fork rather than the run, so the exit code is 0
   * whatever happened. It is upstream of the loops above: with the verdict destroyed, the
   * only ways left are the report text (forbidden) and a poll on the done/ file (refused).
   */
  it.each([
    ['npm run gate > /tmp/scratch/gate.log 2>&1 &'],
    ['npm run test:live > /tmp/scratch/live.log 2>&1 &'],
    ['npm test > /tmp/scratch/test.log 2>&1 &'],
    ['npx jest src/foo.test.ts > /tmp/scratch/jest.log 2>&1 &'],
    ['npm run gate &'],
    ['npm run typecheck &'],
  ])('refuses %s', command => {
    expect(guard(command)).toBe(2);
  });

  it('sends the caller to the tool flag, not to another shell construct', () => {
    const { stderr } = invoke('npm run gate > /tmp/scratch/gate.log 2>&1 &');
    expect(stderr).toContain('run_in_background');
  });

  it('says the redirect is not the problem, so nobody drops it too', () => {
    const { stderr } = invoke('npm run gate > /tmp/scratch/gate.log 2>&1 &');
    expect(stderr).toContain('The redirect is fine');
  });

  it('offers the bare form, not a compound that would lose the exit code again', () => {
    const { stderr } = invoke('npm run gate &');
    expect(stderr).toContain('npm run gate > <scratchpad>/gate.log 2>&1');
    expect(stderr).not.toContain('echo "EXIT=$?"');
  });

  it.each([
    ['npm run gate'],
    ['npm run dev'],
    // The sanctioned form: same redirect, no ampersand, nothing chained after it.
    ['npm run gate > /tmp/scratch/gate.log 2>&1'],
    ['npm run test:live > /tmp/scratch/live.log 2>&1'],
    // `&&` on a command that isn't a verdict is a plain separator, not a fork.
    ['npm run bench:status && echo ok'],
    // A command that merely mentions the shape.
    ['grep -n "npm run gate &" doc/bench-worker.md'],
  ])('allows %s', command => {
    expect(guard(command)).toBe(0);
  });
});

describe('chaining a second command after a verdict command', () => {
  /**
   * The same destruction as the trailing ampersand, reached without one — but ONLY when the
   * Bash call is also backgrounded (run_in_background: true): `cmd; echo "EXIT=$?"` makes
   * the harness's completion notification report the ECHO's status (always 0), not the
   * verdict's, and `cmd && next` reports NEXT's.
   *
   * In the FOREGROUND the same chain stays legal — reading (a) on issue #289, for three
   * reasons: (1) the card that raised the incident rules the foreground compound safe;
   * (2) shell state does not persist between Bash tool calls, so `; echo "EXIT=$?"` is the
   * only way a foreground caller learns WHICH of the bench's several non-zero codes came
   * back; (3) in the foreground `&&` still propagates a genuine failure code from `cmd` —
   * only the backgrounded completion notification is destroyed, which is what this guard
   * exists to catch.
   */
  it.each([
    ['npm run gate > /tmp/scratch/gate.log 2>&1; echo "EXIT=$?"'],
    ['npm run gate && something-else'],
    ['npm run test:live > /tmp/scratch/live.log 2>&1; echo "EXIT=$?"'],
    ['npm test; echo "EXIT=$?"'],
  ])('refuses %s when backgrounded', command => {
    expect(guard(command, true)).toBe(2);
  });

  it.each([
    ['npm run gate > /tmp/scratch/gate.log 2>&1; echo "EXIT=$?"'],
    ['npm run gate && something-else'],
    ['npm run test:live > /tmp/scratch/live.log 2>&1; echo "EXIT=$?"'],
    ['npm test; echo "EXIT=$?"'],
  ])('allows %s in the foreground', command => {
    expect(guard(command, false)).toBe(0);
  });

  it('names the bare form as the backgrounding fix, and labels the chained form foreground-only', () => {
    const { stderr } = invoke('npm run gate > /tmp/scratch/gate.log 2>&1; echo "EXIT=$?"', true);
    expect(stderr).toContain('npm run gate > <scratchpad>/gate.log 2>&1');
    expect(stderr).toContain('FOREGROUND');
    // The foreground alternative it names is exactly verdict-pipe-guard.sh's sanctioned form.
    expect(stderr).toContain('npm run gate > <scratchpad>/gate.log 2>&1; echo "EXIT=$?"');
  });

  it('still allows the bare redirect form with nothing chained after it, either way', () => {
    expect(guard('npm run gate > /tmp/scratch/gate.log 2>&1', false)).toBe(0);
    expect(guard('npm run gate > /tmp/scratch/gate.log 2>&1', true)).toBe(0);
  });
});

describe("the two guards agree on each other's sanctioned form", () => {
  /**
   * poll-loop-guard.sh and verdict-pipe-guard.sh each prescribe a remedy for the other's
   * refusal shape. Neither hook is worth anything if its own advice trips the other one —
   * so this proves both directions, and pins that backgrounding the pipe-guard's foreground
   * remedy is still refused, by design (that combination is exactly what poll-loop-guard.sh
   * exists to catch).
   */
  const pipeGuardRemedy =
    'npm test > /tmp/scratch/t.log 2>&1; echo "EXIT=$?"; tail -40 /tmp/scratch/t.log';
  const pollGuardRemedy = 'npm run gate > /tmp/scratch/gate.log 2>&1';
  const pipefailForm = 'set -o pipefail; npm test 2>&1 | tail -40';

  it("verdict-pipe-guard's foreground remedy passes poll-loop-guard in the foreground", () => {
    expect(guard(pipeGuardRemedy, false)).toBe(0);
  });

  it('the same remedy backgrounded is still refused by poll-loop-guard, by design', () => {
    expect(guard(pipeGuardRemedy, true)).toBe(2);
  });

  it("poll-loop-guard's backgrounding remedy passes verdict-pipe-guard", () => {
    expect(invokePipeGuard(pollGuardRemedy).code).toBe(0);
  });

  it('the pipefail form passes both guards', () => {
    expect(guard(pipefailForm)).toBe(0);
    expect(invokePipeGuard(pipefailForm).code).toBe(0);
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
