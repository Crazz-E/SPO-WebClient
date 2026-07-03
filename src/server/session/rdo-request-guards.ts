/**
 * Extracted RDO request guards — testable in isolation.
 * Used by spo_session.ts sendRdoRequest / executeRdoRequest.
 */

/**
 * Throws if a void push separator is used with sendRdoRequest.
 * PROJECT CONVENTION (one wire form per intent), not a crash fact: the server
 * acks void+QueryId with "A<id> ;" (capture-proven — doc/rdo-protocol-architecture.md §8.5).
 */
export function assertNotVoidPush(packetData: { separator?: string; member?: string }): void {
  if (packetData.separator?.includes('*')) {
    throw new Error(
      `Void push separator "*" must not be used with sendRdoRequest() — project convention ` +
      `(one form per intent; see doc/rdo-protocol-architecture.md §8.5). ` +
      `Command: ${packetData.member || 'unknown'}. Use writeRdoFrame() for fire-and-forget commands.`
    );
  }
}

/** Returns true if the buffer can accept another request. */
export function canBufferRequest(currentSize: number, maxSize: number): boolean {
  return currentSize < maxSize;
}
