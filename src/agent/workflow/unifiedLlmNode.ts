import { AppState } from '../schemas/appStateSchema';
import { WorkflowError } from '../../utils/errorHandler';
import { McpClientManager } from '../../mcp/client';
import { createLogger } from '../../utils/logger';
import { incrementMetric } from '../../utils/health';
import { LLMService } from '../llmClient';
import { EventEmitter } from 'events';

const logger = createLogger('unifiedLlmNode');

export interface WorkflowContext {
  systemPrompt?: string;
  mcpManager?: McpClientManager;
  streaming?: boolean;
  streamEmitter?: EventEmitter;
  [key: string]: any;
}

/**
 * Unified workflow node that handles both LLM interaction and tool execution
 * Tools are executed automatically through the LLM service's native tool calling
 */
export const unifiedLlmNode = async (state: AppState, context: unknown): Promise<Partial<AppState>> => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  logger.debug('Unified LLM node started', {
    requestId,
    messageCount: state.messages?.length || 0
  });
  
  try {
    // Get context as WorkflowContext
    const contextObj = context as WorkflowContext;
      // Get MCP manager from context or global
    const mcpManager = (contextObj?.mcpManager || global.mcpManagerContext) as McpClientManager;
    if (!mcpManager) {
      throw new WorkflowError('MCPClientManager not available');
    }
    
    // Prepare system prompt with tool information
    let systemPrompt = contextObj?.systemPrompt || "You are a helpful AI assistant with advanced cognitive capabilities. Respond to the user's queries in a helpful and informative way.";
    let availableToolsCount = 0;
    
    logger.debug('Preparing system prompt with tools', {
      requestId,
      hasMcpManager: !!mcpManager
    });
    
    // Get available tools and prepare system prompt
    try {
      const toolsList = await mcpManager.listAllTools();
      availableToolsCount = toolsList.reduce((total, server) => total + (server.tools?.length || 0), 0);
      
      logger.debug('Tools retrieved for system prompt', {
        requestId,
        serverCount: toolsList.length,
        totalToolsCount: availableToolsCount
      });
      
      // Format tools for the system prompt if tools are available
      if (toolsList.length > 0 && availableToolsCount > 0) {
        let toolsPrompt = "You have access to the following tools:\n";
        
        for (const server of toolsList) {
          if (server.tools && server.tools.length > 0) {
            toolsPrompt += `\n## ${server.serverName} Server:\n`;
            for (const tool of server.tools) {
              toolsPrompt += `- ${tool.name}: ${tool.description || 'No description'}\n`;
            }
          }
        }
        
        // The LLM service will handle native tool calling, so we don't need JSON instructions
        toolsPrompt += "\nUse these tools when they would be helpful to answer the user's question.";
        systemPrompt = toolsPrompt;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Error listing tools for system prompt', {
        requestId,
        error: err.message
      });
      // Continue with default prompt if error occurs
    }
    
    // Add memory context if available
    if (state.memoryContext) {
      systemPrompt += `\n\nRelevant information from our memory:\n\n${state.memoryContext}`;
    }
    
    // Get LLM service
    const llmService = global.llmServiceContext as LLMService;    if (!llmService) {
      throw new WorkflowError('LLMService not available in global context');
    }
    
    // Track LLM call for metrics
    incrementMetric('llmCallsMade');
    
    logger.debug('Generating response with integrated tool calling', {
      requestId,
      messageCount: state.messages?.length || 0,
      hasSystemPrompt: !!systemPrompt,
      availableToolsCount
    });
    
    // Handle streaming if needed
    if (contextObj?.streaming && contextObj?.streamEmitter) {
      const emitter = contextObj.streamEmitter;
      
      // Set up callbacks for streaming
      await llmService.generateStreamingResponse(
        state.messages,
        systemPrompt,
        (content) => emitter.emit('content', { type: 'content', content }),
        (toolCall) => {
          const toolCallWithMeta = {
            id: toolCall.id || `tc_${Date.now()}`,
            server: toolCall.name?.split(':')[0] || 'unknown',
            tool: toolCall.name?.split(':')[1] || toolCall.name || 'unknown',
            args: toolCall.args || {},
            detectedAt: new Date().toISOString(),
            inProgress: true
          };
          
          emitter.emit('tool_call', { 
            type: 'toolCall', 
            status: 'started',
            toolCall: toolCallWithMeta
          });
        },
        (result) => {
          emitter.emit('tool_result', { 
            type: 'toolCall',
            status: 'completed',
            toolCall: {
              id: result.toolCallId,
              result: result.content,
              inProgress: false,
              success: true
            }
          });
        },
        (error) => emitter.emit('error', { type: 'error', error: error.message }),
        () => emitter.emit('complete', { type: 'end' })
      );
      
      // Return minimal state for streaming mode
      return {
        aiResponse: '[Streaming response in progress]'
      };
    }
    
    // For synchronous mode, use the complete response method
    // Tool calls will be executed automatically by the LLM service
    const response = await llmService.generateCompleteResponse(state.messages, systemPrompt);
    
    // Add the response to messages
    const updatedMessages = [
      ...state.messages,
      { role: "ai" as const, content: response }
    ];
    
    logger.debug('Unified LLM node completed', {
      requestId,
      responseLength: response.length,
      totalTimeMs: Date.now() - startTime
    });
    
    // Return updated state
    return {
      aiResponse: response,
      messages: updatedMessages
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    
    logger.error('Error in unified LLM node', {
      requestId,
      error: err.message,
      stack: err.stack,
      totalTimeMs: Date.now() - startTime
    });
    
    throw new WorkflowError(`Unified LLM node failed: ${err.message}`);
  }
};
