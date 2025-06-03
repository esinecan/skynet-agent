import { NextRequest, NextResponse } from 'next/server';
import { ChatHistoryDatabase } from '../../../lib/chat-history';

export async function GET(request: NextRequest) {
  try {
    const db = ChatHistoryDatabase.getInstance();
    const stats = db.getAttachmentStats();
    
    return NextResponse.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching attachment stats:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch attachment statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const attachmentId = searchParams.get('id');
    
    if (!attachmentId) {
      return NextResponse.json(
        { error: 'Attachment ID is required' },
        { status: 400 }
      );
    }

    const db = ChatHistoryDatabase.getInstance();
    db.deleteAttachment(attachmentId);
    
    return NextResponse.json({
      success: true,
      message: 'Attachment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to delete attachment',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
