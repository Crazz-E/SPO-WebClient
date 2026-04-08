import {
  RdoPacket,
  RdoVerb,
  RdoAction,
  RDO_CONSTANTS,
  RDO_ERROR_CODES
} from '../shared/types';
import {
  RdoValue,
  RdoParser,
  RdoCommand,
  RdoTypePrefix
} from '../shared/rdo-types';

/**
 * RDO Protocol Engine
 * -------------------
 * Handles framing (splitting TCP streams by delimiter) and
 * parsing/formatting of ASCII commands with Strict Typing rules.
 */

export class RdoFramer {
  private buffer: string = '';

  /** Maximum buffer size (5MB) to prevent memory exhaustion from malformed packets */
  private static readonly MAX_BUFFER_SIZE = 5 * 1024 * 1024;

  /**
   * Find the next unquoted semicolon delimiter position.
   * Per Delphi's KeyWordPos (RDOUtils.pas), semicolons inside "..." are skipped.
   */
  private findDelimiter(): number {
    let inQuotes = false;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === RDO_CONSTANTS.PACKET_DELIMITER && !inQuotes) {
        return i;
      }
    }
    return -1;
  }

  public ingest(chunk: Buffer | string): string[] {
    this.buffer += chunk.toString('latin1');

    // Guard against unbounded buffer growth (malformed packets with unclosed quotes)
    if (this.buffer.length > RdoFramer.MAX_BUFFER_SIZE) {
      console.error(`[RdoFramer] Buffer exceeded ${RdoFramer.MAX_BUFFER_SIZE} bytes, clearing to prevent memory exhaustion`);
      this.buffer = '';
      return [];
    }

    const messages: string[] = [];
    let delimiterIndex: number;

    while ((delimiterIndex = this.findDelimiter()) !== -1) {
      const message = this.buffer.substring(0, delimiterIndex).trim();
      if (message.length > 0) {
        messages.push(message);
      }
      this.buffer = this.buffer.substring(delimiterIndex + 1);
    }

    return messages;
  }
}

export class RdoProtocol {
  /**
   * Parses a raw protocol string into a structured RdoPacket.
   */
  public static parse(raw: string): RdoPacket {
    const trimmed = raw.trim();

    // 1. Detect Packet Type
    if (trimmed.startsWith(RDO_CONSTANTS.CMD_PREFIX_ANSWER)) {
      return this.parseResponse(trimmed);
    } else if (trimmed.startsWith(RDO_CONSTANTS.CMD_PREFIX_CLIENT)) {
      return this.parseCommand(trimmed);
    }

    return {
      raw,
      type: 'PUSH',
      payload: trimmed
    };
  }

	  private static parseResponse(raw: string): RdoPacket {
		// Regex: A(\d+)\s+(.*)
		const match = raw.match(/^A(\d+)\s*([\s\S]*)$/);
		if (!match) {
		  return { raw, type: 'RESPONSE', payload: raw };
		}

		const payload = match[2];
		const packet: RdoPacket = {
		  raw,
		  type: 'RESPONSE',
		  rid: parseInt(match[1], 10),
		  payload,
		};

		// Check for RDO error response: "error <code>" (ErrorCodes.pas:0-17)
		const errorMatch = payload.match(/^error\s+(\d+)$/i);
		if (errorMatch) {
		  const code = parseInt(errorMatch[1], 10);
		  packet.errorCode = code;
		  packet.errorName = RDO_ERROR_CODES[code] ?? `unknownError(${code})`;
		}

		return packet;
	  }

	  /**
	   * Helper: Tokenize RDO content en respectant les quotes
	   */
	  private static tokenizeRdoCommand(content: string): string[] {
		const tokens: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < content.length; i++) {
		  const char = content[i];
		  if (char === '"' && (i === 0 || content[i-1] !== '\\')) {
			inQuotes = !inQuotes;
			current += char;
		  } else if (char === ' ' && !inQuotes) {
			if (current.length > 0) {
			  tokens.push(current);
			  current = '';
			}
		  } else {
			current += char;
		  }
		}

		if (current.length > 0) {
		  tokens.push(current);
		}

		return tokens;
	  }


	 private static parseCommand(raw: string): RdoPacket {
		let content = raw.substring(1).trim();
		let rid: number | undefined;
		let type: 'REQUEST' | 'PUSH' = 'PUSH';

		// Check request ID ([\s\S]* to match across newlines in multi-line args)
		const ridMatch = content.match(/^(\d+)\s+([\s\S]*)$/);
		if (ridMatch) {
			rid = parseInt(ridMatch[1], 10);
			content = ridMatch[2];
			// CRITICAL: If there's a RID, this is a REQUEST from server (needs response)
			type = 'REQUEST';
		}

		// Split by space but respect quotes
		const parts = this.tokenizeRdoCommand(content);
		const verbStr = parts[0];

		const packet: RdoPacket = {
			raw,
			type,
			rid,
		};

		if (verbStr === RdoVerb.IDOF) {
			packet.verb = RdoVerb.IDOF;
			// Strip quotes from targetId for internal usage
			const rawTarget = parts.slice(1).join(' ');
			packet.targetId = rawTarget.replace(/^"|"$/g, '');
		} else if (verbStr === RdoVerb.SEL) {
			packet.verb = RdoVerb.SEL;
			if (parts.length >= 3) {
				packet.targetId = parts[1];
				const actionStr = parts[2];

				if (Object.values(RdoAction).includes(actionStr as RdoAction)) {
					packet.action = actionStr as RdoAction;
					const remainder = parts.slice(3).join(' ');

					if (packet.action === RdoAction.CALL) {
						// CRITICAL FIX: Parse push commands with "*" separator
						// Format: sel ID call Method "*" Param1,Param2
						// Check for both "^" (method) and "*" (push) separators
						let sepIndex = remainder.indexOf(RDO_CONSTANTS.METHOD_SEPARATOR);
						let separator = RDO_CONSTANTS.METHOD_SEPARATOR;

						if (sepIndex === -1) {
							// Try push separator
							sepIndex = remainder.indexOf(RDO_CONSTANTS.PUSH_SEPARATOR);
							separator = RDO_CONSTANTS.PUSH_SEPARATOR;
						}

						// Also try quoted versions
						if (sepIndex === -1) {
							sepIndex = remainder.indexOf('"^"');
							separator = '^';
						}

						if (sepIndex === -1) {
							sepIndex = remainder.indexOf('"*"');
							separator = '*';
						}

						if (sepIndex !== -1) {
							packet.member = remainder.substring(0, sepIndex).trim();
							packet.separator = separator;

							// Find where the separator ends (skip quotes)
							let argsStart = sepIndex;
							if (remainder[sepIndex] === '"') {
								// Quoted separator like "*" or "^"
								argsStart = remainder.indexOf('"', sepIndex + 1) + 1;
							} else {
								// Unquoted separator
								argsStart = sepIndex + separator.length;
							}

							const argsStr = remainder.substring(argsStart).trim();

							// NEW: Parse arguments respecting quoted strings
							if (argsStr.length > 0) {
								const rawArgs = this.parseQuotedArgs(argsStr);
								packet.args = rawArgs.map(arg => this.stripTypedToken(arg));
							} else {
								packet.args = [];
							}
						} else {
							packet.member = remainder;
						}
					} else {
						// get/set
						const propParts = remainder.split(/\s+/);
						packet.member = propParts[0];
						if (packet.action === RdoAction.SET && propParts.length > 1) {
							packet.args = [propParts.slice(1).join(' ')];
						}
					}
				}
			}
		} else if (packet.payload) {
			parts.push(packet.payload);
		}

		return packet;
	}

	/**
	 * NEW: Parse comma-separated arguments respecting quoted multi-line strings
	 */
	private static parseQuotedArgs(argsStr: string): string[] {
		const args: string[] = [];
		let current = '';
		let inQuotes = false;
		
		for (let i = 0; i < argsStr.length; i++) {
			const char = argsStr[i];
			
			if (char === '"' && (i === 0 || argsStr[i - 1] !== '\\')) {
				inQuotes = !inQuotes;
				current += char;
			} else if (char === ',' && !inQuotes) {
				// End of argument
				if (current.trim().length > 0) {
					args.push(current.trim());
				}
				current = '';
			} else {
				current += char;
			}
		}
		
		// Add last argument
		if (current.trim().length > 0) {
			args.push(current.trim());
		}
		
		return args;
	}



  /**
   * Formats a structured packet back into an ASCII string with STRICT TYPING.
   */
  public static format(packet: RdoPacket): string {
    const parts: string[] = [];

    // 1. Prefix and RID
    parts.push(RDO_CONSTANTS.CMD_PREFIX_CLIENT);
    if (packet.rid !== undefined) {
      parts.push(packet.rid.toString());
    }

    // 2. Verb and Target
    if (packet.verb) {
      parts.push(packet.verb);
      // Guard: reject sel 0 (null pointer on Delphi server)
      if (packet.verb === RdoVerb.SEL && (!packet.targetId || packet.targetId === '0')) {
        throw new Error(`Invalid RDO target ID: ${packet.targetId} (sel 0 is a null pointer on the server)`);
      }
      // CRITICAL FIX: For idof, the targetId MUST be in quotes
      if (packet.verb === RdoVerb.IDOF && packet.targetId) {
        parts.push(`"${packet.targetId}"`);
      } else if (packet.targetId) {
        parts.push(packet.targetId);
      }
    }

    // 3. Action
    if (packet.action) {
      parts.push(packet.action);

      // 4. Member (Method/Property)
      if (packet.member) {
        if (packet.action === RdoAction.SET) {
          // Simplified SET format
          parts.push(`${packet.member}=${this.formatTypedToken(packet.args?.[0] || '')}`);
        } else {
          parts.push(packet.member);
        }
      }

      // 5. Separator & Args (for calls only)
      if (packet.action === RdoAction.CALL) {
        const separator = packet.separator
          ? packet.separator
          : (packet.rid !== undefined ? RDO_CONSTANTS.METHOD_SEPARATOR : RDO_CONSTANTS.PUSH_SEPARATOR);

        // CRITICAL FIX: Separator must be quoted in protocol
        // Convert ^, *, etc to "^", "*"
        const quotedSeparator = separator.startsWith('"') ? separator : `"${separator.replace(/"/g, '')}"`;
        parts.push(quotedSeparator);

        // Format arguments with proper quoting
        if (packet.args && packet.args.length > 0) {
          // CALL args: disable numeric auto-typing — callers must use RdoValue.int() explicitly.
          // Prevents numeric strings (usernames, passwords) from being mistyped as integers.
          const formattedArgs = packet.args.map(arg => this.formatTypedToken(arg, false));
          parts.push(formattedArgs.join(RDO_CONSTANTS.TOKEN_SEPARATOR));
        }
      }
    } else if (packet.payload) {
      parts.push(packet.payload);
    }

    return parts.join(' ');
  }


  /**
   * Format typed token with proper quoting per RDO spec
   * Uses RdoValue/RdoParser for consistent type handling
   */
  private static formatTypedToken(val: string, autoTypeNumeric = true): string {
    // If already fully formatted with quotes and type prefix, return as-is
    if (val.startsWith('"') && val.endsWith('"')) {
      const extracted = RdoParser.extract(val);
      if (extracted.prefix) {
        return val; // Already properly formatted
      }
    }

    // Strip any existing outer quotes for re-processing
    let cleaned = val;
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }

    // If already has type prefix but no quotes, wrap it
    const knownPrefixes = Object.values(RdoTypePrefix) as string[];
    if (knownPrefixes.includes(cleaned.charAt(0))) {
      return `"${cleaned}"`;
    }

    // Auto-type numeric values only for SET operations (property assignments).
    // CALL args default to OLEString — numeric usernames/passwords must remain
    // as "%12345" not "#12345" (Delphi Logon expects OLEString parameters).
    if (autoTypeNumeric && /^-?\d+$/.test(cleaned)) {
      return RdoValue.int(parseInt(cleaned, 10)).format();
    }

    return RdoValue.string(cleaned).format();
  }

  /**
   * Strip outer quotes and optionally type prefix from parsed tokens
   * Uses RdoParser for consistent extraction
   */
  private static stripTypedToken(token: string): string {
    const extracted = RdoParser.extract(token);
    // Return the full string with prefix (e.g., "#42", "%hello")
    // This preserves type information for downstream processing
    if (extracted.prefix) {
      return extracted.prefix + extracted.value;
    }
    return extracted.value;
  }
  
	
}
