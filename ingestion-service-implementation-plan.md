# Ingestion Service Implementation Plan

## Overview
This document provides a step-by-step implementation plan for creating a CLI-based ingestion service that processes files into conscious memories for the Skynet Agent system.

## Core Architecture

### 1. File Structure
```
src/cli/
├── ingest.ts                    # Main CLI entry point
├── file-processor.ts            # Core file processing logic
├── segment-accumulator.ts       # Handles segment detection and accumulation
├── batch-processor.ts           # Manages 100-line batch processing
├── file-type-mapper.ts          # Maps file types to chunking strategies
└── progress-tracker.ts          # Tracks processed files for incremental runs

src/lib/
├── ingestion-llm-service.ts     # Dedicated LLM service for ingestion
└── file-utils.ts                # File system utilities

src/types/
├── ingestion.ts                 # TypeScript types for ingestion system
└── file-mapping.ts              # Types for file type mappings

src/config/
├── file-type-mappings.json      # JSON configuration for file type chunking
└── ingestion-prompts.ts         # System prompts for segment detection
```

## Implementation Steps

### Step 1: Create TypeScript Type Definitions

#### File: `src/types/ingestion.ts`
```typescript
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
```

#### File: `src/types/file-mapping.ts`
```typescript
export interface FileTypeMapping {
  extensions: string[];
  chunkingStrategy: ChunkingStrategy;
  contextClues?: string[];
  minLines?: number;
  maxLines?: number;
  preserveStructure?: boolean;
}

export interface ChunkingStrategy {
  type: 'function' | 'class' | 'section' | 'paragraph' | 'fixed' | 'semantic';
  delimiters?: string[];
  patterns?: RegExp[];
  lookahead?: number;
}

export interface ChunkingConfig {
  [key: string]: FileTypeMapping;
}
```

### Step 2: Create File Type Mapping Configuration

#### File: `src/config/file-type-mappings.json`
```json
{
  "typescript": {
    "extensions": [".ts", ".tsx"],
    "chunkingStrategy": {
      "type": "function",
      "patterns": [
        "^export\\s+(async\\s+)?function",
        "^(export\\s+)?class\\s+",
        "^(export\\s+)?interface\\s+",
        "^(export\\s+)?const\\s+\\w+\\s*=\\s*(async\\s*)?\\("
      ],
      "lookahead": 5
    },
    "contextClues": ["function", "class", "interface", "const", "export"],
    "minLines": 3,
    "maxLines": 500
  },
  "javascript": {
    "extensions": [".js", ".jsx", ".mjs"],
    "chunkingStrategy": {
      "type": "function",
      "patterns": [
        "^(export\\s+)?(async\\s+)?function",
        "^class\\s+",
        "^const\\s+\\w+\\s*=\\s*(async\\s*)?\\("
      ],
      "lookahead": 5
    },
    "minLines": 3,
    "maxLines": 500
  },
  "python": {
    "extensions": [".py"],
    "chunkingStrategy": {
      "type": "function",
      "patterns": [
        "^def\\s+",
        "^class\\s+",
        "^async\\s+def\\s+"
      ],
      "lookahead": 3
    },
    "contextClues": ["def", "class", "async def"],
    "minLines": 2,
    "maxLines": 300
  },
  "markdown": {
    "extensions": [".md", ".mdx"],
    "chunkingStrategy": {
      "type": "section",
      "patterns": [
        "^#{1,6}\\s+"
      ],
      "delimiters": ["---", "***"]
    },
    "minLines": 5,
    "maxLines": 200
  },
  "json": {
    "extensions": [".json"],
    "chunkingStrategy": {
      "type": "semantic",
      "preserveStructure": true
    },
    "minLines": 1,
    "maxLines": 1000
  },
  "text": {
    "extensions": [".txt", ".log"],
    "chunkingStrategy": {
      "type": "paragraph",
      "delimiters": ["\n\n", "\r\n\r\n"]
    },
    "minLines": 10,
    "maxLines": 100
  },
  "default": {
    "extensions": ["*"],
    "chunkingStrategy": {
      "type": "fixed",
      "maxLines": 100
    }
  }
}
```

### Step 3: Create Ingestion System Prompts

#### File: `src/config/ingestion-prompts.ts`
```typescript
export const SEGMENT_DETECTION_PROMPT = `You are a code and document segmentation expert. Your task is to analyze batches of lines from a file and determine if they form a complete, meaningful segment.

A complete segment should be:
1. Self-contained and meaningful on its own
2. A complete function, class, section, or logical unit
3. Not cut off in the middle of important content

Given the current batch of lines and any previous context, determine:
1. If this forms a complete segment
2. If you need more lines to complete the segment
3. A confidence score (0-1) for your decision

Current file type: {fileType}
Lines seen so far: {totalLines}
Current batch size: {batchSize}

Respond in JSON format:
{
  "isComplete": boolean,
  "needsMoreLines": boolean,
  "confidence": number,
  "reason": "string explaining your decision",
  "suggestedTitle": "string - a title for this segment if complete"
}`;

export const SEGMENT_SUMMARY_PROMPT = `Summarize this code/document segment for storage as a memory. Focus on:
1. What this segment does or contains
2. Key functions, classes, or concepts
3. Important relationships or dependencies
4. Any notable patterns or techniques

Keep the summary concise but informative. This will be used for future retrieval and understanding.

Segment content:
{content}

File: {filePath}
Segment location: Lines {startLine}-{endLine}`;
```

### Step 4: Implement Core Components

#### File: `src/lib/file-utils.ts`
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileQueueItem } from '../types/ingestion';

export async function buildFileQueue(
  rootPath: string,
  options: {
    recursive?: boolean;
    fileTypes?: string[];
    excludePatterns?: string[];
  }
): Promise<FileQueueItem[]> {
  const queue: FileQueueItem[] = [];
  const excludeRegexes = options.excludePatterns?.map(p => new RegExp(p));

  async function scanDirectory(dirPath: string, baseDir: string) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Check exclusions
      if (excludeRegexes?.some(regex => regex.test(relativePath))) {
        continue;
      }

      if (entry.isDirectory() && options.recursive) {
        await scanDirectory(fullPath, baseDir);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        
        // Check file type filter
        if (options.fileTypes && !options.fileTypes.includes(ext)) {
          continue;
        }

        const stats = await fs.stat(fullPath);
        queue.push({
          path: fullPath,
          relativePath,
          size: stats.size,
          type: ext || 'unknown'
        });
      }
    }
  }

  await scanDirectory(rootPath, rootPath);
  return queue;
}

export async function readFileInChunks(
  filePath: string,
  chunkSize: number = 100
): AsyncGenerator<{ lines: string[]; startLine: number }, void, unknown> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i += chunkSize) {
    yield {
      lines: lines.slice(i, Math.min(i + chunkSize, lines.length)),
      startLine: i + 1
    };
  }
}

export async function saveProcessedFilesList(
  directory: string,
  processedFiles: string[]
): Promise<void> {
  const manifestPath = path.join(directory, '.skynet-processed.json');
  const manifest = {
    version: '1.0',
    lastRun: new Date().toISOString(),
    processedFiles,
    totalFiles: processedFiles.length
  };
  
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function loadProcessedFilesList(
  directory: string
): Promise<string[]> {
  const manifestPath = path.join(directory, '.skynet-processed.json');
  
  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(content);
    return manifest.processedFiles || [];
  } catch {
    return [];
  }
}
```

#### File: `src/lib/ingestion-llm-service.ts`
```typescript
import { generateText } from 'ai';
import { LLMService } from './llm-service';
import { SEGMENT_DETECTION_PROMPT, SEGMENT_SUMMARY_PROMPT } from '../config/ingestion-prompts';

export class IngestionLLMService extends LLMService {
  constructor() {
    super();
  }

  async detectSegmentCompletion(
    lines: string[],
    fileType: string,
    totalLinesSeen: number,
    previousContext?: string
  ): Promise<{
    isComplete: boolean;
    needsMoreLines: boolean;
    confidence: number;
    reason: string;
    suggestedTitle?: string;
  }> {
    const prompt = SEGMENT_DETECTION_PROMPT
      .replace('{fileType}', fileType)
      .replace('{totalLines}', totalLinesSeen.toString())
      .replace('{batchSize}', lines.length.toString());

    const context = previousContext 
      ? `Previous context:\n${previousContext}\n\nCurrent batch:\n${lines.join('\n')}`
      : lines.join('\n');

    const result = await generateText({
      model: this.getModel(),
      prompt: `${prompt}\n\nContent to analyze:\n${context}`,
      temperature: 0.1,
      maxTokens: 500
    });

    try {
      return JSON.parse(result.text);
    } catch {
      // Fallback if JSON parsing fails
      return {
        isComplete: lines.length >= 100,
        needsMoreLines: false,
        confidence: 0.5,
        reason: 'Failed to parse LLM response, using default logic'
      };
    }
  }

  async generateSegmentSummary(
    content: string,
    filePath: string,
    startLine: number,
    endLine: number
  ): Promise<string> {
    const prompt = SEGMENT_SUMMARY_PROMPT
      .replace('{content}', content)
      .replace('{filePath}', filePath)
      .replace('{startLine}', startLine.toString())
      .replace('{endLine}', endLine.toString());

    const result = await generateText({
      model: this.getModel(),
      prompt,
      temperature: 0.3,
      maxTokens: 500
    });

    return result.text;
  }
}
```

#### File: `src/cli/segment-accumulator.ts`
```typescript
import { SegmentAccumulator } from '../types/ingestion';
import { IngestionLLMService } from '../lib/ingestion-llm-service';
import { ChunkingStrategy } from '../types/file-mapping';

export class SegmentAccumulatorService {
  private llmService: IngestionLLMService;

  constructor() {
    this.llmService = new IngestionLLMService();
  }

  createAccumulator(): SegmentAccumulator {
    return {
      lines: [],
      startLine: 0,
      endLine: 0,
      isComplete: false,
      confidence: 0
    };
  }

  async processLines(
    newLines: string[],
    startLine: number,
    accumulator: SegmentAccumulator,
    fileType: string,
    strategy?: ChunkingStrategy
  ): Promise<SegmentAccumulator> {
    // Add new lines to accumulator
    accumulator.lines.push(...newLines);
    
    if (accumulator.startLine === 0) {
      accumulator.startLine = startLine;
    }
    accumulator.endLine = startLine + newLines.length - 1;

    // Check if segment is complete using strategy or LLM
    if (strategy && strategy.type !== 'semantic') {
      // Use pattern-based detection
      const isComplete = this.checkPatternCompletion(accumulator, strategy);
      accumulator.isComplete = isComplete;
      accumulator.confidence = isComplete ? 0.9 : 0.3;
    } else {
      // Use LLM for semantic detection
      const detection = await this.llmService.detectSegmentCompletion(
        accumulator.lines,
        fileType,
        accumulator.endLine,
        accumulator.lines.slice(0, 20).join('\n') // Provide some context
      );
      
      accumulator.isComplete = detection.isComplete;
      accumulator.confidence = detection.confidence;
    }

    return accumulator;
  }

  private checkPatternCompletion(
    accumulator: SegmentAccumulator,
    strategy: ChunkingStrategy
  ): boolean {
    if (strategy.patterns && strategy.patterns.length > 0) {
      // Check if we've hit another pattern (indicating new segment)
      const lastFewLines = accumulator.lines.slice(-5);
      for (const line of lastFewLines) {
        for (const pattern of strategy.patterns) {
          if (pattern.test(line) && accumulator.lines.length > 10) {
            return true;
          }
        }
      }
    }

    // Check max lines constraint
    if (accumulator.lines.length >= 500) {
      return true;
    }

    return false;
  }

  extractSegment(accumulator: SegmentAccumulator): string {
    return accumulator.lines.join('\n');
  }
}
```

#### File: `src/cli/batch-processor.ts`
```typescript
import { readFileInChunks } from '../lib/file-utils';
import { SegmentAccumulatorService } from './segment-accumulator';
import { FileTypeMapping } from '../types/file-mapping';
import { ProcessingResult, BatchProcessingState } from '../types/ingestion';
import { getConsciousMemoryService } from '../lib/conscious-memory';
import { IngestionLLMService } from '../lib/ingestion-llm-service';
import * as path from 'path';

export class BatchProcessor {
  private segmentService: SegmentAccumulatorService;
  private memoryService = getConsciousMemoryService();
  private llmService: IngestionLLMService;

  constructor() {
    this.segmentService = new SegmentAccumulatorService();
    this.llmService = new IngestionLLMService();
  }

  async processFile(
    filePath: string,
    mapping: FileTypeMapping,
    options: {
      contextReset?: 'memory' | 'document';
      sessionId?: string;
      tags?: string[];
    }
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      file: filePath,
      segments: 0,
      memories: [],
      processingTime: Date.now()
    };

    const state: BatchProcessingState = {
      file: filePath,
      currentLine: 0,
      totalLines: 0,
      accumulator: this.segmentService.createAccumulator()
    };

    // Reset context if per-document
    if (options.contextReset === 'document') {
      await this.llmService.initialize();
    }

    try {
      const fileType = path.extname(filePath);
      const baseFileName = path.basename(filePath);
      
      for await (const chunk of readFileInChunks(filePath, 100)) {
        state.currentLine = chunk.startLine;
        state.totalLines += chunk.lines.length;

        // Process lines through accumulator
        state.accumulator = await this.segmentService.processLines(
          chunk.lines,
          chunk.startLine,
          state.accumulator,
          fileType,
          mapping.chunkingStrategy
        );

        // If segment is complete, save it as memory
        if (state.accumulator.isComplete && state.accumulator.confidence > 0.7) {
          const segment = this.segmentService.extractSegment(state.accumulator);
          
          // Generate summary for the segment
          const summary = await this.llmService.generateSegmentSummary(
            segment,
            filePath,
            state.accumulator.startLine,
            state.accumulator.endLine
          );

          // Save as conscious memory
          const memoryId = await this.memoryService.saveMemory({
            content: segment,
            tags: [
              ...(options.tags || []),
              'ingested',
              fileType.replace('.', ''),
              baseFileName
            ],
            importance: 5,
            source: 'ingestion',
            context: `File: ${filePath}\nLines: ${state.accumulator.startLine}-${state.accumulator.endLine}\nSummary: ${summary}`,
            sessionId: options.sessionId || 'ingestion'
          });

          result.memories.push(memoryId);
          result.segments++;

          // Reset accumulator for next segment
          state.accumulator = this.segmentService.createAccumulator();
          
          // Reset context if per-memory
          if (options.contextReset === 'memory') {
            await this.llmService.initialize();
          }

          console.log(`✓ Saved segment ${result.segments} from ${baseFileName} (lines ${state.accumulator.startLine}-${state.accumulator.endLine})`);
        }
      }

      // Handle any remaining content
      if (state.accumulator.lines.length > 0) {
        const segment = this.segmentService.extractSegment(state.accumulator);
        const summary = await this.llmService.generateSegmentSummary(
          segment,
          filePath,
          state.accumulator.startLine,
          state.accumulator.endLine
        );

        const memoryId = await this.memoryService.saveMemory({
          content: segment,
          tags: [
            ...(options.tags || []),
            'ingested',
            fileType.replace('.', ''),
            baseFileName,
            'partial'
          ],
          importance: 4,
          source: 'ingestion',
          context: `File: ${filePath}\nLines: ${state.accumulator.startLine}-${state.accumulator.endLine}\nSummary: ${summary}\nNote: Partial segment`,
          sessionId: options.sessionId || 'ingestion'
        });

        result.memories.push(memoryId);
        result.segments++;
      }

      result.processingTime = Date.now() - result.processingTime;
      return result;

    } catch (error) {
      result.errors = [error instanceof Error ? error.message : String(error)];
      result.processingTime = Date.now() - result.processingTime;
      return result;
    }
  }
}
```

#### File: `src/cli/file-processor.ts`
```typescript
import { FileQueueItem, ProcessingResult, IngestionOptions } from '../types/ingestion';
import { BatchProcessor } from './batch-processor';
import * as fs from 'fs/promises';
import * as path from 'path';
import fileTypeMappings from '../config/file-type-mappings.json';
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
```

#### File: `src/cli/progress-tracker.ts`
```typescript
import { ProcessingResult } from '../types/ingestion';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ProgressTracker {
  private processedFiles: Set<string> = new Set();
  private manifestPath: string;

  constructor(rootPath: string) {
    this.manifestPath = path.join(rootPath, '.skynet-processed.json');
  }

  async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      this.processedFiles = new Set(manifest.processedFiles || []);
      console.log(`Loaded ${this.processedFiles.size} previously processed files`);
    } catch {
      console.log('No previous processing manifest found, starting fresh');
    }
  }

  async save(results: ProcessingResult[]): Promise<void> {
    // Add newly processed files
    for (const result of results) {
      if (!result.errors || result.errors.length === 0) {
        this.processedFiles.add(result.file);
      }
    }

    const manifest = {
      version: '1.0',
      lastRun: new Date().toISOString(),
      processedFiles: Array.from(this.processedFiles),
      totalFiles: this.processedFiles.size,
      lastRunStats: {
        filesProcessed: results.length,
        totalSegments: results.reduce((sum, r) => sum + r.segments, 0),
        totalMemories: results.reduce((sum, r) => sum + r.memories.length, 0),
        errors: results.filter(r => r.errors && r.errors.length > 0).length
      }
    };

    await fs.writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Saved progress: ${this.processedFiles.size} total files processed`);
  }

  isProcessed(filePath: string): boolean {
    return this.processedFiles.has(filePath);
  }

  filterUnprocessed(files: Array<{ path: string }>): Array<{ path: string }> {
    return files.filter(f => !this.isProcessed(f.path));
  }
}
```

### Step 5: Create Main CLI Entry Point

#### File: `src/cli/ingest.ts`
```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { buildFileQueue } from '../lib/file-utils';
import { FileProcessor } from './file-processor';
import { ProgressTracker } from './progress-tracker';
import { IngestionOptions } from '../types/ingestion';
import * as path from 'path';
import * as fs from 'fs/promises';

const program = new Command();

program
  .name('skynet-ingest')
  .description('Ingest files into Skynet Agent conscious memory')
  .version('1.0.0');

program
  .command('process <path>')
  .description('Process files in the specified path')
  .option('-r, --recursive', 'Process subdirectories recursively', true)
  .option('-p, --parallel', 'Enable parallel processing', false)
  .option('-c, --concurrency <number>', 'Max concurrent file processing', '3')
  .option('--context-reset <type>', 'Context reset strategy: memory|document', 'memory')
  .option('-d, --database <name>', 'Database name for personality', 'default')
  .option('-i, --incremental', 'Only process new files', true)
  .option('-t, --types <extensions...>', 'File types to process (e.g., .ts .js)')
  .option('-e, --exclude <patterns...>', 'Exclude patterns (regex)')
  .option('--dry-run', 'Show what would be processed without actually processing')
  .action(async (targetPath: string, options) => {
    try {
      const absolutePath = path.resolve(targetPath);
      
      // Verify path exists
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        console.error('Error: Path must be a directory');
        process.exit(1);
      }

      console.log(`\n🚀 Skynet Agent File Ingestion Service`);
      console.log(`📁 Target: ${absolutePath}`);
      console.log(`⚙️  Options:`);
      console.log(`   - Recursive: ${options.recursive}`);
      console.log(`   - Parallel: ${options.parallel}`);
      console.log(`   - Context Reset: ${options.contextReset}`);
      console.log(`   - Database: ${options.database}`);
      console.log(`   - Incremental: ${options.incremental}\n`);

      // Build file queue
      console.log('🔍 Scanning for files...');
      const allFiles = await buildFileQueue(absolutePath, {
        recursive: options.recursive,
        fileTypes: options.types,
        excludePatterns: options.exclude || [
          'node_modules',
          '\\.git',
          '\\.next',
          'dist',
          'build',
          '\\.skynet-processed\\.json'
        ]
      });

      console.log(`📊 Found ${allFiles.size} files`);

      // Load progress if incremental
      let filesToProcess = allFiles;
      if (options.incremental) {
        const tracker = new ProgressTracker(absolutePath);
        await tracker.load();
        filesToProcess = tracker.filterUnprocessed(allFiles);
        console.log(`📈 ${filesToProcess.length} new files to process`);
      }

      if (filesToProcess.length === 0) {
        console.log('✅ All files already processed!');
        return;
      }

      // Dry run check
      if (options.dryRun) {
        console.log('\n🏃 DRY RUN - Files that would be processed:');
        filesToProcess.forEach(f => console.log(`   - ${f.relativePath}`));
        return;
      }

      // Process files
      console.log('\n🏭 Starting file processing...\n');
      const processor = new FileProcessor();
      const startTime = Date.now();

      const results = await processor.processQueue(filesToProcess, {
        path: absolutePath,
        recursive: options.recursive,
        parallel: options.parallel,
        contextReset: options.contextReset as 'memory' | 'document',
        databaseName: options.database,
        incremental: options.incremental,
        fileTypes: options.types,
        excludePatterns: options.exclude,
        maxConcurrency: parseInt(options.concurrency)
      });

      // Save progress
      if (options.incremental) {
        const tracker = new ProgressTracker(absolutePath);
        await tracker.save(results);
      }

      // Summary
      const totalTime = (Date.now() - startTime) / 1000;
      const successCount = results.filter(r => !r.errors || r.errors.length === 0).length;
      const errorCount = results.length - successCount;
      const totalSegments = results.reduce((sum, r) => sum + r.segments, 0);
      const totalMemories = results.reduce((sum, r) => sum + r.memories.length, 0);

      console.log('\n📊 Ingestion Complete!');
      console.log(`⏱️  Total time: ${totalTime.toFixed(2)}s`);
      console.log(`✅ Files processed: ${successCount}`);
      console.log(`❌ Files with errors: ${errorCount}`);
      console.log(`📝 Total segments: ${totalSegments}`);
      console.log(`🧠 Total memories created: ${totalMemories}`);
      console.log(`💾 Database: ${options.database}`);

      if (errorCount > 0) {
        console.log('\n❌ Errors:');
        results.filter(r => r.errors && r.errors.length > 0).forEach(r => {
          console.log(`   - ${r.file}: ${r.errors!.join(', ')}`);
        });
      }

    } catch (error) {
      console.error('Fatal error:', error);
      process.exit(1);
    }
  });

program
  .command('stats <path>')
  .description('Show statistics for a previously processed directory')
  .action(async (targetPath: string) => {
    try {
      const absolutePath = path.resolve(targetPath);
      const manifestPath = path.join(absolutePath, '.skynet-processed.json');
      
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      
      console.log('\n📊 Ingestion Statistics');
      console.log(`📁 Directory: ${absolutePath}`);
      console.log(`📅 Last run: ${manifest.lastRun}`);
      console.log(`📄 Total files processed: ${manifest.totalFiles}`);
      
      if (manifest.lastRunStats) {
        console.log('\n📈 Last Run Stats:');
        console.log(`   - Files: ${manifest.lastRunStats.filesProcessed}`);
        console.log(`   - Segments: ${manifest.lastRunStats.totalSegments}`);
        console.log(`   - Memories: ${manifest.lastRunStats.totalMemories}`);
        console.log(`   - Errors: ${manifest.lastRunStats.errors}`);
      }
    } catch (error) {
      console.error('No ingestion data found for this directory');
    }
  });

program
  .command('reset <path>')
  .description('Reset processing history for a directory')
  .action(async (targetPath: string) => {
    try {
      const absolutePath = path.resolve(targetPath);
      const manifestPath = path.join(absolutePath, '.skynet-processed.json');
      
      await fs.unlink(manifestPath);
      console.log('✅ Processing history reset');
    } catch (error) {
      console.error('No processing history to reset');
    }
  });

program.parse();
```

### Step 6: Update Package.json

Add the following to `package.json`:

```json
{
  "bin": {
    "skynet-ingest": "./dist/cli/ingest.js"
  },
  "scripts": {
    "build:cli": "tsc src/cli/ingest.ts --outDir dist",
    "ingest": "node dist/cli/ingest.js"
  },
  "dependencies": {
    "commander": "^11.0.0"
  }
}
```

### Step 7: Create Parallel Processing Script

#### File: `scripts/parallel-ingest.sh`
```bash
#!/bin/bash

# Parallel ingestion script for large codebases
# Usage: ./parallel-ingest.sh /path/to/project

PROJECT_PATH=$1
SUBFOLDERS=("src" "lib" "components" "pages" "utils")
PIDS=()

# Function to process a subfolder
process_folder() {
    local folder=$1
    local db_name="skynet_${folder//\//_}"
    
    echo "Starting ingestion for $folder with database $db_name"
    skynet-ingest process "$PROJECT_PATH/$folder" \
        --database "$db_name" \
        --recursive \
        --parallel \
        --concurrency 5 &
    
    PIDS+=($!)
}

# Start parallel processing
for folder in "${SUBFOLDERS[@]}"; do
    if [ -d "$PROJECT_PATH/$folder" ]; then
        process_folder "$folder"
    fi
done

# Wait for all processes
echo "Waiting for all ingestion processes to complete..."
for pid in "${PIDS[@]}"; do
    wait $pid
done

echo "All ingestion processes completed!"
```

### Step 8: Environment Configuration

Add to `.env`:
```
# Ingestion Configuration
INGESTION_LLM_PROVIDER=google
INGESTION_LLM_MODEL=gemini-2.5-flash-preview-05-20
INGESTION_MAX_TOKENS=1000
INGESTION_TEMPERATURE=0.1

# Database Configuration
CHROMA_COLLECTION_PREFIX=skynet_
NEO4J_DATABASE_PREFIX=skynet_
```

## Usage Examples

### Basic Usage
```bash
# Ingest a single directory
skynet-ingest process ./src

# Ingest recursively with specific file types
skynet-ingest process ./project --types .ts .tsx .js --recursive

# Parallel processing with custom database
skynet-ingest process ./project --parallel --database my_project --concurrency 5

# Dry run to see what would be processed
skynet-ingest process ./project --dry-run

# Incremental processing (only new files)
skynet-ingest process ./project --incremental

# Reset and process everything fresh
skynet-ingest reset ./project
skynet-ingest process ./project --incremental false
```

### Advanced Usage

#### Multiple Personality Databases
```bash
# Create different personalities for different projects
skynet-ingest process ./react-app --database react_expert
skynet-ingest process ./python-ml --database ml_expert
skynet-ingest process ./docs --database documentation_expert
```

#### Parallel Processing Large Codebases
```bash
# Split large project into parallel jobs
./scripts/parallel-ingest.sh /path/to/large/project
```

## Testing Strategy

### Unit Tests
- Test segment detection logic
- Test file type mapping
- Test batch processing
- Test memory creation

### Integration Tests  
- Test full file processing pipeline
- Test incremental processing
- Test parallel processing
- Test database switching

### E2E Tests
- Test CLI commands
- Test progress tracking
- Test error handling
- Test summary reporting

## Performance Considerations

1. **Batch Size**: 100 lines is configurable, adjust based on LLM context window
2. **Parallel Processing**: Use worker threads for true parallelism
3. **Memory Management**: Stream large files instead of loading entirely
4. **Database Optimization**: Batch memory writes when possible
5. **Caching**: Cache LLM responses for similar code patterns

## Error Handling

1. **File Access Errors**: Skip and log
2. **LLM Errors**: Retry with exponential backoff
3. **Memory Save Errors**: Queue for retry
4. **Database Connection**: Graceful degradation
5. **Progress Corruption**: Rebuild from database

## Future Enhancements

1. **Watch Mode**: Auto-ingest on file changes
2. **Git Integration**: Only process changed files
3. **Language-Specific Parsers**: Use AST for better segmentation
4. **Semantic Deduplication**: Avoid duplicate memories
5. **Memory Relationships**: Link related code segments
6. **Export/Import**: Share personality databases
7. **Web UI**: Visual ingestion management
8. **Scheduling**: Cron-based ingestion
9. **Webhooks**: Notify on completion
10. **Metrics**: Track ingestion performance
