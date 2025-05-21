import { createAgentWorkflow } from "./workflow";
import { AppState } from "./schemas/appStateSchema";
import { McpClientManager } from '../mcp/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables early - before any imports execute
const envPath = path.resolve(process.cwd(), '.env');
dotenv.config({ path: envPath });
console.log("Environment loaded in agent/index.ts");

// Will be initialized during startup
let agentWorkflow: any = null;
let mcpManager: McpClientManager | null = null;

/**
 * Initialize the agent with MCP clients and workflow
 */
export async function initializeAgent() {
  try {
    // Configure MCP servers - these will be customizable in the future
    const mcpServers = [
      // For initial testing, we'll use minimal configuration
      // We can add real MCP servers as needed
      /*
      {
        name: "desktopCommander",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@wonderwhy-er/desktop-commander"]
      },
      {
        name: "playwright",
        transport: "stdio",
        command: "npx",
        args: ["@playwright/mcp@latest"]
      }
      */
    ];
    
    // Initialize MCP client manager if we have servers configured
    if (mcpServers.length > 0) {
      mcpManager = new McpClientManager(mcpServers);
      await mcpManager.initialize();
      console.log('MCP clients initialized');
      
      // Create workflow with MCP manager
      agentWorkflow = createAgentWorkflow(mcpManager);
    } else {
      // For now, create workflow without MCP integrations
      console.log('No MCP servers configured, running in standalone mode');
      agentWorkflow = createAgentWorkflow();
    }
    
    console.log('Agent workflow initialized');
    
    return { agentWorkflow, mcpManager };
  } catch (error) {
    console.error('Error initializing agent:', error);
    throw error;
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
    console.log("Running in echo mode due to missing API key");
    return `[ECHO MODE] You said: "${query}" (API key not configured, echo mode enabled)`;
  }
  
  try {
    // Get existing conversation state or create new one
    const existingState = conversationStore[threadId];
    console.log(`Processing query for thread ${threadId} - Existing state:`, existingState ? 
      `Has ${existingState.messages?.length || 0} messages` : 
      'No previous state');
    
    // Initialize state with the user's query - preserve history if it exists
    const initialState: AppState = {
      input: query,
      messages: existingState?.messages || []
    };

    console.log(`Invoking workflow with initial state:`, {
      input: initialState.input,
      messageCount: initialState.messages.length
    });
    
    // Try to inspect the workflow object
    console.log("Workflow type:", agentWorkflow.constructor.name);
    console.log("Available methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(agentWorkflow)));
    
    try {
      // Invoke the workflow with the initial state
      console.log("Starting workflow invocation...");
      const resultState = await agentWorkflow.invoke(initialState);
      console.log("Workflow invocation completed successfully");
      
      // Store updated state for next interaction
      conversationStore[threadId] = resultState;
      
      // Log the result structure
      console.log("Result structure:", {
        hasAiResponse: !!resultState.aiResponse,
        responseLength: resultState.aiResponse?.length || 0,
        messageCount: resultState.messages?.length || 0,
        hasToolCall: !!resultState.toolCall,
        hasToolResults: !!resultState.toolResults && Object.keys(resultState.toolResults || {}).length > 0
      });
      
      // Return the AI's response
      return resultState.aiResponse || "No response generated";
    } catch (workflowError) {
      // Detailed error logging for invoke method
      console.error("Workflow invocation error:", workflowError);
      console.error("Error stack:", workflowError.stack);
      
      if (workflowError.message.includes('checkpointer.get')) {
        return `Error with checkpointer: ${workflowError.message}. This is likely an issue with the LangGraph memory system.`;
      }
      
      return `Workflow error: ${workflowError.message}`;
    }
  } catch (error: any) { // Use any to safely access error properties
    console.error(`Error processing query in thread ${threadId}:`, error);
    return `Sorry, I encountered an error: ${error.message}`;
  }
}
