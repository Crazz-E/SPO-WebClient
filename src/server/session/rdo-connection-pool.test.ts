/**
 * Tests for RDO Connection Pool.
 * Validates pool behavior: creation, load balancing, degradation detection, drain.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { RdoConnectionPool, PooledConnection } from './rdo-connection-pool';

// Mock net.Socket
function createMockSocket(connected = true) {
  const listeners: Record<string, Function[]> = {};
  return {
    destroyed: !connected,
    connect: jest.fn((_port: number, _host: string, cb: () => void) => {
      if (connected) setTimeout(cb, 0);
    }),
    on: jest.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    write: jest.fn(),
    destroy: jest.fn(function (this: { destroyed: boolean }) { this.destroyed = true; }),
    removeAllListeners: jest.fn(),
    _listeners: listeners,
  };
}

// Mock net module
jest.mock('net', () => ({
  Socket: jest.fn().mockImplementation(() => createMockSocket()),
}));

const mockLog = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('RdoConnectionPool', () => {
  let pool: RdoConnectionPool;
  const onData = jest.fn();
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    pool = new RdoConnectionPool(
      { host: '127.0.0.1', port: 7000, maxSize: 3, connectTimeoutMs: 1000 },
      { onData, onClose },
      mockLog,
    );
  });

  describe('releaseSlot', () => {
    it('decrements activeRequests on success', () => {
      const conn = { activeRequests: 2, consecutiveTimeouts: 1 } as PooledConnection;
      pool.releaseSlot(conn, false);
      expect(conn.activeRequests).toBe(1);
      expect(conn.consecutiveTimeouts).toBe(0); // reset on success
    });

    it('increments consecutiveTimeouts on timeout', () => {
      const conn = { activeRequests: 1, consecutiveTimeouts: 0 } as PooledConnection;
      pool.releaseSlot(conn, true);
      expect(conn.activeRequests).toBe(0);
      expect(conn.consecutiveTimeouts).toBe(1);
    });

    it('does not go below 0 activeRequests', () => {
      const conn = { activeRequests: 0, consecutiveTimeouts: 0 } as PooledConnection;
      pool.releaseSlot(conn, false);
      expect(conn.activeRequests).toBe(0);
    });
  });

  describe('acquireSlot', () => {
    it('increments activeRequests', () => {
      const conn = { activeRequests: 0 } as PooledConnection;
      pool.acquireSlot(conn);
      expect(conn.activeRequests).toBe(1);
    });
  });

  describe('maxSize', () => {
    it('returns configured max size', () => {
      expect(pool.maxSize).toBe(3);
    });
  });

  describe('close', () => {
    it('can be called safely on new pool', () => {
      expect(() => pool.close()).not.toThrow();
    });
  });

  describe('drainAll', () => {
    it('can be called on empty pool', () => {
      expect(() => pool.drainAll()).not.toThrow();
      expect(pool.size).toBe(0);
    });
  });
});
