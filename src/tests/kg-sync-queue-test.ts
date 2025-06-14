import { kgSyncQueue } from '../lib/kg-sync-queue';

async function testQueue() {
  console.log(' Testing KG Sync Queue...');
  
  try {
    await kgSyncQueue.initialize();
    console.log(' Queue initialized');
    
    await kgSyncQueue.addSyncRequest('chat', 1);
    console.log(' Added chat sync request');
    
    const size = await kgSyncQueue.getQueueSize();
    console.log(' Queue size:', size);
    
    // Process one item
    const processed = await kgSyncQueue.processNext(async (request) => {
      console.log(' Processing request:', request.id);
      console.log('   Type:', request.type);
      console.log('   Priority:', request.priority);
      console.log('   Timestamp:', request.timestamp);
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    console.log(' Processed:', processed);
    
    const finalSize = await kgSyncQueue.getQueueSize();
    console.log(' Final queue size:', finalSize);
    
    console.log(' Test completed successfully!');
  } catch (error) {
    console.error(' Test failed:', error);
  }
}

testQueue();
