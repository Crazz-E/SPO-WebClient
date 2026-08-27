---
description: Run the L3 browser smoke against the real servers via Playwright MCP
argument-hint: "[login|smoke|custom]"
---

# Full Game E2E Test

Run the live smoke test against the real servers using Playwright MCP tools.

**L3 is the narrow layer.** Regression coverage belongs to L2 — the headless WebSocket
drive, `npm run test:live` — which reaches everything below the pixel. Use this command for
what a socket cannot observe: rendering, layout, input, mobile, or a pre-release pass.

**This command is a pointer — the procedure is maintained in one place:**

- **[doc/E2E-TESTING.md](../../doc/E2E-TESTING.md)** — locked credentials (SPO_test3 /
  test3 and Crazz / test, Free Space / planitia — NEVER change), verified selectors
  (a11y-based; login stages live in a child frame — use snapshot refs, not
  `document.querySelectorAll`), the `__spoDebug` verification API, server lifecycle, and
  the ordered Phase 0–8 smoke script with its report table.
- The gate that decides when this is required: **[doc/E2E-POLICY.md](../../doc/E2E-POLICY.md)**.

Execute the scenario phases in order, assert programmatically via
`window.__spoDebug.getState()` (no screenshots for state verification), and continue to the
next phase on failure. Report: on green, one summary line; on failure, which phases failed with brief reason.

Rules that always apply: credentials are LOCKED; this browser pass stays **read-only**
(mutations belong to L2's round-trip probe, which restores what it writes); the gateway is
**leased** from the bench worker (`npm run dev`), never started or stopped by hand
([doc/bench-worker.md](../../doc/bench-worker.md)); delegate any screenshot reads to a
sub-agent.
