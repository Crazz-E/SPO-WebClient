/**
 * Serving the merge queue — src/e2e/bench/merge-queue.ts.
 *
 * Two properties this file exists to pin:
 *
 * 1. **Only GitHub's own queue refs are ever gated.** A ref that merely looks similar must
 *    not pull the bench into driving something nobody asked about.
 * 2. **An entry is gated exactly once.** Gating twice wastes the one serialised resource;
 *    gating zero times leaves a required check unreported until the queue ejects the entry.
 */

import {
  listQueueEntries,
  mayReuseVerdict,
  parseQueueRefs,
  serveMergeQueue,
  shouldGate,
  treeOf,
  type QueueEntry,
} from './merge-queue';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('parseQueueRefs', () => {
  it('takes the queue refs and their shas', () => {
    const raw = [
      `${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-168-ce151856`,
      `${SHA_B}\trefs/heads/gh-readonly-queue/main/pr-170-ce151856`,
    ].join('\n');
    expect(parseQueueRefs(raw)).toEqual<QueueEntry[]>([
      { ref: 'gh-readonly-queue/main/pr-168-ce151856', sha: SHA_A },
      { ref: 'gh-readonly-queue/main/pr-170-ce151856', sha: SHA_B },
    ]);
  });

  it.each([
    ['an ordinary branch', `${SHA_A}\trefs/heads/main`],
    ['a session branch', `${SHA_A}\trefs/heads/claude-crazz/task-158-stage-d1`],
    ['a tag', `${SHA_A}\trefs/tags/v1.2.3`],
    ['a branch merely NAMED like a queue ref', `${SHA_A}\trefs/heads/my-gh-readonly-queue/main/pr-1`],
    ['a pull ref', `${SHA_A}\trefs/pull/168/head`],
  ])('ignores %s', (_label, line) => {
    expect(parseQueueRefs(line)).toEqual([]);
  });

  it('ignores blank and malformed lines rather than throwing', () => {
    expect(parseQueueRefs('\n\nnot-a-ref-line\n   \n')).toEqual([]);
  });

  it('reads nothing from an empty listing — no queue is the normal state', () => {
    expect(parseQueueRefs('')).toEqual([]);
  });
});

describe('listQueueEntries', () => {
  it('returns what the listing carries', () => {
    const entries = listQueueEntries(
      () => `${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-1-abc`,
      '/repo',
      () => {},
    );
    expect(entries).toEqual([{ ref: 'gh-readonly-queue/main/pr-1-abc', sha: SHA_A }]);
  });

  it('treats an unreachable remote as a tick with nothing to do, not an error', () => {
    // The queue is GitHub's to manage. A listing we could not take must not wedge the
    // worker loop or stop it serving the ordinary spool.
    const logs: string[] = [];
    expect(
      listQueueEntries(
        () => {
          throw new Error('could not resolve host');
        },
        '/repo',
        line => logs.push(line),
      ),
    ).toEqual([]);
    expect(logs.join('\n')).toMatch(/could not list refs/);
  });
});

describe('shouldGate — exactly once', () => {
  const entry: QueueEntry = { ref: 'gh-readonly-queue/main/pr-1-abc', sha: SHA_A };

  it('gates an entry nobody has answered or claimed', () => {
    expect(shouldGate(entry, () => false, () => false)).toEqual({ skip: false });
  });

  it('skips an entry that already carries a bench/gate status', () => {
    const decision = shouldGate(entry, () => true, () => false);
    expect(decision.skip).toBe(true);
    expect(decision.why).toMatch(/already has a bench\/gate status/);
  });

  it('skips an entry whose job is already in the spool', () => {
    const decision = shouldGate(entry, () => false, () => true);
    expect(decision.skip).toBe(true);
    expect(decision.why).toMatch(/already in the spool/);
  });

  it('checks the spool before the status — a running job has not published yet', () => {
    // Order matters: a job that is mid-flight has no status yet, so asking about the
    // status first would deposit a second job for the same entry every tick.
    expect(shouldGate(entry, () => false, () => true).why).toMatch(/spool/);
  });

  it('asks about the entry it was given', () => {
    const asked: string[] = [];
    shouldGate(entry, sha => (asked.push(sha), false), () => false);
    expect(asked).toEqual([SHA_A]);
  });
});

describe('treeOf', () => {
  it('asks for the TREE, not the commit — that distinction IS the dedup', () => {
    const calls: string[][] = [];
    treeOf((args, _cwd) => (calls.push(args), 'tree-sha\n'), 'gh-readonly-queue/main/pr-1-abc', '/co');
    expect(calls[0]).toEqual(['rev-parse', 'gh-readonly-queue/main/pr-1-abc^{tree}']);
  });

  it('reads null for a ref the checkout does not have — a reason to gate, not an error', () => {
    expect(
      treeOf(() => {
        throw new Error('unknown revision');
      }, 'x', '/co'),
    ).toBeNull();
    expect(treeOf(() => '  \n', 'x', '/co')).toBeNull();
  });
});

describe('mayReuseVerdict — a live slot only where it proves something', () => {
  const passing = { head: SHA_B, tree: 'T1', verdict: 'PASS', fingerprintStable: true };

  it('reuses a PASS that shares the tree — identical code proves nothing twice', () => {
    // The common case with one entry at a time: nothing landed between the PR head's gate
    // and its turn, so the merge commit differs while its tree does not.
    const decision = mayReuseVerdict('T1', [passing]);
    expect(decision.reuseFrom).toBe(SHA_B);
    expect(decision.why).toMatch(/identical tree/);
  });

  it('drives when the tree differs — that is main having moved, the case worth paying for', () => {
    expect(mayReuseVerdict('T2', [passing]).reuseFrom).toBeNull();
  });

  it.each([
    ['a FAIL', { ...passing, verdict: 'FAIL' }],
    ['an unstable PASS', { ...passing, fingerprintStable: false }],
    ['an attestation with no readable tree', { ...passing, tree: null }],
  ])('never reuses %s', (_label, attestation) => {
    expect(mayReuseVerdict('T1', [attestation]).reuseFrom).toBeNull();
  });

  it('drives when the entry tree itself could not be read', () => {
    // Fails toward driving. Reusing on an unknown tree would publish a PASS for code
    // nobody has looked at.
    expect(mayReuseVerdict(null, [passing]).reuseFrom).toBeNull();
  });

  it('drives when there is nothing attested at all', () => {
    expect(mayReuseVerdict('T1', []).reuseFrom).toBeNull();
  });
});

describe('serveMergeQueue — one pass over the queue', () => {
  interface Recorder {
    deposited: QueueEntry[];
    reused: { from: string; to: string }[];
    logs: string[];
    deps: Parameters<typeof serveMergeQueue>[0];
  }

  function recorder(
    refs: string,
    attested: { head: string; tree: string | null; verdict: string; fingerprintStable: boolean }[] = [],
    trees: Record<string, string> = {},
    pending: (sha: string) => boolean = () => false,
  ): Recorder {
    const r: Partial<Recorder> = { deposited: [], reused: [], logs: [] };
    r.deps = {
      lsRemote: () => refs,
      git: args => {
        const ref = args[1].replace('^{tree}', '');
        if (!(ref in trees)) throw new Error('unknown revision');
        return trees[ref];
      },
      attested: () => attested,
      pendingFor: pending,
      reuse: (from, to) => void r.reused!.push({ from, to }),
      deposit: entry => void r.deposited!.push(entry),
      checkoutDir: '/co',
      log: line => void r.logs!.push(line),
    };
    return r as Recorder;
  }

  it('does nothing at all when there is no queue — the normal state', () => {
    const r = recorder('');
    expect(serveMergeQueue(r.deps)).toBe(0);
    expect(r.deposited).toHaveLength(0);
    expect(r.logs).toHaveLength(0);
  });

  it('deposits a gate for an entry nobody has answered', () => {
    const r = recorder(`${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-1-abc`);
    expect(serveMergeQueue(r.deps)).toBe(1);
    expect(r.deposited).toEqual([{ ref: 'gh-readonly-queue/main/pr-1-abc', sha: SHA_A }]);
    expect(r.reused).toHaveLength(0);
  });

  it('reuses a verdict when the entry tree is already driven — no live slot', () => {
    // The common case at one entry a time: the merge commit is new, its tree is not.
    const r = recorder(
      `${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-1-abc`,
      [{ head: SHA_B, tree: 'T1', verdict: 'PASS', fingerprintStable: true }],
      { [SHA_A]: 'T1' },
    );
    expect(serveMergeQueue(r.deps)).toBe(1);
    expect(r.reused).toEqual([{ from: SHA_B, to: SHA_A }]);
    expect(r.deposited).toHaveLength(0);
  });

  it('gates rather than reuses when the tree differs — main moved', () => {
    const r = recorder(
      `${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-1-abc`,
      [{ head: SHA_B, tree: 'T1', verdict: 'PASS', fingerprintStable: true }],
      { [SHA_A]: 'T2' },
    );
    serveMergeQueue(r.deps);
    expect(r.deposited).toHaveLength(1);
    expect(r.reused).toHaveLength(0);
  });

  it('skips an entry that already carries a status', () => {
    const r = recorder(`${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-1-abc`, [
      { head: SHA_A, tree: 'T1', verdict: 'PASS', fingerprintStable: true },
    ]);
    expect(serveMergeQueue(r.deps)).toBe(0);
    expect(r.deposited).toHaveLength(0);
  });

  it('skips an entry whose job is already in the spool — no second deposit per tick', () => {
    const r = recorder(`${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-1-abc`, [], {}, () => true);
    expect(serveMergeQueue(r.deps)).toBe(0);
    expect(r.deposited).toHaveLength(0);
  });

  it('handles several entries independently in one pass', () => {
    const r = recorder(
      [
        `${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-1-abc`,
        `${SHA_B}\trefs/heads/gh-readonly-queue/main/pr-2-abc`,
      ].join('\n'),
      [{ head: 'c'.repeat(40), tree: 'T1', verdict: 'PASS', fingerprintStable: true }],
      { [SHA_A]: 'T1' },
    );
    expect(serveMergeQueue(r.deps)).toBe(2);
    expect(r.reused.map(x => x.to)).toEqual([SHA_A]);
    expect(r.deposited.map(x => x.sha)).toEqual([SHA_B]);
  });

  it('says what it did, for a human reading the worker log', () => {
    const r = recorder(`${SHA_A}\trefs/heads/gh-readonly-queue/main/pr-1-abc`);
    serveMergeQueue(r.deps);
    expect(r.logs.join('\n')).toMatch(/gating aaaaaaaa \(gh-readonly-queue\/main\/pr-1-abc\)/);
  });
});
