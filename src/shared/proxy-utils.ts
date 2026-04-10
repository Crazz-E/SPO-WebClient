/**
 * Proxy utilities - URL construction for image proxy endpoint
 * Centralizes proxy URL generation to avoid duplication
 */

/**
 * Image proxy endpoint path
 */
export const PROXY_IMAGE_ENDPOINT = '/proxy-image';

/**
 * Convert an image URL to use the local proxy endpoint
 * Handles both absolute URLs and relative paths
 *
 * @param imageUrl - Original image URL (absolute or relative)
 * @param baseHost - Base host for relative URLs (e.g., game server address)
 * @returns Proxy URL like /proxy-image?url=<encoded_url>
 *
 * @example
 * // Absolute URL
 * toProxyUrl('http://server.com/image.gif')
 * // Returns: '/proxy-image?url=http%3A%2F%2Fserver.com%2Fimage.gif'
 *
 * @example
 * // Relative URL with base host
 * toProxyUrl('/images/logo.png', 'game.server.com:8080')
 * // Returns: '/proxy-image?url=http%3A%2F%2Fgame.server.com%3A8080%2Fimages%2Flogo.png'
 *
 * @example
 * // Local file URL
 * toProxyUrl('file:///C:/path/to/image.bmp')
 * // Returns: '/proxy-image?url=file%3A%2F%2F%2FC%3A%2Fpath%2Fto%2Fimage.bmp'
 */
export function toProxyUrl(imageUrl: string, baseHost?: string): string {
  let fullUrl = imageUrl;

  // Already a full URL
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('file://')) {
    fullUrl = imageUrl;
  }
  // Relative URL - needs base host
  else if (baseHost) {
    const separator = imageUrl.startsWith('/') ? '' : '/';
    fullUrl = `http://${baseHost}${separator}${imageUrl}`;
  }
  // Relative URL without base - assume it's already a valid path
  else {
    fullUrl = imageUrl;
  }

  return `${PROXY_IMAGE_ENDPOINT}?url=${encodeURIComponent(fullUrl)}`;
}

/**
 * Convert a local file path to a proxy URL
 *
 * @param filePath - Local file path
 * @returns Proxy URL for the file
 *
 * @example
 * fileToProxyUrl('C:/cache/Maps/Antiqua/Antiqua.bmp')
 * // Returns: '/proxy-image?url=file%3A%2F%2FC%3A%2Fcache%2FMaps%2FAntiqua%2FAntiqua.bmp'
 */
export function fileToProxyUrl(filePath: string): string {
  // Normalize path separators for URL
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileUrl = `file://${normalizedPath}`;
  return `${PROXY_IMAGE_ENDPOINT}?url=${encodeURIComponent(fileUrl)}`;
}

/**
 * Check if a URL is already a proxy URL
 *
 * @param url - URL to check
 * @returns true if URL is a proxy URL
 */
export function isProxyUrl(url: string): boolean {
  return url.startsWith(PROXY_IMAGE_ENDPOINT);
}

