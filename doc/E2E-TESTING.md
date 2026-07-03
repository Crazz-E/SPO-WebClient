# E2E Testing — Canonical Procedure (Playwright)

**This is the single source of truth for driving the app in a real browser.**
The strategy (layers, coverage gates, mock-first policy) lives in [E2E-STRATEGY.md](E2E-STRATEGY.md).
`.claude/commands/e2e.md` and the `e2e-test` skill are thin pointers to this file.

> **Selector status (verified live 2026-07-03):** the React UI no longer exposes the legacy
> `#inp-username` / `#btn-connect` / `#build-menu` IDs that older revisions of this document
> listed. Interaction is accessibility-first (roles, labels, titles). Verification is
> programmatic via `window.__spoDebug`.

## MANDATORY Test Credentials (DO NOT CHANGE)

> **These credentials MUST be used for ALL live E2E runs. NEVER modify, skip, or substitute
> them without EXPLICIT developer approval.**

| Field | Value |
|-------|-------|
| **Username** | `SPO_test3` |
| **Password** | `test3` |
| **Region** | `Free Space` |
| **World** | `planitia` |
| **Company** | `SPO_test3 - Green` |

- Pick **Free Space**, not BETA — the live directory hosts `planitia`/`shamba`/`zorcon` under Free Space; BETA only has `aries`.
- The account also holds a **Political Office: Minister of Agriculture** (visible on the company-select screen) — usable for ministry-level politics flows. It does **not** have mayor powers: road building and zone overlays remain untestable live.
- No destructive in-game actions (demolish, spend, create company) — destructive coverage belongs to the mock backend (L2), see E2E-STRATEGY.md.

## Interaction Rules (React UI reality)

1. **Login stages render in a child frame** — page-level `document.querySelectorAll()` from
   `browser_evaluate` does NOT see them. Use `browser_snapshot` + ref clicks (or Playwright
   role/text locators, which pierce frames). Snapshot refs for frame content are prefixed
   (`f1e…`).
2. **In-game HUD is in the main document** — `browser_evaluate` works normally after login.
3. **React controlled inputs** need either `browser_type` (preferred) or the native-setter
   pattern in `evaluate`:
   `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true}))`.
4. **Timing:** directory auth can take 5–60 s against the live server; world login another
   5–30 s. The live world server can be slow (`SayThis`, `ObjectsInArea` may run into the
   180 s proxy timeout) or transiently refuse TCP connects (`ETIMEDOUT`) — retry after a
   few minutes before concluding anything is broken.

## Login Procedure (verified)

| Step | Action | Target (a11y) |
|------|--------|----------------|
| 1 | `browser_navigate` | `http://localhost:8080` |
| 2 | `browser_type` | textbox **"Username"** → `SPO_test3` |
| 3 | `browser_type` | textbox **"Password"** → `test3` |
| 4 | `browser_click` | button **"Enter the World"** |
| 5 | `browser_wait_for` text `Free Space` (screen: **"Select a Region"**) | |
| 6 | `browser_click` | button starting **"Free Space"** |
| 7 | `browser_wait_for` text `planitia` (screen: **"Select a World"**) | |
| 8 | `browser_click` | the **planitia** world card (button) |
| 9 | `browser_wait_for` text `Your Companies` (screen: **"Select a Company"**) | |
| 10 | `browser_click` | button **"SPO_test3 - Green"** |
| 11 | Poll `getState()` until `session.connected && renderer.mapLoaded` (up to 45 s) | |

Company-select screen also shows **"Political Offices"** (Ministry of Agriculture) and
**"Create New Company"** — do not click either during standard runs.

**Login failure surfaces as a toast** (`status` role): e.g. *"World login failed: Unknown
error"* with a **Dismiss** button. Dismiss and retry once; if it persists, check the gateway
log for the underlying error (`REQ_LOGIN_WORLD FAIL`, often `connect ETIMEDOUT <world-ip>`).

## In-Game HUD (verified button titles)

Buttons are found by `title` attribute (main document, `evaluate`-friendly):

`Build (B)`, `Search`, `Profile (E)`, `Road`, `Capitol`, `Overlays`, `Mail (M)`,
`Settings`, `Facilities`, `Switch Server`, `Zoom In (+)`, `Zoom Out (-)`,
`Toggle Minimap`, `Debug (D)`, `Refresh (R)`.

- **There is no "Logout" button.** Leaving a world = **"Switch Server"** or closing the
  page/WS (the gateway then performs the canonical `ClientNotAware` → `get Logoff`).
- The **"Lobby" button in the chat strip is the channel picker**, not a lobby/logout
  control — clicking it lists channels (Lobby, Plano, …); clicking a channel joins it.
- Chat: textbox placeholder **"Type a message..."**, button **"Send message"** (disabled
  while empty), **"Collapse chat"**, online-user list visible in the strip.
- Info bar (top): world name, date, cash, income sparkline, ranking `#N · SPO_test3`,
  company link **"SPO_test3 - Green ›"** (opens Empire Overview), buildings `n/m`.

## Programmatic State Verification (`__spoDebug`)

All assertions use `browser_evaluate` + `window.__spoDebug` — never screenshots.

```javascript
window.__spoDebug.sent / .received / .errors        // wire counters
window.__spoDebug.lastSent / .lastReceived           // last message types
window.__spoDebug.history                            // last 200 [{dir, type, ts, reqId}]
window.__spoDebug.getState()                         // full snapshot, see below
```

`getState()` (verified live): `session {connected, worldName, companyName, worldSize}`,
`renderer {mapLoaded, zoom, rotation, cameraPosition, buildingCount, segmentCount,
mapDimensions, debugMode, canvasSize, canvasHasContent}`,
`panels {login, chat, mail, profile, politics, settings, transport, minimap, buildMenu,
buildingDetails, searchMenu}` (note: `minimap` is `true` by default after login),
`tycoonStats`, `chat {visible, messageCount, lastMessage}`, `wire`.

**Standard post-login assertion set:**
`session.connected === true`, `session.worldName === "planitia"`,
`session.companyName` contains `SPO_test3`, `panels.login === false`,
`renderer.mapLoaded === true`, `renderer.buildingCount > 0`,
`renderer.canvasHasContent === true`, `wire.errors === 0`.

Keyboard (canvas focused): `+`/`-` zoom, `q`/`e` rotate, `m` minimap, `d` debug overlay
(then `1`–`5` sub-layers: tile info, building info, concrete IDs, water grid, road info).

## Server Lifecycle

```bash
npm run dev          # build + start on :8080 (first boot ~2 min if cache cold)
# capture mode (wire log → mock scenarios, see below):
LOG_LEVEL=debug LOG_JSON=true LOG_FILE=logs/capture-<flow>.ndjson CACHE_SKIP_SYNC=true npm run dev
# readiness probe:
curl -s http://localhost:8080/api/startup-status      # → phase:"ready"
# stop (PowerShell):
Get-Process -Id (Get-NetTCPConnection -LocalPort 8080 -State Listen).OwningProcess | Stop-Process -Force
```

Always stop the server after a session. Never leave E2E traffic running unattended against
the live servers (policy SEC-N, [production-security-policy.md](production-security-policy.md)).

## Capture Pipeline (wire log → mock scenario)

Any flow driven through this procedure can be converted into a replayable mock scenario:

1. Start the server in capture mode (above) — every RDO frame is logged (`RDO>>`/`RDO>*`/`RDO<<`), passwords redacted.
2. Drive **one flow per browser session** (a page reload starts a new gateway session = new `sid`).
3. Find the session: `grep -o '"sid":"[^"]*"' logs/capture-<flow>.ndjson | sort -u`
4. Convert: `npm run capture:convert -- logs/capture-<flow>.ndjson --name <flow> --sid <sid> --var username=SPO_test3`
   (multi-word `--description`/`--source` args: call `node dist/tools/convert-rdo-capture.js` directly from Git Bash — npm-through-cmd mangles quotes).
5. The scenario lands in `src/mock-server/scenarios/captured/` with a validation test pattern to copy
   (`login-full-captured.scenario.test.ts`).

## Screenshot Policy

Screenshots are for **visual rendering bugs only** — never for state verification.
**Never load screenshot images in the main conversation context** (3–5 MB each): save with
`browser_take_screenshot(filename: "screenshots/<name>.png")` and delegate analysis to a
sub-agent that returns a text verdict.

## Reporting

On failure capture: the failing step, `getState()` output, `browser_console_messages`, and
the relevant gateway log lines (`logs/*.ndjson`, filter by `sid`). Report as a per-area
PASS/FAIL table. The full ordered live-smoke script is [E2E-SCENARIO.md](E2E-SCENARIO.md).
