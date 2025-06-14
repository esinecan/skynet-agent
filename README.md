#  Skynet-Agent: One LLM Client to Rule Them All (Feat RAG + MCP) (In Development But Usable)

> *"What if AI could not only access memories, but consciously choose what to remember? With MCP tool access fully supported?"*

![New Project](https://github.com/user-attachments/assets/453e192b-805c-4275-a3fe-358f37c50470)


[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-FF6B6B?style=for-the-badge&logo=database&logoColor=white)](https://www.trychroma.com/)
[![MCP](https://img.shields.io/badge/MCP-4A90E2?style=for-the-badge&logo=protocol&logoColor=white)](https://modelcontextprotocol.io/)

**Skynet-Agent Client** is a revolutionary AI conversation platform that implements a **dual-layer memory architecture** inspired by human cognition. It combines automatic background memory (like human non-volitional memory) with conscious, deliberate memory operations that AI can control. It also has the tool access powers similar to those of Claude Desktop.

##  Minimal But Powerful

###  Dual-Layer Memory Architecture
- **Automatic Memory (RAG)**: Non-volitional background memory that automatically stores and retrieves conversational context using ChromaDB vector embeddings and Google's text-embedding-004 model
- **Conscious Memory**: Volitional memory operations where AI explicitly saves, searches, updates, and deletes memories through MCP tools - mimics human conscious memory control
- **Knowledge Graph**: Structured long-term memory using Neo4j to represent complex relationships between entities and concepts with automatic synchronization

###  MCP Tool Integration
- Exposes conscious memory as **Model Context Protocol tools**
- AI naturally saves and recalls memories during conversation
- Clean separation between UI, memory, and AI operations

###  Advanced Memory Capabilities
- **Dual-Process Architecture**: Automatic RAG system for non-volitional memory plus conscious memory tools for explicit control
- **Semantic + Keyword Search**: Vector embeddings for conceptual similarity with keyword fallback for exact matches
- **Knowledge Graph Integration**: Neo4j-powered relationship mapping with automatic synchronization from chat history
- **Smart Memory Ranking**: Combines semantic similarity, importance scores, and recency for optimal retrieval

---

##  Supported LLM Providers

| Provider | Type | Best For | Default Model |
|----------|------|----------|---------------|
| **Google** | Cloud | Multimodal & speed | `gemini-2.5-flash-preview-05-20` |
| **DeepSeek** | Cloud | Cost-effective performance | `deepseek-chat` |
| **OpenAI-Compatible** | Cloud/Self-Hosted | Broad ecosystem support | `gpt-4o-mini` |
| **Anthropic** | Cloud | Advanced reasoning & safety | `claude-3-5-haiku-20241022` |
| **Groq** | Cloud | Ultra-fast inference | `llama-3.3-70b-versatile` |
| **Mistral** | Cloud | Natural language & code | `mistral-large-latest` |
| **Ollama** | Local | Privacy-focused | `llama3.2:latest` |

Quick setup:
```env
LLM_PROVIDER=google
LLM_MODEL=gemini-2.5-flash-preview-05-20
GOOGLE_API_KEY=your_key_here
```

##  Architecture Overview

```
        
   User Interface  Next.js Chat      Chat API      
   (React/TS)           Client               Routes        
        
                                                       
                           
                         LLM Service      MCP Manager    
                         (Anthropic)                         
                           
                                                       
                                              
                                               Conscious Memory
                                                MCP Server     
                                              
                                                       
        
   Memory UI      Conscious Memory ChromaDB Memory 
   Dashboard             Service               Store       
        
                                                       
                           
                          RAG System      Google         
                         (Automatic)          Embeddings     
                           
```

### Core Components

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Chat Interface** | Real-time AI conversations | Next.js, React, TypeScript |
| **RAG System** | Automatic memory storage & retrieval | ChromaDB, Google Embeddings |
| **Conscious Memory** | Explicit memory operations | MCP Tools, Vector Search |
| **Hybrid Search** | Semantic + keyword matching | Custom algorithm |
| **MCP Integration** | Tool-based AI memory access | Model Context Protocol |

##  Multi-Provider LLM Support

**Skynet-Agent** supports **7 different LLM providers** with proper default models and API integrations.




| ** Groq**              | Cloud             | Ultra‑fast inference                  | `grok-3-mini`, `grok-3-beta`                           |
| ** Mistral**            | Cloud             | Natural language & code generation    | `mistral-7b-instruct`, `mistral-coder-7b`               |
| ** OpenAI-Compatible**  | Cloud / Self‑Hosted | Broad ecosystem integration           | `gpt-4o-chat`, `gpt-4o-code`, and more                  |
| ** Ollama**             | Local             | Privacy-focused, truly free           | Any local model (Llama 3, Qwen3, etc.)                  |
| ** Google Gemini**      | Cloud             | Multimodal integration & high speed   | `gemini-2.5-flash`, `gemini-2.5-pro`                    |
| ** DeepSeek**           | Cloud             | Cost‑effective, robust performance    | `deepseek-chat-r1`, `deepseek-coder-r1`                 |



###  Quick Provider Setup
```env
# Choose your provider
LLM_PROVIDER=google
LLM_MODEL=gemini-2.5-flash-preview-05-20

# Add your API key
GOOGLE_API_KEY=your_google_api_key
```

** Complete Provider Setup Guide** - Installation, configuration, and usage examples for all providers detailed above.

---

##  Quick Start

### Prerequisites

- **Node.js** 18+ 
- **Docker** & **Docker Compose** (for ChromaDB and Neo4j)
- **API Key** for your chosen LLM provider (see supported providers above)

### Installation

```bash
# Clone and install
git clone https://github.com/esinecan/skynet-agent.git
cd skynet-agent
npm install

# Set up environment configuration
cp .env.example .env.local
# Edit .env.local with your API keys and configuration

# Start required services
docker-compose up -d     # Starts ChromaDB (port 8000) and Neo4j (ports 7474, 7687)

# Start the application
npm run dev             # Starts Next.js (port 3000) + background KG sync service
```

**Access Points:**
- Main application: `http://localhost:3000`
- Conscious Memory dashboard: `http://localhost:3000/conscious-memory`
- Semantic Memory demo: `http://localhost:3000/semantic-memory`
- Neo4j browser: `http://localhost:7474` (neo4j/password123)

### Development Scripts

```bash
# Development modes
npm run dev              # Start Next.js + background KG sync (recommended)
npm run dev:debug        # Same as above with Node.js debugging enabled
npm run dev:next         # Start only Next.js (no KG sync)
npm run dev:kg           # Start only KG sync service in watch mode

# Knowledge Graph operations
npm run kg:sync          # One-time incremental sync
npm run kg:sync:full     # Full resync from scratch
npm run kg:sync:queue    # Process error retry queue
npm run kg:sync:watch    # Continuous sync service

# Testing
npm run test             # Run all test suites
npm run test:rag         # Test RAG system
npm run test:integration # Test API endpoints
npm run test:neo4j       # Test Neo4j integration

# Production
npm run build            # Build for production
npm run start            # Start production server
npm run type-check       # TypeScript validation
```

### Environment Configuration

Required environment variables in `.env.local`:

```env
# LLM Provider Configuration (choose one)
GOOGLE_API_KEY=your_google_api_key
# OR
ANTHROPIC_API_KEY=your_anthropic_api_key  
# OR  
OPENAI_API_KEY=your_openai_api_key
# OR
DEEPSEEK_API_KEY=your_deepseek_api_key

# Provider and model selection
LLM_PROVIDER=google                           # google, anthropic, openai, deepseek, groq, mistral, ollama
LLM_MODEL=gemini-2.5-flash-preview-05-20     # Model name for chosen provider

# Database connections (when using Docker)
CHROMA_URL=http://localhost:8000              # ChromaDB endpoint
NEO4J_URI=bolt://localhost:7687               # Neo4j connection
NEO4J_USER=neo4j                              # Neo4j username
NEO4J_PASSWORD=password123                    # Neo4j password

# Optional: RAG system configuration
RAG_ENABLED=true                              # Enable automatic memory
RAG_MAX_MEMORIES=3                            # Max memories to retrieve per query
```

### Docker Services

```bash
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f [service_name]        # chromadb or neo4j

# Stop services
docker-compose down

# Clean reset (removes all data)
docker-compose down -v
```

---

##  Usage Examples

###  Natural Memory Operations

The AI automatically handles memory operations through conversation:

```
User: "Remember that I'm working on a React project with TypeScript and prefer functional components"

AI: " I've saved this to memory: Your React project preferences - TypeScript with functional components"

User: "What were my frontend preferences again?"

AI: " From memory: You're working on a React project with TypeScript and prefer functional components. You also mentioned preferring Tailwind for styling earlier."
```

###  Explicit Memory Commands

```
User: "Save this debugging approach for React performance issues"
AI: [Automatically calls save_memory tool]

User: "Search my memories for anything about state management"  
AI: [Calls search_memories tool and returns relevant findings]

User: "What have I learned about Next.js?"
AI: [Searches both conscious and RAG memories]
```

###  Memory Types

| Type | Description | Example |
|------|-------------|---------|
| **Preferences** | User settings and choices | "I prefer VS Code over other editors" |
| **Knowledge** | Technical insights and learnings | "React hooks are better for state logic" |
| **Context** | Project and work information | "Working on e-commerce platform" |
| **References** | Important links and resources | "Useful TypeScript patterns guide" |

---

##  Technical Deep Dive

### Memory Architecture Deep Dive

#### Automatic Memory (RAG System)
The RAG system (`src/lib/rag.ts`) provides non-volitional background memory:

```typescript
interface Memory {
  id: string;
  text: string;                    // Original message content
  embedding: number[];             // Google text-embedding-004 vector
  metadata: {
    sender: 'user' | 'assistant';
    timestamp: string;
    conversationId: string;
    messageIndex: number;
    summary?: string;              // Auto-summarized if over token limit
  };
}
```

**Key Features:**
- Automatic storage of all conversational turns in ChromaDB
- Semantic similarity search using vector embeddings
- Fallback hash-based embeddings when API unavailable
- Smart context formatting with conversation flow preservation
- Configurable retrieval limits and similarity thresholds

#### Conscious Memory System
Volitional memory operations via MCP tools (`src/lib/conscious-memory.ts`):

```typescript
interface ConsciousMemory {
  id: string;
  content: string;                 // Memory content
  tags: string[];                  // Categorical organization
  importance: number;              // 1-10 relevance score
  source: 'explicit' | 'suggested' | 'derived';
  context?: string;                // Situational context
  metadata: {
    createdAt: string;
    updatedAt?: string;
    accessCount: number;
    lastAccessed: string;
  };
}
```

**Available MCP Tools:**
- `save_memory`: Store important information with tagging
- `search_memories`: Query with filters (tags, importance, date)
- `update_memory`: Modify existing memories
- `delete_memory`: Remove memories
- `get_memory_stats`: Usage analytics
- `get_memory_tags`: Available tag categories

#### Knowledge Graph Integration
Neo4j-powered relationship mapping (`src/lib/knowledge-graph-service.ts`):

```typescript
interface KnowledgeNode {
  id: string;
  type: 'Person' | 'Concept' | 'Project' | 'Location' | 'Event';
  properties: Record<string, any>;
  relationships: KnowledgeRelationship[];
}

interface KnowledgeRelationship {
  type: string;                    // KNOWS, WORKS_ON, LOCATED_IN, etc.
  target: string;                  // Target node ID
  properties?: Record<string, any>;
  strength: number;                // Relationship confidence
}
```

**Synchronization Process:**
- Automatic extraction from chat history
- Background sync service (`src/scripts/run-kg-sync.ts`)
- Retry queue for failed operations
- Metrics collection and error handling

### Hybrid Search Algorithm

The system implements a sophisticated multi-stage search:

#### Stage 1: Semantic Search
```typescript
// Uses Google text-embedding-004 for vector similarity
const semanticResults = await memoryStore.retrieveMemories(query, {
  minScore: 0.0,  // Low threshold for broad matching
  limit: 10
});
```

#### Stage 2: Keyword Fallback
```typescript
// Triggered when semantic results are insufficient
if (semanticResults.length < minThreshold) {
  const keywordResults = await performKeywordSearch(query);
  // Scores based on exact matches and word boundaries
}
```

#### Stage 3: Smart Merging
```typescript
// Combines results with intelligent ranking
const mergedResults = mergeSearchResults(semanticResults, keywordResults);
// Prioritizes semantic results for close scores
// Ensures no duplicates
// Maintains relevance order
```

### MCP Tool Integration

Conscious memory operations are exposed as MCP tools:

```typescript
// Available tools for the LLM
const tools = [
  'save_memory',
  'search_memories', 
  'update_memory',
  'delete_memory',
  'get_related_memories',
  'get_memory_tags',
  'get_memory_stats'
];
```

Each tool returns structured content that the LLM can use naturally in conversation.

---

##  Key Features

###  Intelligent Memory Management
- **Automatic Importance Scoring**: AI determines memory significance
- **Tag-Based Organization**: Categorize memories for easy retrieval
- **Relationship Mapping**: Link related memories together
- **Memory Editing**: Update and refine stored information

###  Advanced Search Capabilities
- **Multi-Modal Search**: Semantic understanding + exact keyword matching
- **Contextual Filtering**: Search by tags, importance, date ranges
- **Cross-Memory Search**: Find connections across different memory types
- **Relevance Ranking**: Smart scoring combines multiple signals

###  Beautiful User Interface
- **Real-Time Chat**: Smooth conversation experience
- **Memory Dashboard**: Visual memory management interface
- **Smart Suggestions**: AI-powered memory recommendations
- **Export/Import**: Backup and share memory collections
- **Actually Looks Very Ugly**: I suck at UI design

###  Performance Optimizations
- **Efficient Embeddings**: Google's latest text-embedding-004 model
- **Caching Layer**: Reduces API calls and improves response times
- **Batch Operations**: Handle multiple memories efficiently
- **Background Processing**: Non-blocking memory operations

---

##  API Reference

### Conscious Memory API

#### Save Memory
```http
POST /api/conscious-memory
Content-Type: application/json

{
  "action": "save",
  "content": "User prefers functional components in React",
  "tags": ["react", "preferences", "frontend"],
  "importance": 7,
  "context": "During discussion about React best practices"
}
```

#### Search Memories
```http
POST /api/conscious-memory
Content-Type: application/json

{
  "action": "search",
  "query": "React components",
  "tags": ["react"],
  "limit": 10,
  "importanceMin": 5
}
```

#### Memory Statistics
```http
GET /api/conscious-memory?action=stats
```

#### Available Tags
```http
GET /api/conscious-memory?action=tags
```

### MCP Tools

The conscious memory system exposes these tools to the LLM:

#### save_memory
```json
{
  "name": "save_memory",
  "description": "Save important information to conscious memory",
  "inputSchema": {
    "type": "object",
    "properties": {
      "content": {"type": "string"},
      "tags": {"type": "array", "items": {"type": "string"}},
      "importance": {"type": "number", "minimum": 1, "maximum": 10},
      "context": {"type": "string"}
    }
  }
}
```

#### search_memories
```json
{
  "name": "search_memories",
  "description": "Search conscious memories for relevant information",
  "inputSchema": {
    "type": "object", 
    "properties": {
      "query": {"type": "string"},
      "tags": {"type": "array", "items": {"type": "string"}},
      "limit": {"type": "number"},
      "importanceMin": {"type": "number"}
    }
  }
}
```

---

##  Project Structure

```
skynet-agent/
 src/
    app/                    # Next.js app router
       api/               # API routes
          chat/          # Chat endpoints
          conscious-memory/ # Memory API
          chat-history/  # Chat history API
       conscious-memory/  # Memory dashboard page
       globals.css        # Global styles
    components/            # React components
       ChatInterface.tsx  # Main chat UI
       ChatMessage.tsx    # Message components
       MessageInput.tsx   # Input handling
       ToolCallDisplay.tsx # Tool visualization
    lib/                   # Core libraries
       mcp-servers/       # MCP server implementations
          conscious-memory-server.ts
       chat-history.ts    # SQLite chat storage
       conscious-memory.ts # Memory service
       embeddings.ts      # Google embeddings
       llm-service.ts     # AI service
       mcp-manager.ts     # MCP orchestration
       memory-store.ts    # ChromaDB interface
       rag.ts            # RAG implementation
    types/                 # TypeScript definitions
        chat.ts           # Chat types
        memory.ts         # Memory types
        mcp.ts            # MCP types
        tool.ts           # Tool types
 config.json               # MCP server configuration
 docker-compose.yml        # ChromaDB setup
 package.json             # Dependencies
 README.md               # This file
```

---

# Neo4j Knowledge Graph Integration

The system now includes improved error handling and retry mechanisms:

## Fixed Issues
-  Retry queue for failed KG sync operations
-  Proper error handling instead of fire-and-forget
-  Automatic retry processing every minute
-  Sync metrics collection for monitoring

## Architecture
- **ChromaDB**: Primary vector storage for semantic search
- **Neo4j**: Knowledge graph for structured relationships
- **Eventual Consistency**: Asynchronous sync with retry mechanism

### Memory Architecture Inspiration

This project draws inspiration from cognitive science research on human memory:

- **Dual-Process Theory**: Automatic vs. controlled cognitive processes
- **Long-Term Memory**: Declarative vs. procedural memory systems  
- **Working Memory**: Conscious manipulation of information
- **Memory Consolidation**: Active rehearsal and organization

### Technical Innovations

#### Hybrid Search Solution
Solves the fundamental limitation of pure semantic search where subset queries (e.g., "debugging") fail to match longer stored texts containing those terms.

#### MCP Tool Architecture
Clean separation between AI capabilities and memory operations, enabling natural language memory control without prompt engineering.

#### Importance-Weighted Retrieval
Combines relevance scores with user-defined importance ratings for smarter memory prioritization.

---

##  Development & Testing

### Available Test Scripts

```bash
# RAG system test  
npm run test:rag

# Integration tests
npm run test:integration

# Neo4j tests
npm run test:neo4j
npm run test:neo4j-advanced

# Run all tests
npm run test:all

# Type checking
npm run type-check
```

### Development Scripts Reference

```bash
# Primary development workflows
npm run dev              # Next.js app + KG sync (recommended for full development)
npm run dev:debug        # Same as above with Node.js debugging on port 9229

# Individual services
npm run dev:next         # Start only Next.js application (port 3000)
npm run dev:kg           # Start only Knowledge Graph sync service

# Knowledge Graph operations
npm run kg:sync          # One-time incremental synchronization
npm run kg:sync:full     # Complete resync from scratch (slow)
npm run kg:sync:watch    # Continuous sync service (used by npm run dev)
npm run kg:sync:queue    # Process error retry queue

# Testing and validation
npm run test             # Complete test suite
npm run test:rag         # RAG system tests
npm run test:integration # API endpoint tests  
npm run test:neo4j       # Neo4j integration tests
npm run test:neo4j-advanced # Advanced Neo4j deletion tests
npm run type-check       # TypeScript compilation check

# Production builds
npm run build            # Production build
npm run start            # Start production server
npm run lint             # ESLint code analysis
```

### Service Management

```bash
# Docker services (ChromaDB + Neo4j)
docker-compose up -d                    # Start services in background
docker-compose ps                       # Check running services
docker-compose logs -f chromadb         # View ChromaDB logs
docker-compose logs -f neo4j            # View Neo4j logs
docker-compose down                     # Stop all services
docker-compose down -v                  # Stop and remove data volumes

# Service health checks
curl http://localhost:8000/api/v1/heartbeat     # ChromaDB health
curl http://localhost:7474                      # Neo4j browser
```

### Debugging and Monitoring

```bash
# Memory system status
curl "http://localhost:3000/api/conscious-memory?action=stats"

# Knowledge Graph sync status  
curl "http://localhost:3000/api/knowledge-graph?action=status"

# Chat history stats
curl "http://localhost:3000/api/chat-history/stats"

# Enable debug mode
cross-env DEBUG=* npm run dev           # Full debug logging
cross-env NODE_OPTIONS='--inspect' npm run dev:next  # Node.js debugging
```

##  Debugging & Troubleshooting

### Common Development Issues

#### Memory System
```bash
# Check ChromaDB connection
curl http://localhost:8000/api/v1/heartbeat

# Verify memory stats
curl "http://localhost:3000/api/conscious-memory?action=stats"

# Test embeddings service
npm run test:rag
```

#### Knowledge Graph Issues  
```bash
# Check Neo4j connectivity
curl http://localhost:7474

# Verify KG sync status
curl "http://localhost:3000/api/knowledge-graph?action=status"

# Process retry queue manually
npm run kg:sync:queue
```

#### Debug Mode
```bash
# Enable Node.js debugging
npm run dev:debug              # Debugger on port 9229
# Connect via Chrome DevTools at chrome://inspect

# Full debug logging
cross-env DEBUG=* npm run dev

# Component-specific debugging
cross-env DEBUG=mcp:* npm run dev        # MCP-related logs
cross-env DEBUG=kg:* npm run dev         # Knowledge Graph logs
cross-env DEBUG=rag:* npm run dev        # RAG system logs
```

### Environment Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `deepseek` | AI provider (google, anthropic, openai, deepseek, groq, mistral, ollama) |
| `LLM_MODEL` | `deepseek-chat` | Model name for chosen provider |
| `RAG_ENABLED` | `true` | Enable automatic RAG system |
| `RAG_MAX_MEMORIES` | `3` | Maximum memories retrieved per query |
| `CHROMA_URL` | `http://localhost:8000` | ChromaDB server endpoint |
| `NEO4J_URI` | `bolt://localhost:7687` | Neo4j connection string |
| `NEO4J_USER` | `neo4j` | Neo4j authentication username |
| `NEO4J_PASSWORD` | `password123` | Neo4j authentication password |

### Error Resolution

#### "Embeddings service unavailable"
- System automatically falls back to hash-based embeddings
- Check Google API key configuration
- Verify network connectivity

#### "ChromaDB connection failed"  
- Ensure Docker services are running: `docker-compose up -d`
- Check port 8000 availability
- Review ChromaDB logs: `docker-compose logs chromadb`

#### "Neo4j sync errors"
- Verify Neo4j credentials in `.env.local`
- Check Neo4j logs: `docker-compose logs neo4j`
- Process retry queue: `npm run kg:sync:queue`

#### "MCP tool registration failed"
- Verify MCP server configuration in `config.json`
- Check tool implementations in `src/lib/mcp-servers/`
- Review MCP manager logs in development console

---

##  Deployment

### Production Deployment

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Set up ChromaDB** with persistent storage:
   ```yaml
   # docker-compose.prod.yml
   version: '3.8'
   services:
     chroma:
       image: chromadb/chroma:latest
       ports:
         - "8000:8000"
       volumes:
         - ./chroma-data:/chroma/chroma
       environment:
         - CHROMA_SERVER_HOST=0.0.0.0
   ```

3. **Configure environment variables**:
   ```env
   NODE_ENV=production
   GOOGLE_AI_API_KEY=your_gosh_darn_key
   CHROMA_URL=http://localhost:8000
   ```

4. **Deploy to your platform** (Vercel, Railway, etc.)

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

---

##  Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. **Fork and clone** the repository
2. **Install dependencies**: `npm install`
3. **Start ChromaDB**: `docker-compose up -d`
4. **Run development server**: `npm run dev`
5. **Make your changes** and test thoroughly
6. **Submit a pull request**

### Contribution Guidelines

- **Code Style**: Follow the existing TypeScript/React patterns
- **Testing**: Add tests for new features
- **Documentation**: Update README and inline docs
- **Commits**: Use conventional commit messages

### Areas for Contribution

-  **Memory algorithms**: Improve search and relevance scoring
-  **UI/UX**: Enhance the memory management interface  
-  **MCP tools**: Add new memory operations and capabilities
-  **Documentation**: Improve guides and examples
-  **Testing**: Add comprehensive test coverage
-  **Performance**: Optimize memory operations and search

---

##  License

MIT License - Lok Tar Ogar!

---

##  Acknowledgments

- **ChromaDB Team** for the excellent vector database
- **Google AI** for the powerful embedding models
- **Anthropic** for the Model Context Protocol
- **Next.js Team** for the amazing React framework
- **Open Source Community** for the superb MCP servers and the Ollama library for Vercel AI SDK

---

## Contribution

- Fork then PR
- If you open issues I'll try to fix them but you know, maybe not.
