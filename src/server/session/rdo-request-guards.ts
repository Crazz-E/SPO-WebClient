/**
 * Extracted RDO request guards — testable in isolation.
 * Used by spo_session.ts sendRdoRequest / executeRdoRequest.
 */

/** Throws if a void push separator is used with sendRdoRequest (Delphi crash guard). */
export function assertNotVoidPush(packetData: { separator?: string; member?: string }): void {
  if (packetData.separator?.includes('*')) {
    throw new Error(
      `FATAL: Void push separator "*" used with sendRdoRequest() — this WILL crash the Delphi server. ` +
      `Command: ${packetData.member || 'unknown'}. Use socket.write() for fire-and-forget commands.`
    );
  }
}

/** Returns true if the buffer can accept another request. */
export function canBufferRequest(currentSize: number, maxSize: number): boolean {
  return currentSize < maxSize;
}
