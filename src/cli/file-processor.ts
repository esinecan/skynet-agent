import { FileQueueItem, ProcessingResult, IngestionOptions } from '../types/ingestion';
import { BatchProcessor } from './batch-processor';
import * as fs from 'fs/promises';
import * as path from 'path';
import fileTypeMappings from '../config/file-type-mappings';
import { FileTypeMapping } from '../types/file-mapping';

export class FileProcessor {
  private batchProcessor: BatchProcessor;
  private mappings: typeof fileTypeMappings;

  constructor() {
    this.batchProcessor = new BatchProcessor();
    this.mappings = fileTypeMappings;
  }

  async processQueue(
    queue: FileQueueItem[],
    options: IngestionOptions
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];
    
    if (options.parallel && options.maxConcurrency && options.maxConcurrency > 1) {
      // Process in parallel batches
      const batchSize = options.maxConcurrency;
      for (let i = 0; i < queue.length; i += batchSize) {
        const batch = queue.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(item => this.processFile(item, options))
        );
        results.push(...batchResults);
      }
    } else {
      // Process sequentially
      for (const item of queue) {
        const result = await this.processFile(item, options);
        results.push(result);
      }
    }

    return results;
  }

  private async processFile(
    item: FileQueueItem,
    options: IngestionOptions
  ): Promise<ProcessingResult> {
    console.log(`Processing: ${item.relativePath}`);
    
    // Get mapping for file type
    const mapping = this.getFileTypeMapping(item.type);
    
    try {
      const result = await this.batchProcessor.processFile(
        item.path,
        mapping,
        {
          contextReset: options.contextReset,
          sessionId: options.databaseName || 'default',
          tags: [`ingestion:${new Date().toISOString().split('T')[0]}`]
        }
      );

      console.log(`✓ Completed ${item.relativePath}: ${result.segments} segments, ${result.memories.length} memories`);
      return result;

    } catch (error) {
      console.error(`✗ Failed ${item.relativePath}:`, error);
      return {
        file: item.path,
        segments: 0,
        memories: [],
        errors: [error instanceof Error ? error.message : String(error)],
        processingTime: 0
      };
    }
  }

  private getFileTypeMapping(extension: string): FileTypeMapping {
    // Find mapping by extension
    for (const [key, mapping] of Object.entries(this.mappings)) {
      if (mapping.extensions.includes(extension)) {
        return mapping;
      }
    }
    
    // Return default mapping
    return this.mappings.default;
  }
}
