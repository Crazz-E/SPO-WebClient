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
import { describe, it, expect } from '@jest/globals';

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
