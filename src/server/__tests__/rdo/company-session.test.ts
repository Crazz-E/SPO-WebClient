// @ts-nocheck
/**
 * RDO Protocol Tests - Company Selection and Session Management
 * Tests for SelectCompany and the graceful Logoff sequence
 * (ClientNotAware + get Logoff — legacy ServerCnxHandler.pas:2043-2063)
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockRdoSession } from '../../__mocks__/mock-rdo-session';

describe('RDO Company and Session Management', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  describe('SelectCompany Command', () => {
    it('should format SelectCompany command correctly', async () => {
      const interfaceServerId = 6892548;
      const companyId = 12345;

      const cmd = await mockSession.simulateSelectCompany(interfaceServerId, companyId);

      expect(cmd).toMatchRdoCallFormat('SelectCompany');
      expect(cmd).toContain(`sel ${interfaceServerId}`);
      expect(cmd).toContain(`"#${companyId}"`);
    });

    it('should use integer type prefix for company ID', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 9876);

      expect(cmd).toContain('"#9876"');
    });

    it('should use method separator (^) for SelectCompany', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 123);

      expect(cmd).toContain('"^"');
    });

    it('should have exactly one argument (company ID)', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 456);

      // Extract arguments
      const match = cmd.match(/"[*^]" (.+);$/);
      expect(match).toBeDefined();

      const args = match![1].split(',');
      expect(args).toHaveLength(1);
    });

    it('should handle first company (ID 0)', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 0);

      expect(cmd).toContain('"#0"');
    });

    it('should handle large company IDs', async () => {
      const largeId = 999999;
      const cmd = await mockSession.simulateSelectCompany(1, largeId);

      expect(cmd).toContain(`"#${largeId}"`);
    });
  });

  describe('Company Switching Flow', () => {
    it('should select company after successful login', async () => {
      // Simulate login flow
      await mockSession.simulateLogin('testuser', 'password', 1);

      // Then select company
      await mockSession.simulateSelectCompany(1, 123);

      const commands = mockSession.getCommandHistory();

      // Should have 3 login commands + 1 select company
      expect(commands).toHaveLength(4);
      expect(commands[3]).toMatchRdoCallFormat('SelectCompany');
    });

    it('should re-authenticate for public office role switching', async () => {
      // Initial login as player
      await mockSession.simulateLogin('player1', 'password', 1);

      // Select player company
      await mockSession.simulateSelectCompany(1, 100);

      // Reset session (simulate socket cleanup)
      mockSession.reset();

      // Re-login as Mayor role
      await mockSession.simulateLogin('Mayor', 'password', 1);

      // Select public office company
      await mockSession.simulateSelectCompany(1, 200);

      const commands = mockSession.getCommandHistory();

      // Should have 3 login commands + 1 select company (after reset)
      expect(commands).toHaveLength(4);
      expect(commands).toContainRdoCommand('Logon', ['%Mayor']);
      expect(commands).toContainRdoCommand('SelectCompany', ['"#200"']);
    });
  });

  describe('Logoff Command (legacy ServerCnxHandler.Logoff parity)', () => {
    // Verified against SPO-Original: the InterfaceServer does NOT publish
    // RDOEndSession (TDirectorySession member). The legacy client sends
    // ClientNotAware (fire-and-forget) then reads Logoff as a zero-arg
    // COM property-get on the ClientView (ServerCnxHandler.pas:2043-2063).
    const worldContextId = 125086508; // ClientView id from Logon response

    it('should send ClientNotAware then get Logoff, both on the ClientView', async () => {
      const [notAwareCmd, logoffCmd] = await mockSession.simulateLogoff(worldContextId);

      expect(notAwareCmd).toContain(`sel ${worldContextId}`);
      expect(notAwareCmd).toContain('call ClientNotAware');
      expect(logoffCmd).toContain(`sel ${worldContextId}`);
      expect(logoffCmd).toContain('get Logoff');
    });

    it('ClientNotAware is fire-and-forget: "*" separator and no RID', async () => {
      const [notAwareCmd] = await mockSession.simulateLogoff(worldContextId);

      expect(notAwareCmd).toContain('"*"');
      expect(notAwareCmd).toMatch(/^C sel /); // no RID between C and sel
    });

    it('Logoff is a synchronous property-get carrying a RID', async () => {
      const [, logoffCmd] = await mockSession.simulateLogoff(worldContextId);

      expect(logoffCmd).toMatch(/^C \d+ sel \d+ get Logoff;$/);
    });

    it('should NOT send RDOEndSession to the world server', async () => {
      await mockSession.simulateLogoff(worldContextId);

      const commands = mockSession.getCommandHistory();
      expect(commands.some(cmd => cmd.includes('RDOEndSession'))).toBe(false);
    });
  });

  describe('Logout Flow', () => {
    it('should log off after session work, ending with get Logoff', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      await mockSession.simulateBuildingFocus(125086508, 10, 20);
      await mockSession.simulateLogoff(125086508);

      const commands = mockSession.getCommandHistory();
      const lastCmd = commands[commands.length - 1];
      expect(lastCmd).toContain('get Logoff');
    });
  });

  describe('Session ID Management', () => {
    it('should use the worldContextId (ClientView) for both building ops and Logoff', async () => {
      const worldContextId = 125086508; // Dynamic per session, from Logon response

      await mockSession.simulateBuildingFocus(worldContextId, 10, 20);
      await mockSession.simulateLogoff(worldContextId);

      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        if (cmd.includes('RDOFocusObject') || cmd.includes('Logoff') || cmd.includes('ClientNotAware')) {
          expect(cmd).toContain(`sel ${worldContextId}`);
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle logout without any session activity', async () => {
      // Login then immediately logout
      await mockSession.simulateLogin('user', 'pass', 1);
      await mockSession.simulateLogoff(125086508);

      const commands = mockSession.getCommandHistory();
      expect(commands).toHaveLength(5); // 3 login + ClientNotAware + Logoff
    });

    it('should handle company ID 0 (first company)', async () => {
      const cmd = await mockSession.simulateSelectCompany(1, 0);

      expect(cmd).toContain('"#0"');
    });
  });

  describe('RDO Format Validation', () => {
    it('should generate valid RDO format for company/session commands', async () => {
      await mockSession.simulateSelectCompany(1, 123);
      await mockSession.simulateLogoff(125086508);

      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatchRdoFormat();
      });
    });
  });
});
