/**
 * Timeout Categories — Aligned with legacy Delphi RDO client (60s default).
 *
 * Three layers must be aligned: RDO (L3) < WS (L1).
 * L3 always rejects first so the user gets the real error message.
 */

export enum TimeoutCategory {
  /** Quick reads: IDOF, status, property gets */
  FAST = 'FAST',
  /** Standard ops: building focus, map, chat, mail */
  NORMAL = 'NORMAL',
  /** Heavy mutations: build, clone, upgrade, set property */
  SLOW = 'SLOW',
  /** Very heavy ops: company creation, end-of-period, large facility purchases.
   *  Matches Delphi ISProxyTimeOut = 180s for operations that can stall during simulation ticks. */
  VERY_SLOW = 'VERY_SLOW',
}

export const TIMEOUT_CONFIG: Record<TimeoutCategory, { rdoMs: number; wsMs: number }> = {
  [TimeoutCategory.FAST]:      { rdoMs: 15_000, wsMs: 20_000 },
  [TimeoutCategory.NORMAL]:    { rdoMs: 30_000, wsMs: 40_000 },
  [TimeoutCategory.SLOW]:      { rdoMs: 60_000, wsMs: 75_000 },
  [TimeoutCategory.VERY_SLOW]: { rdoMs: 120_000, wsMs: 150_000 },
};
