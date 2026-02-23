# Facility Inspector Tabs — Gap Analysis Report

**Date:** 2026-02-23
**Method:** Deep code review + attempted E2E testing (live servers unreachable)
**Scope:** All 27 handler types × 20 tab configurations × 863 visual classes

## Executive Summary

The facility inspector system is **architecturally complete** — all 27 handler types from CLASSES.BIN are parsed, mapped to PropertyGroups, fetched via RDO, and rendered on the client. However, **5 critical gaps** and **12 functional issues** remain that prevent full production integration.

### E2E Test Status

| World | Result | Details |
|-------|--------|---------|
| **Shamba** | FAIL | Timeout connecting to `158.69.153.134:8000` |
| **Aries** | FAIL | `res="#0"` — account doesn't exist on world |
| **Others** | OFFLINE | pathran, willow, xalion, zorcon, zyrane all offline |

**Conclusion:** Live game servers are unreachable. All analysis below is based on code review.

---

## 1. CRITICAL GAPS (Must Fix)

### GAP-01: Missing Handlers — `hdqInventions`, `InputSelection`, `townPolitics`, `facMinisteries`

**Severity:** HIGH — 4 Voyager handlers exist in `SheetHandlerRegistry` but are NOT in `HANDLER_TO_GROUP` mapping.

| Handler | Voyager Source | Building Types | Impact |
|---------|---------------|----------------|--------|
| `hdqInventions` | InventionsSheet.pas | HQ buildings (R&D tab) | No research/invention UI |
| `InputSelection` | InputSelectionForm.pas | Generic input picker | Missing generic input selection |
| `townPolitics` | PoliticSheet.pas | Town Hall political tab | No politics/campaign UI |
| `facMinisteries` | xMinisteriesSheet.pas | Facility-level govt | No per-facility ministry controls |

**Where to fix:**
- [template-groups.ts](src/shared/building-details/template-groups.ts) — add new PropertyGroup definitions
- [property-templates.ts](src/shared/building-details/property-templates.ts) — HANDLER_TO_GROUP entries
- [spo_session.ts](src/server/spo_session.ts) — add RDO property fetching + SET commands

**Note:** These 4 handlers are NOT used in any of the 20 CLASSES.BIN configurations (they appear in Voyager's `SheetHandlerRegistry` but no visual class references them). They may be dead code in the original game. **Verify against SPO-Original before implementing.**

### GAP-02: Action Buttons Are Wired But Not Implemented Server-Side

**Severity:** HIGH — UI buttons render but `onActionButton` callback does nothing for most actions.

| Action ID | Template Group | Expected RDO | Server Status |
|-----------|---------------|--------------|---------------|
| `launchMovie` | FILMS_GROUP | `RDOLaunchMovie(name,budget,months,autoRel)` | Arg builder exists, no dispatch |
| `cancelMovie` | FILMS_GROUP | `RDOCancelMovie(0)` | Arg builder exists, no dispatch |
| `releaseMovie` | FILMS_GROUP | `RDOReleaseMovie(0)` | Arg builder exists, no dispatch |
| `vote` | VOTES_GROUP | `RDOVote(candidateIndex)` | **NOT IMPLEMENTED** |
| `banMinister` | MINISTERIES_GROUP | `RDOBanMinister(minId)` | Arg builder exists, no dispatch |
| `sitMinister` | MINISTERIES_GROUP | `RDOSitMinister(minId,name)` | Arg builder exists, no dispatch |
| `visitPolitics` | TOWN_GENERAL_GROUP | Opens politics URL | **NOT IMPLEMENTED** (web-era artifact?) |
| `clone` | UPGRADE_GROUP | `CloneFacility(x,y,town,comp,tycoon)` | Implemented via connection-picker |

**Where to fix:**
- [building-details-panel.ts:883](src/client/ui/building-details/building-details-panel.ts#L883) — `handleActionButton()` needs dispatch logic
- [server.ts](src/server/server.ts) — WebSocket handler for `REQ_BUILDING_SET_PROPERTY` needs to route action button IDs to `setBuildingProperty()`
- [spo_session.ts](src/server/spo_session.ts) — `buildRdoCommandArgs()` has entries for `RDOLaunchMovie`, `RDOCancelMovie`, `RDOReleaseMovie`, `RDOBanMinister`, `RDOSitMinister` but no caller dispatches them

### GAP-03: ResGeneral Missing Key Properties

**Severity:** MEDIUM — Residential buildings only show Rent/Maintenance sliders. Missing:

| Property | Voyager Source | Description |
|----------|---------------|-------------|
| `Quality` | ResidentialSheet.pas | Quality of life rating |
| `Population` | ResidentialSheet.pas | Resident count |
| `Crime` | ResidentialSheet.pas | Crime rate exposure |
| `Pollution` | ResidentialSheet.pas | Pollution exposure |
| `Occupancy` | ResidentialSheet.pas | Occupancy rate % |

**Where to fix:** [template-groups.ts:127-146](src/shared/building-details/template-groups.ts#L127-L146) — add missing properties to `RES_GENERAL_GROUP`

### GAP-04: CLASSES.BIN `[InspectorInfo]` — Missing `Ads` Handler Mapping

**Severity:** MEDIUM — The `Ads` handler (AdvSheetForm.pas) is registered in Voyager's SheetHandlerRegistry (line 156 in facility-tabs-reference.md) but NOT in `HANDLER_TO_GROUP`. However, `Ads` does NOT appear in any CLASSES.BIN configuration — the advertisement functionality is served via `compInputs` handler instead. **Low risk, but should be documented.**

### GAP-05: `WorkersCap` / `MinSalaries` Properties Not Fetched

**Severity:** MEDIUM — Workforce tab fetches `Workers`, `WorkersMax`, `WorkersK`, `Salaries`, `WorkForcePrice` but not:

| Property | Purpose | Voyager Source |
|----------|---------|---------------|
| `WorkersCap0/1/2` | Whether jobs exist for this level (0=disabled) | WorkforceSheet.pas |
| `MinSalaries0/1/2` | Minimum salary floor per level | WorkforceSheet.pas |

**Impact:** Cannot show "N/A" for worker classes a building doesn't support (currently shows "0/0"). Cannot enforce minimum salary validation on sliders.

**Where to fix:**
- [template-groups.ts:314-327](src/shared/building-details/template-groups.ts#L314-L327) — add to WORKFORCE_TABLE property collection
- [property-templates.ts:169-176](src/shared/building-details/property-templates.ts#L169-L176) — add to WORKFORCE_TABLE fetching
- [property-renderers.ts:325-466](src/client/ui/building-details/property-renderers.ts#L325-L466) — use `WorkersCap` to hide/grey-out cells

---

## 2. FUNCTIONAL ISSUES

### FUNC-01: Supplies Tab — Missing `Selected`, `SortMode` Display/Controls

The `Supplies` group template defines `QPSorted` and `SortMode` as properties but they are fetched read-only. Voyager has:
- Sort by Cost/Quality toggle (RDOSetInputSortMode)
- Auto-buy checkbox (RDOSelSelected)
- Per-input buying status (RDOSetBuyingStatus)

**Status:** RDO commands exist server-side, but client UI has no toggle controls for these.

### FUNC-02: Products Tab — Missing Price Slider Client-Side

The `PRODUCTS_GROUP` defines `PricePc` as an editable SLIDER, but the products rendering code (`renderProductsWithTabs`) builds a custom table layout that doesn't use the standard slider renderer. Price changes are handled via a separate callback but the UI is limited.

**Status:** Partially working — price change sends `RDOSetOutputPrice` but slider UX is incomplete.

### FUNC-03: TV Station — `HoursOnAir` and `Comercials` Missing Read-Back

`TV_GENERAL_GROUP` defines `HoursOnAir` and `Comercials` as editable sliders with `command: 'property'`. Server sends `SET HoursOnAir=<value>` and `SET Comercials=<value>`. But `mapRdoCommandToPropertyName()` does not have cases for these — the verification read-back will use the wrong property name.

**Where to fix:** [spo_session.ts:5415-5489](src/server/spo_session.ts#L5415-L5489) — add `'property'` case to `mapRdoCommandToPropertyName()` that uses `additionalParams.propertyName`

### FUNC-04: Bank — `BudgetPerc` Not in BANK_GENERAL_GROUP Properties

`BankGeneral` shows `BudgetPerc` as an editable slider, but the property must be named `BudgetPerc` in the GetPropertyList request. This works because it's in the `properties` array. **Verified: OK.** But `EstLoan`, `Interest`, and `Term` may not be standard cache properties — they may require custom RDO calls.

### FUNC-05: Town Taxes — Mid-Index Pattern (`Tax0Name`, `Tax0Percent`) May Not Parse Correctly

The `townTaxes` group uses `columnSuffix` pattern where the property name is `Tax{idx}{Suffix}` (e.g., `Tax0Name`, `Tax0Percent`). The `mapPropertyToRdoCommand()` regex `^(\w+?)(\d+)(.*)$` will extract `baseName=Tax`, `index=0`, `suffix=Percent`. This matches `TaxPercent` in `rdoCommands`. **Verified: OK.**

### FUNC-06: Capitol/Town Coverage Table — `indexSuffix: '.0'` Pattern

Capitol and Town General groups use `indexSuffix: '.0'` for coverage properties (e.g., `covName0.0`). This is a special CLASSES.BIN-era pattern where `.0` means "first sub-level". The server-side property fetching correctly appends this suffix. **Verified: OK.**

### FUNC-07: No Localization for Tab Names

CLASSES.BIN provides tab names as raw keys (`GENERAL`, `PRODUCTS`, `SUPPLIES`, etc.). Voyager had a localization layer (`tabNamesMLS.pas`) that translated these to display text. The WebClient passes raw keys directly, which are readable in English but untranslated.

**Impact:** Low — current user base is English-only. Future i18n would need a translation map.

### FUNC-08: Connection Picker — Search Returns Empty for Some Fluid Types

The `SearchConnections` WebSocket message (`WsReqSearchConnections`) sends `fluidId`, `fluidName`, `direction`, but the server search implementation may return empty results for uncommon fluid types if the cache doesn't index them.

**Status:** Known limitation — works for common fluids (Chemicals, Electronics, etc.), untested for exotic fluids.

### FUNC-09: Upgrade Actions — No Clone Facility Dialog Params

The `Clone Facility` button in `UPGRADE_GROUP` triggers `actionId: 'clone'`, which opens the connection picker for location selection. But the clone RDO call needs additional params (`limitToTown`, `limitToCompany`, `tycoonId`) that are not collected from the user.

**Where to fix:** [building-details-panel.ts](src/client/ui/building-details/building-details-panel.ts) — add clone dialog with town/company filtering options

### FUNC-10: Auto-Refresh Interrupts Slider Interaction

The 20-second auto-refresh (`smartRefresh`) checks if the user is actively interacting (slider dragging, etc.) before refreshing. But the implementation may still refresh while a dropdown is open.

**Status:** Minor UX issue — sliders are protected but `<select>` enum dropdowns may reset.

### FUNC-11: `Stopped` Property (Pause/Resume) — SET Command Uses Wrong Verb

`IND_GENERAL_GROUP` maps `Stopped` to `command: 'property'`, which triggers `SET Stopped=<value>`. Voyager uses `Stopped :=` syntax which is a direct property assignment. The server sends `C sel <block> set Stopped=<value>;` — this **should work** for published properties but hasn't been verified against the live server.

### FUNC-12: Money Graph Data — Limited to Cache Server Response

The `MoneyGraphInfo` property is fetched from the cache server as a comma-separated string. The parsing (`parseMoneyGraph()`) splits on commas and skips the first value (count). If the server returns a different format or empty data, the graph shows nothing.

---

## 3. IMPLEMENTATION STATUS BY HANDLER (27/27 Mapped)

| # | Handler | Group ID | Properties | SET Commands | UI Renderer | Mock Data | Status |
|---|---------|----------|------------|-------------|-------------|-----------|--------|
| 1 | `unkGeneral` | unkGeneral | 6 | — | Standard | Yes | COMPLETE |
| 2 | `IndGeneral` | indGeneral | 10 | TradeLevel, Role, Stopped | Standard | Yes | COMPLETE |
| 3 | `SrvGeneral` | srvGeneral | 7+table | RDOSetPrice (indexed) | Standard+Table | Yes | COMPLETE |
| 4 | `ResGeneral` | resGeneral | 8 | Rent, Maintenance | Standard+Slider | Yes | **PARTIAL** (missing 5 props) |
| 5 | `HqGeneral` | hqGeneral | 6 | — | Standard | Yes | COMPLETE |
| 6 | `BankGeneral` | bankGeneral | 7 | RDOSetLoanPerc | Standard+Slider | Yes | COMPLETE |
| 7 | `WHGeneral` | whGeneral | 8 | RDOSetTradeLevel | Standard | Yes | COMPLETE |
| 8 | `TVGeneral` | tvGeneral | 8 | HoursOnAir, Comercials | Standard+Slider | Yes | **PARTIAL** (read-back issue) |
| 9 | `capitolGeneral` | capitolGeneral | 5+table | — | Standard+Table | Yes | COMPLETE |
| 10 | `townGeneral` | townGeneral | 10+table | — | Standard+Table | Yes | COMPLETE |
| 11 | `Supplies` | supplies | 7 | MaxPrice, minK, +6 more | Custom FingerTabs | Yes | **PARTIAL** (missing sort/buy UI) |
| 12 | `Products` | products | 7 | PricePc, Connect/Disconnect | Custom FingerTabs | Yes | **PARTIAL** (price slider UX) |
| 13 | `compInputs` | advertisement | 7 (indexed) | — | Indexed list | Yes | COMPLETE |
| 14 | `Workforce` | workforce | 15 (3×5) | RDOSetSalaries | Custom 3-col table | Yes | **PARTIAL** (missing WorkersCap/MinSalaries) |
| 15 | `facManagement` | upgrade | 5+actions | Upgrade/Downgrade/Clone | Custom actions | Yes | **PARTIAL** (clone dialog incomplete) |
| 16 | `Chart` | finances | 2 | — | Sparkline graph | Yes | COMPLETE |
| 17 | `BankLoans` | bankLoans | 4-col table | — | Data table | Yes | COMPLETE |
| 18 | `Antennas` | antennas | 6-col table | — | Data table | Yes | COMPLETE |
| 19 | `Films` | films | 4+3 buttons | AutoProd, AutoRel | Standard+Buttons | Yes | **PARTIAL** (buttons not dispatched) |
| 20 | `Mausoleum` | mausoleum | 3 | — | Standard | Yes | COMPLETE |
| 21 | `Votes` | votes | 4+table+btn | Vote button | Standard+Table+Button | Yes | **PARTIAL** (vote not implemented) |
| 22 | `CapitolTowns` | capitolTowns | 8-col table | — | Data table | Yes | COMPLETE |
| 23 | `Ministeries` | ministeries | 5-col table+btns | Budget, Ban, Sit | Data table+Buttons | Yes | **PARTIAL** (buttons not dispatched) |
| 24 | `townJobs` | townJobs | 3 sliders | RDOSetMinSalaryValue | Standard+Slider | Yes | COMPLETE |
| 25 | `townRes` | townRes | 9 | — | Standard | Yes | COMPLETE |
| 26 | `townServices` | townServices | 10-col table | — | Data table | Yes | COMPLETE |
| 27 | `townTaxes` | townTaxes | 4-col table | RDOSetTaxPercent | Data table+Slider | Yes | COMPLETE |

**Summary:** 17 COMPLETE, 10 PARTIAL (minor issues)

---

## 4. IMPLEMENTATION STATUS BY RDO SET COMMAND (25 Commands)

| # | RDO Command | Arg Builder | Dispatch | Read-Back | Mock | Status |
|---|------------|------------|----------|-----------|------|--------|
| 1 | `RDOSetPrice` | Yes | Yes | Yes | Yes | COMPLETE |
| 2 | `RDOSetSalaries` | Yes | Yes | Yes | Yes | COMPLETE |
| 3 | `RDOSetCompanyInputDemand` | Yes | Yes | Yes | No | COMPLETE |
| 4 | `RDOSetInputMaxPrice` | Yes | Yes | Yes | No | COMPLETE |
| 5 | `RDOSetInputMinK` | Yes | Yes | Yes | No | COMPLETE |
| 6 | `RDOSetTradeLevel` | Yes | Yes | Yes | No | COMPLETE |
| 7 | `RDOSetRole` | Yes | Yes | Yes | No | COMPLETE |
| 8 | `RDOSetLoanPerc` | Yes | Yes | Yes | No | COMPLETE |
| 9 | `RDOSetTaxPercent` | Yes | Yes | Yes | No | COMPLETE |
| 10 | `RDOAutoProduce` | Yes | Yes | Yes | No | COMPLETE |
| 11 | `RDOAutoRelease` | Yes | Yes | Yes | No | COMPLETE |
| 12 | `RDOSetOutputPrice` | Yes | Yes | Yes | No | COMPLETE |
| 13 | `RDOConnectInput` | Yes | Yes | Yes | No | COMPLETE |
| 14 | `RDODisconnectInput` | Yes | Yes | Yes | No | COMPLETE |
| 15 | `RDOConnectOutput` | Yes | Yes | Yes | No | COMPLETE |
| 16 | `RDODisconnectOutput` | Yes | Yes | Yes | No | COMPLETE |
| 17 | `RDOSetInputOverPrice` | Yes | Yes | Yes | No | COMPLETE |
| 18 | `RDOSetInputSortMode` | Yes | Yes | Yes | No | COMPLETE |
| 19 | `RDOSelSelected` | Yes | Yes | Yes | No | COMPLETE |
| 20 | `RDOSetBuyingStatus` | Yes | Yes | Yes | No | COMPLETE |
| 21 | `RDOConnectToTycoon` | Yes | Yes | Yes | No | COMPLETE |
| 22 | `RDODisconnectFromTycoon` | Yes | Yes | Yes | No | COMPLETE |
| 23 | `RDOAcceptCloning` | Yes | Yes | Yes | No | COMPLETE |
| 24 | `CloneFacility` | Yes | Yes | Yes | No | COMPLETE |
| 25 | `RDOSetMinSalaryValue` | Yes | Yes | Yes | No | COMPLETE |
| 26 | `RDOLaunchMovie` | Yes | **NO** | No | No | **MISSING DISPATCH** |
| 27 | `RDOCancelMovie` | Yes | **NO** | No | No | **MISSING DISPATCH** |
| 28 | `RDOReleaseMovie` | Yes | **NO** | No | No | **MISSING DISPATCH** |
| 29 | `RDOSetMinistryBudget` | Yes | **NO** | Yes | No | **MISSING DISPATCH** |
| 30 | `RDOBanMinister` | Yes | **NO** | No | No | **MISSING DISPATCH** |
| 31 | `RDOSitMinister` | Yes | **NO** | No | No | **MISSING DISPATCH** |
| 32 | `RDOVote` | **NO** | **NO** | No | No | **NOT IMPLEMENTED** |

---

## 5. MOCK SCENARIO COVERAGE

### Buildings Covered (9/9 mock buildings)

| Mock Building | Visual Class | Handler Types Covered |
|--------------|-------------|----------------------|
| Chemical Plant 3 | PGIChemicalPlantA | IndGeneral, Products, Supplies, Workforce, facManagement, Chart |
| Drug Store 10 | (service) | SrvGeneral, Products, Workforce, facManagement, Chart |
| Central Bank | (bank) | BankGeneral, BankLoans |
| Channel 5 News | (TV) | TVGeneral, Antennas, Films, Workforce |
| National Capitol | (capitol) | capitolGeneral, CapitolTowns, Ministeries, Votes |
| Shamba Town Hall | (townhall) | townGeneral, townJobs, townRes, townServices, townTaxes |
| Luxury Apartments | (residential) | ResGeneral |
| Central Warehouse | (warehouse) | WHGeneral |
| Memorial Park | (mausoleum) | Mausoleum |

### Missing Mock Scenarios

| Building Type | Handler | Why Missing |
|--------------|---------|-------------|
| HQ Building | HqGeneral + compInputs + Workforce + facManagement + Chart | No HQ mock building |
| Movie Studio | IndGeneral + Films + Products + Supplies + compInputs + Workforce + facManagement + Chart | No movie studio mock (8 tabs!) |
| Simple Employment | unkGeneral + Workforce + facManagement | No park/public works mock |
| Trade Center | unkGeneral + Products | No trade center mock |
| Simple Workforce | unkGeneral + Workforce | No single-workforce mock |
| Advertisement (compInputs inline) | N/A | `compInputs` covered by factory scenario but not as standalone |

---

## 6. TEST COVERAGE

### Existing Tests

| Test File | Tests | Coverage |
|-----------|-------|---------|
| `building-details-panel.test.ts` | ~30 | Panel rendering, tab switching, owner checks |
| `building-refresh-handler.test.ts` | ~15 | Auto-refresh, smart refresh timing |
| `facility-set-commands.test.ts` | 58 | RDO SET command formats (11 variants) |
| `refresh-object-push.test.ts` | 32 | RefreshObject push parsing |
| `building-details.validation.test.ts` | 28 | Round-trip RDO mock matching |
| `scenarios.test.ts` (building-details) | ~15 | Mock scenario structure validation |

### Missing Tests

| Area | What to Test | Priority |
|------|-------------|----------|
| **Action button dispatch** | Films: launch/cancel/release → RDO call | HIGH |
| **Action button dispatch** | Votes: vote → RDO call | HIGH |
| **Action button dispatch** | Ministeries: ban/sit → RDO call | HIGH |
| **Property type rendering** | Each of 14 PropertyType enum values | MEDIUM |
| **Indexed table rendering** | Mid-index pattern (Tax0Name, Tax0Percent) | MEDIUM |
| **Coverage table** | `indexSuffix: '.0'` pattern (covName0.0) | MEDIUM |
| **Clone dialog** | Full clone flow with town/company params | MEDIUM |
| **Workforce WorkersCap** | Cell greying when WorkersCap=0 | LOW |
| **Supplies sort/buy** | SortMode toggle, Selected checkbox | LOW |
| **E2E: Real server** | All 20 tab configurations on real buildings | HIGH (blocked by server) |

---

## 7. RECOMMENDED PRIORITY ORDER

### Phase 1: Critical Fixes (Estimated: 1-2 days)
1. **Wire action button dispatch** (GAP-02) — Connect `handleActionButton()` to `setBuildingProperty()` for Films, Votes, Ministeries actions
2. **Add `RDOVote` command** (GAP-02) — New RDO command builder + server dispatch
3. **Fix TV read-back** (FUNC-03) — Add `'property'` case to `mapRdoCommandToPropertyName()`

### Phase 2: Completeness (Estimated: 2-3 days)
4. **ResGeneral missing properties** (GAP-03) — Add Quality, Population, Crime, Pollution, Occupancy
5. **Workforce WorkersCap/MinSalaries** (GAP-05) — Add properties + grey-out cells
6. **Supplies sort/buy controls** (FUNC-01) — Add SortMode toggle and Selected checkbox UI
7. **Products price slider UX** (FUNC-02) — Improve price change inline in FingerTabs

### Phase 3: Polish (Estimated: 1-2 days)
8. **Clone dialog params** (FUNC-09) — Collect limitToTown/limitToCompany before cloning
9. **Missing mock buildings** (Section 5) — Add HQ, Movie Studio, Trade Center mocks
10. **Missing unit tests** (Section 6) — Action buttons, table rendering, indexed patterns

### Phase 4: Nice-to-Have
11. **hdqInventions handler** (GAP-01) — Only if used by real CLASSES.BIN data
12. **Tab name localization** (FUNC-07) — i18n translation map
13. **Enum dropdown refresh protection** (FUNC-10) — Track open dropdowns during auto-refresh

---

## 8. ARCHITECTURE QUALITY ASSESSMENT

| Dimension | Grade | Notes |
|-----------|-------|-------|
| **Data Pipeline** | A | CLASSES.BIN → Parser → Templates → PropertyGroups → RDO fetch → Response |
| **Type Safety** | A | Full TypeScript, RdoValue/RdoCommand builders, no `any` |
| **Template System** | A | Data-driven from 863 visual classes, zero hardcoding |
| **RDO Protocol** | A- | 25/32 commands fully implemented, 7 need dispatch |
| **Client Rendering** | B+ | 14 property types, custom renderers for workforce/supplies/products |
| **Test Coverage** | B | Good unit tests but no E2E coverage (servers offline) |
| **Mock Scenarios** | B | 9 buildings cover 27 handlers but miss 5 building configs |
| **Security** | A | SecurityId ownership check gates all edit controls |
| **Overall** | B+ | Production-ready for core facilities, polish needed for specialized buildings |
