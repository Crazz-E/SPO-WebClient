/**
 * Building Data Types
 * Complete building metadata including visual class mapping and texture filenames
 *
 * Key concepts:
 * - Runtime VisualClass = BaseVisualClass + Stage0.VisualStages + CurrentBlock.VisualClassId
 * - ObjectsInArea returns the RUNTIME VisualClass
 * - For completed buildings: Complete VisualClass = Base + Stage0.VS
 * - Construction state uses the Base VisualClass
 */

/**
 * Complete building data entry
 * Used for both server-side cache and client-side lookups
 */
export interface BuildingData {
  /** Complete (runtime) VisualClass - what ObjectsInArea returns for finished buildings */
  visualClass: string;

  /** Building name (e.g., "PGIFoodStore") */
  name: string;

  /** Building width in tiles */
  xsize: number;

  /** Building height in tiles */
  ysize: number;

  /** Complete building texture filename (e.g., "MapPGIFoodStore64x32x0.gif") */
  textureFilename: string;

  /** Base VisualClass (used for construction state) */
  baseVisualClass: string;

  /** VisualStages for Stage 0 (1 for most, 2 for residential/office, etc.) */
  visualStages: number;

  /** Construction texture filename (e.g., "Construction64.gif") */
  constructionTextureFilename: string;

  /** Empty building texture filename (for residential buildings only) */
  emptyTextureFilename?: string;

  /** Empty VisualClass (for residential buildings: Base + 1 when visualStages = 2) */
  emptyVisualClass?: string;

  /** Building category for grouping (e.g., "residential", "commerce", "industry") */
  category?: string;

  /** Cluster identifier (e.g., "PGI", "Mariko", "Moab", "Dissidents", "Magna", "UW") */
  cluster?: string;

  /** Number of void squares in footprint (from [General] VoidSquares) */
  voidSquares?: number;

  /** Minimap/hide color as integer (from [General] HideColor, default clBlack=0) */
  hideColor?: number;

  /** Whether building affects surrounding land tiles (from [General] Urban) */
  urban?: boolean;

  /** Whether building can trigger land accidents (from [General] Accident) */
  accident?: boolean;

  /** Required zone type (from [General] Zone) */
  zoneType?: number;

  /** Facility type identifier (from [General] FacId) */
  facId?: number;

  /** Prerequisite facility type (from [General] Requires) */
  requires?: number;

  /** Whether building can be clicked/inspected (from [General] Selectable) */
  selectable?: boolean;

  /** Build options: 0=default, 1=land, 2=water, 3=both (from [General] BuildOptions) */
  buildOpts?: number;

  /** Whether sprite has animation frames (from [General] Animated) */
  animated?: boolean;

  /** Level indicator X pixel offset (from [General] LevelSignX) */
  levelSignX?: number;

  /** Level indicator Y pixel offset (from [General] LevelSignY) */
  levelSignY?: number;

  /** Animation sprite sub-region rectangle (from [Animations] section) */
  animArea?: { left: number; top: number; right: number; bottom: number };

  /** Sound configuration (from [Sounds] section) */
  soundData?: {
    kind: number;
    sounds: Array<{
      waveFile: string;
      attenuation: number;
      priority: number;
      looped: boolean;
      probability: number;
      period: number;
    }>;
  };

  /** Visual effects list (from [Effects] section) */
  efxData?: Array<{
    id: number;
    x: number;
    y: number;
    animated: boolean;
    glassed: boolean;
  }>;

  /** Inspector tab configuration (from [InspectorInfo] section) */
  inspectorTabs?: Array<{
    tabName: string;
    tabHandler: string;
  }>;
}


/**
 * Construction texture size mapping based on building size
 */
export function getConstructionTexture(xsize: number, ysize: number): string {
  const maxSize = Math.max(xsize, ysize);

  if (maxSize <= 1) return 'Construction32.gif';
  if (maxSize <= 2) return 'Construction64.gif';
  if (maxSize <= 3) return 'Construction128.gif';
  if (maxSize <= 4) return 'Construction192.gif';
  if (maxSize <= 5) return 'Construction256.gif';
  return 'Construction320.gif';
}

/**
 * Get the complete VisualClass from base and visual stages
 */
export function getCompleteVisualClass(baseVisualClass: number, visualStages: number): number {
  return baseVisualClass + visualStages;
}

/**
 * Get the empty VisualClass for residential buildings
 * Only applicable when visualStages = 2
 */
export function getEmptyVisualClass(baseVisualClass: number, visualStages: number): number | undefined {
  if (visualStages === 2) {
    return baseVisualClass + 1;
  }
  return undefined;
}
