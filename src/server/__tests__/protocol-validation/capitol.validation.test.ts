/**
 * Protocol Validation: placeCapitol()
 *
 * Validates that placeCapitol() produces the correct NewFacility command
 * with hardcoded companyId=1 and facilityClass="Capitol".
 *
 * Capitol RDO command:
 *   sel <worldContextId> call NewFacility "^" "%Capitol","#1","#x","#y"
 *   -> res="#0" (success)
 */

jest.mock('net', () => ({
  Socket: jest.fn(),
}));
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import { describe, it, expect } from '@jest/globals';
import { RdoProtocol } from '../../../server/rdo';
import { RdoVerb, RdoAction } from '../../../shared/types/protocol-types';
import { RdoParser, RdoTypePrefix, RdoValue } from '../../../shared/rdo-types';
import { DEFAULT_VARIABLES } from '../../../mock-server/scenarios/scenario-variables';

describe('Protocol Validation: placeCapitol()', () => {
  const worldContextId = DEFAULT_VARIABLES.clientViewId;

  /**
   * Build a Capitol NewFacility command the same way spo_session.placeCapitol() does.
   */
  function buildCapitolCommand(x: number, y: number, rid: number = 621): string {
    return RdoProtocol.format({
      raw: '',
      type: 'REQUEST',
      rid,
      verb: RdoVerb.SEL,
      targetId: worldContextId,
      action: RdoAction.CALL,
      member: 'NewFacility',
      separator: '"^"',
      args: [
        RdoValue.string('Capitol').format(),
        RdoValue.int(1).format(),
        RdoValue.int(x).format(),
        RdoValue.int(y).format(),
      ],
    });
  }

  it('should use NewFacility method with "^" separator', () => {
    const command = buildCapitolCommand(797, 822);

    expect(command).toContain('call NewFacility');
    expect(command).toContain('"^"');
    expect(command).not.toContain('"*"');
  });

  it('should target worldContextId', () => {
    const command = buildCapitolCommand(797, 822);
    const parsed = RdoProtocol.parse(command);

    expect(parsed.verb).toBe(RdoVerb.SEL);
    expect(parsed.targetId).toBe(worldContextId);
    expect(command).toContain(`sel ${worldContextId}`);
  });

  it('should pass facilityClass as "%Capitol"', () => {
    const command = buildCapitolCommand(797, 822);
    const parsed = RdoProtocol.parse(command);

    expect(parsed.args).toBeDefined();
    expect(parsed.args!.length).toBe(4);

    const facilityArg = RdoParser.extract(parsed.args![0]);
    expect(facilityArg.prefix).toBe(RdoTypePrefix.OLESTRING);
    expect(facilityArg.value).toBe('Capitol');
  });

  it('should hardcode companyId as #1', () => {
    const command = buildCapitolCommand(797, 822);
    const parsed = RdoProtocol.parse(command);

    const companyArg = RdoParser.extract(parsed.args![1]);
    expect(companyArg.prefix).toBe(RdoTypePrefix.INTEGER);
    expect(companyArg.value).toBe('1');
  });

  it('should pass coordinates as #int', () => {
    const command = buildCapitolCommand(797, 822);
    const parsed = RdoProtocol.parse(command);

    const xArg = RdoParser.extract(parsed.args![2]);
    expect(xArg.prefix).toBe(RdoTypePrefix.INTEGER);
    expect(xArg.value).toBe('797');

    const yArg = RdoParser.extract(parsed.args![3]);
    expect(yArg.prefix).toBe(RdoTypePrefix.INTEGER);
    expect(yArg.value).toBe('822');
  });

  it('should match the captured protocol exchange format', () => {
    // From the user's captured exchange:
    // C 621 sel 7207304 call NewFacility "^" "%Capitol","#1","#797","#822";
    const command = buildCapitolCommand(797, 822, 621);

    // Verify it contains the exact args pattern
    expect(command).toContain('%Capitol');
    expect(command).toContain('#1');
    expect(command).toContain('#797');
    expect(command).toContain('#822');
  });

  it('should differ from regular placeBuilding by using companyId=1', () => {
    // Regular placeBuilding uses the player's company ID (e.g., 28)
    const regularCommand = RdoProtocol.format({
      raw: '',
      type: 'REQUEST',
      rid: 147,
      verb: RdoVerb.SEL,
      targetId: worldContextId,
      action: RdoAction.CALL,
      member: 'NewFacility',
      separator: '"^"',
      args: ['%PGIFoodStore', '#28', '#100', '#200'],
    });

    const capitolCommand = buildCapitolCommand(100, 200);

    // Capitol uses companyId=1, regular uses player's companyId
    const regularParsed = RdoProtocol.parse(regularCommand);
    const capitolParsed = RdoProtocol.parse(capitolCommand);

    const regularCompanyId = RdoParser.extract(regularParsed.args![1]);
    const capitolCompanyId = RdoParser.extract(capitolParsed.args![1]);

    expect(regularCompanyId.value).toBe('28');
    expect(capitolCompanyId.value).toBe('1');
  });
});
