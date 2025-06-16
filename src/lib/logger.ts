/**
 * Development-only logging utility
 * Provides consistent logging that only outputs in development mode
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  prefix?: string;
  enabled?: boolean;
}

class Logger {
  private prefix: string;
  private enabled: boolean;

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || '';
    this.enabled = options.enabled !== undefined 
      ? options.enabled 
      : process.env.NODE_ENV === 'development';
  }

  private log(level: LogLevel, ...args: any[]) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const prefixStr = this.prefix ? `[${this.prefix}]` : '';
    
    const logFn = level === 'error' ? console.error : 
                  level === 'warn' ? console.warn : 
                  console.log;

    logFn(`[${timestamp}] ${prefixStr}`, ...args);
  }

  debug(...args: any[]) {
    //this.log('debug', ...args);
  }

  info(...args: any[]) {
    //this.log('info', ...args);
  }

  warn(...args: any[]) {
    this.log('warn', ...args);
  }

  error(...args: any[]) {
    this.log('error', ...args);
  }

  // Create a child logger with a new prefix
  child(prefix: string): Logger {
    return new Logger({
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      enabled: this.enabled
    });
  }
}

// Export factory function
export function createLogger(prefix?: string): Logger {
  return new Logger({ prefix });
}

// Export default logger instance
export const logger = new Logger();
