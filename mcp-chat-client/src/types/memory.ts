/**
 * Type definitions for the RAG memory system
 */

export interface Memory {
  id: string;
  text: string;
  embedding: number[];
  metadata: MemoryMetadata;
  timestamp: string;
}

export interface MemoryMetadata {
  sessionId: string;
  timestamp: string;
  messageType: 'user' | 'assistant';
  textLength: number;
  [key: string]: any; // Allow additional metadata
}

export interface MemoryRetrievalResult {
  id: string;
  text: string;
  score: number;
  metadata: MemoryMetadata;
}

export interface MemorySearchOptions {
  limit?: number;
  sessionId?: string;
  minScore?: number;
  messageType?: 'user' | 'assistant' | 'both';
}

export interface MemoryStoreConfig {
  chromaUrl?: string;
  chromaCollection?: string;
  defaultLimit?: number;
  defaultMinScore?: number;
}

export interface EmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
  getDimensions(): number;
  isReady(): boolean;
}

export interface MemoryStore {
  initialize(): Promise<void>;
  storeMemory(text: string, metadata: MemoryMetadata): Promise<string>;
  retrieveMemories(query: string, options?: MemorySearchOptions): Promise<MemoryRetrievalResult[]>;
  getMemoryCount(): Promise<number>;
  healthCheck(): Promise<boolean>;
}
