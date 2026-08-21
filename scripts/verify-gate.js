#!/usr/bin/env node

/**
 * The pre-push gate — doc/E2E-POLICY.md §3.
 *
 * Runs, in order, stopping at the first failure:
 *
 *   static      typecheck, lint, tests
 *   exclusions  President members in the diff -> BLOCK, hand verification to the developer
 *   routing     diff -> required L2 flows
 *   live        pre-flight, lock, flows against planitia, restore, release
 *   artifact    report/e2e/gate-<sha>.json, which the push hook reads
 *
 * Usage:
 *   node scripts/verify-gate.js
 *   node scripts/verify-gate.js --static-only
 *   node scripts/verify-gate.js --flows=login-spine,politics-write
 *   node scripts/verify-gate.js --manual-verified="ran the president flow by hand, tax landed"
 *   node scripts/verify-gate.js --attempt=2
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.join('report', 'e2e');
const argv = process.argv.slice(2);

function flag(name) {
  const hit = argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : 'true';
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

/** Everything this branch changed against its merge-base, plus the working tree. */
function changedFiles() {
  const base = (() => {
    try {
      return git(['merge-base', 'HEAD', 'main']);
    } catch {
      return null;
    }
  })();
  const args = base ? ['diff', '--name-only', base, 'HEAD'] : ['diff', '--name-only', 'HEAD'];
  const committed = git(args).split('\n').filter(Boolean);
  // `-uall` matters: without it an untracked DIRECTORY collapses to a single `dir/` entry,
  // so a new file inside it would never be routed to a flow.
  const working = git(['status', '--porcelain', '-uall'])
    .split('\n')
    .filter(Boolean)
    .map(line => line.slice(3).trim())
    .filter(Boolean);
  return Array.from(new Set([...committed, ...working]));
}

/**
 * A unified diff of everything this branch introduces, including untracked files.
 *
 * `git diff` never shows an untracked file, so a brand-new module calling a President-only
 * member would slip past the exclusion scan. Untracked files are therefore rendered as
 * synthetic all-added hunks, in the same `+++ b/<path>` shape the scanner parses.
 */
function diffText() {
  const base = (() => {
    try {
      return git(['merge-base', 'HEAD', 'main']);
    } catch {
      return null;
    }
  })();
  const committed = base ? git(['diff', base, 'HEAD']) : '';
  const working = git(['diff', 'HEAD']);

  const untracked = git(['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean)
    .map(file => {
      let body = '';
      try {
        body = fs.readFileSync(file, 'utf8');
      } catch {
        return ''; // Binary or unreadable: nothing to scan for a member name.
      }
      const added = body.split('\n').map(line => `+${line}`).join('\n');
      return `diff --git a/${file} b/${file}\n--- /dev/null\n+++ b/${file}\n${added}`;
    })
    .join('\n');

  return [committed, working, untracked].filter(Boolean).join('\n');
}

function runStage(label, command) {
  process.stdout.write(`\n=== ${label}\n`);
  try {
    execSync(command, { stdio: 'inherit' });
    return { stage: label, status: 'PASS' };
  } catch (err) {
    return { stage: label, status: 'FAIL', detail: err.message };
  }
}

function write(artifact) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `gate-${artifact.head}.json`);
  fs.writeFileSync(file, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return file;
}

async function main() {
  const head = git(['rev-parse', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const files = changedFiles();

  const artifact = {
    head,
    branch,
    verdict: 'FAIL',
    createdAt: new Date().toISOString(),
    attempt: Number(flag('attempt') || 1),
    static: {},
    routing: {},
    live: null,
    exclusions: { presidentMembersTouched: [], manualVerification: flag('manual-verified') || null },
  };

  // --- Stage 1: static -------------------------------------------------------
  for (const [key, label, command] of [
    ['typecheck', 'typecheck', 'npm run typecheck'],
    ['lint', 'lint', 'npm run lint'],
    ['test', 'unit + component tests', 'npm test'],
  ]) {
    const result = runStage(label, command);
    artifact.static[key] = result.status;
    if (result.status === 'FAIL') {
      const file = write(artifact);
      fail(`static stage failed: ${label}`, file);
      return 1;
    }
  }

  // The e2e sources must be compiled before anything below can load them.
  const build = runStage('build:e2e', 'npm run build:e2e');
  artifact.static.buildE2e = build.status;
  if (build.status === 'FAIL') {
    fail('could not build the e2e driver', write(artifact));
    return 1;
  }

  const { route, presidentMembersInDiff } = require(path.resolve('dist/e2e/routing.js'));

  // --- Stage 2: exclusions ---------------------------------------------------
  const president = presidentMembersInDiff(diffText());
  artifact.exclusions.presidentMembersTouched = president;
  if (president.length > 0 && !artifact.exclusions.manualVerification) {
    artifact.verdict = 'BLOCKED';
    const file = write(artifact);
    process.stdout.write(
      [
        '',
        '=== MANUAL-VERIFY-REQUIRED ===============================================',
        '',
        `This diff touches President-only members: ${president.join(', ')}`,
        '',
        'SPO_test3 is not president, so no automated flow can exercise these. And',
        'RDOSitMinister exists in two variants with different argument types that a',
        'name+arity catalogue cannot tell apart (civic-roles-reference.md:112-115) —',
        'the wrong variant on a procedure is the arbitrary-memory-write case.',
        '',
        'What to do:',
        '  1. Log in as a president and exercise the changed flow at the Capitol.',
        '  2. Confirm the write in FIVEMODELSERVER/Survival <date>.log.',
        '  3. Re-run:  npm run gate -- --manual-verified="<what you ran, and the result>"',
        '',
        'The push stays blocked until then. Do not mark this verified on the model\'s',
        'behalf — doc/E2E-POLICY.md §7.',
        '==========================================================================',
        '',
      ].join('\n'),
    );
    process.stdout.write(`Artifact: ${file}\n`);
    return 2;
  }

  // --- Stage 3: routing ------------------------------------------------------
  const decision = route(files);
  artifact.routing = {
    changed: decision.changed,
    required: decision.required,
    unmapped: decision.unmapped,
    needsL3: decision.needsL3,
    reasons: decision.reasons,
  };

  if (decision.unmapped.length > 0) {
    artifact.verdict = 'FAIL';
    const file = write(artifact);
    fail(
      `no routing rule covers:\n  ${decision.unmapped.join('\n  ')}\n` +
        `Add a rule to src/e2e/routing.ts — the gate fails closed rather than passing silently.`,
      file,
    );
    return 1;
  }

  const staticOnly = flag('static-only') === 'true' || decision.staticOnly;
  const requested = flag('flows');
  const flows = requested ? requested.split(',').filter(Boolean) : decision.required;

  if (staticOnly || flows.length === 0) {
    artifact.verdict = 'PASS';
    artifact.live = { skipped: true, why: 'nothing in this diff is observable over the wire' };
    const file = write(artifact);
    process.stdout.write(`\nGate PASS (static only). Artifact: ${file}\n`);
    if (decision.needsL3) warnL3();
    return 0;
  }

  // --- Stage 4: live ---------------------------------------------------------
  process.stdout.write(`\n=== live drive on planitia: ${flows.join(', ')}\n`);
  const { runLive, formatSummary } = require(path.resolve('dist/e2e/run.js'));
  const live = await runLive({ flows, branch });
  artifact.live = live;
  process.stdout.write(`${formatSummary(live)}\n`);

  artifact.verdict = live.status === 'PASS' ? 'PASS' : live.status === 'BLOCKED' ? 'BLOCKED' : 'FAIL';
  const file = write(artifact);

  if (decision.needsL3) warnL3();
  process.stdout.write(`\nGate ${artifact.verdict}. Artifact: ${file}\n`);

  if (live.status === 'ENVIRONMENT') {
    process.stdout.write(
      '\nThis was an ENVIRONMENT abort, not a failed attempt: the servers were not in a\n' +
        'state where the change could be judged. Do not count it against the three tries\n' +
        '(doc/E2E-POLICY.md §8).\n',
    );
  }
  return artifact.verdict === 'PASS' ? 0 : 1;
}

function warnL3() {
  process.stdout.write(
    '\nNOTE: this diff touches rendering, layout or mobile — a WebSocket drive cannot see a\n' +
      'pixel. Run the L3 browser smoke (`/e2e`) before merging.\n',
  );
}

function fail(message, file) {
  process.stderr.write(`\nGate FAIL — ${message}\nArtifact: ${file}\n`);
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    process.stderr.write(`Gate crashed: ${err && err.message ? err.message : String(err)}\n`);
    process.exit(1);
  });
