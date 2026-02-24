# CLAUDE.md - Starpeace Online WebClient

## Rules & Constraints

**NEVER do these:**
- Construct RDO protocol strings manually — always use `RdoValue`/`RdoCommand` from `@/shared/rdo-types`
- Use `any` types — use `unknown` for catch blocks, typed interfaces for data
- Modify without reading first — always read existing code before changing it
- Skip tests — all code changes require tests, coverage >= 93%
- Modify these files without discussion: `src/shared/rdo-types.ts`, `src/server/rdo.ts`, `src/__fixtures__/*`
- Load screenshots directly in the main context during debug/E2E sessions — use sub-agent delegation (see below)

**Screenshot analysis (mandatory for debug/E2E sessions):**
Never read screenshot images in the main conversation context — each costs ~3-5MB and saturates the 20MB limit. Instead:
1. Enable debug overlay first: `browser_press_key("d")` + toggle keys (`3`=concrete, `4`=water grid, `5`=roads) — labels all visible tiles with coordinates, IDs, and color-coded diamonds. See [doc/E2E-TESTING.md](doc/E2E-TESTING.md) for key sequences per scenario.
2. Save to `screenshots/` directory (git-ignored): `browser_take_screenshot(filename: "screenshots/descriptive-name.png")`
3. Delegate to sub-agent: `Task(subagent_type: "general-purpose", prompt: "Read screenshots/<name>.png. Debug overlay active: [describe toggles]. Check: 1. <criterion>... Reply PASS/FAIL per criterion.")` — include the color legend in the prompt so the sub-agent knows Green=building, Blue=junction, Orange=road.
4. Only the text verdict returns (~100 bytes vs ~3-5MB per image)

**Critical patterns & gotchas:**
- Test environment is `node` (no jsdom) — mock DOM elements as plain objects
- `FacilityDimensionsCache` is singleton — must `clear()` then `initialize()` in tests
- TerrainLoader i/j swap: `getTextureId(j, i)` — provider uses (i,j), loader expects (x,y)
- Concrete tiles stored as `"${x},${y}"` (col,row) not `"${i},${j}"` (row,col)
- ROAD_TYPE constants are `as const` — use explicit `number` type annotation for local vars
- `worldContextId` = world operations (map focus, queries); `interfaceServerId` = building operations
- WebSocket: Client→Server = `WsReq*` types, Server→Client = `WsResp*` types; use `sendResponse()`/`sendError()`

**RDO conformity check (mandatory for new RDO implementations):**
When adding/modifying RDO requests in `spo_session.ts`, mock scenarios, or protocol tests, follow this checklist. Full reference: [doc/spo-original-reference.md](doc/spo-original-reference.md)

1. **Look up method** in `doc/spo-original-reference.md` server object tables
   - If not indexed: search SPO-Original Delphi source (see Quick-Find Paths in reference doc), then add the entry
2. **Verify verb**: `published property` → `get`/`set` | `published function/procedure` → `call`
   - TRAP: `get` on a function works (fallthrough in RDOObjectServer.pas) but is semantically WRONG
3. **Verify param types**: Match Delphi types → RDO prefixes (`widestring`→`%`, `integer`→`#`, `double`→`@`, `wordbool`→`#`)
4. **Verify param order & count**: Match the Delphi declaration exactly
5. **Verify separator**: `^` for call-with-return, `*` for void procedures
6. **Verify return type**: function → olevariant (check actual content prefix), procedure → void (`*`)
7. **Check push behavior**: Does the method trigger server pushes? (e.g., `RegisterEventsById` fires InitClient)
8. **Update reference**: Add any new discoveries to `doc/spo-original-reference.md`

## Project

**Starpeace Online WebClient** — Browser-based multiplayer tycoon game client
TypeScript + Node.js + WebSocket + Canvas 2D Isometric | RDO protocol | Alpha 0.1.0

```
Browser Client ──WebSocket──> Node.js Gateway ──RDO Protocol──> Game Servers
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

**Setup (one-time per dev):**

```bash
# Set GitHub token (required for GitHub MCP)
# Generate at: https://github.com/settings/tokens (scopes: repo, read:org)
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_your_token_here"

# Or add to your shell profile (~/.bashrc, ~/.zshrc, etc.) for persistence
```

**Note:** Chrome/browser automation is built into Claude Code (`claude --chrome`), no MCP needed.

## Commands

```bash
npm run dev          # Build + start server (port 8080)
npm run build        # Build all (server + client)
npm test             # Run Jest tests (~750 tests)
npm run test:watch   # Watch mode
npm run test:coverage # Coverage report
```

## Architecture

```
src/
├── client/
│   ├── client.ts                        # Main controller
│   ├── renderer/                        # Canvas 2D isometric engine
│   │   ├── isometric-map-renderer.ts    # Orchestrator (terrain+concrete+roads+buildings+overlays)
│   │   ├── isometric-terrain-renderer.ts # Chunk-based terrain (32×32 tiles, LRU, 4 zoom levels)
│   │   ├── chunk-cache.ts              # OffscreenCanvas chunk pre-rendering
│   │   ├── coordinate-mapper.ts        # Isometric projection + 90° rotation (N/E/S/W)
│   │   ├── vegetation-flat-mapper.ts   # Auto-replaces vegetation near buildings/roads
│   │   ├── touch-handler-2d.ts         # Mobile gestures (pan, pinch, rotation, double-tap)
│   │   ├── texture-cache.ts            # Terrain texture LRU (1024 max)
│   │   ├── texture-atlas-cache.ts      # Terrain atlas PNG+JSON
│   │   ├── game-object-texture-cache.ts # Road/building/concrete textures + object atlases (2048 max)
│   │   ├── road-texture-system.ts      # Road topology + INI loading
│   │   ├── concrete-texture-system.ts  # Concrete logic + INI loading
│   │   └── painter-algorithm.ts        # Back-to-front sort by (i+j)
│   └── ui/                             # UI components (entry: map-navigation-ui.ts)
├── server/
│   ├── server.ts                       # HTTP/WebSocket server + API endpoints
│   ├── spo_session.ts                  # RDO session manager
│   ├── rdo.ts                          # RDO protocol parser
│   ├── texture-alpha-baker.ts          # BMP→PNG alpha pre-baking
│   ├── atlas-generator.ts             # Terrain/object atlas generator
│   ├── terrain-chunk-renderer.ts      # Server-side chunk pre-rendering
│   └── services/                      # Background services (ServiceRegistry)
└── shared/
    ├── rdo-types.ts                   # RDO type system (CRITICAL)
    ├── error-utils.ts                 # toErrorMessage(err: unknown)
    ├── types/                         # Type definitions
    └── building-details/              # Property templates
```

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

**Convention:** `module.ts` → `module.test.ts` (same directory)

```bash
npm test -- rdo-types              # Specific file
npm test -- --testNamePattern="X"  # Specific suite
```

**Custom matchers:** `toContainRdoCommand()`, `toMatchRdoCallFormat()`, `toMatchRdoSetFormat()`, `toHaveRdoTypePrefix()`

**Current status:** 23 suites, ~750 tests (721 passed, 10 pre-existing failures in building-data-service/cab-extractor, 17 skipped)

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

## Documentation Index

Read the relevant doc when working on a specific system:

| Working on... | Read |
|---------------|------|
| RDO protocol, commands, parsing | [doc/rdo_typing_system.md](doc/rdo_typing_system.md) |
| Building properties (256+ props) | [doc/building_details_protocol.md](doc/building_details_protocol.md) |
| Road rendering | [doc/road_rendering.md](doc/road_rendering.md) |
| Road internals (reverse-engineered) | [doc/road_rendering_reference.md](doc/road_rendering_reference.md) |
| Road texture↔screen mapping | [doc/ROAD-TEXTURE-MAPPING.md](doc/ROAD-TEXTURE-MAPPING.md) |
| Concrete textures | [doc/concrete_rendering.md](doc/concrete_rendering.md) |
| Terrain texture pipeline | [doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md](doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md) |
| CAB extraction | [doc/CAB-EXTRACTION.md](doc/CAB-EXTRACTION.md) |
| E2E testing procedure | [doc/E2E-TESTING.md](doc/E2E-TESTING.md) |
| Project history & backlog | [doc/BACKLOG.md](doc/BACKLOG.md) |
| Raw RDO packet captures | [doc/building_details_rdo.txt](doc/building_details_rdo.txt) |
| Mock server / adding scenarios | [doc/mock-server-guide.md](doc/mock-server-guide.md) |
| RDO conformity / Delphi source index | [doc/spo-original-reference.md](doc/spo-original-reference.md) |
| Facility inspector tabs (legacy Voyager) | [doc/facility-tabs-reference.md](doc/facility-tabs-reference.md) |

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

## Installed Skills

**Total: 23 skills** | Updated: 2026-02-24 | See [SKILLS_SECURITY_REPORT.md](.claude/SKILLS_SECURITY_REPORT.md) for details

| Skill | Category | Purpose | Stars |
|-------|----------|---------|-------|
| `typescript` | Language | Strict mode, generics, utility types | 12,990 |
| `nodejs-backend` | Backend | Async/await, layered architecture, DI | 28,683 |
| `jest-testing` | Testing | Vitest + Jest patterns, mocking, coverage | 97,659 |
| `security-auditor` | Security | OWASP Top 10, XSS/SQLi/CSRF detection | 1,367 |
| `memory-optimization` | Performance | Memory profiling, leak detection | 1,367 |
| `protocol-reverse-engineering` | Protocol | Network protocol analysis (for RDO) | 28,683 |
| `web-performance` | Performance | Core Web Vitals, caching, runtime | 20,474 |
| `git-workflow` | Git | Conventional commits, PR workflows | 1,036 |
| `debugging` | Debugging | Systematic diagnosis, root cause analysis | 95,384 |
| `e2e-testing` | Testing | Playwright patterns, visual regression | 46,711 |
| `refactoring` | Quality | Extract/inline patterns, SOLID | 9,848 |
| `claude-md-improver` | Claude | CLAUDE.md audit & improvement (Official Anthropic) | 7,492 |
| `claude-code-workflow` | Claude | AI-assisted dev workflow, prompting strategies | 7 |
| `context-master` | Context | Universal context mgmt, saves 62% context | 13 |
| `agentic-jumpstart-testing` | Testing | Playwright E2E + Vitest unit test patterns | 21 |
| `mobile-design` | Mobile | Mobile-first design thinking for iOS/Android | 20,474 |
| `mobile-ux-optimizer` | Mobile | Touch interfaces, responsive layouts, PWA | 34 |
| `docs-codebase` | Docs | README, API docs, ADRs, changelogs, technical writing | 30 |
| `r3f-performance` | Rendering | LOD, frustum culling, instancing, draw call reduction | 6 |
| `web-games` | Game Dev | Browser game development, WebGPU, PWA patterns | 0 |
| `webgl-expert` | Rendering | WebGL API, shaders (GLSL), canvas rendering, GPU | 8 |
| `dependency-audit` | Security | Vulnerability scanning, license compliance, supply chain security | 13,893 |
| `dependency-updater` | Dependencies | Smart updates, auto-detect project type, safe MINOR/PATCH, prompt MAJOR | 21,069 |

## SkillsMP API

**All Claude skill searches must use the SkillsMP.com API.**

API Key: `sk_live_skillsmp_Y-DcREuip4XIpakL7dMNRMVZvQSO81aqE6JI-8LODBg` (not confidential, safe to commit)

### Endpoints

**Keyword Search:**
```bash
GET https://skillsmp.com/api/v1/skills/search?q=<query>&page=1&limit=20&sortBy=stars
```

**AI Semantic Search:**
```bash
GET https://skillsmp.com/api/v1/skills/ai-search?q=<query>
```

### Example Usage

```bash
# Keyword search
curl -X GET "https://skillsmp.com/api/v1/skills/search?q=typescript" \
  -H "Authorization: Bearer sk_live_skillsmp_Y-DcREuip4XIpakL7dMNRMVZvQSO81aqE6JI-8LODBg"

# AI semantic search
curl -X GET "https://skillsmp.com/api/v1/skills/ai-search?q=How+to+optimize+isometric+rendering" \
  -H "Authorization: Bearer sk_live_skillsmp_Y-DcREuip4XIpakL7dMNRMVZvQSO81aqE6JI-8LODBg"
```

### Response Format

```json
{
  "success": true,
  "data": {
    "skills": [...],
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

### Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `MISSING_API_KEY` | 401 | API key not provided |
| `INVALID_API_KEY` | 401 | Invalid API key |
| `MISSING_QUERY` | 400 | Missing required query parameter |
| `INTERNAL_ERROR` | 500 | Internal server error |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | `npm install`, Node.js >= 18 |
| Tests fail | `npm run test:verbose` |
| RDO errors | Verify type prefixes (#, %, !, etc.) |
| WebSocket disconnect | Check game server status |
| Port 8080 in use | `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` |
