# Texture → Rendering Architecture

Developer reference for the full asset pipeline: from raw game files to pixels on screen.

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
                    ═══════════════╪════════════════
                       SERVER      │
                    ═══════════════╪════════════════
                                   ▼
                ┌──────────────────────────────────────┐
                │    TextureExtractor (Service)         │
                │    texture-extractor.ts               │
                │                                      │
                │  CAB → BMP → PNG (alpha-baked)       │
                │  INI → palette index mapping          │
                └──────────┬───────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐  ┌──────────────────────────┐
│  AtlasGenerator      │  │  AtlasGenerator          │
│  atlas-generator.ts  │  │  atlas-generator.ts      │
│                      │  │                          │
│  TERRAIN ATLAS       │  │  OBJECT ATLAS            │
│  16×16 grid          │  │  Dynamic grid            │
│  1024×1536 px        │  │  roads / concrete / cars │
│  256 palette slots   │  │                          │
│         │            │  │         │                │
│  atlas.png + .json   │  │  *-atlas.png + .json     │
└─────────┬────────────┘  └─────────┬────────────────┘
          │                         │
          ▼                         │
┌───────────────────────┐           │
│ TerrainChunkRenderer  │           │
│ terrain-chunk-        │           │
│   renderer.ts         │           │
│                       │           │
│ atlas + map.bmp       │           │
│   → 32×32-tile chunks │           │
│   → Z3→Z2→Z1→Z0      │           │
│     (downscale 2×)    │           │
│   → WebP to disk      │           │
│                       │           │
│ webclient-cache/      │           │
│  chunks/{map}/{type}/ │           │
│  {season}/z{0-3}/     │           │
│  chunk_{i}_{j}.webp   │           │
└─────────┬─────────────┘           │
          │                         │
          ▼                         ▼
┌─────────────────────────────────────────────────────┐
│              HTTP API (server.ts)                     │
│                                                      │
│  /api/terrain-chunk/:map/:type/:s/:z/:i/:j  → WebP  │
│  /api/terrain-atlas/:type/:season           → PNG   │
│  /api/terrain-atlas/:type/:season/manifest  → JSON  │
│  /api/object-atlas/:category                → PNG   │
│  /api/object-atlas/:category/manifest       → JSON  │
│  /api/map-data/:mapName                     → JSON  │
│  /cache/:category/:filename                 → GIF   │
│                                                      │
│  Cache-Control: public, max-age=31536000 (1 year)    │
└──────────────────────┬──────────────────────────────┘
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
| TextureExtractor | `src/server/texture-extractor.ts` | CAB→BMP→PNG (alpha-baked), INI palette parsing |
| AtlasGenerator | `src/server/atlas-generator.ts` | Terrain atlas (16×16 fixed grid) + object atlas (dynamic grid) |
| TerrainChunkRenderer | `src/server/terrain-chunk-renderer.ts` | 32×32-tile chunks, Z3→Z0 downscale cascade, worker pool |
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
