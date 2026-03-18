/**
 * Cache Endpoint Tests — case-insensitive path resolution
 *
 * Regression test for commit e0d00c93 which broke building texture loading
 * on Linux (Docker) by lowercasing filenames instead of using the imageFileIndex.
 *
 * The /cache/ endpoint must resolve mixed-case filenames from CLASSES.BIN
 * to actual files on disk (which may have different casing on Linux).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import path from 'path';

// ---------------------------------------------------------------------------
// Mirror of the cache path resolution logic in server.ts /cache/ endpoint
// ---------------------------------------------------------------------------

/**
 * Resolve a /cache/ relative path to a filesystem path using the imageFileIndex
 * for case-insensitive matching. Falls back to direct path if not indexed.
 */
function resolveCachePath(
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
 * Resolve BMP-to-PNG upgrade using the imageFileIndex.
 * Returns the PNG path if available, otherwise null.
 */
function resolveBmpToPng(
  filename: string,
  fileIndex: Map<string, string>,
): string | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.bmp') return null;
  const pngFilename = filename.replace(/\.bmp$/i, '.png');
  return fileIndex.get(pngFilename.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cache endpoint path resolution', () => {
  let fileIndex: Map<string, string>;
  const CACHE_DIR = '/app/cache';

  beforeEach(() => {
    fileIndex = new Map();
  });

  describe('case-insensitive filename lookup via index', () => {
    beforeEach(() => {
      // Simulate what buildImageFileIndex() does: lowercase key → actual path
      fileIndex.set(
        'mappgiloresf64x32x0.gif',
        '/app/cache/BuildingImages/MapPGILoResF64x32x0.gif',
      );
      fileIndex.set(
        'mapifelmuseum64x32.gif',
        '/app/cache/BuildingImages/MapIFELMuseum64x32.gif',
      );
      fileIndex.set(
        'mapmkocdstore64x32x0.gif',
        '/app/cache/BuildingImages/MapMkoCDStore64x32x0.gif',
      );
    });

    it('resolves mixed-case GIF from CLASSES.BIN (Linux regression)', () => {
      const result = resolveCachePath(
        'BuildingImages/MapPGILoResF64x32x0.gif',
        CACHE_DIR,
        fileIndex,
      );
      expect(result).toBe('/app/cache/BuildingImages/MapPGILoResF64x32x0.gif');
    });

    it('resolves lowercase request to mixed-case file on disk', () => {
      const result = resolveCachePath(
        'BuildingImages/mappgiloresf64x32x0.gif',
        CACHE_DIR,
        fileIndex,
      );
      expect(result).toBe('/app/cache/BuildingImages/MapPGILoResF64x32x0.gif');
    });

    it('resolves uppercase request to mixed-case file on disk', () => {
      const result = resolveCachePath(
        'BuildingImages/MAPPGILORESF64X32X0.GIF',
        CACHE_DIR,
        fileIndex,
      );
      expect(result).toBe('/app/cache/BuildingImages/MapPGILoResF64x32x0.gif');
    });

    it('resolves multiple different building textures', () => {
      expect(resolveCachePath('BuildingImages/MapIFELMuseum64x32.gif', CACHE_DIR, fileIndex))
        .toBe('/app/cache/BuildingImages/MapIFELMuseum64x32.gif');
      expect(resolveCachePath('BuildingImages/MapMkoCDStore64x32x0.gif', CACHE_DIR, fileIndex))
        .toBe('/app/cache/BuildingImages/MapMkoCDStore64x32x0.gif');
    });
  });

  describe('fallback when file not in index', () => {
    it('falls back to direct path for unknown files', () => {
      const result = resolveCachePath('BuildingImages/unknown.gif', CACHE_DIR, fileIndex);
      expect(result).toBe(path.join(CACHE_DIR, 'BuildingImages/unknown.gif'));
    });

    it('falls back to direct path with category directory preserved', () => {
      const result = resolveCachePath('RoadBlockImages/road1.bmp', CACHE_DIR, fileIndex);
      expect(result).toBe(path.join(CACHE_DIR, 'RoadBlockImages/road1.bmp'));
    });
  });

  describe('path without subdirectory', () => {
    it('handles bare filename in index', () => {
      fileIndex.set('somefile.gif', '/app/cache/SomeDir/SomeFile.gif');
      const result = resolveCachePath('somefile.gif', CACHE_DIR, fileIndex);
      expect(result).toBe('/app/cache/SomeDir/SomeFile.gif');
    });

    it('handles bare filename fallback', () => {
      const result = resolveCachePath('missing.gif', CACHE_DIR, fileIndex);
      expect(result).toBe(path.join(CACHE_DIR, 'missing.gif'));
    });
  });
});

describe('BMP-to-PNG upgrade via index', () => {
  let fileIndex: Map<string, string>;

  beforeEach(() => {
    fileIndex = new Map();
  });

  it('finds PNG variant when available in index', () => {
    fileIndex.set('road1.png', '/app/cache/RoadBlockImages/Road1.png');
    const result = resolveBmpToPng('Road1.bmp', fileIndex);
    expect(result).toBe('/app/cache/RoadBlockImages/Road1.png');
  });

  it('returns null when PNG variant not in index', () => {
    const result = resolveBmpToPng('Road1.bmp', fileIndex);
    expect(result).toBeNull();
  });

  it('returns null for non-BMP files', () => {
    fileIndex.set('building.png', '/app/cache/BuildingImages/Building.png');
    expect(resolveBmpToPng('building.gif', fileIndex)).toBeNull();
    expect(resolveBmpToPng('building.png', fileIndex)).toBeNull();
  });

  it('handles case-insensitive BMP extension', () => {
    fileIndex.set('texture.png', '/app/cache/ConcreteImages/Texture.png');
    expect(resolveBmpToPng('Texture.BMP', fileIndex)).toBe('/app/cache/ConcreteImages/Texture.png');
    expect(resolveBmpToPng('TEXTURE.Bmp', fileIndex)).toBe('/app/cache/ConcreteImages/Texture.png');
  });
});
