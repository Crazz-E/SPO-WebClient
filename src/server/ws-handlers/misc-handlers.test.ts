/**
 * REQ_RDO_DIRECT rate limiting (audit V3).
 * Token bucket: burst 10, refill 5/s — protects the shared legacy server
 * from a browser flooding arbitrary RDO through the direct handler.
 */

import { describe, it, expect } from '@jest/globals';
import { takeRdoDirectToken } from './misc-handlers';

describe('takeRdoDirectToken', () => {
  it('allows an initial burst of 10, then rejects', () => {
    const session = {};
    const now = 1_000_000;

    for (let i = 0; i < 10; i++) {
      expect(takeRdoDirectToken(session, now)).toBe(true);
    }
    expect(takeRdoDirectToken(session, now)).toBe(false);
  });

  it('refills at 5 tokens per second', () => {
    const session = {};
    const t0 = 2_000_000;

    // Drain the burst
    for (let i = 0; i < 10; i++) takeRdoDirectToken(session, t0);
    expect(takeRdoDirectToken(session, t0)).toBe(false);

    // +200ms → 1 token refilled
    expect(takeRdoDirectToken(session, t0 + 200)).toBe(true);
    expect(takeRdoDirectToken(session, t0 + 200)).toBe(false);

    // +1s from t0+200 → 5 more tokens
    let granted = 0;
    for (let i = 0; i < 8; i++) {
      if (takeRdoDirectToken(session, t0 + 1200)) granted++;
    }
    expect(granted).toBe(5);
  });

  it('caps the bucket at the burst size (no infinite accumulation)', () => {
    const session = {};
    const t0 = 3_000_000;

    takeRdoDirectToken(session, t0); // create bucket (9 left)
    // One hour later: bucket must be capped at 10, not 18000
    let granted = 0;
    for (let i = 0; i < 30; i++) {
      if (takeRdoDirectToken(session, t0 + 3_600_000)) granted++;
    }
    expect(granted).toBe(10);
  });

  it('tracks each session independently', () => {
    const a = {};
    const b = {};
    const now = 4_000_000;

    for (let i = 0; i < 10; i++) takeRdoDirectToken(a, now);
    expect(takeRdoDirectToken(a, now)).toBe(false);
    expect(takeRdoDirectToken(b, now)).toBe(true);
  });
});
