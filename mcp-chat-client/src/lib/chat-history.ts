import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Chat history management with SQLite
export interface ChatSession {
  id: string;
  title: string;
  messages: any[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolInvocations?: any[];
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

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages (session_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON chat_sessions (updated_at DESC);
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
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
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
      ORDER BY created_at ASC
    `);
    
    const messageRows = messagesStmt.all(sessionId) as any[];
    
    const messages = messageRows.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      toolInvocations: row.tool_invocations ? JSON.parse(row.tool_invocations) : undefined,
      createdAt: new Date(row.created_at),
    }));
    
    return {
      id: sessionRow.id,
      title: sessionRow.title,
      messages,
      createdAt: new Date(sessionRow.created_at),
      updatedAt: new Date(sessionRow.updated_at),
    };
  }

  deleteSession(sessionId: string): void {
    const stmt = this.db.prepare('DELETE FROM chat_sessions WHERE id = ?');
    stmt.run(sessionId);
  }

  clearAllSessions(): void {
    this.db.exec('DELETE FROM chat_messages');
    this.db.exec('DELETE FROM chat_sessions');
  }

  // Message management
  addMessage(message: Omit<ChatMessage, 'createdAt'>): ChatMessage {
    const now = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, tool_invocations, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    const toolInvocationsJson = message.toolInvocations ? JSON.stringify(message.toolInvocations) : null;
    
    stmt.run(
      message.id,
      message.sessionId,
      message.role,
      message.content,
      toolInvocationsJson,
      now
    );
    
    // Update session timestamp
    this.updateSession(message.sessionId, {});
    
    return {
      ...message,
      createdAt: new Date(now),
    };
  }

  // Utility methods
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
