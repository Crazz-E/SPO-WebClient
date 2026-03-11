/**
 * Map Parsers - Pure functions for parsing map data
 * Extracted from spo_session.ts to reduce complexity
 */

import type { MapBuilding, MapSegment, BuildingFocusInfo } from '../shared/types';
import { cleanPayload, extractRevenue } from './rdo-helpers';

/**
 * Parse raw building data from ObjectsInArea response
 *
 * ObjectsInArea response format (5 lines per building):
 * Line 1: VisualClass - Building visual class ID (matches facilities.csv)
 * Line 2: TycoonId - Owner player ID (number, 0 if no owner)
 * Line 3: Options - Encoded byte (bits 4-7: upgrade level, bit 0: profit state)
 * Line 4: xPos - X coordinate (number)
 * Line 5: yPos - Y coordinate (number)
 *
 * @param rawLines Array of raw lines from response
 * @returns Array of parsed MapBuilding objects
 */
export function parseBuildings(rawLines: string[]): MapBuilding[] {
  const buildings: MapBuilding[] = [];

  // Skip non-numeric context/header lines at the beginning of the response.
  // ObjectsInArea responses may include localized context text (building names,
  // area descriptions, status messages) before the actual building data.
  // Building data is purely numeric (visualClass, tycoonId, options, x, y).
  let startIndex = 0;
  while (startIndex < rawLines.length && !/^-?\d+$/.test(rawLines[startIndex].trim())) {
    console.log(`[MapParser] Skipping context line[${startIndex}]: "${rawLines[startIndex].substring(0, 80)}"`);
    startIndex++;
  }

  if (startIndex > 0) {
    console.log(`[MapParser] Skipped ${startIndex} context/header line(s), building data starts at index ${startIndex}`);
  }

  // Buildings come in groups of 5 lines
  for (let i = startIndex; i + 4 < rawLines.length; i += 5) {
    try {
      const rawVisualClass = rawLines[i].trim();
      let visualClass = rawVisualClass;

      // Clean visualClass: remove RDO metadata prefixes like 'res="%'
      // The visualClass should be a numeric string (e.g., "2951", "3801")
      const match = visualClass.match(/^\d+$/);
      if (!match) {
        // Not a pure number — likely mid-stream context data, skip this group
        console.warn(`[MapParser] Non-numeric line at index ${i}, re-aligning: "${rawVisualClass.substring(0, 60)}"`);
        // Try to find the next numeric line to re-align
        while (i < rawLines.length && !/^-?\d+$/.test(rawLines[i].trim())) {
          i++;
        }
        i -= 5; // will be incremented by 5 by the for-loop
        continue;
      }
      visualClass = match[0];

      // Debug log for first 5 buildings
      if (buildings.length < 5) {
        console.log(
          `[MapParser] Building ${buildings.length + 1}: raw="${rawVisualClass}" -> cleaned="${visualClass}"`,
        );
      }

      const tycoonId = parseInt(rawLines[i + 1], 10);
      const options = parseInt(rawLines[i + 2], 10);
      const x = parseInt(rawLines[i + 3], 10);
      const y = parseInt(rawLines[i + 4], 10);

      // Validate data (coordinates should be in reasonable range)
      if (
        visualClass &&
        !isNaN(tycoonId) &&
        !isNaN(options) &&
        !isNaN(x) &&
        !isNaN(y) &&
        x >= 0 &&
        x < 2000 &&
        y >= 0 &&
        y < 2000
      ) {
        // Decode OptionsByte (spec Section 4.3)
        // Level  = options >> 4           (unsigned shift right, bits 4-7)
        // Alert  = (options & 0x0F) != 0  (any low nibble bit set)
        // Attack = options & 0x0E         (bits 1-3 of low nibble)
        const level = (options >>> 4) & 0x0F;
        const alert = (options & 0x0F) !== 0;
        const attack = options & 0x0E;

        buildings.push({
          visualClass,
          tycoonId,
          options,
          x,
          y,
          level,
          alert,
          attack,
        });
      } else {
        console.warn(
          `[MapParser] Invalid building data at index ${i}: visualClass="${visualClass}", x=${x}, y=${y}`,
        );
      }
    } catch (e: unknown) {
      console.warn(`[MapParser] Failed to parse building at index ${i}:`, e);
    }
  }

  return buildings;
}

/**
 * Parse raw segment data from SegmentsInArea response
 * Format: 10 numbers per segment (x1, y1, x2, y2, unknown1-6)
 *
 * @param rawLines Array of raw lines from response
 * @returns Array of parsed MapSegment objects
 */
export function parseSegments(rawLines: string[]): MapSegment[] {
  const segments: MapSegment[] = [];

  // Skip non-numeric context/header lines (same as parseBuildings)
  let startIndex = 0;
  while (startIndex < rawLines.length && !/^-?\d+$/.test(rawLines[startIndex].trim())) {
    console.log(`[MapParser:Segments] Skipping context line[${startIndex}]: "${rawLines[startIndex].substring(0, 80)}"`);
    startIndex++;
  }

  if (startIndex > 0) {
    console.log(`[MapParser:Segments] Skipped ${startIndex} context/header line(s)`);
  }

  // Segments come in groups of 10 numbers
  for (let i = startIndex; i + 9 < rawLines.length; i += 10) {
    try {
      const x1 = parseInt(rawLines[i], 10);
      const y1 = parseInt(rawLines[i + 1], 10);
      const x2 = parseInt(rawLines[i + 2], 10);
      const y2 = parseInt(rawLines[i + 3], 10);
      const unknown1 = parseInt(rawLines[i + 4], 10);
      const unknown2 = parseInt(rawLines[i + 5], 10);
      const unknown3 = parseInt(rawLines[i + 6], 10);
      const unknown4 = parseInt(rawLines[i + 7], 10);
      const unknown5 = parseInt(rawLines[i + 8], 10);
      const unknown6 = parseInt(rawLines[i + 9], 10);

      // Validate data
      if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
        segments.push({
          x1,
          y1,
          x2,
          y2,
          unknown1,
          unknown2,
          unknown3,
          unknown4,
          unknown5,
          unknown6,
        });
      }
    } catch (e: unknown) {
      console.warn(`[MapParser] Failed to parse segment at index ${i}:`, e);
    }
  }

  return segments;
}

/**
 * Parse building focus response payload
 * Handles various formats with different numbers of header lines
 *
 * @param payload Raw payload from SwitchFocusEx or RefreshObject
 * @param x X coordinate of building
 * @param y Y coordinate of building
 * @returns Parsed BuildingFocusInfo object
 */
export function parseBuildingFocusResponse(
  payload: string,
  x: number,
  y: number,
): BuildingFocusInfo {
  // Clean payload (removes quotes and trim)
  let cleaned = cleanPayload(payload);

  // Remove leading '%' if present
  if (cleaned.startsWith('%')) {
    cleaned = cleaned.substring(1);
  }

  // Split by the special separator "-:"
  const sections = cleaned.split('-:');

  // RELAXED: Accept 1+ sections (RefreshObject may have incomplete data)
  if (sections.length < 1) {
    console.warn(`[MapParser] Invalid building focus format, sections:`, sections.length);
    console.warn(`[MapParser] Full payload:`, cleaned);
    throw new Error('Invalid building focus response format');
  }

  // Parse header section (before first "-:") using blank-line groups.
  // SwitchFocusEx responses use blank lines as natural group separators:
  //   Group 0: ID \n Name
  //   Group 1: Company name
  //   Group 2: Status/sales lines (1 or many)
  //   Group 3: Revenue line
  // RefreshObject ExtraInfo uses single newlines (no blank-line separators),
  // so we fall back to line-by-line parsing when only 1 group is found.
  // CRITICAL FIX: Handle both \r\n AND \n\r line endings
  const headerText = sections[0];
  const groups = headerText
    .split(/(?:\r?\n\r?){2,}/)  // Split on 2+ consecutive newlines (blank lines)
    .map(g => g.trim())
    .filter(g => g.length > 0);

  if (groups.length < 1) {
    throw new Error('Invalid building focus header format - no data');
  }

  let buildingId = '';
  let buildingName = '';
  let ownerName = '';
  let salesInfo = '';
  let revenue = '';

  if (groups.length >= 3) {
    // Blank-line separated format (SwitchFocusEx):
    // Group 0: "ID\nName", Group 1: "Company", Group 2: "sales lines", Group 3: "revenue"
    const idNameLines = groups[0].split(/\r?\n\r?/).map(l => l.trim()).filter(l => l.length > 0);
    buildingId = idNameLines[0] || '';
    buildingName = idNameLines[1] || '';
    ownerName = groups[1].split(/\r?\n\r?/)[0]?.trim() || '';
    salesInfo = groups[2]
      .split(/\r?\n\r?/)
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n');
    if (groups.length >= 4) {
      revenue = extractRevenue(groups[3]);
    }
  } else {
    // Single-group fallback (RefreshObject ExtraInfo — no blank lines):
    // Lines: ID, Name, Company, salesInfo..., Revenue
    const headerLines = headerText.split(/\r?\n\r?/).map(l => l.trim()).filter(l => l.length > 0);
    buildingId = headerLines[0] || '';
    if (headerLines.length >= 2) buildingName = headerLines[1];
    if (headerLines.length >= 3) ownerName = headerLines[2];
    if (headerLines.length >= 4) {
      // Scan from end to find revenue line, collect middle as salesInfo
      let revenueIdx = -1;
      for (let i = headerLines.length - 1; i >= 3; i--) {
        if (extractRevenue(headerLines[i])) {
          revenueIdx = i;
          break;
        }
      }
      if (revenueIdx >= 0) {
        revenue = extractRevenue(headerLines[revenueIdx]);
        const salesLines = headerLines.slice(3, revenueIdx);
        salesInfo = salesLines.join('\n');
      } else {
        salesInfo = headerLines.slice(3).join('\n');
      }
    }
  }

  // Details text (section 1 after "-:" - may be empty)
  const detailsText =
    sections.length > 1
      ? sections[1].trim().replace(/:$/, '') // Remove trailing ':'
      : '';

  // Hints text (section 2 after "-:" - may be empty or missing)
  const hintsText =
    sections.length > 2
      ? sections[2].trim().replace(/:$/, '') // Remove trailing ':'
      : '';

  return {
    buildingId: buildingId.replace(/[%#@]/g, ''), // Remove '%', '#', '@' prefixes
    buildingName,
    ownerName,
    salesInfo,
    revenue,
    detailsText,
    hintsText,
    x,
    y,
    xsize: 1,        // Enriched client-side from FacilityDimensionsCache
    ysize: 1,        // Enriched client-side from FacilityDimensionsCache
    visualClass: '0', // Enriched client-side from renderer hit data
  };
}
