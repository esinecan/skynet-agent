export interface IngestionOptions {
  path: string;
  recursive?: boolean;
  parallel?: boolean;
  contextReset?: 'memory' | 'document';
  databaseName?: string;
  incremental?: boolean;
  fileTypes?: string[];
  excludePatterns?: string[];
  maxConcurrency?: number;
}

export interface FileQueueItem {
  path: string;
  relativePath: string;
  size: number;
  type: string;
}

export interface ProcessingResult {
  file: string;
  segments: number;
  memories: string[];
  errors?: string[];
  processingTime: number;
}

export interface SegmentAccumulator {
  lines: string[];
  startLine: number;
  endLine: number;
  isComplete: boolean;
  confidence: number;
}

export interface BatchProcessingState {
  file: string;
  currentLine: number;
  totalLines: number;
  accumulator: SegmentAccumulator;
  context?: string;
}
