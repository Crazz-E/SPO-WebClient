// @ts-nocheck
/**
 * RDO Protocol Tests - CloseObject Command
 *
 * Validates that the CloseObject void push command for the WSObjectCacher
 * matches the Delphi server format.
 *
 * Delphi reference: CacheServerReportForm.pas:92
 *   procedure CloseObject(Obj : integer);  — published, void
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect } from '@jest/globals';
import { RdoCommand, RdoValue } from '../../../shared/rdo-types';

describe('CloseObject — Map Service cacher void push', () => {
  const cacherId = '8161400';
  const tempObjectId = '7024008';

  describe('Command format', () => {
    it('should produce correct void push wire format with integer arg', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('CloseObject')
        .push()
        .args(RdoValue.int(parseInt(tempObjectId, 10)))
        .build();

      expect(cmd).toBe(`C sel ${cacherId} call CloseObject "*" "#${tempObjectId}";`);
    });

    it('should use void separator (*) — fire-and-forget', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('CloseObject')
        .push()
        .args(RdoValue.int(parseInt(tempObjectId, 10)))
        .build();

      expect(cmd).toContain('"*"');
      expect(cmd).not.toContain('"^"');
    });

    it('should have no request ID (push, not request)', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('CloseObject')
        .push()
        .args(RdoValue.int(parseInt(tempObjectId, 10)))
        .build();

      expect(cmd).toMatch(/^C sel/);
    });

    it('should format the object ID as integer with # prefix', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('CloseObject')
        .push()
        .args(RdoValue.int(parseInt(tempObjectId, 10)))
        .build();

      expect(cmd).toContain(`"#${tempObjectId}"`);
    });

    it('should match generic RDO call format', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('CloseObject')
        .push()
        .args(RdoValue.int(parseInt(tempObjectId, 10)))
        .build();

      expect(cmd).toMatchRdoCallFormat('CloseObject');
    });
  });

  describe('Delphi conformity', () => {
    it('should exactly match Delphi wire format', () => {
      // Delphi sends: C sel <cacherId> call CloseObject "*" "#<tempObjectId>";
      const delphiExpected = `C sel ${cacherId} call CloseObject "*" "#${tempObjectId}";`;
      const webClientCmd = RdoCommand.sel(cacherId)
        .call('CloseObject')
        .push()
        .args(RdoValue.int(parseInt(tempObjectId, 10)))
        .build();

      expect(webClientCmd).toBe(delphiExpected);
    });
  });
});
