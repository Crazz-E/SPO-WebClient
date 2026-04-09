// @ts-nocheck
/**
 * RDO Protocol Tests - Building Operations
 * Tests for building focus, property updates, deletion, and rename
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockRdoSession } from '../../__mocks__/mock-rdo-session';
import { RdoCommand, RdoValue } from '../../../shared/rdo-types';

describe('RDO Building Operations', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  describe('Building Focus (RDOFocusObject)', () => {
    it('should format RDOFocusObject command correctly', async () => {
      const worldId = 123456;
      const x = 100;
      const y = 200;

      const cmd = await mockSession.simulateBuildingFocus(worldId, x, y);

      expect(cmd).toMatchRdoCallFormat('RDOFocusObject');
      expect(cmd).toContain(`#${x}`);
      expect(cmd).toContain(`#${y}`);
    });

    it('should use integer type prefix for coordinates', async () => {
      const cmd = await mockSession.simulateBuildingFocus(1, 50, 75);

      expect(cmd).toContain('"#50"');
      expect(cmd).toContain('"#75"');
    });

    it('should use method separator (^) for RDOFocusObject', async () => {
      const cmd = await mockSession.simulateBuildingFocus(1, 100, 200);

      expect(cmd).toContain('"^"');
    });

    it('should handle edge coordinates', async () => {
      // Test corners of map
      await mockSession.simulateBuildingFocus(1, 0, 0);
      await mockSession.simulateBuildingFocus(1, 1999, 1999);

      const commands = mockSession.getCommandHistory();
      expect(commands[0]).toContain('"#0","#0"');
      expect(commands[1]).toContain('"#1999","#1999"');
    });
  });

  describe('Building Property Updates (RDOSetPrice)', () => {
    it('should format RDOSetPrice command correctly', async () => {
      const buildingId = 100575368;
      const newPrice = 220;

      const cmd = await mockSession.simulateBuildingUpdate(buildingId, 'RDOSetPrice', newPrice);

      expect(cmd).toMatchRdoCallFormat('RDOSetPrice');
      expect(cmd).toContain(`sel ${buildingId}`);
      expect(cmd).toContain('"#0"'); // Price index
      expect(cmd).toContain(`"#${newPrice}"`);
    });

    it('should include price index as first argument', async () => {
      const cmd = await mockSession.simulateBuildingUpdate(1, 'RDOSetPrice', 100);

      // First argument should be #0 (price index)
      const match = cmd.match(/"[*^]" (.+);$/);
      expect(match).toBeDefined();
      expect(match![1]).toMatch(/^"#0"/);
    });

    it('should handle price value 0', async () => {
      const cmd = await mockSession.simulateBuildingUpdate(1, 'RDOSetPrice', 0);

      expect(cmd).toContain('"#0","#0"'); // index=0, value=0
    });

    it('should handle large price values', async () => {
      const largePrice = 999999999;
      const cmd = await mockSession.simulateBuildingUpdate(1, 'RDOSetPrice', largePrice);

      expect(cmd).toContain(`"#${largePrice}"`);
    });
  });

  describe('Building Salary Updates (RDOSetSalaries)', () => {
    it('should format RDOSetSalaries with all 3 salary values', async () => {
      const buildingId = 123456;
      const salaries: [number, number, number] = [100, 120, 150];

      const cmd = await mockSession.simulateSetSalaries(buildingId, salaries);

      expect(cmd).toMatchRdoCallFormat('RDOSetSalaries');
      expect(cmd).toContain('"#100"');
      expect(cmd).toContain('"#120"');
      expect(cmd).toContain('"#150"');
    });

    it('should maintain salary order (Executives, Professionals, Workers)', async () => {
      const cmd = await mockSession.simulateSetSalaries(1, [50, 75, 100]);

      // Extract arguments
      const match = cmd.match(/"[*^]" (.+);$/);
      expect(match![1]).toBe('"#50","#75","#100"');
    });

    it('should handle zero salaries', async () => {
      const cmd = await mockSession.simulateSetSalaries(1, [0, 0, 0]);

      expect(cmd).toContain('"#0","#0","#0"');
    });

    it('should handle percentage salary values', async () => {
      const salaries: [number, number, number] = [150, 175, 200]; // 150%, 175%, 200%
      const cmd = await mockSession.simulateSetSalaries(1, salaries);

      expect(cmd).toContain('"#150","#175","#200"');
    });
  });

  describe('Building Deletion (RDODelFacility)', () => {
    it('should format RDODelFacility command correctly', async () => {
      const worldId = 123456;
      const x = 100;
      const y = 200;

      const cmd = await mockSession.simulateDeleteBuilding(worldId, x, y);

      expect(cmd).toMatchRdoCallFormat('RDODelFacility');
      expect(cmd).toContain(`sel ${worldId}`);
      expect(cmd).toContain(`"#${x}"`);
      expect(cmd).toContain(`"#${y}"`);
    });

    it('should use integer type prefix for coordinates', async () => {
      const cmd = await mockSession.simulateDeleteBuilding(1, 50, 75);

      expect(cmd).toContain('"#50"');
      expect(cmd).toContain('"#75"');
    });

    it('should use method separator (^) for RDODelFacility', async () => {
      const cmd = await mockSession.simulateDeleteBuilding(1, 100, 200);

      expect(cmd).toContain('"^"');
    });

    it('should use worldId for sel parameter (not buildingId)', async () => {
      const worldId = 999;
      const buildingId = 888;

      const cmd = await mockSession.simulateDeleteBuilding(worldId, 10, 20);

      expect(cmd).toContain(`sel ${worldId}`);
      expect(cmd).not.toContain(`sel ${buildingId}`);
    });
  });

  describe('Building Rename (SET Name)', () => {
    it('should format SET Name command correctly', async () => {
      const buildingId = 100575368;
      const newName = 'My Office';

      const cmd = mockSession.simulateRenameBuilding(buildingId, newName);

      expect(cmd).toMatchRdoSetFormat('Name');
      expect(cmd).toContain(`sel ${buildingId}`);
      expect(cmd).toContain(`%${newName}`);
    });

    it('should use OLEString type prefix for building name', async () => {
      const cmd = mockSession.simulateRenameBuilding(1, 'Test Building');

      expect(cmd).toContain('%Test Building');
    });

    it('should use SET verb instead of CALL', async () => {
      const cmd = mockSession.simulateRenameBuilding(1, 'Test');

      expect(cmd).toMatch(/set Name ?=/);
      expect(cmd).not.toMatch(/call Name/);
    });

    it('should handle empty name', async () => {
      const cmd = mockSession.simulateRenameBuilding(1, '');

      expect(cmd).toMatch(/Name ?="%"/); // Empty OLEString (RdoCommand may add space before =)
    });

    it('should handle special characters in name', async () => {
      const specialName = 'Office & Co. (Ltd.)';
      const cmd = mockSession.simulateRenameBuilding(1, specialName);

      expect(cmd).toContain(`%${specialName}`);
    });

    it('should handle long building names', async () => {
      const longName = 'A'.repeat(100);
      const cmd = mockSession.simulateRenameBuilding(1, longName);

      expect(cmd).toContain(`%${longName}`);
    });
  });

  describe('Upgrade Operations', () => {
    it('should format RDOStartUpgrades command correctly', async () => {
      const buildingId = 123456;
      const count = 5;

      const cmd = await mockSession.simulateStartUpgrade(buildingId, count);

      expect(cmd).toMatchRdoCallFormat('RDOStartUpgrades');
      expect(cmd).toContain(`"#${count}"`);
    });

    it('should handle single upgrade', async () => {
      const cmd = await mockSession.simulateStartUpgrade(1, 1);

      expect(cmd).toContain('"#1"');
    });

    it('should handle multiple upgrades', async () => {
      const cmd = await mockSession.simulateStartUpgrade(1, 10);

      expect(cmd).toContain('"#10"');
    });

    it('should format RDOStopUpgrade command correctly', async () => {
      const buildingId = 123456;
      const cmd = await mockSession.simulateStopUpgrade(buildingId);

      expect(cmd).toMatchRdoCallFormat('RDOStopUpgrade');
      expect(cmd).toMatch(/"[*^]";$/); // No arguments (RdoCommand format has no space before semicolon)
    });

    it('should format RDODowngrade command correctly', async () => {
      const buildingId = 123456;
      const cmd = await mockSession.simulateDowngrade(buildingId);

      expect(cmd).toMatchRdoCallFormat('RDODowngrade');
      expect(cmd).toMatch(/"[*^]";$/); // No arguments (RdoCommand format has no space before semicolon)
    });
  });

  describe('Output Price (RDOSetOutputPrice)', () => {
    it('should format RDOSetOutputPrice with fluidId and price', async () => {
      const cmd = await mockSession.simulateSetOutputPrice(123456, 'Chemicals', 150);

      expect(cmd).toMatchRdoCallFormat('RDOSetOutputPrice');
      expect(cmd).toContain('"%Chemicals"');
      expect(cmd).toContain('"#150"');
    });

    it('should use string prefix for fluidId', async () => {
      const cmd = await mockSession.simulateSetOutputPrice(1, 'Food', 100);

      expect(cmd).toContain('"%Food"');
    });

    it('should handle price value 0', async () => {
      const cmd = await mockSession.simulateSetOutputPrice(1, 'Metals', 0);

      expect(cmd).toContain('"#0"');
    });
  });

  describe('Connection Management (Connect/Disconnect)', () => {
    it('should format RDOConnectInput with fluidId and connection list', async () => {
      const cmd = await mockSession.simulateConnectInput(123456, 'Pharmaceutics', '100,200');

      expect(cmd).toMatchRdoCallFormat('RDOConnectInput');
      expect(cmd).toContain('"%Pharmaceutics"');
      expect(cmd).toContain('"%100,200"');
    });

    it('should format RDODisconnectInput with fluidId and connection list', async () => {
      const cmd = await mockSession.simulateDisconnectInput(123456, 'Chemicals', '50,75');

      expect(cmd).toMatchRdoCallFormat('RDODisconnectInput');
      expect(cmd).toContain('"%Chemicals"');
      expect(cmd).toContain('"%50,75"');
    });

    it('should format RDOConnectOutput with fluidId and connection list', async () => {
      const cmd = await mockSession.simulateConnectOutput(123456, 'Clothing', '200,300,400,500');

      expect(cmd).toMatchRdoCallFormat('RDOConnectOutput');
      expect(cmd).toContain('"%Clothing"');
      expect(cmd).toContain('"%200,300,400,500"');
    });

    it('should format RDODisconnectOutput with fluidId and connection list', async () => {
      const cmd = await mockSession.simulateDisconnectOutput(123456, 'Food', '10,20');

      expect(cmd).toMatchRdoCallFormat('RDODisconnectOutput');
      expect(cmd).toContain('"%Food"');
      expect(cmd).toContain('"%10,20"');
    });

    it('should support multiple connection coordinates in list', async () => {
      const multipleCoords = '100,200,300,400,500,600';
      const cmd = await mockSession.simulateConnectInput(1, 'Iron', multipleCoords);

      expect(cmd).toContain(`"%${multipleCoords}"`);
    });
  });

  describe('Supply Management', () => {
    it('should format RDOSetInputOverPrice with fluidId, index, and overprice', async () => {
      const cmd = await mockSession.simulateSetInputOverPrice(123456, 'Chemicals', 2, 150);

      expect(cmd).toMatchRdoCallFormat('RDOSetInputOverPrice');
      expect(cmd).toContain('"%Chemicals"');
      expect(cmd).toContain('"#2"');
      expect(cmd).toContain('"#150"');
    });

    it('should format RDOSetInputSortMode with fluidId and mode', async () => {
      const cmd = await mockSession.simulateSetInputSortMode(123456, 'Food', 1);

      expect(cmd).toMatchRdoCallFormat('RDOSetInputSortMode');
      expect(cmd).toContain('"%Food"');
      expect(cmd).toContain('"#1"');
    });

    it('should format RDOSelSelected with WordBool true (-1)', async () => {
      const cmd = await mockSession.simulateSelSelected(123456, true);

      expect(cmd).toMatchRdoCallFormat('RDOSelSelected');
      expect(cmd).toContain('"#-1"');
    });

    it('should format RDOSelSelected with WordBool false (0)', async () => {
      const cmd = await mockSession.simulateSelSelected(123456, false);

      expect(cmd).toMatchRdoCallFormat('RDOSelSelected');
      expect(cmd).toContain('"#0"');
    });

    it('should format RDOSetBuyingStatus with fingerIndex and WordBool', async () => {
      const cmd = await mockSession.simulateSetBuyingStatus(123456, 3, true);

      expect(cmd).toMatchRdoCallFormat('RDOSetBuyingStatus');
      expect(cmd).toContain('"#3"');
      expect(cmd).toContain('"#-1"');
    });

    it('should format RDOSetBuyingStatus false correctly', async () => {
      const cmd = await mockSession.simulateSetBuyingStatus(123456, 0, false);

      expect(cmd).toMatchRdoCallFormat('RDOSetBuyingStatus');
      expect(cmd).toContain('"#0"');
    });
  });

  describe('Tycoon Trade (ConnectToTycoon/DisconnectFromTycoon)', () => {
    it('should format RDOConnectToTycoon with tycoonId, kind, and flag', async () => {
      const cmd = await mockSession.simulateConnectToTycoon(123456, 42, 1);

      expect(cmd).toMatchRdoCallFormat('RDOConnectToTycoon');
      expect(cmd).toContain('"#42"');
      expect(cmd).toContain('"#1"');
      expect(cmd).toContain('"#-1"'); // flag = true (WordBool)
    });

    it('should format RDODisconnectFromTycoon with tycoonId, kind, and flag', async () => {
      const cmd = await mockSession.simulateDisconnectFromTycoon(123456, 42, 2);

      expect(cmd).toMatchRdoCallFormat('RDODisconnectFromTycoon');
      expect(cmd).toContain('"#42"');
      expect(cmd).toContain('"#2"');
      expect(cmd).toContain('"#-1"'); // flag = true (WordBool)
    });
  });

  describe('Facility Pause/Resume (Stopped property)', () => {
    it('should format SET Stopped=true as WordBool -1', () => {
      const cmd = mockSession.simulateSetStopped(123456, true);

      expect(cmd).toMatchRdoSetFormat('Stopped');
      expect(cmd).toContain('"#-1"');
    });

    it('should format SET Stopped=false as WordBool 0', () => {
      const cmd = mockSession.simulateSetStopped(123456, false);

      expect(cmd).toMatchRdoSetFormat('Stopped');
      expect(cmd).toContain('"#0"');
    });

    it('should use SET verb (not CALL) for Stopped property', () => {
      const cmd = mockSession.simulateSetStopped(1, true);

      expect(cmd).toMatch(/set Stopped ?=/);
      expect(cmd).not.toMatch(/call Stopped/);
    });
  });

  describe('Separator conformity: fire-and-forget "*" vs synchronous "^"', () => {
    // Fire-and-forget commands (no RID) MUST use "*" (VoidId).
    // "^" (VariantId) is forbidden without a RID — crashes Delphi server.
    // Ref: RDOQueryServer.pas:419-454, live capture confirmation.

    const FIRE_AND_FORGET_COMMANDS = [
      'RDOSetOutputPrice', 'RDOSetInputOverPrice', 'RDOSetInputMaxPrice', 'RDOSetInputMinK',
      'RDODisconnectInput', 'RDODisconnectOutput',
      'RDOAutoProduce', 'RDOAutoRelease', 'RDOSetTradeLevel', 'RDOSetRole', 'RDOSetLoanPerc',
      'RDOConnectToTycoon', 'RDODisconnectFromTycoon',
    ];

    // Synchronous commands use sendRdoRequest with RID + "^" — not tested here
    // (tested via integration tests). These are: RDOConnectInput, RDOConnectOutput.

    it.each(FIRE_AND_FORGET_COMMANDS)('%s fire-and-forget should use "*" separator', (method) => {
      const cmd = RdoCommand.sel(100).call(method).push().args(RdoValue.int(1)).build();
      expect(cmd).toContain('"*"');
      expect(cmd).not.toContain('"^"');
    });
  });

  describe('ObjectId targeting for output/input gate commands', () => {
    // Warehouses have ObjectId !== CurrBlock. Output/input gate commands
    // must target ObjectId (the facility), not CurrBlock (the block).
    // Ref: voyager-handler-reference.md:1198, building_details_rdo.txt:9-10

    const OBJECTID_COMMANDS = [
      'RDOSetOutputPrice', 'RDOSetInputOverPrice', 'RDOSetInputMaxPrice', 'RDOSetInputMinK',
      'RDOConnectInput', 'RDODisconnectInput', 'RDOConnectOutput', 'RDODisconnectOutput',
      'RDOConnectToTycoon', 'RDODisconnectFromTycoon',
    ];

    it('should use objectId (not currBlock) for RDOSetOutputPrice when they differ', () => {
      const objectId = 114551548;
      const currBlock = 114551764;
      // Command should sel the objectId, not currBlock
      const cmd = RdoCommand.sel(objectId).call('RDOSetOutputPrice')
        .push()
        .args(RdoValue.string('Chemicals'), RdoValue.int(150))
        .build();

      expect(cmd).toContain(`sel ${objectId}`);
      expect(cmd).not.toContain(`sel ${currBlock}`);
      expect(cmd).toMatchRdoCallFormat('RDOSetOutputPrice');
    });

    it('RDOSetPrice (service) should still use currBlock', () => {
      const currBlock = 114551764;
      const cmd = RdoCommand.sel(currBlock).call('RDOSetPrice')
        .push()
        .args(RdoValue.int(0), RdoValue.int(220))
        .build();

      expect(cmd).toContain(`sel ${currBlock}`);
      expect(cmd).toMatchRdoCallFormat('RDOSetPrice');
    });

    it('objectId commands set should match all gate + tycoon commands', () => {
      // objectId targeting applies to all output/input gate commands AND tycoon connect/disconnect.
      const GATE_COMMANDS = [
        'RDOSetOutputPrice', 'RDOSetInputOverPrice', 'RDOSetInputMaxPrice', 'RDOSetInputMinK',
        'RDOConnectInput', 'RDODisconnectInput', 'RDOConnectOutput', 'RDODisconnectOutput',
      ];
      const TYCOON_COMMANDS = [
        'RDOConnectToTycoon', 'RDODisconnectFromTycoon',
      ];
      expect(OBJECTID_COMMANDS.sort()).toEqual([...GATE_COMMANDS, ...TYCOON_COMMANDS].sort());
    });
  });

  describe('RDO Format Validation', () => {
    it('should generate valid RDO format for all building commands', async () => {
      await mockSession.simulateBuildingFocus(1, 10, 20);
      await mockSession.simulateBuildingUpdate(1, 'RDOSetPrice', 100);
      await mockSession.simulateSetSalaries(1, [50, 75, 100]);
      await mockSession.simulateDeleteBuilding(1, 30, 40);
      mockSession.simulateRenameBuilding(1, 'Test');
      await mockSession.simulateStartUpgrade(1, 1);
      await mockSession.simulateStopUpgrade(1);
      await mockSession.simulateDowngrade(1);

      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatchRdoFormat();
      });
    });

    it('should generate valid RDO format for all new facility commands', async () => {
      await mockSession.simulateSetOutputPrice(1, 'Chemicals', 150);
      await mockSession.simulateConnectInput(1, 'Food', '100,200');
      await mockSession.simulateDisconnectInput(1, 'Food', '100,200');
      await mockSession.simulateConnectOutput(1, 'Clothing', '300,400');
      await mockSession.simulateDisconnectOutput(1, 'Clothing', '300,400');
      await mockSession.simulateSetInputOverPrice(1, 'Iron', 0, 120);
      await mockSession.simulateSetInputSortMode(1, 'Iron', 1);
      await mockSession.simulateSelSelected(1, true);
      await mockSession.simulateSetBuyingStatus(1, 2, false);
      await mockSession.simulateConnectToTycoon(1, 42, 1);
      await mockSession.simulateDisconnectFromTycoon(1, 42, 1);
      mockSession.simulateSetStopped(1, true);

      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatchRdoFormat();
      });
    });
  });
});
