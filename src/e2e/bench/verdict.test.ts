import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { benchPaths, ensureLayout, type BenchPaths } from './paths';
import {
  ghStatusPublisher,
  listVerdicts,
  publishPendingStatuses,
  statusState,
  writeVerdict,
  type BenchVerdict,
} from './verdict';

function tempBench(): BenchPaths {
  const paths = benchPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-verdict-')));
  ensureLayout(paths);
  return paths;
}

function verdictFor(head: string, overrides: Partial<BenchVerdict> = {}): BenchVerdict {
  return {
    head,
    branch: 'fix/x',
    worktree: '/wt/a',
    verdict: 'PASS',
    fingerprintStable: true,
    jobId: 'job-1',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('attestation files', () => {
  it('writes verdicts/<head>.json and lists it back', () => {
    const paths = tempBench();
    const file = writeVerdict(paths, verdictFor('abc123'));
    expect(path.basename(file)).toBe('abc123.json');
    expect(listVerdicts(paths).map(v => v.verdict.head)).toEqual(['abc123']);
  });

  it('lists nothing on a bench with no verdicts directory', () => {
    expect(listVerdicts(benchPaths(path.join(os.tmpdir(), 'spo-bench-verdict-never')))).toEqual([]);
  });

  it('skips unreadable attestations instead of failing the pass', () => {
    const paths = tempBench();
    fs.writeFileSync(path.join(paths.verdicts, 'bad.json'), '{oops', 'utf8');
    writeVerdict(paths, verdictFor('good'));
    expect(listVerdicts(paths).map(v => v.verdict.head)).toEqual(['good']);
  });
});

describe('statusState', () => {
  it('maps verdicts onto the three GitHub states', () => {
    expect(statusState('PASS')).toBe('success');
    expect(statusState('FAIL')).toBe('failure');
    expect(statusState('STALE')).toBe('failure');
    expect(statusState('BLOCKED')).toBe('failure');
    expect(statusState('DIRTY')).toBe('failure');
    expect(statusState('ENVIRONMENT')).toBe('error');
    expect(statusState('INTERRUPTED')).toBe('error');
  });
});

describe('ghStatusPublisher', () => {
  it('shapes the gh api call, run from the attested worktree', () => {
    const calls: { cmd: string; args: string[]; cwd: string }[] = [];
    const publish = ghStatusPublisher((cmd, args, cwd) => calls.push({ cmd, args, cwd }));
    publish('/wt/a', 'abc123', 'success', 'PASS — job job-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('gh');
    expect(calls[0].cwd).toBe('/wt/a');
    expect(calls[0].args).toEqual(
      expect.arrayContaining([
        'repos/{owner}/{repo}/statuses/abc123',
        'state=success',
        'context=bench/gate',
        'description=PASS — job job-1',
      ]),
    );
  });
});

describe('publishPendingStatuses — the retry-until-pushed loop', () => {
  it('publishes a fresh attestation and stamps it published', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('abc123'));
    const published: string[] = [];
    publishPendingStatuses(paths, (_wt, head) => published.push(head), () => {});
    expect(published).toEqual(['abc123']);
    expect(listVerdicts(paths)[0].verdict.published).toBe(true);
  });

  it('does not republish', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('abc123', { published: true }));
    const published: string[] = [];
    publishPendingStatuses(paths, (_wt, head) => published.push(head), () => {});
    expect(published).toEqual([]);
  });

  it('leaves the attestation untouched when publishing fails (sha not pushed yet)', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('abc123'));
    publishPendingStatuses(
      paths,
      () => {
        throw new Error('HTTP 422: no commit found for SHA');
      },
      () => {},
    );
    expect(listVerdicts(paths)[0].verdict.published).toBeUndefined();
  });

  it('gives up on attestations older than the publish window', () => {
    const paths = tempBench();
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeVerdict(paths, verdictFor('abc123', { createdAt: old }));
    const published: string[] = [];
    publishPendingStatuses(paths, (_wt, head) => published.push(head), () => {});
    expect(published).toEqual([]);
  });

  it('flags an unstable fingerprint in the status description', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('abc123', { verdict: 'STALE', fingerprintStable: false }));
    const descriptions: string[] = [];
    publishPendingStatuses(paths, (_wt, _head, _state, description) => descriptions.push(description), () => {});
    expect(descriptions[0]).toMatch(/STALE \(tree moved\)/);
  });
});
