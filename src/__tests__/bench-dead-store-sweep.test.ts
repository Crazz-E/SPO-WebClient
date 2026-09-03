/**
 * scripts/bench-dead-store-sweep.js — plan action B4.5.
 *
 * Every test here builds its OWN fixture bench dir under a fresh `os.tmpdir()` subdirectory —
 * never `os.homedir()`, never `process.env.SPO_BENCH_DIR` as inherited from the environment.
 * `sweep()` is only ever called with `{ apply: true }` against a fixture this test created and
 * will remove afterwards. The real `~/.spo-bench` is never opened, read, or written by this
 * file — the dry-run report against the real corpus is produced separately, once, by hand
 * (`node scripts/bench-dead-store-sweep.js`), not from inside the Jest run.
 *
 * The acceptance criterion the plan names ("Sweep by suffix, with a test") is: this test must
 * fail if the suffix filter is dropped or widened. Three specific mutations are pinned by
 * name below, one assertion each, so a future edit that reintroduces any of them fails loudly
 * rather than merely reducing coverage:
 *   - dropping the filter (delete everything in sessions/, .finished included)
 *   - widening it to also delete .finished
 *   - making an unknown suffix delete instead of keep
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const sweepMod = require('../../scripts/bench-dead-store-sweep.js');

interface SweepEntry {
  store: string;
  relPath: string;
  action: 'delete' | 'keep';
  reason: string;
}
interface SweepPlan {
  root: string;
  entries: SweepEntry[];
  unrecognisedTopLevel: string[];
}

const {
  KNOWN_SESSION_SUFFIXES,
  looksLikeBenchDir,
  plan,
  sweep,
  pruneEmptyDirs,
  formatReport,
  parseArgv,
}: {
  KNOWN_SESSION_SUFFIXES: Record<string, 'keep' | 'delete'>;
  looksLikeBenchDir: (root: string) => boolean;
  plan: (root: string) => SweepPlan;
  sweep: (p: SweepPlan, opts?: { apply: boolean }) => Record<string, number>;
  pruneEmptyDirs: (p: SweepPlan) => void;
  formatReport: (p: SweepPlan) => string;
  parseArgv: (argv: string[]) => { benchDir?: string; apply: boolean };
} = sweepMod;

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-sweep-test-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** Builds the standard fixture: all four session suffixes, an unknown one, journals/, hook-llm/, and an unrelated store this tool must never touch. */
function buildFixture(root: string): {
  finished: string;
  alive: string;
  refusals: string;
  driving: string;
  unknown: string;
  journalFile: string;
  hookLlmJournal: string;
  hookLlmFiled: string;
  hookLlmDraft: string;
  spoolFile: string;
} {
  const sessionsDir = path.join(root, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });
  const finished = path.join(sessionsDir, 'aaaa1111.finished');
  const alive = path.join(sessionsDir, 'bbbb2222.alive');
  const refusals = path.join(sessionsDir, 'cccc3333.refusals');
  const driving = path.join(sessionsDir, 'dddd4444.driving');
  const unknown = path.join(sessionsDir, 'eeee5555.mystery');
  fs.writeFileSync(finished, 'worktree\tbranch\tsha\n');
  fs.writeFileSync(alive, String(Date.now()));
  fs.writeFileSync(refusals, '{"guard":"item-list","count":1,"timestamp":1}\n');
  fs.writeFileSync(driving, '');
  fs.writeFileSync(unknown, 'a future store nobody has written the sweep rule for yet');

  const journalsDir = path.join(root, 'journals');
  fs.mkdirSync(journalsDir, { recursive: true });
  const journalFile = path.join(journalsDir, 'ffff6666.jsonl');
  fs.writeFileSync(journalFile, '{"session_key":"x","branch":"y","timestamp":"z",{"tool":"Edit"}}\n');

  const hookLlmDir = path.join(root, 'hook-llm');
  const draftsDir = path.join(hookLlmDir, 'drafts');
  fs.mkdirSync(draftsDir, { recursive: true });
  const hookLlmJournal = path.join(hookLlmDir, 'journal.jsonl');
  const hookLlmFiled = path.join(hookLlmDir, 'filed.jsonl');
  const hookLlmDraft = path.join(draftsDir, 'shell-grep-to-native-tool.md');
  fs.writeFileSync(hookLlmJournal, '{"verdict":"error"}\n');
  fs.writeFileSync(hookLlmFiled, '{"signature":"x","state":"filed"}\n');
  fs.writeFileSync(hookLlmDraft, '# draft\n');

  // A store this tool has never heard of, sitting right next to the dead ones. Proves the
  // sweep does not wander outside KNOWN_STORES even when a plausible-looking neighbour exists.
  const spoolDir = path.join(root, 'spool');
  fs.mkdirSync(spoolDir, { recursive: true });
  const spoolFile = path.join(spoolDir, 'job-1.json');
  fs.writeFileSync(spoolFile, '{}');

  return {
    finished,
    alive,
    refusals,
    driving,
    unknown,
    journalFile,
    hookLlmJournal,
    hookLlmFiled,
    hookLlmDraft,
    spoolFile,
  };
}

describe('looksLikeBenchDir', () => {
  it('accepts a directory carrying a recognised bench marker', () => {
    fs.mkdirSync(path.join(tmpRoot, 'sessions'));
    expect(looksLikeBenchDir(tmpRoot)).toBe(true);
  });

  it('refuses a directory with no bench marker', () => {
    fs.mkdirSync(path.join(tmpRoot, 'not-a-bench-thing'));
    expect(looksLikeBenchDir(tmpRoot)).toBe(false);
  });

  it('refuses a path that does not exist', () => {
    expect(looksLikeBenchDir(path.join(tmpRoot, 'does-not-exist'))).toBe(false);
  });
});

describe('plan() — refusal', () => {
  it('throws NOT_A_BENCH_DIR instead of planning against an unrecognised path, and touches nothing', () => {
    const decoy = path.join(tmpRoot, 'decoy');
    fs.mkdirSync(decoy);
    fs.writeFileSync(path.join(decoy, 'innocent.txt'), 'hello');
    expect(() => plan(decoy)).toThrow(/does not look like a bench dir/);
    try {
      plan(decoy);
    } catch (e) {
      expect((e as { code?: string }).code).toBe('NOT_A_BENCH_DIR');
    }
    // Nothing was created, removed, or modified by the attempt.
    expect(fs.readdirSync(decoy)).toEqual(['innocent.txt']);
  });
});

describe('plan() — the allowlist', () => {
  it('classifies every KNOWN_SESSION_SUFFIXES suffix exactly as the map says, and keeps an unknown one', () => {
    const f = buildFixture(tmpRoot);
    const p = plan(tmpRoot);
    const byPath = new Map(p.entries.map(e => [path.join(p.root, e.store, e.relPath), e]));

    expect(byPath.get(f.finished)?.action).toBe('keep');
    expect(byPath.get(f.alive)?.action).toBe('delete');
    expect(byPath.get(f.refusals)?.action).toBe('delete');
    expect(byPath.get(f.driving)?.action).toBe('delete');
    expect(byPath.get(f.unknown)?.action).toBe('keep');
    expect(byPath.get(f.unknown)?.reason).toMatch(/unknown suffix/);

    // journals/ and hook-llm/: every file, delete.
    expect(byPath.get(f.journalFile)?.action).toBe('delete');
    expect(byPath.get(f.hookLlmJournal)?.action).toBe('delete');
    expect(byPath.get(f.hookLlmFiled)?.action).toBe('delete');
    expect(byPath.get(f.hookLlmDraft)?.action).toBe('delete');

    // spool/ is not a KNOWN_STORES name — it must not appear in entries at all.
    const storesPlanned = new Set(p.entries.map(e => e.store));
    expect(storesPlanned.has('spool')).toBe(false);
    expect(p.unrecognisedTopLevel).toContain('spool');
  });

  it('the KNOWN_SESSION_SUFFIXES table itself keeps finished=keep and the other three=delete (documents the acceptance criterion)', () => {
    expect(KNOWN_SESSION_SUFFIXES.finished).toBe('keep');
    expect(KNOWN_SESSION_SUFFIXES.alive).toBe('delete');
    expect(KNOWN_SESSION_SUFFIXES.refusals).toBe('delete');
    expect(KNOWN_SESSION_SUFFIXES.driving).toBe('delete');
  });
});

describe('sweep() — dry-run is the default, deletion requires apply:true', () => {
  it('plan() alone never deletes anything, no matter how many times it runs', () => {
    const f = buildFixture(tmpRoot);
    plan(tmpRoot);
    plan(tmpRoot);
    plan(tmpRoot);
    expect(fs.existsSync(f.alive)).toBe(true);
    expect(fs.existsSync(f.finished)).toBe(true);
  });

  it('sweep(plan) with no options is a dry-run: nothing on disk changes', () => {
    const f = buildFixture(tmpRoot);
    const p = plan(tmpRoot);
    sweep(p); // no { apply: true }
    expect(fs.existsSync(f.alive)).toBe(true);
    expect(fs.existsSync(f.refusals)).toBe(true);
    expect(fs.existsSync(f.driving)).toBe(true);
    expect(fs.existsSync(f.journalFile)).toBe(true);
    expect(fs.existsSync(f.hookLlmJournal)).toBe(true);
  });

  it('sweep(plan, { apply: true }) deletes exactly the delete-planned files and nothing else', () => {
    const f = buildFixture(tmpRoot);
    const p = plan(tmpRoot);
    sweep(p, { apply: true });
    pruneEmptyDirs(p);

    // dead — gone
    expect(fs.existsSync(f.alive)).toBe(false);
    expect(fs.existsSync(f.refusals)).toBe(false);
    expect(fs.existsSync(f.driving)).toBe(false);
    expect(fs.existsSync(f.journalFile)).toBe(false);
    expect(fs.existsSync(f.hookLlmJournal)).toBe(false);
    expect(fs.existsSync(f.hookLlmFiled)).toBe(false);
    expect(fs.existsSync(f.hookLlmDraft)).toBe(false);

    // survives — the live guard and the unknown suffix
    expect(fs.existsSync(f.finished)).toBe(true);
    expect(fs.existsSync(f.unknown)).toBe(true);

    // untouched — not a known store
    expect(fs.existsSync(f.spoolFile)).toBe(true);

    // the now-empty dead directories are pruned away; sessions/ (still holding files) is not.
    expect(fs.existsSync(path.join(tmpRoot, 'journals'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'hook-llm'))).toBe(false);
    expect(fs.existsSync(path.join(tmpRoot, 'sessions'))).toBe(true);

    // sessions/ keeps EXACTLY the two survivors — the double-claim guard and the
    // unrecognised suffix — nothing more, nothing less.
    const survivors = fs.readdirSync(path.join(tmpRoot, 'sessions')).sort();
    expect(survivors).toEqual(
      [path.basename(f.finished), path.basename(f.unknown)].sort()
    );
  });
});

describe('the plan\'s own acceptance criterion — pinned mutations', () => {
  // These three tests describe, in prose, the exact regressions "fails if the suffix filter
  // is dropped or widened" refers to. They pass against the current code. Flipping the
  // production behaviour they name is measured separately (see the report) by editing
  // scripts/bench-dead-store-sweep.js and re-running this file — each one is expected to go
  // red on its own mutation.

  it('would fail if the filter were dropped (deleting every sessions/ file, .finished included)', () => {
    const f = buildFixture(tmpRoot);
    const p = plan(tmpRoot);
    sweep(p, { apply: true });
    // This is the guard finish.sh writes and board-take.sh reads to refuse a double claim.
    // A sweep that stopped filtering by suffix (rm -rf sessions/*) deletes it — this line is
    // exactly what would go red.
    expect(fs.existsSync(f.finished)).toBe(true);
  });

  it('would fail if the filter were widened to also delete .finished', () => {
    const f = buildFixture(tmpRoot);
    const p = plan(tmpRoot);
    const entry = p.entries.find(e => e.relPath === path.basename(f.finished));
    expect(entry?.action).toBe('keep');
  });

  it('would fail if an unknown suffix were deleted instead of kept', () => {
    const f = buildFixture(tmpRoot);
    const p = plan(tmpRoot);
    const entry = p.entries.find(e => e.relPath === path.basename(f.unknown));
    expect(entry?.action).toBe('keep');
    sweep(p, { apply: true });
    expect(fs.existsSync(f.unknown)).toBe(true);
  });
});

describe('CLI argument parsing', () => {
  it('defaults to no --delete (dry-run) and no --bench-dir override', () => {
    expect(parseArgv([])).toEqual({ benchDir: undefined, apply: false });
  });

  it('only --delete turns on apply', () => {
    expect(parseArgv(['--delete']).apply).toBe(true);
  });

  it('--bench-dir sets an explicit root without implying --delete', () => {
    const opts = parseArgv(['--bench-dir', '/tmp/whatever']);
    expect(opts.benchDir).toBe('/tmp/whatever');
    expect(opts.apply).toBe(false);
  });

  it('rejects an unknown flag rather than silently ignoring it', () => {
    expect(() => parseArgv(['--wipe-everything'])).toThrow(/unknown argument/);
  });
});

describe('formatReport()', () => {
  it('names every store, the delete/keep suffix breakdown, and the untouched top-level entries', () => {
    buildFixture(tmpRoot);
    const p = plan(tmpRoot);
    const report = formatReport(p);
    expect(report).toContain('sessions/');
    expect(report).toContain('journals/');
    expect(report).toContain('hook-llm/');
    expect(report).toContain('DELETE  .alive');
    expect(report).toContain('KEEP    .finished');
    expect(report).toMatch(/KEEP\s+\.mystery/);
    expect(report).toContain('spool');
  });
});
