/**
 * Unit tests for TerrainChunkRenderer
 *
 * Tests server-side terrain chunk pre-rendering:
 * - Tile position formulas match client chunk-cache.ts
 * - Chunk dimensions calculations
 * - Vegetation flattening
 * - Alpha blending correctness
 * - Chunk generation from synthetic atlas and map data
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  TerrainChunkRenderer,
  CHUNK_SIZE,
  CHUNK_CANVAS_WIDTH,
  CHUNK_CANVAS_HEIGHT,
  getTileScreenPosInChunk,
  blitTileWithAlpha,
} from './terrain-chunk-renderer';
import { encodePng, decodePng, decodeWebP } from './texture-alpha-baker';
import { AtlasManifest } from './atlas-generator';
import { isSpecialTile } from '../shared/land-utils';

// ============================================================================
// Constants tests
// ============================================================================

describe('Chunk constants', () => {
  it('should have correct chunk size', () => {
    expect(CHUNK_SIZE).toBe(32);
  });

  it('should have correct chunk canvas dimensions at zoom level 3', () => {
    // u=32, CHUNK_SIZE=32
    // width = u * (2*32 - 1) + tileWidth = 32*63 + 64 = 2080
    // height = u * CHUNK_SIZE + tileHeight = 32*32 + 32 = 1056
    expect(CHUNK_CANVAS_WIDTH).toBe(2080);
    expect(CHUNK_CANVAS_HEIGHT).toBe(1056);
  });
});

// ============================================================================
// Tile position formula tests (must match client chunk-cache.ts)
// ============================================================================

describe('getTileScreenPosInChunk', () => {
  it('should return correct position for tile (0,0)', () => {
    const pos = getTileScreenPosInChunk(0, 0);
    // u=32, chunkSize=32
    // x = 32 * (32 - 0 + 0) = 32 * 32 = 1024
    // y = 16 * ((32-0) + (32-0)) = 16 * 64 = 1024
    expect(pos.x).toBe(1024);
    expect(pos.y).toBe(1024);
  });

  it('should return correct position for tile (0, 31)', () => {
    const pos = getTileScreenPosInChunk(0, 31);
    // x = 32 * (32 - 0 + 31) = 32 * 63 = 2016
    // y = 16 * ((32-0) + (32-31)) = 16 * 33 = 528
    expect(pos.x).toBe(2016);
    expect(pos.y).toBe(528);
  });

  it('should return correct position for tile (31, 0)', () => {
    const pos = getTileScreenPosInChunk(31, 0);
    // x = 32 * (32 - 31 + 0) = 32 * 1 = 32
    // y = 16 * ((32-31) + (32-0)) = 16 * 33 = 528
    expect(pos.x).toBe(32);
    expect(pos.y).toBe(528);
  });

  it('should return correct position for tile (31, 31)', () => {
    const pos = getTileScreenPosInChunk(31, 31);
    // x = 32 * (32 - 31 + 31) = 32 * 32 = 1024
    // y = 16 * ((32-31) + (32-31)) = 16 * 2 = 32
    expect(pos.x).toBe(1024);
    expect(pos.y).toBe(32);
  });

  it('should match client formula for center tile (16, 16)', () => {
    const pos = getTileScreenPosInChunk(16, 16);
    // x = 32 * (32 - 16 + 16) = 32 * 32 = 1024
    // y = 16 * ((32-16) + (32-16)) = 16 * 32 = 512
    expect(pos.x).toBe(1024);
    expect(pos.y).toBe(512);
  });
});

// ============================================================================
// Alpha blending tests
// ============================================================================

describe('blitTileWithAlpha', () => {
  it('should copy fully opaque pixels', () => {
    // 2x2 src (red, opaque)
    const src = Buffer.alloc(2 * 2 * 4);
    src[0] = 255; src[1] = 0; src[2] = 0; src[3] = 255; // pixel 0,0 = red
    src[4] = 0; src[5] = 255; src[6] = 0; src[7] = 255; // pixel 1,0 = green

    // 4x4 dst (black, opaque)
    const dst = Buffer.alloc(4 * 4 * 4, 0);

    blitTileWithAlpha(src, 2, 0, 0, 2, 1, dst, 4, 4, 1, 1);

    // Check pixel at (1,1) = red
    const idx = (1 * 4 + 1) * 4;
    expect(dst[idx]).toBe(255);     // R
    expect(dst[idx + 1]).toBe(0);   // G
    expect(dst[idx + 2]).toBe(0);   // B
    expect(dst[idx + 3]).toBe(255); // A

    // Check pixel at (2,1) = green
    const idx2 = (1 * 4 + 2) * 4;
    expect(dst[idx2]).toBe(0);
    expect(dst[idx2 + 1]).toBe(255);
    expect(dst[idx2 + 2]).toBe(0);
    expect(dst[idx2 + 3]).toBe(255);
  });

  it('should skip fully transparent pixels', () => {
    // 1x1 src (transparent)
    const src = Buffer.from([255, 0, 0, 0]); // alpha = 0

    // 2x2 dst (blue, opaque)
    const dst = Buffer.alloc(2 * 2 * 4);
    dst[0] = 0; dst[1] = 0; dst[2] = 255; dst[3] = 255;

    blitTileWithAlpha(src, 1, 0, 0, 1, 1, dst, 2, 2, 0, 0);

    // Pixel should still be blue (transparent src skipped)
    expect(dst[0]).toBe(0);
    expect(dst[1]).toBe(0);
    expect(dst[2]).toBe(255);
    expect(dst[3]).toBe(255);
  });

  it('should clip pixels outside destination bounds', () => {
    // 2x2 src (all red, opaque)
    const src = Buffer.alloc(2 * 2 * 4);
    for (let i = 0; i < 4; i++) {
      src[i * 4] = 255;
      src[i * 4 + 3] = 255;
    }

    // 2x2 dst
    const dst = Buffer.alloc(2 * 2 * 4, 0);

    // Place at (1, 1) — only pixel (0,0) of src fits within dst
    blitTileWithAlpha(src, 2, 0, 0, 2, 2, dst, 2, 2, 1, 1);

    // Only (1,1) should be red
    const idx = (1 * 2 + 1) * 4;
    expect(dst[idx]).toBe(255);
    expect(dst[idx + 3]).toBe(255);

    // (0,0) should still be black
    expect(dst[0]).toBe(0);
    expect(dst[3]).toBe(0);
  });

  it('should handle negative destination positions', () => {
    // 2x2 src
    const src = Buffer.alloc(2 * 2 * 4);
    src[0] = 100; src[3] = 255; // (0,0)
    src[4] = 200; src[7] = 255; // (1,0)
    src[8] = 150; src[11] = 255; // (0,1)
    src[12] = 250; src[15] = 255; // (1,1)

    // 2x2 dst
    const dst = Buffer.alloc(2 * 2 * 4, 0);

    // Place at (-1, -1): only (1,1) of src should appear at (0,0) of dst
    blitTileWithAlpha(src, 2, 0, 0, 2, 2, dst, 2, 2, -1, -1);

    expect(dst[0]).toBe(250); // (1,1) of src at (0,0) of dst
    expect(dst[3]).toBe(255);
  });
});

// ============================================================================
// Vegetation flattening tests
// ============================================================================

describe('Vegetation flattening', () => {
  it('should identify special tiles (LandType = 13)', () => {
    // 0x34 = 0b00110100 = Class=0, Type=13 (Special), Var=0
    expect(isSpecialTile(0x34)).toBe(true);
    // GrassSpecial1 = 0x35 = 0b00110101
    expect(isSpecialTile(0x35)).toBe(true);
    // DryGroundSpecial = 0xB4 = 0b10110100
    expect(isSpecialTile(0xB4)).toBe(true);
  });

  it('should not identify center tiles as special', () => {
    expect(isSpecialTile(0x00)).toBe(false); // GrassCenter0
    expect(isSpecialTile(0x80)).toBe(false); // DryGroundCenter0
    expect(isSpecialTile(0xC0)).toBe(false); // WaterCenter0
  });

  it('should flatten special tiles to center (landId & 0xC0)', () => {
    // GrassSpecial0 (0x34) → GrassCenter (0x00)
    expect(0x34 & 0xC0).toBe(0x00);
    // MidGrassSpecial (0x74) → MidGrassCenter (0x40)
    expect(0x74 & 0xC0).toBe(0x40);
    // DryGroundSpecial (0xB4) → DryGroundCenter (0x80)
    expect(0xB4 & 0xC0).toBe(0x80);
    // WaterSpecial (0xF4) → WaterCenter (0xC0)
    expect(0xF4 & 0xC0).toBe(0xC0);
  });
});

// ============================================================================
// TerrainChunkRenderer integration tests
// ============================================================================

// WebP WASM encoding is slower than native PNG — allow extra time for chunk generation + preview compositing
jest.setTimeout(60_000);

describe('TerrainChunkRenderer', () => {
  const tmpDir = path.join(__dirname, '../../.test-tmp-chunks');
  const tmpCache = path.join(tmpDir, 'webclient-cache');
  const tmpMapCache = path.join(tmpDir, 'cache');
  const tmpTextureDir = path.join(tmpCache, 'textures');

  /**
   * Create a synthetic terrain atlas: 4x4 tiles with solid colors.
   * Each tile is 64x32 pixels of a single color based on palette index.
   */
  function createSyntheticAtlas(): { pngBuffer: Buffer; manifest: AtlasManifest } {
    const TILE_W = 64;
    const CELL_H = 96;
    const COLS = 16;
    const ROWS = 16;
    const atlasW = COLS * TILE_W;
    const atlasH = ROWS * CELL_H;

    const pixels = Buffer.alloc(atlasW * atlasH * 4, 0);
    const tiles: Record<string, { x: number; y: number; width: number; height: number }> = {};

    // Generate a few tiles (index 0, 64, 128, 192 = one per LandClass)
    const indices = [0, 64, 128, 192];
    for (const idx of indices) {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const cellX = col * TILE_W;
      const cellY = row * CELL_H;
      const yOffset = CELL_H - 32; // Bottom-aligned, standard height

      // Fill tile area with a color based on index
      const r = (idx * 37) % 256;
      const g = (idx * 71) % 256;
      const b = (idx * 113) % 256;

      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < TILE_W; x++) {
          const px = ((cellY + yOffset + y) * atlasW + (cellX + x)) * 4;
          pixels[px] = r;
          pixels[px + 1] = g;
          pixels[px + 2] = b;
          pixels[px + 3] = 255;
        }
      }

      tiles[String(idx)] = {
        x: cellX,
        y: cellY + yOffset,
        width: TILE_W,
        height: 32,
      };
    }

    const manifest: AtlasManifest = {
      version: 1,
      terrainType: 'Earth',
      season: 2,
      tileWidth: TILE_W,
      tileHeight: 32,
      cellHeight: CELL_H,
      atlasWidth: atlasW,
      atlasHeight: atlasH,
      columns: COLS,
      rows: ROWS,
      tiles,
    };

    const pngBuffer = encodePng(atlasW, atlasH, pixels);
    return { pngBuffer, manifest };
  }

  /**
   * Create a synthetic 8-bit indexed BMP map (small: 64x64).
   * All tiles set to index 0 (GrassCenter).
   */
  function createSyntheticMapBmp(width: number, height: number, indexFn?: (x: number, y: number) => number): Buffer {
    const numColors = 256;
    const paletteSize = numColors * 4;
    const rowSize = Math.ceil(width / 4) * 4;
    const dataSize = rowSize * height;
    const dataOffset = 54 + paletteSize;
    const fileSize = dataOffset + dataSize;
    const buffer = Buffer.alloc(fileSize);

    // BMP headers
    buffer.writeUInt16LE(0x4D42, 0);
    buffer.writeUInt32LE(fileSize, 2);
    buffer.writeUInt32LE(dataOffset, 10);
    buffer.writeUInt32LE(40, 14);
    buffer.writeInt32LE(width, 18);
    buffer.writeInt32LE(height, 22);
    buffer.writeUInt16LE(1, 26);
    buffer.writeUInt16LE(8, 28);
    buffer.writeUInt32LE(0, 30);
    buffer.writeUInt32LE(dataSize, 34);
    buffer.writeUInt32LE(numColors, 46);

    // Palette (256 dummy entries)
    for (let i = 0; i < numColors; i++) {
      const off = 54 + i * 4;
      buffer[off] = i; buffer[off + 1] = i; buffer[off + 2] = i; buffer[off + 3] = 0;
    }

    // Pixel data (bottom-up)
    const fn = indexFn || (() => 0);
    for (let y = 0; y < height; y++) {
      const srcRow = height - 1 - y; // bottom-up
      const rowOffset = dataOffset + srcRow * rowSize;
      for (let x = 0; x < width; x++) {
        buffer[rowOffset + x] = fn(x, y);
      }
    }

    return buffer;
  }

  /** Create a renderer with pre-generation disabled (avoids async leaks in tests) */
  function createRenderer(): TerrainChunkRenderer {
    const r = new TerrainChunkRenderer(tmpCache, tmpMapCache, tmpTextureDir);
    r.skipPreGeneration = true;
    return r;
  }

  beforeEach(() => {
    // Create temp directory structure
    fs.mkdirSync(path.join(tmpTextureDir, 'Earth', '2'), { recursive: true });
    fs.mkdirSync(path.join(tmpMapCache, 'Maps', 'TestMap'), { recursive: true });

    // Write synthetic atlas
    const { pngBuffer, manifest } = createSyntheticAtlas();
    fs.writeFileSync(path.join(tmpTextureDir, 'Earth', '2', 'atlas.png'), pngBuffer);
    fs.writeFileSync(path.join(tmpTextureDir, 'Earth', '2', 'atlas.json'), JSON.stringify(manifest));

    // Write synthetic map BMP (64x64, all index 0)
    const mapBmp = createSyntheticMapBmp(64, 64);
    fs.writeFileSync(path.join(tmpMapCache, 'Maps', 'TestMap', 'TestMap.bmp'), mapBmp);
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should initialize and load atlases', async () => {
    const renderer = createRenderer();
    await renderer.initialize();

    expect(renderer.hasAtlas('Earth', 2)).toBe(true);
    expect(renderer.hasAtlas('Earth', 0)).toBe(false);
  });

  it('should load map data lazily', () => {
    const renderer = createRenderer();
    const loaded = renderer.loadMapData('TestMap');

    expect(loaded).toBe(true);
  });

  it('should fail to load non-existent map', () => {
    const renderer = createRenderer();
    const loaded = renderer.loadMapData('NonExistentMap');

    expect(loaded).toBe(false);
  });

  it('should generate a chunk RGBA buffer', async () => {
    const renderer = createRenderer();
    await renderer.initialize();
    renderer.loadMapData('TestMap');

    const rgbaBuffer = renderer.generateChunkRGBA('Earth', 2, 0, 0, 'TestMap');

    expect(rgbaBuffer).not.toBeNull();
    expect(rgbaBuffer!.length).toBe(CHUNK_CANVAS_WIDTH * CHUNK_CANVAS_HEIGHT * 4);

    // Can encode to PNG and verify round-trip
    const pngBuffer = encodePng(CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT, rgbaBuffer!);
    expect(pngBuffer[0]).toBe(137); // PNG signature
    expect(pngBuffer[1]).toBe(80);

    const decoded = decodePng(pngBuffer);
    expect(decoded.width).toBe(CHUNK_CANVAS_WIDTH);
    expect(decoded.height).toBe(CHUNK_CANVAS_HEIGHT);
  });

  it('should cache chunks to disk', async () => {
    const renderer = createRenderer();
    await renderer.initialize();

    // Use zoom 2 (Z3 is not cached — client renders locally)
    const pngBuffer = await renderer.getChunk('TestMap', 'Earth', 2, 0, 0, 2);

    expect(pngBuffer).not.toBeNull();

    // Check disk cache
    const cachePath = renderer.getChunkCachePath('TestMap', 'Earth', 2, 0, 0, 2);
    expect(fs.existsSync(cachePath)).toBe(true);

    // Second call should return cached version
    const cachedBuffer = await renderer.getChunk('TestMap', 'Earth', 2, 0, 0, 2);
    expect(cachedBuffer).not.toBeNull();
    expect(cachedBuffer!.equals(pngBuffer!)).toBe(true);
  });

  it('should generate chunk with non-transparent pixels', async () => {
    const renderer = createRenderer();
    await renderer.initialize();
    renderer.loadMapData('TestMap');

    const rgbaBuffer = renderer.generateChunkRGBA('Earth', 2, 0, 0, 'TestMap');
    expect(rgbaBuffer).not.toBeNull();

    // The chunk should have some non-transparent pixels (tile index 0 is in the atlas)
    let nonTransparentCount = 0;
    for (let i = 0; i < rgbaBuffer!.length; i += 4) {
      if (rgbaBuffer![i + 3] > 0) nonTransparentCount++;
    }

    expect(nonTransparentCount).toBeGreaterThan(0);
  });

  it('should flatten vegetation tiles during chunk generation', async () => {
    // Create a map with special tiles (0x34 = GrassSpecial0)
    const mapBmp = createSyntheticMapBmp(64, 64, () => 0x34);
    fs.writeFileSync(path.join(tmpMapCache, 'Maps', 'TestMap', 'TestMap.bmp'), mapBmp);

    const renderer = createRenderer();
    await renderer.initialize();
    renderer.loadMapData('TestMap');

    // 0x34 (GrassSpecial) should be flattened to 0x00 (GrassCenter) which IS in the atlas
    const rgbaBuffer = renderer.generateChunkRGBA('Earth', 2, 0, 0, 'TestMap');
    expect(rgbaBuffer).not.toBeNull();

    let nonTransparentCount = 0;
    for (let i = 0; i < rgbaBuffer!.length; i += 4) {
      if (rgbaBuffer![i + 3] > 0) nonTransparentCount++;
    }

    // Should have non-transparent pixels because 0x34 was flattened to 0x00
    expect(nonTransparentCount).toBeGreaterThan(0);
  });

  it('should handle edge chunks (partial tiles at map boundary)', async () => {
    const renderer = createRenderer();
    await renderer.initialize();
    renderer.loadMapData('TestMap');

    // Map is 64x64, CHUNK_SIZE=32, so chunk (1,1) is valid (tiles 32-63)
    const rgbaBuffer = renderer.generateChunkRGBA('Earth', 2, 1, 1, 'TestMap');
    expect(rgbaBuffer).not.toBeNull();

    // Chunk (2,2) would be beyond map bounds — chunk (2,0) has tiles 64+ which is out of bounds for 64-tile map
    const outOfBounds = renderer.generateChunkRGBA('Earth', 2, 2, 2, 'TestMap');
    // Should still succeed but produce all-transparent chunk
    expect(outOfBounds).not.toBeNull();
  });

  it('should return null for missing atlas', async () => {
    const renderer = createRenderer();
    await renderer.initialize();
    renderer.loadMapData('TestMap');

    // Try to generate with non-existent terrain type
    const result = renderer.generateChunkRGBA('NonExistent', 0, 0, 0, 'TestMap');
    expect(result).toBeNull();
  });

  it('should generate correct chunk manifest', async () => {
    const renderer = createRenderer();
    await renderer.initialize();

    const manifest = renderer.getChunkManifest('TestMap', 'Earth', 2);

    expect(manifest).not.toBeNull();
    expect(manifest!.mapName).toBe('TestMap');
    expect(manifest!.terrainType).toBe('Earth');
    expect(manifest!.season).toBe(2);
    expect(manifest!.mapWidth).toBe(64);
    expect(manifest!.mapHeight).toBe(64);
    expect(manifest!.chunkSize).toBe(32);
    expect(manifest!.chunksI).toBe(2); // ceil(64/32)
    expect(manifest!.chunksJ).toBe(2);
    expect(manifest!.chunkWidth).toBe(CHUNK_CANVAS_WIDTH);
    expect(manifest!.chunkHeight).toBe(CHUNK_CANVAS_HEIGHT);
    expect(manifest!.zoomLevel).toBe(3);
    expect(manifest!.u).toBe(32);
    expect(manifest!.zoomLevels).toEqual([0, 1, 2, 3]);
  });

  it('should invalidate map cache', async () => {
    const renderer = createRenderer();
    await renderer.initialize();

    // Generate a chunk to populate cache (use zoom 2)
    await renderer.getChunk('TestMap', 'Earth', 2, 0, 0, 2);
    expect(renderer.isChunkCached('TestMap', 'Earth', 2, 0, 0, 2)).toBe(true);

    // Invalidate
    renderer.invalidateMap('TestMap');
    expect(renderer.isChunkCached('TestMap', 'Earth', 2, 0, 0, 2)).toBe(false);
  });

  it('should include zoom level in cache path', () => {
    const renderer = createRenderer();

    const pathZ0 = renderer.getChunkCachePath('TestMap', 'Earth', 2, 0, 0, 0);
    const pathZ3 = renderer.getChunkCachePath('TestMap', 'Earth', 2, 0, 0, 3);

    expect(pathZ0).toContain('z0');
    expect(pathZ3).toContain('z3');
    expect(pathZ0).not.toEqual(pathZ3);
  });

  it('should generate all zoom levels for a chunk (including Z3)', async () => {
    const renderer = createRenderer();
    await renderer.initialize();
    renderer.loadMapData('TestMap');

    const success = await renderer.generateChunkAllZooms('TestMap', 'Earth', 2, 0, 0);
    expect(success).toBe(true);

    // All zoom levels (Z0-Z3) should be cached on disk
    for (let z = 0; z <= 3; z++) {
      expect(renderer.isChunkCached('TestMap', 'Earth', 2, 0, 0, z)).toBe(true);
    }

    // Verify Z3, Z2 and Z0 produce valid non-empty WebP files
    const z3Buf = fs.readFileSync(renderer.getChunkCachePath('TestMap', 'Earth', 2, 0, 0, 3));
    const z2Buf = fs.readFileSync(renderer.getChunkCachePath('TestMap', 'Earth', 2, 0, 0, 2));
    const z0Buf = fs.readFileSync(renderer.getChunkCachePath('TestMap', 'Earth', 2, 0, 0, 0));

    expect(z3Buf.length).toBeGreaterThan(0);
    expect(z2Buf.length).toBeGreaterThan(0);
    expect(z0Buf.length).toBeGreaterThan(0);
    // Z3 (2080×1056) > Z2 (1040×528) > Z0 (260×132)
    expect(z3Buf.length).toBeGreaterThan(z2Buf.length);
    expect(z2Buf.length).toBeGreaterThan(z0Buf.length);

    // Verify WebP signature (RIFF....WEBP)
    expect(z3Buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(z3Buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(z2Buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(z2Buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(z0Buf.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(z0Buf.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('should serve zoom-specific chunks via getChunk (Z3 returns WebP)', async () => {
    const renderer = createRenderer();
    await renderer.initialize();

    // Request zoom 1 chunk — should succeed
    const z1Png = await renderer.getChunk('TestMap', 'Earth', 2, 0, 0, 1);
    expect(z1Png).not.toBeNull();

    // Verify it's correctly sized (2 downscales from zoom 3)
    const decoded = await decodeWebP(z1Png!);
    expect(decoded.width).toBe(Math.floor(CHUNK_CANVAS_WIDTH / 4));
    expect(decoded.height).toBe(Math.floor(CHUNK_CANVAS_HEIGHT / 4));

    // Request zoom 3 chunk — should now return a WebP buffer (server pre-generates Z3)
    const z3Png = await renderer.getChunk('TestMap', 'Earth', 2, 0, 0, 3);
    expect(z3Png).not.toBeNull();

    // Verify Z3 is full resolution
    const z3Decoded = await decodeWebP(z3Png!);
    expect(z3Decoded.width).toBe(CHUNK_CANVAS_WIDTH);
    expect(z3Decoded.height).toBe(CHUNK_CANVAS_HEIGHT);
  });

  it('should return false from generateChunkAllZooms for missing atlas', async () => {
    const renderer = createRenderer();
    await renderer.initialize();
    renderer.loadMapData('TestMap');

    const success = await renderer.generateChunkAllZooms('TestMap', 'NonExistent', 0, 0, 0);
    expect(success).toBe(false);
  });

  describe('terrain preview generation', () => {
    it('should generate a terrain preview PNG', async () => {
      const renderer = createRenderer();
      await renderer.initialize();

      const preview = await renderer.getTerrainPreview('TestMap', 'Earth', 2);

      expect(preview).not.toBeNull();
      // Verify it's a valid PNG
      expect(preview![0]).toBe(137); // PNG signature
      expect(preview![1]).toBe(80);

      // Decode and verify dimensions are reasonable for a 64×64 tile map
      const decoded = decodePng(preview!);
      expect(decoded.width).toBeGreaterThan(0);
      expect(decoded.height).toBeGreaterThan(0);
      // Z0 scale: 4px per tile unit, so preview should be small
      expect(decoded.width).toBeLessThan(2000);
      expect(decoded.height).toBeLessThan(2000);
    });

    it('should cache preview to disk', async () => {
      const renderer = createRenderer();
      await renderer.initialize();

      await renderer.getTerrainPreview('TestMap', 'Earth', 2);

      const cachePath = renderer.getPreviewCachePath('TestMap', 'Earth', 2);
      expect(fs.existsSync(cachePath)).toBe(true);
    });

    it('should return cached preview on second call', async () => {
      const renderer = createRenderer();
      await renderer.initialize();

      const first = await renderer.getTerrainPreview('TestMap', 'Earth', 2);
      const second = await renderer.getTerrainPreview('TestMap', 'Earth', 2);

      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(first!.equals(second!)).toBe(true);
    });

    it('should return null for missing map', async () => {
      const renderer = createRenderer();
      await renderer.initialize();

      const preview = await renderer.getTerrainPreview('NonExistent', 'Earth', 2);
      expect(preview).toBeNull();
    });

    it('should return null for missing atlas', async () => {
      const renderer = createRenderer();
      await renderer.initialize();

      const preview = await renderer.getTerrainPreview('TestMap', 'NonExistent', 0);
      expect(preview).toBeNull();
    });

    it('should produce preview with non-transparent pixels', async () => {
      const renderer = createRenderer();
      await renderer.initialize();

      const preview = await renderer.getTerrainPreview('TestMap', 'Earth', 2);
      expect(preview).not.toBeNull();

      const decoded = decodePng(preview!);
      let nonTransparentCount = 0;
      for (let i = 0; i < decoded.pixels.length; i += 4) {
        if (decoded.pixels[i + 3] > 0) nonTransparentCount++;
      }
      expect(nonTransparentCount).toBeGreaterThan(0);
    });
  });
});
