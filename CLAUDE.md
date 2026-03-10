# CLAUDE.md - Starpeace Online WebClient

## Rules & Constraints

**NEVER do these:**
- Construct RDO protocol strings manually — always use `RdoValue`/`RdoCommand` from `@/shared/rdo-types`
- Use `any` types — use `unknown` for catch blocks, typed interfaces for data
- Modify without reading first — always read existing code before changing it
- Skip tests — all code changes require tests covering >= 93% of new/modified lines (global floor enforced by `jest.config.js` thresholds)
- Modify these files without discussion: `src/shared/rdo-types.ts`, `src/server/rdo.ts`, `src/__fixtures__/*`, `jest.config.js` (thresholds can only go UP)
- Load screenshots directly in the main context during debug/E2E sessions — use sub-agent delegation (see below)
- Add UI elements without wiring their actions — every button, toggle, or control must be fully functional, not just visible (see below)

**UI change = full-stack verification (MANDATORY):**
When any UI component is added or modified, verify **both** the visual layer and the backing logic:
1. **Visual**: The element renders correctly and is interactive (hover, focus, disabled states)
2. **Action**: Clicking/interacting triggers the intended effect — store update, RDO command, navigation, etc.
3. **Wiring**: Trace the handler chain end-to-end: `onClick` → store action / bridge call → server request → expected side effect
4. If the backing logic (store method, RDO call, WebSocket message) does not exist yet, **implement it** — do not leave dead buttons or placeholder handlers like `() => {}` or `console.log('TODO')`

**RDO conformity (MANDATORY for any RDO work):** Before writing or modifying ANY RDO-related code, you MUST:
1. Read [doc/rdo-protocol-architecture.md](doc/rdo-protocol-architecture.md) — wire framing, dispatch internals, login sequence, push filtering rules
2. Verify against SPO-Original Delphi source using `delphi-archaeologist` skill before implementing
This applies to new RDO calls, modified RDO calls, push handlers, and any code touching `sendRdoRequest()` or `RdoCommand`.

**Screenshot analysis (mandatory for debug/E2E sessions):**
Never read screenshot images in the main conversation context — each costs ~3-5MB and saturates the 20MB limit. Instead:
1. Enable debug overlay first: `browser_press_key("d")` + toggle keys (`3`=concrete, `4`=water grid, `5`=roads)
2. Save to `screenshots/` directory (git-ignored): `browser_take_screenshot(filename: "screenshots/descriptive-name.png")`
3. Delegate to sub-agent: `Task(subagent_type: "general-purpose", prompt: "Read screenshots/<name>.png. Debug overlay active: [describe toggles]. Check: 1. <criterion>... Reply PASS/FAIL per criterion.")` — color legend: Green=building, Blue=junction, Orange=road.
4. Only the text verdict returns (~100 bytes vs ~3-5MB per image)

**Critical patterns & gotchas:**
- **`sendRdoRequest()` + `"*"` separator = SERVER CRASH** — `sendRdoRequest()` adds a QueryId; void push (`"*"`) with QueryId crashes the Delphi server. Void push → `socket.write(RdoCommand.build())`. Synchronous → `sendRdoRequest()` with `"^"`.
- Test environment is `node` (no jsdom) — mock DOM elements as plain objects
- `ClientFacilityDimensionsCache` is singleton — must `clear()` then `initialize()` in tests
- TerrainLoader i/j swap: `getTextureId(j, i)` — provider uses (i,j), loader expects (x,y)
- Concrete tiles stored as `"${x},${y}"` (col,row) not `"${i},${j}"` (row,col)
- ROAD_TYPE constants are `as const` — use explicit `number` type annotation for local vars
- `worldContextId` = world operations (map focus, queries); `interfaceServerId` = building operations
- WebSocket: Client->Server = `WsReq*` types, Server->Client = `WsResp*` types

## Project

**Starpeace Online WebClient** — Browser-based multiplayer tycoon game client
TypeScript + Node.js + WebSocket + Canvas 2D Isometric | RDO protocol | Beta 1.0.0

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

## Architecture

```
src/
├── client/
│   ├── client.ts              # StarpeaceClient — game session + canvas UI
│   ├── main.tsx               # Vite entry, mounts React app
│   ├── App.tsx                # Root router (LoginScreen vs GameScreen)
│   ├── bridge/                # ClientBridge (pushes state to Zustand stores)
│   ├── context/               # ClientContext + useClient() hook
│   ├── store/                 # Zustand stores (11 total)
│   ├── hooks/                 # Custom hooks (usePanel, useResponsive, etc.)
│   ├── styles/                # Design tokens, reset, typography, animations
│   ├── layouts/               # LoginScreen, GameScreen
│   ├── components/            # React UI (60+ components, CSS Modules)
│   │   ├── common/            # Badge, Toast, GlassCard, Skeleton, etc.
│   │   ├── hud/               # TopBar, LeftRail, RightRail
│   │   ├── panels/            # RightPanel, LeftPanel (slide-in)
│   │   ├── building/          # BuildingInspector, QuickStats, PropertyGroup
│   │   ├── empire/            # EmpireOverview, FacilityList, FinancialSummary
│   │   ├── mail/              # MailPanel
│   │   ├── chat/              # ChatStrip
│   │   ├── search/            # SearchPanel
│   │   ├── politics/          # Capitol tabs (Towns, Ministries, Jobs, Votes)
│   │   ├── transport/         # TransportPanel
│   │   ├── modals/            # BuildMenu, Settings, CompanyCreation
│   │   ├── mobile/            # MobileShell, BottomNav, BottomSheet
│   │   └── command-palette/   # CommandPalette (Cmd+K)
│   ├── renderer/              # Canvas 2D isometric engine
│   └── ui/                    # Canvas UI (minimap + map navigation)
├── server/
│   ├── server.ts              # HTTP/WebSocket server + API endpoints
│   ├── spo_session.ts         # RDO session manager
│   ├── rdo.ts                 # RDO protocol parser
│   ├── *-service.ts           # Background services (ServiceRegistry)
│   └── terrain-chunk-renderer.ts, texture-extractor.ts
└── shared/
    ├── rdo-types.ts           # RDO type system (CRITICAL)
    ├── error-utils.ts         # toErrorMessage(err: unknown)
    ├── types/                 # Type definitions
    └── building-details/      # Property templates
```

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

## SkillsMP

Search SkillsMP API before creating custom skills. Prefer skills with 1,000+ stars.
- Installer: [.claude/skillsmp-installer.js](.claude/skillsmp-installer.js) | Ad-hoc: [.claude/install-new-skills.js](.claude/install-new-skills.js)
- Installed: [.claude/skills/](.claude/skills/) (30+ skills) | Metadata: [manifest.json](.claude/skills/manifest.json)

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

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/map-data/:mapName` | Map terrain/building/road data |
| `GET /api/road-block-classes` | Road block class definitions |
| `GET /api/concrete-block-classes` | Concrete block class definitions |
| `GET /api/car-classes` | Car class definitions |
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

Service files live flat in `src/server/` (no subdirectory).

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
