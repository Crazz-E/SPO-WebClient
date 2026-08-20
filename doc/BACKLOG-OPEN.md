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

## Found by the civic-roles audit (2026-08-20)

Full reference: [civic-roles-reference.md](civic-roles-reference.md). Source for every entry below:
the Voyager sheets, the Kernel declarations, `classes.bin`, and 34 legacy screenshots — read
statically, **no live server was probed**.

**Status, 2026-08-20 — nine of eleven fixed.** The entries below keep their original diagnosis; this
is what shipped against each.

| Entry | Fix |
|-------|-----|
| `OB-17` | `grantAccess` in `src/shared/security-id.ts`, the requester id being the player's own tycoon id (`ServerCnxHandler.pas:2524-2527`), threaded to every civic control as `canGovern`. `checkIsMayor` deleted — it never compared the ruler to the player. |
| `OB-18` | `TaxesTab` and `ServicesTab`; `townTaxes` and `townServices` routed in `CivicTabConfig`. The dead `politics` tab, declared with no `case` in `CivicTabContent`, is routed too. |
| `OB-19` | Subsidy is a mode sending the literal `'-10'`, not a negative rate; template bounds `0..100`. |
| `OB-20` | Read-back is `${prefix}MinSalary`, the facility's own floor, not the blended `ActualMinSalary`. |
| `OB-21` | `value > 0` guard, currency parse instead of `parseInt`, fresh server figure wins over abandoned input. |
| `OB-22` | *Elect* hidden on an occupied seat. Deliberate divergence — see `civic-roles-reference.md` §7. |
| `OB-23` | `modalBeneath` in `ui-store`: a prompt stacks over the inspector and returns to it. |
| `OB-24` | Sliders commit on pointer-up, key-up and blur, and re-sync when the server sends a new value. |
| `OB-25` | The vote awaits its response; the toast says "Vote sent", since `RDOVote` answers nothing. |

Still open: **`OB-26`** in part — the mock's `townTaxes` / `townServices` key divergences are fixed
and pinned by tests, but no civic *mutation* is simulated. **`OB-27`** needs no action of its own; the
privilege leak it named was the `PropertyGroup` half of `OB-17`.

Also fixed alongside, and worth its own note: every Politics and Newspaper ASP log site printed the
full URL, password included, against `SEC-L-1`. `src/server/url-redact.ts` now redacts them.
**The same defect remains in `auto-connection-handler.ts` (8 URL builders, 2 log sites), which was
outside this lot's scope.**

**Scope note.** The audit ran against `b56fd00b` plus ~2 900 lines of *uncommitted* POLITICS work
(the `politics` tab, `PoliticsSection`, `RatingsRail`, `CampaignPanel`, `NewspaperModal`, three new
catalogue entries, an enlarged `politics-handler`). The first pass under-read that work and wrongly
reported the ratings, campaign and newspaper as missing; **the eleven entries below were then
re-verified one by one against the working tree and all eleven still hold.** Nothing here duplicates
what the in-progress work already covers. Note that it also closes the client half of `OB-8`:
`PoliticsSection.tsx:41` is the first caller `onRequestPoliticsData` has ever had.

### ✅ OB-17 · RESOLVED — the role gate is a global label is a global label — a mayor can edit any town hall

`isPresidentRole` / `isMayorRole` are substring tests over one global string
(`src/client/components/politics/capitol-utils.ts:27-36`), and that string carries no building
identity: `RESP_TYCOON_ROLE` collapses the role to the bare labels `'President' | 'Mayor' |
'Minister' | ''` (`src/client/bridge/client-bridge.ts:773-778`). Scoping is therefore not merely
omitted — it is **impossible with that value**.

Consequences: the mayor of town A gets `canEdit = true` on town B's Town Hall (`JobsTab.tsx:34`);
a president edits any Capitol; and a *minister* — `isPublicOfficeRole` is true for them — unlocks
property editing on every civic building via `PropertyGroup.tsx:66`. Two more: `isCapitalMayor` is
folded into "president" (`client-bridge.ts:772`), and the `isPresident ? … : isMayor ? …` cascade
labels a mayor-and-minister as `'Mayor'`.

Voyager's real gate is `GrantAccess(RequesterId, SecurityId)` — a substring test over a per-facility
id list (`Protocol/Protocol.pas:428-431`). The `ActualRuler = username` comparison is only a
**fallback, and only on the two Capitol sheets** (`CapitolTownsSheet.pas:113`,
`MinisteriesSheet.pas:115`); `TownTaxesSheet.pas:197` and `TownHallJobsSheet.pas:142-145` use the
SecurityId alone.

Both halves of `GrantAccess` are currently unavailable to us. The facility's `SecurityId` is read by
the gateway and typed in the response (`building-details-handler.ts:313`, `domain-types.ts:633`) but
**no client code reads it** — the only mention excludes it from rendering (`PropertyGroup.tsx:541`).
The *player's* SecurityId is never captured at all: it arrives in the toolbar URL at company
selection (visible in `select-company-scenario.ts:46`) and `fetchWorldProperties`
(`login-handler.ts:721-724`) reads ten properties, none of them it.

Two routes. **(a)** Compare names — works as-is at the Capitol, where `ActualRuler` is already read
into an unused local (`TownsTab.tsx:25`, `MinistriesTab.tsx:26`); for the Town Hall it must be
lifted from `townGeneral` (`template-groups.ts:367`) to the inspector, because neither `townJobs`
nor `townTaxes` declares it. **(b)** Capture the SecurityId at login — the only gate that reproduces
the server rule exactly, but it touches the connection sequence.

**Blocks the correctness of every other civic control. Take it first.**

### ✅ OB-18 · RESOLVED — two civic tabs are served to the browser and silently dropped

`fetchPropertiesAndGroups` collects every template group at once, so the browser receives
`townTaxes` and `townServices` in `details.groups`. `GROUP_TO_CIVIC_TAB` (`CivicTabConfig.ts:20-27`)
maps neither, and `CivicTabContent` never reads them (`BuildingInspector.tsx:434-476`). The data is
fetched and discarded.

`townTaxes` is **the mayor's primary power** — set a tax rate or a subsidy per category. Everything
else for it already exists: the group with its editable column (`template-groups.ts:914-938`), the
gateway arg builder and the `Tax{index}Id` resolution (`building-property-handler.ts:424-430`,
`:141-153`), and pinned frame tests. Only the tab route is missing.

`townServices` is read-only (Town Hall `COMMERCE`, Capitol `SERVICES`).

### ✅ OB-19 · RESOLVED — subsidising is modelled as a negative percentage; Voyager sends a literal `'-10'`

`TOWN_TAXES_GROUP` declares the rate as a slider `min: -100, max: 100`
(`template-groups.ts:933`). That encodes a mechanic that does not exist. Voyager offers a
`Tax` / `Subsidize` radio pair and, when subsidising, sends the constant string `'-10'` while
**hiding** the percentage bar entirely (`Voyager/TownTaxesSheet.pas:336-338`, `:403-406`).

Server-side the magnitude is ignored: the subsidy branch refunds the whole loss, so `-1 %` and
`-900 %` are identical (`Kernel/BasicTaxes.pas:197-210`). Fix the bounds to `0..100` and make
subsidy a separate action.

### ✅ OB-20 · RESOLVED — minimum-wage confirmation reads the world floor, not the town value

After `RDOSetMinSalaryValue` the gateway re-reads `${prefix}ActualMinSalary`
(`building-property-handler.ts:849-852`). Per `TownHallJobsSheet.pas:149-151` that is the **world**
floor; the town's own figure is `${prefix}MinSalary`, which is what `JobsTab.tsx:45,54,63` correctly
displays. Because the effective wage is `max(town, world)` (`Kernel/Kernel.pas:9342-9345`), any mayor
on a world with a higher floor sees a correct write reported as unconfirmed.

### ✅ OB-21 · RESOLVED — ministry budget: three divergences in one control

`MinistriesTab.tsx:138-144`:

1. The server requires `value > 0` (`WorldPolitics.pas:1689`); we have no guard, so a `0` is sent and
   silently dropped.
2. It is a **currency** (`StrToCurr`), not an integer — we `parseInt` and render without separators.
   Voyager uses `FormattedStrToMoney` and pre-fills the field from the row
   (`MinisteriesSheet.pas:326-333`).
3. Read-back asks for `MinisterBudget{ministryId}` (`building-property-handler.ts:860-865`) while the
   cache indexes by **row index** (`template-groups.ts:755,758`). `GetMinister` scans by `MinId`, not
   position (`WorldPolitics.pas:576-586`), so the two differ in general — the write lands, the
   confirmation reports failure. `RDOSetTaxValue` does not have this bug; its read-back uses
   `params.index`.

### ✅ OB-22 · RESOLVED — *Elect* is offered on towns that already have a mayor

`TownsTab.tsx:87-96` renders the button on every row. The server only fills a **vacant** seat —
`Mayor.SuperRole = nil` (`WorldPolitics.pas:1801`) — and refuses in silence. `HasMayor<i>` is already
in the row data.

Voyager also lets the click through (`CapitolTownsSheet.pas:353-356`), so hiding the button is a
**deliberate divergence**: it makes an invisible server rule legible. Recorded in
`civic-roles-reference.md` §7 so it is not "fixed" back.

### ✅ OB-23 · RESOLVED — the appoint prompt destroys the inspector it was launched from

`ui-store.ts:140-151` holds a single `modal` value, so `requestPrompt`
(`building-action-handler.ts:817`, `:846`) overwrites `modal: 'buildingInspector'` and
`BuildingInspectorModal.tsx:65` unmounts. `openModal('buildingInspector')` also nulls the right
panel, so after `closeModal()` the user has no inspector at all. Appointing three ministers means
three round trips through the map.

### ✅ OB-24 · RESOLVED — civic sliders lose keyboard edits and go stale

Both `TownsTab.tsx:135-144` and `JobsTab.tsx:135-145` commit on `onPointerUp` only — arrow-key
changes never emit, and a touch-cancel loses the edit. Both also hold `useState(initialValue)`
(`TownsTab.tsx:119`, `JobsTab.tsx:123`) that never re-syncs, so the 30 s auto-refresh
(`BuildingInspector.tsx:136-170`) leaves a stale value on screen.

### ✅ OB-25 · RESOLVED — a rejected vote is reported to the user as a success

`building-action-handler.ts:901` shows `Voted for X` unconditionally, and `RESP_POLITICS_VOTE`
appears in no `case` of `event-handler.ts` (only `RESP_POLITICS_DATA`, the campaign responses and
`RESP_TYCOON_ROLE` are handled, `:330-339`). Server-side `RDOVote` requires local tax residency and
refuses silently (`Kernel/TownPolitics.pas:405`). Same family as `OB-1`.

### 🟡 OB-26 · No civic mutation in the mock, and mock/template key divergences

`building-details-scenario.ts` serves the civic groups read-only; there is **no** exchange for any of
`RDOSitMayor`, `RDOSitMinister`, `RDOBanMinister`, `RDOSetMinistryBudget`, `RDOSetTownTaxes`,
`RDOSetTaxValue`, `RDOSetMinSalaryValue`, `RDOVote`, and no HTTP mock for the Politics ASP pages.

Three key divergences nothing asserts: the mock emits `Tax0Name.0` where the template generates
`Tax0Name0` (`:560` vs `template-groups.ts:931`); the mock has no `Tax{i}Id` although the gateway
resolves it; and `MOCK_TOWN_HALL`'s `townServices` group is filled with `prd*` keys belonging to
`TOWN_PRODUCTS_GROUP` instead of the `GQOS` / `srvCount` / `svr*` keys its template declares.

### ⚪ OB-27 · The Minister role has no RDO power — there is nothing to build

`Kernel/Ministers.pas` declares **no RDO member at all**. A minister receives a budget the president
sets and a rating computed from service coverage (`:119-163`), which feeds the president's. The
`MinistryHQ` building runs the generic handlers (`GENERAL / SUPPLIES / JOBS / MANAGEMENT`), not a
civic sheet.

Recorded so the question is not reopened. The only action it implies is the privilege leak in
`OB-17`.

---

## Found by the live POLITICS run (2026-08-20)

Driven over WebSocket against `planitia` as `SPO_test3`, no browser (Playwright MCP
was unavailable). Every mutation was recorded, replayed and restored; the model-server
Survival log confirms the town was left with `Tax0=12` and `MinSalary[hi]=200`, its
starting values.

### 🔴 OB-28 · `confirmed` means "the property is readable", not "the write landed"

`building-property-handler.ts:307`:

```ts
const confirmed = readBack !== undefined && readBack !== '';
```

A write the server discarded reports `confirmed: true` as long as the property exists.
Observed live: `RDOSetTaxValue` with `-10` answered `success=true confirmed=true` while
`Tax0Percent` stayed at `12` — and stayed there for a further 60 s of polling.

Two things compound it:

1. **The model-server cache takes 30–90 s to reflect a civic write.** Measured three
   times: ~30 s, ~48 s, and once beyond 90 s. An immediate read-back is therefore
   *structurally* incapable of confirming one of these members — it will always read the
   pre-write value, and always call that confirmation.
2. `RDOSetTaxValue` is a `procedure`. It answers nothing, so the read-back is the only
   signal there is.

Same family as `OB-1`. The honest options are to report `confirmed: undefined` for
members whose cache refresh is asynchronous, or to compare the read-back against the
value that was sent instead of against the empty string.

- **Source:** live run 2026-08-20; gateway log `[BuildingDetails] Property RDOSetTaxValue
  confirmed at 12` while the sent value was `-10`.

### 🔴 OB-29 · A mayor's writes are refused unless the session operates as the ROLE company

`SPO_test3` holds two relevant companies: `SPO_test3 - Green` (ordinary) and `Helartia`,
whose `ownerRole` is `Mayor of Helartia`. The Town Hall is owned by the mayor role.

- Session on **`SPO_test3 - Green`** → the model server logs the call
  (`Setting Tax value: Helartia, 100, 37`) and the cached value never changes.
- Session on **`Helartia`** → the same call lands and the cache refreshes.

`Facility.CheckOpAuthenticity` is the discriminator (`Kernel/Kernel.pas:13117`), and
`OB-13` already recorded that selecting a role company re-logs the world session under
the role name.

**What makes this a UI defect rather than a server rule:** the civic controls are shown
in both cases, because `canGovern` is decided by `grantAccess` over the facility's
SecurityId — and that list contains the human's own tycoon address as well as the role's
(`-296197588--295583672--`), so it grants either session. Voyager behaves identically. On
an ordinary company the mayor therefore gets editable sliders that do nothing and say
nothing.

Note the asymmetry in `TTownHall.RDOSetTaxValue` (`Kernel/Population.pas:1250-1288`):
`Tax.ParseValue` runs **outside** the authenticity guard while
`ModelServerCache.BackgroundInvalidateCache` runs **inside** it. So on a non-role session
the model may well change while the cache is never told — which is exactly the shape of
what was observed. `RDOSetMinSalaryValue` (`:1292-1305`) guards its whole body and has no
such split.

Decide between: gate `canGovern` on the session's current company matching the facility
owner (diverges from Voyager, kills the dead control), or keep parity and surface a hint
telling the mayor to switch to their role company. **This is a design call and was left
for the developer.**

- **Source:** live run 2026-08-20, both companies exercised against the same Town Hall;
  model-server `Survival 26-08-20.log`.

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
