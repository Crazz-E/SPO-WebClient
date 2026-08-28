/**
 * Four contradictions between `.claude/commands/next-task.md` and `doc/kanban-workflow.md`,
 * pinned so they cannot come back.
 *
 * WHY THEY EXISTED. Two changes edited the same three prose files days apart and git
 * auto-merged them with NO conflict. A clean auto-merge is exactly how two individually
 * coherent halves become one incoherent whole: nothing in the toolchain reads prose for
 * meaning, `.claude/**` and `doc/**` are outside what the bench gate executes, and a
 * contradiction between two paragraphs is invisible to every check the repo had.
 *
 * The worst of them was live for a full session: § 0 orders a session to FILE the
 * `Nightly: main is red` card, while the rewritten feeding rule enumerated the surfaces that
 * may file "and by nothing else" — without that one. A driver obeying § 0 was violating the
 * rulebook, and a driver obeying the rulebook was leaving a red `main` unrecorded.
 *
 * These are deliberately assertions about MEANING carried by stable phrases, not about line
 * numbers, which drift on every insertion — as they did here.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const COMMAND = path.join(ROOT, '.claude', 'commands', 'next-task.md');
const RULEBOOK = path.join(ROOT, 'doc', 'kanban-workflow.md');

let command: string;
let rulebook: string;

beforeAll(() => {
  command = fs.readFileSync(COMMAND, 'utf8');
  rulebook = fs.readFileSync(RULEBOOK, 'utf8');
});

describe('the feeding rule and § 0 must not contradict each other', () => {
  it('§ 0 still tells the session to file the nightly repair card', () => {
    // The premise of the next assertion. If § 0 stops filing it, that one should change too.
    const section = command.slice(command.indexOf('## 0 ·'), command.indexOf('## 1 ·'));
    expect(section).toContain('Nightly: main is red');
    expect(section).toMatch(/otherwise file it/);
  });

  it('the feeding rule lists that filing among its sanctioned surfaces', () => {
    // The rule's list is exhaustive — it ends "and by nothing else" — so a surface that files
    // and is missing from it is a forbidden filing, not an oversight.
    const rule = rulebook.slice(rulebook.indexOf('## Feeding rule'));
    const listEnd = rule.indexOf('and by nothing');
    expect(listEnd).toBeGreaterThan(-1);
    expect(rule.slice(0, listEnd)).toContain('Nightly: main is red');
  });
});

describe('the rulebook must not describe § 5 by the job it no longer has', () => {
  it('§ 5 is "Stay on the card" — a finding met on the way is not filed', () => {
    expect(command).toContain('## 5 · Stay on the card');
  });

  it('the model-routing step table names § 5 by what it actually is', () => {
    const row = rulebook.split('\n').find((l) => l.startsWith('| § 5 '));
    expect(row).toBeDefined();
    // It must not promise a card for "a finding", which § 5 explicitly refuses to file.
    expect(row).not.toMatch(/§ 5 a finding/);
    expect(row).toMatch(/split|asked for by name/);
  });

  it('the gh cookbook does not present filing a finding as an ordinary recipe', () => {
    // The recipe is how a SANCTIONED surface files. Headed "New finding → …" it read as a
    // licence to file whatever a session noticed, which is what the feeding rule forbids.
    const cookbook = rulebook.slice(rulebook.indexOf('## gh CLI recipes'));
    expect(cookbook).not.toMatch(/^# New finding/m);
    expect(cookbook).toMatch(/SANCTIONED filing/);
  });
});

describe('no leftover rationale for filing everything', () => {
  it('does not still argue that an unfiled finding is lost', () => {
    // That sentence justified the OLD rule ("every finding lands as a card"). Left in place it
    // reads as permission to file in passing, three sections away from the rule forbidding it.
    expect(rulebook).not.toContain('is lost exactly as surely as one that was never filed');
  });
});

describe('the feeding rule and § 0.5 must not contradict each other', () => {
  it('§ 0.5 still tells the session to drain the hook-LLM harvest', () => {
    const section = command.slice(command.indexOf('## 0.5 ·'), command.indexOf('## 1 ·'));
    expect(section).toContain('hook:harvest');
    expect(section).toMatch(/card-reviewer/);
  });

  // Regression, 2026-08-28 (popup 3): § 0.5 said "file the issue (gh issue create...)" with no
  // --body-file instruction, so a session reconstructed the draft's markdown body inline as
  // `--body "..."` — multi-line quoted text the harness stops to ask about, even though
  // `gh issue create` itself is allowlisted. The fix points § 0.5 at the file-not-substitution
  // convention the intro already states; this pins that it stays pointed there.
  it('§ 0.5 files through a file, never by reconstructing the body inline', () => {
    const section = command.slice(command.indexOf('## 0.5 ·'), command.indexOf('## 1 ·'));
    expect(section).toContain('--body-file');
    // Distinguishes the actual instruction from the prose warning against it (which itself
    // quotes `--body "…"` as the anti-pattern) — only the executable shape, the command name
    // immediately followed by an inline --body, would mean the fix regressed.
    expect(section).not.toMatch(/gh issue create[^\n]*--body "/);
    expect(section).toContain('Hook hardening: <signature>');
  });

  it('the feeding rule lists that filing among its sanctioned surfaces', () => {
    const rule = rulebook.slice(rulebook.indexOf('## Feeding rule'));
    const listEnd = rule.indexOf('and by nothing');
    expect(listEnd).toBeGreaterThan(-1);
    expect(rule.slice(0, listEnd)).toContain('§ 0.5');
  });
});

describe('question (i) is not both "asked" and "not asked"', () => {
  it('§ 3 keeps the question and adds the hook, rather than replacing one with the other', () => {
    const section = command.slice(command.indexOf('## 3 ·'), command.indexOf('## 4 ·'));
    // Both statements live three lines apart; they must agree.
    expect(section).toContain('Two yes/no questions, asked before every action');
    expect(section).not.toContain('is now enforced, not asked');
    expect(section).toMatch(/enforced as well as asked/);
  });
});
