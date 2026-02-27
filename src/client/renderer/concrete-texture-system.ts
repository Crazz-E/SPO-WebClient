/**
 * StarPeace Concrete Texture System
 *
 * Context-sensitive algorithm for selecting concrete textures based on neighbor tiles.
 * Ported from Delphi (Concrete.pas, Map.pas, MapTypes.pas)
 *
 * This module handles:
 * 1. Neighbor configuration analysis (8 neighbors for land, 4 cardinal for water)
 * 2. Concrete texture ID calculation (land: 0-12, water: 0-8 with platform flag)
 * 3. Road and special concrete flag application
 * 4. Rotation support for map orientations
 * 5. INI-based texture class loading
 */

import { LandClass, landClassOf, landTypeOf, LandType } from '../../shared/land-utils';
import { Rotation } from './road-texture-system';
import { parseIniFile, parseDelphiInt } from './road-texture-system';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Full concrete - tile surrounded by concrete on all 8 sides */
export const CONCRETE_FULL = 12;

/** Special decorative concrete (used on even grid positions) */
export const CONCRETE_SPECIAL = 15;

/** Road flag - OR'd with base land concrete ID when road present on tile */
export const CONCRETE_ROAD_FLAG = 0x10;

/** Platform flag - OR'd for water/aquatic concrete platforms */
export const CONCRETE_PLATFORM_FLAG = 0x80;

/** Mask to extract base ID without platform flag */
export const CONCRETE_PLATFORM_MASK = 0x7F;

/** No concrete present */
export const CONCRETE_NONE = 0xFF;

/** Platform visual elevation in pixels at base zoom (64x32 tiles) */
export const PLATFORM_SHIFT = 12;

// =============================================================================
// NEIGHBOR CONFIGURATION
// =============================================================================

/**
 * 8-neighbor configuration for concrete calculation
 *
 * Index mapping (isometric view):
 *       [0]   [1]   [2]
 *          ╲   │   ╱
 *           ╲  │  ╱
 *    [3] ─── TILE ─── [4]
 *           ╱  │  ╲
 *          ╱   │   ╲
 *       [5]   [6]   [7]
 *
 * Each element is true if that neighbor has concrete
 */
export type ConcreteCfg = [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean];

/**
 * Neighbor offset table: [di, dj] for each index 0-7
 * Used to calculate neighbor coordinates from tile position
 */
export const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [-1, -1], // 0: top-left (diagonal)
  [-1,  0], // 1: top (cardinal)
  [-1,  1], // 2: top-right (diagonal)
  [ 0, -1], // 3: left (cardinal)
  [ 0,  1], // 4: right (cardinal)
  [ 1, -1], // 5: bottom-left (diagonal)
  [ 1,  0], // 6: bottom (cardinal)
  [ 1,  1]  // 7: bottom-right (diagonal)
] as const;

/** Cardinal neighbor indices (for water platforms) */
export const CARDINAL_INDICES = {
  TOP: 1,
  LEFT: 3,
  RIGHT: 4,
  BOTTOM: 6
} as const;

/** Diagonal neighbor indices */
export const DIAGONAL_INDICES = {
  TOP_LEFT: 0,
  TOP_RIGHT: 2,
  BOTTOM_LEFT: 5,
  BOTTOM_RIGHT: 7
} as const;

// =============================================================================
// MAP DATA INTERFACE
// =============================================================================

/**
 * Interface for querying map data needed by concrete calculations
 */
export interface ConcreteMapData {
  /** Get the land ID (terrain type) at a position */
  getLandId(row: number, col: number): number;
  /** Check if a tile has concrete */
  hasConcrete(row: number, col: number): boolean;
  /** Check if a tile has a road */
  hasRoad(row: number, col: number): boolean;
  /** Check if a building occupies this tile */
  hasBuilding(row: number, col: number): boolean;
}

// =============================================================================
// LOOKUP TABLES
// =============================================================================

/**
 * Water platform INI IDs
 * These are the actual IDs from the INI files (platC, platE, platN, etc.)
 *
 * The naming convention refers to which EDGE of the platform is exposed (no neighbor):
 * - platN = tile at North edge of platform (missing N neighbor, exposed to the north)
 * - platE = tile at East edge of platform (missing E neighbor, exposed to the east)
 * - platNE = tile at NE corner of platform (missing N and E neighbors)
 *
 * Isometric coordinate mapping:
 * - N (North) = row-1 = top-right on screen
 * - S (South) = row+1 = bottom-left on screen
 * - E (East) = col+1 = bottom-right on screen
 * - W (West) = col-1 = top-left on screen
 */
export const PLATFORM_IDS = {
  CENTER: 0x80, // platC - all 4 cardinal neighbors present (center tile)
  E: 0x81,      // platE - East edge exposed (missing E neighbor)
  N: 0x82,      // platN - North edge exposed (missing N neighbor)
  NE: 0x83,     // platNE - NE corner exposed (missing N,E neighbors)
  NW: 0x84,     // platNW - NW corner exposed (missing N,W neighbors)
  S: 0x85,      // platS - South edge exposed (missing S neighbor)
  SE: 0x86,     // platSE - SE corner exposed (missing S,E neighbors)
  SW: 0x87,     // platSW - SW corner exposed (missing S,W neighbors)
  W: 0x88,      // platW - West edge exposed (missing W neighbor)
} as const;

/**
 * Water concrete lookup table
 * Maps 4-bit cardinal neighbor pattern DIRECTLY to INI platform ID
 *
 * Key bits: [top][left][right][bottom] (each 1 bit)
 * Key = (top ? 8 : 0) | (left ? 4 : 0) | (right ? 2 : 0) | (bottom ? 1 : 0)
 *
 * IMPORTANT: Map cardinal directions differ from on-screen texture names due to
 * isometric projection. The texture name matches the VISUAL screen direction:
 * - Missing T (row-1, screen top-right) → SE edge on screen → use platSE
 * - Missing B (row+1, screen bottom-left) → NW edge on screen → use platNW
 * - Missing L (col-1, screen top-left) → SW edge on screen → use platSW
 * - Missing R (col+1, screen bottom-right) → NE edge on screen → use platNE
 *
 * | Pattern | Missing | Screen Edge  | INI ID |
 * |---------|---------|--------------|--------|
 * | TLRB    | none    | center       | $80    |
 * | _LRB    | T       | SE edge      | $86    |
 * | T_RB    | L       | SW edge      | $87    |
 * | TL_B    | R       | NE edge      | $83    |
 * | TLR_    | B       | NW edge      | $84    |
 * | __RB    | T,L     | S corner     | $85    |
 * | _L_B    | T,R     | E corner     | $81    |
 * | T__B    | L,R     | (vertical)   | $80    |
 * | TL__    | R,B     | N corner     | $82    |
 * | T_R_    | L,B     | W corner     | $88    |
 * | _LR_    | T,B     | (horizontal) | $80    |
 */
const WATER_CONCRETE_LOOKUP: Record<number, number> = {
  0b1111: PLATFORM_IDS.CENTER, // TLRB = all present → center
  0b0111: PLATFORM_IDS.SE,     // _LRB = missing T → SE edge on screen
  0b1011: PLATFORM_IDS.SW,     // T_RB = missing L → SW edge on screen
  0b1101: PLATFORM_IDS.NE,     // TL_B = missing R → NE edge on screen
  0b1110: PLATFORM_IDS.NW,     // TLR_ = missing B → NW edge on screen
  0b0011: PLATFORM_IDS.S,      // __RB = missing T,L → S corner on screen
  0b0101: PLATFORM_IDS.E,      // _L_B = missing T,R → E corner on screen
  0b1001: PLATFORM_IDS.CENTER, // T__B = missing L,R → vertical strip (use center)
  0b1100: PLATFORM_IDS.N,      // TL__ = missing R,B → N corner on screen
  0b1010: PLATFORM_IDS.W,      // T_R_ = missing L,B → W corner on screen
  0b0110: PLATFORM_IDS.CENTER, // _LR_ = missing T,B → horizontal strip (use center)
  // Isolated patterns - use center as fallback
  0b0001: PLATFORM_IDS.CENTER, // ___B
  0b0010: PLATFORM_IDS.CENTER, // __R_
  0b0100: PLATFORM_IDS.CENTER, // _L__
  0b1000: PLATFORM_IDS.CENTER, // T___
  0b0000: PLATFORM_IDS.CENTER, // ____ (no neighbors)
};

/**
 * Land concrete lookup - decision tree implementation
 *
 * The land concrete algorithm uses a cascading decision tree based on:
 * 1. Cardinal neighbors (priority) - indices 1, 3, 4, 6
 * 2. Diagonal neighbors (refinement) - indices 0, 2, 5, 7
 *
 * Returns concrete ID 0-12 based on the neighbor pattern.
 *
 * ID meanings:
 * | ID | Description |
 * |----|-------------|
 * | 0  | Center complete horizontal |
 * | 1  | Corner missing top-left |
 * | 2  | Bottom edge exposed |
 * | 3  | Top-right corner piece |
 * | 4  | Corner missing top-right |
 * | 5  | Right edge exposed |
 * | 6  | Top edge exposed |
 * | 7  | Left edge exposed |
 * | 8  | Corner missing bottom-right |
 * | 9  | Top-left corner piece |
 * | 10 | Bottom corner (isolated) |
 * | 11 | Corner missing bottom-left |
 * | 12 | Full concrete (all neighbors) |
 */
function getLandConcreteIdFromDecisionTree(cfg: ConcreteCfg): number {
  // Extract neighbor presence
  const topLeft = cfg[0];
  const top = cfg[1];
  const topRight = cfg[2];
  const left = cfg[3];
  const right = cfg[4];
  const bottomLeft = cfg[5];
  const bottom = cfg[6];
  const bottomRight = cfg[7];

  // Decision tree based on Concrete.pas:102-212
  if (top) {
    if (left) {
      if (right) {
        if (bottom) {
          // All 4 cardinals present - check diagonals for corner missing
          if (!topLeft) return 1;      // Missing top-left corner
          if (!topRight) return 4;     // Missing top-right corner
          if (!bottomRight) return 8;  // Missing bottom-right corner
          if (!bottomLeft) return 11;  // Missing bottom-left corner
          return CONCRETE_FULL;        // All 8 present
        } else {
          // Top, Left, Right present; Bottom missing
          if (!topLeft) return 6;      // Top edge, missing TL
          if (!topRight) return 6;     // Top edge, missing TR
          return 6;                     // Top edge exposed
        }
      } else {
        // Top, Left present; Right missing
        if (bottom) {
          if (!topLeft) return 5;      // Right edge, missing TL
          if (!bottomLeft) return 5;   // Right edge, missing BL
          return 5;                     // Right edge exposed
        } else {
          // Top, Left present; Right, Bottom missing = NW corner visually
          return 3;                     // NW corner piece (Conc4.bmp)
        }
      }
    } else {
      // Top present; Left missing
      if (right) {
        if (bottom) {
          if (!topRight) return 7;     // Left edge, missing TR
          if (!bottomRight) return 7;  // Left edge, missing BR
          return 7;                     // Left edge exposed
        } else {
          // Top, Right present; Left, Bottom missing
          return 9;                     // Top-left corner piece
        }
      } else {
        // Only Top present
        if (bottom) {
          return 0;                     // Vertical strip
        } else {
          return 10;                    // Isolated top
        }
      }
    }
  } else {
    // Top missing
    if (left) {
      if (right) {
        if (bottom) {
          if (!bottomLeft) return 0;   // North edge, missing BL (Conc1.bmp)
          if (!bottomRight) return 0;  // North edge, missing BR (Conc1.bmp)
          return 0;                     // North edge exposed (Conc1.bmp)
        } else {
          // Left, Right present; Top, Bottom missing
          return 0;                     // Horizontal strip
        }
      } else {
        // Left present; Top, Right missing = NE corner exposed
        if (bottom) {
          return 2;                     // NE corner piece (Conc3.bmp)
        } else {
          return 10;                    // Isolated left
        }
      }
    } else {
      // Top, Left missing
      if (right) {
        if (bottom) {
          return 10;                    // SE corner visually (Conc11.bmp)
        } else {
          return 10;                    // Isolated right
        }
      } else {
        // Right also missing
        if (bottom) {
          return 10;                    // Isolated bottom
        } else {
          return CONCRETE_FULL;         // Completely isolated - use full
        }
      }
    }
  }
}

// =============================================================================
// ROTATION TABLES
// =============================================================================

/**
 * Land concrete rotation table
 * [rotation][original_id] = rotated_id
 *
 * IDs 12 (full) and 15 (special) are rotation-invariant
 */
export const LAND_CONCRETE_ROTATION: readonly number[][] = [
  // Rotation.North (0 degrees - identity)
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  // Rotation.East (90 degrees clockwise)
  [0, 4, 5, 9, 8, 7, 2, 3, 11, 1, 10, 6, 12, 13, 14, 15],
  // Rotation.South (180 degrees)
  [0, 8, 7, 1, 11, 3, 5, 2, 4, 9, 10, 6, 12, 13, 14, 15],
  // Rotation.West (270 degrees)
  [0, 11, 3, 4, 1, 2, 7, 5, 9, 8, 10, 6, 12, 13, 14, 15]
] as const;

/**
 * Water concrete rotation table
 * Water platforms (IDs 0-8) have different rotation mapping
 */
export const WATER_CONCRETE_ROTATION: readonly number[][] = [
  // Rotation.North (identity)
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  // Rotation.East
  [0, 8, 3, 2, 7, 1, 4, 6, 5],
  // Rotation.South
  [0, 5, 7, 6, 3, 8, 2, 4, 1],
  // Rotation.West
  [0, 1, 6, 4, 2, 5, 7, 3, 8]
] as const;

// =============================================================================
// CONFIG ROTATION
// =============================================================================

/**
 * Neighbor index remapping for one 90° CW rotation.
 *
 * Under EAST rotation the coordinate transform is (relI,relJ) → (relJ, -relI).
 * Each neighbor direction maps to a new visual position:
 *   Physical BL → Visual TL,  Physical L → Visual T,  Physical TL → Visual TR,
 *   Physical B  → Visual L,   Physical T → Visual R,
 *   Physical BR → Visual BL,  Physical R → Visual B,  Physical TR → Visual BR.
 *
 * So rotated[visualIdx] = original[sourceIdx]:
 *   [0]=TL←BL(5), [1]=T←L(3), [2]=TR←TL(0), [3]=L←B(6),
 *   [4]=R←T(1), [5]=BL←BR(7), [6]=B←R(4), [7]=BR←TR(2)
 */
const CW_SOURCE: readonly number[] = [5, 3, 0, 6, 1, 7, 4, 2];

/**
 * Rotate a ConcreteCfg (8-neighbor bool array) by the given rotation.
 * This remaps which physical neighbor appears at each visual diamond position,
 * so the decision tree produces the texture matching the rotated view.
 *
 * @param cfg  Original neighbor configuration (unrotated)
 * @param rotation  Number of 90° CW steps (0-3)
 * @returns Rotated configuration
 */
export function rotateConcreteCfg(cfg: ConcreteCfg, rotation: number): ConcreteCfg {
  if (rotation === 0) return cfg;

  let current: ConcreteCfg = [...cfg] as ConcreteCfg;
  for (let r = 0; r < rotation; r++) {
    const prev = [...current] as ConcreteCfg;
    for (let idx = 0; idx < 8; idx++) {
      current[idx] = prev[CW_SOURCE[idx]];
    }
  }
  return current;
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Build the 8-neighbor configuration array
 * Each element is true if that neighbor has concrete
 */
export function buildNeighborConfig(
  row: number,
  col: number,
  mapData: ConcreteMapData
): ConcreteCfg {
  const cfg: ConcreteCfg = [false, false, false, false, false, false, false, false];

  for (let i = 0; i < 8; i++) {
    const [di, dj] = NEIGHBOR_OFFSETS[i];
    const neighborRow = row + di;
    const neighborCol = col + dj;
    cfg[i] = mapData.hasConcrete(neighborRow, neighborCol);
  }

  return cfg;
}

/**
 * Calculate land concrete ID based on 8 neighbors
 * Returns ID 0-12
 */
export function getLandConcreteId(cfg: ConcreteCfg): number {
  return getLandConcreteIdFromDecisionTree(cfg);
}

/**
 * Calculate water platform concrete ID based on 4 cardinal neighbors
 * Returns the INI platform ID directly ($80-$88)
 */
export function getWaterConcreteId(cfg: ConcreteCfg): number {
  const top = cfg[CARDINAL_INDICES.TOP];
  const left = cfg[CARDINAL_INDICES.LEFT];
  const right = cfg[CARDINAL_INDICES.RIGHT];
  const bottom = cfg[CARDINAL_INDICES.BOTTOM];

  // Build 4-bit key: [top][left][right][bottom]
  const key = (top ? 8 : 0) | (left ? 4 : 0) | (right ? 2 : 0) | (bottom ? 1 : 0);

  // Lookup returns the actual INI platform ID directly
  return WATER_CONCRETE_LOOKUP[key] ?? PLATFORM_IDS.CENTER;
}

/**
 * Check if a tile is on water (for water platform texture selection)
 *
 * IMPORTANT: Only tiles ACTUALLY on water use platform textures.
 * Land tiles adjacent to water should use regular land concrete textures.
 */
function isWaterPlatformTile(row: number, col: number, mapData: ConcreteMapData): boolean {
  const landId = mapData.getLandId(row, col);
  return landClassOf(landId) === LandClass.ZoneD;
}

/**
 * Check if a tile can receive concrete based on its terrain type.
 * On water (ZoneD), only ldtCenter (deep water) tiles accept concrete.
 * Water edge and corner tiles are excluded — no concrete on shorelines.
 */
export function canReceiveConcrete(landId: number): boolean {
  if (landClassOf(landId) === LandClass.ZoneD) {
    return landTypeOf(landId) === LandType.Center;
  }
  return true;
}

/**
 * Main entry point: Calculate the concrete texture ID for a tile
 *
 * Decision flow:
 * 1. No concrete at tile → return CONCRETE_NONE
 * 2. Building exists AND not water platform → return CONCRETE_FULL (12)
 * 3. Water platform (on water OR adjacent to water) → use 4-cardinal lookup (plat*.bmp)
 * 4. Land zone → use 8-neighbor lookup, apply road/special flags
 *
 * @param row - Map row (i coordinate)
 * @param col - Map column (j coordinate)
 * @param mapData - Map data interface for querying tiles
 * @param rotation - Optional view rotation (0-3). When set, the neighbor
 *   configuration is rotated before computing the concrete ID so the
 *   selected texture matches the rotated view.  This replaces the old
 *   rotateConcreteId() lookup-table approach which had incorrect tables.
 * @returns Concrete texture ID (0-15, or with flags, or CONCRETE_NONE)
 */
export function getConcreteId(
  row: number,
  col: number,
  mapData: ConcreteMapData,
  rotation?: number
): number {
  // Step 1: Check if tile has concrete
  if (!mapData.hasConcrete(row, col)) {
    return CONCRETE_NONE;
  }

  const hasBuilding = mapData.hasBuilding(row, col);
  const hasRoad = mapData.hasRoad(row, col);

  // Step 2: Check if this is a water platform tile
  // Water platforms are tiles on water OR land tiles adjacent to water
  const isWaterPlatform = isWaterPlatformTile(row, col, mapData);

  // Step 3: Building on pure land (not near water) gets full concrete
  if (hasBuilding && !isWaterPlatform) {
    return CONCRETE_FULL;
  }

  // Step 4: Build neighbor configuration, then rotate for current view
  let cfg = buildNeighborConfig(row, col, mapData);
  if (rotation && rotation !== 0) {
    cfg = rotateConcreteCfg(cfg, rotation);
  }

  // Step 5: Water platform - use cardinal-only lookup (plat*.bmp textures)
  // getWaterConcreteId returns the full INI platform ID ($80-$88) directly
  if (isWaterPlatform) {
    return getWaterConcreteId(cfg);
  }

  // Step 6: Land zone - use full 8-neighbor lookup
  let concreteId = getLandConcreteId(cfg);

  // Step 7: Apply road flag if road present and not full concrete
  if (hasRoad && concreteId < CONCRETE_FULL) {
    concreteId |= CONCRETE_ROAD_FLAG;
  }

  // Step 8: Check for special decorative concrete
  if (concreteId === CONCRETE_FULL &&
      !hasBuilding &&
      !hasRoad &&
      row % 2 === 0 &&
      col % 2 === 0) {
    return CONCRETE_SPECIAL;
  }

  return concreteId;
}

/**
 * Rotate a concrete ID based on map rotation
 * Preserves flags during rotation
 */
export function rotateConcreteId(id: number, rotation: Rotation): number {
  if (id === CONCRETE_NONE) return CONCRETE_NONE;
  if (rotation === Rotation.North) return id; // No rotation needed

  const isPlatform = (id & CONCRETE_PLATFORM_FLAG) !== 0;
  const baseId = id & CONCRETE_PLATFORM_MASK;
  const hasRoadFlag = (baseId & CONCRETE_ROAD_FLAG) !== 0;
  const pureId = baseId & 0x0F;

  let rotatedId: number;

  if (isPlatform) {
    // Water platform rotation
    if (pureId < WATER_CONCRETE_ROTATION[rotation].length) {
      rotatedId = WATER_CONCRETE_ROTATION[rotation][pureId] | CONCRETE_PLATFORM_FLAG;
    } else {
      rotatedId = id; // Unknown ID, don't rotate
    }
  } else {
    // Land concrete rotation
    if (pureId < LAND_CONCRETE_ROTATION[rotation].length) {
      rotatedId = LAND_CONCRETE_ROTATION[rotation][pureId];
      if (hasRoadFlag && rotatedId < CONCRETE_FULL) {
        rotatedId |= CONCRETE_ROAD_FLAG;
      }
    } else {
      rotatedId = id; // Unknown ID, don't rotate
    }
  }

  return rotatedId;
}

// =============================================================================
// CLASS MANAGER
// =============================================================================

/**
 * Concrete block class configuration (loaded from INI)
 */
export interface ConcreteBlockClassConfig {
  id: number;
  imagePath: string;
}

/**
 * Manages concrete block class configurations loaded from INI files
 * Mirrors the pattern used by RoadBlockClassManager
 */
export class ConcreteBlockClassManager {
  private classes: Map<number, ConcreteBlockClassConfig> = new Map();
  private basePath: string = '';

  /**
   * Set the base path for texture loading
   */
  setBasePath(path: string): void {
    this.basePath = path.endsWith('/') ? path : path + '/';
  }

  /**
   * Load a concrete block class from INI content
   */
  loadFromIni(iniContent: string): void {
    const config = loadConcreteBlockClassFromIni(iniContent);
    if (config.id !== CONCRETE_NONE) {
      this.classes.set(config.id, config);
    }
  }

  /**
   * Get concrete block class by ID
   */
  getClass(id: number): ConcreteBlockClassConfig | undefined {
    return this.classes.get(id);
  }

  /**
   * Get the image path for a concrete block ID
   * Returns the full path to the texture file
   */
  getImagePath(concreteBlockId: number): string | null {
    const config = this.classes.get(concreteBlockId);
    if (config && config.imagePath) {
      return this.basePath + 'ConcreteImages/' + config.imagePath;
    }
    return null;
  }

  /**
   * Get the image filename (without path) for a concrete block ID
   */
  getImageFilename(concreteBlockId: number): string | null {
    const config = this.classes.get(concreteBlockId);
    return config?.imagePath || null;
  }

  /**
   * Check if a concrete block class is loaded
   */
  hasClass(id: number): boolean {
    return this.classes.has(id);
  }

  /**
   * Get all loaded class IDs
   */
  getAllIds(): number[] {
    return Array.from(this.classes.keys());
  }

  /**
   * Get count of loaded classes
   */
  getClassCount(): number {
    return this.classes.size;
  }
}

/**
 * Parse concrete INI file content
 * Format matches road INI files:
 * [General]
 * Id = <decimal or $hex>
 * [Images]
 * 64X32 = <filename.bmp>
 */
export function loadConcreteBlockClassFromIni(iniContent: string): ConcreteBlockClassConfig {
  const sections = parseIniFile(iniContent);

  const general = sections.get('General') ?? new Map<string, string>();
  const images = sections.get('Images') ?? new Map<string, string>();

  const idStr = general.get('Id') ?? '';
  const id = parseDelphiInt(idStr, CONCRETE_NONE);

  // Try both cases for image path (64X32 or 64x32)
  const imagePath = images.get('64X32') ?? images.get('64x32') ?? '';

  return { id, imagePath };
}
