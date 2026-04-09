# CLAUDE.md - Starpeace Online WebClient

## Rules & Constraints

**NEVER do these:**
- Construct RDO protocol strings manually — always use `RdoValue`/`RdoCommand` from `@/shared/rdo-types`
- Use `any` types — use `unknown` for catch blocks, typed interfaces for data
- Modify without reading first — always read existing code before changing it
- Skip tests — all code changes require tests covering >= 93% of new/modified lines (global floor enforced by `jest.config.js` thresholds)
- Modify these files without discussion: `src/shared/rdo-types.ts`, `src/server/rdo.ts`, `src/__fixtures__/*`, `jest.config.js` (thresholds can only go UP)
- Load screenshots directly in the main context during debug/E2E sessions — use sub-agent delegation (see below)
- Add UI elements without wiring their actions — every button, toggle, or control must be fully functional, not just visible. Full checklist: see `/code-guardian` skill §E.
- Use `"^"` (VariantId) in fire-and-forget commands without a RID — `"^"` is forbidden in fire-and-forget except when paired with a request ID (RID). Fire-and-forget MUST use `"*"` (VoidId). Without a RID, the Delphi server has no destination for the response and crashes. Ref: RDOQueryServer.pas:419-424, live capture confirmation.

**RDO conformity (MANDATORY for any RDO work):** Before writing or modifying ANY RDO-related code, you MUST:
1. Read [doc/rdo-protocol-architecture.md](doc/rdo-protocol-architecture.md) — wire framing, dispatch internals, login sequence, push filtering rules
2. Verify against SPO-Original Delphi source using `delphi-archaeologist` skill before implementing
This applies to new RDO calls, modified RDO calls, push handlers, and any code touching `sendRdoRequest()` or `RdoCommand`.

**`sendRdoRequest()` + `"*"` separator = SERVER CRASH** — `sendRdoRequest()` adds a QueryId; void push (`"*"`) with QueryId crashes the Delphi server. Void push → `socket.write(RdoCommand.build())`. Synchronous → `sendRdoRequest()` with `"^"`.

**Agent delegation strategy (when to use sub-agents vs direct tools vs skills):**
- **Skills (default for advisory/auditing):** Skills auto-load into the main conversation via hooks — use them for domain guidance, code review checklists, and protocol verification. They keep context unified with zero spawning overhead.
- **Explore agents (parallel codebase research):** Launch up to 3 Explore agents in parallel when the scope is uncertain, multiple areas are involved, or research would bloat the main context. Each agent gets a focused search question.
- **General-purpose agents (screenshot analysis, heavy research):** Delegate screenshot reads (mandatory — see screenshot protocol in `/e2e-test` skill) and deep investigations that produce large intermediate output.
- **Direct tools (targeted lookups):** Use Grep/Glob/Read directly for single-file reads, known symbol searches, or any lookup where the target is already known. Do NOT spawn an agent for a one-liner.
- **Never delegate understanding:** Do not write agent prompts like "based on your findings, fix the bug." Synthesize agent results yourself, then act.

**Transparency**
Always inform the user the list of skills used to respond to each request when you post the summary of all changes or end report or plan.

## Project

**Starpeace Online WebClient** — Browser-based multiplayer tycoon game client
TypeScript + Node.js + WebSocket + Canvas 2D Isometric | RDO protocol | Beta 1.2.0

```
Browser Client --WebSocket--> Node.js Gateway --RDO Protocol--> Game Servers
```

## Environment

**Platform:** Windows 11 Pro — shell is **Git Bash** (MINGW64), NOT Linux.
**Node.js path:** `C:\Program Files\nodejs\` (v24.13.1, npm 11.8.0)

For bash/git-bash shells, add to PATH: `export PATH="/c/Program Files/nodejs:$PATH"`

**Windows (Git Bash):**
- Use Claude Code tools (Grep, Glob, Read, Edit, Write) instead of `grep`/`find`/`sed`/`awk` in Bash
- Process management: `tasklist`/`taskkill` or `powershell -Command "Get-Process..."` (not `ps`/`kill`)
- Line endings: LF only (`.gitattributes` enforced) — do not introduce CRLF
- Prefer `npm test`, `npm run build` over raw shell commands

## MCP Servers

| MCP | Purpose |
|-----|---------|
| **GitHub** | PRs, issues, code search, repo management |
| **Playwright** | Browser automation, E2E testing |
| **Context7** | Live docs lookup (TS, Jest, Node.js) |

## Commands

```bash
npm run dev          # Build + start server (port 8080)
npm run build        # Build all (server + client)
npm test             # Run all Jest tests
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

## Documentation (load on demand)

Docs auto-load via hook when editing matching files. For planning/discussion, read manually:

| Context | Documents |
|---------|-----------|
| RDO protocol | [rdo-protocol-architecture.md](doc/rdo-protocol-architecture.md), [rdo_typing_system.md](doc/rdo_typing_system.md) |
| Renderer / textures | [texture-rendering-architecture.md](doc/texture-rendering-architecture.md) |
| Concrete tiles | [concrete_rendering.md](doc/concrete_rendering.md) |
| Roads | [road_rendering_reference.md](doc/road_rendering_reference.md) |
| Buildings / facilities | [building_details_protocol.md](doc/building_details_protocol.md), [facility-tabs-reference.md](doc/facility-tabs-reference.md) |
| Voyager / inspector | [voyager-inspector-architecture.md](doc/voyager-inspector-architecture.md), [voyager-handler-reference.md](doc/voyager-handler-reference.md) |
| Server / deployment | [architecture-overview.md](doc/architecture-overview.md), [logging-system.md](doc/logging-system.md), [deployment-security.md](doc/deployment-security.md) |
| Supply / research | [supply-system.md](doc/supply-system.md), [research-system-reference.md](doc/research-system-reference.md) |
| E2E / mock server | [E2E-TESTING.md](doc/E2E-TESTING.md), [mock-server-guide.md](doc/mock-server-guide.md) |
| Architecture | [architecture-overview.md](doc/architecture-overview.md) |
| Troubleshooting | [troubleshooting.md](doc/troubleshooting.md) |

## Skills

Skills auto-load contextually via `PreToolUse` hook in `.claude/settings.json`.

### Project Skills (invokable via /skill-name)

| Skill | Triggers for |
|-------|---|
| `code-guardian` | Any `src/` file — 5 crash category checklists, coverage ratchet, protected files |
| `delphi-archaeologist` | Reverse-engineering SPO-Original Delphi source, tracing RDO handlers |
| `dependency-audit` | Vulnerability scanning, license compliance, supply chain security |
| `dependency-updater` | Updating dependencies, checking outdated packages |
| `e2e-test` | E2E testing with Playwright MCP (user-invoked only) |

**Community skills** (30+ installed, auto-load via hooks): React, Zustand, state mgmt, testing, server, security, renderer, a11y, design, TypeScript, refactoring, debugging, protocol, git workflow. See [manifest.json](.claude/skills/manifest.json).

## Code Style

- TypeScript strict mode, camelCase vars/methods, PascalCase classes/interfaces
- `unknown` for catch blocks + `toErrorMessage(err)` from `@/shared/error-utils`
- JSDoc for public API only, no over-engineering, small focused changes

## Testing

**Convention:** `module.ts` -> `module.test.ts` (same directory)

```bash
npm test -- rdo-types              # Specific file
npm test -- --testNamePattern="X"  # Specific suite
```

**Custom matchers:** `toContainRdoCommand()`, `toMatchRdoCallFormat()`, `toMatchRdoSetFormat()`, `toHaveRdoTypePrefix()`

## E2E Credentials

Credentials: `SPO_test3` / `test3` / BETA zone / Shamba world / President of Shamba company
**These credentials are LOCKED — never change without explicit developer approval.**
Full procedure and selectors: see `/e2e-test` skill and [doc/E2E-TESTING.md](doc/E2E-TESTING.md).

## Git Conventions

**Branch:** `feature/`, `fix/`, `refactor/`, `doc/` + description
**Commit:** `type: short summary` — types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`
