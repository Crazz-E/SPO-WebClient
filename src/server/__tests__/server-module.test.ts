/**
 * The gateway module must load.
 *
 * `server.ts` is the one module the rest of the server hangs off, and nothing imported it
 * from a test until now — an import-time crash (a bad path, a service constructed too
 * early, a specifier Node resolves but Jest does not) would have surfaced only when the
 * gateway was started for real. Loading it here is the cheapest guard against that.
 *
 * Timers are faked around the import: the module arms a rate-limit sweep at load time, and
 * a real interval would keep the worker alive after the suite ends.
 */
import { describe, it, expect, afterEach } from '@jest/globals';

describe('server module', () => {
  it('loads, and exposes the gateway entry points', () => {
    jest.useFakeTimers();
    try {
      const mod = require('../server') as typeof import('../server');
      expect(typeof mod.startGateway).toBe('function');
      expect(typeof mod.getInventionIndex).toBe('function');
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});

/**
 * The SEC-R-2 fail-fast, exercised through the real entry point rather than the pure
 * checker: what matters is that the refusal happens *before* the gateway touches a port
 * or a cache, so the whole module is loaded fresh with the forbidden environment and
 * `startGateway()` is expected to reject without any of that having run.
 *
 * `LOG_LEVEL` is read when `shared/config.ts` is first evaluated, which is why the module
 * registry is reset around each case instead of the config object being poked.
 */
describe('startGateway — production configuration (SEC-R-2)', () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, LOG_LEVEL: process.env.LOG_LEVEL };

  afterEach(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    process.env.LOG_LEVEL = saved.LOG_LEVEL;
    if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV;
    if (saved.LOG_LEVEL === undefined) delete process.env.LOG_LEVEL;
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.resetModules();
  });

  it('refuses to start on NODE_ENV=production with LOG_LEVEL=debug', async () => {
    jest.useFakeTimers();
    jest.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'debug';

    // The boot readout and the refusal both go to the console — silenced so the suite
    // output stays readable, restored below whatever the expectation does.
    const quiet = ['log', 'info', 'warn', 'error'].map(name =>
      jest.spyOn(console, name as 'log').mockImplementation(() => {})
    );
    try {
      const mod = require('../server') as typeof import('../server');
      await expect(mod.startGateway({ port: 0 })).rejects.toThrow(
        /Refusing to start: production configuration is invalid/
      );
    } finally {
      quiet.forEach(spy => spy.mockRestore());
    }
  });
});
