# Skynet Agent

Skynet Agent is an autonomous AI assistant built with Node.js and TypeScript. It integrates with Google Gemini, supports intrinsic motivation, self-reflection, memory management, and external tool execution via the Model Context Protocol (MCP). It exposes an HTTP API for interaction and includes a modern web-based GUI. See "Tutorial.md" for more information.

## Features

* Google Gemini integration for natural-language understanding and generation
* **Real embeddings**: Uses Gemini's embedding-001 model for semantic memory storage and retrieval
* **Production-ready vector storage**: Milvus vector database integration with fallback to in-memory storage
* Multi-step reasoning and adaptive self-reflection for response improvement
* Intrinsic motivation: triggers autonomous tasks after idle periods
* Memory management with semantic similarity search and consolidation
* Memory consolidation: scheduled summarization of stored memories
* External tool execution via MCP client manager
* Express-based API server with health endpoints and global error handling
* Structured logging and health monitoring utilities
* **Modern web-based GUI** interface for easy interaction and conversation management
* File upload support for sharing documents with the agent
* **Docker support** for easy deployment

## Prerequisites

* Node.js >= 18.x
* npm >= 8.x
* A valid Gemini API key (`GOOGLE_API_KEY`)
* **Optional**: Milvus vector database for production memory storage

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

**For Milvus support** (optional, falls back to in-memory storage):
```bash
npm install @zilliz/milvus2-sdk-node
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and set the following variables:

```env
# LLM API Keys
GOOGLE_API_KEY=your_gemini_api_key_here

# Server Configuration
PORT=3000
MCP_SERVER_PORT=8081

# MCP Server Configuration (JSON format)
# Example: {"playwright":{"transport":"stdio","command":"npx","args":["@playwright/mcp@latest"]}}
# SKYNET_MCP_SERVERS_JSON='{}'

# Milvus Vector Database Configuration
MILVUS_ADDRESS=localhost:19530
MILVUS_USERNAME=
MILVUS_PASSWORD=
MILVUS_COLLECTION=skynet_memories

# Memory Configuration
# Memory consolidation schedule (cron format)
MEMORY_CONSOLIDATION_SCHEDULE="0 2 * * *"  # 2 AM daily
# Directory for memory data (fallback and legacy)
MEMORY_DIR=./data/memory

# Autonomous Behavior
# Minutes of inactivity before triggering autonomous actions
IDLE_THRESHOLD_MINUTES=10
```

### Vector Database Setup

#### Production: Milvus Vector Database

For production use, set up Milvus for high-performance vector storage:

1. **Docker Compose** (Recommended):
   ```bash
   # Download Milvus standalone docker-compose
   wget https://github.com/milvus-io/milvus/releases/download/v2.4.15/milvus-standalone-docker-compose.yml -O docker-compose.yml
   
   # Start Milvus
   docker-compose up -d
   ```

2. **Configure connection** in `.env`:
   ```env
   MILVUS_ADDRESS=localhost:19530
   MILVUS_COLLECTION=skynet_memories
   ```
### MCP Server Configuration

The agent can connect to multiple MCP (Model Context Protocol) servers to access external tools. There are three ways to configure MCP servers, in order of precedence:

1. **Environment Variable**: Set `SKYNET_MCP_SERVERS_JSON` with a JSON string
   ```
   SKYNET_MCP_SERVERS_JSON='{"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}'
   ```

2. **Config File**: Create/edit `config.json` in the project root:
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

3. **VS Code Settings**: Add MCP configurations to your VS Code settings.json.

If no configuration is found, a default configuration with the Playwright MCP server will be used.

### Available MCP Servers

- **playwright**: Browser automation (`@playwright/mcp`)
- **filesystem**: File operations (`@modelcontextprotocol/server-filesystem`)
- **windows-cli**: Windows CLI access (`@simonb97/server-win-cli`)
- **sequential-thinking**: Step-by-step problem solving (`@modelcontextprotocol/server-sequential-thinking`)

You can add any MCP-compliant server to the configuration.

### Dynamic MCP Configuration

The agent supports dynamically reloading MCP server configurations without restarting the service. You can:

1. **Modify the config.json file**: Update the MCP server configurations and reload
2. **Use the reload API endpoint**: Send a POST request to reload configurations

```bash
# Reload MCP configurations via API
curl -X POST http://localhost:3000/mcp/reload
```

The response will include the newly loaded server configurations:

```json
{
  "success": true,
  "message": "MCP server configurations reloaded",
  "count": 4,
  "servers": ["filesystem", "windows-cli", "playwright", "sequential-thinking"],
  "timestamp": "2025-05-23T12:34:56.789Z"
}
```

## Usage

### Development

Start the development environment with both backend and frontend:

```bash
# Start both server and GUI in development mode
npm run dev:gui

# Or start individually:
# Backend only
npm run dev

# Frontend only (requires backend running)
npm run dev:client
```

The GUI will automatically open in your browser at http://localhost:3000 when using `npm run dev:gui`.

### Production

```bash
# Build both server and client
npm run build

# Start production server with GUI
npm run gui

# Or start backend only
npm start
```

The production GUI serves the built React app from the Express server at http://localhost:3000.

### Docker Deployment

```bash
# Build Docker image
docker build -t skynet-agent .

# Run container
docker run -p 3000:3000 -v $(pwd)/data:/app/data skynet-agent
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

* **src/index.ts**: Main entry point with CLI argument parsing for GUI mode; loads environment, initializes logger, error handlers, agent, and API server.
* **src/run.ts**: Ensures `.env` exists, loads variables, initializes agent and server.
* **src/agent/**: Core agent logic
  * `index.ts`: Sets up agent workflow and optional MCP clients.
  * `intrinsicMotivation.ts`: Monitors idle time and triggers autonomous tasks.
  * `selfReflection.ts`: **Enhanced** - Evaluates responses with adaptive improvement and multi-step reasoning.
  * `llmClient.ts`: Wraps Google Gemini API calls and manages the model instance.
  * `workflow.ts`: **Updated** - Defines the LangGraph workflow with integrated self-reflection and adaptive responses.
  * `schemas/appStateSchema.ts`: Zod schemas for the agent's state, messages, tool calls, and reflection results.
* **src/memory/**: Long-term memory and consolidation
  * `index.ts`: **Production-ready** - Memory manager with Milvus integration and in-memory fallback.
  * `milvus.ts`: **New** - Milvus vector database client with real embeddings.
  * `consolidation.ts`: Cron-scheduled task to summarize recent memories.
* **src/mcp/client.ts**: MCP client manager for connecting to external tool servers, listing tools, and executing tool calls.
* **src/server/api.ts**: **Enhanced** - Express server with session management, streaming endpoints, file upload, and static file serving for React GUI.
* **src/db/sessions.ts**: **New** - Session management for GUI conversations with file-based persistence.
* **client/**: **New** - React-based web interface
  * `src/App.tsx`: Main React application component
  * `src/stores/chatStore.ts`: Zustand state management with streaming support
  * `src/components/`: SessionList, ChatInterface, MessageList, InputArea components
  * `vite.config.ts`: Vite configuration with API proxy
* **src/utils/**: Utility modules including logger, error handler, and health monitoring

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
│   ├── milvus.ts
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

1. **RAG via Gemini** - Memory system now uses Gemini's embedding-001 model. **buggy**
2. **Self-Reflection System** - **Temporarily turned off**
3. **Multi-Step Reasoning** - Implemented in selfReflection.ts with performMultiStepReasoning function.
4. **Milvus Vector Database** - Production-ready vector storage with automatic fallback to in-memory storage.
5. **Docker Support** - Complete containerization with health checks.
6. **Modern React GUI** - Complete web interface with session management, streaming responses, and file uploads.
7. **Session Management System** - Persistent conversation storage with CRUD operations.
8. **Streaming Chat API** - Real-time Server-Sent Events for live response streaming.
9. **File Upload Support** - Multer-based file handling with base64 encoding for agent processing. **buggy**
10. **Enhanced API Server** - RESTful endpoints for sessions, streaming, and file operations.

### 🔧 **Technology Stack**

#### Backend
- **Node.js + TypeScript**: Core runtime and type safety
- **Express.js**: Enhanced API server with session management and streaming
- **Google Gemini**: LLM integration with real embeddings (embedding-001)
- **Milvus Vector Database**: High-performance vector storage with automatic fallback
- **LangGraph**: Workflow orchestration with self-reflection
- **Model Context Protocol (MCP)**: External tool integration
- **Multer**: File upload handling
- **Zustand**: State management
- **Docker**: Containerization support

#### Frontend
- **React 18**: Component-based UI framework
- **TypeScript**: Type safety for frontend code
- **Vite**: Fast development and build tooling
- **Tailwind CSS**: Utility-first styling
- **React Markdown**: Rich text rendering with syntax highlighting
- **Lucide React**: Modern icon library
- **Server-Sent Events**: Real-time streaming communication

#### Development Tools:
- **Concurrently**: Parallel development server execution
- **ts-node-dev**: Hot-reload TypeScript development
- **PostCSS + Autoprefixer**: CSS processing
- **ESLint + Jest**: Code quality and testing

### 🚀 **Key Improvements Over Original**

- **Functional Memory**: Real embeddings replaced mock random vectors for semantic search
- **Adaptive Intelligence**: Self-reflection system generates and uses improved responses automatically
- **Production Scalability**: Milvus database support for large-scale deployments
- **Modern UX**: Complete React-based web GUI with session persistence and streaming
- **Enhanced API**: RESTful endpoints for sessions, streaming chat, and file uploads
- **Better Development Experience**: Hot-reload, concurrent development, and automatic browser opening
- **Containerization**: Docker support for easy deployment and scaling
- **Enhanced Reasoning**: Multi-step problem solving for complex queries
- **Real-time Communication**: Server-Sent Events for live response streaming
- **File Processing**: Upload and share documents directly with the agent

### 📋 **Quick Start Checklist**

1. ✅ Clone repository and install dependencies (`npm run install:all`)
2. ✅ Copy `.env.example` to `.env` and configure your `GOOGLE_API_KEY`
3. ✅ Set up Milvus
4. ✅ Start development: `npm run dev:gui`
5. ✅ Access GUI at http://localhost:3000 (opens automatically)

## Quick Verification

After setup, verify your installation works correctly:

### 1. Backend API Test
```bash
# Start the server
npm run dev

# In another terminal, test the API
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello, can you introduce yourself?"}'
```

### 2. GUI Test
```bash
# Start the full GUI
npm run dev:gui

# Browser should automatically open to http://localhost:3000
# You should see the Skynet Agent interface with session management
```

### 3. Production Build Test
```bash
# Build everything
npm run build

# Start production server
npm run gui

# Access at http://localhost:3000
```

## Troubleshooting

Project is still in its development phase. If something is broken, give it a week and check back.

### Common Issues

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
