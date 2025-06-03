import { NextRequest, NextResponse } from 'next/server';
import { getRAGService } from '../../../lib/rag';
import { getMemoryStore } from '../../../lib/memory-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    
    const ragService = getRAGService();
    
    switch (action) {
      case 'stats':
        const stats = await ragService.getMemoryStats();
        return NextResponse.json({
          success: true,
          data: stats
        });
        
      case 'health':
        const memoryStore = getMemoryStore();
        const health = await memoryStore.healthCheck();
        return NextResponse.json({
          success: true,
          data: { healthy: health }
        });
        
      case 'test':
        const testResult = await ragService.testRAGSystem();
        return NextResponse.json({
          success: true,
          data: { testPassed: testResult }
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: stats, health, test'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('❌ Memory API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process memory request',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, query, sessionId, limit, minScore } = await request.json();
    
    const ragService = getRAGService();
    
    switch (action) {
      case 'search':
        if (!query) {
          return NextResponse.json({
            success: false,
            error: 'Query is required for search'
          }, { status: 400 });
        }
        
        const searchResult = await ragService.retrieveAndFormatContext(query, sessionId);
        return NextResponse.json({
          success: true,
          data: {
            shouldRetrieve: searchResult.shouldRetrieve,
            memories: searchResult.memories,
            context: searchResult.context,
            retrievalTime: searchResult.retrievalTime
          }
        });
        
      case 'store':
        const { userMessage, assistantMessage } = await request.json();
        if (!userMessage || !assistantMessage || !sessionId) {
          return NextResponse.json({
            success: false,
            error: 'userMessage, assistantMessage, and sessionId are required'
          }, { status: 400 });
        }
        
        const storeResult = await ragService.storeConversation(userMessage, assistantMessage, sessionId);
        return NextResponse.json({
          success: true,
          data: storeResult
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: search, store'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('❌ Memory API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process memory request',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
