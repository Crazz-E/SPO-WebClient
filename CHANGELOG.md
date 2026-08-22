# Changelog

> Frozen at 1.3.2-beta. Every release after it lives on
> [GitHub Releases](https://github.com/Crazz-E/SPO-WebClient/releases), with notes generated
> from the conventional commits by `scripts/changelog.js` (`npm run release:preview`).

## [1.3.2-beta] - 2026-08-21

### Fixed
- validate the client entry that ships, and stop the double release
- the civic write path — what lands, what does not, and what the UI claims

## [1.3.1-beta] - 2026-08-21

### Added
- the mayor's tools, and a gate that knows which building it guards
- rebuild the workforce panel as per-class salary sliders

### Fixed
- clear what the lint found — a hook order bug and 120 dead bindings
- compare cache textures the way the server resolves them
- point the updater and the release at Crazz-E, not the old handle
- bound the inspector summary so long sales lists scroll
- label a connection the server counts but cannot name
- stop destroying an all-empty connection row while parsing it
- correct the Delphi citations and make the ordering guard actually bite
- send the tycoon proxy id on RDOConnectToTycoon, not the persistent id

### Changed
- open Profile sections on demand, not on panel open
- list the gates, read none of them — the Voyager loading model
- expand a gate to load it, once, in both accordions
- read a gate's connections when the gate is opened, not before
- derive every RDO separator from a member catalogue

### Documentation
- add the governance files the repository was missing
- remove four obsolete documents and repair their references

## [1.3.0-beta] - 2026-08-19

### Removed
- The RDO capture, probe and conformance apparatus — conformance suite, capture pipeline
  and captured corpus, campaign reports, RDO documentation base, three skills, one agent
  and the native pre-push hook. Built during this cycle and dismantled in it: it prevented
  neither of the two production server incidents. The wire guards and the mock server stay.
- REQ_RDO_DIRECT, a WebSocket passthrough that let a client invoke an arbitrary RDO member.
  No browser code ever sent it.

### Added
- flip the errorCode contract, exempting errIllegalObject at first
- make the two observation-mode censuses readable
- show Town Hall population demographics in the Demographics tab
- RDO network resilience — Batch 2 (connection pool, maintenance, degradation)
- RDO network resilience — Batch 1 (Delphi parity audit)
- auto-reconnect world socket on disconnect (Delphi RenewWorldProxy pattern)
- show disconnection error overlay with return-to-home button
- add CACHE_SKIP_SYNC dev setting to skip remote sync when cache exists
- add session ID, error context ring buffer, and separate error log
- keep building inspector open during map interaction
- add structured logging with player tracking for multiplayer testing
- format currency values with thousands separators ($1,000,000)
- merge StatusTicker into StatusOverlay as unified building popover
- rich categorized StatusTicker with building-type-specific layouts
- extract cache sync/extract into autonomous Docker service
- show parsed detailsText and hintsText in StatusOverlay popover
- add SPO_FORCE_WORLD env var to auto-skip zone/world selection
- type-aware detailsText parser with dedicated mini-parsers per building type
- add fullscreen minimap toggle for mobile
- tokenize z-index scale, add narrow-desktop breakpoint, and panel mutual exclusion
- rewrite detailsText parser with known-key dictionary and add debug logging
- parse inline sales format and structured detailsText in building inspector
- optimize building inspector layout with 2-col property grid and wider panel
- add relative "last updated" timestamp to InfoWidget
- improve warehouse wares checklist UX for long lists
- lazy tab loading for building details — load supplies/products on demand
- integrate price slider into product tile, compact product card layout
- add warehouse wares checklist aligned with legacy Delphi client

### Fixed
- transport C — read what the ASP pages actually return
- route the ServerBusy poll through sendRdoRequest instead of around it
- bind the world pool to the session, not to socket creation
- make mutations verifiable — stop reporting success without evidence
- repair the session lifecycle — zombie reconnect, QueryId 0, server requests
- stop emitting "^" on Delphi procedures — a single frame freezes the server
- validate every browser-controlled field that reaches the RDO frame
- close RDO frame injection via encoding, move the wire codec to CP1252
- RDO session-behavior conformity Tier 4 — audit P0/P1 fixes
- RDO session-behavior conformity Tier 3 — legacy timeouts, no reconnect-on-timeout, legacy ServerBusy poll
- RDO session-lifecycle conformity Tier 2 — Logoff, cacher KeepAlive, CheckNewMail
- RDO wire conformity Tier 1 — Latin-1 writes, int arg typing, Delphi error grammar
- align SayThis/AddLine/CloseMessage with Delphi synchronous behavior
- convert 9 void RDO calls from sendRdoRequest("*") to socket.write()
- fire-and-forget RDO commands must use "*" (VoidId), not "^" (VariantId)
- parse '::' separator correctly in product/supply name extraction
- correct kind values for Connect/Disconnect to All Stores/Factories/Warehouses
- use RdoValue.int() for all integer CALL args — restores map + building inspector
- RDO protocol conformity — event re-registration, mutation retry guard, failure counter
- remove BindTo(IDOF) that corrupted Delphi connection — restores map loading
- add missing BindTo(contextId) step after Logon — mirrors Delphi client
- world login stuck in WORLD_CONNECTING after InitClient timeout
- world-login validation test no longer hangs (pool fallback + type assertion)
- RDO protocol conformity — event re-registration, missing pushes, type safety
- auto-reconnect on consecutive ServerBusy poll failures (Delphi RenewWorldProxy compat)
- RDOConnectToTycoon/DisconnectFromTycoon wrong sync mode and separator
- building inspector empty lazy tabs and phantom products on warehouse General
- clean up server logs and prefetch building inspector tab data
- harden partial merge carry-forward and add tab-scoped refresh tests
- proper timeout state machine for unmatched RDO response RIDs
- prevent duplicate requests on repeated trade connect clicks
- preserve building name/owner during property refresh
- move useMemo before early returns to fix React hooks violation (#310)
- prevent building inspector name blink and add error state for failed loads
- harden session teardown and RDO resilience on unstable connections
- harden building inspector RDO pipeline against server crashes
- prevent building inspector data loss from SetPath race condition
- add trailing comma to connection list for Delphi ParseGateList compatibility
- memo-wrap building cards, add sendRdoRequest timeout, expand logging config
- prevent building inspector crash on building switch (race condition)
- fetch warehouse wares eagerly to eliminate General tab skeleton
- preserve lazy tab data across periodic building refreshes
- correct InfoWidget test assertion and auth-handler TS error
- prevent warehouse products flash and slow initial inspection
- route client debug reports to errors.ndjson instead of gateway.ndjson
- prevent FileTransport crash on EACCES — fail silently to console
- EACCES on logs bind mount — fixed UID for spo user + create logs dir
- use void push "*" for RDOSetOutputPrice to match legacy client
- remove stray closing brace causing build failure
- use fire-and-forget with RID for "^" property commands
- send RDO "^" commands via sendRdoRequest() with RID to prevent session poisoning
- warehouse product section on general tab and set price targeting ObjectId
- move parsed detailsText display from StatusOverlay to StatusTicker
- prevent force-world retry loop, add 1s delay for socket readiness
- force-world auto-advance retries after transient directory error
- type rawSend calls in building-action-handler to use WsReqPoliticsVote
- harden company switch — await promises, deduplicate list, guard stale cache
- use full company switch when creating company from profile menu
- reset lazy tab states and re-fetch overlays on refresh
- add explicit Cache-Control headers to prevent stale browser cache
- auto-mark lazy tabs as loaded when legacy path already fetched data
- stop sending REQ_BUILDING_TAB_DATA when disconnected
- include warehouseWares with supplies/products tab data for GateMap filtering
- prevent auto-refresh race condition, reset tab states on building switch
- prevent temp object leaks in inspector lifecycle
- create inspector on-the-fly when legacy path used, prevent retry loop
- use InputCount + Input{i}.0 for warehouse ware names, filter supplies/products by GateMap

### Changed
- unwire and delete the HALT brake (OB-16)
- make TimeoutCategory mandatory at every sendRdoRequest site
- parallelize RDO area reads behind flag, fix pool slot race, dedup focus calls
- remove orphaned code, unused exports, and dead file (fetch-utils.ts)
- reduce building inspector RDO refresh volume to match legacy client
- filter warehouse supplies/products by GateMap server-side
- reuse Delphi temp object for periodic building refreshes
- extract rich detail rendering into shared RichDetails component

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
