// @ts-nocheck
/**
 * RDO Protocol Tests - Login Flow
 * Tests for authentication and session initialization
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockRdoSession } from '../../__mocks__/mock-rdo-session';

describe('RDO Login Flow', () => {
  let mockSession: MockRdoSession;

  beforeEach(() => {
    mockSession = new MockRdoSession();
  });

  describe('Complete Login Sequence', () => {
    it('should send SetLanguage, ClientAware, and Logon commands in correct order', async () => {
      const username = 'testuser';
      const password = 'testpass123';
      const interfaceServerId = 6892548;

      await mockSession.simulateLogin(username, password, interfaceServerId);
      const commands = mockSession.getCommandHistory();

      expect(commands).toHaveLength(3);
      expect(commands).toContainRdoCommand('SetLanguage', ['%English']);
      expect(commands).toContainRdoCommand('ClientAware');
      expect(commands).toContainRdoCommand('Logon', [`%${username}`, `%${password}`]);
    });

    it('should send commands with sequential request IDs', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const commands = mockSession.getCommandHistory();

      expect(commands[0]).toMatch(/^C 1 /);
      expect(commands[1]).toMatch(/^C 2 /);
      expect(commands[2]).toMatch(/^C 3 /);
    });

    it('should use correct server ID for all commands', async () => {
      const serverId = 123456;
      await mockSession.simulateLogin('user', 'pass', serverId);
      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatch(new RegExp(`sel ${serverId}`));
      });
    });
  });

  describe('SetLanguage Command', () => {
    it('should format SetLanguage command correctly', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const setLanguageCmd = mockSession.getCommand(/call SetLanguage/);

      expect(setLanguageCmd).toBeDefined();
      expect(setLanguageCmd).toMatchRdoCallFormat('SetLanguage');
      expect(setLanguageCmd).toMatch(/"%English"/);
    });

    it('should use OLEString type prefix for language', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const setLanguageCmd = mockSession.getCommand(/call SetLanguage/);

      expect(setLanguageCmd).toContain('%English');
    });

    it('should use push separator (*) for SetLanguage', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const setLanguageCmd = mockSession.getCommand(/call SetLanguage/);

      expect(setLanguageCmd).toContain('"*"');
    });
  });

  describe('ClientAware Command', () => {
    it('should format ClientAware command correctly', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const clientAwareCmd = mockSession.getCommand(/call ClientAware/);

      expect(clientAwareCmd).toBeDefined();
      expect(clientAwareCmd).toMatchRdoCallFormat('ClientAware');
    });

    it('should have no arguments and the void separator', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const clientAwareCmd = mockSession.getCommand(/call ClientAware/);

      // Was `/"[*^]" ;$/` — which accepts BOTH separators, so it could never
      // catch a separator defect. That is the blind spot: the assertion was
      // written loose enough to pass whatever the code did. ClientAware is a
      // `procedure` (InterfaceServer.pas:197) and the reference client emits it
      // void — `call ClientAware "*" ;` (live capture).
      expect(clientAwareCmd).toMatch(/"\*"\s*;$/);
      expect(clientAwareCmd).not.toContain('"^"');
    });
  });

  describe('Logon Command', () => {
    it('should format Logon command with username and password', async () => {
      const username = 'testuser';
      const password = 'mypassword';

      await mockSession.simulateLogin(username, password, 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      expect(logonCmd).toBeDefined();
      expect(logonCmd).toMatchRdoCallFormat('Logon');
      expect(logonCmd).toContain(`%${username}`);
      expect(logonCmd).toContain(`%${password}`);
    });

    it('should use OLEString type prefix for credentials', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      // Both username and password should have % prefix
      const args = logonCmd!.match(/"%[^"]+"/g);
      expect(args).toHaveLength(2);
      args!.forEach(arg => {
        expect(arg).toMatch(/^"%/);
      });
    });

    it('should use method separator (^) for Logon', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      expect(logonCmd).toContain('"^"');
    });

    it('should handle special characters in username', async () => {
      const specialUsername = 'user@example.com';
      await mockSession.simulateLogin(specialUsername, 'pass', 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      expect(logonCmd).toContain(`%${specialUsername}`);
    });

    it('should handle special characters in password', async () => {
      const specialPassword = 'p@ss!w0rd#123';
      await mockSession.simulateLogin('user', specialPassword, 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      expect(logonCmd).toContain(`%${specialPassword}`);
    });
  });

  describe('RDO Format Validation', () => {
    it('should generate valid RDO format for all login commands', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatchRdoFormat();
      });
    });

    it('should terminate all commands with semicolon', async () => {
      await mockSession.simulateLogin('user', 'pass', 1);
      const commands = mockSession.getCommandHistory();

      commands.forEach(cmd => {
        expect(cmd).toMatch(/;$/);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty username', async () => {
      await mockSession.simulateLogin('', 'pass', 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      expect(logonCmd).toContain('"%"'); // Empty string with % prefix
    });

    it('should handle empty password', async () => {
      await mockSession.simulateLogin('user', '', 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      expect(logonCmd).toMatch(/"%user","%"/); // Second arg is empty OLEString
    });

    it('should handle very long username', async () => {
      const longUsername = 'A'.repeat(100);
      await mockSession.simulateLogin(longUsername, 'pass', 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      expect(logonCmd).toContain(`%${longUsername}`);
    });

    it('should handle very long password', async () => {
      const longPassword = 'P'.repeat(100);
      await mockSession.simulateLogin('user', longPassword, 1);
      const logonCmd = mockSession.getCommand(/call Logon/);

      expect(logonCmd).toContain(`%${longPassword}`);
    });
  });
});
