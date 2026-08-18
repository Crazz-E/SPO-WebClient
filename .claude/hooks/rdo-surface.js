'use strict';
/**
 * The RDO surface — which changed files require a fresh certification.
 *
 * The conformance gate used to fire on EVERY `git commit`, and to decide
 * freshness from the newest mtime under all of `src/`. Both were wrong: a
 * README under `src/` cost a live run, and a change to the client cost the same
 * as a change to the frame constructor. This module answers the only question
 * that matters — **did this commit touch something that can alter a frame?**
 *
 * Plain CommonJS, no dependencies: it is loaded by a git hook, not by the app.
 * The surface itself lives in `rdo-surface.json` so it can be audited and edited
 * without touching this logic.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SURFACE_FILE = 'rdo-surface.json';

/** Load the declared surface. Throws with a usable message — a silent empty surface would disarm the gate. */
function loadSurface(hooksDir) {
  const p = path.join(hooksDir || __dirname, SURFACE_FILE);
  const raw = fs.readFileSync(p, 'utf-8');
  const surface = JSON.parse(raw);
  if (!Array.isArray(surface.tier1) || !Array.isArray(surface.tier2)) {
    throw new Error(`${SURFACE_FILE}: tier1 and tier2 must both be arrays`);
  }
  return surface;
}

/** Git reports POSIX separators; Windows callers may not. Compare on one form. */
function normalise(file) {
  return String(file).replace(/\\/g, '/').replace(/^\.\//, '');
}

function isExcluded(file, surface) {
  return (surface.exclude || []).some(rule =>
    (rule.suffix && file.endsWith(rule.suffix)) ||
    (rule.prefix && file.startsWith(rule.prefix)) ||
    (rule.path && file === rule.path)
  );
}

/**
 * Classify one path. Exclusions win over tier2 but NOT over tier1: a file named
 * explicitly in tier1 is load-bearing whatever its extension.
 */
function classifyFile(file, surface) {
  const f = normalise(file);
  if (surface.tier1.some(r => f === r.path)) return 'tier1';
  if (isExcluded(f, surface)) return null;
  if (surface.tier2.some(r => (r.prefix && f.startsWith(r.prefix)) || (r.path && f === r.path))) return 'tier2';
  return null;
}

/**
 * Split a file list into what the gate cares about.
 * `touched` is the decision: false means the commit may pass without certification.
 */
function classify(files, surface) {
  const tier1 = [], tier2 = [], ignored = [];
  for (const file of files) {
    const tier = classifyFile(file, surface);
    if (tier === 'tier1') tier1.push(normalise(file));
    else if (tier === 'tier2') tier2.push(normalise(file));
    else ignored.push(normalise(file));
  }
  return { tier1, tier2, ignored, touched: tier1.length > 0 || tier2.length > 0 };
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

function lines(out) {
  return out ? out.split('\n').map(s => s.trim()).filter(Boolean) : [];
}

/**
 * What this git operation is about to put in the repository.
 *
 * - `commit`: everything not yet committed — staged, unstaged and untracked.
 * - `push`: what the upstream does not have yet. With no upstream we cannot
 *   know, so we report `null` and the caller treats it as "assume RDO touched".
 *   Failing open there would let an uncertified push through, which is the one
 *   outcome this gate exists to prevent.
 */
function changedFiles(root, mode) {
  if (mode === 'push') {
    const upstream = git(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    if (upstream) return lines(git(root, ['diff', '--name-only', '@{u}..HEAD']));
    if (git(root, ['rev-parse', '--verify', 'origin/main'])) {
      return lines(git(root, ['diff', '--name-only', 'origin/main..HEAD']));
    }
    return null;
  }
  return [
    ...lines(git(root, ['diff', '--name-only', 'HEAD'])),
    ...lines(git(root, ['ls-files', '--others', '--exclude-standard'])),
  ];
}

/**
 * Newest mtime among the surface files that exist on disk.
 *
 * This replaces the old "newest mtime anywhere under src/". That version made
 * any write under `src/` — a `.md` included — invalidate a paid certification.
 */
function newestSurfaceMtime(root, surface) {
  let newest = 0;
  const consider = p => {
    try {
      const m = fs.statSync(p).mtimeMs;
      if (m > newest) newest = m;
    } catch { /* absent: nothing to date */ }
  };
  const walk = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (classifyFile(path.relative(root, p), surface)) consider(p);
    }
  };
  for (const r of surface.tier1) consider(path.join(root, r.path));
  for (const r of surface.tier2) {
    const target = path.join(root, r.prefix || r.path || '');
    let stat = null;
    try { stat = fs.statSync(target); } catch { continue; }
    if (stat.isDirectory()) walk(target);
    else if (classifyFile(path.relative(root, target), surface)) consider(target);
  }
  return newest;
}

module.exports = {
  loadSurface, classify, classifyFile, changedFiles, newestSurfaceMtime, normalise,
};
