/**
 * generate-chunks.ts — CLI: sync assets + generate server-side terrain chunks.
 *
 * Usage:
 *   node dist/server/generate-chunks.js                         # sync + all maps
 *   node dist/server/generate-chunks.js --skip-sync             # all maps, no sync
 *   node dist/server/generate-chunks.js --map Shamba            # sync + one map
 *   node dist/server/generate-chunks.js --skip-sync --map Shamba --map Zorcon
 *
 * npm scripts:
 *   npm run cache:all     → full sync + generate all maps
 *   npm run cache:chunks  → generate all maps (assets already synced)
 */

import { UpdateService } from './update-service';
import { TextureExtractor } from './texture-extractor';
import { MapDataService } from './map-data-service';
import { TerrainChunkRenderer } from './terrain-chunk-renderer';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipSync = args.includes('--skip-sync');

  // Collect --map <FolderName> arguments (may appear multiple times)
  const targetMaps: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--map' && args[i + 1]) {
      targetMaps.push(args[++i]);
    }
  }

  const stepCount = skipSync ? 3 : 4;
  let step = 1;

  if (!skipSync) {
    console.log(`[cache] Step ${step++}/${stepCount}: Syncing assets from update server...`);
    const update = new UpdateService();
    await update.initialize();
    console.log('[cache] Asset sync complete.');
  }

  console.log(`[cache] Step ${step++}/${stepCount}: Extracting terrain textures...`);
  const textures = new TextureExtractor();
  await textures.initialize();
  console.log('[cache] Texture extraction complete.');

  console.log(`[cache] Step ${step++}/${stepCount}: Loading map data...`);
  const mapData = new MapDataService();
  await mapData.initialize();
  console.log('[cache] Map data ready.');

  const mapsDesc = targetMaps.length > 0 ? targetMaps.join(', ') : 'all maps';
  console.log(`[cache] Step ${step++}/${stepCount}: Generating chunks for ${mapsDesc}...`);

  const renderer = new TerrainChunkRenderer();
  // Load atlases only — preGenerateAllChunks() drives generation manually below
  await renderer.initializeAtlases();
  await renderer.preGenerateAllChunks(targetMaps.length > 0 ? targetMaps : undefined);

  console.log('[cache] All done.');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('[cache] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
