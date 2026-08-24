/**
 * The bench owner lease — one live bench, across machines.
 *
 * Today the live bench is excluded per machine: one systemd unit, one port 8080, and
 * `.claude/hooks/bench-port-guard.sh` to keep sessions off it. That exclusion works
 * because the worker and its sessions share a filesystem — a second worker would have to
 * be a second process on this host, and the port refuses it.
 *
 * #158 removes that coupling: once the worker fetches its work from GitHub, nothing about
 * it is host-bound any more, and a worker started on a laptop would drive the *same*
 * Helartia world with the *same* LOCKED account as the one on this PC. Two live drives in
 * one world is the single genuinely destructive failure mode of the whole change — a
 * `FIVEMODELSERVER/Survival` line stops being attributable, which is the property the
 * bench exists to provide.
 *
 * So the exclusion has to move somewhere both hosts can see: a GitHub repository variable
 * (`BENCH_OWNER`) holding who holds the bench and until when.
 *
 * **It is a lease, not a flag.** A bare "host X owns the bench" claim has one failure mode
 * that matters more than every other: a worker that dies holding it locks the live world
 * for every host, forever, and only a human with API access could clear it. So the claim
 * carries an expiry, the holder renews it on a timer, and anyone may take it once it has
 * lapsed. A dead worker frees the bench by doing nothing at all.
 *
 * **How it turns itself on.** A mechanism that fails closed from its first minute would
 * take the bench down on this machine — where it works today — for a second host that does
 * not exist yet. So enforcement is earned, not configured: while the lease has never been
 * established (no permission, no network, first ever run) the worker logs and proceeds
 * exactly as before. Once it has held the lease *even once*, the mechanism is known to
 * work here, and losing it afterwards means someone else may hold it — from that point on
 * a job that cannot hold the lease is refused. No flag to set, nothing to remember, and
 * the safe direction is the one that requires evidence.
 *
 * **The residual race, stated rather than hidden.** A repository variable has no
 * compare-and-swap: two workers that both observe an expired lease in the same instant can
 * both write. The mitigation is the same handshake the kanban uses for claiming a card —
 * write, then **re-read** and keep the lease only if what came back is ours — plus a
 * jitter before taking a lease that is not ours. That shrinks the window to two writes
 * landing between one write and its read-back; it does not close it. Closing it needs a
 * CAS primitive (a git ref push is one), and that is worth doing only if this ever proves
 * insufficient in practice.
 */

import * as os from 'os';
import { toErrorMessage } from '../../shared/error-utils';
import { processAlive } from './paths';

/** The repository variable that carries the claim. */
export const OWNER_VARIABLE = 'BENCH_OWNER';

/**
 * How long a claim stays valid without being renewed.
 *
 * Five minutes over a one-minute renewal gives four consecutive failed renewals of grace,
 * so a transient network blip never drops the bench, while a worker that is actually gone
 * frees it within five minutes rather than never.
 */
export const OWNER_LEASE_MS = 5 * 60_000;

/** How often the holder renews. Must stay well under OWNER_LEASE_MS — see above. */
export const OWNER_RENEW_PERIOD_MS = 60_000;

/** Who a worker is, for the purpose of this lease. */
export interface OwnerIdentity {
  host: string;
  pid: number;
}

/** What `BENCH_OWNER` holds. */
export interface OwnerClaim {
  host: string;
  pid: number;
  /** ISO — when the holder last renewed. Informational; `expiresAt` is what decides. */
  renewedAt: string;
  /** ISO — after this instant the lease is free, whoever wrote it. */
  expiresAt: string;
}

/**
 * The worker's own memory of the lease.
 *
 * `heldUntilMs` is what the *live* check reads, not the remote variable: a job must not
 * make an API call to decide whether it may start, and the grace window is exactly the
 * time already paid for. `everHeld` is what earns enforcement (see the module comment).
 */
export interface LeaseState {
  heldUntilMs: number;
  everHeld: boolean;
}

export function newLeaseState(): LeaseState {
  return { heldUntilMs: 0, everHeld: false };
}

export interface OwnerDeps {
  /** The raw variable value, or null when it is unset or unreadable. */
  readVariable: () => string | null;
  writeVariable: (value: string) => void;
  identity: OwnerIdentity;
  log: (line: string) => void;
  /** 0..1, used to jitter a takeover. Injected so a test is deterministic. */
  random: () => number;
}

export function localIdentity(pid: number = process.pid): OwnerIdentity {
  return { host: os.hostname(), pid };
}

/** The claim in `raw`, or null when it is absent or not a well-formed claim. */
export function parseClaim(raw: string | null): OwnerClaim | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const claim = value as Partial<OwnerClaim>;
  if (typeof claim?.host !== 'string' || typeof claim.pid !== 'number') return null;
  if (typeof claim.expiresAt !== 'string' || !Number.isFinite(Date.parse(claim.expiresAt))) {
    return null;
  }
  // A malformed claim is treated as no claim: it can never be renewed by anybody, so
  // honouring it would lock the bench exactly the way the expiry exists to prevent.
  return {
    host: claim.host,
    pid: claim.pid,
    renewedAt: typeof claim.renewedAt === 'string' ? claim.renewedAt : claim.expiresAt,
    expiresAt: claim.expiresAt,
  };
}

export function sameOwner(claim: OwnerClaim, me: OwnerIdentity): boolean {
  return claim.host === me.host && claim.pid === me.pid;
}

export function claimLive(claim: OwnerClaim, nowMs: number): boolean {
  return Date.parse(claim.expiresAt) > nowMs;
}

export interface TakeDecision {
  ok: boolean;
  /** Populated when ok is false — goes straight into the worker log. */
  why?: string;
  /** True when this would be taking a lease that is not already ours. */
  takeover: boolean;
}

/**
 * May we write our claim right now?
 *
 * Yes when there is no claim, when the claim is ours (a renewal), when someone else's has
 * lapsed, or when it belongs to a **dead process on this host**. No — and only this case —
 * while another host's lease is still live.
 *
 * That fourth case is not a convenience, it is the restart case, and leaving it out was a
 * real fault: systemd restarts the worker under a new pid, the claim written by the old
 * pid stays live for up to a full lease, and the new worker spends that window unable to
 * take a lease *it is the rightful owner of*. Worse, it drives the bench anyway during it,
 * because `everHeld` is per-process and a restart resets the earned enforcement to off.
 *
 * The expiry exists precisely because liveness is **not** checkable across hosts. On this
 * host it is — `process.kill(pid, 0)` answers directly — so there is nothing to wait for.
 * The check is deliberately gated on the hostname: a matching pid number on a different
 * machine says nothing at all about the process holding that lease.
 */
export function mayTake(
  claim: OwnerClaim | null,
  me: OwnerIdentity,
  nowMs: number,
  isAlive: (pid: number) => boolean = processAlive,
): TakeDecision {
  if (!claim) return { ok: true, takeover: true };
  if (sameOwner(claim, me)) return { ok: true, takeover: false };
  if (!claimLive(claim, nowMs)) return { ok: true, takeover: true };
  if (claim.host === me.host && !isAlive(claim.pid)) return { ok: true, takeover: true };
  const seconds = Math.round((Date.parse(claim.expiresAt) - nowMs) / 1000);
  return {
    ok: false,
    takeover: true,
    why: `${claim.host} (pid ${claim.pid}) holds the bench for another ${seconds} s`,
  };
}

export function buildClaim(me: OwnerIdentity, nowMs: number): OwnerClaim {
  return {
    host: me.host,
    pid: me.pid,
    renewedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + OWNER_LEASE_MS).toISOString(),
  };
}

export interface RenewOutcome {
  held: boolean;
  why?: string;
}

/**
 * One renewal pass: read, decide, write, **read back**.
 *
 * The read-back is the whole safety of the write. A repository variable is last-writer-
 * wins, so "I wrote it" proves nothing; "I wrote it and it is still mine a moment later"
 * is as close to a compare-and-swap as this store offers.
 *
 * Any IO failure leaves `state` untouched on purpose — the worker keeps whatever grace it
 * already paid for, and only actually loses the bench when that grace runs out.
 */
export async function renewLease(
  deps: OwnerDeps,
  state: LeaseState,
  nowMs: number,
  sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
  isAlive: (pid: number) => boolean = processAlive,
): Promise<RenewOutcome> {
  let raw: string | null;
  try {
    raw = deps.readVariable();
  } catch (err: unknown) {
    return { held: holdsBench(state, nowMs), why: `could not read ${OWNER_VARIABLE}: ${toErrorMessage(err)}` };
  }

  const current = parseClaim(raw);
  const decision = mayTake(current, deps.identity, nowMs, isAlive);
  if (!decision.ok) {
    // Somebody else genuinely holds it. Drop our own grace immediately: continuing to
    // drive on a lease we can see belongs to another host is the exact collision this
    // module exists to prevent.
    state.heldUntilMs = 0;
    return { held: false, why: decision.why };
  }

  // Taking a lease that is not already ours is the only racy moment. Spread the two
  // hosts apart so they are unlikely to write in the same instant.
  if (decision.takeover) await sleep(Math.floor(deps.random() * 1_000));

  try {
    deps.writeVariable(JSON.stringify(buildClaim(deps.identity, nowMs)));
  } catch (err: unknown) {
    return { held: holdsBench(state, nowMs), why: `could not write ${OWNER_VARIABLE}: ${toErrorMessage(err)}` };
  }

  let confirmed: OwnerClaim | null;
  try {
    confirmed = parseClaim(deps.readVariable());
  } catch (err: unknown) {
    return { held: holdsBench(state, nowMs), why: `could not confirm ${OWNER_VARIABLE}: ${toErrorMessage(err)}` };
  }
  if (!confirmed || !sameOwner(confirmed, deps.identity)) {
    state.heldUntilMs = 0;
    return {
      held: false,
      why: confirmed
        ? `lost the race — ${confirmed.host} (pid ${confirmed.pid}) wrote after us`
        : `${OWNER_VARIABLE} did not read back as a claim`,
    };
  }

  state.heldUntilMs = nowMs + OWNER_LEASE_MS;
  state.everHeld = true;
  return { held: true };
}

/** Do we hold the bench at this instant, by our own paid-for grace? */
export function holdsBench(state: LeaseState, nowMs: number): boolean {
  return nowMs < state.heldUntilMs;
}

export interface DriveDecision {
  ok: boolean;
  why?: string;
}

/**
 * May a job take the live bench right now?
 *
 * The asymmetry is deliberate and is the whole rollout strategy. While the lease has
 * never been established, this machine behaves exactly as it did before the lease
 * existed — a mechanism that has never worked here must not be the thing that stops the
 * bench. Once it *has* worked here, losing it is evidence that another host may hold it,
 * and the answer flips to no.
 */
export function mayDriveLive(state: LeaseState, nowMs: number): DriveDecision {
  if (holdsBench(state, nowMs)) return { ok: true };
  if (!state.everHeld) return { ok: true };
  return {
    ok: false,
    why:
      `the bench owner lease (${OWNER_VARIABLE}) has lapsed and could not be renewed. ` +
      'This worker held it before, so another host may hold it now — driving the live ' +
      'world from two hosts at once makes every Survival log line unattributable. ' +
      'Check that this worker can reach GitHub, then let it renew.',
  };
}

/**
 * Read the variable through `gh`; a missing variable is null, not an error.
 *
 * `{owner}/{repo}` is resolved by `gh` from the cwd's origin remote — the same idiom
 * `ghStatusPublisher` uses in ./verdict, so there is one way of naming this repository
 * and no slug to keep in sync.
 */
export function ghVariableReader(
  run: (cmd: string, args: string[], cwd: string) => string,
  cwd: string,
): () => string | null {
  return () => {
    try {
      return (
        run('gh', ['api', `repos/{owner}/{repo}/actions/variables/${OWNER_VARIABLE}`, '--jq', '.value'], cwd).trim() ||
        null
      );
    } catch {
      // 404 until the first worker ever claims it: absent and unreadable are the same
      // answer to every caller — nobody is known to hold the bench.
      return null;
    }
  };
}

/** Create-or-update, because the REST API separates the two and we do not care which. */
export function ghVariableWriter(
  run: (cmd: string, args: string[], cwd: string) => string,
  cwd: string,
): (value: string) => void {
  return value => {
    try {
      run('gh', [
        'api', '--method', 'PATCH', `repos/{owner}/{repo}/actions/variables/${OWNER_VARIABLE}`,
        '-f', `name=${OWNER_VARIABLE}`, '-f', `value=${value}`,
      ], cwd);
    } catch {
      run('gh', [
        'api', '--method', 'POST', 'repos/{owner}/{repo}/actions/variables',
        '-f', `name=${OWNER_VARIABLE}`, '-f', `value=${value}`,
      ], cwd);
    }
  };
}
