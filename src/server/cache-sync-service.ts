/**
 * Cache Sync Service — standalone entry point for the spo-cache-sync container.
 * Downloads game assets from update.starpeaceonline.com, extracts CABs,
 * and writes a sentinel file so the gateway can detect completion.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../shared/logger';
import { toErrorMessage } from '../shared/error-utils';
import { UpdateService } from './update-service';
import { getCacheDir } from './paths';

const logger = createLogger('CacheSyncService');

const CACHE_DIR = getCacheDir();
const SENTINEL_PATH = path.join(CACHE_DIR, '.cache-sync-status.json');
const SYNC_INTERVAL_MS = Number(process.env.CACHE_SYNC_INTERVAL_MS) || 3_600_000;
const SYNC_ONCE = process.env.CACHE_SYNC_ONCE === 'true';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

interface SentinelData {
  status: string;
  timestamp: number;
  stats: { downloaded: number; updated: number; deleted: number; skipped: number; failed: number; extracted: number };
  version: number;
}

/** Write sentinel atomically (tmp + rename) to prevent partial reads by the gateway. */
function writeSentinel(stats: SentinelData['stats']): void {
  const data: SentinelData = {
    status: 'complete',
    timestamp: Date.now(),
    stats,
    version: 1,
  };
  const tmpPath = SENTINEL_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, SENTINEL_PATH);
  logger.info(`Sentinel written: ${SENTINEL_PATH}`);
}

async function runSync(service: UpdateService): Promise<void> {
  await service.syncAll();
  const stats = service.getStats();
  writeSentinel(stats);
  logger.info(`Sync complete: downloaded=${stats.downloaded}, extracted=${stats.extracted}, skipped=${stats.skipped}, failed=${stats.failed}`);
}

async function main(): Promise<void> {
  logger.info('Cache sync service starting...');
  logger.info(`Cache dir: ${CACHE_DIR}`);
  logger.info(`Sync interval: ${SYNC_INTERVAL_MS}ms, once=${SYNC_ONCE}`);

  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const service = new UpdateService();
  await service.initialize();

  const stats = service.getStats();
  writeSentinel(stats);
  logger.info(`Initial sync complete: downloaded=${stats.downloaded}, extracted=${stats.extracted}, skipped=${stats.skipped}, failed=${stats.failed}`);

  if (SYNC_ONCE) {
    logger.info('CACHE_SYNC_ONCE=true — exiting after first sync');
    process.exit(0);
  }

  // Periodic re-sync
  intervalHandle = setInterval(async () => {
    try {
      logger.info('Starting periodic re-sync...');
      await runSync(service);
    } catch (err: unknown) {
      logger.error(`Periodic sync failed: ${toErrorMessage(err)}`);
    }
  }, SYNC_INTERVAL_MS);

  logger.info(`Periodic re-sync scheduled every ${SYNC_INTERVAL_MS}ms`);
}

// Graceful shutdown
function shutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down...`);
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err: unknown) => {
  logger.error(`Cache sync service failed: ${toErrorMessage(err)}`);
  process.exit(1);
});
