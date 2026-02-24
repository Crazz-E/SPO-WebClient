---
name: building-inspector
description: "Building facility inspector: property fetching protocol, tab configurations, handler types, and gap status."
user-invokable: false
disable-model-invocation: false
---

# Building Inspector

Auto-loaded when working on `building-details/`, `property-templates.ts`, `template-groups.ts`, or facility inspector features.

## GetPropertyList Protocol

The core method to fetch building properties:

```
Request:  Proxy.GetPropertyList("SecurityId\tTrouble\tCurrBlock\t")
Response: "value1\tvalue2\tvalue3\t"
```

- Property names joined with TAB (`\t`) separator
- Request string MUST end with a trailing TAB
- Response values are TAB-separated in same order
- Empty values = TAB without preceding text
- Source: `Voyager/SheetUtils.pas:67`

## Tab Configuration (from CLASSES.BIN)

Each of the 863 visual classes has an `[InspectorInfo]` section:
```ini
TabCount=4
TabName0=GENERAL
TabHandler0=IndGeneral
TabName1=PRODUCTS
TabHandler1=Products
```

The parser at `src/server/classes-bin-parser.ts` reads `[General]`, `[MapImages]`, etc. but does NOT yet extract `[InspectorInfo]`.

## Handler Types (27 total)

Handlers map to PropertyGroups via `HANDLER_TO_GROUP` in `property-templates.ts`:

| Handler | Property Group | Category |
|---------|---------------|----------|
| `IndGeneral` | GENERAL_GROUP | General info |
| `Products` / `Supplies` | PRODUCTS/SUPPLIES_GROUP | I/O flows |
| `facManagement` | MANAGEMENT_GROUP | Staff/salary |
| `facWorkforce` | WORKFORCE_GROUP | Labor stats |
| `facGeneral` | GENERAL_GROUP | Facility basics |
| `Budget` | BUDGET_GROUP | Financial |
| `indResGeneral` | RES_GENERAL_GROUP | Residential |
| `indFilms` | FILMS_GROUP | Movies |
| `Upgrades` | UPGRADE_GROUP | Upgrades |
| `TownGeneral` | TOWN_GENERAL_GROUP | Town info |
| `townBudget` | TOWN_BUDGET_GROUP | Town budget |
| `Ministeries` | MINISTERIES_GROUP | Government |
| `Votes` | VOTES_GROUP | Elections |

## Gap Status (as of 2026-02-23)

**5 critical gaps:**
1. **GAP-01**: Missing handlers — `hdqInventions`, `InputSelection`, `townPolitics`, `facMinisteries` (NOT in `HANDLER_TO_GROUP`)
2. **GAP-02**: Action buttons wired but not server-dispatched (launchMovie, cancelMovie, vote, etc.)
3. **GAP-03**: `[InspectorInfo]` not yet parsed from CLASSES.BIN
4. **GAP-04**: Connection picker for clone/upgrade needs live company lookup
5. **GAP-05**: Workforce RDO response parsing incomplete

**12 functional issues** documented in gap analysis (rendering edge cases, missing tooltips, etc.)

## Key Gotcha

- `worldContextId` = world operations (map focus, queries)
- `interfaceServerId` = building operations (property fetch, set, actions)
- Building property requests use `interfaceServerId`, NOT `worldContextId`

## Key Files

| File | Purpose |
|------|---------|
| `src/shared/building-details/template-groups.ts` | PropertyGroup definitions |
| `src/shared/building-details/property-templates.ts` | HANDLER_TO_GROUP mapping |
| `src/server/spo_session.ts` | RDO property fetching + SET commands |
| `src/client/ui/building-details/building-details-panel.ts` | Inspector UI rendering |
| `src/server/classes-bin-parser.ts` | CLASSES.BIN parser (extend for InspectorInfo) |

## Deep-Dive References

- [Building Details Protocol](../../../doc/building_details_protocol.md) — Full GetPropertyList/GetInputNames/GetSubObjectProps
- [Facility Tabs Reference](../../../doc/facility-tabs-reference.md) — All 27 handlers × 20 tab configs × 863 classes
- [Gap Analysis Report](../../../doc/FACILITY-INSPECTOR-GAP-ANALYSIS.md) — 5 critical gaps, 12 functional issues
