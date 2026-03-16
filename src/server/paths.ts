/**
 * Platform-aware path resolution for the gateway server.
 *
 * In standard Node.js / Docker mode, paths resolve relative to the compiled
 * `dist/server/` directory (i.e., `__dirname/../../{dir}`).
 *
 * In Electron mode, writable directories (cache, webclient-cache) resolve to
 * the user's app data folder (`app.getPath('userData')`) while read-only
 * assets (public/) stay within the app bundle.
 *
 * Detection: `process.versions.electron` is set when running inside Electron.
 */
import * as path from 'path';

const IS_ELECTRON = typeof process !== 'undefined'
  && process.versions != null
  && (process.versions as Record<string, string | undefined>).electron != null;

// In Electron, the main process can set this before importing the gateway.
// Falls back to __dirname-relative paths when not set.
let electronUserDataPath: string | null = null;

export function setElectronUserDataPath(p: string): void {
  electronUserDataPath = p;
}

function projectRoot(): string {
  return path.join(__dirname, '../..');
}

export function getPublicDir(): string {
  // Public dir is always relative to project root (bundled with the app)
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
