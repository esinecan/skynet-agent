/**
 * Agent initialization and query processing
 */

import { createAgentWorkflow } from "./workflow";
import { AppState } from "./schemas/appStateSchema";
import { McpClientManager } from '../mcp/client';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { createLogger } from '../utils/logger';
import { WorkflowError } from '../utils/errorHandler';
import { updateComponentHealth, HealthStatus } from '../utils/health';
import { loadMcpServerConfigs } from '../utils/configLoader';

// Initialize logger
const logger = createLogger('agent');

// Load environment variables early - before any imports execute
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });
logger.info("Environment loaded in agent/index.ts");

// Will be initialized during startup
let agentWorkflow: any = null;
let mcpManager: McpClientManager | null = null;

/**
 * Initialize the agent with MCP clients and workflow
 */
export async function initializeAgent(): Promise<{ agentWorkflow: any; mcpManager: McpClientManager | null }> {
  try {
    // Load MCP server configurations from the config loader
    const mcpServers = loadMcpServerConfigs();
    logger.info(`Loaded ${mcpServers.length} MCP server configurations`);
    
    // Initialize MCP client manager if we have servers configured
    if (mcpServers.length > 0) {
      mcpManager = new McpClientManager(mcpServers);
      await mcpManager.initialize();
      logger.info('MCP clients initialized');
      
      // Create workflow with MCP manager
      agentWorkflow = createAgentWorkflow(mcpManager);
    } else {
      // For now, create workflow without MCP integrations
      logger.info('No MCP servers configured, running in standalone mode');
      agentWorkflow = createAgentWorkflow();
    }
    
    logger.info('Agent workflow initialized');
    
    return { agentWorkflow, mcpManager };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error initializing agent:', err);
    throw err;
  }
}

// Simple in-memory conversation store
const conversationStore: Record<string, AppState> = {};

/**
 * Process a user query and return a response
 * @param query The user's input query
 * @param threadId Unique identifier for the conversation thread
 * @returns The agent's response
 */
export async function processQuery(query: string, threadId: string = "default"): Promise<string> {
  if (!agentWorkflow) {
    throw new Error("Agent not initialized. Call initializeAgent() first.");
  }
  
  // Check if API key is valid - if not, run in simple echo mode for testing
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    logger.warn("Running in echo mode due to missing API key");
    return `[ECHO MODE] You said: "${query}" (API key not configured, echo mode enabled)`;
  }
  
  try {
    // Get existing conversation state or create new one
    const existingState = conversationStore[threadId];
    logger.info(`Processing query for thread ${threadId} - Existing state:`, {
      hasState: !!existingState,
      messageCount: existingState?.messages?.length || 0
    });
    
    // Initialize state with the user's query - preserve history if it exists
    const initialState: AppState = {
      input: query,
      messages: existingState?.messages || []
    };

    logger.info(`Invoking workflow with initial state:`, {
      input: initialState.input,
      messageCount: initialState.messages.length
    });
    
    // Try to inspect the workflow object
    logger.info("Workflow type:", { type: agentWorkflow.constructor.name });
    logger.info("Available methods:", { methods: Object.getOwnPropertyNames(Object.getPrototypeOf(agentWorkflow)) });
    
    try {
      // Invoke the workflow with the initial state
      logger.info("Starting workflow invocation...");
      const resultState = await agentWorkflow.invoke(initialState);
      logger.info("Workflow invocation completed successfully");
      
      // Store updated state for next interaction
      conversationStore[threadId] = resultState;
      
      // Log the result structure
      logger.info("Result structure:", {
        hasAiResponse: !!resultState.aiResponse,
        responseLength: resultState.aiResponse?.length || 0,
        messageCount: resultState.messages?.length || 0,
        hasToolCall: !!resultState.toolCall,
        hasToolResults: !!resultState.toolResults && Object.keys(resultState.toolResults || {}).length > 0
      });
      
      // Return the AI's response
      return resultState.aiResponse || "No response generated";
    } catch (workflowError: any) {
      // Detailed error logging for invoke method
      const err = workflowError instanceof Error ? workflowError : new Error(String(workflowError));
      logger.error("Workflow invocation error:", err);
      
      if (workflowError.message && workflowError.message.includes('checkpointer.get')) {
        return `Error with checkpointer: ${workflowError.message}. This is likely an issue with the LangGraph memory system.`;
      }
      
      return `Workflow error: ${workflowError.message || 'Unknown error'}`;
    }
  } catch (error: any) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error processing query in thread ${threadId}:`, err);
    return `Sorry, I encountered an error: ${error.message || 'Unknown error'}`;
  }
}
