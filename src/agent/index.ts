/**
 * Agent initialization and query processing
 */
import * as Sentry from "@sentry/node";
import { createAgentWorkflow } from "./workflow";
// Assuming AppState is correctly defined and used in createAgentWorkflow or processQuery
import type { AppState } from "./schemas/appStateSchema"; 
import { McpClientManager } from '../mcp/client';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { createLogger } from '../utils/logger';
import { loadMcpServerConfigs } from '../utils/configLoader';
import { validateAndSanitizeTools } from '../mcp/toolValidator';

// Import MCP Client type for typing
import type { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';

// Define simplified interfaces for imported types without being too strict
interface GoogleAI {
  chats: {
    create: (config: Record<string, unknown>) => {
      sendMessage: (params: { message: string }) => Promise<{
        text?: string;
        functionCalls?: Array<Record<string, unknown>>;
      }>;
    };
  };
  // Using unknown to avoid specific typing issues
  models: unknown;
}

// Define a type for the agent workflow
interface AgentWorkflow {
  invoke: (state: AppState) => Promise<AppState>;
}

const logger = createLogger('agent');

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });
logger.info("Environment loaded in agent/index.ts", { path: envPath });

// Module-scoped variables to hold initialized instances
let agentWorkflow: AgentWorkflow | null = null;
let mcpManager: McpClientManager | null = null;
let googleAiClientInstance: unknown = null;
let preparedCallableToolsForGemini: unknown[] = []; // Stores tools ready for Gemini
let preparedToolConfigForGemini: { functionCallingConfig: { mode: unknown } } | null = null; // Stores toolConfig for Gemini

/**
 * Dynamically imports the GoogleGenAI module to avoid ESM compatibility issues
 */
async function loadGoogleGenAI() {
  // No longer needed - using Vercel AI SDK instead
  return null;
}

/**
 * Legacy function - no longer needed with Vercel AI SDK
 */
async function convertMcpClientsToTools(clients: unknown[]): Promise<null> {
  // No longer needed - tools are handled by LLMService
  return null;
}

/**
 * Initializes the core components of the agent:
 * - MCP Client Manager (for external tools)
 * - GoogleGenAI client (for LLM interaction)
 * - Prepared tools and tool configurations for Gemini
 * - The agent's main workflow
 */
export async function initializeAgent(): Promise<{
  agentWorkflow: AgentWorkflow;
  mcpManager: McpClientManager | null;
}> {
  return Sentry.startSpan({ name: 'agent.initialize_v2' }, async (span) => { // Renamed span for clarity
    try {
      Sentry.setTag('operation', 'agent_initialization');
      Sentry.addBreadcrumb({
        message: 'Starting agent initialization process',
        category: 'agent.init',
        level: 'info'
      });

      // 1. Load MCP Server Configurations
      const mcpServers = loadMcpServerConfigs();
      logger.info(`Loaded ${mcpServers.length} MCP server configurations.`);
      span?.setAttribute('mcp_servers_count', mcpServers.length);
      
      // 2. Initialize McpClientManager and Prepare Tools for Gemini
      if (mcpServers.length > 0) {
        mcpManager = new McpClientManager(mcpServers);
        await mcpManager.initialize();
        logger.info('MCP Client Manager initialized and clients connected.');
        
        const mcpClientInstances: McpClient[] = mcpManager.getAllClients();
        logger.info(`MCP Client Manager has ${mcpClientInstances.length} active clients.`);
        
        // Tools are now handled by LLMService - no need for separate conversion
        preparedCallableToolsForGemini = [];
        preparedToolConfigForGemini = null;
      } else {
        logger.info('No MCP servers configured. Agent will operate without external MCP tools.');
        preparedCallableToolsForGemini = [];
        preparedToolConfigForGemini = null;
      }
        
      // LLM functionality now handled by LLMService - no separate client needed
      logger.info('LLM functionality handled by LLMService in workflow.');

      // 4. Initialize the Agent Workflow
      // Pass mcpManager (which can be null), using ?? undefined to satisfy type for optional param
      agentWorkflow = createAgentWorkflow(mcpManager ?? undefined) as AgentWorkflow;
      logger.info('Agent workflow initialized.');
      
      if (!agentWorkflow) {
        throw new Error('Failed to initialize agent workflow');
      }
      
      return { agentWorkflow, mcpManager };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Critical error during agent initialization:', err);
      Sentry.captureException(err, { tags: { context: 'agent_initialization_critical_failure' } });
      throw err; // Re-throw for higher-level error handling (e.g., in src/run.ts)
    }
  });
}

/**
 * Getter for the centralized GoogleGenAI client instance.
 * Used by llmClient.ts to make API calls.
 */
export function getGoogleAiClient(): unknown {
  // No additional logging here to keep it purely a getter.
  // Warning for null is handled when googleAiClientInstance is set or attempted to be used.
  return googleAiClientInstance;
}

/**
 * Getter for the prepared callable tools array, formatted for Gemini.
 */
export function getPreparedToolsForGemini(): unknown[] {
  return preparedCallableToolsForGemini;
}

/**
 * Getter for the prepared tool configuration object for Gemini.

/**
 * Processes a user query through the agent's workflow with streaming support.
 * @param query - The user's input string.
 * @param threadId - A unique identifier for the conversation thread.
 * @returns A Promise resolving to a ReadableStream of the agent's response.
 */
export async function processQueryStream(query: string, threadId = "default"): Promise<ReadableStream> {
  if (!agentWorkflow) {
    logger.error("Agent workflow not initialized. Call initializeAgent() first.");
    throw new Error("Agent not initialized. Please ensure initializeAgent() has been called successfully.");
  }
  
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    logger.warn("processQueryStream: Running in echo mode due to missing/placeholder API key.");
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`[ECHO MODE] You said: "${query}" (API key not configured, echo mode enabled)`));
        controller.close();
      }
    });
  }
  
  try {
    const existingState = conversationStore[threadId];
    const initialState: AppState = {
      input: query,
      messages: existingState?.messages || [],
    };
    
    logger.info(`Invoking streaming workflow for thread '${threadId}' with input: "${query.substring(0, 50)}..."`);
    
    // For now, we'll use the existing workflow and convert to stream
    // This can be enhanced later to use native streaming from LLMService
    const resultState = await agentWorkflow.invoke(initialState);
    conversationStore[threadId] = resultState;
    
    const response = resultState.aiResponse || "No response generated by workflow.";
    logger.info(`Streaming workflow for thread '${threadId}' completed.`);
    
    // Convert string response to stream
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(response));
        controller.close();
      }
    });

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error processing streaming query in thread ${threadId}:`, err);
    Sentry.captureException(err, { tags: { context: 'process_query_stream_failure' }, extra: { query, threadId } });
    
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`Sorry, I encountered an error: ${err.message || 'Unknown error'}`));
        controller.close();
      }
    });
  }
}

export function getPreparedToolConfigForGemini(): { functionCallingConfig: { mode: unknown } } | null {
  return preparedToolConfigForGemini;
}

// In-memory conversation store (can be replaced with a persistent store if needed)
const conversationStore: Record<string, AppState> = {};

/**
 * Processes a user query through the agent's workflow.
 * @param query - The user's input string.
 * @param threadId - A unique identifier for the conversation thread.
 * @returns A Promise resolving to the agent's textual response.
 */
export async function processQuery(query: string, threadId = "default"): Promise<string> {
  if (!agentWorkflow) {
    logger.error("Agent workflow not initialized. Call initializeAgent() first.");
    // Consider throwing a more specific error or handling this state gracefully.
    throw new Error("Agent not initialized. Please ensure initializeAgent() has been called successfully.");
  }
  
  // API key check here is a fallback if client somehow gets created without it by llmClient,
  // but ideally, llmClient would fail first if getGoogleAiClient() returns null.
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    logger.warn("processQuery: Running in echo mode due to missing/placeholder API key.");
    return `[ECHO MODE] You said: "${query}" (API key not configured, echo mode enabled)`;
  }
  
  try {
    const existingState = conversationStore[threadId];
    // Initialize AppState for the workflow. Ensure your AppState definition is consistent.
    const initialState: AppState = {
      input: query,
      messages: existingState?.messages || [],
      // Initialize other AppState fields as per your schema, e.g.:
      // aiResponse: undefined, 
      // toolCall: undefined, 
      // toolResults: undefined,
      // reflectionResult: undefined,
      // memoryId: undefined,
      // retrievalEvaluation: undefined
    };
    
    logger.info(`Invoking workflow for thread '${threadId}' with input: "${query.substring(0, 50)}..."`);
    
    const resultState = await agentWorkflow.invoke(initialState);
    conversationStore[threadId] = resultState; // Store the entire new state
    
    logger.info(`Workflow for thread '${threadId}' completed. AI Response: "${(resultState.aiResponse || "None").substring(0, 50)}..."`);
    return resultState.aiResponse || "No response generated by workflow.";

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error processing query in thread ${threadId}:`, err);
    Sentry.captureException(err, { tags: { context: 'process_query_failure' }, extra: { query, threadId } });
    return `Sorry, I encountered an error while processing your request: ${err.message || 'Unknown error'}`;
  }
}

