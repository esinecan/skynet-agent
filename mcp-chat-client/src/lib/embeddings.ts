/**
 * Embedding service for generating vector embeddings using Google's text-embedding-004
 * Adapted from Skynet Agent for the lean MCP chat client
 */

import { embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { EmbeddingService } from '../types/memory';

type GoogleGenerativeAI = ReturnType<typeof createGoogleGenerativeAI>;

export class GoogleEmbeddingService implements EmbeddingService {
  private googleAI: GoogleGenerativeAI | null = null;
  private isInitialized = false;
  private readonly dimensions = 768; // text-embedding-004 dimensions
  
  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.warn('GOOGLE_API_KEY not configured, using fallback embeddings');
    } else {
      this.initializeGoogleAI(apiKey);
    }
  }
  
  private initializeGoogleAI(apiKey: string) {
    try {
      this.googleAI = createGoogleGenerativeAI({ apiKey });
      this.isInitialized = true;
      console.log('Google Embedding Service initialized with text-embedding-004');
    } catch (error) {
      console.error('Failed to initialize Google AI SDK for embeddings:', error);
    }
  }

  /**
   * Generate embedding vector for text using Google's text-embedding-004 or fallback
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const startTime = Date.now();
    
    try {
      // Use Google API if available
      if (this.googleAI && this.isInitialized) {
        const { embedding } = await embed({
          model: this.googleAI.textEmbeddingModel('text-embedding-004'),
          value: text,
        });
        
        const duration = Date.now() - startTime;
        console.log(`Real embedding generated in ${duration}ms (${embedding.length} dimensions)`);
        
        return embedding;
      }

      // Fallback to hash-based embedding
      return this.generateHashBasedEmbedding(text);
    } catch (error) {
      console.error('Failed to generate embedding, using fallback:', error);
      return this.generateHashBasedEmbedding(text);
    }
  }
  
  /**
   * Deterministic fallback embedding method
   * Creates a hash-based embedding that preserves some semantic meaning
   */
  private generateHashBasedEmbedding(text: string): number[] {
    const normalized = text.toLowerCase().trim();
    const words = normalized.split(/\s+/);
    const embedding = new Array(this.dimensions).fill(0);
    
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
    
    console.log(`Fallback embedding generated (${embedding.length} dimensions)`);
    return embedding;
  }

  /**
   * Get the dimension count of embeddings
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Check if the service is ready for real embeddings
   */
  isReady(): boolean {
    return this.isInitialized && this.googleAI !== null;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimensions don't match: ${a.length} vs ${b.length}`);
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

// Export singleton instance
let embeddingService: GoogleEmbeddingService | null = null;

export function getEmbeddingService(): GoogleEmbeddingService {
  if (!embeddingService) {
    embeddingService = new GoogleEmbeddingService();
  }
  return embeddingService;
}
