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
    /** Force all players into a specific world (format: "zoneId/worldName", e.g. "beta/Shamba"). Temporary test-phase override. */
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
  },
};

/**
 * Type-safe access to config
 */
export type Config = typeof config;
