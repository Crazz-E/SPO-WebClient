/**
 * The blocking order between two cards (#189) is, like the card review before it, a rule made
 * of prose: GitHub holds the `blocked by` relation, but nothing in this repository executes
 * the claim step — that moment happens inside a live session on a developer machine.
 *
 * So this file pins what CAN be held, in the shape `card-reviewer-agent.test.ts` established:
 * the properties that make the mechanism the thing #189 asked for, each one a single edit away
 * from being lost, and none of them visible in a diff review of one file alone.
 *
 * Three of them matter more than the rest:
 *
 *   - **A blocked card is not claimable, and closing the blocker is the whole lifecycle.**
 *     `issueDependenciesSummary.blockedBy` counts OPEN blockers only. A rule that counted the
 *     total would leave every card permanently blocked by its own history.
 *   - **The skip is never silent.** #189's own criterion: without a stated visible behaviour,
 *     the board reads worse with dependencies than without — a card is passed over and the
 *     human is given no reason.
 *   - **The two surfaces stay consistent.** The rulebook carries the rule twice — long form and
 *     short form — and CLAUDE.md carries the pointer to it, so a session reading either one
 *     still reaches the rule. Gut either and this test — inside the required
 *     `typecheck + tests` check — goes red.
 *
 * Deciding the mechanism is not worth its cost is a legitimate decision. It just has to be
 * made here as well as in the three files, which is the point of pinning it.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const RULEBOOK = path.join(ROOT, 'doc', 'kanban-workflow.md');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');
const CLAIM_READ = path.join(ROOT, 'scripts', 'claim-read.sh');

let rulebook: string;
let claudeMd: string;
let claimRead: string;

/** Same reason as in `card-reviewer-agent.test.ts`: prose here is hard-wrapped at ~95 columns,
 * so a sentence assertion written against the reading order breaks the day a word crosses the
 * margin. Sentence assertions run against the collapsed copy; structural ones keep newlines. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ');

beforeAll(() => {
  rulebook = fs.readFileSync(RULEBOOK, 'utf8');
  claudeMd = fs.readFileSync(CLAUDE_MD, 'utf8');
  claimRead = fs.readFileSync(CLAIM_READ, 'utf8');
});

describe('the rulebook carries the blocking order', () => {
  let section: string;

  beforeAll(() => {
    const start = rulebook.indexOf('### Blocking order');
    const next = rulebook.indexOf('## The orphan watch', start);
    expect(start).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(start);
    section = rulebook.slice(start, next);
  });

  it('sits with the other claim-time filter, not somewhere else in the file', () => {
    // The area reservation and this rule are the two things that make a Todo card unclaimable.
    // Split them across the document and a reader finds one and believes it is the only one.
    const areas = rulebook.indexOf('### One session per area');
    expect(areas).toBeGreaterThan(-1);
    expect(rulebook.indexOf('### Blocking order')).toBeGreaterThan(areas);
  });

  it('names the GitHub surface the relation actually lives on', () => {
    expect(section).toMatch(/`Issue\.blockedBy`/);
    expect(section).toMatch(/`Issue\.issueDependenciesSummary`/);
    expect(section).toMatch(/`addBlockedBy` \/ `removeBlockedBy`/);
  });

  it('says the relation is on the issue, so no project field can carry it', () => {
    expect(collapse(section)).toMatch(/on the \*\*issue\*\*, not on the card/);
    expect(collapse(section)).toMatch(/`gh project item-list` cannot see one/);
  });

  it('reads the whole set in one call, not one call per card', () => {
    expect(collapse(section)).toMatch(/for the whole set, never one per card/);
  });

  it('counts open blockers only, so a closed blocker frees the card by itself', () => {
    expect(collapse(section)).toMatch(/counts the \*\*open\*\* blockers only/);
    expect(collapse(section)).toMatch(/frees the card by itself, with no board write/);
  });

  it('decides the visible behaviour both ways, and rejects the silent skip by name', () => {
    // #189 criterion 3: skipped silently OR refused out loud, written down either way.
    expect(collapse(section)).toMatch(/skips the card and names the skip in its final report/);
    expect(collapse(section)).toMatch(/stops and says so out loud/);
    expect(collapse(section)).toMatch(/A silent skip would make the board read \*worse\*/);
  });

  it('writes nothing to a blocked card — it is not Parked', () => {
    expect(collapse(section)).toMatch(/`Session` stays empty, `Status` stays \*\*Todo\*\*/);
    expect(collapse(section)).toMatch(/is \*\*not\*\* Parked/);
  });

  it('says who may post one, and that a session never removes one', () => {
    expect(collapse(section)).toMatch(/\*\*The human always may\*\*/);
    expect(collapse(section)).toMatch(/\*\*A session may add one\*\* when the relation is a fact of the code/);
    expect(collapse(section)).toMatch(/A session \*\*never removes\*\* one/);
  });

  it('keeps priority the human\'s — a dependency is order, not weight', () => {
    expect(collapse(section)).toMatch(/never a substitute for priority/);
    expect(collapse(section)).toMatch(/\*cannot start yet\*, never \*matters less\*/);
    expect(collapse(section)).toMatch(/move the card down; do not invent a blocker/);
  });

  it('keeps the area reservation and the dependency independent of each other', () => {
    // #189 out of scope: the two mechanisms guard different failures and neither replaces
    // the other. Collapse them and a merge collision starts reading as a logical order.
    expect(collapse(section)).toMatch(/neither substitutes for the `Area` reservation nor is substituted by it/);
    expect(collapse(section)).toMatch(/Both are checked, independently/);
  });

  it('distinguishes a sub-issue link, which decomposes but does not order', () => {
    expect(collapse(section)).toMatch(/A sub-issue link is not a dependency/);
    expect(collapse(section)).toMatch(/nothing in that link orders the children/);
  });

  it('points at this test, so the pin is discoverable from the rule', () => {
    expect(section).toMatch(/card-dependencies\.test\.ts/);
  });

  it('ships the recipe a session runs, in the gh recipes section', () => {
    const recipes = rulebook.indexOf('## gh CLI recipes');
    expect(recipes).toBeGreaterThan(-1);
    const tail = rulebook.slice(recipes);
    expect(tail).toMatch(/issueDependenciesSummary \{ blockedBy \}/);
    expect(tail).toMatch(/npm run board:block --/);
    // The script resolves node ids from issue numbers, so the caller never has to.
    expect(collapse(tail)).toMatch(/scripts\/board-block\.sh/);
  });
});

describe('the rulebook carries the rule a session loads without asking', () => {
  it('names the mechanism in the short form', () => {
    expect(collapse(rulebook)).toMatch(/\*\*Order, where it exists, is a `blocked by` link\*\*/);
  });

  it('states the claim behaviour and keeps priority the human\'s', () => {
    expect(collapse(rulebook)).toMatch(/does not claim a card whose blocker is still open/);
    expect(collapse(rulebook)).toMatch(/records \*cannot start yet\*, never priority/);
  });

  it('sits beside the area reservation, the other claim-time filter', () => {
    const area = rulebook.indexOf('**One session per area:**');
    const order = rulebook.indexOf('**Order, where it exists');
    expect(area).toBeGreaterThan(-1);
    expect(order).toBeGreaterThan(area);
  });

  it('CLAUDE.md points at the rulebook', () => {
    expect(collapse(claudeMd)).toMatch(/doc\/kanban-workflow\.md/);
  });
});
