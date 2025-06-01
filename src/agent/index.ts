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
    const startTime = Date.now();
    
    try {
      Sentry.setTag('operation', 'agent_initialization');
      Sentry.addBreadcrumb({
        message: 'Starting agent initialization process',
        category: 'agent.init',
        level: 'info'
      });

      logger.debug('Starting agent initialization', {
        nodeEnv: process.env.NODE_ENV,
        processId: process.pid,
        hasGoogleApiKey: !!process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== "your_gemini_api_key_here"
      });

      // 1. Load MCP Server Configurations
      const mcpConfigStartTime = Date.now();
      const mcpServers = loadMcpServerConfigs();
      const mcpConfigTime = Date.now() - mcpConfigStartTime;
      
      logger.debug('MCP server configurations loaded', {
        serverCount: mcpServers.length,
        configLoadTimeMs: mcpConfigTime,
        serverNames: mcpServers.map(s => s.name)
      });
      
      logger.info(`Loaded ${mcpServers.length} MCP server configurations.`);
      span?.setAttribute('mcp_servers_count', mcpServers.length);
      
      // 2. Initialize McpClientManager and Prepare Tools for Gemini
      if (mcpServers.length > 0) {
        const mcpManagerStartTime = Date.now();
        mcpManager = new McpClientManager(mcpServers);
        
        logger.debug('Initializing MCP Client Manager', {
          serverCount: mcpServers.length
        });
        
        await mcpManager.initialize();
        const mcpManagerTime = Date.now() - mcpManagerStartTime;
        
        const mcpClientInstances: McpClient[] = mcpManager.getAllClients();
        
        logger.debug('MCP Client Manager initialized successfully', {
          initTimeMs: mcpManagerTime,
          activeClients: mcpClientInstances.length,
          avgTimePerClient: mcpClientInstances.length > 0 ? Math.round(mcpManagerTime / mcpClientInstances.length) : 0
        });
        
        logger.info('MCP Client Manager initialized and clients connected.');
        logger.info(`MCP Client Manager has ${mcpClientInstances.length} active clients.`);
        
        // Tools are now handled by LLMService - no need for separate conversion
        preparedCallableToolsForGemini = [];
        preparedToolConfigForGemini = null;
      } else {
        logger.debug('No MCP servers to initialize');
        logger.info('No MCP servers configured. Agent will operate without external MCP tools.');
        preparedCallableToolsForGemini = [];
        preparedToolConfigForGemini = null;
      }
        
      // LLM functionality now handled by LLMService - no separate client needed
      logger.debug('LLM functionality configured for LLMService');
      logger.info('LLM functionality handled by LLMService in workflow.');

      // 4. Initialize the Agent Workflow
      const workflowStartTime = Date.now();
      logger.debug('Initializing agent workflow', {
        hasMcpManager: !!mcpManager
      });
      
      // Pass mcpManager (which can be null), using ?? undefined to satisfy type for optional param
      agentWorkflow = createAgentWorkflow(mcpManager ?? undefined) as AgentWorkflow;
      const workflowTime = Date.now() - workflowStartTime;
      
      logger.debug('Agent workflow created', {
        workflowInitTimeMs: workflowTime,
        hasWorkflow: !!agentWorkflow
      });
      
      logger.info('Agent workflow initialized.');
      
      if (!agentWorkflow) {
        throw new Error('Failed to initialize agent workflow');
      }
      
      const totalTime = Date.now() - startTime;
      logger.debug('Agent initialization completed successfully', {
        totalTimeMs: totalTime,
        mcpConfigTimeMs: mcpConfigTime,
        mcpManagerTimeMs: mcpServers.length > 0 ? (Date.now() - startTime - mcpConfigTime) : 0,
        workflowTimeMs: workflowTime,
        breakdown: {
          config: mcpConfigTime,
          mcpManager: mcpServers.length > 0 ? (totalTime - mcpConfigTime - workflowTime) : 0,
          workflow: workflowTime
        }
      });
      
      return { agentWorkflow, mcpManager };

    } catch (error) {
      const totalTime = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Critical error during agent initialization:', err);
      logger.debug('Agent initialization failed', {
        totalTimeMs: totalTime,
        errorType: err.constructor.name,
        errorMessage: err.message,
        hasAgentWorkflow: !!agentWorkflow,
        hasMcpManager: !!mcpManager
      });
      
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
  const startTime = Date.now();
  
  logger.debug('Starting streaming query processing', {
    threadId,
    queryLength: query?.length || 0,
    queryPreview: query ? query.substring(0, 100) + (query.length > 100 ? '...' : '') : '',
    hasExistingState: !!conversationStore[threadId],
    existingMessages: conversationStore[threadId]?.messages?.length || 0
  });
  
  if (!agentWorkflow) {
    const errorTime = Date.now() - startTime;
    logger.error("Agent workflow not initialized. Call initializeAgent() first.");
    logger.debug('Streaming query processing failed - workflow not initialized', {
      threadId,
      queryLength: query?.length || 0,
      errorTimeMs: errorTime
    });
    
    throw new Error("Agent not initialized. Please ensure initializeAgent() has been called successfully.");
  }
  
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    const echoTime = Date.now() - startTime;
    logger.debug('Running streaming in echo mode due to missing/placeholder API key', {
      threadId,
      queryLength: query?.length || 0,
      processingTimeMs: echoTime
    });
    
    logger.warn("processQueryStream: Running in echo mode due to missing/placeholder API key.");
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`[ECHO MODE] You said: "${query}" (API key not configured, echo mode enabled)`));
        controller.close();
      }
    });
  }
  
  const encoder = new TextEncoder();
  
  return new ReadableStream({
    async start(controller) {
      const streamStartTime = Date.now();
      try {
        const existingState = conversationStore[threadId];
        
        // Run workflow synchronously to completion
        const initialState: AppState = {
          input: query,
          messages: existingState?.messages || []
        };
        
        logger.debug('Initial state prepared for synchronous workflow', {
          threadId,
          hasInput: !!initialState.input,
          messageCount: initialState.messages.length
        });
        
        logger.info(`Invoking synchronous workflow for thread '${threadId}' with input: "${query.substring(0, 50)}..."`);
        
        const workflowStartTime = Date.now();
        
        // Ensure agentWorkflow is initialized
        if (!agentWorkflow) {
          logger.error('Agent workflow not initialized. Cannot process query.');
          throw new Error('Agent workflow not initialized. Call initializeAgent() first.');
        }
        
        const resultState = await agentWorkflow.invoke(initialState);
        const workflowTime = Date.now() - workflowStartTime;
        
        logger.debug('Workflow execution completed', {
          threadId,
          workflowTimeMs: workflowTime,
          hasAiResponse: !!resultState.aiResponse,
          streamSetupTimeMs: Date.now() - streamStartTime
        });
        
        // Update conversation store
        conversationStore[threadId] = resultState;
        
        // Stream the complete response
        const completeResponse = resultState.aiResponse || "No response generated.";
        const chunks = chunkContent(completeResponse);
        
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
          // Add small delay for smooth streaming UX
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        controller.close();
        
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(`Error in streaming workflow for thread ${threadId}:`, err);
        logger.debug('Streaming workflow error details', {
          threadId,
          errorType: err.constructor.name,
          errorMessage: err.message,
          errorStack: err.stack,
          streamTimeMs: Date.now() - streamStartTime
        });
        
        controller.enqueue(encoder.encode(`\n\nError: ${err.message}`));
        controller.close();
      }
    }
  });
}

/**
 * Chunks content for smooth streaming
 */
function chunkContent(content: string): string[] {
  const chunks: string[] = [];
  const chunkSize = 25; // Characters per chunk
  
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }
  
  return chunks;
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
  const startTime = Date.now();
  
  logger.debug('Starting query processing', {
    threadId,
    queryLength: query?.length || 0,
    queryPreview: query ? query.substring(0, 100) + (query.length > 100 ? '...' : '') : '',
    hasExistingState: !!conversationStore[threadId],
    existingMessages: conversationStore[threadId]?.messages?.length || 0
  });
  
  if (!agentWorkflow) {
    const errorTime = Date.now() - startTime;
    logger.error("Agent workflow not initialized. Call initializeAgent() first.");
    logger.debug('Query processing failed - workflow not initialized', {
      threadId,
      queryLength: query?.length || 0,
      errorTimeMs: errorTime
    });
    // Consider throwing a more specific error or handling this state gracefully.
    throw new Error("Agent not initialized. Please ensure initializeAgent() has been called successfully.");
  }
  
  // API key check here is a fallback if client somehow gets created without it by llmClient,
  // but ideally, llmClient would fail first if getGoogleAiClient() returns null.
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    const echoTime = Date.now() - startTime;
    logger.debug('Running in echo mode due to missing/placeholder API key', {
      threadId,
      queryLength: query?.length || 0,
      processingTimeMs: echoTime
    });
    
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
    
    logger.debug('Initial state prepared for workflow', {
      threadId,
      hasInput: !!initialState.input,
      messageCount: initialState.messages.length,
      stateKeys: Object.keys(initialState)
    });
    
    logger.info(`Invoking workflow for thread '${threadId}' with input: "${query.substring(0, 50)}..."`);
    
    const workflowStartTime = Date.now();
    
    // Ensure agentWorkflow is initialized
    if (!agentWorkflow) {
      logger.error('Agent workflow not initialized. Cannot process query.');
      throw new Error('Agent workflow not initialized. Call initializeAgent() first.');
    }
    
    const resultState = await agentWorkflow.invoke(initialState);
    const workflowTime = Date.now() - workflowStartTime;
    
    conversationStore[threadId] = resultState; // Store the entire new state
    
    const totalTime = Date.now() - startTime;
    const response = resultState.aiResponse || "No response generated by workflow.";
    
    logger.debug('Query processing completed successfully', {
      threadId,
      totalTimeMs: totalTime,
      workflowTimeMs: workflowTime,
      responseLength: response.length,
      finalMessageCount: resultState.messages?.length || 0,
      efficiency: {
        charsPerSecond: query.length > 0 ? Math.round((query.length / workflowTime) * 1000) : 0,
        responseCharsPerSecond: Math.round((response.length / workflowTime) * 1000)
      },
      stateAnalysis: {
        hasAiResponse: !!resultState.aiResponse,
        hasToolCall: !!resultState.toolCall,
        hasToolResults: !!resultState.toolResults,
        hasReflectionResult: !!resultState.reflectionResult
      }
    });
    
    logger.info(`Workflow for thread '${threadId}' completed. AI Response: "${(resultState.aiResponse || "None").substring(0, 50)}..."`);
    return response;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error processing query in thread ${threadId}:`, err);
    logger.debug('Query processing failed with error', {
      threadId,
      totalTimeMs: totalTime,
      queryLength: query?.length || 0,
      errorType: err.constructor.name,
      errorMessage: err.message,
      hasWorkflow: !!agentWorkflow
    });
    
    Sentry.captureException(err, { tags: { context: 'process_query_failure' }, extra: { query, threadId } });
    return `Sorry, I encountered an error while processing your request: ${err.message || 'Unknown error'}`;
  }
}

