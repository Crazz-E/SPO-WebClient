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
 * ## `wsMs` describes an intent, not a mechanism (O-L4)
 *
 * This header used to assert: *"Two layers must stay aligned: RDO (L3) < WS (L1).
 * L3 always rejects first so the user gets the real error message."* The second
 * sentence is a **consequence that nothing enforces**: `wsMs` is read by no code
 * at all — there is no WebSocket-side timer. What actually happens is that the
 * RDO layer is the only one with a deadline, so it does reject first, by default
 * rather than by design.
 *
 * The values are kept because they express the invariant a future WS timer must
 * respect (`wsMs > rdoMs`, verified by a test), and removing them would lose
 * that. But do not read this table as documentation of a live safety net.
 */

export enum TimeoutCategory {
  /** Directory Server sessions: auth, world lists, people search (legacy DSProxy.TimeOut = 20s, LogonHandlerViewer.pas:341) */
  DIRECTORY = 'DIRECTORY',
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

/** Legacy Directory session deadline (DSProxy.TimeOut := 20000, LogonHandlerViewer.pas:341). */
export const DIRECTORY_TIMEOUT_MS = 20_000;

/**
 * @property rdoMs the live deadline, armed by `sendRdoRequest`.
 * @property wsMs  **not consumed by any code today** — the budget a future
 *                 WebSocket-side timer would use. Must stay above `rdoMs` so the
 *                 RDO error reaches the user instead of a generic WS timeout.
 */
export const TIMEOUT_CONFIG: Record<TimeoutCategory, { rdoMs: number; wsMs: number }> = {
  [TimeoutCategory.DIRECTORY]: { rdoMs: DIRECTORY_TIMEOUT_MS, wsMs: 30_000 },
  [TimeoutCategory.FAST]:      { rdoMs: 60_000,              wsMs: 70_000 },
  [TimeoutCategory.NORMAL]:    { rdoMs: IS_PROXY_TIMEOUT_MS, wsMs: 190_000 },
  [TimeoutCategory.SLOW]:      { rdoMs: IS_PROXY_TIMEOUT_MS, wsMs: 190_000 },
  [TimeoutCategory.VERY_SLOW]: { rdoMs: IS_PROXY_TIMEOUT_MS, wsMs: 190_000 },
};
