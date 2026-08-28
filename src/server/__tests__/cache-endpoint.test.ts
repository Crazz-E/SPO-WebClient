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
import type { ServerResponse } from 'http';
import { resolveCachePath, resolveBmpToPng } from '../cache-path-resolver';
import { handleCacheEndpoint } from '../cache-endpoint-handler';

// Mock fsp.access and fsp.readFile for filesystem fallback tests
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

describe('Server integration flow', () => {
  let fileIndex: Map<string, string>;
  const CACHE_DIR = '/app/cache';
  const WEBCLIENT_CACHE_DIR = '/app/webclient-cache';

  // Helper to create a mocked ServerResponse
  function createMockResponse(): Partial<ServerResponse> {
    return {
      writeHead: jest.fn(),
      end: jest.fn(),
    };
  }

  beforeEach(() => {
    fileIndex = new Map();
    jest.clearAllMocks();
  });

  it('resolves cache path, then checks for PNG upgrade', async () => {
    // Set up fileIndex with mixed-case BMP and PNG
    fileIndex.set('road1.bmp', '/app/cache/RoadBlockImages/Road1.bmp');
    fileIndex.set('road1.png', '/app/cache/RoadBlockImages/Road1.png');

    // Mock fsp.readFile to return content
    (fsp.readFile as any).mockResolvedValueOnce(Buffer.from('image data'));

    const mockRes = createMockResponse();

    // Call handleCacheEndpoint (server.ts lines 936-941 and 968-970)
    await handleCacheEndpoint('/cache/RoadBlockImages/Road1.bmp', CACHE_DIR, WEBCLIENT_CACHE_DIR, fileIndex, mockRes as ServerResponse);

    // Verify the handler called resolveCachePath (line 941) and resolveBmpToPng (lines 968-970)
    // by checking that it tried to read the PNG file (not the BMP)
    expect(fsp.readFile).toHaveBeenCalledWith('/app/cache/RoadBlockImages/Road1.png');

    // Verify response was sent successfully
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'image/png',
    }));
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('BMP with PNG variant uses upgraded path', async () => {
    // Set up fileIndex with both BMP and PNG variants in different case
    fileIndex.set('texturename.bmp', '/app/cache/ConcreteImages/TextureName.bmp');
    fileIndex.set('texturename.png', '/app/cache/ConcreteImages/TextureName.png');

    // Mock fsp.readFile to return PNG content
    (fsp.readFile as any).mockResolvedValueOnce(Buffer.from('png data'));

    const mockRes = createMockResponse();

    // Call handleCacheEndpoint with lowercase request
    await handleCacheEndpoint('/cache/ConcreteImages/texturename.bmp', CACHE_DIR, WEBCLIENT_CACHE_DIR, fileIndex, mockRes as ServerResponse);

    // Verify it resolved to and served the PNG (not the BMP)
    expect(fsp.readFile).toHaveBeenCalledWith('/app/cache/ConcreteImages/TextureName.png');
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'image/png',
    }));
  });

  it('BMP with PNG on filesystem uses filesystem path', async () => {
    // Set up fileIndex with only BMP
    fileIndex.set('road1.bmp', '/app/cache/RoadBlockImages/Road1.bmp');

    // Mock fsp.access to succeed (PNG exists on filesystem)
    (fsp.access as any).mockResolvedValueOnce(undefined);
    // Mock fsp.readFile to return PNG content
    (fsp.readFile as any).mockResolvedValueOnce(Buffer.from('png data'));

    const mockRes = createMockResponse();

    // Call handleCacheEndpoint requesting BMP
    await handleCacheEndpoint('/cache/RoadBlockImages/Road1.bmp', CACHE_DIR, WEBCLIENT_CACHE_DIR, fileIndex, mockRes as ServerResponse);

    // Verify it found the PNG via filesystem fallback and served it
    expect(fsp.access).toHaveBeenCalledWith('/app/cache/RoadBlockImages/Road1.png');
    expect(fsp.readFile).toHaveBeenCalledWith('/app/cache/RoadBlockImages/Road1.png');
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'image/png',
    }));
  });

  it('BMP without PNG fallback handles access error gracefully', async () => {
    // Set up fileIndex with only BMP, no PNG variant
    fileIndex.set('texture.bmp', '/app/cache/BuildingImages/Texture.bmp');

    // Mock fsp.access to fail (PNG doesn't exist), then readFile succeeds
    (fsp.access as any).mockRejectedValue(new Error('ENOENT'));
    (fsp.readFile as any).mockResolvedValue(Buffer.from('bmp data'));

    const mockRes = createMockResponse();

    // Call handleCacheEndpoint requesting BMP (which has no PNG variant)
    await handleCacheEndpoint('/cache/BuildingImages/Texture.bmp', CACHE_DIR, WEBCLIENT_CACHE_DIR, fileIndex, mockRes as ServerResponse);

    // Verify response was successful (either BMP or PNG, but no error)
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(mockRes.end).toHaveBeenCalled();
    // Verify fsp.access was called to check for PNG
    expect(fsp.access).toHaveBeenCalled();
  });

  it('non-BMP files are served as-is without PNG check', async () => {
    // Set up fileIndex with a GIF
    fileIndex.set('building.gif', '/app/cache/BuildingImages/Building.gif');

    // Mock fsp.readFile to return GIF content
    (fsp.readFile as any).mockResolvedValueOnce(Buffer.from('gif data'));

    const mockRes = createMockResponse();

    // Call handleCacheEndpoint requesting GIF
    await handleCacheEndpoint('/cache/BuildingImages/Building.gif', CACHE_DIR, WEBCLIENT_CACHE_DIR, fileIndex, mockRes as ServerResponse);

    // Verify it served the GIF directly without checking for PNG upgrade
    expect(fsp.readFile).toHaveBeenCalledWith('/app/cache/BuildingImages/Building.gif');
    expect(fsp.access).not.toHaveBeenCalled();
    expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'Content-Type': 'image/gif',
    }));
  });

  it('handles file not found error', async () => {
    fileIndex.set('missing.bmp', '/app/cache/RoadBlockImages/Missing.bmp');

    // Mock fsp.readFile to throw ENOENT
    (fsp.readFile as any).mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const mockRes = createMockResponse();

    // Call handleCacheEndpoint
    await handleCacheEndpoint('/cache/RoadBlockImages/Missing.bmp', CACHE_DIR, WEBCLIENT_CACHE_DIR, fileIndex, mockRes as ServerResponse);

    // Verify 404 response
    expect(mockRes.writeHead).toHaveBeenCalledWith(404);
    expect(mockRes.end).toHaveBeenCalledWith('File not found');
  });

  it('rejects paths that escape cache directory', async () => {
    fileIndex.set('etc.passwd', '/etc/passwd');

    const mockRes = createMockResponse();

    // Try to access a path outside the cache directory
    await handleCacheEndpoint('/cache/../etc/passwd', CACHE_DIR, WEBCLIENT_CACHE_DIR, fileIndex, mockRes as ServerResponse);

    // Verify 403 response
    expect(mockRes.writeHead).toHaveBeenCalledWith(403);
    expect(mockRes.end).toHaveBeenCalledWith('Access Denied');
    // Ensure we never tried to read the file
    expect(fsp.readFile).not.toHaveBeenCalled();
  });
});
