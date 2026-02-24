# RDO Method Archaeology Checklist

> Load this resource when reverse-engineering RDO methods from Delphi source.
> Extends the 8-step conformity check in CLAUDE.md with concrete search procedures.

## Prerequisites

Before starting, check if the method is already indexed in `doc/spo-original-reference.md`.

---

## Step 1: Identify the Server Object

**Question:** Which Delphi class exposes the method?

| If the method is on... | Look in... |
|------------------------|-----------|
| Directory Server | `DServer/DirectoryServer.pas` → `TDirectoryServer`, `TDirectorySession` |
| Interface Server | `Interface Server/InterfaceServer.pas` → `TInterfaceServer`, `TClientView` |
| Model Server (core) | `Kernel/Kernel.pas` → `TFacility`, `TTycoon`, `TWorld`, `TTown` |
| Model Server (blocks) | `StdBlocks/*.pas` → `T[BlockType]` subclasses |
| Cache Server | `Cache/CacheAgent.pas` or `Cache Server/*.pas` |
| Session | `Interface Server/Sessions.pas` → `TSession` |
| Client callbacks | `Interface Server/InterfaceServer.pas` → `TModelEvents` |
| Mail | `Mail Server/*.pas`, `Mail/MailProtocol.pas` |

**Search pattern:**
```bash
# Find where a method name is declared (exclude backups)
grep -rn "RDOMethodName" --include="*.pas" "Kernel/" "Interface Server/" "DServer/" "StdBlocks/" | grep -v "\.~pas\|Copy of"
```

## Step 2: Verify the Member Kind

Read the declaration line. Determine kind and RDO verb:

| Delphi Code | Kind | RDO Verb |
|------------|------|----------|
| `published property Foo: type read Get write Set` | property | `get` / `set` |
| `published function Foo(...): OleVariant` | function | `call` (returns value) |
| `published procedure Foo(...)` | procedure | `call` (returns void `*`) |

**TRAP CHECK:** If existing WebClient code uses `get` on a `function`, flag it. `get` on a function falls through to `CallMethod` in `RDOObjectServer.pas:~115` but is semantically **WRONG**. It works by accident.

## Step 3: Extract Parameter Types

Read the full method signature. Map each parameter:

| Delphi Type | RDO Prefix | RdoValue Builder | Gotcha |
|-------------|-----------|------------------|--------|
| `integer` | `#` | `RdoValue.int(n)` | |
| `widestring` | `%` | `RdoValue.str(s)` | Most common string type in SPO |
| `double` | `@` | `RdoValue.double(d)` | |
| `single` | `!` | `RdoValue.float(f)` | Rare |
| `wordbool` | `#` | `RdoValue.int(-1)` / `RdoValue.int(0)` | true = -1, NOT 1 |
| `boolean` | `#` | `RdoValue.int(-1)` / `RdoValue.int(0)` | Same as wordbool |
| `currency` | `@` | `RdoValue.double(c)` | Marshaled as double |
| `string` (short) | `$` | `RdoValue.shortStr(s)` | Delphi short string, NOT widestring |

**Critical:** Parameter ORDER and COUNT must match the Delphi declaration exactly.

## Step 4: Determine Separator

| Scenario | Separator | Example |
|----------|-----------|---------|
| Function with return value | `^` between args | `call RDOFoo^#1^%name` |
| Procedure (void) | `*` at end | `call RDOBar*#1*%name*` |
| Property get (no params) | N/A | `get PropertyName` |
| Property set (one value) | N/A | `set PropertyName #42` |

Reference: `Rdo/Common/RDOProtocol.pas` — `CallID = 'C'`, `AnswerID = 'A'`

## Step 5: Determine Return Type

For functions returning `OleVariant`, read the **implementation** to see what's assigned to `Result`:

| Implementation Pattern | Actual Return | RDO Prefix |
|----------------------|--------------|-----------|
| `Result := fName;` (string field) | string | `%` |
| `Result := fId;` (integer field) | integer | `#` |
| `Result := 0;` or `Result := intvar;` | integer | `#` |
| `Result := IntToStr(x);` | string | `%` |
| `Result := FloatToStr(x);` | string | `%` |
| `Result := fPrice;` (double field) | double | `@` |
| `Result := true;` / `Result := false;` | boolean as integer | `#` (-1 or 0) |
| (procedure, no Result) | void | `*` |

**Search pattern:**
```bash
# Find the implementation and look at Result assignments
grep -n "Result\s*:=" "Kernel/Kernel.pas" | head -20
```

## Step 6: Check for Push Behaviors

Some RDO calls trigger the server to push data to connected clients.

**Search patterns:**
```bash
# Look for callback/notification methods
grep -n "Notify\|Push\|Broadcast\|SendEvent\|fClient\.\|ModelServerEvents" "Interface Server/InterfaceServer.pas"

# Look in TModelEvents for client callbacks
grep -n "published" "Interface Server/InterfaceServer.pas" | grep "TModelEvents" -A 50
```

**Common push patterns in SPO:**
```
fClient.RefreshArea(...)          → Client refreshes visible area
fClient.Refresh                   → Client refreshes current view
fClient.ModelStatusChanged        → Client updates status indicators
fEvents.AreaChanged(...)          → Multiple clients notified
fEvents.ObjectChanged(...)        → Facility state changed
```

## Step 7: Build the TypeScript Command

Using gathered evidence, construct the `RdoCommand`:

```typescript
// Function with params and return value:
// published function RDOSetPrice(PriceId: integer; Value: double): OleVariant
const cmd = RdoCommand.sel(objectId)
  .call('RDOSetPrice').push()
  .args(RdoValue.int(priceId), RdoValue.double(value))
  .build();

// Procedure (void, no return):
// published procedure RDOEndSession
const cmd = RdoCommand.sel(objectId)
  .call('RDOEndSession').pushVoid()
  .build();

// Property get:
// published property RDOCurrentKey: widestring read fKey
const cmd = RdoCommand.sel(objectId)
  .get('RDOCurrentKey')
  .build();

// Property set:
// published property RDOCurrentKey: widestring read fKey write fKey
const cmd = RdoCommand.sel(objectId)
  .set('RDOCurrentKey', RdoValue.str(newKey))
  .build();
```

## Step 8: Update the Reference Index

Add the discovery to `doc/spo-original-reference.md` in the correct object table:

```markdown
| MemberName | kind | verb | `(#param1, %param2)` | `%return_type` | line | notes |
```

If the object does not exist yet in the reference, create a new section using the RDO Object Reference template from `resources/documentation-templates.md`.

---

## Quick-Find Paths by Server Object

| Server Object | Primary Source | Secondary Sources |
|--------------|---------------|-------------------|
| `TDirectoryServer` | `DServer/DirectoryServer.pas` | `Directory Server/DirectoryServer.pas` |
| `TDirectorySession` | `DServer/DirectoryServer.pas` | |
| `TInterfaceServer` | `Interface Server/InterfaceServer.pas` | |
| `TClientView` | `Interface Server/InterfaceServer.pas` | |
| `TModelEvents` | `Interface Server/InterfaceServer.pas` | Events pushed to clients |
| `TWorld` | `Kernel/World.pas` | Referenced in `Kernel/Kernel.pas` |
| `TTycoon` | `Kernel/Kernel.pas` | |
| `TFacility` | `Kernel/Kernel.pas` | |
| `TTown` | `Kernel/Kernel.pas` | |
| `TBlock` (facility base) | `Kernel/Kernel.pas` | Subclasses in `StdBlocks/*.pas` |
| `TConnectedBlock` | `Kernel/ConnectedBlock.pas` | Base for most facilities |
| `TEvaluatedBlock` | `StdBlocks/EvaluatedBlock.pas` | Adds quality metrics |
| `TSession` | `Interface Server/Sessions.pas` | |
| `TCacheAgent` | `Cache/CacheAgent.pas` | |

---

## Common Pitfalls

| Pitfall | How to Detect | Fix |
|---------|--------------|-----|
| Wrong verb (`get` instead of `call`) | Method is `function` but coded as `get` | Use `call` for functions, `get`/`set` only for properties |
| Wrong param order | Compare WebClient code vs Delphi declaration | Always match Delphi declaration order exactly |
| Missing param | Delphi has N params, TypeScript sends N-1 | Count all params in declaration including optional ones |
| Boolean as 1 instead of -1 | `wordbool` true = -1 in Delphi OLE | Use `RdoValue.int(-1)` for true, `RdoValue.int(0)` for false |
| `string` vs `widestring` | Short string `$` vs OLE string `%` | Check Delphi type: `string` → `$`, `widestring` → `%` |
| Wrong separator for void | Using `^` for procedures | `^` = returns value, `*` = void |
| Stale reference | Method was moved/renamed between RDO variants | Check which Rdo variant (Rdo/, Rdo.IS/, Rdo.BIN/) the server uses |
| Assuming method exists on wrong object | e.g., calling TClientView method on TInterfaceServer | Verify the `sel` object ID resolves to the correct class |
