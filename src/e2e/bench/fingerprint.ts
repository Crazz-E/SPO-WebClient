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
  /**
   * True when the tree IS its HEAD — no diff, nothing staged, nothing untracked. An
   * attestation names a sha, so a gate may only attest a tree that is that sha.
   */
  clean: boolean;
}

export type GitRunner = (worktree: string, args: string[], input?: string) => string;

/**
 * `env` is merged over the process environment, never substituted for it: git needs `HOME`
 * to find its config and `PATH` to find its helpers. It exists so a caller can hand a
 * network command the credentials from ./git-auth without those credentials being in the
 * environment of every other git call the bench makes.
 */
export function runGit(
  worktree: string,
  args: string[],
  input?: string,
  env?: NodeJS.ProcessEnv,
): string {
  return execFileSync('git', ['-C', worktree, ...args], {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : undefined,
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
  return { head, hash, clean: diff === '' && status === '' };
}

/**
 * The sha a ref points at, or undefined when it does not exist.
 *
 * Used for `origin/main` — the base a gate was judged against. It is genuinely optional:
 * a fetch can fail offline, and a repo with no remote has no such ref. An absent base is
 * reported as absent, never as "the base matches".
 */
export function resolveRef(
  worktree: string,
  ref: string,
  git: GitRunner = runGit,
): string | undefined {
  try {
    return git(worktree, ['rev-parse', '--verify', '--quiet', ref]).trim() || undefined;
  } catch {
    return undefined;
  }
}
