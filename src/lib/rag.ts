/**
 * RAG (Retrieval-Augmented Generation) orchestration for the lean MCP chat client
 * Handles memory retrieval, context formatting, and integration with the chat flow
 */

import type { MemoryRetrievalResult, MemorySearchOptions } from '../types/memory';
import { getMemoryStore } from './memory-store';
import { getEmbeddingService } from './embeddings';
import { getRAGConfig } from './rag-config';
import { summarizeText, shouldSummarize } from './text-summarizer';

export interface RAGConfig {
  enabled: boolean;
  maxMemories: number;
  minSimilarity: number;
  includeSessionContext: boolean;
  contextTemplate: string;
}

export interface RAGResult {
  shouldRetrieve: boolean;
  memories: MemoryRetrievalResult[];
  context: string;
  retrievalTime: number;
}

export class RAGService {
  private memoryStore = getMemoryStore();
  private embeddingService = getEmbeddingService();
  private defaultConfig: RAGConfig = {
    enabled: true,
    maxMemories: Number(process.env.RAG_MAX_MEMORIES) || 10,
    minSimilarity: Number(process.env.RAG_MIN_SIMILARITY) || 0.15,
    includeSessionContext: false,
    contextTemplate: `Based on previous conversations:\n\n{memories}\n\nNow respond to the current message.`
  };

  constructor(private config: Partial<RAGConfig> = {}) {
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Initialize the RAG service
   */
  async initialize(): Promise<void> {
    try {
      await this.memoryStore.initialize();
      console.log('RAG Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize RAG Service:', error);
      throw error;
    }
  }

  /**
   * Determine if memory retrieval should be performed for a given query
   */
  shouldRetrieveMemories(query: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Skip retrieval for very short queries (but make exceptions for important terms)
    if (query.trim().length < 3) {
      return false;
    }

    // List of important short terms that should always retrieve memories
    const importantTerms = ['rag', 'api', 'llm', 'mcp', 'kg', 'ui', 'db', 'cli', 'app', 'client', 'neo4j'];
    if (importantTerms.includes(query.trim().toLowerCase())) {
      return true;
    }

    // Skip retrieval for simple patterns
    const skipPatterns = [
      /^(hi|hello|hey|goodbye|thanks|thank you)$/i,
      /^(what is \d+ [\+\-\*\/] \d+)/i,
      /^\s*tell me a joke\s*$/i,
      /^\s*who are you\??\s*$/i,
      /^(help|commands?|what can you do)\??$/i,
      /^\s*how are you\??\s*$/i,
    ];
    
    const shouldSkip = skipPatterns.some(pattern => pattern.test(query.trim()));
    return !shouldSkip;
  }
  /**
   * Retrieve relevant memories for a query and format context
   */  async retrieveAndFormatContext(
    query: string, 
    sessionId?: string,
    options?: { listAll?: boolean }
  ): Promise<RAGResult> {
    const startTime = Date.now();
    
    // Handle empty query by directly retrieving memories (bypass shouldRetrieveMemories check)
    if (!query || query.trim().length === 0) {
      try {
        const searchOptions: MemorySearchOptions = {
          limit: options?.listAll ? 1000 : this.config.maxMemories, // Use higher limit for search page
          minScore: 0, // No minimum score for list all
          sessionId: this.config.includeSessionContext ? sessionId : undefined,
          messageType: 'both'
        };

        const memories = await this.memoryStore.retrieveMemories('', searchOptions);
        const context = this.formatMemoriesAsContext(memories);
        const retrievalTime = Date.now() - startTime;
        
        console.log(`RAG list all completed: ${memories.length} memories in ${retrievalTime}ms`);
        
        return {
          shouldRetrieve: true,
          memories,
          context,
          retrievalTime
        };
      } catch (error) {
        console.error('Error during RAG list all:', error);
        return {
          shouldRetrieve: true,
          memories: [],
          context: '',
          retrievalTime: Date.now() - startTime
        };
      }
    }
    
    // Check if we should retrieve memories (for non-empty queries)
    const shouldRetrieve = this.shouldRetrieveMemories(query);
    
    if (!shouldRetrieve) {
      return {
        shouldRetrieve: false,
        memories: [],
        context: '',
        retrievalTime: Date.now() - startTime
      };
    }

    try {
      // Retrieve relevant memories
      const searchOptions: MemorySearchOptions = {
        limit: this.config.maxMemories,
        minScore: this.config.minSimilarity,
        sessionId: this.config.includeSessionContext ? sessionId : undefined,
        messageType: 'both'
      };

      const memories = await this.memoryStore.retrieveMemories(query, searchOptions);
      
      // Format memories into context
      const context = this.formatMemoriesAsContext(memories);
      
      const retrievalTime = Date.now() - startTime;
      
      console.log(`RAG retrieval completed: ${memories.length} memories in ${retrievalTime}ms`);
      
      return {
        shouldRetrieve: true,
        memories,
        context,
        retrievalTime
      };
    } catch (error) {
      console.error('Error during RAG retrieval:', error);
      return {
        shouldRetrieve: true,
        memories: [],
        context: '',
        retrievalTime: Date.now() - startTime
      };
    }
  }

  /**
   * Store a conversation exchange in memory
   */  async storeConversation(
    userMessage: string,
    assistantMessage: string,
    sessionId: string
  ): Promise<{ userMemoryId: string; assistantMemoryId: string }> {
    try {
      const timestamp = Date.now(); // Use numeric timestamp
      const config = getRAGConfig();
      
      // Process user message (with potential summarization)
      let processedUserMessage = userMessage;
      if (shouldSummarize(userMessage, config.summarization)) {
        console.log(` User message (${userMessage.length} chars) exceeds threshold, summarizing...`);
        try {
          const result = await summarizeText(userMessage, {
            maxLength: Math.floor(config.summarization.threshold * 0.8),
            preserveContext: `User message in session ${sessionId}`,
            provider: config.summarization.provider
          });
          processedUserMessage = result.summary;
          console.log(` User message summarized: ${result.originalLength} → ${result.summaryLength} chars`);
        } catch (error) {
          console.warn(' User message summarization failed, storing original:', error);
        }
      }
      
      // Process assistant message (with potential summarization)
      let processedAssistantMessage = assistantMessage;
      if (shouldSummarize(assistantMessage, config.summarization)) {
        console.log(` Assistant message (${assistantMessage.length} chars) exceeds threshold, summarizing...`);
        try {
          const result = await summarizeText(assistantMessage, {
            maxLength: Math.floor(config.summarization.threshold * 0.8),
            preserveContext: `Assistant response in session ${sessionId}`,
            provider: config.summarization.provider
          });
          processedAssistantMessage = result.summary;
          console.log(` Assistant message summarized: ${result.originalLength} → ${result.summaryLength} chars`);
        } catch (error) {
          console.warn(' Assistant message summarization failed, storing original:', error);
        }
      }
      
      // Store user message
      const userMemoryId = await this.memoryStore.storeMemory(processedUserMessage, {
        sessionId,
        timestamp,
        messageType: 'user',
        textLength: processedUserMessage.length
      });
      
      // Store assistant message
      const assistantMemoryId = await this.memoryStore.storeMemory(processedAssistantMessage, {
        sessionId,
        timestamp,
        messageType: 'assistant',
        textLength: processedAssistantMessage.length
      });
      
      console.log(`Conversation stored: user=${userMemoryId}, assistant=${assistantMemoryId}`);
      
      return { userMemoryId, assistantMemoryId };
    } catch (error) {
      console.error('Failed to store conversation in memory:', error);
      throw error;
    }
  }
  /**
   * Format retrieved memories as context for the LLM
   */
  private formatMemoriesAsContext(memories: MemoryRetrievalResult[]): string {
    if (memories.length === 0) {
      return '';
    }

    const formattedMemories = memories.map((memory, index) => {
      const type = memory.metadata.messageType === 'user' ? 'User' : 'Assistant';
      const score = (memory.score * 100).toFixed(1);
      return `${index + 1}. [${type}, similarity: ${score}%]: ${memory.text}`;
    }).join('\n\n');

    const template = this.config.contextTemplate || this.defaultConfig.contextTemplate;
    return template.replace('{memories}', formattedMemories);
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(): Promise<{
    totalMemories: number;
    embeddingServiceReady: boolean;
    healthCheck: boolean;
  }> {
    try {
      const [totalMemories, healthCheck] = await Promise.all([
        this.memoryStore.getMemoryCount(),
        this.memoryStore.healthCheck()
      ]);

      return {
        totalMemories,
        embeddingServiceReady: this.embeddingService.isReady(),
        healthCheck
      };
    } catch (error) {
      console.error('Failed to get memory stats:', error);
      return {
        totalMemories: 0,
        embeddingServiceReady: false,
        healthCheck: false
      };
    }
  }

  /**
   * Test the RAG system
   */
  async testRAGSystem(): Promise<boolean> {
    try {
      console.log('Testing RAG system...');
      
      // Test memory store
      const memoryTest = await this.memoryStore.testMemorySystem();
      if (!memoryTest) {
        console.error('Memory store test failed');
        return false;
      }
      
      // Test retrieval
      const ragResult = await this.retrieveAndFormatContext('test query', 'test-session');
      
      console.log('RAG system test completed successfully');
      return true;
    } catch (error) {
      console.error('RAG system test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
let ragService: RAGService | null = null;

export function getRAGService(config?: Partial<RAGConfig>): RAGService {
  if (!ragService) {
    ragService = new RAGService(config);
  }
  return ragService;
}
