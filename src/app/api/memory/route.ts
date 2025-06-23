import { NextRequest, NextResponse } from 'next/server';
import { getRAGService } from '../../../lib/rag';
import { getMemoryStore } from '../../../lib/memory-store';
import { ChromaClient } from 'chromadb';

// Enhanced diagnostic function
async function checkChromaConnection(): Promise<{ connected: boolean; error?: string; details?: any }> {
  try {
    const chromaUrl = process.env.CHROMA_URL || 'http://localhost:8000';
    const client = new ChromaClient({ path: chromaUrl });
    
    // Try to list collections as a connection test
    const collections = await client.listCollections();
    
    return {
      connected: true,
      details: {
        url: chromaUrl,
        collections: collections.length,
        collectionNames: collections.map((c: any) => c.name)
      }
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
      details: {
        url: process.env.CHROMA_URL || 'http://localhost:8000',
        hint: 'Make sure ChromaDB is running: docker-compose up -d chromadb'
      }
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'stats';
    
    // Check ChromaDB connection first for all actions
    const chromaCheck = await checkChromaConnection();
    if (!chromaCheck.connected) {
      return NextResponse.json({
        success: false,
        error: 'ChromaDB connection failed',
        message: chromaCheck.error,
        diagnostics: chromaCheck.details
      }, { status: 503 });
    }
    
    const ragService = getRAGService();
    
    switch (action) {
      case 'stats':
        try {
          const stats = await ragService.getMemoryStats();
          return NextResponse.json({
            success: true,
            data: {
              ...stats,
              chromaStatus: chromaCheck.details
            }
          });
        } catch (statsError) {
          return NextResponse.json({
            success: false,
            error: 'Failed to get memory stats',
            message: statsError instanceof Error ? statsError.message : 'Unknown error',
            chromaStatus: chromaCheck.details
          }, { status: 500 });
        }
        
      case 'health':
        try {
          const memoryStore = getMemoryStore();
          const health = await memoryStore.healthCheck();
          return NextResponse.json({
            success: true,
            data: { 
              healthy: health,
              chromaConnected: chromaCheck.connected,
              chromaDetails: chromaCheck.details
            }
          });
        } catch (healthError) {
          return NextResponse.json({
            success: false,
            error: 'Health check failed',
            message: healthError instanceof Error ? healthError.message : 'Unknown error',
            chromaStatus: chromaCheck.details
          }, { status: 500 });
        }
        
      case 'test':
        try {
          const testResult = await ragService.testRAGSystem();
          return NextResponse.json({
            success: true,
            data: { 
              testPassed: testResult,
              chromaConnected: chromaCheck.connected
            }
          });
        } catch (testError) {
          return NextResponse.json({
            success: false,
            error: 'Test failed',
            message: testError instanceof Error ? testError.message : 'Unknown error',
            chromaStatus: chromaCheck.details
          }, { status: 500 });
        }
        
      case 'diagnostics':
        // New action for detailed diagnostics
        return NextResponse.json({
          success: true,
          data: {
            chromaDB: chromaCheck,
            environment: {
              CHROMA_URL: process.env.CHROMA_URL || 'http://localhost:8000 (default)',
              CHROMA_COLLECTION: process.env.CHROMA_COLLECTION || 'mcp_chat_memories (default)',
              GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ? 'Set' : 'Not set'
            },
            instructions: {
              ifChromaNotRunning: [
                '1. Make sure Docker is running',
                '2. Run: docker-compose up -d chromadb',
                '3. Wait 30 seconds for ChromaDB to start',
                '4. Refresh this page'
              ],
              ifEmbeddingsFail: [
                '1. Make sure GOOGLE_API_KEY is set in .env.local',
                '2. Restart the Next.js server: npm run dev'
              ]
            }
          }
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: stats, health, test, diagnostics'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Memory API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process memory request',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, query, sessionId, limit, minScore, userMessage, assistantMessage } = body;
    
    // Check ChromaDB connection first
    const chromaCheck = await checkChromaConnection();
    if (!chromaCheck.connected) {
      return NextResponse.json({
        success: false,
        error: 'ChromaDB connection failed',
        message: chromaCheck.error,
        diagnostics: chromaCheck.details
      }, { status: 503 });
    }
    
    const ragService = getRAGService();
    
    switch (action) {
      case 'search':
        try {
          const searchResult = await ragService.retrieveAndFormatContext(
            query || '', 
            sessionId, 
            { listAll: body.listAll || false }
          );
          return NextResponse.json({
            success: true,
            data: {
              shouldRetrieve: searchResult.shouldRetrieve,
              memories: searchResult.memories,
              context: searchResult.context,
              retrievalTime: searchResult.retrievalTime
            }
          });
        } catch (searchError) {
          return NextResponse.json({
            success: false,
            error: 'Search failed',
            message: searchError instanceof Error ? searchError.message : 'Unknown error',
            chromaStatus: chromaCheck.details
          }, { status: 500 });
        }
        
      case 'store':
        if (!userMessage || !assistantMessage || !sessionId) {
          return NextResponse.json({
            success: false,
            error: 'userMessage, assistantMessage, and sessionId are required'
          }, { status: 400 });
        }
        
        try {
          const storeResult = await ragService.storeConversation(userMessage, assistantMessage, sessionId);
          return NextResponse.json({
            success: true,
            data: storeResult
          });
        } catch (storeError) {
          return NextResponse.json({
            success: false,
            error: 'Store failed',
            message: storeError instanceof Error ? storeError.message : 'Unknown error',
            chromaStatus: chromaCheck.details
          }, { status: 500 });
        }
        
      case 'delete':
        if (!body.memoryId) {
          return NextResponse.json({
            success: false,
            error: 'memoryId is required for delete action'
          }, { status: 400 });
        }
        
        try {
          const memoryStore = getMemoryStore();
          const deleteResult = await memoryStore.deleteMemory(body.memoryId);
          return NextResponse.json({
            success: true,
            data: { deleted: deleteResult }
          });
        } catch (deleteError) {
          return NextResponse.json({
            success: false,
            error: 'Delete failed',
            message: deleteError instanceof Error ? deleteError.message : 'Unknown error',
            chromaStatus: chromaCheck.details
          }, { status: 500 });
        }
        
      case 'deleteBulk':
        if (!body.memoryIds || !Array.isArray(body.memoryIds) || body.memoryIds.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'memoryIds array is required for deleteBulk action'
          }, { status: 400 });
        }
        
        try {
          const memoryStore = getMemoryStore();
          const deleteResult = await memoryStore.deleteMemories(body.memoryIds);
          return NextResponse.json({
            success: true,
            data: { deleted: deleteResult, count: body.memoryIds.length }
          });
        } catch (deleteBulkError) {
          return NextResponse.json({
            success: false,
            error: 'Bulk delete failed',
            message: deleteBulkError instanceof Error ? deleteBulkError.message : 'Unknown error',
            chromaStatus: chromaCheck.details
          }, { status: 500 });
        }
        
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Supported actions: search, store, delete, deleteBulk'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Memory API Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process memory request',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    }, { status: 500 });
  }
}
