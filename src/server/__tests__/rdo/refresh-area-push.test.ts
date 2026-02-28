/**
 * RDO Protocol Tests - RefreshArea Push Detection & Parsing
 *
 * Tests isRefreshAreaPush() and parseRefreshAreaPush() logic
 * from spo_session.ts.
 *
 * Uses captured data from build-roads-scenario.ts as ground truth.
 */

import { describe, it, expect } from '@jest/globals';
import type { RdoPacket } from '../../../shared/types/protocol-types';
import { RdoParser } from '../../../shared/rdo-types';
import { CAPTURED_ROAD_BUILD } from '../../../mock-server/scenarios/build-roads-scenario';

// ==========================================================================
// Replicate isRefreshAreaPush logic (matches spo_session.ts)
// ==========================================================================
function isRefreshAreaPush(packet: RdoPacket): boolean {
  return packet.type === 'PUSH' &&
         packet.member === 'RefreshArea' &&
         packet.separator === '"*"';
}

// ==========================================================================
// Replicate parseRefreshAreaPush logic (matches spo_session.ts)
// ==========================================================================
function parseRefreshAreaPush(
  packet: RdoPacket
): { x: number; y: number; width: number; height: number } | null {
  try {
    if (!packet.args || packet.args.length < 4) {
      return null;
    }

    const x = RdoParser.asInt(packet.args[0]);
    const y = RdoParser.asInt(packet.args[1]);
    const width = RdoParser.asInt(packet.args[2]);
    const height = RdoParser.asInt(packet.args[3]);

    if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
      return null;
    }

    return { x, y, width, height };
  } catch {
    return null;
  }
}

// ==========================================================================
// Tests
// ==========================================================================

describe('isRefreshAreaPush', () => {
  it('should return true for valid RefreshArea push packet', () => {
    const packet: RdoPacket = {
      raw: `C sel 41051000 call RefreshArea "*" "#462","#403","#3","#1","%data";`,
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: ['#462', '#403', '#3', '#1', '%data'],
    };
    expect(isRefreshAreaPush(packet)).toBe(true);
  });

  it('should return false for RefreshObject push', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
    };
    expect(isRefreshAreaPush(packet)).toBe(false);
  });

  it('should return false when type is RESPONSE', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'RESPONSE',
      member: 'RefreshArea',
      separator: '"*"',
    };
    expect(isRefreshAreaPush(packet)).toBe(false);
  });

  it('should return false when type is REQUEST', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'REQUEST',
      member: 'RefreshArea',
      separator: '"*"',
    };
    expect(isRefreshAreaPush(packet)).toBe(false);
  });

  it('should return false when member is undefined', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      separator: '"*"',
    };
    expect(isRefreshAreaPush(packet)).toBe(false);
  });

  it('should return false when separator is "^" (method call)', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"^"',
    };
    expect(isRefreshAreaPush(packet)).toBe(false);
  });

  it('should be case-sensitive for member name', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'refresharea',
      separator: '"*"',
    };
    expect(isRefreshAreaPush(packet)).toBe(false);
  });
});

describe('parseRefreshAreaPush', () => {
  it('should parse captured road build RefreshArea correctly', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: [`#${CAPTURED_ROAD_BUILD.x1}`, `#${CAPTURED_ROAD_BUILD.y1}`, '#3', '#1', '%data'],
    };
    const result = parseRefreshAreaPush(packet);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(462);
    expect(result!.y).toBe(403);
    expect(result!.width).toBe(3);
    expect(result!.height).toBe(1);
  });

  it('should return null when args are missing', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
    };
    expect(parseRefreshAreaPush(packet)).toBeNull();
  });

  it('should return null when args has fewer than 4 elements', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: ['#462', '#403', '#3'],
    };
    expect(parseRefreshAreaPush(packet)).toBeNull();
  });

  it('should return null when args contain non-numeric values', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: ['#abc', '#403', '#3', '#1'],
    };
    expect(parseRefreshAreaPush(packet)).toBeNull();
  });

  it('should handle large coordinate values', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: ['#9999', '#8888', '#100', '#50'],
    };
    const result = parseRefreshAreaPush(packet);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(9999);
    expect(result!.y).toBe(8888);
    expect(result!.width).toBe(100);
    expect(result!.height).toBe(50);
  });

  it('should handle single-tile area (width=1, height=1)', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: ['#100', '#200', '#1', '#1'],
    };
    const result = parseRefreshAreaPush(packet);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);
  });

  it('should parse with exactly 4 args (no data block)', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: ['#50', '#60', '#10', '#10'],
    };
    const result = parseRefreshAreaPush(packet);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(50);
    expect(result!.y).toBe(60);
  });

  it('should strip # prefix from coordinate args', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshArea',
      separator: '"*"',
      args: ['#300', '#400', '#5', '#5'],
    };
    const result = parseRefreshAreaPush(packet);
    expect(result).not.toBeNull();
    expect(result!.x).toBe(300);
    expect(result!.y).toBe(400);
  });
});
