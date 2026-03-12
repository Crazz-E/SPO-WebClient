/**
 * terrain-chunk-worker.ts
 *
 * Worker thread for parallel terrain chunk rendering.
 *
 * Lifecycle:
 *   1. Main thread sends 'init' with all atlas pixel data + manifests.
 *   2. Worker stores atlases in memory, replies 'ready'.
 *   3. Main thread sends 'mapData' lazily (first job for a given map).
 *   4. Main thread sends 'renderChunk' jobs.
 *   5. Worker renders zoom-3 RGBA, cascades downscale to zoom 0, encodes 4 WebPs.
 *   6. Worker replies 'chunkDone' with the 4 WebP buffers.
 *
 * All pixel math is identical to TerrainChunkRenderer.generateChunkRGBA()
 * and generateChunkAllZooms() — kept in sync manually.
 */

import { parentPort } from 'worker_threads';
import { encodeWebP, downscaleRGBA2x } from './texture-alpha-baker';
import { isSpecialTile } from '../shared/land-utils';
import {
  blitTileWithAlpha,
  getTileScreenPosInChunk,
  CHUNK_SIZE,
  CHUNK_CANVAS_WIDTH,
  CHUNK_CANVAS_HEIGHT,
} from './terrain-chunk-renderer';
import type { AtlasManifest } from './atlas-generator';

if (!parentPort) throw new Error('terrain-chunk-worker must run as a worker thread');

// ---------------------------------------------------------------------------
// Constants (mirror terrain-chunk-renderer.ts private consts)
// ---------------------------------------------------------------------------

const MAX_ZOOM = 3;
const FLAT_MASK = 0xC0;
const ZOOM3_HALF_WIDTH = 32; // ZOOM3_TILE_WIDTH / 2

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

interface AtlasEntry {
  pixels: Buffer;
  width: number;
  height: number;
  manifest: AtlasManifest;
}

interface MapEntry {
  indices: Uint8Array;
  width: number;
  height: number;
}

/** Atlas pixel data: "terrainType-season" → entry */
const atlasStore = new Map<string, AtlasEntry>();

/** Map palette index data: mapName → entry */
const mapStore = new Map<string, MapEntry>();

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

type AtlasPayload = {
  key: string;
  pixels: Buffer | Uint8Array;
  width: number;
  height: number;
  manifest: AtlasManifest;
};

type WorkerInMsg =
  | { type: 'init'; atlases: AtlasPayload[] }
  | { type: 'mapData'; mapName: string; indices: Uint8Array; width: number; height: number }
  | { type: 'renderChunk'; jobId: string; mapName: string; terrainType: string; season: number; chunkI: number; chunkJ: number };

type WorkerOutMsg =
  | { type: 'ready' }
  | { type: 'chunkDone'; jobId: string; pngs: Buffer[] }
  | { type: 'error'; jobId: string; message: string };

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

parentPort.on('message', (msg: WorkerInMsg) => {
  switch (msg.type) {
    case 'init': {
      for (const { key, pixels, width, height, manifest } of msg.atlases) {
        // Ensure we have a proper Buffer (postMessage delivers as Uint8Array)
        atlasStore.set(key, {
          pixels: Buffer.isBuffer(pixels) ? pixels : Buffer.from(pixels),
          width,
          height,
          manifest,
        });
      }
      (parentPort as NonNullable<typeof parentPort>).postMessage({ type: 'ready' } satisfies WorkerOutMsg);
      break;
    }

    case 'mapData': {
      mapStore.set(msg.mapName, {
        indices: msg.indices instanceof Uint8Array ? msg.indices : new Uint8Array(msg.indices),
        width: msg.width,
        height: msg.height,
      });
      break;
    }

    case 'renderChunk': {
      const { jobId, mapName, terrainType, season, chunkI, chunkJ } = msg;
      renderChunkAllZooms(terrainType, season, chunkI, chunkJ, mapName)
        .then(pngs => {
          if (!pngs) {
            (parentPort as NonNullable<typeof parentPort>).postMessage(
              { type: 'error', jobId, message: `Atlas '${terrainType}-${season}' or map '${mapName}' not loaded` } satisfies WorkerOutMsg
            );
            return;
          }
          (parentPort as NonNullable<typeof parentPort>).postMessage(
            { type: 'chunkDone', jobId, pngs } satisfies WorkerOutMsg
          );
        })
        .catch((err: unknown) => {
          (parentPort as NonNullable<typeof parentPort>).postMessage(
            { type: 'error', jobId, message: String(err) } satisfies WorkerOutMsg
          );
        });
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Rendering kernel
// ---------------------------------------------------------------------------

/**
 * Render all zoom levels for a single chunk.
 * Returns [zoom3, zoom2, zoom1, zoom0] WebP buffers, or null if data missing.
 */
async function renderChunkAllZooms(
  terrainType: string,
  season: number,
  chunkI: number,
  chunkJ: number,
  mapName: string,
): Promise<Buffer[] | null> {
  const atlasKey = `${terrainType}-${season}`;
  const atlas = atlasStore.get(atlasKey);
  if (!atlas) return null;

  const map = mapStore.get(mapName);
  if (!map) return null;

  // Allocate chunk RGBA buffer (transparent)
  const pixels = Buffer.alloc(CHUNK_CANVAS_WIDTH * CHUNK_CANVAS_HEIGHT * 4, 0);

  const startI = chunkI * CHUNK_SIZE;
  const startJ = chunkJ * CHUNK_SIZE;
  const endI = Math.min(startI + CHUNK_SIZE, map.height);
  const endJ = Math.min(startJ + CHUNK_SIZE, map.width);

  // Render tiles — same logic as TerrainChunkRenderer.generateChunkRGBA()
  for (let i = startI; i < endI; i++) {
    for (let j = startJ; j < endJ; j++) {
      let textureId = map.indices[i * map.width + j];
      if (isSpecialTile(textureId)) textureId = textureId & FLAT_MASK;

      const tileEntry = atlas.manifest.tiles[String(textureId)];
      if (!tileEntry) continue;

      const localI = i - startI;
      const localJ = j - startJ;
      const screenPos = getTileScreenPosInChunk(localI, localJ);

      blitTileWithAlpha(
        atlas.pixels, atlas.width,
        tileEntry.x, tileEntry.y, tileEntry.width, tileEntry.height,
        pixels, CHUNK_CANVAS_WIDTH, CHUNK_CANVAS_HEIGHT,
        screenPos.x - ZOOM3_HALF_WIDTH, screenPos.y,
      );
    }
  }

  // buffers[0]=zoom3 (empty sentinel), buffers[1]=zoom2, buffers[2]=zoom1, buffers[3]=zoom0
  const buffers: Buffer[] = [];
  buffers.push(Buffer.alloc(0)); // Z3 not cached — client renders locally from atlas

  let curPixels: Buffer = pixels;
  let curW = CHUNK_CANVAS_WIDTH;
  let curH = CHUNK_CANVAS_HEIGHT;

  for (let z = MAX_ZOOM - 1; z >= 0; z--) {
    const scaled = downscaleRGBA2x(curPixels, curW, curH);
    curPixels = scaled.pixels;
    curW = scaled.width;
    curH = scaled.height;
    buffers.push(await encodeWebP(curW, curH, curPixels));
  }

  return buffers;
}
