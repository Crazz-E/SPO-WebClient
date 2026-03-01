# CLAUDE.md - Starpeace Online WebClient

## Rules & Constraints

**NEVER do these:**
- Construct RDO protocol strings manually — always use `RdoValue`/`RdoCommand` from `@/shared/rdo-types`
- Use `any` types — use `unknown` for catch blocks, typed interfaces for data
- Modify without reading first — always read existing code before changing it
- Skip tests — all code changes require tests, coverage >= 93%
- Modify these files without discussion: `src/shared/rdo-types.ts`, `src/server/rdo.ts`, `src/__fixtures__/*`
- Load screenshots directly in the main context during debug/E2E sessions — use sub-agent delegation (see below)
- Add UI elements without wiring their actions — every button, toggle, or control must be fully functional, not just visible (see below)

**UI change = full-stack verification (MANDATORY):**
When any UI component is added or modified, verify **both** the visual layer and the backing logic:
1. **Visual**: The element renders correctly and is interactive (hover, focus, disabled states)
2. **Action**: Clicking/interacting triggers the intended effect — store update, RDO command, navigation, etc.
3. **Wiring**: Trace the handler chain end-to-end: `onClick` → store action / bridge call → server request → expected side effect
4. If the backing logic (store method, RDO call, WebSocket message) does not exist yet, **implement it** — do not leave dead buttons or placeholder handlers like `() => {}` or `console.log('TODO')`

**RDO conformity:** When adding/modifying RDO requests, the `rdo-protocol` skill auto-loads with the 8-step conformity checklist, dispatch rules, and Delphi type mappings.

**Screenshot analysis (mandatory for debug/E2E sessions):**
Never read screenshot images in the main conversation context — each costs ~3-5MB and saturates the 20MB limit. Instead:
1. Enable debug overlay first: `browser_press_key("d")` + toggle keys (`3`=concrete, `4`=water grid, `5`=roads)
2. Save to `screenshots/` directory (git-ignored): `browser_take_screenshot(filename: "screenshots/descriptive-name.png")`
3. Delegate to sub-agent: `Task(subagent_type: "general-purpose", prompt: "Read screenshots/<name>.png. Debug overlay active: [describe toggles]. Check: 1. <criterion>... Reply PASS/FAIL per criterion.")` — color legend: Green=building, Blue=junction, Orange=road.
4. Only the text verdict returns (~100 bytes vs ~3-5MB per image)

**Validated modules:** Files listed in `.claude/validated-modules.json` are stable and protected.
- Edits trigger a confirmation prompt (PreToolUse) + automatic targeted test run (PostToolUse)
- Do NOT weaken, skip, or delete tests for validated modules — if tests fail after your edit, fix your regression
- When the user says "approved", "stable", "lock this down", or "protect this", invoke the `validation-ceremony` skill
- When committing changes that touched validated modules, mention it and offer a visual spot-check

**Critical patterns & gotchas:**
- **`sendRdoRequest()` + `"*"` separator = SERVER CRASH** — `sendRdoRequest()` adds a QueryId; void push (`"*"`) with QueryId crashes the Delphi server. Void push → `socket.write(RdoCommand.build())`. Synchronous → `sendRdoRequest()` with `"^"`.
- Test environment is `node` (no jsdom) — mock DOM elements as plain objects
- `FacilityDimensionsCache` is singleton — must `clear()` then `initialize()` in tests
- TerrainLoader i/j swap: `getTextureId(j, i)` — provider uses (i,j), loader expects (x,y)
- Concrete tiles stored as `"${x},${y}"` (col,row) not `"${i},${j}"` (row,col)
- ROAD_TYPE constants are `as const` — use explicit `number` type annotation for local vars
- `worldContextId` = world operations (map focus, queries); `interfaceServerId` = building operations
- WebSocket: Client->Server = `WsReq*` types, Server->Client = `WsResp*` types; use `sendResponse()`/`sendError()`

## Project

**Starpeace Online WebClient** — Browser-based multiplayer tycoon game client
TypeScript + Node.js + WebSocket + Canvas 2D Isometric | RDO protocol | Alpha 0.1.0

```
Browser Client --WebSocket--> Node.js Gateway --RDO Protocol--> Game Servers
```

## Environment

**Platform:** Windows 11 Pro — shell is **Git Bash** (MINGW64), NOT Linux.
**Node.js path:** `C:\Program Files\nodejs\` (v24.13.1, npm 11.8.0)

For bash/git-bash shells, add to PATH: `export PATH="/c/Program Files/nodejs:$PATH"`

**Windows-specific rules (MANDATORY):**
- **Paths:** Use forward slashes (`src/server/rdo.ts`) in code/scripts. Bash tool receives Git Bash, so Unix-style paths work, but native Windows commands (e.g. `where`) use backslashes.
- **No Linux-only commands:** Do NOT use `grep`, `find`, `xargs`, `sed`, `awk`, `wc`, `chmod`, `chown`, `ln -s`, `readlink`, `lsof`, `kill`, `ps aux`, `rm -rf` in Bash. Use the dedicated Claude Code tools (Grep, Glob, Read, Edit, Write) instead.
- **Process management:** Use `tasklist` / `taskkill` instead of `ps` / `kill`. Use `Get-Process` / `Stop-Process` via `powershell -Command "..."` for port conflicts.
- **Null device:** Use `/dev/null` in Git Bash (it translates automatically). Do NOT use `NUL`.
- **npm scripts:** `npm test`, `npm run build`, etc. work identically — always prefer npm scripts over raw shell commands.
- **File permissions:** Windows has no `chmod`/`chown`. Never attempt to set Unix permissions.
- **Symlinks:** Avoid `ln -s`. Windows symlinks require admin privileges and behave differently.
- **Line endings:** Repo uses LF (`.gitattributes`). Do not introduce CRLF.
- **Temp files:** Use `$TEMP` or `/tmp` (Git Bash maps `/tmp` to a Windows temp directory).
- **Environment variables:** Use `export VAR=value` in Git Bash. For persistent vars, guide user to Windows System Properties or their shell profile.

## MCP Servers (Claude Code)

Project-level MCP config is in [.mcp.json](.mcp.json) (committed to git). All devs get the same tools automatically.

| MCP | Package | Purpose |
|-----|---------|---------|
| **GitHub** | `@modelcontextprotocol/server-github` | PRs, issues, code search, repo management |
| **Playwright** | `@playwright/mcp` | Browser automation for E2E testing |
| **Context7** | `@upstash/context7-mcp` | Live documentation lookup (TS, Jest, Node.js, etc.) |

## Commands

```bash
npm run dev          # Build + start server (port 8080)
npm run build        # Build all (server + client)
npm test             # Run Jest tests (~1666 tests)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

## Architecture

```
src/
├── client/
│   ├── client.ts              # Main controller (legacy, bridges to React)
│   ├── main.tsx               # Vite entry, mounts React app
│   ├── App.tsx                # Root router (LoginScreen vs GameScreen)
│   ├── bridge/                # React ↔ legacy bridge (ClientBridge)
│   ├── store/                 # Zustand stores (11 total)
│   ├── hooks/                 # Custom hooks (usePanel, useResponsive, etc.)
│   ├── styles/                # Design tokens, reset, typography, animations
│   ├── layouts/               # LoginScreen, GameScreen
│   ├── components/            # React UI (45 components, CSS Modules)
│   │   ├── common/            # Badge, Toast, GlassCard, Skeleton, etc.
│   │   ├── hud/               # TopBar, LeftRail, RightRail
│   │   ├── panels/            # RightPanel, LeftPanel (slide-in)
│   │   ├── building/          # BuildingInspector, QuickStats, PropertyGroup
│   │   ├── empire/            # EmpireOverview, FacilityList, FinancialSummary
│   │   ├── mail/              # MailPanel
│   │   ├── chat/              # ChatStrip
│   │   ├── search/            # SearchPanel
│   │   ├── politics/          # PoliticsPanel
│   │   ├── transport/         # TransportPanel
│   │   ├── modals/            # BuildMenu, Settings, CompanyCreation
│   │   ├── mobile/            # MobileShell, BottomNav, BottomSheet
│   │   └── command-palette/   # CommandPalette (Cmd+K)
│   ├── renderer/              # Canvas 2D isometric engine
│   └── ui/                    # Legacy canvas UI (minimap only)
├── server/
│   ├── server.ts              # HTTP/WebSocket server + API endpoints
│   ├── spo_session.ts         # RDO session manager
│   ├── rdo.ts                 # RDO protocol parser
│   └── services/              # Background services (ServiceRegistry)
└── shared/
    ├── rdo-types.ts           # RDO type system (CRITICAL)
    ├── error-utils.ts         # toErrorMessage(err: unknown)
    ├── types/                 # Type definitions
    └── building-details/      # Property templates
```

## Project Skills

12 project-specific skills auto-load contextually when working on relevant files. Each skill contains the key rules, gotchas, and references for its subsystem — no need to manually consult docs.

| Skill | Auto-loads for |
|-------|---------------|
| `rdo-protocol` | RDO commands, spo_session.ts, rdo.ts, protocol work |
| `building-inspector` | Building details, facility inspector, property templates |
| `road-rendering` | Road topology, textures, road-texture-system.ts |
| `terrain-rendering` | Terrain, concrete, chunk cache, texture pipeline |
| `mock-server` | Mock server, test scenarios, capture files |
| `user-profile-mail` | Profile panel, mail system, mail RDO |
| `cab-extraction` | CAB files, asset extraction, 7zip |
| `delphi-archaeologist` | SPO-Original Delphi codebase reverse-engineering |
| `e2e-test` | E2E testing with Playwright MCP |
| `dependency-audit` | Vulnerability scanning, license compliance |
| `dependency-updater` | Dependency updates, outdated packages |
| `validation-ceremony` | `/validate` command, validated-modules.json, baseline screenshots |

## SkillsMP Marketplace Skills (MANDATORY)

**Skill research rule:** When searching for or evaluating new skills, **always use the SkillsMP API** — never guess or web-search blindly. The project has a configured installer with authenticated API access.

**Files:**
- Installer script: [.claude/skillsmp-installer.js](.claude/skillsmp-installer.js) — main installer with `REQUIRED_SKILLS` array
- Ad-hoc installer: [.claude/install-new-skills.js](.claude/install-new-skills.js) — for adding new skills on demand
- Installed skills: [.claude/skills-skillsmp/](.claude/skills-skillsmp/) — all downloaded SKILL.md files
- Manifest: [.claude/skills-skillsmp/manifest.json](.claude/skills-skillsmp/manifest.json) — full metadata (stars, authors, URLs)

**API usage:**
```
Endpoint: https://skillsmp.com/api/v1/skills/search
Auth:     Bearer token (in installer scripts)
Params:   q=<search query>&limit=5&sortBy=stars
```

**When to use:** Before creating a new custom project skill, search SkillsMP first to check if a high-quality community skill already exists. Prefer skills with 1,000+ stars. Install via the API, then customize with project-specific patterns if needed.

**Currently installed (30 skills):** TypeScript, Node.js backend, Jest testing, security, debugging, refactoring, React state management, Zustand store patterns, accessibility (WCAG/ARIA), design system, interaction design, web performance, PWA, and more. See [manifest.json](.claude/skills-skillsmp/manifest.json) for full list.

## RDO Protocol

**Always use type-safe classes.** Full API docs: [doc/rdo_typing_system.md](doc/rdo_typing_system.md)

```typescript
import { RdoValue, RdoCommand } from '@/shared/rdo-types';

// Build commands with the builder pattern
const cmd = RdoCommand.sel(objectId)
  .call('RDOSetPrice').push()
  .args(RdoValue.int(priceId), RdoValue.float(value))
  .build();

// Parse responses
const { prefix, value } = RdoParser.extract(token);
```

| Prefix | Type | Example |
|--------|------|---------|
| `#` | Integer | `#42` |
| `%` | String (OLE) | `%Hello` |
| `!` | Float | `!3.14` |
| `@` | Double | `@3.14159` |
| `$` | Short string | `$ID` |
| `^` | Variant | `^value` |
| `*` | Void | `*` |

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

**Current status:** 56 suites, ~1666 tests, all passing

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/map-data/:mapName` | Map terrain/building/road data |
| `GET /api/road-block-classes` | Road block class definitions |
| `GET /api/concrete-block-classes` | Concrete block class definitions |
| `GET /api/terrain-info/:terrainType` | Terrain type metadata |
| `GET /api/terrain-atlas/:type/:season` | Terrain atlas PNG |
| `GET /api/terrain-atlas/:type/:season/manifest` | Terrain atlas JSON |
| `GET /api/object-atlas/:category` | Road/concrete atlas PNG |
| `GET /api/object-atlas/:category/manifest` | Road/concrete atlas JSON |
| `GET /api/terrain-chunk/:map/:type/:season/:zoom/:i/:j` | Pre-rendered chunk PNG |
| `GET /api/terrain-chunks/:map/:type/:season/manifest` | Chunk availability manifest |
| `GET /api/terrain-texture/:type/:season/:id` | Individual texture fallback |
| `GET /cache/:category/:filename` | Object texture (prefers pre-baked PNG) |
| `GET /proxy-image?url=<url>` | Image proxy for remote assets |

## E2E Testing

Full procedure, credentials, and selectors: **[doc/E2E-TESTING.md](doc/E2E-TESTING.md)**

Credentials: `SPO_test3` / `test3` / BETA zone / Shamba world / President of Shamba company
**These credentials are LOCKED — never change without explicit developer approval.**

## Git Conventions

**Branch:** `feature/`, `fix/`, `refactor/`, `doc/` + description
**Commit:** `type: short summary` — types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`

## Services (ServiceRegistry)

| Service | Purpose | Dependencies |
|---------|---------|--------------|
| `update` | Sync game assets | none |
| `facilities` | Building dimensions | update |
| `textures` | Extract CAB textures | update |
| `mapData` | Map data caching | update |
| `terrainChunks` | Server-side chunk pre-rendering | textures, mapData |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | `npm install`, Node.js >= 18 |
| Tests fail | `npm run test:verbose` |
| RDO errors | Verify type prefixes (#, %, !, etc.) |
| WebSocket disconnect | Check game server status |
| Port 8080 in use | `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` |
