# SPO-WebClient Full Audit Report

**Date**: 2026-03-17 | **Auditors**: 5 parallel agents (Architecture, Dead Code, Documentation, Dependencies, Security)

---

## 1. Dead / Orphan / Redundant Code

### Orphan Files in `public/`

| File | Issue |
|------|-------|
| `app2.css` through `app6.css` | Old multi-file build outputs — not referenced by `index.html` |
| `client.css` | Replaced by `app.css` |
| `client.js` | Old esbuild artifact — `app.js` is the active bundle |
| `search-menu-styles.css` | Orphaned stylesheet |

### Dead Exports (87 total)

| File | Dead Exports | Count |
|------|-------------|-------|
| `src/shared/error-codes.ts` | All 43 error code constants — never imported anywhere | 43 |
| `src/shared/constants.ts` | `CACHE_DIRS`, `FILE_EXTENSIONS`, `IMAGE_MIME_TYPES`, `HTTP_STATUS`, `PLACEHOLDER_IMAGE`, `MAP_CONSTANTS`, `SEASONS`, `cirRoads`, `cirRailRoads`, `poolIdTrains`, `poolTrainsInterval` | 11 |
| `src/client/renderer/road-texture-system.ts` | `ROAD_TOP_ID_MASK`, `HIGH_ROAD_ID_MASK`, `FREQ_ROAD`, `LAND_TYPE_SHIFT`, `DUMMY_ROAD_MASK`, 4 directional block arrays | 9 |
| `src/shared/land-utils.ts` | `isCardinalEdge()`, `isOuterCorner()`, `isInnerCorner()`, `getEdgeDirection()`, `LND_CLASS_MASK`, `LND_TYPE_MASK`, `LND_VAR_MASK` | 7 |
| `src/shared/building-details/template-groups.ts` | `OVERVIEW_GROUP`, `TOWN_GROUP`, `COVERAGE_GROUP`, `TRADE_GROUP`, `LOCAL_SERVICES_GROUP` | 5 |
| `src/client/utils/cn.ts` | `cn()` — defined, tested, never imported | 1 |
| `src/shared/proxy-utils.ts` | `fromProxyUrl()` | 1 |
| `src/client/components/politics/capitol-utils.ts` | `isFacilityOwnerRole()` | 1 |
| `src/client/renderer/painter-algorithm.ts` | `painterSort` | 1 |
| `src/server/server.ts` | `getInventionIndex()` | 1 |
| `src/server/paths.ts` | `setElectronUserDataPath()` | 1 |
| `src/server/session/road-handler.ts` | `ROAD_COST_PER_TILE` | 1 |

### Stale Test Fixtures

- `src/__fixtures__/csv-samples/valid-facility.csv` — unreferenced
- `src/__fixtures__/rdo-packets/sample-responses.txt` — unreferenced

---

## 2. Documentation

### Strengths

- **RDO protocol** (`src/shared/rdo-types.ts`) — 98% JSDoc with usage examples
- **Coordinate math** (`src/client/renderer/coordinate-mapper.ts`) — Full mathematical derivations
- **Constants** (`src/shared/constants.ts`) — All 40+ constants documented with units
- **doc/ folder** — 20 files, actively maintained, Delphi source citations
- **Zero TODO/FIXME debt** — Only 1 documented bug comment in tests

### Gaps

| Category | Scope | Issue |
|----------|-------|-------|
| Component props | ~95% of 60+ components | Props interfaces lack JSDoc |
| WebSocket handlers | All `src/server/ws-handlers/*.ts` | No `@param`/`@returns` JSDoc |
| Store methods | 11 stores | Action functions undocumented |
| MapSegment | `src/shared/types/domain-types.ts` | 6 fields named `unknown1`–`unknown6` |
| Magic numbers | `src/client/renderer/game-object-texture-cache.ts` | `maxSize: 2048` (unit?), `tolerance = 5` (why?) |
| Concrete/Road systems | renderer files | Decision trees documented in `/doc/` but not inline |
| E2E debug comment | `src/client/client.ts:49` | Says "E2E-DEBUG" but `__spoDebug` is permanent — misleading |
| Store relationships | — | No doc explaining how 11 stores interact |

---

## 3. Architecture Coherence

### Strengths

- **Layer separation**: No client-to-server or server-to-client imports
- **Store pattern**: All 11 Zustand stores follow identical `create<State>((set, get) => ...)` pattern
- **Bridge pattern**: `ClientBridge` used consistently, no bypasses
- **Canvas vs React**: Clean boundary (`renderer/` + `ui/` vs `components/`)
- **Service pattern**: All services implement `Service` interface, flat in `src/server/`

### God Files (need decomposition)

| File | Lines | Responsibilities |
|------|-------|-----------------|
| `src/client/components/building/PropertyGroup.tsx` | **1,839** | 8+ distinct panel types (sliders, inputs, supplies, research, revenue), 6 inline interfaces |
| `src/server/spo_session.ts` | **1,969** | All RDO session orchestration (partially delegated to `session/` handlers) |
| `src/server/server.ts` | **1,168** | HTTP server + WS server + API routes + session management |
| `src/client/components/empire/ProfilePanel.tsx` | **824** | Multiple tabs/sections |

---

## 4. Naming Conventions

### Overall: Excellent (95%+ consistent)

- File naming: PascalCase for components, kebab-case for utilities
- Types/interfaces: PascalCase, no I-prefix (modern TS convention)
- Event handlers: `handle*` in components, `on*` for props
- Constants: UPPER_SNAKE_CASE
- CSS modules: camelCase
- Store exports: `use<StoreName>`

### 3 Minor Exceptions

| File | Current | Should Be |
|------|---------|-----------|
| `src/client/store/game-store.ts` | `debugOverlay` | `isDebugOverlay` |
| `src/client/store/game-store.ts` | `hideVegetationOnMove` | `isVegetationHiddenOnMove` |
| `src/client/store/game-store.ts` | `soundEnabled` | `isSoundEnabled` |

---

## 5. Dependencies

### Package Inventory: 8 runtime + 14 dev (lean)

| Finding | Severity | Detail |
|---------|----------|--------|
| **`webp-wasm` orphaned** | HIGH | In `optionalDependencies`, source file deleted (commit 6fc8611f), 0 imports — dead weight |
| **undici 7.22.0 CVEs** | HIGH | Transitive via cheerio — 7 vulnerabilities including HTTP smuggling. Fix: `npm audit fix` |
| **cheerio underused** | MEDIUM | 1 file only (`src/server/search-menu-parser.ts`) — could use lighter alternative |
| Major updates available | LOW | `node-fetch 3.x`, `vite 8.x`, `7zip-min 3.x` — defer until planned maintenance |
| Dev deps in prod code | NONE | Clean separation |
| Missing from package.json | NONE | All imports accounted for |

**Bundle**: 197KB gzipped client — well-optimized for a real-time multiplayer game.

---

## 6. Security

### Risk Summary

| Severity | # | Key Findings |
|----------|---|-------------|
| **HIGH** | 3 | Cleartext WS credentials (no TLS), RDO Direct passthrough (arbitrary commands), passwords in ASP query strings |
| **MEDIUM** | 4 | CDN proxy path unsanitized, in-memory password cache, dependency CVEs, no pre-auth message gate |
| **LOW** | 3 | Origin derived from Host header, Electron error exposure, SSRF blocklist gaps (`0.0.0.0`, decimal IPs) |

### HIGH: Cleartext Credential Transmission Over WebSocket

- **Files**: `src/client/handlers/auth-handler.ts` (lines 38-42, 67-72, 94-98), `src/server/ws-handlers/auth-handlers.ts`
- **Issue**: Username + password sent as plaintext JSON over `ws://` (not `wss://`). No TLS enforcement in production.
- **Impact**: Network-level attacker can intercept credentials in transit.
- **Fix**: Enforce TLS (`wss://`) via reverse proxy (nginx/Caddy) with TLS termination.

### HIGH: RDO Direct Passthrough Endpoint Allows Arbitrary Commands

- **File**: `src/server/ws-handlers/misc-handlers.ts` (lines 146-161)
- **Issue**: `handleRdoDirect` accepts arbitrary RDO verb, targetId, action, member, args from any authenticated user — no validation or allowlisting.
- **Impact**: Authenticated attacker can craft commands to manipulate other players' buildings, modify economy, or crash the Delphi server.
- **Fix**: Add allowlist of permitted verbs/actions/members, or remove endpoint entirely.

### HIGH: Passwords Embedded in ASP HTTP Query Strings

- **File**: `src/server/spo_session.ts` (lines 681-692, `buildAspBaseParams()`)
- **Issue**: Plaintext password included in every ASP HTTP request as URL query parameter via unencrypted HTTP.
- **Impact**: Password exposure through server logs, proxy caches, referer headers.
- **Note**: Legacy protocol constraint — original Delphi client works the same way. Document as known limitation.

### MEDIUM: No WebSocket Authentication Before Message Handling

- **File**: `src/server/server.ts` (lines 838-941)
- **Issue**: After WS connection, no session-level auth gate. Any message type can be sent before login.
- **Fix**: Only allow `REQ_AUTH_CHECK`, `REQ_CONNECT_DIRECTORY`, `REQ_LOGIN_WORLD` before session reaches `WORLD_CONNECTED` phase.

### MEDIUM: CDN Proxy Path Has No Traversal Prevention

- **File**: `src/server/server.ts` (lines 614-639)
- **Issue**: `/cdn/` endpoint concatenates user-supplied path without sanitizing `..` sequences.
- **Fix**: Apply `sanitizePathParam()` or reject paths containing `..`.

### MEDIUM: Dependency Vulnerabilities (undici, minimatch)

- **Issue**: `npm audit` reports 7+ high-severity CVEs in undici (transitive via cheerio).
- **Fix**: `npm audit fix`

### MEDIUM: Password Stored in Memory as Plaintext

- **Files**: `src/server/spo_session.ts` (line 189-190), `src/client/client.ts` (line 148)
- **Issue**: Plaintext password cached for entire session (needed for legacy ASP requests). Zeroed on `destroy()`.
- **Note**: Legacy constraint — document it.

### LOW: Origin Check Allows Dynamic Construction from Host Header

- **File**: `src/server/server.ts` (lines 801-818)
- **Issue**: Allowed origins derived from request `Host` header — bypassable via DNS rebinding.
- **Fix**: Use explicit `ALLOWED_ORIGINS` environment variable.

### LOW: SSRF Blocklist Gaps

- **File**: `src/server/server.ts` (lines 267-285)
- **Issue**: Does not block `0.0.0.0`, decimal IP notation, IPv6-mapped IPv4.
- **Fix**: Add `0.0.0.0` to blocklist; resolve hostnames with `dns.lookup()` before fetching.

### LOW: Electron Error Message May Expose Stack Traces

- **File**: `electron/main.js` (line 138)
- **Issue**: `err.message` rendered unescaped into `data:` URL.
- **Fix**: HTML-escape `err.message`.

### Already Solid

CSP headers, path traversal prevention, SSRF blocklist (mostly), WS message size limits (64KB), per-IP connection limits (5), rate limiting, Electron `contextIsolation=true` + `nodeIntegration=false`, RDO buffer overflow protection (5MB), no innerHTML/eval with user data, `sel 0` guard, credential cleanup on `destroy()`.

---

## Prioritized Action Plan

### Urgent (security)

- [ ] Remove or allowlist `handleRdoDirect` endpoint
- [ ] Run `npm audit fix` (undici CVEs)
- [ ] Add pre-auth WS message gate

### High (cleanup)

- [ ] Remove `webp-wasm` from `optionalDependencies`
- [ ] Delete 8 orphan files from `public/`
- [ ] Remove 43 unused error codes from `error-codes.ts`
- [ ] Enforce TLS for production WebSocket

### Medium (quality)

- [ ] Break up `PropertyGroup.tsx` (1,839 lines) into sub-components
- [ ] Extract API routes from `server.ts`
- [ ] Add JSDoc to component props (60+ components)
- [ ] Document `MapSegment` unknown fields via Delphi reverse-engineering
- [ ] Create store interaction docs

### Low (polish)

- [ ] Fix 3 boolean naming inconsistencies in `game-store.ts`
- [ ] Remove remaining dead exports (land-utils, road-texture-system, etc.)
- [ ] Add inline docs to concrete/road texture decision trees
- [ ] Evaluate cheerio replacement
