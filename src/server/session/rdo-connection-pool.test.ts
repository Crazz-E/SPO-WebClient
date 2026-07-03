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

  describe('getConnection — atomic slot acquisition', () => {
    /** Inject fabricated live connections into the pool's private list */
    function injectConnections(count: number): PooledConnection[] {
      const conns = Array.from({ length: count }, () => ({
        socket: { destroyed: false } as never,
        framer: {} as never,
        activeRequests: 0,
        consecutiveTimeouts: 0,
        replacing: false,
        createdAt: 0,
      } as PooledConnection));
      (pool as unknown as { connections: PooledConnection[] }).connections = conns;
      return conns;
    }

    it('acquires the slot synchronously with selection', async () => {
      const [conn] = injectConnections(1);
      const got = await pool.getConnection();
      expect(got).toBe(conn);
      expect(got.activeRequests).toBe(1);
    });

    it('two concurrent requests get two DIFFERENT connections (no shared-socket race)', async () => {
      injectConnections(2);
      const [a, b] = await Promise.all([pool.getConnection(), pool.getConnection()]);
      expect(a).not.toBe(b);
      expect(a.activeRequests).toBe(1);
      expect(b.activeRequests).toBe(1);
    });

    it('falls back to least-loaded when pool is full and all are busy', async () => {
      const conns = injectConnections(3); // maxSize = 3
      conns[0].activeRequests = 2;
      conns[1].activeRequests = 3;
      conns[2].activeRequests = 5;
      const got = await pool.getConnection();
      expect(got).toBe(conns[0]);
      expect(got.activeRequests).toBe(3); // acquired on top of existing load
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
