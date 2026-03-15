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
   * Static asset CDN
   *
   * When set, the client fetches all static terrain/object assets from this CDN
   * instead of the local server. Assets include: terrain chunks, atlases, object
   * atlases, individual textures, terrain previews, and baked object textures.
   *
   * When empty, falls back to local server API endpoints.
   *
   * Set via CHUNK_CDN_URL environment variable (e.g., 'https://spo.zz.works').
   */
  cdn: {
    url: getEnv('CHUNK_CDN_URL') || '',
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
