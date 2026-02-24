---
name: rdo-protocol
description: "RDO protocol knowledge: conformity checklist, dispatch rules, type prefixes, wire format, and RdoCommand builder."
user-invokable: false
disable-model-invocation: false
---

# RDO Protocol

Auto-loaded when working on `spo_session.ts`, `rdo.ts`, `rdo-types.ts`, or any RDO command/protocol task.

## RDO Conformity Checklist (mandatory for new/modified RDO requests)

When adding or modifying RDO requests, follow ALL 8 steps:

1. **Look up method** in `doc/spo-original-reference.md` server object tables
   - If not indexed: search SPO-Original Delphi source (use `delphi-archaeologist` skill), then add the entry
2. **Verify verb**: `published property` → `get`/`set` | `published function/procedure` → `call`
   - TRAP: `get` on a function works (fallthrough in RDOObjectServer.pas:115) but is semantically WRONG
3. **Verify param types**: Match Delphi types → RDO prefixes (see table below)
4. **Verify param order & count**: Match the Delphi declaration exactly
5. **Verify separator**: `^` for call-with-return, `*` for void procedures
6. **Verify return type**: function → olevariant (check actual content prefix), procedure → void (`*`)
7. **Check push behavior**: Does the method trigger server pushes? (e.g., `RegisterEventsById` fires InitClient)
8. **Update reference**: Add any new discoveries to `doc/spo-original-reference.md`

## Dispatch Rules (from RDOObjectServer.pas)

| Delphi declaration | RDO verb | Separator | Response |
|--------------------|----------|-----------|----------|
| `published property Foo` | `get` / `set` | *(none)* | `res=<prefix><value>` |
| `published function Foo(params) : olevariant` | `call` | `^` between args | `res=<prefix><value>` |
| `published procedure Foo(params)` | `call` | `^` between args | `res=*` (void) |
| `published procedure Foo` (no params) | `call` | `*` | `res=*` (void) |

## Delphi Type → RDO Prefix Mapping

| Delphi type | RDO prefix | Notes |
|-------------|-----------|-------|
| `integer` | `#` | Ordinal |
| `wordbool` / `boolean` | `#` | `true` = -1, `false` = 0 |
| `widestring` | `%` | OLE string (most common) |
| `double` / `TDateTime` | `@` | 8-byte float |
| `single` | `!` | 4-byte float |
| `currency` | `@` | Stored as double |
| `string` (short) | `$` | Short string |
| olevariant return | varies | Check actual content |
| void (procedure) | `*` | No return value |

## Wire Format

Messages are `;`-terminated text over TCP:
```
Frame = <C|A> [<QueryId>] <Body> ";"
```
- `C` = Call (query), `A` = Answer (response)
- QueryId: decimal 0–65535, present for synchronous calls only
- Semicolons inside `"..."` are NOT terminators

## RdoCommand Builder (always use this, never construct strings manually)

```typescript
import { RdoValue, RdoCommand } from '@/shared/rdo-types';

const cmd = RdoCommand.sel(objectId)
  .call('MethodName').push()
  .args(RdoValue.int(42), RdoValue.string('hello'))
  .build();
```

## Error Codes (from ErrorCodes.pas -- authoritative)

| Code | Constant | Meaning |
|------|----------|---------|
| 0 | errNoError | Success |
| 1 | errMalformedQuery | Bad query syntax |
| 2 | errIllegalObject | Invalid object ID |
| 3 | errUnexistentProperty | Property not found |
| 4 | errIllegalPropValue | Bad property value |
| 5 | errUnexistentMethod | Method not found |
| 6 | errIllegalParamList | Wrong parameters |
| 7 | errIllegalPropType | Wrong property type |
| 8 | errQueryTimedOut | Timeout |
| 9 | errIllegalFunctionRes | Bad function result |
| 10 | errSendError | TCP send failure |
| 11 | errReceiveError | TCP receive failure |
| 12 | errMalformedResult | Corrupt response |
| 13 | errQueryQueueOverflow | Queue full |
| 14 | errRDOServerNotInitialized | Server not ready |
| 15 | errUnknownError | Unknown error |
| 16 | errNoResult | No result returned |
| 17 | errServerBusy | Server busy |

## Deep-Dive References

- [RDO Typing System API](../../../doc/rdo_typing_system.md) — RdoValue, RdoParser, RdoCommand full API
- [RDO Protocol Architecture](../../../doc/rdo-protocol-architecture.md) — Wire framing, dispatch internals
- [SPO-Original Reference Index](../../../doc/spo-original-reference.md) — Per-object Delphi method tables
