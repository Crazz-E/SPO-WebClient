# Delphi 5 Code Navigation Patterns

> Load this resource when navigating or searching Delphi source code.
> All paths relative to `C:\Users\RobinALEMAN\Documents\SPO\SPO-Original`

## File Type Quick Reference

| Extension | Purpose | How to read |
|-----------|---------|-------------|
| `.dpr` | Project file (entry point) | Read fully — lists all units in `uses` clause |
| `.pas` | Unit (interface + implementation) | Read `interface` first, `implementation` on demand |
| `.dfm` | Form definition (visual layout) | Grep for event handlers (`On*` properties) |
| `.cfg` | Compiler config | Usually not needed |
| `.dof` | Project options | Usually not needed |
| `.dsk` | Desktop layout | Always ignore |
| `.res` | Compiled resources | Binary, cannot read |
| `.tlb` | Type library (COM) | Binary — read `*_TLB.pas` instead |
| `.~pas` | Delphi auto-backup | Always ignore — use the non-tilde version |
| `.dcu` | Compiled unit (binary) | Cannot read — find corresponding .pas |

## Unit Structure (Critical)

Every `.pas` file follows this structure:

```
unit UnitName;

interface                      ← PUBLIC declarations — read this FIRST
  uses                         ← Dependencies (import list)
    Unit1, Unit2, Unit3;

  type                         ← Type declarations
    TMyClass = class(TParent)  ← Class definition
      private                  ← Private members
      protected                ← Protected members
      public                   ← Public members
      published                ← RDO-ACCESSIBLE members (key for protocol!)
    end;

  const                        ← Public constants
  var                          ← Public variables (rare)

  function Foo: integer;       ← Public function declarations
  procedure Bar;               ← Public procedure declarations

implementation                 ← PRIVATE implementations — read on demand
  uses                         ← Private dependencies (additional imports)
    Unit4, Unit5;

  function TMyClass.Foo: integer;   ← Method bodies
  begin
    Result := 42;
  end;

initialization                 ← Runs once when unit loads (optional)
finalization                   ← Runs once when unit unloads (optional)
end.
```

**Strategy**: Always read interface section first. Only read implementation for specific methods you need.

## Grep Patterns for Common Tasks

### Finding RDO-Accessible Members

```bash
# Published methods (RDO-callable) — look for function/procedure after 'published'
grep -rn "published" --include="*.pas" "Kernel/" | head -30

# RDO methods by naming convention (most start with "RDO")
grep -rn "function RDO\|procedure RDO" --include="*.pas" "Interface Server/" "Kernel/" "DServer/"

# Published properties (RDO get/set)
grep -rn "property" --include="*.pas" "Interface Server/InterfaceServer.pas" | grep -i "published" -A 20
```

### Finding Class Declarations

```bash
# Find where a class is declared
grep -rn "TClientView\s*=" --include="*.pas" "Interface Server/"

# Find class hierarchy (parent class)
grep -rn "= class(" --include="*.pas" "Kernel/"

# Find all classes in a unit
grep -n "= class" "Kernel/Kernel.pas"
```

### Tracing Dependencies

```bash
# What does a unit depend on? (interface uses clause — first 30 lines usually)
grep -A 30 "^interface" "Kernel/Kernel.pas" | head -35

# Who depends on a specific unit?
grep -rn "Population" --include="*.pas" --include="*.dpr" | grep "uses"

# Find cross-service dependencies in a .dpr
grep -n "\.\." "Model Server/FIVEModelServer.dpr"
```

### Finding Constants and Enums

```bash
# Named constants (common prefixes: tid, DIR_, err, ch)
grep -rn "^\s*tid\|^\s*DIR_\|^\s*err\|^\s*ch" --include="*.pas" "Protocol/"

# Enumerated types
grep -rn "= (" --include="*.pas" "Kernel/" | head -20
```

### Finding Event Handlers (in .dfm)

```bash
# What events are wired to which methods
grep -n "On" --include="*.dfm" "Voyager/" | grep "=" | head -20
```

### Finding String Builders (RDO response format)

```bash
# Tab-separated, CR-separated string building
grep -n "IntToStr\|#9\|#13\|#10\|LineBreak\|^M" --include="*.pas" "Interface Server/InterfaceServer.pas"
```

## Visibility and RDO Access

| Keyword | RDO Access | Meaning |
|---------|-----------|---------|
| `published` | **YES** | Members visible via RTTI — RDO can call/get/set these |
| `public` | No | Normal public access (Delphi-side only) |
| `protected` | No | Subclass access only |
| `private` | No | Unit-private access only |

**Critical**: The `{$M+}` compiler directive must appear before a class declaration for `published` to work. Most SPO classes inherit from `TPersistent` or `TComponent` which already have `{$M+}`.

## Method Kinds for RDO

| Delphi Declaration | Kind | RDO Verb | RDO Separator |
|-------------------|------|----------|---------------|
| `published property Foo: type read Get write Set` | property | `get` / `set` | N/A |
| `published function Foo(...): OleVariant` | function | `call` | `^` (returns value) |
| `published procedure Foo(...)` | procedure | `call` | `*` (void return) |

**TRAP**: `get` verb on a function works (falls through to `CallMethod` in `RDOObjectServer.pas`) but is semantically WRONG. Always use `call` for functions.

## Type Mapping: Delphi → RDO

| Delphi Type | RDO Prefix | RdoValue Builder | Notes |
|-------------|-----------|------------------|-------|
| `integer` | `#` | `RdoValue.int(n)` | |
| `widestring` | `%` | `RdoValue.str(s)` | OLE string |
| `double` | `@` | `RdoValue.double(d)` | |
| `single` | `!` | `RdoValue.float(f)` | |
| `wordbool` / `boolean` | `#` | `RdoValue.int(-1)` (true) / `RdoValue.int(0)` (false) | Delphi true = -1 |
| `currency` | `@` | `RdoValue.double(c)` | Marshaled as double |
| `string` (short) | `$` | `RdoValue.shortStr(s)` | Delphi short string |
| `OleVariant` (return) | depends | Check implementation | Content determines prefix |

## Common Delphi Idioms in SPO

### OleVariant Return (standard RDO response)
```pascal
function TFoo.RDOGetName: OleVariant;
begin
  Result := fName;   // Delphi auto-marshals to appropriate RDO type
end;
```

### Critical Section (thread safety — very common)
```pascal
fLock.Acquire;
try
  // thread-safe code
finally
  fLock.Release;
end;
```

### Collection Iteration
```pascal
for i := 0 to pred(fMembers.Count) do
begin
  member := TMember(fMembers[i]);
  // ...
end;
```

### String Building (common in RDO multi-value responses)
```pascal
result := IntToStr(Count) + ^M + ^J;  // CR+LF separated
result := result + Name + #9 + Value; // Tab-separated
```

### Interface Delegation
```pascal
property World: TWorld read fWorld;   // delegates to private field
```

### Smart Pointer Pattern (rare but exists)
```pascal
var
  lock: ILockable;
begin
  lock := fCollection.Lock;  // auto-releases when scope exits
```

## Large File Reading Strategy

For files over 200 lines (common in Kernel/, Voyager/, StdBlocks/):

1. **Read lines 1-60** — Get unit name, interface uses clause, type declarations start
2. **Find interface end** — `grep -n "^implementation" File.pas` to know where interface ends
3. **Read interface section only** — From line 1 to the implementation line
4. **Grep for specific method** — `grep -n "procedure TClassName.MethodName" File.pas`
5. **Read targeted range** — e.g., lines 450-520 for a specific method body
6. **Read last 20 lines** — Check for `initialization` / `finalization` sections

## Active vs. Dead Code Identification

| Signal | Meaning | Action |
|--------|---------|--------|
| Referenced in a `.dpr` `uses` clause | **Active** — compiled into project | Analyze it |
| `Copy of X.pas` | Dead backup | Ignore |
| `X.~pas` | Delphi auto-backup | Always ignore |
| `X.ok.pas`, `X.last.pas` | Manual snapshots | Ignore |
| `X1.pas` alongside `X.pas` | Numbered version | Check .dpr for which is active |
| File in `Tests/` directory | Test project, not production | Skip unless testing-specific question |
| `{ $DEFINE ...}` (space after brace) | Commented-out compiler define | Inactive |
| `{$DEFINE ...}` (no space) | Active compiler define | Active |
| `// >>` or `{>>` prefix | Commented-out code block | Ignore |

## Common Cross-References

When you see a reference to an unfamiliar unit, look here first:

| Unit Reference | Look In |
|---------------|---------|
| `Collection`, `TLockableCollection` | `Kernel/Collection.pas` |
| `Protocol`, error codes, separators | `Protocol/Protocol.pas` |
| `Logs`, `LogThis` | `Logs/Logs.pas` |
| `CacheAgent` | `Cache/CacheAgent.pas` |
| `ClassStorageInt` | `Class Storage/ClassStorageInt.pas` |
| `IRDOConnection` | `Rdo/Common/RDOInterfaces.pas` |
| `RDOProtocol` constants | `Rdo/Common/RDOProtocol.pas` |
| `ErrorCodes` | `Rdo/Common/ErrorCodes.pas` |
| `VisualClassManager` | `Class Packer/VisualClassManager.pas` |
| `BackupInterfaces` | `Persistence/BackupInterfaces.pas` |
| `Threads`, `CoreTypes` | `Utils/CodeLib/Threads.pas`, `Utils/CodeLib/CoreTypes.pas` |
| `GenIdd`, `CRC32` | `Utils/Serial/GenIdd.pas`, `Utils/Serial/CRC32.pas` |
| `Synchro`, `CabUtils` | `Utils/Synchro/Synchro.pas`, `Utils/Synchro/CabUtils.pas` |
| `Misc` math/matrix units | `Utils/Misc/*.pas` |
| `GMKernel`, `GameMaster` | `Gm/GMKernel.pas`, `Gm/GameMaster.pas` |
| `SimMLS` (multi-language) | `Kernel/SimMLS.pas` |
| `MailProtocol` | `Mail/MailProtocol.pas` |
| `Transport` | `Transport/Transport.pas` |
| `Surfaces` | `Surfaces/Surfaces.pas` |
