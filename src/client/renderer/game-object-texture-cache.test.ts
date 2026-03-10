/**
 * Unit tests for GameObjectTextureCache
 * Tests atlas loading and texture management for road/concrete/building textures.
 */

import { GameObjectTextureCache } from './game-object-texture-cache';
import type { AnimatedTexture } from './game-object-texture-cache';

// Mock gifuct-js
const mockParseGIF = jest.fn();
const mockDecompressFrames = jest.fn();
jest.mock('gifuct-js', () => ({
  parseGIF: (...args: unknown[]) => mockParseGIF(...args),
  decompressFrames: (...args: unknown[]) => mockDecompressFrames(...args),
}));

// Mock fetch
global.fetch = jest.fn();

// Mock createImageBitmap
(global as any).createImageBitmap = jest.fn();

// Mock ImageData (not available in Node.js test environment)
(global as any).ImageData = class ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
};

// Mock facility dimensions cache
jest.mock('../facility-dimensions-cache', () => ({
  getFacilityDimensionsCache: () => ({
    getFacility: (visualClass: string) => {
      if (visualClass === 'PGIFoodStore') {
        return {
          textureFilename: 'MapPGIFoodStore64x32x0.gif',
          constructionTextureFilename: 'Construction64.gif',
        };
      }
      return null;
    },
  }),
}));

describe('GameObjectTextureCache', () => {
  let cache: GameObjectTextureCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new GameObjectTextureCache();

    // Default mock: return 404
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 404,
    });
  });

  describe('constructor', () => {
    it('should create cache with default max size of 2048', () => {
      const stats = cache.getStats();
      expect(stats.maxSize).toBe(2048);
    });

    it('should create cache with custom max size', () => {
      const custom = new GameObjectTextureCache(100);
      expect(custom.getStats().maxSize).toBe(100);
    });

    it('should start with empty cache', () => {
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getTextureSync', () => {
    it('should return null for uncached texture', () => {
      const texture = cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      expect(texture).toBeNull();
    });

    it('should trigger async load for uncached texture', () => {
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      expect(global.fetch).toHaveBeenCalledWith('/cache/RoadBlockImages/Roadvert.bmp');
    });

    it('should not start multiple loads for same texture', () => {
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should increment misses for uncached texture', () => {
      cache.getTextureSync('ConcreteImages', 'concrete1.bmp');
      expect(cache.getStats().misses).toBe(1);
    });
  });

  describe('getTextureAsync', () => {
    it('should resolve to null for missing texture (404)', async () => {
      const texture = await cache.getTextureAsync('RoadBlockImages', 'missing.bmp');
      expect(texture).toBeNull();
    });

    it('should resolve to ImageBitmap for successful response', async () => {
      const mockBitmap = { width: 64, height: 32, close: jest.fn() };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(new Blob()),
      });
      (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap);

      const texture = await cache.getTextureAsync('RoadBlockImages', 'Roadvert.bmp');
      expect(texture).toBe(mockBitmap);
    });
  });

  describe('object atlas', () => {
    const mockManifest = {
      category: 'road',
      tileWidth: 64,
      tileHeight: 32,
      atlasWidth: 512,
      atlasHeight: 256,
      tiles: {
        'Roadvert.bmp': { x: 0, y: 0, width: 64, height: 32 },
        'Roadhorz.bmp': { x: 64, y: 0, width: 64, height: 32 },
        'Bridge.bmp': { x: 128, y: 0, width: 64, height: 90 },
      },
    };

    const mockBitmap = { width: 512, height: 256, close: jest.fn() };

    function setupAtlasMock() {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('/manifest')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockManifest),
          });
        }
        if (url.includes('/api/object-atlas/')) {
          return Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(new Blob()),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);
    }

    it('should load object atlas from server', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      expect(global.fetch).toHaveBeenCalledWith('/api/object-atlas/road');
      expect(global.fetch).toHaveBeenCalledWith('/api/object-atlas/road/manifest');
      expect(cache.hasAtlas('road')).toBe(true);
    });

    it('should not reload atlas if already loaded', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');
      await cache.loadObjectAtlas('road');

      // Only 2 fetch calls (atlas + manifest), not 4
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle failed atlas load gracefully', async () => {
      // Default mock returns 404
      await cache.loadObjectAtlas('road');
      expect(cache.hasAtlas('road')).toBe(false);
    });

    it('should return atlas rect for known texture', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      const rect = cache.getAtlasRect('RoadBlockImages', 'Roadvert.bmp');
      expect(rect).not.toBeNull();
      expect(rect!.sx).toBe(0);
      expect(rect!.sy).toBe(0);
      expect(rect!.sw).toBe(64);
      expect(rect!.sh).toBe(32);
      expect(rect!.atlas).toBe(mockBitmap);
    });

    it('should return atlas rect for tall texture (bridge)', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      const rect = cache.getAtlasRect('RoadBlockImages', 'Bridge.bmp');
      expect(rect).not.toBeNull();
      expect(rect!.sh).toBe(90);
    });

    it('should return null for unknown texture in atlas', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      const rect = cache.getAtlasRect('RoadBlockImages', 'NonExistent.bmp');
      expect(rect).toBeNull();
    });

    it('should return null when atlas not loaded', () => {
      const rect = cache.getAtlasRect('RoadBlockImages', 'Roadvert.bmp');
      expect(rect).toBeNull();
    });

    it('should return null for categories without atlas (BuildingImages)', async () => {
      setupAtlasMock();
      await cache.loadObjectAtlas('road');

      const rect = cache.getAtlasRect('BuildingImages', 'MapSomething.gif');
      expect(rect).toBeNull();
    });

    it('should map ConcreteImages to concrete atlas', async () => {
      const concreteManifest = {
        category: 'concrete',
        tileWidth: 64,
        tileHeight: 32,
        atlasWidth: 256,
        atlasHeight: 128,
        tiles: {
          'concrete1.bmp': { x: 0, y: 0, width: 64, height: 32 },
        },
      };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('/manifest')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(concreteManifest),
          });
        }
        if (url.includes('/api/object-atlas/')) {
          return Promise.resolve({
            ok: true,
            blob: () => Promise.resolve(new Blob()),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      await cache.loadObjectAtlas('concrete');

      const rect = cache.getAtlasRect('ConcreteImages', 'concrete1.bmp');
      expect(rect).not.toBeNull();
      expect(rect!.sw).toBe(64);
    });
  });

  describe('clear', () => {
    it('should reset all cache state', () => {
      cache.getTextureSync('RoadBlockImages', 'Roadvert.bmp');
      cache.clear();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should clear loaded atlases', async () => {
      const mockManifest = {
        category: 'road',
        tileWidth: 64, tileHeight: 32,
        atlasWidth: 256, atlasHeight: 128,
        tiles: { 'test.bmp': { x: 0, y: 0, width: 64, height: 32 } },
      };
      const mockBitmap = { width: 256, height: 128, close: jest.fn() };

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith('/manifest')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockManifest) });
        }
        return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob()) });
      });
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      await cache.loadObjectAtlas('road');
      expect(cache.hasAtlas('road')).toBe(true);

      cache.clear();
      expect(cache.hasAtlas('road')).toBe(false);
      expect(mockBitmap.close).toHaveBeenCalled();
    });
  });

  describe('static methods', () => {
    it('should get road texture type for 4-way intersection', () => {
      expect(GameObjectTextureCache.getRoadTextureType(true, true, true, true)).toBe('Roadcross');
    });

    it('should get road texture type for straight vertical', () => {
      expect(GameObjectTextureCache.getRoadTextureType(true, false, true, false)).toBe('Roadvert');
    });

    it('should get road texture type for straight horizontal', () => {
      expect(GameObjectTextureCache.getRoadTextureType(false, true, false, true)).toBe('Roadhorz');
    });

    it('should get road texture type for corners', () => {
      expect(GameObjectTextureCache.getRoadTextureType(true, true, false, false)).toBe('RoadcornerW');
      expect(GameObjectTextureCache.getRoadTextureType(false, true, true, false)).toBe('RoadcornerN');
      expect(GameObjectTextureCache.getRoadTextureType(false, false, true, true)).toBe('RoadcornerE');
      expect(GameObjectTextureCache.getRoadTextureType(true, false, false, true)).toBe('RoadcornerS');
    });

    it('should get road texture type for T-junctions', () => {
      expect(GameObjectTextureCache.getRoadTextureType(false, true, true, true)).toBe('RoadTS');
      expect(GameObjectTextureCache.getRoadTextureType(true, false, true, true)).toBe('RoadTW');
      expect(GameObjectTextureCache.getRoadTextureType(true, true, false, true)).toBe('RoadTN');
      expect(GameObjectTextureCache.getRoadTextureType(true, true, true, false)).toBe('RoadTE');
    });

    it('should get road texture filename', () => {
      expect(GameObjectTextureCache.getRoadTextureFilename('Roadvert')).toBe('Roadvert.bmp');
    });

    it('should get building texture filename from facility cache', () => {
      expect(GameObjectTextureCache.getBuildingTextureFilename('PGIFoodStore')).toBe('MapPGIFoodStore64x32x0.gif');
    });

    it('should use fallback pattern for unknown buildings', () => {
      expect(GameObjectTextureCache.getBuildingTextureFilename('Unknown')).toBe('MapUnknown64x32x0.gif');
    });

    it('should get construction texture filename', () => {
      expect(GameObjectTextureCache.getConstructionTextureFilename('PGIFoodStore')).toBe('Construction64.gif');
    });
  });

  describe('onTextureLoaded callback', () => {
    it('should call callback when texture is loaded', async () => {
      const callback = jest.fn();
      cache.setOnTextureLoaded(callback);

      const mockBitmap = { width: 64, height: 32, close: jest.fn() };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(new Blob()),
      });
      (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap);

      await cache.getTextureAsync('RoadBlockImages', 'Roadvert.bmp');
      expect(callback).toHaveBeenCalledWith('RoadBlockImages', 'Roadvert.bmp');
    });

    it('should not call callback for missing textures', async () => {
      const callback = jest.fn();
      cache.setOnTextureLoaded(callback);

      await cache.getTextureAsync('RoadBlockImages', 'missing.bmp');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('animated GIF support', () => {
    const makeMockFrames = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        dims: { width: 64, height: 32, top: 0, left: 0 },
        delay: 10, // centiseconds (= 100ms)
        patch: new Uint8ClampedArray(64 * 32 * 4),
        pixels: [],
        colorTable: [],
        disposalType: 0,
        transparentIndex: -1,
      }));

    const makeMockBitmap = (id: number) => ({
      width: 64,
      height: 32,
      close: jest.fn(),
      _id: id,
    });

    function setupAnimatedGifMock(frameCount: number) {
      const mockBlob = {
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      });

      mockParseGIF.mockReturnValue({ frames: [], lsd: { width: 64, height: 32 } });
      mockDecompressFrames.mockReturnValue(makeMockFrames(frameCount));

      const bitmaps = Array.from({ length: frameCount }, (_, i) => makeMockBitmap(i));
      let bitmapIndex = 0;
      (global as any).createImageBitmap.mockImplementation(() =>
        Promise.resolve(bitmaps[bitmapIndex++])
      );

      return bitmaps;
    }

    it('should decode animated GIF with multiple frames', async () => {
      const bitmaps = setupAnimatedGifMock(3);

      const texture = await cache.getTextureAsync('BuildingImages', 'mapportalin64x32x0.gif');
      expect(texture).toBe(bitmaps[0]); // first frame as static fallback

      const animated = cache.getAnimatedTexture('BuildingImages', 'mapportalin64x32x0.gif');
      expect(animated).not.toBeNull();
      expect(animated!.frames).toHaveLength(3);
      expect(animated!.totalDuration).toBe(300); // 3 frames * 100ms each
    });

    it('should not create animated texture for single-frame GIF', async () => {
      const mockBlob = {
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      });

      mockParseGIF.mockReturnValue({ frames: [], lsd: { width: 64, height: 32 } });
      mockDecompressFrames.mockReturnValue(makeMockFrames(1));

      const mockBitmap = makeMockBitmap(0);
      (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

      await cache.getTextureAsync('BuildingImages', 'MapPGIFoodStore64x32x0.gif');

      const animated = cache.getAnimatedTexture('BuildingImages', 'MapPGIFoodStore64x32x0.gif');
      expect(animated).toBeNull();
    });

    it('should not attempt GIF decode for non-GIF textures', async () => {
      const mockBitmap = makeMockBitmap(0);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(new Blob()),
      });
      (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap);

      await cache.getTextureAsync('RoadBlockImages', 'Roadvert.bmp');
      expect(mockParseGIF).not.toHaveBeenCalled();
    });

    it('should not attempt GIF decode for non-BuildingImages category', async () => {
      const mockBitmap = makeMockBitmap(0);
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(new Blob()),
      });
      (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap);

      await cache.getTextureAsync('CarImages', 'car.gif');
      expect(mockParseGIF).not.toHaveBeenCalled();
    });

    it('should return null from getAnimatedTexture for uncached entry', () => {
      const animated = cache.getAnimatedTexture('BuildingImages', 'nonexistent.gif');
      expect(animated).toBeNull();
    });

    it('should floor frame delay to 20ms minimum', async () => {
      const mockBlob = {
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      });

      mockParseGIF.mockReturnValue({ frames: [], lsd: { width: 64, height: 32 } });
      // delay=0 centiseconds → 0ms → floored to 20ms
      mockDecompressFrames.mockReturnValue([
        { dims: { width: 64, height: 32, top: 0, left: 0 }, delay: 0, patch: new Uint8ClampedArray(64 * 32 * 4), pixels: [], colorTable: [], disposalType: 0, transparentIndex: -1 },
        { dims: { width: 64, height: 32, top: 0, left: 0 }, delay: 0, patch: new Uint8ClampedArray(64 * 32 * 4), pixels: [], colorTable: [], disposalType: 0, transparentIndex: -1 },
      ]);

      const bitmaps = [makeMockBitmap(0), makeMockBitmap(1)];
      let idx = 0;
      (global as any).createImageBitmap.mockImplementation(() => Promise.resolve(bitmaps[idx++]));

      await cache.getTextureAsync('BuildingImages', 'test.gif');
      const animated = cache.getAnimatedTexture('BuildingImages', 'test.gif');
      expect(animated).not.toBeNull();
      expect(animated!.frames[0].delay).toBe(20);
      expect(animated!.frames[1].delay).toBe(20);
      expect(animated!.totalDuration).toBe(40);
    });

    it('should handle GIF decode errors gracefully', async () => {
      const mockBlob = {
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
      };
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(mockBlob),
      });

      mockParseGIF.mockImplementation(() => { throw new Error('Invalid GIF'); });

      const mockBitmap = makeMockBitmap(0);
      (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap);

      const texture = await cache.getTextureAsync('BuildingImages', 'corrupt.gif');
      // Falls back to static bitmap from the recreated blob
      expect(texture).toBe(mockBitmap);
      expect(cache.getAnimatedTexture('BuildingImages', 'corrupt.gif')).toBeNull();
    });

    describe('getAnimatedFrame', () => {
      it('should return correct frame based on elapsed time', () => {
        const frames = [
          { bitmap: makeMockBitmap(0) as unknown as ImageBitmap, delay: 100 },
          { bitmap: makeMockBitmap(1) as unknown as ImageBitmap, delay: 200 },
          { bitmap: makeMockBitmap(2) as unknown as ImageBitmap, delay: 100 },
        ];
        const animated: AnimatedTexture = { frames, totalDuration: 400 };

        // t=0 → frame 0 (0-100ms)
        expect(cache.getAnimatedFrame(animated, 0)).toBe(frames[0].bitmap);
        // t=50 → frame 0
        expect(cache.getAnimatedFrame(animated, 50)).toBe(frames[0].bitmap);
        // t=100 → frame 1 (100-300ms)
        expect(cache.getAnimatedFrame(animated, 100)).toBe(frames[1].bitmap);
        // t=250 → frame 1
        expect(cache.getAnimatedFrame(animated, 250)).toBe(frames[1].bitmap);
        // t=300 → frame 2 (300-400ms)
        expect(cache.getAnimatedFrame(animated, 300)).toBe(frames[2].bitmap);
        // t=350 → frame 2
        expect(cache.getAnimatedFrame(animated, 350)).toBe(frames[2].bitmap);
      });

      it('should loop animation after totalDuration', () => {
        const frames = [
          { bitmap: makeMockBitmap(0) as unknown as ImageBitmap, delay: 100 },
          { bitmap: makeMockBitmap(1) as unknown as ImageBitmap, delay: 100 },
        ];
        const animated: AnimatedTexture = { frames, totalDuration: 200 };

        // t=200 → loops to t=0 → frame 0
        expect(cache.getAnimatedFrame(animated, 200)).toBe(frames[0].bitmap);
        // t=350 → loops to t=150 → frame 1
        expect(cache.getAnimatedFrame(animated, 350)).toBe(frames[1].bitmap);
        // t=500 → loops to t=100 → frame 1
        expect(cache.getAnimatedFrame(animated, 500)).toBe(frames[1].bitmap);
      });
    });

    describe('color keying for GIFs in COLOR_KEY_GIFS', () => {
      it('should apply color keying to single-frame GIF in COLOR_KEY_GIFS set', async () => {
        const mockBlob = {
          arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
        };
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          blob: jest.fn().mockResolvedValue(mockBlob),
        });

        // Create frame with known background (pixel 0,0 = dark gray 19,21,21)
        const patch = new Uint8ClampedArray(4 * 4); // 2x2 pixels
        // Pixel (0,0): background color
        patch[0] = 19; patch[1] = 21; patch[2] = 21; patch[3] = 255;
        // Pixel (1,0): also background (within tolerance)
        patch[4] = 20; patch[5] = 22; patch[6] = 20; patch[7] = 255;
        // Pixel (0,1): content (red, different from background)
        patch[8] = 255; patch[9] = 0; patch[10] = 0; patch[11] = 255;
        // Pixel (1,1): content (blue)
        patch[12] = 0; patch[13] = 0; patch[14] = 255; patch[15] = 255;

        mockParseGIF.mockReturnValue({ frames: [], lsd: { width: 2, height: 2 } });
        mockDecompressFrames.mockReturnValue([{
          dims: { width: 2, height: 2, top: 0, left: 0 },
          delay: 10,
          patch,
          pixels: [],
          colorTable: [],
          disposalType: 0,
          transparentIndex: -1,
        }]);

        let capturedImageData: InstanceType<typeof ImageData> | null = null;
        (global as any).createImageBitmap.mockImplementation((data: unknown) => {
          if (data instanceof ImageData) capturedImageData = data;
          return Promise.resolve(makeMockBitmap(0));
        });

        // Use the filename that's in COLOR_KEY_GIFS
        await cache.getTextureAsync('BuildingImages', 'mapmkocdstore64x32x0.gif');

        // Should have gone through gifuct-js decode path (ImageData, not Blob)
        expect(capturedImageData).not.toBeNull();
        // Background pixels should have alpha=0
        expect(capturedImageData!.data[3]).toBe(0);   // pixel (0,0): transparent
        expect(capturedImageData!.data[7]).toBe(0);   // pixel (1,0): transparent (within tolerance)
        // Content pixels should remain opaque
        expect(capturedImageData!.data[11]).toBe(255); // pixel (0,1): red, opaque
        expect(capturedImageData!.data[15]).toBe(255); // pixel (1,1): blue, opaque

        // Single-frame → no animated texture
        expect(cache.getAnimatedTexture('BuildingImages', 'mapmkocdstore64x32x0.gif')).toBeNull();
      });

      it('should NOT apply color keying to GIF not in COLOR_KEY_GIFS set', async () => {
        const mockBlob = {
          arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
        };
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          blob: jest.fn().mockResolvedValue(mockBlob),
        });

        mockParseGIF.mockReturnValue({ frames: [], lsd: { width: 64, height: 32 } });
        mockDecompressFrames.mockReturnValue(makeMockFrames(1));

        const mockBitmap = makeMockBitmap(0);
        (global as any).createImageBitmap.mockResolvedValue(mockBitmap);

        // Use a filename NOT in COLOR_KEY_GIFS — single-frame goes to browser-native path
        await cache.getTextureAsync('BuildingImages', 'MapPGIFoodStore64x32x0.gif');

        // Should have been called with a Blob (browser-native), not ImageData
        const lastCall = (global as any).createImageBitmap.mock.calls.at(-1);
        expect(lastCall[0]).toBeInstanceOf(Blob);
      });

      it('should apply color keying to animated GIF in COLOR_KEY_GIFS set', async () => {
        // Create 2-frame GIF with background color
        const makeColorKeyFrame = () => {
          const patch = new Uint8ClampedArray(2 * 2 * 4); // 2x2
          // Pixel (0,0): background
          patch[0] = 19; patch[1] = 21; patch[2] = 21; patch[3] = 255;
          // Pixel (1,0): content
          patch[4] = 200; patch[5] = 100; patch[6] = 50; patch[7] = 255;
          // Pixel (0,1): background
          patch[8] = 19; patch[9] = 21; patch[10] = 21; patch[11] = 255;
          // Pixel (1,1): content
          patch[12] = 100; patch[13] = 200; patch[14] = 50; patch[15] = 255;
          return {
            dims: { width: 2, height: 2, top: 0, left: 0 },
            delay: 10,
            patch,
            pixels: [],
            colorTable: [],
            disposalType: 0,
            transparentIndex: -1,
          };
        };

        const mockBlob = {
          arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
        };
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          blob: jest.fn().mockResolvedValue(mockBlob),
        });

        mockParseGIF.mockReturnValue({ frames: [], lsd: { width: 2, height: 2 } });
        mockDecompressFrames.mockReturnValue([makeColorKeyFrame(), makeColorKeyFrame()]);

        const capturedImageDatas: Array<InstanceType<typeof ImageData>> = [];
        let bitmapIdx = 0;
        (global as any).createImageBitmap.mockImplementation((data: unknown) => {
          if (data instanceof ImageData) capturedImageDatas.push(data);
          return Promise.resolve(makeMockBitmap(bitmapIdx++));
        });

        await cache.getTextureAsync('BuildingImages', 'mapmkocdstore64x32x0.gif');

        // Both frames should have color keying applied
        expect(capturedImageDatas).toHaveLength(2);
        for (const imgData of capturedImageDatas) {
          expect(imgData.data[3]).toBe(0);    // background pixel: transparent
          expect(imgData.data[7]).toBe(255);   // content pixel: opaque
          expect(imgData.data[11]).toBe(0);    // background pixel: transparent
          expect(imgData.data[15]).toBe(255);  // content pixel: opaque
        }

        // Should be animated (2 frames)
        const animated = cache.getAnimatedTexture('BuildingImages', 'mapmkocdstore64x32x0.gif');
        expect(animated).not.toBeNull();
        expect(animated!.frames).toHaveLength(2);
      });
    });

    describe('animated texture cleanup', () => {
      it('should close animated frame bitmaps on clear()', async () => {
        const bitmaps = setupAnimatedGifMock(2);
        await cache.getTextureAsync('BuildingImages', 'portal.gif');

        cache.clear();

        // All frame bitmaps should be closed
        for (const bitmap of bitmaps) {
          expect(bitmap.close).toHaveBeenCalled();
        }
      });

      it('should close animated frame bitmaps on eviction', async () => {
        const smallCache = new GameObjectTextureCache(1);

        // Load first animated texture
        const bitmaps1 = setupAnimatedGifMock(2);
        await smallCache.getTextureAsync('BuildingImages', 'portal1.gif');

        // Load second texture to trigger eviction of first
        const mockBitmap2 = makeMockBitmap(99);
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          blob: jest.fn().mockResolvedValue(new Blob()),
        });
        mockParseGIF.mockReset();
        (global as any).createImageBitmap.mockResolvedValueOnce(mockBitmap2);

        await smallCache.getTextureAsync('RoadBlockImages', 'road.bmp');

        // First animated texture's frames should be closed via eviction
        for (const bitmap of bitmaps1) {
          expect(bitmap.close).toHaveBeenCalled();
        }
      });
    });
  });
});
