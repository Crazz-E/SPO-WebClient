/**
 * The CI static proof — src/e2e/bench/ci-proof.ts.
 *
 * One property, and every test here is a way of stating it: **only a recorded success for
 * this exact sha may skip the static stage.** Every other answer — absent, pending, failed,
 * malformed, unreachable — must replay it. Getting this backwards attests a commit that
 * nothing statically checked, and the bench exists to make that impossible.
 */

import {
  ciStaticProof,
  CI_STATIC_CHECK,
  judgeCheckRuns,
  type GhRunner,
} from './ci-proof';

const SHA = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

function payload(...runs: { name?: string; status?: string; conclusion?: string | null }[]): string {
  return JSON.stringify({ check_runs: runs });
}

describe('judgeCheckRuns — the one path that skips', () => {
  it('is proven by a completed success for the required check', () => {
    expect(
      judgeCheckRuns(payload({ name: CI_STATIC_CHECK, status: 'completed', conclusion: 'success' })),
    ).toEqual({ proven: true });
  });

  it('takes a success even when an earlier run of the same check failed', () => {
    // A re-run after a fix. GitHub's own merge rule reads the latest conclusion, and a
    // success later re-run to failure would block the merge on the required check anyway.
    expect(
      judgeCheckRuns(
        payload(
          { name: CI_STATIC_CHECK, status: 'completed', conclusion: 'failure' },
          { name: CI_STATIC_CHECK, status: 'completed', conclusion: 'success' },
        ),
      ),
    ).toEqual({ proven: true });
  });
});

describe('judgeCheckRuns — every other answer replays', () => {
  it('replays when the commit has no run of that check yet', () => {
    // The case the receipt could not see: a gate can run BEFORE the pull request exists,
    // and two of ci.yml's steps only run on pull_request events.
    const verdict = judgeCheckRuns(payload({ name: 'CodeQL', status: 'completed', conclusion: 'success' }));
    expect(verdict.proven).toBe(false);
    expect(verdict.why).toMatch(/no "typecheck \+ tests" run exists/);
  });

  it('replays while the check is still running', () => {
    const verdict = judgeCheckRuns(payload({ name: CI_STATIC_CHECK, status: 'in_progress', conclusion: null }));
    expect(verdict.proven).toBe(false);
    expect(verdict.why).toMatch(/still in_progress/);
  });

  it('replays when the check is queued but has not started', () => {
    expect(judgeCheckRuns(payload({ name: CI_STATIC_CHECK, status: 'queued' })).why).toMatch(/still queued/);
  });

  it.each(['failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped'])(
    'replays when the check concluded %s',
    conclusion => {
      const verdict = judgeCheckRuns(payload({ name: CI_STATIC_CHECK, status: 'completed', conclusion }));
      expect(verdict.proven).toBe(false);
      expect(verdict.why).toContain(conclusion);
    },
  );

  it('replays on an empty check list', () => {
    expect(judgeCheckRuns(payload()).proven).toBe(false);
  });

  it.each([
    ['not JSON at all', 'nope{'],
    ['JSON without check_runs', '{"message":"Not Found"}'],
    ['check_runs that is not an array', '{"check_runs":"lots"}'],
  ])('replays on %s', (_label, raw) => {
    const verdict = judgeCheckRuns(raw);
    expect(verdict.proven).toBe(false);
    expect(verdict.why).toBeDefined();
  });

  it('never matches a check whose name merely resembles the required one', () => {
    expect(
      judgeCheckRuns(
        payload({ name: 'typecheck + tests (windows)', status: 'completed', conclusion: 'success' }),
      ).proven,
    ).toBe(false);
  });
});

describe('ciStaticProof', () => {
  it('asks GitHub about the sha it was given, in the given checkout', () => {
    const calls: { args: string[]; cwd: string }[] = [];
    const gh: GhRunner = (args, cwd) => {
      calls.push({ args, cwd });
      return payload({ name: CI_STATIC_CHECK, status: 'completed', conclusion: 'success' });
    };

    expect(ciStaticProof(gh, SHA, '/checkout')).toEqual({ proven: true });
    expect(calls[0].args.join(' ')).toBe(`api repos/{owner}/{repo}/commits/${SHA}/check-runs`);
    expect(calls[0].cwd).toBe('/checkout');
  });

  it('replays when GitHub cannot be reached — unreachable is not proven', () => {
    const verdict = ciStaticProof(
      () => {
        throw new Error('gh: could not resolve host');
      },
      SHA,
      '/checkout',
    );
    expect(verdict.proven).toBe(false);
    expect(verdict.why).toMatch(/could not read the checks for a1b2c3d4/);
  });
});
