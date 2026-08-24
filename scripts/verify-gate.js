#!/usr/bin/env node

/**
 * The pre-push gate — doc/E2E-POLICY.md §3.
 *
 * Runs, in order, stopping at the first failure:
 *
 *   static        typecheck, lint, tests — or, with --skip-static, the receipt the bench
 *                 worker already verified against the tree on disk (src/e2e/bench/receipt.ts)
 *   capabilities  President members in the diff -> the live stage must read, from the
 *                 server, whether the test account holds the capability (§7)
 *   routing       diff -> required L2 flows
 *   live          pre-flight, lock, capability reads, flows against planitia, restore, release
 *   judge         a capability the server GRANTS must be exercised by a flow (fail closed);
 *                 one it REFUSES is a recorded exception, never a human override
 *   artifact      report/e2e/gate-<sha>.json, which the push hook reads
 *
 * Usage:
 *   node scripts/verify-gate.js
 *   node scripts/verify-gate.js --static-only
 *   node scripts/verify-gate.js --skip-static      # worker only: a receipt covers stage 1
 *   node scripts/verify-gate.js --flows=login-spine,politics-write
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

/**
 * The commit this branch is judged against. `origin/main` when the remote ref exists — a
 * LOCAL `main` that lags makes the gate judge every commit merged since, not the branch
 * (seen 2026-08-21: a one-file docs change routed as three PRs' worth of source). The bench
 * worker fetches `origin main` before each job, so the remote ref is fresh there; a
 * checkout without the remote falls back to `main`, and a repo with neither to HEAD.
 */
function diffBase() {
  for (const ref of ['origin/main', 'main']) {
    try {
      return git(['merge-base', 'HEAD', ref]);
    } catch {
      // Try the next ref.
    }
  }
  return null;
}

/** Everything this branch changed against its merge-base, plus the working tree. */
function changedFiles() {
  const base = diffBase();
  const args = base ? ['diff', '--name-only', base, 'HEAD'] : ['diff', '--name-only', 'HEAD'];
  const committed = git(args).split('\n').filter(Boolean);
  // `-uall` matters: without it an untracked DIRECTORY collapses to a single `dir/` entry,
  // so a new file inside it would never be routed to a flow.
  // Not through git(): its trim() would eat the leading space of a ` M path` line and
  // hand the router `ath` — the first-listed unstaged modification lost its first letter.
  const working = execFileSync('git', ['status', '--porcelain', '-uall'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map(line => line.slice(3).trim())
    .filter(Boolean);
  return Array.from(new Set([...committed, ...working]));
}

/**
 * The paths this branch removed. The router needs them apart: a path that no longer exists
 * and that no rule covers is not an unmapped area the gate must fail closed on.
 */
function deletedFiles() {
  const base = diffBase();
  const args = base
    ? ['diff', '--name-only', '--diff-filter=D', base, 'HEAD']
    : ['diff', '--name-only', '--diff-filter=D', 'HEAD'];
  return git(args).split('\n').filter(Boolean);
}

/**
 * A unified diff of everything this branch introduces, including untracked files.
 *
 * `git diff` never shows an untracked file, so a brand-new module calling a President-only
 * member would slip past the exclusion scan. Untracked files are therefore rendered as
 * synthetic all-added hunks, in the same `+++ b/<path>` shape the scanner parses.
 */
function diffText() {
  const base = diffBase();
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
    exclusions: { presidentMembersTouched: [], capability: [] },
  };

  // --- Stage 1: static -------------------------------------------------------
  // `--skip-static` is passed by the bench worker, and only when it has matched a precheck
  // receipt against the fingerprint IT took of the worktree on disk (src/e2e/bench/receipt.ts).
  // The three commands below are byte-for-byte what `gate:precheck` already ran on that
  // exact tree; replaying them costs ~113 s of the one resource every session queues for.
  // Nothing else is skipped, and the artifact says plainly where the proof came from.
  const staticSteps = [
    ['typecheck', 'typecheck', 'npm run typecheck'],
    ['lint', 'lint', 'npm run lint'],
    ['test', 'unit + component tests', 'npm test'],
  ];
  if (flag('skip-static') === 'true') {
    process.stdout.write(
      '\n=== static: from the precheck receipt (the worker matched it to this tree)\n',
    );
    for (const [key] of staticSteps) artifact.static[key] = 'RECEIPT';
  } else {
    for (const [key, label, command] of staticSteps) {
      const result = runStage(label, command);
      artifact.static[key] = result.status;
      if (result.status === 'FAIL') {
        const file = write(artifact);
        fail(`static stage failed: ${label}`, file);
        return 1;
      }
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
  const { capabilitiesFor } = require(path.resolve('dist/e2e/capability.js'));

  // --- Stage 2: capabilities -------------------------------------------------
  // A member the test account may not be authorised to call is not a reason to stop;
  // it is a question for the server. The live stage reads the answer (§7).
  const president = presidentMembersInDiff(diffText());
  artifact.exclusions.presidentMembersTouched = president;
  const capabilities = capabilitiesFor(president);

  // --- Stage 3: routing ------------------------------------------------------
  const decision = route(files, deletedFiles());
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

  // A capability question cannot be answered statically: the live stage runs for it even
  // when nothing else is routed there.
  if ((staticOnly || flows.length === 0) && capabilities.length === 0) {
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
  const live = await runLive({ flows: staticOnly ? [] : flows, branch, capabilities });
  artifact.live = live;
  process.stdout.write(`${formatSummary(live)}\n`);

  artifact.verdict = live.status === 'PASS' ? 'PASS' : live.status === 'BLOCKED' ? 'BLOCKED' : 'FAIL';

  // --- Stage 5: judge the capability evidence --------------------------------
  for (const evidence of live.capabilities || []) {
    if (!evidence.determined) {
      artifact.verdict = 'FAIL';
      process.stdout.write(
        `\nGate FAIL — the server did not answer whether ${evidence.account} holds the ` +
          `'${evidence.capability}' capability (${evidence.error || 'no answer'}); a capability ` +
          'must be read, never assumed.\n',
      );
    } else if (evidence.granted) {
      // The account CAN do it — so the change must be exercised, and nothing is routed to do so.
      artifact.verdict = 'FAIL';
      process.stdout.write(
        `\nGate FAIL — ${evidence.account} holds the '${evidence.capability}' capability, so ` +
          `${evidence.members.join(', ')} can be driven live: add a flow that exercises the ` +
          'changed member (src/e2e/flows.ts) and route it (src/e2e/routing.ts). Silence is not a pass.\n',
      );
    } else {
      artifact.exclusions.capability.push({
        capability: evidence.capability,
        members: president.filter(m => evidence.members.includes(m)),
        account: evidence.account,
        checks: evidence.checks,
        checkedAt: evidence.checkedAt,
      });
      process.stdout.write(
        [
          '',
          '=== CAPABILITY EXCEPTION =================================================',
          `${evidence.account} does not hold the '${evidence.capability}' capability on the server:`,
          ...evidence.checks.map(c => `  ${c.what} = ${c.value}`),
          `The touched member(s) ${president.join(', ')} therefore cannot be driven by this bench.`,
          'Recorded in the artifact and the PR; this is a property of the account, not a verdict',
          'on the change. The catalogue (kind + arity) remains the guard for these frames.',
          '==========================================================================',
          '',
        ].join('\n'),
      );
    }
  }

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
