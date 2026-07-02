# RDO Session Lifecycle — Timeouts, KeepAlive, Logoff, Reconnection

> **Companion to** [rdo-protocol-architecture.md](rdo-protocol-architecture.md) (wire format, verbs, dispatch — read its §0 Evidence Hierarchy first).
> **Generated:** 2026-07-02 from the RDO conformity audit (`report/rdo-conformity-report.md`) — live captures + `../SPO-Original` Delphi source.
> **Scope:** everything about *when* and *in what order* the client talks to the servers: session open/close, timers, timeouts, failure policy.
> **Citations:** `[capture :N]` = line N of [Mock_Server_scenarios_captures.md](Mock_Server_scenarios_captures.md). Delphi paths are relative to `../SPO-Original`. WebClient references use symbols (line numbers rot).

---

## 1. Socket & Session Map

| Connection | Server | Root object (`idof`) | Session object | Lifetime |
|---|---|---|---|---|
| Directory | Directory Server | `"DirectoryServer"` | `TDirectorySession` (from `get RDOOpenSession`) | **Per query batch** — open, query, `RDOEndSession`, repeat [capture :8-17, :21-60] |
| World | Interface Server | `"InterfaceServer"` | `TClientView` (from `call Logon "^"`) | Whole play session |
| Mail | Mail Server (`MailAddr:MailPort` from IS gets) | `"MailServer"` | message objects (from `NewMail`) | Per operation |
| Cacher | Cache Server | `"WSObjectCacher"` | `TCachedObjectWrap` temp objects (from `CreateObject`) | While an inspector is open; server-reaped after 5 min idle |

WebClient mapping: `connectDirectory()` creates 2 sockets (auth + query); `loginWorld()` creates the world socket; mail gets its own socket. `worldContextId` = world operations (map focus, queries); `interfaceServerId` = building operations. Implementation: `src/server/session/login-handler.ts`, `src/server/spo_session.ts`.

---

## 2. Canonical Timeout & Cadence Table

All values are **legacy client values** — the WebClient must match them (Tier-3 conformity).

| What | Legacy value | Delphi evidence | WebClient symbol |
|---|---|---|---|
| Default proxy timeout | **60 s** (`DefTimeOut = 60000`) | `Rdo/Client/RDOObjectProxy.pas:100` (applied :143) | `TimeoutCategory.FAST` (`timeout-categories.ts`) |
| In-game world proxy timeout | **180 s** (`ISProxyTimeOut = 3*60*1000`) | `Voyager/URLHandlers/ServerCnxHandler.pas:329` (applied :1052, :2762 — right before `AccountStatus`/`Logon`) | `IS_PROXY_TIMEOUT_MS` (NORMAL/SLOW/VERY_SLOW) |
| Logoff deadline | **5 s** (`LogoffTimeOut = 5000`) | `ServerCnxHandler.pas:330`; `Logoff` itself sets literal `5000` at :2053 | `StarpeaceSession.LOGOFF_TIMEOUT_MS` |
| Directory session proxy timeout | **20 s** | `LogonHandlerViewer.pas:341` (`DSProxy.TimeOut := 20000`) | directory requests in `login-handler.ts` |
| ServerBusy poll interval | **≈ 50 s** (`fTimerCount mod 50` on the LEDs timer tick) | `ToolbarHandlerViewer.pas:160-162` (tick interval lives in the binary `.dfm`; 1 s default tick ⇒ 50 s) | `SERVER_BUSY_CHECK_INTERVAL_MS = 50_000` |
| ServerBusy stop threshold | **4 consecutive failures**, then stop polling (NO reconnect) | `ServerCnxHandler.pas:3596-3611` (`fExceptCount < 4`; success resets to 0) | `MAX_CONSECUTIVE_POLL_FAILURES = 4` |
| Cacher KeepAlive cadence | **60 s** (client timer; must be < server TTL) | `ObjectInspectorHandleViewer.pas:1172-1178` (interval in `.dfm`); WebClient uses the documented `CacheConnectionTimeOut = 60000` | `KEEP_ALIVE_INTERVAL_MS = 60000` |
| Cacher server-side TTL | **5 min idle → object reaped** | `Cache/CacheServerReportForm.pas:244` (`fMaxTTL := EncodeTime(0,5,0,0)`), reaper :186-199 | (server-side; explains why 60 s cadence is safe) |
| Reconnect trigger | **Socket close ONLY** — never on timeout | `ServerCnxHandler.pas:3482-3485` → `ConnectionDropped` :3378-3386; `ReportCnxFailure` is a **no-op** :3394-3405 | `socket.on('close')` gate + `loggedOff` flag |

**Rule:** a query timeout returns `errQueryTimedOut(8)` to the caller and does nothing else — no reconnect, no socket teardown [`WinSockRDOConnection.pas:647-668`]. Reconnecting on timeout causes login storms against the IS `fServerLock` (see `report/network-server-risk-report.md` B1).

---

## 3. Directory Sessions (auth, world lists)

Pattern per operation — **never keep a directory session open** [capture :8-17, :21-60, :64-151]:

```
C 0 idof "DirectoryServer";                            A0 objid="39751288";
C 1 sel 39751288 get RDOOpenSession;                   A1 RDOOpenSession="#142217260";
C 2 sel 142217260 call RDOMapSegaUser "^" "%Crazz";    A2 res="%";
C 3 sel 142217260 call RDOLogonUser "^" "%Crazz","%…"; A3 res="#0";
C 4 sel 142217260 call RDOEndSession "*" ;             A4 ;
```

- `RDOOpenSession` goes out as **`get`** (0-arg function read → COM PROPERTYGET); the answer echoes the member name. See architecture doc §5.3/§8.1.
- `RDOEndSession` is a void call **with QueryId**, acked `A<id> ;`. It is a published member of `TDirectorySession` **only** (`DServer/DirectoryServer.pas:31`) — never send it to the Interface Server (→ `error 5`). (A grep will find one hit in `InterfaceServer.pas:2733`, but that is the IS acting as a *client* closing its own directory proxy — not an inbound member.)
- World lists: `call RDOQueryKey "^" "%Root/Areas/<Region>/Worlds","%<props, newline-separated>"` [capture :25-58]. World names in results are **lowercase** (`Key0=shamba`).

---

## 4. World Session

### 4.1 Login

The exact 18-step sequence (idof → 10 property GETs → timeout 60→180 s → `AccountStatus` → `Logon` → local events server → `MailAccount`/`TycoonId`/`RDOCnntId` GETs → `RegisterEventsById` → `SetLanguage`) is specified in [rdo-protocol-architecture.md §5.2](rdo-protocol-architecture.md#52-complete-login-sequence-world--interface-server). Key session facts:

- **The push channel must exist before `RegisterEventsById`.** The client runs its own RDO server on the SAME socket and registers hook `'InterfaceEvents'` [`ServerCnxHandler.pas:2968-2977`]. The IS then resolves that hook over the reverse direction and pushes via ordinary `C sel <hookId> call …` frames [`InterfaceServer.pas:1891-1942`].
- `RegisterEventsById(ConnId)` uses the value of the magic `get RDOCnntId` (the parser returns the TCP connection id itself, `RDOQueryServer.pas:269-274`).
- The server fires the `InitClient` push (and `ReportNewMail`) **synchronously, before answering** `RegisterEventsById` — the client must be ready to receive pushes before the call's response arrives.
- Pre-logon stale-session cleanup: before a fresh `Logon`, Voyager issues a 5 s-deadline `Logoff` if a previous session might exist [`ServerCnxHandler.pas:1027, :2730`].

### 4.2 Post-login handshake (captured, byte-exact)

Immediately after login [capture :978-1019]:

```
C 34 sel <CVId> set EnableEvents="#-1";      A34 ;          ← enable pushes (bool true = #-1)
C 35 sel <CVId> call PickEvent "^" "#<TycoonId>";  A35 res="%";
C 36 sel <CVId> call GetTycoonCookie "^" "#<TycoonId>","%LastY.0";  … (restore last position)
C sel <CVId> call ClientAware "*" ;                         ← fire-and-forget, no QueryId
```

- `EnableEvents` gates `RefreshObject`/`RefreshArea` pushes server-side (`fEnableEvents`, `InterfaceServer.pas:2080`).
- `ClientAware` / `ClientNotAware` toggle `fAware` (`InterfaceServer.pas:1704-1717`); the client sends them fire-and-forget.
- `PickEvent(TycoonId)` is polled regularly in-game for the news ticker; `TycoonId` is an **integer arg (`#`)**, not `%` (conformity fix F2).

### 4.3 Steady state

| Timer | Action | Notes |
|---|---|---|
| ServerBusy poll (~50 s) | `sel <CVId> get ServerBusy` → `A<id> ServerBusy="#0"` [capture :993-994] | On exception, increment failure count; **at 4, stop polling** — do not reconnect, do not tear down. A success resets the count. |
| PickEvent poll | `call PickEvent "^" "#<TycoonId>"` | News/events; response `res="%"` when empty |
| Map data | **Server pushes** (`RefreshArea`/`RefreshObject`/`RefreshTycoon`) — the client never polls the map | Push filtering: viewport intersect / focused objects (architecture doc §6.4) |
| Mail notification | **Push** `ReportNewMail` from the IS [`InterfaceServer.pas:1927, :4330-4340`] | Voyager never polls mail counts itself — see §6 |

There is **no world-socket or mail-socket keep-alive** in the legacy client. The only keep-alive is the cacher's (§7).

### 4.4 Logoff (world) — exact sequence

`TServerCnxHandler.Logoff` [`ServerCnxHandler.pas:2043-2063`]:

```
1. ClientNotAware                      → C sel <CVId> call ClientNotAware "*" ;   (fire-and-forget)
2. SetOnDisconnect(nil)                → disarm the reconnect handler FIRST
3. proxy timeout := 5000 ms
4. get Logoff                          → C <id> sel <CVId> get Logoff;            (0-arg function → GET)
5. close socket
```

- **`Logoff` goes out as `get`** — 0-arg function read in expression position (`ErrorCode := TErrorCode(fISProxy.Logoff)`).
- Server side, `TClientView.Logoff` is a stub returning `NOERROR` [`InterfaceServer.pas:2019-2022`]; the real teardown happens in `DoLogoff` via the socket disconnect [`InterfaceServer.pas:1799-1817, :1949`].
- **`RDOEndSession` is not a published member of the Interface Server or ClientView** — sending it there yields `error 5` (it is a `TDirectorySession` member only). This was WebClient bug A2 (fixed Tier 2).
- Disarming reconnect before logoff matters: otherwise the deliberate socket close triggers an unwanted reconnect. WebClient equivalent: the `loggedOff` flag checked in the `close` handler (`spo_session.ts endSession()`, test `logoff.validation.test.ts`).

### 4.5 Reconnection policy

- Trigger: **socket `close` event only** (`OnSocketDisconnect` → `ConnectionDropped` → `TReconnectThread` → full re-`Logon` + `EnableEvents` [`ServerCnxHandler.pas:3378-3486, :3407-3473`]).
- `ReportCnxFailure` — called from ~20 error sites — is a **no-op** (body commented out, :3394-3405). Query failures and timeouts NEVER reconnect.
- Before reconnecting, **drain all pending QueryIds**: ids are reused after reconnect and stale entries would match wrong responses.
- After re-`Logon`, the server delivers a **new ClientView id** — all cached object ids from the old session are stale.
- Deliberate WebClient divergence: legacy retries forever in a 100 ms loop; the WebClient uses a **bounded two-phase backoff** — 3 fast attempts (5/10/20 s) then 20 slow attempts (15 s each), i.e. `RECONNECT_MAX_RETRIES = 23` over ~5.5 min, then gives up (`spo_session.ts` `RECONNECT_FAST_RETRIES`/`RECONNECT_SLOW_RETRIES`). Strictly gentler than the legacy infinite loop. ⚠️ Audit 2026-07-02: `world-reconnect.test.ts` asserts `3` against a mock class, not the real constant — see `report/rdo-webclient-conformity-audit.md` P6.

---

## 5. Anti-Pattern Table (session killers)

| Anti-pattern | Consequence | Correct form |
|---|---|---|
| `RDOEndSession` sent to the Interface Server | `error 5` (not a published member of `TInterfaceServer`/`TClientView`) | World logoff = `ClientNotAware` + `get Logoff` + close (§4.4) |
| Reconnect on RDO timeout / poll failure | Login storm serialized on IS `fServerLock` (~10 s per `Logon`) — degrades the whole shuttle | Reconnect on socket `close` only |
| `KeepAlive` sent to the `WSObjectCacher` root | `error 5` — `KeepAlive` is published on `TCachedObjectWrap` only | KeepAlive targets the inspector **temp object** (§7) |
| `CheckNewMail(0, account)` | Server casts ServerId to a **pointer** → AV → always returns `-1` [`MailServer.pas:543, :569-570`] | Obtain ServerId via `LogServerOn(WorldName)` first (§6) |
| `socket.write()` with Node's default UTF-8 | Bytes ≥ 0x80 become multi-byte → mojibake/desync on the ANSI wire | All writes via `writeRdoFrame()` (Latin-1) |
| `"^"` separator without a QueryId | Reply has no destination; reported crash (live incident); the legacy client cannot emit this form | Fire-and-forget always uses `"*"`; wanting a result implies a QueryId |
| Anchored error regex `^error\s+(\d+)$` | `error <n> getting/setting <Prop>` parsed as success | Accept the suffixed grammar (architecture doc §7.1) |
| Keeping a directory session open across operations | Diverges from reference behavior; session refcount leaks | One `RDOOpenSession`…`RDOEndSession` per batch (§3) |

---

## 6. Mail Session

**Two distinct paths — do not conflate them:**

1. **Unread-count notification (legacy path): the client does nothing.** The IS itself logs onto the mail server (`fMailId := fMailServer.LogServerOn(fWorldName)`, `InterfaceServer.pas:4147`) and pushes `ReportNewMail(count)` to the client at login and on new mail [`InterfaceServer.pas:1927, :4345-4359`]. Voyager never calls `CheckNewMail`.
2. **Direct mail-server operations (WebClient necessity — composing/reading):** the client opens its own socket to `MailAddr:MailPort` (from the login property GETs) and talks to `"MailServer"`. If the WebClient calls `CheckNewMail(ServerId, Account)` itself, it MUST first obtain a valid `ServerId` via `LogServerOn(WorldName)` — passing `#0` triggers the pointer-cast AV (§5). Conformity fix F10, `mail-handler.ts`.

**Captured compose flow** [capture :3538-3549]:

```
C 2172 idof "MailServer";                                    A2172 objid="30437308";
C 2173 sel 30437308 call NewMail "^" "%<fromAddr>","%<fromName>","%<subject>";
                                                             A2173 res="#30430748";   ← message object id
C 2174 sel 30430748 call AddLine "*" "%test message";        A2174 ;                  ← void + QueryId, acked
C 2175 idof "MailServer";                                    A2175 objid="30437308";  ← observed redundant re-resolve
C 2176 sel 30437308 call Save "^" "%Shamba","#30430748";     A2176 res="#-1";         ← boolean true
C 2177 sel 30437308 call CloseMessage "*" "#30430748";       A2177 ;
```

- `Save` writes to the **Draft** folder; `Post` sends to recipients — decls `MailServer.pas:110-111`; impls: `Save` :828-841 (`PostMailIn(… tidDraft …)`), `Post` :755-826 (`SendMailTo`).
- Note the QueryId continuity (2172+): the legacy QueryId counter is process-global — expected, not an anomaly.

---

## 7. Cacher / Inspector Session (KeepAlive)

Lifecycle of a building-inspector session against the Cache Server:

1. `idof "WSObjectCacher"` → root id. The root serves `CreateObject`/`GetCacheServerProxy`-style calls only.
2. `CreateObject` returns a **`TCachedObjectWrap` temp object id** — all property reads (`GetPropertyList`, `SetPath`, `GetSubObjectProps`…) target this temp object ([building_details_protocol.md](building_details_protocol.md), raw trace `building_details_rdo.txt`).
3. **KeepAlive every 60 s, on the temp object** — `KeepAlive` is published on `TCachedObjectWrap` (`Cache/CachedObjectWrap.pas:33`, impl :292-294: `fLastUpdate := Now`). Data methods also auto-touch `fLastUpdate`, so KeepAlive only matters while the inspector sits idle.
4. Server reaper: objects idle > **5 minutes** are freed (`CacheServerReportForm.pas:244` `fMaxTTL := EncodeTime(0,5,0,0)`; sweep :186-199). A 60 s cadence gives 5× margin.
5. `CloseObject` when the inspector closes; stop the KeepAlive timer (no temp object → nothing to keep alive; the root does NOT publish `KeepAlive` → `error 5`).

Legacy client timer: `ObjectInspectorHandleViewer.pas` `KeepAlive: TTimer` → `fCacheObj.KeepAlive` (:1172-1178, :791-794) — runs **only while an inspector is open**. WebClient: `startCacherKeepAlive()` targeting `getActiveInspectorTempObjectId()` (`spo_session.ts`, test `keepalive.validation.test.ts`).

---

## 8. WebClient Implementation Map

| Concern | File / symbol | Validation |
|---|---|---|
| Framing, quote-aware `;` split | `src/server/rdo.ts` — `RdoFramer`, `RdoProtocol` (protected file) | `rdo.test.ts` |
| Latin-1 writes | `src/server/rdo-helpers.ts` — `writeRdoFrame()` | `encoding.validation.test.ts`, `no-raw-rdo-writes.test.ts` |
| Timeout tiers (60 s / 180 s) | `src/shared/timeout-categories.ts` — `TimeoutCategory`, `IS_PROXY_TIMEOUT_MS` | `timeout-state-machine.test.ts` |
| Directory login (`get RDOOpenSession`) | `src/server/session/login-handler.ts` — `connectDirectory()` | `auth.validation.test.ts` |
| World login + reconnect | `login-handler.ts` — `loginWorld()`, `reconnectWorldSocket()` | `world-login.validation.test.ts`, `world-reconnect.test.ts` |
| ServerBusy poll (50 s / stop@4 / no reconnect) | `spo_session.ts` — `SERVER_BUSY_CHECK_INTERVAL_MS`, `MAX_CONSECUTIVE_POLL_FAILURES` | `server-busy-reconnect.test.ts` |
| Graceful logoff (`ClientNotAware` + `get Logoff` 5 s) | `spo_session.ts` — `endSession()`, `LOGOFF_TIMEOUT_MS`, `loggedOff` | `logoff.validation.test.ts` |
| Cacher KeepAlive (60 s, temp object) | `spo_session.ts` — `startCacherKeepAlive()`, `KEEP_ALIVE_INTERVAL_MS`; `building-details-handler.ts` | `keepalive.validation.test.ts` |
| Mail `LogServerOn` → `CheckNewMail` | `src/server/session/mail-handler.ts`; `spo_session.ts` (`mailIntServerId`) | `mail.validation.test.ts` |
| Fire-and-forget guard (project convention) | `src/server/session/rdo-request-guards.ts` — `assertNotVoidPush()` | `rdo-request-guards.test.ts` |
| Error classification (no retry on mutations) | `src/server/session/rdo-error-classifier.ts` | — |
| Push routing | `src/server/session/push-dispatcher.ts` | — |

**Retry rule (Delphi-verified):** NEVER auto-retry CALL/SET mutations — the legacy pattern is `try → except → RenewWorldProxy → return ERROR` with no idempotency protection (`InterfaceServer.pas` `NewFacility` :1359). Retry GETs only.
