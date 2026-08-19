# Supply System — Game Mechanics

Documented from Delphi source: `Kernel.pas`, `SupplySheetForm.pas`, `ObjectInspectorHandleViewer.pas`.

> **Wire facts are not here.** What remains below is the **game mechanics**: what a supplier
> search means, what the sort modes and role bitmask do, and what each value represents.

## FindSuppliers

Server-side method (Kernel.pas) for searching available suppliers.

```
FindSuppliers(Output, World, Town, Name, Count, XPos, YPos, SortMode, Roles)
```

**Returns:** Newline-separated results, each row: `x}y}FacName}Company}Town}$Price}Quality`

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| Output | widestring | Output path (Kernel object) |
| World | widestring | World name |
| Town | widestring | Town filter (empty = all) |
| Name | widestring | Fluid name to search |
| Count | integer | Max results |
| XPos, YPos | integer | Building coordinates (for distance sort) |
| SortMode | integer | 0=cost, 1=quality |
| Roles | integer | Role bitmask filter |

**Role bitmask:**
| Value | Constant | Meaning |
|-------|----------|---------|
| 1 | rolProducer | Producer |
| 2 | rolDistributer | Distributor |
| 4 | rolBuyer | Buyer |
| 8 | rolCompExport | Company Export |
| 16 | rolImporter | Importer |

## Supply operations — what each one means

Every member below is a Delphi `procedure`.

| Operation | Meaning and range |
|---|---|
| `RDOSetInputMaxPrice` | the highest price the facility will pay, 0-1000 |
| `RDOSetInputMinK` | the minimum quality it will accept, 0-100 |
| `RDOSetInputOverPrice` | per-supplier overpayment, 0-150 % — used to outbid competitors for a scarce input |
| `RDOConnectInput` | attach suppliers. The supplier list is a flat coordinate string `"x1,y1,x2,y2,..."` |
| `RDODisconnectInput` | detach suppliers, same coordinate format |
| `RDOSetInputSortMode` | which criterion orders the supplier list: 0 = cost, 1 = quality |

## Supply values (per-gate, after `SetPath`) — what they mean

| Property | Type | Description |
|----------|------|-------------|
| `MetaFluid` | string | Fluid type identifier |
| `FluidValue` | string | Current production/consumption value |
| `LastCostPerc` | string | Last cost as percentage |
| `minK` | string | Minimum quality threshold (0-100) |
| `MaxPrice` | string | Maximum price (0-1000) |
| `cnxCount` | integer | Number of connections |
| `SortMode` | string | Sort mode: 0=cost, 1=quality |
| `QPSorted` | string | Whether Q/P sorted ("Yes"/"No") |

## Connection values (per-connection, indexed) — what they mean

| Property | Type | Description |
|----------|------|-------------|
| `cnxFacilityName{i}` | string | Connected facility name |
| `cnxCreatedBy{i}` | string | Who created the connection |
| `cnxNfPrice{i}` | string | Negotiated price |
| `OverPriceCnxInfo{i}` | string | Overpayment percentage |
| `LastValueCnxInfo{i}` | string | Last transaction value |
| `tCostCnxInfo{i}` | string | Transportation cost |
| `cnxQuality{i}` | string | Quality percentage |
| `ConnectedCnxInfo{i}` | boolean | Whether actively connected |
| `cnxXPos{i}` | integer | X coordinate of connected facility |
| `cnxYPos{i}` | integer | Y coordinate of connected facility |

## Where these are emitted

`src/server/session/building-property-handler.ts` — the `additionalParams` object carries:

- `fluidId` — the meta fluid identifier
- `connectionList` — `"x1,y1,x2,y2,..."` for connect and disconnect
- `index` — the supplier index, for `RDOSetInputOverPrice`

`RDOConnectInput` is one of only two members this path sends **synchronously**, because Delphi
recalculates trade routes on connect and that takes 5-30 s. Waiting is not what picks the
separator.
