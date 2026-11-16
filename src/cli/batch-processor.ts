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
  private llmService: IngestionLLMService | null = null;
  private initialized = false;

  constructor() {
    this.segmentService = new SegmentAccumulatorService();
  }

  private getLLMService(): IngestionLLMService {
    if (!this.llmService) {
      this.llmService = new IngestionLLMService();
    }
    return this.llmService;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.memoryService.initialize();
      await this.getLLMService().initialize();
      this.initialized = true;
    }
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
    await this.ensureInitialized();
    
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
      await this.getLLMService().initialize();
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
          const summary = await this.getLLMService().generateSegmentSummary(
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
            source: 'derived' as 'explicit' | 'suggested' | 'derived',
            context: `File: ${filePath}\nLines: ${state.accumulator.startLine}-${state.accumulator.endLine}\nSummary: ${summary}`,
            sessionId: options.sessionId || 'ingestion'
          });

          result.memories.push(memoryId);
          result.segments++;

          // Reset accumulator for next segment
          state.accumulator = this.segmentService.createAccumulator();
          
          // Reset context if per-memory
          if (options.contextReset === 'memory') {
            await this.getLLMService().initialize();
          }

          console.log(`✓ Saved segment ${result.segments} from ${baseFileName} (lines ${state.accumulator.startLine}-${state.accumulator.endLine})`);
        }
      }

      // Handle any remaining content
      if (state.accumulator.lines.length > 0) {
        const segment = this.segmentService.extractSegment(state.accumulator);
        const summary = await this.getLLMService().generateSegmentSummary(
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
          source: 'derived' as 'explicit' | 'suggested' | 'derived',
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
