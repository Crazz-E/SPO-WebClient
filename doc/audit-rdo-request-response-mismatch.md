# Audit Prompt: RDO Request-Response Architecture Mismatch

## Context for the Auditor

You are auditing the SPO-WebClient Node.js gateway's RDO implementation against the legacy SPO-Original Delphi client. This is a multiplayer tycoon game where a browser client talks to a Node.js gateway, which talks to legacy Delphi game servers over the RDO protocol (custom TCP binary/text).

**The project was built by reverse-engineering the Delphi client's RDO protocol.** However, a recent deep analysis revealed that the Node.js gateway may have introduced a fundamental architectural deviation from the legacy client that could be causing real bugs.

## The Discovery

The legacy Delphi client (SPO-Original) uses **two distinct RDO call modes**:

### Mode 1: Fire-and-Forget (`Send()`)
- Wire format: `C sel <objectId> call <Method> "*" <args>;` — **NO QueryId**
- Used for: **most mutations** (set price, set salary, set rent, trade levels, research, construction commands)
- The Delphi proxy sets `WaitForAnswer := false` before these calls
- The `Send()` function in `WinSockRDOConnection.pas` just calls `Socket.SendText()` and returns immediately
- The server processes the command but has **nowhere to send a response** (no QueryId to route it back)
- The separator is `"*"` (void push) — indicating no response expected

### Mode 2: Request-Response (`SendReceive()`)
- Wire format: `C <QueryId> sel <objectId> call <Method> "^" <args>;` — **WITH QueryId**
- Used for: **reads and critical operations** (property GETs, IDOF lookups, Logon, AccountStatus, BindTo)
- The `SendReceive()` function generates a QueryId, adds to pending queue, writes to socket, then blocks on `WaitForMultipleObjects`
- The separator is `"^"` (synchronous) — indicating response expected
- The server sends back `A<QueryId> <payload>` which is matched by `FindQuery()`

### Our Node.js Gateway
- **Uses `sendRdoRequest()` with a RID for EVERYTHING** — reads AND mutations
- Every call gets a QueryId (RID), expects a response, and has a timeout
- We have a guard (`assertNotVoidPush`) that prevents `"*"` separator from being used with `sendRdoRequest()` — but this guard may be hiding the fact that some operations SHOULD use `"*"` (void push) without a QueryId

## The Hypothesis

**The "Unmatched response RID" problem may not be caused by slow server responses at all.** It may be caused by:

1. **We send a QueryId for operations the server doesn't expect to respond to** — the server might ignore the QueryId for void-push operations, or it might send back a malformed/unexpected response
2. **We use `"^"` (synchronous separator) where the Delphi client uses `"*"` (void push separator)** — the server may behave differently depending on the separator, and we may be getting responses we shouldn't be getting
3. **The server sends responses for some operations and not others**, and our timeout fires for the ones that never respond — not because they're "slow" but because they were never going to respond
4. **The `rdoQueue` serialization exists precisely because we made everything request-response** — if mutations were fire-and-forget like in Delphi, there would be nothing to serialize

## What You Need to Investigate

### Phase 1: Map Every RDO Call in the Gateway

For EVERY `sendRdoRequest()` call site in `src/server/session/*.ts` and `src/server/spo_session.ts`:

1. Read the call and note: socket name, verb, action, member, separator, whether a return value is used
2. Cross-reference with the Delphi source in `C:\Users\RobinALEMAN\Documents\SPO\SPO-Original` — find the equivalent call and determine:
   - Does Delphi use `Send()` (fire-and-forget) or `SendReceive()` (blocking)?
   - What is `WaitForAnswer` set to before this call?
   - What separator does Delphi use: `"*"` or `"^"`?
3. Classify each call as: MATCH (same mode as Delphi), MISMATCH (we use request-response where Delphi uses fire-and-forget), or UNKNOWN

Key Delphi files to cross-reference:
- `Voyager/IndustryGeneralSheet.pas` — building property mutations (RDOSetPrice, RDOSetTradeLevel, etc.)
- `Voyager/SrvGeneralSheetForm.pas` — service building properties
- `Voyager/WorkforceSheet.pas` — salary/workforce mutations
- `Voyager/ProdSheetForm.pas` — product price mutations
- `Voyager/SupplySheetForm.pas` — supply constraint mutations
- `Voyager/InventionsSheet.pas` — research operations
- `Voyager/ResidentialSheet.pas` — rent/maintenance mutations
- `Voyager/URLHandlers/ObjectInspectorHandleViewer.pas` — building focus, cacher operations
- `Voyager/ServerCnxHandler.pas` — login, logoff, events, world operations
- `Voyager/URLHandlers/LogonHandlerViewer.pas` — login sequence

### Phase 2: Analyze the Delphi Server's Response Behavior

For each MISMATCH found in Phase 1:
1. Read the Delphi SERVER code if available (look in `Rdo/Server/`, `Server/`, `GameServer/`)
2. Determine: when the server receives a command WITHOUT a QueryId (fire-and-forget), does it:
   a) Process silently (no response sent)?
   b) Still send a response but with no QueryId?
   c) Send a push notification instead?
3. When the server receives the SAME command WITH a QueryId (our approach), does it:
   a) Send a proper response with the QueryId?
   b) Ignore the QueryId and process as fire-and-forget?
   c) Send a malformed response?
   d) Crash or behave unexpectedly?

### Phase 3: Trace the Separator Semantics

The separator in RDO commands (`"*"` vs `"^"`) controls the response mode:
- `"*"` = void push: no response expected
- `"^"` = synchronous: response expected with the QueryId

Investigate:
1. In `src/shared/rdo-types.ts` and `src/server/rdo.ts` — how do we choose separators?
2. Do we ever use `"*"` with `sendRdoRequest()`? (The guard should prevent this)
3. Do we use `"^"` where Delphi uses `"*"`? This would make the server send a response for what was originally a fire-and-forget operation
4. Read `doc/rdo-protocol-architecture.md` for any documented separator rules

### Phase 4: Analyze the `assertNotVoidPush` Guard

This guard in `src/server/session/rdo-request-guards.ts` prevents `"*"` separator from being used with `sendRdoRequest()`. But this guard may be **hiding the real problem**:
- If certain operations SHOULD use `"*"` (fire-and-forget), the guard forces them to use `"^"` instead
- This changes the server's behavior for those operations
- The guard was added to prevent a Delphi server crash — but maybe the solution isn't to change the separator, but to use `socket.write()` directly (without RID) for those operations

### Phase 5: Quantify the Impact

1. Count how many `sendRdoRequest()` calls are MISMATCHes (should be fire-and-forget)
2. For each MISMATCH, assess: does the timeout ever fire? Is this a source of "Unmatched RID" warnings?
3. Check the server logs (if available) for patterns: do Unmatched RIDs correlate with specific operation types?

### Phase 6: Propose Architecture Fix

Based on findings, determine:
1. Which operations should be converted to fire-and-forget (`socket.write()` without RID)?
2. Which operations genuinely need request-response?
3. Does converting mutations to fire-and-forget eliminate the need for:
   - The timeout state machine (this PR)?
   - The `rdoQueue` serialization?
   - The ServerBusy buffering?
4. How would fire-and-forget mutations interact with:
   - Optimistic UI updates (how do we know if the server rejected the change?)
   - The RefreshObject push (does the server send a push notification after processing a fire-and-forget mutation?)
   - Error handling (fire-and-forget means we never know about failures)

## Key Files

### Node.js Gateway (our code)
- `src/server/spo_session.ts` — `sendRdoRequest()`, pending request handling
- `src/server/session/building-property-handler.ts` — building property SET operations
- `src/server/session/building-management-handler.ts` — construction/clone/delete
- `src/server/session/building-details-handler.ts` — cacher reads (SetPath, GetPropertyList)
- `src/server/session/chat-handler.ts` — chat operations
- `src/server/session/road-handler.ts` — road building/demolition
- `src/server/session/zone-surface-handler.ts` — zone painting
- `src/server/session/login-handler.ts` — login sequence
- `src/server/session/rdo-request-guards.ts` — the void push guard
- `src/shared/rdo-types.ts` — RdoCommand builder, separator handling
- `src/server/rdo.ts` — RDO protocol parser/formatter
- `doc/rdo-protocol-architecture.md` — protocol documentation

### Legacy Delphi (reference)
- `Rdo/Client/WinSockRDOConnection.pas` — `Send()` vs `SendReceive()` (the two modes)
- `Rdo/Client/RDOObjectProxy.pas` — `Invoke()` method, WaitForAnswer logic
- `Rdo/Client/RDOMarshalers.pas` — marshaling, timeout routing
- `Rdo/Common/RDOProtocol.pas` — wire format constants
- `Rdo/Common/ErrorCodes.pas` — error code definitions
- `Utils/CodeLib/Threads.pas` — Fork/Join threading (explains async patterns)
- `Voyager/` — all game UI sheets (show which calls use fire-and-forget)

## Expected Deliverables

1. **Classification table**: Every `sendRdoRequest()` call site with MATCH/MISMATCH/UNKNOWN status
2. **Root cause analysis**: Is the Unmatched RID problem caused by timeout-too-short, or by requesting responses for fire-and-forget operations?
3. **Architecture decision**: Should we introduce a `sendRdoFireAndForget()` method alongside `sendRdoRequest()`?
4. **Impact assessment**: If we convert mismatched operations to fire-and-forget, what do we lose (error detection, confirmation) and what do we gain (no timeouts, no queue serialization, Delphi-compatible behavior)?
5. **Migration plan**: Step-by-step plan to fix the mismatches, ordered by risk and impact

## Rules
- Read `CLAUDE.md` at the project root for project conventions and constraints
- Use `delphi-archaeologist` skill for Delphi source analysis
- Use `code-guardian` skill before modifying any `src/` files
- Do NOT modify `src/shared/rdo-types.ts` or `src/server/rdo.ts` without discussion
- Cross-reference every finding with actual Delphi source — no assumptions
