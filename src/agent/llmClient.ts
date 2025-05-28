/**
 * LLM Service for Skynet Agent - Vercel AI SDK Implementation
 * This module provides a modern streaming interface for AI interactions
 * with multi-provider support and MCP tool integration.
 */

import { streamText, CoreMessage, LanguageModelV1 } from 'ai';
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

  constructor(private mcpClientManager: McpClientManager, modelId: string = 'google:gemini-2.0-flash') {
    this.modelId = modelId;
    const [provider, modelName] = modelId.split(':');

    try {
      switch (provider) {
        case 'google':
          if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY environment variable is required for Google models');
          }
          this.llm = createGoogleGenerativeAI({ 
            apiKey: process.env.GOOGLE_API_KEY 
          })(modelName || 'gemini-2.0-flash');
          break;
        
        case 'openai':
          if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is required for OpenAI models');
          }
          this.llm = createOpenAI({ 
            apiKey: process.env.OPENAI_API_KEY 
          })(modelName || 'gpt-4o');
          break;
        
        case 'anthropic':
          if (!process.env.ANTHROPIC_API_KEY) {
            throw new Error('ANTHROPIC_API_KEY environment variable is required for Anthropic models');
          }
          this.llm = createAnthropic({ 
            apiKey: process.env.ANTHROPIC_API_KEY 
          })(modelName || 'claude-3-5-sonnet-20241022');
          break;
        
        default:
          logger.warn(`Unknown provider '${provider}', defaulting to Google Gemini`);
          if (!process.env.GOOGLE_API_KEY) {
            throw new Error('GOOGLE_API_KEY environment variable is required for default Google models');
          }
          this.llm = createGoogleGenerativeAI({ 
            apiKey: process.env.GOOGLE_API_KEY 
          })('gemini-2.0-flash');
          break;
      }
      
      logger.info(`LLMService initialized with model: ${this.modelId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to initialize LLMService: ${err.message}`);
      throw err;
    }
  }

  /**
   * Convert internal message format to Vercel AI SDK format
   */
  private convertMessages(messages: InternalMessage[]): CoreMessage[] {
    return messages.map(msg => {
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
  }

  /**
   * Prepare tools from MCP clients for Vercel AI SDK
   */
  private async prepareTools() {
    try {
      const allToolsData = await this.mcpClientManager.listAllTools();
      const tools: Record<string, any> = {};

      for (const serverData of allToolsData) {
        const { serverName, tools: serverTools } = serverData;
        
        for (const tool of serverTools) {
          const toolId = `${serverName}:${tool.name}`;
          
          tools[toolId] = {
            description: tool.description || `Tool ${tool.name} from ${serverName}`,
            parameters: {
              type: 'object',
              properties: {
                args: {
                  type: 'object',
                  description: 'Arguments for the tool'
                }
              },
              required: ['args']
            },
            execute: async (args: { args: any }) => {
              try {
                logger.debug(`Executing tool ${toolId} with args:`, args.args);
                const result = await this.mcpClientManager.callTool(serverName, tool.name, args.args);
                logger.debug(`Tool ${toolId} result:`, result);
                return result;
              } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error(`Tool execution failed for ${toolId}:`, err);
                throw err;
              }
            }
          };
        }
      }

      logger.info(`Prepared ${Object.keys(tools).length} tools for LLM`);
      return tools;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Failed to prepare tools:', err);
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
    try {
      // Convert messages to CoreMessage format
      const coreMessages = this.convertMessages(messages);
      
      // Add system message if provided
      if (systemPrompt) {
        coreMessages.unshift({
          role: 'system',
          content: systemPrompt
        });
      }

      // Prepare tools from MCP clients
      const tools = await this.prepareTools();

      logger.debug(`Generating response with ${coreMessages.length} messages and ${Object.keys(tools).length} tools`);

      // Stream response from AI SDK
      const result = await streamText({
        model: this.llm,
        messages: coreMessages,
        tools: Object.keys(tools).length > 0 ? tools : undefined,
        maxTokens: 4000,
        temperature: 0.7
      });

      return result.toDataStream();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error in LLMService.generateResponse: ${err.message}`);
      
      // Return error stream
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`Error: ${err.message}`));
          controller.close();
        }
      });
    }
  }

  /**
   * Legacy compatibility method for non-streaming responses
   */
  async generateResponseLegacy(
    messages: InternalMessage[],
    systemPrompt?: string
  ): Promise<string> {
    try {
      const stream = await this.generateResponse(messages, systemPrompt);
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value, { stream: true });
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Error in legacy response generation: ${err.message}`);
      return `Error: ${err.message}`;
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): { id: string; provider: string; model: string } {
    const [provider, model] = this.modelId.split(':');
    return {
      id: this.modelId,
      provider: provider || 'unknown',
      model: model || 'unknown'
    };
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
