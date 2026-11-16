import { generateText } from 'ai';
import { LLMService } from './llm-service';
import { SEGMENT_DETECTION_PROMPT, SEGMENT_SUMMARY_PROMPT } from '../config/ingestion-prompts';

export class IngestionLLMService extends LLMService {
  constructor() {
    // Check if we have the necessary environment variables
    const provider = process.env.INGESTION_LLM_PROVIDER || process.env.LLM_PROVIDER || 'google';
    const model = process.env.INGESTION_LLM_MODEL || process.env.LLM_MODEL;
    
    // Initialize with ingestion-specific configuration if available
    super({
      provider: provider as any,
      model: model
    });
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
