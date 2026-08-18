# The capture process — how a played journey becomes a regression test

**Established 2026-08-18.** This is the project's primary way of producing RDO regression tests.
It replaces the certification sweep, which is deleted (see
[report/plan-certification-rdo-rev4.md](../report/plan-certification-rdo-rev4.md) §1).

> **The AI dictates the test, the human plays it, the AI records it.**
> — the developer, 2026-08-18

---

## 1. Why this and not something else

**What the client does in production is safe by construction.** It runs every day. We do not
demonstrate it — we record it.

The consequence that matters: **it is structurally impossible to emit a frame the client cannot
produce.** A human clicks, the client emits what it always emits. That was the fatal flaw of the
previous approach, which probed members nobody calls and left a shared production server answering
`errMalformedQuery` to every query for 3 h 42 min.

Second consequence: **nothing has to be guessed.** No separator to choose, no arity, no socket, no
precondition chain. The UI sequences it; the capture records it.

**Measured, 2026-08-18:** five captures → 1 383 exchanges, six sockets, 88 RDO members (8 of them
server pushes). The seven hand-written suites total 22 calls.

---

## 2. The three commands

```bash
# 1. start the gateway in capture mode  (builds first)
npm run dev:record -- <journey-name>

# 1-bis. same thing without rebuilding, when dist/ is already fresh
node scripts/dev-record.js <journey-name>

# 2. …play the journey in the browser at http://localhost:8080, then stop the gateway…

# 3. convert the log into a scenario
npm run capture:convert -- logs/capture-<name>-<stamp>.ndjson --name <name> --sid <session-id>
```

`dev-record.js` sets the three variables the logger reads (`src/shared/config.ts:171-176`):
`LOG_LEVEL=debug`, `LOG_JSON=true`, `LOG_FILE=logs/capture-<name>-<UTC stamp>.ndjson`. Every frame the
gateway puts on or takes off the wire lands there as `RDO>> ` (synchronous request), `RDO>* `
(fire-and-forget push) or `RDO<< ` (incoming).

`logs/` is gitignored. Raw captures are never committed.

---

## 3. The three discipline rules

**One page load per journey.** A reload opens a **new gateway session with a new `sid`**, and the
converter then refuses to guess which one was meant. If it happens: stop, relaunch, replay. It costs
two minutes, not a journey.

**Do not wander.** Every panel opened out of curiosity puts frames into the final scenario.

**Two to three seconds of pause between gestures.** This leaves clean time boundaries in the log, so
one capture can later be sliced into several scenarios if wanted.

**Log off through the UI, not by closing the tab.** That produces `ClientNotAware` then `Logoff` and
releases the `ClientView` server-side.

---

## 4. Credentials

Locked by `CLAUDE.md`: `SPO_test3` / `test3` · zone **Free Space** · world **planitia** · company
**SPO_test3 - Green**. The Mayor-of-Helartia role is carried by the same account since 2026-08-18, so
role-switch journeys need no second account.

**Passwords cannot leak into a capture.** The gateway redacts authentication frames at the source —
`call RDOLogonUser "^" "%<user>","%[REDACTED]"` via `redactRdoRaw` (`src/server/spo_session.ts:118`),
which handles even the doubled-quote case (a past leak, fixed). Verified on the P5 capture: every
occurrence of the password fragment was part of the username, none was the password. The converter
additionally turns it into a `{{password}}` variable, and a validation test asserts *"never contains
literal credentials"*.

**Usernames DO appear in clear** in the raw log and the generated scenario. `capture:convert --var`
can substitute them if ever needed.

---

## 5. After the conversion — two mandatory steps

**5.1 Register the scenario.** The validation list is hand-maintained, and the file says so:

```ts
// src/mock-server/scenarios/captured/captured-scenarios.validation.test.ts
import { myJourneyCapturedScenario } from './my-journey-captured.scenario';
const CAPTURED: RdoScenario[] = [ …, myJourneyCapturedScenario ];
```

Without this the scenario exists but **nothing validates it**. The four checks are: resolves without
dangling `{{placeholders}}`, contains no literal credentials, every client-initiated exchange is
matchable without crossing members, `pushOnly` exchanges stay out of request matching.

**5.2 File the findings.** Every journey produces observations. They go in
[BACKLOG-OPEN.md](BACKLOG-OPEN.md) — **a finding that only lives in a session report is lost.**

And be careful with the word "bug": of the seven "impossibilities" reported across the 2026-08-18
journeys, **five were perfectly correct behaviour**. Verify in the code before filing.

⚠ Generated scenarios under `scenarios/captured/` are **never hand-edited**. To change one, re-capture
and re-convert.

---

## 6. What a journey can and cannot reach

**Can:** anything a user can do through the UI. That is the definition of the scope — a member no UI
reaches is either dead code or an unfinished feature, not a coverage gap.

**Cannot, and it is not a failure:**

- **World state.** Voting needs an open election, launching a campaign needs the right period,
  connecting needs a supplier in range. Replay the journey on a favourable day.
- **Permissions.** Roads on `planitia` require a public-service role — proven: the same
  `CreateCircuitSeg` answered `res="#22"` as a player and `res="#0"` as mayor. **A refusal captured
  alongside its success is a better regression test than a success alone.**
- **Members with no UI.** `GetChannelInfo`, `Save` (mail draft) and five other live WS handlers that
  nothing calls — **OB-8**.

**A refusal is a valid capture.** The repo already ships
`road-build-rejected-captured.scenario.ts`, a rejected road build captured from the original Delphi
client.

---

## 7. Traps met on 2026-08-18, all real

**The server was not restarted, and there is no startup banner.** Do not conclude "no restart
happened" from the absence of a banner — there is never one. Use the indirect markers. See the
`starpeace-server-logs` skill.

**Server logs are UTC, the dev machine is UTC+2.** Convert before concluding anything about
freshness. This trap has bitten twice.

**`require()` will not start the gateway.** `dist/server/server.js:1436` guards on
`require.main === module`. `dev-record.js` spawns it as a child process for exactly this reason.

**`cmd.exe` eats `^` in npm script arguments.** A `--description` containing parentheses or commas
comes out peppered with `^`. Keep converter arguments free of shell metacharacters, or call
`node dist/tools/convert-rdo-capture.js` directly.

**Do not guess member names.** `SetZone` and `BuildRoad` do not exist — the real ones are `DefineZone`,
`CreateCircuitSeg`, `WipeCircuit`, `BreakCircuitAt`. Read the handler, or read the capture.

**Never use the bulk "disconnect all warehouses" button.** It emits `RDODisconnectFromTycoon`, which
the inventory classifies `excluded:irreversible` (issue #44). Remove connections line by line.

**The asset sync costs ~2 min at every start** (`UpdateService`, 4 steps, before the gateway declares
itself ready — the client shows *"Preparing your empire"*). It is HTTP, so it never pollutes the RDO
capture.

---

## 8. Journeys played so far

Scripts live in [doc/parcours/](parcours/) (in French — they are operational notes for the developer,
not project documentation). Each carries its result.

| Journey | Scenario | Exchanges |
|---|---|---:|
| P5 — build | `construire` | 125 |
| P6+P7+P10+P11+P12 — chained | `parcours-enchaine` | 474 |
| P13 — communication, favourites, management | `communication` | 240 |
| P8 — public service: role switch, zoning, roads | `service-public` | 152 |
| P14 — the last members | `derniers-membres` | 392 |

The journey table with per-domain status is in
[report/plan-certification-rdo-rev4.md](../report/plan-certification-rdo-rev4.md) §6.
