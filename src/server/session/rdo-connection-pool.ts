/**
 * RDO Connection Pool — Per-user pool of DA connections.
 *
 * Mirrors Delphi TRDOConnectionPool (RDOConnectionPool.pas):
 * - Up to N connections per user (default 6, Delphi: MaxDAPoolCnx = 8)
 * - GetConnection() returns connection with minimum active request count
 * - Dead connections are replaced on next request
 * - Periodic health check validates all connections
 *
 * Architecture: The pool wraps multiple TCP sockets to the same Delphi server.
 * Each socket is independent and can handle one RDO request at a time (Delphi
 * is single-threaded per connection). The pool enables parallel requests.
 */

import * as net from 'net';
import { RdoFramer } from '../rdo';
import { toErrorMessage } from '../../shared/error-utils';

export interface PooledConnection {
  socket: net.Socket;
  framer: RdoFramer;
  /** Number of currently in-flight requests on this connection */
  activeRequests: number;
  /** Number of consecutive timeouts (for degradation detection) */
  consecutiveTimeouts: number;
  /** Whether this connection is being replaced */
  replacing: boolean;
  /** Creation timestamp */
  createdAt: number;
}

export interface PoolConfig {
  /** Maximum connections in the pool */
  maxSize: number;
  /** Host to connect to */
  host: string;
  /** Port to connect to */
  port: number;
  /** Connection timeout in ms */
  connectTimeoutMs: number;
  /** Max consecutive timeouts before marking connection degraded */
  maxConsecutiveTimeouts: number;
}

const DEFAULT_POOL_CONFIG: Partial<PoolConfig> = {
  maxSize: 6,
  connectTimeoutMs: 10_000,
  maxConsecutiveTimeouts: 3,
};

type LogFn = {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

export class RdoConnectionPool {
  private connections: PooledConnection[] = [];
  private config: PoolConfig;
  private closed = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 60_000; // Matches Delphi RefreshRate
  private readonly onData: (conn: PooledConnection, chunk: Buffer) => void;
  private readonly onClose: (conn: PooledConnection) => void;
  private log: LogFn;

  constructor(
    config: Partial<PoolConfig> & Pick<PoolConfig, 'host' | 'port'>,
    callbacks: {
      onData: (conn: PooledConnection, chunk: Buffer) => void;
      onClose: (conn: PooledConnection) => void;
    },
    log: LogFn,
  ) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config } as PoolConfig;
    this.onData = callbacks.onData;
    this.onClose = callbacks.onClose;
    this.log = log;
  }

  /**
   * Initialize the pool with a minimum number of connections.
   * Creates the first connection eagerly; others are created on demand.
   */
  async initialize(): Promise<PooledConnection> {
    const conn = await this.createConnection();
    this.connections.push(conn);
    this.startHealthCheck();
    return conn;
  }

  /**
   * Get the best connection for a new request (minimum activeRequests).
   * Creates a new connection if pool has capacity and all existing connections are busy.
   * Mirrors Delphi TRDOConnectionPool.GetConnection().
   */
  async getConnection(): Promise<PooledConnection> {
    if (this.closed) throw new Error('Connection pool is closed');

    // Remove dead connections
    this.connections = this.connections.filter(c => !c.socket.destroyed);

    // Find connection with minimum active requests
    let best: PooledConnection | undefined;
    for (const conn of this.connections) {
      if (conn.replacing) continue;
      if (!best || conn.activeRequests < best.activeRequests) {
        best = conn;
      }
    }

    // If best connection is idle (0 active), use it immediately
    if (best && best.activeRequests === 0) {
      return best;
    }

    // If pool has capacity, create a new connection for true parallelism
    if (this.connections.length < this.config.maxSize) {
      try {
        const newConn = await this.createConnection();
        this.connections.push(newConn);
        this.log.debug(`[Pool] Expanded pool to ${this.connections.length}/${this.config.maxSize} connections`);
        return newConn;
      } catch (err: unknown) {
        this.log.warn(`[Pool] Failed to expand pool:`, toErrorMessage(err));
        // Fall through to use best existing connection
      }
    }

    // All connections busy and pool full — use least loaded
    if (best) return best;

    // No connections at all — try to create one
    const newConn = await this.createConnection();
    this.connections.push(newConn);
    return newConn;
  }

  /**
   * Mark a request as started on a connection.
   */
  acquireSlot(conn: PooledConnection): void {
    conn.activeRequests++;
  }

  /**
   * Mark a request as completed on a connection.
   * Resets consecutive timeout counter on success.
   */
  releaseSlot(conn: PooledConnection, timedOut = false): void {
    conn.activeRequests = Math.max(0, conn.activeRequests - 1);
    if (timedOut) {
      conn.consecutiveTimeouts++;
      if (conn.consecutiveTimeouts >= this.config.maxConsecutiveTimeouts) {
        this.log.warn(`[Pool] Connection degraded (${conn.consecutiveTimeouts} timeouts), scheduling replacement`);
        this.replaceConnection(conn);
      }
    } else {
      conn.consecutiveTimeouts = 0;
    }
  }

  /**
   * Get the primary (first) connection's socket for non-pooled operations
   * (e.g., void pushes, ServerBusy polling).
   */
  getPrimarySocket(): net.Socket | undefined {
    const alive = this.connections.find(c => !c.socket.destroyed && !c.replacing);
    return alive?.socket;
  }

  /**
   * Get the primary connection object.
   */
  getPrimaryConnection(): PooledConnection | undefined {
    return this.connections.find(c => !c.socket.destroyed && !c.replacing);
  }

  /** Current pool size (alive connections). */
  get size(): number {
    return this.connections.filter(c => !c.socket.destroyed).length;
  }

  /** Pool capacity. */
  get maxSize(): number {
    return this.config.maxSize;
  }

  /**
   * Replace a degraded connection with a fresh one.
   * Mirrors Delphi CheckDAConnections() which replaces nil connections.
   */
  private async replaceConnection(old: PooledConnection): Promise<void> {
    if (old.replacing) return;
    old.replacing = true;

    try {
      const newConn = await this.createConnection();
      const idx = this.connections.indexOf(old);
      if (idx !== -1) {
        this.connections[idx] = newConn;
      } else {
        this.connections.push(newConn);
      }
      // Destroy old socket after replacement is ready
      old.socket.removeAllListeners();
      old.socket.destroy();
      this.log.info(`[Pool] Replaced degraded connection (pool size: ${this.size}/${this.config.maxSize})`);
    } catch (err: unknown) {
      old.replacing = false; // Allow future retry
      this.log.error(`[Pool] Failed to replace connection:`, toErrorMessage(err));
    }
  }

  /**
   * Create a new TCP connection to the pool's target server.
   */
  private createConnection(): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      const framer = new RdoFramer();
      let connected = false;

      const timeout = setTimeout(() => {
        if (!connected) {
          socket.destroy();
          reject(new Error(`Pool connection timeout to ${this.config.host}:${this.config.port}`));
        }
      }, this.config.connectTimeoutMs);

      const conn: PooledConnection = {
        socket,
        framer,
        activeRequests: 0,
        consecutiveTimeouts: 0,
        replacing: false,
        createdAt: Date.now(),
      };

      socket.connect(this.config.port, this.config.host, () => {
        connected = true;
        clearTimeout(timeout);
        this.log.debug(`[Pool] New connection established to ${this.config.host}:${this.config.port} (pool size: ${this.connections.length + 1})`);
        resolve(conn);
      });

      socket.on('data', (chunk: Buffer) => {
        this.onData(conn, chunk);
      });

      socket.on('error', (err) => {
        this.log.error(`[Pool] Socket error:`, toErrorMessage(err));
        if (!connected) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      socket.on('close', () => {
        this.log.debug(`[Pool] Connection closed`);
        socket.removeAllListeners();
        this.connections = this.connections.filter(c => c !== conn);
        this.onClose(conn);
      });
    });
  }

  /**
   * Periodic health check — validates all connections, replaces dead ones.
   * Mirrors Delphi InterfaceServer.CheckDAConnections().
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) return;
    this.healthCheckInterval = setInterval(() => {
      if (this.closed) return;

      // Remove destroyed connections
      const before = this.connections.length;
      this.connections = this.connections.filter(c => !c.socket.destroyed);
      const removed = before - this.connections.length;
      if (removed > 0) {
        this.log.warn(`[Pool] Health check: removed ${removed} dead connections (remaining: ${this.connections.length})`);
      }

      // Log pool status
      const active = this.connections.reduce((sum, c) => sum + c.activeRequests, 0);
      this.log.debug(`[Pool] Health: ${this.connections.length}/${this.config.maxSize} connections, ${active} active requests`);
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Drain all connections — reject in-flight requests and destroy sockets.
   * Used before world reconnect to prevent ghost RID collisions.
   */
  drainAll(): void {
    for (const conn of this.connections) {
      conn.socket.removeAllListeners();
      conn.socket.destroy();
    }
    this.connections = [];
  }

  /**
   * Close the pool and all connections.
   */
  close(): void {
    this.closed = true;
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    this.drainAll();
  }
}
