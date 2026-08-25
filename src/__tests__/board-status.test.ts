/**
 * #144: a session that lists the board once at claim time and then reasons from that
 * snapshot for hours states stale facts about cards it does not own — a merged PR reported
 * as open, a card reported In progress when it moved to PR. § GitHub API discipline rule 1
 * forbids re-reading the *pool* between claim and Done on purpose (a 2026-08-24 incident
 * emptied the GraphQL bucket), so the fix cannot be "list again" — it has to be a read
 * shaped like the existing single-item handshake re-read, generalised to any card a session
 * is about to talk about.
 *
 * This file pins the two halves of that fix, the way `card-dependencies.test.ts` pins #189:
 * the helper (`scripts/board-status.sh`) reads named issues only, never the pool; and the
 * rulebook + the `/next-task` command both name the moments a session must call it.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'board-status.sh');
const RULEBOOK = path.join(ROOT, 'doc', 'kanban-workflow.md');
const COMMAND = path.join(ROOT, '.claude', 'commands', 'next-task.md');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

const collapse = (text: string): string => text.replace(/\s+/g, ' ');

let script: string;
let rulebook: string;
let command: string;
let packageJson: { scripts?: Record<string, string> };

beforeAll(() => {
  script = fs.readFileSync(SCRIPT, 'utf8');
  rulebook = fs.readFileSync(RULEBOOK, 'utf8');
  command = fs.readFileSync(COMMAND, 'utf8');
  packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')) as { scripts?: Record<string, string> };
});

describe('scripts/board-status.sh', () => {
  it('exists, is executable, and refuses to run with no issue numbers', () => {
    const mode = fs.statSync(SCRIPT).mode;
    expect(mode & 0o111).not.toBe(0);
    expect(script).toMatch(/if \[ \$# -eq 0 \]/);
  });

  it('reads named issues, never the pool', () => {
    // `item-list` and the claim read's `items(first: 100)` shape are the ~103-point read
    // this script exists to avoid; it must query `issue(number: ...)` instead.
    expect(script).toMatch(/issue\(number: \$n\)/);
    // The comment may name `gh project item-list` as the thing this script avoids; it must
    // never actually invoke it.
    expect(script).not.toMatch(/^\s*gh project item-list/m);
    expect(script).not.toMatch(/items\(first:/);
  });

  it('reports status, session, and linked PRs — the three fields #144 asked for', () => {
    expect(script).toMatch(/projectItems/);
    expect(script).toMatch(/closedByPullRequestsReferences/);
    expect(script).toMatch(/\$f\.Status/);
    expect(script).toMatch(/\$f\.Session/);
  });

  it('asks the price inside the query, per § GitHub API discipline rule 3', () => {
    expect(script).toMatch(/rateLimit \{ cost remaining \}/);
  });

  it('is wired as an npm script', () => {
    expect(packageJson.scripts?.['board:status']).toBe('bash scripts/board-status.sh');
  });
});

describe('the rulebook names the re-read', () => {
  let rule6: string;

  beforeAll(() => {
    const start = rulebook.indexOf('6. **Never assert another card');
    expect(start).toBeGreaterThan(-1);
    const disciplineHeader = rulebook.indexOf('## Feeding rule', start);
    expect(disciplineHeader).toBeGreaterThan(start);
    rule6 = rulebook.slice(start, disciplineHeader);
  });

  it('sits inside GitHub API discipline, beside the pool-read rule it narrows', () => {
    const discipline = rulebook.indexOf('## GitHub API discipline');
    const ruleOne = rulebook.indexOf('1. **Reads happen at state transitions only');
    expect(discipline).toBeGreaterThan(-1);
    expect(ruleOne).toBeGreaterThan(discipline);
    expect(rulebook.indexOf("6. **Never assert another card")).toBeGreaterThan(ruleOne);
  });

  it('says a session may cache its own card but nothing else', () => {
    expect(collapse(rule6)).toMatch(/A session may cache what it owns/);
  });

  it('names the durable moments: a comment, a PR body, the final report', () => {
    expect(collapse(rule6)).toMatch(
      /in an issue comment, a PR body, or its final report — it re-reads first/,
    );
  });

  it('points at the helper script by name', () => {
    expect(rule6).toMatch(/`scripts\/board-status\.sh <n>…`/);
  });

  it('carries the recipe in the gh CLI recipes section', () => {
    const recipes = rulebook.indexOf('## gh CLI recipes');
    expect(recipes).toBeGreaterThan(-1);
    expect(rulebook.slice(recipes)).toMatch(/npm run board:status -- 144 106/);
  });
});

describe('the /next-task command names the re-read moment', () => {
  let work: string;

  beforeAll(() => {
    const start = command.indexOf('## 3 · Work the lot end-to-end');
    const next = command.indexOf('## 4 · If it fails', start);
    expect(start).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(start);
    work = command.slice(start, next);
  });

  it('opens with the re-read rule, before the ordinary implementation steps', () => {
    expect(collapse(work)).toMatch(/Never state another card's status from memory/);
  });

  it('names the helper and its cost', () => {
    expect(work).toMatch(/npm run board:status -- <n>…/);
    expect(collapse(work)).toMatch(/~1 point for any number of issues, never the pool/);
  });
});
