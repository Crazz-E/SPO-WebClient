# Production Security & Readiness Policy

**Status:** Adopted 2026-07-03 (v1.0) — first formal policy; previously guidance was advisory only (`deployment-security.md` checklist — since removed as superseded — and `DEPLOY.md` Step 9).
**Scope:** the SPO-WebClient gateway and its production deployment (nginx + Docker on the VPS). The legacy Delphi game servers are out of scope.
**Enforcement:** items marked *L4* were to be verified by the compliance suite planned in [E2E-STRATEGY.md §3/L4](E2E-STRATEGY.md) — **that suite was never built and the strategy is superseded** ([E2E-POLICY.md](E2E-POLICY.md)); as of 2026-08-22 no CI job runs it, and `ci.yml` runs lint, typecheck and `npm test` only (no `npm audit`, SEC-D-1 stands open). *L4* therefore means "covered by unit tests where they exist, otherwise manual" until a compliance stage is added to CI or the bench gate. Items marked *manual* are checked at deploy time per `deploy/DEPLOY.md`. Changing this policy still requires updating the corresponding tests in the same PR.

Normative language: **MUST** = required for production; **SHOULD** = required unless a documented exception exists.

---

## 1. Transport (SEC-T)

| ID | Requirement | Status | Enforcement |
|---|---|---|---|
| SEC-T-1 | The app port (8080) MUST NOT be publicly reachable; nginx is the only public listener. Compose binds `127.0.0.1:8080:8080`. | Met (`docker-compose.yml`) | manual (DEPLOY.md Step 9 port scan) |
| SEC-T-2 | Public traffic MUST be TLS 1.2+ (Mozilla-intermediate ciphers), terminated at nginx. | Met (`deploy/nginx/spo-webclient.conf`) | manual (SSL Labs A) |
| SEC-T-3 | HSTS MUST be enabled (`ENABLE_HSTS=true`) whenever serving over HTTPS, and MUST NOT be emitted otherwise. | Met, conditional | L4 (header present/absent per env) |

## 2. HTTP Layer (SEC-H)

| ID | Requirement | Status | Enforcement |
|---|---|---|---|
| SEC-H-1 | Every HTTP response MUST carry: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. | Met (`server.ts:528-535`) | L4 |
| SEC-H-2 | A CSP of at least `default-src 'self'; script-src 'self'` (+ declared CDN/ws origins) MUST be emitted, and each security header MUST appear **exactly once** end-to-end (the Node app owns headers; nginx adds none). | Met | L4 (duplication check through the proxy path) |
| SEC-H-3 | Request bodies MUST be capped: 1 MB at nginx, 512 KB on `/api/debug-log` (413 beyond). | Met | L4 (app cap); manual (nginx) |
| SEC-H-4 | Per-IP rate limits MUST be enforced at minimum: auth 10/min, `/proxy-image` 60/min, `/api/debug-log` 2/30s, plus nginx 30 r/s global. Limiter state MUST be bounded (eviction). | Met (`server.ts:541-574`) | L4 (429 probes) |
| SEC-H-5 | All filesystem-derived routes (`/api/map-data`, `/cache/*`, `/cdn/*`, terrain/classes) MUST reject path traversal (`..`, `/`, `\`, `%00`, encoded variants) and MUST verify the resolved path stays inside the base directory. | Met | L4 (probe set) + L0 predicate tests |
| SEC-H-6 | `/proxy-image` MUST reject non-http(s) schemes and private/link-local targets (127/8, 10/8, 172.16-31, 192.168/16, 169.254/16, IPv6 loopback/link-local/ULA). *Known limitation:* the check is string-based; DNS-resolution checking is queued hardening. | Met (string-based) | L4 (probe set) |
| SEC-H-7 | Client IP MUST be derived from `X-Forwarded-For` **only** when `TRUST_PROXY=true`. | Met (`server.ts:501-513`) | L4 |

## 3. WebSocket Layer (SEC-W)

| ID | Requirement | Status | Enforcement |
|---|---|---|---|
| SEC-W-1 | WS upgrades MUST validate `Origin` against the allow-list; missing or foreign origins → 403 (except `SINGLE_USER_MODE`, Electron). | Met (`server.ts:1037-1060`) | L4 |
| SEC-W-2 | WS frames MUST be capped at 64 KB (`maxPayload`). | Met | L4 |
| SEC-W-3 | Per-IP concurrent WS connections MUST be capped (currently 5 → 429). A **global** session cap SHOULD be added to bound aggregate gateway→Delphi load (risk B4). | Partial (per-IP only) | L4 (per-IP now; global when implemented) |
| SEC-W-4 | Messages MUST be gated by session phase (`PHASE_ALLOWED_MESSAGES`): gameplay messages before auth → `ERROR_AccessDenied`; unknown message types MUST be rejected. | Met (`server.ts:1283-1309`) | L4 |
| SEC-W-5 | Auth-bearing messages (`REQ_AUTH_CHECK`, `REQ_CONNECT_DIRECTORY`, `REQ_LOGIN_WORLD`) MUST be rate-limited per IP. | Met | L4 |

## 4. Gateway → Game-Server Conduct (SEC-G)

| ID | Requirement | Status | Enforcement |
|---|---|---|---|
| SEC-G-2 | RDO lanes MUST stay serialized per session (prevents concurrent access to Delphi temp objects). | Met (`server.ts:1228-1233`) | L1 harness |
| SEC-G-3 | Reconnection MUST remain bounded (3 fast + 20 slow) with jitter, close-triggered only; ServerBusy polling MUST never trigger reconnect; timeouts MUST never close sockets. (Protects the Delphi login lock — risk B1.) | Met (Tier 4) | L1 (`world-reconnect`, `server-busy-reconnect`, `timeout-state-machine`) |
| SEC-G-4 | Outbound HTTP calls to legacy ASP endpoints MUST have timeouts (risk C8). | **Missing — required work** | L0/L1 (with fix) |

## 5. Secrets & Logging (SEC-L)

| ID | Requirement | Status | Enforcement |
|---|---|---|---|
| SEC-L-1 | Passwords MUST never be written to any log; RDO wire logs MUST redact `RDOLogonUser`/`Logon`/`AccountStatus`/`RDOLogonClient` arguments. Passwords are held in memory only and cleared at session end. | Met (`spo_session.ts:114-120,2613`) | L4 (log-scan after real login attempt) |
| SEC-L-2 | Production MUST run `LOG_LEVEL=info` or stricter — never `debug` (session IDs leak at debug). This supersedes the older `warn` recommendation; `info` is the policy floor and the `.env.example` default. | Met by config | L4 + SEC-R-2 startup check |
| SEC-L-3 | Logs MUST be structured NDJSON in production (`LOG_JSON=true`), size-rotated (app 10 MB×5, Docker 10 m×5), with a separate error stream. | Met | manual (env review) |
| SEC-L-4 | `.env` MUST be `chmod 600`, never committed; `SPO_GM_USERS` MUST be explicitly set (empty = no GMs). | Met by procedure | manual |

## 6. Runtime & Container (SEC-R)

| ID | Requirement | Status | Enforcement |
|---|---|---|---|
| SEC-R-1 | Production MUST run `NODE_ENV=production`, as non-root (uid 1001), with memory/CPU limits (512 M/1.0) and a container healthcheck on `/api/startup-status`. | Met (Dockerfile, compose) | manual + deploy health gate |
| SEC-R-2 | The server MUST validate its production configuration at startup and **fail fast** on forbidden combinations (at minimum: `NODE_ENV=production` + `LOG_LEVEL=debug`). It MUST log the effective security configuration (headers on, HSTS, trust-proxy, rate limits) once at boot, and warn when `TRUST_PROXY`/`ENABLE_HSTS` are unset in production. | **Missing — required work** | L4 (boot-failure test lands with fix) |
| SEC-R-3 | Deploys MUST pass the health gate (`phase:ready` within 120 s) before old containers are pruned; a failed gate MUST leave the previous deployment reachable. | Met (`deploy/deploy.sh`) | manual/script |

## 7. Dependencies & Supply Chain (SEC-D)

| ID | Requirement | Status | Enforcement |
|---|---|---|---|
| SEC-D-1 | `npm audit --omit=dev --audit-level=high` MUST pass in CI on every PR; high/critical findings block merge (or carry a written, dated exception in this file). | **Missing — CI job required** | CI `audit` job |
| SEC-D-2 | Lockfile (`package-lock.json`) MUST be committed; CI MUST use `npm ci`. | Met | CI |
| SEC-D-3 | Electron auto-updates MUST come only from the official signed GitHub releases channel. | Met (electron-updater config) | release workflow + `validate-electron-package.js` |

## 8. Network Etiquette Toward Live Servers (SEC-N)

| ID | Requirement | Status | Enforcement |
|---|---|---|---|
| SEC-N-1 | Automated tests MUST NOT target the live Delphi servers except the L3 smoke procedure (single locked account, read-only, manual cadence). | Policy (new) | process + CI has no live target |
| SEC-N-2 | The L3 smoke MUST perform no destructive/in-game-mutating actions and MUST log off cleanly (`get Logoff` form). | Met by procedure | L3 playbook |
| SEC-N-3 | Load, soak, reconnect-storm, and fuzz testing MUST run only against the mock backend. | Policy (new) | process |

---

## 9. Compliance Gate & Exceptions

- The **L4 compliance suite is the machine-readable form of this policy.** A PR that makes L4 fail is a policy violation and MUST NOT merge.
- Items marked **Missing — required work** (SEC-G-4, SEC-R-2, SEC-D-1, global cap of SEC-W-3) are the initial remediation backlog; each fix ships with its L4/L1 test.
- Exceptions: documented here, with owner, rationale, and expiry date. Current exceptions: **none**.
- Review cadence: re-audit this policy whenever the deployment topology changes (new public endpoint, new proxy layer, Electron distribution change) and at least once per release cycle.
