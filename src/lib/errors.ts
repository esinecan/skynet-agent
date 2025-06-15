/**
 * Custom error types for Skynet Agent
 */

export enum ErrorCode {
  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  TOOL_INVALID_ARGS = 'TOOL_INVALID_ARGS',
  
  // Memory errors
  MEMORY_STORAGE_FAILED = 'MEMORY_STORAGE_FAILED',
  MEMORY_RETRIEVAL_FAILED = 'MEMORY_RETRIEVAL_FAILED',
  
  // Attachment errors
  ATTACHMENT_TOO_LARGE = 'ATTACHMENT_TOO_LARGE',
  ATTACHMENT_INVALID_TYPE = 'ATTACHMENT_INVALID_TYPE',
  ATTACHMENT_PROCESSING_FAILED = 'ATTACHMENT_PROCESSING_FAILED',
  
  // Stream errors
  STREAM_ERROR = 'STREAM_ERROR',
  STREAM_TIMEOUT = 'STREAM_TIMEOUT',
  
  // API errors
  API_ERROR = 'API_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
}

export class SkynetError extends Error {
  code: ErrorCode;
  details?: any;
  retryable: boolean;

  constructor(message: string, code: ErrorCode, details?: any, retryable = false) {
    super(message);
    this.name = 'SkynetError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export class ToolError extends SkynetError {
  toolName: string;
  serverName: string;

  constructor(
    message: string, 
    toolName: string, 
    serverName: string, 
    code: ErrorCode = ErrorCode.TOOL_EXECUTION_FAILED,
    details?: any
  ) {
    super(message, code, details, true);
    this.name = 'ToolError';
    this.toolName = toolName;
    this.serverName = serverName;
  }
}

export class AttachmentError extends SkynetError {
  fileName?: string;
  fileSize?: number;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.ATTACHMENT_PROCESSING_FAILED,
    fileName?: string,
    fileSize?: number
  ) {
    super(message, code, { fileName, fileSize }, false);
    this.name = 'AttachmentError';
    this.fileName = fileName;
    this.fileSize = fileSize;
  }
}

export class StreamError extends SkynetError {
  streamDetails?: any;

  constructor(message: string, streamDetails?: any) {
    super(message, ErrorCode.STREAM_ERROR, streamDetails, true);
    this.name = 'StreamError';
    this.streamDetails = streamDetails;
  }
}

// Error utility functions
export function isRetryableError(error: unknown): boolean {
  return error instanceof SkynetError && error.retryable;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function getErrorDetails(error: unknown): any {
  if (error instanceof SkynetError) {
    return error.details;
  }
  return null;
}
