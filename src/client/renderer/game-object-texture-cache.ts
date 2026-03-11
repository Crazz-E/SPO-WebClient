/**
 * GameObjectTextureCache
 *
 * Client-side texture cache for game objects (roads, buildings, cars, etc.)
 * Fetches textures from the server and caches them as ImageBitmap objects.
 *
 * Supported texture types:
 * - RoadBlockImages: Road textures (Roadvert.bmp, Roadhorz.bmp, etc.)
 * - BuildingImages: Building textures (Map*.gif)
 * - CarImages: Vehicle textures
 * - ConcreteImages: Concrete/pavement textures
 *
 * Transparency handling (color keying):
 * Textures are isometric diamond shapes inside square images.
 * The corners outside the diamond use "transparency key" colors:
 * - Road textures: Dynamic detection from corner pixel (0,0)
 *   Handles various background colors (blue, gray, teal for bridges, etc.)
 * - Building textures: RGB(0, 128, 0) - green background
 */

import { parseGIF, decompressFrames } from 'gifuct-js';
import { getFacilityDimensionsCache } from '../facility-dimensions-cache';

/** A single frame of an animated GIF texture */
export interface AnimatedFrame {
  bitmap: ImageBitmap;
  delay: number;  // milliseconds
}

/** Animated texture with frame array and timing */
export interface AnimatedTexture {
  frames: AnimatedFrame[];
  totalDuration: number;  // sum of all delays in ms
}

/** Result of decoding a GIF through gifuct-js with optional color keying */
interface GifDecodeResult {
  firstFrameBitmap: ImageBitmap;
  animatedTexture: AnimatedTexture | null;
}

interface CacheEntry {
  texture: ImageBitmap | null;
  animatedTexture?: AnimatedTexture;
  lastAccess: number;
  loading: boolean;
  loaded: boolean;
  loadPromise?: Promise<ImageBitmap | null>;
}

/**
 * Object atlas manifest (maps filenames to source rectangles within an atlas image)
 */
interface ObjectAtlasManifest {
  category: string;
  tileWidth: number;
  tileHeight: number;
  atlasWidth: number;
  atlasHeight: number;
  tiles: Record<string, { x: number; y: number; width: number; height: number }>;
}

/**
 * Source rectangle within an atlas for drawImage()
 */
export interface ObjectAtlasRect {
  atlas: ImageBitmap;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export type TextureCategory = 'RoadBlockImages' | 'BuildingImages' | 'CarImages' | 'ConcreteImages';

/**
 * Road texture type based on segment orientation and connections
 */
export type RoadTextureType =
  | 'Roadhorz'      // Horizontal road segment
  | 'Roadvert'      // Vertical road segment
  | 'Roadcross'     // 4-way intersection
  | 'RoadcornerN'   // Corner turning north
  | 'RoadcornerE'   // Corner turning east
  | 'RoadcornerS'   // Corner turning south
  | 'RoadcornerW'   // Corner turning west
  | 'RoadTN'        // T-junction opening north
  | 'RoadTE'        // T-junction opening east
  | 'RoadTS'        // T-junction opening south
  | 'RoadTW';       // T-junction opening west

export class GameObjectTextureCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private accessCounter: number = 0;

  /** Building GIFs that lack proper GIF transparency and need client-side color keying */
  private static readonly COLOR_KEY_GIFS: Set<string> = new Set([
    'mapmkocdstore64x32x0.gif',
  ]);

  // Statistics
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  // Deduplicate warnings for unknown visualClasses (log once per class)
  static _warnedVisualClasses: Set<string> = new Set();

  // Callback for texture load events
  private onTextureLoadedCallback?: (category: TextureCategory, name: string) => void;

  // Object atlases (road, concrete)
  private atlases: Map<string, { image: ImageBitmap; manifest: ObjectAtlasManifest }> = new Map();
  private atlasLoading: Map<string, Promise<void>> = new Map();

  constructor(maxSize: number = 2048) {
    this.maxSize = maxSize;
  }

  /**
   * Set callback to be notified when textures are loaded
   */
  setOnTextureLoaded(callback: (category: TextureCategory, name: string) => void): void {
    this.onTextureLoadedCallback = callback;
  }

  /**
   * Generate cache key for a texture
   */
  private getCacheKey(category: TextureCategory, name: string): string {
    return `${category}/${name}`;
  }

  /**
   * Get texture synchronously (returns null if not cached, triggers async load)
   */
  getTextureSync(category: TextureCategory, name: string): ImageBitmap | null {
    const key = this.getCacheKey(category, name);
    const entry = this.cache.get(key);

    if (entry && entry.texture) {
      // Move to end of Map iteration order (insertion-order LRU)
      this.cache.delete(key);
      this.cache.set(key, entry);
      this.hits++;
      return entry.texture;
    }

    // If already loaded (even if texture is null/missing), don't retry
    if (entry && entry.loaded) {
      this.misses++;
      return null;
    }

    // Not in cache, trigger async load if not already loading
    if (!entry || !entry.loading) {
      this.loadTexture(category, name);
    }

    this.misses++;
    return null;
  }

  /**
   * Get texture asynchronously (waits for load)
   */
  async getTextureAsync(category: TextureCategory, name: string): Promise<ImageBitmap | null> {
    const key = this.getCacheKey(category, name);
    const entry = this.cache.get(key);

    if (entry) {
      if (entry.texture) {
        // Move to end of Map iteration order (insertion-order LRU)
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
    return this.loadTexture(category, name);
  }

  /**
   * Load a texture from the server
   */
  private async loadTexture(category: TextureCategory, name: string): Promise<ImageBitmap | null> {
    const key = this.getCacheKey(category, name);

    // Check if already loading
    const existing = this.cache.get(key);
    if (existing?.loadPromise) {
      return existing.loadPromise;
    }

    // Create loading entry
    const loadPromise = this.fetchTexture(category, name);

    this.cache.set(key, {
      texture: null,
      lastAccess: ++this.accessCounter,
      loading: true,
      loaded: false,
      loadPromise
    });

    try {
      const texture = await loadPromise;

      // Update cache entry
      const entry = this.cache.get(key);
      if (entry) {
        entry.texture = texture;
        entry.loading = false;
        entry.loaded = true;
        entry.loadPromise = undefined;
      }

      // Evict if over capacity
      this.evictIfNeeded();

      // Notify callback if texture loaded successfully
      if (texture && this.onTextureLoadedCallback) {
        this.onTextureLoadedCallback(category, name);
      }

      return texture;
    } catch (error: unknown) {
      // Remove failed entry
      this.cache.delete(key);
      return null;
    }
  }

  /**
   * Fetch texture from server and convert to ImageBitmap.
   *
   * Textures are served as pre-baked PNGs with alpha channel already applied
   * (for BMP textures like roads/concrete). GIF textures (buildings) are served
   * as-is since the browser handles GIF transparency natively.
   *
   * For animated GIFs (multi-frame), decodes all frames into separate ImageBitmaps
   * and stores them as an AnimatedTexture on the cache entry.
   */
  private async fetchTexture(category: TextureCategory, name: string): Promise<ImageBitmap | null> {
    // URL pattern: /cache/{category}/{name}
    const url = `/cache/${category}/${encodeURIComponent(name)}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        return null;
      }

      const blob = await response.blob();

      // Attempt GIF decode for building textures (with optional color keying)
      if (category === 'BuildingImages' && name.toLowerCase().endsWith('.gif')) {
        const arrayBuffer = await blob.arrayBuffer();
        const needsColorKey = GameObjectTextureCache.COLOR_KEY_GIFS.has(name.toLowerCase());
        const result = await this.decodeGifFrames(arrayBuffer, needsColorKey);

        if (result) {
          if (result.animatedTexture) {
            const key = this.getCacheKey(category, name);
            const entry = this.cache.get(key);
            if (entry) {
              entry.animatedTexture = result.animatedTexture;
            }
          }
          return result.firstFrameBitmap;
        }

        // Not animated (and no color keying needed) — create bitmap from the buffer
        const newBlob = new Blob([arrayBuffer], { type: 'image/gif' });
        return createImageBitmap(newBlob);
      }

      return createImageBitmap(blob);
    } catch (error: unknown) {
      console.warn(`[GameObjectTextureCache] Failed to load ${category}/${name}:`, error);
      return null;
    }
  }

  /**
   * Apply color key transparency to GIF RGBA pixel data.
   * Reads pixel (0,0) to detect background color, sets alpha=0 for matches within tolerance.
   */
  private applyGifColorKey(pixels: Uint8ClampedArray, tolerance: number = 5): void {
    if (pixels.length < 4) return;
    const keyR = pixels[0], keyG = pixels[1], keyB = pixels[2];
    const count = pixels.length / 4;
    for (let i = 0; i < count; i++) {
      const off = i * 4;
      if (
        Math.abs(pixels[off] - keyR) <= tolerance &&
        Math.abs(pixels[off + 1] - keyG) <= tolerance &&
        Math.abs(pixels[off + 2] - keyB) <= tolerance
      ) {
        pixels[off + 3] = 0;
      }
    }
  }

  /**
   * Decode a GIF into individual frames, optionally applying color key transparency.
   * Returns null if decoding fails or if the GIF has only one frame and no color keying is needed.
   */
  private async decodeGifFrames(
    arrayBuffer: ArrayBuffer,
    applyColorKey: boolean = false
  ): Promise<GifDecodeResult | null> {
    try {
      const gif = parseGIF(arrayBuffer);
      const frames = decompressFrames(gif, true);

      if (frames.length === 0) return null;

      // Single-frame GIF without color keying: let browser handle natively
      if (frames.length <= 1 && !applyColorKey) return null;

      const animFrames: AnimatedFrame[] = [];
      let totalDuration = 0;

      for (const frame of frames) {
        const patchData = new Uint8ClampedArray(frame.patch);
        if (applyColorKey) {
          this.applyGifColorKey(patchData);
        }
        const imageData = new ImageData(
          patchData,
          frame.dims.width,
          frame.dims.height
        );
        const bitmap = await createImageBitmap(imageData);
        // GIF spec: delay 0 means "use default" — floor at 20ms to avoid stuck frames
        const delay = Math.max(frame.delay * 10, 20); // gifuct-js delay is in centiseconds
        animFrames.push({ bitmap, delay });
        totalDuration += delay;
      }

      return {
        firstFrameBitmap: animFrames[0].bitmap,
        animatedTexture: frames.length > 1
          ? { frames: animFrames, totalDuration }
          : null,
      };
    } catch (error: unknown) {
      console.warn('[GameObjectTextureCache] GIF decode failed:', error);
      return null;
    }
  }

  /**
   * Get the animated texture for a cached entry, if it exists.
   * Returns null for static textures or uncached entries.
   */
  getAnimatedTexture(category: TextureCategory, name: string): AnimatedTexture | null {
    const key = this.getCacheKey(category, name);
    const entry = this.cache.get(key);
    return entry?.animatedTexture ?? null;
  }

  /**
   * Get the current frame bitmap for an animated texture based on elapsed time.
   * Uses modular arithmetic to loop the animation.
   */
  getAnimatedFrame(animatedTexture: AnimatedTexture, elapsedMs: number): ImageBitmap {
    const loopTime = elapsedMs % animatedTexture.totalDuration;
    let accumulated = 0;

    for (const frame of animatedTexture.frames) {
      accumulated += frame.delay;
      if (loopTime < accumulated) {
        return frame.bitmap;
      }
    }

    // Fallback: last frame
    return animatedTexture.frames[animatedTexture.frames.length - 1].bitmap;
  }

  /**
   * Evict least recently used entries if cache is over capacity
   */
  private evictIfNeeded(): void {
    while (this.cache.size > this.maxSize) {
      // Insertion-order LRU: first key in Map is the oldest accessed
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;

      const entry = this.cache.get(firstKey);
      // Skip entries still loading (move to end and try next)
      if (entry?.loading) {
        this.cache.delete(firstKey);
        this.cache.set(firstKey, entry);
        // Safety: if all entries are loading, stop to prevent infinite loop
        break;
      }

      if (entry?.texture) {
        entry.texture.close();
      }
      if (entry?.animatedTexture) {
        for (const frame of entry.animatedTexture.frames) {
          frame.bitmap.close();
        }
      }
      this.cache.delete(firstKey);
      this.evictions++;
    }
  }

  /**
   * Preload textures for a list of names
   */
  async preload(category: TextureCategory, names: string[]): Promise<void> {
    const loadPromises = names.map(name =>
      this.getTextureAsync(category, name)
    );
    await Promise.all(loadPromises);
  }

  /**
   * Load an object atlas (road or concrete) from the server.
   * Atlas replaces individual texture fetches with a single image + manifest.
   * @param category - 'road' or 'concrete'
   */
  async loadObjectAtlas(category: string): Promise<void> {
    if (this.atlases.has(category) || this.atlasLoading.has(category)) {
      return this.atlasLoading.get(category) || Promise.resolve();
    }

    const promise = this._doLoadObjectAtlas(category);
    this.atlasLoading.set(category, promise);

    try {
      await promise;
    } finally {
      this.atlasLoading.delete(category);
    }
  }

  private async _doLoadObjectAtlas(category: string): Promise<void> {
    const atlasUrl = `/api/object-atlas/${encodeURIComponent(category)}`;
    const manifestUrl = `/api/object-atlas/${encodeURIComponent(category)}/manifest`;

    try {
      const [atlasResponse, manifestResponse] = await Promise.all([
        fetch(atlasUrl),
        fetch(manifestUrl),
      ]);

      if (!atlasResponse.ok || !manifestResponse.ok) {
        return;
      }

      const [atlasBlob, manifest] = await Promise.all([
        atlasResponse.blob(),
        manifestResponse.json() as Promise<ObjectAtlasManifest>,
      ]);

      const image = await createImageBitmap(atlasBlob);
      this.atlases.set(category, { image, manifest });

      console.log(`[GameObjectTextureCache] Loaded ${category} atlas (${Object.keys(manifest.tiles).length} textures)`);
    } catch (error: unknown) {
      console.warn(`[GameObjectTextureCache] Failed to load ${category} atlas:`, error);
    }
  }

  /**
   * Get atlas source rectangle for a texture.
   * Returns null if no atlas is loaded for this category or the texture isn't in the atlas.
   */
  getAtlasRect(category: TextureCategory, name: string): ObjectAtlasRect | null {
    // Map TextureCategory to atlas category key
    let atlasKey: string;
    if (category === 'RoadBlockImages') {
      atlasKey = 'road';
    } else if (category === 'ConcreteImages') {
      atlasKey = 'concrete';
    } else if (category === 'CarImages') {
      atlasKey = 'car';
    } else {
      return null; // No atlas for buildings
    }

    const entry = this.atlases.get(atlasKey);
    if (!entry) return null;

    // Atlas keys are stored without .bmp extension
    const lookupName = name.replace(/\.bmp$/i, '');
    let tile = entry.manifest.tiles[name] ?? entry.manifest.tiles[lookupName];

    // Case-insensitive fallback: INI files may reference "Car1.N.bmp" but filesystem has "car1.N.bmp"
    if (!tile) {
      const lowerName = lookupName.toLowerCase();
      for (const key of Object.keys(entry.manifest.tiles)) {
        if (key.toLowerCase() === lowerName) {
          tile = entry.manifest.tiles[key];
          break;
        }
      }
    }
    if (!tile) return null;

    return {
      atlas: entry.image,
      sx: tile.x,
      sy: tile.y,
      sw: tile.width,
      sh: tile.height,
    };
  }

  /**
   * Check if an object atlas is loaded for a category
   */
  hasAtlas(category: string): boolean {
    return this.atlases.has(category);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    for (const entry of this.cache.values()) {
      if (entry.texture) {
        entry.texture.close();
      }
      if (entry.animatedTexture) {
        for (const frame of entry.animatedTexture.frames) {
          frame.bitmap.close();
        }
      }
    }

    // Close atlas ImageBitmaps
    for (const atlas of this.atlases.values()) {
      atlas.image.close();
    }
    this.atlases.clear();
    this.atlasLoading.clear();

    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.accessCounter = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hits: number; misses: number; evictions: number; hitRate: number } {
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
   * Get road texture type based on segment neighbors
   * Analyzes adjacent road tiles to determine the correct texture variant
   */
  static getRoadTextureType(
    hasNorth: boolean,
    hasEast: boolean,
    hasSouth: boolean,
    hasWest: boolean
  ): RoadTextureType {
    const count = [hasNorth, hasEast, hasSouth, hasWest].filter(Boolean).length;

    if (count === 4) {
      return 'Roadcross';
    }

    if (count === 3) {
      // T-junction - opening towards the missing direction
      if (!hasNorth) return 'RoadTS';  // Opening to south
      if (!hasEast) return 'RoadTW';   // Opening to west
      if (!hasSouth) return 'RoadTN';  // Opening to north
      if (!hasWest) return 'RoadTE';   // Opening to east
    }

    if (count === 2) {
      // Straight roads
      if (hasNorth && hasSouth) return 'Roadvert';
      if (hasEast && hasWest) return 'Roadhorz';

      // Corners - based on official client transition tables:
      // The corner name indicates the "missing" direction in the L-shape
      // In isometric view, this creates diagonal staircase patterns
      if (hasNorth && hasEast) return 'RoadcornerW';  // L-shape: road from N and E
      if (hasEast && hasSouth) return 'RoadcornerN';  // L-shape: road from E and S
      if (hasSouth && hasWest) return 'RoadcornerE';  // L-shape: road from S and W
      if (hasWest && hasNorth) return 'RoadcornerS';  // L-shape: road from W and N
    }

    // Single connection or no connections - default to vertical
    if (hasNorth || hasSouth) return 'Roadvert';
    return 'Roadhorz';
  }

  /**
   * Get the BMP filename for a road texture type
   */
  static getRoadTextureFilename(type: RoadTextureType): string {
    return `${type}.bmp`;
  }

  /**
   * Get building texture filename from visualClass
   * Looks up the correct texture filename from the facility dimensions cache.
   * Falls back to a generated pattern if the building is not found in cache.
   *
   * @param visualClass - The runtime VisualClass from ObjectsInArea
   * @returns The correct texture filename (e.g., "MapPGIFoodStore64x32x0.gif")
   */
  static getBuildingTextureFilename(visualClass: string): string {
    // Look up in facility dimensions cache for correct texture filename
    const cache = getFacilityDimensionsCache();
    const facility = cache.getFacility(visualClass);

    if (facility?.textureFilename) {
      return facility.textureFilename;
    }

    // Fallback: generate pattern for unknown buildings
    // This handles buildings not yet in our database
    if (!GameObjectTextureCache._warnedVisualClasses.has(visualClass)) {
      GameObjectTextureCache._warnedVisualClasses.add(visualClass);
      console.warn(`[GameObjectTextureCache] Unknown visualClass ${visualClass}, using fallback pattern`);
    }
    return `Map${visualClass}64x32x0.gif`;
  }

  /**
   * Get construction texture filename based on building size
   * Construction textures are shared across all buildings based on their footprint size.
   *
   * @param visualClass - The runtime VisualClass from ObjectsInArea
   * @returns Construction texture filename (e.g., "Construction64.gif")
   */
  static getConstructionTextureFilename(visualClass: string): string {
    const cache = getFacilityDimensionsCache();
    const facility = cache.getFacility(visualClass);

    if (facility?.constructionTextureFilename) {
      return facility.constructionTextureFilename;
    }

    // Fallback to default construction texture
    return 'Construction64.gif';
  }

  /**
   * Get empty residential texture filename
   * Used for residential buildings that have no occupants.
   *
   * @param visualClass - The runtime VisualClass from ObjectsInArea
   * @returns Empty texture filename or undefined if not a residential building
   */
  static getEmptyTextureFilename(visualClass: string): string | undefined {
    const cache = getFacilityDimensionsCache();
    const facility = cache.getFacility(visualClass);

    return facility?.emptyTextureFilename;
  }
}
