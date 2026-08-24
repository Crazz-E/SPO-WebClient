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
const PROTECTED_PREFIXES = ['src/__fixtures__/'];
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
    .filter(f => PROTECTED_FILES.includes(f) || PROTECTED_PREFIXES.some(p => f.startsWith(p)));
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

function changedFiles(base) {
  const range = base ? [`${base}...HEAD`] : ['HEAD'];
  return git(['diff', '--name-only', ...range]).split('\n').map(normalise).filter(Boolean);
}

/**
 * jest.config.js as of a commit. It is plain CommonJS with no imports and no side effects,
 * so requiring a copy of it is safe and is the only way to read the values the way Jest
 * itself would — a regex over the text would miss a restructured object.
 */
function thresholdsAt(ref) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pr-rules-')), 'jest.config.js');
  try {
    fs.writeFileSync(file, git(['show', `${ref}:jest.config.js`]));
    return require(file).coverageThreshold ?? {};
  } catch {
    return null;
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

function main() {
  const base = diffBase(process.env.BASE_SHA);
  const files = changedFiles(base);
  const labels = parseLabels(process.env.PR_LABELS);
  const body = process.env.PR_BODY ?? '';

  const results = [
    ['protected files', checkProtectedPaths(files, labels)],
    ['RDO citation', checkCitation(files, body)],
  ];

  const baseThresholds = base ? thresholdsAt(base) : null;
  if (baseThresholds === null) {
    results.push(['coverage ratchet', { ok: true, detail: 'no base jest.config.js to compare against' }]);
  } else {
    results.push(['coverage ratchet', checkThresholds(baseThresholds, require(path.resolve('jest.config.js')).coverageThreshold ?? {})]);
  }

  console.log(`PR rules — ${files.length} changed file(s) against ${base ? base.slice(0, 8) : 'HEAD'}`);
  let failed = 0;
  for (const [name, result] of results) {
    console.log(`  ${result.ok ? 'ok  ' : 'FAIL'} ${name}: ${result.detail}`);
    if (!result.ok) failed += 1;
  }
  return failed === 0 ? 0 : 1;
}

module.exports = {
  PROTECTED_FILES,
  PROTECTED_PREFIXES,
  APPROVAL_LABEL,
  CITATION_FILES,
  protectedTouched,
  parseLabels,
  checkProtectedPaths,
  checkCitation,
  thresholdRegressions,
  checkThresholds,
};

if (require.main === module) {
  process.exit(main());
}
