# Architecture Overview

## Directory Structure

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
│   └── *-service.ts           # Background services (ServiceRegistry)
└── shared/
    ├── rdo-types.ts           # RDO type system (CRITICAL)
    ├── error-utils.ts         # toErrorMessage(err: unknown)
    ├── types/                 # Type definitions
    └── building-details/      # Property templates
```

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/map-data/:mapName` | Map terrain/building/road data |
| `GET /api/road-block-classes` | Road block class definitions |
| `GET /api/concrete-block-classes` | Concrete block class definitions |
| `GET /api/car-classes` | Car class definitions |
| `GET /api/terrain-info/:terrainType` | Terrain type metadata (seasons) |
| `GET /cache/:category/:filename` | Object texture (BuildingImages served locally) |
| `GET /proxy-image?url=<url>` | Image proxy for remote assets |

## Services (ServiceRegistry)

Service files live flat in `src/server/` (no subdirectory).

| Service | Purpose | Dependencies |
|---------|---------|--------------|
| `update` | Sync game assets | none |
| `facilities` | Building dimensions | update |
| `mapData` | Map data caching | update |

## SkillsMP

Search SkillsMP API before creating custom skills. Prefer skills with 1,000+ stars.
- Installer: [.claude/skillsmp-installer.js](../.claude/skillsmp-installer.js) | Ad-hoc: [.claude/install-new-skills.js](../.claude/install-new-skills.js)
- Installed: [.claude/skills/](../.claude/skills/) (30+ skills) | Metadata: [manifest.json](../.claude/skills/manifest.json)
