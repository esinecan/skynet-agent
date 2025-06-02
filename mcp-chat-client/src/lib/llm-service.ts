import { generateText, tool } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { z } from 'zod';
import { MCPManager } from './mcp-manager';
import { getAllMCPServers } from '../config/default-mcp-servers';
import { getRAGService, RAGResult } from './rag';

export interface LLMOptions {
  enableRAG?: boolean;
  sessionId?: string;
  includeMemoryContext?: boolean;
}

export type LLMProvider = 'google' | 'deepseek';

export interface LLMProviderConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
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
    
    // Default to Google if Google API key is available
    if (process.env.GOOGLE_API_KEY) return 'google';
    
    // Otherwise default to DeepSeek
    return 'deepseek';
  }

  private getDefaultModel(provider: LLMProvider): string {
    switch (provider) {
      case 'google':
        return 'gemini-2.0-flash-exp';
      case 'deepseek':
        return 'deepseek-chat';
      default:
        return 'gemini-2.0-flash-exp';
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

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  getProviderInfo(): { provider: LLMProvider; model: string } {
    return {
      provider: this.provider,
      model: this.modelName
    };
  }
  async initialize(): Promise<void> {
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
      console.log('🔍 Starting response generation for:', userMessage);
      
      // Use RAG-enhanced generation if sessionId is provided and RAG is enabled
      if (options?.sessionId && options?.enableRAG !== false) {
        const result = await this.generateResponseWithMemory(userMessage, options.sessionId, options);
        return result.text;
      }
      
      // Fall back to basic generation without memory
      const tools = await this.getAvailableTools();
      console.log('🔧 Available tools:', Object.keys(tools));
      
      const result = await generateText({
        model: this.model,
        prompt: userMessage,
        tools: tools,
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      });

      console.log('✅ Generated response:', result.text);
      console.log('🔧 Tool calls made:', result.toolCalls?.length || 0);
      
      if (result.toolCalls && result.toolCalls.length > 0) {
        console.log('🔧 Tool call details:', JSON.stringify(result.toolCalls, null, 2));
      }

      return result.text;    } catch (error) {
      console.error('❌ Error generating response:', error);
      
      // Log the full error details
      if (error instanceof Error) {
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
      }
      
      throw new Error('Failed to generate response');
    }
  }

  async getAvailableTools(): Promise<Record<string, any>> {
    console.log('🔍 Getting available tools from MCP servers...');
    const tools: Record<string, any> = {};
    const connectedServers = this.mcpManager.getConnectedServers();
    console.log('🔍 Connected servers:', connectedServers);
    
    for (const serverName of connectedServers) {
      try {
        console.log(`🔍 Getting tools from server: ${serverName}`);
        const serverTools = await this.mcpManager.listTools(serverName);
        console.log(`🔍 Server ${serverName} has ${serverTools.length} tools:`, serverTools.map(t => t.name));
        
        for (const mcpTool of serverTools) {
          const toolKey = `${serverName}_${mcpTool.name}`;
          console.log(`🔍 Processing tool: ${toolKey}`);
          console.log(`🔍 Tool schema:`, JSON.stringify(mcpTool.inputSchema, null, 2));
          
          // Convert MCP JSON Schema to Zod schema
          const parameters = this.convertJsonSchemaToZod(mcpTool.inputSchema);
          console.log(`🔍 Converted Zod schema for ${toolKey}`);
          
          tools[toolKey] = tool({
            description: mcpTool.description || `Tool ${mcpTool.name} from ${serverName}`,
            parameters: parameters,
            execute: async (args: any) => {
              console.log(`🔧 Executing tool ${serverName}_${mcpTool.name} with args:`, JSON.stringify(args, null, 2));
              try {
                const result = await this.mcpManager.callTool(serverName, mcpTool.name, args);
                console.log(`✅ Tool ${serverName}_${mcpTool.name} succeeded:`, JSON.stringify(result, null, 2));
                return result;
              } catch (error) {
                console.error(`❌ Tool ${serverName}_${mcpTool.name} failed:`, error);
                throw error;
              }
            }
          });
        }
      } catch (error) {
        console.warn(`⚠️ Failed to get tools from ${serverName}:`, error);
      }
    }    console.log('🔍 Final tool list:', Object.keys(tools));
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
      console.log('🧠 Starting RAG-enhanced response generation for:', userMessage);
      
      let ragResult: RAGResult | undefined;
      let enhancedPrompt = userMessage;
      
      // Retrieve relevant memories if RAG is enabled
      if (options.enableRAG !== false && options.includeMemoryContext !== false) {
        ragResult = await this.ragService.retrieveAndFormatContext(userMessage, sessionId);
        
        if (ragResult.shouldRetrieve && ragResult.context) {
          // Enhance the prompt with memory context
          enhancedPrompt = this.formatPromptWithMemoryContext(userMessage, ragResult.context);
          console.log('🧠 Enhanced prompt with memory context');
        }
      }
      
      // Get available tools from connected MCP servers
      const tools = await this.getAvailableTools();
      console.log('🔧 Available tools:', Object.keys(tools));
      
      const result = await generateText({
        model: this.model,
        prompt: enhancedPrompt,
        tools: tools,
        maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
        temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
      });

      console.log('✅ Generated RAG-enhanced response:', result.text);
      console.log('🔧 Tool calls made:', result.toolCalls?.length || 0);
      
      if (result.toolCalls && result.toolCalls.length > 0) {
        console.log('🔧 Tool call details:', JSON.stringify(result.toolCalls, null, 2));
      }

      return { text: result.text, ragResult };
    } catch (error) {
      console.error('❌ Error generating RAG-enhanced response:', error);
      
      // Log the full error details
      if (error instanceof Error) {
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
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
  ): Promise<void> {
    try {
      await this.ragService.storeConversation(userMessage, assistantResponse, sessionId);
      console.log('💾 Conversation stored in memory');
    } catch (error) {
      console.error('❌ Failed to store conversation in memory:', error);
      // Don't throw - memory storage failure shouldn't break the chat
    }
  }

  /**
   * Format prompt with memory context
   */
  private formatPromptWithMemoryContext(userMessage: string, memoryContext: string): string {
    return `${memoryContext}

Current user message: ${userMessage}

Please respond to the current user message, taking into account any relevant information from the previous conversations shown above.`;
  }

  /**
   * Initialize RAG service
   */
  async initializeRAG(): Promise<void> {
    try {
      await this.ragService.initialize();
      console.log('🧠 RAG service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize RAG service:', error);
      // Don't throw - RAG failure shouldn't prevent chat functionality
    }
  }
}
