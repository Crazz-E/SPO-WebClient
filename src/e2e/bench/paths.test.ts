import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  benchPaths,
  benchRoot,
  ensureLayout,
  HEARTBEAT_STALE_MS,
  heartbeatAgeMs,
  processAlive,
  readWorkerInfo,
  touchHeartbeat,
  workerStatus,
  writeWorkerInfo,
  type WorkerInfo,
} from './paths';

function tempBench() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-'));
  const paths = benchPaths(root);
  ensureLayout(paths);
  return paths;
}

const INFO: WorkerInfo = { pid: 4242, startedAt: '2026-08-22T09:00:00Z', repo: '/repo', port: 8080 };

describe('bench layout', () => {
  it('creates every shared directory', () => {
    const paths = tempBench();
    for (const dir of [paths.spool, paths.running, paths.done, paths.verdicts, paths.world, paths.cache, paths.nightly]) {
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    }
  });

  it('honours SPO_BENCH_DIR, and defaults under the home directory', () => {
    const old = process.env.SPO_BENCH_DIR;
    try {
      process.env.SPO_BENCH_DIR = '/somewhere/else';
      expect(benchRoot()).toBe('/somewhere/else');
      expect(benchPaths().spool).toBe('/somewhere/else/spool');
      expect(benchPaths().cache).toBe('/somewhere/else/cache');
      delete process.env.SPO_BENCH_DIR;
      expect(benchRoot()).toBe(path.join(os.homedir(), '.spo-bench'));
    } finally {
      if (old === undefined) delete process.env.SPO_BENCH_DIR;
      else process.env.SPO_BENCH_DIR = old;
    }
  });
});

describe('worker info', () => {
  it('round-trips', () => {
    const paths = tempBench();
    writeWorkerInfo(paths, INFO);
    expect(readWorkerInfo(paths)).toEqual(INFO);
  });

  it('reads null when the file is missing or corrupt', () => {
    const paths = tempBench();
    expect(readWorkerInfo(paths)).toBeNull();
    fs.writeFileSync(paths.workerFile, 'not json', 'utf8');
    expect(readWorkerInfo(paths)).toBeNull();
  });
});

describe('heartbeat', () => {
  it('is null before the first beat, near-zero right after', () => {
    const paths = tempBench();
    expect(heartbeatAgeMs(paths)).toBeNull();
    touchHeartbeat(paths);
    expect(heartbeatAgeMs(paths)).toBeLessThan(5_000);
  });

  it('reads null when the file exists but its content is not a parseable timestamp', () => {
    const paths = tempBench();
    fs.writeFileSync(paths.heartbeat, 'not a number\n', 'utf8');
    expect(heartbeatAgeMs(paths)).toBeNull();
  });

  // Action B5.3: the contract is CONTENT, never mtime -- these two cases are the ones that tell
  // them apart. A reader reverted to fs.statSync(...).mtimeMs would flip BOTH assertions below.
  it('trusts content over mtime: stale content with a freshly-bumped mtime (e.g. an unrelated touch, a backup pass) still reads stale', () => {
    const paths = tempBench();
    const staleWrittenMs = Date.now() - HEARTBEAT_STALE_MS - 5_000;
    fs.writeFileSync(paths.heartbeat, `${staleWrittenMs}\n`, 'utf8');
    const freshTime = new Date();
    fs.utimesSync(paths.heartbeat, freshTime, freshTime); // mtime says "just now"; content still says stale
    expect(heartbeatAgeMs(paths)).toBeGreaterThan(HEARTBEAT_STALE_MS);
  });

  it('trusts content over mtime: fresh content with a stale mtime (e.g. a `cp -p`-preserved copy) still reads fresh', () => {
    const paths = tempBench();
    const freshWrittenMs = Date.now();
    fs.writeFileSync(paths.heartbeat, `${freshWrittenMs}\n`, 'utf8');
    const oldTime = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(paths.heartbeat, oldTime, oldTime); // mtime says 10 minutes old; content still says now
    expect(heartbeatAgeMs(paths)).toBeLessThan(5_000);
  });
});

describe('workerStatus — what a submitter learns at deposit time', () => {
  it('reports a never-installed worker', () => {
    const status = workerStatus(tempBench());
    expect(status.alive).toBe(false);
    expect(status.reason).toMatch(/no worker registered/);
  });

  it('reports a dead pid even with a fresh heartbeat', () => {
    const paths = tempBench();
    writeWorkerInfo(paths, INFO);
    touchHeartbeat(paths);
    const status = workerStatus(paths, Date.now(), () => false);
    expect(status.alive).toBe(false);
    expect(status.reason).toMatch(/pid 4242 is not running/);
  });

  it('reports a worker that never heartbeat', () => {
    const paths = tempBench();
    writeWorkerInfo(paths, INFO);
    const status = workerStatus(paths, Date.now(), () => true);
    expect(status.alive).toBe(false);
    expect(status.reason).toMatch(/never heartbeat/);
  });

  it('reports a frozen heartbeat — the crash-loop case systemd cannot see', () => {
    const paths = tempBench();
    writeWorkerInfo(paths, INFO);
    touchHeartbeat(paths);
    const status = workerStatus(paths, Date.now() + HEARTBEAT_STALE_MS + 1_000, () => true);
    expect(status.alive).toBe(false);
    expect(status.reason).toMatch(/heartbeat is \d+ s old/);
  });

  it('reports alive when the pid runs and the heartbeat is fresh', () => {
    const paths = tempBench();
    writeWorkerInfo(paths, INFO);
    touchHeartbeat(paths);
    expect(workerStatus(paths, Date.now(), () => true)).toEqual({ alive: true, info: INFO });
  });
});

describe('processAlive', () => {
  it('sees the current process, and not an absurd pid', () => {
    expect(processAlive(process.pid)).toBe(true);
    expect(processAlive(2 ** 30)).toBe(false);
  });
});
