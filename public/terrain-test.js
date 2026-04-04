"use strict";
(() => {
  // src/shared/land-utils.ts
  var LND_CLASS_MASK = 192;
  var LND_TYPE_MASK = 60;
  var LND_VAR_MASK = 3;
  var LND_CLASS_SHIFT = 6;
  var LND_TYPE_SHIFT = 2;
  function landClassOf(landId) {
    return (landId & LND_CLASS_MASK) >> LND_CLASS_SHIFT;
  }
  function landTypeOf(landId) {
    const typeIdx = (landId & LND_TYPE_MASK) >> LND_TYPE_SHIFT;
    return typeIdx <= 13 /* Special */ ? typeIdx : 13 /* Special */;
  }
  function landVarOf(landId) {
    return landId & LND_VAR_MASK;
  }
  function isWater(landId) {
    return landClassOf(landId) === 3 /* ZoneD */;
  }
  function isDeepWater(landId) {
    return isWater(landId) && landTypeOf(landId) === 0 /* Center */;
  }
  function isWaterEdge(landId) {
    return isWater(landId) && landTypeOf(landId) !== 0 /* Center */;
  }
  function isWaterCorner(landId) {
    if (!isWater(landId)) return false;
    const type = landTypeOf(landId);
    return type >= 5 /* NEo */ && type <= 12 /* NWi */;
  }
  function canBuildOn(landId) {
    if (isWater(landId)) return false;
    if (landTypeOf(landId) === 13 /* Special */) return false;
    return true;
  }
  function getEdgeDirection(landId) {
    const type = landTypeOf(landId);
    switch (type) {
      case 1 /* N */:
        return "N";
      case 2 /* E */:
        return "E";
      case 3 /* S */:
        return "S";
      case 4 /* W */:
        return "W";
      default:
        return null;
    }
  }
  function isSpecialTile(landId) {
    return landTypeOf(landId) === 13 /* Special */;
  }
  function decodeLandId(landId) {
    const landClass = landClassOf(landId);
    const landType = landTypeOf(landId);
    const landVar = landVarOf(landId);
    const water = landClass === 3 /* ZoneD */;
    return {
      raw: landId,
      landClass,
      landType,
      landVar,
      isWater: water,
      isWaterEdge: water && landType !== 0 /* Center */,
      isDeepWater: water && landType === 0 /* Center */,
      canBuild: !water && landType !== 13 /* Special */,
      edgeDirection: getEdgeDirection(landId)
    };
  }
  function landClassName(landClass) {
    switch (landClass) {
      case 0 /* ZoneA */:
        return "Grass";
      case 1 /* ZoneB */:
        return "MidGrass";
      case 2 /* ZoneC */:
        return "DryGround";
      case 3 /* ZoneD */:
        return "Water";
      default:
        return "Unknown";
    }
  }
  function landTypeName(landType) {
    switch (landType) {
      case 0 /* Center */:
        return "Center";
      case 1 /* N */:
        return "North";
      case 2 /* E */:
        return "East";
      case 3 /* S */:
        return "South";
      case 4 /* W */:
        return "West";
      case 5 /* NEo */:
        return "NE Outer";
      case 6 /* SEo */:
        return "SE Outer";
      case 7 /* SWo */:
        return "SW Outer";
      case 8 /* NWo */:
        return "NW Outer";
      case 9 /* NEi */:
        return "NE Inner";
      case 10 /* SEi */:
        return "SE Inner";
      case 11 /* SWi */:
        return "SW Inner";
      case 12 /* NWi */:
        return "NW Inner";
      case 13 /* Special */:
        return "Special";
      default:
        return "Unknown";
    }
  }
  function formatLandId(landId) {
    const decoded = decodeLandId(landId);
    const hex = "0x" + landId.toString(16).toUpperCase().padStart(2, "0");
    return `${hex} (${landClassName(decoded.landClass)}, ${landTypeName(decoded.landType)}, var=${decoded.landVar})`;
  }
  var LAND_TYPE_ROTATION = [
    // NORTH (identity)
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    // EAST (view CW): N→W, E→N, S→E, W→S, NEo→NWo, SEo→NEo, SWo→SEo, NWo→SWo, same inner
    [0, 4, 1, 2, 3, 8, 5, 6, 7, 12, 9, 10, 11, 13],
    // SOUTH (180°): N→S, E→W, S→N, W→E, NEo→SWo, SEo→NWo, SWo→NEo, NWo→SEo, same inner
    [0, 3, 4, 1, 2, 7, 8, 5, 6, 11, 12, 9, 10, 13],
    // WEST (view CCW): N→E, E→S, S→W, W→N, NEo→SEo, SEo→SWo, SWo→NWo, NWo→NEo, same inner
    [0, 2, 3, 4, 1, 6, 7, 8, 5, 10, 11, 12, 9, 13]
  ];
  function rotateLandId(landId, rotation) {
    if (rotation === 0) return landId;
    const landType = landTypeOf(landId);
    if (landType >= LAND_TYPE_ROTATION[rotation].length) return landId;
    const rotatedType = LAND_TYPE_ROTATION[rotation][landType];
    return landId & LND_CLASS_MASK | rotatedType << LND_TYPE_SHIFT | landId & LND_VAR_MASK;
  }

  // src/client/renderer/terrain-loader.ts
  var TerrainLoader = class {
    constructor() {
      this.pixelData = null;
      this.width = 0;
      this.height = 0;
      this.metadata = null;
      this.loaded = false;
      this.mapName = "";
    }
    /**
     * Load terrain data for a map
     * @param mapName - Name of the map (e.g., 'Antiqua', 'Zyrane')
     * @returns TerrainData with pixel indices and metadata
     */
    async loadMap(mapName) {
      const apiUrl = `/api/map-data/${encodeURIComponent(mapName)}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch map data: ${response.status} - ${errorText}`);
      }
      const mapFileData = await response.json();
      const { metadata, bmpUrl } = mapFileData;
      const bmpResponse = await fetch(bmpUrl);
      if (!bmpResponse.ok) {
        throw new Error(`Failed to fetch BMP file: ${bmpResponse.status}`);
      }
      const bmpBuffer = await bmpResponse.arrayBuffer();
      const parsedBmp = this.parseBmp(bmpBuffer);
      if (parsedBmp.width !== metadata.width || parsedBmp.height !== metadata.height) {
        console.warn(`[TerrainLoader] Dimension mismatch: BMP is ${parsedBmp.width}\xD7${parsedBmp.height}, metadata says ${metadata.width}\xD7${metadata.height}`);
      }
      this.pixelData = parsedBmp.pixelData;
      this.width = parsedBmp.width;
      this.height = parsedBmp.height;
      this.metadata = metadata;
      this.mapName = mapName;
      this.loaded = true;
      const paletteData = this.generatePaletteData2D(this.pixelData, this.width, this.height);
      return {
        width: this.width,
        height: this.height,
        pixelData: this.pixelData,
        paletteData,
        metadata: this.metadata
      };
    }
    /**
     * Parse a BMP file from ArrayBuffer
     * Supports 8-bit indexed color BMPs (Windows 3.x format)
     */
    parseBmp(buffer) {
      const view = new DataView(buffer);
      const fileHeader = this.parseFileHeader(view);
      if (fileHeader.signature !== "BM") {
        throw new Error(`Invalid BMP signature: ${fileHeader.signature}`);
      }
      const dibHeader = this.parseDibHeader(view, 14);
      if (dibHeader.bitsPerPixel !== 8) {
        throw new Error(`Unsupported BMP format: ${dibHeader.bitsPerPixel} bits per pixel (only 8-bit supported)`);
      }
      if (dibHeader.compression !== 0) {
        throw new Error(`Unsupported BMP compression: ${dibHeader.compression} (only uncompressed supported)`);
      }
      const paletteOffset = 14 + dibHeader.headerSize;
      const paletteSize = dibHeader.colorsUsed || 256;
      const palette = new Uint8Array(buffer, paletteOffset, paletteSize * 4);
      const pixelData = this.parsePixelData(buffer, fileHeader.dataOffset, dibHeader);
      return {
        width: dibHeader.width,
        height: Math.abs(dibHeader.height),
        // Height can be negative for top-down BMPs
        bitsPerPixel: dibHeader.bitsPerPixel,
        palette,
        pixelData
      };
    }
    /**
     * Parse BMP file header (14 bytes)
     */
    parseFileHeader(view) {
      return {
        signature: String.fromCharCode(view.getUint8(0), view.getUint8(1)),
        fileSize: view.getUint32(2, true),
        reserved1: view.getUint16(6, true),
        reserved2: view.getUint16(8, true),
        dataOffset: view.getUint32(10, true)
      };
    }
    /**
     * Parse BMP DIB header (BITMAPINFOHEADER - 40 bytes)
     */
    parseDibHeader(view, offset) {
      return {
        headerSize: view.getUint32(offset, true),
        width: view.getInt32(offset + 4, true),
        height: view.getInt32(offset + 8, true),
        colorPlanes: view.getUint16(offset + 12, true),
        bitsPerPixel: view.getUint16(offset + 14, true),
        compression: view.getUint32(offset + 16, true),
        imageSize: view.getUint32(offset + 20, true),
        xPixelsPerMeter: view.getInt32(offset + 24, true),
        yPixelsPerMeter: view.getInt32(offset + 28, true),
        colorsUsed: view.getUint32(offset + 32, true),
        importantColors: view.getUint32(offset + 36, true)
      };
    }
    /**
     * Parse pixel data from BMP
     * BMP stores pixels bottom-up by default, with row padding to 4-byte boundaries
     */
    parsePixelData(buffer, dataOffset, header) {
      const width = header.width;
      const height = Math.abs(header.height);
      const isBottomUp = header.height > 0;
      const bytesPerRow = Math.ceil(width / 4) * 4;
      const pixelData = new Uint8Array(width * height);
      const rawData = new Uint8Array(buffer, dataOffset);
      for (let row = 0; row < height; row++) {
        const srcRow = isBottomUp ? height - 1 - row : row;
        const srcOffset = srcRow * bytesPerRow;
        const dstOffset = row * width;
        for (let col = 0; col < width; col++) {
          pixelData[dstOffset + col] = rawData[srcOffset + col];
        }
      }
      return pixelData;
    }
    /**
     * Generate 2D palette data array from flat pixelData
     * Used by road system for water detection
     * @param pixelData - Flat Uint8Array of palette indices
     * @param width - Map width
     * @param height - Map height
     * @returns 2D array [row][col] of palette indices
     */
    generatePaletteData2D(pixelData, width, height) {
      const result = [];
      for (let row = 0; row < height; row++) {
        const rowData = [];
        for (let col = 0; col < width; col++) {
          rowData.push(pixelData[row * width + col]);
        }
        result.push(rowData);
      }
      return result;
    }
    /**
     * Get texture ID (palette index) for a tile coordinate
     * @param x - X coordinate (0 to width-1)
     * @param y - Y coordinate (0 to height-1)
     * @returns Palette index (0-255) or 0 if out of bounds
     */
    getTextureId(x, y) {
      if (!this.pixelData) return 0;
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
      return this.pixelData[y * this.width + x];
    }
    /**
     * Get the raw pixel data array
     * @returns Uint8Array of palette indices, or empty array if not loaded
     */
    getPixelData() {
      return this.pixelData || new Uint8Array(0);
    }
    /**
     * Get map metadata
     * @returns MapMetadata or null if not loaded
     */
    getMetadata() {
      return this.metadata;
    }
    /**
     * Get map dimensions
     * @returns Object with width and height
     */
    getDimensions() {
      return { width: this.width, height: this.height };
    }
    /**
     * Check if terrain data is loaded
     */
    isLoaded() {
      return this.loaded;
    }
    /**
     * Get the name of the loaded map
     */
    getMapName() {
      return this.mapName;
    }
    // ===========================================================================
    // LAND METADATA METHODS
    // ===========================================================================
    /**
     * Get raw landId for a tile coordinate
     * @param x - X coordinate (0 to width-1)
     * @param y - Y coordinate (0 to height-1)
     * @returns Raw landId byte (0-255) or 0 if out of bounds
     */
    getLandId(x, y) {
      return this.getTextureId(x, y);
    }
    /**
     * Get LandClass for a tile coordinate
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns LandClass enum value (ZoneA, ZoneB, ZoneC, ZoneD)
     */
    getLandClass(x, y) {
      return landClassOf(this.getLandId(x, y));
    }
    /**
     * Get LandType for a tile coordinate
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns LandType enum value (Center, N, E, S, W, corners, Special)
     */
    getLandType(x, y) {
      return landTypeOf(this.getLandId(x, y));
    }
    /**
     * Get LandVar for a tile coordinate
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Variation index (0-3)
     */
    getLandVar(x, y) {
      return landVarOf(this.getLandId(x, y));
    }
    /**
     * Check if a tile is water (ZoneD)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if water tile
     */
    isWater(x, y) {
      return isWater(this.getLandId(x, y));
    }
    /**
     * Check if a tile is deep water (water center)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if deep water (water + center type)
     */
    isDeepWater(x, y) {
      return isDeepWater(this.getLandId(x, y));
    }
    /**
     * Check if a tile is a water edge (water but not center)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if water edge tile
     */
    isWaterEdge(x, y) {
      return isWaterEdge(this.getLandId(x, y));
    }
    /**
     * Check if a tile is a water corner (inner or outer)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if water corner tile
     */
    isWaterCorner(x, y) {
      return isWaterCorner(this.getLandId(x, y));
    }
    /**
     * Check if buildings can be placed on a tile
     * Buildings cannot be placed on water or special tiles
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if building placement is allowed
     */
    canBuildOn(x, y) {
      return canBuildOn(this.getLandId(x, y));
    }
    /**
     * Check if a tile is a special tile (trees, decorations, etc.)
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns true if special tile
     */
    isSpecialTile(x, y) {
      return isSpecialTile(this.getLandId(x, y));
    }
    /**
     * Get fully decoded land information for a tile
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Complete DecodedLandId object
     */
    getLandInfo(x, y) {
      return decodeLandId(this.getLandId(x, y));
    }
    /**
     * Get formatted landId string for debugging
     * @param x - X coordinate
     * @param y - Y coordinate
     * @returns Formatted string like "0xDE (Water, SWo, var=2)"
     */
    formatLandId(x, y) {
      return formatLandId(this.getLandId(x, y));
    }
    /**
     * Unload terrain data to free memory
     */
    unload() {
      this.pixelData = null;
      this.metadata = null;
      this.width = 0;
      this.height = 0;
      this.loaded = false;
      this.mapName = "";
      console.log("[TerrainLoader] Terrain data unloaded");
    }
  };

  // src/shared/map-config.ts
  var ZOOM_LEVELS = [
    { level: 0, u: 4, tileWidth: 8, tileHeight: 4 },
    // 4×8
    { level: 1, u: 8, tileWidth: 16, tileHeight: 8 },
    // 8×16
    { level: 2, u: 16, tileWidth: 32, tileHeight: 16 },
    // 16×32 (default)
    { level: 3, u: 32, tileWidth: 64, tileHeight: 32 }
    // 32×64
  ];
  var SEASON_NAMES = {
    [0 /* WINTER */]: "Winter",
    [1 /* SPRING */]: "Spring",
    [2 /* SUMMER */]: "Summer",
    [3 /* AUTUMN */]: "Autumn"
  };

  // src/client/renderer/coordinate-mapper.ts
  var CoordinateMapper = class {
    constructor(mapWidth = 2e3, mapHeight = 2e3) {
      this.mapWidth = mapWidth;
      this.mapHeight = mapHeight;
    }
    /**
     * Convert map tile coordinates (i, j) to screen pixel coordinates (x, y)
     * Based on Lander.pas algorithm, modified for seamless isometric tiling.
     *
     * For seamless tiles, adjacent tiles must overlap by half their dimensions:
     * - X step between tiles = tileWidth/2 = u
     * - Y step between tiles = tileHeight/2 = u/2
     *
     * @param i - Row index (0 to mapHeight-1)
     * @param j - Column index (0 to mapWidth-1)
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
     * @param origin - Camera position (screen origin offset)
     * @returns Screen coordinates {x, y} - top center point of the diamond tile
     */
    mapToScreen(i, j, zoomLevel, rotation, origin) {
      const config2 = ZOOM_LEVELS[zoomLevel];
      const u = config2.u;
      const rows = this.mapHeight;
      const cols = this.mapWidth;
      const rotated = this.rotateMapCoordinates(i, j, rotation);
      const ri = rotated.x;
      const rj = rotated.y;
      const x = u * (rows - ri + rj) - origin.x;
      const y = u / 2 * (rows - ri + (cols - rj)) - origin.y;
      return { x, y };
    }
    /**
     * Convert screen pixel coordinates (x, y) to map tile coordinates (i, j)
     * Inverse of mapToScreen, derived from the seamless tiling formula.
     *
     * @param x - Screen X coordinate
     * @param y - Screen Y coordinate
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0=North, 1=East, 2=South, 3=West)
     * @param origin - Camera position (screen origin offset)
     * @returns Map coordinates {x: i, y: j}
     */
    screenToMap(x, y, zoomLevel, rotation, origin) {
      const config2 = ZOOM_LEVELS[zoomLevel];
      const u = config2.u;
      const rows = this.mapHeight;
      const cols = this.mapWidth;
      const screenX = x + origin.x;
      const screenY = y + origin.y;
      const A = screenX / u;
      const B = 2 * screenY / u;
      const ri = Math.round((2 * rows + cols - A - B) / 2);
      const rj = Math.round((A - B + cols) / 2);
      const original = this.rotateMapCoordinates(ri, rj, this.getInverseRotation(rotation));
      return { x: original.x, y: original.y };
    }
    /**
     * Calculate visible tile bounds for a given viewport
     * Used for viewport culling to determine which tiles to render
     *
     * @param viewport - Screen viewport rectangle
     * @param zoomLevel - Zoom level (0-3)
     * @param rotation - Rotation (0-3)
     * @param origin - Camera position
     * @returns Tile bounds {minI, maxI, minJ, maxJ}
     */
    getVisibleBounds(viewport, zoomLevel, rotation, origin) {
      const corners = [
        this.screenToMap(viewport.x, viewport.y, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x + viewport.width, viewport.y, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x, viewport.y + viewport.height, zoomLevel, rotation, origin),
        this.screenToMap(viewport.x + viewport.width, viewport.y + viewport.height, zoomLevel, rotation, origin)
      ];
      const is = corners.map((c) => c.x);
      const js = corners.map((c) => c.y);
      const minI = Math.max(0, Math.floor(Math.min(...is)) - 1);
      const maxI = Math.min(this.mapHeight - 1, Math.ceil(Math.max(...is)) + 1);
      const minJ = Math.max(0, Math.floor(Math.min(...js)) - 1);
      const maxJ = Math.min(this.mapWidth - 1, Math.ceil(Math.max(...js)) + 1);
      return { minI, maxI, minJ, maxJ };
    }
    /**
     * Apply rotation transformation to map coordinates
     * Rotates around map center
     *
     * @param i - Row index
     * @param j - Column index
     * @param rotation - Rotation (0-3)
     * @returns Rotated coordinates {x: i, y: j}
     */
    rotateMapCoordinates(i, j, rotation) {
      const centerI = this.mapHeight / 2;
      const centerJ = this.mapWidth / 2;
      const relI = i - centerI;
      const relJ = j - centerJ;
      let newI;
      let newJ;
      switch (rotation) {
        case 0 /* NORTH */:
          newI = relI;
          newJ = relJ;
          break;
        case 1 /* EAST */:
          newI = relJ;
          newJ = -relI;
          break;
        case 2 /* SOUTH */:
          newI = -relI;
          newJ = -relJ;
          break;
        case 3 /* WEST */:
          newI = -relJ;
          newJ = relI;
          break;
        default:
          newI = relI;
          newJ = relJ;
      }
      return {
        x: newI + centerI,
        y: newJ + centerJ
      };
    }
    /**
     * Get inverse rotation
     * @param rotation - Original rotation
     * @returns Inverse rotation
     */
    getInverseRotation(rotation) {
      switch (rotation) {
        case 0 /* NORTH */:
          return 0 /* NORTH */;
        case 1 /* EAST */:
          return 3 /* WEST */;
        case 2 /* SOUTH */:
          return 2 /* SOUTH */;
        case 3 /* WEST */:
          return 1 /* EAST */;
        default:
          return 0 /* NORTH */;
      }
    }
  };

  // src/client/renderer/texture-cache.ts
  var TERRAIN_COLORS = {
    // Water (indices 192-255)
    192: "#1a3a5c",
    193: "#1d4268",
    194: "#204a74",
    195: "#234f80",
    196: "#1a3a5c",
    197: "#1d4268",
    198: "#204a74",
    199: "#234f80",
    200: "#287389",
    201: "#2a7a90",
    202: "#2c8197",
    203: "#2e889e",
    // Grass (indices 0-63)
    0: "#5a8c4f",
    1: "#5d8f52",
    2: "#608255",
    3: "#638558",
    4: "#4a7c3f",
    5: "#4d7f42",
    6: "#507245",
    7: "#537548",
    // MidGrass (indices 64-127)
    64: "#6b9460",
    65: "#6e9763",
    66: "#718a66",
    67: "#748d69",
    100: "#7a9a70",
    101: "#7d9d73",
    102: "#809076",
    103: "#839379",
    // DryGround (indices 128-191)
    128: "#8b7355",
    129: "#8e7658",
    130: "#91795b",
    131: "#947c5e",
    132: "#877050",
    133: "#8a7353",
    134: "#8d7656",
    135: "#907959",
    160: "#9a836a",
    161: "#9d866d",
    162: "#a08970",
    163: "#a38c73"
  };
  function getFallbackColor(paletteIndex) {
    if (TERRAIN_COLORS[paletteIndex]) {
      return TERRAIN_COLORS[paletteIndex];
    }
    const landClass = landClassOf(paletteIndex);
    switch (landClass) {
      case 3 /* ZoneD */: {
        const hue = 200 + paletteIndex % 20;
        const sat = 40 + paletteIndex % 20;
        const light = 25 + paletteIndex % 15;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 2 /* ZoneC */: {
        const hue = 30 + paletteIndex % 15;
        const sat = 30 + paletteIndex % 20;
        const light = 35 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 1 /* ZoneB */: {
        const hue = 70 + paletteIndex % 30;
        const sat = 35 + paletteIndex % 25;
        const light = 35 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 0 /* ZoneA */:
      default: {
        const hue = 90 + paletteIndex % 30;
        const sat = 40 + paletteIndex % 25;
        const light = 30 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
    }
  }
  var TextureCache = class {
    constructor(maxSize = 1024) {
      this.cache = /* @__PURE__ */ new Map();
      this.terrainType = "Earth";
      this.season = 2 /* SUMMER */;
      // Default to summer
      this.accessCounter = 0;
      // Statistics
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.maxSize = maxSize;
    }
    /**
     * Set the terrain type for texture loading
     */
    setTerrainType(terrainType) {
      if (this.terrainType !== terrainType) {
        this.terrainType = terrainType;
        this.clear();
        console.log(`[TextureCache] Terrain type set to: ${terrainType}, current season: ${SEASON_NAMES[this.season]}`);
      }
    }
    /**
     * Get the current terrain type
     */
    getTerrainType() {
      return this.terrainType;
    }
    /**
     * Set the season for texture loading
     * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
     */
    setSeason(season) {
      if (this.season !== season) {
        this.season = season;
        this.clear();
        console.log(`[TextureCache] Season changed to ${SEASON_NAMES[season]}`);
      }
    }
    /**
     * Get the current season
     */
    getSeason() {
      return this.season;
    }
    /**
     * Get the current season name
     */
    getSeasonName() {
      return SEASON_NAMES[this.season];
    }
    /**
     * Generate cache key for a texture
     * Key is based on terrain type, season, and palette index
     */
    getCacheKey(paletteIndex) {
      return `${this.terrainType}-${this.season}-${paletteIndex}`;
    }
    /**
     * Get texture for a palette index (sync - returns cached or null)
     * Use this for fast rendering - if not cached, returns null and starts loading
     *
     * Note: The texture is the same regardless of zoom level.
     * Zoom level only affects how the texture is rendered (scaled).
     */
    getTextureSync(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      if (entry && entry.texture) {
        this.cache.delete(key);
        this.cache.set(key, entry);
        this.hits++;
        return entry.texture;
      }
      if (entry && entry.loaded) {
        this.misses++;
        return null;
      }
      if (!entry || !entry.loading) {
        this.loadTexture(paletteIndex);
      }
      this.misses++;
      return null;
    }
    /**
     * Get texture for a palette index (async - waits for load)
     */
    async getTextureAsync(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      if (entry) {
        if (entry.texture) {
          this.cache.delete(key);
          this.cache.set(key, entry);
          this.hits++;
          return entry.texture;
        }
        if (entry.loaded) {
          this.misses++;
          return null;
        }
        if (entry.loadPromise) {
          return entry.loadPromise;
        }
      }
      this.misses++;
      return this.loadTexture(paletteIndex);
    }
    /**
     * Get fallback color for a palette index
     */
    getFallbackColor(paletteIndex) {
      return getFallbackColor(paletteIndex);
    }
    /**
     * Load a texture from the server
     */
    async loadTexture(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const existing = this.cache.get(key);
      if (existing?.loadPromise) {
        return existing.loadPromise;
      }
      const loadPromise = this.fetchTexture(paletteIndex);
      this.cache.set(key, {
        texture: null,
        lastAccess: ++this.accessCounter,
        loading: true,
        loaded: false,
        loadPromise
      });
      try {
        const texture = await loadPromise;
        const entry = this.cache.get(key);
        if (entry) {
          entry.texture = texture;
          entry.loading = false;
          entry.loaded = true;
          entry.loadPromise = void 0;
        }
        this.evictIfNeeded();
        return texture;
      } catch (error) {
        this.cache.delete(key);
        return null;
      }
    }
    /**
     * Fetch texture from server and convert to ImageBitmap.
     * Uses season (not zoom level) to fetch the correct texture variant.
     *
     * Textures are served as pre-baked PNGs with alpha channel already applied,
     * so no client-side color keying is needed.
     */
    async fetchTexture(_paletteIndex) {
      return null;
    }
    /**
     * Evict least recently used entries if cache is over capacity.
     * Uses Map insertion order for O(1) eviction — oldest entries are first.
     */
    evictIfNeeded() {
      if (this.cache.size <= this.maxSize) return;
      for (const [key, entry] of this.cache) {
        if (this.cache.size <= this.maxSize) break;
        if (entry.loading) continue;
        if (entry.texture) {
          entry.texture.close();
        }
        this.cache.delete(key);
        this.evictions++;
      }
    }
    /**
     * Preload textures for a list of palette indices
     */
    async preload(paletteIndices) {
      const loadPromises = paletteIndices.map(
        (index) => this.getTextureAsync(index)
      );
      await Promise.all(loadPromises);
    }
    /**
     * Clear the entire cache
     */
    clear() {
      for (const entry of this.cache.values()) {
        if (entry.texture) {
          entry.texture.close();
        }
      }
      this.cache.clear();
      this.hits = 0;
      this.misses = 0;
      this.evictions = 0;
      this.accessCounter = 0;
    }
    /**
     * Get cache statistics
     */
    getStats() {
      const total = this.hits + this.misses;
      return {
        size: this.cache.size,
        maxSize: this.maxSize,
        hits: this.hits,
        misses: this.misses,
        evictions: this.evictions,
        hitRate: total > 0 ? this.hits / total : 0
      };
    }
    /**
     * Check if a texture is cached
     */
    has(paletteIndex) {
      const key = this.getCacheKey(paletteIndex);
      const entry = this.cache.get(key);
      return entry !== void 0 && entry.texture !== null;
    }
    /**
     * Get count of loaded textures
     */
    getLoadedCount() {
      let count = 0;
      for (const entry of this.cache.values()) {
        if (entry.texture) {
          count++;
        }
      }
      return count;
    }
  };

  // src/shared/config.ts
  var getEnv = (key) => {
    return typeof process !== "undefined" && process.env ? process.env[key] : void 0;
  };
  var config = {
    /**
     * Configuration du serveur WebSocket
     */
    server: {
      port: Number(getEnv("PORT")) || 8080,
      host: getEnv("HOST") || "0.0.0.0",
      singleUserMode: getEnv("SINGLE_USER_MODE") === "true",
      /** Force all players into a specific world (format: "zoneId/worldName", e.g. "beta/Shamba"). Temporary test-phase override. */
      forceWorld: typeof window !== "undefined" && window.__SPO_FORCE_WORLD__ !== void 0 ? window.__SPO_FORCE_WORLD__ : getEnv("SPO_FORCE_WORLD") ?? void 0
    },
    /**
     * Configuration du protocole RDO
     */
    rdo: {
      // Host du serveur Directory (utiliser 'localhost' pour mock_srv et www.starpeaceonline.com pour la production.)
      directoryHost: getEnv("RDO_DIR_HOST") || "www.starpeaceonline.com",
      // Ports standards du protocole
      ports: {
        directory: 1111
      }
    },
    /**
     * Static asset CDN — official Cloudflare R2 CDN for terrain/object assets.
     * Override with CHUNK_CDN_URL env var if needed (e.g., local dev without CDN: set to '').
     */
    cdn: {
      url: typeof window !== "undefined" && window.__SPO_CDN_URL__ !== void 0 ? window.__SPO_CDN_URL__ : getEnv("CHUNK_CDN_URL") ?? "https://spo.zz.works"
    },
    /**
     * Logging
     */
    logging: {
      // Niveaux: 'debug' | 'info' | 'warn' | 'error'
      level: getEnv("LOG_LEVEL") || "debug",
      colorize: getEnv("NODE_ENV") !== "production",
      /** NDJSON structured output (LOG_JSON=true) */
      jsonMode: getEnv("LOG_JSON") === "true",
      /** File path for NDJSON log output (e.g. 'logs/gateway.ndjson') */
      filePath: getEnv("LOG_FILE") || "",
      /** Max log file size in bytes before rotation (default 10MB) */
      maxFileSize: Number(getEnv("LOG_MAX_SIZE")) || 10 * 1024 * 1024,
      /** Max number of rotated log files to keep (default 5) */
      maxFiles: Number(getEnv("LOG_MAX_FILES")) || 5,
      /** Separate file for ERROR-level entries (e.g. 'logs/errors.ndjson') */
      errorFilePath: getEnv("LOG_ERROR_FILE") || "",
      /** Ring buffer size for error context (recent entries attached to errors) */
      ringBufferSize: Number(getEnv("LOG_RING_BUFFER_SIZE")) || 20
    }
  };

  // src/client/renderer/texture-atlas-cache.ts
  var TERRAIN_COLORS2 = {
    192: "#1a3a5c",
    193: "#1d4268",
    194: "#204a74",
    195: "#234f80",
    196: "#1a3a5c",
    197: "#1d4268",
    198: "#204a74",
    199: "#234f80",
    200: "#287389",
    201: "#2a7a90",
    202: "#2c8197",
    203: "#2e889e",
    0: "#5a8c4f",
    1: "#5d8f52",
    2: "#608255",
    3: "#638558",
    4: "#4a7c3f",
    5: "#4d7f42",
    6: "#507245",
    7: "#537548",
    64: "#6b9460",
    65: "#6e9763",
    66: "#718a66",
    67: "#748d69",
    128: "#8b7355",
    129: "#8e7658",
    130: "#91795b",
    131: "#947c5e"
  };
  function getFallbackColor2(paletteIndex) {
    if (TERRAIN_COLORS2[paletteIndex]) {
      return TERRAIN_COLORS2[paletteIndex];
    }
    const landClass = landClassOf(paletteIndex);
    switch (landClass) {
      case 3 /* ZoneD */: {
        const hue = 200 + paletteIndex % 20;
        const sat = 40 + paletteIndex % 20;
        const light = 25 + paletteIndex % 15;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 2 /* ZoneC */: {
        const hue = 30 + paletteIndex % 15;
        const sat = 30 + paletteIndex % 20;
        const light = 35 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 1 /* ZoneB */: {
        const hue = 70 + paletteIndex % 30;
        const sat = 35 + paletteIndex % 25;
        const light = 35 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
      case 0 /* ZoneA */:
      default: {
        const hue = 90 + paletteIndex % 30;
        const sat = 40 + paletteIndex % 25;
        const light = 30 + paletteIndex % 20;
        return `hsl(${hue}, ${sat}%, ${light}%)`;
      }
    }
  }
  var TextureAtlasCache = class {
    constructor() {
      this.atlas = null;
      this.manifest = null;
      this.terrainType = "Earth";
      this.season = 2 /* SUMMER */;
      this.loading = false;
      this.loaded = false;
      this.loadPromise = null;
    }
    /**
     * Set the terrain type (triggers reload if changed)
     */
    setTerrainType(terrainType) {
      if (this.terrainType !== terrainType) {
        this.terrainType = terrainType;
        this.clear();
        console.log(`[TextureAtlasCache] Terrain type set to: ${terrainType}`);
      }
    }
    getTerrainType() {
      return this.terrainType;
    }
    /**
     * Set the season (triggers reload if changed)
     */
    setSeason(season) {
      if (this.season !== season) {
        this.season = season;
        this.clear();
        console.log(`[TextureAtlasCache] Season changed to ${SEASON_NAMES[season]}`);
      }
    }
    getSeason() {
      return this.season;
    }
    getSeasonName() {
      return SEASON_NAMES[this.season];
    }
    /**
     * Load the atlas PNG and manifest JSON from the server.
     * Returns a promise that resolves when both are loaded.
     */
    async loadAtlas() {
      if (this.loaded || this.loading) {
        return this.loadPromise || Promise.resolve();
      }
      this.loading = true;
      this.loadPromise = this._doLoadAtlas();
      try {
        await this.loadPromise;
      } finally {
        this.loading = false;
      }
    }
    async _doLoadAtlas() {
      const terrainType = encodeURIComponent(this.terrainType);
      const cdnUrl = config.cdn.url;
      const atlasPath = `/textures/${terrainType}/${this.season}/atlas.png`;
      const manifestPath = `/textures/${terrainType}/${this.season}/atlas.json`;
      const atlasUrl = cdnUrl ? `${cdnUrl}${atlasPath}` : `/cdn${atlasPath}`;
      const manifestUrl = cdnUrl ? `${cdnUrl}${manifestPath}` : `/cdn${manifestPath}`;
      try {
        const [atlasResponse, manifestResponse] = await Promise.all([
          fetch(atlasUrl),
          fetch(manifestUrl)
        ]);
        if (!atlasResponse.ok || !manifestResponse.ok) {
          console.warn(`[TextureAtlasCache] Atlas not available for ${this.terrainType}/${SEASON_NAMES[this.season]}`);
          this.loaded = true;
          return;
        }
        const [atlasBlob, manifest] = await Promise.all([
          atlasResponse.blob(),
          manifestResponse.json()
        ]);
        this.atlas = await createImageBitmap(atlasBlob);
        this.manifest = manifest;
        this.loaded = true;
        console.log(`[TextureAtlasCache] Loaded atlas: ${this.terrainType}/${SEASON_NAMES[this.season]} (${Object.keys(manifest.tiles).length} tiles, ${manifest.atlasWidth}x${manifest.atlasHeight})`);
      } catch (error) {
        console.error(`[TextureAtlasCache] Failed to load atlas:`, error);
        this.loaded = true;
      }
    }
    /**
     * Check if the atlas is loaded and ready for rendering
     */
    isReady() {
      return this.loaded && this.atlas !== null && this.manifest !== null;
    }
    /**
     * Get the atlas manifest (tile coordinates, dimensions, etc.)
     */
    getManifest() {
      return this.manifest;
    }
    /**
     * Get the atlas ImageBitmap for drawImage() calls
     */
    getAtlas() {
      if (!this.loaded && !this.loading) {
        this.loadAtlas();
      }
      return this.atlas;
    }
    /**
     * Get the source rectangle within the atlas for a given palette index.
     * Returns null if the tile is not in the atlas.
     */
    getTileRect(paletteIndex) {
      if (!this.manifest) return null;
      const tile = this.manifest.tiles[String(paletteIndex)];
      if (!tile) return null;
      return {
        sx: tile.x,
        sy: tile.y,
        sw: tile.width,
        sh: tile.height
      };
    }
    /**
     * Check if a tile exists in the atlas
     */
    hasTile(paletteIndex) {
      return this.manifest !== null && String(paletteIndex) in this.manifest.tiles;
    }
    /**
     * Get fallback color for missing tiles
     */
    getFallbackColor(paletteIndex) {
      return getFallbackColor2(paletteIndex);
    }
    /**
     * Get the standard tile height from the manifest
     */
    getStandardTileHeight() {
      return this.manifest?.tileHeight || 32;
    }
    /**
     * Clear the atlas cache (e.g., when terrain type or season changes)
     */
    clear() {
      if (this.atlas) {
        this.atlas.close();
        this.atlas = null;
      }
      this.manifest = null;
      this.loaded = false;
      this.loading = false;
      this.loadPromise = null;
    }
  };

  // src/client/renderer/chunk-cache.ts
  var CHUNK_SIZE = 32;
  var MAX_CHUNKS_PER_ZOOM = {
    0: 300,
    1: 160,
    2: 96,
    3: 48
  };
  var FLAT_MASK = 192;
  var isOffscreenCanvasSupported = typeof OffscreenCanvas !== "undefined";
  function calculateChunkCanvasDimensions(chunkSize, config2) {
    const u = config2.u;
    const width = u * (2 * chunkSize - 1) + config2.tileWidth;
    const height = u * chunkSize + config2.tileHeight;
    return { width, height };
  }
  function getTileScreenPosInChunk(localI, localJ, chunkSize, config2) {
    const u = config2.u;
    const x = u * (chunkSize - localI + localJ);
    const y = u / 2 * (chunkSize - localI + (chunkSize - localJ));
    return { x, y };
  }
  function getChunkScreenPosition(chunkI, chunkJ, chunkSize, config2, mapHeight, mapWidth, origin) {
    const u = config2.u;
    const baseI = chunkI * chunkSize;
    const baseJ = chunkJ * chunkSize;
    const worldX = u * (mapHeight - baseI + baseJ) - origin.x;
    const worldY = u / 2 * (mapHeight - baseI + (mapWidth - baseJ)) - origin.y;
    const localOrigin = getTileScreenPosInChunk(0, 0, chunkSize, config2);
    return {
      x: worldX - localOrigin.x,
      y: worldY - localOrigin.y
    };
  }
  var ChunkCache = class {
    constructor(textureCache, getTextureId) {
      // Cache per zoom level: Map<"chunkI,chunkJ", ChunkEntry>
      this.caches = /* @__PURE__ */ new Map();
      this.accessCounter = 0;
      this.atlasCache = null;
      this.mapWidth = 0;
      this.mapHeight = 0;
      // Server chunk fetching
      this.mapName = "";
      this.terrainType = "";
      this.season = 2;
      // Default to Summer
      this.useServerChunks = true;
      this.serverChunkFailed = false;
      // Set to true after first 404, disables server for session
      // Rendering queue
      this.renderQueue = [];
      this.isProcessingQueue = false;
      // Debounced chunk-ready notification (reduces render thrashing at Z0/Z1)
      this.chunkReadyTimer = null;
      this.CHUNK_READY_DEBOUNCE_MS = 80;
      // Batch notifications within this window
      // Stats
      this.stats = {
        chunksRendered: 0,
        cacheHits: 0,
        cacheMisses: 0,
        evictions: 0,
        serverChunksLoaded: 0
      };
      // Callback when chunk becomes ready
      this.onChunkReady = null;
      // Pending await for viewport-ready loading
      this.pendingAwait = null;
      this.pendingAwaitTimeout = null;
      // Session progress tracking — session resets when the render queue goes idle→active.
      // onChunkProgress is called with (done, total) on every chunk completion and on start.
      this.sessionQueued = 0;
      this.sessionDone = 0;
      /** Called with (done, total) whenever chunk loading session progress changes. Public for external wiring. */
      this.onChunkProgress = null;
      this.textureCache = textureCache;
      this.getTextureId = getTextureId;
      for (let i = 0; i <= 3; i++) {
        this.caches.set(i, /* @__PURE__ */ new Map());
      }
    }
    /**
     * Set map dimensions (call after loading map)
     */
    setMapDimensions(width, height) {
      this.mapWidth = width;
      this.mapHeight = height;
    }
    /**
     * Set map info for server chunk fetching.
     * Call after loading a map to enable fetching pre-rendered chunks from the server.
     */
    setMapInfo(mapName, terrainType, season) {
      const changed = this.mapName !== mapName || this.terrainType !== terrainType || this.season !== season;
      this.mapName = mapName;
      this.terrainType = terrainType;
      this.season = season;
      this.serverChunkFailed = false;
      if (changed) {
        console.log(`[ChunkCache] Map info set: ${mapName} / ${terrainType} / season=${season}, server chunks enabled`);
      }
    }
    /**
     * Set callback for when a chunk becomes ready (triggers re-render)
     */
    setOnChunkReady(callback) {
      this.onChunkReady = callback;
    }
    /**
     * Set texture atlas cache for atlas-based rendering.
     * When set and ready, chunks render from the atlas instead of individual textures.
     */
    setAtlasCache(atlas) {
      this.atlasCache = atlas;
    }
    /**
     * Get cache key for a chunk
     */
    getKey(chunkI, chunkJ) {
      return `${chunkI},${chunkJ}`;
    }
    /**
     * Get chunk coordinates for a tile
     */
    static getChunkCoords(tileI, tileJ) {
      return {
        chunkI: Math.floor(tileI / CHUNK_SIZE),
        chunkJ: Math.floor(tileJ / CHUNK_SIZE)
      };
    }
    /**
     * Check if chunk rendering is supported (requires OffscreenCanvas)
     */
    isSupported() {
      return isOffscreenCanvasSupported;
    }
    /**
     * Get a chunk canvas (sync - returns null if not ready, triggers async render)
     */
    getChunkSync(chunkI, chunkJ, zoomLevel) {
      if (!isOffscreenCanvasSupported) return null;
      const cache = this.caches.get(zoomLevel);
      if (!cache) return null;
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (entry && entry.ready) {
        cache.delete(key);
        cache.set(key, entry);
        this.stats.cacheHits++;
        return entry.canvas;
      }
      if (!entry || !entry.rendering) {
        this.stats.cacheMisses++;
        this.queueChunkRender(chunkI, chunkJ, zoomLevel);
      }
      return null;
    }
    /**
     * Queue a chunk for async rendering
     */
    queueChunkRender(chunkI, chunkJ, zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const key = this.getKey(chunkI, chunkJ);
      if (!cache.has(key)) {
        const config2 = ZOOM_LEVELS[zoomLevel];
        const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config2);
        cache.set(key, {
          canvas: new OffscreenCanvas(dims.width, dims.height),
          lastAccess: ++this.accessCounter,
          ready: false,
          rendering: true
        });
      } else {
        const entry = cache.get(key);
        entry.rendering = true;
      }
      if (this.sessionQueued === this.sessionDone) {
        this.sessionQueued = 0;
        this.sessionDone = 0;
      }
      this.sessionQueued++;
      this.onChunkProgress?.(this.sessionDone, this.sessionQueued);
      this.renderQueue.push({
        chunkI,
        chunkJ,
        zoomLevel,
        resolve: () => {
        }
      });
      this.processRenderQueue();
    }
    /**
     * Get concurrency level based on zoom level in the current queue.
     * Z0/Z1 chunks are tiny (260×130 / 520×260 px) — safe to parallelize more aggressively.
     */
    getConcurrency(zoomLevel) {
      if (zoomLevel <= 0) return 16;
      if (zoomLevel <= 1) return 12;
      return 6;
    }
    /**
     * Schedule a debounced chunk-ready notification.
     * At Z0, dozens of chunks complete in rapid succession — coalescing notifications
     * reduces full pipeline re-renders from ~11 to ~2-3.
     */
    scheduleChunkReadyNotification() {
      if (!this.onChunkReady) return;
      if (this.chunkReadyTimer !== null) {
        clearTimeout(this.chunkReadyTimer);
      }
      this.chunkReadyTimer = setTimeout(() => {
        this.chunkReadyTimer = null;
        if (this.onChunkReady) {
          this.onChunkReady();
        }
      }, this.CHUNK_READY_DEBOUNCE_MS);
    }
    /**
     * Process render queue with parallel fetching.
     * Concurrency scales with zoom level (tiny Z0 chunks allow more parallelism).
     * Notifications are debounced to reduce render thrashing at far zoom.
     */
    async processRenderQueue() {
      if (this.isProcessingQueue) return;
      this.isProcessingQueue = true;
      const queueStart = performance.now();
      let processed = 0;
      const FRAME_BUDGET_MS = 8;
      while (this.renderQueue.length > 0) {
        const batchStart = performance.now();
        const currentZoom = this.renderQueue[0].zoomLevel;
        const concurrency = this.getConcurrency(currentZoom);
        const batch = this.renderQueue.splice(0, concurrency);
        const promises = batch.map(async (request) => {
          const t0 = performance.now();
          await this.renderChunk(request.chunkI, request.chunkJ, request.zoomLevel);
          const dt = performance.now() - t0;
          if (dt > 50) {
            console.log(`[ChunkCache] render ${request.chunkI},${request.chunkJ} z${request.zoomLevel}: ${dt.toFixed(0)}ms (queue: ${this.renderQueue.length})`);
          }
        });
        await Promise.all(promises);
        processed += batch.length;
        this.scheduleChunkReadyNotification();
        if (performance.now() - batchStart > FRAME_BUDGET_MS && this.renderQueue.length > 0) {
          const raf = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
          await new Promise((resolve) => raf(() => resolve()));
        }
      }
      this.scheduleChunkReadyNotification();
      if (this.sessionQueued > 0 && this.sessionDone >= this.sessionQueued) {
        this.onChunkProgress?.(this.sessionQueued, this.sessionQueued);
      }
      const totalDt = performance.now() - queueStart;
      if (processed > 1) {
        console.log(`[ChunkCache] queue done: ${processed} chunks in ${totalDt.toFixed(0)}ms (avg ${(totalDt / processed).toFixed(0)}ms/chunk)`);
      }
      this.isProcessingQueue = false;
    }
    /**
     * Flatten a texture ID: replace vegetation/special tiles with their flat center equivalent.
     * Keeps LandClass (bits 7-6), zeros LandType and LandVar.
     */
    flattenTextureId(textureId) {
      if (isSpecialTile(textureId)) {
        return textureId & FLAT_MASK;
      }
      return textureId;
    }
    /**
     * Render a single chunk: try server-side pre-rendered PNG first, fall back to local rendering.
     */
    async renderChunk(chunkI, chunkJ, zoomLevel) {
      if (this.useServerChunks && !this.serverChunkFailed && this.mapName) {
        const success = await this.fetchServerChunk(chunkI, chunkJ, zoomLevel);
        if (success) return;
      }
      await this.renderChunkLocally(chunkI, chunkJ, zoomLevel);
    }
    /**
     * Fetch a pre-rendered chunk PNG from the server.
     * @returns true if successful, false if failed (caller should fall back to local rendering)
     */
    async fetchServerChunk(chunkI, chunkJ, zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (!entry) return false;
      try {
        const t0 = performance.now();
        const cdnUrl = config.cdn.url;
        const cdnPath = `/chunks/${encodeURIComponent(this.mapName)}/${encodeURIComponent(this.terrainType)}/${this.season}/z${zoomLevel}/chunk_${chunkI}_${chunkJ}.webp`;
        const url = cdnUrl ? `${cdnUrl}${cdnPath}` : `/cdn${cdnPath}`;
        const response = await fetch(url);
        const tFetch = performance.now();
        if (!response.ok) {
          if (response.status === 404) {
            console.warn("[ChunkCache] Server chunks not available, falling back to local rendering");
            this.serverChunkFailed = true;
          }
          return false;
        }
        const blob = await response.blob();
        const tBlob = performance.now();
        const bitmap = await createImageBitmap(blob);
        const tBitmap = performance.now();
        const config2 = ZOOM_LEVELS[zoomLevel];
        const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config2);
        const ctx = entry.canvas.getContext("2d");
        if (!ctx) {
          bitmap.close();
          return false;
        }
        ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
        ctx.drawImage(bitmap, 0, 0);
        const tDraw = performance.now();
        bitmap.close();
        entry.ready = true;
        entry.rendering = false;
        this.stats.chunksRendered++;
        this.stats.serverChunksLoaded++;
        this.evictIfNeeded(zoomLevel);
        this.notifyChunkComplete(key);
        const total = tDraw - t0;
        if (total > 30) {
          console.log(`[ChunkCache] fetch ${chunkI},${chunkJ} z${zoomLevel}: fetch=${(tFetch - t0).toFixed(0)}ms blob=${(tBlob - tFetch).toFixed(0)}ms bitmap=${(tBitmap - tBlob).toFixed(0)}ms draw=${(tDraw - tBitmap).toFixed(0)}ms total=${total.toFixed(0)}ms (${(blob.size / 1024).toFixed(0)} KB)`);
        }
        return true;
      } catch (error) {
        console.warn(`[ChunkCache] Server chunk fetch failed for ${chunkI},${chunkJ}:`, error);
        return false;
      }
    }
    /**
     * Render a single chunk locally (flat terrain only — no tall/vegetation textures).
     * This is the fallback path when server chunks are not available.
     */
    async renderChunkLocally(chunkI, chunkJ, zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (!entry) return;
      const config2 = ZOOM_LEVELS[zoomLevel];
      const ctx = entry.canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
      const startI = chunkI * CHUNK_SIZE;
      const startJ = chunkJ * CHUNK_SIZE;
      const endI = Math.min(startI + CHUNK_SIZE, this.mapHeight);
      const endJ = Math.min(startJ + CHUNK_SIZE, this.mapWidth);
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      const atlas = this.atlasCache?.isReady() ? this.atlasCache : null;
      if (atlas) {
        const atlasImg = atlas.getAtlas();
        for (let i = startI; i < endI; i++) {
          for (let j = startJ; j < endJ; j++) {
            const textureId = this.flattenTextureId(this.getTextureId(j, i));
            const rect = atlas.getTileRect(textureId);
            const localI = i - startI;
            const localJ = j - startJ;
            const screenPos = getTileScreenPosInChunk(localI, localJ, CHUNK_SIZE, config2);
            const x = Math.round(screenPos.x);
            const y = Math.round(screenPos.y);
            if (rect) {
              ctx.drawImage(
                atlasImg,
                rect.sx,
                rect.sy,
                rect.sw,
                rect.sh,
                x - halfWidth,
                y,
                config2.tileWidth,
                config2.tileHeight
              );
            } else {
              const color = getFallbackColor(textureId);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + halfWidth, y + halfHeight);
              ctx.lineTo(x, y + config2.tileHeight);
              ctx.lineTo(x - halfWidth, y + halfHeight);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      } else {
        const textureIds = /* @__PURE__ */ new Set();
        for (let i = startI; i < endI; i++) {
          for (let j = startJ; j < endJ; j++) {
            textureIds.add(this.flattenTextureId(this.getTextureId(j, i)));
          }
        }
        await this.textureCache.preload(Array.from(textureIds));
        for (let i = startI; i < endI; i++) {
          for (let j = startJ; j < endJ; j++) {
            const textureId = this.flattenTextureId(this.getTextureId(j, i));
            const texture = this.textureCache.getTextureSync(textureId);
            const localI = i - startI;
            const localJ = j - startJ;
            const screenPos = getTileScreenPosInChunk(localI, localJ, CHUNK_SIZE, config2);
            const x = Math.round(screenPos.x);
            const y = Math.round(screenPos.y);
            if (texture) {
              ctx.drawImage(
                texture,
                x - halfWidth,
                y,
                config2.tileWidth,
                config2.tileHeight
              );
            } else {
              const color = getFallbackColor(textureId);
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + halfWidth, y + halfHeight);
              ctx.lineTo(x, y + config2.tileHeight);
              ctx.lineTo(x - halfWidth, y + halfHeight);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      }
      entry.ready = true;
      entry.rendering = false;
      this.stats.chunksRendered++;
      this.evictIfNeeded(zoomLevel);
      this.notifyChunkComplete(key);
    }
    /**
     * Draw a chunk to the main canvas
     */
    drawChunkToCanvas(ctx, chunkI, chunkJ, zoomLevel, origin) {
      const chunk = this.getChunkSync(chunkI, chunkJ, zoomLevel);
      if (!chunk) return false;
      const config2 = ZOOM_LEVELS[zoomLevel];
      const screenPos = getChunkScreenPosition(
        chunkI,
        chunkJ,
        CHUNK_SIZE,
        config2,
        this.mapHeight,
        this.mapWidth,
        origin
      );
      ctx.drawImage(chunk, Math.round(screenPos.x), Math.round(screenPos.y));
      return true;
    }
    /**
     * Draw a chunk if it's already cached (no async render trigger).
     * Used by the ground layer cache to avoid re-queuing evicted chunks.
     */
    drawChunkIfReady(ctx, chunkI, chunkJ, zoomLevel, origin) {
      if (!isOffscreenCanvasSupported) return false;
      const cache = this.caches.get(zoomLevel);
      if (!cache) return false;
      const key = this.getKey(chunkI, chunkJ);
      const entry = cache.get(key);
      if (!entry || !entry.ready) return false;
      cache.delete(key);
      cache.set(key, entry);
      const config2 = ZOOM_LEVELS[zoomLevel];
      const screenPos = getChunkScreenPosition(
        chunkI,
        chunkJ,
        CHUNK_SIZE,
        config2,
        this.mapHeight,
        this.mapWidth,
        origin
      );
      ctx.drawImage(entry.canvas, Math.round(screenPos.x), Math.round(screenPos.y));
      return true;
    }
    /**
     * Get screen position of a chunk for visibility testing
     */
    getChunkScreenBounds(chunkI, chunkJ, zoomLevel, origin) {
      const config2 = ZOOM_LEVELS[zoomLevel];
      const dims = calculateChunkCanvasDimensions(CHUNK_SIZE, config2);
      const screenPos = getChunkScreenPosition(
        chunkI,
        chunkJ,
        CHUNK_SIZE,
        config2,
        this.mapHeight,
        this.mapWidth,
        origin
      );
      return {
        x: screenPos.x,
        y: screenPos.y,
        width: dims.width,
        height: dims.height
      };
    }
    /**
     * Get visible chunk range from pre-computed tile bounds.
     * O(1) — converts tile bounds to chunk bounds with ±1 padding for isometric overlap.
     */
    getVisibleChunksFromBounds(tileBounds) {
      const maxChunkI = Math.ceil(this.mapHeight / CHUNK_SIZE);
      const maxChunkJ = Math.ceil(this.mapWidth / CHUNK_SIZE);
      return {
        minChunkI: Math.max(0, Math.floor(tileBounds.minI / CHUNK_SIZE) - 1),
        maxChunkI: Math.min(maxChunkI - 1, Math.floor(tileBounds.maxI / CHUNK_SIZE) + 1),
        minChunkJ: Math.max(0, Math.floor(tileBounds.minJ / CHUNK_SIZE) - 1),
        maxChunkJ: Math.min(maxChunkJ - 1, Math.floor(tileBounds.maxJ / CHUNK_SIZE) + 1)
      };
    }
    /**
     * Preload chunks for a specific area (anticipate pan)
     */
    preloadChunks(centerChunkI, centerChunkJ, radius, zoomLevel) {
      const maxChunkI = Math.ceil(this.mapHeight / CHUNK_SIZE);
      const maxChunkJ = Math.ceil(this.mapWidth / CHUNK_SIZE);
      for (let di = -radius; di <= radius; di++) {
        for (let dj = -radius; dj <= radius; dj++) {
          const ci = centerChunkI + di;
          const cj = centerChunkJ + dj;
          if (ci >= 0 && ci < maxChunkI && cj >= 0 && cj < maxChunkJ) {
            this.getChunkSync(ci, cj, zoomLevel);
          }
        }
      }
    }
    /**
     * Wait for specific chunks to become ready.
     * Triggers loading for each chunk via getChunkSync(), then returns a Promise
     * that resolves once all specified chunks have entry.ready === true.
     * Includes a safety timeout (default 15s) to prevent infinite waiting.
     */
    awaitChunksReady(chunks, zoomLevel, timeoutMs = 15e3, onProgress) {
      const cache = this.caches.get(zoomLevel);
      if (!cache) return Promise.resolve();
      const pendingKeys = /* @__PURE__ */ new Set();
      for (const { i, j } of chunks) {
        const key = this.getKey(i, j);
        const entry = cache.get(key);
        if (!entry || !entry.ready) {
          pendingKeys.add(key);
        }
      }
      if (pendingKeys.size === 0) {
        onProgress?.(chunks.length, chunks.length);
        return Promise.resolve();
      }
      onProgress?.(chunks.length - pendingKeys.size, chunks.length);
      for (const { i, j } of chunks) {
        const key = this.getKey(i, j);
        if (pendingKeys.has(key)) {
          this.getChunkSync(i, j, zoomLevel);
        }
      }
      return new Promise((resolve) => {
        this.pendingAwait = { keys: pendingKeys, total: chunks.length, resolve, onProgress };
        this.pendingAwaitTimeout = setTimeout(() => {
          if (this.pendingAwait) {
            console.warn(`[ChunkCache] awaitChunksReady timed out with ${this.pendingAwait.keys.size} chunks remaining`);
            this.pendingAwait.resolve();
            this.pendingAwait = null;
            this.pendingAwaitTimeout = null;
          }
        }, timeoutMs);
      });
    }
    /**
     * Called when a chunk becomes ready. Updates session progress and checks pending await.
     */
    notifyChunkComplete(key) {
      this.sessionDone++;
      this.onChunkProgress?.(this.sessionDone, this.sessionQueued);
      this.checkPendingAwait(key);
    }
    /**
     * Check if a newly-ready chunk satisfies a pending awaitChunksReady() call.
     */
    checkPendingAwait(key) {
      if (!this.pendingAwait) return;
      this.pendingAwait.keys.delete(key);
      const done = this.pendingAwait.total - this.pendingAwait.keys.size;
      this.pendingAwait.onProgress?.(done, this.pendingAwait.total);
      if (this.pendingAwait.keys.size === 0) {
        if (this.pendingAwaitTimeout !== null) {
          clearTimeout(this.pendingAwaitTimeout);
          this.pendingAwaitTimeout = null;
        }
        this.pendingAwait.resolve();
        this.pendingAwait = null;
      }
    }
    /**
     * LRU eviction for a specific zoom level
     */
    evictIfNeeded(zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      const maxChunks = MAX_CHUNKS_PER_ZOOM[zoomLevel] ?? 96;
      while (cache.size > maxChunks) {
        const firstKey = cache.keys().next().value;
        if (firstKey === void 0) break;
        const entry = cache.get(firstKey);
        if (entry && (!entry.ready || entry.rendering)) {
          cache.delete(firstKey);
          cache.set(firstKey, entry);
          break;
        }
        cache.delete(firstKey);
        this.stats.evictions++;
      }
    }
    /**
     * Clear cache for a specific zoom level (call when zoom changes)
     */
    clearZoomLevel(zoomLevel) {
      const cache = this.caches.get(zoomLevel);
      if (cache) {
        cache.clear();
      }
    }
    /**
     * Clear all caches
     */
    clearAll() {
      for (const cache of this.caches.values()) {
        cache.clear();
      }
      this.renderQueue = [];
      if (this.chunkReadyTimer !== null) {
        clearTimeout(this.chunkReadyTimer);
        this.chunkReadyTimer = null;
      }
      if (this.pendingAwait) {
        if (this.pendingAwaitTimeout !== null) {
          clearTimeout(this.pendingAwaitTimeout);
          this.pendingAwaitTimeout = null;
        }
        this.pendingAwait.resolve();
        this.pendingAwait = null;
      }
      this.stats = {
        chunksRendered: 0,
        cacheHits: 0,
        cacheMisses: 0,
        evictions: 0,
        serverChunksLoaded: 0
      };
    }
    /**
     * Invalidate a specific chunk (e.g., if terrain changes)
     */
    invalidateChunk(chunkI, chunkJ, zoomLevel) {
      if (zoomLevel !== void 0) {
        const cache = this.caches.get(zoomLevel);
        if (cache) {
          cache.delete(this.getKey(chunkI, chunkJ));
        }
      } else {
        for (const cache of this.caches.values()) {
          cache.delete(this.getKey(chunkI, chunkJ));
        }
      }
    }
    /**
     * Get cache statistics
     */
    getStats() {
      const total = this.stats.cacheHits + this.stats.cacheMisses;
      const cacheSizes = {};
      for (const [level, cache] of this.caches) {
        cacheSizes[level] = cache.size;
      }
      return {
        ...this.stats,
        hitRate: total > 0 ? this.stats.cacheHits / total : 0,
        cacheSizes,
        queueLength: this.renderQueue.length
      };
    }
  };

  // src/client/renderer/isometric-terrain-renderer.ts
  var FLAT_MASK2 = 192;
  var IsometricTerrainRenderer = class {
    constructor(canvas, options) {
      this.chunkCache = null;
      // Rendering mode
      this.useTextures = true;
      this.useChunks = true;
      // Use chunk-based rendering (10-20x faster)
      this.showDebugInfo = true;
      // Show debug info overlay
      // View state
      this.zoomLevel = 2;
      // Default zoom (16×32 pixels per tile)
      this.rotation = 0 /* NORTH */;
      this.season = 2 /* SUMMER */;
      // Default season for textures
      // Camera position in map coordinates (center tile)
      this.cameraI = 500;
      this.cameraJ = 500;
      // Screen origin (for Lander.pas formula)
      this.origin = { x: 0, y: 0 };
      // State flags
      this.loaded = false;
      this.mapName = "";
      this.terrainType = "Earth";
      // Z0 terrain preview — a single low-res image of the entire map used as an
      // instant backdrop while chunks stream in (eliminates blue triangle flicker)
      this.terrainPreview = null;
      this.terrainPreviewLoading = false;
      // Preview origin offset: the preview image's (0,0) corresponds to chunk (0,0)'s
      // screen position. We store the world-space offset so we can position it correctly.
      this.previewOriginX = 0;
      this.previewOriginY = 0;
      // Available seasons for current terrain type (auto-detected from server)
      this.availableSeasons = [0 /* WINTER */, 1 /* SPRING */, 2 /* SUMMER */, 3 /* AUTUMN */];
      // Rendering stats (for debug info)
      this.lastRenderStats = {
        tilesRendered: 0,
        renderTimeMs: 0,
        visibleBounds: { minI: 0, maxI: 0, minJ: 0, maxJ: 0 }
      };
      // Mouse interaction state
      this.isDragging = false;
      this.lastMouseX = 0;
      this.lastMouseY = 0;
      // Render debouncing (prevents flickering when multiple chunks become ready)
      this.pendingRenderRequest = null;
      // External render callback: when set, chunk-ready events delegate to the parent renderer
      // instead of triggering terrain-only renders (which cause blinking)
      this.onRenderNeeded = null;
      // External chunk progress callback: wired to ChunkCache.onChunkProgress after map load.
      // Set by the parent (client.ts or bridge) to receive (done, total) progress updates.
      this.onChunkProgress = null;
      this.canvas = canvas;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D rendering context");
      }
      this.ctx = ctx;
      this.terrainLoader = new TerrainLoader();
      this.coordMapper = new CoordinateMapper(2e3, 2e3);
      this.textureCache = new TextureCache();
      this.atlasCache = new TextureAtlasCache();
      if (!options?.disableMouseControls) {
        this.setupMouseControls();
      }
      this.setupResizeHandler();
      this.render();
    }
    /**
     * Load terrain data for a map
     * @param mapName - Name of the map (e.g., 'Shamba', 'Antiqua')
     */
    async loadMap(mapName) {
      const terrainData = await this.terrainLoader.loadMap(mapName);
      const terrainType = terrainData.metadata.terrainType;
      this.terrainType = terrainType;
      this.textureCache.setTerrainType(terrainType);
      this.atlasCache.setTerrainType(terrainType);
      await this.fetchAvailableSeasons(terrainType);
      this.atlasCache.setSeason(this.season);
      this.atlasCache.loadAtlas().then(() => {
        if (this.atlasCache.isReady()) {
          this.chunkCache?.clearAll();
          this.requestRender();
        }
      });
      this.coordMapper = new CoordinateMapper(
        terrainData.width,
        terrainData.height
      );
      this.chunkCache = new ChunkCache(
        this.textureCache,
        (x, y) => this.terrainLoader.getTextureId(x, y)
      );
      this.chunkCache.setAtlasCache(this.atlasCache);
      this.chunkCache.setMapDimensions(terrainData.width, terrainData.height);
      this.chunkCache.setMapInfo(mapName, terrainType, this.season);
      this.chunkCache.setOnChunkReady(() => {
        if (this.onRenderNeeded) {
          this.onRenderNeeded();
        } else {
          this.requestRender();
        }
      });
      if (this.onChunkProgress) {
        this.chunkCache.onChunkProgress = this.onChunkProgress;
      }
      this.cameraI = Math.floor(terrainData.height / 2);
      this.cameraJ = Math.floor(terrainData.width / 2);
      this.updateOrigin();
      this.mapName = mapName;
      this.loaded = true;
      this.loadTerrainPreview(mapName, terrainType, this.season);
      this.render();
      return terrainData;
    }
    /**
     * Load the terrain preview image — a single low-res image of the entire map.
     * Used as an instant backdrop at Z0/Z1 while chunks stream in.
     */
    async loadTerrainPreview(mapName, terrainType, season) {
      if (this.terrainPreviewLoading) return;
      this.terrainPreviewLoading = true;
      try {
        const cdnUrl = config.cdn.url;
        const previewPath = `/chunks/${encodeURIComponent(mapName)}/${encodeURIComponent(terrainType)}/${season}/preview.png`;
        const url = cdnUrl ? `${cdnUrl}${previewPath}` : `/cdn${previewPath}`;
        const response = await fetch(url);
        if (!response.ok) {
          console.log(`[IsometricRenderer] Terrain preview not available (${response.status})`);
          return;
        }
        const blob = await response.blob();
        this.terrainPreview = await createImageBitmap(blob);
        const mapH = this.terrainLoader.getDimensions().height;
        const mapW = this.terrainLoader.getDimensions().width;
        const z0U = 4;
        const chunkSize = 32;
        const localOriginX = z0U * chunkSize;
        const localOriginY = z0U / 2 * (chunkSize + chunkSize);
        const chunksI = Math.ceil(mapH / chunkSize);
        const chunksJ = Math.ceil(mapW / chunkSize);
        let minX = Infinity, minY = Infinity;
        for (let ci = 0; ci < chunksI; ci++) {
          for (let cj = 0; cj < chunksJ; cj++) {
            const baseI = ci * chunkSize;
            const baseJ = cj * chunkSize;
            const sx = z0U * (mapH - baseI + baseJ) - localOriginX;
            const sy = z0U / 2 * (mapH - baseI + (mapW - baseJ)) - localOriginY;
            minX = Math.min(minX, sx);
            minY = Math.min(minY, sy);
          }
        }
        this.previewOriginX = minX;
        this.previewOriginY = minY;
        console.log(`[IsometricRenderer] Terrain preview loaded: ${this.terrainPreview.width}\xD7${this.terrainPreview.height}`);
        this.requestRender();
      } catch (error) {
        console.warn("[IsometricRenderer] Failed to load terrain preview:", error);
      } finally {
        this.terrainPreviewLoading = false;
      }
    }
    /**
     * Fetch available seasons for a terrain type from server
     * Auto-selects the default season if current season is not available
     */
    async fetchAvailableSeasons(terrainType) {
      try {
        const url = `/api/terrain-info/${encodeURIComponent(terrainType)}`;
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[IsometricRenderer] Failed to fetch terrain info for ${terrainType}: ${response.status}`);
          return;
        }
        const info = await response.json();
        this.availableSeasons = info.availableSeasons;
        if (!info.availableSeasons.includes(this.season)) {
          this.season = info.defaultSeason;
          this.textureCache.setSeason(info.defaultSeason);
          this.atlasCache.setSeason(info.defaultSeason);
          this.chunkCache?.clearAll();
        }
      } catch (error) {
        console.warn(`[IsometricRenderer] Error fetching terrain info:`, error);
      }
    }
    /**
     * Update origin based on camera position
     * The origin is the screen offset that centers the camera tile
     * Uses CoordinateMapper to properly account for rotation
     */
    updateOrigin() {
      const cameraScreen = this.coordMapper.mapToScreen(
        this.cameraI,
        this.cameraJ,
        this.zoomLevel,
        this.rotation,
        { x: 0, y: 0 }
      );
      this.origin = {
        x: Math.round(cameraScreen.x - this.canvas.width / 2),
        y: Math.round(cameraScreen.y - this.canvas.height / 2)
      };
    }
    /**
     * Request a render (debounced via requestAnimationFrame)
     * This prevents flickering when multiple chunks become ready simultaneously
     */
    requestRender() {
      if (this.pendingRenderRequest !== null) {
        return;
      }
      this.pendingRenderRequest = requestAnimationFrame(() => {
        this.pendingRenderRequest = null;
        this.render();
      });
    }
    /**
     * Main render loop
     */
    render() {
      const startTime = performance.now();
      const ctx = this.ctx;
      const width = this.canvas.width;
      const height = this.canvas.height;
      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, width, height);
      if (!this.loaded) {
        ctx.fillStyle = "#666";
        ctx.font = "16px monospace";
        ctx.textAlign = "center";
        ctx.fillText("Loading terrain data...", width / 2, height / 2);
        return;
      }
      this.updateOrigin();
      const viewport = {
        x: 0,
        y: 0,
        width,
        height
      };
      const bounds = this.coordMapper.getVisibleBounds(
        viewport,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
      const tilesRendered = this.renderTerrainLayer(bounds);
      if (this.showDebugInfo) {
        this.renderDebugInfo(bounds, tilesRendered);
      }
      this.lastRenderStats = {
        tilesRendered,
        renderTimeMs: performance.now() - startTime,
        visibleBounds: bounds
      };
    }
    /**
     * Render the terrain layer (flat only — no vegetation/tall textures)
     * Uses chunk-based rendering for performance (10-20x faster)
     * Falls back to tile-by-tile rendering when chunks not available or rotation is active
     */
    renderTerrainLayer(bounds) {
      if (this.useChunks && this.chunkCache && this.chunkCache.isSupported() && this.rotation === 0 /* NORTH */) {
        return this.renderTerrainLayerChunked(bounds);
      }
      return this.renderTerrainLayerTiles(bounds);
    }
    /**
     * Chunk-based terrain rendering (fast path)
     * Renders pre-cached chunks instead of individual tiles.
     * At Z0/Z1, draws the terrain preview image as an instant backdrop while chunks load.
     */
    renderTerrainLayerChunked(bounds) {
      if (!this.chunkCache) return 0;
      const ctx = this.ctx;
      const canvasWidth = this.canvas.width;
      const canvasHeight = this.canvas.height;
      const prevSmoothing = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      if (this.terrainPreview && this.zoomLevel <= 1) {
        this.drawTerrainPreview(ctx);
      }
      const visibleChunks = this.chunkCache.getVisibleChunksFromBounds(bounds);
      let chunksDrawn = 0;
      let tilesRendered = 0;
      let visMinI = visibleChunks.maxChunkI, visMaxI = visibleChunks.minChunkI;
      let visMinJ = visibleChunks.maxChunkJ, visMaxJ = visibleChunks.minChunkJ;
      for (let ci = visibleChunks.minChunkI; ci <= visibleChunks.maxChunkI; ci++) {
        for (let cj = visibleChunks.minChunkJ; cj <= visibleChunks.maxChunkJ; cj++) {
          const screenBounds = this.chunkCache.getChunkScreenBounds(ci, cj, this.zoomLevel, this.origin);
          if (screenBounds.x + screenBounds.width < 0 || screenBounds.x > canvasWidth || screenBounds.y + screenBounds.height < 0 || screenBounds.y > canvasHeight) {
            continue;
          }
          visMinI = Math.min(visMinI, ci);
          visMaxI = Math.max(visMaxI, ci);
          visMinJ = Math.min(visMinJ, cj);
          visMaxJ = Math.max(visMaxJ, cj);
          const drawn = this.chunkCache.drawChunkToCanvas(
            ctx,
            ci,
            cj,
            this.zoomLevel,
            this.origin
          );
          if (drawn) {
            chunksDrawn++;
            tilesRendered += CHUNK_SIZE * CHUNK_SIZE;
          } else if (this.zoomLevel >= 2) {
            tilesRendered += this.renderChunkTilesFallback(ci, cj);
          }
        }
      }
      if (visMinI <= visMaxI) {
        const preloadRadius = this.zoomLevel <= 1 ? 1 : 2;
        const centerChunkI = Math.floor((visMinI + visMaxI) / 2);
        const centerChunkJ = Math.floor((visMinJ + visMaxJ) / 2);
        this.chunkCache.preloadChunks(centerChunkI, centerChunkJ, preloadRadius, this.zoomLevel);
      }
      ctx.imageSmoothingEnabled = prevSmoothing;
      return tilesRendered;
    }
    /**
     * Render individual tiles for a chunk that isn't cached yet
     * Flat only — all special tiles are flattened
     */
    renderChunkTilesFallback(chunkI, chunkJ) {
      const config2 = ZOOM_LEVELS[this.zoomLevel];
      const tileWidth = config2.tileWidth;
      const tileHeight = config2.tileHeight;
      const startI = chunkI * CHUNK_SIZE;
      const startJ = chunkJ * CHUNK_SIZE;
      const endI = Math.min(startI + CHUNK_SIZE, this.terrainLoader.getDimensions().height);
      const endJ = Math.min(startJ + CHUNK_SIZE, this.terrainLoader.getDimensions().width);
      let tilesRendered = 0;
      for (let i = startI; i < endI; i++) {
        for (let j = startJ; j < endJ; j++) {
          let textureId = this.terrainLoader.getTextureId(j, i);
          if (isSpecialTile(textureId)) {
            textureId = textureId & FLAT_MASK2;
          }
          if (this.rotation !== 0 /* NORTH */) {
            textureId = rotateLandId(textureId, this.rotation);
          }
          const screenPos = this.coordMapper.mapToScreen(
            i,
            j,
            this.zoomLevel,
            this.rotation,
            this.origin
          );
          if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth || screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
            continue;
          }
          this.drawIsometricTile(Math.round(screenPos.x), Math.round(screenPos.y), config2, textureId);
          tilesRendered++;
        }
      }
      return tilesRendered;
    }
    /**
     * Draw the terrain preview image as a backdrop.
     * The preview is a single image of the entire map at Z0 scale, positioned
     * using the same isometric projection as chunks. At Z1 we scale it 2×.
     */
    drawTerrainPreview(ctx) {
      if (!this.terrainPreview) return;
      const scale = this.zoomLevel === 0 ? 1 : 2;
      const drawX = this.previewOriginX * scale - this.origin.x;
      const drawY = this.previewOriginY * scale - this.origin.y;
      const drawW = this.terrainPreview.width * scale;
      const drawH = this.terrainPreview.height * scale;
      ctx.drawImage(this.terrainPreview, drawX, drawY, drawW, drawH);
    }
    /**
     * Tile-by-tile terrain rendering (slow path, fallback for non-NORTH rotations)
     * Flat only — all special tiles are flattened
     */
    renderTerrainLayerTiles(bounds) {
      const config2 = ZOOM_LEVELS[this.zoomLevel];
      const tileWidth = config2.tileWidth;
      const tileHeight = config2.tileHeight;
      let tilesRendered = 0;
      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          let textureId = this.terrainLoader.getTextureId(j, i);
          if (isSpecialTile(textureId)) {
            textureId = textureId & FLAT_MASK2;
          }
          if (this.rotation !== 0 /* NORTH */) {
            textureId = rotateLandId(textureId, this.rotation);
          }
          const screenPos = this.coordMapper.mapToScreen(
            i,
            j,
            this.zoomLevel,
            this.rotation,
            this.origin
          );
          if (screenPos.x < -tileWidth || screenPos.x > this.canvas.width + tileWidth || screenPos.y < -tileHeight || screenPos.y > this.canvas.height + tileHeight) {
            continue;
          }
          this.drawIsometricTile(Math.round(screenPos.x), Math.round(screenPos.y), config2, textureId);
          tilesRendered++;
        }
      }
      return tilesRendered;
    }
    /**
     * Draw a single isometric diamond tile (flat terrain only)
     *
     * When textures are available: Draw the texture
     * When textures are NOT available: Draw a diamond-shaped fallback color
     */
    drawIsometricTile(screenX, screenY, config2, textureId) {
      const ctx = this.ctx;
      const halfWidth = config2.tileWidth / 2;
      const halfHeight = config2.tileHeight / 2;
      let texture = null;
      if (this.useTextures) {
        texture = this.textureCache.getTextureSync(textureId);
      }
      if (texture) {
        ctx.drawImage(
          texture,
          screenX - halfWidth,
          screenY,
          config2.tileWidth,
          config2.tileHeight
        );
      } else {
        const color = this.textureCache.getFallbackColor(textureId);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + halfWidth, screenY + halfHeight);
        ctx.lineTo(screenX, screenY + config2.tileHeight);
        ctx.lineTo(screenX - halfWidth, screenY + halfHeight);
        ctx.closePath();
        ctx.fill();
      }
    }
    /**
     * Render debug information overlay
     */
    renderDebugInfo(bounds, tilesRendered) {
      const ctx = this.ctx;
      const config2 = ZOOM_LEVELS[this.zoomLevel];
      const cacheStats = this.textureCache.getStats();
      const chunkStats = this.chunkCache?.getStats();
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(10, 10, 420, 210);
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      const availableSeasonStr = this.availableSeasons.length === 1 ? `(only ${SEASON_NAMES[this.availableSeasons[0]]})` : `(${this.availableSeasons.length} available)`;
      const lines = [
        `Map: ${this.mapName} (${this.terrainLoader.getDimensions().width}\xD7${this.terrainLoader.getDimensions().height})`,
        `Terrain: ${this.textureCache.getTerrainType()} | Season: ${SEASON_NAMES[this.season]} ${availableSeasonStr}`,
        `Camera: (${Math.round(this.cameraI)}, ${Math.round(this.cameraJ)})`,
        `Zoom Level: ${this.zoomLevel} (${config2.tileWidth}\xD7${config2.tileHeight}px)`,
        `Visible: i[${bounds.minI}..${bounds.maxI}] j[${bounds.minJ}..${bounds.maxJ}]`,
        `Tiles Rendered: ${tilesRendered}`,
        `Textures: ${this.useTextures ? "ON" : "OFF"} | Cache: ${cacheStats.size}/${cacheStats.maxSize} (${(cacheStats.hitRate * 100).toFixed(1)}% hit)`,
        `Chunks: ${this.useChunks ? "ON" : "OFF"} | Cached: ${chunkStats?.cacheSizes[this.zoomLevel] || 0} (${((chunkStats?.hitRate || 0) * 100).toFixed(1)}% hit)`,
        `Render Time: ${this.lastRenderStats.renderTimeMs.toFixed(2)}ms`,
        `Controls: Drag=Pan, Wheel=Zoom, T=Textures, C=Chunks, S=Season`
      ];
      lines.forEach((line, index) => {
        ctx.fillText(line, 20, 30 + index * 18);
      });
    }
    /**
     * Setup mouse controls for pan and zoom
     */
    setupMouseControls() {
      this.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const oldZoom = this.zoomLevel;
        if (e.deltaY > 0) {
          this.zoomLevel = Math.max(0, this.zoomLevel - 1);
        } else {
          this.zoomLevel = Math.min(3, this.zoomLevel + 1);
        }
        if (oldZoom !== this.zoomLevel) {
          this.render();
        }
      });
      this.canvas.addEventListener("mousedown", (e) => {
        if (e.button === 0 || e.button === 2) {
          this.isDragging = true;
          this.lastMouseX = e.clientX;
          this.lastMouseY = e.clientY;
          this.canvas.style.cursor = "grabbing";
        }
      });
      this.canvas.addEventListener("mousemove", (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        const config2 = ZOOM_LEVELS[this.zoomLevel];
        const u = config2.u;
        const a = (dx + 2 * dy) / (2 * u);
        const b = (2 * dy - dx) / (2 * u);
        let deltaI;
        let deltaJ;
        switch (this.rotation) {
          case 0 /* NORTH */:
            deltaI = a;
            deltaJ = b;
            break;
          case 1 /* EAST */:
            deltaI = -b;
            deltaJ = a;
            break;
          case 2 /* SOUTH */:
            deltaI = -a;
            deltaJ = -b;
            break;
          case 3 /* WEST */:
            deltaI = b;
            deltaJ = -a;
            break;
          default:
            deltaI = a;
            deltaJ = b;
        }
        this.cameraI += deltaI;
        this.cameraJ += deltaJ;
        const dims = this.terrainLoader.getDimensions();
        this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
        this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.render();
      });
      const stopDrag = () => {
        if (this.isDragging) {
          this.isDragging = false;
          this.canvas.style.cursor = "grab";
        }
      };
      this.canvas.addEventListener("mouseup", stopDrag);
      this.canvas.addEventListener("mouseleave", stopDrag);
      this.canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
      });
      this.canvas.style.cursor = "grab";
      window.addEventListener("keydown", (e) => {
        if (e.key === "t" || e.key === "T") {
          this.toggleTextures();
        }
        if (e.key === "c" || e.key === "C") {
          this.toggleChunks();
        }
        if (e.key === "s" || e.key === "S") {
          this.cycleSeason();
        }
      });
    }
    /**
     * Setup window resize handler
     */
    setupResizeHandler() {
      const resizeObserver = new ResizeObserver(() => {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.render();
      });
      resizeObserver.observe(this.canvas);
    }
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    /**
     * Set zoom level (0-3)
     */
    setZoomLevel(level) {
      const newZoom = Math.max(0, Math.min(3, level));
      const oldZoom = this.zoomLevel;
      this.zoomLevel = newZoom;
      if (this.chunkCache && oldZoom !== newZoom) {
        for (let z = 0; z <= 3; z++) {
          if (Math.abs(z - newZoom) >= 2) {
            this.chunkCache.clearZoomLevel(z);
          }
        }
      }
      this.render();
    }
    /**
     * Get current zoom level
     */
    getZoomLevel() {
      return this.zoomLevel;
    }
    /**
     * Enable/disable debug info rendering
     * Used when a parent renderer handles its own debug overlay
     */
    setShowDebugInfo(show) {
      this.showDebugInfo = show;
    }
    /**
     * Set rotation (90° snap: N/E/S/W)
     * Clears chunk cache since chunks are rendered without rotation
     */
    setRotation(rotation) {
      if (this.rotation !== rotation) {
        this.rotation = rotation;
        this.chunkCache?.clearAll();
        this.render();
      }
    }
    /**
     * Get current rotation
     */
    getRotation() {
      return this.rotation;
    }
    /**
     * Pan camera by delta in map coordinates
     */
    pan(deltaI, deltaJ) {
      this.cameraI += deltaI;
      this.cameraJ += deltaJ;
      const dims = this.terrainLoader.getDimensions();
      this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
      this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
      this.render();
    }
    /**
     * Center camera on specific map coordinates
     */
    centerOn(i, j) {
      this.cameraI = i;
      this.cameraJ = j;
      const dims = this.terrainLoader.getDimensions();
      this.cameraI = Math.max(0, Math.min(dims.height - 1, this.cameraI));
      this.cameraJ = Math.max(0, Math.min(dims.width - 1, this.cameraJ));
      this.render();
    }
    /**
     * Get camera position
     */
    getCameraPosition() {
      return { i: this.cameraI, j: this.cameraJ };
    }
    /**
     * Get the current screen origin (for coordinate mapping)
     * Origin is computed so that camera position appears at canvas center
     */
    getOrigin() {
      return this.origin;
    }
    /**
     * Convert screen coordinates to map coordinates
     */
    screenToMap(screenX, screenY) {
      return this.coordMapper.screenToMap(
        screenX,
        screenY,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
    }
    /**
     * Convert map coordinates to screen coordinates
     */
    mapToScreen(i, j) {
      return this.coordMapper.mapToScreen(
        i,
        j,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
    }
    /**
     * Get terrain loader (for accessing terrain data)
     */
    getTerrainLoader() {
      return this.terrainLoader;
    }
    /**
     * Get coordinate mapper
     */
    getCoordinateMapper() {
      return this.coordMapper;
    }
    /**
     * Get texture cache for advanced operations
     */
    getTextureCache() {
      return this.textureCache;
    }
    /**
     * Get atlas cache for vegetation overlay rendering
     */
    getAtlasCache() {
      return this.atlasCache;
    }
    /**
     * Get chunk cache for direct chunk rendering (used by ground layer cache)
     */
    getChunkCache() {
      return this.chunkCache;
    }
    /**
     * Invalidate specific chunks (e.g., after dynamic content changes)
     */
    invalidateChunks(chunkI, chunkJ) {
      this.chunkCache?.invalidateChunk(chunkI, chunkJ);
    }
    /**
     * Check if map is loaded
     */
    isLoaded() {
      return this.loaded;
    }
    /**
     * Get map name
     */
    getMapName() {
      return this.mapName;
    }
    /**
     * Get terrain type (from map INI file, e.g. "Earth", "Alien Swamp")
     */
    getTerrainType() {
      return this.terrainType;
    }
    /**
     * Get last render statistics
     */
    getRenderStats() {
      return { ...this.lastRenderStats };
    }
    /**
     * Set external render callback.
     * When set, chunk-ready events call this instead of triggering a terrain-only render.
     * This prevents blinking: the parent renderer can do a full-pipeline render
     * (terrain + buildings + roads) instead of a terrain-only render.
     */
    setOnRenderNeeded(callback) {
      this.onRenderNeeded = callback;
    }
    /**
     * Clear chunk caches for zoom levels far from the current one.
     * Keeps current and ±1 adjacent zoom levels to allow smooth transitions.
     */
    clearDistantZoomCaches(currentZoom) {
      if (!this.chunkCache) return;
      for (let z = 0; z <= 3; z++) {
        if (Math.abs(z - currentZoom) > 1) {
          this.chunkCache.clearZoomLevel(z);
        }
      }
    }
    /**
     * Destroy renderer and release all resources.
     * Cancels pending RAF, clears all caches.
     */
    destroy() {
      if (this.pendingRenderRequest !== null) {
        cancelAnimationFrame(this.pendingRenderRequest);
        this.pendingRenderRequest = null;
      }
      this.onRenderNeeded = null;
      this.terrainLoader.unload();
      this.textureCache.clear();
      this.atlasCache.clear();
      this.chunkCache?.clearAll();
      this.chunkCache = null;
      this.loaded = false;
    }
    /**
     * Unload and cleanup
     */
    unload() {
      this.terrainLoader.unload();
      this.textureCache.clear();
      this.atlasCache.clear();
      this.chunkCache?.clearAll();
      this.chunkCache = null;
      this.loaded = false;
      this.mapName = "";
      this.render();
    }
    // =========================================================================
    // TEXTURE API
    // =========================================================================
    /**
     * Toggle texture rendering on/off
     */
    toggleTextures() {
      this.useTextures = !this.useTextures;
      console.log(`[IsometricRenderer] Textures: ${this.useTextures ? "ON" : "OFF"}`);
      this.render();
    }
    /**
     * Toggle chunk-based rendering on/off
     * When OFF, uses tile-by-tile rendering (slower but useful for debugging)
     */
    toggleChunks() {
      this.useChunks = !this.useChunks;
      console.log(`[IsometricRenderer] Chunks: ${this.useChunks ? "ON" : "OFF"}`);
      this.render();
    }
    /**
     * Set texture rendering mode
     */
    setTextureMode(enabled) {
      this.useTextures = enabled;
      this.render();
    }
    /**
     * Check if texture rendering is enabled
     */
    isTextureMode() {
      return this.useTextures;
    }
    /**
     * Preload textures for visible area
     */
    async preloadTextures() {
      if (!this.loaded) return;
      const viewport = {
        x: 0,
        y: 0,
        width: this.canvas.width,
        height: this.canvas.height
      };
      const bounds = this.coordMapper.getVisibleBounds(
        viewport,
        this.zoomLevel,
        this.rotation,
        this.origin
      );
      const textureIds = /* @__PURE__ */ new Set();
      for (let i = bounds.minI; i <= bounds.maxI; i++) {
        for (let j = bounds.minJ; j <= bounds.maxJ; j++) {
          textureIds.add(this.terrainLoader.getTextureId(j, i));
        }
      }
      await this.textureCache.preload(Array.from(textureIds));
      this.render();
    }
    // =========================================================================
    // SEASON API
    // =========================================================================
    /**
     * Set the season for terrain textures
     * @param season - Season (0=Winter, 1=Spring, 2=Summer, 3=Autumn)
     */
    setSeason(season) {
      if (this.season !== season) {
        this.season = season;
        this.textureCache.setSeason(season);
        this.atlasCache.setSeason(season);
        this.chunkCache?.clearAll();
        if (this.mapName) {
          this.chunkCache?.setMapInfo(this.mapName, this.terrainType, season);
        }
        console.log(`[IsometricRenderer] Season changed to ${SEASON_NAMES[season]}`);
        this.atlasCache.loadAtlas().then(() => {
          if (this.atlasCache.isReady()) {
            this.chunkCache?.clearAll();
            this.requestRender();
          }
        });
        this.render();
      }
    }
    /**
     * Get current season
     */
    getSeason() {
      return this.season;
    }
    /**
     * Get current season name
     */
    getSeasonName() {
      return SEASON_NAMES[this.season];
    }
    /**
     * Cycle to next season (for keyboard shortcut)
     * Only cycles through available seasons for this terrain type
     */
    cycleSeason() {
      if (this.availableSeasons.length <= 1) {
        console.log(`[IsometricRenderer] Only one season available, cannot cycle`);
        return;
      }
      const currentIndex = this.availableSeasons.indexOf(this.season);
      const nextIndex = (currentIndex + 1) % this.availableSeasons.length;
      const nextSeason = this.availableSeasons[nextIndex];
      this.setSeason(nextSeason);
    }
    /**
     * Get available seasons for current terrain type
     */
    getAvailableSeasons() {
      return [...this.availableSeasons];
    }
  };

  // src/client/terrain-test.ts
  document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("terrainCanvas");
    const mapSelect = document.getElementById("mapSelect");
    const zoomSelect = document.getElementById("zoomSelect");
    const seasonSelect = document.getElementById("seasonSelect");
    const loadBtn = document.getElementById("loadBtn");
    const centerBtn = document.getElementById("centerBtn");
    const status = document.getElementById("status");
    const loading = document.getElementById("loading");
    if (!canvas) {
      console.error("Canvas not found");
      return;
    }
    let renderer = null;
    function resizeCanvas() {
      const container = document.getElementById("canvas-container");
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
      if (renderer) {
        renderer.render();
      }
    }
    async function loadMap(mapName) {
      const selectedMap = mapName || mapSelect.value;
      status.textContent = `Loading ${selectedMap}...`;
      loading.classList.remove("hidden");
      try {
        if (!renderer) {
          renderer = new IsometricTerrainRenderer(canvas);
          window.terrainRenderer = renderer;
        }
        await renderer.loadMap(selectedMap);
        status.textContent = `Loaded: ${selectedMap}`;
        loading.classList.add("hidden");
      } catch (error) {
        console.error("Failed to load map:", error);
        status.textContent = `Error: ${error.message}`;
        loading.classList.add("hidden");
      }
    }
    function handleZoomChange() {
      if (renderer) {
        const level = parseInt(zoomSelect.value, 10);
        renderer.setZoomLevel(level);
      }
    }
    function handleSeasonChange() {
      if (renderer) {
        const season = parseInt(seasonSelect.value, 10);
        renderer.setSeason(season);
        status.textContent = `Season: ${renderer.getSeasonName()}`;
      }
    }
    function centerMap() {
      if (renderer && renderer.isLoaded()) {
        const loader = renderer.getTerrainLoader();
        const dims = loader.getDimensions();
        renderer.centerOn(Math.floor(dims.height / 2), Math.floor(dims.width / 2));
      }
    }
    const textureBtn = document.getElementById("textureBtn");
    const preloadBtn = document.getElementById("preloadBtn");
    if (loadBtn) loadBtn.addEventListener("click", () => loadMap());
    if (centerBtn) centerBtn.addEventListener("click", centerMap);
    if (zoomSelect) zoomSelect.addEventListener("change", handleZoomChange);
    if (seasonSelect) seasonSelect.addEventListener("change", handleSeasonChange);
    if (textureBtn) textureBtn.addEventListener("click", toggleTextures);
    if (preloadBtn) preloadBtn.addEventListener("click", preloadTextures);
    window.addEventListener("resize", resizeCanvas);
    function toggleTextures() {
      if (renderer) {
        renderer.toggleTextures();
        const mode = renderer.isTextureMode();
        status.textContent = `Textures: ${mode ? "ON" : "OFF"}`;
      }
    }
    async function preloadTextures() {
      if (renderer) {
        status.textContent = "Preloading textures...";
        await renderer.preloadTextures();
        const cache = renderer.getTextureCache();
        const stats = cache.getStats();
        status.textContent = `Preloaded: ${stats.size} textures`;
      }
    }
    window.loadMap = loadMap;
    window.setZoom = (level) => {
      if (renderer) renderer.setZoomLevel(level);
      if (zoomSelect) zoomSelect.value = String(level);
    };
    window.setSeason = (season) => {
      if (renderer) renderer.setSeason(season);
      if (seasonSelect) seasonSelect.value = String(season);
    };
    window.centerMap = centerMap;
    window.toggleTextures = toggleTextures;
    window.preloadTextures = preloadTextures;
    resizeCanvas();
    setTimeout(() => loadMap("Shamba"), 500);
  });
})();
