/**
 * Security Hardening Tests — Phase 2
 *
 * Tests for 5 security fixes:
 * 1. CDN path traversal prevention
 * 2. SSRF blocklist for proxy-image
 * 3. handleRdoDirect verb validation
 * 4. Pre-auth message gate (SessionPhase → allowed WsMessageType)
 * 5. Origin validation on WebSocket upgrade
 */

import { describe, it, expect } from '@jest/globals';
import { SessionPhase } from '../../shared/types/protocol-types';
import { WsMessageType } from '../../shared/types/message-types';

// ---------------------------------------------------------------------------
// 1. CDN Path Traversal Prevention
// ---------------------------------------------------------------------------

/** Mirrors the CDN path validation logic in server.ts */
function isValidCdnPath(cdnPath: string): boolean {
  return !(!cdnPath || cdnPath.includes('..') || cdnPath.includes('\\') || cdnPath.includes('\0'));
}

describe('CDN path traversal prevention', () => {
  it('rejects paths containing ".."', () => {
    expect(isValidCdnPath('../etc/passwd')).toBe(false);
    expect(isValidCdnPath('chunks/../secret')).toBe(false);
    expect(isValidCdnPath('a/b/../../c')).toBe(false);
  });

  it('rejects paths containing backslash', () => {
    expect(isValidCdnPath('chunks\\terrain\\file.z3')).toBe(false);
    expect(isValidCdnPath('..\\windows\\system32')).toBe(false);
  });

  it('rejects empty paths', () => {
    expect(isValidCdnPath('')).toBe(false);
  });

  it('rejects paths containing null bytes', () => {
    expect(isValidCdnPath('chunks/file.z3\0.html')).toBe(false);
    expect(isValidCdnPath('\0')).toBe(false);
  });

  it('accepts normal valid paths', () => {
    expect(isValidCdnPath('chunks/terrain/file.z3')).toBe(true);
    expect(isValidCdnPath('images/building.png')).toBe(true);
    expect(isValidCdnPath('a/b/c/d.txt')).toBe(true);
    expect(isValidCdnPath('single-file.dat')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. SSRF Blocklist Tests
// ---------------------------------------------------------------------------

/** Mirrors the SSRF blocklist logic in server.ts */
function isBlockedHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
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
    /^fd/i.test(hostname) || /^\[fd/i.test(hostname)
  );
}

describe('SSRF blocklist', () => {
  describe('blocks internal/reserved addresses', () => {
    it.each([
      ['0.0.0.0', 'zero address'],
      ['255.255.255.255', 'broadcast address'],
      ['0.1.2.3', 'zero-prefix address'],
      ['localhost', 'localhost'],
      ['127.0.0.1', 'loopback IPv4'],
      ['::1', 'loopback IPv6'],
      ['[::1]', 'bracketed loopback IPv6'],
      ['10.0.0.1', 'RFC1918 class A'],
      ['10.255.255.255', 'RFC1918 class A upper'],
      ['192.168.1.1', 'RFC1918 class C'],
      ['192.168.0.0', 'RFC1918 class C lower'],
      ['169.254.169.254', 'link-local / cloud metadata'],
      ['169.254.0.1', 'link-local'],
      ['172.16.0.1', 'RFC1918 class B lower'],
      ['172.31.255.255', 'RFC1918 class B upper'],
    ])('blocks %s (%s)', (host: string) => {
      expect(isBlockedHost(host)).toBe(true);
    });
  });

  describe('blocks IPv6 private/link-local addresses', () => {
    it.each([
      ['fe80:1::1', 'link-local IPv6 with colon'],
      ['fe80%eth0', 'link-local IPv6 with zone ID'],
      ['[fe80:1::1]', 'bracketed link-local IPv6'],
      ['fc00::1', 'unique-local fc'],
      ['[fc00::1]', 'bracketed unique-local fc'],
      ['fd12::1', 'unique-local fd'],
      ['[fd12::1]', 'bracketed unique-local fd'],
    ])('blocks %s (%s)', (host: string) => {
      expect(isBlockedHost(host)).toBe(true);
    });
  });

  describe('allows public addresses', () => {
    it.each([
      ['spo.zz.works', 'CDN domain'],
      ['8.8.8.8', 'Google DNS'],
      ['example.com', 'generic domain'],
      ['1.2.3.4', 'arbitrary public IP'],
      ['203.0.113.1', 'TEST-NET-3'],
    ])('allows %s (%s)', (host: string) => {
      expect(isBlockedHost(host)).toBe(false);
    });
  });

  describe('does not block RFC1918 172.x outside 16-31 range', () => {
    it.each([
      ['172.15.0.1', 'below range'],
      ['172.32.0.1', 'above range'],
    ])('allows %s (%s)', (host: string) => {
      expect(isBlockedHost(host)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. handleRdoDirect Verb Validation Tests
// ---------------------------------------------------------------------------

const VALID_VERBS = ['get', 'set', 'call', 'sel'];

function isValidRdoVerb(verb: string): boolean {
  return VALID_VERBS.includes(verb);
}

describe('handleRdoDirect verb validation', () => {
  describe('accepts valid verbs', () => {
    it.each(['get', 'set', 'call', 'sel'])('accepts "%s"', (verb: string) => {
      expect(isValidRdoVerb(verb)).toBe(true);
    });
  });

  describe('rejects invalid verbs', () => {
    it.each(['delete', 'drop', 'exec', '', 'GET', 'CALL', 'unknown'])(
      'rejects "%s"',
      (verb: string) => {
        expect(isValidRdoVerb(verb)).toBe(false);
      }
    );
  });

  describe('requires all three fields for a valid RDO direct request', () => {
    interface RdoDirectInput {
      targetId?: string;
      action?: string;
      member?: string;
    }

    function isValidRdoDirectRequest(input: RdoDirectInput): boolean {
      return !!(input.targetId && input.action && input.member);
    }

    it('accepts request with all fields present', () => {
      expect(isValidRdoDirectRequest({ targetId: '123', action: 'get', member: 'Name' })).toBe(true);
    });

    it('rejects request missing targetId', () => {
      expect(isValidRdoDirectRequest({ action: 'get', member: 'Name' })).toBe(false);
    });

    it('rejects request missing action', () => {
      expect(isValidRdoDirectRequest({ targetId: '123', member: 'Name' })).toBe(false);
    });

    it('rejects request missing member', () => {
      expect(isValidRdoDirectRequest({ targetId: '123', action: 'get' })).toBe(false);
    });

    it('rejects request with empty targetId', () => {
      expect(isValidRdoDirectRequest({ targetId: '', action: 'get', member: 'Name' })).toBe(false);
    });

    it('rejects request with empty action', () => {
      expect(isValidRdoDirectRequest({ targetId: '123', action: '', member: 'Name' })).toBe(false);
    });

    it('rejects request with empty member', () => {
      expect(isValidRdoDirectRequest({ targetId: '123', action: 'get', member: '' })).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Pre-auth Message Gate Tests
// ---------------------------------------------------------------------------

/**
 * Mirrors the PHASE_ALLOWED_MESSAGES map from server.ts.
 * null = all messages allowed (no restriction).
 */
const PHASE_ALLOWED_MESSAGES: Record<SessionPhase, Set<WsMessageType> | null> = {
  [SessionPhase.DISCONNECTED]: new Set([
    WsMessageType.REQ_AUTH_CHECK,
    WsMessageType.REQ_CONNECT_DIRECTORY,
  ]),
  [SessionPhase.DIRECTORY_CONNECTED]: new Set([
    WsMessageType.REQ_AUTH_CHECK,
    WsMessageType.REQ_CONNECT_DIRECTORY,
    WsMessageType.REQ_LOGIN_WORLD,
    WsMessageType.REQ_SELECT_COMPANY,
  ]),
  [SessionPhase.WORLD_CONNECTING]: new Set([
    WsMessageType.REQ_AUTH_CHECK,
    WsMessageType.REQ_CONNECT_DIRECTORY,
    WsMessageType.REQ_LOGIN_WORLD,
    WsMessageType.REQ_SELECT_COMPANY,
  ]),
  [SessionPhase.WORLD_CONNECTED]: null, // all messages allowed
};

/**
 * Checks whether a message type is allowed in the given session phase.
 * REQ_LOGOUT is always allowed regardless of phase.
 */
function isMessageAllowedInPhase(msgType: WsMessageType, phase: SessionPhase): boolean {
  if (msgType === WsMessageType.REQ_LOGOUT) return true;
  const allowed = PHASE_ALLOWED_MESSAGES[phase];
  if (allowed === null) return true;
  return allowed.has(msgType);
}

describe('Pre-auth message gate', () => {
  describe('DISCONNECTED phase', () => {
    const phase = SessionPhase.DISCONNECTED;

    it('allows REQ_AUTH_CHECK', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_AUTH_CHECK, phase)).toBe(true);
    });

    it('allows REQ_CONNECT_DIRECTORY', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_CONNECT_DIRECTORY, phase)).toBe(true);
    });

    it('rejects REQ_RDO_DIRECT', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_RDO_DIRECT, phase)).toBe(false);
    });

    it('rejects REQ_BUILDING_FOCUS', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_BUILDING_FOCUS, phase)).toBe(false);
    });

    it('rejects REQ_MAP_LOAD', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_MAP_LOAD, phase)).toBe(false);
    });

    it('rejects REQ_LOGIN_WORLD', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_LOGIN_WORLD, phase)).toBe(false);
    });
  });

  describe('DIRECTORY_CONNECTED phase', () => {
    const phase = SessionPhase.DIRECTORY_CONNECTED;

    it('allows REQ_LOGIN_WORLD', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_LOGIN_WORLD, phase)).toBe(true);
    });

    it('allows REQ_SELECT_COMPANY', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_SELECT_COMPANY, phase)).toBe(true);
    });

    it('allows REQ_AUTH_CHECK (inherited from earlier phase)', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_AUTH_CHECK, phase)).toBe(true);
    });

    it('allows REQ_CONNECT_DIRECTORY (inherited from earlier phase)', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_CONNECT_DIRECTORY, phase)).toBe(true);
    });

    it('rejects REQ_RDO_DIRECT', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_RDO_DIRECT, phase)).toBe(false);
    });

    it('rejects REQ_BUILDING_FOCUS', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_BUILDING_FOCUS, phase)).toBe(false);
    });

    it('rejects REQ_MAP_LOAD', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_MAP_LOAD, phase)).toBe(false);
    });

    it('rejects REQ_BUILDING_DETAILS', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_BUILDING_DETAILS, phase)).toBe(false);
    });
  });

  describe('WORLD_CONNECTED phase', () => {
    const phase = SessionPhase.WORLD_CONNECTED;

    it('allows REQ_RDO_DIRECT', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_RDO_DIRECT, phase)).toBe(true);
    });

    it('allows REQ_BUILDING_FOCUS', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_BUILDING_FOCUS, phase)).toBe(true);
    });

    it('allows REQ_MAP_LOAD', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_MAP_LOAD, phase)).toBe(true);
    });

    it('allows REQ_AUTH_CHECK', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_AUTH_CHECK, phase)).toBe(true);
    });

    it('allows REQ_BUILDING_DETAILS', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_BUILDING_DETAILS, phase)).toBe(true);
    });

    it('allows REQ_MAIL_CONNECT', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_MAIL_CONNECT, phase)).toBe(true);
    });
  });

  describe('REQ_LOGOUT exemption', () => {
    it('allows REQ_LOGOUT in DISCONNECTED phase', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_LOGOUT, SessionPhase.DISCONNECTED)).toBe(true);
    });

    it('allows REQ_LOGOUT in DIRECTORY_CONNECTED phase', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_LOGOUT, SessionPhase.DIRECTORY_CONNECTED)).toBe(true);
    });

    it('allows REQ_LOGOUT in WORLD_CONNECTING phase', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_LOGOUT, SessionPhase.WORLD_CONNECTING)).toBe(true);
    });

    it('allows REQ_LOGOUT in WORLD_CONNECTED phase', () => {
      expect(isMessageAllowedInPhase(WsMessageType.REQ_LOGOUT, SessionPhase.WORLD_CONNECTED)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Origin Validation Tests
// ---------------------------------------------------------------------------

/**
 * Mirrors the origin validation logic applied during WebSocket upgrade.
 *
 * @param origin - The Origin header value (may be undefined/empty)
 * @param expectedOrigin - The server's own origin (e.g. "http://localhost:8080")
 * @param singleUserMode - Whether SINGLE_USER_MODE is enabled (e.g. Electron)
 */
function isOriginAllowed(
  origin: string | undefined,
  expectedOrigin: string,
  singleUserMode: boolean,
): boolean {
  // In single-user mode (Electron), missing origin is acceptable
  if (!origin) return singleUserMode;
  return origin === expectedOrigin;
}

describe('Origin validation', () => {
  const serverOrigin = 'http://localhost:8080';

  it('rejects empty origin in non-SINGLE_USER_MODE', () => {
    expect(isOriginAllowed(undefined, serverOrigin, false)).toBe(false);
    expect(isOriginAllowed('', serverOrigin, false)).toBe(false);
  });

  it('allows empty origin in SINGLE_USER_MODE', () => {
    expect(isOriginAllowed(undefined, serverOrigin, true)).toBe(true);
  });

  it('allows valid same-origin', () => {
    expect(isOriginAllowed('http://localhost:8080', serverOrigin, false)).toBe(true);
  });

  it('rejects mismatched origin', () => {
    expect(isOriginAllowed('http://evil.com', serverOrigin, false)).toBe(false);
    expect(isOriginAllowed('http://localhost:9999', serverOrigin, false)).toBe(false);
    expect(isOriginAllowed('https://localhost:8080', serverOrigin, false)).toBe(false);
  });

  it('allows valid same-origin even when SINGLE_USER_MODE is true', () => {
    expect(isOriginAllowed('http://localhost:8080', serverOrigin, true)).toBe(true);
  });

  it('rejects mismatched origin even when SINGLE_USER_MODE is true', () => {
    expect(isOriginAllowed('http://evil.com', serverOrigin, true)).toBe(false);
  });
});
