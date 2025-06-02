/**
 * Enhanced workflow with self-reflective reasoning for the Skynet Agent
 * Integrates memory, intrinsic motivation, and self-reflection capabilities
 */

import * as Sentry from "@sentry/node";
import { StateGraph } from "@langchain/langgraph";
import type { AppState, ToolCall } from "./schemas/appStateSchema";
import { AppStateSchema } from "./schemas/appStateSchema";
import { LLMService } from "./llmClient";
import { McpClientManager } from "../mcp/client";
import { createLogger } from "../utils/logger";
import { WorkflowError } from "../utils/errorHandler";
import { updateComponentHealth, HealthStatus, incrementMetric } from "../utils/health";
import { memoryManager } from "../memory";
import { updateLastUserInteraction } from "./intrinsicMotivation";
import { performSelfReflection, ReflectionMode } from "./selfReflection";
import { unifiedLlmNode } from "./workflow/unifiedLlmNode";

const logger = createLogger('workflow');

// Define the context interface for workflow nodes
interface WorkflowContext {
  mcpManager?: McpClientManager;
}

// Global type augmentation for temporary context storage
declare global {
  // eslint-disable-next-line no-var
  var mcpManagerContext: McpClientManager | undefined;
  // eslint-disable-next-line no-var
  var llmServiceContext: LLMService | undefined;
}

// Simple retrieval decision based on query analysis
const shouldRetrieve = (query: string): boolean => {
  const skipPatterns = [
    /^(hi|hello|hey|goodbye|thanks|thank you)$/i, // Greetings and closings
    /^(what is \d+ [\+\-\*\/] \d+)/i,             // Basic math
    /^\s*tell me a joke\s*$/i,                    // Simple requests like jokes
    /^\s*who are you\??\s*$/i,                    // Identity questions
    /^(help|commands?|what can you do)\??$/i,     // Meta questions
    /^\s*how are you\??\s*$/i,                    // Simple conversational questions
  ];
  
  return !skipPatterns.some(pattern => pattern.test(query.trim()));
};

// Create nodes for the workflow
const entryPointNode = async (state: AppState, context: unknown): Promise<Partial<AppState>> => {
  return Sentry.startSpan({ name: 'workflow.entry_point' }, async (span) => {
    try {
      span?.setAttribute('has_input', !!state.input);
      span?.setAttribute('message_count', state.messages?.length || 0);
      
      Sentry.addBreadcrumb({
        message: 'Workflow entry point',
        category: 'workflow',
        level: 'info',
        data: { input: state.input?.substring(0, 100) }
      });

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
  });
};

const memoryRetrievalNode = async (state: AppState, context: unknown): Promise<Partial<AppState>> => {
  return Sentry.startSpan({ name: 'workflow.memory_retrieval' }, async (span) => {
    try {
      logger.debug('Memory retrieval node started', {
        hasInput: !!state.input,
        messageCount: state.messages?.length || 0,
        stateKeys: Object.keys(state)
      });
    
      // Get the latest user message
      const latestUserMessage = state.messages
        .filter(m => m.role === "human")
        .pop();
      
      if (!latestUserMessage) {
        logger.warn('No user message found for memory retrieval');
        logger.debug('Message analysis for memory retrieval', {
          totalMessages: state.messages?.length || 0,
          messageRoles: state.messages?.map(m => m.role) || [],
          hasHumanMessages: state.messages?.some(m => m.role === "human") || false
        });
        return {
          retrievalEvaluation: {
            shouldRetrieve: false,
            query: "",
            retrievedDocs: []
          }
        };
      }

      const query = latestUserMessage.content;
      logger.debug('Extracted query from user message', {
        messageRole: latestUserMessage.role,
        queryLength: query.length,
        queryPreview: query.substring(0, 100),
        messageTimestamp: 'user_message'
      });
      
      const retrieveDecision = shouldRetrieve(query);
      
      logger.debug('Memory retrieval decision analysis', { 
        query: query.slice(0, 50), 
        shouldRetrieve: retrieveDecision,
        queryLength: query.length,
        decisionReason: retrieveDecision ? 'Complex query requiring context' : 'Simple query, skipping retrieval'
      });
        if (!retrieveDecision) {
        logger.info('Skipping memory retrieval for simple query', { query: query.slice(0, 50) });
        logger.debug('Simple query patterns matched', {
          query: query.slice(0, 100),
          queryType: 'simple',
          skipReason: 'Matches simple pattern (greeting, basic math, etc.)'
        });
        return {
          retrievalEvaluation: {
            shouldRetrieve: false,
            query,
            retrievedDocs: []
          }
          // memoryContext is implicitly undefined
        };
      }
      
      logger.info('Retrieving relevant memories', { query: query.slice(0, 50) });
      logger.debug('Starting memory retrieval process', {
        query: query.substring(0, 100),
        retrievalLimit: 3,
        memorySystemInitialized: true
      });
      
      // Retrieve relevant memories
      const retrievalStartTime = Date.now();
      const relevantMemories = await memoryManager.retrieveMemories(query, 3);
      const retrievalDuration = Date.now() - retrievalStartTime;
      
      logger.debug('Memory retrieval completed', {
        memoriesFound: relevantMemories.length,
        retrievalTimeMs: retrievalDuration,
        query: query.substring(0, 50)
      });
      
      if (relevantMemories.length === 0) {
        logger.info('No relevant memories found');
        logger.debug('Empty memory retrieval result', {
          query: query.substring(0, 100),
          retrievalTimeMs: retrievalDuration,
          possibleReasons: ['No memories stored yet', 'Query too specific', 'Low similarity scores']
        });
        return {
          retrievalEvaluation: {
            shouldRetrieve: true,
            query,
            retrievedDocs: []
          }
        };
      }

      logger.info(`Found ${relevantMemories.length} relevant memories`, {
        topMemoryScore: relevantMemories[0].score
      });
      
      // Log detailed memory analysis
      logger.debug('Retrieved memories analysis', {
        memoryCount: relevantMemories.length,
        scores: relevantMemories.map(m => ({ id: m.id, score: m.score.toFixed(4) })),
        topMemoryPreview: relevantMemories[0].text.substring(0, 100),
        averageScore: (relevantMemories.reduce((sum, m) => sum + m.score, 0) / relevantMemories.length).toFixed(4)
      });

      // Format memories for inclusion in the context
      const memoryContext = relevantMemories.map(mem => 
        `[Memory ${mem.id}]: ${mem.text}`
      ).join('\n\n');

      logger.debug('Memory context prepared', {
        contextLength: memoryContext.length,
        memoriesIncluded: relevantMemories.length,
        contextPreview: memoryContext.substring(0, 200)
      });

      // Store memory context to be included in system prompt later
      return {
        retrievalEvaluation: {
          shouldRetrieve: true,
          query,
          retrievedDocs: relevantMemories
        },
        memoryContext: memoryContext
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Error in memory retrieval node', err);
      logger.debug('Memory retrieval node failure details', {
        errorMessage: err.message,
        errorStack: err.stack,
        stateKeys: Object.keys(state),
        hasInput: !!state.input,
        messageCount: state.messages?.length || 0
      });
      Sentry.captureException(err, {
        tags: { operation: 'memory_retrieval' },
        extra: { query: state.input }
      });
      // Continue without memory rather than failing the workflow
      return {
        retrievalEvaluation: {
          shouldRetrieve: true,
          query: state.input || "",
          retrievedDocs: []
        }
      };
    }
  });
};

const selfReflectionNode = async (state: AppState, context: unknown): Promise<Partial<AppState>> => {
  const startTime = Date.now();
  
  // Only perform self-reflection if we have an AI response
  if (!state.aiResponse) {
    logger.debug('Skipping self-reflection - no AI response available');
    return {};
  }
  
  try {
    logger.debug('Starting self-reflection process', {
      aiResponseLength: state.aiResponse.length,
      messageCount: state.messages?.length || 0,
      hasToolResults: !!state.toolResults,
      toolResultsCount: state.toolResults ? Object.keys(state.toolResults).length : 0
    });
    
    // Get the latest user message
    const latestUserMessage = state.messages
      .filter(m => m.role === "human")
      .pop();
    
    if (!latestUserMessage) {
      logger.debug('No user message found for self-reflection, skipping');
      return {};
    }
    
    logger.debug('Found user message for reflection', {
      userMessageLength: latestUserMessage.content.length,
      userMessagePreview: latestUserMessage.content.substring(0, 100) + (latestUserMessage.content.length > 100 ? "..." : "")
    });
    
    // Determine if this needs thorough reflection based on complexity
    // For simplicity in MVP, we'll use message length as a proxy for complexity
    const isComplex = latestUserMessage.content.length > 100 || state.aiResponse.length > 500;
    const mode = isComplex ? ReflectionMode.THOROUGH : ReflectionMode.QUICK;
    
    logger.debug('Determined reflection mode', {
      mode: mode,
      isComplex,
      userMessageLength: latestUserMessage.content.length,
      aiResponseLength: state.aiResponse.length,
      complexity: {
        userLong: latestUserMessage.content.length > 100,
        responseLong: state.aiResponse.length > 500
      }
    });
    
    //TODO: Eren: Enable self-reflection
    /*
    const reflectionResult = await performSelfReflection(
      latestUserMessage.content,
      state.aiResponse,
      mode,
      true // Enable improved response generation
    );
    
    const processingTime = Date.now() - startTime;
    logger.debug('Self-reflection completed', { 
      processingTimeMs: processingTime,
      score: reflectionResult.score,
      critiqueLength: reflectionResult.critique.length,
      hasImprovedResponse: !!reflectionResult.improvedResponse,
      improvedResponseLength: reflectionResult.improvedResponse?.length || 0
    });
    
    let finalAiResponse = state.aiResponse;
    if (reflectionResult.improvedResponse && reflectionResult.score !== undefined && reflectionResult.score < 7) {
      logger.debug('Using improved response due to low quality score', {
        originalScore: reflectionResult.score,
        threshold: 7,
        originalResponseLength: state.aiResponse.length,
        improvedResponseLength: reflectionResult.improvedResponse.length,
        improvement: reflectionResult.improvedResponse.length - state.aiResponse.length
      });
      finalAiResponse = reflectionResult.improvedResponse;
      */
     const finalAiResponse = state.aiResponse;
     const processingTime = Date.now() - startTime;

     logger.debug('Using placeholder reflection result (reflection disabled)', {
       processingTimeMs: processingTime,
       placeholderScore: 10,
       reflectionEnabled: false
     });

      // Update the messages array with the improved response
      const updatedMessages = [...state.messages];
      const lastAiMessageIndex = updatedMessages.length - 1;
      if (updatedMessages[lastAiMessageIndex]?.role === "ai") {
        updatedMessages[lastAiMessageIndex].content = finalAiResponse;
      }
      
      /*return {
        aiResponse: finalAiResponse,
        messages: updatedMessages,
        reflectionResult: {
          score: reflectionResult.score,
          critique: reflectionResult.critique,
          improved: true
        }
      };
    }*/

    logger.debug('Self-reflection node completed', {
      processingTimeMs: processingTime,
      finalResponseLength: finalAiResponse.length,
      scoreAssigned: 10,
      improved: false
    });

    return {
      aiResponse: finalAiResponse,
      reflectionResult: {
        //score: reflectionResult.score,
        score: 10, // TODO: Eren: Remove this hardcoded value
        //critique: reflectionResult.critique,
        critique: "This is a placeholder critique for the self-reflection process.",
        improved: false
      }
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error in self-reflection node', {
      error: err,
      processingTimeMs: processingTime,
      aiResponseLength: state.aiResponse?.length || 0,
      errorType: err.constructor.name
    });
    // Continue without reflection rather than failing the workflow
    return {};
  }
};

const memoryStorageNode = async (state: AppState, context: unknown): Promise<Partial<AppState>> => {
  // Only store in memory if we have an AI response
  if (!state.aiResponse) {
    logger.debug('Skipping memory storage - no AI response available', {
      hasAiResponse: !!state.aiResponse,
      messageCount: state.messages?.length || 0
    });
    return {};
  }
  
  try {
    logger.debug('Memory storage node started', {
      aiResponseLength: state.aiResponse.length,
      messageCount: state.messages?.length || 0,
      hasToolCall: !!state.toolCall,
      toolCallDetails: state.toolCall ? {
        server: state.toolCall.server,
        tool: state.toolCall.tool
      } : null
    });
    
    // Get the latest user message and AI response
    const latestUserMessage = state.messages
      .filter(m => m.role === "human")
      .pop();
    
    const latestAiMessage = state.messages
      .filter(m => m.role === "ai")
      .pop();
    
    if (!latestUserMessage || !latestAiMessage) {
      logger.warn('Incomplete conversation for memory storage');
      logger.debug('Message analysis for memory storage', {
        hasUserMessage: !!latestUserMessage,
        hasAiMessage: !!latestAiMessage,
        totalMessages: state.messages?.length || 0,
        messageRoles: state.messages?.map(m => m.role) || [],
        userMessages: state.messages?.filter(m => m.role === "human").length || 0,
        aiMessages: state.messages?.filter(m => m.role === "ai").length || 0
      });
      return {};
    }
    
    // Store the conversation exchange
    const memoryText = `User: ${latestUserMessage.content}\nAI: ${latestAiMessage.content}`;
    const memoryMetadata = {
      type: 'conversation',
      timestamp: new Date().toISOString(),
      hasToolUse: !!state.toolCall
    };
    
    logger.debug('Preparing conversation for memory storage', {
      userMessageLength: latestUserMessage.content.length,
      aiMessageLength: latestAiMessage.content.length,
      totalMemoryTextLength: memoryText.length,
      metadata: memoryMetadata,
      conversationPreview: memoryText.substring(0, 150)
    });
    
    const storageStartTime = Date.now();
    const memoryId = await memoryManager.storeMemory(memoryText, memoryMetadata);
    const storageDuration = Date.now() - storageStartTime;
    
    logger.info(`Conversation stored in memory with ID: ${memoryId}`);
    logger.debug('Memory storage completed successfully', {
      memoryId,
      storageTimeMs: storageDuration,
      memoryTextLength: memoryText.length,
      hasToolUse: !!state.toolCall,
      toolUsed: state.toolCall?.tool || null
    });
    
    return {
      memoryId
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error in memory storage node', err);
    logger.debug('Memory storage failure details', {
      errorMessage: err.message,
      errorStack: err.stack,
      aiResponseLength: state.aiResponse?.length || 0,
      messageCount: state.messages?.length || 0,
      hasToolCall: !!state.toolCall
    });
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
        memoryId: { value: null },
        retrievalEvaluation: { value: null },
        memoryContext: { value: null, default: () => undefined }
      }
    });

    // Use provided manager or the placeholder
    const manager = mcpManager || new McpClientManager();
    logger.info("MCPManager availability:", { available: !!manager });

    // Create LLM service instance
    const llmService = new LLMService(manager, process.env.AGENT_MODEL || 'google:gemini-2.5-flash-preview-05-20');
    logger.info("LLMService created with model:", llmService.getModelInfo());    // Add nodes
    workflow.addNode("entryPoint", entryPointNode);
    workflow.addNode("memoryRetrieval", memoryRetrievalNode);
    workflow.addNode("llm", unifiedLlmNode);
    workflow.addNode("selfReflection", selfReflectionNode);
    workflow.addNode("memoryStorage", memoryStorageNode);
    logger.info("Nodes added to the graph");    // Set the entrypoint
    workflow.setEntryPoint("entryPoint");
    logger.info("Entry point set");
    
    // Add edges
    workflow.addEdge("entryPoint", "memoryRetrieval");
    workflow.addEdge("memoryRetrieval", "llm");
    workflow.addEdge("llm", "selfReflection");
    workflow.addEdge("selfReflection", "memoryStorage");
    logger.info("Workflow edges configured");
    
    // Edge from Memory Storage to end
    workflow.addEdge("memoryStorage", "__end__");
    logger.info("Edge added: memoryStorage -> __end__");

    // Do not use any checkpointer for now
    logger.info("Compiling the graph without a checkpointer...");
    
    // Compile the graph with the correct API for our version
    const compiledGraph = workflow.compile();
      // Create a custom wrapper that includes our context
    const wrappedGraph = {
      invoke: async (state: AppState, config: Record<string, unknown> = {}) => {
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
            // Add the MCP manager and LLM service to the global context temporarily
          // This is not ideal but works around the limitations
          global.mcpManagerContext = manager;
          global.llmServiceContext = llmService;
          
          // Invoke the actual graph
          const result = await compiledGraph.invoke(state);
          
          // Clean up the global context
          global.mcpManagerContext = undefined;
          global.llmServiceContext = undefined;
          
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
