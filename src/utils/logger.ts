/**
 * Centralized logging utility for consistent log formatting and management
 */

import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Configuration
const LOG_LEVEL = process.env.LOG_LEVEL ? 
  (LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel] || LogLevel.INFO) : 
  LogLevel.INFO;

const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE !== 'false';
const LOG_TO_FILE = process.env.LOG_TO_FILE === 'true';
const LOG_FILE_PATH = process.env.LOG_FILE_PATH || path.join(process.cwd(), 'logs', 'skynet-agent.log');

// Ensure log directory exists if logging to file
if (LOG_TO_FILE) {
  const logDir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// Logger factory
export function createLogger(module: string) {
  return {
    debug: (message: string, context?: Error | Record<string, any>) => {
      if (LOG_LEVEL <= LogLevel.DEBUG) {
        log(LogLevel.DEBUG, module, message, context);
      }
    },
    info: (message: string, context?: Error | Record<string, any>) => {
      if (LOG_LEVEL <= LogLevel.INFO) {
        log(LogLevel.INFO, module, message, context);
      }
    },
    warn: (message: string, context?: Error | Record<string, any>) => {
      if (LOG_LEVEL <= LogLevel.WARN) {
        log(LogLevel.WARN, module, message, context);
      }
    },
    error: (message: string, context?: Error | Record<string, any>) => {
      if (LOG_LEVEL <= LogLevel.ERROR) {
        log(LogLevel.ERROR, module, message, context);
      }
    }
  };
}

// Internal log function
function log(level: LogLevel, module: string, message: string, context?: Error | Record<string, any>) {
  const timestamp = new Date().toISOString();
  const levelName = LogLevel[level];
  
  // Format the log message
  let logString = `[${timestamp}] [${levelName}] [${module}] ${message}`;
  
  // Add context if provided
  if (context) {
    try {
      if (context instanceof Error) {
        logString += `\nError: ${context.message}`;
        if (context.stack) {
          logString += `\nStack: ${context.stack}`;
        }
      } else {
        logString += `\nContext: ${util.inspect(context, { depth: 4 })}`;
      }
    } catch (e) {
      // Fix: Handle unknown error type properly
      const errorMessage = e instanceof Error ? e.message : String(e);
      logString += `\nContext: [Error serializing context: ${errorMessage}]`;
    }
  }
  
  // Output to console if enabled
  if (LOG_TO_CONSOLE) {
    const consoleMethod = level === LogLevel.ERROR ? console.error :
                         level === LogLevel.WARN ? console.warn :
                         level === LogLevel.INFO ? console.info :
                         console.debug;
    consoleMethod(logString);
  }
  
  // Write to file if enabled
  if (LOG_TO_FILE) {
    fs.appendFileSync(LOG_FILE_PATH, logString + '\n');
  }
}
