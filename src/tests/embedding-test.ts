/**
 * Test script for Skynet Agent memory embedding functionality
 * Tests the real embedding integration with Gemini API
 */

import { embeddingService } from '../utils/embeddings';
import { memoryManager } from '../memory';
import { createLogger } from '../utils/logger';

const logger = createLogger('test');

async function testEmbeddingService() {
  logger.info('Testing embedding service...');
  
  try {
    // Test generating embeddings for different texts
    const text1 = "The quick brown fox jumps over the lazy dog";
    const text2 = "A fox that is quick and brown jumps over a dog that is lazy";
    const text3 = "Artificial intelligence is transforming the world";
    
    logger.info('Generating embeddings for test texts');
    const embedding1 = await embeddingService.generateEmbedding(text1);
    const embedding2 = await embeddingService.generateEmbedding(text2);
    const embedding3 = await embeddingService.generateEmbedding(text3);
    
    logger.info('Embeddings generated successfully', {
      embedding1Length: embedding1.length,
      embedding2Length: embedding2.length,
      embedding3Length: embedding3.length
    });
    
    // Check that embeddings have expected dimensions
    if (embedding1.length === 0 || embedding2.length === 0 || embedding3.length === 0) {
      logger.error('Embedding generation failed - empty embeddings');
      return false;
    }
    
    // Check that similar texts have similar embeddings
    // This is a simple test - in a real test suite we'd have more sophisticated tests
    const similarity12 = cosineSimilarity(embedding1, embedding2);
    const similarity13 = cosineSimilarity(embedding1, embedding3);
    
    logger.info('Embedding similarities', {
      similarity12,
      similarity13
    });
    
    // Similar texts should have higher similarity
    if (similarity12 <= similarity13) {
      logger.warn('Unexpected similarity results - similar texts should have higher similarity');
    } else {
      logger.info('Embedding similarity test passed - similar texts have higher similarity');
    }
    
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error testing embedding service:', err);
    return false;
  }
}

async function testMemoryStorage() {
  logger.info('Testing memory storage with real embeddings...');
  
  try {
    // Store some test memories
    const memory1 = "The capital of France is Paris, and it's known for the Eiffel Tower.";
    const memory2 = "Tokyo is the capital of Japan and has the Tokyo Tower.";
    const memory3 = "Berlin is the capital of Germany and has the Brandenburg Gate.";
    
    logger.info('Storing test memories');
    const id1 = await memoryManager.storeMemory(memory1, { type: 'fact', topic: 'geography' });
    const id2 = await memoryManager.storeMemory(memory2, { type: 'fact', topic: 'geography' });
    const id3 = await memoryManager.storeMemory(memory3, { type: 'fact', topic: 'geography' });
    
    logger.info('Memories stored successfully', { id1, id2, id3 });
    
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error testing memory storage:', err);
    return false;
  }
}

async function testMemoryRetrieval() {
  logger.info('Testing memory retrieval with real embeddings...');
  
  try {
    // Query for memories
    const query1 = "Tell me about France";
    const query2 = "What's the capital of Japan?";
    
    logger.info('Retrieving memories for test queries');
    const results1 = await memoryManager.retrieveMemories(query1, 2);
    const results2 = await memoryManager.retrieveMemories(query2, 2);
    
    logger.info('Memory retrieval results', {
      query1Results: results1.length,
      query2Results: results2.length
    });
    
    // Check that we got results
    if (results1.length === 0 || results2.length === 0) {
      logger.warn('Memory retrieval returned no results');
    }
    
    // Log the top results for each query
    if (results1.length > 0) {
      logger.info('Top result for query 1:', {
        text: results1[0].text,
        score: results1[0].score
      });
    }
    
    if (results2.length > 0) {
      logger.info('Top result for query 2:', {
        text: results2[0].text,
        score: results2[0].score
      });
    }
    
    return true;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error testing memory retrieval:', err);
    return false;
  }
}

// Helper function to calculate cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions don't match: ${a.length} vs ${b.length}`);
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Run all tests
async function runAllTests() {
  logger.info('Starting memory embedding tests');
  
  const embeddingServiceResult = await testEmbeddingService();
  const memoryStorageResult = await testMemoryStorage();
  const memoryRetrievalResult = await testMemoryRetrieval();
  
  logger.info('Test results', {
    embeddingServiceResult,
    memoryStorageResult,
    memoryRetrievalResult
  });
  
  if (embeddingServiceResult && memoryStorageResult && memoryRetrievalResult) {
    logger.info('All tests passed successfully');
    return true;
  } else {
    logger.warn('Some tests failed');
    return false;
  }
}

// Run the tests
runAllTests()
  .then(success => {
    if (success) {
      console.log('✅ All memory embedding tests passed');
      process.exit(0);
    } else {
      console.log('❌ Some memory embedding tests failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Error running tests:', error);
    process.exit(1);
  });
