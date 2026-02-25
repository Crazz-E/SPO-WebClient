/**
 * Tests for Research/Technology System RDO commands (Phase 3.1)
 * Verifies RDOQueueResearch and RDOCancelResearch formats.
 */

import { describe, it, expect } from '@jest/globals';
import { RdoCommand, RdoValue } from '../../../shared/rdo-types';

describe('Research Commands RDO Protocol', () => {
  const blockId = '#127839460';

  describe('RDOQueueResearch', () => {
    it('should build correct command with inventionId and priority', () => {
      const cmd = RdoCommand
        .sel(blockId)
        .call('RDOQueueResearch')
        .push()
        .args(
          RdoValue.string('GreenTech.Level1'),
          RdoValue.int(10)
        )
        .build();

      expect(cmd).toContain('sel #127839460');
      expect(cmd).toContain('call RDOQueueResearch');
      expect(cmd).toContain('"*"'); // void procedure
      expect(cmd).toContain('"%GreenTech.Level1"');
      expect(cmd).toContain('"#10"');
    });

    it('should use push separator (*) for void procedure', () => {
      const cmd = RdoCommand
        .sel(blockId)
        .call('RDOQueueResearch')
        .push()
        .args(RdoValue.string('Test'), RdoValue.int(5))
        .build();

      expect(cmd).toContain('"*"');
      expect(cmd).not.toContain('"^"');
    });

    it('should use string prefix (%) for inventionId', () => {
      const cmd = RdoCommand
        .sel(blockId)
        .call('RDOQueueResearch')
        .push()
        .args(RdoValue.string('MediaEmpire.Level1'), RdoValue.int(10))
        .build();

      expect(cmd).toContain('"%MediaEmpire.Level1"');
    });

    it('should use integer prefix (#) for priority', () => {
      const cmd = RdoCommand
        .sel(blockId)
        .call('RDOQueueResearch')
        .push()
        .args(RdoValue.string('Inv'), RdoValue.int(15))
        .build();

      expect(cmd).toContain('"#15"');
    });
  });

  describe('RDOCancelResearch', () => {
    it('should build correct command with inventionId only', () => {
      const cmd = RdoCommand
        .sel(blockId)
        .call('RDOCancelResearch')
        .push()
        .args(RdoValue.string('GreenTech.Level1'))
        .build();

      expect(cmd).toContain('sel #127839460');
      expect(cmd).toContain('call RDOCancelResearch');
      expect(cmd).toContain('"*"');
      expect(cmd).toContain('"%GreenTech.Level1"');
    });

    it('should use single string argument', () => {
      const cmd = RdoCommand
        .sel(blockId)
        .call('RDOCancelResearch')
        .push()
        .args(RdoValue.string('TestInvention'))
        .build();

      // Should have exactly one arg (no priority)
      expect(cmd).toContain('"%TestInvention"');
      expect(cmd).not.toMatch(/"#\d+"/);
    });
  });
});
