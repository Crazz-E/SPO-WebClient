/**
 * src/shared/rdo-types.ts
 *
 * RDO Protocol Type System
 * ------------------------
 * Provides type-safe handling of RDO protocol values and commands.
 *
 * RDO Type Prefixes:
 * - # = OrdinalId → Integer
 * - $ = StringId → String (short identifier)
 * - ^ = VariantId → Variant type
 * - ! = SingleId → Float (single precision)
 * - @ = DoubleId → Double (double precision)
 * - % = OLEStringId → Wide string
 * - * = VoidId → Void/no return
 */

import { encodeAnsi } from './cp1252';
import { ERROR_InvalidParameter } from './error-codes';

/**
 * RDO Type Prefix Constants
 */
export enum RdoTypePrefix {
  INTEGER = '#',      // OrdinalId
  STRING = '$',       // StringId
  VARIANT = '^',      // VariantId
  FLOAT = '!',        // SingleId
  DOUBLE = '@',       // DoubleId
  OLESTRING = '%',    // OLEStringId (wide string)
  VOID = '*',         // VoidId
}

/** The seven RDO type prefixes, as plain characters. */
export const RDO_TYPE_PREFIXES: readonly string[] = Object.freeze(
  Object.values(RdoTypePrefix) as string[]
);

/** True when `ch` is one of the seven RDO type prefix characters. */
export function isRdoTypePrefix(ch: string): boolean {
  return ch.length === 1 && RDO_TYPE_PREFIXES.includes(ch);
}

/**
 * Assemble one RDO literal: `"` + type prefix + escaped body + `"`.
 *
 * Single source of truth for literal emission — {@link RdoValue.format} and
 * `RdoProtocol.formatTypedToken` (src/server/rdo.ts) both route through it, so
 * there is exactly one place where the wire alphabet is narrowed and exactly one
 * place where `"` is doubled.
 *
 * Order is load-bearing and mirrors the reference client exactly —
 * `RDOStrEncode( WideStrToStr( aVariant ) )`, `Rdo/Common/RDOUtils.pas:379`:
 *
 *   1. narrow to the single-byte wire alphabet (`encodeAnsi`, unmappable → `?`)
 *   2. escape RDO literal delimiters (`" → ""`, `RDOUtils.pas:246-254`)
 *   3. prefix and quote
 *
 * Narrowing FIRST is what closes P-C1 (lot L1): Node's latin1 writer truncates
 * `charCode & 0xFF` with no replacement, so `U+0122 Ģ` used to reach the wire as
 * `0x22 '"'` — after step 2 had already run, making the escaping useless.
 * Keeping step 1 ahead of step 2 also makes the guarantee independent of the
 * active code-page table (`shared/cp1252.ts`, lot L11).
 *
 * **Call this exactly once per value.** Feeding an already-encoded literal back
 * in would run `encodeAnsi` twice, which is lossy once the CP1252 band is active
 * (0x93 would be re-read as a C1 control) — see `cp1252.ts` and
 * {@link isWellFormedRdoLiteral}, the guard that keeps that from happening.
 */
export function encodeRdoLiteral(prefix: string, value: string): string {
  return `"${prefix}${encodeAnsi(value).replace(/"/g, '""')}"`;
}

/**
 * One complete, correctly escaped RDO literal and nothing else: an opening
 * quote, a type prefix, a body in which every `"` is doubled, and a closing
 * quote. The body alternation is unambiguous (a `"` can only start a `""` pair,
 * a non-`"` can only be `[^"]`), so matching is linear — no backtracking blowup
 * on hostile input.
 *
 * This is the *structural* guarantee the framer relies on: a token that matches
 * cannot terminate its own literal early, therefore it cannot append a second
 * sub-command or a second frame (P-M2, `report/rdo-audit-2026-08-14-annexe-moyennes-basses.md` §1).
 */
const RDO_LITERAL_PATTERN = /^"[#$^!@%*](?:[^"]|"")*"$/;

/** True when `token` is exactly one complete, correctly escaped RDO literal. */
export function isWellFormedRdoLiteral(token: string): boolean {
  return RDO_LITERAL_PATTERN.test(token);
}

/**
 * Delphi identifier grammar: a letter or underscore, then letters, digits or
 * underscores — `IsValidFirstIdentChar` / `IsValidIdentChar`,
 * `Rdo/Common/RDOUtils.pas:70-78`, consumed by `ReadIdent` (`:127-145`), which
 * simply stops at the first character outside the set.
 */
export const RDO_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Thrown when a member (method / property) name would not survive the Delphi
 * parser intact.
 *
 * Typed rather than a bare `Error` so WebSocket handlers can map it onto a
 * protocol error code without string matching. `ERROR_InvalidParameter` (29) is
 * the server's own code for a malformed argument (`shared/error-codes.ts`).
 */
export class RdoIdentifierError extends Error {
  /** Protocol error code carried to the WS boundary. */
  public readonly errorCode: number = ERROR_InvalidParameter;

  constructor(
    /** The rejected name, verbatim. */
    public readonly identifier: string,
    /** Where it was about to be used — `call`, `get`, `set`, `member`… */
    public readonly context: string
  ) {
    super(
      `Invalid RDO identifier for ${context}: ${JSON.stringify(identifier)} ` +
      `(must match ${RDO_IDENTIFIER_PATTERN.source} — Delphi ReadIdent, RDOUtils.pas:70-78)`
    );
    this.name = 'RdoIdentifierError';
  }
}

/** Non-throwing form of {@link assertValidRdoIdentifier}. */
export function isValidRdoIdentifier(name: unknown): name is string {
  return typeof name === 'string' && RDO_IDENTIFIER_PATTERN.test(name);
}

/**
 * Reject any member name the Delphi parser would truncate.
 *
 * `ReadIdent` (`RDOUtils.pas:127-145`) stops at the first character outside
 * `[A-Za-z0-9_]` and **hands the remainder back to the sub-command loop**
 * (`RDOQueryServer.pas:133-160`). A name such as
 * `Foo" call Evil "*" "` therefore does not fail — it executes `Evil` on the
 * same object. Validating here is what makes a client-supplied member name safe
 * (P-H3).
 *
 * @param name    the member name about to be written to the wire
 * @param context call site label used in the error message (`call`/`get`/`set`/`member`)
 * @throws {RdoIdentifierError} when `name` is not a Delphi identifier
 */
export function assertValidRdoIdentifier(name: string, context = 'member'): void {
  if (!isValidRdoIdentifier(name)) {
    throw new RdoIdentifierError(String(name), context);
  }
}

/**
 * P-M4 — the numeric constructors did not guarantee a numeric literal.
 *
 * `RdoValue.int(NaN)` produced `"#NaN"`, `double(Infinity)` produced
 * `"#Infinity"`, and `1e21` stringifies to `"1e+21"`. Delphi's decoder does
 * `VarCast(Result, tmp, varInteger)` (`RDOUtils.pas:333-344`) and raises on a
 * non-numeric string, so these reach the shared server as a malformed query
 * rather than as a value we can reason about.
 *
 * Reachable: coordinates and counts arrive from browser JSON, and nothing
 * validates them at the WebSocket boundary. `Math.floor(NaN)` is `NaN`, so the
 * old `int()` propagated it silently.
 */
function assertWireNumber(value: number, kind: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `RdoValue.${kind}() needs a finite number, got ${value}. Delphi's VarCast ` +
      `raises on a non-numeric literal (RDOUtils.pas:333-344).`
    );
  }
  return value;
}

/**
 * Every RDO type prefix, as a character class fragment for stripping.
 *
 * P-M6: eleven sites open-coded this as `[$#%@]` or `[%#@$]` — four of the seven
 * prefixes. `!` (SingleId) and `^` (VariantId) were missing everywhere, so a
 * `single` property would arrive as `!0.85`, survive the strip untouched, and
 * `parseFloat` it to `NaN`. `RDOUtils.pas:369-370` shows the server emitting
 * `SingleId`, and `:381` `VariantId`, so neither is hypothetical.
 *
 * Whether a published property is actually declared `single` is still
 * `[UNKNOWN]` — probe U6 would settle it — but stripping a prefix the server
 * *can* emit costs nothing and removes the failure mode either way.
 */
export const RDO_PREFIX_CHARS = '$#%@!^*';

/**
 * Matches a leading RDO type prefix, whichever of the seven it is.
 *
 * Exported so the fourteen `.replace(...)` sites share one definition instead of
 * each carrying its own character class — which is how two of the seven prefixes
 * went missing from all of them.
 */
export const RDO_PREFIX_STRIP = /^[$#%@!^*]/;

/** Strip a leading RDO type prefix, whichever of the seven it is. */
export function stripRdoPrefix(value: string): string {
  return value.replace(RDO_PREFIX_STRIP, '');
}

/** As {@link assertWireNumber}, plus the integer-range guarantee `#` implies. */
function assertWireInteger(value: number): number {
  const floored = Math.floor(assertWireNumber(value, 'int'));
  if (!Number.isSafeInteger(floored)) {
    throw new RangeError(
      `RdoValue.int() needs a safe integer, got ${value}. Beyond 2^53 the value ` +
      `stringifies in exponential form and stops being an RDO ordinal.`
    );
  }
  return floored;
}

/**
 * Internal representation of an RDO typed value
 */
interface RdoTypedValue {
  prefix: RdoTypePrefix;
  rawValue: string | number;
}

/**
 * RdoValue - Fluent API for creating RDO typed values
 *
 * Usage:
 *   RdoValue.int(42)           → "#42"
 *   RdoValue.string("hello")   → "%hello"
 *   RdoValue.float(3.14)       → "!3.14"
 *   RdoValue.void()            → "*"
 */
export class RdoValue {
  private constructor(
    private readonly _prefix: RdoTypePrefix,
    private readonly _value: string | number
  ) {}

  /**
   * Create an integer value (OrdinalId)
   */
  static int(value: number): RdoValue {
    return new RdoValue(RdoTypePrefix.INTEGER, assertWireInteger(value));
  }

  /**
   * Create a string identifier (StringId)
   */
  static stringId(value: string): RdoValue {
    return new RdoValue(RdoTypePrefix.STRING, value);
  }

  /**
   * Create a variant value (VariantId).
   *
   * **The value is destroyed by the server.** `GetVariantFromStr` decodes
   * `VariantId` as `TVarData(Result).VType := varVariant` without ever reading
   * the body (`RDOUtils.pas:349-350`), so whatever you pass here reaches the
   * method as an empty variant. `^` is the *separator* that asks for a return
   * value; as an *argument* prefix it is a no-op that looks like data (P-L2).
   *
   * Kept because round-tripping a parsed frame must be able to reproduce it, but
   * no production call site uses it, and none should: use `int`, `string`,
   * `double` or `float` for real arguments.
   *
   * @deprecated Argument-only round-tripping. The server discards the value.
   */
  static variant(value: string | number): RdoValue {
    return new RdoValue(RdoTypePrefix.VARIANT, value);
  }

  /**
   * Create a float value (SingleId)
   */
  static float(value: number): RdoValue {
    return new RdoValue(RdoTypePrefix.FLOAT, assertWireNumber(value, 'float'));
  }

  /**
   * Create a double value (DoubleId)
   */
  static double(value: number): RdoValue {
    return new RdoValue(RdoTypePrefix.DOUBLE, assertWireNumber(value, 'double'));
  }

  /**
   * Create a wide string value (OLEStringId)
   */
  static string(value: string): RdoValue {
    return new RdoValue(RdoTypePrefix.OLESTRING, value);
  }

  /**
   * Create a void value (VoidId)
   */
  static void(): RdoValue {
    return new RdoValue(RdoTypePrefix.VOID, '');
  }

  /**
   * Format the value for RDO protocol transmission
   * Returns quoted value with type prefix (e.g., "#42")
   *
   * Delegates to {@link encodeRdoLiteral}, which owns the narrow-then-escape
   * order mandated by `RDOUtils.pas:379` (lot L1 / P-C1).
   */
  format(): string {
    if (this._prefix === RdoTypePrefix.VOID) {
      // VoidId carries no value — the server decodes it to `Unassigned`
      // (RDOUtils.pas:351-352), so anything appended would be destroyed anyway.
      return `"${this._prefix}"`;
    }
    return encodeRdoLiteral(this._prefix, String(this._value));
  }

  /**
   * Get the raw value without type prefix
   */
  get value(): string | number {
    return this._value;
  }

  /**
   * Get the type prefix
   */
  get prefix(): RdoTypePrefix {
    return this._prefix;
  }

  /**
   * Get internal representation
   */
  toTypedValue(): RdoTypedValue {
    return {
      prefix: this._prefix,
      rawValue: this._value
    };
  }

  /**
   * Convert to string representation (for debugging)
   */
  toString(): string {
    return this.format();
  }
}

/**
 * RdoParser - Extract values from RDO formatted strings
 *
 * Usage:
 *   RdoParser.extract("#42")     → { prefix: '#', value: '42' }
 *   RdoParser.getValue("#42")    → '42'
 *   RdoParser.getPrefix("#42")   → '#'
 */
export class RdoParser {
  /**
   * Extract prefix and value from RDO formatted string
   * Removes outer quotes and separates type prefix from value
   */
  static extract(formatted: string): { prefix: string; value: string } {
    let cleaned = formatted.trim();

    // Remove outer quotes if present
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }

    // Extract prefix (first character if it's a known type prefix)
    const firstChar = cleaned.charAt(0);
    const knownPrefixes = Object.values(RdoTypePrefix) as string[];

    if (knownPrefixes.includes(firstChar)) {
      // Unescape doubled quotes per Delphi convention: "" → "
      const value = cleaned.substring(1).replace(/""/g, '"');
      return {
        prefix: firstChar,
        value,
      };
    }

    // No recognized prefix - unescape and return as-is
    return {
      prefix: '',
      value: cleaned.replace(/""/g, '"'),
    };
  }

  /**
   * Get only the value part (without prefix or quotes)
   */
  static getValue(formatted: string): string {
    return this.extract(formatted).value;
  }

  /**
   * Get only the type prefix
   */
  static getPrefix(formatted: string): string {
    return this.extract(formatted).prefix;
  }

  /**
   * Check if a string has a specific RDO type prefix
   */
  static hasPrefix(formatted: string, prefix: RdoTypePrefix): boolean {
    return this.getPrefix(formatted) === prefix;
  }

  /**
   * Parse as integer (extracts value and converts to number)
   */
  static asInt(formatted: string): number {
    const value = this.getValue(formatted);
    return parseInt(value, 10);
  }

  /**
   * Parse as float
   */
  static asFloat(formatted: string): number {
    const value = this.getValue(formatted);
    return parseFloat(value);
  }

  /**
   * Parse as string (just extracts the value)
   */
  static asString(formatted: string): string {
    return this.getValue(formatted);
  }
}

/**
 * Helper function to create RdoValue array from raw arguments
 * Automatically detects type based on format:
 * - "#123" -> int(123)
 * - "%hello" -> string("hello")
 * - "$id" -> stringId("id")
 * - etc.
 */
export function rdoArgs(...values: (RdoValue | string | number)[]): RdoValue[] {
  return values.map(v => {
    if (v instanceof RdoValue) {
      return v;
    }

    if (typeof v === 'number') {
      return RdoValue.int(v);
    }

    // String - check if it has a type prefix
    const str = v as string;
    const extracted = RdoParser.extract(str);

    if (extracted.prefix) {
      // Has a prefix - create appropriate RdoValue
      const val = extracted.value;
      switch (extracted.prefix) {
        case RdoTypePrefix.INTEGER:
          return RdoValue.int(parseInt(val, 10));
        case RdoTypePrefix.FLOAT:
          return RdoValue.float(parseFloat(val));
        case RdoTypePrefix.DOUBLE:
          return RdoValue.double(parseFloat(val));
        case RdoTypePrefix.STRING:
          return RdoValue.stringId(val);
        case RdoTypePrefix.OLESTRING:
          return RdoValue.string(val);
        case RdoTypePrefix.VARIANT:
          return RdoValue.variant(val);
        case RdoTypePrefix.VOID:
          return RdoValue.void();
        default:
          return RdoValue.string(val);
      }
    }

    // No prefix - treat as string
    return RdoValue.string(str);
  });
}

/**
 * RdoCommand - Builder pattern for constructing RDO commands
 *
 * Usage:
 *   RdoCommand.sel(worldId)
 *     .call('RDOSetPrice')
 *     .push()
 *     .args(RdoValue.int(0), RdoValue.int(220))
 *     .build()
 *
 *   → "C sel 12345 call RDOSetPrice "*" "#0","#220";"
 */
export class RdoCommand {
  private targetId?: string;
  private member?: string;
  private actionType: 'call' | 'get' | 'set' = 'call';
  private separator: '"*"' | '"^"' = '"*"';
  /**
   * True once `.push()` or `.method()` has stated a separator explicitly.
   * `withRequestId()` then leaves the choice alone — QueryId and separator are
   * two independent axes (doc/rdo-protocol-architecture.md §8.5), and conflating
   * them made `QueryId + "*"` — the reference client's form for void members,
   * `AddLine → A2174 ;` [capture :3542-3543] — impossible to express (P-L4).
   */
  private separatorExplicit = false;
  private rdoArgs: RdoValue[] = [];
  private requestId?: number;

  private constructor() {}

  /**
   * Start building a command with 'sel' verb
   * @throws Error if targetId is 0 or empty (would produce invalid 'sel 0' on the wire)
   */
  static sel(targetId: string | number): RdoCommand {
    const id = targetId.toString();
    if (!id || id === '0') {
      throw new Error(`Invalid RDO target ID: ${targetId} (sel 0 is a null pointer on the server)`);
    }
    const cmd = new RdoCommand();
    cmd.targetId = id;
    return cmd;
  }

  /**
   * Set the action to 'call' with method name
   * @throws {RdoIdentifierError} if the name is not a Delphi identifier (P-H3)
   */
  call(methodName: string): this {
    assertValidRdoIdentifier(methodName, 'call');
    this.actionType = 'call';
    this.member = methodName;
    return this;
  }

  /**
   * Set the action to 'get' with property name
   * @throws {RdoIdentifierError} if the name is not a Delphi identifier (P-H3)
   */
  get(propertyName: string): this {
    assertValidRdoIdentifier(propertyName, 'get');
    this.actionType = 'get';
    this.member = propertyName;
    return this;
  }

  /**
   * Set the action to 'set' with property name
   * @throws {RdoIdentifierError} if the name is not a Delphi identifier (P-H3)
   */
  set(propertyName: string): this {
    assertValidRdoIdentifier(propertyName, 'set');
    this.actionType = 'set';
    this.member = propertyName;
    return this;
  }

  /**
   * Use push separator (*) — void member, no `res=` in the reply.
   * Independent of {@link withRequestId}: with a QueryId the server still acks
   * `A<id> ;` (§8.5, capture-proven), without one it stays silent.
   */
  push(): this {
    this.separator = '"*"';
    this.separatorExplicit = true;
    return this;
  }

  /**
   * Use method separator (^) for calls expecting return values
   */
  method(): this {
    this.separator = '"^"';
    this.separatorExplicit = true;
    return this;
  }

  /**
   * Add request ID (makes it a REQUEST instead of PUSH).
   *
   * Defaults the separator to `"^"` because a request usually wants `res=`, but
   * never overrides an explicit `.push()` / `.method()` — the two axes are
   * orthogonal (P-L4). Note that `"^"` WITHOUT a QueryId is the one genuinely
   * unsafe combination; this method only ever adds a QueryId, so it cannot
   * create it.
   */
  withRequestId(rid: number): this {
    this.requestId = rid;
    if (!this.separatorExplicit) {
      this.separator = '"^"';
    }
    return this;
  }

  /**
   * Add arguments to the command
   */
  args(...values: (RdoValue | string | number)[]): this {
    this.rdoArgs = values.map(v => {
      if (v instanceof RdoValue) {
        return v;
      } else if (typeof v === 'number') {
        return RdoValue.int(v);
      } else {
        return RdoValue.string(v);
      }
    });
    return this;
  }

  /**
   * Build the final RDO command string
   */
  build(): string {
    const parts: string[] = ['C'];

    // Add request ID if present
    if (this.requestId !== undefined) {
      parts.push(this.requestId.toString());
    }

    // Add verb and target
    parts.push('sel', this.targetId!);

    // Add action
    parts.push(this.actionType);

    // P-L5: build() used to drop arguments without a word — a `get` ignored
    // them entirely, and a `set` used only rdoArgs[0], silently discarding the
    // rest. Not reachable today (the four SET sites all pass exactly one, and no
    // GET passes any), so this is a latent trap rather than a live bug: the next
    // caller to write `.get('X').args(y)` would have watched `y` vanish onto the
    // wire with nothing to explain it.
    if (this.actionType === 'get' && this.rdoArgs.length > 0) {
      throw new Error(
        `RDO get ${this.member} was given ${this.rdoArgs.length} argument(s), but the ` +
        `grammar has no place for them — they would be dropped silently.`
      );
    }
    if (this.actionType === 'set' && this.rdoArgs.length > 1) {
      throw new Error(
        `RDO set ${this.member} was given ${this.rdoArgs.length} arguments; a property ` +
        `assignment takes exactly one, and only the first would reach the server.`
      );
    }

    // Add member (method/property name) and action-specific parts
    if (this.actionType === 'set' && this.member) {
      // SET format: "set PropName=value" (no space around =)
      const value = this.rdoArgs.length > 0 ? this.rdoArgs[0].format() : '';
      parts.push(`${this.member}=${value}`);
    } else {
      if (this.member) {
        parts.push(this.member);
      }

      // For call actions, add separator and args
      if (this.actionType === 'call') {
        parts.push(this.separator);

        if (this.rdoArgs.length > 0) {
          const formattedArgs = this.rdoArgs.map(arg => arg.format()).join(',');
          parts.push(formattedArgs);
        }
      }
    }

    return parts.join(' ') + ';';
  }

  /**
   * Convert to string (calls build())
   */
  toString(): string {
    return this.build();
  }
}
