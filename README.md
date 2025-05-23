# Skynet Agent (Warning: implementation not finished yet)

Skynet Agent is an autonomous AI assistant built with Node.js and TypeScript. It integrates with Google Gemini, supports intrinsic motivation, self-reflection, memory management, and external tool execution via the Model Context Protocol (MCP). It exposes an HTTP API for interaction.

## Features

* Google Gemini integration for natural-language understanding and generation
* Multi-step reasoning and self-reflection for response improvement
* Intrinsic motivation: triggers autonomous tasks after idle periods
* Memory management: stores and retrieves conversation context
* Memory consolidation: scheduled summarization of stored memories
* External tool execution via MCP client manager
* Express-based API server with health endpoints and global error handling
* Structured logging and health monitoring utilities

## Prerequisites

* Node.js >= 18.x
* npm >= 8.x
* A valid Gemini API key (`GEMINI_API_KEY`)

## Installation

```bash
git clone <repository-url>
cd <repository-directory>
npm install
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and set the following variables:

```env
GEMINI_API_KEY=your_gemini_api_key
PORT=9000
IDLE_THRESHOLD_MINUTES=10
MEMORY_CONSOLIDATION_SCHEDULE="0 2 * * *"
INTRINSIC_TASK_DIR="./data/tasks"
REFLECTION_DIR="./data/reflections"
CONSOLIDATION_DIR="./data/consolidation"
MEMORY_DIR="./data/memory"
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
curl -X POST http://localhost:8080/mcp/reload
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

Start the agent:

```bash
npm run start
```

Or run the setup script and server:

```bash
npm run run
```

The API server listens on the configured port. Send POST requests to `/query`:

```http
POST /query HTTP/1.1
Content-Type: application/json

{
  "query": "Hello, agent!"
}
```

## Architecture

* **src/index.ts**: Main entry point; loads environment, initializes logger, error handlers, agent, and API server.
* **src/run.ts**: Ensures `.env` exists, loads variables, initializes agent and server.
* **src/agent/**: Core agent logic

  * `index.ts`: Sets up agent workflow and optional MCP clients.
  * `intrinsicMotivation.ts`: Monitors idle time and triggers autonomous tasks.
  * `selfReflection.ts`: Evaluates and optionally improves AI responses.
  * `llmClient.ts`: Wraps Google Gemini API calls and manages the model instance.
  * `workflow.ts`: Defines the LangGraph workflow nodes for query processing, tool execution, self-reflection, and memory storage.
  * `schemas/appStateSchema.ts`: Zod schemas for the agent’s state, messages, tool calls, and reflection results.
* **src/memory/**: Long-term memory and consolidation

  * `index.ts`: In-memory vector store mock, memory manager singleton for storing and retrieving memories.
  * `consolidation.ts`: Cron-scheduled task to summarize recent memories.
* **src/mcp/client.ts**: MCP client manager for connecting to external tool servers, listing tools, and executing tool calls.
* **src/server/api.ts**: Express server with `/query` endpoint, health routes, CORS, and request logging.
* **src/utils/**: Utility modules

  * `logger.ts`: Creates a namespaced logger (Winston-based).
  * `errorHandler.ts`: Global error handlers for uncaught exceptions and promise rejections.
  * `health.ts`: Health-status tracking, metrics, and health-report endpoints.

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
└── utils/
    ├── logger.ts
    ├── errorHandler.ts
    └── health.ts
```
Along with the mocked embeddings (which use a simple random vector for both storage and retrieval queries), several other parts of the Skynet Agent system are either mocked, simplified, or currently missing/unimplemented:

### Mocked/Simplified Components:

1.  **Vector Store (`src/memory/index.ts`)**: The `SimpleVectorStore` is explicitly stated as an "in-memory vector store for MVP" that "would be replaced with a proper vector database in a production system."
2.  **Conversation Store (`src/agent/index.ts`)**: The `conversationStore` is a "Simple in-memory conversation store," meaning conversation history is not persistent across application restarts.

### Missing/Unimplemented/Limited Functionality:

1.  **Real MCP (Model Context Protocol) Server Integrations (`src/agent/index.ts` and `src/mcp/client.ts`)**: The `mcpServers` array in `initializeAgent` is commented out, indicating that actual tool integrations like `desktopCommander` or `playwright` are not configured by default. This leads to the agent primarily running in "standalone mode" without external tools.
2.  **Adaptive Response Generation from Self-Reflection (`src/agent/workflow.ts` and `src/agent/selfReflection.ts`)**: The `performSelfReflection` function has the capability to generate an `improvedResponse`, but in `workflow.ts`, it's explicitly called with `false` for `generateImprovement`. This means the system performs self-reflection and critiques its own response but does not currently use the generated improved version to modify its output.
3.  **Multi-Step Reasoning Integration (`src/agent/selfReflection.ts`)**: The `performMultiStepReasoning` function is defined to break down complex problems and generate step-by-step reasoning and a final answer, but it is not integrated into the main `createAgentWorkflow` and thus not currently used by the agent.
4.  **Workflow Checkpointing/Persistence (`src/agent/workflow.ts`)**: The `StateGraph` is explicitly compiled "without a checkpointer for now." This means the state of long-running workflows is not persisted, and interruptions would cause loss of progress. The `processQuery` also includes specific error handling for `checkpointer.get` issues, further highlighting this limitation.
5.  **Memory Pruning/Lifecycle Management (`src/memory/index.ts`)**: While memories are stored, there's no explicit mechanism or strategy (e.g., based on relevance, age, or capacity) for removing or consolidating older, less relevant memories within the `SimpleVectorStore`. This could lead to unbounded growth of the in-memory store.