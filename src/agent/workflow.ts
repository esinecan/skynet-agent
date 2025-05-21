import { StateGraph } from "@langchain/langgraph";
import { AppState, AppStateSchema, ToolCall } from "./schemas/appStateSchema";
import { generateResponse } from "./llmClient";
import { McpClientManager } from "../mcp/client";

// Simple in-memory store for conversation state
class SimpleMemoryStore {
  private memory: Record<string, any> = {};

  async get(key: string): Promise<any> {
    return this.memory[key] || null;
  }

  async put(key: string, value: any): Promise<void> {
    this.memory[key] = value;
  }

  async list(): Promise<string[]> {
    return Object.keys(this.memory);
  }
}

// Create nodes for the workflow
const entryPointNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  // Add the user input to the messages array if it's not already there
  if (state.input && !state.messages.some(m => m.role === "human" && m.content === state.input)) {
    return {
      messages: [...state.messages, { role: "human", content: state.input }]
    };
  }
  return {};
};

const llmQueryNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  // Get MCP manager from context or from global context (workaround)
  const mcpManager = (context?.mcpManager || (global as any).mcpManagerContext) as McpClientManager;
  let toolsPrompt = "You are a helpful AI assistant. Respond to the user's queries in a helpful and informative way.";
  
  // Only attempt to list tools if mcpManager is available
  if (mcpManager) {
    try {
      const toolsList = await mcpManager.listAllTools();
      
      // Format tools for the system prompt
      if (toolsList.length > 0) {
        toolsPrompt = "You have access to the following tools:\n";
        
        for (const server of toolsList) {
          toolsPrompt += `\n## ${server.serverName} Server:\n`;
          for (const tool of server.tools) {
            toolsPrompt += `- ${tool.name}: ${tool.description || 'No description'}\n`;
          }
        }
        
        // If tools are available, add instructions
        const hasTools = toolsList.some(server => server.tools?.length > 0);
        
        if (hasTools) {
          toolsPrompt += "\nTo use a tool, respond with JSON in the following format:\n";
          toolsPrompt += '```json\n{"server": "serverName", "tool": "toolName", "args": {"arg1": "value1"}}\n```\n';
          toolsPrompt += "If you don't need to use a tool, just respond normally.";
        }
      }
    } catch (error) {
      console.error("Error listing tools:", error);
      // Continue with default prompt if error occurs
    }
  }
  
  // Generate response
  const response = await generateResponse(state.messages, toolsPrompt);
  
  // Check if the response contains a tool call
  const toolCall = extractToolCall(response);
  
  if (toolCall) {
    // If tool call is detected, we'll process it in the tool node
    return {
      aiResponse: response,
      toolCall: toolCall
    };
  }
  
  // No tool call, just return the response
  return {
    aiResponse: response,
    messages: [...state.messages, { role: "ai", content: response }]
  };
};

// Helper to extract tool calls from LLM response
function extractToolCall(response: string): ToolCall | null {
  // Look for JSON blocks in the response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                   response.match(/\{[\s\S]*"server"[\s\S]*"tool"[\s\S]*\}/);
  
  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      if (parsed.server && parsed.tool) {
        return {
          server: parsed.server,
          tool: parsed.tool,
          args: parsed.args || {}
        };
      }
    } catch (e) {
      console.error("Failed to parse tool call JSON:", e);
    }
  }
  return null;
}

const toolExecutionNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  const toolCall = state.toolCall;
  if (!toolCall) return {};
  
  // Get MCP manager from context or from global context (workaround)
  const mcpManager = (context?.mcpManager || (global as any).mcpManagerContext) as McpClientManager;
  
  // If mcpManager is not available, return an error
  if (!mcpManager) {
    const errorMsg = `Error: No MCP Manager available to execute tool ${toolCall.tool}`;
    console.error(errorMsg);
    
    return {
      messages: [...state.messages, 
        { role: "ai", content: state.aiResponse || "I tried to use a tool but couldn't." },
        { role: "system", content: errorMsg }
      ]
    };
  }
  
  try {
    const result = await mcpManager.callTool(
      toolCall.server, 
      toolCall.tool, 
      toolCall.args
    );
    
    // Format tool result for the LLM
    const toolResultMsg = `I called the tool ${toolCall.tool} from ${toolCall.server} with the arguments ${JSON.stringify(toolCall.args)}. The result was: ${JSON.stringify(result)}`;
    
    return {
      toolResults: {...(state.toolResults || {}), [toolCall.tool]: result},
      messages: [...state.messages, 
        { role: "ai", content: state.aiResponse || "I'll use a tool to help with this." },
        { role: "system", content: toolResultMsg }
      ]
    };
  } catch (error) {
    console.error(`Error executing tool ${toolCall.tool}:`, error);
    const errorMsg = `Error calling tool ${toolCall.tool}: ${error.message}`;
    
    return {
      messages: [...state.messages, 
        { role: "ai", content: state.aiResponse || "I'll use a tool to help with this." },
        { role: "system", content: errorMsg }
      ]
    };
  }
};

// Create the workflow with LangGraph
export function createAgentWorkflow(mcpManager?: McpClientManager) {
  try {
    console.log("Creating agent workflow with LangGraph...");
    
    // Create the state graph
    const workflow = new StateGraph<AppState>({
      channels: AppStateSchema.shape
    });

    // Use provided manager or the placeholder
    const manager = mcpManager || new McpClientManager();
    console.log("MCPManager availability:", !!manager);

    // Add nodes
    workflow.addNode("entryPoint", entryPointNode);
    workflow.addNode("llmQuery", llmQueryNode);
    workflow.addNode("toolExecution", toolExecutionNode);
    console.log("Nodes added to the graph");

    // Set the entrypoint
    workflow.setEntryPoint("entryPoint");
    console.log("Entry point set");

    // Add edges
    workflow.addEdge("entryPoint", "llmQuery");
    console.log("Edge added: entryPoint -> llmQuery");
    
    // Conditional edge from LLM to Tool Execution or end
    console.log("Adding conditional edges...");
    workflow.addConditionalEdges(
      "llmQuery",
      (state: AppState) => !!state.toolCall, // Convert to boolean
      {
        true: "toolExecution",
        false: "__end__"
      }
    );
    console.log("Conditional edges added: llmQuery -> toolExecution/end");
    
    // Edge from Tool Execution back to LLM Query to process results
    workflow.addEdge("toolExecution", "llmQuery");
    console.log("Edge added: toolExecution -> llmQuery");

        // Do not use any checkpointer for now
    console.log("Compiling the graph without a checkpointer...");
    
    // Compile the graph with the correct API for our version
    const compiledGraph = workflow.compile();
    
    // Create a custom wrapper that includes our context
    const wrappedGraph = {
      invoke: async (state: AppState, config: any = {}) => {
        // We need to modify how we invoke the graph to pass the MCP manager
        // This is a workaround for the limitations in the older LangGraph version
        try {
          console.log("Invoking wrapped graph with custom context");
          
          // Add the MCP manager to the global context temporarily
          // This is not ideal but works around the limitations
          (global as any).mcpManagerContext = manager;
          
          // Invoke the actual graph
          const result = await compiledGraph.invoke(state);
          
          // Clean up the global context
          delete (global as any).mcpManagerContext;
          
          return result;
        } catch (error) {
          console.error("Error invoking wrapped graph:", error);
          throw error;
        }
      }
    };
    
    console.log("Graph compiled successfully");

    // Let's inspect the compiled graph
    console.log("Compiled graph structure:", 
      JSON.stringify({
        // Show information about the graph that's safe to stringify
        hasNodes: !!compiledGraph.constructor.name,
        graphType: compiledGraph.constructor.name,
        // List methods available (for debugging)
        methods: Object.getOwnPropertyNames(Object.getPrototypeOf(compiledGraph))
      }, null, 2)
    );

    return wrappedGraph;
  } catch (error) {
    console.error("Error creating agent workflow:", error);
    // Rethrow to propagate the error
    throw error;
  }
}
