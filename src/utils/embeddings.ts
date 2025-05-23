/**
 * Embedding service for generating vector embeddings using Gemini API
 * Provides real embeddings for memory storage and retrieval
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLogger } from './logger';

const logger = createLogger('embeddings');

export class EmbeddingService {
  private genAI: GoogleGenerativeAI | null = null;
  
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('GEMINI_API_KEY not configured, using fallback embeddings');
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      logger.info('Embedding service initialized with Gemini API');
    }
  }
  
  /**
   * Generate embedding vector for text using Gemini API or fallback to hash-based method
   * @param text Text to generate embedding for
   * @returns Vector embedding as number array
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (!this.genAI) {
        logger.info('Using hash-based fallback embedding (no API key available)');
        return this.hashBasedEmbedding(text);
      }
      
      // Use Gemini's embedding model
      const model = this.genAI.getGenerativeModel({ model: "embedding-001" });
      const result = await model.embedContent(text);
      
      if (result.embedding && result.embedding.values) {
        logger.debug(`Generated real embedding for text length ${text.length}`);
        return result.embedding.values;
      } else {
        logger.warn('No embedding values returned from Gemini API, using fallback');
        return this.hashBasedEmbedding(text);
      }
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
    const embedding = new Array(384).fill(0); // Standard embedding size
    
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
