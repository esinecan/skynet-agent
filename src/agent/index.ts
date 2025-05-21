import { createAgentWorkflow } from "./workflow";
import { AppState } from "./schemas/appStateSchema";
import { McpClientManager } from '../mcp/client';

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
  
  // Initialize state with the user's query
  const initialState: AppState = {
    input: query,
    messages: []
  };

  // Invoke the workflow with the initial state and thread ID
  const resultState = await agentWorkflow.invoke(initialState, { configurable: { threadId } });
  
  // Return the AI's response
  return resultState.aiResponse || "No response generated";
}
