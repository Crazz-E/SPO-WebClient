import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  clearPort,
  listenersOnPort,
  parseListeners,
  startGateway,
  READY_POLL_ATTEMPTS,
  READY_REQUEST_TIMEOUT_MS,
  type GatewayDeps,
} from './gateway';

const SS_TWO_LISTENERS = [
  'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
  'LISTEN 0      511          0.0.0.0:8080      0.0.0.0:*    users:(("node",pid=111,fd=23))',
  'LISTEN 0      511             [::]:8080         [::]:*    users:(("node",pid=222,fd=24))',
].join('\n');

interface FakeWorld {
  listeners: Set<number>;
  killed: { pid: number; signal: NodeJS.Signals | number }[];
  deps: GatewayDeps;
}

/** A fake machine: `ss` reflects `listeners`, SIGTERM/SIGKILL remove pids per policy. */
function fakeWorld(options: { survivesTerm?: Set<number>; survivesKill?: Set<number> } = {}): FakeWorld {
  const world: FakeWorld = {
    listeners: new Set(),
    killed: [],
    deps: {
      execFile: (cmd: string) => {
        if (cmd !== 'ss') throw new Error(`unexpected command ${cmd}`);
        return [...world.listeners].map(pid => `LISTEN 0 511 0.0.0.0:8080 0.0.0.0:* users:(("node",pid=${pid},fd=1))`).join('\n');
      },
      spawnProcess: (() => {
        throw new Error('not used in this test');
      }) as unknown as GatewayDeps['spawnProcess'],
      fetchImpl: (() => {
        throw new Error('not used in this test');
      }) as unknown as typeof fetch,
      sleep: async () => {},
      kill: (pid, signal) => {
        world.killed.push({ pid, signal });
        if (signal === 'SIGTERM' && !options.survivesTerm?.has(pid)) world.listeners.delete(pid);
        if (signal === 'SIGKILL' && !options.survivesKill?.has(pid)) world.listeners.delete(pid);
      },
    },
  };
  return world;
}

describe('parseListeners', () => {
  it('extracts every distinct pid from ss output', () => {
    expect(parseListeners(SS_TWO_LISTENERS).sort()).toEqual([111, 222]);
  });

  it('returns nothing for an empty listing', () => {
    expect(parseListeners('State  Recv-Q Send-Q ...\n')).toEqual([]);
  });
});

describe('realGatewayDeps', () => {
  it('wires the production pieces', async () => {
    const { realGatewayDeps } = await import('./gateway');
    const deps = realGatewayDeps();
    expect(deps.execFile('node', ['-e', 'process.stdout.write("ok")'])).toBe('ok');
    await deps.sleep(1);
    expect(() => deps.kill(process.pid, 0)).not.toThrow(); // signal 0 = existence probe
  });
});

describe('listenersOnPort', () => {
  it('returns [] when ss itself fails', () => {
    const deps = fakeWorld().deps;
    deps.execFile = () => {
      throw new Error('ss unavailable');
    };
    expect(listenersOnPort(8080, deps)).toEqual([]);
  });
});

describe('clearPort — the clean-bench guarantee', () => {
  it('does nothing when the port is already free', async () => {
    const world = fakeWorld();
    await clearPort(8080, world.deps);
    expect(world.killed).toHaveLength(0);
  });

  it('SIGTERMs listeners and stops there when they exit', async () => {
    const world = fakeWorld();
    world.listeners.add(111);
    await clearPort(8080, world.deps);
    expect(world.killed).toEqual([{ pid: 111, signal: 'SIGTERM' }]);
    expect(world.listeners.size).toBe(0);
  });

  it('escalates to SIGKILL for a listener that ignores SIGTERM', async () => {
    const world = fakeWorld({ survivesTerm: new Set([111]) });
    world.listeners.add(111);
    await clearPort(8080, world.deps);
    expect(world.killed.map(k => k.signal)).toEqual(['SIGTERM', 'SIGKILL']);
    expect(world.listeners.size).toBe(0);
  });

  it('throws when something survives SIGKILL — a human must look', async () => {
    const world = fakeWorld({ survivesTerm: new Set([111]), survivesKill: new Set([111]) });
    world.listeners.add(111);
    await expect(clearPort(8080, world.deps)).rejects.toThrow(/human must free the port/);
  });
});

describe('startGateway', () => {
  function spawningWorld(phases: string[]): FakeWorld & { spawned: unknown[] } {
    const world = fakeWorld() as FakeWorld & { spawned: unknown[] };
    world.spawned = [];
    let call = 0;
    world.deps.spawnProcess = ((cmd: string, args: string[], opts: unknown) => {
      world.spawned.push({ cmd, args, opts });
      return { pid: 999, unref: () => {} };
    }) as unknown as GatewayDeps['spawnProcess'];
    world.deps.fetchImpl = (async () => {
      const phase = phases[Math.min(call++, phases.length - 1)];
      return {
        ok: true,
        text: async () => `data: {"phase":"${phase}"}\n\n`,
      } as Response;
    }) as typeof fetch;
    return world;
  }

  function tmpLog(): string {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spo-bench-gw-')), 'job.log');
  }

  it('spawns from the worktree with the bench port and resolves once ready', async () => {
    const world = spawningWorld(['loading', 'ready']);
    const gateway = await startGateway('/wt/a', 8080, tmpLog(), world.deps);
    expect(gateway.pid).toBe(999);
    const spawned = world.spawned[0] as { cmd: string; args: string[]; opts: { cwd: string; env: Record<string, string>; detached: boolean } };
    expect(spawned.args).toContain('dist/server/server.js');
    expect(spawned.opts.cwd).toBe('/wt/a');
    expect(spawned.opts.env.PORT).toBe('8080');
    expect(spawned.opts.detached).toBe(true);
  });

  it('adds the caller environment, and never lets it override the bench port', async () => {
    const world = spawningWorld(['ready']);
    await startGateway('/wt/a', 8080, tmpLog(), world.deps, {
      SPO_CACHE_DIR: '/bench/cache',
      PORT: '9999',
    });
    const spawned = world.spawned[0] as { opts: { env: Record<string, string> } };
    expect(spawned.opts.env.SPO_CACHE_DIR).toBe('/bench/cache');
    // The port the worker owns is not the caller's to choose.
    expect(spawned.opts.env.PORT).toBe('8080');
  });

  it('inherits the worker environment when the caller adds nothing', async () => {
    const world = spawningWorld(['ready']);
    process.env.SPO_GATEWAY_ENV_PROBE = 'inherited';
    try {
      await startGateway('/wt/a', 8080, tmpLog(), world.deps);
    } finally {
      delete process.env.SPO_GATEWAY_ENV_PROBE;
    }
    const spawned = world.spawned[0] as { opts: { env: Record<string, string> } };
    expect(spawned.opts.env.SPO_GATEWAY_ENV_PROBE).toBe('inherited');
  });

  it('gives up when the gateway never reaches ready, naming the last phase seen', async () => {
    const world = spawningWorld(['caching']);
    await expect(startGateway('/wt/a', 8080, tmpLog(), world.deps)).rejects.toThrow(
      /never reached ready \(phase=caching\)/,
    );
    // The failed spawn was cleaned up: process-group SIGTERM then SIGKILL.
    expect(world.killed.map(k => k.pid)).toEqual([-999, -999]);
  });

  it('stop() kills the whole process group and re-verifies the port', async () => {
    const world = spawningWorld(['ready']);
    const gateway = await startGateway('/wt/a', 8080, tmpLog(), world.deps);
    await gateway.stop();
    expect(world.killed).toEqual([
      { pid: -999, signal: 'SIGTERM' },
      { pid: -999, signal: 'SIGKILL' },
    ]);
  });

  it('times out each probe on its own, not on the loop\'s whole budget', async () => {
    // The loop owns the budget: 180 attempts, one second apart. The abort signal used to be
    // built from that same product, so one request that never answered consumed all three
    // minutes and "180 chances" became a single attempt — surfacing as ENVIRONMENT for a
    // gateway that may well have answered the next second.
    const world = spawningWorld(['loading', 'loading', 'ready']);
    const timeouts = jest.spyOn(AbortSignal, 'timeout');
    try {
      await startGateway('/wt/a', 8080, tmpLog(), world.deps);
      expect(timeouts.mock.calls.map(call => call[0])).toEqual([
        READY_REQUEST_TIMEOUT_MS,
        READY_REQUEST_TIMEOUT_MS,
        READY_REQUEST_TIMEOUT_MS,
      ]);
    } finally {
      timeouts.mockRestore();
    }
    // One probe can never eat more than a small slice of the attempts it is one of.
    expect(READY_REQUEST_TIMEOUT_MS).toBeLessThan(READY_POLL_ATTEMPTS * 1_000);
  });

  it('retries after a probe is aborted, rather than ending the job on one hung request', async () => {
    const world = spawningWorld(['ready']);
    let attempts = 0;
    const readyFetch = world.deps.fetchImpl;
    world.deps.fetchImpl = (async (...args: Parameters<typeof fetch>) => {
      if (attempts++ < 3) {
        throw Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        });
      }
      return readyFetch(...args);
    }) as typeof fetch;
    await expect(startGateway('/wt/a', 8080, tmpLog(), world.deps)).resolves.toMatchObject({
      pid: 999,
    });
    expect(attempts).toBe(4);
  });

  it('survives fetch errors while the gateway boots', async () => {
    const world = spawningWorld(['ready']);
    let failures = 0;
    const readyFetch = world.deps.fetchImpl;
    world.deps.fetchImpl = (async (...args: Parameters<typeof fetch>) => {
      if (failures++ < 2) throw new Error('ECONNREFUSED');
      return readyFetch(...args);
    }) as typeof fetch;
    await expect(startGateway('/wt/a', 8080, tmpLog(), world.deps)).resolves.toMatchObject({ pid: 999 });
  });
});
