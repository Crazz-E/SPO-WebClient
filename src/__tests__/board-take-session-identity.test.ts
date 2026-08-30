/**
 * #450: `board-take.sh` compared the FULL dated session string (`<branch> @ <YYYY-MM-DD>`)
 * to decide ownership. Because `$(date +%F)` is recomputed on every run, a retry of the same
 * task/branch that crosses midnight computes a different string than the one already on the
 * board and the script reports `LOST`/`NOT YOURS` (exit 3) even though nobody else ever
 * touched the card — the orchestrator then parks it as `claim-lost`, permanently.
 *
 * The fix anchors ownership on the stable part — the branch, the part before ` @ ` — and keeps
 * the date as informative decoration only, matching how `scripts/claim-read.sh` and
 * `scripts/orphan-cards.js` already read the field.
 *
 * Follows the pattern of board-take-release.test.ts: read the script source and the rulebook,
 * assert on their shape. No network — only the usage path (before any git/gh call) is executed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'board-take.sh');
const CLAIM_READ = path.join(ROOT, 'scripts', 'claim-read.sh');
const RULEBOOK = path.join(ROOT, 'doc', 'kanban-workflow.md');

let script: string;
let claimRead: string;
let rulebook: string;

beforeAll(() => {
  script = fs.readFileSync(SCRIPT, 'utf8');
  claimRead = fs.readFileSync(CLAIM_READ, 'utf8');
  rulebook = fs.readFileSync(RULEBOOK, 'utf8');
});

describe('the written value on a fresh claim is unchanged', () => {
  it('still writes "${branch} @ $(date +%F)" as $session', () => {
    expect(script).toMatch(/session="\$\{branch\} @ \$\(date \+%F\)"/);
  });
});

describe('every ownership decision compares the branch prefix, not the full dated string', () => {
  it('the release guard strips the date before comparing', () => {
    expect(script).toMatch(/if \[ "\$\{current_session%% @ \*\}" != "\$branch" \]; then/);
  });

  it('the claim guard strips the date before comparing', () => {
    expect(script).toMatch(
      /if \[ -n "\$current_session" \] && \[ "\$\{current_session%% @ \*\}" != "\$branch" \]; then/,
    );
  });

  it('already_ours compares the branch prefix, not the full string', () => {
    expect(script).toMatch(
      /if \[ -n "\$current_session" \] && \[ "\$\{current_session%% @ \*\}" = "\$branch" \]; then/,
    );
  });

  it('no ownership decision compares the full dated string anymore', () => {
    expect(script).not.toMatch(/\[ "\$current_session" != "\$session" \]/);
    expect(script).not.toMatch(/\[ "\$current_session" = "\$session" \]/);
  });
});

describe('the already_ours path never recomputes the held identity', () => {
  it('reassigns $session to $current_session verbatim inside the already_ours branch', () => {
    const start = script.indexOf('already_ours=0');
    const end = script.indexOf('mutation=', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = script.slice(start, end);
    expect(block).toMatch(/already_ours=1/);
    expect(block).toMatch(/session="\$current_session"/);
  });

  it('the post-write re-read still compares against $session, unchanged', () => {
    expect(script).toMatch(/if \[ "\$after" != "\$session" \]; then/);
  });
});

describe('consistency with the consumers that already read only the branch prefix', () => {
  it('scripts/claim-read.sh still extracts the branch with split(" @ ")[0]', () => {
    expect(claimRead).toMatch(/split\(" @ "\)\[0\]/);
  });

  it('doc/kanban-workflow.md still documents the <branch> @ <YYYY-MM-DD> format', () => {
    expect(rulebook).toMatch(/<branch> @ <YYYY-MM-DD>/);
  });

  it('doc/kanban-workflow.md now records that ownership uses the branch part only', () => {
    expect(rulebook).toMatch(/never recomputed/);
    expect(rulebook).toMatch(/branch part alone/);
  });
});

describe('scripts/board-take.sh exists and the usage path is unaffected', () => {
  it('exists and is executable via bash', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
  });

  it('the usage path (no network) still exits 2, unrelated to the identity change', () => {
    let code = 0;
    let output = '';
    try {
      execFileSync('bash', [SCRIPT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err: unknown) {
      const e = err as { status?: number; stdout?: string };
      code = e.status ?? -1;
      output = e.stdout ?? '';
    }
    expect(code).toBe(2);
    expect(output).toMatch(/USAGE: board-take\.sh/);
  });
});
