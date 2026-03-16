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
 * File extensions
 */
export const FILE_EXTENSIONS = {
  /** CAB archive extension */
  CAB: '.cab',
  /** BMP image extension */
  BMP: '.bmp',
  /** GIF image extension */
  GIF: '.gif',
  /** PNG image extension */
  PNG: '.png',
  /** JPEG image extensions */
  JPG: '.jpg',
  JPEG: '.jpeg',
} as const;

/**
 * Image MIME types
 */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.bmp': 'image/bmp',
} as const;

/**
 * HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
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
 * Placeholder image (1x1 transparent PNG)
 * Used when images fail to load
 */
export const PLACEHOLDER_IMAGE = {
  /** Base64 encoded 1x1 transparent PNG */
  BASE64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  /** Get as Buffer (server-side) */
  toBuffer(): Buffer {
    return Buffer.from(this.BASE64, 'base64');
  },
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

/**
 * Map rendering constants
 */
export const MAP_CONSTANTS = {
  /** Default map width */
  DEFAULT_WIDTH: 2000,
  /** Default map height */
  DEFAULT_HEIGHT: 2000,
  /** Maximum zoom level */
  MAX_ZOOM: 3,
  /** Minimum zoom level */
  MIN_ZOOM: 0,
  /** Default zoom level */
  DEFAULT_ZOOM: 2,
} as const;

/**
 * Season indices
 */
export const SEASONS = {
  WINTER: 0,
  SPRING: 1,
  SUMMER: 2,
  AUTUMN: 3,
} as const;
