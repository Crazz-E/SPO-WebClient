/**
 * The bench root — one fixed directory for the whole machine, outside every worktree.
 *
 * Everything the worker and its clients share lives here: the spool (sessions drop job
 * requests), the running slot, the reports, the per-HEAD attestations the push hook
 * reads, the shared world state, and the heartbeat whose mtime is the worker's sign of
 * life. It sits under $HOME (ext4), never under /mnt/c (DrvFs rename semantics) and
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
  /** Job reports, purged after 24 h. */
  done: string;
  /** Per-HEAD gate attestations — what `.claude/hooks/pre-push-gate.sh` reads. */
  verdicts: string;
  /** Precheck receipts: the static proof a session produced, keyed by tree (see ./receipt). */
  receipts: string;
  /** Shared world lock / dirty flag / run history (see WORLD_STATE_DIR in ../config). */
  world: string;
  /**
   * The asset mirror every job's gateway reads, shared by every worktree on the machine.
   * Those ~570 files are identical in every checkout, so a per-worktree copy made each
   * new branch re-download the lot on the bench's exclusive time. Jobs are serialised,
   * so the one writer at a time this directory assumes is guaranteed by the queue.
   */
  cache: string;
  /** Touched every few seconds by the worker; its mtime is the liveness signal. */
  heartbeat: string;
  /** Who the worker is: pid, repo it runs from, port it owns. */
  workerFile: string;
}

/** Heartbeat older than this = the worker is not running, whatever systemd believes. */
export const HEARTBEAT_STALE_MS = 20_000;

/** How often the worker touches the heartbeat. */
export const HEARTBEAT_PERIOD_MS = 5_000;

/** The port the worker owns. Nothing else on this machine may listen on it. */
export const BENCH_PORT = 8080;

export function benchRoot(): string {
  return process.env.SPO_BENCH_DIR || path.join(os.homedir(), '.spo-bench');
}

export function benchPaths(root: string = benchRoot()): BenchPaths {
  return {
    root,
    spool: path.join(root, 'spool'),
    running: path.join(root, 'running'),
    done: path.join(root, 'done'),
    verdicts: path.join(root, 'verdicts'),
    receipts: path.join(root, 'receipts'),
    world: path.join(root, 'world'),
    cache: path.join(root, 'cache'),
    heartbeat: path.join(root, 'heartbeat'),
    workerFile: path.join(root, 'worker.json'),
  };
}

export function ensureLayout(paths: BenchPaths): void {
  const dirs = [
    paths.root,
    paths.spool,
    paths.running,
    paths.done,
    paths.verdicts,
    paths.receipts,
    paths.world,
    paths.cache,
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

/** Milliseconds since the last heartbeat, or null when there has never been one. */
export function heartbeatAgeMs(paths: BenchPaths, nowMs: number = Date.now()): number | null {
  try {
    return nowMs - fs.statSync(paths.heartbeat).mtimeMs;
  } catch {
    return null;
  }
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
