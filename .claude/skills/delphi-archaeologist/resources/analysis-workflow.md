# Analysis Workflow — Detailed Procedures

> Load this resource for complex multi-file investigations.

## Scope Limits (Hard Rules)

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max files per investigation | 15 | Prevents context overflow |
| Max call-depth levels | 4 | Diminishing returns beyond this |
| Max grep retries per pattern | 3 | If 3 greps fail, rethink the approach |
| Max lines to read per file (first pass) | 80 | Interface section usually fits |
| Sub-agent threshold | 5+ files | Delegate parallel reads to sub-agent |
| User checkpoint interval | After every major finding | Prevent wasted work in wrong direction |

---

## Phase 1: Scoping

### Decision Tree

```
What is the user asking about?
│
├── A specific RDO method
│   → Load rdo-archaeology-checklist.md
│   → Find the server object that exposes it
│
├── A facility/building type
│   → Start in StdBlocks/, cross-ref Kernel/Kernel.pas
│   → Check Model Extensions/ for region-specific variants
│
├── A UI feature (inspector tab, map behavior)
│   → Start in Voyager/URLHandlers/ or Voyager/*Sheet.pas
│   → Cross-ref doc/facility-tabs-reference.md
│
├── A protocol flow (login, building placement, area refresh)
│   → Start at the entry point (.dpr), trace through services
│   → Use Protocol Flow template from documentation-templates.md
│
├── A data structure (collection, cache, persistence)
│   → Start in Kernel/*.pas type declarations
│   → Check Cache/ and Persistence/ if caching-related
│
├── The map/rendering system
│   → Voyager/Components/MapIsoView/*.pas
│
├── A specific server service
│   → Find its .dpr in service-map.md
│   → Read the .dpr uses clause for full dependency tree
│
└── Unknown/broad topic
    → Start with service-map.md
    → Narrow scope with user before proceeding
```

### File Priority Tiers

For any investigation, classify files into tiers:

| Tier | When to Read | Read Strategy |
|------|-------------|---------------|
| **Must-Read** | Files directly named by user or at center of feature | Full interface section |
| **Important** | Files in the dependency chain (uses clause) | First 60 lines + targeted grep |
| **On-Demand** | Files mentioned by other files, utility code | Only grep or read specific lines |
| **Skip** | Tests, backups, .dfm, .dsk, dead code | Never read unless specifically needed |

---

## Phase 2: Entry Point Discovery

### Starting from a .dpr file

1. Read the `.dpr` file (always small, <200 lines)
2. Extract the `uses` clause — this is the complete dependency tree
3. Identify `Application.CreateForm(TFormName, ...)` — this is the main form
4. Map `..\..\[Dir]\[Unit].pas` paths to understand cross-service dependencies

### Starting from a class/type name

```bash
# Find where a type is declared (exclude backups)
grep -rn "TMyClass\s*=" --include="*.pas" "Kernel/" "Interface Server/" "StdBlocks/" | grep -v "\.~pas\|Copy of"

# If not found, widen the search
grep -rn "TMyClass\s*=" --include="*.pas" | grep -v "\.~pas\|Copy of\|Voyager\.1\|Tests/"
```

### Starting from an RDO method name

```bash
# Find the declaration (published method)
grep -rn "RDOMethodName" --include="*.pas" | grep -v "\.~pas\|Copy of"

# If method doesn't start with "RDO", search for it as a published member
grep -rn "published" --include="*.pas" "Interface Server/" "Kernel/" | grep "MethodName"
```

### Starting from an error code or constant

```bash
# Check Protocol.pas and ErrorCodes.pas first
grep -rn "CONSTANT_NAME" "Protocol/Protocol.pas" "Rdo/Common/ErrorCodes.pas"

# Then widen
grep -rn "CONSTANT_NAME" --include="*.pas" | grep -v "\.~pas" | head -10
```

---

## Phase 3: Progressive Reading

### Round 1: Interface Scan (cheap — 80 lines per file max)

For each Must-Read file:

1. Find where interface ends: `grep -n "^implementation" File.pas`
2. Read from line 1 to that line number
3. Extract:
   - [ ] Unit name
   - [ ] Uses clause (interface dependencies)
   - [ ] Type declarations (classes, interfaces, enums, records)
   - [ ] Published members (RDO surface area)
   - [ ] Public method signatures
   - [ ] Constants and type aliases

### Round 2: Targeted Implementation (expensive — only specific methods)

Only read implementation for methods identified in Round 1 as relevant:

```bash
# Find the exact line of a method implementation
grep -n "procedure TClassName.MethodName\|function TClassName.MethodName" File.pas
```

Then read from that line + ~50-80 lines (most methods are under 50 lines).

**Reading heuristic for method boundaries:**
- Method starts at `function/procedure TClass.Method`
- Method ends at the next `function/procedure` or at `initialization` or `end.`
- Nested `begin...end` blocks are part of the same method

### Round 3: Cross-Reference (if needed, max 1 level deeper)

If a method calls into another unit:

```
Entry.pas → Called.pas → STOP
```

Do NOT follow the chain beyond 1 additional level without delegating to a sub-agent.

---

## Phase 4: Evidence Assembly

### Evidence Priority (highest to lowest)

| Priority | Type | Marker | Example |
|----------|------|--------|---------|
| 1 | Explicit source code | `[File.pas:Line]` | "TClientView has published function RDOGetCompanyList" |
| 2 | Naming convention | `[INFERRED from naming]` | "RDOSetPrice = setter for price (RDO prefix + Set verb)" |
| 3 | Type signature | `[INFERRED from signature]` | "Returns OleVariant holding string based on field type" |
| 4 | Cross-reference | `[INFERRED from File2.pas:Line]` | "Called from TInterfaceServer.DoLogin context" |
| 5 | Existing documentation | `[from doc/X.md]` | "Already indexed in spo-original-reference.md" |
| 6 | Comments in source | `[File.pas:Line comment]` | Developer notes (rare in SPO codebase) |
| 7 | Pattern matching | `[INFERRED from similar class]` | "TFoodStore likely works like TClothesShop" |

### Evidence Format Example

```markdown
### Evidence Chain

1. [InterfaceServer.pas:142] TClientView declares published function `RDOGetCompanyList`
   returning OleVariant — confirmed function, verb should be `call`
2. [InterfaceServer.pas:445] Implementation reads fCompanyList collection,
   builds tab-separated string — confirms return type is `%` (OLE string)
3. [INFERRED from signature] Parameter `WorldId: integer` uses `#` prefix
4. [UNKNOWN] Whether this triggers any server push — no Notify* calls found
   in implementation, but could happen in downstream code
```

---

## Phase 5: Gap Classification

When comparing Delphi original to TypeScript WebClient implementation:

| Classification | Meaning | Action |
|----------------|---------|--------|
| **MATCH** | WebClient correctly implements the Delphi behavior | Document as verified |
| **BUG** | WebClient diverges in a way that causes errors | File as bug with evidence from both sides |
| **INTENTIONAL** | WebClient deliberately differs (modernization, simplification) | Document the decision and reasoning |
| **DRIFT** | Minor difference, unclear if intentional | Flag for developer review with evidence |
| **MISSING** | Feature exists in Delphi but not in WebClient | Add to doc/BACKLOG.md if relevant |
| **UNKNOWN** | Cannot determine from available evidence | Mark and move on — don't guess |

### Conflict Resolution

When evidence contradicts itself:

1. **NEVER guess** when evidence conflicts. Stop and document both sides.
2. Check which RDO variant the server actually uses (Rdo/ vs Rdo.IS/ vs Rdo.BIN/)
3. Check if one source is a backup/old version (`Copy of`, `.1/`, etc.)
4. Check `.dpr` uses clause to determine which file is actually compiled
5. If still unresolved, mark as `[CONFLICT]` and ask the user

---

## Sub-Agent Delegation

### When to Delegate

- Reading 5+ files in parallel
- Extracting type hierarchies across multiple units
- Scanning all StdBlocks/ for a shared pattern
- Building dependency graphs from .dpr files
- Any task that would blow past the 15-file scope limit

### Delegation Template

```
Task(subagent_type: "general-purpose",
  prompt: "Analyze these SPO-Original Delphi 5 source files.

  **Target:** [What we're looking for]

  **Files to read (priority order):**
  1. C:\Users\RobinALEMAN\Documents\SPO\SPO-Original\[Path1] — Read interface section only
  2. C:\Users\RobinALEMAN\Documents\SPO\SPO-Original\[Path2] — Read lines [M]-[N] (specific method)
  3. C:\Users\RobinALEMAN\Documents\SPO\SPO-Original\[Path3] — Grep for '[pattern]'

  **Extract:**
  - Class names and parent classes
  - Published methods with full signatures (params + return types)
  - Key constants
  - Any mentions of [specific term]

  **Format:** Markdown table with columns: Name | Kind | Signature | File:Line
  **Mark uncertain items as [INFERRED].**
  **Do NOT read:** .~pas, .dcu, .dsk, Copy of files, Voyager.1/ versions")
```

---

## Complete Worked Example

**User asks:** "How does the Interface Server handle client login?"

### Step 1: Scope
→ Interface Server (from service-map.md)
→ Entry point: `Interface Server/FIVEInterfaceServer.dpr`

### Step 2: Entry Point
Read `.dpr` uses clause. Main unit: `InterfaceServer.pas`
→ Classes found: TInterfaceServer, TClientView, TModelEvents

### Step 3: Interface Scan
Read `InterfaceServer.pas` lines 1-80 (interface section)
→ Found: TInterfaceServer has methods for connection management
→ TClientView has published methods — likely the per-session object

### Step 4: Surface Scan
```bash
grep -n "Login\|Logon\|Connect\|Session\|Auth" "Interface Server/InterfaceServer.pas"
```
→ Found: `RDOCnxLogin` at line ~285, `RDOCnxLogon` at line ~310

### Step 5: Targeted Deep Dive
Read lines 285-340 (RDOCnxLogin implementation)
→ Calls Directory Server for authentication
→ Creates TClientView instance on success
→ Returns object ID for client to use

### Step 6: Cross-Reference (1 level)
Check `DServer/DirectoryServer.pas` for `RDOLogonUser`
→ Already indexed in spo-original-reference.md — reuse existing data

### Step 7: Synthesize
Write finding with evidence chain:
- [InterfaceServer.pas:285] RDOCnxLogin accepts alias + password
- [InterfaceServer.pas:302] Validates against Directory Server
- [InterfaceServer.pas:315] Creates TClientView, returns object ID as #integer
- [INFERRED] Error code 0 = success based on Protocol.pas constants
- [UNKNOWN] Whether failed login triggers any rate limiting

### Step 8: User Checkpoint
Present finding. Ask if deeper investigation needed (e.g., into TClientView initialization).
