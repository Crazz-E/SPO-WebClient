# Starpeace Online — WebClient

A browser-based multiplayer tycoon game client for [Starpeace Online](http://www.starpeaceonline.com), rebuilt from scratch in TypeScript with React 19 and a custom Canvas 2D isometric renderer.

> **Alpha 0.1.0** — Under active development

## Overview

Starpeace Online is a massively multiplayer economic simulation where players build companies, trade goods, run for political office, and compete in a persistent online world. Originally shipped as a Delphi Win32 desktop client in the early 2000s, the game runs on dedicated servers that speak a custom RDO (Remote Data Objects) protocol over TCP.

This project is a modern web client that replaces the original desktop application. A Node.js gateway translates browser WebSocket messages into raw RDO commands, handling authentication, session management, and asset serving. The browser client renders the isometric game world on Canvas 2D and provides the full game UI in React.

```
Browser Client ──WebSocket──▶ Node.js Gateway ──RDO/TCP──▶ Game Servers (Delphi)
```

## Features

- **Canvas 2D isometric engine** — 9-layer renderer (terrain, vegetation, concrete, roads, buildings, zones, placement preview, road preview, UI overlays) with chunk caching, texture atlases, and vehicle animations
- **React 19 UI with Zustand state** — 60+ React components across 16 directories, styled with CSS Modules. 11 Zustand stores manage all client state
- **Four-stage cinematic login** — Authentication → Zone → World → Company selection with glassmorphism cards and animated backgrounds
- **MMORPG-style HUD** — Top bar with status ticker, left/right rails, slide-in panels, minimap, overlay menu
- **Building inspector** — Real-time facility data with tabbed property groups (General, Supplies, Production, Workforce, Budget, Research), quick stats, revenue graphs, and pricing controls
- **Empire overview** — Company facility list, financial summaries, profile panel, favorites
- **Mail system** — Folder-based mail (Inbox, Sent, Drafts) with compose, reply, save draft, and HTML body rendering
- **Chat system** — Channel-based chat with typing indicators
- **Politics** — Six tabs: Jobs, Ministries, Ratings, Residentials, Towns, Votes
- **Transport** — Route management panel
- **Search** — Cross-entity search: Home, Towns, People, Rankings, Banks
- **Build menu** — Category-based building placement with zone-type picker and placement validation
- **Command palette** — Ctrl+K keyboard launcher for quick navigation and actions
- **Mobile-responsive** — Bottom navigation, bottom sheets, touch handling, responsive breakpoints
- **Road and concrete systems** — Road building/demolition with topology-based texture selection, concrete tile rendering around buildings
- **Surface overlays** — Environment, population, and market data visualizations on the map
- **Mock server** — Capture-based replay engine with 15+ scenarios for offline development without a live game server
- **Service registry** — Managed service lifecycle with dependency ordering, health checks, and graceful shutdown

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript 5.9 (strict mode) |
| Client UI | React 19, Zustand 5, CSS Modules, Lucide React |
| Accessibility | React Aria Components |
| Rendering | Canvas 2D isometric engine (custom) |
| Server | Node.js 18+, WebSocket (ws 8.x), HTTP |
| Protocol | RDO over TCP (binary/text, type-prefixed values) |
| Build | Vite 7 (client), tsc (server), esbuild (terrain test) |
| Testing | Jest 30, ts-jest, Testing Library |
| HTML Parsing | Cheerio (mail body extraction) |
| Animation | gifuct-js (GIF decoding for vehicle sprites) |
| Archive | 7zip-min (CAB asset extraction) |

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9

### Install & Run

```bash
npm install
npm run dev        # Build all + start server on port 8080
```

Then open `http://localhost:8080` in your browser.

### Commands

```bash
npm run build           # Build server (tsc) + client (Vite) + terrain test (esbuild)
npm run dev             # Build + start server
npm run dev:react       # Vite dev server only (hot reload, no backend)
npm test                # Run all tests (~2528 tests, 96 suites)
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
npm run test:verbose    # Verbose output
npm run test:changed    # Test only changed files (bail on first failure)
npm run test:smoke      # Component smoke tests only (jsdom)
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | HTTP/WebSocket server port |
| `RDO_DIR_HOST` | `www.starpeaceonline.com` | RDO directory server hostname |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `NODE_ENV` | — | Set to `production` to disable colorized logs |

## Architecture

```
src/
├── client/
│   ├── main.tsx                 # Vite entry — boots client, mounts React
│   ├── App.tsx                  # Root router (LoginScreen ↔ GameScreen)
│   ├── client.ts                # StarpeaceClient — game logic controller
│   ├── context.ts               # ClientContext (React ↔ client bridge)
│   ├── bridge/                  # ClientBridge (store-pushing adapter)
│   ├── store/                   # 11 Zustand stores
│   ├── hooks/                   # Custom hooks (usePanel, useResponsive, useCommandPalette)
│   ├── styles/                  # Design tokens, reset, typography, animations
│   ├── layouts/                 # LoginScreen, GameScreen
│   ├── components/              # React components (CSS Modules)
│   │   ├── common/              # Badge, Toast, GlassCard, Skeleton, SliderInput, …
│   │   ├── hud/                 # TopBar, LeftRail, RightRail, StatusTicker
│   │   ├── panels/              # RightPanel, LeftPanel (slide-in)
│   │   ├── building/            # BuildingInspector, QuickStats, PropertyGroup, InspectorTabs
│   │   ├── empire/              # EmpireOverview, FacilityList, FinancialSummary, ProfilePanel
│   │   ├── mail/                # MailPanel, HtmlMailBody
│   │   ├── chat/                # ChatStrip
│   │   ├── search/              # SearchPanel
│   │   ├── politics/            # JobsTab, MinistriesTab, RatingsTab, VotesTab, …
│   │   ├── transport/           # TransportPanel
│   │   ├── modals/              # BuildMenu, SettingsDialog, CompanyCreationModal, …
│   │   ├── mobile/              # MobileShell, BottomNav, BottomSheet
│   │   ├── command-palette/     # CommandPalette (Ctrl+K)
│   │   ├── login/               # AuthStage, ZoneStage, WorldStage, CompanyStage
│   │   ├── icons/               # ZoneIcon, RoadIcons
│   │   └── map/                 # Map-related UI components
│   ├── renderer/                # Canvas 2D isometric engine
│   └── ui/                      # Legacy canvas UI (minimap + map navigation)
├── server/
│   ├── server.ts                # HTTP + WebSocket server (16 API endpoints)
│   ├── spo_session.ts           # RDO session manager (TCP ↔ WebSocket)
│   ├── rdo.ts                   # RDO protocol parser
│   ├── service-registry.ts      # ServiceRegistry (lifecycle, dependencies, health)
│   └── services                 # Update, textures, map data, terrain chunks, facilities
└── shared/
    ├── rdo-types.ts             # RDO type system (RdoValue, RdoCommand, RdoParser)
    ├── config.ts                # Environment-aware configuration
    ├── error-utils.ts           # toErrorMessage(err: unknown)
    ├── types/                   # Shared TypeScript interfaces
    └── building-details/        # Property templates and RDO definitions
```

### Services

The server runs background services managed by a `ServiceRegistry` with dependency ordering:

| Service | Purpose | Dependencies |
|---------|---------|--------------|
| `update` | Sync game assets from update server | — |
| `facilities` | Building dimensions cache | update |
| `textures` | Extract textures from CAB archives | update |
| `mapData` | Map data caching and parsing | update |
| `terrainChunks` | Server-side terrain chunk pre-rendering | textures, mapData |

## RDO Protocol

The game servers speak a custom RDO (Remote Data Objects) protocol over TCP. Values are type-prefixed:

| Prefix | Type | Example |
|--------|------|---------|
| `#` | Integer | `#42` |
| `%` | String (OLE) | `%Hello` |
| `!` | Float | `!3.14` |
| `@` | Double | `@3.14159` |
| `$` | Short string | `$ID` |
| `^` | Variant | `^value` |
| `*` | Void | `*` |

Commands are built with a type-safe builder:

```typescript
import { RdoValue, RdoCommand, RdoParser } from '@/shared/rdo-types';

// Build commands
const cmd = RdoCommand.sel(objectId)
  .call('RDOSetPrice').push()
  .args(RdoValue.int(priceId), RdoValue.float(value))
  .build();

// Parse responses
const { prefix, value } = RdoParser.extract(token);
```

See [RDO Protocol Architecture](doc/rdo-protocol-architecture.md) and [RDO Typing System](doc/rdo_typing_system.md) for the full protocol reference.

## API Endpoints

The Node.js server exposes REST endpoints for map data, textures, and asset serving:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/map-data/:mapName` | Map terrain, buildings, and roads |
| `GET /api/road-block-classes` | Road block class definitions |
| `GET /api/concrete-block-classes` | Concrete block class definitions |
| `GET /api/car-classes` | Vehicle class definitions |
| `GET /api/terrain-info/:terrainType` | Terrain type metadata |
| `GET /api/terrain-atlas/:type/:season` | Terrain atlas PNG sprite sheet |
| `GET /api/terrain-atlas/:type/:season/manifest` | Terrain atlas JSON manifest |
| `GET /api/object-atlas/:category` | Road/concrete atlas PNG sprite sheet |
| `GET /api/object-atlas/:category/manifest` | Road/concrete atlas JSON manifest |
| `GET /api/terrain-chunk/:map/:type/:season/:zoom/:i/:j` | Pre-rendered terrain chunk PNG |
| `GET /api/terrain-chunks/:map/:type/:season/manifest` | Chunk availability manifest |
| `GET /api/terrain-preview/:map/:type/:season` | Terrain preview image |
| `GET /api/terrain-texture/:type/:season/:id` | Individual terrain texture fallback |
| `GET /api/research-inventions` | Research invention data |
| `GET /cache/:category/:filename` | Extracted game object textures |
| `GET /proxy-image?url=<url>` | Image proxy for remote assets |

## Documentation

Detailed technical docs live in the [doc/](doc/) directory:

**Protocol & Architecture**
- [RDO Protocol Architecture](doc/rdo-protocol-architecture.md) — Wire framing, dispatch, login sequence, push filtering
- [RDO Typing System](doc/rdo_typing_system.md) — RdoValue/RdoCommand/RdoParser API reference
- [SPO-Original Reference](doc/spo-original-reference.md) — Delphi source analysis and patterns
- [Interface Server Migration](doc/interface-server-migration-feasibility.md) — Architecture migration feasibility

**Building System**
- [Building Details Protocol](doc/building_details_protocol.md) — Property query protocol
- [Facility Tabs Reference](doc/facility-tabs-reference.md) — Inspector tab configurations
- [Facility Inspector Gap Analysis](doc/FACILITY-INSPECTOR-GAP-ANALYSIS.md) — Feature coverage
- [Supply System](doc/supply-system.md) — Supply/demand mechanics
- [Research System Reference](doc/research-system-reference.md) — Research and technology tree

**Rendering**
- [Road Rendering](doc/road_rendering.md) — Road topology and texture mapping
- [Concrete Rendering](doc/concrete_rendering.md) — Concrete tile system
- [Road Texture Mapping](doc/ROAD-TEXTURE-MAPPING.md) — Texture selection logic
- [Canvas 2D Texture Analysis](doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md) — Texture pipeline
- [Graphics Engine Proposal](doc/GRAPHICS-ENGINE-REFACTORING-PROPOSAL.md) — Renderer design

**Voyager (Inspector)**
- [Voyager Handler Reference](doc/voyager-handler-reference.md) — Handler patterns
- [Voyager Inspector Architecture](doc/voyager-inspector-architecture.md) — Architecture overview
- [Voyager Profile Interface](doc/voyager-profile-interface.md) — Profile protocol

**User Features**
- [User Profile & Mail Service](doc/USER_PROFILE_AND_MAIL_SERVICE.md) — Profile and mail protocol
- [Mail System Analysis](doc/MAIL_SYSTEM_ANALYSIS.md) — Mail RDO protocol

**Testing & Development**
- [E2E Testing](doc/E2E-TESTING.md) — End-to-end test procedure and credentials
- [E2E Scenario](doc/E2E-SCENARIO.md) — Detailed scenario walkthrough
- [Mock Server Guide](doc/mock-server-guide.md) — Mock server setup and RDO capture
- [Mock Server Scenarios](doc/Mock_Server_scenarios_captures.md) — Recorded sessions
- [CAB Asset Extraction](doc/CAB-EXTRACTION.md) — Extracting textures from game archives

## Testing

- **Framework:** Jest 30 with ts-jest, two projects: `unit` (Node.js env) and `component` (jsdom env)
- **Stats:** ~2528 tests across 96 suites, all passing
- **Convention:** `module.ts` → `module.test.ts` in the same directory
- **Coverage thresholds:** 35% global, 50% for `shared/`, 90% for `shared/building-details/`
- **Custom matchers:** `toContainRdoCommand()`, `toMatchRdoCallFormat()`, `toMatchRdoSetFormat()`, `toHaveRdoTypePrefix()`

```bash
npm test                           # All tests
npm test -- rdo-types              # Specific file
npm test -- --testNamePattern="X"  # Specific test name
npm run test:coverage              # Coverage report with thresholds
npm run test:smoke                 # Component smoke tests only
```

## Contributing

### Git Conventions

- **Branches:** `feature/`, `fix/`, `refactor/`, `doc/` + descriptive name
- **Commits:** `type: short summary` — types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`

### Code Style

- TypeScript strict mode — `unknown` for catch blocks, no `any`
- camelCase for variables/methods, PascalCase for classes/interfaces
- CSS Modules for component styling, design tokens for shared values
- JSDoc for public API only — no over-engineering, small focused changes
- Never construct RDO protocol strings manually — always use `RdoValue`/`RdoCommand`
- All code changes require tests

## License

ISC
