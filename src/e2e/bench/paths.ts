/**
 * The bench root — one fixed directory for the whole machine, outside every worktree.
 *
 * Everything the worker and its clients share lives here: the spool (sessions drop job
 * requests), the running slot, the reports, the per-HEAD attestations the push hook
 * reads, the shared world state, and the heartbeat whose CONTENT — the epoch ms
 * touchHeartbeat wrote, not the file's mtime — is the worker's sign of life (action
 * B5.3: mtime can be preserved by a `cp -p`-style copy, or bumped by an unrelated
 * touch that writes nothing; content is the one signal the writer actually controls).
 * It sits under $HOME (ext4), never under /mnt/c (DrvFs rename semantics) and
 * never in a session scratchpad (per-session, shares nothing).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface BenchPaths {
  root: string;
  /** Sessions drop job requests here; filename order is queue order. */
  spool: string;
  /** The one claimed job — a file here means a job is executing. */
  running: string;
  /**
   * Job reports (`<id>.json`) and per-job build/test output (`<id>.log`). Only the `.log`
   * is purged (24 h, `purgeDone` in ./job) — the `.json` is left alone, and every job's
   * outcome is ALSO appended as one line to `jobsLog` the moment its report is written, so
   * neither a purge nor a `rm -rf done/` loses the answer. See `jobsLog` below and action
   * B4.2 (SPO-Pipeline/doc/bench-plan-derived-2026-09-02.md).
   */
  done: string;
  /** Per-HEAD gate attestations — what `.claude/hooks/pre-push-gate.sh` reads. */
  verdicts: string;
  /** Shared world lock / dirty flag / run history (see WORLD_STATE_DIR in ../config). */
  world: string;
  /**
   * The asset mirror every job's gateway reads, shared by every worktree on the machine.
   * Those ~570 files are identical in every checkout, so a per-worktree copy made each
   * new branch re-download the lot on the bench's exclusive time. Jobs are serialised,
   * so the one writer at a time this directory assumes is guaranteed by the queue.
   */
  cache: string;
  /**
   * The nightly proof of `main`: the worker-owned checkout it drives and the result it
   * publishes. Outside every session's worktree because no session owns it — see ./nightly.
   */
  nightly: string;
  /**
   * The checkout the worker fetches a `ref` job into — a pushed branch head, a merge
   * queue's speculative commit. Separate from `nightly/checkout` so a gate never has to
   * wait for, or disturb, the nightly's copy of `main`. See ./checkout.
   */
  refCheckout: string;
  /**
   * Written every few seconds by the worker; its CONTENT (the epoch ms it wrote, see
   * touchHeartbeat/heartbeatAgeMs) is the liveness signal, not its mtime.
   */
  heartbeat: string;
  /** Who the worker is: pid, repo it runs from, port it owns. */
  workerFile: string;
  /**
   * One durable JSON line per finished job (id, type, deposited sha, verdict, detail,
   * timestamps — see `JobsLogLine` in ./job), appended by `Spool.writeReport` and never
   * rewritten, reordered, or purged. `done/` answers "what happened to a job I just ran";
   * this file answers "what has ever happened", including the non-attesting verdicts
   * (DIRTY, ENVIRONMENT, ABANDONED, INTERRUPTED) that `verdicts/` never records and
   * `done/` used to lose after 24 h (action B4.2, SPO-Pipeline/doc/bench-plan-derived-2026-09-02.md
   * row 4.2). One line runs a few hundred bytes; at the bench's observed rate (tens of
   * jobs/day) that is single-digit MB per year — see job.ts's doc comment on
   * `appendJobsLog` for the measured figures and why no rotation is built here.
   */
  jobsLog: string;
}

/** Heartbeat older than this = the worker is not running, whatever systemd believes. */
export const HEARTBEAT_STALE_MS = 20_000;

/** How often the worker touches the heartbeat. */
export const HEARTBEAT_PERIOD_MS = 5_000;

/** The port the worker owns. Nothing else on this machine may listen on it. */
export const BENCH_PORT = 8080;

// `env` defaults to the real `process.env` for every production call site (every existing
// caller passes nothing, so the default keeps behaviour identical). A test asserting the
// UNSET-var default is the one caller with a reason to pass something else: injecting a
// throwaway object — `benchRoot({})` — proves the same fallback computation
// (`os.homedir()`-based; `os.homedir()` itself does no I/O) without ever touching or mutating
// the real `process.env.SPO_BENCH_DIR`. See paths.test.ts.
export function benchRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.SPO_BENCH_DIR || path.join(os.homedir(), '.spo-bench');
}

export function benchPaths(root: string = benchRoot()): BenchPaths {
  return {
    root,
    spool: path.join(root, 'spool'),
    running: path.join(root, 'running'),
    done: path.join(root, 'done'),
    verdicts: path.join(root, 'verdicts'),
    world: path.join(root, 'world'),
    cache: path.join(root, 'cache'),
    nightly: path.join(root, 'nightly'),
    refCheckout: path.join(root, 'ref', 'checkout'),
    heartbeat: path.join(root, 'heartbeat'),
    workerFile: path.join(root, 'worker.json'),
    jobsLog: path.join(root, 'jobs.jsonl'),
  };
}

export function ensureLayout(paths: BenchPaths): void {
  const dirs = [
    paths.root,
    paths.spool,
    paths.running,
    paths.done,
    paths.verdicts,
    paths.world,
    paths.cache,
    paths.nightly,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export interface WorkerInfo {
  pid: number;
  startedAt: string;
  /** The checkout the worker's own code runs from (not the worktree under test). */
  repo: string;
  port: number;
}

export function writeWorkerInfo(paths: BenchPaths, info: WorkerInfo): void {
  fs.writeFileSync(paths.workerFile, `${JSON.stringify(info, null, 2)}\n`, 'utf8');
}

export function readWorkerInfo(paths: BenchPaths): WorkerInfo | null {
  try {
    return JSON.parse(fs.readFileSync(paths.workerFile, 'utf8')) as WorkerInfo;
  } catch {
    return null;
  }
}

export function touchHeartbeat(paths: BenchPaths): void {
  fs.writeFileSync(paths.heartbeat, `${Date.now()}\n`, 'utf8');
}

/**
 * Milliseconds since the last heartbeat, or null when there has never been one (the file is
 * absent) or its content isn't a parseable timestamp.
 *
 * Reads by CONTENT — the epoch ms touchHeartbeat wrote — never by the file's mtime (action
 * B5.3, replacing an earlier mtime-based read). mtime is not a safe proxy for "the worker wrote
 * this recently": a `cp -p`-style copy preserves the SOURCE's old mtime on a byte-identical
 * fresh copy, and an unrelated touch (a backup pass, a filesystem re-sync) can bump mtime with
 * no write at all. Content has neither failure mode, because touchHeartbeat writes a fresh
 * epoch ms on every single beat — see paths.test.ts's two heartbeat/mtime-divergence cases for
 * both directions pinned directly.
 *
 * console/collect.js in the sibling SPO-Pipeline repo reads this SAME file by content too (it
 * always did); this function used to be the odd one out. HEARTBEAT_STALE_MS itself is
 * unchanged by this action — see this file's own const above.
 */
export function heartbeatAgeMs(paths: BenchPaths, nowMs: number = Date.now()): number | null {
  let raw: string;
  try {
    raw = fs.readFileSync(paths.heartbeat, 'utf8').trim();
  } catch {
    return null;
  }
  const writtenMs = Number(raw);
  if (!Number.isFinite(writtenMs)) return null;
  return nowMs - writtenMs;
}

export interface WorkerStatus {
  alive: boolean;
  /** Human-readable reason when not alive; undefined when alive. */
  reason?: string;
  info: WorkerInfo | null;
}

/**
 * The check a submitter runs BEFORE queuing: a dead worker must be known at deposit
 * time, not discovered after twenty minutes of waiting. Two signals, because they catch
 * different failures: the pid says the process exists, the heartbeat says its loop is
 * actually turning (a worker wedged in a crash-restart cycle has a pid but a frozen
 * heartbeat).
 */
export function workerStatus(
  paths: BenchPaths,
  nowMs: number = Date.now(),
  isAlive: (pid: number) => boolean = processAlive,
): WorkerStatus {
  const info = readWorkerInfo(paths);
  if (!info) {
    return { alive: false, reason: 'no worker registered — run scripts/bench-install.sh', info: null };
  }
  if (!isAlive(info.pid)) {
    return { alive: false, reason: `worker pid ${info.pid} is not running`, info };
  }
  const age = heartbeatAgeMs(paths, nowMs);
  if (age === null) {
    return { alive: false, reason: 'worker has never heartbeat', info };
  }
  if (age > HEARTBEAT_STALE_MS) {
    return { alive: false, reason: `heartbeat is ${Math.round(age / 1000)} s old (limit ${HEARTBEAT_STALE_MS / 1000} s)`, info };
  }
  return { alive: true, info };
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
