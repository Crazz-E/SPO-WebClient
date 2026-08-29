/**
 * Cache Path Resolution
 * =====================
 * Extracted logic for resolving /cache/ endpoint paths with case-insensitive
 * filename lookup via imageFileIndex and BMP-to-PNG upgrade with filesystem fallback.
 */

import * as path from 'path';
import * as fsp from 'fs/promises';

/**
 * Resolve a /cache/ relative path to a filesystem path using the imageFileIndex
 * for case-insensitive matching. Falls back to direct path if not indexed.
 *
 * @param relativePath - The path component after `/cache/` (e.g., `BuildingImages/MapPGILoResF64x32x0.gif`)
 * @param cacheDir - The base cache directory path
 * @param fileIndex - Map of lowercase filenames to actual filesystem paths
 * @returns The resolved filesystem path
 */
export function resolveCachePath(
  relativePath: string,
  cacheDir: string,
  fileIndex: Map<string, string>,
): string {
  const lastSlash = relativePath.lastIndexOf('/');
  const filename = lastSlash >= 0 ? relativePath.substring(lastSlash + 1) : relativePath;
  const indexedPath = fileIndex.get(filename.toLowerCase());
  return indexedPath ?? path.join(cacheDir, relativePath);
}

/**
 * Resolve BMP-to-PNG upgrade for a file, checking index first then filesystem.
 * If the original file is a BMP and a PNG variant exists, returns the PNG path.
 * Otherwise returns null.
 *
 * This function includes a filesystem fallback (fsp.access) to detect PNG files
 * that exist on disk but are not yet indexed.
 *
 * @param filename - The original filename (e.g., `Road1.bmp`)
 * @param filePath - The original BMP filesystem path (used to compute pngPath)
 * @param fileIndex - Map of lowercase filenames to actual filesystem paths
 * @returns Promise resolving to PNG path if found, null otherwise
 */
export async function resolveBmpToPng(
  filename: string,
  filePath: string,
  fileIndex: Map<string, string>,
): Promise<string | null> {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.bmp') return null;

  // (1) Check fileIndex for PNG variant
  const pngFilename = filename.replace(/\.bmp$/i, '.png');
  const indexedPng = fileIndex.get(pngFilename.toLowerCase());
  if (indexedPng) {
    return indexedPng;
  }

  // (2) Construct pngPath by replacing .bmp with .png
  const pngPath = filePath.replace(/\.bmp$/i, '.png');

  // (3) Try filesystem access; if successful, PNG exists on disk
  try {
    await fsp.access(pngPath);
    return pngPath;
  } catch {
    // PNG doesn't exist on filesystem
    return null;
  }
}
