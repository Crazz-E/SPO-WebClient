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
 *
 * `SPO_CACHE_DIR` overrides the asset cache alone, for a caller that shares one mirror
 * between several checkouts of this repo on the same machine (the bench worker does).
 * It is read on every call rather than captured at load time, so a test can set it and
 * a process can be configured after the module is imported.
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

/**
 * Where the mirror of `update.starpeaceonline.com/five/client/cache/` lives.
 *
 * The default is `<checkout>/cache`, which is what Docker and a plain `npm start` want.
 * `SPO_CACHE_DIR` moves it somewhere shared: those ~570 files are the same bytes in
 * every checkout — a mirror of a remote tree, not build output — so re-downloading them
 * per worktree costs the network and the bench's exclusive time for nothing.
 *
 * Electron keeps its `userData` answer whatever the environment says: the packaged app
 * inherits the user's shell environment, and a stray variable must not send an installed
 * client's cache into a developer's directory.
 */
export function getCacheDir(): string {
  if (IS_ELECTRON && electronUserDataPath) {
    return path.join(electronUserDataPath, 'cache');
  }
  const override = process.env.SPO_CACHE_DIR;
  if (override) return path.resolve(override);
  return path.join(projectRoot(), 'cache');
}

export function getWebclientCacheDir(): string {
  if (IS_ELECTRON && electronUserDataPath) {
    return path.join(electronUserDataPath, 'webclient-cache');
  }
  return path.join(projectRoot(), 'webclient-cache');
}
