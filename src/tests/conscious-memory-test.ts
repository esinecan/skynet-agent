/**
 * Test script for conscious memory functionality
 */

import { getConsciousMemoryService } from '../lib/conscious-memory.js';

async function testConsciousMemory() {
  console.log('🧠 Testing Conscious Memory System...');
  
  try {
    const memoryService = getConsciousMemoryService();
    
    // Test initialization
    console.log('1. Initializing...');
    await memoryService.initialize();
    
    // Test health check
    console.log('2. Health check...');
    const isHealthy = await memoryService.healthCheck();
    console.log(`   Health: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    
    if (!isHealthy) {
      console.log('❌ Memory system is not healthy, stopping test');
      return false;
    }
    
    // Test save memory
    console.log('3. Saving test memory...');
    const testId = await memoryService.saveMemory({
      content: 'This is a test conscious memory about testing the system',
      tags: ['test', 'system', 'validation'],
      importance: 8,
      source: 'explicit',
      context: 'Testing conscious memory functionality'
    });
    console.log(`   Saved with ID: ${testId}`);
    
    // Test search
    console.log('4. Searching memories...');
    const searchResults = await memoryService.searchMemories('test system', {
      limit: 5
    });
    console.log(`   Found ${searchResults.length} results`);    searchResults.forEach((result: any) => {
      console.log(`   - ${result.text.slice(0, 50)}... (score: ${result.score})`);
    });
    
    // Test tags
    console.log('5. Getting all tags...');
    const tags = await memoryService.getAllTags();
    console.log(`   Tags: ${tags.join(', ')}`);
    
    // Test stats
    console.log('6. Getting stats...');
    const stats = await memoryService.getStats();
    console.log(`   Total memories: ${stats.totalConsciousMemories}`);
    console.log(`   Unique tags: ${stats.tagCount}`);
    console.log(`   Average importance: ${stats.averageImportance}`);
    console.log(`   Source breakdown:`, stats.sourceBreakdown);
    
    console.log('✅ All tests passed!');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testConsciousMemory().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { testConsciousMemory };
