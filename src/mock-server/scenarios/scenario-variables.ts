/**
 * Variable substitution system for mock server scenarios.
 * Allows tests to override scenario parameters (username, world, company, etc.)
 */

/** All configurable variables for scenario data */
export interface ScenarioVariables {
  // Authentication
  username: string;
  password: string;

  // Directory server
  directoryServerId: string;
  directorySessionId: string;

  // World / Region
  worldName: string;
  zonePath: string;
  worldIp: string;
  worldPort: number;
  worldUrl: string;

  // Company
  companyName: string;
  companyId: string;
  companyOwnerRole: string;
  companyCluster: string;

  // Client session
  clientViewId: string;
  securityId: string;
  daAddr: string;
  daPort: number;

  // Mail
  mailAccount: string;

  // Proxy / misc
  mailServerId: string;
  tycoonProxyId: string;
}

/**
 * Default values derived from the capture document.
 * NOTE: These match the SPO_test3 account used during packet captures.
 * E2E tests use SPO_test3/test3 (see doc/E2E-TESTING.md) — different from these.
 * Tests can override via mergeVariables({ username: 'SPO_test3', password: 'test3' }).
 */
export const DEFAULT_VARIABLES: ScenarioVariables = {
  username: 'SPO_test3',
  password: 'test3',
  directoryServerId: '39751288',
  directorySessionId: '142217260',
  worldName: 'Shamba',
  zonePath: 'Root/Areas/Asia/Worlds',
  worldIp: '158.69.153.134',
  worldPort: 8000,
  worldUrl: 'http://158.69.153.134/Five/',
  companyName: 'Yellow Inc.',
  companyId: '28',
  companyOwnerRole: 'SPO_test3',
  companyCluster: 'PGI',
  clientViewId: '8161308',
  securityId: '131655160',
  daAddr: '158.69.153.134',
  daPort: 7001,
  mailAccount: 'SPO_test3@Shamba.net',
  mailServerId: '30437308',
  tycoonProxyId: '40133496',
};

/**
 * Merge partial overrides with default variables.
 */
export function mergeVariables(overrides?: Partial<ScenarioVariables>): ScenarioVariables {
  if (!overrides) return { ...DEFAULT_VARIABLES };

  const merged = { ...DEFAULT_VARIABLES, ...overrides };
  // Auto-compute dependent variables if not explicitly overridden
  if (!overrides.mailAccount && (overrides.username || overrides.worldName)) {
    merged.mailAccount = `${merged.username}@${merged.worldName}.net`;
  }
  if (!overrides.worldUrl && (overrides.worldIp)) {
    merged.worldUrl = `http://${merged.worldIp}/Five/`;
  }
  return merged;
}

/**
 * Replace {{variableName}} placeholders in a template string.
 * Returns the string with all recognized variables substituted.
 */
export function substituteVariables(
  template: string,
  vars: ScenarioVariables
): string {
  let result = template;
  const entries = Object.entries(vars) as [string, string | number][];
  for (const [key, value] of entries) {
    result = result.split(`{{${key}}}`).join(String(value));
  }
  return result;
}
