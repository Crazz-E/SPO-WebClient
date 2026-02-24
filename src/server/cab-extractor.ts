/**
 * CAB Extractor - Cross-platform Microsoft Cabinet archive extraction
 *
 * Uses the '7zip-min' npm package (v2) for CAB extraction.
 * No external tools required - 7zip-min includes precompiled 7za binaries.
 * Works on Windows, Linux, and macOS.
 *
 * 7za supports: 7z, lzma, cab, zip, gzip, bzip2, Z, tar formats
 *
 * Package: https://www.npmjs.com/package/7zip-min
 */

import * as fs from 'fs';
import * as path from 'path';
import { toErrorMessage } from '../shared/error-utils';
import type { ListItem } from '7zip-min';
import * as _7z from '7zip-min';

/**
 * Information about a file within a CAB archive
 */
export interface CabFileInfo {
  name: string;
  size: number;
  offset: number;
}

/**
 * Result of a CAB extraction operation
 */
export interface CabExtractionResult {
  success: boolean;
  extractedFiles: string[];  // Relative paths of extracted files
  errors: string[];
}

/**
 * Convert 7zip-min ListItem[] to CabFileInfo array
 */
function parse7zList(output: ListItem[]): CabFileInfo[] {
  const files: CabFileInfo[] = [];

  if (!Array.isArray(output)) {
    return files;
  }

  for (const item of output) {
    if (item && item.name) {
      files.push({
        name: item.name.replace(/\\/g, '/'),  // Normalize path separators
        size: parseInt(item.size || '0', 10),
        offset: 0  // 7za doesn't provide offset info
      });
    }
  }

  return files;
}

/**
 * Get list of files actually extracted to a directory
 */
function getExtractedFiles(targetDir: string, baseDir: string = targetDir): string[] {
  const files: string[] = [];

  if (!fs.existsSync(targetDir)) {
    return files;
  }

  const entries = fs.readdirSync(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      files.push(...getExtractedFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Extract all files from a CAB archive to a target directory
 *
 * @param cabPath - Path to the CAB file
 * @param targetDir - Directory to extract files to (will be created if needed)
 * @returns Extraction result with list of extracted files
 *
 * @example
 * ```typescript
 * const result = await extractCabArchive('/path/to/archive.cab', '/path/to/output');
 * if (result.success) {
 *   console.log(`Extracted ${result.extractedFiles.length} files`);
 * }
 * ```
 */
export async function extractCabArchive(
  cabPath: string,
  targetDir: string
): Promise<CabExtractionResult> {
  const result: CabExtractionResult = {
    success: false,
    extractedFiles: [],
    errors: []
  };

  // Verify CAB file exists
  if (!fs.existsSync(cabPath)) {
    result.errors.push(`CAB file not found: ${cabPath}`);
    return result;
  }

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  try {
    // Extract using 7zip-min native Promise API (v2)
    await _7z.unpack(cabPath, targetDir);

    // Get list of extracted files, excluding the source CAB file itself
    const cabBaseName = path.basename(cabPath).toLowerCase();
    const extractedFiles = getExtractedFiles(targetDir).filter(
      f => f.toLowerCase() !== cabBaseName
    );

    if (extractedFiles.length === 0) {
      result.errors.push(`No files extracted from CAB archive: ${cabPath}`);
      return result;
    }

    result.extractedFiles = extractedFiles;
    result.success = true;

  } catch (error: unknown) {
    result.errors.push(`Extraction error: ${toErrorMessage(error)}`);
  }

  return result;
}

/**
 * List files in a CAB archive without extracting
 *
 * @param cabPath - Path to the CAB file
 * @returns Array of file information or null if failed
 */
export async function listCabContents(cabPath: string): Promise<CabFileInfo[] | null> {
  if (!fs.existsSync(cabPath)) {
    return null;
  }

  try {
    // 7zip-min list() native Promise API (v2)
    const output = await _7z.list(cabPath);
    return parse7zList(output);
  } catch (error: unknown) {
    return null;
  }
}

/**
 * Check if 7zip-min is available (it should always be available since it's bundled)
 * @returns true if 7zip-min can be loaded
 */
export async function isCabExtractorAvailable(): Promise<boolean> {
  try {
    // Try to access 7zip-min module
    if (!_7z || typeof _7z.unpack !== 'function') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
