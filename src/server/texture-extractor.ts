/**
 * TextureExtractor
 *
 * Extracts terrain textures from CAB archives and builds a texture index.
 * Textures are extracted to webclient-cache/textures/<terrainType>/<season>/
 *
 * Season folders:
 * - 0 = Winter (Hiver)
 * - 1 = Spring (Printemps)
 * - 2 = Summer (Été)
 * - 3 = Autumn (Automne)
 *
 * Texture naming convention in CAB files:
 * - land.<paletteIndex>.<TerrainType><Direction><Variant>.bmp
 * - Example: land.128.DryGroundCenter0.bmp
 *
 * Palette ranges (Earth terrain):
 * - 0-63: Grass variants
 * - 64-127: MidGrass (transitions)
 * - 128-191: DryGround
 * - 192-255: Water
 */

import * as fs from 'fs';
import * as path from 'path';
import { Season, SEASON_NAMES } from '../shared/map-config';
import type { Service } from './service-registry';
import { extractCabArchive } from './cab-extractor';
import { bakeAlpha, bakeDirectory, decodePng, applyColorKey, encodePng } from './texture-alpha-baker';
import { generateTerrainAtlas, generateObjectAtlas } from './atlas-generator';

/**
 * Mapping from palette index to texture filename, parsed from LandClasses INI files
 */
export interface LandClassMapping {
  id: number;           // Palette index (0-255)
  mapColor: number;     // Color value for minimap
  filename: string;     // Texture filename (e.g., "land.0.GrassCenter0.bmp" or "GrassSpecial1.bmp")
}

export interface TextureInfo {
  paletteIndex: number;
  terrainType: string;
  direction: string;
  variant: number;
  filePath: string;
  fileName: string;
}

export interface TextureIndex {
  terrainType: string;
  season: Season;
  textures: Map<number, TextureInfo[]>; // paletteIndex -> array of texture variants
}

export class TextureExtractor implements Service {
  public readonly name = 'textures';

  private cacheDir: string;
  private landImagesDir: string;
  private landClassesDir: string;
  private extractedDir: string;
  private textureIndex: Map<string, TextureIndex> = new Map(); // "terrainType-season" -> TextureIndex
  private landClassMappings: Map<number, LandClassMapping> = new Map(); // paletteIndex -> mapping
  private initialized: boolean = false;

  constructor(cacheDir: string = 'cache') {
    this.cacheDir = cacheDir;
    this.landImagesDir = path.join(cacheDir, 'landimages');
    this.landClassesDir = path.join(cacheDir, 'LandClasses');
    this.extractedDir = path.join('webclient-cache', 'textures');
  }

  /**
   * Initialize texture extraction for all terrain types and seasons
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[TextureExtractor] Already initialized');
      return;
    }

    console.log('[TextureExtractor] Initializing...');

    // Ensure extracted directory exists
    if (!fs.existsSync(this.extractedDir)) {
      fs.mkdirSync(this.extractedDir, { recursive: true });
    }

    // Parse LandClasses INI files to get authoritative palette→filename mapping
    await this.parseLandClassesINI();

    // Get available terrain types
    const terrainTypes = await this.getTerrainTypes();
    console.log(`[TextureExtractor] Found terrain types: ${terrainTypes.join(', ')}`);

    // Extract textures for each terrain type and season
    for (const terrainType of terrainTypes) {
      const seasons = await this.getAvailableSeasons(terrainType);

      for (const season of seasons) {
        await this.extractTerrainTextures(terrainType, season);
      }
    }

    // Pre-bake alpha for object textures (roads, concrete)
    // These use dynamic color key detection from corner pixel (0,0)
    this.bakeObjectTextures();

    // Generate terrain atlases (one per terrain type + season)
    for (const terrainType of terrainTypes) {
      const seasons = await this.getAvailableSeasons(terrainType);
      for (const season of seasons) {
        this.generateTerrainAtlasForSeason(terrainType, season);
      }
    }

    // Generate object atlases (roads, concrete)
    this.generateObjectAtlases();

    this.initialized = true;
    console.log('[TextureExtractor] Initialization complete');
  }

  /**
   * Parse all INI files in cache/LandClasses/ to build palette→filename mapping
   * INI format:
   *   [General]
   *   Id=<paletteIndex>
   *   MapColor=<color>
   *   [Images]
   *   64x32=<filename>
   */
  private async parseLandClassesINI(): Promise<void> {
    if (!fs.existsSync(this.landClassesDir)) {
      console.log(`[TextureExtractor] LandClasses directory not found: ${this.landClassesDir}`);
      return;
    }

    const iniFiles = fs.readdirSync(this.landClassesDir)
      .filter(f => f.endsWith('.ini'));

    console.log(`[TextureExtractor] Parsing ${iniFiles.length} LandClasses INI files...`);

    for (const iniFile of iniFiles) {
      const filePath = path.join(this.landClassesDir, iniFile);
      const mapping = this.parseINIFile(filePath);

      if (mapping) {
        this.landClassMappings.set(mapping.id, mapping);
      }
    }

    console.log(`[TextureExtractor] Loaded ${this.landClassMappings.size} palette→filename mappings from INI files`);
  }

  /**
   * Parse a single INI file to extract Id, MapColor and 64x32 filename
   */
  private parseINIFile(filePath: string): LandClassMapping | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Extract Id from [General] section
      const idMatch = content.match(/^Id\s*=\s*(\d+)/m);
      if (!idMatch) {
        return null;
      }

      // Extract MapColor from [General] section
      const mapColorMatch = content.match(/^MapColor\s*=\s*(\d+)/m);

      // Extract filename from [Images] section (64x32=)
      const filenameMatch = content.match(/^64x32\s*=\s*(.+\.bmp)/mi);
      if (!filenameMatch) {
        return null;
      }

      return {
        id: parseInt(idMatch[1], 10),
        mapColor: mapColorMatch ? parseInt(mapColorMatch[1], 10) : 0,
        filename: filenameMatch[1].trim()
      };
    } catch (error: unknown) {
      console.error(`[TextureExtractor] Error parsing INI file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Service interface: Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized && this.textureIndex.size > 0;
  }

  /**
   * Pre-bake alpha for object textures (roads, concrete, cars).
   * Uses dynamic color key detection from corner pixel (0,0).
   * Building textures (GIF) are skipped - they continue using client-side handling.
   */
  private bakeObjectTextures(): void {
    const objectDirs: Array<{ dir: string; name: string }> = [
      { dir: path.join(this.cacheDir, 'RoadBlockImages'), name: 'roads' },
      { dir: path.join(this.cacheDir, 'ConcreteImages'), name: 'concrete' },
      { dir: path.join(this.cacheDir, 'CarImages'), name: 'cars' },
    ];

    for (const { dir, name } of objectDirs) {
      if (!fs.existsSync(dir)) {
        console.log(`[TextureExtractor] ${name} directory not found: ${dir}`);
        continue;
      }

      // Bake all BMP files with dynamic color key detection (null = auto-detect)
      const results = bakeDirectory(dir, null);
      const bakedCount = results.filter(r => r.success && r.width > 0).length;
      const skippedCount = results.filter(r => r.success && r.width === 0).length;
      console.log(`[TextureExtractor] ${name} alpha baked: ${bakedCount} new, ${skippedCount} cached`);

      // Platform textures platE, platS, platSE have black (RGB 0,0,0) shadow pixels
      // that survive the primary color key pass (which removes the teal background).
      // Apply a second pass to make these black shadow pixels transparent too.
      if (name === 'concrete') {
        this.removeBlackShadowFromPlatforms(dir);
      }
    }
  }

  /**
   * Remove black shadow pixels from platform textures (platE, platS, platSE).
   * These textures have black (RGB 0,0,0) pixels simulating cast shadows that
   * should be transparent instead.
   */
  private removeBlackShadowFromPlatforms(concreteDir: string): void {
    const platformsWithShadow = ['platE', 'platS', 'platSE'];
    const BLACK_KEY = { r: 0, g: 0, b: 0 };

    for (const name of platformsWithShadow) {
      const pngPath = path.join(concreteDir, `${name}.png`);
      if (!fs.existsSync(pngPath)) continue;

      try {
        const pngBuffer = fs.readFileSync(pngPath);
        const pngData = decodePng(pngBuffer);

        const removed = applyColorKey(pngData.pixels, pngData.width, pngData.height, BLACK_KEY, 5);
        if (removed > 0) {
          const newPng = encodePng(pngData.width, pngData.height, pngData.pixels);
          fs.writeFileSync(pngPath, newPng);
          console.log(`[TextureExtractor] ${name}: removed ${removed} black shadow pixels`);
        }
      } catch (error: unknown) {
        console.error(`[TextureExtractor] Failed to remove shadow from ${name}:`, error);
      }
    }
  }

  /**
   * Generate a terrain atlas for a specific terrain type and season.
   * Packs all textures into a single atlas PNG + JSON manifest.
   */
  private generateTerrainAtlasForSeason(terrainType: string, season: Season): void {
    const key = `${terrainType}-${season}`;
    const index = this.textureIndex.get(key);
    if (!index) return;

    const targetDir = path.join(this.extractedDir, terrainType, String(season));
    const atlasPath = path.join(targetDir, 'atlas.png');
    const manifestPath = path.join(targetDir, 'atlas.json');

    // Skip if atlas already exists and is up to date (check index version in same dir)
    const indexFile = path.join(targetDir, 'index.json');
    if (fs.existsSync(atlasPath) && fs.existsSync(manifestPath) && fs.existsSync(indexFile)) {
      const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      if (indexData.version === 3) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (manifest.version === 1 && Object.keys(manifest.tiles).length > 0) {
          console.log(`[TextureExtractor] Atlas cached: ${terrainType}/${SEASON_NAMES[season]} (${Object.keys(manifest.tiles).length} tiles)`);
          return;
        }
        // Atlas exists but has 0 tiles — regenerate
        if (Object.keys(manifest.tiles).length === 0) {
          console.log(`[TextureExtractor] Atlas has 0 tiles, regenerating: ${terrainType}/${SEASON_NAMES[season]}`);
        }
      }
    }

    // Build texture list from index
    const textures: Array<{ paletteIndex: number; filePath: string }> = [];
    for (const [paletteIndex, infos] of index.textures) {
      if (infos.length > 0) {
        textures.push({ paletteIndex, filePath: infos[0].filePath });
      }
    }

    const result = generateTerrainAtlas(textures, targetDir, terrainType, season);
    if (result.success) {
      console.log(`[TextureExtractor] Atlas generated: ${terrainType}/${SEASON_NAMES[season]} (${result.tileCount} tiles, ${result.atlasWidth}x${result.atlasHeight})`);
    } else {
      console.error(`[TextureExtractor] Atlas failed: ${terrainType}/${SEASON_NAMES[season]}: ${result.error}`);
    }
  }

  /**
   * Generate object atlases for roads and concrete.
   * Stores in webclient-cache/objects/ directory.
   */
  private generateObjectAtlases(): void {
    const objectsDir = path.join('webclient-cache', 'objects');
    if (!fs.existsSync(objectsDir)) {
      fs.mkdirSync(objectsDir, { recursive: true });
    }

    const atlasConfigs: Array<{ sourceDir: string; name: string; category: string }> = [
      {
        sourceDir: path.join(this.cacheDir, 'RoadBlockImages'),
        name: 'road',
        category: 'roads',
      },
      {
        sourceDir: path.join(this.cacheDir, 'ConcreteImages'),
        name: 'concrete',
        category: 'concrete',
      },
      {
        sourceDir: path.join(this.cacheDir, 'CarImages'),
        name: 'car',
        category: 'cars',
      },
    ];

    for (const config of atlasConfigs) {
      if (!fs.existsSync(config.sourceDir)) {
        console.log(`[TextureExtractor] ${config.name} source not found: ${config.sourceDir}`);
        continue;
      }

      const atlasPath = path.join(objectsDir, `${config.name}-atlas.png`);
      const manifestPath = path.join(objectsDir, `${config.name}-atlas.json`);

      // Skip if already generated with current atlas format (has cellHeight from pre-scan)
      if (fs.existsSync(atlasPath) && fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          if (manifest.tiles && Object.keys(manifest.tiles).length > 0 && manifest.cellHeight) {
            console.log(`[TextureExtractor] ${config.name} atlas cached (${Object.keys(manifest.tiles).length} tiles, cell ${manifest.cellWidth}x${manifest.cellHeight})`);
            continue;
          }
          const reason = !manifest.cellHeight ? 'stale format (missing cellHeight)' : '0 tiles';
          console.log(`[TextureExtractor] ${config.name} atlas ${reason}, regenerating`);
        } catch {
          console.log(`[TextureExtractor] ${config.name} atlas manifest invalid, regenerating`);
        }
      }

      const result = generateObjectAtlas(config.sourceDir, atlasPath, manifestPath, config.category);
      if (result.success) {
        console.log(`[TextureExtractor] ${config.name} atlas generated: ${result.tileCount} tiles (${result.atlasWidth}x${result.atlasHeight})`);
      } else {
        console.error(`[TextureExtractor] ${config.name} atlas failed: ${result.error}`);
      }
    }
  }

  /**
   * Get available terrain types from landimages directory
   */
  private async getTerrainTypes(): Promise<string[]> {
    const entries = fs.readdirSync(this.landImagesDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => decodeURIComponent(e.name)); // Decode URL-encoded directory names
  }

  /**
   * Get available seasons for a terrain type
   * Returns Season enum values (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
   */
  private async getAvailableSeasons(terrainType: string): Promise<Season[]> {
    // Use encoded name for filesystem access
    const encodedTerrainType = encodeURIComponent(terrainType);
    const terrainDir = path.join(this.landImagesDir, encodedTerrainType);
    const entries = fs.readdirSync(terrainDir, { withFileTypes: true });

    return entries
      .filter(e => e.isDirectory() && /^[0-3]$/.test(e.name))
      .map(e => parseInt(e.name, 10) as Season)
      .sort();
  }

  /**
   * Extract textures from CAB files for a specific terrain type and season
   */
  private async extractTerrainTextures(terrainType: string, season: Season): Promise<void> {
    // Use encoded name for filesystem access
    const encodedTerrainType = encodeURIComponent(terrainType);
    const sourceDir = path.join(this.landImagesDir, encodedTerrainType, String(season));
    const targetDir = path.join(this.extractedDir, terrainType, String(season));
    const seasonName = SEASON_NAMES[season];

    // Check if source directory exists
    if (!fs.existsSync(sourceDir)) {
      console.log(`[TextureExtractor] Source not found: ${sourceDir}`);
      return;
    }

    // Check if already extracted (by checking for index file with correct version)
    const indexFile = path.join(targetDir, 'index.json');
    if (fs.existsSync(indexFile)) {
      // Load existing index
      const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));

      // Check if index was built with pre-baked alpha PNGs (version 3)
      if (indexData.version === 3) {
        const textureMap = new Map<number, TextureInfo[]>();

        for (const [key, value] of Object.entries(indexData.textures)) {
          textureMap.set(parseInt(key, 10), value as TextureInfo[]);
        }

        this.textureIndex.set(`${terrainType}-${season}`, {
          terrainType,
          season,
          textures: textureMap
        });

        console.log(`[TextureExtractor] Loaded cached index (v3): ${terrainType}/${seasonName}`);
        return;
      } else {
        console.log(`[TextureExtractor] Rebuilding index (version ${indexData.version} → 3): ${terrainType}/${seasonName}`);
      }
    }

    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Get CAB files in source directory
    const cabFiles = fs.readdirSync(sourceDir)
      .filter(f => f.endsWith('.cab'));

    // Extract each CAB file
    for (const cabFile of cabFiles) {
      const cabPath = path.join(sourceDir, cabFile);

      try {
        await this.extractCab(cabPath, targetDir);
      } catch (error: unknown) {
        console.error(`[TextureExtractor] Failed to extract ${cabFile}:`, error);
      }
    }

    // Pre-bake alpha: convert BMP textures to PNG with alpha channel
    // This eliminates per-pixel color keying on the client
    const bakeResults = bakeDirectory(targetDir);
    const bakedCount = bakeResults.filter(r => r.success && r.width > 0).length;
    const skippedCount = bakeResults.filter(r => r.success && r.width === 0).length;
    if (bakedCount > 0 || skippedCount > 0) {
      console.log(`[TextureExtractor] Alpha baked: ${bakedCount} new PNGs, ${skippedCount} cached: ${terrainType}/${seasonName}`);
    }

    // Build texture map using INI mappings as source of truth
    const textureMap = new Map<number, TextureInfo[]>();

    // Get all extracted files (prefer PNG over BMP)
    const allFiles = fs.readdirSync(targetDir);
    const pngFiles = allFiles.filter(f => f.toLowerCase().endsWith('.png') && f !== 'atlas.png');
    const bmpFiles = allFiles.filter(f => f.toLowerCase().endsWith('.bmp'));

    // Create a case-insensitive filename lookup map
    // For each BMP filename, check if a corresponding PNG exists (preferred)
    const filenameLookup = new Map<string, string>();
    for (const file of bmpFiles) {
      const pngName = file.replace(/\.bmp$/i, '.png');
      const hasPng = pngFiles.some(p => p.toLowerCase() === pngName.toLowerCase());
      if (hasPng) {
        // Use PNG version (pre-baked alpha)
        const actualPng = pngFiles.find(p => p.toLowerCase() === pngName.toLowerCase())!;
        filenameLookup.set(file.toLowerCase(), actualPng);
      } else {
        // Fallback to BMP
        filenameLookup.set(file.toLowerCase(), file);
      }
    }

    // For each palette index in INI mappings, find the corresponding texture file
    for (const [paletteIndex, mapping] of this.landClassMappings) {
      const expectedFilename = mapping.filename;
      const actualFilename = filenameLookup.get(expectedFilename.toLowerCase());

      if (actualFilename) {
        const info = this.buildTextureInfo(paletteIndex, actualFilename, targetDir);
        if (!textureMap.has(paletteIndex)) {
          textureMap.set(paletteIndex, []);
        }
        textureMap.get(paletteIndex)!.push(info);
      }
    }

    // Store in memory index
    const index: TextureIndex = {
      terrainType,
      season,
      textures: textureMap
    };
    this.textureIndex.set(`${terrainType}-${season}`, index);

    // Save index to file for faster startup next time (version 3 = pre-baked alpha PNGs)
    const indexData = {
      version: 3,
      terrainType,
      season,
      seasonName,
      textures: Object.fromEntries(textureMap)
    };
    fs.writeFileSync(indexFile, JSON.stringify(indexData, null, 2));

    console.log(`[TextureExtractor] Indexed ${textureMap.size} textures (v3 pre-baked alpha): ${terrainType}/${seasonName}`);
  }

  /**
   * Build TextureInfo from palette index and filename
   */
  private buildTextureInfo(paletteIndex: number, fileName: string, baseDir: string): TextureInfo {
    // Try to extract terrain type and direction from filename
    // Pattern: land.128.DryGroundCenter0.bmp or GrassSpecial1.bmp
    let terrainType = 'Unknown';
    let direction = 'Center';
    let variant = 0;

    // Try standard format: land.<index>.<Type><Direction><Variant>.bmp
    // Types: Grass, MidGrass, DryGround, Water
    // Directions: Center, NEi, NEo, NWi, NWo, SEi, SEo, SWi, SWo, Ni, No, Si, So, Ei, Eo, Wi, Wo
    const standardMatch = fileName.match(/^land\.\d+\.(Grass|MidGrass|DryGround|Water)(Center|[NS][EW]?[io])(\d)\.(bmp|png)$/i);
    if (standardMatch) {
      terrainType = standardMatch[1];
      direction = standardMatch[2] || 'Center';
      variant = parseInt(standardMatch[3], 10);
    } else {
      // Try special format: <Type>Special<N>.bmp
      const specialMatch = fileName.match(/^(Grass|MidGrass|DryGround|Water)Special(\d+)\.(bmp|png)$/i);
      if (specialMatch) {
        terrainType = specialMatch[1];
        direction = 'Special';
        variant = parseInt(specialMatch[2], 10);
      }
    }

    return {
      paletteIndex,
      terrainType,
      direction,
      variant,
      filePath: path.join(baseDir, fileName),
      fileName
    };
  }

  /**
   * Extract a CAB file using the cross-platform cabarc package
   * No external tools required (works on Windows, Linux, macOS)
   */
  private async extractCab(cabPath: string, targetDir: string): Promise<void> {
    const result = await extractCabArchive(cabPath, targetDir);

    if (!result.success && result.errors.length > 0) {
      throw new Error(result.errors.join('; '));
    }
  }

  /**
   * Get texture file path for a palette index
   * Returns the first matching texture (Center variant 0 preferred)
   *
   * @param terrainType - Terrain type (e.g., 'Earth', 'Alien Swamp')
   * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
   * @param paletteIndex - Palette index from map BMP (0-255)
   */
  getTexturePath(terrainType: string, season: Season, paletteIndex: number): string | null {
    const key = `${terrainType}-${season}`;
    const index = this.textureIndex.get(key);

    if (!index) {
      return null;
    }

    const textures = index.textures.get(paletteIndex);
    if (!textures || textures.length === 0) {
      return null;
    }

    // Prefer Center variant 0
    const preferred = textures.find(t => t.direction === 'Center' && t.variant === 0)
      || textures.find(t => t.direction.includes('Center'))
      || textures[0];

    return preferred.filePath;
  }

  /**
   * Get all texture variants for a palette index
   */
  getTextureVariants(terrainType: string, season: Season, paletteIndex: number): TextureInfo[] {
    const key = `${terrainType}-${season}`;
    const index = this.textureIndex.get(key);

    if (!index) {
      return [];
    }

    return index.textures.get(paletteIndex) || [];
  }

  /**
   * Check if textures are available for a terrain type
   */
  hasTerrainType(terrainType: string): boolean {
    return Array.from(this.textureIndex.keys()).some(k => k.startsWith(terrainType + '-'));
  }

  /**
   * Get all available palette indices for a terrain type and season
   */
  getAvailableIndices(terrainType: string, season: Season): number[] {
    const key = `${terrainType}-${season}`;
    const index = this.textureIndex.get(key);

    if (!index) {
      return [];
    }

    return Array.from(index.textures.keys()).sort((a, b) => a - b);
  }

  /**
   * Get statistics about extracted textures
   */
  getStats(): { terrainType: string; season: Season; seasonName: string; textureCount: number }[] {
    const stats: { terrainType: string; season: Season; seasonName: string; textureCount: number }[] = [];

    for (const [key, index] of this.textureIndex) {
      stats.push({
        terrainType: index.terrainType,
        season: index.season,
        seasonName: SEASON_NAMES[index.season],
        textureCount: index.textures.size
      });
    }

    return stats;
  }

  /**
   * Get available seasons for a terrain type from the loaded index
   * This queries the already-initialized texture index (fast, no filesystem access)
   *
   * @param terrainType - Terrain type (e.g., 'Earth', 'Alien Swamp')
   * @returns Array of available Season enum values
   */
  getAvailableSeasonsForTerrain(terrainType: string): Season[] {
    const seasons: Season[] = [];

    for (const [key, index] of this.textureIndex) {
      if (index.terrainType === terrainType && !seasons.includes(index.season)) {
        seasons.push(index.season);
      }
    }

    return seasons.sort((a, b) => a - b);
  }

  /**
   * Graceful shutdown: clear in-memory caches.
   */
  async shutdown(): Promise<void> {
    console.log('[TextureExtractor] Shutting down...');
    this.textureIndex.clear();
    this.landClassMappings.clear();
    this.initialized = false;
    console.log('[TextureExtractor] Shutdown complete');
  }

  /**
   * Get terrain info including available seasons
   * Used by client to auto-select an available season
   */
  getTerrainInfo(terrainType: string): { terrainType: string; availableSeasons: Season[]; defaultSeason: Season } | null {
    const availableSeasons = this.getAvailableSeasonsForTerrain(terrainType);

    if (availableSeasons.length === 0) {
      return null;
    }

    // Default season priority: Summer (2) > Spring (1) > Autumn (3) > Winter (0)
    const seasonPriority = [Season.SUMMER, Season.SPRING, Season.AUTUMN, Season.WINTER];
    let defaultSeason = availableSeasons[0];

    for (const preferred of seasonPriority) {
      if (availableSeasons.includes(preferred)) {
        defaultSeason = preferred;
        break;
      }
    }

    return {
      terrainType,
      availableSeasons,
      defaultSeason
    };
  }
}
