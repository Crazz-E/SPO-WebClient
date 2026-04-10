/**
 * Map configuration types and interfaces
 * Shared between client and server for map data handling
 */

export interface MapMetadata {
  name: string;
  width: number;
  height: number;
  groundHref: string;
  terrainType: string;  // From INI [Ground].TerrainType, defaults to "Earth"
  towns: MapTownInfo[];
  clusters: string[];
}

export interface MapTownInfo {
  name: string;
  cluster: string;
  x: number;
  y: number;
}

export interface TerrainData {
  width: number;
  height: number;
  pixelData: Uint8Array; // 8-bit palette indices from BMP (flat array)
  paletteData: number[][]; // 8-bit palette indices as 2D array [row][col] for road system
  metadata: MapMetadata;
}

export interface MapFileData {
  metadata: MapMetadata;
  bmpUrl: string; // URL to fetch the BMP file
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TileBounds {
  minI: number;
  maxI: number;
  minJ: number;
  maxJ: number;
}

export interface ZoomConfig {
  level: number;      // 0-3
  tileWidth: number;  // 2 * u
  tileHeight: number; // u
  u: number;          // 2 << level
}

export const ZOOM_LEVELS: ZoomConfig[] = [
  { level: 0, u: 4, tileWidth: 8, tileHeight: 4 },    // 4×8
  { level: 1, u: 8, tileWidth: 16, tileHeight: 8 },   // 8×16
  { level: 2, u: 16, tileWidth: 32, tileHeight: 16 }, // 16×32 (default)
  { level: 3, u: 32, tileWidth: 64, tileHeight: 32 }  // 32×64
];

export enum Rotation {
  NORTH = 0,
  EAST = 1,
  SOUTH = 2,
  WEST = 3
}

/**
 * Season enum for terrain textures
 * Each season has different terrain appearance (snow in winter, green in summer, etc.)
 * Texture folders are organized by season: 0=Winter, 1=Spring, 2=Summer, 3=Autumn
 */
export enum Season {
  WINTER = 0,   // Hiver
  SPRING = 1,   // Printemps
  SUMMER = 2,   // Été
  AUTUMN = 3    // Automne
}

export const SEASON_NAMES: Record<Season, string> = {
  [Season.WINTER]: 'Winter',
  [Season.SPRING]: 'Spring',
  [Season.SUMMER]: 'Summer',
  [Season.AUTUMN]: 'Autumn'
};

