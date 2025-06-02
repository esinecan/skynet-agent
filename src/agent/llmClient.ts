/**
 * LLM Service for Skynet Agent - Vercel AI SDK Implementation
 * This module provides a modern streaming interface for AI interactions
 * with multi-provider support and MCP tool integration.
 */

import { streamText, generateText, CoreMessage, LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createLogger } from '../utils/logger';
import { McpClientManager } from '../mcp/client';
import type { Message as InternalMessage } from './schemas/appStateSchema';

const logger = createLogger('llmService');

export class LLMService {
  private llm: LanguageModelV1;
  private modelId: string;

  constructor(private mcpClientManager: McpClientManager, modelId: string = 'google:gemini-2.5-flash-preview-05-20') {
    const startTime = Date.now();
    this.modelId = modelId;
    const [provider, modelName] = modelId.split(':');
    
    logger.debug(`LLMService construction started`, {
      modelId,
      provider,
      modelName: modelName || 'default',
      mcpClientManagerAvailable: !!mcpClientManager
    });

    try {
      switch (provider) {
        case 'google':
          if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY environment variable is required for Google models');
          }
          logger.debug(`Initializing Google Generative AI with model: ${modelName || 'gemini-2.0-flash'}`);
          this.llm = createGoogleGenerativeAI({ 
            apiKey: process.env.GOOGLE_API_KEY 
          })(modelName || 'gemini-2.0-flash');
          break;
        
        case 'openai':
          if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is required for OpenAI models');
          }
          logger.debug(`Initializing OpenAI with model: ${modelName || 'gpt-4o'}`);
          this.llm = createOpenAI({ 
            apiKey: process.env.OPENAI_API_KEY 
          })(modelName || 'gpt-4o');
          break;
        
        case 'anthropic':
          if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error('ANTHROPIC_API_KEY environment variable is required for Anthropic models');
          }
          logger.debug(`Initializing Anthropic with model: ${modelName || 'claude-3-5-sonnet-20241022'}`);
          this.llm = createAnthropic({ 
            apiKey: process.env.ANTHROPIC_API_KEY 
          })(modelName || 'claude-3-5-sonnet-20241022');
          break;
        
        default:
          logger.warn(`Unknown provider '${provider}', defaulting to Google Gemini`);
          logger.debug('Provider fallback details', {
            originalProvider: provider,
            fallbackProvider: 'google',
            fallbackModel: 'gemini-2.0-flash'
          });
          if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY environment variable is required for default Google models');
          }
          this.llm = createGoogleGenerativeAI({ 
            apiKey: process.env.GOOGLE_API_KEY 
          })('gemini-2.0-flash');
          break;
      }
      
      const initTime = Date.now() - startTime;
      logger.info(`LLMService initialized with model: ${this.modelId}`);
      logger.debug('LLMService construction completed', {
        modelId: this.modelId,
        provider,
        initializationTimeMs: initTime,
        llmInstanceCreated: !!this.llm
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const initTime = Date.now() - startTime;
      logger.error(`Failed to initialize LLMService: ${err.message}`, {
        modelId: this.modelId,
        provider,
        initializationTimeMs: initTime,
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Convert internal message format to Vercel AI SDK format
   */
  private convertMessages(messages: InternalMessage[]): CoreMessage[] {
    const startTime = Date.now();
    logger.debug('Converting messages for LLM processing', {
      messageCount: messages.length,
      messageTypes: messages.map(m => m.role)
    });

    const converted = messages.map(msg => {
      let role: 'user' | 'assistant' | 'system';
      
      switch (msg.role) {
        case 'human':
          role = 'user';
          break;
        case 'ai':
          role = 'assistant';
          break;
        case 'system':
          role = 'system';
          break;
        default:
          role = 'user';
      }

      return {
        role,
        content: msg.content
      };
    });

    const conversionTime = Date.now() - startTime;
    logger.debug('Message conversion completed', {
      originalCount: messages.length,
      convertedCount: converted.length,
      conversionTimeMs: conversionTime,
      totalContentLength: messages.reduce((sum, msg) => sum + msg.content.length, 0)
    });

    return converted;
  }
  /**
   * Prepare tools from MCP clients for Vercel AI SDK with enhanced validation
   */
  private async prepareTools() {
    const startTime = Date.now();
    logger.debug('Starting tool preparation from MCP clients');

    try {
      const tools: Record<string, {
        description: string;
        parameters: any;
        execute: (args: any) => Promise<any>;
      }> = {};

      // Get all connected MCP clients
      const allMcpTools = await this.mcpClientManager.listAllTools();
      logger.debug(`Found ${allMcpTools.length} MCP servers with tools`);
      
      for (const { serverName, tools: serverTools } of allMcpTools) {
        logger.debug(`Processing ${serverTools.length} tools from ${serverName}`);
        
        for (const tool of serverTools) {
          const toolId = `${serverName}:${tool.name}`;
          logger.debug('Processing tool', {
            toolId,
            toolName: tool.name,
            hasInputSchema: !!tool.inputSchema,
            inputSchemaType: typeof tool.inputSchema,
            toolKeys: Object.keys(tool)
          });          // Validate and sanitize the schema
          const { validateAndSanitizeSchema } = await import('../mcp/toolValidator.js');
          const cleanedParameters = validateAndSanitizeSchema(tool.inputSchema);
          
          logger.debug('Tool parameters validated and cleaned', {
            toolId,
            originalSchemaType: typeof tool.inputSchema,
            cleanedSchemaType: typeof cleanedParameters,
            hasType: !!cleanedParameters.type,
            hasProperties: !!cleanedParameters.properties
          });

          tools[toolId] = {
            description: tool.description || `Tool ${tool.name} from ${serverName}`,
            parameters: cleanedParameters,
            execute: async (args: any) => {
              const execStartTime = Date.now();
              try {
                logger.debug('Executing tool', {
                  toolId,
                  argsKeys: Object.keys(args || {}),
                  argsSize: JSON.stringify(args).length
                });
                
                const result = await this.mcpClientManager.callTool(serverName, tool.name, args);
                const execTime = Date.now() - execStartTime;
                
                logger.debug('Tool execution completed', {
                  toolId,
                  executionTimeMs: execTime,
                  resultType: typeof result,
                  resultSize: JSON.stringify(result).length
                });
                
                return result;
              } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                const execTime = Date.now() - execStartTime;
                logger.error('Tool execution failed', {
                  toolId,
                  executionTimeMs: execTime,
                  error: err.message,
                  args: args
                });
                throw err;
              }
            }
          };
        }

        logger.debug(`Successfully processed tools from ${serverName}`, {
          toolCount: serverTools.length,
          toolNames: serverTools.map(t => t.name)
        });
      }

      const totalPrepTime = Date.now() - startTime;
      const toolCount = Object.keys(tools).length;
      
      logger.info(`Prepared ${toolCount} tools for LLM`, {
        timeMs: totalPrepTime
      });
      logger.debug('Tool preparation completed', {
        totalToolCount: toolCount,
        totalPrepTimeMs: totalPrepTime,
        avgTimePerTool: toolCount > 0 ? totalPrepTime / toolCount : 0,
        toolIds: Object.keys(tools)
      });
      
      return tools;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const totalPrepTime = Date.now() - startTime;
      logger.error('Failed to prepare tools', {
        prepTimeMs: totalPrepTime,
        error: err.message,
        stack: err.stack
      });
      return {};
    }
  }

  /**
   * Generate response using new AI SDK with streaming support
   */
  async generateResponse(
    messages: InternalMessage[],
    systemPrompt?: string
  ): Promise<ReadableStream> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    // Create a preview for each message: take the first 10 characters and append an ellipsis.
    const messagesPreview = `[${messages
      .map(msg => `{${msg.content.substring(0, 10)}...}`)
      .join(', ')}]`;

    logger.debug('LLM response generation started', {
      requestId,
      messageCount: messages.length,
      hasSystemPrompt: !!systemPrompt,
      systemPromptLength: systemPrompt?.length || 0,
      totalInputLength:
        messages.reduce((sum, msg) => sum + msg.content.length, 0) +
        (systemPrompt?.length || 0),
      messagesPreview,
    });

    try {
      // Define an empty tools object since we're handling tool calls in the workflow
      const tools: Record<string, any> = {};
      
      // Convert messages to CoreMessage format
      const coreMessages = this.convertMessages(messages);
      const conversionTime = Date.now() - startTime;
      
      // Add system message if provided
      if (systemPrompt) {
        coreMessages.unshift({
          role: 'system',
          content: systemPrompt
        });
        logger.debug('System prompt added to conversation', {
          requestId,
          systemPromptLength: systemPrompt.length,
          totalMessages: coreMessages.length
        });
      }

      // Skip tool preparation - we handle tool calling manually in the workflow
      logger.debug('Generating LLM response (tools handled in workflow)', {
        requestId,
        messageCount: coreMessages.length,
        modelId: this.modelId
      });

      // Stream response from AI SDK
      // Don't pass tools - we'll handle tool calling manually in the workflow
      const streamStartTime = Date.now();
      const result = await streamText({
        model: this.llm,
        messages: coreMessages
      });

      const streamSetupTime = Date.now() - streamStartTime;
      const totalSetupTime = Date.now() - startTime;
      
      logger.debug('LLM stream initialized', {
        requestId,
        streamSetupTimeMs: streamSetupTime,
        totalSetupTimeMs: totalSetupTime,
        efficiency: `${Math.round((messages.reduce((sum, msg) => sum + msg.content.length, 0) / totalSetupTime) * 1000)} chars/sec setup`
      });

      // Log the actual request being sent to the model
      logger.debug('LLM request details', {
        requestId,
        modelId: this.modelId,
        messageCount: coreMessages.length,
        messages: coreMessages.map(msg => ({
          role: msg.role,
          contentLength: typeof msg.content === 'string' ? msg.content.length : 'non-string',
          contentPreview: typeof msg.content === 'string' ? 
            `${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}` : 
            'non-string content'
        })),
        hasTools: Object.keys(tools).length > 0,
        toolCount: Object.keys(tools).length
      });

      logger.info('LLM response stream initiated.');
      return result.textStream;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const totalTime = Date.now() - startTime;
      
      logger.error('Error in LLM response generation', {
        requestId,
        totalTimeMs: totalTime,
        error: err.message,
        messageCount: messages.length,
        modelId: this.modelId,
        stack: err.stack
      });
      
      // Return error stream
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          const errorMessage = `Error: ${err.message}`;
          logger.debug('Returning error stream', {
            requestId,
            errorMessage,
            errorLength: errorMessage.length
          });
          controller.enqueue(encoder.encode(errorMessage));
          controller.close();
        }
      });
    }
  }
  /**
   * Generate complete text response with native tool calling
   */
  async generateCompleteResponse(
    messages: InternalMessage[],
    systemPrompt?: string
  ): Promise<string> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    logger.debug('Synchronous LLM response generation started', {
      requestId,
      messageCount: messages.length,
      hasSystemPrompt: !!systemPrompt
    });

    try {
      // Prepare tools from MCP clients
      const tools = await this.prepareTools();
      
      // Convert messages to CoreMessage format
      const coreMessages: CoreMessage[] = this.convertMessages(messages);
      
      // Add system message if provided
      if (systemPrompt) {
        coreMessages.unshift({
          role: 'system',
          content: systemPrompt
        });
      }

      logger.debug('Generating LLM response with tools', {
        requestId,
        modelId: this.modelId,
        toolCount: Object.keys(tools).length
      });

      // Send request to LLM with tools
      const response = await generateText({
        model: this.llm,
        messages: coreMessages,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
        toolChoice: Object.keys(tools).length > 0 ? 'auto' : undefined
      });
      
      const totalTime = Date.now() - startTime;
      logger.debug('LLM response completed', {
        requestId,
        toolCallCount: response.toolCalls?.length || 0,
        responseLength: response.text.length,
        totalTimeMs: totalTime
      });

      return response.text;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Error generating LLM response', {
        requestId,
        totalTimeMs: Date.now() - startTime,
        error: err.message
      });
      
      throw err;
    }
  }

  /**
   * Generate streaming response with tool calls
   */
  async generateStreamingResponse(
    messages: InternalMessage[],
    systemPrompt?: string,
    onContent?: (content: string) => void,
    onToolCall?: (toolCall: any) => void,
    onToolResult?: (result: any) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): Promise<void> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    logger.debug('Streaming LLM response generation started', {
      requestId,
      messageCount: messages.length,
      hasSystemPrompt: !!systemPrompt
    });
    
    try {
      // Prepare tools from MCP clients
      const tools = await this.prepareTools();
      
      // Convert messages to CoreMessage format
      const coreMessages: CoreMessage[] = this.convertMessages(messages);
      
      // Add system message if provided
      if (systemPrompt) {
        coreMessages.unshift({
          role: 'system',
          content: systemPrompt
        });
      }
      
      // Create stream with tool calling support
      const result = await streamText({
        model: this.llm,
        messages: coreMessages,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
        toolChoice: Object.keys(tools).length > 0 ? 'auto' : undefined
      });
      
      // Process the stream
      for await (const chunk of result.textStream) {
        if (onContent) {
          onContent(chunk);
        }
      }
        // Handle tool calls if any - wait for the promise to resolve
      const toolCalls = await result.toolCalls;
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          if (onToolCall) {
            onToolCall(toolCall);
          }
          
          // Note: In the Vercel AI SDK, tool execution is handled automatically
          // during the generation process, so we don't need to manually execute here
          if (onToolResult) {
            onToolResult({ toolCallId: toolCall.toolCallId, executed: true });
          }
        }
      }
      
      // Stream completed
      if (onComplete) {
        onComplete();
      }
      
      logger.debug('Streaming LLM response completed', {
        requestId,
        totalTimeMs: Date.now() - startTime
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      logger.error('Error in streaming LLM response', {
        requestId,
        totalTimeMs: Date.now() - startTime,
        error: err.message
      });
      
      if (onError) {
        onError(err);
      }
    }
  }


  /**
   * Legacy compatibility method for non-streaming responses
   */
  async generateResponseLegacy(
    messages: InternalMessage[],
    systemPrompt?: string
  ): Promise<string> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    
    logger.debug('Legacy LLM response generation started', {
      requestId,
      messageCount: messages.length,
      hasSystemPrompt: !!systemPrompt,
      totalInputLength: messages.reduce((sum, msg) => sum + msg.content.length, 0) + (systemPrompt?.length || 0)
    });

    try {
      // Convert messages to CoreMessage format
      const coreMessages = this.convertMessages(messages);
      if (systemPrompt) {
        coreMessages.unshift({
          role: 'system',
          content: systemPrompt
        });
      }

      // Skip tool preparation - we handle tool calling manually in the workflow
      
      // Use streamText directly for legacy mode
      // Don't pass tools - we'll handle tool calling manually in the workflow
      const result = await streamText({
        model: this.llm,
        messages: coreMessages
      });

      // Get the full text response
      const fullText = await result.text;
      
      const totalTime = Date.now() - startTime;
      logger.debug('Legacy LLM response completed', {
        requestId,
        totalTimeMs: totalTime,
        resultLength: fullText.length
      });

      return fullText;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const totalTime = Date.now() - startTime;
      
      logger.error('Error in legacy response generation', {
        requestId,
        totalTimeMs: totalTime,
        error: err.message,
        messageCount: messages.length
      });
      
      return `Error: ${err.message}`;
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): { id: string; provider: string; model: string } {
    const [provider, model] = this.modelId.split(':');
    const modelInfo = {
      id: this.modelId,
      provider: provider || 'unknown',
      model: model || 'unknown'
    };
    
    logger.debug('Model information requested', modelInfo);
    return modelInfo;
  }
}

// Legacy export for compatibility - will be replaced in workflow
export async function generateResponse(
  messages: InternalMessage[],
  systemPrompt?: string
): Promise<string> {
  logger.warn('Using deprecated generateResponse function. Please migrate to LLMService class.');
  
  // This is a temporary compatibility shim
  // In practice, the workflow should be updated to use LLMService directly
  try {
    // We need to create a temporary service instance
    // This assumes mcpClientManager is available globally or we need to refactor
    throw new Error('Legacy generateResponse function requires migration to LLMService. Please update the calling code.');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`Legacy generateResponse error: ${err.message}`);
    return `Error: Migration required - ${err.message}`;
  }
}
