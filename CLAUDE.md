# CLAUDE.md — Starpeace Online WebClient

Browser-based multiplayer tycoon client, wire-compatible with the original Delphi
Starpeace Online servers. TypeScript + Node.js + WebSocket + Canvas 2D isometric.
RDO protocol. Beta 1.3.0-beta.

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
npm run dev          # build + start (port 8080)
npm run build        # server + client + terrain-test
npm run typecheck    # both tsconfigs
npm run lint         # ESLint 10, flat config — 0 errors is the CI gate
npm run format       # Prettier over the whole tree (not enforced yet, see below)
npm test             # full Jest suite
npm run test:coverage
npm run test:changed # --onlyChanged --bail
```

## Automation (`.claude/hooks/`)

| Hook | Event | Does |
|------|-------|------|
| `context-router.sh` | UserPromptSubmit | Points at the relevant docs/skills before planning |
| `typecheck-guard.sh` | PostToolUse (Edit\|Write) | Flags the tree dirty on `.ts`/`.tsx` writes — no work, ~0 ms |
| `sanctuarize.sh` | Stop | Runs `npm run typecheck` once per turn if dirty; blocks the turn on failure |

`npm test` and `npm run build` stay manual — run them before declaring a session complete.

## Testing

`module.ts` → `module.test.ts`, same directory. Two Jest projects: `unit` (node, `.test.ts`)
and `component` (jsdom, `.test.tsx`).

**Two coverage numbers — do not conflate them.** New/modified lines must reach ≥ 93 %
(review convention). `jest.config.js` separately enforces a machine floor (global 38 %,
higher per directory). Thresholds only go UP. Details: **`spo-testing`** skill.

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
| `spo-testing` | Tests, coverage, fixtures, mock server, RDO matchers |
| `dependencies` | Vulnerability audit, licences, package updates |
| `e2e-test` | Live Playwright E2E (user-invoked only) |

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

`SPO_test3` / `test3` / **Free Space** zone / **planitia** world / **SPO_test3 - Green** company.
**Never change without explicit developer approval.** Pick **Free Space**, not BETA — the live
directory hosts `planitia`/`shamba`/`zorcon` under Free Space; BETA only has `aries`.
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

**Nothing gates a local commit.** Run `npm test` and `npm run typecheck` yourself before
pushing RDO changes — but `.github/workflows/ci.yml` now runs both on every push to `main`
and every pull request, and `main` is protected: no force-push, no deletion, CI must be green.

Branches: `feature/`, `fix/`, `refactor/`, `doc/` + description.
Commits: `type: short summary` — `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`.

## Transparency

When posting a change summary, an end report, or a plan, list the skills used to produce it.
