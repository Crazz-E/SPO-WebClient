// @ts-nocheck
/**
 * RDO Protocol Tests - KeepAlive Command
 *
 * Validates that the KeepAlive void push command for the WSObjectCacher
 * matches the Delphi Voyager client format.
 *
 * Delphi reference: ObjectInspectorHandleViewer.pas:1172-1180
 *   fCacheObj.KeepAlive — CacheConnectionTimeOut = 60000ms
 */

/// <reference path="../matchers/rdo-matchers.d.ts" />

import { describe, it, expect } from '@jest/globals';
import { RdoCommand } from '../../../shared/rdo-types';

describe('KeepAlive — Map Service cacher void push', () => {
  const cacherId = '8161400';

  describe('Command format', () => {
    it('should produce correct void push wire format', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('KeepAlive')
        .push()
        .build();

      expect(cmd).toBe(`C sel ${cacherId} call KeepAlive "*";`);
    });

    it('should use void separator (*) — fire-and-forget', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('KeepAlive')
        .push()
        .build();

      expect(cmd).toContain('"*"');
      expect(cmd).not.toContain('"^"');
    });

    it('should have no request ID (push, not request)', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('KeepAlive')
        .push()
        .build();

      // Push commands start with 'C sel' — no RID between C and sel
      expect(cmd).toMatch(/^C sel/);
    });

    it('should have no arguments after separator', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('KeepAlive')
        .push()
        .build();

      // After "*" there should only be a space and semicolon
      expect(cmd).toMatch(/"\*";$/);
    });

    it('should match generic RDO call format', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('KeepAlive')
        .push()
        .build();

      expect(cmd).toMatchRdoCallFormat('KeepAlive');
    });

    it('should target the cacherId', () => {
      const cmd = RdoCommand.sel(cacherId)
        .call('KeepAlive')
        .push()
        .build();

      expect(cmd).toContain(`sel ${cacherId}`);
    });
  });

  describe('Delphi conformity', () => {
    it('should exactly match Delphi wire format', () => {
      // Delphi sends: C sel <objectId> call KeepAlive "*";
      const delphiExpected = `C sel ${cacherId} call KeepAlive "*";`;
      const webClientCmd = RdoCommand.sel(cacherId)
        .call('KeepAlive')
        .push()
        .build();

      expect(webClientCmd).toBe(delphiExpected);
    });

    it('should accept numeric cacherId', () => {
      const cmd = RdoCommand.sel(8161400)
        .call('KeepAlive')
        .push()
        .build();

      expect(cmd).toBe('C sel 8161400 call KeepAlive "*";');
    });
  });
});
