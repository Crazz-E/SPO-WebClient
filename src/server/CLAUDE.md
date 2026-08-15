# src/server/ — Gateway Server

## RDO Socket Rule

- **Synchronous call** (expects response): `sendRdoRequest(socketName, packet, timeout?, category?)` -- adds a QueryId, uses `"^"` (VariantId) separator. Returns `Promise<RdoPacket>`.
- **Fire-and-forget** (void push): `writeRdoFrame(socket, RdoCommand.build())` -- uses `"*"` (VoidId) separator. No QueryId.
- **ALL RDO socket writes go through `writeRdoFrame()`** (`rdo-helpers.ts`) -- it encodes Latin-1 (ANSI) to match the Delphi wire. Never call `socket.write(string)` on an RDO socket: Node defaults to UTF-8 and corrupts accented characters.
- **NEVER emit `"^"` on a Delphi `procedure`.** A SINGLE such frame froze the shared production Interface Server (live-proven 2026-08-15): `"^"` makes the server push a hidden result pointer that a `register`-convention procedure never pops (`RDOQueryServer.pas:422-424` -> `RDOObjectServer.pas:292`). **Check the Pascal declaration before choosing a separator.** Void members use `"*"` WITH a QueryId -- the reference client's form, acked `A<id> ;`. Enforced by `assertNotVariantOnVoidMember`; declarations listed in `VOID_MEMBERS` (`session/rdo-request-guards.ts`).
- **NEVER** combine `sendRdoRequest()` with `"*"` separator -- project convention enforced by `assertNotVoidPush` (one form per intent), **except for `VOID_MEMBERS`**, where `"*"` + QueryId is the only safe form. The other crash risk is `"^"` WITHOUT a QueryId. Full matrix: `doc/rdo-protocol-architecture.md` §8.5.
- Session/timer work (login, logoff, reconnect, KeepAlive, ServerBusy): read `doc/rdo-session-lifecycle.md` first.

## Session Lifecycle

Phases defined in `SessionPhase` enum: `DISCONNECTED` -> `DIRECTORY_CONNECTED` -> `WORLD_CONNECTING` -> `WORLD_CONNECTED` -> `RECONNECTING`.

Login sequence lives in `session/login-handler.ts`. It uses a `LoginContext` interface (not the full session class).

## Handler Extraction Pattern

Handlers in `session/` receive a narrow context interface (`SessionContext` or `LoginContext`) instead of the full `StarpeaceSession` class. This prevents circular imports and keeps handlers independently testable.

When adding a new handler:
1. Create `session/my-handler.ts`
2. Accept `SessionContext` as the first parameter
3. Import it in `spo_session.ts` and wire the delegation

Existing handlers: `chat-handler`, `mail-handler`, `profile-finance-handler`, `auto-connection-handler`, `politics-handler`, `building-management-handler`, `road-handler`, `zone-surface-handler`, `building-templates-handler`, `building-details-handler`, `building-property-handler`, `research-handler`, `login-handler`.

## Push Dispatcher

Incoming RDO pushes from game servers route through `push-dispatcher.ts`. New push types must be registered there.

## ws-handlers/

Files in `ws-handlers/` route WebSocket messages from the browser client to session methods. Each file groups related WS message types (auth, building, chat, mail, map, politics, profile, road, search, misc). The `index.ts` barrel registers all handlers.

Handler type signature defined in `ws-handlers/types.ts`. Utility helpers in `ws-handlers/ws-utils.ts`.

## Timeout Categories

Every `sendRdoRequest()` call should specify a `TimeoutCategory` (FAST / NORMAL / SLOW / VERY_SLOW). Categories are defined in `shared/timeout-categories.ts`. FAST = 60s (legacy proxy DefTimeOut); NORMAL/SLOW/VERY_SLOW share the legacy in-play deadline `IS_PROXY_TIMEOUT_MS` = 180s (Delphi ISProxyTimeOut). Default is NORMAL.

## Protected Files

`rdo.ts` and `spo_session.ts` require extra care. Verify against Delphi source (`delphi-archaeologist` skill) before modifying RDO framing or protocol logic.

## Testing

Co-located `__tests__/` directories. Custom RDO matchers available: `toContainRdoCommand`, `toMatchRdoCallFormat`, `toMatchRdoSetFormat`, `toMatchRdoResponse`, `toHaveRdoTypePrefix`.
