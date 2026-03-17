/**
 * Système de logging structuré pour SPO v2
 *
 * Permet de filtrer par niveau et d'ajouter du contexte à chaque log.
 * Simple mais extensible (possibilité d'ajouter des transports later).
 */

import { config } from './config';

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

/**
 * Parse le niveau de log depuis la config
 */
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

/**
 * Logger avec contexte
 */
export class Logger {
  constructor(private context: string) {}

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
    // Filter by configured level
    if (level < currentLogLevel) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LOG_LEVEL_NAMES[level];
    const contextStr = this.context ? `[${this.context}]` : '';

    let logMessage: string;

    if (config.logging.colorize) {
      const color = LOG_LEVEL_COLORS[level];
      logMessage = `${color}${timestamp} ${levelName.padEnd(5)}${RESET_COLOR} ${contextStr} ${message}`;
    } else {
      logMessage = `${timestamp} ${levelName.padEnd(5)} ${contextStr} ${message}`;
    }

    // Add metadata if present
    if (meta !== undefined) {
      logMessage += ` ${meta instanceof Error ? (meta.stack ?? meta.message) : JSON.stringify(meta)}`;
    }

    // Output to console (possibility to add other transports)
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        break;
    }
  }
}

/**
 * Helper pour créer un logger avec contexte
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
