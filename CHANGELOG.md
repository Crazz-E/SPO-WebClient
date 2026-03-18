# Changelog

## [1.2.0] - 2026-03-18

### Added
- Electron desktop client with embedded gateway, auto-update, and incremental asset caching
- Docker + nginx production deployment pipeline with HTTPS via Let's Encrypt
- Auto-reconnect on mobile tab switch — no re-login required
- Mobile UI overhaul — map-first architecture with gesture-driven BottomSheet
- Mobile UX components, sheet gesture hook, and startup test fixes
- Electron CI/CD pipeline and auto-update support

### Fixed
- Mobile placement preview — center ghost on screen, confirm via HUD only
- Mobile touch — resolve CSS cascade blocking canvas touch events
- Mobile touch interaction — map pan, building tap, and placement HUD
- Case-insensitive cache lookups on Linux (imageFileIndex + map name)
- Direct CDN URL in Electron instead of /cdn/ proxy
- Prevent unnecessary re-downloads by preserving remote timestamps
- Log Error stack traces instead of empty JSON in logger
- Electron path resolution bugs and packaging validation
- Remove hardcoded SkillsMP API key from tracked files
- Resolve EPERM by passing userDataPath via GatewayOptions
- Move 7zip-min/7zip-bin from electron deps to extraResources
- Resolve 5 Electron client issues from first real-world test
- Resolve electron-builder signing and repository detection
- Resolve ELECTRON_RUN_AS_NODE breaking require('electron')

### Changed
- Full project cleanup — dead code removal, security hardening, god file decomposition
- Remove webclient-cache/chunks from repo — now served from CDN
- Remove dead fetchTexture code in terrain-test

## [1.1.0-beta] - 2026-03-15

### Fixed
- hardcode spo.zz.works as default CDN URL, remove Vite inject hack
- skip individual texture fetches when CDN is configured
- inject CDN URL at build time via Vite define, add CSP whitelist
- disable hover, selection, and animation effects on Portal facilities (6031)

### Changed
- migrate static terrain assets to Cloudflare R2 CDN
- redesign Capitol/TownHall modals — consolidated tabs, slider polish, UX fixes
- consolidate Capitol/TownHall politics UI from 6 tabs to 4

### Documentation
- update README for CDN migration — remove deleted files, add static assets section

## [1.0.1-beta] - 2026-03-10

### Added
- redesign build menu with expandable blueprint cards and tile dimensions

### Fixed
- grey out unavailable buildings in Build menu with locked blueprint treatment

### Changed
- split spo_session.ts into focused handler modules

## [1.0.0] - 2026-03-09

### Added
- Search people results wired to tycoon profile view
- In-app versioning workflow and changelog for players

### Changed
- Promoted from Alpha to Beta 1.0.0

## [0.1.0] - 2026-03-09

### Added
- Isometric canvas renderer with terrain, roads, and buildings
- RDO protocol communication with game servers
- Building inspector with property details and supplier search
- In-game mail system with compose, reply, and folder management
- User profile panel with company overview
- Real-time chat system
- Map navigation with zoom, pan, and keyboard shortcuts
- Build menu with categorized facility placement
- Transport route viewer
- Command palette for quick actions

### Fixed
- Convert parallel RDO commands to sequential to prevent server crashes
- Strict RDO validation and 6 protocol conformity issues
