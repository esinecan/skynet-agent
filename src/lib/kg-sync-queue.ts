import fs from 'fs/promises';
import path from 'path';

export interface SyncRequest {
  id: string;
  timestamp: string;
  type: 'chat' | 'memory' | 'full';
  priority: number;
}

export class KnowledgeGraphSyncQueue {
  private queuePath: string;
  private processing = false;
  
  constructor() {
    this.queuePath = path.join(process.cwd(), 'data', 'kg-sync-queue.json');
  }
  
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.queuePath), { recursive: true });
      
      // Create queue file if it doesn't exist
      try {
        await fs.access(this.queuePath);
      } catch {
        await fs.writeFile(this.queuePath, JSON.stringify({ requests: [] }));
      }
    } catch (error) {
      console.error('[KG Sync Queue] Failed to initialize queue:', error);
    }
  }
  
  async addSyncRequest(type: 'chat' | 'memory' | 'full', priority: number = 1): Promise<void> {
    await this.initialize();
    
    try {
      // Read current queue
      const queueData = await fs.readFile(this.queuePath, 'utf-8');
      const queue = JSON.parse(queueData);
      
      // Add new request
      const request: SyncRequest = {
        id: `sync_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        timestamp: new Date().toISOString(),
        type,
        priority
      };
      
      queue.requests.push(request);
      
      // Write updated queue
      await fs.writeFile(this.queuePath, JSON.stringify(queue, null, 2));
      
      console.log(`[KG Sync Queue] Added ${type} sync request to queue (ID: ${request.id})`);
    } catch (error) {
      console.error('[KG Sync Queue] Failed to add sync request:', error);
    }
  }
  
  async getQueueSize(): Promise<number> {
    await this.initialize();
    
    try {
      const queueData = await fs.readFile(this.queuePath, 'utf-8');
      const queue = JSON.parse(queueData);
      return queue.requests?.length || 0;
    } catch (error) {
      console.error('[KG Sync Queue] Failed to get queue size:', error);
      return 0;
    }
  }
  
  async processNext(processor: (request: SyncRequest) => Promise<void>): Promise<boolean> {
    if (this.processing) {
      console.log('[KG Sync Queue] Already processing queue');
      return false;
    }
    
    this.processing = true;
    
    try {
      // Read queue
      const queueData = await fs.readFile(this.queuePath, 'utf-8');
      const queue = JSON.parse(queueData);
      
      if (!queue.requests || queue.requests.length === 0) {
        console.log('[KG Sync Queue] Queue is empty');
        this.processing = false;
        return false;
      }
      
      // Sort by priority and take the highest
      queue.requests.sort((a: SyncRequest, b: SyncRequest) => b.priority - a.priority);
      const request = queue.requests.shift();
      
      // Update queue file before processing
      await fs.writeFile(this.queuePath, JSON.stringify(queue, null, 2));
        console.log(`[KG Sync Queue] Processing request: ${request.id} (${request.type})`);
      
      // Process the request with a timeout to prevent hanging
      try {
        // Add a timeout to prevent hanging indefinitely
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Processing timeout exceeded (30s)')), 30000);
        });
        
        // Race the processor against the timeout
        await Promise.race([
          processor(request),
          timeoutPromise
        ]);
      } catch (processorError) {
        console.error(`[KG Sync Queue] Error processing request ${request.id}:`, processorError);
        // Don't rethrow - we want to continue processing the queue
      }
      
      console.log(`[KG Sync Queue] Successfully processed request: ${request.id}`);
      this.processing = false;
      return true;
    } catch (error) {
      console.error('[KG Sync Queue] Processing error:', error);
      this.processing = false;
      return false;
    }
  }
  
  async processAll(processor: (request: SyncRequest) => Promise<void>): Promise<number> {
    if (this.processing) {
      console.log('[KG Sync Queue] Already processing queue');
      return 0;
    }
    
    this.processing = true;
    
    try {
      // Read queue
      const queueData = await fs.readFile(this.queuePath, 'utf-8');
      const queue = JSON.parse(queueData);
      
      if (!queue.requests || queue.requests.length === 0) {
        console.log('[KG Sync Queue] Queue is empty');
        this.processing = false;
        return 0;
      }
      
      // Get all requests and clear the queue
      const requests = queue.requests;
      queue.requests = [];
      
      // Update queue file before processing
      await fs.writeFile(this.queuePath, JSON.stringify(queue, null, 2));
      
      console.log(`[KG Sync Queue] Processing ${requests.length} requests`);
      
      // Sort by priority
      requests.sort((a: SyncRequest, b: SyncRequest) => b.priority - a.priority);
      
      // Process all requests
      let processedCount = 0;
      for (const request of requests) {
        try {
          await processor(request);
          processedCount++;
        } catch (error) {
          console.error(`[KG Sync Queue] Error processing request ${request.id}:`, error);
          
          // Add back to queue with reduced priority
          await this.addSyncRequest(request.type, Math.max(0, request.priority - 1));
        }
      }
      
      console.log(`[KG Sync Queue] Finished processing ${processedCount} requests`);
      this.processing = false;
      return processedCount;
    } catch (error) {
      console.error('[KG Sync Queue] Processing error:', error);
      this.processing = false;
      return 0;
    }
  }
  
  async enqueue(request: { type: 'full' | 'chat' | 'memory' | 'incremental', timestamp: string }): Promise<void> {
    // Map 'incremental' type to 'chat' since that's not a valid type for addSyncRequest
    const type = request.type === 'incremental' ? 'chat' : request.type as 'full' | 'chat' | 'memory';
    
    // Default priority: full=2, others=1
    const priority = type === 'full' ? 2 : 1;
    
    return this.addSyncRequest(type, priority);
  }
  
  /**
   * Clear all items from the queue
   */
  async clear(): Promise<void> {
    await this.initialize();
    
    try {
      // Write empty queue to the file
      await fs.writeFile(this.queuePath, JSON.stringify({ requests: [] }, null, 2));
      console.log('[KG Sync Queue] Queue cleared successfully');
    } catch (error) {
      console.error('[KG Sync Queue] Failed to clear queue:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const kgSyncQueue = new KnowledgeGraphSyncQueue();
