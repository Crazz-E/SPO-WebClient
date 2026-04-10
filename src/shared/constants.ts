/**
 * Application-wide constants
 * Centralized values used across client and server
 */

/**
 * Update server configuration
 */
export const UPDATE_SERVER = {
  /** Base URL for the update server */
  BASE_URL: 'http://update.starpeaceonline.com',
  /** Path to the client cache on the update server */
  CACHE_PATH: '/five/client/cache',
  /** Full URL to the cache directory */
  get CACHE_URL() {
    return `${this.BASE_URL}${this.CACHE_PATH}`;
  },
} as const;

/**
 * Local cache directories
 */
export const CACHE_DIRS = {
  /** Mirror of update server content */
  UPDATE_CACHE: 'cache',
  /** WebClient-specific cache (game server images, local data) */
  WEBCLIENT_CACHE: 'webclient-cache',
  /** Extracted textures cache */
  TEXTURES_CACHE: 'webclient-cache/textures',
} as const;


/**
 * Default timeout values (in milliseconds)
 */
export const TIMEOUTS = {
  /** Default fetch timeout */
  FETCH: 30000,
  /** RDO request timeout */
  RDO_REQUEST: 15000,
  /** Image download timeout */
  IMAGE_DOWNLOAD: 10000,
  /** File download timeout (large assets like maps) */
  FILE_DOWNLOAD: 60000,
} as const;


/**
 * Road building constants
 */
export const ROAD_CONSTANTS = {
  /** Circuit ID for roads */
  CIRCUIT_ID: 1,
  /** Circuit ID for railroads */
  RAILROAD_CIRCUIT_ID: 2,
  /** Cost per road tile in dollars */
  COST_PER_TILE: 2000000,
} as const;

