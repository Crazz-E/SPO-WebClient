/**
 * Protocol validation tests for Company Creation (Phase 3.2)
 * Verifies RDO command format for NewCompany.
 */

import { describe, it, expect } from '@jest/globals';
import { RdoCommand, RdoValue } from '../../../shared/rdo-types';

describe('Company Creation RDO Protocol', () => {
  const worldContextId = '#987654';

  describe('NewCompany command format', () => {
    it('should build correct RDO command with username, name, and cluster', () => {
      const cmd = RdoCommand
        .sel(worldContextId)
        .call('NewCompany')
        .method()
        .args(
          RdoValue.string('TestUser'),
          RdoValue.string('My Company'),
          RdoValue.string('PGI')
        )
        .build();

      expect(cmd).toContain('sel #987654');
      expect(cmd).toContain('call NewCompany');
      expect(cmd).toContain('"^"');
      expect(cmd).toContain('"%TestUser"');
      expect(cmd).toContain('"%My Company"');
      expect(cmd).toContain('"%PGI"');
    });

    it('should use variant separator (^) for function return', () => {
      const cmd = RdoCommand
        .sel(worldContextId)
        .call('NewCompany')
        .method()
        .args(
          RdoValue.string('user'),
          RdoValue.string('name'),
          RdoValue.string('cluster')
        )
        .build();

      // NewCompany returns OleVariant, so uses "^" separator
      expect(cmd).toContain('"^"');
      expect(cmd).not.toContain('"*"');
    });

    it('should use string type prefix (%) for all arguments', () => {
      const cmd = RdoCommand
        .sel(worldContextId)
        .call('NewCompany')
        .method()
        .args(
          RdoValue.string('admin'),
          RdoValue.string('Starpeace Inc'),
          RdoValue.string('Moab')
        )
        .build();

      // All 3 args should be OLE strings (% prefix)
      expect(cmd).toContain('"%admin"');
      expect(cmd).toContain('"%Starpeace Inc"');
      expect(cmd).toContain('"%Moab"');
    });
  });

  describe('Response parsing patterns', () => {
    it('should match success response format: res="%[Name,Id]"', () => {
      const payload = 'res="%[TestCo,99]"';
      const resMatch = /res="%(.*)"/.exec(payload);
      expect(resMatch).not.toBeNull();
      expect(resMatch![1]).toBe('[TestCo,99]');

      const companyMatch = /^\[(.+),(\d+)]$/.exec(resMatch![1]);
      expect(companyMatch).not.toBeNull();
      expect(companyMatch![1]).toBe('TestCo');
      expect(companyMatch![2]).toBe('99');
    });

    it('should match error response format: res="#errorCode"', () => {
      const payload = 'res="#11"';
      const errorMatch = /res="#(-?\d+)"/.exec(payload);
      expect(errorMatch).not.toBeNull();
      expect(parseInt(errorMatch![1], 10)).toBe(11); // CompanyNameNotUnique
    });

    it('should parse known error codes', () => {
      const errorMessages: Record<number, string> = {
        6: 'Unknown cluster',
        11: 'Company name already taken',
        28: 'Zone tier mismatch',
        33: 'Maximum number of companies reached',
      };

      expect(errorMessages[6]).toBe('Unknown cluster');
      expect(errorMessages[11]).toBe('Company name already taken');
      expect(errorMessages[28]).toBe('Zone tier mismatch');
      expect(errorMessages[33]).toBe('Maximum number of companies reached');
    });

    it('should handle company names with special characters', () => {
      const payload = 'res="%[Star & Moon Co.,42]"';
      const resMatch = /res="%(.*)"/.exec(payload);
      expect(resMatch).not.toBeNull();

      const companyMatch = /^\[(.+),(\d+)]$/.exec(resMatch![1]);
      expect(companyMatch).not.toBeNull();
      expect(companyMatch![1]).toBe('Star & Moon Co.');
      expect(companyMatch![2]).toBe('42');
    });
  });
});
