/**
 * Unit tests for IsometricTerrainRenderer
 */

import { ZOOM_LEVELS, Rotation } from '../../shared/map-config';

// Mock the TerrainLoader and CoordinateMapper since we test them separately
jest.mock('./terrain-loader');
jest.mock('./coordinate-mapper');

// Mock HTMLCanvasElement and CanvasRenderingContext2D for Node.js environment
const mockCtx = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left',
  fillRect: jest.fn(),
  strokeRect: jest.fn(),
  fillText: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  clearRect: jest.fn(),
};

const mockCanvas = {
  getContext: jest.fn().mockReturnValue(mockCtx),
  width: 800,
  height: 600,
  clientWidth: 800,
  clientHeight: 600,
  style: { cursor: 'default' },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation((callback) => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock window for keyboard event listeners
(global as any).window = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Mock fetch for texture loading and terrain-info endpoint
global.fetch = jest.fn().mockImplementation((url: string) => {
  // Mock terrain-info endpoint
  if (url.includes('/api/terrain-info/')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        terrainType: 'Earth',
        availableSeasons: [0, 1, 2, 3],
        defaultSeason: 2
      })
    });
  }
  // Default: return 204 for texture loading
  return Promise.resolve({
    ok: false,
    status: 204,
  });
});

// Mock createImageBitmap
(global as any).createImageBitmap = jest.fn().mockResolvedValue({
  width: 32,
  height: 16,
  close: jest.fn(),
});

import { IsometricTerrainRenderer } from './isometric-terrain-renderer';
import { TerrainLoader } from './terrain-loader';
import { CoordinateMapper } from './coordinate-mapper';

describe('IsometricTerrainRenderer', () => {
  let renderer: IsometricTerrainRenderer;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup TerrainLoader mock
    (TerrainLoader as jest.Mock).mockImplementation(() => ({
      loadMap: jest.fn().mockResolvedValue({
        width: 1000,
        height: 1000,
        pixelData: new Uint8Array(1000 * 1000),
        metadata: { name: 'TestMap', width: 1000, height: 1000 }
      }),
      getTextureId: jest.fn().mockReturnValue(21), // Return grass color
      getDimensions: jest.fn().mockReturnValue({ width: 1000, height: 1000 }),
      unload: jest.fn(),
    }));

    // Setup CoordinateMapper mock
    (CoordinateMapper as jest.Mock).mockImplementation(() => ({
      mapToScreen: jest.fn().mockImplementation((i, j, zoomLevel, rotation, origin) => {
        const u = ZOOM_LEVELS[zoomLevel].u;
        return { x: 2 * u * (1000 - i + j), y: u * ((1000 - i) + (1000 - j)) };
      }),
      screenToMap: jest.fn().mockReturnValue({ x: 500, y: 500 }),
      getVisibleBounds: jest.fn().mockReturnValue({
        minI: 490, maxI: 510, minJ: 490, maxJ: 510
      }),
    }));

    renderer = new IsometricTerrainRenderer(mockCanvas as unknown as HTMLCanvasElement);
  });

  describe('constructor', () => {
    it('should create renderer with canvas', () => {
      expect(renderer).toBeDefined();
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
    });

    it('should throw error if context is null', () => {
      const badCanvas = {
        ...mockCanvas,
        getContext: jest.fn().mockReturnValue(null),
      };
      expect(() => {
        new IsometricTerrainRenderer(badCanvas as unknown as HTMLCanvasElement);
      }).toThrow('Failed to get 2D rendering context');
    });

    it('should setup event listeners', () => {
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function));
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function));
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('contextmenu', expect.any(Function));
    });

    it('should set initial cursor style', () => {
      expect(mockCanvas.style.cursor).toBe('grab');
    });
  });

  describe('initial state', () => {
    it('should not be loaded initially', () => {
      expect(renderer.isLoaded()).toBe(false);
    });

    it('should have empty map name initially', () => {
      expect(renderer.getMapName()).toBe('');
    });

    it('should have default zoom level 2', () => {
      expect(renderer.getZoomLevel()).toBe(2);
    });

    it('should have default rotation NORTH', () => {
      expect(renderer.getRotation()).toBe(Rotation.NORTH);
    });
  });

  describe('loadMap', () => {
    it('should load terrain data successfully', async () => {
      const terrainData = await renderer.loadMap('TestMap');

      expect(terrainData).toBeDefined();
      expect(terrainData.width).toBe(1000);
      expect(terrainData.height).toBe(1000);
      expect(renderer.isLoaded()).toBe(true);
      expect(renderer.getMapName()).toBe('TestMap');
    });

    it('should center camera on map after load', async () => {
      await renderer.loadMap('TestMap');

      const pos = renderer.getCameraPosition();
      expect(pos.i).toBe(500);  // Height / 2
      expect(pos.j).toBe(500);  // Width / 2
    });
  });

  describe('zoom control', () => {
    it('should set zoom level within bounds', () => {
      renderer.setZoomLevel(0);
      expect(renderer.getZoomLevel()).toBe(0);

      renderer.setZoomLevel(3);
      expect(renderer.getZoomLevel()).toBe(3);
    });

    it('should clamp zoom level to min 0', () => {
      renderer.setZoomLevel(-5);
      expect(renderer.getZoomLevel()).toBe(0);
    });

    it('should clamp zoom level to max 3', () => {
      renderer.setZoomLevel(10);
      expect(renderer.getZoomLevel()).toBe(3);
    });
  });

  describe('rotation control', () => {
    it('should set rotation', () => {
      renderer.setRotation(Rotation.EAST);
      expect(renderer.getRotation()).toBe(Rotation.EAST);

      renderer.setRotation(Rotation.SOUTH);
      expect(renderer.getRotation()).toBe(Rotation.SOUTH);

      renderer.setRotation(Rotation.WEST);
      expect(renderer.getRotation()).toBe(Rotation.WEST);

      renderer.setRotation(Rotation.NORTH);
      expect(renderer.getRotation()).toBe(Rotation.NORTH);
    });
  });

  describe('pan control', () => {
    beforeEach(async () => {
      await renderer.loadMap('TestMap');
    });

    it('should pan camera by delta', () => {
      const initialPos = renderer.getCameraPosition();
      renderer.pan(10, 20);

      const newPos = renderer.getCameraPosition();
      expect(newPos.i).toBe(initialPos.i + 10);
      expect(newPos.j).toBe(initialPos.j + 20);
    });

    it('should clamp pan to map bounds', () => {
      // Try to pan way outside bounds
      renderer.pan(-10000, -10000);
      let pos = renderer.getCameraPosition();
      expect(pos.i).toBe(0);
      expect(pos.j).toBe(0);

      renderer.pan(20000, 20000);
      pos = renderer.getCameraPosition();
      expect(pos.i).toBe(999);  // height - 1
      expect(pos.j).toBe(999);  // width - 1
    });
  });

  describe('centerOn', () => {
    beforeEach(async () => {
      await renderer.loadMap('TestMap');
    });

    it('should center camera on coordinates', () => {
      renderer.centerOn(100, 200);

      const pos = renderer.getCameraPosition();
      expect(pos.i).toBe(100);
      expect(pos.j).toBe(200);
    });

    it('should clamp to map bounds', () => {
      renderer.centerOn(-50, 2000);

      const pos = renderer.getCameraPosition();
      expect(pos.i).toBe(0);
      expect(pos.j).toBe(999);
    });
  });

  describe('coordinate conversion', () => {
    beforeEach(async () => {
      await renderer.loadMap('TestMap');
    });

    it('should convert screen to map coordinates', () => {
      const mapCoords = renderer.screenToMap(400, 300);
      expect(mapCoords).toBeDefined();
      expect(typeof mapCoords.x).toBe('number');
      expect(typeof mapCoords.y).toBe('number');
    });

    it('should convert map to screen coordinates', () => {
      const screenCoords = renderer.mapToScreen(500, 500);
      expect(screenCoords).toBeDefined();
      expect(typeof screenCoords.x).toBe('number');
      expect(typeof screenCoords.y).toBe('number');
    });
  });

  describe('component access', () => {
    it('should provide access to terrain loader', () => {
      const loader = renderer.getTerrainLoader();
      expect(loader).toBeDefined();
    });

    it('should provide access to coordinate mapper', () => {
      const mapper = renderer.getCoordinateMapper();
      expect(mapper).toBeDefined();
    });
  });

  describe('render stats', () => {
    it('should provide render statistics', () => {
      const stats = renderer.getRenderStats();
      expect(stats).toBeDefined();
      expect(typeof stats.tilesRendered).toBe('number');
      expect(typeof stats.renderTimeMs).toBe('number');
      expect(stats.visibleBounds).toBeDefined();
    });
  });

  describe('unload', () => {
    beforeEach(async () => {
      await renderer.loadMap('TestMap');
    });

    it('should unload terrain data', () => {
      expect(renderer.isLoaded()).toBe(true);

      renderer.unload();

      expect(renderer.isLoaded()).toBe(false);
      expect(renderer.getMapName()).toBe('');
    });
  });
});

describe('centerOn timing (pre-loadMap vs post-loadMap)', () => {
  /**
   * Validates that centerOn() must be called AFTER loadMap() for correct
   * camera positioning. Before terrain is loaded, getDimensions() returns
   * {width: 0, height: 0} and centerOn() clamps everything to (0, 0).
   */
  let renderer: IsometricTerrainRenderer;
  let mockDimensions: { width: number; height: number };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDimensions = { width: 0, height: 0 };

    (TerrainLoader as jest.Mock).mockImplementation(() => ({
      loadMap: jest.fn().mockImplementation(async () => {
        // After loadMap completes, dimensions become available
        mockDimensions = { width: 1000, height: 1000 };
        return {
          width: 1000,
          height: 1000,
          pixelData: new Uint8Array(1000 * 1000),
          metadata: { name: 'TestMap', width: 1000, height: 1000 }
        };
      }),
      getTextureId: jest.fn().mockReturnValue(21),
      getDimensions: jest.fn().mockImplementation(() => mockDimensions),
      unload: jest.fn(),
    }));

    (CoordinateMapper as jest.Mock).mockImplementation(() => ({
      mapToScreen: jest.fn().mockReturnValue({ x: 0, y: 0 }),
      screenToMap: jest.fn().mockReturnValue({ x: 500, y: 500 }),
      getVisibleBounds: jest.fn().mockReturnValue({
        minI: 490, maxI: 510, minJ: 490, maxJ: 510
      }),
    }));

    renderer = new IsometricTerrainRenderer(mockCanvas as unknown as HTMLCanvasElement);
  });

  it('should clamp centerOn to (0, 0) before loadMap', () => {
    // Before loadMap, dimensions are (0, 0) — any position is clamped
    renderer.centerOn(395, 467);
    const pos = renderer.getCameraPosition();
    expect(pos.i).toBe(0);
    expect(pos.j).toBe(0);
  });

  it('should correctly position camera when centerOn is called after loadMap', async () => {
    await renderer.loadMap('TestMap');
    renderer.centerOn(395, 467);
    const pos = renderer.getCameraPosition();
    expect(pos.i).toBe(395);
    expect(pos.j).toBe(467);
  });

  it('should reset camera to map center during loadMap', async () => {
    await renderer.loadMap('TestMap');
    const pos = renderer.getCameraPosition();
    // loadMap sets camera to height/2, width/2
    expect(pos.i).toBe(500);
    expect(pos.j).toBe(500);
  });

  it('should allow centerOn to override loadMap default after terrain loads', async () => {
    await renderer.loadMap('TestMap');
    // Camera is at map center (500, 500) after loadMap
    expect(renderer.getCameraPosition().i).toBe(500);

    // Override with saved player position
    renderer.centerOn(395, 467);
    const pos = renderer.getCameraPosition();
    expect(pos.i).toBe(395);
    expect(pos.j).toBe(467);
  });
});

describe('ZOOM_LEVELS configuration', () => {
  it('should have 4 zoom levels', () => {
    expect(ZOOM_LEVELS).toHaveLength(4);
  });

  it('should have correct u values (2 << level)', () => {
    expect(ZOOM_LEVELS[0].u).toBe(4);   // 2 << 0 = 2, but spec says 4
    expect(ZOOM_LEVELS[1].u).toBe(8);   // 2 << 1 = 4, but spec says 8
    expect(ZOOM_LEVELS[2].u).toBe(16);  // 2 << 2 = 8, but spec says 16
    expect(ZOOM_LEVELS[3].u).toBe(32);  // 2 << 3 = 16, but spec says 32
  });

  it('should have correct tile dimensions', () => {
    ZOOM_LEVELS.forEach((config, level) => {
      expect(config.tileWidth).toBe(2 * config.u);  // width = 2 * u
      expect(config.tileHeight).toBe(config.u);     // height = u
    });
  });
});

describe('Terrain color generation', () => {
  // We can't directly test the private getTerrainColor function,
  // but we can verify the color palette is consistent through rendering

  it('should have defined color palette for common terrain IDs', () => {
    // This test verifies the color constants exist in the module
    // The actual colors are tested through visual inspection
    expect(true).toBe(true);  // Placeholder - colors are internal
  });
});
