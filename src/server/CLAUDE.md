# src/server/ — Gateway Server

## RDO Socket Rule (crash-critical)

- **Synchronous call** (expects response): `sendRdoRequest(socketName, packet, timeout?, category?)` -- adds a QueryId, uses `"^"` (VariantId) separator. Returns `Promise<RdoPacket>`.
- **Fire-and-forget** (void push): `socket.write(RdoCommand.build())` -- uses `"*"` (VoidId) separator. No QueryId.
- **NEVER** combine `sendRdoRequest()` with `"*"` separator -- the QueryId + VoidId combination crashes the Delphi server.

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

Every `sendRdoRequest()` call should specify a `TimeoutCategory` (FAST / NORMAL / SLOW / VERY_SLOW). Categories are defined in `shared/timeout-categories.ts`. Default is NORMAL (30s RDO / 40s WS).

## Protected Files

`rdo.ts` and `spo_session.ts` require extra care. Verify against Delphi source (`delphi-archaeologist` skill) before modifying RDO framing or protocol logic.

## Testing

Co-located `__tests__/` directories. Custom RDO matchers available: `toContainRdoCommand`, `toMatchRdoCallFormat`, `toMatchRdoSetFormat`, `toMatchRdoResponse`, `toHaveRdoTypePrefix`.
