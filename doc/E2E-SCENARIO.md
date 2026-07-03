# E2E Live Smoke Script (L3)

**Prerequisite:** [E2E-TESTING.md](E2E-TESTING.md) — credentials, selectors, `__spoDebug` API, interaction rules.

This is the **L3 live smoke** in the test architecture ([E2E-STRATEGY.md](E2E-STRATEGY.md)):
a short, **read-only** pass against the real servers with the locked account, run manually
before a release or on demand — never in CI, never in a loop. Everything deeper (panel
navigation details, mutations, permission-gated features, resilience) is L2 work against
the mock backend and does not belong in this script.

Historical note: this file previously held a 17-phase full-UI script with pre-React
selectors. That scope moved to L2 Playwright specs; the selector tables were superseded by
E2E-TESTING.md (verified 2026-07-03).

---

## Phase 0 — Server start

```
Bash (background): npm run dev
Poll http://localhost:8080/api/startup-status until phase:"ready" (~2 min cold)
browser_navigate → http://localhost:8080
```

## Phase 1 — Login (MANDATORY, always first)

Follow the verified login table in E2E-TESTING.md (Username/Password textboxes →
"Enter the World" → "Free Space" → planitia card → "SPO_test3 - Green").

**Assert** via `getState()`: `session.connected`, `worldName === "planitia"`,
`companyName` contains `SPO_test3`, `panels.login === false`, `wire.errors === 0`.

## Phase 2 — Map render

**Assert:** `renderer.mapLoaded`, `renderer.buildingCount > 0`, `renderer.canvasHasContent`,
`canvasSize.width > 0`.

## Phase 3 — Camera controls

Press `+`, `-` (zoom changes and restores), `q`, `e` (rotation cycles and restores) —
assert via `renderer.zoom` / `renderer.rotation` after each key.

## Phase 4 — Tycoon stats

**Assert:** `tycoonStats.cash` starts with `$`; `tycoonStats.ranking` contains `SPO_test3`;
`buildings` matches `N/M`.

## Phase 5 — Chat ping

Type `E2E smoke ping` into the chat textbox ("Type a message...") and send.
**Assert:** `REQ_CHAT_SEND_MESSAGE` appears in `__spoDebug.history`. (The live world can be
slow to echo — the outbound request is the assertion, the echo is best-effort.)

## Phase 6 — Panel sweep (open → close, one pass)

For each HUD button (by `title`): `Build (B)`, `Search`, `Profile (E)`, `Mail (M)`,
`Settings` — click, assert the matching `panels.*` flag flips true, press `Escape`,
assert it flips back. Toggle minimap with `m`. Read-only: do not click actions inside
the panels.

## Phase 7 — Wire health

**Assert:** `wire.sent > 10`, `wire.received > 10`, `wire.errors === 0`.

## Phase 8 — Clean exit

Close the browser page (triggers the gateway's `ClientNotAware` → `get Logoff`), then stop
the server (see E2E-TESTING.md). Confirm port 8080 is free.

---

## Reporting

| Phase | Status |
|-------|--------|
| Login | PASS/FAIL |
| Map render | |
| Camera | |
| Stats | |
| Chat | |
| Panels | |
| Wire health | |
| Clean exit | |

On any FAIL: capture `getState()`, `browser_console_messages`, and gateway log lines for
the session `sid` — see Reporting in E2E-TESTING.md.
