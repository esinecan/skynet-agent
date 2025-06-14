import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables first
config({ path: join(process.cwd(), '.env') });
config({ path: join(process.cwd(), '.env.local') });

import knowledgeGraphSyncService from '../lib/knowledge-graph-sync-service';
import knowledgeGraphService from '../lib/knowledge-graph-service';

async function testSync() {
  console.log('Testing Knowledge Graph Sync...\n');
  
  try {
    // Connect to Neo4j
    await knowledgeGraphService.connect();
    console.log(' Connected to Neo4j');
    
    // Get initial stats
    const beforeStats = await knowledgeGraphService.getStatistics();
    console.log(' Before sync:', beforeStats);
    
    // Run incremental sync
    console.log('\n Running incremental sync...');
    await knowledgeGraphSyncService.syncKnowledgeGraph({ forceFullResync: false });
    
    // Get after stats
    const afterStats = await knowledgeGraphService.getStatistics();
    console.log('\n After sync:', afterStats);
    
    console.log('\n Sync test completed successfully!');
    
  } catch (error) {
    console.error(' Sync test failed:', error);
  } finally {
    await knowledgeGraphService.close();
  }
}

testSync();
