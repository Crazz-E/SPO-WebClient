import * as http from 'http';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { StarpeaceSession } from './spo_session';
import { config } from '../shared/config';
import { createLogger } from '../shared/logger';
import { UPDATE_SERVER } from '../shared/constants';
import { fileToProxyUrl, PROXY_IMAGE_ENDPOINT } from '../shared/proxy-utils';
import * as ErrorCodes from '../shared/error-codes';
import { FacilityDimensionsCache } from './facility-dimensions-cache';
import { SearchMenuService } from './search-menu-service';
import { UpdateService } from './update-service';
import { MapDataService } from './map-data-service';
import { TextureExtractor } from './texture-extractor';
import { TerrainChunkRenderer } from './terrain-chunk-renderer';
import { serviceRegistry, setupGracefulShutdown } from './service-registry';
import {
  WsMessageType,
  type WsMessage,
  type WorldInfo,
  type WsReqLoginWorld,
  type WsReqSelectCompany,
  type WsReqSwitchCompany,
  type WsRespError,
  type WsRespCapitolCoords,
} from '../shared/types';
import { toErrorMessage } from '../shared/error-utils';
import { wsHandlerRegistry } from './ws-handlers';
import { parseResearchDat, buildInventionIndex, type DatInventionIndex } from '../shared/research-dat-parser';

/**
 * Starpeace Gateway Server
 * ------------------------
 * 1. Serves static UI files (index.html, client.js).
 * 2. Manages WebSocket connections.
 * 3. Maps 1 WebSocket <-> 1 StarpeaceSession.
 */

const logger = createLogger('Gateway');
const PORT = config.server.port;
const PUBLIC_DIR = path.join(__dirname, '../../public');
const CACHE_DIR = path.join(__dirname, '../../cache');

// =============================================================================
// Service Registration
// =============================================================================
// Register all singleton services with the ServiceRegistry
// Dependencies are declared to ensure proper initialization order

// Update service (syncs files from update server) - no dependencies
serviceRegistry.register('update', new UpdateService(), {
  progressWeight: 50,
  progressMessage: 'Downloading game assets...',
});

// Facility dimensions cache - depends on update service (needs CLASSES.BIN)
// Runs in parallel with textures and mapData (same dependency depth)
serviceRegistry.register('facilities', new FacilityDimensionsCache(), {
  dependsOn: ['update'],
  progressWeight: 10,
  progressMessage: 'Loading building catalog...',
});

// Texture extractor - depends on update service (needs CAB archives)
// Runs in parallel with facilities and mapData
serviceRegistry.register('textures', new TextureExtractor(), {
  dependsOn: ['update'],
  progressWeight: 30,
  progressMessage: 'Processing terrain textures...',
});

// Map data service - depends on update service (needs map files)
// Runs in parallel with facilities and textures
serviceRegistry.register('mapData', new MapDataService(), {
  dependsOn: ['update'],
  progressWeight: 5,
  progressMessage: 'Indexing map data...',
});

// Terrain chunk renderer - depends on textures and mapData (needs atlas + map BMP data)
serviceRegistry.register('terrainChunks', new TerrainChunkRenderer(), {
  dependsOn: ['textures', 'mapData'],
  progressWeight: 5,
  progressMessage: 'Preparing terrain renderer...',
});

// Convenience getters for type-safe access to services
const facilityDimensionsCache = () => serviceRegistry.get<FacilityDimensionsCache>('facilities');
const mapDataService = () => serviceRegistry.get<MapDataService>('mapData');
const textureExtractor = () => serviceRegistry.get<TextureExtractor>('textures');
const terrainChunkRenderer = () => serviceRegistry.get<TerrainChunkRenderer>('terrainChunks');

// WebClient-specific cache directory (for future needs, separate from update server mirror)
const WEBCLIENT_CACHE_DIR = path.join(__dirname, '../../webclient-cache');
if (!fs.existsSync(WEBCLIENT_CACHE_DIR)) {
  fs.mkdirSync(WEBCLIENT_CACHE_DIR, { recursive: true });
}

// =============================================================================
// In-memory file index for proxy-image (avoids readdirSync on every request)
// =============================================================================
// Maps lowercase filename → full path on disk
const imageFileIndex = new Map<string, string>();

/**
 * Build in-memory index of all image files in cache directories.
 * Called once at startup and after downloading new files.
 */
async function buildImageFileIndex(): Promise<void> {
  imageFileIndex.clear();
  const CACHE_ROOT = path.join(__dirname, '../../cache');

  // Index files in update server cache subdirectories
  try {
    const entries = await fsp.readdir(CACHE_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(CACHE_ROOT, entry.name);
        const files = await fsp.readdir(dirPath);
        for (const file of files) {
          imageFileIndex.set(file.toLowerCase(), path.join(dirPath, file));
        }
      }
    }
  } catch {
    // Cache root doesn't exist yet
  }

  // Index files in webclient-cache
  try {
    const files = await fsp.readdir(WEBCLIENT_CACHE_DIR);
    for (const file of files) {
      const key = file.toLowerCase();
      if (!imageFileIndex.has(key)) {
        imageFileIndex.set(key, path.join(WEBCLIENT_CACHE_DIR, file));
      }
    }
  } catch {
    // webclient-cache doesn't exist yet
  }

  logger.info(`Image file index built: ${imageFileIndex.size} files`);
}

// =============================================================================
// In-memory INI cache (road, concrete, car block classes)
// =============================================================================
interface IniFileCache {
  files: Array<{ filename: string; content: string }>;
}

const iniCache: Record<string, IniFileCache> = {};

async function buildIniCache(): Promise<void> {
  const dirs: Record<string, string> = {
    roadBlockClasses: path.join(CACHE_DIR, 'RoadBlockClasses'),
    concreteBlockClasses: path.join(CACHE_DIR, 'ConcreteClasses'),
    carClasses: path.join(CACHE_DIR, 'CarClasses'),
  };

  for (const [key, dirPath] of Object.entries(dirs)) {
    try {
      const allFiles = await fsp.readdir(dirPath);
      const iniFiles = allFiles.filter(f => f.toLowerCase().endsWith('.ini'));
      const iniContents: Array<{ filename: string; content: string }> = [];
      for (const file of iniFiles) {
        const filePath = path.join(dirPath, file);
        const content = await fsp.readFile(filePath, 'utf-8');
        iniContents.push({ filename: file, content });
      }
      iniCache[key] = { files: iniContents };
    } catch {
      iniCache[key] = { files: [] };
    }
  }

  logger.info(`INI cache built: road=${iniCache.roadBlockClasses?.files.length ?? 0}, concrete=${iniCache.concreteBlockClasses?.files.length ?? 0}, car=${iniCache.carClasses?.files.length ?? 0}`);
}

// =============================================================================
// Research Invention Index (parsed from research.0.dat)
// =============================================================================

let inventionIndex: DatInventionIndex | null = null;
let inventionIndexJson: string | null = null;

async function loadInventionIndex(): Promise<void> {
  const datPath = path.join(CACHE_DIR, 'Inventions', 'research.0.dat');
  try {
    await fsp.access(datPath);
  } catch {
    logger.warn('research.0.dat not found — research name resolution disabled');
    return;
  }
  try {
    const buffer = await fsp.readFile(datPath);
    const parsed = parseResearchDat(buffer);
    inventionIndex = buildInventionIndex(parsed);

    // Pre-serialize the JSON response for the API endpoint
    const serializable = {
      inventionCount: parsed.inventionCount,
      categoryTabs: parsed.categoryTabs,
      inventions: parsed.inventions.map(inv => ({
        id: inv.id,
        name: inv.name,
        category: inv.category,
        description: inv.description,
        parent: inv.parent,
        properties: inv.properties,
        requires: inv.requires,
      })),
    };
    inventionIndexJson = JSON.stringify(serializable);
    logger.info(`Research index loaded: ${parsed.inventionCount} inventions, ${parsed.categoryTabs.length} tabs`);
  } catch (err: unknown) {
    logger.error(`Failed to load research.0.dat: ${toErrorMessage(err)}`);
  }
}

/** Get the invention index for name enrichment. */
export function getInventionIndex(): DatInventionIndex | null {
  return inventionIndex;
}

/**
 * Generate a placeholder image (1x1 transparent PNG)
 */
function getPlaceholderImage(): Buffer {
  // 1x1 transparent PNG (base64 encoded)
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return Buffer.from(base64, 'base64');
}

function getImageContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.bmp': return 'application/octet-stream';
    default: return 'image/gif';
  }
}

/**
 * Proxy image from remote server to avoid CORS/Referer blocking.
 * Uses in-memory file index for O(1) cache lookup instead of scanning directories.
 */
async function proxyImage(imageUrl: string, res: http.ServerResponse): Promise<void> {
  // Handle file:// URLs — serve local files only from within the cache directory
  if (imageUrl.startsWith('file://')) {
    const filePath = path.normalize(decodeURIComponent(imageUrl.replace('file://', '')));
    const normalizedCache = path.normalize(CACHE_DIR);
    if (!filePath.startsWith(normalizedCache)) {
      res.writeHead(403);
      res.end('Access denied: file outside cache directory');
      return;
    }
    try {
      const content = await fsp.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': getImageContentType(filePath),
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('File not found');
    }
    return;
  }

  // Security: reject non-HTTP schemes (SSRF prevention)
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    res.writeHead(400);
    res.end('Only http:// and https:// URLs are allowed');
    return;
  }

  // Security: block requests to private/internal IP ranges
  try {
    const urlObj = new URL(imageUrl);
    const hostname = urlObj.hostname;
    if (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        /^fe80[:%]/i.test(hostname) ||
        /^\[fe80[:%]/i.test(hostname) ||
        /^fc/i.test(hostname) || /^\[fc/i.test(hostname) ||
        /^fd/i.test(hostname) || /^\[fd/i.test(hostname)) {
      res.writeHead(403);
      res.end('Access to internal addresses is not allowed');
      return;
    }
  } catch {
    res.writeHead(400);
    res.end('Invalid URL');
    return;
  }

  // Extract filename from URL
  const urlParts = imageUrl.split('/');
  const filename = urlParts[urlParts.length - 1] || 'unknown.gif';

  try {
    // O(1) lookup in pre-built file index (replaces readdirSync scans)
    const cachedPath = imageFileIndex.get(filename.toLowerCase());
    if (cachedPath) {
      const content = await fsp.readFile(cachedPath);
      res.writeHead(200, {
        'Content-Type': getImageContentType(cachedPath),
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
      return;
    }

    // Not in index — try downloading from update server
    const CACHE_ROOT = path.join(__dirname, '../../cache');
    const imageDirs: string[] = [];
    for (const [, filePath] of imageFileIndex) {
      const dir = path.basename(path.dirname(filePath));
      if (!imageDirs.includes(dir) && path.dirname(path.dirname(filePath)) === CACHE_ROOT) {
        imageDirs.push(dir);
      }
    }

    let downloaded = false;
    for (const dir of imageDirs) {
      try {
        const updateUrl = `${UPDATE_SERVER.CACHE_URL}/${dir}/${filename}`;
        const response = await fetch(updateUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Cache in proper directory structure (async)
          const targetDir = path.join(CACHE_ROOT, dir);
          await fsp.mkdir(targetDir, { recursive: true });
          const targetPath = path.join(targetDir, filename);
          await fsp.writeFile(targetPath, buffer);

          // Update index
          imageFileIndex.set(filename.toLowerCase(), targetPath);

          res.writeHead(200, {
            'Content-Type': getImageContentType(filename),
            'Cache-Control': 'public, max-age=31536000'
          });
          res.end(buffer);
          downloaded = true;
          logger.debug(`Downloaded from update server: ${dir}/${filename}`);
          break;
        }
      } catch {
        // Continue to next directory
      }
    }

    if (downloaded) return;

    // Not on update server, try game server (fallback)
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Cache in webclient-cache (async)
    const webclientImagePath = path.join(WEBCLIENT_CACHE_DIR, filename);
    await fsp.writeFile(webclientImagePath, buffer);
    imageFileIndex.set(filename.toLowerCase(), webclientImagePath);
    logger.debug(`Downloaded from game server: ${filename}`);

    res.writeHead(200, {
      'Content-Type': getImageContentType(filename),
      'Cache-Control': 'public, max-age=31536000'
    });
    res.end(buffer);
  } catch (error: unknown) {
    logger.warn(`Failed to fetch image ${filename}: ${toErrorMessage(error)}`);

    // Cache the placeholder to avoid repeated failed downloads
    const placeholder = getPlaceholderImage();
    const webclientImagePath = path.join(WEBCLIENT_CACHE_DIR, filename);
    await fsp.writeFile(webclientImagePath, placeholder).catch(() => {});
    imageFileIndex.set(filename.toLowerCase(), webclientImagePath);

    // Return placeholder image instead of 404
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(placeholder);
  }
}

// Security headers applied to all HTTP responses
function setSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
}

// Simple in-memory rate limiter for sensitive endpoints
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_AUTH = 10;       // max auth attempts per minute per IP
const RATE_LIMIT_MAX_PROXY = 60;      // max proxy-image requests per minute per IP
const RATE_LIMIT_MAX_ENTRIES = 10_000; // max entries before forced cleanup

function checkRateLimit(ip: string, category: string, maxRequests: number): boolean {
  const key = `${category}:${ip}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    // Prevent unbounded growth: evict expired entries when map is too large
    if (rateLimitMap.size >= RATE_LIMIT_MAX_ENTRIES) {
      for (const [k, v] of rateLimitMap) {
        if (now > v.resetTime) rateLimitMap.delete(k);
      }
    }
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= maxRequests;
}

// Periodic cleanup of expired rate limit entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key);
  }
}, 300_000);

// 1. HTTP Server for Static Files + Image Proxy
const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  const safePath = req.url === '/' ? '/index.html' : req.url || '/index.html';

  // Startup status endpoint — SSE stream while initializing, JSON once ready
  if (safePath === '/api/startup-status') {
    if (serviceRegistry.isInitialized()) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ phase: 'ready', progress: 1, message: 'Server ready', services: [] }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders();
    const send = (data: import('./service-registry').StartupProgressEvent) => {
      res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onProgress = (evt: import('./service-registry').StartupProgressEvent) => send(evt);
    const onReady = () => {
      send({ phase: 'ready', progress: 1, message: 'Server ready', services: [] });
      res.end();
      serviceRegistry.off('startup-progress', onProgress);
      serviceRegistry.off('initialized', onReady);
    };
    serviceRegistry.on('startup-progress', onProgress);
    serviceRegistry.on('initialized', onReady);
    req.on('close', () => {
      serviceRegistry.off('startup-progress', onProgress);
      serviceRegistry.off('initialized', onReady);
    });
    return;
  }

  // Map data API endpoint: /api/map-data/:mapname
  if (safePath.startsWith('/api/map-data/')) {
    const mapName = safePath.substring('/api/map-data/'.length).split('?')[0];

    if (!mapName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing map name' }));
      return;
    }

    try {
      // Extract CAB file if needed (or verify files exist)
      await mapDataService().extractCabFile(mapName);

      // Get map metadata from INI file
      const metadata = await mapDataService().getMapMetadata(mapName);

      // Get BMP file path and create proxy URL
      const bmpPath = mapDataService().getBmpFilePath(mapName);
      const bmpUrl = fileToProxyUrl(bmpPath);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ metadata, bmpUrl }));
    } catch (error: unknown) {
      console.error(`[MapDataService] Error loading map ${mapName}:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to load map data' }));
    }
    return;
  }

  // Terrain info endpoint: /api/terrain-info/:terrainType
  // Returns available seasons and default season for a terrain type
  // Example: /api/terrain-info/Alien%20Swamp
  // Road block classes endpoint — served from in-memory cache
  if (safePath === '/api/road-block-classes') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(JSON.stringify(iniCache.roadBlockClasses));
    return;
  }

  // Concrete block classes endpoint — served from in-memory cache
  if (safePath === '/api/concrete-block-classes') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(JSON.stringify(iniCache.concreteBlockClasses));
    return;
  }

  // Car classes endpoint — served from in-memory cache
  if (safePath === '/api/car-classes') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(JSON.stringify(iniCache.carClasses));
    return;
  }

  if (safePath.startsWith('/api/terrain-info/')) {
    const terrainType = decodeURIComponent(safePath.substring('/api/terrain-info/'.length).split('?')[0]);

    const terrainInfo = textureExtractor().getTerrainInfo(terrainType);

    if (!terrainInfo) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Terrain type not found: ${terrainType}` }));
      return;
    }

    logger.debug(`TerrainInfo ${terrainType}: seasons=[${terrainInfo.availableSeasons.join(',')}], default=${terrainInfo.defaultSeason}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(terrainInfo));
    return;
  }

  // Terrain atlas endpoint: /api/terrain-atlas/:terrainType/:season
  // Returns the pre-generated atlas PNG for a terrain type and season
  // Example: /api/terrain-atlas/Earth/2
  if (safePath.startsWith('/api/terrain-atlas/') && !safePath.includes('/manifest')) {
    const parts = safePath.substring('/api/terrain-atlas/'.length).split('/');

    if (parts.length < 2) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL format. Expected: /api/terrain-atlas/:terrainType/:season' }));
      return;
    }

    const terrainType = decodeURIComponent(parts[0]);
    const season = parseInt(parts[1].split('?')[0], 10);

    if (isNaN(season) || season < 0 || season > 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid season (0-3)' }));
      return;
    }

    const atlasPath = path.join(WEBCLIENT_CACHE_DIR, 'textures', terrainType, String(season), 'atlas.png');

    try {
      const content = await fsp.readFile(atlasPath);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Atlas not found' }));
    }
    return;
  }

  // Terrain atlas manifest: /api/terrain-atlas/:terrainType/:season/manifest
  if (safePath.startsWith('/api/terrain-atlas/') && safePath.endsWith('/manifest')) {
    const parts = safePath.substring('/api/terrain-atlas/'.length).replace('/manifest', '').split('/');

    if (parts.length < 2) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL format' }));
      return;
    }

    const terrainType = decodeURIComponent(parts[0]);
    const season = parseInt(parts[1].split('?')[0], 10);

    if (isNaN(season) || season < 0 || season > 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid season (0-3)' }));
      return;
    }

    const manifestPath = path.join(WEBCLIENT_CACHE_DIR, 'textures', terrainType, String(season), 'atlas.json');

    try {
      const content = await fsp.readFile(manifestPath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Atlas manifest not found' }));
    }
    return;
  }

  // Object atlas endpoint: /api/object-atlas/:category
  if (safePath.startsWith('/api/object-atlas/') && !safePath.endsWith('/manifest')) {
    const category = safePath.substring('/api/object-atlas/'.length).split('?')[0];
    const atlasPath = path.join(WEBCLIENT_CACHE_DIR, 'objects', `${category}-atlas.png`);

    try {
      const content = await fsp.readFile(atlasPath);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Atlas not found for category: ${category}` }));
    }
    return;
  }

  // Object atlas manifest: /api/object-atlas/:category/manifest
  if (safePath.startsWith('/api/object-atlas/') && safePath.endsWith('/manifest')) {
    const category = safePath.substring('/api/object-atlas/'.length).replace('/manifest', '').split('?')[0];
    const manifestPath = path.join(WEBCLIENT_CACHE_DIR, 'objects', `${category}-atlas.json`);

    try {
      const content = await fsp.readFile(manifestPath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Atlas manifest not found for category: ${category}` }));
    }
    return;
  }

  // Terrain chunk endpoint: /api/terrain-chunk/:mapName/:terrainType/:season/:zoom/:chunkI/:chunkJ
  // Returns pre-rendered isometric terrain chunk as WebP at specified zoom level
  // Example: /api/terrain-chunk/Antiqua/Earth/2/3/31/31
  if (safePath.startsWith('/api/terrain-chunk/') && !safePath.endsWith('/manifest')) {
    const parts = safePath.substring('/api/terrain-chunk/'.length).split('/');

    if (parts.length < 6) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL format. Expected: /api/terrain-chunk/:mapName/:terrainType/:season/:zoom/:chunkI/:chunkJ' }));
      return;
    }

    const mapName = decodeURIComponent(parts[0]);
    const terrainType = decodeURIComponent(parts[1]);
    const season = parseInt(parts[2], 10);
    const zoomLevel = parseInt(parts[3], 10);
    const chunkI = parseInt(parts[4], 10);
    const chunkJ = parseInt(parts[5].split('?')[0], 10);

    if (isNaN(season) || season < 0 || season > 3 ||
        isNaN(zoomLevel) || zoomLevel < 0 || zoomLevel > 3 ||
        isNaN(chunkI) || isNaN(chunkJ) || chunkI < 0 || chunkJ < 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid parameters' }));
      return;
    }

    if (!terrainChunkRenderer().hasAtlas(terrainType, season)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Atlas not available for ${terrainType}/${season}` }));
      return;
    }

    try {
      const reqT0 = Date.now();
      const chunkPng = await terrainChunkRenderer().getChunk(mapName, terrainType, season, chunkI, chunkJ, zoomLevel);

      if (!chunkPng) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to generate chunk' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(chunkPng);
      const reqDt = Date.now() - reqT0;
      if (reqDt > 20) {
        console.log(`[TerrainChunk API] z${zoomLevel} ${chunkI},${chunkJ}: ${reqDt}ms (${(chunkPng.length / 1024).toFixed(0)} KB)`);
      }
    } catch (error: unknown) {
      console.error(`[TerrainChunk] Error generating chunk z${zoomLevel} ${chunkI},${chunkJ}:`, error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Terrain chunk manifest: /api/terrain-chunks/:mapName/:terrainType/:season/manifest
  // Returns JSON metadata about the chunk grid
  if (safePath.startsWith('/api/terrain-chunks/') && safePath.endsWith('/manifest')) {
    const parts = safePath.substring('/api/terrain-chunks/'.length).replace('/manifest', '').split('/');

    if (parts.length < 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL format' }));
      return;
    }

    const mapName = decodeURIComponent(parts[0]);
    const terrainType = decodeURIComponent(parts[1]);
    const season = parseInt(parts[2].split('?')[0], 10);

    if (isNaN(season) || season < 0 || season > 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid season (0-3)' }));
      return;
    }

    const manifest = terrainChunkRenderer().getChunkManifest(mapName, terrainType, season);

    if (!manifest) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Map data not available' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    });
    res.end(JSON.stringify(manifest));
    return;
  }

  // Terrain preview endpoint: /api/terrain-preview/:mapName/:terrainType/:season
  // Returns a low-res PNG of the entire map at Z0 scale — used as instant backdrop
  // while chunks stream in, eliminating blue triangle flicker at far zoom.
  if (safePath.startsWith('/api/terrain-preview/')) {
    const parts = safePath.substring('/api/terrain-preview/'.length).split('/');

    if (parts.length < 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Expected: /api/terrain-preview/:mapName/:terrainType/:season' }));
      return;
    }

    const mapName = decodeURIComponent(parts[0]);
    const terrainType = decodeURIComponent(parts[1]);
    const season = parseInt(parts[2].split('?')[0], 10);

    if (isNaN(season) || season < 0 || season > 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid season (0-3)' }));
      return;
    }

    try {
      const previewPng = await terrainChunkRenderer().getTerrainPreview(mapName, terrainType, season);

      if (!previewPng) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Preview not available' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(previewPng);
    } catch (error: unknown) {
      logger.error(`TerrainPreview error: ${toErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }

  // Terrain texture endpoint: /api/terrain-texture/:terrainType/:season/:paletteIndex
  // Season: 0=Winter, 1=Spring, 2=Summer, 3=Autumn
  // Example: /api/terrain-texture/Earth/2/128 (Summer, palette index 128)
  if (safePath.startsWith('/api/terrain-texture/')) {
    const parts = safePath.substring('/api/terrain-texture/'.length).split('/');

    if (parts.length < 3) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL format. Expected: /api/terrain-texture/:terrainType/:season/:paletteIndex' }));
      return;
    }

    const terrainType = decodeURIComponent(parts[0]);
    const season = parseInt(parts[1], 10);
    const paletteIndex = parseInt(parts[2].split('?')[0], 10);

    if (isNaN(season) || season < 0 || season > 3 || isNaN(paletteIndex)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid season (0-3) or palette index' }));
      return;
    }

    const texturePath = textureExtractor().getTexturePath(terrainType, season, paletteIndex);

    if (!texturePath) {
      // Return a 204 No Content for missing textures (client will use fallback color)
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const content = await fsp.readFile(texturePath);
      res.writeHead(200, {
        'Content-Type': getImageContentType(texturePath),
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
    } catch (error: unknown) {
      logger.warn(`Failed to serve texture ${texturePath}: ${toErrorMessage(error)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read texture file' }));
    }
    return;
  }

  // Research inventions endpoint: /api/research-inventions
  // Returns parsed invention data from research.0.dat for client-side name resolution
  if (safePath === '/api/research-inventions') {
    if (inventionIndexJson) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      });
      res.end(inventionIndexJson);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'research.0.dat not loaded' }));
    }
    return;
  }

  // Image proxy endpoint: /proxy-image?url=<encoded_url>
  if (safePath.startsWith(`${PROXY_IMAGE_ENDPOINT}?`)) {
    const urlParams = new URLSearchParams(safePath.split('?')[1]);
    const imageUrl = urlParams.get('url');

    if (!imageUrl) {
      res.writeHead(400);
      res.end('Missing url parameter');
      return;
    }

    // Rate limit proxy-image requests
    const clientIp = (req.socket.remoteAddress || '0.0.0.0').replace('::ffff:', '');
    if (!checkRateLimit(clientIp, 'proxy', RATE_LIMIT_MAX_PROXY)) {
      res.writeHead(429, { 'Content-Type': 'text/plain' });
      res.end('Too many requests');
      return;
    }

    await proxyImage(imageUrl, res);
    return;
  }

  // Cache endpoint: /cache/{category}/{filename}
  // Serves files from the update server cache (roads, buildings, etc.)
  // Prefers pre-baked PNG (with alpha) over original BMP when available
  if (safePath.startsWith('/cache/')) {
    const relativePath = safePath.substring('/cache/'.length);
    const filePath = path.join(CACHE_DIR, relativePath);

    // Security check: ensure path doesn't escape cache directory
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(path.normalize(CACHE_DIR))) {
      res.writeHead(403);
      res.end('Access Denied');
      return;
    }

    // Determine content type
    const contentTypes: Record<string, string> = {
      '.bmp': 'image/bmp',
      '.gif': 'image/gif',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
    };

    // If requesting a BMP, check if a pre-baked PNG exists (has alpha channel pre-applied)
    const ext = path.extname(filePath).toLowerCase();
    const pngPath = ext === '.bmp' ? filePath.replace(/\.bmp$/i, '.png') : null;

    // Try PNG first (async), fall back to original path
    let servePath = filePath;
    if (pngPath) {
      try {
        await fsp.access(pngPath);
        servePath = pngPath;
      } catch {
        // PNG doesn't exist, use original BMP path
      }
    }
    const serveExt = path.extname(servePath).toLowerCase();

    try {
      const content = await fsp.readFile(servePath);
      res.writeHead(200, {
        'Content-Type': contentTypes[serveExt] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Internal server error');
      }
    }
    return;
  }

  // Basic security check to prevent directory traversal
  if (safePath.includes('..')) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  // Map URL to local file
  let filePath = path.join(PUBLIC_DIR, safePath);

  // If requesting the JS bundle
  if (safePath === '/client.js') {
    filePath = path.join(PUBLIC_DIR, 'client.js');
  }

  const ext = path.extname(filePath);
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png'
  };

  try {
    const content = await fsp.readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
    res.end(content, 'utf-8');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      res.writeHead(404);
      res.end('File not found');
    } else {
      res.writeHead(500);
      res.end('Internal server error');
    }
  }
});

// 2. WebSocket Server
// Per-IP WebSocket connection tracking for rate limiting
const wsConnectionsPerIp = new Map<string, number>();
const WS_MAX_CONNECTIONS_PER_IP = 5;

const wss = new WebSocketServer({
  server,
  maxPayload: 64 * 1024, // 64KB max message size
  verifyClient: (info, callback) => {
    // Validate Origin header to prevent Cross-Site WebSocket Hijacking
    const origin = info.origin || info.req.headers.origin || '';
    const host = info.req.headers.host || '';

    // Allow same-origin connections and localhost development
    const allowedOrigins = [
      `http://${host}`,
      `https://${host}`,
      'http://localhost:8080',
      'http://127.0.0.1:8080',
    ];

    if (origin && !allowedOrigins.includes(origin)) {
      logger.warn(`[Gateway] WebSocket connection rejected: invalid origin "${origin}"`);
      callback(false, 403, 'Forbidden: invalid origin');
      return;
    }

    // Per-IP connection limit
    const ip = (info.req.socket.remoteAddress || '0.0.0.0').replace('::ffff:', '');
    const currentCount = wsConnectionsPerIp.get(ip) || 0;
    if (currentCount >= WS_MAX_CONNECTIONS_PER_IP) {
      logger.warn(`[Gateway] WebSocket connection rejected: too many connections from ${ip}`);
      callback(false, 429, 'Too many connections');
      return;
    }

    wsConnectionsPerIp.set(ip, currentCount + 1);
    callback(true);
  },
});

// GM Chat: track all connected WebSocket clients and their usernames
const connectedClients = new Map<WebSocket, string>(); // ws → username
const GM_USERNAMES = new Set((process.env.SPO_GM_USERS || 'admin').split(',').map(s => s.trim()));

wss.on('connection', (ws: WebSocket) => {
  console.log('[Gateway] New Client Connected');

  // Create a dedicated Starpeace Session for this connection
  const spSession = new StarpeaceSession();

  // Search Menu Service (will be initialized after login)
  let searchMenuService: SearchMenuService | null = null;
  let loginCredentials: { username: string; worldName: string; worldInfo: WorldInfo | undefined; companyId: string } | null = null;

  // -- Forward Events: Gateway -> Browser --
  spSession.on('ws_event', (payload: WsMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  });

  // -- Handle Requests: Browser -> Gateway --
  ws.on('message', async (data: string) => {
    try {
      const msg: WsMessage = JSON.parse(data.toString());

      // Capture login credentials for SearchMenuService
      if (msg.type === WsMessageType.REQ_LOGIN_WORLD) {
        const loginMsg = msg as WsReqLoginWorld;
        const worldInfo = spSession.getWorldInfo(loginMsg.worldName);
        loginCredentials = {
          username: loginMsg.username,
          worldName: loginMsg.worldName,
          worldInfo: worldInfo,
          companyId: '' // Will be set after company selection
        };
        // Track for GM chat broadcast
        connectedClients.set(ws, loginMsg.username);
      }

      // Capture company selection
      if (msg.type === WsMessageType.REQ_SELECT_COMPANY) {
        const companyMsg = msg as WsReqSelectCompany;
        if (loginCredentials) {
          loginCredentials.companyId = companyMsg.companyId;
        }
      } else if (msg.type === WsMessageType.REQ_SWITCH_COMPANY) {
        const switchMsg = msg as WsReqSwitchCompany;
        if (loginCredentials) {
          loginCredentials.companyId = switchMsg.company.id;
        }
      }

      await handleClientMessage(ws, spSession, searchMenuService, msg);

      // Initialize SearchMenuService after successful login response
      const isCompanySelection = msg.type === WsMessageType.REQ_SELECT_COMPANY || msg.type === WsMessageType.REQ_SWITCH_COMPANY;
      if (isCompanySelection && !searchMenuService && loginCredentials && loginCredentials.worldInfo) {
        setTimeout(() => {
          if (loginCredentials && loginCredentials.worldInfo && spSession) {
            const daAddr = spSession.getDAAddr();
            const daPort = spSession.getDAPort();

            if (daAddr && daPort) {
              searchMenuService = new SearchMenuService(
                loginCredentials.worldInfo.ip,
                loginCredentials.worldInfo.port || 80,
                loginCredentials.worldName,
                loginCredentials.username,
                loginCredentials.companyId, // Using companyId as companyName for now
                daAddr, // Use real DAAddr from session
                daPort // Use real DALockPort from session
              );
              console.log(`[Gateway] SearchMenuService initialized with DAAddr: ${daAddr}:${daPort}`);

              // Fetch Capitol coordinates from DirectoryMain.asp and push to client
              searchMenuService.getHomePage().then(categories => {
                const capitol = categories.find(c => c.label === 'Capitol' && c.enabled && c.x != null && c.y != null);
                const coords = capitol ? { x: capitol.x!, y: capitol.y! } : null;
                spSession.setCapitolCoords(coords);
                const resp: WsRespCapitolCoords = {
                  type: WsMessageType.RESP_CAPITOL_COORDS,
                  x: coords?.x ?? 0,
                  y: coords?.y ?? 0,
                  hasCapitol: coords !== null,
                };
                ws.send(JSON.stringify(resp));
                console.log(`[Gateway] Capitol coords: ${coords ? `${coords.x},${coords.y}` : 'none'}`);
              }).catch((err: unknown) => {
                console.error('[Gateway] Failed to fetch Capitol coords:', err);
              });
            } else {
              console.error('[Gateway] Failed to initialize SearchMenuService: DAAddr or DAPort not available');
            }
          }
        }, 500);
      }
    } catch (err: unknown) {
      console.error('[Gateway] Message Error:', err);
      const errorResp: WsRespError = {
        type: WsMessageType.RESP_ERROR,
        errorMessage: 'Invalid Message Format',
        code: ErrorCodes.ERROR_InvalidParameter
      };
      ws.send(JSON.stringify(errorResp));
    }
  });

  ws.on('close', async () => {
    console.log('[Gateway] Client Disconnected');
    connectedClients.delete(ws);

    // Decrement per-IP connection count
    const wsIp = (ws as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress?.replace('::ffff:', '') || '0.0.0.0';
    const count = wsConnectionsPerIp.get(wsIp) || 0;
    if (count <= 1) {
      wsConnectionsPerIp.delete(wsIp);
    } else {
      wsConnectionsPerIp.set(wsIp, count - 1);
    }
    // Send Logoff before cleanup to gracefully close game server session
    // Note: endSession() schedules socket closure 2 seconds after Logoff
    try {
      await spSession.endSession();
    } catch (err: unknown) {
      console.error('[Gateway] Error sending Logoff on close:', err);
    }
    spSession.destroy();
  });
});

/**
 * Message Router — dispatches to handler modules in ws-handlers/
 */
async function handleClientMessage(ws: WebSocket, session: StarpeaceSession, searchMenuService: SearchMenuService | null, msg: WsMessage) {
  // Rate limit authentication attempts
  const authTypes: string[] = [WsMessageType.REQ_AUTH_CHECK, WsMessageType.REQ_CONNECT_DIRECTORY];
  if (authTypes.includes(msg.type)) {
    const ip = (ws as unknown as { _socket?: { remoteAddress?: string } })._socket?.remoteAddress?.replace('::ffff:', '') || '0.0.0.0';
    if (!checkRateLimit(ip, 'auth', RATE_LIMIT_MAX_AUTH)) {
      const errorResp: WsRespError = {
        type: WsMessageType.RESP_ERROR,
        wsRequestId: msg.wsRequestId,
        errorMessage: 'Too many authentication attempts. Please try again later.',
        code: ErrorCodes.ERROR_Unknown
      };
      ws.send(JSON.stringify(errorResp));
      return;
    }
  }

  const handler = wsHandlerRegistry[msg.type as WsMessageType];
  if (!handler) {
    console.warn(`[Gateway] Unknown message type: ${msg.type}`);
    const errorResp: WsRespError = {
      type: WsMessageType.RESP_ERROR,
      wsRequestId: msg.wsRequestId,
      errorMessage: 'Unknown message type',
      code: ErrorCodes.ERROR_InvalidParameter
    };
    ws.send(JSON.stringify(errorResp));
    return;
  }

  try {
    await handler(
      { ws, session, searchMenuService, facilityDimensionsCache, inventionIndex, connectedClients, gmUsernames: GM_USERNAMES },
      msg,
    );
  } catch (err: unknown) {
    // Log full details server-side, send generic message to client
    console.error('[Gateway] Request Failed:', toErrorMessage(err));
    const errorResp: WsRespError = {
      type: WsMessageType.RESP_ERROR,
      wsRequestId: msg.wsRequestId,
      errorMessage: 'Internal server error',
      code: ErrorCodes.ERROR_Unknown
    };
    ws.send(JSON.stringify(errorResp));
  }
}

// Start Server
async function startServer() {
  try {
    // Start HTTP server FIRST so /api/startup-status SSE is reachable during cache building
    await new Promise<void>((resolve) => {
      server.listen(PORT, () => {
        console.log(`[Gateway] HTTP server listening on port ${PORT} (initializing...)`);
        resolve();
      });
    });

    // Setup graceful shutdown handlers (SIGTERM, SIGINT)
    setupGracefulShutdown(serviceRegistry, server);

    // Build in-memory caches with granular progress reporting via SSE
    const cacheSteps: import('./service-registry').CacheStepEntry[] = [
      { name: 'inventionIndex', label: 'Parsing research data', status: 'pending' },
      { name: 'imageIndex', label: 'Indexing image files', status: 'pending' },
      { name: 'iniCache', label: 'Loading configuration', status: 'pending' },
    ];

    const emitCacheProgress = (message: string) => {
      const pendingServices = serviceRegistry.getServiceNames().map(name => ({
        name,
        status: 'pending' as const,
        progress: 0,
      }));
      serviceRegistry.emit('startup-progress', {
        phase: 'initializing',
        progress: 0,
        message,
        services: pendingServices,
        cacheSteps: [...cacheSteps],
      } satisfies import('./service-registry').StartupProgressEvent);
    };

    console.log('[Gateway] Building caches...');
    emitCacheProgress('Building file indexes...');

    await Promise.all([
      (async () => {
        cacheSteps[0].status = 'running';
        emitCacheProgress('Parsing research data...');
        await loadInventionIndex();
        cacheSteps[0].status = 'complete';
        emitCacheProgress('Research data ready');
      })(),
      (async () => {
        cacheSteps[1].status = 'running';
        emitCacheProgress('Indexing image files...');
        await buildImageFileIndex();
        cacheSteps[1].status = 'complete';
        emitCacheProgress('Image index ready');
      })(),
      (async () => {
        cacheSteps[2].status = 'running';
        emitCacheProgress('Loading configuration...');
        await buildIniCache();
        cacheSteps[2].status = 'complete';
        emitCacheProgress('Configuration ready');
      })(),
    ]);

    // Initialize services — facilities/textures/mapData run in parallel (same depth)
    console.log('[Gateway] Initializing services...');
    await serviceRegistry.initialize();

    // Log service-specific statistics
    const updateStats = serviceRegistry.get<UpdateService>('update').getStats();
    console.log(`[Gateway] Update service: ${updateStats.downloaded} downloaded, ${updateStats.extracted} CAB extracted, ${updateStats.skipped} skipped, ${updateStats.failed} failed`);

    const facilityStats = facilityDimensionsCache().getStats();
    console.log(`[Gateway] Facility cache: ${facilityStats.total} facilities loaded`);

    const textureStats = textureExtractor().getStats() as Array<{ terrainType: string; seasonName: string; textureCount: number }>;
    console.log(`[Gateway] Texture extractor: ${textureStats.length} terrain/season combinations`);
    textureStats.forEach(s => console.log(`  - ${s.terrainType}/${s.seasonName}: ${s.textureCount} textures`));

    console.log(`[Gateway] Server ready at http://localhost:${PORT}`);
  } catch (error: unknown) {
    console.error('[Gateway] Failed to start server:', error);
    process.exit(1);
  }
}

// Global error handlers to prevent process crashes
process.on('uncaughtException', (error: Error) => {
  logger.error('[Gateway] Uncaught exception:', error);
  // Continue running - don't crash the server
});

process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
  logger.error('[Gateway] Unhandled promise rejection:', reason);
  // Continue running - don't crash the server
});

startServer();
