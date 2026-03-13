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
   * Chunk pre-generation
   */
  chunks: {
    // In dev mode, only pre-generate chunks for these maps (saves time/disk).
    // Set PREGENERATE_MAPS env var to override, or empty string to generate all.
    // In production (NODE_ENV=production), all maps are generated unless PREGENERATE_MAPS is set.
    devMaps: getEnv('NODE_ENV') !== 'production'
      ? (getEnv('PREGENERATE_MAPS') ?? 'Shamba,Zorcon').split(',').map(s => s.trim()).filter(Boolean)
      : (getEnv('PREGENERATE_MAPS') ?? '').split(',').map(s => s.trim()).filter(Boolean),
  },

  /**
   * Logging
   */
  logging: {
    // Niveaux: 'debug' | 'info' | 'warn' | 'error'
    level: getEnv('LOG_LEVEL') || 'info',
    colorize: getEnv('NODE_ENV') !== 'production',
  },
};

/**
 * Type-safe access to config
 */
export type Config = typeof config;
