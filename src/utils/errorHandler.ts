/**
 * Error handling utility for consistent error management across the application
 */

import { createLogger } from './logger';

const logger = createLogger('errorHandler');

/**
 * Custom error class for workflow-related errors
 */
export class WorkflowError extends Error {
  cause?: Error;
  
  constructor(message: string, options?: { cause?: Error }) {
    super(message);
    this.name = 'WorkflowError';
    this.cause = options?.cause;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WorkflowError);
    }
  }
}

/**
 * Custom error class for API-related errors
 */
export class ApiError extends Error {
  statusCode: number;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }
}

/**
 * Handle API errors and return appropriate response
 */
export function handleApiError(error: unknown): { status: number; body: { error: string } } {
  // Convert unknown error to a typed error
  const err = error instanceof Error ? error : new Error(String(error));
  
  // Log the error
  logger.error('API error:', err);
  
  // Determine status code
  let statusCode = 500;
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
  } else if (err.message.includes('not found') || err.message.includes('does not exist')) {
    statusCode = 404;
  } else if (err.message.includes('invalid') || err.message.includes('missing') || err.message.includes('required')) {
    statusCode = 400;
  }
  
  return {
    status: statusCode,
    body: { error: err.message }
  };
}

/**
 * Set up global error handlers for uncaught exceptions and unhandled rejections
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    
    // Give time for logs to be written before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled promise rejection', err);
  });
  
  logger.info('Global error handlers set up');
}
