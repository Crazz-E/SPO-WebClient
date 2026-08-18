# CLAUDE.md — Starpeace Online WebClient

Browser-based multiplayer tycoon client, wire-compatible with the original Delphi
Starpeace Online servers. TypeScript + Node.js + WebSocket + Canvas 2D isometric.
RDO protocol. Beta 1.2.0.

```
Browser Client --WebSocket--> Node.js Gateway --RDO/TCP--> Delphi Game Servers
```

**The RDO protocol is the project.** Everything else is replaceable; a wire divergence is
not. Treat RDO work as the highest-stakes work in the repo.

## Never do these

- Construct RDO protocol strings manually — always `RdoValue`/`RdoCommand` from `@/shared/rdo-types`
- Use `any` — `unknown` in catch blocks, typed interfaces for data
- Modify a file without reading it first
- Ship code without tests — new/modified lines must reach ≥ 93 % coverage
- Modify without discussion: `src/shared/rdo-types.ts`, `src/server/rdo.ts`,
  `src/__fixtures__/*`, `jest.config.js` (thresholds only go UP)
- Load screenshots into the main context during debug/E2E — delegate to a sub-agent
- Add a UI element without wiring its action — no dead buttons (`code-guardian` §E)
- Use `"^"` (VariantId) without a RID — **crashes the shared Delphi server**.
  Fire-and-forget MUST use `"*"` (VoidId). Ref: `RDOQueryServer.pas:419-424` + live capture.
- Emit a frame whose **argument count differs from the member's Pascal declaration**, or
  whose separator does not match its kind. Both guards are live-proven on the shared server:

  | form | consequence | proven |
  |------|-------------|--------|
  | `"^"` on a **procedure** with 2 register args | result pointer pushed, never popped → **freeze** | 2026-08-14, `SayThis` |
  | `"*"` on a **function** | no result pointer passed, the function writes one anyway → **arbitrary memory write**; the IS then answers `error 1` to every query, on every connection — **for over 3 h, the process still alive and still refusing everything** | 2026-08-18, `GetUserList` |

  **There is therefore no safe frame for a member whose declaration nobody has.** Its kind
  comes from the Pascal (`extract-rdo-arity.js`), never from a probe.

**`sendRdoRequest()` + `"*"` is a SAFETY guard, not a convention** — reclassified 2026-08-18.
It is wire-legal and capture-proven on a `procedure`, which is why `VOID_MEMBERS` exempts
those and only those, each with its declaration cited. `assertNotVoidPush` takes **no opt-in**:
one existed for a few hours for the certification sweep, and it is what let the 2026-08-18
frame out. Full matrix: [rdo-protocol-architecture.md §8.5](doc/rdo-protocol-architecture.md).

## RDO work — mandatory sequence

Before writing or modifying **any** RDO code (new calls, changed calls, push handlers,
anything touching `sendRdoRequest()` or `RdoCommand`):

1. Invoke the **`rdo-conformity`** skill — pre-flight checklist, verb choice, separator matrix
2. Read [rdo-protocol-architecture.md](doc/rdo-protocol-architecture.md) — evidence hierarchy §0,
   wire framing, dispatch, push filtering
3. Sessions, timers, timeouts or reconnection? Also
   [rdo-session-lifecycle.md](doc/rdo-session-lifecycle.md)
4. Verify against the Delphi source with **`delphi-archaeologist`**

**On conflict, the live captures win** ([Mock_Server_scenarios_captures.md](doc/Mock_Server_scenarios_captures.md)).
Document *why* the captured form works, then follow it — never the reverse.

## Legacy Delphi source

`../SPO-Original` — sibling of this repo, ~2383 files, Delphi 5. **Read-only historical
artifact.** Index: [spo-original-reference.md](doc/spo-original-reference.md).
Every claim from it cites `File.pas:Line`, or is marked `[INFERRED]` / `[UNKNOWN]`.

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

Windows 11 Pro. Two shells available with different syntax: **PowerShell** (primary) and
**Git Bash** (MINGW64) via the Bash tool. Node.js `C:\Program Files\nodejs\` (v24, npm 11).

- Use Claude Code tools (Read, Grep, Glob, Edit, Write) rather than shell `grep`/`find`/`cat`/`sed`.
  The permission allowlist deliberately excludes those shell aliases.
- Processes: `tasklist` / `taskkill` or `Get-Process`, not `ps` / `kill`
- Line endings: LF only (`.gitattributes`) — never introduce CRLF
- For bash: `export PATH="/c/Program Files/nodejs:$PATH"`

## Commands

```bash
npm run dev          # build + start (port 8080)
npm run build        # server + client + terrain-test
npm run typecheck    # both tsconfigs
npm test             # full Jest suite
npm run test:coverage
npm run test:changed # --onlyChanged --bail
npm run conformance -- --help   # RDO conformance suite (doc/rdo-conformance-suite.md §8 runbook)
```

## Automation (`.claude/hooks/`)

| Hook | Event | Does |
|------|-------|------|
| `context-router.sh` | UserPromptSubmit | Points at the relevant docs/skills before planning |
| `typecheck-guard.sh` | PostToolUse (Edit\|Write) | Flags the tree dirty on `.ts`/`.tsx` writes — no work, ~0 ms |
| `sanctuarize.sh` | Stop | Runs `npm run typecheck` once per turn if dirty; blocks the turn on failure |

The RDO protocol check is **not** a Claude Code hook — it is the native `.git/hooks/pre-push`,
which fires whatever tool does the push. See **Git**.

`npm test` and `npm run build` stay manual — run them before declaring a session complete
(`code-guardian` §F).

## Testing

`module.ts` → `module.test.ts`, same directory. Two Jest projects: `unit` (node, `.test.ts`)
and `component` (jsdom, `.test.tsx`).

**Two coverage numbers — do not conflate them.** New/modified lines must reach ≥ 93 %
(review convention). `jest.config.js` separately enforces a machine floor (global 38 %,
higher per directory). Thresholds only go UP. Details: **`spo-testing`** skill.

Seven custom RDO matchers: `toContainRdoCommand`, `toMatchRdoFormat`, `toMatchRdoCallFormat`,
`toMatchRdoSetFormat`, `toHaveRdoTypePrefix`, `toMatchRdoResponse`, `toPassStrictRdoValidation`.

## Skills — 24 installed (11 project, 13 community)

Inventory: [manifest.json](.claude/skills/manifest.json). Regenerate after adding or
removing one:

```bash
node .claude/generate-skills-manifest.js          # rebuild
node .claude/generate-skills-manifest.js --check  # CI: fail if stale
```

**Project skills, invokable via `/name`:**

| Skill | For |
|-------|-----|
| `rdo-conformity` | Any RDO work — checklist, verb choice, separator matrix, evidence hierarchy |
| `delphi-archaeologist` | Reverse-engineering `../SPO-Original`, tracing RDO handlers |
| `spo-testing` | Tests, coverage, fixtures, mock server, RDO matchers |
| `starpeace-server-logs` | Reading the Delphi server logs — UTC trap, size rule, freeze vs corruption, incident method |
| `dependencies` | Vulnerability audit, licences, package updates |
| `e2e-test` | Live Playwright E2E (user-invoked only) |

**Auto-load only** (not slash-invokable): `code-guardian` (any `src/` file — 5 crash
categories, coverage ratchet, protected files), `rdo-network-resilience` (reconnect,
timeouts, ServerBusy), `web-games` (Canvas 2D renderer, frame budget), `zustand-store-ts`
(stores, selector stability), `mobile-ux-optimizer` (MobileShell/BottomNav/BottomSheet).

**Community (13):** canvas-api, claude-md-improver, css-modules-vite, debugging,
docs-codebase, git-workflow, pwa-expert, react-best-practices, reviewing-code,
security-auditor, typescript, web-accessibility, web-performance.

## Sub-agents (`.claude/agents/`)

| Agent | Model | Use for |
|-------|-------|---------|
| `rdo-conformity-auditor` | Opus | Auditing wire conformity across captures + Delphi + our code. Read-only. |
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

## Code style

TypeScript strict. camelCase vars/methods, PascalCase classes/interfaces. `unknown` in catch
blocks + `toErrorMessage(err)` from `@/shared/error-utils`. JSDoc for public API only.
Small, focused changes.

## Git — the pre-push protocol check (developer rule, 2026-08-18)

**A native `pre-push` hook replays the last recording against its baseline before every push.**
Offline, deterministic, ~40 s, no server and no credentials. It is installed by

```bash
npm run hooks:install     # writes .git/hooks/pre-push; .git/ is not versioned, so run it once per clone
```

Source of truth: [scripts/install-git-hooks.js](scripts/install-git-hooks.js). Bypass deliberately
for a work-in-progress push with `git push --no-verify`.

Two consequences, both deliberate:

- **Commits are not gated.** They are cheap and frequent; the push is the boundary that reaches
  GitHub. A native hook also fires for VS Code and plain terminals, which the earlier `PreToolUse`
  gate could not see.
- **The live run is NOT on the commit path.** It tests the *server*, not our code, so it belongs
  before a deploy. Never run it just to satisfy a push.

When RDO code changes: run the tests, get a perfect score, and refuse the commit on any incident.
Runbook: [doc/rdo-conformance-suite.md](doc/rdo-conformance-suite.md) §8, §11.

Branches: `feature/`, `fix/`, `refactor/`, `doc/` + description.
Commits: `type: short summary` — `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`.

## Transparency

When posting a change summary, an end report, or a plan, list the skills used to produce it.
