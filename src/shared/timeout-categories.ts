/**
 * Timeout Categories — Aligned with the legacy Delphi client deadlines.
 *
 * Legacy ground truth (ServerCnxHandler.pas):
 *   - RDOObjectProxy DefTimeOut = 60s  (pre-login / directory reads)
 *   - ISProxyTimeOut = 180s            (:329 — EVERY in-play world call; the
 *     server legitimately stalls during simulation ticks)
 *   - LogoffTimeOut = 5s               (:330 — handled by endSession directly)
 *
 * The category enum is kept for call-site semantics and WS-facing progress
 * messaging, but all in-play categories share the legacy 180s RDO deadline —
 * timing out earlier than the original client is a conformity divergence
 * (it surfaced false failures the legacy client never saw).
 *
 * Two layers must stay aligned: RDO (L3) < WS (L1).
 * L3 always rejects first so the user gets the real error message.
 */

export enum TimeoutCategory {
  /** Quick reads: IDOF, status, property gets (legacy proxy DefTimeOut = 60s) */
  FAST = 'FAST',
  /** Standard in-play ops: building focus, map, chat, mail */
  NORMAL = 'NORMAL',
  /** Heavy mutations: build, clone, upgrade, set property */
  SLOW = 'SLOW',
  /** Very heavy ops: company creation, end-of-period, large facility purchases */
  VERY_SLOW = 'VERY_SLOW',
}

/** Legacy in-play proxy deadline (ISProxyTimeOut, ServerCnxHandler.pas:329). */
export const IS_PROXY_TIMEOUT_MS = 180_000;

export const TIMEOUT_CONFIG: Record<TimeoutCategory, { rdoMs: number; wsMs: number }> = {
  [TimeoutCategory.FAST]:      { rdoMs: 60_000,              wsMs: 70_000 },
  [TimeoutCategory.NORMAL]:    { rdoMs: IS_PROXY_TIMEOUT_MS, wsMs: 190_000 },
  [TimeoutCategory.SLOW]:      { rdoMs: IS_PROXY_TIMEOUT_MS, wsMs: 190_000 },
  [TimeoutCategory.VERY_SLOW]: { rdoMs: IS_PROXY_TIMEOUT_MS, wsMs: 190_000 },
};
