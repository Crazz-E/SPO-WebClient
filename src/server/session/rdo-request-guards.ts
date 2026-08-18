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
 * **Nor is a low parameter count an escape.** Probe U1-a (2026-08-16) emitted
 * `"^"` on `ClientAware` — a `procedure` with 0 parameters, so the hidden result
 * pointer stays in a register and the stack stays balanced. The server did not
 * freeze; it answered `A<rid> error 9;` (`errIllegalFunctionRes`,
 * `RDOQueryServer.pas:484`) in 91 ms. That is still an ERROR, never an ack: the
 * call site cannot tell whether the procedure ran. So arity changes the blast
 * radius, not the verdict — every procedure takes `"*"` + QueryId.
 * See `doc/rdo-protocol-architecture.md` §2.1.0.
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
  // The three `procedure`s of the Cache Server's published object wrapper, added
  // ahead of the live campaign (2026-08-17). `TCachedObjectWrap` publishes 18
  // `function`s and exactly these 3 `procedure`s; the surrounding members are
  // all functions, so the separator flips inside a single `published` block —
  // the shape that hides this class of mistake.
  //
  // Read directly off the declaration, not off a report:
  //   Cache Server/CachedObjectWrap.pas:35  procedure RDODestroy;
  //   Cache Server/CachedObjectWrap.pas:36  procedure KeepAlive;
  //   Cache Server/CachedObjectWrap.pas:37  procedure Refresh;
  // The Cache/ copy of the same unit agrees (`Cache/CachedObjectWrap.pas:32-34`).
  //
  // All three take ZERO parameters, so per probe U1-a the blast radius is a
  // clean `error 9` rather than a freeze (see the header above). They are listed
  // anyway: the verdict does not depend on arity, and `errIllegalFunctionRes`
  // still leaves the call site unable to tell whether the procedure ran.
  //
  // NAME COLLISIONS — checked before adding, because this map is keyed on the
  // bare member name and a wrong entry would legitimise `"*"` on a function:
  //   - `KeepAlive` is declared `procedure` in every unit of the corpus that has
  //     one (Directory Server, Mail Server, CachedObjectAuto, the TLB). There is
  //     no `function KeepAlive` anywhere, so the flat key is safe on any object.
  //   - `Refresh` has `function` homonyms, but ONLY in Borland/VCL library units
  //     (`Vcl/dbgrids.pas`, `Vcl/adodb.pas`, `Vcl/dsintf.pas`,
  //     `Utils/Archive/ShellObjects.pas`) — none of them is RDO-published, so
  //     none is reachable by a frame. Every `Refresh` on the RDO surface is a
  //     procedure.
  //   - `Refresh` is ALSO the name of a bare push the server sends US
  //     (`C 241 sel 31413720 call Refresh "*" ;`). That is inbound and untouched
  //     by these guards, which only run inside `sendRdoRequest`.
  ['RDODestroy', 'procedure RDODestroy — Cache Server/CachedObjectWrap.pas:35'],
  ['KeepAlive', 'procedure KeepAlive — Cache Server/CachedObjectWrap.pas:36'],
  ['Refresh', 'procedure Refresh — Cache Server/CachedObjectWrap.pas:37'],
]);

/**
 * Members no frame this codebase produces may ever carry, whatever the flags.
 *
 * The developer's GO of 2026-08-18 authorises a mutation campaign on the live
 * `SPO_test3` account and accepts a server crash — with **three exclusions**,
 * and their motive is operational, not prudential: they *"would destroy all the
 * content of the test account and prevent further tests"*.
 *
 *   1. deleting the account;
 *   2. deleting a company;
 *   3. regressing a level.
 *
 * ## Why this is a compiled refusal and not a convention
 *
 * The certification sweep (plan rev. 3 §3) is **blind by construction**: it
 * emits `call M "*"` / `call M "^"` on members it has not identified — that is
 * its entire purpose. It cannot *know* that it just called `RDODelCompany`. An
 * exclusion that rests on "the sweep should not go there" is not an exclusion.
 *
 * And the reach is not hypothetical. Two of the seven are already in the lot-A
 * inventory of what this client addresses — `rdoResetTycoon` (row 59) and
 * `RDOResetTycoonEx` (row 188, `reachability: atteignable`) — and
 * `deleteFacility` opens the construction socket and resolves `TWorld` by
 * `idof World` (`building-management-handler.ts:332-345`), which is the very
 * object that publishes all seven.
 *
 * ## No flag lifts this
 *
 * Not `--allow-mutations`, not `--target dedicated`, not
 * `--allow-variant-on-procedure`. It is not a risk class, it is a prohibition.
 *
 * ## What is NOT here, and why
 *
 * `TWorld.DeleteTycoon` / `DeleteCompany` (`Kernel/World.pas:567-571`) and
 * `TTycoon.ResetLevel` (`Kernel/Kernel.pas:2594`) are `public`, not
 * `published` — `MethodAddress` never sees them (`RDOObjectServer.pas:210`),
 * so they answer `error 5`. Unreachable, nothing to guard.
 *
 * `RDODowngrade` / `RDODowngradeMany` (`Kernel/Kernel.pas:1094-1095`) are NOT
 * exclusion 3. Their `published` block holds `RDOConnectInput`,
 * `RDOStartUpgrade`, `RDOStopUpgrade`: that is the **building** class, and this
 * `Downgrade` drops a building's technology level, reversible by
 * `RDOStartUpgrade`. Exclusion 3 is `RDOAssignLevel`.
 *
 * Add a member here only with its Delphi declaration cited and the exclusion
 * it belongs to.
 */
export const FORBIDDEN_MEMBERS: ReadonlyMap<string, string> = new Map([
  ['RDODelTycoon',
    'exclusion 1 (account deletion) — function RDODelTycoon( name, password : widestring ) : OleVariant — Kernel/World.pas:367'],
  // One parameter and NO password: the most exposed of the seven. A sweep frame
  // carrying a single stray widestring is a complete, valid call.
  ['RDOResetTycoon',
    'exclusion 1 (account reset) — function RDOResetTycoon( name : widestring ) : OleVariant — Kernel/World.pas:368'],
  ['RDOResetTycoonEx',
    'exclusion 1 (account reset) — function RDOResetTycoonEx( name, password : widestring ) : OleVariant — Kernel/World.pas:369'],
  ['RDODelCompany',
    'exclusion 2 (company deletion) — function RDODelCompany( name : widestring ) : OleVariant — Kernel/World.pas:372'],
  ['RDOGetRidOfCompany',
    'exclusion 2 (company deletion) — function RDOGetRidOfCompany( cpnName, tycoonName, password : widestring ) : OleVariant — Kernel/World.pas:373'],
  ['RDOAssignLevel',
    'exclusion 3 (level regression) — function RDOAssignLevel( tycoonName, sysPassword, Level : widestring ) : OleVariant — Kernel/World.pas:402'],
  // Added by the campaign pilot, not by the developer: same family, same
  // irreversibility — it resets the world tournament for every player.
  ['RDOResetTournament',
    'exclusion 3, same family — procedure RDOResetTournament( password : widestring ) — Kernel/World.pas:415'],
]);

/**
 * Throws when a packet addresses one of the {@link FORBIDDEN_MEMBERS}.
 *
 * Matched case-insensitively on purpose: the Pascal is case-insensitive and the
 * lot-A inventory already carries `rdoResetTycoon` with a lower-case first
 * letter. A guard that a change of case walks past is not a guard.
 */
export function assertMemberNotForbidden(packetData: { member?: string }): void {
  if (!packetData.member) return;
  const key = packetData.member.toLowerCase();
  for (const [member, why] of FORBIDDEN_MEMBERS) {
    if (member.toLowerCase() !== key) continue;
    throw new Error(
      `Member "${packetData.member}" is refused unconditionally — ${why}. ` +
      'No flag lifts this refusal (not --allow-mutations, not --target dedicated, ' +
      'not --allow-variant-on-procedure): the developer excluded it on 2026-08-18 because it ' +
      'would destroy the content of the test account and prevent further tests.'
    );
  }
}

/**
 * Throws when the VariantId separator `"^"` targets a known void member.
 *
 * `"^"` on a `procedure` is the form that froze the shared server. It is one of
 * TWO safety guards, not the only one: {@link assertNotVoidPush} is its exact
 * mirror — `"*"` on a `function` — and was reclassified from convention to
 * safety on 2026-08-18, live-proven, when one such frame broke the shared
 * Interface Server. Neither is a matter of style.
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
 * Throws when the VoidId separator `"*"` targets a member that is not a proven
 * Delphi `procedure`.
 *
 * ## This is a SAFETY guard. It was reclassified on 2026-08-18, live-proven.
 *
 * It used to be documented as a project convention — "one wire form per intent"
 * — with the note that `"*"` + QueryId is harmless because the server acks it
 * `A<id> ;`. That is true of a `procedure` and **false of a `function`**, and
 * the difference broke the shared production Interface Server:
 *
 *   `C 1068 sel 29983712 call GetUserList "*";`
 *   → `function TClientView.GetUserList : OleVariant` — Interface Server/InterfaceServer.pas:191
 *
 * From that frame on, the server answered `errMalformedQuery` to **every**
 * query, on every connection, including the Model Server's own `RefreshArea`
 * pushes — still true 13 minutes later
 * (`FIVEINTERFACESERVER/Survival 26-08-18.log:136`, lot S4 sweep).
 *
 * Mechanism, and it is the exact mirror of {@link assertNotVariantOnVoidMember}:
 * under `"*"` the dispatcher passes **no hidden result pointer** — `@ResParam`
 * finds `Res.VType = varEmpty` and jumps straight to `@DoCall`
 * (`RDOObjectServer.pas:281-283`). A compiled `function` writes its `OleVariant`
 * result anyway, through the register its own ABI reserves (`EDX` at zero
 * declared parameters), which the dispatcher left holding whatever was there.
 * That is an arbitrary 16-byte write inside the server process.
 *
 * So the two separators are symmetric, and neither is a matter of style:
 *
 *   - `"^"` on a `procedure` → a result pointer nobody pops → freeze.
 *   - `"*"` on a `function`  → a result written through a register nobody set →
 *     arbitrary memory write.
 *
 * The retired claim of `doc/rdo-protocol-architecture.md` §8.5 ("`\"*\"` +
 * QueryId corrupts all subsequent queries", retired 2026-07-02) was therefore
 * right about the mechanism and wrong only about its scope: the captures that
 * retired it show `"*"` on `AddLine`, `CloseMessage`, `RDOEndSession` and a
 * `set` — procedures and properties, every one of them.
 *
 * **{@link VOID_MEMBERS} is the whitelist**, and it is the only one: each entry
 * carries the Pascal declaration that proves it is a `procedure`. There is no
 * opt-in and there must never be one — an earlier `probe` escape hatch existed
 * for the certification sweep between 2026-08-18 morning and this incident, and
 * it is what let the frame out.
 */
export function assertNotVoidPush(packetData: { separator?: string; member?: string }): void {
  if (!packetData.separator?.includes('*')) return;
  if (packetData.member && VOID_MEMBERS.has(packetData.member)) return;
  throw new Error(
    `Separator "*" must never target "${packetData.member || 'unknown'}" — it is not a proven Delphi ` +
    `procedure. Under VoidId the dispatcher passes no hidden result pointer (RDOObjectServer.pas:281-283), ` +
    `so a function writes its OleVariant result through an unset register: an arbitrary write inside the ` +
    `server process. One such frame (call GetUserList "*") left the shared Interface Server answering ` +
    `errMalformedQuery to every query, on 2026-08-18. Add the member to VOID_MEMBERS with its Pascal ` +
    `declaration if it really is a procedure; otherwise use "^".`
  );
}

/**
 * Members that ESTABLISH, REBIND or END an RDO session.
 *
 * They are legitimate exactly once each, inside the connection floor
 * (authentication -> world -> login -> company). Re-emitted afterwards they do
 * not diverge from the wire — they diverge from the SESSION: a second `Logon`
 * opens a second ClientView on the shared server, `RegisterEventsById` rebinds
 * the push channel to another connection, and `Logoff` / `RDOEndSession` tear
 * down the very session the rest of the run is exploring.
 *
 * This is not theory either. The certification sweep of 2026-08-18 emitted
 * `call Logon "*"` at rid 1089, on a session whose legitimate `Logon` was rid
 * 1019 — 70 frames earlier. Nothing in the harness objected.
 *
 * ## This guard is about the PHASE, not about the member
 *
 * Every name below is something the client emits in normal play. The guard is
 * therefore not "never emit this"; it is "never emit this after the session is
 * established", and only a caller that knows the phase can apply it. In the
 * conformance harness that caller is the runner: everything it emits happens
 * after the connection floor by construction (`runner.ts`).
 *
 * Deliberately NOT wired into `spo_session.ts`: the gateway is the code that
 * legitimately emits all of these, and it emits them from the login handlers
 * where the phase is exactly the one this guard would refuse.
 */
export const SESSION_LIFECYCLE_MEMBERS: ReadonlyMap<string, string> = new Map([
  ['Logon', 'opens a ClientView — a second one is a second session on the shared server (Interface Server/InterfaceServer.pas)'],
  ['AccountStatus', 'read of the account bracket, part of the login exchange'],
  ['RegisterEventsById', 'binds the ClientView to the carrying connection as push channel AND teardown trigger — Interface Server/InterfaceServer.pas:1919-1923'],
  ['SetLanguage', 'session-scoped locale, set once during login'],
  ['Logoff', 'ends the session the run is exploring'],
  ['EnableEvents', 'switches the push stream of the established session'],
  ['ClientAware', 'declares the client ready to receive pushes — part of entering play'],
  ['ClientNotAware', 'the reverse; emitted at teardown'],
  ['RDOOpenSession', 'directory-side session opening'],
  ['RDOEndSession', 'directory-side session close'],
  ['RDOLogonUser', 'directory-side credential exchange'],
  ['RDOMapSegaUser', 'directory-side account mapping, first frame of the floor'],
]);

/**
 * Throws when a packet re-emits one of the {@link SESSION_LIFECYCLE_MEMBERS}.
 *
 * Case-insensitive for the same reason as {@link assertMemberNotForbidden}: the
 * Pascal is case-insensitive, and a guard a change of case walks past is not a
 * guard.
 *
 * The CALLER owns the phase. Call it only where the session is known to be
 * established; see the map's own doc for why it is not in `spo_session.ts`.
 */
export function assertNotSessionLifecycleMember(packetData: { member?: string }, where: string): void {
  if (!packetData.member) return;
  const key = packetData.member.toLowerCase();
  for (const [member, why] of SESSION_LIFECYCLE_MEMBERS) {
    if (member.toLowerCase() !== key) continue;
    throw new Error(
      `${where}: "${packetData.member}" establishes, rebinds or ends an RDO session and the session ` +
      `is already established — ${why}. The connection floor emits it once; a suite re-emitting it ` +
      'opens a second session, rebinds the push channel or tears down the one being explored ' +
      '(the 2026-08-18 sweep emitted `call Logon "*"` at rid 1089, after the legitimate Logon at rid 1019).'
    );
  }
}

/**
 * Members whose value is a property of the TCP connection the query arrived on,
 * not of the addressed object. They MUST travel the primary world socket — the
 * one the session is bound to — never a pool connection.
 *
 * `RDOCnntId` is intercepted by the query parser *before* any object lookup and
 * answered with `ConnId`, the id of the connection carrying the frame
 * (`RDOQueryServer.pas:269-274`, constant `tidConnRequestName` at :9). The id is
 * the address of the socket object itself
 * (`WinSockRDOConnectionsServer.pas:664-668`).
 *
 * The value is then fed straight to `RegisterEventsById`, which binds the
 * server-side `TClientView` to that connection — both as the push channel and as
 * the teardown trigger:
 *
 *   fClientConnection := fServer.fClientsServerConn.GetClientConnectionById(ClientId);
 *   fClientConnection.OnDisconnect := OnDisconnect;
 *   fClientEventsProxy.SetConnection(fClientConnection);
 *     — Interface Server/InterfaceServer.pas:1919-1923
 *
 * Read on a pool connection, the session binds to a socket the pool owns and may
 * destroy at will (`RdoConnectionPool.replaceConnection` on a degraded
 * connection): `OnDisconnect` then tears down the whole ClientView while the
 * primary socket is healthy — the zombie-session failure of O-H1/O-H2, from a
 * new direction.
 *
 * Add a member here only with the server-side interception cited.
 */
export const CONNECTION_BOUND_MEMBERS: ReadonlyMap<string, string> = new Map([
  ['RDOCnntId', 'answered from ConnId before object lookup — Rdo/Server/RDOQueryServer.pas:269-274'],
]);

/**
 * Returns true when the request reads a value bound to the carrying connection,
 * and must therefore bypass the world connection pool.
 */
export function isConnectionBoundMember(packetData: { member?: string }): boolean {
  return !!packetData.member && CONNECTION_BOUND_MEMBERS.has(packetData.member);
}

/** Returns true if the buffer can accept another request. */
export function canBufferRequest(currentSize: number, maxSize: number): boolean {
  return currentSize < maxSize;
}
