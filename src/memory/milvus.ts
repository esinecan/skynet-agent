/**
 * Milvus-based long-term memory implementation for the Skynet Agent
 * Provides professional vector storage and retrieval using Milvus vector database
 */

import { MilvusClient, DataType, MetricType, IndexType } from '@zilliz/milvus2-sdk-node';
import { createLogger } from '../utils/logger';
import { embeddingService } from '../utils/embeddings';

const logger = createLogger('milvus-memory');

// Milvus configuration
const MILVUS_CONFIG = {
  address: process.env.MILVUS_ADDRESS || 'localhost:19530',
  username: process.env.MILVUS_USERNAME || '',
  password: process.env.MILVUS_PASSWORD || '',
  collection_name: process.env.MILVUS_COLLECTION || 'skynet_memories',
  dimension: 384, // Standard embedding dimension
  index_file_size: 1024,
  metric_type: MetricType.L2,
  index_type: IndexType.HNSW,
  index_params: {
    M: 16,
    efConstruction: 200,
  },
  search_params: {
    ef: 100,
  },
};

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

export class MilvusMemoryManager {
  private client: MilvusClient;
  private initialized: boolean = false;
  private collectionName: string;

  constructor() {
    this.collectionName = MILVUS_CONFIG.collection_name;
    this.client = new MilvusClient({
      address: MILVUS_CONFIG.address,
      username: MILVUS_CONFIG.username,
      password: MILVUS_CONFIG.password,
    });
    
    logger.info('Milvus Memory Manager initialized', { 
      address: MILVUS_CONFIG.address,
      collection: this.collectionName 
    });
  }

  /**
   * Initialize the Milvus connection and create collection if needed
   */
  async initialize(): Promise<void> {
    try {
      // Wait for client connection
      await this.client.connectPromise;
      logger.info('Connected to Milvus successfully');

      // Check if collection exists
      const hasCollection = await this.client.hasCollection({
        collection_name: this.collectionName,
      });

      if (!hasCollection.value) {
        logger.info(`Collection ${this.collectionName} does not exist, creating...`);
        await this.createCollection();
      } else {
        logger.info(`Collection ${this.collectionName} already exists`);
      }

      // Load collection into memory for search
      await this.loadCollection();
      
      this.initialized = true;
      logger.info('Milvus Memory Manager initialized successfully');

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to initialize Milvus Memory Manager', err);
      throw err;
    }
  }

  /**
   * Create the memories collection with proper schema
   */
  private async createCollection(): Promise<void> {
    try {
      const schema = [
        {
          name: 'id',
          description: 'Memory ID',
          data_type: DataType.VarChar,
          max_length: 100,
          is_primary_key: true,
        },
        {
          name: 'text',
          description: 'Memory text content',
          data_type: DataType.VarChar,
          max_length: 65535,
        },
        {
          name: 'embedding',
          description: 'Text embedding vector',
          data_type: DataType.FloatVector,
          dim: MILVUS_CONFIG.dimension,
        },
        {
          name: 'metadata',
          description: 'JSON metadata string',
          data_type: DataType.VarChar,
          max_length: 10000,
        },
        {
          name: 'timestamp',
          description: 'Creation timestamp',
          data_type: DataType.VarChar,
          max_length: 50,
        },
      ];

      await this.client.createCollection({
        collection_name: this.collectionName,
        fields: schema,
        enable_dynamic_field: false,
      });

      logger.info(`Collection ${this.collectionName} created successfully`);

      // Create index for efficient search
      await this.createIndex();

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to create collection', err);
      throw err;
    }
  }

  /**
   * Create vector index for efficient similarity search
   */
  private async createIndex(): Promise<void> {
    try {
      await this.client.createIndex({
        collection_name: this.collectionName,
        field_name: 'embedding',
        index_name: 'embedding_index',
        index_type: MILVUS_CONFIG.index_type,
        metric_type: MILVUS_CONFIG.metric_type,
        params: MILVUS_CONFIG.index_params,
      });

      logger.info('Vector index created successfully');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to create vector index', err);
      throw err;
    }
  }

  /**
   * Load collection into memory for search operations
   */
  private async loadCollection(): Promise<void> {
    try {
      await this.client.loadCollection({
        collection_name: this.collectionName,
      });
      
      logger.info(`Collection ${this.collectionName} loaded into memory`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to load collection', err);
      throw err;
    }
  }

  /**
   * Store a new memory in Milvus
   */
  async storeMemory(text: string, metadata: Record<string, any> = {}): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Generate unique ID
      const id = `mem_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const timestamp = new Date().toISOString();

      // Generate embedding
      logger.info('Generating embedding for memory storage', { textLength: text.length });
      const embedding = await embeddingService.generateEmbedding(text);

      // Prepare data for insertion
      const memoryData = [{
        id,
        text,
        embedding,
        metadata: JSON.stringify(metadata),
        timestamp,
      }];

      // Insert into Milvus
      const insertResult = await this.client.insert({
        collection_name: this.collectionName,
        data: memoryData,
      });

      if (insertResult.status.error_code !== 'Success') {
        throw new Error(`Insert failed: ${insertResult.status.reason}`);
      }

      // Flush to ensure data is persisted
      await this.client.flush({
        collection_names: [this.collectionName],
      });

      logger.info(`Memory stored successfully in Milvus`, { 
        id,
        textLength: text.length,
        embeddingSize: embedding.length,
        insertCount: insertResult.insert_cnt
      });

      // Update health metrics
      try {
        const { incrementMetric } = await import('../utils/health.js');
        incrementMetric('memoriesStored');
      } catch (error) {
        // Ignore health metric errors
      }

      return id;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to store memory in Milvus', err);
      throw err;
    }
  }

  /**
   * Retrieve similar memories based on query text
   */
  async retrieveMemories(query: string, limit: number = 5): Promise<SearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Generate query embedding
      logger.info('Generating embedding for memory retrieval', { queryLength: query.length });
      const queryEmbedding = await embeddingService.generateEmbedding(query);

      // Perform similarity search
      const searchResult = await this.client.search({
        collection_name: this.collectionName,
        data: [queryEmbedding],
        anns_field: 'embedding',
        topk: limit,
        metric_type: MILVUS_CONFIG.metric_type,
        params: MILVUS_CONFIG.search_params,
        output_fields: ['id', 'text', 'metadata', 'timestamp'],
      });

      if (searchResult.status.error_code !== 'Success') {
        throw new Error(`Search failed: ${searchResult.status.reason}`);
      }

      // Process search results
      const memories: SearchResult[] = [];
      
      if (searchResult.results && searchResult.results.length > 0) {
        const results = searchResult.results[0]; // First query results
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          
          try {
            const metadata = JSON.parse(result.metadata || '{}');
            
            memories.push({
              id: result.id,
              text: result.text,
              score: 1 - result.score, // Convert L2 distance to similarity (higher = more similar)
              metadata,
            });
          } catch (parseError) {
            logger.warn(`Failed to parse metadata for memory ${result.id}`, parseError as Error);
            memories.push({
              id: result.id,
              text: result.text,
              score: 1 - result.score,
              metadata: {},
            });
          }
        }
      }

      logger.info(`Retrieved ${memories.length} memories from Milvus`, { 
        queryLength: query.length,
        topScore: memories.length > 0 ? memories[0].score : 0
      });

      // Update health metrics
      try {
        const { incrementMetric } = await import('../utils/health.js');
        incrementMetric('memoriesRetrieved');
      } catch (error) {
        // Ignore health metric errors
      }

      return memories;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to retrieve memories from Milvus', err);
      return [];
    }
  }

  /**
   * Get all memories (for debugging/admin purposes)
   */
  async getAllMemories(): Promise<Memory[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Query all memories
      const queryResult = await this.client.query({
        collection_name: this.collectionName,
        filter: 'id != ""', // Get all records
        output_fields: ['id', 'text', 'metadata', 'timestamp'],
      });

      if (queryResult.status.error_code !== 'Success') {
        throw new Error(`Query failed: ${queryResult.status.reason}`);
      }

      const memories: Memory[] = [];
      
      if (queryResult.data) {
        for (const record of queryResult.data) {
          try {
            const metadata = JSON.parse(record.metadata || '{}');
            
            memories.push({
              id: record.id,
              text: record.text,
              metadata,
              timestamp: record.timestamp,
            });
          } catch (parseError) {
            logger.warn(`Failed to parse metadata for memory ${record.id}`, parseError as Error);
            memories.push({
              id: record.id,
              text: record.text,
              metadata: {},
              timestamp: record.timestamp,
            });
          }
        }
      }

      logger.info(`Retrieved ${memories.length} total memories from Milvus`);
      return memories;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to get all memories from Milvus', err);
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
      const stats = await this.client.getCollectionStatistics({
        collection_name: this.collectionName,
      });

      if (stats.status.error_code !== 'Success') {
        throw new Error(`Get stats failed: ${stats.status.reason}`);
      }

      // Find row count in statistics
      const rowCountStat = stats.stats.find(stat => stat.key === 'row_count');
      const count = rowCountStat ? parseInt(String(rowCountStat.value)) : 0;

      logger.info(`Milvus collection contains ${count} memories`);
      return count;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to get memory count from Milvus', err);
      return 0;
    }
  }

  /**
   * Health check for Milvus connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        return false;
      }

      const hasCollection = await this.client.hasCollection({
        collection_name: this.collectionName,
      });

      return Boolean(hasCollection.value);
    } catch (error) {
      logger.error('Milvus health check failed', error as Error);
      return false;
    }
  }

  /**
   * Close the Milvus connection
   */
  async close(): Promise<void> {
    try {
      // Note: The Milvus client doesn't have an explicit close method
      // The connection will be closed when the process exits
      logger.info('Milvus connection will be closed when process exits');
    } catch (error) {
      logger.error('Error during Milvus connection cleanup', error as Error);
    }
  }
}

// Export singleton instance
export const milvusMemoryManager = new MilvusMemoryManager();
