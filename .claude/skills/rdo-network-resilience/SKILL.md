---
name: rdo-network-resilience
description: "TRIGGER: When modifying spo_session.ts, reconnect-utils.ts, timeout-categories.ts, error-codes.ts, rdo-request-guards.ts, login-handler.ts, or any code touching RDO connection lifecycle, reconnection, timeouts, error handling, or ServerBusy logic."
user-invokable: false
disable-model-invocation: false
---

# RDO Network Resilience

Auto-loaded when modifying RDO network error handling, reconnection, timeout, or fault tolerance code. This skill documents how the WebClient's RDO network resilience maps to the legacy Delphi client patterns.

## Architecture Overview

```
Browser Client ──WebSocket──▶ Node.js Gateway ──RDO TCP──▶ Delphi Game Servers
       │                            │                            │
  reconnect-utils.ts          spo_session.ts              WinSockRDOConnection.pas
  (client WS reconnect)      (RDO request lifecycle)      InterfaceServer.pas
                              (world auto-reconnect)      ServerCnxHandler.pas
                              (ServerBusy polling)        (proxy management)
```

**WebSocket type direction:** Client->Server = `WsReq*` types, Server->Client = `WsResp*` types. Never mix directions.

**Two reconnect layers:**
1. **L1 — Client→Gateway (WebSocket)**: `src/client/handlers/reconnect-utils.ts` + `client.ts`
2. **L3 — Gateway→Delphi (RDO TCP)**: `src/server/spo_session.ts` (world socket auto-reconnect)

## Critical Files

| File | Purpose |
|------|---------|
| `src/server/spo_session.ts` | RDO session: request lifecycle, reconnect, ServerBusy, keep-alive, GC sweep |
| `src/server/session/rdo-request-guards.ts` | Guards: assertNotVoidPush, canBufferRequest |
| `src/server/session/login-handler.ts` | Login sequence, `reconnectWorldSocket()` |
| `src/shared/timeout-categories.ts` | TimeoutCategory enum + TIMEOUT_CONFIG |
| `src/shared/error-codes.ts` | Error code constants + getErrorMessage() |
| `src/shared/error-utils.ts` | toErrorMessage(err: unknown) |
| `src/shared/auth-error.ts` | AuthError class with authCode |
| `src/client/handlers/reconnect-utils.ts` | Client WS reconnect: delays, max attempts |
| `src/server/rdo.ts` | RdoFramer (TCP framing), RdoProtocol (parse/format) |

## Delphi ↔ WebClient Mapping

### Connection Lifecycle

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `TWinSockRDOConnection.Connect()` | `spo_session.createSocket()` | TCP connect with error/close handlers |
| `TWinSockRDOConnection.Disconnect()` | `socket.destroy()` + cleanup | Called in session close and reconnect |
| `HandleError(eeConnect)` | `socket.on('error')` + reject | Pre-connect errors reject creation promise |
| `HandleDisconnect()` | `socket.on('close')` | Triggers auto-reconnect for world socket |
| `fConnected` boolean | `SessionPhase` enum | WebClient uses phase state machine (richer) |
| `Alive()` check | `this.sockets.has(name)` | Socket presence = liveness |

### Reconnection

| Delphi Pattern | WebClient Equivalent | Key Difference |
|----------------|---------------------|----------------|
| `RenewWorldProxy()` + 5s throttle | `attemptWorldReconnect()` | WebClient: exponential backoff (5s, 10s, 20s) |
| `TReconnectThread` (unlimited retries, 100ms loop) | `RECONNECT_MAX_RETRIES = 3` | **GAP**: WebClient gives up; Delphi never does |
| `fDALastTick` rate limiting | `worldReconnectLastAttempt` | Same concept, different timing |
| `GetNewWorldProxy()` + `GetDAConnection()` | `loginHandler.reconnectWorldSocket()` | WebClient re-does IDOF + session validation |
| `OnDADisconnect → RenewWorldProxy` | `socket.on('close') → attemptWorldReconnect()` | Equivalent for world socket only |
| `OnDSDisconnect / OnGMDisconnect / OnMailDisconnect` | **NOT IMPLEMENTED** | Only world socket has auto-reconnect |

### Query / Request System

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `SendReceive()` + WaitForMultipleObjects | `executeRdoRequest()` + Promise | Delphi: synchronous wait; WebClient: async |
| `GenerateQueryId()` (mod 65536) | `this.requestIdCounter++ % 65536` | ✅ Matches Delphi exactly (WinSockRDOConnection.pas:143) |
| `FindQuery()` by ID | `this.pendingRequests.get(rid)` | Same concept |
| `errQueryTimedOut` on timeout | Timeout state → 'timed-out' | WebClient has late response detection (better) |
| `errQueryQueueOverflow` | "Request buffer full - server busy" | Different trigger but same concept |
| 60s default proxy timeout | TimeoutCategory FAST/NORMAL/SLOW/VERY_SLOW | WebClient has categorized timeouts (better) |
| **No auto-retry on mutations** | `executeWithRetry()` — GET only | ⚠ Delphi: try→except→RenewWorldProxy→return ERROR. NEVER retries CALL/SET. See InterfaceServer.pas NewFacility:1359 |

### Error Handling

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `ErrorCodes.pas` (18 codes) | `error-codes.ts` (40+ codes) | WebClient has MORE codes |
| `CreateErrorMessage()` | `getErrorMessage()` | Equivalent |
| Error classification in exception handlers | `rdo-error-classifier.ts` (RECOVERABLE/FATAL/USER) | ✅ Implemented |
| `fNetErrors` — fMSDownCount check **COMMENTED OUT** in Delphi | `consecutiveRdoFailures` (timeouts only) | Delphi uses RenewWorldProxy in exception handler + 5s throttle instead |
| `RenewWorldProxy()` on proxy call failure | `executeWithRetry()` for GET only + `attemptWorldReconnect()` | ⚠ Delphi NEVER retries mutations — try→except→RenewProxy→return ERROR (InterfaceServer.pas:1359) |
| Return default values on proxy failure | Error propagation to client | Different strategy — WebClient is more transparent |

### ServerBusy

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `fServerBusy` flag | `isServerBusy` boolean | Equivalent |
| Server-side unlimited queue (`fQueryQueue: TList`) | `MAX_BUFFER_SIZE = 20` (client-side) | Different layer: Delphi queues server-side, WebClient buffers client-side. 20 is conservative vs Delphi's unlimited |
| `ModelStatusChanged` push → set fServerBusy | `setServerBusyFromPush()` | ✅ Implemented — instant state change from push |
| Proxy calls fail → RenewWorldProxy | Buffer full → reject request | Different recovery strategy |

### Connection Pooling

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `TRDOConnectionPool` (8 connections) | `RdoConnectionPool` (6 connections) | ✅ Implemented but **DEFERRED** — pool creates raw TCP sockets, Delphi pre-authenticates. Pool `initialize()` not called → dead code. Fallback to primary socket works fine |
| `GetConnection()` (min refcount) | `getConnection()` (min activeRequests) | Same load-balancing strategy |
| `CheckDAConnections()` periodic validation | Health check interval (60s) | ✅ Implemented in pool class |

### Keep-Alive / Health

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `TRefreshThread` (60s sentinel) | `startCacherKeepAlive()` (60s) | WebClient: cacher only |
| `CheckState()` on all clients | N/A (disabled in Delphi too) | Neither implements this |
| `fMaintDue` maintenance mode | `checkMaintenanceMode()` + `EVENT_MAINTENANCE` | ✅ Implemented — detects errorCode 20 (ModelServerIsDown). Note: Delphi's fMSDownCount check is COMMENTED OUT in current source; our approach is more defensive |

## Rules for Modifying This Subsystem

### 1. Timeout Alignment Rule
L3 (RDO) timeout MUST be shorter than L1 (WebSocket) timeout. The RDO layer must reject first so the user gets the real error, not a generic "WebSocket timeout".
```
TimeoutCategory.X.rdoMs < TimeoutCategory.X.wsMs  (always)
```

### 2. Void Push Convention Guard
NEVER use `sendRdoRequest()` for void push (`"*"` separator) — **project convention**, enforced by `assertNotVoidPush`. This is NOT a crash fact: void + QueryId is wire-legal and the server acks it with `A<id> ;` (capture-proven: `RDOEndSession` → `A4 ;`, `AddLine` → `A2174 ;`; RDOQueryServer.pas:174-178). The project standardizes on one form per intent. Matrix: `doc/rdo-protocol-architecture.md` §8.5.
```typescript
// WRONG — violates project convention (assertNotVoidPush throws)
await sendRdoRequest('world', { separator: '*', ... });

// RIGHT — fire-and-forget via writeRdoFrame() (Latin-1, no QueryId)
writeRdoFrame(socket, RdoCommand.build());
```

### 2b. Fire-and-Forget Separator Rule
Fire-and-forget commands (no RID) MUST use `"*"` (VoidId), NEVER `"^"` (VariantId).
`"^"` without a RID crashes the Delphi server — it tries to route a response to a non-existent query.
The `"^"` separator is only valid in the synchronous path (`sendRdoRequest` with RID).
Both `"*"` and `"^"` parse parameters identically (RDOQueryServer.pas:419-454) — the separator
only controls whether the server captures the return value, NOT argument parsing.
```typescript
// WRONG — "^" without RID crashes Delphi server
fireAndForget(RdoCommand.sel(id).call('Method').method().args(...).build());

// RIGHT — fire-and-forget always uses "*"
fireAndForget(RdoCommand.sel(id).call('Method').push().args(...).build());
```
Live capture proof: `C sel 381792472 call RDODisconnectInput "*" "%Plastics","%706,436,";`

### 3. Ghost RID Prevention
Before reconnecting, ALWAYS drain all pending requests. After reconnect, Delphi reuses query IDs. Leftover pending entries would match wrong responses.

### 4. Sequential RDO Commands
Never use `Promise.all()` for concurrent RDO commands on the same socket. Delphi is single-threaded per connection.

### 5. Request Buffering During ServerBusy
When `isServerBusy === true`, new requests go to `requestBuffer`. When busy clears, they flush with 50ms delay between each. Buffer has a max size — overflow rejects the request.

### 6. Connection Pool Per User
Each connected user (StarpeaceSession) should have their own pool of DA connections. Pool size mirrors Delphi: up to 6 connections per user. Connections are load-balanced by minimum active request count. Dead connections are replaced on periodic health check.

### 7. Error Classification & Retry Policy
RDO errors classified via `rdo-error-classifier.ts`:
- **RECOVERABLE** (auto-retry for GET only): `errQueryTimedOut(8)`, `errServerBusy(17)`, `errSendError(10)`, `errReceiveError(11)`
- **FATAL** (no retry, user notification): `errIllegalObject(2)`, `errRequestDenied`, `ERROR_ModelServerIsDown(20)`
- **USER_ERROR** (no retry, user-facing message): `errInvalidName`, `errInvalidPassword`, `ERROR_AccessDenied(15)`

⚠ **CRITICAL — Delphi-verified rule:** NEVER auto-retry CALL/SET mutations. Delphi pattern: `try→except→RenewWorldProxy→return ERROR_Unknown` (InterfaceServer.pas NewFacility:1359, DeleteFacility, etc.). No server-side idempotency protection exists. Retrying a timed-out mutation risks double execution (e.g., building placed twice).

### 8. Reconnect Strategy (Tier-3 conformity)
- **Trigger: world socket `close` event ONLY**, and only if `!loggedOff`. NEVER reconnect on a query timeout or a ServerBusy poll failure — legacy `ReportCnxFailure` is a no-op (ServerCnxHandler.pas:3394-3405); reconnect-on-timeout causes login storms serialized on the IS `fServerLock`.
- **Backoff**: two bounded phases — 3 fast attempts (5/10/20 s exponential) then 20 slow attempts (15 s fixed) = `RECONNECT_MAX_RETRIES = 23` over ~5.5 min, then give up and surface the error to the user (`spo_session.ts:335-341`).
- **Deliberate divergence**: legacy Delphi retries forever in a 100 ms loop; the WebClient caps retries to protect the shared server. ⚠️ `world-reconnect.test.ts` currently asserts `3` against a mock reimplementation, not the real constant (audit P6 — rewrite to drive the real `StarpeaceSession`).
- **ServerBusy poll**: ~50 s cadence (`SERVER_BUSY_CHECK_INTERVAL_MS = 50_000`), stop after 4 consecutive failures (`MAX_CONSECUTIVE_POLL_FAILURES`) WITHOUT reconnecting — mirrors LEDsTimer `mod 50` + `fExceptCount < 4` (ToolbarHandlerViewer.pas:160-162, ServerCnxHandler.pas:3596-3611).
- Before reconnecting, drain all pending RIDs (rule 3); after re-Logon, all old object ids are stale.

## Testing

```bash
npm test -- spo_session        # Session lifecycle, reconnect, buffering
npm test -- rdo-types           # RDO type system
npm test -- rdo                 # Framer, protocol parsing
npm test -- world-reconnect     # Reconnect state machine
npm test -- server-busy         # ServerBusy polling + reconnect trigger
npm test -- timeout-state       # Timeout state machine
npm test -- degraded-mode       # Graceful degradation
npm test -- rdo-request-guards  # Guards (void push, buffer check)
```

## Delphi Source Reference

Key files in `../SPO-Original` (sibling folder of SPO-WebClient):
- `Rdo/Client/WinSockRDOConnection.pas` — Socket connection, query send/receive, error handlers
- `Rdo/Client/RDOConnectionPool.pas` — Connection pooling with load balancing
- `Rdo/Client/RDOObjectProxy.pas` — Proxy timeout, error-to-HRESULT mapping
- `Rdo/Common/ErrorCodes.pas` — 18 RDO error codes
- `Interface Server/InterfaceServer.pas` — RenewWorldProxy, CheckDAConnections, RefreshThread
- `Voyager/URLHandlers/ServerCnxHandler.pas` — TReconnectThread, fNetErrors, Logon
- `Protocol/Protocol.pas` — 40+ application error codes