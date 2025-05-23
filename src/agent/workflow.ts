/**
 * Enhanced workflow with self-reflective reasoning for the Skynet Agent
 * Integrates memory, intrinsic motivation, and self-reflection capabilities
 */

import { StateGraph } from "@langchain/langgraph";
import { AppState, AppStateSchema, ToolCall } from "./schemas/appStateSchema";
import { generateResponse } from "./llmClient";
import { McpClientManager } from "../mcp/client";
import { createLogger } from "../utils/logger";
import { WorkflowError } from "../utils/errorHandler";
import { updateComponentHealth, HealthStatus, incrementMetric } from "../utils/health";
import { memoryManager } from "../memory";
import { updateLastUserInteraction } from "./intrinsicMotivation";
import { performSelfReflection, ReflectionMode } from "./selfReflection";

const logger = createLogger('workflow');

// Create nodes for the workflow
const entryPointNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  try {
    logger.info('Entering workflow at entry point node', { 
      hasInput: !!state.input,
      messageCount: state.messages?.length || 0
    });
    
    // Update last user interaction time for intrinsic motivation system
    updateLastUserInteraction();
    
    // Add the user input to the messages array if it's not already there
    if (state.input && !state.messages.some(m => m.role === "human" && m.content === state.input)) {
      logger.debug('Adding user input to message history', { inputLength: state.input.length });
      
      return {
        messages: [...state.messages, { role: "human", content: state.input }]
      };
    }
    
    return {};
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error in entry point node', err);
    throw new WorkflowError('Error processing user input', { cause: err });
  }
};

const memoryRetrievalNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  try {
    logger.info('Retrieving relevant memories', { 
      hasInput: !!state.input,
      messageCount: state.messages?.length || 0
    });
    
    // Get the latest user message
    const latestUserMessage = state.messages
      .filter(m => m.role === "human")
      .pop();
    
    if (!latestUserMessage) {
      logger.warn('No user message found for memory retrieval');
      return {};
    }
    
    // Retrieve relevant memories
    const relevantMemories = await memoryManager.retrieveMemories(latestUserMessage.content, 3);
    
    if (relevantMemories.length === 0) {
      logger.info('No relevant memories found');
      return {};
    }
    
    logger.info(`Found ${relevantMemories.length} relevant memories`, {
      topMemoryScore: relevantMemories[0].score
    });
    
    // Format memories for inclusion in the context
    const memoryContext = relevantMemories.map(mem => 
      `[Memory ${mem.id}]: ${mem.text}`
    ).join('\n\n');
    
    // Add memory context as a system message
    return {
      messages: [
        ...state.messages,
        { 
          role: "system", 
          content: `Relevant information from your memory:\n\n${memoryContext}`
        }
      ]
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error in memory retrieval node', err);
    // Continue without memory rather than failing the workflow
    return {};
  }
};

const llmQueryNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  try {
    logger.info('Generating LLM response', { messageCount: state.messages?.length || 0 });
    
    // Get MCP manager from context or from global context (workaround)
    const mcpManager = (context?.mcpManager || (global as any).mcpManagerContext) as McpClientManager;
    let toolsPrompt = "You are a helpful AI assistant with advanced cognitive capabilities. Respond to the user's queries in a helpful and informative way.";
    
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
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error("Error listing tools:", err);
        // Continue with default prompt if error occurs
      }
    }
    
    // Track LLM call for metrics
    incrementMetric('llmCallsMade');
    
    // Generate response
    const response = await generateResponse(state.messages, toolsPrompt);
    
    // Check if the response contains a tool call
    const toolCall = extractToolCall(response);
    
    if (toolCall) {
      // If tool call is detected, we'll process it in the tool node
      logger.info('Tool call detected in LLM response', { 
        server: toolCall.server, 
        tool: toolCall.tool 
      });
      
      return {
        aiResponse: response,
        toolCall: toolCall
      };
    }
    
    // No tool call, just return the response
    logger.info('LLM response generated successfully', { responseLength: response.length });
    
    return {
      aiResponse: response,
      messages: [...state.messages, { role: "ai", content: response }]
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error in LLM query node', err);
    throw new WorkflowError('Error generating AI response', { cause: err });
  }
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
      const err = e instanceof Error ? e : new Error(String(e));
      logger.error("Failed to parse tool call JSON:", err);
    }
  }
  return null;
}

const toolExecutionNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  const toolCall = state.toolCall;
  if (!toolCall) return {};
  
  try {
    logger.info(`Executing tool call`, { 
      server: toolCall.server, 
      tool: toolCall.tool,
      args: JSON.stringify(toolCall.args)
    });
    
    // Get MCP manager from context or from global context (workaround)
    const mcpManager = (context?.mcpManager || (global as any).mcpManagerContext) as McpClientManager;
    
    // If mcpManager is not available, return an error
    if (!mcpManager) {
      const errorMsg = `Error: No MCP Manager available to execute tool ${toolCall.tool}`;
      logger.error(errorMsg);
      
      return {
        messages: [...state.messages, 
          { role: "ai", content: state.aiResponse || "I tried to use a tool but couldn't." },
          { role: "system", content: errorMsg }
        ]
      };
    }
    
    // Track tool call for metrics
    incrementMetric('toolCallsMade');
    
    const result = await mcpManager.callTool(
      toolCall.server, 
      toolCall.tool, 
      toolCall.args
    );
    
    logger.info(`Tool execution successful`, { 
      resultSize: typeof result === 'string' ? result.length : JSON.stringify(result).length
    });
    
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
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Error executing tool ${toolCall.tool}:`, err);
    const errorMsg = `Error calling tool ${toolCall.tool}: ${err.message}`;
    
    return {
      messages: [...state.messages, 
        { role: "ai", content: state.aiResponse || "I'll use a tool to help with this." },
        { role: "system", content: errorMsg }
      ]
    };
  }
};

const selfReflectionNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  // Only perform self-reflection if we have an AI response
  if (!state.aiResponse) {
    return {};
  }
  
  try {
    logger.info('Performing self-reflection on AI response');
    
    // Get the latest user message
    const latestUserMessage = state.messages
      .filter(m => m.role === "human")
      .pop();
    
    if (!latestUserMessage) {
      logger.warn('No user message found for self-reflection');
      return {};
    }
    
    // Determine if this needs thorough reflection based on complexity
    // For simplicity in MVP, we'll use message length as a proxy for complexity
    const isComplex = latestUserMessage.content.length > 100 || state.aiResponse.length > 500;
    const mode = isComplex ? ReflectionMode.THOROUGH : ReflectionMode.QUICK;
    
    // Perform self-reflection
    const reflectionResult = await performSelfReflection(
      latestUserMessage.content,
      state.aiResponse,
      mode,
      true // Enable improved response generation
    );
    
    logger.info('Self-reflection completed', { 
      score: reflectionResult.score,
      critiqueLength: reflectionResult.critique.length
    });
    
    let finalAiResponse = state.aiResponse;
    if (reflectionResult.improvedResponse && reflectionResult.score !== undefined && reflectionResult.score < 7) {
      logger.info('Using improved response due to low quality score', {
        originalScore: reflectionResult.score,
        improvedResponseLength: reflectionResult.improvedResponse.length
      });
      finalAiResponse = reflectionResult.improvedResponse;
      
      // Update the messages array with the improved response
      const updatedMessages = [...state.messages];
      const lastAiMessageIndex = updatedMessages.length - 1;
      if (updatedMessages[lastAiMessageIndex]?.role === "ai") {
        updatedMessages[lastAiMessageIndex].content = finalAiResponse;
      }
      
      return {
        aiResponse: finalAiResponse,
        messages: updatedMessages,
        reflectionResult: {
          score: reflectionResult.score,
          critique: reflectionResult.critique,
          improved: true
        }
      };
    }

    return {
      aiResponse: finalAiResponse,
      reflectionResult: {
        score: reflectionResult.score,
        critique: reflectionResult.critique,
        improved: false
      }
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error in self-reflection node', err);
    // Continue without reflection rather than failing the workflow
    return {};
  }
};

const memoryStorageNode = async (state: AppState, context: any): Promise<Partial<AppState>> => {
  // Only store in memory if we have an AI response
  if (!state.aiResponse) {
    return {};
  }
  
  try {
    logger.info('Storing conversation in long-term memory');
    
    // Get the latest user message and AI response
    const latestUserMessage = state.messages
      .filter(m => m.role === "human")
      .pop();
    
    const latestAiMessage = state.messages
      .filter(m => m.role === "ai")
      .pop();
    
    if (!latestUserMessage || !latestAiMessage) {
      logger.warn('Incomplete conversation for memory storage');
      return {};
    }
    
    // Store the conversation exchange
    const memoryText = `User: ${latestUserMessage.content}\nAI: ${latestAiMessage.content}`;
    const memoryId = await memoryManager.storeMemory(memoryText, {
      type: 'conversation',
      timestamp: new Date().toISOString(),
      hasToolUse: !!state.toolCall
    });
    
    logger.info(`Conversation stored in memory with ID: ${memoryId}`);
    
    return {
      memoryId
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error in memory storage node', err);
    // Continue without storing memory rather than failing the workflow
    return {};
  }
};

// Create the workflow with LangGraph
export function createAgentWorkflow(mcpManager?: McpClientManager) {
  try {
    logger.info("Creating agent workflow with LangGraph...");
    
    // Create the state graph with properly structured channels
    const workflow = new StateGraph<AppState>({
      channels: {
        input: { value: null, default: () => "" },
        messages: { value: null, default: () => [] },
        aiResponse: { value: null },
        toolCall: { value: null },
        toolResults: { value: null },
        reflectionResult: { value: null },
        memoryId: { value: null }
      }
    });

    // Use provided manager or the placeholder
    const manager = mcpManager || new McpClientManager();
    logger.info("MCPManager availability:", { available: !!manager });

    // Add nodes
    workflow.addNode("entryPoint", entryPointNode);
    workflow.addNode("memoryRetrieval", memoryRetrievalNode);
    workflow.addNode("llmQuery", llmQueryNode);
    workflow.addNode("toolExecution", toolExecutionNode);
    workflow.addNode("selfReflection", selfReflectionNode);
    workflow.addNode("memoryStorage", memoryStorageNode);
    logger.info("Nodes added to the graph");

    // Set the entrypoint
    workflow.setEntryPoint("entryPoint");
    logger.info("Entry point set");

    // Add edges
    workflow.addEdge("entryPoint", "memoryRetrieval");
    workflow.addEdge("memoryRetrieval", "llmQuery");
    logger.info("Initial edges added");
    
    // Conditional edge from LLM to Tool Execution or Self-Reflection
    logger.info("Adding conditional edges...");
    workflow.addConditionalEdges(
      "llmQuery",
      (state: AppState) => !!state.toolCall, // Convert to boolean
      {
        true: "toolExecution",
        false: "selfReflection"
      }
    );
    logger.info("Conditional edges added: llmQuery -> toolExecution/selfReflection");
    
    // Edge from Tool Execution back to LLM Query to process results
    workflow.addEdge("toolExecution", "llmQuery");
    logger.info("Edge added: toolExecution -> llmQuery");
    
    // Edge from Self-Reflection to Memory Storage
    workflow.addEdge("selfReflection", "memoryStorage");
    logger.info("Edge added: selfReflection -> memoryStorage");
    
    // Edge from Memory Storage to end
    workflow.addEdge("memoryStorage", "__end__");
    logger.info("Edge added: memoryStorage -> __end__");

    // Do not use any checkpointer for now
    logger.info("Compiling the graph without a checkpointer...");
    
    // Compile the graph with the correct API for our version
    const compiledGraph = workflow.compile();
    
    // Create a custom wrapper that includes our context
    const wrappedGraph = {
      invoke: async (state: AppState, config: any = {}) => {
        // We need to modify how we invoke the graph to pass the MCP manager
        // This is a workaround for the limitations in the older LangGraph version
        try {
          logger.info("Invoking wrapped graph with custom context");
          
          // Track request for metrics
          incrementMetric('requestsProcessed');
          
          // Update health status
          updateComponentHealth(
            'workflow', 
            HealthStatus.HEALTHY, 
            'Processing user query'
          );
          
          // Add the MCP manager to the global context temporarily
          // This is not ideal but works around the limitations
          (global as any).mcpManagerContext = manager;
          
          // Invoke the actual graph
          const result = await compiledGraph.invoke(state);
          
          // Clean up the global context
          delete (global as any).mcpManagerContext;
          
          logger.info("Graph invocation completed successfully");
          
          return result;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error("Error invoking wrapped graph:", err);
          
          // Update health status
          updateComponentHealth(
            'workflow', 
            HealthStatus.DEGRADED, 
            'Error in workflow execution'
          );
          
          throw err;
        }
      }
    };
    
    logger.info("Graph compiled successfully");
    
    // Update health status
    updateComponentHealth(
      'workflow', 
      HealthStatus.HEALTHY, 
      'Workflow initialized successfully'
    );

    return wrappedGraph;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error("Error creating agent workflow:", err);
    
    // Update health status
    updateComponentHealth(
      'workflow', 
      HealthStatus.UNHEALTHY, 
      'Failed to initialize workflow'
    );
    
    // Rethrow to propagate the error
    throw err;
  }
}
