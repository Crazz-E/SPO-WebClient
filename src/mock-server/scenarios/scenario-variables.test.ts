/**
 * Tests for the variable substitution system used by mock server scenarios.
 */
import { describe, it, expect } from '@jest/globals';
import { DEFAULT_VARIABLES, mergeVariables, substituteVariables } from './scenario-variables';

// =============================================================================
// DEFAULT_VARIABLES
// =============================================================================

describe('DEFAULT_VARIABLES', () => {
  it('has correct username "SPO_test3"', () => {
    expect(DEFAULT_VARIABLES.username).toBe('SPO_test3');
  });

  it('has correct worldName "Shamba"', () => {
    expect(DEFAULT_VARIABLES.worldName).toBe('Shamba');
  });

  it('has correct companyName "Yellow Inc."', () => {
    expect(DEFAULT_VARIABLES.companyName).toBe('Yellow Inc.');
  });

  it('has correct worldIp "158.69.153.134"', () => {
    expect(DEFAULT_VARIABLES.worldIp).toBe('158.69.153.134');
  });

  it('has computed mailAccount "SPO_test3@Shamba.net"', () => {
    expect(DEFAULT_VARIABLES.mailAccount).toBe('SPO_test3@Shamba.net');
  });
});

// =============================================================================
// mergeVariables
// =============================================================================

describe('mergeVariables', () => {
  it('returns defaults when no overrides', () => {
    const result = mergeVariables();
    expect(result).toEqual(DEFAULT_VARIABLES);
  });

  it('overrides specific fields', () => {
    const result = mergeVariables({ username: 'NewPlayer', worldName: 'Olympus' });
    expect(result.username).toBe('NewPlayer');
    expect(result.worldName).toBe('Olympus');
    // Other fields remain default
    expect(result.companyName).toBe(DEFAULT_VARIABLES.companyName);
    expect(result.worldPort).toBe(DEFAULT_VARIABLES.worldPort);
  });

  it('auto-computes mailAccount when username changes', () => {
    const result = mergeVariables({ username: 'Alice' });
    expect(result.mailAccount).toBe('Alice@Shamba.net');
  });

  it('auto-computes worldUrl when worldIp changes', () => {
    const result = mergeVariables({ worldIp: '10.0.0.1' });
    expect(result.worldUrl).toBe('http://10.0.0.1/Five/');
  });

  it('does not auto-compute when mailAccount explicitly overridden', () => {
    const result = mergeVariables({
      username: 'Bob',
      mailAccount: 'custom@example.com',
    });
    expect(result.mailAccount).toBe('custom@example.com');
    expect(result.username).toBe('Bob');
  });
});

// =============================================================================
// substituteVariables
// =============================================================================

describe('substituteVariables', () => {
  it('replaces {{username}} placeholder', () => {
    const vars = mergeVariables();
    const result = substituteVariables('Hello {{username}}!', vars);
    expect(result).toBe('Hello SPO_test3!');
  });

  it('replaces multiple placeholders', () => {
    const vars = mergeVariables();
    const result = substituteVariables(
      '{{username}} plays in {{worldName}} with {{companyName}}',
      vars
    );
    expect(result).toBe('SPO_test3 plays in Shamba with Yellow Inc.');
  });

  it('leaves unrecognized placeholders unchanged', () => {
    const vars = mergeVariables();
    const result = substituteVariables('{{unknown}} stays', vars);
    expect(result).toBe('{{unknown}} stays');
  });

  it('handles numeric variables (port)', () => {
    const vars = mergeVariables();
    const result = substituteVariables('port={{worldPort}}', vars);
    expect(result).toBe('port=8000');
  });
});
