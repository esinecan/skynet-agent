import { NextRequest, NextResponse } from 'next/server';
import { ChatHistoryDatabase } from '../../../../lib/chat-history';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      );
    }
    
    if (query.length < 5) {
      return NextResponse.json(
        { error: 'Search query must be at least 5 characters' },
        { status: 400 }
      );
    }
    
    const db = ChatHistoryDatabase.getInstance();
    const sessions = db.searchSessions(query);
    
    return NextResponse.json({ 
      sessions,
      query,
      count: sessions.length
    });
  } catch (error) {
    console.error('Error searching chat sessions:', error);
    return NextResponse.json(
      { error: 'Failed to search chat sessions' },
      { status: 500 }
    );
  }
}
