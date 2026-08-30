import * as http from 'http';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { toErrorMessage } from '../shared/error-utils';
import { TIMEOUTS } from '../shared/constants';
import { fetchWithTimeout, FetchTimeoutError } from './fetch-with-timeout';

export interface ProxyImageDeps {
  imageFileIndex: Map<string, string>;
  cacheRoot: string;
  webclientCacheDir: string;
  updateServerCacheUrl: string;
  log: { debug(msg: string): void; warn(msg: string): void };
}

/**
 * Generate a placeholder image (1x1 transparent PNG)
 */
export function getPlaceholderImage(): Buffer {
  // 1x1 transparent PNG (base64 encoded)
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return Buffer.from(base64, 'base64');
}

export function getImageContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.bmp': return 'application/octet-stream';
    default: return 'image/gif';
  }
}

/**
 * Proxy image from remote server to avoid CORS/Referer blocking.
 * Uses in-memory file index for O(1) cache lookup instead of scanning directories.
 */
export async function proxyImage(imageUrl: string, res: http.ServerResponse, deps: ProxyImageDeps): Promise<void> {
  const { imageFileIndex, cacheRoot, webclientCacheDir, updateServerCacheUrl, log } = deps;

  // Handle file:// URLs — serve local files only from within the cache directory
  if (imageUrl.startsWith('file://')) {
    const filePath = path.normalize(decodeURIComponent(imageUrl.replace('file://', '')));
    const normalizedCache = path.normalize(cacheRoot);
    if (!filePath.startsWith(normalizedCache)) {
      res.writeHead(403);
      res.end('Access denied: file outside cache directory');
      return;
    }
    try {
      const content = await fsp.readFile(filePath);
      res.writeHead(200, {
        'Content-Type': getImageContentType(filePath),
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('File not found');
    }
    return;
  }

  // Security: reject non-HTTP schemes (SSRF prevention)
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    res.writeHead(400);
    res.end('Only http:// and https:// URLs are allowed');
    return;
  }

  // Security: block requests to private/internal IP ranges
  try {
    const urlObj = new URL(imageUrl);
    const hostname = urlObj.hostname;
    if (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]' ||
        hostname === '0.0.0.0' ||
        hostname === '255.255.255.255' ||
        hostname.startsWith('0.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        /^fe80[:%]/i.test(hostname) ||
        /^\[fe80[:%]/i.test(hostname) ||
        /^fc/i.test(hostname) || /^\[fc/i.test(hostname) ||
        /^fd/i.test(hostname) || /^\[fd/i.test(hostname)) {
      res.writeHead(403);
      res.end('Access to internal addresses is not allowed');
      return;
    }
  } catch {
    res.writeHead(400);
    res.end('Invalid URL');
    return;
  }

  // Extract filename from URL
  const urlParts = imageUrl.split('/');
  const filename = urlParts[urlParts.length - 1] || 'unknown.gif';

  try {
    // O(1) lookup in pre-built file index (replaces readdirSync scans)
    const cachedPath = imageFileIndex.get(filename.toLowerCase());
    if (cachedPath) {
      const content = await fsp.readFile(cachedPath);
      res.writeHead(200, {
        'Content-Type': getImageContentType(cachedPath),
        'Cache-Control': 'public, max-age=31536000'
      });
      res.end(content);
      return;
    }

    // Not in index — try downloading from update server
    const imageDirs: string[] = [];
    for (const [, filePath] of imageFileIndex) {
      const dir = path.basename(path.dirname(filePath));
      if (!imageDirs.includes(dir) && path.dirname(path.dirname(filePath)) === cacheRoot) {
        imageDirs.push(dir);
      }
    }

    let downloaded = false;
    for (const dir of imageDirs) {
      try {
        const updateUrl = `${updateServerCacheUrl}/${dir}/${filename}`;
        const response = await fetchWithTimeout(updateUrl, {}, TIMEOUTS.IMAGE_DOWNLOAD);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          // Cache in proper directory structure (async)
          const targetDir = path.join(cacheRoot, dir);
          await fsp.mkdir(targetDir, { recursive: true });
          const targetPath = path.join(targetDir, filename);
          await fsp.writeFile(targetPath, buffer);

          // Update index
          imageFileIndex.set(filename.toLowerCase(), targetPath);

          res.writeHead(200, {
            'Content-Type': getImageContentType(filename),
            'Cache-Control': 'public, max-age=31536000'
          });
          res.end(buffer);
          downloaded = true;
          log.debug(`Downloaded from update server: ${dir}/${filename}`);
          break;
        }
      } catch {
        // Continue to next directory
      }
    }

    if (downloaded) return;

    // Not on update server, try game server (fallback)
    const response = await fetchWithTimeout(imageUrl, {}, TIMEOUTS.IMAGE_DOWNLOAD);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Cache in webclient-cache (async)
    const webclientImagePath = path.join(webclientCacheDir, filename);
    await fsp.writeFile(webclientImagePath, buffer);
    imageFileIndex.set(filename.toLowerCase(), webclientImagePath);
    log.debug(`Downloaded from game server: ${filename}`);

    res.writeHead(200, {
      'Content-Type': getImageContentType(filename),
      'Cache-Control': 'public, max-age=31536000'
    });
    res.end(buffer);
  } catch (error: unknown) {
    if (error instanceof FetchTimeoutError) {
      log.warn(`Image upstream timed out for ${filename}: ${error.message}`);
      res.writeHead(504, { 'Content-Type': 'text/plain' });
      res.end('Upstream image server timed out');
      return;
    }

    log.warn(`Failed to fetch image ${filename}: ${toErrorMessage(error)}`);

    // Cache the placeholder to avoid repeated failed downloads
    const placeholder = getPlaceholderImage();
    const webclientImagePath = path.join(webclientCacheDir, filename);
    await fsp.writeFile(webclientImagePath, placeholder).catch(() => {});
    imageFileIndex.set(filename.toLowerCase(), webclientImagePath);

    // Return placeholder image instead of 404
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(placeholder);
  }
}
