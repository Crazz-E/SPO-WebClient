/**
 * Make the bench's git traffic to github.com authenticated.
 *
 * **Why this module exists, in one fact:** SPO-WebClient is a *public* repository. Git's
 * HTTP transport tries anonymously first and consults a credential helper only when the
 * server answers `401`. GitHub answers `200` to anonymous reads of a public repo, so
 * `credential.https://github.com.helper = !gh auth git-credential` — which is configured,
 * valid, and works — is **never invoked for this repo**. Proven with `GIT_TRACE=1`: the
 * helper is spawned for the private SPO-Pipeline and never for this one.
 *
 * So every bench fetch has always gone out unauthenticated, and GitHub's anonymous-traffic
 * throttle has always applied to all of it. That is not theoretical: on 2026-09-03 between
 * 07:44:26Z and 07:49:22Z it refused seven consecutive merge-queue fetches of PR #643 and
 * then the nightly, each with
 *
 *     fatal: remote error: GitHub is temporarily limiting some unauthenticated downloads
 *     to protect the stability of the platform. Please retry later or authenticate.
 *
 * `Please retry later or authenticate` names both halves of the fix. This module is the
 * second half; the retry in ./checkout.ts is the first, and is deliberately the *lesser*
 * one — surviving a throttle is worse than not being subject to it.
 *
 * **Where the token goes, and why it goes there.** In the child's environment:
 *
 * - not in `argv`, where every user on the box can read it out of `ps`;
 * - not in a config file, where it becomes a credential at rest that outlives the process
 *   and that nothing is responsible for rotating;
 * - and never logged — `runCommand` appends the child's stdout and stderr to a job log
 *   that ends up in `~/.spo-bench/done/`, so the header must not be something git echoes.
 *
 * `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_n`/`GIT_CONFIG_VALUE_n` is git's own supported way of
 * passing config through the environment, and `http.<url>.extraheader` is the mechanism
 * `actions/checkout` uses for exactly this purpose.
 *
 * **Degradation is towards today, never away from it.** If `gh auth token` cannot produce a
 * token, this returns no environment at all and the fetch behaves exactly as it does now:
 * anonymous, and subject to the throttle. A missing token must never be able to turn a job
 * that would have worked into one that fails.
 */

import { execFileSync } from 'child_process';

/** The host whose traffic gets the header. Everything the bench fetches lives here. */
export const GITHUB_ORIGIN = 'https://github.com/';

/** Environment variables that make a git child authenticate; empty when it cannot. */
export type GitAuthEnv = Record<string, string>;

/**
 * The token `gh` holds for github.com, or null.
 *
 * Read on every call rather than memoised: a token can be rotated under a worker that has
 * been up for days, and a cached one would then fail every fetch until somebody noticed.
 * The call is local (it reads `~/.config/gh/hosts.yml`) and costs milliseconds against a
 * checkout that takes tens of seconds.
 */
export function readGhToken(exec: typeof execFileSync = execFileSync): string | null {
  try {
    const out = exec('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 15_000 });
    return String(out).trim() || null;
  } catch {
    // `gh` absent, logged out, or wedged. The caller falls back to anonymous.
    return null;
  }
}

/**
 * Build the environment that makes git send an `Authorization` header to github.com.
 *
 * `baseEnv` is the environment the child will inherit — normally `process.env`. Any
 * `GIT_CONFIG_COUNT` already in it is respected and appended to, rather than clobbered:
 * silently dropping somebody else's git config would be a new bug of exactly the kind this
 * module was written to remove.
 */
export function gitAuthEnv(
  token: string | null,
  baseEnv: NodeJS.ProcessEnv = process.env,
): GitAuthEnv {
  if (!token) return {};
  const existing = Number(baseEnv.GIT_CONFIG_COUNT);
  const base = Number.isInteger(existing) && existing > 0 ? existing : 0;
  // Basic auth with any non-empty username and the token as the password is what GitHub
  // accepts over HTTPS; `x-access-token` is the conventional placeholder.
  const basic = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  return {
    [`GIT_CONFIG_KEY_${base}`]: `http.${GITHUB_ORIGIN}.extraheader`,
    [`GIT_CONFIG_VALUE_${base}`]: `Authorization: Basic ${basic}`,
    GIT_CONFIG_COUNT: String(base + 1),
  };
}

/**
 * The whole thing: read the token and turn it into an environment.
 *
 * `log` is called once when there is no token, because the resulting anonymous fetch is
 * the failure mode this module exists to prevent — it must not be silent when it happens
 * anyway. It is not called on success: a line per fetch saying "authenticated" would be
 * noise, and the absence of the warning already says it.
 */
export function githubAuthEnv(
  log: (line: string) => void,
  readToken: () => string | null = readGhToken,
  baseEnv: NodeJS.ProcessEnv = process.env,
): GitAuthEnv {
  const token = readToken();
  if (!token) {
    log('git auth: no gh token — fetches go out unauthenticated and may be throttled');
    return {};
  }
  return gitAuthEnv(token, baseEnv);
}
