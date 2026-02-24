/**
 * Protocol Validation: Building Focus / SwitchFocusEx
 *
 * Validates that StarpeaceSession.focusBuilding() produces correct RDO commands
 * matching the captured switch-focus scenario, and that responses are parsed
 * correctly into BuildingFocusInfo objects.
 *
 * Approach: Build the command with RdoProtocol.format() (same as spo_session),
 * feed through RdoMock.match() loaded with switch-focus scenario, and verify
 * both matching success and response parsing.
 */

jest.mock('net', () => ({
  Socket: jest.fn(),
}));
jest.mock('node-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

/// <reference path="../../__tests__/matchers/rdo-matchers.d.ts" />
import { describe, it, expect, beforeEach } from '@jest/globals';
import { RdoMock } from '../../../mock-server/rdo-mock';
import { RdoStrictValidator } from '../../../mock-server/rdo-strict-validator';
import { RdoProtocol } from '../../../server/rdo';
import { RdoVerb, RdoAction } from '../../../shared/types/protocol-types';
import {
  createSwitchFocusScenario,
  CAPTURED_FARM,
  CAPTURED_DRUG_STORE,
} from '../../../mock-server/scenarios/switch-focus-scenario';
import { parseBuildingFocusResponse } from '../../../server/map-parsers';
import { parsePropertyResponse } from '../../../server/rdo-helpers';
import { DEFAULT_VARIABLES } from '../../../mock-server/scenarios/scenario-variables';

describe('Protocol Validation: focusBuilding() / SwitchFocusEx', () => {
  let rdoMock: RdoMock;
  let validator: RdoStrictValidator;
  const scenario = createSwitchFocusScenario();
  const worldContextId = DEFAULT_VARIABLES.clientViewId; // '8161308'

  beforeEach(() => {
    rdoMock = new RdoMock();
    validator = new RdoStrictValidator();
    rdoMock.addScenario(scenario.rdo);
    validator.addScenario(scenario.rdo);
  });

  afterEach(() => {
    const errors = validator.getErrors();
    if (errors.length > 0) {
      throw new Error(validator.formatReport());
    }
  });

  /**
   * Build a SwitchFocusEx command string the same way spo_session.focusBuilding() does.
   * See spo_session.ts lines 658-665.
   */
  function buildFocusCommand(
    previousBuildingId: string,
    x: number,
    y: number,
    rid: number = 68,
  ): string {
    return RdoProtocol.format({
      raw: '',
      type: 'REQUEST',
      rid,
      verb: RdoVerb.SEL,
      targetId: worldContextId,
      action: RdoAction.CALL,
      member: 'SwitchFocusEx',
      separator: '"^"',
      args: [`#${previousBuildingId}`, `#${x}`, `#${y}`],
    });
  }

  describe('Command format and scenario matching', () => {
    it('should match the SwitchFocusEx scenario exchange for first focus', () => {
      const command = buildFocusCommand('0', 472, 392);
      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('sf-rdo-001');
    });

    it('should use "^" separator (method separator for call with RID)', () => {
      const command = buildFocusCommand('0', 472, 392);

      // The formatted command must contain the "^" method separator
      expect(command).toContain('"^"');
      // Must NOT contain push separator "*"
      expect(command).not.toContain('"*"');
    });

    it('should pass previous building ID as #0 for first focus', () => {
      const command = buildFocusCommand('0', 472, 392);

      // The first argument should be "#0" (integer-typed zero)
      expect(command).toContain('"#0"');
    });

    it('should pass coordinates as #int typed values', () => {
      const command = buildFocusCommand('0', 472, 392);

      // Coordinates must appear as integer-typed arguments
      expect(command).toContain('"#472"');
      expect(command).toContain('"#392"');
    });

    it('should target the worldContextId', () => {
      const command = buildFocusCommand('0', 472, 392);

      // Command should target the world context (clientViewId)
      expect(command).toContain(`sel ${worldContextId}`);
    });

    it('should chain previous building ID from first response into second focus', () => {
      // First focus: previous = 0
      const firstCommand = buildFocusCommand('0', 472, 392);
      const firstResult = rdoMock.match(firstCommand);
      validator.validate(RdoProtocol.parse(firstCommand), firstCommand);
      expect(firstResult).not.toBeNull();

      // Extract building ID from first response (farm objectId)
      const firstResponsePayload = parsePropertyResponse(
        firstResult!.response.replace(/^A\d+\s+/, ''),
        'res',
      );
      const firstFocusLines = firstResponsePayload.split(/\r?\n\r?/).filter(l => l.trim().length > 0);
      const firstBuildingId = firstFocusLines[0]; // Should be CAPTURED_FARM.objectId

      expect(firstBuildingId).toBe(CAPTURED_FARM.objectId);

      // Second focus: previous = farm's objectId — verify command format
      const secondCommand = buildFocusCommand(firstBuildingId, 477, 392, 72);
      // The second command should contain the farm's building ID as first arg
      expect(secondCommand).toContain(`"#${CAPTURED_FARM.objectId}"`);
      expect(secondCommand).toContain('"#477"');
      expect(secondCommand).toContain('"#392"');

      // Should still match a SwitchFocusEx exchange
      const secondResult = rdoMock.match(secondCommand);
      expect(secondResult).not.toBeNull();
    });
  });

  describe('Response parsing', () => {
    it('should extract buildingId from first focus response', () => {
      const command = buildFocusCommand('0', 472, 392);
      const result = rdoMock.match(command);
      expect(result).not.toBeNull();

      // Extract the res="..." value the same way spo_session does
      const responsePayload = parsePropertyResponse(
        result!.response.replace(/^A\d+\s+/, ''),
        'res',
      );
      const buildingInfo = parseBuildingFocusResponse(responsePayload, 472, 392);

      expect(buildingInfo.buildingId).toBe(CAPTURED_FARM.objectId);
    });

    it('should extract buildingName from first focus response', () => {
      const command = buildFocusCommand('0', 472, 392);
      const result = rdoMock.match(command);
      expect(result).not.toBeNull();

      const responsePayload = parsePropertyResponse(
        result!.response.replace(/^A\d+\s+/, ''),
        'res',
      );
      const buildingInfo = parseBuildingFocusResponse(responsePayload, 472, 392);

      expect(buildingInfo.buildingName).toBe(CAPTURED_FARM.name);
    });

    it('should have Drug Store data in sf-rdo-002 scenario response', () => {
      // Directly verify the second scenario exchange response contains Drug Store data
      const drugStoreExchange = scenario.rdo.exchanges.find(e => e.id === 'sf-rdo-002');
      expect(drugStoreExchange).toBeDefined();

      const responsePayload = parsePropertyResponse(
        drugStoreExchange!.response.replace(/^A\d+\s+/, ''),
        'res',
      );
      const buildingInfo = parseBuildingFocusResponse(responsePayload, 477, 392);

      expect(buildingInfo.buildingId).toBe(CAPTURED_DRUG_STORE.objectId);
      expect(buildingInfo.ownerName).toBe(CAPTURED_DRUG_STORE.ownerCompany);
    });

    it('should extract ownerName from focus response', () => {
      const command = buildFocusCommand('0', 472, 392);
      const result = rdoMock.match(command);
      expect(result).not.toBeNull();

      const responsePayload = parsePropertyResponse(
        result!.response.replace(/^A\d+\s+/, ''),
        'res',
      );
      const buildingInfo = parseBuildingFocusResponse(responsePayload, 472, 392);

      expect(buildingInfo.ownerName).toBe(CAPTURED_FARM.ownerCompany);
    });

    it('should populate coordinates from input parameters', () => {
      const command = buildFocusCommand('0', 472, 392);
      const result = rdoMock.match(command);
      expect(result).not.toBeNull();

      const responsePayload = parsePropertyResponse(
        result!.response.replace(/^A\d+\s+/, ''),
        'res',
      );
      const buildingInfo = parseBuildingFocusResponse(responsePayload, 472, 392);

      expect(buildingInfo.x).toBe(472);
      expect(buildingInfo.y).toBe(392);
    });
  });
});
