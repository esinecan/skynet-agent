import { NextRequest, NextResponse } from 'next/server';
import { getMotiveForceService } from '../../../lib/motive-force';
import { MotiveForceStorage } from '../../../lib/motive-force-storage';
import { ChatHistoryDatabase } from '../../../lib/chat-history';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, sessionId, data } = body;
    
    switch (action) {
      case 'generate': {
        if (!sessionId) {
          return NextResponse.json(
            { error: 'Session ID is required' },
            { status: 400 }
          );
        }
        
        const db = ChatHistoryDatabase.getInstance();
        const session = db.getSession(sessionId);
        
        if (!session) {
          return NextResponse.json(
            { error: 'Session not found' },
            { status: 404 }
          );
        }
        
        const service = getMotiveForceService();
        await service.initialize();
        
        const query = await service.generateNextQuery(
          session.messages,
          sessionId
        );
        
        return NextResponse.json({
          success: true,
          query,
          generatedAt: new Date().toISOString()
        });
      }
      
      case 'savePrompt': {
        const { text, mode } = data || {};
        
        if (!text || typeof text !== 'string') {
          return NextResponse.json(
            { error: 'Text is required' },
            { status: 400 }
          );
        }
        
        if (mode === 'append') {
          MotiveForceStorage.appendToSystemPrompt(text);
        } else {
          MotiveForceStorage.saveSystemPrompt(text);
        }
        
        return NextResponse.json({
          success: true,
          message: 'System prompt saved successfully'
        });
      }
      
      case 'resetPrompt': {
        MotiveForceStorage.resetSystemPrompt();
        
        return NextResponse.json({
          success: true,
          message: 'System prompt reset to default'
        });
      }
      
      case 'getPrompt': {
        const prompt = MotiveForceStorage.getSystemPrompt();
        
        return NextResponse.json({
          success: true,
          prompt
        });
      }
      
      case 'getConfig': {
        const service = getMotiveForceService();
        const config = service.getConfig();
        
        return NextResponse.json({
          success: true,
          config
        });
      }
      
      case 'saveConfig': {
        const { config } = data || {};
        
        if (!config) {
          return NextResponse.json(
            { error: 'Config is required' },
            { status: 400 }
          );
        }
        
        const service = getMotiveForceService();
        service.updateConfig(config);
        
        return NextResponse.json({
          success: true,
          message: 'Configuration updated successfully'
        });
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('MotiveForce API error:', error);
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
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    switch (action) {
      case 'status': {
        const service = getMotiveForceService();
        const config = service.getConfig();
        const promptPath = MotiveForceStorage.getPromptPath();
        
        return NextResponse.json({
          success: true,
          status: {
            enabled: config.enabled,
            promptPath,
            config
          }
        });
      }
      
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('MotiveForce GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
