/**
 * Gateway lifecycle, as the worker drives it.
 *
 * The worker is the ONLY process on this machine that starts a gateway on the bench
 * port, which is what makes `clearPort` safe: anything listening there is either a
 * previous job's leftover or a stray from before the bench existed — never a live
 * session's server, because sessions no longer start one.
 *
 * The gateway is started PER JOB, FROM THE JOB'S WORKTREE: it is part of the code under
 * test (src/server/** routes to L2 flows), so reusing one across jobs would test another
 * session's code.
 */

import { execFileSync, spawn } from 'child_process';
import * as fs from 'fs';
import { toErrorMessage } from '../../shared/error-utils';
import { parseStartupStream } from '../preflight';

export interface GatewayDeps {
  execFile: (cmd: string, args: string[]) => string;
  spawnProcess: typeof spawn;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  kill: (pid: number, signal: NodeJS.Signals | number) => void;
}

export function realGatewayDeps(): GatewayDeps {
  return {
    execFile: (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }),
    spawnProcess: spawn,
    fetchImpl: fetch,
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    kill: (pid, signal) => process.kill(pid, signal),
  };
}

/** Parse `ss -ltnp` output into the pids listening on the port. */
export function parseListeners(ssOutput: string): number[] {
  const pids = new Set<number>();
  for (const match of ssOutput.matchAll(/pid=(\d+)/g)) {
    pids.add(Number(match[1]));
  }
  return [...pids];
}

export function listenersOnPort(port: number, deps: GatewayDeps): number[] {
  try {
    return parseListeners(deps.execFile('ss', ['-ltnp', `sport = :${port}`]));
  } catch {
    return [];
  }
}

/**
 * Guarantee a clean bench: nothing listens on the port when this returns. SIGTERM
 * first, SIGKILL after a grace period, error if something survives (e.g. a process
 * `ss` cannot attribute — root-owned — which a human must look at).
 */
export async function clearPort(port: number, deps: GatewayDeps): Promise<void> {
  let pids = listenersOnPort(port, deps);
  if (pids.length === 0) return;

  for (const pid of pids) safeKill(deps, pid, 'SIGTERM');
  for (let i = 0; i < 10 && listenersOnPort(port, deps).length > 0; i++) await deps.sleep(500);

  pids = listenersOnPort(port, deps);
  for (const pid of pids) safeKill(deps, pid, 'SIGKILL');
  for (let i = 0; i < 10 && listenersOnPort(port, deps).length > 0; i++) await deps.sleep(500);

  const survivors = listenersOnPort(port, deps);
  if (survivors.length > 0) {
    throw new Error(
      `Port ${port} still has listeners after SIGKILL (pids ${survivors.join(', ')}), ` +
        `or a listener ss cannot attribute. A human must free the port.`,
    );
  }
}

export interface RunningGateway {
  pid: number;
  stop: () => Promise<void>;
}

/**
 * How long a cold gateway may take to reach phase=ready (cache build included):
 * one poll per second, attempt-counted so an injected instant sleep stays bounded.
 */
export const READY_POLL_ATTEMPTS = 180;
const READY_POLL_MS = 1_000;

/**
 * How long ONE readiness probe may hang before it is abandoned and retried.
 *
 * It used to be the whole budget — `READY_POLL_ATTEMPTS * READY_POLL_MS` — handed to a fetch
 * inside the loop that is supposed to make 180 attempts. A single request that never answers
 * therefore ate all three minutes, so "180 chances" was in practice one, and the job ended as
 * ENVIRONMENT with a gateway that may well have come up a second later. The budget belongs to
 * the loop; a request only gets its own slice of it.
 */
export const READY_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Start `node dist/server/server.js` from the worktree, in its own process group, and
 * wait for /api/startup-status to report phase=ready. Stdout/stderr go to `logFile`.
 *
 * `env` adds to the worker's own environment — that is how the gateway is told to read
 * the bench-wide asset cache instead of priming an empty one inside the worktree.
 */
export async function startGateway(
  worktree: string,
  port: number,
  logFile: string,
  deps: GatewayDeps,
  env: Record<string, string> = {},
): Promise<RunningGateway> {
  const out = fs.openSync(logFile, 'a');
  const child = deps.spawnProcess('node', ['--disable-warning=DEP0040', 'dist/server/server.js'], {
    cwd: worktree,
    env: { ...process.env, ...env, PORT: String(port) },
    detached: true,
    stdio: ['ignore', out, out],
  });
  child.unref();
  fs.closeSync(out);

  const pid = child.pid;
  if (pid === undefined) throw new Error('gateway spawn returned no pid');

  const gateway: RunningGateway = {
    pid,
    stop: async () => {
      // Negative pid = the whole process group, so npm-spawned children die too.
      safeKill(deps, -pid, 'SIGTERM');
      await deps.sleep(1_000);
      safeKill(deps, -pid, 'SIGKILL');
      await clearPort(port, deps);
    },
  };

  let lastDetail = 'no response yet';
  for (let attempt = 0; attempt < READY_POLL_ATTEMPTS; attempt++) {
    try {
      const response = await deps.fetchImpl(`http://localhost:${port}/api/startup-status`, {
        signal: AbortSignal.timeout(READY_REQUEST_TIMEOUT_MS),
      });
      const status = parseStartupStream(await response.text());
      if (response.ok && status.phase === 'ready') return gateway;
      lastDetail = `phase=${status.phase ?? 'unknown'}`;
    } catch (err: unknown) {
      lastDetail = toErrorMessage(err);
    }
    await deps.sleep(READY_POLL_MS);
  }

  await gateway.stop();
  throw new Error(`gateway from ${worktree} never reached ready (${lastDetail}) — see ${logFile}`);
}

function safeKill(deps: GatewayDeps, pid: number, signal: NodeJS.Signals): void {
  try {
    deps.kill(pid, signal);
  } catch {
    // Already gone is the outcome we wanted.
  }
}
