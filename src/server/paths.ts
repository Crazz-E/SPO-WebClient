/**
 * Path resolution for the gateway server.
 *
 * Paths resolve relative to the compiled `dist/server/` directory
 * (i.e., `__dirname/../../{dir}`), which is what both a plain `npm start` and Docker want.
 *
 * `SPO_CACHE_DIR` overrides the asset cache alone, for a caller that shares one mirror
 * between several checkouts of this repo on the same machine (the bench worker does).
 * It is read on every call rather than captured at load time, so a test can set it and
 * a process can be configured after the module is imported.
 */
import * as path from 'path';

function projectRoot(): string {
  return path.join(__dirname, '../..');
}

export function getPublicDir(): string {
  return path.join(projectRoot(), 'public');
}

/**
 * Where the mirror of `update.starpeaceonline.com/five/client/cache/` lives.
 *
 * The default is `<checkout>/cache`, which is what Docker and a plain `npm start` want.
 * `SPO_CACHE_DIR` moves it somewhere shared: those ~570 files are the same bytes in
 * every checkout — a mirror of a remote tree, not build output — so re-downloading them
 * per worktree costs the network and the bench's exclusive time for nothing.
 */
export function getCacheDir(): string {
  const override = process.env.SPO_CACHE_DIR;
  if (override) return path.resolve(override);
  return path.join(projectRoot(), 'cache');
}

export function getWebclientCacheDir(): string {
  return path.join(projectRoot(), 'webclient-cache');
}
