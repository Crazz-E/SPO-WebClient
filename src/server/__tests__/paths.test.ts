/**
 * Regression tests for platform-aware path resolution.
 *
 * Covers three modes:
 *  1. Dev mode (no Electron) — paths resolve relative to __dirname
 *  2. Electron + userDataPath — writable dirs redirect to app data
 *  3. Electron + resourcesPath — public dir resolves to resources/public
 *
 * Uses jest.isolateModules() to reload paths.ts with fresh state per test,
 * since IS_ELECTRON is computed at module-load time from process.versions.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as path from 'path';

// Helpers to load paths.ts in isolation with controlled process.versions
function loadPathsModule(electronVersion?: string) {
  // Save original
  const origElectron = (process.versions as Record<string, string | undefined>).electron;

  if (electronVersion) {
    (process.versions as Record<string, string | undefined>).electron = electronVersion;
  } else {
    delete (process.versions as Record<string, string | undefined>).electron;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../paths') as typeof import('../paths');

  // Restore immediately so other tests are unaffected
  if (origElectron !== undefined) {
    (process.versions as Record<string, string | undefined>).electron = origElectron;
  } else {
    delete (process.versions as Record<string, string | undefined>).electron;
  }

  return mod;
}

describe('paths — dev mode (no Electron)', () => {
  let paths: ReturnType<typeof loadPathsModule>;

  beforeEach(() => {
    jest.resetModules();
    paths = loadPathsModule(/* no electron */);
  });

  it('getPublicDir() ends with /public', () => {
    const result = paths.getPublicDir();
    expect(path.basename(result)).toBe('public');
  });

  it('getCacheDir() ends with /cache', () => {
    const result = paths.getCacheDir();
    expect(path.basename(result)).toBe('cache');
  });

  it('getWebclientCacheDir() ends with /webclient-cache', () => {
    const result = paths.getWebclientCacheDir();
    expect(path.basename(result)).toBe('webclient-cache');
  });

  it('all paths are absolute', () => {
    expect(path.isAbsolute(paths.getPublicDir())).toBe(true);
    expect(path.isAbsolute(paths.getCacheDir())).toBe(true);
    expect(path.isAbsolute(paths.getWebclientCacheDir())).toBe(true);
  });

  it('all paths resolve relative to project root (two levels above dist/server)', () => {
    // __dirname for paths.ts compiled output = dist/server/
    // projectRoot = dist/server/../../ = project root
    const publicDir = paths.getPublicDir();
    const cacheDir = paths.getCacheDir();
    // Both should share the same parent (the project root)
    expect(path.dirname(publicDir)).toBe(path.dirname(cacheDir));
  });
});

describe('paths — Electron mode with userDataPath', () => {
  let paths: ReturnType<typeof loadPathsModule>;
  const mockUserData = path.join('C:', 'Users', 'TestUser', 'AppData', 'Local', 'Starpeace Online');

  beforeEach(() => {
    jest.resetModules();
    paths = loadPathsModule('35.0.1');
    paths.setElectronUserDataPath(mockUserData);
  });

  it('getCacheDir() resolves under userDataPath', () => {
    expect(paths.getCacheDir()).toBe(path.join(mockUserData, 'cache'));
  });

  it('getWebclientCacheDir() resolves under userDataPath', () => {
    expect(paths.getWebclientCacheDir()).toBe(path.join(mockUserData, 'webclient-cache'));
  });

  it('getPublicDir() still uses projectRoot when resourcesPath is NOT set', () => {
    // Without resourcesPath, public falls back to __dirname-based resolution
    const result = paths.getPublicDir();
    expect(path.basename(result)).toBe('public');
    // Should NOT be under userDataPath (public is read-only, not user data)
    expect(result.startsWith(mockUserData)).toBe(false);
  });
});

describe('paths — Electron mode with resourcesPath (packaged app)', () => {
  let paths: ReturnType<typeof loadPathsModule>;
  const mockResources = path.join('C:', 'Program Files', 'Starpeace Online', 'resources');
  const mockUserData = path.join('C:', 'Users', 'TestUser', 'AppData', 'Local', 'Starpeace Online');

  beforeEach(() => {
    jest.resetModules();
    paths = loadPathsModule('35.0.1');
    paths.setElectronUserDataPath(mockUserData);
    paths.setElectronResourcesPath(mockResources);
  });

  it('getPublicDir() resolves to resources/public (NOT install-root/public)', () => {
    const result = paths.getPublicDir();
    expect(result).toBe(path.join(mockResources, 'public'));
  });

  it('getCacheDir() still resolves under userDataPath (not resources)', () => {
    expect(paths.getCacheDir()).toBe(path.join(mockUserData, 'cache'));
  });

  it('getWebclientCacheDir() still resolves under userDataPath (not resources)', () => {
    expect(paths.getWebclientCacheDir()).toBe(path.join(mockUserData, 'webclient-cache'));
  });

  it('getPublicDir() does NOT resolve to __dirname-based path', () => {
    const result = paths.getPublicDir();
    // In a packaged app, __dirname-based resolution would give <install>/public
    // which is wrong. Verify it uses resourcesPath instead.
    expect(result).not.toContain('dist');
    expect(result).toContain('resources');
  });
});

describe('paths — isolation between calls', () => {
  it('setElectronUserDataPath only affects writable dirs', () => {
    jest.resetModules();
    const paths = loadPathsModule('35.0.1');

    const publicBefore = paths.getPublicDir();
    paths.setElectronUserDataPath('/tmp/test-user-data');
    const publicAfter = paths.getPublicDir();

    // Public dir should NOT change when only userDataPath is set
    expect(publicBefore).toBe(publicAfter);
  });

  it('setElectronResourcesPath only affects getPublicDir', () => {
    jest.resetModules();
    const paths = loadPathsModule('35.0.1');

    const cacheBefore = paths.getCacheDir();
    paths.setElectronResourcesPath('/tmp/test-resources');
    const cacheAfter = paths.getCacheDir();

    // Cache dir should NOT change when only resourcesPath is set (no userDataPath)
    expect(cacheBefore).toBe(cacheAfter);
  });
});
