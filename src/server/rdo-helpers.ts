/**
 * RDO Helpers - Pure utility functions for RDO protocol handling
 * Extracted from spo_session.ts to reduce complexity
 */

import type { Socket } from 'net';
import { createLogger } from '../shared/logger';

const wireLog = createLogger('RdoWire');

/**
 * Socket name tags for wire-tap logging. Sessions tag each RDO socket at
 * creation (`tagRdoSocket(socket, 'world')`) so tap entries carry the
 * logical socket role instead of an anonymous endpoint.
 */
const socketTags = new WeakMap<Socket, string>();

export function tagRdoSocket(socket: Socket, name: string): void {
  socketTags.set(socket, name);
}

export function getRdoSocketTag(socket: Socket): string {
  return socketTags.get(socket) ?? 'untagged';
}

/**
 * Frame-level credential redaction for the wire tap. Mirrors the member-based
 * redaction in spo_session (redactRdoRaw): logon-family commands get their
 * trailing "%<password>" argument replaced. Defense-in-depth — logon commands
 * are synchronous and skip the tap (alreadyLogged), but a future refactor must
 * not silently start logging passwords.
 */
const SENSITIVE_WIRE_MEMBERS = /(?:call|get)\s+(?:RDOLogonUser|Logon|AccountStatus|RDOLogonClient)\b/;

export function redactSensitiveRdoFrame(frame: string): string {
  if (!SENSITIVE_WIRE_MEMBERS.test(frame)) return frame;
  return frame.replace(/,"%[^"]*"(?=\s*;?\s*$)/, ',"%[REDACTED]"');
}

/**
 * Write an RDO frame to a TCP socket using Latin-1 (ANSI) encoding.
 *
 * The Delphi servers exchange AnsiString (single-byte) text on the wire
 * (RDOUtils.pas WideStrToStr/StrToWideStr, Socket.SendText/ReceiveText).
 * Node's socket.write(string) defaults to UTF-8, which encodes every
 * character >= 0x80 (accented chat/mail/company text) as two bytes and
 * corrupts it server-side. The read path already decodes Latin-1
 * (RdoFramer.ingest) — this helper makes writes symmetric.
 *
 * ALL RDO frames MUST go through this helper; never call socket.write()
 * with a raw string on an RDO socket.
 *
 * Wire tap: every frame is logged at debug level as `RDO>* <socketTag>`
 * unless the caller already emitted its own wire log (`alreadyLogged` —
 * sendRdoRequest logs richer `RDO>>` entries). Together with the `RDO<<`
 * log in processSingleCommand this gives a complete NDJSON record of the
 * wire, which log-capture-converter turns into mock scenarios.
 */
export function writeRdoFrame(socket: Socket, frame: string, alreadyLogged = false): boolean {
  if (!alreadyLogged) {
    wireLog.debug(`RDO>* ${getRdoSocketTag(socket)}`, { raw: redactSensitiveRdoFrame(frame) });
  }
  return socket.write(Buffer.from(frame, 'latin1'));
}

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
/**
 * Interpret an ordinal value (type prefix already stripped) as a boolean.
 * Wire truth (doc/rdo-protocol-architecture.md §2.2): Delphi wordbool true is
 * "#-1", but ANY non-zero ordinal must parse as true (the Delphi decoder does
 * VarCast to integer — "#1" from a server-side ordinal is legitimate).
 * Empty string = unparsable → false.
 */
export function isTrueOrdinal(value: string): boolean {
  return value !== '' && value !== '0';
}

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
