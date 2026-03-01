---
name: validation-ceremony
description: "Validate modules as stable: register in protected registry, take Playwright baselines, guard against unreviewed edits."
user-invokable: true
disable-model-invocation: false
---

# Validation Ceremony

Protect validated code from AI-caused regressions. When the user confirms a module is stable, register it in `.claude/validated-modules.json` — edits will require confirmation and trigger targeted tests.

## Triggers

| Trigger | Action |
|---------|--------|
| `/validate <Name>` | Validate a component or module |
| `/validate src/path/to/file.ts` | Validate a backend module by path |
| `/validate --list` | Show all validated modules |
| `/validate --remove <Name>` | Remove protection |
| `/validate --check` | Visual spot-check all validated components |
| "approved" / "stable" / "lock this" / "protect this" | Auto-invoke validation for the current context |

## Registry Location

`.claude/validated-modules.json` (committed to git)

## Validation Ceremony Procedure

When the user triggers validation, follow these steps **in order**:

### Step 1: Identify Files

- **By component name** (e.g., `/validate BuildingInspector`):
  - Find `src/client/components/**/<Name>.tsx`
  - Find matching `<Name>.module.css` in the same directory (if it exists)
  - Find co-located `<Name>.test.ts` or `<Name>.test.tsx` (if it exists)
  - Determine type: `"visual"` (has .tsx) or `"logic"` (plain .ts)

- **By file path** (e.g., `/validate src/server/spo_session.ts`):
  - Use the exact path provided
  - Look for co-located test file (`<basename>.test.ts`) or test directory
  - Type: `"logic"`

### Step 2: Run Tests

Run the module's associated tests to confirm they pass:

```bash
npx jest --no-coverage --testPathPatterns="<testPath>"
```

- If tests **pass** → continue to step 3
- If tests **fail** → ABORT the ceremony. Report: "Cannot validate — tests are failing. Fix them first."
- If **no tests exist** → warn the user: "No tests found for this module. Validating without test coverage means the PostToolUse test runner won't catch regressions. Continue anyway?" Proceed only if user confirms.

### Step 3: Take Baseline Screenshot (visual components only)

**Skip this step if:**
- Module type is `"logic"` (backend code)
- App is not running (check with a quick fetch to `http://localhost:8080`)
- User explicitly says to skip screenshots

**If app is running:**
1. Use Playwright MCP: `browser_navigate("http://localhost:8080")`
2. Follow the login protocol from the `e2e-test` skill if not already logged in
3. Navigate to the game state where the component is visible
4. Take screenshot: `browser_take_screenshot({ filename: "screenshots/baselines/<Name>-<YYYY-MM-DD>.png" })`
5. **IMPORTANT:** Do NOT read the screenshot in main context. Just save it as the baseline reference.

**If app is not running:**
- Set `screenshotPath: null` in the registry
- Note: "Baseline screenshot skipped — app not running. Run `/validate --check` later to capture."

### Step 4: Write to Registry

Read `.claude/validated-modules.json`, add the new entry, write it back.

Entry format:
```json
{
  "<Name>": {
    "type": "visual",
    "files": [
      "src/client/components/building/<Name>.tsx",
      "src/client/components/building/<Name>.module.css"
    ],
    "tests": "src/client/components/building/<Name>.test.ts",
    "screenshotPath": "screenshots/baselines/<Name>-2026-03-01.png",
    "validatedAt": "2026-03-01T14:30:00Z",
    "notes": "User approved"
  }
}
```

For logic modules:
```json
{
  "<name>": {
    "type": "logic",
    "files": ["src/server/<name>.ts"],
    "tests": "src/server/__tests__/<name>/",
    "screenshotPath": null,
    "validatedAt": "2026-03-01T14:30:00Z",
    "notes": "User approved"
  }
}
```

### Step 5: Confirm

Report to the user:
```
Validated: <Name>
  Type: visual/logic
  Protected files: <list>
  Test suite: <path>
  Baseline screenshot: <path or "skipped">

  Edits to these files now require your confirmation.
  PostToolUse will run tests automatically after any edit.
  To remove protection: /validate --remove <Name>
```

---

## Sub-Commands

### `/validate --list`

1. Read `.claude/validated-modules.json`
2. Display a table:

```
| Module | Type | Files | Validated | Screenshot |
|--------|------|-------|-----------|------------|
| QuickStats | visual | 2 files | 2026-03-01 | Yes |
| rdo-types | logic | 1 file | 2026-03-01 | N/A |
```

3. If registry is empty: "No validated modules yet. Use `/validate <Name>` to validate one."

### `/validate --remove <Name>`

1. Read `.claude/validated-modules.json`
2. Check that the named module exists — if not, report "Module not found in registry"
3. Remove the entry
4. Write updated registry
5. Ask: "Delete baseline screenshot at `<screenshotPath>`?" (if one exists)
6. Confirm: "`<Name>` is no longer validated. Files are unprotected."

Protection stops immediately — the PreToolUse hook re-reads the registry on every invocation.

### `/validate --check`

Visual spot-check for all validated components with `type: "visual"`:

1. Read registry, filter to `type: "visual"` entries
2. Verify app is running on :8080 — if not, abort with instructions to start it
3. For each visual module:
   a. Navigate to the component's game state
   b. Take a fresh screenshot: `screenshots/baselines/<Name>-check-<date>.png`
   c. Delegate comparison to a sub-agent:
      ```
      Agent(subagent_type: "general-purpose", prompt:
        "Compare screenshots/baselines/<Name>-<original-date>.png with
         screenshots/baselines/<Name>-check-<date>.png.
         Report: PASS (visually identical) or FAIL (describe differences).")
      ```
   d. Report result per component
4. Summary: "X/Y components passed visual check. Failures: ..."

---

## Natural Language Detection

When `disable-model-invocation: false`, this skill auto-activates when the user says phrases indicating approval of the current work:

| Phrase | Interpretation |
|--------|---------------|
| "this is approved" / "approved" | Validate the files modified in the current task |
| "this is stable" / "stable" | Same |
| "lock this down" / "protect this" | Same |
| "validate this" | Same |

When auto-activated:
1. Identify which files were modified in the current session (from git diff or recent edits)
2. Group them by component/module
3. Ask: "I'll validate these modules: [list]. Proceed?"
4. Run the ceremony for each confirmed module

---

## Protection Mechanics (how it works after validation)

### PreToolUse Hook (`.claude/hooks/protect-critical-files.js`)

When you try to Edit/Write a file that belongs to a validated module:
- The hook reads `validated-modules.json`
- Matches the file path against registered files AND test files
- Returns `permissionDecision: "ask"` with message:
  `"Validated module: <Name> (since <date>). Approve edit or /validate --remove <Name> first."`

### PostToolUse Hook (`.claude/hooks/post-edit-test-runner.js`)

After an edit to a validated module's file is approved:
- The hook reads `validated-modules.json`
- Finds the matching module's test path
- Runs `npx jest --no-coverage --testPathPatterns="<testPath>"`
- If tests fail → exits non-zero → you receive the error and MUST fix the regression
- If tests pass → silent success

### Commit-Time Reminder

When the user asks to commit and validated modules were modified in the session:
- Mention: "Validated modules X, Y were modified. Want a visual spot-check (`/validate --check`) before committing?"
- This is a soft prompt, not a gate — the user can decline.

---

## Rules

- NEVER remove a module from the registry without the user's explicit request
- NEVER weaken, skip, or delete tests for validated modules to "fix" a failing test
- If a validated module's tests fail after your edit, the ONLY correct response is to fix the regression in your code, not to modify the tests
- When the PostToolUse test runner reports a failure, treat it as a blocking issue
- Baseline screenshots are stored in `screenshots/baselines/` (git-ignored) — they are local reference artifacts
- The registry (`.claude/validated-modules.json`) IS committed to git — it represents a quality gate
