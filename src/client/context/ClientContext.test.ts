/**
 * Tests for ClientContext — React context for client callbacks.
 */

import { ClientContext, useClient } from './ClientContext';

describe('ClientContext', () => {
  it('should be defined', () => {
    expect(ClientContext).toBeDefined();
  });

  it('should have a default value of null', () => {
    const defaultValue = (ClientContext as unknown as { _defaultValue: unknown })._defaultValue
      ?? (ClientContext as unknown as { _currentValue: unknown })._currentValue;
    expect(defaultValue).toBeNull();
  });
});

describe('useClient', () => {
  it('should be a function', () => {
    expect(typeof useClient).toBe('function');
  });
});
