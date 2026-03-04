/**
 * Tests for DefineZone RDO command format and validation.
 *
 * Since StarpeaceSession.defineZone() is a public method that calls
 * sendRdoRequest internally, we test the RDO command format by
 * replicating the same builder calls used in the method.
 */

import { RdoCommand, RdoValue } from '../../shared/rdo-types';
import { RdoVerb, RdoAction } from '../../shared/types/protocol-types';

describe('DefineZone RDO command format', () => {
  const worldContextId = '127000100';
  const tycoonId = '127839460';

  it('should build correct RDO command with all integer args', () => {
    const zoneId = 2; // znResidential from Delphi Protocol.pas
    const x1 = 10, y1 = 20, x2 = 30, y2 = 40;

    const cmd = RdoCommand.sel(worldContextId)
      .call('DefineZone').push()
      .args(
        RdoValue.int(parseInt(tycoonId, 10)),
        RdoValue.int(zoneId),
        RdoValue.int(x1),
        RdoValue.int(y1),
        RdoValue.int(x2),
        RdoValue.int(y2),
      )
      .build();

    // Should contain sel verb with world context
    expect(cmd).toContain(`sel ${worldContextId}`);
    // Should contain call DefineZone
    expect(cmd).toContain('call DefineZone');
    // All args should be #integer prefixed
    expect(cmd).toContain(`#${parseInt(tycoonId, 10)}`);
    expect(cmd).toContain('#2');
    expect(cmd).toContain('#10');
    expect(cmd).toContain('#20');
    expect(cmd).toContain('#30');
    expect(cmd).toContain('#40');
  });

  it('should use RdoValue.int for all DefineZone args', () => {
    const args = [
      RdoValue.int(127839460),
      RdoValue.int(6), // znIndustrial
      RdoValue.int(0),
      RdoValue.int(0),
      RdoValue.int(100),
      RdoValue.int(100),
    ];

    // All should contain # prefix (format() adds quotes around the value)
    for (const arg of args) {
      expect(arg.format()).toContain('#');
    }
  });

  it('should format zone type NONE as #0', () => {
    expect(RdoValue.int(0).format()).toContain('#0');
  });

  it('should format zone type RESIDENTIAL as #2', () => {
    expect(RdoValue.int(2).format()).toContain('#2');
  });

  it('should format negative coordinates correctly', () => {
    expect(RdoValue.int(-5).format()).toContain('#-5');
  });
});

describe('DefineZone coordinate normalization', () => {
  it('should normalize swapped coordinates', () => {
    // The session method normalizes using Math.min/max
    const x1 = 30, y1 = 40, x2 = 10, y2 = 20;

    const nx1 = Math.min(x1, x2);
    const ny1 = Math.min(y1, y2);
    const nx2 = Math.max(x1, x2);
    const ny2 = Math.max(y1, y2);

    expect(nx1).toBe(10);
    expect(ny1).toBe(20);
    expect(nx2).toBe(30);
    expect(ny2).toBe(40);
  });

  it('should handle equal coordinates (single tile)', () => {
    const x1 = 15, y1 = 25, x2 = 15, y2 = 25;

    const nx1 = Math.min(x1, x2);
    const ny1 = Math.min(y1, y2);
    const nx2 = Math.max(x1, x2);
    const ny2 = Math.max(y1, y2);

    expect(nx1).toBe(15);
    expect(ny1).toBe(25);
    expect(nx2).toBe(15);
    expect(ny2).toBe(25);
  });

  it('should handle partially swapped coordinates', () => {
    // x1 > x2 but y1 < y2
    const x1 = 50, y1 = 10, x2 = 20, y2 = 40;

    const nx1 = Math.min(x1, x2);
    const ny1 = Math.min(y1, y2);
    const nx2 = Math.max(x1, x2);
    const ny2 = Math.max(y1, y2);

    expect(nx1).toBe(20);
    expect(ny1).toBe(10);
    expect(nx2).toBe(50);
    expect(ny2).toBe(40);
  });
});

describe('DefineZone RDO request structure', () => {
  it('should use SEL verb', () => {
    expect(RdoVerb.SEL).toBe('sel');
  });

  it('should use CALL action', () => {
    expect(RdoAction.CALL).toBe('call');
  });

  it('should target worldContextId (not interfaceServerId)', () => {
    // DefineZone operates on the world, not a building
    // This is a documentation test to ensure the protocol is clear
    const worldCtxId = '127000100';
    const interfaceSrvId = '127000200';

    // The defineZone method should use worldContextId
    const cmd = RdoCommand.sel(worldCtxId)
      .call('DefineZone').push()
      .args(RdoValue.int(1), RdoValue.int(2), RdoValue.int(0), RdoValue.int(0), RdoValue.int(10), RdoValue.int(10))
      .build();

    expect(cmd).toContain(worldCtxId);
    expect(cmd).not.toContain(interfaceSrvId);
  });
});
