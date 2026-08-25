# Civic Roles — Mayor, President, Minister

> **Scope:** everything the three public offices control in the original Voyager client, and how far
> the WebClient reproduces it. Written as the reference for finishing the POLITICS feature.
>
> **Audience:** WebClient developers implementing the Town Hall and Capitol inspectors.
>
> **Sources:** `SPO-Original/Voyager/` (client sheets), `SPO-Original/Kernel/` and
> `SPO-Original/StdBlocks/` (server declarations), `SPO-Original/Model Extensions/` (ministry ids),
> `cache/BuildingClasses/classes.bin` (tab configs), and 34 legacy screenshots in
> `UI_Legacy_Screenshots/`. Every claim cites `File.pas:Line` or is marked `[INFERRED]` / `[UNKNOWN]`.
>
> **Not an RDO catalogue.** `src/shared/rdo-members.ts` is the single authority for member kind and
> arity. The Pascal declarations quoted here are provenance for the civic members only.
>
> **Tree state, 2026-08-20.** Written against `feature/Politics` at `b56fd00b` **plus ~2 900 lines of
> uncommitted POLITICS work** — a `politics` civic tab, `PoliticsSection`, `RatingsRail`,
> `CampaignPanel`, `RulerCard`, `NewspaperModal`, `newspaper-store`, three new catalogue entries and
> a much enlarged `politics-handler`. §7 states which capabilities that work already covers. The
> §1-§6 Voyager findings are independent of it.

## Related Documents

| Document | Covers |
|----------|--------|
| [facility-tabs-reference.md](facility-tabs-reference.md) | Tab configurations from CLASSES.BIN, handler registry |
| [voyager-inspector-architecture.md](voyager-inspector-architecture.md) | Container lifecycle, `xfer_*` binding, the permission model in full |
| [The kanban board](https://github.com/orgs/Crazz-Org/projects/1) | `OB-17` … `OB-27` — the open gaps this document identified (full text archived: [BACKLOG-OPEN @ 94b059a0](https://github.com/Crazz-Org/SPO-WebClient/blob/94b059a08caa5d834ce9e1fac6ac5f398b91943f/doc/BACKLOG-OPEN.md)) |

---

## 1. What each office actually controls

| Office | Powers | Seat of power |
|--------|--------|---------------|
| **Mayor** | Tax rate or subsidy per tax category; town minimum wage per population class | Town Hall |
| **President** | Appoint a mayor to a *vacant* seat; appoint / dismiss ministers; set ministry budgets; levy a tax on each town's mayor; set the *world* minimum wage floor | Capitol |
| **Minister** | **Nothing.** | — |

### 1.1 The Minister has no RDO power

`Kernel/Ministers.pas` declares **no RDO member at all**. A minister receives a budget the president
sets, and a rating computed from the service coverage in their remit
(`Kernel/Ministers.pas:119-138` for `TEconomyMinister`, `:152-155` for `TPublicMinister`,
`:160-163` for `THousingMinister` — which is hard-coded to 100). That rating feeds the president's.

The `MinistryHQ` building is an ordinary facility — its tabs are
`GENERAL / SUPPLIES / JOBS / MANAGEMENT` on the generic handlers, not a civic sheet.

**There is no minister screen to build.** A minister plays through the public facilities their budget
funds, using the normal inspector.

---

## 2. Civic tab configurations

Read from `cache/BuildingClasses/classes.bin` with `parseClassesBin`, and confirmed against the
screenshots. `classes.bin` uses a pooled string table — reading the raw bytes suggests the Capitol
inherits tabs from a parent class; it does not. Each class record carries all its own tabs.

**Capitol — class 152, 7 tabs**

| # | Tab name | Handler | Group id |
|---|----------|---------|----------|
| 0 | `GENERAL` | `capitolGeneral` | `capitolGeneral` |
| 1 | `MINISTERIES` *(sic)* | `Ministeries` | `ministeries` |
| 2 | `TOWNS` | `CapitolTowns` | `capitolTowns` |
| 3 | `SERVICES` | `townServices` | `townServices` |
| 4 | `JOBS` | `townJobs` | `townJobs` |
| 5 | `RESIDENTIALS` | `townRes` | `townRes` |
| 6 | `VOTES` | `Votes` | `votes` |

**Town Hall — classes 1500 / 2500 / 3500, 6 tabs**

| # | Tab name | Handler | Group id |
|---|----------|---------|----------|
| 0 | `GENERAL` | `townGeneral` | `townGeneral` |
| 1 | `COMMERCE` | `townServices` | `townServices` |
| 2 | `TAXES` | `townTaxes` | `townTaxes` |
| 3 | `JOBS` | `townJobs` | `townJobs` |
| 4 | `RESIDENTIALS` | `townRes` | `townRes` |
| 5 | `VOTES` | `Votes` | `votes` |

The Capitol shares `townJobs` with the Town Hall — **the president's minimum-wage sliders are real**
and bind to the world floor, not to a town. The tab caption is misspelled `MINISTERIES` on screen
while the grid header inside reads `Ministry`.

---

## 3. Server-side authority

### 3.1 Declarations

All are `published` on the block object. Kind and arity come from the declaration itself, never from
a call site.

| Member | Kind / arity | Object | Declared at |
|--------|--------------|--------|-------------|
| `RDOSetTaxValue` | procedure, 2 | `TTownHall` | `Kernel/Population.pas:166` |
| `RDOSetMinSalaryValue` | procedure, 2 | `TTownHall` | `Kernel/Population.pas:167` |
| `RDOSetMinSalaryValue` | procedure, 2 | `TPresidentialHall` | `Kernel/WorldPolitics.pas:265` |
| `RDOSetTownTaxes` | procedure, 2 | `TPresidentialHall` | `Kernel/WorldPolitics.pas:264` |
| `RDOSitMayor` | procedure, 2 | `TPresidentialHall` | `Kernel/WorldPolitics.pas:266` |
| `RDOSitMinister` | procedure, 2 | `TPresidentialHall` | `Kernel/WorldPolitics.pas:262` |
| `RDOBanMinister` | procedure, 1 | `TPresidentialHall` | `Kernel/WorldPolitics.pas:263` |
| `RDOSetMinistryBudget` | procedure, 2 | `TPresidentialHall` | `Kernel/WorldPolitics.pas:261` |
| `RDOVote` | procedure, 2 | `TPoliticalTownHall` | `Kernel/TownPolitics.pas:46` |
| `RDOVoteOf` | **function**, 1 | `TPoliticalTownHall` | `Kernel/TownPolitics.pas:47` |

⚠ **Name collisions.** `RDOSitMayor` and `RDOSitMinister` are each declared **twice**, on
`TPoliticalWorld` as well (`WorldPolitics.pas:220` and `:219`). The `TPoliticalWorld` overload of
`RDOSitMinister` takes `(widestring, widestring)` where the `TPresidentialHall` one takes
`(integer, widestring)` — same name, same arity, different signature. Neither `TPoliticalWorld`
overload performs any authenticity check. The client binds to the Capitol block, so it reaches the
`TPresidentialHall` versions; a catalogue keyed on name and arity alone cannot tell the two apart.

### 3.2 The five rules the server enforces

The server **refuses in silence** — every guard below is an `if` with no `else`, inside a
`try … except end`. Nothing comes back on the wire. The UI must prevent the gesture, not report a
failure.

**1. A president cannot unseat a mayor.**

```pascal
if (Mayor <> nil) and (Mayor.SuperRole = nil) and (Town <> nil) and (Mayor.Budget >= MinBudget)
```
`Kernel/WorldPolitics.pas:1801`. `Mayor` is the role tycoon `'Mayor of ' + TownName` (`:1800`);
`SuperRole = nil` means nobody holds it. `TTown.GetHasMayor` is
`(fMayor <> nil) and (fMayor.SuperRole <> nil)` (`Kernel/Kernel.pas:9267-9270`), and the seat state
reaches the client as `HasMayor<i>` (`WorldPolitics.pas:1385`). `MinBudget` is 10 000 000.
`RDOSitMayor` never calls `AbandomRoles`. A mayor leaves only by losing an election
(`Kernel/TownPolitics.pas:709-711`).

Additional conditions on the appointee: `Tycoon.Roles.Count = 0` and `TycoonIsAvailable(Tycoon)`.

**2. A minister is replaced in one call — but Voyager does not expose that.**

`RDOSitMinister` evicts the incumbent first: `Min.AbandomRoles; Tycoon.AssumeRole(Min);`
(`WorldPolitics.pas:1725-1726`). `CanBeMinister` (`:1700-1711`) rejects the president themself and
anyone already holding a ministry.

Voyager nevertheless splits it in two: `nbPages.PageIndex := 0` when `Minister<i> <> ''` (→ *Depose*)
and `1` when vacant (→ *Elect*), `Voyager/MinisteriesSheet.pas:334-338`. **Follow the reference
client**: Depose, then Elect.

**3. Subsidising is a toggle, not a negative rate.**

Voyager sends the literal string `'-10'` — never the slider value:

```pascal
if subsidize
  then MSProxy.RDOSetTaxValue(TaxId, '-10')
  else MSProxy.RDOSetTaxValue(TaxId, IntToStr(value));
```
`Voyager/TownTaxesSheet.pas:336-338`. Server-side `Subsidized` is just `fPercent < 0`
(`Kernel/BasicTaxes.pas:235-238`), and the collection branch **ignores the magnitude** — it refunds
the whole loss, so `-1 %` and `-900 %` behave identically (`Kernel/BasicTaxes.pas:197-210`).

**4. Minimum wage has two tiers, and the higher wins.**

```pascal
result := max( fMinSalaries[Kind], fWorldLocator.GetMinSalary( Kind ) );
```
`Kernel/Kernel.pas:9342-9345`. The mayor writes the town value (`Population.pas:1299`), the president
the world floor (`WorldPolitics.pas:1779`). `MayorMinSalary` exposes the town's own figure unblended
(`Kernel/Kernel.pas:9347-9350`).

**5. `TaxId` is an account id, not a row index.**

`Tax := Facility.Town.Taxes[IntToStr(TaxId)]` resolves against `MetaTax.Id`
(`Kernel/Population.pas:1256`, `Kernel/Kernel.pas:9330-9340`), and `MetaTax.Id` is the taxable
account's id (`Kernel/Accounts.pas:127`). The client reads it from the cache key `Tax<i>Id` and
echoes it back verbatim. The loop index is only a cache-key ordinal.

The gateway already does this correctly — it resolves `Tax{index}Id` before emitting
(`src/server/session/building-property-handler.ts:141-153`). **Do not "simplify" it to the row index.**

---

## 4. Encodings and enumerations

### 4.1 Values on the wire

| What | Wire form | Server does | Clamping |
|------|-----------|-------------|----------|
| Percent tax | integer percent as widestring | `fPercent := StrToInt(value)/100` (`BasicTaxes.pas:247-250`) | **none** — any integer accepted |
| Subsidy | the literal `'-10'` | same path, `fPercent` becomes `-0.10` | n/a |
| Fixed tax (`Kind=1`) | currency as widestring | `fPricePerUnit := StrToCurr(value)` (`BasicTaxes.pas:287-290`) | none |
| President's town levy | integer percent | `TX.TaxValue := Value/100` (`WorldPolitics.pas:1765`); collected only when `> 0` | none |
| Minimum wage | integer percent | town clamps to 255 (`Population.pas:1299`); world does **not** (`WorldPolitics.pas:1779`) | upper only, town |
| Ministry budget | currency as widestring | `StrToCurr`, guarded `value > 0` (`WorldPolitics.pas:1689`) | must be `> 0` |

Read-back keys: `Tax<i>Percent` is `round(100*Percent)` (`BasicTaxes.pas:220`), `TownTax<i>` is
`round(100*TX.TaxValue)` (`WorldPolitics.pas:1380`).

### 4.2 Tax kinds

`taxKind_Percent = 0`, `taxKind_ValuePerUnit = 1` (`Kernel/BasicTaxes.pas:9-10`), written to the
cache as `Tax<i>Kind` (`Kernel/Taxes.pas:116`).

**Every tax a stock world registers is `taxKind_Percent`** — `TMetaTaxToAccount.Create` hardcodes it
(`Kernel/BasicTaxes.pas:174`) and `StdTaxes` creates nothing else
(`StdBlocks/StdTaxes.pas:41-44`). No `TMetaFixedTax.Create` call site exists outside `BasicTaxes.pas`.
The currency editor is therefore **dead UI on shipped data** — implement it last, or not at all.

### 4.3 Tax categories are data, not an enumeration

`RegisterTaxesToAccounts` walks every registered `TMetaAccount` and creates one tax per account whose
`Taxable` is true (`StdBlocks/StdTaxes.pas:38-45`). The base model yields 46: `Residentials` = 2
(`Kernel/BasicAccounts.pas:22`) plus 45 from `StdBlocks/StdAccounts.pas` — `Farms` = 100,
`BusinessMachines` = 110, `CarIndustry` = 120, … `CDStore` = 520.

**Never hardcode the list.** Read `TaxCount` and `Tax<i>Id` from the cache.

### 4.4 Population and job classes

`TPeopleKind = (pkHigh, pkMiddle, pkLow)` — `Kernel/Kernel.pas:240`. Indices 0, 1, 2. Key prefixes
`('hi', 'mid', 'lo')` (`:246`). Job-class captions are *Executives / Professionals / Workers*
(`:248-249`, commented out in the shipped source). There is no fourth class.

### 4.5 Ministries

`Model Extensions/Standards.pas:7-14` — **eight, one-based, no zero**:

| Id | Ministry | Class |
|----|----------|-------|
| 1 | Health | `TPublicMinistry` |
| 2 | Education | `TPublicMinistry` |
| 3 | Defense | `TPublicMinistry` |
| 4 | Agriculture | `TEconomyMinistry` |
| 5 | Light Industry | `TEconomyMinistry` |
| 6 | Heavy Industry | `TEconomyMinistry` |
| 7 | Commerce | `TEconomyMinistry` |
| 8 | Housing | `TMinistry` |

`GetMinister` scans by `MinId`, not by position (`WorldPolitics.pas:576-586`), so **the row index is
not the ministry id**. The Capitol cache publishes the mapping as `MinistryId<i>` (`:1347-1359`), and
Voyager reads it (`MinisteriesSheet.pas:195`) before passing it as the argument (`:286`, `:293`).

---

## 5. Voyager's permission model for civic sheets

The mechanism is `GrantAccess`, a substring test over a per-facility list of authorised ids:

```pascal
function GrantAccess( RequesterId, SecurityId : TSecurityId ) : boolean;
  begin
    result := system.pos( SecIdItemSeparator + RequesterId + SecIdItemSeparator, SecurityId ) > 0;
  end;
```
`Protocol/Protocol.pas:428-431`. `RequesterId` comes from `ClientView.getSecurityId`, delivered in the
toolbar URL at company selection. `SecurityId` arrives with the facility's properties.

**The four civic sheets do not gate identically:**

| Sheet | Gate | Cite |
|-------|------|------|
| `TownTaxesSheet` | `SecurityId` **alone** | `:197` |
| `TownHallJobsSheet` | `ExtraSecurityId`, falling back to `SecurityId` | `:142-145` |
| `CapitolTownsSheet` | `GrantAccess(…)` **or** `ActualRuler = username` | `:113` |
| `MinisteriesSheet` | `GrantAccess(…)` **or** `ActualRuler = username` | `:115` |

The name comparison is a **secondary fallback present only on the two Capitol sheets**. On the
mayor's own editable sheets Voyager never compares names.

**Refusal is invisible, not disabled.** Voyager *hides* the control surface: `pnTax.Visible` on
CapitolTowns (`:135`), `pnBudgetEdit.Visible` on Ministeries (`:136`), `Notebook.PageIndex := 0` on
TownTaxes (`:512`). The legacy screenshots were captured by a player who was mayor but **not**
president — which is exactly why the Capitol's Towns tab shows no mayor column and no button there.

These flags are cosmetic. The real authorisation is `CheckOpAuthenticity`
(`Kernel/Kernel.pas:13117`), a thread-local session identity check resolved through
block → facility → company → owner.

---

## 6. Voyager UI, sheet by sheet

### 6.1 Town Hall › TAXES (`TownTaxesSheet.pas`)

A three-column `TListView` (`Name` / `Value` / `Last Year`) on the left; a `TNotebook` editor on the
right that is **empty until a row is selected**.

- Row badge encodes state: red `$` = taxed, green `$` = subsidised. A subsidised row's `Value` cell
  reads the literal word *Subsidized*, not a number (`:255-297`).
- **Page 1** (`Kind=0`): radios `Tax` / `Subsidize`, then a `TPercentEdit` bar 0–100 with the caption
  `Tax: NN%`. Choosing *Subsidize* **hides** the bar and its caption — it does not disable them
  (`:403-406`). One frame per release: `OnChange` fires on MouseUp only
  (`Components/PercentEdit.pas:357-362`).
- **Page 2** (`Kind=1`): a digits-only `TEdit` plus a *Set* button (`:416-440`). Dead on shipped data
  — see §4.2.
- Properties read per index: `Tax<i>Id`, `Tax<i>Name<lang>`, `Tax<i>Kind`, `Tax<i>Percent`,
  `Tax<i>LastYear` (`:218-231`).

### 6.2 Town Hall / Capitol › JOBS (`TownHallJobsSheet.pas`)

A plain 3 × 5 label matrix — *Vacancies, Private Vacancies, Average Wage, Spending Power*, then three
`TPercentEdit` bars scaled 0–200 with the value printed to the right. No confirm button; the bar's
`Tag` carries the `PopKind` (`:275`). Emission is fire-and-forget: `Proxy.WaitForAnswer := false`
(`:252`).

### 6.3 Capitol › TOWNS (`CapitolTownsSheet.pas`)

`lvTowns` columns: Name, Population, QOL, QOS, Wealth, Tax (`:118-124`). The `.dfm` captions the QOS
column **"Commerce"** — a legacy mislabel; the data behind it is `TownQOS<i>`.

`HasMayor<i>` drives the row **icon** (`ImageIndex` 0 / 1, `:126-128`), not a column.

Below the list, `pnTax` — visible only with access — holds the tax control, an `edMayor` **free-text
box**, and `btnElect`. There is **no candidate list**: the president types a username.
`btnElectClick` requires only a selected row and a non-empty box (`:353-356`), so Voyager lets you
click into the void on an occupied seat and the server ignores it.

### 6.4 Capitol › MINISTERIES (`MinisteriesSheet.pas`)

`lvMinisteries` columns: Ministry (localised), Minister (or the literal *no minister*), Rating,
Budget (money-formatted) — `:118-128`.

`pnBudgetEdit`, visible only with access, holds `edBudget` + `btnSetBudget`. Selecting a row
pre-fills `edBudget` from the row's formatted budget and enables both buttons (`:326-333`).
A separate `nbPages` notebook — **outside** `pnBudgetEdit` — switches between *Depose* and
`edMinister` + *Elect*. That is why the screenshots show Elect appearing for a non-president while no
budget widget does.

### 6.5 The Politics page (full-screen overlay)

Reached from a `Visit Politics Page` / `Visit President Politics Page` button on the GENERAL tab.
Four left-hand tabs: `POPULAR RATING`, `TYCOONS' RATINGS`, `IFEL's RATING`, `PUBLICITY`. The Capitol
page lists 23 rating axes, the Town Hall page 15 — the difference is the eight ministries.
The right half carries `The Opposition`, the candidate list and a `YOUR CAMPAIGN` panel.

`Rate the Mayor` opens the town newspaper (*"<Town> Herald"*): a column list plus a
Subject + body form with *Post Column* / *Reset Form*.

**Both buttons open a web page — none of this is RDO from the client.** `btnVisitPoliticsClick`
builds `<worldURL>/Visual/Voyager/Politics/politics.asp` and hands it to `HandleURL`
(`Voyager/TownHallSheet.pas:320-335`); `RateMayorClick` builds `Visual/News/boardreader.asp`
(`:337-352`). A third button, `ReadNews` (`:354-370`, declared at `:49`), opens `newsreader.asp` —
it does not appear in the General screenshot, so it is hidden or out of view in that state.
The ASP pages call the rating and publicity members server-side; the client never emits them.

`RDOSetRatingFrom` (procedure, 3 — `Kernel/TownPolitics.pas:40`), `RDOSetPublicity` (procedure, 2 —
`:41`) and `RDOSetProjectData` (procedure, 3 — `:45`) **are already in the working tree's catalogue**,
added ahead of their first call site with the Pascal declaration cited in place of a call site.
`RDOGetRatingFrom` (function, 2 — `:39`) and `RDOLaunchCampaign` (function, 1 — `:43`) are not.

⚠ `RDOSetRatingFrom`, `RDOSetPublicity`, `RDOSetProjectData` and `RDOCancelCampaign` carry **no
authorisation check whatsoever** server-side, and the ASP route carries the player's password in a
query string over plain HTTP (`politics-handler.ts` already does this for campaigns). Weigh that
before widening the proxy — see `production-security-policy.md`.

---

## 7. WebClient parity

Every civic member listed in §3.1 has a live argument builder in
`src/server/session/building-property-handler.ts` and a pinned frame test in its `.test.ts`.
As of 2026-08-20 the client side is complete too.

| Capability | State | Where |
|------------|-------|-------|
| Tax rate per category | done | `TaxesTab.tsx` |
| Subsidise a category | done | same — a mode sending the literal `'-10'`, never a negative rate |
| Town minimum wage | done | `JobsTab.tsx` |
| World minimum wage | done | same component; `isCapitol` labels which of the two floors it writes |
| Appoint a mayor | done | `TownsTab.tsx`, offered only on a vacant seat |
| Appoint / dismiss a minister | done | `MinistriesTab.tsx` |
| Ministry budget | done | currency, guarded `> 0` |
| President's town levy | done | `TownsTab.tsx` |
| Vote | done | response awaited; the toast says "sent", which is all a `procedure` can support |
| Ratings, campaign, publicity, newspaper | done | `PoliticsSection` / `RatingsRail` / `CampaignPanel` / `NewspaperModal` |
| Town services / commerce (read-only) | done | `ServicesTab.tsx` |
| Role gate scoped to the building | done | `grantAccess`, `src/shared/security-id.ts` |

There is a fifth civic tab, `politics`, because the modal has nowhere to open Voyager's second
window. `PoliticsSection.tsx` is also the first caller `onRequestPoliticsData` has ever had, which
closes the client half of `OB-8`.

### The gate, and the id it needs

`grantAccess(fTycoonProxyId, securityId)`, decided **by the gateway** and shipped as
`details.canGovern`. Three earlier attempts were wrong, each differently:

- `checkIsMayor` returned true whenever the town had *any* mayor — it never compared the ruler to
  the player, so every visitor was granted the town tab.
- `isPublicOfficeRole` was a session-wide label that handed a minister — who has no RDO power at
  all — the editable properties of every civic building in the world.
- `grantAccess(ctx.tycoonId, …)` used the **wrong id**. A live run settled it: the Town Hall's
  SecurityId is `-296197588--295583672--` while `tycoonId` is `37`. Both halves are **object
  pointers** — `integer(Tycoon)` — and `ctx.tycoonId` is the persistent `TTycoon.Id`, which never
  appears in a SecurityId. The requester half is the `InitClient` push's 4th argument, held as
  `ctx.fTycoonProxyId`, which is why the browser cannot compute this and the gateway must.

`building-property-handler.ts:534-548` documented this before the mistake was made.

### Verified live, 2026-08-20

Driven over WebSocket against `planitia` as `SPO_test3` (mayor of Helartia); the world was restored
to its starting values and the model-server log confirms it.

| Verified | Result |
|----------|--------|
| Town Hall tabs served | `townGeneral townServices townTaxes townJobs townRes votes` |
| `canGovern` on the Town Hall | **true** |
| `canGovern` on the Capitol | **false** — SPO_test3 is not president |
| `townTaxes` shape | 47 taxes, `Tax0Id=100` (Farms), `Tax0Name0` with no dot, `Tax0Kind='0'` |
| `RDOSetTaxValue` rate | lands — the read-back lags, see the cache note below |
| `RDOSetTaxValue` subsidy | literal `-10` lands and reads back **negative** |
| `RDOSetMinSalaryValue` | lands; `hiMinSalary` is the value written, `hiActualMinSalary` the world floor (0 here) |
| `capitolTowns` | 25 towns, 7 with a mayor, `HasMayor{i}` present |
| `ministeries` | 8 ministries, `MinistryId0=1` — **one-based, as `Standards.pas:7-14` says** |
| PoliticsData | mayor=SPO_test3, 15 rows on each ratings rail, publicity 15 rows |

Four defects are filed against the civic write path — read them before touching it: `OB-28` (a
write was reported confirmed when it was discarded — closed: the gateway now confirms only when the
re-read value is one the write would have produced, and answers `confirmed: undefined` rather than
guessing, `expectedWitnessValues` in `src/server/session/building-property-handler.ts`), `OB-29` (a
tax write lands but the cached copy the client reads is never invalidated — closed: the server-side
miss cannot be fixed from here, so it is recorded rather than worked around; `TaxesTab` says the
rate takes effect tomorrow instead of ticking a confirmation, and the poll decision below stands), `OB-30` (nobody can rate
their own term — closed, and the reference agrees) and `OB-31` (the ruler test needs two prongs, not
one — closed, see below).

**`OB-31`, and the sweep that closed it.** The two-pronged test lives in exactly one function,
`holdsOffice` (`src/server/session/politics-handler.ts`): the ruler's name against the active
identity, against the human login name, and against `"Mayor of " + Town.Name`
(`tycooncampaign.asp:98`, plus one prong of our own the ASP had no need of). The sweep asked where
else the codebase decides "am I the holder of this office?", and found one other site: the ratings
rail in the browser, which compared `ActualRuler` against the single login name the game store
keeps. That comparison gave the right answer, but by luck rather than by construction — the browser
holds only one of the two identities the reference test compares.

It no longer asks. `holdsOffice` is computed once per Politics read and shipped as
`PoliticsData.isRuler`; the rail consumes it. **Nothing else in `src/` may re-derive the answer** —
if a new civic control needs it, take it from the payload. Two neighbouring comparisons are *not*
this question and were left alone: `canGovern` (server-computed from `SecurityId`, a capability
rather than an identity) and `client-bridge.ts:838` ("is this role response about me?", which
matches the name the query was issued with).

⚠ `OB-29` **replaced an earlier entry that said a mayor's writes need the role company.** That was
wrong: `MasterRole` climbs to the role holder (`Kernel/Kernel.pas:10960-10965`), so
`Mayor of Helartia` and `SPO_test3` are the same `TTycoon` as far as `CheckOpAuthenticity` is
concerned. Do not re-derive the old conclusion from the same symptom.

**Cache latency — and why it is not just latency.** A tax write takes **30–90 s** to appear, and
that is not `BackgroundInvalidateCache` being asynchronous. `RDOSetTaxValue` invalidates
`Facility.Town` (`Kernel/Population.pas:1285`) while `Tax<i>Percent` is stored on the Town Hall
**facility** (`:1061`/`:1243`) — the invalidation misses the object entirely, and the value only
returns when the facility's own TTL lapses. That TTL is **two minutes**: `CreateTTL(0,0,2,0)` at
`:1192`, signature `CreateTTL(Days, Hours, Min, Sec)` (`Cache/CacheCommon.pas:66`), re-checked on
every `SetObject` (`Cache/CachedObjectWrap.pas:320`). It is also an opt-in — everything else
defaults to `NULLTTL` and re-pulls on every read (`Cache/CacheAgent.pas:90`).
`RDOSetMinSalaryValue` invalidates `Facility` (`:1300`) and does not have the problem. Any test that writes and immediately re-reads will see the old value and must
not conclude the write failed.

**The TTL is the Town Hall's, not the civic surface's.** `Cache.WriteString(ppTTL, …)` at
`Population.pas:1192` sits in `TTownHall`'s `StoreToCache`, and it is the only `CreateTTL` on a
facility in the whole `Kernel/` tree — the other one (`WorldPolitics.pas:2083`, fifteen minutes)
is on the *world* political object `world.five`, not on a facility. The **Capitol has no TTL** and
re-pulls on every read. So `isCivicBuilding` is the wrong axis for any cache reasoning: it groups
the Capitol with the Town Hall, and only the Town Hall is affected.

**Decision — the 30 s inspector poll stays 30 s, civic buildings included** (`OB-29`, closed on
this). Slowing the poll to the Town Hall's two-minute TTL would look like removing three useless
reads out of four, and it is the opposite. The poll clock and the TTL clock are independent: a poll
landing just before the TTL lapses would then wait a whole further interval, so the refreshed value
could sit unseen for up to two minutes. Polling faster than the TTL is what bounds that gap to one
interval. The repeated reads buy freshness; they are not waste. The constant carries the same note
(`src/client/components/building/BuildingInspector.tsx`) so it is not "optimised" later.

### Deliberate divergences

Two places where matching Voyager exactly would be worse, and the WebClient should not:

1. **Hide *Elect* on a town that already has a mayor.** Voyager lets the click through and the server
   ignores it (§3.2 rule 1). Hiding makes a server rule legible instead of silent.
2. **Show Commerce and QoS as separate columns** on the Capitol's Towns grid, rather than reproducing
   the legacy mislabel described in §6.3.

Both are recorded here so a later reader does not "fix" them back.

---

## 8. Open gaps

Filed as **`OB-17` … `OB-27`** — the survivors are issues on
[the kanban board](https://github.com/orgs/Crazz-Org/projects/1). Nine were fixed on
2026-08-20; the archived
[BACKLOG-OPEN @ 94b059a0](https://github.com/Crazz-Org/SPO-WebClient/blob/94b059a08caa5d834ce9e1fac6ac5f398b91943f/doc/BACKLOG-OPEN.md)
status table says what shipped against each.

What remains:

- **`OB-26`, in part.** The mock's `townTaxes` / `townServices` key divergences are fixed and pinned
  by tests, but no civic *mutation* is simulated — there is still no mock RDO exchange for
  `RDOSetTaxValue`, `RDOSitMayor` and the rest, and no HTTP mock for the Politics ASP pages.
- **A `SEC-L-1` violation outside this subsystem.** The Politics and Newspaper log sites are redacted
  by `src/server/url-redact.ts`; `auto-connection-handler.ts` builds eight URLs carrying
  `Password=` and logs two of them unredacted.
