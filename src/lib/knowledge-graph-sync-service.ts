import knowledgeGraphService from './knowledge-graph-service';
import { KgNode, KgRelationship } from '../types/knowledge-graph';
import { LLMService, ExtractedEntity, ExtractedRelationship, KnowledgeExtractionResult } from './llm-service';
import { extractUsingRules, RuleBasedExtractionResult } from './rule-based-extractor';
import { ChatHistoryDatabase, ChatMessage, ChatSession } from './chat-history';
import { getConsciousMemoryService } from './conscious-memory'; // Import the service getter function
import type { ConsciousMemoryService, ConsciousMemorySearchResult, ConsciousMemory, ConsciousMemoryMetadata } from '../types/memory'; // Import types
import { getMemoryStore } from './memory-store'; // For RAG memories, if separate processing is needed
import { convertExtractedEntityToKgNode, convertExtractedRelationshipToKgRelationship } from './kg-type-converters';
import { SyncStateManager } from './kg-sync-state';
import { withRetry, SyncErrorQueue } from './kg-resilience';
import { SyncMetricsCollector } from './kg-sync-metrics';

// Define a simple structure for tracking sync progress

export class KnowledgeGraphSyncService {
  private kgService: typeof knowledgeGraphService;
  private llmService: LLMService;
  private chatHistoryDB: ChatHistoryDatabase;
  private consciousMemoryService: ConsciousMemoryService;
  private syncStateManager: SyncStateManager;
  private errorQueue: SyncErrorQueue;
  private metricsCollector?: SyncMetricsCollector;
  // private ragMemoryStore: ChromaMemoryStore; // If direct access is needed

  constructor() {
    this.kgService = knowledgeGraphService; // Singleton instance
    this.llmService = new LLMService(); // Assuming default constructor is fine
    this.chatHistoryDB = ChatHistoryDatabase.getInstance(); // Use singleton pattern
    this.syncStateManager = new SyncStateManager();
    this.errorQueue = new SyncErrorQueue();

    // Initialize ConsciousMemoryService using singleton pattern
    this.consciousMemoryService = getConsciousMemoryService();

    // Ensure Neo4j driver is ready (connect method in KnowledgeGraphService)
    // This might be better handled explicitly before sync, or internally by KnowledgeGraphService methods
    this.kgService.connect().catch(console.error);
    
    // Set up error queue processing interval
    setInterval(() => {
      this.processErrorQueue();
    }, 60000); // Process error queue every minute
  }

  private async processErrorQueue(): Promise<void> {
    await this.errorQueue.processQueue(async (item) => {
      try {
        // Parse the stored metadata to get entity/relationship data
        const data = item.metadata;
        if (!data || !data.type) {
          console.error(`[Sync Service] Invalid error queue item: missing type`);
          return;
        }
        
        if (data.type === 'entity' && data.entity) {
          const kgNode = convertExtractedEntityToKgNode(data.entity);
          await this.kgService.addNode(kgNode);
          console.log(`[Sync Service] Successfully reprocessed entity ${data.entity.id}`);
        } else if (data.type === 'relationship' && data.relationship) {
          const kgRelationship = convertExtractedRelationshipToKgRelationship(data.relationship);
          await this.kgService.addRelationship(kgRelationship);
          console.log(`[Sync Service] Successfully reprocessed relationship ${data.relationship.type}`);
        }
      } catch (error) {
        console.error(`[Sync Service] Failed to reprocess item from error queue:`, error);
        throw error; // Re-throw to keep in error queue
      }
    });
  }

  private mergeExtractions(
    results: (KnowledgeExtractionResult | RuleBasedExtractionResult | null)[]
  ): { entities: ExtractedEntity[]; relationships: ExtractedRelationship[] } {
    const allEntities: ExtractedEntity[] = [];
    const allRelationships: ExtractedRelationship[] = [];
    const entityIds = new Set<string>();
    const relationshipKeys = new Set<string>(); // For deduplicating relationships

    for (const result of results) {
      if (!result) continue;

      result.entities.forEach(entity => {
        if (!entityIds.has(entity.id)) {
          allEntities.push(entity);
          entityIds.add(entity.id);
        } else {
          // Optional: Implement merging logic for properties of existing entities
          // For example, find existing entity and update its properties if new ones are found
        }
      });

      result.relationships.forEach(rel => {
        // Create a unique key for relationship deduplication (sourceId + type + targetId)
        const relKey = `${rel.sourceEntityId}_${rel.type}_${rel.targetEntityId}`;
        if (!relationshipKeys.has(relKey)) {
          allRelationships.push(rel);
          relationshipKeys.add(relKey);
        }
      });
    }
    return { entities: allEntities, relationships: allRelationships };
  }
  private async processChatMessage(message: ChatMessage): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }> {
    const llmExtraction = await this.llmService.extractKnowledge(message.content, `Context: Chat message from session ${message.sessionId}`);    let toolExtraction: RuleBasedExtractionResult = { entities: [], relationships: [] };
    if (message.toolInvocations) {
      // Convert tool invocations to JSON string for rule-based extraction
      const toolInvocationsJson = JSON.stringify(message.toolInvocations);
      toolExtraction = extractUsingRules(undefined, toolInvocationsJson, undefined);
    }

    const filePathExtraction = extractUsingRules(message.content, undefined, undefined);

    return this.mergeExtractions([llmExtraction, toolExtraction, filePathExtraction]);
  }

  private async processConsciousMemory(memory: ConsciousMemorySearchResult): Promise<{ entities: ExtractedEntity[]; relationships: ExtractedRelationship[] }> {
    const llmExtraction = await this.llmService.extractKnowledge(memory.text, `Context: Conscious Memory, Source: ${memory.metadata.source}`);    // The 'extractUsingRules' function can take a ConsciousMemory object.
    // We need to reconstruct a partial one or adapt extractUsingRules.    // For now, assuming SearchResult has enough data or we can fetch the full memory object.
    // This might require a method in ConsciousMemoryService to get a full memory object by ID.
    const ruleInputMemory: ConsciousMemory = { // Proper ConsciousMemory object for rule extraction
        id: memory.id,
        content: memory.text,
        tags: memory.tags || [],
        importance: memory.importance || 5,
        source: memory.source || 'derived',
        context: memory.context,
        metadata: memory.metadata as ConsciousMemoryMetadata,
        createdAt: Date.now(), // Use numeric timestamp
    };
    const ruleExtraction = extractUsingRules(undefined, undefined, ruleInputMemory);

    return this.mergeExtractions([llmExtraction, ruleExtraction]);
  }

  public async syncKnowledgeGraph(options: { forceFullResync?: boolean } = {}): Promise<void> {
    const startTime = Date.now();
    
    // Initialize metrics collector
    this.metricsCollector = new SyncMetricsCollector();
    
    // Get initial stats
    const initialStats = await this.kgService.getStatistics();
    console.log(` [KG Sync] Initial counts: ${initialStats.nodeCount} nodes, ${initialStats.relationshipCount} relationships`);
    
    const syncState = await this.syncStateManager.read();
    const lastSync = options.forceFullResync ? null : (syncState?.lastSyncTimestamp || null);
    if (lastSync) {
      console.log(`⏱  [KG Sync] Last sync: ${new Date(lastSync).toLocaleString()}`);
    } else {
      console.log(`⏱  [KG Sync] No previous sync found - will process all data`);
    }
    
    // Set sync timestamp BEFORE processing starts, not after
    // This prevents reprocessing items created during the sync
    let syncStartTimestamp = new Date().toISOString();

    let allExtractedEntities: ExtractedEntity[] = [];
    let allExtractedRelationships: ExtractedRelationship[] = [];

    try {      // 1. Fetch Chat History
      console.log('[Sync Service] Fetching chat history...');
      let messages: ChatMessage[];
      
      if (options.forceFullResync || !lastSync) {
        // Get all sessions and their messages
        const sessions = await this.chatHistoryDB.getAllSessions();
        messages = sessions.flatMap(session => session.messages);
      } else {
        // Get only messages since last sync
        messages = await this.chatHistoryDB.getMessagesSince(lastSync);
      }
        console.log(` [KG Sync] Processing ${messages.length} chat messages...`);
      for (const message of messages) {
        const chatExtracts = await this.processChatMessage(message);
        allExtractedEntities.push(...chatExtracts.entities);
        allExtractedRelationships.push(...chatExtracts.relationships);
      }
  
      await this.syncStateManager.updateTimestamp();

      // 2. Fetch Conscious Memories
      // Assuming searchMemories with empty query and large limit fetches all.
      // Needs pagination or streaming for very large datasets.
      // Also needs filtering by timestamp for incremental syncs.
      const consciousMemories = await this.consciousMemoryService.searchMemories('', { limit: 10000 }); // High limit
      console.log(` [KG Sync] Found ${consciousMemories.length} total conscious memories`);
      
      const filteredMemories = consciousMemories.filter(memory => {
        // Enhanced timestamp filtering with better logging
        if (!options.forceFullResync && lastSync) {
          if (!memory.metadata || !memory.metadata.createdAt) {
            //console.warn(`  [KG Sync] Memory ${memory.id} has no timestamp - excluding from incremental sync`);
            return false; // Exclude memories without timestamps in incremental sync
          }
          
          const memoryDate = new Date(memory.metadata.createdAt);
          const lastSyncDate = new Date(lastSync);
          const isNew = memoryDate > lastSyncDate;
          
          if (!isNew && consciousMemories.length > 100) {
            // Only log skips for first few to avoid spam
            console.log(`⏭  [KG Sync] Skipping memory from ${memoryDate.toISOString()} (before ${lastSyncDate.toISOString()})`);
          }
          return isNew;
        }
        return true; // Include all memories for full sync
      });
      
      console.log(` [KG Sync] After filtering: ${filteredMemories.length} memories to process`);
      
      for (const memory of filteredMemories) {
        const memoryExtracts = await this.processConsciousMemory(memory);
        allExtractedEntities.push(...memoryExtracts.entities);
        allExtractedRelationships.push(...memoryExtracts.relationships);
      }
      
      // Update sync state after processing conscious memories
      console.log(` [KG Sync] Saving progress after conscious memories...`);
      await this.syncStateManager.updateTimestamp();      // 3. Fetch RAG-specific memories
      const ragExtracts = await this.syncRAGMemories(lastSync);
      console.log(`[KG Sync] Extracted ${ragExtracts.entities.length} entities and ${ragExtracts.relationships.length} relationships from RAG memories`); // New log line
      allExtractedEntities.push(...ragExtracts.entities);
      allExtractedRelationships.push(...ragExtracts.relationships);
      
      // Update sync state after processing RAG memories
      console.log(` [KG Sync] Saving progress after RAG memories...`);
      await this.syncStateManager.updateTimestamp();      // 4. Data Aggregation and Deduplication
      const finalExtraction = this.mergeExtractions([{ entities: allExtractedEntities, relationships: allExtractedRelationships }]);
      allExtractedEntities = finalExtraction.entities;
      allExtractedRelationships = finalExtraction.relationships;
      console.log(` [KG Sync] After deduplication: ${allExtractedEntities.length} entities, ${allExtractedRelationships.length} relationships`);

      // 5. Loading into Neo4j
      await this.kgService.connect(); // Ensure connection
      console.log(` [KG Sync] Loading ${allExtractedEntities.length} entities and ${allExtractedRelationships.length} relationships into Neo4j...`);

      // 5.1 Memory deduplication - check existing nodes
      const existingNodeIds = new Set<string>();
      for (const entity of allExtractedEntities) {
        const existing = await this.kgService.findNodeById(entity.id);
        if (existing) {
          existingNodeIds.add(entity.id);
        }
      }
      
      const newEntities = allExtractedEntities.filter(e => !existingNodeIds.has(e.id));
      console.log(` [KG Sync] Found ${existingNodeIds.size} existing entities, ${newEntities.length} new entities to add`);

      // 5.2 Batch processing for entities
      const BATCH_SIZE = 100;
      const entityBatches = [];
      for (let i = 0; i < newEntities.length; i += BATCH_SIZE) {
        entityBatches.push(newEntities.slice(i, i + BATCH_SIZE));
      }

      console.log(` [KG Sync] Processing entities in ${entityBatches.length} batches of ${BATCH_SIZE}`);
      
      for (const [index, batch] of entityBatches.entries()) {
        try {
          const kgNodes = batch.map(entity => convertExtractedEntityToKgNode(entity));
          const result = await withRetry(
            () => this.kgService.addNodesBatch(kgNodes),
            {
              maxRetries: 3,
              backoffMs: 500,
              onRetry: (error, attempt) => {
                console.warn(`[Sync Service] Retry ${attempt} for entity batch ${index + 1}:`, error.message);
              }
            }
          );
          
          console.log(` [KG Sync] Batch ${index + 1}/${entityBatches.length}: ${result.succeeded} succeeded, ${result.failed} failed`);
          for (let i = 0; i < result.succeeded; i++) {
            this.metricsCollector?.recordEntity();
          }
          
          // Add failed entities to error queue
          if (result.failed > 0) {
            const failedStart = index * BATCH_SIZE + result.succeeded;
            const failedEntities = batch.slice(result.succeeded);
            for (const entity of failedEntities) {
              this.errorQueue.push({
                id: `entity-${entity.id}`,
                operation: 'save',
                metadata: { type: 'entity', entity },
                retryCount: 0,
                timestamp: Date.now()
              });
              this.metricsCollector?.recordError(new Error(`Failed to add entity ${entity.id}`));
            }
          }
        } catch (error) {
          console.error(`[Sync Service] Error processing entity batch ${index + 1}:`, error);
          // Add entire batch to error queue
          for (const entity of batch) {
            this.errorQueue.push({
              id: `entity-${entity.id}`,
              operation: 'save',
              metadata: { type: 'entity', entity },
              retryCount: 0,
              timestamp: Date.now()
            });
          }
          this.metricsCollector?.recordError(error as Error);
        }
      }

      // 5.3 Batch processing for relationships
      const relationshipBatches = [];
      for (let i = 0; i < allExtractedRelationships.length; i += BATCH_SIZE) {
        relationshipBatches.push(allExtractedRelationships.slice(i, i + BATCH_SIZE));
      }

      console.log(` [KG Sync] Processing relationships in ${relationshipBatches.length} batches of ${BATCH_SIZE}`);
      
      for (const [index, batch] of relationshipBatches.entries()) {
        try {
          const kgRelationships = batch.map(rel => convertExtractedRelationshipToKgRelationship(rel));
          const result = await withRetry(
            () => this.kgService.addRelationshipsBatch(kgRelationships),
            {
              maxRetries: 3,
              backoffMs: 500,
              onRetry: (error, attempt) => {
                console.warn(`[Sync Service] Retry ${attempt} for relationship batch ${index + 1}:`, error.message);
              }
            }
          );
          
          console.log(` [KG Sync] Batch ${index + 1}/${relationshipBatches.length}: ${result.succeeded} succeeded, ${result.failed} failed`);
          for (let i = 0; i < result.succeeded; i++) {
            this.metricsCollector?.recordRelationship();
          }
          
          // Add failed relationships to error queue
          if (result.failed > 0) {
            const failedStart = index * BATCH_SIZE + result.succeeded;
            const failedRelationships = batch.slice(result.succeeded);
            for (const rel of failedRelationships) {
              this.errorQueue.push({
                id: `rel-${rel.sourceEntityId}-${rel.type}-${rel.targetEntityId}`,
                operation: 'save',
                metadata: { type: 'relationship', relationship: rel },
                retryCount: 0,
                timestamp: Date.now()
              });
              this.metricsCollector?.recordError(new Error(`Failed to add relationship ${rel.type}`));
            }
          }
        } catch (error) {
          console.error(`[Sync Service] Error processing relationship batch ${index + 1}:`, error);
          // Add entire batch to error queue
          for (const rel of batch) {
            this.errorQueue.push({
              id: `rel-${rel.sourceEntityId}-${rel.type}-${rel.targetEntityId}`,
              operation: 'save',
              metadata: { type: 'relationship', relationship: rel },
              retryCount: 0,
              timestamp: Date.now()
            });
          }
          this.metricsCollector?.recordError(error as Error);
        }
      }
      
      // 6. Final Statistics and Completion
      const finalStats = await this.kgService.getStatistics();
      const duration = Date.now() - startTime;
      
      console.log(`\n [KG Sync] Synchronization complete!`);
      console.log(` [KG Sync] Final counts: ${finalStats.nodeCount} nodes (+${finalStats.nodeCount - initialStats.nodeCount}), ${finalStats.relationshipCount} relationships (+${finalStats.relationshipCount - initialStats.relationshipCount})`);
      console.log(`⏱  [KG Sync] Duration: ${duration}ms`);
      console.log(`  [KG Sync] Node types: ${finalStats.labels.join(', ')}`);
      console.log(` [KG Sync] Relationship types: ${finalStats.relationshipTypes.join(', ')}\n`);

      // Complete metrics collection
      const metrics = this.metricsCollector?.complete('completed');
      if (metrics) {
        console.log(` [KG Sync] Metrics: ${metrics.entitiesProcessed} entities, ${metrics.relationshipsProcessed} relationships, ${metrics.errors.length} errors`);
      }

      // 7. Update Sync State with final timestamp
      await this.syncStateManager.write({ 
        lastSyncTimestamp: syncStartTimestamp,
        lastProcessedIds: { chatMessages: [], consciousMemories: [], ragMemories: [] }
      });    } catch (error) {
      console.error('[Sync Service] Critical error during knowledge graph synchronization:', error);
      // Log detailed error but don't propagate it upward
      console.error('[Sync Service] Error details:', error instanceof Error ? error.stack : 'Unknown error');
      console.error('[Sync Service] Sync operation failed but will not affect other system operations');
      
      // Complete metrics collection with failed status
      this.metricsCollector?.complete('failed');
    } finally {
      try {
        // Handle close errors separately to avoid affecting parent context
        await this.kgService.close().catch(closeError => {
          console.error('[Sync Service] Error closing Neo4j connection:', closeError);
        });
      } catch (finalError) {
        console.error('[Sync Service] Unexpected error in finally block:', finalError);
      }
    }
  }
  /**
   * Synchronizes RAG memories with the knowledge graph
   * @param lastSync Timestamp of the last synchronization
   * @returns Extracted entities and relationships from RAG memories
   */
  private async syncRAGMemories(lastSync: string | null): Promise<{
    entities: ExtractedEntity[];
    relationships: ExtractedRelationship[];
  }> {
    console.log('[Sync Service] Processing RAG memories...');

    const memoryStore = getMemoryStore();
    await memoryStore.initialize(); // Ensure ChromaDB connection is ready
    const allEntities: ExtractedEntity[] = [];
    const allRelationships: ExtractedRelationship[] = [];

    try {
      // ChromaDB doesn't support timestamp queries, so fetch all and filter manually
      console.log(`[KG Sync] Fetching RAG memories for filtering...`);
      
      // Retrieve all memories (with a reasonable limit)
      const memories = await memoryStore.retrieveMemories('', {
        limit: 1000 // Process in manageable batches
      });

      console.log(`[KG Sync] Found ${memories.length} total RAG memories`);

      // Filter by timestamp if incremental sync
      const filteredMemories = memories.filter(memory => {
        if (!lastSync) return true; // Include all for full sync
        
        if (!memory.metadata?.timestamp) {
          return false; // Exclude timestampless memories in incremental sync
        }
        
        const memoryDate = new Date(memory.metadata.timestamp);
        const lastSyncDate = new Date(lastSync);
        return memoryDate > lastSyncDate;
      });

      console.log(`[KG Sync] After filtering: ${filteredMemories.length} RAG memories to process`);

      // Process filtered memories
      for (const memory of filteredMemories) {
        // Create memory entity with a consistent ID format
        const memoryId = `memory-${memory.id}`;
        const memoryEntity: ExtractedEntity = {
          id: memoryId,
          label: 'Memory',
          properties: {
            content: memory.text,
            // Extract metadata values with fallbacks
            sessionId: memory.metadata?.sessionId || 'unknown',
            timestamp: memory.metadata?.timestamp || new Date().toISOString(),
            messageType: memory.metadata?.messageType || 'unknown',
            textLength: memory.metadata?.textLength || memory.text.length,
            vectorId: memory.id // Store original vector ID for reference
          }
        };
        allEntities.push(memoryEntity);

        // Extract the session ID
        if (memory.metadata?.sessionId) {
          // Create session entity if it doesn't exist
          const sessionId = `session-${memory.metadata.sessionId}`;
          const sessionEntity: ExtractedEntity = {
            id: sessionId,
            label: 'Session',
            properties: {
              sessionId: memory.metadata.sessionId
            }
          };
          
          // Add session entity if not already present (avoid duplicates)
          if (!allEntities.some(entity => entity.id === sessionId)) {
            allEntities.push(sessionEntity);
          }

          // Create relationship from memory to session
          const sessionRelationship: ExtractedRelationship = {
            sourceEntityId: memoryId,
            targetEntityId: sessionId,
            type: 'BELONGS_TO',
            properties: {}
          };
          allRelationships.push(sessionRelationship);
          
          // If we have LLM service available, try to extract additional knowledge
          try {
            if (this.llmService) {
              // Extract knowledge from memory content
              const llmExtraction = await this.llmService.extractKnowledge(
                memory.text,
                `Context: RAG Memory, SessionId: ${memory.metadata.sessionId}`
              );
              
              if (llmExtraction) {
                // Add extracted entities and relationships
                if (llmExtraction.entities) {
                  allEntities.push(...llmExtraction.entities);
                  
                  // Connect extracted entities to this memory
                  for (const entity of llmExtraction.entities) {
                    const mentionRelationship: ExtractedRelationship = {
                      sourceEntityId: memoryId,
                      targetEntityId: entity.id,
                      type: 'MENTIONS',
                      properties: {}
                    };
                    allRelationships.push(mentionRelationship);
                  }
                }
                
                // Add extracted relationships
                if (llmExtraction.relationships) {
                  allRelationships.push(...llmExtraction.relationships);
                }
              }
            }
          } catch (llmError) {
            // Log but continue - knowledge extraction is a non-critical enhancement
            console.warn('[Sync Service] Error extracting knowledge from memory:', llmError);
          }
        }
      }
      
      // Track processed memory IDs
      if (memories.length > 0 && this.syncStateManager) {
        const processedMemoryIds = memories.map(memory => memory.id);
        await this.syncStateManager.updateLastProcessedIds({
          ragMemories: processedMemoryIds
        });
      }

      return { entities: allEntities, relationships: allRelationships };
    } catch (error) {
      console.error('[Sync Service] Error processing RAG memories:', error);
      
      // Gracefully handle errors by returning empty arrays rather than failing the entire sync
      return { entities: [], relationships: [] };
    } finally {
      // Clean up memory store connection if needed
      if (memoryStore && typeof memoryStore.cleanup === 'function') {
        await memoryStore.cleanup();
      }
    }
  }
  /**
   * Log current Neo4j statistics for monitoring
   */
  public async logStartupStatistics(): Promise<void> {
    try {
      const stats = await this.kgService.getStatistics();
      console.log(`\n [KG Service] Neo4j Statistics:`);
      console.log(`   • Nodes: ${stats.nodeCount}`);
      console.log(`   • Relationships: ${stats.relationshipCount}`);
      console.log(`   • Node Types: ${stats.labels.length > 0 ? stats.labels.join(', ') : 'None'}`);
      console.log(`   • Relationship Types: ${stats.relationshipTypes.length > 0 ? stats.relationshipTypes.join(', ') : 'None'}\n`);
    } catch (error) {
      console.error(` [KG Service] Failed to retrieve Neo4j statistics: ${error}`);
    }
  }
}

const knowledgeGraphSyncService = new KnowledgeGraphSyncService();
export default knowledgeGraphSyncService;
