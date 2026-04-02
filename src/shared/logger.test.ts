/**
 * Tests for the enhanced Logger — child(), setField(), JSON mode.
 */

// Mock config before importing logger
jest.mock('./config', () => ({
  config: {
    logging: {
      level: 'debug',
      colorize: false,
      jsonMode: false,
      filePath: '',
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    },
  },
}));

// Mock log-transport to avoid file system access
jest.mock('./log-transport', () => ({
  FileTransport: jest.fn(),
}));

import { Logger, createLogger } from './logger';

describe('Logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createLogger', () => {
    it('creates a logger with given context', () => {
      const log = createLogger('TestCtx');
      log.info('hello');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[TestCtx]');
      expect(output).toContain('hello');
    });
  });

  describe('child()', () => {
    it('creates a child logger that inherits parent fields', () => {
      const parent = createLogger('Session');
      const child = parent.child({ player: 'Alice' });
      child.info('logged in');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('player=Alice');
      expect(output).toContain('logged in');
    });

    it('merges fields from multiple child() calls', () => {
      const log = createLogger('Session')
        .child({ player: 'Bob' })
        .child({ tycoonId: 'T42' });
      log.info('test');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('player=Bob');
      expect(output).toContain('tycoonId=T42');
    });

    it('does not mutate the parent logger', () => {
      const parent = createLogger('Session');
      parent.child({ player: 'Alice' });
      parent.info('parent log');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('player=');
    });
  });

  describe('setField()', () => {
    it('adds a field that appears in subsequent logs', () => {
      const log = createLogger('Session');
      log.setField('corrId', 'ws-123');
      log.info('request');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('corrId=ws-123');
    });

    it('removes a field when set to null', () => {
      const log = createLogger('Session');
      log.setField('corrId', 'ws-123');
      log.setField('corrId', null);
      log.info('request');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).not.toContain('corrId');
    });
  });

  describe('log levels', () => {
    it('logs debug messages at debug level', () => {
      const log = createLogger('Test');
      log.debug('debug msg');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect((consoleSpy.mock.calls[0][0] as string)).toContain('DEBUG');
    });

    it('logs info messages', () => {
      const log = createLogger('Test');
      log.info('info msg');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      expect((consoleSpy.mock.calls[0][0] as string)).toContain('INFO');
    });

    it('logs warn messages to console.warn', () => {
      const warnSpy = jest.spyOn(console, 'warn');
      const log = createLogger('Test');
      log.warn('warning');
      expect(warnSpy).toHaveBeenCalled();
    });

    it('logs error messages to console.error', () => {
      const errorSpy = jest.spyOn(console, 'error');
      const log = createLogger('Test');
      log.error('failure');
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('metadata', () => {
    it('serializes object metadata as JSON', () => {
      const log = createLogger('Test');
      log.info('msg', { key: 'value' });
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('"key":"value"');
    });

    it('serializes Error metadata with message and stack', () => {
      const log = createLogger('Test');
      const err = new Error('boom');
      log.error('failed', err);
      const output = (console.error as jest.Mock).mock.calls[0][0] as string;
      expect(output).toContain('boom');
    });
  });
});

describe('Logger JSON mode', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Enable JSON mode via config mock
    const { config } = require('./config');
    config.logging.jsonMode = true;
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    const { config } = require('./config');
    config.logging.jsonMode = false;
    jest.restoreAllMocks();
  });

  it('outputs valid NDJSON when jsonMode is enabled', () => {
    const log = new Logger('Session', { player: 'Alice' });
    log.info('test message');
    const output = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({
      level: 'INFO',
      ctx: 'Session',
      msg: 'test message',
      player: 'Alice',
    });
    expect(parsed.ts).toBeDefined();
  });

  it('includes metadata in JSON output', () => {
    const log = new Logger('Session');
    log.info('msg', { rid: 42 });
    const parsed = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(parsed.meta).toEqual({ rid: 42 });
  });

  it('serializes Error metadata correctly in JSON', () => {
    const log = new Logger('Session');
    const err = new Error('test error');
    log.error('failed', err);
    const errorSpy = jest.spyOn(console, 'error');
    // Error goes to console.error in JSON mode too
    log.error('failed2', err);
    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(parsed.meta.error).toBe('test error');
    expect(parsed.meta.stack).toBeDefined();
  });
});
