/**
 * TypeScript type declarations for RDO matchers
 */

import type { StrictValidatorConfig } from '../../../mock-server/rdo-strict-validator';

declare global {
  namespace jest {
    interface Matchers<R> {
      toContainRdoCommand(method: string, args?: string[]): R;
      toMatchRdoFormat(): R;
      toMatchRdoCallFormat(method: string): R;
      toMatchRdoSetFormat(property: string): R;
      toHaveRdoTypePrefix(prefix: string): R;
      toMatchRdoResponse(requestId?: number): R;
      toPassStrictRdoValidation(config?: Partial<StrictValidatorConfig>): R;
    }
  }
}

export {};
