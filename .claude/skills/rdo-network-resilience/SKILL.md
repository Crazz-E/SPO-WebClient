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
| `GenerateQueryId()` (mod 65536) | `this.requestIdCounter++` (unbounded) | **BUG**: Must add `% 65536` |
| `FindQuery()` by ID | `this.pendingRequests.get(rid)` | Same concept |
| `errQueryTimedOut` on timeout | Timeout state → 'timed-out' | WebClient has late response detection (better) |
| `errQueryQueueOverflow` | "Request buffer full - server busy" | Different trigger but same concept |
| 60s default proxy timeout | TimeoutCategory FAST/NORMAL/SLOW | WebClient has categorized timeouts (better) |
| 180s IS proxy timeout (heavy ops) | **MAX 60s** | **GAP**: Need VERY_SLOW category |

### Error Handling

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `ErrorCodes.pas` (18 codes) | `error-codes.ts` (40+ codes) | WebClient has MORE codes |
| `CreateErrorMessage()` | `getErrorMessage()` | Equivalent |
| Error classification (RECOVERABLE/FATAL/USER) | **NOT IMPLEMENTED** | All errors treated same |
| `fNetErrors` counter → reconnect trigger | `consecutivePollFailures` (ServerBusy only) | **GAP**: No general failure counter |
| `RenewWorldProxy()` on proxy call failure | Individual try/catch per handler | **GAP**: No systematic "retry with new proxy" |
| Return default values on proxy failure | Error propagation to client | **GAP**: No graceful degradation |

### ServerBusy

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `fServerBusy` flag | `isServerBusy` boolean | Equivalent |
| IS-level request queueing (large) | `MAX_BUFFER_SIZE = 5` | **GAP**: Buffer too small |
| Proxy calls fail → RenewWorldProxy | Buffer full → reject request | Different recovery strategy |

### Connection Pooling

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `TRDOConnectionPool` (8 connections) | Single socket per service | **GAP**: No pooling |
| `GetConnection()` (min refcount) | N/A | No load balancing |
| `CheckDAConnections()` periodic validation | N/A | No pool health check |
| `DropConnection()` on degraded | N/A | No connection replacement |

### Keep-Alive / Health

| Delphi Pattern | WebClient Equivalent | Notes |
|----------------|---------------------|-------|
| `TRefreshThread` (60s sentinel) | `startCacherKeepAlive()` (60s) | WebClient: cacher only |
| `CheckState()` on all clients | N/A (disabled in Delphi too) | Neither implements this |
| `StoreInfoInDS()` | N/A | WebClient doesn't store in DS |
| `fMaintDue` maintenance mode | **NOT IMPLEMENTED** | No maintenance signaling |

## Rules for Modifying This Subsystem

### 1. Timeout Alignment Rule
L3 (RDO) timeout MUST be shorter than L1 (WebSocket) timeout. The RDO layer must reject first so the user gets the real error, not a generic "WebSocket timeout".
```
TimeoutCategory.X.rdoMs < TimeoutCategory.X.wsMs  (always)
```

### 2. Void Push Crash Guard
NEVER use `sendRdoRequest()` for void push (`"*"` separator). It adds a QueryId which crashes Delphi.
```typescript
// WRONG — will crash Delphi server
await sendRdoRequest('world', { separator: '*', ... });

// RIGHT — fire-and-forget via socket.write()
socket.write(RdoCommand.build() + ';');
```

### 3. Ghost RID Prevention
Before reconnecting, ALWAYS drain all pending requests. After reconnect, Delphi reuses query IDs. Leftover pending entries would match wrong responses.

### 4. Sequential RDO Commands
Never use `Promise.all()` for concurrent RDO commands on the same socket. Delphi is single-threaded per connection.

### 5. Request Buffering During ServerBusy
When `isServerBusy === true`, new requests go to `requestBuffer`. When busy clears, they flush with 50ms delay between each. Buffer has a max size — overflow rejects the request.

### 6. Connection Pool Per User
Each connected user (StarpeaceSession) should have their own pool of DA connections. Pool size mirrors Delphi: up to 6 connections per user. Connections are load-balanced by minimum active request count. Dead connections are replaced on periodic health check.

### 7. Error Classification
RDO errors should be classified before propagation:
- **RECOVERABLE** (auto-retry): `errQueryTimedOut(8)`, `errServerBusy(17)`, `errSendError(10)`, `errReceiveError(11)`
- **FATAL** (no retry, user notification): `errRequestDenied`, `ERROR_ModelServerIsDown(20)`
- **USER_ERROR** (no retry, user-facing message): `errInvalidName`, `errInvalidPassword`, `ERROR_AccessDenied(15)`

### 8. Reconnect Strategy
- **Fast phase**: Exponential backoff (5s, 10s, 20s) — 3 attempts
- **Slow phase**: Fixed 15s interval — continues for 5+ minutes
- **Never give up** until user explicitly navigates away or session expires

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

Key files in `C:\Users\RobinALEMAN\Documents\SPO\SPO-Original`:
- `Rdo/Client/WinSockRDOConnection.pas` — Socket connection, query send/receive, error handlers
- `Rdo/Client/RDOConnectionPool.pas` — Connection pooling with load balancing
- `Rdo/Client/RDOObjectProxy.pas` — Proxy timeout, error-to-HRESULT mapping
- `Rdo/Common/ErrorCodes.pas` — 18 RDO error codes
- `Interface Server/InterfaceServer.pas` — RenewWorldProxy, CheckDAConnections, RefreshThread
- `Voyager/URLHandlers/ServerCnxHandler.pas` — TReconnectThread, fNetErrors, Logon
- `Protocol/Protocol.pas` — 40+ application error codes