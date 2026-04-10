/**
 * Official Starpeace Online Error Codes
 * These error codes match the server-side protocol specification.
 */

// General errors
export const NOERROR = 0;
export const ERROR_Unknown = 1;
export const ERROR_CannotInstantiate = 2;
export const ERROR_AreaNotClear = 3;
export const ERROR_UnknownClass = 4;
export const ERROR_UnknownCompany = 5;
export const ERROR_UnknownCluster = 6;
export const ERROR_UnknownTycoon = 7;
export const ERROR_CannotCreateTycoon = 8;
export const ERROR_FacilityNotFound = 9;
export const ERROR_TycoonNameNotUnique = 10;
export const ERROR_CompanyNameNotUnique = 11;
export const ERROR_InvalidUserName = 12;
export const ERROR_InvalidPassword = 13;
export const ERROR_InvalidCompanyId = 14;
export const ERROR_AccessDenied = 15;
export const ERROR_CannotSetupEvents = 16;
export const ERROR_AccountActive = 17;
export const ERROR_AccountDisabled = 18;
export const ERROR_InvalidLogonData = 19;
export const ERROR_ModelServerIsDown = 20;
export const ERROR_UnknownCircuit = 21;
export const ERROR_CannotCreateSeg = 22;
export const ERROR_CannotBreakSeg = 23;
export const ERROR_LoanNotGranted = 24;
export const ERROR_InvalidMoneyValue = 25;
export const ERROR_InvalidProxy = 26;
export const ERROR_RequestDenied = 27;
export const ERROR_ZoneMissmatch = 28;
export const ERROR_InvalidParameter = 29;
export const ERROR_InsuficientSpace = 30;
export const ERROR_CannotRegisterEvents = 31;
export const ERROR_NotEnoughRoom = 32;
export const ERROR_TooManyFacilities = 33;
export const ERROR_BuildingTooClose = 34;

// Politics errors
export const ERROR_POLITICS_NOTALLOWED = 100;
export const ERROR_POLITICS_REJECTED = 101;
export const ERROR_POLITICS_NOTIME = 102;

// Logon errors
export const ERROR_AccountAlreadyExists = 110;
export const ERROR_UnexistingAccount = 112;
export const ERROR_SerialMaxed = 113;
export const ERROR_InvalidSerial = 114;
export const ERROR_SubscriberIdNotFound = 115;


/**
 * Get human-readable error message for error code
 */
export function getErrorMessage(errorCode: number): string {
  switch (errorCode) {
    case NOERROR:
      return 'No error';
    case ERROR_Unknown:
      return 'Unknown error';
    case ERROR_CannotInstantiate:
      return 'Cannot instantiate';
    case ERROR_AreaNotClear:
      return 'Area not clear';
    case ERROR_UnknownClass:
      return 'Unknown class';
    case ERROR_UnknownCompany:
      return 'Unknown company';
    case ERROR_UnknownCluster:
      return 'Unknown cluster';
    case ERROR_UnknownTycoon:
      return 'Unknown tycoon';
    case ERROR_CannotCreateTycoon:
      return 'Cannot create tycoon';
    case ERROR_FacilityNotFound:
      return 'Facility not found';
    case ERROR_TycoonNameNotUnique:
      return 'Tycoon name already in use';
    case ERROR_CompanyNameNotUnique:
      return 'Company name already in use';
    case ERROR_InvalidUserName:
      return 'Invalid username';
    case ERROR_InvalidPassword:
      return 'Invalid password';
    case ERROR_InvalidCompanyId:
      return 'Invalid company ID';
    case ERROR_AccessDenied:
      return 'Access denied';
    case ERROR_CannotSetupEvents:
      return 'Cannot setup events';
    case ERROR_AccountActive:
      return 'Account already active';
    case ERROR_AccountDisabled:
      return 'Account disabled';
    case ERROR_InvalidLogonData:
      return 'Invalid logon data';
    case ERROR_ModelServerIsDown:
      return 'Model server is down';
    case ERROR_UnknownCircuit:
      return 'Unknown circuit';
    case ERROR_CannotCreateSeg:
      return 'Cannot create segment';
    case ERROR_CannotBreakSeg:
      return 'Cannot break segment';
    case ERROR_LoanNotGranted:
      return 'Loan not granted';
    case ERROR_InvalidMoneyValue:
      return 'Invalid money value';
    case ERROR_InvalidProxy:
      return 'Invalid proxy';
    case ERROR_RequestDenied:
      return 'Request denied';
    case ERROR_ZoneMissmatch:
      return 'Zone mismatch';
    case ERROR_InsuficientSpace:
      return 'Insufficient space';
    case ERROR_CannotRegisterEvents:
      return 'Cannot register events';
    case ERROR_NotEnoughRoom:
      return 'Not enough room';
    case ERROR_TooManyFacilities:
      return 'Too many facilities';
    case ERROR_BuildingTooClose:
      return 'Building too close';
    case ERROR_POLITICS_NOTALLOWED:
      return 'Political action not allowed';
    case ERROR_POLITICS_REJECTED:
      return 'Political action rejected';
    case ERROR_POLITICS_NOTIME:
      return 'Not the right time for this political action';
    case ERROR_AccountAlreadyExists:
      return 'Account already exists';
    case ERROR_UnexistingAccount:
      return 'Account does not exist';
    case ERROR_SerialMaxed:
      return 'Serial number maxed out';
    case ERROR_InvalidSerial:
      return 'Invalid serial number';
    case ERROR_SubscriberIdNotFound:
      return 'Subscriber ID not found';
    default:
      return `Error ${errorCode}`;
  }
}

