import { connectionPendingKey } from './connection-pending-key';

describe('connectionPendingKey', () => {
  it('names the gate, so one indicator serves every connection change on it', () => {
    expect(connectionPendingKey('RDOConnectInput', 'Cotton')).toBe('RDOConnectInput:Cotton');
    expect(connectionPendingKey('RDODisconnectOutput', 'Cotton')).toBe('RDODisconnectOutput:Cotton');
  });

  it('separates the two directions and the two verbs', () => {
    const keys = new Set([
      connectionPendingKey('RDOConnectInput', 'Cotton'),
      connectionPendingKey('RDOConnectOutput', 'Cotton'),
      connectionPendingKey('RDODisconnectInput', 'Cotton'),
      connectionPendingKey('RDODisconnectOutput', 'Cotton'),
    ]);
    expect(keys.size).toBe(4);
  });
});
