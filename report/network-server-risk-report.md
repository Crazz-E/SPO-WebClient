# SPO WebClient ↔ Delphi Server — Network Layer Risk Report

> **Status: PARTIALLY SUPERSEDED (2026-07-03).** Read §1/§3 (server model, S1-S5) as still-valid,
> report-only ground truth — a condensed version now lives in
> [doc/rdo-protocol-architecture.md §3.5](../doc/rdo-protocol-architecture.md). The **WebClient half is
> historical**: B1/B2/B3 were fixed by Tier 3 (F8/F9), C9/B3-jitter by Tier 4 (V3/V5), B4's dormant pool
> was activated with atomic slot acquisition (2026-07-03) — see `rdo-conformity-report.md` and
> `rdo-webclient-conformity-audit.md` (both 2026-07-02). The §6 note on the void-push "crash" uses
> pre-retirement framing: since 2026-07-02, void+QueryId is documented as wire-legal (acked `A<id> ;`),
> not a crash — the guard is a project convention (arch doc §8.5).

**Date:** 2026-06-21
**Audience:** Server (Delphi) developer **and** WebClient (Node.js / TypeScript) developer
**Scope:** Risks in the WebClient network layer that can make the **official Delphi game server** slow or unresponsive.
**Method:** Static audit of `SPO-WebClient` cross-referenced against the `SPO-Original` Delphi source. Every hypothesis was investigated by an independent agent and then **adversarially verified** (a second agent tried to refute it). The server threading/locking model was re-confirmed by direct source reading.

> File references: WebClient paths are clickable; Delphi paths (`SPO-Original`, outside this repo) are given as `file:line`.

---

## 1. Corrected server model (read this first)

The initial intuition — *"the server is dying from too many open connections / a single-threaded InterfaceServer"* — is **wrong**. Direct source reading established the real model:

| Fact | Evidence | Consequence |
|------|----------|-------------|
| The `world` socket talks to `TInterfaceServer`'s client RDO server with **24 worker threads** (`ISMaxThreads=24`). The "1-thread" server (`Sessions.pas:384-385`) is a *different* object — `TSessionServer` on `aClientPort+1` for the `RDOOpenSession` handshake, which the world socket never touches. | `InterfaceServer.pas:20, 2628-2630` | Ordinary RDO **reads run concurrently** (not single-file at the IS). |
| The per-query object-server critical section is **disabled** for the IS: `TRDOServer.Create(..., 24, nil)` passes `nil`; `//SetCriticalSection(...)` is commented; `TRDOObjectServer.Lock` is a **no-op when the CS is nil**. | `InterfaceServer.pas:2629-2631`; `RDOObjectServer.pas:48-53` | Reads are **not** globally serialized at the IS layer. |
| **All heavy reads funnel through ONE shared IS→Model connection.** `ObjectsInArea`, `SegmentsInArea`, `GetSurface`, `SwitchFocusEx` all call `fServer.WorldProxy.RDO...`, where `WorldProxy` is the single `fDAProxy` bound to the single `fDAClientConn`. `GetWorldProxy` holds `fDAProxyLock` only to copy the pointer, not across the call. | `InterfaceServer.pas:2642-2648, 2868-2876, 766, 1023, 1060-1068` | The 24 IS threads **fan in to one socket**. |
| That shared connection lands on the **Model/World server's DA RDO server, which has only 8 worker threads, shared by ALL users.** Each `GetSurface` runs CPU-bound `CompressMap` over the rectangle. | `ModelServer.pas:1257` (`TRDOServer.Create(fDAConn, 8{14}, nil)`); `World.pas:4434-4493`; `MapCompress.pas:29-50` | **The true read chokepoint is the 8-thread Model DA pool.** A read storm degrades *every* user. |
| A single global `fServerLock` serializes the **session-management** methods: `Logon` (`3189`), `AccountStatus` (`3135`), `Logoff` (`3300`), `GetUserList`, `GetWorldYear`, `GetWorldPopulation`, `GetUserCount`, `GetChannel`, `ModelStatusChanged`, channel ops. `Logon`/`AccountStatus` hold it across a cross-server `WorldProxy.RDOGetTycoon` round-trip bounded by `DATimeOut = 10 s`. | `InterfaceServer.pas:2620, 2754-2765, 3135, 3189, 3196`, `:18` | **Login/relogin bursts serialize world-wide**, up to 10 s each. |
| **`ClientView` is leaked on logoff** — `fClients.Extract(ClientView)` runs but `//ClientView.Free;` is commented out. | `InterfaceServer.pas:3314, 3326` | Every logon/relogin cycle **permanently** leaks a `ClientView` + 4 critical sections + a DA pool slot. |
| No max-connection cap, no idle/dead-peer timeout, unbounded query queue; only flood guards are a 1 MB/query size cap and a global `Busy` flag the IS never sets. Mail pool = 5 threads; cacher (WSObjectCacher) = 16 threads. | `WinSockRDOConnectionsServer.pas:42, 515, 777-783, 808`; `InterfaceServer.pas:2452-2465`; `MailServer.pas:10`; `CacheServerReportForm.pas:13` | Idle sockets are cheap; **churn and concurrency are not**. |

**Original Voyager client baseline** (what the server was provisioned for): `ServerBusy` poll ~1 s; cacher KeepAlive 60 s *only while an inspector is open*; **no** world/mail KeepAlive; facility-sheet refresh 20 s *only while open*; **map/financial updates are server-PUSH — the client does not poll the map**; reconnect = 100 ms loop, single thread, *only after a real socket disconnect*.

### What actually makes the server "slow then unresponsive"

1. **Login/relogin bursts** serialized on `fServerLock` (≤10 s each) → hard stalls; **made permanent** by the `ClientView` leak.
2. **Uncached read storms** (especially `GetSurface` fan-out) saturating the **shared 8-thread Model DA pool** → cross-user latency that can cascade into mass timeouts.
3. **Push→pull amplification** + **client-added polling** the original never had → elevated baseline load on the same shared resources.

Idle connection count is **not** a primary driver.

---

## 2. Executive summary

| # | Risk | Owner | Severity |
|---|------|-------|----------|
| **B1** | Request timeouts trigger world reconnects → synchronized relogin storm on `fServerLock` | WebClient | 🔴 High |
| **C1** | Overlay toggle / map refresh fans out one uncached `GetSurface` per zone → saturates the 8-thread Model DA pool | WebClient | 🔴 High |
| **S1** | `ClientView` leaked on every logoff/relogin | Server | 🔴 High |
| **B2** | `ServerBusy` poll's 1 s timeout escalates to reconnect (cadence itself is fine; poll is redundant) | WebClient | 🟠 Medium |
| **B3** | Reconnect backoff has no jitter → synchronized herds | WebClient | 🟠 Medium |
| **B4** | Per-session socket multiplication + no global cap; dormant 6× pool footgun | WebClient | 🟠 Medium |
| **C9** | `REQ_RDO_DIRECT` allows unthrottled arbitrary world calls → hammers the shared DA connection | WebClient | 🟠 Medium |
| **S2** | `Logon`/`AccountStatus` hold `fServerLock` across a 10 s cross-server call | Server | 🟠 Medium |
| **S5** | Single shared IS→Model DA connection + 8-thread Model DA pool = server-wide read chokepoint | Server | 🟠 Medium |
| **C2** | Area/building-refresh push → unthrottled zone re-pull (bounded by client caps) | WebClient | 🟡 Low |
| **C4** | `CACHE_REFRESH` push → unthrottled full building-details re-fetch | WebClient | 🟡 Low |
| **C8** | Uncached ASP fetches, missing timeouts; some reads take `fServerLock` | WebClient | 🟡 Low |
| **S3 / S4** | No connection cap / idle reaper / unbounded queue; flooded workers run at highest priority | Server | 🟡 Low |

**Ruled out** (verified non-issues): retry amplification, pool health-timer leak, void-push crash, request fan-out, and candidates **C3, C5, C6, C7, C10** (see §6).

---

## 3. For the Server (Delphi) developer

These are pre-existing server defects. The WebClient triggers them far harder than the original Voyager client did, but the most robust fixes are server-side.

| ID | Defect | Evidence | Severity |
|----|--------|----------|----------|
| **S1** | **`ClientView` leaked on logoff.** `DoLogOff` extracts the client but `ClientView.Free` is commented out → each reconnect cycle permanently leaks a `TClientView` + 4 critical sections + collections + a DA pool slot. Reconnect churn causes cumulative, non-recoverable degradation. **Highest-ROI server fix.** | `InterfaceServer.pas:3314, 3326` | 🔴 High |
| **S2** | **`Logon`/`AccountStatus` hold the global `fServerLock` across a 10 s cross-server call.** All session-management ops are mutually serialized world-wide; one slow DA proxy stalls every login/logoff for up to 10 s. Under a login burst this serializes into a multi-minute hang. | `InterfaceServer.pas:2620, 2754-2765, 3135, 3189, 3196`; `:18` | 🟠 Medium |
| **S5** | **One shared IS→Model DA connection feeding an 8-thread Model DA pool.** Every client's heavy reads (`ObjectsInArea`/`SegmentsInArea` cache-misses, `GetSurface`, `SwitchFocusEx`) converge on a single `fDAProxy`/`fDAClientConn` and the Model server's 8 DA threads. This is the server-wide read chokepoint that lets one user's fan-out (C1) degrade everyone. | `InterfaceServer.pas:2642-2648, 2868-2876`; `ModelServer.pas:1257` | 🟠 Medium |
| **S3** | **No max-connection cap, no idle/dead-peer timeout, unbounded query queue.** Idle check (`CheckState`) and disconnect-queue purge (`RemoveQuery`) are commented out. Abandoned/half-open sockets persist until TCP resets them. | `WinSockRDOConnectionsServer.pas:42, 515, 808, 874-909`; `InterfaceServer.pas:2452-2465` | 🟡 Low |
| **S4** | **Flooded worker threads default to `THREAD_PRIORITY_HIGHEST`** — a request flood can starve the server's own sentinel/refresh threads. | `RDOQueryServer.pas:95-107` | 🟡 Low |

**Recommended server-side changes (if the server can be rebuilt):**
1. **S1:** restore `ClientView.Free` (or pool/recycle `ClientView`s). This makes reconnect churn survivable.
2. **S2:** move the cross-server round-trips in `Logon`/`AccountStatus` *outside* `fServerLock`, or shorten `DATimeOut`, so a slow DA proxy cannot freeze all logins.
3. **S5:** widen the Model DA pool beyond 8 threads and/or use more than one IS→Model connection for read traffic.
4. **S3:** add an idle/dead-peer reaper and a max-connections ceiling.

If the server **cannot** be changed, treat it as a fragile, login-serialized, leak-on-reconnect, 8-read-threads black box, and apply every mitigation in the WebClient (§4–§5).

---

## 4. For the WebClient developer — confirmed risks

### 🔴 HIGH — B1. Request timeouts trigger world reconnects → synchronized relogin storm
- **Evidence:** [spo_session.ts:315-316](../src/server/spo_session.ts#L315) (`MAX_CONSECUTIVE_RDO_FAILURES=3`); trigger [spo_session.ts:2052-2058](../src/server/spo_session.ts#L2052); reconnect path [login-handler.ts:935-1017](../src/server/session/login-handler.ts#L935); relogin fallback `Logon` at [login-handler.ts:1023-1036](../src/server/session/login-handler.ts#L1023).
- **Mechanism:** A *slow-but-alive* server produces request timeouts on a still-open socket. After 3 consecutive timeouts the session reconnects; if the server-side session has expired (common after a real blip) it escalates to `fullWorldRelogin` → `Logon` → serialized on `fServerLock` (S2), 10 s hold, **plus a leaked `ClientView` (S1)**. The trigger is identical and simultaneous across all sessions, the backoff is deterministic with **no jitter** ([spo_session.ts:1534-1537](../src/server/spo_session.ts#L1534)), and there is **no gateway-wide reconnect/login cap** — a textbook thundering herd that converts "slow" into "unresponsive."
- **Fix:** Reconnect **only on a real socket `close`/`error`** (already wired at [spo_session.ts:1447-1452](../src/server/spo_session.ts#L1447)), never on request-latency timeouts. Add jitter (§B3) and a process-wide reconnect/login concurrency limiter.

### 🔴 HIGH — C1. Overlay toggle / map refresh fans out one uncached `GetSurface` per zone
- **Evidence:** [map-handler.ts:160-164](../src/client/handlers/map-handler.ts#L160) (`toggleZoneOverlay` loops every loaded zone), [map-handler.ts:188-192](../src/client/handlers/map-handler.ts#L188) (`refreshMapData` same), [map-handler.ts:40-59](../src/client/handlers/map-handler.ts#L40); [zone-surface-handler.ts:71-95](../src/server/session/zone-surface-handler.ts#L71) (`getSurfaceData` — **no dedup, no concurrency cap, no `TimeoutCategory`**, unlike `loadMapArea` at [spo_session.ts:1070-1082](../src/server/spo_session.ts#L1070)); [isometric-map-renderer.ts:374](../src/client/renderer/isometric-map-renderer.ts#L374) (`cachedZones` has **no size cap** — N grows to 30-100+ when panning). Server: `GetSurface` uncached `InterfaceServer.pas:1060-1068`; **8-thread Model DA pool** `ModelServer.pas:1257`; CPU-bound `MapCompress.pas:29-50`.
- **Mechanism / impact:** One overlay click loops over *every* cached zone and fires one uncached `GetSurface` each — e.g. 60 zones → 60 `CompressMap` jobs hitting the **shared 8-thread Model DA pool** that *also* serves every other user's reads. One ordinary action degrades map/inspector responsiveness for **all** connected players (tens of ms → seconds); repeated/multi-user toggling can drive latency past the 30 s gateway timeout → mass timeouts → the "slow then unresponsive" symptom. Cross-user, trivially triggerable — hence High.
- **Fix (cheapest first):** (1) **Client debounce** overlay toggle/refresh (250-500 ms) and coalesce rapid toggles. (2) Give `getSurfaceData` the same **dedup + concurrency cap** as `loadMapArea`, and tag it `TimeoutCategory.SLOW`. (3) **Best:** batch — issue ONE `GetSurface` over the union rectangle instead of N per-zone calls (`RDOGetSurface`/`CompressMap` accept any rect). (4) Only refetch zones whose surface is actually stale. (5) LRU-cap `cachedZones`.

### 🟠 MEDIUM — B2. `ServerBusy` poll's 1 s timeout escalates to reconnect (cadence is fine; poll is redundant)
- **Evidence:** [spo_session.ts:299](../src/server/spo_session.ts#L299) (10 s interval), [spo_session.ts:1660-1667](../src/server/spo_session.ts#L1660) (hard 1 s timeout), [spo_session.ts:1698-1707](../src/server/spo_session.ts#L1698) (5 fails → reconnect).
- **Note:** The 10 s cadence is *gentler* than the original Voyager client (~1 s), and the server read is a lock-free boolean. The defect is the **1 s deadline** on a server that legitimately queues multi-second work → false "failure" → timer-driven, fleet-synchronized reconnects (feeds B1). The poll is also **redundant**: the server already pushes busy state (`ModelStatusChanged`), handled by `setServerBusyFromPush` ([spo_session.ts:396](../src/server/spo_session.ts#L396)).
- **Fix:** Delete the poll (rely on the push) or raise the timeout to ≥30 s; never let a slow poll drive a reconnect.

### 🟠 MEDIUM — B3. No jitter on any reconnect backoff → synchronized herds
- **Evidence:** client WS ladder [reconnect-utils.ts:12-32](../src/client/handlers/reconnect-utils.ts#L12); server world ladder [spo_session.ts:1534-1541](../src/server/spo_session.ts#L1534). No `Math.random` in any delay computation.
- **Note:** A *Delphi* restart drops only the gateway's internal `world` socket (the browser WS stays up) → the server-side ladder fires; the full client-side `Logon` replay only happens on a *gateway* restart. Still real: the **first** reconnect wave is perfectly synchronized across all sessions (the first attempt bypasses the throttle).
- **Fix:** Full-jitter both ladders; update [reconnect-utils.test.ts](../src/client/handlers/reconnect-utils.test.ts) to assert a band rather than exact equality.

### 🟠 MEDIUM — B4. Socket multiplication + no global cap; dormant 6× pool footgun
- **Evidence:** ~4 persistent sockets/session ([login-handler.ts:312](../src/server/session/login-handler.ts#L312); [spo_session.ts:858](../src/server/spo_session.ts#L858)/[940](../src/server/spo_session.ts#L940)/[886](../src/server/spo_session.ts#L886)). `WS_MAX_CONNECTIONS_PER_IP=5` ([server.ts:1032](../src/server/server.ts#L1032)) is keyed on the **browser** IP — useless for aggregate gateway→Delphi load when all sessions egress one gateway IP.
- **Note:** The `WORLD_POOL_SIZE=6` pool is **dormant dead code** — `initWorldPool()` never calls `pool.initialize()`, so `size===0` and everything uses the single `world` socket ([spo_session.ts:1469-1502](../src/server/spo_session.ts#L1469), [:1976](../src/server/spo_session.ts#L1976)). Not an active ×6 multiplier — but a latent landmine: a future `initialize()` call would open 6 world sockets/user.
- **Fix:** Add a global session cap (`MAX_TOTAL_SESSIONS` → 503/429); delete or hard-guard the dormant pool.

### 🟠 MEDIUM — C9. `REQ_RDO_DIRECT` allows unthrottled arbitrary world calls
- **Evidence:** [misc-handlers.ts:147-177](../src/server/ws-handlers/misc-handlers.ts#L147) (`handleRdoDirect` validates only phase + verb + field presence — **no rate limit, no member allow-list, no target restriction**); rate-limiter covers only auth/proxy ([server.ts:548-566, 1271](../src/server/server.ts#L548)); RDO lane serializes within a session but allows unbounded back-to-back calls ([server.ts:1228-1233](../src/server/server.ts#L1228)).
- **Mechanism:** A session can emit an unbounded sequential stream of arbitrary (possibly heavy/uncached) world calls; each forced `GetSurface`/`SegmentsInArea` is a Model round-trip on the **single shared DA connection** (S5), so a few sessions inflate every other user's read latency. Secondary: the `fServerLock` login path is brute-reachable if the numeric IS object id is guessed (the browser already legitimately knows a valid `contextId`).
- **Fix:** In `handleRdoDirect`: (1) per-session token-bucket rate limit; (2) member allow-list excluding heavy/uncached reads (route the UI through the existing cached handlers); (3) restrict `targetId` to the session's own `contextId`/`worldContextId`; (4) classify heavy reads as `SLOW` and coalesce identical area requests.

### 🟡 LOW — C2. Area/building-refresh push → unthrottled zone re-pull (bounded)
- **Evidence:** [event-handler.ts:102-128](../src/client/handlers/event-handler.ts#L102) (no time-throttle, unlike the building-property path at [:153-161](../src/client/handlers/event-handler.ts#L153)); [spo_session.ts:1092-1125](../src/server/spo_session.ts#L1092) (2 world calls/zone).
- **Why low:** Bounded per user by `MAX_CONCURRENT=3` ([isometric-map-renderer.ts:139](../src/client/renderer/isometric-map-renderer.ts#L139)) + `MAX_CONCURRENT_MAP_REQUESTS=3` ([spo_session.ts:320](../src/server/spo_session.ts#L320)) + dedup; off-screen invalidations are no-ops; `ObjectsInArea`/`SegmentsInArea` canonical squares are IS-cached. Latency pressure under crowd-on-active-area, self-limiting.
- **Fix:** Debounce/coalesce `triggerZoneCheck()` (e.g. one reload wave per ~2-3 s) in the `EVENT_AREA_REFRESH`/`EVENT_BUILDING_REFRESH` handlers.

### 🟡 LOW — C4. `CACHE_REFRESH` push → unthrottled full building-details re-fetch
- **Evidence:** [event-handler.ts:253-269](../src/client/handlers/event-handler.ts#L253) calls the **full** `requestBuildingDetails` (temp object + ~6 calls) with **no throttle/generation guard**, unlike the sibling `EVENT_BUILDING_REFRESH` path ([:149-182](../src/client/handlers/event-handler.ts#L149)) which is throttled + uses the lightweight in-place refresh.
- **Why low:** Bulk work hits the **16-thread** cacher (concurrent); one `SwitchFocusEx` on the shared DA connection. Modest, but generates an order of magnitude more cacher traffic than the original for a hot focused building.
- **Fix:** Route `CACHE_REFRESH` through the same throttle + generation guard as `BUILDING_REFRESH`, and call the lightweight `requestBuildingRefreshProperties` (avoids the temp-object create/close churn).

### 🟡 LOW — C8. Uncached ASP fetches with missing timeouts; some reads take `fServerLock`
- **Evidence:** [building-templates-handler.ts:38, 108, 204, 314](../src/server/session/building-templates-handler.ts#L204) and [mail-handler.ts:451](../src/server/session/mail-handler.ts#L451) use `fetch(redirect:'follow')` with **no timeout** (contrast `search-menu-service.ts:88-91` which sets 10 s); auto-fired after every company selection ([server.ts:1182](../src/server/server.ts#L1182)). Server: `GetWorldYear`/`GetWorldPopulation`/`GetUserCount` take `fServerLock` (`InterfaceServer.pas:2958, 2979, 3021`).
- **Mechanism:** ASP pages run on the **same box** as the RDO/Model servers and do COM→RDO→DA work, stealing CPU/IIS workers. Worse, the property reads several ASP helpers perform take the **same `fServerLock`** as the login path → a burst can stall logins up to ~10 s each. Missing timeouts mean a wedged IIS page pins the gateway request slot and IIS socket indefinitely.
- **Fix:** Add `AbortController` ~10 s timeouts to every ASP fetch; short-TTL gateway cache for static pages (`KindList.asp`, `FacilityList.asp`, cluster info); per-session concurrency limiter; consider `redirect:'manual'`.

---

## 5. Prioritized remediation

**WebClient developer — do first (highest leverage):**
1. **B1:** reconnect on real socket close only; never on request-latency timeouts.
2. **C1:** debounce overlay/refresh + dedup/cap/batch `getSurfaceData` (biggest single server-load reduction).
3. **B1/B2/B3:** full-jitter both backoff ladders + a gateway-wide reconnect/login concurrency limiter; drop or relax the `ServerBusy` poll (push already wired).
4. **C9:** rate-limit + allow-list + target-restrict `REQ_RDO_DIRECT`.
5. **B4:** global session cap; delete/guard the dormant pool.
6. **C2/C4/C8:** debounce push-driven re-fetches; throttle `CACHE_REFRESH`; add timeouts + short cache to ASP fetches.

**Server developer — do first:**
1. **S1:** stop leaking `ClientView` on logoff — makes reconnect churn survivable.
2. **S2:** take cross-server calls out of `fServerLock` (or shorten `DATimeOut`).
3. **S5:** widen the 8-thread Model DA pool and/or use more than one IS→Model read connection.
4. **S3:** idle/dead-peer reaper + max-connection ceiling.

---

## 6. Ruled out (verified non-issues)

| Item | Why it is not a server risk |
|------|------------------------------|
| Retry amplification on `errServerBusy` | Inert — the RDO `Busy` flag is never set by the IS, so `errServerBusy(17)` is never emitted; remaining retries are GET-only on already-broken sockets. |
| Pool health-check timer leak (`drainAll` vs `close`) | Real bug, but the leaked timer does **zero network I/O** — gateway-local only. One-line fix: use `close()` at [spo_session.ts:1555-1558](../src/server/spo_session.ts#L1555). |
| Void-push (`"*"`+QueryId) crash | Correctly guarded by `assertNotVoidPush` on the only `sendRdoRequest` path ([rdo-request-guards.ts:7-14](../src/server/session/rdo-request-guards.ts#L7)). *Framing superseded 2026-07-02: void+QueryId does not crash at all (acked `A<id> ;`, capture-proven) — the guard is a project convention; see arch doc §8.5.* |
| Concurrent fan-out on one connection | Directory uses 2 separate sockets; the only live concurrency (3-way) lands on the 16-thread cacher. |
| **C3** — end-of-period profile storm | Profile fetch goes to **IIS/ASP** (`TycoonCurriculum.asp` + `RenderTycoon.asp`), issues **zero** `sendRdoRequest`; does not touch the RDO IS. (Folds into C8 as a minor IIS sync-fetch nuance.) |
| **C5** — inspector 30 s poll "double-refresh" | The 30 s timer and the ~5 s push call **different** methods (heavy vs lightweight), not duplicates; 1/30 s cadence, pauses on hidden tab, hits the 16-thread cacher. |
| **C6** — mail reconnect churn | Mail socket is only re-created on actual loss; the false "10 s idle timeout" comment is a doc bug; the mail server cleans up dropped connections. (Fix the comment.) |
| **C7** — 5-min zone re-poll | The staleness reload is **not timer-driven** — it only fires on the next user interaction; idle clients generate zero; both `ObjectsInArea` and `SegmentsInArea` canonical squares are served from shared IS caches. |
| **C10** — cacher KeepAlive always on | Hits only the 16-thread cacher; the server handler is a no-op timestamp write; 1/60 s/session. Negligible. |

---

## Appendix — Method & evidence

Skill `rdo-network-resilience` loaded in the main context; `delphi-archaeologist` / `code-guardian` methodology applied via two multi-agent workflows:

- **`spo-network-server-risk-audit`** (22 agents): 4 Delphi ground-truth extractors, 9 hypotheses × adversarial verification, 1 completeness critic.
- **`spo-partC-candidate-verification`** (20 agents): 10 candidate deep-dives × adversarial refutation, against the corrected server model.

The server threading/locking model (§1) and Part A were re-confirmed by direct reading of `RDOServer.pas`, `RDOObjectServer.pas`, `Sessions.pas`, `ModelServer.pas`, and `InterfaceServer.pas`. Every finding cites `file:line` on both the WebClient and Delphi sides; severities reflect the adversarial verdicts (a finding had to survive a dedicated refutation to be listed as a risk).
