# Mock Server — Developer Guide

How to add new scenarios, understand the architecture, and use the mock server for unit testing.

## Overview

The mock server (`src/mock-server/`) simulates the three protocol layers between the browser client and game servers:

```
Browser ──WS/JSON──> Gateway ──RDO/TCP──> Game Server
                            ──HTTP/GET──> ASP pages
```

It is used exclusively for **unit testing** — verifying that client code properly formats requests, parses responses, and handles edge cases. It is NOT a live test server.

Each scenario contains captured real-world exchanges from the 9 implemented game interactions.

## Architecture

```
src/mock-server/
├── index.ts                          # Barrel export (public API)
├── types/
│   ├── mock-types.ts                 # WsCaptureExchange, WsCaptureScenario, MockSessionPhase
│   ├── rdo-exchange-types.ts         # RdoExchange, RdoMatchKey, RdoScenario
│   └── http-exchange-types.ts        # HttpExchange, HttpScenario
├── rdo-mock.ts                       # RDO command matcher
├── http-mock.ts                      # HTTP URL pattern matcher
├── capture-store.ts                  # Scenario storage/lookup
├── replay-engine.ts                  # WS request matching + wsRequestId rewriting
├── mock-ws-client.ts                 # High-level test facade
├── test-helpers.ts                   # createMockEnvironment(), quickScenario()
└── scenarios/
    ├── scenario-variables.ts         # Variable system + defaults
    ├── scenario-registry.ts          # Central registry (loadScenario, loadAll)
    ├── auth-scenario.ts              # Authentication (login + session)
    ├── world-list-scenario.ts        # World listing (directory query)
    ├── company-list-scenario.ts      # Company listing
    ├── select-company-scenario.ts    # Company selection + init
    ├── switch-focus-scenario.ts      # Building inspection (focus switch)
    ├── build-menu-scenario.ts        # Building construction menu
    ├── build-roads-scenario.ts       # Road building
    ├── mail-scenario.ts              # Mail system
    └── building-details-scenario.ts  # Building details (property tabs)
```

## Anatomy of a Scenario

Every scenario factory returns a `ScenarioBundle` with up to three protocol layers:

```typescript
interface ScenarioBundle {
  ws?: WsCaptureScenario;   // WebSocket JSON exchanges (Browser <-> Gateway)
  rdo?: RdoScenario;        // RDO text protocol exchanges (Gateway <-> Game Server)
  http?: HttpScenario;      // HTTP GET responses (ASP pages served by game server)
}
```

Not all scenarios need all three layers. For example:
- **auth** has RDO + WS (no HTTP)
- **company-list** has HTTP + WS (no RDO)
- **building-details** has RDO + WS (no HTTP)

## Step-by-step: Adding a New RDO Scenario

### 1. Capture the exchange

Connect to a real server and capture the RDO exchange. Example from packet capture:

```
C 505 sel 29862524 call CreateCircuitSeg "^" "#1","#248041616","#462","#403","#464","#403","#4000000";
A505 res="#0";
```

### 2. Create the scenario file

Create `src/mock-server/scenarios/my-feature-scenario.ts`:

```typescript
import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { HttpScenario } from '../types/http-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured data constants */
export interface CapturedMyFeatureData {
  objectId: string;
  result: number;
}

export const CAPTURED_MY_FEATURE: CapturedMyFeatureData = {
  objectId: '29862524',
  result: 0,
};

export function createMyFeatureScenario(
  overrides?: Partial<ScenarioVariables>
): { ws: WsCaptureScenario; rdo: RdoScenario; http: HttpScenario } {
  const vars = mergeVariables(overrides);

  const rdo: RdoScenario = {
    name: 'my-feature',
    description: 'My feature: description of what this tests',
    exchanges: [
      {
        id: 'mf-rdo-001',
        request: `C 505 sel ${CAPTURED_MY_FEATURE.objectId} call MyMethod "^" "#42"`,
        response: `A505 res="#${CAPTURED_MY_FEATURE.result}"`,
        matchKeys: { verb: 'sel', action: 'call', member: 'MyMethod' },
      },
    ],
    variables: vars as unknown as Record<string, string>,
  };

  // ... ws and http definitions ...

  return { ws, rdo, http };
}
```

### 3. Define match keys

The `matchKeys` field controls how flexible the matching is:

| Field | Purpose | Example |
|-------|---------|---------|
| `verb` | RDO verb | `'sel'`, `'idof'`, `'get'` |
| `targetId` | Target object | `'MailServer'`, `'DirectoryServer'` |
| `action` | Sub-action | `'call'`, `'get'` |
| `member` | Method/property | `'NewMail'`, `'ServerBusy'` |
| `argsPattern` | Regex for args | `'^#1,#248'` |

Match hierarchy (most specific wins):
1. **Exact** — verb + targetId + action + member + argsPattern
2. **Key field** — verb + action + member
3. **Method only** — just `member`
4. **Nth occurrence** — falls through in order

### 4. Use variables for configurable values

Replace hardcoded session-specific values with `ScenarioVariables` references:

```typescript
// Bad: hardcoded
request: `C 2172 idof "MailServer"`,
response: `A2172 objid="30437308"`,

// Good: variable-driven
request: `C 2172 idof "MailServer"`,
response: `A2172 objid="${vars.mailServerId}"`,
```

If your scenario needs a new variable, add it to `ScenarioVariables` in `scenario-variables.ts` with a default value.

### 5. Register the scenario

In `scenario-registry.ts`:

1. Add to the `ScenarioName` type union:
   ```typescript
   export type ScenarioName =
     | 'auth'
     // ...existing...
     | 'my-feature';
   ```

2. Add to `SCENARIO_NAMES` array:
   ```typescript
   export const SCENARIO_NAMES: ScenarioName[] = [
     // ...existing...
     'my-feature',
   ];
   ```

3. Add import and factory entry:
   ```typescript
   import { createMyFeatureScenario } from './my-feature-scenario';

   const SCENARIO_FACTORIES: Record<ScenarioName, ...> = {
     // ...existing...
     'my-feature': (o) => createMyFeatureScenario(o),
   };
   ```

### 6. Write tests

Create `src/mock-server/scenarios/my-feature-scenario.test.ts` or add to `scenarios.test.ts`:

```typescript
import { createMyFeatureScenario, CAPTURED_MY_FEATURE } from './my-feature-scenario';

describe('my-feature scenario', () => {
  it('creates RDO exchanges with correct match keys', () => {
    const { rdo } = createMyFeatureScenario();
    expect(rdo.exchanges).toHaveLength(1);
    expect(rdo.exchanges[0].matchKeys?.member).toBe('MyMethod');
  });

  it('substitutes variables in responses', () => {
    const { rdo } = createMyFeatureScenario({ username: 'TestUser' });
    // verify variable substitution worked
  });
});
```

## Step-by-step: Adding a New HTTP Scenario

### 1. Capture the HTTP response

Capture the GET request and HTML response from the game server:

```
GET /five/0/visual/voyager/Build/RoadOptions.asp
→ 200 OK, text/html
```

### 2. Define the exchange

```typescript
const http: HttpScenario = {
  name: 'my-feature',
  exchanges: [
    {
      id: 'mf-http-001',
      method: 'GET',
      urlPattern: '/five/0/visual/voyager/Build/RoadOptions.asp',
      queryPatterns: {         // Optional: match specific query params
        Folder: 'Inbox',
      },
      status: 200,
      contentType: 'text/html',
      body: buildMyHtml(vars),  // Build from template function
    },
  ],
  variables: {},
};
```

### 3. HTML template function

Use a helper function that interpolates `ScenarioVariables`:

```typescript
function buildMyHtml(vars: ScenarioVariables): string {
  return `<html>
<head><title>My Page</title></head>
<body>
<div>World: ${vars.worldName}</div>
<div>Player: ${vars.username}</div>
</body>
</html>`;
}
```

For binary assets (images), use the `bodyFile` reference instead of inline content:

```typescript
{
  // ...
  body: '',
  bodyFile: 'assets/my-image.png',  // Relative to mock-server directory
}
```

## Step-by-step: Adding a New WS Scenario

### 1. Define exchanges

```typescript
const ws: WsCaptureScenario = {
  name: 'my-feature',
  description: 'What this scenario tests',
  capturedAt: '2026-02-18',
  serverInfo: { world: vars.worldName, zone: 'BETA', date: '2026-02-18' },
  exchanges: [
    {
      id: 'mf-ws-001',
      timestamp: '2026-02-18T21:30:00.000Z',
      request: {
        type: WsMessageType.REQ_MY_ACTION,
        wsRequestId: 'mf-001',
        // ... request-specific fields
      } as WsMessage,
      responses: [
        {
          type: WsMessageType.RESP_MY_ACTION,
          wsRequestId: 'mf-001',
          success: true,
          // ... response-specific fields
        } as WsMessage,
      ],
      tags: ['my-feature'],  // For filtering in tests
    },
  ],
};
```

### 2. Server push events (optional)

For server-initiated messages (no client request), add `scheduledEvents`:

```typescript
const ws: WsCaptureScenario = {
  // ...exchanges...
  scheduledEvents: [
    {
      afterMs: 2000,  // Fire 2 seconds after scenario starts
      event: {
        type: WsMessageType.EVENT_TYCOON_UPDATE,
        // ... event fields
      } as WsMessage,
    },
  ],
};
```

### 3. Using in tests with quickScenario

For simple inline scenarios in tests (without creating a full scenario file):

```typescript
import { quickScenario, createMockEnvironment } from '@/mock-server';

const scenario = quickScenario([
  {
    request: { type: WsMessageType.REQ_MY_ACTION, wsRequestId: 'test-1' },
    responses: [{ type: WsMessageType.RESP_MY_ACTION, wsRequestId: 'test-1', success: true }],
  },
]);

const env = createMockEnvironment({ wsScenario: scenario });
const response = await env.ws.send(myRequest);
expect(response.success).toBe(true);
```

## Variable System

All configurable values are defined in `ScenarioVariables` (`scenario-variables.ts`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `username` | `'SPO_test3'` | Player login name |
| `password` | `'test3'` | Player password |
| `directoryServerId` | `'39751288'` | Directory server RDO object ID |
| `directorySessionId` | `'142217260'` | Session ID from RDOOpenSession |
| `worldName` | `'Shamba'` | Game world name |
| `zonePath` | `'Root/Areas/Asia/Worlds'` | Directory path to world |
| `worldIp` | `'158.69.153.134'` | Game server IP |
| `worldPort` | `8000` | Game server port |
| `worldUrl` | `'http://158.69.153.134/Five/'` | Base URL for game assets |
| `companyName` | `'Yellow Inc.'` | Player's company |
| `companyId` | `'28'` | Company ID |
| `companyOwnerRole` | `'SPO_test3'` | Company owner tycoon name |
| `companyCluster` | `'PGI'` | Company cluster |
| `clientViewId` | `'8161308'` | Client view RDO object ID |
| `securityId` | `'131655160'` | Security token ID |
| `daAddr` | `'158.69.153.134'` | DA server address |
| `daPort` | `7001` | DA server port |
| `mailAccount` | `'SPO_test3@Shamba.net'` | Mail account (auto-computed) |
| `mailServerId` | `'30437308'` | Mail server RDO object ID |
| `tycoonProxyId` | `'40133496'` | Tycoon proxy RDO object ID |

**Auto-computed variables:** `mailAccount` is derived from `username@worldName.net`, and `worldUrl` from `worldIp`. These recompute automatically when their dependencies are overridden.

Override in tests:

```typescript
const { rdo } = createAuthScenario({ username: 'TestUser', worldName: 'TestWorld' });
// mailAccount will be auto-computed as 'TestUser@TestWorld.net'
```

## Template: New Scenario Boilerplate

Copy this template to create a new scenario file:

```typescript
/**
 * Scenario N: <Name>
 * RDO: <list of RDO methods involved>
 * HTTP: <list of ASP pages, if any>
 * WS: <WS message types, if any>
 *
 * Captured RDO:
 *   <paste raw captured RDO lines here>
 */

import { WsMessageType } from '@/shared/types/message-types';
import type { WsMessage } from '@/shared/types/message-types';
import type { WsCaptureScenario } from '../types/mock-types';
import type { RdoScenario } from '../types/rdo-exchange-types';
import type { HttpScenario } from '../types/http-exchange-types';
import type { ScenarioVariables } from './scenario-variables';
import { mergeVariables } from './scenario-variables';

/** Captured data from real server interaction */
export interface CapturedData {
  // Define fields matching the captured exchange
}

export const CAPTURED: CapturedData = {
  // Fill in from captured data
};

export function createMyScenario(
  overrides?: Partial<ScenarioVariables>
): { ws?: WsCaptureScenario; rdo?: RdoScenario; http?: HttpScenario } {
  const vars = mergeVariables(overrides);

  // Define rdo, http, ws as needed (omit layers not used)

  return { /* ws, rdo, http */ };
}
```

## Testing Checklist

When adding a new scenario, verify:

- [ ] Scenario factory returns correct structure (`ws?`, `rdo?`, `http?`)
- [ ] RDO request strings match captured format exactly
- [ ] RDO response strings include correct type prefixes (`#`, `%`, `!`, etc.)
- [ ] `matchKeys` are specific enough to avoid false matches with other scenarios
- [ ] Variable substitution works (test with `overrides` parameter)
- [ ] Auto-computed variables (`mailAccount`, `worldUrl`) update correctly
- [ ] HTTP `urlPattern` matches the real server path
- [ ] HTTP `queryPatterns` include essential query parameters
- [ ] HTML templates contain valid markup
- [ ] WS `wsRequestId` values are unique within the scenario
- [ ] WS message `type` values exist in `WsMessageType` enum
- [ ] Scenario is registered in `scenario-registry.ts`
- [ ] `loadAll()` includes the new scenario's exchanges
- [ ] Tests pass: `npm test -- src/mock-server`
