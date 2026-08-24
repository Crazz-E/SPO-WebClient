/**
 * The precheck receipt — the session's static proof, re-keyed by the worker.
 *
 * `npm run gate` runs typecheck, lint and the Jest suite session-side before it queues
 * anything (`gate:precheck`). The worker then ran all three again inside the exclusive
 * bench: ~113 s of the median 278 s gate job spent re-proving what was already proven,
 * on the one resource the whole machine has to queue for.
 *
 * A receipt records that the precheck passed **on a named tree**. The worker looks one up
 * by the fingerprint IT computes itself (`fingerprintTree` over the worktree on disk) and,
 * on a match, skips only the static replay. Everything the bench alone can do —
 * `build:e2e`, the routing, the President exclusion, the live drive — still runs.
 *
 * Two properties make this safe to trust:
 *
 * 1. **The session never supplies the identity.** It writes a file; the worker decides
 *    which file to look for. A receipt for another tree is not "rejected", it is simply
 *    never opened. That is the guard issue #126 asks for: nothing a session says can make
 *    the worker skip work on a tree the session did not actually precheck.
 * 2. **Fail closed, always.** Absent, unreadable, wrong version, wrong tree, wrong
 *    worktree, too old — every one of those replays the static stage. The only path that
 *    skips is an exact match; there is no "probably fine".
 *
 * And the backstop: what the receipt moves off the bench, CI replays independently on
 * every pull request (`.github/workflows/ci.yml` runs lint, typecheck, build, `npm test`
 * and `coverage:changed`). A receipt cannot make a broken branch mergeable — only faster
 * to gate.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { BenchPaths } from './paths';
import type { TreeFingerprint } from './fingerprint';

/**
 * The shape version. A receipt written by an older client is refused rather than
 * interpreted — bump this whenever the steps a receipt stands for change, so a receipt
 * can never claim more than it proved.
 */
export const RECEIPT_VERSION = 1;

/** Exactly the stages verify-gate's static replay covers; nothing else may be skipped. */
export const RECEIPT_STEPS: readonly string[] = ['typecheck', 'lint', 'test'];

/**
 * How long a receipt stays usable.
 *
 * The fingerprint already proves the *tree* has not moved, so strictly the age adds
 * nothing about the code. What it bounds is everything the fingerprint deliberately
 * ignores — an `npm install`, a Node upgrade, a toolchain change under `node_modules/`.
 * Two hours comfortably covers a deposit sitting through a convoy queue, and a receipt
 * that expires costs a replay, never a wrong verdict.
 */
export const RECEIPT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface StaticReceipt {
  version: number;
  /**
   * The tree the session prechecked, as the session fingerprinted it. Kept for the
   * report and re-checked against the worker's own reading — never used to decide which
   * tree is being judged.
   */
  fingerprint: TreeFingerprint;
  /** Absolute path of the worktree the precheck ran in. */
  worktree: string;
  branch: string;
  /** Which static stages actually passed. Must cover RECEIPT_STEPS to be usable. */
  steps: string[];
  createdAt: string;
  /** Informational: which Node produced the proof. */
  node: string;
  /** Informational: which machine. A receipt is never shared between machines. */
  host: string;
}

/**
 * Where a receipt for this (tree, worktree) pair lives.
 *
 * The worktree is part of the key, not only of the body: two worktrees standing on the
 * same clean commit fingerprint identically, and without the path in the name the second
 * precheck would overwrite the first — costing the first session a replay for no reason.
 */
export function receiptFile(
  paths: BenchPaths,
  fingerprint: TreeFingerprint,
  worktree: string,
): string {
  const key = crypto.createHash('sha256').update(worktree).digest('hex').slice(0, 12);
  return path.join(paths.receipts, `${fingerprint.hash}-${key}.json`);
}

/** Written tmp-then-rename, like every other spool file: a reader never sees a half-write. */
export function writeReceipt(paths: BenchPaths, receipt: StaticReceipt): string {
  fs.mkdirSync(paths.receipts, { recursive: true });
  const target = receiptFile(paths, receipt.fingerprint, receipt.worktree);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, target);
  return target;
}

/** The receipt at `file`, or null when it is absent or not readable JSON. */
export function readReceipt(file: string): StaticReceipt | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as StaticReceipt;
  } catch {
    return null;
  }
}

export interface ReceiptVerdict {
  /** True only on an exact match; every other answer means "replay the static stage". */
  ok: boolean;
  /** Why it cannot be used — always populated when ok is false, for the job log. */
  why?: string;
}

/**
 * Judge a receipt against the tree the worker actually has in front of it.
 *
 * `fingerprint` MUST be the worker's own reading of the worktree on disk. Passing the
 * session's copy would make the whole mechanism circular.
 */
export function validateReceipt(
  receipt: StaticReceipt | null,
  fingerprint: TreeFingerprint,
  worktree: string,
  nowMs: number,
  maxAgeMs: number = RECEIPT_MAX_AGE_MS,
): ReceiptVerdict {
  if (!receipt) return { ok: false, why: 'no readable precheck receipt for this tree' };
  if (receipt.version !== RECEIPT_VERSION) {
    return { ok: false, why: `receipt version ${receipt.version} (expected ${RECEIPT_VERSION})` };
  }
  if (receipt.fingerprint?.hash !== fingerprint.hash) {
    return { ok: false, why: 'receipt fingerprint does not match the tree on disk' };
  }
  if (receipt.worktree !== worktree) {
    return { ok: false, why: `receipt was written for ${receipt.worktree}` };
  }
  const missing = RECEIPT_STEPS.filter(step => !receipt.steps?.includes(step));
  if (missing.length > 0) {
    return { ok: false, why: `receipt does not cover ${missing.join(', ')}` };
  }
  const age = nowMs - Date.parse(receipt.createdAt);
  if (!Number.isFinite(age)) return { ok: false, why: 'receipt has no readable timestamp' };
  if (age > maxAgeMs) {
    return { ok: false, why: `receipt is ${Math.round(age / 60_000)} min old (limit ${Math.round(maxAgeMs / 60_000)} min)` };
  }
  return { ok: true };
}

/**
 * The one call the worker makes: is there a usable receipt for THIS tree, in THIS
 * worktree, right now? Returns the reason when there is not, so the job log says why it
 * replayed rather than leaving the session guessing.
 */
export function lookupReceipt(
  paths: BenchPaths,
  fingerprint: TreeFingerprint,
  worktree: string,
  nowMs: number,
): ReceiptVerdict & { receipt: StaticReceipt | null; file: string } {
  const file = receiptFile(paths, fingerprint, worktree);
  const receipt = readReceipt(file);
  return { ...validateReceipt(receipt, fingerprint, worktree, nowMs), receipt, file };
}

/**
 * Drop receipts older than the retention window. They are keyed by tree content, so every
 * commit leaves one behind for good — without this the directory grows without bound.
 * Returns how many were removed.
 */
export function pruneReceipts(
  paths: BenchPaths,
  maxAgeMs: number,
  nowMs: number = Date.now(),
): number {
  let removed = 0;
  let entries: string[];
  try {
    entries = fs.readdirSync(paths.receipts);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const file = path.join(paths.receipts, entry);
    try {
      if (nowMs - fs.statSync(file).mtimeMs <= maxAgeMs) continue;
      fs.rmSync(file);
      removed++;
    } catch {
      // Vanished under us, or not ours to remove: nothing to do either way.
    }
  }
  return removed;
}

/** The receipt a precheck writes for the tree it just proved. */
export function buildReceipt(
  fingerprint: TreeFingerprint,
  worktree: string,
  branch: string,
  nowMs: number,
): StaticReceipt {
  return {
    version: RECEIPT_VERSION,
    fingerprint,
    worktree,
    branch,
    steps: [...RECEIPT_STEPS],
    createdAt: new Date(nowMs).toISOString(),
    node: process.version,
    host: os.hostname(),
  };
}
