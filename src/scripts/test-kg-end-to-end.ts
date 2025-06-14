import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables first
config({ path: join(process.cwd(), '.env') });
config({ path: join(process.cwd(), '.env.local') });

import { LLMService } from '../lib/llm-service';
import knowledgeGraphService from '../lib/knowledge-graph-service';
import knowledgeGraphSyncService from '../lib/knowledge-graph-sync-service';
import { ChatHistoryDatabase } from '../lib/chat-history';
import { ConsciousMemoryService } from '../types/memory';
import { getConsciousMemoryService } from '../lib/conscious-memory';
import { ChromaMemoryStore } from '../lib/memory-store';

async function testEndToEnd() {
  console.log(' Testing Knowledge Graph End-to-End Flow\n');
  
  let llmService: LLMService | null = null;
  let consciousMemory: ConsciousMemoryService | null = null;
  let memoryStore: ChromaMemoryStore | null = null;
  const testSessionId = `test_session_${Date.now()}`;
  
  try {
    // Step 1: Initialize services
    console.log('1⃣ Initializing services...');
    llmService = new LLMService();
    await llmService.initialize();
    
    consciousMemory = getConsciousMemoryService();
    await consciousMemory.initialize();
    
    memoryStore = new ChromaMemoryStore();
    await memoryStore.initialize();
    
    await knowledgeGraphService.connect();
    
    console.log(' Services initialized\n');
    
    // Step 2: Test tool availability
    console.log('2⃣ Testing tool availability...');
    const tools = await llmService.getAvailableTools();
    const kgTools = Object.keys(tools).filter(t => t.includes('knowledge') || t.includes('graph'));
    console.log(`Found ${kgTools.length} knowledge graph tools:`, kgTools);
    console.log(' Tools verified\n');
    
    // Step 3: Create test data through chat history
    console.log('3⃣ Creating test chat data...');
    const chatHistory = ChatHistoryDatabase.getInstance();
    
    // Create session
    const session = chatHistory.createSession({
      id: testSessionId,
      title: 'KG End-to-End Test',
      messages: []
    });
    
    // Add test messages
    chatHistory.addMessage({
      id: `msg_1_${Date.now()}`,
      sessionId: testSessionId,
      role: 'user',
      content: 'John Smith works at OpenAI as a researcher. He is working on GPT-5.'
    });
    
    chatHistory.addMessage({
      id: `msg_2_${Date.now()}`,
      sessionId: testSessionId,
      role: 'assistant',
      content: 'I understand that John Smith is a researcher at OpenAI working on GPT-5. That must be exciting work!'
    });
    
    console.log(' Test chat data created\n');
    
    // Step 4: Store in conscious memory
    console.log('4⃣ Testing conscious memory storage...');
    const memoryId = await consciousMemory.saveMemory({
      content: 'John Smith is a researcher at OpenAI working on GPT-5 development',
      tags: ['test', 'person', 'organization'],
      importance: 8,
      context: 'Test context for KG integration'
    });
    console.log(` Memory saved with ID: ${memoryId}\n`);
    
    // Step 5: Store in RAG memory
    console.log('5⃣ Testing RAG memory storage...');
    await memoryStore.storeMemory(
      'John Smith leads the GPT-5 project at OpenAI',
      {
        sessionId: testSessionId,
        messageType: 'user',
        timestamp: new Date().toISOString(),
        textLength: 42
      }
    );
    console.log(' RAG memory stored\n');
    
    // Step 6: Run knowledge graph sync
    console.log('6⃣ Running knowledge graph sync...');
    const beforeStats = await knowledgeGraphService.getStatistics();
    console.log('Before sync:', beforeStats);
    
    await knowledgeGraphSyncService.syncKnowledgeGraph({ forceFullResync: true });
    
    const afterStats = await knowledgeGraphService.getStatistics();
    console.log('After sync:', afterStats);
    console.log(' Sync completed\n');
    
    // Step 7: Query the knowledge graph
    console.log('7⃣ Querying knowledge graph...');
    
    // Test query for Person nodes
    const personQuery = await knowledgeGraphService.runQuery(
      `MATCH (p:Person) WHERE p.name CONTAINS 'John' RETURN p`
    );
    console.log(`Found ${personQuery.length} Person nodes containing 'John'`);
    
    // Test query for relationships
    const relationshipQuery = await knowledgeGraphService.runQuery(
      `MATCH (p:Person)-[r:WORKS_AT]->(o:Organization) RETURN p.name as person, type(r) as relationship, o.name as organization`
    );
    console.log(`Found ${relationshipQuery.length} WORKS_AT relationships`);
    
    // Test query for memories
    const memoryQuery = await knowledgeGraphService.runQuery(
      `MATCH (m:ConsciousMemory) RETURN count(m) as count`
    );
    console.log(`Found ${memoryQuery[0]?.count || 0} ConsciousMemory nodes`);
    
    console.log(' Queries executed successfully\n');
    
    // Step 8: Test MCP tool calls
    console.log('8⃣ Testing MCP tool calls...');
    
    if (kgTools.includes('knowledge-graph.get_entity_details')) {
      // This would need to be adjusted based on actual entity IDs in the graph
      console.log('Knowledge graph tools available for testing');
    }
    
    // Cleanup test data
    console.log('\n Cleaning up test data...');
    chatHistory.deleteSession(testSessionId);
    await consciousMemory.deleteMemory(memoryId);
    
    console.log('\n End-to-end test completed successfully!');
    
  } catch (error) {
    console.error(' Test failed:', error);
    throw error;
  } finally {
    // Cleanup
    if (llmService) await llmService.cleanup();
    if (memoryStore) await memoryStore.cleanup();
    await knowledgeGraphService.close();
  }
}

// Run the test
testEndToEnd().catch(console.error);
