#!/usr/bin/env node

/**
 * The dead-store sweep — plan action B4.5 (SPO-Pipeline doc/bench-plan-derived-2026-09-02.md
 * row 4.5).
 *
 * `~/.spo-bench/` accumulated three stores that a retired hook layer wrote and nobody reads
 * any more, confirmed by grepping every reader/writer out of existence at the commits that
 * retired them (#425 "chore(pilot): retire the anti-drift hooks", #441 "chore(pilot): retire
 * the /next-task driver and its dead machinery"):
 *
 *   sessions/*.alive      session-heartbeat.sh wrote it; heartbeat-scan.sh and claim-read.sh's
 *                         old heartbeat check read it. Both readers are gone (session-marker.sh
 *                         says so directly: "Its writer went with the pilot hook layer in #425
 *                         and both readers were removed in #441").
 *   sessions/*.refusals   refusal-ledger.js wrote it for the guards that used to escalate after
 *                         three variants; those guards are gone (#425).
 *   sessions/*.driving    driver-scope.sh (now session-marker.sh) armed it for
 *                         driver-scope-guard.sh; the guard is gone (#425), and #441 rewrote
 *                         driver-scope.sh into session-marker.sh specifically to stop writing
 *                         and deleting a marker with no reader on every real orchestrator run.
 *   journals/*.jsonl      journal-writes.sh wrote it (two concatenated printf calls that never
 *                         produced valid JSON — the second printf's `%s}` splices a bare object
 *                         after a dangling `,` with no key). No reader was ever built for it.
 *                         The writer is gone (#441).
 *   hook-llm/**           uncovered-command-guard.sh wrote journal.jsonl; hook-llm-harvest.js
 *                         (filed.jsonl, drafts/*.md) and hook-llm-stats.js read it. Writer and
 *                         both readers are gone (#441, same commit that removed the harvest and
 *                         stats scripts because "its only writer ... was deleted with the pilot
 *                         hooks in #425").
 *
 * One store in `sessions/` is NOT dead: `sessions/*.finished` is written by finish.sh (the
 * retirement marker `forget_session_files`/the retire branch near finish.sh:276) and read by
 * board-take.sh's `session_marker finished` call (board-take.sh:111, via session-marker.sh) —
 * the double-claim guard that refuses a second card in a worktree `npm run finish` already
 * retired. A blanket `rm -rf sessions/` would delete it. Sweeping BY SUFFIX, never by
 * directory, is what keeps that guard alive while the dead 94% of the same directory goes.
 *
 * DESIGN — allowlist, not denylist.
 *
 * KNOWN_STORES below is the only source of truth for what this tool will ever touch. A
 * directory or a `sessions/` suffix not named in it is left alone and reported as unknown —
 * never deleted, however confidently it looks like one of the four already known. That is
 * deliberate: a sweep written before some future suffix existed must not delete it by default.
 * Widening KNOWN_STORES to a new store is a reviewed, one-line, self-documenting change; the
 * default for everything else stays KEEP.
 *
 * DRY-RUN BY DEFAULT. `plan()` never touches the filesystem beyond reading it. `sweep()` only
 * deletes when called with `{ apply: true }`, and the CLI only ever passes `apply: true` when
 * `--delete` was given on the command line. Every other path — no flag, an unrecognised flag,
 * a bench dir that fails `looksLikeBenchDir` — reports and deletes nothing.
 *
 *   node scripts/bench-dead-store-sweep.js                     dry-run report against
 *                                                                $SPO_BENCH_DIR or ~/.spo-bench
 *   node scripts/bench-dead-store-sweep.js --bench-dir <path>   dry-run report against <path>
 *   node scripts/bench-dead-store-sweep.js --delete             ACTUALLY DELETE (still refuses
 *                                                                a path that fails the bench-dir
 *                                                                check)
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * `sessions/` is a flat directory of `<sha1-key>.<suffix>` files (session-marker.sh). Every
 * suffix this tool will ever act on is named here, with the action a reviewed audit assigned
 * it. Anything else found in `sessions/` is reported and kept — see `planSessionsStore`.
 */
const KNOWN_SESSION_SUFFIXES = Object.freeze({
  finished: 'keep', // finish.sh writes it, board-take.sh reads it — the double-claim guard.
  alive: 'delete', // dead: writer and both readers retired (#425 / #441).
  refusals: 'delete', // dead: writer (refusal-ledger.js) retired with its guards (#425).
  driving: 'delete', // dead: writer and reader (driver-scope-guard.sh) retired (#425 / #441).
});

/**
 * Top-level stores under the bench root this tool knows about. `sessions` is swept file-by-file
 * by suffix (see KNOWN_SESSION_SUFFIXES); `journals` and `hook-llm` are named, single-purpose
 * directories this audit found to have no reader at all, for any file they contain — so every
 * file under either is `delete`, recursively. Any OTHER top-level entry under the bench root
 * (spool, running, done, verdicts, world, cache, nightly, ref, heartbeat, worker.json, logs,
 * ...) is never even listed: it is not a name this tool recognises, so it is not this tool's
 * business, dry-run or not.
 */
const KNOWN_STORES = Object.freeze({
  sessions: { kind: 'suffix', suffixes: KNOWN_SESSION_SUFFIXES },
  journals: { kind: 'directory-delete-all' },
  'hook-llm': { kind: 'directory-delete-all' },
});

/**
 * Markers that make a directory recognisable as a `.spo-bench`-shaped root, so the tool can
 * refuse to run against an arbitrary path (an empty dir, a source checkout, `$HOME` itself).
 * Deliberately broader than KNOWN_STORES: a bench dir that happens to have none of `sessions`,
 * `journals` or `hook-llm` yet (freshly installed) should still be recognisable via the other
 * directories the worker and gate write (see src/e2e/bench/paths.ts).
 */
const BENCH_DIR_MARKERS = Object.freeze([
  'sessions',
  'journals',
  'hook-llm',
  'spool',
  'running',
  'done',
  'verdicts',
  'world',
  'cache',
  'nightly',
  'heartbeat',
  'worker.json',
]);

function defaultBenchRoot() {
  return process.env.SPO_BENCH_DIR || path.join(os.homedir(), '.spo-bench');
}

/**
 * Refuses anything this tool cannot positively identify as a bench dir. A missing path, a
 * path that is not a directory, or a directory with none of BENCH_DIR_MARKERS all return
 * false — the caller must not sweep (or even list) such a path.
 */
function looksLikeBenchDir(root) {
  let entries;
  try {
    entries = fs.readdirSync(root);
  } catch {
    return false;
  }
  return entries.some(name => BENCH_DIR_MARKERS.includes(name));
}

function suffixOf(basename) {
  const dot = basename.lastIndexOf('.');
  return dot > 0 ? basename.slice(dot + 1) : '';
}

/** Every regular file directly inside `dir`, recursively, as paths relative to `dir`. */
function listFilesRecursive(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(abs).map(rel => path.join(entry.name, rel)));
    } else if (entry.isFile()) {
      out.push(entry.name);
    }
    // Symlinks and other special files: neither planned for delete nor for keep — they are
    // simply not visited, which is the same as "unknown" for anything downstream.
  }
  return out;
}

/**
 * Plans the `sessions/` store: one entry per file directly inside it, `action` decided
 * ONLY by KNOWN_SESSION_SUFFIXES. A suffix not in that map is `keep` with reason
 * 'unknown suffix' — never inferred, never swept.
 */
function planSessionsStore(storeDir, suffixes) {
  const entries = [];
  let names;
  try {
    names = fs.readdirSync(storeDir, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const d of names) {
    if (!d.isFile()) {
      // A subdirectory (or anything else) under sessions/ is not a shape this store's
      // suffix policy was written for — keep it and say why, rather than guess.
      entries.push({
        store: 'sessions',
        relPath: d.name,
        action: 'keep',
        reason: d.isDirectory() ? 'not a file (directory) — unrecognised shape' : 'not a regular file — unrecognised shape',
      });
      continue;
    }
    const suffix = suffixOf(d.name);
    const known = Object.prototype.hasOwnProperty.call(suffixes, suffix);
    const action = known ? suffixes[suffix] : 'keep';
    const reason = known
      ? (action === 'delete' ? `dead store (.${suffix})` : `live store (.${suffix}) — must survive`)
      : `unknown suffix (.${suffix || '<none>'}) — kept, not swept`;
    entries.push({ store: 'sessions', relPath: d.name, action, reason });
  }
  return entries;
}

/** Plans a whole-directory-dead store (journals/, hook-llm/): every file inside is `delete`. */
function planDirectoryDeleteAllStore(storeName, storeDir) {
  return listFilesRecursive(storeDir).map(relPath => ({
    store: storeName,
    relPath,
    action: 'delete',
    reason: `${storeName}/ has no reader (audit: B4.5) — entire store is dead`,
  }));
}

/**
 * Builds the sweep plan for `root`. Never writes or deletes anything. Throws if `root` does
 * not look like a bench dir — the caller (CLI) turns that into a refusal, not a sweep of
 * whatever happened to be at that path.
 */
function plan(root = defaultBenchRoot()) {
  if (!looksLikeBenchDir(root)) {
    const err = new Error(
      `refusing to sweep '${root}': it does not look like a bench dir (no marker of ` +
        `${JSON.stringify(BENCH_DIR_MARKERS)} found there). Nothing was read or planned.`
    );
    err.code = 'NOT_A_BENCH_DIR';
    throw err;
  }

  const entries = [];
  const knownStoreNames = Object.keys(KNOWN_STORES);
  for (const storeName of knownStoreNames) {
    const storeDir = path.join(root, storeName);
    if (!fs.existsSync(storeDir)) continue;
    const store = KNOWN_STORES[storeName];
    if (store.kind === 'suffix') {
      entries.push(...planSessionsStore(storeDir, store.suffixes));
    } else if (store.kind === 'directory-delete-all') {
      entries.push(...planDirectoryDeleteAllStore(storeName, storeDir));
    }
  }

  let unrecognisedTopLevel = [];
  try {
    unrecognisedTopLevel = fs
      .readdirSync(root)
      .filter(name => !knownStoreNames.includes(name));
  } catch {
    // already proven readable by looksLikeBenchDir; ignore a race
  }

  return { root, entries, unrecognisedTopLevel };
}

/**
 * Applies a plan. Read-only (a no-op besides logging) unless `apply` is true — the ONLY path
 * that ever calls fs.unlinkSync. Returns per-store, per-action counts.
 */
function sweep(sweepPlan, { apply = false } = {}) {
  const counts = {};
  for (const entry of sweepPlan.entries) {
    const key = `${entry.store}:${entry.action}`;
    counts[key] = (counts[key] || 0) + 1;
    if (apply && entry.action === 'delete') {
      const abs = path.join(sweepPlan.root, entry.store, entry.relPath);
      fs.unlinkSync(abs);
    }
  }
  return counts;
}

/** Removes now-empty directories left behind by a directory-delete-all store (journals/, hook-llm/, its drafts/ subdir). Never removes `sessions/` — that store keeps files. */
function pruneEmptyDirs(sweepPlan) {
  for (const storeName of Object.keys(KNOWN_STORES)) {
    if (KNOWN_STORES[storeName].kind !== 'directory-delete-all') continue;
    const storeDir = path.join(sweepPlan.root, storeName);
    removeEmptyDirRecursive(storeDir);
  }
}

function removeEmptyDirRecursive(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) removeEmptyDirRecursive(path.join(dir, entry.name));
  }
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch {
    // not empty (something we didn't plan for landed there since) or already gone — leave it
  }
}

function formatReport(sweepPlan) {
  const lines = [];
  lines.push(`bench dir: ${sweepPlan.root}`);
  const byStore = {};
  for (const e of sweepPlan.entries) {
    (byStore[e.store] = byStore[e.store] || []).push(e);
  }
  for (const storeName of Object.keys(KNOWN_STORES)) {
    const es = byStore[storeName] || [];
    if (es.length === 0) continue;
    const del = es.filter(e => e.action === 'delete');
    const keep = es.filter(e => e.action === 'keep');
    lines.push(`\n${storeName}/  (${es.length} files: ${del.length} to delete, ${keep.length} to keep)`);
    const bySuffixDel = countBy(del, e => suffixOf(e.relPath) || '<none>');
    const bySuffixKeep = countBy(keep, e => suffixOf(e.relPath) || '<none>');
    for (const [suffix, n] of Object.entries(bySuffixDel)) {
      lines.push(`  DELETE  .${suffix}  x${n}`);
    }
    for (const [suffix, n] of Object.entries(bySuffixKeep)) {
      const sample = keep.find(e => (suffixOf(e.relPath) || '<none>') === suffix);
      lines.push(`  KEEP    .${suffix}  x${n}  (${sample.reason})`);
    }
  }
  if (sweepPlan.unrecognisedTopLevel.length > 0) {
    lines.push(`\nnot touched (unrecognised top-level entries, out of scope for this sweep):`);
    for (const name of sweepPlan.unrecognisedTopLevel.sort()) lines.push(`  ${name}`);
  }
  const totalDelete = sweepPlan.entries.filter(e => e.action === 'delete').length;
  const totalKeep = sweepPlan.entries.filter(e => e.action === 'keep').length;
  lines.push(`\ntotal: ${totalDelete} to delete, ${totalKeep} to keep`);
  return lines.join('\n');
}

function countBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function parseArgv(argv) {
  let benchDir;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--delete') {
      apply = true;
    } else if (a === '--bench-dir') {
      benchDir = argv[++i];
    } else {
      throw new Error(`unknown argument '${a}'`);
    }
  }
  return { benchDir, apply };
}

function main(argv = process.argv.slice(2), out = process.stdout, err = process.stderr) {
  let opts;
  try {
    opts = parseArgv(argv);
  } catch (e) {
    err.write(`${e.message}\n`);
    return 2;
  }

  const root = opts.benchDir || defaultBenchRoot();
  let sweepPlan;
  try {
    sweepPlan = plan(root);
  } catch (e) {
    err.write(`${e.message}\n`);
    return 1;
  }

  out.write(`${formatReport(sweepPlan)}\n`);
  if (opts.apply) {
    const counts = sweep(sweepPlan, { apply: true });
    pruneEmptyDirs(sweepPlan);
    out.write(`\nDELETED. ${JSON.stringify(counts)}\n`);
  } else {
    out.write(`\nDRY RUN — nothing deleted. Pass --delete to actually remove the files above.\n`);
  }
  return 0;
}

module.exports = {
  KNOWN_SESSION_SUFFIXES,
  KNOWN_STORES,
  BENCH_DIR_MARKERS,
  looksLikeBenchDir,
  suffixOf,
  plan,
  sweep,
  pruneEmptyDirs,
  formatReport,
  parseArgv,
  main,
  defaultBenchRoot,
};

if (require.main === module) {
  process.exit(main());
}
