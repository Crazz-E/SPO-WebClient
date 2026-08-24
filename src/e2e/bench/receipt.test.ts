/**
 * The precheck receipt — src/e2e/bench/receipt.ts.
 *
 * The whole value of this file is that it FAILS CLOSED: every case below that is not an
 * exact match must answer "replay the static stage". The one path that skips work is the
 * last one, and it only opens when the worker's own fingerprint of the tree is the one
 * the receipt names.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { benchPaths, ensureLayout, type BenchPaths } from './paths';
import type { TreeFingerprint } from './fingerprint';
import {
  buildReceipt,
  lookupReceipt,
  pruneReceipts,
  readReceipt,
  receiptFile,
  validateReceipt,
  writeReceipt,
  RECEIPT_MAX_AGE_MS,
  RECEIPT_STEPS,
  RECEIPT_VERSION,
  type StaticReceipt,
} from './receipt';

const NOW = 1_800_000_000_000;
const WORKTREE = '/home/dev/SPO-WebClient/.claude/worktrees/task-1';
const TREE: TreeFingerprint = { head: 'a'.repeat(40), hash: 'tree-hash-1', clean: true };

function tempBench(): BenchPaths {
  const paths = benchPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-receipt-')));
  ensureLayout(paths);
  return paths;
}

/** Force a file's mtime onto the test's fictional clock — prune reads mtime, not content. */
function stamp(file: string, atMs: number): void {
  fs.utimesSync(file, new Date(atMs), new Date(atMs));
}

function receipt(overrides: Partial<StaticReceipt> = {}): StaticReceipt {
  return { ...buildReceipt(TREE, WORKTREE, 'fix/x', NOW), ...overrides };
}

describe('buildReceipt', () => {
  it('records the tree, the worktree and every static step it stands for', () => {
    const built = buildReceipt(TREE, WORKTREE, 'fix/x', NOW);
    expect(built.version).toBe(RECEIPT_VERSION);
    expect(built.fingerprint).toEqual(TREE);
    expect(built.worktree).toBe(WORKTREE);
    expect(built.branch).toBe('fix/x');
    expect(built.steps).toEqual([...RECEIPT_STEPS]);
    expect(built.createdAt).toBe(new Date(NOW).toISOString());
    expect(built.node).toBe(process.version);
    expect(built.host).toBe(os.hostname());
  });

  it('covers exactly the three stages verify-gate replays — no more', () => {
    expect([...RECEIPT_STEPS]).toEqual(['typecheck', 'lint', 'test']);
  });
});

describe('receiptFile', () => {
  it('keys on the tree hash so a different tree never finds this receipt', () => {
    const paths = tempBench();
    const other = receiptFile(paths, { ...TREE, hash: 'tree-hash-2' }, WORKTREE);
    expect(receiptFile(paths, TREE, WORKTREE)).not.toBe(other);
    expect(path.basename(receiptFile(paths, TREE, WORKTREE))).toContain('tree-hash-1');
  });

  it('keys on the worktree too, so two worktrees on the same commit do not overwrite each other', () => {
    const paths = tempBench();
    // Same clean commit in two checkouts fingerprints identically — only the path differs.
    expect(receiptFile(paths, TREE, '/wt/a')).not.toBe(receiptFile(paths, TREE, '/wt/b'));
  });
});

describe('writeReceipt / readReceipt', () => {
  it('round-trips through the file the lookup will open', () => {
    const paths = tempBench();
    const file = writeReceipt(paths, receipt());
    expect(file).toBe(receiptFile(paths, TREE, WORKTREE));
    expect(readReceipt(file)).toEqual(receipt());
  });

  it('creates the receipts directory when the bench root predates it', () => {
    const paths = benchPaths(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-old-')));
    // Deliberately NOT ensureLayout: an installed bench from before receipts existed.
    const file = writeReceipt(paths, receipt());
    expect(fs.existsSync(file)).toBe(true);
  });

  it('leaves no temporary file behind', () => {
    const paths = tempBench();
    writeReceipt(paths, receipt());
    expect(fs.readdirSync(paths.receipts).filter(f => f.endsWith('.tmp'))).toEqual([]);
  });

  it('reads an absent or corrupt file as no receipt at all', () => {
    const paths = tempBench();
    expect(readReceipt(path.join(paths.receipts, 'nothing.json'))).toBeNull();
    const broken = path.join(paths.receipts, 'broken.json');
    fs.writeFileSync(broken, '{ not json', 'utf8');
    expect(readReceipt(broken)).toBeNull();
  });
});

describe('validateReceipt — every answer but one is "replay"', () => {
  it('accepts a receipt for exactly this tree, in this worktree, within the window', () => {
    expect(validateReceipt(receipt(), TREE, WORKTREE, NOW)).toEqual({ ok: true });
  });

  it('refuses when there is no receipt', () => {
    const verdict = validateReceipt(null, TREE, WORKTREE, NOW);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('no readable precheck receipt');
  });

  it('refuses a receipt written by another version of this mechanism', () => {
    const verdict = validateReceipt(receipt({ version: RECEIPT_VERSION + 1 }), TREE, WORKTREE, NOW);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain(`expected ${RECEIPT_VERSION}`);
  });

  it('refuses when the tree on disk is not the tree the receipt names', () => {
    const moved = { ...TREE, hash: 'tree-hash-moved' };
    const verdict = validateReceipt(receipt(), moved, WORKTREE, NOW);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('does not match the tree on disk');
  });

  it('refuses a receipt from another worktree', () => {
    const verdict = validateReceipt(receipt(), TREE, '/wt/elsewhere', NOW);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain(WORKTREE);
  });

  it('refuses a receipt that does not cover all three static stages', () => {
    const verdict = validateReceipt(receipt({ steps: ['typecheck'] }), TREE, WORKTREE, NOW);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('lint, test');
  });

  it('refuses a receipt with no steps recorded at all', () => {
    const verdict = validateReceipt(
      { ...receipt(), steps: undefined } as unknown as StaticReceipt,
      TREE,
      WORKTREE,
      NOW,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('typecheck, lint, test');
  });

  it('refuses a receipt with no fingerprint at all', () => {
    const verdict = validateReceipt(
      { ...receipt(), fingerprint: undefined } as unknown as StaticReceipt,
      TREE,
      WORKTREE,
      NOW,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('does not match the tree on disk');
  });

  it('refuses an unreadable timestamp rather than treating it as fresh', () => {
    const verdict = validateReceipt(receipt({ createdAt: 'the other day' }), TREE, WORKTREE, NOW);
    expect(verdict.ok).toBe(false);
    expect(verdict.why).toContain('no readable timestamp');
  });

  it('refuses once past the window — the tree is unchanged, but the toolchain may not be', () => {
    const past = validateReceipt(receipt(), TREE, WORKTREE, NOW + RECEIPT_MAX_AGE_MS + 60_000);
    expect(past.ok).toBe(false);
    expect(past.why).toContain('limit 120 min');
    // The edge itself is still inside.
    expect(validateReceipt(receipt(), TREE, WORKTREE, NOW + RECEIPT_MAX_AGE_MS).ok).toBe(true);
  });
});

describe('lookupReceipt — the single call the worker makes', () => {
  it('finds the receipt the precheck wrote for this exact tree', () => {
    const paths = tempBench();
    writeReceipt(paths, receipt());
    const found = lookupReceipt(paths, TREE, WORKTREE, NOW);
    expect(found.ok).toBe(true);
    expect(found.receipt?.branch).toBe('fix/x');
    expect(found.file).toBe(receiptFile(paths, TREE, WORKTREE));
  });

  it('never opens a receipt written for a different tree — it looks elsewhere and finds nothing', () => {
    const paths = tempBench();
    writeReceipt(paths, receipt());
    // The session prechecked tree-hash-1; the worker is holding a tree that hashes
    // differently. There is no negotiation: the worker looks for its own hash.
    const found = lookupReceipt(paths, { ...TREE, hash: 'tree-hash-2' }, WORKTREE, NOW);
    expect(found.ok).toBe(false);
    expect(found.why).toContain('no readable precheck receipt');
    expect(found.receipt).toBeNull();
  });

  it('refuses a receipt whose body was tampered with to name another worktree', () => {
    const paths = tempBench();
    const file = writeReceipt(paths, receipt());
    const forged = { ...receipt(), worktree: '/wt/somebody-else' };
    fs.writeFileSync(file, JSON.stringify(forged), 'utf8');
    const found = lookupReceipt(paths, TREE, WORKTREE, NOW);
    expect(found.ok).toBe(false);
    expect(found.why).toContain('/wt/somebody-else');
  });

  it('answers "replay" when the bench has no receipts directory', () => {
    const paths = benchPaths(path.join(os.tmpdir(), 'spo-bench-does-not-exist-at-all'));
    expect(lookupReceipt(paths, TREE, WORKTREE, NOW).ok).toBe(false);
  });
});

describe('pruneReceipts', () => {
  it('removes what is past the window and keeps what is not', () => {
    const paths = tempBench();
    const stale = writeReceipt(paths, receipt());
    const fresh = writeReceipt(paths, receipt({ worktree: '/wt/fresh' }));
    // mtime is what prune reads, and these files were just written on the real clock —
    // stamp both against the test's clock or "fresh" reads as years old.
    stamp(stale, NOW - 3 * 60 * 60 * 1000);
    stamp(fresh, NOW - 60_000);

    expect(pruneReceipts(paths, RECEIPT_MAX_AGE_MS, NOW)).toBe(1);
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('is a no-op when the directory does not exist', () => {
    const paths = benchPaths(path.join(os.tmpdir(), 'spo-bench-absent-root'));
    expect(pruneReceipts(paths, RECEIPT_MAX_AGE_MS, NOW)).toBe(0);
  });

  it('steps over an entry it cannot remove instead of dying on the sweep', () => {
    const paths = tempBench();
    // A stale entry that rmSync refuses (a non-empty directory) stands in for anything
    // the sweep cannot delete — the loop must carry on and simply not count it.
    const stubborn = path.join(paths.receipts, 'not-a-receipt');
    fs.mkdirSync(stubborn);
    fs.writeFileSync(path.join(stubborn, 'inside'), 'x', 'utf8');
    stamp(stubborn, NOW - 3 * 60 * 60 * 1000);
    const stale = writeReceipt(paths, receipt());
    stamp(stale, NOW - 3 * 60 * 60 * 1000);

    expect(pruneReceipts(paths, RECEIPT_MAX_AGE_MS, NOW)).toBe(1);
    expect(fs.existsSync(stubborn)).toBe(true);
    expect(fs.existsSync(stale)).toBe(false);
  });

  it('defaults its clock to now', () => {
    const paths = tempBench();
    writeReceipt(paths, receipt());
    expect(pruneReceipts(paths, RECEIPT_MAX_AGE_MS)).toBe(0);
  });
});
