/**
 * RAG configuration utilities for the lean MCP chat client
 */

export interface RAGConfig {
  enabled: boolean;
  maxMemories: number;
  minSimilarity: number;
  includeSessionContext: boolean;
  chromaUrl: string;
  chromaCollection: string;
  googleApiKey?: string;
}

export function getRAGConfig(): RAGConfig {
  return {
    enabled: process.env.RAG_ENABLED !== 'false',
    maxMemories: parseInt(process.env.RAG_MAX_MEMORIES || '3'),
    minSimilarity: parseFloat(process.env.RAG_MIN_SIMILARITY || '0.5'),
    includeSessionContext: process.env.RAG_INCLUDE_SESSION_CONTEXT === 'true',
    chromaUrl: process.env.CHROMA_URL || 'http://localhost:8000',
    chromaCollection: process.env.CHROMA_COLLECTION || 'mcp_chat_memories',
    googleApiKey: process.env.GOOGLE_API_KEY,
  };
}

export function validateRAGConfig(config: RAGConfig): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (config.maxMemories < 1 || config.maxMemories > 10) {
    issues.push('maxMemories should be between 1 and 10');
  }
  
  if (config.minSimilarity < 0 || config.minSimilarity > 1) {
    issues.push('minSimilarity should be between 0 and 1');
  }
  
  if (!config.chromaUrl || !config.chromaUrl.startsWith('http')) {
    issues.push('chromaUrl should be a valid HTTP URL');
  }
  
  if (!config.chromaCollection || config.chromaCollection.trim().length === 0) {
    issues.push('chromaCollection cannot be empty');
  }
  
  if (!config.googleApiKey) {
    issues.push('googleApiKey is not set (fallback embeddings will be used)');
  }
  
  return {
    valid: issues.length === 0 || (issues.length === 1 && issues[0].includes('googleApiKey')),
    issues
  };
}

export function getRAGSystemPrompt(): string {
  return `You are an AI assistant with access to previous conversation history. When provided with context from previous conversations, use it to:

1. Provide more personalized and contextual responses
2. Reference previous discussions when relevant
3. Maintain conversation continuity
4. Avoid repeating information already discussed

Always prioritize the current user message while leveraging relevant historical context to enhance your response.`;
}
