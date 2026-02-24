---
name: terrain-rendering
description: "Terrain and concrete rendering: BMP-to-texture pipeline, chunk system, TextureCache LRU, concrete decision tree, atlas system."
user-invokable: false
disable-model-invocation: false
---

# Terrain & Concrete Rendering

Auto-loaded when working on `isometric-terrain-renderer.ts`, `chunk-cache.ts`, `texture-cache.ts`, `texture-atlas-cache.ts`, `concrete-texture-system.ts`, or `terrain-chunk-renderer.ts`.

## BMP to Texture Pipeline

```
BMP File (8-bit indexed)
  -> TerrainLoader.loadMap() — parse BMP, flip rows, extract pixel data
  -> TerrainLoader.getTextureId(x, y) — returns palette index (0-255)
  -> TextureCache.getTextureSync(paletteIndex) — returns ImageBitmap or null
  -> IsometricTerrainRenderer.drawIsometricTile() — render or fallback color
```

**Cache key format:** `${terrainType}-${season}-${paletteIndex}` (e.g., `"Earth-2-128"`)

## CRITICAL GOTCHAS

### TerrainLoader i/j Swap
`getTextureId(j, i)` — the provider uses (i,j) but the loader expects (x,y).
The call site must swap: `loader.getTextureId(col, row)` NOT `(row, col)`.

### Concrete Coordinate Convention
Concrete tiles stored as `"${x},${y}"` (col,row) NOT `"${i},${j}"` (row,col).
Same convention as road tiles.

## Chunk System

- **Chunk size:** 32x32 tiles
- **Caching:** LRU eviction with OffscreenCanvas pre-rendering
- **Zoom levels:** 4 (each level has its own chunk set)
- **Server-side pre-rendering:** `terrain-chunk-renderer.ts` pre-bakes chunks as PNGs

## Cache Limits

| Cache | Max Entries | Purpose |
|-------|------------|---------|
| TextureCache | 1024 | Terrain textures (per palette index) |
| GameObjectTextureCache | 2048 | Road/building/concrete textures + object atlases |

## Concrete Texture IDs

| Range | Type | Textures |
|-------|------|----------|
| 0-12 | Land concrete | Conc1.bmp - Conc13.bmp |
| $80-$88 (128-136) | Water platforms | platC/E/N/NE/NW/S/SE/SW/W.bmp |
| $10-$1B | Road concrete | Under-road concrete |

## Concrete Decision Tree

Determined by which cardinal neighbors have concrete:
```
TL__ -> ID 3  (NW corner)     __RB -> ID 10 (SE corner)
T_R_ -> ID 9  (SW corner)     _L_B -> ID 2  (NE corner)
_LRB -> ID 0  (N edge)        TLR_ -> ID 6  (S edge)
TL_B -> ID 5  (E edge)        T_RB -> ID 7  (W edge)
TLRB -> ID 12 or check diagonals
```

## Water Platform Positioning

Platform textures are 80px tall with diamond at row 30:
```typescript
const PLATFORM_DIAMOND_TOP = 30;
const scaleFactor = config.tileWidth / 64;
const yOffset = Math.round(PLATFORM_DIAMOND_TOP * scaleFactor);
const drawY = screenY - yOffset;
```

**Important:** `PLATFORM_SHIFT = 12` (roads/buildings on water) is NOT used for concrete positioning.

## Isometric Cardinal Directions

```
         N (row-1) -> top-right on screen
         |
W (col-1)-+- E (col+1)
top-left   |  bottom-right
         S (row+1) -> bottom-left on screen
```

## Deep-Dive References

- [Texture Selection Analysis](../../../doc/CANVAS2D-TEXTURE-SELECTION-ANALYSIS.md) — Full pipeline, atlas system, LRU details
- [Concrete Rendering](../../../doc/concrete_rendering.md) — Decision tree, platform anatomy, INI format
