import { NextRequest, NextResponse } from 'next/server';
import knowledgeGraphSyncService from '../../../lib/knowledge-graph-sync-service';
import knowledgeGraphService from '../../../lib/knowledge-graph-service';
import { kgSyncQueue } from '../../../lib/kg-sync-queue';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    switch (action) {
      case 'stats':
        // Get current statistics
        await knowledgeGraphService.connect();
        const stats = await knowledgeGraphService.getStatistics();
        return NextResponse.json({ success: true, stats });

      case 'queue-status':
        // Get sync queue status
        await kgSyncQueue.initialize();
        const queueSize = await kgSyncQueue.getQueueSize();
        return NextResponse.json({ success: true, queueSize });

      default:
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid action. Use ?action=stats or ?action=queue-status' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[KG API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, options = {} } = body;

    switch (action) {
      case 'sync':
        // Queue a sync operation
        await kgSyncQueue.initialize();
        
        if (options.forceFullResync) {
          await kgSyncQueue.enqueue({ type: 'full', timestamp: new Date().toISOString() });
        } else {
          await kgSyncQueue.enqueue({ type: 'incremental', timestamp: new Date().toISOString() });
        }
        
        // Start sync in background (non-blocking)
        knowledgeGraphSyncService.syncKnowledgeGraph(options).catch(error => {
          console.error('[KG API] Background sync error:', error);
        });

        return NextResponse.json({ 
          success: true, 
          message: 'Sync operation queued',
          syncType: options.forceFullResync ? 'full' : 'incremental'
        });

      case 'clear-queue':
        // Clear the sync queue
        await kgSyncQueue.initialize();
        await kgSyncQueue.clear();
        return NextResponse.json({ success: true, message: 'Queue cleared' });

      default:
        return NextResponse.json({ 
          success: false, 
          error: 'Invalid action. Use: sync, clear-queue' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('[KG API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
