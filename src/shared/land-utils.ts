/**
 * Land Utilities - Decoding and querying landId values from BMP map files
 *
 * LandId Encoding Structure (8-bit byte):
 * Bit:  7   6   5   4   3   2   1   0
 *       └───┴───┘   └───┴───┴───┴───┘   └───┴───┘
 *       LandClass   LandType            LandVar
 *       (2 bits)    (4 bits)            (2 bits)
 *
 * Converted from Delphi source: Land.pas, LocalCacheManager.pas
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/** Bit mask for LandClass (bits 7-6) */
const LND_CLASS_MASK = 0xC0;  // 11000000

/** Bit mask for LandType (bits 5-2) */
const LND_TYPE_MASK = 0x3C;   // 00111100

/** Bit mask for LandVar (bits 1-0) */
const LND_VAR_MASK = 0x03;    // 00000011

/** Bit shift for LandClass */
export const LND_CLASS_SHIFT = 6;

/** Bit shift for LandType */
export const LND_TYPE_SHIFT = 2;

// =============================================================================
// ENUMS
// =============================================================================

/**
 * Land Class - Terrain zone type (2 bits, values 0-3)
 * Determines the base terrain category (grass, midgrass, dryground, water)
 */
export enum LandClass {
  /** Grass zone (0x00) */
  ZoneA = 0,
  /** MidGrass zone (0x40) */
  ZoneB = 1,
  /** DryGround zone (0x80) */
  ZoneC = 2,
  /** Water zone (0xC0) */
  ZoneD = 3,
}

/**
 * Land Type - Tile shape/orientation (4 bits, values 0-13)
 * Determines edge transitions and special tiles
 */
export enum LandType {
  /** Center/pure tile - no edge transition */
  Center = 0,
  /** North edge */
  N = 1,
  /** East edge */
  E = 2,
  /** South edge */
  S = 3,
  /** West edge */
  W = 4,
  /** North-East outer corner */
  NEo = 5,
  /** South-East outer corner */
  SEo = 6,
  /** South-West outer corner */
  SWo = 7,
  /** North-West outer corner */
  NWo = 8,
  /** North-East inner corner */
  NEi = 9,
  /** South-East inner corner */
  SEi = 10,
  /** South-West inner corner */
  SWi = 11,
  /** North-West inner corner */
  NWi = 12,
  /** Special texture (trees, decorations, etc.) */
  Special = 13,
}

/**
 * Decoded land information from a landId byte
 */
export interface DecodedLandId {
  /** Raw landId value (0-255) */
  raw: number;
  /** Land class (terrain zone) */
  landClass: LandClass;
  /** Land type (shape/orientation) */
  landType: LandType;
  /** Land variation (0-3) */
  landVar: number;
  /** Whether this tile is water */
  isWater: boolean;
  /** Whether this tile is a water edge (not center) */
  isWaterEdge: boolean;
  /** Whether this tile is deep water (center) */
  isDeepWater: boolean;
  /** Whether buildings can be placed on this tile */
  canBuild: boolean;
  /** Edge direction if applicable */
  edgeDirection: 'N' | 'E' | 'S' | 'W' | null;
}

// =============================================================================
// DECODING FUNCTIONS
// =============================================================================

/**
 * Extract LandClass from landId (bits 7-6)
 * @param landId Raw landId byte (0-255)
 * @returns LandClass enum value (0-3)
 */
export function landClassOf(landId: number): LandClass {
  return ((landId & LND_CLASS_MASK) >> LND_CLASS_SHIFT) as LandClass;
}

/**
 * Extract LandType from landId (bits 5-2)
 * @param landId Raw landId byte (0-255)
 * @returns LandType enum value (0-13)
 */
export function landTypeOf(landId: number): LandType {
  const typeIdx = (landId & LND_TYPE_MASK) >> LND_TYPE_SHIFT;
  // Clamp to Special if out of range
  return (typeIdx <= LandType.Special ? typeIdx : LandType.Special) as LandType;
}

/**
 * Extract LandVar from landId (bits 1-0)
 * @param landId Raw landId byte (0-255)
 * @returns Variation index (0-3)
 */
export function landVarOf(landId: number): number {
  return landId & LND_VAR_MASK;
}

// =============================================================================
// QUERY FUNCTIONS
// =============================================================================

/**
 * Check if landId represents water (ZoneD)
 * @param landId Raw landId byte (0-255)
 * @returns true if water tile
 */
export function isWater(landId: number): boolean {
  return landClassOf(landId) === LandClass.ZoneD;
}

/**
 * Check if landId represents deep water (water center tile)
 * @param landId Raw landId byte (0-255)
 * @returns true if deep water (water + center type)
 */
export function isDeepWater(landId: number): boolean {
  return isWater(landId) && landTypeOf(landId) === LandType.Center;
}

/**
 * Check if landId represents a water edge (water but not center)
 * @param landId Raw landId byte (0-255)
 * @returns true if water edge tile
 */
export function isWaterEdge(landId: number): boolean {
  return isWater(landId) && landTypeOf(landId) !== LandType.Center;
}

/**
 * Check if landId represents a water corner (inner or outer)
 * @param landId Raw landId byte (0-255)
 * @returns true if water corner tile
 */
export function isWaterCorner(landId: number): boolean {
  if (!isWater(landId)) return false;
  const type = landTypeOf(landId);
  return type >= LandType.NEo && type <= LandType.NWi;
}

/**
 * Check if buildings can be placed on this tile
 * Buildings cannot be placed on water or special tiles
 * @param landId Raw landId byte (0-255)
 * @returns true if building placement is allowed
 */
export function canBuildOn(landId: number): boolean {
  if (isWater(landId)) return false;
  if (landTypeOf(landId) === LandType.Special) return false;
  return true;
}

/**
 * Get the edge direction for edge tiles (N, E, S, W)
 * @param landId Raw landId byte (0-255)
 * @returns Edge direction or null if not an edge tile
 */
function getEdgeDirection(landId: number): 'N' | 'E' | 'S' | 'W' | null {
  const type = landTypeOf(landId);
  switch (type) {
    case LandType.N: return 'N';
    case LandType.E: return 'E';
    case LandType.S: return 'S';
    case LandType.W: return 'W';
    default: return null;
  }
}


/**
 * Check if landId is an inner corner (NEi, SEi, SWi, NWi)
 * @param landId Raw landId byte (0-255)
 * @returns true if inner corner
 */
export function isInnerCorner(landId: number): boolean {
  const type = landTypeOf(landId);
  return type >= LandType.NEi && type <= LandType.NWi;
}

/**
 * Check if landId is a special tile (trees, decorations, etc.)
 * @param landId Raw landId byte (0-255)
 * @returns true if special tile
 */
export function isSpecialTile(landId: number): boolean {
  return landTypeOf(landId) === LandType.Special;
}

// =============================================================================
// FULL DECODE
// =============================================================================

/**
 * Fully decode a landId byte into all its components
 * @param landId Raw landId byte (0-255)
 * @returns Complete decoded land information
 */
export function decodeLandId(landId: number): DecodedLandId {
  const landClass = landClassOf(landId);
  const landType = landTypeOf(landId);
  const landVar = landVarOf(landId);
  const water = landClass === LandClass.ZoneD;

  return {
    raw: landId,
    landClass,
    landType,
    landVar,
    isWater: water,
    isWaterEdge: water && landType !== LandType.Center,
    isDeepWater: water && landType === LandType.Center,
    canBuild: !water && landType !== LandType.Special,
    edgeDirection: getEdgeDirection(landId),
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get human-readable name for LandClass
 * @param landClass LandClass enum value
 * @returns Human-readable name
 */
export function landClassName(landClass: LandClass): string {
  switch (landClass) {
    case LandClass.ZoneA: return 'Grass';
    case LandClass.ZoneB: return 'MidGrass';
    case LandClass.ZoneC: return 'DryGround';
    case LandClass.ZoneD: return 'Water';
    default: return 'Unknown';
  }
}

/**
 * Get human-readable name for LandType
 * @param landType LandType enum value
 * @returns Human-readable name
 */
export function landTypeName(landType: LandType): string {
  switch (landType) {
    case LandType.Center: return 'Center';
    case LandType.N: return 'North';
    case LandType.E: return 'East';
    case LandType.S: return 'South';
    case LandType.W: return 'West';
    case LandType.NEo: return 'NE Outer';
    case LandType.SEo: return 'SE Outer';
    case LandType.SWo: return 'SW Outer';
    case LandType.NWo: return 'NW Outer';
    case LandType.NEi: return 'NE Inner';
    case LandType.SEi: return 'SE Inner';
    case LandType.SWi: return 'SW Inner';
    case LandType.NWi: return 'NW Inner';
    case LandType.Special: return 'Special';
    default: return 'Unknown';
  }
}

/**
 * Format landId as hex string for debugging
 * @param landId Raw landId byte (0-255)
 * @returns Formatted string like "0xDE (ZoneD/Water, SWo, var=2)"
 */
export function formatLandId(landId: number): string {
  const decoded = decodeLandId(landId);
  const hex = '0x' + landId.toString(16).toUpperCase().padStart(2, '0');
  return `${hex} (${landClassName(decoded.landClass)}, ${landTypeName(decoded.landType)}, var=${decoded.landVar})`;
}

// =============================================================================
// ROTATION
// =============================================================================

/**
 * LandType rotation tables.
 *
 * Under view rotation the diamond edges stay fixed on screen but map
 * directions move.  To keep terrain border textures aligned we remap the
 * directional LandType component so the border stays on the correct
 * diamond edge for the current view.
 *
 * Derived from Delphi Land.pas LandRotate() + ImageCache.pas RotateLandId():
 *   drEast  = ang90  (view CW → features shift CCW)
 *   drSouth = ang90×2
 *   drWest  = ang270 (view CCW → features shift CW)
 *
 * Index = original LandType, value = rotated LandType.
 * [rotation][originalLandType] → rotatedLandType
 */
const LAND_TYPE_ROTATION: readonly number[][] = [
  // NORTH (identity)
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  // EAST (view CW): N→W, E→N, S→E, W→S, NEo→NWo, SEo→NEo, SWo→SEo, NWo→SWo, same inner
  [0, 4, 1, 2, 3, 8, 5, 6, 7, 12, 9, 10, 11, 13],
  // SOUTH (180°): N→S, E→W, S→N, W→E, NEo→SWo, SEo→NWo, SWo→NEo, NWo→SEo, same inner
  [0, 3, 4, 1, 2, 7, 8, 5, 6, 11, 12, 9, 10, 13],
  // WEST (view CCW): N→E, E→S, S→W, W→N, NEo→SEo, SEo→SWo, SWo→NWo, NWo→NEo, same inner
  [0, 2, 3, 4, 1, 6, 7, 8, 5, 10, 11, 12, 9, 13],
];

/**
 * Rotate a landId for the current map rotation.
 * Preserves LandClass and LandVar — only remaps the directional LandType.
 *
 * @param landId  Raw landId byte (0-255)
 * @param rotation  Rotation enum value (0=North, 1=East, 2=South, 3=West)
 * @returns Rotated landId
 */
export function rotateLandId(landId: number, rotation: number): number {
  if (rotation === 0) return landId; // NORTH = identity

  const landType = landTypeOf(landId);
  if (landType >= LAND_TYPE_ROTATION[rotation].length) return landId;

  const rotatedType = LAND_TYPE_ROTATION[rotation][landType];
  // Reconstruct landId: class (bits 7-6) | type (bits 5-2) | var (bits 1-0)
  return (landId & LND_CLASS_MASK) | (rotatedType << LND_TYPE_SHIFT) | (landId & LND_VAR_MASK);
}
