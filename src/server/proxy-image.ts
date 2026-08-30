import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns/promises';

const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp']);

/**
 * Derive a safe cache filename from a caller-supplied image URL.
 * Returns null when the resulting name cannot be trusted for a filesystem write.
 */
export function sanitizeImageFilename(imageUrl: string): string | null {
  const urlParts = imageUrl.split('/');
  const rawSegment = urlParts[urlParts.length - 1] || '';

  if (rawSegment === '') {
    return 'unknown.gif';
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(rawSegment);
  } catch {
    return null;
  }

  if (decoded.includes('/') || decoded.includes('\\')) {
    return null;
  }

  const base = path.basename(decoded);

  if (base === '' || base.includes('..') || base.includes('\0')) {
    return null;
  }

  const ext = path.extname(base).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return null;
  }

  return base;
}

/**
 * Resolve `...segments` under `root` and verify the result did not escape it.
 * Returns null rather than a path outside `root`.
 */
export function resolveSafeCachePath(root: string, ...segments: string[]): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, ...segments);
  if (resolvedPath === resolvedRoot || resolvedPath.startsWith(resolvedRoot + path.sep)) {
    return resolvedPath;
  }
  return null;
}

const V4_PRIVATE_PREFIXES = ['0.', '10.', '127.', '169.254.', '192.168.'];

function isPrivateIpV4(addr: string): boolean {
  if (addr === '255.255.255.255') return true;
  if (V4_PRIVATE_PREFIXES.some((prefix) => addr.startsWith(prefix))) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(addr)) return true;
  return false;
}

function isPrivateIpV6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) return isPrivateIpV4(v4Mapped[1]);
  return false;
}

/**
 * Check whether `addr` is a private, loopback, or link-local IP literal (v4 or v6).
 */
export function isPrivateIp(addr: string): boolean {
  const version = net.isIP(addr);
  if (version === 4) return isPrivateIpV4(addr);
  if (version === 6) return isPrivateIpV6(addr);
  return false;
}

/**
 * DNS-resolution-based SSRF guard: rejects any URL whose hostname is a private
 * IP literal, or that resolves (via DNS) to any private/link-local address.
 */
export async function assertPublicImageUrl(imageUrl: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(imageUrl).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }

  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0'
  ) {
    return false;
  }

  if (net.isIP(hostname)) {
    return !isPrivateIp(hostname);
  }

  try {
    const results = await dns.lookup(hostname, { all: true });
    if (results.length === 0) return false;
    return results.every((r) => !isPrivateIp(r.address));
  } catch {
    return false;
  }
}
