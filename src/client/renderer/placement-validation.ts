/**
 * Placement validation logic for building placement preview.
 *
 * Extracted from IsometricMapRenderer for testability.
 * Rules:
 * - Building/road collision: ANY single tile overlapping = blocked
 * - Reserved zone: ANY single tile on reserved zone = blocked
 * - Zone requirement mismatch: only blocked when ALL tiles are in a wrong zone
 *   (a tile "passes" if it matches the required zone or is "no zone" = 0)
 */

import { ZoneType } from '../../shared/types';

export interface PlacementTileZone {
  /** Zone value at this tile (from cached surface data), or undefined if no data */
  zoneValue: number | undefined;
}

interface PlacementValidationResult {
  hasCollision: boolean;
  hasReservedZone: boolean;
  hasZoneMismatch: boolean;
  isInvalid: boolean;
}

/**
 * Validate zone requirements and reserved zone for a set of footprint tiles.
 *
 * @param tileZones - Zone values for each tile in the footprint
 * @param requiredZoneValue - The required zone type (0 = no requirement)
 * @param hasCollision - Whether any tile has a building/road collision (pre-computed)
 */
export function validatePlacementZones(
  tileZones: PlacementTileZone[],
  requiredZoneValue: number,
  hasCollision: boolean,
): PlacementValidationResult {
  let hasReservedZone = false;
  let totalTilesChecked = 0;
  let mismatchedTiles = 0;

  for (const tile of tileZones) {
    if (tile.zoneValue === undefined) continue;

    // Reserved zone: any single tile on reserved = always blocked
    if (tile.zoneValue === ZoneType.RESERVED) {
      hasReservedZone = true;
    }

    // Zone requirement check: track per-tile pass/fail
    if (requiredZoneValue > 0) {
      totalTilesChecked++;
      if (tile.zoneValue !== requiredZoneValue && tile.zoneValue !== 0) {
        mismatchedTiles++;
      }
    }
  }

  // Zone mismatch only blocks when ALL checked tiles are in a wrong zone
  const hasZoneMismatch = requiredZoneValue > 0 && totalTilesChecked > 0 && mismatchedTiles === totalTilesChecked;
  const isInvalid = hasCollision || hasZoneMismatch || hasReservedZone;

  return { hasCollision, hasReservedZone, hasZoneMismatch, isInvalid };
}
