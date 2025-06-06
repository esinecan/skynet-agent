import { getNeo4jService } from '../src/lib/neo4j-service';

// Set default Neo4j credentials for testing (these match our Docker setup)
process.env.NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
process.env.NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
process.env.NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password123';

async function testNeo4jConnection() {
  console.log('Starting Neo4j connection test...');
  console.log(`Connecting to: ${process.env.NEO4J_URI}`);
  const neo4jService = getNeo4jService();

  try {
    await neo4jService.initialize();
    console.log('🔗 Neo4j connection test successful!');

    // Optional: Create a test node
    const testNode = await neo4jService.createNode('TestNode', { id: 'agent-test-node-1', name: 'AgentTest', timestamp: new Date().toISOString() });
    console.log('Created test node:', testNode);

    // Optional: Find the test node
    const foundNode = await neo4jService.findNode('TestNode', 'id', 'agent-test-node-1');
    console.log('Found test node:', foundNode);

    // Optional: Create a relationship (requires another node, or create one)
    const anotherNode = await neo4jService.createNode('AnotherNode', { id: 'agent-test-node-2', description: 'A second test node' });
    console.log('Created another node:', anotherNode);

    const relationship = await neo4jService.createRelationship(
      testNode.id || 'agent-test-node-1', 'TestNode',
      anotherNode.id || 'agent-test-node-2', 'AnotherNode',
      'RELATES_TO',
      { reason: 'testing' }
    );
    console.log('Created relationship:', relationship);

  } catch (error) {
    console.error('❌ Neo4j connection test failed:', error);
  } finally {
    await neo4jService.close();
    console.log('🔗 Neo4j connection closed.');
  }
}

testNeo4jConnection();
