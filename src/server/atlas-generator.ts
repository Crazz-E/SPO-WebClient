/**
 * AtlasGenerator
 *
 * Packs terrain textures for a given terrain type and season into a single
 * atlas PNG image + JSON manifest. This reduces ~256 individual HTTP requests
 * to just 2 (atlas + manifest).
 *
 * Atlas layout:
 * - Regular grid with fixed cell dimensions
 * - Standard tiles (64×32) and tall tiles (64×96 max) in the same atlas
 * - Cell height = 96 pixels (accommodates tallest known textures)
 * - 16 columns × 16 rows = 256 slots → atlas is 1024×1536 pixels
 *
 * No external dependencies - uses the BMP decoder and PNG encoder from texture-alpha-baker.
 */

import * as fs from 'fs';
import * as path from 'path';
import { decodeBmp, encodePng, applyColorKey, detectColorKey } from './texture-alpha-baker';

/**
 * Atlas manifest describing tile positions within the atlas image.
 */
export interface AtlasManifest {
  version: number;
  terrainType: string;
  season: number;
  tileWidth: number;
  tileHeight: number;    // Standard tile height (32)
  cellHeight: number;    // Atlas cell height (96 - accommodates tall tiles)
  atlasWidth: number;
  atlasHeight: number;
  columns: number;
  rows: number;
  /** Mapping from paletteIndex to tile position in atlas */
  tiles: Record<string, TileEntry>;
}

export interface TileEntry {
  /** X position in atlas (pixels) */
  x: number;
  /** Y position in atlas (pixels) */
  y: number;
  /** Actual tile width (always 64 for terrain) */
  width: number;
  /** Actual tile height (32 for standard, up to 96 for tall/vegetation tiles) */
  height: number;
}

/**
 * Input texture info for atlas generation
 */
interface TextureInput {
  paletteIndex: number;
  filePath: string;
}

/**
 * Result of atlas generation
 */
export interface AtlasResult {
  success: boolean;
  atlasPath: string;
  manifestPath: string;
  tileCount: number;
  atlasWidth: number;
  atlasHeight: number;
  error?: string;
}

// Atlas layout constants
const TILE_WIDTH = 64;
const STANDARD_TILE_HEIGHT = 32;
const CELL_HEIGHT = 96;   // Max height for tall tiles
const ATLAS_COLUMNS = 16;
const ATLAS_ROWS = 16;    // 16×16 = 256 slots (covers all palette indices 0-255)

/**
 * Generate a terrain atlas from a set of texture files.
 *
 * @param textures - Array of palette index → file path mappings
 * @param outputDir - Directory to write atlas.png and atlas.json
 * @param terrainType - Terrain type name (e.g., 'Earth')
 * @param season - Season number (0-3)
 * @returns AtlasResult with generation outcome
 */
export function generateTerrainAtlas(
  textures: TextureInput[],
  outputDir: string,
  terrainType: string,
  season: number
): AtlasResult {
  const atlasPath = path.join(outputDir, 'atlas.png');
  const manifestPath = path.join(outputDir, 'atlas.json');

  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const atlasWidth = ATLAS_COLUMNS * TILE_WIDTH;
    const atlasHeight = ATLAS_ROWS * CELL_HEIGHT;

    // Create RGBA atlas buffer (initialized to transparent)
    const atlasPixels = Buffer.alloc(atlasWidth * atlasHeight * 4, 0);

    // Manifest data
    const tileEntries: Record<string, TileEntry> = {};
    let tileCount = 0;

    for (const tex of textures) {
      const { paletteIndex, filePath } = tex;

      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        // Determine which file to read: prefer pre-baked PNG, fallback to BMP
        let pixels: Buffer;
        let texWidth: number;
        let texHeight: number;

        const pngPath = filePath.replace(/\.bmp$/i, '.png');
        if (filePath.toLowerCase().endsWith('.bmp') && fs.existsSync(pngPath)) {
          // Use pre-baked PNG (already has alpha)
          // We need to decode the PNG to get raw pixels for atlas composition
          // Since our PNG encoder is minimal, we'll read the BMP and apply color key
          const bmpBuffer = fs.readFileSync(filePath);
          const bmpData = decodeBmp(bmpBuffer);
          const colorKey = detectColorKey(bmpData.pixels);
          applyColorKey(bmpData.pixels, bmpData.width, bmpData.height, colorKey);
          pixels = bmpData.pixels;
          texWidth = bmpData.width;
          texHeight = bmpData.height;
        } else if (filePath.toLowerCase().endsWith('.png')) {
          // Already a PNG - read the original BMP to get raw pixels
          const bmpPath = filePath.replace(/\.png$/i, '.bmp');
          if (fs.existsSync(bmpPath)) {
            const bmpBuffer = fs.readFileSync(bmpPath);
            const bmpData = decodeBmp(bmpBuffer);
            const colorKey = detectColorKey(bmpData.pixels);
            applyColorKey(bmpData.pixels, bmpData.width, bmpData.height, colorKey);
            pixels = bmpData.pixels;
            texWidth = bmpData.width;
            texHeight = bmpData.height;
          } else {
            continue; // Can't process without BMP source
          }
        } else {
          // Read BMP directly
          const bmpBuffer = fs.readFileSync(filePath);
          const bmpData = decodeBmp(bmpBuffer);
          const colorKey = detectColorKey(bmpData.pixels);
          applyColorKey(bmpData.pixels, bmpData.width, bmpData.height, colorKey);
          pixels = bmpData.pixels;
          texWidth = bmpData.width;
          texHeight = bmpData.height;
        }

        // Calculate grid position
        // Each palette index maps to a specific cell in the grid
        const col = paletteIndex % ATLAS_COLUMNS;
        const row = Math.floor(paletteIndex / ATLAS_COLUMNS);

        if (row >= ATLAS_ROWS) {
          continue; // Skip indices beyond grid capacity
        }

        const cellX = col * TILE_WIDTH;
        const cellY = row * CELL_HEIGHT;

        // Copy texture pixels to atlas
        // Tall textures are bottom-aligned within the cell
        const yOffset = CELL_HEIGHT - texHeight;

        for (let y = 0; y < texHeight; y++) {
          for (let x = 0; x < Math.min(texWidth, TILE_WIDTH); x++) {
            const srcIdx = (y * texWidth + x) * 4;
            const dstX = cellX + x;
            const dstY = cellY + yOffset + y;

            if (dstX < atlasWidth && dstY < atlasHeight) {
              const dstIdx = (dstY * atlasWidth + dstX) * 4;
              atlasPixels[dstIdx] = pixels[srcIdx];         // R
              atlasPixels[dstIdx + 1] = pixels[srcIdx + 1]; // G
              atlasPixels[dstIdx + 2] = pixels[srcIdx + 2]; // B
              atlasPixels[dstIdx + 3] = pixels[srcIdx + 3]; // A
            }
          }
        }

        tileEntries[String(paletteIndex)] = {
          x: cellX,
          y: cellY + yOffset,
          width: Math.min(texWidth, TILE_WIDTH),
          height: texHeight,
        };
        tileCount++;
      } catch (texError: unknown) {
        // Skip individual texture errors
        console.warn(`[AtlasGenerator] Failed to process texture ${paletteIndex}:`, texError);
      }
    }

    // Encode atlas as PNG
    const atlasPng = encodePng(atlasWidth, atlasHeight, atlasPixels);
    fs.writeFileSync(atlasPath, atlasPng);

    // Write manifest
    const manifest: AtlasManifest = {
      version: 1,
      terrainType,
      season,
      tileWidth: TILE_WIDTH,
      tileHeight: STANDARD_TILE_HEIGHT,
      cellHeight: CELL_HEIGHT,
      atlasWidth,
      atlasHeight,
      columns: ATLAS_COLUMNS,
      rows: ATLAS_ROWS,
      tiles: tileEntries,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return {
      success: true,
      atlasPath,
      manifestPath,
      tileCount,
      atlasWidth,
      atlasHeight,
    };
  } catch (error: unknown) {
    return {
      success: false,
      atlasPath,
      manifestPath,
      tileCount: 0,
      atlasWidth: 0,
      atlasHeight: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate an object atlas (roads or concrete) from BMP files in a directory.
 *
 * @param sourceDir - Directory containing BMP files
 * @param outputPath - Path for the output atlas PNG
 * @param manifestPath - Path for the output manifest JSON
 * @param category - Category name for the manifest
 * @returns AtlasResult
 */
export function generateObjectAtlas(
  sourceDir: string,
  outputPath: string,
  manifestPath: string,
  category: string
): AtlasResult {
  try {
    if (!fs.existsSync(sourceDir)) {
      return {
        success: false,
        atlasPath: outputPath,
        manifestPath,
        tileCount: 0,
        atlasWidth: 0,
        atlasHeight: 0,
        error: `Source directory not found: ${sourceDir}`,
      };
    }

    // Get all BMP files
    const bmpFiles = fs.readdirSync(sourceDir)
      .filter(f => f.toLowerCase().endsWith('.bmp'))
      .sort();

    if (bmpFiles.length === 0) {
      return {
        success: false,
        atlasPath: outputPath,
        manifestPath,
        tileCount: 0,
        atlasWidth: 0,
        atlasHeight: 0,
        error: 'No BMP files found in source directory',
      };
    }

    // Pre-scan: find max dimensions across all BMP files
    // Textures vary in size (roads: 64×32, bridges: 64×49, platforms: 68×80)
    let cellWidth = TILE_WIDTH;
    let cellHeight = STANDARD_TILE_HEIGHT;
    for (const file of bmpFiles) {
      try {
        const buf = fs.readFileSync(path.join(sourceDir, file));
        const bmp = decodeBmp(buf);
        if (bmp.width > cellWidth) cellWidth = bmp.width;
        if (bmp.height > cellHeight) cellHeight = bmp.height;
      } catch { /* skip unreadable files — they'll fail again in the main loop */ }
    }

    // Calculate grid dimensions using max cell size
    const cols = Math.ceil(Math.sqrt(bmpFiles.length));
    const rows = Math.ceil(bmpFiles.length / cols);
    const atlasWidth = cols * cellWidth;
    const atlasHeight = rows * cellHeight;

    // Create atlas buffer
    const atlasPixels = Buffer.alloc(atlasWidth * atlasHeight * 4, 0);
    const tileEntries: Record<string, TileEntry> = {};
    let tileCount = 0;

    for (let idx = 0; idx < bmpFiles.length; idx++) {
      const file = bmpFiles[idx];
      const filePath = path.join(sourceDir, file);

      try {
        const bmpBuffer = fs.readFileSync(filePath);
        const bmpData = decodeBmp(bmpBuffer);
        const colorKey = detectColorKey(bmpData.pixels);
        applyColorKey(bmpData.pixels, bmpData.width, bmpData.height, colorKey);

        const texWidth = bmpData.width;
        const texHeight = bmpData.height;

        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cellX = col * cellWidth;
        const cellY = row * cellHeight;

        // Bottom-align: tall textures anchor at cell bottom (same as terrain atlas)
        const yOffset = cellHeight - texHeight;

        // Copy pixels into the atlas at the bottom-aligned position
        for (let y = 0; y < texHeight; y++) {
          for (let x = 0; x < Math.min(texWidth, cellWidth); x++) {
            const srcIdx = (y * texWidth + x) * 4;
            const dstX = cellX + x;
            const dstY = cellY + yOffset + y;
            const dstIdx = (dstY * atlasWidth + dstX) * 4;
            atlasPixels[dstIdx] = bmpData.pixels[srcIdx];
            atlasPixels[dstIdx + 1] = bmpData.pixels[srcIdx + 1];
            atlasPixels[dstIdx + 2] = bmpData.pixels[srcIdx + 2];
            atlasPixels[dstIdx + 3] = bmpData.pixels[srcIdx + 3];
          }
        }

        // Manifest stores actual texture position and dimensions (bottom-aligned)
        const name = file.replace(/\.bmp$/i, '');
        tileEntries[name] = {
          x: cellX,
          y: cellY + yOffset,
          width: Math.min(texWidth, cellWidth),
          height: texHeight,
        };
        tileCount++;
      } catch (texError: unknown) {
        console.warn(`[AtlasGenerator] Failed to process ${file}:`, texError);
      }
    }

    // Encode and write
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const atlasPng = encodePng(atlasWidth, atlasHeight, atlasPixels);
    fs.writeFileSync(outputPath, atlasPng);

    const manifest = {
      version: 1,
      category,
      tileWidth: TILE_WIDTH,
      tileHeight: STANDARD_TILE_HEIGHT,
      cellWidth,
      cellHeight,
      atlasWidth,
      atlasHeight,
      columns: cols,
      rows,
      tiles: tileEntries,
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return {
      success: true,
      atlasPath: outputPath,
      manifestPath,
      tileCount,
      atlasWidth,
      atlasHeight,
    };
  } catch (error: unknown) {
    return {
      success: false,
      atlasPath: outputPath,
      manifestPath,
      tileCount: 0,
      atlasWidth: 0,
      atlasHeight: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
