/**
 * ChromaDB-based memory store for the lean MCP chat client
 * Simplified version of Skynet Agent's memory implementation
 */

import { ChromaClient } from 'chromadb';
import type { 
  MemoryStore, 
  Memory, 
  MemoryMetadata, 
  MemoryRetrievalResult, 
  MemorySearchOptions,
  MemoryStoreConfig 
} from '../types/memory';
import { getEmbeddingService, GoogleEmbeddingService } from './embeddings';

export class ChromaMemoryStore implements MemoryStore {
  private client!: ChromaClient;
  private collection: any;
  private initialized = false;
  private embeddingService: GoogleEmbeddingService;
  
  // Configuration
  private readonly collectionName: string;
  private readonly chromaUrl: string;
  private readonly defaultLimit: number;
  private readonly defaultMinScore: number;

  constructor(config: MemoryStoreConfig = {}) {
    this.collectionName = config.chromaCollection || process.env.CHROMA_COLLECTION || 'mcp_chat_memories';
    this.chromaUrl = config.chromaUrl || process.env.CHROMA_URL || 'http://localhost:8000';
    this.defaultLimit = config.defaultLimit || 3;
    this.defaultMinScore = config.defaultMinScore || 0.5;
    
    this.embeddingService = getEmbeddingService();
    
    console.log('ChromaMemoryStore initialized', { 
      url: this.chromaUrl,
      collection: this.collectionName 
    });
  }

  /**
   * Initialize the ChromaDB connection and collection
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing ChromaDB memory store...');
      
      // Initialize ChromaDB client
      this.client = new ChromaClient({
        path: this.chromaUrl,
        fetchOptions: {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      });
      
      // Get or create collection
      try {
        this.collection = await this.client.getCollection({
          name: this.collectionName
        });
        console.log(`Using existing collection: ${this.collectionName}`);
      } catch (getError) {
        this.collection = await this.client.createCollection({
          name: this.collectionName
        });
        console.log(`Created new collection: ${this.collectionName}`);
      }
      
      // Test the collection
      const initialCount = await this.collection.count();
      console.log(`ChromaDB connected successfully. Memory count: ${initialCount}`);
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize ChromaDB memory store:', error);
      throw error;
    }
  }

  /**
   * Store a new memory in ChromaDB
   */
  async storeMemory(text: string, metadata: MemoryMetadata, id?: string): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Generate embedding for the text
      const embedding = await this.embeddingService.generateEmbedding(text);
      
      // Use provided ID or generate a unique one
      const memoryId = id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      // Prepare metadata for storage
      const fullMetadata = {
        ...metadata,
        text,
        timestamp: new Date().toISOString(),
        textLength: text.length
      };

      // Store in ChromaDB
      await this.collection.add({
        ids: [memoryId],
        embeddings: [embedding],
        metadatas: [fullMetadata]
      });
      
      console.log(`Memory stored successfully: ${memoryId} (${text.length} chars)`);
      console.log(`Debug - Stored embedding dimensions: ${embedding.length}`);
      console.log(`Debug - Stored metadata:`, fullMetadata);
      
      // Verify storage by immediate count check
      const currentCount = await this.collection.count();
      console.log(`Debug - Collection count after storage: ${currentCount}`);
      
      return memoryId;
    } catch (error) {
      console.error('Failed to store memory in ChromaDB:', error);
      throw error;
    }
  }

  /**
   * Retrieve similar memories based on query text
   */
  async retrieveMemories(query: string, options: MemorySearchOptions = {}): Promise<MemoryRetrievalResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const limit = options.limit || this.defaultLimit;
    const minScore = options.minScore || this.defaultMinScore;    try {
      // Generate embedding for the query
      const embedding = await this.embeddingService.generateEmbedding(query);
      
      console.log(`Debug - Query embedding dimensions: ${embedding.length}`);
      console.log(`Debug - Collection count before query: ${await this.collection.count()}`);
      
      // Query ChromaDB for similar vectors
      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: Math.max(limit, 10) // Get more results to filter by score
      });
      
      console.log(`Debug - Raw ChromaDB results:`, {
        idsLength: results.ids?.[0]?.length || 0,
        metadatasLength: results.metadatas?.[0]?.length || 0,
        distancesLength: results.distances?.[0]?.length || 0,
        firstDistance: results.distances?.[0]?.[0],
        firstMetadata: results.metadatas?.[0]?.[0]
      });
      
      const memories: MemoryRetrievalResult[] = [];
      
      if (results.ids && results.ids.length > 0 && results.ids[0].length > 0) {        for (let i = 0; i < results.ids[0].length; i++) {
          const id = results.ids[0][i];
          const metadata = results.metadatas[0][i];
          const distance = results.distances?.[0][i] || 0;
          
          // Convert cosine distance to similarity score (0-1)
          // ChromaDB uses cosine distance by default, where similarity = 1 - distance
          const score = Math.max(0, Math.min(1, 1 - distance));
          
          // Filter by minimum score
          if (score >= minScore) {
            // Apply session filter if specified
            if (options.sessionId && metadata.sessionId !== options.sessionId) {
              continue;
            }
            
            // Apply message type filter if specified
            if (options.messageType && options.messageType !== 'both' && metadata.messageType !== options.messageType) {
              continue;
            }
            
            memories.push({
              id,
              text: metadata.text,
              score,
              metadata: {
                sessionId: metadata.sessionId,
                timestamp: metadata.timestamp,
                messageType: metadata.messageType,
                textLength: metadata.textLength
              }
            });
          }
        }
      }
      
      // Sort by score and limit results
      const sortedMemories = memories
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      console.log(`Retrieved ${sortedMemories.length} memories for query (${query.slice(0, 50)}...)`);
      
      return sortedMemories;
    } catch (error) {
      console.error('Failed to retrieve memories from ChromaDB:', error);
      return [];
    }
  }

  /**
   * Get a specific memory by ID
   */
  async getMemoryById(id: string): Promise<MemoryRetrievalResult | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const results = await this.collection.get({
        ids: [id]
      });

      if (results.ids && results.ids.length > 0 && results.metadatas && results.metadatas.length > 0) {
        const metadata = results.metadatas[0];
        return {
          id: results.ids[0],
          text: metadata.text,
          score: 1.0, // Perfect match since we're getting by exact ID
          metadata: {
            sessionId: metadata.sessionId,
            timestamp: metadata.timestamp,
            messageType: metadata.messageType,
            textLength: metadata.textLength
          }
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get memory by ID:', error);
      return null;
    }
  }

  /**
   * Get total memory count
   */
  async getMemoryCount(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const count = await this.collection.count();
      return count;
    } catch (error) {
      console.error('Failed to get memory count from ChromaDB:', error);
      return 0;
    }
  }

  /**
   * Health check for the memory store
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Simple check - get the count
      await this.collection.count();
      return true;
    } catch (error) {
      console.error('ChromaDB health check failed:', error);
      return false;
    }
  }

  /**
   * Test the memory system with a simple store/retrieve cycle
   */
  async testMemorySystem(): Promise<boolean> {
    try {
      const testText = `Memory system test at ${new Date().toISOString()}`;
      const testMetadata: MemoryMetadata = {
        sessionId: 'test-session',
        timestamp: new Date().toISOString(),
        messageType: 'user',
        textLength: testText.length
      };
      
      const id = await this.storeMemory(testText, testMetadata);
      
      // Short delay to ensure ChromaDB processes the storage
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const results = await this.retrieveMemories(testText, { limit: 1 });
        return results.length > 0 && results[0].id === id;
    } catch (error) {
      console.error('Memory system test failed:', error);
      return false;
    }
  }

  /**
   * Delete a specific memory by ID
   */
  async deleteMemory(id: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      console.log(`Deleting memory with ID: ${id}`);
      
      await this.collection.delete({
        ids: [id]
      });
      
      console.log(`Successfully deleted memory: ${id}`);
      return true;
    } catch (error) {
      console.error('Failed to delete memory:', error);
      return false;
    }
  }

  /**
   * Delete multiple memories by IDs
   */
  async deleteMemories(ids: string[]): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      console.log(`Deleting ${ids.length} memories:`, ids);
      
      await this.collection.delete({
        ids: ids
      });
      
      console.log(`Successfully deleted ${ids.length} memories`);
      return true;
    } catch (error) {
      console.error('Failed to delete memories:', error);
      return false;
    }
  }

  /**
   * Clear all memories (be careful!)
   */
  async clearAllMemories(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      console.log('Clearing all memories from collection');
      
      // Get all IDs first
      const results = await this.collection.get();
      if (results.ids && results.ids.length > 0) {
        await this.collection.delete({
          ids: results.ids
        });
        console.log(`Successfully cleared ${results.ids.length} memories`);
      } else {
        console.log('No memories to clear');
      }
      
      return true;
    } catch (error) {
      console.error('Failed to clear all memories:', error);
      return false;
    }
  }
}

// Export singleton instance
let memoryStore: ChromaMemoryStore | null = null;

export function getMemoryStore(config?: MemoryStoreConfig): ChromaMemoryStore {
  if (!memoryStore) {
    memoryStore = new ChromaMemoryStore(config);
  }
  return memoryStore;
}
