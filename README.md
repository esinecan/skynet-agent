#  Skynet-Agent: One LLM Client to Rule Them All (Feat RAG + MCP) (In Development But Usable)

> *"What if AI could not only access memories, but consciously choose what to remember? With MCP tool access fully supported?"*

![New Project](https://github.com/user-attachments/assets/453e192b-805c-4275-a3fe-358f37c50470)


[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-FF6B6B?style=for-the-badge&logo=database&logoColor=white)](https://www.trychroma.com/)
[![MCP](https://img.shields.io/badge/MCP-4A90E2?style=for-the-badge&logo=protocol&logoColor=white)](https://modelcontextprotocol.io/)

**Skynet-Agent Client** is a revolutionary AI conversation platform that implements a **dual-layer memory architecture** inspired by human cognition. It combines automatic background memory (like human non-volitional memory) with conscious, deliberate memory operations that AI can control. It also has the tool access powers similar to those of Claude Desktop. [With Long Task Automation Coming Soon](motive-force.md)

##  Minimal But Powerful

###  Dual-Layer Memory Architecture
- **Automatic Layer (RAG)**: Background conversation storage and retrieval
- **Conscious Layer**: Explicit, volitional memory operations controlled by AI
- **Hybrid Search**: Solves embedding similarity limitations with semantic + keyword search

###  MCP Tool Integration
- Exposes conscious memory as **Model Context Protocol tools**
- AI naturally saves and recalls memories during conversation
- Clean separation between UI, memory, and AI operations

###  Advanced Search Capabilities
- **Semantic Search**: Vector embeddings for conceptual similarity
- **Keyword Fallback**: Exact text matching when embeddings fail
- **Smart Merging**: Combines results with intelligent ranking

---

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

**Skynet-Agent** supports **7 different LLM providers**, giving you unmatched flexibility to choose the perfect model for any task:

| Provider                  | Type              | Best For                              | Models Available                                      |
|---------------------------|-------------------|---------------------------------------|-------------------------------------------------------|
| ** Anthropic**          | Cloud             | Advanced reasoning, analysis & safety | `claude-4-sonnet`, `claude-4-opus`                     |
| ** Groq**              | Cloud             | Ultra‑fast inference                  | `grok-3-mini`, `grok-3-beta`                           |
| ** Mistral**            | Cloud             | Natural language & code generation    | `mistral-7b-instruct`, `mistral-coder-7b`               |
| ** OpenAI-Compatible**  | Cloud / Self‑Hosted | Broad ecosystem integration           | `gpt-4o-chat`, `gpt-4o-code`, and more                  |
| ** Ollama**             | Local             | Privacy-focused, truly free           | Any local model (Llama 3, Qwen3, etc.)                  |
| ** Google Gemini**      | Cloud             | Multimodal integration & high speed   | `gemini-2.5-flash`, `gemini-2.5-pro`                    |
| ** DeepSeek**           | Cloud             | Cost‑effective, robust performance    | `deepseek-chat-r1`, `deepseek-coder-r1`                 |



###  Quick Provider Setup
```env
# Choose your provider
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022

# Add your API key
ANTHROPIC_API_KEY=sk-ant-your-key
```

** [Complete Provider Setup Guide](PROVIDERS.md)** - Installation, configuration, and usage examples for all providers.

---

##  Quick Start

### Prerequisites

- **Node.js** 18+ 
- **Docker** (for ChromaDB)
- **Google AI API Key** (for embeddings)

### Installation

```bash
# Clone the repository
git clone https://github.com/esinecan/skynet-agent.git
cd skynet-agent

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys

# Start ChromaDB
docker-compose up -d

# Start the development server
npm run dev
```

### Environment Configuration

```env
# .env.local
GOOGLE_AI_API_KEY=your_google_ai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
CHROMA_URL=http://localhost:8000
```

### First Run

1. **Visit** `http://localhost:3000`
2. **Start chatting** - memories are automatically saved
3. **Try conscious memory**: "Remember that I prefer TypeScript for large projects"
4. **Test recall**: "What did I tell you about my preferences?"
5. **Explore memory UI**: Visit `/conscious-memory` for the memory dashboard

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

### Memory Architecture

#### Automatic Memory (RAG)
```typescript
interface AutomaticMemory {
  id: string;
  text: string;
  embedding: number[];
  sessionId: string;
  timestamp: string;
  messageType: 'user' | 'assistant';
}
```

#### Conscious Memory
```typescript
interface ConsciousMemory {
  id: string;
  text: string;
  embedding: number[];
  tags: string[];
  importance: number; // 1-10 scale
  source: 'explicit' | 'suggested' | 'auto';
  context?: string;
  relatedMemoryIds: string[];
  metadata: {
    sessionId: string;
    timestamp: string;
    memoryType: 'conscious';
  };
}
```

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
  'list_memory_tags'
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

##  Research & Innovation

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

### Running Tests

```bash
# Unit tests
npm test

# Memory system integration test
npm run test:memory

# RAG system test  
npm run test:rag

# End-to-end tests
npm run test:e2e
```

### Development Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Start ChromaDB
npm run chroma:start

# Stop ChromaDB
npm run chroma:stop

# Reset memory databases
npm run memory:reset
```

### Debugging

Enable debug logging:
```bash
DEBUG=mcp:*,memory:*,rag:* npm run dev
```

View memory store status:
```bash
curl http://localhost:3000/api/conscious-memory?action=stats
```

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
