export interface RetryOptions {
  maxRetries: number;
  backoffMs: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < options.maxRetries) {
        options.onRetry?.(lastError, attempt);
        await new Promise(resolve => 
          setTimeout(resolve, options.backoffMs * attempt)
        );
      }
    }
  }
  
  throw lastError!;
}

export interface SyncQueueItem {
  id: string;
  operation: 'save' | 'update' | 'delete';
  content?: string;
  metadata?: any;
  retryCount: number;
  lastError?: string;
  timestamp: number;
}

export class SyncErrorQueue {
  private queue: SyncQueueItem[] = [];
  private processing = false;
  
  push(item: SyncQueueItem) {
    this.queue.push(item);
    console.log(`[SyncErrorQueue] Added item to retry queue. Queue size: ${this.queue.length}`);
  }
  
  async processQueue(syncFunction: (item: SyncQueueItem) => Promise<void>) {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    console.log(`[SyncErrorQueue] Processing ${this.queue.length} items in retry queue`);
    
    const itemsToProcess = [...this.queue];
    this.queue = [];
    
    for (const item of itemsToProcess) {
      try {
        await withRetry(
          () => syncFunction(item),
          {
            maxRetries: 3,
            backoffMs: 1000,
            onRetry: (error, attempt) => {
              console.log(`[SyncErrorQueue] Retry attempt ${attempt} for item ${item.id}:`, error.message);
              item.retryCount++;
              item.lastError = error.message;
            }
          }
        );
        console.log(`[SyncErrorQueue] Successfully processed item ${item.id}`);
      } catch (error) {
        console.error(`[SyncErrorQueue] Failed to process item ${item.id} after retries:`, error);
        // Put back in queue if not exceeded max retry count
        if (item.retryCount < 10) {
          this.queue.push(item);
        } else {
          console.error(`[SyncErrorQueue] Dropping item ${item.id} after ${item.retryCount} total attempts`);
        }
      }
    }
    
    this.processing = false;
  }
  
  getQueueSize(): number {
    return this.queue.length;
  }
}
