/**
 * The two safety rails an autonomous loop needs and a human run does not
 * (doc/E2E-POLICY.md §6).
 *
 * 1. Single-flight — one live session at a time, across both accounts.
 * 2. World-dirty — a run that aborts before restoring what it wrote leaves the lock
 *    behind with the pending restores in it, and every later run refuses to start.
 *    Attempt 2 must never begin on a world attempt 1 left mutated.
 *
 * Also the run-rate limiter, which is what keeps a retry loop from becoming a login
 * storm against the live Delphi servers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LIMITS, WORLD_STATE_DIR } from './config';

/** The two knobs `checkRateLimit` reads — injectable so tests can pin tight values. */
export type RateLimits = Pick<typeof LIMITS, 'minIntervalMinutes' | 'maxRunsPerDay'>;

export interface PendingRestore {
  /** Human description used in the dirty-world report. */
  what: string;
  x: number;
  y: number;
  propertyName: string;
  originalValue: string;
  additionalParams?: Record<string, string>;
}

export interface WorldLockFile {
  holder: { pid: number; branch: string; startedAt: string } | null;
  /** Writes issued but not yet restored. Non-empty on release means the world is dirty. */
  pendingRestores: PendingRestore[];
  /** Set when a run ended with pending restores. Only a human clears this. */
  dirty: boolean;
  dirtySince?: string;
  dirtyReason?: string;
}

interface RunHistoryFile {
  runs: { branch: string; at: string }[];
}

const EMPTY_LOCK: WorldLockFile = { holder: null, pendingRestores: [], dirty: false };

export class WorldDirtyError extends Error {
  constructor(lock: WorldLockFile) {
    super(
      `The live world is marked dirty since ${lock.dirtySince ?? 'an earlier run'}: ` +
        `${lock.dirtyReason ?? 'a run ended before restoring its writes'}. ` +
        `${lock.pendingRestores.length} value(s) need a human restore. ` +
        `Restore them, then run: npm run e2e:unlock`,
    );
    this.name = 'WorldDirtyError';
  }
}

export class WorldLock {
  private readonly lockPath: string;
  private readonly historyPath: string;

  constructor(private readonly dir: string = WORLD_STATE_DIR) {
    this.lockPath = path.join(dir, 'world-lock.json');
    this.historyPath = path.join(dir, 'run-history.json');
  }

  read(): WorldLockFile {
    return readJson<WorldLockFile>(this.lockPath, EMPTY_LOCK);
  }

  /**
   * Take the lock, or refuse. Refuses hard on a dirty world; refuses on a live holder
   * but takes over from a holder whose process is gone (a crash, not a rival).
   */
  acquire(branch: string, pid: number = process.pid, isAlive: (p: number) => boolean = processAlive): void {
    const lock = this.read();
    if (lock.dirty) throw new WorldDirtyError(lock);

    if (lock.holder && lock.holder.pid !== pid && isAlive(lock.holder.pid)) {
      throw new Error(
        `A live run is already in flight (pid ${lock.holder.pid}, branch ${lock.holder.branch}, ` +
          `since ${lock.holder.startedAt}). Live runs are single-flight.`,
      );
    }

    this.write({
      holder: { pid, branch, startedAt: new Date().toISOString() },
      pendingRestores: [],
      dirty: false,
    });
  }

  /** Record a write before issuing it, so a crash between write and restore is recoverable. */
  addPendingRestore(entry: PendingRestore): void {
    const lock = this.read();
    lock.pendingRestores.push(entry);
    this.write(lock);
  }

  /** Drop a pending restore once the value is back where it started. */
  clearPendingRestore(x: number, y: number, propertyName: string): void {
    const lock = this.read();
    lock.pendingRestores = lock.pendingRestores.filter(
      p => !(p.x === x && p.y === y && p.propertyName === propertyName),
    );
    this.write(lock);
  }

  /**
   * Release. If anything is still unrestored the lock is marked dirty instead, and
   * every later run is blocked until a human clears it.
   */
  release(reason?: string): void {
    const lock = this.read();
    if (lock.pendingRestores.length > 0) {
      this.write({
        ...lock,
        holder: null,
        dirty: true,
        dirtySince: new Date().toISOString(),
        dirtyReason: reason ?? 'run ended with unrestored writes',
      });
      throw new WorldDirtyError(this.read());
    }
    this.write(EMPTY_LOCK);
  }

  /** Manual clear — `npm run e2e:unlock`, after a human has put the world back. */
  forceUnlock(): WorldLockFile {
    const previous = this.read();
    this.write(EMPTY_LOCK);
    return previous;
  }

  /**
   * Refuse a run that is too soon after the last one on this branch, or over the daily
   * cap. Throws with the wait time rather than sleeping — the caller decides.
   */
  checkRateLimit(branch: string, now: Date = new Date(), limits: RateLimits = LIMITS): void {
    const history = readJson<RunHistoryFile>(this.historyPath, { runs: [] });
    const nowMs = now.getTime();

    const dayAgo = nowMs - 24 * 60 * 60 * 1000;
    const recent = history.runs.filter(r => Date.parse(r.at) > dayAgo);
    if (recent.length >= limits.maxRunsPerDay) {
      throw new Error(
        `Daily live-run cap reached (${recent.length}/${limits.maxRunsPerDay} in the last 24 h). ` +
          `This cap exists to keep a retry loop from becoming a login storm.`,
      );
    }

    // Deliberately the last run on ANY branch, not just this one. A per-branch limiter is
    // trivially defeated by passing a different --branch on each retry, and the thing being
    // protected is the live server, which does not care which branch the traffic came from.
    // The gateway enforces its own ceiling too (10 auth attempts per minute per IP,
    // server.ts:545), and tripping that reads as a login failure rather than a rate limit.
    const lastRun = recent.map(r => Date.parse(r.at)).sort().pop();
    if (lastRun !== undefined) {
      const waitMs = limits.minIntervalMinutes * 60 * 1000 - (nowMs - lastRun);
      if (waitMs > 0) {
        const previous = recent.find(r => Date.parse(r.at) === lastRun)?.branch ?? 'another branch';
        throw new Error(
          `Last live run (${previous}) was ${Math.round((nowMs - lastRun) / 1000)} s ago. ` +
            `Wait ${Math.ceil(waitMs / 1000)} s (minimum interval ${limits.minIntervalMinutes} min).`,
        );
      }
    }
  }

  recordRun(branch: string, now: Date = new Date()): void {
    const history = readJson<RunHistoryFile>(this.historyPath, { runs: [] });
    const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
    history.runs = history.runs.filter(r => Date.parse(r.at) > dayAgo);
    history.runs.push({ branch, at: now.toISOString() });
    writeJson(this.historyPath, history);
  }

  private write(lock: WorldLockFile): void {
    fs.mkdirSync(this.dir, { recursive: true });
    writeJson(this.lockPath, lock);
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
