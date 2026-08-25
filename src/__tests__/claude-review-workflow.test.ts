/**
 * The automatic PR reviewer is a workflow file, so nothing in the Jest suite executes it.
 * What this pins instead are the properties that make it safe and make it the thing #122
 * asked for — each one a single edit away from being lost, and none of them visible in a
 * diff review of the YAML alone.
 *
 * Two of them are security invariants rather than preferences:
 *
 *   - `pull_request_target` would hand a live credential to a job that checks out the head
 *     of an untrusted branch. A fork could then read it out by editing any file the run
 *     touches. `pull_request` gives a fork a read-only token, so the review fails to post
 *     rather than failing open.
 *   - A floating tag on a third-party action is a supply-chain hole: the tag moves, the
 *     code that reads the secret changes, nobody sees a diff. Every action in this
 *     repository is pinned to a commit sha, and this one holds the credential.
 *
 * The credential is `CLAUDE_CODE_OAUTH_TOKEN`, not `ANTHROPIC_API_KEY`: this repository has
 * no API key, and the reviewer runs on the maintainer's Claude Max subscription. The two are
 * alternative inputs to the same action; pinning which one is in use is what stops a later
 * edit from silently reintroducing a key nobody holds — the job would go green-and-skipped
 * and nothing would say why.
 *
 * The rest pin the shape #122 specified: the five CLAUDE.md prohibitions actually named in
 * the prompt, and the informational-first posture. Making the check blocking is a
 * legitimate decision — it just has to be made here as well as in the YAML, which is the
 * point of pinning it.
 */

import * as fs from 'fs';
import * as path from 'path';

const WORKFLOW = path.join(process.cwd(), '.github', 'workflows', 'claude-review.yml');

let yaml: string;
/** The same file with every comment line removed — what GitHub actually acts on. */
let directives: string;

beforeAll(() => {
  yaml = fs.readFileSync(WORKFLOW, 'utf8');
  directives = yaml
    .split('\n')
    .filter(line => !/^\s*#/.test(line))
    .join('\n');
});

describe('claude-review workflow', () => {
  it('exists and declares a name', () => {
    expect(yaml).toMatch(/^name: Claude Review$/m);
  });

  describe('trigger', () => {
    it('runs on pull_request', () => {
      expect(yaml).toMatch(/^on:\n\s+pull_request:\n/m);
    });

    it('never uses pull_request_target', () => {
      // The key is in this job. pull_request_target + a checkout of the PR head is the
      // credential-exfiltration pair; labeler.yml may use that trigger because it checks
      // out nothing, this one may not.
      expect(yaml).not.toMatch(/pull_request_target:/);
    });

    it('reviews new pushes to an open PR, not only its opening', () => {
      expect(yaml).toMatch(/types: \[opened, synchronize, reopened\]/);
    });
  });

  describe('permissions', () => {
    it('grants pull-requests: write and nothing wider', () => {
      expect(yaml).toMatch(/pull-requests: write/);
      expect(yaml).not.toMatch(/contents: write/);
    });

    it('does not grant write to the repository contents at the top level', () => {
      const top = yaml.slice(0, yaml.indexOf('jobs:'));
      expect(top).toMatch(/^permissions:\n\s+contents: read$/m);
    });
  });

  describe('supply chain', () => {
    it('pins claude-code-action to a commit sha, not a floating tag', () => {
      expect(yaml).toMatch(/uses: anthropics\/claude-code-action@[0-9a-f]{40} # v\d/);
    });

    it('pins every action it uses to a commit sha', () => {
      // Every pin carries a trailing `# v<x>` comment, which is the readable half of it.
      const uses = [...yaml.matchAll(/^\s*uses: (\S+)(?:\s+#.*)?$/gm)].map(m => m[1]);
      expect(uses.length).toBeGreaterThan(0);
      for (const ref of uses) {
        expect(ref).toMatch(/@[0-9a-f]{40}$/);
      }
    });
  });

  describe('authentication', () => {
    it('authenticates with the subscription token, never an API key', () => {
      // No ANTHROPIC_API_KEY exists for this repository. Reintroducing it would not fail —
      // it would skip, quietly, on every pull request.
      expect(yaml).toMatch(
        /claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}/,
      );
      expect(yaml).not.toMatch(/anthropic_api_key:/);
      expect(yaml).not.toMatch(/secrets\.ANTHROPIC_API_KEY/);
    });

    it('authenticates to GitHub with the workflow token, not the GitHub App path', () => {
      // Two different credentials. Dropping `github_token` does not fall back to the
      // workflow's own token — it selects the App path, which exchanges a GitHub OIDC token
      // and needs `id-token: write` plus the Claude app installed on the repository. Neither
      // is true here, and the action then dies before Claude runs: `Could not fetch an OIDC
      // token`, exit 1, reported green by `continue-on-error` (run 32826227442).
      expect(yaml).toMatch(/github_token: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
      // Against `directives`, not `yaml`: the header explains the App path in prose, and
      // naming a permission is not granting it.
      expect(directives).not.toMatch(/id-token:/);
    });
  });

  describe('an unprovisioned repository stays green', () => {
    it('reads the secret only where GitHub allows it', () => {
      // `secrets` is available in neither a job-level nor a step-level `if`. Using it there
      // does not fail the job — it invalidates the whole file, so the workflow never runs,
      // no annotation is produced, and every other check stays green. That silence is why
      // this is pinned: the mistake is invisible on a passing pull request.
      const ifLines = [...yaml.matchAll(/^\s*if: (.+)$/gm)].map(m => m[1]);
      expect(ifLines.length).toBeGreaterThan(0);
      for (const condition of ifLines) {
        expect(condition).not.toMatch(/secrets\./);
      }
      expect(yaml).toMatch(
        /^\s+HAS_CLAUDE_TOKEN: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN != '' \}\}$/m,
      );
    });

    it('guards every step that needs the key on the key being present', () => {
      // Job-level `env` is evaluated once, but each step carries its own guard; a step that
      // forgets it fails the run on a repository with no secret — or, later, one whose
      // subscription token has expired, which reads identically.
      const checkout = yaml.indexOf('name: Checkout');
      const review = yaml.indexOf('name: Review the diff');
      expect(checkout).toBeGreaterThan(-1);
      expect(review).toBeGreaterThan(-1);
      for (const start of [checkout, review]) {
        expect(yaml.slice(start, start + 400)).toMatch(/if: env\.HAS_CLAUDE_TOKEN == 'true'/);
      }
    });

    it('says why nothing was reviewed instead of failing silently', () => {
      expect(yaml).toMatch(/if: env\.HAS_CLAUDE_TOKEN != 'true'/);
      expect(yaml).toMatch(/::notice title=Claude Review skipped::/);
    });

    it('skips Dependabot, which cannot read the token and has no design to review', () => {
      expect(yaml).toMatch(/if: github\.actor != 'dependabot\[bot\]'/);
    });
  });

  describe('informational posture', () => {
    /**
     * Deliberate, per #122: a dozen PRs of calibration before anything depends on this
     * reviewer. Turning it into a gate means removing `continue-on-error` here AND adding
     * the check to the `main` ruleset — this test is the record that both were intended.
     */
    it('cannot fail a pull request', () => {
      expect(yaml).toMatch(/continue-on-error: true/);
    });

    it('bounds the run', () => {
      expect(yaml).toMatch(/timeout-minutes: \d+/);
    });

    it('still says so when the reviewer crashed instead of staying quiet', () => {
      // The cost of `continue-on-error` is that a crash and an empty review look identical
      // from the checks list. The step outcome is the only place they differ, so the crash
      // gets an annotation — without failing the job, which stays the #122 posture.
      expect(yaml).toMatch(/^\s+id: review$/m);
      expect(yaml).toMatch(/steps\.review\.outcome == 'failure'/);
      expect(yaml).toMatch(/::warning title=Claude Review failed::/);
    });
  });

  describe('the prompt carries the CLAUDE.md prohibitions', () => {
    const prohibitions: ReadonlyArray<readonly [string, RegExp]> = [
      ['hand-built RDO strings', /rdoCall.*rdoGet.*rdoSet/s],
      ['any instead of unknown', /\*\*`any`\.\*\*/],
      ['unwired UI elements', /UI element added without its action wired/],
      ['tests edited to pass', /test modified to make it pass/],
      ['speculative abstraction', /abstraction built for a hypothetical need/],
    ];

    it.each(prohibitions)('names %s', (_label, pattern) => {
      expect(yaml).toMatch(pattern);
    });

    it('tells the reviewer not to repeat what CI already enforces', () => {
      expect(yaml).toMatch(/## What NOT to say/);
      expect(yaml).toMatch(/typecheck \+ tests/);
    });

    it('licenses an empty review, so the reviewer does not invent findings', () => {
      expect(yaml).toMatch(/If you found nothing worth raising/);
    });

    it('asks for one top-level comment plus inline comments', () => {
      expect(yaml).toMatch(/mcp__github_inline_comment__create_inline_comment/);
      expect(yaml).toMatch(/exactly one top-level comment with `gh pr comment`/);
    });
  });

  describe('model routing', () => {
    it('uses the model CLAUDE.md routes analysis to', () => {
      expect(yaml).toMatch(/--model claude-fable-5/);
    });
  });
});
