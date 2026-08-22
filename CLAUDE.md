# CLAUDE.md — Starpeace Online WebClient

Browser-based multiplayer tycoon client, wire-compatible with the original Delphi
Starpeace Online servers. TypeScript + Node.js + WebSocket + Canvas 2D isometric.
RDO protocol. Beta — version = latest `v*` tag / GitHub Release.

```
Browser Client --WebSocket--> Node.js Gateway --RDO/TCP--> Delphi Game Servers
```

**The RDO protocol is the project.** Everything else is replaceable; a wire divergence is
not. Treat RDO work as the highest-stakes work in the repo.

## Never do these

- Construct RDO protocol strings manually — always `rdoCall` / `rdoGet` / `rdoSet` from
  `@/shared/rdo-frame`, with `RdoValue` arguments
- Use `any` — `unknown` in catch blocks, typed interfaces for data
- Modify a file without reading it first
- Ship code without tests — new/modified lines must reach ≥ 93 % coverage
- Modify without discussion: `src/shared/rdo-types.ts`, `src/server/rdo.ts`,
  `src/__fixtures__/*`, `jest.config.js` (thresholds only go UP)
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
cite `File.pas:Line`, and never probe the live server.

Why it matters, mechanically: `"^"` on a `procedure` leaves a result pointer nobody pops
(**freeze**); `"*"` on a `function` makes it write through a register nobody set (**arbitrary
memory write**, no self-recovery); `"^"` with no rid builds a reply with no destination
(**crash**). Arity follows the same register file — `ParamCount` comes from the *received* array
(`RDOObjectServer.pas:218`), args land `EDX` → `ECX` → stack (`:266-277`).

The type system now carries all three: an uncatalogued member does not compile, a wrong argument
count throws, and the separator cannot be written by hand.

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

`~/SPO-Original` — sibling of this repo (`../SPO-Original` from the project root), Delphi 5,
114 MB, ~1750 `.pas`. It holds **both halves of the original system**: the Delphi servers *and*
the Voyager client. Its own git repo (`Crazz-E/SPO-Original`), a **read-only historical
artifact** — never write into it, never probe the live server instead. Every claim from it
cites `File.pas:Line`, or is marked `[INFERRED]` / `[UNKNOWN]`.

| Path | Holds |
|------|-------|
| `Rdo/Server/` | **the RDO authority** — `RDOObjectServer.pas`, the declaration the client must match (kind, arity) |
| `Rdo.BIN/`, `Rdo.IS/` | divergent forks of the same units (345 / 359 / 364 lines) — do not cite them: a line number from `Rdo/` lands on other code there |
| `Voyager/`, `Voyager.1/` | the original Delphi client — the reference for *what the client demonstrably emitted* (rule 2 above) |
| `Kernel/`, `Model Server/`, `Interface Server/`, `Directory Server/` | game model and the servers behind the gateway |

A copy of the same tree also sits on the Windows mount
(`/mnt/c/Users/Crazz/Documents/SPO/SPO-Original`) — same commit, identical content, but CRLF.
Read the WSL copy.

[spo-original-reference.md](doc/spo-original-reference.md) indexes it, but ⚠ **it is
hand-maintained and has misclassified members before** — it once listed a `procedure` as a
`function` because it cited a late-bound *client* call site instead of the server declaration.
For a member's kind or arity, open the `.pas` and read the declaration; the index is a finding
aid, not an authority.

## Legacy web source — `../SPO-ASP`

The other half of the original client: the **ASP pages IIS serves**, which is where the
Politics, News and campaign screens actually live. Not in `SPO-Original` — the two are
separate trees, and `doc/` cited `tycoonratings.asp` line numbers for months with no way to
open them.

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

Four nested `CLAUDE.md` files carry the local rules and load automatically when you work in
their directory. They are authoritative for their area — read them rather than guessing:

| File | Covers |
|------|--------|
| `src/server/CLAUDE.md` | RDO socket rules, session phases, handler extraction, push dispatcher, timeout categories |
| `src/shared/CLAUDE.md` | RDO type prefixes, boolean encoding, type modules, error handling |
| `src/mock-server/CLAUDE.md` | Mock RDO server API, scenarios, match hierarchy, strict validator |
| `src/client/CLAUDE.md` | Client structure and conventions |

## Documentation

The `UserPromptSubmit` hook (`.claude/hooks/context-router.sh`) points at the right
knowledge base from the prompt, before planning. It is the index — this file no longer
duplicates it. Everything lives in [doc/](doc/); start from
[architecture-overview.md](doc/architecture-overview.md) or
[BACKLOG.md](doc/BACKLOG.md) for history.

## Environment

**WSL2 (Linux) on a Windows 11 host** — the working shell is bash inside WSL, with the repo at
`/home/<user>/SPO-WebClient`. Node.js 22 / npm 10, installed in WSL (`/usr/bin/node`).
PowerShell on the host is only needed for what WSL cannot do: signing and running the packaged
Electron installer.

- Use Claude Code tools (Read, Grep, Glob, Edit, Write) rather than shell `grep`/`find`/`cat`/`sed`.
  The permission allowlist deliberately excludes those shell aliases.
- Processes: `ps` / `kill` inside WSL; `tasklist` / `taskkill` only for host-side processes
- Line endings: LF only (`.gitattributes` and `.editorconfig`) — never introduce CRLF
- Minimum supported runtime is Node 22 (`engines` in package.json, `node:22` in the Dockerfile,
  Node 22 in CI). The Electron shell bundles its own Node.

## Commands

```bash
npm run build        # server + client + terrain-test
npm run typecheck    # all three tsconfigs (server, client, e2e)
npm run lint         # ESLint 10, flat config — 0 errors is the CI gate
npm run format       # Prettier over the whole tree (not enforced yet, see below)
npm test             # full Jest suite
npm run test:coverage
npm run test:changed # --onlyChanged --bail

npm run gate         # THE PRE-PUSH GATE — local precheck, then a bench-worker job (queued, serialized)
npm run test:live    # the L2 live drive as a bench job
npm run dev          # a bench LEASE: the worker builds THIS worktree and holds its gateway on 8080 for you
npm run dev:release  # end your lease early (otherwise it expires, 30 min default)
npm run bench:status # worker liveness + queue
npm run e2e:unlock   # clear a world-dirty lock after a human restore
npm run finish       # THE END of an update — after the PR is merged: main ff'd, refs pruned, worker
                     # reinstalled if its sources changed, this worktree + branch removed. Last command.
                     # `npm run finish -- <branch>` finishes a merged branch checked out nowhere (keeps this worktree).
npm run deps:gate    # Dependabot PRs: merges main in, installs, gates, pushes and auto-merges them one by one;
                     # a lockfile change routes to spine + building-details

PORT=8081 npm run dev:local   # build + start yourself, OFF 8080 — the CONSCIOUS EXCEPTION (see below)
npm run gate:local   # verify-gate.js directly — evidence for reading; does NOT unblock a push
```

**The live bench has one owner: the bench worker.** Several Claude sessions and worktrees
run on this machine at once, but the live test bench — port 8080, the LOCKED accounts, the
Helartia world state — is owned by a single permanent worker process (systemd --user unit
`spo-bench-worker`, installed by `scripts/bench-install.sh`). Sessions never start a
gateway, never kill a process, never hold a lock: they deposit a job (`npm run gate`,
`npm run test:live`, `npm run dev`) and wait for the report — the wait is one background
shell command, zero tokens. Jobs run strictly one at a time, oldest first, each in the
depositing session's worktree (uncommitted changes included; the worker builds it). A dead
worker is announced at deposit time (exit 3). Starting a gateway yourself (`npm run
dev:local`, on a port other than 8080) is the conscious exception, for debugging only —
its results attest nothing. Full spec: [doc/bench-worker.md](doc/bench-worker.md).


## Automation (`.claude/hooks/`)

| Hook | Event | Does |
|------|-------|------|
| `context-router.sh` | UserPromptSubmit | Points at the relevant docs/skills before planning |
| `typecheck-guard.sh` | PostToolUse (Edit\|Write) | Flags the tree dirty on `.ts`/`.tsx` writes — no work, ~0 ms |
| `sanctuarize.sh` | Stop | Runs `npm run typecheck` once per turn if dirty; blocks the turn on failure |
| `pre-push-gate.sh` | PreToolUse (Bash) | Blocks `git push` unless the bench worker has attested HEAD: PASS, fingerprint-stable, this worktree, < 60 min — see **The push gate** below |

`npm test` and `npm run build` stay manual — run them before declaring a session complete.

## Testing — four layers, and the push gate

```
L0  Unit + component          Jest node/jsdom, coverage ratchet           CI: every PR
L1  Protocol conformance      Jest + src/mock-server/ (rdo-mock, strict   CI: every PR
                              validator) — NOT a mock backend for E2E
L2  LIVE WS drive  <- gate    src/e2e/, headless `ws` -> gateway ->       PRE-PUSH: every code change
                              planitia. `npm run test:live`
L3  LIVE browser smoke        Playwright MCP, SPO_test3 / Crazz       pixels only, + pre-release
```

**The push gate.** `git push` is blocked by a hook unless the **bench worker** has
attested the current HEAD (`~/.spo-bench/verdicts/<sha>.json`): verdict PASS, tree
fingerprint stable across the run, attested for THIS worktree, younger than 60 min.
`npm run gate` produces that attestation: it prechecks locally (typecheck, lint, tests —
free, parallelizable), then queues a bench job; the worker builds the worktree, runs
verify-gate (static replayed, President exclusion, diff routing) and drives the routed
flows live. **Only the worker attests** — `npm run gate:local` is evidence for reading,
never a push unblock. **A crash is a failure, but silence is not a pass**: a mutation is
proven by the `FIVEMODELSERVER/Survival` log line, not by a `success: true` response
(`OB-28`); a lagging read-back is expected (`OB-29`) and does not fail a probe, a missing
log line does. Three attempts maximum, each naming a different root cause. Full rules:
[doc/E2E-POLICY.md](doc/E2E-POLICY.md); bench mechanics: [doc/bench-worker.md](doc/bench-worker.md).

`module.ts` → `module.test.ts`, same directory. Two Jest projects: `unit` (node, `.test.ts`)
and `component` (jsdom, `.test.tsx`).

**Two coverage numbers — do not conflate them.** New/modified lines must reach ≥ 93 %,
enforced by `npm run coverage:changed` (`scripts/coverage-changed.js`, run by `gate:precheck`
and by CI on every pull request; `COVERAGE_CHANGED_MIN` overrides the floor). `jest.config.js`
separately enforces a machine floor (global 38 %, higher per directory), unchanged by that
script. Thresholds only go UP. Details: **`spo-testing`** skill.

Seven custom RDO matchers: `toContainRdoCommand`, `toMatchRdoFormat`, `toMatchRdoCallFormat`,
`toMatchRdoSetFormat`, `toHaveRdoTypePrefix`, `toMatchRdoResponse`, `toPassStrictRdoValidation`.

## Skills — 20 installed (7 project, 13 community)

Inventory: [manifest.json](.claude/skills/manifest.json). Regenerate after adding or
removing one:

```bash
node .claude/generate-skills-manifest.js          # rebuild
node .claude/generate-skills-manifest.js --check  # CI: fail if stale
```

**Project skills, invokable via `/name`:**

| Skill | For |
|-------|-----|
| `delphi-archaeologist` | Reverse-engineering `../SPO-Original`, tracing RDO handlers |
| `spo-testing` | Tests, coverage, fixtures, L1 substrate, RDO matchers |
| `dependencies` | Vulnerability audit, licences, package updates |
| `e2e-test` | L3 live browser smoke (user-invoked only) |
| `gate` | The pre-push gate — static, exclusions, routing, live drive |

**Auto-load only** (not slash-invokable): `web-games` (Canvas 2D renderer, frame budget),
`zustand-store-ts` (stores, selector stability), `mobile-ux-optimizer`
(MobileShell/BottomNav/BottomSheet).

**Community (13):** canvas-api, claude-md-improver, css-modules-vite, debugging,
docs-codebase, git-workflow, pwa-expert, react-best-practices, reviewing-code,
security-auditor, typescript, web-accessibility, web-performance.

## Sub-agents (`.claude/agents/`)

| Agent | Model | Use for |
|-------|-------|---------|
| `security-reviewer` | Opus | WebSocket auth, RDO parsing, session management, OWASP. Read-only. |
| `performance-analyzer` | Opus | Renderer bottlenecks, chunk caching, frame budget. Read-only. |

## Delegation strategy

- **Skills first** — they load into the main conversation, keep context unified, cost nothing to spawn
- **Sub-agents** for work that produces heavy intermediate output: screenshot reads
  (mandatory), cross-corpus RDO audits, deep multi-file investigations
- **Explore agents** (up to 3 in parallel) when scope is genuinely uncertain
- **Direct tools** for anything targeted — never spawn an agent for a one-liner
- **Never delegate understanding.** Do not write "based on your findings, fix the bug."
  Synthesise the agent's results yourself, then act.
- **Model routing:** Opus for protocol reasoning and architecture; Fable for high-volume
  mechanical work (coverage parsing, release notes, link checks).

## MCP

| Server | For |
|--------|-----|
| Playwright | Browser automation, E2E |
| GitHub | PRs, issues, code search |
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
  hold. The gate reads that from the server (`IsPresident` in the tycoon cache, `canGovern`
  on the Capitol) — never from the UI: a missing control is a bug to fix, a refused
  capability is a recorded exception the gate continues past. If the server ever grants it,
  the gate fails closed until a flow drives the member. No flag, no human text, clears it
  ([E2E-POLICY.md](doc/E2E-POLICY.md) §7).

Procedure and selectors: `/e2e-test` skill and [E2E-TESTING.md](doc/E2E-TESTING.md).

## Live server logs — http://158.69.153.134/logs/

The Delphi servers write their logs to an open IIS directory listing, no auth. This is how a
live run is proved rather than assumed — `doc/BACKLOG-OPEN.md` already cites it as evidence.

| Path | Carries |
|------|---------|
| `FIVEMODELSERVER/Survival <YY-MM-DD>.log` | **the one that matters** — civic RDO members log on entry, *before* their `try`, so a line here proves the frame reached the object (`Setting Tax value: …`, `Setting Min Wage: …`, `Caching Town..`) |
| `FIVEMODELSERVER/TimeWarp <date>.log` | a periodic world snapshot — who holds each ministry, per-town vacancies and average salaries. Small (~20 KB), good for checking model state without replaying a session |
| `FIVEINTERFACESERVER/Survival <date>.log` | `LOGON ATTEMPT: User=<name>` / `Start Disconnecting <name>` — which identity (human vs role company) was active at a given second |
| `FIVECACHESERVER/`, `FIVEMAILSERVER/` | near-empty, rarely useful |

Download and grep — the Survival log runs 2–3 MB/day, too big to pull into context. **Reading
a log is not probing the server**; it stays within the "never probe the live server" rule. It
is also not a substitute for the Pascal: a log proves what *happened*, the declaration in
`../SPO-Original/Rdo/Server/` is what defines a member's kind and arity.

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

**Nothing gates a local commit — the gate is on the push.** Commit freely on a branch;
each retry attempt is its own commit so the loop stays readable. Before pushing, run
`npm run gate`: `.claude/hooks/pre-push-gate.sh` blocks the push without a fresh bench
attestation for HEAD, and blocks a direct push to `main` outright. `.github/workflows/ci.yml`
re-runs lint, typecheck and tests on every push to `main` and every pull request. CI
cannot hold the locked credentials, so the worker publishes each attestation as the
`bench/gate` **commit status** once the sha reaches GitHub (retried automatically until
the push happens). **`main` is governed by one ruleset that binds the owner too** (empty
bypass list): PR required (0 approvals — solo maintainer), `typecheck + tests` **and**
`bench/gate` required, branch **up to date** with `main`, no force-push, no deletion. So a
PR cannot merge on CI alone, and **if `main` moves after your gate, update the branch and
re-run `npm run gate`** — the new sha needs its own attestation. The detailed live
evidence still rides in the PR body. Setup checklist: [bench-worker.md §5](doc/bench-worker.md).
**The last link is the release:** every merge to `main` runs `electron-release.yml`, which
computes the version from the last `v*` tag and the commits since it (`feat` → minor,
otherwise patch), builds the installer, tags and publishes the GitHub Release — never create
`v*` tags by hand (a tag ruleset forbids updating or deleting them).

**An update is finished only after `npm run finish`.** GitHub deletes the remote branch at
merge (`delete_branch_on_merge`); the local side does not clean itself. `finish` refuses
unless the PR is MERGED, fast-forwards `~/SPO-WebClient` to `origin/main`, prunes stale
`origin/*` refs, reinstalls the bench worker when the merge touched `src/e2e/bench/` or
`scripts/bench-*`, then removes this worktree and its branch, prunes any orphan session
worktree (clean, nothing ahead of `main`, no process inside) and finishes any clean
worktree whose PR is already MERGED — a session that forgot `finish` is healed by the next
one. Run it as the
session's last command — the end state is `main` alone, locally and on origin.

Branches: `feature/`, `fix/`, `refactor/`, `doc/` + description — or the session worktree
branch (`claude-<user>/…`); the hook accepts any branch but `main`.
Commits: `type: short summary` — `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`.

## Transparency

When posting a change summary, an end report, or a plan, list the skills used to produce it.
