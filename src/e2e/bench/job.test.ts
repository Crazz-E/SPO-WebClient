import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { benchPaths, ensureLayout, type BenchPaths } from './paths';
import { DuplicateJobError, newJobId, Spool, type JobReport, type JobRequest } from './job';

function tempBench(): BenchPaths {
  const paths = benchPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-job-')));
  ensureLayout(paths);
  return paths;
}

const FP = { head: 'abc123', hash: 'deadbeef', clean: true };

function requestFor(worktree: string): Omit<JobRequest, 'id' | 'submittedAt'> {
  return {
    type: 'gate',
    worktree,
    branch: 'fix/x',
    fingerprint: FP,
    submitter: { pid: 1234 },
    args: [],
  };
}

function reportFor(id: string): JobReport {
  return {
    id,
    type: 'gate',
    worktree: '/wt/a',
    branch: 'fix/x',
    verdict: 'PASS',
    fingerprints: { atSubmit: FP },
    targetMoved: false,
    startedAt: '2026-08-22T09:00:00Z',
  };
}

describe('newJobId', () => {
  it('orders lexically by deposit time', () => {
    const early = newJobId(1_000);
    const late = newJobId(2_000_000_000_000);
    expect([late, early].sort()[0]).toBe(early);
  });
});

describe('Spool — deposit and queue order', () => {
  it('queues oldest first, whatever the deposit order of names', () => {
    const spool = new Spool(tempBench());
    const first = spool.submit(requestFor('/wt/a'), 1_000);
    const second = spool.submit(requestFor('/wt/b'), 2_000);
    expect(spool.queued().map(e => e.request.id)).toEqual([first.id, second.id]);
  });

  it('refuses a second deposit for the same worktree, naming the queued job', () => {
    const spool = new Spool(tempBench());
    const first = spool.submit(requestFor('/wt/a'), 1_000);
    expect(() => spool.submit(requestFor('/wt/a'), 2_000)).toThrow(DuplicateJobError);
    expect(() => spool.submit(requestFor('/wt/a'), 2_000)).toThrow(new RegExp(first.id));
  });

  it('accepts deposits from different worktrees', () => {
    const spool = new Spool(tempBench());
    spool.submit(requestFor('/wt/a'), 1_000);
    expect(() => spool.submit(requestFor('/wt/b'), 2_000)).not.toThrow();
  });

  it('skips an unreadable spool entry instead of wedging the queue', () => {
    const paths = tempBench();
    const spool = new Spool(paths);
    fs.writeFileSync(path.join(paths.spool, 'job-00000000000000-bad.json'), '{broken', 'utf8');
    const good = spool.submit(requestFor('/wt/a'), 2_000);
    expect(spool.queued().map(e => e.request.id)).toEqual([good.id]);
  });
});

describe('Spool — claim, discard, finish', () => {
  it('claim moves the file into running/ atomically', () => {
    const paths = tempBench();
    const spool = new Spool(paths);
    const job = spool.submit(requestFor('/wt/a'), 1_000);
    const runningFile = spool.claim(spool.queued()[0].file);
    expect(spool.queued()).toHaveLength(0);
    expect(spool.running().map(e => e.request.id)).toEqual([job.id]);
    spool.finish(runningFile);
    expect(spool.running()).toHaveLength(0);
  });

  it('discard drops a queued entry without running it', () => {
    const spool = new Spool(tempBench());
    spool.submit(requestFor('/wt/a'), 1_000);
    spool.discard(spool.queued()[0].file);
    expect(spool.queued()).toHaveLength(0);
  });
});

describe('Spool — lease release markers', () => {
  it('records and reads a release request, and finish() clears it', () => {
    const paths = tempBench();
    const spool = new Spool(paths);
    spool.submit(requestFor('/wt/a'), 1_000);
    const runningFile = spool.claim(spool.queued()[0].file);
    const id = spool.running()[0].request.id;
    expect(spool.releaseRequested(id)).toBe(false);
    spool.requestRelease(id);
    expect(spool.releaseRequested(id)).toBe(true);
    // The marker is not a job: listings still see exactly one running entry.
    expect(spool.running()).toHaveLength(1);
    spool.finish(runningFile);
    expect(spool.releaseRequested(id)).toBe(false);
  });
});

describe('Spool — on a bench that does not exist yet', () => {
  it('lists nothing rather than throwing', () => {
    const spool = new Spool(benchPaths(path.join(os.tmpdir(), 'spo-bench-never-created')));
    expect(spool.queued()).toEqual([]);
    expect(spool.running()).toEqual([]);
    expect(() => spool.purgeDone(1)).not.toThrow();
  });
});

describe('Spool — reports', () => {
  it('round-trips a report, and reads null for an unknown id', () => {
    const spool = new Spool(tempBench());
    const report = reportFor('job-1');
    spool.writeReport(report);
    expect(spool.readReport('job-1')).toEqual(report);
    expect(spool.readReport('job-nope')).toBeNull();
  });

  it('isPending sees queued and running jobs, and not finished ones', () => {
    const spool = new Spool(tempBench());
    const job = spool.submit(requestFor('/wt/a'), 1_000);
    expect(spool.isPending(job.id)).toBe(true);
    const runningFile = spool.claim(spool.queued()[0].file);
    expect(spool.isPending(job.id)).toBe(true);
    spool.finish(runningFile);
    expect(spool.isPending(job.id)).toBe(false);
  });

  it('purges only reports older than the retention window', () => {
    const paths = tempBench();
    const spool = new Spool(paths);
    spool.writeReport(reportFor('job-old'));
    spool.writeReport(reportFor('job-new'));
    const oldFile = path.join(paths.done, 'job-old.json');
    const past = (Date.now() - 48 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(oldFile, past, past);
    spool.purgeDone(24 * 60 * 60 * 1000);
    expect(spool.readReport('job-old')).toBeNull();
    expect(spool.readReport('job-new')).not.toBeNull();
  });
});
