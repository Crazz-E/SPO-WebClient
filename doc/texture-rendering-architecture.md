# Texture → Rendering Architecture

Developer reference for the full asset pipeline: from raw game files to pixels on screen.

> **Where the first half runs.** Extraction, atlas building and chunk generation left this
> repository in `6fc8611f` — they are the standalone
> [SPO-WebClient-Chunks](https://github.com/Crazz-E/SPO-WebClient-Chunks) tool, and its output is
> published to the Cloudflare R2 CDN at `https://spo.zz.works`. Nothing below the CDN box is
> built at runtime any more; the client fetches it. `src/server/texture-extractor.ts`,
> `atlas-generator.ts` and `terrain-chunk-renderer.ts` no longer exist here.

```
                        ┌─────────────────────────────────┐
                        │        ASSET SOURCES             │
                        │                                  │
                        │  cache/landimages/*.cab  (terrain)│
                        │  cache/LandClasses/*.ini (palette)│
                        │  cache/RoadBlockImages/  (roads)  │
                        │  cache/ConcreteImages/   (paving) │
                        │  cache/CarImages/        (cars)   │
                        │  cache/Maps/*.bmp        (maps)   │
                        └──────────┬───────────────────────┘
                                   │
              ═════════════════════╪════════════════════
                 BUILD TIME —      │  a separate repository
                 SPO-WebClient-    │  (github.com/Crazz-E/
                 Chunks            │   SPO-WebClient-Chunks)
              ═════════════════════╪════════════════════
                                   ▼
                ┌──────────────────────────────────────┐
                │  CAB → BMP → PNG (alpha-baked)       │
                │  INI → palette index mapping          │
                │                                      │
                │  TERRAIN ATLAS  16×16, 1024×1536 px, │
                │                 256 palette slots     │
                │  OBJECT ATLAS   dynamic grid —        │
                │                 roads/concrete/cars   │
                │                                      │
                │  atlas + map.bmp → 32×32-tile chunks │
                │    → Z3→Z2→Z1→Z0 (downscale 2×)     │
                │    → WebP                            │
                └──────────────────┬───────────────────┘
                                   │  published once, offline
                                   ▼
┌─────────────────────────────────────────────────────┐
│        CLOUDFLARE R2 CDN — https://spo.zz.works       │
│                                                      │
│  chunks/{map}/{type}/{season}/z{0-3}/                │
│                             chunk_{i}_{j}.webp        │
│  the terrain and object atlases + their manifests    │
│                                                      │
│  `config.cdn.url` (src/shared/config.ts) — override  │
│  with CHUNK_CDN_URL, or set it EMPTY to fall back to │
│  the local `/cdn/...` path for offline development   │
└──────────────────────┬──────────────────────────────┘
                       │
                       │   still served by server.ts, NOT the CDN:
                       │     /api/map-data/:mapName      → JSON
                       │     /api/terrain-info/:map      → JSON (seasons)
                       │     /cache/:category/:filename  → GIF
                       │       (BuildingImages are excluded from the CDN)
                       │
          ═════════════╪════════════════
             CLIENT    │  (Browser)
          ═════════════╪════════════════
                       │
     ┌─────────────────┼──────────────────────┐
     ▼                 ▼                      ▼
┌──────────┐  ┌────────────────┐  ┌────────────────────┐
│ChunkCache│  │TextureAtlas    │  │GameObjectTexture   │
│chunk-    │  │Cache           │  │Cache               │
│cache.ts  │  │texture-atlas-  │  │game-object-        │
│          │  │cache.ts        │  │texture-cache.ts    │
│ fetch    │  │                │  │                    │
│ chunks → │  │ fetch atlas →  │  │ fetch object       │
│ LRU per  │  │ ImageBitmap +  │  │ atlases + GIFs →   │
│ zoom     │  │ manifest       │  │ ImageBitmap[]      │
│ (48-300) │  │ (fallback for  │  │ (roads, concrete,  │
│          │  │  local render) │  │  buildings, cars)  │
└────┬─────┘  └───────┬────────┘  └─────────┬──────────┘
     │                │                      │
     └────────────────┼──────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────┐
│     IsometricMapRenderer  (9-layer composition)      │
│     isometric-map-renderer.ts                        │
│                                                      │
│  Layer 1: TERRAIN   ← ChunkCache (preferred)         │
│           IsometricTerrainRenderer                   │
│           chunk mode: drawImage(chunk, x, y)         │
│           fallback:   drawImage(atlas, src, dst)     │
│                                                      │
│  Layer 2: VEGETATION ← special tiles on top of flat  │
│                                                      │
│  Layer 3: CONCRETE   ← GameObjectTextureCache        │
│           ConcreteTextureSystem                      │
│                                                      │
│  Layer 4: ROADS      ← GameObjectTextureCache        │
│           RoadTextureSystem (topology → texture ID)  │
│                                                      │
│  Layer 5: BUILDINGS  ← GameObjectTextureCache (GIF)  │
│           painter sort by screenY (back→front)       │
│                                                      │
│  Layer 6: VEHICLES   ← GameObjectTextureCache (cars) │
│           VehicleAnimationSystem                     │
│                                                      │
│  Layer 7-9: OVERLAYS (zones, placement ghost, roads) │
│                                                      │
│  Isometric formula:                                  │
│    screenX = origin.x + u × (j - i + chunkSize - 1) │
│    screenY = origin.y + (u/2) × (i + j)             │
│    u = pixels/tile at zoom level (4/8/16/32)         │
│                                                      │
└──────────────────────┬──────────────────────────────┘
                       ▼
                  ┌──────────┐
                  │ <canvas> │
                  │  2D ctx  │
                  └──────────┘
```

## Key Classes

| Class | File | Role |
|-------|------|------|
| TextureExtractor | *(SPO-WebClient-Chunks)* | CAB→BMP→PNG (alpha-baked), INI palette parsing — build-time, not in this repo |
| AtlasGenerator | *(SPO-WebClient-Chunks)* | Terrain atlas (16×16 fixed grid) + object atlas (dynamic grid) — build-time, not in this repo |
| TerrainChunkRenderer | *(SPO-WebClient-Chunks)* | 32×32-tile chunks, Z3→Z0 downscale cascade, worker pool — build-time, not in this repo |
| IsometricMapRenderer | `src/client/renderer/isometric-map-renderer.ts` | 9-layer compositor (terrain→vegetation→concrete→roads→buildings→cars→overlays) |
| IsometricTerrainRenderer | `src/client/renderer/isometric-terrain-renderer.ts` | Terrain layer: chunk mode (fast) or atlas fallback |
| ChunkCache | `src/client/renderer/chunk-cache.ts` | Client chunk fetching + LRU per zoom (48-300 entries) |
| TextureAtlasCache | `src/client/renderer/texture-atlas-cache.ts` | Client atlas + manifest loader (primary terrain texture source) |
| TextureCache | `src/client/renderer/texture-cache.ts` | Fallback individual texture loader (LRU, 512 max) |
| GameObjectTextureCache | `src/client/renderer/game-object-texture-cache.ts` | Roads, concrete, buildings (GIF animation), cars |
| TerrainLoader | `src/client/renderer/terrain-loader.ts` | Map BMP → palette index array (`getTextureId(j, i)`) |
| RoadTextureSystem | `src/client/renderer/road-texture-system.ts` | Road topology detection → texture ID lookup |
| ConcreteTextureSystem | `src/client/renderer/concrete-texture-system.ts` | Context-sensitive concrete tile selection |
| VehicleAnimationSystem | `src/client/renderer/vehicle-animation-system.ts` | Car position interpolation + heading rotation |

## Zoom Levels

| Zoom | Tile Size | Chunk Canvas | u (px/tile) | Chunks Cached (LRU) |
|------|-----------|-------------|-------------|---------------------|
| Z0 | 8×4 | 260×132 | 4 | 300 |
| Z1 | 16×8 | 520×264 | 8 | 160 |
| Z2 | 32×16 | 1040×528 | 16 | 96 |
| Z3 | 64×32 | 2080×1056 | 32 | 48 |

All zoom levels are pre-generated server-side. Z3 is the base resolution; Z2-Z0 are produced by 2× downscaling from Z3.

## Gotchas

- **i/j swap**: `TerrainLoader.getTextureId(j, i)` — provider uses (i,j), loader expects (x,y)
- **Vegetation flattening**: `landId & 0xC0` strips direction/variant bits in chunks; vegetation rendered as separate overlay (Layer 2)
- **Chunks vs atlas**: Chunks are the fast path (~0.2ms blit vs ~5ms for 1024 `drawImage` calls from atlas)
- **Object atlases**: Dynamic grid sizes (not fixed 16×16 like terrain)
- **Buildings**: GIF textures with frame animation; everything else uses atlas source rects
- **Concrete elevation**: Rendered with `screenY - PLATFORM_SHIFT` to appear above water
- **Painter algorithm**: Sort by `screenY` (not just `i+j`) to handle all camera rotations
