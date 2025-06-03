import { NextRequest, NextResponse } from 'next/server';
import { ChatHistoryDatabase } from '../../../lib/chat-history';

export async function GET() {
  try {
    const db = ChatHistoryDatabase.getInstance();
    const sessions = db.getAllSessions();
    
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat sessions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, title, messages } = await request.json();
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }
    
    const db = ChatHistoryDatabase.getInstance();
    
    // Create or update session
    const existingSession = db.getSession(sessionId);
    
    if (!existingSession) {
      // Create new session
      const session = db.createSession({
        id: sessionId,
        title: title || db.generateSessionTitle(messages || []),
        messages: messages || [],
      });
      
      // Add messages if provided
      if (messages && messages.length > 0) {
        messages.forEach((message: any, index: number) => {
          db.addMessage({
            id: message.id || `${sessionId}-msg-${index}`,
            sessionId,
            role: message.role,
            content: message.content,
            toolInvocations: message.toolInvocations,
          });
        });
      }
      
      return NextResponse.json({ session });
    } else {
      // Update existing session
      if (title) {
        db.updateSession(sessionId, { title });
      }
      
      return NextResponse.json({ session: existingSession });
    }
  } catch (error) {
    console.error('Error saving chat session:', error);
    return NextResponse.json(
      { error: 'Failed to save chat session' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }
    
    const db = ChatHistoryDatabase.getInstance();
    
    if (sessionId === 'all') {
      db.clearAllSessions();
    } else {
      db.deleteSession(sessionId);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat session:', error);
    return NextResponse.json(
      { error: 'Failed to delete chat session' },
      { status: 500 }
    );
  }
}
