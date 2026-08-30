/**
 * The busy set in `scripts/claim-read.sh` derives a branch name from the `Session` field with
 * `split(" @ ")[0]`. On an EMPTY `Session` that returns `[]`, so `[0]` is null, and
 * `$live[null]` is a hard jq error — "Cannot index object with null" — which does not
 * degrade the claim read, it kills it. `npm run board:claim` exits 5 for EVERY session on the
 * machine, and nothing can be claimed at all until the field is filled again.
 *
 * An empty `Session` in a busy column is not a corrupt state. It is precisely what the human
 * release of an orphaned card produces (§ The ownership law, law 3: "only the human may free
 * it"), in the window between the release and the card being re-taken. The board reached it
 * the first time a maintainer freed four crashed sessions' cards.
 *
 * The semantics are not in doubt — a card nobody owns reserves no ground, so it is not busy.
 * This file executes the real predicate, lifted out of the script itself so it cannot drift,
 * against a board that contains every shape of `Session` at once.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'claim-read.sh');

/** The chain of `select`s the script actually spells, comments and all — lifted, not retyped. */
const busySelects = (): string => {
  const script = fs.readFileSync(SCRIPT, 'utf8');
  const open = '([$cards[]';
  const start = script.indexOf(open);
  const end = script.indexOf('| .Area] | unique) as $busy', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return script.slice(start + open.length, end).trim();
};

const busyAreas = (cards: unknown[], live: Record<string, string>): string[] => {
  const program = `[$cards[] ${busySelects()} | .Area] | unique`;
  const out = execFileSync(
    'jq',
    ['-n', '--argjson', 'cards', JSON.stringify(cards), '--argjson', 'live', JSON.stringify(live), program],
    { encoding: 'utf8' }
  );
  return JSON.parse(out) as string[];
};

/**
 * `<branch> -> LIVE|EXPIRED`, the map claim-read.sh builds from the batched ref-date call. It
 * was merged with a per-session heartbeat scan until #441 retired that dead half; the binding
 * is named `live` rather than `heartbeats` since.
 */
const live = { 'claude/live-one': 'LIVE', 'claude/dead-one': 'EXPIRED' };

describe('the claim read survives a card the human has freed', () => {
  it('an empty Session in a busy column does not crash the read, and holds no ground', () => {
    // The exact board shape a human release leaves behind: still in Checks & PR, owner cleared.
    expect(busyAreas([{ Status: 'Checks & PR', Area: 'rdo', Session: '' }], live)).toEqual([]);
  });

  it('a null Session is equally survivable — the field may be absent, not just blank', () => {
    expect(
      busyAreas([{ Status: 'Validation', Area: 'gateway', Session: null }], live)
    ).toEqual([]);
    expect(busyAreas([{ Status: 'Validation', Area: 'gateway' }], live)).toEqual([]);
  });

  it('a live owner still reserves its ground — the fix must not disarm the rule', () => {
    expect(
      busyAreas(
        [{ Status: 'Checks & PR', Area: 'rdo', Session: 'claude/live-one @ 2026-08-28' }],
        live
      )
    ).toEqual(['rdo']);
  });

  it('an expired heartbeat still frees the ground, as it did before', () => {
    expect(
      busyAreas(
        [{ Status: 'Gate', Area: 'bench', Session: 'claude/dead-one @ 2026-08-27' }],
        live
      )
    ).toEqual([]);
  });

  it('freed and live cards mix without the freed one taking the read down with it', () => {
    const board = [
      { Status: 'Checks & PR', Area: 'rdo', Session: '' },
      { Status: 'Validation', Area: 'gateway', Session: null },
      { Status: 'Planning', Area: 'client', Session: 'claude/live-one @ 2026-08-28' },
      { Status: 'Todo', Area: 'e2e', Session: '' },
      { Status: 'Checks & PR', Area: 'docs', Session: 'claude/live-one @ 2026-08-28' },
    ];
    // Only the live non-docs card. `docs` never blocks; Todo never makes an area busy.
    expect(busyAreas(board, live)).toEqual(['client']);
  });
});
