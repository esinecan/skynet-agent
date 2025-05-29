# Skynet Agent - Complete Tutorial

This comprehensive tutorial will guide you through setting up, configuring, and using Skynet Agent - an autonomous AI assistant with multi-LLM provider support, semantic memory, and external tool integration.

## Overview

Skynet Agent is designed as a **cognitive AI prosthetic** that extends a single LLM with:

* **Multi-Provider LLM Support**: Seamlessly switch between OpenAI GPT, Google Gemini, and Anthropic Claude models
* **Semantic Memory System**: Long-term memory using vector embeddings with ChromaDB/Milvus storage
* **Autonomous Behavior**: Intrinsic motivation system that triggers self-initiated tasks during idle periods
* **Tool Integration**: Model Context Protocol (MCP) for dynamic external tool execution
* **Real-time Interface**: Modern React GUI with streaming responses and session management
* **Self-Reflection**: Multi-step reasoning with adaptive response improvement

Instead of orchestrating multiple LLMs, Skynet Agent surrounds a single LLM with intelligent **structured state management**, making it both powerful and debuggable.

## Architecture Deep Dive

### Core Philosophy

Skynet Agent follows an **"LLM Prosthetic"** model rather than brute-forcing with massive models. It achieves sophisticated behavior through:

1. **Structured Memory**: Vector-based semantic storage for context continuity
2. **Tool Augmentation**: Dynamic external capabilities via MCP integration  
3. **State Management**: LangGraph workflow orchestrating perception → decision → action → reflection loops
4. **Multi-Provider Flexibility**: Provider-agnostic LLM interface using Vercel AI SDK

### System Components

#### LLM Service (`llmClient.ts`)
- **Vercel AI SDK Integration**: Unified interface across providers
- **Streaming Support**: Real-time response generation with Server-Sent Events
- **Provider Support**: OpenAI, Google Gemini, Anthropic Claude
- **Tool Integration**: Seamless MCP tool calling within LLM conversations

#### Memory System (`memory/`)
- **Hybrid Architecture**: Short-term (session) + long-term (vector) memory
- **Real Embeddings**: Google text-embedding-004 for semantic similarity
- **Vector Storage**: ChromaDB (primary) with Milvus enterprise alternative
- **Consolidation**: Scheduled memory summarization and cleanup

#### Workflow Engine (`workflow.ts`)
- **LangGraph State Machine**: Directed workflow with error recovery
- **Self-Reflection**: Adaptive response improvement and multi-step reasoning
- **Tool Orchestration**: Dynamic tool selection and execution
- **Context Management**: Intelligent memory retrieval and integration

#### MCP Integration (`mcp/client.ts`)
- **Dynamic Tool Discovery**: Automatic server connection and tool listing
- **Hot Reload**: Runtime configuration updates without restart
- **Popular Tools**: Playwright (web automation), filesystem, CLI access
- **Custom Extensions**: Easy integration of new MCP-compliant servers

## Step-by-Step Setup

### Prerequisites

Ensure you have the following installed:

- **Node.js 18+** with npm
- **Docker** for vector database services
- **Git** for repository cloning

### 1. Project Installation

```bash
# Clone the repository
git clone <repository-url>
cd skynet-agent

# Install all dependencies (server + client)
npm run install:all
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
# Copy environment template
cp .env.example .env
```

Edit `.env` with your preferred configuration:

```env
# === LLM Provider Configuration ===
# Choose your primary LLM provider (you can configure multiple)

# Google Gemini (recommended for embeddings)
GOOGLE_API_KEY=your_gemini_api_key_here

# OpenAI (for GPT models)  
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic (for Claude models)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# === Model Selection ===
# Default model (can be changed at runtime)
LLM_MODEL=google:gemini-2.0-flash

# Available options:
# Google: google:gemini-2.0-flash, google:gemini-1.5-pro, google:gemini-1.5-flash
# OpenAI: openai:gpt-4o, openai:gpt-4o-mini, openai:gpt-3.5-turbo
# Anthropic: anthropic:claude-3-5-sonnet-20241022, anthropic:claude-3-5-haiku-20241022

# === Server Configuration ===
PORT=3000
MCP_SERVER_PORT=8081

# === Vector Database (ChromaDB - Primary) ===
CHROMA_PATH=./data/chroma
CHROMA_COLLECTION=skynet_memories

# === Alternative: Milvus (Enterprise) ===
# MILVUS_ADDRESS=localhost:19530
# MILVUS_COLLECTION=skynet_memories

# === Memory & Behavior ===
MEMORY_CONSOLIDATION_SCHEDULE="0 2 * * *"  # Daily at 2 AM
IDLE_THRESHOLD_MINUTES=10
MEMORY_DIR=./data/memory

# === MCP Tool Configuration ===
# Basic Playwright setup (browser automation)
SKYNET_MCP_SERVERS_JSON='{"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}'
```

### 3. API Key Setup

#### Google Gemini (Recommended)

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Add to your `.env` file:
   ```env
   GOOGLE_API_KEY=your_actual_api_key_here
   LLM_MODEL=google:gemini-2.0-flash
   ```

#### OpenAI (Optional)

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)  
2. Create a new API key
3. Add to your `.env` file:
   ```env
   OPENAI_API_KEY=your_actual_api_key_here
   LLM_MODEL=openai:gpt-4o
   ```

#### Anthropic Claude (Optional)

1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create a new API key  
3. Add to your `.env` file:
   ```env
   ANTHROPIC_API_KEY=your_actual_api_key_here
   LLM_MODEL=anthropic:claude-3-5-sonnet-20241022
   ```

### 4. Vector Database Setup

#### Option A: ChromaDB (Recommended)

ChromaDB is lightweight and perfect for development and small-to-medium production deployments:

```bash
# Start ChromaDB in Docker (required for memory to work)
docker run -v ./data/chroma:/chroma/chroma -p 8000:8000 chromadb/chroma
```

#### Option B: Milvus (Enterprise)

For high-performance production environments:

```bash
# Download Milvus standalone
wget https://github.com/milvus-io/milvus/releases/download/v2.4.15/milvus-standalone-docker-compose.yml

# Start Milvus
docker-compose -f milvus-standalone-docker-compose.yml up -d

# Update .env to use Milvus
# Uncomment the MILVUS_* variables in your .env file
```

### 5. MCP Tool Configuration

Configure external tools using the Model Context Protocol:

#### Basic Setup (Environment Variable)
```env
SKYNET_MCP_SERVERS_JSON='{"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}'
```

#### Advanced Setup (config.json)

Create a `config.json` file in the project root:

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
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "./data"]
      },
      "windows-cli": {
        "command": "npx", 
        "args": ["-y", "@simonb97/server-win-cli"]
      }
    }
  }
}
```

Popular MCP servers you can add:
- **`@playwright/mcp`**: Web browser automation and scraping
- **`@modelcontextprotocol/server-filesystem`**: File system operations
- **`@simonb97/server-win-cli`**: Windows command-line access
- **`@modelcontextprotocol/server-sequential-thinking`**: Step-by-step reasoning

## Running the Agent

### Development Mode (Recommended)

Start both backend and frontend with hot-reload:

```bash
# Start everything (auto-opens browser)
npm run dev:gui
```

This will:
1. Start the Express API server on port 3000
2. Start the React development server with proxy
3. Automatically open your browser to http://localhost:3000
4. Enable hot-reload for both backend and frontend changes

### Production Mode

Build and run the production version:

```bash
# Build both server and client
npm run build

# Start production server (serves built React app)
npm run gui
```

### Docker Deployment

Use the included Docker setup for production deployment:

```bash
# Full deployment with ChromaDB
docker-compose up -d

# Or use the startup scripts
./start.sh    # Linux/macOS
start.bat     # Windows
```

### Individual Services

For debugging or development:

```bash
# Backend API only
npm run dev

# Frontend only (requires backend running)
npm run dev:client
```

## Using the Web Interface

The React-based GUI provides a modern chat interface with advanced features:

### Key Features

1. **Session Management**: Create, switch, and delete conversation sessions
2. **Real-time Streaming**: Watch responses generate in real-time  
3. **File Upload**: Drag-and-drop files for the agent to process
4. **Markdown Rendering**: Rich text with syntax highlighting
5. **Memory Integration**: Context continuity across sessions
6. **Tool Visualization**: See when and how tools are used

### Interface Overview

- **Left Sidebar**: Session list with create/delete options
- **Main Chat Area**: Conversation with streaming responses
- **Bottom Input**: Message composition with file upload
- **Top Bar**: Current session info and model status

### Chat Features

#### Basic Interaction
```
User: Hello! What can you help me with?
Agent: [Streams response in real-time describing capabilities]
```

#### Memory Continuity
```
Session 1:
User: My favorite programming language is TypeScript
Agent: I'll remember that you prefer TypeScript...

[Later in same session or new session]
User: What's my favorite language?
Agent: You mentioned that TypeScript is your favorite programming language.
```

#### File Upload
Drag and drop files or click the upload button to share:
- **Text files**: Direct content analysis
- **Documents**: Parsing and memory storage
- **Code files**: Syntax analysis and suggestions

#### Tool Usage
The agent automatically uses tools when needed:
```
User: Can you check the weather in New York?
Agent: I'll use the browser tool to get current weather information...
[Tool execution visible in interface]
```

## Memory System Deep Dive

### How Memory Works

Skynet Agent uses a **hybrid memory architecture**:

1. **Short-term Memory**: Current session context (held in variables)
2. **Long-term Memory**: Vector-embedded storage in ChromaDB/Milvus
3. **Consolidation**: Periodic summarization to prevent information overload

### Memory Storage Process

```typescript
// Example of how memories are stored
const memory = {
  text: "User prefers TypeScript for backend development",
  metadata: {
    timestamp: "2025-01-28T10:30:00Z", 
    session: "session_123",
    type: "preference"
  },
  embedding: [0.1, 0.3, -0.2, ...] // 768-dimensional vector
};
```

### Memory Retrieval

When you ask a question, the agent:

1. **Generates query embedding** using text-embedding-004
2. **Searches vector database** for similar memories  
3. **Ranks by similarity score** (0.0 to 1.0)
4. **Integrates relevant memories** into response context

### Memory Consolidation

The system automatically consolidates memories:

- **Schedule**: Daily at 2 AM (configurable via `MEMORY_CONSOLIDATION_SCHEDULE`)
- **Process**: Summarizes related memories to prevent duplication
- **Cleanup**: Removes outdated or redundant information

## Advanced Usage Examples

### Multi-Provider Testing

Test different LLM providers by updating the model:

```bash
# Test Google Gemini
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Solve this step by step: What is 25% of 144?", "modelId": "google:gemini-2.0-flash"}'

# Test OpenAI GPT-4o  
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Explain quantum computing in simple terms", "modelId": "openai:gpt-4o"}'

# Test Anthropic Claude
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Write a Python function to calculate Fibonacci numbers", "modelId": "anthropic:claude-3-5-sonnet-20241022"}'
```

### Memory Interaction Examples

#### Storing Personal Preferences
```
User: I'm working on a React project using TypeScript and Tailwind CSS
Agent: I'll remember your current tech stack for future reference...
[Memory stored: "User working on React + TypeScript + Tailwind CSS project"]

User: What database should I use for my project?
Agent: Based on your React/TypeScript project, I'd recommend...
[Agent retrieves stored project context]
```

#### Long-term Context
```
Session 1:
User: I'm learning machine learning with Python
Agent: Great! I'll help you with your ML journey...

[Days later, new session]
User: Can you help me with my studies?
Agent: Of course! I remember you're learning machine learning with Python. What specific topic would you like to explore?
```

### Tool Integration Examples

#### Web Browsing with Playwright
```
User: What's the latest news about AI from TechCrunch?
Agent: I'll browse TechCrunch to get the latest AI news for you...

[Tool execution: playwright browser automation]
Agent: Here are the latest AI news stories I found... [synthesized results]
```

#### File System Operations
```
User: Can you list the files in my project directory and suggest a better organization?
Agent: I'll examine your project structure...

[Tool execution: filesystem MCP server]
Agent: I found these files in your project: [file listing and organization suggestions]
```

### Autonomous Behavior

The agent can initiate conversations when idle:

```
[After 10 minutes of inactivity]
Agent: Since you seem free, perhaps I could help organize your recent notes or suggest next steps for your TypeScript project?
```

## API Reference

### Core Endpoints

#### Chat API
```http
POST /api/query
Content-Type: application/json

{
  "query": "Your message here",
  "sessionId": "optional-session-id",
  "modelId": "optional-model-override"
}
```

#### Streaming Chat
```http
GET /api/stream/[sessionId]?query=your_message
Accept: text/event-stream
```

Response format:
```javascript
data: {"type": "content", "content": "Hello"}
data: {"type": "done"}
```

#### Session Management  
```http
# List all sessions
GET /api/sessions

# Get specific session
GET /api/sessions/:sessionId

# Create new session
POST /api/sessions
{"title": "New Conversation"}

# Delete session
DELETE /api/sessions/:sessionId
```

#### File Upload
```http
POST /api/upload
Content-Type: multipart/form-data

# Include file in form data with key "file"
```

#### Health & Status
```http
# Basic health check
GET /api/health

# MCP server status
GET /api/mcp/status

# Reload MCP configurations
POST /api/mcp/reload
```

## Customization & Extension

### Adding New LLM Providers

The Vercel AI SDK makes it easy to add new providers:

1. **Install provider SDK**:
   ```bash
   npm install @ai-sdk/provider-name
   ```

2. **Update LLM client** (`src/agent/llmClient.ts`):
   ```typescript
   import { createProviderName } from '@ai-sdk/provider-name';
   
   case 'provider-name':
     this.llm = createProviderName({ 
       apiKey: process.env.PROVIDER_API_KEY 
     })(modelName);
     break;
   ```

3. **Add environment variables**:
   ```env
   PROVIDER_API_KEY=your_key_here
   LLM_MODEL=provider-name:model-name
   ```

### Custom MCP Servers

Create custom tools by implementing MCP-compliant servers:

1. **Create MCP server** following the [MCP specification](https://github.com/modelcontextprotocol/typescript-sdk)

2. **Add to configuration**:
   ```json
   {
     "mcp": {
       "servers": {
         "your-tool": {
           "command": "node",
           "args": ["path/to/your/mcp-server.js"]
         }
       }
     }
   }
   ```

3. **Agent will automatically discover and use** your tools

### Memory System Extensions

Extend the memory system for specific use cases:

```typescript
// Custom memory metadata
interface CustomMemoryMetadata {
  projectId?: string;
  priority?: 'high' | 'medium' | 'low';
  tags?: string[];
}

// Store with custom metadata
await memoryManager.storeMemory(
  "Important project requirement",
  { 
    projectId: "proj-123",
    priority: "high",
    tags: ["requirements", "critical"]
  }
);

// Query with filters
const memories = await memoryManager.retrieveMemories(
  "project requirements",
  { projectId: "proj-123" }
);
```

### Custom Workflow Steps

Modify the LangGraph workflow in `src/agent/workflow.ts`:

```typescript
// Add custom workflow nodes
const customWorkflow = new StateGraph(AppStateSchema)
  .addNode("perception", perceptionNode)
  .addNode("custom_analysis", customAnalysisNode)  // Your custom step
  .addNode("decision", decisionNode)
  .addNode("action", actionNode)
  .addNode("reflection", reflectionNode);
```

## Troubleshooting Guide

### Common Issues

#### 1. Vector Database Connection Errors

**Problem**: `ChromaDB connection failed`
```bash
# Solution: Ensure ChromaDB is running
docker run -v ./data/chroma:/chroma/chroma -p 8000:8000 chromadb/chroma

# Check if port is available
netstat -an | grep 8000
```

#### 2. LLM API Authentication Errors

**Problem**: `Invalid API key` or `Unauthorized`
```bash
# Verify API key is set
echo $GOOGLE_API_KEY

# Test API key directly
curl -H "Authorization: Bearer $GOOGLE_API_KEY" \
  https://generativelanguage.googleapis.com/v1beta/models
```

#### 3. Memory Storage Issues

**Problem**: `Failed to store memory` 
- Check ChromaDB is running on port 8000
- Verify `CHROMA_PATH` directory permissions
- Check logs for embedding generation errors

#### 4. MCP Tool Errors

**Problem**: `MCP server connection failed`
```bash
# Test MCP server directly
npx @playwright/mcp@latest

# Check MCP configuration
curl http://localhost:3000/api/mcp/status

# Reload MCP servers
curl -X POST http://localhost:3000/api/mcp/reload
```

#### 5. Frontend Build Issues

**Problem**: GUI not loading or build failures
```bash
# Clean install
rm -rf node_modules client/node_modules
npm run install:all

# Check if ports conflict
PORT=3001 npm run dev:gui
```

### Debug Mode

Enable detailed logging for troubleshooting:

```env
# Add to .env
NODE_ENV=development
LOG_LEVEL=debug
```

This provides detailed logs for:
- LLM API calls and responses
- Memory storage and retrieval operations  
- MCP tool execution
- Workflow state transitions

### Performance Optimization

#### Memory System
- **ChromaDB**: Suitable for up to 100K memories
- **Milvus**: Use for 1M+ memories or high-concurrency

#### LLM Selection
- **Gemini 2.0 Flash**: Fastest responses
- **GPT-4o**: Best reasoning capability  
- **Claude 3.5 Sonnet**: Best for code and analysis

#### Caching
- Enable embedding caching for repeated queries
- Use session persistence to reduce memory lookups

## Best Practices

### Production Deployment

1. **Environment Security**:
   ```bash
   # Use environment-specific files
   .env.production
   .env.staging
   .env.development
   ```

2. **Database Persistence**:
   ```yaml
   # docker-compose.yml
   volumes:
     - ./data/chroma:/chroma/chroma:Z
     - ./data/sessions:/app/data/sessions:Z
   ```

3. **Health Monitoring**:
   ```bash
   # Set up health checks
   curl http://localhost:3000/api/health
   ```

### Development Workflow

1. **Use hot-reload**: `npm run dev:gui`
2. **Test multiple providers**: Switch `LLM_MODEL` in `.env`
3. **Monitor logs**: Check console for detailed operation logs
4. **Incremental testing**: Start with simple queries, add complexity

### Memory Management

1. **Structured storage**: Include relevant metadata with memories
2. **Regular consolidation**: Monitor the consolidation schedule
3. **Query optimization**: Use specific, contextual queries for better retrieval

This comprehensive tutorial should get you up and running with Skynet Agent's full capabilities. The system is designed to be both powerful and approachable - start with basic setup and gradually explore advanced features as needed.
