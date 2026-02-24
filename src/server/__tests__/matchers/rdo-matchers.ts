/**
 * Custom Jest Matchers for RDO Protocol Testing
 * Provides specialized assertions for validating RDO commands and responses
 *
 * Type declarations are in rdo-matchers.d.ts
 */

import { RdoStrictValidator } from '../../../mock-server/rdo-strict-validator';
import { RdoProtocol } from '../../../server/rdo';
import type { RdoScenario } from '../../../mock-server/types/rdo-exchange-types';
import type { StrictValidatorConfig } from '../../../mock-server/rdo-strict-validator';

export const rdoMatchers = {
  /**
   * Checks if a command array contains an RDO call to the specified method
   * Optionally validates argument presence
   */
  toContainRdoCommand(
    commands: string[],
    method: string,
    args?: string[]
  ) {
    const pattern = new RegExp(`call ${method}`);
    const found = commands.find(cmd => pattern.test(cmd));

    if (!found) {
      return {
        pass: false,
        message: () => `Expected commands to contain RDO call to ${method}\n` +
          `Commands received:\n${commands.map(c => `  - ${c}`).join('\n')}`
      };
    }

    if (args) {
      const hasArgs = args.every(arg => found.includes(arg));
      return {
        pass: hasArgs,
        message: () => hasArgs
          ? `Found RDO command '${method}' with correct arguments`
          : `RDO command '${method}' missing expected arguments: ${args.join(', ')}\n` +
            `Actual command: ${found}`
      };
    }

    return {
      pass: true,
      message: () => `Found RDO command '${method}'`
    };
  },

  /**
   * Validates general RDO command format
   * Format: C [RID] sel <id> call <method> <type> [args];
   * or: C [RID] sel <id> set <property> =<value>;
   * Note: RdoCommand builder produces space before = in SET commands
   * Note: Accepts optional space before semicolon (both formats are valid)
   */
  toMatchRdoFormat(command: string) {
    // Matches both CALL and SET commands
    // Call pattern: may or may not have space before semicolon depending on args
    const callPattern = /^C( \d+)? sel \d+ call \w+ "[*^]"( ?".+")*( ?);$/;
    // Set pattern: space before = (RdoCommand builder joins parts with space)
    const setPattern = /^C( \d+)? sel \d+ set \w+ ?="[#$^!@%*].*";$/;
    const pass = callPattern.test(command) || setPattern.test(command);

    return {
      pass,
      message: () => pass
        ? `Command matches RDO format`
        : `Command does not match RDO format:\n  ${command}\n` +
          `Expected format:\n` +
          `  C [RID] sel <id> call <method> <type> [args];\n` +
          `  or: C [RID] sel <id> set <property>=<value>;`
    };
  },

  /**
   * Validates RDO CALL command format for specific method
   * Note: Accepts optional space before semicolon (both formats are valid)
   */
  toMatchRdoCallFormat(command: string, method: string) {
    const pattern = new RegExp(`^C( \\d+)? sel \\d+ call ${method} "[*^]"( ?".+")*( ?);$`);
    const pass = pattern.test(command);

    return {
      pass,
      message: () => pass
        ? `Command matches RDO CALL format for '${method}'`
        : `Command does not match RDO CALL format for '${method}':\n  ${command}\n` +
          `Expected format: C [RID] sel <id> call ${method} <type> [args];`
    };
  },

  /**
   * Validates RDO SET command format for specific property
   * Note: RdoCommand builder produces space before = in SET commands
   */
  toMatchRdoSetFormat(command: string, property: string) {
    const pattern = new RegExp(`^C( \\d+)? sel \\d+ set ${property} ?="[#$^!@%*].*";$`);
    const pass = pattern.test(command);

    return {
      pass,
      message: () => pass
        ? `Command matches RDO SET format for '${property}'`
        : `Command does not match RDO SET format for '${property}':\n  ${command}\n` +
          `Expected format: C [RID] sel <id> set ${property}=<typed-value>;`
    };
  },

  /**
   * Checks if a typed value has the expected RDO type prefix
   */
  toHaveRdoTypePrefix(value: string, expectedPrefix: string) {
    const prefix = value.charAt(0);
    const pass = prefix === expectedPrefix;

    return {
      pass,
      message: () => pass
        ? `Value '${value}' has expected RDO type prefix '${expectedPrefix}'`
        : `Expected value to have RDO type prefix '${expectedPrefix}', but got '${prefix}':\n  ${value}\n` +
          `Valid prefixes: # (int), $ (string), % (olestring), ! (float), @ (double), ^ (variant), * (void)`
    };
  },

  /**
   * Validates RDO response format
   * Format: A<RID> res=<values>; or A<RID> res; (empty response)
   */
  toMatchRdoResponse(response: string, requestId?: number) {
    const pattern = requestId !== undefined
      ? new RegExp(`^A${requestId} res(=".+")?;$`)
      : /^A\d+ res(=".+")?;$/;

    const pass = pattern.test(response);

    return {
      pass,
      message: () => pass
        ? requestId !== undefined
          ? `Response matches RDO format for request ID ${requestId}`
          : `Response matches RDO format`
        : `Response does not match RDO format:\n  ${response}\n` +
          `Expected format: A<RID> res=<values>; or A<RID> res;`
    };
  },

  /**
   * Validates that a scenario's own request strings pass strict RDO validation.
   * Creates a validator, loads the scenario, parses each exchange.request through
   * RdoProtocol.parse(), and validates against the exchange's matchKeys.
   *
   * This catches matchKey/request inconsistencies (e.g., matchKeys say 'get' but
   * the request string says 'call').
   */
  toPassStrictRdoValidation(
    scenario: RdoScenario,
    config?: Partial<StrictValidatorConfig>
  ) {
    const validator = new RdoStrictValidator(config);
    validator.addScenario(scenario);

    for (const exchange of scenario.exchanges) {
      if (exchange.pushOnly || !exchange.request) continue;
      const parsed = RdoProtocol.parse(exchange.request);
      validator.validate(parsed, exchange.request);
    }

    const errors = validator.getErrors();
    const pass = errors.length === 0;

    return {
      pass,
      message: () => pass
        ? `Scenario '${scenario.name}' passes strict RDO validation`
        : `Scenario '${scenario.name}' has ${errors.length} strict validation error(s):\n` +
          validator.formatReport()
    };
  }
};

/**
 * Helper function to extract RDO command components for debugging
 */
export function parseRdoCommand(command: string) {
  const match = command.match(/^C( (\d+))? sel (\d+) (call|set|get) (\w+)/);

  if (!match) {
    return null;
  }

  return {
    requestId: match[2] ? parseInt(match[2], 10) : undefined,
    targetId: parseInt(match[3], 10),
    verb: match[4] as 'call' | 'set' | 'get',
    member: match[5]
  };
}

/**
 * Helper function to extract arguments from RDO CALL command
 */
export function extractRdoArgs(command: string): string[] {
  // Match everything between the type marker and the semicolon
  const match = command.match(/"[*^]"(.+);$/);

  if (!match || !match[1].trim()) {
    return [];
  }

  // Split by comma, preserving quoted values
  const argsStr = match[1].trim();
  const args: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ',' && !inQuotes) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

/**
 * Helper function to count RDO commands by method
 */
export function countRdoCommands(commands: string[], method: string): number {
  const pattern = new RegExp(`call ${method}`);
  return commands.filter(cmd => pattern.test(cmd)).length;
}
