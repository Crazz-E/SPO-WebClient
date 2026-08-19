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
2. **[doc/E2E-SCENARIO.md](../../../doc/E2E-SCENARIO.md)** — the ordered L3 live smoke
   script (Phases 0–8, read-only) and report format.
3. **[doc/E2E-STRATEGY.md](../../../doc/E2E-STRATEGY.md)** — where live smoke fits (L3);
   anything deeper belongs to L2 specs against the mock backend, not to a live run.

## Scenario argument

`/e2e-test <scenario>`: `login` (Phases 0–2 only), `smoke` (full Phases 0–8, default),
`custom` (user describes the flow — still read-only, still the locked account).

## Hard rules

- Credentials LOCKED; Free Space (not BETA); no destructive game actions; no road/zone
  tests live (account lacks mayor role — mock scenarios cover those).
- Always run login first; always stop the server after; report per-phase PASS/FAIL.
- Never load screenshots into the main context — delegate to a sub-agent.
