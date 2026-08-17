/**
 * Tests for RDO Connection Pool.
 *
 * The pool mirrors Delphi TRDOConnectionPool (RDOConnectionPool.pas): N sockets
 * to the same server, selection by least in-flight requests, degraded sockets
 * replaced, a 60 s health check. Every test here drives the real pool — the only
 * substitution is `socketFactory`, which exists precisely so the transport can be
 * swapped without mocking the `net` module (see the doc comment on
 * `PoolSocketFactory`).
 */

import { EventEmitter } from 'events';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { Socket } from 'net';
import { RdoConnectionPool, PooledConnection, PoolConfig } from './rdo-connection-pool';

/**
 * A socket the test drives by hand.
 *
 * `createConnection()` registers its `data` / `error` / `close` listeners
 * synchronously, right after calling `connect()`, so a test can emit any of them
 * as soon as the returned promise exists. `autoConnect: false` leaves the
 * connection pending, which is how the connect-timeout and connect-error
 * branches are reached.
 */
class FakeSocket extends EventEmitter {
  destroyed = false;
  autoConnect = true;
  setNoDelay = jest.fn();
  write = jest.fn(() => true);
  destroy = jest.fn(() => { this.destroyed = true; });
  connect = jest.fn((_port: number, _host: string, onConnect: () => void): void => {
    if (this.autoConnect) onConnect();
  });

  asSocket(): Socket {
    return this as unknown as Socket;
  }
}

// The default `socketFactory` is `() => new net.Socket()` — the one branch that
// cannot be reached through injection, so `net` is mocked for that test alone.
jest.mock('net', () => {
  const { EventEmitter: Emitter } = jest.requireActual<typeof import('events')>('events');
  return {
    Socket: jest.fn(() => Object.assign(new Emitter(), {
      destroyed: false,
      setNoDelay: jest.fn(),
      write: jest.fn(() => true),
      destroy: jest.fn(),
      connect: jest.fn((_port: number, _host: string, onConnect: () => void) => { onConnect(); }),
    })),
  };
});

const mockLog = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const onData = jest.fn();
const onClose = jest.fn();

/** Flush the microtasks of a replacement/expansion that nobody awaits. */
const settle = (): Promise<void> => jest.advanceTimersByTimeAsync(1);

describe('RdoConnectionPool', () => {
  let pool: RdoConnectionPool;
  /** Sockets handed out by the default factory, in creation order. */
  let sockets: FakeSocket[];

  function makePool(overrides: Partial<PoolConfig> = {}): RdoConnectionPool {
    return new RdoConnectionPool(
      {
        host: '127.0.0.1',
        port: 7000,
        maxSize: 3,
        connectTimeoutMs: 1000,
        socketFactory: () => {
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket.asSocket();
        },
        ...overrides,
      },
      { onData, onClose },
      mockLog,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    sockets = [];
    pool = makePool();
  });

  afterEach(() => {
    // A pool left open keeps a 60 s interval alive across the whole file.
    pool.close();
    jest.useRealTimers();
  });

  // ── initialize / createConnection ──────────────────────────────────────

  describe('initialize', () => {
    it('creates the first connection, disables Nagle and starts the health check', async () => {
      const conn = await pool.initialize();

      expect(pool.size).toBe(1);
      expect(conn.activeRequests).toBe(0);
      expect(conn.consecutiveTimeouts).toBe(0);
      // Concurrent small RDO writes must not wait a full RTT in the kernel
      // buffer — same reason as createSocket() in spo_session.ts.
      expect(sockets[0].setNoDelay).toHaveBeenCalledWith(true);
      expect(sockets[0].connect).toHaveBeenCalledWith(7000, '127.0.0.1', expect.any(Function));
    });

    it('starts the health check only once across repeated initializations', async () => {
      await pool.initialize();
      await pool.initialize();

      expect(pool.size).toBe(2);
      jest.advanceTimersByTime(60_000);
      // One interval, so one status line — not two.
      const statusLines = mockLog.debug.mock.calls.filter(([msg]) => String(msg).includes('[Pool] Health:'));
      expect(statusLines).toHaveLength(1);
    });

    it('rejects and destroys the socket when the connect never completes', async () => {
      const hanging = new FakeSocket();
      hanging.autoConnect = false;
      pool = makePool({ socketFactory: () => hanging.asSocket() });

      const pending = pool.initialize();
      jest.advanceTimersByTime(1000);

      await expect(pending).rejects.toThrow('Pool connection timeout to 127.0.0.1:7000');
      expect(hanging.destroy).toHaveBeenCalled();
      expect(pool.size).toBe(0);
    });

    it('rejects with the socket error when the connect fails', async () => {
      const failing = new FakeSocket();
      failing.autoConnect = false;
      pool = makePool({ socketFactory: () => failing.asSocket() });

      const pending = pool.initialize();
      failing.emit('error', new Error('ECONNREFUSED'));

      await expect(pending).rejects.toThrow('ECONNREFUSED');
      expect(mockLog.error).toHaveBeenCalledWith('[Pool] Socket error:', 'ECONNREFUSED');
    });

    it('logs a post-connection socket error without rejecting anything', async () => {
      await pool.initialize();

      sockets[0].emit('error', new Error('EPIPE'));

      expect(mockLog.error).toHaveBeenCalledWith('[Pool] Socket error:', 'EPIPE');
      expect(pool.size).toBe(1);
    });

    it('builds a net.Socket when no factory is configured', async () => {
      const net = jest.requireMock<typeof import('net')>('net');
      pool = new RdoConnectionPool({ host: '127.0.0.1', port: 7000 }, { onData, onClose }, mockLog);

      await pool.initialize();

      expect(net.Socket).toHaveBeenCalledTimes(1);
      expect(pool.maxSize).toBe(6); // Delphi MaxDAPoolCnx neighbourhood
    });
  });

  // ── socket events ──────────────────────────────────────────────────────

  describe('socket events', () => {
    it('forwards inbound chunks to onData with the owning connection', async () => {
      const conn = await pool.initialize();
      const chunk = Buffer.from('A 1 ;', 'latin1');

      sockets[0].emit('data', chunk);

      expect(onData).toHaveBeenCalledWith(conn, chunk);
    });

    it('drops the connection and notifies onClose when the socket closes', async () => {
      const conn = await pool.initialize();

      sockets[0].emit('close');

      expect(pool.size).toBe(0);
      expect(onClose).toHaveBeenCalledWith(conn);
    });
  });

  // ── releaseSlot ────────────────────────────────────────────────────────

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

    it('defaults to the success path when the caller omits the flag', () => {
      const conn = { activeRequests: 1, consecutiveTimeouts: 2 } as PooledConnection;
      pool.releaseSlot(conn);
      expect(conn.consecutiveTimeouts).toBe(0);
    });
  });

  // ── replaceConnection, reached through the degradation threshold ────────

  describe('degradation', () => {
    it('replaces the connection in place once maxConsecutiveTimeouts is reached', async () => {
      const conn = await pool.initialize();
      const oldSocket = sockets[0];
      conn.consecutiveTimeouts = 2;
      conn.activeRequests = 1;

      pool.releaseSlot(conn, true); // third strike (maxConsecutiveTimeouts = 3)
      await settle();

      expect(mockLog.warn).toHaveBeenCalledWith('[Pool] Connection degraded (3 timeouts), scheduling replacement');
      expect(oldSocket.destroy).toHaveBeenCalled();
      expect(pool.size).toBe(1);
      expect(pool.getPrimaryConnection()).not.toBe(conn);
      expect(mockLog.info).toHaveBeenCalledWith('[Pool] Replaced degraded connection (pool size: 1/3)');
    });

    it('appends the replacement when the degraded connection is no longer pooled', async () => {
      await pool.initialize();
      const orphan: PooledConnection = {
        socket: new FakeSocket().asSocket(),
        framer: {} as PooledConnection['framer'],
        activeRequests: 1,
        consecutiveTimeouts: 2,
        replacing: false,
        createdAt: 0,
      };

      pool.releaseSlot(orphan, true);
      await settle();

      expect(pool.size).toBe(2); // initial + appended replacement
    });

    it('clears the replacing flag so a later attempt can retry', async () => {
      let created = 0;
      pool = makePool({
        socketFactory: () => {
          created += 1;
          if (created > 1) throw new Error('EMFILE');
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket.asSocket();
        },
      });
      const conn = await pool.initialize();
      conn.consecutiveTimeouts = 2;
      conn.activeRequests = 1;

      pool.releaseSlot(conn, true);
      await settle();

      expect(mockLog.error).toHaveBeenCalledWith('[Pool] Failed to replace connection:', 'EMFILE');
      expect(conn.replacing).toBe(false);
      expect(pool.size).toBe(1); // the degraded connection is still the only one
    });

    it('ignores a second replacement while one is already in flight', async () => {
      const conn = await pool.initialize();
      conn.replacing = true;
      conn.consecutiveTimeouts = 2;
      conn.activeRequests = 1;

      pool.releaseSlot(conn, true);
      await settle();

      expect(sockets).toHaveLength(1); // no replacement socket was built
      expect(mockLog.info).not.toHaveBeenCalledWith(expect.stringContaining('Replaced degraded'));
    });
  });

  // ── getConnection ──────────────────────────────────────────────────────

  describe('getConnection — atomic slot acquisition', () => {
    /** Inject fabricated live connections into the pool's private list */
    function injectConnections(count: number): PooledConnection[] {
      const conns = Array.from({ length: count }, () => ({
        socket: {
          destroyed: false,
          // drainAll() tears these down in afterEach.
          removeAllListeners: jest.fn(),
          destroy: jest.fn(),
        } as never,
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

    it('drops destroyed connections before selecting', async () => {
      const conns = injectConnections(2);
      (conns[0].socket as unknown as { destroyed: boolean }).destroyed = true;

      const got = await pool.getConnection();

      expect(got).toBe(conns[1]);
      expect(pool.size).toBe(1);
    });

    it('never hands out a connection that is being replaced', async () => {
      const conns = injectConnections(2);
      conns[0].replacing = true;

      const got = await pool.getConnection();

      expect(got).toBe(conns[1]);
    });

    it('expands the pool when every connection is busy and capacity remains', async () => {
      const conns = injectConnections(1);
      conns[0].activeRequests = 4;

      const got = await pool.getConnection();

      expect(got).not.toBe(conns[0]);
      expect(got.activeRequests).toBe(1);
      expect(pool.size).toBe(2);
      expect(mockLog.debug).toHaveBeenCalledWith('[Pool] Expanded pool to 2/3 connections');
    });

    it('falls back to the least loaded when the expansion fails', async () => {
      pool = makePool({ socketFactory: () => { throw new Error('EMFILE'); } });
      const conns = injectConnections(1);
      conns[0].activeRequests = 4;

      const got = await pool.getConnection();

      expect(got).toBe(conns[0]);
      expect(got.activeRequests).toBe(5);
      expect(mockLog.warn).toHaveBeenCalledWith('[Pool] Failed to expand pool:', 'EMFILE');
    });

    it('creates a connection when the pool is empty and cannot expand', async () => {
      pool = makePool({ maxSize: 0 });

      const got = await pool.getConnection();

      expect(got.activeRequests).toBe(1);
      expect(sockets).toHaveLength(1);
    });

    it('throws once the pool is closed', async () => {
      pool.close();

      await expect(pool.getConnection()).rejects.toThrow('Connection pool is closed');
    });
  });

  // ── primary connection accessors ───────────────────────────────────────

  describe('getPrimarySocket / getPrimaryConnection', () => {
    it('report nothing before the pool is initialized', () => {
      expect(pool.getPrimarySocket()).toBeUndefined();
      expect(pool.getPrimaryConnection()).toBeUndefined();
    });

    it('return the first connection that is alive and not being replaced', async () => {
      const first = await pool.initialize();
      const second = await pool.initialize();
      first.replacing = true;

      expect(pool.getPrimaryConnection()).toBe(second);
      expect(pool.getPrimarySocket()).toBe(second.socket);
    });

    it('skip a destroyed connection', async () => {
      await pool.initialize();
      await pool.initialize();
      sockets[0].destroyed = true;

      expect(pool.getPrimarySocket()).toBe(sockets[1].asSocket());
    });
  });

  describe('size', () => {
    it('counts only the sockets that are still alive', async () => {
      await pool.initialize();
      await pool.initialize();
      expect(pool.size).toBe(2);

      sockets[0].destroyed = true;
      expect(pool.size).toBe(1);
    });
  });

  describe('maxSize', () => {
    it('returns configured max size', () => {
      expect(pool.maxSize).toBe(3);
    });
  });

  // ── health check ───────────────────────────────────────────────────────

  describe('health check', () => {
    it('prunes dead connections every 60 s', async () => {
      await pool.initialize();
      await pool.initialize();
      sockets[0].destroyed = true;

      jest.advanceTimersByTime(60_000);

      expect(mockLog.warn).toHaveBeenCalledWith('[Pool] Health check: removed 1 dead connections (remaining: 1)');
      expect(pool.size).toBe(1);
    });

    it('reports the in-flight load when nothing is dead', async () => {
      const conn = await pool.initialize();
      conn.activeRequests = 2;

      jest.advanceTimersByTime(60_000);

      expect(mockLog.debug).toHaveBeenCalledWith('[Pool] Health: 1/3 connections, 2 active requests');
      expect(mockLog.warn).not.toHaveBeenCalledWith(expect.stringContaining('Health check: removed'));
    });
  });

  // ── teardown ───────────────────────────────────────────────────────────

  describe('drainAll', () => {
    it('can be called on empty pool', () => {
      expect(() => pool.drainAll()).not.toThrow();
      expect(pool.size).toBe(0);
    });

    it('destroys every socket and empties the pool', async () => {
      await pool.initialize();
      await pool.initialize();

      pool.drainAll();

      expect(sockets[0].destroy).toHaveBeenCalled();
      expect(sockets[1].destroy).toHaveBeenCalled();
      expect(pool.size).toBe(0);
      // Listeners are dropped first, so draining must not fire onClose.
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('can be called safely on new pool', () => {
      expect(() => pool.close()).not.toThrow();
    });

    it('stops the health check and drains the connections', async () => {
      await pool.initialize();

      pool.close();
      jest.advanceTimersByTime(120_000);

      expect(pool.size).toBe(0);
      expect(mockLog.debug).not.toHaveBeenCalledWith(expect.stringContaining('[Pool] Health:'));
    });

    it('is idempotent', async () => {
      await pool.initialize();

      pool.close();
      expect(() => pool.close()).not.toThrow();
    });

    it('stays closed: a pool re-initialized after close never resumes health checks', async () => {
      await pool.initialize();
      pool.close();

      // `close()` cleared the interval handle but left `closed` set, so this
      // second initialize() schedules a fresh interval on a pool that must stay
      // inert. The guard inside the tick is what keeps it that way.
      await pool.initialize();
      jest.advanceTimersByTime(60_000);

      expect(mockLog.debug).not.toHaveBeenCalledWith(expect.stringContaining('[Pool] Health:'));
      await expect(pool.getConnection()).rejects.toThrow('Connection pool is closed');
    });
  });
});
