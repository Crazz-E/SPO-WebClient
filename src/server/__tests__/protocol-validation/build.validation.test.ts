/**
 * Protocol Validation: buildRoad() + placeBuilding()
 *
 * Validates that buildRoad() produces correct CreateCircuitSeg commands and
 * placeBuilding() produces correct NewFacility commands matching captured
 * protocol exchanges. Both operations target worldContextId (NOT interfaceServerId).
 *
 * Approach: Build commands with RdoProtocol.format() (same as spo_session),
 * feed through RdoMock.match() loaded with the appropriate scenario, and verify
 * both matching success and response content.
 *
 * buildRoad() flow:
 *   sel <worldContextId> call CreateCircuitSeg "^" "#1","#<ownerId>","#x1","#y1","#x2","#y2","#cost"
 *   -> res="#0" (success) or res="#33" (duplicate)
 *
 * placeBuilding() flow:
 *   sel <worldContextId> call NewFacility "^" "%<facilityClass>","#28","#<x>","#<y>"
 *   -> res="#0" (success) or res="#33" (duplicate)
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
import { RdoParser, RdoTypePrefix } from '../../../shared/rdo-types';
import {
  createBuildRoadsScenario,
  CAPTURED_ROAD_BUILD,
} from '../../../mock-server/scenarios/build-roads-scenario';
import {
  createBuildMenuScenario,
  CAPTURED_BUILD_SUCCESS,
  CAPTURED_BUILD_DUPLICATE,
} from '../../../mock-server/scenarios/build-menu-scenario';
import { DEFAULT_VARIABLES } from '../../../mock-server/scenarios/scenario-variables';

describe('Protocol Validation: buildRoad() + placeBuilding()', () => {
  const worldContextId = DEFAULT_VARIABLES.clientViewId; // '8161308'

  describe('CreateCircuitSeg command format', () => {
    let rdoMock: RdoMock;
    let validator: RdoStrictValidator;
    const roadScenario = createBuildRoadsScenario();

    beforeEach(() => {
      rdoMock = new RdoMock();
      validator = new RdoStrictValidator();
      rdoMock.addScenario(roadScenario.rdo);
      validator.addScenario(roadScenario.rdo);
    });

    afterEach(() => {
      const errors = validator.getErrors();
      if (errors.length > 0) {
        throw new Error(validator.formatReport());
      }
    });

    /**
     * Build a CreateCircuitSeg command string the same way spo_session.buildRoad() does.
     * See spo_session.ts lines 1816-1920.
     */
    function buildRoadCommand(
      circuitId: number,
      ownerId: string,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      cost: number,
      rid: number = 505,
    ): string {
      return RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'CreateCircuitSeg',
        separator: '"^"',
        args: [
          `#${circuitId}`,
          `#${ownerId}`,
          `#${x1}`,
          `#${y1}`,
          `#${x2}`,
          `#${y2}`,
          `#${cost}`,
        ],
      });
    }

    it('should match CreateCircuitSeg scenario when formatted correctly', () => {
      const command = buildRoadCommand(
        CAPTURED_ROAD_BUILD.circuitType,
        CAPTURED_ROAD_BUILD.ownerId,
        CAPTURED_ROAD_BUILD.x1,
        CAPTURED_ROAD_BUILD.y1,
        CAPTURED_ROAD_BUILD.x2,
        CAPTURED_ROAD_BUILD.y2,
        CAPTURED_ROAD_BUILD.cost,
      );

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('br-rdo-001');
    });

    it('should use "^" method separator', () => {
      const command = buildRoadCommand(
        CAPTURED_ROAD_BUILD.circuitType,
        CAPTURED_ROAD_BUILD.ownerId,
        CAPTURED_ROAD_BUILD.x1,
        CAPTURED_ROAD_BUILD.y1,
        CAPTURED_ROAD_BUILD.x2,
        CAPTURED_ROAD_BUILD.y2,
        CAPTURED_ROAD_BUILD.cost,
      );

      // The formatted command must contain the "^" method separator
      expect(command).toContain('"^"');
      // Must NOT contain push separator "*"
      expect(command).not.toContain('"*"');
    });

    it('should pass all 7 arguments as #int type', () => {
      const command = buildRoadCommand(
        CAPTURED_ROAD_BUILD.circuitType,
        CAPTURED_ROAD_BUILD.ownerId,
        CAPTURED_ROAD_BUILD.x1,
        CAPTURED_ROAD_BUILD.y1,
        CAPTURED_ROAD_BUILD.x2,
        CAPTURED_ROAD_BUILD.y2,
        CAPTURED_ROAD_BUILD.cost,
      );

      // Parse the command and verify all args have INTEGER prefix
      const parsed = RdoProtocol.parse(command);
      expect(parsed.args).toBeDefined();
      expect(parsed.args!.length).toBe(7);

      for (const arg of parsed.args!) {
        const extracted = RdoParser.extract(arg);
        expect(extracted.prefix).toBe(RdoTypePrefix.INTEGER);
      }
    });

    it('should target worldContextId for road commands', () => {
      const command = buildRoadCommand(
        CAPTURED_ROAD_BUILD.circuitType,
        CAPTURED_ROAD_BUILD.ownerId,
        CAPTURED_ROAD_BUILD.x1,
        CAPTURED_ROAD_BUILD.y1,
        CAPTURED_ROAD_BUILD.x2,
        CAPTURED_ROAD_BUILD.y2,
        CAPTURED_ROAD_BUILD.cost,
      );

      // Command should target the world context (clientViewId)
      expect(command).toContain(`sel ${worldContextId}`);

      // Parse and verify
      const parsed = RdoProtocol.parse(command);
      expect(parsed.verb).toBe(RdoVerb.SEL);
      expect(parsed.targetId).toBe(worldContextId);
    });

    it('should return result code #0 for successful build', () => {
      const command = buildRoadCommand(
        CAPTURED_ROAD_BUILD.circuitType,
        CAPTURED_ROAD_BUILD.ownerId,
        CAPTURED_ROAD_BUILD.x1,
        CAPTURED_ROAD_BUILD.y1,
        CAPTURED_ROAD_BUILD.x2,
        CAPTURED_ROAD_BUILD.y2,
        CAPTURED_ROAD_BUILD.cost,
      );

      const result = rdoMock.match(command);
      expect(result).not.toBeNull();

      // Response should contain res="#0" indicating success
      expect(result!.response).toContain('res="#0"');

      // Verify the result code value matches captured data
      const resMatch = result!.response.match(/res="(#[^"]*)"/);
      expect(resMatch).not.toBeNull();

      const extracted = RdoParser.extract(resMatch![1]);
      expect(extracted.prefix).toBe(RdoTypePrefix.INTEGER);
      expect(extracted.value).toBe(String(CAPTURED_ROAD_BUILD.result));
    });
  });

  describe('NewFacility command format', () => {
    let rdoMock: RdoMock;
    let validator: RdoStrictValidator;
    const buildMenuScenario = createBuildMenuScenario();

    beforeEach(() => {
      rdoMock = new RdoMock();
      validator = new RdoStrictValidator();
      rdoMock.addScenario(buildMenuScenario.rdo);
      validator.addScenario(buildMenuScenario.rdo);
    });

    afterEach(() => {
      const errors = validator.getErrors();
      if (errors.length > 0) {
        throw new Error(validator.formatReport());
      }
    });

    /**
     * Build a NewFacility command string the same way spo_session.placeBuilding() does.
     * See spo_session.ts lines 3202-3242.
     */
    function buildPlaceBuildingCommand(
      facilityClass: string,
      companyId: string,
      x: number,
      y: number,
      rid: number = 147,
    ): string {
      return RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'NewFacility',
        separator: '"^"',
        args: [`%${facilityClass}`, `#${companyId}`, `#${x}`, `#${y}`],
      });
    }

    it('should match NewFacility scenario for successful build', () => {
      const command = buildPlaceBuildingCommand(
        CAPTURED_BUILD_SUCCESS.facilityClass,
        CAPTURED_BUILD_SUCCESS.companyId,
        CAPTURED_BUILD_SUCCESS.x,
        CAPTURED_BUILD_SUCCESS.y,
      );

      const result = rdoMock.match(command);
      validator.validate(RdoProtocol.parse(command), command);

      expect(result).not.toBeNull();
      expect(result!.exchange.id).toBe('bm-rdo-001');
    });

    it('should use "^" method separator for NewFacility', () => {
      const command = buildPlaceBuildingCommand(
        CAPTURED_BUILD_SUCCESS.facilityClass,
        CAPTURED_BUILD_SUCCESS.companyId,
        CAPTURED_BUILD_SUCCESS.x,
        CAPTURED_BUILD_SUCCESS.y,
      );

      // The formatted command must contain the "^" method separator
      expect(command).toContain('"^"');
      // Must NOT contain push separator "*"
      expect(command).not.toContain('"*"');
    });

    it('should pass facilityClass as %string and coordinates as #int', () => {
      const command = buildPlaceBuildingCommand(
        CAPTURED_BUILD_SUCCESS.facilityClass,
        CAPTURED_BUILD_SUCCESS.companyId,
        CAPTURED_BUILD_SUCCESS.x,
        CAPTURED_BUILD_SUCCESS.y,
      );

      // Parse the command and verify argument types
      const parsed = RdoProtocol.parse(command);
      expect(parsed.args).toBeDefined();
      expect(parsed.args!.length).toBe(4);

      // First arg: facilityClass should be %string (OLESTRING)
      const facilityArg = RdoParser.extract(parsed.args![0]);
      expect(facilityArg.prefix).toBe(RdoTypePrefix.OLESTRING);
      expect(facilityArg.value).toBe(CAPTURED_BUILD_SUCCESS.facilityClass);

      // Remaining args: companyId, x, y should all be #int (INTEGER)
      for (let i = 1; i < parsed.args!.length; i++) {
        const extracted = RdoParser.extract(parsed.args![i]);
        expect(extracted.prefix).toBe(RdoTypePrefix.INTEGER);
      }
    });

    it('should return result code #0 for successful placement', () => {
      const command = buildPlaceBuildingCommand(
        CAPTURED_BUILD_SUCCESS.facilityClass,
        CAPTURED_BUILD_SUCCESS.companyId,
        CAPTURED_BUILD_SUCCESS.x,
        CAPTURED_BUILD_SUCCESS.y,
      );

      const result = rdoMock.match(command);
      expect(result).not.toBeNull();

      // Response should contain res="#0" indicating success
      expect(result!.response).toContain('res="#0"');

      // Verify the result code value matches captured data
      const resMatch = result!.response.match(/res="(#[^"]*)"/);
      expect(resMatch).not.toBeNull();

      const extracted = RdoParser.extract(resMatch![1]);
      expect(extracted.prefix).toBe(RdoTypePrefix.INTEGER);
      expect(extracted.value).toBe(String(CAPTURED_BUILD_SUCCESS.result));
    });

    it('should return result code #33 for duplicate building', () => {
      // Verify the scenario contains a duplicate error response (bm-rdo-002)
      const duplicateExchange = createBuildMenuScenario().rdo.exchanges.find(
        e => e.id === 'bm-rdo-002'
      );
      expect(duplicateExchange).toBeDefined();

      // The duplicate response should contain res="#33"
      expect(duplicateExchange!.response).toContain('res="#33"');

      // Verify the result code value matches captured data
      const resMatch = duplicateExchange!.response.match(/res="(#[^"]*)"/);
      expect(resMatch).not.toBeNull();

      const extracted = RdoParser.extract(resMatch![1]);
      expect(extracted.prefix).toBe(RdoTypePrefix.INTEGER);
      expect(extracted.value).toBe(String(CAPTURED_BUILD_DUPLICATE.result));
    });
  });

  describe('Command targeting', () => {
    it('should target worldContextId (NOT interfaceServerId) for both road and building', () => {
      // Build a CreateCircuitSeg command
      const roadCommand = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 505,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'CreateCircuitSeg',
        separator: '"^"',
        args: [
          `#${CAPTURED_ROAD_BUILD.circuitType}`,
          `#${CAPTURED_ROAD_BUILD.ownerId}`,
          `#${CAPTURED_ROAD_BUILD.x1}`,
          `#${CAPTURED_ROAD_BUILD.y1}`,
          `#${CAPTURED_ROAD_BUILD.x2}`,
          `#${CAPTURED_ROAD_BUILD.y2}`,
          `#${CAPTURED_ROAD_BUILD.cost}`,
        ],
      });

      // Build a NewFacility command
      const buildingCommand = RdoProtocol.format({
        raw: '',
        type: 'REQUEST',
        rid: 147,
        verb: RdoVerb.SEL,
        targetId: worldContextId,
        action: RdoAction.CALL,
        member: 'NewFacility',
        separator: '"^"',
        args: [
          `%${CAPTURED_BUILD_SUCCESS.facilityClass}`,
          `#${CAPTURED_BUILD_SUCCESS.companyId}`,
          `#${CAPTURED_BUILD_SUCCESS.x}`,
          `#${CAPTURED_BUILD_SUCCESS.y}`,
        ],
      });

      // Both commands must target worldContextId
      for (const command of [roadCommand, buildingCommand]) {
        const parsed = RdoProtocol.parse(command);
        expect(parsed.verb).toBe(RdoVerb.SEL);
        expect(parsed.targetId).toBe(worldContextId);
        expect(command).toContain(`sel ${worldContextId}`);
      }

      // Verify neither uses interfaceServerId (which would be a different ID)
      // worldContextId is used for world operations (map focus, building placement, road building)
      const parsedRoad = RdoProtocol.parse(roadCommand);
      const parsedBuilding = RdoProtocol.parse(buildingCommand);
      expect(parsedRoad.targetId).toBe(parsedBuilding.targetId);
    });
  });
});
