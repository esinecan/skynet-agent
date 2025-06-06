import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Chat history management with SQLite
export interface ChatSession {
  id: string;
  title: string;
  messages: any[];
  messageCount?: number; // Optional for when we only need metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface FileAttachment {
  id: string;
  messageId: string;
  name: string;
  type: string;
  size: number;
  data: string; // Base64 encoded
  createdAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolInvocations?: any[];
  attachments?: FileAttachment[];
  createdAt: Date;
}

export class ChatHistoryDatabase {
  private db: Database.Database;
  private static instance: ChatHistoryDatabase;

  private constructor() {
    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize database
    const dbPath = path.join(dataDir, 'chat-history.db');
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  static getInstance(): ChatHistoryDatabase {
    if (!ChatHistoryDatabase.instance) {
      ChatHistoryDatabase.instance = new ChatHistoryDatabase();
    }
    return ChatHistoryDatabase.instance;
  }
  private initializeTables(): void {
    // Create sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        tool_invocations TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE
      )
    `);

    // Create attachments table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES chat_messages (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages (session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON chat_sessions (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON chat_attachments (message_id);
    `);
  }

  // Session management
  createSession(session: Omit<ChatSession, 'createdAt' | 'updatedAt'>): ChatSession {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO chat_sessions (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(session.id, session.title, now, now);
    
    return {
      ...session,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  updateSession(sessionId: string, updates: Partial<Pick<ChatSession, 'title'>>): void {
    const now = new Date().toISOString();
    
    const setParts: string[] = [];
    const values: any[] = [];
    
    if (updates.title !== undefined) {
      setParts.push('title = ?');
      values.push(updates.title);
    }
    
    setParts.push('updated_at = ?');
    values.push(now);
    values.push(sessionId);
    
    const stmt = this.db.prepare(`
      UPDATE chat_sessions 
      SET ${setParts.join(', ')}
      WHERE id = ?
    `);
    
    stmt.run(...values);
  }

  getAllSessions(): ChatSession[] {
    const stmt = this.db.prepare(`
      SELECT s.*, 
             COUNT(m.id) as message_count,
             MAX(m.created_at) as last_message_at
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON s.id = m.session_id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT 50
    `);
    
    const rows = stmt.all() as any[];
      return rows.map(row => ({
      id: row.id,
      title: row.title,
      messages: [], // We'll load messages separately when needed
      messageCount: row.message_count || 0, // Include message count for sidebar display
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at || row.last_message_at || row.created_at),
    }));
  }

  getSession(sessionId: string): ChatSession | null {
    const sessionStmt = this.db.prepare(`
      SELECT * FROM chat_sessions WHERE id = ?
    `);
    
    const sessionRow = sessionStmt.get(sessionId) as any;
    if (!sessionRow) return null;
    
    const messagesStmt = this.db.prepare(`
      SELECT * FROM chat_messages 
      WHERE session_id = ? 
      ORDER BY created_at ASC    `);
    
    const messageRows = messagesStmt.all(sessionId) as any[];
    
    // Get attachments for all messages in this session
    const attachmentsStmt = this.db.prepare(`
      SELECT a.*, a.id as attachment_id, a.message_id 
      FROM chat_attachments a
      INNER JOIN chat_messages m ON a.message_id = m.id
      WHERE m.session_id = ?
      ORDER BY a.created_at
    `);
    
    const attachmentRows = attachmentsStmt.all(sessionId) as any[];
    const attachmentsByMessage = attachmentRows.reduce((acc, row) => {
      if (!acc[row.message_id]) acc[row.message_id] = [];
      acc[row.message_id].push({
        id: row.attachment_id,
        messageId: row.message_id,
        name: row.name,
        type: row.type,
        size: row.size,
        data: row.data,
        createdAt: new Date(row.created_at),
      });
      return acc;
    }, {} as Record<string, FileAttachment[]>);    const messages = messageRows.map(row => {
      let toolInvocations = undefined;
      
      if (row.tool_invocations) {
        try {
          toolInvocations = JSON.parse(row.tool_invocations);
        } catch (error) {
          console.error(' Failed to parse tool invocations for message:', row.id, error);
          console.error(' Raw tool_invocations:', row.tool_invocations);
          toolInvocations = undefined; // Safe fallback
        }
      }
      
      if (toolInvocations) {
        console.log(' Loading message with tool calls:', row.id);
        console.log(' Tool calls from DB:', JSON.stringify(toolInvocations, null, 2));
          // KEEP THE FILTER - but update it for the new storage format
        const completeToolCalls = toolInvocations.filter((call: any) => {
          const hasResult = 'result' in call; // Check if result property exists, not if it's truthy
          
          if (!hasResult) {
            console.log(' Filtering out incomplete tool call:', call.toolCallId || call.id);
            console.log(' Call structure:', Object.keys(call));
          } else {
            console.log(' Keeping complete tool call:', call.toolCallId || call.id);
          }
          return hasResult;
        });
        
        toolInvocations = completeToolCalls.length > 0 ? completeToolCalls : undefined;
        console.log(' After filtering:', toolInvocations?.length || 0, 'complete tool calls');
      }
      
      return {
        id: row.id,
        role: row.role,
        content: row.content,
        toolInvocations,
        attachments: attachmentsByMessage[row.id] || [],
        createdAt: new Date(row.created_at),
      };
    });
    
    return {
      id: sessionRow.id,
      title: sessionRow.title,
      messages,
      createdAt: new Date(sessionRow.created_at),
      updatedAt: new Date(sessionRow.updated_at),
    };
  }
  deleteSession(sessionId: string): void {
    // Foreign key constraints will handle cascade deletion of messages and attachments
    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE id = ?');
    stmt.run(sessionId);
  }

  clearAllSessions(): void {
    this.db.exec('DELETE FROM chat_attachments');
    this.db.exec('DELETE FROM chat_messages');
    this.db.exec('DELETE FROM chat_sessions');
  }
  // Message management
  addMessage(message: Omit<ChatMessage, 'createdAt'>): ChatMessage {
    const now = new Date().toISOString();
    
    // Start transaction for message and attachments
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO chat_messages (id, session_id, role, content, tool_invocations, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      const toolInvocationsJson = message.toolInvocations ? (() => {
        try {
          return JSON.stringify(message.toolInvocations);
        } catch (error) {
          console.error(' Failed to serialize tool invocations:', error);
          console.error(' Tool invocations data:', message.toolInvocations);
          return null; // Store null instead of crashing
        }
      })() : null;
      
      stmt.run(
        message.id,
        message.sessionId,
        message.role,
        message.content,
        toolInvocationsJson,
        now
      );
      
      // Add attachments if any
      if (message.attachments && message.attachments.length > 0) {
        const attachmentStmt = this.db.prepare(`
          INSERT INTO chat_attachments (id, message_id, name, type, size, data, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const attachment of message.attachments) {
          attachmentStmt.run(
            attachment.id,
            message.id,
            attachment.name,
            attachment.type,
            attachment.size,
            attachment.data,
            attachment.createdAt.toISOString()
          );
        }
      }
      
      // Update session timestamp
      this.updateSession(message.sessionId, {});
    });
    
    transaction();
    
    return {
      ...message,
      createdAt: new Date(now),
    };
  }

  // Attachment management methods
  addAttachment(attachment: Omit<FileAttachment, 'createdAt'>): FileAttachment {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO chat_attachments (id, message_id, name, type, size, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      attachment.id,
      attachment.messageId,
      attachment.name,
      attachment.type,
      attachment.size,
      attachment.data,
      now
    );
    
    return {
      ...attachment,
      createdAt: new Date(now),
    };
  }

  getMessageAttachments(messageId: string): FileAttachment[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chat_attachments WHERE message_id = ? ORDER BY created_at
    `);
    
    const rows = stmt.all(messageId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      messageId: row.message_id,
      name: row.name,
      type: row.type,
      size: row.size,
      data: row.data,
      createdAt: new Date(row.created_at),
    }));
  }

  deleteAttachment(attachmentId: string): void {
    const stmt = this.db.prepare('DELETE FROM chat_attachments WHERE id = ?');
    stmt.run(attachmentId);
  }

  getAttachmentStats(): { totalAttachments: number; totalSize: number; types: Record<string, number> } {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count, SUM(size) as totalSize FROM chat_attachments
    `);
    
    const typesStmt = this.db.prepare(`
      SELECT type, COUNT(*) as count FROM chat_attachments GROUP BY type
    `);
    
    const result = stmt.get() as any;
    const typeRows = typesStmt.all() as any[];
    
    const types = typeRows.reduce((acc, row) => {
      acc[row.type] = row.count;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalAttachments: result.count || 0,
      totalSize: result.totalSize || 0,
      types,
    };
  }

  // Utility methods
  sessionExists(sessionId: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM chat_sessions WHERE id = ?');
    const result = stmt.get(sessionId);
    return !!result;
  }

  generateSessionTitle(messages: any[]): string {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) return 'New Chat';
    
    const content = firstUserMessage.content;
    if (content.length <= 50) return content;
    
    return content.substring(0, 47) + '...';
  }

  // Query methods for advanced functionality
  searchSessions(query: string): ChatSession[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT s.* 
      FROM chat_sessions s
      JOIN chat_messages m ON s.id = m.session_id
      WHERE s.title LIKE ? OR m.content LIKE ?
      ORDER BY s.updated_at DESC
      LIMIT 20
    `);
    
    const searchTerm = `%${query}%`;
    const rows = stmt.all(searchTerm, searchTerm) as any[];
    
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      messages: [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  getSessionStats() {
    const stmt = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT s.id) as total_sessions,
        COUNT(m.id) as total_messages,
        AVG(message_count) as avg_messages_per_session
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON s.id = m.session_id
      LEFT JOIN (
        SELECT session_id, COUNT(*) as message_count
        FROM chat_messages
        GROUP BY session_id
      ) mc ON s.id = mc.session_id
    `);
    
    return stmt.get();
  }

  close(): void {
    this.db.close();
  }
}
