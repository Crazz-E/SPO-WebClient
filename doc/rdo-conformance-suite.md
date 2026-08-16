# RDO Conformance Suite

> `src/tools/conformance/` · CLI `npm run conformance -- …` · plan and lot log:
> `report/plan-outil-conformite-rdo.md` (French).

A protocol conformance suite that drives the **real `StarpeaceSession`** — the production
formatter, guards, timeouts and error contract — through a catalogue of frames, each with an
oracle, and folds the replies into verdicts, a JSON report, an exit code, an optional
byte-level baseline diff, and a wire recording. It runs **offline** against a recording
(replay transport) or **live** against a Delphi server (TCP transport). It replaces the
one-shot probe harness of lot L9-pré (`rdo-probe.ts`, removed 2026-08-16).

There is no UI in the loop. Rendering, stores and Canvas stay with the component tests and
the Playwright campaign.

## 1. Architecture

```
  suites.ts (catalogue: declarative steps + imperative hooks)
        │
  runner.ts ──── ConformanceRunner ── real StarpeaceSession ── setSocketFactory(transport)
        │            · resolves clientView / interfaceServer ids           │
        │            · risk gate (target × flags)               ┌──────────┴──────────┐
        │            · stop on silence, frame budget       replay-transport.ts    transport.ts
        │            · verdict = oracle.evaluate()          ReplaySocket + RdoMock  net.Socket + tap
        ▼                                                   over a recording        (LiveTransport)
  report.ts  → RunReport JSON · human log · exit code · Baseline record/diff
  run.ts     → one run end to end (login → suites → graceful Logoff → files)
  cli.ts     → argument parsing; every refusal that keeps a frame off a server by accident
```

The seam is `StarpeaceSession.setSocketFactory()`. Nothing in `src/server/` was changed for
the tool except one additive field: `RdoServerError.payload` (the raw reply text, so an
`error 3 setting X` reply keeps its bytes for the baseline).

## 2. Usage

```bash
npm run conformance -- --help                       # every flag, every suite name

# Offline, from the shipped recording (CI). Exit 1 on any FAIL, unanswered frame, or baseline drift.
npm run conformance -- --suite all \
    --recording report/campaign/rec/planitia-2026-08-16.ndjson \
    --diff-baseline report/campaign/rec/planitia-2026-08-16-baseline.json

# Live, shared server, READS ONLY, logs correlated — the canonical run (§8 runbook).
npm run conformance -- --suite types,separators,errors,lifecycle,reads,map,focus,inspector,chat,mail,politics,research \
    --transport live --live --target shared --company "SPO_test3 - Green" --server-logs \
    --record report/campaign/rec/planitia-<date>.ndjson \
    --record-baseline report/campaign/rec/planitia-<date>-baseline.json \
    --report report/campaign/rec/planitia-<date>-run.json

# Live, dedicated instance: everything including mutations (self-cleaning), same outputs.
npm run conformance -- --suite all --transport live --live --target dedicated --server-logs \
    --record report/campaign/rec/dedicated-<date>.ndjson --record-baseline report/campaign/rec/dedicated-<date>-baseline.json
```

| Flag | Meaning |
|------|---------|
| `--suite <a,b\|all>` | suites to run: `types`, `separators`, `errors`, `lifecycle`, `reads`, `mutations` |
| `--only <suite/step,…>` | restrict to named steps |
| `--transport replay\|live` | default `replay`; `replay` needs `--recording <file.ndjson>` |
| `--live` | second, explicit yes for `--transport live` |
| `--target shared\|dedicated` | default `shared`: every `mutation` step is skipped |
| `--allow-variant-on-procedure` | enable the one `"^"`-on-a-procedure step; **never** with `--suite all` |
| `--company <name>` / `--no-company` | select this company after login (default `SPO_test3 - Green`, the reference flow: EnableEvents, PickEvent, cookies, ClientAware); `--no-company` stays before selection |
| `--server-logs [base]` | after logoff, fetch the public server logs (default `http://158.69.153.134/logs`) and bracket the session by `ClientViewId`: `Clients` exit code, MS heartbeat gaps, IS anomalies; a pathology fails the run |
| `--server-logs-settle <ms>` | wait before fetching (default 5000 — the `Clients` row is written at disconnect) |
| `--report <file.json>` | write the full `RunReport` (session facts, per-step wire, server-log verdict) |
| `--record <file>` | write the wire (both directions, credentials redacted) — a gateway-log-dialect NDJSON that `npm run capture:convert` accepts unchanged |
| `--record-baseline <file>` / `--diff-baseline <file>` | write / compare the reply bytes per step |
| `--json` | print the `RunReport` on stdout instead of the human log |
| `--strict` | `UNKNOWN` verdicts fail the run too (default lenient — plan §6 Q3 pending) |
| `--frame-budget <n>` | hard cap on frames per run (default 200) |
| `--user / --pass / --world / --zone` | overrides; env `SPO_PROBE_USER` / `SPO_PROBE_PASS` |

The session logger is set to `warn` by the CLI unless `LOG_LEVEL` is already set. In replay
mode the company-list HTTP fetch is pointed at loopback and fails fast — the one `ERROR` line
about `logonComplete.asp` on `127.0.0.1` is expected and harmless.

## 3. Verdicts and exit code

| Verdict | When |
|---------|------|
| `PASS` | the reply satisfies the step's expectation |
| `FAIL` | it does not — **or the frame went unanswered**, whatever the expectation |
| `UNKNOWN` | the step has no expectation (observed only) |

Exit code: `1` on any `FAIL`; `1` on any `UNKNOWN` under `--strict`; `1` when a suite stopped
on silence; `1` when `--diff-baseline` reports a changed or missing step; `2` on a CLI
refusal; else `0`.

Expectations (`types.ts`): `exact` (bytes), `pattern` (regex), `errorCode` (with optional
payload grammar), `predicate`, `answered`. An `A<id> error N;` reply is an **answer** — the
literal-parser steps are judged on `error 3` vs `error 4`, the `"^"`-on-procedure step on
`error 9`. Silence is the only failure the runner treats as fatal: one unanswered frame ends
the suite and the run, because the request thread on the server may be gone.

## 4. Suites

Grouped by the property they pin. Every step cites its evidence (capture line, live probe
with date, or `File.pas:Line`); an inference says `[INFERRED]` in its intent and uses a
pattern wide enough for what the source promises.

| Suite | Pins | Mutations |
|-------|------|-----------|
| `types` | `$` on `string` properties (live 2026-08-16), `#` on integers, `%` on OleVariant function results, literal parser: `#1`, `#-1`, `@1`, `@1234.5`, `!3.14` all answer `error 3 setting RdoConfProbe` (server decimal separator is `.`) | none |
| `separators` | `"^"` on a function → `res=`; `set` acked `A<id> ;`; **`"^"` on the 0-parameter procedure `ClientAware` → `error 9`** (gated) | none |
| `errors` | `error N setting X` (RDOQueryServer.pas:344), `error N getting X` (:278, `[INFERRED]` N=5 through the GET→CallMethod fallthrough), bare `error 5` on an unknown method (RDOObjectServer.pas:326) | none |
| `lifecycle` | `RDOCnntId` connection-bound `$`, `ServerBusy` boolean, `PickEvent`, `GetCompanyCount` | none |
| `reads` | world properties on the InterfaceServer, tycoon cookie blob grammar. Map / focus / details / mail / politics wait for a dedicated instance with known objects | none |
| `map` | `idof WSObjectCacher` (map socket), `ObjectsInArea` / `SegmentsInArea` at the tycoon's camera position, `SetViewedArea` push, `GetSurface ZONES`, observation of the pushes that follow | none |
| `focus` | `SwitchFocusEx` on the first building of the area (CRLF reply, live 2026-08-16), `UnfocusObject` push | none |
| `inspector` | cacher round trip (`CreateObject` → `SetObject` `#-1` → `GetPropertyList` → `CloseObject "*"`), tycoon role (`SetPath Tycoons\<user>.five\`), inspector open / tab data (skipped when the template has no such tab) / refresh / release | none |
| `chat` | `GetChannelList`, `JoinChannel "",""` (lobby, as login does), `GetUserList`, `GetChannelInfo` | none (session-scoped) |
| `mail` | `LogServerOn`, `CheckNewMail`, Inbox listing (HTTP), `OpenMessage / GetHeaders / GetLines / GetAttachmentCount`, `CloseMessage "*"`+QueryId ack — first live observation of the corrected form 2026-08-16 | none |
| `politics` / `research` | `RDOFavoritesGetSubItems`; research inventory on the first owned facility (skipped when none) | none |
| `mutations` | fire-and-forget `SetTycoonCookie` (3-parameter procedure → `"*"` without QueryId) then `GetTycoonCookie "^"` read-back; `SayThis "*"` + QueryId acked empty; **self-cleaning** last step clears the cookie | `--target dedicated` only |

**Scenario steps** (`scenario-suites.ts`) drive a session READ method and are judged on the frames it produced,
read back from the transport recorder (`wire-view.ts`): `ctx.scenario(member, fn)` names the key frame; every
frame lands in `outcome.wire`; `derived()` steps judge other members of the same exchange without emitting; a
missing precondition (`StepSkip`) is reported as SKIPPED, not FAIL. A method that throws after the server answered
is a **client failure** (FAIL, the suite goes on); a method whose key frame went unanswered is silence (the run stops).

**Live runs so far:** `report/campaign/conformance-run-2026-08-16.md` (planitia, read-only, 54 PASS / 0 FAIL, server
logs clean). The recording `report/campaign/rec/planitia-2026-08-16.ndjson` replays the whole run offline
(`--recording`), the baseline `…-baseline.json` diffs it.

## 5. Safety — the suite as a living application of M8

1. **Static.** `KNOWN_PROCEDURES` (suites.ts) folds in the production `VOID_MEMBERS` and adds
   `ClientAware`, `ClientNotAware`, `SetTycoonCookie`, `SetLanguage`, each with its Pascal
   declaration cited. `assertSuitesSafe()` runs at module load: any declarative step that would
   put `"^"` on a procedure with parameters cannot exist; a 0-parameter one must declare
   `risk: 'variant-on-procedure'`. Imperative steps get the same check at emit time.
   Adding a member here requires `File.pas:Line` — the declaration, never a call site.
2. **Session.** `assertNotVariantOnVoidMember` still runs inside `sendRdoRequest`; the tool
   never bypasses it.
3. **Target.** `mutation` steps are skipped on `shared`; a suite carrying one must document
   its `reset` (asserted).
4. **Runtime.** Stop on silence; frame budget; graceful `Logoff` on every path (`finally`).
5. **CLI.** `--live` is a second explicit yes; `--allow-variant-on-procedure` refuses `all`.

Never send an arbitrary object id: `TObject(ObjectId)` is a raw pointer cast on the server
(`RDOObjectServer.pas:77`, `:136`, `:205`). There is deliberately no `errIllegalObject` step.

## 6. Recording and replay

`LiveTransport` taps both directions of every socket the session opens and emits NDJSON in the
gateway wire-log dialect (`RDO>> / RDO>* / RDO<<`, `meta.raw`). Credentials are redacted at
record time. `ReplayTransport.fromNdjson()` groups the entries by socket purpose
(`directory_auth`, `directory_query`, `world`, …), builds one `RdoScenario` per socket with the
same converter `capture:convert` uses, and answers each outgoing frame from the exchange whose
request is byte-identical (QueryId aside) and not yet consumed — then, only then, through
`RdoMock`'s flexible matching. A `SET` literal that was never recorded stays unanswered on
purpose: the literal is the probe. The directory auth and query legs run in parallel on two
sockets; per-socket buckets keep their session ids apart.

The offline test suite proves the mechanism: `replay-transport.test.ts` logs the real session
in over the planitia `login-full` capture (2026-07-03) with no `net` mock.

**Recording shipped:** `report/campaign/rec/planitia-2026-08-16.ndjson` (230 frames, live run 2026-08-16,
credentials redacted) — the CI replay input; refresh it with `--transport live … --record`.

**Node trap (fixed 2026-08-16):** `net.Socket.prototype.connect` resets an overridden instance `write`; the tap
re-installs itself on `connect` (`transport.ts`), covered by a real-socket test.

## 7. Status and what is still blocked

- **Done:** L1–L4, the read-only scenario suites, server-log correlation, and a first green live
  run on the shared server (2026-08-16, 54 PASS) whose recording + baseline are shipped in
  `report/campaign/rec/`. That baseline covers READS on planitia; re-accept it explicitly
  (`--record-baseline` on a green run) whenever a legitimate server-side change is confirmed.
- **Blocked:** the `mutations` suite and every mutation of `report/campaign/coverage-matrix.md`
  need the dedicated instance (or an explicit go on the shared one) plus the developer's answers
  Q1–Q11; L6 (mock switch-over) needs the parallel session's commit and an explicit go.
- Open policy question: `UNKNOWN` failing CI (default lenient; `--strict` exists). Cadence is settled
  by the git gate (§11): replay then live before every git sync.

## 8. Runbook — one live run, start to finish

**Pre-flight (5 min)**
1. Authorization: a live run against the SHARED server is reads only, on the locked account
   (`SPO_test3` / Free Space / planitia / `SPO_test3 - Green`, CLAUDE.md); anything else needs the
   developer's explicit go for that run. Never `--allow-variant-on-procedure` with `--suite all`.
2. Tree is green: `npm run typecheck`, `npx jest src/tools` (the suite's own 140+ tests).
3. If a step or suite was ADDED since the last run: re-verify in `../SPO-Original` that every member
   it calls with `"^"` is a `function` (`grep -n "function  Member" …`), and that every `procedure`
   travels as a push (`"*"`, no QueryId) or, for `VOID_MEMBERS`, as `"*"`+QueryId. Write the
   citation into the step's `intent`. `assertSuitesSafe()` catches the declarative cases at load;
   scenario steps are checked at emit — the grep is the human double check.
4. Network: the directory host (`www.starpeaceonline.com:1111`), the world IP, and the log endpoint
   (`http://158.69.153.134/logs/`, plain HTTP) must be reachable; `cache/BuildingClasses/classes.bin`
   present (else every building gets the generic inspector template — the run still works).

**Run** — the canonical command of §2 (`--transport live --live --target shared --company … --server-logs
--record --record-baseline --report`), output redirected to `report/campaign/rec/planitia-<date>-console.log`.
Sequential, one session, ~40 s for the 12 read suites (230 frames). It stops itself at the first unanswered
frame or when the frame budget (400) is hit, and always logs off (`finally`).

**Read the result**
- Verdict lines: `ok  ` / `FAIL` / `??  ` (observation, no oracle) / `skip <reason>`; the summary line counts
  them; `STOPPED ON SILENCE in: <suite>` means an unanswered frame — do **not** replay blindly, look at the
  server logs first.
- `[server-logs]` block: `bracket: found` with our `ClientViewId` is the join; `Clients row … exit code 0`,
  `MS heartbeat gaps: 0` and `IS anomalies: 0` is a clean session. An anomaly line is surfaced, not judged:
  the IS `Survival` log is global, so first check `GetUserList` in the recording for other players online
  before attributing it to us. Clock offset (server − ours) is printed; expect a few seconds, recalibrated
  per run.
- Exit code: 0 clean; 1 on FAIL / silence / baseline drift / server-log pathology; 2 on a CLI refusal.

**After the run**
- Write `report/campaign/conformance-run-<date>.md` (French): command, per-step table (generate it from
  `…-run.json`), server-log correlation, what was learned, updated A/A′/B/C classification, divergences to
  arbitrate. Add a dated entry to `report/plan-outil-conformite-rdo.md` §9.
- Keep `…-console.log`, `….ndjson`, `…-baseline.json`, `…-run.json` in `report/campaign/rec/`. The newest
  recording is the CI replay input; the newest accepted baseline is the diff reference.
- Nothing here commits: the developer decides.

## 9. Extending the catalogue

- **Frame step** (`suites.ts`): `{ id, intent, target, packet, expect, risk? }`. `intent` cites the evidence
  (capture line, live date, or `File.pas:Line`; `[INFERRED]` when none). Reads default to `risk` unset;
  anything that changes server state is `risk: 'mutation'` and lives in a suite with a `reset`. A `call`
  member must be a Delphi `function`, or a `procedure` sent with `separator: '"*"'` and listed in
  `VOID_MEMBERS`; a new procedure goes into `KNOWN_PROCEDURES` with its declaration cited. Add the
  step's expectations to `suites.test.ts` (shape) and, when the wire is known, an exchange to the
  fake recording in `run.test.ts` / `scenario-suites.test.ts`.
- **Scenario step** (`scenario-suites.ts`): `run: ctx => ctx.scenario('<KeyMember>', s => s.<readMethod>(…))`;
  read what an earlier step found from `ctx.state` and throw `StepSkip('reason')` when it is missing;
  use `derived(id, intent, markKey, member, expect)` to judge other members of the same exchange without
  emitting again. `SessionDriver` (types.ts) is the allow-list of session methods a scenario may call —
  widen it only for READ methods, and say so in its comment. Extend the fake driver in
  `scenario-suites.test.ts` with the frames the real method emits (copy them from a capture or from the
  latest recording).
- **Oracles**: prefer `pattern` wide enough for legitimate variation (CRLF vs LF, empty results, negative
  ints, doubled quotes) and tight on the type prefix; `exact` for acks and fixed literals; `errorCode` +
  payload grammar for error replies. An `UNKNOWN` (no `expect`) is an observation and is left out of the
  baseline.
- **Recording / baseline refresh**: run live with `--record --record-baseline`, read the diff against the
  previous baseline, and only then replace the files. Re-acceptance is a decision recorded in the run report.

## 10. Troubleshooting

| Symptom | Cause | Do |
|---|---|---|
| Every scenario step FAILs with `no <Member> frame was emitted` on the FIRST live run of a build | the write tap was reset by `net.Socket.connect` (fixed 2026-08-16; regression test on a real socket) | rebuild the bundle (`npm run conformance` does), check `transport.test.ts` still passes |
| One `ERROR … logonComplete.asp … 127.0.0.1` line in replay | replay points the company-list HTTP fetch at loopback on purpose | ignore; `company selected … (id unknown — HTTP company list empty)` is expected in replay |
| `lifecycle/serverbusy-poll` takes ~8 s | `get ServerBusy` is slow server-side (7.7 s live 2026-08-16); the FAST 60 s deadline covers it | nothing; do not put ServerBusy on a critical path |
| `inspector/tab-supplies` / `tab-products` skipped | the first building of the area has no such tab (a Town Hall on planitia at 939,994) | acceptable; a "second building" strategy is the next improvement |
| `research/inventory` skipped | the account owns no facility | acceptable on the locked test account |
| `--allow-variant-on-procedure` refused | combined with `--suite all` | name `separators` explicitly — and ask whether re-running a settled question is worth a `"^"`-on-procedure frame |
| `--transport replay` step unanswered → 60 s wait then FAIL | the recording has no exchange for that exact request (SET literals are matched exactly on purpose) | record the flow live first, or restrict with `--only` |
| `[server-logs] no Clients row` | fetched before the server wrote the disconnect row | raise `--server-logs-settle` |
| Jest prints session DEBUG lines | `LOG_LEVEL` unset in that test file's process | the CLI sets `warn` via `quiet-log.ts`; tests tolerate the noise |

## 11. The git gate — replay, then live, before any git sync

Developer rule (2026-08-16), replacing the earlier cadence statements (nightly / before release):

1. **Step 1 — memory socket.** `npm run conformance -- --suite all --recording report/campaign/rec/<latest>.ndjson
   --diff-baseline report/campaign/rec/<latest>-baseline.json`. Must exit 0 (no FAIL, no silence, no baseline drift).
2. **Step 2 — live.** Only if step 1 reported no error: the canonical live command of §2 / §8 (reads only on the
   shared server, `--server-logs`). Must exit 0, including a clean server-log verdict.
3. **Git sync** (`git commit`, `git push`) is possible only once both are validated **on the current sources**.

Mechanism: every run that exits 0 writes its transport's entry into `.conformance-gate.json` at the repo root
(gitignored, per machine): `{ replay: { finishedAt, exitCode, suites, world, target }, live: {…} }`. A run that
fails leaves the file as it was and says so (`[gate] run failed …`). The PreToolUse hook
`.claude/hooks/conformance-gate.sh` intercepts `git commit` / `git push` in any Bash command and runs
`node .claude/hooks/conformance-gate-check.js`, which passes only when both entries exist with exit 0, live is
not older than replay, and no file under `src/` has a modification time later than either run. Otherwise the
tool call is blocked (exit 2) with the two commands to run. Check by hand any time:
`node .claude/hooks/conformance-gate-check.js`.

Consequences to keep in mind: any edit under `src/` after the runs re-arms the gate (that is the point);
docs-only commits are gated too (the rule says "sources", the hook does not try to be clever — run the two
steps, they take ~1 min); the gate is local state, so a fresh clone starts blocked.
