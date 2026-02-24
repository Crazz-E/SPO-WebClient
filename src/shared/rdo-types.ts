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
    return new RdoValue(RdoTypePrefix.INTEGER, Math.floor(value));
  }

  /**
   * Create a string identifier (StringId)
   */
  static stringId(value: string): RdoValue {
    return new RdoValue(RdoTypePrefix.STRING, value);
  }

  /**
   * Create a variant value (VariantId)
   */
  static variant(value: string | number): RdoValue {
    return new RdoValue(RdoTypePrefix.VARIANT, value);
  }

  /**
   * Create a float value (SingleId)
   */
  static float(value: number): RdoValue {
    return new RdoValue(RdoTypePrefix.FLOAT, value);
  }

  /**
   * Create a double value (DoubleId)
   */
  static double(value: number): RdoValue {
    return new RdoValue(RdoTypePrefix.DOUBLE, value);
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
   */
  format(): string {
    if (this._prefix === RdoTypePrefix.VOID) {
      return `"${this._prefix}"`;
    }
    // Escape internal double quotes per Delphi convention: " → ""
    const escaped = String(this._value).replace(/"/g, '""');
    return `"${this._prefix}${escaped}"`;
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
  private rdoArgs: RdoValue[] = [];
  private requestId?: number;

  private constructor() {}

  /**
   * Start building a command with 'sel' verb
   */
  static sel(targetId: string | number): RdoCommand {
    const cmd = new RdoCommand();
    cmd.targetId = targetId.toString();
    return cmd;
  }

  /**
   * Set the action to 'call' with method name
   */
  call(methodName: string): this {
    this.actionType = 'call';
    this.member = methodName;
    return this;
  }

  /**
   * Set the action to 'get' with property name
   */
  get(propertyName: string): this {
    this.actionType = 'get';
    this.member = propertyName;
    return this;
  }

  /**
   * Set the action to 'set' with property name
   */
  set(propertyName: string): this {
    this.actionType = 'set';
    this.member = propertyName;
    return this;
  }

  /**
   * Use push separator (*) for void calls
   */
  push(): this {
    this.separator = '"*"';
    return this;
  }

  /**
   * Use method separator (^) for calls expecting return values
   */
  method(): this {
    this.separator = '"^"';
    return this;
  }

  /**
   * Add request ID (makes it a REQUEST instead of PUSH)
   */
  withRequestId(rid: number): this {
    this.requestId = rid;
    this.separator = '"^"'; // Requests use method separator
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

    // Add member (method/property name)
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

    // For set actions, add value
    if (this.actionType === 'set' && this.rdoArgs.length > 0) {
      parts.push(`=${this.rdoArgs[0].format()}`);
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
