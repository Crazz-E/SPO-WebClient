#!/usr/bin/env node

/**
 * The three rules the repository states but nothing enforced — made mechanical.
 *
 * CLAUDE.md, CONTRIBUTING.md and the pull-request template all present these as binding.
 * They were not: `.github/CODEOWNERS` names an owner for the protected files, but the
 * `main` ruleset carries `require_code_owner_review: false` and requires zero approving
 * reviews, so the only barrier left was a checkbox ticked by whoever wrote the diff.
 *
 *   1. Protected files       — changing one needs the `rdo-approved` label, which only a
 *                              human can post. The author cannot grant it to themselves.
 *   2. Coverage ratchet      — "thresholds only go UP" is a numeric comparison between
 *                              jest.config.js on the base and on this branch.
 *   3. RDO catalogue         — adding to the catalogue needs the server declaration cited
 *                              as `File.pas:Line`; the PR body must carry at least one.
 *
 * Runs as a step of the `typecheck + tests` job, which is a required status check — so it
 * blocks a merge without any ruleset change. Skipped outside a pull request, where there
 * is no body and no label to read.
 *
 *   PR_BODY=… PR_LABELS='["rdo-approved"]' BASE_SHA=… node scripts/check-pr-rules.js
 *
 * Exit 0 when every rule holds, 1 on the first-class failure of any of them.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Frozen: the wire itself and the machine floor. `rdo-members.ts` is deliberately NOT
 * here — it is a census that grows every time the client emits a new member, and CLAUDE.md
 * documents that growth as normal work. What it needs is the citation (rule 3), not a
 * human unlock on every entry.
 */
const PROTECTED_FILES = [
  'src/shared/rdo-types.ts',
  'src/shared/rdo-frame.ts',
  'src/server/rdo.ts',
  'jest.config.js',
];
const PROTECTED_PREFIXES = [];
const APPROVAL_LABEL = 'rdo-approved';

/** Touching the catalogue means citing the declaration that fixes a member's kind and arity. */
const CITATION_FILES = ['src/shared/rdo-members.ts'];
const CITATION_PATTERN = /\b[\w.-]+\.pas:\d+/i;

const THRESHOLD_METRICS = ['lines', 'functions', 'branches', 'statements'];

function normalise(file) {
  return String(file).replace(/\\/g, '/').trim();
}

/** Which of the frozen paths this change touches. */
function protectedTouched(files) {
  return files
    .map(normalise)
    .filter(f => PROTECTED_FILES.includes(f));
}

/**
 * A label list may arrive as the JSON array GitHub Actions produces, or as a plain
 * comma-separated string when a human runs the script by hand.
 */
function parseLabels(raw) {
  const text = (raw ?? '').trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(l => String(l.name ?? l).trim()) : [];
    } catch {
      return [];
    }
  }
  return text.split(',').map(l => l.trim()).filter(Boolean);
}

function checkProtectedPaths(files, labels) {
  const touched = protectedTouched(files);
  if (touched.length === 0) return { ok: true, detail: 'no protected file touched' };
  if (labels.includes(APPROVAL_LABEL)) {
    return { ok: true, detail: `${touched.length} protected file(s), unlocked by \`${APPROVAL_LABEL}\`` };
  }
  return {
    ok: false,
    detail:
      `protected file(s) changed without the \`${APPROVAL_LABEL}\` label:\n` +
      touched.map(f => `      ${f}`).join('\n') +
      `\n    These change only after discussion. Ask the maintainer to add the label, or drop the change.`,
  };
}

function checkCitation(files, body) {
  const touched = files.map(normalise).filter(f => CITATION_FILES.includes(f));
  if (touched.length === 0) return { ok: true, detail: 'catalogue untouched' };
  if (CITATION_PATTERN.test(body ?? '')) {
    return { ok: true, detail: 'catalogue changed, declaration cited in the PR body' };
  }
  return {
    ok: false,
    detail:
      `${touched.join(', ')} changed, but the PR body cites no server declaration.\n` +
      `    A member's kind and arity come from ../SPO-Original/Rdo/Server/ — read it with\n` +
      `    delphi-archaeologist and cite it as \`File.pas:Line\` in the PR body.`,
  };
}

/**
 * Every scope/metric the base declares must still exist and must not be lower. New scopes
 * and new metrics are free; only a retreat is a failure.
 */
function thresholdRegressions(base, head) {
  const out = [];
  for (const [scope, metrics] of Object.entries(base ?? {})) {
    const headMetrics = (head ?? {})[scope];
    if (!headMetrics) {
      out.push({ scope, metric: '*', from: 'present', to: 'removed' });
      continue;
    }
    for (const metric of THRESHOLD_METRICS) {
      if (typeof metrics[metric] !== 'number') continue;
      const after = headMetrics[metric];
      if (typeof after !== 'number') {
        out.push({ scope, metric, from: metrics[metric], to: 'removed' });
      } else if (after < metrics[metric]) {
        out.push({ scope, metric, from: metrics[metric], to: after });
      }
    }
  }
  return out;
}

function checkThresholds(base, head) {
  const regressions = thresholdRegressions(base, head);
  if (regressions.length === 0) return { ok: true, detail: 'no threshold lowered' };
  return {
    ok: false,
    detail:
      'jest.config.js thresholds only go UP:\n' +
      regressions
        .map(r => `      ${r.scope} ${r.metric}: ${r.from} -> ${r.to}`)
        .join('\n'),
  };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
}

/** Same base semantics as coverage-changed.js: the merge-base with the PR base, else origin/main. */
function diffBase(baseSha) {
  for (const ref of [baseSha, 'origin/main', 'main'].filter(Boolean)) {
    try {
      return git(['merge-base', 'HEAD', ref]);
    } catch {
      // Try the next ref.
    }
  }
  return null;
}

/**
 * `--no-renames` is load-bearing. Git detects renames by default and `--name-only` then
 * prints only the DESTINATION, so moving `src/shared/rdo-frame.ts` to another path reported
 * as one unprotected new file and unlocked the wire emitter with no label. Without rename
 * detection the same change is a delete of the old path plus an add of the new one, so both
 * sides are judged — which is what `PROTECTED_FILES` needs.
 */
function changedFiles(base) {
  return git(['diff', '--name-only', '--no-renames', `${base}...HEAD`])
    .split('\n')
    .map(normalise)
    .filter(Boolean);
}

/**
 * jest.config.js as of a commit. It is plain CommonJS with no imports and no side effects,
 * so requiring a copy of it is safe and is the only way to read the values the way Jest
 * itself would — a regex over the text would miss a restructured object.
 *
 * The two failure modes are not the same and must not collapse into one. The base genuinely
 * not having the file is fine — there is nothing to ratchet against. Having it and being
 * unable to read it is a failure: passing the ratchet on a base nobody read is how a lowered
 * threshold would slip through unnoticed.
 *
 * Returns `{ state: 'ok', thresholds }` | `{ state: 'absent' }` | `{ state: 'unreadable', reason }`.
 */
function thresholdsAt(ref) {
  try {
    git(['cat-file', '-e', `${ref}:jest.config.js`]);
  } catch {
    return { state: 'absent' };
  }
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-rules-')), 'jest.config.js');
  try {
    fs.writeFileSync(file, git(['show', `${ref}:jest.config.js`]));
    return { state: 'ok', thresholds: require(file).coverageThreshold ?? {} };
  } catch (err) {
    return { state: 'unreadable', reason: err instanceof Error ? err.message : String(err) };
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

/**
 * The ratchet verdict for a base state — pure, so the fail-closed behaviour is testable
 * without a git repository.
 */
function ratchetResult(baseState, headThresholds) {
  if (baseState.state === 'absent') {
    return { ok: true, detail: 'the base has no jest.config.js — nothing to ratchet against' };
  }
  if (baseState.state === 'unreadable') {
    return {
      ok: false,
      detail:
        `jest.config.js exists on the base but could not be read: ${baseState.reason}\n` +
        `    The ratchet is not judged on an unread base — fix the read, do not skip the rule.`,
    };
  }
  return checkThresholds(baseState.thresholds, headThresholds);
}

function main() {
  const base = diffBase(process.env.BASE_SHA);
  if (!base) {
    // Fail CLOSED. This used to fall back to `git diff HEAD` — the WORKING TREE, empty in a
    // clean CI checkout — so all three rules reported ok over zero files and the run printed
    // `0 changed file(s) against HEAD`, which reads like normal output. A shallow checkout, a
    // force-pushed base or a dropped `fetch-depth: 0` silently disarmed every rule.
    console.error('PR rules — FAIL: no diff base could be resolved.');
    console.error('    Tried BASE_SHA, origin/main and main; none produced a merge-base with HEAD.');
    console.error('    Without a base there is no changed-file set, and all three rules would');
    console.error('    pass over nothing. In CI this usually means the checkout lost its history');
    console.error('    (.github/workflows/ci.yml sets `fetch-depth: 0` for exactly this reason).');
    return 1;
  }
  const files = changedFiles(base);
  const labels = parseLabels(process.env.PR_LABELS);
  const body = process.env.PR_BODY ?? '';

  const results = [
    ['protected files', checkProtectedPaths(files, labels)],
    ['RDO citation', checkCitation(files, body)],
  ];

  let headThresholds;
  try {
    headThresholds = require(path.resolve('jest.config.js')).coverageThreshold ?? {};
  } catch (err) {
    console.error(`PR rules — FAIL: jest.config.js on this branch could not be read: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  results.push(['coverage ratchet', ratchetResult(thresholdsAt(base), headThresholds)]);

  console.log(`PR rules — ${files.length} changed file(s) against ${base.slice(0, 8)}`);
  let failed = 0;
  for (const [name, result] of results) {
    console.log(`  ${result.ok ? 'ok  ' : 'FAIL'} ${name}: ${result.detail}`);
    if (!result.ok) failed += 1;
  }
  return failed === 0 ? 0 : 1;
}

module.exports = {
  PROTECTED_FILES,
  APPROVAL_LABEL,
  CITATION_FILES,
  protectedTouched,
  parseLabels,
  checkProtectedPaths,
  checkCitation,
  thresholdRegressions,
  checkThresholds,
  ratchetResult,
};

if (require.main === module) {
  process.exit(main());
}
