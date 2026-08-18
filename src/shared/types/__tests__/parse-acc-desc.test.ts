import { parseAccDesc, NOBILITY_TIERS, CHAT_MODIFIER_FLAGS } from '../domain-types';

describe('parseAccDesc', () => {
  // ── Tier resolution ───────────────────────────────────────────────────────

  describe('nobility tier thresholds', () => {
    it('returns Commoner for 0 points', () => {
      const result = parseAccDesc('0');
      expect(result.nobilityPoints).toBe(0);
      expect(result.nobilityTier).toBe('Commoner');
      expect(result.modifiers).toBe(0);
    });

    it('returns Commoner for 499 points (below Baron)', () => {
      expect(parseAccDesc('499').nobilityTier).toBe('Commoner');
    });

    it('returns Baron at exactly 500 points', () => {
      expect(parseAccDesc('500').nobilityTier).toBe('Baron');
      expect(parseAccDesc('500').nobilityPoints).toBe(500);
    });

    it('returns Baron for 999 points (below Viscount)', () => {
      expect(parseAccDesc('999').nobilityTier).toBe('Baron');
    });

    it('returns Viscount at exactly 1000 points', () => {
      expect(parseAccDesc('1000').nobilityTier).toBe('Viscount');
    });

    it('returns Earl at exactly 2000 points', () => {
      expect(parseAccDesc('2000').nobilityTier).toBe('Earl');
    });

    it('returns Marquess at exactly 4000 points', () => {
      expect(parseAccDesc('4000').nobilityTier).toBe('Marquess');
    });

    it('returns Duke at exactly 8000 points', () => {
      expect(parseAccDesc('8000').nobilityTier).toBe('Duke');
    });

    it('returns Sr. Duke at exactly 16000 points', () => {
      expect(parseAccDesc('16000').nobilityTier).toBe('Sr. Duke');
    });

    it('returns Sr. Duke for points above 16000', () => {
      expect(parseAccDesc('65535').nobilityTier).toBe('Sr. Duke');
    });
  });

  // ── Real-world AccDesc values ─────────────────────────────────────────────

  describe('real-world AccDesc values', () => {
    it('decodes lord kaio (8393958) — Baron + Veteran', () => {
      const result = parseAccDesc('8393958');
      // 8393958 & 0xFFFF = 5350
      expect(result.nobilityPoints).toBe(5350);
      expect(result.nobilityTier).toBe('Marquess'); // 5350 >= 4000
      // (8393958 >>> 16) & 0xFFFF = 128 = 0x80 = VETERAN
      expect(result.modifiers).toBe(0x80);
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.VETERAN).toBeTruthy();
    });

    it('decodes SPO_test3 (8388608) — Commoner + Veteran', () => {
      const result = parseAccDesc('8388608');
      // 8388608 & 0xFFFF = 0
      expect(result.nobilityPoints).toBe(0);
      expect(result.nobilityTier).toBe('Commoner');
      // (8388608 >>> 16) & 0xFFFF = 128 = 0x80 = VETERAN
      expect(result.modifiers).toBe(0x80);
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.VETERAN).toBeTruthy();
    });
  });

  // ── Modifier flags ────────────────────────────────────────────────────────

  describe('modifier flag extraction', () => {
    it('extracts SUPPORT flag (0x0001)', () => {
      // 0x0001 << 16 = 65536
      const result = parseAccDesc('65536');
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.SUPPORT).toBeTruthy();
      expect(result.nobilityPoints).toBe(0);
    });

    it('extracts DEVELOPER flag (0x0002)', () => {
      const result = parseAccDesc(String(0x0002 << 16));
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.DEVELOPER).toBeTruthy();
    });

    it('extracts PUBLISHER flag (0x0004)', () => {
      const result = parseAccDesc(String(0x0004 << 16));
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.PUBLISHER).toBeTruthy();
    });

    it('extracts AMBASSADOR flag (0x0008)', () => {
      const result = parseAccDesc(String(0x0008 << 16));
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.AMBASSADOR).toBeTruthy();
    });

    it('extracts GAME_MASTER flag (0x0010)', () => {
      const result = parseAccDesc(String(0x0010 << 16));
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.GAME_MASTER).toBeTruthy();
    });

    it('extracts TRIAL flag (0x0020)', () => {
      const result = parseAccDesc(String(0x0020 << 16));
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.TRIAL).toBeTruthy();
    });

    it('extracts NEWBIE flag (0x0040)', () => {
      const result = parseAccDesc(String(0x0040 << 16));
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.NEWBIE).toBeTruthy();
    });

    it('extracts VETERAN flag (0x0080)', () => {
      const result = parseAccDesc(String(0x0080 << 16));
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.VETERAN).toBeTruthy();
    });

    it('extracts multiple flags combined', () => {
      // Developer + GameMaster + Veteran = 0x0092
      const combined = (0x0002 | 0x0010 | 0x0080) << 16;
      const result = parseAccDesc(String(combined));
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.DEVELOPER).toBeTruthy();
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.GAME_MASTER).toBeTruthy();
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.VETERAN).toBeTruthy();
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.SUPPORT).toBeFalsy();
    });

    it('combines nobility + modifiers correctly', () => {
      // Viscount (1000 pts) + Developer flag
      const accDesc = (0x0002 << 16) | 1000;
      const result = parseAccDesc(String(accDesc));
      expect(result.nobilityPoints).toBe(1000);
      expect(result.nobilityTier).toBe('Viscount');
      expect(result.modifiers & CHAT_MODIFIER_FLAGS.DEVELOPER).toBeTruthy();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty string', () => {
      const result = parseAccDesc('');
      expect(result.nobilityPoints).toBe(0);
      expect(result.nobilityTier).toBe('Commoner');
      expect(result.modifiers).toBe(0);
    });

    it('handles non-numeric string', () => {
      const result = parseAccDesc('abc');
      expect(result.nobilityPoints).toBe(0);
      expect(result.nobilityTier).toBe('Commoner');
      expect(result.modifiers).toBe(0);
    });

    it('handles negative values gracefully', () => {
      const result = parseAccDesc('-1');
      // parseInt('-1') = -1, -1 & 0xFFFF = 65535, (-1 >>> 16) & 0xFFFF = 65535
      expect(result.nobilityPoints).toBe(65535);
      expect(result.modifiers).toBe(65535);
    });
  });

  // ── Constants validation ──────────────────────────────────────────────────

  describe('NOBILITY_TIERS', () => {
    it('is sorted descending by minPoints', () => {
      for (let i = 1; i < NOBILITY_TIERS.length; i++) {
        expect(NOBILITY_TIERS[i - 1].minPoints).toBeGreaterThan(NOBILITY_TIERS[i].minPoints);
      }
    });

    it('starts at Commoner (0) and ends at Sr. Duke (16000)', () => {
      expect(NOBILITY_TIERS[NOBILITY_TIERS.length - 1].label).toBe('Commoner');
      expect(NOBILITY_TIERS[0].label).toBe('Sr. Duke');
    });
  });
});
