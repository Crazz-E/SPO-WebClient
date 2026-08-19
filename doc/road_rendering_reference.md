# Reference Data - Road Rendering System (Reverse Engineered)

**Source:** Official Starpeace Online client (Delphi)
**Key files:** `Concrete.pas`, `Roads.pas`, `Map.pas`, `VoyagerServerInterfaces.pas`

---

## 1. Water Terrain Types (TerrainGrid)

### 1.1 BMP Palette Encoding

**Source:** `Voyager/Components/MapIsoView/Concrete.pas`

```typescript
const cPlatformFlag = 0x80;  // High bit = water
const cPlatformMask = 0x7F;  // Mask to extract the type

// Detection:
function isWater(paletteIndex: number): boolean {
  return (paletteIndex & 0x80) !== 0;
}

// Type extraction:
function getWaterType(paletteIndex: number): number {
  return paletteIndex & 0x7F;  // Returns 0-8
}
```

### 1.2 Palette → Water Type Mapping Table

| Palette Index | Type Value | Constant | Description |
|---------------|------------|----------|-------------|
| 0x80 (128) | 0 | `WATER_CENTER` | Center (full water, 4 water neighbors) |
| 0x81 (129) | 1 | `WATER_N` | North edge (water to the North) |
| 0x82 (130) | 2 | `WATER_E` | East edge (water to the East) |
| 0x83 (131) | 3 | `WATER_NE` | North-East corner |
| 0x84 (132) | 4 | `WATER_S` | South edge (water to the South) |
| 0x85 (133) | 5 | `WATER_SW` | South-West corner |
| 0x86 (134) | 6 | `WATER_W` | West edge (water to the West) |
| 0x87 (135) | 7 | `WATER_SE` | South-East corner |
| 0x88 (136) | 8 | `WATER_NW` | North-West corner |

**Total:** 9 water types (0-8)

### 1.3 8-Neighbor Configuration

**Source:** `Concrete.pas:66-77` - `cWaterConcreteConfigs`

```typescript
// Configuration [NW, NE, SE, SW] for each water type
// true = neighbor has water, false = neighbor has land
const waterConfigs: boolean[][] = [
  [true,  true,  true,  true],   // 0 - WATER_CENTER (4 water corners)
  [false, true,  false, true],   // 1 - WATER_N (NE and NW water corners)
  [true,  true,  false, false],  // 2 - WATER_E (NE and SE water corners)
  [true,  true,  false, true],   // 3 - WATER_NE (NE, NW, SW water corners)
  [true,  true,  true,  false],  // 4 - WATER_S (SE and SW water corners)
  [false, false, true,  true],   // 5 - WATER_SW (SW and SE water corners)
  [false, true,  true,  true],   // 6 - WATER_W (NW and SW water corners)
  [true,  false, true,  true],   // 7 - WATER_SE (SE, SW, NW water corners)
  [true,  false, true,  false]   // 8 - WATER_NW (NW and SW water corners)
];
```

### 1.4 TypeScript Structure

```typescript
interface TerrainCell {
  isWater: boolean;    // (paletteIndex & 0x80) !== 0
  waterType: number;   // paletteIndex & 0x7F (0-8)
}

class TerrainGridParser {
  parseTerrainGrid(bmpData: Uint8Array, width: number, height: number): TerrainCell[][] {
    const grid: TerrainCell[][] = [];

    for (let i = 0; i < height; i++) {
      grid[i] = [];
      for (let j = 0; j < width; j++) {
        const paletteIndex = bmpData[i * width + j];

        grid[i][j] = {
          isWater: (paletteIndex & 0x80) !== 0,
          waterType: paletteIndex & 0x7F
        };
      }
    }

    return grid;
  }
}
```

---

## 2. Concrete Grid (ConcreteGrid)

### 2.1 Data Source

**Source:** `Map.pas:2312-2321`

**Important:** There is no separate `.concrete` file! Concrete is calculated **dynamically** from urban buildings.

### 2.2 Calculation Algorithm

```typescript
// Pseudo-code based on Map.pas
function calculateConcreteGrid(buildings: Building[]): number[][] {
  const grid: number[][] = Array(mapHeight).fill(0).map(() => Array(mapWidth).fill(0));
  const CONCRETE_SIZE = 2;  // Concrete expansion radius

  for (const building of buildings) {
    if (!building.isUrban) continue;  // Urban buildings only

    const { row, col, size } = building;

    // Expand concrete around the building
    for (let i = row - CONCRETE_SIZE; i < row + size + CONCRETE_SIZE; i++) {
      for (let j = col - CONCRETE_SIZE; j < col + size + CONCRETE_SIZE; j++) {
        if (i >= 0 && i < mapHeight && j >= 0 && j < mapWidth) {
          grid[i][j]++;  // Increment concrete counter
        }
      }
    }
  }

  return grid;
}

// Usage for roads
function hasConcrete(x: number, y: number): boolean {
  return concreteGrid[y][x] > 0;
}
```

### 2.3 Storage Structure

**Source:** `Map.pas` - `TConcreteItems`

```typescript
// 64×64 grid per block (chunk)
type ConcreteItems = Uint8Array;  // [64 * 64]
type TConcrete = number;  // 0-12

// Concrete configurations (similar to water)
const cFullConcrete = 12;      // Full concrete (under a building)
const cRoadConcrete = 0x10;    // Modifier for roads

// 13 concrete configurations based on 8 neighbors (0-12)
// Same logic as water types to determine texture
```

### 2.4 Urban Building Property

```typescript
interface Building {
  id: number;
  row: number;
  col: number;
  size: number;
  isUrban: boolean;  // buildclass.Urban = true → generates concrete
}

// Examples of urban buildings:
// - Offices
// - Shops
// - Residential buildings
// - Public services (police, fire, etc.)
```

---

## 3. Railroad Grid (RailroadGrid)

### 3.1 Segment Format

**Source:** `VoyagerServerInterfaces.pas` - `TSegmentInfo`

```typescript
interface RailSegment {
  x1: number;  // word - Start point X
  y1: number;  // word - Start point Y
  x2: number;  // word - End point X
  y2: number;  // word - End point Y
  cargo?: number[];  // TCargoArray - Transported cargo
}
```

**Format identical to road segments** (`{x1, y1, x2, y2}`)

### 3.2 RDO Protocol

```typescript
const cirRoads = 1;      // Road circuit identifier
const cirRailRoads = 2;  // Rail circuit identifier

// Retrieval via RDO
interface IRailroadsRendering {
  RefreshArea(circuitType: number, x: number, y: number, w: number, h: number): RailSegment[];
}

// Example call
const railSegments = fCircuitsHandler.RefreshArea(cirRailRoads, x, y, width, height);
```

### 3.3 Rail Block Types

**Source:** `Roads.pas`

**Total:** 60 rail block types (vs 16 for roads)

| Category | Examples | Description |
|----------|----------|-------------|
| **Basic** | `rrbNS`, `rrbWE`, `rrbNSStart`, `rrbWEEnd` | Straight segments with start/end |
| **Junctions** | `rrbmNE`, `rrbmtN`, `rrbc` | Merge points and center |
| **Bridges** | `rrbNSBrClimb1`, `rrbNSBrClimb2`, `rrbNSBr`, `rrbNSBrDesc1`, `rrbNSBrDesc2` | Rails on bridges with climb/descent |
| **Crossings** | `rrbcNE`, `rrbctN` | Railway crossings |

**Difference from roads:**
- Roads: 16 types (simple topology)
- Rails: 60 types (includes bridges with elevation, complex crossings)

### 3.4 TypeScript Structure

```typescript
class RailroadGridBuilder {
  buildRailroadGrid(segments: RailSegment[], width: number, height: number): boolean[][] {
    const grid: boolean[][] = Array(height).fill(false).map(() => Array(width).fill(false));

    for (const segment of segments) {
      const { x1, y1, x2, y2 } = segment;

      // Mark all cells in the segment
      if (x1 === x2) {
        // Vertical segment
        const yMin = Math.min(y1, y2);
        const yMax = Math.max(y1, y2);
        for (let y = yMin; y <= yMax; y++) {
          grid[y][x1] = true;
        }
      } else if (y1 === y2) {
        // Horizontal segment
        const xMin = Math.min(x1, x2);
        const xMax = Math.max(x1, x2);
        for (let x = xMin; x <= xMax; x++) {
          grid[y1][x] = true;
        }
      }
    }

    return grid;
  }

  hasRailroad(x: number, y: number): boolean {
    return railroadGrid[y][x] === true;
  }
}
```

---

## 4. Official Road Textures

### 4.1 File Organization

**Source:** Official Starpeace Online client

```
cache/
├── RoadBlockImages/      ← Textures downloaded from server
│   ├── Roadvert.bmp
│   ├── Roadhorz.bmp
│   ├── RoadcornerN.bmp
│   ├── RoadcornerE.bmp
│   ├── RoadcornerS.bmp
│   ├── RoadcornerW.bmp
│   ├── RoadTN.bmp
│   ├── RoadTE.bmp
│   ├── RoadTS.bmp
│   ├── RoadTW.bmp
│   ├── Roadcross.bmp
│   └── ... (urban, bridge variants, etc.)
└── RoadBlockClasses/     ← INI configuration files
    └── *.ini
```

**Important:** The development repo does NOT contain production textures. They are downloaded dynamically from the server.

### 4.2 Road Block Types

**Source:** `Roads.pas` - Enum `TRoadBlock`

| ID | Name | Constant | Description |
|----|------|----------|-------------|
| 0 | None | `rbNone` | No road |
| 1 | NS Start | `rbNSRoadStart` | North-South segment start |
| 2 | NS End | `rbNSRoadEnd` | North-South segment end |
| 3 | WE Start | `rbWERoadStart` | West-East segment start |
| 4 | WE End | `rbWERoadEnd` | West-East segment end |
| 5 | NS | `rbNS` | North-South segment |
| 6 | WE | `rbWE` | West-East segment |
| 7 | Left Plug | `rbLeftPlug` | T-junction open left |
| 8 | Right Plug | `rbRightPlug` | T-junction open right |
| 9 | Top Plug | `rbTopPlug` | T-junction open top |
| 10 | Bottom Plug | `rbBottomPlug` | T-junction open bottom |
| 11 | Corner W | `rbCornerW` | West corner |
| 12 | Corner S | `rbCornerS` | South corner |
| 13 | Corner N | `rbCornerN` | North corner |
| 14 | Corner E | `rbCornerE` | East corner |
| 15 | Crossroads | `rbCrossRoads` | 4-way intersection |

**Total:** 16 base types

### 4.3 Image Format

**Specifications:**
- **Dimensions:** 64x32 pixels (isometric)
- **Format:** BMP (Windows Bitmap)
- **Depth:** 8-bit indexed color (palette)
- **Transparency:** Color key (specific RGB per type)

**Additional variants:**
- Each type can have a **railing** image (`RailingImgPath`)
- **Urban** variants (on concrete)
- **Bridge** variants (over water)
- **Level crossing** variants (over rails)
- **Smooth corner** variants (rounded corners)

### 4.4 File Naming Convention

**Current format (official client):**
```
Road{Type}.bmp
```

**Examples:**
```
Roadvert.bmp          → Vertical segment (N-S)
Roadhorz.bmp          → Horizontal segment (E-W)
RoadcornerN.bmp       → North corner
RoadcornerE.bmp       → East corner
RoadcornerS.bmp       → South corner
RoadcornerW.bmp       → West corner
RoadTN.bmp            → T-junction open North
RoadTE.bmp            → T-junction open East
RoadTS.bmp            → T-junction open South
RoadTW.bmp            → T-junction open West
Roadcross.bmp         → Crossroads
```

**Extended format (with surfaces):**
```
Road{Type}_{Surface}.bmp
```

**Theoretical examples (complete system):**
```
Roadvert_land.bmp         → Rural vertical
Roadvert_urban.bmp        → Urban vertical
Roadhorz_bridge_east.bmp  → Horizontal bridge eastbound
RoadcornerE_smooth.bmp    → Smooth east corner
Roadcross_urban.bmp       → Urban crossroads
```

### 4.5 TextureId → File Mapping

```typescript
// Encoding: textureId = (topology - 1) | (surface << 4)
function getTextureFilename(textureId: number): string {
  const topologyIndex = textureId & 0x0F;  // Bits 0-3
  const surfaceIndex = (textureId >> 4) & 0x0F;  // Bits 4-7

  const topology = topologyIndex + 1;  // 1-15 (TOPO_NS_START to TOPO_CROSSROADS)
  const surface = surfaceIndex;  // 0-10 (SURFACE_LAND to SURFACE_URBAN_SMOOTH)

  // Topology → name mapping table
  const topologyNames = [
    'NSStart', 'NSEnd', 'WEStart', 'WEEnd',
    'NS', 'WE',
    'LeftPlug', 'RightPlug', 'TopPlug', 'BottomPlug',
    'CornerW', 'CornerS', 'CornerN', 'CornerE',
    'Crossroads'
  ];

  // Surface → name mapping table
  const surfaceNames = [
    'land', 'urban',
    'bridge_north', 'bridge_south', 'bridge_east', 'bridge_west', 'bridge_full',
    'level_crossing', 'urban_crossing',
    'smooth', 'urban_smooth'
  ];

  const topoName = topologyNames[topologyIndex];
  const surfName = surfaceNames[surfaceIndex];

  return `Road${topoName}_${surfName}.bmp`;
}

// Example
textureId = 13 | (10 << 4);  // CORNER_E + URBAN_SMOOTH
// → "RoadCornerE_urban_smooth.bmp"
```

---

## 5. Mapping to Our Current Implementation

### 5.1 Our Road Types → Official Types

| Our type | Official type | ID | Exact match |
|----------|---------------|----|-|
| `Roadvert` | `rbNS` | 5 | Yes |
| `Roadhorz` | `rbWE` | 6 | Yes |
| `RoadcornerN` | `rbCornerN` | 13 | Yes |
| `RoadcornerE` | `rbCornerE` | 14 | Yes |
| `RoadcornerS` | `rbCornerS` | 12 | Yes |
| `RoadcornerW` | `rbCornerW` | 11 | Yes |
| `RoadTN` | `rbTopPlug` | 9 | Yes |
| `RoadTE` | `rbRightPlug` | 8 | Yes |
| `RoadTS` | `rbBottomPlug` | 10 | Yes |
| `RoadTW` | `rbLeftPlug` | 7 | Yes |
| `Roadcross` | `rbCrossRoads` | 15 | Yes |

**Result:** Our naming convention matches the official files exactly!

### 5.2 Types Missing from Our System

| Official type | ID | Description | Needed for |
|---------------|----|-|-|
| `rbNSRoadStart` | 1 | N-S start | Complete transition system |
| `rbNSRoadEnd` | 2 | N-S end | Complete transition system |
| `rbWERoadStart` | 3 | W-E start | Complete transition system |
| `rbWERoadEnd` | 4 | W-E end | Complete transition system |

**Note:** These types require implementing **transition tables** to be used correctly.

---

## 6. Complete TypeScript Code Examples

### 6.1 Terrain Parser with Water Detection

```typescript
class TerrainParser {
  private readonly PLATFORM_FLAG = 0x80;
  private readonly PLATFORM_MASK = 0x7F;

  parseTerrainFromBMP(bmpData: Uint8Array, width: number, height: number): TerrainCell[][] {
    const grid: TerrainCell[][] = [];

    for (let i = 0; i < height; i++) {
      grid[i] = [];
      for (let j = 0; j < width; j++) {
        const paletteIndex = bmpData[i * width + j];

        grid[i][j] = {
          isWater: (paletteIndex & this.PLATFORM_FLAG) !== 0,
          waterType: paletteIndex & this.PLATFORM_MASK
        };
      }
    }

    return grid;
  }
}
```

### 6.2 Concrete Grid Generator

```typescript
class ConcreteGridGenerator {
  private readonly CONCRETE_RADIUS = 2;

  generateConcreteGrid(
    buildings: Building[],
    mapWidth: number,
    mapHeight: number
  ): number[][] {
    // Initialize empty grid
    const grid = Array(mapHeight).fill(0).map(() => Array(mapWidth).fill(0));

    // Apply concrete for each urban building
    for (const building of buildings) {
      if (!building.isUrban) continue;

      const { x, y, xsize, ysize } = building;

      // Expand concrete around the building
      const minI = Math.max(0, y - this.CONCRETE_RADIUS);
      const maxI = Math.min(mapHeight - 1, y + ysize + this.CONCRETE_RADIUS - 1);
      const minJ = Math.max(0, x - this.CONCRETE_RADIUS);
      const maxJ = Math.min(mapWidth - 1, x + xsize + this.CONCRETE_RADIUS - 1);

      for (let i = minI; i <= maxI; i++) {
        for (let j = minJ; j <= maxJ; j++) {
          grid[i][j]++;
        }
      }
    }

    return grid;
  }

  hasConcrete(grid: number[][], x: number, y: number): boolean {
    return grid[y]?.[x] > 0;
  }
}
```

### 6.3 Railroad Grid Builder

```typescript
class RailroadGridBuilder {
  buildFromSegments(
    segments: RailSegment[],
    mapWidth: number,
    mapHeight: number
  ): boolean[][] {
    const grid = Array(mapHeight).fill(false).map(() => Array(mapWidth).fill(false));

    for (const segment of segments) {
      this.markSegment(grid, segment);
    }

    return grid;
  }

  private markSegment(grid: boolean[][], segment: RailSegment): void {
    const { x1, y1, x2, y2 } = segment;

    if (x1 === x2) {
      // Vertical segment
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      for (let y = yMin; y <= yMax; y++) {
        if (y >= 0 && y < grid.length && x1 >= 0 && x1 < grid[0].length) {
          grid[y][x1] = true;
        }
      }
    } else if (y1 === y2) {
      // Horizontal segment
      const xMin = Math.min(x1, x2);
      const xMax = Math.max(x1, x2);
      for (let x = xMin; x <= xMax; x++) {
        if (y1 >= 0 && y1 < grid.length && x >= 0 && x < grid[0].length) {
          grid[y1][x] = true;
        }
      }
    }
  }
}
```

---

## 7. Data Source Summary

| Data | Source | Format | Availability |
|------|--------|--------|--------------|
| **TerrainGrid** | Map BMP file | 8-bit palette (0x80-0x88 = water) | Available |
| **ConcreteGrid** | Dynamically calculated | From urban buildings | Implementable |
| **RailroadGrid** | RDO Protocol | Segments `{x1,y1,x2,y2}` via `cirRailRoads=2` | Retrievable |
| **Road textures** | Server (cache) | BMP 64x32 pixels | Downloaded at runtime |

---

## 8. References

- **Delphi source files:**
  - `Voyager/Components/MapIsoView/Concrete.pas` - Water/concrete detection
  - `Protocol/Roads.pas` - Road types
  - `Voyager/Map.pas` - Concrete calculation
  - `Voyager/VoyagerServerInterfaces.pas` - RDO structures

- **Project documentation:**
  - [CLAUDE.md](../CLAUDE.md) - Project overview

---

**Document created:** January 2026
**Source:** Reverse engineering of the official Starpeace Online client
**Translated:** February 2026 (French → English)
