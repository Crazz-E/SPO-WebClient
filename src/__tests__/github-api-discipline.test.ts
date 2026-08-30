/**
 * The GitHub API discipline is, like the card review and the blocking order before it, a rule
 * made of prose: nothing in this repository executes a claim — that moment happens inside a
 * live session on a developer machine, spending the one account's shared GraphQL quota.
 *
 * On 2026-08-25 five sessions re-reading the board in a loop emptied that quota (5000 points
 * per hour, per account) and the board went unreadable for ~5 minutes, mid-claim. The repair
 * is not a rate limiter: it is one cheap composite read per claim (~2 points, measured)
 * instead of `gh project item-list` (~103 points, measured), no polling where a local surface
 * exists, and a defined behaviour when `RATE_LIMITED` lands mid-handshake — a half-made claim
 * is how a card ends up locked with nobody alive holding it.
 *
 * So this file pins the surfaces the way `card-dependencies.test.ts` established: the
 * rulebook, `/commit-push`, and the one script that legitimately
 * polls a merge. Gut any of them and this test — inside the required `typecheck + tests`
 * check — goes red. Deciding the discipline is not worth its cost is a legitimate decision;
 * it just has to be made here as well as in those files.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const RULEBOOK = path.join(ROOT, 'doc', 'kanban-workflow.md');
const COMMIT_PUSH = path.join(ROOT, '.claude', 'commands', 'commit-push.md');
const DEPS_GATE = path.join(ROOT, 'scripts', 'deps-gate.sh');
const CLAIM_READ = path.join(ROOT, 'scripts', 'claim-read.sh');

let rulebook: string;
let commitPush: string;
let depsGate: string;
let claimRead: string;

/** Prose is hard-wrapped at ~95 columns; sentence assertions run against the collapsed copy. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ');

beforeAll(() => {
  rulebook = fs.readFileSync(RULEBOOK, 'utf8');
  commitPush = fs.readFileSync(COMMIT_PUSH, 'utf8');
  depsGate = fs.readFileSync(DEPS_GATE, 'utf8');
  claimRead = fs.readFileSync(CLAIM_READ, 'utf8');
});

describe('the rulebook carries the discipline', () => {
  let section: string;

  beforeAll(() => {
    const start = rulebook.indexOf('## GitHub API discipline');
    const next = rulebook.indexOf('## Feeding rule', start);
    expect(start).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(start);
    section = rulebook.slice(start, next);
  });

  it('names the shared budget: one account, both buckets, measured costs', () => {
    expect(collapse(section)).toMatch(/5000 GraphQL points per hour/);
    expect(collapse(section)).toMatch(/The costs are measured, not guessed/);
    expect(section).toMatch(/`gh api rate_limit`/);
  });

  it('bans the pool listing that emptied the bucket, by name', () => {
    expect(collapse(section)).toMatch(/never reads the pool with `gh project item-list`/);
  });

  it('makes reads transition-bound, like writes, with one claim read', () => {
    expect(collapse(section)).toMatch(/Reads happen at state transitions only, exactly like writes/);
    expect(collapse(section)).toMatch(/nothing between claim and Done re-reads the pool/);
  });

  it('forbids polling GitHub where a local surface exists, and names the surfaces', () => {
    expect(collapse(section)).toMatch(/Never poll GitHub for a state that has a local surface/);
    expect(section).toMatch(/~\/\.spo-bench\/verdicts\//);
    expect(section).toMatch(/~\/\.spo-bench\/nightly\/latest\.json/);
  });

  it('asks the price inside every hand-written GraphQL call', () => {
    expect(section).toMatch(/rateLimit \{ cost remaining resetAt \}/);
  });

  it('binds the MCP GitHub tools to the same rules', () => {
    expect(collapse(section)).toMatch(/MCP GitHub tools spend this same account's quota/);
  });

  it('defines RATE_LIMITED mid-claim: the write half decides, ownership still closes', () => {
    expect(collapse(section)).toMatch(/the write half decides/);
    expect(collapse(section)).toMatch(/must not be abandoned half-claimed/);
    expect(collapse(section)).toMatch(/every owner closes its ownership — binds the rate-limited case too/);
  });

  it('ships the claim read in the recipes, and no pool listing beside it', () => {
    const recipes = rulebook.slice(rulebook.indexOf('## gh CLI recipes'));
    expect(recipes).toMatch(/THE CLAIM READ/);
    // The query itself lives in the script the alias runs, never inline here: a session
    // drives its scripted steps on Haiku and must not be composing shell (§ Model routing).
    expect(recipes).toMatch(/npm run board:claim/);
    expect(claimRead).toMatch(/rateLimit \{ cost remaining resetAt \}/);
    // The expensive listing must not survive as a copy-pastable recipe line.
    expect(recipes).not.toMatch(/^gh project item-list/m);
    // The handshake re-read is a single item, not a second listing.
    expect(collapse(recipes)).toMatch(/The handshake re-read — ONE item/);
  });
});

describe('the other GitHub waiters follow the same rule', () => {
  it('/commit-push checks once and never polls', () => {
    expect(collapse(commitPush)).toMatch(/Check once, do not poll/);
    expect(collapse(commitPush)).toMatch(/GitHub API discipline/);
  });

  it('deps-gate polls its merge over REST, bounded, off the shared GraphQL points', () => {
    // The one legitimate poll: merge-queue state exists nowhere but GitHub. It must spend the
    // REST bucket, not `gh pr view` (GraphQL), and stay bounded by its existing deadline.
    expect(depsGate).toMatch(/gh api "repos\/\{owner\}\/\{repo\}\/pulls\/\$n"/);
    expect(depsGate).not.toMatch(/gh pr view "\$n" --json state -q \.state\)"\n\s*\[ "\$state" = "MERGED"/);
    expect(depsGate).toMatch(/deadline=/);
  });
});
