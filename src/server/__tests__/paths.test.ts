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
import { describe, it, expect, beforeEach } from '@jest/globals';
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

  it('SPO_CACHE_DIR moves the asset cache, and nothing else', () => {
    const publicBefore = paths.getPublicDir();
    const webclientBefore = paths.getWebclientCacheDir();
    process.env.SPO_CACHE_DIR = path.join(path.sep, 'bench', 'cache');
    try {
      expect(paths.getCacheDir()).toBe(path.join(path.sep, 'bench', 'cache'));
      // The override is the shared asset mirror only: the webclient image cache is
      // written by this checkout, and public/ ships with it.
      expect(paths.getWebclientCacheDir()).toBe(webclientBefore);
      expect(paths.getPublicDir()).toBe(publicBefore);
    } finally {
      delete process.env.SPO_CACHE_DIR;
    }
    expect(paths.getCacheDir()).toBe(path.join(path.dirname(publicBefore), 'cache'));
  });

  it('resolves a relative SPO_CACHE_DIR to an absolute path', () => {
    process.env.SPO_CACHE_DIR = 'shared-cache';
    try {
      expect(paths.getCacheDir()).toBe(path.resolve('shared-cache'));
    } finally {
      delete process.env.SPO_CACHE_DIR;
    }
  });

  it('ignores an empty SPO_CACHE_DIR — an unset variable is not a location', () => {
    const before = paths.getCacheDir();
    process.env.SPO_CACHE_DIR = '';
    try {
      expect(paths.getCacheDir()).toBe(before);
    } finally {
      delete process.env.SPO_CACHE_DIR;
    }
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

  it('SPO_CACHE_DIR does not move an installed client cache out of userData', () => {
    // The packaged app inherits the user's shell environment; a variable meant for a
    // developer's bench must not redirect an installed client's writable directory.
    process.env.SPO_CACHE_DIR = path.join(path.sep, 'bench', 'cache');
    try {
      expect(paths.getCacheDir()).toBe(path.join(mockUserData, 'cache'));
    } finally {
      delete process.env.SPO_CACHE_DIR;
    }
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
