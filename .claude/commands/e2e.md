---
description: Run the L3 live smoke test against the real servers via Playwright MCP
argument-hint: "[login|smoke|custom]"
---

# Full Game E2E Test

Run the live smoke test against the real servers using Playwright MCP tools.

**This command is a pointer — the procedures are maintained in exactly two places:**

1. **[doc/E2E-TESTING.md](../../doc/E2E-TESTING.md)** — canonical procedure: locked
   credentials (SPO_test3 / test3 / Free Space / planitia / SPO_test3 - Green — NEVER
   change), verified selectors (a11y-based; login stages live in a child frame — use
   snapshot refs, not `document.querySelectorAll`), the `__spoDebug` verification API,
   and server lifecycle.
2. **[doc/E2E-SCENARIO.md](../../doc/E2E-SCENARIO.md)** — the ordered L3 smoke script
   (Phases 0–8, read-only) with per-phase assertions and the report table format.

Execute the scenario phases in order, assert programmatically via
`window.__spoDebug.getState()` (no screenshots for state verification), continue to the
next phase on failure, and finish with the per-phase PASS/FAIL table plus a clean server
stop.

Rules that always apply: credentials are LOCKED; read-only (no destructive game actions);
always stop the server; delegate any screenshot reads to a sub-agent.
