/**
 * Regression tests for path resolution.
 *
 * Paths resolve relative to the compiled `dist/server/` directory, and `SPO_CACHE_DIR`
 * moves the asset mirror — and only the asset mirror — somewhere shared.
 *
 * Uses jest.isolateModules() to reload paths.ts with fresh state per test.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import * as path from 'path';

function loadPathsModule() {
  return require('../paths') as typeof import('../paths');
}

describe('paths', () => {
  let paths: ReturnType<typeof loadPathsModule>;

  beforeEach(() => {
    jest.resetModules();
    paths = loadPathsModule();
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

  it('reads SPO_CACHE_DIR on every call, not at module load', () => {
    const before = paths.getCacheDir();
    process.env.SPO_CACHE_DIR = path.join(path.sep, 'late', 'cache');
    try {
      expect(paths.getCacheDir()).toBe(path.join(path.sep, 'late', 'cache'));
    } finally {
      delete process.env.SPO_CACHE_DIR;
    }
    expect(paths.getCacheDir()).toBe(before);
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
