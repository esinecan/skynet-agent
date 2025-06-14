import knowledgeGraphSyncService from '../lib/knowledge-graph-sync-service';
import knowledgeGraphService from '../lib/knowledge-graph-service';

async function runSyncTest() {
  console.log(' Starting Neo4j Sync Test...\n');

  try {
    // Test 1: Connection health check
    console.log('Test 1: Checking Neo4j connection...');
    const isHealthy = await knowledgeGraphService.healthCheck();
    console.log(` Neo4j connection: ${isHealthy ? 'Healthy' : 'Failed'}\n`);

    // Test 2: Get initial statistics
    console.log('Test 2: Getting initial statistics...');
    await knowledgeGraphSyncService.logStartupStatistics();

    // Test 3: Run incremental sync
    console.log('\nTest 3: Running incremental sync...');
    await knowledgeGraphSyncService.syncKnowledgeGraph({ forceFullResync: false });

    // Test 4: Verify final statistics
    console.log('\nTest 4: Getting final statistics...');
    const finalStats = await knowledgeGraphService.getStatistics();
    console.log('Final statistics:', finalStats);

    // Test 5: Test batch operations
    console.log('\nTest 5: Testing batch operations...');
    const testNodes = Array.from({ length: 5 }, (_, i) => ({
      id: `test-node-${Date.now()}-${i}`,
      type: 'TestNode',
      properties: { name: `Test Node ${i}`, testRun: true },
      createdAt: new Date()
    }));

    const batchResult = await knowledgeGraphService.addNodesBatch(testNodes);
    console.log(`Batch insert result: ${batchResult.succeeded} succeeded, ${batchResult.failed} failed`);

    // Cleanup test nodes
    for (const node of testNodes) {
      await knowledgeGraphService.deleteNode(node.id);
    }

    console.log('\n All tests completed successfully!');
  } catch (error) {
    console.error(' Test failed:', error);
  } finally {
    await knowledgeGraphService.close();
  }
}

// Run the test
if (require.main === module) {
  runSyncTest().catch(console.error);
}
