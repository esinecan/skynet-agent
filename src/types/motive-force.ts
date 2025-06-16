export interface MotiveForceConfig {
  enabled: boolean;
  delayBetweenTurns: number;      // milliseconds
  maxConsecutiveTurns: number;
  temperature: number;
  historyDepth: number;            // number of messages to include
  useRag: boolean;
  useConsciousMemory: boolean;
  mode: 'aggressive' | 'balanced' | 'conservative';
  provider?: any;
  model?: string;
}

export interface MotiveForceState {
  enabled: boolean;
  isGenerating: boolean;
  currentTurn: number;
  lastGeneratedAt?: Date;
  errorCount: number;
  sessionId?: string;
}

export interface MotiveForceMessage {
  id: string;
  sessionId: string;
  query: string;
  generatedAt: Date;
  turn: number;
}

export const DEFAULT_MOTIVE_FORCE_CONFIG: MotiveForceConfig = {
  enabled: false,
  delayBetweenTurns: 2000,
  maxConsecutiveTurns: 10,
  temperature: 0.8,
  historyDepth: 5,
  useRag: true,
  useConsciousMemory: true,
  mode: 'balanced'
};
