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

// === Conscious Memory Types ===

export interface ConsciousMemory {
  id: string;
  content: string;
  tags: string[];
  importance: number; // 1-10 scale
  source: 'explicit' | 'suggested' | 'derived';
  context?: string; // Surrounding conversation context
  metadata: ConsciousMemoryMetadata;
  createdAt: string;
  updatedAt?: string;
}

export interface ConsciousMemoryMetadata extends MemoryMetadata {
  memoryType: 'conscious';
  tags: string[];
  importance: number;
  source: 'explicit' | 'suggested' | 'derived';
  relatedMemoryIds?: string[];
  context?: string;
}

export interface ConsciousMemorySearchOptions extends MemorySearchOptions {
  tags?: string[];
  importanceMin?: number;
  importanceMax?: number;
  source?: 'explicit' | 'suggested' | 'derived';
  includeRelated?: boolean;
  consciousOnly?: boolean; // If true, only search explicit conscious memories
}

export interface ConsciousMemorySearchResult extends MemoryRetrievalResult {
  tags: string[];
  importance: number;
  source: 'explicit' | 'suggested' | 'derived';
  context?: string;
  relatedMemoryIds?: string[];
}

export interface MemorySaveRequest {
  content: string;
  tags?: string[];
  importance?: number;
  source?: 'explicit' | 'suggested' | 'derived';
  context?: string;
  sessionId?: string;
}

export interface MemoryUpdateRequest {
  id: string;
  content?: string;
  tags?: string[];
  importance?: number;
  context?: string;
}

export interface ConsciousMemoryStats {
  totalConsciousMemories: number;
  tagCount: number;
  averageImportance: number;
  sourceBreakdown: Record<string, number>;
}

export interface ConsciousMemoryService {
  initialize(): Promise<void>;
  saveMemory(request: MemorySaveRequest): Promise<string>;
  searchMemories(query: string, options?: ConsciousMemorySearchOptions): Promise<ConsciousMemorySearchResult[]>;
  updateMemory(request: MemoryUpdateRequest): Promise<boolean>;
  deleteMemory(id: string): Promise<boolean>;
  deleteMultipleMemories(ids: string[]): Promise<boolean>;
  clearAllMemories(): Promise<boolean>;
  getAllTags(): Promise<string[]>;
  getRelatedMemories(id: string, limit?: number): Promise<ConsciousMemorySearchResult[]>;
  getStats(): Promise<ConsciousMemoryStats>;
  healthCheck(): Promise<boolean>;
  testMemorySystem(): Promise<boolean>;
}
