/**
 * `Logger.always()` — the LOG_LEVEL bypass, tested in its own file.
 *
 * The threshold (`currentLogLevel`) is captured when `logger.ts` is first evaluated, so a
 * raised level cannot be simulated inside `logger.test.ts` without resetting the module
 * registry underneath the tests that already live there. This file simply mocks the config
 * at `error` — the strictest level the security policy allows in production — and checks
 * that the boot record still gets written while an ordinary `info` line does not.
 */

jest.mock('./config', () => ({
  config: {
    logging: {
      level: 'error',
      colorize: false,
      jsonMode: false,
      filePath: '',
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    },
  },
}));

jest.mock('./log-transport', () => ({
  FileTransport: jest.fn(),
}));

import { createLogger, LogLevel } from './logger';

describe('Logger.always() at LOG_LEVEL=error', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('filters an ordinary info line, as it should', () => {
    createLogger('Test').info('ordinary chatter');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('writes an INFO line that asked to always be written', () => {
    createLogger('Test').always(LogLevel.INFO, 'the SEC-R-2 boot record');
    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('INFO');
    expect(line).toContain('the SEC-R-2 boot record');
  });

  it('keeps the severity it is given, so a warning still routes to console.warn', () => {
    createLogger('Test').always(LogLevel.WARN, 'TRUST_PROXY is not set');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0] as string).toContain('WARN');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('carries metadata through, like the plain methods', () => {
    createLogger('Test').always(LogLevel.ERROR, 'refused', { reason: 'LOG_LEVEL=debug' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0] as string).toContain('LOG_LEVEL=debug');
  });
});
