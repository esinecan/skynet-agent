import { NextRequest, NextResponse } from 'next/server';
import { ChatHistoryDatabase } from '../../../../lib/chat-history';

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const db = ChatHistoryDatabase.getInstance();
    const session = db.getSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ session });
  } catch (error) {
    console.error('Error fetching chat session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat session' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    const { sessionId } = params;
    const { message } = await request.json();
    
    if (!message || !message.role || !message.content) {
      return NextResponse.json(
        { error: 'Invalid message format' },
        { status: 400 }
      );
    }

    const db = ChatHistoryDatabase.getInstance();
    
    // Ensure session exists
    let session = db.getSession(sessionId);
    if (!session) {
      session = db.createSession({
        id: sessionId,
        title: 'New Chat',
        messages: [],
      });
    }

    // Prepare attachments if they exist
    const attachments = message.attachments ? message.attachments.map((att: any) => ({
      id: att.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      messageId: message.id,
      name: att.name,
      type: att.type,
      size: att.size,
      data: att.data,
      createdAt: att.createdAt ? new Date(att.createdAt) : new Date(),
    })) : undefined;

    // Add the message with attachments
    const savedMessage = db.addMessage({
      id: message.id || `${sessionId}-msg-${Date.now()}`,
      sessionId,
      role: message.role,
      content: message.content,
      toolInvocations: message.toolInvocations,
      attachments,
    });
    
    // Update session title if it's the first user message
    if (message.role === 'user' && session.messages.length === 0) {
      const newTitle = db.generateSessionTitle([message]);
      db.updateSession(sessionId, { title: newTitle });
    }
    
    return NextResponse.json({ message: savedMessage });
  } catch (error) {
    console.error('Error adding message to session:', error);
    return NextResponse.json(
      { error: 'Failed to add message' },
      { status: 500 }
    );
  }
}
