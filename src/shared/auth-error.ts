/**
 * Structured error for RDO authentication failures.
 * Carries the numeric error code from RDOLogonUser for proper error display.
 */
export class AuthError extends Error {
  constructor(public readonly authCode: number) {
    super(`Authentication failed (Code: ${authCode})`);
    this.name = 'AuthError';
  }
}
