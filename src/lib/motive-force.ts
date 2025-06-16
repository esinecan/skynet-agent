import { LLMService, LLMProvider } from './llm-service';
import { getRAGService } from './rag';
import { getConsciousMemoryService } from './conscious-memory';
import { MotiveForceStorage } from './motive-force-storage';
import { MotiveForceConfig, DEFAULT_MOTIVE_FORCE_CONFIG } from '../types/motive-force';
import { ChatMessage } from '../lib/chat-history';
import { streamText } from 'ai';

export class MotiveForceService {
  private static instance: MotiveForceService;
  private llmService: LLMService;
  private ragService = getRAGService();
  private memoryService = getConsciousMemoryService();
  private initialized = false;
  
  private constructor(private config: MotiveForceConfig) {
    this.llmService = new LLMService({
      provider: config.provider || 'google',
      model: config.model || 'gemini-2.5-flash-preview-05-20'
    });
  }
  
  static getInstance(config?: Partial<MotiveForceConfig>): MotiveForceService {
    if (!MotiveForceService.instance) {
      MotiveForceService.instance = new MotiveForceService({
        ...DEFAULT_MOTIVE_FORCE_CONFIG,
        ...config
      });
    }
    return MotiveForceService.instance;
  }
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.llmService.initialize();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize MotiveForce service:', error);
      throw error;
    }
  }
    async generateNextQuery(
    messages: ChatMessage[],
    sessionId: string
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }
      try {
      // Get the base system prompt from motive-force-prompt.md
      const baseSystemPrompt = MotiveForceStorage.getSystemPrompt();
      
      // Get the last user message before motive force takes over
      const lastUserMessage = messages
        .filter(m => m.role === 'user')
        .slice(-1)[0];
      
      // Get additional context if enabled
      let additionalContext = '';
      
      if (this.config.useRag && this.ragService) {
        if (lastUserMessage) {
          const ragResult = await this.ragService.retrieveAndFormatContext(
            lastUserMessage.content
          );
          
          if (ragResult.memories.length > 0) {
            additionalContext += '\n\n## Relevant Context from Memory:\n';
            additionalContext += ragResult.memories
              .map(r => `- ${r.text}`)
              .join('\n');
          }
        }
      }
      
      if (this.config.useConsciousMemory && this.memoryService) {
        const recentMessages = messages
          .slice(-this.config.historyDepth)
          .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
          .join('\n\n');
          
        const memories = await this.memoryService.searchMemories(
          recentMessages.slice(-200), // Last 200 chars as query
          {
            limit: 3,
            importanceMin: 5
          }
        );
        
        if (memories.length > 0) {
          additionalContext += '\n\n## Conscious Memories:\n';
          additionalContext += memories
            .map(m => `- ${m.text}`)
            .join('\n');
        }
      }
      
      // Construct the enhanced system prompt by appending user context to the base prompt
      const userContextSection = `\n\n---\n\n## Context: Last Message from User Before You Took Over for Them

The last message from the user before you took over for them was: "${lastUserMessage?.content || 'No previous user message found'}"

You should act as the human user of the system and continue their conversation as if you were them.${additionalContext ? '\n\n' + additionalContext : ''}`;
      
      const enhancedSystemPrompt = baseSystemPrompt + userContextSection;

      // Convert ChatMessage[] to proper message format, excluding the last user message to avoid duplication
      const conversationMessages = messages
        .slice(-this.config.historyDepth)
        .slice(0, -1) // Remove last message since it's now in system prompt
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));

      const formattedMessages = [
        { role: 'system' as const, content: enhancedSystemPrompt },
        ...conversationMessages
      ];
      
      // Get model without tools to avoid naming issues
      const { model } = await this.llmService.getModelAndTools(false);
        const streamOptions = {
        model,
        messages: formattedMessages,
        temperature: this.config.temperature || 0.7,
        maxTokens: 8000,
      };
      
      // Stream the response
      let resultText = '';
      try {
        const result = await streamText(streamOptions);
        
        for await (const chunk of result.textStream) {
          resultText += chunk;
        }
      } catch (streamError) {
        console.error('Streaming failed:', streamError);
        throw streamError;
      }
      
      // Clean up the response
      return this.cleanGeneratedQuery(resultText);
    } catch (error) {
      console.error('Error generating next query:', error);
      throw error;
    }
  }
  
  private cleanGeneratedQuery(query: string): string {
    return query
      .trim()
      .replace(/^("|'|`)|("|'|`)$/g, '')
      .replace(/^(Question|Command|Follow-up|Response|Query|Next):\s*/i, '')
      .replace(/^\[.*?\]\s*/, '') // Remove [Autopilot] or similar prefixes
      .trim();
  }
  
  updateConfig(config: Partial<MotiveForceConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update LLM service if provider/model changed
    if (config.provider || config.model) {
      this.llmService = new LLMService({
        provider: config.provider || this.config.provider || 'google',
        model: config.model || this.config.model || 'gemini-2.5-flash-preview-05-20'
      });
      this.initialized = false;
    }
  }
  
  getConfig(): MotiveForceConfig {
    return { ...this.config };
  }
}

export function getMotiveForceService(config?: Partial<MotiveForceConfig>): MotiveForceService {
  return MotiveForceService.getInstance(config);
}
