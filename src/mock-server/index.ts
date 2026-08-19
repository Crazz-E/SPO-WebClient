/**
 * Mock Server — barrel export.
 * Public API for unit testing with captured RDO/HTTP/WS scenarios.
 */

// Core engine classes
export { RdoMock } from './rdo-mock';
export type { RdoMatchResult } from './rdo-mock';
export { HttpMock } from './http-mock';
export { CaptureStore } from './capture-store';
export { ReplayEngine } from './replay-engine';
export { MockWebSocketClient } from './mock-ws-client';

// Test helpers
export { createMockEnvironment, quickScenario } from './test-helpers';
export type { MockEnvironmentOptions, MockEnvironment } from './test-helpers';

// Types — mock core
export {
  MockSessionPhase,
  type MockSessionState,
  type WsCaptureExchange,
  type ScheduledEvent,
  type WsCaptureScenario,
  type MatchResult,
  type MessageLogEntry,
  type EventHandler,
} from './types/mock-types';

// Types — RDO exchanges
export type { RdoMatchKey, RdoExchange, RdoScenario } from './types/rdo-exchange-types';

// Types — HTTP exchanges
export type { HttpExchange, HttpScenario, HttpMatchResult } from './types/http-exchange-types';

// Variable system
export {
  DEFAULT_VARIABLES,
  mergeVariables,
  substituteVariables,
  type ScenarioVariables,
} from './scenarios/scenario-variables';

// Scenario registry
export {
  SCENARIO_NAMES,
  loadScenario,
  loadAll,
  type ScenarioName,
  type ScenarioBundle,
  type AllScenariosBundle,
} from './scenarios/scenario-registry';
