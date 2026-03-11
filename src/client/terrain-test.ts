/**
 * Terrain Test Entry Point
 * Standalone test for the IsometricTerrainRenderer
 */

import { IsometricTerrainRenderer } from './renderer/isometric-terrain-renderer';
import { Season } from '../shared/map-config';

// Declare global for the browser
declare global {
  interface Window {
    terrainRenderer: IsometricTerrainRenderer | null;
    loadMap: (mapName: string) => Promise<void>;
    setZoom: (level: number) => void;
    setSeason: (season: number) => void;
    centerMap: () => void;
    toggleTextures: () => void;
    preloadTextures: () => Promise<void>;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('terrainCanvas') as HTMLCanvasElement;
  const mapSelect = document.getElementById('mapSelect') as HTMLSelectElement;
  const zoomSelect = document.getElementById('zoomSelect') as HTMLSelectElement;
  const seasonSelect = document.getElementById('seasonSelect') as HTMLSelectElement;
  const loadBtn = document.getElementById('loadBtn') as HTMLButtonElement;
  const centerBtn = document.getElementById('centerBtn') as HTMLButtonElement;
  const status = document.getElementById('status') as HTMLSpanElement;
  const loading = document.getElementById('loading') as HTMLDivElement;

  if (!canvas) {
    console.error('Canvas not found');
    return;
  }

  // Create renderer
  let renderer: IsometricTerrainRenderer | null = null;

  // Initialize canvas size
  function resizeCanvas() {
    const container = document.getElementById('canvas-container');
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    if (renderer) {
      renderer.render();
    }
  }

  // Load selected map
  async function loadMap(mapName?: string) {
    const selectedMap = mapName || mapSelect.value;
    status.textContent = `Loading ${selectedMap}...`;
    loading.classList.remove('hidden');

    try {
      if (!renderer) {
        renderer = new IsometricTerrainRenderer(canvas);
        window.terrainRenderer = renderer;
      }

      await renderer.loadMap(selectedMap);

      status.textContent = `Loaded: ${selectedMap}`;
      loading.classList.add('hidden');
    } catch (error: unknown) {
      console.error('Failed to load map:', error);
      status.textContent = `Error: ${(error as Error).message}`;
      loading.classList.add('hidden');
    }
  }

  // Handle zoom change
  function handleZoomChange() {
    if (renderer) {
      const level = parseInt(zoomSelect.value, 10);
      renderer.setZoomLevel(level);
    }
  }

  // Handle season change
  function handleSeasonChange() {
    if (renderer) {
      const season = parseInt(seasonSelect.value, 10) as Season;
      renderer.setSeason(season);
      status.textContent = `Season: ${renderer.getSeasonName()}`;
    }
  }

  // Center on map
  function centerMap() {
    if (renderer && renderer.isLoaded()) {
      const loader = renderer.getTerrainLoader();
      const dims = loader.getDimensions();
      renderer.centerOn(Math.floor(dims.height / 2), Math.floor(dims.width / 2));
    }
  }

  // Get texture buttons
  const textureBtn = document.getElementById('textureBtn') as HTMLButtonElement;
  const preloadBtn = document.getElementById('preloadBtn') as HTMLButtonElement;

  // Setup event listeners
  if (loadBtn) loadBtn.addEventListener('click', () => loadMap());
  if (centerBtn) centerBtn.addEventListener('click', centerMap);
  if (zoomSelect) zoomSelect.addEventListener('change', handleZoomChange);
  if (seasonSelect) seasonSelect.addEventListener('change', handleSeasonChange);
  if (textureBtn) textureBtn.addEventListener('click', toggleTextures);
  if (preloadBtn) preloadBtn.addEventListener('click', preloadTextures);
  window.addEventListener('resize', resizeCanvas);

  // Toggle textures
  function toggleTextures() {
    if (renderer) {
      renderer.toggleTextures();
      const mode = renderer.isTextureMode();
      status.textContent = `Textures: ${mode ? 'ON' : 'OFF'}`;
    }
  }

  // Preload textures for visible area
  async function preloadTextures() {
    if (renderer) {
      status.textContent = 'Preloading textures...';
      await renderer.preloadTextures();
      const cache = renderer.getTextureCache();
      const stats = cache.getStats();
      status.textContent = `Preloaded: ${stats.size} textures`;
    }
  }

  // Expose functions globally for debugging
  window.loadMap = loadMap;
  window.setZoom = (level: number) => {
    if (renderer) renderer.setZoomLevel(level);
    if (zoomSelect) zoomSelect.value = String(level);
  };
  window.setSeason = (season: number) => {
    if (renderer) renderer.setSeason(season as Season);
    if (seasonSelect) seasonSelect.value = String(season);
  };
  window.centerMap = centerMap;
  window.toggleTextures = toggleTextures;
  window.preloadTextures = preloadTextures;

  // Initial setup
  resizeCanvas();

  // Auto-load Shamba on start
  setTimeout(() => loadMap('Shamba'), 500);
});
