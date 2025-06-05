import { generateText, tool } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { ollama } from 'ollama-ai-provider';
import { createOpenAI } from '@ai-sdk/openai'; // For OpenAI-compatible providers
import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MCPManager } from './mcp-manager';
import { getAllMCPServers } from '../config/default-mcp-servers';
import { getRAGService, RAGResult } from './rag';

export interface LLMOptions {
  enableRAG?: boolean;
  sessionId?: string;
  includeMemoryContext?: boolean;
}

export type LLMProvider = 'google' | 'deepseek' | 'openai-compatible' | 'anthropic' | 'groq' | 'mistral' | 'ollama';

export interface LLMProviderConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseURL?: string; // For OpenAI-compatible providers
}

export class LLMService {
  private mcpManager: MCPManager;
  private model: any;
  private ragService = getRAGService();
  private provider: LLMProvider;
  private modelName: string;

  constructor(config?: LLMProviderConfig) {
    this.mcpManager = new MCPManager();
    
    // Determine provider from config or environment
    this.provider = config?.provider || this.getProviderFromEnvironment();
    this.modelName = config?.model || this.getDefaultModel(this.provider);
    
    // Initialize the model based on provider
    this.model = this.initializeModel(config);
  }
  private getProviderFromEnvironment(): LLMProvider {
    // Check environment variable for provider preference
    const envProvider = process.env.LLM_PROVIDER?.toLowerCase();
    if (envProvider === 'deepseek') return 'deepseek';
    if (envProvider === 'google') return 'google';
    if (envProvider === 'openai-compatible') return 'openai-compatible';
    if (envProvider === 'anthropic') return 'anthropic';
    if (envProvider === 'groq') return 'groq';
    if (envProvider === 'mistral') return 'mistral';
    if (envProvider === 'ollama') return 'ollama';
    
    // Default to Google if Google API key is available
    if (process.env.GOOGLE_API_KEY) return 'google';
    
    // Otherwise default to DeepSeek
    return 'deepseek';
  }
  private getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
      case 'google':
        return 'gemini-2.5-flash-preview-05-20';
      case 'deepseek':
        return 'deepseek-chat';
      case 'openai-compatible':
        return 'gpt-4o-mini'; // Default OpenAI model for compatible providers
      case 'anthropic':
        return 'claude-3-5-haiku-20241022';
      case 'groq':
        return 'llama-3.3-70b-versatile';
      case 'mistral':
        return 'mistral-large-latest';
      case 'ollama':
        return 'llama3.2:latest';
      default:
        return 'gemini-2.5-flash-preview-05-20';
    }
  }
  private initializeModel(config?: LLMProviderConfig): any {
    switch (this.provider) {
      case 'google':
        const googleApiKey = config?.apiKey || process.env.GOOGLE_API_KEY;
        if (!googleApiKey) {
          throw new Error('GOOGLE_API_KEY environment variable is required for Google provider');
        }
        const google = createGoogleGenerativeAI({
          apiKey: googleApiKey
        });
        return google(this.modelName);

      case 'deepseek':
        const deepseekApiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY;
        if (!deepseekApiKey) {
          throw new Error('DEEPSEEK_API_KEY environment variable is required for DeepSeek provider');
        }
        const deepseek = createDeepSeek({
          apiKey: deepseekApiKey
        });
        return deepseek(this.modelName);

      case 'openai-compatible':
        const openaiApiKey = config?.apiKey || process.env.OPENAI_API_KEY;
        const baseURL = config?.baseURL || process.env.OPENAI_BASE_URL;
        if (!openaiApiKey) {
          throw new Error('OPENAI_API_KEY environment variable is required for OpenAI-compatible provider');
        }
        const openaiConfig: any = { apiKey: openaiApiKey };
        if (baseURL) {
          openaiConfig.baseURL = baseURL;
        }
        const openai = createOpenAI(openaiConfig);
        return openai(this.modelName);

      case 'anthropic':
        const anthropicApiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!anthropicApiKey) {
          throw new Error('ANTHROPIC_API_KEY environment variable is required for Anthropic provider');
        }
        const anthropic = createAnthropic({
          apiKey: anthropicApiKey
        });
        return anthropic(this.modelName);

      case 'groq':
        const groqApiKey = config?.apiKey || process.env.GROQ_API_KEY;
        if (!groqApiKey) {
          throw new Error('GROQ_API_KEY environment variable is required for Groq provider');
        }
        const groq = createGroq({
          apiKey: groqApiKey
        });
        return groq(this.modelName);

      case 'mistral':
        const mistralApiKey = config?.apiKey || process.env.MISTRAL_API_KEY;
        if (!mistralApiKey) {
          throw new Error('MISTRAL_API_KEY environment variable is required for Mistral provider');
        }
        const mistral = createMistral({
          apiKey: mistralApiKey
        });
        return mistral(this.modelName);      case 'ollama':
        const ollamaBaseURL = config?.baseURL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        return ollama(this.modelName);

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  getProviderInfo(): { provider: LLMProvider; model: string } {
    return {
      provider: this.provider,
      model: this.modelName
    };
  }  async initialize(): Promise<void> {
    // Connect to all configured MCP servers
    const serverConfigs = getAllMCPServers();
    
    const connectionPromises = serverConfigs.map(async (config) => {
      try {
        await this.mcpManager.connectToServer(config);
      } catch (error) {
        console.warn(`Failed to connect to MCP server ${config.name}:`, error);
      }
    });
    
    await Promise.allSettled(connectionPromises);
    console.log(`Connected to MCP servers: ${this.mcpManager.getConnectedServers().join(', ')}`);
    
    // Initialize RAG service
    await this.initializeRAG();
  }async generateResponse(userMessage: string, options?: LLMOptions): Promise<string> {
    try {
      //console.log('🔍 Starting response generation for:', userMessage);
      
      // Use RAG-enhanced generation if sessionId is provided and RAG is enabled
      if (options?.sessionId && options?.enableRAG !== false) {
        const result = await this.generateResponseWithMemory(userMessage, options.sessionId, options);
        return result.text;
      }        // Fall back to basic generation without memory
      const tools = await this.getAvailableTools();
      //console.log('🔧 Available tools:', Object.keys(tools));
      
      // Get system prompt
      const systemPrompt = this.getSystemPrompt();
      
      const result = await generateText({
        model: this.model,
        system: systemPrompt || undefined,
        prompt: userMessage,
        tools: tools,
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      });

      //console.log('✅ Generated response:', result.text);
      //console.log('🔧 Tool calls made:', result.toolCalls?.length || 0);
        if (result.toolCalls && result.toolCalls.length > 0) {
        console.log(`Tool calls: ${result.toolCalls.length}`);
      }

      return result.text;    } catch (error) {
      console.error('Error generating response:', error);
      
      // Log the full error details
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      throw new Error('Failed to generate response');
    }
  }

  async getAvailableTools(): Promise<Record<string, any>> {
    //console.log('🔍 Getting available tools from MCP servers...');
    const tools: Record<string, any> = {};
    const connectedServers = this.mcpManager.getConnectedServers();
    //console.log('🔍 Connected servers:', connectedServers);
    
    for (const serverName of connectedServers) {
      try {
        //console.log(`🔍 Getting tools from server: ${serverName}`);
        const serverTools = await this.mcpManager.listTools(serverName);
        //console.log(`🔍 Server ${serverName} has ${serverTools.length} tools:`, serverTools.map(t => t.name));
          for (const mcpTool of serverTools) {
          const toolKey = `${serverName}_${mcpTool.name}`;
          
          // Convert MCP JSON Schema to Zod schema
          const parameters = this.convertJsonSchemaToZod(mcpTool.inputSchema);tools[toolKey] = tool({
              description: mcpTool.description || `Tool ${mcpTool.name} from ${serverName}`,
              parameters: parameters,              execute: async (args: any) => {                try {
                  const result = await this.mcpManager.callTool(serverName, mcpTool.name, args);
                  
                  // Ensure we return a clean result
                  if (result && typeof result === 'object') {
                    // If the result has a content field, return that
                    if (result.content) {
                      return result.content;
                    }
                    // Otherwise return the full result but ensure it's serializable
                    return JSON.parse(JSON.stringify(result));
                  }
                  
                  return result;
                } catch (error) {
                  console.error(`TOOL_ERROR: ${serverName}_${mcpTool.name} failed`);
                  
                  // Return a structured error response instead of throwing
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  return {
                    error: true,
                    message: `Tool execution failed: ${errorMessage}`,
                    tool: `${serverName}_${mcpTool.name}`
                  };
                }
              }
            });
        }      } catch (error) {
        console.warn(`Failed to get tools from ${serverName}:`, error);
      }
    }    //console.log('🔍 Final tool list:', Object.keys(tools));
    return tools;
  }

  getModel() {
    return this.model;
  }

  private convertJsonSchemaToZod(schema: any): z.ZodSchema {
    if (!schema || !schema.properties) {
      return z.object({});
    }

    const zodProps: Record<string, z.ZodSchema> = {};
    
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as any;
      
      // Convert based on JSON Schema type
      switch (prop.type) {
        case 'string':
          zodProps[propName] = z.string();
          break;
        case 'number':
        case 'integer':
          zodProps[propName] = z.number();
          break;
        case 'boolean':
          zodProps[propName] = z.boolean();
          break;
        case 'array':
          // Handle array with proper items schema
          if (prop.items) {
            const itemSchema = this.convertJsonSchemaPropertyToZod(prop.items);
            zodProps[propName] = z.array(itemSchema);
          } else {
            zodProps[propName] = z.array(z.string()); // Default to string array
          }
          break;
        case 'object':
          if (prop.properties) {
            zodProps[propName] = this.convertJsonSchemaToZod(prop);
          } else {
            zodProps[propName] = z.object({});
          }
          break;
        default:
          zodProps[propName] = z.any();
      }
      
      // Handle optional properties
      if (!schema.required || !schema.required.includes(propName)) {
        zodProps[propName] = zodProps[propName].optional();
      }
    }
    
    return z.object(zodProps);
  }

  private convertJsonSchemaPropertyToZod(propSchema: any): z.ZodSchema {
    if (!propSchema || !propSchema.type) {
      return z.any();
    }

    switch (propSchema.type) {
      case 'string':
        return z.string();
      case 'number':
      case 'integer':
        return z.number();
      case 'boolean':
        return z.boolean();
      case 'array':
        if (propSchema.items) {
          return z.array(this.convertJsonSchemaPropertyToZod(propSchema.items));
        }
        return z.array(z.string());
      case 'object':
        if (propSchema.properties) {
          return this.convertJsonSchemaToZod(propSchema);
        }
        return z.object({});
      default:
        return z.any();
    }
  }

  async cleanup(): Promise<void> {
    await this.mcpManager.disconnectAll();
  }

  /**
   * Generate response with RAG memory enhancement
   */
  async generateResponseWithMemory(
    userMessage: string, 
    sessionId: string,
    options: LLMOptions = {}
  ): Promise<{ text: string; ragResult?: RAGResult }> {
    try {
      //console.log('🧠 Starting RAG-enhanced response generation for:', userMessage);
      
      let ragResult: RAGResult | undefined;
      let enhancedPrompt = userMessage;
      
      // Retrieve relevant memories if RAG is enabled
      if (options.enableRAG !== false && options.includeMemoryContext !== false) {
        ragResult = await this.ragService.retrieveAndFormatContext(userMessage, sessionId);
        
        if (ragResult.shouldRetrieve && ragResult.context) {
          // Enhance the prompt with memory context
          enhancedPrompt = this.formatPromptWithMemoryContext(userMessage, ragResult.context);
          //console.log('🧠 Enhanced prompt with memory context');
        }
      }
        // Get available tools from connected MCP servers
      const tools = await this.getAvailableTools();
      //console.log('🔧 Available tools:', Object.keys(tools));
      
      // Get system prompt
      const systemPrompt = this.getSystemPrompt();
      
      const result = await generateText({
        model: this.model,
        system: systemPrompt || undefined,
        prompt: enhancedPrompt,
        tools: tools,
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      });

      //console.log('✅ Generated RAG-enhanced response:', result.text);
      //console.log('🔧 Tool calls made:', result.toolCalls?.length || 0);
        if (result.toolCalls && result.toolCalls.length > 0) {
        console.log(`RAG tool calls: ${result.toolCalls.length}`);
      }

      return { text: result.text, ragResult };
    } catch (error) {
      console.error('Error generating RAG-enhanced response:', error);
      
      // Log the full error details
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      throw new Error('Failed to generate response');
    }
  }

  /**
   * Store conversation in memory after successful response
   */
  async storeConversationInMemory(
    userMessage: string,
    assistantResponse: string,
    sessionId: string
  ): Promise<void> {    try {
      await this.ragService.storeConversation(userMessage, assistantResponse, sessionId);
    } catch (error) {
      console.error('Failed to store conversation in memory:', error);
      // Don't throw - memory storage failure shouldn't break the chat
    }
  }

  /**
   * Read system prompt from system-prompt.md file
   */
  private getSystemPrompt(): string {
    try {
      const systemPromptPath = join(process.cwd(), 'system-prompt.md');
      const content = readFileSync(systemPromptPath, 'utf-8').trim();
      
      if (content) {
        //console.log('📝 Loaded system prompt from system-prompt.md');
        return content;
      } else {
        //console.log('📝 system-prompt.md is empty, using no system prompt');
        return '';
      }
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        //console.log('📝 system-prompt.md not found, using no system prompt');
      } else {
        console.warn('📝 Error reading system-prompt.md:', error);
      }
      return '';
    }
  }

  /**
   * Format prompt with system instructions only (no memory context)
   */
  private formatPrompt(userMessage: string): string {
    const systemPrompt = this.getSystemPrompt();
    
    if (systemPrompt) {
      return `${systemPrompt}\n\nUser: ${userMessage}`;
    } else {
      return userMessage;
    }
  }
  /**
   * Format prompt with memory context (system prompt is handled separately)
   */  private formatPromptWithMemoryContext(userMessage: string, memoryContext: string): string {
    let prompt = '';
    
    // Add memory context
    prompt += `${memoryContext}\n\n`;
    
    // Add current user message
    prompt += `Current user message: ${userMessage}\n\n`;
    prompt += `Please respond to the current user message, taking into account any relevant information from the previous conversations shown above.`;
    
    return prompt;
  }

  /**
   * Initialize RAG service
   */  async initializeRAG(): Promise<void> {
    try {
      await this.ragService.initialize();
      console.log('RAG service initialized');
    } catch (error) {
      console.error('Failed to initialize RAG service:', error);
      // Don't throw - RAG failure shouldn't prevent chat functionality
    }
  }
}
