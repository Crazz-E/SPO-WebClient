# Concrete Rendering System

Technical reference for the concrete texture system around buildings.

## Overview

Concrete textures are drawn around buildings to create paved areas. The system uses:
- **Land concrete** (IDs 0-12): Standard pavement on land
- **Water platforms** (IDs $80-$88): Platform textures for buildings near/on water
- **Road concrete** (IDs $10-$1B): Concrete under roads

## Coordinate System

Isometric cardinal directions relative to screen:
```
           N (row-1)
           ↗ top-right
           │
W (col-1) ─┼─ E (col+1)
top-left   │  bottom-right
           ↙
           S (row+1)
           bottom-left
```

## Land Concrete Textures

| ID | Texture | Pattern | Visual Position |
|----|---------|---------|-----------------|
| 0 | Conc1.bmp | Vertical/horizontal strip | Edge strip |
| 1 | Conc2.bmp | All cardinals, missing TL diagonal | Corner notch TL |
| 2 | Conc3.bmp | NE corner exposed | NE corner |
| 3 | Conc4.bmp | NW corner exposed | NW corner |
| 4 | Conc5.bmp | All cardinals, missing TR diagonal | Corner notch TR |
| 5 | Conc6.bmp | Right/East edge exposed | E edge |
| 6 | Conc7.bmp | Top/South edge exposed | S edge |
| 7 | Conc8.bmp | Left/West edge exposed | W edge |
| 8 | Conc9.bmp | All cardinals, missing BR diagonal | Corner notch BR |
| 9 | Conc10.bmp | SW corner exposed | SW corner |
| 10 | Conc11.bmp | SE corner exposed | SE corner |
| 11 | Conc12.bmp | All cardinals, missing BL diagonal | Corner notch BL |
| 12 | Conc13.bmp | Full concrete (all neighbors) | Center |

## Water Platform Textures

| ID | Texture | Size | Cardinals Present | Edge Exposed |
|----|---------|------|-------------------|--------------|
| $80 (128) | platC.bmp | 64×80 | All 4 | Center (none) |
| $81 (129) | platE.bmp | 64×80 | T,L,B | East edge |
| $82 (130) | platN.bmp | 64×80 | L,R,B | North edge |
| $83 (131) | platNE.bmp | 64×80 | L,B | NE corner |
| $84 (132) | platNW.bmp | 64×80 | R,B | NW corner |
| $85 (133) | platS.bmp | 64×80 | T,L,R | South edge |
| $86 (134) | platSE.bmp | 64×80 | T,L | SE corner |
| $87 (135) | platSW.bmp | 64×80 | T,R | SW corner |
| $88 (136) | platW.bmp | 68×80 | T,R,B | West edge |

### Platform Texture Anatomy

All platform BMPs are 80px tall (platW is 68px wide, the rest are 64px). After BMP decoding
(which flips bottom-up rows to top-down), the internal structure is:

```
Row 0-23:  Transparent (empty above the wall)
Row 24-29: Wall/edge content (N/E/W edge textures only — absent on platC/S/SE/SW/NE/NW)
Row 30:    ▲ DIAMOND TOP VERTEX — isometric diamond starts here
Row 46:    ◄► DIAMOND LEFT/RIGHT VERTICES (widest row = row 30 + 16)
Row 62:    ▼ DIAMOND BOTTOM VERTEX (row 30 + 32 = standard tile height)
Row 63-79: Foundation/pillar content extending below the diamond
```

**Key constant:** `PLATFORM_DIAMOND_TOP = 30` — the decoded row where the isometric diamond
begins. This is constant across ALL 9 platform textures (verified by pixel analysis).

Edge textures (platN, platE, platW) have wall content in rows 24-29 that extends *above* the
diamond. Foundation content (platS, platE, platW, platSE, platSW) extends *below* the diamond
bottom vertex (row 62).

## Decision Tree Logic

The concrete ID is determined by which neighbors have concrete:

```
Pattern: [Top][Left][Right][Bottom] (cardinal neighbors)

TL__ (T+L present, R+B missing) → ID 3  (NW corner, Conc4)
__RB (R+B present, T+L missing) → ID 10 (SE corner, Conc11)
T_R_ (T+R present, L+B missing) → ID 9  (SW corner, Conc10)
_L_B (L+B present, T+R missing) → ID 2  (NE corner, Conc3)
_LRB (L+R+B present, T missing) → ID 0  (North edge, Conc1)
TLR_ (T+L+R present, B missing) → ID 6  (South edge, Conc7)
TL_B (T+L+B present, R missing) → ID 5  (East edge, Conc6)
T_RB (T+R+B present, L missing) → ID 7  (West edge, Conc8)
TLRB (all present)              → ID 12 or check diagonals
```

## Painter's Algorithm

Concrete tiles are sorted by `(i + j)` ascending before drawing:
- Lower `(i+j)` = back of screen (drawn first)
- Higher `(i+j)` = front of screen (drawn last, overlaps previous)

This ensures proper visual overlap at corners.

## Water Platform Detection

A tile uses water platform textures if:
1. The tile itself is on water (LandClass.ZoneD), OR
2. Any cardinal neighbor is on water

```typescript
function isWaterPlatformTile(row, col, mapData): boolean {
  if (landClassOf(mapData.getLandId(row, col)) === LandClass.ZoneD) return true;
  // Check cardinal neighbors for water
  for (const [nRow, nCol] of cardinalNeighbors) {
    if (landClassOf(mapData.getLandId(nRow, nCol)) === LandClass.ZoneD) return true;
  }
  return false;
}
```

## Rendering and Positioning

### Land Concrete (standard 32px textures)

Standard concrete textures (Conc1-Conc13) are 64×32 — the diamond occupies the entire texture
height. No vertical offset is needed:

```typescript
const drawY = screenY;  // yOffset = 0 (scaledHeight - tileHeight = 0)
```

### Water Platforms (80px textures)

Platform textures are 80px tall with the isometric diamond starting at row 30. The rendering
must align the texture's internal diamond with the tile's screen position.

`mapToScreen()` returns the **top vertex** of the isometric diamond. The texture must be
shifted upward so that its row 30 (diamond top) aligns with `screenY`:

```typescript
const PLATFORM_DIAMOND_TOP = 30;
const scaleFactor = config.tileWidth / 64;  // zoom-dependent scale
const yOffset = Math.round(PLATFORM_DIAMOND_TOP * scaleFactor);
const drawY = screenY - yOffset;
```

This positions the texture so:
- Rows 0-29 (wall content) render *above* the tile position
- Rows 30-61 (diamond) align exactly with the tile
- Rows 62-79 (foundation) render *below* the diamond

**Important:** `PLATFORM_SHIFT = 12` (used for roads, buildings, and vehicles on water) is
**NOT** used for concrete texture positioning. Concrete uses `PLATFORM_DIAMOND_TOP = 30`.

### Object Atlas

Platform textures are packed into the concrete object atlas with variable cell size (68×80).
The atlas uses bottom-alignment: each texture is anchored at the cell bottom. The manifest
stores actual texture position and dimensions per entry, so the client reads `sw`/`sh` to
get correct source rectangles regardless of texture size.

## INI File Format

Concrete textures are defined in `cache/ConcreteClasses/*.ini`:

```ini
[General]
Id = 3          ; Decimal ID
; or
Id = $83        ; Hexadecimal ID (Delphi format)

[Images]
64X32 = Conc4.bmp
```

## Debug Mode

Press `D` to enable debug mode, then `3` to toggle concrete overlay, `4` for water grid:

| Key | What it shows |
|-----|---------------|
| `3` | `$XX` concrete ID hex on each tile (cyan=water platform, purple=land) |
| `4` | Color-coded isometric diamond outlines: Green=building buffer, Blue=junction, Orange=road |

The mouse detail panel (bottom-left) shows texture filename and neighbor configuration for
the tile under the cursor.

## Key Files

| File | Purpose |
|------|---------|
| `src/client/renderer/concrete-texture-system.ts` | Core texture selection logic |
| `src/client/renderer/isometric-map-renderer.ts` | Rendering, positioning, and debug overlay |
| *(SPO-WebClient-Chunks)* | Object atlas packing (variable cell heights) — build-time, published to the `spo.zz.works` CDN, not in this repo since `6fc8611f` |
| `cache/ConcreteClasses/*.ini` | Texture ID definitions |
| `cache/ConcreteImages/*.bmp` | Texture assets (plat*.bmp = water platforms) |
