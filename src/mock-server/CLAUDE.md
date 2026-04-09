# src/mock-server/ — Mock RDO Server for Testing

## Purpose

Mock RDO server that replays captured protocol exchanges. Used by unit and integration tests to verify RDO interactions without a real game server.

## Key Files

| File | Role |
|------|------|
| `rdo-mock.ts` | Core matcher -- matches incoming RDO commands to scenario exchanges |
| `rdo-strict-validator.ts` | Protocol compliance checker -- validates outgoing RDO commands |
| `mock-ws-client.ts` | Test WebSocket client for integration tests |
| `capture-store.ts` | Records RDO exchanges for later replay |
| `capture-importer.ts` | Imports raw capture files into scenario format |
| `replay-engine.ts` | Replays captured exchanges in sequence |
| `http-mock.ts` | Mock HTTP/ASP endpoint handler |
| `test-helpers.ts` | Shared test utilities |

## Scenarios

Scenario files in `scenarios/` define canned RDO exchanges. Each exports a `create*Scenario()` factory function that returns `{ ws: WsCaptureScenario; rdo: RdoScenario }`.

Available scenarios: `auth`, `world-list`, `select-company`, `company-list`, `building-details`, `build-menu`, `build-roads`, `mail`, `switch-focus`.

### Scenario Structure

Each `RdoScenario` has a `name`, `description`, and array of `RdoExchange` objects:

```ts
{
  id: 'auth-rdo-001',
  request: 'C 0 idof "DirectoryServer"',          // Raw RDO command
  response: 'A0 objid="${directoryServerId}"',     // Expected response
  matchKeys: { verb: 'idof', targetId: '...' },   // Flexible matching fields
  pushes: [],                                       // Optional server pushes
  pushOnly: false,                                  // true = server-initiated, no request
}
```

### Scenario Variables

`scenarios/scenario-variables.ts` provides `mergeVariables(overrides?)` for injecting test-specific values (username, serverId, etc.) into scenario templates.

### Adding a New Scenario

1. Create `scenarios/my-scenario.ts`
2. Export `createMyScenario(overrides?: Partial<ScenarioVariables>)`
3. Define exchanges with `matchKeys` for flexible matching
4. Register in `scenarios/scenario-registry.ts`

## RDO Matching Hierarchy

`RdoMock.match()` tries strategies in order (first match wins):
1. **Exact match**: verb + targetId + action + member + all args
2. **Key field match**: verb + action + member (wildcard targetId)
3. **Method match**: action + member only
4. **Nth occurrence**: same method, return next unconsumed exchange

## Strict Validator

`rdo-strict-validator.ts` validates every outgoing RDO command against protocol rules. Use it in tests to catch protocol violations (wrong type prefixes, missing separators, invalid verbs) before they reach a real server.

## Testing Pattern

```ts
const mock = new RdoMock();
mock.addScenario(createAuthScenario());
const result = mock.match('C 0 idof "DirectoryServer"');
expect(result).not.toBeNull();
expect(result!.response).toContain('objid=');
```

Tests are co-located: `*.test.ts` in the same directory and in `scenarios/`.
