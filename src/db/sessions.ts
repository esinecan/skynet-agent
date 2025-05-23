import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from '../utils/logger';

const logger = createLogger('sessions');
const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: Array<{
    name: string;
    type: string;
    data: string;
  }>;
  toolCalls?: unknown[];
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export class SessionManager {
  constructor() {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  async createSession(title?: string): Promise<Session> {
    const session: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: title || 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.saveSession(session);
    return session;
  }

  async getSession(id: string): Promise<Session | null> {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }

  async getAllSessions(): Promise<Session[]> {
    const files = fs.readdirSync(SESSIONS_DIR);
    const sessions: Session[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8');
        sessions.push(JSON.parse(data));
      }
    }
    
    return sessions.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async saveSession(session: Session): Promise<void> {
    session.updatedAt = new Date().toISOString();
    const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    
    session.messages.push(message);
    await this.saveSession(session);
  }

  async deleteSession(id: string): Promise<void> {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export const sessionManager = new SessionManager();