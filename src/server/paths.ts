/**
 * Platform-aware path resolution for the gateway server.
 *
 * In standard Node.js / Docker mode, paths resolve relative to the compiled
 * `dist/server/` directory (i.e., `__dirname/../../{dir}`).
 *
 * In Electron mode:
 *  - Writable directories (cache, webclient-cache) → `app.getPath('userData')`
 *  - Read-only assets (public/) → `process.resourcesPath` (the `resources/` folder
 *    where electron-builder places extraResources)
 *
 * Detection: `process.versions.electron` is set when running inside Electron.
 */
import * as path from 'path';

const IS_ELECTRON = typeof process !== 'undefined'
  && process.versions != null
  && (process.versions as Record<string, string | undefined>).electron != null;

// In Electron, the main process sets these before importing the gateway.
// Falls back to __dirname-relative paths when not set.
let electronUserDataPath: string | null = null;
let electronResourcesPath: string | null = null;

export function setElectronUserDataPath(p: string): void {
  electronUserDataPath = p;
}

export function setElectronResourcesPath(p: string): void {
  electronResourcesPath = p;
}

function projectRoot(): string {
  return path.join(__dirname, '../..');
}

export function getPublicDir(): string {
  // In packaged Electron, public/ is an extraResource at <resources>/public.
  // __dirname-based resolution would point to <install>/public (wrong).
  if (IS_ELECTRON && electronResourcesPath) {
    return path.join(electronResourcesPath, 'public');
  }
  return path.join(projectRoot(), 'public');
}

export function getCacheDir(): string {
  if (IS_ELECTRON && electronUserDataPath) {
    return path.join(electronUserDataPath, 'cache');
  }
  return path.join(projectRoot(), 'cache');
}

export function getWebclientCacheDir(): string {
  if (IS_ELECTRON && electronUserDataPath) {
    return path.join(electronUserDataPath, 'webclient-cache');
  }
  return path.join(projectRoot(), 'webclient-cache');
}
