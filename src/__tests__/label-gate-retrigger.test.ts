/**
 * `check-pr-rules.js` also gates the required `typecheck + tests` check on the PULL REQUEST
 * LABELS — it reads `PR_LABELS` from `github.event.pull_request.labels.*.name` and only
 * unlocks a protected-file change (`rdo-members.ts`, `jest.config.js`, …) when a human has
 * posted `rdo-approved`. That label is exactly as mutable as the PR body `edited` was added
 * to cover (`pr-body-gate-retrigger.test.ts`) — but only the body half of the fix landed.
 *
 * Proven live on #384: posting `rdo-approved` fired no workflow run at all, because
 * `pull_request` had no `labeled` type. A manual re-run did not rescue it either — GitHub
 * replays the ORIGINAL event payload, so run `33148715107` reached `run_attempt: 4` and
 * still logged `PR_LABELS: []`, frozen at the payload captured before the label ever landed.
 * The only way forward was a new commit, which then needed its own `bench/gate` attestation
 * (issue #254 records an empty commit, `d833d992`, pushed purely to manufacture one).
 *
 * This file pins the trigger that closes that loop. It is not a style assertion: drop
 * `labeled` and posting the approval label deadlocks the PR exactly like #384. `unlabeled`
 * has to travel with it — without it, withdrawing the label leaves the green check standing
 * behind a revoked authorisation.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const read = (...p: string[]): string => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

describe('a label change re-runs the check that reads the PR labels', () => {
  const ci = read('.github', 'workflows', 'ci.yml');

  it('ci.yml declares pull_request types explicitly, including labeled and unlabeled', () => {
    // The bare `pull_request:` form is the bug — it silently means "not labeled".
    expect(ci).toMatch(/^ {2}pull_request:\n {4}types: \[[^\]]*\]/m);
    const types = /^ {2}pull_request:\n {4}types: \[([^\]]*)\]/m.exec(ci)?.[1] ?? '';
    const parsed = types.split(',').map((t) => t.trim());
    // Pinned alongside the four `pr-body-gate-retrigger.test.ts` already requires, so the
    // two files cannot drift apart — narrowing one trigger set must not silently drop the other.
    expect(parsed).toEqual(
      expect.arrayContaining([
        'opened',
        'synchronize',
        'reopened',
        'edited',
        'labeled',
        'unlabeled',
      ])
    );
  });

  it('the rules step still reads the labels from the event payload it was re-triggered by', () => {
    // If PR_LABELS ever stops coming from the event, `labeled`/`unlabeled` stop being the
    // right remedy.
    expect(ci).toMatch(
      /PR_LABELS: \$\{\{ toJSON\(github\.event\.pull_request\.labels\.\*\.name\) \}\}/
    );
    expect(ci).toMatch(/run: node scripts\/check-pr-rules\.js/);
  });

  it('check-pr-rules.js is the consumer that makes the label a merge blocker', () => {
    const rules = read('scripts', 'check-pr-rules.js');
    expect(rules).toMatch(/process\.env\.PR_LABELS/);
    expect(rules).toMatch(/APPROVAL_LABEL\s*=\s*'rdo-approved'/);
  });

  it('the merge_group trigger survives — the queue reports on a speculative commit', () => {
    // Narrowing/extending `pull_request` must never cost the queue its required context
    // (#158 stage D).
    expect(ci).toMatch(/^ {2}merge_group:$/m);
  });
});
