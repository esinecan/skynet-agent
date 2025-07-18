import { BaseMessage } from "@langchain/core/messages";

// Core types for the LangGraph-powered MotiveForce system

// NEW: Interface for Problem Resolution Details
export interface ProblemResolutionPurpose {
  type: 'failure' | 'major_error' | 'loop';
  details: string;
  actionSuggestion: string;
}

export interface SubGoal {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  priority: number; // 1-10, higher is more important
  dependencies: string[]; // IDs of other subgoals this depends on
  estimatedDuration?: number; // in minutes
  actualDuration?: number; // in minutes
  startedAt?: Date;
  completedAt?: Date;
  failureReason?: string;
  tools?: string[]; // Tools required for this subgoal
}

export interface ExecutionStep {
  id: string;
  subgoalId: string;
  action: 'tool_call' | 'memory_search' | 'user_interaction' | 'analysis' | 'planning';
  description: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  executedAt?: Date;
  duration?: number; // in milliseconds
}

export interface ToolResult {
  stepId: string;
  toolName: string;
  args: Record<string, any>;
  result: any;
  error?: string;
  duration: number; // in milliseconds
  timestamp: Date;
  success: boolean;
}

export interface Memory {
  id: string;
  content: string;
  type: 'conscious' | 'rag' | 'knowledge_graph';
  relevanceScore?: number;
  retrievedAt: Date;
  source?: string;
}

export interface Reflection {
  id: string;
  type: 'success' | 'failure' | 'insight' | 'strategy_adjustment';
  content: string;
  relatedSubgoalId?: string;
  relatedStepId?: string;
  timestamp: Date;
  impact: 'low' | 'medium' | 'high';
  actionable?: boolean;
}

export interface UserPreference {
  key: string;
  value: any;
  source: 'explicit' | 'inferred' | 'default';
  confidence: number; // 0-1
  lastUpdated: Date;
}

export interface SessionMetadata {
  sessionId: string;
  threadId: string;
  startedAt: Date;
  lastActiveAt: Date;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  totalDuration: number; // in milliseconds
  pausedDuration: number; // in milliseconds
  userInteractions: number;
  toolCalls: number;
  memoryRetrievals: number;
}

export interface MotiveForceGraphState {
  // Core conversation
  messages: BaseMessage[];
  
  // Purpose and planning
  currentPurpose: string;
  purposeType: 'research' | 'productivity' | 'learning' | 'creative' | 'analysis' | 'maintenance' | 'custom';
  subgoals: SubGoal[];
  executionPlan: ExecutionStep[];
  
  // Execution tracking
  currentStepId?: string;
  toolResults: ToolResult[];
  contextualMemories: Memory[];
  
  // Learning and adaptation
  reflections: Reflection[];
  userPreferences: UserPreference[];
  
  // Session management
  sessionMetadata: SessionMetadata;
  
  // Control flags
  emergencyStop: boolean;
  needsUserInput: boolean;
  waitingForUser: boolean;
  isPaused: boolean;
  motiveForceOff?: boolean; // NEW: Flag to indicate Motive Force is shutting down
  
  // Progress tracking
  overallProgress: number; // 0-100
  lastProgressUpdate: Date;
  blockers: string[];
  
  // Context and state for current workflow/detection
  workingMemory: {
    [key: string]: any; // Allow dynamic properties
    motiveForceQueryGenerated?: boolean;
    generatedQuery?: string;
    detectingProblems?: boolean; // Set to true when entering detection phase
    nextDetector?: MotiveForceRoute; // Next detection node to hit
    failureAddressed?: boolean; // Flag to indicate a failure was handled
    majorErrorAddressed?: boolean; // Flag to indicate a major error was handled
    loopAddressed?: boolean;     // Flag to indicate a loop was handled
    motiveForceShutdown?: boolean; // Flag for graceful shutdown message
    problemResolutionPurpose?: ProblemResolutionPurpose; // NEW: Problem details for query generation
    triggerImmediateQueryGeneration?: boolean; // NEW: Flag to force immediate problem query
    nextActionIsInvestigativeTool?: { toolName: string; args: Record<string, any>; }; // For detectFailureNode
  };
  persistentContext: Record<string, any>; // Data that survives sessions
  
  // Error handling
  errorCount: number;
  lastError?: string;
  retryCount: number;
  
  // Performance metrics
  averageStepDuration: number;
  successRate: number;
  toolEfficiency: Record<string, number>; // Tool name -> efficiency score
  
  // Problem Detection Report (NEW)
  lastDetectionReport?: {
    type: 'failure' | 'major_error' | 'loop';
    details: string;
    actionSuggestion: string; // Corrective action suggested by detector
    timestamp: Date;
    confidence?: number;
  };
  
  // For passing specific message subsets to detection nodes if not using direct slice/context building per node
  messagesForDetection?: BaseMessage[];
  detectionContextType?: 'single' | 'last2' | 'last3'; // To control context for detectors
}

// Node-specific state updates
export interface PurposeAnalysisResult {
  purpose: string;
  purposeType: MotiveForceGraphState['purposeType'];
  complexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
  estimatedDuration: number; // in minutes
  confidence: number; // 0-1
  clarificationsNeeded: string[];
}

export interface PlanGenerationResult {
  subgoals: SubGoal[];
  executionPlan: ExecutionStep[];
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
    mitigations: string[];
  };
  resourceRequirements: {
    toolsNeeded: string[];
    memoryTypes: string[];
    estimatedTokens: number;
    estimatedTime: number;
  };
}

export interface ContextGatheringResult {
  memories: Memory[];
  relevantPreferences: UserPreference[];
  knowledgeGaps: string[];
  contextCompleteness: number; // 0-1
}

export interface ProgressMonitoringResult {
  overallProgress: number;
  completedSubgoals: number;
  failedSubgoals: number;
  blockers: string[];
  nextSteps: string[];
  shouldContinue: boolean;
  needsUserInput: boolean;
  adaptationsNeeded: string[];
}

export interface ReflectionResult {
  reflections: Reflection[];
  strategicInsights: string[];
  performanceMetrics: {
    efficiency: number;
    effectiveness: number;
    userSatisfaction?: number;
  };
  recommendedAdjustments: {
    planChanges: string[];
    toolUsageOptimizations: string[];
    timelineAdjustments: string[];
  };
}

// Routing decision types
export type MotiveForceRoute = 
  | 'purpose_analyzer'
  | 'plan_generator'
  | 'context_gatherer'
  | 'tool_orchestrator'
  | 'progress_monitor'
  | 'reflection_engine'
  | 'user_checkin'
  | 'query_generator'
  | 'prepare_detection_input'
  | 'detection_orchestrator'
  | 'detect_failure'
  | 'detect_major_error'
  | 'detect_loop'
  | 'handle_failure'
  | 'handle_major_error'
  | 'handle_loop'
  | '__end__';

// Configuration types
export interface MotiveForceGraphConfig {
  maxStepsPerSession: number;
  maxDurationMinutes: number;
  userCheckinInterval: number; // in steps
  errorThreshold: number;
  retryLimit: number;
  memoryRetrievalLimit: number;
  parallelToolExecution: boolean;
  aggressiveness: 'conservative' | 'balanced' | 'aggressive';
  purposeTypes: string[];
  enableLearning: boolean;
  enableUserCheckins: boolean;
}

// Event types for streaming
export interface MotiveForceEvent {
  type: 'step_start' | 'step_complete' | 'step_error' | 'progress_update' | 'user_input_needed' | 'reflection' | 'plan_update';
  stepId?: string;
  nodeType?: string;
  data: any;
  timestamp: Date;
}

// Integration with existing MotiveForce types
export interface LegacyMotiveForceConfig {
  enabled: boolean;
  delayBetweenTurns: number;
  maxConsecutiveTurns: number;
  temperature: number;
  historyDepth: number;
  useRag: boolean;
  useConsciousMemory: boolean;
  mode: 'aggressive' | 'balanced' | 'conservative';
}

// Migration utility types
export interface MotiveForceMode {
  useGraph: boolean;
  legacyConfig?: LegacyMotiveForceConfig;
  graphConfig?: MotiveForceGraphConfig;
}
