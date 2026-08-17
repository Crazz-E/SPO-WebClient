# Live Mutation Campaign — Coverage Matrix & Execution Plan

**Companion:** [doc/E2E-LIVE-CAMPAIGN.md](../../doc/E2E-LIVE-CAMPAIGN.md) (method, oracles, guardrails, developer questions).
**Sources:** WebClient mutation inventory (2026-08-14) + direct source verification of the mutation chokepoints (this file cites what was read, not what was reported).
**Status:** SEEDED 2026-08-14 · all rows `todo` · no live run has occurred · scope tags provisional pending developer answers Q1–Q11.

This is both the campaign's progress ledger and its **execution plan**. Rows cannot be run in numeric order: 24 of them require a facility of a specific kind to exist and be owned first, which makes placement the keystone. §5 orders the work; §6 is the catalog.

---

## 1. Reading the matrix

**Transport (Tr)** — determines which oracles are even *available* (§2):
- **A** — synchronous RDO: `sendRdoRequest()`, `"^"` + QueryId, server answers `res=…` or `error N`.
- **B** — fire-and-forget RDO: `writeRdoFrame()`, `"*"`, **no QueryId, no response frame ever**.
- **C** — legacy ASP over HTTP, proxied by the gateway.

**Unlock** — what must be true before the row can run: `LIVE` (nothing, `SPO_test3` can do it now) · `MONEY` (spends in-world cash — Q1/Q2) · `OWN:<kind>` (needs an owned facility of that kind — placement first) · `ROLE:mayor|pres|gm` (Q11) · `PAIR` (needs two facilities / a counterparty — Q6) · `DESTRUCT` (irreversible — Q5/Q9).

**Variants** — adversarial classes, defined once here and referenced per row:

| ID | Variant | Applies to |
|---|---|---|
| **V0** | Nominal — documented gesture, sane value | every row |
| **V1** | Boundary — 0, min, slider max, non-round decimal, negative where the UI allows | numeric-arg rows |
| **V2** | Encoding — Latin-1 accents (`é`, `ü`), embedded `"` (doubling rule), `;` and `,`, long string, empty string | string-arg rows |
| **V3** | Stale target — act on a just-demolished facility, or after the cacher temp object expired (>5 min idle) | rows targeting CurrBlock/ObjectId |
| **V4** | Race — double-fire the same mutation fast; mutate while a `RefreshArea`/`RefreshObject` push lands | all (pacing per Q7) |
| **V5** | Permission — aim at a facility we do not own; expect a *server* rejection, since the ownership gate is client-side only | rows with a target we can redirect |
| **V6** | Disconnect — fire the mutation, kill the page immediately; on reconnect assert it applied **exactly once** (non-idempotency trap) | mutations with visible state |

**Status** — `todo` · `nominal` · `adversarial` (all listed variants passed) · `blocked` · `bug:<id>` · `excluded`.

**`blocked` DOIT porter une raison typée** (directive développeur, 2026-08-17). Une ligne qu'on n'a
pas pu exécuter est une information, pas un trou : sans la raison, personne ne sait s'il faut
re-tenter, provisionner un bâtiment, ou déclarer la ligne hors d'atteinte. Taxonomie :

| Raison | Sens |
|---|---|
| `blocked:no-facility` | aucun bâtiment du type requis n'est possédé par le compte |
| `blocked:ui-disabled` | le contrôle existe mais est grisé / non cliquable pour ce compte |
| `blocked:ui-absent` | le contrôle n'apparaît pas du tout dans l'interface |
| `blocked:role` | exige un rôle politique que le compte n'a pas (maire, président, GM) |
| `blocked:funds` | fonds insuffisants pour l'action |
| `blocked:precondition` | une autre ligne de la matrice doit passer d'abord (préciser laquelle) |
| `blocked:target` | la ligne est une **mutation** et la session tourne sur le serveur **partagé** (planitia) — elle exige `--target dedicated`. Ce n'est ni un manque du compte ni un défaut : c'est la règle de sécurité §7 |
| `blocked:server` | refus ou erreur serveur empêchant l'exécution (joindre la trace) |
| `blocked:harness` | la ligne exigerait d'écrire sous `src/` — ce qui **ré-arme le gate de conformité** et invaliderait les runs de la session. Ajoutée le 2026-08-17 : ce n'est ni le compte, ni la cible, ni le serveur, c'est l'outillage qui l'interdit tant que le gate n'est pas consommé par un commit |

Format attendu en cellule : `blocked:no-facility` + une note d'une ligne dans le compte rendu de
session. **Le rapport de fin de session liste toutes les lignes `blocked` avec leur raison** — c'est
un livrable, pas un commentaire.

**Compte — verrouillé.** Toutes les exécutions live utilisent **`SPO_test3` / `test3`** et rien
d'autre ; le compte est configuré pour cette campagne. Voir CLAUDE.md § E2E credentials — LOCKED.

---

## 2. Oracle availability by transport — the constraint that shapes the campaign

The six oracles (campaign doc §3.2) are **not uniformly available**. This was established by reading the emission paths, and it is the single most important planning fact:

| Oracle | Transport A (sync RDO) | Transport B (fire-and-forget) | Transport C (ASP) |
|---|---|---|---|
| **O1** wire ack | ✅ strong — `res=` value or `error N` | ❌ **unavailable — no response frame exists by design** | 🟡 weak — HTTP 200 even on logical failure |
| **O2** state round-trip | ✅ | ✅ **the only in-session oracle** | ✅ |
| **O3** push receipt | ✅ where the mutation dirties an area/object | ✅ | ✅ |
| **O4** server log | only for logged categories (Demolition, Money, Chat) | idem | idem |
| **O5** no pathology | always | always | always |
| **O6** persistence | always | always | always |

**Consequence:** roughly 30 rows (most of Family 2) are transport **B** and therefore have **no wire acknowledgement at all**. For those, O2 is not a nice-to-have — it is the *only* thing standing between "the mutation worked" and "the frame vanished into the void". Every B-row must re-read the property and **compare to the requested value**.

### 2.1 The built-in "confirmation" is NOT an oracle (verified)

`setBuildingProperty` performs its own read-back after every property mutation, and the campaign must not trust it:

```ts
const readValues = await ctx.cacherGetPropertyList(verifyObjectId, [propertyToRead]);
const newValue = readValues[0] || value;   // ← falls back to the value we ASKED for
return { success: true, newValue };        // ← success is unconditional
```
— `src/server/session/building-property-handler.ts:184-188`

`success: true` is returned on every path that does not throw, and when the read-back comes back empty the handler echoes the *requested* value. A mutation the server silently dropped is therefore indistinguishable, in the UI, from one that applied. **O2 must be performed independently by the campaign** (re-open the inspector in a fresh cacher object, or re-read in the next session for O6), never by reading the mutation response's `newValue`.

---

## 3. Verified defects that weaken the oracles

Found by direct source reading during matrix construction. Each one is both a **bug to file** and a **constraint on how its row can be validated**.

| ID | Defect | Evidence | Consequence for the campaign |
|---|---|---|---|
| **D-A** | `placeBuilding` extracts the new building id with `/sel (\d+)/` applied to the **answer** payload. An RDO answer is `A<rid> res="#0";` — it never contains `sel`. `buildingId` is therefore `null` even on success. | `building-templates-handler.ts:535-544` | The placement response cannot identify what we placed. **The registry must key on coordinates and re-resolve the object id by focusing the tile.** Validates the coords-first registry design. |
| **D-B** | `deleteFacility` awaits `RDODelFacility` and only *logs* the result — the returned error code is never parsed; the function returns `success: true` unconditionally. | `building-management-handler.ts:343-357` | **O1 is unusable for row #3** despite it being transport A. Demolition can only be confirmed by O2 (tile re-read) + O4 (`Demolition` server log). |
| **D-C** | Wage editor: `WORKFORCE_GROUP` maps `'Salaries' → {command:'RDOSetSalaries', allSalaries:true}` but `resolveRdoCommand` only honours `indexed`, never `allSalaries`. `Salaries0` falls through to the pass-through and is emitted as `call Salaries0 "*" "#500"` — a member that does not exist. | `template-groups.ts:403` + `property-utils.ts:39-50, 69` (`allSalaries` is declared at `property-definitions.ts:177` and read nowhere) | Row #15 is **expected to fail**. The campaign confirms it: O2 must show the wage unchanged while the UI reports success. |
| **D-D** | Unknown-member fallback is silent: any unmapped `propertyName` reaches the final `else` and is sent verbatim as an RDO call. There is no allow-list. | `building-property-handler.ts:169-175` | Masks D-C and any future typo. **Campaign-wide invariant:** if O1 (where available) and O2 disagree, or O2 shows no change on a "successful" mutation, suspect this class. |
| **D-E** | *(cleared — not a defect)* `JoinChannel`/`GetChannelInfo` pass an unquoted `'^'` separator, but `RdoProtocol.format` quotes every separator unconditionally, so the emitted bytes are correct. | `chat-handler.ts:120,141` vs `rdo.ts:373-376` | Cosmetic code inconsistency only. Row #70 is still untested, but it is not a bug hunt. |

---

## 4. Verified wire shapes (spot-checked against source, not transcribed)

| Row | Emitted frame | Verified at |
|---|---|---|
| #1 place | `C <rid> sel <worldContextId> call NewFacility "^" "%<class>","#<companyId>","#<x>","#<y>";` | `building-templates-handler.ts:525-532` |
| #3 demolish | `C <rid> sel <worldId> call RDODelFacility "^" "#<x>","#<y>";` — note `worldId`, **not** the building's CurrBlock | `building-management-handler.ts:343-350` |
| #4 rename | `C <rid> sel <buildingId> set Name="%<new>";` on the construction socket, SLOW tier | `building-management-handler.ts:292-298` |
| Family 2 dispatch | `set` for `property`/`RDOAcceptCloning`; sync `"^"` for `RDOConnectInput`/`RDOConnectOutput` only; everything else fire-and-forget `"*"` | `building-property-handler.ts:147-175` |
| Target binding | `ObjectId` for exactly 10 members (`RDOSetOutputPrice`, `RDOSetInputOverPrice`, `RDOSetInputMaxPrice`, `RDOSetInputMinK`, `RDOConnect/DisconnectInput`, `RDOConnect/DisconnectOutput`, `RDOConnect/DisconnectFromTycoon`); `CurrBlock` otherwise. Differs only on warehouses. | `building-property-handler.ts:125-129` |
| Both ids | resolved per mutation from the cacher: `CurrBlock` + `ObjectId` read at the tile | `building-property-handler.ts:53-70` |
| #74 road | one `CreateCircuitSeg "^" #1,#owner,#x1,#y1,#x2,#y2,#cost` **per segment**, cost = tiles × `ROAD_COST_PER_TILE` | `road-handler.ts:173-205` |

---

## 5. Execution plan — dependency-ordered phases

Rows cannot run in catalog order. Each phase's output is the next phase's precondition.

| Phase | Goal | Rows | Gate |
|---|---|---|---|
| **P0** Recon | Login, clock calibration (§4 of campaign doc), registry reconciliation, free-land discovery, **read-only** map/inspector sweep. No mutation. | — | none |
| **P1** Zero-precondition | The rows needing nothing: chat send/join, mail send-to-self + delete, camera cookie, profile ASP toggles, vote. Cheapest way to exercise transports A/B/C and prove the correlator works end-to-end before spending anything. | 52, 54, 58, 61–72 | none |
| **P2** Keystone placement | Place the approved cheap facility (Q2) on approved land (Q3). Register coords immediately; **re-resolve the object id by focusing the tile** (D-A). This single row unlocks 24 others. | 1 | Q1+Q2+Q3 |
| **P3** Own-facility lifecycle | Rename via both paths (compare targets), open/close, accept-cloning toggle, clone settings. | 4, 5, 9, 10, 25 | P2 |
| **P4** Value mutations | Per placed facility kind, sweep its exposed settings. Batch by building type — placing one facility of a kind then sweeping all its rows is far cheaper than one placement per row. | 13–38 (kind-dependent) | P2, per-kind |
| **P5** Upgrades & repair | Upgrade/downgrade/stop; repair rows only if a damaged facility can be obtained (may be unreachable — see §7). | 6, 7, 8, 11, 12 | P2 + MONEY |
| **P6** Connections | Needs two facilities with compatible fluids, or a nominated counterparty (Q6). The two sync rows (#39/#41) are SLOW — 5–30 s server recompute. | 39–45 | P2 ×2 or Q6 |
| **P7** Teardown | Demolish everything in the registry. **Last per building**, since it destroys the precondition of P3–P6. O1 is unusable here (D-B) → O2 + O4. | 3 | P2..P6 done |
| **PR** Role track | Roads, zones, town tax, capitol, ministers — only if Q11 grants a privileged account; otherwise declared L2-only. | 2, 16, 46–51, 74–77 | Q11 |
| **PD** Destructive track | Company creation, one controlled run, explicit sign-off only. | 53 | Q5+Q9 |

**Batching rule:** a session runs one phase slice, sequentially, within the §7 budget of the campaign doc — never interleaving phases, because a failure in an early phase invalidates the preconditions of later ones.

### 5.1 The build catalogue is not enumerable offline — P0 must fetch it

Verified: the BuildMenu is **scraped from legacy ASP HTML**, not from CLASSES.BIN. Categories come from `Build/KindList.asp`, facility cards from `Build/FacilityList.asp`, and the class string handed to `NewFacility` is read out of the card's `info="…&FacilityClass=XXX…"` attribute (`building-templates-handler.ts:188-278, 337-347, 394`). Consequences:

- **The list of placeable classes depends on the server's answer** for the requested `Cluster/Kind/Folder/TycoonLevel` tuple — it cannot be listed from the repo.
- **Cost is known before placing, but only because the HTML says so** (`building-templates-handler.ts:440-446`); if the markup drifts or the page is unreachable the cost silently becomes `0` with no error path. CLASSES.BIN carries **no cost field** (verified against the shipped 866-class binary: `[General]` only ever holds `xSize, ySize, Zone, Urban, FacId, Animated, Selectable, Accident`).
- Only **two** `facilityClass` strings in the repo are capture-proven to be accepted by `NewFacility`: `PGISupermarketC` and `PGIGeneralHeadquarterSTA`. The legacy `BUILDING_VISUALCLASS_REFERENCE.md` names are **not** a safe substitute (it says `PGIGeneralHeadquarter`; the wire capture says `PGIGeneralHeadquarterSTA`).
- The client enforces **no** cash check, **no** tycoon-level check and **no** dependency/HQ-first rule. Availability is purely the server's `available="0|1"` attribute; everything else is decided server-side and reported as a bare result code (`res="#0"` success, `res="#33"` rejected).

**Therefore P0 gains a mandatory step:** fetch `FacilityList.asp` for the campaign's cluster and read the real per-card prices. That is the only price oracle that exists, and it is what makes a *proposed* safe-palette possible (campaign doc Q2).

### 5.2 Building palette → rows unlocked (the P4 batching plan)

Tab sets are ground truth from CLASSES.BIN `[InspectorInfo]` → `registerInspectorTabs()` → `HANDLER_TO_GROUP` (`template-groups.ts:1088-1124`). Placing one facility of a kind unlocks its whole column — this is why P4 batches by kind rather than by row.

| Probe facility (VisualClassId) | Zone | Footprint | Rows unlocked |
|---|---|---|---|
| **Store / service** — PGIFoodStore (4602), ClothesStore (4632) | blue / Commercial | **1×1** | 13 service price · 15 wages *(the D-C defect)* · 17, 18, 19, 20 inputs · 6–10 upgrade/clone · 25 stopped · 4, 5 rename · 3 demolish |
| **School** (4812) | green / Civics | 2×2 | 15 wages **isolated** (no price/product noise) · 25 · 6–8 |
| **Small farm** (4116) / **Mine** (4126) | yellow / Industrial | 4×4 / 3×3 | 14 output price · 21 trade level · 22 trade role · 41/42 connect-clients · 39/40 suppliers |
| **Residential** (any) | red / Residential | 2×2 | 26 rent · 27 maintenance · 11/12 repair *(control exists here — still needs actual damage)* |
| **Bank** (2262) | orange / Offices | 2×2 | 23 loan budget % · 28 interest · 29 term |
| **Warehouse** (532/542) | yellow / Industrial | 4×4 | 24 ware checklist · 21 trade level |
| **TV station** (1982) | blue / Commercial | 3×3 | 30 hours on air · 31 commercials |
| **Movie studio** (5242) | orange / Offices | **8×8** | 32–36 auto-produce/release, launch/cancel/release movie |
| **HQ** — PGIGeneralHeadquarterSTA (602) | blue / Commercial | 3×3 · **$8,000K (real capture)** | 37 queue research · 38 cancel research |
| **Town Hall** (1500/2500/3500/4500) | — | — | 16, 46 — **ROLE:mayor** |
| **Capitol** (152) | — | — | 47–51 — **ROLE:pres** |

Placement-validation rules the client does apply (`placement-validation.ts:33-64`): a placement is blocked only if **all** footprint tiles are the wrong zone (tile zone 0 = "no zone" always passes); **any** RESERVED tile blocks; **any** collision blocks. Footprint comes from CLASSES.BIN by VisualClassId and **silently defaults to 1×1 when the id is missing from the cache** — a placement-ghost/reality mismatch worth watching during P2.

> Recorded discrepancy to settle live: `BUILDING_VISUALCLASS_REFERENCE.md:126-130` calls the stores 2×2, the shipped classes.bin says 1×1. The WebClient follows classes.bin, so the ghost will draw 1×1. If the server rejects a 1×1 placement on a 2×2 building, that is a real finding.

---

## 6. The catalog — 78 mutations

### Family 1 — Building lifecycle (12)

| # | Mutation | Tr | RDO member (target) | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 1 | Place building | A | `NewFacility` (worldContextId) | MONEY | V0,V1(edge coords),V4,V6 | todo |
| 2 | Place Capitol | A | `NewFacility %Capitol,#1` (worldContextId) | ROLE:pres | V0 | todo |
| 3 | Demolish building | A | `RDODelFacility` (worldId) | OWN:any | V0,V3,V4(double),V5 | todo |
| 4 | Rename — inspector title | A | `set Name` (buildingId) | OWN:any | V0,V2,V3 | todo |
| 5 | Rename — generic editor | B | `set Name` (CurrBlock) | OWN:any | V0,V2 — ⚠ compare target id vs #4 | todo |
| 6 | Start N upgrades | B | lock `set RDOAcceptCloning` → `RDOStartUpgrades` (ObjectId) | OWN + MONEY | V0,V1(0/max),V4 | todo |
| 7 | Stop upgrade | B | `RDOStopUpgrade` (ObjectId) | #6 in flight | V0,V4 | todo |
| 8 | Downgrade | B | `RDODowngrade` (ObjectId) | UpgradeLevel>0 | V0 | todo |
| 9 | Clone settings to facilities | B | `CloneFacility` (worldContextId) | OWN ×2 — ⚠ no wire test today | V0,V1(bitmask) | todo |
| 10 | Toggle accept-cloning | B | `set RDOAcceptCloning` (CurrBlock) | OWN — ⚠ no wire test today | V0 | todo |
| 11 | Start repair | B | `RdoRepair` (CurrBlock) | damaged facility — see §7 | V0 | todo |
| 12 | Stop repair | B | `RdoStopRepair` (CurrBlock) | #11 active | V0 | todo |

### Family 2 — Facility values (26) — all transport B except where noted ⇒ **O2 mandatory, O1 unavailable**

| # | Mutation | Tr | RDO member (target) | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 13 | Service price | B | `RDOSetPrice #i,#p` (CurrBlock) | OWN:service | V0,V1,V4 | todo |
| 14 | Output/product price | B | `RDOSetOutputPrice %fluid,#p` (ObjectId) | OWN:producer | V0,V1,V2(fluidId) | todo |
| 15 | **Wages / salaries** | B | `RDOSetSalaries` (CurrBlock) | OWN:employer | V0 — **expected FAIL, defect D-C** | bug:D-C |
| 16 | Town minimum wage | B | `RDOSetMinSalaryValue` (CurrBlock) | ROLE:mayor | V0,V1 | todo |
| 17 | Company input demand % | B | `RDOSetCompanyInputDemand #i,#r` (CurrBlock) | OWN:consumer | V0,V1 | todo |
| 18 | Input max price | B | `RDOSetInputMaxPrice %fluid,#p` (ObjectId) | OWN:consumer | V0,V1,V2 | todo |
| 19 | Input min quality | B | `RDOSetInputMinK %fluid,#k` (ObjectId) | OWN:consumer | V0,V1 | todo |
| 20 | Supplier over-price | B | `RDOSetInputOverPrice %fluid,#i,#op` (ObjectId) | OWN:consumer + connection | V0,V1 | todo |
| 21 | Trade level | B | `RDOSetTradeLevel #l` (CurrBlock) | OWN:industry/wh | V0,V1(enum bounds) | todo |
| 22 | Trade role | B | `RDOSetRole #r` (CurrBlock) | OWN:industry | V0,V1 | todo |
| 23 | Bank loan budget % | B | `RDOSetLoanPerc #p` (CurrBlock) | OWN:bank | V0,V1 | todo |
| 24 | Warehouse ware on/off | B | `RDOSelectWare #i,#(-1\|0)` (CurrBlock) | OWN:warehouse | V0,V4(toggle-all) | todo |
| 25 | Open / close building | B | `set Stopped` (CurrBlock) | OWN:any — ⚠ no test | V0,V4 | todo |
| 26 | Residential rent | B | `set Rent` (CurrBlock) | OWN:residential | V0,V1 | todo |
| 27 | Residential maintenance | B | `set Maintenance` (CurrBlock) | OWN:residential | V0,V1 | todo |
| 28 | Bank interest rate | B | `set Interest` (CurrBlock) | OWN:bank — ⚠ no test | V0,V1 | todo |
| 29 | Bank loan term | B | `set Term` (CurrBlock) | OWN:bank — ⚠ no test | V0,V1 | todo |
| 30 | TV hours on air | B | `set HoursOnAir` (CurrBlock) | OWN:tv — ⚠ no test | V0,V1 | todo |
| 31 | TV commercials | B | `set Comercials` (CurrBlock) | OWN:tv — ⚠ no test | V0,V1 | todo |
| 32 | Auto-produce toggle | B | `RDOAutoProduce #(-1\|0)` (CurrBlock) | OWN:studio | V0 | todo |
| 33 | Auto-release toggle | B | `RDOAutoRelease #(-1\|0)` (CurrBlock) | OWN:studio | V0 | todo |
| 34 | Launch movie | B | `RDOLaunchMovie %n,@budget,#m,#info` (CurrBlock) | OWN:studio + MONEY | V0,V1(@double!),V2(title) | todo |
| 35 | Cancel movie | B | `RDOCancelMovie` (CurrBlock) | #34 active | V0 | todo |
| 36 | Release movie | B | `RDOReleaseMovie` (CurrBlock) | #34 active | V0 | todo |
| 37 | Queue research | B | `RDOQueueResearch %inv,#prio` (CurrBlock) | OWN:hq/lab | V0,V2 | todo |
| 38 | Cancel research | B | `RDOCancelResearch %inv` (CurrBlock) | #37 queued | V0 | todo |

> Row 34 is the campaign's only `@` (double) argument — the one live exercise of the double-encoding path. Worth V1 with a non-round value.

### Family 3 — Economic connections (7)

| # | Mutation | Tr | RDO member (target) | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 39 | Connect suppliers | **A** | `RDOConnectInput %fluid,%coords` (ObjectId) — SLOW 5–30 s | PAIR | V0,V2(trailing comma!),V4 | todo |
| 40 | Disconnect supplier | B | `RDODisconnectInput` (ObjectId) | #39 | V0 | todo |
| 41 | Connect clients | **A** | `RDOConnectOutput %fluid,%coords` (ObjectId) — SLOW | PAIR | V0,V2,V4 | todo |
| 42 | Disconnect client | B | `RDODisconnectOutput` (ObjectId) | #41 | V0 | todo |
| 43 | Connect all of a kind | B | `RDOConnectToTycoon #t,#kind,#-1` (ObjectId) | OWN ×2 same kind | V0 | todo |
| 44 | Disconnect all of a kind | B | `RDODisconnectFromTycoon` (ObjectId) | #43 | V0 | todo |
| 45 | Connect two by map click | A | `ObjectAt`×2 → `ConnectFacilities` (worldContextId) | OWN ×2 — ⚠ **zero test coverage** | V0,V3(click empty tile) | todo |

### Family 4 — Civic / political (7)

| # | Mutation | Tr | RDO member (target) | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 46 | Town tax rate (Town Hall) | B | `RDOSetTaxValue #taxId,%pct` (CurrBlock) | ROLE:mayor | V0,V1 | todo |
| 47 | Town tax (Capitol table) | B | `RDOSetTownTaxes #i,#v` (CurrBlock) | ROLE:pres | V0,V1 | todo |
| 48 | Ministry budget | B | `RDOSetMinistryBudget #id,%b` (CurrBlock) | ROLE:pres (Agri sub-scope? Q11) | V0,V1 | todo |
| 49 | Depose minister | B | `RDOBanMinister #id` (CurrBlock) | ROLE:pres | V0 | todo |
| 50 | Appoint minister | B | `RDOSitMinister #id,%name` (CurrBlock) | ROLE:pres | V0,V2 | todo |
| 51 | Appoint mayor | B | `RDOSitMayor %town,%tyc` (CurrBlock) | ROLE:pres | V0,V2 | todo |
| 52 | Cast vote | A | `RDOVote %voter,%cand` (CurrBlock) | LIVE | V0,V2,V4(double-vote) | todo |

### Family 5 — Company / tycoon / finances (16)

| # | Mutation | Tr | Member / endpoint | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 53 | Create company | A | `NewCompany %name,%cluster` (worldContextId) | DESTRUCT | V0,V2(accents in name) | todo |
| 54 | Persist camera cookie | B | `SetTycoonCookie` (worldContextId) — automatic at logoff | LIVE | V0 + O6 | todo |
| 55 | Bank: borrow loan | C | ASP `TycoonBankAccount.asp` | MONEY | V0,V1 | todo |
| 56 | Bank: send money | C | ASP `TycoonBankAccount.asp` (send) | MONEY + recipient | V0,V1 — **O4 `Money` log** | todo |
| 57 | Bank: pay off loan | C | ASP `TycoonBankAccount.asp` (payoff) | #55 | V0 | todo |
| 58 | Set diplomatic policy | C | ASP `TycoonPolicy.asp` | LIVE — ⚠ no test | V0 | todo |
| 59 | Reset account | C | ASP `rdoResetTycoon.asp` | DESTRUCT — wipes the account | — | **excluded** |
| 60 | Abandon political role | C | ASP `abandonRole.asp` | DESTRUCT — loses the Minister precondition | — | **excluded** |
| 61 | Request level upgrade | C | ASP `rdoSetAdvanceLevel.asp` | LIVE — ⚠ no test | V0 | todo |
| 62 | Rebuild links | C | ASP `links.asp` | LIVE — ⚠ no test | V0 | todo |
| 63 | Add default supplier | C | ASP `AddDefaultSupplier.asp` | LIVE — ⚠ no test | V0 | todo |
| 64 | Delete default supplier | C | ASP `DeleteDefaultSupplier.asp` | #63 | V0 | todo |
| 65 | Toggle hire trade center | C | ASP `ModifyTradeCenterStatus.asp` | LIVE — ⚠ no test | V0 | todo |
| 66 | Toggle only-warehouses | C | ASP `ModifyWarehouseStatus.asp` | LIVE — ⚠ no test | V0 | todo |
| 67 | Launch political campaign | C | ASP `tycooncampaign.asp?Launch` | LIVE — ⚠ no test | V0 | todo |
| 68 | Cancel political campaign | C | ASP `tycooncampaign.asp?Cancel` | #67 | V0 | todo |

### Family 6 — Communication (5)

| # | Mutation | Tr | Member | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 69 | Send chat message | A | `SayThis %"",%msg` (worldContextId) | LIVE | V0,**V2 (the Latin-1 live test)**,V4 | todo |
| 70 | Join chat channel | A | `JoinChannel` (worldContextId) | LIVE — ⚠ no test (D-E cleared) | V0 | todo |
| 71 | Send mail | A | `NewMail→AddHeaders→AddLine→Post→CloseMessage` (mail socket) | LIVE (to self) | V0,V2,V4 | todo |
| 72 | Delete mail | B | `DeleteMessage` (mail socket) | #71 | V0 | todo |
| 73 | GM broadcast | — | WS fan-out, no RDO | ROLE:gm | V0 | todo |

### Family 7 — Map / terrain (4)

| # | Mutation | Tr | RDO member (target) | Unlock | Variants | Status |
|---|---|---|---|---|---|---|
| 74 | Build road (per segment) | A | `CreateCircuitSeg` ×N (worldContextId) | ROLE:mayor + MONEY | V0,V1(diagonal staircase),V4 | todo |
| 75 | Demolish one road tile | A | `BreakCircuitAt` (worldContextId) | ROLE:mayor | V0,V3(empty tile) — ⚠ **code 0 ambiguous ⇒ O2 mandatory** | todo |
| 76 | Demolish road area | A | `WipeCircuit` (worldContextId) | ROLE:mayor — ⚠ **zero test coverage** | V0,V1(inverted rect) | todo |
| 77 | Define zone | A | `DefineZone` (worldContextId) | ROLE:mayor | V0,V1(inverted rect) | todo |

### Family 8 — Escape hatch (1)

| # | Mutation | Tr | Member | Unlock | Status |
|---|---|---|---|---|---|
| 78 | Arbitrary RDO (`REQ_RDO_DIRECT`) | A | user-supplied | **L2-ONLY** — never live (risk C9; no UI caller) | **excluded** |

---

## 7. Scope roll-up and what 100 % can mean

| Bucket | Count | Notes |
|---|---|---|
| **LIVE now** — no precondition | 18 | P1 phase; the campaign's proving ground for the correlator |
| **MONEY-gated** | 7 | Depth set by Q1/Q2 |
| **OWN-gated** — needs a placed facility | 24 | All downstream of row #1; batch per building kind |
| **PAIR-gated** — needs a counterparty | 7 | Q6 |
| **ROLE-gated** (mayor 6 · pres 6 · gm 1) | 13 | Live only if Q11 grants an account; else declared L2-only |
| **DESTRUCT** | 3 | #59/#60 excluded by default, #53 one controlled run |
| **L2-ONLY** | 1 | #78 |

**Rows at risk of being unreachable live even with full authorization** (candidates for declared exclusion, to confirm with the developer):
- **#11/#12 repair** — requires a *damaged* facility. Damage arises from simulation events we cannot summon on demand. Likely L2-only.
- **#35/#36 movie cancel/release** and **#38 research cancel** — require a long-running activity to be in flight; feasible but slow (may span sessions, which is fine: the registry persists).
- **#8 downgrade** — needs `UpgradeLevel > 0`, i.e. #6 must complete first, which costs money and game time.
- **#56 send money** — needs a willing recipient; the `Money` log makes it the single most cleanly correlatable row in the campaign, so it is worth arranging (Q1/Q6).

**Honest definition of done:** every LIVE/MONEY/OWN/PAIR row reaches `adversarial`, every ROLE/DESTRUCT/L2 row is either run or carries a written exclusion naming its L2-mock home. Claiming "100 %" without that exclusion list would be a lie by omission — §5 of the campaign doc requires it in the final report.
