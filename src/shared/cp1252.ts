/**
 * src/shared/cp1252.ts
 *
 * Single-byte ANSI wire codec for the RDO protocol (emission side).
 * ----------------------------------------------------------------
 * The Delphi servers exchange `AnsiString` — one byte per character — over raw
 * TCP. The reference (Voyager) client narrows every `widestring` argument to
 * `AnsiString` *before* the RDO literal is escaped and prefixed:
 *
 *     varOleStr:
 *       Result := OLEStringId + RDOStrEncode( WideStrToStr( aVariant ) );
 *     — Rdo/Common/RDOUtils.pas:379
 *
 * `WideStrToStr` (`RDOUtils.pas:266-269`) is a bare `result := widestr`, i.e. the
 * Delphi RTL WideString→AnsiString conversion, which calls `WideCharToMultiByte`
 * on the process ANSI code page. Code points the code page cannot represent are
 * replaced by that code page's default character, `?` (0x3F). [INFERRED from
 * Delphi 5 RTL + Win32 `WideCharToMultiByte` semantics — the Pascal source only
 * shows the implicit assignment.]
 *
 * The practical consequence, and the reason this module exists: the reference
 * client is *structurally incapable* of putting a `"` or a `;` on the wire from
 * a text payload. Node's `Buffer.from(s, 'latin1')` is not — it truncates
 * `charCode & 0xFF` with **no replacement character**, so `U+0122 Ģ` becomes
 * `0x22 '"'` and `U+013B Ļ` becomes `0x3B ';'`, *after* RDO escaping has already
 * run. That is the P-C1 injection defect.
 *
 * ## Extension point — the 0x80–0x9F band (P-H2 / question U3 / lot L11)
 *
 * ISO-8859-1 and Windows-1252 agree on 0x00–0x7F and 0xA0–0xFF; they differ
 * **only** on 0x80–0x9F, where CP1252 carries `€ … ' ' " " – — ™ œ` and
 * ISO-8859-1 carries C1 control codes. Which one the production server actually
 * uses is open question **U3**, and is
 * settled by a live probe, not by reading source.
 *
 * That band is therefore **injectable data**, not hard-coded branches:
 *
 *   - {@link LATIN1_C1_BAND} — identity, today's behaviour. **Active.**
 *   - {@link CP1252_C1_BAND} — the Windows-1252 table, ready but not wired.
 *
 * **Lot L11 is a one-line change**: point {@link ACTIVE_C1_BAND} at
 * {@link CP1252_C1_BAND}. Nothing else in this module, in `rdo-types.ts` or in
 * `rdo-helpers.ts` needs to move. The security property (P-C1) does not depend
 * on which band is active: no band entry may map onto an RDO metacharacter,
 * because every band value is >= 0x80 by construction.
 */

/** Replacement emitted for any code point the wire code page cannot represent. */
export const UNMAPPABLE_REPLACEMENT = '?';

/** Byte value of {@link UNMAPPABLE_REPLACEMENT}. */
export const UNMAPPABLE_REPLACEMENT_BYTE = 0x3f;

/** First byte covered by a C1 band table. */
export const C1_BAND_START = 0x80;

/** Number of entries a C1 band table must contain (0x80–0x9F inclusive). */
export const C1_BAND_LENGTH = 32;

/**
 * A C1 band table. Entry `i` is the Unicode code point that encodes to the byte
 * `0x80 + i`. Exactly {@link C1_BAND_LENGTH} entries.
 */
export type C1BandTable = readonly number[];

/**
 * ISO-8859-1 / current behaviour: bytes 0x80–0x9F are the C1 control codes and
 * map to the identically-numbered code points.
 *
 * This is the **active** table. It keeps L1 strictly a P-C1 fix (injection) and
 * leaves P-H2 (the mojibake half) to lot L11, once U3 has answered.
 */
export const LATIN1_C1_BAND: C1BandTable = Array.from(
  { length: C1_BAND_LENGTH },
  (_unused, i) => C1_BAND_START + i
);

/**
 * Windows-1252. Bytes 0x81, 0x8D, 0x8F, 0x90 and 0x9D are undefined in the
 * published table; Windows round-trips them through the same-numbered C1
 * control, which is what these entries encode.
 *
 * Not active — see the module header and lot L11.
 */
export const CP1252_C1_BAND: C1BandTable = [
  0x20ac, // 0x80 €
  0x0081, // 0x81 (undefined — Windows round-trips U+0081)
  0x201a, // 0x82 ‚
  0x0192, // 0x83 ƒ
  0x201e, // 0x84 „
  0x2026, // 0x85 …
  0x2020, // 0x86 †
  0x2021, // 0x87 ‡
  0x02c6, // 0x88 ˆ
  0x2030, // 0x89 ‰
  0x0160, // 0x8A Š
  0x2039, // 0x8B ‹
  0x0152, // 0x8C Œ
  0x008d, // 0x8D (undefined)
  0x017d, // 0x8E Ž
  0x008f, // 0x8F (undefined)
  0x0090, // 0x90 (undefined)
  0x2018, // 0x91 '
  0x2019, // 0x92 '
  0x201c, // 0x93 "
  0x201d, // 0x94 "
  0x2022, // 0x95 •
  0x2013, // 0x96 –
  0x2014, // 0x97 —
  0x02dc, // 0x98 ˜
  0x2122, // 0x99 ™
  0x0161, // 0x9A š
  0x203a, // 0x9B ›
  0x0153, // 0x9C œ
  0x009d, // 0x9D (undefined)
  0x017e, // 0x9E ž
  0x0178, // 0x9F Ÿ
];

/**
 * The band in force for outgoing frames.
 *
 * **CP1252 since 2026-08-15 (lot L11).** Developer decision, taken on an
 * `[INFERRED]` argument rather than a direct measurement — probe U3-b harvested
 * 185 server log files (575 MB) and found **zero** bytes in 0x80–0x9F, but also
 * almost no human non-ASCII text at all: three bytes in the whole corpus, and
 * the retained chat log for 2026-08-14 is 43 bytes long. Absence proves nothing
 * on a corpus that thin.
 *
 * The argument that decided it: the servers are Delphi 5 Win32 processes, and
 * `WideStrToStr` goes through `WideCharToMultiByte` on the process ANSI code
 * page (`RDOUtils.pas:266-269`), which on a Western Windows install *is* CP1252.
 * ISO-8859-1 is the ANSI code page of no Windows install — it was only ever
 * chosen here because Node exposes it under the name `latin1`.
 *
 * Blast radius is bounded: 0x00–0x7F and 0xA0–0xFF are identical in both tables
 * (see the ranges below), so only 0x80–0x9F changes — and that band was wrong in
 * both directions before (P-H2): `"` (U+201C) went out as 0x1C, a control byte,
 * and an incoming 0x93 decoded to U+0093, mojibake.
 *
 * To revert, point this at {@link LATIN1_C1_BAND}. Nothing else needs to move.
 */
export const ACTIVE_C1_BAND: C1BandTable = CP1252_C1_BAND;

/**
 * Invert a band table into the code-point → byte map the encoder uses.
 *
 * @throws Error when the table is not exactly {@link C1_BAND_LENGTH} entries, or
 *         when two entries claim the same code point — either would silently
 *         drop a byte from the encodable alphabet.
 */
export function buildC1EncodeMap(band: C1BandTable): ReadonlyMap<number, number> {
  if (band.length !== C1_BAND_LENGTH) {
    throw new Error(
      `Invalid C1 band table: expected ${C1_BAND_LENGTH} entries, got ${band.length}`
    );
  }
  const map = new Map<number, number>();
  for (let i = 0; i < band.length; i++) {
    const codePoint = band[i];
    if (map.has(codePoint)) {
      throw new Error(
        `Invalid C1 band table: duplicate code point U+${codePoint.toString(16).toUpperCase()}`
      );
    }
    map.set(codePoint, C1_BAND_START + i);
  }
  return map;
}

/** Encode map derived from {@link ACTIVE_C1_BAND}, built once at module load. */
export const ACTIVE_C1_ENCODE_MAP = buildC1EncodeMap(ACTIVE_C1_BAND);

/**
 * Decode wire bytes to a string, honouring {@link ACTIVE_C1_BAND}.
 *
 * The mirror of {@link encodeAnsi}, and the other half of P-H2. Node's `latin1`
 * decoder maps every byte to the code point of the same value, so an incoming
 * `0x93` — the byte a Delphi client sends for `"` — became U+0093, a C1 control
 * character, and reached the screen as mojibake. Fixing only the write path
 * would have left text we send correctly coming back wrong.
 *
 * Bytes outside 0x80–0x9F are identical in both candidate code pages, so they
 * take the fast path. RDO metacharacters are all ASCII and therefore untouched —
 * framing is unaffected by this decode.
 */
export function decodeAnsi(bytes: Uint8Array, band: C1BandTable = ACTIVE_C1_BAND): string {
  // `Uint8Array`, not `Buffer`: this module is shared with the browser bundle,
  // which has no Node types. Buffer extends Uint8Array, so callers are unchanged.
  const CHUNK = 8192; // keeps the spread below the argument-count limit
  let out = '';

  for (let start = 0; start < bytes.length; start += CHUNK) {
    const slice = bytes.subarray(start, Math.min(start + CHUNK, bytes.length));
    const codeUnits = new Array<number>(slice.length);
    for (let i = 0; i < slice.length; i++) {
      const byte = slice[i];
      codeUnits[i] = byte >= C1_BAND_START && byte <= 0x9f
        ? band[byte - C1_BAND_START]
        : byte;
    }
    out += String.fromCharCode(...codeUnits);
  }
  return out;
}

/**
 * Encode one Unicode code point to its wire byte.
 *
 * @returns the byte value, or {@link UNMAPPABLE_REPLACEMENT_BYTE} when the code
 *          page cannot represent the code point.
 */
export function encodeCodePoint(
  codePoint: number,
  c1Map: ReadonlyMap<number, number> = ACTIVE_C1_ENCODE_MAP
): number {
  // ASCII — identical in every candidate code page. Also the only range that
  // contains RDO metacharacters ("  ;  ,  =  space), so nothing outside it may
  // ever be allowed to land here.
  if (codePoint < C1_BAND_START) {
    return codePoint;
  }
  const banded = c1Map.get(codePoint);
  if (banded !== undefined) {
    return banded;
  }
  // 0xA0–0xFF: ISO-8859-1 and CP1252 coincide (é, ü, ñ … — the July A1/F1 fix).
  if (codePoint >= 0xa0 && codePoint <= 0xff) {
    return codePoint;
  }
  // Everything else — including astral code points from surrogate pairs, which
  // `for…of` yields whole, so an emoji costs exactly one '?' and never a NUL.
  return UNMAPPABLE_REPLACEMENT_BYTE;
}

/**
 * Narrow arbitrary text to the single-byte wire alphabet.
 *
 * Must run **before** RDO quote escaping (`" → ""`), mirroring
 * `RDOUtils.pas:379` — `RDOStrEncode( WideStrToStr( v ) )`. Applied afterwards
 * it would leave any metacharacter the codec itself produced unescaped; the
 * order is what makes the guarantee independent of the active band.
 *
 * @param text arbitrary UTF-16 text (may contain surrogate pairs)
 * @param c1Map band map to use; defaults to {@link ACTIVE_C1_ENCODE_MAP}
 * @returns a string whose every char code is <= 0xFF, ready for
 *          `Buffer.from(…, 'latin1')`
 */
export function encodeAnsi(
  text: string,
  c1Map: ReadonlyMap<number, number> = ACTIVE_C1_ENCODE_MAP
): string {
  // Fast path: pure ASCII is already the wire form and is by far the common case.
  let needsWork = false;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) >= C1_BAND_START) {
      needsWork = true;
      break;
    }
  }
  if (!needsWork) {
    return text;
  }

  let out = '';
  for (const char of text) {
    out += String.fromCharCode(encodeCodePoint(char.codePointAt(0)!, c1Map));
  }
  return out;
}

/**
 * Idempotent byte clamp for a fully assembled frame — the safety net applied at
 * the socket, after every value has already been through {@link encodeAnsi}.
 *
 * It deliberately does **not** re-run {@link encodeAnsi}: once the CP1252 band
 * is active (L11) a second pass would see already-encoded bytes such as 0x93 as
 * C1 controls and destroy them. This pass only guarantees the invariant
 * `Buffer.from(…, 'latin1')` silently assumes — every char code <= 0xFF — and
 * replaces anything else, so a frame assembled on a path that bypassed
 * `RdoValue.format()` still cannot forge a metacharacter.
 *
 * @returns a string whose every char code is <= 0xFF
 */
export function clampToWireBytes(frame: string): string {
  let needsWork = false;
  for (let i = 0; i < frame.length; i++) {
    if (frame.charCodeAt(i) > 0xff) {
      needsWork = true;
      break;
    }
  }
  if (!needsWork) {
    return frame;
  }

  let out = '';
  for (const char of frame) {
    const codePoint = char.codePointAt(0)!;
    out += codePoint <= 0xff ? char : UNMAPPABLE_REPLACEMENT;
  }
  return out;
}
