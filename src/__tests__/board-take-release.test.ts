/**
 * #299: `board:take --release` refused a cross-session release unconditionally, even when the
 * card was the trace of an issue GitHub had genuinely REOPENED after its owner correctly closed
 * it — leaving only a human hand-edit in the Projects UI as a way to clear the stale claim. The
 * fix distinguishes that case from a failure trace (ownership law 4, `Session` deliberately kept
 * as the record of a failed attempt) using the one field a failure trace cannot forge: a
 * reopened-and-still-open issue reports `stateReason: REOPENED`; an issue that was never closed
 * reports `stateReason: null`.
 *
 * Follows the pattern of board-status.test.ts: read the script source and the rulebook, assert
 * on them. No network — the release/claim mutation paths need a real board to exercise, so this
 * pins the *shape* of the guard (all three conditions load-bearing together, fail-closed
 * default) and the doc/tool consistency, not a live exit code.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'board-take.sh');
const RULEBOOK = path.join(ROOT, 'doc', 'kanban-workflow.md');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

const collapse = (text: string): string => text.replace(/\s+/g, ' ');

let script: string;
let rulebook: string;
let packageJson: { scripts?: Record<string, string> };
let releaseBranch: string;

beforeAll(() => {
  script = fs.readFileSync(SCRIPT, 'utf8');
  rulebook = fs.readFileSync(RULEBOOK, 'utf8');
  packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')) as { scripts?: Record<string, string> };

  const start = script.indexOf('if [ "$release" -eq 1 ]; then');
  const end = script.indexOf('# --- normal claim path');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  releaseBranch = script.slice(start, end);
});

describe('scripts/board-take.sh exists and is wired', () => {
  it('exists and is the board:take npm script', () => {
    // Deliberately NOT asserting the executable bit: the script is always invoked as
    // `bash scripts/board-take.sh`, so its mode is not part of the contract, and
    // chmod-ing it to satisfy a test would be changing the code to fit the test.
    expect(fs.existsSync(SCRIPT)).toBe(true);
    expect(packageJson.scripts?.['board:take']).toBe('bash scripts/board-take.sh');
  });

  it('the usage path (no network) still exits 2, unrelated to the release change', () => {
    // Safe to actually execute: usage() fires before any git or gh call is made.
    let output = '';
    let code = 0;
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

  it('a plain "--release on a card not ours" still falls to the fail-closed refusal (exit 3)', () => {
    // Source-level pin, not an execution: reopened_release starts at 0 and only the narrow
    // three-condition match below flips it — every other path (including one where the read
    // returned nothing usable) reaches the "reopened_release -ne 1" branch and exits 3.
    expect(releaseBranch).toMatch(/reopened_release=0/);
    expect(releaseBranch).toMatch(/if \[ "\$reopened_release" -ne 1 \]; then/);
    const refusal = releaseBranch.slice(releaseBranch.indexOf('if [ "$reopened_release" -ne 1 ]; then'));
    expect(refusal).toMatch(/echo "NOT YOURS: held by \$\{current_session:--\}"/);
    expect(refusal).toMatch(/exit 3/);
  });
});

describe('the read query and release guard require all three conditions together', () => {
  it('the single read asks for state and stateReason on the same issue selection', () => {
    expect(script).toMatch(/issue\(number: \$issue\) \{ number state stateReason/);
  });

  it('extracts current_status, issue_state and issue_state_reason from the same $raw, no extra call', () => {
    expect(script).toMatch(/current_status=\$\(jq -r/);
    expect(script).toMatch(/issue_state=\$\(jq -r '\.data\.repository\.issue\.state/);
    expect(script).toMatch(/issue_state_reason=\$\(jq -r '\.data\.repository\.issue\.stateReason/);
    // current_status reads the Status field with the same fieldValues jq shape as current_session
    expect(script).toMatch(/\)\.Status \/\/ ""'/);
  });

  it('a cross-session release requires Status to be Done or Parked', () => {
    expect(releaseBranch).toMatch(/case "\$current_status" in\s*\n\s*Done \| Parked\)/);
  });

  it('inside that case, it requires the issue OPEN and stateReason REOPENED together, not either alone', () => {
    const caseStart = releaseBranch.indexOf('case "$current_status" in');
    const caseBody = releaseBranch.slice(caseStart, releaseBranch.indexOf('esac', caseStart));
    expect(caseBody).toMatch(
      /if \[ "\$issue_state" = "OPEN" \] && \[ "\$issue_state_reason" = "REOPENED" \]; then/,
    );
    expect(caseBody).toMatch(/reopened_release=1/);
  });

  it('never sets reopened_release=1 anywhere outside that single guarded assignment', () => {
    const assignments = releaseBranch.match(/reopened_release=1/g) ?? [];
    expect(assignments).toHaveLength(1);
  });
});

describe('the refusal message names what to do for each refused case', () => {
  it('names the active-owner case (Todo/Planning/Implementing/Gate/Validation/Checks & PR/Merging)', () => {
    expect(releaseBranch).toMatch(/Todo \| Planning \| Implementing \| Gate \| Validation \| "Checks & PR" \| Merging\)/);
    expect(releaseBranch).toMatch(/the owner is live.*only the human may free it/);
  });

  it('names the failure-trace case, citing the rulebook lines', () => {
    expect(releaseBranch).toMatch(
      /Session is deliberately the trace of a failed attempt.*only the human reclassifies from Parked/,
    );
    expect(releaseBranch).toMatch(/doc\/kanban-workflow\.md:26, :121-125/);
  });

  it('names the closed-issue case', () => {
    expect(releaseBranch).toMatch(/a terminal card whose issue is closed is not reopened work\./);
  });
});

describe('the success line distinguishes a cross-session release from an own-card release', () => {
  it('prints the extended line only when reopened_release=1', () => {
    expect(releaseBranch).toMatch(
      /if \[ "\$reopened_release" -eq 1 \]; then\s*\n\s*echo "RELEASED #\$issue \(reopened — cleared claim of \$current_session\)"/,
    );
  });

  it('keeps the plain own-card line byte-identical for the else branch', () => {
    expect(releaseBranch).toMatch(/else\s*\n\s*echo "RELEASED #\$issue"\s*\n\s*fi/);
  });
});

describe('the header comment documents the rule and why all three conditions are load-bearing', () => {
  it('names issue 299 and the three conditions', () => {
    const header = script.slice(0, script.indexOf('set -euo pipefail'));
    expect(header).toMatch(/#299/);
    expect(header).toMatch(/Done.*Parked/);
    expect(header).toMatch(/state.*is OPEN/);
    expect(header).toMatch(/stateReason.*is REOPENED/);
  });

  it('explains a failure trace cannot forge stateReason', () => {
    // The header is a `#`-prefixed comment block, so each wrapped line carries a leading `#`
    // that collapse() cannot remove — allow it (and surrounding whitespace) between words.
    expect(collapse(script)).toMatch(
      /a failure trace's issue was never closed, so its\s*#?\s*`stateReason` is null/,
    );
  });
});

describe('doc/kanban-workflow.md § the ownership law records the exception', () => {
  it('names the #299 exception near the ownership law', () => {
    const lawStart = rulebook.indexOf('## The ownership law');
    const areaStart = rulebook.indexOf('### One session per area', lawStart);
    expect(lawStart).toBeGreaterThan(-1);
    expect(areaStart).toBeGreaterThan(lawStart);
    const law = rulebook.slice(lawStart, areaStart);
    expect(law).toMatch(/#299/);
    expect(law).toMatch(/board:take --\s*\n?<n> --release|board:take -- <n> --release/);
    expect(collapse(law)).toMatch(/Status is `Done` or `Parked`, the issue\s+is \*\*open\*\*, and the issue's `stateReason` is \*\*REOPENED\*\*/);
  });

  it('still keeps ownership law 4 itself untouched', () => {
    expect(rulebook).toMatch(
      /4\. \*\*Parking a task\*\* \(failure, exhausted budget, out of scope\): move to Parked, keep/,
    );
  });
});

describe('doc/kanban-workflow.md the Item reopened row no longer claims only the human may clear Session', () => {
  it('the row no longer states the blanket claim as a standalone fact', () => {
    const rowMatch = rulebook.match(/\| \*\*Item reopened\*\* \|.*\|\n/);
    expect(rowMatch).not.toBeNull();
    const row = rowMatch ? rowMatch[0] : '';
    // The old, now-false sentence claimed unconditionally that only the human may clear it.
    expect(row).not.toMatch(
      /`Session` still holds the old owner and only the human may clear it — Parked is the human's column \|/,
    );
    // It must still say the card lands in Parked and Session still names the old owner.
    expect(row).toMatch(/Parked/);
    expect(row).toMatch(/`Session` still holds the old owner/);
    // But now names the tool that can clear the stale claim.
    expect(row).toMatch(/board:take --release/);
    expect(row).toMatch(/#299/);
  });
});
