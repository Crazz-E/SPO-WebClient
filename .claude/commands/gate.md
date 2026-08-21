---
description: Run the pre-push gate — static checks, President exclusion, and the L2 live drive against planitia
argument-hint: "[--static-only|--flows=a,b|--manual-verified=...]"
allowed-tools: Bash(npm run gate*), Bash(npm run test:live*), Bash(npm run e2e:unlock*), Bash(git status*), Bash(git diff*), Bash(git log*), Read, Grep, Glob
---

# Pre-Push Gate

Run the gate for the current HEAD, passing `$ARGUMENTS` through when given:

```bash
npm run gate
```

**The rules are [doc/E2E-POLICY.md](../../doc/E2E-POLICY.md)** — do not restate or reinvent
them here. What matters when reading the result:

- **A crash is a failure, but silence is not a pass.** A mutation is proven by the
  `FIVEMODELSERVER/Survival` log line, not by a `success: true` response (`OB-28`).
- A **read-back mismatch is not a failure** — the Town Hall's cached copy lags the write by
  up to two minutes (`OB-29`). A **missing log line is** a failure.
- `BLOCKED` on President members means a person must verify it. Report that to the
  developer with the members named; never clear it yourself.
- `ENVIRONMENT` does not consume one of the three attempts.
- If the world is left dirty, say so loudly: every later live run is blocked until a human
  restores the values and runs `npm run e2e:unlock`.

Report the verdict, the flows that ran, each probe's log-line and restore result, and
whether an L3 browser pass is still owed.
