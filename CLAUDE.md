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

- Construct RDO protocol strings manually — always `RdoValue`/`RdoCommand` from `@/shared/rdo-types`
- Use `any` — `unknown` in catch blocks, typed interfaces for data
- Modify a file without reading it first
- Ship code without tests — new/modified lines must reach ≥ 93 % coverage
- Modify without discussion: `src/shared/rdo-types.ts`, `src/server/rdo.ts`,
  `src/__fixtures__/*`, `jest.config.js` (thresholds only go UP)
- Load screenshots into the main context during debug/E2E — delegate to a sub-agent
- Add a UI element without wiring its action — no dead buttons
- Emit a frame whose **separator does not match the member's Pascal kind**, or whose **argument
  count differs from its declaration**. Three failure modes, all mechanical:

  | form | mechanism | consequence |
  |------|-----------|-------------|
  | `"^"` **without a RID** | reply built with no destination | **crash** (`RDOQueryServer.pas:419-424`) |
  | `"^"` on a **procedure**, ≥ 2 register args | result pointer pushed, never popped | **freeze** |
  | `"*"` on a **function** | no result pointer passed, the function writes one anyway through the register its ABI reserves | **arbitrary memory write**; the server then refuses every query on every connection, still looking alive, and does **not** recover on its own |

  Arity follows the same register file: `ParamCount` comes from the **received** variant array
  (`RDOObjectServer.pas:218`), args land `EDX` → `ECX` → stack (`:266-277`). Under-emit and the
  callee reads a slot the dispatcher never set — a garbage pointer for a `widestring`. Over-emit
  past two register args and it leaves words a `register` callee never pops — the freeze again.

  **There is therefore no safe frame for a member whose declaration nobody has.** Kind *and*
  arity come from the Pascal in `../SPO-Original`, never from probing the live server.

  Corollary: **a `function` can never be fire-and-forget.** It needs `"^"` with a rid, i.e.
  `sendRdoRequest`. Fire-and-forget (`writeRdoFrame`, `"*"`, no rid) is for `procedure`s only.

**`assertNotVoidPush` is a SAFETY guard, not a convention**, and takes **no opt-in** — the one
that briefly existed is what let the fatal frame out. `VOID_MEMBERS` exempts proven `procedure`s
only, each with its declaration cited (`src/server/session/rdo-request-guards.ts`).
⚠ **The guard runs only inside `sendRdoRequest`.** The ~25 direct `writeRdoFrame()` call sites
bypass it; there the Pascal lookup is the *only* check, and `KNOWN_RDO_COMMANDS`
(`building-property-handler.ts`) is a second whitelist that cites no declarations.

## RDO work — mandatory sequence

> **There is no written reference for the wire protocol itself.** The authorities are the Delphi
> source and the guards in the code. Do not reconstruct rules from memory, and do not probe the
> live server.

Before writing or modifying **any** RDO code (new calls, changed calls, push handlers,
anything touching `sendRdoRequest()` or `RdoCommand`):

1. Read the member's Pascal **declaration** in `../SPO-Original` with **`delphi-archaeologist`** —
   its **kind** decides the separator, its **parameter list** decides the argument count. Read the
   server-side declaration, not a client call site: late-bound client calls have already caused a
   member to be misclassified as a `function`, which is the mistake that froze production.
2. Check it against the guards in `src/server/session/rdo-request-guards.ts` (`VOID_MEMBERS`,
   `assertNotVoidPush`) — remembering they do not cover the `writeRdoFrame` path
3. Choose the **verb** the reference client used, not the one the declaration suggests. `get` on a
   0-arg `function` is correct and is what Voyager emits (`GetProperty` falls through to
   `CallMethod`, `RDOObjectServer.pas:112-116`); the conformity bug is inventing `call` frames the
   client never produced. `set` has **no** fallthrough — a non-existent property returns
   `errUnexistentProperty` (`:176`).
4. Sessions, timers, timeouts or reconnection? Use the **`rdo-network-resilience`** skill
5. Build the frame with `RdoValue`/`RdoCommand` — never a hand-written string

**On conflict, a form the reference client demonstrably emitted wins over what the Delphi
declaration suggests.** Explain *why* the observed form works, then follow it — never silently
"fix" a working call to match the source. Live-observed forms are cited in the code comments.

## Legacy Delphi source

`../SPO-Original` — sibling of this repo, Delphi 5. **Read-only historical artifact.**
Every claim from it cites `File.pas:Line`, or is marked `[INFERRED]` / `[UNKNOWN]`.

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

## Skills — 21 installed (8 project, 13 community)

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

**Auto-load only** (not slash-invokable): `rdo-network-resilience` (reconnect, timeouts,
ServerBusy), `web-games` (Canvas 2D renderer, frame budget), `zustand-store-ts` (stores,
selector stability), `mobile-ux-optimizer` (MobileShell/BottomNav/BottomSheet).

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

## Code style

TypeScript strict. camelCase vars/methods, PascalCase classes/interfaces. `unknown` in catch
blocks + `toErrorMessage(err)` from `@/shared/error-utils`. JSDoc for public API only.
Small, focused changes.

## Git

**Nothing gates a commit or a push.** Run `npm test` and `npm run typecheck` yourself before
pushing RDO changes.

Branches: `feature/`, `fix/`, `refactor/`, `doc/` + description.
Commits: `type: short summary` — `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`.

## Transparency

When posting a change summary, an end report, or a plan, list the skills used to produce it.
