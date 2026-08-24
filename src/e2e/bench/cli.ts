/**
 * The bench client — what a session runs. Three commands:
 *
 *   submit --type=gate|live|lease|ref [--ref=<sha>] [--wait] [--timeout-min=N]
 *          [--lease-minutes=N] [flags…]
 *     Deposits a job for the CURRENT worktree (cwd) and returns immediately with the
 *     job id — unless --wait, which folds straight into the wait loop so the whole
 *     round trip is ONE background shell command for the session (zero tokens spent
 *     waiting). Unrecognized flags are forwarded verbatim to the job body, so
 *     `npm run gate -- --flows=login-spine` reaches verify-gate.js unchanged.
 *     A dead worker is reported HERE, at deposit time — exit 3, immediately. A gate on
 *     a tree with uncommitted changes is refused here too — exit 2: the attestation
 *     names a sha, so the tested tree must BE that sha.
 *
 *     `--type=ref --ref=<sha|branch>` is the odd one out: it names a commit on GitHub
 *     rather than this worktree, and the worker fetches it into a checkout of its own.
 *     The subject need not exist on this machine — which is the point (#158). Its answer
 *     goes to `ref/verdicts/` and is published as `bench/ref-gate`, beside the session
 *     path rather than on top of it.
 *
 *   wait <job-id> [--timeout-min=N]
 *     Sleeps until the report exists (exit 0 on PASS/LEASED, 1 otherwise), the worker
 *     dies (exit 3), or the timeout passes (exit 4).
 *
 *   receipt
 *     Record that `gate:precheck` passed on the CURRENT worktree, so the worker does not
 *     replay typecheck/lint/tests inside the exclusive bench (see ./receipt). Best-effort
 *     by design: it never fails the precheck — a missing receipt only costs a replay.
 *
 *   release
 *     End the running lease held for the CURRENT worktree early (`npm run dev:release`).
 *
 *   status
 *     Worker liveness, the queue, and recent reports.
 *
 * Exit codes: 0 ok · 1 job completed with a non-passing verdict · 2 refused at deposit
 * (duplicate, or a gate on a dirty tree) · 3 worker down · 4 wait timeout.
 */

import { execFileSync } from 'child_process';
import { toErrorMessage } from '../../shared/error-utils';
import {
  benchPaths,
  ensureLayout,
  heartbeatAgeMs,
  workerStatus,
  type BenchPaths,
} from './paths';
import { fingerprintTree, type TreeFingerprint } from './fingerprint';
import { buildReceipt, pruneReceipts, writeReceipt, RECEIPT_MAX_AGE_MS } from './receipt';
import { DuplicateJobError, Spool, type JobReport, type JobType } from './job';

export interface CliDeps {
  paths: BenchPaths;
  spool: Spool;
  fingerprint: (worktree: string) => TreeFingerprint;
  git: (args: string[]) => string;
  workerAlive: () => { alive: boolean; reason?: string };
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  pid: number;
  out: (line: string) => void;
  err: (line: string) => void;
}

export function realCliDeps(): CliDeps {
  const paths = benchPaths();
  return {
    paths,
    spool: new Spool(paths),
    fingerprint: fingerprintTree,
    git: args => execFileSync('git', args, { encoding: 'utf8' }).trim(),
    workerAlive: () => workerStatus(paths),
    now: () => Date.now(),
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    pid: process.pid,
    out: line => process.stdout.write(`${line}\n`),
    err: line => process.stderr.write(`${line}\n`),
  };
}

const DEFAULT_WAIT_TIMEOUT_MIN = 120;

interface ParsedArgs {
  command: string;
  positional: string[];
  known: Map<string, string>;
  passthrough: string[];
}

const KNOWN_FLAGS = new Set(['type', 'wait', 'timeout-min', 'lease-minutes', 'ref']);

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = '', ...rest] = argv;
  const known = new Map<string, string>();
  const passthrough: string[] = [];
  const positional: string[] = [];
  for (const arg of rest) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (!match) {
      positional.push(arg);
    } else if (KNOWN_FLAGS.has(match[1])) {
      known.set(match[1], match[2] ?? 'true');
    } else {
      passthrough.push(arg);
    }
  }
  return { command, positional, known, passthrough };
}

export async function main(argv: string[], deps: CliDeps = realCliDeps()): Promise<number> {
  ensureLayout(deps.paths);
  const parsed = parseArgs(argv);
  switch (parsed.command) {
    case 'submit':
      return submit(parsed, deps);
    case 'wait': {
      const id = parsed.positional[0];
      if (!id) {
        deps.err('usage: wait <job-id> [--timeout-min=N]');
        return 1;
      }
      return wait(id, timeoutMin(parsed), deps);
    }
    case 'receipt':
      return receipt(deps);
    case 'release':
      return release(deps);
    case 'status':
      return status(deps);
    default:
      deps.err(
        `unknown command "${parsed.command}" — expected submit, wait, receipt, release or status`,
      );
      return 1;
  }
}

function timeoutMin(parsed: ParsedArgs): number {
  const raw = Number(parsed.known.get('timeout-min'));
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WAIT_TIMEOUT_MIN;
}

async function submit(parsed: ParsedArgs, deps: CliDeps): Promise<number> {
  const type = (parsed.known.get('type') ?? 'gate') as JobType;
  if (!['gate', 'live', 'lease', 'ref'].includes(type)) {
    deps.err(`unknown job type "${type}" — expected gate, live, lease or ref`);
    return 1;
  }
  const ref = parsed.known.get('ref');
  if (type === 'ref' && !ref) {
    deps.err('a ref job needs --ref=<sha|branch> — what the worker should fetch and gate');
    return 1;
  }

  // A dead worker is announced NOW, not after the session has waited on nothing.
  const worker = deps.workerAlive();
  if (!worker.alive) {
    deps.err(`WORKER DOWN: ${worker.reason ?? 'unknown'}`);
    deps.err('The bench worker is not running. Fix it first:');
    deps.err('  systemctl --user status spo-bench-worker    # why it stopped');
    deps.err('  systemctl --user restart spo-bench-worker   # bring it back');
    deps.err('  scripts/bench-install.sh                    # first-time setup');
    return 3;
  }

  let worktree: string;
  let branch: string;
  try {
    worktree = deps.git(['rev-parse', '--show-toplevel']);
    branch = deps.git(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch (err: unknown) {
    deps.err(`not inside a git worktree: ${toErrorMessage(err)}`);
    return 1;
  }

  // A ref job is about a commit on GitHub, not about this worktree. The subject does not
  // exist on this machine until the worker fetches it, so there is nothing here to
  // fingerprint — the placeholder below names the ref and is never compared against the
  // tree (see the staleness rule in worker.ts).
  const fingerprint =
    type === 'ref' ? { head: ref as string, hash: `ref:${ref}`, clean: true } : deps.fingerprint(worktree);
  // The hook and GitHub both key on HEAD's sha. A gate run over uncommitted changes would
  // attest a sha that was never tested on its own — refuse it before it costs bench time.
  // The worker enforces the same rule (DIRTY), so a bypassed client still attests nothing.
  if (type === 'gate' && !fingerprint.clean) {
    deps.err('DIRTY TREE: this worktree has uncommitted or untracked changes.');
    deps.err('A gate attests HEAD by sha, so the tree it tests must be exactly that commit.');
    deps.err('Commit (or stash) first, then:  npm run gate');
    return 2;
  }

  let request;
  try {
    request = deps.spool.submit(
      {
        type,
        // The worker's own checkout, not this one: a ref job's tree is fetched, and the
        // session that deposited it may not even be on the worker's machine.
        worktree: type === 'ref' ? deps.paths.refCheckout : worktree,
        branch: type === 'ref' ? (ref as string) : branch,
        fingerprint,
        // With --wait this process stays alive until the report lands, so the worker can
        // tell a dead session from a queued one. Without it there is nobody to watch.
        submitter: { pid: parsed.known.has('wait') ? deps.pid : 0 },
        args: parsed.passthrough,
        ...(type === 'lease' ? { leaseMinutes: leaseMinutes(parsed) } : {}),
        ...(type === 'ref' ? { ref } : {}),
      },
      deps.now(),
    );
  } catch (err: unknown) {
    if (err instanceof DuplicateJobError) {
      deps.err(err.message);
      return 2;
    }
    throw err;
  }

  const queueDepth = deps.spool.queued().length + deps.spool.running().length;
  deps.out(`job ${request.id} queued (${type}, position ${queueDepth})`);
  deps.out(`report will land in ${deps.paths.done}/${request.id}.json`);

  if (parsed.known.has('wait')) return wait(request.id, timeoutMin(parsed), deps);
  deps.out(`wait with:  bash scripts/bench-wait.sh ${request.id}`);
  return 0;
}

/**
 * Stamp the precheck proof for the current worktree.
 *
 * Deliberately exit 0 on every failure: this runs at the end of `gate:precheck`, and a
 * bench that cannot be written to must not turn a green precheck into a red one. The
 * worst case is the worker finding no receipt and replaying the static stage — exactly
 * what it did before this existed.
 */
export function receipt(deps: CliDeps): number {
  try {
    const worktree = deps.git(['rev-parse', '--show-toplevel']);
    const branch = deps.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    const file = writeReceipt(
      deps.paths,
      buildReceipt(deps.fingerprint(worktree), worktree, branch, deps.now()),
    );
    pruneReceipts(deps.paths, RECEIPT_MAX_AGE_MS, deps.now());
    deps.out(`precheck receipt written: ${file}`);
  } catch (err: unknown) {
    deps.err(`could not write the precheck receipt (${toErrorMessage(err)}); the worker will replay the static stage`);
  }
  return 0;
}

function leaseMinutes(parsed: ParsedArgs): number {
  const raw = Number(parsed.known.get('lease-minutes'));
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

async function wait(id: string, timeoutMinutes: number, deps: CliDeps): Promise<number> {
  const deadline = deps.now() + timeoutMinutes * 60_000;
  for (;;) {
    const report = deps.spool.readReport(id);
    if (report) {
      deps.out(formatReport(report));
      return report.verdict === 'PASS' || report.verdict === 'LEASED' ? 0 : 1;
    }
    const worker = deps.workerAlive();
    if (!worker.alive) {
      deps.err(`WORKER DIED while job ${id} was pending: ${worker.reason ?? 'unknown'}`);
      deps.err('The queue is preserved; restart the worker and it will resume:');
      deps.err('  systemctl --user restart spo-bench-worker');
      return 3;
    }
    if (deps.now() > deadline) {
      deps.err(`timed out after ${timeoutMinutes} min waiting for job ${id} (still queued or running)`);
      return 4;
    }
    await deps.sleep(2_000);
  }
}

export function formatReport(report: JobReport): string {
  const lines = [
    `=== bench job ${report.id} — ${report.verdict}`,
    `  type ${report.type} · branch ${report.branch}`,
    `  worktree ${report.worktree}`,
  ];
  if (report.detail) lines.push(`  ${report.detail}`);
  if (report.targetMoved) {
    lines.push('  ! the tree CHANGED during the run — this result does not attest the current tree');
  }
  if (report.type === 'lease' && report.leaseUntil) {
    lines.push(`  gateway on port ${report.port} until ${report.leaseUntil}`);
  }
  if (report.baseMain) lines.push(`  gated against main ${report.baseMain.slice(0, 8)}`);
  if (report.gateArtifact) lines.push(`  gate artifact: ${report.gateArtifact}`);
  if (report.logFile) lines.push(`  full log: ${report.logFile}`);
  return lines.join('\n');
}

async function release(deps: CliDeps): Promise<number> {
  let worktree: string;
  try {
    worktree = deps.git(['rev-parse', '--show-toplevel']);
  } catch (err: unknown) {
    deps.err(`not inside a git worktree: ${toErrorMessage(err)}`);
    return 1;
  }
  const lease = deps.spool
    .running()
    .find(entry => entry.request.type === 'lease' && entry.request.worktree === worktree);
  if (!lease) {
    deps.err(`no running lease for ${worktree} — nothing to release`);
    return 1;
  }
  deps.spool.requestRelease(lease.request.id);
  deps.out(`release requested for lease ${lease.request.id}; the worker tears the gateway down within seconds`);
  return 0;
}

async function status(deps: CliDeps): Promise<number> {
  const worker = deps.workerAlive();
  const age = heartbeatAgeMs(deps.paths, deps.now());
  deps.out(
    worker.alive
      ? `worker ALIVE (heartbeat ${age === null ? '?' : Math.round(age / 1000)} s ago)`
      : `worker DOWN — ${worker.reason ?? 'unknown'}`,
  );
  for (const { request } of deps.spool.running()) {
    deps.out(`  running: ${request.id} (${request.type}) ${request.worktree} [${request.branch}]`);
  }
  const queued = deps.spool.queued();
  deps.out(`  queued: ${queued.length}`);
  for (const { request } of queued) {
    deps.out(`    ${request.id} (${request.type}) ${request.worktree} [${request.branch}]`);
  }
  return worker.alive ? 0 : 3;
}

/* istanbul ignore next -- thin entry point; main() is tested with injected deps */
if (require.main === module) {
  main(process.argv.slice(2))
    .then(code => process.exit(code))
    .catch((err: unknown) => {
      process.stderr.write(`${toErrorMessage(err)}\n`);
      process.exit(1);
    });
}
