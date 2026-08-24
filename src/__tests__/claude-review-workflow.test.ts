/**
 * The automatic PR reviewer is a workflow file, so nothing in the Jest suite executes it.
 * What this pins instead are the properties that make it safe and make it the thing #122
 * asked for — each one a single edit away from being lost, and none of them visible in a
 * diff review of the YAML alone.
 *
 * Two of them are security invariants rather than preferences:
 *
 *   - `pull_request_target` would hand a live API key to a job that checks out the head of
 *     an untrusted branch. A fork could then read the key out by editing any file the run
 *     touches. `pull_request` gives a fork a read-only token, so the review fails to post
 *     rather than failing open.
 *   - A floating tag on a third-party action is a supply-chain hole: the tag moves, the
 *     code that reads the secret changes, nobody sees a diff. Every action in this
 *     repository is pinned to a commit sha, and this one holds the key.
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

beforeAll(() => {
  yaml = fs.readFileSync(WORKFLOW, 'utf8');
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
      expect(yaml).toMatch(/^\s+HAS_ANTHROPIC_KEY: \$\{\{ secrets\.ANTHROPIC_API_KEY != '' \}\}$/m);
    });

    it('guards every step that needs the key on the key being present', () => {
      // Job-level `env` is evaluated once, but each step carries its own guard; a step that
      // forgets it fails the run on a repository with no secret.
      const checkout = yaml.indexOf('name: Checkout');
      const review = yaml.indexOf('name: Review the diff');
      expect(checkout).toBeGreaterThan(-1);
      expect(review).toBeGreaterThan(-1);
      for (const start of [checkout, review]) {
        expect(yaml.slice(start, start + 400)).toMatch(/if: env\.HAS_ANTHROPIC_KEY == 'true'/);
      }
    });

    it('says why nothing was reviewed instead of failing silently', () => {
      expect(yaml).toMatch(/if: env\.HAS_ANTHROPIC_KEY != 'true'/);
      expect(yaml).toMatch(/::notice title=Claude Review skipped::/);
    });

    it('skips Dependabot, which cannot read the key and has no design to review', () => {
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
