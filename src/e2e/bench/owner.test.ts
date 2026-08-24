/**
 * The bench owner lease — src/e2e/bench/owner.ts.
 *
 * Two properties carry the whole module, and most of this file exists to pin them:
 *
 * 1. **A dead holder frees the bench.** Every "somebody holds it" answer must be able to
 *    lapse on its own, or a crashed worker locks the live world for every host forever.
 * 2. **Enforcement is earned.** Before the lease has ever been established this machine
 *    must behave exactly as it did without the lease; after it has, losing the lease must
 *    refuse. The direction that stops the bench is the one that requires evidence.
 */

import {
  buildClaim,
  claimLive,
  ghVariableReader,
  ghVariableWriter,
  holdsBench,
  localIdentity,
  mayDriveLive,
  mayTake,
  newLeaseState,
  OWNER_LEASE_MS,
  OWNER_VARIABLE,
  parseClaim,
  renewLease,
  sameOwner,
  type OwnerClaim,
  type OwnerDeps,
  type OwnerIdentity,
} from './owner';

const NOW = 1_800_000_000_000;
const ME: OwnerIdentity = { host: 'bench-pc', pid: 4242 };
const OTHER: OwnerIdentity = { host: 'laptop', pid: 77 };

function claimOf(who: OwnerIdentity, expiresAtMs: number): OwnerClaim {
  return {
    host: who.host,
    pid: who.pid,
    renewedAt: new Date(expiresAtMs - OWNER_LEASE_MS).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

/** A deps double whose variable store is a single mutable string, like the real one. */
function deps(overrides: Partial<OwnerDeps> = {}): OwnerDeps & { store: { value: string | null }; logs: string[] } {
  const store = { value: null as string | null };
  const logs: string[] = [];
  return {
    store,
    logs,
    readVariable: () => store.value,
    writeVariable: (value: string) => {
      store.value = value;
    },
    identity: ME,
    log: (line: string) => logs.push(line),
    random: () => 0,
    ...overrides,
  };
}

const noSleep = (): Promise<void> => Promise.resolve();

describe('parseClaim', () => {
  it('reads a well-formed claim', () => {
    const raw = JSON.stringify(claimOf(ME, NOW + 1000));
    expect(parseClaim(raw)).toMatchObject({ host: 'bench-pc', pid: 4242 });
  });

  it.each([
    ['null', null],
    ['the empty string', ''],
    ['not JSON', '{nope'],
    ['a JSON scalar', '42'],
    ['a claim with no host', JSON.stringify({ pid: 1, expiresAt: new Date(NOW).toISOString() })],
    ['a claim with no pid', JSON.stringify({ host: 'h', expiresAt: new Date(NOW).toISOString() })],
    ['a claim with no expiry', JSON.stringify({ host: 'h', pid: 1 })],
    ['a claim whose expiry is not a date', JSON.stringify({ host: 'h', pid: 1, expiresAt: 'soon' })],
  ])('treats %s as no claim at all', (_label, raw) => {
    expect(parseClaim(raw as string | null)).toBeNull();
  });

  it('falls back to the expiry when renewedAt is missing, rather than rejecting', () => {
    const expiresAt = new Date(NOW).toISOString();
    expect(parseClaim(JSON.stringify({ host: 'h', pid: 1, expiresAt }))).toEqual({
      host: 'h',
      pid: 1,
      renewedAt: expiresAt,
      expiresAt,
    });
  });
});

describe('sameOwner / claimLive', () => {
  it('matches on host AND pid', () => {
    expect(sameOwner(claimOf(ME, NOW), ME)).toBe(true);
    expect(sameOwner(claimOf(ME, NOW), { host: 'bench-pc', pid: 1 })).toBe(false);
    expect(sameOwner(claimOf(ME, NOW), { host: 'other', pid: 4242 })).toBe(false);
  });

  it('is live strictly before the expiry', () => {
    expect(claimLive(claimOf(ME, NOW + 1), NOW)).toBe(true);
    expect(claimLive(claimOf(ME, NOW), NOW)).toBe(false);
  });
});

describe('mayTake', () => {
  it('takes a bench nobody claims', () => {
    expect(mayTake(null, ME, NOW)).toEqual({ ok: true, takeover: true });
  });

  it('renews our own claim without calling it a takeover', () => {
    expect(mayTake(claimOf(ME, NOW + 1000), ME, NOW)).toEqual({ ok: true, takeover: false });
  });

  it('takes over a lapsed claim — a dead holder frees the bench', () => {
    expect(mayTake(claimOf(OTHER, NOW - 1), ME, NOW)).toEqual({ ok: true, takeover: true });
  });

  it('refuses while another host is still live, and says for how long', () => {
    const decision = mayTake(claimOf(OTHER, NOW + 90_000), ME, NOW);
    expect(decision.ok).toBe(false);
    expect(decision.why).toContain('laptop');
    expect(decision.why).toContain('90 s');
  });
});

describe('buildClaim', () => {
  it('expires exactly one lease from now', () => {
    const claim = buildClaim(ME, NOW);
    expect(Date.parse(claim.expiresAt) - NOW).toBe(OWNER_LEASE_MS);
    expect(Date.parse(claim.renewedAt)).toBe(NOW);
  });
});

describe('renewLease', () => {
  it('claims a free bench and remembers the grace it bought', async () => {
    const d = deps();
    const state = newLeaseState();
    await expect(renewLease(d, state, NOW, noSleep)).resolves.toEqual({ held: true });
    expect(state.heldUntilMs).toBe(NOW + OWNER_LEASE_MS);
    expect(state.everHeld).toBe(true);
    expect(parseClaim(d.store.value)).toMatchObject({ host: ME.host, pid: ME.pid });
  });

  it('drops our grace at once when another host demonstrably holds it', async () => {
    const d = deps();
    d.store.value = JSON.stringify(claimOf(OTHER, NOW + 120_000));
    const state = { heldUntilMs: NOW + 60_000, everHeld: true };
    const outcome = await renewLease(d, state, NOW, noSleep);
    expect(outcome.held).toBe(false);
    expect(outcome.why).toContain('laptop');
    // Not "wait for our grace to run out": we can SEE it is not ours.
    expect(state.heldUntilMs).toBe(0);
  });

  it('keeps the grace already paid for when the store cannot be read', async () => {
    const d = deps({
      readVariable: () => {
        throw new Error('offline');
      },
    });
    const state = { heldUntilMs: NOW + 60_000, everHeld: true };
    const outcome = await renewLease(d, state, NOW, noSleep);
    expect(outcome).toEqual({ held: true, why: expect.stringContaining('could not read') });
    expect(state.heldUntilMs).toBe(NOW + 60_000);
  });

  it('keeps the grace already paid for when the store cannot be written', async () => {
    const d = deps({
      writeVariable: () => {
        throw new Error('403');
      },
    });
    const state = { heldUntilMs: NOW + 60_000, everHeld: true };
    const outcome = await renewLease(d, state, NOW, noSleep);
    expect(outcome).toEqual({ held: true, why: expect.stringContaining('could not write') });
    expect(state.heldUntilMs).toBe(NOW + 60_000);
  });

  it('reports not-held when it never had grace and cannot write', async () => {
    const d = deps({
      writeVariable: () => {
        throw new Error('403');
      },
    });
    const state = newLeaseState();
    await expect(renewLease(d, state, NOW, noSleep)).resolves.toEqual({
      held: false,
      why: expect.stringContaining('could not write'),
    });
    expect(state.everHeld).toBe(false);
  });

  it('keeps the grace when the read-back itself fails', async () => {
    let reads = 0;
    const d = deps({
      readVariable: () => {
        if (++reads === 2) throw new Error('offline mid-renew');
        return null;
      },
    });
    const state = { heldUntilMs: NOW + 60_000, everHeld: true };
    await expect(renewLease(d, state, NOW, noSleep)).resolves.toEqual({
      held: true,
      why: expect.stringContaining('could not confirm'),
    });
  });

  it('loses the lease when someone else wrote between our write and our read-back', async () => {
    let reads = 0;
    const d = deps({
      readVariable: () => (++reads === 1 ? null : JSON.stringify(claimOf(OTHER, NOW + OWNER_LEASE_MS))),
    });
    const state = newLeaseState();
    const outcome = await renewLease(d, state, NOW, noSleep);
    expect(outcome.held).toBe(false);
    expect(outcome.why).toContain('lost the race');
    expect(state.heldUntilMs).toBe(0);
    expect(state.everHeld).toBe(false);
  });

  it('loses the lease when the read-back is not a claim at all', async () => {
    let reads = 0;
    const d = deps({ readVariable: () => (++reads === 1 ? null : 'garbage') });
    const state = newLeaseState();
    await expect(renewLease(d, state, NOW, noSleep)).resolves.toEqual({
      held: false,
      why: expect.stringContaining('did not read back'),
    });
  });

  it('jitters before a takeover, and not before a plain renewal', async () => {
    const slept: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      slept.push(ms);
    };
    const d = deps({ random: () => 0.5 });

    await renewLease(d, newLeaseState(), NOW, sleep);
    expect(slept).toEqual([500]);

    // Now the variable holds OUR claim: renewing it is not a race with anybody.
    await renewLease(d, newLeaseState(), NOW, sleep);
    expect(slept).toEqual([500]);
  });
});

describe('holdsBench', () => {
  it('is true strictly inside the paid-for window', () => {
    const state = { heldUntilMs: NOW + 1, everHeld: true };
    expect(holdsBench(state, NOW)).toBe(true);
    expect(holdsBench(state, NOW + 1)).toBe(false);
  });
});

describe('mayDriveLive — enforcement is earned', () => {
  it('allows a job while the lease is held', () => {
    expect(mayDriveLive({ heldUntilMs: NOW + 1000, everHeld: true }, NOW)).toEqual({ ok: true });
  });

  it('allows a job on a machine where the lease has never worked', () => {
    // No permission, no network, first ever boot: the bench must behave as it did before
    // this module existed, or a laptop that does not exist yet takes down the one that does.
    expect(mayDriveLive(newLeaseState(), NOW)).toEqual({ ok: true });
  });

  it('refuses once the lease has worked here and then lapsed', () => {
    const decision = mayDriveLive({ heldUntilMs: NOW - 1, everHeld: true }, NOW);
    expect(decision.ok).toBe(false);
    expect(decision.why).toContain(OWNER_VARIABLE);
    expect(decision.why).toContain('another host may hold it');
  });
});

describe('the gh store', () => {
  it('reads the value, and reads a missing variable as nobody holding it', () => {
    expect(ghVariableReader(() => ' {"host":"h"} \n', '/repo')()).toBe('{"host":"h"}');
    expect(ghVariableReader(() => '', '/repo')()).toBeNull();
    expect(
      ghVariableReader(() => {
        throw new Error('HTTP 404');
      }, '/repo')(),
    ).toBeNull();
  });

  it('names the repository the way ghStatusPublisher does — resolved from the cwd', () => {
    const calls: { args: string[]; cwd: string }[] = [];
    ghVariableReader((_cmd, args, cwd) => {
      calls.push({ args, cwd });
      return '';
    }, '/home/dev/repo')();
    expect(calls[0].args.join(' ')).toContain(`repos/{owner}/{repo}/actions/variables/${OWNER_VARIABLE}`);
    expect(calls[0].cwd).toBe('/home/dev/repo');
  });

  it('updates an existing variable with PATCH', () => {
    const methods: string[] = [];
    ghVariableWriter((_cmd, args) => {
      methods.push(args[args.indexOf('--method') + 1]);
      return '';
    }, '/repo')('{"host":"h"}');
    expect(methods).toEqual(['PATCH']);
  });

  it('falls back to POST the first time, when there is nothing to patch', () => {
    const methods: string[] = [];
    ghVariableWriter((_cmd, args) => {
      const method = args[args.indexOf('--method') + 1];
      methods.push(method);
      if (method === 'PATCH') throw new Error('HTTP 404');
      return '';
    }, '/repo')('{"host":"h"}');
    expect(methods).toEqual(['PATCH', 'POST']);
  });
});

describe('localIdentity', () => {
  it('names this host and the pid it is given', () => {
    expect(localIdentity(999)).toEqual({ host: expect.any(String), pid: 999 });
  });
});
