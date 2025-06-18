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
import { streamText, generateText } from 'ai';

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
    const envProvider = process.env.LLM_PROVIDER_MOTIVE_FORCE?.toLowerCase() || 
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
    const envModel = process.env.LLM_MODEL_MOTIVE_FORCE || process.env.LLM_MODEL;
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
        'LLM_PROVIDER_MOTIVE_FORCE',
        'LLM_MODEL_MOTIVE_FORCE',
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

    // NEW: Routing to problem handler nodes first
    // (Order might matter: check for major errors first, then failures, then loops)
    if (state.lastDetectionReport?.type === 'major_error' && !(state.workingMemory as any).majorErrorAddressed) {
      return 'handle_major_error';
    }
    if (state.lastDetectionReport?.type === 'failure' && !(state.workingMemory as any).failureAddressed) {
      return 'handle_failure';
    }
    if (state.lastDetectionReport?.type === 'loop' && !(state.workingMemory as any).loopAddressed) {
      return 'handle_loop';
    }

    // Check if we've already generated a motive force query
    // Look for a specific marker in workingMemory to know if query was generated
    if ((state.workingMemory as any).motiveForceQueryGenerated === true) {
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

    // NEW: Always check for problems before generating a new query,
    // unless already in a recovery/planning phase.
    if (state.sessionMetadata.totalSteps > 0 && !(state.workingMemory as any).detectingProblems) {
      return 'prepare_detection_input';
    }
    
    // Default to query generator after initial setup
    return 'query_generator';
  }

  private async executeNode(nodeType: string, state: MotiveForceState): Promise<MotiveForceState> {
    switch (nodeType) {
      case 'purpose_analyzer':
        return this.purposeAnalyzerNode(state);
      case 'plan_generator':
        return this.planGeneratorNode(state);
      case 'reflection_engine':
        return this.reflectionEngineNode(state);
      case 'user_checkin':
        return this.userCheckinNode(state);
      case 'query_generator':
        return this.queryGeneratorNode(state);
      case 'prepare_detection_input':
        return this.prepareDetectionInputNode(state);
      case 'detect_failure':
        return this.detectFailureNode(state);
      case 'detect_major_error':
        return this.detectMajorErrorNode(state);
      case 'detect_loop':
        return this.detectLoopNode(state);
      case 'handle_failure':
        return this.handleFailureNode(state);
      case 'handle_major_error':
        return this.handleMajorErrorNode(state);
      case 'handle_loop':
        return this.handleLoopNode(state);
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
      // Check for detection reports and handle them first
      let finalPromptContent = "What should I do next?";
      let updatedState = { ...state };
      
      if (state.lastDetectionReport) {
        const report = state.lastDetectionReport;
        finalPromptContent = `A problem was detected: Type: ${report.type}, Details: ${report.details}. Action: ${report.actionSuggestion}. What is the optimal next step to course correct and resume the task?`;
        
        // Clear the report after processing
        updatedState.lastDetectionReport = undefined;
        
        // Mark the specific problem as addressed in workingMemory to avoid re-triggering
        if (report.type === 'failure') (updatedState.workingMemory as any).failureAddressed = true;
        if (report.type === 'major_error') (updatedState.workingMemory as any).majorErrorAddressed = true;
        if (report.type === 'loop') (updatedState.workingMemory as any).loopAddressed = true;

        // If there's an investigative tool call suggested, prioritize that
        if ((updatedState.workingMemory as any).nextActionIsInvestigativeTool) {
          const investigativeCall = (updatedState.workingMemory as any).nextActionIsInvestigativeTool;
          finalPromptContent = `A problem was detected. Please execute this investigative tool call to verify: ${JSON.stringify(investigativeCall)}. Then, based on the result, decide the next step.`;
          delete (updatedState.workingMemory as any).nextActionIsInvestigativeTool; // Consume the action
        }
        
        console.log(`[MotiveForce] Processing detection report: ${report.type} - ${report.details}`);
      }

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
      const chatMessages = updatedState.messages.map(msg => ({
        role: msg instanceof HumanMessage ? 'user' as const : 'assistant' as const,
        content: msg.content.toString()
      }));

      // Get the last user message before motive force takes over
      const lastUserMessage = chatMessages.filter(m => m.role === 'user').slice(-1)[0];
      
      // Get additional context if available
      let additionalContext = '';

      // Add workflow context
      if (state.currentPurpose) {
        additionalContext += `\n\n## Current Purpose: ${state.currentPurpose} [REMEMBER THAT YOU ARE NOT THE ASSISTANT BUT THE AUTOPILOT. REACT TO THE CURRENT CONTEXT. PROVIDE GUIDANCE AND AVOID GENERIC RESPONSES]`;
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
        //.slice(0, -1) // Remove last message since it's now in system prompt
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Get model with tools for motive force capabilities - THIS IS MOTIVE FORCE'S OWN MODEL
      const { model, tools } = await this.llmService.getModelAndTools(true);
      
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
          prompt: finalPromptContent,
          temperature: 0.7,
          maxTokens: 8000,
          tools: tools,
          toolCallStreaming: true,
        };
      } else {
        // Use messages-based approach with history
        conversationMessages[conversationMessages.length - 1].content = conversationMessages[conversationMessages.length - 1].content 
        + " [NOW YOU SHOULD ANSWER AS THE EMISSARY OF HUMAN USER]"
        streamOptions = {
          model,
          system: enhancedSystemPrompt,
          messages: conversationMessages,
          temperature: 0.7,
          maxTokens: 8000,
          tools: tools,
          toolCallStreaming: true,
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
        ...updatedState,
        messages: [...updatedState.messages, newAIMessage],
        workingMemory: {
          ...updatedState.workingMemory,
          motiveForceQueryGenerated: true,
          generatedQuery: cleanedQuery
        },
        sessionMetadata: {
          ...updatedState.sessionMetadata,
          totalSteps: updatedState.sessionMetadata.totalSteps + 1,
          lastActiveAt: new Date(),
        },
      };
    } catch (error) {
      console.error('[MotiveForce] Error in query generator node:', error);
      
      // Fallback: generate a simple query
      const fallbackQuery = `Continue with the current task: ${state.currentPurpose || 'exploring the conversation'}`;
      const fallbackMessage = new AIMessage(fallbackQuery);
      
      console.log(`[MotiveForce] Using fallback query: "${fallbackQuery}"`);
      
      // Create fallback state that still clears any detection reports
      let fallbackState = { ...state };
      if (state.lastDetectionReport) {
        fallbackState.lastDetectionReport = undefined;
        const report = state.lastDetectionReport;
        if (report.type === 'failure') (fallbackState.workingMemory as any).failureAddressed = true;
        if (report.type === 'major_error') (fallbackState.workingMemory as any).majorErrorAddressed = true;
        if (report.type === 'loop') (fallbackState.workingMemory as any).loopAddressed = true;
      }
      
      return {
        ...fallbackState,
        messages: [...fallbackState.messages, fallbackMessage],
        workingMemory: {
          ...fallbackState.workingMemory,
          motiveForceQueryGenerated: true,
          generatedQuery: fallbackQuery
        },
        errorCount: fallbackState.errorCount + 1,
        lastError: error instanceof Error ? error.message : 'Unknown error in query generation',
        sessionMetadata: {
          ...fallbackState.sessionMetadata,
          totalSteps: fallbackState.sessionMetadata.totalSteps + 1,
          lastActiveAt: new Date(),
        },
      };
    }
  }

  private async prepareDetectionInputNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---PREPARE DETECTION INPUT NODE---");
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1]; // Main model's last response

    let messagesForDetection: BaseMessage[] = [];
    let detectionContextType: MotiveForceState['detectionContextType'];
    let nextDetectorNode: MotiveForceRoute;

    // Determine which detection to run next and what context it needs.
    // This is simplified; in a real scenario, you'd cycle through detectors or use heuristics.
    if (state.messages.length % 3 === 0) { // Example: Check for failure every 3rd step
      messagesForDetection = messages.slice(-1); // Last 1 message
      detectionContextType = 'single';
      nextDetectorNode = 'detect_failure';
    } else if (state.messages.length % 3 === 1) { // Example: Check for major errors
      messagesForDetection = messages.slice(-2); // Last 2 messages
      detectionContextType = 'last2';
      nextDetectorNode = 'detect_major_error';
    } else { // Example: Check for loops
      messagesForDetection = messages.slice(-3); // Last 3 messages
      detectionContextType = 'last3';
      nextDetectorNode = 'detect_loop';
    }

    return {
      ...state,
      messagesForDetection,
      detectionContextType,
      workingMemory: { 
        ...state.workingMemory, 
        detectingProblems: true, 
        nextDetector: nextDetectorNode 
      } as any,
      sessionMetadata: { 
        ...state.sessionMetadata, 
        totalSteps: state.sessionMetadata.totalSteps + 1 
      },
    };
  }

  private async detectFailureNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---DETECT FAILURE NODE---");
    const modelWithTools = await this.llmService.getModelAndTools(true); // Motive Force can use tools

    const currentMessage = state.messagesForDetection?.[0]; // Last message from main model
    if (!currentMessage) {
      return { 
        ...state, 
        workingMemory: { ...state.workingMemory, detectingProblems: false }, 
        lastDetectionReport: undefined 
      };
    }

    // Prompt Motive Force's LLM to detect specific failures, e.g., fake tool calls
    const promptContent = `Analyze the last message from the assistant:\n\n${currentMessage.content}\n\n`;
    let analysisPrompt = `Your role is to detect immediate failures or misleading responses from the assistant. Specifically, check if a tool call was implied but not successfully executed, or if results are fabricated.
If the assistant stated it performed an action (e.g., "saved memory X", "created file Y"), does it sound too vague or fabricated? Does it omit concrete IDs or clear success indicators?
If you detect a potential failure or fabrication, propose a corrective action, possibly an investigative tool call to verify.

Respond in a JSON format: {"isProblem": boolean, "type": "failure", "details": "string", "actionSuggestion": "string", "investigativeToolCall": {"toolName": "string", "args": {}} }`;

    const result = await generateText({
      model: modelWithTools.model,
      prompt: analysisPrompt + promptContent,
      tools: modelWithTools.tools, // Pass tools here for investigative calls
      temperature: 0.1,
      maxTokens: 500,
    });

    let detectionReport: any;
    try {
      detectionReport = JSON.parse(result.text.trim());
    } catch (e) {
      console.warn("Failed to parse detection report, treating as no problem:", result.text);
      detectionReport = { isProblem: false };
    }

    let newState = { ...state, workingMemory: { ...state.workingMemory, detectingProblems: false } as any };
    if (detectionReport.isProblem) {
      newState.lastDetectionReport = {
        type: 'failure',
        details: detectionReport.details,
        actionSuggestion: detectionReport.actionSuggestion,
        timestamp: new Date(),
      };
      if (detectionReport.investigativeToolCall) {
        // Trigger investigative tool call directly or queue it for queryGeneratorNode
        // For now, let queryGeneratorNode handle it based on actionSuggestion
        (newState.workingMemory as any).nextActionIsInvestigativeTool = detectionReport.investigativeToolCall;
      }
    } else {
      newState.lastDetectionReport = undefined; // Clear report if no problem
    }
    return newState;
  }

  private async detectMajorErrorNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---DETECT MAJOR ERROR NODE---");
    const modelWithTools = await this.llmService.getModelAndTools(true);

    const lastTwoMessages = state.messagesForDetection;
    if (!lastTwoMessages || lastTwoMessages.length < 2) {
      return { 
        ...state, 
        workingMemory: { ...state.workingMemory, detectingProblems: false }, 
        lastDetectionReport: undefined 
      };
    }

    const promptContent = `Analyze the last two messages in the conversation for a major error or "fuck up" by the assistant:\n\n` +
                          `User: ${lastTwoMessages[0].content}\n` +
                          `Assistant: ${lastTwoMessages[1].content}\n\n`;
    let analysisPrompt = `Your role is to detect severe errors, critical misunderstandings, or significant deviations from the user's intent. This might require planning rollback actions or major course corrections.
Respond in a JSON format: {"isProblem": boolean, "type": "major_error", "details": "string", "rollbackPlan": ["string"], "actionSuggestion": "string"}`;

    const result = await generateText({
      model: modelWithTools.model,
      prompt: analysisPrompt + promptContent,
      tools: modelWithTools.tools,
      temperature: 0.1,
      maxTokens: 500,
    });
    let detectionReport: any;
    try {
      detectionReport = JSON.parse(result.text.trim());
    } catch (e) {
      console.warn("Failed to parse major error detection report, treating as no problem:", result.text);
      detectionReport = { isProblem: false };
    }

    let newState = { ...state, workingMemory: { ...state.workingMemory, detectingProblems: false } as any };
    if (detectionReport.isProblem) {
      newState.lastDetectionReport = {
        type: 'major_error',
        details: detectionReport.details,
        actionSuggestion: detectionReport.actionSuggestion || `Execute rollback plan: ${detectionReport.rollbackPlan?.join(', ')}`,
        timestamp: new Date(),
      };
      (newState.workingMemory as any).majorErrorAddressed = false; // Mark for follow-up
    } else {
      newState.lastDetectionReport = undefined;
    }
    return newState;
  }

  private async detectLoopNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---DETECT LOOP NODE---");
    const modelWithTools = await this.llmService.getModelAndTools(true);

    const lastThreeMessages = state.messagesForDetection;
    if (!lastThreeMessages || lastThreeMessages.length < 3) {
      return { 
        ...state, 
        workingMemory: { ...state.workingMemory, detectingProblems: false }, 
        lastDetectionReport: undefined 
      };
    }

    const promptContent = `Analyze the last three messages in the conversation:\n\n` +
                          `1: ${lastThreeMessages[0].content}\n` +
                          `2: ${lastThreeMessages[1].content}\n` +
                          `3: ${lastThreeMessages[2].content}\n\n`;
    let analysisPrompt = `Your role is to detect if the conversation is stuck in a loop or giving very similar answers consecutively.
Respond in a JSON format: {"isProblem": boolean, "type": "loop", "details": "string", "patternDetected": "string", "actionSuggestion": "string"}`;

    const result = await generateText({
      model: modelWithTools.model,
      prompt: analysisPrompt + promptContent,
      tools: modelWithTools.tools,
      temperature: 0.1,
      maxTokens: 500,
    });
    let detectionReport: any;
    try {
      detectionReport = JSON.parse(result.text.trim());
    } catch (e) {
      console.warn("Failed to parse loop detection report, treating as no problem:", result.text);
      detectionReport = { isProblem: false };
    }

    let newState = { ...state, workingMemory: { ...state.workingMemory, detectingProblems: false } as any };
    if (detectionReport.isProblem) {
      newState.lastDetectionReport = {
        type: 'loop',
        details: detectionReport.details,
        actionSuggestion: detectionReport.actionSuggestion || `Break loop with alternative action: ${detectionReport.patternDetected}`,
        timestamp: new Date(),
      };
      (newState.workingMemory as any).loopAddressed = false; // Mark for follow-up
    } else {
      newState.lastDetectionReport = undefined;
    }
    return newState;
  }

  private async handleFailureNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---HANDLE FAILURE NODE---");
    
    // Mark the failure as addressed and clear any investigative tool calls
    const newState = {
      ...state,
      workingMemory: {
        ...state.workingMemory,
        failureAddressed: true,
      } as any
    };
    
    // Clear investigative tool call if it exists
    if ((newState.workingMemory as any).nextActionIsInvestigativeTool) {
      delete (newState.workingMemory as any).nextActionIsInvestigativeTool;
    }
    
    return newState;
  }

  private async handleMajorErrorNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---HANDLE MAJOR ERROR NODE---");
    
    // Mark the major error as addressed
    const newState = {
      ...state,
      workingMemory: {
        ...state.workingMemory,
        majorErrorAddressed: true,
      } as any
    };
    
    return newState;
  }

  private async handleLoopNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---HANDLE LOOP NODE---");
    
    // Mark the loop as addressed
    const newState = {
      ...state,
      workingMemory: {
        ...state.workingMemory,
        loopAddressed: true,
      } as any
    };
    
    return newState;
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
