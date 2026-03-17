/**
 * Map Data Service
 * Handles CAB extraction, INI parsing, and map file management
 */

import * as fs from 'fs';
import * as path from 'path';
import { MapMetadata, MapTownInfo } from '../shared/map-config';
import { extractCabArchive } from './cab-extractor';
import type { Service } from './service-registry';
import { getCacheDir } from './paths';

export class MapDataService implements Service {
  public readonly name = 'mapData';

  private cacheRoot: string;
  private extracted: Set<string> = new Set();
  /** Maps lowercase map name → actual directory name on disk (case-sensitive Linux fix) */
  private nameCache: Map<string, string> = new Map();

  constructor(cacheRoot: string = getCacheDir()) {
    this.cacheRoot = cacheRoot;
  }

  /**
   * Resolve a map name to the actual directory name on disk.
   * The RDO directory server returns lowercase world names (e.g. 'shamba')
   * but the update server stores them with original casing (e.g. 'Shamba').
   * On Linux (Docker) the filesystem is case-sensitive, so we must match exactly.
   */
  private resolveMapName(mapName: string): string {
    const key = mapName.toLowerCase();
    const cached = this.nameCache.get(key);
    if (cached) return cached;

    // Fast path: exact match
    const exactDir = path.join(this.cacheRoot, 'Maps', mapName);
    if (fs.existsSync(exactDir)) {
      this.nameCache.set(key, mapName);
      return mapName;
    }

    // Case-insensitive scan of Maps/ directory
    const mapsDir = path.join(this.cacheRoot, 'Maps');
    if (fs.existsSync(mapsDir)) {
      const entries = fs.readdirSync(mapsDir);
      for (const entry of entries) {
        if (entry.toLowerCase() === key) {
          this.nameCache.set(key, entry);
          return entry;
        }
      }
    }

    // No match found — return original (will fail downstream with a clear error)
    return mapName;
  }

  /**
   * Extract CAB file if not already extracted.
   * Uses 7zip-min via cab-extractor to extract images.cab into the map directory.
   */
  async extractCabFile(mapName: string): Promise<void> {
    const resolved = this.resolveMapName(mapName);

    if (this.extracted.has(resolved)) {
      return; // Already extracted
    }

    const mapDir = path.join(this.cacheRoot, 'Maps', resolved);
    const bmpPath = path.join(mapDir, `${resolved}.bmp`);
    const iniPath = path.join(mapDir, `${resolved}.ini`);

    // Check if files already exist
    if (fs.existsSync(bmpPath) && fs.existsSync(iniPath)) {
      console.log(`[MapDataService] Map ${resolved} already extracted`);
      this.extracted.add(resolved);
      return;
    }

    // Check if CAB file exists
    const cabPath = path.join(mapDir, 'images.cab');
    if (!fs.existsSync(cabPath)) {
      throw new Error(`CAB file not found for map ${resolved}: ${cabPath}`);
    }

    console.log(`[MapDataService] Extracting CAB for ${resolved}...`);

    const result = await extractCabArchive(cabPath, mapDir);

    if (!result.success) {
      throw new Error(`Failed to extract CAB for map ${resolved}: ${result.errors.join(', ')}`);
    }

    console.log(`[MapDataService] Extracted ${result.extractedFiles.length} files for map ${resolved}`);

    // Verify expected files exist after extraction
    if (!fs.existsSync(bmpPath) || !fs.existsSync(iniPath)) {
      throw new Error(`CAB extracted but expected files missing for map ${resolved}: ${resolved}.bmp and/or ${resolved}.ini`);
    }

    this.extracted.add(resolved);
  }

  /**
   * Parse INI file and return map metadata
   */
  async getMapMetadata(mapName: string): Promise<MapMetadata> {
    const resolved = this.resolveMapName(mapName);
    const iniPath = path.join(this.cacheRoot, 'Maps', resolved, `${resolved}.ini`);

    if (!fs.existsSync(iniPath)) {
      throw new Error(`INI file not found: ${iniPath}`);
    }

    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    return this.parseINI(iniContent, resolved);
  }

  /**
   * Get absolute path to BMP file
   */
  getBmpFilePath(mapName: string): string {
    const resolved = this.resolveMapName(mapName);
    return path.join(this.cacheRoot, 'Maps', resolved, `${resolved}.bmp`);
  }

  /**
   * Graceful shutdown: clear in-memory state.
   */
  async shutdown(): Promise<void> {
    console.log('[MapDataService] Shutting down...');
    this.extracted.clear();
    this.nameCache.clear();
    console.log('[MapDataService] Shutdown complete');
  }

  /**
   * Parse INI file content
   */
  private parseINI(content: string, mapName: string): MapMetadata {
    const lines = content.split('\n').map(l => l.trim());

    const metadata: MapMetadata = {
      name: mapName,
      width: 2000,
      height: 2000,
      groundHref: '',
      terrainType: 'Earth',
      towns: [],
      clusters: []
    };

    let currentSection = '';
    const towns: Map<number, Partial<MapTownInfo>> = new Map();

    for (const line of lines) {
      // Skip empty lines and comments
      if (!line || line.startsWith('#') || line.startsWith(';')) {
        continue;
      }

      // Section headers
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1);
        continue;
      }

      // Parse key=value pairs
      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) {
        continue;
      }

      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();

      if (currentSection === 'General') {
        if (key === 'Name') metadata.name = value;
        else if (key === 'Width') metadata.width = parseInt(value, 10);
        else if (key === 'Height') metadata.height = parseInt(value, 10);
      }
      else if (currentSection === 'Ground') {
        if (key === 'href') metadata.groundHref = value;
        else if (key === 'TerrainType') metadata.terrainType = value;
      }
      else if (currentSection === 'Clusters') {
        // Cluster0 = Moab, Cluster1 = Dissidents, ...
        const match = key.match(/^Cluster(\d+)$/);
        if (match) {
          metadata.clusters.push(value);
        }
      }
      else if (currentSection === 'Towns') {
        // TownName0 = Sparta, TownCluster0 = PGI, TownX0 = 994, TownY0 = 493
        const nameMatch = key.match(/^TownName(\d+)$/);
        const clusterMatch = key.match(/^TownCluster(\d+)$/);
        const xMatch = key.match(/^TownX(\d+)$/);
        const yMatch = key.match(/^TownY(\d+)$/);

        if (nameMatch) {
          const index = parseInt(nameMatch[1], 10);
          if (!towns.has(index)) towns.set(index, {});
          towns.get(index)!.name = value;
        } else if (clusterMatch) {
          const index = parseInt(clusterMatch[1], 10);
          if (!towns.has(index)) towns.set(index, {});
          towns.get(index)!.cluster = value;
        } else if (xMatch) {
          const index = parseInt(xMatch[1], 10);
          if (!towns.has(index)) towns.set(index, {});
          towns.get(index)!.x = parseInt(value, 10);
        } else if (yMatch) {
          const index = parseInt(yMatch[1], 10);
          if (!towns.has(index)) towns.set(index, {});
          towns.get(index)!.y = parseInt(value, 10);
        }
      }
    }

    // Convert towns map to array
    for (const town of towns.values()) {
      if (town.name && town.cluster !== undefined && town.x !== undefined && town.y !== undefined) {
        metadata.towns.push({
          name: town.name,
          cluster: town.cluster,
          x: town.x,
          y: town.y
        });
      }
    }

    return metadata;
  }
}
