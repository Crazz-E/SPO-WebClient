/**
 * Structured logging system for SPO v2
 *
 * Supports structured fields (player, correlationId), NDJSON output mode,
 * and file transport with rotation. Backward-compatible with existing callers.
 */

import { config } from './config';
import { FileTransport } from './log-transport';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[36m', // Cyan
  [LogLevel.INFO]: '\x1b[32m',  // Green
  [LogLevel.WARN]: '\x1b[33m',  // Yellow
  [LogLevel.ERROR]: '\x1b[31m', // Red
};

const RESET_COLOR = '\x1b[0m';

function parseLogLevel(level: string): LogLevel {
  switch (level.toLowerCase()) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    default: return LogLevel.INFO;
  }
}

const currentLogLevel = parseLogLevel(config.logging.level);

// Module-level file transport singleton (server-only, created once)
let fileTransport: FileTransport | null = null;
if (config.logging.filePath && typeof window === 'undefined') {
  fileTransport = new FileTransport({
    filePath: config.logging.filePath,
    maxFileSize: config.logging.maxFileSize,
    maxFiles: config.logging.maxFiles,
  });
}

/** Structured fields attached to every log line from this logger instance. */
export type LogFields = Record<string, string>;

export class Logger {
  private fields: LogFields;

  constructor(private context: string, fields?: LogFields) {
    this.fields = fields ? { ...fields } : {};
  }

  /** Create a child logger that inherits this logger's fields plus extras. */
  child(extraFields: LogFields): Logger {
    return new Logger(this.context, { ...this.fields, ...extraFields });
  }

  /** Set or clear a mutable field (e.g. correlationId that changes per-request). */
  setField(key: string, value: string | null): void {
    if (value === null) {
      delete this.fields[key];
    } else {
      this.fields[key] = value;
    }
  }

  debug(message: string, meta?: unknown) {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: unknown) {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: unknown) {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, meta?: unknown) {
    this.log(LogLevel.ERROR, message, meta);
  }

  private log(level: LogLevel, message: string, meta?: unknown) {
    if (level < currentLogLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];

    // --- NDJSON line (always built for file transport, and for console in JSON mode) ---
    const jsonEntry: Record<string, unknown> = {
      ts: timestamp,
      level: levelName,
      ctx: this.context,
      msg: message,
      ...this.fields,
    };

    if (meta !== undefined) {
      jsonEntry.meta = meta instanceof Error
        ? { error: meta.message, stack: meta.stack }
        : meta;
    }

    // Write to file transport (always NDJSON regardless of console mode)
    if (fileTransport) {
      fileTransport.write(JSON.stringify(jsonEntry));
    }

    // --- Console output ---
    if (config.logging.jsonMode) {
      // JSON mode: emit NDJSON to console too
      const jsonLine = JSON.stringify(jsonEntry);
      this.consoleWrite(level, jsonLine);
    } else {
      // Human-readable mode (existing behavior)
      const contextStr = this.context ? `[${this.context}]` : '';
      const fieldsStr = Object.keys(this.fields).length > 0
        ? ` {${Object.entries(this.fields).map(([k, v]) => `${k}=${v}`).join(', ')}}`
        : '';

      let logMessage: string;
      if (config.logging.colorize) {
        const color = LOG_LEVEL_COLORS[level];
        logMessage = `${color}${timestamp} ${levelName.padEnd(5)}${RESET_COLOR} ${contextStr}${fieldsStr} ${message}`;
      } else {
        logMessage = `${timestamp} ${levelName.padEnd(5)} ${contextStr}${fieldsStr} ${message}`;
      }

      if (meta !== undefined) {
        logMessage += ` ${meta instanceof Error ? (meta.stack ?? meta.message) : JSON.stringify(meta)}`;
      }

      this.consoleWrite(level, logMessage);
    }
  }

  private consoleWrite(level: LogLevel, message: string): void {
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.ERROR:
        console.error(message);
        break;
    }
  }
}

/** Access the module-level file transport (for the debug-log endpoint). */
export function getFileTransport(): FileTransport | null {
  return fileTransport;
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}
