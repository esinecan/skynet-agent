# MCP Compatible TypeScript and Next.js LLM Chat Client That Also Has Passive RAG for Long Term Memory Purposes
Skynet Agent is an autonomous AI assistant built with Node.js and TypeScript. It features **multi-LLM provider support** via the Vercel AI SDK, enabling seamless switching between OpenAI, Google Gemini, Anthropic Claude, and more. The agent includes intrinsic motivation, self-reflection, semantic memory management, and external tool execution via the Model Context Protocol (MCP). It exposes a modern streaming HTTP API and includes a React-based web GUI. See "Tutorial.md" for detailed information.

![Gemini_Generated_Image_s0i5y7s0i5y7s0i5](https://github.com/user-attachments/assets/59288b74-f072-48fa-9e3e-04f1dce59706)


## Features

### 🤖 **Multi-LLM Provider Support**
* **Vercel AI SDK integration** with unified interface for multiple providers
* **OpenAI models**: GPT-4o, GPT-4o-mini, GPT-3.5-turbo
* **Google Gemini models**: Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash
* **Anthropic Claude models**: Claude 3.5 Sonnet, Claude 3.5 Haiku
* **Easy provider switching** via environment configuration

### 🧠 **Advanced Memory System**
* **Real embeddings**: Uses Google's latest text-embedding-004 model for semantic memory
* **ChromaDB integration**: Lightweight, high-performance vector database (primary)
* **Semantic similarity search** with configurable similarity thresholds
* **Memory consolidation**: Scheduled summarization and cleanup of stored memories

### 🔧 **Cognitive Capabilities**
* **Multi-step reasoning** with adaptive response improvement
* **Self-reflection system**: Evaluates and refines responses automatically
* **Intrinsic motivation**: Autonomous task initiation during idle periods
* **Session-based conversations** with persistent memory across sessions

### 🛠️ **Tool Integration & APIs**
* **Model Context Protocol (MCP)**: Dynamic external tool execution
* **Streaming API**: Real-time Server-Sent Events for live responses
* **RESTful endpoints**: Session management, file uploads, health monitoring
* **React-based GUI**: Modern web interface with real-time chat and file sharing
* **Docker support**: Complete containerization with health checks

## Prerequisites

* Node.js >= 18.x
* npm >= 8.x
* **At least one LLM provider API key**:
  - **Google Gemini**: `GOOGLE_API_KEY` (recommended for embeddings)
  - **OpenAI**: `OPENAI_API_KEY` (for GPT models)
  - **Anthropic**: `ANTHROPIC_API_KEY` (for Claude models)
* **ChromaDB**: Primary vector database for semantic memory storage

## Installation

```bash
git clone <repository-url>
cd <repository-directory>
npm install

# Install client dependencies for the GUI
cd client
npm install
cd ..
```

**Alternative**: Use the automatic installer script:
```bash
npm run install:all
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure your LLM provider(s):

```env
# LLM Provider Configuration (choose one or more)
# Google Gemini (recommended for embeddings)
GOOGLE_API_KEY=your_gemini_api_key_here

# OpenAI (for GPT models)
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic (for Claude models)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Model Selection (defaults to google:gemini-2.0-flash)
# Format: provider:model-name
# Examples:
# LLM_MODEL=google:gemini-2.0-flash
# LLM_MODEL=openai:gpt-4o
# LLM_MODEL=anthropic:claude-3-5-sonnet-20241022

# Server Configuration
PORT=3000
MCP_SERVER_PORT=8081

# ChromaDB Configuration (Primary vector database)
CHROMA_PATH=./data/chroma
CHROMA_COLLECTION=skynet_memories

# Memory & Autonomous Behavior
MEMORY_CONSOLIDATION_SCHEDULE="0 2 * * *"  # Daily at 2 AM
MEMORY_DIR=./data/memory
IDLE_THRESHOLD_MINUTES=10

# MCP Server Configuration (JSON format)
# Example: {"playwright":{"transport":"stdio","command":"npx","args":["@playwright/mcp@latest"]}}
# SKYNET_MCP_SERVERS_JSON='{}'
```

### LLM Provider Setup

Skynet Agent uses the **Vercel AI SDK** for unified multi-provider LLM access. Configure one or more providers:

#### Google Gemini (Recommended)
```env
GOOGLE_API_KEY=your_api_key_here
LLM_MODEL=google:gemini-2.0-flash
```

**Available Gemini models:**
- `gemini-2.0-flash` (latest, fastest)
- `gemini-1.5-pro` (high capability)
- `gemini-1.5-flash` (balanced)

**Get API key:** [Google AI Studio](https://aistudio.google.com/app/apikey)

#### OpenAI
```env
OPENAI_API_KEY=your_api_key_here  
LLM_MODEL=openai:gpt-4o
```

**Available OpenAI models:**
- `gpt-4o` (latest GPT-4)
- `gpt-4o-mini` (cost-effective)
- `gpt-3.5-turbo` (legacy)

**Get API key:** [OpenAI Platform](https://platform.openai.com/api-keys)

#### Anthropic Claude
```env
ANTHROPIC_API_KEY=your_api_key_here
LLM_MODEL=anthropic:claude-3-5-sonnet-20241022
```

**Available Claude models:**
- `claude-3-5-sonnet-20241022` (most capable)
- `claude-3-5-haiku-20241022` (fastest)

**Get API key:** [Anthropic Console](https://console.anthropic.com/)
### MCP Server Configuration

The agent connects to **Model Context Protocol (MCP)** servers for external tool access. Configure servers in order of precedence:

#### 1. Environment Variable (Highest Priority)
```env
SKYNET_MCP_SERVERS_JSON='{"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}'
```

#### 2. Config File (`config.json`)
```json
{
  "mcp": {
    "servers": {
      "playwright": {
        "command": "npx",
        "args": ["@playwright/mcp@latest"]
      },
      "filesystem": {
        "command": "npx", 
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
      }
    }
  }
}
```

#### 3. VS Code Settings (Lowest Priority)
Uses your VS Code MCP settings if available.

### Popular MCP Servers

| Server | Package | Description |
|--------|---------|-------------|
| **playwright** | `@playwright/mcp` | Browser automation and web scraping |
| **filesystem** | `@modelcontextprotocol/server-filesystem` | File system operations |
| **windows-cli** | `@simonb97/server-win-cli` | Windows command-line access |
| **sequential-thinking** | `@modelcontextprotocol/server-sequential-thinking` | Step-by-step reasoning |

### Dynamic MCP Reload

Reload MCP configurations without restarting:

```bash
# Reload via API
curl -X POST http://localhost:3000/mcp/reload
```

Response includes loaded server information:
```json
{
  "success": true,
  "message": "MCP server configurations reloaded",
  "count": 4,
  "servers": ["filesystem", "windows-cli", "playwright", "sequential-thinking"]
}
```

## Usage

### Quick Start Commands

**Prerequisites**: Start ChromaDB for vector storage:
```bash
# Required: Start ChromaDB for semantic memory
docker run -v ./data/chroma:/chroma/chroma -p 8000:8000 chromadb/chroma
```

**Development Mode** (Recommended):
```bash
# Install dependencies for both server and client
npm run install:all

# Start both backend and frontend with hot-reload
npm run dev:gui
```
The GUI automatically opens at http://localhost:3000

**Production Mode**:
```bash
# Build and start production server with GUI
npm run build
npm run gui
```

**Full Docker Deployment** (includes ChromaDB):
```bash
# Starts both ChromaDB and Skynet Agent
./start.sh    # Linux/macOS  
start.bat     # Windows
```

**Standalone Development**:
```bash
# Backend only (API server)
npm run dev

# Frontend only (requires backend running)
npm run dev:client
```

### API Usage

The API server provides both RESTful endpoints and the web GUI:

#### Chat API
```http
POST /api/query HTTP/1.1
Content-Type: application/json

{
  "query": "Hello, agent!",
  "sessionId": "optional-session-id"
}
```

#### Session Management
```http
# Get all sessions
GET /api/sessions

# Get specific session
GET /api/sessions/:sessionId

# Create new session
POST /api/sessions
Content-Type: application/json
{
  "title": "Session Title"
}

# Delete session
DELETE /api/sessions/:sessionId
```

#### Streaming Chat
```http
# Server-Sent Events for real-time responses
GET /api/stream/:sessionId?query=your_message
```

#### File Upload
```http
POST /api/upload
Content-Type: multipart/form-data

# Include file in form data
```

## Using the Web GUI

Skynet Agent includes a modern React-based web interface for easier interaction:

### Quick Start

**Prerequisites**: Ensure you have ChromaDB running for vector storage:

```bash
# Start ChromaDB (required for semantic memory)
docker run -v ./data/chroma:/chroma/chroma -p 8000:8000 chromadb/chroma
```

1. **Development Mode** (Recommended for development):
   ```bash
   npm run dev:gui
   ```
   This starts both backend and frontend with hot-reload and automatically opens your browser.

2. **Production Mode**:
   ```bash
   npm run build
   npm run gui
   ```

3. **Full Docker Deployment** (includes ChromaDB):
   ```bash
   # Starts both ChromaDB and Skynet Agent
   ./start.sh    # Linux/macOS
   start.bat     # Windows
   ```

### GUI Features

- **Session Management**: Create, switch between, and delete conversation sessions
- **Real-time Streaming**: Messages stream in real-time as the agent generates responses
- **File Upload**: Drag and drop or select files to share with the agent
- **Markdown Support**: Rich text rendering with syntax highlighting for code
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Session Persistence**: Conversations are automatically saved and restored
- **Modern UI**: Built with React, TypeScript, and Tailwind CSS

### Browser Support

The GUI automatically opens at http://localhost:3000 and supports all modern browsers including Chrome, Firefox, Safari, and Edge.

## Architecture

Skynet Agent is built with a **modular, event-driven architecture** that separates concerns and enables easy extensibility:

### Core Components

* **LLM Service** (`llmClient.ts`): **Vercel AI SDK integration** with unified interface for multiple providers (OpenAI, Google, Anthropic). Supports streaming responses and tool integration.
* **Workflow Engine** (`workflow.ts`): **LangGraph-based state machine** orchestrating perception, decision, action, and reflection loops with integrated error recovery.
* **Memory System** (`memory/`): **Hybrid semantic memory** using ChromaDB for long-term storage and real-time embedding search via Google's text-embedding-004 model.
* **MCP Integration** (`mcp/client.ts`): **Model Context Protocol client** managing dynamic connections to external tool servers with automatic tool discovery.
* **API Server** (`server/api.ts`): **Express-based streaming API** with RESTful endpoints, Server-Sent Events, file upload, and static React GUI serving.
* **Session Management** (`db/sessions.ts`): **Persistent conversation storage** with file-based session persistence and CRUD operations.

### Key Features

* **Multi-Provider LLM Support**: Seamless switching between OpenAI GPT, Google Gemini, and Anthropic Claude models
* **Real-time Streaming**: Server-Sent Events for live response generation with typing indicators
* **Semantic Memory**: Vector-based memory storage with automatic consolidation and similarity search
* **Autonomous Behavior**: Intrinsic motivation system triggers self-initiated tasks during idle periods
* **Tool Integration**: Dynamic MCP server connections for browser automation, file operations, and custom tools
* **Modern Web GUI**: React-based interface with session management, file uploads, and markdown rendering

## Folder Structure

```
src/
├── index.ts                   
├── run.ts
├── agent/
│   ├── index.ts
│   ├── intrinsicMotivation.ts
│   ├── selfReflection.ts 
│   ├── llmClient.ts
│   ├── workflow.ts
│   └── schemas/appStateSchema.ts
├── memory/
│   ├── index.ts
│   └── consolidation.ts
├── mcp/
│   └── client.ts
├── server/
│   └── api.ts
├── db/
│   └── sessions.ts
└── utils/
    ├── logger.ts
    ├── errorHandler.ts
    └── health.ts

client/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── ChatInterface.tsx
│   │   ├── SessionList.tsx
│   │   ├── MessageList.tsx
│   │   └── InputArea.tsx
│   └── stores/
│       └── chatStore.ts
├── index.html
├── package.json
├── vite.config.ts
└── tailwind.config.js
```

## Recent Major Updates

### **Features**

1. **RAG via Google Embeddings** - Memory system uses Google's text-embedding-004 model for semantic search.
2. **Self-Reflection System** - **Temporarily turned off**
3. **Multi-Step Reasoning** - Implemented in selfReflection.ts with performMultiStepReasoning function.
4. **ChromaDB Vector Database** - Primary vector storage with automatic fallback to in-memory storage.
5. **Docker Support** - Complete containerization with health checks.
6. **Modern React GUI** - Complete web interface with session management, streaming responses, and file uploads.
7. **Session Management System** - Persistent conversation storage with CRUD operations.
8. **Streaming Chat API** - Real-time Server-Sent Events for live response streaming.
9. **File Upload Support** - Multer-based file handling with base64 encoding for agent processing. **buggy**
10. **Enhanced API Server** - RESTful endpoints for sessions, streaming, and file operations.

## Technology Stack

### 🔧 **Backend**
- **Runtime**: Node.js 18+ with TypeScript for type safety
- **LLM Integration**: Vercel AI SDK with multi-provider support
  - `@ai-sdk/google` - Google Gemini models
  - `@ai-sdk/openai` - OpenAI GPT models  
  - `@ai-sdk/anthropic` - Anthropic Claude models
- **Vector Database**: ChromaDB (primary)
- **Embeddings**: Google text-embedding-004 for semantic memory
- **Workflow**: LangGraph for stateful agent orchestration
- **Tools**: Model Context Protocol (MCP) for external integrations
- **API**: Express.js with streaming Server-Sent Events
- **Storage**: File-based session persistence with JSON

### 🎨 **Frontend**
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: Tailwind CSS utility-first framework
- **State**: Zustand for lightweight state management
- **UI Components**: Custom React components with Lucide icons
- **Rendering**: React Markdown with syntax highlighting
- **Communication**: Server-Sent Events for real-time streaming

### 🚀 **Development & Deployment**
- **Development**: ts-node-dev with hot-reload, concurrently for parallel processes
- **Containerization**: Docker with multi-stage builds and health checks
- **Process Management**: Docker Compose for multi-service orchestration
- **Monitoring**: Structured logging with winston, health endpoints
- **Error Tracking**: Sentry integration for production monitoring

### 🔗 **Integration Ecosystem**
- **MCP Servers**: Playwright (web automation), filesystem, CLI tools
- **APIs**: RESTful endpoints with streaming support
- **File Handling**: Multer for uploads with base64 encoding
- **Configuration**: Environment-based with JSON config fallback

### 🚀 **Key Improvements Over Original**

- **Functional Memory**: Real embeddings replaced mock random vectors for semantic search
- **Adaptive Intelligence**: Self-reflection system generates and uses improved responses automatically
- **Modern UX**: Complete React-based web GUI with session persistence and streaming
- **Enhanced API**: RESTful endpoints for sessions, streaming chat, and file uploads
- **Better Development Experience**: Hot-reload, concurrent development, and automatic browser opening
- **Containerization**: Docker support for easy deployment and scaling
- **Enhanced Reasoning**: Multi-step problem solving for complex queries
- **Real-time Communication**: Server-Sent Events for live response streaming
- **File Processing**: Upload and share documents directly with the agent

### 📋 **Quick Start Checklist**

### 📋 **Quick Setup Checklist**

1. ✅ Clone repository and install dependencies (`npm run install:all`)
2. ✅ Copy `.env.example` to `.env` and configure your LLM provider API key(s)
3. ✅ Start ChromaDB: `docker run -v ./data/chroma:/chroma/chroma -p 8000:8000 chromadb/chroma`
4. ✅ Start development: `npm run dev:gui`
5. ✅ Access GUI at http://localhost:3000 (opens automatically)

## Quick Verification

Verify your installation with these simple tests:

### 1. API Test
```bash
# Test the streaming API
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello! What LLM models do you support?"}'
```

### 2. GUI Test  
```bash
# Start with GUI (should auto-open browser)
npm run dev:gui

# Verify: You should see the React interface with session management
```

### 3. Multi-Provider Test
Test different LLM providers by updating your `.env`:

```bash
# Test Google Gemini
LLM_MODEL=google:gemini-2.0-flash

# Test OpenAI (requires OPENAI_API_KEY)  
LLM_MODEL=openai:gpt-4o

# Test Anthropic (requires ANTHROPIC_API_KEY)
LLM_MODEL=anthropic:claude-3-5-sonnet-20241022
```

## Troubleshooting

### Common Issues

#### ❌ Vector Database Connection Failed
```bash
# Start ChromaDB first (most common issue)
docker run -v ./data/chroma:/chroma/chroma -p 8000:8000 chromadb/chroma

# Or check if port 8000 is available
netstat -an | grep 8000  # Linux/macOS
netstat -an | findstr 8000  # Windows
```

#### ❌ LLM API Key Not Working
```bash
# Verify your API key is set correctly
echo $GOOGLE_API_KEY    # Linux/macOS
echo %GOOGLE_API_KEY%   # Windows

# Test API key directly
curl -H "Authorization: Bearer $GOOGLE_API_KEY" \
  https://generativelanguage.googleapis.com/v1beta/models
```

#### ❌ Port Conflicts
```env
# Update your .env file to use different ports
PORT=3001
CHROMA_PORT=8001
```

#### ❌ Build/Installation Issues
```bash
# Clean reinstall
rm -rf node_modules client/node_modules package-lock.json client/package-lock.json
npm run install:all
```

#### ❌ GUI Not Loading
```bash
# Check both services are running
npm run dev:gui

# If client fails to start:
cd client
npm install
npm run dev
```

### Development Tips

- **Hot Reload**: Use `npm run dev:gui` for automatic reload on code changes
- **API Testing**: Use the `/api/health` endpoint to verify server status
- **Logs**: Check console output for detailed error information with structured logging
- **Memory**: Monitor ChromaDB logs if memory operations fail
- **MCP Tools**: Use `/mcp/reload` endpoint to refresh tool configurations

#### GUI Not Loading
```bash
# Check if client dependencies are installed
cd client && npm install

# Verify both server and client are running
npm run dev:gui
```

#### Port Conflicts
If port 3000 is in use, update your `.env` file:
```env
PORT=3001  # Or any available port
```

#### Build Errors
```bash
# Clean install
rm -rf node_modules client/node_modules
npm run install:all
npm run build
```

### Development Tips

- Use `npm run dev:gui` for the best development experience
- Check the browser console for frontend errors
- Monitor the terminal for backend logs
- API endpoints are available at `/api/*` when GUI is running
- Session data is stored in `./data/sessions/` by default

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Ensure both `npm run build` and `npm run dev:gui` work correctly
5. Submit a pull request with a clear description

## License

MIT License - see LICENSE file for details.

---

**Last Updated**: May 23, 2025  
**Version**: 0.1.0 (GUI-Enhanced)

For the latest updates and documentation, visit the project repository.
