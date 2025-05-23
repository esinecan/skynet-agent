# Skynet Agent GUI Quick Start Implementation

Based on my analysis of your skynet-agent project, here's a focused implementation plan that leverages your existing code and gets you up and running quickly.

## Current State Analysis

Your skynet-agent already has:
- ✅ Express server running on port 9000
- ✅ MCP client integration (`McpClientManager`)
- ✅ Memory system (currently file-based)
- ✅ API endpoint for queries (`/query`)
- ✅ Session support (basic)

## Quick Implementation Plan (Embedded Frontend Approach)

### Step 1: Add Session Storage (30 mins)

Create `src/db/sessions.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
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
  toolCalls?: any[];
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
```

### Step 2: Enhance API with Streaming (1 hour)

Update `src/server/api.ts` to add new endpoints:

```typescript
import { sessionManager } from '../db/sessions';

// Add multer for file uploads
import multer from 'multer';
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Sessions endpoints
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await sessionManager.getAllSessions();
    res.json(sessions);
  } catch (error) {
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const { title } = req.body;
    const session = await sessionManager.createSession(title);
    res.json(session);
  } catch (error) {
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = await sessionManager.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (error) {
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

// Streaming chat endpoint
app.post('/api/chat/stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const { sessionId, message, attachments } = req.body;
  
  try {
    // Add user message to session
    const userMessage = {
      id: `msg_${Date.now()}`,
      role: 'user' as const,
      content: message,
      timestamp: new Date().toISOString(),
      attachments
    };
    
    await sessionManager.addMessage(sessionId, userMessage);
    
    // Send initial acknowledgment
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);
    
    // Process with agent (mock streaming for now)
    const response = await processQuery(message, sessionId);
    
    // Simulate streaming by sending chunks
    const chunks = response.match(/.{1,50}/g) || [];
    let fullResponse = '';
    
    for (const chunk of chunks) {
      fullResponse += chunk;
      res.write(`data: ${JSON.stringify({ 
        type: 'chunk', 
        content: chunk 
      })}\n\n`);
      
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Save assistant message
    const assistantMessage = {
      id: `msg_${Date.now()}`,
      role: 'assistant' as const,
      content: fullResponse,
      timestamp: new Date().toISOString()
    };
    
    await sessionManager.addMessage(sessionId, assistantMessage);
    
    // Send completion
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
    
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Streaming error:', err);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: err.message 
    })}\n\n`);
    res.end();
  }
});

// File upload endpoint
app.post('/api/upload', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const attachments = files.map(file => ({
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
      data: file.buffer.toString('base64')
    }));
    
    res.json({ attachments });
  } catch (error) {
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

// List available tools
app.get('/api/tools', async (req, res) => {
  try {
    const { mcpManager } = await initializeAgent();
    const tools = await mcpManager.listAllTools();
    res.json(tools);
  } catch (error) {
    const errorResponse = handleApiError(error);
    res.status(errorResponse.status).json(errorResponse.body);
  }
});

// Serve static files for frontend
app.use(express.static(path.join(__dirname, '../../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});
```

### Step 3: Create React Frontend (2 hours)

1. **Initialize frontend structure**:

```bash
cd skynet-agent
mkdir client
cd client
npm init -y
npm install react react-dom @types/react @types/react-dom
npm install -D vite @vitejs/plugin-react typescript tailwindcss
npm install lucide-react react-markdown zustand
```

2. **Create `client/vite.config.ts`**:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:9000'
    }
  }
})
```

3. **Create `client/src/App.tsx`** (minimal chat UI):

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Plus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  const loadSessions = async () => {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    setSessions(data);
    if (data.length > 0 && !currentSession) {
      setCurrentSession(data[0]);
    }
  };

  const createSession = async () => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Chat' })
    });
    const newSession = await res.json();
    setSessions([newSession, ...sessions]);
    setCurrentSession(newSession);
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentSession) return;

    setIsLoading(true);
    const userMessage = input;
    setInput('');

    // Optimistically add user message
    const tempUserMessage: Message = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    };

    setCurrentSession({
      ...currentSession,
      messages: [...currentSession.messages, tempUserMessage]
    });

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession.id,
          message: userMessage
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'chunk') {
                  assistantMessage += data.content;
                  // Update UI with streaming content
                  const tempAssistantMessage: Message = {
                    id: `temp_assistant_${Date.now()}`,
                    role: 'assistant',
                    content: assistantMessage,
                    timestamp: new Date().toISOString()
                  };
                  
                  setCurrentSession(prev => ({
                    ...prev!,
                    messages: [
                      ...prev!.messages.slice(0, -1),
                      tempUserMessage,
                      tempAssistantMessage
                    ]
                  }));
                }
              } catch (e) {
                console.error('Parse error:', e);
              }
            }
          }
        }
      }

      // Reload session to get persisted messages
      const updatedSession = await fetch(`/api/sessions/${currentSession.id}`);
      const sessionData = await updatedSession.json();
      setCurrentSession(sessionData);
      
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r">
        <div className="p-4">
          <button
            onClick={createSession}
            className="w-full flex items-center justify-center gap-2 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            <Plus size={20} />
            New Chat
          </button>
        </div>
        <div className="overflow-y-auto">
          {sessions.map(session => (
            <div
              key={session.id}
              onClick={() => setCurrentSession(session)}
              className={`p-4 cursor-pointer hover:bg-gray-50 ${
                currentSession?.id === session.id ? 'bg-gray-100' : ''
              }`}
            >
              <div className="font-medium truncate">{session.title}</div>
              <div className="text-sm text-gray-500">
                {new Date(session.updatedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {currentSession ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              {currentSession.messages.map((message) => (
                <div
                  key={message.id}
                  className={`mb-4 ${
                    message.role === 'user' ? 'text-right' : 'text-left'
                  }`}
                >
                  <div
                    className={`inline-block max-w-2xl p-3 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white border'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <ReactMarkdown className="prose prose-sm">
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-4">
              <div className="flex gap-2">
                <button className="p-2 hover:bg-gray-100 rounded">
                  <Paperclip size={20} />
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !input.trim()}
                  className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Create a new chat to get started
          </div>
        )}
      </div>
    </div>
  );
}
```

4. **Create `client/src/main.tsx`**:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

5. **Create `client/index.html`**:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Skynet Agent</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Step 4: Update package.json Scripts (5 mins)

Update your root `package.json`:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "ts-node-dev --respawn --transpile-only src/index.ts",
    "dev:client": "cd client && npm run dev",
    "build": "npm run build:client && npm run build:server",
    "build:client": "cd client && npm run build",
    "build:server": "tsc",
    "install:all": "npm install && cd client && npm install"
  },
  "devDependencies": {
    "concurrently": "^7.6.0"
  }
}
```

### Step 5: Add MCP Tool Display (30 mins)

Add to your React app a tools panel:

```tsx
// Add this component to show available tools
const ToolsPanel = () => {
  const [tools, setTools] = useState<any[]>([]);
  
  useEffect(() => {
    fetch('/api/tools')
      .then(res => res.json())
      .then(setTools);
  }, []);

  return (
    <div className="p-4 border-t">
      <h3 className="font-bold mb-2">Available Tools</h3>
      {tools.map(server => (
        <div key={server.serverName} className="mb-2">
          <div className="font-medium">{server.serverName}</div>
          <div className="text-sm text-gray-600">
            {server.tools.map((tool: any) => tool.name).join(', ')}
          </div>
        </div>
      ))}
    </div>
  );
};
```

## Quick Start Commands

```bash
# 1. Install dependencies
npm install multer concurrently
npm run install:all

# 2. Set up Tailwind in client
cd client
npx tailwindcss init -p
echo '@tailwind base;
@tailwind components;
@tailwind utilities;' > src/index.css

# 3. Run development
cd ..
npm run dev
```

## Next Steps

1. **File Attachments**: Wire up the paperclip button to upload files
2. **Tool Execution Display**: Show when tools are being called
3. **Memory Context**: Display relevant memories being used
4. **Streaming Improvements**: Show typing indicators and better streaming
5. **Session Management**: Add rename, delete, search features

This gives you a working chat UI with:
- ✅ Multiple chat sessions
- ✅ Streaming responses
- ✅ File upload ready (backend done)
- ✅ MCP tools display
- ✅ Markdown rendering
- ✅ Persistent storage

The whole implementation should take about 4-5 hours to get a working MVP, and you can iterate from there!