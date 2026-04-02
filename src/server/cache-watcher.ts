/**
 * CacheWatcher — watches a sentinel file written by the cache-sync service.
 * When the sentinel changes, emits 'cache-updated' so the gateway can reload indexes.
 */

import * as fs from 'fs';
import { EventEmitter } from 'events';
import { createLogger } from '../shared/logger';
import { toErrorMessage } from '../shared/error-utils';

const logger = createLogger('CacheWatcher');

export interface CacheSyncStatus {
  status: string;
  timestamp: number;
  stats: {
    downloaded: number;
    updated: number;
    extracted: number;
    skipped: number;
    failed: number;
  };
  version: number;
}

export class CacheWatcher extends EventEmitter {
  private readonly sentinelPath: string;
  private readonly pollIntervalMs: number;
  private lastTimestamp: number = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private watching: boolean = false;

  constructor(sentinelPath: string, pollIntervalMs: number = 5000) {
    super();
    this.sentinelPath = sentinelPath;
    this.pollIntervalMs = pollIntervalMs;
  }

  /** Begin watching the sentinel file for changes. */
  start(): void {
    if (this.watching) return;
    this.watching = true;

    // Read initial timestamp so we only fire on actual changes
    this.readSentinelTimestamp();

    fs.watchFile(this.sentinelPath, { interval: this.pollIntervalMs }, () => {
      this.onFileChange();
    });

    logger.info(`Watching sentinel: ${this.sentinelPath} (poll=${this.pollIntervalMs}ms)`);
  }

  /** Stop watching and clean up. */
  stop(): void {
    if (!this.watching) return;
    this.watching = false;
    fs.unwatchFile(this.sentinelPath);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    logger.info('Cache watcher stopped');
  }

  private onFileChange(): void {
    // Debounce: only fire once within 1 second
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.checkAndEmit();
    }, 1000);
  }

  private checkAndEmit(): void {
    try {
      if (!fs.existsSync(this.sentinelPath)) return;

      const raw = fs.readFileSync(this.sentinelPath, 'utf-8');
      const data = JSON.parse(raw) as CacheSyncStatus;

      if (data.timestamp && data.timestamp !== this.lastTimestamp) {
        this.lastTimestamp = data.timestamp;
        this.emit('cache-updated', data);
        logger.info(`Cache sync detected: ts=${data.timestamp}, downloaded=${data.stats?.downloaded ?? 0}, extracted=${data.stats?.extracted ?? 0}`);
      }
    } catch (err: unknown) {
      // Partial write or missing file — skip this cycle
      logger.debug(`Sentinel read skipped: ${toErrorMessage(err)}`);
    }
  }

  private readSentinelTimestamp(): void {
    try {
      if (!fs.existsSync(this.sentinelPath)) return;
      const raw = fs.readFileSync(this.sentinelPath, 'utf-8');
      const data = JSON.parse(raw) as CacheSyncStatus;
      if (data.timestamp) {
        this.lastTimestamp = data.timestamp;
      }
    } catch {
      // File doesn't exist yet or is invalid — will be created by cache-sync
    }
  }
}
