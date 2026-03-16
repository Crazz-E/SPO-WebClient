# Changelog

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
