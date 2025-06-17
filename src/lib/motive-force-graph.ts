import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, AIMessage, HumanMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import {
  MotiveForceGraphState,
  MotiveForceRoute,
  MotiveForceGraphConfig,
  SessionMetadata
} from "../types/motive-force-graph";
import { LLMService, LLMProvider, LLMProviderConfig } from './llm-service';
import { getRAGService } from './rag';
import { getConsciousMemoryService } from './conscious-memory';
import { MotiveForceStorage } from './motive-force-storage';
import { streamText } from 'ai';

// For now, we'll create a simplified graph structure
// that works with the current LangGraph version

export type MotiveForceState = MotiveForceGraphState;

// Default configuration
export const defaultMotiveForceConfig: MotiveForceGraphConfig = {
  maxStepsPerSession: 50,
  maxDurationMinutes: 60,
  userCheckinInterval: 10,
  reflectionInterval: 15,
  errorThreshold: 5,
  retryLimit: 3,
  memoryRetrievalLimit: 10,
  parallelToolExecution: false,
  aggressiveness: 'balanced',
  purposeTypes: ['research', 'productivity', 'learning', 'creative', 'analysis', 'maintenance', 'custom'],
  enableLearning: true,
  enableReflection: true,
  enableUserCheckins: true,
};

// Simple function-based workflow that mimics LangGraph behavior
export class MotiveForceWorkflow {
  private config: MotiveForceGraphConfig;
  private llmService: LLMService;
  private ragService = getRAGService();
  private memoryService = getConsciousMemoryService();
  private initialized = false;

  constructor(config: MotiveForceGraphConfig = defaultMotiveForceConfig) {
    this.config = config;
    // Initialize LLM service with motive force specific configuration
    const motiveForceConfig = this.getMotiveForceModelConfig();
    this.llmService = new LLMService(motiveForceConfig);
  }

  /**
   * Get motive force specific model configuration from environment variables
   * Falls back to main LLM configuration if no motive force specific config is found
   */
  private getMotiveForceModelConfig(): LLMProviderConfig | undefined {
    // Check for motive force specific configuration first
    const motiveForceProvider = this.getMotiveForceProviderFromEnvironment();
    const motiveForceModel = this.getMotiveForceDefaultModel(motiveForceProvider);
    
    // If we have motive force specific settings, use them
    if (motiveForceProvider !== this.getMainProviderFromEnvironment() || 
        motiveForceModel !== this.getMainDefaultModel(this.getMainProviderFromEnvironment())) {
      
      const config: LLMProviderConfig = {
        provider: motiveForceProvider,
        model: motiveForceModel
      };

      // Add API key based on provider
      switch (motiveForceProvider) {
        case 'google':
          config.apiKey = process.env.MOTIVE_FORCE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
          break;
        case 'deepseek':
          config.apiKey = process.env.MOTIVE_FORCE_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY;
          break;
        case 'openai-compatible':
          config.apiKey = process.env.MOTIVE_FORCE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
          config.baseURL = process.env.MOTIVE_FORCE_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;
          break;
        case 'anthropic':
          config.apiKey = process.env.MOTIVE_FORCE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
          break;
        case 'groq':
          config.apiKey = process.env.MOTIVE_FORCE_GROQ_API_KEY || process.env.GROQ_API_KEY;
          break;
        case 'mistral':
          config.apiKey = process.env.MOTIVE_FORCE_MISTRAL_API_KEY || process.env.MISTRAL_API_KEY;
          break;
        case 'ollama':
          config.baseURL = process.env.MOTIVE_FORCE_OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
          break;
      }

      return config;
    }

    // Return undefined to use default configuration
    return undefined;
  }

  /**
   * Get motive force provider from environment, fallback to main provider
   */
  private getMotiveForceProviderFromEnvironment(): LLMProvider {
    const envProvider = process.env.MOTIVE_FORCE_LLM_PROVIDER?.toLowerCase() || 
                       process.env.LLM_PROVIDER?.toLowerCase();
    
    if (envProvider === 'deepseek') return 'deepseek';
    if (envProvider === 'google') return 'google';
    if (envProvider === 'openai-compatible') return 'openai-compatible';
    if (envProvider === 'anthropic') return 'anthropic';
    if (envProvider === 'groq') return 'groq';
    if (envProvider === 'mistral') return 'mistral';
    if (envProvider === 'ollama') return 'ollama';
    
    // Default to Google
    return 'google';
  }

  /**
   * Get main provider from environment for comparison
   */
  private getMainProviderFromEnvironment(): LLMProvider {
    const envProvider = process.env.LLM_PROVIDER?.toLowerCase();
    
    if (envProvider === 'deepseek') return 'deepseek';
    if (envProvider === 'google') return 'google';
    if (envProvider === 'openai-compatible') return 'openai-compatible';
    if (envProvider === 'anthropic') return 'anthropic';
    if (envProvider === 'groq') return 'groq';
    if (envProvider === 'mistral') return 'mistral';
    if (envProvider === 'ollama') return 'ollama';
    
    return 'google';
  }

  /**
   * Get motive force model name, fallback to main model
   */
  private getMotiveForceDefaultModel(provider: LLMProvider): string {
    const envModel = process.env.MOTIVE_FORCE_LLM_MODEL || process.env.LLM_MODEL;
    if (envModel) return envModel;

    // Default models per provider
    switch (provider) {
      case 'google':
        return 'gemini-2.5-flash-preview-05-20';
      case 'deepseek':
        return 'deepseek-chat';
      case 'openai-compatible':
        return 'gpt-4o-mini';
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

  /**
   * Get main model name for comparison
   */
  private getMainDefaultModel(provider: LLMProvider): string {
    const envModel = process.env.LLM_MODEL;
    if (envModel) return envModel;

    switch (provider) {
      case 'google':
        return 'gemini-2.5-flash-preview-05-20';
      case 'deepseek':
        return 'deepseek-chat';
      case 'openai-compatible':
        return 'gpt-4o-mini';
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

  /**
   * Get information about the current motive force configuration
   */
  getConfigurationInfo(): {
    provider: LLMProvider;
    model: string;
    usingCustomConfig: boolean;
    availableEnvVars: string[];
  } {
    const providerInfo = this.llmService.getProviderInfo();
    const mainProvider = this.getMainProviderFromEnvironment();
    const mainModel = this.getMainDefaultModel(mainProvider);
    
    const usingCustomConfig = providerInfo.provider !== mainProvider || 
                             providerInfo.model !== mainModel;
    
    return {
      provider: providerInfo.provider,
      model: providerInfo.model,
      usingCustomConfig,
      availableEnvVars: [
        'MOTIVE_FORCE_LLM_PROVIDER',
        'MOTIVE_FORCE_LLM_MODEL',
        `MOTIVE_FORCE_${providerInfo.provider.toUpperCase()}_API_KEY`,
        ...(providerInfo.provider === 'openai-compatible' ? ['MOTIVE_FORCE_OPENAI_BASE_URL'] : []),
        ...(providerInfo.provider === 'ollama' ? ['MOTIVE_FORCE_OLLAMA_BASE_URL'] : [])
      ]
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.llmService.initialize();
      
      // Log the model configuration being used by motive force
      const configInfo = this.getConfigurationInfo();
      console.log(`[MotiveForce] Initialized with provider: ${configInfo.provider}, model: ${configInfo.model}`);
      console.log(`[MotiveForce] Using ${configInfo.usingCustomConfig ? 'CUSTOM' : 'DEFAULT'} configuration`);
      
      if (configInfo.usingCustomConfig) {
        console.log(`[MotiveForce] Available env vars for custom config: ${configInfo.availableEnvVars.join(', ')}`);
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize MotiveForce LLM service:', error);
      throw error;
    }
  }

  async invoke(initialState: MotiveForceState, options?: { configurable?: { thread_id: string } }): Promise<MotiveForceState> {
    console.log("---STARTING MOTIVE FORCE WORKFLOW---");
    
    // Initialize LLM service if not already done
    if (!this.initialized) {
      await this.initialize();
    }
    
    let currentState = { ...initialState };
    let currentStep = 0;
    const maxSteps = 10; // Prevent infinite loops
    
    while (currentStep < maxSteps && !currentState.emergencyStop) {
      const nextNode = this.shouldContinue(currentState);
      
      if (nextNode === '__end__') {
        console.log("Workflow completed");
        break;
      }
      
      console.log(`Executing node: ${nextNode}`);
      
      try {
        currentState = await this.executeNode(nextNode, currentState);
        currentStep++;
        
        // Update step count
        currentState.sessionMetadata = {
          ...currentState.sessionMetadata,
          totalSteps: currentStep,
          lastActiveAt: new Date(),
        };
        
      } catch (error) {
        console.error(`Error in node ${nextNode}:`, error);
        currentState.errorCount = currentState.errorCount + 1;
        currentState.lastError = error instanceof Error ? error.message : 'Unknown error';
        
        if (currentState.errorCount >= this.config.errorThreshold) {
          console.log("Too many errors, stopping workflow");
          break;
        }
      }
    }
    
    console.log("---WORKFLOW COMPLETED---");
    return currentState;
  }

  private shouldContinue(state: MotiveForceState): MotiveForceRoute {
    // Emergency stop check
    if (state.emergencyStop) {
      return '__end__';
    }
    
    // Session limits check
    if (state.sessionMetadata.totalSteps >= this.config.maxStepsPerSession) {
      return '__end__';
    }
    
    // Duration check
    const sessionDuration = Date.now() - state.sessionMetadata.startedAt.getTime();
    if (sessionDuration > this.config.maxDurationMinutes * 60 * 1000) {
      return '__end__';
    }

    // Check if we've already generated a motive force query
    // Look for a specific marker in workingMemory to know if query was generated
    if (state.workingMemory.motiveForceQueryGenerated === true) {
      return '__end__';
    }
    
    // Check if purpose is defined
    if (!state.currentPurpose) {
      return 'purpose_analyzer';
    }
    
    // Check if plan exists
    if (state.subgoals.length === 0) {
      return 'plan_generator';
    }
    
    // Check if context is gathered
    if (state.contextualMemories.length === 0) {
      return 'context_gatherer';
    }
    
    // Always go to query generator after context gathering
    // This ensures motive force generates its own response
    return 'query_generator';
    

  }

  private async executeNode(nodeType: string, state: MotiveForceState): Promise<MotiveForceState> {
    switch (nodeType) {
      case 'purpose_analyzer':
        return this.purposeAnalyzerNode(state);
      case 'plan_generator':
        return this.planGeneratorNode(state);
      case 'context_gatherer':
        return this.contextGathererNode(state);
      case 'tool_orchestrator':
        return this.toolOrchestratorNode(state);
      case 'progress_monitor':
        return this.progressMonitorNode(state);
      case 'reflection_engine':
        return this.reflectionEngineNode(state);
      case 'user_checkin':
        return this.userCheckinNode(state);
      case 'query_generator':
        return this.queryGeneratorNode(state);
      default:
        throw new Error(`Unknown node type: ${nodeType}`);
    }
  }

  private async purposeAnalyzerNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---PURPOSE ANALYZER NODE---");
    
    // Extract purpose from the last user message
    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage?.content?.toString() || '';
    
    let purpose = content;
    let purposeType: MotiveForceState['purposeType'] = 'custom';
    
    // Simple keyword-based purpose type detection
    if (content.toLowerCase().includes('research') || content.toLowerCase().includes('find') || content.toLowerCase().includes('search')) {
      purposeType = 'research';
    } else if (content.toLowerCase().includes('organize') || content.toLowerCase().includes('manage') || content.toLowerCase().includes('plan')) {
      purposeType = 'productivity';
    } else if (content.toLowerCase().includes('learn') || content.toLowerCase().includes('understand') || content.toLowerCase().includes('explain')) {
      purposeType = 'learning';
    } else if (content.toLowerCase().includes('create') || content.toLowerCase().includes('write') || content.toLowerCase().includes('generate')) {
      purposeType = 'creative';
    } else if (content.toLowerCase().includes('analyze') || content.toLowerCase().includes('evaluate') || content.toLowerCase().includes('compare')) {
      purposeType = 'analysis';
    }
    
    return {
      ...state,
      currentPurpose: purpose,
      purposeType,
      sessionMetadata: {
        ...state.sessionMetadata,
        totalSteps: state.sessionMetadata.totalSteps + 1,
        lastActiveAt: new Date(),
      },
    };
  }

  private async planGeneratorNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---PLAN GENERATOR NODE---");
    
    // Create a simple plan based on the purpose
    const subgoal = {
      id: uuidv4(),
      description: `Complete: ${state.currentPurpose}`,
      status: 'pending' as const,
      priority: 5,
      dependencies: [] as string[],
      estimatedDuration: 30,
    };
    
    const executionStep = {
      id: uuidv4(),
      subgoalId: subgoal.id,
      action: 'analysis' as const,
      description: 'Analyze the user request and determine next steps',
      status: 'pending' as const,
    };
    
    return {
      ...state,
      subgoals: [subgoal],
      executionPlan: [executionStep],
      sessionMetadata: {
        ...state.sessionMetadata,
        totalSteps: state.sessionMetadata.totalSteps + 1,
        lastActiveAt: new Date(),
      },
    };
  }

  private async contextGathererNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---CONTEXT GATHERER NODE---");
    
    // For now, just mark that context has been gathered
    return {
      ...state,
      contextualMemories: [
        {
          id: uuidv4(),
          content: `Context for: ${state.currentPurpose}`,
          type: 'conscious',
          retrievedAt: new Date(),
          source: 'context_gatherer',
        }
      ],
      sessionMetadata: {
        ...state.sessionMetadata,
        totalSteps: state.sessionMetadata.totalSteps + 1,
        memoryRetrievals: state.sessionMetadata.memoryRetrievals + 1,
        lastActiveAt: new Date(),
      },
    };
  }

  private async toolOrchestratorNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---TOOL ORCHESTRATOR NODE---");
    
    // Find the next pending step
    const nextStep = state.executionPlan.find(step => step.status === 'pending');
    
    if (nextStep) {
      // Mark the step as completed
      const updatedPlan = state.executionPlan.map(step => 
        step.id === nextStep.id 
          ? { ...step, status: 'completed' as const, executedAt: new Date() }
          : step
      );
      
      // Update the related subgoal
      const updatedSubgoals = state.subgoals.map(subgoal => {
        if (subgoal.id === nextStep.subgoalId) {
          const subgoalSteps = updatedPlan.filter(step => step.subgoalId === subgoal.id);
          const completedSteps = subgoalSteps.filter(step => step.status === 'completed');
          
          if (completedSteps.length === subgoalSteps.length) {
            return { 
              ...subgoal, 
              status: 'completed' as const,
              completedAt: new Date(),
              actualDuration: subgoal.startedAt 
                ? Math.round((Date.now() - subgoal.startedAt.getTime()) / (1000 * 60))
                : subgoal.estimatedDuration
            };
          } else if (completedSteps.length > 0) {
            return { 
              ...subgoal, 
              status: 'in_progress' as const,
              startedAt: subgoal.startedAt || new Date()
            };
          }
        }
        return subgoal;
      });
      
      return {
        ...state,
        executionPlan: updatedPlan,
        subgoals: updatedSubgoals,
        sessionMetadata: {
          ...state.sessionMetadata,
          totalSteps: state.sessionMetadata.totalSteps + 1,
          completedSteps: state.sessionMetadata.completedSteps + 1,
          toolCalls: state.sessionMetadata.toolCalls + 1,
          lastActiveAt: new Date(),
        },
      };
    }
    
    return {
      ...state,
      sessionMetadata: {
        ...state.sessionMetadata,
        totalSteps: state.sessionMetadata.totalSteps + 1,
        lastActiveAt: new Date(),
      },
    };
  }

  private async progressMonitorNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---PROGRESS MONITOR NODE---");
    
    const completedSubgoals = state.subgoals.filter(sg => sg.status === 'completed').length;
    const totalSubgoals = state.subgoals.length;
    const progress = totalSubgoals > 0 ? Math.round((completedSubgoals / totalSubgoals) * 100) : 0;
    
    return {
      ...state,
      overallProgress: progress,
      lastProgressUpdate: new Date(),
      sessionMetadata: {
        ...state.sessionMetadata,
        totalSteps: state.sessionMetadata.totalSteps + 1,
        lastActiveAt: new Date(),
      },
    };
  }

  private async reflectionEngineNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---REFLECTION ENGINE NODE---");
    
    const reflection = {
      id: uuidv4(),
      type: 'insight' as const,
      content: `Session completed for purpose: ${state.currentPurpose}. Progress: ${state.overallProgress}%`,
      timestamp: new Date(),
      impact: 'medium' as const,
      actionable: false,
    };
    
    return {
      ...state,
      reflections: [...state.reflections, reflection],
      sessionMetadata: {
        ...state.sessionMetadata,
        totalSteps: state.sessionMetadata.totalSteps + 1,
        lastActiveAt: new Date(),
      },
    };
  }

  private async userCheckinNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---USER CHECKIN NODE---");
    
    return {
      ...state,
      needsUserInput: true,
      waitingForUser: true,
      sessionMetadata: {
        ...state.sessionMetadata,
        totalSteps: state.sessionMetadata.totalSteps + 1,
        userInteractions: state.sessionMetadata.userInteractions + 1,
        lastActiveAt: new Date(),
      },
    };
  }

  private async queryGeneratorNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---QUERY GENERATOR NODE (MOTIVE FORCE LLM)---");
    
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Log model info to confirm motive force is using its own LLM
      const providerInfo = this.llmService.getProviderInfo();
      console.log(`[MotiveForce] Using model: ${providerInfo.provider}/${providerInfo.model}`);
      
      // Get the base system prompt from motive-force-prompt.md
      const baseSystemPrompt = MotiveForceStorage.getSystemPrompt();
      
      // Debug: Log first 100 chars of the prompt to verify it's correct
      console.log('[MotiveForce] Using system prompt:', baseSystemPrompt.substring(0, 100) + '...');
      
      // Verify we're not accidentally getting the main system prompt
      if (baseSystemPrompt.includes('tool-empowered assistant')) {
        console.error('[MotiveForce] ERROR: Got main system prompt instead of motive force prompt!');
        throw new Error('Motive force is using the wrong system prompt file');
      }
      
      // Convert BaseMessage back to ChatMessage format for context processing
      const chatMessages = state.messages.map(msg => ({
        role: msg instanceof HumanMessage ? 'user' as const : 'assistant' as const,
        content: msg.content.toString()
      }));

      // Get the last user message before motive force takes over
      const lastUserMessage = chatMessages.filter(m => m.role === 'user').slice(-1)[0];
      
      // Get additional context if available
      let additionalContext = '';
      
      // Add RAG context
      if (this.ragService && lastUserMessage) {
        try {
          const ragResult = await this.ragService.retrieveAndFormatContext(
            lastUserMessage.content
          );
          
          if (ragResult.memories.length > 0) {
            additionalContext += '\n\n## Relevant Context from Memory:\n';
            additionalContext += ragResult.memories
              .map(r => `- ${r.text}`)
              .join('\n');
          }
        } catch (error) {
          console.warn('[MotiveForce] RAG service failed:', error);
        }
      }
      
      // Add conscious memory context
      if (this.memoryService) {
        try {
          const recentMessages = chatMessages
            .slice(-5) // Last 5 messages for context
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
        } catch (error) {
          console.warn('[MotiveForce] Conscious memory service failed:', error);
        }
      }

      // Add workflow context
      if (state.currentPurpose) {
        additionalContext += `\n\n## Current Purpose: ${state.currentPurpose}`;
      }
      if (state.subgoals.length > 0) {
        additionalContext += `\n\n## Completed Goals: ${state.subgoals.filter(g => g.status === 'completed').length}/${state.subgoals.length}`;
      }
      
      // Construct the enhanced system prompt
      const userContextSection = `\n\n---\n\n## Context: Last Message from User Before You Took Over for Them

The last message from the user before you took over for them was: "${lastUserMessage?.content || 'No previous user message found'}"

You should act as the human user of the system and continue their conversation as if you were them.${additionalContext ? '\n\n' + additionalContext : ''}`;
      
      const enhancedSystemPrompt = baseSystemPrompt + userContextSection;

      // Convert to conversation format, excluding the last user message to avoid duplication
      const conversationMessages = chatMessages
        .slice(-5) // Last 5 messages for context
        .slice(0, -1) // Remove last message since it's now in system prompt
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Get model without tools to avoid naming issues - THIS IS MOTIVE FORCE'S OWN MODEL
      const { model } = await this.llmService.getModelAndTools(false);
      
      // Log to confirm we're using motive force's own LLM
      const configInfo = this.getConfigurationInfo();
      console.log(`[MotiveForce] Query generator using ${configInfo.usingCustomConfig ? 'CUSTOM' : 'DEFAULT'} config: ${configInfo.provider}/${configInfo.model}`);
      
      console.log('[MotiveForce] Starting LLM generation with own model...');
      
      // Generate the query using MOTIVE FORCE'S OWN LLM SERVICE
      let streamOptions: any;
      
      if (conversationMessages.length === 0) {
        // Use prompt-based approach when no history
        streamOptions = {
          model,
          system: enhancedSystemPrompt,
          prompt: "What should I do next?",
          temperature: 0.7,
          maxTokens: 8000,
        };
      } else {
        // Use messages-based approach with history
        streamOptions = {
          model,
          system: enhancedSystemPrompt,
          messages: conversationMessages,
          temperature: 0.7,
          maxTokens: 8000,
        };
      }
      
      // Stream the response using MOTIVE FORCE'S OWN MODEL
      let resultText = '';
      try {
        console.log('[MotiveForce] Calling streamText with motive force model for query generation...');
        
        const result = await streamText(streamOptions);
        
        for await (const chunk of result.textStream) {
          resultText += chunk;
        }
        
        console.log(`[MotiveForce] Generated ${resultText.length} characters of response`);
      } catch (streamError) {
        console.error('[MotiveForce] Streaming failed:', streamError);
        throw streamError;
      }
      
      // Clean up the response
      const cleanedQuery = this.cleanGeneratedQuery(resultText);
      
      // Add the generated query as a new AI message
      const newAIMessage = new AIMessage(cleanedQuery);
      
      console.log(`[MotiveForce] Generated query: "${cleanedQuery.substring(0, 100)}${cleanedQuery.length > 100 ? '...' : ''}"`);
      
      return {
        ...state,
        messages: [...state.messages, newAIMessage],
        workingMemory: {
          ...state.workingMemory,
          motiveForceQueryGenerated: true,
          generatedQuery: cleanedQuery
        },
        sessionMetadata: {
          ...state.sessionMetadata,
          totalSteps: state.sessionMetadata.totalSteps + 1,
          lastActiveAt: new Date(),
        },
      };
    } catch (error) {
      console.error('[MotiveForce] Error in query generator node:', error);
      
      // Fallback: generate a simple query
      const fallbackQuery = `Continue with the current task: ${state.currentPurpose || 'exploring the conversation'}`;
      const fallbackMessage = new AIMessage(fallbackQuery);
      
      console.log(`[MotiveForce] Using fallback query: "${fallbackQuery}"`);
      
      return {
        ...state,
        messages: [...state.messages, fallbackMessage],
        workingMemory: {
          ...state.workingMemory,
          motiveForceQueryGenerated: true,
          generatedQuery: fallbackQuery
        },
        errorCount: state.errorCount + 1,
        lastError: error instanceof Error ? error.message : 'Unknown error in query generation',
        sessionMetadata: {
          ...state.sessionMetadata,
          totalSteps: state.sessionMetadata.totalSteps + 1,
          lastActiveAt: new Date(),
        },
      };
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
}

// Create the default workflow instance
export const motiveForceGraph = new MotiveForceWorkflow();

// Utility functions for working with the workflow
export function createInitialState(
  messages: BaseMessage[] = [],
  threadId: string = uuidv4()
): MotiveForceState {
  return {
    messages,
    currentPurpose: "",
    purposeType: "custom",
    subgoals: [],
    executionPlan: [],
    toolResults: [],
    contextualMemories: [],
    reflections: [],
    userPreferences: [],
    sessionMetadata: {
      sessionId: uuidv4(),
      threadId,
      startedAt: new Date(),
      lastActiveAt: new Date(),
      totalSteps: 0,
      completedSteps: 0,
      failedSteps: 0,
      totalDuration: 0,
      pausedDuration: 0,
      userInteractions: 0,
      toolCalls: 0,
      memoryRetrievals: 0,
    },
    emergencyStop: false,
    needsUserInput: false,
    waitingForUser: false,
    isPaused: false,
    overallProgress: 0,
    lastProgressUpdate: new Date(),
    blockers: [],
    workingMemory: {},
    persistentContext: {},
    errorCount: 0,
    retryCount: 0,
    averageStepDuration: 0,
    successRate: 1.0,
    toolEfficiency: {},
  };
}

export function getGraphConfig(): MotiveForceGraphConfig {
  return defaultMotiveForceConfig;
}

// Additional factory functions for potential future LangGraph integration
export function createMotiveForceGraph(config: MotiveForceGraphConfig = defaultMotiveForceConfig) {
  return new MotiveForceWorkflow(config);
}

export function createCompiledMotiveForceGraph(config: MotiveForceGraphConfig = defaultMotiveForceConfig) {
  return new MotiveForceWorkflow(config);
}
