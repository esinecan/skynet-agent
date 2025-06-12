/**
 * Conscious Memory Service
 * Extends the existing ChromaDB memory system with conscious memory functionality
 */

import { 
  ConsciousMemoryService,
  ConsciousMemorySearchOptions,
  ConsciousMemorySearchResult,
  ConsciousMemoryMetadata,
  MemorySaveRequest,
  MemoryUpdateRequest,
  ConsciousMemoryStats
} from '../types/memory';
import { getMemoryStore } from './memory-store';
import { getEmbeddingService } from './embeddings';
import knowledgeGraphServiceInstance from './knowledge-graph-service';
import { KgNode, KgRelationship } from '../types/knowledge-graph';
import { generateEntityId } from './rule-based-extractor'; // Assuming this is exported and useful
import { withRetry, SyncErrorQueue, SyncQueueItem } from './kg-resilience';

export class ConsciousMemoryServiceImpl implements ConsciousMemoryService {
  private memoryStore = getMemoryStore();
  private embeddingService = getEmbeddingService();
  private kgService: typeof knowledgeGraphServiceInstance; // Use type of the instance
  private initialized = false;
  private syncErrorQueue = new SyncErrorQueue();

  constructor() {
    this.kgService = knowledgeGraphServiceInstance; // Use the singleton instance
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.memoryStore.initialize();
      // Ensure KG service is connected (optional, could be handled by KGService methods)
      try {
        await this.kgService.connect();
      } catch (error) {
        console.error(' ConsciousMemoryService: Error connecting to KnowledgeGraphService during init:', error);
      }
      this.initialized = true;
      console.log(' ConsciousMemoryService initialized');
      
      // Start periodic retry processing
      setInterval(() => {
        if (this.syncErrorQueue.getQueueSize() > 0) {
          console.log(`[ConsciousMemory] Processing ${this.syncErrorQueue.getQueueSize()} items in retry queue`);
          this.processRetryQueue();
        }
      }, 60000); // Process retry queue every minute
    }
  }

  private async processRetryQueue(): Promise<void> {
    await this.syncErrorQueue.processQueue(async (item) => {
      if (item.operation === 'save' && item.content && item.metadata) {
        await this.syncMemoryToGraph(item.id, item.content, item.metadata);
      }
    });
  }

  private async syncMemoryToGraph(memoryId: string, content: string, metadata: ConsciousMemoryMetadata): Promise<void> {
    try {
      const cmNodeId = generateEntityId('ConsciousMemory', memoryId);
      const memoryNode: KgNode = {
        id: cmNodeId,
        type: 'ConsciousMemory', // Changed 'label' to 'type'
        properties: {
          memoryId: memoryId,
          content: content,
          importance: metadata.importance,
          source: metadata.source,
          context: metadata.context,
          createdAt: metadata.createdAt || metadata.timestamp, // Use createdAt if available, else timestamp
          updatedAt: metadata.timestamp, // timestamp is effectively updatedAt
          lastAccessedAt: metadata.lastAccessedAt,
          textLength: metadata.textLength,
          sessionId: metadata.sessionId, // Include sessionId for direct filtering if needed
        },
      };
      await this.kgService.addNode(memoryNode);

      // Tags
      if (metadata.tags) {
        for (const tagName of metadata.tags) {
          if (!tagName.trim()) continue;
          const tagId = generateEntityId('Tag', tagName);
          const tagNode: KgNode = {
            id: tagId,
            type: 'Tag', // Changed 'label' to 'type'
            properties: { name: tagName.trim() },
          };
          await this.kgService.addNode(tagNode); // addNode should be idempotent (MERGE)
          const relTag: KgRelationship = {
            id: `rel-${cmNodeId}-has_tag-${tagId}`,
            sourceNodeId: cmNodeId,
            targetNodeId: tagId,
            type: 'HAS_TAG',
            properties: {},
          };
          await this.kgService.addRelationship(relTag);
        }
      }

      // Session
      if (metadata.sessionId) {
        const sessionIdValue = metadata.sessionId;
        const sessionNodeId = generateEntityId('Session', sessionIdValue);
        const sessionNode: KgNode = {
          id: sessionNodeId,
          type: 'Session', // Changed 'label' to 'type'
          properties: { sessionId: sessionIdValue },
        };
        await this.kgService.addNode(sessionNode); // addNode should be idempotent
        const relSession: KgRelationship = {
          id: `rel-${cmNodeId}-part_of_session-${sessionNodeId}`,
          sourceNodeId: cmNodeId,
          targetNodeId: sessionNodeId,
          type: 'PART_OF_SESSION',
          properties: {},
        };
        await this.kgService.addRelationship(relSession);
      }

      // Related Memories
      if (metadata.relatedMemoryIds && metadata.relatedMemoryIds.length > 0) {
        for (const relatedId of metadata.relatedMemoryIds) {
          if (!relatedId.trim() || relatedId === memoryId) continue; // Avoid self-loops or empty IDs
          const targetCmNodeId = generateEntityId('ConsciousMemory', relatedId);
          // We don't create the target node here, just the relationship.
          // Assumes target node will be created/updated when its own memory is processed.
          const relRelated: KgRelationship = {
            id: `rel-${cmNodeId}-related_to-${targetCmNodeId}`,
            sourceNodeId: cmNodeId,
            targetNodeId: targetCmNodeId,
            type: 'RELATED_TO',
            properties: {},
          };
          await this.kgService.addRelationship(relRelated);
        }
      }
      console.log(` Synced memory ${memoryId} and its relationships to Knowledge Graph.`);
    } catch (error) {
      console.error(` Error syncing memory ${memoryId} to Knowledge Graph:`, error);
      // Do not re-throw, as KG sync is secondary to memory storage
    }
  }

  async saveMemory(request: MemorySaveRequest): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
    const timestamp = new Date().toISOString();
    const metadata: ConsciousMemoryMetadata = {
      sessionId: request.sessionId || 'default',
      timestamp: timestamp, // Used as updatedAt
      createdAt: timestamp, // Explicitly set createdAt
      messageType: 'assistant', // Conscious memories are typically assistant-generated
      textLength: request.content.length,
      memoryType: 'conscious', // Ensure this is set
      tags: request.tags || [],
      importance: request.importance || 5,
      source: request.source || 'explicit',
      context: request.context,
      relatedMemoryIds: request.relatedMemoryIds || [] // Ensure this is captured
    };

    // Create ChromaDB-compatible metadata (flatten arrays to strings)
    const chromaMetadata = {
      ...metadata,
      // Store arrays as JSON strings for ChromaDB compatibility if needed by memoryStore
      tags: JSON.stringify(metadata.tags),
      relatedMemoryIds: JSON.stringify(metadata.relatedMemoryIds),
      context: metadata.context || '',
      // Ensure all fields needed by memoryStore are present
      memoryType: metadata.memoryType,
      timestamp: metadata.timestamp,
      createdAt: metadata.createdAt,
      lastAccessedAt: metadata.lastAccessedAt, // Will be undefined initially
      textLength: metadata.textLength,
      importance: metadata.importance,
      source: metadata.source,
      sessionId: metadata.sessionId,
    };

    const id = await this.memoryStore.storeMemory(request.content, chromaMetadata as any);
    console.log(` Conscious memory saved to ChromaDB: ${id} (importance: ${metadata.importance}, tags: ${metadata.tags?.join(', ')})`);

    // Sync to Knowledge Graph (fire and forget, with error handling inside)
    this.syncMemoryToGraph(id, request.content, metadata).catch(e => {
      console.error("Error in KG sync from saveMemory:", e);
      this.syncErrorQueue.push({
        id,
        operation: 'save',
        content: request.content,
        metadata,
        retryCount: 0,
        lastError: e.message,
        timestamp: Date.now()
      });
    });
    
    return id;
  }

  async searchMemories(
    query: string, 
    options: ConsciousMemorySearchOptions = {}
  ): Promise<ConsciousMemorySearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }    console.log(` Conscious memory search: "${query}" with options:`, options);

    // Special case: empty query returns all memories (for management purposes)
    if (!query.trim()) {
      console.log(' Empty query - returning all memories');
      try {
        // Use a generic search to get all memories
        const allMemories = await this.memoryStore.retrieveMemories('the', {
          limit: options.limit || 100,
          sessionId: options.sessionId,
          minScore: -2.0  // Get everything
        });
        console.log(` Retrieved ${allMemories.length} total memories`);        // Process and return all memories using existing logic
        const combinedResults = this.mergeSearchResults(allMemories, []);
        
        // Apply the same filtering and mapping logic
        const filtered = combinedResults
          .filter(result => {
            const metadata = result.metadata as ConsciousMemoryMetadata;
            
            // Basic filtering - mostly include all for empty search
            if (metadata.memoryType === 'conscious') {
              if (options.tags && options.tags.length > 0) {
                if (!metadata.tags || !options.tags.some(tag => metadata.tags.includes(tag))) {
                  return false;
                }
              }
              
              if (options.importanceMin && metadata.importance < options.importanceMin) {
                return false;
              }
              
              if (options.importanceMax && metadata.importance > options.importanceMax) {
                return false;
              }
              
              if (options.source && metadata.source !== options.source) {
                return false;
              }
            } else if (options.consciousOnly) {
              return false;
            }
            
            return true;
          })
          .map(result => {
            const metadata = result.metadata as any;
            
            let tags: string[] = [];
            try {
              tags = typeof metadata.tags === 'string' ? JSON.parse(metadata.tags) : (metadata.tags || []);
            } catch {
              tags = [];
            }
            
            return {
              id: result.id,
              text: result.text,
              score: result.score,
              metadata: result.metadata,
              tags,
              importance: metadata.importance || 5,
              source: metadata.source || 'chat',
              context: metadata.context,
              relatedMemoryIds: []
            };
          });
          
        return filtered;
      } catch (error) {
        console.error(' Failed to retrieve all memories:', error);
        return [];
      }
    }    // Stage 1: Semantic search with embeddings
    const semanticResults = await this.memoryStore.retrieveMemories(query, {
      limit: options.limit || 10,
      sessionId: options.sessionId,
      minScore: -2.0  // Very low threshold to catch all potential results
    });

    console.log(` Semantic search results: ${semanticResults.length} memories found`);
    
    // Check quality of semantic results
    const goodSemanticResults = semanticResults.filter(r => r.score >= 0.15); // Reasonable similarity threshold
    const hasGoodSemanticMatch = goodSemanticResults.length > 0;
    const bestSemanticScore = semanticResults.length > 0 ? Math.max(...semanticResults.map(r => r.score)) : 0;
    
    console.log(` Semantic quality check: ${goodSemanticResults.length} good results (score >= 0.15), best score: ${bestSemanticScore.toFixed(3)}`);

    // Stage 2: Keyword fallback search - more aggressive fallback
    let keywordResults: any[] = [];
    const shouldTryKeywords = !hasGoodSemanticMatch || semanticResults.length < 3;
    
    if (shouldTryKeywords) {
      console.log(` Semantic results poor quality or insufficient (best: ${bestSemanticScore.toFixed(3)}), trying keyword search...`);
      keywordResults = await this.performKeywordSearch(query, options);
      console.log(` Keyword search results: ${keywordResults.length} memories found`);
    }    // Stage 3: Merge and deduplicate results
    const combinedResults = this.mergeSearchResults(semanticResults, keywordResults);
    console.log(` Combined search results: ${combinedResults.length} memories found`);

    // Apply quality threshold - don't return very poor matches unless there's keyword relevance
    const qualityFiltered = combinedResults.filter(result => {
      // Keep results with decent semantic similarity
      if (result.score >= 0.15) return true;
      
      // Keep results with keyword matches (keywordMatches property from keyword search)
      if (result.keywordMatches && result.keywordMatches > 0) return true;
      
      // Reject very poor matches
      if (result.score < 0.05) return false;
      
      // For borderline cases, keep if we don't have better results
      return combinedResults.filter(r => r.score >= 0.15).length === 0;
    });
    
    console.log(` Quality filtered results: ${qualityFiltered.length} memories (removed ${combinedResults.length - qualityFiltered.length} low-quality matches)`);

    // Filter and enhance results - include both conscious memories AND regular memories
    const filtered = qualityFiltered
      .filter(result => {
        const metadata = result.metadata as ConsciousMemoryMetadata;
        
        console.log(` Processing memory ${result.id}: type=${metadata.memoryType}, score=${result.score}`);
        
        // If it's a conscious memory, apply conscious memory specific filters
        if (metadata.memoryType === 'conscious') {
          // Apply conscious memory specific filters
          if (options.tags && options.tags.length > 0) {
            if (!metadata.tags || !options.tags.some(tag => metadata.tags.includes(tag))) {
              return false;
            }
          }
          
          if (options.importanceMin && metadata.importance < options.importanceMin) {
            return false;
          }
          
          if (options.importanceMax && metadata.importance > options.importanceMax) {
            return false;
          }
          
          if (options.source && metadata.source !== options.source) {
            return false;
          }
        }
        // For regular memories, include them unless explicitly filtering for conscious-only
        else if (options.consciousOnly) {
          return false;
        }
        
        return true;      })
      .map(result => {
        const metadata = result.metadata as any; // ChromaDB metadata might have stringified arrays
        
        // Parse stringified arrays back to arrays
        let tags: string[] = [];
        let relatedMemoryIds: string[] = [];
        
        try {
          tags = typeof metadata.tags === 'string' ? JSON.parse(metadata.tags) : (metadata.tags || []);
        } catch {
          tags = [];
        }
        
        try {
          relatedMemoryIds = typeof metadata.relatedMemoryIds === 'string' ? JSON.parse(metadata.relatedMemoryIds) : (metadata.relatedMemoryIds || []);
        } catch {
          relatedMemoryIds = [];
        }
        
        return {
          id: result.id,
          text: result.text,
          score: result.score,
          metadata: result.metadata,
          tags,
          importance: metadata.importance || 5,
          source: metadata.source || 'chat',
          context: metadata.context,
          relatedMemoryIds
        };
      })
      .sort((a, b) => b.score - a.score); // Sort by relevance score first, then importance

    console.log(` Conscious memory search returning ${filtered.length} results`);
    return filtered;
  }

  async updateMemory(request: MemoryUpdateRequest): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    // This implementation of update might be suboptimal if ChromaDB offers partial updates.
    // Currently, it fetches, modifies, and re-stores.
    // If ChromaDB `storeMemory` with the same ID overwrites, this is an update.
    // If not, `deleteMemory` then `saveMemory` would be needed.
    // For KG, `addNode` with MERGE handles updates. Relationships might need more care.

    try {
      // Fetch current memory data to preserve fields not being updated
      const existingMemoryData = await this.memoryStore.getMemoryById(request.id); // Assuming getMemoryById exists
      if (!existingMemoryData) {
        console.warn(` Memory ${request.id} not found for update.`);
        return false;
      }

      const currentContent = existingMemoryData.text;      // Chroma stores metadata potentially as strings, parse them back
      const currentChromaMeta = existingMemoryData.metadata as any;
      const currentMetadata: ConsciousMemoryMetadata = {
        sessionId: currentChromaMeta.sessionId,
        timestamp: currentChromaMeta.timestamp, // This will be overwritten by new update timestamp
        messageType: currentChromaMeta.messageType || 'assistant', // Default for conscious memories
        createdAt: currentChromaMeta.createdAt,
        lastAccessedAt: currentChromaMeta.lastAccessedAt,
        textLength: currentChromaMeta.textLength,
        memoryType: currentChromaMeta.memoryType || 'conscious',
        tags: typeof currentChromaMeta.tags === 'string' ? JSON.parse(currentChromaMeta.tags) : (currentChromaMeta.tags || []),
        importance: currentChromaMeta.importance,
        source: currentChromaMeta.source,
        context: currentChromaMeta.context,
        relatedMemoryIds: typeof currentChromaMeta.relatedMemoryIds === 'string' ? JSON.parse(currentChromaMeta.relatedMemoryIds) : (currentChromaMeta.relatedMemoryIds || []),
      };
      
      const newContent = request.content !== undefined ? request.content : currentContent;
      const newTimestamp = new Date().toISOString();

      const updatedMetadata: ConsciousMemoryMetadata = {
        ...currentMetadata,
        timestamp: newTimestamp, // Update timestamp to now
        textLength: newContent.length,
        tags: request.tags !== undefined ? request.tags : currentMetadata.tags,
        importance: request.importance !== undefined ? request.importance : currentMetadata.importance,
        context: request.context !== undefined ? request.context : currentMetadata.context,
        relatedMemoryIds: request.relatedMemoryIds !== undefined ? request.relatedMemoryIds : currentMetadata.relatedMemoryIds,
        // sessionId, source, memoryType, createdAt are generally not changed on update
      };

      // ChromaDB-compatible metadata
       const chromaMetadata = {
        ...updatedMetadata,
        tags: JSON.stringify(updatedMetadata.tags),
        relatedMemoryIds: JSON.stringify(updatedMetadata.relatedMemoryIds),
        context: updatedMetadata.context || ''
      };

      // Assuming storeMemory with the same ID updates the memory in ChromaDB
      await this.memoryStore.storeMemory(newContent, chromaMetadata, request.id);
      console.log(` Memory ${request.id} updated in ChromaDB.`);

      // Sync updated memory to Knowledge Graph
      // This will use MERGE for the node and handle relationships.
      // Relationship changes (e.g. different tags) will require the syncMemoryToGraph or underlying KGService.addRelationship to be smart.
      // A simple approach is to remove all old tag relationships and add new ones if they changed.
      // However, if addNode/addRelationship use MERGE correctly, re-adding should be fine.
      this.syncMemoryToGraph(request.id, newContent, updatedMetadata).catch(e => {
        console.error("Error in KG sync from updateMemory:", e);
        this.syncErrorQueue.push({
          id: request.id,
          operation: 'update',
          content: newContent,
          metadata: updatedMetadata,
          retryCount: 0,
          lastError: e.message,
          timestamp: Date.now()
        });
      });

      return true;
    } catch (error) {
      console.error(` Failed to update memory ${request.id}:`, error);
      return false;
    }
  }

  async deleteMemory(id: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    try {
      console.log(` Deleting conscious memory from ChromaDB: ${id}`);
      const success = await this.memoryStore.deleteMemory(id);
      if (success) {
        console.log(` Successfully deleted memory from ChromaDB: ${id}`);
        // Delete from Knowledge Graph (fire and forget)
        this.kgService.deleteNode(generateEntityId('ConsciousMemory', id))
          .then(() => console.log(` Deleted memory node ${id} from Knowledge Graph.`))
          .catch(e => console.error(` Error deleting memory node ${id} from KG:`, e));
      } else {
        console.warn(` Failed to delete memory from ChromaDB: ${id}`);
      }
      return success;
    } catch (error) {
      console.error(` Error deleting memory ${id}:`, error);
      return false;
    }
  }

  async deleteMultipleMemories(ids: string[]): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    try {
      console.log(` Deleting ${ids.length} conscious memories from ChromaDB:`, ids);
      const success = await this.memoryStore.deleteMemories(ids); // Assumes this method exists and works
      if (success) {
        console.log(` Successfully deleted ${ids.length} memories from ChromaDB`);
        // Delete from Knowledge Graph (fire and forget for each)
        for (const id of ids) {
          this.kgService.deleteNode(generateEntityId('ConsciousMemory', id))
            .then(() => console.log(` Deleted memory node ${id} from Knowledge Graph.`))
            .catch(e => console.error(` Error deleting memory node ${id} from KG:`, e));
        }
      } else {
        console.warn(` Failed to delete ${ids.length} memories from ChromaDB`);
      }
      return success;
    } catch (error) {
      console.error(` Error deleting multiple memories:`, error);
      return false;
    }
  }

  async clearAllMemories(): Promise<boolean> { // DANGEROUS - Clears KG as well if we implement that
    if (!this.initialized) {
      await this.initialize();
    }
    try {
      console.warn(' WARNING: Clearing all conscious memories from ChromaDB and Knowledge Graph.');
      
      // First clear from ChromaDB
      const success = await this.memoryStore.clearAllMemories();
      if (!success) {
        console.error(' Failed to clear all memories from ChromaDB.');
        return false;
      }
      
      console.log(' Successfully cleared all memories from ChromaDB.');
      
      // Now clean up Knowledge Graph nodes
      try {
        const kgService = knowledgeGraphServiceInstance;
        await kgService.connect();
        
        // Delete ConsciousMemory nodes
        const memoryDeleteResult = await kgService.deleteNodesByType('ConsciousMemory');
        console.log(` Deleted ${memoryDeleteResult.deletedCount} ConsciousMemory nodes from Knowledge Graph.`);
        
        // Also delete orphaned Memory nodes that might have been created
        const memoryNodesResult = await kgService.deleteNodesByType('Memory');
        console.log(` Deleted ${memoryNodesResult.deletedCount} Memory nodes from Knowledge Graph.`);
        
        // Clean up any orphaned nodes
        const orphanCleanup = await kgService.cleanupOrphanedNodes(['User', 'Session']);
        console.log(` Cleaned up ${orphanCleanup.deletedCount} orphaned nodes.`);
        
        console.log(' Successfully cleaned up Knowledge Graph data.');
        return true;
      } catch (kgError) {
        console.error(' Error cleaning up Knowledge Graph data:', kgError);
        console.warn(' ChromaDB was cleared but Knowledge Graph cleanup failed.');
        return true; // Return true since ChromaDB was cleared successfully
      }
    } catch (error) {
      console.error(' Error clearing all memories:', error);
      return false;
    }
  }

  async getAllTags(): Promise<string[]> {
    // This method could also be served by querying the KG if tags are reliably synced.
    // For now, it uses the memory store.
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get all memories and extract unique tags
      // This is inefficient but works with current ChromaDB setup
      const allMemories = await this.memoryStore.retrieveMemories('', { limit: 1000 });
      
      const tagSet = new Set<string>();
      
      allMemories.forEach(memory => {
        const metadata = memory.metadata as ConsciousMemoryMetadata;
        if (metadata.memoryType === 'conscious' && metadata.tags) {
          metadata.tags.forEach(tag => tagSet.add(tag));
        }
      });
      
      return Array.from(tagSet).sort();
    } catch (error) {
      console.error(' Failed to get all tags:', error);
      return [];
    }
  }

  async getRelatedMemories(id: string, limit = 5): Promise<ConsciousMemorySearchResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Find the source memory first
      const sourceMemories = await this.memoryStore.retrieveMemories(id, { limit: 1 });
      const sourceMemory = sourceMemories.find(m => m.id === id);
      
      if (!sourceMemory) {
        console.warn(` Source memory ${id} not found for related search`);
        return [];
      }

      // Use the source memory's content to find similar memories
      const relatedResults = await this.searchMemories(sourceMemory.text, { 
        limit: limit + 1 // Get one extra to exclude the source
      });
      
      // Filter out the source memory itself
      return relatedResults.filter(result => result.id !== id).slice(0, limit);
    } catch (error) {
      console.error(` Failed to get related memories for ${id}:`, error);
      return [];
    }
  }

  async getStats(): Promise<ConsciousMemoryStats> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get all memories to calculate stats
      const allMemories = await this.memoryStore.retrieveMemories('', { limit: 1000 });
      
      const consciousMemories = allMemories.filter(memory => {
        const metadata = memory.metadata as ConsciousMemoryMetadata;
        return metadata.memoryType === 'conscious';
      });
      
      const tags = new Set<string>();
      const sourceBreakdown: Record<string, number> = { explicit: 0, suggested: 0, derived: 0 };
      let totalImportance = 0;
      
      consciousMemories.forEach(memory => {
        const metadata = memory.metadata as ConsciousMemoryMetadata;
        
        if (metadata.tags) {
          metadata.tags.forEach(tag => tags.add(tag));
        }
        
        sourceBreakdown[metadata.source] = (sourceBreakdown[metadata.source] || 0) + 1;
        totalImportance += metadata.importance;
      });
      
      return {
        totalConsciousMemories: consciousMemories.length,
        tagCount: tags.size,
        averageImportance: consciousMemories.length > 0 ? totalImportance / consciousMemories.length : 0,
        sourceBreakdown
      };
    } catch (error) {
      console.error(' Failed to get stats:', error);
      return {
        totalConsciousMemories: 0,
        tagCount: 0,
        averageImportance: 0,
        sourceBreakdown: { explicit: 0, suggested: 0, derived: 0 }
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return await this.memoryStore.healthCheck();
    } catch (error) {
      console.error(' Conscious memory health check failed:', error);
      return false;
    }
  }

  async testMemorySystem(): Promise<boolean> {
    try {
      const testContent = `Conscious memory test at ${new Date().toISOString()}`;
      
      // Test save
      const id = await this.saveMemory({
        content: testContent,
        tags: ['test', 'system-check'],
        importance: 5,
        source: 'explicit',
        context: 'System test'
      });
      
      // Short delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Test search
      const results = await this.searchMemories(testContent, { limit: 1 });
      
      const success = results.length > 0 && results[0].id === id;
      
      if (success) {
        console.log(' Conscious memory system test passed');
      } else {
        console.error(' Conscious memory system test failed');
      }
      
      return success;
    } catch (error) {
      console.error(' Conscious memory system test error:', error);
      return false;
    }
  }
  /**
   * Perform keyword-based search as fallback when semantic search returns few results
   */
  private async performKeywordSearch(
    query: string, 
    options: ConsciousMemorySearchOptions
  ): Promise<any[]> {
    try {
      // Get all memories with a very low threshold to retrieve most of the collection
      const allMemories = await this.memoryStore.retrieveMemories('', {
        limit: 1000, // Large limit to get most memories
        sessionId: options.sessionId,
        minScore: -1.0 // Very low to get everything
      });      // Handle multi-word phrases and individual keywords
      const originalQuery = query.trim();
      const originalQueryLower = originalQuery.toLowerCase();
      const keywords = originalQuery.split(/\s+/).filter(word => word.length > 1); // Keep original case for proper noun detection
      const keywordsLower = keywords.map(word => word.toLowerCase()); // Lowercase versions for matching
      
      console.log(` Keyword search for: "${originalQuery}" (split into: ${keywords.join(', ')})`);
      
      // Score memories based on keyword matches
      const scoredMemories = allMemories
        .map(memory => {
          const text = memory.text.toLowerCase();
          let keywordScore = 0;
          let exactMatches = 0;
          let phraseBonus = 0;
          
          // Check for exact phrase match first (highest score)
          if (text.includes(originalQueryLower)) {
            phraseBonus = 1.0;
            keywordScore += 1.0;
            console.log(` Exact phrase match found in memory ${memory.id}`);
          }
          
          // Check individual keywords
          for (let i = 0; i < keywords.length; i++) {
            const keyword = keywords[i];          // Original case for proper noun detection
            const keywordLower = keywordsLower[i]; // Lowercase for matching
            
            if (text.includes(keywordLower)) {
              exactMatches++;
              keywordScore += 0.4; // Higher base score
              
              // Bonus for exact word boundary matches (case insensitive)
              const wordRegex = new RegExp(`\\b${keywordLower}\\b`, 'i');
              if (wordRegex.test(text)) {
                keywordScore += 0.3; // Higher word boundary bonus
              }
              
              // Extra bonus for proper nouns (capitalized words in original query)
              if (keyword[0] === keyword[0].toUpperCase() && keyword.length > 2) {
                keywordScore += 0.2;
                console.log(` Proper noun bonus for "${keyword}" in memory ${memory.id}`);
              }
            }
          }
          
          // Calculate final score with phrase bonus
          const coverage = keywords.length > 0 ? exactMatches / keywords.length : 0;
          const finalScore = (keywordScore + phraseBonus) * Math.max(0.5, coverage); // Ensure some score for partial matches
          
          return {
            ...memory,
            score: finalScore,
            keywordMatches: exactMatches
          };
        })
        .filter(memory => memory.keywordMatches > 0) // Only keep memories with keyword matches
        .sort((a, b) => b.score - a.score) // Sort by keyword relevance
        .slice(0, options.limit || 10);

      return scoredMemories;
    } catch (error) {
      console.error(' Keyword search error:', error);
      return [];
    }
  }

  /**
   * Merge semantic and keyword search results, removing duplicates and ranking
   */
  private mergeSearchResults(semanticResults: any[], keywordResults: any[]): any[] {
    const mergedMap = new Map();
    
    // Add semantic results first (higher priority)
    for (const result of semanticResults) {
      mergedMap.set(result.id, {
        ...result,
        searchType: 'semantic'
      });
    }
    
    // Add keyword results, but don't overwrite semantic ones
    for (const result of keywordResults) {
      if (!mergedMap.has(result.id)) {
        mergedMap.set(result.id, {
          ...result,
          searchType: 'keyword'
        });
      }
    }
    
    // Convert back to array and sort by score
    return Array.from(mergedMap.values())
      .sort((a, b) => {
        // Prioritize semantic results if scores are close
        if (Math.abs(a.score - b.score) < 0.1) {
          return a.searchType === 'semantic' ? -1 : 1;
        }
        return b.score - a.score;
      });
  }
}

// Export singleton instance
let consciousMemoryService: ConsciousMemoryServiceImpl | null = null;

export function getConsciousMemoryService(): ConsciousMemoryService {
  if (!consciousMemoryService) {
    consciousMemoryService = new ConsciousMemoryServiceImpl();
  }
  return consciousMemoryService;
}
