/**
 * Fetch utilities - Shared fetch wrappers with consistent error handling
 * Reduces boilerplate across client and server code
 */

/**
 * Fetch response with parsed data
 */
export interface FetchResult<T> {
  ok: boolean;
  status: number;
  statusText: string;
  data?: T;
  error?: string;
}

/**
 * Options for fetch wrapper
 */
export interface FetchOptions extends RequestInit {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether to parse response as JSON (default: true) */
  parseJson?: boolean;
}

/**
 * Fetch with automatic error handling and timeout support
 * Returns null on failure instead of throwing (for optional resources)
 *
 * @param url - URL to fetch
 * @param options - Fetch options with timeout support
 * @returns Response or null on failure
 */
export async function fetchSafe(
  url: string,
  options?: FetchOptions
): Promise<Response | null> {
  try {
    const timeout = options?.timeout ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    return response;
  } catch {
    return null;
  }
}

/**
 * Fetch with error throwing on failure
 * Use when the resource is required
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @throws Error with status code on failure
 */
export async function fetchRequired(
  url: string,
  options?: FetchOptions
): Promise<Response> {
  const timeout = options?.timeout ?? 30000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeout}ms: ${url}`);
    }
    throw error;
  }
}

/**
 * Fetch JSON with automatic parsing and error handling
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Parsed JSON data or null on failure
 */
export async function fetchJson<T>(
  url: string,
  options?: FetchOptions
): Promise<T | null> {
  const response = await fetchSafe(url, options);
  if (!response) {
    return null;
  }

  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

/**
 * Fetch JSON with error throwing
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Parsed JSON data
 * @throws Error on failure
 */
export async function fetchJsonRequired<T>(
  url: string,
  options?: FetchOptions
): Promise<T> {
  const response = await fetchRequired(url, options);
  return await response.json() as T;
}

/**
 * Fetch binary data (ArrayBuffer)
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns ArrayBuffer or null on failure
 */
export async function fetchBinary(
  url: string,
  options?: FetchOptions
): Promise<ArrayBuffer | null> {
  const response = await fetchSafe(url, options);
  if (!response) {
    return null;
  }

  try {
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Fetch text content
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Text content or null on failure
 */
export async function fetchText(
  url: string,
  options?: FetchOptions
): Promise<string | null> {
  const response = await fetchSafe(url, options);
  if (!response) {
    return null;
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Fetch with detailed result (includes status info even on failure)
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns FetchResult with status and data/error
 */
export async function fetchWithResult<T>(
  url: string,
  options?: FetchOptions
): Promise<FetchResult<T>> {
  try {
    const timeout = options?.timeout ?? 30000;
    const parseJson = options?.parseJson ?? true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      };
    }

    const data = parseJson
      ? await response.json() as T
      : await response.text() as unknown as T;

    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      data,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      error: message,
    };
  }
}
