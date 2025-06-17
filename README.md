# Skynet Agent

> *What if AI could not only access memories, but consciously choose what to remember? With MCP tool access fully supported?*
![image](https://github.com/user-attachments/assets/0e8d3705-066b-432e-80ae-836e5b75c8ca)

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-FF6B6B?style=for-the-badge&logo=database&logoColor=white)](https://www.trychroma.com/)
[![MCP](https://img.shields.io/badge/MCP-4A90E2?style=for-the-badge&logo=protocol&logoColor=white)](https://modelcontextprotocol.io/)

AI conversation platform implementing dual-layer memory architecture inspired by human cognition. Combines automatic background memory with conscious, deliberate memory operations that AI controls. Tool access powers similar to Claude Desktop.

## Core Features

### LangGraph-Powered Autopilot
**Purpose-driven autonomous execution** replacing simple query generation with sophisticated multi-step workflows:
- Purpose analysis and strategic planning
- Context gathering from all memory systems  
- Smart tool orchestration with error recovery
- Progress monitoring with adaptive replanning
- Reflection engine for continuous learning
- Configurable aggressiveness and safety controls

### Dual-Layer Memory
**Automatic Memory (RAG)**: Non-volitional background memory using ChromaDB vectors and Google text-embedding-004  
**Conscious Memory**: Volitional operations via MCP tools - save, search, update, delete with tags and importance scoring  
**Knowledge Graph**: Neo4j-powered relationship mapping with automatic synchronization and retry mechanisms

### MCP Tool Ecosystem
Exposes memory operations as Model Context Protocol tools for natural conversation flow. Clean separation between UI, memory, and AI operations.

## Quick Setup

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- LLM API key (free Google AI Studio recommended)

### Installation

```bash
git clone https://github.com/esinecan/skynet-agent.git
cd skynet-agent
npm install

cp .env.example .env.local
# Edit .env.local with your API keys

docker-compose up -d    # ChromaDB (8000) + Neo4j (7474, 7687)
npm run dev             # Or npm run dev:next if Neo4j issues
```

**Access:**
- Application: `http://localhost:3000`
- Conscious Memory: `http://localhost:3000/conscious-memory`
- Neo4j Browser: `http://localhost:7474` (neo4j/password123)

## Supported LLMs

| Provider | Best For | Model |
|----------|----------|-------|
| Google | Multimodal & speed | `gemini-2.5-flash-preview-05-20` |
| DeepSeek | Cost-effective | `deepseek-chat` |
| OpenAI | Ecosystem | `gpt-4o-mini` |
| Anthropic | Reasoning | `claude-3-5-haiku-20241022` |
| Groq | Ultra-fast | `llama-3.3-70b-versatile` |
| Mistral | Natural language | `mistral-large-latest` |
| Ollama | Privacy | `llama3.2:latest` |

## Configuration

### Essential Environment Variables

```env
# LLM (pick one)
GOOGLE_API_KEY=your_key
DEEPSEEK_API_KEY=your_key

# Services
CHROMA_URL=http://localhost:8000
NEO4J_URI=bolt://localhost:7687
NEO4J_PASSWORD=password123

# Autopilot
MOTIVE_FORCE_ENABLED=false
MOTIVE_FORCE_MAX_CONSECUTIVE_TURNS=10
MOTIVE_FORCE_TEMPERATURE=0.8
```

### Autopilot Usage

Enable via UI toggle. Your next message becomes the objective:

```
Using timestamps and normal querying, organize today's memories into 5-10 groups. 
Delete redundant items, consolidate similar ones, add insights. Check with autopilot 
periodically. Daily maintenance cultivates curated memory over time.
```

Configure via gear icon: turn delays, limits, memory integration, aggressiveness modes.

## Development

### Scripts

```bash
# Development
npm run dev              # Full stack + KG sync
npm run dev:debug        # With Node debugging
npm run dev:next         # Frontend only
npm run dev:kg           # KG sync only

# Knowledge Graph
npm run kg:sync          # One-time sync
npm run kg:sync:full     # Complete resync
npm run kg:sync:queue    # Process retry queue

# Testing
npm run test             # All tests
npm run test:rag         # RAG system
npm run test:neo4j       # Neo4j integration
```

### Project Structure

```
skynet-agent/
├── src/
│   ├── app/                    # Next.js routes
│   ├── components/             # React components
│   ├── lib/                    # Core libraries
│   │   ├── motive-force-graph.ts    # LangGraph workflow
│   │   ├── conscious-memory.ts      # Volitional memory
│   │   ├── rag.ts                   # Automatic memory
│   │   └── knowledge-graph-*.ts     # Neo4j integration
│   └── types/                  # TypeScript definitions
├── docker-compose.yml          # Services setup
└── motive-force-prompt.md      # Autopilot personality
```

## Memory Architecture

### Automatic Memory (RAG)
```typescript
interface Memory {
  id: string;
  text: string;
  embedding: number[];  // Google text-embedding-004
  metadata: {
    sender: 'user' | 'assistant';
    timestamp: string;
    summary?: string;  // Auto-summarized if over limit
  };
}
```

### Conscious Memory
```typescript
interface ConsciousMemory {
  id: string;
  content: string;
  tags: string[];
  importance: number;  // 1-10
  source: 'explicit' | 'suggested' | 'derived';
  metadata: {
    accessCount: number;
    lastAccessed: string;
  };
}
```

### LangGraph State
```typescript
interface MotiveForceGraphState {
  messages: BaseMessage[];
  currentPurpose: string;
  subgoals: SubGoal[];
  executionPlan: ExecutionStep[];
  toolResults: ToolResult[];
  reflections: Reflection[];
  overallProgress: number;
  blockers: string[];
  needsUserInput: boolean;
}
```

## API Reference

### Conscious Memory
```http
POST /api/conscious-memory
{
  "action": "save|search|update|delete|stats|tags",
  "content": "string",
  "tags": ["array"],
  "importance": 7
}
```

### Autopilot
```http
POST /api/motive-force
{
  "action": "generate|generateStreaming|saveConfig|getState",
  "sessionId": "string",
  "data": {}
}
```

## Advanced Features

### Hybrid Search
1. **Semantic**: Vector similarity via embeddings
2. **Keyword**: Exact match fallback
3. **Smart Merge**: Intelligent ranking with deduplication

### Knowledge Graph Sync
- Automatic extraction from chat history
- Background service with retry queue
- Metrics collection and error handling
- Eventually consistent with ChromaDB

### Safety Mechanisms
- Turn limits and error counting
- Manual override capabilities  
- Resource usage monitoring
- Emergency stop functionality

## Troubleshooting

**"Embeddings service unavailable"**: Falls back to hash-based embeddings. Check Google API key.

**"ChromaDB connection failed"**: Ensure `docker-compose up -d` and port 8000 available.

**"Neo4j sync errors"**: Check credentials, run `npm run kg:sync:queue` for retries.

**"Actually Looks Very Ugly"**: I suck at UI design.

## Development Philosophy

Inspired by cognitive science:
- **Dual-Process Theory**: Automatic vs controlled processes
- **Memory Consolidation**: Active organization
- **Working Memory**: Conscious manipulation

Technical innovations:
- **Hybrid Search**: Solves subset query limitations
- **MCP Architecture**: Natural language memory control
- **Importance Weighting**: Smart prioritization
- **LangGraph Integration**: Complex autonomous workflows

## Contributing

Fork, improve, PR. Areas: memory algorithms, UI/UX, MCP tools, autopilot intelligence, testing, performance.

## License

MIT - Lok Tar Ogar!

## Acknowledgments

ChromaDB, Google AI, Anthropic MCP, Next.js, Neo4j teams. Open source MCP servers and Ollama Vercel AI SDK library.