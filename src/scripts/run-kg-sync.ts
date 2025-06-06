/**
 * Script to manually trigger Knowledge Graph synchronization.
 * This script can be scheduled using OS-level cron jobs or other scheduling mechanisms.
 * For a Node.js application that runs continuously, a library like 'node-cron' could be used
 * to schedule this task internally.
 *
 * Example OS cron job (runs daily at 2 AM):
 * 0 2 * * * /usr/bin/node /path/to/your/project/node_modules/.bin/tsx /path/to/your/project/src/scripts/run-kg-sync.ts >> /var/log/kg-sync.log 2>&1
 *
 * To run manually for development/testing:
 * npm run kg:sync
 * or
 * npx tsx ./src/scripts/run-kg-sync.ts
 *
 * To force a full resync:
 * npx tsx ./src/scripts/run-kg-sync.ts --full-resync
 */

import knowledgeGraphSyncServiceInstance from '../lib/knowledge-graph-sync-service';
import knowledgeGraphServiceInstanceNeo4j from '../lib/knowledge-graph-service'; // Neo4j direct service

async function runSync() {
  console.log('Starting Knowledge Graph synchronization script...');

  // Determine if a full resync is requested from command line arguments
  const forceFullResync = process.argv.includes('--full-resync');
  if (forceFullResync) {
    console.log('Full resync requested.');
  }

  const syncService = knowledgeGraphSyncServiceInstance;
  const neo4jService = knowledgeGraphServiceInstanceNeo4j;

  try {
    // Ensure Neo4j driver is connected before starting the sync
    // KnowledgeGraphSyncService constructor already calls connect, but explicit call here is fine for a script
    await neo4jService.connect();
    console.log('Neo4j service connected.');

    console.log(`Initiating knowledge graph synchronization (forceFullResync: ${forceFullResync})...`);
    await syncService.syncKnowledgeGraph({ forceFullResync });
    console.log('Knowledge Graph synchronization completed successfully.');
  } catch (error) {
    console.error('Error during Knowledge Graph synchronization:', error);
    process.exitCode = 1; // Indicate failure
  } finally {
    // Ensure Neo4j driver connection is closed
    try {
      await neo4jService.close();
      console.log('Neo4j service connection closed.');
    } catch (closeError) {
      console.error('Error closing Neo4j service connection:', closeError);
      if (!process.exitCode) { // If no prior error, set exit code for close error
        process.exitCode = 1;
      }
    }
  }
}

runSync()
  .then(() => {
    console.log('Synchronization script finished.');
    // process.exitCode will be 0 if successful, 1 if error occurred
  })
  .catch(error => {
    // This catch is for unhandled promise rejections in runSync itself, though try/finally should handle most.
    console.error('Unhandled error in runSync:', error);
    process.exitCode = 1;
  });
