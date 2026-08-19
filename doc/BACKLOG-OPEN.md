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
2026-08-14**.

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
reads, `AccountStatus`, `Logon` — inside one gateway session.

- **Source:** journey P8, 2026-08-18, capture `service-public`, rids 1022/1023 then 1072/1073.

### ⚪ OB-14 · Roads are restricted to public-service roles on this server — with a code

The open question of P8 ("does road building depend on server rules?") is answered. **The same call,
the same coordinates, two identities, two outcomes:**

```
C 1225 sel <player> call CreateCircuitSeg "^" "#1","#287038816",…  → res="#22"   REFUSED
C 1254 sel <mayor>  call CreateCircuitSeg "^" "#1","#286415196",…  → res="#0"    ACCEPTED
C 1258 sel <mayor>  call BreakCircuitAt   "^" "#1","#286415196",…  → res="#0"
```

`res="#22"` is the permission refusal. On `planitia`, road building requires a public-service role.

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

## Found by code investigation

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
- **6 WS handlers alive but never emitted by the client:** `REQ_CHAT_GET_CHANNEL_INFO`,
  `REQ_CHAT_TYPING_STATUS`, `REQ_GET_ROAD_COST`, `REQ_MAIL_SAVE_DRAFT`, `REQ_MANAGE_CONSTRUCTION`,
  `REQ_MAIL_GET_UNREAD_COUNT`.
- **2 `REQ_` types declared with no server handler:** `REQ_SEARCH_MENU_PEOPLE`, `REQ_TRANSPORT_DATA`.
- **4 dead session methods** (no caller outside tests): `searchPeople`
  (`spo_session.ts:619`), `getBuildingDetails` (`:3022`), `getObjectRdoId` (`:1398`), `getMailAccount`
  (`:1120`).

Each is either a feature to finish or code to delete. **Decide per line, do not bulk-delete** — some
are features waiting for their UI.

- **Source:** parallel research of 2026-08-18 (6 axes + adversarial refutation).

### ⚪ OB-9 · `DAPort` / `DSArea` divergence, undocumented

The WebClient reads `DAPort` where Voyager uses `DSArea`. Confirmed on the wire
(`planitia-2026-08-17.ndjson` rid 1011, and again in the P5 capture).
Real divergence from Voyager, never written down. Arbitrate: fix the client, or document the
divergence.

- **Source:** parallel research of 2026-08-18, confirmed twice on the wire.

---

## Retired

Gaps in the ID sequence are deliberate — these entries were closed by deletion, not by fix:

- **OB-4, OB-5, OB-6** — defects in the conformance log tooling (`server-logs.ts`). Void: the
  tooling was deleted on 2026-08-19.
- **OB-15, OB-16** — the conformance gate and the HALT brake. Both were removed; see commits
  `e8d44490` and `3ee2990e`, then the wider purge of 2026-08-19.

The evidence those entries cited (live recordings, captured journeys, campaign reports) was
deleted with the apparatus. Where an entry above still names a capture or an `.ndjson`, treat it
as a historical provenance note, not as a file you can open.
