/**
 * API route for conscious memory operations
 * Provides REST endpoints for testing conscious memory functionality
 */

import { NextRequest, NextResponse } from 'next/server';
import { getConsciousMemoryService } from '../../../lib/conscious-memory';

export async function POST(request: NextRequest) {
  try {
    const { action, ...params } = await request.json();
    const memoryService = getConsciousMemoryService();
    
    // Initialize service if needed
    if (!(await memoryService.healthCheck())) {
      await memoryService.initialize();
    }

    switch (action) {
      case 'save':
        const id = await memoryService.saveMemory({
          content: params.content,
          tags: params.tags || [],
          importance: params.importance || 5,
          source: params.source || 'explicit',
          context: params.context,
          sessionId: params.sessionId
        });
        return NextResponse.json({ success: true, id });

      case 'search':
        const results = await memoryService.searchMemories(params.query, {
          tags: params.tags,
          importanceMin: params.importanceMin,
          importanceMax: params.importanceMax,
          limit: params.limit || 10,
          sessionId: params.sessionId
        });
        return NextResponse.json({ success: true, results });

      case 'update':
        const updateSuccess = await memoryService.updateMemory({
          id: params.id,
          content: params.content,
          tags: params.tags,
          importance: params.importance,
          context: params.context
        });
        return NextResponse.json({ success: updateSuccess });

      case 'delete':
        const deleteSuccess = await memoryService.deleteMemory(params.id);
        return NextResponse.json({ success: deleteSuccess });

      case 'tags':
        const tags = await memoryService.getAllTags();
        return NextResponse.json({ success: true, tags });

      case 'related':
        const relatedMemories = await memoryService.getRelatedMemories(
          params.id, 
          params.limit || 5
        );
        return NextResponse.json({ success: true, relatedMemories });

      case 'stats':
        const stats = await memoryService.getStats();
        return NextResponse.json({ success: true, stats });

      case 'test':
        const testResult = await memoryService.testMemorySystem();
        return NextResponse.json({ success: true, testPassed: testResult });

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Conscious memory API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const memoryService = getConsciousMemoryService();
    
    // Health check
    const isHealthy = await memoryService.healthCheck();
    const stats = isHealthy ? await memoryService.getStats() : null;

    return NextResponse.json({
      success: true,
      healthy: isHealthy,
      stats: stats || {
        totalConsciousMemories: 0,
        tagCount: 0,
        averageImportance: 0,
        sourceBreakdown: { explicit: 0, suggested: 0, derived: 0 }
      }
    });
  } catch (error) {
    console.error('Conscious memory health check error:', error);
    return NextResponse.json(
      { 
        success: false, 
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
