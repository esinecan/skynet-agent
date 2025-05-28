/**
 * ChromaDB-based memory implementation for Skynet Agent
 * Provides local vector storage and retrieval
 */

import { ChromaClient } from 'chromadb';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';
import { embeddingService } from '../utils/embeddings';
import { incrementMetric } from '../utils/health';

const logger = createLogger('chroma-memory');

// Memory interface for consistency
interface Memory {
  id: string;
  text: string;
  metadata: Record<string, any>;
  timestamp: string;
}

interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, any>;
}

export class ChromaMemoryManager {
  private client!: ChromaClient;
  private initialized = false;
  private collectionName: string;
  private dataPath: string;
  private collection: any;

  constructor() {
    this.collectionName = process.env.CHROMA_COLLECTION || 'skynet_memories';
    this.dataPath = process.env.CHROMA_PATH || path.join(process.cwd(), 'data', 'chroma');
    
    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }
    
    logger.info('ChromaDB Memory Manager initialized', { 
      path: this.dataPath,
      collection: this.collectionName 
    });
  }

  /**
   * Initialize the ChromaDB connection and collection
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing ChromaDB memory manager...');
      logger.debug('ChromaDB configuration', {
        serverUrl: "http://localhost:8000",
        collectionName: this.collectionName,
        dataPath: this.dataPath
      });
      
      // Initialize ChromaDB client - use compatibility mode for older server versions
      this.client = new ChromaClient({
        path: "http://localhost:8000", // Connect to local Docker instance
        // Add compatibility settings for older ChromaDB server versions
        fetchOptions: {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      });
      
      logger.debug('ChromaDB client created, attempting connection...');
      
      // Create collection with minimal configuration to avoid compatibility issues
      try {
        // Try to get existing collection first
        logger.debug('Attempting to get existing collection', { name: this.collectionName });
        this.collection = await this.client.getCollection({
          name: this.collectionName
        });
        logger.debug('Successfully retrieved existing collection', { name: this.collectionName });
        logger.info(`Using existing collection: ${this.collectionName}`);
      } catch (getError) {
        // Collection doesn't exist, create it with minimal config
        logger.debug('Collection not found, creating new collection', { 
          name: this.collectionName,
          error: getError instanceof Error ? getError.message : String(getError)
        });
        this.collection = await this.client.createCollection({
          name: this.collectionName
        });
        logger.debug('Successfully created new collection', { name: this.collectionName });
        logger.info(`Created new collection: ${this.collectionName}`);
      }
      
      // Test the collection with a count operation
      const initialCount = await this.collection.count();
      logger.debug('Collection accessible, current memory count', { 
        count: initialCount,
        collectionName: this.collectionName 
      });
      
      this.initialized = true;
      logger.info('Connected to ChromaDB successfully');
      logger.debug('ChromaDB memory manager fully initialized', {
        initialized: this.initialized,
        collectionName: this.collectionName,
        memoryCount: initialCount
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize ChromaDB memory manager', err);
      logger.debug('ChromaDB initialization failure details', {
        errorMessage: err.message,
        errorStack: err.stack,
        collectionName: this.collectionName,
        serverUrl: "http://localhost:8000"
      });
      throw err;
    }
  }

  /**
   * Store a new memory in ChromaDB
   */
  async storeMemory(text: string, metadata: Record<string, any> = {}): Promise<string> {
    if (!this.initialized) {
      logger.debug('Memory manager not initialized, initializing now...');
      await this.initialize();
    }

    try {
      const truncatedText = text.length > 80 ? `${text.substring(0, 80)}...` : text;
      logger.debug('Starting memory storage process', { 
        textLength: text.length, 
        text: truncatedText,
        metadataKeys: Object.keys(metadata),
        hasMetadata: Object.keys(metadata).length > 0
      });
      
      // Generate embedding for the text
      logger.debug('Generating embedding for memory text...');
      const embeddingStartTime = Date.now();
      const embedding = await embeddingService.generateEmbedding(text);
      const embeddingDuration = Date.now() - embeddingStartTime;
      
      logger.debug('Embedding generated successfully', {
        embeddingDimensions: embedding.length,
        generationTimeMs: embeddingDuration,
        firstFewValues: embedding.slice(0, 5)
      });
      
      // Generate a unique ID
      const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      logger.debug('Generated memory ID', { id, timestamp: Date.now() });
      
      // Prepare metadata for storage
      const fullMetadata = {
        ...metadata,
        text,
        timestamp: new Date().toISOString()
      };
      
      logger.debug('Prepared metadata for storage', {
        totalMetadataKeys: Object.keys(fullMetadata).length,
        hasText: !!fullMetadata.text,
        hasTimestamp: !!fullMetadata.timestamp
      });
      
      // Store in ChromaDB
      logger.debug('Storing memory in ChromaDB...', { collectionName: this.collectionName });
      const storeStartTime = Date.now();
      
      await this.collection.add({
        ids: [id],
        embeddings: [embedding],
        metadatas: [fullMetadata]
      });
      
      const storeDuration = Date.now() - storeStartTime;
      
      logger.info('Memory stored successfully', { id, textLength: text.length });
      logger.debug('Memory storage completed', {
        id,
        textLength: text.length,
        embeddingDimensions: embedding.length,
        storageTimeMs: storeDuration,
        totalTimeMs: embeddingDuration + storeDuration
      });
      
      incrementMetric('memoriesStored');
      
      return id;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to store memory in ChromaDB', err);
      logger.debug('Memory storage failure details', {
        errorMessage: err.message,
        errorStack: err.stack,
        textLength: text.length,
        metadataKeys: Object.keys(metadata),
        collectionInitialized: this.initialized
      });
      throw err;
    }
  }

  /**
   * Retrieve similar memories based on query text
   */
  async retrieveMemories(query: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.initialized) {
      logger.debug('Memory manager not initialized for retrieval, initializing now...');
      await this.initialize();
    }

    try {
      const truncatedQuery = query.length > 50 ? `${query.substring(0, 50)}...` : query;
      logger.debug('Starting memory retrieval process', { 
        queryLength: query.length,
        query: truncatedQuery,
        limit,
        collectionName: this.collectionName
      });
      
      // Generate embedding for the query
      logger.debug('Generating embedding for query...');
      const embeddingStartTime = Date.now();
      const embedding = await embeddingService.generateEmbedding(query);
      const embeddingDuration = Date.now() - embeddingStartTime;
      
      logger.debug('Query embedding generated', {
        embeddingDimensions: embedding.length,
        generationTimeMs: embeddingDuration,
        firstFewValues: embedding.slice(0, 5)
      });
      
      // Query ChromaDB for similar vectors
      logger.debug('Querying ChromaDB for similar memories...', {
        nResults: limit,
        collectionName: this.collectionName
      });
      
      const queryStartTime = Date.now();
      const results = await this.collection.query({
        queryEmbeddings: [embedding],
        nResults: limit
      });
      const queryDuration = Date.now() - queryStartTime;
      
      logger.debug('ChromaDB query completed', {
        queryTimeMs: queryDuration,
        resultsStructure: {
          hasIds: !!results.ids,
          hasMetadatas: !!results.metadatas,
          hasDistances: !!results.distances,
          idsLength: results.ids?.[0]?.length || 0
        }
      });
      
      // Convert results to SearchResult format
      const memories: SearchResult[] = [];
      
      if (results.ids && results.ids.length > 0 && results.ids[0].length > 0) {
        logger.debug('Processing query results', {
          resultCount: results.ids[0].length,
          hasDistances: !!results.distances?.[0]
        });
        
        for (let i = 0; i < results.ids[0].length; i++) {
          const id = results.ids[0][i];
          const metadata = results.metadatas[0][i];
          const distance = results.distances?.[0][i] || 0;
          // ChromaDB distances are L2 distance - convert to similarity score (0-1)
          const score = 1 / (1 + distance);
          
          logger.debug('Processing memory result', {
            index: i,
            id,
            distance,
            score: score.toFixed(4),
            hasText: !!metadata.text,
            textLength: metadata.text?.length || 0
          });
          
          memories.push({
            id,
            text: metadata.text,
            score,
            metadata: {
              ...metadata,
              text: undefined // Remove duplicate text field
            }
          });
        }
        
        // Log score distribution for debugging
        const scores = memories.map(m => m.score);
        logger.debug('Memory retrieval scores', {
          topScore: Math.max(...scores).toFixed(4),
          bottomScore: Math.min(...scores).toFixed(4),
          averageScore: (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4),
          scoreDistribution: scores.map(s => s.toFixed(3))
        });
      } else {
        logger.debug('No memories found in query results', {
          resultsStructure: {
            hasIds: !!results.ids,
            idsArrayLength: results.ids?.length || 0,
            firstIdsLength: results.ids?.[0]?.length || 0
          }
        });
      }
      
      logger.info(`Retrieved ${memories.length} memories`, {
        queryLength: query.length,
        topScore: memories.length > 0 ? memories[0].score : 0
      });
      
      logger.debug('Memory retrieval completed', {
        totalTimeMs: embeddingDuration + queryDuration,
        embeddingTimeMs: embeddingDuration,
        queryTimeMs: queryDuration,
        memoriesFound: memories.length,
        query: truncatedQuery
      });
      
      incrementMetric('memoriesRetrieved');
      return memories;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to retrieve memories from ChromaDB', err);
      logger.debug('Memory retrieval failure details', {
        errorMessage: err.message,
        errorStack: err.stack,
        queryLength: query.length,
        limit,
        collectionInitialized: this.initialized
      });
      return [];
    }
  }

  /**
   * Get all memories
   */
  async getAllMemories(): Promise<Memory[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const results = await this.collection.get();
      
      const memories: Memory[] = [];
      
      if (results.ids && results.ids.length > 0) {
        for (let i = 0; i < results.ids.length; i++) {
          const id = results.ids[i];
          const metadata = results.metadatas[i];
          
          memories.push({
            id,
            text: metadata.text,
            metadata: {
              ...metadata,
              text: undefined
            },
            timestamp: metadata.timestamp || new Date().toISOString()
          });
        }
      }
      
      logger.info(`Retrieved ${memories.length} total memories`);
      return memories;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to get all memories from ChromaDB', err);
      return [];
    }
  }

  /**
   * Get memory count
   */
  async getMemoryCount(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const count = await this.collection.count();
      logger.info(`ChromaDB collection contains ${count} memories`);
      return count;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to get memory count from ChromaDB', err);
      return 0;
    }
  }

  /**
   * Health check
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
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('ChromaDB health check failed', err);
      return false;
    }
  }

  /**
   * Test memory system
   */
  async testMemorySystem(): Promise<boolean> {
    try {
      const testText = `Memory system test at ${new Date().toISOString()}`;
      const id = await this.storeMemory(testText, { type: 'test' });
      
      // Short delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const results = await this.retrieveMemories(testText, 1);
      
      return results.length > 0;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Memory system test failed', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
}

// Export singleton instance
export const chromaMemoryManager = new ChromaMemoryManager();
