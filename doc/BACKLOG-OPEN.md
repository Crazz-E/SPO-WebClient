# Open Backlog — defects and gaps awaiting work

Companion to [BACKLOG.md](BACKLOG.md), which is a history of **completed** work (26 `COMPLETED`,
1 `Deferred`) and has no place for an open defect. This file is the other half: **what is known to be
wrong or missing, and not yet fixed.**

**Feeding rule.** Every live journey capture and every investigation must land its findings here.
A finding that only lives in a session report is lost. Each entry carries **where it came from**, so
a reader can judge how solid it is.

Severity: 🔴 defect that changes behaviour · 🟠 latent trap, harmless today · 🟡 gap or missing tool ·
⚪ observation, no action decided.

---

## Found by live journeys

### 🔴 OB-1 · A failed connection read-back is reported to the UI as success

`RDOConnectInput` is a Delphi `procedure`: it answers an empty ack (`A<rid>`) and **cannot report
failure**. The gateway compensates correctly — it re-reads `cnxCount` through the cacher — and when
the read-back comes back empty it logs:

```
WARN [BuildingDetails] RDOConnectInput was issued but could not be confirmed
     — read-back of "cnxCount" came back empty
```

**And then answers `WS<< REQ_BUILDING_SET_PROPERTY OK` anyway.** The failure is detected and
swallowed; the user is told the connection was made.

- **Source:** journey P10, 2026-08-18, capture `parcours-enchaine`, rids 1154 and 1243
  (`%FreshFood` and `%ElabFood`, both out of range).
- **Frozen in:** `src/mock-server/scenarios/captured/parcours-enchaine-captured.scenario.ts`
- ⚠ **Fixing this will make the captured scenario diverge on replay** — the scenario freezes today's
  behaviour. Re-capture P10 after the fix.

### 🟡 OB-10 · Favourites are read-only in the WebClient — the server offers full CRUD

There is **no way to add, remove, rename or move a favourite**. Not a missing button: `grep` over the
whole of `src/` returns **zero** occurrences of `RDOFavoritesNewItem`, `addFavorite` or any
`REQ_FAVORITE*` message. No UI, no WS handler, no session method — only the read path
(`RDOFavoritesGetSubItems`, used by `fetchOwnedFacilities`) exists.

The Delphi server exposes the full set (`Kernel/Kernel.pas:2542-2546`):
`RDOFavoritesNewItem`, `RDOFavoritesDelItem`, `RDOFavoritesMoveItem`, `RDOFavoritesRenameItem`,
`RDOFavoritesGetSubItems`.

**Unimplemented feature, not a defect.** Four RDO members are reachable and unused.

- **Source:** journey P13, 2026-08-18 — the developer looked for the control and it is not there;
  confirmed by grep over `src/`.

### 🔴 OB-11 · No refresh after sending or deleting a mail

`onMailSend` and `onMailDelete` (`src/client/client.ts:381` and `:385`) send their request and stop.
Neither re-issues `REQ_MAIL_GET_FOLDER`, which only fires when the user opens or switches a folder
(`:375`). **The listing therefore never reflects the action**: the user has to close the panel and
reopen it.

Visible in the capture: a `REQ_MAIL_GET_FOLDER` does follow the delete — because the developer closed
and reopened the panel by hand, which is the workaround, not the behaviour.

Fix: re-issue `REQ_MAIL_GET_FOLDER` for the current folder once the server confirms the compose or
the delete.

- **Source:** journey P13, 2026-08-18, capture `communication`.

### ⚪ OB-12 · `SayThis` is proven safe on the wire, from our own client

Recorded because it closes a question that cost a shared server: 

```
C 1059 sel 30485932 call SayThis "*" "%","%Test Message for Claude."
```

Two arguments, **VoidId separator, with a QueryId** — the form `CLAUDE.md` documents as required for
a void member. The same member with `"^"` and two arguments **froze the shared Interface Server on
2026-08-14**. Our client's form is now frozen in a replayable scenario; no future session has to
re-derive it.

- **Source:** journey P13, 2026-08-18, capture `communication`, rid 1059.

### ⚪ OB-13 · A role switch re-logs into the world under the ROLE NAME, not the account

Undocumented until 2026-08-18, now captured. Selecting a role-bearing company makes the gateway tear
the session down and rebuild it — and the second world login carries **the role as the username**:

```
C 1022 call AccountStatus "^" "%SPO_test3",         "%[REDACTED]"
C 1023 call Logon         "^" "%SPO_test3",         "%[REDACTED]"
        … REQ_SWITCH_COMPANY …
C 1072 call AccountStatus "^" "%Mayor of Helartia", "%[REDACTED]"
C 1073 call Logon         "^" "%Mayor of Helartia", "%[REDACTED]"
```

**The nuance that matters:** the *directory* authentication (`RDOLogonUser`) stays `SPO_test3` both
times. Only the **world** session changes identity. Authentication is on the real account; the world
session runs as the role.

The switch replays the whole world-connection sequence — `idof InterfaceServer`, the ten property
reads, `AccountStatus`, `Logon` — inside one gateway session. The converter sees it as two distinct
ClientViews (`{{logonId}}` and `{{logonId2}}`).

- **Source:** journey P8, 2026-08-18, capture `service-public`, rids 1022/1023 then 1072/1073.
- **Worth documenting** in `doc/rdo-session-lifecycle.md`, which describes one login per session.

### ⚪ OB-14 · Roads are restricted to public-service roles on this server — with a code

The open question of P8 ("does road building depend on server rules?") is answered. **The same call,
the same coordinates, two identities, two outcomes:**

```
C 1225 sel <player> call CreateCircuitSeg "^" "#1","#287038816",…  → res="#22"   REFUSED
C 1254 sel <mayor>  call CreateCircuitSeg "^" "#1","#286415196",…  → res="#0"    ACCEPTED
C 1258 sel <mayor>  call BreakCircuitAt   "^" "#1","#286415196",…  → res="#0"
```

`res="#22"` is the permission refusal. On `planitia`, road building requires a public-service role.
The pair is frozen in one scenario, which makes it a ready-made regression test for the permission
contract.

- **Source:** journey P14, 2026-08-18, capture `derniers-membres`.

### ⚪ OB-2 · Two sockets for the two halves of one gesture

Demolishing goes out on the **`construction`** socket (`RDODelFacility`), rebuilding on the
**`world`** socket (`NewFacility`). Not a defect — recorded because it is surprising, and because a
test that assumes one socket for "building lifecycle" would be wrong.

- **Source:** journey P6, 2026-08-18, rids 1062 and 1077.

### ⚪ OB-3 · The building catalogue is not RDO

No `GetBuildingCategories` / `GetBuildingFacilities` frame reaches the wire: the catalogue is served
over HTTP/ASP (transport C). Only the **placement** is RDO. Reduces the RDO surface to certify.

- **Source:** journey P5, 2026-08-18, capture `construire`.

### ✅ Not defects — verified, closed on the spot

Three journey "impossibilities" turned out to be correct behaviour. Recorded so nobody re-opens them:

- **No Vote button.** `VotesTab.tsx:101` renders one button per candidate, and `:114` shows
  *"No candidates running for election"* when there are none. No open election → no candidates → no
  buttons, with an explicit message. Correct end to end.
- **Campaign launch refused, wrong period.** The server's error message is surfaced to the user.
- **Suppliers out of range.** World state, not code.

---

## Decided 2026-08-18 — dismantle the conformance gate

### ✅ OB-15 · RESOLVED — the gate apparatus is deleted

**Developer's requirement, restated plainly on 2026-08-18:**

> *"Whenever code that impacts RDO changes, run the tests and get a perfect score. On any incident,
> refuse the commit. That's all. I am not attached to the gate."* — and, later: *"I am the only
> developer"*, and *"what I need is to protect the push to GitHub against protocol regressions in the
> WebClient."*

**Delivered instead:** a native `pre-push` hook (`scripts/install-git-hooks.js`,
`npm run hooks:install`) that replays the last recording against its baseline before every push. No
state, no bookkeeping, fires whatever tool does the push, bypassable with `--no-verify` for a WIP
push — which for a solo developer is a feature.

The `PreToolUse` declaration was removed from `.claude/settings.json`.

**Deleted 2026-08-18**, in its own session as planned:

- `.claude/hooks/conformance-gate.sh`, `conformance-gate-check.js`, `rdo-surface.js`, `rdo-surface.json`
- `src/tools/conformance/rdo-surface.test.ts` (26 tests)
- In `run.ts`: `updateGate`, `GateEntry`, `Gate`, `GATE_FILE`, `isGate`, `readGate`/`writeGate` in
  `RunDeps` and in `defaultDeps`, and the `baselineDiffed` flag — 110 lines, and `TargetKind` with them
- The gate tests: 5 in `run.test.ts`, 3 in `run-deps.test.ts`
- `.conformance-gate.json`, its `.gitignore` entry, and the `.rdo-live/` rationale that cited the
  surface-mtime rule
- The **Git** section of `CLAUDE.md` and §11 of `doc/rdo-conformance-suite.md`, both rewritten around
  the native `pre-push` hook rather than simply removed — the rule in force still needs to be written down

Verified: typecheck clean; **6318 tests pass, 0 fail** — exactly 34 fewer, which is the count of the
tests removed and nothing else; coverage **58.53 %**, unchanged; and a replay run still exits 0 with
`baseline: no divergence` and not one `[gate]` line.

⚠ **Why the surface detection can go too:** it existed to avoid paying for a *live* run. The replay is
offline and costs ~40 s, so running it unconditionally is both simpler and stronger than deciding
whether it is needed.

⚠ **The live run leaves the commit path entirely.** It tests the *server*, not our code, so it belongs
before a deploy, not before a push. The developer was explicit: *"don't worry about the server side —
the goal is to protect against regressions in the WebClient code, not the server."*

- **Source:** session of 2026-08-18, closing discussion.

### ✅ OB-16 · RESOLVED — the HALT brake is unwired and deleted

**Developer's ruling, 2026-08-18:** *"Il n'y a plus de système HALT, c'est périmé comme concept."*

The automatic trigger had already been withdrawn earlier the same day, for four reasons kept in
`halt.ts` (blind under `DIRECTORY`/`FAST` timeouts, blind to transport B, fires after the damaging
frame has left, and would mostly stop on other people's incidents). What survived was a manual file
that nothing writes — a brake nobody pulls. Prevention now lives in the emission guard (separator +
arity + parameter types adjudicated per member) and detection in the `ISCnx` oracle and the pre-flight
liveness probe.

**Deleted 2026-08-18**, in the same session as OB-15:

- `src/tools/conformance/halt.ts` and `halt.test.ts` (22 tests: 10 `it` + 12 `it.each` cases)
- In `run.ts`: the `readExistingHalt` / `formatHaltNotice` / `defaultHaltStore` refusal path and
  `haltStore` in `RunDeps` and `defaultDeps`
- In `run.test.ts`: the `haltedStore` helper and 4 tests — the live refusal, the replay exemption,
  "a run never writes HALT" and "a stop still writes no HALT". The first two asserted a mechanism
  that no longer exists; the other two became vacuous. One replacement test keeps the single claim
  of theirs that still says something: a plain run fetches no server logs without `--server-logs`.
- The `.rdo-live/HALT` protocol in `doc/E2E-LIVE-CAMPAIGN.md` (rule R3 of the session script and
  abort condition 1, now the degradation counter) and rule R3 + §2 of `.rdo-live/README.md`

⚠ **The one thing that had to be kept, and OB-16 got wrong when it was written.** `HaltRecord`
served **two unrelated mechanisms** under one name: the brake, and the *stop attribution* produced
by `attributeSilence` / `attributeDegradation` and printed as `[silence]` / `[degraded]` — that is
guard R2.1, delivered the day before and very much alive. Deleting `HaltRecord` with the brake would
have removed the degradation detector. The type therefore **moved to `types.ts`**, minus `wave`
(a campaign field the attribution never set), with a comment stating which of the two meanings
survives. `SuiteReport.halt` keeps its name: it is what a reader looks for in an existing report,
and renaming it would change the shape of every `--report` file already written.

Verified: typecheck clean; **6293 tests pass, 0 fail** — 25 fewer, which is exactly 22 + 4 − 1 and
nothing else; coverage **58.49 %** (from 58.53); a replay run still exits 0 with
`baseline: no divergence`.

⚠ The `.rdo-live/` directory itself stays — it holds `inventory.ndjson`, `raw/` and `runs/`, which are
campaign evidence and unrelated to the brake.

- **Source:** developer instruction, 2026-08-18; same movement as OB-15.

---

## Found by code investigation

### 🟠 OB-4 · `ClientsRow.exitCode` is not an exit code, and fails runs on it

The 5th column of the `Clients` log is `fClientData.Values['CRC']` — the **CRC of the client
executable**, sent by Voyager through `SetClientData` (`ServerCnxHandler.pas:2998`), initialised to
the literal `CRC=0` (`InterfaceServer.pas:646`). `server-logs.ts:445` reads it as an exit code and
**fails the run when it is non-zero**.

Latent only because our gateway never calls `SetClientData`. The day it does, clean runs start
failing. Fix: rename to `clientCrc`, drop the failure rule, or replace it with the real test — is the
`(1)…(11)` `DoLogOff` trace complete?

- **Source:** `starpeace-server-logs` skill session, 2026-08-18.
- **Also mis-named in:** `doc/E2E-LIVE-CAMPAIGN.md` §2.2.

### 🟡 OB-5 · Timestamps are lost on the whole RDO error channel

`parseSurvival` returns `at: null` for every line produced by `DateTimeToStr` — that is, the entire
RDO error channel, **99 % of the 2026-08-18 incident file**. Nothing time-based can see the lines
that matter. A second regex accepting a leading `YYYY-MM-DD` is enough.

- **Source:** `starpeace-server-logs` skill session, 2026-08-18.

### 🟡 OB-6 · No density measurement, no restart detector in the log tooling

`fatalAnomalies` fires on the first occurrence. What separates "one bad frame" from "the dispatcher
is dead" is the **rate**, and whether the Model Server's own internal pushes are hit. And nothing
detects that the server restarted during a run — the markers exist (`GM Cannot connect`, the `DA<n>`
counter resetting) but nothing reads them.

There is also no parser for the `DoLogOff` `(1)…(11)` trace, which is the only internal evidence of
how far a logoff got.

- **Source:** `starpeace-server-logs` skill session, 2026-08-18.

### ✅ OB-7 · RESOLVED — `ObjectAt` is the resolver, proven on the wire

**Was:** `SwitchFocusEx` does not return an RDO object address (`sel <buildingId>` answers `error 2`),
leaving **56 inventory members unreachable**. Lead: `ObjectAt`.

**Resolved 2026-08-18 by journey P14.** `ObjectAt` takes plain coordinates and returns a real object
address, which the next call consumes directly:

```
C 1163 call ObjectAt          "^" "#785","#1000"             → res="#150333192"
C 1164 call ObjectAt          "^" "#886","#1018"             → res="#272345000"
C 1165 call ConnectFacilities "^" "#150333192","#272345000"  → res="%Connection to Mart 1…"
```

The returned ids are reusable: `#272345000` is the same address P13 used for `RDOStartUpgrades`.
**The 56 members are no longer blocked** — address a building with `ObjectAt(x, y)`, not with
`SwitchFocusEx`.

- **Source:** lot S4 (the problem), journey P14 (the answer), capture `derniers-membres`.

### 🟡 OB-8 · Client/server message wiring has dead ends

- `REQ_POLITICS_DATA` is wired server-side but **orphaned client-side** — no component calls
  `onRequestPoliticsData` (`client.ts:431`, `client-bridge.ts:213`).
- **7 WS handlers alive but never emitted by the client:** `REQ_CHAT_GET_CHANNEL_INFO`,
  `REQ_CHAT_TYPING_STATUS`, `REQ_GET_ROAD_COST`, `REQ_MAIL_SAVE_DRAFT`, `REQ_MANAGE_CONSTRUCTION`,
  `REQ_RDO_DIRECT`, `REQ_MAIL_GET_UNREAD_COUNT`.
- **2 `REQ_` types declared with no server handler:** `REQ_SEARCH_MENU_PEOPLE`, `REQ_TRANSPORT_DATA`.
- **4 dead session methods** (no caller outside tests and the conformance tool): `searchPeople`
  (`spo_session.ts:619`), `getBuildingDetails` (`:3022`), `getObjectRdoId` (`:1398`), `getMailAccount`
  (`:1120`).

Each is either a feature to finish or code to delete. **Decide per line, do not bulk-delete** — some
are features waiting for their UI.

- **Source:** parallel research of 2026-08-18 (6 axes + adversarial refutation).

### ⚪ OB-9 · `DAPort` / `DSArea` divergence, undocumented

The WebClient reads `DAPort` where `doc/rdo-protocol-architecture.md:667` documents `DSArea`.
Confirmed on the wire (`planitia-2026-08-17.ndjson` rid 1011, and again in the P5 capture).
Real divergence from Voyager, never written down. Arbitrate: fix the client, or document the
divergence.

- **Source:** parallel research of 2026-08-18, confirmed twice on the wire.
