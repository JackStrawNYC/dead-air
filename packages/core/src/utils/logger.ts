import type { DeadAirConfig } from '../types/index.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LEVELS;

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function format(
  level: LogLevel,
  tag: string,
  message: string,
  data?: unknown,
): string {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}] [${tag}]`;
  if (data !== undefined) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

export function createLogger(tag: string) {
  return {
    debug: (msg: string, data?: unknown) => {
      if (shouldLog('debug')) console.debug(format('debug', tag, msg, data));
    },
    info: (msg: string, data?: unknown) => {
      if (shouldLog('info')) console.info(format('info', tag, msg, data));
    },
    warn: (msg: string, data?: unknown) => {
      if (shouldLog('warn')) console.warn(format('warn', tag, msg, data));
    },
    error: (msg: string, data?: unknown) => {
      if (shouldLog('error')) console.error(format('error', tag, msg, data));
    },
  };
}

export function initLogger(config: DeadAirConfig): void {
  setLogLevel(config.logLevel);
}
