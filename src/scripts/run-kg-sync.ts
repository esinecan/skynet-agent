/**
 * Knowledge Graph Synchronization Service
 * This script can run as a one-off sync or as a continuous background process
 * 
 * Run modes:
 * - One-time sync: npx tsx src/scripts/run-kg-sync.ts
 * - Background service: npx tsx src/scripts/run-kg-sync.ts --watch
 * - Full resync: npx tsx src/scripts/run-kg-sync.ts --full-resync
 * - Process all queue items: npx tsx src/scripts/run-kg-sync.ts --process-all
 */

// Load environment variables from .env files BEFORE importing any services
import { config } from 'dotenv';
import { join } from 'path';

const envPath = join(process.cwd(), '.env');
const envLocalPath = join(process.cwd(), '.env.local');

config({ path: envPath });
config({ path: envLocalPath });

// Now import services after environment variables are loaded
async function importServices() {
  const { default: knowledgeGraphSyncServiceInstance } = await import('../lib/knowledge-graph-sync-service');
  const { default: knowledgeGraphServiceInstanceNeo4j } = await import('../lib/knowledge-graph-service');
  const { kgSyncQueue } = await import('../lib/kg-sync-queue');
  
  return {
    knowledgeGraphSyncServiceInstance,
    knowledgeGraphServiceInstanceNeo4j,
    kgSyncQueue
  };
}

// Parse command line arguments
const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const forceFullResync = args.includes('--full-resync');
const processAll = args.includes('--process-all');
const syncIntervalMs = 30000; // 30 seconds between sync operations in watch mode

async function runSync() {

  // Import services after environment variables are loaded
  const {
    knowledgeGraphSyncServiceInstance: syncService,
    knowledgeGraphServiceInstanceNeo4j: neo4jService,
    kgSyncQueue
  } = await importServices();

  try {
    // Ensure Neo4j driver is connected
    await neo4jService.connect();
    
    // Initialize queue if not already
    await kgSyncQueue.initialize();
    const queueSize = await kgSyncQueue.getQueueSize();
    
    if (queueSize > 0) {
      console.log(` [KG Sync] Found ${queueSize} items in sync queue`);
      
      // Process queue items if there are any
      if (processAll) {
        const processedCount = await kgSyncQueue.processAll(async (request: any) => {
          // Run appropriate sync based on request type
          if (request.type === 'full') {
            await syncService.syncKnowledgeGraph({ forceFullResync: true });
          } else {
            await syncService.syncKnowledgeGraph({ forceFullResync: false });
          }
        });
        
        console.log(` [KG Sync] Processed ${processedCount} queue items`);
      } else {
        // Process just one item (oldest first)
        const processed = await kgSyncQueue.processNext(async (request: any) => {
          if (request.type === 'full') {
            await syncService.syncKnowledgeGraph({ forceFullResync: true });
          } else {
            await syncService.syncKnowledgeGraph({ forceFullResync: false });
          }
        });
        
        console.log(` [KG Sync] Processed ${processed ? 1 : 0} queue items`);
      }
    } else if (forceFullResync) {
      // If no queue items but full resync requested, run it directly
      await syncService.syncKnowledgeGraph({ forceFullResync: true });
    } else {
      // Regular incremental sync when no queue items exist
      await syncService.syncKnowledgeGraph({ forceFullResync: false });
    }
  } catch (error) {
    console.error(' [KG Sync] Error during synchronization:', error);
    process.exitCode = 1; // Indicate failure
  } finally {
    // Ensure Neo4j connection is closed (unless in watch mode)
    if (!watchMode) {
      try {
        await neo4jService.close();
      } catch (closeError) {
        console.error(' [KG Sync] Error closing Neo4j connection:', closeError);
      }
    }
  }
}

// Main execution flow
async function main() {
  if (watchMode) {
    console.log(` [KG Sync] Starting in continuous watch mode (interval: ${syncIntervalMs}ms)`);
    
    // Run initial sync
    await runSync().catch(error => {
      console.error(' [KG Sync] Error in initial sync:', error);
    });
    
    // Set up interval for continuous operation
    setInterval(async () => {
      try {
        await runSync();
      } catch (error) {
        console.error(' [KG Sync] Error in scheduled sync:', error);
      }
    }, syncIntervalMs);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(' [KG Sync] Shutting down gracefully...');
      try {
        const { knowledgeGraphServiceInstanceNeo4j } = await importServices();
        await knowledgeGraphServiceInstanceNeo4j.close();
      } catch (error) {
        console.error(' [KG Sync] Error during shutdown:', error);
      }
      process.exit(0);
    });
  } else {
    // One-time execution
    await runSync();
    console.log(' [KG Sync] One-time synchronization complete');
  }
}

main().catch(error => {
  console.error(' [KG Sync] Fatal error:', error);
  process.exitCode = 1;
});
