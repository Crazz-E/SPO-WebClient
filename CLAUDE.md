# CLAUDE.md — Starpeace Online WebClient

Browser-based multiplayer tycoon client, wire-compatible with the original Delphi
Starpeace Online servers. TypeScript + Node.js + WebSocket + Canvas 2D isometric.
RDO protocol. Beta — version = latest `v*` tag / GitHub Release.

```
Browser Client --WebSocket--> Node.js Gateway --RDO/TCP--> Delphi Game Servers
```

**The RDO protocol is the project.** Everything else is replaceable; a wire divergence is
not. Treat RDO work as the highest-stakes work in the repo.

**This file carries the trigger and the decision. The mechanism and the history live in
[doc/](doc/)** — `.claude/hooks/context-router.sh` serves the right one from the prompt,
before planning. Start from [architecture-overview.md](doc/architecture-overview.md).

## Never do these

- Construct RDO protocol strings manually — always `rdoCall` / `rdoGet` / `rdoSet` from
  `@/shared/rdo-frame`, with `RdoValue` arguments
- Use `any` — `unknown` in catch blocks, typed interfaces for data
- Modify a file without reading it first
- Ship code without tests — new/modified lines must reach ≥ 93 % coverage
- Modify without discussion: `src/shared/rdo-types.ts`, `src/shared/rdo-frame.ts`,
  `src/server/rdo.ts`, `src/__fixtures__/*`, `jest.config.js` (thresholds only go UP) —
  **enforced**: `scripts/check-pr-rules.js` runs inside the required CI check and fails the
  PR unless the maintainer posted the `rdo-approved` label. It also fails a change to
  `rdo-members.ts` whose PR body cites no `File.pas:Line`, and any lowered Jest threshold
- Load screenshots into the main context during debug/E2E — delegate to a sub-agent
- Add a UI element without wiring its action — no dead buttons

## Working rules

- **Simplest solution that meets the criterion.** No abstraction built for a hypothetical
  future need — solve the case in front of you.
- **No new external dependency without asking first.** Explain what it brings and what is
  lost without it, then wait for the answer.
- **Explain design choices without jargon**, as to someone who does not program.
- **Never modify a test to make it pass.** A failing test means the code is wrong, or the
  criterion was badly stated — in that case, ask.
- **An ambiguous request is a question, not a guess.** Ask before implementing.

## RDO — one catalogue, one emitter

**The separator is not a decision.** It follows from the member's kind, and the emitter derives
it. Nothing else in the codebase writes one.

| file | role |
|------|------|
| `src/shared/rdo-members.ts` | the catalogue — one entry per member actually emitted, with its `kind` (`function` / `procedure` / `accessor`) and `arity` |
| `src/shared/rdo-frame.ts` | the emitter — `rdoCall` / `rdoGet` / `rdoSet` / `rdoIdOf`, and the five frame forms |

```ts
rdoCall('ObjectAt', targetId, RdoValue.int(x), RdoValue.int(y))   // -> "^", 2 args, checked
rdoGet('WorldName', targetId)
rdoSet('Stopped', targetId, RdoValue.int(-1))
```

`.packet` feeds `sendRdoRequest`; `.toFrame()` feeds `writeRdoFrame`.

### Adding or changing a member

The catalogue is a census of what the client emits, not a copy of the Pascal. To add an entry
you need the member's **kind** and **arity**, and the only authority for those is the server-side
declaration in `../SPO-Original/Rdo/Server/` — read it with **`delphi-archaeologist`**,
cite `File.pas:Line`, and never probe the live server. Get it wrong and the server has no
self-recovery: `"^"` on a `procedure` leaves a result pointer nobody pops (**freeze**); `"*"` on
a `function` writes through a register nobody set (**arbitrary memory write**); `"^"` with no rid
builds a reply with no destination (**crash**). Arity follows the same register file —
`ParamCount` comes from the *received* array (`RDOObjectServer.pas:218`), args land `EDX` →
`ECX` → stack (`:266-277`). The type system carries all three: an uncatalogued member does not
compile, a wrong argument count throws, the separator cannot be hand-written.

### Two rules the catalogue does not encode

1. **Verb follows the reference client, not the declaration.** `get` on a 0-arg `function` is
   correct and is what Voyager emits (`GetProperty` falls through to `CallMethod`,
   `RDOObjectServer.pas:112-116`). `set` has no fallthrough — a missing property returns
   `errUnexistentProperty` (`:176`).
2. **A form the reference client demonstrably emitted wins over what the declaration suggests.**
   Explain why it works, then follow it; never silently "fix" a working call.

`src/server/session/rdo-request-guards.ts` still guards what the catalogue says nothing about:
forbidden members, session-lifecycle members, connection-bound members, buffer depth.
## Legacy Delphi source — `../SPO-Original`

Sibling of this repo, Delphi 5, ~1750 `.pas` — **both halves of the original system**, the
Delphi servers *and* the Voyager client. Its own git repo (`Crazz-E/SPO-Original`), a
**read-only historical artifact**: never write into it, never probe the live server instead.
Every claim from it cites `File.pas:Line`, or is marked `[INFERRED]` / `[UNKNOWN]`. Read the WSL copy — the Windows
mount (`/mnt/c/Users/Crazz/Documents/SPO/SPO-Original`) is the same commit with CRLF.

| Path | Holds |
|------|-------|
| `Rdo/Server/` | **the RDO authority** — `RDOObjectServer.pas`, the declaration the client must match (kind, arity) |
| `Rdo.BIN/`, `Rdo.IS/` | divergent forks of the same units — do not cite them: a line number from `Rdo/` lands on other code there |
| `Voyager/`, `Voyager.1/` | the original Delphi client — the reference for *what the client demonstrably emitted* (rule 2 above) |
| `Kernel/`, `Model Server/`, `Interface Server/`, `Directory Server/` | game model and the servers behind the gateway |

⚠ **Some `.pas` files are ISO-8859-encoded and defeat grep's binary detection** — a plain
`grep <pattern> some-file.pas` silently returns nothing and exits 1, as if the text were absent
(`Kernel/KernelCache.pas`, `rc4.pas`, `MediaNameGenerator.pas`, `PublicFacility.pas` at least;
`file *.pas` names them "ISO-8859 text"). Use `grep -a` or the Read/Grep tools — never conclude
a name is absent on an unqualified `grep`. Never re-encode a file to work around it.

⚠ [spo-original-reference.md](doc/spo-original-reference.md) indexes the tree but is
hand-maintained and **has misclassified a member's kind before**. For kind or arity, open the
`.pas` and read the declaration; the index is a finding aid, not an authority.
## Legacy web source — `../SPO-ASP`

The other half of the original client: the **ASP pages IIS serves**, where the Politics, News
and campaign screens actually live. A separate tree from `SPO-Original`.

```
../SPO-ASP/Five/<n>/Visual/Voyager/...   the per-world instances, 0..5
../SPO-ASP/Five/<n>/language/*.lng       the UI strings the pages interpolate
../SPO-ASP/Five/Visual/...               the template the instances were cut from — DIFFERENT
```

**Cite `Five/0`.** The six instances are byte-identical to each other and `Five/0` is the path
the gateway fetches (`buildAspUrl`, `spo_session.ts:927`); the bare `Five/` template diverges,
so a line number from it lands on other code.

Two things the pages are the authority for, and the Pascal is not:

- **What the reference client demonstrably emitted** — `rdoModifyRating.asp:24-27` shows the
  `BindTo(TownHallId)` and the argument order for `RDOSetRatingFrom`.
- **Which controls a player was actually offered.** Read the guard, not just the markup: a
  `<select>` can ship inside a `display: none` div that only a `canModify`-gated handler
  reveals (`tycoonratings.asp:53`, `:76`, `:149-151`). ⚠ And read the ASP, not the comment —
  `tycoonratings.asp:24-25` has the real test commented out and the result hardcoded `true`.

`Five/Client/Cache/` is the client's **map image** cache (`images.cab`), not the model server's
object cache — it cannot tell you what a cached property currently holds.

## Directory-scoped memory

Four nested `CLAUDE.md` files load automatically in their directory and are authoritative there
— read them rather than guessing:

| File | Covers |
|------|--------|
| `src/server/CLAUDE.md` | RDO socket rules, session phases, handler extraction, push dispatcher, timeout categories |
| `src/shared/CLAUDE.md` | RDO type prefixes, boolean encoding, type modules, error handling |
| `src/mock-server/CLAUDE.md` | Mock RDO server API, scenarios, match hierarchy, strict validator |
| `src/client/CLAUDE.md` | Client structure and conventions |

## Backlog — GitHub Projects

**All open work lives on the kanban:**
[github.com/orgs/Crazz-Org/projects/1](https://github.com/orgs/Crazz-Org/projects/1) — every
task is a GitHub issue on the board, and a working session starts with **`/next-task`**.
The rulebook is [doc/kanban-workflow.md](doc/kanban-workflow.md): six columns (Todo · In
progress · Gate · PR · Done · Needs triage), the `Session` field as ownership marker, board
writes at state transitions only, the model routing, and which board workflows are on.

**Ownership is sacred** — never touch a card whose `Session` is filled; every owner closes its
ownership (Done or Needs triage). A session that dies without closing it leaves a card only the
human may free (`.github/workflows/orphan-cards.yml` only comments; it frees nothing).

**One session per area:** a card also carries an `Area` — the one part of the tree its change
lands in — and a session claims the topmost Todo card whose area no live card already holds.
`docs` never blocks; every other area does. The reservation expires with the session heartbeat
(`SPO_WORKTREE_IDLE_MIN`, 120 min), the card's `Session` field never does.

**Order, where it exists, is a `blocked by` link** between two issues — the relation lives on
the issue, not on the card. `/next-task` reads the whole blocked set in one GraphQL call and
does not claim a card whose blocker is still open: it skips it and names the skip, or refuses
out loud when that card was the one it was handed. A dependency
records *cannot start yet*, never priority — priority stays the human's vertical order in Todo.

**GitHub reads are budgeted like board writes.** One account's quota — 5000 GraphQL points per
hour — is shared by every session, worktree, workflow and PC. A `gh project item-list` costs
~103 points; the composite claim read costs ~2. So a session reads the pool **once**, at claim,
with the recipe in [kanban-workflow.md § GitHub API discipline](doc/kanban-workflow.md); it
never polls GitHub for a state that has a local surface (bench verdict, nightly, heartbeats —
all under `~/.spo-bench/`); it asks `rateLimit { cost remaining resetAt }` in every
hand-written GraphQL call; and on `RATE_LIMITED` mid-claim the **write half decides** — a
half-made claim is never walked away from, because it leaves a card only a human can free.

**Stay on the claimed card.** A session solves and implements the task it took, and reports on
that task only. What it met in passing — an unrelated snag noticed while reading, a smell in a
file it did not change, a "valuable but out of scope" remark — is neither filed nor narrated:
no new issue, no closing section of the end report. A test session or a requested audit finds
it again, at a moment where someone asked for it. Only the maintainer widens a session's scope.

**Filing a card is a deliberate act** — `/triage-report`, a maintainer's request, or the split
of a claimed task that turned out to be two. `Auto-add to project` then puts the issue on the
board and sets `Status` to Todo, so it lands straight in the pool `/next-task` reads — no
`item-add`, no column set by hand. What no workflow sets is `Category`, `Size` and `Area`; those
stay the filer's job, along with the matching `cat:` / `size:` labels.
**Every draft card is read first by the `card-reviewer` sub-agent** — which checks those three
fields too, `Area` included, because the claim rule reads it and a card filed without one
reserves no ground — whose dated verdict becomes the card's first comment; on `DO NOT FILE` no
issue is created.

**The board is written in English — all of it**, whatever language the session, the source or
the conversation was in: titles, bodies, every comment, columns, fields, labels. Translate on
the way in; never transcribe. The former `doc/BACKLOG*.md` files are deleted; their text is
archived at commit `94b059a0`.

## Environment

**WSL2 (Linux) on a Windows 11 host** — bash inside WSL, repo at `/home/<user>/SPO-WebClient`,
Node.js 22 / npm 10 in WSL (`/usr/bin/node`). Everything the project needs runs inside WSL.

- Use Claude Code tools (Read, Grep, Glob, Edit, Write) rather than shell `grep`/`find`/`cat`/`sed`.
  The permission allowlist deliberately excludes those shell aliases.
- Processes: `ps` / `kill` inside WSL; `tasklist` / `taskkill` only for host-side processes
- Line endings: LF only (`.gitattributes` and `.editorconfig`) — never introduce CRLF
- Minimum supported runtime is Node 22 (`engines`, the Dockerfile's `node:22`, CI)
- `jq` (1.7+) is required by `npm run board:claim`, which slurps gh's paginated pages into one
  program; `apt install jq`

## Commands

```bash
npm run build        # server + client + terrain-test
npm run typecheck    # all three tsconfigs (server, client, e2e)
npm run lint         # ESLint 10, flat config — 0 errors is the CI gate
npm run format       # Prettier over the whole tree (not enforced yet, see below)
npm test             # full Jest suite
npm run test:coverage
npm run test:changed # --onlyChanged --bail

npm run gate         # THE GATE — a bench job for the PUSHED sha (queued, serialized).
                     # Commit, push and open the PR FIRST; it refuses a sha that is not on origin
npm run test:live    # the L2 live drive as a bench job
npm run dev          # a bench LEASE: the worker builds THIS worktree and holds its gateway on 8080 for you
npm run dev:release  # end your lease early (otherwise it expires, 30 min default)
npm run bench:status # worker liveness + queue
npm run bench:wait -- <job-id>   # re-attach to a job whose wait was interrupted. `gate` and
                     # `test:live` already wait; this is for the wait you lost, not a second one
npm run pr:wait -- <n>           # wait for a PR to leave the merge queue: 30 s floor, deadline,
                     # exit 0 merged / 1 closed unmerged / 4 still open. NEVER hand-roll this loop
npm run e2e:unlock   # clear a world-dirty lock after a human restore
npm run finish       # THE END of an update, after the PR is merged — see the Git section.
                     # `-- <branch>` finishes a merged branch checked out nowhere; `-- --now`
                     # removes this worktree immediately (you lose your cwd)
npm run deps:gate    # Dependabot PRs: merges main in, installs, gates, pushes and auto-merges them one by one;
                     # a lockfile change routes to spine + building-details

npm run dev:local    # build + start yourself, on the first free port from 8081 up — never 8080.
                     # The CONSCIOUS EXCEPTION (see below); PORT=<n> to choose. A hook refuses any
                     # other way of taking the bench port.
npm run gate:local   # verify-gate.js directly — evidence for reading; does NOT unblock a push
```

**The live bench has one owner: the bench worker.** Many sessions run on this machine, but
port 8080, the LOCKED accounts and the Helartia world state belong to one permanent process
(systemd --user unit `spo-bench-worker`, installed by `scripts/bench-install.sh`). Sessions
never start a gateway, never kill a process, never hold a lock: they deposit a job and wait for
the report — one background command, zero tokens. **Background it with the tool's own
`run_in_background`, never with a trailing `&`**: the shell then reports the fork rather
than the run, so the exit code is 0 whatever happened and the verdict is destroyed before
anyone reads it. The redirect to a log file is fine and needs no permission; only the
ampersand does. Jobs run one at a time, oldest first,
each in the depositing session's worktree, which the worker builds. `npm run dev:local` is the
conscious exception, for debugging only — its results attest nothing.
`.claude/hooks/bench-port-guard.sh` refuses every other route to the port and to the live
world, naming the sanctioned form in the refusal.

**Read the verdict from the exit code, never from the printed report** — 0 PASS · 1 verdict not
passing · 2 refused at deposit (dirty tree) · 3 worker down · 4 wait timed out. The
machine-readable surfaces are that code and `~/.spo-bench/verdicts/<sha>.json`. **And a
pipeline's exit code is the last stage's**, so never pipe a command whose exit code is the
verdict: `npm test | tail -20` reports *tail*, and has already been read here as a green suite
that had failed. Redirect to a file, capture the code, then filter the file. **A trailing `&`
loses it the same way** — the shell reports the fork, so the code is 0 whatever happened;
background with the tool's own `run_in_background`, keeping the redirect, which is fine on its
own. So does `out=$(npm test)`, which keeps the text and drops the number. Full spec:
[doc/bench-worker.md](doc/bench-worker.md).

## Automation (`.claude/hooks/`)

| Hook | Event | Does |
|------|-------|------|
| `context-router.sh` | UserPromptSubmit | Points at the relevant docs/skills before planning |
| `typecheck-guard.sh` | PostToolUse (Edit\|Write) | Flags the tree dirty on `.ts`/`.tsx` writes — no work, ~0 ms |
| `sanctuarize.sh` | Stop | Runs `npm run typecheck` once per turn if dirty; blocks the turn on failure |
| `pre-push-gate.sh` | PreToolUse (Bash) | Blocks a **direct push to `main`** — nothing else. It cannot demand an attestation for HEAD: the worker gates a *pushed* sha |
| `bench-port-guard.sh` | PreToolUse (Bash) | Blocks anything that would take the bench port (8080) or drive the live world outside the worker; names the sanctioned form |
| `verdict-pipe-guard.sh` | PreToolUse (Bash) | Blocks piping a command whose exit code **is** the verdict (`npm test\|tail` reports tail, not Jest). Escape: `set -o pipefail` or a `PIPESTATUS` read |
| `poll-loop-guard.sh` | PreToolUse (Bash) | Blocks the two ways a verdict gets lost while waiting: a trailing `&` on a verdict command (the shell reports the fork — always 0), and a hand-rolled wait loop (`until`/`while`/`for` + `sleep`) on a bench job or a GitHub read. Names `run_in_background`, `npm run bench:wait` or `npm run pr:wait` |
| `driver-scope-guard.sh` | PreToolUse (Bash\|Edit\|Write\|NotebookEdit) | Refuses the **driver of a claimed card** writing to a tracked file itself — `Edit`/`Write`, and the Bash verbs that reach the tree without them (`sed -i`, `>`, `rm`, `chmod`, `git rm`, `npm run format`). Armed by a verified `board:take`, inert otherwise; the execution sub-agent passes (`agent_id`) |
| `session-heartbeat.sh` | *sourced by the others* | Stamps `~/.spo-bench/sessions/<key>.alive` so `finish` never reaps a worktree a session is working in |

`npm test` and `npm run build` stay manual — run them before declaring a session complete.

## Testing — four layers, and the push gate

```
L0  Unit + component          Jest node/jsdom, coverage ratchet           CI: every PR
L1  Protocol conformance      Jest + src/mock-server/ (rdo-mock, strict   CI: every PR
                              validator) — NOT a mock backend for E2E
L2  LIVE WS drive  <- gate    src/e2e/, headless `ws` -> gateway ->       PRE-MERGE: every code change
                              planitia. `npm run test:live`
L3  LIVE browser smoke        Playwright MCP, SPO_test3 / Crazz       pixels only, + pre-release
```

**The gate.** The bench gates a **pushed commit**, not your worktree, so the order is
**commit → push → open the PR → `npm run gate`**. **Open the pull request before gating**:
`ci.yml` triggers on `pull_request`, so a branch with no PR has no CI run for its sha and the
worker replays the entire Jest suite on the exclusive bench — the slowest path, which has
already killed a gateway mid-job. **Only the worker attests**; `npm run gate:local` is evidence
for reading, never a merge unblock. **A crash is a failure, but silence is not a pass**: a
mutation is proven by the `FIVEMODELSERVER/Survival` log line, not by a `success: true`
response (`OB-28`); a lagging read-back is expected (`OB-29`) and does not fail a probe, a
missing log line does. Three attempts maximum, each naming a different root cause. Full rules:
[doc/E2E-POLICY.md](doc/E2E-POLICY.md), [doc/bench-worker.md](doc/bench-worker.md).

**The nightly proves `main`.** The gate proves branches, each against the `main` it was based
on — so two branches that pass alone and break together would land unchallenged. Once a night
the worker drives the L2 flows against `origin/main`, answer in
`~/.spo-bench/nightly/latest.json`. **While `main` is red** (verdict `FAIL` and the sha is still
`origin/main`), `/next-task` hands out only the repair and **no session merges `origin/main`
into its branch** — updating from `main` must never import a defect
([bench-worker.md §8](doc/bench-worker.md)).

`module.ts` → `module.test.ts`, same directory. Two Jest projects: `unit` (node, `.test.ts`)
and `component` (jsdom, `.test.tsx`).

**Two coverage numbers — do not conflate them.** New/modified lines must reach ≥ 93 %,
enforced by `npm run coverage:changed` (`scripts/coverage-changed.js`, run by `gate:precheck`
and by CI on every PR; `COVERAGE_CHANGED_MIN` overrides the floor). **That script IS the
precheck's suite pass** — `--collectCoverageFrom` restricts instrumentation, not execution, so
running `npm test` beside it runs the whole suite twice. `jest.config.js` separately enforces a
machine floor (global 38 %, higher per directory). Thresholds only go UP. Details:
**`spo-testing`** skill.

Seven custom RDO matchers: `toContainRdoCommand`, `toMatchRdoFormat`, `toMatchRdoCallFormat`,
`toMatchRdoSetFormat`, `toHaveRdoTypePrefix`, `toMatchRdoResponse`, `toPassStrictRdoValidation`.

## Skills, commands, sub-agents

20 skills installed — inventory in [manifest.json](.claude/skills/manifest.json), regenerate
with `node .claude/generate-skills-manifest.js` (`--check` in CI fails if stale).

**Project skills, invokable via `/name`:**

| Skill | For |
|-------|-----|
| `delphi-archaeologist` | Reverse-engineering `../SPO-Original`, tracing RDO handlers |
| `spo-testing` | Tests, coverage, fixtures, L1 substrate, RDO matchers |
| `dependencies` | Vulnerability audit, licences, package updates |
| `e2e-test` | L3 live browser smoke (user-invoked only) |

**Auto-load only** (not slash-invokable): `web-games` (Canvas 2D renderer, frame budget),
`zustand-store-ts` (stores, selector stability), `mobile-ux-optimizer`
(MobileShell/BottomNav/BottomSheet). The 13 community skills are listed in the manifest.

Slash **commands** live in `.claude/commands/`: `/next-task`, `/gate`, `/commit-push`,
`/coverage-check`, `/e2e`, `/release-notes`, `/triage-report`.

**Sub-agents** (`.claude/agents/`), read-only:

| Agent | Model | Use for |
|-------|-------|---------|
| `security-reviewer` | Opus | WebSocket auth, RDO parsing, session management, OWASP |
| `performance-analyzer` | Opus | Renderer bottlenecks, chunk caching, frame budget |
| `card-reviewer` | Fable | The neutral reader of a draft backlog card, before it is filed |

## Delegation strategy

- **Skills first** — they load into the main conversation, keep context unified, cost nothing to spawn
- **Sub-agents** for work that produces heavy intermediate output: screenshot reads
  (mandatory), cross-corpus RDO audits, deep multi-file investigations
- **Explore agents** (up to 3 in parallel) when scope is genuinely uncertain
- **Direct tools** for anything targeted — never spawn an agent for a one-liner
- **Never delegate understanding.** Do not write "based on your findings, fix the bug."
  Synthesise the agent's results yourself, then act.
- **Model routing — the driver is the expensive part.** The main loop re-reads its whole
  context every turn, so drive on the cheapest model the step needs and escalate by
  delegating, never the reverse. Haiku 4.5 for scripted steps (board reads and writes, gate
  wait, PR/merge/`finish`); Fable 5 for planning and diagnosis; Sonnet 5 for ordinary
  execution; **Opus 5 only where being wrong is not caught by a test** — the RDO wire, an
  `L`-sized card, an unreproduced defect. Effort follows the card's `Size` (S low · M medium ·
  L high). Step table: [kanban-workflow.md § Model routing](doc/kanban-workflow.md). A session
  that cannot switch its own model applies the routing to its sub-agents.

## MCP

| Server | For |
|--------|-----|
| Playwright | Browser automation, E2E |
| GitHub | PRs, issues, code search — same account quota as `gh`; kanban-workflow.md § GitHub API discipline binds it too |
| Context7 | Live library docs (TS, Jest, Node) |

## E2E credentials — LOCKED

| | Primary | Secondary |
|---|---|---|
| Account | `SPO_test3` / `test3` | `Crazz` / `test` |
| Holds | **Mayor of Helartia**, Minister of Agriculture, company *SPO_test3 - Green* | basic, 2 buildings |
| For | governance reads and writes, roads, zones | permission-negative, mail receive, rating another term |

**Never change without explicit developer approval.** Zone **Free Space**, not BETA — the
live directory hosts `planitia`/`shamba`/`zorcon` under Free Space; BETA only has `aries`.

- **Blast radius:** mutations only on Helartia. The second account receives one test mail,
  deleted in the same run — no flow touches its buildings. Never another player's assets,
  never a world-scope value.
- **Capability exceptions, not overrides.** The six `TPresidentialHall` members and any
  `canGovern`-gated Capitol path need the president capability, which `SPO_test3` does not
  hold. The gate reads that from the server (`IsPresident` in the tycoon cache, `canGovern` on
  the Capitol), never from the UI: a missing control is a bug to fix, a refused capability is a
  recorded exception the gate continues past. If the server ever grants it, the gate fails
  closed until a flow drives the member — no flag, no human text, clears it
  ([E2E-POLICY.md](doc/E2E-POLICY.md) §7).

Procedure and selectors: `/e2e-test` skill and [E2E-TESTING.md](doc/E2E-TESTING.md).

## Live server logs — http://158.69.153.134/logs/

An open IIS directory listing, no auth — this is how a live run is proved rather than assumed.
**Reading a log is not probing the server.** It is also not a substitute for the Pascal: a log
proves what *happened*, the declaration in `../SPO-Original/Rdo/Server/` defines a member's
kind and arity. Download and grep; the Survival log runs 2–3 MB/day, too big for context.

| Path | Carries |
|------|---------|
| `FIVEMODELSERVER/Survival <YY-MM-DD>.log` | **the one that matters** — civic RDO members log on entry, *before* their `try`, so a line here proves the frame reached the object (`Setting Tax value: …`, `Setting Min Wage: …`, `Caching Town..`) |
| `FIVEMODELSERVER/TimeWarp <date>.log` | a periodic world snapshot — who holds each ministry, per-town vacancies and average salaries. Small (~20 KB), good for checking model state without replaying a session |
| `FIVEINTERFACESERVER/Survival <date>.log` | `LOGON ATTEMPT: User=<name>` / `Start Disconnecting <name>` — which identity (human vs role company) was active at a given second |
| `FIVECACHESERVER/`, `FIVEMAILSERVER/` | near-empty, rarely useful |

## Code style

TypeScript strict. camelCase vars/methods, PascalCase classes/interfaces. `unknown` in catch
blocks + `toErrorMessage(err)` from `@/shared/error-utils`. JSDoc for public API only.
Small, focused changes.

`eslint.config.js` encodes what is a rule here and what is a deliberate shape — read the
comments before turning something off. CI fails on any ESLint **error**; warnings are a
backlog, not a gate. Prettier is configured (`.prettierrc.json`) but **not enforced**: the
tree has never been formatted, so `npm run format` would rewrite ~440 files at once. Format
what you touch, or make that sweep a commit of its own.

## Git

**Nothing gates a local commit or the push — the gate is on the merge.** Commit freely on a
branch; each retry attempt is its own commit so the loop stays readable. Then **push, open the
pull request, and gate that sha**, in that order: the worker *fetches* the commit it judges, so
"no push without an attestation" and "no attestation without a push" cannot both hold.
`.claude/hooks/pre-push-gate.sh` refuses one thing only — a direct push to `main`.

**`main` is governed by one ruleset that binds the owner too** (empty bypass list): PR required
(0 approvals — solo maintainer), `typecheck + tests` **and** `bench/gate` required, no
force-push, no deletion. CI cannot hold the locked credentials, so the worker publishes its
verdict as the `bench/gate` commit status — a PR cannot merge on CI alone.

**The branch is deliberately NOT required to be up to date with `main`** — that rule made every
merge invalidate every other session's gate, at a cost growing as N² on a serialised bench.
Instead each attestation records `baseMain`, the `origin/main` it was judged against, and `main`
having moved past it is *announced* (status description, gate report, a `NOTE:` from the push
hook) — not refused. **Read the note and judge**: if the incoming `main` touches the same
ground, merge `origin/main` in and re-gate. Live evidence rides in the PR body.
[bench-worker.md §5, §11](doc/bench-worker.md).

**`main` has a merge queue** — so `gh pr merge <N> --merge` **enqueues**; it does not merge.
Every `gh pr merge` here — the correct form included — prints one stderr warning,
`! The merge strategy for main is set by the merge queue`, and exits 0: **expected and
benign**, not a failure. The queue's method is `MERGE`, so a `--squash` or `--rebase` you pass
is **overridden, not refused**; pass `--merge` so the command says what will happen. Judge on
the **exit code and the PR state, never on stderr text** — in doubt, one REST call settles it:
`gh api repos/Crazz-Org/SPO-WebClient/pulls/<N> --jq '{state,merged}'` (`open` = enqueued).
Never "recover" a merge that did not fail. **Never add `--delete-branch`**: `gh` honours it the
instant the entry is created, destroying it and leaving the PR CLOSED and unmerged — same exit
0, same warning. GitHub deletes the branch itself when the entry lands. Recovery:
`git push -u origin <branch>` + `gh pr reopen <N>` + merge again, same sha
([bench-worker.md §12](doc/bench-worker.md)).

**`gh pr edit` does not work on this repository.** Every invocation fails with `GraphQL:
Projects (classic) is being deprecated …`, exit 1, **and applies nothing** — on stderr, so a
piped or backgrounded call reads as success while the PR is unchanged. Use REST: `gh api -X
PATCH repos/Crazz-Org/SPO-WebClient/pulls/<N> --input <json>`.

**The same deprecation kills the _bare_ `gh pr view` and `gh issue view`.** Both ask for
`projectCards`, so `gh pr view <N>` and `gh issue view <N>` exit 1 on
`(repository.pullRequest.projectCards)` / `(repository.issue.projectCards)` and print nothing
usable — the error is on stderr, so a piped or backgrounded call reads as success again.
**`--json` never touches that field and works**: `gh pr view <N> --json state`,
`gh issue view <N> --json state,title`. That is why nothing in the tree is broken — every
caller already passes it (`scripts/finish.sh:188,208,215`, `scripts/deps-gate.sh:61`). Read a
PR or an issue with `--json`, or with REST (`gh api repos/Crazz-Org/SPO-WebClient/issues/<N>`).
⚠ `.github/workflows/claude-review.yml:123` allowlists the bare `gh pr view`, so the review
agent meets the same wall. `gh pr create`, `gh pr merge` and `gh issue list` are unaffected.

**An update is finished only after `npm run finish`.** It refuses unless the PR is MERGED, then
fast-forwards `~/SPO-WebClient`, prunes stale refs, reinstalls the bench worker if the merge
touched `src/e2e/bench/` or `scripts/bench-*`, and **retires** this worktree — it stays on disk
while a session stands in it, and the next run reaps it (it also heals worktrees a previous
session forgot). **A session may keep working after `finish`**: a process standing in the
worktree and the heartbeat in `~/.spo-bench/sessions/` both protect it
(`SPO_WORKTREE_IDLE_MIN` 120 min, `SPO_RETIRED_IDLE_MIN` 15 min). `npm run finish -- --now`
removes immediately, for a human on the way out.

**The last link is the release:** every merge to `main` runs `release.yml` — version from the
last `v*` tag and the commits since it (`feat` → minor, otherwise patch), then build, tag,
publish. Never create `v*` tags by hand (a tag ruleset forbids updating or deleting them).

Branches: `feature/`, `fix/`, `refactor/`, `doc/` + description — or the session worktree
branch (`claude-<user>/…`); the hook accepts any branch but `main`.
Commits: `type: short summary` — `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`.

## Transparency

When posting a change summary, an end report, or a plan, list the skills used to produce it.
