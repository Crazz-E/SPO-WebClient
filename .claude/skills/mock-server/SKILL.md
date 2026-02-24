---
name: mock-server
description: "Mock server for unit testing: scenario anatomy, RDO capture format, adding scenarios, variable system."
user-invokable: false
disable-model-invocation: false
---

# Mock Server

Auto-loaded when working on `src/mock-server/`, scenario files, capture files, or mock test infrastructure.

## Architecture

```
src/mock-server/
├── index.ts                  # Public API barrel
├── types/                    # WsCaptureExchange, RdoExchange, HttpExchange
├── rdo-mock.ts               # RDO command matcher
├── http-mock.ts              # HTTP URL pattern matcher
├── capture-store.ts          # Scenario storage/lookup
├── replay-engine.ts          # WS request matching + wsRequestId rewriting
├── mock-ws-client.ts         # High-level test facade
├── capture-importer.ts       # .capture.txt parser
├── test-helpers.ts           # createMockEnvironment(), quickScenario()
└── scenarios/                # 14 scenario factories
    ├── scenario-variables.ts # Variable system + defaults
    └── scenario-registry.ts  # Central registry
```

## Scenario Anatomy

Every scenario factory returns a `ScenarioBundle`:
```typescript
interface ScenarioBundle {
  ws?: WsCaptureScenario;   // WebSocket JSON (Browser <-> Gateway)
  rdo?: RdoScenario;        // RDO text (Gateway <-> Game Server)
  http?: HttpScenario;      // HTTP GET (ASP pages)
}
```

Not all layers required: auth = RDO+WS, company-list = HTTP+WS, server-busy = RDO only.

## 14 Scenarios

| # | Scenario | Layers | File |
|---|----------|--------|------|
| 1 | Authentication | RDO+WS | auth-scenario.ts |
| 2 | World listing | RDO+WS | world-list-scenario.ts |
| 3 | Company listing | HTTP+WS | company-list-scenario.ts |
| 4 | Company selection | RDO+WS | select-company-scenario.ts |
| 5 | Map tile data | HTTP+WS | map-data-scenario.ts |
| 6 | ServerBusy check | RDO | server-busy-scenario.ts |
| 7 | Building inspection | RDO+WS | switch-focus-scenario.ts |
| 8 | Server push | RDO | refresh-object-scenario.ts |
| 9 | Viewport update | RDO+WS | set-viewed-area-scenario.ts |
| 10 | Event polling | RDO+WS | pick-event-scenario.ts |
| 11 | Zone overlays | HTTP+WS | overlays-scenario.ts |
| 12 | Building construction | RDO+WS | build-menu-scenario.ts |
| 13 | Road building | RDO+WS | build-roads-scenario.ts |
| 14 | Mail system | RDO+WS | mail-scenario.ts |

## Adding a New Scenario (5 steps)

1. **Capture** the real exchange (connect to live server or use existing captures in `doc/Mock_Server_scenarios_captures.md`)
2. **Create** `scenarios/<name>-scenario.ts` following existing pattern
3. **Register** in `scenario-registry.ts`
4. **Parameterize** with `scenario-variables.ts` (IDs, names, counts)
5. **Test** with `createMockEnvironment()` + `quickScenario()`

## Capture Format

```
C 505 sel 29862524 call CreateCircuitSeg "^" "#1","#248041616";
A505 res="#0";
```

- `C <queryId> <body>;` = Client call
- `A<queryId> <body>;` = Server answer

## Test Environment Gotcha

Test environment is `node` (no jsdom) — mock DOM elements as plain objects:
```typescript
const mockCanvas = { width: 800, height: 600, getContext: () => mockCtx };
```

## Test Helpers

```typescript
import { createMockEnvironment, quickScenario } from '@/mock-server/test-helpers';

const env = createMockEnvironment();
const scenario = quickScenario('auth', { username: 'test' });
```

## Deep-Dive References

- [Mock Server Guide](../../../doc/mock-server-guide.md) — Full architecture, scenario construction, debugging
- [Scenario Captures](../../../doc/Mock_Server_scenarios_captures.md) — Real RDO packet captures for all 14 scenarios