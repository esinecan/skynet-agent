/**
 * Centralized logging utility for consistent log formatting and management
 */

import * as Sentry from "@sentry/node";
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
  const correlationId = Sentry.getCurrentScope()?.getPropagationContext()?.traceId || 'N/A';
  
  // Format the log message - switched to JSON structured logging
  const logEntry: Record<string, any> = {
    timestamp,
    level: levelName,
    module,
    message,
    correlationId,
  };
  
  // Add context if provided
  if (context) {
    if (context instanceof Error) {
      logEntry.error_message = context.message;
      logEntry.error_stack = context.stack;
      logEntry.error_name = context.name;
    } else {
      logEntry.context_data = context;
    }
  }

  const logString = JSON.stringify(logEntry);

  // Legacy format for backwards compatibility
  let legacyLogString = `[${timestamp}] [${levelName}] [${module}] ${message}`;
  
  // Add context if provided
  if (context) {
    try {
      if (context instanceof Error) {
        legacyLogString += `\nError: ${context.message}`;
        if (context.stack) {
          legacyLogString += `\nStack: ${context.stack}`;
        }
      } else {
        legacyLogString += `\nContext: ${util.inspect(context, { depth: 4 })}`;
      }
    } catch (e) {
      // Fix: Handle unknown error type properly
      const errorMessage = e instanceof Error ? e.message : String(e);
      legacyLogString += `\nContext: [Error serializing context: ${errorMessage}]`;
    }
  }

  // Sentry breadcrumbs and error capturing
  if (level === LogLevel.ERROR && context instanceof Error) {
    Sentry.captureException(context, (scope) => {
      scope.setTag('module', module);
      scope.setExtra('log_message', message);
      if (!(context instanceof Error) && typeof context === 'object' && context !== null) {
        scope.setExtras(context as Record<string, any>);
      }
      return scope;
    });  } else {
    const sentryLevel = levelName.toLowerCase() as Sentry.SeverityLevel;
    Sentry.addBreadcrumb({ category: 'log', message: `[${module}] ${message}`, level: sentryLevel, data: typeof context === 'object' ? context : { detail: context } });
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
    fs.appendFileSync(LOG_FILE_PATH, legacyLogString + '\n');
  }
}
