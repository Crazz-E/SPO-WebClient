/**
 * Tree fingerprint — the moving-target detector.
 *
 * A job carries the PATH of a worktree, and the worker tests whatever is on disk when
 * the job runs. If the session keeps editing while its job is queued or running, the
 * report must say so instead of presenting a clean PASS for code that no longer exists.
 *
 * The fingerprint covers exactly the set `diffText()` in scripts/verify-gate.js scans:
 * HEAD, the diff against HEAD, the porcelain status, and the content of every untracked
 * non-ignored file. What is attested and what is routed are the same set by construction.
 * Ignored files (dist/, node_modules/) are excluded on purpose — the worker's own build
 * must not read as the target moving.
 */

import { execFileSync } from 'child_process';
import * as crypto from 'crypto';

export interface TreeFingerprint {
  /** The commit the tree stands on. */
  head: string;
  /** sha256 over HEAD + diff + status + untracked file contents. */
  hash: string;
}

export type GitRunner = (worktree: string, args: string[], input?: string) => string;

export function runGit(worktree: string, args: string[], input?: string): string {
  return execFileSync('git', ['-C', worktree, ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function fingerprintTree(worktree: string, git: GitRunner = runGit): TreeFingerprint {
  const head = git(worktree, ['rev-parse', 'HEAD']).trim();
  const diff = git(worktree, ['diff', 'HEAD']);
  const status = git(worktree, ['status', '--porcelain', '-uall']);

  const untracked = git(worktree, ['ls-files', '--others', '--exclude-standard'])
    .split('\n')
    .filter(Boolean);
  // `hash-object --stdin-paths` reads every listed file in one call. If a file vanishes
  // between the listing and the read, the tree is moving *right now* — let it throw; the
  // caller reports that honestly rather than fingerprinting a half-state.
  const untrackedHashes =
    untracked.length > 0
      ? git(worktree, ['hash-object', '--stdin-paths'], `${untracked.join('\n')}\n`)
      : '';

  const hash = crypto
    .createHash('sha256')
    .update([head, diff, status, untrackedHashes].join('\u0000'))
    .digest('hex');
  return { head, hash };
}
