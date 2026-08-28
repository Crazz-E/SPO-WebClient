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
import * as fsp from 'fs/promises';
import { resolveCachePath, resolveBmpToPng } from '../cache-path-resolver';

// Mock fsp.access for filesystem fallback tests
jest.mock('fs/promises');

describe('Cache endpoint path resolution', () => {
  let fileIndex: Map<string, string>;
  const CACHE_DIR = '/app/cache';

  beforeEach(() => {
    fileIndex = new Map();
    jest.clearAllMocks();
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

describe('BMP-to-PNG upgrade via index and filesystem fallback', () => {
  let fileIndex: Map<string, string>;

  beforeEach(() => {
    fileIndex = new Map();
    jest.clearAllMocks();
  });

  describe('index lookup (no filesystem access)', () => {
    it('finds PNG variant when available in index', async () => {
      fileIndex.set('road1.png', '/app/cache/RoadBlockImages/Road1.png');
      const result = await resolveBmpToPng('Road1.bmp', '/app/cache/RoadBlockImages/Road1.bmp', fileIndex);
      expect(result).toBe('/app/cache/RoadBlockImages/Road1.png');
    });

    it('returns null when PNG variant not in index (filesystem fallback required)', async () => {
      (fsp.access as any).mockRejectedValueOnce(new Error('ENOENT'));
      const result = await resolveBmpToPng('Road1.bmp', '/app/cache/RoadBlockImages/Road1.bmp', fileIndex);
      expect(result).toBeNull();
    });

    it('returns null for non-BMP files', async () => {
      fileIndex.set('building.png', '/app/cache/BuildingImages/Building.png');
      expect(await resolveBmpToPng('building.gif', '/app/cache/BuildingImages/building.gif', fileIndex))
        .toBeNull();
      expect(await resolveBmpToPng('building.png', '/app/cache/BuildingImages/building.png', fileIndex))
        .toBeNull();
    });

    it('handles case-insensitive BMP extension', async () => {
      fileIndex.set('texture.png', '/app/cache/ConcreteImages/Texture.png');
      expect(await resolveBmpToPng('Texture.BMP', '/app/cache/ConcreteImages/Texture.BMP', fileIndex))
        .toBe('/app/cache/ConcreteImages/Texture.png');
      expect(await resolveBmpToPng('TEXTURE.Bmp', '/app/cache/ConcreteImages/TEXTURE.Bmp', fileIndex))
        .toBe('/app/cache/ConcreteImages/Texture.png');
    });
  });

  describe('filesystem fallback when PNG not in index', () => {
    it('returns PNG path when it exists on filesystem', async () => {
      const bmpPath = '/app/cache/RoadBlockImages/Road1.bmp';
      const pngPath = '/app/cache/RoadBlockImages/Road1.png';

      // Mock fsp.access to succeed (PNG exists)
      (fsp.access as any).mockResolvedValueOnce(undefined);

      const result = await resolveBmpToPng('Road1.bmp', bmpPath, fileIndex);

      expect(result).toBe(pngPath);
      expect(fsp.access).toHaveBeenCalledWith(pngPath);
    });

    it('returns null when PNG does not exist on filesystem', async () => {
      const bmpPath = '/app/cache/RoadBlockImages/Road1.bmp';
      const pngPath = '/app/cache/RoadBlockImages/Road1.png';

      // Mock fsp.access to throw (PNG does not exist)
      (fsp.access as any).mockRejectedValueOnce(new Error('ENOENT'));

      const result = await resolveBmpToPng('Road1.bmp', bmpPath, fileIndex);

      expect(result).toBeNull();
      expect(fsp.access).toHaveBeenCalledWith(pngPath);
    });

    it('short-circuits filesystem access if PNG is in index', async () => {
      fileIndex.set('road1.png', '/app/cache/RoadBlockImages/Road1.png');
      const bmpPath = '/app/cache/RoadBlockImages/Road1.bmp';

      // Mock fsp.access (should not be called)
      (fsp.access as any).mockResolvedValueOnce(undefined);

      const result = await resolveBmpToPng('Road1.bmp', bmpPath, fileIndex);

      expect(result).toBe('/app/cache/RoadBlockImages/Road1.png');
      expect(fsp.access).not.toHaveBeenCalled();
    });

    it('uses correct extension replacement for various formats', async () => {
      // Test that .bmp replacement works correctly (always replaces with lowercase .png)
      (fsp.access as any).mockResolvedValueOnce(undefined);

      const result = await resolveBmpToPng('Texture.BMP', '/data/Texture.BMP', fileIndex);

      expect(result).toBe('/data/Texture.png');
      expect(fsp.access).toHaveBeenCalledWith('/data/Texture.png');
    });
  });
});
