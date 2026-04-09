# src/shared/ — Shared Code (Server + Client)

## Protected File

`rdo-types.ts` -- NEVER modify without explicit discussion and approval. Changes here affect every RDO call in the project.

## RDO Type Prefixes

| Prefix | Enum | Meaning |
|--------|------|---------|
| `#` | INTEGER | OrdinalId (integer) |
| `$` | STRING | StringId (short identifier) |
| `%` | OLESTRING | Wide string |
| `@` | DOUBLE | Double precision float |
| `!` | FLOAT | Single precision float |
| `^` | VARIANT | Variant type (used in synchronous calls) |
| `*` | VOID | Void/no return (fire-and-forget) |

Always use the `RdoValue` fluent API (`RdoValue.int()`, `RdoValue.string()`, etc.) and `RdoCommand.build()`. Never construct RDO protocol strings manually.

## Type Modules

Modular types in `types/`:
- `protocol-types.ts` -- RDO packet, verb, action, session phase
- `domain-types.ts` -- game domain objects (buildings, companies, maps)
- `message-types.ts` -- WebSocket message types and payloads
- `building-data.ts` -- building categories, info, dimensions
- `zone-types.ts` -- zone type definitions

Barrel re-export via `types/index.ts` -> `types.ts` for backward compatibility. New code should import from the specific module in `types/`.

## Timeout Categories

`timeout-categories.ts` defines 4 tiers: FAST (15s), NORMAL (30s), SLOW (60s), VERY_SLOW (120s). Every new `sendRdoRequest()` call must specify the appropriate category.

## Error Handling

Always use `unknown` for catch block types + `toErrorMessage(err)` from `error-utils.ts`. Error codes are defined in `error-codes.ts`.

## Building Details

`building-details/` contains property schemas, templates, and civic building definitions. Property definitions specify input types (SELECT, SLIDER, SPINNER) with min/max/step limits. Template registration via `registerInspectorTabs()`.

## Testing

Tests co-located as `*.test.ts` in the same directory. Coverage thresholds are enforced per directory (shared: 54%, building-details: 92%, types: 96%). Thresholds can only go up.
