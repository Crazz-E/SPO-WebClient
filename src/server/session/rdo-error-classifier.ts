/**
 * RDO Error Classifier — Categorizes RDO errors for recovery decisions.
 *
 * Mirrors Delphi InterfaceServer.pas error classification:
 *   RECOVERABLE → auto-retry with backoff
 *   FATAL       → no retry, notify user immediately
 *   USER_ERROR  → no retry, user-facing message
 *   NONE        → no error (success)
 *
 * Delphi source reference:
 *   ErrorCodes.pas — 18 RDO-layer error codes (errNoError..errServerBusy)
 *   Protocol.pas   — Application-level error codes (ERROR_Unknown..ERROR_BuildingTooClose)
 *   ServerCnxHandler.pas — errCannotConnect/errRequestDenied classification
 */

/** RDO-layer error codes from ErrorCodes.pas */
export const RDO_ERR = {
  NO_ERROR: 0,
  MALFORMED_QUERY: 1,
  ILLEGAL_OBJECT: 2,
  UNEXISTENT_PROPERTY: 3,
  ILLEGAL_PROP_VALUE: 4,
  UNEXISTENT_METHOD: 5,
  ILLEGAL_PARAM_LIST: 6,
  ILLEGAL_PROP_TYPE: 7,
  QUERY_TIMED_OUT: 8,
  ILLEGAL_FUNCTION_RES: 9,
  SEND_ERROR: 10,
  RECEIVE_ERROR: 11,
  MALFORMED_RESULT: 12,
  QUERY_QUEUE_OVERFLOW: 13,
  SERVER_NOT_INITIALIZED: 14,
  UNKNOWN_ERROR: 15,
  NO_RESULT: 16,
  SERVER_BUSY: 17,
} as const;

export enum ErrorRecovery {
  /** No error — request succeeded */
  NONE = 'NONE',
  /** Transient failure — safe to auto-retry (timeout, busy, send/receive error) */
  RECOVERABLE = 'RECOVERABLE',
  /** Permanent failure — do not retry (server down, request denied) */
  FATAL = 'FATAL',
  /** User input error — show message, do not retry */
  USER_ERROR = 'USER_ERROR',
}

export interface ClassifiedError {
  recovery: ErrorRecovery;
  /** Whether this error suggests the connection itself is degraded */
  connectionDegraded: boolean;
  /** Recommended retry count (0 = no retry) */
  maxRetries: number;
  /** Base delay between retries in ms */
  retryBaseDelayMs: number;
}

const RECOVERABLE_CONNECTION: ClassifiedError = {
  recovery: ErrorRecovery.RECOVERABLE,
  connectionDegraded: true,
  maxRetries: 2,
  retryBaseDelayMs: 1000,
};

const RECOVERABLE_TRANSIENT: ClassifiedError = {
  recovery: ErrorRecovery.RECOVERABLE,
  connectionDegraded: false,
  maxRetries: 2,
  retryBaseDelayMs: 500,
};

const FATAL_RESULT: ClassifiedError = {
  recovery: ErrorRecovery.FATAL,
  connectionDegraded: false,
  maxRetries: 0,
  retryBaseDelayMs: 0,
};

const USER_ERROR_RESULT: ClassifiedError = {
  recovery: ErrorRecovery.USER_ERROR,
  connectionDegraded: false,
  maxRetries: 0,
  retryBaseDelayMs: 0,
};

const NO_ERROR_RESULT: ClassifiedError = {
  recovery: ErrorRecovery.NONE,
  connectionDegraded: false,
  maxRetries: 0,
  retryBaseDelayMs: 0,
};

/**
 * Classify an RDO-layer error code (from ErrorCodes.pas — codes 0-17).
 * These are returned in the RDO protocol as "error <code>".
 */
export function classifyRdoError(errorCode: number): ClassifiedError {
  switch (errorCode) {
    case RDO_ERR.NO_ERROR:
      return NO_ERROR_RESULT;

    // Transient — auto-retry
    case RDO_ERR.QUERY_TIMED_OUT:
    case RDO_ERR.SERVER_BUSY:
    case RDO_ERR.QUERY_QUEUE_OVERFLOW:
      return RECOVERABLE_TRANSIENT;

    // Connection-level — retry + flag degraded
    case RDO_ERR.SEND_ERROR:
    case RDO_ERR.RECEIVE_ERROR:
      return RECOVERABLE_CONNECTION;

    // Server not ready — retry (may come up soon)
    case RDO_ERR.SERVER_NOT_INITIALIZED:
      return RECOVERABLE_TRANSIENT;

    // Protocol / coding errors — fatal, no retry
    case RDO_ERR.MALFORMED_QUERY:
    case RDO_ERR.ILLEGAL_OBJECT:
    case RDO_ERR.UNEXISTENT_PROPERTY:
    case RDO_ERR.ILLEGAL_PROP_VALUE:
    case RDO_ERR.UNEXISTENT_METHOD:
    case RDO_ERR.ILLEGAL_PARAM_LIST:
    case RDO_ERR.ILLEGAL_PROP_TYPE:
    case RDO_ERR.ILLEGAL_FUNCTION_RES:
    case RDO_ERR.MALFORMED_RESULT:
    case RDO_ERR.NO_RESULT:
    case RDO_ERR.UNKNOWN_ERROR:
      return FATAL_RESULT;

    default:
      return FATAL_RESULT;
  }
}

/**
 * Classify an application-level error code (from Protocol.pas / error-codes.ts).
 * These are higher-level business errors returned in RDO response payloads.
 */
export function classifyAppError(errorCode: number): ClassifiedError {
  // Import codes by value to avoid circular dependency
  switch (errorCode) {
    case 0: // NOERROR
      return NO_ERROR_RESULT;

    // Fatal server-side errors — no point retrying
    case 20: // ERROR_ModelServerIsDown
    case 27: // ERROR_RequestDenied
    case 26: // ERROR_InvalidProxy
      return FATAL_RESULT;

    // User input / business logic errors — show message, no retry
    case 3:  // ERROR_AreaNotClear
    case 4:  // ERROR_UnknownClass
    case 5:  // ERROR_UnknownCompany
    case 7:  // ERROR_UnknownTycoon
    case 9:  // ERROR_FacilityNotFound
    case 10: // ERROR_TycoonNameNotUnique
    case 11: // ERROR_CompanyNameNotUnique
    case 12: // ERROR_InvalidUserName
    case 13: // ERROR_InvalidPassword
    case 14: // ERROR_InvalidCompanyId
    case 15: // ERROR_AccessDenied
    case 17: // ERROR_AccountActive
    case 18: // ERROR_AccountDisabled
    case 19: // ERROR_InvalidLogonData
    case 24: // ERROR_LoanNotGranted
    case 25: // ERROR_InvalidMoneyValue
    case 28: // ERROR_ZoneMissmatch
    case 29: // ERROR_InvalidParameter
    case 30: // ERROR_InsuficientSpace
    case 32: // ERROR_NotEnoughRoom
    case 33: // ERROR_TooManyFacilities
    case 34: // ERROR_BuildingTooClose
    case 100: // ERROR_POLITICS_NOTALLOWED
    case 101: // ERROR_POLITICS_REJECTED
    case 102: // ERROR_POLITICS_NOTIME
    case 110: // ERROR_AccountAlreadyExists
    case 112: // ERROR_UnexistingAccount
    case 113: // ERROR_SerialMaxed
    case 114: // ERROR_InvalidSerial
    case 115: // ERROR_SubscriberIdNotFound
      return USER_ERROR_RESULT;

    // Transient / infrastructure — may recover on retry
    case 2:  // ERROR_CannotInstantiate
    case 8:  // ERROR_CannotCreateTycoon
    case 16: // ERROR_CannotSetupEvents
    case 31: // ERROR_CannotRegisterEvents
      return RECOVERABLE_TRANSIENT;

    default:
      // Unknown application error — treat as user error (don't silently retry)
      return USER_ERROR_RESULT;
  }
}
