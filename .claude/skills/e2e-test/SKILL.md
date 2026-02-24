---
name: e2e-test
description: Run E2E tests with Playwright MCP (complete workflow from server start to cleanup)
user-invokable: true
disable-model-invocation: true
---

# E2E Test Runner

Automates the complete end-to-end testing workflow using Playwright MCP for browser automation.

## Overview

This skill orchestrates the full E2E test lifecycle documented in [doc/E2E-TESTING.md](../../../doc/E2E-TESTING.md):
1. Start dev server (background)
2. Wait for server ready
3. Execute login scenario with MANDATORY credentials
4. Run specified test scenario
5. Save screenshots with debug overlay
6. Cleanup (stop server)

## Test Credentials (LOCKED - DO NOT MODIFY)

These credentials are **MANDATORY** per CLAUDE.md and must NEVER be changed without explicit developer approval:

| Field | Value |
|-------|-------|
| Username | `SPO_test3` |
| Password | `test3` |
| Server Zone | `BETA` |
| World | `Shamba` |
| Company | `President of Shamba` |

## Usage

```bash
/e2e-test <scenario> [options]
```

### Arguments

- `<scenario>` (required): Test scenario to run
  - `login` - Basic login and world selection (MANDATORY first test)
  - `building-placement` - Test building placement on map
  - `road-building` - Test road construction
  - `mail-system` - Test mail UI and message sending
  - `profile-view` - Test user profile display
  - `custom` - Custom test scenario (provide details)

### Options

- `--debug-overlay` - Enable debug overlay (d key + toggle keys 3,4,5)
- `--save-screenshots` - Save screenshots to `screenshots/` directory
- `--skip-login` - Skip login (only if already logged in)

## Test Procedure

### Phase 1: Server Start

```bash
# Check if port 8080 is already in use
netstat -ano | findstr :8080

# If in use, stop existing process (Windows)
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess | Stop-Process

# Start dev server in background
npm run dev  # (run_in_background: true)

# Wait for server ready (poll http://localhost:8080)
```

### Phase 2: Login Scenario (MANDATORY)

**Never skip this unless explicitly told to use --skip-login**

1. **Navigate**: `browser_navigate("http://localhost:8080")`
2. **Wait for page load**: `browser_snapshot()` to identify login elements
3. **Fill credentials**:
   - `browser_type(ref_for_#inp-username, "SPO_test3")`
   - `browser_type(ref_for_#inp-password, "test3")`
4. **Connect**: `browser_click(ref_for_#btn-connect)`
5. **Select world**:
   - Wait for world list to appear
   - Select BETA zone
   - Select Shamba world
   - Click "Enter World"
6. **Wait for map load**: Look for canvas element and game UI

### Phase 3: Test Scenario Execution

Execute the specified test scenario. Each scenario should:
- Enable debug overlay if `--debug-overlay` flag is set
- Take screenshots at key checkpoints if `--save-screenshots` flag is set
- Use descriptive filenames: `screenshots/<scenario>-<step>-<timestamp>.png`

### Phase 4: Cleanup

```bash
# Stop the dev server (find background task and kill)
# Save final report/summary
```

## Debug Overlay Keys

Enable with `browser_press_key("d")`, then use these toggles:

| Key | Overlay | Description |
|-----|---------|-------------|
| `3` | Concrete | Yellow diamonds with coordinates |
| `4` | Water Grid | Blue grid lines |
| `5` | Roads | Orange diamonds with road IDs |

**Color Legend for Screenshots:**
- 🟢 Green = Building
- 🔵 Blue = Junction/Water
- 🟠 Orange = Road
- 🟡 Yellow = Concrete tile

## Screenshot Analysis Protocol

**CRITICAL**: Never load screenshots in main context (3-5MB each, saturates 20MB limit).

Instead, delegate to sub-agent:

```typescript
Task(
  subagent_type: "general-purpose",
  prompt: `Read screenshots/<name>.png. Debug overlay active: [concrete=on, roads=on].

  Check criteria:
  1. Login successful (map canvas visible)
  2. Building placed at correct coordinates
  3. Road texture matches expected type

  Reply PASS/FAIL per criterion with coordinates from overlay.`
)
```

Sub-agent returns text verdict (~100 bytes) instead of image (~3-5MB).

## Example Test Scenarios

### Login Test (Always Run First)

```bash
/e2e-test login --debug-overlay --save-screenshots
```

Expected outcome:
- ✅ Login form appears
- ✅ Credentials accepted
- ✅ World list shows BETA/Shamba
- ✅ Map canvas loads
- ✅ Game UI visible (toolbar, minimap)

### Building Placement Test

```bash
/e2e-test building-placement --debug-overlay --save-screenshots
```

Steps:
1. Click construction menu
2. Select building type
3. Click map tile to place
4. Verify building appears at correct isometric coordinates
5. Screenshot with debug overlay showing building ID

### Road Building Test

```bash
/e2e-test road-building --debug-overlay --save-screenshots
```

Steps:
1. Click road construction tool
2. Click start tile
3. Click end tile (creates road path)
4. Verify road textures render correctly
5. Check road topology (straight, turn, T-junction, cross)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 8080 in use | Stop existing process first |
| Login fails | Verify credentials are EXACTLY `SPO_test3`/`test3` |
| World list doesn't appear | Wait longer (WebSocket connection delay) |
| Canvas not rendering | Check browser console for errors |
| Screenshot analysis hits context limit | Always use sub-agent delegation |

## Dependencies

**Required MCP Servers:**
- `playwright` - Browser automation (configured in `.mcp.json`)

**Required Commands:**
- `npm run dev` - Build and start server
- `npm test` - Run Jest tests (optional, for validation)

**Directory Structure:**
```
screenshots/           # Git-ignored, created automatically
  login-step1.png
  login-step2.png
  building-placement-result.png
```

## Success Criteria

A test passes when:
1. ✅ Server starts successfully on port 8080
2. ✅ Login completes with mandatory credentials
3. ✅ Test scenario executes without errors
4. ✅ Screenshots show expected state (verified by sub-agent)
5. ✅ Server stops cleanly

## Notes

- **Always delegate screenshot analysis to sub-agents** (see Screenshot Analysis Protocol)
- **Never modify test credentials** without developer approval
- **Enable debug overlay for all tests** to make coordinate verification easier
- **Save screenshots to git-ignored `screenshots/` directory** to avoid flooding repo
- **Test environment is live server**, not mocked (real WebSocket, real game servers)

## References

- Full E2E testing procedure: [doc/E2E-TESTING.md](../../../doc/E2E-TESTING.md)
- Protected files and rules: [CLAUDE.md](../../../CLAUDE.md)
- RDO protocol details: [doc/rdo_typing_system.md](../../../doc/rdo_typing_system.md)
