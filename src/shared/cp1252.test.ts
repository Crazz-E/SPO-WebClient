/**
 * Tests for the single-byte ANSI wire codec (src/shared/cp1252.ts).
 *
 * Reference behaviour: Rdo/Common/RDOUtils.pas:379 —
 *   Result := OLEStringId + RDOStrEncode( WideStrToStr( aVariant ) );
 * i.e. narrow to AnsiString first (unmappable → `?`), escape second.
 *
 * Regression target: the P-C1 and P-H2 encoding defects.
 */

import {
  ACTIVE_C1_BAND,
  ACTIVE_C1_ENCODE_MAP,
  C1_BAND_LENGTH,
  C1_BAND_START,
  CP1252_C1_BAND,
  LATIN1_C1_BAND,
  UNMAPPABLE_REPLACEMENT,
  UNMAPPABLE_REPLACEMENT_BYTE,
  buildC1EncodeMap,
  decodeAnsi,
  clampToWireBytes,
  encodeAnsi,
  encodeCodePoint,
} from './cp1252';

/** The bytes that would actually leave the socket for a given JS string. */
function wireBytes(text: string): number[] {
  return Array.from(Buffer.from(encodeAnsi(text), 'latin1'));
}

describe('cp1252 — band tables', () => {
  it('LATIN1_C1_BAND is the identity over 0x80–0x9F', () => {
    expect(LATIN1_C1_BAND).toHaveLength(C1_BAND_LENGTH);
    LATIN1_C1_BAND.forEach((codePoint, i) => {
      expect(codePoint).toBe(C1_BAND_START + i);
    });
  });

  it('CP1252_C1_BAND carries the Windows-1252 punctuation', () => {
    expect(CP1252_C1_BAND).toHaveLength(C1_BAND_LENGTH);
    expect(CP1252_C1_BAND[0x80 - C1_BAND_START]).toBe(0x20ac); // €
    expect(CP1252_C1_BAND[0x93 - C1_BAND_START]).toBe(0x201c); // “
    expect(CP1252_C1_BAND[0x94 - C1_BAND_START]).toBe(0x201d); // ”
    expect(CP1252_C1_BAND[0x99 - C1_BAND_START]).toBe(0x2122); // ™
    expect(CP1252_C1_BAND[0x9c - C1_BAND_START]).toBe(0x0153); // œ
  });

  it('no band entry can ever encode to an RDO metacharacter', () => {
    // The security property of P-C1 must not depend on which band is active:
    // every byte a band can produce is >= 0x80, so it can never be " ; , or =.
    for (const band of [LATIN1_C1_BAND, CP1252_C1_BAND]) {
      for (const [, byte] of buildC1EncodeMap(band)) {
        expect(byte).toBeGreaterThanOrEqual(C1_BAND_START);
        expect(byte).toBeLessThanOrEqual(0x9f);
      }
    }
  });

  // Flipped 2026-08-15 (lot L11). Probe U3-b could not measure the server's code
  // page — 575 MB of logs held zero bytes in 0x80–0x9F, but almost no human
  // non-ASCII text either. The decision rests on Delphi 5 Win32 using the process
  // ANSI code page, which on a Western install is CP1252 and is never ISO-8859-1.
  it('CP1252_C1_BAND is the active band', () => {
    expect(ACTIVE_C1_BAND).toBe(CP1252_C1_BAND);
    expect(ACTIVE_C1_BAND).not.toBe(LATIN1_C1_BAND);
  });
});

describe('cp1252 — buildC1EncodeMap()', () => {
  it('inverts a band into code point → byte', () => {
    const map = buildC1EncodeMap(CP1252_C1_BAND);
    expect(map.get(0x20ac)).toBe(0x80);
    expect(map.get(0x201c)).toBe(0x93);
    expect(map.size).toBe(C1_BAND_LENGTH);
  });

  it('rejects a table of the wrong length', () => {
    expect(() => buildC1EncodeMap([0x80, 0x81])).toThrow(/expected 32 entries, got 2/);
  });

  it('rejects a table with a duplicate code point', () => {
    const broken = [...CP1252_C1_BAND];
    broken[1] = broken[0];
    expect(() => buildC1EncodeMap(broken)).toThrow(/duplicate code point U\+20AC/);
  });
});

describe('cp1252 — encodeCodePoint()', () => {
  it('passes ASCII through unchanged', () => {
    expect(encodeCodePoint(0x00)).toBe(0x00);
    expect(encodeCodePoint(0x41)).toBe(0x41);
    expect(encodeCodePoint(0x7f)).toBe(0x7f);
  });

  it('passes 0xA0–0xFF through unchanged (ISO-8859-1 ≡ CP1252 there)', () => {
    expect(encodeCodePoint(0xa0)).toBe(0xa0);
    expect(encodeCodePoint(0xe9)).toBe(0xe9); // é
    expect(encodeCodePoint(0xff)).toBe(0xff);
  });

  it('replaces anything the code page cannot represent', () => {
    expect(encodeCodePoint(0x0122)).toBe(UNMAPPABLE_REPLACEMENT_BYTE); // Ģ
    expect(encodeCodePoint(0x1f600)).toBe(UNMAPPABLE_REPLACEMENT_BYTE); // 😀
  });

  it('honours an injected band map', () => {
    // The injection point is what made the L11 flip a one-line change, so it
    // stays covered in both directions: the active band must be overridable,
    // and the override must actually win.
    const latin1 = buildC1EncodeMap(LATIN1_C1_BAND);
    expect(encodeCodePoint(0x20ac)).toBe(0x80); // € under the active CP1252 band
    expect(encodeCodePoint(0x20ac, latin1)).toBe(UNMAPPABLE_REPLACEMENT_BYTE); // … but not under Latin-1
    expect(encodeCodePoint(0x0093, latin1)).toBe(0x93); // C1 identity under Latin-1
    expect(encodeCodePoint(0x0093)).toBe(UNMAPPABLE_REPLACEMENT_BYTE); // no longer reachable under CP1252
  });
});

describe('cp1252 — encodeAnsi(): P-C1 metacharacter forgery', () => {
  // The exact reproduction of the P-C1 defect.
  it.each([
    ['Ģ', 'U+0122', 0x22, '"'],
    ['Ļ', 'U+013B', 0x3b, ';'],
    ['Ĭ', 'U+012C', 0x2c, ','],
  ])('%s (%s) must NOT become the metacharacter %s', (char, _cp, byte, meta) => {
    // Proof the hazard is real: the old writer would have emitted the metachar.
    expect(Array.from(Buffer.from(char, 'latin1'))).toEqual([byte]);
    expect(Buffer.from(char, 'latin1').toString('latin1')).toBe(meta);

    // The codec neutralises it.
    expect(encodeAnsi(char)).toBe(UNMAPPABLE_REPLACEMENT);
    expect(wireBytes(char)).toEqual([UNMAPPABLE_REPLACEMENT_BYTE]);
  });

  // P-H2, closed 2026-08-15: ACTIVE_C1_BAND is CP1252, so this punctuation now
  // reaches the wire as the bytes Delphi expects instead of being replaced.
  // These four are the characters a paste from a word processor actually
  // produces, which is what made the band worth fixing.
  it.each([
    ['“', 'U+201C', 0x93],
    ['”', 'U+201D', 0x94],
    ['’', 'U+2019', 0x92],
    ['€', 'U+20AC', 0x80],
    ['–', 'U+2013', 0x96],
    ['…', 'U+2026', 0x85],
  ])('%s (%s) is emitted as its CP1252 byte', (char, _cp, byte) => {
    expect(wireBytes(char)).toEqual([byte]);
  });

  it('no longer forges control bytes from smart punctuation', () => {
    // The defect this closes: `charCode & 0xFF` truncation sent U+201C as 0x1C,
    // a C0 control byte, and U+20AC as 0xAC ('¬').
    expect(Array.from(Buffer.from('“€', 'latin1'))).toEqual([0x1c, 0xac]);
    expect(wireBytes('“€')).toEqual([0x93, 0x80]);
  });

  it('still replaces code points the CP1252 band cannot represent', () => {
    // Cyrillic, CJK, and the five undefined CP1252 positions have no byte.
    expect(wireBytes('Ж')).toEqual([UNMAPPABLE_REPLACEMENT_BYTE]);
    expect(wireBytes('漢')).toEqual([UNMAPPABLE_REPLACEMENT_BYTE]);
  });

  it('collapses a surrogate pair to a single ?, never a NUL', () => {
    const emoji = '😀'; // U+1F600 — two UTF-16 units
    expect(emoji).toHaveLength(2);
    expect(encodeAnsi(emoji)).toBe(UNMAPPABLE_REPLACEMENT);
    expect(wireBytes(emoji)).toEqual([UNMAPPABLE_REPLACEMENT_BYTE]);
    expect(wireBytes(emoji)).not.toContain(0x00);
    // The defect being fixed: latin1 truncation emitted 0x3D 0x00 for this pair.
    expect(Array.from(Buffer.from(emoji, 'latin1'))).toContain(0x00);
  });

  it('replaces a lone surrogate without emitting a NUL', () => {
    const lone = '\uD83D';
    expect(encodeAnsi(lone)).toBe(UNMAPPABLE_REPLACEMENT);
    expect(wireBytes(lone)).toEqual([UNMAPPABLE_REPLACEMENT_BYTE]);
  });

  it('replaces every code point > 0xFF the active band does not map, exhaustively sampled', () => {
    // The 27 code points CP1252 lifts out of 0x80–0x9F are the only ones above
    // 0xFF with a byte. Everything else must still collapse to '?' — that is
    // what keeps a metacharacter from ever being forged (P-C1).
    const mapped = new Set(ACTIVE_C1_BAND.filter(cp => cp > 0xff));

    for (let cp = 0x100; cp < 0x2000; cp += 7) {
      if (mapped.has(cp)) continue;
      expect(encodeAnsi(String.fromCodePoint(cp))).toBe(UNMAPPABLE_REPLACEMENT);
    }
  });

  it('never emits an RDO metacharacter for any code point above 0xFF', () => {
    // The invariant P-C1 turns on, restated so it survives a band change: no
    // input above ASCII may produce a byte the framer treats as structure.
    const forbidden = new Set([0x22, 0x3b, 0x2c, 0x3d]); // "  ;  ,  =
    for (let cp = 0x100; cp < 0x2200; cp += 3) {
      for (const byte of wireBytes(String.fromCodePoint(cp))) {
        expect(forbidden.has(byte)).toBe(false);
      }
    }
  });
});

describe('cp1252 — encodeAnsi(): non-regression on Latin-1 text', () => {
  it('leaves accented Latin-1 characters byte-identical (July A1/F1 fix)', () => {
    expect(encodeAnsi('é')).toBe('é');
    expect(encodeAnsi('ü')).toBe('ü');
    expect(encodeAnsi('ñ')).toBe('ñ');
    expect(wireBytes('éüñ')).toEqual([0xe9, 0xfc, 0xf1]);
  });

  it('round-trips a realistic accented payload', () => {
    const text = 'Société Générale — coût: 12 €'; // mixed Latin-1 and non-Latin-1
    expect(wireBytes('Société Générale')).toEqual(
      Array.from(Buffer.from('Société Générale', 'latin1'))
    );
    expect(encodeAnsi(text)).toContain('Société Générale');
  });

  it('returns the identical string instance for pure ASCII (fast path)', () => {
    const ascii = 'C sel 8161308 call SayThis';
    expect(encodeAnsi(ascii)).toBe(ascii);
    expect(encodeAnsi('')).toBe('');
  });

  it('preserves ASCII metacharacters the caller legitimately supplied', () => {
    // A literal quote must survive intact — escaping it is format()'s job,
    // which runs after this codec (RDOUtils.pas:379).
    expect(encodeAnsi('say "hi"; ok')).toBe('say "hi"; ok');
  });
});

describe('cp1252 — decodeAnsi(): the read half of P-H2', () => {
  const bytes = (...v: number[]) => Uint8Array.from(v);

  // The concrete symptom: a Delphi client types a curly quote, the server
  // stores 0x93, and `toString('latin1')` handed us U+0093 — a C1 control that
  // renders as mojibake. Fixing only the write path would have left text we
  // send correctly coming back wrong.
  it.each([
    [0x93, '“'],
    [0x94, '”'],
    [0x92, '’'],
    [0x80, '€'],
    [0x96, '–'],
    [0x85, '…'],
  ])('decodes 0x%s to its CP1252 character', (byte, expected) => {
    expect(decodeAnsi(bytes(byte))).toBe(expected);
  });

  it('no longer yields C1 control characters', () => {
    // The symptom, stated precisely: nothing may land in U+0080–U+009F, the C1
    // control block. Printable code points above it (U+201C and friends) are the
    // whole point of the band, so the bound is the block, not 0x80.
    const decoded = decodeAnsi(bytes(0x93, 0x94, 0x92, 0x80));
    for (const ch of decoded) {
      const cp = ch.charCodeAt(0);
      expect(cp < 0x80 || cp > 0x9f).toBe(true);
    }
  });

  it('leaves ASCII and 0xA0–0xFF untouched', () => {
    expect(decodeAnsi(bytes(0x41, 0x7a, 0x3b, 0x22))).toBe('Az;"');
    expect(decodeAnsi(bytes(0xe9, 0xfc, 0xf1))).toBe('éüñ');
  });

  it('round-trips through encodeAnsi', () => {
    const text = 'Il a dit “bonjour” — 5 € près d’ici';
    const encoded = encodeAnsi(text);
    const wire = Uint8Array.from(encoded, ch => ch.charCodeAt(0));
    expect(decodeAnsi(wire)).toBe(text);
  });

  it('honours an injected band, so a revert stays one line', () => {
    expect(decodeAnsi(bytes(0x93), LATIN1_C1_BAND)).toBe('');
  });

  it('handles a payload larger than the chunking window', () => {
    const big = Uint8Array.from({ length: 20000 }, (_, i) => (i % 2 ? 0x93 : 0x41));
    const decoded = decodeAnsi(big);
    expect(decoded).toHaveLength(20000);
    expect(decoded.slice(0, 4)).toBe('A“A“');
  });
});

describe('cp1252 — clampToWireBytes()', () => {
  it('leaves an all-Latin-1 frame untouched', () => {
    const frame = 'C 1 sel 42 call SayThis "^" "%","%héllo";';
    expect(clampToWireBytes(frame)).toBe(frame);
  });

  it('preserves the 0x80–0x9F band (idempotent after encodeAnsi)', () => {
    // Once L11 activates CP1252, encodeAnsi emits bytes in this band. The net
    // must not treat them as unmappable C1 controls and destroy them.
    const encoded = '\u0080\u0093\u009F';
    expect(clampToWireBytes(encoded)).toBe(encoded);
    expect(Array.from(Buffer.from(clampToWireBytes(encoded), 'latin1'))).toEqual([
      0x80, 0x93, 0x9f,
    ]);
  });

  it('replaces code points above 0xFF that bypassed the value codec', () => {
    expect(clampToWireBytes('C sel 1 call XĢY;')).toBe('C sel 1 call X?Y;');
  });

  it('collapses a surrogate pair to a single ?', () => {
    expect(clampToWireBytes('a😀b')).toBe('a?b');
  });

  it('is idempotent', () => {
    const once = clampToWireBytes('Ģ😀é');
    expect(clampToWireBytes(once)).toBe(once);
  });
});
