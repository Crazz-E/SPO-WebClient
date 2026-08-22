# E2E Policy — The Pre-Push Gate

**Status:** Adopted 2026-08-21 · Supersedes the *layer decisions* in
[E2E-STRATEGY.md](E2E-STRATEGY.md) (its findings F1–F8 remain the reasoning trail)
**Procedure:** [E2E-TESTING.md](E2E-TESTING.md) — credentials, selectors, flow catalogue
**Companion:** [production-security-policy.md](production-security-policy.md)

This is the rule an automated session must satisfy before it may push. It is enforced by
`.claude/hooks/pre-push-gate.sh`, not by discipline: `git push` is blocked unless the
**bench worker** — the single process owning the live bench, see
[bench-worker.md](bench-worker.md) — has attested the current HEAD.

---

## 1. Why live, and why now

The mock-backend E2E layer planned in E2E-STRATEGY §2 (L2) was never built, and the reason
to build it has gone.

- A mock validates the client against *our model* of the Delphi server. Live validates it
  against the server. `OB-29` — *a tax write lands but the cached copy the client reads is
  never invalidated* — cannot be found by a mock **by construction**: the bug is precisely a
  divergence between the real cache behaviour and our model of it.
- The 2026-08-20 live WebSocket drive recorded in [civic-roles-reference.md](civic-roles-reference.md)
  produced `OB-28`, `OB-29` and `OB-31` in a single run.
- E2E-STRATEGY F2's justification for the mock investment was that the locked account could
  not exercise permission-gated features. `SPO_test3` now holds the **mayor** role, and a
  second account exists. That ceiling is gone.

The live layer also costs **zero new dependencies** — `ws` and `@types/ws` are already
production dependencies. `@playwright/test` was never installed.

**A crash is a failure, but silence is not a pass.** `OB-28` is *a write reported confirmed
when it was discarded*. The pass criterion for a mutation is the round-trip probe (§5), not
the absence of an exception.

---

## 2. The four layers

```
L0  Unit + component          Jest node/jsdom, coverage ratchet             CI: every PR
L1  Protocol conformance      Jest + rdo-mock + RdoStrictValidator          CI: every PR
L2  LIVE WS drive  ← the gate headless `ws` client -> gateway -> planitia   PRE-PUSH: every code change
L3  LIVE browser smoke        Playwright MCP, SPO_test3 / Crazz         UI/render/mobile diffs, + pre-release
```

L2 replaces both the abandoned mock-E2E plan and most of the browser smoke. L3 survives only
for what a WebSocket cannot observe: rendering, layout, input, mobile, Electron.

`src/mock-server/` is **not** a mock backend for L2 — it is the substrate of L1
(`rdo-mock`, `rdo-strict-validator`, `scenarios/`, `types/`, consumed by 19 suites under
`src/server/__tests__/`). It stays. Only its replay half was retired (§11).

---

## 3. The gate

The unit of enforcement is the **push**, not the commit.

1. Work on `feature/` `fix/` `refactor/` `doc/` — or the session's `claude-<user>/…`
   worktree branch. Never push `main` directly: the hook refuses it, and the ruleset takes
   PRs only.
2. **Commit freely** — no gate on commit. Each retry attempt is its own commit so the loop
   stays readable afterwards.
3. Before `git push`, run:

```bash
npm run gate
```

   It **prechecks locally** (`npm run typecheck`, `npm run lint`, `npm test` — free,
   parallelizable, consumes no bench slot), then **queues a job on the bench worker** and
   waits (one background command, zero tokens). The worker, in the depositing worktree:

   | Stage | Check |
   |---|---|
   | Clean bench | nothing listens on 8080; fingerprint the tree — uncommitted changes -> `DIRTY`, nothing runs (the attestation names a sha, so the tree must be that commit) |
   | Build | `npm run build` in the worktree — the tested gateway IS this tree's code |
   | Static (replayed) | typecheck, lint, tests — the attestation is the worker's, not the session's |
   | Exclusions | President members / Capitol governance in the diff -> **BLOCK**, emit manual-verify handoff (§7) |
   | Routing | map the diff to the required L2 flows (§4) |
   | Live | pre-flight, acquire the (now machine-global) lock, run the flows against planitia, release |
   | Attest | `report/e2e/gate-<sha>.json` in the worktree + `~/.spo-bench/verdicts/<sha>.json` |

4. The hook reads the **attestation** at push time and blocks unless it exists for HEAD,
   its verdict is `PASS`, the tree fingerprint was stable across the run (a moved tree is
   `STALE`, never PASS), it names the pushing worktree, and it is younger than
   `GATE_MAX_AGE_MINUTES` (default 60). **Only the worker attests** — `npm run gate:local`
   produces evidence for reading, not a push unblock.
5. CI re-runs L0/L1 on the PR — it cannot hold the locked credentials. The worker
   publishes the attestation as the `bench/gate` **commit status** once the sha reaches
   GitHub (automatic retry); branch protection requires it, so a PR cannot merge on CI
   alone. The detailed evidence rides in the PR body.

---

## 4. Routing — what the diff requires

The gate maps changed paths to required flows. A static script drifts and eventually tests
nothing that changed; the routing table is what keeps the run pointed at the delta.

| Diff touches | Required |
|---|---|
| `src/shared/rdo-*.ts`, `src/server/session/**`, `src/server/rdo.ts` | L1 + **L2 login spine + every flow touching the changed members** |
| `src/shared/types/message-types.ts`, `src/server/session/*-handler.ts` | L2 flows for the affected message types |
| `src/client/components/politics/**` | L2 `politics-read`, `politics-write` |
| `src/client/components/building/**` | L2 `building-details` |
| `src/client/renderer/**`, mobile layout, `*.module.css` | **L3** browser smoke (a WS drive cannot see a pixel) |
| `doc/**`, `*.md`, CI config, tooling | static only |

The **login spine** (connect -> auth -> directory -> world login -> company select ->
logoff) is appended to every L2 run regardless of routing. It is the cheapest possible
regression detector and it is where session-lifecycle breakage surfaces first.

Unmapped path -> the gate fails closed and asks for a routing entry. Silence is never a pass.

---

## 5. The round-trip probe

Every mutation exercised live uses this shape, and nothing else counts as verification:

```
read original -> write test value
              -> assert the FIVEMODELSERVER/Survival log line inside the run's UTC window
              -> read back
              -> restore original
              -> assert restored
```

The log line is the only evidence that is not the client agreeing with itself. Civic RDO
members log on entry, *before* their `try`, so a line proves the frame reached the object:

| Member | Log marker |
|---|---|
| `RDOSetTaxValue` | `Setting Tax value:` |
| `RDOSetMinSalaryValue` | `Setting Min Wage:` |
| town cache load | `Caching Town..` |

Read-back may legitimately lag the write (`OB-29`) — so a read-back mismatch **downgrades**
to `UNCONFIRMED`, it does not by itself fail the probe. A missing log line **fails**.

---

## 6. Safety rails

An autonomous loop mutating a production game world needs two rails a human run does not.

- **World-dirty lock.** If a run aborts before restore, `~/.spo-bench/world/world-lock.json`
  is left behind with the pending restores — one file for the whole machine, visible from
  every worktree. **All further live runs are blocked** until a human clears it. Attempt 2
  never starts on a world attempt 1 left mutated.
- **Single-flight.** Mechanical since 2026-08-22: the bench worker executes one job at a
  time ([bench-worker.md](bench-worker.md)). The lock file remains as the world-dirty
  carrier and as a belt-and-braces refusal for `gate:local` runs.
- **Bench ownership.** The gateway port, the LOCKED accounts and the world belong to the
  bench worker — sessions deposit jobs instead of starting gateways. Driving a browser
  needs a **lease** (`npm run dev`); `npm run dev:local` on another port is the conscious
  exception, for debugging, and attests nothing.
  Procedure: [E2E-TESTING.md](E2E-TESTING.md) § Server Lifecycle.

**Pre-flight** before any flow: gateway reachable, world date advancing (server alive), no
stale session for the account. A failed pre-flight is an **environment abort** — it does not
consume one of the three attempts (§8).

**Rate limit.** Since 2026-08-22 (developer decision) the queue is the throttle and the
numeric quotas stand aside for the test phase: interval 0, daily backstop 1000
(`E2E_MIN_INTERVAL_MINUTES`, `E2E_MAX_RUNS_PER_DAY`), gateway ceilings 1000/min
([bench-worker.md](bench-worker.md) §6). The SEC-N-3 login-storm protection now rests on
the worker's serialization; the knobs remain for tightening before any public deployment.

---

## 7. Exclusion — President functions

Out of scope for automated verification, permanently, because `SPO_test3` is not president
and the failure mode is severe.

The six `TPresidentialHall` members ([civic-roles-reference.md:101-106](civic-roles-reference.md)):

`RDOSetMinSalaryValue` · `RDOSetTownTaxes` · `RDOSitMayor` · `RDOSitMinister` ·
`RDOBanMinister` · `RDOSetMinistryBudget`

— plus any Capitol path behind `canGovern` (false for `SPO_test3`).

> When the diff touches these, the gate **BLOCKS** and emits `MANUAL-VERIFY-REQUIRED`
> naming the members, the flow to exercise and what to look for. The push stays blocked
> until the developer confirms they ran it themselves. **The session must notify the user
> and must never mark the change verified on its own.**

Blocking rather than warning is deliberate: `civic-roles-reference.md:112-115` documents
that `RDOSitMinister` exists in two variants with different argument types that a
name+arity catalogue **cannot tell apart**, and the wrong variant on a `procedure` is the
arbitrary-memory-write case from `CLAUDE.md`. That is exactly the change no automated gate
should wave through.

Clearing the block is explicit and auditable:

```bash
npm run gate -- --manual-verified="<what you ran, and the result>"
```

---

## 8. The failure loop

Gate fails -> write a hypothesis -> fix -> re-run. **Maximum three attempts**, and each
attempt must name a root cause **different** from the previous one. Repeating a hypothesis
ends the loop immediately.

Not every red run consumes an attempt:

| Class | Consumes an attempt? | Action |
|---|---|---|
| **My change is wrong** | Yes | Diagnose, fix, re-run |
| **Environment** (server down, maintenance, network, pre-flight fail) | No | Backoff + retry; after 2, abort as `blocked: environment` |
| **Flake** (passes on re-run, no code change) | No | Record; 2 flakes on one flow -> quarantine + backlog entry |
| **The criterion was wrong** | — | **Stop and ask.** Never launder a bad requirement into a code change |

The last row is `CLAUDE.md`'s existing rule ("never modify a test to make it pass") applied
to the loop. **Not yet machine-enforced** — `verify-gate.js` records `--attempt` in the
artifact but does not compare attempts; the rule "attempt *N* must not touch a test file
that was failing at attempt *N-1*" is a review convention until a gate stage carries the
previous attempt's failing set. Mechanical today: the worker's fingerprint (`STALE`), the
clean-tree rule (`DIRTY`), the President exclusion (`BLOCKED`) and the hook.

**On exhaustion:** push the branch, open a **draft** PR titled `blocked: …`, attach the
evidence and all three hypotheses, do not merge, hand back. Work is never discarded.

Structured output, not a chat message: the report is appended to
[BACKLOG-OPEN.md](BACKLOG-OPEN.md) with the three hypotheses, what each predicted, and what
actually happened. That is the input that makes the next session start ahead of zero.

---

## 9. Accounts

| Account | Password | Holds | Used for |
|---|---|---|---|
| `SPO_test3` | `test3` | Mayor of **Helartia**, Minister of Agriculture, company *SPO_test3 - Green* | Primary. Governance reads and writes, roads, zones |
| `Crazz` | `test` | Second party — a real account, holdings not enumerated here | Permission-negative, mail receive, rating another tycoon's term. **Read-only apart from the test mail it receives.** |

Both are **LOCKED** — never changed without explicit developer approval. Zone **Free Space**,
world **planitia**.

Two accounts unlock four things that were structurally impossible:

| Now testable | Why it matters |
|---|---|
| **Negative permission** — drive `Crazz` at the Town Hall, assert `canGovern=false` and that the control is *absent*, not merely disabled | Catches the `tycoonratings.asp:24-25` failure mode (guard commented out, result hardcoded `true`) in our own client |
| **Mail send -> receive** | Genuinely end-to-end for the first time; send was previously untestable |
| **Ratings** | `OB-30`: nobody can rate their own term. `Crazz` rating `SPO_test3` is a real path |
| **Roads / zones** | Mayor role removes these from the "structurally untestable" list |

**Blast radius.** All mutations happen on `SPO_test3`'s own town (Helartia). The second
account is touched **only** by `mail-roundtrip`, which sends it one message and deletes it
in the same run — no flow reads or writes its buildings (`flows.ts`: it appears at the
login in `permission-negative`, which does not mutate, and as the mail recipient).
Never another player's assets. Never a world-scope value. Every mutation is restored in
the same run (§5).

---

## 10. Artifact format

`report/e2e/gate-<sha>.json` — gitignored, per-machine, summarised into the PR body:

```jsonc
{
  "head": "<sha>", "branch": "fix/…", "verdict": "PASS|FAIL|BLOCKED",
  "createdAt": "2026-08-21T09:12:44.101Z",
  "static": { "typecheck": "PASS", "lint": "PASS", "test": "PASS" },
  "routing": { "changed": ["src/…"], "required": ["login-spine", "politics-write"] },
  "live": {
    "world": "planitia", "account": "SPO_test3",
    "window": { "from": "…Z", "to": "…Z" },
    "flows": [{ "name": "politics-write", "status": "PASS",
                "probes": [{ "member": "RDOSetTaxValue", "logLine": "Setting Tax value: 12",
                             "restored": true, "readBack": "CONFIRMED" }] }]
  },
  "exclusions": { "presidentMembersTouched": [], "manualVerification": null },
  "attempt": 1
}
```

---

## 11. What was retired

`src/mock-server/`'s replay half — `capture-store.ts`, `replay-engine.ts`,
`mock-ws-client.ts`, `index.ts`, `test-helpers.ts` and the three
`__tests__/integration/` suites — had **zero consumers** outside its own directory and
existed to serve the L2 mock backend that this policy deletes. `MockWebSocketClient` never
opened a socket; it was pure in-memory replay, so it could not be retargeted at the live
gateway.

The L1 half — `rdo-mock.ts`, `rdo-strict-validator.ts`, `http-mock.ts`, `types/`,
`scenarios/` — is load-bearing and untouched.

---

## 12. Commands

```bash
npm run gate                     # local precheck -> bench job: build, static, routing, live, attest
npm run gate -- --static-only    # skip the live layer (docs/tooling diffs)
npm run gate -- --flows=login-spine,politics-write
npm run gate -- --manual-verified="…"   # clear a President BLOCK after a human verified (§7)
npm run test:live                # the L2 drive as a bench job
npm run dev                      # bench LEASE: this worktree's gateway held on 8080 for you
npm run dev:release              # ...and give it back as soon as you are done
npm run bench:status             # worker liveness + queue
npm run e2e:unlock               # clear a world-dirty lock after a human restore
npm run finish                   # after the merge: main ff'd, refs pruned, worker reinstalled if needed, worktree + branch gone

npm run gate:local               # verify-gate directly — evidence for reading, no push unblock
PORT=8081 npm run dev:local      # a debug gateway of your own — attests nothing
```
