/**
 * Where an RDO request goes, and whether it may wait.
 *
 * Both decisions live in `spo_session.ts` `sendRdoRequest`. Neither is a
 * safeguard against a malformed frame — the RDO catalogue and
 * `shared/rdo-frame.ts` own that — so neither went away with the guard file
 * they used to share.
 */

/**
 * Members whose value belongs to the TCP connection that carries the query, not
 * to the object it names. They must stay on the primary world socket.
 *
 * `get RDOCnntId` never reaches the object server: the query parser answers it
 * with `ConnId`, the id of the connection the frame arrived on
 * (`Rdo/Server/RDOQueryServer.pas:269-274`,
 * `WinSockRDOConnectionsServer.pas:664-668`). Handing that id to
 * `RegisterEventsById` then binds the server-side `TClientView` to that
 * connection, as push channel AND teardown trigger:
 *
 *   fClientConnection := fServer.fClientsServerConn.GetClientConnectionById(ClientId);
 *   fClientConnection.OnDisconnect := OnDisconnect;
 *   fClientEventsProxy.SetConnection(fClientConnection);
 *     — Interface Server/InterfaceServer.pas:1919-1923
 *
 * Read on a pool connection, the session binds to a socket the pool owns and
 * may destroy at will (`RdoConnectionPool.replaceConnection` on a degraded
 * connection): `OnDisconnect` then tears down the whole ClientView while the
 * primary socket is healthy — the zombie-session failure of O-H1/O-H2.
 *
 * Add a member here only with the server-side interception cited.
 */
export const CONNECTION_BOUND_MEMBERS: ReadonlyMap<string, string> = new Map([
  ['RDOCnntId', 'answered from ConnId before object lookup — Rdo/Server/RDOQueryServer.pas:269-274'],
]);

/** True when the request must bypass the world pool and take the primary socket. */
export function isConnectionBoundMember(packetData: { member?: string }): boolean {
  return packetData.member !== undefined && CONNECTION_BOUND_MEMBERS.has(packetData.member);
}

/**
 * Admission to the ServerBusy buffer.
 *
 * The buffer is our invention — the legacy client blocks on SendReceive under
 * `ISProxyTimeOut` instead — so it needs a ceiling, or a server that never stops
 * being busy turns every later request into an unbounded queue.
 */
export function canBufferRequest(currentSize: number, maxSize: number): boolean {
  return currentSize < maxSize;
}
