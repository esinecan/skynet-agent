Understood. I’ll prepare a step-by-step implementation guide for an MVP version of your Onion Individual Design, focusing on autonomy in the absence of user interaction.

The guide will cover:

* A LangGraph-based agent with short-term and long-term memory layers
* Recency-biased memory consolidation during a 'sleep' phase
* A tool-calling system using the provided MCP configuration
* Integration (or simplification) of your existing UI from the GitHub repo
* An intrinsic motivator mechanism to drive autonomous behavior when idle

I'll ensure the scope remains manageable for a solo MVP build in \~1.5 weeks. I'll get started and follow up with the full guide shortly.


# Building the Onion Individual MVP: Step-by-Step Implementation Guide

## Overview and Goals of the MVP

The **Onion Individual** design is a multi-layered cognitive agent architecture that integrates short-term and long-term memory, tool use, and autonomous behaviors. Our MVP will implement the core of this design using **LangGraph.js** (a TypeScript framework for LLM-based agents) and the **Model Context Protocol (MCP)** for tool and UI integration. The focus is on achieving **autonomous operation** – the agent should continue to act even without user prompts. Key goals include:

* **Short-Term Memory:** Maintain recent conversational context (up to \~1 day) for continuity in dialogue.
* **Long-Term Memory:** Store and retrieve important information from past interactions in a **recency-biased** manner, curated via a daily "sleep cycle" process.
* **Tool Use via MCP:** Route external tool calls (e.g. web search, calculators) through an MCP server, using a standardized interface to communicate with the agent.
* **Basic User Interface:** Provide a simple chat UI (leveraging the existing Next.js MCP client or a simplified version) for monitoring and optional user interaction.
* **Intrinsic Motivation (Autonomy):** Implement a mechanism that prompts the agent to perform tasks when idle, effectively **replacing the Human Interaction Simulation Agent (HISA)** with an internal loop. This ensures the agent doesn’t stall in the absence of user input.
* **Feasibility:** Keep the design and implementation simple enough to be built by one person in \~1.5 weeks, using off-the-shelf components and minimal custom code.

Below is a step-by-step guide covering project setup, core agent logic, memory systems, MCP integration, UI, and autonomous behavior. Each step includes recommendations on **architecture, state management, memory handling, and scheduling** to meet the above goals.

## Step 1: Project Setup and Tech Stack

**Tech Choices:** We will use **Node.js + TypeScript** for the backend agent and server, and **LangGraph.js** (from the LangChain ecosystem) for building the agent’s behavior graph. On the front-end, we’ll adapt the user’s existing Next.js chat UI (from `esinecan/LLM-chat-client-with-MCP`) or create a minimal web interface following the same MCP client principles. This gives us a real-time chat view into the agent’s activities. Key dependencies and setup tasks:

* **LangGraph.js & LangChain:** Install via npm: `@langchain/langgraph` (and `@langchain/core`). LangGraph provides low-level control to define custom agent flows and incorporate memory and tools.
* **MCP Server SDK:** Install `@modelcontextprotocol/sdk` to create an MCP-compatible server. This will expose our agent as an MCP tool endpoint so the UI (MCP client) can communicate with it.
* **LLM Provider:** Decide on an LLM API (OpenAI, Anthropic, etc.) and install the corresponding client (e.g., `openai` or `@langchain/anthropic`). Ensure API keys are available in environment variables (e.g. `OPENAI_API_KEY`).
* **Data Stores:** For MVP simplicity, use in-memory or lightweight databases:

  * Use **LangGraph’s MemorySaver** for short-term memory persistence during development (stores state in-memory). For a more persistent solution (optional in MVP), configure a small PostgreSQL or SQLite database for the session checkpointer.
  * Use a simple **vector store** for long-term memory. For example, set up a local vector DB or an embedding+search library. In a quick implementation, this could be an in-memory list of embeddings or a Pinecone index (if API available). The goal is to support similarity search with recency tagging.
* **Project Structure:** Organize the code with clear separation of concerns:

  * `src/agent/` – core agent logic (graph definition, nodes, state schema).
  * `src/memory/` – memory handlers (short-term state persistence, long-term memory store, consolidation routines).
  * `src/tools/` – tool definitions (MCP tool wrappers or LangChain tools for external actions).
  * `src/server/` – MCP server setup and routes.
  * `src/ui/` – (if embedding UI code here) or in the separate Next.js app.
* **Environment Config:** Use a `.env` file for API keys and config. For example, define `OPENAI_API_KEY`, database URLs, and MCP server port. The provided architecture suggests using `dotenv` to load these variables and includes keys for Pinecone (vector DB) and Postgres (if used). For MVP, you might only need the essentials like API keys and `MCP_SERVER_PORT`.

Set up a basic Node project structure with these directories and install dependencies. This foundation allows us to incrementally add the agent’s capabilities.

## Step 2: Define the Agent State Schema (Short-Term Memory Structure)

Define a **state schema** for the Unified Cognitive Agent using **Zod**, which provides a typesafe contract for what data the agent holds at each step. This schema represents the agent’s **short-term memory and working state**. According to the architecture, the state needs to track at least: the latest **user input**, the **conversation history**, any **retrieved long-term memories**, and perhaps placeholders for tool outputs or intermediate summaries.

Create a file `src/agent/schemas/appStateSchema.ts` and define an `AppStateSchema` with Zod, for example:

```ts
import { z } from "zod";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

const MessageSchema = z.object({
  role: z.enum(["human", "ai", "system", "tool"]),
  content: z.string()
});

// Define the agent's state structure
export const AppStateSchema = z.object({
  input: z.string().describe("Current user query or system-triggered query"),
  messages: z.array(MessageSchema).default([])
            .describe("Dialogue history as an array of messages"),
  retrievedMemories: z.array(z.string()).default([])
            .describe("Long-term memory snippets retrieved for this query"),
  // ... add more fields as needed, e.g. for tool results or flags.
  // e.g. currentInteractionSummary: z.string().optional()
});

export type AppState = z.infer<typeof AppStateSchema>;
```

In this schema:

* **`input`** holds the latest user query (or an internally generated query when the agent acts autonomously).
* **`messages`** holds the conversation context (history of Human/AI messages). This is the short-term memory that lasts during a session (e.g., one day or until reset).
* **`retrievedMemories`** will store any long-term memory entries fetched from the LTM store that are relevant to the current interaction.
* You can extend this with other fields if needed. For example, you might include a field for a pending **review flag** or **tool invocation data** if the agent uses those internally.

Using Zod ensures type safety. It also allows us to provide default values (empty arrays for messages and memories) so a fresh session starts with an empty context. The **Onion architecture** approach treats these schema fields as distinct “channels” in LangGraph’s state graph, meaning each field can be updated by different nodes in the workflow.

## Step 3: Build the Unified Cognitive Agent with LangGraph

With the state defined, we construct the **LangGraph state machine** that represents the agent’s cognitive workflow. This involves creating a `StateGraph<AppState>` and defining a series of **nodes** (async functions) that manipulate the state, along with transitions (edges) between them. The aim is to have a controllable sequence: ingest input → retrieve memories → call LLM → handle tools/interrupts → produce output.

**3.1 Initialize the StateGraph:** In `src/agent/agentWorkflow.ts`, create and configure the graph:

```ts
import { StateGraph } from "@langchain/langgraph";
import { AppState, AppStateSchema } from "./schemas/appStateSchema";

const workflow = new StateGraph<AppState>({
  channels: AppStateSchema.shape  // define state channels from Zod schema
});

// (We'll add nodes and edges next)
```

Here we pass the Zod schema’s shape to LangGraph so it knows the state structure. Each node will receive the current `AppState` and return a partial update to it.

**3.2 Define Graph Nodes (Agent Logic):** Next, add nodes to the graph. Each node is an async function with signature `async function nodeName(state: AppState): Promise<Partial<AppState>>`. We will define nodes to achieve the following logic:

* **Entry Point Node:** The graph’s entry node, which runs first on each invocation. It could initialize the conversation if needed. For example, if `state.messages` is empty and there's a new `state.input`, we might push a `HumanMessage` to the history. This node basically prepares the state for processing the input.

* **Retrieve LTM Node:** If long-term memory is enabled and the agent has past knowledge, this node will query the long-term memory store for relevant entries given the current input or recent conversation context. It updates `state.retrievedMemories` with a few snippets (e.g., similar past conversations or facts). This can be as simple as a vector similarity search on the LTM store using the `state.input` as the query vector. In code, this node would call a memory utility (see Step 5) to get relevant memory texts.

* **Compose Prompt Node:** This node prepares the prompt for the LLM. It can take the `state.messages` (short-term context) and any `state.retrievedMemories` and craft a system or user prompt for the model. For instance, it might produce a formatted string like: "*Relevant facts: ...* followed by *Conversation history: ...* and then *User's question: ...*". The formatted prompt or assembled message list is then passed to the model. (If using LangChain’s model interface, we might not need to manually format, we can supply context as separate messages.)

* **LLM Query Node:** Use an LLM (via LangChain or direct API) to get a completion for the prompt. LangGraph can incorporate this as a node that calls the model. For example, using an OpenAI Chat model:

  ```ts
  const llmNode = async (state: AppState) => {
    const messages = [ ...state.messages, { role: "user", content: state.input } ];
    // Optionally prepend system instructions or retrieved memories in messages.
    const response = await openAiChat.call(messages);
    return { aiResponse: response.content || "", aiRawOutput: response }; 
  };
  ```

  Here we assume `openAiChat` is a LangChain `ChatOpenAI` instance. We store the response content in state (e.g., `aiResponse`). We might also update `state.messages` by appending the AI’s answer later.

* **Tool Use Handling:** The agent might decide a tool is needed. If using a ReAct pattern agent, the LLM’s response might come in a format like a tool usage command (LangGraph’s ReAct agent handles this automatically if we use `createReactAgent`). For a custom graph, we can detect if the LLM output indicates a tool call (for example, if `response.content` matches a pattern or has a structured signal). If so, branch to a **Tool Execution Node**:

  * This node will call the appropriate tool through MCP. For instance, if the LLM says `search("weather in SF")`, our tool node would invoke an MCP client or local function to perform the search and get results.
  * The tool result is then put into state (e.g., `state.toolResult`) and we then loop back to the LLM Node to let the model incorporate the result (prompting it with the tool output).
  * LangGraph allows branching logic via `workflow.addEdge()` conditions. Pseudocode: `workflow.addEdge({ from: llmNode, to: toolNode, condition: (state) => state.aiResponse.startsWith("[TOOL]") })`. This ensures if the AI requests a tool, we execute it, otherwise go to the next step.

* **Review/Interrupt Handling:** In the full design, the agent can **interrupt** for a review step (HITL or HISA). For the MVP, we will simplify this:

  * We can choose to **bypass manual review** entirely and trust the AI’s output, given autonomy is a goal. If an LLM output would normally trigger a review (e.g., it outputs a special token for review), we can either ignore that or handle it internally.
  * **Autonomous Mode:** We set `HISA_ENABLED = false` in config (no separate agent) and handle "interrupts" automatically. One simple strategy is to have the agent immediately resume execution as if it got approval. Alternatively, we can incorporate a brief internal critique: have the LLM reflect on its answer (a self-review) and then continue. However, given the 1.5 week scope, it might be safest to avoid complicating the flow. We’ll assume no critical interruptions are needed for MVP, keeping the loop uninterrupted. This aligns with focusing on autonomy (the agent corrects itself if needed, or we prompt it to be self-consistent up front).

* **Finalize Response Node:** After the LLM has arrived at an answer (possibly after tool usage loops), we append the AI’s answer to the `state.messages` history. This node might format the final response for output and perform logging:

  * It can create a **summary of the interaction** to add to long-term memory. For example, generate a short summary of the Q\&A or any new information learned (`state.currentInteractionSummary`). This could be done with a quick LLM call or a simple rule (e.g., just store the user question and answer pair).
  * It should write important details to the **Day’s Memories log** (see Step 6). For MVP, this could be appending a record to a JSON file or database table that collects all interactions of the day. Each record might contain the user query, the final answer, and perhaps the summary or timestamp.
  * Return the final response (which the MCP server will send back to the UI).

Add each node to the `workflow` with `workflow.addNode(nodeFunction)`, and define transitions between them. For example:

```ts
const entryPointNode = async (state: AppState) => {
  if (state.messages.length === 0 && state.input) {
    // start conversation: add user message to history
    state.messages.push({ role: "human", content: state.input });
  }
  return {};  // no specific state change apart from messages mutation
};
workflow.addNode(entryPointNode);

// ... add other nodes similarly ...

workflow.addEdge({ from: entryPointNode, to: retrieveLTMNode });
workflow.addEdge({ from: retrieveLTMNode, to: composePromptNode });
// etc.
```

The result is a defined graph that can handle a single query cycle. We’ll compile this graph with a checkpointer next, to maintain state across cycles.

## Step 4: Integrate Short-Term Memory (Session State via Checkpointer)

Short-term memory corresponds to the agent’s conversation state that persists throughout a session (around one day of interactions). LangGraph’s **checkpointer** mechanism will allow our agent to remember context between invocations by the UI or autonomous triggers.

**Using a Checkpointer:** LangGraph supports pluggable state persistence. For development and MVP testing, we can use an in-memory checkpointer (no external DB required). For example:

```ts
import { MemorySaver } from "@langchain/langgraph/checkpointers";

// After defining the workflow and nodes:
const memoryCheckpointer = new MemorySaver();
const compiledGraph = workflow.compile({ checkpointer: memoryCheckpointer });
```

This `MemorySaver` will store the state for each conversation **thread** in memory. When the agent is invoked with a `thread_id` (session identifier), the checkpointer will load the last saved state for that thread, allowing the conversation to continue seamlessly. In our MCP server (next step), we will use a consistent thread\_id for the user (e.g., a user ID or session ID) so that the agent loads the same context each time. For new sessions (new thread\_id), the state starts fresh, isolated from others (preventing leakage of memory between sessions).

**Production Note:** If we need the short-term memory to persist beyond application restarts or to scale out, we can swap in a persistent checkpointer. The architecture suggests using Postgres (with a table for state checkpoints) as an option. Given our timeframe, this is optional – the in-memory approach is simpler. However, if running the agent continuously for a day or more, consider at least periodically backing up the state or using a lightweight DB (even a local SQLite with a checkpointer plugin, if available). This ensures the agent’s day-long context isn’t lost on a crash.

In summary, by compiling the graph with a checkpointer, we equip the agent with short-term episodic memory: it can recall what was said earlier in the day and continue the conversation coherently.

## Step 5: Implement the Long-Term Memory Store (Recency-Biased Knowledge Base)

Long-term memory (LTM) allows the agent to retain important knowledge over time, beyond the short context window. The design calls for a **recency-biased** store of curated memories, meaning recent experiences are prioritized while older memories may fade or be summarized. For the MVP, we will implement a basic LTM subsystem:

**5.1 Choose a Storage Solution:** To keep it simple, use an existing vector store or an embedding-based search:

* **Vector Database:** If convenience is a priority, using a hosted solution like Pinecone or a local solution like Weaviate/Chroma is viable. The example config shows Pinecone (with an index name `ltm-sc-index`). With Pinecone, for instance, you would use the Pinecone client to upsert and query vectors. Alternatively, a local **FAISS** index or even a Postgres table with pgvector could be set up.
* **In-Memory Embeddings:** For an MVP, you can initially store memories in a simple in-memory list. Each memory entry would include some text (e.g., a summary of a past event) and an embedding vector. Use OpenAI’s embedding API or similar to generate vectors for each memory. For querying, compute the embedding of the new query and do a cosine similarity search over stored vectors. This avoids external dependencies and can be implemented quickly if the dataset is small.
* **Data Model:** Each memory item might be an object with `{ id, content: string, timestamp: Date, vector: number[] }`. The *recency bias* can be simulated by preferring items with newer timestamps when choosing what to retrieve (e.g., multiply similarity score by a factor that decays for older items, or simply always include the latest few items).

**5.2 Memory Retrieval Function:** Implement a helper (in `src/memory/longTermMemory.ts`) for retrieving relevant memories. For example:

```ts
async function fetchRelevantMemories(query: string, limit: number = 3): Promise<string[]> {
  const embedding = await embedText(query);  // use an embedding model
  const results = vectorStore.similaritySearch(embedding, { topK: limit });
  // If implementing manually, calculate cosine similarity with each stored vector.
  // Apply recency bias: e.g., sort by score*alpha^age, or filter by recent timeframe if desired.
  return results.map(item => item.content);
}
```

This function will be called by the **Retrieve LTM Node** in the agent workflow (from Step 3) to populate `state.retrievedMemories` with some related context from long-term storage.

**5.3 Memory Insertion (Logging):** We also need the ability to **add** memories. Initially, we will log raw experiences (user queries, agent answers, etc.) to a temporary store (the "day's log"). See Step 6 for how we consolidate them. But if some events are immediately worth remembering, we could directly store a memory. For MVP, simplest is to log everything to a daily list and only insert into the permanent LTM store during the consolidation phase.

However, if you want immediate usage, you might store *high-priority* memories on the fly. For example, if the agent encounters a new piece of knowledge (perhaps via a tool or user input that seems important), you could embed and save it to LTM right away. This can be done by a function like:

```ts
async function storeLongTermMemory(text: string) {
  const vector = await embedText(text);
  vectorStore.upsert([{ content: text, vector, timestamp: Date.now() }]);
}
```

In our workflow, this could be called at the end of an interaction (when logging notable experiences). For MVP, we might defer all this to the end-of-day consolidation to keep things simple and avoid consistency issues (i.e., treat the LTM store as append-only updated daily).

**5.4 Ensuring Recency Bias:** Over time, the LTM store may grow. The "recency bias" means our retrieval strategy will favor newer memories. We can implement this by:

* Always including the most recent N memories in the retrieval results (ensuring the agent recalls recent events even if their vector similarity might not rank highest).
* During consolidation (Step 6), possibly aging out or compressing old memories (e.g., delete or merge ones older than a threshold, after summarizing them).
* Using a scoring function for similarity that discounts older entries (for example, multiply similarity by a decay factor based on age).

For the MVP, a straightforward rule could be: *always fetch the top 2 most similar memories and always add the latest 1 or 2 entries from the past day.* This way, the agent remembers very recent happenings as well as relevant older ones.

By the end of this step, we have a **LongTermMemory module** with methods to fetch relevant memories and log new ones. This module will interact with both the main agent (for queries) and the consolidation process.

## Step 6: Implement the "Sleep Cycle" for Memory Consolidation

To manage long-term memory growth and curation, the design introduces a **daily sleep cycle** – a scheduled process where the agent “sleeps” and consolidates the day’s experiences. In the MVP, we will implement a simplified version of this mechanism:

**6.1 Day’s Memory Log:** Throughout the day, as the agent operates, it should record notable events to a **temporary log store**. This can be as simple as an in-memory array or a database table where each entry is a raw interaction or an intermediate summary. For example, after each user query/response cycle, push an entry to `daysLog`:

```ts
// Example structure for day's memory log entry
daysLog.push({
  timestamp: Date.now(),
  userQuery: state.lastUserInput,
  assistantAnswer: state.lastAnswer,
  summary: state.currentInteractionSummary // optional short summary of the QA
});
```

In an MVP, you might keep this log in memory (resetting it if the server restarts). If persistence is needed, use a small DB table (the architecture mentions a Postgres DB for temporary logs). But an in-memory log is acceptable for a prototype, as long as the agent runs long enough to accumulate a day's data.

**6.2 Scheduling the Sleep Cycle:** Decide on a trigger for consolidation:

* The simplest is time-based (e.g., every 24 hours at a set time, say 2AM). You can use `setTimeout`/`setInterval` in Node or a package like `node-cron` to schedule a daily job.
* Alternatively, trigger when the agent has been idle for a long period (though we also plan intrinsic tasks during idle, so time-of-day is clearer).
* For MVP, scheduling once a day is sufficient. For example:

  ```ts
  import cron from "node-cron";
  cron.schedule("0 2 * * *", () => runMemoryConsolidation());
  ```

  This would run `runMemoryConsolidation()` at 2:00 AM daily.

**6.3 Consolidation Process:** Implement `runMemoryConsolidation()` (potentially in `src/memory/consolidation.ts`). This function (or **MemoryConsolidationGraph** if using LangGraph for it) will:

1. **Gather the Day’s Logs:** Retrieve all entries from `daysLog` (and then clear `daysLog` for the next day).
2. **Prune and Summarize:** Using the LLM, condense these raw logs into distilled long-term knowledge:

   * You might prompt the LLM: *"Here are the notes from today: \[list of events]. Summarize the key facts, insights, and any decisions made. Focus on what's important to remember long-term."*
   * If the log is very large, you could summarize in chunks or use a few-shot approach. But for MVP, assuming moderate usage, a single prompt could handle it.
   * The output might be a paragraph or a set of bullet points of important memories.
   * Optionally, also identify any *irrelevant* or redundant entries that can be discarded (the LLM can help decide what not to keep).
3. **Update Long-Term Store:** Take the summary (and possibly some raw important items) and insert them into the LTM vector store:

   * For each key insight from the summary, call the `storeLongTermMemory` function (embedding and upserting into the vector DB).
   * If there are raw items deemed worth keeping (perhaps critical events or facts), store them as well.
   * You may tag these entries with the date or a label like `"summary_of_2025-05-21"`.
4. **Clean Up Old Memories:** (Optional for MVP) Implement retention policy. For example, if the LTM store has entries older than N days that have been superseded by summaries, remove or archive them. This can prevent infinite growth and enforce recency bias. A simple rule: if you just added a summary for the day, you might delete the individual log entries from that day (since they are now summarized). Or if a weekly summary is added, prune daily ones, etc. This can be as complex as needed; for MVP you might skip deletion and just be mindful of memory usage.

During consolidation, we want to **minimize concurrency issues**. Ideally, run this when the agent is not actively handling user requests (hence late-night scheduling). If the system must remain available, you could still perform consolidation but ensure thread-safety:

* If using a DB for logs and LTM, wrap these operations in transactions or locks (to avoid the main agent reading while writing occurs).
* If using in-memory, you might simply pause new user interactions during the few seconds of consolidation (perhaps by a flag that the MCP server checks, or just by trusting the timing).
* Since our MVP agent is single-threaded (Node event loop) and we control scheduling, a cron task will naturally not interfere with user requests if they don't coincide. But in rare cases, you may want to implement a check: e.g., don't run consolidation if the agent handled a user query in the last N minutes (to avoid clashing, then try later).

After this step, the agent effectively “sleeps” each day to reorganize its long-term memory. This ensures the **LTM remains concise and relevant**, containing summaries of past days rather than an ever-growing log. The next day, when the agent fetches from LTM, it will get those fresh summaries as context for new queries.

## Step 7: Integrate with Model Context Protocol (MCP) for Tools and UI Communication

With the agent’s core logic and memory in place, we need to expose it via an MCP server so that the UI (and any external tool callers) can interact with it. MCP standardizes how clients discover and invoke capabilities of the model/agent. Here’s how to set it up:

**7.1 MCP Server Setup:** In `src/server/index.ts` (or a similar entry file), use the MCP SDK to create a server. Typically, you would:

* Import the MCP server library, e.g.:

  ```ts
  import { createServer, createTool } from "@modelcontextprotocol/sdk";
  ```
* Define a tool (capability) that wraps the agent. For instance, create an MCP "tool" called `"processQuery"` that takes a user query and returns the agent’s answer:

  ```ts
  const processQueryTool = createTool({
    name: "processQuery",
    description: "Handle a user query with the cognitive agent and return an answer.",
    // Define input schema (if any) and output schema, possibly with Zod or JSON schema.
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    handler: async ({ query }) => {
      // Invoke the compiled LangGraph agent
      const threadId = "user-session-1";  // In a real scenario, derive from user/session
      const initialState = AppStateSchema.parse({ input: query });
      const resultState = await compiledGraph.invoke(initialState, { threadId });
      return resultState?.lastAnswer || resultState;  // return the agent's response
    }
  });
  ```

  This wraps our `compiledGraph` and essentially exposes it as a function call via MCP. The `threadId` ensures the agent state is persisted across calls (we use a fixed ID for one user; in multi-user setting, use unique IDs per user).
* Create the server and register this tool:

  ```ts
  const server = createServer({ port: process.env.MCP_SERVER_PORT || 8080 });
  server.registerTool(processQueryTool);
  server.start();
  console.log("MCP Server is running on port 8080...");
  ```

  The environment variable for port was in the config (`MCP_SERVER_PORT`).

With this, the agent can be invoked over MCP. The UI will call `processQuery` via the MCP client library. Additionally, if you have defined external **tools for the agent** (like our earlier example `search` tool or any other action), those too can be set up as MCP tools:

* For example, if using a search tool similar to the LangGraph quickstart, you can expose it to MCP so the agent can call it. In practice, if the agent is running internally, it might call the tool function directly; but MCP could allow tools to run in separate processes or on client side. For MVP, simplest is to have tools as local functions the agent calls (as we did in Step 3 for tool nodes).
* The key is that any tool the agent might call should be discoverable and permitted via the MCP interface (especially if the agent is running isolated). The architecture specifically notes MCP enabling **tool discovery and invocation**. In our case, since the agent and tools are in the same codebase, this is straightforward, but we adhere to MCP format for consistency.

**7.2 Testing the MCP Endpoint:** You can use the MCP client (from the UI or a separate script) to test. For example, via REST (if MCP server has a REST interface) or WebSocket:

* Some MCP servers support a standard REST call like `POST /tools/processQuery` with JSON payload `{ "query": "Hello" }`. Otherwise, the provided UI likely uses the MCP client library to call it.
* Verify that when you hit the endpoint, the agent processes the query (check logs for node execution) and returns a result.

At this point, the **UI and any MCP-compliant clients can invoke our agent**. We have effectively wrapped the LangGraph agent in a service interface, decoupling the backend from the frontend.

## Step 8: Build or Integrate a Basic User Interface

For the MVP, the UI’s purpose is to allow a human to **observe and optionally interact** with the agent. The user’s GitHub repository `LLM-chat-client-with-MCP` already provides a Next.js chat interface built around MCP – we can leverage that to save time. If using that:

* **UI Setup:** Clone or incorporate the Next.js app. There will be an MCP client configuration pointing to the MCP server’s address and port. Update it to `localhost:8080` (or the appropriate host) and ensure the tool name matches (e.g., `"processQuery"` as defined in Step 7).
* **UI Functionality:** The UI will typically have a text input for the user and display messages in a chat format. Since our agent is autonomous, the UI could also display **agent-initiated messages**. We might need to modify the UI slightly to handle cases where the agent speaks without a user prompt (intrinsic activities – see Step 9).
* The UI communicates by sending the user’s query via the MCP client to our server, and then displays the response. It also should handle the interrupt/review flow, but since we are not using manual HITL in MVP, we can ignore or disable UI elements related to that. (In a full design, the UI would show a "Needs review" message and allow the user to approve/resume, but with autonomy we skip this.)

If not using Next.js, a simpler alternative:

* Create a very minimal HTML page with a text box and a message log, and use the MCP client JS library (or plain fetch calls) to send queries to the server. This might be faster if starting from scratch, but given the repository is available, reusing it is wise.

**Visualizing Memory/State (Optional):** For debugging or demo, it can be helpful to show the agent’s thought process. You could print or display the retrieved long-term memories or the agent’s summaries. This can be done in the browser console or as part of the chat (e.g., showing a message like "*📝 (Memory recall: ...)*" for transparency). This isn't required, but it might help verify that memory and tools are working as expected.

By the end of this step, you have a UI to interact with the agent. The user can type a question and see the agent’s answer, which is enriched by long-term memory context and tool usage when applicable. The UI also allows us to simply watch the agent when it operates autonomously (it will show the agent’s self-initiated outputs in the chat).

## Step 9: Implement Intrinsic Motivation Loop (Autonomous Idle Behavior)

One of the defining features of this MVP is that the agent should **act autonomously even without user input**. In the original design, an independent HISA agent could feed goals or review decisions back to the main agent. To simplify, we will **abstract or replace HISA** with an intrinsic motivation mechanism within the same system. There are a couple of approaches to achieve this:

**9.1 Scheduled Autonomous Actions:** Set up a timer that periodically triggers the agent with a *system-generated query*. For instance, if the agent has been idle (no user queries) for, say, 10 minutes, we prompt it to "think or act":

* Use `setInterval` in the Node server to check for idleness. Keep track of the timestamp of the last user interaction. If `Date.now() - lastUserInputTime > threshold`, fire an intrinsic event.
* The intrinsic event can be modeled as a special kind of input to the agent. For example, we could call `compiledGraph.invoke` with a query like: *"##intrinsic##: What should I do next?"* or some predefined task.
* Better, maintain a list of **agent goals or tasks**. Perhaps the agent has a high-level objective (even something simple like "learn new facts" or "organize knowledge"). When idle, pick a task from this list. Example tasks:

  * Reflect on recent conversations to identify any unresolved questions.
  * Proactively fetch news or information on a topic of interest (if internet tool available).
  * Improve its knowledge base (maybe quiz itself or summarize something from memory).
  * Plan for future interactions or simply *“dream”* (simulate a scenario using its imagination).
* For MVP, you might hard-code one or two intrinsic behaviors. E.g., have it summarize its knowledge so far, or have it list topics it wants to explore. This can be done by calling the agent’s workflow with a specific prompt string or by having a dedicated branch in the graph for autonomous actions.

**9.2 Incorporate into the LangGraph Workflow:** Another approach is to handle autonomy inside the StateGraph:

* The **Entry Point Node** could detect a special condition indicating an intrinsic trigger (for example, if `state.input` is blank or equals `"##idle##"`). Then it could set a default query or route to a different subgraph for self-driven behavior.
* However, managing timing inside the graph is tricky; it's easier to trigger from outside (Node timers) and just call the graph normally with a synthetic input.

**9.3 Example – Reflection Task:** As a concrete example, schedule a task every evening (if not much user activity) where the agent asks itself: *"What did I learn or do today that I should remember?"* This is somewhat similar to the consolidation, but more interactive. The agent could then produce a monologue answer, which gets logged to memory. In effect, the agent is holding a self-dialogue. This can reuse the same pipeline: we just provide a prompt and let the agent answer it.

**9.4 Execution and UI Implications:** When an intrinsic task runs:

* The `handler` in the MCP server (from Step 7) can be invoked programmatically (not via HTTP, but directly calling the function or graph). Since the MCP server is just our code, we can simply do `await compiledGraph.invoke(intrinsicState, { threadId })` inside our timer callback.
* The result (agent's response) can be logged or even broadcast to the UI. If the UI is a live chat, we might have to push the message to it. Without building a full push mechanism, a simpler way is to log it server-side and, when the user opens the UI, it will load from the conversation history which now includes that message (since we appended it to `state.messages`).
* Alternatively, if using websockets in MCP (some MCP implementations use persistent connections), we could send a message event.
* Simpler: next time the user opens or refreshes the chat, they see those self-generated messages as part of history.

**9.5 Intrinsic Goals and HISA Abstraction:** The original HISA was described as having its own long-term goals guiding its actions. We can emulate this by hardcoding one or two **pseudo-goals** for the agent (which essentially serve as intrinsic motivations). For example:

* Goal: “Continuously improve knowledge on \[X] topic.”
* Goal: “Ensure important daily events are summarized.”
* Goal: “Maintain a baseline conversation even when alone.” (could simulate talking to itself about a topic).

These can translate into periodic queries. For instance, if a goal is to learn about a topic, the intrinsic query could be *"Find something new about \[X]"* and then the agent might call a web search tool and read results (if such a tool is available). This would show the agent acting on its own initiative.

Keep the intrinsic loop **manageable** – perhaps limit it to run at certain intervals and only if no user input is pending, to avoid it cluttering the timeline or consuming too many resources.

By implementing this step, our MVP agent **no longer sits idle waiting for input**. It will simulate a kind of internal life: performing small tasks or thoughts driven by intrinsic goals. This replaces the need for a separate HISA module in the MVP, while still achieving the spirit of an autonomous agent with its own drive.

## Step 10: Testing, Tuning, and Considerations

With all components in place, perform end-to-end testing:

* Start the MCP server and ensure the agent can handle a normal user query with memory and tools. Verify the short-term memory works by asking follow-up questions (the agent should remember context from earlier questions in the session).
* Test long-term memory by simulating a second session or day: after consolidation, ask something related to a previous day’s conversation and see if the agent recalls (via the summary stored).
* Observe the autonomous behavior: let the system sit without input and see if the intrinsic task triggers. Check that it doesn’t produce errors and that any self-generated outputs are logged properly (and appear in UI if applicable).
* Tune parameters as needed: similarity thresholds for memory retrieval, the frequency of intrinsic actions, etc., to get reasonable behavior.

**Concurrency and Consistency:** During testing, pay attention to edge cases:

* If a user query comes in exactly when the sleep cycle or an intrinsic task is running. The design choices earlier (like scheduling at night and checking idle time) mitigate most issues. If needed, add a simple flag like `isConsolidating` that the MCP handler checks: if true, it can defer or reject new queries until done (or queue them).
* Ensure that memory logs are cleared after consolidation to avoid duplicate summaries.

**Scope Management:** Remember that this is an MVP. Some complex features are intentionally simplified:

* **No complex HISA logic:** We did not implement a full separate agent for review. All decisions are made by the main agent or via straightforward automation. This reduces complexity tremendously.
* **Limited Toolset:** Perhaps only one or two tools (like web search or calculator) are integrated to demonstrate capability. Adding more is future work.
* **Single-user focus:** We assumed one primary user/session for simplicity. Multi-user support would need isolating sessions by thread\_id and perhaps separate long-term memory per user.
* **Error Handling:** Add basic error catching in each node (so one tool failing doesn’t crash the whole graph). LangGraph nodes returning partial state make it easy to recover by designing fallback paths (not extensively covered here due to time).

By the end of this implementation, you will have a functioning prototype of the Onion Individual agent: it can converse with a user, remember over short and long terms, use a tool via MCP, **and even act autonomously** in the absence of user input. This structured approach ensures each piece (memory, MCP, intrinsic loop) is built and integrated step by step, which is achievable within \~1.5 weeks of focused development.

## References and Sources

* LangGraph.js official documentation and quickstart for building custom agent flows.
* *Building Advanced Cognitive AI Agents* (user-provided architecture manual) – provided guidance on system components (Unified Agent, LTM-SC subsystem, HISA) and design patterns.
* Model Context Protocol (MCP) introduction – for understanding MCP server/client interactions and tool interfacing.
* LangGraph usage of checkpointers (MemorySaver for in-memory state) and session management.
* Descriptions of memory consolidation ("sleep cycle") and long-term memory handling from the architecture manual.
* HISA concept from the architecture manual – inspiration for autonomous agent goals and behaviors.
