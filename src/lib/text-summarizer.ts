/**
 * Standalone text summarization utility
 * Used by RAG system to reduce storage size while preserving key information
 */

import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

export interface SummarizationOptions {
  maxLength?: number;
  preserveContext?: string;
  provider?: 'google' | 'openai';
}

export interface SummarizationResult {
  summary: string;
  originalLength: number;
  summaryLength: number;
  compressionRatio: number;
  wasSummarized: boolean;
}

/**
 * Summarize text while preserving key information
 * This is a standalone utility with no dependencies on our RAG/LLM services
 */
export async function summarizeText(
  text: string,
  options: SummarizationOptions = {}
): Promise<SummarizationResult> {
  const {
    maxLength = 500,
    preserveContext = '',
    provider = 'google'
  } = options;

  const originalLength = text.length;

  // If text is already short enough, return as-is
  if (originalLength <= maxLength) {
    return {
      summary: text,
      originalLength,
      summaryLength: originalLength,
      compressionRatio: 1.0,
      wasSummarized: false
    };
  }

  try {
    // Initialize model based on provider
    let model;
    if (provider === 'google' && process.env.GOOGLE_API_KEY) {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_API_KEY
      });
      model = google('gemini-1.5-flash');
    } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      model = openai('gpt-3.5-turbo');
    } else {
      throw new Error(`No API key available for provider: ${provider}`);
    }

    const summaryPrompt = `You are a text summarizer that preserves key concrete information.

CRITICAL REQUIREMENTS:
- Preserve ALL dates, times, file paths, URLs, specific names
- Preserve ALL technical details, error codes, version numbers  
- Preserve ALL specific user intentions and context
- Keep factual information intact
- Aim for ~${maxLength} characters but focus on completeness over length

${preserveContext ? `CONTEXT: ${preserveContext}` : ''}

TEXT TO SUMMARIZE:
${text}

SUMMARY:`;

    const result = await generateText({
      model,
      prompt: summaryPrompt,
      maxTokens: Math.ceil(maxLength / 3), // Rough token estimation
      temperature: 0.1, // Low temperature for consistent, factual summaries
    });

    const summary = result.text.trim();
    
    // Ensure summary is actually shorter than original
    if (summary.length >= originalLength * 0.8) {
      console.warn('⚠️ Summary not significantly shorter than original, using truncated original');
      const truncated = text.substring(0, maxLength) + '...';
      return {
        summary: truncated,
        originalLength,
        summaryLength: truncated.length,
        compressionRatio: truncated.length / originalLength,
        wasSummarized: true
      };
    }
    
    console.log(`📝 Summarized ${originalLength} chars → ${summary.length} chars`);
    return {
      summary,
      originalLength,
      summaryLength: summary.length,
      compressionRatio: summary.length / originalLength,
      wasSummarized: true
    };
    
  } catch (error) {
    console.error('❌ Summarization failed:', error);
    // Fallback: truncate original text
    const truncated = text.substring(0, maxLength) + '...';
    return {
      summary: truncated,
      originalLength,
      summaryLength: truncated.length,
      compressionRatio: truncated.length / originalLength,
      wasSummarized: true
    };
  }
}

/**
 * Check if summarization should be applied based on configuration
 */
export function shouldSummarize(
  text: string,
  config: {
    enabled: boolean;
    threshold: number;
  }
): boolean {
  return config.enabled && text.length > config.threshold;
}
