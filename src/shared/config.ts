/**
 * Configuration centralisée pour SPO v2
 *
 * Utilise les variables d'environnement avec des valeurs par défaut.
 * Permet de configurer facilement dev/prod et mock_srv.
 *
 * Browser-safe: Vérifie l'existence de process avant de l'utiliser.
 */

// Ambient declaration for Node.js process (browser-safe: guarded by typeof check)
declare const process: { env: Record<string, string | undefined> } | undefined;

// Helper pour accéder à process.env de manière sécurisée (browser-safe)
const getEnv = (key: string): string | undefined => {
  return typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
};

export const config = {
  /**
   * Configuration du serveur WebSocket
   */
  server: {
    port: Number(getEnv('PORT')) || 8080,
    host: getEnv('HOST') || '0.0.0.0',
    singleUserMode: getEnv('SINGLE_USER_MODE') === 'true',
    /** Force all players into a specific world (format: "zoneId/worldName", e.g. "free/planitia"). Temporary test-phase override. */
    forceWorld: (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__SPO_FORCE_WORLD__ !== undefined)
      ? (window as unknown as Record<string, unknown>).__SPO_FORCE_WORLD__ as string
      : getEnv('SPO_FORCE_WORLD') ?? undefined,
  },

  /**
   * Configuration du protocole RDO
   */
  rdo: {
    // Host du serveur Directory (utiliser 'localhost' pour mock_srv et www.starpeaceonline.com pour la production.)
    directoryHost: getEnv('RDO_DIR_HOST') || 'www.starpeaceonline.com',

    // Ports standards du protocole
    ports: {
      directory: 1111,
    },

    /**
     * Send the two independent viewport reads (ObjectsInArea + SegmentsInArea)
     * concurrently over the world connection pool instead of sequentially.
     * Same wire frames, same count — only the overlap in time changes; each
     * request still goes through sendRdoRequest() (ServerBusy buffering,
     * timeouts, retry). Saves one ~100ms RTT per map refresh.
     * Opt-in while under live validation: RDO_PARALLEL_AREA_READS=true
     */
    parallelAreaReads: getEnv('RDO_PARALLEL_AREA_READS') === 'true',

    /**
     * Populate the world connection pool.
     *
     * The pool was dead code: `initialize()` was called nowhere, and the only
     * other path that adds a connection sits behind a `size > 0` guard, so it
     * could never hold one (audit O-M1). Everything went down the primary
     * socket — including `parallelAreaReads`, which pipelined onto a single
     * wire. `rdo-session-lifecycle.md` §9 D2 described a behaviour the code
     * did not have.
     *
     * The chicken-and-egg is fixed and O-L1 (answering a server request on the
     * connection that asked) is fixed with it, so populating is now correct.
     * It stays opt-in because it is a path production has never exercised, and
     * because the pool builds its own sockets rather than going through
     * `createSocket()` — which the protocol test harness intercepts. Enabling it
     * under test needs a socket factory the harness can supply.
     *
     * Same posture as `parallelAreaReads`: RDO_WORLD_POOL=true to enable.
     */
    worldPool: getEnv('RDO_WORLD_POOL') === 'true',

    /**
     * What `sendRdoRequest()` does when the server answers `A<id> error N;`.
     *
     * Today the promise RESOLVES and `packet.errorCode` is read by nobody:
     * of the 93 call sites, none inspects it (audit P-M3). A refused mutation
     * is therefore indistinguishable from an applied one — M-B and M-E are two
     * instances of that, not two separate bugs.
     *
     * - `observe` (default): resolve as before, but emit one `RDO-CONTRACT`
     *   log line per error response. Changes no behaviour; the log IS the list
     *   of call sites that would start throwing, which is what has to be
     *   triaged before flipping.
     * - `reject`: the promise rejects with RdoServerError. The end state.
     *
     * Set RDO_ERROR_CONTRACT=reject to flip.
     */
    errorContract: (getEnv('RDO_ERROR_CONTRACT') === 'reject' ? 'reject' : 'observe') as 'observe' | 'reject',
  },

  /**
   * Static asset CDN — official Cloudflare R2 CDN for terrain/object assets.
   * Override with CHUNK_CDN_URL env var if needed (e.g., local dev without CDN: set to '').
   */
  cdn: {
    url: (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__SPO_CDN_URL__ !== undefined)
      ? (window as unknown as Record<string, unknown>).__SPO_CDN_URL__ as string
      : getEnv('CHUNK_CDN_URL') ?? 'https://spo.zz.works',
  },

  /**
   * Logging
   */
  logging: {
    // Niveaux: 'debug' | 'info' | 'warn' | 'error'
    level: getEnv('LOG_LEVEL') || 'debug',
    colorize: getEnv('NODE_ENV') !== 'production',
    /** NDJSON structured output (LOG_JSON=true) */
    jsonMode: getEnv('LOG_JSON') === 'true',
    /** File path for NDJSON log output (e.g. 'logs/gateway.ndjson') */
    filePath: getEnv('LOG_FILE') || '',
    /** Max log file size in bytes before rotation (default 10MB) */
    maxFileSize: Number(getEnv('LOG_MAX_SIZE')) || 10 * 1024 * 1024,
    /** Max number of rotated log files to keep (default 5) */
    maxFiles: Number(getEnv('LOG_MAX_FILES')) || 5,
    /** Separate file for ERROR-level entries (e.g. 'logs/errors.ndjson') */
    errorFilePath: getEnv('LOG_ERROR_FILE') || '',
    /** Ring buffer size for error context (recent entries attached to errors) */
    ringBufferSize: Number(getEnv('LOG_RING_BUFFER_SIZE')) || 20,
  },
};

/**
 * Type-safe access to config
 */
export type Config = typeof config;
