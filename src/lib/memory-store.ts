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

/**
 * Convert ISO date string to epoch milliseconds for ChromaDB numeric filtering
 */
function toEpochMs(isoDate?: string): number | undefined {
  if (!isoDate) return undefined;
  const timestamp = Date.parse(isoDate);
  return isNaN(timestamp) ? undefined : timestamp;
}

export class ChromaMemoryStore implements MemoryStore {
  private client!: ChromaClient;
  private collection: any;
  private initialized = false;
  private embeddingService: GoogleEmbeddingService;
  private initializationInProgress = false;
  private initPromise: Promise<void> | null = null;
  
  // Configuration
  private readonly collectionName: string;
  private readonly chromaUrl: string;
  private readonly defaultLimit: number;
  private readonly defaultMinScore: number;

  constructor(config: MemoryStoreConfig = {}) {
    this.collectionName = process.env.CHROMA_COLLECTION || 'mcp_chat_memories';
    this.chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    this.defaultLimit = Number(process.env.RAG_MAX_MEMORIES) || 10;
    this.defaultMinScore = Number(process.env.RAG_MIN_SIMILARITY) || 0.15;
    
    this.embeddingService = getEmbeddingService();
  }

  /**
   * Initialize the ChromaDB connection and collection
   */
  async initialize(): Promise<void> {
    // If already initialized, just return
    if (this.initialized) {
      return;
    }

    // If initialization is in progress, wait for it to complete
    if (this.initializationInProgress) {
      if (this.initPromise) {
        try {
          await this.initPromise;
          return;
        } catch (error) {
          console.log('Previous initialization attempt failed, trying again');
        }
      }
    }

    // Set initialization flag and create a promise
    this.initializationInProgress = true;
    this.initPromise = (async () => {
      try {
        //console.log('Initializing ChromaDB memory store...');
        
        // Initialize ChromaDB client
        this.client = new ChromaClient({
          path: this.chromaUrl,
          fetchOptions: {
            headers: {
              'Content-Type': 'application/json'
            }
          }
        });
        
        // Try to get the existing collection first
        try {
          this.collection = await this.client.getCollection({
            name: this.collectionName
          });
          //console.log(`Using existing collection: ${this.collectionName}`);
        } catch (getError) {
          // Collection doesn't exist or couldn't be accessed, try to create it
          try {
            this.collection = await this.client.createCollection({
              name: this.collectionName
            });
            //console.log(`Created new collection: ${this.collectionName}`);
          } catch (createError: any) {
            // If creation fails because collection already exists, try getting it again
            if (createError.toString().includes('already exists')) {
              console.log(`Collection creation failed - already exists. Retrieving existing collection.`);
              
              // Wait a moment to ensure collection availability
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Try one more time to get the collection
              try {
                this.collection = await this.client.getCollection({
                  name: this.collectionName
                });
                //console.log(`Successfully retrieved existing collection: ${this.collectionName}`);
              } catch (finalError) {
                throw new Error(`Failed to retrieve existing collection: ${finalError}`);
              }
            } else {
              throw createError;
            }
          }
        }
        
        // Test the collection with a count operation
        const initialCount = await this.collection.count();
        //console.log(`ChromaDB connected successfully. Memory count: ${initialCount}`);
        
        this.initialized = true;
      } catch (error) {
        console.error('Failed to initialize ChromaDB memory store:', error);
        this.initialized = false;
        throw error;
      } finally {
        this.initializationInProgress = false;
      }
    })();
    
    // Wait for our initialization to complete
    await this.initPromise;
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
        timestamp: Date.now(), // Store as numeric timestamp
        textLength: text.length
      };

      // Store in ChromaDB
      await this.collection.add({
        ids: [memoryId],
        embeddings: [embedding],
        metadatas: [fullMetadata]
      });
      
      ////console.log(`Memory stored successfully: ${memoryId} (${text.length} chars)`);
      ////console.log(`Debug - Stored embedding dimensions: ${embedding.length}`);
      ////console.log(`Debug - Stored metadata:`, fullMetadata);
      
      // Verify storage by immediate count check
      const currentCount = await this.collection.count();
      ////console.log(`Debug - Collection count after storage: ${currentCount}`);
      
      return memoryId;
    } catch (error) {
      console.error('Failed to store memory in ChromaDB:', error);
      throw error;
    }
  }

  /**
   * List all memories without similarity search (for empty queries)
   */
  private async listAllMemories(limit: number, options: MemorySearchOptions): Promise<MemoryRetrievalResult[]> {
    try {
      // Build where clause for metadata filtering
      let whereClause: any = undefined;
      const conditions: any[] = [];
      
      // Only filter by sessionId if specifically requested
      // This allows for showing ALL memories when no sessionId is provided
      if (options.sessionId && options.sessionId !== 'all') {
        conditions.push({ sessionId: options.sessionId });
      }
      
      // Add time filtering if provided
      const startTimestamp = toEpochMs((options as any).startDate);
      const endTimestamp = toEpochMs((options as any).endDate);

      if (startTimestamp !== undefined || endTimestamp !== undefined) {
        const timeRange: Record<string, number> = {};
        if (startTimestamp !== undefined) {
          timeRange["$gte"] = startTimestamp;
        }
        if (endTimestamp !== undefined) {
          timeRange["$lte"] = endTimestamp;
        }
        conditions.push({ timestamp: timeRange });
      }
      
      // Build final where clause
      if (conditions.length === 1) {
        whereClause = conditions[0];
      } else if (conditions.length > 1) {
        whereClause = { "$and": conditions };
      }
      
      console.log(`Listing all memories with where clause:`, whereClause || 'none');
      
      // Get all memories using ChromaDB's get method without limit (get everything)
      const results = await this.collection.get({
        // Don't apply any limit for "all memories" request
        where: whereClause
      });
      
      console.log(`Retrieved ${results.ids?.length || 0} total memories from ChromaDB`);
      
      // Rest of the memory processing logic
      const memories: MemoryRetrievalResult[] = [];
      
      if (results.ids && results.ids.length > 0) {
        for (let i = 0; i < results.ids.length; i++) {
          const id = results.ids[i];
          const metadata = results.metadatas[i];
          const document = results.documents[i];
            memories.push({
            id,
            text: metadata.text as string, // Use metadata.text instead of document
            score: 1.0, // No similarity score for list all
            metadata: {
              sessionId: metadata.sessionId as string,
              timestamp: metadata.timestamp as number,
              messageType: metadata.messageType as 'user' | 'assistant',
              textLength: metadata.textLength as number
            }
          });
        }
      }
      
      // Sort by timestamp (newest first)
      memories.sort((a, b) => b.metadata.timestamp - a.metadata.timestamp);
      
      // Apply limit AFTER sorting to get most recent memories
      const limitedMemories = memories.slice(0, limit || 100);
      
      console.log(`Listed ${memories.length} total memories, returning ${limitedMemories.length}`);
      return limitedMemories;
    } catch (error) {
      console.error('Failed to list all memories:', error);
      return [];
    }
  }

  /**
   * Retrieve similar memories based on query text
   */  async retrieveMemories(query: string, options: MemorySearchOptions = {}): Promise<MemoryRetrievalResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const limit = options.limit || this.defaultLimit;
    const minScore = options.minScore || this.defaultMinScore;
    
    // Handle empty query by listing all memories
    if (!query || query.trim().length === 0) {
      return this.listAllMemories(limit, options);
    }
    
    try {
      // Preprocess the query to focus on the most relevant part
      const processedQuery = this.preprocessQuery(query);// Generate embedding for the processed query
      const embedding = await this.embeddingService.generateEmbedding(processedQuery);
      
      // Build where clause for metadata filtering
      let whereClause: any = undefined;
      const conditions: any[] = [];
      
      if (options.sessionId) {
        conditions.push({ sessionId: options.sessionId });
      }
      
      // Add time filtering if provided
      const startTimestamp = toEpochMs((options as any).startDate);
      const endTimestamp = toEpochMs((options as any).endDate);

      if (startTimestamp !== undefined || endTimestamp !== undefined) {
        const timeRange: Record<string, number> = {};
        if (startTimestamp !== undefined) {
          timeRange["$gte"] = startTimestamp;
        }
        if (endTimestamp !== undefined) {
          timeRange["$lte"] = endTimestamp;
        }
        conditions.push({ timestamp: timeRange });
      }
      
      // Build final where clause
      if (conditions.length === 1) {
        whereClause = conditions[0];
      } else if (conditions.length > 1) {
        whereClause = { "$and": conditions };
      }
      
      // Query ChromaDB for similar vectors with a higher initial result count
      // to allow for better post-filtering
      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: Math.max(limit * 3, 15), // Get more results for better filtering
        where: whereClause
      });
      
      const memories: MemoryRetrievalResult[] = [];
      
      if (results.ids && results.ids.length > 0 && results.ids[0].length > 0) {
        for (let i = 0; i < results.ids[0].length; i++) {
          const id = results.ids[0][i];
          const metadata = results.metadatas[0][i];
          const distance = results.distances?.[0][i] || 0;
          
          // Convert cosine distance to similarity score (0-1)
          const score = Math.max(0, Math.min(1, 1 - distance));
          
          // Dynamic score threshold - adjust based on query length
          const dynamicMinScore = this.calculateDynamicThreshold(minScore, processedQuery.length);
          
          // Filter by dynamic minimum score
          if (score >= dynamicMinScore) {
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
      
      return sortedMemories;
    } catch (error) {
      console.error('Failed to retrieve memories from ChromaDB:', error);
      return [];
    }
  }

  /**
   * Preprocess query to focus on relevant information
   */
  private preprocessQuery(query: string): string {
    // If query is short enough, use it directly
    if (query.length <= 500) {
      return query;
    }
    
    // For longer queries, try different strategies:
    
    // 1. Extract the last significant chunk (likely most relevant for chat)
    const sentences = query.split(/[.!?]\s+/);
    if (sentences.length > 3) {
      // Take the last 3-5 sentences, which are often the most relevant
      return sentences.slice(-5).join('. ');
    }
    
    // 2. If there are no clear sentence breaks, take the last portion
    return query.slice(-500);
  }

  /**
   * Calculate a dynamic similarity threshold based on query length
   */
  private calculateDynamicThreshold(baseThreshold: number, queryLength: number): number {
    // For longer queries, lower the threshold slightly as exact matches become less likely
    if (queryLength > 1000) {
      return Math.max(0.3, baseThreshold - 0.15);
    } else if (queryLength > 500) {
      return Math.max(0.3, baseThreshold - 0.10);
    } else if (queryLength > 200) {
      return Math.max(0.3, baseThreshold - 0.05);
    }
    
    return baseThreshold;
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
   * Get total memory count with optional filtering
   */
  async getMemoryCount(options: MemorySearchOptions = {}): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // If no filters, use simple count
      if (!options.sessionId && !(options as any).startDate && !(options as any).endDate) {
        const count = await this.collection.count();        return count;
      }      // Build where clause for metadata filtering
      let whereClause: any = undefined;
      const conditions: any[] = [];
      
      if (options.sessionId) {
        conditions.push({ sessionId: options.sessionId });
      }
      
      // Add time filtering if provided
      const startTimestamp = toEpochMs((options as any).startDate);
      const endTimestamp = toEpochMs((options as any).endDate);

      if (startTimestamp !== undefined || endTimestamp !== undefined) {
        const timeRange: Record<string, number> = {};
        if (startTimestamp !== undefined) {
          timeRange["$gte"] = startTimestamp;
        }
        if (endTimestamp !== undefined) {
          timeRange["$lte"] = endTimestamp;
        }
        conditions.push({ timestamp: timeRange });
      }
      
      // Build final where clause
      if (conditions.length === 1) {
        whereClause = conditions[0];
      } else if (conditions.length > 1) {
        whereClause = { "$and": conditions };
      }
      
      const results = await this.collection.get({
        where: whereClause
      });
      return results.ids?.length || 0;
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
    try {      const testText = `Memory system test at ${new Date().toISOString()}`;
      const testMetadata: MemoryMetadata = {
        sessionId: 'test-session',
        timestamp: Date.now(), // Use numeric timestamp
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
      await this.collection.delete({
        ids: [id]
      });
      
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
      await this.collection.delete({
        ids: ids
      });
      
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
      // Get all IDs first
      const results = await this.collection.get();
      if (results.ids && results.ids.length > 0) {
        await this.collection.delete({
          ids: results.ids
        });
      }
      
      return true;
    } catch (error) {
      console.error('Failed to clear all memories:', error);
      return false;
    }
  }

  /**
   * Cleanup connections and reset state
   */
  async cleanup(): Promise<void> {
    // Reset initialization state
    this.initialized = false;
    this.initializationInProgress = false;
    this.initPromise = null;
  }

  /**
   * Migrate existing ISO string timestamps to numeric timestamps
   */
  async migrateTimestamps(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    console.log('Starting timestamp migration from ISO strings to numeric values');
    
    const BATCH_SIZE = 256;
    let offset = 0;
    let totalProcessed = 0;
    let migrated = 0;
    
    try {
      while (true) {
        // Get batch of records
        const batch = await this.collection.get({
          limit: BATCH_SIZE,
          offset: offset,
          include: ["metadatas", "documents", "embeddings"]
        });
        
        if (!batch.ids || batch.ids.length === 0) {
          break; // No more records
        }
        
        const needsUpdate: number[] = [];
        const newMetadatas: any[] = [];
        const idsToUpdate: string[] = [];
        const embeddingsToUpdate: number[][] = [];
        const documentsToUpdate: string[] = [];
          // Check which records need timestamp migration
        batch.ids.forEach((id: string, idx: number) => {
          const metadata = batch.metadatas[idx];
          
          if (typeof metadata.timestamp === 'string') {
            needsUpdate.push(idx);
            const newMetadata = { ...metadata };
            const timestamp = Date.parse(metadata.timestamp);
            newMetadata.timestamp = !isNaN(timestamp) ? timestamp : Date.now();
            
            idsToUpdate.push(id);
            newMetadatas.push(newMetadata);
            embeddingsToUpdate.push(batch.embeddings[idx]);
            documentsToUpdate.push(batch.documents[idx]);
          }
        });
        
        // Update records that need migration
        if (needsUpdate.length > 0) {
          await this.collection.upsert({
            ids: idsToUpdate,
            embeddings: embeddingsToUpdate,
            documents: documentsToUpdate,
            metadatas: newMetadatas
          });
          
          migrated += needsUpdate.length;
        }
        
        totalProcessed += batch.ids.length;
        offset += BATCH_SIZE;
        
        console.log(`Processed ${totalProcessed} records, migrated ${migrated} records with string timestamps`);
      }
      
      console.log(`Timestamp migration complete. Total records processed: ${totalProcessed}, migrated: ${migrated}`);
      return;
    } catch (error) {
      console.error('Error during timestamp migration:', error);
      throw error;
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
