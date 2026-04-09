---
name: code-guardian
description: "TRIGGER: Before modifying any src/ file. Checks 5 real crash categories (RDO traps, singleton state, i/j swap, type coercion, push handler errors), coverage ratchet, and protected file manifest."
user-invokable: false
disable-model-invocation: false
---

# Code Guardian

Auto-loaded when modifying any source file in `src/`. Prevents the 5 real crash categories identified from git history analysis (265 commits, 30+ bug fixes).

## A. RDO Protocol Traps (SERVER CRASH RISK)

These mistakes crash the Delphi game server and affect ALL connected clients.

| Trap | Wrong | Right |
|------|-------|-------|
| Void push with QueryId | `sendRdoRequest(RdoCommand.build("*"))` | `socket.write(RdoCommand.build("*"))` |
| Concurrent RDO commands | `Promise.all([sendRdo(...), sendRdo(...)])` | Sequential `await sendRdo(...)` then `await sendRdo(...)` |
| Wrong separator | `"*"` for synchronous request | `"^"` for synchronous, `"*"` for void push only |

**Rule:** `sendRdoRequest()` adds a QueryId automatically. Void push (`"*"`) with QueryId crashes the server's FIVE layer. Always use `socket.write(RdoCommand.build())` for fire-and-forget.

**Rule:** Never use `Promise.all()` for concurrent RDO commands on the same socket. The Delphi server is single-threaded per connection.

**Rule:** `worldContextId` = world operations (map focus, queries); `interfaceServerId` = building operations. Mixing them up sends commands to the wrong server object.

**After any RDO change:** `npm test -- spo_session` and `npm test -- rdo`

## B. Zustand Selector Stability (INFINITE RE-RENDER RISK)

Zustand selectors that return new references on every call cause React error #185 (maximum update depth exceeded).

| Wrong | Right | Why |
|-------|-------|-----|
| `useStore((s) => s.data?.items ?? [])` | `useStore((s) => s.data?.items) ?? []` | Fallback INSIDE selector creates new `[]` ref every render |
| `useStore((s) => s.data?.obj ?? {})` | `useStore((s) => s.data?.obj) ?? {}` | Same: new `{}` ref every render |
| `useStore((s) => s.items.filter(...))` | `useMemo` on the filtered result | `.filter()` creates new array every render |

**Rule:** NEVER use `?? []`, `?? {}`, or `|| []` INSIDE a Zustand selector function. Move fallbacks OUTSIDE the selector.

**After any store/selector change:** Check for React error #185 pattern in the browser console.

## C. Regex & String Parsing (SILENT DATA LOSS RISK)

Silent truncation is worse than a parse error — the UI shows wrong data with no error.

| Trap | Example | Fix |
|------|---------|-----|
| Missing `_` in character class | `[A-Za-z0-9]` truncates `PGISRVCOMMON_AlienParkA` to `PGISRVCOMMON` | Use `[A-Za-z0-9_]` or `[\w]` |
| Mock HTML misses edge cases | Test with `<td>SimpleValue</td>` | Test with REAL server HTML captures from `__fixtures__/` |
| No length assertion | Regex silently returns partial match | Assert result length matches expected pattern |

**Key file:** `spo_session.ts` (80 commits, highest regex density in codebase).

**Rule:** When writing or modifying regex patterns, always test with real server data. Add assertions on result length/format to catch silent truncation.

**Rule:** `ClientFacilityDimensionsCache` is singleton — must `clear()` then `initialize()` in tests. Failing to reset causes cross-test contamination.

## D. Property Resolution Chains (SILENT FAILURE RISK)

Building property dispatch uses 3-level fallback: direct -> indexed -> columnSuffix. All levels must be tested.

| Level | Match Strategy | Example |
|-------|---------------|---------|
| 1. Direct | Exact match on `rdoCommands[propertyName]` | `"Revenue"` -> `rdoCommands.Revenue` |
| 2. Indexed | Strip trailing digits: `"Price0"` -> base `"Price"`, index `0` | `"Price0"` -> `rdoCommands.Price` + index arg |
| 3. ColumnSuffix | Split mid-index: `"Tax0Percent"` -> prefix `"Tax"`, index `0`, suffix `"Percent"` | `"Tax0Percent"` -> composite key `"TaxPercent"` |

**Rule:** Don't assume level 3 won't be hit. Always test all three resolution levels.

**Rule:** RDO arg types must match server expectations. `int` vs `string` vs `float` matters — the server will silently ignore wrong types.

**After property changes:** `npm test -- resolve-rdo-command`

## E. UI Handler Wiring (DEAD BUTTON RISK)

Every interactive UI element must have a complete action chain, not just render correctly.

**Forbidden patterns:**
- `onClick={() => {}}` — dead handler
- `onClick={() => console.log('TODO')}` — placeholder
- `onChange={undefined}` — uncontrolled without intent
- `// TODO: implement` in handler body

**Required trace for every new UI element:**
1. `onClick` / `onChange` / `onSubmit` handler defined
2. Handler calls store action or bridge method
3. Store action dispatches RDO command (if server-side)
4. Response handler updates store state
5. UI reflects the state change

**After adding UI elements:** Trace the full chain manually. If any link is missing, implement it — don't leave dead buttons.

## F. Sanctuarization Manifest (END-OF-SESSION)

Before considering any work session complete, verify ALL of these pass:

```bash
npx tsc --noEmit                          # server types
npm test                                   # all 3107+ tests (130 suites)
npm run build                              # full build (tsc + vite + esbuild)
```

**Invariants that must hold:**
1. All tests pass — zero failures, zero skipped
2. No new `any` types introduced (TypeScript strict mode enforces this)
3. No protected files modified without explicit developer discussion:
   - `src/shared/rdo-types.ts`
   - `src/server/rdo.ts`
   - `src/__fixtures__/*`
   - `jest.config.js` (coverage thresholds can only go UP)
4. All new UI elements have wired actions (Section E)
5. Coverage thresholds in `jest.config.js` are not lowered

**Known debt (do not regress further):**
- `src/client/client.ts` has 6 pre-existing TypeScript errors under `tsconfig.client.json` (TS1064, TS2353, TS2367). These are tracked for cleanup. Do not add more.
