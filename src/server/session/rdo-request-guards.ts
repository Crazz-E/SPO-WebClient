/**
 * Extracted RDO request guards — testable in isolation.
 * Used by spo_session.ts sendRdoRequest / executeRdoRequest.
 */

/**
 * Delphi members declared `procedure` — they return nothing.
 *
 * Calling one with the VariantId separator `"^"` makes the server set
 * `TVarData(Res).VType := varVariant` (`RDOQueryServer.pas:422-424`), so
 * `TRDOObjectServer.CallMethod` passes a hidden result pointer as an extra
 * argument. For a 2-parameter procedure like `SayThis`, `RegsUsed` reaches
 * `MaxRegs = 3`, so the pointer goes on the stack via `push edi`
 * (`RDOObjectServer.pas:292`) — and a `register`-convention procedure with no
 * stack parameters never pops it.
 *
 * **This is not theory. A single such frame froze the shared production
 * Interface Server** (live probe, 2026-08-15). The same probe also proved the
 * server *does* execute the procedure body before failing to marshal the
 * phantom result, so there is no "the server rejects it harmlessly" escape.
 *
 * The reference client emits these with `"*"` + a QueryId and receives a clean
 * empty ack:
 *   `C 2174 sel 30430748 call AddLine "*" "%test message";`  → `A2174 ;`
 *   `C 2177 sel 30437308 call CloseMessage "*" "#30430748";` → `A2177 ;`
 *   (doc/Mock_Server_scenarios_captures.md:3542-3543, :3548-3549)
 *
 * Add a member here only with its Delphi declaration cited.
 */
export const VOID_MEMBERS: ReadonlyMap<string, string> = new Map([
  ['SayThis', 'procedure SayThis( Dest, Msg : widestring ) — Interface Server/InterfaceServer.pas:179'],
  ['AddLine', 'procedure AddLine( line : widestring ) — Mail Server/MailServer.pas:140'],
  ['CloseMessage', 'procedure CloseMessage( Id : integer ) — Mail Server/MailServer.pas:112'],
  // Same 2-widestring profile as SayThis, so the same freeze. Found by the
  // exhaustive sweep of every "^" call-site (2026-08-15), not by the audit.
  // doc/spo-original-reference.md classed both as `function … olevariant` — the
  // line it cited was a late-bound CLIENT call-site (Voyager/SupplySheetForm.pas:295),
  // the very confusion that had hidden SayThis. No `function` variant exists.
  ['RDOConnectInput', 'procedure RDOConnectInput( FluidId, Suppliers : widestring ) — Kernel/Kernel.pas:1077'],
  ['RDOConnectOutput', 'procedure RDOConnectOutput( FluidId, Clients : widestring ) — Kernel/Kernel.pas:1078'],
]);

/**
 * Throws when the VariantId separator `"^"` targets a known void member.
 *
 * This is the guard that matters: `"^"` on a `procedure` is the form that froze
 * the shared server. Unlike {@link assertNotVoidPush} — a style convention —
 * this one encodes a proven crash.
 */
export function assertNotVariantOnVoidMember(packetData: { separator?: string; member?: string }): void {
  if (!packetData.separator?.includes('^')) return;
  const declaration = packetData.member ? VOID_MEMBERS.get(packetData.member) : undefined;
  if (!declaration) return;
  throw new Error(
    `Separator "^" must never target the void member "${packetData.member}" — it freezes the ` +
    `shared Delphi Interface Server (live-proven 2026-08-15; RDOQueryServer.pas:422-424 → ` +
    `RDOObjectServer.pas:292). Declared: ${declaration}. ` +
    `Use "*" WITH a QueryId — the reference client's form, which the server acks "A<id> ;".`
  );
}

/**
 * Throws if a void push separator is used with sendRdoRequest.
 *
 * PROJECT CONVENTION (one wire form per intent), not a crash fact: the server
 * acks void+QueryId with `A<id> ;` (capture-proven — doc/rdo-protocol-architecture.md §8.5).
 *
 * **Exception — {@link VOID_MEMBERS}.** For members that are Delphi
 * `procedure`s, `"*"` + QueryId is the *only* safe form and is exactly what the
 * reference client emits. The convention previously forbade it and pushed the
 * code onto `"^"`, which is what froze the production server. Evidence outranks
 * convention (rdo-conformity §0), so these members are allowed through.
 */
export function assertNotVoidPush(packetData: { separator?: string; member?: string }): void {
  if (!packetData.separator?.includes('*')) return;
  if (packetData.member && VOID_MEMBERS.has(packetData.member)) return;
  throw new Error(
    `Void push separator "*" must not be used with sendRdoRequest() — project convention ` +
    `(one form per intent; see doc/rdo-protocol-architecture.md §8.5). ` +
    `Command: ${packetData.member || 'unknown'}. Use writeRdoFrame() for fire-and-forget commands.`
  );
}

/** Returns true if the buffer can accept another request. */
export function canBufferRequest(currentSize: number, maxSize: number): boolean {
  return currentSize < maxSize;
}
