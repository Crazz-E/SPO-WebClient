/**
 * Facility Dimensions Cache Manager - Manages building dimensions from CLASSES.BIN
 * Provides backward compatibility while using new BuildingDataService
 */

import * as path from 'path';
import { createLogger } from '../shared/logger';
import { BuildingDataService, FacilityDimensions } from './building-data-service';
import { BuildingData } from '../shared/types/building-data';
import type { Service } from './service-registry';

const logger = createLogger('FacilityDimensionsCache');

// Re-export FacilityDimensions for backward compatibility
export type { FacilityDimensions };

export class FacilityDimensionsCache implements Service {
  public readonly name = 'facilities';

  private buildingService: BuildingDataService;
  private initialized: boolean = false;

  constructor() {
    this.buildingService = new BuildingDataService();
  }

  /**
   * Initialize the cache - load CLASSES.BIN
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info('[FacilityDimensionsCache] Already initialized');
      return;
    }

    try {
      logger.info('[FacilityDimensionsCache] Initializing with BuildingDataService...');

      await this.buildingService.initialize();

      this.initialized = true;
      logger.info('[FacilityDimensionsCache] Initialization complete');
      this.logCacheStats();
    } catch (error: unknown) {
      // In external cache-sync mode, CLASSES.BIN may not exist yet on first deploy.
      // The gateway starts in degraded mode and reloads once the cache service populates files.
      logger.warn('[FacilityDimensionsCache] Initialization deferred (cache not ready yet):', error);
      this.initialized = false;
    }
  }

  /**
   * Get facility dimensions by visualClass or name
   * Returns backward-compatible FacilityDimensions object
   */
  getFacility(key: string): FacilityDimensions | undefined {
    return this.buildingService.getFacility(key);
  }

  /**
   * Get building data (new format with full information)
   */
  getBuilding(visualClass: string): BuildingData | undefined {
    return this.buildingService.getBuilding(visualClass);
  }

  /**
   * Get texture filename for a visualClass
   * Handles construction, empty, and complete states automatically
   */
  getTextureFilename(visualClass: string): string | undefined {
    return this.buildingService.getTextureFilename(visualClass);
  }

  /**
   * Check if a visualClass represents a construction state
   */
  isConstructionState(visualClass: string): boolean {
    return this.buildingService.isConstructionState(visualClass);
  }

  /**
   * Check if a visualClass represents an empty residential state
   */
  isEmptyState(visualClass: string): boolean {
    return this.buildingService.isEmptyState(visualClass);
  }

  /**
   * Get all facilities (backward compatible)
   */
  getAllFacilities(): FacilityDimensions[] {
    return this.buildingService.getAllBuildings().map(b => this.buildingService.getFacility(b.visualClass)!);
  }

  /**
   * Get all buildings (new format)
   */
  getAllBuildings(): BuildingData[] {
    return this.buildingService.getAllBuildings();
  }

  /**
   * Check if cache is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the entire cache as BuildingData map
   */
  getCache(): Map<string, BuildingData> {
    return this.buildingService.getCache();
  }

  /**
   * Get all buildings as a plain object (for client preload)
   */
  getAllBuildingsAsObject(): Record<string, BuildingData> {
    return this.buildingService.getAllBuildingsAsObject();
  }

  /**
   * Get all facilities as a plain object (for client preload)
   * Returns backward-compatible FacilityDimensions objects
   *
   * Keyed by BOTH visualClass and building NAME to support:
   * - Existing buildings on map: lookup by visualClass (from ObjectsInArea)
   * - Building placement preview: lookup by name (facilityClass from BuildingInfo)
   *
   * CLASSES.BIN has entries for ALL VisualClass IDs (construction + complete + variants),
   * so no intermediate pre-population is needed.
   */
  getAllFacilitiesAsObject(): Record<string, FacilityDimensions> {
    const result: Record<string, FacilityDimensions> = {};
    const buildings = this.buildingService.getAllBuildings();

    for (const building of buildings) {
      const facility = this.buildingService.getFacility(building.visualClass);
      if (facility) {
        // Key by visualClass (for existing buildings on map)
        result[building.visualClass] = facility;
        // Also key by NAME (for building placement preview)
        result[building.name] = facility;
      }
    }

    return result;
  }

  /**
   * Log cache statistics
   */
  private logCacheStats(): void {
    const stats = this.buildingService.getStats();
    logger.info(`[FacilityDimensionsCache] Cache Statistics:`);
    logger.info(`  Total: ${stats.total} buildings`);
    logger.info(`  Clusters: ${JSON.stringify(stats.clusters)}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number; clusters?: Record<string, number>; categories?: Record<string, number> } {
    return this.buildingService.getStats();
  }

  /**
   * Reload the cache from disk (called by CacheWatcher when cache-sync updates files).
   * Re-instantiates BuildingDataService so it re-reads CLASSES.BIN.
   */
  async reload(): Promise<void> {
    logger.info('[FacilityDimensionsCache] Reloading from disk...');
    this.buildingService = new BuildingDataService();
    await this.buildingService.initialize();
    this.initialized = true;
    logger.info('[FacilityDimensionsCache] Reload complete');
    this.logCacheStats();
  }

  /**
   * Graceful shutdown: delegate to BuildingDataService.
   */
  async shutdown(): Promise<void> {
    logger.info('[FacilityDimensionsCache] Shutting down...');
    await this.buildingService.shutdown();
    this.initialized = false;
    logger.info('[FacilityDimensionsCache] Shutdown complete');
  }

  /**
   * Service interface: Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized && this.buildingService.isHealthy();
  }
}
