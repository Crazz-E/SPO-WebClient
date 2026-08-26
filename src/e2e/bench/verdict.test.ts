import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { benchPaths, ensureLayout, type BenchPaths } from './paths';
import {
  ghStatusPublisher,
  listVerdicts,
  publishPendingStatuses,
  STATUS_DESCRIPTION_MAX,
  statusDescription,
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

  it('names the capability exceptions in the GitHub description', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('abc123', { exceptions: 2 }));
    const descriptions: string[] = [];
    publishPendingStatuses(paths, (_wt, _head, _state, description) => descriptions.push(description), () => {});
    expect(descriptions[0]).toMatch(/PASS — 2 capability exception\(s\) — job/);
  });

  it('names the gate base in the GitHub description — the merge-time staleness signal', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('c1', { baseMain: 'abcdef1234567890' }));
    const descriptions: string[] = [];
    publishPendingStatuses(paths, (_wt, _head, _state, description) => descriptions.push(description), () => {});
    expect(descriptions[0]).toBe('PASS — base abcdef12 — job job-1');
  });

  it('omits the base when the attestation carries none', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('c2'));
    const descriptions: string[] = [];
    publishPendingStatuses(paths, (_wt, _head, _state, description) => descriptions.push(description), () => {});
    expect(descriptions[0]).toBe('PASS — job job-1');
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

  it('never publishes a description over the 140-char limit even with a very long jobId', () => {
    const paths = tempBench();
    writeVerdict(
      paths,
      verdictFor('abc123', {
        baseMain: 'f'.repeat(40),
        reusedFrom: 'e'.repeat(40),
        exceptions: 3,
        jobId: 'job-'.repeat(60),
      }),
    );
    const descriptions: string[] = [];
    publishPendingStatuses(paths, (_wt, _head, _state, description) => descriptions.push(description), () => {});
    expect(descriptions[0].length).toBeLessThanOrEqual(STATUS_DESCRIPTION_MAX);
    expect(descriptions[0]).toContain('PASS');
    expect(descriptions[0]).toContain('base ffffffff');
  });
});

describe('statusDescription', () => {
  it('reproduces the short-input format byte-for-byte', () => {
    expect(statusDescription(verdictFor('c1', { baseMain: 'abcdef1234567890' }))).toBe(
      'PASS — base abcdef12 — job job-1',
    );
  });

  it('appends the reused-from sha8 when the verdict is a reuse', () => {
    const description = statusDescription(verdictFor('c1', { reusedFrom: 'e'.repeat(40) }));
    expect(description).toBe('PASS — reused eeeeeeee — job job-1');
  });

  it('composes tree-moved, exceptions, base and reused together, always within the limit', () => {
    const description = statusDescription(
      verdictFor('c1', {
        verdict: 'STALE',
        fingerprintStable: false,
        exceptions: 5,
        baseMain: 'b'.repeat(40),
        reusedFrom: 'e'.repeat(40),
      }),
    );
    expect(description).toBe(
      'STALE (tree moved) — 5 capability exception(s) — base bbbbbbbb — reused eeeeeeee — job job-1',
    );
    expect(description.length).toBeLessThanOrEqual(STATUS_DESCRIPTION_MAX);
  });

  it('truncates the jobId when the protected tail leaves little room', () => {
    const description = statusDescription(
      verdictFor('c1', {
        exceptions: 9,
        baseMain: 'b'.repeat(40),
        reusedFrom: 'e'.repeat(40),
        jobId: 'x'.repeat(200),
      }),
    );
    expect(description.length).toBe(STATUS_DESCRIPTION_MAX);
    expect(description.startsWith('PASS — 9 capability exception(s) — base bbbbbbbb — reused eeeeeeee — job x')).toBe(
      true,
    );
  });
});

describe('publishPendingStatuses — failure-streak logging', () => {
  it('stays quiet for the first two consecutive failures, logs once on the third, quiet again after', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('abc123'));
    const logs: string[] = [];
    const failures = new Map<string, number>();
    const alwaysThrows = () => {
      throw new Error('HTTP 422: no commit found for SHA');
    };

    publishPendingStatuses(paths, alwaysThrows, line => logs.push(line), Date.now(), paths.verdicts, failures);
    expect(logs).toEqual([]);

    publishPendingStatuses(paths, alwaysThrows, line => logs.push(line), Date.now(), paths.verdicts, failures);
    expect(logs).toEqual([]);

    publishPendingStatuses(paths, alwaysThrows, line => logs.push(line), Date.now(), paths.verdicts, failures);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('HTTP 422: no commit found for SHA');
    expect(logs[0]).toContain('abc123'.slice(0, 8));

    publishPendingStatuses(paths, alwaysThrows, line => logs.push(line), Date.now(), paths.verdicts, failures);
    expect(logs).toHaveLength(1);
  });

  it('clears the streak on a success, so a later failure run starts counting from zero', () => {
    const paths = tempBench();
    writeVerdict(paths, verdictFor('abc123'));
    const logs: string[] = [];
    const failures = new Map<string, number>();
    const alwaysThrows = () => {
      throw new Error('boom');
    };

    publishPendingStatuses(paths, alwaysThrows, line => logs.push(line), Date.now(), paths.verdicts, failures);
    publishPendingStatuses(paths, alwaysThrows, line => logs.push(line), Date.now(), paths.verdicts, failures);
    expect(failures.get('abc123')).toBe(2);

    // A success in between (e.g. the sha finally landed) clears the counter.
    writeVerdict(paths, verdictFor('def456'));
    publishPendingStatuses(paths, () => {}, () => {}, Date.now(), paths.verdicts, failures);
    expect(failures.has('def456')).toBe(false);
  });
});
