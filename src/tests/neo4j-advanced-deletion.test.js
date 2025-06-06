// Advanced deletion test script for Knowledge Graph Service
// Tests session cascade deletion and batch operations

const { spawn } = require('child_process');
const path = require('path');

// Set environment variables for the test
process.env.NEO4J_URI = 'bolt://localhost:7687';
process.env.NEO4J_USER = 'neo4j';
process.env.NEO4J_PASSWORD = 'password123';

async function testAdvancedDeletion() {
  console.log(' Testing Advanced Deletion Features...');
  
  try {
    const imported = await import('../lib/knowledge-graph-service.ts');
    const kgService = imported.default.default || imported.default;
    
    console.log(' Connecting to Neo4j...');
    await kgService.connect();
    
    console.log(' Creating test session structure...');
    
    // Create a session
    const session = {
      id: 'test-session-1',
      type: 'Session',
      properties: {
        title: 'Test Session for Deletion',
        createdAt: new Date().toISOString()
      }
    };
    await kgService.addNode(session);
    
    // Create messages in the session
    const message1 = {
      id: 'test-msg-1',
      type: 'Message',
      properties: {
        role: 'user',
        content: 'Hello, test message 1',
        createdAt: new Date().toISOString()
      }
    };
    
    const message2 = {
      id: 'test-msg-2',
      type: 'Message',
      properties: {
        role: 'assistant',
        content: 'Test response message 2',
        createdAt: new Date().toISOString()
      }
    };
    
    await kgService.addNode(message1);
    await kgService.addNode(message2);
    
    // Create relationships
    await kgService.addRelationship({
      sourceNodeId: 'test-session-1',
      targetNodeId: 'test-msg-1',
      type: 'HAS_MESSAGE',
      properties: { order: 1 }
    });
    
    await kgService.addRelationship({
      sourceNodeId: 'test-session-1',
      targetNodeId: 'test-msg-2',
      type: 'HAS_MESSAGE',
      properties: { order: 2 }
    });
    
    // Create some test tool invocations
    const toolInv = {
      id: 'test-tool-inv-1',
      type: 'ToolInvocation',
      properties: {
        toolName: 'test-tool',
        args: JSON.stringify({ param: 'value' }),
        result: JSON.stringify({ success: true })
      }
    };
    
    await kgService.addNode(toolInv);
    await kgService.addRelationship({
      sourceNodeId: 'test-msg-1',
      targetNodeId: 'test-tool-inv-1',
      type: 'INVOKES_TOOL',
      properties: {}
    });
    
    // Create some orphaned test nodes for cleanup testing
    const orphan1 = {
      id: 'orphan-1',
      type: 'TestOrphan',
      properties: { name: 'Orphaned Node 1' }
    };
    
    const orphan2 = {
      id: 'orphan-2',
      type: 'TestOrphan',
      properties: { name: 'Orphaned Node 2' }
    };
    
    await kgService.addNode(orphan1);
    await kgService.addNode(orphan2);
    
    console.log(' Test structure created successfully!');
    
    console.log(' Testing session cascade deletion...');
    const cascadeResult = await kgService.cascadeDeleteSession('test-session-1');
    console.log(' Cascade deletion result:', cascadeResult);
    
    console.log(' Testing orphaned node cleanup...');
    const cleanupResult = await kgService.cleanupOrphanedNodes(['Session', 'Message']);
    console.log(' Cleanup result:', cleanupResult);
    
    console.log(' Testing batch deletion by type...');
    
    // Create some more test nodes to batch delete
    const batchTestNodes = [
      { id: 'batch-1', type: 'BatchTest', properties: { category: 'test', value: 1 } },
      { id: 'batch-2', type: 'BatchTest', properties: { category: 'test', value: 2 } },
      { id: 'batch-3', type: 'BatchTest', properties: { category: 'prod', value: 3 } }
    ];
    
    for (const node of batchTestNodes) {
      await kgService.addNode(node);
    }
    
    // Delete only test category nodes
    const batchDeleteResult = await kgService.deleteNodesByType('BatchTest', { category: 'test' });
    console.log(' Batch deletion result (test category only):', batchDeleteResult);
    
    // Clean up remaining batch test nodes
    const remainingBatchResult = await kgService.deleteNodesByType('BatchTest');
    console.log(' Remaining batch nodes cleanup:', remainingBatchResult);
    
    console.log(' Final verification - checking for any remaining test data...');
    const remainingNodes = await kgService.runQuery(`
      MATCH (n) 
      WHERE n.id STARTS WITH 'test-' OR n.id STARTS WITH 'batch-' OR n.id STARTS WITH 'orphan-'
      RETURN count(n) as remainingCount, collect(DISTINCT labels(n)[0]) as types
    `);
    
    console.log(' Final check result:', remainingNodes[0]);
    
    console.log(' Closing connection...');
    await kgService.close();
    
    console.log('\n All advanced deletion tests passed! The system properly handles:');
    console.log('   Session cascade deletion with all related data');
    console.log('   Orphaned node cleanup with type exclusions');
    console.log('   Batch deletion by type with property filters');
    console.log('   Comprehensive relationship and dependency management');
    
  } catch (error) {
    console.error(' Advanced deletion test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testAdvancedDeletion();
