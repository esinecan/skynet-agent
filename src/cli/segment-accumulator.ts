import { SegmentAccumulator } from '../types/ingestion';
import { IngestionLLMService } from '../lib/ingestion-llm-service';
import { ChunkingStrategy } from '../types/file-mapping';

export class SegmentAccumulatorService {
  private llmService: IngestionLLMService | null = null;

  constructor() {
    // Initialize LLM service lazily
  }

  private getLLMService(): IngestionLLMService {
    if (!this.llmService) {
      this.llmService = new IngestionLLMService();
    }
    return this.llmService;
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
      const detection = await this.getLLMService().detectSegmentCompletion(
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
