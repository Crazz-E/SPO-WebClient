# RDO Protocol Typing System

## Overview

The RDO (Remote Data Objects) protocol uses type prefixes to identify data types in commands and responses. This document describes the type-safe TypeScript implementation for handling RDO values and commands.

## Type Prefixes

The RDO protocol defines 7 type prefixes:

| Prefix | Type Name     | TypeScript Type | Description                    |
|--------|---------------|-----------------|--------------------------------|
| `#`    | OrdinalId     | `number`        | Integer values                 |
| `$`    | StringId      | `string`        | Short string identifiers       |
| `^`    | VariantId     | `string/number` | Variant type (mixed) — see note below |
| `!`    | SingleId      | `number`        | Float (single precision)       |
| `@`    | DoubleId      | `number`        | Double (double precision)      |
| `%`    | OLEStringId   | `string`        | Wide string (most common)      |
| `*`    | VoidId        | `void`          | Void/no return value           |

> **`^` on the wire:** in every live capture, `^` appears only as the **empty method separator** `"^"`
> (return-value marker) — no capture contains a value-carrying `^text` literal. `RdoValue.variant()` exists
> for API completeness; conformity-first code should not emit `^<value>` arguments. See
> [rdo-protocol-architecture.md §2.1/§8.5](rdo-protocol-architecture.md).

## Module: `rdo-types.ts`

Located at: [src/shared/rdo-types.ts](../src/shared/rdo-types.ts)

This module provides three main APIs:

1. **RdoValue** - Creating typed RDO values
2. **RdoParser** - Parsing RDO formatted strings
3. **RdoCommand** - Building RDO commands

---

## 1. RdoValue API

### Creating Typed Values

Use static factory methods to create type-safe RDO values:

```typescript
import { RdoValue } from '../shared/rdo-types';

// Integer (OrdinalId)
RdoValue.int(42);           // → "#42"
RdoValue.int(-100);         // → "#-100"

// Wide String (OLEStringId) - most common for text
RdoValue.string("hello");   // → "%hello"
RdoValue.string("ROOT");    // → "%ROOT"

// String Identifier (StringId)
RdoValue.stringId("ID123"); // → "$ID123"

// Float (SingleId)
RdoValue.float(3.14);       // → "!3.14"

// Double (DoubleId)
RdoValue.double(2.71828);   // → "@2.71828"

// Variant (VariantId)
RdoValue.variant("text");   // → "^text"
RdoValue.variant(123);      // → "^123"

// Void (VoidId)
RdoValue.void();            // → "*"
```

### Formatting Values

```typescript
const price = RdoValue.int(220);
console.log(price.format());  // "#220"
console.log(price.value);     // 220
console.log(price.prefix);    // '#'
```

### Example: Building Arguments

```typescript
// Old way (error-prone)
const args = [`"#0"`, `"#220"`];

// New way (type-safe)
const args = [
  RdoValue.int(0),
  RdoValue.int(220)
];
const formatted = args.map(a => a.format()).join(',');
// → "#0","#220"
```

---

## 2. RdoParser API

### Extracting Values

Parse RDO formatted strings to extract type prefix and value:

```typescript
import { RdoParser } from '../shared/rdo-types';

// Extract prefix and value
RdoParser.extract("#42");
// → { prefix: '#', value: '42' }

RdoParser.extract("%hello");
// → { prefix: '%', value: 'hello' }

// Get only the value (without prefix or quotes)
RdoParser.getValue("#42");     // → '42'
RdoParser.getValue("%hello");  // → 'hello'

// Get only the prefix
RdoParser.getPrefix("#42");    // → '#'
```

### Type Checking

```typescript
import { RdoParser, RdoTypePrefix } from '../shared/rdo-types';

const value = "#42";
if (RdoParser.hasPrefix(value, RdoTypePrefix.INTEGER)) {
  const num = RdoParser.asInt(value);  // 42
}
```

### Conversion Helpers

```typescript
// Parse as specific types
RdoParser.asInt("#42");       // → 42
RdoParser.asFloat("!3.14");   // → 3.14
RdoParser.asString("%hello"); // → "hello"
```

---

## 3. RdoCommand API

### Builder Pattern for Commands

Construct complex RDO commands using a fluent builder API:

```typescript
import { RdoCommand, RdoValue } from '../shared/rdo-types';

// Simple push command (no return value)
const cmd = RdoCommand.sel(worldId)
  .call('ClientAware')
  .push()
  .build();
// → "C sel 12345 call ClientAware "*" ;"

// Command with arguments
const cmd = RdoCommand.sel(worldId)
  .call('SetLanguage')
  .push()
  .args(RdoValue.int(0))
  .build();
// → "C sel 12345 call SetLanguage "*" "#0";"

// Method call with return value
const cmd = RdoCommand.sel(worldId)
  .call('RDOSetPrice')
  .method()
  .withRequestId(1001)
  .args(RdoValue.int(0), RdoValue.int(220))
  .build();
// → "C 1001 sel 12345 call RDOSetPrice "^" "#0","#220";"
```

### Method Chaining

```typescript
RdoCommand.sel(targetId)      // Start with target
  .call('MethodName')          // Set method to call
  .push()                      // Use push separator ("*")
  // OR
  .method()                    // Use method separator ("^")
  .withRequestId(rid)          // Add request ID (optional)
  .args(...)                   // Add arguments
  .build()                     // Generate final string
```

### Arguments

The `.args()` method accepts:
- `RdoValue` objects (recommended)
- `number` (auto-converted to `RdoValue.int()`)
- `string` (auto-converted to `RdoValue.string()`)

```typescript
// All equivalent
.args(RdoValue.int(42), RdoValue.string("hello"))
.args(42, "hello")
.args(RdoValue.int(42), "hello")
```

---

## 4. Helper Functions

### `rdoArgs()`

Convert mixed values to RdoValue array:

```typescript
import { rdoArgs, RdoValue } from '../shared/rdo-types';

// Automatically detects types from prefixed strings
const args = rdoArgs('#42', '%hello', RdoValue.float(3.14), 100);
// → [RdoValue.int(42), RdoValue.string('hello'), RdoValue.float(3.14), RdoValue.int(100)]

// Format for protocol transmission
const formatted = args.map(a => a.format()).join(',');
// → "#42","%hello","!3.14","#100"
```

---

## 5. Practical Examples

### Example 1: Construction-Service Logon (fire-and-forget push)

> This is the **construction/map service** logon (`RDOLogonClient`), which really is fire-and-forget
> (`"*"`, no QueryId) — mirrors `spo_session.ts` `connectConstructionService()`. Do NOT confuse it with
> the **world login** (`AccountStatus` + `Logon "^"` WITH a QueryId, [rdo-protocol-architecture.md §5.2](rdo-protocol-architecture.md#52-complete-login-sequence-world--interface-server)),
> which goes through `sendRdoRequest()` because it must capture the returned ClientView id.

```typescript
// Old way
const logonCmd = `C sel ${worldId} call RDOLogonClient "*" "%${username}","%${password}";`;

// New way
const logonCmd = RdoCommand.sel(worldId)
  .call('RDOLogonClient')
  .push()
  .args(
    RdoValue.string(username),
    RdoValue.string(password)
  )
  .build();
```

### Example 2: Building Placement

```typescript
// Old way
const args = [`%${facilityClass}`, '#28', `#${x}`, `#${y}`];

// New way (using rdoArgs helper)
const args = rdoArgs(
  `%${facilityClass}`,  // Automatically parsed
  '#28',                 // Automatically parsed
  `#${x}`,              // Automatically parsed
  `#${y}`               // Automatically parsed
);

// Or explicit (more readable)
const args = [
  RdoValue.string(facilityClass),
  RdoValue.int(28),
  RdoValue.int(x),
  RdoValue.int(y)
].map(a => a.format());
```

### Example 3: Setting Building Properties

```typescript
// Old way
private buildRdoCommandArgs(command: string, value: string): string {
  switch (command) {
    case 'RDOSetPrice':
      return `"#0","#${value}"`;
    case 'RDOSetSalaries':
      return `"#${sal0}","#${sal1}","#${sal2}"`;
  }
}

// New way (type-safe)
private buildRdoCommandArgs(command: string, value: string): string {
  const args: RdoValue[] = [];

  switch (command) {
    case 'RDOSetPrice':
      args.push(RdoValue.int(0), RdoValue.int(parseInt(value, 10)));
      break;
    case 'RDOSetSalaries':
      args.push(
        RdoValue.int(parseInt(sal0, 10)),
        RdoValue.int(parseInt(sal1, 10)),
        RdoValue.int(parseInt(sal2, 10))
      );
      break;
  }

  return args.map(arg => arg.format()).join(',');
}
```

### Example 4: Unfocus Building

```typescript
// Old way
const unfocusCmd = `C sel ${worldContextId} call UnfocusObject "*" "#${buildingId}";`;
socket.write(unfocusCmd);

// New way
const unfocusCmd = RdoCommand.sel(worldContextId)
  .call('UnfocusObject')
  .push()
  .args(RdoValue.int(parseInt(buildingId)))
  .build();
socket.write(unfocusCmd);
```

---

## 6. Migration Guide

### Step 1: Replace Manual String Construction

**Before:**
```typescript
const cmd = `C sel ${id} call Method "*" "#${value}";`;
```

**After:**
```typescript
const cmd = RdoCommand.sel(id)
  .call('Method')
  .push()
  .args(RdoValue.int(value))
  .build();
```

### Step 2: Replace Argument Arrays

**Before:**
```typescript
args: [`"#${index}"`, `"#${value}"`]
```

**After:**
```typescript
args: [RdoValue.int(index), RdoValue.int(value)]
```

### Step 3: Use RdoParser for Extraction

**Before:**
```typescript
// Manual prefix stripping
let cleaned = token.trim();
if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
  cleaned = cleaned.substring(1, cleaned.length - 1);
}
if (cleaned.startsWith('#')) {
  const value = cleaned.substring(1);
}
```

**After:**
```typescript
const { prefix, value } = RdoParser.extract(token);
```

---

## 7. Benefits

### Type Safety
- TypeScript compiler catches type mismatches
- No more manual string concatenation errors
- IntelliSense support in IDEs

### Readability
- Self-documenting code (`RdoValue.int(42)` vs `"#42"`)
- Clear intent with builder pattern
- Chainable method calls

### Maintainability
- Centralized type handling logic
- Single source of truth for type prefixes
- Easy to extend with new types

### Debugging
- Better error messages
- Type information preserved
- Easier to trace value flow

---

## 8. Best Practices

0. **One form per intent (project convention, enforced by `assertNotVoidPush`)** —
   Void push → `writeRdoFrame(socket, RdoCommand...build())` (no QueryId, `"*"`).
   Synchronous call → `sendRdoRequest()` with `"^"` separator (QueryId).
   Do NOT combine `sendRdoRequest()` with `"*"`. Note: this is a **convention**, not a crash
   fact — the wire is tolerant (`"*"` + QueryId is acked `A<id> ;`, proven by live captures);
   what DOES risk crashing the server is `"^"` **without** a QueryId. Full matrix:
   [rdo-protocol-architecture.md §8.5](rdo-protocol-architecture.md#85-queryid--separator-matrix).

0b. **Booleans: emit `#-1`/`#0`, parse any non-zero as true** — `RdoValue.int(-1)` for true.
   Never "normalize" to `#1` on emission; never require `#-1` when parsing.
   See [rdo-protocol-architecture.md §2.2](rdo-protocol-architecture.md#22-boolean-encoding).

1. **Always use RdoValue for new code**
   ```typescript
   // Good
   RdoValue.int(42)

   // Avoid
   "#42"
   ```

2. **Use RdoCommand for building commands**
   ```typescript
   // Good
   RdoCommand.sel(id).call('Method').push().args(...).build()

   // Avoid
   `C sel ${id} call Method "*" ...;`
   ```

3. **Use RdoParser for parsing responses**
   ```typescript
   // Good
   const value = RdoParser.getValue(response);

   // Avoid
   const value = response.replace(/^"|"$/g, '').substring(1);
   ```

4. **Prefer explicit types over auto-conversion**
   ```typescript
   // Good (explicit)
   .args(RdoValue.int(42), RdoValue.string("hello"))

   // OK (auto-converted)
   .args(42, "hello")
   ```

---

## 9. Implementation Status

### ✅ Completed
- Core `RdoValue` API with all type prefixes
- `RdoParser` for extracting values
- `RdoCommand` builder pattern
- `rdoArgs()` helper function
- Integration with `rdo.ts` (formatTypedToken, stripTypedToken)
- Migration of manual commands in `spo_session.ts`:
  - SetLanguage
  - ClientAware (2 calls)
  - UnfocusObject
  - RDOLogonClient
  - RDOStartUpgrades
  - RDOStopUpgrade
  - RDODowngrade
  - MsgCompositionChanged
  - buildRdoCommandArgs (all building property commands)

### 📝 Future Enhancements
- Extend `sendRdoRequest()` to accept `RdoValue` directly
- Add validation for value ranges (e.g., salary 0-250%)
- Add type guards for runtime type checking
- Create specialized builders for common command patterns

---

## 10. References

- Wire protocol reference: [rdo-protocol-architecture.md](rdo-protocol-architecture.md) (framing, verbs, response shapes, §8.5 QueryId×separator matrix)
- Session management: [rdo-session-lifecycle.md](rdo-session-lifecycle.md) (login, logoff, timeouts, KeepAlive, reconnection)
- Raw captures: [Mock_Server_scenarios_captures.md](Mock_Server_scenarios_captures.md), [building_details_rdo.txt](building_details_rdo.txt)
- Type Definitions: [src/shared/types.ts](../src/shared/types.ts)
- Implementation: [src/shared/rdo-types.ts](../src/shared/rdo-types.ts)
- Parser Integration: [src/server/rdo.ts](../src/server/rdo.ts)
- Usage Examples: [src/server/spo_session.ts](../src/server/spo_session.ts)

---

**Last Updated:** 2026-07-03 (doc-strategy audit — `^` wire note, construction-logon example clarified, orphaned `rdo_typing_examples.ts` removed: its runnable twins of §5 had drifted into non-conformant forms)
**Version:** 1.2.0
