import knowledgeGraphService from './knowledge-graph-service';
import { KgNode, KgRelationship } from '../types/knowledge-graph';
import { LLMService, ExtractedEntity, ExtractedRelationship, KnowledgeExtractionResult } from './llm-service';
import { extractUsingRules, RuleBasedExtractionResult } from './rule-based-extractor';
import { ChatHistoryDatabase, ChatMessage, ChatSession } from './chat-history';
import { getConsciousMemoryService } from './conscious-memory'; // Import the service getter function
import type { ConsciousMemoryService, ConsciousMemorySearchResult, ConsciousMemory, ConsciousMemoryMetadata } from '../types/memory'; // Import types
import { ChromaMemoryStore } from './memory-store'; // For RAG memories, if separate processing is needed
import { convertExtractedEntityToKgNode, convertExtractedRelationshipToKgRelationship } from './kg-type-converters';
import { SyncStateManager } from './kg-sync-state';

// Define a simple structure for tracking sync progress

export class KnowledgeGraphSyncService {
  private kgService: typeof knowledgeGraphService;
  private llmService: LLMService;
  private chatHistoryDB: ChatHistoryDatabase;
  private consciousMemoryService: ConsciousMemoryService;
  private syncStateManager: SyncStateManager;
  // private ragMemoryStore: ChromaMemoryStore; // If direct access is needed

  constructor() {
    this.kgService = knowledgeGraphService; // Singleton instance
    this.llmService = new LLMService(); // Assuming default constructor is fine
    this.chatHistoryDB = ChatHistoryDatabase.getInstance(); // Use singleton pattern
    this.syncStateManager = new SyncStateManager();

    // Initialize ConsciousMemoryService using singleton pattern
    this.consciousMemoryService = getConsciousMemoryService();

    // Ensure Neo4j driver is ready (connect method in KnowledgeGraphService)
    // This might be better handled explicitly before sync, or internally by KnowledgeGraphService methods
    this.kgService.connect().catch(console.error);  }

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
    // We need to reconstruct a partial one or adapt extractUsingRules.
    // For now, assuming SearchResult has enough data or we can fetch the full memory object.
    // This might require a method in ConsciousMemoryService to get a full memory object by ID.
    const ruleInputMemory: ConsciousMemory = { // Proper ConsciousMemory object for rule extraction
        id: memory.id,
        content: memory.text,
        tags: memory.tags || [],
        importance: memory.importance || 5,
        source: memory.source || 'derived',
        context: memory.context,
        metadata: memory.metadata as ConsciousMemoryMetadata,
        createdAt: new Date().toISOString(),
    };
    const ruleExtraction = extractUsingRules(undefined, undefined, ruleInputMemory);

    return this.mergeExtractions([llmExtraction, ruleExtraction]);
  }  public async syncKnowledgeGraph(options: { forceFullResync?: boolean } = {}): Promise<void> {
    const startTime = Date.now();
    console.log(`\n🔄 [KG Sync] Starting knowledge graph synchronization at ${new Date().toISOString()}`);
    console.log(`📋 [KG Sync] Mode: ${options.forceFullResync ? 'FULL RESYNC' : 'INCREMENTAL SYNC'}`);
    
    // Get initial stats
    const initialStats = await this.kgService.getStatistics();
    console.log(`📊 [KG Sync] Initial counts: ${initialStats.nodeCount} nodes, ${initialStats.relationshipCount} relationships`);
    
    const syncState = await this.syncStateManager.read();
    const lastSync = options.forceFullResync ? null : (syncState?.lastSyncTimestamp || null);
    if (lastSync) {
      console.log(`⏱️  [KG Sync] Last sync: ${new Date(lastSync).toLocaleString()}`);
    }
    
    let newLastSyncTimestamp = new Date().toISOString();

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
        console.log(`💬 [KG Sync] Processing ${messages.length} chat messages...`);
      for (const message of messages) {
        const chatExtracts = await this.processChatMessage(message);
        allExtractedEntities.push(...chatExtracts.entities);
        allExtractedRelationships.push(...chatExtracts.relationships);
      }

      // 2. Fetch Conscious Memories
      // Assuming searchMemories with empty query and large limit fetches all.
      // Needs pagination or streaming for very large datasets.      // Also needs filtering by timestamp for incremental syncs.
      const consciousMemories = await this.consciousMemoryService.searchMemories('', { limit: 10000 }); // High limit
      console.log(`🧠 [KG Sync] Processing ${consciousMemories.length} conscious memories...`);
      for (const memory of consciousMemories) {
         // Basic check: if memory.metadata.updatedAt > lastSync
         // if (options.forceFullResync || !lastSync || (memory.metadata.updatedAt && new Date(memory.metadata.updatedAt) > new Date(lastSync))) {
         // For now, processing all memories if not doing proper timestamp check
          if (options.forceFullResync || !lastSync ) { // Simplified condition
            const memoryExtracts = await this.processConsciousMemory(memory);
            allExtractedEntities.push(...memoryExtracts.entities);
            allExtractedRelationships.push(...memoryExtracts.relationships);
          }
      }      // 3. Fetch RAG-specific memories
      const ragExtracts = await this.syncRAGMemories(lastSync);
      allExtractedEntities.push(...ragExtracts.entities);
      allExtractedRelationships.push(...ragExtracts.relationships);      // 4. Data Aggregation and Deduplication
      const finalExtraction = this.mergeExtractions([{ entities: allExtractedEntities, relationships: allExtractedRelationships }]);
      allExtractedEntities = finalExtraction.entities;
      allExtractedRelationships = finalExtraction.relationships;
      console.log(`🔀 [KG Sync] After deduplication: ${allExtractedEntities.length} entities, ${allExtractedRelationships.length} relationships`);

      // 5. Loading into Neo4j
      await this.kgService.connect(); // Ensure connection
      console.log(`📥 [KG Sync] Loading ${allExtractedEntities.length} entities and ${allExtractedRelationships.length} relationships into Neo4j...`);

      for (const entity of allExtractedEntities) {
        try {
          // Convert ExtractedEntity to KgNode using proper type converter
          await this.kgService.addNode(convertExtractedEntityToKgNode(entity));
        } catch (error) {
          console.error(`[Sync Service] Error adding entity ID ${entity.id} (${entity.label}):`, error);
        }
      }

      for (const rel of allExtractedRelationships) {
        try {
          // Convert ExtractedRelationship to KgRelationship using proper type converter
          await this.kgService.addRelationship(convertExtractedRelationshipToKgRelationship(rel));
        } catch (error) {
          console.error(`[Sync Service] Error adding relationship type ${rel.type} (Source: ${rel.sourceEntityId}, Target: ${rel.targetEntityId}):`, error);
        }      }
      
      // 6. Final Statistics and Completion
      const finalStats = await this.kgService.getStatistics();
      const duration = Date.now() - startTime;
      
      console.log(`\n✅ [KG Sync] Synchronization complete!`);
      console.log(`📊 [KG Sync] Final counts: ${finalStats.nodeCount} nodes (+${finalStats.nodeCount - initialStats.nodeCount}), ${finalStats.relationshipCount} relationships (+${finalStats.relationshipCount - initialStats.relationshipCount})`);
      console.log(`⏱️  [KG Sync] Duration: ${duration}ms`);
      console.log(`🏷️  [KG Sync] Node types: ${finalStats.labels.join(', ')}`);
      console.log(`🔗 [KG Sync] Relationship types: ${finalStats.relationshipTypes.join(', ')}\n`);

      // 7. Update Sync State
      await this.syncStateManager.write({ 
        lastSyncTimestamp: newLastSyncTimestamp,
        lastProcessedIds: { chatMessages: [], consciousMemories: [], ragMemories: [] }
      });    } catch (error) {
      console.error('[Sync Service] Critical error during knowledge graph synchronization:', error);
      // Log detailed error but don't propagate it upward
      console.error('[Sync Service] Error details:', error instanceof Error ? error.stack : 'Unknown error');
      console.error('[Sync Service] Sync operation failed but will not affect other system operations');
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
  private async syncRAGMemories(lastSync: string | null): Promise<{
    entities: ExtractedEntity[];
    relationships: ExtractedRelationship[];
  }> {
    console.log('[Sync Service] Processing RAG memories...');
    
    const allEntities: ExtractedEntity[] = [];
    const allRelationships: ExtractedRelationship[] = [];
    
    // Get memory store instance
    const memoryStore = new ChromaMemoryStore();
    await memoryStore.initialize();
    
    try {
      // Retrieve all memories (ChromaDB doesn't support timestamp filtering directly)
      const searchResults = await memoryStore.retrieveMemories('', {
        limit: 10000
      });
      
      // Filter by timestamp if lastSync is provided
      const filteredResults = lastSync 
        ? searchResults.filter(result => result.metadata.timestamp > lastSync)
        : searchResults;
        
      console.log(`💾 [KG Sync] Processing ${filteredResults.length} RAG memories...`);
      
      for (const result of filteredResults) {
        // Skip if already processed (basic timestamp check)
        if (lastSync && result.metadata.timestamp < lastSync) {
          continue;
        }
        
        // Extract knowledge from memory text
        const extraction = await this.llmService.extractKnowledge(
          result.text,
          `RAG Memory from session ${result.metadata.sessionId}`
        );
        
        allEntities.push(...extraction.entities);
        allRelationships.push(...extraction.relationships);
        
        // Create memory node
        const memoryEntity: ExtractedEntity = {
          id: `rag_memory_${result.id}`,
          label: 'RAGMemory',
          properties: {
            content: result.text,
            timestamp: result.metadata.timestamp,
            messageType: result.metadata.messageType,
            sessionId: result.metadata.sessionId,
            textLength: result.metadata.textLength,
            embedding: result.embedding // Store reference to embedding
          }
        };
        
        allEntities.push(memoryEntity);
        
        // Link to session
        if (result.metadata.sessionId) {
          allRelationships.push({
            sourceEntityId: memoryEntity.id,
            targetEntityId: `session_${result.metadata.sessionId}`,
            type: 'PART_OF_SESSION',
            properties: { timestamp: result.metadata.timestamp }
          });
        }
      }
    } catch (error) {
      console.error('[Sync Service] Error processing RAG memories:', error);
    } finally {
      await memoryStore.cleanup();
    }
    
    return { entities: allEntities, relationships: allRelationships };
  }
  /**
   * Log current Neo4j statistics for monitoring
   */
  public async logStartupStatistics(): Promise<void> {
    try {
      const stats = await this.kgService.getStatistics();
      console.log(`\n📊 [KG Service] Neo4j Statistics:`);
      console.log(`   • Nodes: ${stats.nodeCount}`);
      console.log(`   • Relationships: ${stats.relationshipCount}`);
      console.log(`   • Node Types: ${stats.labels.length > 0 ? stats.labels.join(', ') : 'None'}`);
      console.log(`   • Relationship Types: ${stats.relationshipTypes.length > 0 ? stats.relationshipTypes.join(', ') : 'None'}\n`);
    } catch (error) {
      console.error(`❌ [KG Service] Failed to retrieve Neo4j statistics: ${error}`);
    }
  }
}

const knowledgeGraphSyncService = new KnowledgeGraphSyncService();
export default knowledgeGraphSyncService;
