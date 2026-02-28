/**
 * RDO Protocol Tests - RefreshObject Push Detection & Parsing
 *
 * Tests isRefreshObjectPush() and parseRefreshObjectPush() logic
 * from spo_session.ts (lines 723-770).
 *
 * Uses RdoPacket interface from protocol-types.ts and captured data
 * from refresh-object-scenario.ts as ground truth.
 */

import { describe, it, expect } from '@jest/globals';
import type { RdoPacket } from '../../../shared/types/protocol-types';
import type { BuildingFocusInfo } from '../../../shared/types';
import {
  CAPTURED_REFRESH_OBJECT,
  type CapturedRefreshObjectData,
} from '../../../mock-server/scenarios/refresh-object-scenario';
import { cleanPayload } from '../../rdo-helpers';
import { parseBuildingFocusResponse } from '../../map-parsers';
import { RdoParser } from '../../../shared/rdo-types';

// ==========================================================================
// Replicate isRefreshObjectPush logic
// ==========================================================================
function isRefreshObjectPush(packet: RdoPacket): boolean {
  return packet.type === 'PUSH' &&
         packet.member === 'RefreshObject' &&
         packet.separator === '"*"';
}

// ==========================================================================
// Replicate parseRefreshObjectPush logic (matches updated spo_session.ts)
// Returns { buildingId, kindOfChange, buildingInfo } — never null just
// because no building is focused.
// ==========================================================================
function parseRefreshObjectPush(
  packet: RdoPacket,
  currentFocusedCoords: { x: number; y: number } | null
): { buildingId: string; kindOfChange: number; buildingInfo: BuildingFocusInfo | null } | null {
  try {
    if (!packet.args || packet.args.length < 2) {
      return null;
    }

    const buildingId = RdoParser.getValue(packet.args[0]);
    const kindOfChange = RdoParser.asInt(packet.args[1]);

    let buildingInfo: BuildingFocusInfo | null = null;
    if (currentFocusedCoords && packet.args.length >= 3) {
      let dataString = packet.args[2];
      dataString = cleanPayload(dataString);
      if (dataString.startsWith('%')) {
        dataString = dataString.substring(1);
      }
      const fullPayload = buildingId + '\n' + dataString;
      try {
        buildingInfo = parseBuildingFocusResponse(
          fullPayload,
          currentFocusedCoords.x,
          currentFocusedCoords.y
        );
      } catch {
        buildingInfo = null;
      }
    }

    return { buildingId, kindOfChange, buildingInfo };
  } catch {
    return null;
  }
}

// ==========================================================================
// Helper to build a RefreshObject RdoPacket from captured data
// ==========================================================================
function makeRefreshObjectPacket(data: CapturedRefreshObjectData): RdoPacket {
  // Build the ExtraInfo string per InterfaceServer.pas GetFacilityExtraInfo:
  // "<shortName>\n<companyName>\n<salesSummary>\n<revenue>:-:<details>:-:<hints>:-:"
  const extraInfo = [
    '10', // shortName (Drug Store display name)
    data.companyName,
    data.salesSummary,
    `${data.revenue}:-:${data.detailsText}:-:${data.hintsText}:-:`,
  ].join('\n');

  return {
    raw: `C sel ${data.tycoonProxyId} call RefreshObject "*" "#${data.buildingId}","#${data.statusFlag}","%${extraInfo}";`,
    type: 'PUSH',
    verb: undefined,
    targetId: data.tycoonProxyId,
    action: undefined,
    member: 'RefreshObject',
    separator: '"*"',
    args: [`#${data.buildingId}`, `#${data.statusFlag}`, `%${extraInfo}`],
  };
}

// ==========================================================================
// Tests
// ==========================================================================

describe('isRefreshObjectPush', () => {
  it('should return true for valid RefreshObject push packet', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    expect(isRefreshObjectPush(packet)).toBe(true);
  });

  it('should return false when type is REQUEST', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'REQUEST',
      member: 'RefreshObject',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when type is RESPONSE', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'RESPONSE',
      member: 'RefreshObject',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when member is not RefreshObject', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshTycoon',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when separator is "^" (method call)', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"^"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when member is undefined', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should return false when separator is undefined', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });

  it('should be case-sensitive for member name', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'refreshobject',
      separator: '"*"',
    };
    expect(isRefreshObjectPush(packet)).toBe(false);
  });
});

describe('parseRefreshObjectPush', () => {
  const FOCUSED_COORDS = { x: 100, y: 200 };

  it('should return buildingId and kindOfChange even when no focused coords', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, null);
    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe(CAPTURED_REFRESH_OBJECT.buildingId);
    expect(result!.kindOfChange).toBe(0);
    expect(result!.buildingInfo).toBeNull();
  });

  it('should return null when args are missing', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
    };
    expect(parseRefreshObjectPush(packet, FOCUSED_COORDS)).toBeNull();
  });

  it('should parse with only 2 args (no ExtraInfo) returning null buildingInfo', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#127839460', '#1'],
    };
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);
    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe('127839460');
    expect(result!.kindOfChange).toBe(1);
    expect(result!.buildingInfo).toBeNull();
  });

  it('should parse captured RefreshObject data correctly', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe(CAPTURED_REFRESH_OBJECT.buildingId);
    expect(result!.buildingInfo).not.toBeNull();
    expect(result!.buildingInfo!.buildingId).toBe(CAPTURED_REFRESH_OBJECT.buildingId);
  });

  it('should extract company name from parsed result', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingInfo!.ownerName).toBe(CAPTURED_REFRESH_OBJECT.companyName);
  });

  it('should extract revenue from parsed result', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingInfo!.revenue).toContain('$');
  });

  it('should extract details text from parsed result', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingInfo!.detailsText).toContain('Drug Store');
    expect(result!.buildingInfo!.detailsText).toContain('Upgrade Level');
  });

  it('should extract hints text from parsed result', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingInfo!.hintsText).toContain('Hint');
  });

  it('should use focused coordinates for x and y', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, { x: 300, y: 400 });

    expect(result).not.toBeNull();
    expect(result!.buildingInfo!.x).toBe(300);
    expect(result!.buildingInfo!.y).toBe(400);
  });

  it('should strip # prefix from building ID arg', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingId).not.toContain('#');
    expect(result!.buildingId).toMatch(/^\d+$/);
  });

  it('should handle :-: separator in ExtraInfo correctly', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingInfo!.detailsText).not.toContain(':-:');
    expect(result!.buildingInfo!.hintsText).not.toContain(':-:');
  });

  it('should handle building with minimal data (just ID and name)', () => {
    const minimalPacket: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#999', '#0', '%MinimalBuilding'],
    };

    const result = parseRefreshObjectPush(minimalPacket, FOCUSED_COORDS);

    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe('999');
  });

  it('should handle empty extraInfo fields gracefully', () => {
    const emptyDataPacket: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#555', '#0', '%EmptyBuilding\n\n\n:-::-::-:'],
    };

    const result = parseRefreshObjectPush(emptyDataPacket, FOCUSED_COORDS);
    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe('555');
  });
});

describe('kindOfChange parsing', () => {
  const FOCUSED_COORDS = { x: 100, y: 200 };

  it('should extract kindOfChange=0 (fchStatus)', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);
    expect(result).not.toBeNull();
    expect(result!.kindOfChange).toBe(0);
  });

  it('should extract kindOfChange=1 (fchStructure)', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#999', '#1', '%SomeBuilding\nSomeCo\nSales\n$0:-:details:-:hints:-:'],
    };
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);
    expect(result).not.toBeNull();
    expect(result!.kindOfChange).toBe(1);
  });

  it('should extract kindOfChange=2 (fchDestruction)', () => {
    const packet: RdoPacket = {
      raw: '',
      type: 'PUSH',
      member: 'RefreshObject',
      separator: '"*"',
      args: ['#999', '#2', '%'],
    };
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);
    expect(result).not.toBeNull();
    expect(result!.kindOfChange).toBe(2);
  });

  it('should still parse building info when coords are available', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, FOCUSED_COORDS);
    expect(result!.buildingInfo).not.toBeNull();
    expect(result!.buildingInfo!.buildingId).toBe(CAPTURED_REFRESH_OBJECT.buildingId);
  });

  it('should return buildingInfo=null when no focused coords', () => {
    const packet = makeRefreshObjectPacket(CAPTURED_REFRESH_OBJECT);
    const result = parseRefreshObjectPush(packet, null);
    expect(result).not.toBeNull();
    expect(result!.buildingId).toBe(CAPTURED_REFRESH_OBJECT.buildingId);
    expect(result!.kindOfChange).toBe(0);
    expect(result!.buildingInfo).toBeNull();
  });
});

describe('cleanPayload behavior for RefreshObject args', () => {
  it('should remove outer quotes from args', () => {
    const cleaned = cleanPayload('"#127839460"');
    expect(cleaned).toBe('127839460');
  });

  it('should strip % prefix after quote removal', () => {
    const cleaned = cleanPayload('"%Yellow Inc."');
    expect(cleaned).toBe('Yellow Inc.');
  });

  it('should strip # prefix after quote removal', () => {
    const cleaned = cleanPayload('"#0"');
    expect(cleaned).toBe('0');
  });

  it('should handle res= format', () => {
    const cleaned = cleanPayload('res="#6805584"');
    expect(cleaned).toBe('6805584');
  });

  it('should handle plain string without quotes', () => {
    const cleaned = cleanPayload('%Hello');
    expect(cleaned).toBe('Hello');
  });
});

describe('CAPTURED_REFRESH_OBJECT ground truth', () => {
  it('should have expected building ID', () => {
    expect(CAPTURED_REFRESH_OBJECT.buildingId).toBe('127839460');
  });

  it('should have expected tycoon proxy ID', () => {
    expect(CAPTURED_REFRESH_OBJECT.tycoonProxyId).toBe('40133496');
  });

  it('should have expected company name', () => {
    expect(CAPTURED_REFRESH_OBJECT.companyName).toBe('Yellow Inc.');
  });

  it('should have expected revenue format', () => {
    expect(CAPTURED_REFRESH_OBJECT.revenue).toMatch(/\(-?\$[\d,]+\/h\)/);
  });

  it('should have non-empty details text', () => {
    expect(CAPTURED_REFRESH_OBJECT.detailsText.length).toBeGreaterThan(0);
    expect(CAPTURED_REFRESH_OBJECT.detailsText).toContain('Drug Store');
  });

  it('should have non-empty hints text', () => {
    expect(CAPTURED_REFRESH_OBJECT.hintsText.length).toBeGreaterThan(0);
    expect(CAPTURED_REFRESH_OBJECT.hintsText).toContain('Hint');
  });
});
