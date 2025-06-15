import { LLMService, LLMProvider } from './llm-service';
import { getRAGService } from './rag';
import { getConsciousMemoryService } from './conscious-memory';
import { MotiveForceStorage } from './motive-force-storage';
import { MotiveForceConfig, DEFAULT_MOTIVE_FORCE_CONFIG } from '../types/motive-force';
import { ChatMessage } from '../lib/chat-history';

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
      // Get system prompt
      const systemPrompt = MotiveForceStorage.getSystemPrompt();
      
      // Get recent conversation context
      const recentMessages = messages
        .slice(-this.config.historyDepth)
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n\n');
      
      // Get additional context if enabled
      let additionalContext = '';
      
      if (this.config.useRag && this.ragService) {
        const lastUserMessage = messages
          .filter(m => m.role === 'user')
          .slice(-1)[0];
        
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
      
      // Build the full prompt
      const fullPrompt = `${systemPrompt}

## Current Conversation:
${recentMessages}${additionalContext}

## Task:
Based on the conversation above and any additional context, generate a single follow-up question or command that would help advance this conversation in a ${this.config.mode} manner.

Your response should be a single command or question, no explanations or additional text.`;
      
      // Generate the response
      const query = await this.llmService.generateResponse(fullPrompt);
      
      // Clean up the response
      return this.cleanGeneratedQuery(query);
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
