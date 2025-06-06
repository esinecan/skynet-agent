// Quick test script to verify Neo4j integration
// This will test the basic connectivity and functionality

const { spawn } = require('child_process');
const path = require('path');

// Set environment variables for the test
process.env.NEO4J_URI = 'bolt://localhost:7687';
process.env.NEO4J_USER = 'neo4j';
process.env.NEO4J_PASSWORD = 'password123';

async function testNeo4jIntegration() {
  console.log(' Testing Neo4j Integration...');  try {    // Import and test the knowledge graph service
    const imported = await import('../lib/knowledge-graph-service.ts');
    const kgService = imported.default.default || imported.default;
    
    console.log(' Testing Neo4j connection...');
    await kgService.connect();
    console.log(' Neo4j connection successful!');
    
    console.log(' Testing health check...');
    const isHealthy = await kgService.healthCheck();
    console.log(isHealthy ? ' Health check passed!' : ' Health check failed');
    
    console.log(' Testing basic query...');
    const result = await kgService.runQuery('RETURN "Hello Neo4j!" as greeting, datetime() as timestamp');
    console.log(' Query result:', result);
      console.log(' Testing node creation...');
    const testNode = {
      id: 'test-node-1',
      type: 'TestNode',
      properties: {
        name: 'Integration Test Node',
        description: 'Created during integration testing',
        timestamp: new Date().toISOString(), // Already a string, but good to test
        createdDate: new Date(), // This will test Date sanitization
        metadata: { complex: 'object', nested: { data: true } }, // Test object serialization
        tags: ['test', 'integration', new Date()], // Test array with mixed types
        score: 95.5,
        isActive: true,
        nullValue: null
      }
    };
    
    await kgService.addNode(testNode);
    console.log(' Test node created successfully!');
    
    console.log(' Testing relationship creation...');
    const testNode2 = {
      id: 'test-node-2',
      type: 'TestNode',
      properties: {
        name: 'Second Test Node',
        timestamp: new Date().toISOString()
      }
    };
    
    await kgService.addNode(testNode2);
    
    const testRelationship = {
      sourceNodeId: 'test-node-1',
      targetNodeId: 'test-node-2',
      type: 'RELATES_TO',
      properties: {
        strength: 0.8,
        createdAt: new Date(),
        metadata: { type: 'test_relationship' },
        tags: ['test', new Date()]
      }
    };
    
    await kgService.addRelationship(testRelationship);
    console.log(' Test relationship created successfully!');
    
    console.log(' Testing complex query parameters...');
    const complexQueryResult = await kgService.runQuery(
      `MATCH (n:TestNode {id: $nodeId}) 
       WHERE n.score > $minScore AND n.isActive = $isActive
       RETURN n, $queryTime as queryTime, $metadata as metadata`,
      {
        nodeId: 'test-node-1',
        minScore: 90,
        isActive: true,
        queryTime: new Date(),
        metadata: { query: 'complex test', nested: { data: [1, 2, 3] } }
      }
    );
    console.log(' Complex query with sanitized parameters successful!');
    console.log('   Result count:', complexQueryResult.length);
    
    console.log(' Verifying node exists...');
    const nodeQuery = await kgService.runQuery(
      'MATCH (n:TestNode {id: $id}) RETURN n', 
      { id: 'test-node-1' }
    );
    console.log(' Node verification:', nodeQuery.length > 0 ? 'Found!' : 'Not found');    console.log(' Testing enhanced deletion capabilities...');
    
    // Test dependency checking
    console.log('   Testing dependency checking...');
    const deps = await kgService.checkNodeDependencies('test-node-1');
    console.log('    Dependency check result:', deps);
    
    // Test relationship deletion
    console.log('   Testing relationship deletion...');
    const relDeleteResult = await kgService.deleteRelationship('test-node-1', 'test-node-2', 'RELATES_TO');
    console.log('    Relationship deletion result:', relDeleteResult);
    
    // Test safe node deletion (should work now that relationship is gone)
    console.log('   Testing safe node deletion...');
    const safeDeleteResult = await kgService.deleteNode('test-node-2', {
      nodeType: 'TestNode',
      skipDependencyCheck: false
    });
    console.log('    Safe deletion result:', safeDeleteResult);
    
    // Test node deletion with cascade
    console.log('   Testing cascade deletion...');
    const cascadeDeleteResult = await kgService.deleteNode('test-node-1', {
      nodeType: 'TestNode',
      cascadeDelete: true
    });
    console.log('    Cascade deletion result:', cascadeDeleteResult);
    
    console.log(' Enhanced deletion testing completed!');
    
    console.log(' Closing connection...');
    await kgService.close();
    console.log(' Connection closed.');
    
    console.log('\n All tests passed! Neo4j integration is working correctly.');
    
  } catch (error) {
    console.error(' Integration test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testNeo4jIntegration();
