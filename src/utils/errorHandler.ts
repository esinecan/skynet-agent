/**
 * Error handling utility for consistent error management across the application
 */

import * as Sentry from "@sentry/node";
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
    
    logger.debug('WorkflowError created', {
      message,
      hasCause: !!options?.cause,
      causeMessage: options?.cause?.message,
      stack: this.stack
    });
    
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
  
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    
    logger.debug('ApiError created', {
      message,
      statusCode,
      stack: this.stack
    });
    
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
  const startTime = Date.now();
  const errorId = Math.random().toString(36).substring(7);
  
  logger.debug('API error handling started', {
    errorId,
    errorType: typeof error,
    isError: error instanceof Error,
    isApiError: error instanceof ApiError,
    isWorkflowError: error instanceof WorkflowError
  });

  // Convert unknown error to a typed error
  const err = error instanceof Error ? error : new Error(String(error));
  
  // Determine status code
  let statusCode = 500;
  let statusReason = 'internal_server_error';
  
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    statusReason = 'api_error';
  } else if (err.message.includes('not found') || err.message.includes('does not exist')) {
    statusCode = 404;
    statusReason = 'not_found';
  } else if (err.message.includes('invalid') || err.message.includes('missing') || err.message.includes('required')) {
    statusCode = 400;
    statusReason = 'bad_request';
  } else if (err.message.includes('unauthorized') || err.message.includes('forbidden')) {
    statusCode = 403;
    statusReason = 'forbidden';
  } else if (err.message.includes('timeout')) {
    statusCode = 408;
    statusReason = 'timeout';
  }
  
  const processingTime = Date.now() - startTime;
  
  // Log the error with enhanced context
  logger.error('API error processed', {
    errorId,
    message: err.message,
    statusCode,
    statusReason,
    errorName: err.name,
    processingTimeMs: processingTime,
    stack: err.stack
  });
  
  Sentry.captureException(err, (scope) => {
    scope.setTag('api.error', 'true');
    scope.setTag('statusCode', statusCode);
    scope.setTag('statusReason', statusReason);
    scope.setTag('errorId', errorId);
    scope.setExtra('originalError', err);
    scope.setExtra('processingTimeMs', processingTime);
    return scope;
  });
  
  logger.debug('API error handling completed', {
    errorId,
    statusCode,
    responseMessage: err.message,
    totalProcessingTimeMs: processingTime
  });
  
  return {
    status: statusCode,
    body: { error: err.message }
  };
}

/**
 * Set up global error handlers for uncaught exceptions and unhandled rejections
 */
export function setupGlobalErrorHandlers(): void {
  const startTime = Date.now();
  logger.debug('Setting up global error handlers');
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    const crashId = Math.random().toString(36).substring(7);
    
    logger.error('Uncaught exception detected', {
      crashId,
      message: error.message,
      name: error.name,
      stack: error.stack,
      uptime: process.uptime()
    });
    
    Sentry.captureException(error, { 
      tags: { 
        type: 'uncaughtException',
        crashId
      },
      extra: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        pid: process.pid
      }
    });
    
    logger.debug('Initiating graceful shutdown after uncaught exception', {
      crashId,
      shutdownDelayMs: 1000
    });
    
    // Give time for logs to be written before exiting
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    const rejectionId = Math.random().toString(36).substring(7);
    const err = reason instanceof Error ? reason : new Error(String(reason));
    
    logger.error('Unhandled promise rejection detected', {
      rejectionId,
      message: err.message,
      reason: String(reason),
      uptime: process.uptime(),
      stack: err.stack
    });
    
    Sentry.captureException(err, { 
      tags: { 
        type: 'unhandledRejection',
        rejectionId
      }, 
      extra: { 
        promise: String(promise),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      } 
    });
  });
  
  const setupTime = Date.now() - startTime;
  logger.info('Global error handlers set up');
  logger.debug('Global error handler setup completed', {
    setupTimeMs: setupTime,
    handlersRegistered: ['uncaughtException', 'unhandledRejection']
  });
}
