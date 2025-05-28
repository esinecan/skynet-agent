  /**
 * Long-term memory implementation for the Skynet Agent
 * Provides vector storage and retrieval of memories using ChromaDB
 */

import { createLogger } from '../utils/logger';
import { chromaMemoryManager } from './chroma';

const logger = createLogger('memory');

// Re-export the ChromaDB memory manager as the main memory interface
export const memoryManager = chromaMemoryManager;

// Keep the interface compatible with existing code
export class MemoryManager {
  /**
   * Initialize the memory system
   */
  async initialize(): Promise<void> {
    return await memoryManager.initialize();
  }
  
  /**
   * Store a new memory
   */
  async storeMemory(text: string, metadata: Record<string, any> = {}): Promise<string> {
    return await memoryManager.storeMemory(text, metadata);
  }
  
  /**
   * Retrieve relevant memories based on a query
   */
  async retrieveMemories(query: string, limit: number = 5): Promise<Array<{id: string; text: string; score: number; metadata: Record<string, any>}>> {
    return await memoryManager.retrieveMemories(query, limit);
  }
  
  /**
   * Get all memories (for debugging/admin purposes)
   */
  async getAllMemories(): Promise<Array<{id: string; text: string; metadata: Record<string, any>}>> {
    const memories = await memoryManager.getAllMemories();
    return memories.map(memory => ({
      id: memory.id,
      text: memory.text,
      metadata: memory.metadata
    }));
  }
  
  /**
   * Get memory count
   */
  async getMemoryCount(): Promise<number> {
    return await memoryManager.getMemoryCount();
  }

  /**
   * Health check for memory system
   */
  async healthCheck(): Promise<boolean> {
    return await memoryManager.healthCheck();
  }
}

// For backwards compatibility, also export as singleton
export const legacyMemoryManager = new MemoryManager();
