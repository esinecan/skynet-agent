# Skynet Agent Overview

Skynet Agent is an autonomous AI assistant written in Node.js/TypeScript, designed for efficient, single-agent operation (no multi-agent orchestration). It integrates with Google Gemini and supports **intrinsic motivation**, **self-reflection**, **semantic memory**, and external tool execution. In practice, the agent maintains conversational continuity by storing memories (using real embeddings and a vector database) and can proactively initiate tasks after idle periods. Its core goals are robustness and explainability: instead of brute-forcing with massive models, Skynet Agent uses structured code and memories to achieve smart behavior with relatively small LLMs. Key features include:

* **Multi-step reasoning & self-reflection:** The agent can evaluate and refine its answers through multi-hop reasoning loops (see `selfReflection.ts`).
* **Intrinsic motivation:** A background monitor (`intrinsicMotivation.ts`) triggers user-defined tasks when the agent is idle for a configured time.
* **Memory management:** Long-term memories are stored semantically (using Gemini’s `embedding-001`) in Milvus or in-memory as a fallback. A scheduled “consolidation” task periodically summarizes old memories to keep storage manageable.
* **Tool execution (MCP):** The agent uses the [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol/typescript-sdk) to call external tools (e.g. a browser via Playwright, filesystem ops, or custom services). MCP clients are configured via `.env` or a `config.json`, letting the agent invoke tools like a human would.
* **API & GUI:** An Express server exposes REST/streaming chat endpoints (`/api/query`, `/api/stream`, session management, file upload, etc.) and serves a React/Tailwind GUI.

In effect, Skynet Agent is a sophisticated state machine under the hood: prompts and actions flow through a directed **state graph** that manages tasks, tools, and memory, ensuring the agent proceeds step-by-step in its control flow while remaining transparent to the developer.

## Architecture

Skynet Agent’s architecture is modular and extensible. Its main components include:

* **LLM Client:** Wraps Google Gemini API calls (`llmClient.ts`) and feeds the agent’s planning, reflection, and summarization modules.
* **Workflow Engine:** Defines the control flow (a LangGraph workflow) that orchestrates perception, decision, action, and reflection loops. The workflow integrates self-reflection and error-recovery strategies.
* **Intrinsic Motivation:** A background monitor (`intrinsicMotivation.ts`) tracks user inactivity. After a set idle threshold (configurable in `.env`), the agent autonomously asks Gemini for new tasks or ideas.
* **Memory Layers:** The agent uses a **hybrid memory** system. Short-term context (current session history) is maintained in memory structures, while **long-term memory** is stored in Milvus (via `memoryManager.storeMemory` and `retrieveMemories`) using real embeddings. A cron-driven consolidation module (`consolidation.ts`) periodically abstracts and summarizes older memories to save space.
* **Tool/MCP Integration:** The `mcp/client.ts` module manages connections to MCP servers. Developers can configure MCP servers (Playwright, filesystem, CLI, etc.) in `.env` or `config.json`. At runtime, the agent treats each tool as a callable service: it can dynamically decide *when* to fetch data or perform an action with a tool, integrating the results back into its reasoning loop.
* **Session & API Layer:** An Express app (`src/server/api.ts`) handles HTTP/streaming chat. Endpoints include `POST /api/query` for sending user prompts, `GET /api/stream/:sessionId` for live streaming replies, session CRUD (`/api/sessions`), and file upload. A modern React GUI (served at `/`) provides user-friendly conversation management with session history, streaming responses, and markdown formatting.

This design achieves an “LLM prosthetic” model: instead of adding more LLMs, Skynet Agent surrounds a single LLM with rich state and tools, following intelligent behavior patterns. All core logic (question answering, planning, action) happens through structured code calls and controlled prompts, making the system both powerful and debuggable.

## Setup & Configuration

To run Skynet Agent, you need:

* **Node.js 18+** and npm.
* A **Gemini API key** (set `GOOGLE_API_KEY` in your `.env`).
* (Optional) **Milvus** vector database for persistent memory (otherwise it falls back to in-memory vectors).
* (Optional) Tools you want to use via MCP (e.g. Playwright installed, filesystem server, etc.).

**1. Clone and install:**

```bash
git clone https://github.com/esinecan/skynet-agent.git
cd skynet-agent
npm install
cd client && npm install && cd ..
```

**2. Configure environment:** Copy `.env.example` to `.env` and set your values, e.g.:

```dotenv
GOOGLE_API_KEY=<your-gemini-key>
PORT=3000
# MCP Server config (JSON string or use config.json)
# Example to use Playwright MCP:
SKYNET_MCP_SERVERS_JSON='{"playwright":{"command":"npx","args":["@playwright/mcp@latest"]}}'
# Milvus (if used):
MILVUS_ADDRESS=localhost:19530
MILVUS_COLLECTION=skynet_memories
# Memory consolidation schedule (cron format):
MEMORY_CONSOLIDATION_SCHEDULE="0 2 * * *"
# Idle time (minutes) before agent auto-triggers tasks:
IDLE_THRESHOLD_MINUTES=10
```

Environment variables like `SKYNET_MCP_SERVERS_JSON` or a `config.json` let you specify which MCP servers to run (e.g. browser automation, file server, CLI). See the README [52](#) for full `.env` docs.

**3. Milvus (optional):** For production memory, run Milvus (e.g. via Docker Compose). Configure the host/port in `.env` as above. If Milvus isn’t available, Skynet Agent will use an in-memory fallback store.

**4. Run the agent:**

* **Development mode (with GUI):**

  ```bash
  npm run dev:gui
  ```

  This starts backend and frontend with hot-reload and opens the browser at [http://localhost:3000\:contentReference\[oaicite:24\]{index=24}\:contentReference\[oaicite:25\]{index=25}](http://localhost:3000:contentReference[oaicite:24]{index=24}:contentReference[oaicite:25]{index=25}).

* **Production build:**

  ```bash
  npm run build
  npm run gui    # or just `npm start` for backend only
  ```

  This compiles both server and React app, then serves the UI at port 3000.

After starting, the GUI is available in any browser (Chrome/Firefox/Edge/Safari) and provides real-time chat, file uploads, and session management.

## Retrieval-Augmented Memory

Skynet Agent’s memory system is **retrieval-augmented**. All stored memories are embedded via Gemini’s `embedding-001` model and indexed in Milvus for semantic search. When the agent needs context, it queries relevant memories by similarity. For example, after storing a note ("Alice's favorite color is blue"), a later retrieval for “favorite color” would return that memory with a high score. Developers use the `MemoryManager` interface to interact with memory:

```ts
import { MemoryManager } from './src/memory';
const memoryMgr = new MemoryManager();
await memoryMgr.initialize();

// Store a memory snippet
await memoryMgr.storeMemory("Alice's favorite color is blue", {author: "user"});

// Retrieve relevant memories
const found = await memoryMgr.retrieveMemories("favorite color");
console.log(found);  // e.g. [{ id: "...", text: "Alice's favorite color is blue", score: 0.97, metadata: {...} }]
```

This hybrid design blends a **short-term working memory** (current session history, easily held in variables or chat logs) with a **long-term semantic store** (Milvus). A nightly cron job summarizes or prunes old memories (`consolidation.ts`), keeping the knowledge base concise. Because vectors capture semantic meaning, the agent can recall facts even if phrased differently. All of this occurs behind a clean API: the agent simply asks the memory manager for the “top N” related memories for its current query, and integrates the results into its next reasoning step.

## Agentic-RAG vs. Self-RAG/Corrective-RAG

Skynet Agent’s memory system is conceptually an **“Agentic RAG”** approach. Traditional *Self-RAG* and *Corrective-RAG* use iterative self-evaluation to improve retrieval accuracy, but they require multiple LLM calls per query. For example, Corrective RAG adds a feedback step to re-check retrieved documents, and Self-RAG trains with a “reflection” token to iteratively refine retrievals. These methods boost accuracy but incur *call explosion* — far more computation and latency from extra LLM queries. The ThoughtWorks analysis notes that Corrective RAG **“inevitably impacts latency”** and adds pipeline complexity.

In contrast, Agentic RAG treats the retriever as a dynamic tool the agent calls on demand. The LLM keeps track of what it has already fetched in short-term and long-term memory, avoiding redundant searches. This way, it achieves most of the benefit (around 80% of improved accuracy) with far fewer model calls. The agent proactively decides *when* to search and *what* to search, chaining sub-queries or deferring retrievals as needed, instead of blindly iterating. In effect, Agentic RAG’s memory acts like an ongoing knowledge graph: it stores evidence of past findings and user context, letting the agent recall or re-evaluate facts without repeatedly querying the LLM. This keeps the system fast enough for real-time use while still mitigating hallucinations.

## Usage Examples

Below are illustrative examples of how Skynet Agent exhibits memory continuity, intrinsic motivation, and self-reflection:

* **Memory Continuity:** Suppose a user tells the agent “My favorite movie is *Inception*.” The agent stores this fact. Later in the conversation, the user asks, “What’s my favorite movie?” The agent retrieves the stored memory (“favorite movie: Inception”) and answers accordingly. Over multiple sessions, this persistence ensures continuity of context.
* **Intrinsic Motivation:** If the user is idle for more than the configured threshold (e.g. 10 minutes), the agent might say **“Since you seem free, perhaps I could plan our next steps?”** or suggest a relevant task. For instance, it could propose researching upcoming events or summarizing something it noticed in past sessions — all triggered autonomously via `intrinsicMotivation.ts`.
* **Self-Reflection:** After generating an answer, the agent runs a *self-reflection* step. For example, it may review its own response for completeness. If the initial answer was short, the agent might say, “On second thought, I should add more details,” and regenerate with more information. This is implemented in `selfReflection.ts`, which can call Gemini again to refine the response.

These behaviors are encapsulated in high-level functions, but can also be driven via the HTTP API. For instance, to chat programmatically:

```bash
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Hello, tell me a fun fact", "sessionId": "my-session"}'
```

The response streams back as the agent works, integrating memory and reflection. In code, you could simulate an idle trigger by waiting and observing the agent’s **/api/stream** output, which may include an autonomous query like “What should we do next?” when it decides to self-motivate.

## Extending the Agent

Developers can customize Skynet Agent extensively:

* **Add memory operations:** You can call `memoryManager.storeMemory()` yourself to record events or definitions, and use `retrieveMemories()` in your own logic. Because the memory interface is modular, you could even implement other store (e.g. Qdrant) by swapping `src/memory/index.ts`.
* **Customize the state graph:** The control flow is defined in `src/agent/workflow.ts`. You can modify or replace this LangGraph workflow to change how the agent reasons (e.g. insert new reflection or tool-invocation steps). The Zod schemas (`appStateSchema.ts`) ensure any custom state changes remain valid.
* **Integrate new tools:** To add a tool, write an MCP-compatible server. For example, you could create a new CLI tool or web scraper. Then add its config to `config.json` (or `.env`) under `"mcp.servers"`. The agent will automatically list the new tool and allow the language model to call it when needed.
* **Memory layering:** If you want multi-tier memory (e.g. separate short-term vs long-term APIs), you could extend `memoryManager` to first check an “episodic” store (just this session) before Milvus, or to push certain memories to a fast cache.
* **GUI and API:** The front-end (in `client/`) can be modified to add features or customize the UI. All API endpoints are under `/api/*` (listed in the README), and you can add new routes in `src/server/api.ts` as needed. The session-based backend (in `src/db/sessions.ts`) uses a simple file DB, so you could replace that with Redis or another store if needed.

The project is MIT-licensed and designed to be developer-friendly. All core modules are documented in the code and the README. For detailed guidance, refer to the repository’s [README](https://github.com/esinecan/skynet-agent/blob/master/README.md) and developer notes (e.g. comments in `src/agent/*` and `src/memory/*`), which explain each component’s role.

## GUI & API Endpoints

Skynet Agent includes a built-in chat interface. By running in “GUI” mode, a React-based UI is served at `http://localhost:3000`, featuring:

* **Live chat streaming:** Messages from the agent appear in real-time.
* **Session management:** You can create, switch, and delete conversation sessions via the sidebar.
* **File upload:** Drag-and-drop a file to let the agent ingest documents into memory.
* **Rich rendering:** Markdown formatting with code syntax highlighting.
* **Automatic persistence:** Conversations are saved between restarts (session data in `./data/sessions/` by default).

Under the hood, the following HTTP endpoints (authenticated on localhost by default) are provided:

* `POST /api/query` – send a user message (with optional `sessionId`) and get the agent’s response.
* `GET /api/stream/:sessionId?query=...` – real-time streaming version of `/query`.
* `GET/POST/DELETE /api/sessions` – manage conversation sessions (list, create, delete).
* `POST /api/upload` – upload a file (PDF, text, etc.) for the agent to process and store.
* `GET /api/health` – basic health check.

These APIs allow integration into other systems. For example, a script could poll `/api/stream` to chat programmatically, or even use the agent as a backend service.