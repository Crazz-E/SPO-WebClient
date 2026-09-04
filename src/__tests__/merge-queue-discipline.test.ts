/**
 * `main` sits behind a merge queue, and that turns `gh pr merge` into a command whose output
 * lies in both directions. Every invocation — the correct one included — prints
 * `! The merge strategy for main is set by the merge queue` on stderr and exits 0, because the
 * queue owns the strategy (`merge_method: MERGE`) and overrides the flag you passed. A reader
 * who takes that warning for a failure "recovers" an entry that was never broken; a reader who
 * passes `--delete-branch` destroys an entry that was fine. Both happened here.
 *
 * So this file pins the two halves the repository must keep saying: the warning is benign and
 * the verdict is the exit code plus the PR state, and no command file may teach
 * `--delete-branch` into a queue again — `/commit-push` carried that instruction, unnoticed,
 * for as long as the queue has existed.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = process.cwd();
const read = (...p: string[]): string => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Prose is hard-wrapped at ~95 columns; sentence assertions run against the collapsed copy. */
const collapse = (text: string): string => text.replace(/\s+/g, ' ');

describe('the merge-queue warning is documented as benign, with a verdict that is not stderr', () => {
  it('bench-worker.md says the correct form prints it too, and names what to judge on', () => {
    const benchWorker = collapse(read('doc', 'bench-worker.md'));
    expect(benchWorker).toMatch(/the correct form included — prints one stderr warning/);
    expect(benchWorker).toMatch(/\*\*expected and benign\*\*, not a failure/);
    expect(benchWorker).toMatch(/exit code and the PR state, never on stderr text/);
    // The flag override is why the line exists at all — without it the warning reads arbitrary.
    expect(benchWorker).toMatch(/\*\*overridden, not refused\*\*/);
  });

  it('CLAUDE.md still carries the short form and points at bench-worker.md §12', () => {
    const claudeMd = collapse(read('CLAUDE.md'));
    expect(claudeMd).toMatch(/--merge` \*\*enqueues\*\*/);
    expect(claudeMd).toMatch(/Never add `--delete-branch`/);
    expect(claudeMd).toMatch(/bench-worker\.md §12/);
  });

  it('bench-worker.md warns the trap runs in both directions', () => {
    const benchWorker = collapse(read('doc', 'bench-worker.md'));
    expect(benchWorker).toMatch(/The warning is not the tell, in either direction/);
    // The discriminator must stay one REST call, never a poll (§ GitHub API discipline).
    expect(benchWorker).toMatch(/gh api repos\/Crazz-Org\/SPO-WebClient\/pulls\/<N>/);
  });
});

describe('no command file teaches a flag that destroys the queue entry', () => {
  const commandFiles = ['commit-push.md', 'gate.md', 'triage-report.md'];

  it.each(commandFiles)('%s never pairs gh pr merge with --delete-branch', (file) => {
    const text = read('.claude', 'commands', file);
    for (const line of text.split('\n')) {
      if (line.includes('gh pr merge')) expect(line).not.toMatch(/--delete-branch/);
    }
    // `--delete-branch` has no legitimate use here at all: GitHub deletes the branch itself.
    expect(collapse(text)).not.toMatch(/gh pr merge <n> --squash/);
  });

  it('/commit-push enqueues with --merge and calls the warning expected', () => {
    const commitPush = collapse(read('.claude', 'commands', 'commit-push.md'));
    expect(commitPush).toMatch(/`gh pr merge <n> --merge`, nothing else/);
    expect(commitPush).toMatch(/Never\s*\*\*`--delete-branch`\*\*|\*\*Never\s*`--delete-branch`\*\*/);
    expect(commitPush).toMatch(/expected and benign/);
  });

  it('deps-gate arms auto-merge with the strategy the queue actually uses', () => {
    const depsGate = read('scripts', 'deps-gate.sh');
    expect(depsGate).toMatch(/gh pr merge "\$n" --merge --auto/);
    // Prose may name the flags it forbids; no *command* line may carry them.
    for (const line of depsGate.split('\n')) {
      if (line.includes('gh pr merge') && !line.trimStart().startsWith('#')) {
        expect(line).not.toMatch(/--squash|--delete-branch/);
      }
    }
  });
});
