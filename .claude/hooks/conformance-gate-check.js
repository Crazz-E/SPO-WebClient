#!/usr/bin/env node
/**
 * Conformance gate check — used by conformance-gate.sh (PreToolUse on git
 * commit / push) and runnable by hand:
 *
 *   node .claude/hooks/conformance-gate-check.js [root] [commit|push]
 *
 * ## What changed on 2026-08-18
 *
 * The gate now fires **only when the operation touches the RDO surface**
 * (`rdo-surface.json`). A commit of documentation, client code or unrelated
 * tests passes without any conformance run. Two defects are gone with it:
 *
 * - it used to gate *every* commit, so certification was a toll rather than a
 *   signal;
 * - it dated freshness from the newest mtime anywhere under `src/`, so writing
 *   a `.md` there threw away a certification that had already been paid for.
 *
 * When the surface IS touched, the rule is unchanged: `.conformance-gate.json`
 * must hold a `replay` and a `live` entry, both exit 0, live after replay, and
 * neither older than the surface files themselves.
 *
 * Pure Node, no dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { loadSurface, classify, changedFiles, newestSurfaceMtime } = require('./rdo-surface');

const root = process.argv[2] || process.cwd();
const mode = process.argv[3] === 'push' ? 'push' : 'commit';

function fail(msg) {
  process.stderr.write(`[conformance-gate] ${msg}\n`);
  process.exit(1);
}
function pass(msg) {
  process.stdout.write(`[conformance-gate] ${msg}\n`);
  process.exit(0);
}

let surface;
try {
  surface = loadSurface(__dirname);
} catch (e) {
  // A surface we cannot read must not silently disarm the gate.
  fail(`cannot read the RDO surface: ${e.message}`);
}

// ── 1. Does this operation touch RDO at all? ───────────────────────────────

const files = changedFiles(root, mode);

if (files === null) {
  process.stderr.write(
    '[conformance-gate] no upstream and no origin/main — cannot tell what this push contains, ' +
    'so it is treated as touching RDO.\n'
  );
} else {
  const { tier1, tier2, touched } = classify(files, surface);
  if (!touched) {
    pass(`no RDO file touched by this ${mode} (${files.length} changed) — certification not required`);
  }
  const shown = [...tier1, ...tier2].slice(0, 6).join(', ');
  const more = tier1.length + tier2.length - 6;
  process.stdout.write(
    `[conformance-gate] RDO surface touched: ${shown}${more > 0 ? ` (+${more})` : ''}\n` +
    (tier1.length ? `[conformance-gate] tier 1 — these change every frame on the wire\n` : '')
  );
}

// ── 2. It does. Require a certification that is both green and current. ────

const gatePath = path.join(root, '.conformance-gate.json');
if (!fs.existsSync(gatePath)) fail('RDO was touched but no .conformance-gate.json — no validated conformance run on this machine yet');

let gate;
try { gate = JSON.parse(fs.readFileSync(gatePath, 'utf-8')); } catch (e) { fail(`unreadable gate file: ${e.message}`); }

const replay = gate.replay, live = gate.live;
if (!replay || replay.exitCode !== 0) fail('step 1 (memory socket, --transport replay) has no validated run');
if (!live || live.exitCode !== 0) fail('step 2 (live, --transport live --live) has no validated run');

// A replay that skipped --diff-baseline exits 0 for the trivial reason that
// nothing was compared. Before 2026-08-18 that validated the gate, which then
// reported a green step 1 whose byte comparison had never run. Entries written
// before the fix carry no field, read as false, and are correctly rejected.
if (replay.baselineDiffed !== true) {
  fail('step 1 ran without --diff-baseline — the byte comparison is the point of the replay step; re-run it with a baseline');
}

const replayAt = Date.parse(replay.finishedAt), liveAt = Date.parse(live.finishedAt);
if (!(replayAt > 0) || !(liveAt > 0)) fail('gate entries carry no usable finishedAt');
if (liveAt < replayAt) fail('the live run predates the replay run — order is replay first, then live');

const changed = newestSurfaceMtime(root, surface);
if (changed > replayAt) fail(`the RDO surface changed after the replay run (${replay.finishedAt}) — re-run step 1 then step 2`);
if (changed > liveAt) fail(`the RDO surface changed after the live run (${live.finishedAt}) — re-run step 2`);

pass(`ok — replay ${replay.finishedAt} (${replay.suites}), live ${live.finishedAt} (${live.suites}, ${live.world})`);
