# Documentation Templates

> Load this resource in Document mode. Select the template matching your target.

## Citation Conventions (use in ALL templates)

| Marker | Meaning | When to use |
|--------|---------|-------------|
| `[File.pas:123]` | Direct evidence | You read and verified the source line |
| `[INFERRED]` | Logical deduction | Based on patterns, naming, or context |
| `[UNKNOWN]` | Cannot determine | Insufficient evidence — do not guess |
| `[NEEDS INVESTIGATION]` | Requires deeper dive | Out of scope for current analysis |
| `[NEEDS USER INPUT]` | Developer knowledge needed | Ambiguous or undocumented behavior |
| `[CONFLICT]` | Contradictory evidence | Multiple sources disagree — list both |

---

## Template 1: Service/Subsystem Documentation

**Use for:** Model Server, Interface Server, Directory Server, Cache System, etc.

```markdown
# [Service Name] — Architecture Reference

> **Source path:** `C:\Users\RobinALEMAN\Documents\SPO\SPO-Original\[Directory]`
> **Generated:** [DATE] by delphi-archaeologist skill
> **Evidence confidence:** [HIGH/MEDIUM/LOW]

## Overview

[1-3 sentences: what this service does in the SPO architecture]

## Entry Point

**Project file:** `[Directory]/[Name].dpr`
**Main form/class:** `T[ClassName]` in `[Unit].pas:[Line]`
**Type:** program / library

## Dependencies (uses clause)

| Unit | Source Path | Purpose |
|------|-----------|---------|
| [UnitName] | [Dir/Unit.pas] | [Brief purpose] |

## Class Hierarchy

```
TObject
  └── TBaseClass (Unit.pas:Line)
       ├── TChildA (Unit.pas:Line) — [purpose]
       └── TChildB (Unit.pas:Line) — [purpose]
```

## RDO Surface (published members)

| Member | Kind | Verb | Signature | Return | Source:Line | Notes |
|--------|------|------|-----------|--------|------------|-------|

## Key Data Structures

### [TypeName] ([Unit.pas:Line])

| Field | Type | Purpose |
|-------|------|---------|
| [fFieldName] | [type] | [purpose] |

## Behavior

### [Feature/Behavior Name]

[Description with inline evidence citations]

- **Source:** [Unit.pas:Line] — [what was observed]
- **[INFERRED]** — [reasoning for inference]
- **[UNKNOWN]** — [what could not be determined and why]

## Thread Safety

| Resource | Protection Mechanism | Source:Line |
|----------|---------------------|------------|
| [resource] | [TCriticalSection / TLockableCollection / ILockable / none] | [File:Line] |

## Protocol Flow

```
Client (Voyager) ──RDO──> Interface Server ──RDO──> Model Server
                              │
                              └── [describe specific flow]
```

## Open Questions

- [ ] [Question that needs further investigation]
- [ ] [NEEDS USER INPUT] [Question requiring developer knowledge]
```

---

## Template 2: RDO Object Reference

**Use for:** Adding new objects to `doc/spo-original-reference.md`. Follows the existing format in that doc.

```markdown
## T[ClassName] (`[Directory/Unit.pas:Line]`)

**Resolved via:** [How the object ID is obtained — e.g., "returned by RDOOpenSession",
"obtained from ObjectAt", "registered in Directory Server as '[key]'"]

### [Category Name] (e.g., "Session management", "Data queries", "Events")

| Member | Kind | Verb | Signature | Return | Line | Notes |
|--------|------|------|-----------|--------|------|-------|
| [Name] | function | call | `(#param1, %param2)` | `%string` | [line] | [notes] |
| [Name] | procedure | call | `(#param1)` | `*` (void) | [line] | |
| [Name] | property | get/set | — | `#integer` | [line] | read-only / read-write |

### Push Behaviors

| Trigger Method | Pushes To | Push Content | Evidence |
|---------------|-----------|--------------|----------|
| [method that causes push] | [client callback] | [data description] | [File:Line] |

### Error Codes

| Code | Constant | Meaning | Source |
|------|----------|---------|--------|
| [number] | [errConstName] | [description] | [ErrorCodes.pas:Line] or [Protocol.pas:Line] |
```

---

## Template 3: Facility/Block Type Reference

**Use for:** Documenting specific building types from StdBlocks/ or Model Extensions/.

```markdown
# [FacilityName] — Block Implementation Reference

> **Source:** `StdBlocks/[FileName].pas`
> **Class:** `T[ClassName]`
> **Parent chain:** `T[ClassName]` → `T[Parent]` → ... → `TBlock`
> **FacId:** `tid[FacilityId]` (from Model Extensions/[Region]/FacIds.pas)

## Fluid Gates (Inputs/Outputs)

### Inputs

| Gate Index | Gate Name | Fluid Type | Capacity | Source:Line |
|-----------|-----------|-----------|----------|------------|

### Outputs

| Gate Index | Gate Name | Fluid Type | Capacity | Source:Line |
|-----------|-----------|-----------|----------|------------|

## Published Properties (RDO-accessible)

| Property | Delphi Type | RDO Prefix | Purpose | Line |
|----------|------------|-----------|---------|------|

## Published Methods (RDO-callable)

| Method | Params | Return | Purpose | Line |
|--------|--------|--------|---------|------|

## Simulation Logic (Simulate method)

[Description of what happens each simulation tick]

- **Input consumption:** [how inputs are consumed]
- **Output production:** [how outputs are produced]
- **Quality/efficiency:** [what affects quality]
- **Workforce dependency:** [how workers affect output]

## Evaluation (GetStatusText / quality indicators)

[How the block reports its status to the UI]

## Visual Class

| Stage | VisualClass | Size | Source |
|-------|-------------|------|--------|
| Construction | [ID] | [NxM] | BUILDING_VISUALCLASS_REFERENCE.md |
| Complete | [ID] | [NxM] | |
```

---

## Template 4: Protocol/Communication Flow

**Use for:** Documenting specific RDO call sequences (login, building placement, area refresh, etc.).

```markdown
# [Flow Name] — Protocol Sequence

> **Generated:** [DATE]
> **Confidence:** [HIGH/MEDIUM/LOW]
> **Related:** [existing doc references if any]

## Overview

[1-2 sentences: what this flow achieves and when it occurs]

## Actors

| Actor | Role | RDO Object |
|-------|------|-----------|
| Voyager (Client) | Initiates request | RDOObjectProxy |
| Interface Server | Session manager | TClientView |
| Model Server | Simulation engine | TWorld / TFacility |

## Sequence

```
Step 1: Client → [Server]
  [verb] [ObjectType].[MethodName]([params])
  ← returns [prefix][value]
  Evidence: [File.pas:Line]

Step 2: [Server] → [Server2] (internal)
  [verb] [ObjectType].[MethodName]([params])
  ← returns [prefix][value]
  Evidence: [File.pas:Line]

[continue for each step...]
```

## Side Effects

| Step | Side Effect | Evidence |
|------|------------|----------|
| [N] | [what else happens: push, state change, cache update] | [File:Line] |

## Error Paths

| Step | Error Condition | Error Code | Behavior | Evidence |
|------|----------------|-----------|----------|----------|
| [N] | [what can go wrong] | [errCode] | [what happens] | [File:Line] |

## Evidence Chain

1. [File.pas:Line] — [observation]
2. [INFERRED] — [reasoning]
3. [UNKNOWN] — [gap in knowledge]
```

---

## Integration Guidelines

### Adding to existing docs

When documenting RDO methods, check `doc/spo-original-reference.md` first:
- If the object table exists → add rows to the existing table
- If the object is new → create a new section using Template 2
- Always include the Delphi source line number

### Cross-referencing

Link to related documents using relative paths:
- `[See RDO typing](doc/rdo_typing_system.md)`
- `[See building protocol](doc/building_details_protocol.md)`
- `[See facility tabs](doc/facility-tabs-reference.md)`

### Naming convention

New doc files: `doc/[subject]-reference.md` or `doc/[subject]-architecture.md`
- Use kebab-case
- Match existing patterns in `doc/`
