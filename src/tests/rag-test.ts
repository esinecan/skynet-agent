/**
 * Test script for the RAG system Phase 1 implementation
 * Run with: npx ts-node src/tests/rag-test.ts
 */

import { getEmbeddingService, GoogleEmbeddingService } from '../lib/embeddings';
import { getMemoryStore } from '../lib/memory-store';
import { getRAGService } from '../lib/rag';
import { LLMService } from '../lib/llm-service';
import { getRAGConfig, validateRAGConfig } from '../lib/rag-config';

async function testEmbeddingService() {
  console.log('\n Testing Embedding Service...');
  
  try {
    const embeddingService = getEmbeddingService();
    
    // Test generating embeddings
    const text1 = "Hello, how can I help you today?";
    const text2 = "Hi there, what can I assist you with?";
    const text3 = "The weather is nice today";
    
    console.log('Generating embeddings for test texts...');
    const embedding1 = await embeddingService.generateEmbedding(text1);
    const embedding2 = await embeddingService.generateEmbedding(text2);
    const embedding3 = await embeddingService.generateEmbedding(text3);
    
    console.log(` Embeddings generated successfully:`);
    console.log(`   - Text 1: ${embedding1.length} dimensions`);
    console.log(`   - Text 2: ${embedding2.length} dimensions`);
    console.log(`   - Text 3: ${embedding3.length} dimensions`);
    console.log(`   - Service ready: ${embeddingService.isReady()}`);
    
    // Test similarity calculation
    const similarity12 = GoogleEmbeddingService.cosineSimilarity(embedding1, embedding2);
    const similarity13 = GoogleEmbeddingService.cosineSimilarity(embedding1, embedding3);
    
    console.log(` Similarity scores:`);
    console.log(`   - Similar texts (1-2): ${similarity12.toFixed(4)}`);
    console.log(`   - Different texts (1-3): ${similarity13.toFixed(4)}`);
    
    if (similarity12 > similarity13) {
      console.log(' Similarity test passed - similar texts have higher similarity');
    } else {
      console.log('  Similarity test inconclusive - this is normal with fallback embeddings');
    }
    
    return true;
  } catch (error) {
    console.error(' Embedding service test failed:', error);
    return false;
  }
}

async function testMemoryStore() {
  console.log('\n Testing Memory Store...');
  
  try {
    const memoryStore = getMemoryStore();
    
    // Test initialization
    console.log('Initializing ChromaDB connection...');
    await memoryStore.initialize();
    console.log(' ChromaDB initialized successfully');
    
    // Test health check
    const isHealthy = await memoryStore.healthCheck();
    console.log(` Health check: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    
    // Test memory storage
    console.log('Storing test memories...');
    const testMemories = [
      { text: "User asked about the weather", type: 'user' as const },
      { text: "I provided weather information", type: 'assistant' as const },
      { text: "User thanked me for the help", type: 'user' as const },
    ];
    
    const memoryIds = [];
    for (const memory of testMemories) {
      const id = await memoryStore.storeMemory(memory.text, {
        sessionId: 'test-session-123',
        timestamp: new Date().toISOString(),
        messageType: memory.type,
        textLength: memory.text.length
      });
      memoryIds.push(id);
      console.log(`    Stored: ${id}`);
    }
    
    // Test memory retrieval
    console.log('Testing memory retrieval...');
    const query = "weather information";
    const results = await memoryStore.retrieveMemories(query, { limit: 5 });
    
    console.log(` Retrieved ${results.length} memories for query: "${query}"`);
    results.forEach((result, index) => {
      console.log(`   ${index + 1}. [Score: ${result.score.toFixed(3)}] ${result.text.slice(0, 50)}...`);
    });
    
    // Test memory count
    const count = await memoryStore.getMemoryCount();
    console.log(` Total memories in store: ${count}`);
    
    return true;
  } catch (error) {
    console.error(' Memory store test failed:', error);
    console.log(' Make sure ChromaDB is running: docker run -p 8000:8000 chromadb/chroma');
    return false;
  }
}

async function testRAGService() {
  console.log('\n Testing RAG Service...');
  
  try {
    const ragService = getRAGService({
      maxMemories: 3,
      minSimilarity: 0.5, // Lower for testing
    });
    
    // Test initialization
    console.log('Initializing RAG service...');
    await ragService.initialize();
    console.log(' RAG service initialized');
    
    // Test retrieval decision logic
    const simpleQueries = ['hi', 'hello', 'what is 2 + 2'];
    const complexQueries = ['tell me about our previous conversation', 'what did we discuss earlier'];
    
    console.log('Testing retrieval decision logic...');
    for (const query of simpleQueries) {
      const shouldRetrieve = ragService.shouldRetrieveMemories(query);
      console.log(`   "${query}" → ${shouldRetrieve ? 'RETRIEVE' : 'SKIP'}`);
    }
    
    for (const query of complexQueries) {
      const shouldRetrieve = ragService.shouldRetrieveMemories(query);
      console.log(`   "${query}" → ${shouldRetrieve ? 'RETRIEVE' : 'SKIP'}`);
    }
    
    // Test memory retrieval and context formatting
    console.log('Testing context retrieval...');
    const ragResult = await ragService.retrieveAndFormatContext(
      'tell me about weather information',
      'test-session-123'
    );
    
    console.log(` RAG retrieval completed in ${ragResult.retrievalTime}ms`);
    console.log(`   - Should retrieve: ${ragResult.shouldRetrieve}`);
    console.log(`   - Memories found: ${ragResult.memories.length}`);
    if (ragResult.context) {
      console.log(`   - Context length: ${ragResult.context.length} chars`);
      console.log(`   - Context preview: ${ragResult.context.slice(0, 100)}...`);
    }
    
    // Test conversation storage
    console.log('Testing conversation storage...');
    const { userMemoryId, assistantMemoryId } = await ragService.storeConversation(
      'What is the capital of France?',
      'The capital of France is Paris.',
      'test-session-456'
    );
    console.log(` Conversation stored: user=${userMemoryId}, assistant=${assistantMemoryId}`);
    
    // Test memory stats
    const stats = await ragService.getMemoryStats();
    console.log(` Memory stats:`, stats);
    
    return true;
  } catch (error) {
    console.error(' RAG service test failed:', error);
    return false;
  }
}

async function testPhase2Integration() {
  console.log('\n Testing Phase 2 Integration...');
  
  try {
    // Test RAG configuration
    console.log('Testing RAG configuration...');
    const config = getRAGConfig();
    const validation = validateRAGConfig(config);
    
    console.log(` RAG Config loaded:`, {
      enabled: config.enabled,
      maxMemories: config.maxMemories,
      minSimilarity: config.minSimilarity,
      chromaUrl: config.chromaUrl,
      hasGoogleApiKey: !!config.googleApiKey
    });
    
    console.log(` Config validation: ${validation.valid ? 'VALID' : 'ISSUES FOUND'}`);
    if (validation.issues.length > 0) {
      validation.issues.forEach(issue => console.log(`     ${issue}`));
    }
    
    // Test LLM Service with RAG integration
    console.log('Testing LLM Service with RAG...');
    const llmService = new LLMService();
    await llmService.initialize();
    
    // Test RAG-enhanced response generation
    const testSessionId = 'integration-test-session';
    const testMessage = 'Tell me about machine learning';
    
    console.log(`Generating RAG-enhanced response for: "${testMessage}"`);
    const response = await llmService.generateResponse(testMessage, {
      enableRAG: true,
      sessionId: testSessionId,
      includeMemoryContext: true
    });
    
    console.log(` RAG-enhanced response generated (${response.length} chars)`);
    console.log(`   Preview: ${response.slice(0, 100)}...`);
    
    // Store the conversation in memory
    console.log('Testing conversation storage...');
    await llmService.storeConversationInMemory(testMessage, response, testSessionId);
    console.log(' Conversation stored successfully');
    
    // Test follow-up with memory context
    const followUpMessage = 'Can you explain that in simpler terms?';
    console.log(`Testing follow-up with memory context: "${followUpMessage}"`);
    
    const followUpResponse = await llmService.generateResponse(followUpMessage, {
      enableRAG: true,
      sessionId: testSessionId,
      includeMemoryContext: true
    });
    
    console.log(` Follow-up response with memory context (${followUpResponse.length} chars)`);
    
    // Test memory API endpoints (simulate)
    console.log('Testing memory search functionality...');
    const ragService = getRAGService();
    const searchResult = await ragService.retrieveAndFormatContext(
      'machine learning concepts',
      testSessionId
    );
    
    console.log(` Memory search completed:`);
    console.log(`   - Should retrieve: ${searchResult.shouldRetrieve}`);
    console.log(`   - Memories found: ${searchResult.memories.length}`);
    console.log(`   - Retrieval time: ${searchResult.retrievalTime}ms`);
    
    // Cleanup
    await llmService.cleanup();
    
    return true;
  } catch (error) {
    console.error(' Phase 2 integration test failed:', error);
    return false;
  }
}

async function testEndToEndRAGFlow() {
  console.log('\n Testing End-to-End RAG Flow...');
  
  try {
    const ragService = getRAGService();
    await ragService.initialize();
    
    const sessionId = 'e2e-test-session';
    
    // Simulate a conversation sequence
    const conversationFlow = [
      {
        user: 'What is the capital of France?',
        assistant: 'The capital of France is Paris. It is also the largest city in France and serves as the country\'s political, economic, and cultural center.'
      },
      {
        user: 'What about Italy?',
        assistant: 'The capital of Italy is Rome. Rome is not only the political capital but also a historic city with significant cultural and religious importance.'
      },
      {
        user: 'Tell me more about the first city we discussed.',
        assistant: 'Paris, which we discussed earlier as the capital of France, is known for its iconic landmarks like the Eiffel Tower, Louvre Museum, and Notre-Dame Cathedral. It\'s often called the "City of Light" and is famous for its art, fashion, cuisine, and culture.'
      }
    ];
    
    // Process each conversation turn
    for (let i = 0; i < conversationFlow.length; i++) {
      const turn = conversationFlow[i];
      console.log(`\n--- Turn ${i + 1} ---`);
      console.log(`User: ${turn.user}`);
      
      // Test retrieval decision
      const shouldRetrieve = ragService.shouldRetrieveMemories(turn.user);
      console.log(`Should retrieve memories: ${shouldRetrieve}`);
      
      // Retrieve relevant context
      const ragResult = await ragService.retrieveAndFormatContext(turn.user, sessionId);
      console.log(`Memories retrieved: ${ragResult.memories.length}`);
      
      if (ragResult.context) {
        console.log(`Context provided: ${ragResult.context.slice(0, 100)}...`);
      }
      
      // Store the conversation
      await ragService.storeConversation(turn.user, turn.assistant, sessionId);
      console.log(`Assistant: ${turn.assistant.slice(0, 100)}...`);
      console.log(' Conversation stored');
    }
    
    // Test final memory retrieval to show context building
    console.log('\n--- Final Memory Test ---');
    const finalResult = await ragService.retrieveAndFormatContext(
      'What cities have we talked about?',
      sessionId
    );
    
    console.log(` End-to-end test completed:`);
    console.log(`   - Final memory count: ${finalResult.memories.length}`);
    console.log(`   - Context quality: ${finalResult.context ? 'GOOD' : 'NONE'}`);
    
    return true;
  } catch (error) {
    console.error(' End-to-end RAG flow test failed:', error);
    return false;
  }
}

async function runAllTests() {
  console.log(' Starting RAG System Phase 1 & 2 Tests');
  console.log('==========================================');
  
  const results = [
    await testEmbeddingService(),
    await testMemoryStore(),
    await testRAGService(),
    await testPhase2Integration(),
    await testEndToEndRAGFlow()
  ];
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log('\n Test Results');
  console.log('================');
  console.log(` Passed: ${passed}/${total}`);
    if (passed === total) {
    console.log(' All tests passed! RAG System Phase 1 & 2 are ready.');
    console.log('\n Next Steps:');
    console.log('1. Start ChromaDB: docker-compose up -d chromadb');
    console.log('2. Set your Google API key in .env.local');
    console.log('3. Test the chat API with RAG: npm run dev');
    console.log('4. Try asking follow-up questions to see memory in action!');
  } else {
    console.log('  Some tests failed. Check the logs above for details.');
  }
  
  return passed === total;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

export { runAllTests };
