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
    const startTime = Date.now();
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionTitle = title || 'New Chat';
    
    logger.debug('Creating new session', {
      sessionId,
      title: sessionTitle,
      hasCustomTitle: !!title
    });
    
    const session: Session = {
      id: sessionId,
      title: sessionTitle,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.saveSession(session);
    
    const creationTime = Date.now() - startTime;
    logger.debug('Session created successfully', {
      sessionId,
      title: sessionTitle,
      creationTimeMs: creationTime
    });
    
    return session;
  }
  async getSession(id: string): Promise<Session | null> {
    const startTime = Date.now();
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    
    logger.debug('Attempting to load session', {
      sessionId: id,
      filePath: filePath.replace(process.cwd(), '.')
    });
    
    if (!fs.existsSync(filePath)) {
      logger.debug('Session file not found', {
        sessionId: id,
        filePath: filePath.replace(process.cwd(), '.')
      });
      return null;
    }
    
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const session = JSON.parse(data);
      const loadTime = Date.now() - startTime;
      
      logger.debug('Session loaded successfully', {
        sessionId: id,
        messageCount: session.messages?.length || 0,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        loadTimeMs: loadTime,
        dataSizeBytes: data.length
      });
      
      return session;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to load session', {
        error: err,
        sessionId: id,
        loadTimeMs: loadTime,
        errorType: err.constructor.name
      });
      return null;
    }
  }
  async getAllSessions(): Promise<Session[]> {
    const startTime = Date.now();
    logger.debug('Starting getAllSessions operation', {
      sessionDir: SESSIONS_DIR
    });
    
    try {
      const files = fs.readdirSync(SESSIONS_DIR);
      const sessionFiles = files.filter(file => file.endsWith('.json'));
      
      logger.debug('Session files discovered', {
        totalFiles: files.length,
        sessionFiles: sessionFiles.length,
        fileNames: sessionFiles.slice(0, 10) // Preview first 10 files
      });
      
      const sessions: Session[] = [];
      let totalDataSize = 0;
      let parseErrors = 0;
      
      for (const file of sessionFiles) {
        try {
          const filePath = path.join(SESSIONS_DIR, file);
          const data = fs.readFileSync(filePath, 'utf8');
          totalDataSize += data.length;
          const session = JSON.parse(data);
          sessions.push(session);
        } catch (error) {
          parseErrors++;
          const err = error instanceof Error ? error : new Error(String(error));
          logger.debug('Failed to parse session file', {
            fileName: file,
            error: err.message,
            errorType: err.constructor.name
          });
        }
      }
      
      const sortedSessions = sessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      
      const loadTime = Date.now() - startTime;
      logger.debug('getAllSessions completed successfully', {
        sessionsLoaded: sessions.length,
        parseErrors,
        totalDataSizeBytes: totalDataSize,
        loadTimeMs: loadTime,
        avgSessionSizeBytes: Math.round(totalDataSize / Math.max(sessions.length, 1)),
        sessionsPerSecond: Math.round((sessions.length / loadTime) * 1000)
      });
      
      return sortedSessions;
    } catch (error) {
      const loadTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to get all sessions', {
        error: err,
        loadTimeMs: loadTime,
        errorType: err.constructor.name
      });
      throw err;
    }
  }
  async saveSession(session: Session): Promise<void> {
    const startTime = Date.now();
    logger.debug('Starting saveSession operation', {
      sessionId: session.id,
      messageCount: session.messages?.length || 0,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    });
    
    try {
      session.updatedAt = new Date().toISOString();
      const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
      const sessionData = JSON.stringify(session, null, 2);
      
      logger.debug('Session data prepared for save', {
        sessionId: session.id,
        filePath,
        dataSizeBytes: sessionData.length,
        newUpdatedAt: session.updatedAt
      });
      
      fs.writeFileSync(filePath, sessionData);
      
      const saveTime = Date.now() - startTime;
      logger.debug('Session saved successfully', {
        sessionId: session.id,
        saveTimeMs: saveTime,
        dataSizeBytes: sessionData.length,
        bytesPerSecond: Math.round((sessionData.length / saveTime) * 1000)
      });
    } catch (error) {
      const saveTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to save session', {
        error: err,
        sessionId: session.id,
        saveTimeMs: saveTime,
        errorType: err.constructor.name
      });
      throw err;
    }
  }
  async addMessage(sessionId: string, message: Message): Promise<void> {
    const startTime = Date.now();    logger.debug('Starting addMessage operation', {
      sessionId,
      messageRole: message.role,
      messageContentLength: message.content?.length || 0,
      messageToolCalls: message.toolCalls?.length || 0,
      hasAttachments: !!message.attachments?.length
    });
    
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        logger.debug('Session not found for addMessage', {
          sessionId,
          operationTimeMs: Date.now() - startTime
        });
        throw new Error('Session not found');
      }
      
      const beforeMessageCount = session.messages.length;
      session.messages.push(message);
      
      logger.debug('Message added to session', {
        sessionId,
        beforeMessageCount,
        afterMessageCount: session.messages.length,
        messageIndex: beforeMessageCount
      });
      
      await this.saveSession(session);
      
      const totalTime = Date.now() - startTime;
      logger.debug('addMessage completed successfully', {
        sessionId,
        totalTimeMs: totalTime,
        finalMessageCount: session.messages.length,
        messageRole: message.role
      });
    } catch (error) {
      const totalTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to add message to session', {
        error: err,
        sessionId,
        totalTimeMs: totalTime,
        errorType: err.constructor.name,
        messageRole: message.role
      });
      throw err;
    }
  }
  async deleteSession(id: string): Promise<void> {
    const startTime = Date.now();
    logger.debug('Starting deleteSession operation', {
      sessionId: id
    });
    
    try {
      const filePath = path.join(SESSIONS_DIR, `${id}.json`);
      const fileExists = fs.existsSync(filePath);
      
      logger.debug('Checking session file existence', {
        sessionId: id,
        filePath,
        fileExists
      });
      
      if (fileExists) {
        // Get file size before deletion for logging
        let fileSize = 0;
        try {
          const stats = fs.statSync(filePath);
          fileSize = stats.size;
        } catch (error) {
          logger.debug('Could not get file stats before deletion', {
            sessionId: id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
        fs.unlinkSync(filePath);
        
        const deleteTime = Date.now() - startTime;
        logger.debug('Session deleted successfully', {
          sessionId: id,
          deleteTimeMs: deleteTime,
          fileSizeBytes: fileSize
        });
      } else {
        const deleteTime = Date.now() - startTime;
        logger.debug('Session file did not exist, no deletion needed', {
          sessionId: id,
          deleteTimeMs: deleteTime,
          filePath
        });
      }
    } catch (error) {
      const deleteTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to delete session', {
        error: err,
        sessionId: id,
        deleteTimeMs: deleteTime,
        errorType: err.constructor.name
      });
      throw err;
    }
  }
}

export const sessionManager = new SessionManager();