/**
 * Embedding service for generating vector embeddings using Gemini API
 * Provides real embeddings for memory storage and retrieval
 */

import { createLogger } from './logger';
import { embed } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

const logger = createLogger('embeddings');

type GoogleGenerativeAI = ReturnType<typeof createGoogleGenerativeAI>;

export class EmbeddingService {
  private googleAI: GoogleGenerativeAI | null = null;
  private isInitialized = false;
  
  constructor() {
    const startTime = Date.now();
    const apiKey = process.env.GOOGLE_API_KEY;
    
    logger.debug('EmbeddingService initialization started', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0
    });
    
    if (!apiKey) {
      logger.warn('GOOGLE_API_KEY not configured, using fallback embeddings');
      logger.debug('Fallback embedding mode activated', {
        initTimeMs: Date.now() - startTime,
        reason: 'No API key provided'
      });
    } else {
      this.initializeGoogleAI(apiKey);
      const initTime = Date.now() - startTime;
      logger.debug('EmbeddingService construction completed', {
        initTimeMs: initTime,
        googleAIInitialized: !!this.googleAI
      });
    }
  }
  
  private initializeGoogleAI(apiKey: string) {
    const startTime = Date.now();
    logger.debug('Initializing Google AI SDK for embeddings');
    
    try {
      this.googleAI = createGoogleGenerativeAI({ apiKey });
      this.isInitialized = true;
      const initTime = Date.now() - startTime;
      
      logger.info('Embedding service initialized with Google AI SDK');
      logger.debug('Google AI SDK initialization completed', {
        initTimeMs: initTime,
        sdkVersion: 'text-embedding-004'
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const initTime = Date.now() - startTime;
      
      logger.error('Failed to initialize Google AI SDK for embeddings', {
        error: err.message,
        initTimeMs: initTime,
        stack: err.stack
      });
    }
  }

  /**
   * Generate embedding vector for text using Gemini API or fallback to hash-based method
   * @param text Text to generate embedding for
   * @returns Vector embedding as number array
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const startTime = Date.now();
    const embeddingId = Math.random().toString(36).substring(7);
    
    logger.debug('Embedding generation started', {
      embeddingId,
      textLength: text.length,
      textPreview: text.substring(0, 100),
      hasGoogleAI: !!this.googleAI,
      isInitialized: this.isInitialized
    });

    try {
      // Use the new AI SDK if available
      if (this.googleAI) {
        logger.debug('Using Google AI SDK for embedding', {
          embeddingId,
          model: 'text-embedding-004'
        });
        
        const embeddingStartTime = Date.now();
        const { embedding } = await embed({
          model: this.googleAI.textEmbeddingModel('text-embedding-004'),
          value: text,
        });
        const embeddingTime = Date.now() - embeddingStartTime;
        const totalTime = Date.now() - startTime;
        
        logger.debug('Real embedding generated successfully', {
          embeddingId,
          dimension: embedding.length,
          embeddingTimeMs: embeddingTime,
          totalTimeMs: totalTime,
          efficiency: `${Math.round((text.length / totalTime) * 1000)} chars/sec`,
          textLength: text.length
        });
        
        return embedding;
      }

      logger.debug('Using hash-based fallback embedding', {
        embeddingId,
        reason: 'Google AI SDK not available',
        textLength: text.length
      });
      
      const fallbackStartTime = Date.now();
      const fallbackEmbedding = this.hashBasedEmbedding(text);
      const fallbackTime = Date.now() - fallbackStartTime;
      const totalTime = Date.now() - startTime;
      
      logger.debug('Fallback embedding generated', {
        embeddingId,
        dimension: fallbackEmbedding.length,
        fallbackTimeMs: fallbackTime,
        totalTimeMs: totalTime,
        efficiency: `${Math.round((text.length / totalTime) * 1000)} chars/sec`
      });
      
      return fallbackEmbedding;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const totalTime = Date.now() - startTime;
      
      logger.error('Failed to generate embedding, using fallback', {
        embeddingId,
        error: err.message,
        totalTimeMs: totalTime,
        textLength: text.length
      });
      
      const fallbackEmbedding = this.hashBasedEmbedding(text);
      
      logger.debug('Error fallback embedding generated', {
        embeddingId,
        dimension: fallbackEmbedding.length,
        errorFallbackTimeMs: Date.now() - startTime
      });
      
      return fallbackEmbedding;
    }
  }
  
  /**
   * Deterministic fallback embedding method that's better than random
   * Creates a hash-based embedding that preserves some semantic meaning
   * @param text Text to generate embedding for
   * @returns Vector embedding as number array
   */
  private hashBasedEmbedding(text: string): number[] {
    const startTime = Date.now();
    const embeddingId = Math.random().toString(36).substring(7);
    
    logger.debug('Hash-based embedding generation started', {
      embeddingId,
      textLength: text.length
    });
    
    const normalized = text.toLowerCase().trim();
    const words = normalized.split(/\s+/);
    const embedding = new Array(768).fill(0); // Use 768 to match text-embedding-004 dimensions
    
    logger.debug('Text preprocessing completed', {
      embeddingId,
      originalLength: text.length,
      normalizedLength: normalized.length,
      wordCount: words.length,
      embeddingDimension: embedding.length
    });
    
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
    
    const processingTime = Date.now() - startTime;
    logger.debug('Hash-based embedding completed', {
      embeddingId,
      processingTimeMs: processingTime,
      magnitude,
      nonZeroElements: embedding.filter(val => Math.abs(val) > 0.001).length,
      efficiency: `${Math.round((text.length / processingTime) * 1000)} chars/sec`
    });
    
    return embedding;
  }
}

// Export a singleton instance
// Lazy initialization to ensure environment variables are loaded
let _embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!_embeddingService) {
    _embeddingService = new EmbeddingService();
  }
  return _embeddingService;
}
