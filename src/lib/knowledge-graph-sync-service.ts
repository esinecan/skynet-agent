import knowledgeGraphService, { KgRelationship } from './knowledge-graph-service';
import { KgNode } from '../types/knowledge-graph';
import { LLMService, ExtractedEntity, ExtractedRelationship, KnowledgeExtractionResult } from './llm-service';
import { extractUsingRules, RuleBasedExtractionResult } from './rule-based-extractor';
import { ChatHistoryDatabase, ChatMessage, ChatSession } from './chat-history';
import { getConsciousMemoryService } from './conscious-memory'; // Import the service getter function
import type { ConsciousMemoryService, ConsciousMemorySearchResult, ConsciousMemory, ConsciousMemoryMetadata } from '../types/memory'; // Import types
import { ChromaMemoryStore } from './memory-store'; // For RAG memories, if separate processing is needed

// Define a simple structure for tracking sync progress
interface SyncState {
  lastSyncTimestamp: string | null; // ISO 8601 date string
  // other relevant state info, e.g., lastProcessedMessageId, lastProcessedMemoryId
}

const SYNC_STATE_FILE_PATH = './sync_state.json'; // Or use a database

export class KnowledgeGraphSyncService {
  private kgService: typeof knowledgeGraphService;
  private llmService: LLMService;
  private chatHistoryDB: ChatHistoryDatabase;
  private consciousMemoryService: ConsciousMemoryService;
  // private ragMemoryStore: ChromaMemoryStore; // If direct access is needed

  constructor() {
    this.kgService = knowledgeGraphService; // Singleton instance
    this.llmService = new LLMService(); // Assuming default constructor is fine
    this.chatHistoryDB = ChatHistoryDatabase.getInstance(); // Use singleton pattern

    // Initialize ConsciousMemoryService using singleton pattern
    this.consciousMemoryService = getConsciousMemoryService();

    // Ensure Neo4j driver is ready (connect method in KnowledgeGraphService)
    // This might be better handled explicitly before sync, or internally by KnowledgeGraphService methods
    this.kgService.connect().catch(console.error);
  }

  private async readSyncState(): Promise<SyncState> {
    try {
      // In a real app, use fs.promises.readFile
      // For now, this is a placeholder as direct fs access in this environment might be restricted.
      // const data = await fs.promises.readFile(SYNC_STATE_FILE_PATH, 'utf-8');
      // return JSON.parse(data);
      console.log(`[Sync Service] Reading sync state from ${SYNC_STATE_FILE_PATH} (simulated)`);
      // Simulate reading: if a file existed, it would be read here.
      // For now, assume no prior state or handle it if a 'read_files' tool were available for this.
      const stateContent = global.localStorage?.getItem(SYNC_STATE_FILE_PATH);
      if (stateContent) {
        return JSON.parse(stateContent);
      }
      return { lastSyncTimestamp: null };
    } catch (error) {
      // If file doesn't exist or other error, assume first sync
      console.warn('[Sync Service] Sync state file not found or error reading, assuming first sync:', error);
      return { lastSyncTimestamp: null };
    }
  }

  private async writeSyncState(state: SyncState): Promise<void> {
    try {
      // In a real app, use fs.promises.writeFile
      // await fs.promises.writeFile(SYNC_STATE_FILE_PATH, JSON.stringify(state, null, 2));
      console.log(`[Sync Service] Writing sync state to ${SYNC_STATE_FILE_PATH} (simulated):`, state);
      global.localStorage?.setItem(SYNC_STATE_FILE_PATH, JSON.stringify(state));
    } catch (error) {
      console.error('[Sync Service] Error writing sync state:', error);
    }
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
    console.log(`[Sync Service] Processing chat message ID: ${message.id}, Session ID: ${message.sessionId}`);
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
    console.log(`[Sync Service] Processing conscious memory ID: ${memory.id}`);
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
  }

  public async syncKnowledgeGraph(options: { forceFullResync?: boolean } = {}): Promise<void> {
    console.log(`[Sync Service] Starting knowledge graph synchronization. Force resync: ${options.forceFullResync}`);
    const syncState = await this.readSyncState();
    const lastSync = options.forceFullResync ? null : syncState.lastSyncTimestamp;
    let newLastSyncTimestamp = new Date().toISOString();

    let allExtractedEntities: ExtractedEntity[] = [];
    let allExtractedRelationships: ExtractedRelationship[] = [];

    try {
      // 1. Fetch Chat History
      console.log('[Sync Service] Fetching chat history...');
      const sessions = await this.chatHistoryDB.getAllSessions();
      for (const session of sessions) {
        // TODO: Implement fetching messages since lastSync for incremental updates
        // For now, fetching all messages in a session if any message is new, or if full resync.
        // This requires message timestamps in ChatHistoryDatabase.
        const messages = session.messages; // Messages are already loaded with the session
        for (const message of messages) {
            // Basic check: if message.createdAt > lastSync (needs createdAt on message)
            // if (options.forceFullResync || !lastSync || (message.createdAt && new Date(message.createdAt) > new Date(lastSync))) {
            // For now, processing all messages if not doing proper timestamp check
             if (options.forceFullResync || !lastSync ) { // Simplified condition
                const chatExtracts = await this.processChatMessage(message);
                allExtractedEntities.push(...chatExtracts.entities);
                allExtractedRelationships.push(...chatExtracts.relationships);
             }
        }
      }

      // 2. Fetch Conscious Memories
      console.log('[Sync Service] Fetching conscious memories...');
      // Assuming searchMemories with empty query and large limit fetches all.
      // Needs pagination or streaming for very large datasets.      // Also needs filtering by timestamp for incremental syncs.
      const consciousMemories = await this.consciousMemoryService.searchMemories('', { limit: 10000 }); // High limit
      for (const memory of consciousMemories) {
         // Basic check: if memory.metadata.updatedAt > lastSync
         // if (options.forceFullResync || !lastSync || (memory.metadata.updatedAt && new Date(memory.metadata.updatedAt) > new Date(lastSync))) {
         // For now, processing all memories if not doing proper timestamp check
          if (options.forceFullResync || !lastSync ) { // Simplified condition
            const memoryExtracts = await this.processConsciousMemory(memory);
            allExtractedEntities.push(...memoryExtracts.entities);
            allExtractedRelationships.push(...memoryExtracts.relationships);
          }
      }

      // 3. Fetch RAG-specific memories (if different from Conscious Memories)
      // This part depends on how RAG memories are stored and if they provide unique information
      // not already covered by chat history or conscious memory.
      // For now, assuming conscious memories cover RAG-relevant data.
      console.log('[Sync Service] Skipping separate RAG memory processing (assumed covered).');


      // 4. Data Aggregation and Deduplication
      console.log(`[Sync Service] Aggregating and deduplicating ${allExtractedEntities.length} entities and ${allExtractedRelationships.length} relationships.`);
      const finalExtraction = this.mergeExtractions([{ entities: allExtractedEntities, relationships: allExtractedRelationships }]);
      allExtractedEntities = finalExtraction.entities;
      allExtractedRelationships = finalExtraction.relationships;
      console.log(`[Sync Service] After deduplication: ${allExtractedEntities.length} entities, ${allExtractedRelationships.length} relationships.`);

      // 5. Loading into Neo4j
      console.log('[Sync Service] Loading data into Neo4j...');
      await this.kgService.connect(); // Ensure connection

      for (const entity of allExtractedEntities) {
        try {
          // Convert ExtractedEntity to KgNode if necessary, assuming they are compatible for now
          await this.kgService.addNode(entity as unknown as KgNode);
        } catch (error) {
          console.error(`[Sync Service] Error adding entity ID ${entity.id} (${entity.label}):`, error);
        }
      }

      for (const rel of allExtractedRelationships) {
        try {
          // Convert ExtractedRelationship to KgRelationship if necessary
          await this.kgService.addRelationship(rel as unknown as KgRelationship);
        } catch (error) {
          console.error(`[Sync Service] Error adding relationship type ${rel.type} (Source: ${rel.sourceEntityId}, Target: ${rel.targetEntityId}):`, error);
        }
      }
      console.log('[Sync Service] Data loading into Neo4j complete.');

      // 6. Update Sync State
      await this.writeSyncState({ lastSyncTimestamp: newLastSyncTimestamp });
      console.log('[Sync Service] Knowledge graph synchronization complete.');

    } catch (error) {
      console.error('[Sync Service] Critical error during knowledge graph synchronization:', error);
      // Decide if to rollback or how to handle partial syncs
    } finally {
      await this.kgService.close(); // Close driver if opened by this service instance
    }
  }
}

const knowledgeGraphSyncService = new KnowledgeGraphSyncService();
export default knowledgeGraphSyncService;
