/**
 * Long-term memory implementation for the Skynet Agent
 * Provides vector storage and retrieval of memories
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { WorkflowError } from '../utils/errorHandler';

const logger = createLogger('memory');

// Memory storage directory
const MEMORY_DIR = process.env.MEMORY_DIR || path.join(process.cwd(), 'data', 'memory');

// Simple in-memory vector store for MVP
// In a production system, this would be replaced with a proper vector database
class SimpleVectorStore {
  private memories: Array<{
    id: string;
    text: string;
    embedding: number[];
    metadata: Record<string, any>;
    timestamp: string;
  }> = [];
  
  constructor() {}
  
  // Add a memory to the store
  add(id: string, text: string, embedding: number[], metadata: Record<string, any> = {}): void {
    this.memories.push({
      id,
      text,
      embedding,
      metadata,
      timestamp: new Date().toISOString()
    });
  }
  
  // Save the store to disk
  save(filePath: string): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(this.memories, null, 2));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to store memory with ID: ${filePath}`, err);
    }
  }
  
  // Load the store from disk
  load(filePath: string): void {
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf8');
        this.memories = JSON.parse(data);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Failed to load memories from ${filePath}`, err);
      }
    }
  }
  
  // Search for similar memories using cosine similarity
  search(embedding: number[], limit: number = 5): Array<{id: string; text: string; score: number; metadata: Record<string, any>}> {
    try {
      // Calculate cosine similarity for each memory
      const results = this.memories.map(memory => {
        const similarity = this.cosineSimilarity(embedding, memory.embedding);
        return {
          id: memory.id,
          text: memory.text,
          score: similarity,
          metadata: memory.metadata
        };
      });
      
      // Sort by similarity score (descending)
      results.sort((a, b) => b.score - a.score);
      
      // Return top results
      return results.slice(0, limit);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to search memory', err);
      return [];
    }
  }
  
  // Get all memories
  getAll(): Array<{id: string; text: string; metadata: Record<string, any>}> {
    return this.memories.map(memory => ({
      id: memory.id,
      text: memory.text,
      metadata: memory.metadata
    }));
  }
  
  // Get memory count
  getCount(): number {
    return this.memories.length;
  }
  
  // Helper: Calculate cosine similarity between two vectors
  private cosineSimilarity(a: number[], b: number[]): number {
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

// Memory Manager class
class MemoryManager {
  private vectorStore: SimpleVectorStore;
  private memoryFilePath: string;
  private initialized: boolean = false;
  
  constructor() {
    this.vectorStore = new SimpleVectorStore();
    this.memoryFilePath = path.join(MEMORY_DIR, 'memories.json');
  }
  
  // Initialize the memory system
  async initialize(): Promise<void> {
    try {
      // Create memory directory if it doesn't exist
      if (!fs.existsSync(MEMORY_DIR)) {
        fs.mkdirSync(MEMORY_DIR, { recursive: true });
      }
      
      // Load existing memories if available
      if (fs.existsSync(this.memoryFilePath)) {
        this.vectorStore.load(this.memoryFilePath);
        logger.info(`Loaded ${this.vectorStore.getCount()} memories from storage`);
      } else {
        logger.info('No existing memories found, starting with empty memory');
      }
      
      this.initialized = true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize memory system', err);
      throw err;
    }
  }
  
  // Store a new memory
  async storeMemory(text: string, metadata: Record<string, any> = {}): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // Generate a simple ID
      const id = `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      
      // In a real implementation, we would generate embeddings using an embedding model
      // For this MVP, we'll use a simple mock embedding (random vector)
      const mockEmbedding = Array(128).fill(0).map(() => Math.random() - 0.5);
      
      // Store the memory
      this.vectorStore.add(id, text, mockEmbedding, metadata);
      
      // Save to disk
      this.vectorStore.save(this.memoryFilePath);
      
      logger.info(`Stored new memory with ID: ${id}`, { textLength: text.length });
      
      return id;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to store memory', err);
      throw err;
    }
  }
  
  // Retrieve relevant memories based on a query
  async retrieveMemories(query: string, limit: number = 5): Promise<Array<{id: string; text: string; score: number; metadata: Record<string, any>}>> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      // In a real implementation, we would generate query embedding using an embedding model
      // For this MVP, we'll use a simple mock embedding (random vector)
      const mockQueryEmbedding = Array(128).fill(0).map(() => Math.random() - 0.5);
      
      // Search for similar memories
      const results = this.vectorStore.search(mockQueryEmbedding, limit);
      
      logger.info(`Retrieved ${results.length} memories for query`, { 
        queryLength: query.length,
        topScore: results.length > 0 ? results[0].score : 0
      });
      
      return results;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to retrieve memories', err);
      return [];
    }
  }
  
  // Get all memories (for debugging/admin purposes)
  async getAllMemories(): Promise<Array<{id: string; text: string; metadata: Record<string, any>}>> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      return this.vectorStore.getAll();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to get all memories', err);
      return [];
    }
  }
  
  // Get memory count
  async getMemoryCount(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    try {
      return this.vectorStore.getCount();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to get memory count', err);
      return 0;
    }
  }
}

// Export a singleton instance
export const memoryManager = new MemoryManager();
