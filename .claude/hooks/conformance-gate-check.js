#!/usr/bin/env node
/**
 * Conformance gate check — used by conformance-gate.sh (PreToolUse on git
 * commit / push) and runnable by hand: `node .claude/hooks/conformance-gate-check.js`.
 *
 * Passes (exit 0) when `.conformance-gate.json` at the repo root holds a
 * `replay` and a `live` entry, both exit 0, live finished after replay, and no
 * file under src/ was modified after either run. Anything else exits 1 with the
 * reason on stderr. Pure Node, no dependencies.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || process.cwd();
const gatePath = path.join(root, '.conformance-gate.json');

function fail(msg) {
  process.stderr.write(`[conformance-gate] ${msg}\n`);
  process.exit(1);
}

function newestMtime(dir) {
  let newest = 0;
  const walk = d => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else {
        const m = fs.statSync(p).mtimeMs;
        if (m > newest) newest = m;
      }
    }
  };
  walk(dir);
  return newest;
}

if (!fs.existsSync(gatePath)) fail('no .conformance-gate.json — no validated conformance run on this machine yet');
let gate;
try { gate = JSON.parse(fs.readFileSync(gatePath, 'utf-8')); } catch (e) { fail(`unreadable gate file: ${e.message}`); }

const replay = gate.replay, live = gate.live;
if (!replay || replay.exitCode !== 0) fail('step 1 (memory socket, --transport replay) has no validated run');
if (!live || live.exitCode !== 0) fail('step 2 (live, --transport live --live) has no validated run');

const replayAt = Date.parse(replay.finishedAt), liveAt = Date.parse(live.finishedAt);
if (!(replayAt > 0) || !(liveAt > 0)) fail('gate entries carry no usable finishedAt');
if (liveAt < replayAt) fail('the live run predates the replay run — order is replay first, then live');

const srcDir = path.join(root, 'src');
if (fs.existsSync(srcDir)) {
  const changed = newestMtime(srcDir);
  if (changed > replayAt) fail(`sources changed after the replay run (${replay.finishedAt}) — re-run step 1 then step 2`);
  if (changed > liveAt) fail(`sources changed after the live run (${live.finishedAt}) — re-run step 2`);
}

process.stdout.write(`[conformance-gate] ok — replay ${replay.finishedAt} (${replay.suites}), live ${live.finishedAt} (${live.suites}, ${live.world})\n`);
process.exit(0);
