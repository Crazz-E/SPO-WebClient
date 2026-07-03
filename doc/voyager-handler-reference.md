# Voyager Sheet Handler Reference — Per-Handler RDO Commands

> **Purpose:** Lookup table for all 33 facility sheet handlers. For each handler: properties read, RDO write commands, BindTo targets, permission variant, enabled conditions, and embedded URLs.
>
> **Optimized for:** AI agent consumption during WebClient implementation.
>
> **Companion doc:** [voyager-inspector-architecture.md](voyager-inspector-architecture.md) explains how these handlers work.

## Related Documents

| Document | Covers |
|----------|--------|
| [voyager-inspector-architecture.md](voyager-inspector-architecture.md) | Container lifecycle, data binding, threading, permission model |
| [facility-tabs-reference.md](facility-tabs-reference.md) | Tab configs from CLASSES.BIN, handler→PropertyGroup mapping |
| [building_details_protocol.md](building_details_protocol.md) | Wire protocol: GetPropertyList, GetInputNames, SetPath |
| [spo-original-reference.md](spo-original-reference.md) | RDO server method signatures, dispatch rules |

## Reading Guide

### Entry Format

Each handler entry has:
- **Handler Name** — as registered in `SheetHandlerRegistry` (case as registered, uppercased for lookup)
- **Source** — Delphi `.pas` file in `SPO-Original/Voyager/`
- **Permission** — one of 6 variants (see [architecture doc §5](voyager-inspector-architecture.md#5-permission--authorization-model))
- **WebClient Group** — corresponding `PropertyGroup` ID in `template-groups.ts`
- **Properties Read** — fetched via `GetPropertyList` from cache
- **RDO Write Commands** — methods called via MS Proxy
- **Enabled Conditions** — what controls are gated and by what
- **URLs** — embedded HTML/ASP URLs (if any)

### Notation

- `{i}` = zero-based index suffix (e.g., `Workers0`, `Workers1`)
- `{lang}` = active language code (usually `'0'`)
- `BindTo(X)` = `MSProxy.BindTo(X)` before calling the method
- `WFA` = `WaitForAnswer` (true = synchronous, false = fire-and-forget)

---

## General Tab Handlers

### unkGeneral

**Source:** `UnkFacilitySheet.pas` | **Permission:** None (read-only) | **WebClient:** `UNK_GENERAL_GROUP`

Fallback handler for unknown facility types. Display-only.

#### Properties Read (auto-mapped via xfer_*)

`Name`, `Creator`, `Cost`, `ROI`, `Years`, `Trouble`

#### RDO Write Commands

None — read-only handler.

---

### IndGeneral

**Source:** `IndustryGeneralSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `IND_GENERAL_GROUP`

Industry/factory general tab — shows facility info, trade role, trade level.

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `SecurityId` | string | Permission check |
| `Trouble` | integer | Bitmask, bit $04 = stopped |
| `CurrBlock` | integer | Block ID for BindTo |
| `Cost` | currency | Formatted via FormatMoneyStr |
| `ROI` | float | 0="Not yet", >0=years, <0="Not profitable" |
| `Years` | integer | Age in years |
| `TradeRole` | integer | `TFacilityRole` enum (0-6) |
| `TradeLevel` | integer | `TTradeLevel` enum (0-3) |
| `Name` | string | Editable if owner |
| `Creator` | string | Auto-mapped |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `Name :=` | `%newName` | objectId | false | Rename facility |
| `Stopped :=` | `#-1` or `#0` | objectId | false | Close/Reopen |
| `RDOSetTradeLevel` | `(#level)` | CurrBlock | false | 0=owner, 2=allies, 3=anyone |
| `RDOSetRole` | `(#roleId)` | CurrBlock | false | Trade role enum |
| `RDOConnectToTycoon` | `(#tycoonId, #kind, #-1)` | objectId | true | Sell to tycoon |
| `RDODisconnectFromTycoon` | `(#tycoonId, #kind, #-1)` | objectId | true | Stop selling |
| `RDODelFacility` | `(#x, #y)` | 'World' | true | Demolish |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `xfer_Name`, `btnClose`, `btnDemolish` | `fOwnsFacility` |
| `cbMode` (role), `cbTrade` (trade level) | `fOwnsFacility` |
| `btnSellToWareHouses` | `fOwnsFacility AND role ≠ Warehouse` |
| `btnConnect`, `btnSellToStores`, `btnSellToFacs` | Always enabled |

#### Role Enum Mapping (IndustryGeneralSheet.pas:130-131)

| Value | Name | ComboBox Index |
|-------|------|---------------|
| 0 | rolNeutral | — |
| 1 | rolProducer | — |
| 2 | rolDistributer | 0 |
| 3 | rolBuyer | — |
| 4 | rolImporter | — |
| 5 | rolCompExport | 1 |
| 6 | rolCompInport | 2 |

#### Trade Level Mapping

| ComboBox Index | Value | Meaning |
|---------------|-------|---------|
| 0 | 0 | Same Owner |
| 1 | 2 | Allies |
| 2 | 3 | Anyone |

---

### SrvGeneral

**Source:** `SrvGeneralSheetForm.pas` | **Permission:** Standard GrantAccess | **WebClient:** `SRV_GENERAL_GROUP`

Service facility general tab — per-service pricing with dynamic finger tabs.

#### Properties Read

Same as IndGeneral base properties plus:

| Property | Type | Notes |
|----------|------|-------|
| `ServiceCount` | integer | Number of service outputs |
| `srvNames{i}.{lang}` | string | MLS service name (finger tab label) |
| `srvSupplies{i}` | integer | Current supply |
| `srvDemands{i}` | integer | Current demand |
| `srvMarketPrices{i}` | currency | Market reference price |
| `srvPrices{i}` | integer | Current price (% of market) |
| `srvAvgPrices{i}` | integer | Average price |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetPrice` | `(#fingerIndex, #price)` | CurrBlock | false | Set service price (% of market) |
| `RDOGetDemand` | `(#fingerIndex)` | CurrBlock | true | Poll current demand (timer) |
| `RDOGetSupply` | `(#fingerIndex)` | CurrBlock | true | Poll current supply (timer) |
| `RDODelFacility` | `(#x, #y)` | 'World' | true | Demolish |
| `Name :=` | `%newName` | objectId | false | Rename |
| `Stopped :=` | `#bool` | objectId | false | Close/Reopen |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `btnClose`, `btnDemolish`, `Price` slider | `fOwnsFacility` |
| `btnConnect` | Always enabled |

**Note:** Price is an integer percentage (e.g., 150 = 150% of market price). Actual dollar amount = `MarketPrice × Price / 100`.

---

### ResGeneral

**Source:** `ResidentialSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `RES_GENERAL_GROUP`

Residential building tab — rent, maintenance, environmental stats.

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `SecurityId`, `Trouble`, `CurrBlock` | — | Standard |
| `Rent` | integer | Percent (slider value) |
| `Maintenance` | integer | Percent (slider value) |
| `Creator`, `Years`, `Cost`, `ROI` | — | Standard display |
| `invCrimeRes` | string | Crime resistance |
| `invPollutionRes` | string | Pollution resistance |
| `invPrivacy` | string | Privacy rating |
| `InvBeauty` | string | Beauty rating |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `Rent :=` | `#value` | CurrBlock | false | Property SET (integer %) |
| `Maintenance :=` | `#value` | CurrBlock | false | Property SET (integer %) |
| `RdoRepair` | none | CurrBlock | true | Repair facility |
| `RDODelFacility` | `(#x, #y)` | 'World' | true | Demolish |
| `Name :=` | `%newName` | objectId | false | Rename |
| `Stopped :=` | `#bool` | objectId | false | Close/Reopen |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `xfer_Name`, `xfer_Rent`, `xfer_Maintenance` | `fOwnsFacility` |
| `btnClose`, `btnDemolish`, `btnRepair` | `fOwnsFacility` |

---

### HqGeneral

**Source:** `HqMainSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `HQ_GENERAL_GROUP`

Headquarters general tab — company overview, research button.

#### Properties Read

Same base properties as IndGeneral: `SecurityId`, `Trouble`, `CurrBlock`, `Cost`, `ROI`, `Years`, `Name`, `Creator` (auto-mapped via xfer_*)

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `Name :=` | `%newName` | objectId | false | Rename |
| `Stopped :=` | `#bool` | objectId | false | Close/Reopen |
| `RdoRepair` | none | objectId | true | Repair |
| `RDODelFacility` | `(#x, #y)` | 'World' | true | Demolish |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `xfer_Name`, `btnClose`, `btnDemolish` | `fOwnsFacility` |
| `btnConnect` | Always enabled |

#### Special: Research Integration

`fbResearches` button (HqMainSheet.pas:338-366) loads the `hdqInventions` handler via `SheetHandlerRegistry.GetSheetHandler('hdqInventions')` and shows it as a modal dialog. See [research-system-reference.md](research-system-reference.md).

---

### BankGeneral

**Source:** `BankGeneralSheet.pas` | **Permission:** Standard GrantAccess + **Inverted** for loan UI | **WebClient:** `BANK_GENERAL_GROUP`

Bank facility — owner sets rates, visitors request loans.

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `SecurityId`, `Trouble`, `CurrBlock` | — | Standard |
| `BudgetPerc` | integer | Budget allocation % (fetched via MSProxy get) |
| `Interest` | integer | Interest rate (MSProxy get) |
| `Term` | integer | Loan term (MSProxy get) |
| `EstLoan` | currency | Estimated loan amount for visitor |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetLoanPerc` | `(#value)` | CurrBlock | false | Set budget allocation % |
| `Interest :=` | `#value` | CurrBlock | false | Set interest rate |
| `Term :=` | `#value` | CurrBlock | false | Set loan term |
| `RDOAskLoan` | `(%securityId, @amount)` | CurrBlock | true | Request loan (visitor) |
| `RDOEstimateLoan` | `(%tycoonId)` | CurrBlock | true | Estimate max loan |
| `Name :=` | `%newName` | objectId | false | Rename |
| `Stopped :=` | `#bool` | objectId | false | Close/Reopen |
| `RDODelFacility` | `(#x, #y)` | 'World' | true | Demolish |

#### Enabled Conditions — DUAL PERMISSION

| Control | Condition | Who |
|---------|-----------|-----|
| `btnClose`, `btnDemolish` | `fOwnsFacility` | Owner |
| `peInterest`, `peTerm`, `peBankBudget` | `fOwnsFacility` | Owner |
| `fbRequest` (request loan) | `NOT fOwnsFacility` | **Visitor** |
| `eBorrow` (borrow amount) | `NOT fOwnsFacility` | **Visitor** |

#### Loan Request Result

`RDOAskLoan` returns `TBankRequestResult` (BankGeneralSheet.pas:22):
- 0 = `brqApproved`
- 1 = `brqRejected`
- 2 = `brqNotEnoughFunds`
- 3 = `brqError`

---

### WHGeneral

**Source:** `WHGeneralSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `WH_GENERAL_GROUP`

Warehouse general tab — trade level, ware checklist.

#### Properties Read

Same base properties plus:

| Property | Type | Notes |
|----------|------|-------|
| `Role` | integer | TFacilityRole enum |
| `TradeLevel` | integer | TTradeLevel enum |
| `GateMap` | string | Per-position '0'/'1' for checked/unchecked wares |

Ware names fetched via `MSProxy.GetInputNames(0, ActiveLanguage)` — CR-delimited.

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetTradeLevel` | `(#level)` | CurrBlock | false | Trade level |
| `RDOSelectWare` | `(#index, #value)` | CurrBlock | true | Toggle ware checked state |
| `RDOConnectToTycoon` | `(#tycoonId, #kind, #-1)` | objectId | true | Sell to all |
| `RDODisconnectFromTycoon` | `(#tycoonId, #kind, #-1)` | objectId | true | Don't sell |
| `Name :=`, `Stopped :=`, `RDODelFacility` | — | — | — | Standard |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `clbNames` (ware checklist), each item | `fOwnsFacility` |
| `btnClose`, `btnDemolish` | `fOwnsFacility` |

---

### TVGeneral

**Source:** `TVGeneralSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `TV_GENERAL_GROUP`

TV station general tab — broadcast settings.

#### Properties Read

Base properties plus `HoursOnAir`, `Comercials` (fetched via MSProxy property get, BindTo CurrBlock).

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `HoursOnAir :=` | `#value` | CurrBlock | false | Property SET |
| `Commercials :=` | `#value` | CurrBlock | false | Property SET |
| `Name :=`, `Stopped :=`, `RDODelFacility` | — | — | — | Standard |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `peHoursOnAir`, `peAdvertisement` | `fOwnsFacility` |
| `btnClose`, `btnDemolish` | `fOwnsFacility` |

---

### capitolGeneral

**Source:** `CapitolSheet.pas` | **Permission:** None (read-only) | **WebClient:** `CAPITOL_GENERAL_GROUP`

Capitol building overview — political stats, coverage table.

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `HasRuler` | string | `'1'` = has ruler |
| `YearsToElections` | integer | Years until next election |
| `RulerRating` | string | Approval % |
| `TycoonsRating` | string | Tycoon satisfaction % |
| `covCount` | integer | Coverage area count |
| `covName{i}` | string | Coverage area name |
| `covValue{i}` | integer | Coverage % |

#### RDO Write Commands

None — read-only.

#### URLs

```
{WorldURL}/Visual/Voyager/Politics/politics.asp
  ?WorldName={world}&TycoonName={name}&Password={pwd}&Capitol=YES&X={x}&Y={y}&DAAddr={addr}&DAPort={port}
```

---

### townGeneral

**Source:** `TownHallSheet.pas` | **Permission:** None (read-only) | **WebClient:** `TOWN_GENERAL_GROUP`

Town hall overview — ruler info, coverage, links to politics/news.

#### Properties Read

Two-stage fetch: first `Town` from facility, then navigate to `\Towns\{town}.five\` path for:

| Property | Type | Notes |
|----------|------|-------|
| `ActualRuler` | string | President name |
| `RulerPrestige` | currency | Formatted |
| `RulerRating`, `TycoonsRating` | string | Approval % |
| `CampaignCount` | integer | Active campaigns |
| `RulerPeriods` | integer | Terms served |
| `YearsToElections` | integer | Years to election |
| `HasRuler` | string | `'1'` = has ruler |
| `NewspaperName` | string | Town newspaper name |
| `covCount` | integer | Coverage count |
| `covName{i}.{lang}` | string | MLS coverage name |
| `covValue{i}` | integer | Coverage % |

#### RDO Write Commands

None — read-only.

#### URLs

| URL | Purpose |
|-----|---------|
| `{WorldURL}/Visual/Voyager/Politics/politics.asp?...&TownName={town}` | Visit politics |
| `{WorldURL}/Visual/News/boardreader.asp?...&PaperName={paper}` | Rate mayor |
| `{WorldURL}/Visual/News/newsreader.asp?...&PaperName={paper}` | Read news |

---

## Core Data Handlers

### Products

**Source:** `ProdSheetForm.pas` | **Permission:** Standard GrantAccess | **WebClient:** `PRODUCTS_GROUP`

Product outputs — dynamic finger tabs per fluid, connection management.

#### Properties Read (two-level)

**Level 1 (facility):** `SecurityId`, `Trouble`, `CurrBlock`, `GateMap`

**Level 2 (per finger via SetPath):**

| Property | Type | Notes |
|----------|------|-------|
| `MetaFluid` | string | Fluid ID |
| `LastFluid` | string | Production amount (NOTE: key is `LastFluid`, not `FluidValue`) |
| `FluidQuality` | string | Quality % |
| `PricePc` | integer | Price % of market |
| `AvgPrice` | integer | Average price |
| `MarketPrice` | currency | Market reference |
| `cnxCount` | integer | Connection count |

**Connections (per cnx):** `cnxFacilityName`, `cnxCompanyName`, `LastValueCnxInfo`, `cnxCreatedBy`, `cnxNfPrice`, `cnxQuality`, `cnxXPos`, `cnxYPos`

Finger names from `Proxy.GetOutputNames(0, ActiveLanguage)` — CR-delimited `Path:FluidName` pairs.

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetOutputPrice` | `(%fluidId, #pricePercent)` | objectId (direct, no BindTo) | false | Set output price % |
| `RDOConnectOutput` | `(%fluidId, %cnxList)` | objectId | true | Connect to buyer |
| `RDODisconnectOutput` | `(%fluidId, %cnxList)` | objectId | true | Disconnect buyer |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `PricePc` slider, `btnHireSuppliers`, `btnDelete` | `fOwnsFac` |

---

### Supplies

**Source:** `SupplySheetForm.pas` | **Permission:** Standard GrantAccess | **WebClient:** `SUPPLIES_GROUP`

Supply inputs — dynamic finger tabs per fluid, connection management, sort/buy controls.

#### Properties Read (two-level)

**Level 1 (facility):** `SecurityId`, `Trouble`, `CurrBlock`, `GateMap`, `TradeRole`

**Level 2 (per finger via SetPath):**

| Property | Type | Notes |
|----------|------|-------|
| `MetaFluid` | string | Fluid ID |
| `FluidValue` | string | Current supply amount |
| `LastCostPerc` | string | Last cost % |
| `minK` | integer | Min quality (slider, 0-100) |
| `MaxPrice` | integer | Max price (slider, 0-100) |
| `QPSorted` | string | `'1'` = sort controls active |
| `SortMode` | string | `'0'` = by price, `'1'` = by quality |
| `Selected` | integer | 1 = buy-checkbox checked |
| `ObjectId` | integer | Gate object ID (for BindTo) |
| `cnxCount` | integer | Connection count |

Finger names from `Proxy.GetInputNames(0, ActiveLanguage)`.

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOConnectInput` | `(%fluidId, %cnxList)` | objectId | true | Connect supplier |
| `RDODisconnectInput` | `(%fluidId, %cnxList)` | objectId | true | Disconnect supplier |
| `RDOSetInputOverPrice` | `(%fluidId, #index, #overprice)` | objectId | true | Set overprice |
| `RDOSetInputMinK` | `(%fluid, #value)` | objectId | false | Min quality |
| `RDOSetInputMaxPrice` | `(%fluid, #value)` | objectId | false | Max price |
| `RDOSetInputSortMode` | `(%fluid, #mode)` | objectId | false | Sort mode |
| `RDOSelSelected` | `(#boolVal)` | gate ObjectId | false | Toggle buying |
| `RDOSetBuyingStatus` | `(#fingerIndex, #bool)` | [INFERRED: gate ObjectId] | false | Toggle buying (alternate) |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `xfer_minK`, `xfer_MaxPrice`, `btnHireSuppliers`, `btnModify` | `fOwnsFac` |
| `cbAlmBuy` (buy checkbox) | `(role=2,5,6) AND fOwnsFac` |

---

### compInputs

**Source:** `CompanyServicesSheetForm.pas` | **Permission:** Standard GrantAccess | **WebClient:** `ADVERTISEMENT_GROUP`

Company inputs — demand sliders per input, with per-property editability.

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `SecurityId`, `Trouble`, `CurrBlock` | — | Standard |
| `cInputCount` | integer | Number of inputs |
| `cInput{i}.{lang}` | string | MLS input name |
| `cInputSup{i}` | float | Supply amount |
| `cInputDem{i}` | float | Demand amount |
| `cInputRatio{i}` | integer | Ratio 0-100 (displayed as %) |
| `cInputMax{i}` | float | Max capacity |
| `cEditable{i}` | string | Non-empty = editable (see §5.7 in architecture doc) |
| `cUnits{i}.{lang}` | string | MLS unit name |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetCompanyInputDemand` | `(#tabIndex, #percValue)` | CurrBlock | false | Set demand % (0-100) |

**percValue** is the slider percent. Real demand = `(percValue / 100) × cInputMax{i}`.

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `peDemand.Visible` | `cEditable{i} ≠ ''` |
| `peDemand.Enabled` | `cEditable{i} ≠ '' AND fOwnsFacility` |

---

### Ads

**Source:** `AdvSheetForm.pas` | **Permission:** ExtraSecurityId fallback | **WebClient:** `ADVERTISEMENT_GROUP`

Advertisement/supply management — fluid percentage, connections. **Note:** registered as `'Ads'` but NOT referenced in any CLASSES.BIN config. Advertisement functionality is served via `compInputs` handler instead.

#### Data Loading (non-standard)

Does NOT use standard `RenderProperties`. Instead:
1. Fetches `SecurityId`, `ExtraSecurityId`, `Trouble`
2. Calls `Proxy.GetInputNames(0, lang)` — iterates looking for input named `'advertisement'`
3. Navigates to the advertisement input gate via `Proxy.SetPath(InpPath)`
4. Reads gate-level properties

#### Properties Read (from gate)

| Property | Type | Notes |
|----------|------|-------|
| `ObjectId` | integer | Gate object ID (used for BindTo) |
| `MetaFluid` | string | Fluid ID |
| `FluidValue` | string | Current fluid value |
| `LastCost` | string | Last cost |
| `nfCapacity` | float | Max capacity |
| `nfActualMaxFluidValue` | float | Current max value |
| `cnxCount` | integer | Connection count |

**Percentage calculation:** `min(100, round(100 × nfActualMaxFluidValue / nfCapacity))`

#### Permission Check (ExtraSecurityId)

```delphi
aux := Properties.Values[tidExtSecurityId];
if aux = '' then aux := Properties.Values[tidSecurityId];
fOwnsFac := GrantAccess(clientSecId, aux);
```

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetInputFluidPerc` | `(#percent)` | **fAdInputId** (gate ObjectId) | false | Set fluid % |
| `RDOConnectInput` | `(%fluidId, %cnxList)` | objectId | true | Connect supplier |
| `RDODisconnectInput` | `(%fluidId, %cnxList)` | objectId | true | Disconnect supplier |
| `RDOSetInputOverPrice` | `(%fluidId, #index, #overprice)` | objectId | true | Set overprice |

**Critical:** `RDOSetInputFluidPerc` binds to the input GATE object ID, not `CurrBlock`. This is unique to this handler.

---

### Workforce

**Source:** `WorkforceSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `WORKFORCE_GROUP`

3-tier workforce table — salary sliders per tier.

#### Properties Read (per tier n = 0, 1, 2)

| Property | Type | Notes |
|----------|------|-------|
| `CurrBlock`, `SecurityId` | — | Standard |
| `Salaries{n}` | integer | Salary % (slider value) |
| `WorkForcePrice{n}` | float | Base price per worker |
| `Workers{n}` | integer | Current worker count (timer-polled) |
| `WorkersMax{n}` | integer | Max workers |
| `WorkersK{n}` | integer | Fulfillment % |
| `WorkersCap{n}` | string | Capacity flag (empty or `'0'` = tier unused → hidden) |
| `MinSalaries{n}` | integer | Min salary (slider midpoint) |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetSalaries` | `(#sal0, #sal1, #sal2)` | CurrBlock | false | Set ALL 3 salaries in one call |
| `RDOGetWorkers` | `(#tierIndex)` → integer | CurrBlock | true | Poll worker count (timer) |

**Critical:** `RDOSetSalaries` sends all three tiers in a single call — any slider change fires with all current values.

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `xfer_Salaries{n}.Visible` | `WorkersCap{n} ≠ '' AND ≠ '0'` |
| `xfer_Salaries{n}.Enabled` | `fOwnsFacility` |

**Salary display:** `$` + `WorkForcePrice{n} × Salaries{n} / 100` + ` (` + `Salaries{n}` + `%)`

---

### facManagement

**Source:** `ManagementSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `UPGRADE_GROUP`

Facility management — upgrade, downgrade, clone, accept settings.

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `SecurityId`, `CurrBlock` | — | Standard |
| `UpgradeLevel` | integer | Current upgrade level |
| `MaxUpgrade` | integer | Maximum allowed upgrades |
| `Upgrading` | string | `'1'` = currently upgrading |
| `Pending` | integer | Pending upgrades count |
| `NextUpgCost` | currency | Cost of next upgrade |
| `CloneMenu{lang}` | string | Pipe-delimited clone options |
| `RDOAcceptCloning` | boolean | Property GET via MSProxy |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOAcceptCloning :=` | `#bool` | CurrBlock | false | Toggle accept cloning |
| `RDOStartUpgrades` | `(#count)` | objectId | true | Start N upgrades |
| `RDOStopUpgrade` | none | objectId | true | Stop current upgrade |
| `RDODowngrade` | none | objectId | true | Downgrade one level |
| `CloneFacility` | `(#x, #y, #limitToTown, #limitToComp)` | TClientView | true | Clone building |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `cbAcceptSettings`, `cblSettings`, `btnClone` | `fOwnsFacility` |
| `fbUpgrade` | `fOwnsFacility AND maxUpgrades > 0 AND upgradeCost > 0` |
| `fbDowngrade` | `fOwnsFacility AND upgradeLevel > 1` |

---

### Chart

**Source:** `ChartSheet.pas` | **Permission:** None (read-only) | **WebClient:** `FINANCES_GROUP`

Historical chart display — no editable controls.

#### Properties Read

Chart data properties (plotted values). Specific property names depend on chart configuration.

#### RDO Write Commands

None — read-only.

---

## Specialized Handlers

### BankLoans

**Source:** `BankLoansSheet.pas` | **Permission:** None (read-only) | **WebClient:** `BANK_LOANS_GROUP`

Bank loan list — read-only table.

#### Properties Read (indexed)

| Property | Type | Notes |
|----------|------|-------|
| `LoanCount` | integer | Number of active loans |
| `Debtor{i}` | string | Borrower name |
| `Amount{i}` | currency | Loan amount |
| `Interest{i}` | string | Interest rate |
| `Term{i}` | string | Loan term |

#### RDO Write Commands

None — read-only.

---

### Antennas

**Source:** `AntennasSheet.pas` | **Permission:** None (read-only) | **WebClient:** `ANTENNAS_GROUP`

Antenna list — read-only table with map navigation on double-click.

#### Properties Read (indexed)

| Property | Type | Notes |
|----------|------|-------|
| `antCount` | integer | Antenna count |
| `antName{i}` | string | Antenna name |
| `antTown{i}` | string | Town name |
| `antX{i}` | integer | Map X coordinate |
| `antY{i}` | integer | Map Y coordinate |
| `antActive{i}` | string | `'YES'` / `'NO'` |
| `antViewers{i}` | integer | Viewer count |

#### RDO Write Commands

None — read-only.

#### URLs

Double-click: `?frame_Id=MapIsoView&frame_Action=MoveTo&x={X}&y={Y}` (map navigation)

---

### Films

**Source:** `FilmsSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `FILMS_GROUP`

Film studio — production controls.

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `SecurityId`, `CurrBlock` | — | Standard |
| `InProd` | string | Non-empty = film in production |
| `AutoRel` | string | `'NO'` = no auto-release |
| `AutoProd` | string | `'YES'` = auto-produce |
| `FilmDone` | string | `'YES'` = film completed |
| `FilmName` | string | Current film name |
| `FilmBudget` | currency | Budget |
| `FilmTime` | integer | Months (6-30) |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOLaunchMovie` | `(%name, @budget, #months, #autoFlags)` | CurrBlock | true | Start production |
| `RDOCancelMovie` | `(#0)` | CurrBlock | true | Cancel production |
| `RDOReleaseMovie` | `(#0)` | CurrBlock | true | Release completed film |
| `RDOAutoProduce` | `(#boolVal)` | CurrBlock | false | Toggle auto-produce |

**autoFlags encoding:** bit 0 = auto-release checkbox, bit 1 = auto-production checkbox.

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `xfer_FilmName`, `btnLaunch`, `cbAutoRelease`, `xfer_FilmBudget`, `xfer_FilmTime` | `fOwnsFacility AND NOT inProd` |
| `btnReleaseFilm` | `fOwnsFacility AND FilmDone = 'YES'` |
| `btnCancelFilm` | `fOwnsFacility AND inProd` |
| `cbAutoProduction` | `fOwnsFacility` |

---

### Mausoleum

**Source:** `MausoleumSheet.pas` | **Permission:** Username comparison (OwnerName) | **WebClient:** `MAUSOLEUM_GROUP`

Mausoleum/monument — words of wisdom text editor.

#### Permission Check (UNIQUE)

```delphi
// MausoleumSheet.pas:127
fOwnFac := (UpperCase(Properties.Values['OwnerName']) = UpperCase(getUserName()))
```

No `GrantAccess` — direct username comparison.

#### Properties Read

`WordsOfWisdom`, `OwnerName`, `CurrBlock`, `Transcended`

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetWordsOfWisdom` | `(%words)` | CurrBlock | true | Set monument text |
| `RDOCacncelTransc` | none | CurrBlock | true | Cancel transcendence (note: typo in method name) |

**Paragraph encoding:** Uses `|` as paragraph separator. `EncodeParagraph()` joins lines with `|`, `DecodeParagraph()` splits on `|`.

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `btnSetWords` | `fOwnFac` |
| `eWordsOfWisdom.ReadOnly` | `NOT fOwnFac` |
| `btnCancel` | `fOwnFac AND Transcended ≠ '1'` |

---

### Votes

**Source:** `VotesSheet.pas` | **Permission:** Standard GrantAccess (set but not used to gate UI) | **WebClient:** `VOTES_GROUP`

Election voting — candidate list, vote button.

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `SecurityId`, `CurrBlock` | — | Standard |
| `CampaignCount` | integer | Number of candidates |
| `RulerName` | string | Current ruler name |
| `RulerVotes` | string | Ruler's vote count |
| `RulerCmpRat` | string | Ruler's campaign rating % |
| `RulerCmpPnts` | integer | Ruler's campaign points |
| `Candidate{i}` | string | Candidate name |
| `Votes{i}` | string | Vote count |
| `CmpRat{i}` | string | Campaign rating % |
| `CmpPnts{i}` | integer | Campaign points (sort key) |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOVote` | `(%voterName, %voteeName)` | CurrBlock | true | Cast vote |
| `RDOVoteOf` | `(%voterName)` → string | CurrBlock | true | Get who user voted for |

**Note:** `fOwnsFacility` is computed but NOT used to gate the vote button — any logged-in user can vote.

---

### CapitolTowns

**Source:** `CapitolTownsSheet.pas` | **Permission:** Dual (GrantAccess OR ActualRuler) | **WebClient:** `CAPITOL_TOWNS_GROUP`

Capitol town management — town list, tax adjustment.

#### Permission Check

```delphi
fHasAccess := GrantAccess(secId, SecurityId)
  or (uppercase(ActualRuler) = uppercase(getUserName()));
```

#### Properties Read (indexed)

| Property | Type | Notes |
|----------|------|-------|
| `TownCount` | integer | Town count |
| `TownName{i}` | string | Town name |
| `TownPopulation{i}` | string | Population |
| `TownQOL{i}` | string | Quality of life % |
| `TownQOS{i}` | string | Quality of service % |
| `TownWealth{i}` | string | Wealth % |
| `TownTax{i}` | string | Tax rate % |
| `HasMayor{i}` | string | `'0'` = no mayor, `'1'` = has mayor |
| `ActualRuler` | string | President username |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetTownTaxes` | `(#index, #value)` | CurrBlock | true | Set town tax rate |
| `RDOSitMayor` | `(%townName, %tycoonName)` | CurrBlock | true | Appoint mayor |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `pnTax` (tax editing panel) | `fHasAccess` (visible/hidden) |

---

### Ministeries

**Source:** `MinisteriesSheet.pas` | **Permission:** Dual (GrantAccess OR ActualRuler) | **WebClient:** `MINISTERIES_GROUP`

Ministry management — budget, appoint/depose ministers.

#### Permission Check

Same as CapitolTowns: `GrantAccess(secId, SecurityId) OR (ActualRuler = getUserName())`.

#### Properties Read (indexed)

| Property | Type | Notes |
|----------|------|-------|
| `MinisterCount` | integer | Ministry count |
| `MinistryId{i}` | integer | Ministry ID (for RDO params) |
| `Ministry{i}.{lang}` | string | MLS ministry name |
| `Minister{i}` | string | Minister name (empty = vacant) |
| `MinisterRating{i}` | string | Rating % |
| `MinisterBudget{i}` | currency | Budget amount |

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetMinistryBudget` | `(#minId, %budgetStr)` | CurrBlock | true | Set ministry budget |
| `RDOBanMinister` | `(#minId)` | CurrBlock | true | Remove minister |
| `RDOSitMinister` | `(#minId, %name)` | CurrBlock | true | Appoint minister |

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `pnBudgetEdit` (budget panel) | `fHasAccess` (visible/hidden) |
| `edBudget`, `btnSetBudget`, `btnDepose` | Selection in list + valid data |

---

## Town Hall Handlers

### townJobs

**Source:** `TownHallJobsSheet.pas` | **Permission:** ExtraSecurityId fallback | **WebClient:** `TOWN_JOBS_GROUP`

Town employment — min salary sliders per workforce tier.

#### Permission Check (ExtraSecurityId)

```delphi
aux := Properties.Values[tidExtSecurityId];
if aux = '' then aux := Properties.Values[tidSecurityId];
fOwnsFacility := GrantAccess(clientSecId, aux);
```

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `CurrBlock`, `SecurityId`, `ExtraSecurityId` | — | Standard + extra |
| `hiActualMinSalary` | integer | Min salary midpoint (tier 0) |
| `midActualMinSalary` | integer | Min salary midpoint (tier 1) |
| `loActualMinSalary` | integer | Min salary midpoint (tier 2) |

Plus `xfer_*` auto-mapped: `{hi|mid|lo}WorkDemand`, `{hi|mid|lo}PrivateWorkDemand`, `{hi|mid|lo}Salary`, `{hi|mid|lo}SalaryValue`, `{hi|mid|lo}MinSalary`

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetMinSalaryValue` | `(#tierTag, #value)` | CurrBlock | false | Set min salary per tier |

`tierTag` comes from the `TPercentEdit.Tag` property — distinguishes hi/mid/lo tiers.

#### Enabled Conditions

| Control | Condition |
|---------|-----------|
| `xfer_hiMinSalary`, `xfer_midMinSalary`, `xfer_loMinSalary` | `fOwnsFacility` |

---

### townRes

**Source:** `TownHallResSheet.pas` | **Permission:** [UNKNOWN — file not fully read] | **WebClient:** `TOWN_RES_GROUP`

Town residential overview — residential statistics display.

#### Properties Read

Residential statistics auto-mapped via `xfer_*`.

#### RDO Write Commands

[NEEDS INVESTIGATION] — likely read-only.

---

### townServices

**Source:** `TownProdxSheet.pas` | **Permission:** [read-only display] | **WebClient:** `TOWN_SERVICES_GROUP`

Town services list — demand/supply/capacity table.

#### Properties Read (indexed)

| Property | Type | Notes |
|----------|------|-------|
| `srvCount` | integer | Service count |
| `svrName{i}` | string | Service name |
| `svrDemand{i}` | float | Current demand |
| `svrOffer{i}` | float | Current supply |
| `svrCapacity{i}` | float | Max capacity |
| `svrRatio{i}` | float | Ratio (0.0-1.0) |
| `svrMarketPrice{i}` | currency | Market price |
| `svrPrice{i}` | currency | Current price |
| `svrQuality{i}` | float | Quality |
| `GQOS` | float | Global quality of service |

#### RDO Write Commands

None — read-only display.

---

### townProducts

**Source:** `TownProdSheet.pas` | **Permission:** [read-only display] | **WebClient:** `TOWN_PRODUCTS_GROUP`

Town products list — MLS product names.

#### Properties Read (indexed)

| Property | Type | Notes |
|----------|------|-------|
| `prdCount` | integer | Product count |
| `prdName{i}.{lang}` | string | MLS product name |
| `prdInputValue{i}` | float | Input value |

Additional columns exist but property names are [NEEDS INVESTIGATION] for complete list.

#### RDO Write Commands

None — read-only display.

---

### townTaxes

**Source:** `TownTaxesSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** `TOWN_TAXES_GROUP`

Town tax management — per-tax editing (percent or value).

#### Properties Read

| Property | Type | Notes |
|----------|------|-------|
| `SecurityId`, `CurrBlock` | — | Standard |
| `TaxCount` | integer | Tax count |
| `Tax{i}Id` | integer | Tax ID (for RDO params) |
| `Tax{i}Name{lang}` | string | Tax name (MLS, mid-index pattern) |
| `Tax{i}Kind` | integer | 0 = percent, 1 = value |
| `Tax{i}Percent` | string | Current value (can be negative = subsidy) |
| `Tax{i}LastYear` | currency | Last year's revenue |

**Note:** Index pattern is `Tax{i}Name{lang}` (e.g., `Tax0Name0`) — index BETWEEN prefix and suffix.

#### RDO Write Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOSetTaxValue` (percent) | `(#taxId, %valueString)` | CurrBlock | true | Set tax % |
| `RDOSetTaxValue` (value) | `(#taxId, @currencyValue)` | CurrBlock | true | Set tax $ amount |

**Subsidy encoding:** Negative percent = subsidy. When subsidizing, sends `'-10'` as value string.

#### Enabled Conditions

Tax editing controls (slider, radio buttons, text input) only visible when `fOwnsFacility`. Non-owners see empty page.

---

## Handlers Not in CLASSES.BIN

These handlers are registered in `SheetHandlerRegistry` but are NOT referenced by any of the 863 visual classes in CLASSES.BIN. They may be dead code, runtime-injected, or from unreleased content.

### hdqInventions

**Source:** `InventionsSheet.pas` | **Permission:** Standard GrantAccess | **WebClient:** — (see [research-system-reference.md](research-system-reference.md))

Research/Inventions panel — loaded runtime by `HqGeneral` (not from CLASSES.BIN tabs). Three sections: Available, Researching, Developed inventions.

See [research-system-reference.md](research-system-reference.md) for complete documentation.

#### Key RDO Commands

| Method | Params | BindTo | WFA | Purpose |
|--------|--------|--------|-----|---------|
| `RDOQueueResearch` | `(%invId, #priority)` | CurrBlock | true | Queue invention (priority=10) |
| `RDOCancelResearch` | `(%invId)` | CurrBlock | true | Cancel/sell invention |
| `RDOGetInvPropsByLang` | `(%id, %lang)` → string | CurrBlock | true | Get invention properties |
| `RDOGetInvDescEx` | `(%id, %lang)` → string | CurrBlock | true | Get invention description |
| `RDOGetInvDesc` | `(%id)` → string | CurrBlock | true | Fallback (no lang) |

### InputSelection

**Source:** `InputSelectionForm.pas` | **Registered as:** `'InputSelection'` | **Status:** Likely dead code — no CLASSES.BIN reference.

### townPolitics

**Source:** `PoliticSheet.pas` | **Registered as:** `'townPolitics'` | **Status:** Likely dead code — no CLASSES.BIN reference.

### facMinisteries

**Source:** `xMinisteriesSheet.pas` | **Registered as:** `'facMinisteries'` | **Status:** Likely dead code — no CLASSES.BIN reference.

---

## Quick-Lookup Index

### By Handler Name (alphabetical)

| Handler | Section | Permission | Has Writes | WebClient Group |
|---------|---------|------------|------------|-----------------|
| Ads | Core Data | ExtraSecId fallback | Yes | ADS_GROUP |
| Antennas | Specialized | None | No | ANTENNAS_GROUP |
| BankGeneral | General | Standard + Inverted | Yes | BANK_GENERAL_GROUP |
| BankLoans | Specialized | None | No | BANK_LOANS_GROUP |
| capitolGeneral | General | None | No | CAPITOL_GENERAL_GROUP |
| CapitolTowns | Specialized | Dual (owner OR ruler) | Yes | CAPITOL_TOWNS_GROUP |
| Chart | Core Data | None | No | FINANCES_GROUP |
| compInputs | Core Data | Standard | Yes | ADVERTISEMENT_GROUP |
| facManagement | Core Data | Standard | Yes | UPGRADE_GROUP |
| facMinisteries | Not in BIN | — | — | — |
| Films | Specialized | Standard | Yes | FILMS_GROUP |
| hdqInventions | Not in BIN | Standard | Yes | — |
| HqGeneral | General | Standard | Yes | HQ_GENERAL_GROUP |
| IndGeneral | General | Standard | Yes | IND_GENERAL_GROUP |
| InputSelection | Not in BIN | — | — | — |
| Mausoleum | Specialized | Username comparison | Yes | MAUSOLEUM_GROUP |
| Ministeries | Specialized | Dual (owner OR ruler) | Yes | MINISTERIES_GROUP |
| Products | Core Data | Standard | Yes | PRODUCTS_GROUP |
| ResGeneral | General | Standard | Yes | RES_GENERAL_GROUP |
| SrvGeneral | General | Standard | Yes | SRV_GENERAL_GROUP |
| Supplies | Core Data | Standard | Yes | SUPPLIES_GROUP |
| townGeneral | General | None | No | TOWN_GENERAL_GROUP |
| townJobs | Town Hall | ExtraSecId fallback | Yes | TOWN_JOBS_GROUP |
| townPolitics | Not in BIN | — | — | — |
| townProducts | Town Hall | None | No | TOWN_PRODUCTS_GROUP |
| townRes | Town Hall | [NEEDS INVESTIGATION] | [NEEDS INVESTIGATION] | TOWN_RES_GROUP |
| townServices | Town Hall | None | No | TOWN_SERVICES_GROUP |
| townTaxes | Town Hall | Standard | Yes | TOWN_TAXES_GROUP |
| TVGeneral | General | Standard | Yes | TV_GENERAL_GROUP |
| unkGeneral | General | None | No | UNK_GENERAL_GROUP |
| Votes | Specialized | Standard (unused) | Yes | VOTES_GROUP |
| WHGeneral | General | Standard | Yes | WH_GENERAL_GROUP |
| Workforce | Core Data | Standard | Yes | WORKFORCE_GROUP |

### By RDO Write Command (alphabetical)

| RDO Command | Handler(s) | BindTo | Params | WFA |
|-------------|-----------|--------|--------|-----|
| `CloneFacility` | facManagement | TClientView | `(#x, #y, #town, #comp)` | true |
| `Commercials :=` | TVGeneral | CurrBlock | `#value` | false |
| `HoursOnAir :=` | TVGeneral | CurrBlock | `#value` | false |
| `Interest :=` | BankGeneral | CurrBlock | `#value` | false |
| `Maintenance :=` | ResGeneral | CurrBlock | `#value` | false |
| `Name :=` | IndGeneral, SrvGeneral, ResGeneral, HqGeneral, BankGeneral, WHGeneral | objectId | `%newName` | false |
| `RDOAcceptCloning :=` | facManagement | CurrBlock | `#bool` | false |
| `RDOAskLoan` | BankGeneral | CurrBlock | `(%secId, @amount)` | true |
| `RDOAutoProduce` | Films | CurrBlock | `(#bool)` | false |
| `RDOBanMinister` | Ministeries | CurrBlock | `(#minId)` | true |
| `RDOCacncelTransc` | Mausoleum | CurrBlock | none | true |
| `RDOCancelMovie` | Films | CurrBlock | `(#0)` | true |
| `RDOCancelResearch` | hdqInventions | CurrBlock | `(%invId)` | true |
| `RDOConnectInput` | Supplies, Ads | objectId | `(%fluidId, %cnxList)` | true |
| `RDOConnectOutput` | Products | objectId | `(%fluidId, %cnxList)` | true |
| `RDOConnectToTycoon` | IndGeneral, WHGeneral | objectId | `(#tycoonId, #kind, #-1)` | true |
| `RDODelFacility` | IndGeneral, SrvGeneral, ResGeneral, HqGeneral, BankGeneral, WHGeneral | 'World' | `(#x, #y)` | true |
| `RDODisconnectFromTycoon` | IndGeneral, WHGeneral | objectId | `(#tycoonId, #kind, #-1)` | true |
| `RDODisconnectInput` | Supplies, Ads | objectId | `(%fluidId, %cnxList)` | true |
| `RDODisconnectOutput` | Products | objectId | `(%fluidId, %cnxList)` | true |
| `RDODowngrade` | facManagement | objectId | none | true |
| `RDOEstimateLoan` | BankGeneral | CurrBlock | `(%tycoonId)` | true |
| `RDOGetInvDesc` | hdqInventions | CurrBlock | `(%id)` | true |
| `RDOGetInvDescEx` | hdqInventions | CurrBlock | `(%id, %lang)` | true |
| `RDOGetInvPropsByLang` | hdqInventions | CurrBlock | `(%id, %lang)` | true |
| `RDOGetWorkers` | Workforce | CurrBlock | `(#tier)` | true |
| `RDOLaunchMovie` | Films | CurrBlock | `(%name, @budget, #months, #flags)` | true |
| `RDOQueueResearch` | hdqInventions | CurrBlock | `(%invId, #10)` | true |
| `RDOReleaseMovie` | Films | CurrBlock | `(#0)` | true |
| `RDOSelectWare` | WHGeneral | CurrBlock | `(#index, #value)` | true |
| `RDOSelSelected` | Supplies | gate ObjectId | `(#bool)` | false |
| `RDOSetBuyingStatus` | Supplies | gate ObjectId | `(#finger, #bool)` | false |
| `RDOSetCompanyInputDemand` | compInputs | CurrBlock | `(#tabIdx, #perc)` | false |
| `RDOSetInputFluidPerc` | Ads | gate ObjectId | `(#percent)` | false |
| `RDOSetInputMaxPrice` | Supplies | objectId | `(%fluid, #value)` | false |
| `RDOSetInputMinK` | Supplies | objectId | `(%fluid, #value)` | false |
| `RDOSetInputOverPrice` | Supplies, Ads | objectId | `(%fluidId, #idx, #over)` | true |
| `RDOSetInputSortMode` | Supplies | objectId | `(%fluid, #mode)` | false |
| `RDOSetLoanPerc` | BankGeneral | CurrBlock | `(#value)` | false |
| `RDOSetMinSalaryValue` | townJobs | CurrBlock | `(#tier, #value)` | false |
| `RDOSetMinistryBudget` | Ministeries | CurrBlock | `(#minId, %budgetStr)` | true |
| `RDOSetOutputPrice` | Products | objectId (direct) | `(%fluidId, #pricePerc)` | false |
| `RDOSetPrice` | SrvGeneral | CurrBlock | `(#finger, #price)` | false |
| `RDOSetRole` | IndGeneral | CurrBlock | `(#roleId)` | false |
| `RDOSetSalaries` | Workforce | CurrBlock | `(#s0, #s1, #s2)` | false |
| `RDOSetTaxValue` | townTaxes | CurrBlock | `(#taxId, %val)` or `(#taxId, @cur)` | true |
| `RDOSetTownTaxes` | CapitolTowns | CurrBlock | `(#index, #value)` | true |
| `RDOSetTradeLevel` | IndGeneral, WHGeneral | CurrBlock | `(#level)` | false |
| `RDOSetWordsOfWisdom` | Mausoleum | CurrBlock | `(%words)` | true |
| `RDOSitMayor` | CapitolTowns | CurrBlock | `(%town, %tycoon)` | true |
| `RDOSitMinister` | Ministeries | CurrBlock | `(#minId, %name)` | true |
| `RDOStartUpgrades` | facManagement | objectId | `(#count)` | true |
| `RDOStopUpgrade` | facManagement | objectId | none | true |
| `RDOVote` | Votes | CurrBlock | `(%voter, %votee)` | true |
| `RDOVoteOf` | Votes | CurrBlock | `(%voter)` | true |
| `RdoRepair` | ResGeneral, HqGeneral | CurrBlock | none | true |
| `Rent :=` | ResGeneral | CurrBlock | `#value` | false |
| `Stopped :=` | IndGeneral, SrvGeneral, ResGeneral, HqGeneral, BankGeneral, WHGeneral, TVGeneral | objectId | `#bool` | false |
| `Term :=` | BankGeneral | CurrBlock | `#value` | false |
