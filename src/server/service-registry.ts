/**
 * ServiceRegistry - Centralized service management for SPO Gateway
 *
 * Provides:
 * - Centralized service registration and retrieval
 * - Ordered initialization with dependency management
 * - Health checks for monitoring
 * - Graceful shutdown handling
 */

import { EventEmitter } from 'events';

/**
 * Service lifecycle interface
 * Services can optionally implement these methods for managed lifecycle
 */
export interface Service {
  /** Service name for logging and identification */
  readonly name: string;

  /** Initialize the service (called during startup) */
  initialize?(): Promise<void>;

  /** Shutdown the service gracefully */
  shutdown?(): Promise<void>;

  /** Health check - returns true if service is healthy */
  isHealthy?(): boolean;

  /** Get service statistics for monitoring (return type is flexible) */
  getStats?(): unknown;
}

/**
 * Service registration options
 */
export interface ServiceRegistration {
  /** The service instance */
  service: Service;

  /** Services that must be initialized before this one */
  dependsOn?: string[];

  /** Priority for shutdown order (higher = shutdown first) */
  shutdownPriority?: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  services: Record<string, {
    healthy: boolean;
    stats?: unknown;
  }>;
  uptime: number;
}

/**
 * ServiceRegistry - Manages all singleton services
 */
export class ServiceRegistry extends EventEmitter {
  private services: Map<string, ServiceRegistration> = new Map();
  private initialized: boolean = false;
  private shuttingDown: boolean = false;
  private startTime: number = 0;

  /**
   * Register a service with the registry
   */
  register(name: string, service: Service, options?: Partial<ServiceRegistration>): void {
    if (this.initialized) {
      throw new Error(`Cannot register service '${name}' after initialization`);
    }

    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.services.set(name, {
      service,
      dependsOn: options?.dependsOn ?? [],
      shutdownPriority: options?.shutdownPriority ?? 0,
    });
  }

  /**
   * Get a registered service by name
   */
  get<T extends Service>(name: string): T {
    const registration = this.services.get(name);
    if (!registration) {
      throw new Error(`Service '${name}' is not registered`);
    }
    return registration.service as T;
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Initialize all registered services in dependency order
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('ServiceRegistry is already initialized');
    }

    console.log('[ServiceRegistry] Starting initialization...');
    this.startTime = Date.now();

    // Build initialization order based on dependencies
    const initOrder = this.resolveInitializationOrder();

    // Initialize services in order
    for (const name of initOrder) {
      const registration = this.services.get(name)!;
      const service = registration.service;

      if (service.initialize) {
        console.log(`[ServiceRegistry] Initializing ${name}...`);
        const start = Date.now();

        try {
          await service.initialize();
          const elapsed = Date.now() - start;
          console.log(`[ServiceRegistry] ${name} initialized (${elapsed}ms)`);
        } catch (error: unknown) {
          console.error(`[ServiceRegistry] Failed to initialize ${name}:`, error);
          throw error;
        }
      }
    }

    this.initialized = true;
    const totalTime = Date.now() - this.startTime;
    console.log(`[ServiceRegistry] All services initialized (${totalTime}ms)`);

    this.emit('initialized');
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown(): Promise<void> {
    if (this.shuttingDown) {
      console.log('[ServiceRegistry] Shutdown already in progress');
      return;
    }

    this.shuttingDown = true;
    console.log('[ServiceRegistry] Starting graceful shutdown...');
    this.emit('shutting-down');

    // Sort services by shutdown priority (higher first)
    const sortedServices = Array.from(this.services.entries())
      .sort((a, b) => (b[1].shutdownPriority ?? 0) - (a[1].shutdownPriority ?? 0));

    // Shutdown services in priority order
    for (const [name, registration] of sortedServices) {
      const service = registration.service;

      if (service.shutdown) {
        console.log(`[ServiceRegistry] Shutting down ${name}...`);

        try {
          await Promise.race([
            service.shutdown(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Shutdown timeout')), 5000)
            )
          ]);
          console.log(`[ServiceRegistry] ${name} shut down`);
        } catch (error: unknown) {
          console.error(`[ServiceRegistry] Error shutting down ${name}:`, error);
        }
      }
    }

    console.log('[ServiceRegistry] Graceful shutdown complete');
    this.emit('shutdown');
  }

  /**
   * Perform health check on all services
   */
  healthCheck(): HealthCheckResult {
    const result: HealthCheckResult = {
      healthy: true,
      services: {},
      uptime: this.initialized ? Date.now() - this.startTime : 0,
    };

    for (const [name, registration] of this.services) {
      const service = registration.service;
      const isHealthy = service.isHealthy ? service.isHealthy() : true;

      result.services[name] = {
        healthy: isHealthy,
        stats: service.getStats?.(),
      };

      if (!isHealthy) {
        result.healthy = false;
      }
    }

    return result;
  }

  /**
   * Get list of registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Check if registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if registry is shutting down
   */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Reset the registry to its initial state.
   * Intended for tests: shuts down all services, then clears registrations
   * so the registry can be reused.
   */
  async reset(): Promise<void> {
    if (this.initialized && !this.shuttingDown) {
      await this.shutdown();
    }
    this.services.clear();
    this.initialized = false;
    this.shuttingDown = false;
    this.startTime = 0;
  }

  /**
   * Resolve initialization order based on dependencies (topological sort)
   */
  private resolveInitializationOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      visiting.add(name);

      const registration = this.services.get(name);
      if (!registration) {
        throw new Error(`Unknown service dependency: ${name}`);
      }

      for (const dep of registration.dependsOn ?? []) {
        visit(dep);
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    for (const name of this.services.keys()) {
      visit(name);
    }

    return order;
  }
}

/**
 * Global service registry instance
 */
export const serviceRegistry = new ServiceRegistry();

/**
 * Extended server interface for graceful shutdown
 */
interface ShutdownServer {
  close: (cb?: () => void) => void;
  closeAllConnections?: () => void;
}

/**
 * Setup graceful shutdown handlers
 *
 * Shutdown behavior:
 * - First SIGINT/SIGTERM: Graceful shutdown (5s timeout)
 * - Second SIGINT: Force shutdown (kills all connections immediately)
 * - Third SIGINT: Immediate process.exit(1)
 */
export function setupGracefulShutdown(registry: ServiceRegistry, server?: ShutdownServer): void {
  let shutdownInProgress = false;
  let forceShutdownRequested = false;
  let sigintCount = 0;

  const GRACEFUL_TIMEOUT_MS = 5000; // 5 seconds max for graceful shutdown

  const forceExit = () => {
    console.log('[Shutdown] Force exit!');
    process.exit(1);
  };

  const shutdown = async (signal: string) => {
    sigintCount++;

    // Third signal = immediate exit
    if (sigintCount >= 3) {
      forceExit();
      return;
    }

    // Second signal = force shutdown
    if (sigintCount === 2 && shutdownInProgress) {
      console.log('\n[Shutdown] Force shutdown requested (press Ctrl+C again for immediate exit)');
      forceShutdownRequested = true;

      // Force close all connections if server supports it
      if (server?.closeAllConnections) {
        console.log('[Shutdown] Closing all connections...');
        server.closeAllConnections();
      }

      // Give a brief moment then exit
      setTimeout(() => {
        console.log('[Shutdown] Force exiting...');
        process.exit(0);
      }, 500);
      return;
    }

    // First signal = graceful shutdown
    if (shutdownInProgress) {
      console.log(`[Shutdown] Already shutting down (press Ctrl+C again to force)`);
      return;
    }

    shutdownInProgress = true;
    console.log(`\n[Shutdown] Received ${signal}, starting graceful shutdown...`);
    console.log('[Shutdown] Press Ctrl+C again to force shutdown');

    // Set a hard timeout for graceful shutdown
    const forceTimeout = setTimeout(() => {
      if (!forceShutdownRequested) {
        console.log(`[Shutdown] Graceful shutdown timeout (${GRACEFUL_TIMEOUT_MS}ms), forcing exit...`);
        process.exit(0);
      }
    }, GRACEFUL_TIMEOUT_MS);

    try {
      // Close HTTP server (with timeout)
      if (server) {
        console.log('[Shutdown] Closing HTTP server...');

        await Promise.race([
          new Promise<void>((resolve) => {
            server.close(() => {
              console.log('[Shutdown] HTTP server closed');
              resolve();
            });
          }),
          new Promise<void>((resolve) => {
            setTimeout(() => {
              console.log('[Shutdown] HTTP server close timeout, continuing...');
              // Force close connections if available
              if (server.closeAllConnections) {
                server.closeAllConnections();
              }
              resolve();
            }, 2000);
          })
        ]);
      }

      // Shutdown all services
      await registry.shutdown();

      clearTimeout(forceTimeout);
      console.log('[Shutdown] Graceful shutdown complete');
      process.exit(0);
    } catch (error: unknown) {
      console.error('[Shutdown] Error during shutdown:', error);
      clearTimeout(forceTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Fatal] Uncaught exception:', error);
    shutdown('uncaughtException').catch(() => process.exit(1));
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Fatal] Unhandled rejection at:', promise, 'reason:', reason);
  });
}
