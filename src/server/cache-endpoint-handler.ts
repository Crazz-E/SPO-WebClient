import * as path from 'path';
import * as fsp from 'fs/promises';
import { resolveCachePath, resolveBmpToPng } from './cache-path-resolver';
import type { ServerResponse } from 'http';

/**
 * Handles cache endpoint requests (/cache/{category}/{filename})
 * Serves files from the update server cache with BMP-to-PNG upgrade support.
 */
export async function handleCacheEndpoint(
  safePath: string,
  CACHE_DIR: string,
  WEBCLIENT_CACHE_DIR: string,
  imageFileIndex: Map<string, string>,
  res: ServerResponse
): Promise<void> {
  if (!safePath.startsWith('/cache/')) {
    return;
  }

  const relativePath = safePath.substring('/cache/'.length);
  // Use imageFileIndex for case-insensitive lookup (handles mixed-case filenames on Linux)
  const lastSlash = relativePath.lastIndexOf('/');
  const filename = lastSlash >= 0 ? relativePath.substring(lastSlash + 1) : relativePath;
  const filePath = resolveCachePath(relativePath, CACHE_DIR, imageFileIndex);

  // Security check: ensure path doesn't escape allowed cache directories
  const normalizedPath = path.normalize(filePath);
  if (!normalizedPath.startsWith(path.normalize(CACHE_DIR)) &&
      !normalizedPath.startsWith(path.normalize(WEBCLIENT_CACHE_DIR))) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  // Determine content type
  const contentTypes: Record<string, string> = {
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
  };

  // If requesting a BMP, check if a pre-baked PNG exists (has alpha channel pre-applied)
  const ext = path.extname(filePath).toLowerCase();
  let servePath = filePath;
  if (ext === '.bmp') {
    const resolvedPng = await resolveBmpToPng(filename, filePath, imageFileIndex);
    if (resolvedPng !== null) {
      servePath = resolvedPng;
    }
  }
  const serveExt = path.extname(servePath).toLowerCase();

  try {
    const content = await fsp.readFile(servePath);
    res.writeHead(200, {
      'Content-Type': contentTypes[serveExt] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000'
    });
    res.end(content);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      res.writeHead(404);
      res.end('File not found');
    } else {
      res.writeHead(500);
      res.end('Internal server error');
    }
  }
}
