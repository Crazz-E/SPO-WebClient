# Logging System

Structured logging with player tracking, NDJSON output, and file rotation.

## Architecture

```
                  Logger (src/shared/logger.ts)
                  ├── Console output (human-readable or NDJSON)
                  └── FileTransport (src/shared/log-transport.ts)
                      └── logs/gateway.ndjson (size-based rotation)
```

Each server module creates its own logger via `createLogger(context)`. Sessions create child loggers that inherit player identity fields, so every log line is automatically tagged with who triggered it.

## Quick Start

### Enable file logging

Set these environment variables (in `.env` or `docker-compose.yml`):

```bash
LOG_FILE=logs/gateway.ndjson   # Enable file output
LOG_JSON=true                  # NDJSON format on console too
LOG_LEVEL=info                 # debug | info | warn | error
```

### Docker deployment

The `docker-compose.yml` bind-mounts `./logs` to the host:

```yaml
volumes:
  - ./logs:/app/logs
```

The container runs as user `spo` (UID 1001). Create the host directory with correct ownership:

```bash
sudo mkdir -p /opt/spo-webclient/logs
sudo chown 1001:1001 /opt/spo-webclient/logs
```

### Query logs

```bash
# All logs for a player
cat logs/gateway.ndjson | jq 'select(.player == "SPO_test3")'

# Errors only
cat logs/gateway.ndjson | jq 'select(.level == "ERROR")'

# Player errors
cat logs/gateway.ndjson | jq 'select(.player == "SPO_test3" and .level == "ERROR")'

# Track a request chain by correlation ID
cat logs/gateway.ndjson | jq 'select(.corrId == "ws-42")'

# Timeline for a player (compact)
cat logs/gateway.ndjson | jq -c 'select(.player == "SPO_test3") | {ts, level, ctx, msg}'
```

Or use the helper script:

```bash
./scripts/player-log.sh SPO_test3
./scripts/player-log.sh SPO_test3 logs/gateway.ndjson --level ERROR
```

Requires [jq](https://jqlang.github.io/jq/).

## Configuration Reference

| Env Variable    | Default               | Description                                      |
|-----------------|-----------------------|--------------------------------------------------|
| `LOG_LEVEL`     | `debug`               | Minimum level: `debug`, `info`, `warn`, `error`  |
| `LOG_JSON`      | `false`               | NDJSON output on console (file is always NDJSON)  |
| `LOG_FILE`      | *(empty = disabled)*  | File path for NDJSON output                      |
| `LOG_MAX_SIZE`  | `10485760` (10 MB)    | Max file size before rotation                    |
| `LOG_MAX_FILES` | `5`                   | Number of rotated files to keep                  |

**Rotation:** When `gateway.ndjson` exceeds `LOG_MAX_SIZE`, it is renamed to `.1`, previous `.1` becomes `.2`, etc. Files beyond `LOG_MAX_FILES` are deleted. Total disk usage is bounded to `LOG_MAX_SIZE * (LOG_MAX_FILES + 1)`.

**Production warning:** `LOG_LEVEL=debug` may log session IDs. Use `info` in production.

## NDJSON Line Format

Each log line is a single JSON object:

```json
{
  "ts": "2026-04-02T20:37:50.123Z",
  "level": "INFO",
  "ctx": "Session",
  "msg": "Player logged in",
  "player": "SPO_test3",
  "tycoonId": "T42",
  "corrId": "ws-123",
  "meta": { "world": "Shamba" }
}
```

| Field      | Always present | Description                                          |
|------------|----------------|------------------------------------------------------|
| `ts`       | yes            | ISO 8601 timestamp                                   |
| `level`    | yes            | `DEBUG`, `INFO`, `WARN`, `ERROR`                     |
| `ctx`      | yes            | Logger context (e.g. `Gateway`, `Session`, `ClientWire`) |
| `msg`      | yes            | Human-readable message                               |
| `player`   | after login    | Player username (inherited via child logger)          |
| `tycoonId` | after login    | Tycoon ID (inherited via child logger)                |
| `corrId`   | per-request    | Correlation ID for request/response pairing           |
| `meta`     | optional       | Extra data (errors include `error` + `stack`)         |

## Usage in Code

### Create a logger

```typescript
import { createLogger } from '../shared/logger';

const logger = createLogger('MyService');

logger.info('Service started');
logger.debug('Processing item', { itemId: 42 });
logger.error('Failed to connect', error);  // Error stack included in meta
```

### Child loggers (inherit fields)

Child loggers carry all parent fields plus new ones. Use them to tag all logs from a session with the player identity:

```typescript
// Base logger
const log = createLogger('Session');

// After player logs in — all subsequent logs include player field
const playerLog = log.child({ player: 'SPO_test3' });
playerLog.info('Logged in');
// → {"ctx":"Session", "msg":"Logged in", "player":"SPO_test3", ...}

// After tycoon loaded — adds tycoonId too
const tycoonLog = playerLog.child({ tycoonId: 'T42' });
tycoonLog.info('Company selected');
// → {"ctx":"Session", "msg":"Company selected", "player":"SPO_test3", "tycoonId":"T42", ...}
```

This is how `StarpeaceSession` works — see `setCachedUsername()` and `setTycoonId()` in `src/server/spo_session.ts`.

### Mutable fields (per-request context)

For fields that change on every request (like correlation IDs), use `setField()`:

```typescript
logger.setField('corrId', requestId);
logger.info('Handling request');        // includes corrId
logger.setField('corrId', null);        // clear after request
```

## Client-Side Debug Reports

Players can submit their WebSocket wire history to the server for analysis.

### How it works

1. The client tracks all WebSocket messages in `window.__spoDebug.history`
2. The **Settings dialog** has a **"Send Debug Report"** button
3. It POSTs to `POST /api/debug-log` with the player name and wire history
4. The server writes each entry to the NDJSON log file with context `ClientWire`

### Endpoint: `POST /api/debug-log`

**Request:**
```json
{
  "player": "SPO_test3",
  "history": [
    { "dir": "SEND", "type": "TycoonGetMain", "ts": 1743676670123, "reqId": "ws-42" },
    { "dir": "RECV", "type": "TycoonMain", "ts": 1743676670456 }
  ]
}
```

**Response:**
```json
{ "ok": true, "entries": 2 }
```

**Constraints:**
- Requires `LOG_FILE` to be set (returns 503 otherwise)
- Rate limited: 1 report per IP per 30 seconds (429)
- Max payload: 512 KB (413)
- Max entries per report: 200 (capped silently)

### Querying client wire logs

```bash
cat logs/gateway.ndjson | jq 'select(.ctx == "ClientWire" and .player == "SPO_test3")'
```

## File Locations

| File | Purpose |
|------|---------|
| `src/shared/logger.ts` | Logger class, NDJSON formatting, console output |
| `src/shared/log-transport.ts` | FileTransport with size-based rotation |
| `src/shared/config.ts` | `config.logging.*` — env var parsing |
| `src/server/spo_session.ts` | Session child loggers with player/tycoon fields |
| `src/server/server.ts` | `POST /api/debug-log` endpoint |
| `scripts/player-log.sh` | CLI helper to filter logs by player |
| `logs/gateway.ndjson` | Default log file path (git-ignored) |
