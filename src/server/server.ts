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
  WsMessage,
  FacilityDimensions,
  WorldInfo,
  WsReqConnectDirectory,
  WsReqLoginWorld,
  WsReqRdoDirect,
  WsRespConnectSuccess,
  WsRespLoginSuccess,
  WsRespRdoResult,
  WsRespError,
  WsReqMapLoad,
  WsRespMapData,
  WsReqSelectCompany,
  WsReqSwitchCompany,
  WsReqManageConstruction,
  WsRespConstructionSuccess,
  WsReqChatGetUsers,
  WsReqChatGetChannels,
  WsReqChatGetChannelInfo,
  WsReqChatJoinChannel,
  WsReqChatSendMessage,
  WsReqChatTypingStatus,
  WsReqGmChatSend,
  WsEventChatMsg,
  WsRespChatUserList,
  WsRespChatChannelList,
  WsRespChatChannelInfo,
  WsRespChatSuccess,
  WsReqBuildingFocus,
  WsReqBuildingUnfocus,
  WsRespBuildingFocus,
  WsEventBuildingRefresh,
  BuildingFocusInfo,
  WsReqGetBuildingCategories,
  WsReqGetBuildingFacilities,
  WsReqPlaceBuilding,
  WsReqGetSurface,
  WsRespBuildingCategories,
  WsRespBuildingFacilities,
  WsRespBuildingPlaced,
  WsRespSurfaceData,
  WsReqGetAllFacilityDimensions,
  WsRespAllFacilityDimensions,
  // Building Details
  WsReqBuildingDetails,
  WsRespBuildingDetails,
  WsReqBuildingSetProperty,
  WsRespBuildingSetProperty,
  // Building Upgrades
  WsReqBuildingUpgrade,
  WsRespBuildingUpgrade,
  // Building Rename
  WsReqRenameFacility,
  WsRespRenameFacility,
  // Building Deletion
  WsReqDeleteFacility,
  WsRespDeleteFacility,
  // Road Building
  WsReqBuildRoad,
  WsRespBuildRoad,
  WsReqGetRoadCost,
  WsRespGetRoadCost,
  // Road Demolition
  WsReqDemolishRoad,
  WsRespDemolishRoad,
  // Search Menu
  WsReqSearchMenuHome,
  WsRespSearchMenuHome,
  WsReqSearchMenuTowns,
  WsRespSearchMenuTowns,
  WsReqSearchMenuTycoonProfile,
  WsRespSearchMenuTycoonProfile,
  WsReqSearchMenuPeople,
  WsRespSearchMenuPeople,
  WsReqSearchMenuPeopleSearch,
  WsRespSearchMenuPeopleSearch,
  WsReqSearchMenuRankings,
  WsRespSearchMenuRankings,
  WsReqSearchMenuRankingDetail,
  WsRespSearchMenuRankingDetail,
  WsReqSearchMenuBanks,
  WsRespSearchMenuBanks,
  // Logout
  WsReqLogout,
  WsRespLogout,
  // Mail
  WsReqMailConnect,
  WsReqMailGetFolder,
  WsReqMailReadMessage,
  WsReqMailCompose,
  WsReqMailDelete,
  WsReqMailGetUnreadCount,
  WsRespMailConnected,
  WsRespMailFolder,
  WsRespMailMessage,
  WsRespMailSent,
  WsRespMailDeleted,
  WsRespMailUnreadCount,
  WsReqMailSaveDraft,
  WsRespMailDraftSaved,
  // Profile
  WsReqGetProfile,
  WsRespGetProfile,
  // Profile Tabs
  WsReqProfileBankAction,
  WsRespProfileCurriculum,
  WsRespProfileBank,
  WsRespProfileBankAction,
  WsRespProfileProfitLoss,
  WsRespProfileCompanies,
  WsRespProfileAutoConnections,
  WsReqProfileAutoConnectionAction,
  WsRespProfileAutoConnectionAction,
  WsRespProfilePolicy,
  WsReqProfilePolicySet,
  WsRespProfilePolicySet,
  WsReqPoliticsData,
  WsRespPoliticsData,
  WsReqPoliticsVote,
  WsRespPoliticsVote,
  WsReqPoliticsLaunchCampaign,
  WsRespPoliticsLaunchCampaign,
  WsReqSearchConnections,
  WsRespSearchConnections,
  WsReqCreateCompany,
  WsRespCreateCompany,
  BankActionType,
  AutoConnectionActionType,
} from '../shared/types';
import { toErrorMessage } from '../shared/error-utils';

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
serviceRegistry.register('update', new UpdateService());

// Facility dimensions cache - depends on update service (needs CLASSES.BIN)
serviceRegistry.register('facilities', new FacilityDimensionsCache(), {
  dependsOn: ['update']
});

// Texture extractor - depends on update service (needs CAB archives)
serviceRegistry.register('textures', new TextureExtractor(), {
  dependsOn: ['update']
});

// Map data service - depends on update service (needs map files)
serviceRegistry.register('mapData', new MapDataService(), {
  dependsOn: ['update']
});

// Terrain chunk renderer - depends on textures and mapData (needs atlas + map BMP data)
serviceRegistry.register('terrainChunks', new TerrainChunkRenderer(), {
  dependsOn: ['textures', 'mapData']
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
function buildImageFileIndex(): void {
  imageFileIndex.clear();
  const CACHE_ROOT = path.join(__dirname, '../../cache');

  // Index files in update server cache subdirectories
  if (fs.existsSync(CACHE_ROOT)) {
    const entries = fs.readdirSync(CACHE_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(CACHE_ROOT, entry.name);
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          imageFileIndex.set(file.toLowerCase(), path.join(dirPath, file));
        }
      }
    }
  }

  // Index files in webclient-cache
  if (fs.existsSync(WEBCLIENT_CACHE_DIR)) {
    const files = fs.readdirSync(WEBCLIENT_CACHE_DIR);
    for (const file of files) {
      // Don't overwrite update server entries (they have priority)
      const key = file.toLowerCase();
      if (!imageFileIndex.has(key)) {
        imageFileIndex.set(key, path.join(WEBCLIENT_CACHE_DIR, file));
      }
    }
  }

  logger.info(`Image file index built: ${imageFileIndex.size} files`);
}

// Build index at startup (synchronous, runs once)
buildImageFileIndex();

// =============================================================================
// In-memory INI cache (road, concrete, car block classes)
// =============================================================================
interface IniFileCache {
  files: Array<{ filename: string; content: string }>;
}

const iniCache: Record<string, IniFileCache> = {};

function buildIniCache(): void {
  const dirs: Record<string, string> = {
    roadBlockClasses: path.join(CACHE_DIR, 'RoadBlockClasses'),
    concreteBlockClasses: path.join(CACHE_DIR, 'ConcreteClasses'),
    carClasses: path.join(CACHE_DIR, 'CarClasses'),
  };

  for (const [key, dirPath] of Object.entries(dirs)) {
    if (!fs.existsSync(dirPath)) {
      iniCache[key] = { files: [] };
      continue;
    }
    const files = fs.readdirSync(dirPath).filter(f => f.toLowerCase().endsWith('.ini'));
    const iniContents: Array<{ filename: string; content: string }> = [];
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      iniContents.push({ filename: file, content });
    }
    iniCache[key] = { files: iniContents };
  }

  logger.info(`INI cache built: road=${iniCache.roadBlockClasses.files.length}, concrete=${iniCache.concreteBlockClasses.files.length}, car=${iniCache.carClasses.files.length}`);
}

// Build INI cache at startup
buildIniCache();

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
  // Handle local file:// URLs
  if (imageUrl.startsWith('file://')) {
    const localPath = imageUrl.substring('file://'.length);
    try {
      const content = await fsp.readFile(localPath);
      res.writeHead(200, { 'Content-Type': getImageContentType(localPath) });
      res.end(content);
      return;
    } catch {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
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
  } catch (error) {
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

// 1. HTTP Server for Static Files + Image Proxy
const server = http.createServer(async (req, res) => {
  const safePath = req.url === '/' ? '/index.html' : req.url || '/index.html';

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
      res.end(JSON.stringify({ error: toErrorMessage(error) || 'Failed to load map data' }));
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
  // Returns pre-rendered isometric terrain chunk as PNG at specified zoom level
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
        'Content-Type': 'image/png',
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

  // Image proxy endpoint: /proxy-image?url=<encoded_url>
  if (safePath.startsWith(`${PROXY_IMAGE_ENDPOINT}?`)) {
    const urlParams = new URLSearchParams(safePath.split('?')[1]);
    const imageUrl = urlParams.get('url');

    if (!imageUrl) {
      res.writeHead(400);
      res.end('Missing url parameter');
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
        res.end(`File not found: ${relativePath}`);
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + code);
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

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
      res.end(content, 'utf-8');
    }
  });
});

// 2. WebSocket Server
const wss = new WebSocketServer({ server });

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
            } else {
              console.error('[Gateway] Failed to initialize SearchMenuService: DAAddr or DAPort not available');
            }
          }
        }, 500);
      }
    } catch (err) {
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
    // Send Logoff before cleanup to gracefully close game server session
    // Note: endSession() schedules socket closure 2 seconds after Logoff
    try {
      await spSession.endSession();
    } catch (err) {
      console.error('[Gateway] Error sending Logoff on close:', err);
    }
    spSession.destroy();
  });
});

/**
 * Message Router
 */
async function handleClientMessage(ws: WebSocket, session: StarpeaceSession, searchMenuService: SearchMenuService | null, msg: WsMessage) {
  try {
    switch (msg.type) {
      case WsMessageType.REQ_CONNECT_DIRECTORY: {
        console.log('[Gateway] Connecting to Directory...');
        const req = msg as WsReqConnectDirectory;
        
        if (!req.username || !req.password) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Username and Password required for Directory connection',
            code: ErrorCodes.ERROR_InvalidLogonData
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        const worlds = await session.connectDirectory(req.username, req.password, req.zonePath);
        const response: WsRespConnectSuccess = {
          type: WsMessageType.RESP_CONNECT_SUCCESS,
          wsRequestId: msg.wsRequestId,
          worlds
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_LOGIN_WORLD: {
        const req = msg as WsReqLoginWorld;
        console.log(`[Gateway] Logging into world: ${req.worldName}`);

        // 1. Lookup world info from session's cached directory data
        const worldInfo = session.getWorldInfo(req.worldName);
        if (!worldInfo) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: `World '${req.worldName}' not found in session cache. Did you connect to Directory first?`,
            code: ErrorCodes.ERROR_UnknownCluster
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        // 2. Connect
        const result = await session.loginWorld(req.username, req.password, worldInfo);
        const response: WsRespLoginSuccess = {
          type: WsMessageType.RESP_LOGIN_SUCCESS,
          wsRequestId: msg.wsRequestId,
          tycoonId: result.tycoonId,
          contextId: result.contextId,
          companyCount: result.companies.length,
          companies: result.companies,
          worldXSize: result.worldXSize ?? undefined,
          worldYSize: result.worldYSize ?? undefined,
          worldSeason: result.worldSeason ?? undefined,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_SELECT_COMPANY: {
        const req = msg as WsReqSelectCompany;
        console.log(`[Gateway] Selecting company: ${req.companyId}`);
        await session.selectCompany(req.companyId);

        // Send success response with player's saved position
        const playerPos = session.getPlayerPosition();
        const response: WsMessage & { playerX?: number; playerY?: number } = {
          type: WsMessageType.RESP_RDO_RESULT,
          wsRequestId: msg.wsRequestId,
          playerX: playerPos.x || undefined,
          playerY: playerPos.y || undefined,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_SWITCH_COMPANY: {
        const req = msg as WsReqSwitchCompany;
        console.log(`[Gateway] Switching company: ${req.company.name} (role: ${req.company.ownerRole})`);
        await session.switchCompany(req.company);

        // Send success response
        const response: WsMessage = {
          type: WsMessageType.RESP_RDO_RESULT,
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_MAP_LOAD: {
		  const mapReq = msg as WsReqMapLoad;
		  
		  // If coordinates are 0,0, use player's last known position
		  let targetX = mapReq.x;
		  let targetY = mapReq.y;
		  
		  if (targetX === 0 && targetY === 0) {
			const playerPos = session.getPlayerPosition();
			targetX = playerPos.x;
			targetY = playerPos.y;
			console.log(`[Gateway] Using player spawn position: (${targetX}, ${targetY})`);
		  }
		  
		  const mapData = await session.loadMapArea(
			targetX,
			targetY,
			mapReq.width,
			mapReq.height
		  );
		  
		  const response: WsRespMapData = {
			type: WsMessageType.RESP_MAP_DATA,
			wsRequestId: msg.wsRequestId,
			data: mapData
		  };
		  ws.send(JSON.stringify(response));
		  break;
		}

      case WsMessageType.REQ_RDO_DIRECT: {
        const req = msg as WsReqRdoDirect;
        // Execute arbitrary RDO command requested by UI
        // Security Note: In production, whitelist allowed commands.
        const result = await session.executeRdo('world', {
          verb: req.verb,
          targetId: req.targetId,
          action: req.action,
          member: req.member,
          args: req.args
        });

        const response: WsRespRdoResult = {
          type: WsMessageType.RESP_RDO_RESULT,
          wsRequestId: msg.wsRequestId,
          result
        };
        ws.send(JSON.stringify(response));
        break;
      }

      // NEW [HIGH-03]: Construction management
      case WsMessageType.REQ_MANAGE_CONSTRUCTION: {
        const req = msg as WsReqManageConstruction;
        console.log(`[WS] Construction request: ${req.action} at (${req.x}, ${req.y})`);

        const result = await session.manageConstruction(
          req.x,
          req.y,
          req.action,
          req.count || 1
        );

        if (result.status === 'OK') {
          const response: WsRespConstructionSuccess = {
            type: WsMessageType.RESP_CONSTRUCTION_SUCCESS,
            wsRequestId: msg.wsRequestId,
            action: req.action,
            x: req.x,
            y: req.y
          };
          ws.send(JSON.stringify(response));
        } else {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: result.error || 'Construction operation failed',
            code: ErrorCodes.ERROR_RequestDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }
	  
	        // Chat functionality
      case WsMessageType.REQ_CHAT_GET_USERS: {
        console.log('[Gateway] Getting chat user list');
        const users = await session.getChatUserList();
        const response: WsRespChatUserList = {
          type: WsMessageType.RESP_CHAT_USER_LIST,
          wsRequestId: msg.wsRequestId,
          users
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_GET_CHANNELS: {
        console.log('[Gateway] Getting chat channel list');
        const channels = await session.getChatChannelList();
        const response: WsRespChatChannelList = {
          type: WsMessageType.RESP_CHAT_CHANNEL_LIST,
          wsRequestId: msg.wsRequestId,
          channels
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_GET_CHANNEL_INFO: {
        const req = msg as WsReqChatGetChannelInfo;
        console.log(`[Gateway] Getting channel info: ${req.channelName}`);
        const info = await session.getChatChannelInfo(req.channelName);
        const response: WsRespChatChannelInfo = {
          type: WsMessageType.RESP_CHAT_CHANNEL_INFO,
          wsRequestId: msg.wsRequestId,
          info
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_JOIN_CHANNEL: {
        const req = msg as WsReqChatJoinChannel;
        console.log(`[Gateway] Joining channel: ${req.channelName || 'Lobby'}`);
        await session.joinChatChannel(req.channelName);
        const response: WsRespChatSuccess = {
          type: WsMessageType.RESP_CHAT_SUCCESS,
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_SEND_MESSAGE: {
        const req = msg as WsReqChatSendMessage;
        await session.sendChatMessage(req.message);
        const response: WsRespChatSuccess = {
          type: WsMessageType.RESP_CHAT_SUCCESS,
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_CHAT_TYPING_STATUS: {
        const req = msg as WsReqChatTypingStatus;
        await session.setChatTypingStatus(req.isTyping);
        // No response needed for typing status
        break;
      }

      case WsMessageType.REQ_GM_CHAT_SEND: {
        const gmReq = msg as WsReqGmChatSend;
        const senderName = connectedClients.get(ws) || 'Unknown';
        if (!GM_USERNAMES.has(senderName)) {
          ws.send(JSON.stringify({
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            error: 'Only Game Masters can send GM messages',
          }));
          break;
        }
        // Broadcast to all connected clients
        const gmEvent: WsEventChatMsg = {
          type: WsMessageType.EVENT_CHAT_MSG,
          channel: 'GM',
          from: senderName,
          message: gmReq.message,
          isGM: true,
        };
        const gmPayload = JSON.stringify(gmEvent);
        for (const [clientWs] of connectedClients) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(gmPayload);
          }
        }
        break;
      }

		case WsMessageType.REQ_BUILDING_FOCUS:
        const focusReq = msg as WsReqBuildingFocus;
        console.log(`[Gateway] Focusing building at (${focusReq.x}, ${focusReq.y})`);
        
        try {
          const buildingInfo = await session.focusBuilding(focusReq.x, focusReq.y);
          const focusResp: WsRespBuildingFocus = {
            type: WsMessageType.RESP_BUILDING_FOCUS,
            wsRequestId: msg.wsRequestId,
            building: buildingInfo
          };
          
          console.log(`[Gateway] Sending building focus response:`, {
            buildingId: buildingInfo.buildingId,
            name: buildingInfo.buildingName,
            wsRequestId: msg.wsRequestId
          });
          
          ws.send(JSON.stringify(focusResp));
        } catch (focusErr: unknown) {
          console.error(`[Gateway] Building focus error:`, toErrorMessage(focusErr));
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(focusErr) || 'Failed to focus building',
            code: ErrorCodes.ERROR_FacilityNotFound
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
		
		case WsMessageType.REQ_BUILDING_UNFOCUS:
        console.log(`[Gateway] Unfocusing building`);
        await session.unfocusBuilding();
        const unfocusResp: WsMessage = {
          type: WsMessageType.RESP_CHAT_SUCCESS, // Reuse generic success
          wsRequestId: msg.wsRequestId
        };
        ws.send(JSON.stringify(unfocusResp));
        break;

      // Building Construction Feature
      case WsMessageType.REQ_GET_BUILDING_CATEGORIES: {
        const req = msg as WsReqGetBuildingCategories;
        console.log(`[Gateway] Fetching building categories for company: ${req.companyName}`);

        try {
          const categories = await session.fetchBuildingCategories(req.companyName);
          const response: WsRespBuildingCategories = {
            type: WsMessageType.RESP_BUILDING_CATEGORIES,
            wsRequestId: msg.wsRequestId,
            categories
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch building categories',
            code: ErrorCodes.ERROR_UnknownClass
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_GET_BUILDING_FACILITIES: {
        const req = msg as WsReqGetBuildingFacilities;
        console.log(`[Gateway] Fetching facilities for category: ${req.kindName}`);

        try {
          const facilities = await session.fetchBuildingFacilities(
            req.companyName,
            req.cluster,
            req.kind,
            req.kindName,
            req.folder,
            req.tycoonLevel
          );
          const response: WsRespBuildingFacilities = {
            type: WsMessageType.RESP_BUILDING_FACILITIES,
            wsRequestId: msg.wsRequestId,
            facilities
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch building facilities',
            code: ErrorCodes.ERROR_UnknownClass
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_PLACE_BUILDING: {
        const req = msg as WsReqPlaceBuilding;
        console.log(`[Gateway] Placing building: ${req.facilityClass} at (${req.x}, ${req.y})`);

        try {
          const result = await session.placeBuilding(req.facilityClass, req.x, req.y);

          if (result.success) {
            const response: WsRespBuildingPlaced = {
              type: WsMessageType.RESP_BUILDING_PLACED,
              wsRequestId: msg.wsRequestId,
              x: req.x,
              y: req.y,
              buildingId: result.buildingId || ''
            };
            ws.send(JSON.stringify(response));
          } else {
            const errorResp: WsRespError = {
              type: WsMessageType.RESP_ERROR,
              wsRequestId: msg.wsRequestId,
              errorMessage: 'Failed to place building - check placement location and requirements',
              code: ErrorCodes.ERROR_AreaNotClear
            };
            ws.send(JSON.stringify(errorResp));
          }
        } catch (err: unknown) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to place building',
            code: ErrorCodes.ERROR_CannotInstantiate
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_GET_SURFACE: {
        const req = msg as WsReqGetSurface;
        console.log(`[Gateway] Getting surface data: ${req.surfaceType} for area (${req.x1},${req.y1}) to (${req.x2},${req.y2})`);

        try {
          const data = await session.getSurfaceData(
            req.surfaceType,
            req.x1,
            req.y1,
            req.x2,
            req.y2
          );
          const response: WsRespSurfaceData = {
            type: WsMessageType.RESP_SURFACE_DATA,
            wsRequestId: msg.wsRequestId,
            data
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to get surface data',
            code: ErrorCodes.ERROR_InvalidParameter
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_GET_ALL_FACILITY_DIMENSIONS: {
        console.log('[Gateway] Getting all facility dimensions (preload)');

        try {
          // Get all facilities as FacilityDimensions objects for client preload
          const dimensions = facilityDimensionsCache().getAllFacilitiesAsObject();

          const response: WsRespAllFacilityDimensions = {
            type: WsMessageType.RESP_ALL_FACILITY_DIMENSIONS,
            wsRequestId: msg.wsRequestId,
            dimensions
          };

          console.log(`[Gateway] Sending ${Object.keys(dimensions).length} facility dimensions`);
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to get all facility dimensions',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      // =========================================================================
      // BUILDING DETAILS FEATURE
      // =========================================================================

      case WsMessageType.REQ_BUILDING_DETAILS: {
        const req = msg as WsReqBuildingDetails;
        console.log(`[Gateway] Getting building details at (${req.x}, ${req.y}), visualClass: ${req.visualClass}`);

        try {
          const details = await session.getBuildingDetails(req.x, req.y, req.visualClass);

          const response: WsRespBuildingDetails = {
            type: WsMessageType.RESP_BUILDING_DETAILS,
            wsRequestId: msg.wsRequestId,
            details
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to get building details:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to get building details',
            code: ErrorCodes.ERROR_FacilityNotFound
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_BUILDING_SET_PROPERTY: {
        const req = msg as WsReqBuildingSetProperty;
        console.log(`[Gateway] Setting building property ${req.propertyName}=${req.value} at (${req.x}, ${req.y})`);

        try {
          const result = await session.setBuildingProperty(
            req.x,
            req.y,
            req.propertyName,
            req.value,
            req.additionalParams
          );

          const response: WsRespBuildingSetProperty = {
            type: WsMessageType.RESP_BUILDING_SET_PROPERTY,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            propertyName: req.propertyName,
            newValue: result.newValue
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to set building property:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to set property',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_BUILDING_UPGRADE: {
        const req = msg as WsReqBuildingUpgrade;
        console.log(`[Gateway] Building upgrade action: ${req.action} at (${req.x}, ${req.y}), count: ${req.count || 'N/A'}`);

        try {
          const result = await session.upgradeBuildingAction(
            req.x,
            req.y,
            req.action,
            req.count
          );

          const response: WsRespBuildingUpgrade = {
            type: WsMessageType.RESP_BUILDING_UPGRADE,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            action: req.action,
            message: result.message
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to perform upgrade action:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to perform upgrade action',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_RENAME_FACILITY: {
        const req = msg as WsReqRenameFacility;
        console.log(`[Gateway] Rename facility at (${req.x}, ${req.y}) to: "${req.newName}"`);

        try {
          const result = await session.renameFacility(req.x, req.y, req.newName);

          const response: WsRespRenameFacility = {
            type: WsMessageType.RESP_RENAME_FACILITY,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            newName: req.newName,
            message: result.message
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to rename facility:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to rename facility',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_DELETE_FACILITY: {
        const req = msg as WsReqDeleteFacility;
        console.log(`[Gateway] Delete facility at (${req.x}, ${req.y})`);

        try {
          const result = await session.deleteFacility(req.x, req.y);

          const response: WsRespDeleteFacility = {
            type: WsMessageType.RESP_DELETE_FACILITY,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            message: result.message
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to delete facility:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to delete facility',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      // ========================================================================
      // ROAD BUILDING HANDLERS
      // ========================================================================

      case WsMessageType.REQ_BUILD_ROAD: {
        const req = msg as WsReqBuildRoad;
        console.log(`[Gateway] Build road from (${req.x1}, ${req.y1}) to (${req.x2}, ${req.y2})`);

        try {
          const result = await session.buildRoad(req.x1, req.y1, req.x2, req.y2);

          const response: WsRespBuildRoad = {
            type: WsMessageType.RESP_BUILD_ROAD,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            cost: result.cost,
            tileCount: result.tileCount,
            message: result.message,
            errorCode: result.errorCode
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to build road:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to build road',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_GET_ROAD_COST: {
        const req = msg as WsReqGetRoadCost;
        console.log(`[Gateway] Get road cost from (${req.x1}, ${req.y1}) to (${req.x2}, ${req.y2})`);

        try {
          const result = session.getRoadCostEstimate(req.x1, req.y1, req.x2, req.y2);

          const response: WsRespGetRoadCost = {
            type: WsMessageType.RESP_GET_ROAD_COST,
            wsRequestId: msg.wsRequestId,
            cost: result.cost,
            tileCount: result.tileCount,
            costPerTile: result.costPerTile
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to get road cost:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to get road cost',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_DEMOLISH_ROAD: {
        const req = msg as WsReqDemolishRoad;
        console.log(`[Gateway] Demolish road at (${req.x}, ${req.y})`);

        try {
          const result = await session.demolishRoad(req.x, req.y);

          const response: WsRespDemolishRoad = {
            type: WsMessageType.RESP_DEMOLISH_ROAD,
            wsRequestId: msg.wsRequestId,
            success: result.success,
            message: result.message,
            errorCode: result.errorCode
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to demolish road:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to demolish road',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      // ========================================================================
      // COMPANY CREATION
      // ========================================================================

      case WsMessageType.REQ_CREATE_COMPANY: {
        const req = msg as WsReqCreateCompany;
        console.log(`[Gateway] Creating company: "${req.companyName}" in cluster "${req.cluster}"`);

        if (!req.companyName || req.companyName.trim().length === 0) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Company name cannot be empty',
            code: ErrorCodes.ERROR_InvalidParameter
          };
          ws.send(JSON.stringify(errorResp));
          break;
        }

        try {
          const result = await session.createCompany(req.companyName.trim(), req.cluster);

          if (result.success) {
            const response: WsRespCreateCompany = {
              type: WsMessageType.RESP_CREATE_COMPANY,
              wsRequestId: msg.wsRequestId,
              success: true,
              companyName: result.companyName,
              companyId: result.companyId,
            };
            ws.send(JSON.stringify(response));
          } else {
            const errorResp: WsRespError = {
              type: WsMessageType.RESP_ERROR,
              wsRequestId: msg.wsRequestId,
              errorMessage: result.message || 'Failed to create company',
              code: ErrorCodes.ERROR_Unknown
            };
            ws.send(JSON.stringify(errorResp));
          }
        } catch (err: unknown) {
          console.error('[Gateway] Failed to create company:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to create company',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      // ========================================================================
      // SEARCH MENU HANDLERS
      // ========================================================================

      case WsMessageType.REQ_SEARCH_MENU_HOME: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const categories = await searchMenuService.getHomePage();
          const response: WsRespSearchMenuHome = {
            type: WsMessageType.RESP_SEARCH_MENU_HOME,
            wsRequestId: msg.wsRequestId,
            categories
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to fetch search menu home:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch search menu',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_TOWNS: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const towns = await searchMenuService.getTowns();
          const response: WsRespSearchMenuTowns = {
            type: WsMessageType.RESP_SEARCH_MENU_TOWNS,
            wsRequestId: msg.wsRequestId,
            towns
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to fetch towns:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch towns',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_TYCOON_PROFILE: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        const req = msg as WsReqSearchMenuTycoonProfile;
        try {
          const profile = await searchMenuService.getTycoonProfile(req.tycoonName);
          const response: WsRespSearchMenuTycoonProfile = {
            type: WsMessageType.RESP_SEARCH_MENU_TYCOON_PROFILE,
            wsRequestId: msg.wsRequestId,
            profile
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to fetch tycoon profile:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch tycoon profile',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_PEOPLE: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const response: WsRespSearchMenuPeople = {
            type: WsMessageType.RESP_SEARCH_MENU_PEOPLE,
            wsRequestId: msg.wsRequestId
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to fetch people page:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch people page',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_PEOPLE_SEARCH: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        const req = msg as WsReqSearchMenuPeopleSearch;
        try {
          const results = await searchMenuService.searchPeople(req.searchStr);
          const response: WsRespSearchMenuPeopleSearch = {
            type: WsMessageType.RESP_SEARCH_MENU_PEOPLE_SEARCH,
            wsRequestId: msg.wsRequestId,
            results
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to search people:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to search people',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_RANKINGS: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const categories = await searchMenuService.getRankings();
          const response: WsRespSearchMenuRankings = {
            type: WsMessageType.RESP_SEARCH_MENU_RANKINGS,
            wsRequestId: msg.wsRequestId,
            categories
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to fetch rankings:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch rankings',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_RANKING_DETAIL: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        const req = msg as WsReqSearchMenuRankingDetail;
        try {
          const result = await searchMenuService.getRankingDetail(req.rankingPath);
          const response: WsRespSearchMenuRankingDetail = {
            type: WsMessageType.RESP_SEARCH_MENU_RANKING_DETAIL,
            wsRequestId: msg.wsRequestId,
            title: result.title,
            entries: result.entries
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to fetch ranking detail:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch ranking detail',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      case WsMessageType.REQ_SEARCH_MENU_BANKS: {
        if (!searchMenuService) {
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: 'Search menu not available. Please log in first.',
            code: ErrorCodes.ERROR_AccessDenied
          };
          ws.send(JSON.stringify(errorResp));
          return;
        }

        try {
          const banks = await searchMenuService.getBanks();
          const response: WsRespSearchMenuBanks = {
            type: WsMessageType.RESP_SEARCH_MENU_BANKS,
            wsRequestId: msg.wsRequestId,
            banks
          };
          ws.send(JSON.stringify(response));
        } catch (err: unknown) {
          console.error('[Gateway] Failed to fetch banks:', err);
          const errorResp: WsRespError = {
            type: WsMessageType.RESP_ERROR,
            wsRequestId: msg.wsRequestId,
            errorMessage: toErrorMessage(err) || 'Failed to fetch banks',
            code: ErrorCodes.ERROR_Unknown
          };
          ws.send(JSON.stringify(errorResp));
        }
        break;
      }

      // ========================================================================
      // LOGOUT HANDLER
      // ========================================================================

      case WsMessageType.REQ_LOGOUT: {
        console.log('[Gateway] Processing logout request');

        try {
          // Send Logoff to gracefully close game server session
          await session.endSession();

          const response: WsRespLogout = {
            type: WsMessageType.RESP_LOGOUT,
            wsRequestId: msg.wsRequestId,
            success: true,
            message: 'Logged out successfully'
          };
          ws.send(JSON.stringify(response));

          // Close WebSocket connection after sending response
          setTimeout(() => {
            ws.close(1000, 'User logged out');
          }, 100);
        } catch (err: unknown) {
          console.error('[Gateway] Logout error:', err);
          const response: WsRespLogout = {
            type: WsMessageType.RESP_LOGOUT,
            wsRequestId: msg.wsRequestId,
            success: false,
            message: toErrorMessage(err) || 'Logout failed'
          };
          ws.send(JSON.stringify(response));
        }
        break;
      }

      // =================================================================
      // MAIL
      // =================================================================

      case WsMessageType.REQ_MAIL_CONNECT: {
        console.log('[Gateway] Connecting to Mail Service...');
        await session.connectMailService();
        const unreadCount = await session.getMailUnreadCount();
        const response: WsRespMailConnected = {
          type: WsMessageType.RESP_MAIL_CONNECTED,
          wsRequestId: msg.wsRequestId,
          unreadCount,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_MAIL_GET_FOLDER: {
        const mailFolderReq = msg as WsReqMailGetFolder;
        console.log(`[Gateway] Getting mail folder: ${mailFolderReq.folder}`);
        const messages = await session.getMailFolder(mailFolderReq.folder);
        const response: WsRespMailFolder = {
          type: WsMessageType.RESP_MAIL_FOLDER,
          wsRequestId: msg.wsRequestId,
          folder: mailFolderReq.folder,
          messages,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_MAIL_READ_MESSAGE: {
        const readReq = msg as WsReqMailReadMessage;
        console.log(`[Gateway] Reading mail: ${readReq.folder}/${readReq.messageId}`);
        const message = await session.readMailMessage(readReq.folder, readReq.messageId);
        const response: WsRespMailMessage = {
          type: WsMessageType.RESP_MAIL_MESSAGE,
          wsRequestId: msg.wsRequestId,
          message,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_MAIL_COMPOSE: {
        const composeReq = msg as WsReqMailCompose;
        console.log(`[Gateway] Composing mail to: ${composeReq.to}`);
        const success = await session.composeMail(composeReq.to, composeReq.subject, composeReq.body, composeReq.headers);
        const response: WsRespMailSent = {
          type: WsMessageType.RESP_MAIL_SENT,
          wsRequestId: msg.wsRequestId,
          success,
          message: success ? 'Message sent' : 'Failed to send message',
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_MAIL_SAVE_DRAFT: {
        const saveDraftReq = msg as WsReqMailSaveDraft;
        console.log(`[Gateway] Saving mail draft to: ${saveDraftReq.to}`);
        const success = await session.saveDraft(
          saveDraftReq.to,
          saveDraftReq.subject,
          saveDraftReq.body,
          saveDraftReq.headers,
          saveDraftReq.existingDraftId
        );
        const response: WsRespMailDraftSaved = {
          type: WsMessageType.RESP_MAIL_DRAFT_SAVED,
          wsRequestId: msg.wsRequestId,
          success,
          message: success ? 'Draft saved' : 'Failed to save draft',
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_MAIL_DELETE: {
        const deleteReq = msg as WsReqMailDelete;
        console.log(`[Gateway] Deleting mail: ${deleteReq.folder}/${deleteReq.messageId}`);
        await session.deleteMailMessage(deleteReq.folder, deleteReq.messageId);
        const response: WsRespMailDeleted = {
          type: WsMessageType.RESP_MAIL_DELETED,
          wsRequestId: msg.wsRequestId,
          success: true,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_MAIL_GET_UNREAD_COUNT: {
        console.log('[Gateway] Getting unread mail count');
        const count = await session.getMailUnreadCount();
        const response: WsRespMailUnreadCount = {
          type: WsMessageType.RESP_MAIL_UNREAD_COUNT,
          wsRequestId: msg.wsRequestId,
          count,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      // =================================================================
      // PROFILE
      // =================================================================

      case WsMessageType.REQ_GET_PROFILE: {
        console.log('[Gateway] Getting tycoon profile');
        const profile = await session.fetchTycoonProfile();
        const response: WsRespGetProfile = {
          type: WsMessageType.RESP_GET_PROFILE,
          wsRequestId: msg.wsRequestId,
          profile,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      // =================================================================
      // PROFILE TABS
      // =================================================================

      case WsMessageType.REQ_PROFILE_CURRICULUM: {
        console.log('[Gateway] Getting curriculum data');
        const data = await session.fetchCurriculumData();
        const response: WsRespProfileCurriculum = {
          type: WsMessageType.RESP_PROFILE_CURRICULUM,
          wsRequestId: msg.wsRequestId,
          data,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_PROFILE_BANK: {
        console.log('[Gateway] Getting bank account data');
        const data = await session.fetchBankAccount();
        const response: WsRespProfileBank = {
          type: WsMessageType.RESP_PROFILE_BANK,
          wsRequestId: msg.wsRequestId,
          data,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_PROFILE_BANK_ACTION: {
        const bankReq = msg as WsReqProfileBankAction;
        console.log(`[Gateway] Bank action: ${bankReq.action}`);
        const result = await session.executeBankAction(
          bankReq.action,
          bankReq.amount,
          bankReq.toTycoon,
          bankReq.reason,
          bankReq.loanIndex
        );
        const response: WsRespProfileBankAction = {
          type: WsMessageType.RESP_PROFILE_BANK_ACTION,
          wsRequestId: msg.wsRequestId,
          result,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_PROFILE_PROFITLOSS: {
        console.log('[Gateway] Getting profit & loss data');
        const data = await session.fetchProfitLoss();
        const response: WsRespProfileProfitLoss = {
          type: WsMessageType.RESP_PROFILE_PROFITLOSS,
          wsRequestId: msg.wsRequestId,
          data,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_PROFILE_COMPANIES: {
        console.log('[Gateway] Getting companies data');
        const data = await session.fetchCompanies();
        const response: WsRespProfileCompanies = {
          type: WsMessageType.RESP_PROFILE_COMPANIES,
          wsRequestId: msg.wsRequestId,
          data,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_PROFILE_AUTOCONNECTIONS: {
        console.log('[Gateway] Getting auto connections data');
        const data = await session.fetchAutoConnections();
        const response: WsRespProfileAutoConnections = {
          type: WsMessageType.RESP_PROFILE_AUTOCONNECTIONS,
          wsRequestId: msg.wsRequestId,
          data,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_PROFILE_AUTOCONNECTION_ACTION: {
        const acReq = msg as WsReqProfileAutoConnectionAction;
        console.log(`[Gateway] Auto connection action: ${acReq.action} for fluid ${acReq.fluidId}`);
        const result = await session.executeAutoConnectionAction(
          acReq.action,
          acReq.fluidId,
          acReq.suppliers
        );
        const response: WsRespProfileAutoConnectionAction = {
          type: WsMessageType.RESP_PROFILE_AUTOCONNECTION_ACTION,
          wsRequestId: msg.wsRequestId,
          success: result.success,
          message: result.message,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_PROFILE_POLICY: {
        console.log('[Gateway] Getting policy data');
        const data = await session.fetchPolicy();
        const response: WsRespProfilePolicy = {
          type: WsMessageType.RESP_PROFILE_POLICY,
          wsRequestId: msg.wsRequestId,
          data,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_PROFILE_POLICY_SET: {
        const polReq = msg as WsReqProfilePolicySet;
        console.log(`[Gateway] Setting policy for ${polReq.tycoonName} to ${polReq.status}`);
        const result = await session.setPolicyStatus(polReq.tycoonName, polReq.status);
        const response: WsRespProfilePolicySet = {
          type: WsMessageType.RESP_PROFILE_POLICY_SET,
          wsRequestId: msg.wsRequestId,
          success: result.success,
          message: result.message,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_POLITICS_DATA: {
        const polReq = msg as WsReqPoliticsData;
        console.log(`[Gateway] Getting politics data for town: ${polReq.townName}`);
        const data = await session.getPoliticsData(polReq.townName, polReq.buildingX, polReq.buildingY);
        const response: WsRespPoliticsData = {
          type: WsMessageType.RESP_POLITICS_DATA,
          wsRequestId: msg.wsRequestId,
          data,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_POLITICS_VOTE: {
        const voteReq = msg as WsReqPoliticsVote;
        console.log(`[Gateway] Voting for ${voteReq.candidateName}`);
        const result = await session.politicsVote(voteReq.buildingX, voteReq.buildingY, voteReq.candidateName);
        const response: WsRespPoliticsVote = {
          type: WsMessageType.RESP_POLITICS_VOTE,
          wsRequestId: msg.wsRequestId,
          success: result.success,
          message: result.message,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_POLITICS_LAUNCH_CAMPAIGN: {
        const campReq = msg as WsReqPoliticsLaunchCampaign;
        console.log(`[Gateway] Launching political campaign`);
        const result = await session.politicsLaunchCampaign(campReq.buildingX, campReq.buildingY);
        const response: WsRespPoliticsLaunchCampaign = {
          type: WsMessageType.RESP_POLITICS_LAUNCH_CAMPAIGN,
          wsRequestId: msg.wsRequestId,
          success: result.success,
          message: result.message,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case WsMessageType.REQ_SEARCH_CONNECTIONS: {
        const searchReq = msg as WsReqSearchConnections;
        console.log(`[Gateway] Searching ${searchReq.direction} connections for fluid: ${searchReq.fluidId}`);
        const results = await session.searchConnections(
          searchReq.buildingX, searchReq.buildingY,
          searchReq.fluidId, searchReq.direction, searchReq.filters
        );
        const response: WsRespSearchConnections = {
          type: WsMessageType.RESP_SEARCH_CONNECTIONS,
          wsRequestId: msg.wsRequestId,
          results,
          fluidId: searchReq.fluidId,
          direction: searchReq.direction,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      default:
        console.warn(`[Gateway] Unknown message type: ${msg.type}`);
    }

  } catch (err: unknown) {
    console.error('[Gateway] Request Failed:', toErrorMessage(err));
    const errorResp: WsRespError = {
      type: WsMessageType.RESP_ERROR,
      wsRequestId: msg.wsRequestId,
      errorMessage: toErrorMessage(err) || 'Internal Server Error',
      code: ErrorCodes.ERROR_Unknown
    };
    ws.send(JSON.stringify(errorResp));
  }
}

// Start Server
async function startServer() {
  try {
    // Initialize all registered services (in dependency order)
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

    // Setup graceful shutdown handlers (SIGTERM, SIGINT)
    setupGracefulShutdown(serviceRegistry, server);

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`[Gateway] Server running at http://localhost:${PORT}`);
      console.log(`[Gateway] Serving static files from ${PUBLIC_DIR}`);
    });
  } catch (error) {
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
