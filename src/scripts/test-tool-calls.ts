import { LLMService } from '../lib/llm-service';
import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables
config({ path: join(process.cwd(), '.env') });
config({ path: join(process.cwd(), '.env.local') });

async function testToolCalls() {
  console.log('Testing Tool Call Integration...\n');
  
  const service = new LLMService();
  await service.initialize();
  
  try {
    // Get available tools
    const tools = await service.getAvailableTools();
    console.log(`✅ Found ${Object.keys(tools).length} tools available`);
    
    // Test a simple tool call
    console.log('\n🔧 Testing conscious memory save...');
    const result = await service.callTool('conscious-memory', 'save_memory', {
      content: 'Test memory from tool call integration test',
      tags: ['test', 'integration'],
      importance: 5,
      context: 'Testing tool call handling'
    });
    
    console.log('Tool call result:', JSON.stringify(result, null, 2));
    
    // Test search to verify it was saved
    console.log('\n🔍 Searching for saved memory...');
    const searchResult = await service.callTool('conscious-memory', 'search_memories', {
      query: 'tool call integration test',
      limit: 5
    });
    
    console.log('Search result:', JSON.stringify(searchResult, null, 2));
    
    console.log('\n✅ Tool call test completed successfully!');
    
  } catch (error) {
    console.error('❌ Tool call test failed:', error);
  } finally {
    await service.cleanup();
  }
}

testToolCalls();
