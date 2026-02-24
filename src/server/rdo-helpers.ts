/**
 * RDO Helpers - Pure utility functions for RDO protocol handling
 * Extracted from spo_session.ts to reduce complexity
 */

/**
 * Clean RDO payload by removing quotes, prefixes, and formatting
 * @param payload Raw payload string from RDO response
 * @returns Cleaned payload value
 */
export function cleanPayload(payload: string): string {
  let cleaned = payload.trim();

  // Handle res="..." format (e.g., res="#6805584" -> 6805584)
  // Regex handles doubled quotes inside: res="%Hello ""World"""
  const resMatch = cleaned.match(/^res="((?:[^"]|"")*)"$/);
  if (resMatch) {
    // Value already extracted from inside quotes — unescape and skip outer-quote removal
    cleaned = resMatch[1].replace(/""/g, '"');
  } else {
    // Remove outer quotes (only when not already extracted from res="...")
    cleaned = cleaned.replace(/^"|"$/g, '');
  }

  // Remove type prefix (#, %, @, $, ^, !, *) if present
  if (cleaned.length > 0 && ['#', '%', '@', '$', '^', '!', '*'].includes(cleaned[0])) {
    cleaned = cleaned.substring(1);
  }

  return cleaned.trim();
}

/**
 * Split multiline RDO payload into individual lines
 * Handles various line ending formats and empty lines
 * @param payload Raw multiline payload
 * @returns Array of non-empty trimmed lines
 */
export function splitMultilinePayload(payload: string): string[] {
  const raw = cleanPayload(payload);

  // Handle mixed line endings: \r\n, \n, \r, or even \n\r
  const lines = raw.split(/\r?\n\r?/);

  // Filter empty lines and trim
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Extract revenue amount from a line
 * Formats: "($26,564/h)" or "(-$39,127/h)" or "(-$28,858/h)"
 * @param line Line containing potential revenue information
 * @returns Extracted revenue string or empty string if not found
 */
export function extractRevenue(line: string): string {
  // Pattern: optional '(', optional '-', '$', digits with optional commas, '/h', optional ')'
  const revenuePattern = /\(?\-?\$[\d,]+\/h\)?/;
  const match = revenuePattern.exec(line);

  if (match) {
    // Return the matched string, cleaned
    return match[0].replace(/[()]/g, ''); // Remove parentheses
  }

  return '';
}

/**
 * Parse property response payload extracting a specific property value
 * Handles formats like: Property="value", Property="#123", res="value"
 * @param payload Raw payload containing property value
 * @param propName Property name to extract
 * @returns Extracted property value (with type prefix removed)
 */
export function parsePropertyResponse(payload: string, propName: string): string {
  // Try to extract value using Property="value" format
  // Handles doubled quotes inside: Property="%Hello ""World"""
  const regex = new RegExp(`${propName}\\s*=\\s*"((?:[^"]|"")*)"`, 'i');
  const match = payload.match(regex);
  if (match && match[1]) {
    // Unescape doubled quotes and remove type prefix (#, $, %, @)
    return match[1].replace(/""/g, '"').replace(/^[$#%@]/, '');
  }

  // Handle case where payload starts directly with property name
  if (payload.startsWith(propName)) {
    const cleaned = payload.substring(propName.length).trim();
    // Remove = and quotes if present, then type prefix
    const valueMatch = cleaned.match(/^=\s*"?((?:[^"]|"")*)"?$/);
    if (valueMatch) {
      return valueMatch[1].replace(/""/g, '"').replace(/^[$#%@]/, '');
    }
    return cleaned.replace(/^[$#%@]/, '');
  }

  // Fallback: clean and return payload as-is (for backward compatibility)
  const cleaned = cleanPayload(payload);

  // Handle multi-line responses - take first non-empty line
  const lines = cleaned.split(/\r?\n\r?/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    console.warn(`[RdoHelpers] Empty response for property ${propName}`);
    return '';
  }

  return lines[0].trim();
}

/**
 * Parse idof response to extract object ID
 * Handles format: objid="39751288" or objid="#39751288"
 * @param payload Response payload from idof command
 * @returns Extracted object ID
 */
export function parseIdOfResponse(payload: string | undefined): string {
  if (!payload) {
    throw new Error('Empty idof response');
  }

  // Handle objid="value" format (standard idof response)
  const objidMatch = payload.match(/objid\s*=\s*"((?:[^"]|"")*)"/i);
  if (objidMatch && objidMatch[1]) {
    // Unescape doubled quotes and remove type prefix (#, $, %, @) if present
    return objidMatch[1].replace(/""/g, '"').replace(/^[$#%@]/, '').trim();
  }

  // Fallback: clean payload and remove type prefixes
  const cleaned = cleanPayload(payload);
  return cleaned.replace(/[#%@$"]/g, '').trim();
}

/**
 * Remove RDO type prefixes from a value
 * @param value Value potentially containing type prefix
 * @returns Value without type prefix
 */
export function stripTypePrefix(value: string): string {
  if (value.length > 0 && ['#', '%', '@', '$', '^', '!', '*'].includes(value[0])) {
    return value.substring(1);
  }
  return value;
}

/**
 * Check if a string has an RDO type prefix
 * @param value Value to check
 * @returns True if value starts with a type prefix
 */
export function hasTypePrefix(value: string): boolean {
  if (value.length === 0) return false;
  return ['#', '%', '@', '$', '^', '!', '*'].includes(value[0]);
}
