/**
 * Embedding service for generating vector embeddings using Gemini API
 * Provides real embeddings for memory storage and retrieval
 */

import { createLogger } from './logger';
import { embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const logger = createLogger('embeddings');

export class EmbeddingService {
  private googleAI: any = null;
  
  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      logger.warn('GOOGLE_API_KEY not configured, using fallback embeddings');
    } else {
      this.initializeGoogleAI(apiKey);
    }
  }
  
  private initializeGoogleAI(apiKey: string) {
    try {
      this.googleAI = createGoogleGenerativeAI({ apiKey });
      logger.info('Embedding service initialized with Google AI SDK');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize Google AI SDK for embeddings:', err);
    }
  }

  /**
   * Generate embedding vector for text using Gemini API or fallback to hash-based method
   * @param text Text to generate embedding for
   * @returns Vector embedding as number array
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Use the new AI SDK if available
      if (this.googleAI) {
        const { embedding } = await embed({
          model: this.googleAI.textEmbeddingModel('text-embedding-004'),
          value: text,
        });
        
        logger.debug(`Generated real embedding for text length ${text.length}`, {
          dimension: embedding.length
        });
        return embedding;
      }

      logger.info('Using hash-based fallback embedding (no API key available)');
      return this.hashBasedEmbedding(text);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to generate embedding, using fallback:', err);
      return this.hashBasedEmbedding(text);
    }
  }
  
  /**
   * Deterministic fallback embedding method that's better than random
   * Creates a hash-based embedding that preserves some semantic meaning
   * @param text Text to generate embedding for
   * @returns Vector embedding as number array
   */
  private hashBasedEmbedding(text: string): number[] {
    const normalized = text.toLowerCase().trim();
    const words = normalized.split(/\s+/);
    const embedding = new Array(768).fill(0); // Use 768 to match text-embedding-004 dimensions
    
    // Create deterministic embedding based on text content
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        const index = (charCode + i + j) % embedding.length;
        embedding[index] += (charCode / 255.0 - 0.5) * (1.0 / Math.sqrt(words.length + 1));
      }
    }
    
    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }
}

// Export a singleton instance
export const embeddingService = new EmbeddingService();
