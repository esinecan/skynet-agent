import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, AIMessage, HumanMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import {
  MotiveForceGraphState,
  MotiveForceRoute,
  MotiveForceGraphConfig,
  SessionMetadata,
  ProblemResolutionPurpose
} from "../types/motive-force-graph";
import { LLMService, LLMProvider, LLMProviderConfig } from './llm-service';
import { getRAGService } from './rag';
import { getConsciousMemoryService } from './conscious-memory';
import { MotiveForceStorage } from './motive-force-storage';
import { streamText, generateText } from 'ai'; // Ensure generateText is imported
import { report } from "process";

// For now, we'll create a simplified graph structure
// that works with the current LangGraph version

export type MotiveForceState = MotiveForceGraphState;

// Default configuration (removed reflectionInterval and enableReflection)
export const defaultMotiveForceConfig: MotiveForceGraphConfig = {
  maxStepsPerSession: 50,
  maxDurationMinutes: 60,
  userCheckinInterval: 10,
  errorThreshold: 5,
  retryLimit: 3,
  memoryRetrievalLimit: 10,
  parallelToolExecution: false,
  aggressiveness: 'balanced',
  purposeTypes: ['research', 'productivity', 'learning', 'creative', 'analysis', 'maintenance', 'custom'],
  enableLearning: true,
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
    const motiveForceConfig = this.getMotiveForceModelConfig();
    this.llmService = new LLMService(motiveForceConfig);
  }

  private getMotiveForceModelConfig(): LLMProviderConfig | undefined {
    const motiveForceProvider = this.getMotiveForceProviderFromEnvironment();
    const motiveForceModel = this.getMotiveForceDefaultModel(motiveForceProvider);

    if (motiveForceProvider !== this.getMainProviderFromEnvironment() ||
        motiveForceModel !== this.getMainDefaultModel(this.getMainProviderFromEnvironment())) {

      const config: LLMProviderConfig = {
        provider: motiveForceProvider,
        model: motiveForceModel
      };

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
    return undefined;
  }

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

    return 'google';
  }

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

  private getMotiveForceDefaultModel(provider: LLMProvider): string {
    const envModel = process.env.LLM_MODEL_MOTIVE_FORCE || process.env.LLM_MODEL;
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
    if (state.motiveForceOff && !state.workingMemory.motiveForceQueryGenerated) {
      return 'query_generator'; // Route to query generator to produce the shutdown message
    }

    // Emergency stop check (will also catch motiveForceOff induced stop)
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

    // We only route to handler if a report exists AND it hasn't been addressed.
    // This allows the orchestrator to run all detections first.
    if (state.lastDetectionReport?.type === 'major_error' && !state.workingMemory.majorErrorAddressed) {
      return 'handle_major_error';
    }
    if (state.lastDetectionReport?.type === 'failure' && !state.workingMemory.failureAddressed) {
      return 'handle_failure';
    }
    if (state.lastDetectionReport?.type === 'loop' && !state.workingMemory.loopAddressed) {
      return 'handle_loop';
    }

    // Check if we've already generated a motive force query (and not in shutdown mode)
    if (state.workingMemory.motiveForceQueryGenerated === true) {
      return '__end__'; // If a query was generated and MF is not shutting down, end.
    }

    // Initial setup/planning phase
    if (!state.currentPurpose) {
      return 'purpose_analyzer';
    }
    if (state.subgoals.length === 0) {
      return 'plan_generator';
    }

    // Check if we're in detection mode but haven't reached the orchestrator yet
    if (state.sessionMetadata.totalSteps > 0 && !state.workingMemory.problemDetectionComplete) {
      // If we're in the middle of detector orchestration, continue it
      if (state.workingMemory.orchestrationActive) {
        return 'detection_orchestrator';
      }
      
      // If detectingProblems is true, we've already executed prepare_detection_input
      // and should start orchestration
      if (state.workingMemory.detectingProblems === true) {
        return 'detection_orchestrator';
      }
      
      // Otherwise, we need to prepare for detection first
      return 'prepare_detection_input';
    }

    // Default route: go to query generator if no other conditions met
    return 'query_generator';
  }

  private async executeNode(nodeType: string, state: MotiveForceState): Promise<MotiveForceState> {
    switch (nodeType) {
      case 'purpose_analyzer':
        return this.purposeAnalyzerNode(state);
      case 'plan_generator':
        return this.planGeneratorNode(state);
      case 'user_checkin':
        return this.userCheckinNode(state);
      case 'query_generator':
        return this.queryGeneratorNode(state);

      case 'prepare_detection_input':
        return this.prepareDetectionInputNode(state);
      case 'detection_orchestrator':
        return this.detectionOrchestratorNode(state);
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

    const lastMessage = state.messages[state.messages.length - 1];
    const content = lastMessage?.content?.toString() || '';

    let purpose = content;
    let purposeType: MotiveForceState['purposeType'] = 'custom';

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

  private async userCheckinNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---USER CHECKIN NODE---");

    return {
      ...state,
      needsUserInput: true,
      waitingForUser: true,
      motiveForceOff: true, // Indicate that Motive Force is turning off
      workingMemory: {
        ...state.workingMemory,
        motiveForceShutdown: true, // Flag for queryGeneratorNode to produce closing message
      },
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
      let finalPromptContent = "What should I do next?";
      let updatedState = { ...state };

      // Iterate through all accumulated detection reports
      const allDetectionReports = state.workingMemory.allDetectionReports || [];
      if (allDetectionReports.length > 0) {
        let problemSummaries: string[] = [];
        for (const report of allDetectionReports) {
          problemSummaries.push(`Type: ${report.type}, Details: ${report.details}. Action: ${report.actionSuggestion}.`);

          // Mark the specific problem as addressed in workingMemory to avoid re-triggering
          if (report.type === 'failure') updatedState.workingMemory.failureAddressed = true;
          if (report.type === 'major_error') updatedState.workingMemory.majorErrorAddressed = true;
          if (report.type === 'loop') updatedState.workingMemory.loopAddressed = true;
        }
        finalPromptContent = `Multiple problems were detected:\n\n${problemSummaries.join('\n\n')}\n\nWhat is the optimal next step to course correct and resume the task, considering all detected issues?`;

        // Clear the reports after processing
        updatedState.workingMemory.allDetectionReports = []; // Clear all reports
      }
      
      // If there's an investigative tool call suggested, prioritize that
      if (updatedState.workingMemory.nextActionIsInvestigativeTool) {
        const investigativeCall = updatedState.workingMemory.nextActionIsInvestigativeTool;
        finalPromptContent = `A problem was detected. Please execute this investigative tool call to verify: ${JSON.stringify(investigativeCall)}. Then, based on the result, decide the next step.`;
        delete updatedState.workingMemory.nextActionIsInvestigativeTool; // Consume the action
      }

      console.log(`[MotiveForce] Processing detection reports. Final prompt: ${finalPromptContent}`); // More specific log

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
        additionalContext += `\n\n## Current Purpose: ${state.currentPurpose} \n\n 
        [REMEMBER THAT YOU ARE NOT THE ASSISTANT BUT THE AUTOPILOT. REACT TO THE CURRENT CONTEXT. PROVIDE GUIDANCE AND AVOID GENERIC RESPONSES. BY AND LARGE YOU'LL KNOW WHAT TO SAY I THINK. IDK MAYBE ENCOURAGEMENT IF IT'S DOING WELL OR SMTH.]
        \n [SOMETIMES YOU NEED TO PUT THE BRAKES ON THE ASSISTANT. IS IT ABOUT TO REMOVE SOME KNOWLEDGE IRREVERSIBLY? IS IT PRINTING HIGH PROSE OMNISSIAH QUOTES? (A DEFINITE HALLUCINATION SIGN) YOU'RE THE ONE TO MAKE THE CALL WHEN TO CHEER AND WHEN TO COURSE CORRECT]`;
      }
      if (state.subgoals.length > 0) {
        additionalContext += `\n\n## Completed Goals: ${state.subgoals.filter(g => g.status === 'completed').length}/${state.subgoals.length}`;
      }

      // Construct the enhanced system prompt
      const userContextSection = `\n\n---\n\n## Context: Last Message from User Before You Took Over for Them

The last message from the user before you took over for them was: "${lastUserMessage?.content || 'No previous user message found'}"

You should act as the human user of the system and continue their conversation as if you were them.${additionalContext ? '\n\n' + additionalContext : ''}`;

      const enhancedSystemPrompt = baseSystemPrompt + userContextSection;

      // Convert to conversation format
      const conversationMessages = chatMessages
        .slice(-5) // Last 5 messages for context
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
        + " [AND NOW, YOU ARE THE USER. ANSWER THIS ANSWER.]"
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
          generatedQuery: cleanedQuery,
          problemDetectionComplete: false, // Reset for next cycle
          allDetectionReports: [], // Ensure reports are cleared after use
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
      // Clear all detection reports on fallback as well
      fallbackState.workingMemory.allDetectionReports = [];
      fallbackState.workingMemory.problemDetectionComplete = false; // Reset
      
      // Clear specific problem flags as well, as query generation is happening
      fallbackState.workingMemory.failureAddressed = true;
      fallbackState.workingMemory.majorErrorAddressed = true;
      fallbackState.workingMemory.loopAddressed = true;

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
    
    // Deduplicate messages before processing
    const messages = this.deduplicateMessages(state.messages);
    
    // Use the appropriate message subset based on current detection needs
    // For now, use last 3 messages as a reasonable default for detection context
    const messagesForDetection: BaseMessage[] = messages.slice(-3);

    return {
      ...state,
      messages, // Replace state.messages with deduplicated messages
      messagesForDetection, // This will now hold the deduplicated message array for detection
      detectionContextType: 'last3', // Indicate the context type
      workingMemory: {
        ...state.workingMemory,
        detectingProblems: true,
        // Initialize all detection reports as empty array
        allDetectionReports: state.workingMemory.allDetectionReports || [], 
        problemDetectionComplete: false, // Set this flag
        currentDetectorIndex: 0, // Start from the first detector
      },
      sessionMetadata: {
        ...state.sessionMetadata,
        totalSteps: state.sessionMetadata.totalSteps + 1
      },
      lastDetectionReport: undefined, // Clear this as we're starting a new cycle
    };
  }

  // Helper method to deduplicate messages
  private deduplicateMessages(messages: BaseMessage[]): BaseMessage[] {
    if (!messages || messages.length <= 1) return messages;
    
    const result: BaseMessage[] = [messages[0]];
    
    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const previous = messages[i-1];
      
      // Case 1: Skip if both current and previous are human messages (regardless of content)
      if (current instanceof HumanMessage && previous instanceof HumanMessage) {
        console.log("Detected consecutive human messages, removing the latter one");
        continue;
      }
      
      // Case 2: Skip if this message is identical to the previous one (same type and content)
      if (current instanceof HumanMessage && previous instanceof HumanMessage && 
          current.content === previous.content) {
        console.log("Detected duplicate human message, skipping");
        continue;
      }
      
      if (current instanceof AIMessage && previous instanceof AIMessage && 
          current.content === previous.content) {
        console.log("Detected duplicate AI message, skipping");
        continue;
      }
      
      result.push(current);
    }
    
    if (result.length < messages.length) {
      console.log(`Removed ${messages.length - result.length} duplicate/consecutive message(s)`);
    }
    
    return result;
  }

  // Orchestrator Node for Sequential Detection
  private async detectionOrchestratorNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---DETECTION ORCHESTRATOR NODE---");
    let currentState = { ...state };

    // The order of execution
    const detectors: { name: string, messagesKey: 'single' | 'last2' | 'last3', node: MotiveForceRoute }[] = [
      { name: 'Failure Detector', messagesKey: 'single', node: 'detect_failure' },
      { name: 'Major Error Detector', messagesKey: 'last2', node: 'detect_major_error' },
      { name: 'Loop Detector', messagesKey: 'last3', node: 'detect_loop' },
    ];

    const currentDetectorIndex = currentState.workingMemory.currentDetectorIndex || 0;

    if (currentDetectorIndex < detectors.length) {
      const detector = detectors[currentDetectorIndex];
      console.log(`[Detection Orchestrator] Running ${detector.name} (Index: ${currentDetectorIndex})`);

      // Set the specific messages for the current detector based on their needs
      let messagesForCurrentDetector: BaseMessage[];
      switch (detector.messagesKey) {
        case 'single':
          messagesForCurrentDetector = state.messages.slice(-1);
          break;
        case 'last2':
          messagesForCurrentDetector = state.messages.slice(-2);
          break;
        case 'last3':
          messagesForCurrentDetector = state.messages.slice(-3);
          break;
        default:
          messagesForCurrentDetector = state.messages.slice(-1);
      }
      
      currentState.messagesForDetection = messagesForCurrentDetector;
      currentState.detectionContextType = detector.messagesKey;
      
      // Execute the current detector node
      const tempStateAfterDetection = await this.executeNode(detector.node, currentState);

      // Extract the detection report from tempStateAfterDetection if one was generated
      if (tempStateAfterDetection.lastDetectionReport) {
        // Accumulate this report into allDetectionReports
        currentState.workingMemory.allDetectionReports = [
          ...(currentState.workingMemory.allDetectionReports || []),
          tempStateAfterDetection.lastDetectionReport
        ];
      }

      // Prepare for the next detector
      currentState.workingMemory.currentDetectorIndex = currentDetectorIndex + 1;
      
      // Set orchestrationActive flag to true to continue the loop
      currentState.workingMemory.orchestrationActive = true;
      
      // Clear lastDetectionReport from current state to prevent it from being picked up prematurely by `shouldContinue`
      // It's already been moved to `allDetectionReports`
      currentState.lastDetectionReport = undefined;

    } else {
      // All detectors have run
      console.log("[Detection Orchestrator] All detectors have completed.");
      currentState.workingMemory.problemDetectionComplete = true;
      currentState.workingMemory.currentDetectorIndex = 0; // Reset for next cycle
      currentState.workingMemory.orchestrationActive = false; // End orchestration loop
      
      // Clear the temporary buffer
      currentState.messagesForDetection = undefined;
    }

    return {
      ...currentState,
      sessionMetadata: {
        ...currentState.sessionMetadata,
        totalSteps: currentState.sessionMetadata.totalSteps + 1,
        lastActiveAt: new Date(),
      },
    };
  }


  private async detectFailureNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---DETECT FAILURE NODE---");
    const modelWithTools = await this.llmService.getModelAndTools(true); // Motive Force can use tools

    const currentMessage = state.messagesForDetection?.[0]; // Get the first message from the array
    if (!currentMessage) {
      return {
        ...state,
        workingMemory: { ...state.workingMemory, detectingProblems: false },
        lastDetectionReport: undefined // Ensure this is cleared if no message
      };
    }

    const promptContent = `Analyze the last message from the assistant:\n\n${currentMessage.content}\n\n`;
    let analysisPrompt = `Your role is to be a highly skeptical and vigilant auditor of the assistant's actions. Your primary goal is to detect immediate failures, misleading responses, or **fabricated (fake) tool call results or actions**.

**CRITICAL GUIDELINE: A tool call is ONLY real if it is explicitly presented with a structured '🔧 Tool:' block as part of the assistant's output, indicating actual execution.** Any other description of an action is a fabrication.

**Examples of REAL Tool Call Outputs (look for this precise structure in the raw output):**
* "Retrieved 5 memories starting from 2025-06-19."
    🔧 Tool: conscious-memory_search_memories_by_time_range
    View details
* {"success": true, "id": "mem_xyz", "message": "Memory saved successfully"}
    (This is typically raw JSON output from a tool, often presented visually with a '🔧 Tool:' block.)

**Examples of FAKE or HALLUCINATED Tool Call Outputs (Assistant is just *describing* an action, NOT showing its *result* or an actual tool output block):**
* Phrases like "Executing Step 1:", "Saving...", "Deleting...", "Updated...", "Created..." when **NOT** immediately followed by a '🔧 Tool:' block.
* Summaries like "Action Log:" or "Proposed Execution Plan:" are plans or descriptions, not actual tool outputs.
* Any text that claims an action was performed but **DOES NOT** include the structured '🔧 Tool: [tool_name] View details' UI element or a raw tool output JSON/text that clearly came from a tool.
* Closing omnissiah quotes are an immediate yellow-orange flag.

**Instructions for your response:**
You MUST respond in a JSON format. If you detect a problem, provide specific details and suggest a corrective action. This action should almost always involve an **investigative tool call** to verify the claimed action, or explicitly asking the assistant to perform the tool call if it just described it.

Respond in a JSON format: {"isProblem": boolean, "type": "failure", "details": "string", "actionSuggestion": "string", "investigativeToolCall?": {"toolName": "string", "args": {}} }

If the 'investigativeToolCall' is applicable, provide the \`toolName\` and \`args\` in the JSON. If not, omit it or set it to \`null\`.
`;

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
      console.warn("Failed to parse detection report, treating as no problem:", result.text);
      detectionReport = { isProblem: false, report: result.text};
    }

    let newState = { ...state, workingMemory: { ...state.workingMemory, detectingProblems: false } };
    if (detectionReport.isProblem) {
      newState.lastDetectionReport = { // This will temporarily store the report before orchestrator collects it
        type: 'failure',
        details: detectionReport.details,
        actionSuggestion: detectionReport.actionSuggestion,
        timestamp: new Date(),
      };
      if (detectionReport.investigativeToolCall) {
        newState.workingMemory.nextActionIsInvestigativeTool = detectionReport.investigativeToolCall;
      }
    } else {
      newState.lastDetectionReport = undefined;
    }
    return newState;
  }

  private async detectMajorErrorNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---DETECT MAJOR ERROR NODE---");
    const modelWithTools = await this.llmService.getModelAndTools(true);

    const lastTwoMessages = state.messagesForDetection; // Get the message array
    if (!lastTwoMessages || lastTwoMessages.length < 1) {
      return {
        ...state,
        workingMemory: { ...state.workingMemory, detectingProblems: false },
        lastDetectionReport: undefined // Ensure this is cleared if no message
      };
    }

    const promptContent = `Analyze the following two messages from the conversation. The first is a Human message (likely from Autopilot). The second is an Assistant message (from the main model):\n\n` +
                              `Human (Autopilot/User): ${lastTwoMessages[0].content}\n` +
                              `Assistant (Main Model): ${lastTwoMessages[1].content}\n\n`;

    let analysisPrompt = `Your core role is to detect major errors or significant deviations in the overall conversation flow. This requires a deeper assessment of understanding, role adherence, and conversational patterns from BOTH Motive Force (you, the Human/Autopilot) and the main Assistant.

**CRITERIA FOR MAJOR ERROR DETECTION:**

**1. Motive Force (Your) Assessment:**
* **Role Adherence & Understanding:** Is what Motive Force (you) said plausibly relevant to its original intent or the overall task? Or did it just say "Continue with current task" when more specific action was expected?
* **Identity Mix-up:** Did Motive Force refer to memories as "my" instead of "your" (user's), indicating identity confusion?
* **Persona Drift:** Did Motive Force use many emojis, or refer to actions in the first person ("I will do X") when it should be acting as the human user dictating to the main model? (Note: First person from Motive Force *acting as the human* is okay, but "I will do X" for system actions is not).

**2. Main Model (Assistant) Assessment:**
* **Role Adherence & Understanding:** Is the main model up to speed with the conversation and its responsibilities?
* **Hallucination Pattern (Recitation/Approval Loop):** Did the main model recite exactly what Motive Force (or the user) just said, and then ask for approval? This is a textbook hallucination pattern where it avoids actual work.
* **Stalling/Awaiting Language:** Did the main model use words like "awaiting" or "stand by" in a way that suggests it's stuck or waiting unnecessarily after an instruction?
* **Message Repetition:** Did the main model repeat the user's last message or significant portions of it?
* **Conversational Stagnation (Yellow Flag):** Does this specific back-and-forth (the pair of messages being analyzed) *not represent any tangible progress* towards the overall task or explicit next steps?
* **Malformed Output Pattern (Yellow Flag):** Did the main model give an answer where there are **7 to 11 '- ' style bullet points total** in its response? This can indicate a verbose or generic list generation, rather than concise, actionable output.
* **Decorative Emojis (Yellow Flag):** Uses excessive or inappropriate emojis (e.g., ✅, ❌, 🔄, 🏷️) to denote status or decorate the response, especially when not part of a standard UI element.
* **Excessive Prose / Sounding Good:** Contains overly verbose, flowery language, or an unnaturally formal/executive tone that suggests it's prioritizing sounding good over being concise or directly actionable. This includes attributing quotes to "Motive Force" at the end.
* **Malformed List Structure:** Did the main model give an answer where there are 2-3 lists with each of them having 2-3 items, especially when a different structure or detail level was expected? (This suggests a generic, canned response pattern).
* **Less Emphasized (Not a strong indicator on its own for major error):** Recapitulation and Summary Sections: Sections like "Approved Actions," "Action Log," or "Batch X Final Status" can appear in legitimate summaries. Only flag if combined with strong indicators.


Respond in a JSON format: {"isProblem": boolean, "type": "major_error", "details": "string", "rollbackPlan": ["string"], "actionSuggestion": "string"}.
If \`isProblem\` is true, \`details\` must explain *which specific criteria were met*. \`rollbackPlan\` should suggest high-level steps. \`actionSuggestion\` should be a concise next command.
`;

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
      detectionReport = { isProblem: false, report: result.text};
    }

    let newState = { ...state, workingMemory: { ...state.workingMemory, detectingProblems: false } };
    if (detectionReport.isProblem) {
      newState.lastDetectionReport = { // This will temporarily store the report before orchestrator collects it
        type: 'major_error',
        details: detectionReport.details,
        actionSuggestion: detectionReport.actionSuggestion || `Execute rollback plan: ${detectionReport.rollbackPlan?.join(', ')}`,
        timestamp: new Date(),
      };
      newState.workingMemory.majorErrorAddressed = false; // Mark for follow-up
    } else {
      newState.lastDetectionReport = undefined;
    }
    return newState;
  }

  private async detectLoopNode(state: MotiveForceState): Promise<MotiveForceState> {
    console.log("---DETECT LOOP NODE---");
    const modelWithTools = await this.llmService.getModelAndTools(true);

    const lastThreeMessages = state.messagesForDetection;
    // Check for at least 3 messages or return early
    if (!lastThreeMessages || lastThreeMessages.length < 3) {
      console.log(`[Detect Loop] Not enough messages for loop detection (need 3, got ${lastThreeMessages?.length || 0})`);
      return {
        ...state,
        workingMemory: { ...state.workingMemory, detectingProblems: false },
        lastDetectionReport: undefined
      };
    }

    const promptContent = `Analyze the last three messages in the conversation (M1, M2, M3, where M3 is the most recent). M1 is the oldest, M3 is the newest:\n\n` +
                         `M1: ${lastThreeMessages[0].content}\n` +
                         `M2: ${lastThreeMessages[1].content}\n` +
                         `M3: ${lastThreeMessages[2].content}\n\n`;

    let analysisPrompt = `Your role is to detect if the conversation is stuck in a repetitive loop, exhibiting stagnation, or giving very similar answers consecutively without tangible progress.

**CRITERIA FOR LOOP/STAGNATION DETECTION (Analyze the sequence of M1, M2, M3):**

* **Strong Indicators:**
    * **Repetitive Content (BIG indicator):** Are significant phrases, sentences, or entire sections of text being repeated across M1 and M3, especially if M1 and M3 are both from the main model, indicating a circular conversation? This is a strong signal for a loop.
    * **Back-to-Back Approval Requests:** Is the main model asking for approval in M2 and then again in M3 (or very similar prompts for confirmation)? This is a strong sign of a stalling loop.
    * **Action/Approval Loop:** Is the pattern "Model proposes plan -> User/Autopilot asks for confirmation -> Model provides the same plan again and asks for approval" occurring without actual execution of the plan?
    * **Lack of Tangible Progress (Strong Indication):** Does this sequence of three messages, as a unit, fail to represent any meaningful advancement on the current task, problem-solving, or exploration towards the overall purpose? Is the conversation just "spinning its wheels" without moving forward?

* **Other Indicators:**
    * **Information Redundancy:** Is either side asking for information that was already clearly provided in the immediate past, or re-stating information already acknowledged?
    * **Stalling or Waiting Language:** Are words like "awaiting," "stand by," "confirm," "proceed?" used repeatedly or in a way that suggests a deadlock without new information.
    * **Similar Response Structures:** Is one side consistently replying with a very similar structure (e.g., always listing 2-3 items, always asking for confirmation) even if the content slightly changes, indicating a repetitive pattern.

Respond in a JSON format: {"isProblem": boolean, "type": "loop", "details": "string", "patternDetected": "string", "actionSuggestion": "string"}.

If \`isProblem\` is true:
* \`details\` should explain *which specific criteria were met*.
* \`patternDetected\` should briefly describe the conversational loop.
* \`actionSuggestion\` should propose a way to break the loop or inject new information.
`;

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
      detectionReport = { isProblem: false, report: result.text};
    }

    let newState = { ...state, workingMemory: { ...state.workingMemory, detectingProblems: false } };
    if (detectionReport.isProblem) {
      newState.lastDetectionReport = { // This will temporarily store the report before orchestrator collects it
        type: 'loop',
        details: detectionReport.details,
        actionSuggestion: detectionReport.actionSuggestion || `Break loop with alternative action: ${detectionReport.patternDetected}`,
        timestamp: new Date(),
      };
      newState.workingMemory.loopAddressed = false; // Mark for follow-up
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
      }
    };

    // Clear investigative tool call if it exists
    if (newState.workingMemory.nextActionIsInvestigativeTool) {
      delete newState.workingMemory.nextActionIsInvestigativeTool;
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
      }
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
      }
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
    workingMemory: { 
      problemDetectionComplete: false,
      allDetectionReports: [],
      currentDetectorIndex: 0,
    }, 
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