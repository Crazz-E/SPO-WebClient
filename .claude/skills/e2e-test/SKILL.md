---
name: e2e-test
description: Run E2E tests with Playwright MCP (complete workflow from server start to cleanup)
user-invokable: true
disable-model-invocation: true
---

# E2E Test Runner

Drives the live game client in a real browser via Playwright MCP.

**This skill is a pointer — do not duplicate procedure here.** Read, in order:

1. **[doc/E2E-TESTING.md](../../../doc/E2E-TESTING.md)** — the canonical procedure:
   - LOCKED credentials: `SPO_test3` / `test3` / **Free Space** / **planitia** /
     **SPO_test3 - Green** (never change without explicit developer approval)
   - Verified selectors (post-React, a11y-based) and the child-frame login quirk
   - `window.__spoDebug` programmatic verification API
   - Server start/stop lifecycle
   - Screenshot policy (sub-agent delegation only)
   The ordered Phase 0–8 smoke script and report format now live in the same file.
2. **[doc/E2E-POLICY.md](../../../doc/E2E-POLICY.md)** — the gate: which layer a change
   must reach, and what counts as proof. L3 is required only for pixels (renderer, layout,
   mobile, Electron) and pre-release; everything below the pixel is L2,
   `npm run test:live`.

## Scenario argument

`/e2e-test <scenario>`: `login` (Phases 0–2 only), `smoke` (full Phases 0–8, default),
`custom` (user describes the flow — still read-only, still the locked account).

## Hard rules

- Credentials LOCKED; Free Space (not BETA). `SPO_test3` **now holds the mayor role**, so
  road and zone flows are reachable — but this browser pass stays read-only; mutations
  belong to L2's round-trip probe, which restores what it writes.
- President functions are excluded from automated verification — notify the developer
  (doc/E2E-POLICY.md §7).
- Always run login first; always stop the server after; report per-phase PASS/FAIL.
- Never load screenshots into the main context — delegate to a sub-agent.
