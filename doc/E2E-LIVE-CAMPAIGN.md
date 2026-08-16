# E2E Live Mutation Campaign — Autonomous Browser Testing × Server-Log Correlation

**Status:** PROPOSED 2026-08-14 — pending developer answers (§10). Extends [E2E-STRATEGY.md](E2E-STRATEGY.md) with a new layer **L3M**; does not modify the adopted strategy until §10 is answered.
**Goal:** 100 % coverage of the **creation/modification surface** (buildings and values) against the **live** servers, driven autonomously by Claude through Playwright MCP, with every mutation correlated against the public server logs at `http://158.69.153.134/logs/`.
**Companion docs:** [E2E-TESTING.md](E2E-TESTING.md) (login procedure, `__spoDebug`, capture mode), [rdo-session-lifecycle.md](rdo-session-lifecycle.md) (timers, logoff, reconnection), [rdo-protocol-architecture.md](rdo-protocol-architecture.md) (wire canon).

---

## 1. Position in the Test Architecture

```
L4  Production compliance      (unchanged)
L3M Live Mutation Campaign     ← THIS DOC — agent-driven, mutations allowed, log-correlated
L3  Live Smoke                 (unchanged — read-only, pre-release)
L2  System E2E vs mock         (unchanged — home of protocol-adversarial + persona tests)
L1  Protocol conformance       (unchanged)
L0  Unit + component           (unchanged)
```

**Policy delta.** [E2E-STRATEGY.md §9](E2E-STRATEGY.md) rules "no destructive actions on the live server, ever". The developer's 2026-08-14 directive supersedes that rule **for this campaign only**: placements, demolitions of our own placements, and value mutations with the locked `SPO_test3` account are authorized under the guardrails of §7. The exception is scoped — L2 remains the only home for protocol-level adversarial input (malformed frames, fuzzing), and L3 smoke remains read-only.

**Why live, when L2 exists.** The mock replays what we already believe; only the live Delphi stack can falsify it. The campaign's purpose is to *provoke* divergences: real RTTI dispatch, real economy state, real concurrency, real push timing — then catch them through three independent evidence streams (wire, UI state, server logs).

---

## 2. The Two Evidence Streams

### 2.1 Client side — gateway wire log (already implemented)

Start the gateway in capture mode ([E2E-TESTING.md](E2E-TESTING.md) §Server Lifecycle):

```bash
LOG_LEVEL=debug LOG_JSON=true LOG_FILE=logs/campaign-<date>-<n>.ndjson CACHE_SKIP_SYNC=true npm run dev
```

Every RDO frame is logged with millisecond timestamps and the gateway session id (`sid`):

| Tag | Emitted by | Payload fields |
|---|---|---|
| `RDO>>` | `sendRdoRequest()` (`spo_session.ts`) | `command`, `verb`, `rid`, `timeoutMs`, `separator`, `raw` (redacted) |
| `RDO>*` | `writeRdoFrame()` tap (`rdo-helpers.ts`) | `raw` — fire-and-forget frames |
| `RDO<<` | socket ingress (`spo_session.ts`) | `type`, `rid`, `raw` — answers and pushes |

In-browser, `window.__spoDebug` provides `sent/received/errors`, `history` (last 200 messages) and `getState()` — the standard assertion surface.

### 2.2 Server side — public log endpoint (format discovered 2026-08-14)

`http://158.69.153.134/logs/` — plain HTTP (no TLS; fetch with `curl`, not WebFetch), IIS directory listing, daily rotation `<Category> YY-MM-DD.log`. Timestamps inside files are **server-local, 12-hour clock, 1 s precision, no date component** (the filename carries the date).

| Directory | Category | Format & content (sampled) | Campaign use |
|---|---|---|---|
| `FIVEINTERFACESERVER` | `Survival` | Step-by-step **LOGON traces**: `LOGON ATTEMPT: User=<tycoon>`, `TycoonProxyId=<id>`, `LOGON SUCCESS: ClientViewId=<id>`, `<tycoon>.IP = <ip>`, numbered disconnect traces | **Session bracketing + clock calibration.** `ClientViewId` is the very object id our gateway receives from `Logon` — a direct join key with the wire log |
| `FIVEINTERFACESERVER` | `Clients` | TSV per session: `tycoon ⇥ IP ⇥ login ⇥ logout ⇥ exit-code` (0 = clean; non-zero observed on abnormal end) | Post-run session audit: our sessions must all close with code 0 |
| `FIVEINTERFACESERVER` | `Chat` | Chat lines | Chat-send correlation |
| `FIVEMODELSERVER` | `Survival` | Simulation heartbeat every ~15 s (`Check roads`, integrator counters `N>`/`<N+1`, `SIM-*` phases, `Period(day)` + **game date**) | **Server-health oracle**: a heartbeat gap or missing SIM phase during our window = distress signal → abort |
| `FIVEMODELSERVER` | `Demolition` | `H:MM:SS AM/PM - T<DelphiClass>` per demolished object (e.g. `TCircuit` road segments; class only, no actor/coords) | Demolition correlation by time window + class |
| `FIVEMODELSERVER` | `Money` | `Sending money: <from> to <to>, $<amount>` (rare) | Money-transfer correlation, amount as signature |
| `FIVEMODELSERVER` | `EOY` / `Population` / `Office` | Daily economic summaries (`CITY_OVERLOADED`, growth blocks…) | Background context only |
| `FIVEMODELSERVER` | `ClassInfo` | Data-integrity warnings (`Invalid record size <Good>`) | Anomaly watch |
| `FIVEMODELSERVER` | `favorites` | `"<tycoon>" Get "<path>", "<name>"` per favorites access | Favorites-mutation correlation (Set expected symmetric) |
| `FIVEMODELSERVER` | `TimeWarp` | World restart/timewarp reports with political summary | **Red alert**: a TimeWarp during our window may mean we took the world down |
| `FIVECACHESERVER` / `FIVEMAILSERVER` | `Survival` | Server heartbeats | Health oracle for inspector/mail tests |

**Known blind spots** (to confirm with the developer, §10): no dedicated *construction* log was observed (placements must be verified through pushes + re-reads + next-day logs, not a build log); `Demolition` has no actor attribution (correlate by time + class + our registry); log scope may be planitia-only (`TimeWarp` names Planitia; `Office` names Marsica) — multi-world coverage unknown; no exception/stack-trace category observed so far — IS `Survival` is the closest thing to an error channel.

---

## 3. Correlation Model

### 3.1 Join keys, strongest first

1. **Session bracket** — `Clients` row + IS `Survival` LOGON trace matched on tycoon name (`SPO_test3`) and our egress IP; `ClientViewId` must equal the `Logon` result in our wire log. Everything inside the bracket is attributable to us (the account is used by no one else).
2. **Clock-offset time window** — after calibration (§4), every journaled action maps to a ±2 s server-local window; category-specific lines inside the window are candidate matches.
3. **Event signature** — class name (`Demolition`), amount (`Money`), text (`Chat`), path (`favorites`) narrows candidates to certainty.
4. **State round-trip** — the strongest oracle needs no server log at all: re-read what we mutated (same session, then next session) and compare.

### 3.2 Oracle taxonomy — every matrix row declares which apply

| # | Oracle | Source | Detects |
|---|---|---|---|
| O1 | Wire ack | `RDO<<` answer for the mutation's `rid`: `res=`/ack vs `error N [getting/setting P]` | Server-rejected or timed-out mutation; wrong verb/signature |
| O2 | State round-trip | Re-read the value/object (inspector re-open, area re-read) in-session | Silent no-op mutations, wrong-field writes, encoding corruption |
| O3 | Push receipt | `RefreshArea`/`RefreshObject`/`RefreshTycoon` after the mutation | Broken push filtering, missing viewport refresh |
| O4 | Server log line | Category line inside the calibrated window (§2.2) | Server-side effect happened (or pathologically didn't) |
| O5 | No pathology | IS/MS `Survival` clean, no heartbeat gap, no `TimeWarp`, `Clients` exit code 0, no gateway disconnect/timeout | Crashes, stalls, session corruption we caused |
| O6 | Persistence | Next-session login sees the state (registry diff) | Lost writes, model/persistence divergence |

**O1 is not universally available — this shapes the whole campaign.** Fire-and-forget mutations (`writeRdoFrame`, `"*"`, no QueryId) have **no response frame by design**, and that is roughly 30 of the 78 rows. For those, O2 is the only in-session oracle. Worse, the gateway's own read-back cannot serve as O2: `setBuildingProperty` returns `success: true` unconditionally and falls back to echoing the *requested* value when the read comes back empty (`building-property-handler.ts:184-188`). **The campaign must perform its own independent re-read and compare against what it asked for.** Full per-transport availability table: [coverage-matrix.md §2](../report/campaign/coverage-matrix.md).

### 3.3 The correlator tool (to build — first implementation task after §10)

`src/tools/correlate-server-logs.ts` (bundled like `capture-cli.ts`):

- **Inputs:** campaign journal (below), gateway NDJSON log, date range.
- **Fetch:** downloads the day's (and, around midnight, the adjacent day's) logs for all four servers into `report/campaign/logs-cache/<date>/` (curl, plain HTTP, cache immutable).
- **Parse:** per-category parsers for the §2.2 formats (TSV, `H:MM:SS AM - msg`, LOGON blocks).
- **Align:** applies the session clock offset (§4) to place journal actions on the server timeline.
- **Match:** per journal action, evaluates declared oracles → `PASS / FAIL / INCONCLUSIVE / ANOMALY` (+ unexpected server lines inside our bracket are always surfaced).
- **Emit:** markdown section for the session report + JSON for the coverage matrix update.

**Campaign journal** — written by the agent during the run, one NDJSON line per action:
`{ts, action, matrixId, params, placedId?, coords?, expect: [O1..O6], notes}` → `report/campaign/journal-<date>-<n>.ndjson`.

---

## 4. Clock Calibration (every session)

1. Record client UTC (`Date.now()`) when clicking **Enter the World**.
2. After login, fetch today's IS `Survival`; locate `LOGON ATTEMPT: User=SPO_test3` → `LOGON SUCCESS: ClientViewId=<id>`.
3. Verify `ClientViewId` equals our wire-log `Logon` result (join-key sanity).
4. `offset = serverLocalTime − clientUtc` (expect a stable value; the host is plausibly America/Toronto — confirm empirically, never assume).
5. Re-derive at every login; if drift > 2 s between sessions, recalibrate before correlating.

---

## 5. Campaign Mechanics — the Autonomy Loop

### 5.1 Persistent campaign state (survives sessions; the answer to "the world always changes")

| File | Content | Rule |
|---|---|---|
| `report/campaign/coverage-matrix.md` | §8 matrix with per-row status (`todo / nominal-pass / adversarial-pass / blocked / bug-filed`) | Single source of campaign progress |
| `report/campaign/placed-registry.json` | Every object we ever placed: `{world, coords, class, placedAt, sessionRef, status: active\|demolished\|orphan}` — **keyed on coordinates, not on a facility id** | The placement response cannot supply an id (defect D-A: the handler greps `/sel (\d+)/` in an answer that never contains `sel`), so the object id is re-resolved by focusing the tile, every session. **Never** trust remembered coordinates either — re-verify against the live map on each run; register the placement in the same breath as the ack; reconcile orphans (placed but unconfirmed) first thing next session |
| `report/campaign/session-<date>-<n>.md` | Per-session report: actions, oracle results, anomalies, server-log excerpts | One per run |

### 5.2 Session script

```
1. Start gateway in capture mode (fresh LOG_FILE)          [§2.1]
2. Baseline: fetch today's server logs (pre-run snapshot)
3. Login via the locked procedure (E2E-TESTING.md) — SPO_test3 / Free Space / planitia / SPO_test3 - Green
4. Calibrate clock (§4); reconcile registry orphans; on a P0/P2 session also fetch the live
   build catalogue + real prices from `FacilityList.asp` (the only price oracle — matrix §5.1)
5. Execute the session plan: a SMALL batch of matrix rows (≤ budget, §7)
   — one mutation at a time, strictly sequential (concurrency discipline, arch §3.5)
   — journal line BEFORE the gesture, ack/oracles recorded AFTER
   — placements registered immediately with coords + returned id
6. In-session verification (O1–O3), including one inspector re-open per mutated facility
7. Clean logoff (Switch Server / page close → gateway ClientNotAware + get Logoff), stop gateway
8. Fetch server logs (post-run), run the correlator, evaluate O4–O5
9. Next session opens with O6 (persistence) checks of the previous session's mutations
10. Update matrix + registry; write the session report; file bugs (§9)
```

### 5.3 Placement discipline in a persistent shared world

- **Discovery-first:** free buildable land is found live each session (map reads + debug overlays: tile info `d`+`1`, building info `d`+`2`), never assumed. Preferred zone: developer-designated test area (§10 Q3), recorded in the registry once chosen.
- **Distance rule:** never build adjacent to another player's facility (default: keep ≥ N tiles clearance — Q4); economic side effects on neighbours must stay negligible.
- **Cheap-first:** the placement palette is restricted to a developer-approved list of low-cost, dependency-free buildings (Q2) until budgets are known.
- **Finding other players' buildings** (read/inspect/connection tests): the Search panel and map scan; targets for supplier-connection mutations are developer-nominated (Q6) — we never modify a third party's facility, only wire-legal connection requests our UI offers.
- **Cleanup:** per the developer's policy (Q5) — default proposal: demolish everything we placed at the end of each session; the registry is the demolition checklist; `Demolition` log confirms each teardown (O4).

---

## 6. Bug-Provocation Tactics (application-level, wire-legal only)

Per matrix row, four escalation stages — later stages only after nominal passes:

1. **Nominal** — the documented gesture with sane values.
2. **Boundary values** — 0, minimum, slider maximum, non-round decimals (exercises `#`/`@`/`!` encoding paths live), long names, names containing `"` (escaping doubles), Latin-1 accents (`é`, `ü` — encoding round-trip), leading/trailing spaces, empty string where the UI permits.
3. **Invalid context** — mutation on a just-demolished facility (stale id → expect clean `errIllegalObject` surface, not a client crash), demolish twice fast (double-click race), placement on occupied/illegal tiles, placement while broke (if reachable, Q1), value set while the inspector's cacher object expired (>5 min idle — TTL edge, lifecycle §7).
4. **Temporal** — mutation followed by immediate hard disconnect (kill the page): verify **no auto-retry** materializes a double placement on reconnect (the non-idempotency trap, lifecycle §8); mutation during the reconnect overlay; mutation racing a `RefreshArea` push.

**Absolute interdictions (live):** no hand-built or fuzzed frames (`REQ_RDO_DIRECT` stays unused — risk C9); no protocol malformation (L2 mock only); no mutations targeting other players' property; no demolition of anything absent from our registry; no login storms (bounded reconnect stays as shipped); no sustained bursts — default pacing ≤ 1 mutation per 2 s except where a race IS the test and Q7 allows it.

**Abort conditions — stop the session immediately, report, do not retry:** MS `Survival` heartbeat gap > 60 s; `TimeWarp` entry appearing in-window; `ModelStatusChanged` busy push; ServerBusy poll failures reaching the stop threshold; any `Clients` exit-code ≠ 0 for a session of ours we believed clean; repeated `errQueryTimedOut` on mutations.

---

## 7. Guardrails & Authorization Scope

- The SEC-N exception covers **only** deliberately started campaign sessions with the developer aware a campaign is running; never an unattended loop or cron against live. Gateway stopped after every session.
- Per-session budget (defaults until Q5 answers): ≤ 10 placements, ≤ 15 demolitions (own registry only), ≤ 40 value mutations, one world (planitia).
- The locked credentials remain locked; company `SPO_test3 - Green` only. Political-office flows (Minister of Agriculture) are in scope read-mostly; ministry *mutations* only with explicit listing in the matrix.
- Anything that looks like server distress → §6 abort conditions, then the session report leads with it.

---

## 8. Coverage Matrix — the 100 % Target

The full 78-row matrix (mutation, transport, RDO member, scope, oracles, live status) is the campaign's living progress file: **[report/campaign/coverage-matrix.md](../report/campaign/coverage-matrix.md)**. It is seeded from the WebClient mutation inventory (2026-08-14). This section defines the *scope buckets* and what "100 %" means; the matrix carries per-row status.

### 8.1 What "100 % of the modification/creation surface" covers

78 distinct persistent-state mutations across 8 families: building lifecycle (place/demolish/rename/upgrade/clone/repair, 12), facility values (prices/wages/inputs/trade/research/movies…, 26), economic connections (7), civic/political (7), company & finances (16), communication (5), map/terrain (roads/zones, 4), and the debug escape hatch (1). Three transports: sync RDO, fire-and-forget RDO, and legacy ASP-over-HTTP proxied by the gateway — **all three mutate world state and all three are in scope.**

### 8.2 Scope buckets (provisional until Q1–Q11)

| Bucket | Count | Meaning for the campaign |
|---|---|---|
| **LIVE now** | ~18 | `SPO_test3` can run these today, non-destructive, no cash — the campaign's warm-up set |
| **MONEY-gated** | ~7 | Spend real in-world cash; depth set by Q1/Q2 budget |
| **TYPE-gated** | ~24 | Need a specific facility kind placed & owned first → placement (#1) is the keystone that unlocks them |
| **ROLE:mayor / pres / gm** | 13 | `SPO_test3` lacks the role → **live only if Q11 grants a privileged account**, else declared L2-only |
| **DESTRUCT** | 3 | Create-company / reset-account / abandon-role → live only with explicit Q5/Q9 sign-off (default: #59/#60 excluded, #53 one controlled run) |
| **L2-ONLY** | 1 | `REQ_RDO_DIRECT` — never live (risk C9) |

### 8.3 Known defects to CONFIRM live (verified in source, 2026-08-14)

The campaign doesn't only guard working paths — these are *expected* to misbehave, and the live run is their confirmation. Each is detailed with its evidence in [coverage-matrix.md §3](../report/campaign/coverage-matrix.md):

- **D-C · #15 wages broken (P0):** the salary editor resolves to a nonexistent member and emits `call Salaries0 "*" "#500"` instead of `RDOSetSalaries` (`template-groups.ts:403` declares `allSalaries`, which `property-utils.ts` never reads). O2 must show the wage *unchanged* while the UI reports success.
- **D-D · silent unknown-member fallback:** any unmapped `propertyName` is sent verbatim as an RDO call with no allow-list — UI typos become frames the server drops. Campaign-wide invariant: where O1 exists it must agree with O2; where it doesn't, O2 must show the requested value.
- **D-B · #3 demolition result code discarded:** `deleteFacility` awaits `RDODelFacility` and only logs the answer, returning `success: true` unconditionally (`building-management-handler.ts:343-357`). O1 is unusable for the row → confirm via O2 (tile re-read) + O4 (`Demolition` log).
- **D-A · #1 placement returns no building id:** the handler greps `/sel (\d+)/` in an RDO *answer*, which is `A<rid> res="#0";` and never contains `sel` (`building-templates-handler.ts:535-544`). This is why the registry keys on **coordinates** and re-resolves object ids by focusing the tile.
- **#75 `BreakCircuitAt` ambiguous code 0:** success and "no segment here" are indistinguishable → O2 mandatory.

One inventory flag was *cleared* on inspection (**D-E**): `JoinChannel`/`GetChannelInfo` pass an unquoted `'^'` separator, but `RdoProtocol.format` quotes every separator unconditionally (`rdo.ts:373-376`), so the bytes are correct. Cosmetic only — not a wire defect.

### 8.4 Completion definition

A row is DONE when its nominal case and every listed adversarial variant have run with all declared oracles `PASS`, or a bug is filed and linked. The campaign is DONE when every **in-scope** row is DONE and the role/destruct/L2 exclusions are explicitly acknowledged (each excluded row names the reason and its L2-mock home).

---

## 9. Findings Lifecycle

- Every anomaly gets: a minimal repro (matrix id + params), the wire excerpt (`sid` + `rid` + frames), the server-log excerpt (file + line), a classification — **client bug / gateway bug / conformity divergence (our bytes vs Voyager's) / server-behavior-to-tolerate / server bug candidate** — and a severity.
- Filed in [BACKLOG.md](BACKLOG.md); fixes follow normal branch conventions (`fix/…`), each with L0/L1 regression tests per the coverage ratchet, and — where the finding is protocol-shaped — a mock scenario so L2 guards it forever (`npm run capture:convert` on the campaign's own NDJSON log makes this nearly free).
- Byte-exact live observations from campaign logs are **capture-grade evidence** (evidence hierarchy §0): protocol discoveries are promoted into [rdo-protocol-architecture.md](rdo-protocol-architecture.md)/[rdo-session-lifecycle.md](rdo-session-lifecycle.md) with dated notes, following the retired-claim pattern.

---

## 10. Developer Questions — blocking before the first live run

| # | Question | Why it blocks |
|---|---|---|
| Q1 | **Money:** what is `SPO_test3 - Green`'s current cash? Is there a way to refill (transfer, loan) if the campaign depletes it? Is testing the *broke* path acceptable? | Placement tests spend real in-world money; budget defines matrix depth |
| Q2 | **Safe-palette criteria (not a list — I can build the list myself):** the catalogue and its prices are only knowable by fetching `FacilityList.asp` live, so P0 will read the real prices and *propose* a palette. What I need from you is the rule: a per-building price ceiling, which clusters/kinds to avoid outright, and whether the 1×1 stores + a school + a small farm (the minimal set that unlocks most value rows — [matrix §5.2](../report/campaign/coverage-matrix.md)) are acceptable. | Bounds cost and simulation side effects without blocking on an enumeration nobody can produce offline |
| Q3 | **Where to build:** is there a designated test area on planitia (coords), or should the agent pick an empty zone far from inhabited areas and record it? | Persistent-world etiquette; reproducibility |
| Q4 | **Proximity rule:** minimum clearance from other players' facilities? | Avoid economic interference with real players |
| Q5 | **Cleanup policy & budgets:** demolish everything at session end, or leave a persistent test base? Per-session caps on placements/demolitions/value writes? | Defines §7 budgets and the registry lifecycle |
| Q6 | **Connection tests:** which facilities (ours to place, or existing ones you nominate) should supplier/client connection mutations target? | Needs counterparties; must not touch third parties |
| Q7 | **Pacing:** acceptable mutation rate and whether deliberate rapid double-actions (race tests) are allowed on live | Race provocation vs server courtesy |
| Q8 | **Logs:** do these logs cover all worlds or planitia only? Retention/rotation? Server timezone (to cross-check calibration)? Is there any construction or exception log not exposed under `/logs/`? | Correlation completeness |
| Q9 | **Authorization confirmation:** explicit OK that L3M mutations with `SPO_test3` supersede the E2E-STRATEGY §9 / SEC-N no-destructive rule, under §7 guardrails | The written policy currently forbids the campaign |
| Q10 | **Incident etiquette:** if a session correlates with server distress (TimeWarp, stall), what is the escalation path? Who restarts what? Preferred time windows for the riskiest items? | Shared-server safety |
| Q11 | **Roles for full coverage:** the WebClient implements road building (`CreateCircuitSeg`/`BreakCircuitAt`/`WipeCircuit`) and zoning (`DefineZone`), but `SPO_test3` has no mayor powers. Is a mayor-capable account (or a temporary role grant on planitia) available for the campaign, or do road/zone mutations stay L2-mock-only? Same question for president/minister mutations beyond Agriculture. | Determines whether the 100 % target includes the road/zone rows live or as declared exclusions |

---

*Skills used for this document: `rdo-conformity` (evidence rules), E2E procedure corpus (E2E-TESTING/STRATEGY), live log-format discovery (2026-08-14 sampling).*
