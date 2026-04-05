/**
 * Construction socket serialisation lock.
 *
 * Prevents concurrent RDO commands on the shared construction socket.
 * Mirrors the Lock/Unlock pattern in the Delphi client's
 * TObjectInspectorContainer.GetMSProxy (ObjectInspectorHandleViewer.pas:599).
 *
 * Both building-property-handler and building-management-handler must use
 * this lock for all operations on the construction socket.
 */

import type { SessionContext } from './session-context';

const sessionLocks = new WeakMap<SessionContext, Promise<unknown>>();

/**
 * Queue `fn` behind any pending construction-socket operation for this session.
 * Returns the result of `fn` once it completes.
 */
export function serialiseConstruction<T>(ctx: SessionContext, fn: () => Promise<T>): Promise<T> {
  const prev = sessionLocks.get(ctx) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run fn after previous settles (success or failure)
  sessionLocks.set(ctx, next);
  return next;
}
