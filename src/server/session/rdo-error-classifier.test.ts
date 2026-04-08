/**
 * Tests for RDO Error Classifier.
 * Validates error classification matches Delphi ErrorCodes.pas / Protocol.pas patterns.
 */

import {
  classifyRdoError,
  classifyAppError,
  RDO_ERR,
  ErrorRecovery,
} from './rdo-error-classifier';

describe('classifyRdoError', () => {
  it('returns NONE for no error', () => {
    const result = classifyRdoError(RDO_ERR.NO_ERROR);
    expect(result.recovery).toBe(ErrorRecovery.NONE);
    expect(result.maxRetries).toBe(0);
  });

  describe('RECOVERABLE transient errors', () => {
    it.each([
      ['QUERY_TIMED_OUT', RDO_ERR.QUERY_TIMED_OUT],
      ['SERVER_BUSY', RDO_ERR.SERVER_BUSY],
      ['QUERY_QUEUE_OVERFLOW', RDO_ERR.QUERY_QUEUE_OVERFLOW],
      ['SERVER_NOT_INITIALIZED', RDO_ERR.SERVER_NOT_INITIALIZED],
    ])('classifies %s as RECOVERABLE', (_name, code) => {
      const result = classifyRdoError(code);
      expect(result.recovery).toBe(ErrorRecovery.RECOVERABLE);
      expect(result.maxRetries).toBeGreaterThan(0);
      expect(result.connectionDegraded).toBe(false);
    });
  });

  describe('RECOVERABLE connection-degraded errors', () => {
    it.each([
      ['SEND_ERROR', RDO_ERR.SEND_ERROR],
      ['RECEIVE_ERROR', RDO_ERR.RECEIVE_ERROR],
    ])('classifies %s as RECOVERABLE + connectionDegraded', (_name, code) => {
      const result = classifyRdoError(code);
      expect(result.recovery).toBe(ErrorRecovery.RECOVERABLE);
      expect(result.connectionDegraded).toBe(true);
      expect(result.maxRetries).toBeGreaterThan(0);
    });
  });

  describe('FATAL errors', () => {
    it.each([
      ['MALFORMED_QUERY', RDO_ERR.MALFORMED_QUERY],
      ['ILLEGAL_OBJECT', RDO_ERR.ILLEGAL_OBJECT],
      ['UNEXISTENT_PROPERTY', RDO_ERR.UNEXISTENT_PROPERTY],
      ['UNEXISTENT_METHOD', RDO_ERR.UNEXISTENT_METHOD],
      ['MALFORMED_RESULT', RDO_ERR.MALFORMED_RESULT],
      ['NO_RESULT', RDO_ERR.NO_RESULT],
      ['UNKNOWN_ERROR', RDO_ERR.UNKNOWN_ERROR],
    ])('classifies %s as FATAL', (_name, code) => {
      const result = classifyRdoError(code);
      expect(result.recovery).toBe(ErrorRecovery.FATAL);
      expect(result.maxRetries).toBe(0);
    });
  });

  it('classifies unknown error codes as FATAL', () => {
    const result = classifyRdoError(999);
    expect(result.recovery).toBe(ErrorRecovery.FATAL);
  });
});

describe('classifyAppError', () => {
  it('returns NONE for NOERROR (0)', () => {
    const result = classifyAppError(0);
    expect(result.recovery).toBe(ErrorRecovery.NONE);
  });

  describe('FATAL application errors', () => {
    it.each([
      ['ModelServerIsDown', 20],
      ['RequestDenied', 27],
      ['InvalidProxy', 26],
    ])('classifies %s as FATAL', (_name, code) => {
      const result = classifyAppError(code);
      expect(result.recovery).toBe(ErrorRecovery.FATAL);
    });
  });

  describe('USER_ERROR application errors', () => {
    it.each([
      ['AreaNotClear', 3],
      ['InvalidUserName', 12],
      ['InvalidPassword', 13],
      ['AccessDenied', 15],
      ['AccountActive', 17],
      ['TooManyFacilities', 33],
      ['BuildingTooClose', 34],
    ])('classifies %s as USER_ERROR', (_name, code) => {
      const result = classifyAppError(code);
      expect(result.recovery).toBe(ErrorRecovery.USER_ERROR);
      expect(result.maxRetries).toBe(0);
    });
  });

  describe('RECOVERABLE application errors', () => {
    it.each([
      ['CannotInstantiate', 2],
      ['CannotCreateTycoon', 8],
      ['CannotSetupEvents', 16],
      ['CannotRegisterEvents', 31],
    ])('classifies %s as RECOVERABLE', (_name, code) => {
      const result = classifyAppError(code);
      expect(result.recovery).toBe(ErrorRecovery.RECOVERABLE);
      expect(result.maxRetries).toBeGreaterThan(0);
    });
  });

  it('classifies unknown app error codes as USER_ERROR', () => {
    const result = classifyAppError(9999);
    expect(result.recovery).toBe(ErrorRecovery.USER_ERROR);
  });
});
