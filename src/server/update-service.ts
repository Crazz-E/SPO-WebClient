/**
 * Update Service - Automatic synchronization with update.starpeaceonline.com
 * Dynamically discovers and mirrors the complete server structure without hardcoded lists
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../shared/logger';
import { UPDATE_SERVER, TIMEOUTS } from '../shared/constants';
import { extractCabArchive, isCabExtractorAvailable } from './cab-extractor';
import { getCacheDir } from './paths';

const logger = createLogger('UpdateService');

interface RemoteItem {
  type: 'file' | 'directory';
  name: string;
  path: string; // Relative path from cache root (e.g., "BuildingClasses/classes.cab")
  url: string;  // Full remote URL
}

interface SyncStats {
  downloaded: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
  extracted: number;
}

interface CabMetadata {
  [cabPath: string]: {
    extractedFiles: string[];
    cabModifiedTime: number;
    corrupted?: boolean; // Mark CABs that failed extraction
  };
}

import type { Service } from './service-registry';

export class UpdateService implements Service {
  public readonly name = 'update';

  private readonly UPDATE_SERVER_BASE = UPDATE_SERVER.CACHE_URL;
  private readonly CACHE_ROOT: string;
  private readonly CAB_METADATA_FILE: string;
  private stats: SyncStats = { downloaded: 0, updated: 0, deleted: 0, skipped: 0, failed: 0, extracted: 0 };
  private cabMetadata: CabMetadata = {};
  private initialized: boolean = false;

  /**
   * Files to exclude from synchronization (local customizations)
   */
  private readonly EXCLUDED_FILES = [
    '.cab-metadata.json'                 // CAB extraction tracking metadata
  ];

  /**
   * Files/patterns to ignore when parsing directory listings
   */
  private readonly IGNORED_PATTERNS = [
    'index.sync',    // Server index files
    'cindex.bat',    // Server batch scripts
    'pack.bat',      // Server batch scripts
    'web.config',    // IIS server config (not a game asset)
    '..',            // Parent directory link
    '.'              // Current directory link
  ];

  constructor(cacheRoot?: string) {
    // Default to cache/ directory in project root
    // This mirrors the exact structure from update.starpeaceonline.com/five/client/cache/
    this.CACHE_ROOT = cacheRoot || getCacheDir();
    this.CAB_METADATA_FILE = path.join(this.CACHE_ROOT, '.cab-metadata.json');
    this.loadCabMetadata();
  }

  /**
   * Service interface: Initialize the service
   * Calls syncAll() to synchronize with update server
   */
  async initialize(reportProgress?: (subStep: string) => void): Promise<void> {
    if (this.initialized) {
      logger.info('[UpdateService] Already initialized');
      return;
    }

    // Dev shortcut: skip remote sync when cache already has content
    if (process.env.CACHE_SKIP_SYNC === 'true') {
      const hasContent = fs.existsSync(this.CACHE_ROOT)
        && fs.readdirSync(this.CACHE_ROOT).length > 0;
      if (hasContent) {
        logger.info('[UpdateService] CACHE_SKIP_SYNC=true and cache exists — skipping remote sync');
        this.initialized = true;
        return;
      }
      logger.info('[UpdateService] CACHE_SKIP_SYNC=true but cache is empty — syncing anyway');
    }

    // Verify 7zip-min is available for CAB extraction (should always be true since it's bundled)
    const cabAvailable = await isCabExtractorAvailable();
    if (!cabAvailable) {
      logger.error('[UpdateService] 7zip-min not available. This should not happen.');
      logger.error('  Try: npm install 7zip-min');
      throw new Error('CAB extraction not available. Install 7zip-min: npm install 7zip-min');
    }

    await this.syncAll(reportProgress);
    this.initialized = true;
  }

  /**
   * Service interface: Check if service is healthy
   */
  isHealthy(): boolean {
    return this.initialized && fs.existsSync(this.CACHE_ROOT);
  }

  /**
   * Load CAB extraction metadata from disk
   */
  private loadCabMetadata(): void {
    try {
      if (fs.existsSync(this.CAB_METADATA_FILE)) {
        const data = fs.readFileSync(this.CAB_METADATA_FILE, 'utf8');
        this.cabMetadata = JSON.parse(data);
      }
    } catch (error: unknown) {
      logger.warn('[UpdateService] Failed to load CAB metadata, starting fresh:', error);
      this.cabMetadata = {};
    }
  }

  /**
   * Save CAB extraction metadata to disk
   */
  private saveCabMetadata(): void {
    try {
      fs.writeFileSync(this.CAB_METADATA_FILE, JSON.stringify(this.cabMetadata, null, 2), 'utf8');
    } catch (error: unknown) {
      logger.error('[UpdateService] Failed to save CAB metadata:', error);
    }
  }

  /**
   * Extract a CAB file using the 7zip-min package
   * 7zip-min includes precompiled 7za binaries (no external tools required)
   */
  private async extractCabFile(cabPath: string): Promise<string[]> {
    const cabDir = path.dirname(cabPath);
    const cabRelative = path.relative(this.CACHE_ROOT, cabPath);

    try {
      logger.info(`[UpdateService] Extracting CAB: ${cabRelative}`);

      // Add timeout protection (30 seconds max)
      const extractionPromise = extractCabArchive(cabPath, cabDir);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Extraction timeout after 30 seconds')), 30000)
      );

      const result = await Promise.race([extractionPromise, timeoutPromise]);

      if (!result.success) {
        for (const error of result.errors) {
          logger.error(`[UpdateService] CAB extraction error: ${error}`);
        }
        this.stats.failed++;

        // Mark as corrupted in metadata
        this.cabMetadata[cabRelative] = {
          extractedFiles: [],
          cabModifiedTime: Date.now(),
          corrupted: true
        };
        this.saveCabMetadata();

        return [];
      }

      // Convert extracted file names to relative paths from CACHE_ROOT
      const extractedFiles: string[] = [];
      for (const fileName of result.extractedFiles) {
        const fullPath = path.join(cabDir, fileName);
        const relativePath = path.relative(this.CACHE_ROOT, fullPath).replace(/\\/g, '/');
        extractedFiles.push(relativePath);
      }

      this.stats.extracted++;
      logger.info(`[UpdateService] Extracted ${extractedFiles.length} files from CAB`);

      return extractedFiles;
    } catch (error: unknown) {
      this.stats.failed++;
      logger.error(`[UpdateService] Failed to extract CAB ${cabRelative}:`, error);

      // Mark as corrupted to skip on future runs
      this.cabMetadata[cabRelative] = {
        extractedFiles: [],
        cabModifiedTime: Date.now(),
        corrupted: true
      };
      this.saveCabMetadata();

      return [];
    }
  }

  /**
   * Clean up files extracted from a previous CAB version
   */
  private cleanupOldCabExtraction(cabRelativePath: string): void {
    const metadata = this.cabMetadata[cabRelativePath];
    if (!metadata || !metadata.extractedFiles) {
      return;
    }

    logger.info(`[UpdateService] Cleaning up ${metadata.extractedFiles.length} files from old CAB extraction`);

    for (const extractedFile of metadata.extractedFiles) {
      const fullPath = path.join(this.CACHE_ROOT, extractedFile);
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          logger.info(`[UpdateService] 🗑 Deleted old extraction: ${extractedFile}`);
          this.stats.deleted++;
        }
      } catch (error: unknown) {
        logger.error(`[UpdateService] Failed to delete old extraction ${extractedFile}:`, error);
      }
    }
  }

  /**
   * Parse HTML directory listing to extract files and subdirectories
   */
  private parseDirectoryListing(html: string): { files: string[], directories: string[] } {
    const files: string[] = [];
    const directories: string[] = [];

    // Match: <A HREF="/path/filename.ext">filename.ext</A>
    const fileRegex = /<A HREF="[^"]+\/([^/"]+\.[^/"]+)">([^<]+)<\/A>/gi;
    // Match: <A HREF="/path/dirname/">dirname</A>
    const dirRegex = /<A HREF="[^"]+\/([^/"]+)\/">([^<]+)<\/A>/gi;

    let match;
    while ((match = fileRegex.exec(html)) !== null) {
      const filename = match[1];
      if (!this.IGNORED_PATTERNS.includes(filename)) {
        files.push(filename);
      }
    }

    while ((match = dirRegex.exec(html)) !== null) {
      const dirname = match[1];
      const linkText = match[2];

      // Skip parent directory links and ignored patterns
      if (this.IGNORED_PATTERNS.includes(dirname) ||
          linkText.includes('[To Parent Directory]') ||
          linkText.includes('Parent Directory')) {
        continue;
      }

      directories.push(dirname);
    }

    return { files, directories };
  }

  /**
   * Recursively discover all files and directories on remote server
   */
  private async discoverRemoteStructure(relativePath: string = '', depth: number = 0): Promise<RemoteItem[]> {
    const MAX_DEPTH = 10; // Safety limit to prevent infinite recursion
    if (depth > MAX_DEPTH) {
      logger.warn(`[UpdateService] Maximum recursion depth reached at ${relativePath}`);
      return [];
    }

    const items: RemoteItem[] = [];
    const remoteUrl = relativePath
      ? `${this.UPDATE_SERVER_BASE}/${relativePath}`
      : this.UPDATE_SERVER_BASE;

    try {
      const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(TIMEOUTS.FETCH) });
      if (!response.ok) {
        logger.warn(`[UpdateService] Cannot access ${relativePath || 'root'}: HTTP ${response.status}`);
        return items;
      }

      const html = await response.text();
      const { files, directories } = this.parseDirectoryListing(html);

      // Add files
      for (const file of files) {
        const itemPath = relativePath ? `${relativePath}/${file}` : file;
        items.push({
          type: 'file',
          name: file,
          path: itemPath,
          url: `${this.UPDATE_SERVER_BASE}/${itemPath}`
        });
      }

      // Add directories and recurse
      for (const dir of directories) {
        const itemPath = relativePath ? `${relativePath}/${dir}` : dir;
        items.push({
          type: 'directory',
          name: dir,
          path: itemPath,
          url: `${this.UPDATE_SERVER_BASE}/${itemPath}`
        });

        // Recursively discover subdirectory contents
        const subItems = await this.discoverRemoteStructure(itemPath, depth + 1);
        items.push(...subItems);
      }

      if (depth === 0) {
        logger.info(`[UpdateService] Discovered ${items.filter(i => i.type === 'file').length} files and ${items.filter(i => i.type === 'directory').length} directories on remote server`);
      }

    } catch (error: unknown) {
      logger.error(`[UpdateService] Error discovering ${relativePath || 'root'}:`, error);
    }

    return items;
  }

  /**
   * Build inventory of local cache files
   */
  private buildLocalInventory(dir: string = this.CACHE_ROOT, baseDir: string = this.CACHE_ROOT): string[] {
    const items: string[] = [];

    if (!fs.existsSync(dir)) {
      return items;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        items.push(relativePath);
        // Recurse into subdirectory
        const subItems = this.buildLocalInventory(fullPath, baseDir);
        items.push(...subItems);
      } else if (entry.isFile()) {
        items.push(relativePath);
      }
    }

    return items;
  }

  /**
   * Download a single file
   */
  private async downloadFile(item: RemoteItem): Promise<boolean> {
    const localPath = path.join(this.CACHE_ROOT, item.path);
    const isCabFile = item.path.toLowerCase().endsWith('.cab');

    try {
      logger.info(`[UpdateService] Downloading: ${item.path}`);

      // Check if CAB file needs old extraction cleanup
      if (isCabFile && this.cabMetadata[item.path]) {
        logger.info(`[UpdateService] CAB file updated, cleaning up old extraction first`);
        this.cleanupOldCabExtraction(item.path);
      }

      const response = await fetch(item.url, { signal: AbortSignal.timeout(TIMEOUTS.FILE_DOWNLOAD) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Ensure directory exists
      const dirPath = path.dirname(localPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Write file
      fs.writeFileSync(localPath, buffer);

      // Preserve remote Last-Modified timestamp so isFileChanged() won't re-download
      const lastModified = response.headers.get('last-modified');
      if (lastModified) {
        const remoteDate = new Date(lastModified);
        if (!isNaN(remoteDate.getTime())) {
          fs.utimesSync(localPath, remoteDate, remoteDate);
        }
      }

      this.stats.downloaded++;
      logger.info(`[UpdateService] ✓ Downloaded: ${item.path} (${buffer.length} bytes)`);

      // Auto-extract CAB files
      if (isCabFile) {
        const extractedFiles = await this.extractCabFile(localPath);

        // Update metadata
        const stats = fs.statSync(localPath);
        this.cabMetadata[item.path] = {
          extractedFiles: extractedFiles,
          cabModifiedTime: stats.mtimeMs
        };
      }

      return true;
    } catch (error: unknown) {
      this.stats.failed++;
      logger.error(`[UpdateService] ✗ Failed to download ${item.path}:`, error);
      return false;
    }
  }

  /**
   * Delete a local file or directory
   */
  private deleteLocal(relativePath: string): boolean {
    const localPath = path.join(this.CACHE_ROOT, relativePath);

    try {
      if (!fs.existsSync(localPath)) {
        return true; // Already deleted
      }

      const stats = fs.statSync(localPath);
      if (stats.isDirectory()) {
        fs.rmSync(localPath, { recursive: true, force: true });
        logger.info(`[UpdateService] 🗑 Deleted directory: ${relativePath}`);
      } else {
        fs.unlinkSync(localPath);
        logger.info(`[UpdateService] 🗑 Deleted file: ${relativePath}`);
      }

      this.stats.deleted++;
      return true;
    } catch (error: unknown) {
      logger.error(`[UpdateService] Failed to delete ${relativePath}:`, error);
      return false;
    }
  }

  /**
   * Check if a path should be excluded from sync
   */
  private isExcluded(relativePath: string): boolean {
    return this.EXCLUDED_FILES.some(excluded =>
      relativePath === excluded || relativePath.startsWith(excluded + '/')
    );
  }

  /**
   * Check if a remote file has changed compared to the local copy.
   * Uses HTTP HEAD to compare Content-Length and Last-Modified headers.
   */
  private async isFileChanged(item: RemoteItem, localPath: string): Promise<boolean> {
    try {
      const localStat = fs.statSync(localPath);
      const headResponse = await fetch(item.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(TIMEOUTS.FETCH),
      });
      if (!headResponse.ok) return false;

      const remoteSize = headResponse.headers.get('content-length');
      if (remoteSize !== null && parseInt(remoteSize, 10) !== localStat.size) {
        logger.info(`[UpdateService] Size changed: ${item.path} (local=${localStat.size}, remote=${remoteSize})`);
        return true;
      }

      const remoteModified = headResponse.headers.get('last-modified');
      if (remoteModified) {
        const remoteTime = new Date(remoteModified).getTime();
        if (!isNaN(remoteTime) && remoteTime > localStat.mtimeMs) {
          logger.info(`[UpdateService] Modified time changed: ${item.path}`);
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if a file is an extracted CAB file (should not be deleted as orphan)
   */
  private isExtractedCabFile(relativePath: string): boolean {
    for (const cabPath in this.cabMetadata) {
      const metadata = this.cabMetadata[cabPath];
      if (metadata.extractedFiles.includes(relativePath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a file is a derived file (e.g., pre-baked PNG from a CAB-extracted BMP).
   * These files are generated locally by the texture pipeline and should not be deleted.
   */
  private isDerivedFile(relativePath: string): boolean {
    // Pre-baked alpha PNGs: if a .png has a corresponding .bmp that is a CAB-extracted file
    if (relativePath.toLowerCase().endsWith('.png')) {
      const bmpPath = relativePath.replace(/\.png$/i, '.bmp');
      if (this.isExtractedCabFile(bmpPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Synchronize cache with remote server
   */
  async syncAll(reportProgress?: (subStep: string) => void): Promise<void> {
    logger.info('[UpdateService] Starting automatic synchronization...');
    this.stats = { downloaded: 0, updated: 0, deleted: 0, skipped: 0, failed: 0, extracted: 0 };

    const startTime = Date.now();

    // Ensure cache directory exists
    if (!fs.existsSync(this.CACHE_ROOT)) {
      fs.mkdirSync(this.CACHE_ROOT, { recursive: true });
      logger.info(`[UpdateService] Created cache directory: ${this.CACHE_ROOT}`);
    }

    // Step 1: Discover remote structure
    logger.info('[UpdateService] Step 1/4: Discovering remote structure...');
    reportProgress?.('Discovering remote files (1/4)');
    const remoteItems = await this.discoverRemoteStructure();
    const remoteFiles = remoteItems.filter(i => i.type === 'file');
    const remoteDirs = remoteItems.filter(i => i.type === 'directory');

    // Step 2: Build local inventory
    logger.info('[UpdateService] Step 2/4: Scanning local cache...');
    reportProgress?.('Scanning local cache (2/4)');
    const localItems = this.buildLocalInventory();
    const localFiles = localItems.filter(p => {
      const fullPath = path.join(this.CACHE_ROOT, p);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile();
    });
    const localDirs = localItems.filter(p => {
      const fullPath = path.join(this.CACHE_ROOT, p);
      return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
    });

    logger.info(`[UpdateService] Remote: ${remoteFiles.length} files, ${remoteDirs.length} directories`);
    logger.info(`[UpdateService] Local: ${localFiles.length} files, ${localDirs.length} directories`);

    // Step 3: Download new & updated files and extract CAB files
    logger.info('[UpdateService] Step 3/4: Downloading new & updated files and extracting CABs...');
    reportProgress?.('Downloading & extracting files (3/4)');
    const remoteFilePaths = new Set(remoteFiles.map(f => f.path));

    for (const remoteFile of remoteFiles) {
      if (this.isExcluded(remoteFile.path)) {
        logger.info(`[UpdateService] ⊘ Excluded: ${remoteFile.path}`);
        continue;
      }

      const localPath = path.join(this.CACHE_ROOT, remoteFile.path);
      const isCabFile = remoteFile.path.toLowerCase().endsWith('.cab');

      if (fs.existsSync(localPath)) {
        // Check if file has changed on remote (size or modification time)
        const changed = await this.isFileChanged(remoteFile, localPath);
        if (changed) {
          logger.info(`[UpdateService] ↻ File changed on remote, re-downloading: ${remoteFile.path}`);
          await this.downloadFile(remoteFile);
          this.stats.updated++;
          continue;
        }

        this.stats.skipped++;

        // Check if existing CAB file needs extraction (first run or updated)
        if (isCabFile) {
          const stats = fs.statSync(localPath);
          const metadata = this.cabMetadata[remoteFile.path];

          // Skip corrupted CABs
          if (metadata?.corrupted) {
            logger.warn(`[UpdateService] ⚠ Skipping corrupted CAB: ${remoteFile.path}`);
            continue;
          }

          // Check if extracted files actually exist
          let needsExtraction = !metadata || metadata.cabModifiedTime !== stats.mtimeMs;

          if (!needsExtraction && metadata) {
            // Verify at least one extracted file exists
            const hasExtractedFiles = metadata.extractedFiles.some(file => {
              const fullPath = path.join(this.CACHE_ROOT, file);
              return fs.existsSync(fullPath);
            });

            if (!hasExtractedFiles) {
              logger.info(`[UpdateService] ⚠ CAB metadata exists but extracted files are missing: ${remoteFile.path}`);
              needsExtraction = true;
            }
          }

          // Extract if needed
          if (needsExtraction) {
            logger.info(`[UpdateService] CAB exists but needs extraction: ${remoteFile.path}`);

            // Clean up old extraction if it exists
            if (metadata) {
              this.cleanupOldCabExtraction(remoteFile.path);
            }

            // Extract CAB
            const extractedFiles = await this.extractCabFile(localPath);

            // Only update metadata if extraction succeeded
            if (extractedFiles.length > 0) {
              this.cabMetadata[remoteFile.path] = {
                extractedFiles: extractedFiles,
                cabModifiedTime: stats.mtimeMs
              };
            }
          }
        }
      } else {
        // File missing, download
        await this.downloadFile(remoteFile);
      }
    }

    // Step 4: Remove orphaned files (files that exist locally but not on remote)
    logger.info('[UpdateService] Step 4/4: Removing orphaned files...');
    reportProgress?.('Cleaning up orphaned files (4/4)');

    for (const localFile of localFiles) {
      if (this.isExcluded(localFile)) {
        continue;
      }

      // Don't delete files that were extracted from CAB files
      if (this.isExtractedCabFile(localFile)) {
        continue;
      }

      // Don't delete derived files (e.g., pre-baked PNGs from BMP textures)
      if (this.isDerivedFile(localFile)) {
        continue;
      }

      if (!remoteFilePaths.has(localFile)) {
        logger.info(`[UpdateService] Found orphaned file: ${localFile}`);
        this.deleteLocal(localFile);
      }
    }

    // Remove empty directories
    const remoteDirPaths = new Set(remoteDirs.map(d => d.path));
    // Sort by depth (deepest first) to delete child directories before parents
    const sortedLocalDirs = localDirs.sort((a, b) => {
      const depthA = a.split('/').length;
      const depthB = b.split('/').length;
      return depthB - depthA;
    });

    for (const localDir of sortedLocalDirs) {
      if (this.isExcluded(localDir)) {
        continue;
      }

      const fullPath = path.join(this.CACHE_ROOT, localDir);
      if (!remoteDirPaths.has(localDir) && fs.existsSync(fullPath)) {
        // Check if directory is empty
        const entries = fs.readdirSync(fullPath);
        if (entries.length === 0) {
          logger.info(`[UpdateService] Found empty orphaned directory: ${localDir}`);
          this.deleteLocal(localDir);
        }
      }
    }

    // Save CAB metadata
    this.saveCabMetadata();

    const duration = Date.now() - startTime;
    logger.info(`[UpdateService] Synchronization complete in ${duration}ms`);
    logger.info(`[UpdateService] Downloaded: ${this.stats.downloaded} | Updated: ${this.stats.updated} | Extracted: ${this.stats.extracted} | Deleted: ${this.stats.deleted} | Skipped: ${this.stats.skipped} | Failed: ${this.stats.failed}`);
  }

  /**
   * Graceful shutdown: clear in-memory state.
   */
  async shutdown(): Promise<void> {
    logger.info('[UpdateService] Shutting down...');
    this.cabMetadata = {};
    this.initialized = false;
    logger.info('[UpdateService] Shutdown complete');
  }

  /**
   * Get statistics about the last sync operation
   */
  getStats(): SyncStats {
    return { ...this.stats };
  }
}
