# Full Game E2E Test

Run a comprehensive E2E test of every major game feature using Playwright MCP tools.

## Prerequisites

- Playwright MCP server must be available
- Port 8080 must be free

## Procedure

### 1. Start Server

Run `npm run dev` in background. Poll `http://localhost:8080` until reachable (max 30s).

### 2. Login

Credentials are **LOCKED** — NEVER change these:
- Username: `SPO_test3`
- Password: `test3`
- Zone: **BETA**
- World: **Shamba**
- Company: **President of Shamba**

Steps:
1. `browser_navigate` to `http://localhost:8080`
2. `browser_snapshot` to find elements
3. `browser_fill_form` — fill `#inp-username` with `SPO_test3`
4. `browser_fill_form` — fill `#inp-password` with `test3`
5. `browser_click` on `#btn-connect`
6. `browser_wait_for` zone tabs to appear
7. `browser_click` on the BETA zone tab
8. `browser_click` on the "Shamba" world card
9. Select "President of Shamba" company
10. `browser_wait_for` `#login-panel` to disappear (timeout 30s)

### 3. Verify Map Rendering

```js
browser_evaluate: window.__spoDebug.getState()
```
Assert:
- `renderer.mapLoaded === true`
- `buildingCount > 0`

### 4. Zoom Controls

- `browser_press_key` `+` — verify zoom increased via `__spoDebug.getState().renderer.zoom`
- `browser_press_key` `-` — verify zoom decreased

### 5. Rotation

- `browser_press_key` `q` — verify rotation changed (NORTH -> EAST -> SOUTH -> WEST cycle)
- `browser_press_key` `e` — verify rotation changed back

### 6. Tycoon Stats

Via `browser_evaluate` + `window.__spoDebug.getState()`:
- Cash display is a number > 0
- Ranking contains the username
- Buildings count shows N/M format (owned/total)

### 7. Chat

- `browser_fill_form` in the chat input with `E2E test message`
- `browser_press_key` `Enter`
- Verify `messageCount > 0` via `__spoDebug.getState()`

### 8. Panel Toggles

Toggle each panel and verify it opens, then close it:

| Panel | Action | Verify selector |
|-------|--------|-----------------|
| Mail | Click mail button | Mail panel visible |
| Profile/Company | Click profile button | Profile panel visible |
| Settings | Click settings button | `#settings-overlay` visible |
| Transport | Click transport button | Transport panel visible |
| Search | Click search button | Search panel visible |
| Minimap | Press `M` key | Minimap visible |
| Build menu | Click build button | `#build-menu` visible |

Use `browser_snapshot` before each interaction to find correct element refs.

### 9. Building Details

- Click on a building on the canvas (use `browser_click` at a known building coordinate)
- `browser_wait_for` `#building-details-panel` to appear
- Verify the panel has content

### 10. Protocol Log

- `browser_click` on `#console-header`
- Verify `#console-output` has child elements via `browser_evaluate`

### 11. Wire Health

```js
browser_evaluate: window.__spoDebug.getState()
```
Assert:
- `sent > 0`
- `received > 0`
- `errors === 0`

### 12. Debug Overlay

- `browser_press_key` `D` to toggle debug mode
- `browser_press_key` `1` through `5` to cycle overlay layers
- `browser_take_screenshot` — delegate screenshot read to a sub-agent

### 13. Final Screenshot

- `browser_take_screenshot` of the final game state
- Delegate screenshot read to a sub-agent (NEVER load screenshots in main context)

### 14. Cleanup

- `browser_close`
- Stop the dev server (`taskkill /F /IM node.exe` or equivalent)

## Important Rules

- **Credentials are LOCKED**: SPO_test3 / test3 / BETA / Shamba / President of Shamba — NEVER change
- Always call `browser_snapshot()` before each interaction to find correct element refs
- Use `browser_evaluate()` for state verification via `window.__spoDebug.getState()`
- **Delegate screenshot reads to sub-agents** — never load screenshots directly in main context
- If a step fails: take a screenshot, log the error, and **continue to the next step**
- At the end, report a summary table:

```
| Test Area         | Status  |
|-------------------|---------|
| Login             | PASS    |
| Map Rendering     | PASS    |
| Zoom              | PASS    |
| Rotation          | FAIL    |
| Tycoon Stats      | PASS    |
| Chat              | SKIPPED |
| Panel Toggles     | PASS    |
| Building Details  | PASS    |
| Protocol Log      | PASS    |
| Wire Health       | PASS    |
| Debug Overlay     | PASS    |
```